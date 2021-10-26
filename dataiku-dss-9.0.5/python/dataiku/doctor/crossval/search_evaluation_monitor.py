import logging
import time

from dataiku.core import intercom
from dataiku.doctor.diagnostics import diagnostics

logger = logging.getLogger(__name__)


class SearchEvaluationMonitor(object):
    """
    Monitors the hyperparameter space exploration.
    It must have backend access to fetch the available distributed container configurations.
    """

    # Threshold time (in seconds) for the hyperparameter search
    HYPERPARAMETER_SEARCH_TIME_THRESHOLD = 10 * 60

    # Threshold number of point exploration tasks (possibly over multiple splits/folds) for the hyperparameter search
    HYPERPARAMETER_SEARCH_NUMBER_OF_COMPLETED_TASKS_THRESHOLD = 10

    def __init__(self, is_distributed):
        self._is_distributed = is_distributed
        self._search_start_time = time.time()
        self._nb_completed_tasks = 0
        self._is_diagnostic_emitted = False

        available_configurations = intercom.jek_or_backend_get_call("ml/available-container-configurations", params={"type": "KUBERNETES"})
        self._is_distribution_available = len(available_configurations) > 0

        if self._is_distribution_available:
            logger.info("The following distributed container configuration(s) are available to run this search: {}".format(available_configurations))
        else:
            logger.info("No distributed container configuration is available to run this search")

    def record_task_completion(self):
        """
        Records the completion of a hyperparameter space point exploration task.
        It will produce a diagnostic about the search being slow if all the following conditions are satisfied:
            - search space exploration can be distributed (eg on Kubernetes)
            - the currently monitored search is not distributed
            - the number of exploration tasks exceeds a given threshold
            - the elapsed search time exceeds a given threshold
        """
        self._nb_completed_tasks += 1

        if self._is_diagnostic_emitted:
            return

        if self._is_distribution_available \
                and not self._is_distributed \
                and self._nb_completed_tasks >= self.HYPERPARAMETER_SEARCH_NUMBER_OF_COMPLETED_TASKS_THRESHOLD \
                and time.time() - self._search_start_time >= self.HYPERPARAMETER_SEARCH_TIME_THRESHOLD:

            diagnostics.add_or_update(
                diagnostics.DiagnosticType.ML_DIAGNOSTICS_RUNTIME,
                "Enable distributed hyperparameter search to reduce training time"
            )

            self._is_diagnostic_emitted = True
