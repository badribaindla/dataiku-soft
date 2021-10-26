# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution
from dataiku.eda.exceptions import DegenerateCaseError


class Exponential(Distribution):
    TYPE = "exponential"

    @staticmethod
    def build(params):
        return Exponential()

    def fit(self, series):
        if series.min() < 0:
            raise DegenerateCaseError("Cannot fit exponential distribution: values outside [0, ∞)")

        _, scale = sps.expon.fit(series, floc=0)

        # TODO: what is scale is very small?
        return FittedExponential(1.0 / scale)


class FittedExponential(FittedContinuousDistribution):
    TYPE = Exponential.TYPE

    def __init__(self, rate):
        # Common parametrization
        self.rate = rate

        # Scipy parametrization
        self.scale = 1.0 / rate

    def nb_parameters(self):
        return 1

    def nnlf(self, series):
        return sps.expon.nnlf([0, self.scale], series)

    def ppf(self, x):
        return sps.expon.ppf(x, 0, self.scale)

    def pdf(self, x):
        return sps.expon.pdf(x, 0, self.scale)

    def cdf(self, x):
        return sps.expon.cdf(x, 0, self.scale)

    def serialize(self):
        return {"type": self.TYPE, "rate": 1.0 / self.scale}

    @staticmethod
    def build(params):
        return FittedExponential(params["rate"])
