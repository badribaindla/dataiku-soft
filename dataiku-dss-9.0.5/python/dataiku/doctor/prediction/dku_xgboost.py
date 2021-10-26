# WARNING: Not to be imported directly in exposed file (e.g. commands, prediction_entrypoints...), because this module
# imports the xgboost library that users might not want to install (e.g. when using deep learning).
# This module should be imported within functions or classes definitions when required.

import logging
import numpy as np

import dataiku.doctor.constants as constants
from xgboost import XGBClassifier, XGBRegressor

logger = logging.getLogger(__name__)


def get_xgboost_scorer(metric_name, prediction_type):
    print("Get xgb metric for", metric_name)

    if metric_name is None:
        return None

    if prediction_type == constants.BINARY_CLASSIFICATION:
        metrics_map = {
            "ACCURACY": "error",
            "LOG_LOSS": "logloss",
            "ROC_AUC": "auc"
            # TODO @ml: Check if XGBoost's "map" could work for precision
        }
    elif prediction_type == constants.MULTICLASS:
        metrics_map = {
            # TODO @ml: Check if we could use multiclass even for binary
            "ACCURACY": "merror",
            "LOG_LOSS": "mlogloss"
            # Don't use auc - doesn't work for multiclass
        }
    else:
        metrics_map = {
            "RMSE": "rmse",
            "MAE": "mae"
        }

    print ("XGBoost metric:", metrics_map.get(metric_name, None))
    return metrics_map.get(metric_name, None)


class DkuXGBClassifier(XGBClassifier):

    def predict_proba(self, X, ntree_limit=None, validate_features=True):
        """
        XGBoost 0.82 implements `def predict_proba(self, data, ...)`
        instead of `def predict_proba(self, X, ...)`. This causes a bug when
        using calibration and sklearn 0.24, because predict_proba is then
        called with the X as a named parameter: `predict_proba(X=X)`. The
        solution is to override predict_proba to make sure that the parameter's
        name is X.
        """
        return super(DkuXGBClassifier, self).predict_proba(X, ntree_limit=ntree_limit, validate_features=validate_features)

    def set_params(self, **params):
        if 'missing' in params.keys():
            params['missing'] = params['missing'] if params['missing'] is not None else np.nan
        return super(DkuXGBClassifier, self).set_params(**params)

    def fit(self, X, y, eval_set=None, eval_metric=None, early_stopping_rounds=None, verbose=True, sample_weight=None, xgb_model=None):
        self._features_count = X.shape[1]
        class_weight = self.get_params().get("class_weight")
        if class_weight is not None:
            class_weight_arr = np.vectorize(class_weight.get)(y)
            if sample_weight is None:
                sample_weight = class_weight_arr
            else:
                sample_weight *= class_weight_arr
        try:
            return super(DkuXGBClassifier, self).fit(X, y, eval_set=eval_set or [(X, y)],
                                                     eval_metric=eval_metric,
                                                     early_stopping_rounds=early_stopping_rounds,
                                                     verbose=verbose, sample_weight=sample_weight)
        except Exception as e:
            message = str(e)
            if "GPU support" in message:
                logger.error(message)
                raise Exception("""Your code environment has an installation of XGBoost that does not support computations on GPUs. 
                                   To install XGBoost with GPU support, please refer to http://xgboost.readthedocs.io/en/latest/build.html#building-with-gpu-support
                                   \n\n""" + message)
            else:
                raise e


class DkuXGBRegressor(XGBRegressor):

    def set_params(self, **params):
        if 'missing' in params.keys():
            params['missing'] = params['missing'] if params['missing'] is not None else np.nan
        return super(DkuXGBRegressor, self).set_params(**params)

    def fit(self, X, y, eval_set=None, eval_metric=None, early_stopping_rounds=None, verbose=True, sample_weight=None, xgb_model=None):
        self._features_count = X.shape[1]
        try:
            return super(DkuXGBRegressor, self).fit(X, y, eval_set=eval_set or [(X, y)],
                                                eval_metric=eval_metric,
                                                early_stopping_rounds=early_stopping_rounds,
                                                verbose=verbose, sample_weight=sample_weight)
        except Exception as e:
            message = str(e)
            if "GPU support" in message:
                logger.error(message)
                raise Exception("""Your code environment has an installation of XGBoost that does not support computations on GPUs. 
                                   To install XGBoost with GPU support, please refer to http://xgboost.readthedocs.io/en/latest/build.html#building-with-gpu-support
                                   \n\n""" + message)
            else:
                raise e

