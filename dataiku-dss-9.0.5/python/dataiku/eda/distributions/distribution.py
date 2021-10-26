# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps
import scipy.stats.mstats as spsm

from dataiku.doctor.utils import dku_nonaninf
from dataiku.eda.exceptions import DegenerateCaseError
from dataiku.eda.exceptions import NotEnoughDataError
from dataiku.eda.exceptions import UnknownObjectType


class Distribution(object):
    REGISTRY = {}

    @staticmethod
    def build(params):
        try:
            distribution_class = Distribution.REGISTRY[params["type"]]
        except KeyError:
            raise UnknownObjectType("Unknown distribution type: %s" % params.get("type"))
        return distribution_class.build(params)

    @staticmethod
    def define(clazz):
        Distribution.REGISTRY[clazz.TYPE] = clazz

    def fit(self, series):
        raise NotImplementedError


class FittedDistribution(object):
    REGISTRY = {}

    # Negative log-likelihood
    def nnlf(self, series):
        raise NotImplementedError

    def ppf(self, series):
        raise NotImplementedError

    def plot(self, series):
        raise NotImplementedError

    def serialize(self):
        raise NotImplementedError

    def qqplot(self, series, max_quantiles=100):
        n = len(series)

        if n < 2:
            raise NotEnoughDataError("At least 2 values are required to build QQ plot")

        sorted_series = np.sort(series)
        empirical_percentiles = spsm.plotting_positions(sorted_series)

        # Plotting all points on the Q-Q plot can be slow (distribution's ppf() may be slow).
        # In order to keep it fast, regularly sample points from 'sorted_series' such that:
        # - We don't take more than 'max_quantiles'
        # - Min & max are always picked
        sample_idxs = np.unique(
            np.append(np.round(np.arange(0, n - 1, (n - 1.0) / max(1, max_quantiles - 1))).astype(int), n - 1))

        empirical_percentiles_sampled = empirical_percentiles[sample_idxs]
        sorted_series_sampled = sorted_series[sample_idxs]
        theoretical_quantiles_sampled = self.ppf(empirical_percentiles_sampled)

        return {
            "empirical": [float(x) for x in sorted_series_sampled],
            "theoretical": [float(x) for x in theoretical_quantiles_sampled],
            "percentile": [float(x) for x in empirical_percentiles_sampled]
        }

    def likelihood_tests(self, series):
        nnlf = self.nnlf(series)
        k = self.nb_parameters()
        n = len(series)

        # Log-likelihood
        ll = -nnlf

        # Bayesian information criterion
        bic = 2 * nnlf + np.log(n) * k

        # Akaike information criterion
        aic = 2 * nnlf + 2 * k

        # Corrected Akaike information criterion
        aicc = aic + 2 * k * (k - 1) / (n - k - 1)

        # All these indicator are grouped together because they're all based on log-likelihood
        return {"ll": dku_nonaninf(ll), "bic": dku_nonaninf(bic), "aic": dku_nonaninf(aic), "aicc": dku_nonaninf(aicc)}

    def test(self, series):
        raise NotImplementedError

    def nb_parameters(self):
        raise NotImplementedError

    @staticmethod
    def build(params):
        try:
            fitted_distribution_class = FittedDistribution.REGISTRY[params["type"]]
        except KeyError:
            raise UnknownObjectType("Unknown fitted distribution type: %s" % params.get("type"))
        return fitted_distribution_class.build(params)

    @staticmethod
    def define(clazz):
        FittedDistribution.REGISTRY[clazz.TYPE] = clazz

    @staticmethod
    def _range(series):
        minval = np.min(series)
        maxval = np.max(series)

        if minval == maxval:
            raise DegenerateCaseError("Range of values is too small")

        return minval, maxval


class FittedDiscreteDistribution(FittedDistribution):
    def nb_parameters(self):
        raise NotImplementedError

    def serialize(self):
        raise NotImplementedError

    def nnlf(self, series):
        raise NotImplementedError

    def pmf(self, x):
        raise NotImplementedError

    def ppf(self, series):
        raise NotImplementedError

    def test(self, series):
        # Tests considered but not implemented:
        # - Chi2 test
        #    * Chi2 is not well suited for this use-case (ordering is ignored)
        #    * Statsmodels's implementation of gof_chisquare_discrete() sucks
        # - Kolmogorov-Smirnov:
        #    * Scipy's ks_test() is only valid for continuous distribution
        #    * We *may* want to port the discrete adaptation ks.test() from R package 'dgof' at some point
        return {"ll": self.likelihood_tests(series)}

    def plot(self, series):
        return {
            "qq": self.qqplot(series),
            "pmf": self.plot_pmf(*FittedDistribution._range(series))
        }

    def plot_pmf(self, xmin, xmax):
        xvals = np.arange(np.floor(xmin), np.floor(xmax + 1), dtype=np.uint64)
        return {
            "xvals": xvals.tolist(),
            "probs": self.pmf(xvals).tolist()
        }


class FittedContinuousDistribution(FittedDistribution):
    def nnlf(self, series):
        raise NotImplementedError

    def ppf(self, series):
        raise NotImplementedError

    def serialize(self):
        raise NotImplementedError

    def nb_parameters(self):
        raise NotImplementedError

    def pdf(self, x):
        raise NotImplementedError

    def cdf(self, x):
        raise NotImplementedError

    def test(self, series):
        return {
            "ll": self.likelihood_tests(series),
            "ks": self.ks_test(series)
        }

    def plot(self, series):
        return {
            "qq": self.qqplot(series),
            "pdf": self.plot_pdf(*FittedDistribution._range(series), nb_samples=100)
        }

    def ks_test(self, series):
        statistic, pvalue = sps.kstest(series, self.cdf)

        return {
            "statistic": statistic,
            "pvalue": pvalue
        }

    def plot_pdf(self, xmin, xmax, nb_samples):
        xvals = np.linspace(xmin, xmax, num=nb_samples)
        return {
            "xvals": xvals.tolist(),
            "probs": self.pdf(xvals).tolist()
        }
