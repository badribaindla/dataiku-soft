# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NoDataError


class Max(UnivariateComputation):
    TYPE = "max"

    @staticmethod
    def build(params):
        return Max(params['column'])

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()

        return {"type": self.TYPE, "value": np.max(series)}
