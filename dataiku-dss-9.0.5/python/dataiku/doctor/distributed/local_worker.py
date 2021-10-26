# coding: utf-8
import logging

from dataiku.doctor.distributed.work_scheduler import AbstractWorker
from dataiku.doctor.distributed.work_scheduler import AtomicCounter
from dataiku.doctor.distributed.work_scheduler import WorkerFailure

logger = logging.getLogger(__name__)


class LocalWorker(AbstractWorker):
    """
    Worker executing work locally (in a thread of the current process)
    """
    worker_counter = AtomicCounter()

    def __init__(self):
        super(LocalWorker, self).__init__()
        self.worker_id = "local-%s" % self.worker_counter.get_and_increment()
        self._context = None

    def start(self, context):
        logger.info("Starting worker: %s" % self.worker_id)
        self._context = context
        logger.info("Started worker: %s" % self.worker_id)

    def stop(self):
        logger.info("Stopping worker: %s" % self.worker_id)
        self._context = None
        logger.info("Stopped worker: %s" % self.worker_id)

    def execute_work(self, *args):
        if self._context is None:
            raise WorkerFailure('Worker is not running or has been stopped')
        return self._context.execute_work(*args)
