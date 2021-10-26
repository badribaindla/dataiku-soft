import logging

import numpy as np

from dataiku.doctor.distributed.cheap_future import CheapFuture
from dataiku.doctor.distributed.cheap_future import reraise_most_important
from dataiku.doctor.distributed.work_scheduler import SchedulerHardInterrupted
from dataiku.doctor.distributed.work_scheduler import SchedulerSoftInterrupted

logger = logging.getLogger(__name__)


class SearchEvaluator(object):
    """
    "Scalable" hyperparameter evaluator
    - Typically controlled by a search strategy
    - Backed by a scheduler to distribute work on multiple workers
    - Results are persisted
    """

    def __init__(self, scheduler, search_context, result_store, max_n_iter, search_evaluation_monitor):
        self.scheduler = scheduler
        self.search_context = search_context
        self.result_store = result_store
        self.max_n_iter = max_n_iter
        self.n_iter = 0
        self.search_evaluation_monitor = search_evaluation_monitor

    def __call__(self, parameter):
        """
        Evaluate a single hyper parameter point on all splits

        This method asks workers to evaluate the parameter for each split and returns without waiting
        for the results to be computed.

        However, this method blocks if there is not enough workers available

        :returns: a future of HPPointResult
        """
        if self.max_n_iter is not None and self.n_iter >= self.max_n_iter:
            logger.info('Aborting search for hyperparameters (max nb. of iterations)')
            # Raising a 'SchedulerSoftInterrupted' is used to signal interruption to the search strategy
            # Note that it is not correct to interrupt the scheduler at this point because there is no guarantee
            # that previous points are completely handled and we don't want to loose them
            return CheapFuture.from_exception(SchedulerSoftInterrupted)

        per_split_futures = []
        for split_id in range(len(self.search_context.splits)):
            per_split_futures.append(
                self._schedule_single_split_evaluation(split_id, parameter, self.n_iter > 0))
        self.n_iter += 1

        def execute_all_splits_aggregate_store_fn():
            # A "true error" will cause a "hard interruption" of the scheduler and cause other futures to fail as well
            # => Try to re-raise the most relevant error
            reraise_most_important(per_split_futures,
                                   importance=[Exception, SchedulerHardInterrupted, SchedulerSoftInterrupted])

            per_split_results = []
            for per_split_future in per_split_futures:
                per_split_results.append(per_split_future.result())
                self.search_evaluation_monitor.record_task_completion()

            self.result_store.append_split_results(per_split_results)
            aggregated_result = aggregate_point_results(per_split_results)
            self.result_store.append_aggregated_result(aggregated_result)
            return HPPointResult(aggregated_result, per_split_results)

        return CheapFuture.from_async(execute_all_splits_aggregate_store_fn)

    def _schedule_single_split_evaluation(self, split_id, parameters, is_soft_interruptible):
        """
        Schedule the evaluation of a single hyper parameter point on a single split
        :returns: a future
        """

        stored_result = self.result_store.find_split_result(split_id, parameters)
        if stored_result:
            logger.info("Re-using evaluation on split %s: %s" % (split_id, parameters))
            if self.scheduler.soft_interrupted and is_soft_interruptible:
                return CheapFuture.from_exception(SchedulerSoftInterrupted)
            else:
                return CheapFuture.from_result(stored_result)
        else:
            logger.info("Schedule evaluation on split %s: %s" % (split_id, parameters))
            return self.scheduler.schedule_work(is_soft_interruptible, split_id, parameters)


def compute_mean_and_std(key, array, weights=None):
    np_array = np.array([x[key] for x in array], dtype=np.float64)
    mean = np.average(np_array, weights=weights)
    return {
        "mean": mean,
        # Weighted std is not directly available in numpy
        "std": np.sqrt(np.average((np_array - mean) ** 2, weights=weights))
    }


def aggregate_point_results(results):
    if len(results) == 0:
        raise ValueError("Trying to aggregate over an empty list of results")

    parameters = results[0]["parameters"]
    weights = [x["num_samples"] for x in results]

    # Applying weights only for scores, not for times
    test_score_res = compute_mean_and_std("test_score", results, weights)
    train_score_res = compute_mean_and_std("train_score", results, weights)
    test_score_gib_res = compute_mean_and_std("test_score_gib", results, weights)
    fit_time_res = compute_mean_and_std("fit_time", results)
    score_time_res = compute_mean_and_std("score_time", results)

    # For XGBoost, compute median best iteration to reuse for final fit
    best_iterations = [x.get('best_iteration', None) for x in results]
    best_iteration = None
    if any([x is not None for x in best_iterations]):
        best_iteration = int(np.median(best_iterations))

    aggregated_point = {
        'finishedAt': np.max([x["done_at"] for x in results]),
        'score': test_score_res["mean"],
        'testScoreGibMean': test_score_gib_res["mean"],
        'testScoreMean': test_score_res["mean"],
        'testScoreStd': test_score_res["std"],
        'trainScoreMean': train_score_res["mean"],
        'trainScoreStd': train_score_res["std"],
        'time': np.sum([x["time"] for x in results]),
        'fitTimeMean': fit_time_res["mean"],
        'fitTimeStd': fit_time_res["std"],
        'scoreTimeMean': score_time_res["mean"],
        'scoreTimeStd': score_time_res["std"],
        'best_iteration': best_iteration,
        'parameters': parameters
    }

    return aggregated_point


class HPPointResult(object):
    """
    Result of the evaluation of one hyper parameter point on all splits
    Containing the aggregated results + the results on each split
    """

    def __init__(self, aggregated_result, per_split_results):
        self.aggregated_result = aggregated_result
        self.per_split_results = per_split_results
