# encoding: utf-8
"""
Single-thread hoster for a custom-code based predictor
"""

import inspect
import sys
import json
import time
import traceback
import logging
from dataiku.core import debugging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
debugging.install_handler()

from dataiku.base.utils import watch_stdin, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink

import os, os.path as osp
import inspect
import pandas as pd
import numpy as np

class LoadedFunction(object):
    def __init__(self, code_file, function_name, data_folders = []):
        self.code_file = code_file
        
        with open(code_file, 'r') as f:
            code = f.read()
        ctx = {"folders" : data_folders}
        exec(code, ctx, ctx)
        
        functions = [o for o in ctx.values() if inspect.isfunction(o)]
        self.f = functions[0] if len(functions) == 1 else ctx.get(function_name, None)
        
        if self.f is None:
            raise Exception('No function "%s" defined' % function_name)
        self.args_len = len(inspect.getargspec(self.f).args)

    def predict(self, data):
        return self.f(**data)

# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    
    # get work to do
    try:
        # retrieve the initialization info and initiate serving
        command = link.read_json()
        
        function_name = command.get('functionName')
        code_file = command.get('codeFilePath')
        data_folders = command.get('resourceFolderPaths', [])
        
        loaded_function = LoadedFunction(code_file, function_name, data_folders)
        
        logging.info("Predictor ready")
        link.send_json({"ok":True})

        stored_exception = None
        # loop and process commands
        while True:
            request = link.read_json()
            if request is None:
                break

            used_api_key =  request.get("usedAPIKey", None)
            if used_api_key is not None:
                os.environ["DKU_CURRENT_REQUEST_USED_API_KEY"] = used_api_key

            before = time.time()
            response = loaded_function.predict(request["params"])
            after = time.time()
            link.send_json({'ok':True, 'resp':response, 'execTimeUS' : int(1000000*(after-before))})

            if used_api_key is not None:
                del os.environ["DKU_CURRENT_REQUEST_USED_API_KEY"]

        # send end of stream
        logging.info("Work done")
        link.send_string('')
    except:
        logging.exception("Function user code failed")
        link.send_string('') # send null to mark failure
        link.send_json(get_json_friendly_error( ))
    finally:
        # done
        link.close()

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
  


