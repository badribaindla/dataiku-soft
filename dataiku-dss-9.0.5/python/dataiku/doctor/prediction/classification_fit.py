import logging
import traceback
import numpy as np
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier

from sklearn.ensemble import GradientBoostingClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression, SGDClassifier
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.calibration import CalibratedClassifierCV

from dataiku.doctor.plugins.common_algorithm import PluginPredictionAlgorithm
from dataiku.doctor.prediction.common import IntegerHyperparameterDimension
from dataiku.doctor.prediction.common import get_svm_gamma_params_from_clf_params
from dataiku.doctor.prediction.common import FloatHyperparameterDimension
from dataiku.doctor.prediction.common import CategoricalHyperparameterDimension
from dataiku.doctor.prediction.common import TrainableModel
from dataiku.doctor.prediction.common import GridHyperparametersSpace
from dataiku.doctor.prediction.common import HyperparametersSpace
from dataiku.doctor.prediction.common import SVMHyperparametersSpace
from dataiku.doctor.prediction.common import TreesHyperparametersSpace
from dataiku.doctor.prediction.ensembles import EnsembleRegressor
from dataiku.doctor.prediction.common import get_max_features_dimension, replace_value_by_empty,\
    safe_positive_int, safe_del, PredictionAlgorithm, scikit_model, get_selection_mode, \
    get_initial_intrinsic_perf_data, dump_pretrain_info, prepare_multiframe
from dataiku.doctor.prediction.lars import DkuLassoLarsClassifier

logger = logging.getLogger(__name__)

def get_class_weight_dict(train_y):
    # Compute class weight to enforce consistency across splits
    unique_values = np.unique(train_y)
    n_classes = unique_values.size
    class_weight_dict = {
        y: float(len(train_y)) / (n_classes * np.sum(train_y == y))
        for y in unique_values
    }
    return class_weight_dict

CLASSIFICATION_ALGORITHMS = {}


def register_classification_algorithm(algorithm):
    CLASSIFICATION_ALGORITHMS[algorithm.algorithm] = algorithm()


##############################################################
# IMPORTANT
#    If you add any settings here, you MUST add them to
#    classification.tmpl / regression.tmpl for the notebook export
##############################################################

class ScikitClassification(PredictionAlgorithm):
    algorithm = "SCIKIT_MODEL"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        base_clf = scikit_model(modeling_params)
        return TrainableModel(base_clf, hyperparemeters_space=GridHyperparametersSpace())

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        return amp


register_classification_algorithm(ScikitClassification)

class RFClassification(PredictionAlgorithm):
    algorithm = "RANDOM_FOREST_CLASSIFICATION"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_def = {
                    "max_features": get_max_features_dimension(in_hyperparams_space),
                    "min_samples_leaf": IntegerHyperparameterDimension(in_hyperparams_space["min_samples_leaf"]),
                    "max_depth": IntegerHyperparameterDimension(in_hyperparams_space["max_tree_depth"]),
                    "n_estimators": IntegerHyperparameterDimension(in_hyperparams_space["n_estimators"])
                }
        hyperparams_space = TreesHyperparametersSpace(hyperparams_def)
        base_clf = RandomForestClassifier(random_state=1337, n_jobs=in_hyperparams_space["n_jobs"])
        return TrainableModel(base_clf, hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "rf_classifier_grid")
        params = clf.get_params()
        logger.info("Obtained RF CLF params: %s " % params)

        ret["rf"] = {
            "estimators": len(clf.estimators_),
            "max_tree_depth" : params["max_depth"],
            "min_samples_leaf": params["min_samples_leaf"],
            "selection_mode": get_selection_mode(params["max_features"]),
        }

        if ret["rf"]["selection_mode"] == "number":
            ret["rf"]["max_features"] = params["max_features"]
        if ret["rf"]["selection_mode"] == "prop":
            ret["rf"]["max_feature_prop"] = params["max_features"]

        amp["other"]["rf_min_samples_split"] = params["min_samples_split"]

        return amp


register_classification_algorithm(RFClassification)


class ExtraTreesClassification(PredictionAlgorithm):
    algorithm = "EXTRA_TREES"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_def = {
                    "max_features": get_max_features_dimension(in_hyperparams_space),
                    "min_samples_leaf": IntegerHyperparameterDimension(in_hyperparams_space["min_samples_leaf"]),
                    "max_depth": IntegerHyperparameterDimension(replace_value_by_empty(in_hyperparams_space["max_tree_depth"], value=0)),
                    "n_estimators": IntegerHyperparameterDimension(in_hyperparams_space["n_estimators"])
                }

        hyperparams_space = TreesHyperparametersSpace(hyperparams_def)
        base_clf = ExtraTreesClassifier(random_state=1337, n_jobs=in_hyperparams_space["n_jobs"])

        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "extra_trees_grid")
        params = clf.get_params()
        logger.info("Obtained ET CLF params: %s " % params)

        ret["extra_trees"] = {
            "estimators": len(clf.estimators_),
            "njobs" : params["n_jobs"] if params["n_jobs"] > 0 else -1,
            "max_tree_depth" : params["max_depth"],
            "min_samples_leaf": params["min_samples_leaf"],
            "selection_mode": get_selection_mode(params["max_features"]),
        }
        if ret["extra_trees"]["selection_mode"] == "number":
            ret["extra_trees"]["max_features"] = params["max_features"]
        if ret["extra_trees"]["selection_mode"] == "prop":
            ret["extra_trees"]["max_feature_prop"] = params["max_features"]

        amp["other"]["rf_min_samples_split"] = params["min_samples_split"]
        return amp


register_classification_algorithm(ExtraTreesClassification)


class GBTClassification(PredictionAlgorithm):
    algorithm = "GBT_CLASSIFICATION"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_def = {
            "max_features": get_max_features_dimension(in_hyperparams_space),
            "min_samples_leaf": IntegerHyperparameterDimension(in_hyperparams_space["min_samples_leaf"]),
            "n_estimators": IntegerHyperparameterDimension(in_hyperparams_space["n_estimators"]),
            "learning_rate": FloatHyperparameterDimension(in_hyperparams_space["learning_rate"]),
            "loss": CategoricalHyperparameterDimension(in_hyperparams_space["loss"]),
            "max_depth": IntegerHyperparameterDimension(in_hyperparams_space["max_depth"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = GradientBoostingClassifier(random_state=1337, verbose=1)
        return TrainableModel(base_clf, hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "gbt_classifier_grid")
        params = clf.get_params()
        logger.info("GBT Params are %s " % params)

        ret["gbt"] = {
            "n_estimators": len(clf.estimators_),
            "max_depth": params["max_depth"],
            "learning_rate" : params["learning_rate"],
            "min_samples_leaf": params["min_samples_leaf"],
            "selection_mode": get_selection_mode(params["max_features"]),
            "loss" : params["loss"]
        }
        if ret["gbt"]["selection_mode"] == "number":
            ret["gbt"]["max_features"] = params["max_features"]
        if ret["gbt"]["selection_mode"] == "prop":
            ret["gbt"]["max_feature_prop"] = params["max_features"]

        return amp


register_classification_algorithm(GBTClassification)


class DecisionTreeClassification(PredictionAlgorithm):
    algorithm = "DECISION_TREE_CLASSIFICATION"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_def = {
            "max_depth": IntegerHyperparameterDimension(in_hyperparams_space["max_depth"]),
            "min_samples_leaf": IntegerHyperparameterDimension(in_hyperparams_space["min_samples_leaf"]),
            "criterion": CategoricalHyperparameterDimension(in_hyperparams_space["criterion"]),
            "splitter": CategoricalHyperparameterDimension(in_hyperparams_space["splitter"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = DecisionTreeClassifier(random_state=1337)

        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "dtc_classifier_grid")
        params = clf.get_params()
        logger.info("DT params are %s " % params)

        ret["dt"] = {
            "max_depth" : params["max_depth"],
            "criterion" : params["criterion"],
            "min_samples_leaf" : params["min_samples_leaf"],
            "splitter" : params["splitter"]
        }
        return amp


register_classification_algorithm(DecisionTreeClassification)


class LogisticRegClassification(PredictionAlgorithm):
    algorithm = "LOGISTIC_REGRESSION"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_def = {
            "C": FloatHyperparameterDimension(in_hyperparams_space["C"]),
            "penalty": CategoricalHyperparameterDimension(in_hyperparams_space["penalty"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        #   In the multinomial case only saga solver can be used with L1 regularization.
        #   It seems however to be slower than lbfgs, that will hence be preferred when L1 regularization is not used.
        if in_hyperparams_space["multi_class"] == "multinomial":
            l1_enabled = "l1" in hyperparams_def["penalty"]._get_enabled_values_list()
            solver = "saga" if l1_enabled else "lbfgs"
        else:
            solver = "liblinear"
        base_clf = LogisticRegression(multi_class=in_hyperparams_space["multi_class"],
                                      solver=solver,
                                      random_state=1337)

        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "logit_grid")
        params = clf.get_params()
        logger.info("LR Params are %s " % params)
        ret["logit"] = {
            "penalty":  params["penalty"],
            "multi_class":  params["multi_class"],
            "C": params["C"]
        }
        return amp


register_classification_algorithm(LogisticRegClassification)


class SVCClassification(PredictionAlgorithm):
    algorithm = "SVC_CLASSIFICATION"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        gamma_compatible_kernel_enabled = any(in_hyperparams_space["kernel"]["values"][kernel]["enabled"]
                                              for kernel in ["rbf", "sigmoid", "poly"])

        if not gamma_compatible_kernel_enabled:
            hyperparams_def = {
                "C": FloatHyperparameterDimension(in_hyperparams_space["C"]),
                "kernel": CategoricalHyperparameterDimension(in_hyperparams_space["kernel"])
            }
            hyperparams_space = HyperparametersSpace(hyperparams_def)
        else:
            hyperparams_def = {
                "C": FloatHyperparameterDimension(in_hyperparams_space["C"]),
                "gamma": CategoricalHyperparameterDimension(in_hyperparams_space["gamma"]),
                "custom_gamma": FloatHyperparameterDimension(in_hyperparams_space["custom_gamma"]),
                "kernel": CategoricalHyperparameterDimension(in_hyperparams_space["kernel"])
            }
            hyperparams_space = SVMHyperparametersSpace(hyperparams_def)

        base_clf = SVC(coef0=in_hyperparams_space['coef0'], tol=in_hyperparams_space['tol'], probability=True,
                       max_iter=in_hyperparams_space['max_iter'])
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        params = clf.get_params()
        logger.info("Selected SVC Params are %s " % params)
        safe_del(ret, "svc_grid")

        ret["svm"] = {
            "C": params["C"],
            "kernel": params["kernel"],
            "tol": params["tol"],
            "max_iter": params["max_iter"],
            "coef0": params["coef0"]
        }
        ret["svm"].update(get_svm_gamma_params_from_clf_params(params))

        return amp


register_classification_algorithm(SVCClassification)


class SGDClassification(PredictionAlgorithm):
    algorithm = "SGD_CLASSIFICATION"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_def = {
            "alpha": FloatHyperparameterDimension(in_hyperparams_space['alpha']),
            "loss": CategoricalHyperparameterDimension(in_hyperparams_space["loss"]),
            "penalty": CategoricalHyperparameterDimension(in_hyperparams_space["penalty"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = SGDClassifier(l1_ratio=in_hyperparams_space["l1_ratio"], shuffle=True, max_iter=in_hyperparams_space["max_iter"],
                                 tol=in_hyperparams_space["tol"], n_jobs=in_hyperparams_space["n_jobs"], random_state=1337)

        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        params = clf.get_params()
        logger.info("Selected SGD Params are %s " % params)
        safe_del(ret, "sgd_grid")
        ret["sgd"] = {
            "loss": params["loss"],
            "penalty": params["penalty"],
            "alpha": params["alpha"],
            "l1_ratio": params["l1_ratio"],
            "n_jobs": params["n_jobs"],
            "n_iter": clf.n_iter_
        }
        return amp


register_classification_algorithm(SGDClassification)


class KNNClassification(PredictionAlgorithm):
    algorithm = "KNN"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_def = {
            "n_neighbors": IntegerHyperparameterDimension(in_hyperparams_space["k"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = KNeighborsClassifier(weights="distance" if in_hyperparams_space["distance_weighting"] else "uniform",
                                        algorithm=in_hyperparams_space["algorithm"],
                                        leaf_size=in_hyperparams_space["leaf_size"],
                                        p=in_hyperparams_space["p"])

        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space, support_sample_weights=False)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        params = clf.get_params()
        logger.info("Selected KNN Params are %s " % params)
        safe_del(ret, "knn_grid")
        ret["knn"] = {
            "k" :  params["n_neighbors"],
            "distance_weighting":  params["weights"] == "distance",
            "algorithm": params["algorithm"],
            "p": params["p"],
            "leaf_size": params["leaf_size"],
        }
        return amp

register_classification_algorithm(KNNClassification)


class LARSClassification(PredictionAlgorithm):
    algorithm = "LARS"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_space = HyperparametersSpace({})
        base_clf = DkuLassoLarsClassifier(modeling_params["lars_grid"]["max_features"], modeling_params["lars_grid"]["K"])

        # LARS Grid is not a real grid
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space, support_sample_weights=False)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        return amp


register_classification_algorithm(LARSClassification)


class NeuralNetworkClassification(PredictionAlgorithm):
    algorithm = "NEURAL_NETWORK"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        hyperparams_def = {
            'hidden_layer_sizes': IntegerHyperparameterDimension(in_hyperparams_space["layer_sizes"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = MLPClassifier(activation=in_hyperparams_space["activation"],
                                 solver=in_hyperparams_space["solver"],
                                 alpha=in_hyperparams_space["alpha"],
                                 batch_size="auto" if in_hyperparams_space["auto_batch"] else in_hyperparams_space["batch_size"],
                                 max_iter=in_hyperparams_space["max_iter"],
                                 random_state=in_hyperparams_space["seed"],
                                 tol=in_hyperparams_space["tol"],
                                 early_stopping=in_hyperparams_space["early_stopping"],
                                 validation_fraction=in_hyperparams_space["validation_fraction"],
                                 beta_1=in_hyperparams_space["beta_1"],
                                 beta_2=in_hyperparams_space["beta_2"],
                                 epsilon=in_hyperparams_space["epsilon"],
                                 learning_rate=in_hyperparams_space["learning_rate"],
                                 power_t=in_hyperparams_space["power_t"],
                                 momentum=in_hyperparams_space["momentum"],
                                 nesterovs_momentum=in_hyperparams_space["nesterovs_momentum"],
                                 shuffle=in_hyperparams_space["shuffle"],
                                 learning_rate_init=in_hyperparams_space["learning_rate_init"])

        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space, support_sample_weights=False)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        # Nothing grid-searched
        return amp


register_classification_algorithm(NeuralNetworkClassification)


class XGBClassification(PredictionAlgorithm):
    algorithm = "XGBOOST_CLASSIFICATION"

    def model_from_params(self, in_hyperparams_space, modeling_params, prediction_type):
        try:
            from dataiku.doctor.prediction.dku_xgboost import DkuXGBClassifier, get_xgboost_scorer
        except:
            logger.error("Failed to load xgboost package")
            traceback.print_exc()
            raise Exception("Failed to load XGBoost package")

        n_estimators = in_hyperparams_space['n_estimators']
        if n_estimators <= 0:  # xgboost does not fail gracefully then
            raise Exception("The number of estimators must be a positive number")

        nthread = safe_positive_int(in_hyperparams_space['nthread'])
        missing = in_hyperparams_space['missing'] if in_hyperparams_space['impute_missing'] else None

        if in_hyperparams_space['enable_early_stopping']:
            logger.info("Early stopping enabled")
            early_stopping_rounds = in_hyperparams_space['early_stopping_rounds']
            if early_stopping_rounds <= 0:  # xgboost does not fail gracefully then
                raise Exception("Early stopping rounds must be a positive number")
            fit_params = {
                'eval_metric': get_xgboost_scorer(modeling_params["metrics"]["evaluationMetric"], prediction_type),
                'early_stopping_rounds': in_hyperparams_space['early_stopping_rounds'],
                "eval_set": None,  # can be set now to have a fixed eval set
            }
        else:
            logger.info("Early stopping disabled")
            fit_params = {}

        hyperparams_def = {
            "max_depth": IntegerHyperparameterDimension(in_hyperparams_space['max_depth']),
            "learning_rate": FloatHyperparameterDimension(in_hyperparams_space['learning_rate']),
            "gamma": FloatHyperparameterDimension(in_hyperparams_space['gamma']),
            "min_child_weight": FloatHyperparameterDimension(in_hyperparams_space['min_child_weight']),
            "max_delta_step": FloatHyperparameterDimension(in_hyperparams_space['max_delta_step']),
            "subsample": FloatHyperparameterDimension(in_hyperparams_space['subsample']),
            "colsample_bytree": FloatHyperparameterDimension(in_hyperparams_space['colsample_bytree']),
            "colsample_bylevel": FloatHyperparameterDimension(in_hyperparams_space['colsample_bylevel']),
            "reg_alpha": FloatHyperparameterDimension(in_hyperparams_space['alpha']),
            "reg_lambda": FloatHyperparameterDimension(in_hyperparams_space['lambda']),
            "booster": CategoricalHyperparameterDimension(in_hyperparams_space["booster"])
            # no grid for "objective" in classification
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        tree_method = in_hyperparams_space['gpu_tree_method'] if in_hyperparams_space["enable_cuda"] else in_hyperparams_space['cpu_tree_method']
        base_clf = DkuXGBClassifier(
            n_estimators=n_estimators,
            silent=0,
            n_jobs=nthread,
            scale_pos_weight=in_hyperparams_space['scale_pos_weight'],
            base_score=in_hyperparams_space['base_score'],
            random_state=in_hyperparams_space['seed'],
            missing=missing,
            tree_method=tree_method,
            class_weight=None
        )
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space, fit_params=fit_params)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        params = clf.get_params()
        logger.info("Selected XGBoost Params are %s " % params)
        safe_del(ret, "xgboost")
        ret["xgboost"] = {}
        ret["xgboost"]["max_depth"] = params["max_depth"]
        ret["xgboost"]["learning_rate"] = params["learning_rate"]
        ret["xgboost"]["n_estimators"] = params["n_estimators"]
        ret["xgboost"]["nthread"] = params["n_jobs"] if params["n_jobs"] > 0 else -1 # TODO: change => migration ?
        ret["xgboost"]["gamma"] = params["gamma"]
        ret["xgboost"]["min_child_weight"] = params["min_child_weight"]
        ret["xgboost"]["max_delta_step"] = params["max_delta_step"]
        ret["xgboost"]["subsample"] = params["subsample"]
        ret["xgboost"]["colsample_bytree"] = params["colsample_bytree"]
        ret["xgboost"]["colsample_bylevel"] = params["colsample_bylevel"]
        ret["xgboost"]["alpha"] = params["reg_alpha"]
        ret["xgboost"]["lambda"] = params["reg_lambda"]
        ret["xgboost"]["seed"] = params["random_state"] # TODO: change => migration ?
        ret["xgboost"]["impute_missing"] = True if params["missing"] else False
        ret["xgboost"]["missing"] = params["missing"]
        ret["xgboost"]["base_score"] = params["base_score"]
        ret["xgboost"]["scale_pos_weight"] = params["scale_pos_weight"]
        ret["xgboost"]["enable_early_stopping"] = fit_params.get('early_stopping_rounds') is not None
        ret["xgboost"]["early_stopping_rounds"] = fit_params.get('early_stopping_rounds')
        ret["xgboost"]["booster"] = params.get("booster")
        ret["xgboost"]["objective"] = params.get("objective").replace(":", "_")
        return amp


register_classification_algorithm(XGBClassification)

register_classification_algorithm(PluginPredictionAlgorithm)

def classification_fit_ensemble(modeling_params, core_params, split_desc, data, target, sample_weight=None):
    """
    Returns (clf, actual_params, prepared_train_X, initial_intrinsic_perf_data)
    Extracts the best estimator for grid search ones
    """

    logger.info("Fitting ensemble model")
    clf = EnsembleRegressor(modeling_params["ensemble_params"], core_params, split_desc)
    clf = clf.fit(data, target.astype(int), sample_weight=sample_weight)

    initial_intrinsic_perf_data = {}
    actual_params = {"resolved": modeling_params}

    return clf, actual_params, data, initial_intrinsic_perf_data


def classification_fit(modeling_params, split_desc, transformed_train, prediction_type, m_folder=None,
                       gridsearch_done_fn=None, target_map=None, with_sample_weight=False, with_class_weight=True, calibration=None):
    """
    Returns (clf, actual_params, prepared_train_X, initial_intrinsic_perf_data)
    Extracts the best estimator for grid search ones
    """
    train_X = transformed_train["TRAIN"]
    column_labels = [s for s in train_X.columns()]
    train_y = transformed_train["target"].astype(int)
    train_X, is_sparse = prepare_multiframe(train_X, modeling_params)

    algorithm = modeling_params['algorithm']
    if algorithm not in CLASSIFICATION_ALGORITHMS.keys():
        raise Exception("Algorithm not available in Python: %s" % algorithm)
    algorithm = CLASSIFICATION_ALGORITHMS[algorithm]

    hyperparameter_search_runner = algorithm.get_hyperparameter_search_runner(modeling_params=modeling_params, column_labels=column_labels,
                                                                              m_folder=m_folder, prediction_type=prediction_type,
                                                                              target_map=target_map, unprocessed=transformed_train["UNPROCESSED"])

    if with_sample_weight:
        train_w = transformed_train["weight"]
    else:
        train_w = None

    if with_class_weight:
        class_weight_dict = get_class_weight_dict(train_y)
    else:
        class_weight_dict = None

    # grid searcher figures out whether or not the algorithm supports sample weights
    clf = hyperparameter_search_runner.get_best_estimator(train_X, train_y, sample_weight=train_w, class_weight=class_weight_dict)

    if gridsearch_done_fn:
        gridsearch_done_fn()

    kwargs = hyperparameter_search_runner.fit_params or {}

    # save a copy of train_X as prepared_X for the final output of classification_fit
    prepared_X = train_X[::]

    with_calibration = calibration is not None and calibration.upper() in {"SIGMOID", "ISOTONIC"}
    if with_calibration:
        # for calibrated models, train_X will be a 80% split of the original train_X
        # (the remaining 20% is used to compute the calibration parameters)
        if with_sample_weight:
            train_X, calib_X, train_y, calib_y, train_w, calib_w = train_test_split(train_X, train_y, train_w, train_size=0.8, random_state=1234)
        else:
            train_X, calib_X, train_y, calib_y = train_test_split(train_X, train_y, train_size=0.8, random_state=1234)
            calib_w = None

    dump_pretrain_info(clf, train_X, train_y, train_w, calibration if with_calibration else None)

    # check for sample weights supports before fitting the final model
    if with_sample_weight and hyperparameter_search_runner.algo_supports_weight:
        kwargs["sample_weight"] = np.array(train_w)

    clf.fit(train_X, train_y, **kwargs)

    if with_calibration:
        calibrated_clf = CalibratedClassifierCV(clf, cv="prefit", method=calibration.lower())
        calibrated_clf.fit(calib_X, calib_y, sample_weight=calib_w)
        clf = calibrated_clf

    initial_intrinsic_perf_data = get_initial_intrinsic_perf_data(train_X, is_sparse)
    if not hyperparameter_search_runner.search_skipped():
        initial_intrinsic_perf_data.update(hyperparameter_search_runner.get_score_info())

    # get_actual_params performs the translation sklearn params (after refit) (e.g. n_estimators)
    # to DSS(raw) params (e.g rf_n_estimators)
    if with_calibration:
        actual_params = algorithm.get_actual_params(modeling_params, clf.base_estimator, hyperparameter_search_runner.fit_params)
    else:
        actual_params = algorithm.get_actual_params(modeling_params, clf, hyperparameter_search_runner.fit_params)
    logger.info("Output params are %s" % actual_params)

    return clf, actual_params, prepared_X, initial_intrinsic_perf_data
