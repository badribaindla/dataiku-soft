# encoding: utf-8
"""
Execute a prediction training recipe in PyRegular mode
Must be called in a Flow environment
"""


import sys, json, os.path as osp, logging
from sklearn.calibration import CalibratedClassifierCV

from dataiku.doctor.commands import build_pipeline_and_handler
from dataiku.doctor.diagnostics import diagnostics, default_diagnostics
from dataiku.doctor.prediction.prediction_model_serialization import *
from dataiku.doctor.utils import unix_time_millis
from dataiku.doctor.utils.listener import ProgressListener
from dataiku.doctor.prediction_entrypoints import *
from dataiku.core import dkujson, intercom
from dataiku.doctor.deep_learning.keras_utils import tag_special_features
from dataiku.doctor.utils.listener import ModelStatusContext
from ..utils.split import df_from_split_desc, check_sorted, load_test_set, load_train_set
from ..preprocessing_handler import *
import dataiku.doctor.utils as utils
from dataiku.base.remoterun import read_dku_env_and_set

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


def main(exec_folder, selection_state_folder, operation_mode):
    """The whole execution of the saved model train takes place in a single folder ?"""
    start = unix_time_millis()
    start_train = start

    listener = ProgressListener(context=ModelStatusContext(exec_folder, start))

    split_desc = json.load(open(osp.join(exec_folder, "_esplit.json")))
    core_params = json.load(open(osp.join(exec_folder, "core_params.json")))

    preprocessing_params = json.load(open(osp.join(exec_folder, "rpreprocessing_params.json")))
    weight_method = core_params.get("weight", {}).get("weightMethod", None)
    with_sample_weight = weight_method in {"SAMPLE_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}
    with_class_weight = weight_method in {"CLASS_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}
    modeling_params = json.load(open(osp.join(exec_folder, "rmodeling_params.json")))
    sort = core_params.get("time", {}).get("enabled", False)
    time_variable = core_params.get("time", {}).get("timeVariable")
    if sort and time_variable is None:
        raise ValueError("Time ordering is enabled but no time variable is specified")
    ascending = core_params.get("time", {}).get("ascending")

    calibration_method = core_params.get("calibration", {}).get("calibrationMethod")
    calibrate_proba = calibration_method in ["SIGMOID", "ISOTONIC"]

    # For KERAS backend, need to tag special features, because they are only processed with process function,
    # not fit_and_process
    if modeling_params["algorithm"] == "KERAS_CODE":
        tag_special_features(preprocessing_params['per_feature'])

    # Only compute assertions if not Keras or Ensemble
    assertions_params_file = osp.join(exec_folder, "_eassertions.json")
    assertions_list = None
    if osp.exists(assertions_params_file) and modeling_params["algorithm"] not in {"KERAS_CODE", "PYTHON_ENSEMBLE" }:
        assertions_list = dkujson.load_from_filepath(assertions_params_file).get("assertions", None)

    # Disable Diagnostics for Keras and ensemble models
    if modeling_params["algorithm"] in {"KERAS_CODE", "PYTHON_ENSEMBLE" }:
        diagnostics.disable()
    else:
        default_diagnostics.register_prediction_callbacks(core_params)


    def do_full_fit_and_save():
        """Fit on 100% and save the clf and out params"""
        with listener.push_step(constants.ProcessingStep.STEP_LOADING_TRAIN):
            full_df = load_train_set(core_params, preprocessing_params, split_desc, "full", assertions=assertions_list)

        with listener.push_step(constants.ProcessingStep.STEP_COLLECTING_PREPROCESSING_DATA):
            collector = ClusteringPreprocessingDataCollector(full_df, preprocessing_params)
            collector_data = collector.build()

            pipeline, preproc_handler = build_pipeline_and_handler(collector_data, core_params, exec_folder,
                                                                   preprocessing_params,
                                                                   selection_state_folder=selection_state_folder,
                                                                   allow_empty_mf=modeling_params[
                                                                                      "algorithm"] == "KERAS_CODE",
                                                                   assertions=assertions_list)

            # TODO
            if core_params["prediction_type"] in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
                target_map = preproc_handler.target_map
            else:
                target_map = None

        with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_FULL):
            preprocessor_fit_full_df = full_df

            # For KERAS backend, we might need to take a subsample of the input_df to prevent from memory errors
            if modeling_params["algorithm"] == "KERAS_CODE":
                need_subsampling = preprocessing_params["preprocessingFitSampleRatio"] < 1
                full_df_orig = full_df.copy()
                if need_subsampling:
                    preprocessor_fit_full_df = preprocessor_fit_full_df.sample(
                        frac=preprocessing_params["preprocessingFitSampleRatio"],
                        random_state=preprocessing_params["preprocessingFitSampleSeed"])

            transformed_full = pipeline.fit_and_process(preprocessor_fit_full_df)

            if with_sample_weight:
                assert transformed_full["weight"].values.min() > 0, "Sample weights must be positive"

            preproc_handler.save_data()
            preproc_handler.report(pipeline)

        if modeling_params["algorithm"] == "KERAS_CODE":
            listener.context = ModelStatusContext(exec_folder, start)

            empty_df = pd.DataFrame()

            return prediction_train_model_keras(transformed_full, full_df_orig, empty_df, pipeline, modeling_params,
                                                core_params, preprocessing_params["per_feature"], exec_folder, listener,
                                                preproc_handler.target_map,
                                                pipeline.generated_features_mapping)

        else:
            return fit_score_save(pipeline, target_map, transformed_full) + (transformed_full,)

    def fit_score_save(pipeline, target_map, transformed_full):
        prediction_type = core_params["prediction_type"]
        with listener.push_step(constants.ProcessingStep.STEP_FITTING):
            if prediction_type in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
                (clf, actual_params, prepared_X, iipd) = classification_fit(modeling_params, split_desc,
                                                                            transformed_full,
                                                                            prediction_type, exec_folder,
                                                                            target_map=target_map,
                                                                            with_sample_weight=with_sample_weight,
                                                                            with_class_weight=with_class_weight,
                                                                            calibration=calibration_method)
            else:
                (clf, actual_params, prepared_X, iipd) = regression_fit_single(modeling_params, split_desc, transformed_full,
                                                                            exec_folder, with_sample_weight=with_sample_weight)
            diagnostics.on_fitting_end(features=transformed_full["TRAIN"].columns(), clf=clf, prediction_type=prediction_type, train_target=transformed_full["target"])

        with listener.push_step(constants.ProcessingStep.STEP_SAVING):
            save_prediction_model(clf, actual_params, listener, exec_folder)
        with listener.push_step(constants.ProcessingStep.STEP_SCORING):
            full_assertions_metrics = None
            train_X = transformed_full["TRAIN"]
            train_y = transformed_full["target"]
            if prediction_type in {constants.BINARY_CLASSIFICATION, constants.MULTICLASS}:
                if prediction_type == constants.BINARY_CLASSIFICATION:
                    ClassificationModelIntrinsicScorer(modeling_params, clf, train_X, train_y, pipeline, exec_folder,
                                                       prepared_X, iipd, with_sample_weight, calibrate_proba).score()
                    BinaryModelSerializer(train_X.columns(), clf, modeling_params, exec_folder, target_map,
                                          calibrate_proba).serialize()
                elif prediction_type == constants.MULTICLASS:
                    ClassificationModelIntrinsicScorer(modeling_params, clf, train_X, train_y, pipeline, exec_folder,
                                                       prepared_X, iipd, with_sample_weight, calibrate_proba).score()
                    MulticlassModelSerializer(train_X.columns(), clf, modeling_params, exec_folder, target_map,
                                              calibrate_proba).serialize()

                if transformed_full.get("assertions", None):
                    full_assertions_metrics = compute_assertions_for_classification_from_clf(clf,
                                                                                             modeling_params,
                                                                                             prediction_type,
                                                                                             target_map,
                                                                                             transformed_full)
            else:
                RegressionModelIntrinsicScorer(modeling_params, clf, train_X, train_y, pipeline, exec_folder, prepared_X,
                                               iipd, with_sample_weight).score()
                RegressionModelSerializer(train_X.columns(), clf, modeling_params, exec_folder).serialize()

                if transformed_full.get("assertions", None):
                    full_assertions_metrics = compute_assertions_for_regression_from_clf(clf, modeling_params,
                                                                                         transformed_full)

        return actual_params, full_assertions_metrics

    if operation_mode == "TRAIN_SPLITTED_ONLY":

        with listener.push_step(constants.ProcessingStep.STEP_LOADING_TRAIN):
            train_df = load_train_set(core_params, preprocessing_params, split_desc, "train")

        with listener.push_step(constants.ProcessingStep.STEP_LOADING_TEST):
            test_df = load_test_set(core_params, preprocessing_params, split_desc, assertions=assertions_list)

        with listener.push_step(constants.ProcessingStep.STEP_COLLECTING_PREPROCESSING_DATA):
            collector = PredictionPreprocessingDataCollector(train_df, preprocessing_params)
            collector_data = collector.build()
            pipeline, preproc_handler = build_pipeline_and_handler(collector_data, core_params, exec_folder,
                                                                   preprocessing_params,
                                                                   selection_state_folder=selection_state_folder,
                                                                   allow_empty_mf=modeling_params[
                                                                                      "algorithm"] == "KERAS_CODE",
                                                                   assertions=assertions_list)

            # TODO
            if core_params["prediction_type"] in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
                target_map = preproc_handler.target_map
            else:
                target_map = None

        with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TRAIN):
            preprocessor_fit_df = train_df

            if sort:
                time_train_arr = train_df[time_variable].values
                time_test_arr = test_df[time_variable].values
                if np.issubdtype(time_train_arr.dtype, np.number):
                    assert not np.any(np.isnan(time_train_arr)), u"Train set should have no empty or NaN values for time variable '{}'".format(safe_unicode_str(time_variable))
                    time_test_arr = time_test_arr[~np.isnan(time_test_arr)]
                if ascending:
                    max_train = time_train_arr.max()
                    min_test = time_test_arr.min()
                    assert max_train <= min_test, "Test set should have values superior to all values of train set (max train = {max_train}, min test = {min_test})".format(max_train=max_train, min_test=min_test)
                else:
                    min_train = time_train_arr.min()
                    max_test = time_test_arr.max()
                    assert max_test <= min_train, "Test set should have values inferior to all values of train set (min train = {min_train}, max test = {max_test})".format(min_train=min_train, max_test=max_test)

                logging.info(u"Checking that the train set is sorted by '{}'".format(safe_unicode_str(time_variable)))
                if not check_sorted(train_df, time_variable, ascending):
                    logging.info(u"Train set not sorted, sorting by '{column}', ascending={ascending}".format(column=safe_unicode_str(time_variable), ascending=ascending))
                    train_df.sort_values(by=time_variable, inplace=True, ascending=ascending)

                logging.info(u"Checking that the test set is sorted by '{}'".format(safe_unicode_str(time_variable)))
                if not check_sorted(test_df, time_variable, ascending):
                    logging.info(u"Test set not sorted, sorting by '{}'".format(safe_unicode_str(time_variable)))
                    test_df.sort_values(by=time_variable, inplace=True, ascending=ascending)

            # For KERAS backend, we might need to take a subsample of the input_df to prevent from memory errors
            if modeling_params["algorithm"] == "KERAS_CODE":
                train_df_orig = train_df.copy()
                need_subsampling = preprocessing_params["preprocessingFitSampleRatio"] < 1
                if need_subsampling:
                    preprocessor_fit_df = preprocessor_fit_df.sample(
                        frac=preprocessing_params["preprocessingFitSampleRatio"],
                        random_state=preprocessing_params["preprocessingFitSampleSeed"])

            transformed_train = pipeline.fit_and_process(preprocessor_fit_df)
            if with_sample_weight:
                assert transformed_train["weight"].values.min() > 0, "Sample weights must be positive"

            preproc_handler.save_data()
            preproc_handler.report(pipeline)

        # For KERAS backend, cannot process test directly, because my have special features that may not
        # hold in memory
        if modeling_params["algorithm"] != "KERAS_CODE":
            with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TEST):
                test_df_index = test_df.index.copy()
                transformed_test = pipeline.process(test_df)
                if with_sample_weight:
                    assert transformed_test["weight"].values.min() > 0, "Sample weights must be positive"

        if modeling_params["algorithm"] == "PYTHON_ENSEMBLE":
            prediction_train_score_save_ensemble(train_df, test_df,
                                                 core_params, split_desc, modeling_params, exec_folder, listener,
                                                 target_map, pipeline, with_sample_weight)
        elif modeling_params["algorithm"] == "KERAS_CODE":
            old_context = listener.context
            listener.context = ModelStatusContext(exec_folder, start)

            prediction_train_model_keras(transformed_train, train_df_orig, test_df, pipeline, modeling_params,
                                         core_params, preprocessing_params["per_feature"], exec_folder, listener,
                                         preproc_handler.target_map,
                                         pipeline.generated_features_mapping)
            listener.context = old_context
        else:
            prediction_train_score_save(transformed_train, transformed_test, test_df_index, core_params, split_desc,
                                        modeling_params, exec_folder, listener, target_map, pipeline,
                                        preprocessing_params)

    elif operation_mode == "TRAIN_FULL_ONLY":
        # Not yet functional ...
        do_full_fit_and_save()

    elif operation_mode == "TRAIN_KFOLD":
        actual_params, assertions_metrics, transformed_full = do_full_fit_and_save()

        full_df_clean = df_from_split_desc(split_desc, "full", preprocessing_params["per_feature"], core_params["prediction_type"])

        optimized_params = actual_params["resolved"]

        logging.info("Regridifying post-train params: %s" % json.dumps(optimized_params))

        # Regridify to a unary grid the optimized params
        optimized_params_grid = intercom.backend_json_call("ml/prediction/regridify-to-pretrain", {
            "preTrain" : json.dumps(modeling_params),
            "postTrain" : json.dumps(optimized_params)
        })
        logging.info("Using unary grid params: %s" % json.dumps(optimized_params_grid))

        prediction_train_model_kfold(full_df_clean,
                                     core_params, split_desc, preprocessing_params, optimized_params_grid,
                                     exec_folder, exec_folder, listener, with_sample_weight,
                                     with_class_weight,
                                     transformed_full, calibrate_proba, assertions_metrics=assertions_metrics)

    elif operation_mode == "TRAIN_SPLITTED_AND_FULL":
        _, assertions_metrics, _ = do_full_fit_and_save()
        # Do the split and scoring but don't save data
        with listener.push_step(constants.ProcessingStep.STEP_LOADING_TRAIN):
            # no need to load assertions or compute diagnostics as they already have been computed on actual model
            # with full data
            train_df = load_train_set(core_params, preprocessing_params, split_desc, "train", use_diagnostics=False)

        with listener.push_step(constants.ProcessingStep.STEP_LOADING_TEST):
            # no need to load assertions or compute diagnostics as they already have been computed on actual model
            # with full data
            test_df = load_test_set(core_params, preprocessing_params, split_desc, use_diagnostics=False)

        with listener.push_step(constants.ProcessingStep.STEP_COLLECTING_PREPROCESSING_DATA):
            collector = PredictionPreprocessingDataCollector(train_df, preprocessing_params)
            collector_data = collector.build()

            pipeline, preproc_handler = build_pipeline_and_handler(collector_data, core_params, exec_folder,
                                                                   preprocessing_params,
                                                                   selection_state_folder=selection_state_folder,
                                                                   allow_empty_mf=modeling_params[
                                                                                      "algorithm"] == "KERAS_CODE")

            # TODO
            if core_params["prediction_type"] in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
                target_map = preproc_handler.target_map
            else:
                target_map = None

        with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TRAIN):
            preprocessor_fit_df = train_df

            # For KERAS backend, we might need to take a subsample of the input_df to prevent from memory errors
            if modeling_params["algorithm"] == "KERAS_CODE":
                need_subsampling = preprocessing_params["preprocessingFitSampleRatio"] < 1
                train_df_orig = train_df.copy()
                if need_subsampling:
                    preprocessor_fit_df = preprocessor_fit_df.sample(
                        frac=preprocessing_params["preprocessingFitSampleRatio"],
                        random_state=preprocessing_params["preprocessingFitSampleSeed"])

            transformed_train = pipeline.fit_and_process(preprocessor_fit_df)

        # For KERAS backend, cannot process test directly, because my have special features that may not
        # hold in memory
        if modeling_params["algorithm"] != "KERAS_CODE":
            with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TEST):
                test_df_index = test_df.index.copy()
                transformed_test = pipeline.process(test_df)

        if modeling_params["algorithm"] == "KERAS_CODE":
            old_context = listener.context
            listener.context = ModelStatusContext(exec_folder, start)

            prediction_train_model_keras(transformed_train, train_df_orig, test_df, pipeline, modeling_params,
                                         core_params, preprocessing_params["per_feature"], exec_folder, listener,
                                         preproc_handler.target_map,
                                         pipeline.generated_features_mapping, save_model=False)
            listener.context = old_context
        else:
            with listener.push_step(constants.ProcessingStep.STEP_FITTING):
                if core_params["prediction_type"] in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
                    (clf, actual_params, prepared_X, iipd) = classification_fit(modeling_params, split_desc, transformed_train,
                                                                             core_params["prediction_type"],
                                                                             target_map=target_map,
                                                                             with_sample_weight=with_sample_weight,
                                                                             with_class_weight=with_class_weight,
                                                                             )

                    if calibrate_proba:
                        calibrated_clf = CalibratedClassifierCV(clf, cv="prefit", method=calibration_method.lower())
                        test_X = transformed_test["TRAIN"]
                        test_X, is_sparse = prepare_multiframe(test_X, modeling_params)
                        test_y = transformed_test["target"].astype(int)
                        if with_sample_weight:
                            test_weight = transformed_test["weight"].astype(float)
                            calibrated_clf.fit(test_X, test_y, sample_weight=test_weight)
                        else:
                            calibrated_clf.fit(test_X, test_y)
                        clf = calibrated_clf
                else:
                    (clf, actual_params, prepared_X, iipd) = regression_fit_single(modeling_params, split_desc, transformed_train,
                                                                                exec_folder, with_sample_weight=with_sample_weight)

            with listener.push_step(constants.ProcessingStep.STEP_SCORING):
                train_X = transformed_train["TRAIN"]
                train_y = transformed_train["target"]
                prediction_type = core_params["prediction_type"]
                if prediction_type == constants.BINARY_CLASSIFICATION:
                    ClassificationModelIntrinsicScorer(modeling_params, clf, train_X, train_y, pipeline, exec_folder,
                                                       prepared_X, iipd, with_sample_weight, calibrate_proba).score()
                    BinaryModelSerializer(train_X.columns(), clf, modeling_params, exec_folder, target_map, calibrate_proba).serialize()
                    scorer = binary_classification_scorer_with_valid(modeling_params, clf, transformed_test, exec_folder, test_df_index, target_map=target_map, with_sample_weight=with_sample_weight)
                elif prediction_type == constants.MULTICLASS:
                    ClassificationModelIntrinsicScorer(modeling_params, clf, train_X, train_y, pipeline, exec_folder,
                                                       prepared_X, iipd, with_sample_weight, calibrate_proba).score()
                    MulticlassModelSerializer(train_X.columns(), clf, modeling_params, exec_folder, target_map, calibrate_proba).serialize()
                    scorer = multiclass_scorer_with_valid(modeling_params, clf, transformed_test, exec_folder, test_df_index, target_map=target_map, with_sample_weight=with_sample_weight)
                else:
                    RegressionModelIntrinsicScorer(modeling_params, clf, train_X, train_y, pipeline, exec_folder,
                                                   prepared_X, iipd, with_sample_weight).score()
                    RegressionModelSerializer(train_X.columns(), clf, modeling_params, exec_folder).serialize()
                    scorer = regression_scorer_with_valid(modeling_params, clf, transformed_test, exec_folder, test_df_index, with_sample_weight)
                scorer.score()
                diagnostics.on_scoring_end(scorer=scorer, prediction_type=prediction_type, transformed_test=transformed_test, transformed_train=transformed_train, with_sample_weight=with_sample_weight)

                # Adding assertions metrics afterwards in order not to mess with existing code
                if assertions_metrics is not None:
                    perf_file_path = osp.join(exec_folder, "perf.json")
                    perf = dkujson.load_from_filepath(perf_file_path)
                    if core_params["prediction_type"] == constants.BINARY_CLASSIFICATION:
                        perf["perCutData"]["assertionsMetrics"] = [metrics.to_dict() for metrics in assertions_metrics]
                    elif core_params["prediction_type"] in {constants.MULTICLASS, constants.REGRESSION}:
                        perf["metrics"]["assertionsMetrics"] = assertions_metrics.to_dict()
                    dkujson.dump_to_filepath(perf_file_path, perf)
    else:
        raise NotImplementedError("Unknown value for operation_mode: {}".format(operation_mode))
    end = unix_time_millis()

    utils.write_done_traininfo(exec_folder, start, start_train, end, listener.to_jsonifiable())

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    read_dku_env_and_set()
    main(sys.argv[1], sys.argv[2], sys.argv[3])