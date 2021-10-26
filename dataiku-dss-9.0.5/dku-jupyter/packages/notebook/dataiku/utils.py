import os


def to_os_path(path, root=''):
    """Convert an API path to a filesystem path

    If given, root will be prepended to the path.
    root must be a filesystem path already.

    Jupyter ask for the path $PROJECT/($FOLDER/)$NOTEBOOK_FILE but this is a virtual filesystem.
    We need to transform this path to match the real filesystem: dss-home/config/project/$PROJECT/ipython_notebooks/($FOLDER/)$$NOTEBOOK_FILE
    """
    parts = path.strip(os.path.sep).split(os.path.sep)
    parts = [p for p in parts if p != '']  # remove duplicate splits
    parts.insert(1, "ipython_notebooks")

    # Here the variable "root" point to the DSS config file folder (aka dss-home/config/project)
    path = os.path.join(root, *parts)
    return path
