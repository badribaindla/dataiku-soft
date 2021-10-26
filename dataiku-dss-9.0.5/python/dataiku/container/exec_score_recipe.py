# encoding: utf-8
"""
Executor for containerized execution of python training recipe.
"""

from threading import Thread
from time import sleep
import logging, json, os, sys

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
        logging.info("Launching doctor main")
        if execution['type'] == 'RECIPE_PREDICTION_SCORE_PYTHON':
            from dataiku.doctor.prediction.reg_scoring_recipe import main
            names = json.loads(execution['payload'])
            main('model', names['inputDatasetSmartName'], names['outputDatasetSmartName'],
                dkujson.load_from_filepath('work/desc.json'),
                dkujson.load_from_filepath('work/script.json'),
                dkujson.load_from_filepath('work/preparation_output_schema.json'),
                dkujson.load_from_filepath('work/conditional_outputs.json')
            )
        elif execution['type'] == 'RECIPE_PREDICTION_SCORE_KERAS':
            from dataiku.doctor.prediction.keras_scoring_recipe import main
            names = json.loads(execution['payload'])
            main('model', names['inputDatasetSmartName'], names['outputDatasetSmartName'],
                dkujson.load_from_filepath('work/desc.json'),
                dkujson.load_from_filepath('work/script.json'),
                dkujson.load_from_filepath('work/preparation_output_schema.json'),
                dkujson.load_from_filepath('work/conditional_outputs.json')
            )
        elif execution['type'] == 'RECIPE_CLUSTERING_SCORE_PYTHON':
            from dataiku.doctor.clustering.reg_scoring_recipe import main
            names = json.loads(execution['payload'])
            main('model', names['inputDatasetSmartName'], names['outputDatasetSmartName'],
                dkujson.load_from_filepath('work/desc.json'),
                dkujson.load_from_filepath('work/script.json'),
                dkujson.load_from_filepath('work/preparation_output_schema.json')
            )
        else:
            raise Exception("Unsupported trainng recipe type: %s" % execution['type'])

