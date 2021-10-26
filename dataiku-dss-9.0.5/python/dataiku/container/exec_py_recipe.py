# encoding: utf-8
"""
Executor for containerized execution of python recipe.
"""

import sys, json, os

from dataiku.base.utils import ErrorMonitoringWrapper
from .runner import setup_log, load_libs
from dataiku.base.remoterun import read_dku_env_and_set

if __name__ == "__main__":
    setup_log()
    read_dku_env_and_set()

    with ErrorMonitoringWrapper():
        load_libs()
        with open("dku_code.py") as fd:
            exec(fd.read())