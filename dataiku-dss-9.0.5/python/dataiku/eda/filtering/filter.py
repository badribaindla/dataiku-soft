# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.exceptions import UnknownObjectType


class Filter(object):
    REGISTRY = {}

    def apply(self, idf, inverse=False):
        raise NotImplementedError

    def serialize(self):
        raise NotImplementedError

    @staticmethod
    def build(params):
        try:
            filter_class = Filter.REGISTRY[params["type"]]
        except KeyError:
            raise UnknownObjectType("Unknown filter type: %s" % params.get("type"))
        return filter_class.build(params)

    @staticmethod
    def define(filter_class):
        Filter.REGISTRY[filter_class.TYPE] = filter_class
