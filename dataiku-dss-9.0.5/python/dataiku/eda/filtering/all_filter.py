# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.filtering.filter import Filter


class AllFilter(Filter):
    TYPE = "all"

    def __init__(self, name=None):
        self.name = name

    @staticmethod
    def build(params):
        return AllFilter()

    def apply(self, idf, inverse=False):
        if inverse:
            return idf[[]]
        else:
            return idf[np.arange(len(idf))]

    def serialize(self):
        return {"type": self.TYPE, "name": self.name}
