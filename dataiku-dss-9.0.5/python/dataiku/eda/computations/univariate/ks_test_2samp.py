# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.computations.computation import UnivariateComputation
from dataiku.eda.exceptions import GroupsAreNotDisjoint
from dataiku.eda.exceptions import NotEnoughDataError
from dataiku.eda.filtering.filter import Filter


class KsTest2Samp(UnivariateComputation):
    TYPE = "ks_test_2samp"

    def __init__(self, column, filter1, filter2):
        super(KsTest2Samp, self).__init__(column)
        self.filter1 = filter1
        self.filter2 = filter2

    @staticmethod
    def build(params):
        return KsTest2Samp(params['column'], Filter.build(params['filter1']), Filter.build(params['filter2']))

    def apply(self, idf, ctx):
        idf1 = self.filter1.apply(idf)
        idf2 = self.filter2.apply(idf)

        if len(idf1 & idf2) > 0:
            raise GroupsAreNotDisjoint()

        series1 = idf1.float_col_no_missing(self.column)
        series2 = idf2.float_col_no_missing(self.column)

        if len(series1) == 0 or len(series2) == 0:
            raise NotEnoughDataError("At least one of the samples is empty")

        statistic, pvalue = sps.ks_2samp(series1, series2)

        return {"type": self.TYPE, "statistic": statistic, "pvalue": pvalue}
