# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution


class Laplace(Distribution):
    TYPE = "laplace"

    @staticmethod
    def build(params):
        return Laplace()

    def fit(self, series):
        mu, b = sps.laplace.fit(series)
        return FittedLaplace(mu, b)


class FittedLaplace(FittedContinuousDistribution):
    TYPE = Laplace.TYPE

    def __init__(self, mu, b):
        self.mu = mu
        self.b = b

    def nb_parameters(self):
        return 2

    def nnlf(self, series):
        return sps.laplace.nnlf((self.mu, self.b), series)

    def pdf(self, x):
        return sps.laplace.pdf(x, self.mu, self.b)

    def cdf(self, x):
        return sps.laplace.cdf(x, self.mu, self.b)

    def ppf(self, x):
        return sps.laplace.ppf(x, self.mu, self.b)

    def serialize(self):
        return {"type": FittedLaplace.TYPE, "mu": self.mu, "b": self.b}

    @staticmethod
    def build(params):
        return FittedLaplace(params["mu"], params["b"])
