# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats.mstats as spsm

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NoDataError


class EmpiricalCDF(UnivariateComputation):
    NB_SAMPLED_POINTS = 50

    TYPE = "empirical_cdf"

    @staticmethod
    def build(params):
        return EmpiricalCDF(params['column'])

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()

        # Sample the empirical CDF (otherwise it can be as big as the data if all values are unique)
        sample_idxs = np.unique(np.cast[np.int](np.linspace(0, len(series) - 1, EmpiricalCDF.NB_SAMPLED_POINTS)))
        x = series[sample_idxs]
        y = spsm.plotting_positions(series, alpha=0, beta=1)[sample_idxs]

        # Set CDF(min) = 0 & CDF(max) = 1 to create a beautiful plot
        y = np.concatenate((y, [0, 1]))
        x = np.concatenate((x, [np.min(series), np.max(series)]))

        # Sort the result
        sorted_idxs = np.lexsort((y, x))
        return {"type": self.TYPE, "xvals": list(x[sorted_idxs]), "probs": list(y[sorted_idxs])}
