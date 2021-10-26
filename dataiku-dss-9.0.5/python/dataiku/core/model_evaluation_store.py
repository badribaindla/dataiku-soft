from dataiku.core import base, flow, metrics, dkuio, default_project_key
from dataiku.base import remoterun
from dataiku import Dataset
import os.path as osp, os
import json, logging, sys
import pandas as pd, numpy as np
from dataiku.core.intercom import jek_or_backend_json_call, jek_or_backend_void_call, jek_or_backend_stream_call, backend_json_call, backend_void_call, backend_stream_call

class ModelEvaluationStore(base.Computable):
    """
    This is a handle to interact with a model evaluation store

    Note: this class is also available as ``dataiku.ModelEvaluationStore``
    """

    def __init__(self, lookup, project_key=None, ignore_flow=False):
        """Obtain a handle for a named model evaluation store

        :param str lookup: Name or identifier of the model evaluation store
        :param str project_key: Project key of the model evaluation store, if it is not in the current project.
        """
        self.lookup = lookup
        self.path = None
        self.info = None
        self.ignore_flow = ignore_flow

        if flow.FLOW is not None and ignore_flow == False:
            self._init_data_from_flow(obj_type="Model evaluation store", project_key=project_key)

        else:
            if "." not in lookup:
                self.project_key = project_key or default_project_key()
                self.short_name = lookup
                self.name = self.project_key + "." + lookup
            else:
                self.project_key = lookup.split(".")[0]
                self.short_name = lookup.split(".")[1]
                self.name = lookup
                #except:
                #    raise Exception("Model evaluation store %s is specified with a relative name, "
                #                    "but no default project was found. Please use complete name" % id)

    def _repr_html_(self,):
        s = "ModelEvaluationStore[   <b>%s</b>   ]" % (self.name)
        return s

    def get_info(self, sensitive_info=False):
        """
        Get information about the location and settings of this model evaluation store
        :rtype: dict
        """
        if self.info is None:
            self.info = jek_or_backend_json_call("model-evaluation-stores/get-info", {
                "projectKey": self.project_key,
                "lookup" : self.short_name,
                "sensitiveInfo" : sensitive_info
            })
        return self.info["info"]

    def get_path(self):
        """
        Gets the filesystem path of this model evaluation store.
        """
        return self.get_info()["path"]

    def get_id(self):
        return self.get_info()["id"]

    def get_name(self):
        return self.get_info()["name"]
        
    def list_runs(self):
        return jek_or_backend_json_call("model-evaluation-stores/list-runs", {
                "projectKey": self.project_key,
                "id" : self.get_id()
            })
            
    def get_run(self, run_id):
        return ModelEvaluation(self, run_id)


# one evaluation in a store
class ModelEvaluation(object):
    """
    This is a handle to interact with a model evaluation
    """

    def __init__(self, store, run_id):
        self.store = store
        self.run_id = run_id
        self.sample_schema = None
        self.preparation_steps = None
        self.preparation_requested_output_schema = None
        self.preparation_context_project_key = None

    def _repr_html_(self,):
        s = "ModelEvaluation[   <b>%s %s</b>   ]" % (self.store.name, self.run_id)
        return s

    def set_preparation_steps(self, steps, requested_output_schema, context_project_key=None):
        self.preparation_steps = steps
        self.preparation_requested_output_schema = requested_output_schema
        self.preparation_context_project_key = context_project_key

    def get_schema(self):
        """
        Gets the schema of the sample in this model evaluation store, as an array of objects like this one:
        { 'type': 'string', 'name': 'foo', 'maxLength': 1000 }.
        There is more information for the map, array and object types.
        """
        if self.sample_schema is None:
            self.sample_schema = jek_or_backend_json_call("model-evaluation-stores/get-sample-schema", data={
                "projectKey": self.store.project_key,
                "id": self.store.get_id(),
                "runId": self.run_id
            }, err_msg='Unable to fetch schema for %s %s' % (self.store.name, self.run_id))

        return self.sample_schema

    def _stream(self):

        preparation_steps = self.preparation_steps
        preparation_requested_output_schema = self.preparation_requested_output_schema
        preparation_context_project_key = self.preparation_context_project_key,
        if preparation_steps is None or preparation_requested_output_schema is None:
            logging.info("Read sample without script")
            preparation_steps = []
            preparation_requested_output_schema = self.get_schema()
            
        data = {
            "projectKey": self.store.project_key,
            "id": self.store.get_id(),
            "runId": self.run_id,
            "script" :  json.dumps({ "steps" : preparation_steps }),
            "contextProjectKey": preparation_context_project_key,
            "requestedOutputSchema" : json.dumps(preparation_requested_output_schema)
        }

        return jek_or_backend_stream_call("model-evaluation-stores/stream-prepared-sample", data=data, err_msg="Failed to read prepared data")

    def _get_dataframe_schema(self,
                                columns=None,
                                parse_dates=True,
                                infer_with_pandas=False,
                                bool_as_str=False):

        if self.preparation_steps is not None:
            schema_to_use = self.preparation_requested_output_schema
        else:
            schema_to_use = self.get_schema()
        return Dataset.get_dataframe_schema_st(schema_to_use.get("columns", []), columns, parse_dates, infer_with_pandas, bool_as_str)


    def get_dataframe(self,
                        columns=None,
                        infer_with_pandas=True,
                        parse_dates=True,
                        bool_as_str=False,
                        float_precision=None):
        """Read the sample in the run as a Pandas dataframe.

        Pandas dataframes are fully in-memory, so you need to make
        sure that your dataset will fit in RAM before using this.

        Keywords arguments:

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
        with self._stream() as dku_output:
            return pd.read_table(dku_output,
                                 names=names,
                                 dtype=dtypes,
                                 header=None,
                                 sep='\t',
                                 doublequote=True,
                                 quotechar='"',
                                 parse_dates=parse_date_columns,
                                 float_precision=float_precision)


    def iter_dataframes_forced_types(self,
                        names, dtypes, parse_date_columns,
                        sampling=None, # ignored (for the moment)
                        chunksize=10000,
                        float_precision=None):
        with self._stream() as dku_output:
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
                float_precision=float_precision)
            logging.info("Starting dataframes iterator")
            for df in df_it:
                yield df

    def iter_dataframes(self,
                        chunksize=10000,
                        infer_with_pandas=True,
                        parse_dates=True,
                        columns=None,
                        bool_as_str=False,
                        float_precision=None):
        """Read the model evaluation sample to Pandas dataframes by chunks of fixed size.

        Returns a generator over pandas dataframes.

        Useful is the sample doesn't fit in RAM."""
        
        (names, dtypes, parse_date_columns) = self._get_dataframe_schema(
            columns=columns,
            parse_dates=parse_dates,
            infer_with_pandas=infer_with_pandas,
            bool_as_str=bool_as_str) # see df_from_split_desc
        with self._stream() as dku_output:
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
                float_precision=float_precision)
            logging.info("Starting dataframes iterator")
            for df in df_it:
                yield df
        