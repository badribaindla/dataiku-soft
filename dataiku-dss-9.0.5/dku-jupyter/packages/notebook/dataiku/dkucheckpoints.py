"""
File-based Checkpoints implementations.
"""
import os
from . import pintercom_json_post

from notebook.dataiku.requestcontextfactory import RequestContextFactory
from notebook.dataiku.security import DataikuJupyterSecurity
from notebook.services.contents.filecheckpoints import FileCheckpoints
from tornado.web import HTTPError

from ipython_genutils.py3compat import getcwd
from traitlets import Unicode

from .utils import to_os_path

class DataikuCheckpoints(FileCheckpoints):
    """
    A Checkpoints that caches checkpoints for files in adjacent
    directories.

    Only works with FileContentsManager.  Use GenericFileCheckpoints if
    you want file-based checkpoints with another ContentsManager.
    """

    checkpoint_dir = Unicode(
        '.ipynb_checkpoints',
        config=True,
        help="""The directory name in which to keep file checkpoints

        This is a path relative to the file's own directory.

        By default, it is .ipynb_checkpoints
        """,
    )

    root_dir = Unicode(config=True)

    def _root_dir_default(self):
        try:
            return self.parent.root_dir
        except AttributeError:
            return getcwd()

    # _get_os_path is a method defined in FileCheckpoints that we want to override
    def _get_os_path(self, path):
        """Given an API path, return its file system path.

        Parameters
        ----------
        path : string
            The relative API path to the named file.

        Returns
        -------
        path : string
            Native, absolute OS path to for a file.

        Raises
        ------
        404: if path is outside root
        """
        # Here the variable "root_dir" point to the jupyter "ipython_notebooks" folder (aka dss-home/config/ipython_notebooks)
        # We need to transform it to be "dss-home/config/projects"
        root = os.path.abspath(os.path.join(self.root_dir, "..", "projects"))

        # Transform path from $PROJECT/$FOLDER/$FILE
        # to dss-home/config/projects/$PROJECT/ipython_notebooks/$FOLDER/$FILE
        os_path = to_os_path(path, root)
        # Checking if the user did not asked for a file outside of its project (aka if neither $FOLDER or $File contains funny stuff)
        if not (os.path.abspath(os_path)).startswith(root):
            raise HTTPError(404, "%s is outside root contents directory" % path)
        return os_path

    # ContentsManager-dependent checkpoint API
    def create_checkpoint(self, contents_mgr, path):
        """Create a checkpoint."""
        checkpoint_id = u'checkpoint'
        dest_path = self.checkpoint_path(checkpoint_id, path)
        self._save_checkpoint_through_DSS(path)
        return self.checkpoint_model(checkpoint_id, dest_path)

    def restore_checkpoint(self, contents_mgr, checkpoint_id, path):
        """Restore a checkpoint."""
        self._restore_checkpoint_through_DSS(path)

    # ContentsManager-independent checkpoint API
    def rename_checkpoint(self, checkpoint_id, old_path, new_path):
        """Rename a checkpoint from old_path to new_path."""
        self._rename_checkpoint_through_DSS(old_path, new_path)

    def delete_checkpoint(self, checkpoint_id, path):
        """delete a file's checkpoint"""
        self._delete_checkpoint_through_DSS(path)

    def _save_checkpoint_through_DSS(self, path):
        """Save a notebook to an path."""
        handler = RequestContextFactory.data().get('handler')
        user = DataikuJupyterSecurity.get_user(handler)
        if path.startswith(os.path.sep):
            path = path[1:]

        if user is not None:
            # path looks like '/$project_key/$file_name'
            splitted_path = path.split(os.path.sep)
            project_key = splitted_path[0]
            # file name without extension .ipynb
            file_name = os.path.splitext(os.path.sep.join(splitted_path[1:]))[0]
            self.log.info('User "%s" commit checkpoint associated to notebook "%s" on project "%s".', user, file_name, project_key)
            commited_checkpoint_name = pintercom_json_post(
                "jupyter/git-commit-checkpoint",
                {
                    "projectKey" : project_key,
                    "fileName" : file_name,
                    "user" : user
                })
            self.log.info('Checkpoint updated: "%s".', commited_checkpoint_name)
        else:
            self.log.error("No authorization token, commit not saved.")
            raise HTTPError(403, "No authorization token")

    def _restore_checkpoint_through_DSS(self, path):
        """Save a notebook to an path."""
        handler = RequestContextFactory.data().get('handler')
        user = DataikuJupyterSecurity.get_user(handler)

        if path.startswith(os.path.sep):
            path = path[1:]

        if user is not None:
            # path looks like '/$project_key/$file_name'
            splitted_path = path.split(os.path.sep)
            project_key = splitted_path[0]
            # file name without extension .ipynb
            file_name = os.path.splitext(os.path.sep.join(splitted_path[1:]))[0]
            self.log.info('User "%s" restore notebook "%s" on project "%s".', user, file_name, project_key)
            restored_checkpoint_name = pintercom_json_post(
                "jupyter/git-restore-checkpoint",
                {
                    "projectKey" : project_key,
                    "fileName" : file_name,
                    "user" : user
                })
            self.log.info('Checkpoint restored: "%s".', restored_checkpoint_name)
        else:
            self.log.error("No authorization token, commit not saved.")
            raise HTTPError(403, "No authorization token")

    def _rename_checkpoint_through_DSS(self, old_path, new_path):
        """Save a notebook to an path."""
        handler = RequestContextFactory.data().get('handler')
        user = DataikuJupyterSecurity.get_user(handler)

        if old_path.startswith(os.path.sep):
            old_path = old_path[1:]
        if new_path.startswith(os.path.sep):
            new_path = new_path[1:]

        if user is not None:
            # path looks like '/$project_key/$file_name'
            splitted_path = old_path.split(os.path.sep)
            project_key = splitted_path[0]

            # file name without extension .ipynb
            old_file_name = os.path.splitext(os.path.sep.join(splitted_path[1:]))[0]
            new_file_name = os.path.splitext(os.path.sep.join(new_path.split(os.path.sep)[1:]))[0]

            self.log.info('User "%s" rename checkpoint associated to notebook "%s" into "%s" on project "%s".',
                          user, old_file_name, new_file_name, project_key)
            renamed_checkpoint_name = pintercom_json_post(
                "jupyter/git-rename-checkpoint",
                {
                    "projectKey" : project_key,
                    "oldFileName" : old_file_name,
                    "newFileName" : new_file_name,
                    "user" : user
                })
            self.log.info('Checkpoint renamed: "%s".', renamed_checkpoint_name)
        else:
            self.log.error("No authorization token, commit not saved.")
            raise HTTPError(403, "No authorization token")

    def _delete_checkpoint_through_DSS(self, path):
        """Save a notebook to an path."""
        raise HTTPError(404, "You cannot delete directly a checkpoint")
