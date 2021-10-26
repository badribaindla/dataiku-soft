import logging
import os.path as osp
from six.moves import xrange
import json
from math import sqrt
import pandas as pd
import scipy.stats
import numpy as np

from sklearn.metrics import *

import dataiku.core.pandasutils as pdu
from dataiku.core import dkujson
from dataiku.doctor.utils import dku_nonaninf
from dataiku.doctor.preprocessing import RescalingProcessor2
from dataiku.doctor.prediction.scoring_base import *
from dataiku.doctor.preprocessing.assertions import MLAssertionsMetrics
from dataiku.doctor.preprocessing.assertions import MLAssertionMetrics

from ..utils.metrics import rmsle_score, mean_absolute_percentage_error
from .common import *

logger = logging.getLogger(__name__)


class RegressionModelIntrinsicScorer(PredictionModelIntrinsicScorer):
    def __init__(self, modeling_params, clf, train_X, train_y, pipeline, out_folder, prepared_X, iipd, with_sample_weight):
        PredictionModelIntrinsicScorer.__init__(self, modeling_params, clf, train_X, train_y, out_folder, prepared_X, with_sample_weight)
        self.iipd = iipd
        self.pipeline = pipeline
        self._rescalers = None  # lazy init

    def _extract_rescalers(self):
        if self._rescalers is None:
            self._rescalers = list(filter(lambda u: isinstance(u, RescalingProcessor2), self.pipeline.steps))
        return self._rescalers

    def score(self):
        ret = self.iipd

        logger.info("Intrinsic scoring")

        if self.modeling_params.get("skipExpensiveReports"):
            logger.info("Skipping potentially expensive reports")  # tree(s) summary, PDP

        else:
            logger.info("Extracting rescalers")
            rescalers = self._extract_rescalers()

            if self.modeling_params['algorithm'] == 'DECISION_TREE_REGRESSION':
                logger.info("Creating decision tree summary")
                tree_summary = TreeSummaryBuilder(self.clf, self.train_X.columns(), rescalers, True,
                                                  self.with_sample_weight).build()
                dkujson.dump_to_filepath(osp.join(self.out_folder, "tree.json"), tree_summary)
                logger.info("Computing DT PDP")
                ret["partialDependencies"] = build_partial_dependence_plot(self.clf, self.train_X, self.train_y, rescalers)

            elif self.modeling_params['algorithm'] == 'GBT_REGRESSION':
                logger.info("Creating gradient boosting trees summary")
                summary = GradientBoostingSummaryBuilder(self.clf, self.train_X.columns(), rescalers, True,
                                                         self.modeling_params["max_ensemble_nodes_serialized"],
                                                         self.with_sample_weight).build()
                dkujson.dump_to_filepath(osp.join(self.out_folder, "trees.json"), summary)
                logger.info("Computing GBT PDP")
                ret["partialDependencies"] = build_partial_dependence_plot(self.clf, self.train_X, self.train_y, rescalers)

            elif self.modeling_params['algorithm'] == 'RANDOM_FOREST_REGRESSION':
                logger.info("Creating random forest trees summary")
                summary = RandomForestSummaryBuilder(self.clf, self.train_X.columns(), rescalers, True,
                                                     self.modeling_params["max_ensemble_nodes_serialized"],
                                                     self.with_sample_weight).build()
                dkujson.dump_to_filepath(osp.join(self.out_folder, "trees.json"), summary)
                logger.info("Computing RF PDP")
                ret["partialDependencies"] = build_partial_dependence_plot(self.clf, self.train_X, self.train_y, rescalers)

        if self.modeling_params['algorithm'] in ['XGBOOST_REGRESSION']:
            max_iterations = self.modeling_params['xgboost_grid']['n_estimators']
            best_iteration = self.clf._Booster.best_iteration
            early_stopping_rounds = self.modeling_params['xgboost_grid']['early_stopping_rounds']
            ret["nBoostedEstimators"] = min(best_iteration + early_stopping_rounds, max_iterations)

        if self.modeling_params['algorithm'] == 'LARS':
            dkujson.dump_to_filepath(osp.join(self.out_folder, "coef_path.json"), {
                "path": [[[t] for t in x] for x in self.clf.coef_path_],
                "features": self.train_X.columns(),
                "currentIndex": self.clf.current_index
            })

        self.add_raw_feature_importance_if_exists(self.clf, ret)

        # compute coefs if model has any, except for SVM and XGBOOST where _coef can be missing
        if 'coef_' in dir(self.clf) and self.modeling_params['algorithm'] not in {"SVM_REGRESSION", "XGBOOST_REGRESSION"}:
            ret["lmCoefficients"] = _compute_coefs(self.clf, self.train_X, self.prepared_X, self.train_y,
                                                   self._extract_rescalers())

        dkujson.dump_to_filepath(osp.join(self.out_folder, "iperf.json"), ret)


def _compute_coefs(clf, train_X, prepared_X, train_y, rescalers):
    features = train_X.columns()
    logger.info("Computing regression coeffs")
    coefs = {"variables": [], "coefs": []}
    from .scoring_base import compute_lm_significance
    (stderr, tstat, pvalue, istderr, itstat, ipvalue) = compute_lm_significance(clf, clf.coef_, clf.intercept_, prepared_X, train_y)

    if tstat is not None:
        coefs["stderr"] = []
        coefs["rescaledStderr"] = []
        coefs["tstat"] = []
        coefs["pvalue"] = []
        for v, i, s, t, p in zip(features, clf.coef_, stderr, tstat, pvalue):
            if i != 0.0:
                coefs["variables"].append(v)
                coefs["coefs"].append(i)
                coefs["stderr"].append(s)
                coefs["tstat"].append(t)
                coefs["pvalue"].append(p)
    else:
        for v, i in zip(features, clf.coef_):
            if i != 0.0:
                coefs["variables"].append(v)
                coefs["coefs"].append(i)
    if clf.intercept_ is not None:

        # for SGDRegressor, intercept_ comes as a (1,) ndarray, so we need to convert to float
        intercept = float(clf.intercept_)
        coefs["interceptCoef"] = intercept
        coefs["interceptStderr"] = istderr
        coefs["interceptTstat"] = itstat
        coefs["interceptPvalue"] = ipvalue

    # compute renormalized coefs
    denorm = Denormalizer(rescalers)
    coefs["rescaledCoefs"] = [denorm.denormalize_coef(name, value) for name, value in zip(features, coefs["coefs"])]
    if stderr is not None:
        coefs["rescaledStderr"] = [denorm.denormalize_coef(name, value) for name, value in zip(features, coefs["stderr"])]
    if clf.intercept_ is not None:
        coefs["rescaledInterceptCoef"] = denorm.denormalize_intercept(float(clf.intercept_), features, coefs["coefs"])
        if itstat is not None:
            coefs["rescaledInterceptStderr"] = denorm.denormalize_intercept_stderr(float(clf.intercept_), features, coefs["stderr"])
            coefs["rescaledInterceptTstat"] = dku_nonaninf(coefs["rescaledInterceptCoef"] / coefs["rescaledInterceptStderr"])
            if coefs["rescaledInterceptTstat"] is not None:
                df = float(prepared_X.shape[0]-prepared_X.shape[1]-1)
                coefs["rescaledInterceptPvalue"] = 1 - scipy.stats.t.cdf(abs(coefs["rescaledInterceptTstat"]), df)
            else:
                coefs["rescaledInterceptPvalue"] = None

    return coefs


def pearson_correlation(valid_y, preds, sample_weight=None):
    if sample_weight is None:
        results = pd.DataFrame({
            "__target__": valid_y,
            "predicted": preds
        })
        correlation = results[['predicted', '__target__']].corr()
        return correlation['predicted'][1]
    else:
        # https://en.wikipedia.org/wiki/Pearson_correlation_coefficient#Weighted_correlation_coefficient
        sum_w = np.sum(sample_weight)
        w_avg_y  = np.sum(sample_weight  * valid_y) / sum_w
        w_avg_yp = np.sum(sample_weight * preds)    / sum_w
        w_sigma_y  = np.sum(sample_weight * valid_y * valid_y) / sum_w - w_avg_y  * w_avg_y
        w_sigma_yp = np.sum(sample_weight * preds   * preds)   / sum_w - w_avg_yp * w_avg_yp
        w_cov =      np.sum(sample_weight * valid_y * preds)   / sum_w - w_avg_y  * w_avg_yp
        try:
            corr = w_cov / np.sqrt(w_sigma_y * w_sigma_yp)
        except:
            corr = np.nan
        return corr


def compute_assertions_for_regression(preds, assertions):
    assertions_metrics = MLAssertionsMetrics()
    logger.info("Computing assertions metrics for assertions {}".format(assertions.printable_names()))
    for assertion in assertions:
        mask = assertion.mask.values  # mask and decision are aligned, we can work with np arrays
        condition = assertion.params["assertionCondition"]
        nb_rows_in_mask = np.sum(mask)
        nb_dropped_rows = assertion.nb_initial_rows - nb_rows_in_mask
        nb_valid_rows_in_mask = np.sum(mask
                                       & (preds >= condition["expectedMinValue"])
                                       & (preds <= condition["expectedMaxValue"]))
        if nb_rows_in_mask > 0:
            valid_ratio = 1.0 * nb_valid_rows_in_mask / nb_rows_in_mask
            result = bool(valid_ratio >= condition["expectedValidRatio"])
        else:
            valid_ratio = None
            result = None

        new_assertion_metrics = MLAssertionMetrics(result, assertion.nb_initial_rows, nb_dropped_rows, valid_ratio,
                                                   assertion.params["name"])
        assertions_metrics.add_assertion_metrics(new_assertion_metrics)
    logger.info("Finished computing assertions metrics")
    return assertions_metrics


def compute_assertions_for_regression_from_clf(clf, modeling_params, transformed):
    logger.info("Computing assertions")
    preds = get_predictions_for_regression(clf, modeling_params, transformed)
    return compute_assertions_for_regression(preds, transformed["assertions"])


def compute_metrics(valid_y, preds, sample_weight=None):
    mse = dku_nonaninf(mean_squared_error(valid_y, preds, sample_weight=sample_weight))
    return {
        "evs": dku_nonaninf(explained_variance_score(valid_y, preds, sample_weight=sample_weight)),
        "mape": dku_nonaninf(mean_absolute_percentage_error(valid_y, preds, sample_weight=sample_weight)),
        "mae": dku_nonaninf(mean_absolute_error(valid_y, preds, sample_weight=sample_weight)),
        "mse": mse,
        "rmse": dku_nonaninf(sqrt(mse)),
        "rmsle": dku_nonaninf(rmsle_score(valid_y, preds, sample_weight=sample_weight)),
        "r2": dku_nonaninf(r2_score(valid_y, preds, sample_weight=sample_weight)),
        "pearson": dku_nonaninf(pearson_correlation(valid_y, preds, sample_weight=sample_weight))
    }


def regression_predict_ensemble(clf, data, has_target=False):
    if has_target:
        clf.set_with_target_pipelines_mode(True)
    return clf.predict_as_dataframe(data)


def regression_predict_single(clf, pipeline, modeling_params, data):
    transformed = pipeline.process(data)
    features_X_orig = features_X = transformed["TRAIN"]
    features_X, is_sparse = prepare_multiframe(features_X, modeling_params)
    logger.info("Start actual predict")
    preds = clf.predict(features_X)
    logger.info("Done actual predict, formatting output")
    preds_df = pd.DataFrame({"prediction": preds})
    preds_df.index = features_X_orig.index
    return preds_df


def regression_predict(clf, pipeline, modeling_params, data, ensemble_has_target=False):
    """returns the predicted dataframe. Used by the scoring recipe only at the moment"""

    logger.info("Start predict block")
    algo = modeling_params["algorithm"]
    logger.info("Start actual predict")
    if algo == "PYTHON_ENSEMBLE":
        ret = regression_predict_ensemble(clf, data, has_target=ensemble_has_target)
    else:
        ret = regression_predict_single(clf, pipeline, modeling_params, data)
    logger.info("Done actual predict")
    return ret


def regression_scorer_with_valid(modeling_params, clf, valid, fold_mfolder, input_df_index, with_sample_weight=False):
    valid_Y = valid["target"]
    if with_sample_weight:
        valid_w = valid["weight"]
    else:
        valid_w = None

    preds = get_predictions_for_regression(clf, modeling_params, valid)

    assertions = valid.get("assertions", None)
    return RegressionModelScorer(modeling_params, clf, preds, valid_Y, fold_mfolder, valid, input_df_index,
                                 valid_w, assertions=assertions)


def get_predictions_for_regression(clf, modeling_params, valid):
    valid_X = valid["TRAIN"]
    valid_X, is_sparse = prepare_multiframe(valid_X, modeling_params)
    logger.info("Creating predictions on test set")
    preds = clf.predict(valid_X)
    return preds


class RegressionModelScorer(PredictionModelScorer):
    def __init__(self, modeling_params, clf, preds, target, out_folder, valid, input_df_index, sample_weight,
                 assertions=None):
        PredictionModelScorer.__init__(self, modeling_params, clf, valid, assertions=assertions)
        self.out_folder = out_folder
        self.preds = preds
        self.valid_Y = target
        self.dump_predicted = True
        self.input_df_index = input_df_index
        self.predicted_df = None
        self.perf_data = None
        self.sample_weight = sample_weight

    def score(self, with_assertions=True):
        logger.info("Computing regression performance on %s\n", self.preds)
        self.ret["regression_performance"] = self.get_regression_performance(self.valid_Y, self.preds, self.sample_weight)

        self.ret["scatterPlotData"] = self.compute_scatter_plot(self.preds, self.valid_Y)

        # Metrics
        self.ret["metrics"] = compute_metrics(self.valid_Y, self.preds, self.sample_weight)

        if with_assertions and self.assertions:
            assertions_metrics = compute_assertions_for_regression(self.preds, self.assertions)
            self.ret["metrics"]["assertionsMetrics"] = assertions_metrics.to_dict()

        if self.modeling_params["metrics"]["evaluationMetric"] == "CUSTOM":
            custom_scorefunc = get_custom_scorefunc(self.modeling_params["metrics"], self.valid_unprocessed)
            self.ret["metrics"]["customScore"] = custom_scorefunc(self.valid_Y, self.preds, sample_weight=self.sample_weight)

        # Global metrics
        global_metrics = {}
        if self.sample_weight is not None:
            test_weight = self.sample_weight.sum()
            target_avg = np.dot(self.valid_Y, self.sample_weight) / test_weight
            pred_avg = np.dot(self.preds, self.sample_weight) / test_weight
            global_metrics["testWeight"] = test_weight
            global_metrics["targetAvg"] = [ target_avg ]
            global_metrics["targetStd"] = [ np.sqrt(np.dot(self.valid_Y**2, self.sample_weight) / test_weight - target_avg**2) ]
            global_metrics["predictionAvg"] = [ pred_avg ]
            global_metrics["predictionStd"] = [ np.sqrt(np.dot(self.preds**2, self.sample_weight) / test_weight - pred_avg**2) ]
        else:
            global_metrics["testWeight"] = self.valid_Y.shape[0]
            global_metrics["targetAvg"] = [self.valid_Y.mean()]
            global_metrics["targetStd"] = [self.valid_Y.std() if self.valid_Y.shape[0] > 1 else 0]
            global_metrics["predictionAvg"] = [self.preds.mean()]
            global_metrics["predictionStd"] = [self.preds.std() if self.preds.shape[0] > 1 else 0]
        self.ret["globalMetrics"] = global_metrics

        # Dump the predicted set
        if self.valid_X_index is not None:
            self.compute_predicted_data(self.preds, self.valid_X_index)

        # compute pdf
        try:
            self.ret["predictionPDF"] = self.compute_preds_pdf(self.preds)
        except Exception: #NOSONAR (catching all because several different exceptions can be raised by
            logger.warn("Could not compute prediction PDF. Can be normal when performing subpopulation analysis.")

        # Dump the perf
        dkujson.dump_to_filepath(osp.join(self.out_folder, "perf.json"), self.ret)

        self.perf_data = self.ret

        return self.ret

    def compute_scatter_plot(self, preds, valid_Y, random_state=42, max_sample=1000):
        logger.info("Computing scatter plot")
        both = pd.DataFrame({
            "predicted": preds,
            "actual": valid_Y
        })
        if both.shape[0] > max_sample:
            both = both.sample(max_sample, random_state=random_state)
        return {
            "x": both.actual.tolist(),
            "y": both.predicted.round(4).tolist()
        }


    def compute_preds_pdf(self, preds):
        kde = scipy.stats.gaussian_kde(preds)
        xmin = np.min(preds)
        xmax = np.max(preds)
        x = np.linspace(xmin, xmax, num=100)
        pdf = kde(x)
        return {"x": x, "pdf": pdf}

    def compute_predicted_data(self, preds, valid_X_index):
        df = pd.DataFrame({"prediction": preds,
                           "error": self.error_series,
                           "relative_error": self.relative_error_series,
                           "error_decile": self.error_bin_series,
                           "abs_error_decile": self.abs_error_bin_series},
                          columns=["prediction", "error", "relative_error", "error_decile", "abs_error_decile"])
        # Realign
        df.index = valid_X_index
        full = pd.DataFrame(index=self.input_df_index)
        df = full.join(df, how="left")

        if self.dump_predicted:
            df.to_csv(self.out_folder + "/predicted.csv", sep="\t", header=True, index=False)

        self.predicted_df = df

    def get_regression_performance(self, valid_y, preds, sample_weight=None):
        # Base data
        results = pd.DataFrame({
            "target": valid_y,
            "predicted": preds
        })
        # Error
        results['error'] = results['target'] - results['predicted']
        results['relative_error'] = results['error']/results['target']

        raw_min_error = results['error'].min()
        raw_max_error = results['error'].max()

        # Winsorize
        q = results['error'].quantile(0.98) # TODO: sample_weight ?
        results['error'] = results['error'].map(lambda x: q if x > q else x)
        q = results['error'].quantile(0.02) # TODO: sample_weight ?
        results['error'] = results['error'].map(lambda x: q if x < q else x)

        self.error_series = results["error"]
        self.relative_error_series = results["relative_error"]

        if sample_weight is not None:
            results["sample_weight"] = sample_weight
            results.sort_values(by=["error"], ascending=True, inplace=True)

        # Cut
        try:
            (cut_categorical, cut_mins) = pd.cut(results['error'], 10, labels=xrange(0, 10), retbins=True)
        except Exception as e:
            logger.error(e)
            # ugly hack: when all errors are almost the same, the pd.cut fails, but if you slightly modify them, then it's fine again
            (cut_categorical, cut_mins) = pd.cut(0.999*results['error'], 10, labels=xrange(0, 10), retbins=True)

        results['error_bin_id'] = cut_categorical
        self.error_bin_series = results["error_bin_id"]

        try:
            self.abs_error_bin_series = pd.cut(results["error"].abs(), 10, labels=xrange(0, 10), retbins=True)[0]
        except Exception as e:
            logger.error(e)
            # ugly hack: when all errors are almost the same, the pd.cut fails, but if you slightly modify them, then it's fine again
            self.abs_error_bin_series = pd.cut(0.999*results["error"].abs(), 10, labels=xrange(0, 10), retbins=True)[0]

        if sample_weight is None:
            ags = results.groupby('error_bin_id')['target'].count().reset_index()
            ags.columns = ["error_bin_id", "count"]
            distrib = []
            for idx, row in ags.iterrows():
                bin_id = row["error_bin_id"]
                distrib.append({
                    "bin_id": bin_id,
                    "bin_min": cut_mins[bin_id],
                    "bin_max": cut_mins[bin_id + 1],
                    "count": dku_nonaninf(row["count"])
                })
            return {
                'error_distribution': distrib,
                'raw_min_error': raw_min_error,
                'min_error': results['error'].min(),
                'p25_error': results['error'].quantile(.25),
                'median_error': results['error'].median(),
                'average_error': results['error'].mean(),
                'std_error': dku_nonaninf(results['error'].std()),
                'p75_error': dku_nonaninf(results['error'].quantile(.75)),
                'p90_error': dku_nonaninf(results['error'].quantile(.90)),
                'max_error': results['error'].max(),
                'raw_max_error': raw_max_error,
            }
        else:
            errors = results['error'].values
            weights = results['sample_weight'].values
            cumsum_weights = np.cumsum(weights)
            sum_weights = cumsum_weights[-1]
            w_avg_e = np.dot(errors, weights) / sum_weights
            ags = results.groupby('error_bin_id')['sample_weight'].sum().reset_index()
            ags.columns = ["error_bin_id", "w_count"]
            distrib = []
            for idx, row in ags.iterrows():
                bin_id = row["error_bin_id"]
                distrib.append({
                    "bin_id": bin_id,
                    "bin_min": cut_mins[bin_id],
                    "bin_max": cut_mins[bin_id + 1],
                    "count": dku_nonaninf(row["w_count"])
                })
            return {
                'error_distribution': distrib,
                'raw_min_error': raw_min_error,
                'min_error': results['error'].min(),
                'p25_error': weighted_quantile(errors, results['sample_weight'].values, .25, cumsum_weights=cumsum_weights),
                'median_error': weighted_quantile(errors, results['sample_weight'].values, .5, cumsum_weights=cumsum_weights),
                'average_error': w_avg_e,
                'std_error': np.sqrt(np.dot(np.square(errors), weights) / sum_weights - w_avg_e * w_avg_e),
                'p75_error': weighted_quantile(errors, results['sample_weight'].values, .75, cumsum_weights=cumsum_weights),
                'p90_error': weighted_quantile(errors, results['sample_weight'].values, .90, cumsum_weights=cumsum_weights),
                'max_error': results['error'].max(),
                'raw_max_error': raw_max_error,
            }

    def get_score_to_explain(self):
        return self.preds

class CVRegressionModelScorer(BaseModelScorer):
    def __init__(self, scorers):
        super(CVRegressionModelScorer, self).__init__(scorers)

    def score(self):
        super(CVRegressionModelScorer, self).score()

        self.r1 = self.perfdatas[0]

        self.ret["metrics"] = {}
        for metric in self.r1["metrics"].keys():
            data = np.array(
                [x["metrics"][metric] if x["metrics"][metric] is not None else np.nan for x in self.perfdatas])
            self.ret["metrics"][metric] = dku_nonaninf(data.mean())
            self.ret["metrics"][metric + "std"] = dku_nonaninf(data.std())

        self.ret["scatterPlotData"] = self.r1["scatterPlotData"]
        self.ret["regression_performance"] = self.r1["regression_performance"]

        return self.ret


def make_tree_data(extract, feature_names, rescalers, is_regression, with_sample_weight, class_weight=None):
    denorm = Denormalizer(rescalers)

    def denormalize(feat, threshold):
        return threshold if feat < 0 else denorm.denormalize_feature_value(feature_names[feat], threshold)

    features = extract.feature.tolist()
    thresholds = [denormalize(ft, thresh) for (ft, thresh) in zip(features, extract.threshold.tolist())]
    tree = {
        "leftChild": extract.children_left.tolist(),
        "rightChild": extract.children_right.tolist(),
        "impurity": extract.impurity.tolist(),
        "threshold": thresholds,
        "nSamples": extract.n_node_samples.tolist(),
        "feature": features
    }

    if with_sample_weight and class_weight is None:
        tree["nSamplesWeighted"] = extract.weighted_n_node_samples.tolist()

    if is_regression:
        tree["predict"] = [x[0][0] for x in extract.value]
    else:
        tree["probas"] = [[u / y[1] for u in y[0]] for y in [(x[0], sum(x[0])) for x in extract.value]]
        if class_weight is not None:
            try:
                classes = class_weight.keys()
                tree["targetClassesProportions"] = [[u/y[1] for u in y[0]] for y in [([x[0][i] / class_weight[i] for i in classes], sum([x[0][i] / class_weight[i] for i in classes])) for x in extract.value]]
            except:
                logging.warning("Could not compute target classes ratio (division by zero)")
        else:
            tree["targetClassesProportions"] = tree["probas"]
    return tree


class TreeSummaryBuilder(object):
    def __init__(self, model, feature_names, rescalers, is_regression, with_sample_weight):
        self.rescalers = rescalers
        self.model = model
        self.featureNames = feature_names
        self.is_regression = is_regression
        self.with_sample_weight = with_sample_weight

    def build(self):
        class_weight = self.model.get_params().get("class_weight", None)
        tree = make_tree_data(self.model.tree_, self.featureNames, self.rescalers, self.is_regression,
                              self.with_sample_weight, class_weight=class_weight)
        return {"tree": tree, "featureNames": self.featureNames}


class GradientBoostingSummaryBuilder(object):
    def __init__(self, model, featureNames, rescalers, is_regression, max_nodes, with_sample_weight):
        self.rescalers = rescalers
        self.model = model
        self.featureNames = featureNames
        self.is_regression = is_regression
        self.max_nodes = max_nodes
        self.with_sample_weight = with_sample_weight

    def build(self):
        accum = np.cumsum([len(t[0].tree_.feature.tolist()) for t in self.model.estimators_])
        taken = max(1, sum(1 for x in accum if x <= self.max_nodes))
        # scikit-learn GBT does not support class_weight (as of version 0.23)
        trees = [make_tree_data(t[0].tree_, self.featureNames, self.rescalers, True, self.with_sample_weight,
                                class_weight=None)
                 for t in self.model.estimators_[0: taken]]
        return {"trees": trees, "featureNames": self.featureNames, "was_clipped": taken != len(self.model.estimators_)}


class RandomForestSummaryBuilder(object):
    def __init__(self, model, featureNames, rescalers, is_regression, max_nodes, with_sample_weight):
        self.rescalers = rescalers
        self.model = model
        self.featureNames = featureNames
        self.is_regression = is_regression
        self.max_nodes = max_nodes
        self.with_sample_weight = with_sample_weight

    def build(self):
        accum = np.cumsum([len(t.tree_.feature.tolist()) for t in self.model.estimators_])
        taken = max(sum(1 for x in accum if x <= self.max_nodes), 1)
        class_weight = self.model.get_params().get("class_weight", None)
        trees = [make_tree_data(t.tree_, self.featureNames, self.rescalers, self.is_regression, self.with_sample_weight,
                                class_weight=class_weight)
                 for t in self.model.estimators_[0: taken]]
        return {"trees": trees, "featureNames": self.featureNames, "was_clipped": taken != len(self.model.estimators_)}
