#!/usr/bin/env python
# encoding: utf-8
"""
dataset.py : Interaction with DSS datasets
Copyright (c) 2013-2014 Dataiku SAS. All rights reserved.
"""

import numpy as np
from dataiku.base.utils import check_base_package_version
import warnings
import logging

try:
    import pandas as pd
    check_base_package_version(pd, 'pandas', '0.23.0', None, "DSS requires version 0.23 or above") # keep the version number in sync with install-python-packages.sh
    from dataiku.core import dku_pandas_csv
except ImportError as e:
    logging.exception("Pandas import failure")
    warnings.warn("Could not import pandas (%s). Pandas support will be disabled. To enable get_dataframe and other methods, please install the pandas package" % (e), Warning)

from dataiku.core import default_project_key
from dataiku.base import remoterun
import json, os, sys, csv, time
from os import path as osp

import atexit
import warnings
import threading
import struct
import threading, logging
from datetime import datetime

# Module code
from dataiku.core import flow, base, schema_handling, dkuio
from dataiku.core.platform_exec import read_dku_json
from dataiku.core.dkujson import dump_to_filepath, load_from_filepath
from dataiku.core import intercom, metrics, dataset_write, continuous_write

FULL_SAMPLING = {"samplingMethod": "FULL"}


# Loads the export button in IPython.
try:
    from ..notebook import export
    export.setup()
except:
    pass

DEFAULT_TIMEOUT = 30
if flow.FLOW is not None:
    # Timeout has been introduced to cope with ipython leaks.
    # As a default value, we have an infinite timeout when in flow.
    DEFAULT_TIMEOUT = -1

# We want to stderr something on DeprecationWarning
# But don't reset everything because pandas has set up some filters
warnings.filterwarnings("default", category=DeprecationWarning)

def unique(g):
    vals = set()
    for val in g:
        if val not in vals:
            yield val
            vals.add(val)



def none_if_throws(f):
    def aux(*args, **kargs):
        try:
            return f(*args, **kargs)
        except:
            return None
    return aux


(GENERATING,              # underlying  generator is currently working
 IDLE,                    # waiting for the generator user to call .next()
 TIMEOUT_REACHED,         # timeout has been reached
 END_OF_ITERATOR,
 TERMINATED,) = range(5)  # we reached the generator last element.


class IteratorWithTimeOut(object):

    __slots__ = ('generator', 'state', 'timeout',
                 'wake_me_up', 'touched', 'iterator', )

    def __init__(self, iterator, timeout=-1):
        self.iterator = iterator
        self.state = IDLE
        self.timeout = timeout
        self.touched = True
        self.wake_me_up = threading.Event()

    def check_timeout(self,):
        while self.state != TERMINATED:
            if self.touched is False and self.state == IDLE:
                # reached timeout !
                self.state = TIMEOUT_REACHED
                # closing underlying iterator right away
                self.iterator.close()
                # terminating the thread
                break
            if self.state == IDLE:
                self.touched = False
            self.wake_me_up.wait(self.timeout)

    def get_generator(self,):
        if self.timeout > 0:
            timeout_thread = threading.Thread(target=self.check_timeout)
            timeout_thread.daemon = True
            timeout_thread.start()
        try:
            while True:
                self.state = GENERATING
                try:
                    val = next(self.iterator)
                except StopIteration:
                    return
                self.state = IDLE
                yield val
                self.touched = True
                if self.state == TIMEOUT_REACHED:
                    # we didn't reach the end of the file
                    # we returned because of the timeout.
                    return
        finally:
            if self.state != TIMEOUT_REACHED:
                # we are here, either because
                # we reached the end of the stream
                # or the stream rose an exception.
                self.state = TERMINATED
                self.wake_me_up.set()


class Schema(list):
    def __init__(self, data):
        list.__init__(self, data)

    def _repr_html_(self,):
        s = "<table>"
        s += "<tr><th>Column</th><th>Type</th></tr>"
        for col in self:
            s += "<tr><td>%s</td><td>%s</td></tr>" % (col["name"], col["type"])
        s += "</table>"
        return s

def create_sampling_argument(sampling='head',
                             sampling_column=None,
                             limit=None,
                             ratio=None,):
    if type(sampling) == dict:
        # HACK : in the doctor we happen to have
        # the sampling in the java format already.
        # Rather than convert them twice, we
        # use this loophole and return the sampling dictionary
        # directly.
        return sampling
    if sampling_column is not None and sampling != "random-column":
        raise ValueError("sampling_column argument does not make sense with %s sampling method." % sampling)
    if sampling == "head":
        if ratio is not None:
            raise ValueError("target_ratio parameter is not supported by the head sampling method.")
        if limit is None:
            return FULL_SAMPLING
        else:
            return {
                "samplingMethod": "HEAD_SEQUENTIAL",
                "maxRecords": limit
            }
    elif sampling == "random":
        if ratio is not None:
            if limit is not None:
                raise ValueError("Cannot set both ratio and limit.")
            return {
                "samplingMethod": "RANDOM_FIXED_RATIO",
                "targetRatio": ratio
            }
        elif limit is not None:
            return {
                "samplingMethod": "RANDOM_FIXED_NB",
                "maxRecords": limit
            }
        else:
            raise ValueError("Sampling method random requires either a parameter limit or ratio")
    elif sampling == "random-column":
        if sampling_column is None:
            raise ValueError("random-column sampling method requires a sampling_column argument.")
        if ratio is not None:
            raise ValueError("ratio parameter is not handled by sampling column method.")
        if limit is None:
            raise ValueError("random-column requires a limit parameter")
        return {
            "samplingMethod": "COLUMN_BASED",
            "maxRecords": limit,
            "column": sampling_column
        }
    else:
        raise ValueError("Sampling %s is unsupported" % sampling)


class Dataset:
    """This is a handle to obtain readers and writers on a dataiku Dataset.
    From this Dataset class, you can:

    * Read a dataset as a Pandas dataframe
    * Read a dataset as a chunked Pandas dataframe
    * Read a dataset row-by-row
    * Write a pandas dataframe to a dataset
    * Write a series of chunked Pandas dataframes to a dataset
    * Write to a dataset row-by-row
    * Edit the schema of a dataset"""

    @staticmethod
    def list(project_key=None):
        """Lists the names of datasets. If project_key is None, the current
        project key is used."""
        project_key = project_key or default_project_key()

        return intercom.jek_or_backend_json_call("datasets/list", data={
            "projectKey": project_key
        })

    def __init__(self, name, project_key=None, ignore_flow=False):
        self.name = name
        self.cols = None
        self.partitions = None
        self.read_partitions = None
        self.writePartition = None
        self.writable = False
        self.readable = False
        self.preparation_steps = None
        self.preparation_requested_output_schema = None
        self.preparation_context_project_key = None
        self.ignore_flow = ignore_flow

        # Flow mode, initialize partitions to read and write and read/write flags
        if flow.FLOW is not None and ignore_flow == False:
            for input_dataset in flow.FLOW["in"]:
                if input_dataset["smartName"] == self.name or input_dataset["fullName"] == self.name:
                    self.readable = True
                    self.name = input_dataset["fullName"]
                    if "partitions" in input_dataset:
                        self.read_partitions = input_dataset["partitions"]
            for output_dataset in flow.FLOW["out"]:
                if output_dataset["smartName"] == self.name or output_dataset["fullName"] == self.name:
                    self.name = output_dataset["fullName"]
                    self.writable = True
                    self.spec_item = output_dataset
                    if "partition" in output_dataset:
                        self.writePartition = output_dataset["partition"]
            if not self.readable and not self.writable:
                raise Exception("Dataset %s cannot be used : declare it as input or output of your recipe" % self.name)
            (self.project_key, self.short_name) = self.name.split(".", 1)

        else:
            if "." not in name:
                try:
                    self.project_key = project_key or default_project_key()
                    self.short_name = name
                    self.name = self.project_key + "." + name
                except:
                    logging.exception("Failure happened")
                    raise Exception("Dataset %s is specified with a relative name, "
                                    "but no default project was found. Please use complete name" % self.name)
            else:
                # use gave a full name
                (self.project_key, self.short_name) = self.name.split(".", 1)
                if project_key is not None and self.project_key != project_key:
                    raise ValueError("Project key %s incompatible with fullname dataset %s." % (project_key, name))
            self.readable = True
            self.writable = True
            self.spec_item = {"appendMode" : False} # notebook always overwrites

    @property
    def full_name(self,):
        return self.project_key + "." + self.short_name

    def get_location_info(self, sensitive_info=False):
        return intercom.jek_or_backend_json_call("datasets/get-location-info/", data={
                "projectKey": self.project_key,
                "datasetName" : self.short_name,
                "sensitiveInfo" : sensitive_info
            }, err_msg="Failed to get the dataset location info")

    def get_files_info(self, partitions=[]):
        return intercom.jek_or_backend_json_call("datasets/get-files-info/", data={
            "projectKey": self.project_key,
            "datasetName": self.short_name,
            "partitions": json.dumps(partitions)
        }, err_msg="Failed to get the dataset files info")

    def _repr_html_(self,):
        s = "Dataset[   <b>%s</b>   ]</br>" % self.name
        s += self.read_schema()._repr_html_()
        return s

    def set_write_partition(self,spec):
        """Sets which partition of the dataset gets written to when
        you create a DatasetWriter. Setting the write partition is
        not allowed in Python recipes, where write is controlled by
        the Flow."""
        if flow.FLOW is not None and self.ignore_flow == False:
            raise Exception("You cannot explicitly set partitions when "
                            "running within Dataiku Flow")
        self.writePartition = spec

    def add_read_partitions(self, spec):
        """Add a partition or range of partitions to read.

        The spec argument must be given in the DSS partition spec format.
        You cannot manually set partitions when running inside
        a Python recipe. They are automatically set using the dependencies.
        """
        if flow.FLOW is not None and self.ignore_flow == False:
            raise Exception("You cannot explicitly set partitions when "
                            "running within Dataiku Flow")
        if self.read_partitions is None:
            self.read_partitions = []
        self.read_partitions.append(spec)

    def read_schema(self, raise_if_empty=True):
        """Gets the schema of this dataset, as an array of objects like this one:
        { 'type': 'string', 'name': 'foo', 'maxLength': 1000 }.
        There is more information for the map, array and object types.
        """
        if self.cols is None:

            if os.getenv("FLOW_FORCED_SCHEMAS") is not None:
                ffs = json.loads(os.getenv("FLOW_FORCED_SCHEMAS"))
                if self.full_name in ffs:
                    logging.info("Forcing schema: %s"  % ffs[self.full_name])
                    return ffs[self.full_name]["columns"]

            self.cols = intercom.jek_or_backend_json_call("datasets/get-schema/", data={
                "fullDatasetName": self.full_name
            }, err_msg='Unable to fetch schema for %s'%(self.name)).get("columns")

        if raise_if_empty and len(self.cols) == 0:
            raise Exception(
                "No column in schema of %s."
                " Have you set up the schema for this dataset?" % self.name)
        return Schema(self.cols,)

    def list_partitions(self, raise_if_empty=True):
        """List the partitions of this dataset, as an array of partition specifications"""
        if self.partitions is None:
            self.partitions = intercom.jek_or_backend_json_call("datasets/list-partitions/", data={
                "fullDatasetName": self.full_name
            }, err_msg='Unable to list partitions for %s'%(self.name))

        if raise_if_empty and len(self.partitions) == 0:
            raise Exception("No partition in %s." % self.name)
        return self.partitions

    def set_preparation_steps(self, steps, requested_output_schema, context_project_key=None):
        self.preparation_steps = steps
        self.preparation_requested_output_schema = requested_output_schema
        self.preparation_context_project_key = context_project_key

    def get_dataframe(self,
                      columns=None,
                      sampling='head',
                      sampling_column=None,
                      limit=None,
                      ratio=None,
                      infer_with_pandas=True,
                      parse_dates=True,
                      bool_as_str=False,
                      float_precision=None,
                      na_values=None,
                      keep_default_na=True):
        """Read the dataset (or its selected partitions, if applicable)
        as a Pandas dataframe.

        Pandas dataframes are fully in-memory, so you need to make
        sure that your dataset will fit in RAM before using this.

        Keywords arguments:

        * columns -- When not None, returns only the given list of columns (default None)
        * limit -- Limits the number of rows returned (default None)
        * sampling -- Sampling method, if:

                * 'head' returns the first rows of the dataset. Incompatible with ratio parameter.
                * 'random' returns a random sample of the dataset
                * 'random-column' returns a random sample of the dataset. Incompatible with limit parameter.

        * sampling_column -- Select the column used for "columnwise-random" sampling (default None)
        * ratio -- Limits the ratio to at n% of the dataset. (default None)
        * infer_with_pandas -- uses the types detected by pandas rather than the dataset schema as detected in DSS. (default True)
        * parse_dates -- Date column in DSS's dataset schema are parsed (default True)
        * bool_as_str -- Leave boolean values as strings (default False)

        Inconsistent sampling parameter raise ValueError.

        Note about encoding:

            * Column labels are "unicode" objects
            * When a column is of string type, the content is made of utf-8 encoded "str" objects
        """
        (names, dtypes, parse_date_columns) = self._get_dataframe_schema(
            columns=columns,
            parse_dates=parse_dates,
            infer_with_pandas=infer_with_pandas,
            bool_as_str=bool_as_str) # see df_from_split_desc
        with self._stream(infer_with_pandas=infer_with_pandas,
                          sampling=sampling,
                          sampling_column=sampling_column,
                          limit=limit,
                          ratio=ratio,
                          columns=columns) as dku_output:
            return pd.read_table(dku_output,
                                 names=names,
                                 dtype=dtypes,
                                 header=None,
                                 sep='\t',
                                 doublequote=True,
                                 quotechar='"',
                                 parse_dates=parse_date_columns,
                                 float_precision=float_precision,
                                 na_values=na_values,
                                 keep_default_na=keep_default_na)

    def _stream(self,
                infer_with_pandas=True,
                sampling="head",
                sampling_column=None,
                limit=None,
                ratio=None,
                columns=None):
        if not self.readable:
            raise Exception("You cannot read dataset %s, "
                            "it is not declared as an input" % self.name)
        if flow.FLOW is not None:
            add_env = {"DKU_FLOW": "1"}
        else:
            add_env = {}

        sampling_params = create_sampling_argument(
            sampling=sampling,
            sampling_column=sampling_column,
            limit=limit,
            ratio=ratio,)

        if self.preparation_steps is not None:
            data = {
                "fullDatasetName": self.full_name,
                "script" :  json.dumps({ "steps" : self.preparation_steps }),
                "requestedOutputSchema" : json.dumps(self.preparation_requested_output_schema),
                "contextProjectKey": self.preparation_context_project_key,
                "sampling" : json.dumps(sampling_params)
            }
            if self.read_partitions is not None:
                data["partitions"] = json.dumps(self.read_partitions)

            return intercom.jek_or_backend_stream_call("datasets/stream-prepared-dataset/",
                        data=data, err_msg="Failed to read prepared data")

        else:
            data = {
                       "projectKey" : self.project_key,
                       "datasetName" : self.short_name,
                       "sampling" : json.dumps(sampling_params) if sampling_params is not None else None,
                       "columns" : ','.join(columns) if columns is not None else None,
                       "format" : "tsv-excel-noheader",
                       "partitions" : ",".join(self.read_partitions) if self.read_partitions is not None else None
                   }

            return intercom.jek_or_backend_stream_call("datasets/read-data/", data=data, err_msg="Failed to read dataset stream data")

    @staticmethod
    def get_dataframe_schema_st(schema, columns=None, parse_dates=True, infer_with_pandas=False, bool_as_str=False, int_as_float=False):
        names = []
        dtypes = {}
        for col in schema:
            n = col["name"]
            t = col["type"]
            if bool_as_str and t == "boolean":
                dtypes[n] = "str" # see df_from_split_desc
            if int_as_float and t in ["tinyint", "smallint", "int", "bigint"]:
                dtypes[n] = "float64"
            elif t in schema_handling.DKU_PANDAS_TYPES_MAP:
                dtypes[n] = schema_handling.DKU_PANDAS_TYPES_MAP[t]
            else:
                dtypes[n] = np.object_
            names.append(n)
        if columns is not None:
            columns = list(unique(columns))
            names = columns
            dtypes = {
                column_name: dtypes[column_name]
                for column_name in dtypes
                if column_name in columns
            }

        # if parse_dates is set to True,
        # list up the index of the columns set up as dates by DSS
        # and forward them to pandas.
        if parse_dates is True:
            parse_dates = [
                col_id
                for (col_id, col_schema) in enumerate(schema)
                if col_schema["type"] == "date" and (columns is None or col_schema["name"] in columns)
            ]
            if len(parse_dates) == 0:
                parse_dates = False
        if infer_with_pandas:
            if bool_as_str:
                dtypes = dict((c["name"], "str") for c in schema if c["type"] == "boolean")
            else:
                dtypes = None
        return (names, dtypes, parse_dates)

    def _get_dataframe_schema(self,
                              columns=None,
                              parse_dates=True,
                              infer_with_pandas=False,
                              bool_as_str=False):

        if self.preparation_steps is not None:
            return Dataset.get_dataframe_schema_st(self.preparation_requested_output_schema["columns"],
                                                   columns, parse_dates, infer_with_pandas, bool_as_str)
        else:
            return Dataset.get_dataframe_schema_st(self.read_schema(),
                                                   columns, parse_dates, infer_with_pandas, bool_as_str)


    def iter_dataframes_forced_types(self,
                        names, dtypes, parse_date_columns,
                        chunksize=10000,
                        sampling="head",
                        sampling_column=None,
                        limit=None,
                        ratio=None,
                        float_precision=None,
                        na_values=None,
                        keep_default_na=True):
        with self._stream(
                          sampling=sampling,
                          sampling_column=sampling_column,
                          limit=limit,
                          ratio=ratio,
                          columns=names) as dku_output:
            df_it = pd.read_table(
                dku_output,
                dtype=dtypes,
                names=names,
                low_memory=True,
                header=None,
                sep='\t',
                doublequote=True,
                chunksize=chunksize,
                iterator=True,
                parse_dates=parse_date_columns,
                float_precision=float_precision,
                na_values=na_values,
                keep_default_na=keep_default_na)
            logging.info("Starting dataframes iterator")
            for df in df_it:
                yield df

    def iter_dataframes(self,
                        chunksize=10000,
                        infer_with_pandas=True,
                        sampling="head",
                        sampling_column=None,
                        parse_dates=True,
                        limit=None,
                        ratio=None,
                        columns=None,
                        bool_as_str=False,
                        float_precision=None,
                        na_values=None,
                        keep_default_na=True):
        """Read the dataset to Pandas dataframes by chunks of fixed size.

        Returns a generator over pandas dataframes.

        Useful is the dataset doesn't fit in RAM."""
        if not self.readable:
            raise Exception("You cannot read dataset %s, "
                            "it is not declared as an input" % self.name)
        (names, dtypes, parse_date_columns) = self._get_dataframe_schema(
            columns=columns,
            parse_dates=parse_dates,
            infer_with_pandas=infer_with_pandas,
            bool_as_str=bool_as_str)
        with self._stream(infer_with_pandas=infer_with_pandas,
                          sampling=sampling,
                          sampling_column=sampling_column,
                          limit=limit,
                          ratio=ratio,
                          columns=columns) as dku_output:
            df_it = pd.read_table(
                dku_output,
                dtype=dtypes,
                names=names,
                low_memory=True,
                header=None,
                sep='\t',
                doublequote=True,
                chunksize=chunksize,
                iterator=True,
                parse_dates=parse_date_columns,
                float_precision=float_precision,
                na_values=na_values,
                keep_default_na=keep_default_na)
            logging.info("Starting dataframes iterator")
            for df in df_it:
                yield df

    def write_with_schema(self, df, dropAndCreate=False):
        """Writes this dataset (or its target partition, if applicable) from
        a single Pandas dataframe.

        This variant replaces the schema of the output dataset with the schema
        of the dataframe.

        Encoding node: strings MUST be in the dataframe as UTF-8 encoded str objects.
        Using unicode objects will fail.

        :param df: input panda dataframe.
        :param dropAndCreate: drop and recreate the dataset.
        """
        if not hasattr(df, "to_csv"):
            raise ValueError("Method write_with_schema expects a "
                             "dataframe as argument. You gave a %s" %
                             (df is None and "None" or df.__class__))
        self.write_dataframe(df, True, dropAndCreate)

    def write_dataframe(self,df,infer_schema=False, dropAndCreate=False):
        """Writes this dataset (or its target partition, if applicable) from
        a single Pandas dataframe.

        This variant only edit the schema if infer_schema is True, otherwise you must
        take care to only write dataframes that have a compatible schema.
        Also see "write_with_schema".

        Encoding note: strings MUST be in the dataframe as UTF-8 encoded str objects.
        Using unicode objects will fail.

        :param df: input panda dataframe.
        :param infer_schema: infer the schema from the dataframe.
        :param dropAndCreate:  if infer_schema and this parameter are both set to True, clear and recreate the dataset structure.
        """
        if not hasattr(df, "to_csv"):
            raise ValueError("Method write_from_dataframe expects a "
                             "dataframe as argument. You gave a %s" %
                             (df is None and "None" or df.__class__))
        if not self.writable:
            raise Exception("You cannot write dataset %s, "
                            "it is not declared as an output" % self.name)
        try:
            if infer_schema:
                self.write_schema_from_dataframe(df, dropAndCreate)

            with self.get_writer() as writer:
                writer.write_dataframe(df)

        except AttributeError as e:
            raise TypeError("write_from_dataframe is a expecting a "
                            "DataFrame object. You provided a " +
                            df.__class__.__name__, e)

    def write_from_dataframe(self, df, infer_schema=False, write_direct=False, dropAndCreate=False):
        """DEPRECATED - Use write_dataframe instead.
        """
        self.write_dataframe(df, infer_schema, dropAndCreate)

    def iter_rows(self,
                  sampling='head',
                  sampling_column=None,
                  limit=None,
                  ratio=None,
                  log_every=-1,
                  timeout=DEFAULT_TIMEOUT,
                  columns=None):
        """Returns a generator on the rows (as a dict-like object) of the
        data (or its selected partitions, if applicable)

        Keyword arguments:
        * limit -- maximum number of rows to be emitted
        * log_every -- print out the number of rows read on stdout

        Field values are casted according to their types.
        String are parsed into "unicode" values.
        """
        schema = self._read_filtered_schema(columns)
        col_names = [col["name"] for col in schema]
        col_idx = {
            col_name: col_id
            for (col_id, col_name) in enumerate(col_names)
        }
        for row_tuple in self.iter_tuples(sampling=sampling,
                                          sampling_column=sampling_column,
                                          limit=limit,
                                          ratio=ratio,
                                          log_every=log_every,
                                          timeout=timeout,
                                          columns=columns):
            yield DatasetCursor(row_tuple, col_names, col_idx)

    def _read_filtered_schema(self, columns=None):
        schema = self.read_schema()

        # if needed, filter the schema columns to the requested columns
        if columns is not None:
            # index columns in a map by name
            cols_by_name = {} 
            for col in schema:
                cols_by_name[col['name']] = col
            # make a truncated schema with just the requested columns ( in the right order)
            cols = []
            for column in columns:
                if column not in cols_by_name:
                    raise Exception("Column '%s' not in dataset." % column)
                cols.append(cols_by_name[column])
            schema = Schema(cols)
            
        return schema
	
    def _iter_tuples_no_timeout(self,
                                sampling=None,
                                log_every=-1,
                                columns=None):
        """
        Same as iter_tuples but without the timeout.
        """
        if not self.readable:
            raise Exception("You cannot read dataset %s, it is "
                            "not declared as an input" % self.name)
        schema = self._read_filtered_schema(columns)

        casters = [
            schema_handling.CASTERS.get(col["type"], lambda s:s)
            for col in schema
        ]

        with intercom.jek_or_backend_stream_call("datasets/read-data", data = {
                    "projectKey" : self.project_key,
                   "datasetName" : self.short_name,
                   "sampling" : json.dumps(sampling) if sampling is not None else None,
                   "columns" : ','.join(columns) if columns is not None else None,
                   "format" : "tsv-excel-noheader",
                   "partitions" : ",".join(self.read_partitions) if self.read_partitions is not None else None
                }) as stream:

            count = 0

            csv_reader = dkuio.new_utf8_csv_reader(stream,
                                           delimiter='\t',
                                           quotechar='"',
                                           doublequote=True)

            for row_tuple in csv_reader:
                yield [none_if_throws(caster)(val)
                       for (caster, val) in base.dku_zip_longest(casters, row_tuple)]
                count += 1
                if log_every > 0 and count % log_every == 0:
                    sys.stderr.write ("Dataset<%s> - read %i lines" % (self.name, count))
                    sys.stderr.write("\n")

    def raw_formatted_data(self, sampling=None, columns=None, format="tsv-excel-noheader", format_params=None):
        """
        Get a stream of raw bytes from a dataset as a file-like object, formatted in a supported
        DSS output format.

        You MUST close the file handle. Failure to do so will result in resource leaks.
        """
        if not self.readable:
            raise Exception("You cannot read dataset %s, it is "
                            "not declared as an input" % self.name)

        # Build the query
        req_settings = {
            "format" : format
        }
        if format_params is not None:
            req_settings["formatParams"] = format_params
        if sampling is not None:
            req_settings["sampling"] = sampling
        if columns is not None:
            req_settings["columns"] = columns
        if self.read_partitions is not None:
            req_settings["partitions"] = ",".join(self.read_partitions)

        # Send
        return intercom.backend_stream_call("datasets/read-data2", data={
            "projectKey" : self.project_key,
            "datasetName" : self.short_name,
            "settings" : json.dumps(req_settings)
        }, err_msg="Failed to read dataset")

    def iter_tuples(self,
                    sampling='head',
                    sampling_column=None,
                    limit=None,
                    ratio=None,
                    log_every=-1,
                    timeout=DEFAULT_TIMEOUT,
                    columns=None):
        """ Returns the rows of the dataset as tuples.
        The order and type of the values are the same are matching
        the dataset's parameter

        Keyword arguments:

        * limit -- maximum number of rows to be emitted
        * log_every -- print out the number of rows read on stdout
        * timeout -- time (in seconds) of inactivity  after which
          we want to close the generator if nothing has been read. Without it notebooks typically tend to leak "DKU" processes.

        Field values are casted according to their types.
        String are parsed into "unicode" values.
        """
        sampling_params = create_sampling_argument(
            sampling=sampling,
            sampling_column=sampling_column,
            limit=limit,
            ratio=ratio,)
        generator = self._iter_tuples_no_timeout(sampling=sampling_params,
                                                 log_every=log_every,
                                                 columns=columns)
        generator_with_timeout = IteratorWithTimeOut(iterator=generator,
                                     timeout=timeout).get_generator()
        for value in generator_with_timeout:
            yield value

    def get_writer(self):
        """Get a stream writer for this dataset (or its target
           partition, if applicable). The writer must be closed as soon as you don't need it.

            The schema of the dataset MUST be set before using this. If you don't set the
            schema of the dataset, your data will generally not be stored by the output writers
        """

        if os.getenv("FLOW_FAKE_WRITER") is not None:
            return dataset_write.FakeDatasetWriter(self,)
        else:
            return dataset_write.DatasetWriter(self,)


    def get_continuous_writer(self, source_id, split_id=0):
        return continuous_write.DatasetContinuousWriter(self, source_id, split_id=split_id)

    def write_schema(self, columns, dropAndCreate=False):
        """Write the dataset schema into the dataset JSON
        definition file.

        Sometimes, the schema of a dataset being written is
        known only by the code of the Python script itself.
        In that case, it can be useful for the Python script
        to actually modify the schema of the dataset.
        Obviously, this must be used with caution.
        'columns' must be an array of dicts like
        { 'name' : 'column name', 'type' : 'column type'}
        """
        if not self.writable:
            raise Exception("You cannot write the schema for the dataset %s, "
                            "as it is not declared as an output" % self.name)
        for column in columns:
            if "type" not in column:
                raise Exception("Columns %s has no attribute type"
                                % str(column))
            if "name" not in column:
                raise Exception("Columns %s has no attribute name"
                                % str(column))
            if not isinstance(column['name'], base.dku_basestring_type):
                raise Exception("Columns %s name attribute is not a string"
                                % str(column))
            if not isinstance(column['type'], base.dku_basestring_type):
                raise Exception("Columns %s type attribute is not a string"
                                % str(column))

        intercom.jek_or_backend_void_call("datasets/set-schema/", data={
            "fullDatasetName": self.full_name,
            "schemaData": json.dumps({
                "userModified": False,
                "columns": columns
            }),
            "dropAndCreate" : dropAndCreate
        })
        # trash the current cached schema, it's probably not valid anymore
        self.cols = None

    def write_schema_from_dataframe(self, df, dropAndCreate=False):
        self.write_schema(schema_handling.get_schema_from_df(df), dropAndCreate)


    def read_metadata(self):
        """Reads the dataset metadata object"""
        return intercom.jek_or_backend_json_call("datasets/get-metadata", data={
            "fullDatasetName" : self.full_name
        })

    def write_metadata(self, meta):
        """Writes the dataset metadata object"""

        #if not self.writable:
        #    raise Exception("You cannot write the metadata for the dataset %s, "
        #                    "as it is not declared as an output" % self.name)

        if "checklists" not in meta:
            raise Exception("'checklists' is missing")
        if "custom" not in meta:
            raise Exception("'custom' is missing")
        if "tags" not in meta:
            raise Exception("'tags' is missing")

        intercom.jek_or_backend_void_call("datasets/write-metadata", data={
            "fullDatasetName" : self.full_name,
            "metadata" : json.dumps(meta)
        })


    def get_config(self):
        return intercom.backend_json_call("datasets/read-config/", data={
            "projectKey" : self.project_key,
            "datasetName" : self.short_name
        })


    # ################################### Metrics #############################

    def get_last_metric_values(self, partition=''):
        """
        Get the set of last values of the metrics on this dataset, as a :class:`dataiku.ComputedMetrics` object
        """
        return metrics.ComputedMetrics(intercom.backend_json_call("metrics/datasets/get-last-values", data = {
             "projectKey": self.project_key,
             "datasetName" : self.short_name,
             "partition" : partition
        }))

    def get_metric_history(self, metric_lookup, partition=''):
        """
        Get the set of all values a given metric took on this dataset

        :param metric_lookup: metric name or unique identifier
        :param partition: optionally, the partition for which the values are to be fetched
        """
        return intercom.backend_json_call("metrics/datasets/get-metric-history", data = {
            "projectKey": self.project_key,
            "datasetName" : self.short_name,
            "partition" : partition,
            "metricLookup" : metric_lookup if isinstance(metric_lookup, str) or isinstance(metric_lookup, unicode) else json.dumps(metric_lookup)
        }, err_msg="Failed to get metric history")

    def save_external_metric_values(self, values_dict, partition=''):
        """
        Save metrics on this dataset. The metrics are saved with the type "external"

        :param values_dict: the values to save, as a dict. The keys of the dict are used as metric names
        :param partition: optionally, the partition for which the values are to be saved
        """
        return intercom.backend_json_call("metrics/datasets/save-external-values", data = {
            "projectKey": self.project_key,
            "datasetName" : self.short_name,
            "partitionId" : partition,
            "data" : json.dumps(values_dict)
        }, err_msg="Failed to save external metric values")

    def save_external_check_values(self, values_dict, partition=''):
        """
        Save checks on this dataset. The checks are saved with the type "external"

        :param values_dict: the values to save, as a dict. The keys of the dict are used as check names
        """
        return intercom.backend_json_call("checks/datasets/save-external-values", data = {
            "projectKey": self.project_key,
            "datasetName" : self.short_name,
            "partitionId" : partition,
            "data" : json.dumps(values_dict)
        }, err_msg="Failed to save external check values")

class DatasetCursor(object):
    """ A dataset cursor that helps iterating on
        rows.
    """

    __slots__ = ('_col_idx', '_col_names', '_val')

    def __init__(self, val, col_names, col_idx):
        self._col_idx = col_idx
        self._col_names = col_names
        self._val = val

    def __getitem__(self, col_name):
        try:
            col_id = self._col_idx.get(col_name)
            return self._val[col_id]
        except KeyError:
            raise KeyError("Column '%s' is not declared in the schema"
                           % col_name)
        except IndexError:
            raise KeyError("CSV file number of column does not match. Expected"
                           " %i, got %i" %
                           (len(self._col_names, len(self._val))))

    def __len__(self,):
        return len(self._col_idx)

    def __iter__(self,):
        return iter(self._col_names)

    def __contains__(self, k):
        return k in self._col_idx

    def column_id(self, name,):
        return self._col_idx.get(name)

    def keys(self,):
        return self._col_names

    def items(self,):
        return zip(self._col_names, self._val)

    def values(self,):
        return self._val

    def __repr__(self,):
        return repr(dict(self.items()))

    def get(self, col_name, default_value=None):
        if col_name in self._col_idx:
            col_id = self._col_idx.get(col_name)
            return self._val[col_id]
        else:
            return default_value


def _dataset_writer_atexit_handler():
    dataset_write.DatasetWriter.atexit_handler()

 
