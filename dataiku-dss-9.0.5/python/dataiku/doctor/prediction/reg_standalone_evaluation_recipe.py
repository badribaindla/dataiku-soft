# encoding: utf-8

"""
Execute an evaluation recipe in PyRegular mode
Must be called in a Flow environment
"""

import sys, json, os.path as osp, logging
from pandas.core.dtypes.common import is_datetime64_any_dtype
from six.moves import xrange

from dataiku.base.utils import safe_unicode_str
from dataiku.base.utils import ErrorMonitoringWrapper
from dataiku.doctor.utils import normalize_dataframe, dku_deterministic_value_counts
from dataiku.doctor.utils.split import load_df_with_normalization
from dataiku.doctor.prediction_entrypoints import *
from dataiku.doctor.prediction.reg_scoring_recipe import load_model_partitions
from dataiku.doctor.prediction.reg_scoring_recipe import generate_part_df_and_model_params
from dataiku.doctor.prediction.reg_scoring_recipe import get_input_parameters
from dataiku.doctor.preprocessing_collector import PredictionPreprocessingDataCollector

from dataiku.doctor.prediction import RegressionModelScorer
from dataiku.doctor.prediction.classification_scoring import BinaryClassificationModelScorer, MulticlassModelScorer

from ..preprocessing_handler import *
from dataiku.core import debugging
from dataiku.core import dkujson as dkujson
from dataiku import Dataset
try:
    import cPickle as pickle
except:
    import pickle
from dataiku.doctor.prediction.evaluation_base import build_statistics, run_binary_scoring, run_multiclass_scoring, run_regression_scoring

import datetime as dt
from dataiku.base.remoterun import read_dku_env_and_set

logger = logging.getLogger(__name__)

class FakeClf(object):
    def __init__(self, is_proba_aware, classes=[]):
        if is_proba_aware:
            self.predict_proba = 'fake'
        self.classes_ = classes
            
def main(input_dataset_smartname, recipe_desc, preparation_output_schema, evaluation_store_folder):

    evaluation = dkujson.load_from_filepath(osp.join(evaluation_store_folder, "evaluation.json"))
    
    rppp_file = osp.join(evaluation_store_folder, 'rpreprocessing_params.json')
    if osp.exists(rppp_file):
        resolved_preprocessing_params = dkujson.load_from_filepath(rppp_file)
    else:
        # should not happen
        resolved_preprocessing_params = {'target_remapping':[], 'per_feature':{}} 
    
    prediction_type = evaluation["predictionType"]
    # rebuild a fake modeling_params
    modeling_params = {}
    modeling_params['algorithm'] = 'EVALUATED'
    modeling_params['metrics'] = evaluation.get('metricParams', {})
    is_proba_aware = recipe_desc.get('isProbaAware', False)
    if is_proba_aware:
        modeling_params['autoOptimizeThreshold'] = recipe_desc.get("autoOptimizeThreshold", False)
        modeling_params['forcedClassifierThreshold'] = evaluation.get('activeClassifierThreshold', 0.5)
    else:
        modeling_params['autoOptimizeThreshold'] = False
        modeling_params['forcedClassifierThreshold'] = 0.5

    # have a fake clf (only virtue is to not have a feature importance field :) )
    clf = FakeClf(is_proba_aware)
  
    # infer the target map from the classes settings of the evaluation
    target_mapping = {
        c['sourceValue']: int(c['mappedValue'])
        for c in resolved_preprocessing_params.get('target_remapping', [])
    }
                
    # get the data, with the dataset types
    
    # Input column infos
    (names, dtypes, parse_date_columns) = Dataset.get_dataframe_schema_st(
        preparation_output_schema["columns"], parse_dates=True, infer_with_pandas=False, bool_as_str=True, int_as_float=True)

    target_column_name = recipe_desc.get('targetVariable', '')
    prediction_column_name = recipe_desc.get('predictionVariable', '')
    if prediction_column_name is None or len(prediction_column_name) == 0:
        raise Exception("Prediction column not set")
    weight_column_name = recipe_desc.get('weightsVariable', '')
    logger.info("target=%s prediction=%s weights=%s" % (target_column_name, prediction_column_name, weight_column_name))
    if target_column_name in dtypes:
        if prediction_type == constants.BINARY_CLASSIFICATION or prediction_type == constants.MULTICLASS:
            logger.info("using target_mapping=%s" % target_mapping)
            # force the target to string so that we don't have pandas converting int columns to floats
            logger.info("fixing up target %s in %s" % (target_column_name, dtypes))
            dtypes[target_column_name] = np.object_
            dtypes[prediction_column_name] = np.object_
        elif prediction_type == constants.REGRESSION:
            dtypes[target_column_name] =  np.float64
            

    logger.info("Read with dtypes=%s" % dtypes)

    input_ds = dataiku.Dataset(input_dataset_smartname)
    with input_ds._stream(infer_with_pandas=True,
                 sampling=recipe_desc.get('selection', {"samplingMethod":"FULL"}),
                 columns=names) as dku_output:
        input_df = pd.read_table(dku_output,
                         names=names,
                         dtype=dtypes,
                         header=None,
                         sep='\t',
                         doublequote=True,
                         quotechar='"',
                         parse_dates=parse_date_columns,
                         float_precision='round_trip')
    
    logger.info("Got a dataframe : %s" % str(input_df.shape))
    logger.info("dtypes : %s" % str(input_df.dtypes))
    # no need for preprocessing, since the prediction is already  here
    # but still need to ignore the rows with no prediction or target (below)
    
    if weight_column_name is not None and len(weight_column_name) > 0:
        if weight_column_name not in input_df:
            raise Exception("Weight column '%s' is not in the input" % weight_column_name)
    if target_column_name is not None and len(target_column_name) > 0:
        if target_column_name not in input_df:
            raise Exception("Target column '%s' is not in the input" % target_column_name)
    
    input_df_orig = input_df.copy()

    # extract the prediction/target/weight/probas from the data (if applicable)
    target = input_df[target_column_name] if target_column_name in input_df else None
    preds = input_df[prediction_column_name]
    if len(weight_column_name) > 0 and weight_column_name in input_df:
        weight = input_df[weight_column_name]
    else:
        weight = None
    
    no_preds_idx = preds.isnull()
    if target is not None:
        no_target_idx = target.isnull()    
    else:
        no_target_idx = np.zeros(preds.shape, dtype=np.bool)
    no_weight_idx = weight.isnull() if weight is not None else np.full_like(preds, False, dtype=bool)
    
    missing_idx = no_preds_idx | no_target_idx | no_weight_idx
    logger.info("Deleting rows because no target -> %s , no prediction -> %s , no weight %s , overall %s" % (no_target_idx.sum(), no_preds_idx.sum(), no_weight_idx.sum(), missing_idx.sum()))
    
    if missing_idx.sum() > 0:
        input_df.drop(input_df.index[utils.series_nonzero(missing_idx)], inplace=True)
        input_df.index = range(0, input_df.shape[0])
        # redo the series
        target = input_df[target_column_name] if target_column_name in input_df else None
        preds = input_df[prediction_column_name]
        if len(weight_column_name) > 0 and weight_column_name in input_df:
            weight = input_df[weight_column_name]
            assert weight.values.min() > 0, "Sample weights must be positive"
        else:
            weight = None
    
    if prediction_type == constants.BINARY_CLASSIFICATION or prediction_type == constants.MULTICLASS:
        if is_proba_aware:
            probas = input_df[[kv['value'] for kv in recipe_desc.get('probas', [])]].values
        else:
            probas = None
    else:
        probas = None
        
    # reindex the weights to align with the target
    if weight is not None:
        weight.index = preds.index

    # build the unmapped prediction and target (that the scoring methods expect)
    if target is not None:
        current_mapping = target_mapping
        if prediction_type == constants.BINARY_CLASSIFICATION or prediction_type == constants.MULTICLASS:
            unmapped_preds = np.zeros(preds.shape, np.object)
            unmapped_target = np.zeros(target.shape, np.object)
            if target_mapping:
                for k, v in target_mapping.items():
                    v = int(v)
                    mask = preds.astype('str') == k  # because k is always str
                    unmapped_preds[mask.values] = v

                for k, v in target_mapping.items():
                    v = int(v)
                    mask = target.astype('str') == k # because k is always str
                    unmapped_target[mask.values] = v
            else:
                auto_mapping = np.unique(np.concatenate((preds, target)))
                current_mapping = {v: index[0] for index, v in np.ndenumerate(auto_mapping)}
                for k, v in current_mapping.items():
                    mask_preds = preds == k
                    mask_target = target == k
                    unmapped_preds[mask_preds.values] = v
                    unmapped_target[mask_target.values] = v

            unmapped_preds = pd.Series(unmapped_preds, dtype=int, name=preds.name)
            unmapped_target = pd.Series(unmapped_target, dtype=int, name=target.name)

        if prediction_type == constants.BINARY_CLASSIFICATION:
            run_binary_scoring(clf, modeling_params, unmapped_preds, probas, unmapped_target, current_mapping, weight, evaluation_store_folder, True)
    
        elif prediction_type == constants.MULTICLASS:
            run_multiclass_scoring(clf, modeling_params, unmapped_preds, probas, unmapped_target, current_mapping, weight, evaluation_store_folder, True)
    
        elif prediction_type == constants.REGRESSION:
            run_regression_scoring(clf, modeling_params, preds, target, weight, evaluation_store_folder)

    # compute statistics on the evaluated data
    
    rppp_file = osp.join(evaluation_store_folder, 'rpreprocessing_params.json')
    if osp.exists(rppp_file):
        preprocessing_params = dkujson.load_from_filepath(rppp_file)
    else:
        preprocessing_params = {"per_feature":{}}
    feature_preproc = preprocessing_params.get('per_feature', {})
    statistics = build_statistics(input_df_orig, feature_preproc, prediction_type)
    statistics_file = osp.join(evaluation_store_folder, 'evaluated_data_statistics.json')
    dkujson.dump_to_filepath(statistics_file, statistics)
    
    # compute the collector_data on the sample (not the full evaluated data)
    sample_file = osp.join(evaluation_store_folder, 'sample_scored.csv.gz')
    sample_schema_file = osp.join(evaluation_store_folder, 'sample_scored_schema.json')
    sample_schema = dkujson.load_from_filepath(sample_schema_file)

    sample_df = load_df_with_normalization(sample_file, sample_schema, feature_preproc, prediction_type)
    collector = PredictionPreprocessingDataCollector(sample_df, preprocessing_params)
    collector_data = collector.build()
    collector_data_filename = osp.join(evaluation_store_folder, "collector_data.json")
    dkujson.dump_to_filepath(collector_data_filename, collector_data)

if __name__ == "__main__":
    debugging.install_handler()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    read_dku_env_and_set()

    with ErrorMonitoringWrapper():
        main(sys.argv[1], dkujson.load_from_filepath(sys.argv[2]),  dkujson.load_from_filepath(sys.argv[3]), sys.argv[4])
