from __future__ import print_function
from os import path as osp
import random
import string
import os, stat
import json
import sys

import install_config

class DipHome:

    def __init__(self, path):
        self.path = path

    def version_filepath(self,):
        return osp.join(self.path, "dss-version.json")

    def version_data(self):
        return json_loadf(self.version_filepath())

    def has_conf_version(self):
        return "conf_version" in self.version_data()

    def get_conf_version(self):
        return int(self.version_data()["conf_version"])

    def get_dss_version(self):
        return self.version_data()["product_version"]

    def get_install_id(self):
        return self.get_install_config().getOption("general", "installid", "notattributed")

    def set_version(self, conf_version, product_version, product_commitid):
        try:
            assert type(conf_version) == int
            print("[+] Writing version metadata conf=%s product=%s revision=%s" % (conf_version, product_version, product_commitid))
            new_data = {
                "conf_version": "%d" % conf_version,
                "product_version": product_version,
                "product_commitid": product_commitid
            }
            version_file = open(self.version_filepath(), 'w')
            version_file.write(json.dumps(new_data, indent=2))
        except IOError as e:
            raise e

    def get_install_config(self):
        return install_config.InstallConfig(self)

    def get_supervisor_key(self):
        with open(osp.join(self.path, "install-support", "supervisord.key")) as f:
            return f.read()


def json_dumpf(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=4)


def json_loadf(path):
    with open(path, "r") as f:
        return json.load(f)

def _sanity_check():
    if "DKUINSTALLDIR" not in os.environ:
        print("migrate.py needs $DKUINSTALLDIR", file=sys.stderr)
        sys.exit(1)
    if "DKUJAVABIN" not in os.environ:
        print("migrate.py needs $DKUJAVABIN", file=sys.stderr)
        sys.exit(1)

def generate_random_string(N):
    return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(N))

def generate_random_id(N):
    return ''.join(random.choice(string.ascii_uppercase + string.ascii_lowercase + string.digits) for _ in range(N))

def generate_supervisor_key(dip_home):
    key = generate_random_string(16)

    if not osp.isdir(osp.join(dip_home.path, "install-support")):
        os.makedirs(osp.join(dip_home.path, "install-support"))

    with open(osp.join(dip_home.path, "install-support", "supervisord.key"), "w") as f:
        os.fchmod(f.fileno(), stat.S_IRUSR | stat.S_IWUSR)
        f.write(key)

def _link_binary(dip_home, install_dir, binary):
    src = osp.join(install_dir, "scripts", "linked", binary)
    tgt = osp.join(dip_home.path, "bin", binary)
    if osp.lexists(tgt):
        os.remove(tgt)
    os.symlink(src, tgt)

def link_dss_binaries(dip_home, install_dir):
    """After this method, DKU & co commands can be called and use the new binaries"""
    for binary in ["dss", "dku", "jek", "fek", "cak", "hproxy", "dssadmin", "dsscli"]:
        _link_binary(dip_home, install_dir, binary)

def link_apinode_binaries(dip_home, install_dir):
    """After this method, DKU & co commands can be called and use the new binaries"""
    for binary in ["dss", "dssadmin", "apinode-admin"]:
        _link_binary(dip_home, install_dir, binary)

def link_fm_binaries(dip_home, install_dir):
    for binary in ["fm", "fmadmin", "internal-fmcli"]:
        _link_binary(dip_home, install_dir, binary)

def link_gh_binaries(dip_home, install_dir):
    for binary in ["ghdku", "gh", "ghadmin"]:
        _link_binary(dip_home, install_dir, binary)

def create_gh_folders(dip_home):
    """Create the minimal data structures required to run the registration process"""

    with open(osp.join(dip_home.path, "config", "dip.properties"), "w") as f:
        f.write("# Internal GH properties\n")

def create_dss_folders(dip_home):
    """Create the minimal data structures required to run the registration process"""

    for folder in ["config/projects", "jobs", "exports", "uploads", "tmp", "config/ipython_notebooks"]:
        tgt = osp.join(dip_home.path, folder)
        if not osp.isdir(tgt):
            os.makedirs(tgt)

    with open(osp.join(dip_home.path, "config", "dip.properties"), "w") as f:
        f.write("# Internal DSS properties\n")
        f.write("logging.limit.s3.ignoredPath=100\n")
        f.write("logging.limit.s3.ignoredFile=100\n")
        f.write("logging.limit.filePartitioner.noMatch=100\n")

def ensure_required_dss_files(dip_home):
    publickeys = osp.join(dip_home.path, "config", "public-apikeys.json")
    if not osp.isfile(publickeys):
        json_dumpf(publickeys, [])


def create_apinode_folders(dip_home):
    """Create the minimal data structures required to run the registration process"""
    for folder in ["config", "services", "run", "bin", "tmp"]:
        tgt = osp.join(dip_home.path, folder)
        if not osp.isdir(tgt):
            os.makedirs(tgt)

    if not osp.isfile(osp.join(dip_home.path, "config", "dip.properties")):
        with open(osp.join(dip_home.path, "config", "dip.properties"), "w") as f:
            f.write("# Internal DSS properties")


def create_dir_if_needed(path):
    if not osp.isdir(path):
        os.makedirs(path)
        return True
    return False
