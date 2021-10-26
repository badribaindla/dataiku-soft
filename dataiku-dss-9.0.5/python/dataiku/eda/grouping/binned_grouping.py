# coding: utf-8
from __future__ import division
from __future__ import unicode_literals

import numpy as np
import pandas as pd

from dataiku.eda.exceptions import InvalidParams
from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.grouping.grouping import GroupingResult


class BinnedGrouping(Grouping):
    TYPE = 'binned'

    # With automatic binning (mode==AUTO), the nb. of bins is determined using an heuristic.
    # It is important to remember that the estimated ideal nb. of bins is unbounded.
    # - The nb. of bins can be limited with parameter 'nbBins' (but this parameter is optional)
    # - Constant AUTO_NB_BINS_MAX is an additional (hardcoded) limit which prevents the heuristic from going crazy
    AUTO_NB_BINS_MAX = 100

    def __init__(self, column, mode, nb_bins, bin_size, keep_na):
        self.column = column
        self.mode = mode
        self.nb_bins = nb_bins
        self.bin_size = bin_size
        self.keep_na = keep_na

    def describe(self):
        return "Binned(%s)" % self.column

    @staticmethod
    def build(params):
        return BinnedGrouping(
            params['column'],
            params['mode'],
            params.get('nbBins'),
            params.get('binSize'),
            params.get('keepNA')
        )

    # Python translation of nice bounds logic in NumericalVariableAnalyzer (in DSS charts)
    @staticmethod
    def nice_bounds(vmin, vmax, nb_bins):
        span = vmax - vmin
        if span < np.finfo(np.float).eps:
            span = 1

        ln10 = np.log(10)
        step = 10 ** np.floor(np.log(span / nb_bins) / ln10)
        err = nb_bins / span * step

        if err <= .15:
            step *= 10
        elif err <= .35:
            step *= 5
        elif err <= .75:
            step *= 2

        fixed_min = np.floor(vmin / step) * step
        fixed_max = np.ceil(vmax / step) * step

        if fixed_min + nb_bins * step < fixed_max:
            step = (fixed_max - fixed_min) / nb_bins

        return fixed_min, step * nb_bins + fixed_min

    @staticmethod
    def nice_bin_edges(series, nb_bins):
        vmin = 0
        vmax = 0
        if len(series) > 0:
            vmin = np.min(series)
            vmax = np.max(series)

        fixed_vmin, fixed_vmax = BinnedGrouping.nice_bounds(vmin, vmax, nb_bins)

        # The bins are right exclusive
        # If necessary, virtually extend the range so that the last value is always included
        if fixed_vmax == vmax:
            offset = (fixed_vmax - fixed_vmin) / (2 * nb_bins)  # This is an arbitrary choice
            fixed_vmin, fixed_vmax = BinnedGrouping.nice_bounds(fixed_vmin, fixed_vmax + offset, nb_bins)

        return np.linspace(fixed_vmin, fixed_vmax, nb_bins + 1)

    @staticmethod
    def estimate_nb_bins(series):
        return min(len(np.histogram_bin_edges(series, bins='auto')), BinnedGrouping.AUTO_NB_BINS_MAX)

    def compute_groups(self, idf):
        series = idf.float_col(self.column)
        idf_no_missing = idf[np.isfinite(series)]
        series_no_missing = idf_no_missing.float_col(self.column)

        if self.mode == 'AUTO':
            nb_bins = self.estimate_nb_bins(series_no_missing)
            if self.nb_bins is not None:
                nb_bins = min(self.nb_bins, nb_bins)
        elif self.mode == 'FIXED_NB':
            nb_bins = self.nb_bins
            if nb_bins is None or nb_bins < 1:
                raise InvalidParams("Expected nb. of bins to be greater than or equal to 1")
        else:
            raise NotImplementedError("Not implemented binning mode: %s" % self.mode)

        bin_edges = self.nice_bin_edges(series_no_missing, nb_bins)
        bin_map = np.digitize(series_no_missing, bin_edges) - 1
        indices = pd.Series(bin_map, copy=False).groupby(bin_map).indices

        idfs = []
        empty_idf = idf_no_missing[[]]
        for i in range(len(bin_edges) - 1):
            if i in indices:
                idfs.append(idf_no_missing[indices.get(i)])
            else:
                idfs.append(empty_idf)

        idf_missing = None
        if self.keep_na:
            nan_mask = np.isnan(series)
            if np.any(nan_mask):
                idf_missing = idf[nan_mask]

        return BinnedGroupingResult(self.column, bin_edges, idfs, idf_missing)


class BinnedGroupingResult(GroupingResult):
    def __init__(self, column, bin_edges, idfs, idf_missing):
        self.column = column
        self.bin_edges = bin_edges
        self.idfs = idfs
        self.idf_missing = idf_missing

    def serialize(self):
        return {
            "type": BinnedGrouping.TYPE,
            "edges": list(self.bin_edges),
            "column": self.column,
            "hasNa": self.idf_missing is not None
        }

    def iter_groups(self):
        for group_idf in self.idfs:
            yield group_idf
        if self.idf_missing is not None:
            yield self.idf_missing
