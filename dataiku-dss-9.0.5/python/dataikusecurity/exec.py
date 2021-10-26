#
# Executes a process with a different user id
# To be run as root / sudo
#

#
# exec.py [-n JOBNAME] SECURITY_CONF_DIR JOB_DESCRIPTOR.json
# - child stdin/stdout on optional named pipes
# - child stderr is either:
#        - shared with self
#        - or using an optional named pipe
# - watchdog on stdin : kill child pg on close
# - returns child exit status as own exit status
#
# Descriptor:
#   user: target user
#   dss_user: dss user
#   path: executable
#   args: [ cmd arg ...]
#   env: { var: val ,...}
#   dir: cwd
#   chan: [ "stdin", "stdout" ]
#
# Returns a null-terminated JSON object on stdout containing a dict of the child pipes for stdin/stdout
# These pipes must be opened by the requesting process to unblock the child startup sequence
#

import json
import logging
import os
import os.path as osp
import pwd
import select
import signal
import stat
import subprocess
import sys
import threading
import random, string
import securityutils
import time

# Resolve a user name or user id in the password database
# Returns the password entry, or fails if user not found.
def findUser(user):
    try:
        try:
            uid = int(user)
            return pwd.getpwuid(uid)
        except ValueError:
            return pwd.getpwnam(user)
    except KeyError as e:
        logging.error("user account not found in password database: %s", e)
        sys.exit(1)

def gen_rand_str(strlen=8):
    return ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(strlen))

class Process:
    #
    # Load process description
    #
    def __init__(self, file, security_conf_dir):
        with open(file) as f:
            config = json.load(f)
        self.config = config
        self.path = config["path"]
        self.args = config["args"]
        self.dir = config["dir"]
        self.env = config["env"]
        self.chan = config["chan"]
        self.child_pid_file = osp.join(self.dir, "child.pid")
        self.isRoot = (os.geteuid() == 0)
        self.security_conf_dir = security_conf_dir
        if self.isRoot:
            self.user = findUser(config["user"])
            self.dss_user = findUser(config["dss_user"])
        else:
            if "user" in config:
                logging.warn("not running as root: 'user' directive ignored")
            if "dss_user" in config:
                logging.warn("not running as root: 'dss_user' directive ignored")

    def get_target_user(self):
        return self.config["user"]

    def get_command_to_exec(self):
        return self.path

    #
    # Setup process environment
    # Return stream pipes dict
    #
    def setup(self):
        logging.info("[BF] Setting up process environment")
        if not osp.isdir(self.dir) or osp.islink(self.dir):
            raise Exception("process directory does not exist or not a directory: " + self.dir)

        rndstr = gen_rand_str(8)

        self.pipes = dict()
        if "stdin" in self.chan:
            stdin = osp.join(self.dir, ".stdin.%s" % rndstr)
            # TODO - check no symlink here? remove existing?
            if self.isRoot:
                os.mkfifo(stdin, stat.S_IRUSR | stat.S_IWUSR)
            else:
                # In direct-sudo mode, permissions on pipes are managed by the default ACL,
                # don't override it
                os.mkfifo(stdin)
            if self.isRoot:
                os.chown(stdin, self.dss_user.pw_uid, self.dss_user.pw_gid)
            self.pipes["stdin"] = stdin

        if "stdout" in self.chan:
            stdout = osp.join(self.dir, ".stdout.%s" % rndstr)
            # TODO - check no symlink here? remove existing?
            if self.isRoot:
                os.mkfifo(stdout, stat.S_IRUSR | stat.S_IWUSR)
            else:
                # In direct-sudo mode, permissions on pipes are managed by the default ACL,
                # don't override it
                os.mkfifo(stdout)
            if self.isRoot:
                os.chown(stdout, self.dss_user.pw_uid, self.dss_user.pw_gid)
            self.pipes["stdout"] = stdout

        if "stderr" in self.chan:
            stderr = osp.join(self.dir, ".stderr.%s" % rndstr)
            # TODO - check no symlink here? remove existing?
            if self.isRoot:
                os.mkfifo(stderr, stat.S_IRUSR | stat.S_IWUSR)
            else:
                # In direct-sudo mode, permissions on pipes are managed by the default ACL,
                # don't override it
                os.mkfifo(stderr)
            if self.isRoot:
                os.chown(stderr, self.dss_user.pw_uid, self.dss_user.pw_gid)
            self.pipes["stderr"] = stderr

        # Fix mandatory environment variables
        if self.isRoot:
            self.env["HOME"] = self.user.pw_dir
            self.env["USER"] = self.user.pw_name
            self.env["LOGNAME"] = self.user.pw_name
            self.env["SHELL"] = self.user.pw_shell if self.user.pw_shell else "/bin/sh"

        # Prepare set of cgroups before send pipes, so that if there is a permission error
        # we don't hang or fail
        self.target_cgroup_tasks_files = []
        for cgroup in self.config["cgroupPaths"]:
            logging.info("Will set process in cgroup %s" % (cgroup))
            while cgroup.startswith("/"):
                cgroup = cgroup[1:]
            tasks_file = osp.join(self.config["cgroupsHierarchiesRoot"], cgroup, "tasks")
            # Safety check
            if proc.isRoot:
                securityutils.check_within_dip_home(self.security_conf_dir, tasks_file)
            self.target_cgroup_tasks_files.append(tasks_file)

        return self.pipes

    #
    # Switch user id in child process
    #
    def setuid(self):
        user = self.user
        logging.info("setting username=%s uid=%d gid=%d", user.pw_name, user.pw_uid, user.pw_gid)
        os.setgid(user.pw_gid)
        os.initgroups(user.pw_name, user.pw_gid)
        os.setuid(user.pw_uid)

    #
    # Start child process
    #
    def start(self):
        self.pid = os.fork()
        if self.pid != 0:
            # Parent
            logging.info("[Parent] Started process %d" % self.pid)

            with open(self.child_pid_file, "w") as f:
                f.write("%d" % self.pid)

            # Set cgroups
            for cgroup_task_file in self.target_cgroup_tasks_files:
                logging.info("[Parent] Setting process %s in cgroup tasks file %s" % (self.pid, cgroup_task_file))
                try:
                    with open(cgroup_task_file, "w") as f:
                        f.write("%s" % self.pid)
                except Exception as e:
                    logging.exception("[Parent] Failed to set process in cgroup tasks file")
            return

        # Set new process group
        os.setpgrp()
        logging.info("[Child] pgroup is set")

        # Setup standard streams

        stdin = self.pipes.get("stdin", "/dev/null")
        logging.info("[Child] opening stdin pipe: %s", stdin)
        os.dup2(os.open(stdin, os.O_RDONLY), 0)
        logging.info("[Child] opened stdin pipe")

        stdout = self.pipes.get("stdout", "/dev/null")
        logging.info("[Child] opening stdout pipe: %s", stdout)
        os.dup2(os.open(stdout, os.O_WRONLY), 1)
        logging.info("[Child] opened stdout")

        if self.pipes.get("stderr", None) is not None:
            stderr = self.pipes.get("stderr", "/dev/null")
            logging.info("[Child] opening stderr pipe: %s", stderr)
            os.dup2(os.open(stderr, os.O_WRONLY), 2)
            logging.info("[Child] opened stderr")


        logging.info("[Child] about to close other fd")
        os.closerange(3, 256)        # TODO - limit? grep FDSize /proc/self/status ?
        logging.info("[Child] closed other fd")

        # Set current directory
        os.chdir(self.dir)
        logging.info("[Child] chdired")

        # Drop privileges
        if self.isRoot:
            self.setuid()
            logging.info("[Child] dropped privileges")

        # clear empty env vars because execve() doesn't like them
        empty_vars = [k for k in proc.env if proc.env[k] is None]
        for k in empty_vars:
            del proc.env[k]

        logging.info("[Child] Checking access to DKUINSTALLDIR and DIP_HOME directories")
        securityutils.check_dir_access('DKUINSTALLDIR', proc.env.get('DKUINSTALLDIR'))
        securityutils.check_dir_access('DIP_HOME', proc.env.get('DIP_HOME'))

        # Exec target command
        logging.info("[Child] Executing: %s : %s", proc.path, ' '.join(proc.args))
        sys.stderr.flush()
        os.execve(proc.path, proc.args, proc.env)
        assert False

    #
    # Wait for child process to terminate
    #
    def wait(self):
        (pid, status) = os.waitpid(self.pid, 0)
        self.pid = None

        exit_status = status >> 8
        signal = status & 0xff
        logging.info("[Child] Process %d exited with exit=%d signal=%d" % (pid, exit_status, signal))

        # If the child was killed, emulate the shell's behavior
        if exit_status == 0 and signal > 0:
            exit_status = 128 + signal

        return exit_status


    def kill(self, sig=signal.SIGINT):
        if self.pid:
            try:
                os.killpg(self.pid, sig)
            except OSError as e:
                logging.info("error killing process group %d: %s", self.pid, e)


def watch_stdin(proc):
    # Start a thread to watch stdin
    # Kill child and exit upon close
    def read_stdin():
        try:
            while True:
                # Block in select instead of read so as not to hang sys.exit() on Suse
                (r, w, x) = select.select([sys.stdin], [], [])
                if sys.stdin not in r:
                    # Should not happen
                    continue
                cmd = sys.stdin.read(1)
                if not cmd:
                    logging.warning("[Wrapper] Standard input closed, terminating process")
                    proc.kill(signal.SIGKILL)
                    break
                elif ord(cmd) == 2:
                    # niceKill
                    logging.warning("[Wrapper] SIGINT requested")
                    proc.kill(signal.SIGINT)
                elif ord(cmd) == 9:
                    # evilKill
                    logging.warning("[Wrapper] SIGKILL requested")
                    proc.kill(signal.SIGKILL)
                elif ord(cmd) == 11:
                    # niceThenEvilKill
                    logging.warning("[Wrapper] SIGINT followed by SIGKILL requested")
                    proc.kill(signal.SIGINT)
                    dead = False
                    for t in range(0, 15):
                        time.sleep(1)
                        try:
                            proc.kill(0) # just check
                            logging.warning("[Wrapper] still alive after %is" % t)
                        except:
                            dead = True
                            break
                    if not dead:
                        logging.warning("[Wrapper] SIGKILL sent")
                        proc.kill(signal.SIGKILL)           
                    
        except IOError:
            logging.warning("[Wrapper] Error reading standard input, terminating process", exc_info=True)
            proc.kill(signal.SIGKILL)
        os._exit(1)

    stdin_thread = threading.Thread(name="stdin-watcher", target=read_stdin)
    stdin_thread.daemon = True
    stdin_thread.start()


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(process)d %(levelname)s %(message)s')

    parser = argparse.ArgumentParser(description='DSS subprocess management helper')
    parser.add_argument("-n", dest='NAME', help="Optional process name")
    parser.add_argument("security_conf_dir", help="Security config dir")
    parser.add_argument("DESC_FILE", help="JSON process description file")
    args = parser.parse_args()

    # Parse process description file
    proc = Process(args.DESC_FILE, args.security_conf_dir)

    # Safety checks
    if proc.isRoot:
        securityutils.check_user_allowed(args.security_conf_dir, proc.get_target_user())
        securityutils.check_within_dip_home(args.security_conf_dir, proc.dir)

    # Setup child environment
    pipes = proc.setup()

    # Communicate this process's pid back, for killing purposes
    # and also of course standard channel pipes back to calling process
    logging.info("[BF] Writing wrapper pipes and pid to wrapper stdout")
    sys.stdout.write(json.dumps({"pid":os.getpid(), "pipes" : pipes, "childPidFile":proc.child_pid_file }) + "\n\0")
    sys.stdout.flush()

    # Start child process
    proc.start()

    # Start watchdog only after fork() to avoid thread-related funnyness in fork()
    watch_stdin(proc)

    # Wait for process to exit
    status = proc.wait()

    logging.info("Full child code: %s" % status)
    sys.exit(status)
