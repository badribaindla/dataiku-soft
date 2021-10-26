import dataiku
from dataiku.runnables import Runnable, ResultTable

def add_dataset(dataset, rt, all_projects):
    record = []
    if all_projects:
        record.append("%s:%s.%s" % (dataset.get("type"), dataset.get("projectKey"), dataset.get("name")))
    else:
        record.append("%s:%s" % (dataset.get("type"), dataset.get("name")))

    dp = dataset.get("params", {})

    if dp.get("table", None) is not None:
        record.append(dp["table"])
    else:
        record.append(None)
    if dp.get("schema", None) is not None:
        record.append(dp["schema"])
    else:
        record.append(None)

    record.append(dataset.get("tags", []))

    rt.add_record(record)

class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config
        self.plugin_config = plugin_config
        self.client = dataiku.api_client()
        self.all_projects = self.config.get("all_projects", False) == True

    def get_progress_target(self):
        return None

    def run_for_project(self, rt, project):
        for dataset in project.list_datasets():
            if dataset.get("params", {}).get("connection", {}) == self.config.get("connection", "??"):
                add_dataset(dataset, rt, self.all_projects)

    def run(self, progress_callback):
        rt = ResultTable()
        rt.set_name("List datasets on connection")

        if self.all_projects:
            rt.add_column("dataset", "Dataset", "FQ_DATASET_WITH_TYPE")
        else:
            rt.add_column("dataset", "Dataset", "LOCAL_DATASET_WITH_TYPE")

        rt.add_column("table", "Table (SQL only)", "STRING")
        rt.add_column("schema", "Schema (SQL only)", "STRING")
        rt.add_column("tags", "Tags", "STRING_LIST")

        if self.config.get("all_projects", False) == True:
            for project_key in self.client.list_project_keys():
                project = self.client.get_project(project_key)
                self.run_for_project(rt, project)
        else:
            project = self.client.get_project(self.project_key)
            self.run_for_project(rt, project)
        return rt