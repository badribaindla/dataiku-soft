from dataiku.doctor import constants


class Metric(object):
    def __init__(self, name, field, display_name, zero_to_one, greater_is_better, prediction_types):
        self.name = name
        self._field = field
        self.display_name = display_name
        self.zero_to_one = zero_to_one
        self.greater_is_better = greater_is_better
        self.prediction_types = prediction_types

    def get_field(self, prediction_type):
        if prediction_type == constants.MULTICLASS:
            if self.name == "ROC_AUC":
                return "mrocAUC"
            elif self.name == "CALIBRATION_LOSS":
                return "mcalibrationLoss"

        return self._field


ACCURACY = Metric("ACCURACY", "accuracy", "Accuracy", True, True, [constants.BINARY_CLASSIFICATION, constants.MULTICLASS])
PRECISION = Metric("PRECISION", "precision", "Precision", True, True, [constants.BINARY_CLASSIFICATION, constants.MULTICLASS])
RECALL = Metric("RECALL", "recall", "Recall", True, True, [constants.BINARY_CLASSIFICATION, constants.MULTICLASS])
F1 = Metric("F1", "f1", "F1 Score", True, True, [constants.BINARY_CLASSIFICATION, constants.MULTICLASS])
COST_MATRIX = Metric("COST_MATRIX", "cmg", "Cost Matrix Gain", False, True, [constants.BINARY_CLASSIFICATION])
LOG_LOSS = Metric("LOG_LOSS", "logLoss", "Log Loss", False, False, [constants.BINARY_CLASSIFICATION, constants.MULTICLASS])
ROC_AUC = Metric("ROC_AUC", "auc", "AUC", True, True, [constants.BINARY_CLASSIFICATION, constants.MULTICLASS])
CUMULATIVE_LIFT = Metric("CUMULATIVE_LIFT", "lift", "Lift", False, True, [constants.BINARY_CLASSIFICATION])
CUSTOM = Metric("CUSTOM", "customScore", "Custom Score", False, False, [constants.BINARY_CLASSIFICATION, constants.REGRESSION, constants.MULTICLASS])
CALIBRATION_LOSS = Metric("CALIBRATION_LOSS", "calibrationLoss", "Calibration Loss", True, False, [constants.BINARY_CLASSIFICATION, constants.MULTICLASS])

EVS = Metric("EVS", "evs", "Explained Var.", True, True, [constants.REGRESSION])
MAPE = Metric("MAPE", "mape", "MAPE", False, False, [constants.REGRESSION])
MAE = Metric("MAE", "mae", "MAE", False, False, [constants.REGRESSION])
MSE = Metric("MSE", "mse", "MSE", False, False, [constants.REGRESSION])
RMSE = Metric("RMSE", "rmse", "RMSE", False, False, [constants.REGRESSION])
RMSLE = Metric("RMSLE", "rmsle", "RMSLE", False, False, [constants.REGRESSION])
R2 = Metric("R2", "r2", "R2 Score", True, True, [constants.REGRESSION])
PEARSON = Metric("PEARSON", "pearson", "Correlation", False, False, [constants.REGRESSION])

BINARY_METRICS_NAME_TO_FIELD_NAME = {}

REGRESSION_METRICS_NAME_TO_FIELD_NAME = {}

MULTICLASS_METRICS_NAME_TO_FIELD_NAME = {}

METRICS_NAMES = {}

METRICS = [ACCURACY, PRECISION, RECALL, F1, COST_MATRIX, LOG_LOSS, ROC_AUC, CUMULATIVE_LIFT, CUSTOM, EVS, MAPE, MAE, MSE, RMSE, RMSLE, R2, PEARSON, CALIBRATION_LOSS]

for metric in METRICS:
    for pred_type in metric.prediction_types:
        if constants.BINARY_CLASSIFICATION == pred_type:
            BINARY_METRICS_NAME_TO_FIELD_NAME[metric.name] = metric
        if constants.MULTICLASS == pred_type:
            MULTICLASS_METRICS_NAME_TO_FIELD_NAME[metric.name] = metric
        elif constants.REGRESSION == pred_type:
            REGRESSION_METRICS_NAME_TO_FIELD_NAME[metric.name] = metric

    METRICS_NAMES[metric.name] = metric.display_name
