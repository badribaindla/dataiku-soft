import os
from datetime import datetime
import re

import nbformat
from . import pintercom_json_post

from notebook.services.contents.filemanager import FileContentsManager

from tornado.web import HTTPError

from notebook import _tz as tz
from notebook.utils import is_hidden
import json

from .requestcontextfactory import RequestContextFactory
from .security import DataikuJupyterSecurity
from .utils import to_os_path

try:
    from os.path import samefile
except ImportError:
    # windows + py2
    from notebook.utils import samefile_simple as samefile

class DataikuContentsManager(FileContentsManager):

    # _get_os_path is a method defined in FileContentsManager that we want to override
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


    def _save_directory(self, os_path, model, path=''):
        """create a directory"""
        if is_hidden(os_path, self.root_dir) and not self.allow_hidden:
            raise HTTPError(400, u'Cannot create hidden directory %r' % os_path)
        if not os.path.exists(os_path):
            with self.perm_to_403():
                os.mkdir(os_path)
        elif not os.path.isdir(os_path):
            raise HTTPError(400, u'Not a directory: %s' % (os_path))
        else:
            self.log.debug("Directory %r already exists", os_path)

    def get(self, path, content=True, type=None, format=None):
        """ Takes a path for an entity and returns its model

        Parameters
        ----------
        path : str
            the API path that describes the relative path for the target
        content : bool
            Whether to include the contents in the reply
        type : str, optional
            The requested type - 'file', 'notebook', or 'directory'.
            Will raise HTTPError 400 if the content doesn't match.
        format : str, optional
            The requested format for file contents. 'text' or 'base64'.
            Ignored if this returns a notebook or directory model.

        Returns
        -------
        model : dict
            the contents model. If content=True, returns the contents
            of the file or directory as well.
        """
        path = path.strip(os.path.sep)

        if path:
            if not self.exists(path):
                raise HTTPError(404, u'No such file or directory: %s' % path)

            os_path = self._get_os_path(path)
            if os.path.isdir(os_path):
                if type not in (None, 'directory'):
                    raise HTTPError(400,
                                        u'%s is a directory, not a %s' % (path, type), reason='bad type')
                model = self._dir_model(path, content=content)
            elif type == 'notebook' or (type is None and path.endswith('.ipynb')):
                model = self._notebook_model(path, content=content)
            else:
                if type == 'directory':
                    raise HTTPError(400,
                                        u'%s is not a directory' % path, reason='bad type')
                model = self._file_model(path, content=content, format=format)
            return model
        else:
            # The user is asking for the root folder.
            # We need to ask DSS about the folder list.
            if type not in (None, 'directory'):
                raise HTTPError(400, u'%s can only be a %s' % (path, type), reason='bad type')
            return self._get_folders()

    def _get_folders(self):
        """
        Ask DSS the list of the projects available to to user and format the list to display them nicely.
        :return:
        """
        # Create the base model.
        contents = []
        handler = RequestContextFactory.data().get('handler')
        for name in DataikuJupyterSecurity.list_authorized_projects(handler):
            if name and self.exists(name):
                contents.append(self.get(path='/%s' % (name), content=False))
        model = {
            "name": "",
            "path": "/",
            "last_modified": datetime(1970, 1, 1, 0, 0, tzinfo=tz.UTC),
            "created": datetime(1970, 1, 1, 0, 0, tzinfo=tz.UTC),
            "format": None,
            "mimetype": None,
            "writable": False,
            "type": 'directory',
            "content": contents,
            "format": 'json'
        }

        return model


    # This is almost a copy of the inherited copy method.
    # Only difference it the addition of the is_copy parameter in the call to self.save at the end (and the copy_pat line)
    # This serves the puropose to be able to inform the DKU backend that a notebook was created throught the copy notebook menu button
    def copy(self, from_path, to_path=None):
        """Copy an existing file and return its new model.

        If to_path not specified, it will be the parent directory of from_path.
        If to_path is a directory, filename will increment `from_path-Copy#.ext`.

        from_path must be a full path to a file.
        """
        copy_pat = re.compile(r'\-Copy\d*\.')

        path = from_path.strip('/')
        if to_path is not None:
            to_path = to_path.strip('/')

        if '/' in path:
            from_dir, from_name = path.rsplit('/', 1)
        else:
            from_dir = ''
            from_name = path
        
        model = self.get(path)
        model.pop('path', None)
        model.pop('name', None)
        if model['type'] == 'directory':
            raise HTTPError(400, "Can't copy directories")
        
        if to_path is None:
            to_path = from_dir
        if self.dir_exists(to_path):
            name = copy_pat.sub(u'.', from_name)
            to_name = self.increment_filename(name, to_path, insert='-Copy')
            to_path = u'{0}/{1}'.format(to_path, to_name)
    
        model = self.save(model, to_path, is_copy=True)
        return model


    def save(self, model, path='', is_copy=False):
        """Save the file model and return the model with no content."""
        path = path.strip(os.path.sep)

        if 'type' not in model:
            raise HTTPError(400, u'No file type provided')
        if 'content' not in model and model['type'] != 'directory':
            raise HTTPError(400, u'No file content provided')

        os_path = self._get_os_path(path)
        self.log.debug("Saving %s", os_path)

        self.run_pre_save_hook(model=model, path=path)

        try:
            if model['type'] == 'notebook':
                nb = nbformat.from_dict(model['content'])
                self.check_and_sign(nb, path)
                self._save_notebook_through_DSS(path, nb, is_copy)
                # One checkpoint should always exist for notebooks.
                if not self.checkpoints.list_checkpoints(path):
                    self.create_checkpoint(path)
            elif model['type'] == 'file':
                # Missing format will be handled internally by _save_file.
                self._save_file(os_path, model['content'], model.get('format'))
            elif model['type'] == 'directory':
                self._save_directory(os_path, model, path)
            else:
                raise HTTPError(400, "Unhandled contents type: %s" % model['type'])
        except HTTPError:
            raise
        except Exception as e:
            self.log.error(u'Error while saving file: %s %s', path, e, exc_info=True)
            raise HTTPError(500, u'Unexpected error while saving file: %s %s' % (path, e))

        validation_message = None
        if model['type'] == 'notebook':
            self.validate_notebook_model(model)
            validation_message = model.get('message', None)

        model = self.get(path, content=False)
        if validation_message:
            model['message'] = validation_message

        self.run_post_save_hook(model=model, os_path=os_path)

        return model

    def delete_file(self, path):
        """Delete file at path."""
        path = path.strip(os.path.sep)

        os_path = self._get_os_path(path)

        # Should we proceed with the move?
        if not os.path.exists(os_path):
            raise HTTPError(409, u'File does not exists: %s' % path)

        # Move the file
        try:
            with self.perm_to_403():
                self._delete_notebook_through_DSS(path)
        except HTTPError:
            raise
        except Exception as e:
            raise HTTPError(500, u'Unknown error while deleting file: %s %s' % (path, e))

    def rename_file(self, old_path, new_path):
        """Rename a file."""
        old_path = old_path.strip(os.path.sep)
        new_path = new_path.strip(os.path.sep)
        if new_path == old_path:
            return

        new_os_path = self._get_os_path(new_path)
        old_os_path = self._get_os_path(old_path)

        # Should we proceed with the move?
        if os.path.exists(new_os_path) and not samefile(old_os_path, new_os_path):
            raise HTTPError(409, u'File already exists: %s' % new_path)

        # Move the file
        try:
            with self.perm_to_403():
                self._move_notebook_through_DSS(old_path, new_path)
        except HTTPError:
            raise
        except Exception as e:
            raise HTTPError(500, u'Unknown error renaming file: %s %s' % (old_path, e))

    def _save_notebook_through_DSS(self, path, notebook, is_copy=False):
        """Save a notebook to an path."""
        handler = RequestContextFactory.data().get('handler')
        user = DataikuJupyterSecurity.get_user(handler)

        if user is not None:
            # path looks like '/$project_key/$file_name'
            splitted_path = path.split(os.path.sep)
            project_key = splitted_path[0]
            # file name without extension .ipynb
            file_name = os.path.splitext(os.path.sep.join(splitted_path[1:]))[0]

            self.log.info('User "%s" commit notebook "%s" on project "%s".', user, file_name, project_key)
            commited_file_name = pintercom_json_post(
                "jupyter/git-commit-notebook",
                {
                    "projectKey" : project_key,
                    "fileName" : file_name,
                    "user" : user,
                    "isCopy": is_copy
                },
                file = json.dumps(notebook))
            self.log.info('Notebook updated: "%s".', commited_file_name)
        else:
            self.log.error("No authorization token, file not saved.")
            raise HTTPError(403, "No authorization token")

    def _move_notebook_through_DSS(self, old_path, new_path):
        """Save a notebook to an path."""
        handler = RequestContextFactory.data().get('handler')
        user = DataikuJupyterSecurity.get_user(handler)

        if user is not None:
            # path looks like '/$project_key/$file_name'
            splitted_path = old_path.split(os.path.sep)
            project_key = splitted_path[0]

            # file name without extension .ipynb
            old_file_name = os.path.splitext(os.path.sep.join(splitted_path[1:]))[0]
            new_file_name = os.path.splitext(os.path.sep.join(new_path.split(os.path.sep)[1:]))[0]

            self.log.info('User "%s" rename notebook "%s" into "%s" on project "%s".', user, old_file_name, new_file_name, project_key)
            renamed_file_name = pintercom_json_post(
                "jupyter/git-rename-notebook",
                {
                    "projectKey" : project_key,
                    "oldFileName" : old_file_name,
                    "newFileName" : new_file_name,
                    "user" : user
                })
            self.log.info('Notebook renamed: "%s".', renamed_file_name)
        else:
            self.log.error("No authorization token, file not renamed.")
            raise HTTPError(403, "No authorization token")

    def _delete_notebook_through_DSS(self, path):
        """Save a notebook to an path."""
        handler = RequestContextFactory.data().get('handler')
        user = DataikuJupyterSecurity.get_user(handler)

        if user is not None:
            # path looks like '/$project_key/$file_name'
            splitted_path = path.split(os.path.sep)
            project_key = splitted_path[0]
            # file name without extension .ipynb
            file_name = os.path.splitext(os.path.sep.join(splitted_path[1:]))[0]
            self.log.info('User "%s" delete notebook "%s"on project "%s".', user, file_name, project_key)
            deleted_file_name = pintercom_json_post(
                "jupyter/git-delete-notebook",
                {
                    "projectKey" : project_key,
                    "fileName" : file_name,
                    "user" : user
                })
            self.log.info('Notebook deleted: "%s".', deleted_file_name)
        else:
            self.log.error("No authorization token, file not deleted.")
            raise HTTPError(403, "No authorization token")
