import logging
import os.path as osp
import pandas as pd
import numpy as np
from scipy.stats.mstats_basic import mquantiles

from dataiku.core import dkujson
from dataiku.doctor import constants
from dataiku.doctor.prediction import weighted_quantiles
from dataiku.doctor.utils.split import input_columns

logger = logging.getLogger(__name__)


class HistogramHandler:
    HISTOGRAMS_FILENAME = "distributions_histograms.json"
    NB_MODALITIES_THRESHOLD = 10
    MAX_NB_MODALITIES = 25

    def __init__(self, model_folder):
        self.model_folder = model_folder
        self.histogram_filepath = osp.join(model_folder, self.HISTOGRAMS_FILENAME)

    def compute_and_save(self, df, per_feature, sample_weights=None):
        logger.info("Computing histograms")
        histograms = self.compute_histograms(df, per_feature, sample_weights)
        self.save_histograms(histograms)

    def has_saved_histograms(self):
        return osp.exists(self.histogram_filepath)

    def save_histograms(self, histograms):
        logger.info("Saving histograms")
        serializable_histograms = {}
        for col in histograms:
            serializable_histograms[col] = {
                "distribution": histograms[col]["distribution"].tolist(),
                # Remove nans as json does not like them
                "scale": pd.Series(histograms[col]["scale"]).fillna(constants.FILL_NA_VALUE).tolist()
            }

        dkujson.dump_to_filepath(self.histogram_filepath, serializable_histograms)

    def get_histograms(self):
        """ Load the histograms file in the model folder"""
        histograms = dkujson.load_from_filepath(self.histogram_filepath)

        for col in histograms.keys():
            histograms[col]["distribution"] = np.asarray(histograms[col]["distribution"])
            # replace constants.FILL_NA_VALUE by nans
            histograms[col]["scale"] = pd.Series(histograms[col]["scale"]).replace(constants.FILL_NA_VALUE,
                                                                                   np.nan).values

        return histograms

    @staticmethod
    def compute_histograms(df, per_feature, sample_weights=None):
        """ Compute distribution histogram for each input column
        /!\ Assumes that sample weight DO NOT contain NaN values

        :type df: pd.DataFrame
        :type per_feature: dict
        :type sample_weights: pd.Series
        :return:
        """
        input_features = input_columns(per_feature)
        col_types = {}
        for col in input_features:
            col_types[col] = per_feature[col]["type"]

        histograms = {}
        for col in input_features:
            feature = df[col]
            uniques = pd.unique(feature)  # using pandas unique over numpy because it handles well nan values
            if col_types[col] == constants.NUMERIC and len(uniques) > HistogramHandler.NB_MODALITIES_THRESHOLD:
                histogram = HistogramHandler.compute_histogram_for_numeric_col(feature, sample_weights)
            else:
                histogram = HistogramHandler.compute_histogram_for_categorical_col(feature, uniques, sample_weights)

            histograms[col] = {
                "scale": histogram[0],
                "distribution": histogram[1],
            }

        return histograms

    @staticmethod
    def compute_histogram_for_numeric_col(feature, sample_weights):
        """ Compute bins and their histogram
        :type feature: pd.Series
        :type sample_weights: pd.Series
        :rtype: (np.ndarray, np.ndarray)
        """
        not_nan_mask = feature.notna()
        not_nan_values = feature[not_nan_mask].values
        not_nan_sample_weights = sample_weights[not_nan_mask].values if sample_weights is not None else None

        bins = HistogramHandler._get_binned_not_nan_values(not_nan_values, not_nan_sample_weights)
        hist, bin_edges = np.histogram(not_nan_values, bins=bins, density=False, weights=not_nan_sample_weights)
        centered_bins = np.asarray(
            [bin_edges[i] + (bin_edges[i + 1] - bin_edges[i]) / 2 for i in range(len(bin_edges) - 1)])

        # Add nan in histogram
        number_of_nans = feature.size - not_nan_values.size
        if number_of_nans != 0:
            centered_bins = np.append(centered_bins, np.nan)
            weighted_nan_counts = (np.sum(sample_weights[~not_nan_mask])
                                   if sample_weights is not None else number_of_nans)
            hist = np.append(hist, weighted_nan_counts)

        return centered_bins, hist.astype(float) / np.sum(hist)

    @staticmethod
    def compute_histogram_for_categorical_col(feature, uniques, sample_weights):
        """ Compute histogram on most frequent modalities
        :type feature: pd.Series
        :type uniques: np.ndarray
        :type sample_weights: pd.Series
        :rtype: (np.ndarray, np.ndarray)
        """
        distribution = HistogramHandler._compute_distribution(uniques, feature, sample_weights)
        indices = np.argsort(-distribution)

        if distribution[indices[:HistogramHandler.NB_MODALITIES_THRESHOLD]].sum() >= 0.9:
            nb_modalities_to_keep = HistogramHandler.NB_MODALITIES_THRESHOLD
        else:
            nb_modalities_to_keep = HistogramHandler.MAX_NB_MODALITIES

        kept_indices = indices[:nb_modalities_to_keep]

        # Keep the most frequent
        distribution = distribution[kept_indices]
        distribution /= distribution.sum()
        scale = uniques[kept_indices]
        return scale, distribution

    @staticmethod
    def _get_binned_not_nan_values(values, sample_weights=None):
        """ Compute bins for a numeric value (which does not contains nan values)
        :param values: the non nan values to compute bins on
        :type values: np.ndarray
        :param sample_weights: the sample weights values (same shape as values)
        :type sample_weights: np.ndarray or None
        :return: list of bins
        :rtype np.ndarray
        """
        quantiles_to_compute = np.arange(0.05, 1.1, 0.1)
        if sample_weights is None:
            # np.sort shouldn't be necessary but works around a microbug leading to non-monotonous quantiles.
            # quantiles could include [..., a, b, a, ...] with b < a at the 15 or 16th decimal place,
            # and bins must increase monotonically
            return np.sort(mquantiles(values, prob=quantiles_to_compute))
        else:
            sort_index = values.argsort()
            return weighted_quantiles(values[sort_index], sample_weights[sort_index], quantiles_to_compute)

    @staticmethod
    def _compute_distribution(scale, feature, sample_weights=None):
        if sample_weights is None:
            sample_weights_a = np.ones(feature.shape)
        else:
            # https://pandas.pydata.org/pandas-docs/stable/user_guide/indexing.html#deprecate-loc-reindex-listlike
            sample_weights_a = sample_weights.reindex(feature.index).values
        weighted_counts_list = []
        for modality in scale:
            # Be careful that np.nan != np.nan
            if pd.isna(modality):
                modality_mask = pd.isna(feature.values)
            else:
                modality_mask = feature.values == modality
                
            weighted_count = np.sum(np.nan_to_num(sample_weights_a[modality_mask]))
            weighted_counts_list.append(weighted_count)

        weighted_counts = np.array(weighted_counts_list, dtype=float)
        return weighted_counts / np.sum(weighted_counts)
