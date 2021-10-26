import os

from sklearn.model_selection import KFold

from dataiku.doctor.diagnostics import diagnostics
from dataiku.doctor.prediction.background_rows_handler import BackgroundRowsHandler
from dataiku.doctor.prediction.column_importance_handler import ColumnImportanceHandler
from dataiku.doctor.prediction.histogram_handler import HistogramHandler
from dataiku.doctor.prediction.prediction_model_serialization import BinaryModelSerializer, MulticlassModelSerializer, \
    RegressionModelSerializer
from dataiku.doctor.preprocessing_collector import PredictionPreprocessingDataCollector
from dataiku.doctor.preprocessing_handler import PredictionPreprocessingHandler
from dataiku.doctor.prediction import *
from dataiku.doctor.utils import dku_pickle
from dataiku.doctor.utils import dku_write_mode_for_pickling
from dataiku.doctor.utils.split import df_from_split_desc_no_normalization
from dataiku.doctor.utils.split import input_columns

logger = logging.getLogger(__name__)

# The functions in this module are used both by the recipes and by the analyses

# for non-ensembles and when kfold disabled
def prediction_train_score_save(transformed_train,
                                transformed_test,
                                test_df_index,
                                core_params,
                                split_desc,
                                modeling_params,
                                run_folder,
                                listener, target_map, pipeline, preprocessing_params):
    """
        Fit a CLF, save it, computes intrinsic scores, writes them,
        scores a test set it, write scores and extrinsinc perf
    """
    prediction_type = core_params["prediction_type"]
    train_X = transformed_train["TRAIN"]
    train_y = transformed_train["target"]

    if modeling_params.get('gridLength', 1) != 1:
        previous_search_time = utils.get_hyperparams_search_time_traininfo(run_folder)
        initial_state = constants.ProcessingStep.STEP_HYPERPARAMETER_SEARCHING
        def gridsearch_done_fn():
            step = listener.pop_step()
            utils.write_hyperparam_search_time_traininfo(run_folder, step["time"])
            listener.push_step(constants.ProcessingStep.STEP_FITTING)
            listener.save_status()
    else:
        initial_state = constants.ProcessingStep.STEP_FITTING
        previous_search_time = None
        def gridsearch_done_fn():
            pass

    weight_method = core_params.get("weight", {}).get("weightMethod", None)
    with_sample_weight = weight_method in {"SAMPLE_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}
    if with_sample_weight:
        assert transformed_train["weight"].values.min() > 0, "Sample weights must be positive"
        assert transformed_test["weight"].values.min() > 0, "Sample weights must be positive"

    if prediction_type in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
        assert(target_map != None)
        assert(len(target_map) >= 2)

        with_class_weight = weight_method in {"CLASS_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}
        calibrate_proba = core_params.get("calibration", {}).get("calibrationMethod", None) in ["SIGMOID", "ISOTONIC"]

        with listener.push_step(initial_state, previous_duration=previous_search_time):
            (clf, actual_params, prepared_X, iipd) = classification_fit(modeling_params, split_desc, transformed_train,
                                                                     prediction_type, run_folder, gridsearch_done_fn,
                                                                     target_map=target_map, with_sample_weight=with_sample_weight,
                                                                     with_class_weight=with_class_weight)

            if calibrate_proba:
                method = core_params.get("calibration", {}).get("calibrationMethod").lower()
                calibrated_clf = CalibratedClassifierCV(clf, cv="prefit", method=method)
                test_X = transformed_test["TRAIN"]
                test_X, is_sparse = prepare_multiframe(test_X, modeling_params)
                test_y = transformed_test["target"].astype(int)
                if with_sample_weight:
                    test_weight = transformed_test["weight"].astype(float)
                    calibrated_clf.fit(test_X, test_y, sample_weight=test_weight)
                else:
                    calibrated_clf.fit(test_X, test_y)
                clf = calibrated_clf
            diagnostics.on_fitting_end(features=transformed_train["TRAIN"].columns(), clf=clf, prediction_type=prediction_type, train_target=transformed_train["target"])

        with listener.push_step(constants.ProcessingStep.STEP_SAVING):
            # UGLY
            if hasattr(clf, "scorer"):
                clf.scorer = None
                if "scorer" in clf.params:
                    del clf.params["scorer"]
            with open(osp.join(run_folder, "clf.pkl"), dku_write_mode_for_pickling()) as f:
                logger.info("PICKLING %s" % clf)
                dku_pickle.dump(clf, f)
            dkujson.dump_to_filepath(osp.join(run_folder, "actual_params.json"), actual_params)

        with listener.push_step(constants.ProcessingStep.STEP_SCORING):
            ClassificationModelIntrinsicScorer(modeling_params, clf,
                                               train_X, train_y, pipeline, run_folder, prepared_X, iipd, with_sample_weight, calibrate_proba).score()
            if prediction_type == constants.BINARY_CLASSIFICATION:
                scorer = binary_classification_scorer_with_valid(modeling_params, clf,
                                                                 transformed_test, run_folder, test_df_index, target_map=target_map, with_sample_weight=with_sample_weight)
                serializer = BinaryModelSerializer(train_X.columns(), clf, modeling_params, run_folder, target_map, calibrate_proba)
            else:
                scorer = multiclass_scorer_with_valid(modeling_params, clf,
                                                      transformed_test, run_folder, test_df_index, target_map=target_map, with_sample_weight=with_sample_weight)
                serializer = MulticlassModelSerializer(train_X.columns(), clf, modeling_params, run_folder, target_map, calibrate_proba)
            scorer.score()
            serializer.serialize()
            diagnostics.on_scoring_end(scorer=scorer, prediction_type=prediction_type, transformed_test=transformed_test, transformed_train=transformed_train, with_sample_weight=with_sample_weight)

    elif prediction_type == constants.REGRESSION:
        with listener.push_step(initial_state, previous_duration=previous_search_time):
            (clf, actual_params, prepared_X, iipd) = regression_fit_single(modeling_params, split_desc, transformed_train,
                                                                        run_folder, gridsearch_done_fn, with_sample_weight)
            diagnostics.on_fitting_end(features=transformed_train["TRAIN"].columns(), clf=clf, prediction_type=prediction_type, train_target=transformed_train["target"])

        with listener.push_step(constants.ProcessingStep.STEP_SAVING):
            # UGLY
            if hasattr(clf, "scorer"):
                clf.scorer = None
                if "scorer" in clf.params:
                    del clf.params["scorer"]
            with open(osp.join(run_folder, "clf.pkl"), dku_write_mode_for_pickling()) as f:
                dku_pickle.dump(clf, f)
            dkujson.dump_to_filepath(osp.join(run_folder, "actual_params.json"), actual_params)

        with listener.push_step(constants.ProcessingStep.STEP_SCORING):
            RegressionModelIntrinsicScorer(modeling_params, clf, train_X, train_y, pipeline, run_folder, prepared_X, iipd, with_sample_weight).score()
            scorer = regression_scorer_with_valid(modeling_params, clf, transformed_test, run_folder, test_df_index, with_sample_weight)
            scorer.score()
            serializer = RegressionModelSerializer(train_X.columns(), clf, modeling_params, run_folder)
            serializer.serialize()
            diagnostics.on_scoring_end(scorer=scorer, prediction_type=prediction_type, transformed_test=transformed_test, transformed_train=transformed_train, with_sample_weight=with_sample_weight)

    else:
        raise ValueError("Prediction type %s is not valid" % prediction_type)

    if modeling_params.get("skipExpensiveReports"):
        logger.info("Skipping background rows drawing and column importance computation")
    elif prediction_type != "REGRESSION" and not scorer.use_probas:
        logger.info("Cannot draw background rows and compute column importance: model is not probabilistic")
    else:
        preliminary_compute_for_explanations(run_folder, scorer, preprocessing_params, prediction_type, split_desc,
                                             "test", transformed_test, with_sample_weight)


def prediction_train_score_save_ensemble(train,
                                         test,
                                         core_params,
                                         split_desc,
                                         modeling_params,
                                         run_folder,
                                         listener, target_map, pipeline, with_sample_weight):
    """
        Fit a CLF, save it, computes intrinsic scores, writes them,
        scores a test set it, write scores and extrinsinc perf
    """
    prediction_type = core_params["prediction_type"]
    transformed_train = pipeline.process(train)
    train_y = transformed_train["target"]
    if with_sample_weight:
        sample_weight = transformed_train["weight"]
    else:
        sample_weight = None

    if prediction_type in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
        assert target_map is not None
        assert len(target_map) >= 2
        with listener.push_step(constants.ProcessingStep.STEP_FITTING):
            (clf, actual_params, prepared_X, iipd) = classification_fit_ensemble(modeling_params, core_params, split_desc,
                                                                              train, train_y, sample_weight)

        with listener.push_step(constants.ProcessingStep.STEP_SCORING):
            # Set the CLF in "pipelines with target" mode to be able to compute metrics
            clf.set_with_target_pipelines_mode(True)

            preds = clf.predict(test)
            probas = clf.predict_proba(test)

            transformed_test = pipeline.process(test)
            test_y = transformed_test["target"]
            if with_sample_weight:
                valid_sample_weight = transformed_test["weight"]
            else:
                valid_sample_weight = None
            if prediction_type == constants.BINARY_CLASSIFICATION:
                scorer = BinaryClassificationModelScorer(modeling_params, clf, run_folder, preds, probas, test_y, target_map, transformed_test, test.index.copy(), valid_sample_weight)
            else:
                scorer = MulticlassModelScorer(modeling_params, clf, run_folder, preds, probas, test_y.astype(int), target_map, transformed_test, test.index.copy(), valid_sample_weight)
            scorer.score()


    elif prediction_type == constants.REGRESSION:
        with listener.push_step(constants.ProcessingStep.STEP_FITTING):
            (clf, actual_params, prepared_X, iipd) = regression_fit_ensemble(modeling_params, core_params, split_desc,
                                                                          train, train_y, sample_weight)

        with listener.push_step(constants.ProcessingStep.STEP_SCORING):
            # Set the CLF in "pipelines with target" mode to be able to compute metrics
            clf.set_with_target_pipelines_mode(True)

            p = clf.predict(test)
            transformed_test = pipeline.process(test)
            test_y = transformed_test["target"]
            if with_sample_weight:
                valid_sample_weight = transformed_test["weight"]
            else:
                valid_sample_weight = None
            RegressionModelScorer(modeling_params, clf, p, test_y, run_folder, transformed_test, test.index.copy(), valid_sample_weight).score()
            dkujson.dump_to_filepath(osp.join(run_folder, "actual_params.json"), actual_params)
    else:
        raise ValueError("Prediction type %s is not valid" % prediction_type)

    # Don't forget to put the CLF back in "scoring pipelines" mode for saving it
    clf.set_with_target_pipelines_mode(False)

    with listener.push_step(constants.ProcessingStep.STEP_SAVING):
        with open(osp.join(run_folder, "clf.pkl"), dku_write_mode_for_pickling()) as f:
            dku_pickle.dump(clf, f)
        iperf = {
            "modelInputNRows" : train.shape[0], #todo : not the right count as may have dropped ...
            "modelInputNCols" : -1, # makes no sense for an ensemble as may have different preprocessings
            "modelInputIsSparse" : False
        }
        dkujson.dump_to_filepath(osp.join(run_folder, "actual_params.json"), {"resolved": modeling_params}) #todo: think we need to actually resolve
        dkujson.dump_to_filepath(osp.join(run_folder, "iperf.json"), iperf)

# Do the second part of KFold: params are already resolved
def prediction_train_model_kfold(full_df_clean,
                                 core_params, split_desc, preprocessing_params, optimized_params,
                                 pp_folder, m_folder, listener, with_sample_weight,
                                 with_class_weight, transformed_full, calibrate_proba=False, assertions_metrics=None):

    split_params = split_desc["params"]
    if split_params is not None and split_params["ssdSeed"] is not None:
        seed = int(split_params["ssdSeed"])
    else:
        seed = 1337
    kf = KFold(n_splits=split_params["nFolds"], shuffle=True, random_state=seed)
    fold_id = -1
    folds = []
    prediction_type = core_params["prediction_type"]
    with listener.push_step(constants.ProcessingStep.KFOLD_STEP_PROCESSING_FOLD):
        for train_idx, test_idx in kf.split(full_df_clean):
            fold_id = fold_id +1
            with listener.push_step("[%s/%s]" % (fold_id+1, split_params["nFolds"])):
                logger.info("Processing a fold")

                fold_ppfolder = osp.join(pp_folder, "fold_%s" % fold_id)
                fold_mfolder = osp.join(m_folder, "fold_%s" % fold_id)
                # DO NOT CREATE IT. It should not be required.
                #os.makedirs(fold_ppfolder)
                if not os.path.exists(fold_mfolder):
                    os.makedirs(fold_mfolder)

                train_df, test_df = full_df_clean.loc[train_idx].reset_index().copy(), full_df_clean.loc[test_idx].reset_index().copy()

                # We rebuild the collector and preprocessing handler for each fold
                with listener.push_step(constants.ProcessingStep.STEP_COLLECTING):
                    collector = PredictionPreprocessingDataCollector(train_df, preprocessing_params)
                    collector_data = collector.build()

                preproc_handler = PredictionPreprocessingHandler.build(core_params, preprocessing_params, fold_ppfolder)
                preproc_handler.set_selection_state_folder(osp.abspath(osp.join(pp_folder, "../../..", "selection")))
                preproc_handler.collector_data = collector_data

                pipeline = preproc_handler.build_preprocessing_pipeline(with_target=True)

                with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TRAIN):
                    transformed_train = pipeline.fit_and_process(train_df)

                with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_TEST):
                    test_df_index = test_df.index.copy()
                    transformed_test = pipeline.process(test_df)
                    logger.info("Transformed valid: %s" % transformed_test["TRAIN"].stats())

                if prediction_type in (constants.BINARY_CLASSIFICATION, constants.MULTICLASS):
                    target_map = preproc_handler.target_map
                    with listener.push_step(constants.ProcessingStep.STEP_FITTING):
                        (clf, actual_params, prepared_X, iipd) = classification_fit(optimized_params, split_desc,
                                                                                 transformed_train,
                                                                                 prediction_type,
                                                                                 target_map=target_map,
                                                                                 with_sample_weight=with_sample_weight,
                                                                                 with_class_weight=with_class_weight)
                        # calibrate on the out-fold
                        if calibrate_proba:
                            method = core_params.get("calibration", {}).get("calibrationMethod").lower()
                            calibrated_clf = CalibratedClassifierCV(clf, cv="prefit", method=method)
                            test_X = transformed_test["TRAIN"]
                            test_X, is_sparse = prepare_multiframe(test_X, optimized_params)
                            test_y = transformed_test["target"].astype(int)
                            if with_sample_weight:
                                test_weight = transformed_test["weight"]
                            else:
                                test_weight = None
                            calibrated_clf.fit(test_X, test_y, sample_weight=test_weight)
                            clf = calibrated_clf

                    if prediction_type == constants.BINARY_CLASSIFICATION:
                        scorer = binary_classification_scorer_with_valid(optimized_params, clf,
                                                                         transformed_test, fold_mfolder, test_df_index, target_map=target_map, with_sample_weight=with_sample_weight)
                    else:
                        scorer = multiclass_scorer_with_valid(optimized_params, clf,
                                                              transformed_test, fold_mfolder, test_df_index, target_map=target_map, with_sample_weight=with_sample_weight)
                else:
                    with listener.push_step(constants.ProcessingStep.STEP_FITTING):
                        (clf, actual_params, prepared_X, iipd) = regression_fit_single(optimized_params, split_desc, transformed_train,
                                                                                    m_folder, with_sample_weight=with_sample_weight)
                    scorer = regression_scorer_with_valid(optimized_params, clf, transformed_test, fold_mfolder, test_df_index,
                                                          with_sample_weight)

                scorer.dump_predicted = False
                scorer.score(with_assertions=False)
                folds.append({
                    "test_idx": test_idx,
                    "scorer": scorer,
                    "transformed_train": transformed_train,
                    "transformed_test": transformed_test,
                })
        diagnostics_folds = []
        for fold in folds:
            d = {}
            for k in ("scorer", "transformed_train", "transformed_test"):
                d[k] = fold[k]
            diagnostics_folds.append(d)

        logger.info("Folds done")
        arr = []
        for fold in folds:
            predicted_df = fold["scorer"].predicted_df
            predicted_df.index = fold["test_idx"]
            arr.append(predicted_df)

        global_predicted_df = pd.concat(arr, axis=0).sort_index()
        global_predicted_df.to_csv(m_folder +"/predicted.csv", sep="\t", header=True, index=False, encoding='utf-8')

        scorers = [f["scorer"] for f in folds]
        if prediction_type == constants.BINARY_CLASSIFICATION:
            scorer = CVBinaryClassificationModelScorer(scorers)
        elif prediction_type == constants.MULTICLASS:
            scorer = CVMulticlassModelScorer(scorers)
        elif prediction_type == constants.REGRESSION:
            scorer = CVRegressionModelScorer(scorers)
        gperf = scorer.score()

        if assertions_metrics is not None:
            if core_params["prediction_type"] == constants.BINARY_CLASSIFICATION:
                gperf["perCutData"]["assertionsMetrics"] = [assertion_metrics.to_dict() for assertion_metrics in assertions_metrics]
            elif core_params["prediction_type"] in {constants.MULTICLASS, constants.REGRESSION}:
                gperf["metrics"]["assertionsMetrics"] = assertions_metrics.to_dict()
        diagnostics.on_processing_all_kfold_end(prediction_type=prediction_type, folds=diagnostics_folds, with_sample_weight=with_sample_weight, perf_data=gperf)
        logger.info("gperf %s" % gperf)
        dkujson.dump_to_filepath(osp.join(m_folder, "perf.json"), gperf)

    if optimized_params.get("skipExpensiveReports"):
        logger.info("Skipping background rows drawing and column importance computation")
    elif prediction_type != "REGRESSION" and not scorer.use_probas:
        logger.info("Cannot draw background rows and compute column importance: model is not probabilistic")
    else:
        with open(osp.join(m_folder, "clf.pkl"), "rb") as clf_file:
            clf = dku_pickle.load(clf_file)
        # Create a PredictionModelScorer but will not use it to score a testset. It's used to get the score to explain
        if prediction_type == constants.REGRESSION:
            scorer_to_explain = regression_scorer_with_valid(optimized_params, clf, transformed_full, None, None,
                                                             with_sample_weight)
        else:
            target_map = {tv["sourceValue"]: tv["mappedValue"] for tv in preprocessing_params["target_remapping"]}
            if prediction_type == constants.BINARY_CLASSIFICATION:
                scorer_to_explain = binary_classification_scorer_with_valid(optimized_params, clf, transformed_full, None, None,
                                                                            target_map,
                                                                            with_sample_weight)
            else:
                scorer_to_explain = multiclass_scorer_with_valid(optimized_params, clf, transformed_full, None, None,
                                                                 target_map,
                                                                 with_sample_weight)
        preliminary_compute_for_explanations(m_folder, scorer_to_explain, preprocessing_params, prediction_type,
                                             split_desc, "full", transformed_full, with_sample_weight)


def preliminary_compute_for_explanations(m_folder, scorer, preprocessing_params, prediction_type, split_desc, split,
                                         transformed, with_sample_weight):
    """ Draw background rows and save them, useful when scoring with explanations """
    dataset_name = "Dataset" if split == "full" else "Test set"
    not_dropped_index = transformed["UNPROCESSED"].index
    score_to_explain_df = pd.DataFrame(scorer.get_score_to_explain(), index=not_dropped_index)
    if transformed["UNPROCESSED"].shape[0] < BackgroundRowsHandler.MIN_BACKGROUND_SIZE:
        logger.info("{} too small to draw background rows".format(dataset_name))
    else:
        full_df_no_normalization = df_from_split_desc_no_normalization(split_desc, split,
                                                                       preprocessing_params["per_feature"],
                                                                       prediction_type)
        BackgroundRowsHandler(m_folder, split_desc, prediction_type,
                              preprocessing_params["per_feature"]) \
            .draw_and_save_background_rows(full_df_no_normalization.loc[not_dropped_index], score_to_explain_df)

        try:
            histogram_handler = HistogramHandler(m_folder)
            normalized_df = utils.normalize_dataframe(full_df_no_normalization, preprocessing_params["per_feature"])
            sample_weights = transformed["weight"] if with_sample_weight else None
            histogram_handler.compute_and_save(normalized_df.loc[not_dropped_index],
                                               preprocessing_params["per_feature"],
                                               sample_weights)
        except:
            logger.exception("Could not compute distribution histograms over {}".format(dataset_name))
    input_cols = input_columns(preprocessing_params["per_feature"])
    ColumnImportanceHandler(m_folder).compute_and_save(input_cols,
                                                       transformed["TRAIN"].columns(),
                                                       transformed["TRAIN"],
                                                       score_to_explain_df.values)


def prediction_train_model_keras(transformed_normal, train_df, test_df, pipeline, modeling_params, core_params,
                                 per_feature, run_folder, listener, target_map, generated_features_mapping,
                                 save_model=True):
    """
        Fit a CLF on Keras, save it, computes intrinsic scores, writes them,
        scores a test set it, write scores and extrinsinc perf
    """
    from dataiku.doctor.deep_learning.keras_support import get_keras_model, build_scored_validation_data

    prediction_type = core_params["prediction_type"]

    # Building necessary vars to be used in model
    # For the "normal" features, the preprocessing was performed on a subsample (that can be 100%) of the data, so
    # we can retrieve the shape of each normal input, but the data will be processed again on each batch, in order
    # to also preprocess special features
    train_normal_X = transformed_normal["TRAIN"]
    train_normal_y = transformed_normal["target"]

    # Execute user-written code
    with listener.push_step(constants.ProcessingStep.STEP_FITTING):

        model, validation_sequence = get_keras_model(train_normal_X, train_df, pipeline, test_df, per_feature,
                                                     modeling_params, run_folder, prediction_type, target_map,
                                                     generated_features_mapping)
        prepared_X, is_sparse = prepare_multiframe(train_normal_X,modeling_params) \
            if train_normal_X.blocks else (np.empty((0,0)), False)

        iipd = get_initial_intrinsic_perf_data(prepared_X, is_sparse)

        iipd['modelInputNSpecialFeatures'] = len([f for f in per_feature.items() if f[1]['isSpecialFeature']])
        diagnostics.on_fitting_end(features=train_normal_X.columns(), clf=model, prediction_type=prediction_type, train_target=train_normal_y)

    with listener.push_step(constants.ProcessingStep.STEP_SAVING):
        # No need to save model here, already done in callbacks
        dkujson.dump_to_filepath(osp.join(run_folder, "actual_params.json"), {"resolved": modeling_params})

    if len(test_df) > 0:
        with listener.push_step(constants.ProcessingStep.STEP_SCORING):
            preds, probas, valid_y = build_scored_validation_data(model, prediction_type, modeling_params,
                                                                  validation_sequence)
            # Then using PY_MEMORY scorers to compute the score, depending on prediction_type
            # Not providing:
            #  - sample_weights because not supported
            #  - valid because not displaying predicted data in the model
            if prediction_type == constants.REGRESSION:
                RegressionModelIntrinsicScorer(modeling_params, model, train_normal_X, train_normal_y, pipeline,
                                               run_folder,
                                               prepared_X,
                                               iipd, False).score()
                scorer = RegressionModelScorer(modeling_params, None, preds, valid_y, run_folder, valid=None,
                                               input_df_index=None, sample_weight=None)
            elif prediction_type == constants.BINARY_CLASSIFICATION or prediction_type == constants.MULTICLASS:
                ClassificationModelIntrinsicScorer(modeling_params, model,
                                                   train_normal_X, train_normal_y, pipeline, run_folder, prepared_X,
                                                   iipd, False, False).score()
                if prediction_type == constants.BINARY_CLASSIFICATION:
                    scorer = BinaryClassificationModelScorer(modeling_params, None, run_folder, preds, probas, valid_y,
                                                             target_map, valid=None, test_df_index=None, sample_weight=None,
                                                             ignore_num_classes=True)
                else:
                    scorer = MulticlassModelScorer(modeling_params, None, run_folder, preds, probas, valid_y, target_map,
                                                   ignore_num_classes=True, valid=None, test_df_index=None,
                                                   sample_weight=None)
            scorer.score()
