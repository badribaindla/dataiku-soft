# coding: utf-8
from __future__ import unicode_literals

import sklearn.metrics as skm

from dataiku.eda.computations.computation import BivariateComputation
from dataiku.eda.exceptions import NoDataError


# TODO: make it clear that it computes a normalized mutual info ([0,1])
class MutualInformation(BivariateComputation):
    TYPE = "mutual_information"

    @staticmethod
    def build(params):
        return MutualInformation(params['xColumn'], params['yColumn'])

    def apply(self, idf, ctx):
        if len(idf) == 0:
            raise NoDataError()

        x_series = idf.text_col(self.x_column)
        y_series = idf.text_col(self.y_column)

        value = skm.normalized_mutual_info_score(x_series, y_series, average_method='arithmetic')

        return {
            "type": self.TYPE,
            "value": value
        }
