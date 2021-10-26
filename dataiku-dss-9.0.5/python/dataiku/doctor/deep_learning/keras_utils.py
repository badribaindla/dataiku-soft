import numpy as np
from dataiku.doctor import constants
from dataiku.doctor.multiframe import MultiFrame, NamedNPArray, SparseMatrixWithNames, DataFrameWrapper


##############################################################
# SPECIAL FEATURES
#   Check if feature must be handled as special feature for KERAS backend,
#   i.e. must be sent to a particular pipeline, which will be fitted entirely
#   (each step is independent) on all data, then processed by batch
#   Special features are:
#      - Custom Text preprocessing
#      - Custom Image preprocessing
#    TODO : Add other special features: Signal
##############################################################


def tag_special_features(per_feature):
    for feat in per_feature.values():
        feat["isSpecialFeature"] = _is_special_feature(feat)


def _is_special_feature(feat_params):
    feat_type = feat_params.get("type", None)

    if feat_type == constants.TEXT:
        feat_method = feat_params.get("text_handling", None)
        if feat_method == "CUSTOM":
            return True

    if feat_type == constants.IMAGE:
        feat_method = feat_params.get("image_handling", None)
        if feat_method == "CUSTOM":
            return True

    return False


def split_train_per_input(train_X, per_feature, generated_features_mapping):
    result = {}

    def append_to_result(input_name, array):
        if input_name not in result:
            result[input_name] = array
        else:
            result[input_name] = np.hstack([result[input_name], array])

    for block_name in train_X.block_orders:
        if block_name not in train_X.keep or train_X.keep[block_name]:
            blk = train_X.blocks[block_name]
            if generated_features_mapping.should_send_block_to_one_feature(block_name):
                blk_np = MultiFrame.block_as_np_array(blk)
                original_feature = generated_features_mapping.get_whole_block_original(block_name)
                feature_input_name = per_feature[original_feature]['sendToInput']
                append_to_result(feature_input_name, blk_np)
            else:
                if isinstance(blk, NamedNPArray):
                    for idx, c in enumerate(blk.names):
                        original_feature = generated_features_mapping.get_per_column_original(block_name, c)
                        feature_input_name = per_feature[original_feature]['sendToInput']
                        # Need to reshape the slice of array to (num_rows, 1) because by default numpy considers 1-column
                        # slice of arrays as 1-dimension (row) arrays
                        append_to_result(feature_input_name, blk.array[:, idx].reshape((blk.array.shape[0], 1)))
                elif isinstance(blk, DataFrameWrapper):
                    blkdf = blk.df
                    for c in blk.df.columns:
                        original_feature = generated_features_mapping.get_per_column_original(block_name, c)
                        feature_input_name = per_feature[original_feature]['sendToInput']
                        feature_array = np.expand_dims(blkdf[c].values, axis=1)
                        append_to_result(feature_input_name, feature_array)
                elif isinstance(blk, SparseMatrixWithNames):
                    raise ValueError("SparseMatrix elements are expected to be sent to one feature")
                else:
                    raise Exception("Unknown block type %s" % blk.__class__)
    return result