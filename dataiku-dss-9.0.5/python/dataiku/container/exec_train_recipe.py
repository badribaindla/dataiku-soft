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

if __name__ == "__main__":
    setup_log()
    read_dku_env_and_set()
    execution = read_execution()
    execution_id = execution['id']

    # Pre-create train_info.json
    if not os.path.isfile('train_info.json'):
        with open('train_info.json', 'w') as fd:
            json.dump({}, fd)

    # thread that pushes the model states to the backend
    stopping = False

    def send_model_updates():
        delay = 2

        while not stopping:
            sleep(delay)
            send_file(execution_id, 'train_info.json')
            delay = min(delay * 1.02, 60)
    t = Thread(target=send_model_updates)
    t.start()

    def post_train_callback():
        global stopping, t, execution_id
        stopping = True
        t.join()
        send_files(execution_id, ['*'], 'results.tgz')

    with ErrorMonitoringWrapper(final_callback=post_train_callback):
        load_libs()
        logging.info("Launching doctor main")
        if execution['type'] == 'RECIPE_PREDICTION_TRAIN_PYTHON':
            from dataiku.doctor.prediction.reg_train_recipe import main
            desc = json.loads(execution['payload'])
            main('.', 'selection', desc['operationMode'])
        elif execution['type'] == 'RECIPE_CLUSTERING_TRAIN_PYTHON':
            from dataiku.doctor.clustering.reg_train_recipe import main
            main('.')
        else:
            raise Exception("Unsupported trainng recipe type: %s" % execution['type'])


