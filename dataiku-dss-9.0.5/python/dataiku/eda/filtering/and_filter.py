# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.filtering.filter import Filter


class AndFilter(Filter):
    TYPE = "and"

    def __init__(self, filters):
        self.filters = filters

    @staticmethod
    def build(params):
        return AndFilter([Filter.build(f_params) for f_params in params['filters']])

    def apply(self, idf, inverse=False):
        if inverse:
            current = idf[[]]
            for f in self.filters:
                current |= f.apply(idf, True)
        else:
            current = idf
            for f in self.filters:
                current &= f.apply(idf, False)

        return current

    def serialize(self):
        return {"type": self.TYPE, "filters": [f.serialize() for f in self.filters]}
