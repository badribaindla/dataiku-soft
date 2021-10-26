from dataiku.doctor.constants import BINARY_CLASSIFICATION
from dataiku.doctor.constants import MULTICLASS
from dataiku.doctor.constants import REGRESSION
from dataiku.doctor.diagnostics.diagnostics import DiagnosticCallback
from dataiku.doctor.diagnostics.diagnostics import DiagnosticType


class MLAssertionsDiagnostic(DiagnosticCallback):
    """ See in the documentation machine-learning/diagnostics.html#ml-assertions """

    def __init__(self):
        super(MLAssertionsDiagnostic, self).__init__(DiagnosticType.ML_DIAGNOSTICS_ML_ASSERTIONS)

    def on_scoring_end(self, model_params=None, transformed_test=None, transformed_train=None, with_sample_weight=False):
        diagnostics = []
        if model_params is not None and model_params.prediction_type is not None and model_params.perf_data is not None:
            self.check_assertions_metrics(diagnostics, self.get_assertions_metrics(model_params.prediction_type,
                                                                                   model_params.perf_data))
        return diagnostics

    def on_processing_all_kfold_end(self, folds=None, with_sample_weight=False, prediction_type=None, perf_data=None):
        diagnostics = []
        if prediction_type is not None and perf_data is not None:
            self.check_assertions_metrics(diagnostics, self.get_assertions_metrics(prediction_type, perf_data))
        return diagnostics

    @staticmethod
    def check_assertions_metrics(diagnostics, assertions_metrics):
        """
        Add diagnostics for assertions when:

        N assertions failed (when N>0)
        K assertions got 0 matching rows (when K>0)
        J assertions got matching rows but all rows were dropped (when J>0)

        :param assertions_metrics: Assertions metrics on which diagnostic should be computed
        :type assertions_metrics: List of dicts obtained with
         dataiku.doctor.preprocessing.assertions.MLAssertionMetrics.to_dict
        """
        nb_assertions_failed = 0
        nb_assertions_no_match = 0
        nb_assertions_all_dropped = 0
        for assertion_metrics in assertions_metrics:
            if assertion_metrics["nbMatchingRows"] == 0 and assertion_metrics["nbDroppedRows"] == 0:
                nb_assertions_no_match += 1
            elif 0 < assertion_metrics["nbMatchingRows"] == assertion_metrics["nbDroppedRows"]:
                nb_assertions_all_dropped += 1
            elif assertion_metrics["result"] is False:
                nb_assertions_failed += 1

        if nb_assertions_no_match > 0:
            diagnostics.append("{} assertion{} got 0 matching rows".format(
                nb_assertions_no_match, "s" if nb_assertions_no_match > 1 else ""))
        if nb_assertions_all_dropped > 0:
            diagnostics.append(
                "{} assertion{} got matching rows but all rows were dropped by the model's preprocessing".format(
                    nb_assertions_all_dropped, "s" if nb_assertions_all_dropped > 1 else "")
            )
        if nb_assertions_failed > 0:
            diagnostics.append("{} assertion{} failed".format(
                nb_assertions_failed, "s" if nb_assertions_failed > 1 else ""))

    @staticmethod
    def get_assertions_metrics(prediction_type, perf_data):
        if prediction_type == BINARY_CLASSIFICATION:
            if "assertionsMetrics" in perf_data["perCutData"]:
                index_of_used_cut = perf_data["perCutData"]['cut'].index(perf_data["usedThreshold"])
                if index_of_used_cut < len(perf_data["perCutData"]["assertionsMetrics"]):
                    return perf_data["perCutData"]["assertionsMetrics"][index_of_used_cut]["perAssertion"]
        elif prediction_type in {MULTICLASS, REGRESSION}:
            if "assertionsMetrics" in perf_data["metrics"]:
                return perf_data["metrics"]["assertionsMetrics"]["perAssertion"]
        return []
