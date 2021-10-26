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
from dataiku.doctor.clustering.reg_cluster_recipe import main

if __name__ == "__main__":
    setup_log()
    read_dku_env_and_set()
    execution = read_execution()
    execution_id = execution['id']

    with ErrorMonitoringWrapper():
        load_libs()
        logging.info("Launching doctor main")
        params = json.loads(execution['payload'])
        main('.', params['outputDatasetSmartName'], params['keptInputColumns'])
