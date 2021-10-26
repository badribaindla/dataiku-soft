import math, logging
import numpy as np
from scipy.sparse import diags
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeRegressor

from dataiku.doctor.utils.skcompat import dku_recursive_partial_dependence

logger = logging.getLogger(__name__)

class DoctorScoringData:

    def __init__(self, preds=None, probas=None, pred_df=None, proba_df=None, pred_and_proba_df=None):
        self.preds = preds
        self.probas = probas
        self.pred_df = pred_df
        self.proba_df = proba_df
        self.pred_and_proba_df = pred_and_proba_df

class PredictionModelIntrinsicScorer(object):
    def __init__(self, modeling_params, clf, train_X, train_y, out_folder, prepared_X, with_sample_weight):
        self.modeling_params = modeling_params
        self.clf = clf
        self.train_X = train_X
        self.ret = {}
        self.train_y = train_y
        self.out_folder = out_folder
        self.prepared_X = prepared_X
        self.with_sample_weight = with_sample_weight

    def add_raw_feature_importance_if_exists(self, clf, ret):
        logger.info("Computing feature importance")
        coefs = compute_variables_importance(self.train_X.columns(), clf)
        if coefs:
            ret["rawImportance"] = coefs


def compute_lm_significance(clf, coefs, intercept, prepared_X, train_y, regression=True):
    """Returns (t_test, p_val)"""

    # for SGDRegressor, intercept_ comes as a (1,) ndarray, so we need to convert to float
    intercept = float(intercept)

    # The t_stat(coefX) is:  coefX / stddev(coefX)
    # The stddev of all coefficients is given by:
    #  a. sigma^2 * (X^T*X)^-1
    #     for regressions
    #     where sigma^2 = sum(square_errors) / degrees_of_freedom
    # b.  (X^T * diag(probas*(1-probas)) * X)^-1
    #     for binary classifications
    #     see e.g. https://stats200.stanford.edu/Lecture26.pdf
    # NB: These estimates of the variance of coefficients are assuming homoscedasticity of the data.
    #     In the heteroscedastic case:
    #       - the estimations of the variances are biased for both linear and logistic regression
    #       - coefficients of logistic regression are biased (still unbiased for linear regression)
    # => TODO: use an estimator of the variance of coefficients that is robust to heteroscedasticity (e.g. "Object-oriented Computation of Sandwich Estimators")

    X = prepared_X
    y = train_y

    # We refuse to invert too big matrices (we have to invert a coef*coef matrix)
    if X.shape[1] > 1000 or X.__class__.__name__ == "csr_matrix":
        return (None, None, None, None, None, None)

    df = float(X.shape[0]-X.shape[1]-1)

    if regression:
        predicted = np.matrix(clf.predict(X)).T
    else:
        predicted = np.matrix(clf.predict_proba(X)[:, 0]).T
    
    # Change X and Y into numpy matrices for easier operations, and add constant column to X
    X = np.hstack((np.ones((X.shape[0], 1)), np.matrix(X)))
    y = np.matrix(y).T

    coefs_with_intercept =  np.hstack((intercept, coefs))
    logger.info("Coefs: %s" % coefs_with_intercept)

    # Sample variance (sigma^2 = sum(square_errors) / df )
    sigmasq = np.sum(np.square(predicted - y)) / df
    logger.info("Sample variance: %s" % sigmasq)

    if regression:
        information_matrix = X.T * X
    else:
        diag = diags([predicted.A[:, 0] * (1-predicted.A[:, 0])], [0])
        logger.info("Diagonal in information_matrix computation: %s" % str(diag))
        information_matrix = X.T * diag * X

    # Quick check that we can inverse information_matrix
    import scipy as sc
    if sc.linalg.det(information_matrix) == 0.0:
         logger.info("Singular variance matrix")
         return (None, None, None, None, None, None)

    logger.info("information matrix (X^T*X or X^T*Diag*X) shape: %s" % (information_matrix.shape,))

    # Compute the covariance matrix
    if regression:
        cvm = sigmasq * information_matrix.I
    else:
        cvm = information_matrix.I

    # Standard errors for the coefficients: the sqrt of the diagonal elements of the covariance matrix.   
    logger.info("Coefficient standard errors: %s" % np.sqrt(cvm.diagonal()))

    se = np.sqrt(cvm.diagonal().A[0,1:]) # Remove the constant

    # T statistic for each beta. (coef / coef_stddev)
    base_t_stat = coefs/se

    # P-value for each beta. This is a two sided t-test, since the betas can be
    # positive or negative.
    import scipy.stats
    betas_p_value = 1 - scipy.stats.t.cdf(abs(base_t_stat), df)

    # Same for intercept
    ise = np.sqrt(cvm.diagonal().A[0,0])
    itstat = intercept/ise
    ipval = 1 - scipy.stats.t.cdf(abs(itstat), df)

    if np.isnan(betas_p_value).any():
        logger.info("NaN found in pvalues")
        return None, None, None, None, None, None

    return se, base_t_stat, betas_p_value, ise, itstat, ipval


class PredictionModelScorer(object):
    def __init__(self, modeling_params, clf, valid, assertions=None):
        self.modeling_params = modeling_params
        self.clf = clf
        self.valid_X_columns = valid["TRAIN"].columns() if valid is not None else None
        self.valid_X_index = valid["TRAIN"].index if valid is not None else None
        self.valid_unprocessed = valid["UNPROCESSED"] if valid is not None else None
        self.assertions = assertions
        self.ret = {"metrics": {}, "processed_feature_names": self.valid_X_columns}

    def add_metric(self, measure, value, description=""):
        self.ret["metrics"][measure] = {'measure': measure, 'value': value, 'description': description}

    def score(self):
        NotImplementedError()

    def get_score_to_explain(self):
        NotImplementedError()

class BaseModelScorer(object):
    def __init__(self, scorers):
        self.scorers = scorers
        self.perfdatas = [x.perf_data for x in scorers]

    def score(self):
        self.ret = {}

        # Compute global metrics (mean of all folds)
        logger.info("Computing global metrics")

        fold_metrics = [ perf["globalMetrics"] for perf in self.perfdatas ]
        global_metrics = fold_metrics[0]

        for key in global_metrics:
            if isinstance(global_metrics[key], list):
                for i in range(0, len(global_metrics[key])):
                    global_metrics[key][i] = np.mean([metric[key][i] for metric in fold_metrics])
            else:
                global_metrics[key] = np.mean([metric[key] for metric in fold_metrics])

        self.ret["globalMetrics"] = global_metrics

        return self.ret

def trim_curve(curve, distance_threshold=0.05):
    """ Given a list of P_k=(x,y) curve points, remove points until there is no segemnt P_k , P_k+1
        that are smaller than distance_threshold. """
    curve = list(curve)
    yield curve[0]
    distance = 0
    for (prev, next) in zip(curve, curve[1:]):
        dx = next[0] - prev[0]
        dy = next[1] - prev[1]
        distance += math.sqrt(dx ** 2 + dy ** 2)
        if distance >= distance_threshold:
            yield next
            distance = 0
    if distance > 0:
        yield curve[-1]


def compute_variables_importance(features, clf):
    if not hasattr(clf, "feature_importances_"):
        logger.info("No feature importance in classifier")
        return {}

    try:
        feature_importances = clf.feature_importances_
    except AttributeError as e:
        # XGBoost + DART has a feature_importances_ attribute, but trying to access it fails
        logger.info("Not computing feature importances because attribute is present,"
                    "but failed to retrieve it, maybe XGBoost+DART")
        return {}

        # Ensure that 'feature_importances' has the appropriate format
    if not (isinstance(feature_importances, list) or isinstance(feature_importances, np.ndarray)):
        logger.info("Not computing feature importances because `feature_importances_`"
                    " has wrong format: '{}'".format(type(feature_importances)))
        return {}

    if isinstance(feature_importances, list):
        feature_importances = np.array(feature_importances)

    importances_sum = np.sum(feature_importances)

    if np.isnan(importances_sum) or importances_sum == 0.0:
        logger.info("Not computing feature importances because `feature_importances_`"
                    " sums to 0 or NaN")
        return {}

    # Rescaling importances to make them homogeneous to percentage
    # Already done in scikit learn models, but for custom/plugin
    # models, user is free to do whatever he wants
    feature_importances = feature_importances / importances_sum

    coefs = {"variables": [], "importances": []}
    for v, i in zip(features, feature_importances):
        if i != 0.0 and not np.isnan(i):
            coefs["variables"].append(v)
            coefs["importances"].append(i)
    return coefs


class Denormalizer(object):
    """
    Post-processing on the coefficients of a linear model.
    Scales back coefficients, intercepts and std thereof to maintain homogeneity with the original variable.
    """
    def __init__(self, rescalers):
        self.scalings = {rescaler.in_col: rescaler for rescaler in rescalers}

    def denormalize_feature_value(self, feature_name, feature_value):
        if feature_name in self.scalings:
            scaler = self.scalings[feature_name]
            inv_scale = scaler.inv_scale if scaler.inv_scale != 0.0 else 1.0
            return (feature_value / inv_scale) + scaler.shift
        else:
            return feature_value

    def denormalize_coef(self, feature_name, coef_value):
        if feature_name in self.scalings:
            scaler = self.scalings[feature_name]
            inv_scale = scaler.inv_scale if scaler.inv_scale != 0.0 else 1.0
            return coef_value * inv_scale
        else:
            return coef_value

    def denormalize_intercept(self, intercept_value, feature_names, coef_values):
        denormalized_intercept_value = intercept_value
        for feature_name, coef_value in zip(feature_names, coef_values):
            scaler = self.scalings.get(feature_name, None)
            if scaler is None:
                # whenever no rescaling (e.g. for dummy features, nothing to add
                continue
            else:
                inv_scale = scaler.inv_scale if scaler.inv_scale != 0.0 else 1.0
                shift = scaler.shift
                denormalized_intercept_value -= coef_value * shift * inv_scale
        return denormalized_intercept_value

    def denormalize_intercept_stderr(self, intercept_stderr, feature_names, coef_stderr_values):
        # NB: underlying zero-correlation between coefficients error hypothesis
        squared_res = intercept_stderr ** 2
        for feature_name, coef_stderr_value in zip(feature_names, coef_stderr_values):
            scaler = self.scalings.get(feature_name, None)
            if scaler is None:
                # whenever no rescaling (e.g. for dummy features, nothing to add
                continue
            else:
                squared_res += (scaler.shift * scaler.inv_scale * coef_stderr_value)**2
        return np.sqrt(squared_res)


def build_partial_dependence_plot(model, train_X, train_y, rescalers):
    denorm = Denormalizer(rescalers)
    feature_names = train_X.columns()
    X = train_X.as_np_array()
    offset = np.mean(train_y)

    # Compute partial dependences
    def make_pdp(i):
        pdp, axes = dku_recursive_partial_dependence(model, i, X, grid_resolution=100)
        feature = feature_names[i]
        feature_bins = [denorm.denormalize_feature_value(feature, x) for x in list(axes[0])]
        # If we computed the partial_dependence on a RandomForestRegressor or a
        # DecisionTreeRegressor, then we need to subtract the mean of `y` from
        # the predictions computed by partial_dependence so that the result is
        # centered on y=0. We don't need to do this for GBT because we assume
        # that the trees are already centered.
        if isinstance(model, (RandomForestRegressor, DecisionTreeRegressor)):
            data = [x - offset for x in pdp]
        else:
            data = pdp
        return {"feature": feature, "featureBins": feature_bins, "data": list(data)}

    return [make_pdp(i) for i in range(0, len(feature_names))]
