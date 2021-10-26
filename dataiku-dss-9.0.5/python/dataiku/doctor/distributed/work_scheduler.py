# coding: utf-8
import logging
import threading
from threading import Thread

import sys
from enum import Enum

from dataiku.base.utils import contextualized_thread_name
from dataiku.doctor.distributed.cheap_future import CheapFuture

logger = logging.getLogger(__name__)


class WorkerFailure(Exception):
    pass


class AtomicCounter(object):
    def __init__(self):
        self.count = 0
        self.lock = threading.Lock()

    def get_and_increment(self):
        with self.lock:
            count = self.count
            self.count += 1
            return count


class AbstractWorker(object):
    def __init__(self):
        self.worker_id = "unnamed"

    def start(self, context):
        """
        Allocate resources if necessary (container, etc)
        Raise WorkerFailure if a worker-level issue occurs
        """
        raise NotImplementedError

    def stop(self):
        """
        Release resources if necessary (container, etc)
        Should not raise exception

        Note: stop() can be called at ANY time (before, during or after start())
              implementation is responsible for releasing resources
        """
        raise NotImplementedError

    def execute_work(self, *args):
        """
        Call execute_work() on the context (context may live within or outside current process)
        Raise WorkerFailure if a worker-level issue occurs
        """
        raise NotImplementedError


class AbstractContext(object):
    def execute_work(self, *args):
        raise NotImplementedError


class SchedulerInterrupted(Exception):
    """
    Scheduler has been interrupted
    """
    pass


class SchedulerSoftInterrupted(SchedulerInterrupted):
    """
    Scheduler has been soft interrupted (only affects interruptible tasks)

    (soft interruption is typically caused by user/timeout/threshold reached in hyperparameter search)
    """
    pass


class SchedulerHardInterrupted(SchedulerInterrupted):
    """
    Scheduler has been hard interrupted (affects all tasks)

    (hard interruption is typically caused by an unexpected worker error during in hyperparameter search)
    """
    pass


class WorkerState(Enum):
    """
    Keep track of the state of a worker in order to determine if a task can be scheduled

    Warning: this enum is only used by the WorkScheduler in this module and applies to any kind of worker (local, remote)

    It has nothing to do with the seemingly-similar Java-side enum 'RemoteWorkerStatus' which tracks the readiness
    status of the kernel before the client establishes a connection to it.
    """

    # Worker not started or being started
    PENDING = 1
    # Worker is ready to process a task
    READY = 2
    # Worker is busy processing a task
    BUSY = 3
    # Worker is dead and can't be used anymore
    DEAD = 4


class Task(object):
    def __init__(self, is_soft_interruptible, work_args):
        self.future = CheapFuture()
        self.is_soft_interruptible = is_soft_interruptible
        self.work_args = work_args

    def mark_interrupted(self, exception_type):
        try:
            raise exception_type()
        except SchedulerInterrupted:
            self.future.set_exception(sys.exc_info())


class WorkerThread(Thread):
    """
    Manage worker lifecycle into a dedicated thread
    """

    def __init__(self, worker, scheduler):
        super(WorkerThread, self).__init__()
        self.worker = worker
        self.scheduler = scheduler
        self.state = WorkerState.PENDING

    def _start_worker(self):
        try:
            self.worker.start(self.scheduler.context)
        except Exception:
            logger.exception("Failed to start worker")
            return False

        with self.scheduler.lock:
            if self.state == WorkerState.PENDING:
                # Worker is now ready to receive a task
                # -> Notify threads blocked in scheduler.schedule_task()
                self.state = WorkerState.READY
                self.scheduler.schedule_work_condition.notify_all()
                return True
            else:
                # Worker has been stopped while is was starting
                # This is (only) caused by the scheduler being shut down before all workers are ready
                logger.info("Worker %s killed before it started" % self.worker.worker_id)
                return False

    def _stop_worker(self, stop_only_if_pending):
        with self.scheduler.lock:
            if stop_only_if_pending and self.state != WorkerState.PENDING:
                return  # Stop only if pending
            if self.state == WorkerState.DEAD:
                return  # Already stopped
            self.state = WorkerState.DEAD

            # We may need to replace this worker by a fresh one (eg. when it has failed)
            self.scheduler._start_worker_if_needed()

            # Make sure not all workers are dead
            self.scheduler._check_if_all_workers_dead()
        try:
            self.worker.stop()
        except Exception:
            logger.exception("Error while stopping worker %s..." % self.worker.worker_id)

    def stop_worker_if_pending(self):
        with contextualized_thread_name(self.worker.worker_id):
            self._stop_worker(True)

    def _take_next_task(self):
        """
        Wait until a task can be taken from the queue

        Returns None if there is no task anymore (when scheduler is shutting down)
        """
        with self.scheduler.lock:
            while not self.scheduler.hard_interrupted and self.state == WorkerState.READY:
                if len(self.scheduler.queue) > 0:
                    self.scheduler.schedule_work_condition.notify_all()
                    self.state = WorkerState.BUSY
                    return self.scheduler.queue.pop(0)
                self.scheduler.wait_for_task_condition.wait()
            return None

    def _notify_task_done(self):
        """
        Task has been processed, move back to READY state
        """
        with self.scheduler.lock:
            if self.state == WorkerState.BUSY:
                self.state = WorkerState.READY
            self.scheduler.schedule_work_condition.notify_all()

    def run(self):
        """
        Worker thread main loop
        """
        with contextualized_thread_name(self.worker.worker_id):
            try:
                if self._start_worker():
                    while True:
                        task = self._take_next_task()
                        if task is None:
                            break

                        exception = None
                        result = None
                        try:
                            logger.info("Running task...")
                            result = self.worker.execute_work(*task.work_args)
                        except Exception as e:
                            exception = sys.exc_info()

                            if isinstance(e, WorkerFailure):
                                # Current implementation is a bit simplistic: if a worker fails, we stop everything
                                # In the future, we might want to continue with less workers or try to replace them
                                logger.exception("Unexpected worker-level failure, shutdown the scheduler")
                                self.scheduler.interrupt_hard_async()
                        finally:
                            logger.info("Task done")
                            self._notify_task_done()

                        # Resolve the future *after* the worker becomes ready again (via _notify_task_done())
                        # Ensure that a new task scheduled *immediately* after this one completes doesn't start a new
                        # worker (this guarantee is mostly required by some unit tests in order to make deterministic
                        # assertions)
                        if exception:
                            task.future.set_exception(exception)
                        else:
                            task.future.set_result(result)
            finally:
                self._stop_worker(False)


class WorkScheduler(object):
    """
    Schedule work among a collection of workers (local, remote or a mix of both)
    """

    def __init__(self, workers, context):
        # List of (not yet started) workers
        self.workers = workers

        # Context object on which execute_work() is called
        self.context = context

        # Flag used to reject only "interruptible" tasks
        # Must be True whenever 'hard_interrupted' is True
        self.soft_interrupted = False

        # Flag used to completely shut down the scheduler
        self.hard_interrupted = False

        # Internals
        self.worker_threads = []
        self.queue = []
        self.nb_blocked_tasks = 0
        self.lock = threading.Lock()
        self.wait_for_task_condition = threading.Condition(self.lock)
        self.schedule_work_condition = threading.Condition(self.lock)
        self.interrupt_callbacks = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.interrupt_hard()

    def interrupt_hard_async(self):
        """
        Hard interrupt without waiting
        """
        Thread(target=self.interrupt_hard).start()

    def interrupt_hard(self):
        """
        Hard interrupt the scheduler:
        - All not-yet-running tasks (interruptible AND non-interruptible) are interrupted and new ones are rejected
        - Wait for running tasks to complete
        """
        with self.lock:
            if self.hard_interrupted:
                return

            logger.info("Scheduler has been hard interrupted (shutdown)")

            self.hard_interrupted = True
            self.soft_interrupted = True
            self.schedule_work_condition.notify_all()
            self.wait_for_task_condition.notify_all()

            for task in self.queue:
                task.mark_interrupted(SchedulerHardInterrupted)

            self.queue = []

        for callback in self.interrupt_callbacks:
            callback()

        for worker_thread in self.worker_threads:
            # Force stop workers that might be blocked in start()
            worker_thread.stop_worker_if_pending()

        for worker_thread in self.worker_threads:
            # Wait for all threads to complete
            worker_thread.join()

    def register_interrupt_callback(self, fn):
        self.interrupt_callbacks.append(fn)

    def _start_worker_if_needed(self):
        assert self.lock.locked()

        if self.hard_interrupted:
            return

        desired_nb_of_workers = self._compute_ideal_nb_of_workers()
        current_nb_of_non_dead_workers = sum(
            1 for worker_thread in self.worker_threads if worker_thread.state != WorkerState.DEAD)
        is_new_worker_needed = desired_nb_of_workers > current_nb_of_non_dead_workers

        new_worker_index = len(self.worker_threads)
        can_start_new_worker = new_worker_index < len(self.workers)

        if is_new_worker_needed and can_start_new_worker:
            worker_thread = WorkerThread(self.workers[new_worker_index], self)
            worker_thread.start()
            self.worker_threads.append(worker_thread)
            self.schedule_work_condition.notify_all()

    def _check_if_all_workers_dead(self):
        """
        If all started workers died and there is no other worker remaining, we'll never be able to schedule
        anything anymore and we must hard interrupt the scheduler
        """
        assert self.lock.locked()

        can_start_new_worker = len(self.worker_threads) < len(self.workers)
        all_worker_threads_dead = all(worker_thread.state == WorkerState.DEAD for worker_thread in self.worker_threads)

        if not can_start_new_worker and all_worker_threads_dead:
            logger.error("All workers are dead, interrupt the scheduler")
            self.interrupt_hard_async()

    def _compute_max_queue_size(self):
        """
        Max queue size is used to determine whether schedule_work() should block or not

        It is currently set as the nb. of immediately available workers (READY) + nb. of workers that
        could be/are being started (PENDING)
        """
        assert self.lock.locked()

        current_nb_of_available_workers = \
            sum(1 for worker_thread in self.worker_threads
                if worker_thread.state in (WorkerState.READY, WorkerState.PENDING))

        return current_nb_of_available_workers

    def _compute_ideal_nb_of_workers(self):
        """
        Compute the ideal nb. of workers which should be started.

        Good value is the nb. of "currently waiting tasks":
        - Waiting in queue
        - Waiting for being enqueued
        - Being executed

        Note that starting more workers than "waiting tasks" would be a waste of resources
        """
        assert self.lock.locked()

        return self.nb_blocked_tasks + len(self.queue) + sum(
            1 for worker_thread in self.worker_threads if worker_thread.state == WorkerState.BUSY)

    def schedule_work(self, is_soft_interruptible, *work_args):
        """
        Schedule call to "context.execute_work(*work_args)" on a worker and returns a future representing the result

        The task is interruptible by interrupt_soft() only if 'is_soft_interruptible' is True
        """
        with self.lock:
            self.nb_blocked_tasks += 1
            try:
                while True:
                    # Reject the task if the scheduler is interrupted
                    if self.hard_interrupted:
                        return CheapFuture.from_exception(SchedulerHardInterrupted)
                    if is_soft_interruptible and self.soft_interrupted:
                        return CheapFuture.from_exception(SchedulerSoftInterrupted)

                    # We may need to start a new worker to execute this task
                    self._start_worker_if_needed()

                    # Make sure not all workers are dead
                    self._check_if_all_workers_dead()

                    # Enqueue task if queue isn't full
                    if len(self.queue) < self._compute_max_queue_size():
                        task = Task(is_soft_interruptible, work_args)
                        self.queue.append(task)
                        self.wait_for_task_condition.notify_all()
                        return task.future

                    # Wait until a worker becomes available
                    self.schedule_work_condition.wait()
            finally:
                self.nb_blocked_tasks -= 1

    def interrupt_soft(self):
        """
        Partially interrupt the scheduler:
        - Not-yet-running interruptible tasks are interrupted and new ones are rejected
        - Non-interruptible tasks are processed as usual
        - Wait for running tasks to complete
        """

        with self.lock:
            if self.soft_interrupted or self.hard_interrupted:
                return

            logger.info("Scheduler has been soft interrupted")
            self.soft_interrupted = True
            self.schedule_work_condition.notify_all()

            new_queue = []
            for task in self.queue:
                if task.is_soft_interruptible:
                    task.mark_interrupted(SchedulerSoftInterrupted)
                else:
                    new_queue.append(task)
            self.queue = new_queue

    def get_workers_count(self):
        with self.lock:
            return len(self.workers)
