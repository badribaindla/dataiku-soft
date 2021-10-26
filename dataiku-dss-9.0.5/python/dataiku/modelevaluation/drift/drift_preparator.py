import logging

import enum
import numpy as np
import pandas as pd

from dataiku.base.utils import safe_unicode_str
from dataiku.doctor.constants import NUMERIC

logger = logging.getLogger(__name__)


class ResolvedColumnHandling(enum.Enum):
    NUMERICAL = 1
    CATEGORICAL = 2
    IGNORED = 3


class DriftPreparator(object):
    """
    Prepare reference & current dataframes by applying (the same) drift column handling parameters
    => Ensure the two dataframes have *exactly* the same schema after preparation
    """

    def __init__(self, original_ref_me, original_cur_me, data_drift_params):
        self.original_ref_df = original_ref_me.sample_df
        self.original_cur_df = original_cur_me.sample_df
        self.ref_preprocessing = original_ref_me.preprocessing_params
        self.cur_preprocessing = original_cur_me.preprocessing_params
        self.data_drift_params = data_drift_params

    def _infer_column_handling(self, column):
        """
        Determine the type of a column for drift analysis from multiple sources:
        - Drift column params (if they are defined for this column)
        - MEs (or ME-like)'s preprocessings
        - Pandas type
        """

        ref_feature_handling = self.ref_preprocessing["per_feature"].get(column)
        cur_feature_handling = self.cur_preprocessing["per_feature"].get(column)

        if ref_feature_handling is None or cur_feature_handling is None:
            default_handling = ResolvedColumnHandling.CATEGORICAL
        elif ref_feature_handling["role"] == "REJECT" or cur_feature_handling["role"] == "REJECT":
            default_handling = ResolvedColumnHandling.IGNORED
        elif ref_feature_handling["type"] == NUMERIC and cur_feature_handling["type"] == NUMERIC:
            default_handling = ResolvedColumnHandling.NUMERICAL
        else:
            default_handling = ResolvedColumnHandling.CATEGORICAL

        drift_col_params = self.data_drift_params.columns.get(column)
        if drift_col_params:
            if not drift_col_params.get("enabled", False):
                actual_handling = ResolvedColumnHandling.IGNORED
            elif drift_col_params["handling"] == "NUMERICAL":
                actual_handling = ResolvedColumnHandling.NUMERICAL
            else:
                actual_handling = ResolvedColumnHandling.CATEGORICAL
        else:
            actual_handling = default_handling

        return actual_handling, default_handling

    def prepare(self):
        ref_series = {}
        cur_series = {}
        per_column_report = []

        for column in self.list_available_columns():
            actual_handling, default_handling = self._infer_column_handling(column)
            logger.info("Treating {} as {} for drift analysis".format(column, actual_handling))

            report = {
                "name": column,
                "actualHandling": ResolvedColumnHandling.IGNORED.name,
                "defaultHandling": default_handling.name
            }

            if actual_handling == ResolvedColumnHandling.NUMERICAL:
                try:
                    ref_series[column] = self.original_ref_df[column].astype(np.float64)
                    cur_series[column] = self.original_cur_df[column].astype(np.float64)
                    report["actualHandling"] = actual_handling.name
                except ValueError as e:
                    logger.info("Failed to cast {} as {} for drift analysis".format(column, actual_handling))
                    report["errorMessage"] = safe_unicode_str(e)
                    ref_series.pop(column, None)
                    cur_series.pop(column, None)

            elif actual_handling == ResolvedColumnHandling.CATEGORICAL:
                # TODO: py2/p3 ok?
                ref_series[column] = self.original_ref_df[column].astype(str)
                cur_series[column] = self.original_cur_df[column].astype(str)
                report["actualHandling"] = actual_handling.name

            per_column_report.append(report)

        return pd.DataFrame(ref_series), pd.DataFrame(cur_series), per_column_report

    def list_available_columns(self):
        return list(self.original_ref_df.columns & self.original_cur_df.columns)
