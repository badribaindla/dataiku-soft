import os
import requests
import json
import os.path as osp
import traceback
import threading

from dataiku.core import base
from dataiku.base import remoterun
import logging
from dataikuapi import DSSClient

_cached_location_data = None
_cached_session = None

#######################################################
# Semi-automatic handling of proxy tickets in case we
# are used in a webapp with proxy authorized
#######################################################

_in_flask = None
_in_bokeh = None
_cookie_to_ticket = {}

# thread local to record whether ticket impersonation is ON or OFF
impersonate_tickets = threading.local()
def get_impersonate_tickets():
    global impersonate_tickets
    if hasattr(impersonate_tickets, 'x'):
        return impersonate_tickets.x
    else:
        return None

# thread local to prevent recursion while proxying one ticket
getting_proxied_ticket = threading.local()
def get_getting_proxied_ticket():
    global getting_proxied_ticket
    if hasattr(getting_proxied_ticket, 'x'):
        return getting_proxied_ticket.x
    else:
        return None

# thread local to hold the current proxied ticket
proxied_ticket = threading.local()
def get_proxied_ticket():
    global proxied_ticket
    if hasattr(proxied_ticket, 'x'):
        return proxied_ticket.x
    else:
        return None


class WebappImpersonationContext(object):
    """
    Use in a `with WebappImpersonationContext():` to make all calls attempt to exchange the current
    ticket for one impersonating the current browser identity
    """
    def __init__(self):
        self.previous_impersonate = None
        self.previous_proxied_ticket = None

    def __enter__(self):
        global impersonate_tickets, proxied_ticket
        self.previous_impersonate = get_impersonate_tickets()
        impersonate_tickets.x = True
        
        # fetch the proxy ticket if possible
        self.previous_proxied_ticket = get_proxied_ticket()
        proxied_ticket.x = self._try_get_proxy_ticket()
        
    def __exit__(self, exception_type, exception_value, traceback):
        global impersonate_tickets, proxied_ticket
        impersonate_tickets.x = self.previous_impersonate
        proxied_ticket.x = self.previous_proxied_ticket

    def _try_get_proxy_ticket(self):
        global impersonate_tickets, getting_proxied_ticket
        # obey the context
        impersonate = get_impersonate_tickets()
        if impersonate == False or impersonate is None: 
            return None
        # prevent infinite recursion
        if get_getting_proxied_ticket() == True:
            return None
        getting_proxied_ticket.x = True
        try:
            return self._do_get_proxy_ticket()
        finally:
            getting_proxied_ticket.x = None

    # Helpers to obtain HTTP headers needed to proxy tickets

    def _try_get_flask_headers(self):
        global _in_flask
        if _in_flask is None or _in_flask == True:
            try:
                from flask import request as flask_request
                h = dict(flask_request.headers)
                _in_flask = True
                return h
            except:
                # no flask
                _in_flask = False # so that you don't try importing all the time
        return None

    def _try_get_bokeh_headers(self):
        global _in_bokeh
        if _in_bokeh is None or _in_bokeh == True:
            try:
                from bokeh.io import curdoc as bokeh_curdoc
                session_id = bokeh_curdoc().session_context.id
                # nota: this import will fail for a bokeh webapp not run from DSS. But it's fine
                from dataiku.webapps.run_bokeh import get_session_headers as get_bokeh_session_headers
                h = get_bokeh_session_headers(session_id)
                _in_bokeh = True
                return h
            except:
                # no bokeh
                _in_bokeh = False # so that you don't try importing all the time
        return None

    # Helpers to proxy tickets

    def _try_get_ticket_from_cookie(self, call_headers):
        global _cookie_to_ticket
        cookie = call_headers.get("Cookie", call_headers.get("cookie", None))
        if cookie is not None:
            if cookie not in _cookie_to_ticket:
                _cookie_to_ticket[cookie] = _api_client().get_ticket_from_browser_headers({"Cookie":cookie})['msg']
            return _cookie_to_ticket.get(cookie, None)
        return None
        
    def _do_get_proxy_ticket(self):
        # fetch cookies from where you find something
        call_headers = None
        if call_headers is None:
            # try flask 
            call_headers = self._try_get_flask_headers()
        if call_headers is None:
            # try bokeh
            call_headers = self._try_get_bokeh_headers()

        if call_headers is not None:
            # get DSS identity of caller (cache by cookie)
            return self._try_get_ticket_from_cookie(call_headers)
        return None

# tweaked version of the DSSClient that reacts to 
# proxy tickets dynamically
class TicketProxyingDSSClient(DSSClient):
    """
    Extends the regular DSSClient to automatically pick up the proxy ticket if there's one
    """
    def __init__(self, host, api_key=None, internal_ticket = None):
        super(TicketProxyingDSSClient, self).__init__(host, api_key, internal_ticket)
        
    def _perform_http(self, method, path, params=None, body=None, stream=False, files=None, raw_body=None):
        global proxied_ticket
        if get_proxied_ticket() is not None:
            self._session.headers.update({"X-DKU-APITicket" : proxied_ticket.x})
        try:
            return super(TicketProxyingDSSClient, self)._perform_http(method, path, params=params, body=body, stream=stream, files=files, raw_body=raw_body)
        finally:
            self._session.headers.update({"X-DKU-APITicket" : self.internal_ticket})
            
    def _perform_json_upload(self, method, path, name, f):
        global proxied_ticket
        if get_proxied_ticket() is not None:
            self._session.headers.update({"X-DKU-APITicket" : proxied_ticket.x})
        try:
            return super(TicketProxyingDSSClient, self)._perform_json_upload(method, path, name, f)
        finally:
            self._session.headers.update({"X-DKU-APITicket" : self.internal_ticket})
    

#######################################################
# Core intercom machinery
#######################################################

def set_remote_dss(url, api_key, no_check_certificate=False):
    global _cached_location_data
    _cached_location_data = {
        "has_a_jek" : False,
        "backend_url": url,
        "auth_mode": "API_KEY",
        "api_key": api_key,
        "no_check_certificate" : no_check_certificate
    }
    create_session_if_needed()

def create_session_if_needed():
    global _cached_location_data, _cached_session
    _cached_session = requests.Session()
    if _cached_location_data.get("no_check_certificate", False):
        _cached_session.verify = False

def get_location_data():
    global _cached_location_data, _cached_session
    if _cached_location_data is not None:
        create_session_if_needed()
        return _cached_location_data

    api_ticket = remoterun.get_env_var("DKU_API_TICKET", d=None)

    if api_ticket is not None:
        # We have an API ticket so we are in DSS
        _cached_location_data = {
            "auth_mode": "TICKET",
            "api_ticket": api_ticket
        }

        _cached_location_data["backend_url"] = "http://%s:%s" % \
                            (remoterun.get_env_var("DKU_BACKEND_HOST", "127.0.0.1"),
                                remoterun.get_env_var("DKU_BACKEND_PORT"))

        if os.getenv("DKU_SERVER_KIND", "BACKEND") == "BACKEND":
            _cached_location_data["has_a_jek"] = False
        else:
            _cached_location_data["has_a_jek"] = True
            from dataiku.core import flow
            # When called from a container.runner main, we don't have flow.FLOW yet
            if flow.FLOW is None:
                if os.getenv("DKU_SERVER_KIND", "JEK") == "CAK":
                    _cached_location_data["tintercom_base"] = "cak/tintercom"
                else:
                    _cached_location_data["tintercom_base"] = "kernel/tintercom"
            else:
                _cached_location_data["tintercom_base"] = flow.FLOW["tintercomAPIBase"]
            _cached_location_data["jek_url"] = "http://%s:%s" % (os.getenv("DKU_SERVER_HOST", "127.0.0.1"),
                                            int(os.getenv("DKU_SERVER_PORT")))

    else:
        # No API ticket so we are running outside of DSS, start the dance to find remote DSS authentication
        # info
        # In that order:
        #   - dataiku.set_remote_dss (has been handled at the top of this method)
        #   - Environment variables DKU_DSS_URL, DKU_API_KEY, DKU_NO_CHECK_CERTIFICATE
        #   - ~/.dataiku/config.json (with optional DKU_DEFAULT_INSTANCE environment variable to set the default instance)

        if os.getenv("DKU_DSS_URL") is not None:
            no_check_cert_env_var = os.getenv("DKU_NO_CHECK_CERTIFICATE")
            no_check_certificate = bool(no_check_cert_env_var) and no_check_cert_env_var.lower() != 'false'

            set_remote_dss(os.environ["DKU_DSS_URL"], os.environ["DKU_API_KEY"], no_check_certificate)
        else:
            config_file = osp.expanduser("~/.dataiku/config.json")
            if osp.isfile(config_file):
                with open(config_file) as f:
                    config = json.load(f)

                if os.getenv("DKU_DEFAULT_INSTANCE") is None:
                    default_instance_name = config["default_instance"]
                else:
                    default_instance_name = os.getenv("DKU_DEFAULT_INSTANCE")

                instance_details = config["dss_instances"][default_instance_name]

                set_remote_dss(instance_details["url"], instance_details["api_key"],
                                no_check_certificate = instance_details.get("no_check_certificate", False))
            else:
                raise Exception("No DSS URL or API key found from any location")

    create_session_if_needed()
    
    return _cached_location_data

def new_api_client():
    global impersonate_tickets
    backend_url = get_backend_url()
    location_data = get_location_data()

    if location_data["auth_mode"] == "API_KEY":
        return DSSClient(backend_url, api_key=location_data["api_key"])
    else:
        if get_impersonate_tickets() == True:
            return TicketProxyingDSSClient(backend_url, internal_ticket=location_data["api_ticket"])
        else:
            return DSSClient(backend_url, internal_ticket=location_data["api_ticket"])

# cached
local_api_client = None
def _api_client():
    global local_api_client, impersonate_tickets
    if local_api_client is None:
        # we want a non-ticket-proxying client
        old_impersonate_tickets = get_impersonate_tickets()
        impersonate_tickets.x = None
        try:
            local_api_client = new_api_client()
        finally:
            impersonate_tickets.x = old_impersonate_tickets
    return local_api_client    
    
def get_auth_headers():
    location_data = get_location_data()

    if location_data["auth_mode"] == "TICKET":
        headers = {"X-DKU-APITicket": location_data["api_ticket"]}
    else:
        auth = requests.auth.HTTPBasicAuth(location_data["api_key"], "")
        fake_req = requests.Request()
        auth(fake_req)
        headers = fake_req.headers

    if remoterun.has_env_var("DKU_CALL_ORIGIN"):
        headers['X-DKU-CallOrigin'] = remoterun.get_env_var("DKU_CALL_ORIGIN")

    # proxying if possible
    proxyticket = get_proxied_ticket()
    if proxyticket is not None:
        headers['X-DKU-APITicket'] = proxyticket

    return headers

def get_backend_url():
    return get_location_data()["backend_url"]

def get_jek_url():
    location_data = get_location_data()
    assert(location_data["has_a_jek"])
    return location_data["jek_url"]

def has_a_jek():
    return get_location_data()["has_a_jek"]

def backend_api_post_call(path, data, **kwargs):
    """For read-only calls that can go directly to the backend"""
    get_location_data() # Make sure _cached_session is initialized
    return _cached_session.post("%s/dip/api/tintercom/%s" % (get_backend_url(), path),
            data = data,
            headers = get_auth_headers(),
            **kwargs)

def jek_api_post_call(path, data, **kwargs):
    """For read-only calls that go directly to the jek"""
    location_data = get_location_data() # Make sure _cached_session is initialized
    return _cached_session.post("%s/%s/%s" % (get_jek_url(), location_data["tintercom_base"], path),
            data = data,
            headers = get_auth_headers(),
            **kwargs)

def backend_api_get_call(path, data, **kwargs):
    """For read-only calls that can go directly to the backend"""
    get_location_data() # Make sure _cached_session is initialized
    return _cached_session.get("%s/dip/api/tintercom/%s" % (get_backend_url(), path),
            data = data,
            headers = get_auth_headers(),
            **kwargs)

def jek_api_get_call(path, data, **kwargs):
    """For read-only calls that can go directly to the jek"""
    location_data = get_location_data() # Make sure _cached_session is initialized
    return _cached_session.get("%s/%s/%s" % (get_jek_url(), location_data["tintercom_base"], path),
            data = data,
            headers = get_auth_headers(),
            **kwargs)

def backend_api_put_call(path, data, **kwargs):
    """For read-only calls that can go directly to the backend"""
    get_location_data() # Make sure _cached_session is initialized
    return _cached_session.put("%s/dip/api/tintercom/%s" % (get_backend_url(), path),
            data = data,
            headers = get_auth_headers(),
            **kwargs)

# exposed methods for:
# * backend_... : call on the backend
# * jek_... : call on the jek only
# * jek_or_backend_... : call on the jek or backend depending on what is in the env vars
# variants:
# * ..._json_... : post request and then parse the response as json, handling errors
# * ..._get_... : get request and then parse the response as json, handling errors
# * ..._void_... : post request and then ignore the response, handling errors
# * ..._json_... : post request and then returns the raw response as stream, handling errors
# * ..._put_... : put request and then ignore the response, handling errors

def backend_json_call(path, data=None, err_msg=None, **kwargs):
    return _handle_json_resp(backend_api_post_call(path, data, **kwargs), err_msg = err_msg)

def jek_json_call(path, data=None, err_msg=None, **kwargs):
    return _handle_json_resp(jek_api_post_call(path, data, **kwargs), err_msg = err_msg)

def jek_or_backend_json_call(path, data=None, err_msg=None, **kwargs):
    if has_a_jek():
        return jek_json_call(path, data, err_msg, **kwargs)
    else:
        return backend_json_call(path, data, err_msg, **kwargs)

def backend_get_call(path, data=None, err_msg=None, **kwargs):
    return _handle_json_resp(backend_api_get_call(path, data, **kwargs), err_msg = err_msg)

def jek_get_call(path, data=None, err_msg=None, **kwargs):
    return _handle_json_resp(jek_api_get_call(path, data, **kwargs), err_msg = err_msg)

def jek_or_backend_get_call(path, data=None, err_msg=None, **kwargs):
    if has_a_jek():
        return jek_get_call(path, data, err_msg, **kwargs)
    else:
        return backend_get_call(path, data, err_msg, **kwargs)

def backend_void_call(path, data=None, err_msg=None, **kwargs):
    return _handle_void_resp(backend_api_post_call(path, data, **kwargs), err_msg = err_msg)

def jek_void_call(path, data=None, err_msg=None, **kwargs):
    return _handle_void_resp(jek_api_post_call(path, data, **kwargs), err_msg = err_msg)

def jek_or_backend_void_call(path, data=None, err_msg=None, **kwargs):
    if has_a_jek():
        return jek_void_call(path, data, err_msg, **kwargs)
    else:
        return backend_void_call(path, data, err_msg, **kwargs)
    
def backend_stream_call(path, data=None, err_msg=None, **kwargs):
    return _handle_stream_resp(backend_api_post_call(path, data, stream=True, **kwargs), err_msg = err_msg)

def jek_stream_call(path, data=None, err_msg=None, **kwargs):
    return _handle_stream_resp(jek_api_post_call(path, data, stream=True, **kwargs), err_msg = err_msg)

def jek_or_backend_stream_call(path, data=None, err_msg=None, **kwargs):
    if has_a_jek():
        return jek_stream_call(path, data, err_msg, **kwargs)
    else:
        return backend_stream_call(path, data, err_msg, **kwargs)

def backend_put_call(path, data=None, err_msg=None, **kwargs):
    return _handle_void_resp(backend_api_put_call(path, data, **kwargs), err_msg = err_msg)

# Error handling helpers

def _get_error_message(err_data):
    try:
        json_err = json.loads(err_data)
    except Exception as e:
        logging.warn("Exception was not JSON")
        json_err = {
            "message":  err_data
        }
    if "detailedMessage" in json_err:
        return json_err["detailedMessage"]
    if "message" in json_err:
        return json_err["message"]
    return "No details"

def _handle_json_resp(resp, err_msg="Call failed"):
    if resp.status_code==200 or resp.status_code == 204:
        return json.loads(resp.text)
    else:
        err_data = resp.text
        if err_data:
            raise Exception("%s: %s" % (err_msg, _get_error_message(err_data).encode("utf8")))
        else:
            raise Exception("%s: %s" % (err_msg, "No details"))

def _handle_void_resp(resp, err_msg="Call failed"):
    if resp.status_code==200 or resp.status_code == 204:
        return None
    else:
        err_data = resp.text
        if err_data:
            raise Exception("%s: %s" % (err_msg, _get_error_message(err_data).encode("utf8")))
        else:
            raise Exception("%s: %s" % (err_msg, "No details"))

def _handle_stream_resp(resp, err_msg="Call failed"):
    if resp.status_code==200:
        return resp.raw
    else:
        err_data = resp.text
        if err_data:
            raise Exception("%s: %s" % (err_msg, _get_error_message(err_data).encode("utf8")))
        else:
            raise Exception("%s: %s" % (err_msg, "No details"))
