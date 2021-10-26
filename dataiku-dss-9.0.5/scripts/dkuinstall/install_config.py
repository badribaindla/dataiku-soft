#
# DSS installer configuration file handling
#
# This is a Python-style .ini configuration file in DIP_HOME/install.ini
#
# The following configuration keys are recognized:
#
# [general]
# nodetype = (design | api | automation) # automation nodetype includes deployer, default = design
# installid               # locally unique installation id, mandatory for multiuser-security mode
#
# [server]
# port = DKU_BASE_PORT    # mandatory, no default
# ssl = (true|false)      # default false
# ssl_certificate         # mandatory for ssl
# ssl_certificate_key     # mandatory for ssl
# ssl_ciphers = (default|recommended)   # Restrict SSL ciphers if 'recommended'
# hsts-max-age = SECONDS  # (ssl only) add HSTS header
# check_ports = (true|false)    # Check server ports on startup, default true
# ipv6 = (true|false)     # Listen on IPv6 in addition to IPv4, default false
# websocket_permessage_deflate = (true|false)    # Accept permessage-deflate websocket extension, default true
# nginx_binary            # Custom nginx binary
#
# [git]
# mode = (global|project)     # mandatory, no default
# plugindev-mode = (global|plugin) # optional, defaults to "plugin"
#
# [logs]
# logfiles_maxbytes = SIZE    # default = 100MB, 0 = no rotation
# logfiles_backups = NUMBER   # default = 10
#
# [javaopts]
# backend.xmx = SIZE    # default = 2G
# backend.permgen = SIZE    # default = 200m
# backend.additional.opts = 
# ... + same for jek, cak, fek, dku, hproxy, apimain
#

from __future__ import print_function
from six.moves import configparser
import base
import os
import os.path as osp
import sys
from configparser import RawConfigParser


class InstallConfig:

    #
    # Load install config in dipHome
    #
    def __init__(self, dipHome):
        self.filename = osp.join(dipHome.path, "install.ini")
        with open(self.filename) as f:
            self.config = RawConfigParser()
            self.config.readfp(f)

    #
    # Save install config
    #
    def save(self):
        with open(self.filename, 'w') as f:
            self.config.write(f)

    #
    # Return mandatory base port
    #
    def getServerPort(self):
        port = self.config.getint("server", "port")
        if port < 1024 or port > 65535:
            raise Exception("Invalid server port value, must be between 1024 and 65535: %d" % port)
        return port

    #
    # Return node type
    #
    def getNodeType(self):
        return self.getOption('general', 'nodetype', 'design')

    #
    # Lookup optional string parameter
    #
    def getOption(self, section, option, default=None):
        config = self.config
        return (config.get(section, option)
            if config.has_section(section) and config.has_option(section, option)
            else default)

    #
    # Lookup optional integer parameter
    #
    def getIntOption(self, section, option, default=None):
        config = self.config
        return (config.getint(section, option)
            if config.has_section(section) and config.has_option(section, option)
            else default)

    #
    # Lookup optional boolean parameter
    #
    def getBoolOption(self, section, option, default=None):
        config = self.config
        return (config.getboolean(section, option)
            if config.has_section(section) and config.has_option(section, option)
            else default)
            
    #
    # Lookup optional string parameter with prefix
    #
    def getPrefixedOption(self, section, prefix, option, default=None):
        config = self.config
        return (config.get(section, prefix + '.' + option)
            if config.has_section(section) and config.has_option(section, prefix + '.' + option)
            else default)


    #
    # Add a string parameter
    #
    def addOption(self, section, option, value):
        config = self.config
        if not config.has_section(section):
            config.add_section(section)
        config.set(section, option, value)


def set_default_size_options(config, install_size):
    if install_size == "auto":
        try:
            memory_mb = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES') / (1024*1024)
        except Exception as e:
            memory_mb = 8192 # Default to something that will yield "small"

        if memory_mb > 30000:
            install_size = "big"
        elif memory_mb >= 12288:
            install_size = "medium"
        else:
            install_size = "small"

    if install_size == "big":
        config.set('javaopts', 'backend.xmx', '8g')
    elif install_size == "medium":
        config.set('javaopts', 'backend.xmx', '4g')
    else:
        print("[!] Small RAM detected, using low-memory mode, may not be suitable for production setups", file=sys.stderr)
        config.set('javaopts', 'backend.xmx', '2g')


#
# Writes initial configuration
#
def initConfig(dipHome, port, nodeType, install_size, gitMode='project'):
    config = RawConfigParser()
    config.add_section('general')
    if nodeType == "deployer" or nodeType == "apideployer":
        # A deployer (formerly apideployer) node is actually an automation node without the projects module
        config.set('general', 'nodetype', "automation")
        config.add_section("modules")
        config.set("modules", "projects", "false")
    else:
        config.set('general', 'nodetype', nodeType)
    config.set('general', 'installid', base.generate_random_id(24))
    config.add_section('server')
    config.set('server', 'port', port)
    config.add_section('git')
    config.set('git', 'mode', gitMode)
    config.add_section('javaopts')

    set_default_size_options(config, install_size)

    fp = osp.join(dipHome.path, "install.ini")
    with open(fp, 'w') as f:
        config.write(f)

#
# Main entry point: helper program to get/set entries
#
if __name__ == "__main__":

    def usage():
        print("""Usage:
        install_config.py [-d DIP_HOME] -get (nodetype | server.port | SECTION OPTION)
        install_config.py [-d DIP_HOME] -set SECTION OPTION VALUE
        """, file=sys.stderr)
        sys.exit(1)

    if len(sys.argv) >= 4 and sys.argv[1] == "-d":
        dip_home = sys.argv[2]
        del sys.argv[1:3]
    elif len(sys.argv) >= 2:
        dip_home = os.environ['DIP_HOME']
    else:
        usage()

    dipHome = base.DipHome(dip_home)
    config = dipHome.get_install_config()

    if sys.argv[1] == "-get" and len(sys.argv) == 3:
        if sys.argv[2] == 'nodetype':
            print(config.getNodeType())

        elif sys.argv[2] == 'server.port':
            print(config.getServerPort())

        else:
            usage()

    elif sys.argv[1] == "-get" and len(sys.argv) == 4:
        print(config.getOption(sys.argv[2], sys.argv[3]))

    elif sys.argv[1] == "-getbool" and len(sys.argv) == 4:
        value = config.getBoolOption(sys.argv[2], sys.argv[3], False)
        print("1" if value else "0")

    elif sys.argv[1] == "-set" and len(sys.argv) == 5:
        config.addOption(sys.argv[2], sys.argv[3], sys.argv[4])
        config.save()

    else:
        usage()
