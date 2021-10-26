from dataiku.runnables import Runnable, ResultTable
from dataikuapi import DSSClient
import os

def apply(tags, tag_set, tag_or):
    tags_in_set = [tag for tag in tags if tag in tag_set]
    if tag_or:
        return len(tags_in_set) > 0
    else:
        return len(tags_in_set) == len(tag_set)

class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config
        self.plugin_config = plugin_config
        self.client = DSSClient('http://localhost:%s' % os.environ.get('DKU_BACKEND_PORT'), internal_ticket = os.environ.get('DKU_API_TICKET'))
        
    def get_progress_target(self):
        return None
    
    def run(self, progress_callback):
        included = self.config.get('includedTags', '')
        excluded = self.config.get('excludedTags', '')
        included_or = self.config.get('includedTagsCombine', 'OR') == 'OR'
        excluded_or = self.config.get('excludedTagsCombine', 'OR') == 'OR'
        included_set = set(included.split(','))
        excluded_set = set(excluded.split(','))

        project = self.client.get_project(self.project_key)
        to_delete = []
        for dataset in project.list_datasets():
            tags = dataset.get('tags', [])
            included = apply(tags, included_set, included_or)
            excluded = apply(tags, excluded_set, excluded_or)
            if included and not excluded:
                to_delete.append(dataset)

        rt = ResultTable()
        rt.set_name("Delete datasets by tag")

        simulate = self.config.get('simulate', True)

        rt.add_column("dataset", simulate and "Dataset to delete" or "Deleted dataset", "LOCAL_DATASET_WITH_TYPE")
        if not simulate:
            rt.add_column("result", "Result", "STRING")

        if not simulate:
            for dataset in to_delete:
                try:
                    project.get_dataset(dataset.get('name')).delete(drop_data=self.config.get("drop_data", True))
                    rt.add_record(["%s:%s" % (dataset.get("type"), dataset.get("name")), "SUCCESS"])
                except Exception as e:
                    rt.add_record(["%s:%s" % (dataset.get("type"), dataset.get("name")), "FAILED: %s" % str(e)])
            return rt
        else:
            rows = []
            for dataset in to_delete:
                rt.add_record(["%s:%s" % (dataset.get("type"), dataset.get("name"))])
            return rt