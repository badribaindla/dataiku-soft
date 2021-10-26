# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps

from dataiku.eda.computations.computation import BivariateComputation
from dataiku.eda.exceptions import NoDataError


class KendallTau(BivariateComputation):
    TYPE = "kendall_tau"

    @staticmethod
    def build(params):
        return KendallTau(params['xColumn'], params['yColumn'])

    def apply(self, idf, ctx):
        # TODO: factor out
        idf_no_missing = idf[np.isfinite(idf.float_col(self.x_column)) & np.isfinite(idf.float_col(self.y_column))]

        if len(idf_no_missing) == 0:
            raise NoDataError()

        x_series = idf_no_missing.float_col(self.x_column)
        y_series = idf_no_missing.float_col(self.y_column)

        correlation, pvalue = sps.kendalltau(x_series, y_series)

        return {
            "type": self.TYPE,
            "correlation": correlation,
            "pvalue": pvalue
        }
