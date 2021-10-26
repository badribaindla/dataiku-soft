from __future__ import print_function
from os import path as osp
import os
import sys
import logging
import base
import envfiles
import requests
import install_config
import migration_base

def initial_install(dip_home_path, base_port, cloud):
    base._sanity_check()

    dip_home = base.DipHome(dip_home_path)

    print("[+] Performing initial install")

    migration_base.write_version(dip_home)

    print("[+] Writing default install config file")
    install_config.initConfig(dip_home, base_port, "fm", "auto")

    print("[+] Writing default env file")
    envfiles.write_envdefault(dip_home)

    base.link_fm_binaries(dip_home, os.environ["DKUINSTALLDIR"])
    base.generate_supervisor_key(dip_home)

    for folder in ["config/", "tmp"]:
        tgt = osp.join(dip_home.path, folder)
        if not osp.isdir(tgt):
            os.makedirs(tgt)

    with open(osp.join(dip_home.path, "config", "dip.properties"), "w") as f:
        f.write("# Internal FM properties\n")

    if cloud == "AWS":
        try:
            identity_doc = requests.get("http://169.254.169.254/latest/dynamic/instance-identity/document").json()
            mac = requests.get("http://169.254.169.254/latest/meta-data/mac").text
            vpc = requests.get("http://169.254.169.254/latest/meta-data/network/interfaces/macs/%s/vpc-id" % mac).text
            fm_cidr = requests.get("http://169.254.169.254/latest/meta-data/network/interfaces/macs/%s/subnet-ipv4-cidr-block" % mac).text
            region = identity_doc["region"]
            ip = identity_doc["privateIp"]
        except Exception:
            logging.exception("Failed to infer AWS settings, maybe not an AWS machine")
            vpc = "XXX"
            fm_cidr="XXX"
            region = "XXX"
            ip = "XXX"

        base.json_dumpf(osp.join(dip_home.path, "config", "settings.json"),
            {
                "databaseSettings" : {
                    "dbDialect" : "org.hibernate.dialect.PostgreSQLDialect",
                    "dbDriver" : "org.postgresql.Driver",
                    "dbURL" : "jdbc:postgresql://#HOST#:#PORT#/#DB#?user=#DBUSER#&password=#DBPASSWORD#"
                },
                "tenancy": "MONOTENANT",
                "cloud" : "AWS",
                "awsSettings" : {
                    "regionId": region,
                    "vpcId" : vpc,
                    "fmServerCIDR": fm_cidr
                },
                "instanceVisibleURL" : "http://%s:%s" % (ip, base_port)
            }
        )  
    else:
        ip = "XXX"
        base.json_dumpf(osp.join(dip_home.path, "config", "settings.json"),
            {
                "databaseSettings" : {
                    "dbDialect" : "org.hibernate.dialect.PostgreSQLDialect",
                    "dbDriver" : "org.postgresql.Driver",
                    "dbURL" : "jdbc:postgresql://#HOST#:#PORT#/#DB#?user=#DBUSER#&password=#DBPASSWORD#"
                },
                "tenancy": "MONOTENANT",
                "cloud" : "AZURE",
                "azureSettings" : {
                    "TODO": "TODO"
                },
                "instanceVisibleURL" : "http://%s:%s" % (ip, base_port)
            }
        )  

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("""
        Usage:
            install_fm.py <dip_home> <port> <cloud>
        """, file=sys.stderr)
        sys.exit(1)

    initial_install(sys.argv[1], int(sys.argv[2]), sys.argv[3])
