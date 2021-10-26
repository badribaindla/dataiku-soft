# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.computation import Computation


class DummyComputation(Computation):
    TYPE = "dummy"

    @staticmethod
    def build(params):
        return DummyComputation()

    def describe(self):
        return "Dummy"

    def apply(self, idf, ctx):
        return {"type": DummyComputation.TYPE}
