from ..services.sessions.sessionmanager import SessionManager
import os, os.path as osp
import json
from tornado import gen
from . import pintercom_json_post

class DataikuSessionManager(SessionManager):
    def get_session_virtual_path_(self, project_key, notebook, user):
        return pintercom_json_post("jupyter/get-session-virtual-path", {
            "projectKey" : project_key,
            "notebookId" : notebook,
            "user" : user
        })["id"]

    def get_session_virtual_path(self, path, user):
        (head, tail) = osp.split(path)

        self.log.info("Splitted path gives %s | %s" % (head, tail))

        if not tail.endswith("ipynb"):
            raise ValueError("File is not a notebook")
        if head.find("/") >= 0:
            raise ValueError("Path contains a /")
        return self.get_session_virtual_path_(head, tail, user)


    def new_kernel_context(self, project_key, notebook, user, session_id):
        return pintercom_json_post("jupyter/new-kernel-context", {
            "projectKey" : project_key,
            "notebookId" : notebook,
            "user" : user,
            "sessionId" : session_id
        })

    @gen.coroutine
    def create_session(self, path=None, name=None, type=None, kernel_name=None, kernel_id=None, user=None):
        """Creates a session and returns its model"""

        self.log.info("NEW Creating DKU session for %s (user=%s) name=%s" % (path, user, name))

        (head, tail) = osp.split(path)

        self.log.info("Splitted path gives %s | %s" % (head, tail))

        if not tail.endswith("ipynb"):
            raise ValueError("File is not a notebook")
        if head.find("/") >= 0:
            raise ValueError("Path contains a /")

        # Ask the backend to create a ticket for this user.
        session_id = "%s__DKU__%s" % (user, self.new_session_id())


        self.log.info("Requesting kernel context for session %s" % session_id)
        kernel_context = self.new_kernel_context(head, tail, user, session_id)

        self.log.info("Creating Kernel for session with context: %s" % json.dumps(kernel_context))

        system_pythonpath = os.getenv("PYTHONPATH", None)
        if system_pythonpath is not None:
            kernel_context["pythonPath"].insert(0, system_pythonpath)

        self.log.info("Full pythonpath: %s" % kernel_context["pythonPath"])

        dku_extra_env = {
            "DKU_CURRENT_PROJECT_KEY" : head,
            "DKU_API_TICKET" : kernel_context["ticketSecret"],
            "PYTHONPATH" : ":".join(kernel_context["pythonPath"]),
            "DKU_SOURCE_LIB_R_PATH" : ":".join(kernel_context["rsrcPath"])
        }
        if "delegationTokensFileLocation" in kernel_context:
            if os.environ.get("DKU_HADOOP_FLAVOR") == "mapr":
                dku_extra_env["MAPR_TICKETFILE_LOCATION"] = kernel_context["delegationTokensFileLocation"]
            else:
                dku_extra_env["HADOOP_TOKEN_FILE_LOCATION"] = kernel_context["delegationTokensFileLocation"]

        if "forceHadoopUserName" in kernel_context:
            dku_extra_env["HADOOP_USER_NAME"] = kernel_context["forceHadoopUserName"]

        if kernel_id is not None and kernel_id in self.kernel_manager:
            pass
        else:
            kernel_id = yield self.start_kernel_for_session(session_id, path,
                                                            name, type, 
                                                            kernel_name,
                                                            dku_kernel_context=kernel_context,
                                                            DKU_EXTRA_ENV= dku_extra_env)

            session_virtual_path = kernel_context["sessionVirtualPath"]

            result = yield gen.maybe_future(
                self.save_session(session_id, path=session_virtual_path, name=name, type=type, kernel_id=kernel_id)
            )

        # py2-compat
        raise gen.Return(result)

    @gen.coroutine
    def delete_session(self, session_id):
        session = self.get_session(session_id=session_id)
        yield gen.maybe_future(self.kernel_manager.shutdown_kernel(session['kernel']['id']))

        pintercom_json_post("jupyter/delete-kernel-context", {
            "sessionId" : session_id
        })

        self.cursor.execute("DELETE FROM session WHERE session_id=?", (session_id,))
