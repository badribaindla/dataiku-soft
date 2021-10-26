import os, json, sys, socket, base64, threading, time, traceback, logging, signal
import zmq
from tornado import ioloop
from dataiku.notebook.zmq_utils import Forwarder, ROUTER_DEALER_Forwarder, PUB_SUB_Forwarder, REQ_REP_Forwarder
from ipykernel.kernelapp import IPKernelApp

class KernelSideForwarder(object):
    def __init__(self, remote_connection_file):
        self.remote_connection_file = remote_connection_file
        self.subprocess = None
        
    def set_subprocess(self, popen):
        self.subprocess = popen
        
    def hb_forwarder(self):
        logging.info("Start heart beat")
        freq = 10
        poller = zmq.Poller()
        poller.register(self.callback_socket, zmq.POLLIN)
        try:
            while True:
                time.sleep(freq)
                self.callback_socket.send('ping'.encode('utf8'))
                events = poller.poll(2 * freq * 1000)
                if len(events) == 0:
                    logging.info("Heartbeat listener stopped")
                    self.heart_failure = True
                    os._exit(0) # in a way, the kernel is successful, it didn't die itself
                # the socket in the events cannot be anything but self.callback_socket
                message = self.callback_socket.recv()
        except IOError as e:
            logging.info("Error heartbeating, exiting")
            traceback.print_exc()
            self.heart_failure = True
            os._exit(0) # in a way, the kernel is successful, it didn't die itself
        finally:
            self.callback_socket.close()
    
    def signaling_handler(self):
        logging.info("Start waiting for signals")
        try:
            while True:
                message = self.signaling_socket.recv()
                logging.info("Got %s to propagate" % message)
                if message == 'sigint' and self.subprocess is not None:
                    self.subprocess.send_signal(signal.SIGINT)
        except IOError as e:
            logging.info("Error propagating signals, exiting")
            traceback.print_exc()
        finally:
            self.signaling_socket.close()
    
    def initialize(self):
        relay_host = self.remote_connection_file['relayHost']
        relay_port = self.remote_connection_file['relayPort']
        signaling_port = self.remote_connection_file['signalPort']
        connect_timeout = self.remote_connection_file.get('connectTimeout', 30000)  # 30s timeout on connect, the server side is up and running before the container side
        
        logging.info('Connect with timeout %s' % connect_timeout)
        
        # generate the local file
        from jupyter_client.connect import write_connection_file
        local_connection_file_name, local_connection_file = write_connection_file()
        
        local_connection_file['remoteHost'] = socket.gethostname()
        local_connection_file['ip'] = '0.0.0.0' 
        local_connection_file['key'] = self.remote_connection_file['key'] # otherwise no auth
        
        logging.info('Use connection file %s' % json.dumps(local_connection_file))
        
        with open(local_connection_file_name, 'w') as f:
            f.write(json.dumps(local_connection_file))
        
        # notify the launcher
        context = zmq.Context()
        self.signaling_socket = context.socket(zmq.SUB)
        self.signaling_socket.setsockopt(zmq.SUBSCRIBE, b'')
        self.signaling_socket.connect('tcp://%s:%s' % (relay_host, signaling_port))
        self.callback_socket = context.socket(zmq.REQ)
        self.callback_socket.connect('tcp://%s:%s' % (relay_host, relay_port))
        self.callback_socket.send(json.dumps(local_connection_file).encode('utf8'))
        self.callback_socket.setsockopt(zmq.RCVTIMEO, connect_timeout)
        message = self.callback_socket.recv()
        logging.info("Got %s" % message)
        # proceed with heartbeating
        heart_failure = False
        
        hb_thread = threading.Thread(name="forwarder-watcher", target=self.hb_forwarder)
        hb_thread.daemon = True
        hb_thread.start()
            
        signal_thread = threading.Thread(name="signaling-watcher", target=self.signaling_handler)
        signal_thread.daemon = True
        signal_thread.start()
            
        # start relaying the sockets in the connection file
        port_pairs = []
        for port_type in ['shell_port', 'iopub_port', 'stdin_port', 'control_port', 'hb_port']:
            local_port = local_connection_file.get(port_type, None)
            remote_port = self.remote_connection_file.get(port_type, None)
            if local_port is None or local_port == 0:
                continue
            if remote_port is None or remote_port == 0:
                continue
            port_pairs.append([local_port, remote_port, port_type[:-5]])
            
        def printout(x):
            logging.info(x)
        
        # bind on 127.0.0.1 for the jupyter-server-facing side and on all interfaces for the kernel-facing side
        def forward_ROUTER_DEALER(local_port, remote_port, port_type):
            return ROUTER_DEALER_Forwarder(relay_host, remote_port, '127.0.0.1', local_port, port_type, printout, False, False)
         
        def forward_PUB_SUB(local_port, remote_port, port_type):
            return PUB_SUB_Forwarder(relay_host, remote_port, '127.0.0.1', local_port, port_type, printout, False, False)
        
        def forward_REP_REQ(local_port, remote_port, port_type):
            return REQ_REP_Forwarder(relay_host, remote_port, '127.0.0.1', local_port, port_type, printout, False, False)
                
        socket_forwarders = {'hb' : forward_REP_REQ, 'shell' : forward_ROUTER_DEALER, 'iopub' : forward_PUB_SUB, 'stdin' : forward_ROUTER_DEALER, 'control': forward_ROUTER_DEALER}
                    
        for port_pair in port_pairs:
            local_port = port_pair[0]
            remote_port = port_pair[1]
            port_type = port_pair[2]
            logging.info("Relay port %s to %s on type %s" % (local_port, remote_port, port_type))
                
            socket_forwarders[port_type](local_port, remote_port, port_type)
        
        return local_connection_file_name
    
    