import os, sys, json, traceback, zipfile, socket, base64, threading, time, logging
import sys

from dataiku.base.utils import TmpFolder

if os.path.exists("/databricks") and not hasattr(sys, "i_am_the_crazy_subprocess"):
    # MADNESS ? THIS IS DATA !
    print("** Initializing Databricks notebook top-level process argv=%s original_argv=%s" % (sys.argv, sys.original_wrapper_argv))

    # Fetch the real argv, not the fake one
    databricks_python_shell_args = open("/proc/self/cmdline").read().split("\0")
    databricks_python_shell_env = open("/proc/self/environ").read().split("\0")
    python_shell_path = os.path.dirname(databricks_python_shell_args[2])
    gw_port = databricks_python_shell_args[3]
    gw_secret = databricks_python_shell_args[9]
    original_env = {} # build the env from the process itself, to not see variables set via the remote-run-def.json
    for kv in databricks_python_shell_env:
        eq_pos = kv.find('=')
        k = kv[:eq_pos]
        v = kv[eq_pos+1:]
        if k is None or len(k) ==0:
            continue
        original_env[k] = v
        
    json_packages = """__json_packages_to_install__"""
    json_is_python3 = """__json_is_python3__""" 
    packages = json.loads(json_packages)
    is_python3 = json.loads(json_is_python3)
    print("** Use python3: %s" % is_python3)
    print("** Installing packages: %s" % packages)

    import subprocess
    import tempfile

    with TmpFolder(tempfile.gettempdir("dku-databricks-nbk-venv-")) as virtualenv_path:
        print("Creating venv in %s" % virtualenv_path)

        python_executable = '/databricks/python3/bin/python3' if is_python3 else '/databricks/python/bin/python'

        p = subprocess.Popen(["virtualenv", "-p", python_executable, virtualenv_path], env=original_env)
        retcode = p.wait()
        if retcode != 0:
            raise Exception("Venv creation failed with %s" % retcode)
        print("venv created")

        vpy = os.path.join(virtualenv_path, "bin/python")

        p = subprocess.Popen([vpy, "-m", "pip", "install"] + packages, env=original_env)
        retcode = p.wait()
        if retcode != 0:
            raise Exception("venv install creation failed with %s" % retcode)

        print("ipykernel installed")

        subprocess_args = [vpy]
        # we want to reexecute the wrapper
        subprocess_args.extend(sys.original_wrapper_argv[0:8])
        # But with the addition that we have already done our dance
        subprocess_args.extend(["notebook-subprocess", python_shell_path, gw_port, gw_secret])
        # And then pass back the actual real arguments re-passed by the first wrapper
        subprocess_args.extend(sys.argv[1:])
        print("RUNNING: %s" % subprocess_args)
        pp = original_env["PYTHONPATH"]
        pp = "%s:/databricks/spark/python:/databricks/spark/python/lib/py4j-0.10.7-src.zip:/databricks/jars/spark--driver--driver-spark_2.4_2.11_deploy.jar:/databricks/spark/python" % (pp)
        copy = original_env.copy()
        copy["PYTHONPATH"] = pp
        print("Running subprocess with PYTHONPATH = %s " % (copy["PYTHONPATH"]))
        p = subprocess.Popen(subprocess_args, env=copy)
        retcode = p.wait()
        if retcode != 0:
            raise Exception("Subexec failed with %s" % retcode)
        sys.exit(retcode)

print("I am the remote_kernel_launcher for real !")
print("RKL executable = %s" % sys.executable)
print("RKL argv = %s" % sys.argv)

import zmq
from ipykernel.kernelapp import IPKernelApp

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s')

connection_file_from_server = '__base64_encoded_connection_file__'
print('Start with ' + connection_file_from_server)
remote_connection_file_json = base64.b64decode(connection_file_from_server)
if sys.version_info > (3,0):
    remote_connection_file_json = remote_connection_file_json.decode("utf8")
print('Got connection file %s' % remote_connection_file_json)
remote_connection_file = json.loads(remote_connection_file_json)

print("Setup forwarding")
from dataiku.notebook.kernel_side_forwarder import KernelSideForwarder

forward = KernelSideForwarder(remote_connection_file)
local_connection_file_name = forward.initialize()

# start the kernel, the relay will connect to it
app = IPKernelApp.instance()
app.connection_file = local_connection_file_name
app.initialize()
app.start()
