# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps

from dataiku.eda.computations.compact_ndarray import compact_array
from dataiku.eda.distributions.distribution2d import Distribution2D
from dataiku.eda.distributions.distribution2d import FittedDistribution2D


class JointNormal(Distribution2D):
    TYPE = "joint_normal"

    @staticmethod
    def build(params):
        return JointNormal()

    def fit(self, x_series, y_series):
        series = np.vstack((x_series, y_series)).T
        means = np.mean(series, 0)
        covs = np.cov(series.T)
        rv = sps.multivariate_normal(means, covs, allow_singular=True)
        return FittedJointNormal(rv, means, covs, x_series, y_series)


class FittedJointNormal(FittedDistribution2D):
    TYPE = JointNormal.TYPE

    # Control scale of the density map
    # (visible range is [mean - SIGMA_SCALE * stdDev, mean + SIGMA_SCALE * stdDev])
    SIGMA_SCALE = 3

    def __init__(self, rv, means, covs, x_series, y_series):
        self.rv = rv
        self.means = means
        self.covs = covs
        self.x_series = x_series
        self.y_series = y_series

    def compute_density(self, x_resolution, y_resolution):
        x_min = self.means[0] - self.SIGMA_SCALE * np.sqrt(self.covs[0, 0])
        x_max = self.means[0] + self.SIGMA_SCALE * np.sqrt(self.covs[0, 0])

        y_min = self.means[1] - self.SIGMA_SCALE * np.sqrt(self.covs[1, 1])
        y_max = self.means[1] + self.SIGMA_SCALE * np.sqrt(self.covs[1, 1])

        x_grid, y_grid = np.meshgrid(
            np.linspace(x_min, x_max, x_resolution),
            np.linspace(y_min, y_max, y_resolution)
        )
        x_grid = x_grid.ravel()
        y_grid = y_grid.ravel()
        grid = np.vstack([x_grid, y_grid]).T
        sampled_pdf = self.rv.pdf(grid)
        # this reshape is mandatory so that the array appears as an image
        # to the array decompression code on the JS side
        sampled_pdf = sampled_pdf.reshape((y_resolution, x_resolution))

        return {
            "data": compact_array(sampled_pdf),
            "yMin": y_min,
            "yMax": y_max,
            "xMin": x_min,
            "xMax": x_max
        }

    def serialize(self):
        return {
            "type": self.TYPE,
            "means": self.means.tolist(),
            "covs": self.covs.tolist()
        }
