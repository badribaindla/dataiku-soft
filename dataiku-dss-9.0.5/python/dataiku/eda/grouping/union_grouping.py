# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.grouping.grouping import GroupingResult


class UnionGrouping(Grouping):
    TYPE = 'union'

    def __init__(self, groupings):
        self.groupings = groupings

    def describe(self):
        return "%s" % ','.join(g.describe() for g in self.groupings)

    @staticmethod
    def build(params):
        return UnionGrouping([Grouping.build(grouping) for grouping in params['groupings']])

    def count_groups(self, idf):
        return sum(grouping.count_groups(idf) for grouping in self.groupings)

    def compute_groups(self, idf):
        return UnionGroupingResult([grouping.compute_groups(idf) for grouping in self.groupings])


class UnionGroupingResult(GroupingResult):
    def __init__(self, computed_groups):
        self.computed_groups = computed_groups

    def serialize(self):
        return {
            "type": UnionGrouping.TYPE,
            "groupings": [cg.serialize() for cg in self.computed_groups]
        }

    def iter_groups(self):
        for cg in self.computed_groups:
            for group_idf in cg.iter_groups():
                yield group_idf
