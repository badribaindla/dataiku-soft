import pandas as pd
import numpy as np

from dataiku.base.utils import safe_unicode_str


class MLAssertions(object):

    def __init__(self):
        self.assertions = []

    def add_assertion(self, assertion):
        self.assertions.append(assertion)

    def __len__(self):
        return len(self.assertions)

    def __getitem__(self, item):
        """
        :return: assertion
        :rtype: MLAssertion
        """
        return self.assertions[item]

    def __iter__(self):
        return iter(self.assertions)

    def printable_names(self):
        return u"[{}]".format(", ".join([safe_unicode_str(assertion.name) for assertion in self.assertions]))

    @staticmethod
    def concatenate_assertions_list(ml_assertions_list):
        """
        Concatenate list of MlAssertions, assuming that each MlAssertions has the same assertions. This allows to
        aggregate batches of assertions metrics into a global assertions metrics.

        Existing use-case: Evaluation recipe on a partitioned model in PARTITIONED_DISPATCH mode, metrics are
                           first computed per partition, then aggregated to compute metrics on all the data

        Example:
            concatenating the following ml_assertions:
              [{"name": "assertion1", "params": {...}, "nb_initial_rows": 3, mask: [0, 1, 0]},
               {"name": "assertion2", "params": {...}, "nb_initial_rows": 4, mask: [1, 0, 1, 0]]

              [{"name": "assertion1", "params": {...}, "nb_initial_rows": 2, mask: [1, 1]},
               {"name": "assertion2", "params": {...}, "nb_initial_rows": 3, mask: [1, 1, 0]}]

            will yield the ml_assertions:
              [{"name": "assertion1", "params": {...}, "nb_initial_rows": 5, mask: [0, 1, 0, 1, 1]},
               {"name": "assertion2", "params": {...}, "nb_initial_rows": 7, mask: [1, 0, 1, 0, 1, 1, 0]}]

        :param ml_assertions_list: list of MlAssertions
        :type ml_assertions_list: list(MLAssertions)
        :return: concatenated MLAssertions
        :rtype: MLAssertions
        """
        if not ml_assertions_list:
            return None

        if len(ml_assertions_list) == 1:
            return ml_assertions_list[0]

        ml_assertions = MLAssertions()
        for index, ml_assertion in enumerate(ml_assertions_list[0]):
            assertion_params = ml_assertion.params
            mask_list = []
            nb_initial_rows = 0
            for ml_assertions_item in ml_assertions_list:
                mask_list.append(ml_assertions_item[index].mask)
                nb_initial_rows += ml_assertions_item[index].nb_initial_rows
            new_assertion = MLAssertion(assertion_params, nb_initial_rows)
            new_assertion.mask = pd.concat(mask_list)
            ml_assertions.add_assertion(new_assertion)
        return ml_assertions


class MLAssertion(object):

    ML_ASSERTION_MASK_PREFIX = "__dku__ml_assertion_mask_"

    def __init__(self, params, nb_intial_rows):

        self.params = params
        self.nb_initial_rows = nb_intial_rows
        self.mask = None

    @property
    def name(self):
        return self.params["name"]

    @staticmethod
    def assertion_col_name(assertion_params):
        return u"{}{}".format(MLAssertion.ML_ASSERTION_MASK_PREFIX, safe_unicode_str(assertion_params["name"]))


class MLAssertionMetrics(object):
    """
    Metrics that correspond to the result of the computation of one assertion
    """

    def __init__(self, result, nb_matching_rows, nb_dropped_rows, valid_ratio, name):
        """
        :param result: result of the assertion
        :type result: bool|None
        :param nb_matching_rows: number of rows matched by the assertion filter
        :type nb_matching_rows: int
        :param nb_dropped_rows: number of rows dropped by the preprocessing
        :type nb_dropped_rows: int
        :param valid_ratio: valid ratio
        :type valid_ratio: float|None
        :param name: name of the assertion
        :type name: str
        """

        self.result = result
        self.nb_matching_rows = nb_matching_rows
        self.nb_dropped_rows = nb_dropped_rows
        self.valid_ratio = valid_ratio
        self.name = name

    def to_dict(self, with_name=True):
        res = {
            "result": self.result,
            "validRatio": self.valid_ratio,
            "nbMatchingRows": self.nb_matching_rows,
            "nbDroppedRows": self.nb_dropped_rows
        }

        if with_name:
            res["name"] = self.name

        return res


class MLAssertionsMetrics(object):
    """
    Collection of MLAssertionMetrics. It is used to hold the assertion's metrics of all assertions of one training
    """

    def __init__(self):
        self._assertions_metrics = []

    def add_assertion_metrics(self, assertion_metrics):
        """
        :param assertion_metrics: new assertion metrics
        :type assertion_metrics: MLAssertionMetrics
        """
        self._assertions_metrics.append(assertion_metrics)

    def __len__(self):
        return len(self._assertions_metrics)

    def __getitem__(self, item):
        """
        :return: assertion
        :rtype: MLAssertion
        """
        return self._assertions_metrics[item]

    def __iter__(self):
        return iter(self._assertions_metrics)

    @property
    def passing_assertions_ratio(self):
        not_none_results = [ar.result for ar in self._assertions_metrics if ar.result is not None]

        if len(not_none_results) == 0:
            return None

        return np.mean(not_none_results)

    def to_dict(self):
        return {
            "passingAssertionsRatio": self.passing_assertions_ratio,
            "perAssertion": [r.to_dict() for r in self._assertions_metrics]
        }
