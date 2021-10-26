import inspect
import os
import sys
import json
import tempfile
import calendar, datetime, time
import traceback
import logging
from flask import Flask, g, request, redirect, make_response, send_from_directory
import os, os.path as osp
from dataiku.base.utils import watch_stdin, get_clazz_in_code, get_json_friendly_error, random_string
from dataiku.base.remoterun import read_dku_env_and_set
from .metrics import report_call as metrics_report_call

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# in a separate function to make python compilation possible (otherwise complain that it doesnt't want to be neighbours with the exec(...) )
def setup_html_serving(app, html):
    logging.info("Serving html")
    @app.route('/')
    def landing():
        return make_response(html)

def setup_instrumentation(app):
    # instrument
    @app.before_request
    def before_request():
        g.start = time.time()
    
    @app.after_request
    def after_request(resp):
        # __ping doesn't count
        if request.path.endswith('__ping'):
            return resp
        session_id = request.cookies.get('X-DKU-Flask-User', None)
        if session_id is None or len(session_id) == 0:
            session_id = random_string(32)
            resp.set_cookie('X-DKU-Flask-User', session_id)
        metrics_report_call(g.start, session_id)
        return resp

def serve(command_file_path, bind_host, required_port=0):
    global app
    logging.info("Starting Webapp backend")

    # get work to do
    with open(command_file_path, 'r') as command_file:
        command = json.load(command_file)

    # Init Flask
    html = command.get('html', None)
    if html is not None and len(html) > 0:
        logging.info("Serving dependencies for html")
        deps_base = command.get('htmlDepsBase', '')
        static_folder = os.path.join('.', deps_base)
        app = Flask(__name__, root_path=os.getcwd(), static_url_path='', static_folder=static_folder)
        setup_html_serving(app, html)
    else:
        app = Flask(__name__)
        
    setup_instrumentation(app)
        
    try:
        logging.info("Starting backend for web app: %s.%s" % (command["projectKey"], command["webAppId"]))

        @app.route('/__ping')
        def ping():
            return "pong"

        # Execute user's code
        exec(command["code"], globals(), globals()) # in globals so that flask can find them
        
        # Start the server
        from werkzeug.serving import make_server
        nb_processes = command.get('nbProcesses', 1)
        use_threading = nb_processes == 0
        if nb_processes < 0:
            nb_processes = None
        srv = make_server(bind_host, required_port, app, threaded=use_threading, processes=nb_processes)
        myport = srv.server_port

        logging.info("Started backend on port %s" % myport)

        srv.serve_forever()

    except:
        logging.exception("Backend main loop failed")
        with open("error.json", "w") as f:
            json.dump(get_json_friendly_error(), f)

if __name__ == "__main__":
    if len(sys.argv) == 4:
        read_dku_env_and_set()
        serve(sys.argv[1], sys.argv[2], int(sys.argv[3]))
    elif len(sys.argv) == 3:
        watch_stdin()
        serve(sys.argv[1], sys.argv[2])
    else:
        watch_stdin()
        serve(sys.argv[1], "127.0.0.1")
    