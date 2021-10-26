from dataiku.runnables import Runnable
import dataiku, json, subprocess
import os, shutil, os.path as osp
import datetime, time

class RCreateConf(Runnable):
    def __init__(self, project_key, config, plugin_config):
        pass

    def get_progress_target(self):
        return (100, 'NONE')

    def run(self, progress_callback):
        if "R_LIBS" in os.environ:
            del os.environ["R_LIBS"]
        if "R_LIBS_USER" in os.environ:
            del os.environ["R_LIBS_USER"]
        r_commands = [
            'dir.create(path=Sys.getenv("R_LIBS_USER"), showWarnings=FALSE, recursive=TRUE)',
            """
dependencies <- read.table(text="
    pkg             ver
    httr            1.2
    RJSONIO         1.3
    dplyr           0.5
    curl            2.4
    gtools          3.5.0
    base64enc       0.1-3
", header=TRUE, stringsAsFactors=FALSE)

checkPackages <- function() {
    message("Checking installed packages ...")
    installedVersions <- installed.packages(noCache=TRUE)[,'Version']
    l <- apply(dependencies, 1, function(x) {
        p <- x['pkg']
        v <- x['ver']
        if (is.na(installedVersions[p])) {
            message("Package not installed: ", p)
            p
        } else if (package_version(installedVersions[p]) < package_version(v)) {
            message("Package too old: ", p, " installed=", installedVersions[p] , " required=", v)
            p
        } else {
            NA
        }
    })
    na.omit(l)
}

toInstall <- checkPackages()
if (length(toInstall) > 0) {
    message("Installing packages: ", paste(toInstall, collapse=" "))
    install.packages(toInstall, lib=Sys.getenv("R_LIBS_USER"), repos="https://cloud.r-project.org")
    if (length(checkPackages()) > 0) {
        stop("at least one package failed to install required version")
    }
}
""",
            """
print("libPaths")
print(.libPaths())
print("R_LIBS_USER")
print(Sys.getenv("R_LIBS_USER"))
install.packages("http://localhost:%s/public/packages/dataiku_current.tar.gz", repos=NULL, lib=Sys.getenv("R_LIBS_USER"))
print(installed.packages(noCache=TRUE)[,'Version']["dataiku"])
if (is.na(installed.packages(noCache=TRUE)[,'Version']["dataiku"])) {
    stop('Dataiku package failed to install')
}
""" % (os.environ["DKU_BASE_PORT"])
        ]
        for command in r_commands:
            command = """R --slave --no-restore --file=- <<EOF
%s
EOF""" % command

            print("Will run R command: %s" % command)
            subprocess.check_call(command, shell=True)