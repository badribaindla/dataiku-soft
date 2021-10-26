# coding: utf-8
from __future__ import unicode_literals

from dataiku.eda.computations.bivariate.chi2_ind_test import Chi2IndTest
from dataiku.eda.computations.bivariate.covariance import Covariance
from dataiku.eda.computations.bivariate.fit_curve import FitCurve
from dataiku.eda.computations.bivariate.fit_distribution_2d import FitDistribution2D
from dataiku.eda.computations.bivariate.kendall_tau import KendallTau
from dataiku.eda.computations.bivariate.mutual_information import MutualInformation
from dataiku.eda.computations.bivariate.pearson import Pearson
from dataiku.eda.computations.bivariate.spearman import Spearman
from dataiku.eda.computations.common.count import Count
from dataiku.eda.computations.common.count_groups import CountGroups
from dataiku.eda.computations.common.dummy_computation import DummyComputation
from dataiku.eda.computations.common.grouped_computation import GroupedComputation
from dataiku.eda.computations.common.multi_computation import MultiComputation
from dataiku.eda.computations.computation import Computation
from dataiku.eda.computations.multivariate.fetch_values import FetchValues
from dataiku.eda.computations.multivariate.pca import PCA
from dataiku.eda.computations.univariate.empirical_cdf import EmpiricalCDF
from dataiku.eda.computations.univariate.fit_distribution import FitDistribution
from dataiku.eda.computations.univariate.ks_test_2samp import KsTest2Samp
from dataiku.eda.computations.univariate.kurtosis import Kurtosis
from dataiku.eda.computations.univariate.max import Max
from dataiku.eda.computations.univariate.mean import Mean
from dataiku.eda.computations.univariate.min import Min
from dataiku.eda.computations.univariate.mood_test_nsamp import MoodTestNSamp
from dataiku.eda.computations.univariate.oneway_anova import OneWayANOVA
from dataiku.eda.computations.univariate.pairwise_mood_test import PairwiseMoodTest
from dataiku.eda.computations.univariate.pairwise_ttest import PairwiseTTest
from dataiku.eda.computations.univariate.quantiles import Quantiles
from dataiku.eda.computations.univariate.sem import Sem
from dataiku.eda.computations.univariate.shapiro import Shapiro
from dataiku.eda.computations.univariate.sign_test_1samp import SignTest1Samp
from dataiku.eda.computations.univariate.skewness import Skewness
from dataiku.eda.computations.univariate.std_dev import StdDev
from dataiku.eda.computations.univariate.sum import Sum
from dataiku.eda.computations.univariate.test_distribution import TestDistribution
from dataiku.eda.computations.univariate.ttest_1samp import TTest1Samp
from dataiku.eda.computations.univariate.variance import Variance
from dataiku.eda.computations.univariate.ztest_1samp import ZTest1Samp
from dataiku.eda.curves.curve import Curve
from dataiku.eda.curves.isotonic_curve import IsotonicCurve
from dataiku.eda.curves.polynomial_curve import PolynomialCurve
from dataiku.eda.distributions.beta import Beta
from dataiku.eda.distributions.beta import FittedBeta
from dataiku.eda.distributions.binomial import Binomial
from dataiku.eda.distributions.binomial import FittedBinomial
from dataiku.eda.distributions.distribution import Distribution
from dataiku.eda.distributions.distribution import FittedDistribution
from dataiku.eda.distributions.distribution2d import Distribution2D
from dataiku.eda.distributions.exponential import Exponential
from dataiku.eda.distributions.exponential import FittedExponential
from dataiku.eda.distributions.laplace import FittedLaplace
from dataiku.eda.distributions.weibull import Weibull
from dataiku.eda.distributions.weibull import FittedWeibull
from dataiku.eda.distributions.joint_normal import JointNormal
from dataiku.eda.distributions.kde_2d import KDE2D
from dataiku.eda.distributions.laplace import Laplace
from dataiku.eda.distributions.lognormal import LogNormal, FittedLogNormal
from dataiku.eda.distributions.normal import FittedNormal
from dataiku.eda.distributions.normal import Normal
from dataiku.eda.distributions.normal_mixture import FittedNormalMixture
from dataiku.eda.distributions.normal_mixture import NormalMixture
from dataiku.eda.distributions.pareto import FittedPareto
from dataiku.eda.distributions.pareto import Pareto
from dataiku.eda.distributions.poisson import FittedPoisson
from dataiku.eda.distributions.poisson import Poisson
from dataiku.eda.distributions.triangular import FittedTriangular
from dataiku.eda.distributions.triangular import Triangular
from dataiku.eda.filtering.all_filter import AllFilter
from dataiku.eda.filtering.and_filter import AndFilter
from dataiku.eda.filtering.anum_filter import AnumFilter
from dataiku.eda.filtering.filter import Filter
from dataiku.eda.filtering.interval_filter import IntervalFilter
from dataiku.eda.filtering.missing_filter import MissingFilter
from dataiku.eda.filtering.not_filter import NotFilter
from dataiku.eda.grouping.anum_grouping import AnumGrouping
from dataiku.eda.grouping.binned_grouping import BinnedGrouping
from dataiku.eda.grouping.cross_grouping import CrossGrouping
from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.grouping.merge_grouping import MergeGrouping
from dataiku.eda.grouping.subset_grouping import SubsetGrouping
from dataiku.eda.grouping.union_grouping import UnionGrouping


def load():
    """
        EDA Python engine receives commands as JSON objects and must be able to deserialize them into actual Python
        objects. In order to facilitate this process, each class maintains a registry mapping the JSON's "type" into
        the corresponding Python class.

        This method is responsible for registering deserializable classes (computations, filters, distributions, ...),
        and it must be updated whenever a new one is added.

        Another positive side effect of using registries: it helps avoiding circular imports
    """

    Computation.define(MultiComputation)
    Computation.define(GroupedComputation)
    Computation.define(DummyComputation)
    Computation.define(Mean)
    Computation.define(Sem)
    Computation.define(Kurtosis)
    Computation.define(Skewness)
    Computation.define(Sum)
    Computation.define(StdDev)
    Computation.define(Variance)
    Computation.define(Min)
    Computation.define(Max)
    Computation.define(FitDistribution)
    Computation.define(TestDistribution)
    Computation.define(TTest1Samp)
    Computation.define(ZTest1Samp)
    Computation.define(Quantiles)
    Computation.define(Count)
    Computation.define(CountGroups)
    Computation.define(FetchValues)
    Computation.define(Pearson)
    Computation.define(Spearman)
    Computation.define(MutualInformation)
    Computation.define(Covariance)
    Computation.define(FitCurve)
    Computation.define(KsTest2Samp)
    Computation.define(EmpiricalCDF)
    Computation.define(OneWayANOVA)
    Computation.define(PairwiseTTest)
    Computation.define(PairwiseMoodTest)
    Computation.define(Shapiro)
    Computation.define(KendallTau)
    Computation.define(MoodTestNSamp)
    Computation.define(Chi2IndTest)
    Computation.define(SignTest1Samp)
    Computation.define(PCA)
    Computation.define(FitDistribution2D)

    Grouping.define(UnionGrouping)
    Grouping.define(BinnedGrouping)
    Grouping.define(AnumGrouping)
    Grouping.define(SubsetGrouping)
    Grouping.define(CrossGrouping)
    Grouping.define(MergeGrouping)

    Distribution.define(Normal)
    Distribution.define(NormalMixture)
    Distribution.define(Exponential)
    Distribution.define(LogNormal)
    Distribution.define(Weibull)
    Distribution.define(Triangular)
    Distribution.define(Binomial)
    Distribution.define(Poisson)
    Distribution.define(Beta)
    Distribution.define(Laplace)
    Distribution.define(Pareto)

    Distribution2D.define(KDE2D)
    Distribution2D.define(JointNormal)

    FittedDistribution.define(FittedNormal)
    FittedDistribution.define(FittedNormalMixture)
    FittedDistribution.define(FittedExponential)
    FittedDistribution.define(FittedLogNormal)
    FittedDistribution.define(FittedWeibull)
    FittedDistribution.define(FittedTriangular)
    FittedDistribution.define(FittedLaplace)
    FittedDistribution.define(FittedBinomial)
    FittedDistribution.define(FittedPoisson)
    FittedDistribution.define(FittedBeta)
    FittedDistribution.define(FittedPareto)

    Curve.define(PolynomialCurve)
    Curve.define(IsotonicCurve)

    Filter.define(MissingFilter)
    Filter.define(AllFilter)
    Filter.define(AnumFilter)
    Filter.define(NotFilter)
    Filter.define(IntervalFilter)
    Filter.define(AndFilter)
