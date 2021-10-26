# coding: utf-8
from __future__ import unicode_literals

import json
import logging
import random
import socket
import string
import threading
from threading import Thread

import sys

from dataiku.base.socket_block_link import JavaLink
from dataiku.base.socket_block_link import SocketBlockLinkServer
from dataiku.base.utils import safe_unicode_str
from dataiku.container.runner import read_execution, load_libs
from dataiku.core import debugging
from dataiku.doctor.distributed.remote_worker_client import RemoteWorkerStatus

logger = logging.getLogger(__name__)


class RemoteWorkerServer(object):
    """
    Server-side part of RemoteWorkerClient
    """

    def __init__(self, dss_port, dss_host, dss_secret):
        self.worker_secret = ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(16))
        self.worker_host = socket.gethostbyname(socket.gethostname())
        self.dss_port = dss_port
        self.dss_secret = dss_secret
        self.dss_host = dss_host
        self.worker_port = None

        self.lock = threading.Lock()
        self.stopped = False

        self.master_link = SocketBlockLinkServer(self.worker_secret, timeout=120)
        self.dss_link = JavaLink(dss_port, dss_secret)

    def start(self):
        self.worker_port = self.master_link.listen()

        master_worker_thread = Thread(target=self.master_worker_protocol_handler)
        dss_worker_thread = Thread(target=self.dss_worker_protocol_handler)

        master_worker_thread.start()
        dss_worker_thread.start()

        master_worker_thread.join()
        dss_worker_thread.join()

    def stop(self):
        with self.lock:
            if self.stopped:
                return

            self.stopped = True

        logger.info("Stopping remote worker...")
        try:
            self.master_link.close()
        except Exception:
            logger.exception("Could not close master<->worker link")
        try:
            self.dss_link.close()
        except Exception:
            logger.exception("Could not close dss<->worker link")

    def master_worker_protocol_handler(self):
        """
        Communication protocol

        Master sending context:
        - master: send_pyobject(context)
        - worker: context = read_pyobject()
        - worker: send_pyobject((None, None)) # "Ok I got the context"

        Master sending work (loop):
        - master: send_pyobject(work_args)
        - worker: work_args = read_pyobject(work)
        # worker will call context.execute_work(*work_args)
        - worker: send_pyobject((result, exception))

        Connection is closed without notice when the link is cut
        """
        try:
            logger.info("Listening on port %s for master to connect..." % self.worker_port)
            self.master_link.accept()
            logger.info("Master is connected, receiving context...")
            context = self.master_link.read_pyobject()
            self.master_link.send_pyobject((None, None))
            logger.info("Context received")
            while True:
                logger.info("Waiting for request...")
                try:
                    args = self.master_link.read_pyobject()
                except (EOFError, OSError, IOError) as e:
                    logger.info("Master <-> worker disconnected: %s", safe_unicode_str(e))
                    break

                logger.debug("Executing request...")
                return_value = None
                exc_infos = None
                try:
                    return_value = context.execute_work(*args)
                except Exception:
                    logger.exception("Caught error while executing work")
                    exc_infos = sys.exc_info()[:2]

                logger.debug("Request processed, sending back results...")
                bytes_written = self.master_link.send_pyobject((return_value, exc_infos))
                logger.info("Request results sent (%s bytes)" % bytes_written)
        finally:
            # Master<->worker failed/finished ? => stop the worker
            logger.info("Master <-> worker communication ended")
            self.stop()

    def dss_worker_protocol_handler(self):
        try:
            logger.info("Connecting to DSS...")
            self.dss_link.connect()
            logger.info("Connected to DSS, sending worker connection infos...")
            self.dss_link.send_json({
                "port": self.worker_port,
                "host": self.worker_host,
                "secret": self.worker_secret,
                "status": RemoteWorkerStatus.READY.name
            })
            logger.info("Remote worker is ready")

            # Block & raise if link gets disconnected
            try:
                self.dss_link.read_block()
            except (EOFError, OSError, IOError) as e:
                # This block will never be sent: it is just a practical way to wait for
                # link being closed
                logger.info("DSS/JEK <-> worker communication ended: %s", safe_unicode_str(e))
        finally:
            # DSS/JEK<->worker failed/finished ? => stop the worker
            self.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s')
    debugging.install_handler()

    execution = read_execution()
    definition = json.loads(execution['definition'])

    load_libs()

    RemoteWorkerServer(
        dss_port=definition['port'],
        dss_host=None,
        dss_secret=definition['secret']
    ).start()
