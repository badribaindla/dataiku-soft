from dataiku.dsscli import utils
from dataiku.dsscli.utils import add_formatting_args, p_format_arr


def groups_list(cmdargs, apiclient):
    groups = apiclient.list_groups()

    if groups and len(groups) > 0:
        retrieved_cols = ["name", "admin", "description", "sourceType"]
        if cmdargs.with_permissions:
            retrieved_cols += [col for col in groups[0].keys() if col not in retrieved_cols]
        ret = [[group[col] for col in retrieved_cols] for group in groups]
        p_format_arr(ret, retrieved_cols, retrieved_cols, cmdargs)

def declare_groups_list(subparsers, apiclient):
    p = subparsers.add_parser("groups-list", help="List groups")
    p.add_argument("--with-permissions", action="store_true", dest="with_permissions", help="Display permissions for each group")
    add_formatting_args(p)
    p.set_defaults(func=groups_list, apiclient=apiclient)

def group_create(cmdargs, apiclient):
    group = apiclient.create_group(cmdargs.name, cmdargs.description, cmdargs.source_type)

    group_def = group.get_definition()
    utils.add_permissions_fields_to_definition(cmdargs, group_def)

    group.set_definition(group_def)

def declare_group_create(subparsers, apiclient):
    p = subparsers.add_parser("group-create", help="Create a group")
    p.add_argument("name", help="New group name")
    p.add_argument("--description", dest="description", help="New group description", default="")
    p.add_argument("--source-type", help="New user source type (LOCAL or LDAP) (default LOCAL)", dest="source_type", default="LOCAL")
    utils.add_permissions_fields_to_parser(p)
    p.set_defaults(func=group_create, apiclient=apiclient)

def group_edit(cmdargs, apiclient):
    group = apiclient.get_group(cmdargs.name)

    group_def = group.get_definition()
    utils.add_field_to_definition(cmdargs, "description", group_def)
    utils.add_field_to_definition(cmdargs, "sourceType", group_def)
    utils.add_permissions_fields_to_definition(cmdargs, group_def)

    group.set_definition(group_def)

def declare_group_edit(subparsers, apiclient):
    p = subparsers.add_parser("group-edit", help="Edit a group")
    p.add_argument("name", help="Name of group to edit")
    p.add_argument("--description", dest="description", help="New group description")
    p.add_argument("--source-type", help="New user source type (LOCAL or LDAP) (default LOCAL)", dest="sourceType")
    utils.add_permissions_fields_to_parser(p)
    p.set_defaults(func=group_edit, apiclient=apiclient)

def group_delete(cmdargs, apiclient):
    group = apiclient.get_group(cmdargs.name)
    group.delete()

def declare_group_delete(subparsers, apiclient):
    p = subparsers.add_parser("group-delete", help="Delete a group")
    p.add_argument("name", help="Name of group to delete")
    p.set_defaults(func=group_delete, apiclient=apiclient)