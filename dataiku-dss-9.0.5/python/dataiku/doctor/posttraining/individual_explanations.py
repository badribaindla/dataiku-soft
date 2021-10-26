import logging
import os
import os.path as osp

import pandas as pd

from dataiku.base.utils import safe_unicode_str
from dataiku.core import dkujson
from dataiku.doctor.individual_explainer import DEFAULT_NB_EXPLANATIONS
from dataiku.doctor.posttraining.model_information_handler import PredictionModelInformationHandler
from dataiku.doctor.posttraining.percentage_progress import PercentageProgress

logger = logging.getLogger(__name__)

DEFAULT_SAMPLE_SIZE = 1000


def compute(job_id, split_desc, core_params, preprocessing_folder, model_folder, computation_params,
            postcompute_folder=None):
    if computation_params is None or "method" not in computation_params \
            or "low_predictions_boundary" not in computation_params \
            or "high_predictions_boundary" not in computation_params:
        raise Exception(
            "'computation_params' should contains keys 'low_predictions_boundary', "
            "'high_predictions_boundary' and 'method'")

    model_handler = PredictionModelInformationHandler(split_desc, core_params, preprocessing_folder, model_folder,
                                                      postcompute_folder)
    progress = PercentageProgress(job_id)
    prediction_type = model_handler.get_prediction_type()

    method = computation_params.get("method")
    debug_mode = computation_params.get("debug_mode", False)
    low_predictions_boundary = computation_params.get("low_predictions_boundary")
    high_predictions_boundary = computation_params.get("high_predictions_boundary")
    nb_explanations = computation_params.get("nb_explanations", DEFAULT_NB_EXPLANATIONS)
    ramdom_state = computation_params.get("random_state", 1337)
    class_to_compute = computation_params.get("class_to_compute")
    if class_to_compute is None and prediction_type == "MULTICLASS":
        raise ValueError("In multiclass classification a class should be specified to compute the explanations")

    if model_handler.use_full_df():
        testset, _ = model_handler.get_full_df()
    else:
        testset, _ = model_handler.get_test_df()

    individual_explainer = model_handler.get_explainer()

    nb_records = min(computation_params.get("sample_size", DEFAULT_SAMPLE_SIZE),
                     testset.shape[0])
    if nb_records == 0:
        raise ValueError("Can not perform computation on an empty dataset")

    individual_explainer.preload_background()
    sample = testset.sample(n=nb_records, random_state=ramdom_state)
    observations_df = individual_explainer.sample_by_predictions(sample,
                                                                 low_predictions_boundary,
                                                                 high_predictions_boundary,
                                                                 class_to_compute)

    if observations_df.empty:
        explanations = pd.DataFrame(columns=observations_df.columns)
        predictions = []
    else:
        explanations, prediction_results = individual_explainer.explain(observations_df, nb_explanations, method,
                                                                        for_class=class_to_compute,
                                                                        debug_mode=debug_mode,
                                                                        progress=progress)
        if prediction_type == "REGRESSION":
            predictions = prediction_results.predictions_s
        else:
            for_class = class_to_compute if prediction_type == "MULTICLASS" else model_handler.get_inv_map()[1]
            predictions = prediction_results.probabilities_df[u"proba_{}".format(safe_unicode_str(for_class))]

    results = {
        "explanations": explanations.to_dict(orient="list"),
        "observations": observations_df.fillna("").astype(str).to_dict(orient="list"),
        "predictions": list(predictions),
        "nbExplanations": nb_explanations,
        "nbRecords": nb_records,
        "onSample": nb_records < testset.shape[0],
        "randomState": ramdom_state,
        "lowPredictionsBoundary": low_predictions_boundary,
        "highPredictionsBoundary": high_predictions_boundary,
        "method": method
    }
    posttrain_folder = model_handler.get_output_folder()
    explanations_file_path = os.path.join(posttrain_folder, "individual_explanations.json")
    if osp.exists(explanations_file_path):
        all_results = dkujson.load_from_filepath(explanations_file_path)
    else:
        all_results = {"perClass": {}}
    all_results["perClass"][class_to_compute if class_to_compute is not None else "unique"] = results
    dkujson.dump_to_filepath(explanations_file_path, all_results)
