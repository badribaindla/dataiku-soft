# encoding: utf-8
"""
Single-thread hoster for a custom-code based predictor
"""

import inspect
import sys
import json
import time
import traceback

import logging
from dataiku.core import debugging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
debugging.install_handler()

from dataiku.base.utils import watch_stdin, get_clazz_in_file
from dataiku.base.socket_block_link import JavaLink

import os, os.path as osp

import pandas as pd
import numpy as np

from dataiku.doctor import utils
from dataiku.core.dkujson import *
from dataiku.doctor.preprocessing_handler import *
from dataiku.doctor.prediction_entrypoints import *
from dataiku.core.saved_model import *
from dataiku.apinode.predict.predictor import ClassificationPredictor
from dataiku.apinode.predict.predictor import RegressionPredictor

class LoadedModel(object):
    def __init__(self, model_type, code_file, data_folder = None):
        self.model_type = model_type
        if model_type == "REGRESSION":
            self.clazz = get_clazz_in_file(code_file, RegressionPredictor)
        else:
            self.clazz = get_clazz_in_file(code_file, ClassificationPredictor)

        self.predictor = self.clazz(data_folder)

def handle_predict(loaded_model, data):
    records_df = pd.DataFrame( data["records"] )

    if loaded_model.model_type == "REGRESSION":
        predictor_ret = loaded_model.predictor.predict(records_df)
        ret = None
        if isinstance(predictor_ret, (list, tuple)):
            if len(predictor_ret) == 1:
                prediction_series = predictor_ret
                ret  = [{'prediction': p} for p in prediction_series.tolist()]
            else:
                (prediction_series, custom_data_list) = predictor_ret
                prediction_list = prediction_series.tolist()

                if custom_data_list is None:
                    custom_data_list = []

                ret = []
                for (prediction, custom) in base.dku_zip_longest(prediction_list, custom_data_list, fillvalue=None):
                    ret.append({"prediction" : prediction, "customKeys" : custom})

        else:
            ret = [{'prediction': p} for p in predictor_ret.tolist()]

        return {"regression" : ret}

    else:
        predictor_ret = loaded_model.predictor.predict(records_df)
        proba_list = []
        custom_data_list = []

        if isinstance(predictor_ret, (list, tuple)):
            if len(predictor_ret) == 1:
                decision_series = predictor_ret
                decision_list = decision_series.tolist()

            elif len(predictor_ret) == 2:
                (decision_series, proba_df) = predictor_ret
                decision_list = decision_series.tolist()

                if proba_df is None:
                    proba_list = []
                else:
                    proba_list = proba_df.to_dict(orient='records')

            elif len(predictor_ret) == 3:
                (decision_series, proba_df, custom_data_list) = predictor_ret
                decision_list = decision_series.tolist()

                if not isinstance(custom_data_list, (list, tuple)):
                    raise ValueError("3rd return value must be a list, got %s" % custom_data_list)

                if proba_df is None:
                    proba_list = []
                else:
                    proba_list = proba_df.to_dict(orient='records')
            else:
                raise ValueError("Illegal returned, expected 1, 2 or 3 arguments")
        else:
            decision_list = predictor_ret.tolist()

        ret = []
        for (decision, probas_record, custom_data) in base.dku_zip_longest(decision_list, proba_list, custom_data_list, fillvalue=None):
            entry = {}
            entry["prediction"] = decision
            if probas_record is not None:
                entry["probas"] = {}
                for (k, v) in probas_record.items():
                    entry["probas"][k.replace("proba_", "")] = v

            if custom_data is not None:
                entry["customKeys"] = custom_data

            ret.append(entry)

        return {'classification' : ret }

                            
# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    
    # get work to do
    try:
        # retrieve the initialization info and initiate serving
        command = link.read_json()
        
        model_type = command.get('modelType')
        code_file = command.get('codeFilePath')
        data_folder = command.get('resourceFolderPath', None)
        
        loaded_model = LoadedModel(model_type, code_file, data_folder)
        
        logging.info("Predictor ready")
        link.send_json({"ok":True})

        stored_exception = None
        # loop and process commands
        while True:
            request = link.read_json()
            if request is None:
                break

            used_api_key =  request.get("usedAPIKey", None)
            if used_api_key is not None:
                os.environ["DKU_CURRENT_REQUEST_USED_API_KEY"] = used_api_key

            before = time.time()
            response = handle_predict(loaded_model, request["obj"])
            after = time.time()
            response["execTimeUS"] = int(1000000 * (after-before))
            link.send_json(response)

            if used_api_key is not None:
                del os.environ["DKU_CURRENT_REQUEST_USED_API_KEY"]
            
        # send end of stream
        logging.info("Work done")
        link.send_string('')
    except:
        ex_type, ex, tb = sys.exc_info()
        traceback.print_exc()
        link.send_string('') # send null to mark failure
        link.send_json({'errorType': str(ex_type), 'message':str(ex), 'traceback':traceback.extract_tb(tb)})
    finally:
        # done
        link.close()

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
  


