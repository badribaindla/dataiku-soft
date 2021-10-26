from jupyter_client.ioloop import IOLoopKernelManager
from jupyter_client import launch_kernel
import os.path as osp, os
import subprocess, sys
from threading  import Thread
import time
import struct
import json

from six.moves import configparser

def read_stream(logcontainer, out, prefix, stream_type):
    logcontainer.log.info("*** Starting to read from stream (%s)" % prefix)

    if stream_type == "process":
        # Raw process output for the wrapper, binary on both Python versions
        if sys.version_info > (3,0):
            end_of_stream = b''
            decode_lines = True
        else:
            end_of_stream = b''
            decode_lines = False
    else:
        # Pipe output, binary on Python 2, string on Python 3
        if sys.version_info > (3,0):
            end_of_stream = ''
            decode_lines = False
        else:
            end_of_stream = b''
            decode_lines = False

    for line in iter(out.readline, end_of_stream):
        if decode_lines:
            line = line.decode("utf8")
        logcontainer.log.info("[%s]: %s" % (prefix, line.rstrip('\n')))
    out.close()

class DataikuIOLoopKernelManager(IOLoopKernelManager):
    def _init_once(self):
        if hasattr(self, "wrapsh"):
            return

        config = configparser.RawConfigParser(allow_no_value=True)
        with open(osp.join(os.environ["DIP_HOME"], "install.ini")) as dp:
            config.readfp(dp)

        try:
            wrapper_location = config.get("mus", "exec_wrapper_location")
        except:
            wrapper_location = None
        if wrapper_location is None:
            self.wrapsh = "%s/security/execwrapper.sh" % os.environ["DIP_HOME"]
        else:
            self.wrapsh = wrapper_location

        try:
            exec_mode = config.get("mus", "execution_handling_mode")
        except:
            exec_mode = "EXECWRAPPER"
        self.direct_sudo = exec_mode == "DIRECT_SUDO"

        try:
            self.custom_direct_sudo = config.get("mus", "exec_custom_direct_sudo")
        except:
            self.custom_direct_sudo = None

        try:
            self.custom_root_sudo = config.get("mus", "custom_root_sudo")
        except:
            self.custom_root_sudo = None

        self.log.info("Impersonation support loaded with wrapper=%s mode=%s direct=%s custom_direct=%s custom_root=%s" %
            (self.wrapsh, exec_mode, self.direct_sudo, self.custom_direct_sudo, self.custom_root_sudo))

    def launch_wrapper(self, cfg_file):
        self._init_once()

        if self.direct_sudo:
            if self.custom_direct_sudo is not None:
                custom_direct_sudo = json.loads(self.custom_direct_sudo)
                base_args = [x.replace("%{USER}", self.impersonate) for x in custom_direct_sudo]
            else:
                base_args = ["sudo", "-u", self.impersonate, "-n"]
        else:
            if self.custom_root_sudo is not None:
                base_args = json.loads(self.custom_root_sudo)
            else:
                base_args = ["sudo", "-n"]

        args = base_args + [self.wrapsh, "execute", cfg_file]
        self.log.info("Launching wrapper: %s" % (' '.join(args)))
        try:
            return subprocess.Popen(args,
                stdin = subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as exc:
            self.log.error("Failed to run sudo command wrapsh=%s cfg_file=%s" % (self.wrapsh, cfg_file))
            raise


    def build_description(self, kernel_cmd, kernel_user, kernel_cwd, env, kernel_context):
        cfg = {
            "path" : kernel_cmd[0],
            "args" : kernel_cmd,
            "chan" : [ "stderr", "stdout" ],
            "user" : kernel_user,
            "dss_user" : kernel_context.get('dssUser', os.environ['USER']),
            "dir" : kernel_cwd,
            "env" : env,
            "cgroupsHierarchiesRoot" : kernel_context.get("cgroupsHierarchiesRoot", ""),
            "cgroupPaths" : kernel_context.get("cgroupPaths", [])
        }

        filename = osp.join(kernel_cwd, "wrapper_config.py")
        with open(filename, "w") as f:
            json.dump(cfg, f, indent=2)
        return filename

    def _launch_kernel(self, kernel_cmd, **kwargs):
        DKU_EXTRA_ENV = kwargs["DKU_EXTRA_ENV"]
        kernel_context = kwargs["dku_kernel_context"]
        env = kwargs["env"]

        self.log.info("Launching kernel with cmd = %s" % kernel_cmd)

        self.impersonate = kernel_context.get("unixUser", None)

        for k, v in DKU_EXTRA_ENV.items():
            env[k] = v
            self.log.info("Adding to kernel env %s=%s" % (k, v))

        kernel_spark_context = kernel_context["spark"]
        if 'pysparkSubmitArgs' in kernel_spark_context:
            env["PYSPARK_SUBMIT_ARGS"] = kernel_spark_context['pysparkSubmitArgs']
        if 'sparkrSubmitArgs' in kernel_spark_context:
            env["SPARKR_SUBMIT_ARGS"] = kernel_spark_context['sparkrSubmitArgs']
        if 'toreeSubmitArgs' in kernel_spark_context:
            env["TOREE_SUBMIT_ARGS"] = kernel_spark_context['toreeSubmitArgs']
        if 'sparklyrConfig' in kernel_spark_context:
            env["DKU_SPARKLYR_CONFIG"] = kernel_spark_context['sparklyrConfig']

        if 'extraEnv' in kernel_spark_context:
            env.update(kernel_spark_context['extraEnv'])

        env['DKU_CALL_ORIGIN'] = 'notebook'

        kernel_cwd = kernel_context["processRunDir"]
        self.log.info("Kernel CWD: %s" % kernel_cwd)
        if not osp.isdir(kernel_cwd):
            raise Exception("Kernel cwd does not exist: %s"  % kernel_cwd)

        if self.impersonate is not None:
            self.log.info("Launching via wrapper")

            # Dirty thing for the Python kernel
            env["IPYTHONDIR"] = osp.join(kernel_cwd, "ipythondir")

            # Read-protect the kernel description file, which contains the session key
            # For some reason, the Python kernel insists in rewriting its JSON file
            # so we have to grant it write access
            # Grab it as the last argument to kernel_cmd - this is currently valid for ipykernel, IRkernel and toree.
            try:
                descFile = kernel_cmd[-1]
                self.log.info("Setting permissions on %s" % descFile)
                if os.uname()[0] == 'Darwin':
                    os.chmod(descFile, 0o666)
                else:
                    subprocess.check_call(['setfacl', '-m', 'u::rw,u:%s:rw,g::-,o::-' % self.impersonate, descFile])
            except Exception as e:
                self.log.warn("Error setting permissions on %s : %s" % (descFile, e))

            filename = self.build_description(kernel_cmd, self.impersonate, kernel_cwd, env, kernel_context)
            wrapper_proc = self.launch_wrapper(filename)

            self.wrapper_stdin = wrapper_proc.stdin

            self.log.info("Waiting a bit to check that wrapper started ...")

            def check_alive():
                if wrapper_proc.poll() is not None:
                    self.log.info("Uh oh, wrapper is not running anymore (code %s)" % wrapper_proc.returncode)
                    self.log.info("Communicating with it")
                    (out, err) = wrapper_proc.communicate()
                    self.log.info("Its stdout:\n%s" % out)
                    self.log.info("Its stderr:\n%s" % err)
                    raise Exception("MUS Wrapper process died !")

            check_alive()

            self.log.info("Reading streams descriptor")
            buf = b""
            while True:
                check_alive()
                c = wrapper_proc.stdout.read(1)
                if c == b'\0' or c is None or len(c) == 0:
                    self.log.info("Read of streams descriptor done: %s" % buf)
                    break
                else:
                    buf += c
            check_alive()
            comm_channel_info = json.loads(buf)

            self.log.info("Streams descriptor: %s" % comm_channel_info)
            streams = comm_channel_info["pipes"]

            if "childPidFile" in comm_channel_info:
                with open(comm_channel_info["childPidFile"]) as f:
                    self.pid = int(f.read().strip())

            self.log.info("Sleeping ...")
            time.sleep(1)

            self.log.info("Starting thread to read wrapper stderr")
            Thread(target=read_stream, args=(self, wrapper_proc.stderr, "wrapper_stderr", "process")).start()

            self.log.info("Opening child streams")
            self.wrapped_stdin = open(streams["stdin"], "w") if "stdin" in streams else None
            self.wrapped_stdout = open(streams["stdout"]) if "stdout" in streams else None
            self.wrapped_stderr = open(streams["stderr"]) if "stderr" in streams else None
            self.log.info("Opened child streams in=%s out=%s err=%s" %
                (self.wrapped_stdin, self.wrapped_stdout, self.wrapped_stderr))

            if self.wrapped_stdout:
                self.wrapped_stdout_thread = Thread(target=read_stream, args=(self, self.wrapped_stdout, "wrapped_stdout", "pipe"))
                self.wrapped_stdout_thread.start()
            else:
                self.wrapped_stdout_thread = None
            if self.wrapped_stderr:
                self.wrapped_stderr_thread = Thread(target=read_stream, args=(self, self.wrapped_stderr, "wrapped_stderr", "pipe"))
                self.wrapped_stderr_thread.start()
            else:
                self.wrapped_stderr_thread = None

            self.log.info("Done starting the wrapper")
            return wrapper_proc

        else:
            # Read-protect the kernel description file, which contains the session key
            try:
                descFile = kernel_cmd[-1]
                self.log.info("Setting permissions on %s" % descFile)
                os.chmod(descFile, 0o600)
            except Exception as e:
                self.log.warn("Error setting permissions on %s : %s" % (descFile, e))
            self.log.info("Launching kernel without wrapper %s" % kwargs.get('cwd', ''))
            kwargs['cwd'] = kernel_cwd
            del kwargs["DKU_EXTRA_ENV"]
            del kwargs["dku_kernel_context"]
            kernel_popen = launch_kernel(kernel_cmd, **kwargs)

            for cgroup in kernel_context["cgroupPaths"]:
                self.log.info("Setting process %s in cgroup %s" % (kernel_popen.pid, cgroup))
                while cgroup.startswith("/"):
                    cgroup = cgroup[1:]
                cgroup_dir = osp.join(kernel_context["cgroupsHierarchiesRoot"], cgroup)
                tasks_file = osp.join(cgroup_dir, "tasks")
                self.log.info("tasks file: %s" % tasks_file)

                with open(tasks_file, "w") as f:
                    f.write("%s" % kernel_popen.pid)

            self.pid = kernel_popen.pid

            return kernel_popen


    def _kill_kernel(self):
        """Kill the running kernel.
        This is a private method, callers should use shutdown_kernel(now=True).
        """
        if self.has_kernel:
            if self.impersonate:
                self.log.info("Trying to kill impersonated")
                self.wrapper_stdin.close()
                self.log.info("Waiting for wrapper to die")
                self.kernel.wait()
                self.log.info("Joining log threads")
                if self.wrapped_stdout_thread:
                    self.wrapped_stdout_thread.join()
                if self.wrapped_stderr_thread:
                    self.wrapped_stderr_thread.join()

            else:
                self.log.info("Trying to kill non-impersonated kernel")
                super(IOLoopKernelManager, self)._kill_kernel()
        else:
            raise RuntimeError("Cannot kill kernel. No kernel is running!")


    def signal_kernel(self, signum):
        if self.has_kernel:
            if self.impersonate:
                self.log.info("Trying to signal %s impersonated kernel" % signum)
                self.wrapper_stdin.write(struct.pack('b', signum))
                self.wrapper_stdin.flush()
            else:
                self.log.info("Trying to signal %s non-impersonated kernel" % signum)
                super(IOLoopKernelManager, self).signal_kernel(signum)
        else:
            raise RuntimeError("Cannot signal kernel. No kernel is running!")

