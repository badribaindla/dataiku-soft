# coding: utf-8
from __future__ import unicode_literals

from numpy.polynomial import Polynomial

from dataiku.eda.curves.curve import Curve
from dataiku.eda.curves.curve import ParametrizedCurve


class PolynomialCurve(Curve):
    TYPE = 'polynomial'

    def __init__(self, degree):
        self.degree = degree

    @staticmethod
    def build(params):
        return PolynomialCurve(params["degree"])

    def fit(self, x, y):
        poly = Polynomial.fit(x, y, self.degree)
        coefs = poly.convert().coef
        return ParametrizedPolynomial(coefs)


class ParametrizedPolynomial(ParametrizedCurve):
    def __init__(self, coefs):
        self.coefs = coefs

    def serialize(self):
        return {
            "type": PolynomialCurve.TYPE,
            "coefs": list(self.coefs)  # coefs[0] + coefs[1]*x + coefs[2]*x^2 + ...
        }

    def apply(self, x):
        return Polynomial(self.coefs)(x)
