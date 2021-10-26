# coding: utf-8
from __future__ import unicode_literals

import numpy as np
from scipy.signal import convolve
from scipy.signal.windows import gaussian

from dataiku.eda.computations.compact_ndarray import compact_array
from dataiku.eda.distributions.distribution2d import Distribution2D
from dataiku.eda.distributions.distribution2d import FittedDistribution2D
from dataiku.eda.exceptions import DegenerateCaseError


class KDE2D(Distribution2D):
    TYPE = "kde_2d"

    def __init__(self, x_relative_bandwidth, y_relative_bandwidth):
        self.x_relative_bandwidth = x_relative_bandwidth
        self.y_relative_bandwidth = y_relative_bandwidth

    @staticmethod
    def build(params):
        return KDE2D(params["x_relative_bandwidth"],
                     params["y_relative_bandwidth"])

    def fit(self, x_series, y_series):
        return FittedKDE2D(x_series, y_series, self.x_relative_bandwidth, self.y_relative_bandwidth)


class FittedKDE2D(FittedDistribution2D):
    TYPE = KDE2D.TYPE

    # Truncation threshold of the kernel (gaussian doesn't have a compact support)
    NB_SIGMA_TRUNCATE = 4

    # Compute convolution is an extended grid in order to avoid boundary effects
    # (larger bandwidth requires larger overdrive)
    # - If too small: the density map is incorrect
    # - If too high: slow
    OVERDRIVE = .1

    # Region of interest (percentiles) + a margin in %
    ROI_PC_MIN = 1
    ROI_PC_MAX = 99
    ROI_MARGIN = .3

    def __init__(self, x_series, y_series, x_relative_bandwidth, y_relative_bandwidth):
        self.x_series = x_series
        self.y_series = y_series
        self.x_relative_bandwidth = x_relative_bandwidth
        self.y_relative_bandwidth = y_relative_bandwidth

    def compute_density(self, x_resolution, y_resolution):
        if np.ptp(self.x_series) == 0 or np.ptp(self.y_series) == 0:
            raise DegenerateCaseError("Range of values is too small")

        x_min, x_max, y_min, y_max = self._compute_region_of_interest()

        # The region of interest does NOT necessarily contain all points. Ignoring them
        # may produce an incorrect output because points which are close to the ROI still have an effect
        # on the final density map
        # => in order to alleviate these edge effects, we run the convolution on a (temporarily) extended grid
        x_ext = int(x_resolution * self.OVERDRIVE)
        y_ext = int(y_resolution * self.OVERDRIVE)
        extended_x_res = x_resolution + x_ext * 2
        extended_y_res = y_resolution + y_ext * 2
        extended_x_min = x_min - (x_max - x_min) * self.OVERDRIVE
        extended_x_max = x_max + (x_max - x_min) * self.OVERDRIVE
        extended_y_min = y_min - (y_max - y_min) * self.OVERDRIVE
        extended_y_max = y_max + (y_max - y_min) * self.OVERDRIVE

        # Compute extended density map
        extended_density = self._compute_density_impl(
            extended_x_res, extended_y_res,
            extended_x_min, extended_x_max,
            extended_y_min, extended_y_max
        )

        # Extract the original density from the extended one
        density = extended_density[x_ext:(x_resolution + x_ext), y_ext:(y_resolution + y_ext)]

        return {
            "data": compact_array(density),
            "yMin": y_min,
            "yMax": y_max,
            "xMin": x_min,
            "xMax": x_max
        }

    def _compute_region_of_interest(self):
        # Percentiles are less sensitive to outliers
        x_min, x_max = np.percentile(self.x_series, [self.ROI_PC_MIN, self.ROI_PC_MAX])
        y_min, y_max = np.percentile(self.y_series, [self.ROI_PC_MIN, self.ROI_PC_MAX])

        # Add some margins to min/max values defined above
        x_range = x_max - x_min
        x_min -= x_range * FittedKDE2D.ROI_MARGIN
        x_max += x_range * FittedKDE2D.ROI_MARGIN
        y_range = y_max - y_min
        y_min -= y_range * FittedKDE2D.ROI_MARGIN
        y_max += y_range * FittedKDE2D.ROI_MARGIN

        return x_min, x_max, y_min, y_max

    def _compute_density_impl(self, x_resolution, y_resolution, x_min, x_max, y_min, y_max):
        # Build a 2D histogram on the data
        # => It would be better to perform "linear binning" instead of "nearest neighbor binning", but the difference
        #    should not be visible unless kernel is very small (see KDEpy's FFTKDE implementation for more details)
        binned_data, _, _ = np.histogram2d(
            self.x_series, self.y_series,
            (x_resolution, y_resolution),
            [[x_min, x_max], [y_min, y_max]],
            density=True
        )

        # Determine the kernel size in data's scale
        x_bandwidth = self.x_relative_bandwidth * np.std(self.x_series, ddof=1) / 100.
        y_bandwidth = self.y_relative_bandwidth * np.std(self.y_series, ddof=1) / 100.

        # Convert the bandwidth into the grid's scale
        x_bw_scaled = np.true_divide(x_bandwidth * x_resolution, x_max - x_min)
        y_bw_scaled = np.true_divide(y_bandwidth * y_resolution, y_max - y_min)

        # Create a 2D gaussian kernel
        kernel = FittedKDE2D.create_gaussian_kernel_2d(x_bw_scaled, y_bw_scaled, x_resolution, y_resolution)

        # Convolve the binned data with the gaussian kernel
        return convolve(binned_data, kernel, mode='same')

    @staticmethod
    def create_gaussian_kernel_1d(std, hard_limit):
        kernel_size = min(1 + FittedKDE2D.NB_SIGMA_TRUNCATE * 2 * np.ceil(std), hard_limit)
        kernel = gaussian(kernel_size, std)
        return kernel / np.sum(kernel)

    @staticmethod
    def create_gaussian_kernel_2d(x_std, y_std, x_resolution, y_resolution):
        x_kernel = FittedKDE2D.create_gaussian_kernel_1d(x_std, 2 * x_resolution)
        y_kernel = FittedKDE2D.create_gaussian_kernel_1d(y_std, 2 * y_resolution)
        return np.outer(x_kernel, y_kernel)

    def serialize(self):
        return {
            "type": self.TYPE
        }
