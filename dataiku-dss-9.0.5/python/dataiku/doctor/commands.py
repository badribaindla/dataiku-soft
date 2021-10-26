""" Commands available from the doctor main kernel server.

To add a command, simple add a method.
Method starting by a _ are not exposed.

Arguments with default values are supported.
*args ,**kargs are not supported.

If one of your json parameter is a global in python, you
can suffix your parameter by an _ (e.g. input_)
"""

import sys, inspect, logging, json
from os import path as osp
import numpy as np
from dataiku.base import remoterun
from dataiku.base.utils import safe_unicode_str

from dataiku.doctor import constants
from dataiku.doctor.diagnostics import diagnostics, default_diagnostics
from dataiku.doctor.prediction.common import save_prediction_model, prepare_multiframe
from dataiku.doctor.prediction.prediction_model_serialization import BinaryModelSerializer, RegressionModelSerializer, \
    MulticlassModelSerializer
from dataiku.doctor.preprocessing_handler import PreprocessingHandler, ClusteringPreprocessingHandler, \
    PredictionPreprocessingHandler, PredictionPreprocessingDataCollector, ClusteringPreprocessingDataCollector
from dataiku.doctor.prediction.classification_fit import classification_fit
from dataiku.doctor.prediction.regression_fit import regression_fit_single
from dataiku.doctor.prediction.classification_scoring import ClassificationModelIntrinsicScorer, MulticlassModelScorer, \
    BinaryClassificationModelScorer
from dataiku.doctor.prediction.classification_scoring import compute_assertions_for_classification_from_clf
from dataiku.doctor.clustering.clustering_scorer import ClusteringModelScorer
from dataiku.doctor.prediction.regression_scoring import RegressionModelIntrinsicScorer, RegressionModelScorer
from dataiku.doctor.prediction.regression_scoring import compute_assertions_for_regression_from_clf
from dataiku.doctor.prediction_entrypoints import prediction_train_score_save, prediction_train_model_kfold, \
    prediction_train_model_keras
from dataiku.doctor.clustering_entrypoints import clustering_train_score_save
from dataiku.doctor.utils import unix_time_millis, dku_write_mode_for_pickling
from dataiku.doctor.notebook_builder import PredictionNotebookBuilder, ClusteringNotebookBuilder
from dataiku.core import dkujson, intercom
from dataiku.doctor.deep_learning.keras_utils import tag_special_features
from dataiku.doctor.utils import dku_pickle
from dataiku.doctor.utils.listener import ModelStatusContext
from dataiku.doctor.utils.listener import ProgressListener
from dataiku.doctor.utils.listener import merge_listeners
from dataiku.doctor.utils.split import df_from_split_desc, check_sorted, load_test_set, load_train_set
from dataiku.doctor import utils
from dataiku.doctor.posttraining import partial_depency as pdp, subpopulation as subpopulation, individual_explanations

preprocessing_listener = ProgressListener()
global_modeling_sets = []

logger = logging.getLogger(__name__)


def _list_commands():
    current_module = sys.modules[__name__]
    return [
        (func_name, func)
        for (func_name, func) in current_module.__dict__.items()
        if not func_name.startswith("_") and inspect.isfunction(func) and inspect.getmodule(func) == current_module
    ]


def create_prediction_notebook(model_name, model_date, dataset_smartname,
                               script, preparation_output_schema,
                               split_stuff,
                               core_params,
                               preprocessing_params,
                               pre_train, post_train,):
    return json.dumps(PredictionNotebookBuilder(model_name, model_date, dataset_smartname,
                                                script["steps"], preparation_output_schema,
                                                split_stuff,
                                                core_params,
                                                preprocessing_params,
                                                pre_train, post_train).create_notebook())


def create_clustering_notebook(model_name, model_date, dataset_smartname,
                               script, preparation_output_schema,
                               split_stuff,
                               preprocessing_params,
                               pre_train, post_train,):
    return json.dumps(ClusteringNotebookBuilder(model_name, model_date, dataset_smartname,
                                                script["steps"], preparation_output_schema,
                                                split_stuff,
                                                preprocessing_params,
                                                pre_train, post_train).create_notebook())

def train_prediction_kfold(core_params, preprocessing_set, split_desc):

    if core_params.get("time").get("enabled", False):
        raise ValueError("Training with k-fold cross-test is not compatible with time ordering of data")

    default_diagnostics.register_prediction_callbacks(core_params)
    start = unix_time_millis()
    preprocessing_params = preprocessing_set['preprocessing_params']
    modeling_sets = preprocessing_set["modelingSets"]
    assertions_params_list = preprocessing_set.get("assertionsParams", {}).get("assertions", None)

    logger.info("PPS is %s" % preprocessing_params)
    preprocessing_listener = ProgressListener()
    preprocessing_listener.add_future_steps(constants.PRED_KFOLD_PREPROCESSING_STEPS)

    for modeling_set in modeling_sets:
        listener = preprocessing_listener.new_child(ModelStatusContext(modeling_set["run_folder"], start))
        listener.add_future_steps(constants.PRED_KFOLD_TRAIN_STEPS)
        modeling_set["listener"] = listener

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_LOADING_SRC):
        full_df = load_train_set(core_params, preprocessing_params, split_desc, "full",
                                 assertions=assertions_params_list)

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_COLLECTING):
        collector = PredictionPreprocessingDataCollector(full_df, preprocessing_params)
        collector_data = collector.build()

    pipeline, preproc_handler = build_pipeline_and_handler(collector_data, core_params, preprocessing_set['run_folder'],
                                                           preprocessing_params, assertions=assertions_params_list)

    with preprocessing_listener.push_step(constants.ProcessingStep.KFOLD_STEP_PREPROCESS_GLOBAL):
        transformed_full = pipeline.fit_and_process(full_df)
        preproc_handler.save_data()
        preproc_handler.report(pipeline)

    preprocessing_listener.save_status()
    preprocessing_end = unix_time_millis()

    train_X = transformed_full["TRAIN"]
    train_y = transformed_full["target"]

    weight_method = core_params.get("weight", {}).get("weightMethod", None)
    with_sample_weight = weight_method in {"SAMPLE_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}
    with_class_weight = weight_method in {"CLASS_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}
    calibrate_proba = core_params.get("calibration", {}).get("calibrationMethod", None) in ["SIGMOID", "ISOTONIC"]
    prediction_type = core_params["prediction_type"]
    if with_sample_weight:
        assert transformed_full["weight"].values.min() > 0, "Sample weights must be positive"

    for modeling_set in modeling_sets:
        model_start = unix_time_millis()
        listener = modeling_set["listener"]
        previous_search_time = utils.get_hyperparams_search_time_traininfo(modeling_set["run_folder"])
        assertions_metrics = None
        if core_params["prediction_type"] in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
            with listener.push_step(constants.ProcessingStep.KFOLD_STEP_FITTING_GLOBAL, previous_duration=previous_search_time):
                # no out-fold available, so calibrate through classification_fit on a random split
                if calibrate_proba:
                    calibration_method = core_params.get("calibration", {}).get("calibrationMethod").lower()
                else:
                    calibration_method = None
                (clf, actual_params, prepared_X, iipd) = classification_fit(modeling_set['modelingParams'], split_desc,
                                                                         transformed_full,
                                                                         prediction_type,
                                                                         modeling_set['run_folder'],
                                                                         target_map=preproc_handler.target_map,
                                                                         with_sample_weight=with_sample_weight,
                                                                         with_class_weight=with_class_weight,
                                                                         calibration=calibration_method)
                diagnostics.on_fitting_end(prediction_type=prediction_type, clf=clf, train_target=train_y, features=train_X.columns())
            save_prediction_model(clf, actual_params, listener, modeling_set['run_folder'])

            with listener.push_step(constants.ProcessingStep.KFOLD_STEP_SCORING_GLOBAL):
                logger.info("Running intrinsic scoring")
                ClassificationModelIntrinsicScorer(modeling_set['modelingParams'], clf, train_X, train_y, pipeline,
                                                   modeling_set['run_folder'], prepared_X, iipd, with_sample_weight,
                                                   calibrate_proba).score()
                logger.info("Running model serialization")
                if prediction_type == constants.BINARY_CLASSIFICATION:
                    BinaryModelSerializer(train_X.columns(), clf, modeling_set['modelingParams'],
                                          modeling_set['run_folder'], preproc_handler.target_map, calibrate_proba).serialize()
                else:
                    MulticlassModelSerializer(train_X.columns(), clf, modeling_set['modelingParams'],
                                              modeling_set['run_folder'], preproc_handler.target_map, calibrate_proba).serialize()
                if transformed_full.get("assertions", None):
                    assertions_metrics = compute_assertions_for_classification_from_clf(clf,
                                                                                        modeling_set["modelingParams"],
                                                                                        prediction_type,
                                                                                        preproc_handler.target_map,
                                                                                        transformed_full)

        else:
            with listener.push_step(constants.ProcessingStep.KFOLD_STEP_FITTING_GLOBAL, previous_duration=previous_search_time):
                (clf, actual_params, prepared_X, iipd) = regression_fit_single(modeling_set['modelingParams'],
                                                                            split_desc, transformed_full, modeling_set["run_folder"],
                                                                            with_sample_weight=with_sample_weight)
                diagnostics.on_fitting_end(features=train_X.columns(), clf=clf, prediction_type=prediction_type, train_target=transformed_full["target"])
            save_prediction_model(clf, actual_params, listener, modeling_set['run_folder'])

            with listener.push_step(constants.ProcessingStep.KFOLD_STEP_SCORING_GLOBAL):
                logger.info("Running intrinsic scoring")
                RegressionModelIntrinsicScorer(modeling_set['modelingParams'], clf, train_X, train_y, pipeline,
                                               modeling_set['run_folder'], prepared_X, iipd, with_sample_weight).score()

                # serialize the model if possible
                logger.info("Running model serialization")
                RegressionModelSerializer(train_X.columns(), clf, modeling_set['modelingParams'],
                                          modeling_set['run_folder']).serialize()
                if transformed_full.get("assertions", None):
                    assertions_metrics = compute_assertions_for_regression_from_clf(clf, modeling_set["modelingParams"],
                                                                                    transformed_full)

        logger.info("Loading full dataframe")
        full_df_clean = df_from_split_desc(split_desc, "full", preprocessing_params["per_feature"],
                                           prediction_type)
        optimized_params = actual_params["resolved"]

        logger.info("Regridifying post-train params: %s" % json.dumps(optimized_params))

        # Regridify to a unary grid the optimized params
        optimized_params_grid = intercom.backend_json_call("ml/prediction/regridify-to-pretrain", {
            "preTrain" : json.dumps(modeling_set["modelingParams"]),
            "postTrain" : json.dumps(optimized_params)
        })
        logger.info("Using unary grid params: %s" % json.dumps(optimized_params_grid))
        prediction_train_model_kfold(full_df_clean, core_params, split_desc, preprocessing_params, optimized_params_grid,
                                     preprocessing_set['run_folder'], modeling_set['run_folder'],
                                     listener, with_sample_weight, with_class_weight,
                                     transformed_full,
                                     calibrate_proba, assertions_metrics)

        end = unix_time_millis()
        listeners_json = preprocessing_listener.merge(listener)
        utils.write_done_traininfo(modeling_set['run_folder'], start, model_start, end,
                                   listeners_json,
                                   end_preprocessing_time=preprocessing_end)

        return "ok"


def train_prediction_models_nosave(core_params, preprocessing_set, split_desc):
    """Regular (mode 1) train:
      - Non streamed single split + fit preprocess on train + preprocess test
      - Fit N models sequentially
         - Fit
         - Save clf
         - Compute and save clf performance
         - Score, save scored test set + scored performnace
    """

    start = unix_time_millis()
    default_diagnostics.register_prediction_callbacks(core_params)
    preprocessing_params = preprocessing_set["preprocessing_params"]
    modeling_sets = preprocessing_set["modelingSets"]
    assertions_params_list = preprocessing_set.get("assertionsParams", {}).get("assertions", None)

    logger.info("PPS is %s" % preprocessing_params)
    preprocessing_listener = ProgressListener()
    # Fill all the listeners ASAP to have correct progress data
    preprocessing_listener.add_future_steps(constants.PRED_REGULAR_PREPROCESSING_STEPS)
    for modeling_set in modeling_sets:
        listener = preprocessing_listener.new_child(ModelStatusContext(modeling_set["run_folder"], start))
        if modeling_set.get('modelingParams', {}).get('gridLength', 1) != 1:
            listener.add_future_step(constants.ProcessingStep.STEP_HYPERPARAMETER_SEARCHING)
        listener.add_future_steps(constants.PRED_REGULAR_TRAIN_STEPS)
        modeling_set["listener"] = listener

    sort = core_params.get("time", {}).get("enabled", False)
    time_variable = core_params.get("time", {}).get("timeVariable")
    ascending = core_params.get("time", {}).get("ascending", True)
    if sort and time_variable is None:
        raise ValueError("Time ordering is enabled but no time variable is specified")

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_LOADING_TRAIN):
        train_df = load_train_set(core_params, preprocessing_params, split_desc, "train")
        if sort:
            logger.info(u"Checking that the train set is sorted by '{}'".format(safe_unicode_str(time_variable)))
            if not check_sorted(train_df, time_variable, ascending):
                logger.info(u"Train set not sorted, sorting by '{column}', ascending={ascending}".format(column=safe_unicode_str(time_variable), ascending=ascending))
                train_df.sort_values(by=time_variable, inplace=True, ascending=ascending)

        for col in train_df:
            logger.info("Train col : %s (%s)" % (col, train_df[col].dtype))

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_LOADING_TEST):
        test_df = load_test_set(core_params, preprocessing_params, split_desc, assertions=assertions_params_list)

    if sort:
        time_train_arr = train_df[time_variable].values
        time_test_arr = test_df[time_variable].values
        if np.issubdtype(time_train_arr.dtype, np.number):
            assert not np.any(np.isnan(time_train_arr)), u"Train set should have no empty or NaN values for time variable '{}'".format(safe_unicode_str(time_variable))
            time_test_arr = time_test_arr[~np.isnan(time_test_arr)]
        if ascending:
            max_train = time_train_arr[-1]
            min_test = np.min(time_test_arr)
            assert max_train <= min_test, "Test set should have values superior to all values of train set (max train = {max_train}, min test = {min_test})".format(max_train=max_train, min_test=min_test)
        else:
            min_train = time_train_arr[0]
            max_test = np.max(time_test_arr)
            assert max_test <= min_train, "Test set should have values inferior to all values of train set (min train = {min_train}, max test = {max_test})".format(min_train=min_train, max_test=max_test)

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_COLLECTING):
        collector = PredictionPreprocessingDataCollector(train_df, preprocessing_params)
        collector_data = collector.build()

    pipeline, preproc_handler = build_pipeline_and_handler(collector_data, core_params, preprocessing_set['run_folder'],
                                                           preprocessing_params,
                                                           assertions=assertions_params_list)

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TRAIN):
        # TODO: fit_and_process should take an update_fn argument
        transformed_train = pipeline.fit_and_process(train_df)
        preproc_handler.save_data()
        preproc_handler.report(pipeline)

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TEST):
        test_df_index = test_df.index.copy()
        transformed_test = pipeline.process(test_df)

    preprocessing_listener.save_status()
    preprocessing_end = unix_time_millis()

    for modeling_set in modeling_sets:
        model_start = unix_time_millis()

        # since ensembles are never fitted through the doctor, no need to distinguish here
        prediction_train_score_save(transformed_train,
                                    transformed_test, test_df_index,
                                    core_params, split_desc,
                                    modeling_set["modelingParams"],
                                    modeling_set["run_folder"],
                                    modeling_set["listener"],
                                    preproc_handler.target_map,
                                    pipeline,
                                    preprocessing_params)

        end = unix_time_millis()

        listeners_json = preprocessing_listener.merge(modeling_set["listener"])
        utils.write_done_traininfo(modeling_set["run_folder"], start, model_start, end,
                                   listeners_json,
                                   end_preprocessing_time=preprocessing_end)

    return "ok"


def build_pipeline_and_handler(collector_data, core_params, run_folder, preprocessing_params, assertions=None,
                               selection_state_folder=None, allow_empty_mf=False):
    if selection_state_folder is None:
        selection_state_folder = osp.abspath(osp.join(run_folder, "../../..", "selection"))
    preproc_handler = PredictionPreprocessingHandler.build(core_params,
                                                           preprocessing_params,
                                                           run_folder, assertions)
    preproc_handler.set_selection_state_folder(selection_state_folder)
    preproc_handler.collector_data = collector_data
    pipeline = preproc_handler.build_preprocessing_pipeline(with_target=True, allow_empty_mf=allow_empty_mf)
    return pipeline, preproc_handler


def train_prediction_keras(core_params, preprocessing_set, split_desc):
    start = unix_time_millis()
    # Completely disable diagnostics for Keras models (temporary)
    diagnostics.disable()

    preprocessing_params = preprocessing_set["preprocessing_params"]
    modeling_sets = preprocessing_set["modelingSets"]
    run_folder = preprocessing_set["run_folder"]

    logger.info("PPS is %s" % preprocessing_params)
    preprocessing_listener = ProgressListener()
    # Fill all the listeners ASAP to have correct progress data
    preprocessing_listener.add_future_steps(constants.PRED_KERAS_PREPROCESSING_STEPS)
    for modeling_set in modeling_sets:
        listener = preprocessing_listener.new_child(ModelStatusContext(modeling_set["run_folder"], start))
        listener.add_future_steps(constants.PRED_KERAS_TRAIN_STEPS)
        modeling_set["listener"] = listener

    # Called by the preprocessing pipeline to update the state
    # of each model and dump it to disk

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_LOADING_TRAIN):
        train_df = load_train_set(core_params, preprocessing_params, split_desc, "train")
        train_df_orig = train_df.copy()

        # Not implemented in the UI so far, so processor_fit_df will always be train_df
        preprocessor_fit_df = train_df
        need_subsampling = preprocessing_params["preprocessingFitSampleRatio"] < 1
        if need_subsampling:
            preprocessor_fit_df = preprocessor_fit_df.sample(frac=preprocessing_params["preprocessingFitSampleRatio"],
                                                             random_state=preprocessing_params["preprocessingFitSampleSeed"])

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_LOADING_TEST):
        test_df = load_test_set(core_params, preprocessing_params, split_desc)

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_COLLECTING):
        collector = PredictionPreprocessingDataCollector(preprocessor_fit_df, preprocessing_params)
        collector_data = collector.build()

    # Tagging special features to take them into account only in special_preproc_handler/special_pipeline
    per_feature = preprocessing_params["per_feature"]
    tag_special_features(per_feature)

    pipeline, preproc_handler = build_pipeline_and_handler(collector_data, core_params, run_folder,
                                                           preprocessing_params, allow_empty_mf=True)

    with preprocessing_listener.push_step(constants.ProcessingStep.KERAS_STEP_FIT_NORMAL_PREPROCESSING):
        # Retrieving transformed values to get the shape of all regular inputs, even if won't be
        # actually used, as each batch of data will be processed again
        transformed_normal = pipeline.fit_and_process(preprocessor_fit_df)
        preproc_handler.save_data()
        preproc_handler.report(pipeline)

    # TODO: REVIEW STATES OF TRAINING
    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TRAIN):
        pass

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TEST):
        pass

    preprocessing_listener.save_status()
    preprocessing_end = unix_time_millis()

    for modeling_set in modeling_sets:
        model_start = unix_time_millis()

        # Settings env variable that may be accessed in user defined code
        remoterun.set_dku_env_var_and_sys_env_var(constants.DKU_CURRENT_ANALYSIS_ID, modeling_set["fullId"]["taskLoc"]["analysisId"])
        remoterun.set_dku_env_var_and_sys_env_var(constants.DKU_CURRENT_MLTASK_ID, modeling_set["fullId"]["taskLoc"]["mlTaskId"])

        prediction_train_model_keras(transformed_normal, train_df_orig, test_df, pipeline, modeling_set["modelingParams"],
                                     core_params, per_feature, modeling_set["run_folder"], modeling_set["listener"],
                                     preproc_handler.target_map,
                                     pipeline.generated_features_mapping)

        end = unix_time_millis()
        listeners_json = preprocessing_listener.merge(modeling_set["listener"])
        utils.write_done_traininfo(modeling_set["run_folder"], start, model_start, end,
                                   listeners_json,
                                   end_preprocessing_time=preprocessing_end)

    return "ok"


def train_clustering_models_nosave(
        core_params,
        split_desc,
        preprocessing_set):
    """Regular (mode 1) train:
      - Non streamed single split + fit preprocess on train + preprocess test
      - Fit N models sequentially
         - Fit
         - Save clf
         - Compute and save clf performance
         - Score, save scored test set + scored performnace
    """

    start = unix_time_millis()
    default_diagnostics.register_clustering_callbacks(core_params)

    modeling_sets = preprocessing_set["modelingSets"]
    preprocessing_listener = ProgressListener()

    # Fill all the listeners ASAP to have correct progress data
    preprocessing_listener.add_future_steps(constants.CLUSTERING_REGULAR_PREPROCESSING_STEPS)
    for modeling_set in modeling_sets:
        listener = preprocessing_listener.new_child(ModelStatusContext(modeling_set["run_folder"], start))
        listener.add_future_steps(constants.ALL_CLUSTERING_TRAIN_STEPS)
        modeling_set["listener"] = listener

    logger.info("START TRAIN :" + preprocessing_set["description"])
    preprocessing_params = preprocessing_set["preprocessing_params"]

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_LOADING_SRC):
        source_df = df_from_split_desc(split_desc, "full", preprocessing_params["per_feature"])
        diagnostics.on_load_train_dataset_end(df=source_df)
        logger.info("Loaded source df: shape=(%d,%d)" % source_df.shape)

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_COLLECTING):
        collector = ClusteringPreprocessingDataCollector(source_df, preprocessing_params)
        collector_data = collector.build()

    preproc_handler = ClusteringPreprocessingHandler({},
                                                     preprocessing_set["preprocessing_params"],
                                                     preprocessing_set["run_folder"])

    preproc_handler.collector_data = collector_data
    pipeline = preproc_handler.build_preprocessing_pipeline()

    with preprocessing_listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_SRC):
        source_df_index = source_df.index.copy()
        # TODO: fit_and_process should take an update_fn argument
        transformed_source = pipeline.fit_and_process(source_df)
        # Saves fitted resources and collector data
        preproc_handler.save_data()
        # Report on work
        report = {}
        pipeline.report_fit(report, {})
        utils.write_preproc_file(preprocessing_set["run_folder"], "preprocessing_report.json", report)

    preprocessing_listener.save_status()

    preprocessing_end = unix_time_millis()

    for modeling_set in modeling_sets:
        model_start = unix_time_millis()
        modeling_set["listener"].context = ModelStatusContext(modeling_set["run_folder"], start)

        clustering_train_score_save(transformed_source, source_df_index,
                                    preprocessing_set["preprocessing_params"],
                                    modeling_set["modelingParams"],
                                    modeling_set["run_folder"],
                                    modeling_set["listener"],
                                    pipeline)

        end = unix_time_millis()

        # Write the final model training info
        status = {
            "modelId": modeling_set["modelId"],
            "state": "DONE",
            "startTime": start,
            "endTime": end,
            "preprocessingTime": preprocessing_end - start,
            "trainingTime": end - model_start,
            "progress": merge_listeners(preprocessing_listener, modeling_set["listener"])
        }
        utils.write_model_status(modeling_set, status)

    return "ok"


def clustering_rescore(
        split_desc,
        preprocessing_folder,
        model_folder):

    preprocessing_params = dkujson.load_from_filepath(osp.join(preprocessing_folder, "rpreprocessing_params.json"))
    modeling_params = dkujson.load_from_filepath(osp.join(model_folder,"rmodeling_params.json"))
    user_meta = dkujson.load_from_filepath(osp.join(model_folder, "user_meta.json"))

    split_desc = dkujson.loads(split_desc)
    source_df = df_from_split_desc(split_desc, "full", preprocessing_params["per_feature"])
    logger.info("Loaded source df: shape=(%d,%d)" % source_df.shape)

    collector_data = dkujson.load_from_filepath(osp.join(preprocessing_folder, "collector_data.json"))

    preproc_handler = ClusteringPreprocessingHandler({}, preprocessing_params, "")  # we're not saving the data
    preproc_handler.collector_data = collector_data
    pipeline = preproc_handler.build_preprocessing_pipeline()

    source_df_index = source_df.index.copy()
    transformed_source = pipeline.fit_and_process(source_df)

    logger.info("Loading the clustering model")

    with open(osp.join(model_folder, "clusterer.pkl"), "rb") as f:
        clf = dku_pickle.load(f)

    try:
        logger.info("Post-processing the model")
        clf.post_process(user_meta)
    except AttributeError:
        pass

    train_np, is_sparse = prepare_multiframe(transformed_source["TRAIN"], modeling_params)
    cluster_labels = clf.predict(train_np)

    logger.info("Rescoring the clustering model")
    ClusteringModelScorer(clf, transformed_source, source_df_index, cluster_labels, preprocessing_params, modeling_params,
                          pipeline, model_folder).score()

    return "ok"


def create_ensemble(split_desc, core_params, model_folder, preprocessing_folder, model_folders, preprocessing_folders):
    start = unix_time_millis()

    listener = ProgressListener(context=ModelStatusContext(model_folder, start))
    listener.add_future_steps(constants.ENSEMBLE_STEPS)

    split_desc = dkujson.loads(split_desc)
    core_params = dkujson.loads(core_params)
    # Completely disable diagnostics for ensemble models, as user already diagnostics from previous training
    diagnostics.disable()

    weight_method = core_params.get("weight", {}).get("weightMethod", None)
    with_sample_weight = weight_method in {"SAMPLE_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}
    # TODO: update downstream
    with_class_weight = weight_method in {"CLASS_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}
    preprocessing_folders = dkujson.loads(preprocessing_folders)
    model_folders = dkujson.loads(model_folders)
    modeling_params = dkujson.load_from_filepath(osp.join(model_folder, "rmodeling_params.json"))
    ensemble_params = modeling_params["ensemble_params"]
    logger.info("creating ensemble")
    with listener.push_step(constants.ProcessingStep.STEP_ENSEMBLING):
        from dataiku.doctor.prediction.ensembles import ensemble_from_fitted
        train = df_from_split_desc(split_desc, "train", ensemble_params["preprocessing_params"][0]["per_feature"],
                                   core_params["prediction_type"])
        iperf = {
            "modelInputNRows" : train.shape[0], #todo : not the right count as may have dropped ...
            "modelInputNCols" : -1, # makes no sense for an ensemble as may have different preprocessings
            "modelInputIsSparse" : False
        }
        dkujson.dump_to_filepath(osp.join(model_folder, "iperf.json"), iperf)
        clf = ensemble_from_fitted(core_params, ensemble_params, preprocessing_folders, model_folders, train, with_sample_weight, with_class_weight)

    logger.info("saving model")
    with listener.push_step(constants.ProcessingStep.STEP_SAVING):
        with open(osp.join(model_folder, "clf.pkl"), dku_write_mode_for_pickling()) as f:
            dku_pickle.dump(clf, f)

    logger.info("scoring model")
    with listener.push_step(constants.ProcessingStep.STEP_SCORING):
        test = df_from_split_desc(split_desc, "test", ensemble_params["preprocessing_params"][0]["per_feature"],
                                  core_params["prediction_type"])
        # this is annoying, but we have to use one of the previous preprocessings in order to get the target
        prep_folder = preprocessing_folders[0]
        rppp = dkujson.load_from_filepath(osp.join(prep_folder, "rpreprocessing_params.json"))
        collector_data = dkujson.load_from_filepath(osp.join(prep_folder, "collector_data.json"))
        preprocessing_handler = PreprocessingHandler.build(core_params, rppp, prep_folder)
        preprocessing_handler.collector_data = collector_data
        pipe = preprocessing_handler.build_preprocessing_pipeline(with_target=True)
        transformed_test = pipe.process(test)

        y = transformed_test["target"]

        if with_sample_weight:
            sample_weight = transformed_test["weight"]
        else:
            sample_weight = None

        # Now that the CLF with scorable pipelines has been saved, set it in "pipelines with target" mode
        # to be able to compute metrics
        clf.set_with_target_pipelines_mode(True)

        pred = clf.predict(test)
        probas = None if core_params["prediction_type"] == "REGRESSION" else clf.predict_proba(test)
        target_map = None if core_params["prediction_type"] == "REGRESSION" else \
            {t["sourceValue"]: t["mappedValue"] for t in ensemble_params["preprocessing_params"][0]["target_remapping"]}
        prediction_type = core_params["prediction_type"]
        if prediction_type == constants.REGRESSION:
            scorer = RegressionModelScorer(modeling_params, clf, pred, y, model_folder, transformed_test, test.index.copy(), sample_weight)
        elif prediction_type == constants.BINARY_CLASSIFICATION:
            scorer = BinaryClassificationModelScorer(modeling_params, clf, model_folder, pred, probas, y, target_map, transformed_test, test.index.copy(), sample_weight)
        else:
            scorer = MulticlassModelScorer(modeling_params, clf, model_folder, pred, probas, y.astype(int), target_map, transformed_test, test.index.copy(), sample_weight)
        scorer.score()

    listener.save_status()
    end = unix_time_millis()
    dkujson.dump_to_filepath(osp.join(model_folder, "actual_params.json"), {"resolved": modeling_params})
    dkujson.dump_to_filepath(osp.join(preprocessing_folder, "preprocessing_report.json"), {})
    utils.write_done_traininfo(model_folder, start, end, end, listener.to_jsonifiable(), end_preprocessing_time=start)

    return "ok"


def compute_pdp(job_id, split_desc, core_params, preprocessing_folder, model_folder, modellike_folder=None,
                computation_parameters=None, postcompute_folder=None):
    pdp.compute(job_id, split_desc, core_params, preprocessing_folder, model_folder, modellike_folder,
                computation_parameters)
    return "ok"


def compute_subpopulation(job_id, split_desc, core_params, preprocessing_folder, model_folder, modellike_folder=None, computation_parameters=None, postcompute_folder=None):
    return subpopulation.compute(job_id, split_desc, core_params, preprocessing_folder, model_folder,
                                 computation_parameters, postcompute_folder)


def compute_modelless_subpopulation(job_id, model_evaluation, features, modelevaluation_folder,
                                    resolved_preprocessing_params, iperf, computation_parameters=None):
    return subpopulation.compute_modelless(job_id, model_evaluation, features, modelevaluation_folder,
                                           iperf, resolved_preprocessing_params, computation_parameters)


def compute_individual_explanations(job_id, split_desc, core_params, preprocessing_folder, model_folder,
                                    modellike_folder=None, computation_parameters=None, postcompute_folder=None):
    individual_explanations.compute(job_id, split_desc, core_params, preprocessing_folder, model_folder,
                                    computation_parameters, postcompute_folder)
    return "ok"


def ping():
    return "pong"
