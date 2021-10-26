import logging

from dataiku.doctor.crossval.strategies.abstract_search_strategy import AbstractSearchStrategy
from dataiku.doctor.crossval.strategies.abstract_search_strategy import deduplicate_iterable

logger = logging.getLogger(__name__)


class RandomSearchStrategy(AbstractSearchStrategy):
    def __init__(self, hyperparameters_space):
        self.hyperparameters_space = hyperparameters_space

    def get_experiments_count(self):
        return None

    def explore(self, evaluator):
        logger.info("Running RandomSearchStrategy for hyperparameters space: %s" % self.hyperparameters_space)
        # Random sampler may generate duplicates in some cases
        # => We need to remove duplicate parameters
        parameters = deduplicate_iterable(self.hyperparameters_space.get_random_parameters(2 ** 31), limit=100)
        results, _ = self.explore_batch(evaluator, parameters)
        return [result.aggregated_result for result in results]
