from dataiku.runnables import Runnable
import os, shutil
import datetime, time
from cleaning import delete_and_report

class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config

    def get_progress_target(self):
        return (100, 'NONE')

    def run(self, progress_callback):
        self.dip_home = os.environ['DIP_HOME']
        self.perform_deletion = self.config.get("performDeletion", False)
        self.maximum_age = int(self.config.get("age", 15))
        self.maximum_timestamp = int(time.mktime((datetime.datetime.now() - datetime.timedelta(days=self.maximum_age)).timetuple()))
        
        if self.config.get('allProjects', False):
            self.project_keys = [project_key for project_key in os.listdir(os.path.join(self.dip_home, 'streaming-logs'))]
        else:
            self.project_keys = [self.project_key]

        self.to_delete = []
        for project_key in self.project_keys:
            project_jobs_folder = os.path.join(self.dip_home, 'streaming-logs', project_key)   
            for recipe_id in os.listdir(project_jobs_folder):
                recipe_runs_folder = os.path.join(project_jobs_folder, recipe_id, 'runs')
                if not os.path.exists(recipe_runs_folder) or not os.path.isdir(recipe_runs_folder):
                    continue
                for run_id in os.listdir(recipe_runs_folder):
                    if os.stat(os.path.join(recipe_runs_folder, run_id)).st_mtime < self.maximum_timestamp:
                        self.to_delete.append([project_key, recipe_id, 'runs', run_id])
            
        html = delete_and_report(self.to_delete, os.path.join(self.dip_home, 'streaming-logs'), progress_callback, self.perform_deletion, 'streaming-logs', ['Project', 'recipe', '', 'run'])
        return html

