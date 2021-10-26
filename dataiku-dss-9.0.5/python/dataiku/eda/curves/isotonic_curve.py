# coding: utf-8
from __future__ import unicode_literals

from sklearn.isotonic import IsotonicRegression

from dataiku.eda.curves.curve import Curve
from dataiku.eda.curves.curve import ParametrizedCurve


class IsotonicCurve(Curve):
    TYPE = 'isotonic'

    @staticmethod
    def build(params):
        return IsotonicCurve()

    def fit(self, x, y):
        return ParametrizedIsotonicCurve(IsotonicRegression().fit(x, y))


class ParametrizedIsotonicCurve(ParametrizedCurve):
    def __init__(self, ir):
        self.ir = ir

    def serialize(self):
        return {
            "type": IsotonicCurve.TYPE
            # No parametrization (can be as large as the data in the worst case)
        }

    def apply(self, x):
        return self.ir.predict(x)
