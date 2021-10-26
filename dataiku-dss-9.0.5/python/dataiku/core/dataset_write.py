import sys, json, time, threading
import logging
import csv

try:
    import Queue
except:
    import queue as Queue

from dataiku.core import flow, base, schema_handling, dkuio
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

logger = logging.getLogger(__name__)

class TimeoutExpired(Exception):
    pass


class TimeoutableQueue(Queue.Queue):
    def __init__(self,size):
        Queue.Queue.__init__(self,size)

    # Return when :
    # - The queue is empty
    # - The timeout expired (without raising!)
    def join_with_timeout(self, timeout):
        self.all_tasks_done.acquire()
        try:
            endtime = time.time() + timeout
            while self.unfinished_tasks:
                remaining = endtime - time.time()
                if remaining <= 0.0:
                    raise TimeoutExpired
                self.all_tasks_done.wait(remaining)
        finally:
            self.all_tasks_done.release()

try:
    from io import BytesIO
except:
    pass


# Send data over HTTP using chunked encoding.
class RemoteStreamWriter(threading.Thread):

    def __init__(self,id,waiter):
        self.id = id
        self.error_message = None
        self.waiter = waiter
        self.chunk_queue_size = 10
        self.chunk_size = 5000000 # 5MN seems to be the best (both 1MB & 10MB are slower)
        self.queue = TimeoutableQueue(self.chunk_queue_size)

        if sys.version_info > (3,0):
            self.buffer = BytesIO()
        else:
            self.buffer = StringIO()
        self.end_mark = self
        self.streaming_api = StreamingAPI()
        threading.Thread.__init__(self)
        self.daemon = True
        logger.info("Starting RemoteStreamWriter")
        self.start()

    def _check_health(self):
        if self.error_message:
            raise Exception(self.error_message)
        if not self.queue:
            raise Exception("Stream has been closed")

    def read(self):
        raise Exception("Don't call me baby")

    def flush(self):
        self._check_health()
        if self.buffer.tell()>0:
            self.queue.put(self.buffer.getvalue())
            if sys.version_info > (3,0):
                self.buffer = BytesIO()
            else:
                self.buffer = StringIO()

        while True:
            q = self.queue
            if not q:
                break
            try:
                q.join_with_timeout(1000)
                break
            except TimeoutExpired:
                continue

        if self.error_message:
            raise Exception(self.error_message)

    def write(self, data):
        # logger.info("Remote Stream Writer writes: %s" % data)
        self._check_health()
        self.buffer.write(data)
        if self.buffer.tell() > self.chunk_size:
            self.flush()

    def close(self):
        logger.info("Remote Stream Writer closed")
        self._check_health()
        self.queue.put(self.end_mark)
        self.flush()
        if self.error_message:
            raise Exception(self.error_message)

    def _generate(self):
        logger.info("Remote Stream Writer: start generate")
        while True:
            if not self.waiter.is_still_alive():
                logger.info("Write session has been interrupted")
                return
            logger.info("Waiting for data to send ...")
            try:
                item = self.queue.get(True,10)
            except Queue.Empty:
                # no, no ! empty chunks are forbidden by the HTTP spec  !
                #yield ''
                logger.info("No data to send, waiting more...")
                continue
            if item is self.end_mark:
                logger.info("Got end mark, ending send")
                break
            else:
                logger.info("Sending data (%s)" % len(item))
                yield item
                self.queue.task_done()

    def run(self):
        try:
            logger.info("Initializing write data stream (%s)" % self.id)
            self.streaming_api.push_data(self.id,self._generate())
            self.queue.task_done()
        except Exception as e:
            logger.exception("RemoteStreamWriter thread failed")
            self.error_message = 'Error : %s'%e
        finally:
            self.queue = None


import pprint
MISSING_ID_MARKER = '__not_started__'
# Wrap API call to the streaming API. It is implemented by DatasetWritingService in the backend.
class StreamingAPI:

    def __init__(self):
        if flow.FLOW is None:
            self.activity_id = ""
        else:
            self.activity_id = flow.FLOW.get("currentActivityId", "") # will be missing in CAK

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

    def push_data(self,id,generator):
        jek_or_backend_void_call("datasets/push-data/", params={"id": id}, data=generator, err_msg="Streaming: push-data call failed")
        # We don't really care about whether this call failed or not.


# Create a thread which is waiting for the streaming session to complete.
class WriteSessionWaiter(threading.Thread):
    def __init__(self,session_id, session_init_message):
        self.session_id = session_id
        self.session_init_message = session_init_message
        self.exception_type = None
        self.alive = True
        self.streaming_api = StreamingAPI()
        threading.Thread.__init__(self)
        self.daemon = True
        self.start()

    def raise_on_failure(self):
        if self.exception_type is not None:
            if (sys.version_info > (3, 0)):
                raise self.exception
            else:
                exec("raise self.exception_type, self.exception, self.traceback")

    def is_still_alive(self):
        return self.alive

    def wait_end(self):
        self.join()
        self.raise_on_failure()

    def run(self):
        try:
            if self.session_id == MISSING_ID_MARKER and self.session_init_message is not None:
                raise Exception(u'An error occurred while starting the writing to the dataset : %s' % self.session_init_message)
            self.streaming_api.wait_write_session(self.session_id)
        except Exception as e:
            logger.exception("Exception caught while writing")
            self.exception_type, self.exception, self.traceback = sys.exc_info()
        finally:
            self.alive = False


class FakeDatasetWriter:
    """For tests only"""

    def __init__(self,dataset):
        self.path = osp.join(os.getenv("FLOW_FAKE_WRITER_ROOT"), dataset.name + ".csv")
        self.fwriter = open(self.path, "w")

    def write_dataframe(self,df):
        from dataiku.core import dku_pandas_csv
        dku_pandas_csv.DKUCSVFormatter(df, self.remote_writer,
                                       index=None, header=False, sep=',',
                                       quoting=csv.QUOTE_ALL,).save()

    def __enter__(self,):
        return self

    def __exit__(self, type, value, traceback):
        self.fwriter.close()


class DatasetWriter:
    """Handle to write to a dataset. Use Dataset.get_writer() to obtain a DatasetWriter.

    Very important: a DatasetWriter MUST be closed after usage. Failure to close a
    DatasetWriter will lead to incomplete or no data being written to the output dataset
    """

    active_writers = dict()

    @staticmethod
    def atexit_handler():
        tobeclosed = []
        if sys.version_info > (3,0):
            for k,v in DatasetWriter.active_writers.items():
                print ('WARNING : A dataset writer MUST be closed (%s)'%k)
                tobeclosed+=[v]
        else:
            for k in DatasetWriter.active_writers:
                v = DatasetWriter.active_writers[k]
                print ('WARNING : A dataset writer MUST be closed (%s)'%k)
                tobeclosed+=[v]
        DatasetWriter.active_writers = dict()
        for v in tobeclosed:
            v.close()

    def __init__(self,dataset):

        logger.info("Initializing dataset writer for dataset %s" % dataset.full_name)

        if DatasetWriter.active_writers.get(dataset.full_name):
            raise Exception('Unable to instanciate a new dataset writer. There is already another active writer for this dataset (%s).'%dataset.full_name)

        # The HTTP writer thread
        self.remote_writer = None

        self.streaming_api = StreamingAPI()

        # Copy the target partition ID so it can't be changed
        self.writePartition = dataset.writePartition if dataset.writePartition else ""

        # Dataset object
        self.dataset = dataset

        # By default, data schema == dataset schema
        self.data_schema = None

        # Column names
        self.column_names = None

        # Waiter thread
        self.waiter = None

        # CSV writer used for writing individual rows
        self.csv_writer = None

        # Register itself as active writer
        DatasetWriter.active_writers[dataset.full_name]= self

    # Initialize the streaming machinery the first time it is called.
    # We cannot do this before because we don't known the schema of the written data before.
    #
    # Subsequent calls will raise an exception is the stream is broken.
    def _start_once(self,data_schema=None):
        if self.waiter:
            self.waiter.raise_on_failure()

        if not self.remote_writer:
            if data_schema is not None:
                self.data_schema = data_schema
            else:
                self.data_schema = self.dataset.read_schema()

            self.column_names = [
                col["name"]
                for col in self.data_schema
            ]

            logger.info("Initializing write session")
            id, message = self.streaming_api.init_write_session({
                "dataSchema": {
                    "userModified": False,
                    "columns": self.data_schema
                },
                "method":"STREAM",
                "partitionSpec":self.writePartition,
                "fullDatasetName":self.dataset.full_name,
                "writeMode" : (self.dataset.spec_item["appendMode"] and "APPEND" or "OVERWRITE")
            })
            # Initialize a thread which is waiting for the end OR for an error to occur
            self.waiter = WriteSessionWaiter(id, message)

            # Initialize another thread which is in charge of streaming data to the backend
            self.remote_writer = RemoteStreamWriter(id,self.waiter)
        else:
            # TODO : check data_schema against the previous one ?
            pass


    def write_tuple(self, row):
        """Write a single row from a tuple or list of column values.
        Columns must be given in the order of the dataset schema.

        Note: The schema of the dataset MUST be set before using this.

        Encoding note: strings MUST be given as Unicode object. Giving str objects will
        fail.
        """
        self._start_once()
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
        from dataiku.core import dku_pandas_csv
        dku_pandas_csv.DKUCSVFormatter(df, self.remote_writer,
                                       index=None, header=False, sep=',',
                                       quoting=csv.QUOTE_ALL,).save()

    def close(self):
        """Closes this dataset writer"""
        if DatasetWriter.active_writers.get(self.dataset.full_name) == self:
            del DatasetWriter.active_writers[self.dataset.full_name]

        self._start_once()
        self.remote_writer.flush()
        self.remote_writer.close()
        self.waiter.wait_end()

    def __enter__(self,):
        return self

    def __exit__(self, type, value, traceback):
        self.close()
