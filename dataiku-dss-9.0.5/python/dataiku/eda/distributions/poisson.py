# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedDiscreteDistribution
from dataiku.eda.preconditions import assert_only_integers


class Poisson(Distribution):
    TYPE = "poisson"

    @staticmethod
    def build(params):
        return Poisson()

    def fit(self, series):
        assert_only_integers(series)

        # MLE of 'lambda' is the sample mean
        lbda = series.mean()
        return FittedPoisson(lbda)


class FittedPoisson(FittedDiscreteDistribution):
    TYPE = Poisson.TYPE

    def __init__(self, lbda):
        self.lbda = lbda

    def nb_parameters(self):
        return 1

    def nnlf(self, series):
        return -sps.poisson.logpmf(series, self.lbda).sum()

    def ppf(self, x):
        return sps.poisson.ppf(x, self.lbda)

    def pmf(self, x):
        return sps.poisson.pmf(x, self.lbda)

    def cdf(self, x):
        return sps.poisson.cdf(x, self.lbda)

    def serialize(self):
        return {"type": self.TYPE, "lambda": self.lbda}

    @staticmethod
    def build(params):
        return FittedPoisson(params["lambda"])
