from dataiku.runnables import Runnable
import dataiku
from dataiku import Dataset
import os, re
from dataiku.core import intercom

def get_connection(connection_name, connections):
    connection = connections.get(connection_name, None)
    if connection is None:
        connection = {'datasets':[], 'notebooks':[], 'no':len(connections)}
        connections[connection_name] = connection
    return connection

class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config
        self.plugin_config = plugin_config
        self.client = dataiku.api_client()

    def get_progress_target(self):
        return (len(Dataset.list(project_key=self.project_key)), 'NONE')

    def run(self, progress_callback):
        project = self.client.get_project(self.project_key)
        done = 0
        connections = {}
        for dataset_name in Dataset.list(project_key=self.project_key):
            d = project.get_dataset(dataset_name)
            connection_name = d.get_definition().get('params', {}).get('connection', None)
            if connection_name is not None:
                connection = get_connection(connection_name, connections)

                size = None
                records = None
                dataset_metrics = d.get_last_metric_values()
                try:
                    size = int(dataset_metrics.get_global_value('basic:SIZE'))
                except:
                    pass
                try:
                    records = int(dataset_metrics.get_global_value('records:COUNT_RECORDS'))
                except:
                    pass
                connection['datasets'].append({'name':dataset_name,'size':size,'records':records})
            done += 1
            progress_callback(done)

        sql_notebooks = intercom.backend_json_call("sql-notebooks/list/", data={"projectKey": self.project_key})
        for sql_notebook in sql_notebooks:
            connection_name = sql_notebook.get('connection', None)
            if connection_name is not None:
                m = re.search('@virtual\(([^\)]+)\):(.*)', connection_name)
                if m is not None:
                    connection_name = 'Hive database %s' % m.group(2)
                connection = get_connection(connection_name, connections)

                connection['notebooks'].append(sql_notebook)

        connection_sections = []
        for connection_name in connections:
            connection = connections[connection_name]
            connection_datasets = connection['datasets']
            connection_notebooks = connection['notebooks']
            connection_no = connection['no']

            dataset_sections = []
            total_size = 0
            total_records = 0
            expansion_var = 'expanded.c%s' % connection_no
            for d in connection_datasets:
                size = d['size']
                records = d['records']
                total_size += size if size is not None else 0
                total_records += records if records is not None else 0
                size = size if size is not None else "-"
                records = records if records is not None else "-"

                dataset_sections.append('<tr ng-show="%s"><td>%s</td><td></td><td>%s</td><td>%s</td></tr>' % (expansion_var, d['name'], size, records))

            for d in connection_notebooks:
                dataset_sections.append('<tr ng-show="%s"><td>%s</td><td></td><td></td><td></td></tr>' % (expansion_var, d['name']))

            expansion_switch = 'ng-init="%s=false;" ng-click="%s = !%s;"' % (expansion_var, expansion_var, expansion_var)
            expansion_icon = "{'icon-chevron-down' : %s, 'icon-chevron-right' : !%s}" % (expansion_var, expansion_var)
            connection_header = '<tr %s><th><div style="width: 25px; display: inline-block;"><i ng-class="%s"></i></div>%s</th><th>%i / %i</th><th>%i</th><th>%i</th></tr>' % (expansion_switch, expansion_icon, connection_name, len(connection_datasets), len(connection_notebooks), total_size, total_records)
            connection_sections.append('%s%s' % (connection_header, ''.join(dataset_sections)))

        table_header = '<tr><th>Name</th><th>Datasets / Notebooks</th><th>Size</th><th>Records</th></tr>'
        return '<table class="table table-striped" ng-init="expanded={};">%s%s</table>' % (table_header, ''.join(connection_sections))
