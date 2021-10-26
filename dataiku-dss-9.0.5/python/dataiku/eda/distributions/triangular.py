# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution


class Triangular(Distribution):
    TYPE = "triangular"

    @staticmethod
    def build(params):
        return Triangular()

    def fit(self, series):
        parameters = sps.triang.fit(series)

        # Compute natural parametrization (a, b, c) from Scipy parametrization (c, loc, scale)
        a = parameters[1]
        b = parameters[1] + parameters[0] * parameters[2]
        c = parameters[1] + parameters[2]

        return FittedTriangular(a, b, c)


class FittedTriangular(FittedContinuousDistribution):
    TYPE = Triangular.TYPE

    def __init__(self, a, b, c):
        # Natural parametrization
        self.a = a
        self.b = b
        self.c = c

        # Scipy parametrization
        self.parameters = [(b - a) / (c - a), a, c - a]

    def nnlf(self, series):
        return sps.triang.nnlf(self.parameters, series)

    def nb_parameters(self):
        return 3

    def ppf(self, x):
        return sps.triang.ppf(x, *self.parameters)

    def pdf(self, x):
        return sps.triang.pdf(x, *self.parameters)

    def cdf(self, x):
        return sps.triang.cdf(x, *self.parameters)

    def serialize(self):
        return {"type": self.TYPE, "a": self.a, "b": self.b, "c": self.c}

    @staticmethod
    def build(params):
        return FittedTriangular(params["a"], params["b"], params["c"])
