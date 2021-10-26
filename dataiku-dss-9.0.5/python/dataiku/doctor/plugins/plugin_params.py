"""
    Listing loaded ML plugin params for future use or download them from the backend

    Warning: as it may need to communicate with the backend, MUST to be able to do so
"""
from dataiku.core import intercom


# CUSTOM PREDICTION ALGORITHMS #

__LOADED_CUSTOM_PY_PRED_ALGOS = {}


def get_prediction_algo_params_from_backend(plugin_id, element_id):
    return intercom.backend_json_call("ml/plugins/get-algo-params", {
        "pluginId": plugin_id,
        "algoId": element_id
    })


def get_prediction_algo_params(plugin_id, element_id):

    element_key = make_element_key(plugin_id, element_id)

    if element_key in __LOADED_CUSTOM_PY_PRED_ALGOS.keys():
        return __LOADED_CUSTOM_PY_PRED_ALGOS[element_key]

    else:
        algo_params = get_prediction_algo_params_from_backend(plugin_id, element_id)
        __LOADED_CUSTOM_PY_PRED_ALGOS[element_key] = algo_params
        return algo_params


# UTILS #

def make_element_key(plugin_id, element_id):
    return "{}__{}".format(plugin_id, element_id)




