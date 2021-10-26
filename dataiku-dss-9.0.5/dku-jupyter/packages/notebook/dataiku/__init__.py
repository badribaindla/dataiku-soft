import requests, json, os

def _get_error_message(err_data):
    json_err = json.loads(err_data)
    if "detailedMessage" in json_err:
        return json_err["detailedMessage"]
    if "message" in json_err:
        return json_err["message"]
    return "No details"

def pintercom_json_post(path, data, file = None):
    with open('%s/run/shared-secret.txt' % os.getenv("DIP_HOME"), 'r') as fp:
        secret = fp.read()
        secret = secret.strip()
    port = os.getenv('DKU_BACKEND_PORT')
    if file:
        resp = requests.post(
            "http://127.0.0.1:%s/dip/api/pintercom/%s" % (port, path), data,
            headers = {"X-DKU-IPythonSharedSecret": secret},
            files = dict(notebook = file))
    else:
        resp = requests.post(
            "http://127.0.0.1:%s/dip/api/pintercom/%s" % (port, path), data,
            headers = {"X-DKU-IPythonSharedSecret": secret})
    if resp.status_code==200 or resp.status_code == 204:
        if len(resp.text) > 0:
            return json.loads(resp.text)
        else:
            return None
    else:
        err_data = resp.text
        if err_data:
            raise Exception("Failed privileged call (%s): %s" % (path, _get_error_message(err_data).encode("utf8")))
        else:
            raise Exception("Failed privileged call (%s): %s" % (path, "No details"))

def tintercom_json_post(path, ticket, data):
    port = os.getenv('DKU_BACKEND_PORT')
    resp = requests.post(
        "http://127.0.0.1:%s/dip/api/tintercom/%s" % (port, path), data,
        headers = {"X-DKU-APITicket": ticket})
    if resp.status_code==200 or resp.status_code == 204:
        return json.loads(resp.text)
    else:
        err_data = resp.text
        if err_data:
            raise Exception("Failed privileged call (%s): %s" % (path, _get_error_message(err_data).encode("utf8")))
        else:
            raise Exception("Failed privileged call (%s): %s" % (path, "No details"))

cached_session = requests.Session()

def authinfo_json_post(headers_dict):
    port = os.getenv('DKU_BACKEND_PORT')
    resp = cached_session.post(
        "http://127.0.0.1:%s/dip/publicapi/auth/info-from-browser-headers" % (port),
        data=json.dumps(headers_dict),
        params={"callOrigin" : "jupyter-server"})

    if resp.status_code==200 or resp.status_code == 204:
        return json.loads(resp.text)
    else:
        err_data = resp.text
        if err_data:
            raise Exception("Failed auth-info call: %s" % (_get_error_message(err_data).encode("utf8")))
        else:
            raise Exception("Failed auth-info call: %s" % ("No details"))