# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.grouping.grouping import GroupingResult


class MergeGrouping(Grouping):
    TYPE = 'merge'

    def __init__(self, inner_grouping):
        self.inner_grouping = inner_grouping

    def describe(self):
        return "Merge(%s)" % self.inner_grouping.describe()

    @staticmethod
    def build(params):
        return MergeGrouping(Grouping.build(params['innerGrouping']))

    def count_groups(self, idf):
        return 1

    def compute_groups(self, idf):
        inner_grouping_result = self.inner_grouping.compute_groups(idf)

        merged_groups_idf = idf[[]]
        for idf in inner_grouping_result.iter_groups():
            merged_groups_idf |= idf

        return MergeGroupingResult(inner_grouping_result, merged_groups_idf)


class MergeGroupingResult(GroupingResult):
    def __init__(self, inner_grouping_result, idf):
        self.inner_grouping_result = inner_grouping_result
        self.idf = idf

    def serialize(self):
        return {
            "type": MergeGrouping.TYPE,
            "innerGroupingResult": self.inner_grouping_result.serialize()
        }

    def iter_groups(self):
        yield self.idf
