"""
Adds a export dataset button in ipython notebook output.
"""


import weakref
import os
import sys
import uuid
import struct
try:
    import Queue
except:
    import queue as Queue
import threading
from IPython.core import display
import pandas as pd
from dataiku.core.intercom import backend_put_call
from dataiku.base.utils import safe_unicode_str

USE_SCHEMA = False
from dataiku.core.schema_handling import pandas_dku_type

if sys.version_info > (3,0):
    dku_basestring_type = str
else:
    dku_basestring_type = basestring


class CSVGenerator(threading.Thread):
    
    def __init__(self, df):
        self.df = df
        self.end_mark = []
        self.data = []
        self.force_stop = False
        self.queue = Queue.Queue(100)
        threading.Thread.__init__(self)
        self.start()
        
    # Run thread
    def run(self):
        writelog("Running export-to-csv thread")
        try:
            self.df.to_csv(self, header=False, index=False, chunksize=100, encoding='utf-8')
        except Exception as e:
            writelog("CSV export terminated: %s" % str(e))
            # This is expected to happen!
            pass
        self.write(self.end_mark)
        
    # Write from Pandas to_csv()
    def write(self, data):
        if self.force_stop:
            # Only way I found to stop the CSV writer...
            raise IOError("CSVGenerator has been shutdown")
        else:
            self.queue.put(data)
        
    # Necessary to let Pandas think we're a stream
    def read(self):
        pass
    def __iter__(self):
        raise Exception("Don't call me")
    
    # Return a generator
    def gen(self):
        while not self.force_stop:
            item = self.queue.get()
            if item is self.end_mark:
                break
            yield item
            
    # Throw an IOError to Pandas to_csv() (raised in write())
    # Implicitly kill the thread
    def shutdown(self):
        self.force_stop = True
        try:
            while True:
                self.queue.get(False)
        except:
            self.queue.put(self.end_mark)

def writelog(s):
    pass
    #with open("/tmp/df.log", "a") as f:
        #sys.stderr.write(s)
        #sys.stderr.write("\n")
    #    f.write(s)
    #    f.write("\n")

class IPythonExporter:
    
    _internal_map = dict()
    
    @staticmethod
    def collect_collected():
        writelog("Collect collected: %s" % IPythonExporter._internal_map)
        keys_to_remove = []
        for k in IPythonExporter._internal_map:
            v = IPythonExporter._internal_map[k]
            if v() is None:
                writelog("V has been collected on %s" % k)
                keys_to_remove.append(k)
        for k in keys_to_remove:
            del IPythonExporter._internal_map[k]
    
    @staticmethod
    def register_dataframe(df):
        IPythonExporter.collect_collected()
        
        for k in IPythonExporter._internal_map:
            v = IPythonExporter._internal_map[k]
            if v() is df:
                return k
        
        # Assuming perfect uniqueness
        new_id = str(uuid.uuid4())
        IPythonExporter._internal_map[new_id] = weakref.ref(df)
        return new_id
    
    @staticmethod
    def generate_export_button(df):
        id = IPythonExporter.register_dataframe(df)
        writelog("Registered dataframe %s" % id)
        return """
            <button style="display:none" 
            class="btn btn-default ipython-export-btn" 
            """+("id=\"btn-df-%s\""%id)+""" 
            onclick="_export_df("""+("'%s'"%id)+""")">
                Export dataframe
            </button>
            
            <script>
                
                function _check_export_df_possible(dfid,yes_fn,no_fn) {
                    console.log('Checking dataframe exportability...')
                    if(!IPython || !IPython.notebook || !IPython.notebook.kernel || !IPython.notebook.kernel) {
                        console.log('Export is not possible (IPython kernel is not available)')
                        if(no_fn) {
                            no_fn();
                        }
                    } else {
                        var pythonCode = 'from dataiku.notebook.export import IPythonExporter;IPythonExporter._check_export_stdout("'+dfid+'")';
                        IPython.notebook.kernel.execute(pythonCode,{iopub: {output: function(resp) {
                            console.info("Exportability response", resp);
                            var size = /^([0-9]+)x([0-9]+)$/.exec(resp.content.data || resp.content.text)
                            if(!size) {
                                console.log('Export is not possible (dataframe is not in-memory anymore)')
                                if(no_fn) {
                                    no_fn();
                                }
                            } else {
                                console.log('Export is possible')
                                if(yes_fn) {
                                    yes_fn(1*size[1],1*size[2]);
                                }
                            }
                        }}});
                    }
                }
            
                function _export_df(dfid) {
                    
                    var btn = $('#btn-df-'+dfid);
                    var btns = $('.ipython-export-btn');
                    
                    _check_export_df_possible(dfid,function() {
                        
                        window.parent.openExportModalFromIPython('Pandas dataframe',function(data) {
                            btns.prop('disabled',true);
                            btn.text('Exporting...');
                            var command = 'from dataiku.notebook.export import IPythonExporter;IPythonExporter._run_export("'+dfid+'","'+data.exportId+'")';
                            var callback = {iopub:{output: function(resp) {
                                console.info("CB resp:", resp);
                                _check_export_df_possible(dfid,function(rows, cols) {
                                    $('#btn-df-'+dfid)
                                        .css('display','inline-block')
                                        .text('Export this dataframe ('+rows+' rows, '+cols+' cols)')
                                        .prop('disabled',false);
                                },function() {
                                    $('#btn-df-'+dfid).css('display','none');
                                });
                            }}};
                            IPython.notebook.kernel.execute(command,callback,{silent:false}); // yes, silent now defaults to true. figures.
                        });
                    
                    }, function(){
                            alert('Unable to export : the Dataframe object is not loaded in memory');
                            btn.css('display','none');
                    });
                    
                }
                
                (function(dfid) {
                
                    var retryCount = 10;
                
                    function is_valid_websock(s) {
                        return s && s.readyState==1;
                    }
                
                    function check_conn() {
                        
                        if(!IPython || !IPython.notebook) {
                            // Don't even try to go further
                            return;
                        }
                        
                        // Check if IPython is ready
                        console.info("Checking conn ...")
                        if(IPython.notebook.kernel
                        && IPython.notebook.kernel
                        && is_valid_websock(IPython.notebook.kernel.ws)
                        ) {
                            
                            _check_export_df_possible(dfid,function(rows, cols) {
                                $('#btn-df-'+dfid).css('display','inline-block');
                                $('#btn-df-'+dfid).text('Export this dataframe ('+rows+' rows, '+cols+' cols)');
                            });
                            
                        } else {
                            console.info("Conditions are not ok", IPython.notebook.kernel);
                            
                            // Retry later
                            
                            if(retryCount>0) {
                                setTimeout(check_conn,500);
                                retryCount--;
                            }
                            
                        }
                    };
                    
                    setTimeout(check_conn,100);
                    
                })("""+"\"%s\""%id+""");
                
            </script>
            
        """
    
    @staticmethod
    def export_dataframe(df):
        html = IPythonExporter.generate_export_button(df)
        display.display_html(html, raw=True)
    
    @staticmethod
    def encode_dataframe(df, csv):
        def writeInt(n, ba):
            ba += struct.pack('!i', n)
        def writeStr(s, ba):
            s = safe_unicode_str(s).encode('utf-8')
            writeInt(len(s), ba)
            if len(s) > 0:
                ba += struct.pack('!%ds' % len(s), s)
        buffer = bytearray()
        writeInt(len(df.columns), buffer)
        for c in df.columns:
            writeStr(c, buffer)
            if USE_SCHEMA:
                writeStr(pandas_dku_type(df[c].dtype), buffer)
            else:
                writeStr('string', buffer)
        writeInt(len(df.index), buffer)
        yield buffer
        buffer = bytearray()
        for chunk in csv.gen():
            if sys.version_info > (3,0):
                buffer += chunk.encode("utf-8")
            else:
                buffer += chunk
            if len(buffer) > 200000:
                yield buffer
                buffer = bytearray()
        if len(buffer) > 0:
            yield buffer
    
    @staticmethod
    def _check_export(df_id):
        writelog("Check export: start")
        IPythonExporter.collect_collected()
        writelog("Check export: collect_collected done")
        if df_id in IPythonExporter._internal_map:
            df = IPythonExporter._internal_map[df_id]();
            writelog("Check export: has key true, df is None : %s" % (df is None))
            if df is not None:
                return df.shape
            else:
                return False
        else:
            writelog("Check export has key false")
            return False

    @staticmethod
    def _check_export_stdout(df_id):
        writelog("Checking export to stdout for df %s" % df_id)
        size = IPythonExporter._check_export(df_id)
        sys.stdout.write('%dx%d'%size if size else 'ERROR')

    @staticmethod
    def _run_export(df_id, export_id):
        backend_port = os.getenv('DKU_BACKEND_PORT')
        if IPythonExporter._check_export(df_id):
            df = IPythonExporter._internal_map[df_id]()
            csv = CSVGenerator(df)
            try:
                backend_put_call("jupyter/bind-export?%s"%(export_id),data=IPythonExporter.encode_dataframe(df,csv))
                sys.stdout.write('OK')
            except Exception as e:
                writelog("ERROR: %s" % str(e))
                sys.stdout.write('ERROR %s' % str(e))
            finally:
                csv.shutdown()
                
        else:
            sys.stdout.write('ERROR')
        
orig_to_html = pd.DataFrame._repr_html_
def to_html_with_export(df, *args, **kwargs):
    global orig_to_html
    html = IPythonExporter.generate_export_button(df)
    html += orig_to_html(df,*args,**kwargs)
    return html


SETUP = False

def setup():
    global SETUP
    if not SETUP:
        pd.DataFrame._repr_html_ = to_html_with_export
        SETUP = True
