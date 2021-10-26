import os
import logging

from dataiku.doctor.utils import dku_pickle
from dataiku.doctor.utils import dku_write_mode_for_pickling

logger = logging.getLogger(__name__)

CUSTOM_OBJECTS_PKL_NAME = "keras_model_custom_objects.pkl"

_custom_objects = {}

def register_object(object_name, object_val):
    logger.info("registering new custom_object: {}".format(object_name))
    _custom_objects[object_name] = object_val


def save_current_custom_objects(model_folder):
    if not os.path.isdir(model_folder):
        raise ValueError("'model_folder': {} does not exist".format(model_folder))

    if not _custom_objects:
        logger.info("No custom objects, not saving them")
        return
    else:
        logger.info("Saving custom objects: {}".format(_custom_objects.keys()))

    pkl_file_name = os.path.join(model_folder, CUSTOM_OBJECTS_PKL_NAME)
    with open(pkl_file_name, dku_write_mode_for_pickling()) as pkl_file:
        dku_pickle.dump(_custom_objects, pkl_file)

def load_custom_objects(model_folder):
    logger.info("Attempting to load custom_objects from {}".format(model_folder))
    pkl_file_name = os.path.join(model_folder, CUSTOM_OBJECTS_PKL_NAME)

    if not os.path.isfile(pkl_file_name):
        logger.info("No custom objects found, not loading them")
        return None

    else:
        with open(pkl_file_name, "rb") as pkl_file:
            custom_objects = dku_pickle.load(pkl_file)
        logger.info("Custom objects loaded: {}".format(custom_objects.keys()))
        return custom_objects
