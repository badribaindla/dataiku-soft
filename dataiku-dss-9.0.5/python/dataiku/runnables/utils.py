import os, os.path as osp, json, logging, time, string, re
from random import SystemRandom
import requests
import dataikuapi

def json_dumpf(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=4)


def json_loadf(path):
    with open(path, "r") as f:
        return json.load(f)

def generate_secure_random_string(N):
    cryptogen = SystemRandom()
    return ''.join(cryptogen.choice(string.ascii_uppercase + string.digits) for _ in range(N))

def get_or_create_admin_api_key(macro_id, runner_auth_info):
    key_created_by = "macro-%s-for-%s" % (macro_id, runner_auth_info["authIdentifier"])

    auth_file_path = osp.join(os.getenv("DIP_HOME"), "config", "public-apikeys.json")

    keys = json_loadf(auth_file_path)

    for key in keys:
        if key.get("createdBy", None) == key_created_by:
            return key["key"]

    logging.info("Creating an admin key for use by macro: %s" % key_created_by)

    key = {
        'id': generate_secure_random_string(16),
        "key" : generate_secure_random_string(32),
        "label" : "Admin key generated for run of macro %s by %s" % (macro_id, runner_auth_info["authIdentifier"]),
        "createdOn" : int(round(time.time() * 1000)),
        "createdBy" : key_created_by,
        "globalPermissions": {
            "admin": True
        }
    }
    keys.append(key)

    json_dumpf(auth_file_path, keys)

    # Invalidate config cache for modified file
    port = int(os.environ["DKU_BACKEND_PORT"])
    try:
        http_res = requests.request("POST", "http://127.0.0.1:%s/dip/publicapi/admin/invalidate-config-common-files-cache" % port)
        http_res.raise_for_status()
    except:
        logging.warning("Cache invalidation failed, DSS backend not running? If it is running, you should restart DSS")

    return key["key"]

def get_admin_dss_client(macro_id, runner_auth_info):
    key = get_or_create_admin_api_key(macro_id, runner_auth_info)
    port = int(os.environ["DKU_BACKEND_PORT"])
    client = dataikuapi.DSSClient("http://127.0.0.1:%s" % port, key)
    return client

def make_unique_project_key(admin_client, base_name):
    base_project_key = base_name.upper()
    base_project_key = re.sub(r'[^A-Z0-9]+', '_', base_project_key)
        
    existing_keys = admin_client.list_project_keys()
    project_key = base_project_key
    i = 0
    while True:
        if project_key in existing_keys:
            i = i+1
            project_key = "%s_%d" % (base_project_key , i)
        else:
            break

    return project_key