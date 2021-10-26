from __future__ import print_function
from os import path as osp
import re
import shutil
import random
import string
import os
import json, logging
from glob import glob
from copy import deepcopy
import subprocess
import sys

################################################################
# Migration operations base classes (global and per-project)
################################################################

class MigrationOperation:
    def appliesTo(self):
        return [ "design", "automation" ]

    def execute(self, diphome, simulate=False):
        raise NotImplementedError

    def post_execute(self, diphome):
        pass

class ProjectPaths(object):

    def __init__(self, config, managed_fs_datasets, managed_folders, analysis_data, saved_models, jupyter_notebooks, jupyter_exports):
        self.config = config
        self.managed_fs_datasets = managed_fs_datasets
        self.managed_folders = managed_folders
        self.analysis_data = analysis_data
        self.saved_models = saved_models
        self.jupyter_notebooks = jupyter_notebooks
        self.jupyter_exports = jupyter_exports

class ProjectLocalMigrationOperation(object):
    def execute(self, project_paths):
        raise NotImplementedError("Not implemented")
        
    def get_manifest_additions(self, additions, project_paths):
        pass

################################################################
# Project-aware wrapper
################################################################

import copy

class GlobalProjectMigrationOperation(MigrationOperation):
    def __init__(self, base_obj):
        self.base_obj = base_obj

    def execute(self, diphome):
        projects_folder = osp.join(diphome.path, "config/projects")
        if not osp.isdir(projects_folder):
            return

        for project_key in os.listdir(projects_folder):
            if not osp.isfile(osp.join(projects_folder, project_key, "params.json")):
                continue

            logging.info("Applying migration %s on project %s" % (self.base_obj, project_key))

            migration = copy.deepcopy(self.base_obj)

            ppaths = ProjectPaths(
                config=osp.join(projects_folder, project_key),
                managed_fs_datasets=osp.join(diphome.path, "managed_datasets"),
                managed_folders=osp.join(diphome.path, "managed_folders"),
                analysis_data=osp.join(diphome.path, "analysis-data", project_key),
                saved_models=osp.join(diphome.path, "saved_models", project_key),
                jupyter_notebooks = osp.join(diphome.path, "config", "ipython_notebooks", project_key),
                jupyter_exports=osp.join(diphome.path, "jupyter_exports", project_key)
                )

            migration.execute(ppaths)


################################################################
# Migrations registry
################################################################

class VersionMigrationsLibrary:

    def __init__(self,):
        self.migrations = []

    def register(self, step):
        self.migrations.append(step)

    def validate(self,):
        self.migrations.sort(key=lambda x: x.from_version)
        for (migration_before, migration_after) in zip(self.migrations, self.migrations[1:]):
            assert migration_before.to_version <= migration_after.from_version

    def get_current_conf_version(self):
        return self.migrations[len(self.migrations) - 1].to_version

    def select_migrations(self, from_version):
        """Selects all migrations from from_version to the latest one"""
        self.validate()
        print("Select how to migrate from %s from avail: %s" % (from_version, self.migrations))
        return [
            migration
            for migration in self.migrations
            if migration.from_version >= from_version
        ]

VERSIONS_MIGRATION_LIBRARY = VersionMigrationsLibrary()

def declare_version_migration(from_version, to_version, operations):
    vm = VersionMigration(from_version, to_version, operations)
    VERSIONS_MIGRATION_LIBRARY.register(vm)


class VersionMigration:
    def __init__(self, from_version, to_version, operations):
        assert from_version < to_version
        self.from_version = from_version
        self.to_version = to_version
        self.operations = operations

    def execute(self, diphome, node_type, simulate=False):
        print("\n")
        print(self)
        for operation in self.operations:
            print(" - ", operation)
            if not simulate:

                if isinstance(operation, ProjectLocalMigrationOperation):
                    print("  (Wrapped)")
                    wrapper = GlobalProjectMigrationOperation(operation)
                    wrapper.execute(diphome)
                elif node_type in operation.appliesTo():
                    operation.execute(diphome)
        print("\n")
        sys.stdout.flush()

    def post_execute(self, diphome, node_type):
        for operation in self.operations:
            print("Post-execute: %s" % operation)
            sys.stdout.flush()
            if isinstance(operation, ProjectLocalMigrationOperation):
                pass
            elif node_type in operation.appliesTo():
                operation.post_execute(diphome)

    def __repr__(self,):
        return "%s -> %s" % (self.from_version, self.to_version)

def write_version(dip_home):
    newInstallDir = os.environ["DKUINSTALLDIR"]
    newProductVersion = json.loads(open(osp.join(newInstallDir, "dss-version.json")).read())
    dip_home.set_version(VERSIONS_MIGRATION_LIBRARY.get_current_conf_version(),
        newProductVersion["product_version"], newProductVersion["product_commitid"])

################################################################
# Parse legacy configuration files
################################################################

def get_node_type(dh):
    current_version = dh.get_conf_version()
    if current_version < 10:
        # Only design node
        return "design"
    elif current_version == 10:
        # Check for install.properties file
        fp = osp.join(dh.path, "install.properties")
        props = {}
        if osp.isfile(fp):
            with open(fp, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        chunks = line.split("=")
                        props[chunks[0].strip()] = chunks[1].strip('" \t')
        return props.get("dss.nodetype", "design")
    else:
        # Look in install.ini file
        return dh.get_install_config().getNodeType()


################################################################
# Populate migration library
################################################################

import steps
