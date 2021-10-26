import logging
import traceback
import numpy as np
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neural_network import MLPRegressor

from dataiku.doctor.plugins.common_algorithm import PluginPredictionAlgorithm
from dataiku.doctor.prediction.lars import DkuLassoLarsRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, ExtraTreesRegressor
from sklearn.tree import DecisionTreeRegressor
from sklearn.linear_model import *
from sklearn.svm import SVR


from dataiku.doctor.prediction.common import SGDRegressionHyperparametersSpace
from dataiku.doctor.prediction.common import SVMHyperparametersSpace
from dataiku.doctor.prediction.common import get_svm_gamma_params_from_clf_params
from dataiku.doctor.prediction.common import IntegerHyperparameterDimension
from dataiku.doctor.prediction.common import FloatHyperparameterDimension
from dataiku.doctor.prediction.common import CategoricalHyperparameterDimension
from dataiku.doctor.prediction.ensembles import EnsembleRegressor
from dataiku.doctor.preprocessing.dataframe_preprocessing import DropNARows
from dataiku.doctor.prediction.common import get_max_features_dimension, replace_value_by_empty, \
    safe_positive_int, safe_del, PredictionAlgorithm, get_selection_mode, scikit_model, \
    get_initial_intrinsic_perf_data, dump_pretrain_info, prepare_multiframe, create_categorical_dimension
from dataiku.doctor.prediction.common import TrainableModel
from dataiku.doctor.prediction.common import GridHyperparametersSpace
from dataiku.doctor.prediction.common import HyperparametersSpace
from dataiku.doctor.prediction.common import TreesHyperparametersSpace

REGRESSION_ALGORITHMS = {}

logger = logging.getLogger(__name__)

def register_regression_algorithm(algorithm):
    REGRESSION_ALGORITHMS[algorithm.algorithm] = algorithm()


##############################################################
# IMPORTANT
#    If you add any settings here, you MUST add them to
#    classification.tmpl / regression.tmpl for the notebook export
##############################################################


class ScikitRegression(PredictionAlgorithm):
    algorithm = "SCIKIT_MODEL"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        base_clf = scikit_model(modeling_params)
        return TrainableModel(base_clf, hyperparemeters_space=GridHyperparametersSpace())

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        return amp


register_regression_algorithm(ScikitRegression)


class DecisionTreeRegression(PredictionAlgorithm):
    algorithm = "DECISION_TREE_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_def = {
            "max_depth": IntegerHyperparameterDimension(in_hyperparam_space["max_depth"]),
            "min_samples_leaf": IntegerHyperparameterDimension(in_hyperparam_space["min_samples_leaf"]),
            "splitter": CategoricalHyperparameterDimension(in_hyperparam_space["splitter"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = DecisionTreeRegressor(random_state=1337)
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


register_regression_algorithm(DecisionTreeRegression)


class RFRegression(PredictionAlgorithm):
    algorithm = "RANDOM_FOREST_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_def = {
                        "max_features": get_max_features_dimension(in_hyperparam_space),
                        "min_samples_leaf": IntegerHyperparameterDimension(in_hyperparam_space["min_samples_leaf"]),
                        "max_depth": IntegerHyperparameterDimension(replace_value_by_empty(in_hyperparam_space["max_tree_depth"], value=0)),  # TODO
                        "n_estimators": IntegerHyperparameterDimension(in_hyperparam_space["n_estimators"])
                    }
        hyperparams_space = TreesHyperparametersSpace(hyperparams_def)
        base_clf = RandomForestRegressor(random_state=1337, n_jobs=in_hyperparam_space["n_jobs"], verbose=2)
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "rf_regressor_grid")
        params = clf.get_params()
        logger.info("RF Params are %s " % params)

        ret["rf"] = {
            "estimators": len(clf.estimators_),
            "njobs" : params["n_jobs"] if params["n_jobs"] > 0 else -1,
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


register_regression_algorithm(RFRegression)


class ExtraTreesRegression(PredictionAlgorithm):
    algorithm = "EXTRA_TREES"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_def = {
                    "max_features": get_max_features_dimension(in_hyperparam_space),
                    "min_samples_leaf": IntegerHyperparameterDimension(in_hyperparam_space["min_samples_leaf"]),
                    "max_depth": IntegerHyperparameterDimension(replace_value_by_empty(in_hyperparam_space["max_tree_depth"], value=0)),  # TODO
                    "n_estimators": IntegerHyperparameterDimension(in_hyperparam_space["n_estimators"]),
                }
        hyperparams_space = TreesHyperparametersSpace(hyperparams_def)
        base_clf = ExtraTreesRegressor(random_state=1337, n_jobs=in_hyperparam_space["n_jobs"], verbose=2)
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "extra_trees_grid")
        params = clf.get_params()
        logger.info("Extra trees Params are %s " % params)
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


register_regression_algorithm(ExtraTreesRegression)


class GBTRegression(PredictionAlgorithm):
    algorithm = "GBT_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_def = {
            "max_features": get_max_features_dimension(in_hyperparam_space),
            "min_samples_leaf": IntegerHyperparameterDimension(in_hyperparam_space["min_samples_leaf"]),
            "n_estimators": IntegerHyperparameterDimension(in_hyperparam_space["n_estimators"]),
            "learning_rate": FloatHyperparameterDimension(in_hyperparam_space["learning_rate"]),
            "loss": CategoricalHyperparameterDimension(in_hyperparam_space["loss"]),
            "max_depth": IntegerHyperparameterDimension(in_hyperparam_space["max_depth"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = GradientBoostingRegressor(random_state=1337, verbose=1)
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "gbt_regressor_grid")
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


register_regression_algorithm(GBTRegression)


class KNNRegression(PredictionAlgorithm):
    algorithm = "KNN"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_def = {
            "n_neighbors": IntegerHyperparameterDimension(in_hyperparam_space["k"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = KNeighborsRegressor(weights="distance" if in_hyperparam_space["distance_weighting"] else "uniform",
                                       algorithm=in_hyperparam_space["algorithm"],
                                       leaf_size=in_hyperparam_space["leaf_size"],
                                       p=in_hyperparam_space["p"])
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


register_regression_algorithm(KNNRegression)


class NeuralNetworkRegression(PredictionAlgorithm):
    algorithm = "NEURAL_NETWORK"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_def = {
            'hidden_layer_sizes': IntegerHyperparameterDimension(in_hyperparam_space["layer_sizes"])
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        base_clf = MLPRegressor(activation=in_hyperparam_space["activation"],
                                solver=in_hyperparam_space["solver"],
                                alpha=in_hyperparam_space["alpha"],
                                batch_size="auto" if in_hyperparam_space["auto_batch"] else in_hyperparam_space["batch_size"],
                                max_iter=in_hyperparam_space["max_iter"],
                                random_state=in_hyperparam_space["seed"],
                                tol=in_hyperparam_space["tol"],
                                early_stopping=in_hyperparam_space["early_stopping"],
                                validation_fraction=in_hyperparam_space["validation_fraction"],
                                beta_1=in_hyperparam_space["beta_1"],
                                beta_2=in_hyperparam_space["beta_2"],
                                epsilon=in_hyperparam_space["epsilon"],
                                learning_rate=in_hyperparam_space["learning_rate"],
                                power_t=in_hyperparam_space["power_t"],
                                momentum=in_hyperparam_space["momentum"],
                                nesterovs_momentum=in_hyperparam_space["nesterovs_momentum"],
                                shuffle=in_hyperparam_space["shuffle"],
                                learning_rate_init=in_hyperparam_space["learning_rate_init"])
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space, support_sample_weights=False)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        ret["neural_network"] = {}
        return amp


register_regression_algorithm(NeuralNetworkRegression)


class XGBoostRegression(PredictionAlgorithm):
    algorithm = "XGBOOST_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        try:
            from dataiku.doctor.prediction.dku_xgboost import DkuXGBRegressor, get_xgboost_scorer
        except:
            logger.error("Failed to load xgboost package")
            traceback.print_exc()
            raise Exception("Failed to load XGBoost package")

        n_estimators = in_hyperparam_space['n_estimators']
        if n_estimators <= 0:  # xgboost does not fail gracefully then
            raise Exception("The number of estimators must be a positive number")

        nthread = safe_positive_int(in_hyperparam_space['nthread'])
        missing = in_hyperparam_space['missing'] if in_hyperparam_space['impute_missing'] else None

        if in_hyperparam_space['enable_early_stopping']:
            logger.info("Early stopping enabled")
            early_stopping_rounds = in_hyperparam_space['early_stopping_rounds']
            if early_stopping_rounds <= 0:  # xgboost does not fail gracefully then
                raise Exception("Early stopping rounds must be a positive number")
            fit_params = {
                'eval_metric': get_xgboost_scorer(modeling_params["metrics"]["evaluationMetric"], None),
                'early_stopping_rounds': in_hyperparam_space['early_stopping_rounds'],
                "eval_set": None,  # can be set now to have a fixed eval set
            }
        else:
            logger.info("Early stopping disabled")
            fit_params = {}

        booster = CategoricalHyperparameterDimension(in_hyperparam_space["booster"])
        if len(booster._get_enabled_values_list()) == 0:
            booster = create_categorical_dimension(["gbtree"])
        objective = CategoricalHyperparameterDimension(in_hyperparam_space["objective"])
        enabled_val_list =  [val.replace("_", ":") for val in objective._get_enabled_values_list()]
        enabled_val_dict = create_categorical_dimension(enabled_val_list)._get_values()
        objective.set_values(enabled_val_dict)
        if len(objective._get_enabled_values_list()) == 0:
            objective = create_categorical_dimension(["reg:linear"])
        hyperparams_def = {
            "max_depth": IntegerHyperparameterDimension(in_hyperparam_space['max_depth']),
            "learning_rate": FloatHyperparameterDimension(in_hyperparam_space['learning_rate']),
            "gamma": FloatHyperparameterDimension(in_hyperparam_space['gamma']),
            "min_child_weight": FloatHyperparameterDimension(in_hyperparam_space['min_child_weight']),
            "max_delta_step": FloatHyperparameterDimension(in_hyperparam_space['max_delta_step']),
            "subsample": FloatHyperparameterDimension(in_hyperparam_space['subsample']),
            "colsample_bytree": FloatHyperparameterDimension(in_hyperparam_space['colsample_bytree']),
            "colsample_bylevel": FloatHyperparameterDimension(in_hyperparam_space['colsample_bylevel']),
            "reg_alpha": FloatHyperparameterDimension(in_hyperparam_space['alpha']),
            "reg_lambda": FloatHyperparameterDimension(in_hyperparam_space['lambda']),
            "booster": booster,
            "objective": objective
        }
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        tree_method = in_hyperparam_space['gpu_tree_method'] if in_hyperparam_space["enable_cuda"] else in_hyperparam_space['cpu_tree_method']
        base_clf = DkuXGBRegressor(
            n_estimators=n_estimators,
            silent=0,
            n_jobs=nthread,
            random_state=in_hyperparam_space['seed'],
            missing=missing,
            scale_pos_weight=in_hyperparam_space['scale_pos_weight'],
            base_score=in_hyperparam_space['base_score'],
            tree_method=tree_method
        )
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space, fit_params=fit_params)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        params = clf.get_params()
        logger.info("Selected XGBoost Params are %s " % params)
        safe_del(ret, "xgboost_grid")
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


register_regression_algorithm(XGBoostRegression)


class LARSRegression(PredictionAlgorithm):
    algorithm = "LARS"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_space = HyperparametersSpace({})
        base_clf = DkuLassoLarsRegressor(max_var=modeling_params["lars_grid"]["max_features"])

        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space, support_sample_weights=False)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        return amp


register_regression_algorithm(LARSRegression)


class SVMRegression(PredictionAlgorithm):
    algorithm = "SVM_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        gamma_compatible_kernel_enabled = any(in_hyperparam_space["kernel"]["values"][kernel]["enabled"]
                                              for kernel in ["rbf", "sigmoid", "poly"])

        if not gamma_compatible_kernel_enabled:
            hyperparams_def = {
                "C": FloatHyperparameterDimension(in_hyperparam_space["C"]),
                "kernel": CategoricalHyperparameterDimension(in_hyperparam_space["kernel"])
            }
            hyperparams_space = HyperparametersSpace(hyperparams_def)
        else:
            hyperparams_def = {
                "C": FloatHyperparameterDimension(in_hyperparam_space["C"]),
                "gamma": CategoricalHyperparameterDimension(in_hyperparam_space["gamma"]),
                "custom_gamma": FloatHyperparameterDimension(in_hyperparam_space["custom_gamma"]),
                "kernel": CategoricalHyperparameterDimension(in_hyperparam_space["kernel"])
            }
            hyperparams_space = SVMHyperparametersSpace(hyperparams_def)

        base_clf = SVR(coef0=in_hyperparam_space['coef0'], tol=in_hyperparam_space['tol'],
                       max_iter=in_hyperparam_space['max_iter'])

        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        params = clf.get_params()
        logger.info("Selected SVM Params are %s " % params)
        safe_del(ret, "svr_grid")

        ret["svm"] = {
            "C": params["C"],
            "kernel": params["kernel"],
            "tol": params["tol"],
            "max_iter": params["max_iter"],
            "coef0": params["coef0"]
        }
        ret["svm"].update(get_svm_gamma_params_from_clf_params(params))
        return amp


register_regression_algorithm(SVMRegression)


class SGDRegression(PredictionAlgorithm):
    algorithm = "SGD_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        #TODO: elastic-net elastic_net, elasticnet
        squared_loss_enabled = in_hyperparam_space["loss"]["values"]["squared_loss"]["enabled"]
        huber_loss_enabled = in_hyperparam_space["loss"]["values"]["huber"]["enabled"]

        if squared_loss_enabled and not huber_loss_enabled:
            hyperparams_def = {
                "alpha": FloatHyperparameterDimension(in_hyperparam_space['alpha']),
                "penalty": CategoricalHyperparameterDimension(in_hyperparam_space["penalty"]),
                "loss": create_categorical_dimension(["squared_loss"])
            }
            hyperparams_space = HyperparametersSpace(hyperparams_def)
        elif huber_loss_enabled and not squared_loss_enabled:
            hyperparams_def = {
                "alpha": FloatHyperparameterDimension(in_hyperparam_space['alpha']),
                "penalty": CategoricalHyperparameterDimension(in_hyperparam_space["penalty"]),
                "loss": create_categorical_dimension(["huber"]),
                "epsilon": FloatHyperparameterDimension(in_hyperparam_space['epsilon'])
            }
            hyperparams_space = HyperparametersSpace(hyperparams_def)
        elif huber_loss_enabled and squared_loss_enabled:
            hyperparams_def = {
                "alpha": FloatHyperparameterDimension(in_hyperparam_space['alpha']),
                "penalty": CategoricalHyperparameterDimension(in_hyperparam_space["penalty"]),
                "loss": CategoricalHyperparameterDimension(in_hyperparam_space["loss"]),
                "epsilon": FloatHyperparameterDimension(in_hyperparam_space['epsilon'])
            }
            hyperparams_space = SGDRegressionHyperparametersSpace(hyperparams_def)
        else:
            raise ValueError("Training failed, you must at least select one loss among 'huber' and 'squared_loss' for"
                             "Stochastic Gradient Descent regression")

        base_clf = SGDRegressor(l1_ratio=in_hyperparam_space["l1_ratio"], shuffle=True,
                                max_iter=in_hyperparam_space["max_iter"], tol=in_hyperparam_space["tol"], verbose=2,
                                random_state=1337)

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
            "epsilon": params["epsilon"],
            "n_iter": clf.n_iter_
        }
        return amp


register_regression_algorithm(SGDRegression)


class RidgeRegression(PredictionAlgorithm):
    algorithm = "RIDGE_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        if in_hyperparam_space.get("alphaMode", None) == "AUTO":
            hyperparams_def = {}
            base_clf = RidgeCV(fit_intercept=True, normalize=True)
        else:
            hyperparams_def = {
                "alpha": FloatHyperparameterDimension(in_hyperparam_space["alpha"])
            }
            base_clf = Ridge(fit_intercept=True, normalize=True)
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        params = clf.get_params()
        safe_del(ret, "ridge_grid")

        ret["ridge"] = {}
        if hasattr(clf, "alpha_"):
            ret["ridge"]["alpha"] = params.get("alpha", clf.alpha_)
        else:
            ret["ridge"]["alpha"] = params.get("alpha", 0)

        return amp


register_regression_algorithm(RidgeRegression)


class LassoRegression(PredictionAlgorithm):
    algorithm = "LASSO_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_def = {}
        if in_hyperparam_space.get("alphaMode", None) == "AUTO_CV":
            base_clf = LassoCV(fit_intercept=True, normalize=True, cv=3)
        elif in_hyperparam_space.get("alphaMode", None) == "AUTO_IC":
            base_clf = LassoLarsIC(fit_intercept=True, normalize=True, verbose=3)
        else:
            hyperparams_def = {
                "alpha": FloatHyperparameterDimension(in_hyperparam_space["alpha"])
            }
            base_clf = Lasso(fit_intercept=True, normalize=True)
        hyperparams_space = HyperparametersSpace(hyperparams_def)
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space, support_sample_weights=False)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        safe_del(ret, "ridge_grid")
        params = clf.get_params()
        ret["lasso"] = {}
        if hasattr(clf, "alpha_"):
            ret["lasso"]["alpha"] = params.get("alpha", clf.alpha_)
        else:
            ret["lasso"]["alpha"] = params.get("alpha", 0)
        return amp


register_regression_algorithm(LassoRegression)


class LeastSquareRegression(PredictionAlgorithm):
    algorithm = "LEASTSQUARE_REGRESSION"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):
        hyperparams_space = HyperparametersSpace({})
        base_clf = LinearRegression(fit_intercept=True, normalize=True, n_jobs=in_hyperparam_space['n_jobs'])
        return TrainableModel(base_clf, hyperparemeters_space=hyperparams_space)

    def actual_params(self, ret, clf, fit_params):
        amp = {"resolved": ret, "other": {}}
        params = clf.get_params()
        logger.info("Selected Ordinary Least Squares Params are %s " % params)
        safe_del(ret, "least_squares")
        ret["n_jobs"] = params["n_jobs"]
        return amp


register_regression_algorithm(LeastSquareRegression)

register_regression_algorithm(PluginPredictionAlgorithm)


def regression_fit_ensemble(modeling_params, core_params, split_desc, train_X, train_y, sample_weight=None):
    logger.info("Fitting ensemble model")
    clf = EnsembleRegressor(modeling_params["ensemble_params"], core_params, split_desc)
    clf = clf.fit(train_X, train_y, sample_weight=sample_weight)

    initial_intrinsic_perf_data = {}
    actual_params = {"resolved": modeling_params}

    return clf, actual_params, train_X, initial_intrinsic_perf_data


def regression_fit_single(modeling_params, split_desc, transformed_train, m_folder=None,
                          gridsearch_done_fn=None, with_sample_weight=False):
    """
    Returns (clf, actual_params, prepared_train_X, initial_intrinsic_perf_data)
    Extracts the best estimator for grid search ones
    """
    train_X = transformed_train["TRAIN"]
    column_labels = [c for c in train_X.columns()]
    train_y = transformed_train["target"]
    DropNARows().process(None, train_X, None, None)
    train_X, is_sparse = prepare_multiframe(train_X, modeling_params)

    algorithm = modeling_params['algorithm']
    if algorithm not in REGRESSION_ALGORITHMS.keys():
        raise Exception("Algorithm not available in Python: %s" % algorithm)
    algorithm = REGRESSION_ALGORITHMS[algorithm]

    hyperparameter_search_runner = algorithm.get_hyperparameter_search_runner(modeling_params=modeling_params, column_labels=column_labels,
                                                                              m_folder=m_folder, unprocessed=transformed_train["UNPROCESSED"],
                                                                              split_desc=split_desc)

    if with_sample_weight:
        train_w = np.array(transformed_train["weight"])
    else:
        train_w = None

    # grid searcher figures out whether or not the algorithm supports sample weights
    clf = hyperparameter_search_runner.get_best_estimator(train_X, train_y, sample_weight=train_w)

    if gridsearch_done_fn:
        gridsearch_done_fn()

    dump_pretrain_info(clf, train_X, train_y, train_w)

    # check for sample weights supports before fitting the final model
    if with_sample_weight and hyperparameter_search_runner.algo_supports_weight:
        hyperparameter_search_runner.fit_params["sample_weight"] = train_w

    clf.fit(train_X, train_y, **hyperparameter_search_runner.fit_params)

    initial_intrinsic_perf_data = get_initial_intrinsic_perf_data(train_X, is_sparse)

    if not hyperparameter_search_runner.search_skipped():
        initial_intrinsic_perf_data.update(hyperparameter_search_runner.get_score_info())

    # get_actual_params performs the translation sklearn params (after refit) (e.g. n_estimators)
    # to DSS(raw) params (e.g rf_n_estimators)
    actual_params = algorithm.get_actual_params(modeling_params, clf, hyperparameter_search_runner.fit_params)
    logger.info("Output params are %s" % actual_params)

    return clf, actual_params, train_X, initial_intrinsic_perf_data
