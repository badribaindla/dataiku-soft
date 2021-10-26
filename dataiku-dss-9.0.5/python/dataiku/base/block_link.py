# coding: utf-8
from __future__ import unicode_literals

import os

from dataiku.core import dkujson
import logging
import pickle
import struct
import warnings
from io import RawIOBase

import six

"""
This module implements a block-based communication protocol which allows data to be sent (and received) over a stream

The block link protocol extends the previously existing JavaLink protocol and:
- Add support for sending arbitrary Python objects
- Add support for sending several streams (sequentially)
- Can be used with any file-like stream (socket, etc)

Serialization strategy is strongly inspired from the Dask.distributed (ie. dynamically delegate to different
serializers) but serialization layout is much simpler and (likely) less efficient. Like Dask, serialization
is delegated to cloudpickle by default and this behavior can be overriden with custom serializers.

* Supported object types:
- list, tuple, dict
- numpy.ndarray
- scipy.sparse.csr_matrix
- Python classes decorated by @register_as_serializable
- Python classes associated to a custom serialized (via @register_as_serializer_for_class)
- Anything else is serialized by cloudpickle. Nested properties of objects serialized by cloudpickle are also
serialized by cloudpickle (there is no "hook" mechanism). Note that cloudpickle should "always work", but it may be
slow and crash on large objects

* Note about Python's pickle:
- Python < 3: pickle is brittle with >2GB and broken if >4GB: custom serializers are mandatory
- Python >= 3.8 (with pickle protocol 5) has efficient pickling of large-objects (zero copy & out-of-band buffers):
    in the future, we will be able to remove all custom serializers

* Classes in this file are not thread-safe: make sure only one thread interacts with the link
"""

_SERIALIZERS = {}

logger = logging.getLogger(__name__)


class LargePickledObjectWarning(RuntimeWarning):
    LARGE_OBJECT_THRESHOLD = 50000000


class BlockOutput(object):
    def __init__(self, output_stream):
        """
        This 'output_stream' only needs to implement write()
        """
        self.output_stream = output_stream
        self.bytes_written = 0

    def send_block(self, block):
        if block is None:
            self.send_int(0)
        else:
            self.send_int(len(block))
            self._send_raw_bytes(block)

    def send_int(self, value):
        self._send_raw_bytes(struct.pack(b'>i', value))

    def _send_raw_bytes(self, data):
        self.output_stream.write(data)
        self.bytes_written += len(data)

    def send_json(self, o, cls=None):
        self.send_string(dkujson.dumps(o, cls=cls))

    def send_string(self, str_val):
        """
        Send a UTF-8 encoded string
        """
        if isinstance(str_val, six.text_type):
            str_val = str_val.encode("utf-8")
        self.send_block(str_val)

    def send_stream(self, block_size=1024 * 1024):
        return _BlockOutputStream(self, block_size)

    def send_pyobject(self, obj):
        """
        Send a Python object which is going to be read by read_pyobject() on the other end

        Return the number of bytes written

        Protocol:
          - If there exits a custom serializer for object's class:
              1. Send a block containing a pickled deserializer
              2. Send stream of data produced by custom serializer
          - If there is no custom serializer for object's class:
              1. Send an empty block
              2. Send stream of data produced by cloudpickle
        """
        bytes_written_before = self.bytes_written
        serializer = _SERIALIZERS.get(obj.__class__)

        if serializer:
            # Custom serializer exist, use it
            self.send_block(pickle.dumps(serializer, protocol=pickle.HIGHEST_PROTOCOL))
            serializer_fn = serializer.serialize
        else:
            # Cloudpickle fallback
            import cloudpickle
            self.send_block(None)
            serializer_fn = cloudpickle.dump

        with self.send_stream() as payload_stream:
            serializer_fn(obj, payload_stream)

        serialized_object_size = self.bytes_written - bytes_written_before
        if not serializer and serialized_object_size >= LargePickledObjectWarning.LARGE_OBJECT_THRESHOLD:
            warnings.warn(LargePickledObjectWarning(
                "Large (%s bytes > %s) instance of %s has been serialized by cloudpickle (because no custom serializer "
                "was registered). Consider creating a custom serializer since pickle may have issues with large objects"
                "depending on Python's version" %
                (serialized_object_size, LargePickledObjectWarning.LARGE_OBJECT_THRESHOLD, obj.__class__.__name__))
            )
        return serialized_object_size


class BlockInput(object):
    def __init__(self, input_stream):
        """
        This 'input_stream' only needs to implement read()
        """
        self.input_stream = input_stream
        self.bytes_read = 0

    def read_int(self):
        return struct.unpack(b'>i', self._read_raw_bytes(4))[0]

    def read_string(self):
        """
        Read a string
        """
        data = self.read_block()
        if six.text_type == str:
            data = data.decode('utf-8')  # Python 3
        return data

    def read_block(self):
        """
        Get the next block from the backend

        Returns None if the block is empty
        """
        length = self.read_int()
        if length == 0:
            return None
        else:
            return self._read_raw_bytes(length)

    def _read_raw_bytes(self, length):
        """
        Read exactly 'length' bytes or raise EOFError
        """
        received_bytes = 0
        chunks = []
        while received_bytes < length:
            chunk = self.input_stream.read(length - received_bytes)
            chunk_size = len(chunk)
            if chunk_size == 0:
                raise EOFError('Could not read data (end of stream)')
            received_bytes += chunk_size
            chunks.append(chunk)
        self.bytes_read += received_bytes
        return b''.join(chunks)

    def read_json(self):
        b = self.read_block()
        if b is None:
            return None
        return dkujson.loads(b.decode("utf-8"))

    def read_pyobject(self):
        """
        Read a Python object written by send_pyobject()
        """
        deserializer_block = self.read_block()
        if deserializer_block is not None:
            deserializer_fn = pickle.loads(deserializer_block).deserialize
        else:
            import cloudpickle
            deserializer_fn = cloudpickle.load

        with self.read_stream() as payload_stream:
            return deserializer_fn(payload_stream)

    def read_stream(self):
        return _BlockInputStream(self)


class _BlockOutputStream(RawIOBase):
    def __init__(self, block_output, block_size):
        self.block_output = block_output
        self.block_size = block_size
        self.buffer = bytearray()
        self.finished = False

    def writable(self):
        return True

    def write(self, b):
        assert not self.finished

        if len(b) > 0:
            self.buffer += bytearray(b)
            if len(self.buffer) >= self.block_size:
                self.flush()

    def flush(self):
        assert not self.finished

        if len(self.buffer) > 0:
            self.block_output.send_block(self.buffer)
            self.buffer = bytearray()

    def close(self):
        if not self.finished:
            self.flush()
            self.block_output.send_block(None)
            self.finished = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class _BlockInputStream(RawIOBase):
    def __init__(self, block_input):
        self.block_input = block_input
        self.current_block = None
        self.used = 0
        self.total_used = 0
        self.reached_eof = False

    def readable(self):
        return True

    def next_block(self):
        if self.reached_eof:
            return None
        self.current_block = self.block_input.read_block()
        self.used = 0

    def readinto(self, b):
        """
        This method is called by RawIOBase.read()
        """
        n = len(b)
        if n == 0:
            return 0
        if self.current_block is None or self.used >= len(self.current_block):
            self.next_block()
        # eof
        if self.current_block is None:
            self.reached_eof = True
            return 0
        pos = self.used
        left = len(self.current_block) - pos
        l = min(n, left)
        self.used = self.used + l
        self.total_used = self.total_used + l
        b[0:l] = self.current_block[pos:pos + l]
        return l

    def _readexactly(self, length):
        """
        Read exactly 'length' bytes or raise EOFError
        """
        received_bytes = 0
        chunks = []
        while received_bytes < length:
            chunk = self.read(length - received_bytes)
            chunk_size = len(chunk)
            if chunk_size == 0:
                raise EOFError('Could not read data (end of stream)')
            received_bytes += chunk_size
            chunks.append(chunk)
        return b''.join(chunks)

    def seek(self, seek, whence=os.SEEK_SET):
        if whence == os.SEEK_SET:
            to_skip = seek - self.total_used
        elif whence == os.SEEK_CUR:
            to_skip = seek
        else:
            raise IOError("Unsupported seek mode")

        if to_skip < 0:
            raise IOError("Only forward seeking is supported")
        elif to_skip > 0:
            self._readexactly(to_skip)

    def __enter__(self):
        return self

    def close(self):
        if not self.reached_eof:
            self.read(-1)  # Consume the whole stream

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class AbstractSerializer(object):
    def serialize(self, obj, output_stream):
        """
        Serialize to stream

        A good implementation should write the stream on-the-fly and should not create intermediate data copies
        """
        raise NotImplementedError

    def deserialize(self, input_stream):
        """
        Deserialize from stream

        A good implementation should deserialize the object on-the-fly and should not buffer the whole object's data
        in memory
        """
        raise NotImplementedError


def register_as_serializer_for_class(*classes):
    """
    Register a serializer for one or multiple classes
    """

    def func(serializer_cls):
        assert issubclass(serializer_cls, AbstractSerializer)

        for cls in classes:
            assert cls not in _SERIALIZERS
            _SERIALIZERS[cls] = serializer_cls()
        return serializer_cls

    return func


def register_as_serializable(cls, should_disallow_pickle=True):
    """
    Decorate a class and register a generic Python object serializer for it.
    This generic serializer works by serializing each entry of obj.__dict__ with the most appropriate serializer.

    By default, regular Python objects are deeply-serialized by cloudpickle
    (and we can't control how individual properties are serialized in this case)

    Use this when some of class's properties needs to use a custom serializer.
    """
    register_as_serializer_for_class(cls)(ObjectDictSerializer)
    if should_disallow_pickle:
        disallow_pickle(cls)
    return cls


def disallow_pickle(cls):
    """
    Make a class non-picklable
    """

    def fail(*_):
        raise TypeError(
            'Pickling an %s object is disallowed because a custom serializer is defined for this class. '
            'It (likely) means this object is contained in another object which is not custom-serializable, '
            'and which has been serialized by pickle/cloudpickle. '
            'To fix this error, register a custom serializer for the parent object'
            '' % cls.__name__
        )

    setattr(cls, '__reduce_ex__', fail)
    return cls


try:
    import numpy
    import numpy.lib.format


    @register_as_serializer_for_class(numpy.ndarray)
    class NumpyArraySerializer(AbstractSerializer):
        """
        Efficiently serialize numpy arrays
        """

        def serialize(self, arr, output_stream):
            return numpy.lib.format.write_array(output_stream, arr, allow_pickle=True)

        def deserialize(self, input_stream):
            return numpy.lib.format.read_array(input_stream, allow_pickle=True)


except ImportError as e:
    logger.info("Did not register NumpyArraySerializer (%s)" % e)

try:
    import scipy.sparse


    @register_as_serializer_for_class(scipy.sparse.csr_matrix)
    class ScipyCSRSerializer(AbstractSerializer):
        """
        Efficiently serialize CSR
        """

        def serialize(self, obj, output_stream):
            block_output = BlockOutput(output_stream)
            block_output.send_pyobject(obj.shape)  # tuple
            block_output.send_pyobject(obj.indices)  # Numpy array
            block_output.send_pyobject(obj.indptr)  # Numpy array
            block_output.send_pyobject(obj.data)  # Numpy array

        def deserialize(self, input_stream):
            block_input = BlockInput(input_stream)
            shape = block_input.read_pyobject()
            indices = block_input.read_pyobject()
            indptr = block_input.read_pyobject()
            data = block_input.read_pyobject()
            return scipy.sparse.csr_matrix((data, indices, indptr), shape)

except ImportError as e:
    logger.info("Did not register ScipyCSRSerializer (%s)" % e)

try:
    import pandas


    @register_as_serializer_for_class(pandas.Series, pandas.DataFrame)
    class PandasSerializer(AbstractSerializer):
        """
        Serialize Pandas series

        Delegates to pickle (cloudpickle is slower than pickle). Note that it is subject to the various
        limitations of pickle w.r.t. large objects (Python 2), but it is non-trivial to deal with all
        of pandas's internals
        """

        def serialize(self, series, output_stream):
            return pickle.dump(series, output_stream, protocol=pickle.HIGHEST_PROTOCOL)

        def deserialize(self, input_stream):
            return pickle.load(input_stream)

except ImportError as e:
    logger.info("Did not register PandasSerializer (%s)" % e)


@register_as_serializer_for_class(dict)
class ObjectDictSerializer(AbstractSerializer):
    """
    Serialize Python dicts and also Python objects (via their __dict__)

    Goal of this serializer is to be able to use custom serializers for the nested objects

    Strongly inspired from Dask's ObjectDictSerializer
    """

    OBJECT_FLAG = 1
    DICT_FLAG = 2

    def serialize(self, obj, output_stream):
        block_output = BlockOutput(output_stream)

        if isinstance(obj, dict):
            serialized_dict = obj
            block_output.send_int(self.DICT_FLAG)
        else:
            serialized_dict = obj.__dict__
            block_output.send_int(self.OBJECT_FLAG)
            block_output.send_pyobject(obj.__class__)

        block_output.send_int(len(serialized_dict))
        for key, value in six.iteritems(serialized_dict):
            block_output.send_pyobject(key)
            block_output.send_pyobject(value)

    def deserialize(self, input_stream):
        block_input = BlockInput(input_stream)
        type_flag = block_input.read_int()

        if type_flag == self.DICT_FLAG:
            obj = deserialized_dict = {}
        elif type_flag == self.OBJECT_FLAG:
            cls = block_input.read_pyobject()
            obj = object.__new__(cls)
            deserialized_dict = obj.__dict__
        else:
            raise RuntimeError("Unrecognized flag %s" % type_flag)

        length = block_input.read_int()
        for _ in range(length):
            key = block_input.read_pyobject()
            value = block_input.read_pyobject()
            deserialized_dict[key] = value

        return obj


@register_as_serializer_for_class(list, tuple)
class TupleListSerializer(AbstractSerializer):
    """
    Serialize lists and tuples

    Goal of this serializer is to be able to use custom serializers for the nested objects
    """

    TUPLE_FLAG = 1
    LIST_FLAG = 2

    def serialize(self, obj, output_stream):
        block_output = BlockOutput(output_stream)
        block_output.send_int(len(obj))
        if isinstance(obj, tuple):
            block_output.send_int(self.TUPLE_FLAG)
        elif isinstance(obj, list):
            block_output.send_int(self.LIST_FLAG)
        else:
            raise RuntimeError("Unsupported type: %s" % obj.__class__)

        for item in obj:
            block_output.send_pyobject(item)

    def deserialize(self, input_stream):
        block_input = BlockInput(input_stream)
        length = block_input.read_int()
        type_flag = block_input.read_int()
        items = [block_input.read_pyobject() for _ in range(length)]
        if type_flag == self.TUPLE_FLAG:
            return tuple(items)
        elif type_flag == self.LIST_FLAG:
            return items

        raise RuntimeError("Unrecognized flag %s" % type_flag)
