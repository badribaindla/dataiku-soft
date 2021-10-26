#!/usr/bin/env python
# encoding: utf-8

"""
Perform the initial feature analysis that will drive the actual preprocessor for prediction
Takes the preprocessing params and the train dataframe and outputs the feature analysis data.
"""
import numpy as np
import logging
import math

from dataiku.base.utils import safe_unicode_str, safe_exception
from dataiku.core import dkujson
from dataiku.doctor import constants
from dataiku.doctor.constants import FILL_NA_VALUE
from dataiku.doctor.utils import dtype_is_m8s
from dataiku.doctor.utils import dku_deterministic_value_counts

NULL_CAT = 'NULL_Value'

logger = logging.getLogger(__name__)

class PreprocessingDataCollector(object):

    def __init__(self, train_df, preprocessing_params):
        self.df = train_df
        self.preprocessing_params = preprocessing_params
        self.ret = {}

    def build(self):
        self.ret["per_feature"] = {}
        # The feature_order array is used to ensure that we will always use
        # the same ordering accross the bench and all recipes using this
        # modeling project, to have consistent matrices between train and score
        self.ret["feature_order"] = []
        for vname in self.preprocessing_params["per_feature"].keys():
            self.ret["feature_order"].append(vname)
            per_feature_params = self.preprocessing_params["per_feature"][vname]
            if vname in self.df:
                self.ret["per_feature"][vname] = self.get_feature_analysis_data(vname, per_feature_params)
        # make sure that we end up with unicode string,
        # exactly as when we will reload these results from the disk.
        return dkujson.loads(dkujson.dumps(self.ret))

    def get_feature_analysis_data(self, name, params):
        """Analyzes a single feature (preprocessing params -> feature analysis data)
        params is the preprocessing params for this feature.
            It must contain:
            - name, type, role (role_reason)
            - missing_handling, missing_impute_with, category_handling, rescaling
            """
        output = {"stats": {}}
        logger.info("Looking at %s... (type=%s)" % (name, params["type"]))
        series = self.df[name]

        # First collect basic stats
        if self.feature_needs_analysis(params):
            if params["type"] == 'NUMERIC':
                logger.info("Checking series of type: %s (isM8=%s)" % (series.dtype, dtype_is_m8s(series.dtype)))

                if np.isinf(series).any():
                    raise safe_exception(ValueError, u"Numeric feature '{}' contains Infinity values".format(safe_unicode_str(name)))

                output['stats'] = {
                    'min': series.min(),
                    'average': series.mean(),
                    'median': series.median(),
                    'max': series.max(),
                    'p99': series.quantile(0.99),
                    'std': series.std()
                }

                #If we are imputing missings, get the actual value to impute with
                if params.get("missing_handling", None) == "IMPUTE":
                    if math.isnan(output['stats']['min']):
                        raise safe_exception(ValueError, u"Numeric feature {} is empty".format(safe_unicode_str(name)))
                    elif params["missing_impute_with"] == "MEAN":
                        output["missing_impute_with_value"] = output["stats"]["average"]
                    elif params["missing_impute_with"] == "MEDIAN":
                        output["missing_impute_with_value"] = output["stats"]["median"]
                    elif params["missing_impute_with"] == "CONSTANT":
                        output["missing_impute_with_value"] = params["impute_constant_value"]
            elif params["type"] == "CATEGORY":
                value_counts = dku_deterministic_value_counts(series)
                if len(value_counts) > 0:
                    output['stats'].update({
                        'mostFrequentValue': value_counts.index[0],
                        'leastFrequentValue': value_counts.index[-1]
                    })
                else:
                    output['stats'].update({
                        'mostFrequentValue': NULL_CAT,
                        'leastFrequentValue': NULL_CAT
                    })
                 #If we are imputing missings, get the actual value to impute with
                if params.get("missing_handling", "NONE") == "IMPUTE":
                    if params["missing_impute_with"] == "MODE":
                        output["missing_impute_with_value"] = output["stats"]["mostFrequentValue"]
                    elif params["missing_impute_with"] == "CONSTANT":
                        output["missing_impute_with_value"] = params["impute_constant_value"]
                    else:
                        raise Exception("Unknown imputation method")

                # Compute statistics (used for dummify, profiling, interactive scoring...)
                if params.get("missing_handling", "NONE") == "IMPUTE" and params["missing_impute_with"] == "CREATE_CATEGORY":
                    series = series.fillna(NULL_CAT)
                category_stats = dku_deterministic_value_counts(series, dropna=False)
                # prune unused categories
                method = params.get("dummy_clip", "MAX_NB_CATEGORIES")
                should_drop = params.get("dummy_drop", "NONE") == "DROP"
                if method == "MAX_NB_CATEGORIES":
                    to_take = int(params.get("max_nb_categories", 50))
                    candidates = [(k, v) for (k, v) in category_stats.iloc[0:(to_take+1)].iteritems()]
                elif method == "MIN_SAMPLES":
                    safety_max = int(params["max_cat_safety"])
                    min_samples = int(params["min_samples"])
                    candidates = [(k, v) for (k, v) in category_stats.iloc[0:safety_max].iteritems() if v >= min_samples]
                else:
                    safety_max = int(params["max_cat_safety"])
                    cum_prop = float(params["cumulative_proportion"])
                    limit = int(cum_prop * series.shape[0]) # would work with category_stats.sum() too
                    # reverse and compute cumulative sum
                    cumsummed = category_stats.sort_values(ascending=False).iloc[0:safety_max].cumsum()
                    candidates = [(k, category_stats.loc[k]) for (k, v) in cumsummed.iteritems() if v <= limit]
                # drop one level if we pruned nothing but should still drop something
                if len(candidates) == len(category_stats) and should_drop:
                    dropped_modality = candidates[-1][0]
                    if isinstance(dropped_modality, float) and np.isnan(dropped_modality):
                        output["dropped_modality"] = FILL_NA_VALUE
                    else:
                        output["dropped_modality"] = dropped_modality
                    candidates = candidates[0: len(candidates) - 1]
                # We may have added NA as a candidate (so as to properly count it for cumsum)
                # so remove it now
                candidates = [(k, v) for (k, v) in candidates if not (isinstance(k, float) and np.isnan(k))]
                # split in 2 lists
                output[constants.CATEGORY_POSSIBLE_VALUES] = [k for (k, v) in candidates]
                output[constants.CATEGORY_POSSIBLE_COUNTS] = [v for (k, v) in candidates]

            elif params["type"] == "TEXT":
                output["missing_impute_with_value"] = ""
            elif params["type"] == "VECTOR":
                output["is_vector"] = True

                # Finding vector length
                try:
                    first_line = dkujson.loads(series.dropna().iloc[0])
                    output["vector_length"] = len(first_line)
                except (ValueError, TypeError) as e:
                    raise safe_exception(ValueError, u"Invalid vector data in column '{}': {}".format(safe_unicode_str(name), safe_unicode_str(e)))

                if params.get("missing_handling", "NONE") == "IMPUTE":
                    if params["missing_impute_with"] == "MODE":
                        value_counts = series.value_counts()
                        output["missing_impute_with_value"] = value_counts.index[0]
                    elif params["missing_impute_with"] == "CONSTANT":
                        # Must create vector with appropriate size filled with single value equal to
                        # 'params["impute_constant_value"]'
                        impute_val = "[" + ",".join([params["impute_constant_value"]] * output["vector_length"]) + "]"
                        output["missing_impute_with_value"] = impute_val
        return output


class PredictionPreprocessingDataCollector(PreprocessingDataCollector):
    def __init__(self, train_df, preprocessing_params):
        PreprocessingDataCollector.__init__(self, train_df, preprocessing_params)

    def feature_needs_analysis(self, params):
        """params is the params object from preprocessing params"""
        return params["role"] in ("INPUT", "WEIGHT")


class ClusteringPreprocessingDataCollector(PreprocessingDataCollector):
    def __init__(self, train_df, preprocessing_params):
        PreprocessingDataCollector.__init__(self, train_df, preprocessing_params)

    def feature_needs_analysis(self, params):
        """params is the params object from preprocessing params"""
        return params["role"] in ("INPUT", "PROFILING")
