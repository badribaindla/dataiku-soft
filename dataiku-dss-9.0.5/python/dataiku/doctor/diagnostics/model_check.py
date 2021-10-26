# coding: utf-8
from __future__ import unicode_literals
import numpy as np
from sklearn.metrics import accuracy_score

from dataiku.doctor import constants
from dataiku.doctor.diagnostics import diagnostics
from dataiku.doctor.diagnostics.diagnostics import DiagnosticType
from dataiku.doctor.diagnostics.metrics import get_model_perf_metric_value
from dataiku.doctor.prediction.histogram_handler import HistogramHandler
import pandas as pd

R2_REGRESSION_THRESHOLD = 0.1
CONFIDENCE_INTERVAL_95_AS_STD_DEV = 1.96  # 95% confidence interval


class ClassifierAccuracyCheckDiagnostic(diagnostics.DiagnosticCallback):
    """ Compare the model accuracy on the test set vs a dummy classifier (random)
        The model should always be better than "random", otherwise there may be a problem in the input dataset
        See in the documentation machine-learning/diagnostics.html#model-checks
    """
    def __init__(self):
        super(ClassifierAccuracyCheckDiagnostic, self).__init__(DiagnosticType.ML_DIAGNOSTICS_MODEL_CHECK)

    def on_scoring_end(self, model_params=None, transformed_test=None, transformed_train=None, with_sample_weight=False):
        diagnostics = []

        if model_params is not None and model_params.prediction_type in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
            test_accuracy = get_model_perf_metric_value(model_params.prediction_type, model_params.perf_data, "accuracy")
            if test_accuracy is None:
                return []

            valid_y = transformed_test["target"].astype(int)
            train_target = transformed_train["target"]
            if with_sample_weight:
                test_sample_weights = transformed_test["weight"].astype(float)
                train_sample_weights = transformed_train["weight"].astype(float)
            else:
                test_sample_weights = pd.Series(np.ones_like(valid_y), index=valid_y.index)
                train_sample_weights = pd.Series(np.ones_like(train_target), index=train_target.index)

            preds = self.compute_dummy_preds(train_target, transformed_test["target"].shape[0], train_sample_weights)

            dummy_accuracy = accuracy_score(valid_y, preds, sample_weight=test_sample_weights)

            # Accuracy is derived from a binomial distribution (it's the sum of Bernouilli)
            # of mean p (here it's the accuracy).
            # We then approximate it (yes this is the Central Limit Theorem) with a normal distribution.
            # Its variance is then given by np.sqrt(p*(1-p)/n) where n is the number of samples.
            # However, this is a weighted extension of CLT. Bottomline is that the variance should be corrected by
            # np.sum(sample_weights**2)/np.sum(sample_weights)**2 instead of 1/n
            variance = np.sqrt(dummy_accuracy * (1 - dummy_accuracy) * np.sum(test_sample_weights ** 2) /
                               np.sum(test_sample_weights) ** 2)
            bound_min = dummy_accuracy - CONFIDENCE_INTERVAL_95_AS_STD_DEV * variance
            bound_max = dummy_accuracy + CONFIDENCE_INTERVAL_95_AS_STD_DEV * variance
            if bound_min < test_accuracy < bound_max:
                msg = "The model (accuracy={:.3f}) is not significantly different than a random classifier" \
                      " (accuracy={:.3f})".format(test_accuracy, dummy_accuracy)
                diagnostics.append(msg)

        return diagnostics

    @staticmethod
    def compute_dummy_preds(train_target, size, weights):
        """ Compute dummy predictions based on a 'stratified' strategy, like DummyClassifier(strategy='stratified') """
        rs = np.random.RandomState(1337)
        uniques = np.unique(train_target)
        distribution = HistogramHandler._compute_distribution(uniques, train_target, weights)
        return rs.choice(uniques, size=size, p=distribution)


class RegressionR2CheckDiagnostic(diagnostics.DiagnosticCallback):
    """ Compare the model r2 on the test set vs a constant value (= random regressor)
        The model should always be better than "random", otherwise there may be a problem in the input dataset
        See in the documentation machine-learning/diagnostics.html#model-checks
    """
    def __init__(self):
        super(RegressionR2CheckDiagnostic, self).__init__(DiagnosticType.ML_DIAGNOSTICS_MODEL_CHECK)

    def on_scoring_end(self, model_params=None, transformed_test=None, transformed_train=None, with_sample_weight=False):
        diagnostics = []
        if model_params is not None and model_params.prediction_type == constants.REGRESSION:
            test_r2 = get_model_perf_metric_value(model_params.prediction_type, model_params.perf_data, "r2")
            if test_r2 is None:
                return []
            if test_r2 < 0:
                diagnostics.append("This model performed worse than a naive model which always predicts the mean")
            elif test_r2 < R2_REGRESSION_THRESHOLD:
                diagnostics.append("R2 score is suspiciously low ({:.03f}) - the model is marginally better than a naive model which always predicts the mean".format(test_r2))

        return diagnostics
