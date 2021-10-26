import os.path as osp
import scipy.stats
from collections import *
from functools import reduce

import sys

from dataiku.base.utils import safe_unicode_str
from dataiku.doctor.preprocessing import RescalingProcessor2
from sklearn.model_selection import learning_curve
from sklearn.neighbors import KernelDensity

from dataiku.doctor import utils
from .common import *
from dataiku.doctor.preprocessing.assertions import MLAssertionsMetrics
from dataiku.doctor.preprocessing.assertions import MLAssertionMetrics
from ..utils.lift_curve import LiftBuilder
from dataiku.core import dkujson
from .classification_fit import *
from .regression_scoring import TreeSummaryBuilder, GradientBoostingSummaryBuilder, RandomForestSummaryBuilder
from ..utils.calibration import dku_calibration_curve, dku_calibration_loss
from .scoring_base import *
from ..utils import dku_isnan, dku_nonan, remove_all_nan

logger = logging.getLogger(__name__)


def is_proba_aware(algorithm, clf):
    return (algorithm not in ['SCIKIT_MODEL', 'CUSTOM_PLUGIN', 'EVALUATED'] 
           or (hasattr(clf, "predict_proba") and callable(clf.predict_proba)))


def decision_for_all_cuts_generator(probas_one, step=0.025, precision=4):
    cut = 0
    while cut < 1.0:
        yield probas_one > cut, cut
        cut += step
        cut = round(cut, precision)  # round the cut because we want "precise" values for cuts in perf.json


class ClassificationModelIntrinsicScorer(PredictionModelIntrinsicScorer):

    def __init__(self, modeling_params, clf, train_X, train_y, pipeline, out_folder, prepared_X, iipd, with_sample_weight, calibrate_proba):
        PredictionModelIntrinsicScorer.__init__(self, modeling_params, clf, train_X, train_y, out_folder, prepared_X, with_sample_weight)
        self.iipd = iipd
        self.pipeline = pipeline
        self.calibrate_proba = calibrate_proba

    def _extract_rescalers(self):
        return list(filter(lambda u: isinstance(u, RescalingProcessor2), self.pipeline.steps))

    def score(self):
        ret = self.iipd
        logger.info("Intrinsic scoring")

        if self.calibrate_proba:
            uncalibrated_clf = self.clf.base_estimator
        else:
            uncalibrated_clf = self.clf

        if self.modeling_params['algorithm'] == 'XGBOOST_CLASSIFICATION':
            max_iterations = self.modeling_params['xgboost_grid']['n_estimators']
            best_iteration = uncalibrated_clf._Booster.best_iteration
            early_stopping_rounds = self.modeling_params['xgboost_grid']['early_stopping_rounds']
            ret["nBoostedEstimators"] = min(best_iteration + early_stopping_rounds, max_iterations)

        self.add_raw_feature_importance_if_exists(uncalibrated_clf, ret)

        # Linear coefficients (binary only)
        _compute_coefs_if_available(
            uncalibrated_clf, self.train_X, self.prepared_X, self.train_y, self._extract_rescalers(), ret)

        if self.modeling_params.get("skipExpensiveReports"):
            logger.info("Skipping potentially expensive reports")  # tree(s) summary, PDP

        else:
            logger.info("Extracting rescalers")
            rescalers = self._extract_rescalers()

            if self.modeling_params['algorithm'] == 'DECISION_TREE_CLASSIFICATION':
                logger.info("Creating decision tree summary")
                tree_summary = TreeSummaryBuilder(uncalibrated_clf, self.train_X.columns(), rescalers, False,
                                                  self.with_sample_weight).build()
                dkujson.dump_to_filepath(osp.join(self.out_folder, "tree.json"), tree_summary)

            if self.modeling_params['algorithm'] == 'GBT_CLASSIFICATION':
                logger.info("Creating gradient boosting trees summary")
                summary = GradientBoostingSummaryBuilder(uncalibrated_clf, self.train_X.columns(), rescalers, False,
                                                         self.modeling_params["max_ensemble_nodes_serialized"],
                                                         self.with_sample_weight).build()
                dkujson.dump_to_filepath(osp.join(self.out_folder, "trees.json"), summary)
                logger.info("Creating GBT PDP")
                ret["partialDependencies"] = build_partial_dependence_plot(uncalibrated_clf, self.train_X, self.train_y, rescalers)

            if self.modeling_params['algorithm'] == 'RANDOM_FOREST_CLASSIFICATION':
                logger.info("Creating random forest trees summary")
                summary = RandomForestSummaryBuilder(uncalibrated_clf, self.train_X.columns(), rescalers, False,
                                                     self.modeling_params["max_ensemble_nodes_serialized"],
                                                     self.with_sample_weight).build()
                dkujson.dump_to_filepath(osp.join(self.out_folder, "trees.json"), summary)

        if self.modeling_params['algorithm'] == 'LARS':
            dkujson.dump_to_filepath(osp.join(self.out_folder, "coef_path.json"), {
                "path": [[[t for t in x] for x in c] for c in uncalibrated_clf.coef_path_],
                "features": self.train_X.columns(),
                "currentIndex": uncalibrated_clf.current_index
            })

        # Learning curve if requested
        if self.modeling_params["computeLearningCurves"]:
            logger.info("Computing learning curves")
            train_X, is_sparse = prepare_multiframe(self.train_X, self.modeling_params)
            train_nbsamples = train_X.shape[0]
            train_y = self.train_y.astype(int)

            train_sizes, train_scores, valid_scores = learning_curve(uncalibrated_clf, train_X, train_y)
            ret["learningCurve"] = {
                "samples" : train_sizes,
                "trainScoreMean" : np.mean(train_scores, axis=1),
                "trainScoreStd": np.std(train_scores, axis=1),
                "cvScoreMean" : np.mean(valid_scores, axis=1),
                "cvScoreStd":  np.std(valid_scores, axis=1)
            }

        ret["probaAware"] = is_proba_aware(self.modeling_params['algorithm'], uncalibrated_clf)

        # Dump the perf
        dkujson.dump_to_filepath(osp.join(self.out_folder, "iperf.json"), ret)


def _compute_coefs_if_available(clf, train_X, prepared_X, train_y, rescalers, ret):
    """
    Check if the classifier's coef_ and intercept_ attributes are available and of the right type
    for linear coefficients computation. Is so, add the resulting linear coefficients as "lmCoefficients"
    to the model's intrinsic performance
    """

    if not (hasattr(clf, "coef_") and hasattr(clf, "intercept_")):
        return

    try:
        coef = clf.coef_
        intercept = clf.intercept_
    except AttributeError:
        logger.info("Not computing linear coefficients because attributes `coef_` and `intercept_` are present,"
                    "but failed to retrieve them")
        return

    if not (isinstance(coef, list) or isinstance(coef, np.ndarray)):
        logger.info(
            "Not computing linear coefficients because `coef_` has wrong format: '{}'".format(type(coef)))
        return

    if not (isinstance(intercept, list) or isinstance(intercept, np.ndarray)):
        logger.info(
            "Not computing linear coefficients because `intercept_` has wrong format: '{}'".format(type(intercept)))
        return

    if isinstance(coef, list):
        coef = np.array(coef)
    if isinstance(intercept, list):
        intercept = np.array(intercept)

    if coef.shape[0] != 1 or intercept.shape[0] != 1:
        logger.info("Not computing linear coefficients: `coef_` or `intercept_` have the wrong shape")
        return

    features = train_X.columns()
    if len(features) != len(coef[0]):
        logger.info("Not computing linear coefficients: misalignment between features and coefficients")
        return

    logger.info("Computing regression coeffs")
    coefs = { "variables" : [], "coefs" : [] }
    logger.info("FEATURES %s CLF COEF %s" % (len(features), len(coef[0])))

    logger.info("CLF Intercept: %s" % intercept)

    from .scoring_base import compute_lm_significance
    (stderr, tstat, pvalue, istderr, itstat, ipvalue) = compute_lm_significance(clf, coef[0], intercept[0], prepared_X, train_y, regression=False)

    if tstat is not None:
        coefs["stderr"] = []
        coefs["tstat"] = []
        coefs["pvalue"] = []

        for v, i, s, t, p in zip(features, coef[0], stderr, tstat, pvalue):
            if i != 0.0:
                logger.info("V=%s i=%s" % (v, i))
                coefs["variables"].append(v)
                coefs["coefs"].append(i)
                coefs["stderr"].append(s)
                coefs["tstat"].append(t)
                coefs["pvalue"].append(p)
    else:
        for v, i in zip(features, coef[0]):
            if i != 0.0:
                logger.info("V=%s i=%s" % (v, i))
                coefs["variables"].append(v)
                coefs["coefs"].append(i)
    if intercept is not None:
        coefs["interceptCoef"] = intercept[0]
        coefs["interceptStderr"] = istderr
        coefs["interceptTstat"] = itstat
        coefs["interceptPvalue"] = ipvalue

    # compute renormalized coefs
    denorm = Denormalizer(rescalers)
    coefs["rescaledCoefs"] = [denorm.denormalize_coef(name, value) for name, value in zip(features, coefs["coefs"])]
    if stderr is not None:
        coefs["rescaledStderr"] = [denorm.denormalize_coef(name, value) for name, value in zip(features, coefs["stderr"])]
    if intercept is not None:
        coefs["rescaledInterceptCoef"] = denorm.denormalize_intercept(float(intercept), features, coefs["coefs"])
        if itstat is not None:
            coefs["rescaledInterceptStderr"] = denorm.denormalize_intercept_stderr(float(intercept), features, coefs["stderr"])
            coefs["rescaledInterceptTstat"] = coefs["rescaledInterceptCoef"] / coefs["rescaledInterceptStderr"]
            df = float(prepared_X.shape[0]-prepared_X.shape[1]-1)
            coefs["rescaledInterceptPvalue"] = 1 - scipy.stats.t.cdf(abs(coefs["rescaledInterceptTstat"]), df)

    ret["lmCoefficients"] = coefs


def binary_classification_predict_ensemble(clf, target_map, threshold, data, output_probas=True, has_target=False):
    """returns (prediction df - one column, probas df)"""

    if has_target:
        clf.set_with_target_pipelines_mode(True)

    logger.info("Start actual predict")
    proba_df = clf.predict_proba_as_dataframe(data)
    logger.info("Done actual predict")

    probas_one = proba_df.values[:,1]
    preds = (probas_one > threshold).astype(np.int)

    preds_remapped = np.zeros(preds.shape, dtype="object")
    inv_map = {
        int(class_id): label
        for label, class_id in target_map.items()
        }
    for mapped_value, original_value in inv_map.items():
        idx = preds == mapped_value
        preds_remapped[idx] = original_value

    pred_df = pd.DataFrame({"prediction": preds_remapped})
    pred_df.index = proba_df.index

    if output_probas:
        return DoctorScoringData(preds=pred_df.values, probas=proba_df.values, pred_df=pred_df, proba_df=proba_df)
    else:
        return DoctorScoringData(preds=pred_df.values, probas=None, pred_df=pred_df, proba_df=None)


def binary_classification_predict_single(clf, pipeline, modeling_params, target_map, threshold, data,
                                         output_probas=True):
    """returns (prediction df - one column, probas df)"""
    logger.info("Prepare to predict ...")
    algo = modeling_params["algorithm"]
    use_probas = is_proba_aware(algo, clf)
    transformed = pipeline.process(data)
    features_X_orig = features_X = transformed["TRAIN"]
    features_X_df = features_X.as_dataframe()
    features_X, is_sparse = prepare_multiframe(features_X, modeling_params)

    inv_map = {
        int(class_id): label
        for label, class_id in target_map.items()
    }
    classes = [class_label for (_, class_label) in sorted(inv_map.items())]

    if use_probas:
        logger.info("Start actual predict (threshold=%s)" % threshold)
        for col in features_X_df:
            logger.info("F %s = %s" % (col, features_X_df[col].iloc[0]))
        probas_raw = clf.predict_proba(features_X)
        logger.info("Done actual predict")

        (nb_rows, nb_present_classes) = probas_raw.shape
        #logger.info("Probas = %s" % probas_raw)
        logger.info("Probas raw shape %s/%s target_map=%s", nb_rows, nb_present_classes, len(target_map))

        probas = np.zeros((nb_rows, len(target_map)))
        for j in range(nb_present_classes):
            actual_class_id = clf.classes_[j]
            probas[:, actual_class_id] = probas_raw[:, j]

        probas_one = probas[:, 1]
        preds = (probas_one > threshold).astype(np.int)
    else:
        probas = None
        preds = clf.predict(features_X).astype(np.int)

    preds_remapped = np.zeros(preds.shape, dtype="object")
    for (mapped_value, original_value) in inv_map.items():
        idx = (preds == mapped_value)
        preds_remapped[idx] = original_value

    pred_df = pd.DataFrame({"prediction": preds_remapped})
    pred_df.index = features_X_orig.index

    if probas is not None and output_probas:
        proba_df = pd.DataFrame(probas, columns=["proba_%s" % x for x in classes])
        proba_df.index = features_X_orig.index
    else:
        proba_df = None

    return DoctorScoringData(preds=preds, probas=probas, pred_df=pred_df, proba_df=proba_df)

def binary_classification_predict(clf, pipeline, modeling_params, target_map, threshold, data, output_probas=True,
                                  ensemble_has_target=False):
    """returns the predicted dataframe. Used by the scoring recipe only at the moment"""

    if modeling_params["algorithm"] == "PYTHON_ENSEMBLE":
        scoring_data = binary_classification_predict_ensemble(clf, target_map, threshold, data, output_probas,
                                                              has_target=ensemble_has_target)
    else:
        scoring_data = binary_classification_predict_single(clf, pipeline, modeling_params, target_map, threshold, data,
                                                            output_probas)

    if scoring_data.proba_df is not None:
        scoring_data.pred_and_proba_df = pd.concat([scoring_data.pred_df, scoring_data.proba_df], axis=1)
    else:
        scoring_data.pred_and_proba_df = scoring_data.pred_df
        
    return scoring_data

def binary_classif_scoring_add_percentile_and_cond_outputs(pred_df, recipe_desc, model_folder, cond_outputs,
                                                           target_map):
    inv_map = {
        int(class_id): label
        for label, class_id in target_map.items()
    }
    classes = [class_label for (_, class_label) in sorted(inv_map.items())]
    proba_cols = [u"proba_{}".format(safe_unicode_str(c)) for c in classes]
    has_probas = recipe_desc["outputProbabilities"] or (cond_outputs and
                                                        len([co for co in cond_outputs
                                                             if co["input"] in proba_cols]))
    has_percentiles = recipe_desc["outputProbaPercentiles"] or (cond_outputs and
                                                                len([co for co in cond_outputs if
                                                                     co["input"] == "proba_percentile"]))
    if has_percentiles:
        model_perf = dkujson.load_from_filepath(osp.join(model_folder, "perf.json"))
        if "probaPercentiles" in model_perf and model_perf["probaPercentiles"]:
            percentile = pd.Series(model_perf["probaPercentiles"])
            proba_1 = u"proba_{}".format(safe_unicode_str(inv_map[1]))
            pred_df["proba_percentile"] = pred_df[proba_1].apply(
                lambda p: percentile.where(percentile <= p).count() + 1)
        else:
            raise Exception("Probability percentiles are missing from model.")
    if cond_outputs:
        for co in cond_outputs:
            inp = pred_df[co["input"]]
            acc = inp.notnull()  # condition accumulator
            for r in co["rules"]:
                if r["operation"] == 'GT':
                    cond = inp > r["operand"]
                elif r["operation"] == 'GE':
                    cond = inp >= r["operand"]
                elif r["operation"] == 'LT':
                    cond = inp < r["operand"]
                elif r["operation"] == 'LE':
                    cond = inp <= r["operand"]
                pred_df.loc[acc & cond, co["name"]] = r["output"]
                acc = acc & (~cond)
            pred_df.loc[acc, co["name"]] = co.get("defaultOutput", "")
    if has_percentiles and not recipe_desc["outputProbaPercentiles"]:  # was only for conditional outputs
        pred_df.drop("proba_percentile", axis=1, inplace=True)
    if has_probas and not recipe_desc["outputProbabilities"]:  # was only for conditional outputs
        pred_df.drop(proba_cols, axis=1, inplace=True)

    return pred_df


def multiclass_predict_ensemble(clf, target_map, data, output_probas, has_target=False):
    if has_target:
        clf.set_with_target_pipelines_mode(True)
    preds_df_unmapped = clf.predict_as_dataframe(data).astype(np.int)
    preds = preds_df_unmapped["prediction"].values
    preds_remapped = np.zeros(preds.shape, dtype="object")
    inv_map = {
        int(class_id): label
        for label, class_id in target_map.items()
        }
    for (mapped_value, original_value) in inv_map.items():
        idx = preds == mapped_value
        preds_remapped[idx] = original_value
    pred_df = pd.DataFrame({"prediction": preds_remapped})
    pred_df.index = preds_df_unmapped.index

    if output_probas:
        proba_df = clf.predict_proba_as_dataframe(data)
    else:
        proba_df = None    
        
    return DoctorScoringData(preds=preds, probas=proba_df.values, pred_df=pred_df, proba_df=proba_df)


def multiclass_predict_single(clf, pipeline, modeling_params, target_map, data, output_probas):
    algo = modeling_params["algorithm"]
    use_probas = output_probas and is_proba_aware(algo, clf)
    transformed = pipeline.process(data)
    features_X_orig = features_X = transformed["TRAIN"]
    features_X, is_sparse = prepare_multiframe(features_X, modeling_params)

    inv_map = {
        int(class_id): label
        for label, class_id in target_map.items()
    }
    classes = [class_label for (_, class_label) in sorted(inv_map.items())]

    preds = clf.predict(features_X).astype(np.int)
    preds_remapped = np.zeros(preds.shape, dtype="object")
    for (mapped_value, original_value) in inv_map.items():
        idx = (preds == mapped_value)
        preds_remapped[idx] = original_value
    pred_df = pd.DataFrame({"prediction": preds_remapped})
    pred_df.index = features_X_orig.index

    if use_probas:
        probas_raw = clf.predict_proba(features_X)
        (nb_rows, nb_present_classes) = probas_raw.shape
        #logger.info("Probas = %s" % probas_raw)
        logger.info("Probas raw shape %s/%s target_map=%s", nb_rows, nb_present_classes, len(target_map))
        probas = np.zeros((nb_rows, len(target_map)))
        for j in range(nb_present_classes):
            actual_class_id = clf.classes_[j]
            probas[:, actual_class_id] = probas_raw[:, j]

        proba_df = pd.DataFrame(probas, columns=["proba_%s" % x for x in classes])
        proba_df.index = features_X_orig.index
    else:
        probas = None
        proba_df = None
        
    return DoctorScoringData(preds=preds, probas=probas, pred_df=pred_df, proba_df=proba_df)


def multiclass_predict(clf, pipeline, modeling_params, target_map, data, output_probas=True, ensemble_has_target=False):
    """returns the predicted dataframe. Used by the scoring recipe and lambda"""
    if modeling_params["algorithm"] == "PYTHON_ENSEMBLE":
        scoring_data = multiclass_predict_ensemble(clf, target_map, data, output_probas, has_target=ensemble_has_target)
    else:
        scoring_data = multiclass_predict_single(clf, pipeline, modeling_params, target_map, data, output_probas)

    if scoring_data.proba_df is not None:
        scoring_data.pred_and_proba_df = pd.concat([scoring_data.pred_df, scoring_data.proba_df], axis=1)
    else:
        scoring_data.pred_and_proba_df = scoring_data.pred_df
        
    return scoring_data

def format_proba_density(data, sample_weight=None):
    if len(data) == 0:
        return []
    h = 1.06 * np.std(data) * math.pow(len(data), -.2)
    if h <= 0:
        h = 0.06
    if len(np.unique(data)) == 1:
        sample_weight = None

    X_plot = np.linspace(0.0, 1.0, 100)[:, np.newaxis]
    kde = KernelDensity(kernel='gaussian', bandwidth=h).fit(data.reshape(-1, 1), sample_weight=sample_weight)
    Y_plot = np.exp(kde.score_samples(X_plot))
    return [v if not dku_isnan(v) else 0 for v in Y_plot]


def format_all_proba_density(classes, target_map, probas, valid_y, sample_weight=None):
    # Probability density per actual class
    ret = {}
    for class_actual in classes:
        class_actual_id = int(target_map[class_actual])
        logger.info("Density for %s (id %s)" % (class_actual, class_actual_id))
        logger.info("valid_y shape = %s" % str(valid_y.shape))

        class_proba = probas[:, class_actual_id]
        logger.info("CP: %s (%s)" % (class_proba.__class__, str(class_proba.shape)))
        correct_mask = (valid_y.values == class_actual_id)
        incorrect_mask = (valid_y.values != class_actual_id)

        logger.info("Actual shape = %s" % str(correct_mask.shape))
        logger.info("MASK is %s " % correct_mask.__class__)

        class_proba_isactual = class_proba[correct_mask]
        class_proba_isnotactual = class_proba[incorrect_mask]
        # logger.info("Class proba %s" % class_proba_isactual)
        logger.info("Class proba shape %s" % str(class_proba_isactual.shape))

        if sample_weight is None:
            ret[class_actual] = {
                "correct": format_proba_density(class_proba_isactual),
                "incorrect": format_proba_density(class_proba_isnotactual),
                "correctMedian": np.median(class_proba_isactual),
                "incorrectMedian": np.median(class_proba_isnotactual)
            }
        else:
            ret[class_actual] = {
                "correct": format_proba_density(class_proba_isactual, sample_weight[correct_mask].values),
                "incorrect": format_proba_density(class_proba_isnotactual, sample_weight[incorrect_mask].values),
                "correctMedian": weighted_quantile(class_proba_isactual, sample_weight[correct_mask].values, 0.5),
                "incorrectMedian": weighted_quantile(class_proba_isnotactual, sample_weight[incorrect_mask].values, 0.5)
            }
    return ret

def compute_proba_distribution(probas, valid_y, sample_weights):

    bins = [(i * 1.0 / 10) for i in range(11)]

    ret = {
        "bins": bins,
        "probaDistribs": np.zeros((probas.shape[1], len(bins) - 1))
    }

    for class_id in range(probas.shape[1]):
        class_id_mask = valid_y.values == class_id
        sample_weights_masked = None if sample_weights is None else sample_weights[class_id_mask]
        ret["probaDistribs"][class_id, :], _ = np.histogram(probas[class_id_mask, 1], bins=bins,
                                                            weights=sample_weights_masked)
    ret["probaDistribs"] = ret["probaDistribs"].tolist()
    return ret

def binary_classification_scorer_with_valid(modeling_params, clf, valid, out_folder, test_df_index, target_map, with_sample_weight=False):
    valid_y = valid["target"].astype(int)
    if with_sample_weight:
        valid_w = valid["weight"]
    else:
        valid_w = None

    check_test_set_ok_for_classification(valid_y)

    preds, probas = get_predictions_and_probas_for_binary(clf, modeling_params, valid)
    assertions = valid.get("assertions", None)
    return BinaryClassificationModelScorer(modeling_params, clf, out_folder, preds, probas, valid_y, target_map, valid,
                                           test_df_index, valid_w, assertions=assertions)


def get_predictions_and_probas_for_binary(clf, modeling_params, valid):
    valid_X = valid["TRAIN"]
    valid_X, is_sparse = prepare_multiframe(valid_X, modeling_params)
    preds = clf.predict(valid_X)
    probas = None if not is_proba_aware(modeling_params["algorithm"], clf) else clf.predict_proba(valid_X)

    return preds, probas


def get_predictions_and_probas_for_multiclass(clf, modeling_params, valid, target_map, with_probas=True):
    valid_X = valid["TRAIN"]
    valid_X, is_sparse = prepare_multiframe(valid_X, modeling_params)
    preds = clf.predict(valid_X).astype(np.int)
    probas = None
    if with_probas and is_proba_aware(modeling_params["algorithm"], clf):
        logger.info("Creating prediction probabilities on validation set for " + str(clf))
        probas_raw = clf.predict_proba(valid_X)
        (nb_rows, nb_present_classes) = probas_raw.shape
        probas = np.zeros((nb_rows, len(target_map)))
        for j in range(nb_present_classes):
            actual_class_id = clf.classes_[j]
            probas[:, actual_class_id] = probas_raw[:, j]
    return preds, probas


def compute_otimized_threshold(valid_y, probas, metric_params, sample_weight=None):
    logger.info("Starting threshold optim")
    probas_one = pd.Series(data=probas[:, 1], name='predicted')
    (func, greater_is_better) = get_threshold_optim_function(metric_params)
    best_cut = 0.5
    if greater_is_better:
        best_score = -np.inf
    else:
        best_score = np.inf
    for decision, cut in decision_for_all_cuts_generator(probas_one):
        score = func(valid_y.astype(int), decision, sample_weight=sample_weight)
        logger.info("AT CUT %f score %f (pred_true=%d)" % (cut, score, np.count_nonzero(decision)))

        if (greater_is_better and score > best_score) or (not greater_is_better and score < best_score):
            best_cut = cut
            best_score = score
    logger.info("Selected threshold %s " % best_cut)
    return best_cut


def compute_assertions_for_decision(decision, assertions, target_map):
    assertions_metrics = MLAssertionsMetrics()
    for assertion in assertions:
        mask = assertion.mask.values  # mask and decision are aligned, we can work with np arrays
        condition = assertion.params["assertionCondition"]
        nb_rows_in_mask = np.sum(mask)
        nb_dropped_rows = assertion.nb_initial_rows - nb_rows_in_mask
        if nb_rows_in_mask > 0:
            expected_class_index = target_map[condition["expectedClass"]]
            valid_ratio = np.sum(mask & (decision == expected_class_index)) / (1.0 * nb_rows_in_mask)
            result = bool(valid_ratio >= condition["expectedValidRatio"])
        else:
            valid_ratio = None
            result = None

        new_assertion_metrics = MLAssertionMetrics(result, assertion.nb_initial_rows, nb_dropped_rows,
                                                  valid_ratio, assertion.params["name"])
        assertions_metrics.add_assertion_metrics(new_assertion_metrics)
    return assertions_metrics


def compute_assertions_for_binary_classification(probas_one, assertions, target_map):
    logger.info(u"Computing assertions metrics for assertions {}".format(assertions.printable_names()))
    assertions_metrics = [compute_assertions_for_decision(decision, assertions, target_map)
                          for decision, _ in decision_for_all_cuts_generator(probas_one)]
    logger.info("Finished computing assertions metrics")
    return assertions_metrics


def compute_assertions_for_multiclass_classification(preds, assertions, target_map):
    logger.info(u"Computing assertions metrics for assertions {}".format(assertions.printable_names()))
    assertions_metrics = compute_assertions_for_decision(preds, assertions, target_map)
    logger.info("Finished computing assertions metrics")
    return assertions_metrics


def compute_assertions_for_classification_from_clf(clf, modeling_params, prediction_type,  target_map, transformed):
    logger.info("Computing assertions from clf")
    if prediction_type == constants.BINARY_CLASSIFICATION:
        preds, probas = get_predictions_and_probas_for_binary(clf, modeling_params, transformed)
        if probas is not None:
            proba_one = probas[:, 1]
        else:  # non-probabilistic model, generating fake probas
            proba_one = (preds != 0) * 1.0
        assertions_metrics = compute_assertions_for_binary_classification(proba_one,
                                                                          transformed["assertions"],
                                                                          target_map)
    else:
        preds, _ = get_predictions_and_probas_for_multiclass(clf, modeling_params,
                                                             transformed,
                                                             target_map, with_probas=False)
        assertions_metrics = \
            compute_assertions_for_multiclass_classification(preds, transformed["assertions"],
                                                             target_map)
    return assertions_metrics


class BinaryClassificationModelScorer(PredictionModelScorer):

    def __init__(self, modeling_params, clf, out_folder, preds, probas, valid_y, target_map, valid=None, test_df_index=None,
                 sample_weight=None, ignore_num_classes=False, assertions=None):
        PredictionModelScorer.__init__(self, modeling_params, clf, valid, assertions)
        self.target_map = target_map
        self.inv_map = {
            int(class_id): label
            for label, class_id in self.target_map.items()
        }
        self.classes = [class_label for (_, class_label) in sorted(self.inv_map.items())]
        self.out_folder = out_folder

        self.predicted_df = None
        self.test_df_index = test_df_index
        self.preds = preds
        self.probas = probas
        self.valid_y = valid_y
        self.sample_weight = sample_weight
        self.ignore_num_classes = ignore_num_classes

        self.use_probas = probas is not None

    def score(self, with_assertions=True):
        if self.use_probas:
            self.ret["tiMetrics"] = {}
            optimize_threshold = self.modeling_params["autoOptimizeThreshold"]
            forced_threshold = self.modeling_params["forcedClassifierThreshold"]

            # Compute probas on classifier and create cut data
            (nb_rows, nb_present_classes) = self.probas.shape
            logger.info("Probas raw shape %s/%s target_map=%s", nb_rows, nb_present_classes, len(self.target_map))
            new_probas = np.zeros((nb_rows, len(self.target_map)))
            if not self.ignore_num_classes:
                for j in range(nb_present_classes):
                    actual_class_id = self.clf.classes_[j]
                    new_probas[:, actual_class_id] = self.probas[:, j]
                self.probas = new_probas

            # Compute all per-cut data
            probas_one = pd.Series(data=self.probas[:, 1], name='predicted')
            pcd = { "cut" : [], "tp" : [], "tn" : [], "fp":[], "fn":[],
                "precision":[], "recall": [], "accuracy": [], "f1" :[], "mcc" :[], "hammingLoss" :[]}

            # np.sort shouldn't be necessary but works around a microbug leading to non-monotonous percentiles.
            # See https://github.com/numpy/numpy/issues/10373
            # Percentiles could include [..., a, b, a, ...] with b < a at the 15 or 16th decimal place,
            # which could lead to different probaPercentile results at prediction time.
            self.ret["probaPercentiles"] = np.sort(probas_one.quantile([float(x + 1) / 100 for x in range(99)]).values)

            custom_scorefunc = None

            pcd, custom_scorefunc, custom_needsproba = self.compute_per_cut_data(probas_one, np.arange(0.0, 1.0, 0.025), with_assertions)

            self.ret["perCutData"] = pcd

            if optimize_threshold:
                best_cut = compute_otimized_threshold(self.valid_y, self.probas, self.modeling_params["metrics"],
                                                      self.sample_weight)
                self.ret["optimalThreshold"] = best_cut
                used_threshold = best_cut
            else:
                used_threshold = forced_threshold

            self.ret["usedThreshold"] = used_threshold

            # Compute predictions based on the threshold
            probas_one = pd.Series(data=self.probas[:, 1], name='predicted')
            self.preds = (probas_one > used_threshold).astype(np.int)

        else:
            # the threshold doesn't matter, really, but you'll see it in the UI
            used_threshold = self.modeling_params.get("forcedClassifierThreshold", 0.5)

            # make the fake probas, to reuse the same calls
            probas_one = (self.preds != 0) * 1.0

            # Compute all per-cut data
            pcd, custom_scorefunc, custom_needsproba = self.compute_per_cut_data(probas_one, [used_threshold], with_assertions)

            self.ret["perCutData"] = pcd

            self.ret["usedThreshold"] = used_threshold

        if self.target_map:
            self.mapped_preds = np.zeros(self.preds.shape, np.object)
            logger.info("preds %s" % self.preds)
            logger.info("MAPPED SHAPE %s" % self.mapped_preds.shape)

            for k, v in self.target_map.items():
                v = int(v)
                logger.info("k=%s v=%s" % (k,v))
                mask = self.preds == v
                logger.info("Mask data %s", mask.values)
                logger.info("mapped pred %s" % self.mapped_preds.__class__)
                self.mapped_preds[mask.values] = k
        else:
            self.mapped_preds = self.preds

        logger.info("MAPPED PREDS %s" % self.mapped_preds)

        if self.use_probas:
            # Threshold-independent metrics
            self.ret["tiMetrics"]["auc"] = mroc_auc_score(self.valid_y, self.probas, sample_weight=self.sample_weight)
            self.ret["tiMetrics"]["logLoss"] = log_loss(self.valid_y, self.probas, sample_weight=self.sample_weight)

            self.ret["tiMetrics"]["lift"] = make_lift_score(self.modeling_params["metrics"])(self.valid_y, self.probas, sample_weight=self.sample_weight)

            if custom_scorefunc is not None and custom_needsproba:
                ret = custom_scorefunc(self.valid_y, self.probas, sample_weight=self.sample_weight)
                if ret is None:
                    ret = 0
                self.ret["tiMetrics"]["customScore"] = ret

            # ROC and Lift for proba-aware classifiers
            false_positive_rates, true_positive_rates, thresholds = roc_curve(self.valid_y, self.probas[:, 1],
                                                                              sample_weight=self.sample_weight)
            # full roc curve data
            roc_data = zip(false_positive_rates, true_positive_rates, thresholds)
            # trim the data as we don't need all points for visualization
            # in a single-element array for k-fold compatibility
            self.ret["rocVizData"] = [[{"x": x, "y": y, "p": p} for (x, y, p) in trim_curve(roc_data)]]

            predicted = pd.Series(data=self.probas[:, 1], name='predicted')
            with_weight = self.sample_weight is not None
            if with_weight:
                results = pd.DataFrame({"__target__": self.valid_y, "sample_weight": self.sample_weight}).join(predicted)
            else:
                results = pd.DataFrame({"__target__": self.valid_y}).join(predicted)

            lb = LiftBuilder(results, '__target__', 'predicted', with_weight)
            try:
                self.ret["liftVizData"] = lb.build()
            except:
                logger.exception("Cannot compute Lift curve")

            # Probability density per actual class
            self.ret["densityData"] = format_all_proba_density(self.classes,
                        self.target_map, self.probas, self.valid_y, self.sample_weight)

            freqs, avg_preds, weights = dku_calibration_curve(self.valid_y.values, self.probas[:,1], sample_weight=self.sample_weight, n_bins=10)
            zipped = [(t, p, n) for (t, p, n) in zip(freqs, avg_preds, weights) if not np.isnan(t + p + n)]
            self.ret["calibrationData"] = [{"y": 0, "x": 0, "n": 0}] + [{"y": t, "x": p, "n": n} for (t, p, n) in zipped ] + [{"y": 1, "x": 1, "n": 0}]
            self.ret["tiMetrics"]["calibrationLoss"] = dku_nonan(dku_calibration_loss([x[0] for x in zipped], [x[1] for x in zipped], [x[2] for x in zipped]))

            # Proba distribution (only for subpopulation feature for the time being)
            self.ret["probaDistribData"] = compute_proba_distribution(self.probas, self.valid_y, self.sample_weight)

        # if self.probas is not None:
        #     self.add_metric("ROC - AUC Score", mroc_auc_score(self.valid_Y, self.probas), "From 0.5 (random model) to 1 (perfect model).")
        # if not self.multiclass and self.probas is not None:
        #     self.add_metric('Average Precision Score', average_precision_score(self.valid_Y, self.probas[:, 1]), "Average precision for all classes")
        # self.add_metric('Accuracy Score', accuracy_score(self.valid_Y, self.preds), "Proportion of correct predictions (positive and negative) in the sample")
        # self.add_metric('F1 Score', f1_score(self.valid_Y, self.preds), "Harmonic mean of Precision and Recall")
        # self.add_metric('Precision Score', precision_score(self.valid_Y, self.preds), "Proportion of correct 'positive' predictions in the sample")
        # self.add_metric('Recall Score', recall_score(self.valid_Y, self.preds), "Proportion of catched 'positive' actual records in the predictions")
        # #self.add_metric('Hinge Loss', hinge_loss(self.valid_Y, self.preds))
        # if not self.multiclass:
        #     self.add_metric('Matthews Correlation Coefficient', matthews_corrcoef(self.valid_Y, self.preds), "The MCC is a correlation coefficient between actual and predicted classifications; +1 is perfect, -1 means no correlation")
        # self.add_metric('Hamming Loss', hamming_loss(self.valid_Y, self.preds), "The Hamming loss is the fraction of labels that are incorrectly predicted. (The lower the better)")
        # #self.add_metric('Jaccard Similarity Score', jaccard_similarity_score(self.valid_Y, self.preds))
        # #self.add_metric('Zero One Loss', zero_one_loss(self.valid_Y, self.preds))
        # if self.probas is not None:
        #     self.add_metric('Log Loss', log_loss(self.valid_Y.values, self.probas), "Error metric that takes into account the predicted probabilities")

        # Dump the predicted set
        if self.valid_X_index is not None:
            if self.use_probas:
                proba_df = pd.DataFrame(self.probas, columns=["proba_%s" % x for x in self.classes])
                # Realign
                proba_df.index = self.valid_X_index
                full = pd.DataFrame(index = self.test_df_index)
                proba_df = full.join(proba_df, how="left")

                proba_df.to_csv(self.out_folder +"/predicted.csv", sep="\t", header=True, index=False, encoding='utf-8')
                self.predicted_df = proba_df
            else:
                preds_remapped = np.zeros(self.preds.shape, dtype="object")
                for (mapped_value, original_value) in self.inv_map.items():
                    idx = (self.preds.values == mapped_value)
                    preds_remapped[idx] = original_value
                pred_df = pd.DataFrame({"prediction": preds_remapped})
                # Realign
                pred_df.index = self.valid_X_index
                full = pd.DataFrame(index = self.test_df_index)
                pred_df = full.join(pred_df, how="left")
                pred_df.to_csv(self.out_folder +"/predicted.csv", sep="\t", header=True, index=False, encoding='utf-8')
                self.predicted_df = pred_df


        # Global metrics
        global_metrics = {}
        if self.sample_weight is not None:
            test_weight = self.sample_weight.sum()
            target_avg = np.dot(self.valid_y, self.sample_weight) / test_weight
            pred_avg = np.dot(self.preds, self.sample_weight) / test_weight
            global_metrics["testWeight"] = test_weight
            global_metrics["targetAvg"] = [ np.dot(self.valid_y.values, self.sample_weight) / test_weight ]
            global_metrics["targetStd"] = [ np.sqrt(np.dot(self.valid_y.values**2, self.sample_weight) / test_weight - target_avg**2) ]
            global_metrics["predictionAvg"] = [ np.dot(self.preds.values, self.sample_weight) / test_weight ]
            global_metrics["predictionStd"] = [ np.sqrt(np.dot(self.preds.values**2, self.sample_weight) / test_weight - pred_avg**2) ]

        else:
            global_metrics["testWeight"] = self.valid_y.shape[0]
            global_metrics["targetAvg"] = [self.valid_y.mean()]
            global_metrics["targetStd"] = [self.valid_y.std() if self.valid_y.shape[0] > 1 else 0]
            global_metrics["predictionAvg"] = [self.preds.mean()]
            global_metrics["predictionStd"] = [self.preds.std() if self.preds.shape[0] > 1 else 0]
        self.ret["globalMetrics"] = global_metrics

        # Dump the perf
        self.ret = remove_all_nan(self.ret)
        dkujson.dump_to_filepath(osp.join(self.out_folder, "perf.json"), self.ret)

        self.perf_data = self.ret
        return self.ret

    def get_score_to_explain(self):
        if not self.use_probas:
            raise RuntimeError("Individual prediction explanations incompatible with non-probabilistic models")
        proba_1 = self.probas[:, 1]
        return log_odds(proba_1, clip_min=0.01, clip_max=0.99)
        
    def compute_per_cut_data(self, probas_one, cuts, with_assertions):
        pcd = { "cut" : [], "tp" : [], "tn" : [], "fp":[], "fn":[],
            "precision":[], "recall": [], "accuracy": [], "f1" :[], "mcc" :[], "hammingLoss" :[],
                "assertionsMetrics": []}
        if self.modeling_params["metrics"]["evaluationMetric"] == "CUSTOM":
            pcd["customScore"] = []
            custom_scorefunc = get_custom_scorefunc(self.modeling_params["metrics"], self.valid_unprocessed)
            custom_needsproba = self.modeling_params["metrics"]["customEvaluationMetricNeedsProba"]
        else:
            custom_scorefunc = None
            custom_needsproba = False

        for decision, cut in decision_for_all_cuts_generator(probas_one):
            pcd["cut"].append(cut)
            conf = confusion_matrix(self.valid_y, decision, sample_weight=self.sample_weight)
            pcd["tp"].append(conf[1,1])
            pcd["tn"].append(conf[0,0])
            pcd["fp"].append(conf[0,1])
            pcd["fn"].append(conf[1,0])

            pcd["precision"].append(1.0 if conf[1,1] == 0 and conf[0,1] == 0 \
                    else precision_score(self.valid_y, decision, sample_weight=self.sample_weight))
            pcd["recall"].append(recall_score(self.valid_y, decision, sample_weight=self.sample_weight))
            pcd["f1"].append(f1_score(self.valid_y, decision, sample_weight=self.sample_weight))
            pcd["accuracy"].append(accuracy_score(self.valid_y, decision, sample_weight=self.sample_weight))
            pcd["mcc"].append(matthews_corrcoef(self.valid_y, decision, sample_weight=self.sample_weight))
            pcd["hammingLoss"].append(hamming_loss(self.valid_y, decision, sample_weight=self.sample_weight))

            if custom_scorefunc is not None and not custom_needsproba:
                decision_with_valid_index = decision.copy()
                decision_with_valid_index.index = self.valid_y.index
                ret = custom_scorefunc(self.valid_y, decision_with_valid_index, sample_weight=self.sample_weight)
                if ret is None:
                    pcd["customScore"].append(0)
                else:
                    pcd["customScore"].append(ret)

            if with_assertions and self.assertions:
                assertions_results = compute_assertions_for_binary_classification(probas_one,
                                                                                  self.assertions,
                                                                                  self.target_map)
                pcd["assertionsMetrics"] = [result.to_dict() for result in assertions_results]

        return pcd, custom_scorefunc, custom_needsproba


class CVBinaryClassificationModelScorer(BaseModelScorer):
    def __init__(self, scorers):
        super(CVBinaryClassificationModelScorer, self).__init__(scorers)
        self.modeling_params = self.scorers[0].modeling_params
        self.use_probas = scorers[0].use_probas

    def score(self):
        super(CVBinaryClassificationModelScorer, self).score()

        self.r1 = self.perfdatas[0]

        if "perCutData" in self.r1:
            out = { "cut" : self.r1["perCutData"]["cut"] }

            def append_one(key):
                out[key] = []
                out[key+"std"] = []
                tozip= [ x["perCutData"][key] for x in  self.perfdatas ]
                logger.info("  for key: %s tozip=%s" % (key, tozip))
                for vals in zip(*tozip):
                    logger.info("  for key: %s Vals=%s" % (key, vals))
                    out[key].append(np.array(vals).mean())
                    out[key +"std"].append(np.array(vals).std())

            for key in ["f1", "precision", "accuracy", "recall", "mcc", "hammingLoss"]:
                append_one(key)
            if self.modeling_params["metrics"]["evaluationMetric"] == "CUSTOM":
                append_one("customScore")
            for key in ["fp", "tp", "fn", "tn"]:
                out[key] = self.r1["perCutData"][key]
            self.ret["perCutData"] = out

            for key in ["densityData", "liftVizData", "optimalThreshold", "usedThreshold", "probaPercentiles"]:
                if key in self.r1:
                    self.ret[key] = self.r1[key]

            if self.use_probas:
                self.ret["rocVizData"] = [x["rocVizData"][0] for x in self.perfdatas]
                # TODO: average ? => fill holes...
                self.ret["calibrationData"] = self.perfdatas[0]["calibrationData"]
                all_folds_have_lift = True
                for x in self.perfdatas:
                    if not "liftVizData" in x:
                        all_folds_have_lift = False
                    if all_folds_have_lift:
                        self.ret["liftVizData"]["folds"] = [[{ "cum_size": y["cum_size"], "cum_lift": y["cum_lift"] }
                            for y in x["liftVizData"]["bins"]] for x in self.perfdatas]
                        # cheat by making the steepest possible wizard
                        self.ret["liftVizData"]["wizard"] = {
                            "positives": min([x["liftVizData"]["wizard"]["positives"] for x in self.perfdatas]),
                            "total":     max([x["liftVizData"]["wizard"]["total"]     for x in self.perfdatas]) }

                self.ret["tiMetrics"] = {}
                for metric in self.r1["tiMetrics"].keys():
                    data = np.array([ x["tiMetrics"][metric] for x in  self.perfdatas])
                    self.ret["tiMetrics"][metric] = data.mean()
                    self.ret["tiMetrics"][metric + "std"] = data.std()

        return self.ret


def multiclass_scorer_with_valid(modeling_params, clf, valid, out_folder, test_df_index, target_map=None, with_sample_weight=False):
    valid_y = valid["target"].astype(int)

    if with_sample_weight:
        valid_w = valid["weight"]
    else:
        valid_w = None
    assertions = valid.get("assertions", None)
    preds, probas = get_predictions_and_probas_for_multiclass(clf, modeling_params, valid, target_map)
    return MulticlassModelScorer(modeling_params, clf, out_folder, preds, probas, valid_y, target_map, valid,
                                 test_df_index, valid_w, assertions=assertions)


class MulticlassModelScorer(PredictionModelScorer):
    def __init__(self, modeling_params, clf, out_folder, preds, probas, valid_y, target_map=None, valid=None,
                 test_df_index=None, sample_weight=None, ignore_num_classes=False, assertions=None):
        PredictionModelScorer.__init__(self, modeling_params, clf, valid, assertions)
        self.target_map = target_map
        self.valid_y = valid_y
        self.preds = preds
        self.probas = probas
        if not ignore_num_classes:
            assert(len(clf.classes_) > 2)
        self.inv_map = {
            int(class_id): label
            for label, class_id in self.target_map.items()
        }
        self.out_folder = out_folder
        self.classes = [class_label for (_, class_label) in sorted(self.inv_map.items())]
        self.test_df_index = test_df_index
        self.sample_weight = sample_weight

        self.use_probas = probas is not None
        if self.use_probas:
            self.columns = ["proba_%s" % x for x in self.classes]

    def score(self, optimize_threshold = False, with_assertions=True):
        logger.info("Will use probas : %s" % self.use_probas)
        
        check_test_set_ok_for_classification(self.valid_y)

        # Not clear whether this is good or not ...
        # all_classes_in_test_set = np.unique(self.valid_y)
        # all_classes_in_pred = np.unique(self.preds)
        # logger.info("  IN TEST: %s" % all_classes_in_test_set)
        # logger.info("  IN PRED: %s" % all_classes_in_pred)
        # for cls in all_classes_in_pred:
        #     if not cls in all_classes_in_test_set:
        #         raise Exception("One of the classes predicted by the model (%s) is not in the test set. Cannot proceed." % (cls))


        # Compute unmapped preds
        if self.target_map:
            self.mapped_preds = np.zeros(self.preds.shape, np.object)
            for k, v in self.target_map.items():
                self.mapped_preds[self.preds == v] = k
        else:
            self.mapped_preds = self.preds

        # Confusion matrix
        self.ret["classes"] = self.classes
        self.ret["confusion"] = self.get_multiclass_confusion_matrix()
        logger.info("Calculated confusion matrix")

        # 1-vs-all ROC for proba-aware classifiers
        if self.use_probas:
            self.ret["oneVsAllRocAUC"] = {}
            self.ret["oneVsAllRocCurves"] = {}
            self.ret["oneVsAllCalibrationCurves"] = {}
            self.ret["oneVsAllCalibrationLoss"] = {}
            for class_selected in self.classes:
                class_selected_id = int(self.target_map[class_selected])
                # logger.info("Make ROC, valid_y=%s" %  self.valid_y)
                # logger.info("Make ROC, probas=%s"  % self.probas[:,class_selected_id])

                try:
                    false_positive_rates, true_positive_rates, thresholds = \
                        roc_curve(self.valid_y, self.probas[:, class_selected_id], class_selected_id, self.sample_weight)
                    roc_data = zip(false_positive_rates, true_positive_rates, thresholds)
                    # logger.info("AUC %s %s" % (false_positive_rates, true_positive_rates))
                    self.ret["oneVsAllRocCurves"][class_selected] = [{"x": x, "y": y, "p": p}
                                                                     for (x, y, p) in trim_curve(roc_data)]
                    self.ret["oneVsAllRocAUC"][class_selected] = auc(false_positive_rates, true_positive_rates)
                except Exception as e:
                    logger.error(e)
                    continue
                finally:
                    try:
                        y_bin = (self.valid_y.values == int(class_selected_id)).astype(int)
                        freqs, avg_preds, weights = dku_calibration_curve(y_bin, self.probas[:,int(class_selected_id)], n_bins=10, sample_weight=self.sample_weight)
                        zipped = [(t, p, n) for (t, p, n) in zip(freqs, avg_preds, weights) if not np.isnan(t + p + n)]
                        curve = [{"y": 0, "x": 0, "n": 0}] + [{"y": t, "x": p, "n": n} for (t, p, n) in zipped] + [{"y": 1, "x": 1, "n": 0}]
                        self.ret["oneVsAllCalibrationCurves"][class_selected] = curve
                        self.ret["oneVsAllCalibrationLoss"][class_selected] = dku_calibration_loss([x[0] for x in zipped], [x[1] for x in zipped], [x[2] for x in zipped])
                    except Exception as e:
                        logger.error(e)

            self.ret["densityData"] = format_all_proba_density(self.classes,
                        self.target_map, self.probas, self.valid_y, self.sample_weight)

        self.ret["metrics"] = {}

        if self.use_probas:
            self.ret["metrics"]["mrocAUC"] = mroc_auc_score(self.valid_y, self.probas, self.sample_weight)
            self.ret["metrics"]["mcalibrationLoss"] = sum(self.ret["oneVsAllCalibrationLoss"].values()) / len(self.classes)

        if self.modeling_params["metrics"]["evaluationMetric"] == "CUSTOM":
            custom_scorefunc = get_custom_scorefunc(self.modeling_params["metrics"], self.valid_unprocessed)
            if self.modeling_params["metrics"]["customEvaluationMetricNeedsProba"]:
                self.ret["metrics"]["customScore"] = custom_scorefunc(self.valid_y, self.probas, sample_weight=self.sample_weight)
            else:
                self.ret["metrics"]["customScore"] = custom_scorefunc(self.valid_y, self.preds, sample_weight=self.sample_weight)
        if with_assertions and self.assertions:
            assertions_metrics = compute_assertions_for_multiclass_classification(self.preds, self.assertions,
                                                                                  self.target_map)
            self.ret["metrics"]["assertionsMetrics"] = assertions_metrics.to_dict()

        self.ret["metrics"]["precision"] = precision_score(self.valid_y, self.preds, average='macro', pos_label=None, sample_weight=self.sample_weight)
        self.ret["metrics"]["recall"] = recall_score(self.valid_y, self.preds, average='macro', pos_label=None, sample_weight=self.sample_weight)
        self.ret["metrics"]["f1"] = f1_score(self.valid_y, self.preds, average='macro', pos_label=None, sample_weight=self.sample_weight)
        self.ret["metrics"]["accuracy"] = accuracy_score(self.valid_y, self.preds, sample_weight=self.sample_weight)
        self.ret["metrics"]["hammingLoss"] = hamming_loss(self.valid_y, self.preds, sample_weight=self.sample_weight)

        try:
            self.ret["metrics"]["logLoss"] = log_loss(self.valid_y, self.probas, sample_weight=self.sample_weight)
        except:
            # log loss only possible if all classes found, not always the case ...
            pass

        # Global metrics
        global_metrics = {}
        if self.sample_weight is not None:
            test_weight = self.sample_weight.sum()
            target_avg = [np.dot(self.valid_y == int(self.target_map[c]), self.sample_weight) / test_weight for c in self.classes]
            global_metrics["testWeight"] = test_weight
            global_metrics["targetAvg"] = [np.dot(self.valid_y.values == int(self.target_map[c]), self.sample_weight) / test_weight for c in self.classes]
            global_metrics["targetStd"] = [np.sqrt(np.dot((self.valid_y.values == int(self.target_map[c]))**2, self.sample_weight) / test_weight - target_avg[i]**2) for i, c in enumerate(self.classes)]
            if self.use_probas:
                pred_avg = [np.dot(self.probas[:,int(self.target_map[c])], self.sample_weight) / test_weight for c in self.classes]
                global_metrics["predictionAvg"] = [np.dot(self.probas[:,int(self.target_map[c])], self.sample_weight) / test_weight for c in self.classes]
                global_metrics["predictionStd"] = [np.sqrt(np.dot(self.probas[:,int(self.target_map[c])]**2, self.sample_weight) / test_weight - pred_avg[i]**2) for i, c in enumerate(self.classes)]

        else:
            global_metrics["testWeight"] = self.valid_y.shape[0]
            global_metrics["targetAvg"] = [(self.valid_y == int(self.target_map[c])).mean() for c in self.classes]
            global_metrics["targetStd"] = [(self.valid_y == int(self.target_map[c])).std()
                                           if self.valid_y.shape[0] > 1 else 0 for c in self.classes]
            if self.use_probas:
                global_metrics["predictionAvg"] = [(self.probas[:, int(self.target_map[c])]).mean() for c in self.classes]
                global_metrics["predictionStd"] = [(self.probas[:, int(self.target_map[c])]).std()
                                                   if self.probas.shape[0] > 1 else 0 for c in self.classes]

        self.ret["globalMetrics"] = global_metrics

         # Dump the predicted set
        if self.valid_X_index is not None:
            if self.use_probas:
                proba_df = pd.DataFrame(self.probas, columns=self.columns)
                pred_df = pd.DataFrame({"prediction": self.mapped_preds})
                out_df = pd.concat([proba_df, pred_df], axis=1)
                # Realign
                out_df.index = self.valid_X_index
                full = pd.DataFrame(index = self.test_df_index)
                out_df = full.join(out_df, how="left")
                out_df.to_csv(self.out_folder +"/predicted.csv", sep="\t", header=True, index=False, encoding='utf-8')
                self.predicted_df = out_df
            else:
                pred_df = pd.DataFrame({"prediction": self.mapped_preds})
                # Realign
                pred_df.index = self.valid_X_index
                full = pd.DataFrame(index = self.test_df_index)
                pred_df = full.join(pred_df, how="left")
                pred_df.to_csv(self.out_folder +"/predicted.csv", sep="\t", header=True, index=False, encoding='utf-8')
                self.predicted_df = pred_df

        # Dump the perf
        self.ret = remove_all_nan(self.ret)
        self.perf_data = self.ret
        dkujson.dump_to_filepath(osp.join(self.out_folder, "perf.json"), self.ret)

        return self.ret

    def get_multiclass_confusion_matrix(self,):
        assert self.preds.shape == self.valid_y.shape
        (nb_rows,) = self.preds.shape
        class_ids = [int(x) for x in  set(self.valid_y).union(self.preds)]
        counters = defaultdict(Counter)
        count_actuals = Counter()
        if self.sample_weight is not None:
            for actual, weight in zip(self.valid_y, self.sample_weight):
                count_actuals[actual] += weight
            for (actual, predicted, weight) in zip(self.valid_y, self.preds, self.sample_weight):
                counters[actual][predicted] += weight
        else:
            for actual in self.valid_y:
                count_actuals[actual] += 1
            for (actual, predicted) in zip(self.valid_y, self.preds):
                counters[actual][predicted] += 1
        return {
            "totalRows": nb_rows,
            "perActual": {
                self.inv_map[class_actual]: {
                    "actualClassCount":  float(count_actuals[class_actual]),
                    "perPredicted" : {
                        self.inv_map[class_predicted]: counters[class_actual][class_predicted]  for class_predicted in class_ids
                    }
                } for class_actual in class_ids
            }
        }

    def get_score_to_explain(self):
        if not self.use_probas:
            raise RuntimeError("Individual prediction explanations incompatible with non-probabilistic models")
        return np.apply_along_axis(lambda row: log_odds(row, clip_min=0.01, clip_max=0.99), 1, self.probas)


class CVMulticlassModelScorer(BaseModelScorer):
    def __init__(self, scorers):
        super(CVMulticlassModelScorer, self).__init__(scorers)
        self.r1 = None
        self.use_probas = scorers[0].use_probas

    def score(self):
        super(CVMulticlassModelScorer, self).score()

        self.r1 = self.perfdatas[0]
        self.ret["metrics"] = {}

        metrics = [set(pd["metrics"].keys()) for pd in self.perfdatas]
        metrics = reduce(lambda a, b: a.intersection(b), metrics)

        for metric in metrics:
            logger.info("Metric is %s" % metric)
            metric_values = [x["metrics"][metric] or 0.0 for x in self.perfdatas]
            logger.info("Metric values : " + "; ".join([str(x) for x in  metric_values ]))
            data = np.array(metric_values)
            logger.info("AVG %s" % data)
            self.ret["metrics"][metric] = data.mean()
            self.ret["metrics"][metric + "std"] = data.std()

        # Don't do much here ...
        self.ret["confusion"] = self.r1["confusion"]
        if "classes" not in self.ret:
            self.ret["classes"] = self.r1["classes"]
        if self.use_probas:
            self.ret["oneVsAllRocCurves"] = self.r1["oneVsAllRocCurves"]
            self.ret["oneVsAllRocAUC"] = self.r1["oneVsAllRocAUC"]
            self.ret["densityData"] = self.r1["densityData"]
            self.ret["oneVsAllCalibrationCurves"] = self.r1["oneVsAllCalibrationCurves"]
            self.ret["oneVsAllCalibrationLoss"] = self.r1["oneVsAllCalibrationLoss"]

        return self.ret
