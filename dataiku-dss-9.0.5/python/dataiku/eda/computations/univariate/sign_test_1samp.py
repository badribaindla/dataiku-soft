# coding: utf-8
from __future__ import unicode_literals

import scipy.stats as sps

from dataiku.eda.computations.computation import UnivariateComputation


class SignTest1Samp(UnivariateComputation):
    TYPE = "sign_test_1samp"

    def __init__(self, column, hypothesized_median):
        super(SignTest1Samp, self).__init__(column)
        self.hypothesized_median = hypothesized_median

    @staticmethod
    def build(params):
        return SignTest1Samp(params['column'], params['hypothesizedMedian'])

    def apply(self, idf, ctx):
        series = idf.float_col_no_missing(self.column)

        # Values equal to 'hypothesized_median' are discarded
        nb_larger = (series > self.hypothesized_median).sum()
        nb_smaller = (series < self.hypothesized_median).sum()
        total = nb_smaller + nb_larger

        pvalue = sps.binom_test(nb_larger, total, 0.5, alternative='two-sided')
        pvalue_alt_gt = sps.binom_test(nb_larger, total, 0.5, alternative='greater')
        pvalue_alt_lt = sps.binom_test(nb_larger, total, 0.5, alternative='less')

        return {
            "type": self.TYPE,
            "pvalue": pvalue,
            "pvalueAltGt": pvalue_alt_gt,
            "pvalueAltLt": pvalue_alt_lt,
            "nbLarger": nb_larger,
            "nbSmaller": nb_smaller
        }
