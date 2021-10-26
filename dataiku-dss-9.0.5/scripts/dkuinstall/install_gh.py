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

    print("[+] Performing initial install")

    migration_base.write_version(dip_home)

    print("[+] Writing default install config file")
    install_config.initConfig(dip_home, base_port, "gh", "auto")

    print("[+] Writing default env file")
    envfiles.write_envdefault(dip_home)

    base.link_gh_binaries(dip_home, os.environ["DKUINSTALLDIR"])
    base.generate_supervisor_key(dip_home)
    base.create_gh_folders(dip_home)
    base.ensure_required_dss_files(dip_home)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("""
        Usage:
            install_dss.py <dip_home> <port>
        """, file=sys.stderr)
        sys.exit(1)

    initial_install(sys.argv[1], int(sys.argv[2]))
