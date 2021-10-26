# Handles various acl tasks
# To be run as root / sudo

import json
import logging
import os
import os.path as osp
import pwd
import signal
import stat
import subprocess
import sys
import threading
import securityutils

def safe_exec(args):
    with open("/dev/null") as devnull:
        subprocess.check_call(args, stdin=devnull, stdout=sys.stderr)

def setfacl(path, recursive, perms):
    if sys.platform == "darwin":
        logging.info("Running on OS X: setfacl not available, doing chmod instead")
        args = ["chmod"]
        if recursive:
            args.append("-R")
        else:
            raise Exception("non-recursive setfacl: not implemented")
        args.append("a+rX,ug+w,o-w")
        args.append(path)

        logging.info("Executing: %s" % args)
        safe_exec(args)
        return

    args = ["setfacl"]
    if recursive:
        args.append("-RP")
    else:
        raise Exception("non-recursive setfacl: not implemented")
    args.append("-m")
    args.append(",".join(perms))
    args.append(path)

    logging.info("Executing: %s" % args)
    safe_exec(args)

def chown(path, user):
    logging.info("Executing chown -Rh: %s -> %s" % (path, user))
    safe_exec(["chown", "-Rh", user, path])


def handle_main(args):
    # Check arguments
    if not osp.isabs(args.security_conf_dir):
        raise Exception("security_conf_dir argument must be absolute: %s", args.security_conf_dir)
    if not osp.isabs(args.path):
        raise Exception("path argument must be absolute: %s", args.path)

    if args.command == "setfacl":
        # Check arguments
        if not args.perm:
            raise Exception("Missing perm argument")
        # Safety checks
        securityutils.check_is_dir(args.path)
        securityutils.check_within_dip_home(args.security_conf_dir, args.path)
        if args.affected_user:
            for au in args.affected_user:
                securityutils.check_user_allowed(args.security_conf_dir, au)
        # Go
        setfacl(args.path, args.recursive, args.perm)

    elif args.command == "chown":
        # Check arguments
        if not args.owner:
            raise Exception("Missing owner argument")
        # Safety checks
        securityutils.check_is_dir(args.path)
        securityutils.check_within_dip_home(args.security_conf_dir, args.path)
        securityutils.check_user_allowed(args.security_conf_dir, args.owner)

        chown(args.path, args.owner)

    else:
        raise Exception("Unknown command: %s" % args.command)

if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(process)d %(levelname)s %(message)s')

    parser = argparse.ArgumentParser(description='DSS ACL management helper')
    parser.add_argument("security_conf_dir")
    parser.add_argument("command") # setfacl or chown
    parser.add_argument("--path", required=True)
    # For setfacl
    parser.add_argument("--perm", action="append")
    parser.add_argument("--affected-user", action="append")
    parser.add_argument("--recursive", action="store_true")
    # For chown
    parser.add_argument("--owner")

    args = parser.parse_args()

    try:
        handle_main(args)
    except Exception as e:
        logging.exception("Unable to set access perms : %s" % str(e))
        sys.exit(1)