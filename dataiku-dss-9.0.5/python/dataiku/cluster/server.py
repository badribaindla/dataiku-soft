import inspect
import sys
import json
import calendar, datetime, time
import traceback, logging

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink
from .cluster import Cluster
from ..runnables.progress_utils import get_progress_callback, send_result_json, send_error

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s')

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
        cluster_id = command["clusterId"]
        cluster_name = command["clusterName"]
        global_settings = command["globalSettings"]
        
        # get the exporter object
        clazz = get_clazz_in_code(code, Cluster)
        arg_count = len(inspect.getargspec(clazz.__init__).args)
        cluster = None
        if arg_count == 5:
            cluster = clazz(cluster_id, cluster_name, config, plugin_config)
        elif arg_count == 6:
            cluster = clazz(cluster_id, cluster_name, config, plugin_config, global_settings)
        else:
            raise Exception("Wrong signature of the Cluster subclass: %i args but expected 5 or 6 (self, cluster_id, name, config, plugin_config[, global_settings])" % arg_count)
            
        # work
        call_name = command["type"]
        data = command.get("data", {})
        if call_name == 'start':
            # init progress reporting if relevant
            report_progress = get_progress_callback(cluster.get_start_progress_target, link)

            arg_count = len(inspect.getargspec(cluster.start).args)
            if arg_count == 1:
                result = cluster.start()
            elif arg_count == 2:
                result = cluster.start(report_progress)
            
            if isinstance(result, list) or isinstance(result, tuple):
                cluster_settings = result[0]
                cluster_data = result[1] if len(result) > 1 else {}
                cluster_setup = {}
                if cluster_settings.get('hadoop', None) is not None:
                    cluster_setup['hadoopSettings'] = cluster_settings.get('hadoop', None)
                if cluster_settings.get('hive', None) is not None:
                    cluster_setup['hiveSettings'] = cluster_settings.get('hive', None)
                if cluster_settings.get('impala', None) is not None:
                    cluster_setup['impalaSettings'] = cluster_settings.get('impala', None)
                if cluster_settings.get('spark', None) is not None:
                    cluster_setup['sparkSettings'] = cluster_settings.get('spark', None)
                if cluster_settings.get('container', None) is not None:
                    cluster_setup['containerSettings'] = cluster_settings.get('container', None)
                cluster_setup['data'] = cluster_data
                send_result_json(cluster_setup, link)
            else:
                raise Exception("start() didn't return an object of a valid type: %s" % type(result))
        elif call_name == 'stop':
            # init progress reporting if relevant
            report_progress = get_progress_callback(cluster.get_stop_progress_target, link)

            arg_count = len(inspect.getargspec(cluster.stop).args)
            if arg_count == 2:
                result = cluster.stop(data)
            elif arg_count == 3:
                result = cluster.stop(data, report_progress)
            
            send_result_json({'ok':True}, link)
        else:
            if hasattr(cluster, call_name):
                action_attr = getattr(cluster, call_name)
                if inspect.ismethod(action_attr):
                    result = action_attr(data)
                    # convert to something that is legit for a JsonObject
                    if result is None:
                        result = {}
                    if not isinstance(result, dict):
                        result = {'result':result}
                    # send
                    link.send_json({'ok':True, 'response':result})
                else:
                    raise Exception("Wrong call type : %s is not a method" % call_name)
            else:
                raise Exception("Wrong call type : %s" % call_name)
        # send end of stream (data is expected as a stream)
        link.send_string('')

    except:
        traceback.print_exc()
        send_error(link)
    finally:
        # done
        link.close()
    

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        
