import tempfile

import logging
import numpy as np
import os.path as osp
import shutil
import six
from sklearn.ensemble import RandomForestClassifier
from sklearn.ensemble import RandomForestRegressor

from dataiku.doctor.constants import NUMERIC
from dataiku.doctor.constants import REGRESSION
from dataiku.doctor.prediction.column_importance_handler import ColumnImportanceHandler
from dataiku.doctor.preprocessing_collector import PredictionPreprocessingDataCollector
from dataiku.doctor.preprocessing_handler import PreprocessingHandler
from dataiku.doctor.utils.metrics import log_odds

logger = logging.getLogger(__name__)


class SurrogateModel(object):
    """
    Build a surrogate model to extract column importance
    - ME was built by SER:
        - We have no model, we need to build one to compute column importance
    - ME was built by ER:
        - We may have a model but column importance aren't necessarily computable due to complex preprocessing
        - Build a surrogate model with simplified preprocessing to guarantee column importance are computable
    """

    def __init__(self, data_df, pred_df, prediction_type, preprocessing_params):
        self.data_df = data_df
        self.pred_df = pred_df
        self.prediction_type = prediction_type

        # Note: the original preprocess is not directly used by the surrogate model
        # (we will derive a simpler version of it, more suitable for column importance determination)
        self.preprocessing_params = preprocessing_params
        self.tmp_dir = tempfile.mkdtemp()

    def __del__(self):
        if self.tmp_dir and osp.isdir(self.tmp_dir):
            shutil.rmtree(self.tmp_dir)

    def _build_simplified_per_feature_preprocessing(self):
        """
        Derive a very simple preprocessing from the ME's preprocessing in order to
        ensure column importance are computable
        """
        per_feature = {}
        for column, handling in six.iteritems(self.preprocessing_params["per_feature"]):
            if handling["role"] != "INPUT":
                continue

            elif handling["type"] == NUMERIC:
                per_feature[column] = {
                    "generate_derivative": False,
                    "numerical_handling": "REGULAR",
                    "missing_handling": "IMPUTE",
                    "missing_impute_with": "MEAN",
                    "rescaling": "AVGSTD",
                    "role": "INPUT",
                    "type": "NUMERIC"
                }
            else:
                per_feature[column] = {
                    "category_handling": "DUMMIFY",
                    "missing_handling": "NONE",
                    "missing_impute_with": "MODE",
                    "dummy_clip": "MAX_NB_CATEGORIES",
                    "cumulative_proportion": 0.95,
                    "max_nb_categories": 20,
                    "dummy_drop": "NONE",
                    "role": "INPUT",
                    "type": "CATEGORY"
                }

        return per_feature

    def _build_core_params(self):
        # Note: this is fake data, the goal is just to pass a well-shaped datastructure to the preprocessing handler
        return {
            "target_variable": "__irrelevant__",
            "prediction_type": "BINARY_CLASSIFICATION"
        }

    def _build_simplified_preprocessing_params(self):
        # Note: this is mostly fake data (except 'per_feature')
        # The goal is just to pass a well-shaped datastructure to the preprocessing handler
        return {
            "skipPreprocessing": False,
            "per_feature": self._build_simplified_per_feature_preprocessing(),
            "reduce": {"enabled": False},
            "feature_generation": {
                "pairwise_linear": {"behavior": "DISABLED"},
                "polynomial_combinations": {"behavior": "DISABLED"},
                "manual_interactions": {"interactions": []},
                "numericals_clustering": {"behavior": "DISABLED"},
                "categoricals_count_transformer": {"behavior": "DISABLED"},
                "feature_selection_params": {"method": "NONE"},
            },
            "preprocessingFitSampleRatio": 1.0,
            "preprocessingFitSampleSeed": 1337
        }

    def _cast_columns(self):
        pass

    def _preprocess_dataframe(self, df):
        simplified_preprocessing_params = self._build_simplified_preprocessing_params()

        # The collector requires column to be properly typed, so we need to cast values beforehand
        typed_df = df.copy()
        for column in self.data_df.columns:
            column_handling = simplified_preprocessing_params["per_feature"].get(column)
            if column_handling is not None and column_handling["type"] == NUMERIC:
                typed_df[column] = typed_df[column].astype(np.float64)

        collector = PredictionPreprocessingDataCollector(typed_df, simplified_preprocessing_params)
        collector_data = collector.build()
        preprocessing_handler = PreprocessingHandler \
            .build(self._build_core_params(), simplified_preprocessing_params, self.tmp_dir)
        preprocessing_handler.collector_data = collector_data
        pipeline = preprocessing_handler.build_preprocessing_pipeline(with_target=False)
        return pipeline.fit_and_process(typed_df)

    def _build_trainsets_and_clf(self):
        # Prediction are coming in various forms...

        data_df = self.data_df.reset_index(drop=True)

        if self.prediction_type == REGRESSION:
            # Model is a regression => use a RF regressor
            score_to_predict = self.pred_df[["prediction"]].values.astype('float64')
            clf = RandomForestRegressor(n_estimators=100, random_state=1337, max_depth=5, min_samples_leaf=1)

            # Filter out rows where target is not available
            mask = np.all(np.isfinite(score_to_predict), axis=1)
            filtered_score_to_predict = score_to_predict[mask]
            filtered_data_df = data_df[mask].reset_index(drop=True)
            return filtered_data_df, filtered_score_to_predict, clf

        elif "prediction" in self.pred_df:
            # Model is a classifier and we have the class names => use a RF classifier
            score_to_predict = self.pred_df[["prediction"]].values.astype('object')
            score_to_predict[score_to_predict == None] = ""
            clf = RandomForestClassifier(n_estimators=100, random_state=1337, max_depth=5, min_samples_leaf=1)
            return data_df, score_to_predict, clf

        else:
            # Model is a classifier and we don't have the class names => use a RF regressor on class probas
            # (in DSS, this corresponds to binary classification case, because we never store the prediction class)
            score_to_predict = log_odds(self.pred_df.values.astype('float64'), 0.01, 0.99)
            clf = RandomForestRegressor(n_estimators=100, random_state=1337, max_depth=5, min_samples_leaf=1)

            # Filter out rows where target is not available
            mask = np.all(np.isfinite(score_to_predict), axis=1)
            filtered_score_to_predict = score_to_predict[mask, :]
            filtered_data_df = data_df[mask].reset_index(drop=True)
            return filtered_data_df, filtered_score_to_predict, clf

    def compute_column_importance(self):
        """
        Train a surrogate model on original model's prediction using a simplified preprocessing
        and recompute column importances from feature importance of this surrogate model
        """

        train_df, train_pred, clf = self._build_trainsets_and_clf()
        transformed = self._preprocess_dataframe(train_df)
        clf.fit(transformed["TRAIN"].as_np_array(), train_pred[transformed["TRAIN"].index, :])

        # Get feature importance from the classifier
        raw_importance = {"variables": transformed["TRAIN"].columns(), "importances": clf.feature_importances_}

        # Turn feature importances into column importances
        return ColumnImportanceHandler \
            .compute_column_importance_impl(raw_importance, self.data_df.columns,
                                            transformed["TRAIN"].columns(), None, None) \
            .set_index('columns')["importances"].to_dict()
