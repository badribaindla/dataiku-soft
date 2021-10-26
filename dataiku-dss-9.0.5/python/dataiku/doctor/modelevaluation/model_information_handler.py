import logging
import os.path as osp

import numpy as np

from dataiku.core import dkujson
from dataiku.doctor import constants
from dataiku.doctor.prediction import BinaryClassificationModelScorer
from dataiku.doctor.prediction import RegressionModelScorer
from dataiku.doctor.prediction.reg_standalone_evaluation_recipe import FakeClf
from dataiku.doctor.preprocessing_handler import PreprocessingHandler
from dataiku.doctor.utils.split import load_df_with_normalization
from dataiku.doctor.posttraining.model_information_handler import ScoringData, ModelInformationHandlerBase

logger = logging.getLogger(__name__)


class ModelLessModelInformationHandler(ModelInformationHandlerBase):
    def get_per_feature_col(self, col_name):
        pass

    def __init__(self, model_evaluation, features, iperf, resolved_preprocessing_params, modelevaluation_folder):
        self._model_evaluation = model_evaluation
        self._features = features
        self._iperf = iperf
        self._preprocessing_params = resolved_preprocessing_params
        self._modelevaluation_folder = modelevaluation_folder
        self._full_df = None
        self._modeling_params = self._prepare_modeling_params()
        self._clf = FakeClf(self._iperf.get('probaAware', False), self.get_classes_mapping())
        self._core_params = self._prepare_core_params()
        self._schema = None

    def _prepare_modeling_params(self):
        modeling_params = {'algorithm': 'EVALUATED', 'metrics': self._model_evaluation.get('metricParams', {})}
        if self._iperf.get('probaAware', False):
            modeling_params['autoOptimizeThreshold'] = True
            modeling_params['forcedClassifierThreshold'] = self._model_evaluation.get('activeClassifierThreshold', 0.5)
        else:
            modeling_params['autoOptimizeThreshold'] = False
            modeling_params['forcedClassifierThreshold'] = 0.5
        return modeling_params

    def _prepare_core_params(self):
        return {
            "weight": {
                "sampleWeightVariable": self.get_sample_weight_variable(),
                "sampleWeightMethod ": self.get_weight_method() if self.get_sample_weight_variable() else None
            },
            constants.PREDICTION_TYPE: self.get_prediction_type(),
            constants.TARGET_VARIABLE: self.get_target_variable(),
            constants.PREDICTION_VARIABLE: self.get_prediction_variable(),
            constants.PROBA_COLUMNS: self.get_probas_col_names()
        }

    def get_clf(self):
        return self._clf

    def get_weight_method(self):
        return "SAMPLE_WEIGHT"

    def get_sample_weight_variable(self):
        n = self._model_evaluation.get("weightsVariable", None)
        if n == '':
            n = None # because None is used as a flag for "no weight" and None != ''
        return n

    def with_sample_weights(self):
        return self.get_sample_weight_variable()

    def get_output_folder(self):
        return osp.join(self._modelevaluation_folder, "postcomputation")

    def get_prediction_type(self):
        return self._model_evaluation["predictionType"]

    def get_prediction_variable(self):
        return self._model_evaluation["predictionVariable"]

    def get_target_variable(self):
        return self._model_evaluation["targetVariable"]

    def get_features(self):
        return self._features

    def use_full_df(self):
        return True

    def get_feature_col(self, col_name):
        if col_name not in self._features.keys():
            raise ValueError("Column '{}' not found".format(col_name))
        return self._features[col_name]

    def get_type_of_column(self, col_name):
        return self.get_feature_col(col_name)["type"]

    def get_role_of_column(self, col_name):
        return self.get_feature_col(col_name)["role"]

    def get_probas_col_names(self):
        proba_col_list = self._model_evaluation.get("probaColumns", [])
        ret = []
        for cur_proba in proba_col_list:
            ret.append(cur_proba["column"])
        return ret

    def get_target_mapping(self):
        return {
            c['sourceValue']: int(c['mappedValue'])
            for c in self._preprocessing_params.get('target_remapping', [])
        }

    def get_classes_mapping(self):
        return [int(c['mappedValue']) for c in self._preprocessing_params.get('target_remapping', [])]

    def get_collector_data(self):
        collector_data_filename = osp.join(self._modelevaluation_folder, "collector_data.json")
        if not osp.isfile(collector_data_filename):
            raise Exception("Collector data not found %s" % collector_data_filename)
        return dkujson.load_from_filepath(collector_data_filename)


    def prepare_for_scoring_full(self, df):
        # Extract predictions
        preprocessing_handler = PreprocessingHandler.build(self._core_params, self._preprocessing_params,
                                                           self._modelevaluation_folder)
        preprocessing_handler.collector_data = self.get_collector_data()
        pipeline = preprocessing_handler.build_preprocessing_pipeline(with_target=True,
                                                                      allow_empty_mf=True,
                                                                      with_prediction=True)
        transformed = pipeline.process(df)
        idx = transformed["target"].index
        if idx.empty:
            return ScoringData(is_empty=True, reason=constants.PREPROC_DROPPED)
        targets = transformed["target"]
        preds = transformed["prediction"]
        try:
            probas = transformed[constants.PROBA_COLUMNS].values
        except KeyError:
            probas = None
        if self.get_sample_weight_variable():
            valid_sample_weights = transformed["weight"]
        else:
            valid_sample_weights = None
        return ScoringData(preds=preds, probas=probas, valid_y=targets,
                           valid_sample_weights=valid_sample_weights)

    def get_full_df(self):
        f = osp.join(self._modelevaluation_folder, "sample_scored.csv.gz")
        if not osp.isfile(f):
            f = osp.join(self._modelevaluation_folder, "sample.csv.gz")
        return load_df_with_normalization(f, self.get_schema(), self._features, self.get_prediction_type()), True

    def get_schema(self):
        if not self._schema:
            fs = osp.join(self._modelevaluation_folder, "sample_scored_schema.json")
            if not osp.isfile(fs):
                fs = osp.join(self._modelevaluation_folder, "sample_schema.json")
            self._schema = dkujson.load_from_filepath(fs)
        return self._schema

    def run_binary_scoring(self, df, out_folder):
        if self.get_prediction_type() == constants.BINARY_CLASSIFICATION:
            scoring_data = self.prepare_for_scoring_full(df)

            if scoring_data.is_empty:
                return False, scoring_data.reason, None

            # Check that both classes are present, otherwise scoring fails
            n_classes_valid = np.unique(scoring_data.valid_y).shape[0]
            if n_classes_valid < 2:
                return False, constants.PREPROC_ONECLASS, None

            print("target_mapping: {}".format(self.get_target_mapping()))

            binary_classif_scorer = BinaryClassificationModelScorer(
                self._modeling_params,
                self.get_clf(),
                out_folder,
                scoring_data.preds,
                scoring_data.probas,
                scoring_data.valid_y,
                self.get_target_mapping(),
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

    def get_preprocessing_params(self):
        return self._preprocessing_params

