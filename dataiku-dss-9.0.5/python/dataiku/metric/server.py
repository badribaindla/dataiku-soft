# encoding: utf-8
"""
Hoster for a single Python metric or check computer
"""

import inspect
import os
import sys
import logging
import json
import traceback
from datetime import datetime

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink

from dataiku.core import debugging
from dataiku.core.dataset import Dataset
from dataiku.core.saved_model import Model
from dataiku.core.managed_folder import Folder
from dataiku.core.metrics import MetricDataPoint

if sys.version_info > (3,):
    dku_basestring_type = str
else:
    dku_basestring_type = basestring

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
debugging.install_handler()

class MetricDataType:
    def __init__(self, name):
        self.name = name
        
class MetricDataTypes:
    STRING = MetricDataType('STRING')
    DATE = MetricDataType('DATE')
    GEOPOINT = MetricDataType('GEOPOINT')
    GEOMETRY = MetricDataType('GEOMETRY')
    ARRAY = MetricDataType('ARRAY')
    MAP = MetricDataType('MAP')
    OBJECT = MetricDataType('OBJECT')
    DOUBLE = MetricDataType('DOUBLE')
    BOOLEAN = MetricDataType('BOOLEAN')
    FLOAT = MetricDataType('FLOAT')
    BIGINT = MetricDataType('BIGINT')
    INT = MetricDataType('INT')
    SMALLINT = MetricDataType('SMALLINT')
    TINYINT = MetricDataType('TINYINT')
    

def compute_metric(obj_arg, partition_id, f):
    logging.info("Computing metric")

    result = None
    if len(inspect.getargspec(f).args) == 0:
        result = f()
    if len(inspect.getargspec(f).args) == 1:
        result = f(obj_arg)
    if len(inspect.getargspec(f).args) >= 2:
        result = f(obj_arg, partition_id)
                    
    results = {}
    types = {}
    def set_value(name, value, t=None):
        if isinstance(value, datetime):
            results[name] = value.isoformat()
            types[name] = t if t is not None else 'DATE'
        else:
            results[name] = value
            types[name] = t

    def extract_type_if_any(name, value):
        print('treat %s = %s of type %s' % (name, value, type(value)))
        if isinstance(value, tuple) and len(value) == 2 and isinstance(value[1], type(MetricDataTypes.STRING)):
            set_value(name, value[0], value[1].name)
        else:
            set_value(name, value)

    if isinstance(result, dict):
        for name in result:
            value = result[name]
            extract_type_if_any(name, value)
    else:
        extract_type_if_any("value", result)

    logging.info("Computed : results=%s types=%s" % (json.dumps(results), json.dumps(types)))
    
    return {"result":results, "types":types}

def run_check(obj_arg, partition_id, last_values, f):
    logging.info("Running check")

    last_values_cast = {}
    # transform last_values into something more pleasant
    for metric_id in last_values:
        data_point = last_values[metric_id]
        last_values_cast[metric_id] = MetricDataPoint(data_point)

    f_result = None
    if len(inspect.getargspec(f).args) == 0:
        f_result = f()
    if len(inspect.getargspec(f).args) == 1:
        f_result = f(last_values_cast)
    if len(inspect.getargspec(f).args) == 2:
        f_result = f(last_values_cast, obj_arg)
    if len(inspect.getargspec(f).args) >= 3:
        f_result = f(last_values_cast, obj_arg, partition_id)
                
    result = None
    message = None
    if f_result is not None:
        if isinstance(f_result, list) or isinstance(f_result, tuple):
            result = f_result[0] if len(f_result) > 0 else None
            message = f_result[1] if len(f_result) > 1 else None
        elif isinstance(f_result, dict):
            result = f_result.get('result', None)
            message = f_result.get('message', None)
        else:
            result = f_result
            
    outcome = None
    if isinstance(result, dku_basestring_type):
        if result.upper()[0] == 'O':
            outcome = 'OK'
        elif result.upper()[0] == 'W':
            outcome = 'WARNING'
        elif result.upper()[0] == 'E':
            outcome = 'ERROR'
            
    obj = {
        "outcome" : outcome,
        "message" : message
    }

    logging.info("Computed : outcome=%s message=%s" % (outcome, message))

    return obj

# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    command = link.read_json()
    try:
        # logging.info("Got %s" % json.dumps(command))
        config = command.get("config", {})
        plugin_config = command.get("pluginConfig", {})
        code = command["code"]
        
        ctx = {"config" : config, "plugin_config" : plugin_config}
        exec(code, ctx, ctx)
        
        functions = [o for o in ctx.values() if inspect.isfunction(o)]
        f = functions[0] if len(functions) == 1 else ctx.get('process', None)
        
        if f is None:
            raise Exception('No function "process" defined')
            
        object_type = command['objectType']
        full_name = command['fullName']
        partition_id = command.get('partitionId', None)
        if object_type == "DATASET":
            obj_arg = Dataset(full_name)
        elif object_type == "SAVED_MODEL":
            obj_arg = Model(full_name)
        elif object_type == "MANAGED_FOLDER":
            obj_arg = Folder(full_name)
            
        # work and get output
        if command['command'] == 'compute':
            result = compute_metric(obj_arg, partition_id, f)
        elif command['command'] == 'check':
            last_values = command.get("lastValues", {})
            result = run_check(obj_arg, partition_id, last_values, f)
        else:
            raise Exception("Unknown command")

        if result is None:
            raise Exception("Code did not return a result")
            
        link.send_json(result)
    except:
        traceback.print_exc()
        link.send_string('') # send null to mark failure
        link.send_json(get_json_friendly_error())
    finally:
        # done
        link.close()

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        
    