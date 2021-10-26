# coding: utf-8
from __future__ import unicode_literals

"""
Main entry point of EDA compute engine implementation
This is a server implementing commands defined in the PythonKernelProtocol Java class
"""
import logging

import sys

from dataiku.base.socket_block_link import JavaLink
from dataiku.base.utils import watch_stdin
from dataiku.core import debugging
from dataiku.eda import builtins
from dataiku.eda.computations.computation import Computation
from dataiku.eda.computations.context import Context
from dataiku.eda.computations.immutable_data_frame import ImmutableDataFrame

logger = logging.getLogger(__name__)

class EDAProtocol(object):
    builtins.load()

    def __init__(self, link):
        self.idf = None
        self.link = link

    def _handle_load_dataset(self, dss_schema):
        self.link.send_json({"type": "WaitingForData"})
        self.idf = ImmutableDataFrame.from_csv(self.link.read_stream(), dss_schema)
        self.link.send_json({"type": "DatasetReceived"})

    def _handle_computation(self, computation_params):
        if self.idf is None:
            raise Exception("Dataset is not loaded")

        ctx = Context()
        computation = Computation.build(computation_params)
        with ctx:
            result = computation.apply_safe(self.idf, ctx)

        logger.debug(ctx.summary_table())
        self.link.send_json({"type": "ComputationResult", "result": result})

    def start(self):
        while True:
            command = self.link.read_json()
            if command["type"] == "LoadDataset":
                self._handle_load_dataset(command['schema'])
            elif command["type"] == "Compute":
                self._handle_computation(command["computation"])


def serve(port, secret):
    link = JavaLink(port, secret)
    link.connect()

    eda = EDAProtocol(link)
    try:
        eda.start()
    finally:
        link.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s')
    debugging.install_handler()

    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])
