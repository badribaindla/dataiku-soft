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
        exec_config = self.config["dku_container"]

        # prepare the url on which JSON metrics are published
        url = 'http://localhost:%s%s' % (ctx['metricsPort'], ctx['metricsJsonPath']) # localhost since it's the same pod
        
        # grab the property holding the image in ECR
        image_name = None
        for p in exec_config.get('properties', []):
            if 'cloudwatch.forwarder.image' == p.get('key', ''):
                image_name = p.get('value', None)
                
        if image_name is None or len(image_name) == 0:
            raise Exception("No property cloudwatch.forwarder.image found on the execution configuration to point to the sidecar image")

        # add a container if the pod
        container_list = input['spec']['template']['spec']['containers']

        sidecar = {'name':'cloudwatch-forwarder'}
        sidecar['image'] = image_name
        sidecar['env'] = []
        sidecar['env'].append({'name':'POD_ID'       , 'valueFrom':{'fieldRef':{'apiVersion':'v1', 'fieldPath':'metadata.uid'}}})
        sidecar['env'].append({'name':'POD_NAMESPACE', 'valueFrom':{'fieldRef':{'fieldPath':'metadata.namespace'}}})
        sidecar['env'].append({'name':'POD_NAME'     , 'valueFrom':{'fieldRef':{'fieldPath':'metadata.name'}}})
        sidecar['env'].append({'name':'METRICS_URL'  , 'value': url})
        sidecar['resources'] = {'limits':{'cpu':'200m', 'memory':'100Mi'}, 'requests':{'cpu':'200m', 'memory':'100Mi'}}
        container_list.append(sidecar)

        # send back the updated spec as JSON
        return json.dumps(input)
