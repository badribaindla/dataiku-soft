# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.computations.univariate.test_distribution import TestDistribution
from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.exceptions import NoDataError


class FitDistribution(UnivariateComputation):
    TYPE = "fit_distribution"

    def __init__(self, column, distribution, test):
        super(FitDistribution, self).__init__(column)
        self.distribution = distribution
        self.test = test

    def describe(self):
        return "FitDistribution(%s)" % self.distribution.__class__.__name__

    @staticmethod
    def build(params):
        return FitDistribution(
            params['column'],
            Distribution.build(params['distribution']),
            params['test']
        )

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()

        model = self.distribution.fit(series)
        output = {
            "type": FitDistribution.TYPE,
            "fit": model.serialize()
        }

        if self.test:
            output["test"] = TestDistribution(self.column, model).apply(idf, ctx)

        return output
