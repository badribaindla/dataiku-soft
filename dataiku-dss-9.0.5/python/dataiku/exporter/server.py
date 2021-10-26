import inspect
import sys
import json
import calendar, datetime, time
import traceback, logging

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink
from dataiku.core import dkuio
from dataiku.core.dataset import Dataset
from .exporter import Exporter

import pandas as pd, numpy as np


def json_date_serializer(obj):
    """Default JSON serializer."""

    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    raise Exception("Not serializable")

def empty_for_none(obj):
    return '' if obj is None else obj

# export a stream of rows
def export_rows(exporter, export_behavior, schema, input_stream, destination_file_path=None):
    if export_behavior == 'OUTPUT_TO_FILE':
        exporter.open_to_file(schema, destination_file_path)
    elif export_behavior == 'MANAGES_OUTPUT':
        exporter.open(schema)
    else:
        raise Exception("Unexpected export behavior %s" % export_behavior)

    export_start = time.time()

    # data comes in as csv
    (names, dtypes, parse_dates_columns) = Dataset.get_dataframe_schema_st(schema["columns"],
                columns=None, parse_dates=True, infer_with_pandas=False, bool_as_str=False)

    # We don't want to fail on bad data in int columns so we read them as doubles rather
    if dtypes is not None:
        new_dtypes = {}
        for (k, v) in dtypes.items():
            if v == np.int64 or v == np.int32:
                v = np.float64
            new_dtypes[k] = v
        dtypes = new_dtypes

    print ("Read with dtypes = %s" % dtypes)

    row_count = 0
    for df in pd.read_table(input_stream, iterator=True, chunksize=5000,
                    header=None, names=names, sep=',', skip_blank_lines=False,
                    dtype = dtypes, parse_dates=parse_dates_columns):

        print ("Read a DF (%d rows)" % df.shape[0])
        for row in df.itertuples(index=False, name=None):
            clean_row = []
            for v in row:
                if isinstance(v, np.bool_) or  isinstance(v, np.bool):
                    clean_row.append(True if v == True else False)
                else:
                    clean_row.append(v)
            exporter.write_row(tuple(clean_row))
            row_count += 1
        print ("DF is consumed, preparing for next")

    export_end = time.time()
    print ("Export done in %ds" % (export_end - export_start))

    exporter.close()
    
    return row_count

# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    command = link.read_json()
    try:
        config = command.get("config", {})
        plugin_config = command.get("pluginConfig", {})
        code = command["code"]
        
        # get the exporter object
        clazz = get_clazz_in_code(code, Exporter)
        arg_count = len(inspect.getargspec(clazz.__init__).args)
        exporter = None
        if arg_count == 1:
            exporter = clazz()
        elif arg_count == 2:
            exporter = clazz(config)
        elif arg_count == 3:
            exporter = clazz(config, plugin_config)
        else:
            raise Exception("Wrong signature of the Exporter subclass: %i args" % arg_count)
    
        # get task and dispatch work to exporter    
        task = command["task"]
        if task == "export":
            # schema is mandatory
            with link.read_stream() as input:
                row_count = export_rows(exporter, command["exportBehavior"], command["schema"], input, command.get("destinationFilePath", None))
            
        else:
            raise Exception("Unexpected task %s" % task)
            
        # send ack
        link.send_json({'ok':True, 'count':row_count})
    except:
        link.send_string('') # mark failure
        traceback.print_exc()
        link.send_json(get_json_friendly_error())
    finally:
        # done
        link.close()
    

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(message)s')
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        
