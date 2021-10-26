#! /usr/bin/python2.7
import sys
import os
import logging
import subprocess
import time

# Note: this will cause suicide of all processes. Only use in a Docker container !

def to_stdout(s):
    sys.stdout.write(s)
    sys.stdout.flush()

def main(args):
    logging.basicConfig(stream=sys.stderr, level=logging.DEBUG, format='%(asctime)s %(levelname)s %(filename)s: %(message)s')
    logger = logging.getLogger("supervisord-watchdog")
    debug_mode = True if 'DEBUG' in os.environ else False

    while True:
        to_stdout("READY\n")
        logger.info("Listening for events...")
        line = sys.stdin.readline()
        sys.stderr.write("Got line: %s\n" % line)
        sys.stderr.flush()
        headers = dict([ x.split(':') for x in line.split() ])
        body = sys.stdin.read(int(headers['len']))
        body = dict([pair.split(":") for pair in body.split(" ")])

        try:
            if headers["eventname"] == "PROCESS_STATE_FATAL":
                logger.info("Process entered FATAL state...")
                if not args or body["processname"] in args:
                    supervisord_pid = os.getppid()
                    logger.error("Killing off supervisord instance  (pid=%s) ... " % supervisord_pid)
                    res = subprocess.call(["/bin/kill", "-15", "%s" % supervisord_pid], stdout=sys.stderr)
                    logger.info("Sent TERM signal to supervisord process")
                    time.sleep( 5 )
                    logger.critical("Why am I still alive? Send KILL to ALL processes...")
                    res = subprocess.call(["/bin/kill", "-9", "-1"], stdout=sys.stderr)
        except Exception as e:
            logger.critical("Unexpected Exception: %s", str(e))
            to_stdout("RESULT 4\nFAIL")
            exit(1)
        else:
            to_stdout("RESULT 2\nOK")

if __name__ == '__main__':
    main(sys.argv[1:])