import sys
import dataikuapi
from .auth import get_or_create_api_key
import argparse
import os
######################
# Init connection
######################

key = get_or_create_api_key()
port = int(os.environ["DKU_APIMAIN_PORT"])
client = dataikuapi.APINodeAdminClient("http://127.0.0.1:%s" % port, key)

######################
# Commands definition
######################

parser = argparse.ArgumentParser(description="Manage the local DSS API Node")
subparsers = parser.add_subparsers(help="command to execute")

from . import services_commands
services_commands.declare_services_list(subparsers, client)
services_commands.declare_service_create(subparsers, client)
services_commands.declare_service_delete(subparsers, client)

from . import generations_commands
generations_commands.declare_service_import_generation(subparsers, client)
generations_commands.declare_service_preload_generation(subparsers, client)
generations_commands.declare_list_generations(subparsers, client)

from . import servicestate_commands
servicestate_commands.declare_service_switch_to_newest(subparsers, client)
servicestate_commands.declare_service_switch_to_generation(subparsers, client)
servicestate_commands.declare_service_set_mapping(subparsers, client)
servicestate_commands.declare_service_enable(subparsers, client)
servicestate_commands.declare_service_disable(subparsers, client)

from . import auth_commands
auth_commands.declare_admin_key_create(subparsers, client)
auth_commands.declare_admin_keys_list(subparsers, client)
auth_commands.declare_admin_key_delete(subparsers, client)

from . import misc_commands
misc_commands.declare_metrics_get(subparsers, client)
misc_commands.declare_predict(subparsers, client)

######################
# Main
######################

args = parser.parse_args()
# Python 3.6 argument parser does not exit if subcommand is missing?
if "func" not in args:
    print ("Missing subcommand, use -h for help")
    sys.exit(1)
args.func(args, client)
