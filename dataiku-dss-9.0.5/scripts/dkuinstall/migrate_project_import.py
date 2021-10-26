from __future__ import print_function
from os import path as osp
import logging
import sys
import json

import base
import migration_base
import steps

"""
On the fly migration of an imported project
"""

def migrate(import_path, current_version):
    base._sanity_check()

    migrations = migration_base.VERSIONS_MIGRATION_LIBRARY.select_migrations(current_version)
    print("Selected %s" % migrations)

    project_paths = migration_base.ProjectPaths(
        config=osp.join(import_path, "project_config"),
        managed_fs_datasets=osp.join(import_path, "managed_datasets"),
        managed_folders=osp.join(import_path, "managed_folders"),
        analysis_data=osp.join(import_path, "analysis-data"),
        saved_models = osp.join(import_path, "saved_models"),
        # Do not use the jupyter_notebooks path post 9.0.0 but rather
        # osp.join(project_paths.config, "ipython_notebooks")
        jupyter_notebooks = osp.join(import_path, "ipython_notebooks"),
        jupyter_exports = osp.join(import_path, "jupyter_exports"))

    if migrations:
        print("Executing the following PROJECT-SPECIFIC migrations")
        for migration in migrations:
            print(migration)
            for operation in migration.operations:
                if isinstance(operation, migration_base.ProjectLocalMigrationOperation):
                    print(" - ", operation)

        # No validation nor backup for project migration
        for migration in migrations:
            print(migration)
            for operation in migration.operations:
                if isinstance(operation, migration_base.ProjectLocalMigrationOperation):
                    print(" - ", operation)
                    operation.execute(project_paths)

        # collect additions to the manifest                    
        additions = {}
        for migration in migrations:
            print(migration)
            for operation in migration.operations:
                if isinstance(operation, migration_base.ProjectLocalMigrationOperation):
                    print(" - ", operation)
                    operation.get_manifest_additions(additions, project_paths)
        if len(additions) > 0:
            with open(osp.join(import_path, "export-manifest-additions.json"), "w") as f:
                json.dump(additions, f)

    else:
        print("NO MIGRATION for %s" % current_version)

    # TODO: post-migrations for project-import ?

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("""Bad usage""", file=sys.stderr)
        sys.exit(1)

    migrate(sys.argv[1], int(sys.argv[2]))
