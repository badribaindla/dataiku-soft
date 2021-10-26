from dataiku.base import remoterun


def get_ml_plugin_resource(plugin_id):
    """See get_connector_resource() in the custom dataset API."""
    return remoterun.get_env_var("DKU_CUSTOM_ML_RESOURCE_FOLDER_{}".format(plugin_id))
