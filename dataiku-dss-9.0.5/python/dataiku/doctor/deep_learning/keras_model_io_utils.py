import sys
import os

from dataiku.doctor.deep_learning import custom_objects_handler

def save_model(model, model_location):
    model_folder = os.path.dirname(model_location)
    custom_objects_handler.save_current_custom_objects(model_folder)
    model.save(safe_model_location(model_location), overwrite=True)


def load_model(model_location):
    from keras.models import load_model as keras_load_model
    model_folder = os.path.dirname(model_location)
    custom_objects = custom_objects_handler.load_custom_objects(model_folder)
    return keras_load_model(safe_model_location(model_location), custom_objects=custom_objects)


# From Keras 2.2.3, it is mandatory to pass a 'str' to save and load_model
# otherwise, it fails. For python 2, we may have some unicode that needs to
# be converted
def safe_model_location(model_location):
    if sys.version_info < (3, 0) and isinstance(model_location, unicode):
        return model_location.encode("utf-8")
    else:
        return model_location
