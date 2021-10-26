# coding: utf-8
from __future__ import unicode_literals


### IMPORTANT ###
# Keep this list sync with "com.dataiku.dip.eda.EdaErrorCodes" (Java)

class EdaComputeError(Exception):
    def __init__(self, message=None):
        if message is None:
            try:
                message = self.DEFAULT_MESSAGE
            except NameError:
                message = "Unknown error"
        super(EdaComputeError, self).__init__(message)

    CODE = 'ERR_EDA_COMPUTE'
    DEFAULT_MESSAGE = 'Unexpected EDA compute error'


# ======

class InvalidParams(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_INVALID_PARAMS'
    DEFAULT_MESSAGE = 'Invalid parameters'


class GroupsAreNotDisjoint(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_NOT_INDEPENDENT'
    DEFAULT_MESSAGE = 'Groups must be disjoint to be considered independent'


class UnknownObjectType(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_UNKNOWN_TYPE'
    DEFAULT_MESSAGE = 'Unknown object type'


class NumericalCastError(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_CAST_TO_NUMERICAL_FAILED'
    DEFAULT_MESSAGE = 'Could not convert string to numerical'


# Computation did not fail but produced an invalid result for some reason related to data (NaN, Inf, ...)
class InvalidResultError(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_INVALID_RESULT'
    DEFAULT_MESSAGE = 'Invalid results'


# Computation failed because there was no data
class NoDataError(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_NO_DATA'
    DEFAULT_MESSAGE = 'No data'


# Computation failed because there was not enough data
class NotEnoughDataError(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_NOT_ENOUGH_DATA'
    DEFAULT_MESSAGE = 'No enough data'


# Computation failed because there was not enough data
class NotEnoughGroupsError(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_NOT_ENOUGH_GROUPS'
    DEFAULT_MESSAGE = 'No enough groups'


# Computation failed because there was not enough data
class DegenerateCaseError(EdaComputeError):
    CODE = 'ERR_EDA_COMPUTE_DEGENERATE'
    DEFAULT_MESSAGE = 'Degenerate case'
