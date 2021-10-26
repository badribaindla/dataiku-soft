import csv, sys
from datetime import datetime
import time
try:
    import Queue
except:
    import queue as Queue
import threading
import logging
import sys

# See https://docs.python.org/2/library/csv.html
class Python2UTF8CSVReader:
    """
    A CSV reader which will iterate over lines in the CSV file-like binary object "f",
    which is encoded in UTF-8.
    """

    def __init__(self, f, **kwds):
        self.reader = csv.reader(f, **kwds)

    def next(self):
        row = next(self.reader)
        return [unicode(s, "utf-8") for s in row]

    def __next__(self):
        row = next(self.reader)
        return [unicode(s, "utf-8") for s in row]

    def __iter__(self):
        return self

class Python3UTF8CSVReader:
    """
    A CSV reader which will iterate over lines in the CSV file-like binary object "f",
    which is encoded in UTF-8.
    """

    def __init__(self, f, **kwds):
        import codecs
        textf = codecs.getreader("utf-8")(f)
        self.reader = csv.reader(textf, **kwds)

    def __next__(self):
        return next(self.reader)

    def __iter__(self):
        return self

def new_utf8_csv_reader(f, **kwargs):
    if sys.version_info > (3,0):
        return Python3UTF8CSVReader(f, **kwargs)
    else:
        #z = Python2UTF8CSVReader(f, **kwargs)
        #for row in z:
        #    print(row)
        return Python2UTF8CSVReader(f, **kwargs)

def new_utf8_stream(f):
    if sys.version_info > (3,0):
        import codecs
        return codecs.getreader("utf-8")(f)
    else:
        return f


class Python2UTF8CSVWriter:
    """
    A CSV writer which will write rows to binary CSV file "f",
    encoded in UTF-8.

    It also encodes dates
    """

    def __init__(self, f, **kwds):
        self.writer = csv.writer(f, **kwds)

    def writerow(self, row):
        self.writer.writerow([
            s.isoformat() if (isinstance(s, datetime) and s.tzinfo is not None) else unicode(s).encode("utf-8")
            for s in row
        ])

    def writerows(self, rows):
        for row in rows:
            self.writerow(row)


class Python3UTF8CSVWriter:
    """
    A CSV writer which will write rows to binary CSV file "f",
    encoded in UTF-8.

    It also encodes dates
    """

    def __init__(self, f, **kwds):
        import codecs
        bwriter = codecs.getwriter("utf8")(f)
        self.writer = csv.writer(bwriter, **kwds)

    def writerow(self, row):
        self.writer.writerow([
            s.isoformat() if (isinstance(s, datetime) and s.tzinfo is not None) else s
            for s in row
        ])

    def writerows(self, rows):
        for row in rows:
            self.writerow(row)


def new_utf8_csv_writer(f, **kwargs):
    if sys.version_info > (3,0):
        return Python3UTF8CSVWriter(f, **kwargs)
    else:
        return Python2UTF8CSVWriter(f, **kwargs)

def new_bytesoriented_io(data=None):
    thetype = None
    if sys.version_info > (3,0):
        from io import BytesIO
        thetype = BytesIO
    elif sys.version_info<(2,7,6):
        # Python < 2.7.6 doesn't support writing a bytearray in a cStringIO
        from StringIO import StringIO
        thetype =  StringIO
    else:
        from cStringIO import StringIO
        thetype = StringIO

    if data is None:
        return thetype()
    else:
        return thetype(data)
        

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
            
class PipeToGeneratorThread(threading.Thread):

    def __init__(self, id, consumer):
        self.id = id
        self.consumer = consumer
        self.error_message = None
        self.chunk_queue_size = 10
        self.chunk_size = 5000000 # 5MN seems to be the best (both 1MB & 10MB are slower)
        self.queue = TimeoutableQueue(self.chunk_queue_size)

        self.new_buffer()
        self.end_mark = self

        threading.Thread.__init__(self)
        self.daemon = True
        logging.info("Starting Pipe to generator thread")
        self.start()
        
    def new_buffer(self):
        self.buffer = new_bytesoriented_io()

    def _check_error(self):
        if self.error_message:
            raise Exception(self.error_message)

    def _check_health(self):
        self._check_error()
        if not self.queue:
            raise Exception("Pipe to generator thread has been closed")

    def flush(self):
        self._check_health()
        if self.buffer.tell()>0:
            self.queue.put(self.buffer.getvalue())
            self.new_buffer()

        while True:
            q = self.queue
            if not q:
                break
            try:
                q.join_with_timeout(1000)
                break
            except TimeoutExpired:
                continue

    def write(self, data):
        # logging.info("Pipe to generator thread writes: %s" % data)
        self._check_health()
        self.buffer.write(data)
        if self.buffer.tell() > self.chunk_size:
            self.flush()

    def close(self):
        logging.info("Pipe to generator thread closed")
        self._check_health()
        self.flush()
        self.queue.put(self.end_mark)
        
    def wait_for_completion(self):
        if self.queue is not None:
            self.queue.join()
        self._check_error()

    def _generate(self):
        logging.info("Pipe to generator thread: start generate")
        while True:
            logging.info("Waiting for data to send ...")
            try:
                item = self.queue.get(True, 10)
            except Queue.Empty:
                logging.info("No data to send, waiting more...")
                continue
            if item is self.end_mark:
                logging.info("Got end mark, ending send")
                break
            else:
                logging.info("Sending data (%s)" % len(item))
                yield item
                self.queue.task_done()

    def run(self):
        try:
            logging.info("Initializing Pipe to generator thread (%s)" % self.id)
            self.consumer(self._generate())
        except Exception as e:
            logging.exception("Pipe to generator thread failed")
            self.error_message = 'Error : %s'%e
        finally:
            self.queue.task_done()
            self.queue = None
            logging.info('Exit Pipe to generator thread')            
        