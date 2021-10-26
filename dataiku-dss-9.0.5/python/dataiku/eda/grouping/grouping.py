# coding: utf-8
from __future__ import unicode_literals

# Grouping defines how to construct the groups (for instance: group by value of column "gender")
from dataiku.eda.exceptions import UnknownObjectType


class Grouping(object):
    REGISTRY = {}

    def describe(self):
        return self.__class__.__name__

    @staticmethod
    def build(params):
        try:
            grouping_class = Grouping.REGISTRY[params["type"]]
        except KeyError:
            raise UnknownObjectType("Unknown grouping type: %s" % params.get("type"))
        return grouping_class.build(params)

    @staticmethod
    def define(computation_class):
        Grouping.REGISTRY[computation_class.TYPE] = computation_class

    # Compute actual groups (for instance: [gender:Male, gender:Female]) and returns a GroupingResult
    def compute_groups(self, idf):
        raise NotImplementedError

    # Compute the number of groups (some implementations can do than faster than counting output of compute_groups())
    def count_groups(self, idf):
        return sum(1 for _ in self.compute_groups(idf).iter_groups())


class GroupingResult(object):
    def serialize(self):
        raise NotImplementedError

    # Generator producing a ImmutableDataFrame for each group
    def iter_groups(self):
        raise NotImplementedError

    # Return the number of groups
    def __len__(self):
        # TODO: implement this for each subclass would probably be more efficient
        return len(list(self.iter_groups()))
