# encoding: utf-8

"""
Execute an evaluation recipe in PyRegular mode
Must be called in a Flow environment
"""
import gzip

import sys, json, os.path as osp, logging
from six.moves import xrange
import csv

from dataiku.base.utils import safe_unicode_str
from dataiku.base.utils import ErrorMonitoringWrapper
from dataiku.doctor.utils import normalize_dataframe
from dataiku.doctor.prediction_entrypoints import *
from dataiku.doctor.prediction.reg_scoring_recipe import load_model_partitions
from dataiku.doctor.prediction.reg_scoring_recipe import generate_part_df_and_model_params
from dataiku.doctor.prediction.reg_scoring_recipe import get_input_parameters
from dataiku.doctor.preprocessing_collector import PredictionPreprocessingDataCollector

from dataiku.doctor.prediction import RegressionModelScorer
from dataiku.doctor.prediction.classification_scoring import BinaryClassificationModelScorer, MulticlassModelScorer
from dataiku.doctor import utils
from dataiku.doctor.prediction.classification_scoring import compute_assertions_for_decision
from dataiku.doctor.prediction.regression_scoring import compute_assertions_for_regression
from dataiku.doctor.utils.split import cast_assertions_masks_bool

from ..preprocessing_handler import *
from dataiku.core import debugging
from dataiku.core import intercom
from dataiku.core import default_project_key
from dataiku.core import dkujson as dkujson
from dataiku.core import schema_handling
from dataiku.core import dku_pandas_csv
from dataiku import Dataset

from dataiku.doctor.prediction.evaluation_base import build_statistics, compute_metrics_df, add_evaluation_columns, run_binary_scoring, run_multiclass_scoring, run_regression_scoring

import datetime as dt
from dataiku.base.remoterun import read_dku_env_and_set

logger = logging.getLogger(__name__)

def main(model_folder, input_dataset_smartname, output_dataset_smartname, metrics_dataset_smartname, recipe_desc,
         script, preparation_output_schema, cond_outputs=None, evaluation_store_folder=None):
    
    if evaluation_store_folder is not None and len(evaluation_store_folder) == 0:
        evaluation_store_folder = None # to make 'if' tests easier
    
    has_output_dataset = output_dataset_smartname is not None and len(output_dataset_smartname) > 0
    has_metrics_dataset = metrics_dataset_smartname is not None and len(metrics_dataset_smartname) > 0
    dont_compute_performance = not has_metrics_dataset and recipe_desc.get('dontComputePerformance', False)
    if dont_compute_performance:
        logging.info("Will only score and compute statistics")

    input_dataset, core_params, feature_preproc, names, dtypes, parse_date_columns = \
        get_input_parameters(model_folder, input_dataset_smartname, preparation_output_schema, script)
    with_sample_weight = core_params.get("weight", {}).get("weightMethod") in \
                         {"SAMPLE_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}

    logger.info("Scoring data")
    partition_dispatch, partitions = load_model_partitions(model_folder, core_params, for_eval=not dont_compute_performance)
    
    if evaluation_store_folder is not None:
        # there is a sample of the input that needs scoring. 
        # let's score it first, since it's smaller than the full data
        # and will trigger errors earlier if there's any to be triggered    
        
        sample_file = osp.join(evaluation_store_folder, 'sample.csv.gz')
        sample_schema_file = osp.join(evaluation_store_folder, 'sample_schema.json')

        sample_schema = dkujson.load_from_filepath(sample_schema_file)

        (sample_names, sample_dtypes, sample_parse_date_columns) = Dataset.get_dataframe_schema_st(preparation_output_schema["columns"], parse_dates=True, infer_with_pandas=False)
        sample_dtypes = utils.ml_dtypes_from_dss_schema(preparation_output_schema, feature_preproc, prediction_type=core_params["prediction_type"])
        if partition_dispatch:
            partition_cols = core_params.get("partitionedModel", {}).get("dimensionNames", [])
            if len(partition_cols) > 0:
                logging.info("Forcing partition dtype to be 'str")
                for partition_col in partition_cols:
                    sample_dtypes[partition_col] = "str"
    
        for i in xrange(0, len(sample_names)):
            logging.info("Column %s = %s (dtype=%s)" % (i, sample_names[i], sample_dtypes.get(names[i], None)))

        logging.info("Reading sample with dtypes: %s" % sample_dtypes)
        
        def _stream_sample():
            run_folder = osp.abspath(evaluation_store_folder)
            mes_folder = osp.dirname(run_folder)
            data = {
                "projectKey": default_project_key(),
                "id": osp.basename(mes_folder),
                "runId": osp.basename(run_folder),
                "script" :  json.dumps(script),
                "requestedOutputSchema" : json.dumps(preparation_output_schema)
            }
            return intercom.jek_or_backend_stream_call("model-evaluation-stores/stream-prepared-sample/", data=data, err_msg="Failed to read prepared data")

        with _stream_sample() as stream:
            sample_df = pd.read_table(stream,
                               names=sample_names,
                               dtype=sample_dtypes,
                               header=None,
                               sep='\t',
                               doublequote=True,
                               quotechar='"',
                               parse_dates=sample_parse_date_columns,
                               float_precision="round_trip")
        logging.info("Loaded sample : %s" % str(sample_df.shape))
        
        sample_df_orig = sample_df.copy()
        cast_assertions_masks_bool(sample_df)
        
        # make sure to not pass the MES folder, since we just want the scoring part here
        sample_pred_df, _, _, _, _, _, _ = process_input_df(sample_df, feature_preproc, partition_dispatch, core_params, partitions, with_sample_weight, recipe_desc, cond_outputs, None, True)

        # also remove ml assertions mask columns from the output
        clean_kept_columns = [c for c in sample_df_orig.columns if c not in sample_pred_df.columns
                              and not c.startswith(MLAssertion.ML_ASSERTION_MASK_PREFIX)]
        sample_output_df = pd.concat([sample_df_orig[clean_kept_columns], sample_pred_df], axis=1)
        
        # dump data with the predictions
        sample_scored_file = osp.join(evaluation_store_folder, 'sample_scored.csv.gz')
        sample_scored_schema_file = osp.join(evaluation_store_folder, 'sample_scored_schema.json')
        # Write out the data from python => you lose the "strict" typing, ie bigint becomes double for example, but strings
        # are correct and dates are iso8601 => should be fine to reuse as input in other ML-related operations, where
        # you're going to call ml_dtypes_from_dss_schema() anyway.
        # The proper way would of course be to stream the data back to the JEK and have the jek write with the usual
        # java machinery, but that's a lot of code and calls (at least 1 call to stream, and 1 to verif)
        with gzip.open(sample_scored_file, "wb") as sample_scored_f:
            dku_pandas_csv.DKUCSVFormatter(sample_output_df, sample_scored_f, index=None, header=False, sep='\t',
                                           quoting=csv.QUOTE_MINIMAL).save()
        # don't forget the schema
        sample_output_schema = schema_handling.get_schema_from_df(sample_output_df)
        dkujson.dump_to_filepath(sample_scored_schema_file, {'columns':sample_output_schema})
        
        # also dump the collector info on the sample (even if the one on the model is more important)
        preprocessing_params = dkujson.load_from_filepath(osp.join(model_folder, "rpreprocessing_params.json"))
        normalize_dataframe(sample_df_orig, feature_preproc)
        sample_collector = PredictionPreprocessingDataCollector(sample_df_orig, preprocessing_params)
        sample_collector_data = sample_collector.build()
        sample_collector_data_filename = osp.join(evaluation_store_folder, "sample_collector_data.json")
        dkujson.dump_to_filepath(sample_collector_data_filename, sample_collector_data)
        
    logger.info("Read with dtypes=%s" % dtypes)

    with input_dataset._stream(infer_with_pandas=True,
                 sampling=recipe_desc.get('selection', {"samplingMethod":"FULL"}),
                 columns=names) as stream:
        input_df = pd.read_table(stream,
                                 names=names,
                                 dtype=dtypes,
                                 header=None,
                                 sep='\t',
                                 doublequote=True,
                                 quotechar='"',
                                 parse_dates=parse_date_columns,
                                 float_precision="round_trip")

    input_df_orig = input_df.copy()
    cast_assertions_masks_bool(input_df)

    logger.info("Got a dataframe : %s" % str(input_df.shape))
    
    pred_df, y, unprocessed, sample_weight, modeling_params, target_mapping, assertions = process_input_df(input_df, feature_preproc, partition_dispatch, core_params, partitions, with_sample_weight, recipe_desc, cond_outputs, evaluation_store_folder, dont_compute_performance)

    logger.info("Done predicting it")
    if recipe_desc.get("filterInputColumns", False):
        clean_kept_columns = [c for c in recipe_desc["keptInputColumns"] if c not in pred_df.columns]
    else:
        # also remove  ml assertions mask columns from the output
        clean_kept_columns = [c for c in input_df_orig.columns
                              if c not in pred_df.columns and not c.startswith(MLAssertion.ML_ASSERTION_MASK_PREFIX)]
    output_df = pd.concat([input_df_orig[clean_kept_columns], pred_df], axis=1)

    # write scored data
    if has_output_dataset:
        output_dataset = Dataset(output_dataset_smartname)
        #logger.info("writing scored schema")
        #output_dataset.write_schema_from_dataframe(output_df)  # backend should do this
        logger.info("writing scored data")
        output_dataset.write_from_dataframe(output_df)

    # write metrics dataset
    if has_metrics_dataset:
        metrics_df = compute_metrics_df(core_params["prediction_type"], target_mapping, modeling_params, output_df, recipe_desc, y, unprocessed, sample_weight)

        if recipe_desc.get("computeAssertions", False):
            assertions_metrics_df = compute_assertions_df(core_params["prediction_type"], pred_df, assertions,
                                                        target_mapping)
            metrics_df = pd.concat([metrics_df, assertions_metrics_df], axis=1)

        metrics_dataset = Dataset(metrics_dataset_smartname)
        #logging.info("writing metrics schema")
        #metrics_dataset.write_schema_from_dataframe(metrics_df)  # backend should maybe do this ?
        logger.info("writing metrics data")
        metrics_dataset.write_from_dataframe(metrics_df)
        
    if evaluation_store_folder is not None:
        # compute statistics on the evaluated data (full input, plus predictions, no ml assertions masks)
        clean_all_columns = [c for c in input_df_orig.columns
                             if c not in pred_df.columns and not c.startswith(MLAssertion.ML_ASSERTION_MASK_PREFIX)]
        all_df = pd.concat([input_df_orig[clean_all_columns], pred_df], axis=1)
        statistics = build_statistics(all_df, feature_preproc, core_params["prediction_type"])
        statistics_file = osp.join(evaluation_store_folder, 'evaluated_data_statistics.json')
        dkujson.dump_to_filepath(statistics_file, statistics)
        
    
def process_input_df(input_df, feature_preproc, partition_dispatch, core_params, partitions, with_sample_weight, recipe_desc, cond_outputs, evaluation_store_folder, dont_compute_performance):
    normalize_dataframe(input_df, feature_preproc)
    for col in input_df:
        logger.info("NORMALIZED: %s -> %s" % (col, input_df[col].dtype))

    part_dfs = {"pred": [], "target": [], "weight": [], "unprocessed": [], "assertions": []}
    for part_df, part_params in generate_part_df_and_model_params(input_df, partition_dispatch, core_params,
                                                                  partitions, raise_if_not_found=False):

        model_folder, preprocessing_params, clf, pipeline, modeling_params, preprocessing_handler = part_params

        logger.info("Processing it")
        transformed = pipeline.process(part_df)
        logger.info("Predicting it")

        if core_params["prediction_type"] == constants.BINARY_CLASSIFICATION:

            # Computing threshold
            if recipe_desc["overrideModelSpecifiedThreshold"]:
                used_threshold = recipe_desc.get("forcedClassifierThreshold")
            else:
                used_threshold = dkujson.load_from_filepath(osp.join(model_folder, "user_meta.json")) \
                    .get("activeClassifierThreshold")

            scoring_data = binary_classification_predict(
                clf,
                pipeline,
                modeling_params,
                preprocessing_handler.target_map,
                used_threshold,
                part_df,
                output_probas=recipe_desc["outputProbabilities"],
                # For ensemble model, we need to indicate that we have target, so that a target-aware pipeline is
                # selected. See 0c87605 for more information
                ensemble_has_target=not dont_compute_performance)
            pred_df = scoring_data.pred_and_proba_df

            # Probability percentile & Conditional outputs
            has_cond_output = recipe_desc["outputProbabilities"] and cond_outputs
            has_percentiles = recipe_desc["outputProbaPercentiles"] or (has_cond_output and
                                                                        len([co for co in cond_outputs if
                                                                             co["input"] == "proba_percentile"]))
            if has_percentiles:
                model_perf = dkujson.load_from_filepath(osp.join(model_folder, "perf.json"))
                if "probaPercentiles" in model_perf and model_perf["probaPercentiles"]:
                    percentile = pd.Series(model_perf["probaPercentiles"])
                    proba_1 = u"proba_{}".format(safe_unicode_str(next(k for k, v in preprocessing_handler.target_map.items()
                                                               if v == 1)))
                    pred_df["proba_percentile"] = pred_df[proba_1].apply(
                        lambda p: percentile.where(percentile <= p).count() + 1)
                else:
                    raise Exception("Probability percentiles are missing from model.")
            if has_cond_output:
                for co in cond_outputs:
                    inp = pred_df[co["input"]]
                    acc = inp.notnull()  # condition accumulator
                    for r in co["rules"]:
                        if r["operation"] == 'GT':
                            cond = inp > r["operand"]
                        elif r["operation"] == 'GE':
                            cond = inp >= r["operand"]
                        elif r["operation"] == 'LT':
                            cond = inp < r["operand"]
                        elif r["operation"] == 'LE':
                            cond = inp <= r["operand"]
                        pred_df.loc[acc & cond, co["name"]] = r["output"]
                        acc = acc & (~cond)
                    pred_df.loc[acc, co["name"]] = co.get("defaultOutput", "")
            if has_percentiles and not recipe_desc["outputProbaPercentiles"]:  # was only for conditional outputs
                pred_df.drop("proba_percentile", axis=1, inplace=True)

            if evaluation_store_folder is not None and not dont_compute_performance:
                run_binary_scoring(clf, modeling_params, scoring_data.preds, scoring_data.probas,
                                   transformed["target"].astype(int), preprocessing_handler.target_map,
                                   transformed["weight"] if with_sample_weight else None,
                                   evaluation_store_folder,
                                   False,
                                   assertions=transformed.get("assertions", None))

        elif core_params["prediction_type"] == constants.MULTICLASS:
            scoring_data = multiclass_predict(clf, pipeline, modeling_params, preprocessing_handler.target_map,
                                         part_df, output_probas=recipe_desc["outputProbabilities"],
                                         # For ensemble model, we need to indicate that we have target, so that a
                                         # target-aware pipeline is selected. See 0c87605 for more information.
                                         ensemble_has_target=not dont_compute_performance)
            pred_df = scoring_data.pred_and_proba_df

            if evaluation_store_folder is not None and not dont_compute_performance:
                run_multiclass_scoring(clf, modeling_params, scoring_data.preds, scoring_data.probas,
                                       transformed["target"].astype(int),
                                       preprocessing_handler.target_map,
                                       transformed["weight"] if with_sample_weight else None,
                                       evaluation_store_folder,
                                       False,
                                       assertions=transformed.get("assertions", None))

        elif core_params["prediction_type"] == constants.REGRESSION:
            pred_df = regression_predict(clf, pipeline, modeling_params, part_df,
                                         # For ensemble model, we need to indicate that we have target, so that a
                                         # target-aware pipeline is selected. See 0c87605 for more information.
                                        ensemble_has_target=not dont_compute_performance)
                                        
            if evaluation_store_folder is not None and not dont_compute_performance:
                run_regression_scoring(clf, modeling_params, pred_df["prediction"], transformed["target"],
                                       transformed["weight"] if with_sample_weight else None,
                                       evaluation_store_folder,
                                       assertions=transformed.get("assertions", None))
        else:
            raise ValueError("bad prediction type %s" % core_params["prediction_type"])

        part_dfs["pred"].append(pred_df)
        if 'target' in transformed:
            part_dfs["target"].append(transformed["target"])
        part_dfs["unprocessed"].append(transformed["UNPROCESSED"])
        if with_sample_weight:
            part_dfs["weight"].append(transformed["weight"])

        if transformed.get("assertions", None) is not None:
            part_dfs["assertions"].append(transformed["assertions"])

    # Re-patch partitions together
    if partition_dispatch:
        if len(part_dfs["pred"]) > 0:
            pred_df = pd.concat(part_dfs["pred"], axis=0)
            if dont_compute_performance:
                y = None
            else:
                y = pd.concat(part_dfs["target"], axis=0)
            unprocessed = pd.concat(part_dfs["unprocessed"], axis=0)
            sample_weight = pd.concat(part_dfs["weight"], axis=0) if with_sample_weight else None
            assertions = MLAssertions.concatenate_assertions_list(part_dfs["assertions"])
        else:
            raise Exception("All partitions found in dataset are unknown to the model, cannot evaluate it")
    else:
        pred_df = part_dfs["pred"][0]
        if dont_compute_performance:
            y = None
        else:
            y = part_dfs["target"][0]
        unprocessed = part_dfs["unprocessed"][0]
        sample_weight = part_dfs["weight"][0] if with_sample_weight else None
        assertions = part_dfs["assertions"][0] if len(part_dfs["assertions"]) > 0 else None

    # add error information to pred_df
    target_mapping = {}
    if core_params["prediction_type"] in [constants.BINARY_CLASSIFICATION, constants.MULTICLASS]:
        target_mapping = {
            label: int(class_id)
            for label, class_id in preprocessing_handler.target_map.items()
        }
    if y is not None:
        pred_df = add_evaluation_columns(core_params["prediction_type"], pred_df, y, recipe_desc["outputs"], target_mapping)

    return pred_df, y, unprocessed, sample_weight, modeling_params, target_mapping, assertions


def compute_assertions_df(prediction_type, pred_df, assertions, target_map):
    if assertions is None:
        logger.info("No assertion provided. skipping computation")
        # return empty df for schema compatibility
        return pd.DataFrame(columns=["passingAssertionsRatio", "assertionsMetrics"])

    logger.info("Evaluating {} assertions".format(len(assertions)))
    if prediction_type in {constants.BINARY_CLASSIFICATION, constants.MULTICLASS}:
        # pred_df contains actual prediction, need to map back to index of classes to match
        # `compute_assertions_for_decision`
        preds_np_array = pred_df["prediction"].map(target_map).values
        assertions_metrics = compute_assertions_for_decision(preds_np_array, assertions, target_map)
    elif prediction_type == constants.REGRESSION:
        preds_np_array = pred_df["prediction"].values
        assertions_metrics = compute_assertions_for_regression(preds_np_array, assertions)
    else:
        raise safe_exception(ValueError, u"Unknown prediction type: {}".format(prediction_type))

    logger.info("Done evaluating assertions")
    formatted_assertions_metrics = {metric.name: metric.to_dict(with_name=False) for metric in assertions_metrics}
    return pd.DataFrame({"passingAssertionsRatio": [assertions_metrics.passing_assertions_ratio],
                         "assertionsMetrics": [dkujson.dumps(formatted_assertions_metrics)]})



if __name__ == "__main__":
    debugging.install_handler()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    read_dku_env_and_set()

    with ErrorMonitoringWrapper():
        main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4],
             dkujson.load_from_filepath(sys.argv[5]),
             dkujson.load_from_filepath(sys.argv[6]),
             dkujson.load_from_filepath(sys.argv[7]),
             dkujson.load_from_filepath(sys.argv[8]),
             sys.argv[9])
