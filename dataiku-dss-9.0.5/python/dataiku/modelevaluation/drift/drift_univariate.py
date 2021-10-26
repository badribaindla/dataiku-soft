import functools
import logging

import numpy as np
import pandas as pd
import scipy.stats as sps
from pandas.api.types import is_numeric_dtype

from dataiku.eda.grouping.binned_grouping import BinnedGrouping

logger = logging.getLogger(__name__)


class DriftUnivariate(object):
    """
    Compute univariate drift

    Input dataframes must have *exactly* the same schema
    """

    def __init__(self, ref_df_prepared, cur_df_prepared, nb_bins, compute_histograms):
        self.ref_df_prepared = ref_df_prepared.copy()
        self.cur_df_prepared = cur_df_prepared.copy()
        self.nb_bins = nb_bins
        self.compute_histograms = compute_histograms

    def compute_drift(self):
        column_results = {}

        for column in self.ref_df_prepared.columns:
            ref_series = self.ref_df_prepared[column]
            cur_series = self.cur_df_prepared[column]
            column_results[column] = self._compute_column(column, ref_series, cur_series)
        return {"columns": column_results}

    def _compute_column(self, column, ref_series, cur_series):
        if is_numeric_dtype(ref_series):
            return self._compute_numerical_column(column, ref_series, cur_series)
        else:
            return self._compute_categorical_column(column, ref_series, cur_series)

    def _compute_numerical_column(self, column, ref_series, cur_series):
        logger.info("Computing numerical column drift: {}".format(column))

        wasserstein = wasserstein_distance(ref_series, cur_series)
        psi = population_stability_index(ref_series, cur_series)
        ks_test_statistic, ks_test_pvalue = ks_test(ref_series, cur_series)

        if self.compute_histograms:
            histogram = comparative_numerical_histogram(ref_series, cur_series, self.nb_bins)
        else:
            histogram = None

        return {
            "type": "NUMERICAL",
            "name": column,
            "histogram": histogram,
            "ksTestStatistic": ks_test_statistic,
            "ksTestPvalue": ks_test_pvalue,
            "populationStabilityIndex": psi,
            "wassersteinDistance": wasserstein
        }

    def _compute_categorical_column(self, column, ref_series, cur_series):
        logger.info("Computing categorical column drift: {}".format(column))

        chi2_test_statistic, chi2_test_pvalue = chi2_test(ref_series, cur_series)
        if self.compute_histograms:
            histogram = comparative_categorical_histogram(ref_series, cur_series, self.nb_bins)
        else:
            histogram = None

        return {
            "type": "CATEGORICAL",
            "name": column,
            "histogram": histogram,
            "chiSquareTestPvalue": chi2_test_pvalue,
            "chiSquareTestStatistic": chi2_test_statistic
        }


def comparative_categorical_histogram(ref_values, cur_values, nb_bins):
    """
    Compute two histograms to compare distributions of a categorical variable between reference & current

    Both histograms share the same axis
    """
    ref_values = pd.Series(ref_values)
    cur_values = pd.Series(cur_values)

    axis_values = pd.concat([ref_values, cur_values]).value_counts()[:nb_bins]

    ref_counts = ref_values.value_counts()[axis_values.index].fillna(0).values
    cur_counts = cur_values.value_counts()[axis_values.index].fillna(0).values

    ref_others_count = len(ref_values) - np.sum(ref_counts)
    cur_others_count = len(cur_values) - np.sum(cur_counts)

    return {
        "binNames": list(axis_values.index),
        "binCountsReference": list(ref_counts) + [ref_others_count],
        "binCountsCurrent": list(cur_counts) + [cur_others_count],
        "rowCountReference": len(ref_values),
        "rowCountCurrent": len(cur_values)
    }


def comparative_numerical_histogram(ref_values, cur_values, nb_bins):
    """
    Compute two histograms to compare distributions of a numerical variable between reference & current

    Both histograms share the same axis
    """
    ref_values = np.array(ref_values)
    cur_values = np.array(cur_values)

    # Remove missing values
    ref_values_no_missing = filter_out_missing_values(ref_values)
    cur_values_no_missing = filter_out_missing_values(cur_values)

    # Compute bin edges on all data
    logger.error(ref_values_no_missing.shape)
    logger.error(cur_values_no_missing.shape)
    all_values_no_missing = np.concatenate([ref_values_no_missing, cur_values_no_missing])
    bin_edges = BinnedGrouping.nice_bin_edges(all_values_no_missing, nb_bins)

    ref_counts, _ = np.histogram(ref_values_no_missing, bin_edges)
    cur_counts, _ = np.histogram(cur_values_no_missing, bin_edges)

    ref_missing_values = len(ref_values) - len(ref_values_no_missing)
    cur_missing_values = len(cur_values) - len(cur_values_no_missing)

    return {
        "binEdges": list(bin_edges),
        "binCountsReference": list(ref_counts),
        "binCountsCurrent": list(cur_counts),
        "nbMissingValuesReference": ref_missing_values,
        "nbMissingValuesCurrent": cur_missing_values,
        "rowCountReference": len(ref_values),
        "rowCountCurrent": len(cur_values)
    }


def population_stability_index(ref_values, cur_values):
    """
    Drift metric for numerical column
    """

    # Filter missing values
    ref_values = filter_out_missing_values(ref_values)
    cur_values = filter_out_missing_values(cur_values)

    if len(ref_values) == 0 or len(cur_values) == 0:
        return None

    # Create 10 buckets constructed from deciles of reference data
    nb_bins = 10.0
    quantiles = np.arange(0, nb_bins + 1) / nb_bins
    bin_edges = _wquantile_linear(ref_values, quantiles, np.ones(len(ref_values)))

    # Let first & last bucket accept all values
    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf

    # Histograms on reference & current data
    ref_percents, _ = np.histogram(ref_values, bin_edges)
    cur_percents, _ = np.histogram(cur_values, bin_edges)

    # Compute frequencies
    ref_percents = ref_percents / float(len(ref_values))
    cur_percents = cur_percents / float(len(cur_values))

    # Cheat a bit with the reality to avoid issues with small numbers (let 0% be 0.1%)
    ref_percents = np.where(ref_percents == 0, 0.001, ref_percents)
    cur_percents = np.where(cur_percents == 0, 0.001, cur_percents)

    # "standard" PSI formula
    psi = np.sum((cur_percents - ref_percents) * np.log(cur_percents / ref_percents))

    return psi if np.isfinite(psi) else None


def filter_out_missing_values(*arrays_to_filter):
    """
    Filter multiple identically-shaped arrays at the same time
    """
    mask = functools.reduce(np.logical_and, (np.isfinite(array) for array in arrays_to_filter))
    ret = tuple(array[mask] for array in arrays_to_filter)
    return ret[0] if len(ret) == 1 else ret


def wasserstein_distance(ref_values, cur_values):
    """
    Drift metric for numerical column
    """

    # Filter missing values
    ref_values = filter_out_missing_values(ref_values)
    cur_values = filter_out_missing_values(cur_values)

    if len(ref_values) == 0 or len(cur_values) == 0:
        return None

    distance = sps.wasserstein_distance(u_values=ref_values, v_values=cur_values)

    return distance if np.isfinite(distance) else None


def ks_test(ref_values, cur_values):
    ref_values = filter_out_missing_values(ref_values)
    cur_values = filter_out_missing_values(cur_values)
    statistic, pvalue = sps.ks_2samp(ref_values, cur_values)
    return (statistic, pvalue) if np.isfinite(pvalue) and np.isfinite(statistic) else (None, None)


def chi2_test(ref_values, cur_values):
    """
    Drift metric for categorical columns

    Null hypothesis: cur_values's distribution follows the empirical distribution of ref_values
    """

    # Make sure all arrays are numpy arrays
    ref_values = np.asarray(ref_values, np.object)
    cur_values = np.asarray(cur_values, np.object)

    # Replace None by "" so that it considered as a value for the test
    ref_values = np.where(np.equal(ref_values, None), "", ref_values)
    cur_values = np.where(np.equal(cur_values, None), "", cur_values)

    # Weighted counts of modalities (in reference)
    ref_contingency = pd.DataFrame({"values": ref_values, "rweights": np.ones(len(ref_values))}) \
        .groupby('values')['rweights'].sum()

    # Weighted counts of modalities (in current)
    cur_contingency = pd.DataFrame({"values": cur_values, "cweights": np.ones(len(cur_values))}) \
        .groupby('values')['cweights'].sum()

    # Ignore "new values" in cur_values since it's going to fail the chi2 test (division by zero)
    # This is not mathematically correct to remove them, but in the context of drift analysis
    # it is safe to assume that "new values" are likely going to be ignored by a ML model
    cur_contingency_filtered = cur_contingency[cur_contingency.index.isin(ref_contingency.index)]

    # Align the counts on the same index & fill the hole with 0
    # (hole = value present in reference but not in current)
    aligned_contingency = pd.concat([ref_contingency, cur_contingency_filtered], axis=1, sort=True).fillna(0)

    # Empirical distribution to be compare with chi2 test
    ref_counts = aligned_contingency["rweights"].values
    cur_counts = aligned_contingency["cweights"].values

    ref_freqs = ref_counts / np.sum(ref_counts)
    cur_freqs = cur_counts / np.sum(cur_counts)
    statistic, pvalue = sps.chisquare(f_exp=ref_freqs, f_obs=cur_freqs)

    return (statistic, pvalue) if np.isfinite(pvalue) and np.isfinite(statistic) else (None, None)


def _wquantile_linear(values, quantiles, weights):
    """
    Weighted quantiles with linear interpolation
    Inspired from: https://github.com/nudomarinero/wquantiles/blob/master/wquantiles.py
    """
    values = np.asarray(values, np.float64)
    quantiles = np.asarray(quantiles, np.float64)
    weights = np.asarray(weights, np.float64)

    sorted_indices = np.argsort(values)
    sorted_data = values[sorted_indices]
    sorted_weights = weights[sorted_indices]
    sorted_weights_cumsum = np.cumsum(sorted_weights)
    weights_sum = sorted_weights_cumsum[-1]
    weighted_quantiles = (sorted_weights_cumsum - 0.5 * sorted_weights) / weights_sum

    return np.interp(quantiles, weighted_quantiles, sorted_data)
