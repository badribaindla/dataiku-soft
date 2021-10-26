# encoding: utf-8

from dataiku.base.utils import check_base_package_version
import json, os, sys, csv, time
from os import path as osp
import atexit
import warnings
import numpy as np
import threading
import struct
import threading, logging
from datetime import datetime

# Module code
from dataiku.core import flow, base, schema_handling, dku_pandas_csv, dkuio, dataset
from dataiku.core.platform_exec import read_dku_json
from dataiku.core.dkujson import dump_to_filepath, load_from_filepath
from dataiku.core import intercom, continuous_write
from dataiku.core import default_project_key

class StreamingEndpointStream(object):
    def __init__(self, streaming_endpoint, previous_state, columns):
        self.streaming_endpoint = streaming_endpoint
        self.columns = columns
        
        self.started = False
        self.stream = None
        self.utf8_steam = None
        self.current_state = None
        if previous_state is not None:
            self.current_state = previous_state
        
    def _start_once(self):
        if self.started:
            return
        settings = {'columns':self.columns, 'previousState':self.current_state}
        data = {'projectKey':self.streaming_endpoint.project_key, 'name':self.streaming_endpoint.id, 'settings':json.dumps(settings)}
        self.stream = intercom.jek_or_backend_stream_call("streaming-endpoints/read-data/", data=data, err_msg="Failed to read streaming endpoint data")
        self.utf8_stream = dkuio.new_utf8_stream(self.stream)
        self.started = True
        
    def __iter__(self):
        return self

    def _advance(self):
        self._start_once()
        line = self.utf8_stream.readline()
        if line is None or len(line) == 0:
            raise StopIteration()
        if line.startswith("state:"):
            self.current_state = line[6:]
            return None
        if line.startswith("record:"):
            return line[7:]
        else:
            raise Exception('Unexpected format for message line %s' % line)
    
    def next(self):
        return self.__next__()
    
    def __next__(self):
        record = None
        while record is None:
            record = self._advance()
        return json.loads(record)
        
    def get_state(self):
        return self.current_state
        
class StreamingEndpoint(object):
    """
    This is a handle to obtain readers and writers on a dataiku streaming endpoint.
    """
    def __init__(self, id, project_key=None):
        self.id = id
        if "." not in id:
            try:
                self.project_key = project_key or default_project_key()
                self.short_name = id
                self.name = self.project_key + "." + id
            except:
                raise Exception("Dataset %s is specified with a relative name, "
                                "but no default project was found. Please use complete name" % self.id)
        else:
            # use gave a full name
            (self.project_key, self.short_name) = self.id.split(".", 1)
            if project_key is not None and self.project_key != project_key:
                raise ValueError("Project key %s incompatible with fullname dataset %s." % (project_key, id))
        self.readable = True
        self.writable = True
        self.full_name ="%s.%s" % (self.project_key, self.short_name)
        self.location_info = None
        self.cols = None

    def get_location_info(self, sensitive_info=False):
        if self.location_info is None:
            self.location_info = intercom.jek_or_backend_json_call("streaming-endpoints/get-info", data={
                    "projectKey": self.project_key,
                    "id" : self.id,
                    "sensitiveInfo" : sensitive_info
                }, err_msg="Failed to get the streaming endpoint location info")
        return self.location_info

    def get_schema(self, raise_if_empty=True):
        """Gets the schema of this streaming endpoint, as an array of objects like this one:
        { 'type': 'string', 'name': 'foo', 'maxLength': 1000 }.
        There is more information for the map, array and object types.
        """
        if self.cols is None:
            self.cols = intercom.jek_or_backend_json_call("streaming-endpoints/get-schema", data={
                    "streamingEndpointFullId": self.full_name
            }, err_msg='Unable to fetch schema for %s'%(self.name)).get("columns")

        if raise_if_empty and len(self.cols) == 0:
            raise Exception(
                "No column in schema of %s."
                " Have you set up the schema for this streaming endpoint?" % self.name)
        return dataset.Schema(self.cols,)

    def set_schema(self, columns):
        """Sets the schema of this streaming endpoint"""
        for column in columns:
            if "type" not in column:
                raise Exception("Columns %s has no attribute type" % str(column))
            if "name" not in column:
                raise Exception("Columns %s has no attribute name" % str(column))
            if not isinstance(column['name'], base.dku_basestring_type):
                raise Exception("Columns %s name attribute is not a string" % str(column))
            if not isinstance(column['type'], base.dku_basestring_type):
                raise Exception("Columns %s type attribute is not a string" % str(column))

        print("Set schema for %s" % self.full_name)

        intercom.jek_or_backend_void_call("streaming-endpoints/set-schema", data={
            "streamingEndpointFullId": self.full_name,
            "schemaData": json.dumps({
                "userModified": False,
                "columns": columns
            })
        })
        
        # trash the current cached schema, it's probably not valid anymore
        self.cols = None

    def get_writer(self):
        """
        Get a stream writer to append to this streaming endpoint as a sink.
        The writer must be closed as soon as you don't need it.

        The schema of the streaming endpoint MUST be set before using this. If you don't set the
        schema of the streaming endpoint, your data will generally not be stored by the output writers
        """

        return continuous_write.StreamingEndpointContinuousWriter(self)

    def get_message_iterator(self, previous_state=None, columns=[]):
        """
        Returns a python iterator which:
        
         * yields rows as dicts
         * has a get_state() method to retrieve the consumer state
        """
        return StreamingEndpointStream(self, previous_state, columns)

    def get_native_kafka_topic(self, broker_version='1.0.0'):
        """
        Get a pykafka topic for the Kafka topic of this streaming endpoint
        """
        try:
            from pykafka import KafkaClient
        except:
            raise Exception("Package pykafka is not available, cannot create native kafka consumer. Use a code env in the recipe.")
        location_info = self.get_location_info(True).get("info", {})
        if location_info.get("type", "") != "kafka":
            raise Exception("Only applicable to Kafka endpoints (was %s)" % location_info.get("type", ""))
        connection_params = location_info.get("connectionParams", {})
        client = KafkaClient(hosts=connection_params.get('bootstrapServers', ''), broker_version=broker_version)
        return client.topics[location_info.get('topic', '')]
        
    def get_native_kafka_consumer(self, broker_version='1.0.0', **kwargs):
        """
        Get a pykafka consumer for the Kafka topic of this streaming endpoint
        """
        location_info = self.get_location_info(True).get("info", {})
        if location_info.get("type", "") != "kafka":
            raise Exception("Only applicable to Kafka endpoints (was %s)" % location_info.get("type", ""))
            
        try:
            from pykafka.common import OffsetType
        except:
            raise Exception("Package pykafka is not available, cannot create native kafka consumer. Use a code env in the recipe.")
        
        consumer_args = {}
        for kv in location_info.get("connectionParams", {}).get("properties", {}):
            consumer_args[kv['name']] = kv['value']
        for kv in location_info.get("consumerParams", {}).get("properties", {}):
            consumer_args[kv['key']] = kv['value']
            
        all_args = {}
        # translate or copy the args that get_simple_consumer accepts
        if 'group.id' in consumer_args:
            all_args['consumer_group'] = consumer_args['group.id']
        if 'fetch.max.bytes' in consumer_args:
            all_args['fetch_message_max_bytes'] = int(consumer_args['fetch.max.bytes'])
        if 'enable.auto.commit' in consumer_args:
            all_args['auto_commit_enable'] = consumer_args['enable.auto.commit'] == 'true'
        if 'auto.commit.interval.ms' in consumer_args:
            all_args['auto_commit_interval_ms'] = int(consumer_args['auto.commit.interval.ms'])
        if 'fetch.min.bytes' in consumer_args:
            all_args['fetch_min_bytes'] = int(consumer_args['fetch.min.bytes'])
        if 'retry.backoff.ms' in consumer_args:
            all_args['fetch_error_backoff_ms'] = int(consumer_args['retry.backoff.ms'])
        if 'fetch.max.wait.ms' in consumer_args:
            all_args['fetch_wait_max_ms'] = int(consumer_args['fetch.max.wait.ms'])
        if 'auto.offset.reset' in consumer_args:
            all_args['auto_offset_reset'] = getattr(OffsetType, consumer_args['auto.offset.reset'].upper())
        if 'session.timeout.ms' in consumer_args:
            all_args['consumer_timeout_ms'] = int(consumer_args['session.timeout.ms'])
        all_args.update(kwargs)

        return self.get_native_kafka_topic(broker_version).get_simple_consumer(**all_args)

    def get_native_kafka_producer(self, broker_version='1.0.0', **kwargs):
        """
        Get a pykafka producer for the Kafka topic of this streaming endpoint
        """
        location_info = self.get_location_info(True).get("info", {})
        if location_info.get("type", "") != "kafka":
            raise Exception("Only applicable to Kafka endpoints (was %s)" % location_info.get("type", ""))
            
        try:
            from pykafka.common import CompressionType
        except:
            raise Exception("Package pykafka is not available, cannot create native kafka consumer. Use a code env in the recipe.")
        
        consumer_args = {}
        for kv in location_info.get("connectionParams", {}).get("properties", {}):
            consumer_args[kv['name']] = kv['value']
            
        all_args = {}
        # translate or copy the args that get_producer accepts
        if 'compression.type' in consumer_args:
           all_args['compression'] = getattr(CompressionType, consumer_args['compression.type'].upper())
        if 'retries' in consumer_args:
           all_args['max_retries'] = int(consumer_args['retries'])
        if 'retry.backoff.ms' in consumer_args:
           all_args['retry_backoff_ms'] = int(consumer_args['retry.backoff.ms'])
        if 'acks' in consumer_args:
           all_args['required_acks'] = int(consumer_args['acks'])
        if 'max.request.size' in consumer_args:
           all_args['max_request_size'] = int(consumer_args['max.request.size'])
        if 'linger.ms' in consumer_args:
           all_args['linger_ms'] = int(consumer_args['linger.ms'])
           
        return self.get_native_kafka_topic(broker_version).get_producer(**all_args)
        
    def get_native_httpsse_consumer(self):
        """
        Get a sseclient for the HTTP SSE url of this streaming endpoint
        """
        try:
            from sseclient import SSEClient
        except:
            raise Exception("Package sseclient is not available, cannot create native http sse consumer. Use a code env in the recipe.")
        location_info = self.get_location_info(True).get("info", {})
        if location_info.get("type", "") != "httpsse":
            raise Exception("Only applicable to Http SSE endpoints (was %s)" % location_info.get("type", ""))
        return SSEClient(location_info.get('url', ''))
        
    def get_native_sqs_consumer(self):
        """
        Get a boto client for the SQS queue of this streaming endpoint
        """
        try:
            import boto3
        except:
            raise Exception("Package boto3 is not available, cannot create native sqs consumer. Use a code env in the recipe.")
        location_info = self.get_location_info(True).get("info", {})
        if location_info.get("type", "") != "sqs":
            raise Exception("Only applicable to SQS endpoints (was %s)" % location_info.get("type", ""))
        creds = location_info.get('connectionCredentials', {})
        client = boto3.client('sqs', aws_access_key_id=creds.get('accessKey', None), aws_secret_access_key=creds.get('secretKey', None), aws_session_token=creds.get('sessionToken', None))
        # find full queue url
        queue_name = location_info.get('queue', '')
        queue_url = client.get_queue_url(QueueName=queue_name).get('QueueUrl', None)        
        if queue_url is None:
            raise Exception("Unable to find queue %s" % queue_name)
        def receive_messages():
            while True:
                response = client.receive_message(
                        QueueUrl=queue_url,
                        MaxNumberOfMessages=10,
                        WaitTimeSeconds=10
                    )
                for m in response.get("Messages", []):
                    deleted = False
                    try:
                        client.delete_message(QueueUrl=queue_url, ReceiptHandle=m["ReceiptHandle"])
                        deleted = True
                    except Exception as e:
                        logging.warn("failed to delete message %s : %s" % (m.get('MessageId', None), str(e)))
                    if deleted:
                        yield m.get('Body', '')
        return receive_messages()
        