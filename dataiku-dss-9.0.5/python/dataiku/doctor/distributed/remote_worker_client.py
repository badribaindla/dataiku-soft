# coding: utf-8
import logging
import threading

import six
import time
from collections import defaultdict
from enum import Enum

from dataiku import jek_or_backend_json_call
from dataiku.base.socket_block_link import SocketBlockLinkClient
from dataiku.base.utils import safe_unicode_str
from dataiku.base.utils import duration_HHMMSS
from dataiku.core.intercom import jek_or_backend_void_call
from dataiku.doctor.distributed.work_scheduler import AbstractWorker
from dataiku.doctor.distributed.work_scheduler import AtomicCounter
from dataiku.doctor.distributed.work_scheduler import WorkerFailure
from dataiku.doctor.diagnostics import diagnostics

logger = logging.getLogger(__name__)


class WorkersStartupMonitor(object):

    DIAGNOSTIC_ID_FAILED_START = "ML_DIAGNOSTICS_RUNTIME--FAILED_REMOTE_WORKER_START"
    DIAGNOSTIC_ID_SLOW_START_PENDING = "ML_DIAGNOSTICS_RUNTIME--SLOW_REMOTE_WORKER_START_PENDING"
    DIAGNOSTIC_ID_SLOW_START_READY = "ML_DIAGNOSTICS_RUNTIME--SLOW_REMOTE_WORKER_START_READY"

    # When the worker takes longer than this time (in seconds) to start, an ML diagnostic is shown
    ML_DIAGNOSTIC_STARTING_TIME_THRESHOLD = 2 * 60

    def __init__(self):
        self.workers_startup = {}
        self._lock = threading.Lock()  # To make sure diagnostic updates are performed synchronously
        self._suspended = False

    def suspend(self):
        """Suspend monitor updates, mainly when the scheduler is hard interrupted"""
        self._suspended = True

    def on_status_update(self, worker_id, status):
        """
        Update workers startup data, and add/update diagnostic if slow or failed
        :param worker_id: RemoteWorkerClient.worker_id
        :param status: RemoteWorkerStatus
        """

        if self._suspended:
            return

        with self._lock:
            # Initialize worker startup if not already watched
            if worker_id not in self.workers_startup:
                self.workers_startup[worker_id] = {
                    "initial_time": time.time(),
                    "time_to_start": 0,
                    "slow": False,
                    "worker_status": status,
                }

            worker_startup = self.workers_startup[worker_id]

            # Update status
            worker_startup["worker_status"] = status

            if status == RemoteWorkerStatus.PENDING:
                # If PENDING only update diagnostics when time to start is higher than a given threshold
                worker_startup["time_to_start"] = time.time() - worker_startup["initial_time"]
                if (
                        not worker_startup["slow"]  # Only add/update the diagnostic once
                        and worker_startup["time_to_start"] >= self.ML_DIAGNOSTIC_STARTING_TIME_THRESHOLD
                ):
                    worker_startup["slow"] = True
                    self._update_diagnostics()
            elif status == RemoteWorkerStatus.READY and worker_startup["slow"]:
                # If READY only update diagnostics if slow to start
                self._update_diagnostics()
            elif status == RemoteWorkerStatus.DEAD:
                # Always update diagnostics if DEAD
                self._update_diagnostics()

    def _update_diagnostics(self):
        self._update_failed_diagnostics()
        self._update_slow_pending_diagnostics()
        self._update_slow_ready_diagnostics()

    def _update_failed_diagnostics(self):
        """Show the number of failed workers"""
        n_failed_workers = sum(
            1 for worker_startup in self.workers_startup.values()
            if worker_startup["worker_status"] == RemoteWorkerStatus.DEAD
        )
        if n_failed_workers:
            diagnostics.add_or_update(
                diagnostics.DiagnosticType.ML_DIAGNOSTICS_RUNTIME,
                "{} remote worker{} failed to start".format(n_failed_workers, "s" if n_failed_workers > 1 else ""),
                diagnostic_id=self.DIAGNOSTIC_ID_FAILED_START,
            )

    def _update_slow_pending_diagnostics(self):
        """Show the number of slow workers that are still pending"""
        n_slow_workers_pending = sum(
            1 for worker_startup in self.workers_startup.values()
            if worker_startup["worker_status"] == RemoteWorkerStatus.PENDING and worker_startup["slow"]
        )
        if n_slow_workers_pending:
            diagnostics.add_or_update(
                diagnostics.DiagnosticType.ML_DIAGNOSTICS_RUNTIME,
                "{} remote worker{} taking a long time to start".format(
                    n_slow_workers_pending,
                    "s are" if n_slow_workers_pending > 1 else " is",
                ),
                diagnostic_id=self.DIAGNOSTIC_ID_SLOW_START_PENDING,
            )
        else:
            diagnostics.delete(self.DIAGNOSTIC_ID_SLOW_START_PENDING)

    def _update_slow_ready_diagnostics(self):
        """Show the number of ready workers that were slow to start (with min time)"""
        times_to_start = [
            worker_startup["time_to_start"]
            for worker_startup in self.workers_startup.values()
            if worker_startup["worker_status"] == RemoteWorkerStatus.READY and worker_startup["slow"]
        ]
        if times_to_start:
            diagnostics.add_or_update(
                diagnostics.DiagnosticType.ML_DIAGNOSTICS_RUNTIME,
                "{} remote worker{} took more than {} to start".format(
                    len(times_to_start),
                    "s" if len(times_to_start) > 1 else "",
                    duration_HHMMSS(min(times_to_start))
                ),
                diagnostic_id=self.DIAGNOSTIC_ID_SLOW_START_READY,
            )


class AbstractRemoteWorkerManagementAPI(object):
    """
    Remote worker management API (mockable)
    """

    def request_worker(self, worker_pool_id, worker_id):
        raise NotImplementedError

    def release_worker(self, worker_pool_id, worker_id):
        raise NotImplementedError


class RemoteWorkerManagementAPI(AbstractRemoteWorkerManagementAPI):
    """
    Remote worker management API (provided by DSS or JEK)
    """

    def request_worker(self, worker_pool_id, worker_id):
        return jek_or_backend_json_call("ml/distributed/request-worker", data={
            "workerPoolId": worker_pool_id,
            "workerId": worker_id
        })

    def release_worker(self, worker_pool_id, worker_id):
        jek_or_backend_void_call("ml/distributed/release-worker", data={
            "workerPoolId": worker_pool_id,
            "workerId": worker_id
        })


class RemoteWorkerStatus(Enum):
    """
    Status of the remote container kernel, corresponding to the Java-side 'RemoteWorkerStatus' enum)

    It has nothing to do with Python-side 'WorkerState' enum
    """
    # Container is starting
    PENDING = 0
    # Container is ready and is waiting for the master to connect
    READY = 1
    # Container is dead: failed or stopped
    DEAD = 2


class RemoteWorkerClient(AbstractWorker):
    """
    Worker executing work remotely

    See RemoteWorkerServer for more details about master<-> worker communication protocol
    """

    # Client polls DSS/JEK to wait until remote worker is ready
    POLLING_PERIOD_IN_SECONDS = 5

    worker_counter = AtomicCounter()

    def __init__(self, worker_pool_id, monitor, worker_management_api=RemoteWorkerManagementAPI()):
        super(RemoteWorkerClient, self).__init__()
        self.worker_id = "remote-%s" % self.worker_counter.get_and_increment()

        self._worker_pool_id = worker_pool_id
        self._worker_management_api = worker_management_api

        # Manipulate '_stopped' and '_worker_link' only in critical section
        self._lock = threading.Lock()
        self._stopped = False
        self._worker_link = None

        # Remote Worker Client monitor
        self.monitor = monitor

    def start(self, context):
        """
        Start the remote worker.
        Procedure:
        - Request a new worker through remote worker management API (provided by DSS or JEK)
        - Poll until the worker is started and ready
        - Connect to the worker and send the context
        - Worker is ready to work!
        """
        try:
            logger.info("Starting worker: %s" % self.worker_id)
            logger.info("Requesting new remote worker from pool: %s" % self._worker_pool_id)
            worker_infos = self._request_worker_loop()
            logger.info("Started worker: %s" % self.worker_id)
            logger.info("Connecting to %s:%s..." % (worker_infos["host"], worker_infos["port"]))
            with self._lock:
                if self._stopped:
                    raise WorkerFailure("Worker %s stopped before connection was established" % self.worker_id)
                self._worker_link = SocketBlockLinkClient(worker_infos["host"], worker_infos["port"],
                                                          worker_infos["secret"])
            self._worker_link.connect()
            logger.info("Connected to remote worker. Started streaming context...")
            self._send_object_and_wait_for_response(context)
            logger.info("Context streamed. Remote worker is ready to work")
        except Exception:
            self.monitor.on_status_update(self.worker_id, RemoteWorkerStatus.DEAD)
            logger.exception("Failed to start remote worker")
            self.stop()
            raise

    def execute_work(self, *args):
        """
        Execute work on a remote worker

        (This ends up calling context.execute_work() on the other end)
        """
        return self._send_object_and_wait_for_response(args)

    def _request_worker_loop(self):
        """
        Poll until worker is ready (or fails)
        """
        while True:
            with self._lock:
                if self._stopped:
                    raise WorkerFailure("Worker %s stopped before before it was ready" % self.worker_id)

            worker_infos = self._worker_management_api.request_worker(self._worker_pool_id, self.worker_id)
            status = RemoteWorkerStatus[worker_infos["status"]]
            self.monitor.on_status_update(self.worker_id, status)

            if status == RemoteWorkerStatus.PENDING:
                time.sleep(self.POLLING_PERIOD_IN_SECONDS)

            if status == RemoteWorkerStatus.DEAD:
                raise WorkerFailure("Could not start remote worker %s" % self.worker_id)

            if status == RemoteWorkerStatus.READY:
                return worker_infos

    def _send_object_and_wait_for_response(self, object_to_send):
        """
        Send a payload to the remote worker, wait until it has been processed and return the response
        """
        with self._lock:
            if self._stopped:
                raise WorkerFailure("Remote call failed because worker %s has been stopped" % self.worker_id)

        response = None
        exception_infos = None
        try:
            # Send the function over the wire
            logger.debug("Sending request...")
            bytes_written = self._worker_link.send_pyobject(object_to_send)
            logger.debug("Request sent (%s bytes)" % bytes_written)

            # Read the response
            response, exception_infos = self._worker_link.read_pyobject()
        except Exception as e:
            logger.exception("Worker-level failure occurred")
            # Stop the worker (non recoverable)
            self.stop()

            # Worker-level failures are fatal
            #
            # Examples:
            # - Worker dies/network issue (link disconnected)
            # - stop() is called (cut the link explicitly)
            six.raise_from(WorkerFailure(safe_unicode_str(e)), e)

        if exception_infos is not None:
            # The call failed "cleanly" (remote worker is still ok but the execute_work() raised an exception)
            six.reraise(*exception_infos)

        return response

    def stop(self):
        """
        Kill the remote worker (if it was running) or abandon the starting process (if it wasn't yet)

        Important: stop() may be called at ANY time (before/during/after start(), execute_work() or even stop())

        Stopping procedures relies on:
        1. Check the 'stopped' flag before requesting remote worker to JEK/DSS and before executing work
            => Produce meaningful error messages whenever possible

        2. Notify DSS/JEK to release the worker
            => Release resources (container, kernel, ...)

            Backend is responsible for dealing with potential race conditions (ie. WorkerPool.release() being called
            before/while WorkerPool.acquire() is called)

        3. Cut the link if it has been created
            => Shut down the socket to unblock threads waiting on it

            SocketBlockLinkClient.close() implementation is responsible for that and should be able to deal with
            potential race conditions (ie. close() being called before/while connect() is called) BUT this is not the
            case currently as close() is not thread safe.

            This is kinda acceptable here, because the socket will end up being disconnected on the other end
            shortly after (2)
        """
        try:
            with self._lock:
                if self._stopped:
                    return  # Already stopped

                logger.info("Stopping worker: %s" % self.worker_id)

                # Mark worker as stopped
                # (note: a worker can be stopped before it was even started)
                self._stopped = True

                # Cut the link explicitly if it was already created
                # (note: remote worker kernel commits suicide when connection is lost)
                if self._worker_link:
                    self._worker_link.close()
                    self._worker_link = None

            # Notify DSS we don't need this worker anymore
            # (note: this cancels remote worker kernel creation if it was ongoing)
            self._worker_management_api.release_worker(self._worker_pool_id, self.worker_id)

            logger.info("Stopped worker: %s" % self.worker_id)
        except Exception:
            logger.exception("Error while stopping remote worker")
