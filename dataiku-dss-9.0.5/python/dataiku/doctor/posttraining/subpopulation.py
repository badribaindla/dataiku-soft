import os.path as osp
import os
import sys
import hashlib
import logging
import shutil
import pandas as pd
import numpy as np
import threading
from dataiku.doctor.utils.skcompat.joblib import Parallel
from dataiku.doctor.utils.skcompat.joblib import delayed

from dataiku.base.utils import TmpFolder
from dataiku.base.utils import safe_exception
from dataiku.base.utils import safe_unicode_str
from dataiku.core import dkujson
from dataiku.core.dku_logging import LogLevelContext
from dataiku.doctor import constants
from dataiku.doctor.modelevaluation.model_information_handler import ModelLessModelInformationHandler
from dataiku.doctor.posttraining.model_information_handler import PredictionModelInformationHandler
from dataiku.doctor.posttraining.percentage_progress import PercentageProgress
from dataiku.doctor.utils import unix_time_millis

logger = logging.getLogger(__name__)


def compute(job_id, split_desc, core_params, preprocessing_folder, model_folder, computation_parameters, postcompute_folder):
    if computation_parameters is None or "features_to_compute" not in computation_parameters:
        raise ValueError("Cannot compute Subpopulation analysis without 'features_to_compute'")

    # LOADING INFO #

    model_handler = PredictionModelInformationHandler(split_desc, core_params, preprocessing_folder, model_folder,
                                                      postcompute_folder)
    return compute_common(job_id, model_handler, computation_parameters)


def compute_modelless(job_id, model_evaluation, features, modelevaluation_folder,
                      iperf, resolved_preprocessing_params, computation_parameters):
    if computation_parameters is None or "features_to_compute" not in computation_parameters:
        raise ValueError("Cannot compute Subpopulation analysis without 'features_to_compute'")

    # LOADING INFO #

    model_handler = ModelLessModelInformationHandler(model_evaluation, features, iperf,
                                                     resolved_preprocessing_params, modelevaluation_folder)
    return compute_common(job_id, model_handler, computation_parameters)


def compute_common(job_id, model_handler, computation_parameters):

    output_folder = model_handler.get_output_folder()

    if computation_parameters is None or "features_to_compute" not in computation_parameters:
        raise ValueError("Cannot compute Subpopulation analysis without 'features_to_compute'")

    # LOADING INFO #

    features_to_compute = get_computation_parameter("features_to_compute", computation_parameters)
    max_modalities = get_computation_parameter("max_modalities", computation_parameters)

    debug_mode = computation_parameters.get("debug_mode", False)
    n_jobs = computation_parameters.get("n_jobs", 1)
    sample_size = computation_parameters.get("sample_size", 10000)
    random_state = computation_parameters.get("random_state", 1337)

    if model_handler.use_full_df():
        df, same_num_rows_as_split = model_handler.get_full_df()
    else:
        df, same_num_rows_as_split = model_handler.get_test_df()

    on_sample = sample_size < df.shape[0]

    if on_sample:
        df = df.sample(sample_size, random_state=random_state)

    subpop_filename = "subpop"
    subpop_path = osp.join(output_folder, "{}.json".format(subpop_filename))

    if osp.isfile(subpop_path):
        subpopulation_results = dkujson.load_from_filepath(subpop_path)
        if on_sample or subpopulation_results.get("onSample"):
            previous_sample_size = subpopulation_results.get("sampleSize")
            previous_random_state = subpopulation_results.get("randomState")
            if previous_random_state != random_state or previous_sample_size != sample_size:
                clean_previous_computation(subpopulation_results, output_folder)
                subpopulation_results = {"features": []}

    else:
        subpopulation_results = {"features": []}

    # COMPUTING SUBPOPULATION #

    progress = SubpopulationProgress(job_id, len(features_to_compute), df.shape[0])
    preprocessing_log_level = logging.DEBUG if debug_mode else logging.INFO
    log_level_context = LogLevelContext(preprocessing_log_level, [constants.PREPROCESSING_LOGGER_NAME])

    # FIRST COMPUTE METRICS ON ALL DF, IF NEEDED, TO RETRIEVE BASELINE #

    all_dataset_perf_file = osp.join(output_folder, "all_dataset_perf.json")
    if not osp.isfile(all_dataset_perf_file):
        with log_level_context:
            all_dataset_metrics = compute_all_dataset_metrics(df, model_handler, on_sample)
        with open(all_dataset_perf_file, "w") as fp:
            fp.write(all_dataset_metrics)

    # THEN COMPUTE ANALYSIS FOR EACH FEATURE #

    for feature in features_to_compute:

        feat_type = model_handler.get_type_of_column(feature)
        compute_as_type = get_type_for_computation(df, feature, feat_type, max_modalities)

        if compute_as_type == constants.CATEGORY:
            subpop_df_generator = compute_categorical_subpopulation_generator(df, feature, limit=max_modalities)
        elif compute_as_type == constants.NUMERIC:
            weight_feature = model_handler.get_sample_weight_variable()
            subpop_df_generator = compute_numeric_subpopulation_generator(df, feature, weight_feature,
                                                                          num_bins=max_modalities)
        else:
            raise NotImplementedError("Unknown feature type for Subpopulation: '%s'" % compute_as_type)

        # CREATING/RETRIEVING FOLDER THAT WILL CONTAIN RESULTS #

        results = next((f for f in subpopulation_results["features"] if f.get("feature") == feature), None)

        if results is None:
            results = {
                "feature": feature
            }

            feat_folder_name = generate_available_folder_name(results, subpopulation_results["features"])
            results["folderPath"] = feat_folder_name

            feat_folder_path = osp.join(output_folder, feat_folder_name)
            if osp.isdir(feat_folder_path):
                # the cleaning may have not been done properly in case of container exec:
                # `clean_previous_computation` was called in a container, the actual folder in DATA_DIR was not removed
                shutil.rmtree(feat_folder_path)
            os.mkdir(feat_folder_path)
        else:
            feat_folder_path = osp.join(output_folder, results["folderPath"])

        # Saving information about feature before end of computation to make it resumable in case of abortion
        subpopulation_results = update_subpopulation_results_with_feature(subpopulation_results, results)
        update_json_file(subpopulation_results, output_folder, subpop_filename)

        # COMPUTING NEW METRICS ON SUBPOP #

        is_date = next((feat.get("type")
                       for feat in model_handler.get_schema().get("columns", [])
                       if feat.get("name") == features_to_compute), None) == "date"

        feature_result = {
            "feature": feature,
            "modalities": [],
            "computed_as_type": compute_as_type,
            "isDate": is_date,
            "sameNumRowsAsSplit": same_num_rows_as_split,
            "nbRecords": df.shape[0],
            "weightedNbRecords": get_weighted_num_rows(df, model_handler)
        }

        with log_level_context:
            compute_subpopulation_metrics(subpop_df_generator, feature_result,
                                          model_handler, feat_folder_path, progress, n_jobs=n_jobs)

        # WRITING RESULTS

        results["done_at"] = unix_time_millis()

        subpopulation_results = update_subpopulation_results_with_feature(subpopulation_results, results)

        subpopulation_results["computedOn"] = "test set" if not model_handler.use_full_df() else "full dataset"
        subpopulation_results["onSample"] = on_sample
        subpopulation_results["sampleSize"] = sample_size
        subpopulation_results["randomState"] = random_state

        update_json_file(subpopulation_results, output_folder, subpop_filename)

    return "ok"


def get_type_for_computation(df, feat_name, feat_type, max_modalities):
    if feat_type == constants.NUMERIC:
        n_uniques = df[feat_name].nunique()
        if n_uniques > max_modalities:
            return constants.NUMERIC
        else:
            return constants.CATEGORY
    else:
        return feat_type


def get_weighted_num_rows(df, model_handler):
    weight_feature = model_handler.get_sample_weight_variable()
    if weight_feature is None:
        return df.shape[0]
    else:
        return df[weight_feature].sum()


def compute_categorical_subpopulation_generator(df, feature, limit=-1):

    value_counts = df[feature].value_counts(dropna=False)
    yielded_values = []

    index = 0
    must_compute_others = False

    for (value, count), is_null in zip(value_counts.iteritems(), value_counts.index.isnull()):

        if index >= limit > -1:
            must_compute_others = True
            break

        # Value may be nan, which needs a particular handling
        if is_null:
            info = {
                "index": index,
                "missing_values": True,
                "count": count
            }
            yield info, df[df[feature].isna()]
        else:
            info = {
                "index": index,
                "value": value,
                "count": count
            }

            yield info, df[df[feature] == value]
        yielded_values.append(value)
        index += 1

    # Putting every remaining values, if any, into "Rest of 'feature_name'" group
    if must_compute_others:
        remaining_df = df[~df[feature].isin(yielded_values)]
        if remaining_df.shape[0] > 0:
            info = {
                "index": index,
                "value": u"Rest of '{}'".format(safe_unicode_str(feature)),
                "count": remaining_df.shape[0]
            }
            yield info, remaining_df


def compute_numeric_subpopulation_generator(df, feature, weight_feature, num_bins=4):

    percentiles_to_compute = np.linspace(0, 1, num_bins + 1)

    # Grouping data frame by percentiles of feature
    # INFO: if two percentiles are equal (e.g. the data is not diverse enough), one is dropped
    # (with the duplicates="drop" argument, or the np.unique for weighted), so it is possible
    # that there is less than num_bins groups

    # First, building the grouping argument by percentiles
    # Handling things differently whether there are sample weights or not, as there is no builtin
    # way of computing weighted percentiles
    df_nonan_feature = df[~df[feature].isna()]
    if weight_feature is None:
        grouping_by = pd.qcut(df_nonan_feature[feature], percentiles_to_compute, duplicates="drop")
    else:
        # We need to recompute the values of weighted percentiles manually
        # We only take into account rows for which the weight is not NaN. Otherwise, it fails
        df_nonan_feature_weight = df_nonan_feature[~df_nonan_feature[weight_feature].isna()]
        weighted_cumsum = df_nonan_feature_weight[weight_feature].iloc[df_nonan_feature_weight[feature].argsort()].cumsum()
        weighted_cumsum_normalized = weighted_cumsum / weighted_cumsum.iloc[-1]
        percentiles_ilocs = weighted_cumsum_normalized.searchsorted(percentiles_to_compute)
        percentiles_indices = weighted_cumsum_normalized.index[percentiles_ilocs]
        unique_percentiles_values = np.unique(df_nonan_feature_weight.loc[percentiles_indices, feature].values)

        grouping_by = pd.cut(df_nonan_feature[feature], unique_percentiles_values, include_lowest=True)

    index = 0
    min_feat_value = df_nonan_feature[feature].min()
    for (interval, range_df) in df_nonan_feature.groupby(grouping_by):
        info = {
            "index": index,
            "lte": interval.right,
            "count": range_df.shape[0]
        }

        # For the first quantile, qcut returns a value below the min value of df[feature], to have an
        # open interval on the left. Fort a better UI, we put instead the minimal value of df[feature].
        if interval.left < min_feat_value:
            info["gte"] = min_feat_value
        else:
            info["gt"] = interval.left

        yield info, range_df
        index += 1

    # Checking whether there is missing values in 'feature' to retrieve them as a group

    missing_values = df[df[feature].isna()]

    if missing_values.shape[0] > 0:
        info = {
            "index": index,
            "missing_values": True,
            "count": missing_values.shape[0]
        }
        yield info, missing_values


def compute_all_dataset_metrics(df, model_handler, on_sample):
    logging.info("Computing metrics with all modalities")

    if model_handler.use_full_df() or on_sample:
        start = unix_time_millis()
        metrics, reason = compute_scoring_on_modality(df, model_handler, model_handler.get_output_folder())
        logging.info("Metrics with all modalities computed in {}ms".format(unix_time_millis() - start))

    else:
        original_scoring_perf_location = osp.join(model_handler.get_model_folder(), "perf.json")
        with open(original_scoring_perf_location, "r") as fp:
            metrics = fp.read()
            logging.info("Metrics with all modalities retrieved from post-training scoring")

    return metrics


def compute_subpopulation_metrics(subpop_df_generator, initial_res, model_handler,
                                  out_folder, progress, n_jobs=1):
    # COMPUTING PER VALUE METRICS #
    results = Parallel(n_jobs=n_jobs, backend="threading")(
        delayed(compute_subpopulation_metric_one_modality)
        (progress, model_handler, subpop_df, subpop_info, out_folder) for subpop_info, subpop_df in subpop_df_generator)

    initial_res["modalities"] = []
    for metrics, modality in results:
        if modality.get("excluded"):
            del modality["filePath"]
        else:
            with open(osp.join(out_folder, modality["filePath"]), "w") as fp:
                fp.write(metrics)
        initial_res["modalities"].append(modality)
    update_modality_file(initial_res, out_folder)


def compute_subpopulation_metric_one_modality(progress, model_handler, subpop_df, subpop_info, out_folder):
    logging.info("Computing subpopulation results for modality '{}'".format(subpop_info))
    start = unix_time_millis()
    new_modality = subpop_info.copy()
    modality_file_name = "modality_perf_{}.json".format(subpop_info["index"])
    new_modality["filePath"] = modality_file_name

    new_modality["weightedCount"] = get_weighted_num_rows(subpop_df, model_handler)
    metrics, reason = compute_scoring_on_modality(subpop_df, model_handler, out_folder)

    if metrics is None:
        new_modality["reason"] = reason
        new_modality["excluded"] = True
    logging.info("Computing subpopulation for modality '{}' done in {}ms".format(subpop_info, unix_time_millis() - start))

    progress.increment(subpop_info["count"])
    return metrics, new_modality


def compute_scoring_on_modality(df, model_handler, out_folder):
    prediction_type = model_handler.get_prediction_type()
    with TmpFolder(out_folder) as tmp_folder:
        if prediction_type == constants.BINARY_CLASSIFICATION:
            has_scored, reason, _ = model_handler.run_binary_scoring(df, tmp_folder)
        elif prediction_type == constants.REGRESSION:
            has_scored, reason, _ = model_handler.run_regression_scoring(df, tmp_folder)
        else:
            raise NotImplementedError("Not implemented yet :-(")

        metrics = None
        result_file_path = osp.join(tmp_folder, "perf.json")
        if has_scored and osp.isfile(result_file_path):
            with open(result_file_path) as fp:
                metrics = fp.read()
            os.remove(result_file_path)

        return metrics, reason


def update_modality_file(modality, out_folder):

    # Sort modalities by index because correspond to group priority and may not be sorted
    modality["modalities"].sort(key=lambda m: m["index"])

    update_json_file(modality, out_folder, "modality")


def get_computation_parameter(key, computation_parameters):
    if computation_parameters is None or key not in computation_parameters:
        raise safe_exception(ValueError, u"'{}' parameter must be provided in 'computation_parameters'".format(safe_unicode_str(key)))
    return computation_parameters.get(key)


def generate_available_folder_name(result, features_results):
    result_str = str(result)
    if sys.version_info > (3,0):  # Python3 hashlib.md5 requires bytes (i.e. str.encode(...)) instead of str
        result_str = result_str.encode("utf-8")
    orig_name = "subpop-{}".format(hashlib.md5(result_str).hexdigest())

    # Check that folder name is available, otherwise, try others until one is available
    already_used_names = [c["folderPath"] for c in features_results]
    i = 1
    final_name = orig_name
    while final_name in already_used_names:
        final_name = "{}-{}".format(orig_name, i)
        i += 1

    return final_name


def update_json_file(json_data, folder, file_name):
    status_filepath_tmp = osp.join(folder, "{}.json.tmp".format(file_name))
    status_filepath = osp.join(folder, "{}.json".format(file_name))
    dkujson.dump_to_filepath(status_filepath_tmp, json_data)
    os.rename(status_filepath_tmp, status_filepath)


def update_subpopulation_results_with_feature(subpopulation_results, results):
    feature = results["feature"]

    # Check whether feature already in subpopulation_results. If yes, update it, otherwise add it
    must_add_feature = True
    for index in range(len(subpopulation_results["features"])):

        current_feature = subpopulation_results["features"][index]
        if current_feature["feature"] == feature:
            subpopulation_results["features"][index] = results
            must_add_feature = False
            break

    if must_add_feature:
        subpopulation_results["features"].append(results)

    return subpopulation_results


def clean_previous_computation(previous_subpop_results, posttrain_folder):
    for feature in previous_subpop_results["features"]:
        shutil.rmtree(osp.join(posttrain_folder, feature["folderPath"]))
    os.remove(osp.join(posttrain_folder, "all_dataset_perf.json"))
    os.remove(osp.join(posttrain_folder, "subpop.json"))


class SubpopulationProgress:
    """
        Simple wrapper of PercentageProgress in the context of subpopulation,
        to send updates to the backend on the progress of Subpopulation computation.

        Has an `increment` method that will update the progress by `n_rows`

        Args:
            job_id (str): Future id of the subpopulation computation
            total_rows (int): Number of rows in the dataset used for computation

    """
    def __init__(self, job_id, n_features_to_compute, total_rows):
        self.progress = PercentageProgress(job_id)
        self.n_features_to_compute = n_features_to_compute
        self.total_rows = total_rows
        self._lock = threading.Lock()

        self.current_n_feature = 0
        self.current_nb_rows = 0

    def increment_feature(self):
        self.current_n_feature += 1
        self.progress.set_percentage(int(self.current_n_feature * 1.0 / self.n_features_to_compute * 100))

    def increment(self, n_rows):
        with self._lock:
            self.current_nb_rows += n_rows
            new_percentage = (self.current_n_feature + self.current_nb_rows * 1.0 / self.total_rows) \
                             / self.n_features_to_compute * 100
            self.progress.set_percentage(int(new_percentage))
