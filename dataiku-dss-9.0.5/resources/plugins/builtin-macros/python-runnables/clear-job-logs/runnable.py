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
            self.project_keys = [project_key for project_key in os.listdir(os.path.join(self.dip_home, 'jobs'))]
        else:
            self.project_keys = [self.project_key]

        self.to_delete = []
        for project_key in self.project_keys:
            project_jobs_folder = os.path.join(self.dip_home, 'jobs', project_key)   
            for job_name in os.listdir(project_jobs_folder):
                if os.stat(os.path.join(project_jobs_folder, job_name)).st_mtime < self.maximum_timestamp:
                    self.to_delete.append([project_key, job_name])
            
        html = delete_and_report(self.to_delete, os.path.join(self.dip_home, 'jobs'), progress_callback, self.perform_deletion, 'jobs', ['Project', 'Job'])
        return html

