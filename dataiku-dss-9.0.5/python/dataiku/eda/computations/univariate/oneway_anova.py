# coding: utf-8
from __future__ import unicode_literals
# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import scipy.stats as sps

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import GroupsAreNotDisjoint
from dataiku.eda.exceptions import NotEnoughDataError
from dataiku.eda.exceptions import NotEnoughGroupsError
from dataiku.eda.grouping.grouping import Grouping


class OneWayANOVA(UnivariateComputation):
    TYPE = "one_way_anova"

    def __init__(self, column, grouping):
        super(OneWayANOVA, self).__init__(column)
        self.grouping = grouping

    @staticmethod
    def build(params):
        return OneWayANOVA(params['column'], Grouping.build(params["grouping"]))

    def apply(self, idf, ctx):
        idf_no_missing = idf[np.isfinite(idf.float_col(self.column))]
        grouped_idfs = list(self.grouping.compute_groups(idf_no_missing).iter_groups())

        if len(grouped_idfs) < 2:
            raise NotEnoughGroupsError("At least two independent samples are required")

        # Check that the groups are independent:
        # - Sample independence is assumed by ANOVA. If they are not, ANOVA can still be
        #   computed but the result is worthless from a statistical point of view
        # - If the groups are not disjoint then the assumption is clearly violated
        merged = grouped_idfs[0]
        for group_idf in grouped_idfs:
            merged |= group_idf

        summed_size = sum(len(group_idf) for group_idf in grouped_idfs)
        merged_size = len(merged)

        if summed_size != merged_size:
            raise GroupsAreNotDisjoint()

        # Make sure no group is empty
        if any(len(group_idf) == 0 for group_idf in grouped_idfs):
            raise NotEnoughDataError("At least one group is empty")

        # Make sure we have enough data
        if merged_size <= len(grouped_idfs):
            raise NotEnoughDataError("ANOVA requires (at least) one more value than samples")

        samples = [group_idf.float_col(self.column) for group_idf in grouped_idfs]

        statistic, pvalue = sps.f_oneway(*samples)
        return {"type": self.TYPE, "statistic": statistic, "pvalue": pvalue}
