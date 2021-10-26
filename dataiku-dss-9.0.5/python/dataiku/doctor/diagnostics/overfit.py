# coding: utf-8
from __future__ import unicode_literals
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.ensemble import RandomForestClassifier
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeRegressor
from sklearn.tree import DecisionTreeClassifier

from dataiku.doctor import constants
from dataiku.doctor.diagnostics import diagnostics
from dataiku.doctor.diagnostics.diagnostics import DiagnosticType


OVERFITTED_LEAVES_THRESHOLD = 0.1
OVERFITTED_TREES_THRESHOLD = 0.5


class TreeOverfitDiagnostic(diagnostics.DiagnosticCallback):
    """ See in the documentation machine-learning/diagnostics.html#overfitting-detection """
    def __init__(self):
        super(TreeOverfitDiagnostic, self).__init__(DiagnosticType.ML_DIAGNOSTICS_TRAINING_OVERFIT)

    def on_fitting_end(self, prediction_type=None, clf=None, train_target=None, features=None):
        diagnostics = []
        if prediction_type is not None and clf is not None and train_target is not None:
            size = train_target.shape[0]
            self.check_tree_size(diagnostics, prediction_type, clf, size)
        return diagnostics

    @staticmethod
    def check_tree_size(diagnostics, prediction_type, clf, size):
        if prediction_type == constants.REGRESSION:
            n_leaves = get_n_leaves_of_regressor(clf)
            if len(n_leaves) == 0:
                return

            n_leaves = np.array(n_leaves)
            overfitted_trees = (n_leaves / size) > OVERFITTED_TREES_THRESHOLD
            if (1.0 * np.sum(overfitted_trees) / overfitted_trees.shape[0]) > OVERFITTED_LEAVES_THRESHOLD:
                diagnostics.append("Number of tree leaves ({}) is too large with respect to dataset size ({})".format(n_leaves.max(), size))

        elif prediction_type in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
            classifiers_with_leaves = (DecisionTreeClassifier, RandomForestClassifier, ExtraTreesClassifier)
            if not isinstance(clf, classifiers_with_leaves):
                return

            impurity_set = set()
            if hasattr(clf, "estimators_"):
                for impurities in (get_impurities(tree) for tree in clf.estimators_):
                    impurity_set.update(impurities)
            else:
                impurity_set.update(get_impurities(clf))
            if impurity_set == {0.}:
                if isinstance(clf, ExtraTreesClassifier):
                    algorithm = "Extra trees"
                elif isinstance(clf, RandomForestClassifier):
                    algorithm = "Random forest"
                elif isinstance(clf, DecisionTreeClassifier):
                    algorithm = "Decision tree"
                else:
                    algorithm = "model"
                diagnostics.append("The {} seems to have overfit the train set, all the leaves in the model are pure".format(algorithm))


def get_impurities(tree):
    # round values to 0 if too small
    return [0 if v < 1e-6 else v for v in tree.tree_.impurity[get_leaves_indices(tree)]]


def get_leaves_indices(tree):
    return np.logical_and(tree.tree_.children_left == -1, tree.tree_.children_right == -1)


def _get_tree_n_leaves(clf):
    # Was added in scikit 0.21, use it if available: https://scikit-learn.org/stable/whats_new/v0.21.html
    if hasattr(clf, "get_n_leaves"):
        return clf.get_n_leaves()

    # Otherwise, compute it (https://github.com/scikit-learn/scikit-learn/pull/12300/files/cf3a9286a3613392a82b3cc0c7c48b691abb881f#diff-a2cead4f3702cc4b9f76562bb2777edbR578-R581)
    return np.sum(get_leaves_indices(clf))


def get_n_leaves_of_regressor(clf):
    if isinstance(clf, DecisionTreeRegressor):
        return [_get_tree_n_leaves(clf)]
    elif isinstance(clf, (RandomForestRegressor, ExtraTreesRegressor)):
        n_leaves = [_get_tree_n_leaves(tree) for tree in clf.estimators_]
        return n_leaves
    return []
