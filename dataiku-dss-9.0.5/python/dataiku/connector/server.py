import inspect
import sys
import json
import time
import traceback

import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink
from dataiku.core import dkuio

from .connector import Connector, CustomDatasetWriter


def read_rows(connector, schema, partitioning, partition_id, limit, output_stream):
    def json_date_serializer(obj):
        """Default JSON serializer."""
        import calendar, datetime
    
        if isinstance(obj, datetime.datetime):
            return obj.isoformat()
        raise Exception("Not serializable")

    # prepare column list
    column_list = [col["name"] for col in schema["columns"]] if schema is not None else []
    known_columns = set(column_list)
    # use csv to send to backend
    writer = dkuio.new_utf8_csv_writer(output_stream)
    # consume rows
    for row in connector.generate_rows(schema, partitioning, partition_id, limit):
        if row is None:
            raise Exception("None row")

        if schema is None:
            logging.info("Dataset has no schema, returning a single-column dict")
            writer.writerow( (json.dumps(row, default=json_date_serializer),) )

        else:
            row_tuple = []
            for col in schema["columns"]:
                row_tuple.append(row.get(col["name"], ""))

            # Add the remaining columns in an object
            remaining_columns = {}
            for (key, value) in row.items():
                if not key in known_columns:
                    remaining_columns[key] = value
            if len(remaining_columns.keys()) > 0:
                row_tuple.append(json.dumps(remaining_columns))

            #logging.info("Sending schematized row: %s" % row_tuple)
            writer.writerow(row_tuple)
    logging.info("All rows sent")

def write_rows(connector, schema, partitioning, partition_id, input_stream):
    writer = connector.get_writer(schema, partitioning, partition_id)
    reader = dkuio.new_utf8_csv_reader(input_stream, delimiter=',', quotechar='"', doublequote=True)
    for row in reader:
        # logging.info("Got a row (%d columns)" % len(row))
        writer.write_row(row)
    writer.close()
    
# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    try:
        command = link.read_json()
        config = command.get("config", {})
        plugin_config = command.get("pluginConfig", {})
        code = command["code"]
        
        # get the connector object
        clazz = get_clazz_in_code(code, Connector)
        arg_count = len(inspect.getargspec(clazz.__init__).args)
        connector = None
        if arg_count == 1:
            connector = clazz()
        elif arg_count == 2:
            connector = clazz(config)
        elif arg_count == 3:
            connector = clazz(config, plugin_config)
        else:
            raise Exception("Wrong signature of the Connector subclass: %i args" % arg_count)
        
        link.send_json({'ok':True})

        stored_error = None
        # loop and process commands
        while True:
            request = link.read_json()
            if request is None:
                break

            response = None
            task = request["task"]
            logging.info("Processing task: %s" % task)
            if task == "read_rows":
                schema = request.get("schema", None)
                partitioning = request.get("partitioning", None)
                partition_id = request.get("partitionId", None)
                limit = request.get("limit", None)
                stored_error = None
                try:
                    with link.send_stream() as output:
                        read_rows(connector, schema, partitioning, partition_id, limit, output)
                except:
                    logging.exception("Connector send fail, storing exception")
                    stored_error = get_json_friendly_error()

            elif task == "finish_read_session":
                if stored_error is None:
                    link.send_json({"ok":True})
                else:
                    link.send_json({"ok":False, "error": stored_error})
            elif task == "write_rows":
                schema = request.get("schema", None)
                partitioning = request.get("partitioning", None)
                partition_id = request.get("partitionId", None)
                with link.read_stream() as input:
                    write_rows(connector, schema, partitioning, partition_id, input)
                link.send_json({'ok':True})
            elif task == "get_schema":
                link.send_json({'schema':connector.get_read_schema()})
            elif task == "get_partitioning_scheme":
                link.send_json({'partitioning':connector.get_partitioning()})
            elif task == "list_partitions":
                partitioning = request.get("partitioning", None)
                link.send_json({'partitions':connector.list_partitions(partitioning)})
            elif task == "partition_exists":
                partitioning = request.get("partitioning", None)
                partition_id = request.get("partitionId", None)
                link.send_json({"exists" : connector.partition_exists(partitioning, partition_id)})
            elif task == "records_count":
                partitioning = request.get("partitioning", None)
                partition_id = request.get("partitionId", None)
                link.send_json({"count" : connector.get_records_count(partitioning, partition_id)})
            else:
                raise Exception("Unexpected task %s" % task)

        # send end of stream
        logging.info("Work done")
        link.send_string('')
    except:
        link.send_string('') # mark failure
        traceback.print_exc()
        link.send_json(get_json_friendly_error())
    finally:
        # done
        link.close()

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
  