from dataiku.runnables import Runnable
import dataiku, json
import os, shutil, os.path as osp
import datetime, time

class RCreateConf(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key

    def get_progress_target(self):
        return (100, 'NONE')

    def run(self, progress_callback):
        rproj_content ="""
Version: 1.0

RestoreWorkspace: Default
SaveWorkspace: Default
AlwaysSaveHistory: Default

EnableCodeIndexing: Yes
UseSpacesForTab: Yes
NumSpacesForTab: 2
Encoding: UTF-8

RnwWeave: Sweave
LaTeX: pdfLaTeX
"""

        renviron_content ="""
Sys.setenv(DKU_CURRENT_PROJECT_KEY="%s")
""" % (self.project_key)

        project_dir = osp.expanduser("~/dataiku-projects/%s" % self.project_key)
        if osp.isdir(project_dir):
            raise Exception("RStudio project directory %s already exists" % project_dir)

        os.makedirs(project_dir)

        rproj_file = osp.join(project_dir, "dataiku-project-%s.Rproj" % self.project_key)

        with open(rproj_file , "w") as f:
            f.write(rproj_content)

        with open(osp.join(project_dir, ".Rprofile"), "w") as f:
            f.write(renviron_content)

        mru_list = osp.expanduser("~/.rstudio/monitored/lists/project_mru")

        if osp.isfile(mru_list):
            with open(mru_list) as f:
                data = f.read()
            data = "%s\n%s" % (rproj_file, data)
            with open(mru_list, "w") as f:
                f.write(data)
