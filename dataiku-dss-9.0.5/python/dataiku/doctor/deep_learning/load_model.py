import os
import dataiku
from dataiku.doctor import constants
from dataiku.base import remoterun
from dataiku.doctor.deep_learning import keras_model_io_utils


def get_keras_model_from_trained_model(session_id=None, analysis_id=None, mltask_id=None):
    model_location = get_keras_model_location_from_trained_model(session_id, analysis_id, mltask_id)
    return keras_model_io_utils.load_model(model_location)

def get_keras_model_location_from_trained_model(session_id=None, analysis_id=None, mltask_id=None):
    analysis_id = _get_variable_value(analysis_id, "analysis_id", constants.DKU_CURRENT_ANALYSIS_ID)
    mltask_id = _get_variable_value(mltask_id, "mltask_id", constants.DKU_CURRENT_MLTASK_ID)

    # Retrieve info on location of model
    project_key = remoterun.get_env_var("DKU_CURRENT_PROJECT_KEY")
    mltask = dataiku.api_client().get_project(project_key).get_ml_task(analysis_id, mltask_id)
    mltask_status = mltask.get_status()

    # Check good backend
    if mltask_status["headSessionTask"]["backendType"] != "KERAS":
        raise ValueError("The mltask you are accessing was not a Keras model")

    # We assume here that there is only one model per session, i.e. session_id are unique
    # in mltask_status["fullModelIds"], which is the case for KERAS backend
    sessions = [p["fullModelId"]["sessionId"] for p in mltask_status["fullModelIds"]]
    if session_id is None:
        last_session = sorted([int(sess_id_str[1:]) for sess_id_str in sessions])[-1]
        session_id = "s{}".format(last_session)
    try:
        session_index = sessions.index(session_id)
    except ValueError as e:
        raise ValueError("The 'session_id' you are providing cannot be found in the mltask. "
                         "Available session_ids are: {}".format(sessions))

    session = mltask_status["fullModelIds"][session_index]["fullModelId"]

    dip_home = dataiku.core.base.get_dip_home()
    model_folder = os.path.join(dip_home, "analysis-data", project_key, analysis_id, mltask_id, "sessions",
                                session["sessionId"], session["preprocessingId"], session["modelId"])

    model_location = keras_model_io_utils.safe_model_location(os.path.join(model_folder, constants.KERAS_MODEL_FILENAME))

    if not os.path.isfile(model_location):
        raise ValueError("No model found for this mltask. Did it run without errors ?")

    return model_location

def get_keras_model_from_saved_model(saved_model_id):
    model_location = get_keras_model_location_from_saved_model(saved_model_id)
    return keras_model_io_utils.load_model(model_location)

def get_keras_model_location_from_saved_model(saved_model_id):
    project_key = remoterun.get_env_var("DKU_CURRENT_PROJECT_KEY")
    active_model_version = dataiku.api_client().get_project(project_key)\
                                               .get_saved_model(saved_model_id)\
                                               .get_active_version()

    dip_home = dataiku.core.base.get_dip_home()
    model_folder = os.path.join(dip_home, "saved_models", project_key, saved_model_id, "versions",
                                active_model_version["id"])
    model_location = keras_model_io_utils.safe_model_location(os.path.join(model_folder, constants.KERAS_MODEL_FILENAME))

    if not os.path.isfile(model_location):
        raise ValueError("No model found for this saved model.")

    return model_location


def _get_variable_value(variable, variable_name, os_variable_name):
    if variable is None:

        if not remoterun.get_env_var(os_variable_name, False):
            raise ValueError("You must provide an '{}' argument".format(variable_name))
        else:
            return remoterun.get_env_var(os_variable_name)

    return variable