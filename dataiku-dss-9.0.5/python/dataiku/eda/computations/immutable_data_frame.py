# coding: utf-8
from __future__ import unicode_literals

from collections import OrderedDict

import numpy as np
import pandas as pd
import six
from numpy import vectorize
from six.moves import zip_longest
from tabulate import tabulate

from dataiku.eda.exceptions import InvalidParams
from dataiku.eda.exceptions import NumericalCastError


@six.python_2_unicode_compatible
class ImmutableDataFrame(object):
    """
    EdaFrame is an immutable view constructed from a Pandas's DataFrame providing EDA-specific features
    such as post typing.

    Post typing
    ===========

    With post typing, the same column can be "treated as" any type regardless of the underlying storage
    type (which is determined by the original DataFrame). EdaFrame provides facilities to specify type
    when reading a column. In order to avoid repeated conversions, casted series are always cached.

    Post-typed text column:
        - pd.Categorical with unicode strings in py2 & py3
        - No "np.nan": missing values are always represented by ""

    Post-typed float column:
        - Numpy array (float64)
        - NaN represents missing values
        - No 'Inf' or 'Inf'

    Casting rules:
        - Stored as float => read as text:
            - Always possible & safe
            - NaN are converted into ""
        - Stored as text => read as float:
            - "NaN" becomes NaN
            - "Inf"/"-Inf" becomes NaN
            - "" becomes NaN
            - Invalid numbers => exception

    Indexing
    ========

    As opposed to a regular Pandas's DataFrame, EdaFrame does have any advanced indexing mechanism:
    - Columns are stored in np.array (float) or pd.Categorical (text)
    - Rows are indexed by their positions in the EdaFrame

    For convenience, EdaFrame supports boolean & integer indexing, with a few differences compared to Pandas/numpy:
    - Slicing does not copy the data
    - Slicing a EdaFrame produces another EdaFrame which can be sliced again
    - Slices can be intersected and unioned, as long as they are originating from the same EdaFrame
    """

    def text_col(self, column, cache_only=False):
        key = (column, 'text')
        cached = self.cache.get(key)
        if cached is None and not cache_only:
            cached = self._text_col_uncached(column)
            self.cache[key] = cached
        return cached

    def float_col(self, column, cache_only=False):
        key = (column, 'float')
        cached = self.cache.get(key)
        if cached is None and not cache_only:
            cached = self._float_col_uncached(column)
            self.cache[key] = cached
        return cached

    def float_col_no_missing(self, column):
        series = self.float_col(column)
        return series[np.isfinite(series)]

    def __getitem__(self, indices):
        """
            Take a subset of the current EdaFrame. Data are not copied (ie. it returns a view).

            Warning: EdaFrame indexing is not the same as in indexing in np.ndarray/pd.NDFrame

            - Basic slicing is not supported (idf[:], etc)
            - Advanced indexing:
                - Boolean masking is supported
                    - Input must be np.ndarray(np.bool)
                - Purely integer indexing is supported:
                    - Indices must be unique
                    - Input must be one of:
                        - ndarray(np.int)
                        - list(integer)
                        - pd.Int64Index
        """
        if isinstance(indices, list):
            return self[pd.Int64Index(indices, copy=False)]

        if isinstance(indices, np.ndarray):
            if np.issubdtype(indices.dtype, np.bool_):
                return self[pd.Int64Index(np.flatnonzero(indices), copy=False)]

            if np.issubdtype(indices.dtype, np.int_):
                return self[pd.Int64Index(indices, copy=False)]

        if isinstance(indices, pd.Int64Index):
            if len(indices) == len(self):
                return self
            return _ImmutableDataFrameSubset(self, indices)

        raise TypeError("EdaFrame only supports boolean and integer indexing")

    def __len__(self):
        raise NotImplementedError

    def columns(self):
        raise NotImplementedError

    def __str__(self):
        sample = self[np.arange(min(10, len(self)))]
        data = [sample.text_col(col)[:30] for col in sample.columns()]
        cells = map(list, zip(*data))
        return tabulate(cells, headers=self.columns())

    def __and__(self, other):
        return self._combine(other, ImmutableDataFrame._combine_and)

    def __or__(self, other):
        return self._combine(other, ImmutableDataFrame._combine_or)

    @staticmethod
    def from_csv(stream, dss_schema):
        num_types = {"bigint", "double", "float", "int", "smallint", "tinyint"}
        eda_schema = OrderedDict(
            (col['name'], np.float64 if col['type'] in num_types else 'category') for col in dss_schema['columns'])

        df = pd.read_csv(stream,
                         names=eda_schema.keys(),
                         dtype=eda_schema,
                         header=None,
                         sep='\t',
                         doublequote=True,
                         encoding='utf8',
                         quotechar='"',
                         parse_dates=False,
                         float_precision="round_trip")

        return ImmutableDataFrame.from_df(df)

    @staticmethod
    def from_df(df):
        return ImmutableDataFrame.from_dict({col: df[col] for col in df.columns})

    @staticmethod
    def from_dict(data):
        converted_series = {col: ImmutableDataFrame._convert_input_series(series) for col, series in
                            six.iteritems(data)}

        for col_name in converted_series.keys():
            # Sanity of mind: EdaFrame column names are always 'unicode' (py2) / 'str' (py3)
            assert isinstance(col_name, six.text_type)

        all_series = list(converted_series.values())
        size = 0 if len(all_series) == 0 else len(all_series[0])
        if not all(len(series) == size for series in all_series):
            raise ValueError("All columns must have the same size")

        return _RootImmutableDataFrame(converted_series, size)

    # End of public API

    def __init__(self):
        self.cache = {}

    def _text_col_uncached(self, column):
        values = self.raw_col(column)
        if isinstance(values, pd.Categorical):
            return values

        return ImmutableDataFrame._cast_float_to_text(values)

    @staticmethod
    def _combine_or(base, a, b, indices_a, indices_b):
        if indices_a is None:
            return a
        if indices_b is None:
            return b
        return base[indices_a | indices_b]

    @staticmethod
    def _combine_and(base, a, b, indices_a, indices_b):
        if indices_a is None:
            return b
        if indices_b is None:
            return a
        return base[indices_a & indices_b]

    def _float_col_uncached(self, column):
        values = self.raw_col(column)
        if isinstance(values, np.ndarray):
            return values

        return ImmutableDataFrame._cast_text_to_float(values)

    @staticmethod
    def _cast_text_to_float(data):
        try:
            data = np.cast[np.float64](np.where(data == '', 'NaN', data))
            return np.where(np.isfinite(data), data, np.nan)
        except ValueError:
            raise NumericalCastError()

    @staticmethod
    def _cast_float_to_text(data):
        @vectorize
        def _float_formatter(float_value):
            return "%g" % float_value

        out = _float_formatter(data)
        out[~np.isfinite(data)] = ""
        return pd.Categorical(out, categories=sorted(pd.unique(out)), ordered=True)

    def _combine(self, other, combine_fn):
        common_ancestor = None

        for idf_a, idf_b in zip_longest(self._browse_slice_hierarchy(), other._browse_slice_hierarchy()):
            if idf_a is idf_b:
                common_ancestor = idf_a
                continue
            if common_ancestor is None:
                raise ValueError("Combined EdaFrames must share a common ancestor")
            indices_a = self._squash_indices_into_parent(common_ancestor)
            indices_b = other._squash_indices_into_parent(common_ancestor)
            return combine_fn(common_ancestor, self, other, indices_a, indices_b)
        return self

    def _squash_indices_into_parent(self, until_parent):
        raise NotImplementedError

    @staticmethod
    def _convert_input_series(series):
        """
            Convert an "external" series into EdaFrame storage format:
            - pd.Categorical(ordered=True) if the values are string-like
            - np.ndarray(dtype=np.float64) if the values are number-like
        """
        if isinstance(series, pd.Series):
            # Only keep values (np.ndarray or pd.Categorical)
            return ImmutableDataFrame._convert_input_series(series.values)
        elif isinstance(series, pd.Categorical):
            return ImmutableDataFrame._parse_input_categorical(series)
        elif isinstance(series, np.ndarray):
            if np.issubdtype(series.dtype, np.float64) or np.issubdtype(series.dtype, np.integer):
                # Map everyone to float64 (even integers)
                series = np.cast[np.float64](series)
                # Inf/-Inf are allowed in Pandas, but in EDA world they are treated as empty represented by NaN
                series[~np.isfinite(series)] = np.nan
                # Replace -0 by 0
                series[series == 0] = 0
                return series
            elif series.dtype == 'object':
                # Convert to pd.Categorical
                return ImmutableDataFrame._parse_input_categorical(pd.Categorical(series))
        elif isinstance(series, list):
            # Use Pandas's type inference
            return ImmutableDataFrame._convert_input_series(pd.Series(series))

        raise ValueError("Unrecognized input type")

    @staticmethod
    def _parse_input_categorical(categorical):
        """
            Transform a pd.Categorical into an EdaFrame-compliant pd.Categorical:
            - NaN are not allowed and are replaced by empty strings
            - Categories must be unicode strings & lexicographically sorted
        """

        # Replace np.nan by a category (empty string: "")
        if "" not in categorical.categories:
            categorical = categorical.add_categories("")
        categorical = categorical.fillna("")

        # Sort categories lexicographically
        categorical = categorical.reorder_categories(new_categories=sorted(categorical.categories), ordered=True)

        for category in categorical.categories:
            # Sanity of mind: EdaFrame text values are always 'unicode' (py2) / 'str' (py3)
            #                 and NOTHING else (float, None, ...)
            assert isinstance(category, six.text_type)

        return categorical

    def raw_col(self, column, cache_only=False):
        raise NotImplementedError

    def _browse_slice_hierarchy(self):
        raise NotImplementedError


class _RootImmutableDataFrame(ImmutableDataFrame):
    def __init__(self, col_data, df_size):
        super(_RootImmutableDataFrame, self).__init__()
        self.col_data = col_data
        self.df_size = df_size

    def raw_col(self, column, cache_only=False):
        try:
            return self.col_data[column]
        except KeyError:
            raise InvalidParams("Column \"%s\" does not exist" % column)

    def __len__(self):
        return self.df_size

    def columns(self):
        return list(self.col_data.keys())

    def _browse_slice_hierarchy(self):
        yield self

    def _squash_indices_into_parent(self, until_parent):
        return None


class _ImmutableDataFrameSubset(ImmutableDataFrame):
    def __init__(self, idf, indices):
        super(_ImmutableDataFrameSubset, self).__init__()
        self.idf = idf
        self.indices = indices

    def columns(self):
        return self.idf.columns()

    def __len__(self):
        return len(self.indices)

    def _raw_col_uncached(self, column):
        return self.idf.raw_col(column)[self.indices]

    def _text_col_uncached(self, column):
        parent_text_col = self.idf.text_col(column, cache_only=True)
        if parent_text_col is not None:
            return parent_text_col[self.indices]

        return super(_ImmutableDataFrameSubset, self)._text_col_uncached(column)

    def _float_col_uncached(self, column):
        parent_text_col = self.idf.float_col(column, cache_only=True)
        if parent_text_col is not None:
            return parent_text_col[self.indices]

        return super(_ImmutableDataFrameSubset, self)._float_col_uncached(column)

    def raw_col(self, column, cache_only=False):
        key = (column, 'raw')
        cached = self.cache.get(key)
        if cached is None and not cache_only:
            cached = self._raw_col_uncached(column)
            self.cache[key] = cached
        return cached

    def _browse_slice_hierarchy(self):
        for idf in self.idf._browse_slice_hierarchy():
            yield idf
        yield self

    def _squash_indices_into_parent(self, until_parent):
        if self is until_parent:
            return None
        parent_indices = self.idf._squash_indices_into_parent(until_parent)
        if parent_indices is None:
            return self.indices
        return parent_indices[self.indices]
