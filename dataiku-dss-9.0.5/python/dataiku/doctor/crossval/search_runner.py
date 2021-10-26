import inspect
import logging
import multiprocessing
import os
from threading import Thread

import time
from sklearn import clone
from sklearn.base import is_classifier
from sklearn.metrics import check_scoring
from sklearn.model_selection import check_cv
from sklearn.utils import indexable

from dataiku.doctor.crossval.result_store import NoopResultStore
from dataiku.doctor.crossval.result_store import OnDiskResultStore
from dataiku.doctor.crossval.search_context import SearchContext
from dataiku.doctor.crossval.search_context import Split
from dataiku.doctor.crossval.search_evaluation_monitor import SearchEvaluationMonitor
from dataiku.doctor.crossval.search_evaluator import SearchEvaluator
from dataiku.doctor.distributed.local_worker import LocalWorker
from dataiku.doctor.distributed.remote_worker_client import RemoteWorkerClient
from dataiku.doctor.distributed.remote_worker_client import WorkersStartupMonitor
from dataiku.doctor.distributed.work_scheduler import WorkScheduler
from dataiku.doctor.distributed.worker_splitter import WorkerSplitter
from dataiku.doctor.utils import interrupt_optimization
from dataiku.doctor.utils import unix_time_millis

logger = logging.getLogger(__name__)


class SearchRunner(object):
    def __init__(self, estimator, hyperparameters_space, scoring, fit_params, n_threads, cv,
                 m_folder, n_iter, timeout, evaluation_metric, algo_supports_weight,
                 search_strategy, custom_evaluation_metric_gib, distributed, n_containers):
        self.estimator = estimator
        self.hyperparameters_space = hyperparameters_space
        self.fit_params = fit_params
        self.cv = cv
        self.scoring = scoring

        self.m_folder = m_folder
        self.n_iter = n_iter
        self.timeout = timeout
        self.evaluation_metric = evaluation_metric
        self.algo_supports_weight = algo_supports_weight
        self.n_threads = n_threads
        self.n_containers = n_containers
        self.distributed = distributed
        self.search_strategy = search_strategy
        if self.m_folder is None:
            self.result_store = NoopResultStore()
        else:
            self.result_store = OnDiskResultStore(self.m_folder)

        self.monitor = SearchEvaluationMonitor(distributed)
        self.metric_sign = get_metric_sign(scoring, custom_evaluation_metric_gib)

        # Defined after search
        self.aggregated_results = None
        self.best_result = None

    def get_experiments_count(self):
        nb_experiments = self.search_strategy.get_experiments_count()
        if self.n_iter is not None:
            if nb_experiments is None:
                nb_experiments = self.n_iter
            else:
                nb_experiments = min(self.n_iter, nb_experiments)
        return nb_experiments

    def search_skipped(self):
        if self._is_xgboost_model() and self.fit_params.get('early_stopping_rounds') is not None:
            return False  # We always need to do a search for the n_estimators param since we do early stopping

        nb_experiments = self.get_experiments_count()
        return nb_experiments is not None and nb_experiments <= 1

    def _build_work_scheduler(self, search_context):
        # REMOTE_WORKER_POOL_ID is set by DSS/JEK whenever it makes sense
        # (ie. we are running in K8S)
        remote_worker_pool_id = os.getenv("REMOTE_WORKER_POOL_ID")
        n_threads = self.n_threads if self.n_threads > 0 else multiprocessing.cpu_count()
        workers = []

        # Distributed mode
        if self.distributed and remote_worker_pool_id:
            n_remote_containers = max(0, self.n_containers - 1)

            # Create 'n_threads' threads in the master
            for _ in range(n_threads):
                workers.append(LocalWorker())

            # Monitor the remote workers startup (for diagnostics)
            workers_startup_monitor = WorkersStartupMonitor()

            # Create 'n_containers' additional containers, each of them split into 'n_threads' threads
            for _ in range(n_remote_containers):
                remote_worker = RemoteWorkerClient(remote_worker_pool_id, workers_startup_monitor)

                # Note: split_worker() is no-op unless 'n_threads > 1'
                workers += WorkerSplitter.split_worker(remote_worker, n_threads)

            logger.info(
                "Distribute hyperparameter search using up to %s K8S container(s) with %s thread(s) per container"
                % (self.n_containers, n_threads))

            scheduler = WorkScheduler(workers, search_context)
            scheduler.register_interrupt_callback(workers_startup_monitor.suspend)

        # Threaded mode
        else:
            # Create 'n_threads' threads in the master
            for _ in range(n_threads):
                workers.append(LocalWorker())

            logger.info("Execute hyperparameter search locally on %s threads" % n_threads)

            scheduler = WorkScheduler(workers, search_context)

        return scheduler

    def _is_xgboost_model(self):
        return "DkuXGB" in str(self.estimator.__class__)

    def get_best_estimator(self, X, y, groups=None, sample_weight=None, class_weight=None):
        estimator = clone(self.estimator)
        if class_weight is not None:
            if "class_weight" in estimator.get_params():
                estimator.set_params(class_weight=class_weight)
            else:
                logger.warn("class weights are not supported for algorithm {}".format(type(estimator)))

        if self.search_skipped():
            logger.info("Got single-point space, not performing hyperparameter search")
            default_parameters = self.search_strategy.get_default_parameters()
            return estimator.set_params(**default_parameters)

        X, y, groups, sample_weight = indexable(X, y, groups, sample_weight)
        cv = check_cv(self.cv, y, classifier=is_classifier(estimator))
        scorer = check_scoring(estimator, scoring=self.scoring)
        splits = [Split(train, test) for train, test in cv.split(X, y, groups)]
        n_splits = len(splits)

        nb_experiments = self.get_experiments_count()
        if nb_experiments is None:
            logger.info("Fitting {} folds for each candidate, for {}min".format(n_splits, self.timeout))
        else:
            logger.info("Fitting {0} folds for each of {1} candidates, totalling"
                        " {2} fits".format(n_splits, nb_experiments, nb_experiments * n_splits))

        search_context = SearchContext(X, y, splits, sample_weight, estimator, scorer, self.fit_params,
                                       self.algo_supports_weight, self.metric_sign)

        with self._build_work_scheduler(search_context) as scheduler:
            self.result_store.init_result_file(nb_experiments, scheduler.get_workers_count(), n_splits,
                                               self.evaluation_metric, self.timeout)

            evaluator = SearchEvaluator(scheduler, search_context, self.result_store, self.n_iter, self.monitor)
            interrupt_optimization.set_interrupt_folder(self.m_folder)
            with InterruptThread(scheduler, self.timeout, self.result_store):
                self.aggregated_results = self.search_strategy.explore(evaluator)
                self.best_result = max(self.aggregated_results, key=lambda res: res["testScoreGibMean"])

        best_parameters = self.best_result["parameters"]
        # XGBoost: do no use early stopping for the final refit, but median of n_estimators for best hyper-params
        if self._is_xgboost_model() and self.fit_params.get('early_stopping_rounds') is not None:
            # iteration (starts at 0) -> n_estimators (starts at 1)
            best_parameters["n_estimators"] = self.best_result["best_iteration"] + 1

        logger.info('Hyperparameter search done, best_parameters being : {}'.format(best_parameters))
        return estimator.set_params(**best_parameters)

    def get_score_info(self):
        return {
            "usedGridSearch": not self.search_skipped(),
            "gridSize": len(self.aggregated_results),
            "gridBestScore": self.best_result["testScoreMean"],
            "gridCells": [{'params': er["parameters"],
                           'score': er["testScoreMean"], 'scoreStd': er["testScoreStd"],
                           'fitTime': er["fitTimeMean"] / 1000, 'fitTimeStd': er["fitTimeStd"] / 1000,
                           'scoreTime': er["scoreTimeMean"] / 1000, 'scoreTimeStd': er["scoreTimeStd"] / 1000}
                          for er in self.aggregated_results],
        }


def get_metric_sign(scoring, custom_evaluation_metric_gib):
    if inspect.isfunction(scoring) and not hasattr(scoring, "_sign"):
        # custom scoring func, the scorer is wrapped, so no access to the sign
        return 1 if custom_evaluation_metric_gib else -1
    else:
        return getattr(scoring, "_sign", 1)


class InterruptThread(Thread):
    def __init__(self, scheduler, timeout, result_store):
        super(InterruptThread, self).__init__()
        self.scheduler = scheduler
        self.timeout = timeout
        self.result_store = result_store
        self.watching = True

    def run(self):
        while True:
            if not self.watching:
                logger.info('Completed search for hyperparameters')
                self.result_store.update_final_grid_size()
                break

            if self.planned_end_time_ms is not None and unix_time_millis() > self.planned_end_time_ms:
                logger.info('Aborting search for hyperparameters (timeout)')
                break

            # Note: make sure must_interrupt() isn't called too often, because it might be slow in container mode
            if interrupt_optimization.must_interrupt():
                logger.info('Aborting search for hyperparameters (user)')
                break

            time.sleep(1)

        # Shutdown the scheduler to smoothly interrupt the search
        # (wait for current work to complete, reject new work)
        self.scheduler.interrupt_soft()

    def _get_planned_end_time_ms(self):
        return unix_time_millis() + self.timeout * 60 * 1000 if self.timeout is not None else None

    def __enter__(self):
        self.planned_end_time_ms = self._get_planned_end_time_ms()
        self.start()
        return self

    def __exit__(self, *_):
        self.watching = False
        self.join()
