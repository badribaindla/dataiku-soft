# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.computation import Computation


class MultiComputation(Computation):
    TYPE = "multi"

    def __init__(self, computations):
        self.computations = computations

    @staticmethod
    def build(params):
        return MultiComputation([Computation.build(computation) for computation in params['computations']])

    @staticmethod
    def _require_result_checking():
        return False

    def describe(self):
        return "Multi"

    def apply(self, idf, ctx):
        results = []
        for idx, computation in enumerate(self.computations):
            with ctx.sub(idx, brackets=True) as sub:
                results.append(computation.apply_safe(idf, sub))

        return {
            "type": MultiComputation.TYPE,
            "results": results  # Results are already checked when apply_safe() is called on the inner computations
        }
