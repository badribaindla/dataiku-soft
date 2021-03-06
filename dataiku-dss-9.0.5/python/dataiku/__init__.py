import warnings
warnings.filterwarnings("ignore", message="numpy.dtype size changed")
warnings.filterwarnings("ignore", message="numpy.ufunc size changed")
warnings.filterwarnings("ignore", message="The oldnumeric module")
warnings.filterwarnings("ignore", message="using a non-integer number")


import json
import csv
from .base import remoterun
from .core.dataset import Dataset, _dataset_writer_atexit_handler
from .core.schema_handling import get_schema_from_df

from .core.intercom import set_remote_dss

from .core import default_project_key
from .core.sql import SQLExecutor, SQLExecutor2, HiveExecutor, ImpalaExecutor
from .core.pig import PigExecutor
from .core.managed_folder import Folder, _folder_writer_atexit_handler
from .core.model_evaluation_store import ModelEvaluationStore
from .core.saved_model import Model
from .core.streaming_endpoint import StreamingEndpoint
from .core.message_sender import MessageSender
from .core.metrics import ComputedMetrics, MetricDataPoint, ComputedChecks, CheckDataPoint
from .core.connection import get_connection
from .core.intercom import jek_or_backend_json_call, WebappImpersonationContext
from .core.plugin import use_plugin_libs, import_from_plugin
from .core.project import Project
from .core import intercom

try:
    from .core import pandasutils
except:
    pass

import pkg_resources
pkg_resources.declare_namespace(__name__)

def in_ipython():
    try:
        __IPYTHON__
    except NameError:
        return False
    else:
        return True

try:
    if in_ipython():
        import pandas as pd
        # set display settings.
        pd.set_option('display.max_rows', 210)
        pd.set_option('display.max_columns', 210)
        pd.set_option('display.width', 8000)
except:
    pass

csv.field_size_limit(500 * 1024 * 1024)  # up to 500 MB.

# DEPRECATED: The recommended way is to call get_flow_variables()
if remoterun.has_env_var("DKUFLOW_VARIABLES"):
    dku_flow_variables = json.loads(remoterun.get_env_var("DKUFLOW_VARIABLES"))

# This variable is only set once and is not updated when overriding project variables via the API
# DEPRECATED: The recommended way is to call get_custom_variables()
if remoterun.has_env_var("DKU_CUSTOM_VARIABLES"):
    dku_custom_variables = json.loads(remoterun.get_env_var("DKU_CUSTOM_VARIABLES"))

dss_settings = None
def get_dss_settings():
    """Returns the general settings of DSS (version, enabled features)"""
    global dss_settings
    if dss_settings is None:
        dss_settings = jek_or_backend_json_call("get-dss-settings")
    return dss_settings

def set_default_project_key(project_key):
    remoterun.set_dku_env_var_and_sys_env_var("DKU_CURRENT_PROJECT_KEY", project_key)

def get_flow_variables():
    """
    Get a dictionary of flow variables for a project.

    :return: a dictionary with local variables.
    """
    if remoterun.has_env_var("DKUFLOW_VARIABLES"):
        return json.loads(remoterun.get_env_var("DKUFLOW_VARIABLES"))
    else:
        return None

def get_custom_variables(project_key=None, typed=False):
    """
    Get a dictionary of resolved variables for a project.

    :param str project_key: the project key
    :param bool typed: if True, the variable values will be typed in the returned dict
    :return: a dictionary with standard and local variables merged (resolved)
    """
    return jek_or_backend_json_call("variables/get-resolved-for-project", data = {
        "projectKey" : default_project_key() if project_key is None else project_key,
        "typed" : "true" if typed == True else "false"
    })

def api_client():
    """Obtain an API client to request the API of this DSS instance"""
    return intercom.new_api_client()
            
__all__ = ["Dataset", "default_project_key", "set_remote_dss", "get_schema_from_df", "pandasutils", "dku_flow_variables","_dataset_writer_atexit_handler", "_folder_writer_atexit_handler"]
