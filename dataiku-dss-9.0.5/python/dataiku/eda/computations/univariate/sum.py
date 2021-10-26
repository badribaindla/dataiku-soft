# coding: utf-8
from __future__ import unicode_literals

from statsmodels.stats.weightstats import DescrStatsW

from dataiku.doctor.utils import dku_nonaninf
from dataiku.eda.computations.computation import UnivariateComputation


class Sum(UnivariateComputation):
    TYPE = "sum"

    def __init__(self, column, confidence):
        super(Sum, self).__init__(column)
        self.confidence = confidence

    @staticmethod
    def build(params):
        return Sum(params['column'], params.get('confidence'))

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        output = {"type": Sum.TYPE, "value": series.sum()}
        if self.confidence is not None:
            lower, upper = DescrStatsW(series).tconfint_mean(alpha=1 - self.confidence)
            output["lower"] = dku_nonaninf(lower * len(series))
            output["upper"] = dku_nonaninf(upper * len(series))
        return output
