import logging
from os import path as osp
from six.moves import xrange

import numpy as np
import pandas as pd

import dataiku
from dataiku import default_project_key
from dataiku.core import dkujson

from dataiku.base.utils import safe_unicode_str
from dataiku.doctor import constants, utils
from dataiku.doctor.deep_learning import keras_model_io_utils
from dataiku.doctor.deep_learning.keras_utils import split_train_per_input
from dataiku.doctor.prediction import binary_classif_scoring_add_percentile_and_cond_outputs
from dataiku.doctor.prediction.evaluation_base import add_evaluation_columns
from dataiku.doctor.preprocessing_handler import PreprocessingHandler
from dataiku.doctor.utils import normalize_dataframe

logger = logging.getLogger(__name__)

##############################################################
# BUILDING MODEL FROM USER CODE
##############################################################

def get_keras_model(train_normal_X, train_df, pipeline, test_df, per_feature, modeling_params, run_folder,
                    prediction_type, target_map, generated_features_mapping, save_model=True):
    from dataiku.doctor.deep_learning import gpu
    import tensorflow as tf
    from keras.utils import multi_gpu_model
    from dataiku.doctor.deep_learning.keras_callbacks import get_base_callbacks
    from dataiku.doctor.deep_learning.sequences import InputsDataWithTargetSequence

    train_normal_dict_np = split_train_per_input(train_normal_X, per_feature, generated_features_mapping)
    input_shapes = {}
    for k in train_normal_dict_np.keys():
        input_shapes[k] = (train_normal_dict_np[k].shape[1],)

    # User needs to know number of classes in order to build appropriate network
    if prediction_type in [constants.MULTICLASS, constants.BINARY_CLASSIFICATION]:
        output_num_labels = len(target_map)
    else:
        output_num_labels = 1

    keras_params = modeling_params["keras"]

    # Set GPU options if required
    if keras_params["useGPU"]:
        from dataiku.doctor.deep_learning import gpu
        gpu.load_gpu_options(keras_params["gpuList"],
                             allow_growth=keras_params["gpuAllowGrowth"],
                             per_process_gpu_memory_fraction=float(keras_params["perGPUMemoryFraction"]))
    else:
        gpu.deactivate_gpu()

    # Retrieve/Build functions to build and train Keras architecture
    assert keras_params.get('buildCode', False)
    build_code = keras_params["buildCode"]
    dic_build = {}
    exec(build_code, dic_build, dic_build)


    build_model = retrieve_func_from_code("build_model", dic_build, "Architecture")
    compile_model = retrieve_func_from_code("compile_model", dic_build, "Architecture")

    if keras_params["advancedFitMode"]:
        train_code = keras_params["fitCode"]
        # Will define fit model function and activate/deactivate GPU if required
        dic_fit = {}
        exec(train_code, dic_fit, dic_fit)

        fit_model = retrieve_func_from_code("fit_model", dic_fit, "Training")
        build_sequences = retrieve_func_from_code("build_sequences", dic_fit, "Training")


    num_gpus = gpu.get_num_gpu_used()
    use_multi_gpus = (num_gpus > 1)

    if use_multi_gpus:
        with tf.device('/cpu:0'):
            base_model = build_model(input_shapes, output_num_labels)
        model = multi_gpu_model(base_model, num_gpus)
    else:
        base_model = None
        model = build_model(input_shapes, output_num_labels)

    check_model_output_dimension(model, prediction_type, target_map, modeling_params)
    model = compile_model(model)

    train_sequence_builder = InputsDataWithTargetSequence.get_sequence_builder(prediction_type, train_df, pipeline, 
                                                                               per_feature, generated_features_mapping, 
                                                                               modeling_params, target_map, "train")
    validation_sequence_builder = InputsDataWithTargetSequence.get_sequence_builder(prediction_type, test_df, pipeline,
                                                                                    per_feature, 
                                                                                    generated_features_mapping,
                                                                                    modeling_params, target_map,
                                                                                    "validation")

    # Building sequences
    if keras_params["advancedFitMode"]:
        train_sequence, validation_sequence = build_sequences(train_sequence_builder, validation_sequence_builder)
    else:
        batch_size = keras_params["batchSize"]
        train_sequence = train_sequence_builder(batch_size)
        validation_sequence = validation_sequence_builder(batch_size)

    base_callbacks = get_base_callbacks(run_folder, modeling_params, validation_sequence,
                                        prediction_type, test_df.index, target_map, save_model, use_multi_gpus,
                                        base_model)

    if keras_params["advancedFitMode"]:
        # Call fit_model function defined in fitCode
        fit_model(model,
                  train_sequence,
                  validation_sequence,
                  base_callbacks)
    else:
        # Manually call fit_generator on model with parameters from UI
        batch_size = keras_params["batchSize"]
        epochs = keras_params["epochs"]
        steps_per_epoch = keras_params["stepsPerEpoch"] if not keras_params["trainOnAllData"] else None
        model.fit_generator(train_sequence_builder(batch_size),
                            epochs=epochs,
                            steps_per_epoch=steps_per_epoch,
                            callbacks=base_callbacks,
                            shuffle=keras_params["shuffleData"])

    # Retrieving best model that was saved with callback
    model = keras_model_io_utils.load_model(osp.join(run_folder, constants.KERAS_MODEL_FILENAME))
    print("Retrieving custom Keras model {}".format(model))
    return model, validation_sequence

def check_model_output_dimension(model, prediction_type, target_map, modeling_params):
    output_shape = model.output_shape
    modeling_params["keras"]["oneDimensionalOutput"] = False

    if len(output_shape) != 2:
        raise ValueError("Output of Deep Learning must be 2-dimensional. It has currently a "
                         "dimension: {}".format(len(output_shape)))

    if prediction_type == constants.REGRESSION and output_shape[-1] != 1:
        raise ValueError("For regression problems, output of Deep Learning Architecture must have a "
                         "dimension equal to 1. It is currently: {}".format(output_shape[-1]))

    if prediction_type == constants.BINARY_CLASSIFICATION:
        if output_shape[-1] == 1:
            modeling_params["keras"]["oneDimensionalOutput"] = True
        if not(output_shape[-1] != 1 or output_shape[-1] != 2):
            raise ValueError("For binary classification problems, output of Deep Learning Architecture must have a "
                             "dimension equal to 1 or 2. It is currently: {}".format(output_shape[-1]))

    if prediction_type == constants.MULTICLASS and output_shape[-1] != len(target_map):
        raise ValueError("For this multiclass classification problem, output of Deep Learning "
                         "Architecture must have a dimension equal to {} (number of classes). "
                         "It is currently: {}".format(len(target_map), output_shape[-1]))

def retrieve_func_from_code(func_name, dic, code_type):
    if func_name not in dic:
        raise ValueError("You must define a '{}' function in the {} code".format(func_name, code_type))
    return dic[func_name]

##############################################################
# SCORING MODEL
##############################################################

def build_scored_validation_data(model, prediction_type, modeling_params, valid_iterator, nb_steps=None,
                                 on_step_end_func=None):

    if nb_steps is None:
        nb_steps = len(valid_iterator)

    probas_list = []
    preds_list = []
    valid_y_list = []
    num_batch = 0
    while num_batch < nb_steps:

        (X, y) = valid_iterator[num_batch]

        if prediction_type == constants.REGRESSION:
            valid_y_list.append(y)
            preds_list.append(np.squeeze(model.predict(X), axis=1))
        elif prediction_type == constants.BINARY_CLASSIFICATION and modeling_params["keras"]["oneDimensionalOutput"]:
            valid_y_list.append(y)
            probas_one_raw = np.squeeze(model.predict(X), axis=1)
            probas_raw = np.zeros((probas_one_raw.shape[0], 2))
            probas_raw[:, 1] = probas_one_raw
            probas_raw[:, 0] = 1 - probas_one_raw
            probas_list.append(probas_raw)
            preds_list.append((probas_one_raw > 0.5).astype(np.int))
        else:
            # i.e. for MULTICLASS and BINARY CLASSIF with 2-dimensional output
            valid_y_list.append(np.argmax(y, axis=1))
            probas_raw = model.predict(X)
            probas_list.append(probas_raw)
            preds_list.append(np.argmax(probas_raw, axis=1))

        if on_step_end_func is not None:
            on_step_end_func(num_batch)

        num_batch += 1

    valid_y_as_np = np.concatenate(valid_y_list)
    preds = np.concatenate(preds_list)
    if prediction_type != constants.REGRESSION:
        valid_y_as_np = valid_y_as_np.astype(int)
        probas = np.concatenate(probas_list)
    else:
        probas = None
    valid_y = pd.Series(valid_y_as_np)
    return preds, probas, valid_y

def get_scored_from_y_and_pred(y, y_pred, prediction_type, modeling_params):
    probas = None
    if prediction_type == constants.REGRESSION:
        valid_y = np.squeeze(y, axis=1)
        preds = np.squeeze(y_pred, axis=1)
    elif prediction_type == constants.BINARY_CLASSIFICATION and modeling_params["keras"]["oneDimensionalOutput"]:
        valid_y = np.squeeze(y, axis=1)
        probas_one = np.squeeze(y_pred, axis=1)
        probas = np.zeros((probas_one.shape[0], 2))
        probas[:, 1] = probas_one
        probas[:, 0] = 1 - probas_one
        preds = (probas_one > 0.5).astype(np.int)
    else:
        # i.e. for MULTICLASS and BINARY CLASSIF with 2-dimensional output
        valid_y = np.argmax(y, axis=1)
        probas = y_pred
        preds = np.argmax(probas, axis=1)

    return preds, probas, valid_y

##############################################################
# SCORING GENERATOR FOR SCORING/EVALUATION RECIPES
##############################################################
def scored_dataset_generator(model_folder, input_dataset, recipe_desc, script, preparation_output_schema,
                             cond_outputs, output_y=False, output_input_df=False):
    from dataiku.doctor.deep_learning import gpu
    from dataiku.doctor.deep_learning.keras_utils import tag_special_features, split_train_per_input

    # Load GPU Options
    if recipe_desc["useGPU"]:
        from dataiku.doctor.deep_learning import gpu
        gpu.load_gpu_options(recipe_desc["gpuList"],
                             allow_growth=recipe_desc["gpuAllowGrowth"],
                             per_process_gpu_memory_fraction=float(recipe_desc["perGPUMemoryFraction"]))
    else:
        gpu.deactivate_gpu()

    batch_size = recipe_desc.get("batchSize", 100)
    sampling = recipe_desc.get("selection", {"samplingMethod":"FULL"})

    # Obtain a streamed result of the preparation
    logger.info("Will do preparation, output schema: %s" % preparation_output_schema)
    input_dataset.set_preparation_steps(script["steps"], preparation_output_schema,
                                        context_project_key=default_project_key())

    core_params = dkujson.load_from_filepath(osp.join(model_folder, "core_params.json"))
    preprocessing_params = dkujson.load_from_filepath(osp.join(model_folder, "rpreprocessing_params.json"))
    collector_data = dkujson.load_from_filepath(osp.join(model_folder, "collector_data.json"))
    resolved_params = dkujson.load_from_filepath(osp.join(model_folder, "actual_params.json"))["resolved"]

    prediction_type = core_params["prediction_type"]

    # Tagging special features to take them into account only in special_preproc_handler/special_pipeline
    per_feature = preprocessing_params["per_feature"]
    tag_special_features(per_feature)

    preproc_handler = PreprocessingHandler.build(core_params,
                                                 preprocessing_params,
                                                 model_folder)
    preproc_handler.collector_data = collector_data
    pipeline = preproc_handler.build_preprocessing_pipeline(with_target=output_y)
    target_map = preproc_handler.target_map

    logger.info("Loading model")
    model = keras_model_io_utils.load_model(osp.join(model_folder, constants.KERAS_MODEL_FILENAME))

    logger.info("Start output generator")

    (names, dtypes, parse_date_columns) = dataiku.Dataset.get_dataframe_schema_st(
        preparation_output_schema["columns"], parse_dates=True, infer_with_pandas=False)
    logger.info("Reading with INITIAL dtypes: %s" % dtypes)
    dtypes = utils.ml_dtypes_from_dss_schema(preparation_output_schema,
                                             preprocessing_params["per_feature"],
                                             prediction_type=prediction_type)
    logger.info("Reading with dtypes: %s" % dtypes)

    for i in xrange(0, len(names)):
        logger.info("Column %s = %s (dtype=%s)" % (i, names[i], dtypes.get(names[i], None)))

    for input_df in input_dataset.iter_dataframes_forced_types(
            names, dtypes, parse_date_columns, chunksize=batch_size, sampling=sampling):

        input_df.index = range(input_df.shape[0])
        input_df_orig = input_df.copy()
        logger.info("Got a dataframe chunk : %s" % str(input_df.shape))
        normalize_dataframe(input_df, preprocessing_params['per_feature'])

        for col in input_df:
            logger.info("NORMALIZED: %s -> %s" % (col, input_df[col].dtype))

        logger.info("Processing chunk")

        transformed = pipeline.process(input_df)
        features_X_orig = transformed["TRAIN"]
        transformed_X_mf = transformed["TRAIN"]

        inputs_dict = split_train_per_input(transformed_X_mf, per_feature, pipeline.generated_features_mapping)

        if prediction_type in [constants.MULTICLASS, constants.BINARY_CLASSIFICATION]:

            inv_map = {
                int(class_id): label
                for label, class_id in target_map.items()
            }
            classes = [class_label for (_, class_label) in sorted(inv_map.items())]

            if prediction_type == constants.MULTICLASS:
                probas_raw = model.predict(inputs_dict)
                preds = np.argmax(probas_raw, axis=1)

            if prediction_type == constants.BINARY_CLASSIFICATION:
                if resolved_params["keras"]["oneDimensionalOutput"]:
                    probas_one = np.squeeze(model.predict(inputs_dict), axis=1)
                    probas_raw = np.zeros((probas_one.shape[0], 2))
                    probas_raw[:, 1] = probas_one
                    probas_raw[:, 0] = 1 - probas_one
                else:
                    probas_raw = model.predict(inputs_dict)
                    probas_one = probas_raw[:, 1]

                threshold = recipe_desc["forcedClassifierThreshold"]
                preds = (probas_one > threshold).astype(np.int)

            (nb_rows, nb_present_classes) = probas_raw.shape
            logger.info("Probas raw shape %s/%s target_map=%s", nb_rows, nb_present_classes, len(target_map))

            preds_remapped = np.zeros(preds.shape, dtype="object")
            for (mapped_value, original_value) in inv_map.items():
                idx = (preds == mapped_value)
                preds_remapped[idx] = original_value
            pred_df = pd.DataFrame({"prediction": preds_remapped})
            pred_df.index = features_X_orig.index

            proba_cols = [u"proba_{}".format(safe_unicode_str(c)) for c in classes]
            # For Binary Classification: Must compute probas if conditional there are outputs that use them
            # Will be deleted afterwards (if outputProbabilities if False)
            # in binary_classif_scoring_add_percentile_and_cond_outputs
            probas_in_cond_outputs = (cond_outputs and len([co for co in cond_outputs
                                                            if co["input"] in proba_cols]) > 0)
            use_probas = recipe_desc["outputProbabilities"] or probas_in_cond_outputs
            if use_probas:
                proba_df = pd.DataFrame(probas_raw, columns=proba_cols)
                proba_df.index = features_X_orig.index
                pred_df = pd.concat([proba_df, pred_df], axis=1)

            if prediction_type == constants.BINARY_CLASSIFICATION:
                pred_df = binary_classif_scoring_add_percentile_and_cond_outputs(pred_df,
                                                                                 recipe_desc,
                                                                                 model_folder,
                                                                                 cond_outputs,
                                                                                 target_map)

        elif prediction_type == constants.REGRESSION:
            preds = model.predict(inputs_dict)
            pred_df = pd.DataFrame({"prediction": np.squeeze(preds, axis=1)})
            pred_df.index = features_X_orig.index

        logger.info("Done predicting it")
        if recipe_desc.get("filterInputColumns", False):
            clean_kept_columns = [c for c in recipe_desc["keptInputColumns"] if c not in pred_df.columns]
        else:
            clean_kept_columns = [c for c in input_df_orig.columns if c not in pred_df.columns]

        res = {
            "scored": pd.concat([input_df_orig[clean_kept_columns], pred_df], axis=1)
        }

        if output_y:
            res["pred_df"] = pred_df
            res["y"] = transformed["target"].reindex(input_df_orig.index) # for use in computing error columns
            res["y_notnull"] = transformed["target"]

        if output_input_df:
            res["input_df"] = input_df_orig

        yield res
