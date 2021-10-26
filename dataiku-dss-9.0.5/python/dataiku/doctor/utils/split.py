import pandas as pd
import numpy as np
from dataiku import Dataset
import logging

from dataiku.core import dkujson
from dataiku.doctor import utils
import os.path as osp

from dataiku.core import dkujson
from dataiku.doctor import utils
from dataiku.doctor.preprocessing import MLAssertion
from dataiku.doctor.diagnostics import diagnostics

logger = logging.getLogger(__name__)

def df_from_split_desc_no_normalization(split_desc, split, feature_params, prediction_type=None):
    if split_desc["format"] != "csv1":
        raise Exception("Unsupported format")

    if split == "full":
        f = split_desc["fullPath"]
    else:
        f = split == "train" and split_desc["trainPath"] or split_desc["testPath"]

    return load_df_no_normalization(f, split_desc["schema"], feature_params, prediction_type)



def load_df_no_normalization(filepath, schema, feature_params, prediction_type):
    (names, dtypes, parse_date_columns) = Dataset.get_dataframe_schema_st(
        schema["columns"], parse_dates=True, infer_with_pandas=True)
    logging.info("Reading with dtypes: %s" % dtypes)
    dtypes = utils.ml_dtypes_from_dss_schema(schema,
                                             feature_params,
                                             prediction_type=prediction_type)
    # We infer everything with Pandas, EXCEPT booleans.
    # Because then pandas completely looses the original syntax
    # So for example if target is true/false, and we let pandas infer, then it will become
    # True/False, and when we remap, we try to remap with true/false and end up with no
    # target at all
    # for col in split_desc["schema"]["columns"]:
    #     if col["type"] == "boolean":
    #         if dtypes is None:
    #             dtypes = {}
    #         dtypes[col["name"]] = "str"
    logging.info("Reading with FIXED dtypes: %s" % dtypes)
    df = pd.read_table(filepath,
                       names=names,
                       dtype=dtypes,
                       header=None,
                       sep='\t',
                       doublequote=True,
                       quotechar='"',
                       parse_dates=parse_date_columns,
                       float_precision="round_trip")
    logging.info("Loaded table")
    return df


def load_df_with_normalization(filepath, schema, feature_params, prediction_type):
    df = load_df_no_normalization(filepath, schema, feature_params, prediction_type)
    return utils.normalize_dataframe(df, feature_params)


def cast_assertions_masks_bool(df):
    """
    Cast in place ml assertions mask columns as boolean columns.

    Assertions masks are columns filled with:
      * 1 if the corresponding row is matched by the assertion filter
      * empty value if not, converted to NaN by pandas when parsed
    To convert them to boolean columns, we need to first fill NA values with 0 otherwise NA gets casted as True

    :param df: input dataframe
    :type df: pd.DataFrame
    :return: None
    """
    mask_cols = [col for col in df.columns if col.startswith(MLAssertion.ML_ASSERTION_MASK_PREFIX)]
    if len(mask_cols) > 0:
        df[mask_cols] = df[mask_cols].fillna(0).astype(np.bool)


def load_assertions_masks(assertions):
    assertions_list = []
    for assertion in assertions:
        assertions_list.append(
            pd.read_csv(assertion["maskPath"],
                        header=None,
                        dtype=np.float16,  # may contain NaN, that will be removed just after
                        skip_blank_lines=False,  # in order not to swallow empty values as mask are single-column
                        names=[MLAssertion.assertion_col_name(assertion)]))
    assertions_df = pd.concat(assertions_list, axis=1)
    cast_assertions_masks_bool(assertions_df)
    return assertions_df


def df_from_split_desc(split_desc, split, feature_params, prediction_type=None, assertions=None):
    df = df_from_split_desc_no_normalization(split_desc, split, feature_params, prediction_type)
    normalized_df = utils.normalize_dataframe(df, feature_params)
    if not assertions:
        return normalized_df
    else:
        assertions_masks = load_assertions_masks(assertions)
        assert assertions_masks.shape[0] == normalized_df.shape[0], "assertion masks ({}) and {} dataset ({}) " \
                                                                    "don't have the same number of " \
                                                                    "rows".format(assertions_masks.shape[0],
                                                                                  split, normalized_df.shape[0])
        return pd.concat([normalized_df, assertions_masks], axis=1)


def check_sorted(df, column, ascending=True):
    series = df[column]
    first_values_ascending = series[1] >= series[0]
    return series.is_monotonic and (first_values_ascending == ascending)


def input_columns(per_feature):
    return [feature_name for feature_name, feature_details in per_feature.items()
            if feature_details["role"] == "INPUT"]


def get_saved_model_resolved_split_desc(model_folder):
    """ Load the split.json file in the model folder and resolve its paths
    :param model_folder: model folder of a saved model
    :return: the resolved split desc
    """
    split_folder = osp.join(model_folder, "split")
    split_desc = dkujson.load_from_filepath(osp.join(split_folder, "split.json"))
    return resolve_split_desc(split_desc, split_folder)


def get_analysis_model_resolved_split_desc(model_folder, is_partitioned):
    if is_partitioned:
        preprocessing_folder = osp.abspath(osp.join(model_folder, osp.pardir))
        split_instance_id = dkujson.load_from_filepath(osp.join(preprocessing_folder, "split_ref.json"))["splitInstanceId"]
    else:
        session_folder = osp.abspath(osp.join(model_folder, osp.pardir, osp.pardir))
        split_instance_id = dkujson.load_from_filepath(osp.join(session_folder, "split_ref.json"))["splitInstanceId"]
    mltask_folder = osp.abspath(osp.join(model_folder, osp.pardir, osp.pardir, osp.pardir, osp.pardir))
    split_folder = osp.join(mltask_folder, "splits")
    split_desc = dkujson.load_from_filepath(osp.join(split_folder, "{}.json".format(split_instance_id)))
    return resolve_split_desc(split_desc, split_folder)


def resolve_split_desc(split_desc, split_folder):
    path_field_names = ["trainPath", "testPath", "fullPath"]
    for field_name in path_field_names:
        if split_desc.get(field_name) is not None:
            split_desc[field_name] = osp.join(split_folder, split_desc[field_name])
    return split_desc


def load_train_set(core_params, preprocessing_params, split_desc, name, assertions=None, use_diagnostics=True):
    train_df = df_from_split_desc(split_desc, name, preprocessing_params['per_feature'],
                                  core_params["prediction_type"], assertions=assertions)
    if use_diagnostics:
        diagnostics.on_load_train_dataset_end(prediction_type=core_params["prediction_type"], df=train_df, target_variable=core_params["target_variable"])
    logger.info("Loaded train df: shape=(%d,%d)" % train_df.shape)
    return train_df

def load_test_set(core_params, preprocessing_params, split_desc, assertions=None, use_diagnostics=True):
    test_df = df_from_split_desc(split_desc, "test", preprocessing_params["per_feature"],
                                 core_params["prediction_type"], assertions=assertions)
    if use_diagnostics:
        diagnostics.on_load_test_dataset_end(prediction_type=core_params["prediction_type"], df=test_df, target_variable=core_params['target_variable'])
    logger.info("Loaded test df: shape=(%d,%d)" % test_df.shape)
    return test_df