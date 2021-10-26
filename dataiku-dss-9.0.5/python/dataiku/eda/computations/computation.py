# coding: utf-8
from __future__ import unicode_literals

import logging
import traceback

import numpy as np
import six

from dataiku.eda.computations.context import Context
from dataiku.eda.exceptions import EdaComputeError
from dataiku.eda.exceptions import InvalidResultError
from dataiku.eda.exceptions import UnknownObjectType

logger = logging.getLogger(__name__)


class Computation(object):
    REGISTRY = {}

    def apply(self, idf, ctx):
        raise NotImplementedError

    def describe(self):
        return self.__class__.__name__

    @staticmethod
    def _require_result_checking():
        return True

    def apply_safe(self, idf, ctx=None):
        if ctx is None:
            ctx = Context()
            with ctx:
                return self.apply_safe(idf, ctx)

        with ctx.sub(self.describe()) as sub:
            try:
                result = self.apply(idf, sub)
                if self._require_result_checking():
                    result = Computation._check_and_fix_result(result)
                return result

            except EdaComputeError as e:
                # Error directly produced by EDA
                return Computation._failed_result(e.CODE, "%s" % e, sub.fullname)

            except Exception as e:
                # Catch-all handler for cases where exception hasn't been thrown explicitly by EDA
                # In this case, we are likely interested by the full stack trace
                traceback.print_exc()
                traceback.print_stack()
                logger.error(e)

                return Computation._failed_result(EdaComputeError.CODE, "Unexpected error: %s" % e, sub.fullname)

    # Make sure computation results are well-formed:
    # - They must be JSON-serializable
    # - All strings MUST be unicode (in both Py2/Py3)
    # - Numpy float/int primitives are converted into Python primitives
    @staticmethod
    def _check_and_fix_result(obj):
        # Handle dicts
        if isinstance(obj, dict):
            return {
                Computation._check_key(k): Computation._check_and_fix_result(v)
                for k, v in six.iteritems(obj)
            }
        # Handle arrays
        elif isinstance(obj, list):
            return [Computation._check_and_fix_result(v) for v in obj]

        # Unbox Numpy primitives
        if isinstance(obj, (np.integer, np.floating)):
            obj = obj.item()

        if isinstance(obj, float):
            if np.isnan(obj) or np.isinf(obj):
                raise InvalidResultError("Invalid NaN/Inf in result")
        elif isinstance(obj, six.string_types):
            if not isinstance(obj, six.text_type):
                # Unicode strings are enforced in both Py2/Py3
                raise InvalidResultError("Strings must be unicode")
        elif obj is None or obj is True or obj is False or isinstance(obj, six.integer_types):
            pass  # Always valid primitives
        else:
            raise InvalidResultError("Output type is not serializable: %s" % obj.__class__)

        return obj

    @staticmethod
    def _check_key(key):
        if not isinstance(key, six.text_type):
            # Unicode strings are enforced in both Py2/Py3
            raise InvalidResultError("Keys must be unicode")
        return key

    @staticmethod
    def build(params):
        try:
            computation_class = Computation.REGISTRY[params["type"]]
        except KeyError:
            raise UnknownObjectType("Unknown computation type: %s" % params.get("type"))
        return computation_class.build(params)

    @staticmethod
    def define(computation_class):
        Computation.REGISTRY[computation_class.TYPE] = computation_class

    @staticmethod
    def _failed_result(code, message, location):
        return {
            "type": "failed",
            "reason": "FAILURE",
            "location": location,  # Not used currently
            "code": code,
            "message": message
        }


class UnivariateComputation(Computation):
    def __init__(self, column):
        self.column = column

    def describe(self):
        return "%s(%s)" % (self.__class__.__name__, self.column)


class BivariateComputation(Computation):
    def __init__(self, x_column, y_column):
        self.x_column = x_column
        self.y_column = y_column

    def describe(self):
        return "%s(y=%s, y=%s)" % (self.__class__.__name__, self.x_column, self.y_column)


class MultivariateComputation(Computation):
    def __init__(self, columns):
        self.columns = columns

    def describe(self):
        return "%s(%s)" % (self.__class__.__name__, ', '.join(self.columns))
