import sys, json, os, socket, time, logging
import threading
import requests
import zmq
from zmq.eventloop.zmqstream import ZMQStream
from tornado import ioloop

class Forwarder(object):
    def __init__(self, local_host, local_port, remote_host, remote_port, port_type, local_socket_type, remote_socket_type, printout, bind_local, bind_remote):
        self.printout = printout
        self.context = zmq.Context()
        
        socketi, socketi_port = self._new_socket(port_type, local_socket_type, local_host, local_port, bind_local)
        socketo, socketo_port = self._new_socket(port_type, remote_socket_type, remote_host, remote_port, bind_remote)
        
        self.local_port = socketi_port
        self.remote_port = socketo_port
        
        self.port_type = port_type
        ioloop_instance = ioloop.IOLoop.instance() # don't let ZMQStream create its own
        self.streamo = ZMQStream(socketo, io_loop=ioloop_instance)
        self.streami = ZMQStream(socketi, io_loop=ioloop_instance)
        
        self.streami.on_recv(lambda msg : self.relay_from_server(msg))
        self.streamo.on_recv(lambda msg : self.relay_from_kernel(msg))
        
    def _new_socket(self, port_type, socket_type, host, port, bind):
        s = self.context.socket(socket_type)
        if socket_type == zmq.SUB:
            s.setsockopt(zmq.SUBSCRIBE, b'')
        if bind == True and port is not None:
            url = 'tcp://%s:%s' % (host, port)
            self.printout("Bind %s on %s" % (port_type, url))
            s.bind(url)
        elif bind == True and port is None:
            url = 'tcp://%s' % host
            self.printout("Bind %s on random port of %s" % (port_type, url))
            port = s.bind_to_random_port(url)
            self.printout("  > picked port %s" % port)
        elif bind == False:
            url = 'tcp://%s:%s' % (host, port)
            self.printout("Connect %s on %s" % (port_type, url))
            s.connect(url)
        else:
            raise Exception("Unexpected socket setup for %s" % port_type)
        return (s, port)

    def dump_msg(self, msg, direction):
        pass
        """
        self.printout(self.port_type + direction)
        msg_str = str(msg)
        if len(msg_str) <= 50:
            self.printout(msg_str)
        else:
            self.printout(msg_str[:50] + "...")
        """
                
    def relay_from_server(self, msg):
        self.dump_msg(msg, " > ")
        self.streamo.send_multipart(msg)
 
    def relay_from_kernel(self, msg):
        self.dump_msg(msg, " < ")
        self.streami.send_multipart(msg)

class ROUTER_DEALER_Forwarder(Forwarder):
    def __init__(self, local_host, local_port, remote_host, remote_port, port_type, printout, bind_local=True, bind_remote=False):
        Forwarder.__init__(self, local_host, local_port, remote_host, remote_port, port_type, zmq.ROUTER, zmq.DEALER, printout, bind_local, bind_remote)

class PUB_SUB_Forwarder(Forwarder):
    def __init__(self, local_host, local_port, remote_host, remote_port, port_type, printout, bind_local=True, bind_remote=False):
        Forwarder.__init__(self, local_host, local_port, remote_host, remote_port, port_type, zmq.PUB, zmq.SUB, printout, bind_local, bind_remote)        

class REQ_REP_Forwarder(Forwarder):
    def __init__(self, local_host, local_port, remote_host, remote_port, port_type, printout, bind_local=True, bind_remote=False):
        Forwarder.__init__(self, local_host, local_port, remote_host, remote_port, port_type, zmq.REQ, zmq.REP, printout, bind_local, bind_remote)        

