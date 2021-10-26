import logging
import os
import threading

from dataiku.core import dkujson
from dataiku.doctor.utils import unix_time_millis

logger = logging.getLogger(__name__)


class AbstractResultStore(object):
    def append_split_results(self, new_points):
        """
        Persist multiple results of the evaluation of one hyper parameter on individual splits
        """
        raise NotImplementedError

    def find_split_result(self, split_id, parameters):
        """
        Lookup the result of the evaluation of one hyper parameter on one split

        This is used to skip already computed points when the search is paused/resumed
        """
        raise NotImplementedError

    def init_result_file(self, n_candidates, real_nthreads, n_splits, evaluation_metric, timeout):
        raise NotImplementedError

    def append_aggregated_result(self, aggregated_result):
        """
        Persist the aggregated result of the evaluation of one hyper parameter on all splits
        """
        raise NotImplementedError

    def update_final_grid_size(self):
        """
        Update the 'gridSize' to match the actual number of explored points
        """
        raise NotImplementedError


class OnDiskResultStore(AbstractResultStore):
    """
    Handle persistence of intermediate & aggregated search results
    - Per-split results are stored in "grid_search_done_py.json"
    - Aggregated results are stored in "grid_search_scores.json"

    This class is thread safe and allows multiple search workers to use it at the same time
    """

    PER_SPLIT_RESULTS_FILENAME = 'grid_search_done_py.json'
    AGGREGATED_RESULTS_FILENAME = 'grid_search_scores.json'

    def __init__(self, m_folder):
        self._m_folder = m_folder
        self._lock = threading.Lock()
        self._cache = {}

    def read_cached(self, filepath):
        if filepath not in self._cache:
            self._cache[filepath] = dkujson.load_from_filepath(filepath)
        return self._cache[filepath]

    def write_cached(self, filepath, data):
        tmp_filepath = "%s.tmp" % filepath
        dkujson.dump_to_filepath(tmp_filepath, data)
        os.rename(tmp_filepath, filepath)
        self._cache[filepath] = data

    def append_split_results(self, new_points):
        with self._lock:
            points = self._get_per_split_results()
            for new_point in new_points:
                # Do not insert a result if it's already inserted (during resume)
                if not any((point.get('split_id') == new_point['split_id']
                            and point["parameters"] == new_point["parameters"]) for point in points):
                    points.append(new_point)
            self._write_per_split_results(points)

    def find_split_result(self, split_id, parameters):
        with self._lock:
            for point in self._get_per_split_results():
                # Note: 'split_id' isn't mandatory because it was not present in older DSS version
                #        and we don't want to break the 'resume' feature
                if point.get('split_id') == split_id and point["parameters"] == parameters:
                    return point
            return None

    def init_result_file(self, n_candidates, real_nthreads, n_splits, evaluation_metric, timeout):
        with self._lock:
            file_path = os.path.join(self._m_folder, OnDiskResultStore.AGGREGATED_RESULTS_FILENAME)
            if os.path.exists(file_path):
                # Already initialized, meaning search is being resumed => do nothing
                return

            self.write_cached(file_path, {
                'startedAt': unix_time_millis(),
                'gridSize': n_candidates,
                'nThreads': real_nthreads,
                'nSplits': n_splits,
                'metric': evaluation_metric,
                'timeout': timeout,
                'gridPoints': []
            })

    def update_final_grid_size(self):
        """
        It is possible to explore less points than initially planned in some cases (eg. when strategy generates duplicates)
        This method update the 'gridSize' value to match the actual number of (deduplicated) explored points
        """
        with self._lock:
            file_path = os.path.join(self._m_folder, OnDiskResultStore.AGGREGATED_RESULTS_FILENAME)
            data = self.read_cached(file_path)
            data["gridSize"] = len(data["gridPoints"])
            self.write_cached(file_path, data)

    def append_aggregated_result(self, aggregated_result):
        """
        Persist the aggregated result of the evaluation of one hyper parameter on all splits
        """
        with self._lock:
            file_path = os.path.join(self._m_folder, OnDiskResultStore.AGGREGATED_RESULTS_FILENAME)
            if not os.path.exists(file_path):
                raise Exception("File %s does not exist" % file_path)
            scores = self.read_cached(file_path)

            for existing_result in scores['gridPoints']:
                if existing_result['parameters'] == aggregated_result['parameters']:
                    # Already inserted
                    return

            scores["gridPoints"].append(aggregated_result)
            self.write_cached(file_path, scores)

    def _write_per_split_results(self, points):
        file_path = os.path.join(self._m_folder, OnDiskResultStore.PER_SPLIT_RESULTS_FILENAME)
        self.write_cached(file_path, points)

    def _get_per_split_results(self):
        file_path = os.path.join(self._m_folder, OnDiskResultStore.PER_SPLIT_RESULTS_FILENAME)
        if not os.path.exists(file_path):
            return []
        return self.read_cached(file_path)


class NoopResultStore(AbstractResultStore):
    """
    Fake result store which doesn't persist results on-disk
    """

    def append_split_results(self, new_points):
        # - In theory, we should keep the points in memory so that they can be retrieved by find_split_result()
        # - In practice this is not strictly necessary at the moment, because find_split_result() is useful
        #   only when HP search is resumed
        pass

    def find_split_result(self, split_id, parameters):
        return None

    def init_result_file(self, n_candidates, real_nthreads, n_splits, evaluation_metric, timeout):
        pass

    def append_aggregated_result(self, aggregated_result):
        pass

    def update_final_grid_size(self):
        pass
