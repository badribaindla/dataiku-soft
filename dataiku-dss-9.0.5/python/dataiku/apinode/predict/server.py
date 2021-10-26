# encoding: utf-8
"""
Single-thread hoster for a "legacy" scikit-learn based predictor
"""

import inspect
import sys
import json
import time
import traceback

import logging
from dataiku.core import debugging
from dataiku.doctor.utils import add_missing_columns
from dataiku.doctor.utils import dataframe_from_dict_with_dtypes

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
debugging.install_handler()

from dataiku.base.utils import watch_stdin, get_json_friendly_error
from dataiku.base.socket_block_link import JavaLink

import os, os.path as osp

try:
    import cPickle as pickle
except:
    import pickle

import pandas as pd
import numpy as np

from dataiku.doctor import utils
from dataiku.core.dkujson import *
from dataiku.doctor.preprocessing_handler import *
from dataiku.doctor.prediction_entrypoints import *
from dataiku.core.saved_model import *
from dataiku.core.dataset import Dataset


EXPLANATION_COL_PREFIX = "explanations_"

def pred_to_dict(pred_df, nb_records, explanations_cols=None):
    pred_df.loc[:, 'ignored'] = False
    pred_df = pd.DataFrame(index=range(0, nb_records)).merge(pred_df, how='outer', left_index=True, right_index=True)
    pred_df.ignored.fillna(True, inplace=True)
    logging.info('pre to_dict: %s', pred_df)

    explanations = None
    results_columns = ["prediction", "ignored"]
    if explanations_cols is not None:
        explanations = pred_df[explanations_cols].to_dict(orient="records")

    dicts = []
    for i, r in enumerate(pred_df[results_columns].to_dict(orient="records")):
        if r['ignored']:
            dicts.append({'ignored': True, 'ignoreReason': "IGNORED_BY_MODEL"})
        else:
            if explanations:
                r["explanations"] = {k.replace(EXPLANATION_COL_PREFIX, "", 1): explanations[i][k]
                                     for k in explanations[i] if not np.isnan(explanations[i][k])}
            dicts.append(r)
    return dicts


def _build_dataframe(predictor, data, advanced_options):
    per_feature = predictor.params.preprocessing_params['per_feature']
    dtypes = utils.ml_dtypes_from_dss_schema(data["schema"], per_feature,
                                             prediction_type=predictor.params.core_params["prediction_type"])

    if predictor.params.core_params.get("partitionedModel", {}).get("enabled", False):
        partition_cols = predictor.params.core_params.get("partitionedModel", {}).get("dimensionNames", [])
        if len(partition_cols) > 0:
            logging.info("Scoring partitioned model with partition columns: %s" % partition_cols)
            logging.info("Forcing their dtype to be 'str")
            for partition_col in partition_cols:
                if partition_col in dtypes.keys():
                    dtypes[partition_col] = "str"

    if advanced_options.get("dumpInputRecords", False):
        logging.info("Input dtypes: %s" % dtypes)

    records_df = dataframe_from_dict_with_dtypes(data["records"], dtypes)
    records_df = add_missing_columns(records_df, dtypes, per_feature)

    logging.info("Done preparing missing records")
    logging.info("Done preparing input DF")  #: %s" % records_df)

    if advanced_options.get("dumpInputDataFrame", False):
        logging.info("Input dataframe dump:\n%s" % records_df)
        for x in records_df.columns:
            logging.info("R0[%s] = %s" % (x, records_df[x][0]))
        logging.info("Input dataframe dtypes:\n%s" % records_df.dtypes)

    return records_df

# Data: {
#  records : {
#    Colname : [values]
# }
# schema : DSS schema (preparation output schema)

def handle_predict(predictor, request):
    ret = {}

    advanced_options = request.get("pyPredictionAdvancedOptions", {})

    if advanced_options.get("dumpInputRecords", False):
        logging.info("Input records %s" % request["records"])

    IGNORED = {'ignored': True, 'ignoreReason': "IGNORED_BY_MODEL"}

    if not "schema" in request:
        raise Exception("Schema not specified")

    # build the dataframe to predict

    records_df = _build_dataframe(predictor, request, advanced_options)
    nb_records = records_df.shape[0]

    predictor._set_debug_options(advanced_options)
    before = time.time()
    pred_df = predictor.predict(records_df, with_proba_percentile=True, with_conditional_outputs=True)
    after = time.time()
    ret["execTimeUS"] = int(1000000 * (after - before))

    explanations_cols = None
    if request.get("explanations", {}).get("enabled"):
        before = time.time()

        # Re-running the full prediction to get the explanations to leverage the normalization of the data prior
        # to passing it to the model.
        # Besides, prediction time is negligible compared with time spent on computing explanations.
        pred_df = predictor.predict(records_df,
                                    with_proba_percentile=True,
                                    with_conditional_outputs=True,
                                    with_explanations=True,
                                    explanation_method=request.get("explanations").get("method"),
                                    n_explanations=request.get("explanations").get("nExplanations"),
                                    n_explanations_mc_steps=request.get("explanations").get("nMonteCarloSteps"))

        after = time.time()
        ret["explanationsTimeUS"] = int(1000000 * (after - before))
        explanations_cols = [c for c in pred_df.columns if c.startswith(EXPLANATION_COL_PREFIX)]

    prediction_type = predictor.params.core_params["prediction_type"]

    logging.info("Done predicting, shape=%s" % str(pred_df.shape))
    if pred_df.shape[0] == 0:
        logging.info("Empty dataframe post processing")
        return {'regression' if prediction_type == 'REGRESSION' else 'classification':
                    [IGNORED for i in range(0, nb_records)]}

    proba_columns = [c for c in pred_df.columns if c.startswith("proba_")]
    has_probas = len(proba_columns) > 0
    if prediction_type == "REGRESSION":
        ret["regression"] = pred_to_dict(pred_df, nb_records, explanations_cols=explanations_cols)
    else:
        pred_idx = pred_df.index
        ret['classification'] = pred_to_dict(pred_df, nb_records, explanations_cols=explanations_cols)
        # Fairly ugly ...
        if has_probas:
            record_dicts = pred_df.to_dict(orient='records')
            for (record, i) in zip(record_dicts, pred_idx):
                entry = ret["classification"][i]
                entry["probas"] = {}
                for c in predictor.get_classes():
                    entry["probas"][c] = record["proba_%s" % c]

                if prediction_type == "BINARY_CLASSIFICATION":
                    entry["probaPercentile"] = record.get("proba_percentile", None)
                    cos = predictor.get_conditional_output_names()
                    if len(cos) > 0:
                        entry["conditionals"] = {}
                        for co in cos:
                            entry["conditionals"][co] = record[co]
    return ret

# socket-based connection to backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    
    # get work to do
    try:
        # retrieve the initialization info and initiate serving
        command = link.read_json()
        model_folder = command.get('modelFolder')
        endpoint_with_explanations = command.get("outputExplanations")
        try:
            conditional_outputs = load_from_filepath(osp.join(model_folder, "conditional_outputs.json"))
        except Exception as e:
            logging.exception("Can't load conditional outputs: " + str(e))
            conditional_outputs = []
        predictor = build_predictor_for_saved_model(model_folder, "PREDICTION", conditional_outputs)
        if endpoint_with_explanations:
            predictor.preload_explanations_background()
        logging.info("Predictor ready")
        link.send_json({"ok":True})

        stored_exception = None
        # loop and process commands
        while True:
            request = link.read_json()
            if request is None:
                break

            response = handle_predict(predictor, request)

            link.send_json(response)
            
        # send end of stream
        logging.info("Work done")
        link.send_string('')
    except:
        logging.exception("Prediction user code failed")
        link.send_string('') # send null to mark failure
        link.send_json(get_json_friendly_error())
    finally:
        # done
        link.close()

if __name__ == "__main__":
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
  
