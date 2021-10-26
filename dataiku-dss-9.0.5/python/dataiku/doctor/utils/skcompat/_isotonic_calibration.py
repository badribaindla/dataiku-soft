"""Utility function to handle the different versions of IsotonicRegression

Context: When serializing models for java scoring, we also need to serialize
    the key attributes of calibrators to replicate their transform() function
    in java.
    The isotonic calibrator uses two internal arrays X and y to interpolate in
    its transform() method, but the name of these two arrays changed across
    sklearn versions.

Notes:
    | sklearn version         | array's name     |
    | ------------------------|------------------|
    | 0.18 <= version <= 0.23 | _necessary_X_    |
    | 0.24 <= version <= ?    | X_thresholds_    |

    `X_thresholds_` and `_necessary_X_` are equivalent. Both of them are simply
    equal to the `X` parameter of the `fit` function from which were removed
    the points whose y values are equal to both the point before and the point
    after it.
"""

import sklearn

from dataiku.base.utils import package_is_at_least


def extract_X_y_from_isotonic_regressor(calibrator):
    """
    Extracts the X and y arrays used by IsotonicRegression.transform()
    :param IsotonicRegression calibrator:
    :return tuple: (X values, corresponding y values)
    """
    if package_is_at_least(sklearn, "0.24"):
        return calibrator.X_thresholds_, calibrator.y_thresholds_
    else:
        return calibrator._necessary_X_, calibrator._necessary_y_
