# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.computation import MultivariateComputation
from dataiku.eda.filtering.and_filter import AndFilter
from dataiku.eda.filtering.missing_filter import MissingFilter
from dataiku.eda.filtering.not_filter import NotFilter


class FetchValues(MultivariateComputation):
    TYPE = "fetch_values"

    def describe(self):
        return "FetchValues(%s)" % ','.join(self.columns)

    @staticmethod
    def build(params):
        return FetchValues(params['columns'])

    def apply(self, idf, ctx):
        output = {"type": self.TYPE, "series": []}

        # Reject the whole row when at least one value is missing
        filtered_idf = AndFilter([NotFilter(MissingFilter(column)) for column in self.columns]).apply(idf)

        for column in self.columns:
            series = filtered_idf.float_col(column)
            output["series"].append(list(series))

        return output
