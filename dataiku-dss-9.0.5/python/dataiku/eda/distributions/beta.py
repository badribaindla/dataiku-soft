# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution


# TODO: as of now, results are NOT reproducible with another statistical software => continue investigating why???
class Beta(Distribution):
    TYPE = "beta"

    @staticmethod
    def build(params):
        return Beta()

    def fit(self, series):
        alpha, beta, loc, scale = sps.beta.fit(series)
        lower = loc
        upper = loc + scale
        return FittedBeta(alpha, beta, lower, upper)


class FittedBeta(FittedContinuousDistribution):
    TYPE = Beta.TYPE

    def __init__(self, alpha, beta, lower, upper):
        # Common parametrization
        self.beta = beta
        self.alpha = alpha
        self.lower = lower
        self.upper = upper

        # Scipy parametrization
        self.loc = lower
        self.scale = upper - lower

    def nb_parameters(self):
        return 4

    def nnlf(self, x):
        return sps.beta.nnlf((self.alpha, self.beta, self.loc, self.scale), x)

    def ppf(self, x):
        return sps.beta.ppf(x, self.alpha, self.beta, self.loc, self.scale)

    def pdf(self, x):
        return sps.beta.pdf(x, self.alpha, self.beta, self.loc, self.scale)

    def cdf(self, x):
        return sps.beta.cdf(x, self.alpha, self.beta, self.loc, self.scale)

    def serialize(self):
        return {
            "type": self.TYPE,
            "alpha": self.alpha,
            "beta": self.beta,
            "lower": self.lower,
            "upper": self.upper
        }

    @staticmethod
    def build(params):
        return FittedBeta(params["alpha"], params["beta"], params["lower"], params["upper"])
