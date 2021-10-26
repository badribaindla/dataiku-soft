import inspect
import logging
import numbers
from copy import deepcopy

import numpy as np
import scipy.sparse as sp
from sklearn import clone
from sklearn.utils.validation import _is_arraylike
from sklearn.utils.validation import _num_samples

from dataiku.base.block_link import register_as_serializable
from dataiku.doctor.distributed.work_scheduler import AbstractContext
from dataiku.doctor.utils import dku_indexing
from dataiku.doctor.utils import unix_time_millis

logger = logging.getLogger(__name__)


@register_as_serializable
class Split(object):
    """
    Indices of a single split
    """

    def __init__(self, train, test):
        self.train = train
        self.test = test


@register_as_serializable
class SearchContext(AbstractContext):
    """
    Store all the context required to fit & score the estimator during the hyperparameter search

    This context is either used directly or pickled/streamed to a remote worker.

    This object (and any of its properties) should NOT be modified (can be shared between threads)
    """

    def __init__(self, X, y, splits, sample_weights, base_estimator, scorer, fit_params, algo_supports_weight,
                 metric_sign):
        self._X = X
        self._y = y
        self._splits = splits
        self._sample_weights = sample_weights
        self._base_estimator = base_estimator
        self._scorer = scorer
        self._fit_params = fit_params
        self._algo_supports_weight = algo_supports_weight
        self._metric_sign = metric_sign

    @property
    def splits(self):
        return self._splits

    def execute_work(self, split_id, parameters):
        """
        Evaluate an hyper-parameter for one split
        """
        train = self._splits[split_id].train
        test = self._splits[split_id].test
        estimator = clone(self._base_estimator)
        fit_params = deepcopy(self._fit_params)  # ch36793

        return _dku_fit_and_score(estimator=estimator, X=self._X, y=self._y,
                                  scorer=self._scorer, train=train, test=test,
                                  parameters=parameters, fit_params=fit_params,
                                  metric_sign=self._metric_sign,
                                  split_id=split_id, sample_weight=self._sample_weights,
                                  algo_supports_weight=self._algo_supports_weight)


def _dku_score(estimator, X_test, y_test, scorer, sample_weight=None, indices=None):
    if inspect.isfunction(scorer):
        argspec = inspect.getargspec(scorer)
    else:
        argspec = [[]]  # scorers are callables, ie. classes
    if 'indices' in argspec[0]:  # regular args
        score = scorer(estimator, X_test, y_test, sample_weight=sample_weight, indices=indices)
    else:
        score = scorer(estimator, X_test, y_test, sample_weight=sample_weight)
    if hasattr(score, 'item'):
        try:
            # e.g. unwrap memmapped scalars
            score = score.item()
        except ValueError:
            # non-scalar?
            pass
    if not isinstance(score, numbers.Number):
        raise ValueError("scoring must return a number, got %s (%s) instead."
                         % (str(score), type(score)))
    return score


def _dku_fit_and_score(estimator, X, y, scorer, train, test, parameters, metric_sign,
                       fit_params, split_id, sample_weight, algo_supports_weight):
    if fit_params is None:
        fit_params = {}

    msg = ''
    if parameters is not None:
        msg = '%s' % (', '.join('%s=%s' % (k, v) for k, v in parameters.items()))
        estimator.set_params(**parameters)
    logger.info("Fit s=%s: %s %s" % (split_id, msg, (64 - len(msg)) * '.'))

    start_time = unix_time_millis()

    X_train = dku_indexing(X, train)
    y_train = dku_indexing(y, train)
    X_test, y_test = None, None  # Try loading test as late as possible for memory consumption

    # XGBoost early stopping
    if fit_params.get("early_stopping_rounds") is not None:
        if fit_params.get("eval_set") is None:
            # log the train and test objective but optimize on the test (last tuple used for early stopping eval)
            X_test = dku_indexing(X, test)
            y_test = dku_indexing(y, test)
            fit_params["eval_set"] = [(X_train, y_train), (X_test, y_test)]
        else:
            pass  # still keep the possibility to use a fixed eval_set

    w_train = None
    if sample_weight is not None:
        w_train = dku_indexing(sample_weight, train)
        if algo_supports_weight:
            # fit with sample weights whenever they are enabled AND the algorithm supports them
            fit_params["sample_weight"] = np.array(w_train)

    fit_params = {k: _dku_index_param_value(X, v, train) for k, v in fit_params.items()}

    # Some fold may not have one of the classes, leading to a failure
    class_weight = estimator.get_params().get("class_weight", None)
    if class_weight is not None:
        classes = np.unique(y_train.values)
        estimator.set_params(class_weight={key: class_weight[key] for key in class_weight.keys() if key in classes})

    estimator.fit(X_train, y_train, **fit_params)

    fit_time = unix_time_millis() - start_time
    # score with sample weights whenever they are enabled, regardless of the support by the algorithm
    train_score = _dku_score(estimator, X_train, y_train, scorer, sample_weight=w_train, indices=train)

    # For memory usage, load test here as we don't need X_train anymore
    if X_test is None:
        X_test = dku_indexing(X, test)
        y_test = dku_indexing(y, test)

    w_test = None
    if sample_weight is not None:
        w_test = dku_indexing(sample_weight, test)
    # score with sample weights whenever they are enabled, regardless of the support by the algorithm
    test_score = _dku_score(estimator, X_test, y_test, scorer, sample_weight=w_test, indices=test)

    score_time = unix_time_millis() - start_time - fit_time

    end_msg = "%s (ft=%.1fs st=%.1fs sc=%s, sg=%s)" % (msg, fit_time / 1000, score_time / 1000, test_score, metric_sign)
    logger.info("Done s=%s: %s" % (split_id, end_msg))

    num_samples = _num_samples(X_test)
    best_iteration = getattr(estimator, 'best_iteration', None)

    return {
        # 'test_score_gib' is aimed to be used for picking the best estimator (always "greater is better")
        "test_score_gib": test_score,

        # Here, 'metric_sign' is used here to get the initial metric's value since 'train_score'
        # and 'test_score' are forced to be 'greater is better' (via make_scorer())
        "train_score": metric_sign * train_score,
        "test_score": metric_sign * test_score,

        "num_samples": num_samples,
        "fit_time": fit_time,
        "score_time": score_time,
        "time": fit_time + score_time,
        "parameters": parameters,
        "best_iteration": best_iteration,
        "done_at": unix_time_millis(),
        "split_id": split_id
    }


def _dku_index_param_value(X, v, indices):
    if not _is_arraylike(v) or _num_samples(v) != _num_samples(X):
        # pass through: skip indexing
        return v
    if sp.issparse(v):
        v = v.tocsr()
    return dku_indexing(v, indices)
