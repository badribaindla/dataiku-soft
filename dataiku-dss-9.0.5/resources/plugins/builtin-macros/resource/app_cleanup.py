import dataiku
import json

def do(payload):
    if payload.get('parameterName', None) == 'appId':
        choices = [{'value':None, 'label':'All'}, {'value':'__ORPHANS__', 'label':'Orphaned instances'}]
        for app in dataiku.api_client().list_apps():
            choices.append({'value':app['appId'], 'label':app.get('label', app['appId'])})
        return {'choices':choices}
    else:
        raise Exception("Unexpected payload")