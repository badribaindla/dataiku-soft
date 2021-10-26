import datetime
import os
import shutil
from os import path as osp

import base


class BackupData:

    def __init__(self, basepath):
        self.basepath = basepath
        self.marker_file = osp.join(basepath, "DSS-MIGRATION-IN-PROGRESS.json")
        self.timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        self.backupdir = "_pre_migration_backup_%s" % self.timestamp
        self.entries = []

    def create_backupdir(self):
        dirname = osp.join(self.basepath, self.backupdir)
        if not osp.isdir(dirname):
            os.mkdir(dirname)

    def backup_file(self, filepath):
        self.create_backupdir()
        entry = {
            "initial" : filepath,
            "backup" : osp.join(self.backupdir, filepath.replace("/", "__"))
        }
        shutil.copyfile(
            osp.join(self.basepath, entry["initial"]),
            osp.join(self.basepath, entry["backup"]))

        self.entries.append(entry)

    def backup_dir(self, dirpath):
        self.create_backupdir()
        entry = {
            "initial" : dirpath,
            "backup" : osp.join(self.backupdir, dirpath.replace("/", "__"))
        }
        shutil.copytree(
            osp.join(self.basepath, entry["initial"]),
            osp.join(self.basepath, entry["backup"]))

        self.entries.append(entry)

    def save(self):
        base.json_dumpf(self.marker_file, {
            "timestamp" : self.timestamp,
            "entries" : self.entries
        })

    # Attempt to load an existing backup file, return True upon success
    def load(self):
        if osp.isfile(self.marker_file):
            mapping = base.json_loadf(self.marker_file)
            self.entries = mapping["entries"]
            return True
        else:
            return False

    def restore(self):
        """Restores a backup, but does not warn nor remove the marker"""

        # FIXME: This is not actually completely safe because we could crash during this operation

        savedir = osp.join(self.basepath, "_broken_migration_backup_%s" % self.timestamp)
        if not osp.isdir(savedir):
            os.mkdir(savedir)
        for entry in self.entries:
            broken = entry["initial"]
            new_backup = osp.join(savedir, broken.replace("/", "__"))

            if osp.exists(osp.join(self.basepath, broken)):
                print("Backing up partially-migrated: %s -> %s" % (broken, new_backup))
                shutil.move(osp.join(self.basepath, broken),
                            osp.join(self.basepath, new_backup))
            else:
                print("Partially-migrated file not found: %s" % broken)

            print("Restoring backup: %s -> %s" % (entry["backup"], entry["initial"]))
            shutil.move(osp.join(self.basepath, entry["backup"]),
                        osp.join(self.basepath, entry["initial"]))

    def delete(self):
        if osp.exists(self.marker_file):
            os.remove(self.marker_file)
        self.entries = []
