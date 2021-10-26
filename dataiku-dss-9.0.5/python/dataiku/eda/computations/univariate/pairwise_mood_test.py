# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import DegenerateCaseError
from dataiku.eda.exceptions import GroupsAreNotDisjoint
from dataiku.eda.exceptions import NotEnoughDataError
from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.stats.multitest import multitest_correction


# Pairwise unpaired Mood test
class PairwiseMoodTest(UnivariateComputation):
    TYPE = "pairwise_mood_test"

    def __init__(self, column, grouping, adjustment_method):
        super(PairwiseMoodTest, self).__init__(column)
        self.grouping = grouping
        self.adjustment_method = adjustment_method

    @staticmethod
    def build(params):
        return PairwiseMoodTest(
            params['column'],
            Grouping.build(params["grouping"]),
            params['adjustmentMethod']
        )

    def apply(self, idf, ctx):
        idf_no_missing = idf[np.isfinite(idf.float_col(self.column))]
        grouped_idfs = list(self.grouping.compute_groups(idf_no_missing).iter_groups())

        if len(grouped_idfs) < 2:
            raise NotEnoughDataError("At least two groups are required for pairwise tests")

        for group_idf in grouped_idfs:
            if len(group_idf) == 0:
                raise NotEnoughDataError("At least one group is empty")

        samples = [group_idf.float_col(self.column) for group_idf in grouped_idfs]

        pvalues = []
        statistics = []

        for i, idf_i in enumerate(grouped_idfs):
            for j, idf_j in enumerate(grouped_idfs):
                if i >= j:
                    continue

                if len(idf_i & idf_j) > 0:
                    # We should never end up here, this is likely a programming mistake from the caller of EDA compute
                    raise GroupsAreNotDisjoint()

                series_i = samples[i]
                series_j = samples[j]

                # Make sure values are not all equal (degenerate case)
                some_value = series_i[0]
                if np.all(series_i == some_value) and np.all(series_j == some_value):
                    raise DegenerateCaseError("All values are equal for at least one pair of groups")

                statistic, pvalue, _, _ = sps.median_test(series_i, series_j, ties='ignore')

                pvalues.append(pvalue)
                statistics.append(statistic)

        pvalues = multitest_correction(pvalues, self.adjustment_method)

        return {
            "type": self.TYPE,
            "statistics": statistics,
            "pvalues": list(pvalues)
        }
