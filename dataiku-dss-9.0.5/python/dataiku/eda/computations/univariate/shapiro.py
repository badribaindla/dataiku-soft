# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NotEnoughDataError


class Shapiro(UnivariateComputation):
    TYPE = "shapiro"

    @staticmethod
    def build(params):
        return Shapiro(params['column'])

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) < 3:
            raise NotEnoughDataError("At least three values are required")

        warnings = []
        if len(series) > 5000:
            # Scipy will emit a warning in this case: it is important to bubble it up to the user.
            warnings.append("p-value may not be accurate for N > 5000")

        statistic, pvalue = sps.shapiro(series)

        return {
            "type": self.TYPE,
            "statistic": statistic,
            "pvalue": pvalue,
            "warnings": warnings
        }
