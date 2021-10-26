import inspect
import sys
import json
import calendar, datetime, time
import traceback

from dataiku.base.utils import encode_utf8
from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink

# python2 complains when you want to compile code that contains in the same function
# a subfunction and a exec() statement
def python2_friendly_exec(code, ctx_global, ctx_local):
    exec(code, ctx_global, ctx_local)
   
# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    command = link.read_json()
    try:
        code = command["code"]
        notebook = command["notebook"]
        project_key = command.get("projectKey", None)
        dataset_project_key = command.get("datasetProjectKey", None)
        dataset_name = command.get("datasetName", None)
        
        # get the expansion function
        ctx = {}
        python2_friendly_exec(code, ctx, ctx)
        
        functions = [o for o in ctx.values() if inspect.isfunction(o)]
        f = functions[0] if len(functions) == 1 else ctx.get('expand', None)
        
        if f is None:
            raise Exception('No function "expand" defined')
        f_args_count = len(inspect.getargspec(f).args)
        if f_args_count >= 5:
            reason = "Too many arguments for the expand() function : %i args" % f_args_count
            raise Exception(reason)
        if f_args_count < 1:
            reason = "Too few arguments for the expand() function : %i args" % f_args_count
            raise Exception(reason)

        def call_expand(notebook, project_key, dataset_project_key, dataset_name):        
            result = None
            if f_args_count == 1:
                result = f(notebook)
            if f_args_count == 2:
                result = f(notebook, project_key)
            if f_args_count == 3:
                result = f(notebook, project_key, dataset_project_key)
            if f_args_count == 4:
                result = f(notebook, project_key, dataset_project_key, dataset_name)
            return result

        # expand for real
        expanded = call_expand(notebook, project_key, dataset_project_key, dataset_name)
        
        # the java end is waiting for utf8
        expanded = encode_utf8(expanded)
            
        link.send_block(expanded)
        
        # send end of stream
        link.send_string('')
        # send ack
        link.send_json({'ok': True, 'count':len(expanded)})
    except:
        link.send_string('') # mark failure
        traceback.print_exc()
        link.send_json({'ok':False, 'error':get_json_friendly_error()})
    finally:
        # done
        link.close()
    

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        