
class BaseCustomPredictionAlgorithm(object):

    def __init__(self, prediction_type=None, params=None):
        self.__dku_params = params
        self.__dku_grid_params = None

    def set_grid_params(self, grid_params):
        self.__dku_grid_params = grid_params

    def get_grid_params(self):
        return self.__dku_grid_params

    def get_clf(self):
        raise NotImplementedError("You must implement 'get_clf' method")

    def get_grid(self):

        grid_params = self.get_grid_params()
        if grid_params is None or len(grid_params) == 0:
            return {}

        grid_params = {name: (param if isinstance(param, list) else [param])
                       for (name, param) in self.__dku_params.items() if name in self.__dku_grid_params}

        return grid_params

    def get_best_clf_grid_params(self, best_clf, fit_params):
        params = best_clf.get_params()
        return {name: param for (name, param) in params.items() if name in self.__dku_grid_params}
