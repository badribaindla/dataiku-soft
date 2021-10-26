"""Scikit-Learn compatibility module

Description: The purpose of this module is to encapsulate the code that handles
    the differences across sklearn version.

Motivation: DSS must necessarily support sklearn 0.20 because it is the last
    version of sklearn that supports Python 2. But DSS should also support
    newer versions of sklearn as much as possible.
"""

from ._isolation_forest import handle_behaviour_param_of_isolation_forest
from ._isotonic_calibration import extract_X_y_from_isotonic_regressor
from ._gbt import get_gbt_regression_baseline
from ._gbt import get_gbt_classification_baseline
from ._recursive_partial_dependence import dku_recursive_partial_dependence

