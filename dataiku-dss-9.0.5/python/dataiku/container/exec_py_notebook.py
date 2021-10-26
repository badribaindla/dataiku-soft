# encoding: utf-8
"""
Executor for containerized execution of python notebook (same as recipe atm).
"""

import sys

from dataiku.base.utils import exec_wrapped
from .runner import setup_log, load_libs

if __name__ == "__main__":
    setup_log()
    with open("dku_code.py", 'r') as fd:
        code = fd.read()
    load_libs()
    if not exec_wrapped(code):
        # Signal to runner that we got an error, not already sent to the backend
        sys.exit(1)