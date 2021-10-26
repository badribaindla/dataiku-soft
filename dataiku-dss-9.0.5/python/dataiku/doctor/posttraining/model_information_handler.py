import logging
import math
import os.path as osp
from abc import abstractmethod, ABCMeta

import numpy as np
import pandas as pd
import re

from dataiku.base.utils import RaiseWithTraceback
from dataiku.core import dkujson
from dataiku.core.saved_model import build_predictor
from dataiku.core.base import get_dip_home
from dataiku.doctor import constants
from dataiku.doctor.prediction import RegressionModelScorer
from dataiku.doctor.prediction.classification_scoring import BinaryClassificationModelScorer
from dataiku.doctor.preprocessing_handler import PreprocessingHandler, DkuDroppedMultiframeException
from dataiku.doctor.utils import dku_pickle
from dataiku.doctor.utils.split import df_from_split_desc, get_analysis_model_resolved_split_desc,\
    get_saved_model_resolved_split_desc

logger = logging.getLogger(__name__)


class ModelInformationHandlerBase(object):
    __metaclass__ = ABCMeta

    @abstractmethod
    def use_full_df(self):
        pass

    @abstractmethod
    def get_sample_weight_variable(self):
        pass

    @abstractmethod
    def get_output_folder(self):
        pass

    @abstractmethod
    def get_schema(self):
        pass

    @abstractmethod
    def get_target_variable(self):
        pass

    @abstractmethod
    def get_prediction_type(self):
        pass

    @abstractmethod
    def get_type_of_column(self, col_name):
        pass

    @abstractmethod
    def run_binary_scoring(self, df, out_folder):
        pass

    @abstractmethod
    def run_regression_scoring(self, df, out_folder):
        pass

    @abstractmethod
    def get_full_df(self):
        pass

    def get_per_feature(self):
        return self.get_preprocessing_params().get("per_feature")

    def get_per_feature_col(self, col_name):
        per_feature = self.get_per_feature()
        if col_name not in per_feature.keys():
            raise ValueError("Column '{}' not found".format(col_name))
        return per_feature[col_name]

    def is_column_dummified(self, col_name):
        return self.get_per_feature()[col_name].get("category_handling") == "DUMMIFY"

    def category_possible_values(self, col_name):
        """
        Get the list of modalities which are dummified by the preprocessing for the given column
        :param col_name: the name of the column
        :return: None if the column is not dummified else it returns the list of modalities that are dummified
        """
        if not self.is_column_dummified(col_name):
            return None
        possible_values = self.get_collector_data()["per_feature"][col_name].get("category_possible_values")
        missing_handling = self.get_per_feature_col(col_name).get("missing_handling")
        if missing_handling == "NONE":  # Treat as regular value
            possible_values.append(constants.FILL_NA_VALUE)
        return possible_values


class PredictionModelInformationHandlerBase(ModelInformationHandlerBase):
    __metaclass__ = ABCMeta

    @abstractmethod
    def get_explainer(self):
        pass

    @abstractmethod
    def get_model_folder(self):
        pass

    @abstractmethod
    def get_test_df(self):
        pass

    @abstractmethod
    def predict(self, df, output_probas=True):
        pass


# WARNING: this class is used for plugin development (trained and saved models views).
# Beware not to make breaking changes
class PredictionModelInformationHandler(PredictionModelInformationHandlerBase):

    def __init__(self, split_desc, core_params, preprocessing_folder, model_folder, postcompute_folder=None):

        self._split_desc = split_desc
        self._core_params = core_params
        self._preprocessing_folder = preprocessing_folder
        self._model_folder = model_folder
        self._preprocessing_params = dkujson.load_from_filepath(osp.join(preprocessing_folder,
                                                                         "rpreprocessing_params.json"))
        self._modeling_params = dkujson.load_from_filepath(osp.join(model_folder, "rmodeling_params.json"))
        self._keras_scoring_batch_size = 100

        self._predictor = build_predictor(
            "PREDICTION",
            self._model_folder,
            self._preprocessing_folder,
            [],  # no need for conditional outputs in this case
            self._core_params,
            self._split_desc
        )

        self._collector_data = None
        self._preproc_handler = None
        self._pipeline = None
        self._clf = None
        self._train_df = None
        self._test_df = None
        self._full_df = None
        if not postcompute_folder:
            self._postcompute_folder = osp.join(self._model_folder, "posttrain")
        else:
            self._postcompute_folder = postcompute_folder

    @staticmethod
    def from_full_model_id(fmi):
        try:
            match = re.match(r"^A-(\w+)-(\w+)-(\w+)-(s[0-9]+)-(pp[0-9]+(-part-(?:\w+)|-base)?)-(m[0-9]+)$", fmi)
            if match is not None:
                return PredictionModelInformationHandler._for_trained_model(*match.groups())
            match = re.match(r"^S-(\w+)-(\w+)-(\w+)(-part-(?:\w+)-(?:v?\d+))?$", fmi)
            if match is not None:
                return PredictionModelInformationHandler._for_saved_model(*match.groups())
        except Exception as e:
            from sys import exc_info
            if str(e).endswith("ordinal not in range(128)"):
                raise SystemError("You are using a Python 3 code-env, cannot load a Python 2 model.", exc_info()[2])
            elif str(e) == "non-string names in Numpy dtype unpickling":
                raise SystemError("You are using a Python 2 code-env, cannot load a Python 3 model.", exc_info()[2])
            raise e
        # No regex match on full model id
        raise ValueError("Invalid model id: {}".format(fmi))

    @staticmethod
    def _for_trained_model(project_key, analysis_id, mltask_id, session_id, preproc_id, partition, model_id):
        mltask_folder = osp.join(get_dip_home(), "analysis-data", project_key, analysis_id, mltask_id)
        session_folder = osp.join(mltask_folder, "sessions", session_id)
        preproc_folder = osp.join(session_folder, preproc_id)
        model_folder = osp.join(preproc_folder, model_id)

        core_params = dkujson.load_from_filepath(osp.join(session_folder, "core_params.json"))
        split_desc = get_analysis_model_resolved_split_desc(model_folder, partition is not None)

        return PredictionModelInformationHandler(split_desc, core_params, preproc_folder, model_folder)

    @staticmethod
    def _for_saved_model(project_key, sm_id, version_id, partition):
        model_folder = osp.join(get_dip_home(), "saved_models", project_key, sm_id,
                                "versions" if partition is None else "pversions", version_id)
        core_params = dkujson.load_from_filepath(osp.join(model_folder, "core_params.json"))
        split_desc = get_saved_model_resolved_split_desc(model_folder)
        return PredictionModelInformationHandler(split_desc, core_params, model_folder, model_folder)

    def get_predictor(self):
        return self._predictor

    def get_explainer(self):
        return self._predictor._individual_explainer

    def is_ensemble(self):
        return self._modeling_params.get("algorithm", None) == "PYTHON_ENSEMBLE"

    def is_kfolding(self):
        return self._split_desc["params"].get("kfold", False)

    def use_full_df(self):
        return self.is_kfolding()

    def is_keras_backend(self):
        return self._modeling_params["algorithm"] == "KERAS_CODE"

    def get_weight_method(self):
        return self._core_params.get("weight", {}).get("weightMethod", None)

    def get_sample_weight_variable(self):
        return self._core_params.get("weight", {}).get("sampleWeightVariable", None)

    def with_sample_weights(self):
        return self.get_weight_method() in {"SAMPLE_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}

    def set_keras_scoring_batch_size(self, new_value):
        self._keras_scoring_batch_size = new_value

    def get_clf(self):
        if self.is_keras_backend():
            return None

        if self._clf is None:
            with open(osp.join(self._model_folder, "clf.pkl"), "rb") as f:
                self._clf = dku_pickle.load(f)
        return self._clf

    def get_output_folder(self):
        return self._postcompute_folder

    def get_model_folder(self):
        return self._model_folder

    def get_preprocessing_params(self):
        return self._preprocessing_params

    def get_modeling_params(self):
        return self._modeling_params

    def get_split_desc(self):
        return self._split_desc

    def get_schema(self):
        return self._split_desc.get("schema", {})

    def get_target_variable(self):
        return self._core_params["target_variable"]

    def get_prediction_type(self):
        return self._core_params["prediction_type"]

    def get_target_map(self):
        return self.get_preproc_handler().target_map

    def get_inv_map(self):
        return {int(v): k for (k, v) in self.get_target_map().items()}

    def get_per_feature(self):
        return self.get_preprocessing_params().get("per_feature")

    def get_sample_weight_variable(self):
        return self._core_params.get("weight", {}).get("sampleWeightVariable", None)

    def get_per_feature_col(self, col_name):
        per_feature = self.get_per_feature()
        if col_name not in per_feature.keys():
            raise ValueError("Column '{}' not found".format(col_name))
        return per_feature[col_name]

    def get_type_of_column(self, col_name):
        return self.get_per_feature_col(col_name)["type"]

    def get_role_of_column(self, col_name):
        return self.get_per_feature_col(col_name)["role"]

    def predict_and_concatenate(self, df, output_probas=True):
        orig_df = df.copy()
        pred_df = self.predict(df, output_probas)
        return pd.concat([orig_df, pred_df], axis=1)

    # Behaves as scoring recipe, i.e. returns:
    #  - For binary : ["prediction", "proba_{class1}", "proba_{class2}"] with "proba_..." only if "output_probas"
    #  - For multiclass : ["prediction", "proba_{class1}", "proba_{class2}", ..., "proba_{classN}"]  with "proba_..."
    #    only if "output_probas"
    #  - For regression: ["prediction"]
    #
    #  Note that the prediction may alter the input dataframe
    def predict(self, df, output_probas=True):
        if self.is_ensemble():
            return self._predictor.get_prediction_dataframe(df, True, output_probas, False, False)
        else:
            return self._predictor._get_prediction_dataframe(df, True, output_probas, False, False)


    def prepare_for_scoring(self, df):

        # Preprocess data

        # Ensemble models embeds the preprocessing inside the model so we don't need to preprocess them before calling
        # predict. However we need to preprocess them to get valid_y
        if self.is_ensemble():
            df_copy = df.copy()
            transform = self.get_pipeline().process(df)
            valid_y = transform["target"]
            transformed_df = df_copy

            if self.with_sample_weights():
                valid_sample_weights = transform["weight"]
            else:
                valid_sample_weights = None

        else:

            try:
                transformed_df, _, is_empty, valid_y, valid_sample_weights = self._predictor.preprocessing.preprocess(
                                                                                        df,
                                                                                        with_target=True,
                                                                                        with_sample_weights=True)
            except DkuDroppedMultiframeException:
                # preprocessing failed because all targets (or weights) are NaN
                return ScoringData(is_empty=True, reason=constants.PREPROC_NOTARGET)

            # No need to predict if all the rows are dropped
            if is_empty:
                return ScoringData(is_empty=True, reason=constants.PREPROC_DROPPED)

        # Run prediction
        # Must do predict and predict_proba separately because can be custom
        preds = self._predictor._predict_raw(transformed_df)
        try:
            probas = self._predictor._predict_raw_proba(transformed_df)
        except AttributeError:
            probas = None

        return ScoringData(preds=preds, probas=probas, valid_y=valid_y, valid_sample_weights=valid_sample_weights)

    # For KERAS algorithm, cannot preprocess full data directly, must work with batches
    def prepare_for_scoring_full(self, df):
        if not self.is_keras_backend():
            return self.prepare_for_scoring(df)
        else:
            scoring_data_batches = ScoringDataConcatenator()
            num_rows = df.shape[0]
            nb_batches = int(math.ceil(num_rows * 1.0 / self._keras_scoring_batch_size))

            for num_batch in range(nb_batches):
                input_df_batch = df.iloc[num_batch * self._keras_scoring_batch_size: (num_batch + 1) * self._keras_scoring_batch_size, :]
                scoring_data = self.prepare_for_scoring(input_df_batch)
                scoring_data_batches.add_scoring_data(scoring_data)

            full_scoring_data = scoring_data_batches.get_concatenated_scoring_data()
            return full_scoring_data

    def run_binary_scoring(self, df, out_folder):
        if self.get_prediction_type() == constants.BINARY_CLASSIFICATION:
            scoring_data = self.prepare_for_scoring_full(df)

            if scoring_data.is_empty:
                return False, scoring_data.reason, None

            # Check that both classes are present, otherwise scoring fails
            n_classes_valid = np.unique(scoring_data.valid_y).shape[0]
            if n_classes_valid < 2:
                return False, constants.PREPROC_ONECLASS, None

            binary_classif_scorer = BinaryClassificationModelScorer(
                self._modeling_params,
                self.get_clf(),
                out_folder,
                scoring_data.preds,
                scoring_data.probas,
                scoring_data.valid_y,
                self.get_target_map(),
                valid=None,  # Not dumping on disk predicted_df
                test_df_index=None,  # Not dumping on disk predicted_df
                sample_weight=scoring_data.valid_sample_weights,
                ignore_num_classes=(self.get_clf() is None))
            return True, None, binary_classif_scorer.score()

        else:
            raise ValueError("Cannot compute binary scoring on '{}' model".format(self.get_prediction_type().lower()))

    def run_regression_scoring(self, df, out_folder):
        if self.get_prediction_type() == constants.REGRESSION:
            scoring_data = self.prepare_for_scoring_full(df)

            if scoring_data.is_empty:
                return False, scoring_data.reason, None

            regression_scorer = RegressionModelScorer(self._modeling_params,
                                                      self.get_clf(),
                                                      scoring_data.preds,
                                                      scoring_data.valid_y,
                                                      out_folder,
                                                      valid=None,  # Not dumping on disk predicted_df
                                                      input_df_index=None,  # Not dumping on disk predicted_df
                                                      sample_weight=scoring_data.valid_sample_weights)
            return True, None, regression_scorer.score()

        else:
            raise ValueError("Cannot compute regression scoring on '{}' model".format(self.get_prediction_type().lower()))

    def get_collector_data(self):
        if self._collector_data is None:
            self._collector_data = dkujson.load_from_filepath(osp.join(self._preprocessing_folder, "collector_data.json"))
        return self._collector_data

    def get_preproc_handler(self):
        if self._preproc_handler is None:
            self._preproc_handler = PreprocessingHandler.build(self._core_params, self._preprocessing_params,
                                                               self._preprocessing_folder)
            self._preproc_handler.collector_data = self.get_collector_data()
        return self._preproc_handler

    def get_pipeline(self, with_target=True):
        if self._pipeline is None:
            preprocessing_handler = PreprocessingHandler.build(self._core_params, self._preprocessing_params,
                                                               self._preprocessing_folder)
            preprocessing_handler.collector_data = self.get_collector_data()
            self._pipeline = self.get_preproc_handler().build_preprocessing_pipeline(with_target=with_target)
        return self._pipeline

    def category_possible_values(self, col_name):
        """
        Get the list of modalities which are dummified by the preprocessing for the given column
        :param col_name: the name of the column
        :return: None if the column is not dummified else it returns the list of modalities that are dummified
        """
        if not self.is_column_dummified(col_name):
            return None
        possible_values = self.get_collector_data()["per_feature"][col_name].get("category_possible_values")
        missing_handling = self.get_per_feature_col(col_name).get("missing_handling")
        if missing_handling == "NONE":  # Treat as regular value
            possible_values.append(constants.FILL_NA_VALUE)
        return possible_values

    def is_column_dummified(self, col_name):
        return self.get_per_feature()[col_name].get("category_handling") == "DUMMIFY"

    def _get_df(self, split):
        with RaiseWithTraceback("Failed to properly open the {} dataset. "
                                "Was it modified during a clean-up routine ?".format(split)):
            df = df_from_split_desc(self._split_desc,
                                    split,
                                    self._preprocessing_params['per_feature'],
                                    self._core_params["prediction_type"])

        expected_df_length = self._split_desc.get("{}Rows".format(split), None)
        return df, (not expected_df_length) or (expected_df_length == df.shape[0])

    def get_train_df(self):
        if self._train_df is None:
            self._train_df = self._get_df("train")
        return self._train_df

    def get_test_df(self):
        if self._test_df is None:
            self._test_df = self._get_df("test")
        return self._test_df

    def get_full_df(self):
        if self._full_df is None:
            self._full_df = self._get_df("full")
        return self._full_df

class ScoringData:

    def __init__(self, is_empty=False, preds=None, probas=None, valid_y=None, valid_sample_weights=None, reason=None):
        self.is_empty = is_empty
        self.preds = preds
        self.probas = probas
        self.valid_y = valid_y
        self.valid_sample_weights = valid_sample_weights
        self.reason = reason


class ScoringDataConcatenator:

    def __init__(self):
        self.preds_list = []
        self.probas_list = []
        self.valid_y_list = []
        self.valid_sample_weights_list = []

    def add_scoring_data(self, scoring_data):
        if not scoring_data.is_empty:
            self.preds_list.append(scoring_data.preds)
            self.valid_y_list.append(scoring_data.valid_y)

            if scoring_data.probas is not None:
                self.probas_list.append(scoring_data.probas)

            if scoring_data.valid_sample_weights is not None:
                self.valid_sample_weights_list.append(scoring_data.valid_sample_weights)

    def get_concatenated_scoring_data(self):
        if len(self.preds_list) == 0:
            return ScoringData(is_empty=True)
        else:
            preds = np.concatenate(self.preds_list)
            probas = np.concatenate(self.probas_list) if len(self.probas_list) > 0 else None
            valid_y = pd.concat(self.valid_y_list)
            valid_sample_weights = pd.concat(self.valid_sample_weights_list) \
                                   if len(self.valid_sample_weights_list) > 0 \
                                   else None

            return ScoringData(preds=preds, probas=probas, valid_y=valid_y, valid_sample_weights=valid_sample_weights)

