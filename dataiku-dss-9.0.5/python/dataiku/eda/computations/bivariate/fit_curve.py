# coding: utf-8
from __future__ import unicode_literals

import numpy as np
from sklearn.metrics import mean_squared_error
from sklearn.metrics import r2_score

from dataiku.eda.computations.computation import BivariateComputation
from dataiku.eda.curves.curve import Curve
from dataiku.eda.exceptions import DegenerateCaseError
from dataiku.eda.exceptions import NotEnoughDataError


class FitCurve(BivariateComputation):
    TYPE = "fit_curve"

    def __init__(self, x_column, y_column, curve):
        super(FitCurve, self).__init__(x_column, y_column)
        self.curve = curve

    @staticmethod
    def build(params):
        return FitCurve(params['xColumn'], params['yColumn'], Curve.build(params['curve']))

    def apply(self, idf, ctx):
        idf_no_missing = idf[np.isfinite(idf.float_col(self.x_column)) & np.isfinite(idf.float_col(self.y_column))]

        if len(idf_no_missing) < 2:
            raise NotEnoughDataError("At least 2 values are required to fit a curve")

        x_series = idf_no_missing.float_col(self.x_column)
        y_series = idf_no_missing.float_col(self.y_column)

        if np.all(x_series == x_series[0]):
            # This isn't the only degenerate case but this one is likely to be caused by user mistake
            raise DegenerateCaseError("Cannot fit a curve because all values in '%s' are identical" % self.x_column)

        fitted_curve = self.curve.fit(x_series, y_series)

        return {
            "type": self.TYPE,
            "parametrized": fitted_curve.serialize(),
            "plot": self.compute_plot(x_series, fitted_curve),
            "scores": self.compute_scores(x_series, y_series, fitted_curve)
        }

    @staticmethod
    def compute_scores(x_series, y_series, fitted_curve):
        y_pred = fitted_curve.apply(x_series)

        return {
            "r2": r2_score(y_series, y_pred),
            "rmse": np.sqrt(mean_squared_error(y_series, y_pred))
        }

    @staticmethod
    def compute_plot(x_series, fitted_curve):
        plot_x = np.linspace(np.min(x_series), np.max(x_series), 100)
        plot_y = fitted_curve.apply(plot_x)

        return {"x": list(plot_x), "y": list(plot_y)}
