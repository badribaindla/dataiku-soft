# encoding: utf-8
"""
Execute a clustering training recipe in PyRegular mode
Must be called in a Flow environment
"""

import sys, json, os.path as osp, logging

from dataiku.doctor.diagnostics import diagnostics, default_diagnostics
from dataiku.doctor.utils import unix_time_millis
from dataiku.doctor.clustering_entrypoints import *
from dataiku.doctor.utils.listener import ModelStatusContext
from ..utils.split import df_from_split_desc
from ..preprocessing_handler import *
from dataiku.base.remoterun import read_dku_env_and_set
from dataiku.core import dkujson

def main(exec_folder):
    start = unix_time_millis()
    listener = ProgressListener(ModelStatusContext(exec_folder, start))

    split_desc = dkujson.load_from_filepath(osp.join(exec_folder, "_esplit.json"))
    preprocessing_params = dkujson.load_from_filepath(osp.join(exec_folder, "rpreprocessing_params.json"))
    modeling_params = dkujson.load_from_filepath(osp.join(exec_folder, "rmodeling_params.json"))
    core_params = dkujson.load_from_filepath(osp.join(exec_folder, "core_params.json"))

    default_diagnostics.register_clustering_callbacks(core_params)

    with listener.push_step(constants.ProcessingStep.STEP_LOADING_SRC):
        train_df = df_from_split_desc(split_desc, "full", preprocessing_params["per_feature"])
        diagnostics.on_load_train_dataset_end(df=train_df, target_variable=None)
        logging.info("Loaded full df: shape=(%d,%d)" % train_df.shape)

    with listener.push_step(constants.ProcessingStep.STEP_COLLECTING_PREPROCESSING_DATA):
        collector = ClusteringPreprocessingDataCollector(train_df, preprocessing_params)
        collector_data = collector.build()

    preproc_handler = ClusteringPreprocessingHandler({}, preprocessing_params, exec_folder)
    preproc_handler.collector_data = collector_data
    pipeline = preproc_handler.build_preprocessing_pipeline()

    with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_SRC):
        orig_index = train_df.index.copy()
        transformed_train = pipeline.fit_and_process(train_df)
        preproc_handler.save_data()
        preproc_handler.report(pipeline)

    start_train = unix_time_millis()

    clustering_train_score_save(transformed_train,orig_index,
        preprocessing_params, modeling_params, exec_folder,  listener, pipeline)

    end = unix_time_millis()

    utils.write_done_traininfo(exec_folder, start, start_train, end, listener.to_jsonifiable())

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    read_dku_env_and_set()
    run_folder = sys.argv[1]
    main(run_folder)