# coding: utf-8
from __future__ import unicode_literals

import numpy as np
from numpy import ma

from dataiku.eda.exceptions import NumericalCastError


def assert_only_integers(series):
    if np.issubdtype(series.dtype, np.integer):
        return

    if not np.issubdtype(series.dtype, np.floating):
        return

    # TODO: avoid loop
    for value in series:
        if not value.is_integer():
            raise NumericalCastError("Expected integers but got: %s" % value)


def assert_all_values_less_than_or_equal(series, value):
    if np.any(series > value):
        raise NumericalCastError("Expected values to be be <= %s" % value)


# Determine if argument is:
# - Scalar (!= arrays)
# - Finite (!= NaN, Inf, -Inf)
# - Not masked (!= ma.masked)
def is_finite_number(v):
    return np.isscalar(v) and np.isreal(v) and np.isfinite(v) and not ma.is_masked(v)
