
import os.path as osp, os, shutil
import json
from dataiku.core.intercom import backend_json_call
import logging

class BuildState():
    """
    Handle to get information about previous builds
    """

    def __init__(self):
        pass

    def get_model_last_build(self, model_id, project_key=None):
        """
        Get informations about the last build of the model and returns a map of:
        - projectKey and id : the identifier of the model
        - jobProjectKey and jobId : the identifier of the job that built the model
        - buildEndTime : timestamp of when the build finished
        - buildSuccess : final status of the build
        """ 
        data = {
            "objectId" : model_id
        }
        if project_key is not None:
            data["projectKey"] = project_key

        return backend_json_call("scenarios/get-object-last-build", data)


    def get_folder_last_build(self, folder_id, project_key=None):
        """
        Get informations about the last build of the folder and returns a map of:
        - projectKey and id : the identifier of the folder
        - jobProjectKey and jobId : the identifier of the job that built the folder
        - buildEndTime : timestamp of when the build finished
        - buildSuccess : final status of the build
        """ 
        data = {
            "objectId" : folder_id
        }
        if project_key is not None:
            data["projectKey"] = project_key

        return backend_json_call("scenarios/get-object-last-build", data)


    def get_dataset_last_build(self, dataset_name, project_key=None):
        """
        Get informations about the last build of the dataset and returns a map of:
        - projectKey and id : the identifier of the dataset
        - jobProjectKey and jobId : the identifier of the job that built the dataset
        - buildEndTime : timestamp of when the build finished
        - buildSuccess : final status of the build
        """ 
        data = {
            "objectId" : dataset_name
        }
        if project_key is not None:
            data["projectKey"] = project_key

        return backend_json_call("scenarios/get-object-last-build", data)              
