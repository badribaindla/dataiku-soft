import os, json

def get_trigger_config():
    """Returns a map of the trigger's parameters.
    Parameters are defined in trigger.json (see inline doc in this file)
    and set by the user in the trigger in DSS' GUI"""
    return json.loads(os.getenv("DKU_PLUGIN_TRIGGER_CONFIG"))
    
def get_plugin_config():
    """Returns the global settings of the plugin"""
    return json.loads(os.getenv("DKU_PLUGIN_CONFIG"))

def get_step_resource():
    """Returns the path to the folder holding the plugin resources"""
    return os.getenv("DKU_CUSTOM_RESOURCE_FOLDER")
