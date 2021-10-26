# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.optimize as spo
import scipy.stats as sps
from sklearn.mixture import GaussianMixture
from sortedcontainers import SortedDict

from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedContinuousDistribution


class NormalMixture(Distribution):
    TYPE = "normal_mixture"

    def __init__(self, nb_components):
        self.nb_components = nb_components

    @staticmethod
    def build(params):
        return NormalMixture(params["nbComponents"])

    def fit(self, series):
        model = GaussianMixture(n_components=self.nb_components, covariance_type='spherical', random_state=42)
        model.fit(series.reshape(-1, 1))

        components = []
        for component_idx in range(self.nb_components):
            components.append({
                "mean": model.means_[component_idx, 0],
                "weight": model.weights_[component_idx],
                "std": np.sqrt(1.0 / model.precisions_[component_idx])
            })

        components.sort(key=lambda component: component["mean"])

        return FittedNormalMixture(components)


class FittedNormalMixture(FittedContinuousDistribution):
    TYPE = NormalMixture.TYPE

    def __init__(self, components):
        self.components = components

    def nb_parameters(self):
        return len(self.components) * 2

    def nnlf(self, series):
        return -np.log(self.pdf(series)).sum()

    # ppf() is the inverse of cdf()
    def ppf(self, quantile, tol=1e-15):
        # Not a mixture
        if len(self.components) == 1:
            return sps.norm.ppf(quantile, self.components[0]["mean"], self.components[0]["std"])

        # Scipy doesn't support gaussian mixtures, and there is no closed form available for ppf()
        # => ppf(q) is implemented by numerically solving cdf(x)-q=0

        ppf_cache = SortedDict()
        cdf_cache = {}

        # Compute ppf(q) (with q being a scalar)
        def ppf_scalar(q):
            # Early exit when q is outside range (0, 1)
            if q == 0:
                return -np.inf
            if q == 1:
                return np.inf
            if not q > 0 or not q < 1:
                return np.nan

            # Define the objective function func(x) = cdf(x) - q
            def func(x):
                # Compute cached cdf(x)
                cdf = cdf_cache.get(x)
                if cdf is None:
                    cdf = self.cdf(x)
                    cdf_cache[x] = cdf

                # Opportunistically store ppf(cdf) in cache
                # => Used to reduce the search range for computing the next ppfs
                ppf_cache[cdf] = x

                return cdf - q

            # Initial search range of ppf(q) is (-inf, +inf)
            x_min = -np.inf
            x_max = np.inf

            # Try to reduce the search range using previously computed ppfs
            for key_q in ppf_cache.irange(maximum=q, reverse=True):
                x_min = ppf_cache[key_q]
                break

            for key_q in ppf_cache.irange(minimum=q, reverse=False):
                x_max = ppf_cache[key_q]
                break

            # If the search range still doesn't have finite bounds, use ppf() of individual gaussians
            if np.isinf(x_min) or np.isinf(x_max):
                ppfs = [sps.norm.ppf(q, c["mean"], c["std"]) for c in self.components]
                x_min = max(x_min, np.min(ppfs))
                x_max = min(x_max, np.max(ppfs))

            # Check if bounds are not already the solution of func(x)=0
            if np.abs(func(x_min)) < tol:
                return x_min
            if np.abs(func(x_max)) < tol:
                return x_max

            # Solve func(x)=0 for x using Brent's method
            if np.isfinite(x_min) and np.isfinite(x_max):
                return spo.brentq(func, x_min, x_max, rtol=tol, disp=False)

            # Beh
            return np.nan

        return np.vectorize(ppf_scalar)(quantile)

    def pdf(self, x):
        proba = 0.0
        for component in self.components:
            proba += component["weight"] * sps.norm.pdf(x, component["mean"], component["std"])
        return proba

    def cdf(self, x):
        proba = 0.0
        for component in self.components:
            proba += component["weight"] * sps.norm.cdf(x, component["mean"], component["std"])
        return proba

    def serialize(self):
        return {"type": self.TYPE, "components": self.components}

    @staticmethod
    def build(params):
        return FittedNormalMixture(params["components"])
