import sys, json, os, socket, time, logging, traceback, signal
import threading
import requests
import zmq
from tornado import ioloop
from zmq.eventloop.zmqstream import ZMQStream
from dataiku.core.intercom import backend_json_call
from .zmq_utils import Forwarder, ROUTER_DEALER_Forwarder, PUB_SUB_Forwarder, REQ_REP_Forwarder
from dataiku.base import remoterun
        
class ServerSideForwarder(object):
    def __init__(self, remote_kernel_type, connection_file, env_lang, env_name, project_key, bundle_id, container_conf):
        self.remote_kernel_type = remote_kernel_type
        self.connection_file = connection_file
        self.env_name = env_name
        self.env_lang = env_lang
        self.project_key = project_key
        self.bundle_id = bundle_id
        self.container_conf = container_conf

    def hb_forwarder(self):
        logging.info("Start heart beat listener")
        freq = 10
        poller = zmq.Poller()
        poller.register(self.callback_socket, zmq.POLLIN)
        try:
            while True:
                events = poller.poll(2 * freq * 1000)
                if len(events) == 0:
                    logging.info("Heartbeat stopped")
                    os._exit(1)
                # the socket in the events cannot be anything but self.callback_socket
                message = self.callback_socket.recv()
                # logging.info("HB %s" % message)
                self.callback_socket.send('pong'.encode('utf8'))
        except IOError as e:
            logging.info("Error heartbeating, exiting")
            traceback.print_exc()
            os._exit(1)
        finally:
            self.callback_socket.close()

    def initialize(self):
        with open(self.connection_file, 'r') as f:
            local_connection_file = json.loads(f.read())
            
        # start the forwarding (zmq-wise), ie relaying the sockets in the connection file
        port_pairs = []
        for port_type in ['shell_port', 'iopub_port', 'stdin_port', 'control_port', 'hb_port']:
            local_port = local_connection_file.get(port_type, None)
            if local_port is None or local_port == 0:
                continue
            remote_port = None # means bind to random
            port_pairs.append([local_port, remote_port, port_type[:-5]])
        
        def printout(m):
            logging.info(m)
            
        # bind on 127.0.0.1 for the jupyter-server-facing side and on all interfaces for the kernel-facing side
        def forward_ROUTER_DEALER(local_port, remote_port, port_type):
            return ROUTER_DEALER_Forwarder('127.0.0.1', local_port, '0.0.0.0', remote_port, port_type, printout, True, True)
     
        def forward_PUB_SUB(local_port, remote_port, port_type):
            return PUB_SUB_Forwarder('127.0.0.1', local_port, '0.0.0.0', remote_port, port_type, printout, True, True)
    
        def forward_REP_REQ(local_port, remote_port, port_type):
            return REQ_REP_Forwarder('127.0.0.1', local_port, '0.0.0.0', remote_port, port_type, printout, True, True)
            
        socket_forwarders = {'hb' : forward_REP_REQ, 'shell' : forward_ROUTER_DEALER, 'iopub' : forward_PUB_SUB, 'stdin' : forward_ROUTER_DEALER, 'control': forward_ROUTER_DEALER}
                
        for port_pair in port_pairs:
            local_port = port_pair[0]
            remote_port = port_pair[1]
            port_type = port_pair[2]
            logging.info("Relay port %s to %s on type %s" % (local_port, remote_port, port_type))
            
            socket_forwarder = socket_forwarders[port_type](local_port, remote_port, port_type)
            
            port_pair[1] = socket_forwarder.remote_port # retrieve what has been bound
            
        # swap the ports that the jupyter server knows, and that this forwarder now handles, for
        # the ports it opened for listening for the remote kernel
        for port_pair in port_pairs:
            local_connection_file['%s_port' % port_pair[2]] = port_pair[1]
    
        # and open a new socket for the comm to the remote kernel overseer (ie runner.py in the container)
        context = zmq.Context()
        self.callback_socket = context.socket(zmq.REP)
        callback_port_selected = self.callback_socket.bind_to_random_port('tcp://*', min_port=10000, max_port=30000, max_tries=100)
        local_connection_file['relayPort'] = callback_port_selected
        self.signaling_socket = context.socket(zmq.PUB)
        signal_port_selected = self.signaling_socket.bind_to_random_port('tcp://*', min_port=10000, max_port=30000, max_tries=100)
        local_connection_file['signalPort'] = signal_port_selected
    
        remote_kernel = backend_json_call("jupyter/start-remote-kernel", data={
            "contextProjectKey" : remoterun.get_env_var("DKU_CURRENT_PROJECT_KEY"),
            "connectionFile" : json.dumps(local_connection_file),
            "remoteKernelType" : self.remote_kernel_type,
            "projectKey" : self.project_key,
            "bundleId" : self.bundle_id,
            "envLang" : self.env_lang,
            "envName" : self.env_name,
            "containerConf" : self.container_conf
        })
        
        logging.info("Started, got : %s" % json.dumps(remote_kernel))
        self.batch_id = remote_kernel['id']
        
        # start the thread that polls the backend-side thread, to kill this process whenever that thread dies
        # this has to be started before we block on the remote kernel ACK
        self.start_wait_for_remote_kernel_death()
        
        # block until the remote end has started its kernel
        message = self.callback_socket.recv()
        logging.info("Got %s" % message)
        self.callback_socket.send('ok'.encode('utf8'))
        
        # start the heartbeating
        hb_thread = threading.Thread(name="forwarder-watcher", target=self.hb_forwarder)
        hb_thread.daemon = True
        hb_thread.start()
        
        def caught_sigint(signum, frame):
            print('Signal handler called with signal %s' % signum)
            self.signaling_socket.send('sigint'.encode('utf8'))

        signal.signal(signal.SIGINT, caught_sigint)
        

    def start(self):                
        # ioloop is synchronous; polling the state of the remote container via the backend is in a thread
        # the polling of the remote kernel is started earlier, so that the forwarder doesn't hang
        # on waiting the ACK from the remote kernel startup
        logging.info("starting IOLoop")
        try:
            ioloop.IOLoop.instance().start()
        except:
            logging.error("IOLoop failure")
            traceback.print_exc()
            os._exit(1)
        
    def wait_for_remote_kernel_death(self):
        def get_state():
            logging.info("poll state")
            remote_kernel = backend_json_call("jupyter/poll-remote-kernel", data={
                "contextProjectKey" : remoterun.get_env_var("DKU_CURRENT_PROJECT_KEY"),
                "batchId" : self.batch_id
            })
            logging.info("Polled, got : %s" % json.dumps(remote_kernel))
            return remote_kernel.get("state", None)
    
        try:
            while get_state() not in ["dead", "success", "failed"]:
                time.sleep(10)
            
            logging.info("done polling, state is %s" % get_state())
            os._exit(0)
        except:
            logging.error("Polling ended in failure")
            traceback.print_exc()
            os._exit(1)
            
        
    def start_wait_for_remote_kernel_death(self):                
        t = threading.Thread(target=self.wait_for_remote_kernel_death)
        t.daemon = True
        t.start()
        

