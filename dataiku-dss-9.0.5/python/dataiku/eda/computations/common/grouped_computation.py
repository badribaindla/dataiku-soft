# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.computation import Computation
from dataiku.eda.grouping.grouping import Grouping


class GroupedComputation(Computation):
    TYPE = "grouped"

    def __init__(self, computation, grouping):
        self.computation = computation
        self.grouping = grouping

    @staticmethod
    def build(params):
        return GroupedComputation(
            Computation.build(params['computation']),
            Grouping.build(params['grouping'])
        )

    @staticmethod
    def _require_result_checking():
        return False

    def describe(self):
        return "GroupBy(%s)" % self.grouping.describe()

    def apply(self, idf, ctx):
        with ctx.sub("ComputeGroups"):
            computed_groups = self.grouping.compute_groups(idf)

        results = []
        for index, group_idf in enumerate(computed_groups.iter_groups()):
            with ctx.sub("%s" % index, brackets=True) as sub:
                results.append(self.computation.apply_safe(group_idf, sub))

        return {
            "type": GroupedComputation.TYPE,
            "groups": Computation._check_and_fix_result(computed_groups.serialize()),
            "results": results  # Results were already checked when apply_safe() was called on the inner computation
        }
