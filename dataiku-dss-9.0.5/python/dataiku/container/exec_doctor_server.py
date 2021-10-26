# encoding: utf-8
"""
Executor for containerized execution of python doctor server that handles:
 * training
 * post-train computation (subpopulation/pdp)
"""

from threading import Thread
from time import sleep
import logging
import json
import os
import glob

from dataiku.core import dkujson
from dataiku.doctor.server import serve
from dataiku.doctor.utils import interrupt_optimization
from .runner import setup_log, read_execution, load_libs, send_files, fetch_file, fetch_dir, HOME_DIR
from dataiku.base.remoterun import read_dku_env_and_set


class SendModelsUpdateThread(Thread):
    """
        Thread to handle the update of disk files sent back to the backend while doctor server is running,
        either for training models, or running post-training computations

        Currently, the DSS backend knows the state of training by reading specific disk files (e.g
        `train_info.json` or `grid_search_scores.json`). Therefore, for containerized execution, we
        need to frequently send those files to the backend. Besides, we also need to send all
        the result files at the end of the training.

        As this thread covers a preprocessing set, which may contain several models, we need a specific
        logic to handle the case when one model is completed and others are still training.
    """

    def __init__(self, execution_id, definition):
        """
        Args:
            execution_id (str): id of the doctor training execution
            definition (dict): definition of the doctor training
        """

        self.execution_id = execution_id
        self.definition = definition

        self.models_dirs = [os.path.dirname(p) for p in glob.glob("m*/train_info.json")]
        self.models_dirs_done = []

        self.running_models_files_list = [
            "train_info.json",
            "train_diagnostics.json",
            "keras_model_training_info.json",
            "tensorboard_logs",
            "grid_search_scores.json"
        ]

        self.excluded_files_in_preprocessing_dir = [
            "train.log",  # should not be re-uploaded as it would overwrite and erase logs handled by the backend
            "splits"      # big files not related to preprocessing
        ]

        self.stopping = False
        self.preprocessing_files_sent = False

        super(SendModelsUpdateThread, self).__init__()

    def should_send_models_update(self):
        return self.definition.get("pushModelState", True)

    def stop(self):
        self.stopping = True

    def send_all_files(self):
        globs_to_send = [f for f in glob.glob("*") if f not in self.excluded_files_in_preprocessing_dir]
        self.send_files(globs_to_send)

    def send_models_files(self):
        globs_to_send = []
        for model in self.models_dirs:

            if model in self.models_dirs_done:
                continue

            # Check whether model is done or not
            train_info = dkujson.load_from_filepath(os.path.join(model, "train_info.json"))

            if train_info["state"] == "DONE":
                self.models_dirs_done.append(model)
                globs_to_send.append(model)

                if not self.preprocessing_files_sent:
                    # They need to be sent only once as all models share the same preprocessing
                    excluded_files = self.models_dirs + self.excluded_files_in_preprocessing_dir
                    globs_to_send.extend([f for f in glob.glob("*") if f not in excluded_files])
                    self.preprocessing_files_sent = True
            else:
                globs_to_send.extend([os.path.join(model, f) for f in self.running_models_files_list])

        self.send_files(globs_to_send)

    def send_files(self, globs_to_send):
        send_files(self.execution_id, globs_to_send, 'train_infos.tgz', file_kind="EXECUTION_DIR")

    def run(self):
        if not self.should_send_models_update():
            return

        delay = 2
        while (not self.stopping) and len(self.running_models_files_list) > 0:
            sleep(delay)
            self.send_models_files()
            delay = min(delay * 1.02, 60)


if __name__ == "__main__":
    setup_log()
    read_dku_env_and_set()
    execution = read_execution()
    execution_id = execution['id']
    definition = json.loads(execution['definition'])
    if definition.get("fetchContext", False):
        fetch_dir(execution_id, '', dest=HOME_DIR + '/model', file_kind="CONTEXT_DIR")

    t = SendModelsUpdateThread(execution_id=execution_id, definition=definition)
    t.start()

    def fetch_interrupt_optimization_file(interrupt_file_path):
        fetch_file(execution_id,
                   interrupt_file_path,
                   interrupt_file_path,
                   file_kind="EXECUTION_DIR")
    interrupt_optimization.set_before_interrupt_check_callback(fetch_interrupt_optimization_file)

    load_libs()
    logging.info("Launching doctor command server")
    serve(definition['port'], definition['secret'])

    t.stop()
    t.join()

    # Go one last time through all files to send them anyway:
    # * for training, send files for models that are not done
    # * for post-train computation, send files for all models that may
    #   have been created or updated
    t.send_all_files()
