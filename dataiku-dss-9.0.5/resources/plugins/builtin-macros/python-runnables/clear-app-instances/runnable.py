from dataiku.runnables import Runnable
import os, json
import datetime, time
import dataiku

class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config

    def get_progress_target(self):
        return (100, 'NONE')

    def run(self, progress_callback):
        perform_deletion = self.config.get("performDeletion", False)
        maximum_age = int(self.config.get("age", 15))
        maximum_timestamp = int(time.mktime((datetime.datetime.now() - datetime.timedelta(days=maximum_age)).timetuple()))
        requested_app_id = self.config.get("appId", None)
        
        client = dataiku.api_client()
        
        if requested_app_id is None or len(requested_app_id) == 0:
            app_ids = [a['appId'] for a in client.list_apps()] + ['__ORPHANS__']
        else:
            app_ids = [requested_app_id]
        
        to_delete = []
        for app_id in app_ids:
            for project in client.get_app(app_id).list_instances():
                print(json.dumps(project, indent=2))
                last_activity = project.get('lastCommit', {}).get('time', 0)
                if last_activity < maximum_timestamp * 1000:
                    to_delete.append([app_id, project['projectKey']])
                    
        print('-'*20)
        print(json.dumps(to_delete))
        print('-'*20)

        headers = ['App', 'Instance',  ('Success' if perform_deletion else '')]
        report_rows = ['<tr>%s</tr>' % ''.join(['<th>%s</th>' % header for header in headers])]
        deleted_total = 0
        done = 0
        for app_id, project_key in to_delete:
            deletion_status = None
            try:
                if perform_deletion:
                    client.get_project(project_key).delete()
                deletion_status = 'Y' if perform_deletion else ''
            except Exception as e:
                deletion_status = str(e)
                
            deleted_total += 1
            cells = [app_id, project_key, deletion_status]
            report_rows.append('<tr>%s</tr>' % ''.join(['<td>%s</td>' % cell for cell in cells]))
            
            done += 1
            progress_callback((done * 100) / len(to_delete))
    
        if perform_deletion:
            html = '<div><div>Deleted %s instances from %i apps.</div>'  % (len(to_delete), len(app_ids))
        else:
            html = '<div><div>Will delete %s instances from %i apps.</div>'  % (len(to_delete), len(app_ids))
        
        if len(to_delete) > 0:
            html += '<table class="table table-striped">%s</table>' % (''.join(report_rows))
    
        html += "</div>"
        return html

