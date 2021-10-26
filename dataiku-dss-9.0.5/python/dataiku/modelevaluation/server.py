# coding: utf-8
from __future__ import unicode_literals

import pandas as pd

from dataiku.modelevaluation.data_types import DataDriftParams
from dataiku.modelevaluation.drift.data_drift_computer import DataDriftComputer

"""
Main entry point of Drift/Model evaluation compute engine implementation
This is a server implementing commands defined in the PythonKernelProtocol Java class
"""

import logging
import sys
import numpy as np

from dataiku.base.socket_block_link import JavaLink
from dataiku.base.utils import watch_stdin
from dataiku.core import debugging

logger = logging.getLogger(__name__)


class LoadDataDriftParam(object):
    def __init__(self, data):
        self._data = data

    @property
    def ref(self):
        """
        :return: str
        """
        return self._data["ref"]

    @property
    def data_schema(self):
        return self._data["dataSchema"]

    @property
    def column_importance(self):
        return self._data.get("columnImportance")

    @property
    def predicted_schema(self):
        return self._data.get("predictedSchema")

    @property
    def preprocessing_params(self):
        return self._data["preprocessingParams"]

    @property
    def prediction_type(self):
        """
        :return: str
        """
        return self._data["predictionType"]


class ComputeDataDrift(object):
    def __init__(self, data):
        self._data = data

    @property
    def params(self):
        """
        :return: DataDriftParams
        """
        return DataDriftParams.build(self._data["params"])

    @property
    def ref1(self):
        """
        :return: str
        """
        return self._data["ref1"]

    @property
    def ref2(self):
        """
        :return: str
        """
        return self._data["ref2"]

class ModelLikeInfo(object):
    def __init__(self):
        self.ref = None
        """:type : str"""
        self.data_schema = None
        self.predicted_schema = None
        self.preprocessing_params = None
        self.sample_df = None
        """:type : pandas.DataFrame"""
        self.prediction_df = None
        """:type : Union[pandas.DataFrame, None]"""
        self.prediction_type = None
        """:type : str"""
        self.column_importance = None
        """:type : Union[dict, None]"""


class DriftProtocol(object):
    NUMERICAL_TYPES = ["bigint", "int", "tinyint", "smallint", "double", "float"]

    def __init__(self, link):
        self.model_infos = {}
        """:type : dict[str, ModelLikeInfo]"""
        self.link = link

    @staticmethod
    def _make_df(stream, schema):
        logging.info("Loading stream...")
        names = [column["name"] for column in schema["columns"]]
        dtypes = {
            column["name"]: np.float64 if column["type"] in DriftProtocol.NUMERICAL_TYPES else np.object_
            for column in schema["columns"]
        }
        df = pd.read_csv(stream,
                         names=names,
                         dtype=dtypes,
                         header=None,
                         skip_blank_lines=False,
                         sep='\t',
                         doublequote=True,
                         encoding='utf8',
                         quotechar='"',
                         parse_dates=False,
                         float_precision="round_trip")
        logging.info("Loaded stream")
        return df

    def _handle_load_drift_param(self, param):
        """
        :param param: LoadDataDriftParam
        :return:
        """
        mel = ModelLikeInfo()
        mel.ref = param.ref
        mel.data_schema = param.data_schema
        mel.preprocessing_params = param.preprocessing_params
        mel.prediction_type = param.prediction_type
        mel.column_importance = param.column_importance
        self.link.send_json({"type": "WaitingForData"})
        mel.sample_df = self._make_df(self.link.read_stream(), param.data_schema)
        if param.predicted_schema:
            mel.prediction_df = self._make_df(self.link.read_stream(), param.predicted_schema)
        self.model_infos[param.ref] = mel
        self.link.send_json({"type": "DatasetReceived"})

    def _handle_data_drift_computation(self, params):
        """
        :param params: CompteDataDrift
        :return: Nothing
        """
        if params.ref1 not in self.model_infos:
            raise Exception("Information on reference {} is not available".format(params.ref1))
        if params.ref2 not in self.model_infos:
            raise Exception("Information on reference {} is not available".format(params.ref2))
        logger.info("Starting computation from data drift between {} and {}...".format(params.ref1, params.ref2))
        computer = DataDriftComputer(self.model_infos[params.ref1], self.model_infos[params.ref2], params.params)
        self.link.send_json({"type": "DataDriftResult", "result": computer.compute()})

    def start(self):
        while True:
            command = self.link.read_json()
            if command["type"] == "LoadDataDriftParam":
                load_command = LoadDataDriftParam(command)
                self._handle_load_drift_param(load_command)
            elif command["type"] == "ComputeDataDrift":
                compute_data_drift_command = ComputeDataDrift(command)
                self._handle_data_drift_computation(compute_data_drift_command)


def serve(port, secret):
    link = JavaLink(port, secret)
    link.connect()
    protocol_handler = DriftProtocol(link)
    try:
        protocol_handler.start()
    finally:
        link.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s')
    debugging.install_handler()

    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
