# coding: utf-8
from __future__ import unicode_literals

import numpy as np
import pandas as pd

from dataiku.eda.grouping.grouping import Grouping
from dataiku.eda.grouping.grouping import GroupingResult


class AnumGrouping(Grouping):
    TYPE = "anum"

    def __init__(self, column, max_values, regroup_others):
        self.column = column
        self.max_values = max_values
        self.regroup_others = regroup_others

    def describe(self):
        max_val = "" if self.max_values is None else ", max=%s" % self.max_values
        return "Anum(%s%s)" % (self.column, max_val)

    @staticmethod
    def build(params):
        return AnumGrouping(
            params['column'],
            params.get('maxValues'),
            params.get('groupOthers')
        )

    def count_groups(self, idf):
        # We are supposed to count the nb. of unique values after they have been casted to string
        # However, by assuming float -> string cast is a bijection, we can count unique floats without casting
        raw_series = idf.raw_col(self.column)

        if isinstance(raw_series, pd.Categorical):
            nb_unique = len(pd.unique(raw_series.codes))
        elif isinstance(raw_series, np.ndarray):
            nb_unique = len(pd.unique(raw_series))
        else:
            # Likely due to a bug or a change in ImmutableDataFrame
            raise ValueError("Unsupported series type")

        count = nb_unique
        if self.max_values is not None:
            count = min(count, self.max_values)
            if self.regroup_others and nb_unique > self.max_values:
                count += 1
        return count

    def compute_groups(self, idf):
        series = idf.text_col(self.column)

        # Find the most frequent values ordered by (count desc, value asc)
        #
        # Multiple methods have been considered:
        # 1- pd.Series.value_counts
        # 2- pd.Categorical.value_counts
        # 3- np.unique (regular sort)
        # 4- np.partition? pd.Series.nlargest? (partial sort)
        #
        # Observations:
        # - (3) is slower than (1) for large series
        # - (2) is very fast ONLY if nb. categories << nb. of rows
        # - (4) would be the ideal candidate but it does not seem as easy as the others to implement
        #
        # => I've picked (1) because it performs well enough in general
        code_counts = pd.Series(series.codes, copy=False).value_counts(sort=False)

        # Order by (count desc, value asc) + limit
        value_idx = np.lexsort((code_counts.index, -code_counts.values))[:self.max_values]
        top_codes = code_counts.index[value_idx]

        # Merge all the lesser-used values together
        group_key = np.where(np.isin(series.codes, top_codes), series.codes, -1)

        # Generate row indices for each value
        value_to_row_indices = pd.Series(group_key, copy=False).groupby(group_key).indices

        # Produce a list of idfs along with a list of corresponding values
        idfs = []
        values = []
        for value_code in top_codes:
            idfs.append(idf[value_to_row_indices[value_code]])
            values.append(series.categories[value_code])

        # Add 'others' if requested and not empty
        has_all_values = -1 not in value_to_row_indices.keys()
        has_others = False

        if not has_all_values and self.regroup_others:
            idfs.append(idf[value_to_row_indices[-1]])
            has_others = True

        return AnumGroupingResult(self.column, idfs, values, has_others, has_all_values)


class AnumGroupingResult(GroupingResult):
    def __init__(self, column, idfs, values, has_others, has_all_values):
        self.column = column
        self.idfs = idfs
        self.values = values
        self.has_others = has_others
        self.has_all_values = has_all_values

    def serialize(self):
        return {
            "type": AnumGrouping.TYPE,
            "column": self.column,
            "values": self.values,
            "hasOthers": self.has_others,
            "hasAllValues": self.has_all_values
        }

    def iter_groups(self):
        for group_idf in self.idfs:
            yield group_idf
