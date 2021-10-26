import inspect
import sys
import json
import time
import traceback

from .fsprovider import FSProvider

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink

def handle_request(request, fsprovider, closed):
    request_type = request.get('type', None)
    response = None
    if request_type == 'close':
        fsprovider.close()
        response = {}
        closed = True
    elif request_type == 'stat':
        response = {"fspath" : fsprovider.stat(request.get('path', '/'))}
    elif request_type == 'setmtime':
        response = {"done" : fsprovider.set_last_modified(request.get('path', '/'), request.get('lastModified', 0))}
    elif request_type == 'browse':
        response = fsprovider.browse(request.get('path', '/'))
    elif request_type == 'enumerate':
        try:
            paths = fsprovider.enumerate(request.get('prefix', '/'), request.get('firstNonEmpty', False))
            if paths is None:
                response = {'successful' : False, 'enumerationPrefixExists' : False}
            else:
                response = {'successful' : True, 'enumerationPrefixExists' : True, 'paths' : paths}
        except Exception as e:
            response = {'successful' : False, 'errorMessage' : str(e)}
    elif request_type == 'delete':
        response = {"count" : fsprovider.delete_recursive(request.get('path', '/'))}
    elif request_type == 'move':
        from_path = request.get('fromPath', '/')
        to_path = request.get('toPath', from_path)
        response = {"done" : fsprovider.move(from_path, to_path)}
    else:
        raise Exception("Unknown command %s" % request_type)    
                    
    return closed, response

# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    try:
        command = link.read_json()
        
        config = command.get("config", {})
        plugin_config = command.get("pluginConfig", {})
        code = command["code"]
        root = command["root"]
        
        # get the fs provider object
        clazz = get_clazz_in_code(code, FSProvider)
        arg_count = len(inspect.getargspec(clazz.__init__).args)
        fsprovider = None
        if arg_count == 1:
            fsprovider = clazz()
        elif arg_count == 2:
            fsprovider = clazz(root)
        elif arg_count == 3:
            fsprovider = clazz(root, config)
        elif arg_count == 4:
            fsprovider = clazz(root, config, plugin_config)
        else:
            reason = "Wrong signature of the FSProvider subclass: %i args" % arg_count
            link.send_json({'ok':False,'reason':reason})
            raise Exception(reason)
        link.send_json({'ok':True})
          
        # loop and process commands
        closed = False
        while not closed:
            request = link.read_json()
            if request is None:
                break
                
            closed, response = handle_request(request, fsprovider, closed)
            
            link.send_json(response)
                        
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
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        