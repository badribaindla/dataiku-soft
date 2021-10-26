# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.exceptions import UnknownObjectType


class Curve(object):
    REGISTRY = {}

    def fit(self, x, y):
        raise NotImplementedError

    @staticmethod
    def define(computation_class):
        Curve.REGISTRY[computation_class.TYPE] = computation_class

    @staticmethod
    def build(params):
        try:
            curve_class = Curve.REGISTRY[params["type"]]
        except KeyError:
            raise UnknownObjectType("Unknown curve type: %s" % params.get("type"))
        return curve_class.build(params)


class ParametrizedCurve(object):
    def apply(self, x):
        raise NotImplementedError

    def serialize(self):
        raise NotImplementedError
