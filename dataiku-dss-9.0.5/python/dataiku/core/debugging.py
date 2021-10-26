import traceback, signal, sys
import logging, os

logger = logging.getLogger(__name__)


def debug_sighandler(sig, frame):
   """Interrupt running process, and provide a python prompt for
   interactive debugging."""
   d={'_frame':frame}         # Allow access to frame object.
   d.update(frame.f_globals)  # Unless shadowed by global
   d.update(frame.f_locals)

   print ("-------------------\n")
   print ("Signal received : traceback for main thread:\n")
   print (''.join(traceback.format_stack(frame)))
   print ("Additional threads\n")
   for f2 in sys._current_frames().values():
       print ("STACK:")
       print (''.join(traceback.format_stack(f2)))
       print ("\n")
   print ("-------------------\n")
   sys.stdout.flush()
   sys.stderr.flush()

def install_handler():
   print ("Installing debugging signal handler")
   signal.signal(signal.SIGUSR1, debug_sighandler)  # Register handler



def attach_to_remote_debugger():
   """A function to request attachment to a remote debugger."""
   # You should have pydevd-pycharm installed. This function is validated with pycharm profesional version
   # (the free version does not include the remote debugging server).
   #
   # Instructions on how to configure pycharm are available there :
   #  https://www.jetbrains.com/help/pycharm/remote-debugging-with-product.html
   #
   # To use it just write :
   #
   #     from dataiku.core import debugging
   #     debugging.attach_to_remote_debugger()
   #
   # where you would like the python script to connect to the remote debug server.
   #
   # The connection is initiated by the python script. So, the remote debugger should be started first and
   # listen on the port specified by the DKU_PYDEVDPORT environment variable to the client.
   # It is also possible to specify a remote host using the DKU_PYDEVDHOST environment variable.
   #
   # Note : an exception will be raised if a connection to the debug server could not be established.

   remote_debug_host = os.environ.get("DKU_PYDEVDHOST", "localhost")
   remote_debug_port = os.environ.get("DKU_PYDEVDPORT", "9999")

   if remote_debug_port is not None:
      remote_debug_port = int(remote_debug_port)
      logger.info("Will connect to remote debugger on %s:%d" % (remote_debug_host, remote_debug_port))
      import pydevd
      try:
         pydevd.settrace(host=remote_debug_host, port=remote_debug_port)
      except Exception as e:
         logger.warn("Could not connect to debugger on host {} port {}".format(remote_debug_host, remote_debug_port))
   else:
      logger.info("No remote debugging server port set. Not trying to connect to it...")
