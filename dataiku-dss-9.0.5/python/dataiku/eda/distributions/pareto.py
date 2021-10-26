# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution


class Pareto(Distribution):
    TYPE = "pareto"

    @staticmethod
    def build(params):
        return Pareto()

    def fit(self, series):
        shape, _, scale = sps.pareto.fit(series, floc=0)
        return FittedPareto(shape, scale)


class FittedPareto(FittedContinuousDistribution):
    TYPE = Pareto.TYPE

    def __init__(self, shape, scale):
        self.shape = shape
        self.scale = scale

    def get_theta(self):
        return [self.shape, 0, self.scale];

    def nb_parameters(self):
        return 2

    def nnlf(self,x):
        return sps.pareto.nnlf(self.get_theta(), x)

    def pdf(self, x):
        return sps.pareto.pdf(x, self.shape, scale=self.scale)

    def cdf(self, x):
        return sps.pareto.cdf(x, self.shape, scale=self.scale)

    def ppf(self, x):
        return sps.pareto.ppf(x, self.shape, scale=self.scale)

    def serialize(self):
        return {"type": FittedPareto.TYPE, "shape": self.shape, "scale": self.scale}

    @staticmethod
    def build(params):
        return FittedPareto(params["shape"], params["scale"])
