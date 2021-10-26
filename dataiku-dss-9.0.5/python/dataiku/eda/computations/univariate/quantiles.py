# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps
import six

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import NoDataError


class Quantiles(UnivariateComputation):
    TYPE = "quantiles"

    def __init__(self, column, confidence, freqs):
        super(Quantiles, self).__init__(column)
        self.freqs = freqs
        self.confidence = confidence

    def describe(self):
        freqs_desc = ', '.join((six.text_type(p) for p in self.freqs))
        return "%s(%s, %s)" % (self.__class__.__name__, self.column, freqs_desc)

    @staticmethod
    def build(params):
        return Quantiles(
            params['column'],
            params.get('confidence'),
            params['freqs']
        )

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        if len(series) == 0:
            raise NoDataError()

        # np.quantile() is much faster than scipy.stats.mquantiles()
        quantiles = np.quantile(series, self.freqs)

        if self.confidence is not None:
            # Formula stolen from scipy.stats.mstats.mquantiles_cimj()
            alpha = min(self.confidence, 1 - self.confidence)
            z = sps.norm.ppf(1 - alpha / 2.)
            smj = sps.mstats.mjci(series, self.freqs)
            lower_bounds = quantiles - z * smj
            upper_bounds = quantiles + z * smj

        quantile_descs = []
        for index, (freq, quantile) in enumerate(zip(self.freqs, quantiles)):
            quantile_desc = {"freq": freq, "quantile": quantile, "lower": None, "upper": None}

            if self.confidence is not None and np.isfinite(lower_bounds[index]) and np.isfinite(upper_bounds[index]):
                quantile_desc["lower"] = lower_bounds[index]
                quantile_desc["upper"] = upper_bounds[index]

            quantile_descs.append(quantile_desc)

        return {"type": Quantiles.TYPE, "quantiles": quantile_descs}
