from dataiku.runnables import Runnable, ResultTable
import os, shutil
import datetime, time

class RemoveOldExportsRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config
        
    def get_progress_target(self):
        return None

    def run(self, progress_callback):
        dip_home = os.environ['DIP_HOME']
        exports_folder = os.path.join(dip_home, 'exports')

        simulate = bool(self.config.get("simulate", False))
        
        maximum_age = int(self.config.get("age", 15))
        maximum_timestamp = int(time.mktime((datetime.datetime.now() - datetime.timedelta(days=maximum_age)).timetuple()))
        
        to_delete = []
        for export_id in os.listdir(exports_folder):
            if os.stat(os.path.join(exports_folder, export_id)).st_mtime < maximum_timestamp:
                to_delete.append(export_id)
                
        def folder_size(folder):
            total_size = 0
            for dirpath, dirnames, filenames in os.walk(folder):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    total_size += os.path.getsize(fp)
            return total_size       

        rt = ResultTable()
        rt.set_name("Removed exports")

        rt.add_column("id", "Export identifier", "STRING")
        rt.add_column("age", "Age (days)", "STRING")
        rt.add_column("size", "Size (KB)", "STRING")
            
        for export_id in to_delete:
            export_folder = os.path.join(exports_folder, export_id)
            size = folder_size(export_folder)

            mtime = os.stat(export_folder).st_mtime
            age = (time.mktime(datetime.datetime.now().timetuple()) - mtime)/86400

            if not simulate:
                shutil.rmtree(export_folder)
            
            rt.add_record([export_id, int(age), size/1024])

        return rt