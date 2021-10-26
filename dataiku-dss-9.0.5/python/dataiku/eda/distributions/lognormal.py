# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution
from dataiku.eda.exceptions import DegenerateCaseError

import numpy as np


class LogNormal(Distribution):
    TYPE = "lognormal"

    LOC = 0

    @staticmethod
    def build(params):
        return LogNormal()

    def fit(self, series):
        if series.min() <= 0:
            raise DegenerateCaseError("Cannot fit lognormal distribution: values outside ]0, ∞)")

        logstd, _, mean = sps.lognorm.fit(series, floc=LogNormal.LOC)

        return FittedLogNormal(logstd, np.log(mean))


class FittedLogNormal(FittedContinuousDistribution):
    TYPE = LogNormal.TYPE

    def __init__(self, logstd, logmean):
        self.logstd = logstd
        self.logmean = logmean
        self.mean = np.exp(logmean)

    def nb_parameters(self):
        return 2

    def nnlf(self, series):
        return sps.lognorm.nnlf([self.logstd, LogNormal.LOC, self.mean], series)

    def ppf(self, x):
        return sps.lognorm.ppf(x, self.logstd, LogNormal.LOC, self.mean)

    def pdf(self, x):
        return sps.lognorm.pdf(x, self.logstd, LogNormal.LOC, self.mean)

    def cdf(self, x):
        return sps.lognorm.cdf(x, self.logstd, LogNormal.LOC, self.mean)

    def serialize(self):
        return {
            "type": self.TYPE,
            "logstd": self.logstd,
            "logmean": self.logmean
        }

    @staticmethod
    def build(params):
        return FittedLogNormal(params["logstd"], params["logmean"])
