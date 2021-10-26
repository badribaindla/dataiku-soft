# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.filtering.filter import Filter


class NotFilter(Filter):
    TYPE = "not"

    def __init__(self, sub_filter, name=None):
        self.filter = sub_filter
        self.name = name

    @staticmethod
    def build(params):
        return NotFilter(Filter.build(params["filter"]))

    def apply(self, idf, inverse=False):
        return self.filter.apply(idf, inverse=not inverse)

    def serialize(self):
        return {"type": self.TYPE, "filter": self.filter.serialize(), "name": self.name}
