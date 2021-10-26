# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.filtering.filter import Filter


class AnumFilter(Filter):
    TYPE = "anum"

    def __init__(self, column, values, name=None):
        self.column = column
        self.values = values
        self.name = name

    @staticmethod
    def build(params):
        return AnumFilter(params["column"], params["values"], params.get("name"))

    def apply(self, idf, inverse=False):
        mask = idf.text_col(self.column).isin(self.values)
        if inverse:
            mask = ~mask
        return idf[mask]

    def serialize(self):
        return {
            "type": self.TYPE,
            "values": self.values,
            "column": self.column,
            "name": self.name
        }
