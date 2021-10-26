import shutil
import tempfile

import logging
import os.path as osp
import pandas as pd
import scipy.stats
import statsmodels.stats.proportion
from pandas.api.types import is_numeric_dtype
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

from dataiku.doctor.prediction.column_importance_handler import ColumnImportanceHandler
from dataiku.doctor.preprocessing_collector import PredictionPreprocessingDataCollector
from dataiku.doctor.preprocessing_handler import PreprocessingHandler

logger = logging.getLogger(__name__)


class DriftModel(object):
    """
    Compute drift model

    Input dataframes must have *exactly* the same schema
    """

    def __init__(self, ref_df, cur_df, column_importance, confidence_level):
        self.ref_df = ref_df
        self.cur_df = cur_df
        self.column_importance = column_importance
        self.confidence_level = confidence_level
        self.tmp_dir = tempfile.mkdtemp()

    def __del__(self):
        if self.tmp_dir and osp.isdir(self.tmp_dir):
            shutil.rmtree(self.tmp_dir)

    def _build_per_feature_preprocessing(self):
        per_feature = {}
        for column in self.ref_df.columns:
            if is_numeric_dtype(self.ref_df[column].dtype):
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
        return {
            "target_variable": "__drift__",
            "prediction_type": "BINARY_CLASSIFICATION",
            "weight": {"weightMethod": "NO_WEIGHTING"},
            "calibration": {"calibrationMethod": "NO_CALIBRATION"},
            "time": {"enabled": False},
            "partitionedModel": {"enabled": False},
            "backendType": "PY_MEMORY",
            "taskType": "PREDICTION",
        }

    def _build_preprocessing_params(self):
        return {
            "target_remapping": [
                {"sourceValue": "reference", "mappedValue": 0},
                {"sourceValue": "current", "mappedValue": 1}
            ],
            "skipPreprocessing": False,
            "per_feature": self._build_per_feature_preprocessing(),
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

    def _preprocess_dataframe(self, df):
        collector = PredictionPreprocessingDataCollector(df, self._build_preprocessing_params())
        collector_data = collector.build()
        preprocessing_handler = PreprocessingHandler \
            .build(self._build_core_params(), self._build_preprocessing_params(), self.tmp_dir)
        preprocessing_handler.collector_data = collector_data
        pipeline = preprocessing_handler.build_preprocessing_pipeline(with_target=False)
        transformed_train = pipeline.fit_and_process(df)
        train_x = transformed_train["TRAIN"].as_np_array()
        feature_names = transformed_train["TRAIN"].columns()
        return train_x, feature_names, pipeline

    def _build_drift_model_trainsets(self):
        # Add a target column for the drift model
        ref_df = self.ref_df.copy()
        ref_df["__drift__"] = "reference"

        cur_df = self.cur_df.copy()
        cur_df["__drift__"] = "current"

        # Make sure drift model is trained with balanced data
        size = min(len(ref_df), len(cur_df))
        ref_df = ref_df.sample(size, random_state=42)
        cur_df = cur_df.sample(size, random_state=43)
        ref_sample_size = len(ref_df)
        cur_sample_size = len(cur_df)

        # Construct trainset & testset
        full_df = pd.concat([ref_df, cur_df]).reset_index(drop=True)
        train_df = full_df.sample(frac=0.7, random_state=42)
        test_df = full_df.drop(train_df.index)

        return train_df.reset_index(drop=True), test_df.reset_index(drop=True), ref_sample_size, cur_sample_size

    def compute_drift(self):
        """
        Construct a naive preprocessing pipeline that will be used to create drift model's data
        """
        train_df, test_df, ref_sample_size, cur_sample_size = self._build_drift_model_trainsets()

        # Apply preprocessing
        train_x, feature_names, pipeline = self._preprocess_dataframe(train_df)
        train_y = train_df["__drift__"]  # TODO check index

        # Train the drift model
        clf = RandomForestClassifier(n_estimators=100, random_state=1337, max_depth=5, min_samples_leaf=1)
        clf.fit(train_x, train_y)

        # Evaluate the accuracy of the drift model
        test_x = pipeline.process(test_df)["TRAIN"].as_np_array()
        test_y = test_df["__drift__"]  # TODO check index
        predicted_y = clf.predict(test_x)
        drift_accuracy = accuracy_score(test_y, predicted_y)

        # 95% confidence interval around accuracy
        nb_correct = sum(test_y == predicted_y)
        nb_total = len(test_y)
        drift_accuracy_lower, drift_accuracy_upper = statsmodels.stats.proportion.proportion_confint(
            nb_correct, nb_total, method="wilson", alpha=(1-self.confidence_level)
        )

        # H0: there is no drift (== domain classifier is correct 50% of the time)
        drift_test_pvalue = scipy.stats.binom_test(nb_correct, nb_total, p=.5, alternative='greater')

        # Compute column importances of the drift model
        drift_importances = self._column_importance_in_drift_model(feature_names, clf)
        if self.column_importance is not None:
            column_importance_scores = [self.column_importance.get(col, 0) for col in self.ref_df.columns]
        else:
            column_importance_scores = None

        return {
            "currentSampleSize": cur_sample_size,
            "referenceSampleSize": ref_sample_size,
            "driftModelAccuracy": {
                "lower": drift_accuracy_lower,
                "value": drift_accuracy,
                "upper": drift_accuracy_upper,
                "pvalue": drift_test_pvalue
            },
            "driftVersusImportance": {
                "columns": list(self.ref_df.columns),
                "columnDriftScores": [drift_importances.get(col, 0) for col in self.ref_df.columns],
                "columnImportanceScores": column_importance_scores
            }
        }

    def _column_importance_in_drift_model(self, feature_names, clf):
        # Get feature importance from the classifier
        raw_importance = {"variables": feature_names, "importances": clf.feature_importances_}

        # Turn feature importances into column importances
        # "importance of a column of drift model" == "drift score of this column"
        return ColumnImportanceHandler \
            .compute_column_importance_impl(raw_importance, self.ref_df.columns,
                                            feature_names, None, None) \
            .set_index('columns')["importances"].to_dict()
