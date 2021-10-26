# encoding: utf-8
"""
Executor for containerized execution of python training recipe.
"""

from threading import Thread
from time import sleep
import logging, json, os, sys
import os.path as osp

from .runner import setup_log, read_execution, load_libs, send_file, send_files
from dataiku.base.remoterun import read_dku_env_and_set
from dataiku.base.utils import ErrorMonitoringWrapper
from dataiku.core import dkujson

if __name__ == "__main__":
    setup_log()
    read_dku_env_and_set()
    execution = read_execution()
    execution_id = execution['id']

    with ErrorMonitoringWrapper():
        load_libs()

        names = json.loads(execution['payload'])
        remote_evaluation_store_folder = names.get('evaluationStoreFolder', '')
        if len(remote_evaluation_store_folder) > 0:
            run_folder = osp.abspath(remote_evaluation_store_folder)
            mes_folder = osp.dirname(run_folder)
            run_id = osp.basename(run_folder)
            mes_id = osp.basename(mes_folder)
            evaluation_store_folder = osp.join('.', 'evaluation_store', mes_id, run_id)
        else:
            evaluation_store_folder = None
            
        logging.info("Launching doctor main")
        if execution['type'] == 'RECIPE_PREDICTION_EVAL_PYTHON':
            from dataiku.doctor.prediction.reg_evaluation_recipe import main
            main('model', names['inputDatasetSmartName'],
                names['outputDatasetSmartName'], names['metricsDatasetSmartName'],
                dkujson.load_from_filepath('work/desc.json'),
                dkujson.load_from_filepath('work/script.json'),
                dkujson.load_from_filepath('work/preparation_output_schema.json'),
                dkujson.load_from_filepath('work/conditional_outputs.json'),
                evaluation_store_folder
            )
        elif execution["type"] == "RECIPE_PREDICTION_EVAL_KERAS":
            from dataiku.doctor.prediction.keras_evaluation_recipe import main
            main('model', names['inputDatasetSmartName'],
                names['outputDatasetSmartName'], names['metricsDatasetSmartName'],
                dkujson.load_from_filepath('work/desc.json'),
                dkujson.load_from_filepath('work/script.json'),
                dkujson.load_from_filepath('work/preparation_output_schema.json'),
                dkujson.load_from_filepath('work/conditional_outputs.json'),
                evaluation_store_folder
            )
        else:
            raise Exception("Unsupported eval recipe type: %s" % execution['type'])
        
        if evaluation_store_folder is not None:
            send_files(execution_id, [osp.join(evaluation_store_folder, '*')], file_kind='MODEL_EVALUATION_STORE_RUN', archive_root=evaluation_store_folder)
        