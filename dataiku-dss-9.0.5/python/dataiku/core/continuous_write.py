import sys, json, time, threading
import logging
import csv

"""
Continuous writing to datasets and streaming endpoints.

This uses a much simpler design than dataset_write" with far fewer
threads and queue involved. As a result, it's less efficient - 
but for the moment, for continuous writing, we're looking more 
at resilience and simplicity
"""

try:
    import Queue
except:
    import queue as Queue

from dataiku.core import dku_pandas_csv, flow, base, schema_handling, dkuio, write_base
import os
from datetime import datetime
from dataiku.core.intercom import jek_or_backend_json_call, jek_or_backend_void_call, jek_or_backend_get_call

if sys.version_info > (3,0):
    from io import StringIO
elif sys.version_info<(2,7,6):
    # Python < 2.7.6 doesn't support writing a bytearray in a cStringIO
    from StringIO import StringIO
else:
    from cStringIO import StringIO

# Send data over HTTP using chunked encoding.
class RemoteStreamWriter(write_base.RemoteStreamWriterBase):

    def __init__(self, session_id, waiter, api):
        super(RemoteStreamWriter, self).__init__(session_id, waiter)
        self.streaming_api = api

        self.start()
        time.sleep(1)

import pprint
MISSING_ID_MARKER = '__not_started__'
# Wrap API call to the streaming API. It is implemented by DatasetWritingService in the backend.
class ContinuousWriteAPI:

    def __init__(self):
        ##if flow.FLOW is None:
        #    self.activity_id = ""
        #else:
        #    self.activity_id = flow.FLOW["currentActivityId"]
        self.activity_id = ""

    def init_write_session(self,request):
        request["activityId"] = self.activity_id
        json_resp = jek_or_backend_json_call("datasets/init-write-session/", data={"request": json.dumps(request)})

        # This call is NOT supposed to fail. We always get a session ID.
        # If the request is invalid, the error must be retrieved by wait_write_session()
        return json_resp.get('id', MISSING_ID_MARKER), json_resp.get('message')

    def wait_write_session(self, id):
        decoded_resp = jek_or_backend_get_call("datasets/wait-write-session/", params={"id": id})
        if decoded_resp["ok"]:
            writtenRows = decoded_resp["writtenRows"]
            print ("%s rows successfully written (%s)" % (writtenRows,id))
        else:
            raise Exception(u'An error occurred during dataset write (%s): %s' % (id, decoded_resp["message"]))

    def push_data_from_generator(self,id,generator):
        jek_or_backend_void_call("datasets/push-data-continuous/", params={"id": id}, data=generator, err_msg="Streaming: push-data call failed")
        # We don't really care about whether this call failed or not.

    def checkpoint_continuous(self, id, state):
        jek_or_backend_void_call("datasets/checkpoint-continuous/", params={"id": id, "newState" : state}, err_msg="Streaming: checkpoint call failed")
        # We don't really care about whether this call failed or not.

    def get_continuous_state(self, id):
        data = jek_or_backend_json_call("datasets/get-continuous-state/", params={"id": id}, err_msg="Streaming: getState call failed")
        return data.get("state", None)

    def close_continuous(self, id, failed):
        jek_or_backend_void_call("datasets/close-continuous/", params={"id": id, "failed": failed}, err_msg="Streaming: close call failed")
        # We don't really care about whether this call failed or not.


class ContinuousWriterBase:
    """
    Handle to write using the continuous write API to a dataset or strealming endpoint.
    Use Dataset.get_continuous_writer() to obtain a DatasetWriter.

    """
    def __init__(self):
        # The HTTP writer thread
        self.remote_writer = None
        self.streaming_api = ContinuousWriteAPI()
        self.data_schema = None
        self.column_names = None
        self.waiter = None
        self.csv_writer = None


    # Initialize the streaming machinery the first time it is called.
    # We cannot do this before because we don't known the schema of the written data before.
    #
    # Subsequent calls will raise an exception is the stream is broken.
    def _start_once(self,data_schema=None):
        # logging.info("Start_once")
        if self.waiter:
            self.waiter.raise_on_failure()

        if not self.waiter:
            if data_schema is not None:
                self.data_schema = data_schema
            else:
                self.data_schema = self.get_schema()

            self.column_names = [
                col["name"]
                for col in self.data_schema
            ]

            logging.info("Initializing write session")
            id, message =self.send_init_request()

            self.session_id = id
            # Initialize a thread which is waiting for the end OR for an error to occur
            self.waiter = write_base.WriteSessionWaiter(id, message, self.streaming_api)
        else:
            # TODO : check data_schema against the previous one ?
            pass

    def _start_single_chunk(self):
        # logging.info("_ssc self=%s remote_writer=%s" % (id(self), self.remote_writer))
        if self.remote_writer is None:
            # Initialize another thread which is in charge of streaming data to the backend
            self.remote_writer = RemoteStreamWriter(self.session_id,self.waiter, self.streaming_api)

    def write_tuple(self, row):
        """Write a single row from a tuple or list of column values.
        Columns must be given in the order of the dataset schema.

        Note: The schema of the dataset MUST be set before using this.

        Encoding note: strings MUST be given as Unicode object. Giving str objects will
        fail.
        """
        self._start_once()
        self._start_single_chunk()
        if not self.csv_writer:
            self.csv_writer = dkuio.new_utf8_csv_writer(self.remote_writer,delimiter=',',quotechar='"',
                                            doublequote=True,lineterminator='\n')
        self.csv_writer.writerow([val if val is not None else "" for val in row])

    def write_row_array(self, row):
        # warnings.warn("Use write_tuple instead", DeprecationWarning)
        self.write_tuple(row)

    def write_row_dict(self, row_dict):
        """
        Write a single row from a dict of column name -> column value.

        Some columns can be omitted, empty values will be inserted instead.

        Note: The schema of the dataset MUST be set before using this.

        Encoding note: strings MUST be given as Unicode object. Giving str objects will
        fail.
        """
        self._start_once()
        self._start_single_chunk()
        if self.column_names is None:
            raise Exception("To write as a dict, you need to define the"
                            "output dataset schema beforehands.")
        out = [
            row_dict.get(column_name, "")
            for column_name in self.column_names
        ]
        self.write_tuple(out)

    def write_dataframe(self,df):
        """Appends a Pandas dataframe to the dataset being written.

        This method can be called multiple times (especially when you have been
        using iter_dataframes to read from an input dataset)

        Encoding node: strings MUST be in the dataframe as UTF-8 encoded str objects.
        Using unicode objects will fail.
        """
        self._start_once(schema_handling.get_schema_from_df(df))
        self._start_single_chunk()
        dku_pandas_csv.DKUCSVFormatter(df, self.remote_writer,
                                       index=None, header=False, sep=',',
                                       quoting=csv.QUOTE_MINIMAL,).save()

    def flush(self):
        if self.remote_writer is not None:
            self.remote_writer.flush()

    def checkpoint(self, state):
        logging.info("Checkpointing")
        self._start_once()
        self._start_single_chunk()
        self.remote_writer.flush()
        self.remote_writer.close()
        self.remote_writer = None        
        self.csv_writer = None

        logging.info("RW closed")
        try:
            self.streaming_api.checkpoint_continuous(self.session_id, state)
        except Exception as e:
            logging.exception("Failed to checkpoint")
            raise e
        logging.info("REMOVE REMOTE_WRITER self=%s" % (id(self)))

    def get_state(self):
        logging.info("Getting state")
        self._start_once()
        self._start_single_chunk() # otherwise the backend opens a session and waits on it, but may never get a closed push-data call to detect if the process died
        try:
            return self.streaming_api.get_continuous_state(self.session_id)
        except Exception as e:
            logging.exception("Failed to get state")
            raise e

    def close(self, failed):
        """Closes this dataset writer"""
        logging.info("Closing Dataset Continuous Writer")
        self._start_once()
        self._start_single_chunk() # otherwise INITIALIZED -> SUCCESS invalid state transition in backend
        if self.remote_writer is not None:
            self.remote_writer.flush()
            self.remote_writer.close()
            self.remote_writer = None
            self.csv_writer = None

        self.streaming_api.close_continuous(self.session_id, failed)
        self.waiter.wait_end()

    def __enter__(self,):
        return self

    def __exit__(self, error_type, value, traceback):
        logging.info("Closing with error %s" % error_type)
        self.close(error_type is not None)

class DatasetContinuousWriter(ContinuousWriterBase):
    def __init__ (self, dataset, source_id, split_id=0):
        logging.info("Initializing continuous writer for dataset %s" % dataset.full_name)
        ContinuousWriterBase.__init__(self)
        self.dataset = dataset
        self.source_id = source_id
        self.split_id = split_id
        self.writePartition = dataset.writePartition if dataset.writePartition else ""

    def send_init_request(self):
        return self.streaming_api.init_write_session({
                "targetType" : "DATASET",
                "dataSchema": {
                    "userModified": False,
                    "columns": self.data_schema
                },
                "method":"STREAM_CONTINUOUS",
                "partitionSpec":self.writePartition,
                "fullDatasetName":self.dataset.full_name,
                "writeMode" : "APPEND",
                "sourceId" : self.source_id,
                "splitId": self.split_id
            })
    def get_schema(self):
        return self.dataset.read_schema()

class StreamingEndpointContinuousWriter(ContinuousWriterBase):
    def __init__ (self, streaming_endpoint):
        logging.info("Initializing continuous writer for streaming_endpoint %s" % streaming_endpoint.full_name)
        ContinuousWriterBase.__init__(self)
        self.streaming_endpoint = streaming_endpoint

    def send_init_request(self):
        return self.streaming_api.init_write_session({
                "targetType" : "STREAMING_ENDPOINT",
                "dataSchema": {
                    "userModified": False,
                    "columns": self.data_schema
                },
                "method":"STREAM_CONTINUOUS",
                
                "fullStreamingEndpointId":self.streaming_endpoint.full_name,
                "writeMode" : "APPEND"
            })

    def get_schema(self):
        return self.streaming_endpoint.get_schema() #[{"name" : "count", "type": "int"}, {"name": "total", "type": "string"}, {"name": "visible", "type":"string"}]
