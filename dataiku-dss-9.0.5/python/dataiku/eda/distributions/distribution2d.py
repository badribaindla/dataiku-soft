# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.exceptions import UnknownObjectType


class Distribution2D(object):
    REGISTRY = {}

    @staticmethod
    def build(params):
        try:
            distribution_class = Distribution2D.REGISTRY[params["type"]]
        except KeyError:
            raise UnknownObjectType("Unknown distribution type: %s" % params.get("type"))
        return distribution_class.build(params)

    @staticmethod
    def define(clazz):
        Distribution2D.REGISTRY[clazz.TYPE] = clazz

    def fit(self, x_series, y_series):
        raise NotImplementedError


class FittedDistribution2D(object):
    def compute_density(self, x_resolution, y_resolution):
        raise NotImplementedError
