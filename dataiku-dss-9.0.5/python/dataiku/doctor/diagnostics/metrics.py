# coding: utf-8
from __future__ import unicode_literals
from dataiku.doctor import constants


def get_model_perf_metric_value(prediction_type, perf_data, metric):
    if prediction_type == constants.BINARY_CLASSIFICATION:
        return get_model_perf_metric_value_binary_classification(perf_data, metric)
    return perf_data["metrics"].get(metric)


def get_model_perf_metric_value_binary_classification(perf_data, metric):
    # Treshold independent metric
    if metric in perf_data.get("tiMetrics", {}):
        return perf_data["tiMetrics"][metric]

    # Threshold dependent metric
    per_cut_data = perf_data.get("perCutData", {})
    if metric not in per_cut_data:
        return None

    threshold = perf_data["usedThreshold"]
    threshold_index = per_cut_data["cut"].index(threshold)
    return per_cut_data[metric][threshold_index]
