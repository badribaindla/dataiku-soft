import sys
import dataikuapi
from .auth import get_or_create_api_key
import argparse
import os, os.path as osp

######################
# Init connection
######################

key = get_or_create_api_key()
port = int(os.environ["DKU_BACKEND_PORT"])
client = dataikuapi.DSSClient("http://127.0.0.1:%s" % port, key)

node_type = os.environ.get("DKU_NODE_TYPE", "design")


######################
# Commands definition
######################

parser = argparse.ArgumentParser(description="Manage the local DSS Node (Design or Automation)")
subparsers = parser.add_subparsers(help="command to execute")

####### API services

from . import security_commands

security_commands.declare_users_list(subparsers, client)
security_commands.declare_user_create(subparsers, client)
security_commands.declare_user_edit(subparsers, client)
security_commands.declare_user_delete(subparsers, client)
security_commands.declare_api_keys_list(subparsers, client)
security_commands.declare_api_key_create(subparsers, client)
security_commands.declare_api_key_edit(subparsers, client)
security_commands.declare_api_key_delete(subparsers, client)
security_commands.declare_invalidate_conf_cache(subparsers, client)
security_commands.declare_set_license(subparsers, client)

from . import groups_commands

####### Groups

groups_commands.declare_groups_list(subparsers, client)
groups_commands.declare_group_create(subparsers, client)
groups_commands.declare_group_edit(subparsers, client)
groups_commands.declare_group_delete(subparsers, client)

from . import connections_commands

####### Connections

connections_commands.declare_connections_list(subparsers, client)


from . import codeenvs_commands

####### Code envs

codeenvs_commands.declare_codeenvs_list(subparsers, client)
codeenvs_commands.declare_codeenv_update(subparsers, client)
codeenvs_commands.declare_codeenv_rebuild_images(subparsers, client)


from . import containers_commands

####### Containers

containers_commands.declare_push_base_images(subparsers, client)


from . import projects_commands

####### Projects

projects_commands.declare_projects_list(subparsers, client)
projects_commands.declare_project_export(subparsers, client)
projects_commands.declare_project_import(subparsers, client)
projects_commands.declare_project_delete(subparsers, client)


from . import managed_folders_commands

####### Managed Folders

managed_folders_commands.declare_managed_folders_list(subparsers, client)
managed_folders_commands.declare_managed_folder_list_contents(subparsers, client)
managed_folders_commands.declare_managed_folder_get_file(subparsers, client)

####### Bundles

if node_type == "design":
	projects_commands.declare_bundles_list_exported(subparsers, client)
	projects_commands.declare_bundle_export(subparsers, client)
	projects_commands.declare_bundle_download_archive(subparsers, client)

elif node_type == "automation":
	projects_commands.declare_bundles_list_imported(subparsers, client)
	projects_commands.declare_bundle_import(subparsers, client)
	projects_commands.declare_bundle_activate(subparsers, client)
	projects_commands.declare_project_create_from_bundle(subparsers, client)

####### Jobs

from . import jobs_commands

jobs_commands.declare_jobs_list(subparsers, client)
jobs_commands.declare_build(subparsers, client)
jobs_commands.declare_job_abort(subparsers, client)
jobs_commands.declare_job_status(subparsers, client)

####### Scenarios

from . import scenarios_commands

scenarios_commands.declare_scenarios_list(subparsers, client)
scenarios_commands.declare_scenario_runs_list(subparsers, client)
scenarios_commands.declare_scenario_run(subparsers, client)
scenarios_commands.declare_scenario_abort(subparsers, client)

####### Datasets

from . import datasets_commands

datasets_commands.declare_datasets_list(subparsers, client)
datasets_commands.declare_dataset_schema_dump(subparsers, client)
datasets_commands.declare_dataset_list_partitions(subparsers, client)
datasets_commands.declare_dataset_clear(subparsers, client)
datasets_commands.declare_dataset_delete(subparsers, client)

####### API services

from . import apiservices_commands

apiservices_commands.declare_api_services_list(subparsers, client)
apiservices_commands.declare_api_service_package_create(subparsers, client)

######################
# Main
######################

args = parser.parse_args()
# Python 3.6 argument parser does not exit if subcommand is missing?
if "func" not in args:
    print ("Missing subcommand, use -h for help")
    sys.exit(1)
args.func(args, client)
