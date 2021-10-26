# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.computations.computation import BivariateComputation
from dataiku.eda.distributions.distribution2d import Distribution2D
from dataiku.eda.exceptions import NoDataError
from dataiku.eda.exceptions import NotEnoughDataError


class FitDistribution2D(BivariateComputation):
    TYPE = "fit_2d_distribution"

    def __init__(self, x_column, y_column, x_resolution, y_resolution, distribution):
        super(FitDistribution2D, self).__init__(x_column, y_column)
        self.x_resolution = x_resolution
        self.y_resolution = y_resolution
        self.distribution = distribution

    def describe(self):
        return "FitDistribution2D(%s)" % self.distribution.__class__.__name__

    @staticmethod
    def build(params):
        return FitDistribution2D(
            params['xColumn'], params['yColumn'], params['xResolution'], params['yResolution'],
            Distribution2D.build(
                params['distribution'])
        )

    def apply(self, idf, ctx):
        idf = idf[np.isfinite(idf.float_col(self.x_column)) & np.isfinite(idf.float_col(self.y_column))]

        if len(idf) == 0:
            raise NoDataError()

        if len(idf) < 3:
            raise NotEnoughDataError("Not enough values to fit a 2D distribution")

        x_series = idf.float_col(self.x_column)
        y_series = idf.float_col(self.y_column)

        model = self.distribution.fit(x_series, y_series)
        density = model.compute_density(self.x_resolution, self.y_resolution)
        output = {
            "type": FitDistribution2D.TYPE,
            "model": model.serialize(),
            "density": density
        }

        return output
