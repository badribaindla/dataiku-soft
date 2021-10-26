# coding: utf-8
from __future__ import unicode_literals

from statsmodels.stats.weightstats import DescrStatsW

from dataiku.doctor.utils import dku_nonaninf
from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NoDataError


class Mean(UnivariateComputation):
    TYPE = "mean"

    def __init__(self, column, confidence):
        super(Mean, self).__init__(column)
        self.confidence = confidence

    @staticmethod
    def build(params):
        return Mean(params['column'], params.get('confidence'))

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()

        mean = series.mean()
        output = {"type": self.TYPE, "value": mean}
        if self.confidence is not None:
            if len(series) > 1:
                lower, upper = DescrStatsW(series).tconfint_mean(alpha=1 - self.confidence)
            else:
                lower, upper = None, None
            output["lower"] = dku_nonaninf(lower)
            output["upper"] = dku_nonaninf(upper)

        return output
