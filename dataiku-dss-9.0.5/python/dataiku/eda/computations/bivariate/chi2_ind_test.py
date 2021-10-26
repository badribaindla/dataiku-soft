# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps

from dataiku.eda.computations.computation import Computation
from dataiku.eda.exceptions import NotEnoughDataError
from dataiku.eda.grouping.cross_grouping import CrossGrouping
from dataiku.eda.grouping.grouping import Grouping


# Chi2 independence test
class Chi2IndTest(Computation):
    TYPE = "chi2_ind_test"

    def __init__(self, x_grouping, y_grouping):
        self.x_grouping = x_grouping
        self.y_grouping = y_grouping

    @staticmethod
    def build(params):
        return Chi2IndTest(
            Grouping.build(params["xGrouping"]),
            Grouping.build(params["yGrouping"])
        )

    def apply(self, idf, ctx):
        # Cross the two axis in order to build the contingency matrix
        grouping = CrossGrouping([self.x_grouping, self.y_grouping])
        crossed_groups = grouping.compute_groups(idf)
        cross_size = [len(group_idf) for group_idf in crossed_groups.iter_groups()]
        x_size = len(crossed_groups.groups[0])
        y_size = len(crossed_groups.groups[1])

        # Minimum contingency matrix size is 2x2
        if x_size < 2 or y_size < 2:
            raise NotEnoughDataError("X and Y variables must contain at least two distinct values")

        # Chi2 test with Yates' correction
        contingency_matrix = np.reshape(cross_size, [x_size, y_size])
        statistic, pvalue, dof, expected = sps.chi2_contingency(contingency_matrix, correction=True)

        # Check whether the result are likely to be incorrect based on usual heuristics
        # => https://sites.google.com/a/lakeheadu.ca/bweaver/Home/statistics/notes/chisqr_assumptions
        warnings = []

        if dof == 1:
            # When contingency matrix is 2x2

            if np.any(expected.ravel() < 5):
                warnings.append("Chi-squared approximation may be incorrect because at least one expected count is < 5")

        else:
            # When contingency matrix is larger than 2x2

            if (expected.ravel() < 5).sum() > 0.2 * expected.size:
                warnings.append(
                    "Chi-squared approximation may be incorrect because more than 20% of expected counts are < 5")

            if np.any(expected.ravel() < 1):
                warnings.append("Chi-squared approximation may be incorrect because some expected counts are < 1")

        return {
            "type": self.TYPE,
            "statistic": statistic,
            "pvalue": pvalue,
            "dof": dof,
            "warnings": warnings
        }
