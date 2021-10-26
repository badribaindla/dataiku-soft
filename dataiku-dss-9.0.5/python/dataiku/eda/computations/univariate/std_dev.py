# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NoDataError


class StdDev(UnivariateComputation):
    TYPE = "std_dev"

    @staticmethod
    def build(params):
        return StdDev(params['column'])

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()
        elif len(series) == 1:
            std = 0.0
        else:
            std = np.std(series, ddof=1)

        return {"type": self.TYPE, "value": std}
