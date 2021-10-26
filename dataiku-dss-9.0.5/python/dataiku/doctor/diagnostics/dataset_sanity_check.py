# coding: utf-8
from __future__ import unicode_literals
from dataiku.base.utils import safe_unicode_str
from dataiku.doctor import constants
from dataiku.doctor.diagnostics import diagnostics
import scipy.stats as sps


PVALUE_THRESHOLD = 0.05


class DatasetSanityCheckDiagnostic(diagnostics.DiagnosticCallback):
    """ See in the documentation machine-learning/diagnostics.html#dataset-sanity-checks """
    def __init__(self):
        super(DatasetSanityCheckDiagnostic, self).__init__(diagnostics.DiagnosticType.ML_DIAGNOSTICS_DATASET_SANITY_CHECKS)
        self.train_feature_counts = None
        self.test_feature_counts = None

    def on_load_train_dataset_end(self, prediction_type=None, df=None, target_variable=None):
        diagnostics = []
        self.check_train_dataset(df, diagnostics)
        if target_variable is not None and prediction_type in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
            self.train_feature_counts = self.check_balance(df[target_variable], "train", diagnostics)
        return diagnostics

    def on_load_test_dataset_end(self, prediction_type=None, df=None, target_variable=None):
        diagnostics = []
        self.check_test_dataset(df, diagnostics)
        if target_variable is not None and prediction_type in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
            self.test_feature_counts = self.check_balance(df[target_variable], "test", diagnostics)
        return diagnostics

    def on_scoring_end(self, model_params=None, transformed_test=None, transformed_train=None, with_sample_weight=False):
        diagnostics = []
        if transformed_train is not None and transformed_test is not None:
            if model_params.prediction_type == constants.REGRESSION:
                series1 = transformed_train["target"]
                series2 = transformed_test["target"]
                statistic, pvalue = sps.ks_2samp(series1, series2)
                if pvalue < PVALUE_THRESHOLD:
                    diagnostics.append("Target variable distribution in test data does not match the training data distribution (p-value={:.3f}), metrics could be misleading".format(pvalue))
            elif model_params.prediction_type in [constants.BINARY_CLASSIFICATION, constants.MULTICLASS] \
                    and self.train_feature_counts is not None and self.test_feature_counts is not None:

                if len(self.train_feature_counts) != len(self.test_feature_counts):
                    diagnostics.append("Test and train dataset do not contain the same number of classes")
                else:
                    train_features_total = self.train_feature_counts.sum()
                    test_features_total = self.test_feature_counts.sum()
                    weight = test_features_total / float(train_features_total)
                    _, pvalue = sps.chisquare(self.train_feature_counts * weight, f_exp=self.test_feature_counts.reindex(self.train_feature_counts.index))
                    if pvalue < PVALUE_THRESHOLD:
                        diagnostics.append("Target variable distribution in test data does not match the training data distribution (p-value={:.3f}), metrics could be misleading".format(pvalue))
        return diagnostics

    def on_processing_all_kfold_end(self, prediction_type=None, folds=None, with_sample_weight=False, perf_data=None):
        if folds is None:
            return []
        for fold in folds:
            diagnostics = self.on_scoring_end(with_sample_weight=with_sample_weight, **fold)
            # Don't spam the user with several diagnostics of the same type
            if len(diagnostics) > 0:
                return diagnostics
        return []

    @staticmethod
    def check_balance(serie, kind, diagnostics):
        counts = serie.value_counts(dropna=False)
        classes_count = counts.shape[0]
        if classes_count == 2:
            imbalanced_threshold = .5
            # Balance < .5 only works well for 2 classes, otherwise we need to use some kind of heuristics
            balance = sps.entropy(counts, base=2)
            if balance < imbalanced_threshold:
                msg = "The {} dataset is imbalanced (balance={:.2f}), metrics can be misleading".format(kind, balance)
                diagnostics.append(msg)
        elif classes_count > 2:
            min_norm = counts[-1] / float(counts.sum())
            uniform_distribution_threshold = 1. / 5
            if classes_count * min_norm < uniform_distribution_threshold:
                percent = min_norm * 100
                perfectly_balanced = (1. / classes_count) * 100.
                min_class = counts.index[-1]  # serie.value_counts() sort in descending order, the min is the last one
                msg = "The {} dataset is imbalanced (class '{}' is only represented in {:.2f}% of rows; a well balanced dataset would contain ~{:.2f}%)," \
                      " metrics can be misleading".format(kind, safe_unicode_str(min_class), percent, perfectly_balanced)
                diagnostics.append(msg)
        return counts


    @staticmethod
    def check_train_dataset(train_df, diagnostics):
        size = train_df.shape[0]
        if size <= 1000:
            message = "Training set might be too small ({} rows) for robust training".format(size)
            diagnostics.append(message)


    @staticmethod
    def check_test_dataset(test_df, diagnostics):
        size = test_df.shape[0]
        if size <= 1000:
            message = "Test set might be too small ({} rows) for reliable performance estimation".format(size)
            diagnostics.append(message)

