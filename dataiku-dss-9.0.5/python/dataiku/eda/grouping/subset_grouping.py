# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.filtering.filter import Filter
from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.grouping.grouping import GroupingResult


class SubsetGrouping(Grouping):
    TYPE = 'subset'

    def __init__(self, subset_filter):
        self.filter = subset_filter

    @staticmethod
    def build(params):
        return SubsetGrouping(Filter.build(params["filter"]))

    def describe(self):
        return "Subset"

    def count_groups(self, idf):
        return 1

    def compute_groups(self, idf):
        return SubsetGroupingResult(self.filter, self.filter.apply(idf))


class SubsetGroupingResult(GroupingResult):
    def __init__(self, subset_filter, idf):
        self.filter = subset_filter
        self.idf = idf

    def serialize(self):
        return {"type": SubsetGrouping.TYPE, "filter": self.filter.serialize()}

    def iter_groups(self):
        yield self.idf
