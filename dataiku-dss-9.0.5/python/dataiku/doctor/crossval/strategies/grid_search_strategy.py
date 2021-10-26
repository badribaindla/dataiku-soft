from __future__ import division
from __future__ import print_function

import logging
import random
from collections import Mapping

from itertools import product

from dataiku.doctor.crossval.strategies.abstract_search_strategy import AbstractSearchStrategy

logger = logging.getLogger(__name__)


class GridSearchStrategy(AbstractSearchStrategy):
    def __init__(self, hyperparameters_space, randomized):
        self.hyperparameters_space = hyperparameters_space
        grid = DkuParameterGrid(hyperparameters_space)
        self.grid_elements = list(grid.grid_elements)
        if randomized:
            random.seed(hyperparameters_space.random_state)
            random.shuffle(self.grid_elements)

    def get_experiments_count(self):
        return len(self.grid_elements)

    def explore(self, evaluator):
        logger.info("Running GridSearchStrategy for hyperparameters space: %s" % self.hyperparameters_space)
        results, _ = self.explore_batch(evaluator, self.grid_elements)
        return [result.aggregated_result for result in results]


class DkuParameterGrid(object):
    def __init__(self, hyperparameters_space):

        self.hyperparameters_space = hyperparameters_space

        grid = hyperparameters_space.build_space("GRID")

        if isinstance(grid, Mapping):
            # wrap dictionary in a singleton list to support either dict
            # or list of dicts
            grid = [grid]
        self.grid = grid
        # Enforce gridness
        for p in self.grid:
            for k in p.keys():
                if not isinstance(p[k], tuple) and not isinstance(p[k], list):
                    p[k] = [p[k]]

        # We ensure that grid_elements is always built in the same order for reproducibility
        self.grid_elements = self._build_grid_elements()

    def __len__(self):
        """Number of points on the grid."""
        return len(self.grid_elements)

    def __getitem__(self, index):
        return self.grid_elements[index]

    def _build_grid_elements(self):
        grid_elements = []
        for p in self.grid:
            # Always sort the keys of a dictionary, for reproducibility
            items = sorted(p.items())
            # It is possible to have empty list of params (e.g Ordinary least squares)
            if not items:
                grid_elements.append(self.hyperparameters_space.enrich_hyperparam_point({}))
            else:
                keys, values = zip(*items)
                param_list = list(product(*values))
                for param_elem in param_list:
                    grid_elements.append(
                        self.hyperparameters_space.enrich_hyperparam_point(dict(zip(keys, param_elem))))

        return grid_elements
