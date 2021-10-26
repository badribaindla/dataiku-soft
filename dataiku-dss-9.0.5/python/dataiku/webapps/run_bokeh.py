# imports like in doc_handler.py
from __future__ import absolute_import, print_function
from tornado import gen
from packaging import version

# our stuff
import os, sys, json, logging, traceback, threading
from dataiku.base.utils import watch_stdin

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


# stash headers somewhere accessible to anybody: in a file per session (so no need for locking)
def get_session_headers_file_path(session_id):
    return os.path.join('.bokeh_session_headers', 'session_%s.json' % session_id)
    
def get_session_headers(session_id):
    headers_file_path = get_session_headers_file_path(session_id)
    if os.path.exists(headers_file_path):
        with open(headers_file_path, 'r') as f:
            return json.load(f)
    else:
        return {}

def set_session_headers(session_id, headers):
    headers_file_path = get_session_headers_file_path(session_id)
    headers_folder_path = os.path.dirname(headers_file_path)
    if not os.path.exists(headers_folder_path):
        try: # in a try catch in case multiple processes create the folder at the same time
            os.makedirs(headers_folder_path)
        except:
            traceback.print_exc()
    with open(headers_file_path, 'w') as f:
        json.dump(headers, f)


# stash headers of request handler somewhere accessible to the bokeh session_id generation routing
import dataiku.webapps as dku_webapps
if getattr(dku_webapps, 'current_bokeh_headers', None) is None:
    dku_webapps.current_bokeh_headers = threading.local()

def get_current_bokeh_headers():
    if not hasattr(dku_webapps.current_bokeh_headers, 'map'):
        dku_webapps.current_bokeh_headers.map = {}
    return dku_webapps.current_bokeh_headers.map
    
def set_current_bokeh_headers(h):
    dku_webapps.current_bokeh_headers.map = h


# monkey path bokeh's session id generation to get it first
from bokeh.util import session_id as bokeh_session_id
old_bokeh_generate_session_id = bokeh_session_id.generate_session_id
def new_generate_session_id(secret_key=None, signed=None):
    session_id = old_bokeh_generate_session_id(secret_key, signed)
    set_session_headers(session_id, dku_webapps.current_bokeh_headers.map)
    return session_id
    
bokeh_session_id.generate_session_id = new_generate_session_id


from bokeh import __version__ as bokeh_version
from bokeh.embed.server import server_html_page_for_session
from bokeh.server.views.session_handler import SessionHandler
from tornado.web import RequestHandler
from bokeh.server.server import Server
from bokeh.application import Application
from bokeh.application.handlers import DirectoryHandler
from bokeh.server.views.doc_handler import DocHandler
from bokeh.server.urls import per_app_patterns
from tornado.web import authenticated


# monkeypatch bokeh to make it use our spiced up DocHandler
if version.parse(bokeh_version) >= version.parse("2"):
    # starting in 2.0, parts of bokeh switched to using async/await
    logging.info("use 2.0-style cookie sniffing handler")
    # pure ugliness: since "async def ..." can't be compiled by python2.7, we hide the incompatible 
    # code inside a exec(). The clean way of doing this would of course to have different files and 
    # build/pull the correct ones for the python version in all places DSS grabs the dataiku package
    py3_style_doc_handler_class = """
class CookiesSniffingDocHandler(DocHandler):
    @authenticated
    async def get(self, *args, **kwargs):
        set_current_bokeh_headers(dict(self.request.headers))
        try:
            await super(CookiesSniffingDocHandler, self).get(*args, **kwargs)
        finally:
            set_current_bokeh_headers({})
"""
    exec(py3_style_doc_handler_class)
else:
    logging.info("use old-style cookie sniffing handler")
    class CookiesSniffingDocHandler(DocHandler):
        @gen.coroutine
        def get(self, *args, **kwargs):
            set_current_bokeh_headers(dict(self.request.headers))
            try:
                super(CookiesSniffingDocHandler, self).get(*args, **kwargs)
            finally:
                set_current_bokeh_headers({})
        
per_app_patterns[0] = (r'/?', CookiesSniffingDocHandler)


def serve(bkd_path, nb_processes=1, host='localhost', port=None):
    # the app itself
    app_handler = DirectoryHandler(filename=bkd_path)
    application = Application(app_handler)
    
    # start the server with a dedicated route to sniff cookies
    server = Server({'/backend': application}, port=port, num_procs=nb_processes, allow_websocket_origin=['*'])
    
    url = "http://localhost:%d/backend" % (server.port)
    logging.info("Bokeh app running at: %s" % url)
    
    server.run_until_shutdown()

def main():
    watch_stdin()
    serve(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else None, sys.argv[3] if len(sys.argv) > 3 else None, int(sys.argv[4]) if len(sys.argv) > 4 else None)

if __name__ == "__main__":
    main()        
