# coding: utf-8
from __future__ import unicode_literals
from dataiku.doctor.diagnostics import diagnostics
from dataiku.doctor.diagnostics.diagnostics import DiagnosticType


OUTLIERS_MIN_RATIO_THRESHOLD = 0.1


def check_outliers_parameters(dataset_size, outliers_min_n):
    """ See in the documentation machine-learning/diagnostics.html#modeling-parameters """
    if outliers_min_n / float(dataset_size) > OUTLIERS_MIN_RATIO_THRESHOLD:
        msg = "Outliers detection: The mini-cluster size threshold ({0:d}) may be too high with respect to the training dataset " \
              "size ({2:d}). Training might fail. Consider using a smaller value.".format(
            outliers_min_n,
            "of the order of" if outliers_min_n < dataset_size else "higher than",
            dataset_size)
        diagnostics.add_or_update(DiagnosticType.ML_DIAGNOSTICS_MODELING_PARAMETERS, msg)