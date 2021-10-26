from __future__ import print_function
from os import path as osp
import os
import sys

import base
import envfiles
import install_config
import migration_base


def initial_install(dip_home_path, base_port):
    base._sanity_check()

    dip_home = base.DipHome(dip_home_path)
    node_type = 'api'

    print("[+] Performing initial install")
    base.create_apinode_folders(dip_home)
    migration_base.write_version(dip_home)

    print("[+] Writing default install config file")
    install_config.initConfig(dip_home, base_port, node_type, "auto")

    print("[+] Writing default env file")
    envfiles.write_envdefault(dip_home)

    base.link_apinode_binaries(dip_home, os.environ["DKUINSTALLDIR"])
    base.generate_supervisor_key(dip_home)

    base.json_dumpf(osp.join(dip_home.path, "config", "server.json"),
        {
            "remappedConnections" : {},
            "auditLog" : {
                "logAuthFailures" : True,
                "logQueries" : True,
                "settings": {
                    "targets": [
                        {
                            "type": "LOG4J",
                            "appendTopicToLogger": True,
                            "topicsFiltering": "ALL",
                            "routingKeysFiltering": "ALL",
                        }
                    ]
                }
            }
    })
    base.json_dumpf(osp.join(dip_home.path, "config", "adminkeys.json"),
        {
            "keys" : []
    })
    base.json_dumpf(osp.join(dip_home.path, "loaded-data-mapping.json"), {})


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("""
        Usage:
            install_apinode.py <dip_home> <port>
        """, file=sys.stderr)
        sys.exit(1)

    initial_install(sys.argv[1], int(sys.argv[2]))
