import contextlib
import logging
import time

from dataiku.doctor.crossval.strategies.abstract_search_strategy import AbstractSearchStrategy
from dataiku.doctor.crossval.strategies.abstract_search_strategy import deduplicate_iterable
from dataiku.doctor.diagnostics import diagnostics

logger = logging.getLogger(__name__)


class BayesianIterationMonitor(object):
    # Threshold time (in seconds) for Bayesian optimizer points generation and update
    ML_DIAGNOSTIC_BAYESIAN_OPTIMIZER_TIME_THRESHOLD = 60

    DIAGNOSTIC_ID_SLOW_BAYESIAN_OPTIMIZER = "ML_DIAGNOSTICS_RUNTIME--SLOW_BAYESIAN_OPTIMIZER"

    def __init__(self):
        self._optimizer_time = 0

    @contextlib.contextmanager
    def slow_optimizer_diagnostic(self, reset_optimizer_time=False):
        """
        Context manager evaluating if the optimizer ask is getting slow, and raising a diagnostic accordingly.
        We only evaluate the latest iteration, since ask time should increase from one iteration to the next.
        """
        if reset_optimizer_time:
            self._optimizer_time = 0

        initial_time = time.time()
        yield
        self._optimizer_time += time.time() - initial_time
        if self._optimizer_time >= self.ML_DIAGNOSTIC_BAYESIAN_OPTIMIZER_TIME_THRESHOLD:
            diagnostics.add_or_update(
                diagnostics.DiagnosticType.ML_DIAGNOSTICS_RUNTIME,
                "Bayesian iteration took more than {:.1f} seconds to produce new points and update the optimizer".format(self._optimizer_time),
                diagnostic_id=self.DIAGNOSTIC_ID_SLOW_BAYESIAN_OPTIMIZER,
            )


class BayesianSearchStrategy(AbstractSearchStrategy):

    def __init__(self, hyperparameters_space, iteration_monitor=BayesianIterationMonitor()):
        self.batch_size = 4  # TODO
        self.hyperparameters_space = hyperparameters_space
        self.iteration_monitor = iteration_monitor

    def get_experiments_count(self):
        return None

    def explore(self, evaluator):
        logger.info("Running BayesianSearchStrategy for hyperparameters space: %s" % self.hyperparameters_space)

        explored_results = []
        has_been_interrupted = False
        seen_parameters = []
        optimizer = self.hyperparameters_space.get_optimizer()
        while not has_been_interrupted:
            logger.info("Requesting {} new hyper-parameter combinations to try from the Bayesian optimizer".format(
                self.batch_size))

            # The optimizer (skopt) isn't super-smart and may produce duplicates # => We need to remove duplicate parameters
            with self.iteration_monitor.slow_optimizer_diagnostic(reset_optimizer_time=True):
                batch_parameters = list(deduplicate_iterable(optimizer.ask(self.batch_size), seen_items=seen_parameters))

            if len(batch_parameters) > 0:
                batch_results, has_been_interrupted = self.explore_batch(evaluator, batch_parameters)
            else:
                # Batch is full of duplicates => stop the search
                logger.info("Bayesian optimizer produced a batch full of duplicates -> aborting search")
                batch_results, has_been_interrupted = [], True

            batch_scores = []
            batch_parameters = []
            for result in batch_results:
                explored_results.append(result.aggregated_result)
                # Note 1: 'test_score_gib' is already corrected by metric sign so that "greater is always better"
                # Note 2: using '-test_score_gib' because 'optimizer' is a minimizer
                batch_scores += [-split_result["test_score_gib"] for split_result in result.per_split_results]
                batch_parameters += [split_result["parameters"] for split_result in result.per_split_results]

            if len(batch_parameters) > 0 and not has_been_interrupted:
                logger.info("Updating the Bayesian optimizer with {} results".format(len(batch_parameters)))
                with self.iteration_monitor.slow_optimizer_diagnostic():
                    optimizer.tell(batch_parameters, batch_scores)

        return explored_results
