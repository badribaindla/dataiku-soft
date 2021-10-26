from dataiku.runnables import Runnable
import json

class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config
        
    def get_progress_target(self):
        return None

    def run(self, progress_callback):
        # load the incoming spec, passed as JSON
        input = json.loads(self.config["input"])
        ctx = self.config["dku_context"]

        # add a container if the pod
        template = input['spec']['template']['metadata']
        annotations = template.get("annotations", {})
        template["annotations"] = annotations # create it if not there yet
        annotations['prometheus.io/scrape'] = 'true'
        annotations['prometheus.io/scheme'] = 'http'
        annotations['prometheus.io/path'] = ctx['metricsPrometheusPath']
        annotations['prometheus.io/port'] = str(ctx['metricsPort'])
            
        # send back the updated spec as JSON
        return json.dumps(input)
