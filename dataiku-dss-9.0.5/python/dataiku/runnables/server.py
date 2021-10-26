import inspect
import sys
import json
import calendar, datetime, time
import traceback, logging

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink
from .runnable import Runnable
from .progress_utils import get_progress_callback, send_result_string, send_error

# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    command = link.read_json()
    try:
        project_key = command.get("projectKey", {})
        config = command.get("config", {})
        plugin_config = command.get("pluginConfig", {})
        code = command["code"]
        
        # get the exporter object
        clazz = get_clazz_in_code(code, Runnable)
        arg_count = len(inspect.getargspec(clazz.__init__).args)
        runnable = None
        if arg_count == 1:
            runnable = clazz()
        elif arg_count == 2:
            runnable = clazz(project_key)
        elif arg_count == 3:
            runnable = clazz(project_key, config)
        elif arg_count == 4:
            runnable = clazz(project_key, config, plugin_config)
        else:
            raise Exception("Wrong signature of the Runnable subclass: %i args" % arg_count)
            
        # init progress reporting if relevant
        report_progress = get_progress_callback(runnable.get_progress_target, link)
    
        # work and get output
        try:
            result = runnable.run(report_progress)
            if result is not None:
                to_json = getattr(result, "to_json", None)
                if to_json is not None and callable(to_json):
                    result = result.to_json()
                elif isinstance(result, dict):
                    result = json.dumps(result).encode("utf-8")

                print("the result is %s" % result)
            send_result_string(result, link)
            # send end of stream (data is expected as a stream)
            link.send_string('')
        except:
            traceback.print_exc()
            send_error(link)

    except:
        traceback.print_exc()
        link.send_string('') # send null to mark failure
        link.send_json(get_json_friendly_error())
    finally:
        # done
        link.close()
    

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(message)s')
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
