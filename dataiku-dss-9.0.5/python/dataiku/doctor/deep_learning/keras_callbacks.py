import json
import os
from os import path as osp

from dataiku.core import dkujson
from dataiku.doctor import constants
from dataiku.doctor.deep_learning import keras_model_io_utils
from dataiku.doctor.deep_learning.shared_variables import set_variable
from dataiku.doctor.prediction import get_grid_scorers, compute_otimized_threshold, greater_is_better
from dataiku.doctor.deep_learning.keras_support import build_scored_validation_data, get_scored_from_y_and_pred
from dataiku.doctor.prediction.metric import METRICS_NAMES
from dataiku.doctor.utils import unix_time_millis, interrupt_optimization

import numpy as np
import pandas as pd

##############################################################
# KERAS CALLBACKS
##############################################################

# Defining the callback class inside a function in order to execute the required import from Keras only if
# necessary (as the keras_utils script is imported in scripts that do not always run on Keras aware environments)


def _tensorboard_callback(run_folder, modeling_params):
    from keras.callbacks import TensorBoard

    return TensorBoard(log_dir=run_folder+'/tensorboard_logs', histogram_freq=0, batch_size=32, write_graph=True,
                       write_grads=False, write_images=False, embeddings_freq=0,
                       embeddings_layer_names=None, embeddings_metadata=None)


def get_base_callbacks(run_folder, modeling_params, validation_sequence, prediction_type, test_df_index,
                       target_map=None, save_model=True, use_multi_gpus=False, base_model=None):
    base_callbacks = [
        _compute_perf_and_save_best_model_callback(run_folder, modeling_params,
                                                   validation_sequence, prediction_type, test_df_index, target_map,
                                                   save_model, use_multi_gpus, base_model),
        _interrupt_callback(run_folder),
        _tensorboard_callback(run_folder, modeling_params),
        _monitor_epochs_callback(run_folder, modeling_params)
    ]
    return base_callbacks


def _compute_perf_and_save_best_model_callback(run_folder, modeling_params, validation_sequence,
                                               prediction_type, test_df_index, target_map, save_model=True,
                                               use_multi_gpus=False, base_model=None):
    from keras.callbacks import Callback
    import tensorflow as tf
    from keras import backend as K

    class ComputePerfAndSaveBestModelCallBack(Callback):

        def __init__(self, run_folder, modeling_params, validation_sequence, prediction_type,
                     test_df_index, target_map, use_multi_gpus, base_model):
            self.run_folder = run_folder
            self.modeling_params = modeling_params
            self.validation_sequence = validation_sequence
            self.prediction_type = prediction_type
            self.test_df_index = test_df_index
            self.target_map = target_map
            self.use_multi_gpus = use_multi_gpus
            self.base_model = base_model

            self.epoch_start = None
            self.all_scorers = get_grid_scorers(self.modeling_params, self.prediction_type, self.target_map,
                                                custom_make_scorer=self._scorer_func)
            self.model_best_score = None

            # Share the name of metric used to optimize model
            # The user can then retrieve it to write his own callback for example
            self.evaluation_metric = self.modeling_params['metrics']['evaluationMetric']
            set_variable("DKU_MODEL_METRIC",
                         "Test {}".format(METRICS_NAMES[self.evaluation_metric]))
            set_variable("DKU_MODEL_METRIC_GREATER_IS_BETTER",
                         greater_is_better(self.evaluation_metric,
                                           self.modeling_params["metrics"].get("customEvaluationMetricGIB", True)))

            # Initialize model info
            self.model_training_info = {
                "startedAt": unix_time_millis(),
                "epochs": [],
                'metric': modeling_params["metrics"]["evaluationMetric"],
            }

            self.train_info_handler = DLModelTrainingInfoHandler(self.run_folder)

            # We want to compute the metrics on the training data as well. To do it in a Keras way
            # we retrieve, after each batch, the value of y and y_pred for this batch for the model at this
            # stage of the training, accumulate them and then compute the score and all the values retrieved during the
            # epoch. This means that it does not correspond exactly to the score on the training
            # data with a fixed model at the end of an epoch, but to the score of an evolving model.
            # Those values are stored in TensorFlow Variable in the model so we need to tell TensorFlow that we want to
            # to retrieve them

            # Variables to accumulate values of y and y_pred after each batch
            self.y_list = None
            self.y_pred_list = None

            # TensorFlow Variables that are placeholders for values of y and y_pred
            self.var_y = tf.Variable(0., validate_shape=False)
            self.var_y_pred = tf.Variable(0., validate_shape=False)

        # Reuse logic of Grid Search scorer of Regular Python backend in order to leverage the list of
        # metrics available from the front-end
        def _scorer_func(self, score_func, needs_proba=False, greater_is_better=True, **kwargs):
            sign = 1 if greater_is_better else -1

            def score(y, y_pred, probas):
                if needs_proba:
                    return sign * score_func(y, probas, **kwargs)
                else:
                    return sign * score_func(y, y_pred, **kwargs)

            return score

        def _optimize_threshold(self, valid_y, probas, preds):
            # Optimize threshold for Binary Classification if required
            if self.prediction_type == constants.BINARY_CLASSIFICATION:

                optimize_threshold = self.modeling_params["autoOptimizeThreshold"]

                if optimize_threshold:
                    best_cut = compute_otimized_threshold(valid_y, probas, self.modeling_params['metrics'])
                    probas_one = pd.Series(data=probas[:, 1])
                    preds = (probas_one > best_cut).astype(np.int)

            return preds

        def _compute_scores(self):

            # While scoring, update number of steps done so far to fill epoch progress graph
            def on_step_end(step):
                self.model_training_info["currentNumStepsScoring"] += 1
                if step % 10 == 0 or step == (self.model_training_info["nbStepsScoringPerEpoch"] - 1):
                    self._update_model_training_info()

            y_train = np.concatenate(self.y_list)
            y_pred_train = np.concatenate(self.y_pred_list)
            preds_train, probas_train, valid_y_train_np = get_scored_from_y_and_pred(y_train, y_pred_train,
                                                                                     self.prediction_type,
                                                                                     self.modeling_params)
            valid_y_train = pd.Series(valid_y_train_np)
            preds_train = self._optimize_threshold(valid_y_train, probas_train, preds_train)

            # For test set we enforce to test on the all the data, because we cannot retrieve potential
            # validation_steps
            preds_test, probas_test, valid_y_test = build_scored_validation_data(self.model, self.prediction_type,
                                                                                 self.modeling_params,
                                                                                 self.validation_sequence,
                                                                                 on_step_end_func=on_step_end)

            preds_test = self._optimize_threshold(valid_y_test, probas_test, preds_test)

            return {
               "test": {k: np.float64(v(valid_y_test, preds_test, probas_test)) for k, v in self.all_scorers.items()},
               "train": {k: np.float64(v(valid_y_train, preds_train, probas_train)) for k, v in self.all_scorers.items()}
            }

        def _update_epoch_graph(self, train_score, test_score, epoch):
            epoch_finish_time = unix_time_millis()

            new_point = {
                'time': epoch_finish_time - self.epoch_start,
                'index': epoch + 1,
                'trainScore': train_score,
                'testScore': test_score,
                "epoch": epoch
            }
            self.model_training_info['epochs'].append(new_point)
            self._update_model_training_info(force=True)

        def _update_model_training_info(self, force=False):
            self.train_info_handler.update_info(self.model_training_info, force=force)

        def _save_model(self):
            if not self.use_multi_gpus:
                keras_model_io_utils.save_model(self.model, osp.join(run_folder, constants.KERAS_MODEL_FILENAME))
            else:
                keras_model_io_utils.save_model(self.base_model, osp.join(run_folder, constants.KERAS_MODEL_FILENAME))

        def _get_model_architecture(self):
            if not self.use_multi_gpus:
                return json.dumps(self.model.to_json())
            else:
                return json.dumps(self.base_model.to_json())

        def on_train_begin(self, logs=None):
            self.modeling_params['keras']['epochs'] = self.params["epochs"]
            self.model_training_info["nbStepsTrainingPerEpoch"] = self.params["steps"]
            self.model_training_info["nbStepsScoringPerEpoch"] = len(self.validation_sequence)
            self.model_training_info["architecture"] = self._get_model_architecture()
            self.model_training_info["nbEpochs"] = self.params["epochs"]

            # Telling TensorFlow which variables to retrieve after training each batch.
            # This needs to be done after compilation of the model and after the call the
            # the function _make_train_function which actually builds `model.train_function`
            # which is called at the beginning of fit_generator
            fetches = [tf.assign(self.var_y, self.model.targets[0], validate_shape=False),
                       tf.assign(self.var_y_pred, self.model.outputs[0], validate_shape=False)]
            self.model.train_function.fetches = fetches

        def on_epoch_begin(self, epoch, logs=None):
            self.epoch_start = unix_time_millis()
            self.model_training_info["currentNumStepsTraining"] = 0
            self.model_training_info["currentNumStepsScoring"] = 0
            self.model_training_info["currentEpoch"] = epoch
            self._update_model_training_info(force=True)

            # Reinitialize the accumulators of y and y_pred at the beginning of each epoch.
            self.y_list = []
            self.y_pred_list = []

        def on_batch_end(self, batch, logs=None):
            self.model_training_info["currentNumStepsTraining"] += 1
            self._update_model_training_info()

            # Evaluate the variables and save them into the accumulators.
            self.y_list.append(K.eval(self.var_y))
            self.y_pred_list.append(K.eval(self.var_y_pred))

        def on_epoch_end(self, epoch, logs=None):
            # if test data is present:
            if len(self.test_df_index):
                # First compute metric
                scores = self._compute_scores()
                logs.update({"Train {}".format(METRICS_NAMES[k]): v for k, v in scores["train"].items()})
                logs.update({"Test {}".format(METRICS_NAMES[k]): v for k, v in scores["test"].items()})
                test_score = scores["test"][self.modeling_params['metrics']['evaluationMetric']]
                train_score = scores["train"][self.modeling_params['metrics']['evaluationMetric']]

                # Then update the epoch_graph
                self._update_epoch_graph(train_score, test_score, epoch)

                # Finally, save the model if best one (always max, sign is taken into account in the scorer)
                better_model = ((epoch == 0) or test_score > self.model_best_score)
                if better_model:
                    self.model_best_score = test_score
            else:
                # No test data, every successive epoch metric is better than previous one
                better_model = True
            if save_model and better_model:
                self._save_model()

    return ComputePerfAndSaveBestModelCallBack(run_folder, modeling_params, validation_sequence,
                                               prediction_type, test_df_index, target_map, use_multi_gpus, base_model)


def _interrupt_callback(run_folder):
    from keras.callbacks import Callback

    class InterruptCallback(Callback):

        def __init__(self, run_folder):
            interrupt_optimization.set_interrupt_folder(run_folder)

        def on_epoch_end(self, epoch, logs=None):
            if interrupt_optimization.must_interrupt():
                self.model.stop_training = True

    return InterruptCallback(run_folder)

def _monitor_epochs_callback(run_folder, modeling_params):

    from keras.callbacks import Callback

    class MonitorEpochsCallback(Callback):

        def __init__(self, run_folder, modeling_params):
            self.run_folder = run_folder
            self.modeling_params = modeling_params
            self.last_finished_epoch = -1
            self.train_info_handler = DLModelTrainingInfoHandler(self.run_folder)

        def on_epoch_end(self, epoch, logs=None):
            self.last_finished_epoch = epoch

        def on_train_end(self, logs=None):
            nb_epochs = self.last_finished_epoch + 1
            self.modeling_params['keras']['epochs'] = nb_epochs
            model_info = self.train_info_handler.get_info()
            model_info["nbEpochs"] = nb_epochs
            self.train_info_handler.update_info(model_info, force=True)

    return MonitorEpochsCallback(run_folder, modeling_params)


class DLModelTrainingInfoHandler:
    """
    Handles the update of model information file on disk, to inform the front-end on the progress of the training
    """

    def __init__(self, folder, info_filename="keras_model_training_info", delay=2):

        self.folder = folder
        self.delay = delay
        self.info_filename = info_filename

        self.last_updated = unix_time_millis()

    def should_update(self):

        curr_time = unix_time_millis()
        if (curr_time - self.last_updated) > self.delay * 1000:
            self.last_updated = curr_time
            return True

        return False

    def update_info(self, new_info, force=False):
        if force or self.should_update():
            info_file_path_tmp = osp.join(self.folder, "{}.json.tmp".format(self.info_filename))
            info_file_path = osp.join(self.folder, "{}.json".format(self.info_filename))
            dkujson.dump_to_filepath(info_file_path_tmp, new_info)
            os.rename(info_file_path_tmp, info_file_path)

    def get_info(self):
        info_filepath = osp.join(self.folder, "{}.json".format(self.info_filename))
        return dkujson.load_from_filepath(info_filepath)

