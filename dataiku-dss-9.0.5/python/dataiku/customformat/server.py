import inspect
import sys
import traceback
import json
import calendar, datetime, time
import pandas as pd
import numpy as np

from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink
from dataiku.core.dataset import Dataset
from dataiku.core import dkuio
from collections import OrderedDict

from .formatter import Formatter


def json_date_serializer(obj):
    """Default JSON serializer."""

    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    raise Exception("Not serializable")

def empty_for_none(obj):
    return '' if obj is None else obj

# format a stream of rows
def format_rows(formatter, schema, input_stream, output_stream):
    output_formatter = formatter.get_output_formatter(output_stream, schema)

    # data comes in as csv
    (names, dtypes, parse_dates_columns) = Dataset.get_dataframe_schema_st(schema["columns"],
                columns=None, parse_dates=True, infer_with_pandas=False, bool_as_str=False)

    output_formatter.write_header()
    row_count = 0
    for df in pd.read_table(input_stream, iterator=True, chunksize=1000,
                    header=None, names=names, sep=',', skip_blank_lines=False,
                    dtype = dtypes, parse_dates=parse_dates_columns):

        print ("Read a DF (%d rows)" % df.shape[0])
        for row in df.itertuples(index=False, name=None):
            clean_row = []
            for v in row:
                if isinstance(v, np.bool_) or  isinstance(v, np.bool):
                    clean_row.append(True if v else False)
                else:
                    clean_row.append(v)
            output_formatter.write_row(tuple(clean_row))
            row_count += 1
        print ("DF is consumed, preparing for next")

    output_formatter.write_footer()
    return row_count
    

# extract a stream of rows
def extract_rows(formatter, input_schema, input_stream, output_stream):
    format_extractor = formatter.get_format_extractor(input_stream, input_schema)

    schema = input_schema
    if schema is None:
        # No input schema was received, but let's still try to retrieve it
        try:
            columns = format_extractor.read_schema()
            schema = {'columns': columns} if columns is not None else None
        except NotImplementedError:
            pass

    # prepare column list
    column_list = [col["name"] for col in schema["columns"]] if schema is not None else []
    known_columns = set(column_list)
    # use csv to send to backend
    writer = dkuio.new_utf8_csv_writer(output_stream)
    # consume rows
    row_count = 0
    while True:
        row = format_extractor.read_row()
        if row is None:
            break
        if input_schema is None:
            # send dict in one piece
            if schema is None:
                writer.writerow((json.dumps(row, default=json_date_serializer),))
            else:
                # No input schema was given but the custom format has one; we'll
                # use it to properly order the row
                row_dict = row
                if not isinstance(row, OrderedDict):
                    row_dict = OrderedDict([(col, row.get(col, "")) for col in column_list])

                writer.writerow((json.dumps(row_dict, default=json_date_serializer),))

        else:
            # send fields in the order of the schema, convert to string if needed
            row_tuple = [empty_for_none(row.get(col, "")) for col in column_list]
            # send extra column as last field in row
            remaining_columns = {}
            for (key, value) in row.items():
                if not key in known_columns:
                    remaining_columns[key] = value
            if len(remaining_columns.keys()) > 0:
                row_tuple.append(json.dumps(remaining_columns))
            # ready, send
            writer.writerow(row_tuple)
        row_count += 1
    return row_count
        

# extract the schema
def extract_schema(formatter, input_stream):
    format_extractor = formatter.get_format_extractor(input_stream, None)
    columns = format_extractor.read_schema()
    if columns is not None:
        return {'columns':columns}
    else:
        return None

# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    
    command_is_streaming = None
    
    # get work to do
    command = link.read_json()
    try:
        config = command.get("config", {})
        plugin_config = command.get("pluginConfig", {})
        code = command["code"]
        
        # get the formatter object
        clazz = get_clazz_in_code(code, Formatter)
        arg_count = len(inspect.getargspec(clazz.__init__).args)
        formatter = None
        if arg_count == 1:
            formatter = clazz()
        elif arg_count == 2:
            formatter = clazz(config)
        elif arg_count == 3:
            formatter = clazz(config, plugin_config)
        else:
            raise Exception("Wrong signature of the Formatter subclass: %i args" % arg_count)
    
        # get task and dispatch work to formatter    
        task = command["task"]
        if task == "read":
            # extract mode
            command_is_streaming = True
            with link.read_stream() as input, link.send_stream() as output:
                row_count = extract_rows(formatter, command.get("schema", None), input, output)
            # send acknowledgment
            link.send_json({'ok':True, 'count':row_count})
            
        elif task == "write":
            # format mode (schema is mandatory)
            command_is_streaming = True
            with link.read_stream() as input, link.send_stream() as output:
                row_count = format_rows(formatter, command["schema"], input, output)
            # send acknowledgment
            link.send_json({'ok':True, 'count':row_count})
            
        elif task == "schema":
            # read schema mode
            command_is_streaming = False
            with link.read_stream() as input:
                schema = extract_schema(formatter, input)
                if schema is not None:
                    link.send_json(schema)
                else:
                    link.send_json({'columns':[{'name':'__dku_empty_schema__', 'type':'string'}]})                
            
        else:
            raise Exception("Unexpected task %s" % task)
            
    except:
        traceback.print_exc()
        error = get_json_friendly_error()
        if not command_is_streaming:
            link.send_json(error)
        else:
            link.send_json({'ok':False, 'error':error})
    finally:
        # done
        link.close()
    

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
        