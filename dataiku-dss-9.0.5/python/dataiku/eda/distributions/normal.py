# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution


class Normal(Distribution):
    TYPE = "normal"

    @staticmethod
    def build(params):
        return Normal()

    def fit(self, series):
        mean, std = sps.norm.fit(series)
        return FittedNormal(mean, std)


class FittedNormal(FittedContinuousDistribution):
    TYPE = Normal.TYPE

    def __init__(self, mean, std):
        self.mean = mean
        self.std = std

    def nb_parameters(self):
        return 2

    def nnlf(self, series):
        return sps.norm.nnlf((self.mean, self.std), series)

    def pdf(self, x):
        return sps.norm.pdf(x, self.mean, self.std)

    def cdf(self, x):
        return sps.norm.cdf(x, self.mean, self.std)

    def ppf(self, x):
        return sps.norm.ppf(x, self.mean, self.std)

    def serialize(self):
        return {"type": self.TYPE, "mean": self.mean, "std": self.std}

    @staticmethod
    def build(params):
        return FittedNormal(params["mean"], params["std"])
