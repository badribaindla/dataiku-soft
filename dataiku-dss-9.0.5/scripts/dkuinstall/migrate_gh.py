from __future__ import print_function
from six import reraise
from six.moves import input
from os import path as osp
import os
import datetime
import sys

import base
import migration_base
import migration_backup
import envfiles


def migrate(dip_home_path):
    base._sanity_check()

    dip_home = base.DipHome(dip_home_path)

    backup = migration_backup.BackupData(dip_home_path)
    if backup.load():
        print("***************************************************")
        print("* PREVIOUS GH MIGRATION WAS ABORTED, ROLLING BACK *")
        print("***************************************************")
        backup.restore()
        print("Restore complete, removing marker file")
        backup.delete()

    assert not backup.load()

    try:
        # First, migrate the configuration before upgrading the binary links
        current_version = dip_home.get_conf_version()
        node_type = migration_base.get_node_type(dip_home)
        assert node_type == 'gh'
        # migrations = migration_base.VERSIONS_MIGRATION_LIBRARY.select_migrations(current_version)
        # if migrations:

        #     print("Executing the following migrations")
        #     for migration in migrations:
        #         migration.execute(dip_home, node_type, simulate=True)
        #     if os.getenv("DKU_MIGRATE_YES") is None:
        #         print("Continue? (Y/[N])", end="")
        #         sys.stdout.flush()
        #         if "y" != input().strip().lower():
        #             print("Aborting!")
        #             sys.exit(1)

        #     backup.backup_file("dss-version.json")
        #     backup.backup_file("bin/env-default.sh")
        #     for fname in [ "install.properties", "install.ini", "bin/env-spark.sh" ]:
        #         if osp.isfile(osp.join(dip_home.path, fname)):
        #             backup.backup_file(fname)

        #     # not needed for the pre-4.0 layout, the bugs we know and which require the backup are for 4.0+ 
        #     if os.getenv("DKU_MIGRATE_NOBACKUP") is None:
        #         if osp.isdir(osp.join(dip_home.path, "databases")):
        #             backup.backup_dir("databases")
                
        #     if os.getenv("DKU_MIGRATE_NOBACKUP") is None:
        #         print("Backing up your config ...")
        #         backup.backup_dir("config")

        #     backup.save()

        #     for migration in migrations:
        #         migration.execute(dip_home, node_type)

        # Write the final version
        migration_base.write_version(dip_home)
        # Update env-default
        envfiles.write_envdefault(dip_home)

        # Update the binary links
        base.link_gh_binaries(dip_home, os.environ["DKUINSTALLDIR"])
        base.generate_supervisor_key(dip_home)
        base.ensure_required_dss_files(dip_home)

        # We can now run "Post-upgrade" migrations (for java migrations needing the new binaries)
        # if migrations is not None:
        #     print("Executing post-migrations")
        #     for migration in migrations:
        #         migration.post_execute(dip_home, node_type)

        #     #raise Exception("boom")

        #     print("Migration done, removing marker")
        #     backup.delete()

    except Exception as e:
        print("******************************************")
        print("* MIGRATION FAILED")
        print("******************************************")
        print("* Attempting to rollback")
        backup.restore()
        print("Restore complete, removing marker file")
        backup.delete()
        reraise(*sys.exc_info())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("""
        Usage:
            migrate.py <dip_home>
        """, file=sys.stderr)
        sys.exit(1)

    migrate(sys.argv[1])
