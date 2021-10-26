# encoding: utf-8
"""
Main entry point for containerized execution.
This will retrieve the definition of the stuff to be executed and execute it,
forking the process (in the image's code environment if necessary).
"""

import dataiku
from dataiku.base import remoterun
from dataiku.core import debugging, intercom
from dataiku.base.utils import safe_unicode_str
import sys, os, json, logging, glob, shutil, tarfile, threading, traceback, subprocess, string, random, socket
import os.path as osp
from dataiku.base.remoterun import read_dku_env_and_set
import requests

OPT_DIR = '/opt/dataiku'
HOME_DIR = '/home/dataiku'

def setup_log():
    logging.basicConfig(level=logging.DEBUG, format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s')
    debugging.install_handler()

def _api_post_call(*args, **kwargs):
    if os.getenv("DKU_SERVER_KIND", "BACKEND") == 'BACKEND':
        return intercom.backend_api_post_call(*args, **kwargs)
    else:
        return intercom.jek_api_post_call(*args, **kwargs)

def fetch_libs(execution_id, scope):
    logging.info("Fetching %s libraries" % scope)
    data = {'executionId': execution_id, 'fileKind': '%s_LIB' % scope.upper()}
    resp = _api_post_call('containers/get-file', stream=True, data=data)

    if resp.status_code == 200:
        lib_file = '%s/%s_libs.tgz' % (HOME_DIR, scope)
        with open(lib_file, 'wb') as fd:
            for chunk in resp.iter_content(chunk_size=4096):
                fd.write(chunk)
        with tarfile.open(lib_file, 'r:gz') as tar:
            tar.extractall('%s/lib/%s' % (HOME_DIR, scope))
        os.remove(lib_file)
    elif resp.status_code != 404:
        raise Exception("Error fetching %s libraries, HTTP status %d: %s" % (scope, resp.status_code, resp.text))
    else:
        logging.warning("Could not fetch %s libraries, not found" % scope)

def fetch_plugin(execution_id, plugin_id):
    logging.info("Fetching plugin %s" % plugin_id)
    data = {'executionId': execution_id, 'fileKind': 'PLUGIN', 'pluginId': plugin_id}
    resp = _api_post_call('containers/get-file', stream=True, data=data)

    if resp.status_code == 200:
        plugin_file = '%s/plugin_%s.tgz' % (HOME_DIR, plugin_id)
        with open(plugin_file, 'wb') as fd:
            for chunk in resp.iter_content(chunk_size=4096):
                fd.write(chunk)
        with tarfile.open(plugin_file, 'r:gz') as tar:
            tar.extractall('%s/plugin' % HOME_DIR)
        os.remove(plugin_file)
    elif resp.status_code != 404:
        raise Exception("Error fetching %s plugin, HTTP status %d: %s" % (plugin_id, resp.status_code, resp.text))
    else:
        logging.warning("Could not fetch %s plugin, not found" % plugin_id)

def fetch_ml_plugins(execution_id):
    logging.info("Fetching ml plugins")
    data = {'executionId': execution_id, 'fileKind': 'ML_PLUGIN'}
    resp = _api_post_call('containers/get-file', stream=True, data=data)

    if resp.status_code == 200:
        ml_plugin_file = os.path.join(HOME_DIR, 'ml-plugins-lib.tgz')
        with open(ml_plugin_file, 'wb') as fd:
            for chunk in resp.iter_content(chunk_size=4096):
                fd.write(chunk)
        with tarfile.open(ml_plugin_file, 'r:gz') as tar:
            tar.extractall(os.path.join(HOME_DIR, "ml-plugins-lib"))
        os.remove(ml_plugin_file)
    elif resp.status_code != 404:
        raise Exception("Error fetching ml plugins, HTTP status %d: %s" % (resp.status_code, resp.text))
    else:
        logging.warning("Could not fetch ml plugins, not found")

def uses_ml_plugins(execution):
    exec_payload = json.loads(execution.get("payload", "") if len(execution.get("payload", "")) > 0 else "{}")
    used_plugins = exec_payload.get("usedPlugins", None)
    return used_plugins is not None and len(used_plugins) > 0

def fetch_dir(execution_id, path, dest=None, file_kind='CONTEXT_DIR'):
    if dest is None:
        dest = path
    logging.info("Fetching dir %s into %s" % (path, dest))
    data = {'executionId': execution_id, 'fileKind': file_kind, 'path': path}
    resp = _api_post_call('containers/get-file', stream=True, data=data)

    if resp.status_code == 200:
        with open('_dku_fetch.tgz', 'wb') as fd:
            for chunk in resp.iter_content(chunk_size=4096):
                fd.write(chunk)
        with tarfile.open('_dku_fetch.tgz', 'r:gz') as tar:
            tar.extractall(dest)
        os.remove('_dku_fetch.tgz')
    elif resp.status_code != 404:
        raise Exception("Error fetching dir %s, HTTP status %d: %s" % (path, resp.status_code, resp.text))
    else:
        logging.warning("Could not fetch dir %s, not found" % path)

def fetch_file(execution_id, path, dest=None, file_kind='CONTEXT_DIR'):
    if dest is None:
        dest = path
    logging.info("Fetching file %s into %s" % (path, dest))
    data = {'executionId': execution_id, 'fileKind': file_kind, 'path': path}
    resp = _api_post_call('containers/get-file', stream=True, data=data)

    if resp.status_code == 200:
        with open('_dku_fetch_file', 'wb') as f:
            for chunk in resp.iter_content(chunk_size=4096):
                f.write(chunk)
        shutil.move('_dku_fetch_file', dest)
    elif resp.status_code != 404:
        raise Exception("Error fetching file %s, HTTP status %d: %s" % (path, resp.status_code, resp.text))
    else:
        logging.warning("Could not fetch file %s, not found" % path)

def send_files(execution_id, files, path=None, file_kind='CONTEXT_DIR', archive_root=None):
    if path is None:
        path = "_dku_send.tgz"
    logging.info("Sending %d globs to %s" % (len(files), path))
    all_files= []
    for g in files:
        all_files.extend(glob.glob(g))
    logging.info("Sending files to %s: %s" % (path, all_files))
    tmp_archive = '/tmp/_dku_send.%s.tgz' % ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(8))
    with tarfile.open(tmp_archive, 'w:gz') as tar:
        if archive_root is not None:
            # compute path from archive_root to use as name in the tar
            prefix_length = len(osp.abspath(archive_root))
            for f in all_files:
                arc_f = osp.join('.', osp.abspath(f)[prefix_length:])
                tar.add(f, arcname=arc_f)
        else:
            for f in all_files:
                tar.add(f)
    with open(tmp_archive, 'rb') as f:
        intercom.jek_or_backend_void_call('containers/put-file',
            params={'executionId': execution_id, 'fileKind': file_kind, 'path': path, 'expand': 'true'},
            files={'file':('_dku_send.tgz', f, 'application/gzip')})
    os.remove(tmp_archive)

def send_file(execution_id, file, path=None):
    if path is None:
        path = file
    logging.info("Sending %s to %s" % (file, path))
    with open(file, 'rb') as f:
        intercom.jek_or_backend_void_call('containers/put-file',
            params={'executionId': execution_id, 'fileKind': 'CONTEXT_DIR', 'path': path, 'expand': 'false'},
            files={'file':(file, f, 'application/gzip')})

def read_version():
    with open("%s/dss-version.json" % OPT_DIR, 'r') as fd:
        return json.load(fd)

# for sub processes
def read_execution():
    with open("%s/execution.json" % HOME_DIR, 'r') as fd:
        return json.load(fd)

def load_libs():
    for lib_dir in ["/lib/instance", "/plugin/python-lib"]:
        if os.path.isdir(HOME_DIR + lib_dir):
            sys.path.append(HOME_DIR + lib_dir)

    with open(osp.join(HOME_DIR, "lib", "project", "project-lib-paths.json")) as f:
        project_libs_paths = json.load(f)
    for lib_subpath in project_libs_paths["pythonPath"]:
        full_path = osp.join(HOME_DIR, "lib", "project", lib_subpath)
        logging.debug("Adding %s to Pythonpath", full_path)
        sys.path.append(full_path)

    # Loading ml plugin libs
    ml_plugins_lib_path = os.path.join(HOME_DIR, "ml-plugins-lib")
    if os.path.isdir(ml_plugins_lib_path):
        sys.path.append(ml_plugins_lib_path)

        plugins_folder = os.path.join(ml_plugins_lib_path, "dku-ml-plugins")
        if not os.path.isdir(plugins_folder):
            return

        for plugin_id in os.listdir(plugins_folder):
            # Add python-lib directly to path to be consistent with other usages of plugin
            lib_python_dir = os.path.join(plugins_folder, plugin_id, "python-lib")
            if os.path.isdir(lib_python_dir):
                sys.path.append(lib_python_dir)
            # Add resource dir to env if it exists
            resource_dir = os.path.join(plugins_folder, plugin_id, "resource")
            if os.path.isdir(resource_dir):
                remoterun.set_dku_env_var_and_sys_env_var("DKU_CUSTOM_ML_RESOURCE_FOLDER_{}".format(plugin_id),
                                                          resource_dir)

def set_env_for_r_libs():
    chunks = []

    with open(osp.join(HOME_DIR, "lib", "project", "project-lib-paths.json")) as f:
        project_libs_paths = json.load(f)
    for lib_subpath in project_libs_paths["rsrcPath"]:
        full_path = osp.join(HOME_DIR, "lib", "project", lib_subpath)
        logging.debug("Adding %s to R source path", full_path)
        chunks.append(full_path)

    for lib_dir in ["/lib/instance", "/plugin/R-lib"]:
        if os.path.isdir(HOME_DIR + lib_dir):
            chunks.append(HOME_DIR + lib_dir)

    os.environ["DKU_SOURCE_LIB_R_PATH"] = ":".join(chunks)

def run_subprocess(execution_id, command, path = 'error.json',
                   send_error_json = True, fail_if_subprocess_failed = False):
    error_code = subprocess.call(command, shell=True, stdin=subprocess.PIPE, env=dict(os.environ, LC_ALL='en_US.utf8', DKU_CONTAINER_EXEC='1'))
    return handle_subprocess_return_value(execution_id, error_code, path, send_error_json, fail_if_subprocess_failed)

def run_popen(command):
    return subprocess.Popen(command, shell=True, env=dict(os.environ, LC_ALL='en_US.utf8', DKU_CONTAINER_EXEC='1'))
    
def handle_subprocess_return_value(execution_id, error_code, path = 'error.json',
                   send_error_json = True, fail_if_subprocess_failed = False):
    if os.WIFEXITED(error_code):
        status = "exited with status"
        error_code = os.WEXITSTATUS(error_code)
    elif os.WIFSTOPPED(error_code):
        status = "stopped by signal"
        error_code = os.WSTOPSIG(error_code)
    elif os.WIFSIGNALED(error_code):
        status = "terminated by signal"
        error_code = os.WTERMSIG(error_code)
        if error_code == 9:
            # Supposedly didn't get the opportunity to send a structured error
            send_error_json = True
    else:
        status = "finished with code"
    status = "Containerized process %s %d" % (status, error_code)
    if error_code == 0:
        logging.info(status)
    else:
        logging.error(status)

    if send_error_json:
        if error_code != 0 and not os.path.isfile('error.json'):
            # Subprocess has not created an error file but I am supposed to send one, so craft it
            message = "Containerized process execution failed, return code %d" % error_code
            if error_code == 9:
                message = message + " (killed - maybe out of memory?)"
            with open("error.json", 'w') as fd: # 'w' OK because we use json.dump
                json.dump({
                    "errorType" : safe_unicode_str("SubProcessFailed"),
                    "message" : safe_unicode_str(message)
                }, fd)
        if os.path.isfile('error.json'):
            logging.info("Sending error.json to backend/JEK")
            try:
                with open('error.json', 'rb') as f:
                    intercom.jek_or_backend_void_call('containers/put-file',
                          params={'executionId': execution_id, 'fileKind': 'EXECUTION_DIR', 'path': path},
                          files={'file':('error.json', f, 'application/json')})
            except Exception as e:
                logging.error("Could not send error to backend: %s" % e)

    if error_code != 0 and fail_if_subprocess_failed:
        logging.error("Failing container because subprocess failed (code %s)" % error_code)
        sys.exit(error_code)

def run_metrics_server():
    def serve_metrics():
        command = "/opt/dataiku/bin/python -m dataiku.webapps.metrics"
        while True:
            error_code = subprocess.call(command, shell=True, env=dict(os.environ, LC_ALL='en_US.utf8', DKU_CONTAINER_EXEC='1'))
            logging.info("Metrics server returned %s" % error_code)
                    
    t = threading.Thread(target=serve_metrics)
    t.daemon = True
    t.start()

def start_nginx_for_webapp(ping_path, force_authentication, redirect_url, hide_access_token, access_token_cookie_name, project_key, web_app_id, web_app_type):
    backend_host = remoterun.get_env_var("DKU_BACKEND_HOST", "127.0.0.1")
    try:
        import socket
        backend_host = socket.gethostbyname(backend_host)
    except Exception as e:
        logging.warn('Failed to resolve backend host %s : %s' % (backend_host, str(e)))
    backend_port = remoterun.get_env_var("DKU_BACKEND_PORT")
    backend_url = 'http://%s:%s' % (backend_host, backend_port)
    nginx_conf = os.path.join(HOME_DIR, 'nginx.conf')
    
    ping_location = """
        location = %s {
          # the ping path is not authenticated (should be a safe item, like css)
          proxy_pass http://127.0.0.1:10001%s;
          proxy_next_upstream off; # Don't retry
          proxy_read_timeout 3600; # We have long queries
          error_page 502 @error502_location;
        }
""" % (ping_path, ping_path)

    if hide_access_token:
        access_token_purge = """
          set $new_cookie $http_cookie;
          if ($http_cookie ~ "^(.*)%s\s*=[^;]+;(.*)$") { # when cookie is not last
            set $new_cookie $1$2;
          }
          if ($http_cookie ~ "^(.*)%s\s*=[^;]+\s*$") { # when cookie is last
            set $new_cookie $1;
          }
          proxy_set_header Cookie $new_cookie;
""" % (access_token_cookie_name, access_token_cookie_name)
    else:
        access_token_purge = ''
    
    if force_authentication:
        # 401 handling depends on whether we were given a redirect url
        if redirect_url is not None and len(redirect_url) > 0:
            error_401_location = """
        location ^~ /redirect-login/ {
          resolver 127.0.0.1;
          proxy_pass %s;
          proxy_next_upstream off; # Don't retry
          proxy_read_timeout 3600; # We have long queries
          proxy_set_header X-DKU-projectKey %s;
          proxy_set_header X-DKU-webAppId %s;
          proxy_set_header X-DKU-webAppType %s;
          error_page 502 @error502_location;
        }

        location @error401_location {
          return 302 redirect-login/login;
        }
""" % (redirect_url, project_key, web_app_id, web_app_type)
        else:
            error_401_location = """
        location @error401_location {
          root /opt/dataiku/web;
          try_files /webapp-error-401.html /webapp-error-401.html;
          sub_filter "http://localhost:10000" $auth_studiourl;
          sub_filter_once on;
        }
"""    

        # 403 handling is fixed
        error_403_location = """
        location @error403_location {
          root /opt/dataiku/web;
          try_files /webapp-error-403.html /webapp-error-403.html;
          sub_filter "http://localhost:10000" $auth_studiourl;
          sub_filter_once on;
        }
"""
        
        # the callback for authenticating
        auth_location = """
        location = /auth_on_dss {
          resolver 127.0.0.1;
          proxy_pass %s/dip/api/webapps/check-access/%s/%s/;
          proxy_pass_request_body off;
          proxy_set_header Content-Length "";
          proxy_set_header Sec-WebSocket-Protocol "";
          proxy_set_header X-Original-URI $request_uri;
        }
""" % (backend_url, project_key, web_app_id)

        # the webapp itself
        main_location = """
        location ^~ / {
          %s
          proxy_pass http://127.0.0.1:10001/;
          proxy_next_upstream off; # Don't retry
          proxy_read_timeout 3600; # We have long queries
          auth_request /auth_on_dss;
          auth_request_set $auth_studiourl $upstream_http_x_dku_studiourl;
          error_page 502 @error502_location;
          error_page 401 @error401_location;
          error_page 403 @error403_location;
          proxy_http_version 1.1; 
          proxy_set_header Upgrade $http_upgrade; 
          proxy_set_header Connection "upgrade"; 
        }
""" % access_token_purge
    else:
        auth_location = ''
        error_401_location = ''
        error_403_location = ''
        
        main_location = """
        location ^~ / {
          %s
          proxy_pass http://127.0.0.1:10001/;
          proxy_next_upstream off; # Don't retry
          proxy_read_timeout 3600; # We have long queries
          error_page 502 @error502_location;
          proxy_http_version 1.1; 
          proxy_set_header Upgrade $http_upgrade; 
          proxy_set_header Connection "upgrade"; 
        }
""" % access_token_purge

    template = """
# This file is automatically generated.
  
error_log stderr;
pid "nginx.pid";
daemon off;
working_directory "nginx";

events {
    worker_connections 1000;
}

http {
    gzip on;
    gzip_types text/javascript application/json text/css image/svg+xml;
    client_max_body_size 0;
    large_client_header_buffers 8 64k;
    server_tokens off;

    types {
        text/html       html htm shtml;
        text/css        css;
        text/javascript js;
        text/css        less;
        audio/mpeg      mp3;
        image/svg+xml   svg;
    }

    access_log "nginx/access.log";
    client_body_temp_path "nginx";
    proxy_temp_path "nginx";
    # Define these even if we don't use them to avoid permission issues
    fastcgi_temp_path "nginx";
    scgi_temp_path "nginx";
    uwsgi_temp_path "nginx";

    proxy_http_version 1.1;
    proxy_next_upstream off; # Don't retry
    proxy_read_timeout 3600; # We have long queries
    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    server {
        listen 10000;

        root ".";

%s
        
%s
        
%s

        location @error502_location {
          root /opt/dataiku/web;
          try_files /webapp-error-502.html /webapp-error-502.html;
        }
        
%s

%s
    }
}

""" % (auth_location, error_401_location, error_403_location, main_location, ping_location)
    with open(nginx_conf, 'wb') as f:
        f.write(template.encode('utf8'))
    subprocess.Popen(['nginx', '-p', HOME_DIR, '-c', nginx_conf])
    
def setup_webapp_exposition(security_info, project_key, web_app_id, web_app_type, ping_path):
    if security_info.get('forceAuthentication', False) or security_info.get('hideAccessToken', False):
        web_app_port = 10001
        web_app_host = "127.0.0.1" # since it's not exposed by docker or kubernetes, a 0.0.0.0 would be secure too
        # run a nginx to proxy 
        start_nginx_for_webapp(ping_path, security_info.get('forceAuthentication', False), security_info.get('redirectUrl', None), security_info.get('hideAccessToken', False), security_info.get('accessTokenCookieName', None), project_key, web_app_id, web_app_type)
    else:
        web_app_port = 10000
        web_app_host = "0.0.0.0"
    return web_app_host, web_app_port

if __name__ == "__main__":
    setup_log()
    os.chdir(HOME_DIR)
    dss_version = read_version().get('product_version')
    logging.info("Fetching job definition")
    execution_id = sys.argv[1]
    try:
        execution = intercom.jek_or_backend_json_call('containers/get-execution',
                          data={ 'executionId' : execution_id, 'version': dss_version })
    except Exception as e:
        logging.error("Could not reach DSS: %s" % e)
        # improve logging and error reporting by trying to see if the host we're trying to reach makes sense
        h = remoterun.get_env_var("DKU_BACKEND_HOST", "127.0.0.1")
        try:
            resolved = socket.gethostbyname(h)
            logging.info("Backend host %s resolved to %s" % (h, resolved))
        except Exception as e2:
            logging.error("UnknownHostException %s : %s" % (h, e2))
            
        os._exit(1) # don't pretend everything is fine
    if dss_version != execution.get('dssVersion'):
        logging.warn("Container image was build with version %s, but execution was sent from DSS version %s"
                     % (dss_version, execution.get('dssVersion')))
    # segregate the remote-run-env-def.json (might contain stuff we don't want logged)
    # also the R-exec-wrapper expects it
    dku_exec_env = execution.get('envResource', {'env':{}, 'python':{}, 'r':{}})
    # Currently used for NLP resources, see build-images.py
    dku_exec_env["env"]["DKU_RESOURCES_DIR"] = osp.join(OPT_DIR, "resources")
    execution['envResource'] = None
    dumpable_execution = json.loads(json.dumps(execution))
    dumpable_execution["payload"] = None
    dumpable_execution["definition"] = None
    logging.info("got exec: " + json.dumps(dumpable_execution))
    with open("execution.json", 'w') as fd: # 'w' OK , we use json.dump
        json.dump(execution, fd)
    # add the lib folders on the path
    if execution['type'] != 'RECIPE_R':
        python_env = dku_exec_env.get('python', {})
        python_env['pythonPathChunks'] = ['%s/lib%s' % (HOME_DIR, scope) for scope in ['instance', 'project']]
        dku_exec_env['python'] = python_env
    else:
        r_env = dku_exec_env.get('r', {})
        r_env['rPathChunks'] = ['%s/lib%s' % (HOME_DIR, scope) for scope in ['instance', 'project']]
        dku_exec_env['r'] = r_env
    with open("remote-run-env-def.json", 'w') as fd: # 'w' OK, we use json.dump
        json.dump(dku_exec_env, fd)
    dku_vars = dku_exec_env.get("env", {})

    if os.path.isfile("%s/code-env/bin/python" % OPT_DIR):
        python_bin = os.path.abspath("%s/code-env/bin/python" % OPT_DIR)
    else:
        python_bin = os.path.abspath("%s/bin/python" % OPT_DIR)
    if os.path.isfile("%s/code-env/bin/R" % OPT_DIR):
        r_bin = os.path.abspath("%s/code-env/bin/R" % OPT_DIR)
    else:
        r_bin = "%s/R/bin/R" % OPT_DIR
    if execution['type'] == 'TEST_PING':
        logging.info("Try to ping backend")
        payload = json.loads(execution['payload'])
        ping_url = "http://%s:%s/future/container-test-ping" % (os.getenv("DKU_SERVER_HOST"), str(payload['futurePort']))
        try:
            r = requests.get(ping_url, {"testId": payload['testId']},
                             headers={"X-DKU-IPythonSharedSecret": payload['futureSharedSecret']})
            logging.info("Container successfully pinged the Future Kernel")
        except Exception as e:
            logging.error("Could not reach Future Kernel: %s" % e)
            os._exit(1) # don't pretend everything is fine
    elif execution['type'] == 'RECIPE_PYTHON':
        logging.info("Executing Python recipe")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        definition = json.loads(execution['definition'])
        if definition['recipeType'].startswith('CustomCode_') and "DKU_CUSTOM_RECIPE_PLUGIN_ID" in dku_vars:
            logging.info("Getting plugin %s" % dku_vars["DKU_CUSTOM_RECIPE_PLUGIN_ID"])
            fetch_plugin(execution_id, dku_vars["DKU_CUSTOM_RECIPE_PLUGIN_ID"])

        logging.info("Running user code")
        if definition['recipeType'] == 'python' or definition['recipeType'].startswith('CustomCode_'):
            with open('dku_code.py', 'wb') as fd:
                fd.write(execution['payload'].encode('utf8'))
            run_subprocess(execution_id, '%s -m dataiku.container.exec_py_recipe' % python_bin)
        else:
            raise Exception("Unsupported recipe type: %s" % definition['recipeType'])

    elif execution['type'] == 'DOCTOR_PYTHON':
        logging.info("Training doctor model")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        if uses_ml_plugins(execution):
            fetch_ml_plugins(execution_id)

        definition = json.loads(execution['definition'])
        fetch_dir(execution_id, '', 'work', file_kind="EXECUTION_DIR")
        if "childPreprocessingFolders" in definition:
            os.mkdir('child_models')
            for folder in definition["childPreprocessingFolders"]:
                fetch_dir(execution_id, folder, 'child_models/%s' % folder)
        os.chdir('work') # model workdir
        shutil.copy("%s/remote-run-env-def.json" % HOME_DIR, "./remote-run-env-def.json")

        if definition.get("fetchSplits", False):
            fetch_dir(execution_id, 'splits')

        logging.info("Running doctor server")
        run_subprocess(execution_id, '%s -m dataiku.container.exec_doctor_server' % python_bin,
            send_error_json = False, fail_if_subprocess_failed = True)

        try:
            intercom.jek_or_backend_void_call('containers/put-file',
                                              params={
                                                  'executionId': execution_id,
                                                  'fileKind': 'EXECUTION_DIR',
                                                  'path': 'container_done.txt'
                                              },
                                              files={'file': ('container_done.txt', '1', 'text/plain')})
        except Exception as e:
            logging.error("Could not send result: %s" % e)

    elif execution['type'] == 'ML_HP_SEARCH_WORKER_RECIPE' or execution['type'] == 'ML_HP_SEARCH_WORKER_DOCTOR':
        logging.info("Starting remote worker...")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        if uses_ml_plugins(execution):
            fetch_ml_plugins(execution_id)

        logging.info("Starting remote worker server...")

        run_subprocess(execution_id, '%s -m dataiku.doctor.distributed.remote_worker_server' % python_bin,
                       send_error_json=False, fail_if_subprocess_failed=True)

    elif execution['type'] == 'RECIPE_PREDICTION_TRAIN_PYTHON' or execution['type'] == 'RECIPE_CLUSTERING_TRAIN_PYTHON':
        logging.info("Training doctor model")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        if uses_ml_plugins(execution):
            fetch_ml_plugins(execution_id)

        fetch_dir(execution_id, '', 'model')
        os.mkdir('selection') # Unused for now
        os.chdir('model') # model workdir
        shutil.copy("%s/remote-run-env-def.json" % HOME_DIR, "./remote-run-env-def.json")

        logging.info("Running doctor main")
        run_subprocess(execution_id, '%s -m dataiku.container.exec_train_recipe' % python_bin)

    elif execution['type'] == 'RECIPE_PREDICTION_SCORE_PYTHON' or execution["type"] == 'RECIPE_PREDICTION_SCORE_KERAS' or execution['type'] == 'RECIPE_CLUSTERING_SCORE_PYTHON':
        logging.info("Scoring dataset")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        if uses_ml_plugins(execution):
            fetch_ml_plugins(execution_id)

        fetch_dir(execution_id, '', 'model')
        if osp.isfile('model/parts.json'):
            fetch_dir(execution_id, '', 'pmodels', 'SAVED_MODEL_PARTITIONS')
        fetch_dir(execution_id, '', 'work', 'EXECUTION_DIR')

        logging.info("Running doctor main")
        run_subprocess(execution_id, '%s -m dataiku.container.exec_score_recipe' % python_bin)

    elif execution['type'] == 'RECIPE_PREDICTION_EVAL_PYTHON' or execution["type"] == 'RECIPE_PREDICTION_EVAL_KERAS':
        logging.info("Evaluating model")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        if uses_ml_plugins(execution):
            fetch_ml_plugins(execution_id)

        fetch_dir(execution_id, '', 'model')
        if osp.isfile('model/parts.json'):
            fetch_dir(execution_id, '', 'pmodels', 'SAVED_MODEL_PARTITIONS')
        fetch_dir(execution_id, '', 'work', 'EXECUTION_DIR')
        payload = json.loads(execution['payload'])
        remote_evaluation_store_folder = payload.get('evaluationStoreFolder', '')
        if len(remote_evaluation_store_folder) > 0:
            run_folder = osp.abspath(remote_evaluation_store_folder)
            mes_folder = osp.dirname(run_folder)
            run_id = osp.basename(run_folder)
            mes_id = osp.basename(mes_folder)
            fetch_dir(execution_id, '', osp.join('.', 'evaluation_store', mes_id, run_id), 'MODEL_EVALUATION_STORE_RUN')

        logging.info("Running doctor main")
        run_subprocess(execution_id, '%s -m dataiku.container.exec_eval_recipe' % python_bin)

    elif execution['type'] == 'RECIPE_CLUSTERING_CLUSTER_PYTHON':
        logging.info("Clustering dataset")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        fetch_dir(execution_id, '', 'model')
        os.chdir('model')
        shutil.copy("%s/remote-run-env-def.json" % HOME_DIR, "./remote-run-env-def.json")

        logging.info("Running doctor main")
        run_subprocess(execution_id, '%s -m dataiku.container.exec_cluster_recipe' % python_bin)

    elif execution['type'] == 'RECIPE_R':
        logging.info("Executing R recipe")

        fetch_libs(execution_id, 'instance')
        fetch_libs(execution_id, 'project')
        set_env_for_r_libs()

        logging.info("Running user code")
        definition = json.loads(execution['definition'])
        if definition['recipeType'].startswith('CustomCode_') and "DKU_CUSTOM_RECIPE_PLUGIN_ID" in dku_vars:
            logging.info("Getting plugin %s" % dku_vars["DKU_CUSTOM_RECIPE_PLUGIN_ID"])
            fetch_plugin(execution_id, dku_vars["DKU_CUSTOM_RECIPE_PLUGIN_ID"])

        if definition['recipeType'] == 'r' or definition['recipeType'].startswith('CustomCode_'):
            with open('code.R', 'wb') as fd:
                fd.write(execution['payload'].encode('utf8'))
            run_subprocess(execution_id, '/bin/sh -c "EXECUTION_ID=%s %s --quiet --no-save --args code.R < %s/R/R-exec-wrapper.R"' % (execution_id, r_bin, OPT_DIR))
        else:
            raise Exception("Unsupported recipe type: %s" % definition['recipeType'])

    elif execution['type'] == 'SIMPLE_PYTHON':
        definition = json.loads(execution['definition'])
        logging.info("Executing kernel entry point: %s" % definition['module'])
        run_subprocess(execution_id, '%s -m %s %s %s' % (python_bin, definition['module'], definition['port'], definition['secret']),
                       send_error_json=False)

    elif execution['type'] == 'ML_INTERACTIVE_SCORING':
        logging.info("Executing ML_INTERACTIVE_SCORING kernel")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')
        fetch_dir(execution_id, '', 'work', 'EXECUTION_DIR')
        if uses_ml_plugins(execution):
            fetch_ml_plugins(execution_id)

        load_libs()
        # os.environ['PYTHONPATH'] = ':'.join(sys.path)
        # PBE: this cannot be correct when starting subprocess with a code env
        # apply same patch as for notebooks for now
        # THIS SHOULD BE REWORKED
        filtered_sys_path = [p for p in sys.path if p.startswith(HOME_DIR) or p.startswith(OPT_DIR)]
        filtered_sys_path = [p for p in filtered_sys_path if not p.startswith(sys.prefix) and not p.startswith(sys.exec_prefix)]
        os.environ['PYTHONPATH'] = ':'.join(filtered_sys_path)
        os.chdir('work')

        definition = json.loads(execution['definition'])

        run_subprocess(execution_id,
                       '%s -m %s %s %s' % (python_bin, definition['module'],
                                           definition['port'], definition['secret']),
                       send_error_json=False, fail_if_subprocess_failed=True)

    elif execution['type'] == 'NOTEBOOK_PYTHON' or execution['type'] == 'NOTEBOOK_R':
        logging.info("Executing notebook")
        read_dku_env_and_set(no_fail=False, force=True)
        
        fetch_libs(execution_id, 'instance')
        fetch_libs(execution_id, 'project')

        if execution['type'] == 'NOTEBOOK_PYTHON':
            load_libs()
            # all the libs we want to add are below HOME_DIR or OPT_DIR (ie in the container)
            # the python install will be automatically added because we call the python_bin
            filtered_sys_path = [p for p in sys.path if p.startswith(HOME_DIR) or p.startswith(OPT_DIR)]
            # PBE: patch for mixed python version support
            # THIS SHOULD BE REWORKED
            filtered_sys_path = [p for p in filtered_sys_path if not p.startswith(sys.prefix) and not p.startswith(sys.exec_prefix)]
            os.environ['PYTHONPATH'] = ':'.join(filtered_sys_path)
        else:
            set_env_for_r_libs()


        definition = json.loads(execution['definition'])
            
        # fixup env vars that pass the libraries to the subprocess
        if execution['type'] == 'NOTEBOOK_PYTHON':
            old_libs_var = os.environ.get('PYTHONPATH', '')
            if old_libs_var is not None and len(old_libs_var) > 0:
                chunks = old_libs_var.split(':')
            else:
                chunks = []
            for lib_dir in ["/lib/project", "/lib/instance", "/plugin/python-lib"]:
                if os.path.isdir(HOME_DIR + lib_dir):
                    chunks.append(HOME_DIR + lib_dir)
            os.environ['PYTHONPATH'] = ':'.join(chunks)
        elif execution['type'] == 'NOTEBOOK_R':
            old_libs_var = os.environ.get('R_LIBS', '')
            if old_libs_var is not None and len(old_libs_var) > 0:
                chunks = old_libs_var.split(':')
            else:
                chunks = []
            for lib_dir in ["/lib/instance"]:
                if os.path.isdir(HOME_DIR + lib_dir):
                    chunks.append(HOME_DIR + lib_dir)
            os.environ['R_LIBS'] = ':'.join(chunks)

        logging.info("Setup forwarding")
        from dataiku.notebook.kernel_side_forwarder import KernelSideForwarder
        
        forward = KernelSideForwarder(definition)
        try:
            local_connection_file_name = forward.initialize()
        except:
            logging.error("Failed to setup forwarder")
            # no 'failure' per se can happen
            os._exit(0)
                
        logging.info("Start the ioloop")
        from tornado import ioloop
        # run ioloop in separate thread
        ioloop_instance = ioloop.IOLoop.instance() # get it here, because running ioloop.IOLoop.instance() gives another instance...
        def threaded_loop():
            logging.info("starting IOLoop")
            try:
                ioloop_instance.start()
            except:
                logging.info("IOLoop failure")
                traceback.print_exc()
                os._exit(1)
        t = threading.Thread(target=threaded_loop)
        t.daemon = True
        t.start()

        if execution['type'] == 'NOTEBOOK_PYTHON':
            try:
                popen = run_popen('%s -m ipykernel_launcher -f %s' % (python_bin, local_connection_file_name))
                forward.set_subprocess(popen)
                error_code = popen.wait()
                handle_subprocess_return_value(execution_id, error_code)
            finally:
                # no 'failure' per se can happen
                os._exit(0)
        else:
            try:
                popen = run_popen('%s --slave -e "IRkernel::main()" --args %s' % (r_bin, local_connection_file_name))
                forward.set_subprocess(popen)
                error_code = popen.wait()
                handle_subprocess_return_value(execution_id, error_code)
            finally:
                # no 'failure' per se can happen
                os._exit(0)
         
    elif execution['type'] == 'WEBAPP_STD':
        logging.info("Executing standard webapp backend")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        if len(dku_vars.get("DKU_PLUGIN_ID", '')) > 0:
            logging.info("Getting plugin %s" % dku_vars["DKU_PLUGIN_ID"])
            fetch_plugin(execution_id, dku_vars["DKU_PLUGIN_ID"])

        definition = json.loads(execution['definition'])
        deps_base = definition.get('htmlDepsBase', None)
        if deps_base is not None and len(deps_base) > 0:
            # also fetch the zip of the packaged html dependencies
            fetch_dir(execution_id, deps_base, deps_base, file_kind="EXECUTION_DIR")
            
        with open('command.json', 'w') as f: # 'w' OK we use json.dump
            json.dump(definition, f)
            
        web_app_host, web_app_port = setup_webapp_exposition(definition.get('securityInfo', {}), definition['projectKey'], definition['webAppId'], 'STANDARD', '/__ping')

        start_code = """from dataiku.webapps.backend import serve
serve("./command.json", "%s", %s)
""" % (web_app_host, web_app_port)
        with open('start_webapp.py', 'wb') as fd:
            fd.write(start_code.encode('utf8'))

        with open('/tmp/liveliness.marker', 'w') as f: # 'w' OK we write a string
            f.write('alive')

        run_metrics_server()
        logging.info("Running webapp")
        try:
            run_subprocess(execution_id, '%s -m dataiku.container.exec_py_webapp' % python_bin)
        finally:
            logging.info("Webapp subprocess complete, exiting runner")
            # no 'failure' per se can happen
            os._exit(0)

    elif execution['type'] == 'WEBAPP_BOKEH':
        logging.info("Executing bokeh webapp backend")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        if len(dku_vars.get("DKU_PLUGIN_ID", '')) > 0:
            logging.info("Getting plugin %s" % dku_vars["DKU_PLUGIN_ID"])
            fetch_plugin(execution_id, dku_vars["DKU_PLUGIN_ID"])

        runner_id = dku_vars.get('DKU_WEBAPP_RUNNER_ID', '')

        definition = json.loads(execution['definition'])
        if not os.path.exists('backend'):
            os.mkdir('backend')
        with open(os.path.join('backend', 'main.py'), 'wb') as fd:
            fd.write(definition['code'].encode('utf8'))

        web_app_host, web_app_port = setup_webapp_exposition(definition.get('securityInfo', {}), definition['projectKey'], definition['webAppId'], 'BOKEH', '/static/js/bokeh.min.js')

        start_code = """from dataiku.webapps.run_bokeh import main
import sys
sys.argv = [sys.argv[0], './backend', '%s', '%s', '%s']
main()
""" % (definition.get("nbProcesses", 1), web_app_host, web_app_port)
        with open('start_webapp.py', 'wb') as fd:
            fd.write(start_code.encode('utf8'))

        with open('/tmp/liveliness.marker', 'w') as f: # 'w' OK, we write a string
            f.write('alive')

        run_metrics_server()
        logging.info("Running webapp")
        try:
            run_subprocess(execution_id, '%s -m dataiku.container.exec_py_webapp' % python_bin)
        finally:
            # no 'failure' per se can happen
            os._exit(0)

    elif execution['type'] == 'WEBAPP_SHINY':
        logging.info("Executing shiny webapp backend")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')
        set_env_for_r_libs()

        if len(dku_vars.get("DKU_PLUGIN_ID", '')) > 0:
            logging.info("Getting plugin %s" % dku_vars["DKU_PLUGIN_ID"])
            fetch_plugin(execution_id, dku_vars["DKU_PLUGIN_ID"])

        runner_id = dku_vars.get('DKU_WEBAPP_RUNNER_ID', '')

        definition = json.loads(execution['definition'])
        with open('server.R', 'wb') as fd:
            fd.write(definition['server'].encode('utf8'))
        with open('ui.R', 'wb') as fd:
            fd.write(definition['ui'].encode('utf8'))

        web_app_host, web_app_port = setup_webapp_exposition(definition.get('securityInfo', {}), definition['projectKey'], definition['webAppId'], 'SHINY', '/shared/shiny.js')

        start_code = """shiny::runApp('%s',port=%s,host="%s")
""" % (os.getcwd(), web_app_port, web_app_host)
        with open('start_webapp.R', 'wb') as fd:
            fd.write(start_code.encode('utf8'))

        with open('/tmp/liveliness.marker', 'w') as f: # 'w' OK we write a string
            f.write('alive')

        run_metrics_server()
        logging.info("Running webapp")
        try:
            run_subprocess(execution_id, '/bin/sh -c "EXECUTION_ID=%s %s --quiet --no-save --args start_webapp.R < %s/R/R-exec-wrapper.R"' % (execution_id, r_bin, OPT_DIR))
        finally:
            # no 'failure' per se can happen
            os._exit(0)

    elif execution['type'] == 'WEBAPP_DASH':
        logging.info("Executing dash webapp backend")

        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        if len(dku_vars.get("DKU_PLUGIN_ID", '')) > 0:
            logging.info("Getting plugin %s" % dku_vars["DKU_PLUGIN_ID"])
            fetch_plugin(execution_id, dku_vars["DKU_PLUGIN_ID"])

        runner_id = dku_vars.get('DKU_WEBAPP_RUNNER_ID', '')

        definition = json.loads(execution['definition'])
        if not os.path.exists('backend'):
            os.mkdir('backend')
        with open(os.path.join('backend', 'main.py'), 'wb') as fd:
            fd.write(definition['code'].encode('utf8'))

        web_app_host, web_app_port = setup_webapp_exposition(definition.get('securityInfo', {}), definition['projectKey'], definition['webAppId'], 'DASH', '/__ping')

        start_code = """from dataiku.webapps.run_dash import main
import sys
sys.argv = [sys.argv[0], './backend', '%s', '%s', '%s', '%s']
main()
""" % (definition.get("nbProcesses", 1), str(definition.get("serveLocally", True)).lower(), web_app_host, web_app_port)
        with open('start_webapp.py', 'wb') as fd:
            fd.write(start_code.encode('utf8'))

        with open('/tmp/liveliness.marker', 'w') as f: # 'w' OK, we write a string
            f.write('alive')

        run_metrics_server()
        logging.info("Running webapp")
        try:
            run_subprocess(execution_id, '%s -m dataiku.container.exec_py_webapp' % python_bin)
        finally:
            # no 'failure' per se can happen
            os._exit(0)

    elif execution['type'] == 'RECIPE_CPYTHON':
        logging.info("Executing Continuous Python recipe")
        
        fetch_libs(execution_id, 'project')
        fetch_libs(execution_id, 'instance')

        definition = json.loads(execution['definition'])

        logging.info("Running user code")
        code_mode = definition.get("codeMode", "FREE_FORM")
        if code_mode == "FREE_FORM":
            with open('dku_code.py', 'wb') as fd:
                fd.write(execution['payload'].encode('utf8'))
        elif  code_mode == "FUNCTION":
            function = intercom.jek_or_backend_json_call('cpython/start-one', data={ 'functionId' : definition['functionId'], 'version': dss_version })
            logging.info("Starting function %s" % json.dumps(function))        

            start_code = """from dataiku.continuous.server import main
import sys
sys.argv = [sys.argv[0], '%s', '%s']
main()
""" % (function["linkPort"], function["linkSecret"])
            with open('dku_code.py', 'wb') as fd:
                fd.write(start_code.encode('utf8'))
        else:
            raise Exception("Unsupported recipe code mode: %s" % code_mode)

        run_subprocess(execution_id, '%s -m dataiku.container.exec_continuous_py_recipe' % python_bin, fail_if_subprocess_failed=True)
    else:
        logging.error("Unknown execution type: '%s'" % execution['type'])
        sys.exit(1) # not supposed to happen
