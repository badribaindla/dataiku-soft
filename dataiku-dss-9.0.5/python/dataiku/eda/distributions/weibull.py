# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution
from dataiku.eda.exceptions import DegenerateCaseError


class Weibull(Distribution):
    TYPE = "weibull"
    A = 1
    LOC = 0

    @staticmethod
    def build(params):
        return Weibull()

    def fit(self, series):
        if series.min() < 0:
            raise DegenerateCaseError("Cannot fit Weibull distribution values outside [0,  ∞)")
        _, shape, _, scale = sps.exponweib.fit(series, floc=Weibull.LOC, fa=Weibull.A)
        return FittedWeibull(shape, scale)


class FittedWeibull(FittedContinuousDistribution):
    TYPE = Weibull.TYPE

    def __init__(self, shape, scale):
        self.shape = shape
        self.scale = scale

    def nnlf(self, series):
        return sps.exponweib.nnlf([Weibull.A, self.shape, Weibull.LOC, self.scale], series)

    def nb_parameters(self):
        return 2

    def ppf(self, q):
        return sps.exponweib.ppf(q, Weibull.A, self.shape, scale=self.scale)

    def pdf(self, x):
        return sps.exponweib.pdf(x, Weibull.A, self.shape, scale=self.scale)

    def cdf(self, x):
        return sps.exponweib.cdf(x, Weibull.A, self.shape, scale=self.scale)

    def serialize(self):
        return {"type": self.TYPE, "shape": self.shape, "scale": self.scale}

    @staticmethod
    def build(params):
        return FittedWeibull(params["shape"], params["scale"])
