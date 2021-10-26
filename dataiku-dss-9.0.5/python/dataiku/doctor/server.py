# encoding: utf-8
"""
Main doctor entry point.
This is a HTTP server which receives commands from the AnalysisMLKernel Java class
"""

import dataiku  # going first is usually bad practice but it shut downs some warning
import sys, os, logging, time
import inspect
import json
import calendar, datetime

from . import DoctorException
from dataiku.core import dkujson as dkujson
from dataiku.core import debugging
from .dkuapi import json_api
import traceback

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink


# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    command = link.read_json()

    try:
        from dataiku.doctor import commands
        COMMANDS = {
            command_name: json_api(command_method)
            for (command_name, command_method) in commands._list_commands()
        }

        task = command["command"]
        arg = command.get("arg", "")
        
        logging.info("Running analysis command: %s" % task)
        if task not in COMMANDS:
            raise ValueError("Command %s is unknown." % task)
        else:
            api_command = COMMANDS[task]
            ret = api_command(arg)

        link.send_json(ret)
        
        # send end of stream
        link.send_string('')
    except:
        link.send_string('') # mark failure
        traceback.print_exc()
        link.send_json(get_json_friendly_error())
    finally:
        # done
        link.close()
    

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s')
    debugging.install_handler()

    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])

