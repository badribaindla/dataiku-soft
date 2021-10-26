# coding: utf-8
from __future__ import unicode_literals

import numpy as np

from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.grouping.grouping import GroupingResult


class CrossGrouping(Grouping):
    TYPE = "cross"

    def __init__(self, groupings):
        self.groupings = groupings

    @staticmethod
    def build(params):
        return CrossGrouping([Grouping.build(p) for p in params["groupings"]])

    def describe(self):
        return ' x '.join([g.describe() for g in self.groupings])

    def count_groups(self, idf):
        return np.prod([grouping.count_groups(idf) for grouping in self.groupings])

    def compute_groups(self, idf):
        return CrossGroupingResult([g.compute_groups(idf) for g in self.groupings], idf)


class CrossGroupingResult(GroupingResult):
    def __init__(self, groups, original_idf):
        self.groups = groups
        self.original_idf = original_idf

    def serialize(self):
        return {
            "type": CrossGrouping.TYPE,
            "groups": [g.serialize() for g in self.groups]
        }

    def _iter_groups_rec(self, idf, dim):
        if dim >= len(self.groups):
            yield idf
            return

        for group_idf in self.groups[dim].iter_groups():
            for crossed_idf in self._iter_groups_rec(idf & group_idf, dim + 1):
                yield crossed_idf

    def iter_groups(self):
        for group_idf in self._iter_groups_rec(self.original_idf, 0):
            yield group_idf
