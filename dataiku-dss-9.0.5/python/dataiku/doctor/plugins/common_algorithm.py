import importlib

from dataiku.doctor.plugins.plugin_params import get_prediction_algo_params
from dataiku.doctor.prediction.common import PredictionAlgorithm
from dataiku.doctor.prediction.common import TrainableModel
from dataiku.doctor.prediction.common import GridHyperparametersSpace


class PluginPredictionAlgorithm(PredictionAlgorithm):
    algorithm = "CUSTOM_PLUGIN"

    def model_from_params(self, in_hyperparam_space, modeling_params, prediction_type):

        algo_info = modeling_params["plugin_python_grid"]
        algo_module = importlib.import_module("dku-ml-plugins.{}.python-prediction-algos.{}.algo"
                                              .format(algo_info["pluginId"], algo_info["elementId"]))

        algo_params = get_prediction_algo_params(algo_info["pluginId"], algo_info["elementId"])
        grid_params = [param["name"] for param in algo_params.get("params", []) if param.get("gridParam", False)]

        support_sample_weights = algo_info.get("supportsSampleWeights", False)

        self.plugin_algo = algo_module.CustomPredictionAlgorithm(prediction_type=prediction_type,
                                                                 params=algo_info["params"])
        self.plugin_algo.set_grid_params(grid_params)

        base_clf = self.plugin_algo.get_clf()
        grid = self.plugin_algo.get_grid() if hasattr(self.plugin_algo, "get_grid") else {}
        fit_params = self.plugin_algo.get_fit_params() if hasattr(self.plugin_algo, "get_fit_params") else {}
        return TrainableModel(base_clf,
                              hyperparemeters_space=GridHyperparametersSpace(grid),
                              fit_params=fit_params,
                              support_sample_weights=support_sample_weights)

    def actual_params(self, ret, clf, fit_params):
        if hasattr(self.plugin_algo, "get_best_clf_grid_params"):
            ret["plugin_python"] = self.plugin_algo.get_best_clf_grid_params(clf, fit_params)
        other = self.plugin_algo.get_other(ret, clf, fit_params) if hasattr(self.plugin_algo, "get_other") \
            else {}
        amp = {"resolved": ret, "other": other}
        return amp