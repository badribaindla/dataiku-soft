#
# Supervisor configuration file generation
#
from six.moves import configparser
import os, sys
from os import path as osp

import base

#
# Returns a configparser object initialized with the generic sections
#
def defaultConfig(dipHome, installConfig):
    runDir = '%(ENV_DIP_HOME)s/run'
    config = configparser.RawConfigParser()

    config.add_section('supervisord')
    config.set('supervisord', 'directory', runDir)
    config.set('supervisord', 'pidfile', '%s/supervisord.pid' % runDir)
    config.set('supervisord', 'logfile', '%s/supervisord.log' % runDir)

    config.add_section('rpcinterface:supervisor')
    config.set('rpcinterface:supervisor', 'supervisor.rpcinterface_factory',
        'supervisor.rpcinterface:make_main_rpcinterface')

    password = dipHome.get_supervisor_key()

    config.add_section('unix_http_server')
    config.set('unix_http_server', 'file', '%s/svd.sock' % runDir)
    config.set('unix_http_server', 'username', 'dataiku')
    config.set('unix_http_server', 'password', password)

    config.add_section('supervisorctl')
    config.set('supervisorctl', 'serverurl', 'unix://%s/svd.sock' % runDir)
    config.set('supervisorctl', 'username', 'dataiku')
    config.set('supervisorctl', 'password', password)

    return config

#
# Adds a managed program to supervisor config "config"
#
def addChild(config, programName, installConfig, startSecs=5, stopAsGroup=True, stopSignal=None):
    sectionName = 'program:%s' % programName
    config.add_section(sectionName)

    if installConfig.getNodeType() == "fm":
        config.set(sectionName, 'command', '%(ENV_DIP_HOME)s/bin/fm run %(program_name)s')
    elif installConfig.getNodeType() == "gh":
        config.set(sectionName, 'command', '%(ENV_DIP_HOME)s/bin/gh run %(program_name)s')
    else:
        config.set(sectionName, 'command', '%(ENV_DIP_HOME)s/bin/dss run %(program_name)s')

    config.set(sectionName, 'stdout_logfile', '%(ENV_DIP_HOME)s/run/%(program_name)s.log')
    config.set(sectionName, 'redirect_stderr', 'true')
    config.set(sectionName, 'autorestart', 'true')
    config.set(sectionName, 'startsecs', startSecs)

    logfile_maxbytes = installConfig.getOption('logs', 'logfiles_maxbytes')
    if logfile_maxbytes is not None:
        config.set(sectionName, 'stdout_logfile_maxbytes', logfile_maxbytes)
    else:
        config.set(sectionName, 'stdout_logfile_maxbytes', "100MB")
    logfile_backups = installConfig.getOption('logs', 'logfiles_backups')
    if logfile_backups is not None:
        config.set(sectionName, 'stdout_logfile_backups', logfile_backups)

    if stopAsGroup:
        config.set(sectionName, 'stopasgroup', 'true')
    else:
        config.set(sectionName, 'killasgroup', 'true')
    if stopSignal:
        config.set(sectionName, 'stopsignal', stopSignal)
    if config.has_option('supervisord', 'logfile_maxbytes'):
        config.set(sectionName, 'logfile_maxbytes', config.get('supervisord', 'logfile_maxbytes'))
    if config.has_option('supervisord', 'logfile_backups'):
        config.set(sectionName, 'logfile_backups', config.get('supervisord', 'logfile_backups'))

def addBackend(config, installConfig):
    addChild(config, 'backend', installConfig, startSecs=10)

def addNginx(config, installConfig):
    addChild(config, 'nginx', installConfig, stopAsGroup=False, stopSignal='QUIT')

def addIPython(config, installConfig):
    addChild(config, 'ipython', installConfig)

def addAPIMain(config, installConfig):
    addChild(config, 'apimain', installConfig, startSecs=10)

def addFMMain(config, installConfig):
    addChild(config, 'fmmain', installConfig, startSecs=10)

def addGHServer(config, installConfig):
    addChild(config, 'ghserver', installConfig, startSecs=10)

def addCollectd(config, installConfig):
    addChild(config, 'collectd', installConfig)

def addEventServer(config, installConfig):
    addChild(config, 'eventserver', installConfig)

#
# Generates the supervisor configuration corresponding to dipHome
# Assumes the environment variables in env-default have been sourced
#
def generate_supervisor_config(dipHome):
    installConfig = dipHome.get_install_config()
    config = defaultConfig(dipHome, installConfig)

    nodeType = installConfig.getNodeType()
    if nodeType == 'design' or nodeType == "automation":
        addBackend(config, installConfig)
        addIPython(config, installConfig)
        addNginx(config, installConfig)
    elif nodeType == 'api':
        addAPIMain(config, installConfig)
        addNginx(config, installConfig)
    elif nodeType == 'fm':
        addFMMain(config, installConfig)
        addNginx(config, installConfig)
    elif nodeType == 'gh':
        addGHServer(config, installConfig)
        addNginx(config, installConfig)
    else:
        raise Exception("Node type not supported: %s" % nodeType)

    if installConfig.getBoolOption("collectd","enabled",False):
        addCollectd(config, installConfig)

    if installConfig.getBoolOption("eventserver", "enabled", False):
        addEventServer(config, installConfig)

    if installConfig.getOption('supervisord', 'kill_supervisord_if_child_dies_agressive') is not None:
        config.add_section("eventlistener:supervisord-watchdog")
        config.set("eventlistener:supervisord-watchdog", "events", "PROCESS_STATE_FATAL")
        config.set("eventlistener:supervisord-watchdog", "command", "'%(ENV_DKUINSTALLDIR)s/scripts/_kill-supervisord-if-child-dies-agressive.py'")
        config.set("eventlistener:supervisord-watchdog", 'stderr_logfile', '%(ENV_DIP_HOME)s/run/supervisord-watchdog.log')
    return config

#
# Prints the supervisor configuration on standard output
#
if __name__ == "__main__":
    generate_supervisor_config(base.DipHome(os.environ["DIP_HOME"])).write(sys.stdout)
