import os.path as osp, json
import os
from ..auth.login import LoginHandler
from . import authinfo_json_post


class DataikuJupyterSecurity(LoginHandler):

    @classmethod
    def get_user(cls, handler):
        handler.log.info("Authentifying request for %s" % handler.request.uri)
        #print "Trying to login headers %s" % handler.request.headers
        if "X-Dku-Ipythonsharedsecret" in handler.request.headers:
            handler.log.info("Checking shared secret: %s" % handler.request.headers.get("X-Dku-Ipythonsharedsecret") )
            with open(osp.join(os.environ["DIP_HOME"], "run", "shared-secret.txt")) as f:
                shared_secret = f.read().strip()
                if handler.request.headers.get("X-Dku-Ipythonsharedsecret") == shared_secret:
                    #handler.log.info("Request authenticated with shared secret : %s" % handler.request.uri)
                    handler.dku_is_admin = True
                    return "admin"

        if handler.request.cookies is None:
            return None

        try:
            auth_info = authinfo_json_post(dict(handler.request.headers))
        except Exception as e:
            handler.log.exception("Failed to authenticate request: %s" % handler.request.uri)
            return None

        active_user = auth_info["authIdentifier"]
        if not active_user:
            handler.log.warn("Rejecting unauthenticated request: %s" % handler.request.uri)
            return None

        with open(osp.join(os.environ["DIP_HOME"], "caches", "ipython-authorization.json")) as f:
            authorizations = json.loads(f.read())
            user_auth = authorizations["users"].get(active_user, None)
            if user_auth is None:
                handler.log.warn("No authorization rules for user %s, rejecting request" % active_user)
                return None
            if not user_auth["accessAllowed"]:
                handler.log.warn("User %s may not use IPython, rejecting request" % active_user)
                return None

            is_admin = user_auth["admin"]
            if handler.request.uri.startswith("/login"):
                handler.log.info("You should not be here ...")
                return None

            handler.dku_allowed_projects = user_auth["allowedProjects"]
            handler.dku_is_admin = user_auth["admin"]
            # The security checks to verify that a user is allowed to access the project/file he requests
            # are done in AuthenticatedHandler.prepare()

            # Direct listing of sessions is disallowed if you are not admin
            if not is_admin and handler.request.uri.startswith("/jupyter/api/sessions?"):
                handler.log.warn("You are not admin, rejecting session listing")
                return None
            if not is_admin and handler.request.uri == "/jupyter/api/sessions" and handler.request.method == "GET":
                handler.log.warn("You are not admin, rejecting session listing")
                return None

            # Listing of directories is disallowed if you are not admin
            if not is_admin and handler.request.uri.startswith("/jupyter/api/contents?type=directory"):
                handler.log.warn("You are not admin, rejecting directories listing")
                return None

        handler.log.info("Access allowed for %s" % active_user)
        return active_user

    @classmethod
    def list_authorized_projects(cls, handler):
        """
        Return the list of the projects that can be accessed by the current user
        :param handler: request handler, containing data about the user
        :return: the list of available projects
        """
        try:
            auth_info = authinfo_json_post(dict(handler.request.headers))
        except Exception as e:
            handler.log.exception("Failed to authenticate request: %s" % handler.request.uri)
            return []

        active_user = auth_info["authIdentifier"]
        if not active_user:
            handler.log.warn("Rejecting unauthenticated request: %s" % handler.request.uri)
            return []

        with open(osp.join(os.environ["DIP_HOME"], "caches", "ipython-authorization.json")) as f:
            authorizations = json.loads(f.read())
            user_auth = authorizations["users"].get(active_user, None)
            if user_auth is None:
                handler.log.warn("No authorization rules for user %s, rejecting request" % active_user)
                return []
            if not user_auth["accessAllowed"]:
                handler.log.warn("User %s may not use IPython, rejecting request" % active_user)
                return []
            return user_auth["allowedProjects"]

    @classmethod
    def login_available(cls, settings):
        return True
