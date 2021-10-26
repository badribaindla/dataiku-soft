# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NoDataError


class Kurtosis(UnivariateComputation):
    TYPE = "kurtosis"

    @staticmethod
    def build(params):
        return Kurtosis(params['column'])

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()

        return {"type": self.TYPE, "value": sps.kurtosis(series, bias=False, fisher=True)}
