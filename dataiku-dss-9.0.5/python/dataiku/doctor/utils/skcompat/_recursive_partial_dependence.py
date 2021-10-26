"""Wrapper for Sklearn's partial_dependence function

Abstract: This wrapper handles the complexity regarding the compatibility of
    PDP across sklearn versions. In sklearn 0.21, partial_dependence was moved
    from `sklearn.ensemble.partial_dependence` to `sklearn.inspection`.
    Moreover, some parameters and attributes changed.

Note: This concerns PDP computed at the end of the training for tree based
    algorithms (RF, DT, GBT), not to be confused with the post-train
    computations, available for all algorithms and that can be found in
    `dataiku.doctor.posttraining.partial_dependency`.

Context: Running partial dependence is usually very computationally intensive.
    There was no function in sklearn capable of computing PDP for any algo
    prior to sklearn 0.21. This is why, in DSS, we implemented our own PDP
    algorithm in partial_dependency.py.

    However, for some tree-based regressors, it's possible to compute a PDP
    very quickly by simply exploiting the structure of the trees. This is why
    we pre-compute the PDP when we train RandomForests, DecisionTreeRegressors
    or GradientBoostingRegressors. For instance, if you train a
    RandomForestRegressor and go in Partial Dependence > Select your variable,
    you'll notice that some items of the select are marked as already computed.

    Although general PDP was not available in sklearn prior to 0.21, there is
    already in sklearn 0.20 a function that computes the partial dependence of
    a GradientBoostingRegressor, using the trick described in the previous
    paragraph. This function was in `sklearn.ensemble.partial_dependence`. This
    is the function that we use to pre-compute PDP for tree-based regressors.

    With newer versions of sklearn, they added the possibility to compute PDP
    on all algorithms. That's why they moved the function from sklearn.ensemble
    to sklearn.inspection.
    But, since they wanted to keep the special super-fast trick to compute PDP
    on tree-based regressors, they added a parameter called method="auto" that
    lets users choose the computation method for tree-based regressors.
"""

import numpy as np
import sklearn
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeRegressor

from dataiku.base.utils import package_is_at_least


def dku_recursive_partial_dependence(tree_based_estimator, feature, X, grid_resolution):
    """
    Wrapper around sklearn's partial_dependence function.
    :param tree_based_estimator: the trained estimator used to compute the PDP
    :param int feature: the feature on which we compute the PDP
    :param numpy.ndarray X: the train set
    :param int grid_resolution: number of points to be placed on the grid
    :return: return of sklearn's partial_dependence function
    """
    # With sklearn < 0.23, partial_dependence only works with GradientBoosting
    # estimator. So, if we have a RandomForest or a DecisionTree estimator
    # instead, the trick is to retrieve their trees to create a fake GBT that
    # we can pass to partial_dependence and still use the "recursion"
    # accelerated method.
    compatible_estimator = tree_based_estimator
    if not package_is_at_least(sklearn, "0.23"):
        if isinstance(tree_based_estimator, RandomForestRegressor):
            compatible_estimator = _make_gbt_from_rf(tree_based_estimator, X.shape[1])
        elif isinstance(tree_based_estimator, DecisionTreeRegressor):
            compatible_estimator = _make_gbt_from_dt(tree_based_estimator, X.shape[1])
        elif not isinstance(tree_based_estimator, (GradientBoostingClassifier, GradientBoostingRegressor)):
            raise ValueError("Unsupported algorithm: {}".format(tree_based_estimator.__class__.__name__))

    if package_is_at_least(sklearn, "0.24"):
        from sklearn.inspection import partial_dependence
        bunch = partial_dependence(compatible_estimator, X, [feature], grid_resolution=grid_resolution, method="recursion", kind="average")
        return bunch["average"], bunch["values"]  # can't use attribute syntax for "values" because it's a method of `dict` which is inherited by Bunch...
    elif package_is_at_least(sklearn, "0.21"):
        from sklearn.inspection import partial_dependence
        return partial_dependence(compatible_estimator, X, [feature], grid_resolution=grid_resolution, method="recursion")
    else:
        from sklearn.ensemble.partial_dependence import partial_dependence
        return partial_dependence(compatible_estimator, [feature], X=X, grid_resolution=grid_resolution)


def _make_gbt(learning_rate, estimators, n_features):
    """
    Creates a fake GradientBoostingRegressor
    :param float learning_rate: param of GradientBoostingRegressor
    :param estimators: trees of the GradientBoostingRegressor
    :param int n_features: number of columns in the train set
    :return: the fake estimator
    :rtype: GradientBoostingRegressor
    """
    gbt = GradientBoostingRegressor(learning_rate=learning_rate, init="zero")
    gbt.estimators_ = estimators
    # `n_features` was deprecated in sklearn 0.19 in favor of `n_features_`.
    # Warning: `n_features_` will be probably be deprecated in sklearn 1.0
    #     and removed in 1.2!
    if package_is_at_least(sklearn, "0.19"):
        gbt.n_features_ = n_features
    else:
        gbt.n_features = n_features
    return gbt


def _make_gbt_from_rf(rf, n_features):
    """
    Creates a fake GradientBoostingRegressor from a RandomForestRegressor
    :param RandomForestRegressor rf: the trained random forest
    :param int n_features: number of columns in the train set
    :return: the fake GB regressor
    :rtype: GradientBoostingRegressor
    """
    estimators = np.array([np.array([x]) for x in rf.estimators_])
    return _make_gbt(1.0 / rf.n_estimators, estimators, n_features)


def _make_gbt_from_dt(dt, n_features):
    """
    Creates a fake GradientBoostingRegressor from a DecisionTreeRegressor
    :param DecisionTreeRegressor dt: the trained decision tree
    :param int n_features: number of columns in the train set
    :return: the fake GB regressor
    :rtype: GradientBoostingRegressor
    """
    estimators = np.array([np.array([dt])])
    return _make_gbt(1.0, estimators, n_features)
