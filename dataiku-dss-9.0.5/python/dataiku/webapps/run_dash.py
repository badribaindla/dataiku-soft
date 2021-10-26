import inspect
import os
import sys
import json
import tempfile
import calendar, datetime, time
import traceback
import logging
from flask import Flask, g
import os, os.path as osp
from dataiku.base.utils import watch_stdin, get_json_friendly_error
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

try:
    from dash import Dash
except ImportError as e:
    logging.error("Unable to import dash, need a code env containing the dash package: %s" % str(e))
    with open("error.json", "w") as f:
        json.dump(get_json_friendly_error(), f)
    raise e
    
try:
    # ugliness incoming: Dash doesn't do relative paths for the assets, and intentionally. So
    # we have to monkey-patch the method that validates the path prefixes...
    def pathname_configs(a=None, b=None, c=None):
        return '/', '/', './'
        
    import dash._configs as dash_configs
    dash_configs.pathname_configs = pathname_configs
    dash_module = sys.modules['dash.dash'] # needs to be reloaded because it calls the monkey patched function
    if sys.version_info.major < 3:
        reload_func = reload
    elif sys.version_info.minor < 4:
        from imp import reload as mreload
        reload_func = mreload
    else:
        from importlib import reload as mreload
        reload_func = mreload
    reload_func(dash_module)
except Exception as e:
    logging.warn("Unable to monkey-patch dash, proceeding without: %s" % str(e))
        
        
from .backend import setup_instrumentation # same as a regular flask app, so re-use

def serve(bkd_path, nb_processes=1, serve_locally=True, host='localhost', port=None):
    global flask_app
    global app
    logging.info("Starting Flask backend")

    # Init Flask app that will host the Dash app
    flask_app = Flask(__name__)
    setup_instrumentation(flask_app)
        
    @flask_app.route('/__ping')
    def ping():
        return "pong"

    try:
        logging.info("Starting Dash backend")

        # now init the dash app inside the flask app
        app = Dash(__name__, server=flask_app, serve_locally=serve_locally, assets_folder=osp.realpath(osp.join(bkd_path, '../assets')))

        # Execute user's code
        with open(osp.join(bkd_path, 'main.py'), 'r') as f:
            exec(f.read(), globals(), globals()) # in globals so that flask can find them
        
        # Start the server
        from werkzeug.serving import make_server
        use_threading = nb_processes == 0
        if nb_processes < 0:
            nb_processes = None
        srv = make_server(host, port, flask_app, threaded=use_threading, processes=nb_processes)
        myport = srv.server_port

        logging.info("Started Dash on port %s" % myport)

        srv.serve_forever()

    except:
        logging.exception("Backend main loop failed")
        with open("error.json", "w") as f:
            json.dump(get_json_friendly_error(), f)

def main():
    watch_stdin()
    serve(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else None, sys.argv[3] == 'true' if len(sys.argv) > 3 else None, sys.argv[4] if len(sys.argv) > 4 else None, int(sys.argv[5]) if len(sys.argv) > 5 else 0)

if __name__ == "__main__":
    main()        
