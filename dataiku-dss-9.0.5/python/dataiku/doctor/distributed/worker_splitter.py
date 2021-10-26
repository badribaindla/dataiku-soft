import logging
import threading
from threading import Thread

import six
import sys
import time

from dataiku.base.block_link import register_as_serializable
from dataiku.base.utils import contextualized_thread_name
from dataiku.doctor.distributed.cheap_future import CheapFuture
from dataiku.doctor.distributed.work_scheduler import AbstractContext
from dataiku.doctor.distributed.work_scheduler import AbstractWorker
from dataiku.doctor.distributed.work_scheduler import WorkerFailure

logger = logging.getLogger(__name__)


class WorkerSplitter(object):
    """
    Split a worker (called "backing worker") into N sub-workers, each running tasks in multiple threads
    within the backing worker.

    This can be used to turn a "single-threaded remote worker" into a "multi-threaded remote worker". In
    the case, the backing worker is a RemoteWorkerClient

    Entry-point is WorkerSplitter.split_worker(backing_worker, n_subworkers) -> SubWorker[]


    DISCLAIMER:

        This class is a hack. It relies on polling, which can be a performance killer in some cases
        (ie. when many short tasks/high frequency scheduling)

        Why we did that:
        - It's far quicker to add this on top of existing mechanism (rather than upgrading existing code).
        - In the context of distributed hyperparameter search, tasks are not short

        Implementing "truly" multithreaded workers is tracked by ch54658 in case performance becomes an issue.
    """

    # Not super sexy, we rely on polling to check the status of tasks periodically
    MIN_POLLING_PERIOD_IN_SECONDS = .01
    MAX_POLLING_PERIOD_IN_SECONDS = 5.0

    def __init__(self, backing_worker, n_subworkers):
        assert n_subworkers > 0

        self._backing_worker = backing_worker
        self._start_backing_worker_future = None
        self._stop_backing_worker_future = None
        self._per_subworker_task = {}
        self._lock = threading.Lock()
        self._stopped = False
        self._backing_context = None
        self._exc_info = None

        self.subworkers = []
        for subworker_index in range(n_subworkers):
            subworker_id = "%s.%s" % (backing_worker.worker_id, subworker_index)
            self.subworkers.append(SubWorker(self, subworker_id))

    @staticmethod
    def split_worker(backing_worker, n_subworkers):
        """
        Return a list of sub-workers backed by 'backing_worker' (see SubWorker)
        """
        if n_subworkers > 1:
            return WorkerSplitter(backing_worker, n_subworkers).subworkers
        else:
            # Do not split (avoid useless overhead)
            return [backing_worker]

    def _start(self, context):
        with self._lock:
            if self._backing_context is None:
                self._backing_context = context
            assert self._backing_context == context

            # The first sub-worker to start will start the backing worker
            if self._start_backing_worker_future is None:
                def start_fn():
                    with contextualized_thread_name(self._backing_worker.worker_id):
                        logger.info("Splitting worker %s into %s thread(s)" % (
                            self._backing_worker.worker_id, len(self.subworkers)))
                        proxified_context = ProxyContext(self._backing_context)
                        self._backing_worker.start(proxified_context)
                        Thread(target=self._run).start()

                self._start_backing_worker_future = CheapFuture.from_async(start_fn)

        # Wait for backing worker to start
        # Re-throw the error if the backing worker to do so
        self._start_backing_worker_future.result()

    def _stop(self, exc_info):
        with self._lock:
            # First stopped subworker stops the backing worker
            #
            # This behavior may seem weird and it actually isn't completely correct. Ideally we should wait
            # for last subworker to be stopped before stopping the backing worker.
            #
            # In practice, the scheduler will only call stop() on a subworker if:
            # - Scheduler is hard interrupted (all workers will be stopped anyway)
            # - Subworker failed during start (backing worker failure == all subworkers are dead anyway)
            #
            # => Behavior is okay in this context
            if not self._stopped:
                self._stop_backing_worker_future = CheapFuture.from_async(self._backing_worker.stop)
                self._stopped = True
                self._exc_info = exc_info
                for task in self._per_subworker_task.values():
                    task.future.set_exception(exc_info)
                self._per_subworker_task.clear()

        # Re-throw the error if the backing worker failed during stop
        self._stop_backing_worker_future.result()

    def _execute_work(self, worker_id, work_args):
        with self._lock:
            assert worker_id not in self._per_subworker_task
            if self._stopped:
                six.reraise(*self._exc_info)
            task = Task(work_args, worker_id)
            self._per_subworker_task[worker_id] = task
        return task.future.result()

    def _run(self):
        wait_time = self.MIN_POLLING_PERIOD_IN_SECONDS
        try:
            while True:
                with self._lock:
                    if self._stopped:
                        return

                    # Check for tasks to execute
                    tasks_to_send = []
                    for task in self._per_subworker_task.values():
                        if not task.sent:
                            # A task is being sent, reduce polling period
                            wait_time /= 2
                            task.sent = True
                            tasks_to_send.append((task.subworker_id, task.work_args))

                # Sync tasks with the backing worker and collect previous results
                with contextualized_thread_name(self._backing_worker.worker_id):
                    subworker_ids = [subworker_id for subworker_id, _ in tasks_to_send]
                    if len(tasks_to_send) > 0:
                        logger.info("Sending %s new task(s) for %s" % (len(tasks_to_send), ', '.join(subworker_ids)))
                    finished_results = self._backing_worker.execute_work(tasks_to_send)

                # Check for received results
                with self._lock:
                    if len(finished_results) > 0:
                        subworker_ids = [subworker_id for subworker_id, _, _ in finished_results]
                        logger.info("Got %s results(s) from %s" % (len(finished_results), ', '.join(subworker_ids)))

                    if self._stopped:
                        return

                    for worker_id, result, exception in finished_results:
                        # A result has been received, reduce polling period
                        wait_time /= 2
                        task = self._per_subworker_task[worker_id]
                        assert task.subworker_id == worker_id
                        if exception is None:
                            task.future.set_result(result)
                        else:
                            task.future.set_exception(exception)
                        del self._per_subworker_task[worker_id]

                # Wait for some time (mostly to avoid log pollution)
                # (constantly increase polling period)
                wait_time *= 2
                wait_time = min(self.MAX_POLLING_PERIOD_IN_SECONDS, wait_time)
                wait_time = max(self.MIN_POLLING_PERIOD_IN_SECONDS, wait_time)
                if len(finished_results) > 0:
                    time.sleep(self.MIN_POLLING_PERIOD_IN_SECONDS)
                else:
                    time.sleep(wait_time)
        except:
            self._stop(sys.exc_info())


class Task(object):
    def __init__(self, work_args, subworker_id):
        self.future = CheapFuture()
        self.work_args = work_args
        self.subworker_id = subworker_id
        self.sent = False


@register_as_serializable
class ProxyContext(AbstractContext):
    """
    This proxy-context object redirects calls of ProxyContext.execute_work()
    to backing_context.execute_work() in a separate thread
    """

    # The lock is not stored as an instance variable because:
    # - Lock isn't serializable (and the context must be pickle-able)
    # - It is never hold for a long period and there is only one instance of ProxyContext per process anyway
    _lock = threading.Lock()

    def __init__(self, backing_context):
        self._backing_context = backing_context
        self._results = []

    def _schedule_work(self, subworker_id, work_args):
        def task_fn():
            try:
                result = self._backing_context.execute_work(*work_args)
                with self._lock:
                    self._results.append((subworker_id, result, None))
            except Exception:
                with self._lock:
                    self._results.append((subworker_id, None, sys.exc_info()[:2]))

        # Here we should have 1 dedicated thread per subworker_id. However:
        # - As long as task time >> thread creation overhead, it is ok perf-wise
        # - As long as tasks run in parallel, nobody cares if "truly dedicated threads"
        #   are assigned to subworkers
        # - Can't be simpler than this one-liner
        Thread(target=task_fn, name=subworker_id).start()

    def execute_work(self, works):
        for subworker_id, work_args in works:
            self._schedule_work(subworker_id, work_args)

        with self._lock:
            results = self._results
            self._results = []
            return results


class SubWorker(AbstractWorker):
    """
    A SubWorker sends work to a thread living in the backing worker
    """

    def __init__(self, splitter, subworker_id):
        super(SubWorker, self).__init__()
        self.worker_id = subworker_id
        self.splitter = splitter

    def start(self, context):
        self.splitter._start(context)

    def stop(self):
        try:
            raise WorkerFailure("Worker %s has been stopped" % self.worker_id)
        except Exception:
            self.splitter._stop(sys.exc_info())

    def execute_work(self, *work_args):
        return self.splitter._execute_work(self.worker_id, work_args)
