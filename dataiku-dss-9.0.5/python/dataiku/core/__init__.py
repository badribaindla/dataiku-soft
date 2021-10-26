from dataiku.base import remoterun
import os


def default_project_key():
    if remoterun.has_env_var("DKU_CURRENT_PROJECT_KEY"):
        return remoterun.get_env_var("DKU_CURRENT_PROJECT_KEY")
    else:
        raise Exception("Default project key is not specified (no DKU_CURRENT_PROJECT_KEY in env)")


def get_resources_dir():
    # Defined in runner.py, used for Non-API containers
    resources_dir = remoterun.get_env_var("DKU_RESOURCES_DIR")
    if resources_dir is not None:
        return resources_dir

    # Local resources directory: the python process is running on the same instance than DSS
    return os.path.join(remoterun.get_env_var("DKUINSTALLDIR"), "resources")