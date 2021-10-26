# coding: utf-8
from __future__ import unicode_literals

import numpy as np
from statsmodels.stats.weightstats import DescrStatsW

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NotEnoughDataError


class TTest1Samp(UnivariateComputation):
    TYPE = "ttest_1samp"

    def __init__(self, column, hypothesized_mean):
        super(TTest1Samp, self).__init__(column)
        self.hypothesized_mean = hypothesized_mean

    @staticmethod
    def build(params):
        return TTest1Samp(
            params['column'],
            params['hypothesizedMean']
        )

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) < 2 or np.all(np.equal(series, series[0])):
            raise NotEnoughDataError("T-test requires at least two different values")

        tstatistic, pvalue, dof = DescrStatsW(series).ttest_mean(self.hypothesized_mean, alternative='two-sided')
        _, pvalue_alt_lt, _ = DescrStatsW(series).ttest_mean(self.hypothesized_mean, alternative='smaller')
        _, pvalue_alt_gt, _ = DescrStatsW(series).ttest_mean(self.hypothesized_mean, alternative='larger')

        return {
            "type": self.TYPE,
            "statistic": tstatistic,
            "pvalue": pvalue,
            "dof": dof,
            "pvalueAltGt": pvalue_alt_gt,
            "pvalueAltLt": pvalue_alt_lt
        }
