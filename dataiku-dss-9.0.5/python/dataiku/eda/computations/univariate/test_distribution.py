# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.distributions.distribution import FittedDistribution
from dataiku.eda.exceptions import NoDataError


class TestDistribution(UnivariateComputation):
    TYPE = "test_distribution"

    def __init__(self, column, distribution):
        super(TestDistribution, self).__init__(column)
        self.distribution = distribution

    @staticmethod
    def build(params):
        return TestDistribution(params['column'], FittedDistribution.build(params['distribution']))

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()

        output = {
            "type": self.TYPE,
            "test": self.distribution.test(series),
            "plot": self.distribution.plot(series)
        }

        return output
