# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NoDataError


class Min(UnivariateComputation):
    TYPE = "min"

    @staticmethod
    def build(params):
        return Min(params['column'])

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()

        return {"type": Min.TYPE, "value": np.min(series)}
