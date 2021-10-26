import inspect
import sys
import json
import time
import traceback

from dataiku.base.utils import watch_stdin, get_json_friendly_error
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
    is_serving = False
    # get work to do
    try:
        command = link.read_json()
        plugin_config = command.get("pluginConfig", {})
        code = command["code"]
        
        # get the helper function
        ctx = {}
        python2_friendly_exec(code, ctx, ctx)
        
        functions = [o for o in ctx.values() if inspect.isfunction(o)]
        f = functions[0] if len(functions) == 1 else ctx.get('do', None)
        
        if f is None:
            raise Exception('No function "do" defined')
        f_args_count = len(inspect.getargspec(f).args)
        if f_args_count >= 5:
            reason = "Too many arguments for the do() function : %i args" % f_args_count
            raise Exception(reason)
        link.send_json({'ok':True})

        def call_do(payload, config, plugin_config, inputs):        
            result = None
            if f_args_count == 0:
                result = f()
            if f_args_count == 1:
                result = f(payload)
            if f_args_count == 2:
                result = f(payload, config)
            if f_args_count == 3:
                result = f(payload, config, plugin_config)
            if f_args_count == 4:
                result = f(payload, config, plugin_config, inputs)
            return result
          
        is_serving = True
        # loop and process commands
        while True:
            request = link.read_json()
            if request is None:
                break

            response = call_do(request.get('payload', None), request.get('config', {}), plugin_config, request.get('inputs', []))            
            if response is None:
                raise Exception("Empty response to %s" % json.dumps(request))                
            
            link.send_json(response)
                        
        # send end of stream
        link.send_string('')
    except:
        error = get_json_friendly_error()
        link.send_string('') # mark failure
        traceback.print_exc()
        if not is_serving:
            link.send_json(error)
        else:
            link.send_json({'ok':False, 'error':error})
    finally:
        # done
        link.close()

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        