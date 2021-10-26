import inspect
import sys
import json
import traceback

from .fsprovider import FSProvider

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink

# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    try:
        # get work to do
        command = link.read_json()
        
        config = command.get("config", {})
        plugin_config = command.get("pluginConfig", {})
        code = command["code"]
        root = command["root"]
        path = command["path"]
        limit = command["limit"]
        
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
            raise Exception(reason)
        
        with link.send_stream() as output:
            fsprovider.read(path, output, limit)

        # send ack
        link.send_json({'ok':True})
    except:
        traceback.print_exc()
        error = get_json_friendly_error()
        link.send_json({'ok':False, 'error':error})
    finally:
        # done
        link.close()
    

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        