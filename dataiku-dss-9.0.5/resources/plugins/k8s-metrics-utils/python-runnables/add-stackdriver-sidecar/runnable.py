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

        # prepare the url on which prometheus metrics are published
        url = 'http://localhost:%s%s' % (ctx['metricsPort'], ctx['metricsPrometheusPath']) # localhost since it's the same pod

        # add a container if the pod
        container_list = input['spec']['template']['spec']['containers']

        sidecar = {'name':'prometheus-to-sd'}
        sidecar['image'] = 'gcr.io/google-containers/prometheus-to-sd:v0.9.2'
        sidecar['command'] = ['/monitor', '--source=:%s' % url, '--stackdriver-prefix=custom.googleapis.com', '--pod-id=$(POD_ID)', '--namespace-id=$(POD_NAMESPACE)']
        sidecar['env'] = []
        sidecar['env'].append({'name':'POD_ID',        'valueFrom':{'fieldRef':{'apiVersion':'v1', 'fieldPath':'metadata.uid'}}})
        sidecar['env'].append({'name':'POD_NAMESPACE', 'valueFrom':{'fieldRef':{'fieldPath':'metadata.namespace'}}})
        container_list.append(sidecar)

        # send back the updated spec as JSON
        return json.dumps(input)
