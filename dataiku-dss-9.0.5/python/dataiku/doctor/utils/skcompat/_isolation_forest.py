"""Utility function to handle the different versions of Isolation Forest"""

import sklearn

from dataiku.base.utils import package_is_at_least


def handle_behaviour_param_of_isolation_forest(isolation_forest):
    # ?    <= sklearn <= 0.19 -- `behaviour` does not exist yet
    # 0.20 <= sklearn <= 0.21 -- `behaviour` exists and the default value is "old"
    # 0.22 <= sklearn <= 0.23 -- `behaviour` exists but it cannot be set to "old" anymore
    # 0.24 <= sklearn <= ?    -- `behaviour` does not exist anymore
    if not package_is_at_least(sklearn, "0.22"):
        isolation_forest.set_params(behaviour="new")
