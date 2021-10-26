import dataiku
from dataiku.runnables import Runnable
from dataikuapi.utils import DataikuException
from datetime import datetime as dt
from dataiku.base.utils import safe_unicode_str

class MyRunnable(Runnable):
    """The base interface for a Python runnable"""

    def __init__(self, project_key, config, plugin_config):
        """
        :param project_key: the project in which the runnable executes
        :param config: the dict of the configuration of the object
        :param plugin_config: contains the plugin settings
        """
        self.config = config
        self.perform_deletion = self.config.get("perform_deletion", False)
        if not config.get('model_id'):
            raise ValueError('No model was selected.')
        self.model = dataiku.api_client().get_project(project_key).get_saved_model(config.get('model_id'))
        if not config.get('keep_versions') >= 1:
            raise ValueError('Invalid number of versions to keep was selected, minimum 1.')        

    def get_progress_target(self):
        return (100, 'NONE')

    def run(self, progress_callback):
        """
        This method first identifies which versions will be deleted and which will remain.
        It builds a summary of the actions for the user.
        If perform_deletion param is set to True, the versions in version_to_delete will be deleted.
        """
        keep_versions = int(self.config.get('keep_versions')) - 1
        versions = self.model.list_versions()

        # Sorting between versions listed in dry runs and actual deletion is guaranteed to be stable.
        # See docs https://docs.python.org/3/howto/sorting.html#sort-stability-and-complex-sorts
        # See docstring under to_numeric explaining why this is required.        
        versions = sorted(versions, key=lambda k: to_numeric(k['id']), reverse=True)

        active_versions = [v for v in versions if v['active']]
        inactive_versions = [v for v in versions if not v['active']]
        versions_to_keep = active_versions + inactive_versions[:keep_versions]
        versions_to_delete = [v for v in inactive_versions if v not in versions_to_keep]

        html = "<h4>Summary</h4>"
        html += "<span>{}</span><br>".format(summarise(active_versions, 'active'))
        html += "<span>{}</span><br>".format(summarise(inactive_versions, 'inactive'))
        html += "<span>{}</span><br>".format(summarise(versions_to_keep, 'to keep'))
        html += "<span>{}</span><br>".format(summarise(versions_to_delete, 'to delete'))

        if self.perform_deletion==True:            
            try:
                ids_to_delete = [v['id'] for v in versions_to_delete]
                self.model.delete_versions(ids_to_delete)
                html += "<span><strong>{} Models deleted according to summary</strong></span>".format(len(versions_to_delete))
            except DataikuException as e:
                html += '<span>An error occurred while trying to delete versions.</span><br>'
                html += u'<span>{}</span>'.format(safe_unicode_str(e))
        return html

def to_date(version):
    if version['id']=='initial':
        return 'initial'
    else:
        return dt.utcfromtimestamp(to_numeric(version['id'])/1000).strftime("%Y-%m-%d %H:%M:%S")

def summarise(versions, action):
    if len(versions)==0:
        text = "0 versions {}".format(action)
    elif len(versions)==1:
        version = versions[0]
        ts_formatted = to_date(version)
        text = "1 version {}: {} ({})".format(action, version['id'], ts_formatted)
    else:
        version_start, version_end = versions[0], versions[-1]
        version_start_formatted, version_end_formatted = to_date(version_start), to_date(version_end)
        text = "{} versions {} ({} - {})".format(len(versions), action, version_start_formatted, version_end_formatted)
    return text
    
def to_numeric(version):
    """
    Extract the timestamp from the model version id, making ready for sorting by age.
    This is required due to multiple saved model version id formats in existance depending on how the model was deployed.
    initial: given to first deployment
    unix timestamp: given when a model is deployed from analysis to flow.
    unix timestamp with alphanumeric suffix: given when models are retrained in flow
    """
    if version=='initial':
        return 0
    else:
        return int(version.split('_')[0])
