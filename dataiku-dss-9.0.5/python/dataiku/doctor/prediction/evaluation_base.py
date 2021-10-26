# encoding: utf-8

import sys, json, os.path as osp, logging
from six.moves import xrange

from dataiku.doctor.prediction_entrypoints import *

from dataiku.doctor.prediction import RegressionModelScorer
from dataiku.doctor.prediction.classification_scoring import BinaryClassificationModelScorer, MulticlassModelScorer
from dataiku.doctor import utils

from ..preprocessing_handler import *
    
from pandas.api.types import is_string_dtype, is_datetime64_any_dtype, is_numeric_dtype
from dataiku.doctor.utils import datetime_to_epoch, epoch_to_datetime
from dataiku.doctor.utils import dku_deterministic_value_counts    

import datetime as dt

logger = logging.getLogger(__name__)

# computing input statistics for model evaluations
def fill_numeric_series_statistics(s, statistics):
    statistics['type'] = 'numeric'
    statistics['sum'] = s.sum()
    statistics['mean'] = s.mean()
    statistics['stddev'] = s.std()
    statistics['min'] = s.min()
    statistics['p25'] = s.quantile(0.25)
    statistics['median'] = s.median()
    statistics['p75'] = s.quantile(0.75)
    statistics['max'] = s.max()        
    
    iqr = statistics['p75'] - statistics['p25']
    low_whisker = max(statistics['min'], statistics['p25'] - 1.5 * iqr)
    high_whisker = min(statistics['max'], statistics['p75'] + 1.5 * iqr)
    
    s_not_null = s.dropna()
    statistics['bottomOutliers'] = s_not_null[s < low_whisker].sort_values(ascending=True).head(6).tolist()
    statistics['topOutliers'] = s_not_null[s > high_whisker].sort_values(ascending=False).head(6).tolist()
    
    histogram = np.histogram(s_not_null, bins=30)
    statistics["histogramCounts"] = histogram[0].tolist()
    statistics["histogramBins"] = histogram[1].tolist()

def fill_date_series_statistics(s, statistics):
    def to_isoformat(l):
        return [(t.isoformat() if t is not None else None) for t in l]
    
    statistics['type'] = 'date'
    ns = datetime_to_epoch(s)
    ss = pd.Series(np.array([ns.mean()]))
    ss = epoch_to_datetime(ss, s)
    statistics['mean'] = ss[0].isoformat()
    statistics['stddev'] = ns.std()
    s_min = s.min()
    p25 = s.quantile(0.25)
    p75 = s.quantile(0.75)
    s_max = s.max()
    statistics['min'] = s_min.isoformat()
    statistics['p25'] = p25.isoformat()
    statistics['median'] = s.quantile(0.5).isoformat()
    statistics['p75'] = p75.isoformat()
    statistics['max'] = s_max.isoformat()
    
    iqr = p75 - p25
    low_whisker = max(s_min, p25 - 1.5 * iqr)
    high_whisker = min(s_max, p75 + 1.5 * iqr)
    
    s_not_null = s.dropna()
    statistics['bottomOutliers'] = to_isoformat(s_not_null[s < low_whisker].sort_values(ascending=True).head(6))
    statistics['topOutliers'] = to_isoformat(s_not_null[s > high_whisker].sort_values(ascending=False).head(6))
    
    histogram = np.histogram(datetime_to_epoch(s_not_null), bins=30)
    statistics["histogramCounts"] = histogram[0].tolist()
    statistics["histogramDateBins"] = to_isoformat(epoch_to_datetime(pd.Series(histogram[1]), s))
    

def fill_string_series_statistics(s, statistics):
    statistics['type'] = 'string'
    statistics['min'] = s.min()
    statistics['p25'] = s.quantile(0.25, interpolation='nearest')
    statistics['median'] = s.quantile(0.5, interpolation='nearest')
    statistics['p75'] = s.quantile(0.75, interpolation='nearest')
    statistics['max'] = s.max()
    
    
def build_series_statistics(s, feature_params, prediction_type):
    feature_role = feature_params.get('role', 'REJECT')
    feature_type = feature_params.get('type', 'CATEGORY')
    
    logging.info("Stats for %s (%s) : %s %s" % (s.name, s.dtype, feature_role, feature_type))

    def format_to_str(x):
        if x is None:
            return ''
        elif isinstance(x, list):
            return [format_to_str(y) for y in x]
        elif pd.isnull(x): # here after the handling of the list type
            return ''
        elif isinstance(x, dt.datetime):
            return x.isoformat()
        else:
            return str(x)

    statistics = {}
    statistics['featureRole'] = feature_role
    statistics['featureType'] = feature_type
    statistics['count'] = s.notnull().sum()
    if statistics['count'] > 0:
        statistics['distinct'] = s.unique().shape[0]
        if is_datetime64_any_dtype(s.dtype):
            value_counts = dku_deterministic_value_counts(s.apply(lambda x:x.isoformat() if x is not None else None), dropna=False)
        else:
            try:
                value_counts = dku_deterministic_value_counts(s.astype('U'), dropna=False)
            except:
                value_counts = dku_deterministic_value_counts(s.astype('S'), dropna=False)            
        uniques = value_counts[value_counts == 1]
        statistics['unique'] = (value_counts == 1).sum()
        statistics['uniqueExamples'] = format_to_str(uniques.head(6).index.tolist())
        
        try:
            top = value_counts.head(10)
            statistics['top'] = [{"value": format_to_str(v), "count":top[v]} for v in top.index]
        except Exception as e:
            logging.warning("Unable to compute most frequent values of %s : %s" % (s.name, str(e)))
        try:
            if feature_role == 'TARGET':
                if prediction_type == constants.REGRESSION:
                    fill_numeric_series_statistics(s, statistics)
                else:
                    # treat as category
                    fill_string_series_statistics(s.astype('str'), statistics)
            elif feature_role == 'WEIGHT':
                fill_numeric_series_statistics(s, statistics)
            elif feature_type == 'NUMERIC':
                if is_numeric_dtype(s):
                    fill_numeric_series_statistics(s, statistics)
                elif is_datetime64_any_dtype(s.dtype):
                    fill_date_series_statistics(s, statistics)
            elif feature_type == 'CATEGORY':
                if is_string_dtype(s.dtype):
                    fill_string_series_statistics(s, statistics)
                else:
                    fill_string_series_statistics(s.astype('str'), statistics)
            elif feature_type == 'TEXT':
                s = s.str.len() # do stats on the text length, but something more meaningful should be expected
                fill_numeric_series_statistics(s, statistics)
            elif feature_type == 'VECTOR':
                # we could compute vectorized metrics
                statistics['mean'] = None
            elif feature_type == 'IMAGE':
                # nothing
                statistics['mean'] = None
            else:
                # that leaves columns without feature info, for which we just infer
                if is_numeric_dtype(s):
                    fill_numeric_series_statistics(s, statistics)
                elif is_datetime64_any_dtype(s.dtype):
                    fill_date_series_statistics(s, statistics)
                elif is_string_dtype(s.dtype):
                    fill_string_series_statistics(s, statistics)
                else:
                    fill_string_series_statistics(s.astype('str'), statistics)
        except Exception as e:
            logging.warning("Unable to compute statistics of %s : %s" % (s.name, str(e)))
            
    return statistics


def build_statistics(df, feature_preproc, prediction_type):
    statistics = {}
    statistics["nbRows"] = df.shape[0]
    statistics["univariate"] = {}
    for column in df.columns:
        statistics["univariate"][column] = build_series_statistics(df[column], feature_preproc.get(column, {}), prediction_type)
    return statistics
    

# wrap scoring code for model evaluation
# main task of the 'wrapper' is to do a few check before calling the scorers
def run_binary_scoring(clf, modeling_params, pred_df, probas_df, target, target_map, sample_weight,
                       out_folder, ignore_num_classes, assertions=None):
    if pred_df.shape[0] == 0:
        logger.error("Missing predictions")
        return

    # Check that both classes are present, otherwise scoring fails
    n_classes_valid = np.unique(target).shape[0]
    if n_classes_valid < 2:
        logger.error("Both classes must be present")
        return
        
    binary_classif_scorer = BinaryClassificationModelScorer(
        modeling_params,
        clf,
        out_folder,
        pred_df,
        probas_df,
        target,
        target_map,
        valid=None,  # Not dumping on disk predicted_df
        test_df_index=None,  # Not dumping on disk predicted_df
        sample_weight=sample_weight,
        ignore_num_classes=ignore_num_classes,
        assertions=assertions)
    binary_classif_scorer.score(with_assertions=True)


def run_multiclass_scoring(clf, modeling_params, pred_df, probas_df, target, target_map, sample_weight,
                           out_folder, ignore_num_classes, assertions=None):
    if pred_df.shape[0] == 0:
        return

    # Check that both classes are present, otherwise scoring fails
    n_classes_valid = np.unique(target).shape[0]
    if n_classes_valid < 2:
        return
        
    multiclass_classif_scorer = MulticlassModelScorer(
        modeling_params,
        clf,
        out_folder,
        pred_df,
        probas_df,
        target,
        target_map,
        valid=None,  # Not dumping on disk predicted_df
        test_df_index=None,  # Not dumping on disk predicted_df
        sample_weight=sample_weight,
        ignore_num_classes=ignore_num_classes,
        assertions=assertions)
    multiclass_classif_scorer.score(with_assertions=True)


def run_regression_scoring(clf, modeling_params, pred_df, target, sample_weight, out_folder, assertions=None):
    if pred_df.shape[0] == 0:
        return

    regression_scorer = RegressionModelScorer(modeling_params,
                                              clf,
                                              pred_df,
                                              target,
                                              out_folder,
                                              valid=None,  # Not dumping on disk predicted_df
                                              input_df_index=None,  # Not dumping on disk predicted_df
                                              sample_weight=sample_weight,
                                              assertions=assertions)
    regression_scorer.score(with_assertions=True)


# computing output metrics (the one-line-in-a-dataset version)
def compute_metrics_df(prediction_type, inv_map, modeling_params, output_df, recipe_desc, y, input_df, sample_weight=None):
    """
    output_df : 
    y : 
    input_df : the unprocessed input data, for the custom scoring
    sample_weight : 
    
    returns: a dataframe of a line of metrics
    """
    nonan = output_df[pd.notnull(output_df["prediction"])]
    preds = nonan["prediction"]
    if prediction_type in [constants.BINARY_CLASSIFICATION, constants.MULTICLASS]:
        preds.replace(inv_map, inplace=True)
        if recipe_desc["outputProbabilities"]:
            sorted_classes = sorted(inv_map.keys(), key=lambda label: inv_map[label])
            probas = nonan[["proba_%s" % label for label in sorted_classes]].values
        else:
            probas = None
    logger.info("Computing metrics")

    # compute metrics
    if prediction_type == constants.BINARY_CLASSIFICATION:
        computed_metrics = compute_binary_classification_metrics(modeling_params, y, preds, probas, sample_weight, input_df)
    elif prediction_type == constants.MULTICLASS:
        computed_metrics = compute_multiclass_metrics(modeling_params, y.astype(int), preds, probas, sample_weight, input_df)
    elif prediction_type == constants.REGRESSION:
        computed_metrics = compute_regression_metrics(modeling_params, y, preds, sample_weight, input_df)
    else:
        raise ValueError("Evaluation not supported for %s" % prediction_type)
    logger.info("Metrics computed : ")
    logger.info(computed_metrics)
    metrics_df = pd.concat([pd.DataFrame.from_dict({'date': [dt.datetime.now()]}),
                            pd.DataFrame.from_dict(
                                {a: [computed_metrics.get(a, None)] for a in recipe_desc["metrics"]})], axis=1)
    return metrics_df

# Note: some of this could (should ?) be factored with the classical model scoring
def compute_regression_metrics(modeling_params, valid_y, preds, sample_weight=None, unprocessed=None):
    metrics = {}

    metrics["evs"] = explained_variance_score(valid_y, preds, sample_weight=sample_weight)
    metrics["mape"] = mean_absolute_percentage_error(valid_y, preds, sample_weight=sample_weight)
    metrics["mae"] = mean_absolute_error(valid_y, preds, sample_weight=sample_weight)
    metrics["mse"] = mean_squared_error(valid_y, preds, sample_weight=sample_weight)
    metrics["rmse"] = sqrt(metrics["mse"])
    metrics["rmsle"] = rmsle_score(valid_y, preds, sample_weight=sample_weight)
    metrics["r2"] = r2_score(valid_y, preds, sample_weight=sample_weight)
    metrics["pearson"] = pearson_correlation(valid_y, preds, sample_weight=sample_weight)

    if modeling_params["metrics"]["evaluationMetric"] == "CUSTOM":
        custom_scorefunc = get_custom_scorefunc(modeling_params["metrics"], unprocessed)
        metrics["customScore"] = custom_scorefunc(valid_y, preds, sample_weight=sample_weight)

    return metrics


def compute_binary_classification_metrics(modeling_params, valid_y, preds, probas=None, sample_weight=None, unprocessed=None):
    metrics = {}

    if modeling_params["metrics"]["evaluationMetric"] == "CUSTOM":
        custom_scorefunc = get_custom_scorefunc(modeling_params["metrics"], unprocessed)
        if modeling_params["metrics"]["customEvaluationMetricNeedsProba"]:
            metrics["customScore"] = custom_scorefunc(valid_y, probas, sample_weight=sample_weight)
        else:
            metrics["customScore"] = custom_scorefunc(valid_y, preds, sample_weight=sample_weight)

    metrics["precision"] = precision_score(valid_y, preds, sample_weight=sample_weight)
    metrics["recall"] = recall_score(valid_y, preds, sample_weight=sample_weight)
    metrics["f1"] = f1_score(valid_y, preds, sample_weight=sample_weight)
    metrics["accuracy"] = accuracy_score(valid_y, preds, sample_weight=sample_weight)
    metrics["mcc"] = matthews_corrcoef(valid_y, preds, sample_weight=sample_weight)
    metrics["hammingLoss"] = hamming_loss(valid_y, preds, sample_weight=sample_weight)
    metrics["costMatrixGain"] = make_cost_matrix_score(modeling_params["metrics"])(valid_y, preds, sample_weight=sample_weight) / valid_y.shape[0]
    if probas is not None:
        metrics["auc"] = mroc_auc_score(valid_y, probas, sample_weight=sample_weight)
        metrics["logLoss"] = log_loss(valid_y, probas, sample_weight=sample_weight)
        metrics["lift"] = make_lift_score(modeling_params["metrics"])(valid_y, probas, sample_weight=sample_weight)
        metrics["calibrationLoss"] = mcalibration_loss(valid_y, probas)
    return metrics


def compute_multiclass_metrics(modeling_params, valid_y, preds, probas=None, sample_weight=None, unprocessed=None):
    metrics = {}

    if modeling_params["metrics"]["evaluationMetric"] == "CUSTOM":
        custom_scorefunc = get_custom_scorefunc(modeling_params["metrics"], unprocessed)
        if modeling_params["metrics"]["customEvaluationMetricNeedsProba"]:
            metrics["customScore"] = custom_scorefunc(valid_y, probas, sample_weight=sample_weight)
        else:
            metrics["customScore"] = custom_scorefunc(valid_y, preds, sample_weight=sample_weight)

    metrics["precision"] = precision_score(valid_y, preds, average='macro', pos_label=None, sample_weight=sample_weight)
    metrics["recall"] = recall_score(valid_y, preds, average='macro', pos_label=None, sample_weight=sample_weight)
    metrics["f1"] = f1_score(valid_y, preds, average='macro', pos_label=None, sample_weight=sample_weight)
    metrics["accuracy"] = accuracy_score(valid_y, preds, sample_weight=sample_weight)
    metrics["hammingLoss"] = hamming_loss(valid_y, preds, sample_weight=sample_weight)

    if probas is not None:
        metrics["mrocAUC"] = mroc_auc_score(valid_y, probas, sample_weight=sample_weight)
        metrics["mcalibrationLoss"] = mcalibration_loss(valid_y, probas, sample_weight=sample_weight)
        try:
            metrics["logLoss"] = log_loss(valid_y, probas, sample_weight=sample_weight)
        except:
            # log loss only possible if all classes found, not always the case ...
            pass

    return metrics

# extra columns added based on prediction+labels
def add_evaluation_columns(prediction_type, pred_df, y, outputs, target_mapping):
    if prediction_type == constants.REGRESSION:
        logger.info("PRED_DF = %s" % (pred_df.shape,))
        logger.info("Y = %s" % (y.shape,))

        if "error" in outputs:
            pred_df["error"] = pred_df["prediction"] - y
        if "error_decile" in outputs:
            pred_df["error_decile"] = pd.cut(pred_df["prediction"] - y, 10, labels=xrange(0, 10), retbins=True)[0]
        if "abs_error_decile" in outputs:
            pred_df["abs_error_decile"] = pd.cut((pred_df["prediction"] - y).abs(), 10, labels=xrange(0, 10), retbins=True)[0]
        if "relative_error" in outputs:
            pred_df["relative_error"] = (pred_df["prediction"] - y) / y
            pred_df["relative_error"] = pred_df["relative_error"].replace({np.inf: np.nan, -np.inf: np.nan})
    elif prediction_type in [constants.BINARY_CLASSIFICATION, constants.MULTICLASS]:
        logger.info("PRED_DF = %s" % (pred_df.shape,))
        logger.info("Y = %s" % (y.shape,))
        if "prediction_correct" in outputs:
            pred_df["prediction_correct"] = pred_df["prediction"].map(target_mapping) == y
    return pred_df

