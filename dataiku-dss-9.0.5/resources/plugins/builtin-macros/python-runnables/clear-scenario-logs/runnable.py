from dataiku.runnables import Runnable
import os
import datetime
import time

from cleaning import  delete_and_report

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
            self.project_keys = [project_key for project_key in os.listdir(os.path.join(self.dip_home, 'scenarios'))]
        else:
            self.project_keys = [self.project_key]

        self.to_delete = []
        for project_key in self.project_keys:
            project_scenarios_folder = os.path.join(self.dip_home, 'scenarios', project_key)   
            try:
                for scenario_name in os.listdir(project_scenarios_folder):
                    scenario_folder = os.path.join(self.dip_home, 'scenarios', project_key, scenario_name)   
                    try:
                        for run_id in os.listdir(scenario_folder):
                            try:
                                if os.stat(os.path.join(scenario_folder, run_id)).st_mtime < self.maximum_timestamp:
                                    self.to_delete.append([project_key, scenario_name, run_id])
                            except:
                                # Can fail if a dir entry is removed while enumerating. No log to remove then.
                                pass

                    except:
                        # Can fail if scenario is removed while running. No log to remove then.
                        pass
            except:
                # Can fail if project is removed while running. No log to remove then.
                pass
            
        html = delete_and_report(self.to_delete, os.path.join(self.dip_home, 'scenarios'), progress_callback, self.perform_deletion, 'scenario runs', ['Project', 'Scenario', 'Run'])
        return html
