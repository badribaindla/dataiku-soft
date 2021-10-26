import logging
import numpy as np
import os
from dataiku.doctor.utils.skcompat.joblib import Parallel
from dataiku.doctor.utils.skcompat.joblib import delayed

from dataiku.core import dkujson
from dataiku.core.dku_logging import LogLevelContext
from dataiku.doctor import constants
from dataiku.doctor.posttraining.model_information_handler import PredictionModelInformationHandler
from dataiku.doctor.posttraining.percentage_progress import PercentageProgress
from dataiku.doctor.utils.metrics import log_odds


OTHERS_NAME = "__DKU_OTHERS__"
UNREPRESENTED_MODALITY_NAME = "__DKU_UNREPRESENTED__"


def compute(job_id, split_desc, core_params, preprocessing_folder, model_folder, modellike_folder, computation_params):
    if computation_params is None or "features_to_compute" not in computation_params:
        raise Exception("'computation_params' should contains a key 'features_to_compute'")

    if not modellike_folder:
        modellike_folder = model_folder

    model_handler = PredictionModelInformationHandler(split_desc, core_params, preprocessing_folder, model_folder)

    features_to_compute = computation_params["features_to_compute"]
    debug_mode = computation_params.get("debug_mode", False)
    n_jobs = computation_params.get("n_jobs", 1)
    sample_size = computation_params.get("sample_size", 10000)
    random_state = computation_params.get("random_state", 1337)

    if model_handler.use_full_df():
        df, _ = model_handler.get_full_df()
    else:
        df, _ = model_handler.get_test_df()

    if sample_size < df.shape[0]:
        on_sample = True
        nb_records = sample_size
    else:
        on_sample = False
        nb_records = df.shape[0]
    df = df.sample(nb_records, random_state=random_state)
    progress = PartialDependenciesProgress(job_id, len(features_to_compute))
    saver = PartialDependenciesSaver(modellike_folder, split_desc["schema"])
    computer = PartialDependencyComputer(df,
                                         model_handler.get_prediction_type(),
                                         model_handler.predict,
                                         progress,
                                         model_handler.get_sample_weight_variable(),
                                         n_jobs,
                                         debug_mode)

    for index, feature_name in enumerate(features_to_compute):
        drop_missing = model_handler.get_per_feature_col(feature_name).get("missing_handling") == "DROP_ROW"
        feature_type = model_handler.get_type_of_column(feature_name)
        is_dummified = False
        category_possible_value = None
        if feature_type == 'CATEGORY':
            # nan values are replaced by a fake one because neither a scale nor a distribution can be computed with nan
            feature_values = df[feature_name].fillna(constants.FILL_NA_VALUE).values
            is_dummified = model_handler.is_column_dummified(feature_name)
            category_possible_value = model_handler.category_possible_values(feature_name)
        else:
            feature_values = df[feature_name].values
        pd_feature = PartialDependencyFeature(feature_type,
                                              feature_values,
                                              feature_name,
                                              is_dummified,
                                              category_possible_value,
                                              drop_missing)
        result = computer.compute(pd_feature)
        saver.save(result, on_sample, nb_records, random_state)
        progress.set_percentage((index + 1) * 100 / len(features_to_compute))


class PartialDependenciesProgress(PercentageProgress):
    def __init__(self, future_id, number_of_features):
        PercentageProgress.__init__(self, future_id)
        self.number_of_features = number_of_features

    def set_percentage_for_single_computation(self, percentage, no_fail=True):
        if self.number_of_features == 1:
            self.set_percentage(percentage, no_fail=no_fail)


class PartialDependencyComputer:
    def __init__(self, df, prediction_type,
                 prediction_func, progress,
                 sample_weights_col_name, n_jobs=1,
                 debug_mode=False, max_cats=30):
        self.prediction_func = prediction_func
        self.prediction_type = prediction_type
        self.dataframe = df
        self.progress = progress
        self.max_cats = max_cats
        self.n_jobs = n_jobs

        preprocessing_log_level = logging.DEBUG if debug_mode else logging.INFO
        self.log_level_context = LogLevelContext(preprocessing_log_level, [constants.PREPROCESSING_LOGGER_NAME])

        self.n_samples = self.dataframe.shape[0]

        if sample_weights_col_name is not None:
            # Replace nan weights by zero because in the preprocessing steps,
            # rows with missing weights are dropped
            self.sample_weights = np.nan_to_num(df[sample_weights_col_name].values)
            self.weighted_samples = np.sum(self.sample_weights)
        else:
            self.sample_weights = None
            self.weighted_samples = self.n_samples

        self.base_prediction = self._predict_and_get_pd_value(df.copy())

    def compute(self, pd_feature):
        if pd_feature.type == "NUMERIC":
            return self._compute_numeric(pd_feature)
        elif pd_feature.type == "CATEGORY":
            return self._compute_category(pd_feature)

    def _compute_numeric(self, pd_feature):
        scale, distribution = self._compute_distribution(pd_feature)
        scale_size = scale.shape[0]
        indices_to_drop = []

        partial_dep = np.asarray(Parallel(n_jobs=self.n_jobs, backend="threading")(
            delayed(self._process_single_numeric_point)(pd_feature,
                                                        index,
                                                        value,
                                                        indices_to_drop,
                                                        scale_size) for index, value in enumerate(scale)))

        partial_dep = partial_dep - self.base_prediction
        partial_dep = partial_dep.transpose()

        if self.prediction_type in ["REGRESSION", "BINARY_CLASSIFICATION"]:
            # Always use a 2D array
            partial_dep = partial_dep[np.newaxis]

        return PartialDependencyResult(pd_feature, scale, distribution, partial_dep, indices_to_drop=indices_to_drop)

    def _process_single_numeric_point(self, pd_feature, index, value, indices_to_drop, scale_size):
        with self.log_level_context:
            pd_value = self._predict_and_get_pd_value_for(pd_feature.name, value)
            if pd_value is None:
                indices_to_drop.append(index)
                pd_value = self.base_prediction  # Arbitrary value used here, should be dropped in the front

        self.progress.set_percentage_for_single_computation(index * 100 / scale_size)
        return pd_value

    def _compute_category(self, pd_feature):
        unrepresented_modalities = []
        indices_to_drop = []
        scale, distribution = self._compute_distribution(pd_feature)
        scale_size = scale.shape[0]

        # Sorting the distribution and the scale, putting more frequent modalities first
        indices = np.argsort(-distribution)
        scale = scale[indices]
        distribution = distribution[indices]
        unrepresented_pd_value = self._predict_and_get_pd_value_for_unrepresented_modality(pd_feature)

        partial_dep = np.asarray(Parallel(n_jobs=self.n_jobs, backend="threading")(
            delayed(self._process_single_categorical_point)(index,
                                                            value,
                                                            indices_to_drop,
                                                            pd_feature,
                                                            unrepresented_modalities,
                                                            unrepresented_pd_value,
                                                            scale_size) for index, value in enumerate(scale)))

        if partial_dep.shape[0] > self.max_cats:
            partial_dep, scale, distribution = self.aggregate_less_frequent_values(partial_dep, scale, distribution)

        if pd_feature.is_dummified:
            # Add a fake modality that represents a modality the model doesn't know
            # It's only used to compare with others modalities and it's not present in the test
            # so its distribution is zero
            partial_dep = np.append(partial_dep, [unrepresented_pd_value], axis=0)
            distribution = np.append(distribution, 0.0)
            scale = np.append(scale, UNREPRESENTED_MODALITY_NAME)

        partial_dep = partial_dep - self.base_prediction
        partial_dep = partial_dep.transpose()

        if self.prediction_type in ["REGRESSION", "BINARY_CLASSIFICATION"]:
            # Always use a 2D array
            partial_dep = partial_dep[np.newaxis]

        return PartialDependencyResult(pd_feature, scale, distribution, partial_dep,
                                       indices_to_drop=indices_to_drop,
                                       unrepresented_modalities=unrepresented_modalities)

    def _process_single_categorical_point(self,
                                          index,
                                          value,
                                          indices_to_drop,
                                          pd_feature,
                                          unrepresented_modalities,
                                          unrepresented_pd_value,
                                          n_points):
        with self.log_level_context:
            if value == constants.FILL_NA_VALUE and pd_feature.drop_missing:
                # All rows will be dropped, no prediction can be computed
                indices_to_drop.append(index)
                # Arbitrary value used here, should be dropped in the front
                pd_value = self.base_prediction
            else:
                # If the modality is not known by the model we know for sure that its partial dependence
                # has the same value as the unrepresented_pd_value, no need for a another computation
                if pd_feature.is_represented(value):
                    if value == constants.FILL_NA_VALUE:
                        value = np.nan
                    pd_value = self._predict_and_get_pd_value_for(pd_feature.name, value)
                else:
                    unrepresented_modalities.append(value)
                    pd_value = unrepresented_pd_value

                if pd_value is None:
                    # Arbitrary value used here, should be dropped in the front
                    indices_to_drop.append(index)
                    pd_value = self.base_prediction

        self.progress.set_percentage_for_single_computation(index * 100 / n_points)

        return pd_value

    def aggregate_less_frequent_values(self, partial_dep, scale, distribution):
        new_scale = np.concatenate((scale[:self.max_cats], np.asarray([OTHERS_NAME])))

        distribution_to_keep = distribution[:self.max_cats]
        distribution_to_aggregate = distribution[self.max_cats:]

        partial_dep_to_keep = partial_dep[:self.max_cats]
        partial_dep_to_aggregate = partial_dep[self.max_cats:]

        aggregated_distribution = np.zeros((self.max_cats + 1))
        aggregated_distribution[:self.max_cats] = distribution_to_keep
        aggregated_distribution[-1] = np.sum(distribution_to_aggregate)

        shape = (self.max_cats + 1, partial_dep.shape[1]) if partial_dep.ndim == 2 else (self.max_cats + 1)
        aggregated_partial_dep = np.zeros(shape)
        aggregated_partial_dep[:self.max_cats] = partial_dep_to_keep
        aggregated_partial_dep[-1] = np.average(partial_dep_to_aggregate, axis=0, weights=distribution_to_aggregate)

        return aggregated_partial_dep, new_scale, aggregated_distribution

    def _compute_distribution(self, pd_feature):
        if pd_feature.type == 'NUMERIC':
            not_empty = pd_feature.values[~np.isnan(pd_feature.values)]
            scale = np.linspace(np.min(not_empty),
                                np.max(not_empty),
                                num=50)
            hist, _ = np.histogram(pd_feature.values, bins=scale, density=False, weights=self.sample_weights)
            distribution = hist * 1.0 / np.sum(hist)

        elif pd_feature.type == 'CATEGORY':
            scale, counts = np.unique(pd_feature.values, return_counts=True)
            if self.sample_weights is not None:
                weighted_counts = np.array([
                    np.sum(self.sample_weights[np.where(pd_feature.values == modality)]) for modality in scale])
            else:
                weighted_counts = counts
            distribution = np.asarray(weighted_counts, dtype=float) / np.sum(weighted_counts)

        else:
            raise ValueError("The feature type '{}' is not supported for "
                             "Partial Dependence computation".format(pd_feature.type))

        return scale, distribution

    def _predict_and_get_pd_value_for_unrepresented_modality(self, pd_feature):
        # Unrepresented modality is a modality that the model doesn't know (not in the train set
        # or too many modalities exist and this one has been discarded.
        # This function compute the partial dependence for a such modality
        # with a fake one named ${UNREPRESENTED_MODALITY_NAME}
        return self._predict_and_get_pd_value_for(pd_feature.name, UNREPRESENTED_MODALITY_NAME)

    def _predict_and_get_pd_value_for(self, col_name, value):
        df_copy = self.dataframe.copy()
        df_copy[col_name] = value
        return self._predict_and_get_pd_value(df_copy)

    def _predict_and_get_pd_value(self, df):
        clip_min = 0.01
        clip_max = 0.99
        pred = self.prediction_func(df, output_probas=True)

        if pred.empty:
            return None
        else:
            if self.sample_weights is not None:
                # remove rows of weights that could have been dropped by the preprocessing
                weights = self.sample_weights[pred.index]
            else:
                weights = None
            if self.prediction_type == "REGRESSION":
                pd_values = pred["prediction"].values
            elif self.prediction_type == "BINARY_CLASSIFICATION":
                prob_cols = pred.values[:, 2]
                pd_values = log_odds(prob_cols, clip_min=clip_min, clip_max=clip_max)
            elif self.prediction_type == "MULTICLASS":
                prob_cols = pred.drop("prediction", axis="columns").values
                pd_values = log_odds(prob_cols, clip_min=clip_min, clip_max=clip_max)
            else:
                raise ValueError("The prediction type '{}' is not supported for "
                                 "Partial dependence computation".format(self.prediction_type))

            return np.average(pd_values, weights=weights, axis=0)


class PartialDependencyFeature:
    def __init__(self, feature_type, values, name, is_dummified=False, dummified_modalities=None, drop_missing=False):
        self.type = feature_type
        self.values = values
        self.name = name
        self._dummified_modalities = dummified_modalities
        self.is_dummified = is_dummified
        self.drop_missing = drop_missing

    def is_represented(self, value):
        """
        Returns True if the column is not dummified, else it checks if the value/modality
        is known by the model, e.g. if the preprocessing dummify this modality
        :param value: modality of the feature
        :return: boolean
        """
        if self.is_dummified:
            return value in self._dummified_modalities
        else:
            # Return always True in this case for now, can be more clever depending on the feature handling
            return True


class PartialDependencyResult:
    def __init__(self,
                 pd_feature,
                 scale,
                 distribution,
                 partial_dependence,
                 indices_to_drop=None,
                 unrepresented_modalities=None):
        self.feature = pd_feature
        self.scale = scale
        self.distribution = distribution
        self.partial_dependence = partial_dependence
        self.indices_to_drop = indices_to_drop
        self.unrepresented_modalities = unrepresented_modalities


class PartialDependenciesSaver:
    def __init__(self, folder, schema):
        self.folder = folder
        self.dtypes = {}
        for col in schema["columns"]:
            self.dtypes[col["name"]] = col["type"]

    def save(self, pd_result, on_sample, nb_records, random_state):
        iperf = dkujson.load_from_filepath(os.path.join(self.folder, "iperf.json"))

        if "partialDependencies" not in iperf:
            iperf["partialDependencies"] = []

        for partial_dep in iperf["partialDependencies"]:
            if partial_dep.get('feature') == pd_result.feature.name:
                iperf["partialDependencies"].remove(partial_dep)
                break

        new_partial_dependence = {
            "data": list(pd_result.partial_dependence),
            "feature": pd_result.feature.name,
            "distribution": pd_result.distribution,
            "computedPostTraining": True,
            "isDate": self.dtypes[pd_result.feature.name] == "date",
            "unrepresentedModalities": pd_result.unrepresented_modalities,
            "nbRecords": nb_records,
            "onSample": on_sample,
            "randomState": random_state
        }

        if pd_result.indices_to_drop is not None:
            new_partial_dependence["indicesToDrop"] = pd_result.indices_to_drop

        if pd_result.feature.type == 'CATEGORY':
            new_partial_dependence["categories"] = list(pd_result.scale)
        elif pd_result.feature.type == 'NUMERIC':
            new_partial_dependence["featureBins"] = list(pd_result.scale)

        iperf["partialDependencies"].append(new_partial_dependence)
        dkujson.dump_to_filepath(os.path.join(self.folder, "iperf.json"), iperf)

        return iperf
