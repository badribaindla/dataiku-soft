from dataiku.runnables import Runnable
import os, shutil, datetime, time, logging
from dataiku.runnables import Runnable, ResultTable
from dataikuapi import DSSClient

def get_epochtime_ms():
    return int((datetime.datetime.utcnow() - datetime.datetime(1970, 1, 1)).total_seconds() * 1000)

class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config

    def get_progress_target(self):
        return (100, 'NONE')

    def run(self, progress_callback):
        client = DSSClient('http://localhost:%s' % os.environ.get('DKU_BACKEND_PORT'), internal_ticket = os.environ.get('DKU_API_TICKET'))

        rt = ResultTable()
        rt.set_name("Killed sessions")

        rt.add_column("session_id", "Session id", "STRING")
        rt.add_column("notebook_project", "Notebook project key", "STRING")
        rt.add_column("notebook_project", "Notebook name", "STRING")

        simulate = self.config.get('simulate', True)

        max_idle = float(self.config.get('maxIdleTimeHours', 0))
        max_age = float(self.config.get('maxSessionAgeHours', 0))

        dont_kill_busy = self.config.get('dontKillBusyKernels', True)
        dont_kill_connected = self.config.get('dontKillConnectedKernels', True)

        now = get_epochtime_ms()

        logging.info("Listing notebooks max_age_ms=%s max_idle_ms=%s" % (max_age * 1000 * 3600, max_idle * 1000 * 3600))

        for nbk in client.list_running_notebooks():
            state = nbk.get_state()

            for session in state["activeSessions"]:
                logging.info("Check kill of %s session_age=%s kernel_idle=%s" % (
                    session, (now - session["sessionStartTime"]), (now - session["kernelLastActivityTime"])))

                kill = False

                if max_age > 0 and (now - session["sessionStartTime"]) > max_age * 1000 * 3600:
                    logging.info( " -> Will kill on max_age")
                    kill = True

                if max_idle > 0 and (now - session["kernelLastActivityTime"]) > max_idle * 1000 * 3600:
                    logging.info( " -> Will kill on max_idle")
                    kill = True

                if dont_kill_busy and session["kernelExecutionState"] == "busy":
                    logging.info(" -> Don't kill (busy)")
                    kill = False

                if dont_kill_connected and session["kernelConnections"] > 0:
                    logging.info(" -> Don't kill (connected)")
                    kill = False

                if kill:
                    logging.info("Unloading session %s" % session["sessionId"])
                    rt.add_record([session["sessionId"], session.get("projectKey", "?"), session.get("notebookName", "?")])

                    if not simulate:
                        nbk.unload(session["sessionId"])
                else:
                    logging.info("Don't kill %s" % session["sessionId"])
        return rt