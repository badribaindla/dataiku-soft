import logging
import pandas as pd, numpy as np
import copy
from numbers import Number

from sklearn import model_selection
from sklearn.metrics import *
from sklearn.model_selection import ParameterSampler
from scipy.stats.distributions import uniform
from scipy.stats.distributions import reciprocal
from scipy.stats.distributions import randint

import json

from dataiku.base.utils import safe_unicode_str
import dataiku.doctor.constants as constants
from dataiku.doctor.crossval.search_runner import SearchRunner
from dataiku.doctor.crossval.strategies.bayesian_search_strategy import BayesianSearchStrategy
from dataiku.doctor.crossval.strategies.grid_search_strategy import GridSearchStrategy
from dataiku.doctor.crossval.strategies.random_search_strategy import RandomSearchStrategy
from dataiku.doctor.plugins.plugin_params import get_prediction_algo_params
from .metric import BINARY_METRICS_NAME_TO_FIELD_NAME, MULTICLASS_METRICS_NAME_TO_FIELD_NAME, \
    REGRESSION_METRICS_NAME_TO_FIELD_NAME
from ..utils.metrics import *
from dataiku.doctor.utils import dku_write_mode_for_pickling
from dataiku.doctor.utils import dku_indexing
from dataiku.doctor.utils.crossval import DKUSortedSingleSplit
from dataiku.doctor.utils.estimator import set_column_labels
import inspect

logger = logging.getLogger(__name__)


def greater_is_better(metric, custom_evaluation_metric_gib):

    if metric == "CUSTOM":
        return custom_evaluation_metric_gib
    else:
        lower_is_better = ['MAE', 'MSE', 'RMSE', 'RMSLE', 'LOG_LOSS', 'MAPE']
        return metric not in lower_is_better


class HyperparameterDimension(object):

    def __init__(self, dimension_definition):
        self.dimension_definition = dimension_definition

    def __str__(self):
        return "%s(%s)" % (self.__class__.__name__, self.dimension_definition.__str__())

    def build(self, strategy):
        raise NotImplementedError("build method must be implemented in "
                                  "children of HyperparameterDimension")


class NumericalHyperparameterDimension(HyperparameterDimension):

    def _get_mode(self, strategy):
        if strategy == "GRID":
            return self.dimension_definition["gridMode"]
        elif strategy in {"RANDOM", "BAYESIAN"}:
            return self.dimension_definition["randomMode"]

    def _get_range(self):
        if "range" not in self.dimension_definition.keys():
            raise ValueError("Numerical dimension must have a 'range' parameter")
        return self.dimension_definition["range"]

    def _get_values(self):
        return self.dimension_definition.get("values", [])

    def build_grid(self, a, b, n, scaling):
        raise NotImplementedError()

    def build_marginal_distribution(self, a, b, scaling, strategy):
        raise NotImplementedError()

    def build(self, strategy):
        search_mode = self._get_mode(strategy)
        if search_mode == "EXPLICIT":
            if strategy in {"GRID", "RANDOM"}:
                return self._get_values()
            elif strategy == "BAYESIAN":
                from skopt.space import Categorical
                return Categorical(self._get_values())
            else:
                raise ValueError()
        elif search_mode == "RANGE":
            dim_range = self._get_range()
            a = dim_range["min"]
            b = dim_range["max"]
            scaling = dim_range["scaling"]
            if strategy == "GRID":
                n = dim_range["nbValues"]
                return self.build_grid(a, b, n, scaling)
            else:
                return self.build_marginal_distribution(a, b, scaling, strategy)
        else:
            raise ValueError("unknown search mode {} for strategy {}".format(search_mode, strategy))


class FloatHyperparameterDimension(NumericalHyperparameterDimension):

    def build_grid(self, a, b, n, scaling):
        if a == b:
            return [a]
        elif scaling == "LINEAR":
            return [a + (b-a) * i / (n - 1) for i in range(n)]
        elif scaling == "LOGARITHMIC":
            loga = np.log(a)
            logb = np.log(b)
            return [np.exp(loga + (logb - loga) * i / (n - 1)) for i in range(n)]

    def build_marginal_distribution(self, a, b, scaling, strategy):
        if strategy == "RANDOM":
            if a == b:
                return [a]
            elif scaling == "LINEAR":
                dist = uniform(a, b - a)
            elif scaling == "LOGARITHMIC":
                dist = reciprocal(a, b)
            else:
                raise ValueError("Dimension scaling")
        elif strategy == "BAYESIAN":
            from skopt.space import Real
            if scaling == "LINEAR":
                dist = Real(a, b)
            elif scaling == "LOGARITHMIC":
                dist = Real(a, b, prior="log-uniform")
            else:
                raise ValueError("Dimension scaling")
        else:
            raise ValueError("Search strategy")
        return dist


class IntegerHyperparameterDimension(NumericalHyperparameterDimension):

    def build_grid(self, low, high, n, scaling):
        """
            Building grid of dimension depending on strategy.
            Both low and high are inclusive
        """
        if scaling == "LINEAR":
            if high - low < n:
                return list(range(low, high + 1))
            return [int(low + (high-low) * i / (n - 1)) for i in range(n)]
        elif scaling == "LOGARITHMIC":
            log_low = np.log(low)
            log_high = np.log(high)
            return list(sorted(set([int(np.exp(log_low + (log_high - log_low) * i / (n - 1))) for i in range(n)])))

    def build_marginal_distribution(self, low, high, scaling, strategy):
        """
            Building marginal distribution of dimension depending on strategy.
            Both low and high are inclusive
        """
        if strategy == "RANDOM":
            if low == high:
                return [low]
            elif scaling == "LINEAR":
                dist = randint(low, high + 1)  # upper bound is exclusive in randint
            elif scaling == "LOGARITHMIC":
                raise NotImplementedError("Dimension scaling = {}".format(scaling))
            else:
                raise ValueError("Dimension scaling = {}".format(scaling))
        elif strategy == "BAYESIAN":
            from skopt.space import Integer
            if scaling == "LINEAR":
                dist = Integer(low, high, dtype=int)
            elif scaling == "LOGARITHMIC":
                dist = Integer(low, high, prior="log-uniform", dtype=int)  # Added in skopt 0.7
            else:
                raise ValueError("Dimension scaling = {}".format(scaling))
        else:
            raise ValueError("Search strategy = {}".format(strategy))
        return dist


class CategoricalHyperparameterDimension(HyperparameterDimension):

    def _get_values(self):
        return self.dimension_definition.get("values", {})

    def _get_enabled_values_list(self):
        values = self._get_values()
        return [name for (name, val) in values.items() if val.get("enabled")]

    def build(self, strategy):
        if strategy in {"GRID", "RANDOM"}:
            return self._get_enabled_values_list()
        elif strategy == "BAYESIAN":
            from skopt.space import Categorical
            return Categorical(self._get_enabled_values_list())
        else:
            raise ValueError

    def set_values(self, values):
        self.dimension_definition["values"] = values


class HyperparametersSpace(object):

    def __init__(self, space_definition):
        self.space_definition = space_definition
        self.random_state = None

    def set_random_state(self, random_state):
        self.random_state = random_state

    @staticmethod
    def enrich_hyperparam_point(point):
        # By default only return the hyperparam point
        # May be overwritten for special handling, e.g. infer min_samples_split from min_samples_leaf
        return point

    def build_space(self, strategy):
        space = {}
        for hyperparam_name, dimension in self.space_definition.items():
            space[hyperparam_name] = dimension.build(strategy)
        return space

    def _get_parameter_sampler(self, n_iter):
        distribution = self.build_space("RANDOM")
        return ParameterSampler(distribution, n_iter, self.random_state)

    def get_random_parameters(self, n_samples):
        parameter_sampler = self._get_parameter_sampler(n_samples)
        for sample in parameter_sampler:
            yield self.enrich_hyperparam_point(sample)

    def get_optimizer(self):
        return DkuOptimizer(self)


class DkuAbstractOptimizer(object):

    def ask(self, n_samples=None):
        raise NotImplementedError()

    def tell(self, params, score):
        raise NotImplementedError()


class DkuOptimizer(DkuAbstractOptimizer):

    """
        Wrapper of skopt.Optimizer to work with DSS HyperparemetersSpace.

        Provides:
         * `ask` method to retrieve new hp points to test
         * `tell` method to give back results for those points and update the optimizer

        Note: calling multiple times ask(n_samples) without providing feedback via tell in between calls will
              yield the same samples
    """

    def __init__(self, hyperparameter_space):
        from skopt import Optimizer

        self.space = hyperparameter_space
        self.distribution = hyperparameter_space.build_space("BAYESIAN")
        self.optimized_features = self.distribution.keys()
        self.optimized_dimensions = self.distribution.values()
        self.__optimizer = Optimizer(self.optimized_dimensions, random_state=hyperparameter_space.random_state)

    def ask(self, n_samples=None):
        if n_samples is None:
            n_samples = 1

        for sample_distrib in self.__optimizer.ask(n_samples):
            sample = dict(zip(self.optimized_features, sample_distrib))
            yield self.space.enrich_hyperparam_point(sample)

    def tell(self, params_list, scores):
        kept_params_list = [[params[p] for p in self.optimized_features] for params in params_list]
        self.__optimizer.tell(kept_params_list, scores)


class SGDRegressionOptimizer(DkuAbstractOptimizer):

    def __init__(self, sgd_reg_hyperparameters_space):
        from skopt import Optimizer
        space_copy = copy.deepcopy(sgd_reg_hyperparameters_space)

        # Removing "epsilon" from space definition to build dedicated optimizer
        epsilon_dim = space_copy.space_definition.pop("epsilon")
        self.__epsilon_optimizer = Optimizer([epsilon_dim.build("BAYESIAN")], random_state=space_copy.random_state)

        # Building optimizer with all hyper parameters but "epsilon"
        self.__other_optimizer = DkuOptimizer(space_copy)

    def ask(self, n_samples=None):
        for sample in self.__other_optimizer.ask(n_samples):

            # Add epsilon if required
            if sample.get("loss") == "huber":
                epsilon_draw = self.__epsilon_optimizer.ask()[0]
                sample["epsilon"] = epsilon_draw

            yield sample

    def tell(self, params_list, scores):

        other_params_list = []
        other_scores = []
        epsilon_params_list = []
        epsilon_scores = []

        for index, params in enumerate(params_list):
            if "epsilon" in params.keys():
                epsilon_params_list.append([params["epsilon"]])
                epsilon_scores.append(scores[index])

            other_params_list.append(params)
            other_scores.append(scores[index])

        if len(other_params_list) > 0:
            self.__other_optimizer.tell(other_params_list, other_scores)

        if len(epsilon_params_list) > 0:
            self.__epsilon_optimizer.tell(epsilon_params_list, epsilon_scores)


class GridHyperparametersSpace(HyperparametersSpace):

    def __init__(self, grid=None):
        if grid is None:
            self.grid = {}
        else:
            self.grid = grid
        super(GridHyperparametersSpace, self).__init__(None)

    def build_space(self, strategy):
        if strategy == "GRID":
            return self.build_grid()
        else:
            return NotImplementedError("Other strategies than Grid search are not implemented yet")

    def build_grid(self):
        return self.grid


class TreesHyperparametersSpace(HyperparametersSpace):

    @staticmethod
    def enrich_hyperparam_point(point):
        min_samples_leaf = point.get("min_samples_leaf", None)
        if min_samples_leaf is not None:
            point["min_samples_split"] = min_samples_leaf * 3
        return point


class SGDRegressionHyperparametersSpace(HyperparametersSpace):
    """
        Special class to handle SGD Regression when both "huber" and "squared_loss" are enabled.
        In that case, when "huber" loss is selected, a new numerical hyperparameter ("epsilon") is available.
        This means that:
         * for grid-search: we need two grids:
             - a first one with only "squared_loss" and no "epsilon"
             - a second one with only "huber" and no "epsilon"
         * for random search, we draw all the hyperparameters (including "epsilon") and remove it
           afterwards in `enrich_hyperparam_point`
         * for bayesian search, we assume independence between variables and hold two optimizers:
            - one with all hp except "epsilon"
            - one with only "epsilon", used only when "squared_loss" is drawn from the other
    """

    @staticmethod
    def enrich_hyperparam_point(point):
        if point.get("loss") == "squared_loss" and point.get("epsilon") is not None:
            del point["epsilon"]
        return point

    def build_space(self, strategy):
        if strategy == "GRID":
            return self.build_grid()
        else:
            return super(SGDRegressionHyperparametersSpace, self).build_space(strategy)

    def build_grid(self):
        return [
            {
                "alpha": self.space_definition["alpha"].build("GRID"),
                "penalty": self.space_definition["penalty"].build("GRID"),
                "loss": ["squared_loss"]
            },
            {
                "alpha": self.space_definition["alpha"].build("GRID"),
                "penalty": self.space_definition["penalty"].build("GRID"),
                "loss": ["huber"],
                "epsilon": self.space_definition["epsilon"].build("GRID")
            }]

    def get_optimizer(self):
        return SGDRegressionOptimizer(self)


def get_svm_gamma_params_from_clf_params(clf_params):
    ret = {}
    # always discard "gamma" for "linear" kernel, in order not to return the default "gamma" value of the clf
    if "kernel" in clf_params and clf_params["kernel"] == "linear":
        return ret

    if "gamma" in clf_params:
        if isinstance(clf_params["gamma"], Number):  # custom values
            ret["gamma"] = "custom"
            ret["custom_gamma"] = clf_params["gamma"]
        else:
            ret["gamma"] = clf_params["gamma"]
    return ret


class SVMOptimizer(DkuAbstractOptimizer):

    def __init__(self, svm_hyperparameters_space):
        from skopt import Optimizer
        space_copy = copy.deepcopy(svm_hyperparameters_space)

        # Removing "gamma" from space definition to build dedicated optimizer
        gamma_dim = space_copy.space_definition.pop("gamma")
        self.__gamma_optimizer = Optimizer([gamma_dim.build("BAYESIAN")],
                                           random_state=space_copy.random_state)

        # Removing "custom_gamma" from space definition to build dedicated optimizer
        custom_gamma_dim = space_copy.space_definition.pop("custom_gamma")
        self.__custom_gamma_optimizer = Optimizer([custom_gamma_dim.build("BAYESIAN")],
                                                  random_state=space_copy.random_state)

        # Building optimizer with all hyper parameters but "gamma" and "custom_gamma"
        self.__other_optimizer = DkuOptimizer(space_copy)

    def ask(self, n_samples=None):
        for sample in self.__other_optimizer.ask(n_samples):

            # Add gamma if required
            if sample.get("kernel") != "linear":
                gamma_draw = self.__gamma_optimizer.ask()[0]

                # Add custom gamma if required
                if gamma_draw == "custom":
                    actual_gamma = self.__custom_gamma_optimizer.ask()[0]
                else:
                    actual_gamma = gamma_draw

                sample["gamma"] = actual_gamma

            yield sample

    def tell(self, params_list, scores):

        other_params_list = []
        other_scores = []
        gamma_params_list = []
        gamma_scores = []
        custom_gamma_params_list = []
        custom_gamma_scores = []

        for index, params in enumerate(params_list):
            gamma_params = get_svm_gamma_params_from_clf_params(params)
            if "gamma" in gamma_params:
                gamma_params_list.append([gamma_params["gamma"]])
                gamma_scores.append(scores[index])
            if "custom_gamma" in gamma_params:  # custom value
                custom_gamma_params_list.append([gamma_params["custom_gamma"]])
                custom_gamma_scores.append(scores[index])

            other_params_list.append(params)
            other_scores.append(scores[index])

        if len(other_params_list) > 0:
            self.__other_optimizer.tell(other_params_list, other_scores)

        if len(custom_gamma_params_list) > 0:
            self.__custom_gamma_optimizer.tell(custom_gamma_params_list, custom_gamma_scores)

        if len(gamma_params_list) > 0:
            self.__gamma_optimizer.tell(gamma_params_list, gamma_scores)


class SVMHyperparametersSpace(HyperparametersSpace):
    """
        Special class to handle SVM classif/regression when containing kernels that may use gamma:
         * if "linear" kernel is enabled, handled separately without gamma
         * for gamma-compatible kernels, special case when both "auto"/"scale" and "custom" gamma are enabled.
           In that case, when "custom" gamma is selected, the value of "custom_gamma" are used
        This means that:
         * for grid search:
            * we do one grid for "linear" without gamma,
            * and one grid for the others, where we merge custom_gamma with "scale" and/or "auto"
         * for random search, we draw all the hyperparameters (including "gamma" and "custom_gamma") and:
            * discard them if "linear" kernel is selected
            * otherwise, select either "auto"/"scale" or the corresponding "custom_gamma" value in enrich
         * for bayesian search, we assume independence between variables and hold three optimizers:
            - one with all hp except "custom_gamma", "gamma"
            - one with only "gamma", used only when a gamma-compatible kernel is drawn
            - one with only "custom_gamma", used only when "custom" is drawn for gamma
    """

    @staticmethod
    def enrich_hyperparam_point(point):
        if point.get("kernel") == "linear":
            if "gamma" in point:
                del point["gamma"]
        else:
            if point.get("gamma") == "custom":
                if "custom_gamma" in point:
                    point["gamma"] = point["custom_gamma"]
                else:  # should not happen
                    del point["gamma"]

        # Always delete custom_gamma as it's not a proper SVC (or SVM) param
        if "custom_gamma" in point:
            del point["custom_gamma"]
        return point

    def build_space(self, strategy):
        if strategy == "GRID":
            return self.build_grid()
        else:
            return super(SVMHyperparametersSpace, self).build_space(strategy)

    def build_grid(self):
        grids = []

        if self.space_definition["kernel"].dimension_definition["values"]["linear"]["enabled"]:
            grids.append({
                "C": self.space_definition["C"].build("GRID"),
                "kernel": ["linear"]
            })

        kernels_except_linear = copy.deepcopy(self.space_definition["kernel"])
        kernels_except_linear.dimension_definition["values"]["linear"]["enabled"] = False

        used_gammas = []
        if self.space_definition["gamma"].dimension_definition["values"]["custom"]["enabled"]:
            used_gammas.extend(self.space_definition["custom_gamma"].build("GRID"))
        if self.space_definition["gamma"].dimension_definition["values"]["auto"]["enabled"]:
            used_gammas.append("auto")
        if self.space_definition["gamma"].dimension_definition["values"]["scale"]["enabled"]:
            used_gammas.append("scale")

        grids.append({
            "gamma": used_gammas,
            "C": self.space_definition["C"].build("GRID"),
            "kernel": kernels_except_linear.build("GRID")
        })

        return grids

    def get_optimizer(self):
        return SVMOptimizer(self)


class TrainableModel(object):
    """
        All the required info for training a model:
            * a HyperparametersSpace
            * a classifier (sklearn object)
            * optional fit_params to be passed to classifier.fit() afterwords
            * whether this model supports sample weights or not
    """

    def __init__(self, base_clf, hyperparemeters_space=None, fit_params=None, support_sample_weights=True):
        self.base_clf = base_clf
        self.support_sample_weights = support_sample_weights
        self.hyperparameters_space = hyperparemeters_space if hyperparemeters_space is not None \
            else HyperparametersSpace({})
        self.fit_params = fit_params if fit_params is not None else {}


class PredictionAlgorithm(object):
    algorithm = None

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        """
        Given the modeling & input params outputs a TrainableModel instance

        :param in_hyperparam_space: Input hyper-parameter space (DKU names)
        :type in_hyperparam_space: dict
        :param modeling_params: Modeling params for current model
        :type modeling_params: dict
        :param prediction_type: Prediction type
        :type prediction_type: str
        :return: trainable_model
        :rtype: TrainableModel
        """
        raise NotImplementedError('Not implemented')

    def actual_params(self, ret, clf, fit_params):
        """
        Given a fitted classifier, outputs a dict of algorithm params to be stored back to DKU
        :param ret: Input parameter grid (DKU names)
        :type ret: dict
        :param clf: Sklearn Classifier (fitted)
        :type clf: dict
        :param fit_params: Fit params
        :type fit_params: dict
        :return: Parameter dict (resolved & others)
        :rtype: dict
        """
        raise NotImplementedError('Not implemented')

    def get_hyperparameter_search_runner(self, modeling_params=None, column_labels=None, m_folder=None, prediction_type="REGRESSION",
                                         target_map=None, unprocessed=None, split_desc=None):
        logger.info("Create CLF from params: %s for algorithm %s" % (modeling_params, self.algorithm))

        grid_search_params = modeling_params.get("grid_search_params", {})
        search_strategy_type = grid_search_params.get("strategy", "GRID")
        in_hyperparam_space = get_input_hypeparameter_space(modeling_params, self.algorithm)
        trainable_model = self.model_from_params(in_hyperparam_space, modeling_params, prediction_type)
        set_column_labels(trainable_model.base_clf, column_labels)

        grid_scorer = get_grid_scorer(modeling_params, prediction_type, target_map, unprocessed)

        cv = build_cv(modeling_params, column_labels, prediction_type != 'REGRESSION')

        n_threads = safe_positive_int(grid_search_params.get("nJobs"))
        distributed = grid_search_params.get('distributed', False)
        n_containers = safe_positive_int(grid_search_params.get("nContainers"))

        if search_strategy_type == "GRID":
            n_iter = grid_search_params.get('nIter', None) if \
                grid_search_params.get('nIter', None) != 0 else None
        else:
            n_iter = grid_search_params.get('nIterRandom', None) if \
                grid_search_params.get('nIterRandom', None) != 0 else None

        timeout = grid_search_params.get('timeout', None) if grid_search_params.get('timeout', None) != 0 else None
        trainable_model.hyperparameters_space.set_random_state(grid_search_params.get("seed", 0))

        if search_strategy_type == "GRID":
            search_strategy = GridSearchStrategy(trainable_model.hyperparameters_space,
                                                 modeling_params['grid_search_params'].get('randomized', False))
        elif search_strategy_type == "RANDOM":
            search_strategy = RandomSearchStrategy(trainable_model.hyperparameters_space)
        elif search_strategy_type == "BAYESIAN":

            search_strategy = BayesianSearchStrategy(trainable_model.hyperparameters_space)
        else:
            raise NotImplementedError("Only grid hyperparameters search is implemented")

        return SearchRunner(estimator=trainable_model.base_clf,
                            hyperparameters_space=trainable_model.hyperparameters_space,
                            scoring=grid_scorer,
                            fit_params=trainable_model.fit_params,
                            cv=cv,
                            n_threads=n_threads,
                            distributed=distributed,
                            n_containers=n_containers,
                            evaluation_metric=modeling_params["metrics"]["evaluationMetric"],
                            m_folder=m_folder,
                            n_iter=n_iter,
                            timeout=timeout,
                            custom_evaluation_metric_gib=modeling_params.get("metrics", {}).get(
                                "customEvaluationMetricGIB", True),
                            algo_supports_weight=trainable_model.support_sample_weights,
                            search_strategy=search_strategy)


    def get_actual_params(self, modeling_params, clf, fit_params):
        ret = {
            "algorithm": modeling_params["algorithm"],
            "skipExpensiveReports": modeling_params["skipExpensiveReports"]
        }
        return self.actual_params(ret, clf, fit_params)


def should_be_sparsed(train_X):
    """ Check if it's necessary for the data to be sparsed. Should not bother doing sparse below 50M cells.
    :param train_X: the dataset
    :type train_X: doctor.MultiFrame
    :rtype: bool
    """
    (n_rows, n_cols) = train_X.shape()
    n_cells = n_rows * n_cols
    min_for_sparse = 50 * 1000 * 1000
    return n_cells > min_for_sparse


def prepare_multiframe(train_X, modeling_params):
    """ Transform the MultiFrame either into a ndarray or a sparse matrix
    :param train_X: the Multiframe to transform
    :param modeling_params: the pre-trained modeling params
    :return: the array and a bool to know if the array is sparsed or not
    :rtype: (np.ndarray | scipy.sparse.csr_matrix, bool)
    """
    (nrows, ncols) = train_X.shape()
    tn = nrows * ncols
    nnz = train_X.nnz()
    fill_ratio = (float(nnz) / float(tn)) if tn != 0 else 0.0

    logger.info("prepare multiframe shape=(%s,%s) tn=%s nnz=%s fill_ratio=%.2f" %
                        (nrows, ncols, tn, nnz, fill_ratio))

    if not should_be_sparsed(train_X):
        logger.info("too small, using array")
        return train_X.as_np_array(), False

    if fill_ratio > 0.5:
        logger.info("too filled, using array")
        return train_X.as_np_array(), False

    acceptable_sparse_algos = ["SGD_REGRESSION", "RIDGE_REGRESSION", "LASSO_REGRESSION", "LOGISTIC_REGRESSION", "SGD_CLASSIFICATION"]

    should_return_csr = modeling_params["algorithm"] in acceptable_sparse_algos

    # For plugin algorithm, check in plugin params whether it accepts sparse matrix or not
    if not should_return_csr and modeling_params["algorithm"] == "CUSTOM_PLUGIN":
        algo_info = modeling_params["plugin_python_grid"]
        should_return_csr = should_return_csr or algo_info.get("acceptsSparseMatrix", False)

    if should_return_csr:
        logger.info("Algorithm is supported, using CSR")
        return train_X.as_csr_matrix(), True
    else:
        logger.info("Algorithm not supported, using NPA")
        return train_X.as_np_array(), False


def scikit_model(modeling_params):
    code = modeling_params["custom_python"]['code']
    ctx = {}
    exec(code, ctx)

    clf = ctx.get('clf', None)

    if clf is None:
        raise Exception("No variable 'clf' defined in Custom Python model")

    logger.info("Using custom mode: %s" % clf)
    return clf


def build_cv(modeling_params, column_labels, is_classification):
    grid_search_params = modeling_params["grid_search_params"]
    seed = grid_search_params.get("cvSeed", 1337)
    mode = grid_search_params.get("mode", None)
    if mode is None:
        logger.info("Using default CV strategy (3-fold CV, auto-stratified)")
        return 3

    elif mode == "SHUFFLE":
        if not 1 > grid_search_params.get("splitRatio", -1) > 0:
            raise ValueError('Grid seach split ratio should be in interval ]0; 1[.')

        test_size = 1.0-grid_search_params["splitRatio"]  # TODO would be better to use the test ratio rather than train ratio as param but this is more consistent with DSS
        logger.info("test_size={}".format(test_size))
        if is_classification and grid_search_params.get("stratified", False):
            logger.info("Using stratified shuffle split with ratio %s" % grid_search_params["splitRatio"])
            return model_selection.StratifiedShuffleSplit(
                n_splits=grid_search_params["shuffleIterations"],
                test_size=test_size,
                random_state=seed
            )
        else:
            logger.info("Using shuffle split with ratio %s" % grid_search_params["splitRatio"])
            return model_selection.ShuffleSplit(
                n_splits=grid_search_params["shuffleIterations"],
                test_size=test_size,
                random_state=seed
            )

    elif mode == "KFOLD":
        if not 2 <= grid_search_params.get("nFolds", 0) <= 1000:
            raise ValueError('Grid seach number of fold should be an integer in [2 ; 1000].')

        if is_classification and grid_search_params.get("stratified", False):
            logger.info("Using stratified K-Fold CV with k=%s" % grid_search_params["nFolds"])
            return model_selection.StratifiedKFold(
                n_splits=grid_search_params["nFolds"],
                shuffle=True,
                random_state=seed
            )
        else:
            logger.info("Using K-Fold CV with k=%s" % grid_search_params["nFolds"])
            return model_selection.KFold(
                n_splits=grid_search_params["nFolds"],
                shuffle=True,
                random_state=seed
            )

    elif mode == "TIME_SERIES_KFOLD":
        if not 2 <= grid_search_params.get("nFolds", 0) <= 1000:
            raise ValueError('Grid seach number of fold should be an integer in [2 ; 1000].')
        else:
            logging.info("Using Time Series CV with k=%s" % grid_search_params["nFolds"])
            return model_selection.TimeSeriesSplit(n_splits=grid_search_params["nFolds"])

    elif mode == "TIME_SERIES_SINGLE_SPLIT":
        split_ratio = grid_search_params.get("splitRatio", -1)
        if not 1 > split_ratio > 0:
            raise ValueError('Grid seach split ratio should be in interval ]0; 1[.')
        test_size = 1-split_ratio
        return DKUSortedSingleSplit(test_size=test_size)

    elif mode == "CUSTOM":
        if not len(grid_search_params.get("code", "").strip()) > 0:
            raise ValueError('Custom grid search cross-validation is not specified')
        code = grid_search_params["code"]
        ctx = {}
        exec(code, ctx)

        cv = ctx.get('cv', None)

        if cv is None:
            raise ValueError("No variable 'cv' defined in Custom grid search code")
        logger.info("Using custom CV: %s" % cv)

        try:
            cv.set_column_labels(column_labels)
        except:
            logger.info("Custom grid search code does not support column labels")

        return cv


def train_test_split(X, y, test_size, random_state):
    return model_selection.train_test_split(X, y, test_size=test_size, random_state=random_state)


def dump_pretrain_info(clf, train_X, train_y, weight=None, calibration=False):
    logger.info("Fitting model:")
    logger.info("  Model is: %s" % clf)
    logger.info("  train_X class: %s" % str(train_X.__class__))
    logger.info("  train_X shape: %s" % str(train_X.shape))
    logger.info("  train_y shape: %s" % str(train_y.shape))
    if weight is not None:
        logger.info("  train_weight shape: %s" % str(weight.shape))
    if calibration is not None:
        logger.info("  calibration enabled: a sub-sample of the train data has been saved for calibration")


def get_initial_intrinsic_perf_data(train_X, is_sparse):

    initial_intrinsic_perf_data = {
        "modelInputNRows": train_X.shape[0],
        "modelInputNCols": train_X.shape[1],
        "modelInputIsSparse": is_sparse
    }
    if is_sparse:
        initial_intrinsic_perf_data["modelInputMemory"] = \
                    train_X.data.nbytes + train_X.indptr.nbytes + train_X.indices.nbytes
    else:
        initial_intrinsic_perf_data["modelInputMemory"] = train_X.nbytes
    return initial_intrinsic_perf_data

# python2 complains when you want to compile code that contains in the same function
# a subfunction and a exec() statement
def python2_friendly_exec(code, ctx_global, ctx_local):
    exec(code, ctx_global, ctx_local)

def get_custom_scorefunc(metric_params, unprocessed, indices=None):
    if "customEvaluationMetricCode" not in metric_params or \
            not metric_params["customEvaluationMetricCode"]:
        raise ValueError("You must write the custom evaluation code")
    code = metric_params["customEvaluationMetricCode"]
    dic = {}
    python2_friendly_exec(code, dic, dic)
    if "score" not in dic:
        raise ValueError("Custom evaluation function not defined")
    fn = dic["score"]

    def _wrapped(a, b, sample_weight=None):
        try:
            argspec = inspect.getargspec(fn)
            if 'X_valid' in argspec[0]:
                if indices is not None:
                    X_valid = dku_indexing(unprocessed, indices)
                else:
                    X_valid = unprocessed
                if 'sample_weight' in argspec[0]:
                    val = fn(a, b, sample_weight=sample_weight, X_valid=X_valid)
                else:
                    val = fn(a, b, X_valid=X_valid)
            else:
                if 'sample_weight' in argspec[0]:
                    val = fn(a, b, sample_weight=sample_weight)
                else:
                    val = fn(a, b)
        except Exception as e:
            logger.exception("Custom scoring function failed")
            raise ValueError("Custom scoring function failed: %s" % (e))
        check_customscore(val)
        return val
    return _wrapped


def check_customscore(score):
    if score is None:
        raise ValueError("Custom evaluation function returned None. Illegal value")
    if np.isnan(score):
        raise ValueError("Custom evaluation function returned NaN. Illegal value")
    if np.isinf(score):
        raise ValueError("Custom evaluation function returned Infinity. Illegal value")


def get_grid_scorer(modeling_params, prediction_type, target_map=None, unprocessed=None, custom_make_scorer=None):
    metric_name = modeling_params["metrics"]["evaluationMetric"]
    return get_grid_scorers(modeling_params,prediction_type,target_map,unprocessed,custom_make_scorer)[metric_name]

def get_grid_scorers(modeling_params, prediction_type, target_map=None, unprocessed=None, custom_make_scorer=None):
    """Returns a scorer, ie a function with signature(clf, X, y)
    """
    if custom_make_scorer is not None:
        make_scorer_func = custom_make_scorer
        remap = False
    else:
        make_scorer_func = make_scorer #
        remap = True

    if prediction_type == "MULTICLASS":
        average = "weighted"
    elif prediction_type == "BINARY_CLASSIFICATION":
        average = "binary"
    else:
        average = None

    scorer_map = {
        "ACCURACY":  make_scorer_func(accuracy_score, greater_is_better=True),
        "PRECISION": make_scorer_func(lambda y_true, y_pred, sample_weight=None: precision_score(y_true, y_pred, average=average, sample_weight=sample_weight),
                                  greater_is_better=True),
        "RECALL": make_scorer_func(lambda y_true, y_pred, sample_weight=None: recall_score(y_true, y_pred, average=average, sample_weight=sample_weight),
                               greater_is_better=True),
        "F1": make_scorer_func(lambda y_true, y_pred, sample_weight=None: f1_score(y_true, y_pred, average=average, sample_weight=sample_weight),
                           greater_is_better=True),
        "LOG_LOSS": _dku_make_scorer_proba(log_loss, prediction_type, target_map, make_scorer_func,
                                           greater_is_better=False, remap=remap),
        "ROC_AUC": _dku_make_scorer_proba(mroc_auc_score, prediction_type, target_map, make_scorer_func,
                                          greater_is_better=True, remap=remap),

        "COST_MATRIX": make_scorer_func(make_cost_matrix_score(modeling_params["metrics"]),
                                greater_is_better=True),

        "CUMULATIVE_LIFT": _dku_make_scorer_proba(make_lift_score(modeling_params["metrics"]), prediction_type,
                                                  target_map, make_scorer_func, greater_is_better=True, remap=remap),

        "EVS": make_scorer_func(explained_variance_score, greater_is_better=True),
        "MAPE": make_scorer_func(mean_absolute_percentage_error, greater_is_better=False),
        "MAE": make_scorer_func(mean_absolute_error, greater_is_better=False),
        "MSE": make_scorer_func(mean_squared_error, greater_is_better=False),
        "RMSE": make_scorer_func(rmse_score, greater_is_better=False),
        "RMSLE": make_scorer_func(rmsle_score, greater_is_better=False),
        "R2": make_scorer_func(r2_score, greater_is_better=True),
    }

    metric_params = modeling_params["metrics"]
    if metric_params['evaluationMetric'] == "CUSTOM":
        if custom_make_scorer is not None:
            custom_scorefunc = get_custom_scorefunc(modeling_params["metrics"], unprocessed, indices=None)
            scorer_map["CUSTOM"] = make_scorer_func(custom_scorefunc, greater_is_better=metric_params["customEvaluationMetricGIB"],
                                    needs_proba=metric_params["customEvaluationMetricNeedsProba"])
        else:
            # scikit-learn will not do much with so-called "scorer" object when there are functions, so we 'cheat' by passing
            # a function that doesn't conform to the pure spec: it adds a 'indices' argument that the grid searcher will
            # notice and use to send the sub-index of the part being scored
            def expose_indices_wrapper(estimator, Y, y, sample_weight=None, indices=None):
                custom_scorefunc = get_custom_scorefunc(modeling_params["metrics"], unprocessed, indices)
                greater_is_better = metric_params["customEvaluationMetricGIB"]
                needs_proba = metric_params["customEvaluationMetricNeedsProba"]

                if prediction_type == "BINARY_CLASSIFICATION" and needs_proba:
                    # In binary classification with needs_proba == True, we use a custom scorer that does not truncate
                    # y_pred to its 2nd column (as sklearn does by default in _ProbaScorer). This is to keep consistency
                    # with `dataiku.doctor.prediction.classification_scoring.BinaryClassificationModelScorer.score
                    scorer = _dku_make_scorer_proba_binary(custom_scorefunc, target_map, greater_is_better=greater_is_better)
                else:
                    scorer = make_scorer_func(custom_scorefunc, greater_is_better=greater_is_better,
                                              needs_proba=needs_proba)

                return scorer(estimator, Y, y, sample_weight=sample_weight)

            scorer_map["CUSTOM"] = expose_indices_wrapper


    scorers_per_task = {
        'BINARY_CLASSIFICATION': list(BINARY_METRICS_NAME_TO_FIELD_NAME.keys()),
        'MULTICLASS': list(MULTICLASS_METRICS_NAME_TO_FIELD_NAME.keys()),
        'REGRESSION': list(REGRESSION_METRICS_NAME_TO_FIELD_NAME)
    }

    return {k: v for k, v in scorer_map.items() if k in  scorers_per_task[prediction_type] }


def _dku_make_scorer_proba_binary(score_func, target_map, greater_is_better=True, **kwargs):
    """
    Makes scoring function for search in the case of binary classification when needs_proba == True
    This replaces sklearn default implementation where only one column of y_pred is taken into account,
    which produces a failure when the scoring function `score_func` considers that y_pred has
    dimension (N, 2) as returned by `predict_proba`
    :param score_func: function that returns the score as a function of (y, y_pred, sample_weight, **kwargs)
    :param greater_is_better: True if higher score means better model
    :param kwargs: Optional keyword arguments
    :return: the scoring function with arguments (clf, X, y, sample_weight)
    """
    sign = 1 if greater_is_better else -1

    def score(clf, X, y, sample_weight=None):
        y_pred = clf.predict_proba(X)
        assert y_pred.shape[1] == 2, "Ended up with less than two-classes. y_pred.shape: {}".format(y_pred.shape)
        columns_order = [None for _ in range(len(clf.classes_))]  # Initialize array
        for source_value, mapped_value in target_map.items():
            column_idx = list(clf.classes_).index(mapped_value)
            columns_order[column_idx] = safe_unicode_str(source_value)
        logger.info("Computing custom metric, order of y_pred columns is the following: %s", columns_order)
        if sample_weight is not None:
            return sign * score_func(y, y_pred, sample_weight=sample_weight, **kwargs)
        return sign * score_func(y, y_pred, **kwargs)

    score._sign = sign
    return score


def _dku_make_scorer_proba(score_func, prediction_type, target_map, make_scorer_func, greater_is_better=True,
                           remap=True, **kwargs):
    if not remap:
        return make_scorer_func(score_func, needs_proba=True, greater_is_better=greater_is_better, **kwargs)

    else:
        # When scoring with probas for a classification problem, it is possible that not all classes
        # are found in the training dataset. Thus the prediction may not contain probas for all classes (the missing
        # ones are 0). Therefore, we must remap the predictions to have the appropriate dimension, prior to scoring.
        sign = 1 if greater_is_better else -1

        def score_with_remap(clf, X, y, sample_weight=None):

            y_pred_raw = clf.predict_proba(X)

            # Remapping predictions with actual classes
            (nb_rows, nb_present_classes) = y_pred_raw.shape
            y_pred = np.zeros((nb_rows, len(target_map)))
            for j in range(nb_present_classes):
                actual_class_id = clf.classes_[j]
                y_pred[:, actual_class_id] = y_pred_raw[:, j]

            if sample_weight is not None:
                return sign * score_func(y, y_pred, sample_weight=sample_weight, **kwargs)

            return sign * score_func(y, y_pred, **kwargs)

        score_with_remap._sign = sign
        return score_with_remap


def weighted_quantile(values, weights, target_rate, cumsum_weights=None):
    # NB: Expects values to be a numpy array sorted in increasing order
    # kwarg cumsum_weight is meant to avoid multiple computation of the same cumulative sum
    if len(values) == 0:
        return np.nan
    if cumsum_weights is None:
        cumsum_weights = np.cumsum(weights)
    sum_weights = cumsum_weights[-1]
    target = target_rate * sum_weights
    i = np.searchsorted(cumsum_weights, target)
    try:
        res = values[-1] if i == len(values) else values[i]
    except:
        res = np.nan
    return res


def weighted_quantiles(values, weights, quantiles):
    if len(values) == 0:
        return np.array(np.nan, quantiles.shape)
    cumsum_weights = np.cumsum(weights)
    targets = quantiles * cumsum_weights[-1]
    indices = np.searchsorted(cumsum_weights, targets)
    indices[indices == len(values)] = len(values) - 1
    return values[indices]


def make_lift_score(metrics_params):
    def score(y_true, probas, sample_weight=None):
        if sample_weight is not None:
            df = pd.DataFrame({"actual" : y_true, "proba" : probas[:,1], "sample_weight": sample_weight})
            df.sort_values(by=["proba"], ascending=False, inplace=True)
            # count -> sum of weights
            global_true_weight_sum = np.dot((df["actual"] == 1).values, df["sample_weight"].values).sum()
            cumsum_weights = np.cumsum(df["sample_weight"].values)
            sum_weights = cumsum_weights[-1]
            logger.info("Total true rate (weighted) = %s / %s" % (global_true_weight_sum, sum_weights))
            global_true_rate = float(global_true_weight_sum) / float(sum_weights)

            part_sum_weights_target = metrics_params["liftPoint"] * sum_weights
            nb_rows_to_consider = np.searchsorted(cumsum_weights, part_sum_weights_target)
            logger.info("Computing lift on first %s lines (%s cumulated weight)" % (nb_rows_to_consider, part_sum_weights_target))

            df_considered = df.iloc[:nb_rows_to_consider]
            considered_true = np.dot((df_considered["actual"] == 1).values, df_considered["sample_weight"].values)
            logger.info("True rate on considered : %s / %s" % (part_sum_weights_target, considered_true))
            considered_true_rate = float(considered_true) / float(part_sum_weights_target)
        else:
            df = pd.DataFrame({"actual" : y_true, "proba" : probas[:,1]})
            df.sort_values(by=["proba"], ascending=False, inplace=True)

            global_true_cnt = (df["actual"] == 1).sum()
            logger.info("Total true rate = %s / %s" % (global_true_cnt, df.shape[0]))
            global_true_rate = float(global_true_cnt) / float(df.shape[0])

            # putting at least one row to consider to prevent from failing
            nb_rows_to_consider = max(int(metrics_params["liftPoint"] * float(df.shape[0])), 1)
            logger.info("Computing lift on first %s rows" % nb_rows_to_consider)

            df_considered = df.iloc[:nb_rows_to_consider]
            considered_true = (df_considered["actual"] == 1).sum()
            logger.info("True rate on considered : %s / %s" % (df_considered.shape[0], considered_true))
            considered_true_rate = float(considered_true) / float(df_considered.shape[0])

        lift = considered_true_rate / global_true_rate
        logger.info("Lift = %f" % lift)
        return lift
    return score


def make_cost_matrix_score(metrics_params):
    def score(y_true, y_pred, sample_weight=None):
        conf = confusion_matrix(y_true, y_pred, sample_weight=sample_weight)
        pcd = {}
        pcd["tp"] = conf[1,1]
        pcd["tn"] = conf[0,0]
        pcd["fp"] = conf[0,1]
        pcd["fn"] = conf[1,0]
        return \
            pcd["tp"] * metrics_params["costMatrixWeights"]["tpGain"] +\
            pcd["tn"] * metrics_params["costMatrixWeights"]["tnGain"] +\
            pcd["fp"] * metrics_params["costMatrixWeights"]["fpGain"] +\
            pcd["fn"] * metrics_params["costMatrixWeights"]["fnGain"]
    return score


def get_threshold_optim_function(metric_params):
    """Returns a function that takes (y_true, y_pred) and a 'greater_is_better'"""
    data = {
        "ACCURACY" : (accuracy_score, True),
        "PRECISION" : (precision_score, True),
        "F1" : (f1_score, True),
        "COST_MATRIX" : (make_cost_matrix_score(metric_params), True),
    }
    return data[metric_params["thresholdOptimizationMetric"]]


def save_prediction_model(clf, actual_params, listener, folder):
    import dataiku.doctor.constants as constants
    from dataiku.core import dkujson
    from dataiku.doctor.utils import dku_pickle
    import os.path as osp

    with listener.push_step(constants.ProcessingStep.STEP_SAVING):
        # UGLY
        if hasattr(clf, "scorer"):
            clf.scorer = None
            if "scorer" in clf.params:
                del clf.params["scorer"]
        with open(osp.join(folder, "clf.pkl"), dku_write_mode_for_pickling()) as f:
            dku_pickle.dump(clf, f)
        dkujson.dump_to_filepath(osp.join(folder, "actual_params.json"), actual_params)


def get_selection_mode(max_features):
    if isinstance(max_features, int):
        return "number"
    elif isinstance(max_features, float):
        return "prop"
    else:
        return max_features


def simple_numeric_explicit_dimension(value):
    return NumericalHyperparameterDimension({
        "values": [value],
        "gridMode": "EXPLICIT",
        "randomMode": "EXPLICIT",
        "range": {
            "scaling": "LINEAR"
        }
    })


def simple_categorical_dimension(value):
    return CategoricalHyperparameterDimension({
        "values": {value: {"enabled": True}}
    })


def get_max_features_dimension(ingrid):
    result = None
    if ingrid['selection_mode'] in ["auto", "sqrt", "log2"]:
        result = simple_categorical_dimension(ingrid['selection_mode'])
    elif ingrid['selection_mode'] == "number":
        result = IntegerHyperparameterDimension(ingrid['max_features'])
    elif ingrid['selection_mode'] == "prop":
        result = FloatHyperparameterDimension(ingrid['max_feature_prop'])
    return result


def safe_positive_int(x):
    return x if isinstance(x, int) and x > 0 else -1


def replace_value_by_empty(element, value=0):
    if isinstance(element, dict):
        for k in element.keys():
            element[k] = None if element[k] == value else element[k]
        return element
    elif isinstance(element, list):
        return [ None if x == value else x for x in element ]
    else:
        return None if element == value else element


def safe_del(dic, key):
    if key in dic:
        del dic[key]


def pivot_property_to_list(o, proplist):
    res = []
    for prop in proplist:
        if o.get(prop) is True:
            res.append(prop)
    return res


def create_categorical_dimension(l):
    return CategoricalHyperparameterDimension({
        "values": {key: {"enabled": True} for key in l}
    })


def _identity(value=None,col=None):
    return value


def get_input_hypeparameter_space(modeling_params, algorithm):
    """Returns the grid object from the pre-train modeling params for a given algorithm"""

    GRID_NAMES = {
        'RANDOM_FOREST_REGRESSION': 'rf_regressor_grid',
        'RANDOM_FOREST_CLASSIFICATION' : 'rf_classifier_grid',
        'EXTRA_TREES': 'extra_trees_grid',
        'GBT_CLASSIFICATION': 'gbt_classifier_grid',
        'GBT_REGRESSION': 'gbt_regressor_grid',
        'DECISION_TREE_CLASSIFICATION': 'dtc_classifier_grid',
        'DECISION_TREE_REGRESSION': 'dtc_classifier_grid',
        'LOGISTIC_REGRESSION': 'logit_grid',
        'SVM_REGRESSION': 'svr_grid',
        'SVC_CLASSIFICATION': 'svc_grid',
        'SGD_REGRESSION': 'sgd_reg_grid',
        'SGD_CLASSIFICATION': 'sgd_grid',
        'RIDGE_REGRESSION': 'ridge_grid',
        'LASSO_REGRESSION': 'lasso_grid',
        'KNN': 'knn_grid',
        'XGBOOST_CLASSIFICATION': 'xgboost_grid',
        'XGBOOST_REGRESSION': 'xgboost_grid',
        'LEASTSQUARE_REGRESSION': 'least_squares_grid',
        'NEURAL_NETWORK': 'neural_network_grid',
        'LARS' : "lars_grid",
        'CUSTOM_PLUGIN' : "plugin_python_grid"
    }

    if algorithm == 'SCIKIT_MODEL':
        return {}
    if algorithm not in GRID_NAMES:
        raise Exception("Algorithm not available in Python: %s" % algorithm)

    grid_name = GRID_NAMES[algorithm]
    if grid_name in modeling_params:
        return modeling_params.get(grid_name)
    else:
        raise Exception("Unexpected: no grid for %s" % algorithm)
