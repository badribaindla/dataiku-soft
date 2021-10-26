# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.computation import Computation


class Count(Computation):
    TYPE = "count"

    @staticmethod
    def build(params):
        return Count()

    def apply(self, idf, ctx):
        return {"type": Count.TYPE, "count": len(idf)}
