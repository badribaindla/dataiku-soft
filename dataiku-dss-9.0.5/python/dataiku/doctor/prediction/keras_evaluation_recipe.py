# encoding: utf-8

"""
Execute an evaluation recipe in Keras mode
Must be called in a Flow environment
"""
import logging
import gzip
import sys
from os import path as osp
import csv

import pandas as pd

import dataiku
from dataiku.base.utils import safe_unicode_str
from dataiku.base.utils import ErrorMonitoringWrapper
from dataiku.core import debugging, dkujson
from dataiku.core import schema_handling
from dataiku.core import dku_pandas_csv
from dataiku.doctor import constants
from dataiku.doctor.utils import normalize_dataframe
from dataiku.doctor.deep_learning.keras_support import scored_dataset_generator
from dataiku.doctor.prediction.evaluation_base import add_evaluation_columns, compute_metrics_df, build_statistics, run_binary_scoring, run_multiclass_scoring, run_regression_scoring
from dataiku.doctor.preprocessing_handler import PreprocessingHandler
from dataiku.base.remoterun import read_dku_env_and_set
from dataiku.doctor.preprocessing_collector import PredictionPreprocessingDataCollector

debugging.install_handler()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

def main(model_folder, input_dataset_smartname, output_dataset_smartname, metrics_dataset_smartname, recipe_desc,
         script, preparation_output_schema, cond_outputs=None, evaluation_store_folder=None):

    if evaluation_store_folder is not None and len(evaluation_store_folder) == 0:
        evaluation_store_folder = None # to make 'if' tests easier
         
    # Fetching information about the model
    core_params = dkujson.load_from_filepath(osp.join(model_folder, "core_params.json"))
    preprocessing_params = dkujson.load_from_filepath(osp.join(model_folder, "rpreprocessing_params.json"))
    modeling_params = dkujson.load_from_filepath(osp.join(model_folder, "rmodeling_params.json"))
    collector_data = dkujson.load_from_filepath(osp.join(model_folder, "collector_data.json"))

    has_output_dataset = output_dataset_smartname is not None and len(output_dataset_smartname) > 0
    has_metrics_dataset = metrics_dataset_smartname is not None and len(metrics_dataset_smartname) > 0
    dont_compute_performance = not has_metrics_dataset and recipe_desc.get('dontComputePerformance', False)
    if dont_compute_performance:
        logging.info("Will only score and compute statistics")

    prediction_type = core_params["prediction_type"]
    preprocessing_handler = PreprocessingHandler.build(core_params, preprocessing_params, model_folder)
    preprocessing_handler.collector_data = collector_data

    target_mapping = {}
    if core_params["prediction_type"] in [constants.BINARY_CLASSIFICATION, constants.MULTICLASS]:
        target_mapping = {
            label: int(class_id)
            for label, class_id in preprocessing_handler.target_map.items()
        }
        
    if evaluation_store_folder is not None:
        # there is a sample of the input that needs scoring. 
        # let's score it first, since it's smaller than the full data
        # and will trigger errors earlier if there's any to be triggered    
        
        # grab the info from the model evaluation folder
        run_folder = osp.abspath(evaluation_store_folder)
        mes_folder = osp.dirname(run_folder)
        mes_id = osp.basename(mes_folder)
        me_run_id = osp.basename(run_folder)
        mes = dataiku.ModelEvaluationStore(mes_id)
        me_run = mes.get_run(me_run_id)
        
        # Retrieving scored data with generator like the main data
        sample_generator = scored_dataset_generator(model_folder, me_run, recipe_desc, script,
                                                    preparation_output_schema, cond_outputs, output_y=False,
                                                    output_input_df=True)
        
        logging.info("Starting to iterate")
        i = 0
        sample_output_list = []
        sample_input_df_list = []
        for sample_dict in sample_generator:
            sample_output_list.append(sample_dict["scored"])
            sample_input_df_list.append(sample_dict["input_df"])
            logging.info("Generator generated a df {}".format(str(sample_dict["scored"].shape)))
            i += 1
    
        sample_output_df = pd.concat(sample_output_list)
        sample_input_df = pd.concat(sample_input_df_list)
    
        # dump data with the predictions
        sample_scored_file = osp.join(evaluation_store_folder, 'sample_scored.csv.gz')
        sample_scored_schema_file = osp.join(evaluation_store_folder, 'sample_scored_schema.json')
        # Write out the data from python => you lose the "strict" typing, ie bigint becomes double for example, but strings
        # are correct and dates are iso8601 => should be fine to reuse as input in other ML-related operations, where
        # you're going to call ml_dtypes_from_dss_schema() anyway.
        # The proper way would of course be to stream the data back to the JEK and have the jek write with the usual
        # java machinery, but that's a lot of code and calls (at least 1 call to stream, and 1 to verif)
        with gzip.open(sample_scored_file, "wb") as sample_scored_f:
            dku_pandas_csv.DKUCSVFormatter(sample_output_df, sample_scored_f, index=None, header=False, sep='\t', quoting=csv.QUOTE_MINIMAL,).save()

        # don't forget the schema
        sample_output_schema = schema_handling.get_schema_from_df(sample_output_df)
        dkujson.dump_to_filepath(sample_scored_schema_file, {'columns':sample_output_schema})

        # also dump the collector info on the sample (even if the one on the model is more important)
        preprocessing_params = dkujson.load_from_filepath(osp.join(model_folder, "rpreprocessing_params.json"))
        normalize_dataframe(sample_input_df, preprocessing_params.get('per_feature', {}))
        sample_collector = PredictionPreprocessingDataCollector(sample_input_df, preprocessing_params)
        sample_collector_data = sample_collector.build()
        sample_collector_data_filename = osp.join(evaluation_store_folder, "sample_collector_data.json")
        dkujson.dump_to_filepath(sample_collector_data_filename, sample_collector_data)

    # Retrieving scored data with generator (in order to prevent from out of memory errors with
    # big preprocessing)
    output_generator = scored_dataset_generator(model_folder, dataiku.Dataset(input_dataset_smartname), recipe_desc, script,
                                                preparation_output_schema, cond_outputs, output_y=True,
                                                output_input_df=True)

    logging.info("Starting to iterate")
    i = 0
    y_list = []
    pred_df_list = []
    y_notnull_list = []
    output_list = []
    input_df_list = []
    for output_dict in output_generator:
        output_list.append(output_dict["scored"])
        pred_df_list.append(output_dict["pred_df"])
        y_list.append(output_dict["y"])
        y_notnull_list.append(output_dict["y_notnull"])
        input_df_list.append(output_dict["input_df"])
        logging.info("Generator generated a df {}".format(str(output_dict["scored"].shape)))
        i += 1

    y = pd.concat(y_list)
    y_notnull = pd.concat(y_notnull_list)
    output_df = pd.concat(output_list)
    pred_df = pd.concat(pred_df_list)
    input_df = pd.concat(input_df_list)

    output_df = add_evaluation_columns(prediction_type, output_df, y, recipe_desc["outputs"], target_mapping)

    logging.info("writing scored data")
    if has_output_dataset:
        output_dataset = dataiku.Dataset(output_dataset_smartname)
        output_dataset.write_from_dataframe(output_df)

    # Compute and write Metrics Dataset
    # Don't need to provide sample weight because not supported by KERAS backend
    # keep only target where non-null (should have been dropped in the predicted, so it will be filtered out in compute_metrics_df)
    metrics_df = compute_metrics_df(prediction_type, target_mapping, modeling_params, output_df, recipe_desc, y_notnull, input_df, None)

    logging.info("writing metrics data")
    if has_metrics_dataset:
        metrics_dataset = dataiku.Dataset(metrics_dataset_smartname)
        metrics_dataset.write_from_dataframe(metrics_df)
    
    # if there's a model evaluation to fill, produce the perf.json
    if evaluation_store_folder is not None and not dont_compute_performance:
        if core_params["prediction_type"] == constants.BINARY_CLASSIFICATION:
            sorted_classes = sorted(target_mapping.keys(), key=lambda label: target_mapping[label])
            proba_cols = [u"proba_{}".format(safe_unicode_str(c)) for c in sorted_classes]
            run_binary_scoring(None, modeling_params, pred_df["prediction"], pred_df[proba_cols].values, y_notnull, target_mapping, None, evaluation_store_folder, True)

        elif core_params["prediction_type"] == constants.MULTICLASS:
            sorted_classes = sorted(target_mapping.keys(), key=lambda label: target_mapping[label])
            proba_cols = [u"proba_{}".format(safe_unicode_str(c)) for c in sorted_classes]
            # remap (because keras_support unmapped the column)
            mapped_pred_col = pred_df["prediction"].copy()
            mapped_pred_col.replace(target_mapping, inplace=True)

            run_multiclass_scoring(None, modeling_params, mapped_pred_col, pred_df[proba_cols].values, y_notnull.astype(int), target_mapping, None, evaluation_store_folder, True)

        elif core_params["prediction_type"] == constants.REGRESSION:
            run_regression_scoring(None, modeling_params, pred_df["prediction"], y_notnull, None, evaluation_store_folder)
        
    if evaluation_store_folder is not None:
        # compute statistics on the evaluated data (full input, plus predictions)
        clean_all_columns = [c for c in input_df.columns if c not in output_df.columns]
        all_df = pd.concat([input_df[clean_all_columns], output_df], axis=1)
        logging.info("all_df.columns=%s" % all_df.columns)
        statistics = build_statistics(all_df, preprocessing_params['per_feature'], core_params["prediction_type"])
        statistics_file = osp.join(evaluation_store_folder, 'evaluated_data_statistics.json')
        dkujson.dump_to_filepath(statistics_file, statistics)
        

if __name__ == "__main__":
    read_dku_env_and_set()

    with ErrorMonitoringWrapper():
        main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4],
             dkujson.load_from_filepath(sys.argv[5]),
             dkujson.load_from_filepath(sys.argv[6]),
             dkujson.load_from_filepath(sys.argv[7]),
             dkujson.load_from_filepath(sys.argv[8]),
         sys.argv[9])