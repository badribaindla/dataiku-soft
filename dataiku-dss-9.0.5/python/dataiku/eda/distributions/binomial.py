# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedDiscreteDistribution
from dataiku.eda.preconditions import assert_all_values_less_than_or_equal
from dataiku.eda.preconditions import assert_only_integers


class Binomial(Distribution):
    TYPE = "binomial"

    def __init__(self, n):
        self.n = n

    @staticmethod
    def build(params):
        return Binomial(params["n"])

    def fit(self, series):
        assert_only_integers(series)
        assert_all_values_less_than_or_equal(series, self.n)

        # MLE estimate of p(success) is: (nb. of successes) / (nb. of trials)
        p = np.mean(series) / self.n
        return FittedBinomial(self.n, p)


class FittedBinomial(FittedDiscreteDistribution):
    TYPE = Binomial.TYPE

    def __init__(self, n, p):
        self.n = n
        self.p = p

    def nb_parameters(self):
        return 1  # (n is fixed)

    def ppf(self, x):
        return sps.binom.ppf(x, self.n, self.p)

    def nnlf(self, series):
        return -sps.binom.logpmf(series, self.n, self.p).sum()

    def pmf(self, x):
        return sps.binom.pmf(x, self.n, self.p)

    def cdf(self, x):
        return sps.binom.cdf(x, self.n, self.p)

    def serialize(self):
        return {"type": self.TYPE, "n": self.n, "p": self.p}

    @staticmethod
    def build(params):
        return FittedBinomial(params["n"], params["p"])
