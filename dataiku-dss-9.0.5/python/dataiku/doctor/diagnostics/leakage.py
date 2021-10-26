# coding: utf-8
from __future__ import unicode_literals
from dataiku.base.utils import safe_unicode_str
from dataiku.doctor import constants
from dataiku.doctor.prediction.metric import BINARY_METRICS_NAME_TO_FIELD_NAME, MULTICLASS_METRICS_NAME_TO_FIELD_NAME, \
    REGRESSION_METRICS_NAME_TO_FIELD_NAME
from dataiku.doctor.diagnostics.model_check import get_model_perf_metric_value
from dataiku.doctor.prediction.scoring_base import compute_variables_importance
from dataiku.doctor.diagnostics.diagnostics import DiagnosticType, DiagnosticCallback


VARIABLE_IMPORTANCE_THRESHOLD = 0.8  # Use 0.8 as a first heuristic
PERFORMANCE_METRICS_THRESHOLD = 0.98


class LeakageDiagnostic(DiagnosticCallback):
    """ See in the documentation machine-learning/diagnostics.html#leakage-detection """
    def __init__(self):
        super(LeakageDiagnostic, self).__init__(DiagnosticType.ML_DIAGNOSTICS_LEAKAGE_DETECTION)

    def on_fitting_end(self, prediction_type=None, clf=None, train_target=None, features=None):
        diagnostics = []
        self.check_variables_importance(features, clf, diagnostics)
        return diagnostics

    def on_scoring_end(self, model_params=None, transformed_test=None, transformed_train=None, with_sample_weight=False):
        diagnostics = []
        if model_params is not None:
            self.check_performance_metrics(diagnostics, model_params.prediction_type, model_params.metrics, model_params.perf_data)
        return diagnostics


    def on_processing_all_kfold_end(self, folds=None, with_sample_weight=False, prediction_type=None, perf_data=None):
        diagnostics = []
        if prediction_type is not None and folds and perf_data is not None:
            metrics = folds[0]["model_params"].metrics
            self.check_performance_metrics(diagnostics, prediction_type, metrics, perf_data)

    @staticmethod
    def check_variables_importance(features, clf, diagnostics):
        """ Checks if a feature has more than 80% importance """
        variables_importance = compute_variables_importance(features, clf)
        if len(variables_importance) == 0:
            return

        for i, variable in enumerate(variables_importance["variables"]):
            importance = variables_importance["importances"][i]
            if importance > VARIABLE_IMPORTANCE_THRESHOLD:
                msg = 'Feature "{}" has suspiciously high importance: {:.0f}%, which could be indicative of data leakage or overfitting'\
                    .format(safe_unicode_str(variable), importance * 100)
                diagnostics.append(msg)

    @staticmethod
    def check_performance_metrics(diagnostics, prediction_type, metrics, perf_data):
        if prediction_type == constants.BINARY_CLASSIFICATION:
            metric_dict = BINARY_METRICS_NAME_TO_FIELD_NAME
        elif prediction_type == constants.MULTICLASS:
            metric_dict = MULTICLASS_METRICS_NAME_TO_FIELD_NAME
        else:
            metric_dict = REGRESSION_METRICS_NAME_TO_FIELD_NAME

        for metric_type in ("evaluationMetric", "thresholdOptimizationMetric"):
            if metric_type not in metrics:
                continue

            metric = metric_dict[metrics[metric_type]]
            if metric.zero_to_one and metric.greater_is_better:
                value = get_model_perf_metric_value(prediction_type, perf_data, metric.get_field(prediction_type))
                if value is not None and value > PERFORMANCE_METRICS_THRESHOLD:
                    diagnostics.append("{}={:.3f}, too good to be true?".format(metric.display_name, value))
