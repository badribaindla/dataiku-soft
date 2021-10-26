from dataiku.dsscli import utils
from .utils import add_formatting_args, p_format_arr, add_field_to_definition
import warnings

def users_list(cmdargs, apiclient):
    users = apiclient.list_users()
    ret = [ [u["login"], u["displayName"], u.get("userProfile", "??")] for u in users]
    p_format_arr(ret, ["login", "displayName", "userProfile"],
                    ["Login", "Display name", "Profile"], cmdargs)

def declare_users_list(subparsers, apiclient):
    p = subparsers.add_parser("users-list", help="List users")
    add_formatting_args(p)
    p.set_defaults(func=users_list, apiclient=apiclient)

def user_create(cmdargs, apiclient):
    dn = cmdargs.display_name
    if len(dn) == 0:
        dn = cmdargs.login
    user = apiclient.create_user(cmdargs.login, cmdargs.password, dn, cmdargs.source_type,
                                 cmdargs.group, cmdargs.user_profile)

    # Adding email to user, which is not in original constructor
    warnings.filterwarnings("ignore", category=DeprecationWarning)
    user_def = user.get_definition()
    add_field_to_definition(cmdargs, "email", user_def, True)
    user.set_definition(user_def)

def declare_user_create(subparsers, apiclient):
    p = subparsers.add_parser("user-create", help="Create a user")
    p.add_argument("login", help="New user login name")
    p.add_argument("password", help="New user password")
    p.add_argument("--email", help="New user email", dest="email")
    p.add_argument("--source-type", help="New user source type (LOCAL, LDAP or LOCAL_NO_AUTH) (default LOCAL)",
                   dest="source_type", default="LOCAL")
    p.add_argument("--display-name", dest="display_name", help="Display name", default="")
    p.add_argument("--user-profile", help="New user profile (default READER)", dest="user_profile", default="READER")
    p.add_argument("--group", help="Add user to group", dest="group", action="append")
    p.set_defaults(func=user_create, apiclient=apiclient)

def user_edit(cmdargs, apiclient):
    user = apiclient.get_user(cmdargs.login)
    warnings.filterwarnings("ignore", category=DeprecationWarning)
    user_def = user.get_definition()

    if cmdargs.display_name is not None and len(cmdargs.display_name) > 0:
        user_def["displayName"] = cmdargs.display_name
    if cmdargs.email is not None and len(cmdargs.email) > 0:
        user_def["email"] = cmdargs.email
    if cmdargs.user_profile is not None:
        user_def["userProfile"] = cmdargs.user_profile
    if cmdargs.password is not None:
        user_def["password"] = cmdargs.password
    if cmdargs.group is not None:
        user_def["groups"] = cmdargs.group

    user.set_definition(user_def)

def declare_user_edit(subparsers, apiclient):
    p = subparsers.add_parser("user-edit", help="Edit a user")
    p.add_argument("login", help="Login name")
    p.add_argument("--password", help="New password")
    p.add_argument("--display-name", help="New display name", dest="display_name",)
    p.add_argument("--email", help="New email address", dest="email",)
    p.add_argument("--user-profile", help="New user profile", dest="user_profile")
    p.add_argument("--group", help="New group (multi-valued, fully replaces previous list)", dest="group", action="append")
    p.set_defaults(func=user_edit, apiclient=apiclient)


def user_delete(cmdargs, apiclient):
    user = apiclient.get_user(cmdargs.login)
    user.delete()

def declare_user_delete(subparsers, apiclient):
    p = subparsers.add_parser("user-delete", help="Delete a user")
    p.add_argument("login", help="Login to delete")
    p.set_defaults(func=user_delete, apiclient=apiclient)

def api_keys_list(cmdargs, apiclient):
    keys = apiclient.list_global_api_keys()
    if keys and len(keys) > 0:
        permission_cols = ["admin"]
        other_cols = ["id", "key", "label", 'description']
        if cmdargs.with_permissions:
            permission_cols = utils.get_permissions_fields()
        ret = [[key.get(col, '') for col in other_cols] + [key["globalPermissions"][pc] for pc in permission_cols] for key in keys]
        retrieve_cols = other_cols + permission_cols
        p_format_arr(ret, retrieve_cols, retrieve_cols, cmdargs)


def declare_api_keys_list(subparsers, apiclient):
    p = subparsers.add_parser("api-keys-list", help="List API keys")
    p.add_argument("--with-permissions", action="store_true", dest="with_permissions",
                   help="Display permissions for each api key")
    add_formatting_args(p)
    p.set_defaults(func=api_keys_list, apiclient=apiclient)

def api_key_create(cmdargs, apiclient):

    # Initialize admin if not
    if cmdargs.admin is None:
        cmdargs.admin = False

    key = apiclient.create_global_api_key(cmdargs.label, cmdargs.description, cmdargs.admin)

    # Adding other fields to key
    key_def = key.get_definition()
    key_def["globalPermissions"] = key_def.get("globalPermissions", {})
    key_def_permissions = key_def["globalPermissions"]
    utils.add_permissions_fields_to_definition(cmdargs, key_def_permissions)
    key.set_definition(key_def)

    # Print key to provide dsscli user with its key field to reuse it afterwards
    retrieve_cols = ['id', 'key', 'label', 'description']
    ret = [[key_def[col] for col in retrieve_cols]]
    p_format_arr(ret, retrieve_cols, retrieve_cols, cmdargs)

def declare_api_key_create(subparsers, apiclient):
    p = subparsers.add_parser("api-key-create", help="Create a new API key")
    add_formatting_args(p)
    p.add_argument("--description", dest="description", help="New API key description", default="")
    p.add_argument("--label", dest="label", help="New API key label", default="")
    utils.add_permissions_fields_to_parser(p)
    p.set_defaults(func=api_key_create, apiclient=apiclient)

def api_key_edit(cmdargs, apiclient):
    key = apiclient.get_global_api_key(cmdargs.key)

    key_def = key.get_definition()
    utils.add_field_to_definition(cmdargs, "description", key_def)
    utils.add_field_to_definition(cmdargs, "label", key_def)
    key_def["globalPermissions"] = key_def.get("globalPermissions", {})
    key_def_permissions = key_def["globalPermissions"]
    utils.add_permissions_fields_to_definition(cmdargs, key_def_permissions)

    key.set_definition(key_def)

def declare_api_key_edit(subparsers, apiclient):
    p = subparsers.add_parser("api-key-edit", help="Edit an API key")
    p.add_argument("key", help="Secret key of API key to edit")
    p.add_argument("--description", dest="description", help="API key description")
    p.add_argument("--label", dest="label", help="API key label", default="")
    utils.add_permissions_fields_to_parser(p)
    p.set_defaults(func=api_key_edit, apiclient=apiclient)

def api_key_delete(cmdargs, apiclient):
    api_key = apiclient.get_global_api_key(cmdargs.key)
    api_key.delete()

def declare_api_key_delete(subparsers, apiclient):
    p = subparsers.add_parser("api-key-delete", help="Delete an API key")
    p.add_argument("key", help="Secret key of API key to delete")
    p.set_defaults(func=api_key_delete, apiclient=apiclient)

def invalidate_conf_cache(cmdargs, apiclent):
    apiclent._perform_empty(
            "POST", "/admin/invalidate-config-cache", params={"path": cmdargs.path})


def declare_invalidate_conf_cache(subparsers, apiclient):
    p = subparsers.add_parser("config-cache-invalidate", help="Invalidate the configuration cache")
    p.add_argument("--path", dest="path", help="relative config path to invalidate")
    p.set_defaults(func=invalidate_conf_cache, apiclient=apiclient)


def set_license(cmdargs, apiclient):
    with open(cmdargs.license_file, "r") as lf:
        license = lf.read()
    apiclient._perform_empty(
        "POST", "/admin/licensing/license", raw_body=license)


def declare_set_license(subparsers, apiclient):
    p = subparsers.add_parser("set-license", help="Sets DSS license")
    p.add_argument("license_file", help="Path of the license file")
    p.set_defaults(func=set_license, apiclient=apiclient)

