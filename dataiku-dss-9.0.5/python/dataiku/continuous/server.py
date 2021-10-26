import os, sys, json, traceback, zipfile, inspect
import os.path as osp
import logging
import numpy as np, pandas as pd
from pandas.api.types import is_datetime64tz_dtype, is_datetime64_any_dtype

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

from dataiku.base.utils import watch_stdin, ErrorMonitoringWrapper
from dataiku.base.remoterun import read_dku_env_and_set
from dataiku.base.socket_block_link import JavaLink
from dataiku.core.dataset import Dataset
from dataiku.core.streaming_endpoint import StreamingEndpoint

# setup stuff, including sys.path for libraries
read_dku_env_and_set()


# python2 complains when you want to compile code that contains in the same function
# a subfunction and a exec() statement
def python2_friendly_exec(code, ctx_global, ctx_local):
    exec(code, ctx_global, ctx_local)
    
if sys.version_info > (3,):
    dku_basestring_type = str
else:
    dku_basestring_type = basestring
    

def _dku_object_to_str_key(o):
    if isinstance(o, dku_basestring_type):
        return o
    elif isinstance(o, StreamingEndpoint):
        return o.full_name
    elif isinstance(o, Dataset):
        return o.full_name
    else:
        raise Exception("Cannot get key for object of type %s" % type(o))

class ReadParams(object):
    def __init__(self, schema):
        self.schema = schema
        self.use_schema_types = False

class WriteParams(object):
    def __init__(self, schema):
        self.schema = schema
        
import dataiku.continuous as dku_continuous
if getattr(dku_continuous, 'dku_write_params', None) is None:
    logging.info("init dku_write_params")
    dku_continuous.dku_write_params = {}
if getattr(dku_continuous, 'dku_read_params', None) is None:
    logging.info("init dku_read_params")
    dku_continuous.dku_read_params = {}

def get_dku_read_params():
    return dku_continuous.dku_read_params
def get_dku_write_params():
    return dku_continuous.dku_write_params
    
class InputWindows(object):
    def __init__(self):
        self.windows = {}
        self.ranges = {}

    def get(self, o):
        return self.windows.get(_dku_object_to_str_key(o), None) # could be non-existent in the very beginning, when there's no row
        
    def _add_to_window(self, o, rows):
        k = _dku_object_to_str_key(o)
        window = self.windows.get(k, None)
        rows_start = rows.index.min()
        rows_end = rows.index.max()
        old_range = self.ranges.get(k, {})
        old_start = old_range.get('start', 0)
        old_end = old_range.get('end', old_start - 1)
        if window is None:
            self.windows[k] = rows
            self.ranges[k] = {'start':rows_start, 'end':rows_end}
        else:
            if rows_end > old_end: # otherwise the window already contains the rows
                self.windows[k] = pd.concat([window, rows[rows.index > old_end]])
                self.ranges[k] = {'start':old_start, 'end':rows_end}
        
    def _remove_from_window(self, o, min_ts):
        k = _dku_object_to_str_key(o)
        window = self.windows.get(k, None)
        if window is not None:
            w_ts = window['__timestamp']
            window = window[w_ts >= min_ts]
            self.windows[k] = window
            if window.shape[0] == 0:
                self.ranges[k] = {}
            else:
                self.ranges[k] = {'start':window.index.min(), 'end':window.index.max()}
        
    def _add_input_range(self, o, added_range):
        if added_range is None:
            return None # nothing added, no change in window
        k = _dku_object_to_str_key(o)
        old_range = self.ranges.get(k, {})
        old_start = old_range.get('start', 0)
        old_end = old_range.get('end', old_start - 1)
        added_start = added_range.get('start', 0)
        added_end = added_range.get('end', added_start - 1)
        new_range = {'start':min(old_start, added_start), 'end':max(old_end, added_end)}
        #self.ranges[k] = new_range
        if old_end + 1 < added_start:
            return {'start':old_end + 1, 'end':added_start - 1}
        else:
            return None
         
class InputBatch(object):
    def __init__(self):
        self.input_rows = {}
        self.checkpoint = {}
        
    def get(self, o):
        return self.input_rows[_dku_object_to_str_key(o)]

    def set(self, o, data):
        self.input_rows[_dku_object_to_str_key(o)] = data

def _format_for_read(i, rows_list, read_params):
    read_param = read_params[i]

    data = [r['cells'] for r in rows_list]
    index = [r['idx'] for r in rows_list]
    timestamps = [r['ts'] for r in rows_list]
    (names, dtypes, parse_dates) = Dataset.get_dataframe_schema_st(read_param.schema.get('columns', []), None, True, False, False)
    df = pd.DataFrame.from_records(data, index=index, exclude=None, columns=names)
    if read_param.use_schema_types:
        # cast to the types expected by the schema
        for name in names:
            df[name] = df[name].astype(dtypes[name])
        # handle dates (they should be str at this point
        if parse_dates is not False:
            for col_idx in parse_dates:
                col = read_param.schema["columns"][col_idx]["name"]
                if col in df:
                    df[col] = pd.to_datetime(df[col])
            
    df['__timestamp'] = np.array(timestamps, dtype='i8')

    return df

class OutputBatch(object):
    def __init__(self):
        self.output_rows = {}
        
    def get(self, o):
        return self.output_rows.get(_dku_object_to_str_key(o), [])

    def set(self, o, data):
        self.output_rows[_dku_object_to_str_key(o)] = data
        
    def _format_for_write(self, write_params):
        prepared = {}
        for k in write_params:
            data = self.get(k)
            write_param = write_params[k]
            if isinstance(data, pd.DataFrame):
                if '__timestamp' in data.columns:
                    data = data.drop('__timestamp', axis=1)
                # convert types that can't be serialized in json
                for n in data.columns:
                    if is_datetime64tz_dtype(data[n].dtype):
                        data[n] = data[n].dt.strftime('%Y-%m-%d %H:%M:%S.%f %z')
                    elif is_datetime64_any_dtype(data[n].dtype):
                        data[n] = data[n].dt.strftime('%Y-%m-%d %H:%M:%S.%f')
                columns = [c['name'] for c in write_param.schema['columns']]
                prepared[k] = [list(r) for r in data.reindex(columns, axis=1).itertuples(index=False)]
            else:
                prepared[k] = data
        return prepared

def serve(port, secret):
    # link to the continuous python runner via a socket
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    command = link.read_json()
    try:
        code = command["code"]
        
        # setup env according to what the DSS backend wants us to be (in K8S case there is no way to have an index)
        os.environ['DKU_REPLICA_COUNT'] = str(command['nbReplicas'])
        os.environ['DKU_REPLICA_INDEX'] = str(command['replicaIndex'])
        os.environ['DKU_REPLICA_RESTARTS'] = str(command['restartCount'])
        
        # get the helper function
        ctx = {}
        
        # pass a variable to control input handling (python-side of course)
        ctx['dku_read_params'] = get_dku_read_params()
        ctx['dku_write_params'] = get_dku_write_params()

        for i in command['inputSchemas']:
            get_dku_read_params()[i] = ReadParams(command['inputSchemas'][i])
        
        python2_friendly_exec(code, ctx, ctx)
        
        f = ctx.get('process', None)
        
        if f is None:
            raise Exception('No function "process" defined')
        f_args_count = len(inspect.getargspec(f).args)
        if f_args_count < 2 or f_args_count > 3:
            reason = "The process() function must have 2 or 3 arguments (input_stream_data, output_stream_data, [input_windows]): %i args found" % f_args_count
            raise Exception(reason)
        print("initialized")

        link.send_json({'ok':True})
        
        print("initing")
        init_command = link.read_json()
        if init_command.get('doInit', False):
            i = ctx.get('init', None)
            if i is not None:
                print("run init func")
                i()
            else:
                print("No init func to run")            
        link.send_json({'ok':True})

        print("acknowledge init")
        ack_command = link.read_json()
        for o in ack_command['outputSchemas']:
            get_dku_write_params()[o] = WriteParams(ack_command['outputSchemas'][o])
        link.send_json({'ok':True})

        print("starting")
    
        # loop and process rows
        windows = InputWindows()
        while True:
            # request some data to process
            link.send_json({'type':'data'})
            inputs_request = link.read_json()
            if inputs_request is None or inputs_request.get('done', False):
                break
            # prepare the data a bit
            input_batch = InputBatch()
            input_batch.checkpoint = inputs_request.get('checkpoint', {})
            
            windows_request = {}
            for i in inputs_request['inputs']:
                elem = inputs_request['inputs'][i]
                input_batch.set(i, _format_for_read(i, elem['rows'], get_dku_read_params()))
                
                if i in command['windowDefinitions']:
                    windows._remove_from_window(i, elem['removeFromWindowAtBeginning'])
                    window_request = windows._add_input_range(i, elem.get('range', {}))
                    if window_request is not None:
                        windows_request[i] = window_request
                    
            # check if windows are needed, and if so, get them
            if len(windows_request) > 0:
                # first return a 'need-more-info' response
                link.send_json({'type':'window', 'windows':windows_request})
                windows_response = link.read_json()
                for i in windows_response['windows']:
                    elem = windows_response['windows'][i]
                    df = _format_for_read(i, elem['rows'], get_dku_read_params())
                    windows._add_to_window(i, df)

            # add new rows to windows (if needed)
            for i in inputs_request['inputs']:
                if i in command['windowDefinitions']:
                    df = input_batch.get(i)                
                    windows._add_to_window(i, df)
                            
            # process it
            output_batch = OutputBatch()
            if f_args_count == 2:
                f(input_batch, output_batch)
            else:
                f(input_batch, output_batch, windows)
                        
            # send result back to where it came from
            prepared = output_batch._format_for_write(get_dku_write_params())
            link.send_json({'type':'processed', 'outputRows':prepared})
            ack = link.read_json()
                 
        # no need for end of stream
    finally:
        # done
        try:
            link.close()
        except:
            logging.warning("failed to close socket", exc_info=sys.exc_info())
    # no error handling, it's done by ErrorMonitoringWrapper, thus dumped to file instead of to the socket


def main():
    watch_stdin()
    with ErrorMonitoringWrapper():
        serve(int(sys.argv[1]), sys.argv[2])

if __name__ == "__main__":
    main()        
