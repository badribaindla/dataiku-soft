import os, json

def get_step_config():
    """Returns a map of the step parameters.
    Parameters are defined in step.json (see inline doc in this file)
    and set by the user in the step in DSS' GUI"""
    return json.loads(os.getenv("DKU_PLUGIN_STEP_CONFIG"))

def get_plugin_config():
    """Returns the global settings of the plugin"""
    return json.loads(os.getenv("DKU_PLUGIN_CONFIG"))

def get_step_resource():
    """Returns the path to the folder holding the plugin resources"""
    return os.getenv("DKU_CUSTOM_RESOURCE_FOLDER")
