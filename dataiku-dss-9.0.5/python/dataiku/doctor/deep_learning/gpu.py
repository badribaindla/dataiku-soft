# WARNING : Not to be imported directly in exposed file (e.g. commands, prediction_entrypoints...) because import
# libraries (such as Tensorflow) that are not available in regular doctor. Should be imported locally when required
# inside function definitions
import os
import tensorflow as tf
from keras.backend.tensorflow_backend import set_session
from dataiku.base import remoterun

def load_gpu_options(gpu_list, per_process_gpu_memory_fraction=1, allow_growth=False):

    gpu_options = {}
    if isinstance(gpu_list, int):
        gpu_list = [gpu_list]

    gpu_list_str = ", ".join(map(str, gpu_list))
    gpu_options["gpu_list"] = gpu_list
    gpu_options["n_gpu"] = len(gpu_list)

    remoterun.set_dku_env_var_and_sys_env_var("CUDA_VISIBLE_DEVICES", gpu_list_str)
    config_tf = tf.ConfigProto()
    config_tf.gpu_options.per_process_gpu_memory_fraction = per_process_gpu_memory_fraction
    config_tf.gpu_options.allow_growth = allow_growth
    config_tf.allow_soft_placement = True
    session = tf.Session(config=config_tf)
    set_session(session)

    return gpu_options

def load_gpu_options_only_allow_growth():
    config_tf = tf.ConfigProto()
    config_tf.gpu_options.allow_growth = True
    session = tf.Session(config=config_tf)
    set_session(session)

def deactivate_gpu():
    remoterun.set_dku_env_var_and_sys_env_var("CUDA_VISIBLE_DEVICES", "-1")

def get_num_gpu_used():
    if not remoterun.get_env_var("CUDA_VISIBLE_DEVICES", False) or remoterun.get_env_var("CUDA_VISIBLE_DEVICES") == "-1":
        return 0

    else:
        return len(remoterun.get_env_var("CUDA_VISIBLE_DEVICES").split(','))
