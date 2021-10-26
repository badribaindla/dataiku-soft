# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.filtering.filter import Filter


class IntervalFilter(Filter):
    TYPE = "interval"

    def __init__(self, column, left, right, closed, name=None):
        self.column = column
        self.left = left
        self.right = right
        self.closed = closed
        self.name = name

    @staticmethod
    def build(params):
        return IntervalFilter(params["column"], params["left"], params["right"], params["closed"], params.get("name"))

    def apply(self, idf, inverse=False):
        series = idf.float_col(self.column)
        no_missing_mask = np.isfinite(series)
        idf_no_missing = idf[no_missing_mask]
        series_no_missing = idf_no_missing.float_col(self.column)

        if self.closed in ('BOTH', 'LEFT'):
            mask = series_no_missing >= self.left
        else:
            mask = series_no_missing > self.left

        if self.closed in ('BOTH', 'RIGHT'):
            mask &= series_no_missing <= self.right
        else:
            mask &= series_no_missing < self.right

        if inverse:
            # Not being inside interval means "outside interval OR missing value"
            return idf_no_missing[~mask] | idf[~no_missing_mask]
        else:
            # Being in interval means "inside interval AND no missing"
            return idf_no_missing[mask]

    def serialize(self):
        return {
            "type": self.TYPE,
            "left": self.left,
            "right": self.right,
            "closed": self.closed,
            "name": self.name,
            "column": self.column
        }
