# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NoDataError


class Variance(UnivariateComputation):
    TYPE = "variance"

    @staticmethod
    def build(params):
        return Variance(params['column'])

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            # Variance of nothing does not make sense
            raise NoDataError()
        elif len(series) == 1:
            # The unbiased variance estimator is not defined when N=1 (since it divides by (N-1))
            # Per convention, the variance is set to 0 when there is only one element.
            var = 0.0
        else:
            var = np.var(series, ddof=1)

        return {"type": self.TYPE, "value": var}
