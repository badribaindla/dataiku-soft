import inspect
import sys
import json
import calendar, datetime, time
import traceback

if sys.version_info > (3,0):
    from collections.abc import MutableMapping
else:
    from collections import MutableMapping

import pandas as pd, numpy as np

from dataiku.base.utils import watch_stdin, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink

# python2 complains when you want to compile code that contains in the same function
# a subfunction and a exec() statement
def python2_friendly_exec(code, ctx_global, ctx_local):
    exec(code, ctx_global, ctx_local)
    
# object representing a row in a batch of row (identified by a set of columns and
# an index in the batch) or a batch of rows (identified by a set of columns and 
# an array of indices in the batch)
class RowRepr:
    def __init__(self, columns, index):
        self.columns = columns
        self.loaded = dict() # which columns have been fetched from the backend, and the fetched value(s)
        self.deleted = set() # which columns have been deleted
        self.added = dict() # which columns have been added/modified, and the new value(s)
        self.index = index
        
# object exposed to the process() function of the UDF. It behaves like a regular dictionary for the most
# part, but behind the scenes the values are lazily loaded. Also, values are loaded in bulk (ie
# if you request a value for column 'foo' of the 3 row in the batch, the value for 'foo' is fetched for
# all rows in the batch), courtesy of the load_func
class LazyDict(MutableMapping):
    def __init__(self, store, load_func):
        self.columns = store.columns
        self.load_func = load_func
        self.loaded = store.loaded
        self.deleted = store.deleted
        self.added = store.added
        self.index = store.index
        
    def __delitem__(self, k):
        if k in self.loaded:
            del self.loaded[k]
        if k in self.added:
            del self.added[k]
        self.deleted.add(k)
        
    def __len__(self):
        return len(self.keys())
    
    def __contains__(self, k):
        return self.has_key(k)
    
    def __getitem__(self, k):
        if not self.has_key(k):
            raise KeyError("%s not in dict" % k)
        return self.get(k)
    
    def __setitem__(self, k, v):
        self.loaded[k] = v
        self.added[k] = v
        if k in self.deleted:
            self.deleted.remove(k)
    
    def __iter__(self):
        return self.iterkeys()
    
    def clear(self):
        self.deleted = set(self.columns)
        self.added.clear()
        
    def get(self, k, default_value=None):
        if k not in self.loaded:
            self.load_func(k)
        if k in self.deleted:
            return None
        return self.loaded[k] if k in self.loaded and self.loaded[k] is not None else default_value
    
    def has_key(self, k):
        return k in self.columns and not k in self.deleted
    
    def keys(self):
        if len(self.deleted) > 0:
            return [k for k in self.columns if not k in self.deleted]
        else:
            return self.columns
    
    def iterkeys(self):
        return self.keys().__iter__()
        
    def copy(self):
        r = LazyDict(RowRepr(self.columns, self.index), self.load_func)
        r.deleted = set(self.deleted)
        r.added = self.added.copy()
        # self.loaded is not copied, because it's shared
        return r
        
    def get_dataframe(self, columns=None):
        if columns is None:
            columns = self.columns
        df = pd.DataFrame(index=self.index)
        for n in columns:
            df[n] = self.get(n)
        return df
        
# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    command = link.read_json()
    starting = True
    try:
        project_key = command.get("projectKey", {})
        code = command["code"]
        vectorize = command["vectorize"]
        
        # get the helper function
        ctx = {'dss_variables':command.get("variablesDefinition", {}), 'params':command.get("params", {}), 'plugin_params':command.get("pluginParams", {})}
        python2_friendly_exec(code, ctx, ctx)
        
        functions = [o for o in ctx.values() if inspect.isfunction(o)]
        f = functions[0] if len(functions) == 1 else ctx.get('process', None)
        
        if f is None:
            raise Exception('No function "process" defined')
        f_args_count = len(inspect.getargspec(f).args)
        if f_args_count != 1:
            reason = "The process() function must have 1 argument: %i args" % f_args_count
            raise Exception(reason)
        link.send_json({'ok':True})
        starting = False
    
        # loop and process rows
        while True:
            request = link.read_json()
            if request is None:
                break
            
            columns = request.get('columnNames', [])
            n_rows =  request.get('rowCount', 0)
            
            # depending on the vectorize flag, the process() method gets the rows one by one or in one batch
            if vectorize:
                row_stores = [RowRepr(columns, np.arange(0, n_rows))]
            else:
                row_stores = [RowRepr(columns, i) for i in range(0, n_rows)]
        
            # find instances of LazyDict in processed and replace by the appropriate signaling to the backend
            def lazy_dict_to_changes_if_needed(x):
                if isinstance(x, LazyDict):
                    return {'__dku_deleted_columns' : list(x.deleted), '__dku_added_columns' : x.added}
                else:
                    return x
                    
            # when vectorized, values are pandas series, so convert back and forth
            def pandas_ify(x):
                return pd.Series(x, dtype=str)
                
            def un_pandas_ify(x):
                if isinstance(x, pd.Series):
                    return x.tolist()
                elif isinstance(x, pd.Index):
                    return x.tolist()
                elif isinstance(x, pd.DataFrame):
                    # the index is salvaged separately
                    r = {}
                    for name in x.columns:
                        r[name] = un_pandas_ify(x[name])
                    return r
                elif isinstance(x, np.ndarray):
                    return x.tolist()
                elif isinstance(x, dict):
                    for k in x:
                        x[k] = un_pandas_ify(x[k])
                    return x
                else:
                    return x

            def load_one_column(name, values):
                if vectorize:
                    row_stores[0].loaded[name] = pandas_ify(values)
                else:
                    for i in range(0, n_rows):
                        row_stores[i].loaded[name] = values[i]
                                
            def load_func(name):
                link.send_json({'type' : 'GET_COLUMN_DATA'})
                link.send_json({'name' : name})
                data = link.read_json()
                values = data.get('values', [None] * n_rows)
                load_one_column(name, values)
                
            source_values = request.get('sourceValues', {})
            for name in source_values:
                load_one_column(name, source_values[name])
                
            for i in range(0, len(row_stores)):
                try:
                    row_store = row_stores[i]
                    index_in = row_store.index
                    
                    row = LazyDict(row_store, load_func)
                    processed = f(row)
                    
                    if isinstance(processed, LazyDict):
                        index_out = processed.index          
                    elif isinstance(processed, pd.Series):
                        index_out = processed.index
                    elif isinstance(processed, pd.DataFrame):
                        index_out = processed.index
                    else:  
                        index_out = index_in
                        
                    processed = lazy_dict_to_changes_if_needed(processed)
                    if isinstance(processed, list):
                        processed = [lazy_dict_to_changes_if_needed(x) for x in processed]
                        
                    processed = un_pandas_ify(processed) # can't hurt, even if vectorize = False, since pd.Series() is not JSON-serializable
                    if isinstance(processed, list):
                        processed = [un_pandas_ify(x) for x in processed] # can't hurt, even if vectorize = False, since pd.Series() is not JSON-serializable

                    if vectorize:
                        prepared_processed = {'indices' : un_pandas_ify(index_out), 'processed' : processed}
                    else:
                        prepared_processed = {'idx' : i, 'processed' : processed}
                        
                    jsonified_processed = json.dumps(prepared_processed) # this could fail, not everything is json-serializable
                    
                    # these 2 calls need to be 'atomic'
                    link.send_json({'type' : 'RESULT'})
                    link.send_block(jsonified_processed.encode("utf-8"))
                except:
                    error = get_json_friendly_error()
                    link.send_json({'type' : 'ERROR'})
                    link.send_json({'idx' : i, 'error' : error})
                        
        # send end of stream
        link.send_string('')
    except:
        error = get_json_friendly_error()
        if not starting:
            link.send_string('') # mark failure
        traceback.print_exc()
        link.send_json({'ok':False, 'error':error})
    finally:
        # done
        link.close()

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        
