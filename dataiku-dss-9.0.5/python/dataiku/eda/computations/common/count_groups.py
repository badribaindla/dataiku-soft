# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.computation import Computation
from dataiku.eda.grouping.grouping import Grouping


class CountGroups(Computation):
    TYPE = "count_groups"

    def __init__(self, grouping):
        self.grouping = grouping

    def describe(self):
        return "CountGroups(%s)" % self.grouping.describe()

    @staticmethod
    def build(params):
        return CountGroups(Grouping.build(params["grouping"]))

    def apply(self, idf, ctx):
        return {"type": CountGroups.TYPE, "count": self.grouping.count_groups(idf)}
