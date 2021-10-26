import time
import unicodedata
import numpy as np
import pandas as pd
import logging
import os.path as osp
import os, sys

from datetime import datetime

import scipy.sparse
import six

from dataiku.base.utils import safe_unicode_str
from dataiku.base.utils import safe_exception
from dataiku.core import dkujson as dkujson
from dataiku.doctor.utils.subsampler import subsample
from dataiku.doctor.utils.magic_main import magic_main

logger = logging.getLogger(__name__)


def unix_time_millis():
    return int(1000 * time.time())

def dataframe_from_dict_with_dtypes(records, dtypes):
    """ Create a pd.DataFrame from a dict with the specified dtypes
    :param records: dict { col: [values] }
    :param dtypes: dict of dtype
    :rtype: pd.DataFrame
    """
    # Pandas does not support a dict of dtypes as input to pd.DataFrame( dict_of_columns )
    # so we have to build each Series independently
    df_in = {}
    for col_name in records:
        col_data = records[col_name]
        if col_name in dtypes:
            dtype = dtypes[col_name]
            if dtype == 'str' and sys.version_info < (3, 0):
                col_data = [(x.encode('utf8') if isinstance(x, six.text_type) else x) for x in col_data]
            df_in[col_name] = pd.Series(col_data, dtype=dtype)
        else:
            df_in[col_name] = pd.Series(col_data)

    return pd.DataFrame(df_in)


def add_missing_columns(df, dtypes, per_feature):
    """ Add missing columns to df that are in per_feature with the type specified in dtypes
    :param df: DataFrame with the missing columns
    :param dtypes: dict of dtype of all the columns to add
    :param per_feature: Doctor's per feature information
    :return: Modified DataFrame
    :rtype: pd.DataFrame
    """
    missing_dict = {}
    for fname in per_feature:
        fparams = per_feature[fname]
        role = fparams["role"]
        if role == "REJECT":
            continue
        if fname not in df.columns:
            # since 0.23 (and up to 0.23.4), pd.Series(index=index, dtype="str") creates a series with values "n"
            # see https://github.com/pandas-dev/pandas/issues/22477
            missing_dict[fname] = pd.Series([None for _ in df.index], index=df.index,
                                            dtype=dtypes.get(fname, np.object))
    missing_df = pd.DataFrame(missing_dict)
    return pd.concat([df, missing_df], axis=1)

def ml_dtype_from_dss_column(schema_column, feature_type, feature_role, prediction_type=None):
    t = schema_column["type"]

    # NO NO # For the target, we want to keep the original value because
    # NO NO # the remapping has been made by Java
    if feature_role == "TARGET":
        assert prediction_type is not None
        if prediction_type == "REGRESSION":
            return np.float64
        else:
            return np.object_

    # We don't care about rejected features, so let pandas decide on its own
    # (as it might be more efficient than just asking for np.object_)
    if feature_role == "REJECT":
        return None 

    if feature_type == "NUMERIC":
        if t == "date":
            # We can't ask specifically Pandas to parse as a date
            # so we say None as dtype, and we'll pass it as parse_date_columns
            return None #return np.dtype("M8[ns]")
        elif t in ["tinyint", "smallint", "int", "bigint", "float", "double"]:
            # DSS is more permissive when it comes to typing numericals:
            # an integer may have nulls, while it may not in Pandas
            # Thus, in the Pandas code, we treat all numericals as double
            return np.float64
        else:
            reason = u"its type is {}".format(safe_unicode_str(t))
            if "downcastedToStringFromMeaning" in schema_column:
                reason = u"its meaning is {} but it contains invalids and was downgraded to string".format(safe_unicode_str(schema_column["downcastedToStringFromMeaning"]))

            raise safe_exception(ValueError, u"Cannot treat column {} as numeric ({})".format(safe_unicode_str(schema_column["name"]), reason))

    else:
        return 'str'


def ml_dtypes_from_dss_schema(schema, params, prediction_type=None):
    dtypes = {}
    for col in schema["columns"]:

        feature_params = params.get(col["name"], None)
        # Column is not known (probably we are at scoring time and it is an extraneous
        # column in the set to score): don't use a dtype, so let pandas decide on its own
        # (as it might be more efficient than just asking for np.object_)
        if feature_params is None:
            continue

        dtype = ml_dtype_from_dss_column(col, feature_params["type"],
            feature_params["role"], prediction_type)
        logger.info("Computed dtype for %s: %s (schema_type=%s feature_type=%s feature_role=%s)"%
            (col["name"], dtype, col["type"], feature_params["type"], feature_params["role"]))

        # Since pandas 0.19, we must absolutely not put "None" in the dtype dict, else
        # it resolved to float64 (dkubot image me stupid panda)
        if dtype is not None:
            dtypes[col["name"]] = dtype
    return dtypes


# def transform_back_to_scoring_output(schema, df):
#     # When reading the dataframe from the preparation stream, we
#     # downgraded all integers to floats to avoid unrepresentability issues
#     # while keeping numericality.
#     # This operation tries to change the representation back to integer
#     # and then to string (else we can't store it)

#     for col in schema["columns"]:
#         if col["type"] in ["tinyint", "smallint", "int", "bigint"]:
#             try:
#                 df[col] = df[col]


def datetime_to_epoch(series):
    if hasattr(series.dtype, 'tz'):
        EPOCH = datetime(1900, 1, 1, tzinfo=series.dtype.tz) # expect that it's UTC
        return (series - EPOCH) / np.timedelta64(1, 's')
    else:
        EPOCH = datetime(1900, 1, 1)
        return (series - EPOCH) / np.timedelta64(1, 's')

def epoch_to_datetime(series, orig_series):
    if hasattr(orig_series.dtype, 'tz'):
        EPOCH = datetime(1900, 1, 1, tzinfo=orig_series.dtype.tz) # expect that it's UTC
        return (series * np.timedelta64(1, 's')) + EPOCH
    else:
        EPOCH = datetime(1900, 1, 1)
        return (series * np.timedelta64(1, 's')) + EPOCH


def strip_accents(s):
    return ''.join(
        c
        for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )


def normalize_dataframe(df, params, missing_columns = 'ERROR'):
    """
    Normalizes a dataframe so that it can be used as input for a preprocessing pipeline.
    You should not have to add anything here ...

    Does 2 things:
       - Add missing columns (for API node)
       - Converts datetime to epoch
    """
    for fname, fparams in params.items():
        role = fparams["role"]
        if fname not in df.columns:
            skippable_roles = ["TARGET", "REJECT", "WEIGHT"]
            if role not in skippable_roles:
                if missing_columns == 'ERROR':
                    logger.info("Dumping columns in dataframe: %s" % df.columns)
                    raise safe_exception(ValueError, u"The feature {} doesn't exist in the dataset".format(safe_unicode_str(fname)))
                elif missing_columns == 'CREATE':
                    df[fname] = np.nan
        elif role != "TARGET":
            try:
                series = df[fname]
                if fparams['type'] == "NUMERIC" and dtype_is_m8s(series.dtype):
                    logger.info("Normalizing date to numeric : %s" % series)
                    df[fname] = datetime_to_epoch(series)
                    logger.info("Normalized date : %s" % df[fname])
                elif fparams['type'] == "CATEGORY" and dtype_is_m8s(series.dtype):
                    logger.info("Normalizing date to category : %s" % series)
                    df[fname] = series.dt.strftime('%Y-%m-%dT%H:%M:%S.%f').str.slice(0, 23) + 'Z'
                    logger.info("Normalized date : %s" % df[fname])
            except ValueError as e:
                raise safe_exception(ValueError, u"Feature {} error: {}".format(safe_unicode_str(fname), safe_unicode_str(e)))

    logger.info(" Coercion done")
    return df


def remove_all_nan(obj):
    """Removes all nan values from an object, recursively.
    No thanks to the stupid JSON spec"""
    def remove_all_nan_rec(x):
        if type(x) is dict:
            for (k, v) in x.items():
                x[k] = remove_all_nan_rec(v)
            return x
        elif type(x) is list or isinstance(x, np.ndarray):
            newarr = []
            for item in x:
                newarr.append(remove_all_nan_rec(item))
            return newarr
        elif x is None:
            return None
        else:
            if sys.version_info < (3,):
                if not isinstance(x, (int, long, float, complex, np.float32)):
                    return x
            else:
                if not isinstance(x, (int, float, complex, np.float32)):
                    return x
                            
            if np.isnan(x):
                return None
            else:
                return x
    return remove_all_nan_rec(obj)


def save_diagnostics(folder, diags):
    filename = "train_diagnostics.json"
    filepath = osp.join(folder, filename)

    diags = [h.to_dict() for h in diags]
    all_diags = {"diagnostics": diags}

    filepath_tmp = osp.join(folder, filename + ".tmp")
    dkujson.dump_to_filepath(filepath_tmp, all_diags)
    os.rename(filepath_tmp, filepath)


def write_hyperparam_search_time_traininfo(folder, hp_search_time):
    status_filepath = osp.join(folder, "train_info.json")
    if osp.exists(status_filepath):
        status = dkujson.load_from_filepath(status_filepath)
    else:
        status = {}

    status["hyperparamsSearchTime"] = hp_search_time
    dkujson.dump_to_filepath(status_filepath, status)


def get_hyperparams_search_time_traininfo(folder):
    status_filepath = osp.join(folder, "train_info.json")
    if osp.exists(status_filepath):
        status = dkujson.load_from_filepath(status_filepath)
        if status.get("resumed", False):
            return status.get("hyperparamsSearchTime")
    return None


def write_running_traininfo(folder, start_time, listener):
    status_filepath = osp.join(folder, "train_info.json")
    if osp.exists(status_filepath):
        status = dkujson.load_from_filepath(status_filepath)
    else:
        status = {}

    status["state"] = "RUNNING"
    status["startTime"] = start_time
    status["progress"] = listener
    dkujson.dump_to_filepath(status_filepath, status)


def write_done_traininfo(folder, start_time, start_training_time, end_time, listener_json, end_preprocessing_time=None):
    status_filepath = osp.join(folder, "train_info.json")
    if osp.exists(status_filepath):
        status = dkujson.load_from_filepath(status_filepath)
    else:
        status = {}

    status["state"] = "DONE"
    status["startTime"] = start_time
    status["endTime"] = end_time

    resumed = status.get("resumed", False)  # model was interrupted then re-run

    preprocessing_time = (end_preprocessing_time or start_training_time) - start_time
    if "preprocessingTime" in status and resumed:
        preprocessing_time += status["preprocessingTime"]
    status["preprocessingTime"] = preprocessing_time

    training_time = end_time - start_training_time
    if "trainingTime" in status and resumed:
        training_time += status["trainingTime"]
    status["trainingTime"] = training_time

    status["progress"] = listener_json
    dkujson.dump_to_filepath(status_filepath, status)


def write_model_status(modeling_set, status):
    status_filepath = osp.join(modeling_set["run_folder"], "train_info.json")
    dkujson.dump_to_filepath(status_filepath, status)


def write_preproc_file(run_folder, filename, obj):
    dkujson.dump_to_filepath(osp.join(run_folder, filename), obj)


def dku_isnan(val):
    """Safe isnan that accepts non-numeric"""
    if sys.version_info < (3,):
        if isinstance(val, (int, long, float)):
            return np.isnan(val)
    else:
        if isinstance(val, (int, float)):
            return np.isnan(val)
    return True


def dku_nonan(val):
    """Replaces numerical NaNs by None"""
    if sys.version_info < (3,):
        if isinstance(val, (int, long, float)):
            if np.isnan(val):
                return None
    else:                
        if isinstance(val, (int, float)):
            if np.isnan(val):
                return None
    return val


def dku_nonaninf(val):
    """Replaces numerical NaNs and Inf by None"""
    if sys.version_info < (3,):
        if isinstance(val, (int, long, float)):
            if np.isnan(val) or np.isinf(val):
                return None
    else:
        if isinstance(val, (int, float)):
            if np.isnan(val) or np.isinf(val):
                return None
    return val


def dku_indexing(a, indices):
    """
    Extracts and returns the elements of `a` located at indices `indices.
    Motivation: In the code, we need to split data using indices. But the data can either be a
        numpy array, a pandas object or a sparse matrix. This function handles this complexity.
    :param scipy.sparse.csr_matrix | np.ndarray | pd.Series | pd.DataFrame a: matrix to split
    :param indices: indices of the elements of the matrix to return
    :return: extracted elements
    :rtype: scipy.sparse.csr_matrix | np.ndarray | pd.Series | pd.DataFrame
    """
    if isinstance(a, scipy.sparse.csr_matrix):
        return a[indices]
    if isinstance(a, np.ndarray):
        # If `a` is a numpy array, we use np.take instead of fancy indexing
        # because in some cases it can much faster. (Especially if `a` has
        # a moderate number of columns.)
        return a.take(indices, axis=0)
    if isinstance(a, (pd.Series, pd.DataFrame)):
        # If `a` uses pandas, we use iloc which is more idiomatic than `take`.
        return a.iloc[indices]
    raise TypeError("Array should be a numpy array, a sparse matrix, or a pandas object, got {} instead".format(type(a)))


def series_nonzero(series):
    # Pandas 0.24 introduced to_numpy() and deprecated nonzero().
    # Pandas 1 removed nonzero()
    if hasattr(series, "to_numpy"):
        return series.to_numpy().nonzero()
    else:
        return series.nonzero()

def dtype_is_m8s(d):
    # Pandas 1 has a datetime64 with explicit timezone, which is a dtype extension that is not == to dtype("M8[ns]")
    m8ns_dtype = np.dtype('M8[ns]')
    if d == m8ns_dtype:
        return True
    elif hasattr(d, "base") and d.base == m8ns_dtype:
        return True
    else:
        return False

def dku_write_mode_for_pickling():
    if sys.version_info < (3,):
        return "w" # dump() wants str
    else:
        return "wb" # dump() wants bytes


def dku_deterministic_value_counts(pd_series, dropna=True):
    """
    Count the value in pd_series as pandas pd_serie.value_counts() would do but ensure that it's deterministic.

    In particular, we experienced for py3 non deterministic behaviour for modalities with the same value_count, which
    would make doctor trainings not reproducible. The solution is to also sort by count and lexicographic order.

    In order not to modify the already satisfying behaviour for existing py2 models, we only apply this particular order
    when in python 3

    :param pd_series: a pd.Series on which the value counts should be performed
    :param dropna: boolean - do not include counts of NaN
    :return: pd.Series
    """
    if sys.version_info < (3,):
        return pd_series.value_counts(dropna=dropna)
    else:
        return pd_series.value_counts(sort=False, dropna=dropna).sort_index(ascending=False).sort_values(ascending=False)
