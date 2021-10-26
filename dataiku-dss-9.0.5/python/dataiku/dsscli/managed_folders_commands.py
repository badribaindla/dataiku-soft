import shutil
import sys
from .utils import add_formatting_args, p_format_arr, timestamp_to_date


def managed_folders_list(cmdargs, apiclient):
    project = apiclient.get_project(cmdargs.project_key)
    managed_folders = project.list_managed_folders()
    retrieved_cols = ["name", "type", "id"]
    header_cols = ["Name", "Type", "Id"]
    ret = [[mf[col] for col in retrieved_cols] for mf in managed_folders]
    p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_managed_folders_list(subparsers, apiclient):
    p = subparsers.add_parser("managed-folders-list", help="List managed folders of a project")
    p.add_argument("project_key", help="Project key of the managed folders")
    add_formatting_args(p)
    p.set_defaults(func=managed_folders_list, apiclient=apiclient)

def managed_folder_list_contents(cmdargs, apiclient):
    managed_folder = apiclient.get_project(cmdargs.project_key).get_managed_folder(cmdargs.managed_folder_id)
    items = managed_folder.list_contents().get("items", [])
    retrieved_cols = ["path", "size", "lastModified"]
    header_cols = ["Path", "Size", "Last Modified"]
    ret = [[item["path"], item["size"], timestamp_to_date(item["lastModified"])] for item in items]
    p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_managed_folder_list_contents(subparsers, apiclient):
    p = subparsers.add_parser("managed-folder-list-contents", help="List contents of a managed folder")
    p.add_argument("project_key", help="Project key of the managed folders")
    p.add_argument("managed_folder_id", help="Managed folder id")
    add_formatting_args(p)
    p.set_defaults(func=managed_folder_list_contents, apiclient=apiclient)

def managed_folder_get_file(cmdargs, apiclient):
    managed_folder = apiclient.get_project(cmdargs.project_key).get_managed_folder(cmdargs.managed_folder_id)
    mff = managed_folder.get_file(cmdargs.file_path)

    if cmdargs.output_file is not None:
        with open(cmdargs.output_file, "wb") as f:
            shutil.copyfileobj(mff.raw, f)
    else:
        for content in mff.iter_content(chunk_size=4096):
            sys.stdout.write(content)

def declare_managed_folder_get_file(subparsers, apiclient):
    p = subparsers.add_parser("managed-folder-get-file", help="Retrieve a file from a managed folder")
    p.add_argument("project_key", help="Project key of the managed folders")
    p.add_argument("managed_folder_id", help="Managed folder id")
    p.add_argument("file_path", help="File path")
    p.add_argument("--output-file", dest="output_file", help="Path to output file")
    p.set_defaults(func=managed_folder_get_file, apiclient=apiclient)
