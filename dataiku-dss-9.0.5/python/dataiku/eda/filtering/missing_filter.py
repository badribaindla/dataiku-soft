# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.filtering.filter import Filter


class MissingFilter(Filter):
    TYPE = "missing"

    def __init__(self, column, name=None):
        self.column = column
        self.name = name

    @staticmethod
    def build(params):
        return MissingFilter(params["column"], params.get('name'))

    def apply(self, idf, inverse=False):
        mask = np.isnan(idf.float_col(self.column))
        if inverse:
            mask = ~mask
        return idf[mask]

    def serialize(self):
        return {"type": self.TYPE, "column": self.column, "name": self.name}
