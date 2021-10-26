""" Preprocessing takes a dataframe as an input,
and returns a dataframe as an output.

At the end of the pipeline, the matrix underlying the dataframe
should be ready to use for scikit-learn's ML algorithm.
"""
import logging, re, sys
import os
import pandas as pd
import numpy as np
import scipy
from numbers import Number

from dataiku.base.utils import RaiseWithTraceback
from dataiku.base.utils import safe_exception
from dataiku.base.utils import safe_unicode_str
from dataiku.base.utils import encode_utf8
from dataiku.core import dkujson as dkujson
from dataiku.doctor import utils
from dataiku.doctor.diagnostics.clustering_parameters import check_outliers_parameters
import dataiku
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from dataiku.doctor import constants
from dataiku.doctor.preprocessing.assertions import MLAssertion
from dataiku.doctor.preprocessing.assertions import MLAssertions
from ..multiframe import *
from six.moves import xrange
import json

preproc_logger = logging.getLogger(constants.PREPROCESSING_LOGGER_NAME)

preproc_logger.setLevel(logging.DEBUG)


class GeneratedFeaturesMapping:
    TO_ONE_FEATURE = "to_one_feature"
    ONE_FEATURE_PER_COLUMN = "one_feature_per_column"

    def __init__(self):
        self.mapping = {}

    def add_whole_block_mapping(self, block_name, original_name):
        self.mapping[block_name] = {
            "type": self.TO_ONE_FEATURE,
            "original_name": original_name
        }

    def add_per_column_mapping(self, block_name, original_name, new_name):
        if block_name not in self.mapping:
            self.mapping[block_name] = {"type": self.ONE_FEATURE_PER_COLUMN, "values": {}}
        self.mapping[block_name]["values"][new_name] = original_name

    def should_send_block_to_one_feature(self, block_name):
        if block_name not in self.mapping:
            return False
        else:
            return self.mapping[block_name]["type"] == self.TO_ONE_FEATURE

    def get_whole_block_original(self, block_name):
        return self.mapping[block_name]["original_name"]

    def get_per_column_original(self, block_name, new_name):
        if block_name not in self.mapping or new_name not in self.mapping[block_name]["values"]:
            return new_name
        else:
            return self.mapping[block_name]["values"][new_name]


def append_sparse_with_prefix(current_mf, prefix, input_column_name, matrix, generated_features_mapping):
    block_name = prefix + input_column_name
    generated_features_mapping.add_whole_block_mapping(block_name, input_column_name)
    current_mf.append_sparse(block_name, matrix)


class Step(object):
    """
    Since the steps are used in a pipeline,
    it really makes no sense to have a "fit" or "partial_fit" on them.
    All which must be "fitted" but that must be handled in stream is
    managed by preprocessing collector
    """

    def __init__(self, output_name=None):
        self.output_name = output_name

    def init_resources(self, resources_handler):
        pass

    def report_fit(self, ret_obj, core_params):
        # No report by default
        pass

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        # Default implem: no fitting
        return self.process(input_df, current_mf, output_ppr, generated_features_mapping)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        raise NotImplementedError()

    @staticmethod
    def drop_rows(idx, current_mf, input_df):
        # Always execute both actions together
        current_mf.drop_rows(idx)
        input_df.drop(input_df.index[utils.series_nonzero(idx)], inplace=True)

    def __str__(self,):
        return "Step:" + self.__class__.__name__


class ExtractMLAssertionMasksNbInitialRows(Step):
    def __init__(self, assertions, output_name=None):
        super(ExtractMLAssertionMasksNbInitialRows, self).__init__(output_name)
        self.assertions = assertions

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if self.assertions is not None:
            assertions_list = MLAssertions()
            for assertion_params in self.assertions:
                assertion_col_name = MLAssertion.assertion_col_name(assertion_params)
                if assertion_col_name not in input_df.columns:
                    # Should only happen for train set, for which we do not compute assertions
                    preproc_logger.debug(u"assertion column for assertion {} not found, "
                                         u"skipping computation".format(safe_unicode_str(assertion_params["name"])))
                    continue
                assertion_mask = input_df[assertion_col_name]
                assertions_list.add_assertion(MLAssertion(assertion_params, np.sum(assertion_mask)))

            if len(assertions_list) > 0:
                output_ppr["assertions"] = assertions_list


class ExtractMLAssertionMasks(Step):

    def __init__(self, assertions, output_name=None):
        super(ExtractMLAssertionMasks, self).__init__(output_name)
        self.assertions = assertions

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if self.assertions is not None:
            for idx, assertion_params in enumerate(self.assertions):
                assertion_col_name = MLAssertion.assertion_col_name(assertion_params)
                if assertion_col_name not in input_df.columns:
                    # Should only happen for train set, for which we do not compute assertions
                    preproc_logger.debug(u"assertion column for assertion {} not found, "
                                         u"skipping computation".format(safe_unicode_str(assertion_params["name"])))
                    continue
                output_ppr["assertions"].assertions[idx].mask = input_df[assertion_col_name]


class DropNARows(Step):
    """ Drop rows containing any NA value in all DataFrame and np array
     blocks of the current multiframe. """
    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        # For each block, the "idx" array contains an array of boolean indicators about
        # whether this line has nans
        idx = []

        for (name, blk) in current_mf.iter_blocks():
            if isinstance(blk, NamedNPArray):
                this_idx = np.any(np.isnan(blk.array), axis=1)
                idx.append(this_idx)
            elif isinstance(blk, DataFrameWrapper):
                this_idx = blk.df.isnull().any(axis=1)
                idx.append(this_idx)
            # Scipy matrixes are not supposed to contain nas
        deletion_mask = np.logical_or.reduce(idx)
        preproc_logger.debug("Deleting %s rows" % deletion_mask.sum())
        current_mf.drop_rows(deletion_mask)

class SingleColumnDropNARows(Step):
    """ Drop rows containing any NA value in input_df"""

    def __init__(self, column_name):
        self.column_name = column_name

    def __str__(self,):
        return "Step:%s (%s)" % (self.__class__.__name__, self.column_name)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        idx = input_df[self.column_name].isnull()
        preproc_logger.debug("Deleting %s rows" % idx.sum())
        Step.drop_rows(idx, current_mf, input_df)
        preproc_logger.info("After SCDNA input_df=%s" % str(input_df.shape))

    def init_resources(self, resources_handler):
        super(SingleColumnDropNARows, self).init_resources(resources_handler)
        drop = resources_handler.get_resource("drop_rows", "json")
        if "columns" not in drop:
            drop["columns"] = []
        drop["columns"].append(self.column_name)


class SpecialOutputsDropNARows(Step):
    """Drop rows for which at least one of a selection of special columns (present in output_ppr) is na."""

    def __init__(self, column_names, output_name=None, allow_empty_mf=False):
        super(SpecialOutputsDropNARows, self).__init__(output_name)
        self.allow_empty_mf = allow_empty_mf
        self.column_names = column_names

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        for n in self.column_names:
            assert(n in output_ppr)
        outputs = {n: output_ppr[n] for n in self.column_names}
        idx = None
        for col in outputs.values():
            if isinstance(col, pd.DataFrame):
                for subcol in col.iteritems():
                    subcol_nulls = subcol[1].isnull()
                    idx = idx | subcol_nulls if idx is not None else subcol_nulls
            else:
                if isinstance(col, pd.Series):
                    subcol_nulls = col.isnull()
                    idx = idx | subcol_nulls if idx is not None else subcol_nulls
                else:
                    raise Exception("Unexpected col type")

        preproc_logger.debug("Deleting {} rows because one of {} is missing".format(idx.sum(), self.column_names))

        preproc_logger.debug("MF before = {}".format(str(current_mf.shape())))
        for col_name, col_value in outputs.items():
            preproc_logger.debug("{} before = {}".format(col_name, str(col_value.shape)))

        for col_name in self.column_names:
            cur_target = outputs[col_name]
            cur_target = cur_target.loc[cur_target.index[~idx]]
            output_ppr[col_name] = cur_target

        num_rows_before = current_mf.shape()[0]

        Step.drop_rows(idx, current_mf, input_df)
        preproc_logger.debug("After DRWNT input_df=%s" % str(input_df.shape))

        nb_rows_after = current_mf.shape()[0]
        # We may want to allow empty multiframe for KERAS backend. When you only have "Special" features,
        # they are only created at process time, so for the first fit_and_process, the current_mf will be
        # empty. Also used for subpopulation computation.
        if nb_rows_after == 0 and ((not self.allow_empty_mf) or (num_rows_before > 0)):
            raise DkuDroppedMultiframeException(
                "{} values all empty or with unknown classes (you may need to recompute the training set)".format(
                    self.column_names))

        preproc_logger.debug("MF after = %s" % str(current_mf.shape()))
        for col_name, col_value in outputs.items():
            preproc_logger.debug("{} after = {}".format(col_name, str(col_value.shape)))


class DropRowsWhereNoTarget(SpecialOutputsDropNARows):
    """Drop rows for which the target is na (probably because it was an unknown class)"""

    def __init__(self, output_name=None, allow_empty_mf=False):
        super(DropRowsWhereNoTarget, self).__init__(["target"], output_name, allow_empty_mf)


class DropRowsWhereNoTargetOrNoPrediction(SpecialOutputsDropNARows):
    """Drop rows for which the target is na or the prediction is na"""

    def __init__(self, output_name=None, allow_empty_mf=False,  has_probas=False):
        super(DropRowsWhereNoTargetOrNoPrediction, self).__init__(
            ["target", "prediction"] + ([constants.PROBA_COLUMNS] if has_probas else []),
            output_name, allow_empty_mf)


class DropRowsWhereNoTargetOrNoWeight(SpecialOutputsDropNARows):
    """Drop rows for which the target is na or the weight is na (probably because it was an unknown class)"""

    def __init__(self, output_name=None, allow_empty_mf=False):
        super(DropRowsWhereNoTargetOrNoWeight, self).__init__(["target", "weight"], output_name, allow_empty_mf)


class DropRowsWhereNoTargetOrNoWeightOrNoPrediction(SpecialOutputsDropNARows):
    """Drop rows for which the target is na or the weight is na (probably because it was an unknown class) or the prediction is na"""

    def __init__(self, output_name=None, allow_empty_mf=False, has_probas=False):
        super(DropRowsWhereNoTargetOrNoWeightOrNoPrediction, self).__init__(
            ["target", "weight", "prediction"] + ([constants.PROBA_COLUMNS] if has_probas else []),
            output_name, allow_empty_mf)


class ExtractColumn(Step):
    """Extracts a single column from the current multiframe and puts it as a Series
    in result"""

    __slots__ = ('column_name', 'output_name')

    def __init__(self, column_name, output_name):
        self.column_name = column_name
        self.output_name = output_name

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        for (name, df) in current_mf.iter_dataframes():
            if self.column_name in df:
                output_ppr[self.output_name] = df([self.column_name])
                del df[self.column_name]
                return
        raise Exception("Unknown column %s" % self.column_name)


def add_column_to_builder(builder, new_column, feature, series, generated_features_mapping):
    builder.add_column(
        new_column,
        series
    )
    generated_features_mapping.add_per_column_mapping(builder.prefix, feature, builder.prefix + ":" + new_column)

class FlagMissingValue2(Step):
    def __init__(self, feature, output_block_name):
        self.feature = feature
        self.output_block_name = output_block_name

    def _output_name(self):
        return self.output_block_name + ":" + self.feature + ":not_missing"

    def init_resources(self, resources_handler):
        map = resources_handler.get_resource("flagged", "json")
        if "columns" not in map:
            map["columns"] = []
            map["output_names"] = []
        map["columns"].append(self.feature)
        map["output_names"].append(self._output_name())

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        new_column = "%s:not_missing" % self.feature
        builder = current_mf.get_df_builder(self.output_block_name)

        add_column_to_builder(builder, new_column, self.feature, input_df[self.feature].notnull().astype(float),
                              generated_features_mapping)



class FlushDFBuilder(Step):
    def __init__(self, block_name):
        self.block_name = block_name

    def __str__(self):
        return "Step:FlushDFBuilder(%s)" % self.block_name

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if current_mf.has_df_builder(self.block_name):
            current_mf.flush_df_builder(self.block_name)


class OutputRawColumns(Step):
    """Copy a value from input df to an output key.
    Used for target.
    Makes a deep copy"""

    def __init__(self, column_names, output_name):
        self.column_names = column_names
        self.output_name = output_name
        self.values_map = None

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        output_ppr[self.output_name] = input_df[self.column_names].copy()


class RemapValueToOutput(Step):
    """Remap a value from input df to an output key as a series.
    Used for target.
    Makes a deep copy"""

    __slots__ = ('values_map',)

    def __init__(self, column_name, output_name, values_map):
        self.column_name = column_name
        self.output_name = output_name
        if values_map is not None:
            if sys.version_info > (3, 0):
                self.values_map = { k: v for k, v in values_map.items() }
            else:
                self.values_map = {
                    k.encode("utf-8"): v
                    for k, v in values_map.items()
                }
        else:
            self.values_map = None

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        serie = input_df[self.column_name].copy()

        if self.values_map is not None and len(self.values_map) > 0:
            serie = serie.astype(str).map(self.values_map)
            nb_null = serie.isnull().sum()
            if nb_null > 0:
                preproc_logger.warning("Found %s nulls in target" % nb_null)
        else:
            serie = serie
        output_ppr[self.output_name] = serie

class RealignTarget(Step):
    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        series = output_ppr["target"]
        main_index = current_mf.index
        preproc_logger.debug("Realign target series = %s" % str(series.shape))
        series = series.loc[main_index]
        preproc_logger.debug("After realign target: %s" % str(series.shape))
        output_ppr["target"] = series

class RealignWeight(Step):
    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        series = output_ppr["weight"]
        main_index = current_mf.index
        preproc_logger.debug("Realign weight series = %s" % str(series.shape))
        series = series.loc[main_index]
        preproc_logger.debug("After realign weight: %s" % str(series.shape))
        output_ppr["weight"] = series

class CopyMultipleColumnsFromInput(Step):
    def __init__(self, columns, output_block_name):
        self.columns = columns
        self.output_block_name = output_block_name

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        new_df = input_df[self.columns].copy()
        current_mf.append_df(self.output_block_name, new_df)


class MultipleImputeMissingFromInput(Step):
    """Multi-column impute missing values.
    A sub-df is extracted from the input df and series are fillna-ed.

    The sub-df is added as a single output block
    """
    def __init__(self, impute_map, output_block_name, keep_output_block, as_categorical):
        self.impute_map = impute_map
        self.output_block_name = output_block_name
        self.keep_output_block = keep_output_block
        self.as_categorical = as_categorical

    def init_resources(self, resources_handler):
        resource = resources_handler.get_resource("imputed", "json")
        if "num_columns" not in resource:
            resource["num_columns"] = []
            resource["num_values"] = []
            resource["cat_columns"] = []
            resource["cat_values"] = []
        for (col, val) in self.impute_map.items():
            if self.as_categorical:
                resource["cat_columns"].append(col)
                resource["cat_values"].append(val)
            else:
                resource["num_columns"].append(col)
                resource["num_values"].append(val)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if preproc_logger.isEnabledFor(logging.DEBUG):
            preproc_logger.debug("MIMIFI: Imputing with map %s" % self.impute_map)
        columns = self.impute_map.keys()
        out = {}

        if not len(self.impute_map):
            return

        # TODO: Might be faster to fillna(inplace)

        for (col, val) in self.impute_map.items():
            if val is None:
                out[col] = input_df[col]
                continue
            if self.as_categorical:
                series = input_df[col].astype(object)
            else:
                series = input_df[col]
            out[col] = series.fillna(val)

        out_df = pd.DataFrame(out)
        current_mf.append_df(self.output_block_name, out_df, self.keep_output_block)


class NumericalNumericalInteraction(Step):
    def __init__(self, out_block, column_1, column_2, rescale):
        super(NumericalNumericalInteraction, self).__init__()
        self.out_block = out_block
        self.column_1 = column_1
        self.column_2 = column_2
        self.rescale = rescale
        self.shift = None
        self.inv_scale = None
        self.json_data = None

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if self.rescale:
            s = input_df[self.column_1] * input_df[self.column_2]
            self.shift = np.mean(s)
            self.inv_scale = 1.0 / np.std(s)
        else:
            self.shift = 0.0
            self.inv_scale = 1.0

        if "column_1" not in self.json_data:
            self.json_data["column_1"] = []
            self.json_data["column_2"] = []
            self.json_data["rescale"] = []
            self.json_data["shift"] = []
            self.json_data["inv_scale"] = []
        self.json_data["column_1"].append(self.column_1)
        self.json_data["column_2"].append(self.column_2)
        self.json_data["rescale"].append(self.rescale)
        self.json_data["shift"].append(self.shift)
        self.json_data["inv_scale"].append(self.inv_scale)
        return self.process(input_df, current_mf, output_ppr, generated_features_mapping)

    def _output_name(self):
        return "%s:%s" % (self.column_1, self.column_2)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):

        def make_series(n):
            try:
                if n in current_mf.get_block("NUM_IMPUTED").df:
                    return current_mf.get_block("NUM_IMPUTED").df[n]
            except KeyError:
                pass
            return input_df[n]

        s = make_series(self.column_1) * make_series(self.column_2)
        if self.rescale:
            s = (s - self.shift) * self.inv_scale
        builder = current_mf.get_df_builder(self.out_block)
        builder.add_column(self._output_name(), s)

    def init_resources(self, resources_handler):
        super(NumericalNumericalInteraction, self).init_resources(resources_handler)
        self.json_data = resources_handler.get_resource("num_num", "json")
        if "column_1" in self.json_data:
            i = 0
            for c1, c2 in zip(self.json_data["column_1"], self.json_data["column_2"]):
                if c1 == self.column_1 and c2 == self.column_2:
                    self.rescale = self.json_data["rescale"][i]
                    self.shift = self.json_data["shift"][i]
                    self.inv_scale = self.json_data["inv_scale"][i]
                    break
                i += 1


class NumericalCategoricalInteraction(Step):
    def __init__(self, out_block, cat, num, max_features):
        super(NumericalCategoricalInteraction, self).__init__()
        self.out_block = out_block
        self.cat = cat
        self.num = num
        self.values = None
        self.max_features = max_features
        self.json_data = None

    def _make_series(self, current_mf, input_df, block, n):
        try:
            if n in current_mf.get_block(block).df:
                return current_mf.get_block(block).df[n]
        except KeyError:
            pass
        return input_df[n]

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        # we could get the values from the collector, but it turns out we only compute those necessary for dummification,
        # so we may have missing values ...

        series = self._make_series(current_mf, input_df, "CAT_IMPUTED", self.cat).fillna("N/A")
        self.values = np.unique(series)[:self.max_features]  # already sorted by counts decreasing
        # cleanup on isle unicode
        self.values = dkujson.loads(dkujson.dumps(self.values.tolist()))
        if "num" not in self.json_data:
            self.json_data["num"] = []
            self.json_data["cat"] = []
            self.json_data["values"] = []
        self.json_data["num"].append(self.num)
        self.json_data["cat"].append(self.cat)
        self.json_data["values"].append(self.values)
        return self.process(input_df, current_mf, output_ppr, generated_features_mapping)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        cat_series = self._make_series(current_mf, input_df, "CAT_IMPUTED", self.cat).fillna("N/A")
        num_series = self._make_series(current_mf, input_df, "NUM_IMPUTED", self.num)
        dumm = FastSparseDummifyProcessor(None, self.cat, self.values, False)._create_matrix(cat_series)
        # this is probably too dirty but we drop the NA and Others columns of the resulting matrix
        result = scipy.sparse.diags(num_series.values) * dumm.matrix[:, :-2]
        names = ["interaction:%s:%s:%s" % (self.num, self.cat, v) for v in self.values]
        # TODO: add mapping to generated_features_mapping
        current_mf.append_sparse(self.out_block, SparseMatrixWithNames(result, names))

    def init_resources(self, resources_handler):
        super(NumericalCategoricalInteraction, self).init_resources(resources_handler)
        self.json_data = resources_handler.get_resource("num_cat", "json")
        if "num" in self.json_data:
            for num, cat, values in zip(self.json_data["num"], self.json_data["cat"], self.json_data["values"]):
                if num == self.num and cat == self.cat:
                    self.values = values
                    break


class CategoricalCategoricalInteraction(Step):
    def __init__(self, out_block, column_1, column_2, max_features):
        super(CategoricalCategoricalInteraction, self).__init__()
        self.out_block = out_block
        self.column_1 = column_1
        self.column_2 = column_2
        self.max_features = max_features
        self.values = None
        self.json_data = None

    def _make_series(self, current_mf, input_df, n):
        try:
            if n in current_mf.get_block("CAT_IMPUTED").df:
                return current_mf.get_block("CAT_IMPUTED").df[n].fillna("N/A")
        except KeyError:
            pass
        return input_df[n].fillna("N/A")

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        s1 = self._make_series(current_mf, input_df, self.column_1)
        s2 = self._make_series(current_mf, input_df, self.column_2)
        series = s1.str.cat(s2, sep="__dku__")
        values_cat = ["%s__dku__%s" % (a,b) for (a,b) in self.values]
        dumm = FastSparseDummifyProcessor(None, None, values_cat, False)._create_matrix(series)
        # this is probably too dirty but we drop the NA and Others columns of the resulting matrix
        result = dumm.matrix[:, :-2]
        names = ["interaction:%s:%s:%s:%s" % (self.column_1, self.column_2, a, b) for (a, b) in self.values]
        # TODO: add mapping to generated_features_mapping
        current_mf.append_sparse(self.out_block, SparseMatrixWithNames(result, names))

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        s1 = self._make_series(current_mf, input_df, self.column_1)
        s2 = self._make_series(current_mf, input_df, self.column_2)
        self.values = pd.DataFrame({"s1": s1, "s2": s2}).groupby(["s1", "s2"]) \
                        .size().sort_values(ascending=False)[:self.max_features].index.get_values()
        # cleanup on isle unicode
        self.values = dkujson.loads(dkujson.dumps(self.values.tolist()))
        if "column_1" not in self.json_data:
            self.json_data["column_1"] = []
            self.json_data["column_2"] = []
            self.json_data["values"] = []
        self.json_data["column_1"].append(self.column_1)
        self.json_data["column_2"].append(self.column_2)
        self.json_data["values"].append([[a,b] for (a,b) in self.values])

        return self.process(input_df, current_mf, output_ppr, generated_features_mapping)

    def init_resources(self, resources_handler):
        super(CategoricalCategoricalInteraction, self).init_resources(resources_handler)
        self.json_data = resources_handler.get_resource("cat_cat", "json")
        if "column_1" in self.json_data:
            for c1, c2, values in zip(self.json_data["column_1"], self.json_data["column_2"], self.json_data["values"]):
                if c1 == self.column_1 and c2 == self.column_2:
                    self.values = values
                    break

class BlockStdRescalingProcessor(Step):
    """A avg/std rescaler that needs to be fit.
    Operates on a whole DF block"""

    def __init__(self, in_block):
        self.in_block = in_block

    def init_resources(self, mp):
        self.resource = mp.get_resource("block_std_rescaler", "json")
        if not self.in_block in self.resource:
            self.resource[self.in_block ] = { "shifts" : {}, "inv_scales" : {}}
        self.r = self.resource[self.in_block]
        # because we currently use different systems for rescaling of normal columns and derivatives,
        # but we want a single resource for java exports, we duplicate the resource dumping here
        self.generic_resource = mp.get_resource("rescalers", "json")
        if "columns" not in self.generic_resource:
            self.generic_resource["columns"] = []
            self.generic_resource["shifts"] = []
            self.generic_resource["inv_scales"] = []

    def _fit(self, input_df, current_mf):
        df = current_mf.get_block(self.in_block).df

        for col in df.columns:
            serie = df[col]
            shift = serie.mean()
            std = serie.std()
            inv_scale = 0.0 if std == 0.0 else 1. / std
            self.r["shifts"][col] = shift
            self.generic_resource["columns"].append(col)
            self.generic_resource["shifts"].append(shift)
            self.r["inv_scales"][col] = inv_scale
            self.generic_resource["inv_scales"].append(inv_scale)

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        self._fit(input_df, current_mf)
        self.process(input_df, current_mf, output_ppr, generated_features_mapping)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        df = current_mf.get_block(self.in_block).df

        for col in df.columns:
            if col in self.r["shifts"]:
                serie = df[col]
                df[col] = (serie - self.r["shifts"][col]) * self.r["inv_scales"][col]


class BinarizeSeries(Step):
    """Rescale a single series in-place in a DF block"""
    def __init__(self, in_block, in_col, out_block, threshold):
        self.in_block = in_block
        self.in_col = in_col
        self.threshold = threshold
        self.out_block = out_block

    def __str__(self,):
        return "Step:%s (col=%s, thresh=%s)" % (self.__class__.__name__, self.in_col, self.threshold)

    def _output_name(self):
        return "%s:above:%s" % (self.in_col, self.threshold)

    def init_resources(self, resources_handler):
        resource = resources_handler.get_resource("binarized", "json")
        if "columns" not in resource:
            resource["columns"] = []
            resource["output_name"] = []
            resource["thresholds"] = []
        resource["columns"].append(self.in_col)
        resource["output_name"].append("num_binarized:" + self._output_name())
        resource["thresholds"].append(self.threshold)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        dfw = current_mf.get_block(self.in_block)
        series = dfw.df[self.in_col]
        builder = current_mf.get_df_builder(self.out_block)
        add_column_to_builder(builder, self._output_name(), self.in_col, series > self.threshold, generated_features_mapping)


class QuantileBinSeries(Step):
    def __init__(self, in_block, in_col, out_block, nb_bins):
        self.in_block = in_block
        self.in_col = in_col
        self.out_block = out_block
        self.nb_bins = nb_bins

    def __str__(self,):
        return "Step:%s (col=%s, nb=%s)" % (self.__class__.__name__, self.in_col, self.nb_bins)


    def init_resources(self, mp):
        self.resource = mp.get_resource("quantile_binner", "json")
        if not self.in_col in self.resource:
            self.resource[self.in_col] = { "bounds" : []}
        self.r = self.resource[self.in_col]

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        builder = current_mf.get_df_builder(self.out_block)
        df = current_mf.get_block(self.in_block).df
        series = df[self.in_col]

        try:
            (categorical, bounds) = pd.qcut(series, self.nb_bins, retbins=True, labels = xrange(0, self.nb_bins))
        except ValueError as e:
            raise ValueError("Could not cut feature %s in %s quantiles. It might be too skewed or not have enough values." % (self.in_col, self.nb_bins))
        new_column = "%s:quantile:%s" % (self.in_col, self.nb_bins)
        add_column_to_builder(builder, new_column, self.in_col, pd.Series(categorical).astype(float).fillna(-1), generated_features_mapping)

        self.r["bounds"] = bounds

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        builder = current_mf.get_df_builder(self.out_block)
        df = current_mf.get_block(self.in_block).df
        series = df[self.in_col]

        categorical = pd.cut(series, self.r["bounds"], labels = xrange(0, self.nb_bins))
        new_column = "%s:quantile:%s" % (self.in_col, self.nb_bins)
        add_column_to_builder(builder, new_column, self.in_col, pd.Series(categorical).astype(float).fillna(-1), generated_features_mapping)


class RescalingProcessor2(Step):
    """Rescale a single series in-place in a DF block"""

    @staticmethod
    def from_minmax(in_block, in_col, min_value, max_value):
        return RescalingProcessor2(in_block, in_col, shift=min_value, scale=(max_value - min_value))

    @staticmethod
    def from_avgstd(in_block, in_col, mean, standard_deviation):
        return RescalingProcessor2(in_block, in_col, shift=mean, scale=standard_deviation)

    def __str__(self,):
        return "Step:%s (%s)" % (self.__class__.__name__, self.in_col)

    def __init__(self, in_block, in_col, shift=None, scale=None):
        self.in_block = in_block
        self.in_col = in_col
        self.shift = shift
        self.set_scale(scale)

    def init_resources(self, resources_handler):
        resource = resources_handler.get_resource("rescalers", "json")
        if "columns" not in resource:
            resource["columns"] = []
            resource["shifts"] = []
            resource["inv_scales"] = []
        if self.in_col not in resource["columns"]:
            resource["columns"].append(self.in_col)
            resource["shifts"].append(self.shift)
            resource["inv_scales"].append(self.inv_scale)

    def set_scale(self, scale):
        if scale == 0. or np.isnan(scale):
            # if there is not variance, just return a null-series
            self.inv_scale = 0.
        else:
            self.inv_scale = 1. / scale

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        dfw = current_mf.get_block(self.in_block)
        series = dfw.df[self.in_col]
        if preproc_logger.isEnabledFor(logging.DEBUG):
            preproc_logger.debug("  Rescale %s (avg=%s std=%s shift=%s inv_scale=%s)" % (self.in_col, series.mean(), series.std(), self.shift, self.inv_scale))
        dfw.df[self.in_col] = (series - self.shift) * self.inv_scale
        s2 = dfw.df[self.in_col]
        if preproc_logger.isEnabledFor(logging.DEBUG):
            preproc_logger.debug("  Rescaled %s (avg=%s std=%s) nulls=%s" % (self.in_col, s2.mean(), s2.std(), s2.isnull().sum()))



class AllInteractionFeaturesGenerator(Step):
    """Generates all polynomial interaction features from the imputed input numericals"""
    def __init__(self, in_block, out_block, features):
        self.in_block = in_block
        self.out_block = out_block
        self.features = features
        self.built = 0

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        from sklearn.preprocessing import PolynomialFeatures
        pf = PolynomialFeatures(degree=2, interaction_only=True)

        dic = {}
        for feature_name in self.features:
            dic[feature_name] = current_mf.col_as_series(self.in_block, feature_name)
        df = pd.DataFrame(dic)

        # Fit is only used to compute the n_features_out x n_features_in matrix
        # it's actually stateless
        pf.fit(df)
        names = []
        for out_powers in pf.powers_:
            factors = []
            for i in xrange(0, len(out_powers)):
                if out_powers[i] == 2:
                    factors.append("%s^2" % (self.features[i]))
                elif out_powers[i] == 1:
                    factors.append("%s" % (self.features[i]))
            names.append("poly_int:%s" % " * ".join(factors))
            self.built += 1
        out_matrix = pf.transform(df)
        df = pd.DataFrame(out_matrix, columns=names)
        current_mf.append_df(self.out_block, df)

    def report_fit(self, ret_obj, core_params):
        ret_obj["polynomial_interactions"] = {
            "input_features": len(self.features),
            "built_features" : self.built
        }


class PairwiseLinearCombinationsGenerator(Step):
    def __init__(self, in_block, out_block, features):
        self.in_block = in_block
        self.out_block = out_block
        self.features = features
        self.built = 0

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        assert len(self.features) >= 2
        out = current_mf.get_df_builder(self.out_block)
        for i1 in xrange(0, len(self.features)):
            f1 = self.features[i1]
            s1 = current_mf.col_as_series(self.in_block, f1)
            for i2 in xrange(i1+1, len(self.features)):
                f2 = self.features[i2]
                if f1 == f2:
                    continue

                assert(s1.isnull().sum() == 0)
                s2 = current_mf.col_as_series(self.in_block, f2)
                out.add_column("%s+%s" % (f1, f2), s1+s2)
                out.add_column("%s-%s" % (f1, f2), s1-s2)
                self.built += 2

        current_mf.flush_df_builder(self.out_block)

    def report_fit(self, ret_obj, core_params):
        ret_obj["pairwise_linear"] = {
            "input_features": len(self.features),
            "built_features": self.built
        }

class NumericalDerivativesGenerator(Step):
    """Generate derivative features from selected numerical features
    in a block.
    Generates square, log(), sqrt"""
    def __init__(self, in_block, out_block, features):
        self.in_block = in_block
        self.out_block = out_block
        self.features = features

    def init_resources(self, resources_handler):
        res = resources_handler.get_resource("derivatives", "json")
        if "columns" not in res:
            res["columns"] = []
        for feature in self.features:
            res["columns"].append(feature)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        out = current_mf.get_df_builder(self.out_block)
        for feature in self.features:
            series = current_mf.get_block(self.in_block).df[feature]
            add_column_to_builder(out, "%s^2" % feature, feature, np.power(series, 2), generated_features_mapping)

            # TODO:  We should probably make possibly-NA generators optional
            # We don't care about generating NA in a DF, DropNARows will
            # clean up after us
            add_column_to_builder(out, "sqrt(%s)" % feature, feature, np.sqrt(series).fillna(0), generated_features_mapping)

            add_column_to_builder(out, "log(%s)" % feature, feature, np.log(series + 0.00000001).fillna(0), generated_features_mapping)

        current_mf.flush_df_builder(self.out_block)

class DumpPipelineState(Step):
    def __init__(self, name):
        self.name = name
        pass

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        preproc_logger.debug("********* Pipeline state (%s)" % self.name)
        preproc_logger.debug("   input_df= %s " % str(input_df.shape))
        preproc_logger.debug("   current_mf=%s " % str(current_mf.shape()))
        preproc_logger.debug("   PPR: ")
        for (k, v) in output_ppr.items():
            if isinstance(v, MultiFrame):
                preproc_logger.debug("      %s = %s (%s)" % (k, v.__class__, str(v.shape())))
            elif isinstance(v, MLAssertions):
                preproc_logger.debug("       %s = %s (%s assertions)" % (k, v.__class__, len(v)))
            else:
                preproc_logger.debug("      %s = %s (%s)" % (k, v.__class__, str(v.shape)))

class DumpInputDF(Step):
    def __init__(self, name):
        self.name = name
        pass

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        preproc_logger.debug("********* DUMP InputDF (%s)" % self.name)
        preproc_logger.debug("%s" % input_df)

class DumpMFDetails(Step):
    def __init__(self, name):
        self.name = name

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        preproc_logger.debug("********* DUMP Multiframe Details (%s)" % self.name)
        for (block_name, block, kept) in current_mf.iter_blocks(True):
            shape = "?"
            if isinstance(block, SparseMatrixWithNames):
                shape = block.matrix.shape
            elif isinstance(block, NamedNPArray):
                shape = block.array.shape
            else:
                shape = block.df.shape

            preproc_logger.debug("  Block: %s clazz=%s shape=%s kept=%s" % (block_name, block.__class__, shape, kept))

class DumpFullMF(Step):
    def __init__(self, name):
        self.name = name
        pass

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        preproc_logger.debug("********* DUMP Multiframe (%s)" % self.name)
        preproc_logger.debug("%s" % current_mf.as_dataframe().to_dict(orient='records'))


class EmitCurrentMFAsResult(Step):
    """Emits the current multi frame in the result object and
    optionally injects a *brand new* multiframe in the pipeline"""
    def __init__(self, output_name):
        self.output_name = output_name

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        output_ppr[self.output_name] = current_mf
        output_ppr["UNPROCESSED"] = input_df
        new_mf = MultiFrame()
        new_mf.set_index_from_df(input_df)
        return new_mf

class AddReferenceInOutput(Step):
    """Add an alias in output"""
    def __init__(self, output_name_from, output_name_to):
        self.output_name_from = output_name_from
        self.output_name_to = output_name_to

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        output_ppr[self.output_name_to] = output_ppr[self.output_name_from]


class FastSparseDummifyProcessor(Step):

    def __init__(self, input_block, input_column_name, values, should_drop):
        self.values = [val for val in values]
        self.input_block = input_block
        self.input_column_name = input_column_name
        self.should_drop = should_drop
        self.mapping_table = self._create_mapping_table()

    def __str__(self,):
        return "Step:%s (%s)" % (self.__class__.__name__, self.input_column_name)

    # Construct a mapping table mapping each value to its integer position
    def _create_mapping_table(self):
        mapping_table = {}
        nb_vals = len(self.values)
        for i in xrange(0, nb_vals):
            v = self.values[i]
            if sys.version_info > (3,0):
                mapping_table[v] = i
            else:
                mapping_table[encode_utf8(v)] = i
        return mapping_table

    def init_resources(self, resources_handler):
        resources = resources_handler.get_resource("dummies", "json")
        if "details" not in resources:
            resources["details"] = {}
        resources["details"][self.input_column_name] = {
            "levels": self.values,
            "with_others": not self.should_drop #todo : check this
        }

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if self.input_block is None:
            series = input_df[self.input_column_name]
        else:
            series = current_mf.get_block(self.input_block).df[self.input_column_name]

        append_sparse_with_prefix(current_mf, "dummy:", self.input_column_name, self._create_matrix(series), generated_features_mapping)


    def _create_matrix(self, series):
        nb_vals = len(self.values) + 1
        series = series.fillna("_DKU_NA_")
        self.mapping_table["_DKU_NA_"] = nb_vals - 1

        # Create a series containing the value index for each row
        # If we have 50 values: [0-49] will indicate the real value and NaN indicates "other", which is filled with 50,
        # or dropped if we are dropping

        mapped = series.map(self.mapping_table)

        if not self.should_drop:
            labels_series = mapped.fillna(nb_vals).astype(np.int16)
        else:
            labels_series = mapped

        # We construct the data/indices/indptr structure which is the native
        # format for CSR matrixes. This allows for an extremely fast creation

        # We won't map NaN rows, which have their dummy dropped
        nb_rows = len(labels_series)
        data = np.ones(nb_rows - labels_series.isnull().sum())
        # create indices, skipping one if it is NaN, as we won't be creating a 1 on the row, then clean the series
        indptr = [0] + [y for y in labels_series.notnull().cumsum()]
        labels_series = labels_series.dropna()

        if sys.version_info > (3,0):
            names = ["dummy:%s:%s" % (self.input_column_name, value) for value in self.values]
            names.append("dummy:%s:N/A" % self.input_column_name)
        else:
            names = [u"dummy:%s:%s" % (self.input_column_name, unicode(value)) for value in self.values]
            names.append("dummy:%s:N/A" % self.input_column_name)

        if not self.should_drop:
            names.append("dummy:%s:%s" % (self.input_column_name, "__Others__"))

        #create dummy matrix
        matrix = scipy.sparse.csr_matrix((data, labels_series.values, indptr), shape=(nb_rows, len(names)))
        preproc_logger.debug("Dummifier: Append a sparse block shape=%s nnz=%s" % (str(matrix.shape), matrix.nnz))

        return SparseMatrixWithNames(matrix, names)

class CategoricalFeatureHashingProcessor(Step):
    """
    Hashing trick for category features.

    This creates an extremely huge sparse matrix and should only be used with algorithms that support
    them.

    It takes values from an input block

    @param bool hash_whole_categories (default True): Indicate whether the processor should hash the whole categories or
    each of the characters that compose them. It is kept for legacy reasons.
    """

    def __init__(self, input_block, column_name, hash_whole_categories=True, n_features=2**20):
        self.n_features = n_features
        self.input_block = input_block
        self.column_name = column_name
        self.hash_whole_categories = hash_whole_categories

    def process(self,  input_df, current_mf, output_ppr, generated_features_mapping):
        from sklearn.feature_extraction import FeatureHasher
        fh = FeatureHasher(n_features=self.n_features, input_type="string")

        if self.input_block is None:
            series = input_df[self.column_name]
        else:
            series = current_mf.get_block(self.input_block).df[self.column_name]

        # The input data must be reshaped for the FeatureHasher to hash whole categories
        if self.hash_whole_categories:
            matrix = fh.transform(series.values.reshape(-1, 1))
        else:
            matrix = fh.transform(series)

        # No name on the generated features
        append_sparse_with_prefix(current_mf,"hashing:", self.column_name, SparseMatrixWithNames(matrix, None), generated_features_mapping)


class TextHashingVectorizerProcessor(Step):
    """
    Hashing trick for text features using Bag of words.
    http://scikit-learn.org/stable/modules/feature_extraction.html#vectorizing-a-large-text-corpus-with-the-hashing-trick

    This creates an extremely huge sparse matrix and should only be used with algorithms that support
    them.

    It takes values directly from the input df since we don't do other preprocessing for
    these features
    """
    __slots__ = ('column_name','n_features')

    def __init__(self, column_name, n_features=200000):
        self.n_features = n_features
        self.column_name = column_name

    def __str__(self,):
        return "%s (%s)" % (self.__class__, self.column_name)

    def process(self,  input_df, current_mf, output_ppr, generated_features_mapping):
        serie = input_df[self.column_name]
        from sklearn.feature_extraction.text import HashingVectorizer
        hv = HashingVectorizer(n_features=self.n_features)
        matrix = hv.transform(serie.fillna(""))

        # No name on the generated features
        append_sparse_with_prefix(current_mf, "hashvect:", self.column_name, SparseMatrixWithNames(matrix, None), generated_features_mapping)


from sklearn.feature_extraction.text import CountVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer

class BaseCountVectorizerProcessor(Step):
    def __init__(self, column_name, min_df, max_df, max_features, min_gram, max_gram, stop_words=None):
        self.column_name = column_name
        self.min_df = min_df
        self.max_df = max_df
        if max_features == 0:
            self.max_features = None
        else:
            self.max_features = max_features
        self.min_gram = min_gram
        self.max_gram = max_gram
        self.stop_words = stop_words
        self.dropped_words = 0

    def gen_voc(self, vec):
        voc_sorted = [None for x in xrange(0, len(vec.vocabulary_))]
        for (k, v) in vec.vocabulary_.items():
            voc_sorted[v] = k
        return voc_sorted

    def __str__(self,):
        return "%s (%s)" % (self.__class__, self.column_name)

    def init_resources(self, mp):
        self.resource = mp.get_resource("%s_%s" % (self.prefix, self.column_name), "pkl")

    def report_fit(self, ret_obj, core_params):
        vec = self.resource["vectorizer"]
        if not self.prefix in ret_obj:
            ret_obj[self.prefix] = {}
        ret_obj[self.prefix][self.column_name] = {
            "used_words": len(vec.vocabulary_),
            "dropped_words": self.dropped_words
        }


class TextCountVectorizerProcessor(BaseCountVectorizerProcessor):
    def __init__(self, column_name, min_df, max_df, max_features, min_gram=1, max_gram=2, stop_words=None,
        custom_code=None):
        BaseCountVectorizerProcessor.__init__(self,column_name, min_df, max_df, max_features, min_gram, max_gram, stop_words)
        self.prefix = "countvec"
        self.custom_code = custom_code

    def fit_and_process(self,  input_df, current_mf, output_ppr, generated_features_mapping):
        serie = input_df[self.column_name]
        if self.custom_code is not None:
            dic = {}
            exec(self.custom_code, dic, dic)
            vec = dic["transformer"]
        else:
            vec = CountVectorizer(min_df = self.min_df, max_df = self.max_df,
                            max_features = self.max_features,
                            stop_words = self.stop_words,
                            ngram_range = (self.min_gram, self.max_gram))
        preproc_logger.debug("Using vectorizer: %s" % vec)
        matrix = vec.fit_transform(serie.fillna(""))
        preproc_logger.debug("Produced a matrix of size %s" % str(matrix.shape))

        voc_sorted = self.gen_voc(vec)
        names = [
            "countvec:%s:%s" % (self.column_name, w)
            for w in voc_sorted
        ]
        append_sparse_with_prefix(current_mf, "countvec:", self.column_name, SparseMatrixWithNames(matrix, names), generated_features_mapping)
        self.dropped_words = len(vec.stop_words_)
        vec.stop_words_ = None
        self.resource["vectorizer"] = vec
        self._report_json_data()

    def _report_json_data(self):
        json_data = self.json_data
        if "column" not in json_data:
            json_data["column"] = []
            json_data["vocabulary"] = []
            json_data["stop_words"] = []
            json_data["min_n_grams"] = []
            json_data["max_n_grams"] = []
            json_data["origin"] = "SCIKIT"
        vec = self.resource["vectorizer"]
        json_data["column"].append(self.column_name)
        if vec.stop_words == 'english':
            stop_words = list(ENGLISH_STOP_WORDS)  # maybe would take too much space in json if many text features ?
        elif isinstance(vec.stop_words, list):
            stop_words = vec.stop_words
        else:
            stop_words = []
        json_data["stop_words"].append(stop_words)
        json_data["vocabulary"].append(vec.get_feature_names())
        json_data["min_n_grams"].append(self.min_gram)
        json_data["max_n_grams"].append(self.max_gram)

    def init_resources(self, mp):
        super(TextCountVectorizerProcessor, self).init_resources(mp)
        self.json_data = mp.get_resource("word_counts", "json")

    def process(self,  input_df, current_mf, output_ppr, generated_features_mapping):
        serie = input_df[self.column_name]
        vec = self.resource["vectorizer"]
        matrix = vec.transform(serie.fillna(""))
        names = [
            "countvec:%s:%s" % (self.column_name, w)
            for w in vec.get_feature_names()
        ]
        append_sparse_with_prefix(current_mf, "countvec:", self.column_name, SparseMatrixWithNames(matrix, names), generated_features_mapping)

class TextTFIDFVectorizerProcessor(BaseCountVectorizerProcessor):
    def __init__(self, column_name, min_df, max_df, max_features, min_gram=1, max_gram=2, stop_words=None, custom_code=None):
        BaseCountVectorizerProcessor.__init__(self,column_name, min_df, max_df, max_features, min_gram, max_gram, stop_words)
        self.prefix = "tfidfvec"
        self.custom_code = custom_code

    def fit_and_process(self,  input_df, current_mf, output_ppr, generated_features_mapping):
        serie = input_df[self.column_name]
        if self.custom_code is not None:
            dic = {}
            exec(self.custom_code, dic, dic)
            vec = dic["transformer"]
        else:
            vec = TfidfVectorizer(min_df = self.min_df, max_df = self.max_df,
                            max_features = self.max_features,
                            stop_words = self.stop_words,
                            ngram_range = (self.min_gram, self.max_gram))
        preproc_logger.debug("Using vectorizer: %s" % vec)
        matrix = vec.fit_transform(serie.fillna(""))
        preproc_logger.debug("Produced a matrix of size %s" % str(matrix.shape))

        voc_sorted = self.gen_voc(vec)
        names = [
            "tfidfvec:%s:%.3f:%s" % (self.column_name, idf, w)
            for (w, idf) in zip(voc_sorted, vec.idf_)
        ]
        append_sparse_with_prefix(current_mf, "tfidfvec:", self.column_name, SparseMatrixWithNames(matrix, names), generated_features_mapping)
        self.dropped_words = len(vec.stop_words_)
        vec.stop_words_ = None
        self.resource["vectorizer"] = vec
        self._report_json_data()

    def init_resources(self, mp):
        super(TextTFIDFVectorizerProcessor, self).init_resources(mp)
        self.json_data = mp.get_resource("tfidf", "json")

    def _report_json_data(self):
        json_data = self.json_data
        if "column" not in json_data:
            json_data["column"] = []
            json_data["vocabulary"] = []
            json_data["stop_words"] = []
            json_data["min_n_grams"] = []
            json_data["max_n_grams"] = []
            json_data["idf"] = []
            json_data["norm"] = []
            json_data["output_names"] = []
            json_data["origin"] = "SCIKIT"
        vec = self.resource["vectorizer"]
        json_data["column"].append(self.column_name)
        if vec.stop_words == 'english':
            stop_words = list(ENGLISH_STOP_WORDS)  # maybe would take too much space in json if many text features ?
        elif isinstance(vec.stop_words, list):
            stop_words = vec.stop_words
        else:
            stop_words = []
        json_data["stop_words"].append(stop_words)
        json_data["vocabulary"].append(vec.get_feature_names())
        json_data["min_n_grams"].append(self.min_gram)
        json_data["max_n_grams"].append(self.max_gram)
        output_names = [
            "tfidfvec:%s:%.3f:%s" % (self.column_name, idf, w)
            for (w, idf) in zip(vec.get_feature_names(), vec.idf_)
        ]
        json_data["output_names"].append(output_names)
        json_data["idf"].append(vec.idf_)
        json_data["norm"].append("NONE" if vec.norm is None else vec.norm.upper())

    def process(self,  input_df, current_mf, output_ppr, generated_features_mapping):
        serie = input_df[self.column_name]
        vec = self.resource["vectorizer"]
        matrix = vec.transform(serie.fillna(""))
        names = [
            "tfidfvec:%s:%.3f:%s" % (self.column_name, idf, w)
            for (w, idf) in zip(vec.get_feature_names(), vec.idf_)
        ]
        append_sparse_with_prefix(current_mf, "tfidfvec:", self.column_name, SparseMatrixWithNames(matrix, names), generated_features_mapping)


class TextHashingVectorizerWithSVDProcessor(Step):
    """
    Use a restricted version of the hashing trick.
    http://scikit-learn.org/stable/modules/feature_extraction.html#vectorizing-a-large-text-corpus-with-the-hashing-trick

    This is designed to be used with dense matrixes. Instead of creating a huge sparse matrix,
    it first creates the huge sparse matrix then applies a SVD on it to only keep a small (10-50) number
    of features
    It takes values directly from the input df since we don't do other preprocessing for
    these features
    """

    def __init__(self, column_name, svd_res, n_features=100, n_hash=200000, svd_limit = 50000):
        self.n_features = n_features
        self.n_hash = n_hash
        self.svd_res = svd_res
        self.svd_limit = svd_limit
        self.column_name = column_name

    def __str__(self,):
        return "Step:%s (%s hs=%s sl=%s sc=%s)" % (self.__class__.__name__, self.column_name, self.n_hash, self.svd_limit, self.n_features)

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        serie = input_df[self.column_name]

        from sklearn.feature_extraction.text import HashingVectorizer
        preproc_logger.debug("  Processing serie %s" % serie)
        hv = HashingVectorizer(n_features=self.n_hash)
        matrix = hv.transform(serie.fillna(""))
        preproc_logger.debug("  Got matrix: %s" % str(matrix.shape))
        from sklearn import decomposition
        self.svd_res["svd"] = decomposition.TruncatedSVD(n_components=self.n_features)
        if matrix.shape[0] > self.svd_limit:
            self.svd_res["svd"].fit(matrix[0:self.svd_limit])
        else:
            self.svd_res["svd"].fit(matrix)

        # FIXME: we could be a bit more efficient when doing fit to avoid re-hashing
        self.process(input_df, current_mf, output_ppr, generated_features_mapping)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        serie = input_df[self.column_name]

        from sklearn.feature_extraction.text import HashingVectorizer
        hv = HashingVectorizer(n_features=self.n_hash)
        matrix = hv.transform(serie.fillna(""))

        transformed = self.svd_res["svd"].transform(matrix)

        block_name = "thsvd:%s" % self.column_name
        out = current_mf.get_df_builder(block_name)
        for i in xrange(0, transformed.shape[1]):
            add_column_to_builder(out, str(i), self.column_name, transformed[:,i], generated_features_mapping)

        current_mf.flush_df_builder(block_name)


class UnfoldVectorProcessor(Step):

    def __init__(self, input_column_name, vector_length, in_block=None):
        self.input_column_name = input_column_name
        self.vector_length = vector_length
        self.in_block = in_block

    def init_resources(self, resources_handler):
        resource = resources_handler.get_resource("vectors-unfold", "json")
        if "vector_lengths" not in resource.keys():
            resource["vector_lengths"] = {}
        vec_lengths = resource["vector_lengths"]
        if self.input_column_name not in vec_lengths.keys():
            vec_lengths[self.input_column_name] = self.vector_length

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if self.in_block is None:
            series = input_df[self.input_column_name]
        else:
            series = current_mf.get_block(self.in_block).df[self.input_column_name]
        block_name = u"unfold_{}".format(safe_unicode_str(self.input_column_name))

        def parse_vector(row):
            try:
                vec = json.loads(row)
            except ValueError as e:
                raise safe_exception(ValueError, u"Invalid vector data in column '{}': {}".format(
                    safe_unicode_str(self.input_column_name), safe_unicode_str(e)))
            except TypeError as e:
                raise safe_exception(ValueError, u"Invalid vector data in column '{}' - maybe empty? ({})" .format(
                    safe_unicode_str(self.input_column_name), safe_unicode_str(e)))
            current_len = len(vec)
            if current_len != self.vector_length:
                raise safe_exception(ValueError, u"Size mismatch between different rows when unfolding vector column '{}'."
                                      u" Expected: {}, found: {}".format(safe_unicode_str(self.input_column_name),
                                                                         self.vector_length, current_len))
            if any([not isinstance(x, Number) for x in vec]):
                raise safe_exception(ValueError, u"Some elements of vector column '{}' are not numbers".format(
                    safe_unicode_str(self.input_column_name)))
            else:
                return vec

        series_parsed = series.apply(parse_vector)
        names = [u"unfold:{}:{}".format(safe_unicode_str(self.input_column_name), i) for i in xrange(self.vector_length)]
        generated_features_mapping.add_whole_block_mapping(block_name, self.input_column_name)
        current_mf.append_np_block(block_name, np.asarray(series_parsed.tolist()), names)


class ImpactCodingStep(Step):
    # This is really dirty. Creating the impact coder should be the work
    # of the processor, not the preprocessing handler ?
    def __init__(self, input_block, column_name, impact_coder, target_variable, output_block):
        self.input_block = input_block
        self.column_name = column_name
        self.impact_coder = impact_coder
        self.target_variable = target_variable
        self.output_block = output_block

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        # That's fairly dirty ...
        target = output_ppr["target"]
        if self.input_block is None:
            serie = input_df[self.column_name]
        else:
            serie = current_mf.get_block(self.input_block).df[self.column_name]
        self.impact_coder.fit(serie, target)
        self.process(input_df, current_mf, output_ppr, generated_features_mapping)
        self._report_json_resources()

    def _report_json_resources(self):
        imp_map = self.impact_coder._impact_map
        imp_map.fillna(0, inplace=True)
        impact = self.json_data
        if "columns" not in impact:
            impact["columns"] = []
            impact["levels"] = []
            impact["encodings"] = []
            impact["defaults"] = []
            impact["outputNames"] = []
        impact["columns"].append(self.column_name)
        levels = []
        impacts = []
        for line in imp_map.itertuples():
            levels.append(line[0])
            impacts.append([x for x in line[1:]])
        impact["levels"].append(levels)
        impact["encodings"].append(impacts)
        impact["defaults"].append([x for x in self.impact_coder.default_value()])
        impact["outputNames"].append(["impact:" + self.column_name + ":" + x for x in imp_map.columns.values])

    def init_resources(self, resources_handler):
        self.json_data = resources_handler.get_resource("impact_coded", "json")

    def report_fit(self, ret_obj, core_params):
        imp_map = self.impact_coder.get_reportable_map()
        imp_map.fillna(0, inplace=True)
        # index = value, column 0 = count, other columns = impact

        if core_params["prediction_type"] == "MULTICLASS":
            pass
            # Not implemented yet
            #raise ValueError("Not supported")
        else:
            assert(imp_map.shape[1] == 2)
            ret = {
                "values" : [],
                "impacts": [],
                "counts" : []
            }
            for line in imp_map.itertuples():
                ret["values"].append(line[0])
                ret["counts"].append(line[1])
                ret["impacts"].append(line[2])
            if not "impact" in ret_obj:
                ret_obj["impact"] = {}
            ret_obj["impact"][self.column_name] =ret

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if self.input_block is None:
            serie = input_df[self.column_name]
        else:
            serie = current_mf.get_block(self.input_block).df[self.column_name]
        df = self.impact_coder.transform(serie)
        for (column_name, serie) in df.iteritems():
            builder = current_mf.get_df_builder(self.output_block)
            add_column_to_builder(builder, column_name, self.column_name, serie, generated_features_mapping)

        current_mf.flush_df_builder(self.output_block)

class FeatureSelectorOutputExecStep(Step):
    """Used if feature selection was already trained"""
    def __init__(self, selector):
        self.selector = selector

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        self.selector.prune_output(current_mf)


class FeatureSelectorOutputTrainStep(Step):
    """Used if feature selection was not already trained"""
    def __init__(self, selector):
        self.selector = selector

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        preproc_logger.debug("Fit and process with selector %s" % self.selector.__class__)
        self.selector.fit_output(current_mf, output_ppr["target"])
        self.selector.prune_output(current_mf)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        self.selector.prune_output(current_mf)


from dataiku.doctor.preprocessing.pca import PCA, PCA2
import copy

class PCAStep(Step):
    #__slots__ = ('pca',)

    def __init__(self, pca, input_name, output_name):
        self.output_name = output_name
        self.input_name = input_name
        self.pca = pca

    def normalize(self, df,):
        pass

    def fit_and_process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        mf_to_process = output_ppr[self.input_name]
        preproc_logger.debug("PCA fitting on %s" % mf_to_process)
        df = mf_to_process.as_dataframe()
        preproc_logger.debug("Starting PCA fit on DF of shape %s" % str(df.shape))
        self.pca.fit(df)
        preproc_logger.debug("PCA fit done")
        return self.process(input_df, cur_mf, output_ppr, generated_features_mapping)

    def process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        mf_to_process = output_ppr[self.input_name]
        preproc_logger.debug("PCA processing on %s. Transforming to DF" % mf_to_process)
        df = mf_to_process.as_dataframe()

        preproc_logger.debug("Starting PCA process on DF of shape %s" % str(df.shape))
        transformed_df = self.pca.transform(df)

        new_mf = MultiFrame()
        new_mf.index = copy.deepcopy(mf_to_process.index)
        new_mf.append_df("pca_out", transformed_df)
        preproc_logger.debug("PCA process done")
        output_ppr[self.output_name] = new_mf


class CustomPreprocessingStep(Step):
    def __init__(self, input_col, code, wants_matrix, fit_and_process_only_fits=False, accepts_tensor=False):
        super(CustomPreprocessingStep, self).__init__()
        self.input_col = input_col
        self.code = code
        self.processor = None
        self.res = None
        self.wants_matrix = wants_matrix
        self.fit_and_process_only_fits = fit_and_process_only_fits
        self.accepts_tensor = accepts_tensor

    def __str__(self,):
        return "Step:%s (%s)" % (self.__class__.__name__, self.input_col)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if self.wants_matrix:
            inp = pd.DataFrame({"_" : input_df[self.input_col]})
        else:
            inp = input_df[self.input_col]
        blk = self.processor.transform(inp)
        preproc_logger.debug("Returned blk of shape %s" % (blk.shape,))
        block_name = "custom_prep_%s" % self.input_col
        if isinstance(blk, pd.DataFrame):
            current_mf.append_df(block_name, blk)
        else:
            import scipy.sparse
            if not (isinstance(blk, scipy.sparse.csr_matrix) or isinstance(blk, np.ndarray)):
                raise ValueError("Custom preprocessing output should be a pandas DataFrame, numpy array "
                                 "or scipy.sparse.csr_matrix, found %s" % type(blk))
            if not self.accepts_tensor and len(blk.shape) != 2:
                raise ValueError("Output of custom processor should be a 2d matrix")
            if hasattr(self.processor, "names"):
                names = self.processor.names
            else:
                names = ["%s:unnamed_%s" % (self.input_col, idx) for idx in xrange(blk.shape[1])]
            if len(names) != blk.shape[1]:
                raise ValueError("Size mismatch between feature names (%s) and preprocessed array (%s)" % (len(names), blk.shape[1]))
            if isinstance(blk, scipy.sparse.csr_matrix):
                current_mf.append_sparse(block_name, SparseMatrixWithNames(blk, names))

            elif isinstance(blk, np.ndarray):
                current_mf.append_np_block(block_name, blk, names)
            else:
                pass  # won't happen due to above check
        generated_features_mapping.add_whole_block_mapping(block_name, self.input_col)

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        ctx = {}
        exec(self.code, ctx)
        if self.wants_matrix:
            inp = pd.DataFrame({"_" : input_df[self.input_col]})
        else:
            inp = input_df[self.input_col]

        processor = ctx.get("processor", None)

        if processor is None:
            raise safe_exception(Exception, u"No 'processor' variable defined for Custom preprocessing of feature '{}'".format(safe_unicode_str(self.input_col)))

        processor.fit(inp)
        self.processor = processor
        self.res[self.input_col] = processor

        if self.fit_and_process_only_fits:
            return None
        else:
            return self.process(input_df, current_mf, output_ppr, generated_features_mapping)

    def init_resources(self, resources_handler):
        self.res = resources_handler.get_resource("custom_prep", "pkl")
        if self.input_col in self.res:
            self.processor = self.res[self.input_col]


class FileFunctionPreprocessing(Step):

    def __init__(self, input_col, code, file_reader, func_name, fit_and_process_only_fits=True):
        super(FileFunctionPreprocessing, self).__init__()
        self.input_col = input_col
        self.code = code
        self.func_name = func_name
        self.fit_and_process_only_fits = fit_and_process_only_fits
        self.file_reader = file_reader

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        if not self.fit_and_process_only_fits:
            self.process(input_df, current_mf, output_ppr, generated_features_mapping)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        dic = {}
        exec(self.code, dic, dic)
        serie = input_df[self.input_col]
        block_name = "custom_file_prep_%s" % self.input_col
        blk = np.array(serie.apply(self.__apply_user_defined_func(dic)).tolist())

        if not isinstance(blk, np.ndarray):
            raise safe_exception(ValueError, u"Output of '{}' for feature '{}' should be a ndarray".format(
                safe_unicode_str(self.func_name), safe_unicode_str(self.input_col)))

        current_mf.append_np_block(block_name, blk, None)
        generated_features_mapping.add_whole_block_mapping(block_name, self.input_col)

    def __apply_user_defined_func(self, dic):
        def func_to_apply(x):
            with RaiseWithTraceback(u"Failed to preprocess the following file: '{}'".format(safe_unicode_str(x))):
                return dic[self.func_name](self.file_reader.read(x))
        return func_to_apply

def cubic_root(x):
    return x ** (1. / 3.)


# Special version for the notebook. Works on a dataframe, not
# on a MultiFrame
def detect_outliers(df,
                    pca_kept_variance=0.9,
                    min_n=0,
                    min_cum_ratio=0.01,
                    random_state=1337):

    pca = PCA(kept_variance=pca_kept_variance, normalize=True)
    preproc_logger.debug("Outliers detection: fitting PCA")
    pca.fit(df)
    preproc_logger.debug("Outliers detection: performing PCA")
    df_reduced = pca.transform(df)
    n_lines = df_reduced.shape[0]
    n_clusters = max(3, int(cubic_root(n_lines)))
    preproc_logger.debug("Outliers detection: performing cubic-root kmeans on df %s" % str(df_reduced.shape))
    model = KMeans(n_clusters=n_clusters, random_state=random_state)
    labels = pd.Series(model.fit_predict(df_reduced.values))
    preproc_logger.debug("Outliers detection: selecting mini-clusters")
    label_counts = pd.DataFrame(labels.value_counts(ascending=True))
    label_counts.columns = ["count"]
    label_counts["ratio"] = label_counts["count"] / label_counts["count"].sum()
    label_counts["cum_ratio"] = label_counts["ratio"].cumsum()
    label_counts["outlier"] = (label_counts["ratio"] < min_cum_ratio) | (label_counts["count"] < min_n)
    preproc_logger.debug("Outliers detection: done")
    return labels.map(label_counts["outlier"])

class RandomColumnsGenerator(Step):
    def __init__(self, n_columns):
        self.n_columns = n_columns

    def process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        nrows = cur_mf.shape()[0]
        rnd = np.random.randn(nrows * self.n_columns).reshape(nrows, self.n_columns)
        cur_mf.append_np_block("random_data", rnd, ["rnd_%s" % xrange(self.n_columns)])

class NumericalFeaturesClusteringGenerator(Step):
    def __init__(self, preprocessing_settings, settings):
        self.preprocessing_settings = preprocessing_settings
        self.settings = settings

    def init_resources(self, mp):
        self.res = mp.get_resource("gen_numericals_clustering", "pkl")

    def get_evolution_def(self):
        pass

    def set_evolution_state(self, es):
        pass

    def get_numerical_features(self):
        ret = []
        for (k, v) in self.preprocessing_settings["per_feature"].items():
            if v["type"] == "NUMERIC" and v["role"] == "INPUT":
                ret.append(k)
        return ret 

    def perform_replacement(self, cur_mf, df, kmeans):
        k = self.settings["k"]
        if self.settings["transformation_mode"] == "REPLACE_BY_DISTANCE":            
            distances = kmeans.transform(df)
            closest_distances = distances.min(axis=1).reshape(distances.shape[0], 1)
            preproc_logger.debug("Distances: %s" % distances)
            preproc_logger.debug("Closesst: %s" % closest_distances)
            cur_mf.append_np_block("numericals_clustering", closest_distances, ["distance_to_centroid"])

        elif self.settings["transformation_mode"] == "DUMMIFY_CLUSTERID":
            labels = kmeans.predict(df)
            dumm = FastSparseDummifyProcessor(None, "numericals_clustering", xrange(k), False)._create_matrix(pd.Series(labels))
            preproc_logger.debug("Labels: %s" % labels)
            preproc_logger.debug("Dummies: %s" % dumm)
            cur_mf.append_sparse("numericals_clustering", dumm)

    def fit_and_process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        if self.settings["behavior"] == "ENABLED_MANUAL":
            k = self.settings["k"]
            if self.settings["all_features"]:
                features = self.get_numerical_features()
            else:
                features = self.settings["input_features"]
        else:
            raise Exception("Unimplemented")

        block = cur_mf.get_block("NUM_IMPUTED")
        df = block.df[features]

        preproc_logger.debug("Fitting clustering on %s" % (df.shape,))

        kmeans = KMeans(n_clusters=k, random_state=1337) # TODO
        kmeans.fit(df)
        self.res["kmeans"] = kmeans

        self.perform_replacement(cur_mf, df, kmeans)

    def process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        if self.settings["behavior"] == "ENABLED_MANUAL":
            k = self.settings["k"]
            mode = self.settings["transformation_mode"]
            if self.settings["all_features"]:
                features = self.get_numerical_features()
            else:
                features = self.settings["input_features"]
        else:
            raise Exception("Unimplemented")

        block = cur_mf.get_block("NUM_IMPUTED")
        df = block.df[features]
        self.perform_replacement(cur_mf, df, self.res["kmeans"])


from .impact_coding import NestedKFoldImpactCoder
class ImpactCodingStep2(Step):
    def __init__(self, input_block, column_name, target_variable, output_block):
        self.input_block = input_block
        self.column_name = column_name
        self.impact_coder = NestedKFoldImpactCoder()
        self.target_variable = target_variable
        self.output_block = output_block

    def init_resources(self, mp):
        self.res = mp.get_resource("impact_coding_2", "pkl")

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        # That's fairly dirty ...
        target = output_ppr["target"]
        serie = current_mf.get_block(self.input_block).df[self.column_name]
        transformed_series = self.impact_coder.fit(serie, target)

        self.res[self.column_name] = {
            "mapping" : self.impact_coder.mapping,
            "default_mean" : self.impact_coder.default_mean
        }

        current_mf.get_df_builder(self.output_block).add_column(self.column_name, transformed_series)
        current_mf.flush_df_builder(self.output_block)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        column_data = self.res[self.column_name]
        self.impact_coder.set_data(column_data["mapping"], column_data["default_mean"])

        serie = current_mf.get_block(self.input_block).df[self.column_name]
        transformed_series = self.impact_coder.transform(serie)

        current_mf.get_df_builder(self.output_block).add_column(self.column_name, transformed_series)
        current_mf.flush_df_builder(self.output_block)

class CategoricalsImpactCodingTransformerGenerator(Step):
    pass



class CategoricalsCountTransformerGenerator(Step):
    def __init__(self, preprocessing_settings, settings):
        self.preprocessing_settings = preprocessing_settings
        self.settings = settings

    def init_resources(self, mp):
        self.res = mp.get_resource("gen_categorical_counts", "pkl")

    def get_evolution_def(self):
        pass

    def set_evolution_state(self, es):
        pass

    def get_input_features(self):
        if self.settings["behavior"] == "ENABLED_MANUAL":
            if self.settings["all_features"]:
                ret = []
                for (k, v) in self.preprocessing_settings["per_feature"].items():
                    if v["type"] == "CATEGORY" and v["role"] == "INPUT":
                        ret.append(k)
                return ret 
            else:
                ret = self.settings["input_features"]
        else:
            raise Exception("Unimplemented")

    def fit_and_process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        #block = cur_mf.get_block("CAT_IMPUTED")
        features = self.get_input_features()

        for feat in features:
            series = input_df[feat]
            counts = series.value_counts(dropna=False)
            to_take = 200
            candidates = [(k, v) for (k, v) in counts.iloc[0:(to_take+1)].iteritems()]

            self.res["counts_%s"% feat] = candidates

        self.process(input_df, cur_mf, output_ppr, generated_features_mapping)

    def process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        #block = cur_mf.get_block("CAT_IMPUTED")
        features = self.get_input_features()

        new_df = pd.DataFrame()

        preproc_logger.debug("CCTF on %s" % features)
        preproc_logger.debug("Mapping: %s" % self.res)

        for feat in features:
            mapping = {x: y for (x,y) in  self.res["counts_%s"% feat]}
            new_df["categoricals_count_transformer:%s" % feat] = input_df[feat].map(mapping).fillna(1)
        
        cur_mf.append_df("categoricals_count_transformer", new_df)


class OutlierDetection(Step):
    """Performs outliers detection.
       Outputs a new multiframe in output. Does not touch the main multiframe

    """

    def __init__(self,
                 pca_kept_variance,
                 min_n,
                 min_cum_ratio,
                 outlier_name='OUTLIERS',
                 random_state=1337):
        self.min_n = min_n
        self.min_cum_ratio = min_cum_ratio
        self.pca_kept_variance = pca_kept_variance
        self.outlier_name = outlier_name
        self.random_state = random_state

    def init_resources(self, mp):
        self.res = mp.get_resource("clustering_outliers", "pkl")

    def _find_outliers(self, mini_labels):
        preproc_logger.debug("Outliers detection: selecting mini-clusters")
        label_counts = pd.DataFrame(mini_labels.value_counts(ascending=True))
        label_counts.columns = ["count"]
        dataset_size = label_counts["count"].sum()
        label_counts["ratio"] = label_counts["count"] / dataset_size
        label_counts["cum_ratio"] = label_counts["ratio"].cumsum()
        label_counts["outlier"] = (label_counts["cum_ratio"] < self.min_cum_ratio) | (label_counts["count"] < self.min_n)
        check_outliers_parameters(dataset_size, self.min_n)
        preproc_logger.debug("Outliers detection: done (%s mini-clusters are outliers)", label_counts["outlier"].sum())
        outliers_labels = label_counts[label_counts["outlier"]].index.tolist()
        return outliers_labels, mini_labels.map(label_counts["outlier"])

    def _apply_results(self, outliers_mask, cur_mf, input_df, output_ppr):
        # Save outliers detection
        outliers_mf = MultiFrame()
        outliers_mf.append_df("outliers_block", pd.DataFrame({"data": outliers_mask}))
        output_ppr[self.outlier_name] = outliers_mf

        # Apply suppression
        if outliers_mask.sum() > 0:
            preproc_logger.debug("Remove some rows. Shape before:\n%s" % cur_mf.stats())
            cur_mf.drop_rows(outliers_mask)
            preproc_logger.debug("Removed some rows. Shape after:\n%s" % cur_mf.stats())

            input_df.drop(input_df.index[utils.series_nonzero(outliers_mask)], inplace=True)
            preproc_logger.debug("After outliers input_df=%s" % str(input_df.shape))

    def fit_and_process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        inp = cur_mf.as_np_array()
        names = cur_mf.columns()

        preproc_logger.debug("Outliers detection: fitting PCA")
        self.res["pca"] = PCA2(kept_variance=self.pca_kept_variance, random_state=self.random_state)
        self.res["pca"].fit(inp, names)
        preproc_logger.debug("Outliers detection: done fitting PCA")

        df_reduced = self.res["pca"].transform(inp, names)
        n_lines = df_reduced.shape[0]
        n_clusters = max(3, int(cubic_root(n_lines)))

        preproc_logger.debug("Outliers detection: performing cubic-root kmeans on df %s" % str(df_reduced.shape))
        self.res["mini_kmeans"] = KMeans(n_clusters=n_clusters, random_state=self.random_state)
        mini_labels = pd.Series(self.res["mini_kmeans"].fit_predict(df_reduced.values))
        preproc_logger.debug("Outliers detection: done kmeans")

        outliers_labels, outliers_mask = self._find_outliers(mini_labels)
        preproc_logger.debug("Detected %d outliers" % len(outliers_labels))
        self._apply_results(outliers_mask, cur_mf, input_df, output_ppr)
        self.res["outliers_labels"] = outliers_labels

        if cur_mf.shape()[0] == 0:
            raise DkuDroppedMultiframeException("Outliers detection: all rows have been dropped. Check mini-cluster size threshold")

    def process(self, input_df, cur_mf, output_ppr, generated_features_mapping):
        inp = cur_mf.as_np_array()
        names = cur_mf.columns()

        preproc_logger.debug("Outliers detection (apply): applying PCA")
        df_reduced = self.res["pca"].transform(inp, names)
        preproc_logger.debug("Outliers detection (apply): applying KMeans")
        mini_labels = pd.Series(self.res["mini_kmeans"].predict(df_reduced.values))
        preproc_logger.debug("Outliers detection (apply): using")
        if self.res.get("outliers_labels") is not None:
            outlier_labels = self.res["outliers_labels"]
        else:
            # Backward compatibility: only for clustering models trained on older DSS version
            outlier_labels, _ = self._find_outliers(mini_labels)
        outliers_mask = mini_labels.isin(outlier_labels)
        self._apply_results(outliers_mask, cur_mf, input_df, output_ppr)

class PreprocessingResult(dict):

    def __init__(self, retain=None):
        self.retain = retain

    def __setitem__(self, k, v):
        if self.retain is None or k in self.retain:
            dict.__setitem__(self, k, v)


class PreprocessingPipeline(object):
    __slots__ = ('steps', 'results', 'generated_features_mapping')

    def __init__(self, steps):
        self.steps = steps
        self.generated_features_mapping = GeneratedFeaturesMapping()

    def init_resources(self, resource_handler):
        for step in self.steps:
            step.init_resources(resource_handler)

    def fit_and_process(self, input_df, *args, **kwargs):
        result = {}
        cur_mf = MultiFrame()
        cur_mf.set_index_from_df(input_df)
        for step in self.steps:
            preproc_logger.debug("FIT/PROCESS WITH %s" % step)

            new_mf = step.fit_and_process(input_df, cur_mf, result, self.generated_features_mapping)
            if new_mf is not None:
                cur_mf = new_mf
        return result

    def report_fit(self, ret_obj, core_params):
        for step in self.steps:
            step.report_fit(ret_obj, core_params)

    def process(self, input_df, retain=None):
        result = PreprocessingResult(retain=retain)

        cur_mf = MultiFrame()
        cur_mf.set_index_from_df(input_df)
        for step in self.steps:
            preproc_logger.debug("PROCESS WITH %s" % step)
            new_mf = step.process(input_df, cur_mf, result, self.generated_features_mapping)
            if new_mf is not None:
                cur_mf = new_mf
        return result

class DkuDroppedMultiframeException(Exception):
    def __init__(self, message):
        super(DkuDroppedMultiframeException, self).__init__(message)
