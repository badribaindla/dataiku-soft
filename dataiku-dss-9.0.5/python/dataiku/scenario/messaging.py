
import os.path as osp, os, shutil
import json
from dataiku.core.intercom import backend_json_call


class ScenarioMessageSender():
    """
    Sends report messages directly from a Python scenario
    """

    def __init__(self, channel_id, type, **kwargs):
        self.type = type
        self.channel_params = {'channelId' : channel_id}
        self.channel_params.update(kwargs)

    def set_params(self, **kwargs):
        self.channel_params.update(kwargs)
        assert(self.channel_params is not None)

    def send(self, additional_variables={}, **kwargs):
        final_params = self.channel_params.copy()
        final_params.update(kwargs)

        project_key = os.environ.get("DKU_CURRENT_PROJECT_KEY", None)

        data = {
            "projectKey": project_key,
            "messaging" : json.dumps({
                "type" : self.type,
                "configuration" : final_params,
            }),
            "variables" : json.dumps(additional_variables)
        }
        return backend_json_call("scenarios/send-message", data)
