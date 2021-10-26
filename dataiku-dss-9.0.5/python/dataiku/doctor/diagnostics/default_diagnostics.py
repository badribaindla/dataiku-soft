# coding: utf-8
from __future__ import unicode_literals
import logging

from dataiku.doctor.diagnostics import dataset_sanity_check, model_check, leakage, overfit
from dataiku.doctor.diagnostics import ml_assertions
from dataiku.doctor.diagnostics.diagnostics import register

logger = logging.getLogger(__name__)


def register_prediction_callbacks(core_params):
    """ Register default callbacks used for prediction """
    settings = _get_settings(core_params)
    register([dataset_sanity_check.DatasetSanityCheckDiagnostic(),
              model_check.ClassifierAccuracyCheckDiagnostic(),
              model_check.RegressionR2CheckDiagnostic(),
              leakage.LeakageDiagnostic(),
              overfit.TreeOverfitDiagnostic(),
              ml_assertions.MLAssertionsDiagnostic()],
             settings)


def register_clustering_callbacks(core_params):
    """ Register default callbacks used for clustering """
    settings = _get_settings(core_params)
    register([dataset_sanity_check.DatasetSanityCheckDiagnostic()], settings)


def _get_settings(core_params):
    if "diagnosticsSettings" not in core_params:
        logger.info("no 'diagnosticsSettings' found in core_params")
    settings = core_params.get("diagnosticsSettings", {})
    return settings

