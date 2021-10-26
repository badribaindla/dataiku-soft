from dataiku.core.dkujson import dump_to_filepath
from os import path as osp
import logging

from dataiku.doctor import constants
from .clustering.clustering_fit import *
from .clustering.clustering_scorer import *

import dataiku.core.pandasutils as pdu

import inspect
import numpy as np
import pandas as pd
from dataiku.core import dkujson
from dataiku.doctor.utils import dku_pickle
from dataiku.doctor.utils import dku_write_mode_for_pickling


# This is used both by the recipes and by the doctor
def clustering_train_score_save(transformed_src, src_index,
                                preprocessing_params,
                                modeling_params,
                                run_folder,
                                listener, pipeline):
    """Trains one model and saves results to run_folder"""

    with listener.push_step(constants.ProcessingStep.STEP_FITTING):
        (clf, actual_params, cluster_labels, additional_columns) = clustering_fit(modeling_params, transformed_src)

    with listener.push_step(constants.ProcessingStep.STEP_SAVING):
        with open(osp.join(run_folder, "clusterer.pkl"), dku_write_mode_for_pickling()) as f:
            dku_pickle.dump(clf, f)
        dkujson.dump_to_filepath(osp.join(run_folder, "actual_params.json"), actual_params)

    with listener.push_step(constants.ProcessingStep.STEP_SCORING):
        ClusteringModelScorer(clf, transformed_src, src_index, cluster_labels, preprocessing_params, modeling_params,
                              pipeline, run_folder).score()