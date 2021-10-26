# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import GroupsAreNotDisjoint
from dataiku.eda.exceptions import NotEnoughDataError
from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.stats.multitest import multitest_correction


# Pairwise unpaired t-test
class PairwiseTTest(UnivariateComputation):
    TYPE = "pairwise_ttest"

    def __init__(self, column, grouping, adjustment_method):
        super(PairwiseTTest, self).__init__(column)
        self.grouping = grouping
        self.adjustment_method = adjustment_method

    @staticmethod
    def build(params):
        return PairwiseTTest(
            params['column'],
            Grouping.build(params["grouping"]),
            params['adjustmentMethod']
        )

    @staticmethod
    def _pooled_sd(samples):
        # Pooled standard deviation
        samples_vars = [np.var(sample, ddof=1) for sample in samples]
        sum_of_weighted_vars = sum((len(sample) - 1) * var for sample, var in zip(samples, samples_vars))
        total_dof = sum(len(sample) for sample in samples) - len(samples)
        return np.sqrt(sum_of_weighted_vars / total_dof), total_dof

    @staticmethod
    def _ttest_impl(pooled_sd, dof, series1, series2):
        mean_dif = np.mean(series1) - np.mean(series2)
        se_dif = pooled_sd * np.sqrt(1.0 / len(series1) + 1.0 / len(series2))
        statistic = np.divide(mean_dif, se_dif)
        pvalue = sps.t.sf(np.abs(statistic), dof) * 2
        return statistic, pvalue

    def apply(self, idf, ctx):
        idf_no_missing = idf[np.isfinite(idf.float_col(self.column))]
        grouped_idfs = list(self.grouping.compute_groups(idf_no_missing).iter_groups())

        if len(grouped_idfs) < 2:
            raise NotEnoughDataError("At least two groups are required for pairwise tests")

        samples = [group_idf.float_col(self.column) for group_idf in grouped_idfs]
        pooled_sd, dof = self._pooled_sd(samples)

        pvalues = []
        statistics = []

        for i, idf_i in enumerate(grouped_idfs):
            for j, idf_j in enumerate(grouped_idfs):
                if i >= j:
                    continue

                if len(idf_i & idf_j) > 0:
                    # We should never end up here, this is likely a programming mistake from the caller of EDA compute
                    raise GroupsAreNotDisjoint()

                statistic, pvalue = self._ttest_impl(pooled_sd, dof, samples[i], samples[j])

                pvalues.append(pvalue)
                statistics.append(statistic)

        pvalues = multitest_correction(pvalues, self.adjustment_method)

        return {
            "type": self.TYPE,
            "statistics": statistics,
            "pvalues": list(pvalues)
        }
