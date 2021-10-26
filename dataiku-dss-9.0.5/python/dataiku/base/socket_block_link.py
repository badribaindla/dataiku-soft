# coding: utf-8
from __future__ import unicode_literals

import logging
import os
import socket

from dataiku.base.block_link import BlockInput
from dataiku.base.block_link import BlockOutput

"""
Implement block-link protocol over socket
"""

logger = logging.getLogger(__name__)


class AbstractSocketBlockLink(BlockInput, BlockOutput):
    def __init__(self, connection_timeout):
        BlockInput.__init__(self, self)
        BlockOutput.__init__(self, self)
        self.connection_timeout = connection_timeout

    def read(self, size):
        """
        Read from the socket (required by BlockInput)
        """
        return self.get_socket().recv(size)

    def write(self, data):
        """
        Write to the socket (required by BlockOutput)
        """
        return self.get_socket().sendall(data)

    def get_socket(self):
        raise NotImplementedError

    def close(self):
        raise NotImplementedError

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    @staticmethod
    def _properly_close_socket(s):
        """
        Calling shutdown() seems necessary to unblock reader/writer threads waiting on this socket
        (and calling close() is not enough)
        """
        if s is None:
            return
        try:
            s.shutdown(socket.SHUT_RDWR)
        except socket.error:
            # shutdown() may fail if socket already closed
            pass
        s.close()


class SocketBlockLinkClient(AbstractSocketBlockLink):
    """
    Client-side link
    """

    def __init__(self, host, port, secret, connection_timeout=60):
        super(SocketBlockLinkClient, self).__init__(connection_timeout)
        self.host = host
        self.port = port
        self.socket = None
        self.secret = secret

    def connect(self):
        ip_addr = socket.gethostbyname(self.host)
        host_with_resolved_addr = "%s (%s)" % (self.host, ip_addr) if self.host != ip_addr else self.host
        logger.info("Connecting to %s at port %s" % (host_with_resolved_addr, self.port))
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        self.socket.settimeout(self.connection_timeout)
        self.socket.connect((ip_addr, self.port))
        self.send_string(self.secret)
        logger.info("Connected to %s at port %s" % (host_with_resolved_addr, self.port))

        # Link has been establish: disable timeouts
        self.socket.settimeout(None)

    def close(self):
        if self.socket is None:
            return

        self._properly_close_socket(self.socket)
        self.socket = None
        logger.info("Client closed")

    def get_socket(self):
        if self.socket is None:
            raise IOError('Not connected to server')

        return self.socket


class SocketBlockLinkServer(AbstractSocketBlockLink):
    """
    Server-side link
    """

    def __init__(self, secret, timeout=60, host=None):
        super(SocketBlockLinkServer, self).__init__(timeout)
        self.secret = secret
        self.serversocket = None
        self.host = host or socket.gethostname()
        self.socket = None

    def listen(self):
        """
        Start listening for a connection on a (randomly picked) port
        """
        logger.info("Starting server...")
        self.serversocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.serversocket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.serversocket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        self.serversocket.settimeout(self.connection_timeout)
        self.serversocket.bind((self.host, 0))
        host, port = self.serversocket.getsockname()
        self.serversocket.listen(1)

        logger.info("Server is listening on %s:%s" % (host, port))
        return port

    def close(self):
        """Close the socket"""
        if self.socket is None and self.serversocket is None:
            return

        logger.info("Closing server...")
        self._properly_close_socket(self.socket)
        self.socket = None
        self._properly_close_socket(self.serversocket)
        self.serversocket = None
        logger.info("Server closed")

    def accept(self):
        """
        Wait until client is connected
        """
        logger.info("Waiting for client to connect...")
        (self.socket, _) = self.serversocket.accept()
        received_secret = self.read_string()
        if self.secret != received_secret:
            raise IOError("Invalid secret from {}".format(self.socket.getsockname()))
        logger.info("Client {} is connected".format(self.socket.getsockname()))

        # Link has been establish: disable timeouts
        self.socket.settimeout(None)

    def get_socket(self):
        if self.socket is None:
            raise IOError('Client is not connected')

        return self.socket


class JavaLink(SocketBlockLinkClient):
    """
    Connection with DSS backend or JEK
    """

    def __init__(self, port, secret):
        dss_host = os.getenv("DKU_BACKEND_HOST", "localhost")
        super(JavaLink, self).__init__(dss_host, port, secret)
