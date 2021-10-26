# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NotEnoughDataError


class ZTest1Samp(UnivariateComputation):
    TYPE = "ztest_1samp"

    def __init__(self, column, hypothesized_mean, known_std_dev):
        super(ZTest1Samp, self).__init__(column)
        self.hypothesized_mean = hypothesized_mean
        self.known_std_dev = known_std_dev

    @staticmethod
    def build(params):
        return ZTest1Samp(
            params['column'],
            params['hypothesizedMean'],
            params['knownStdDev']
        )

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) < 1:
            raise NotEnoughDataError("Z-test requires at least one value")

        zstatistic = np.sqrt(len(series)) * (series.mean() - self.hypothesized_mean) / self.known_std_dev

        # H1: true mean > hypothesized mean
        pvalue_alt_gt = sps.norm.sf(zstatistic)

        # H1: true mean < hypothesized mean
        pvalue_alt_lt = sps.norm.cdf(zstatistic)

        # H1: true mean != hypothesized mean
        pvalue = sps.norm.sf(np.abs(zstatistic)) * 2

        return {
            "type": self.TYPE,
            "statistic": zstatistic,
            "pvalue": pvalue,
            "pvalueAltGt": pvalue_alt_gt,
            "pvalueAltLt": pvalue_alt_lt
        }
