from dataiku.runnables import Runnable
import dataiku, json
import os, shutil, os.path as osp
import datetime, time

class RCreateConf(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config

    def get_progress_target(self):
        return (100, 'NONE')

    def run(self, progress_callback):
        client = dataiku.api_client()

        config_file = osp.expanduser("~/.dataiku/config.json")
        if osp.isfile(config_file) and not self.config["forceIfConfigExists"]:
            raise Exception("Configuration file already exists, and 'force' not requested, bailing out")

        config = {
            "dss_instances" : {}
        }
        if osp.isfile(config_file):
            with open(config_file) as f:
                config = json.load(f)

        personal_key = client.create_personal_api_key("Key for R dev setup integration")

        instance = {
            "url": "http://localhost:%s" % (os.environ["DKU_BACKEND_PORT"]),
            "api_key" : personal_key["key"]
        }

        slug_of_dip_home = "_".join(os.environ["DIP_HOME"].split("/")[1:])
        instance_name = "dss-local-devsetup-%s" % slug_of_dip_home

        config["dss_instances"][instance_name] = instance
        config["default_instance"] = instance_name

        parent_dir = osp.dirname(config_file)
        if not osp.isdir(parent_dir):
            os.makedirs(parent_dir)

        with open(config_file, "w") as f:
            json.dump(config, f)