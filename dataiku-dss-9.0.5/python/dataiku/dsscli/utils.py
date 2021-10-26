import json
import six
from six.moves import xrange
from tabulate import tabulate
import datetime
import pytz

def json_dumpf(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=4)


def json_loadf(path):
    with open(path, "r") as f:
        return json.load(f)

def add_formatting_args(parser):
    parser.add_argument("--output", action="store", dest="output", default="fancy", choices=['fancy','json'], help="Output format ('fancy', 'json')")
    parser.add_argument("--no-header", action="store_false", dest="header", help="Don't display column headers")

def p_format_arr(data, raw_headers, fancy_headers, cmdargs, **kwargs):
    if cmdargs.output == "fancy":
        p_tabulate_h(data, fancy_headers, cmdargs.header, **kwargs)
    elif cmdargs.output == "json":
        def make_obj(headers, data, i):
            obj = {}
            for z in zip(headers, data[i]):
                obj[z[0]] = z[1]
            return obj
        print (json.dumps([make_obj(raw_headers, data, i) for i in xrange(len(data))]))


def p_tabulate_h(data, headers, headers_opt, **kwargs):
    #print(data)
    if headers_opt:
        result = tabulate(data, headers, **kwargs)
    else:
        result = tabulate(data, tablefmt="plain", **kwargs)
    # TODO check this
    if six.PY2:
        result = result.encode("utf-8")
    print(result)

def timestamp_to_date(timestamp):
    return datetime.datetime.utcfromtimestamp(int(timestamp / 1000)).replace(tzinfo=pytz.UTC).isoformat()

####### PERMISSIONS FIELDS

def get_permissions_fields():
    return ["admin", "mayManageCodeEnvs", "mayEditLibFolders", "mayWriteUnsafeCode",
            "mayCreateProjects", "mayManageUDM", "mayCreateCodeEnvs", "mayDevelopPlugins",
            "mayWriteSafeCode", "mayCreateAuthenticatedConnections", "mayCreatePublishedAPIServices",
            "mayCreateProjectsFromMacros", "mayCreateProjectsFromTemplates", "mayCreateClusters",
            "mayManageClusters", "mayViewIndexedHiveConnections", "mayWriteInRootProjectFolder",
            "mayCreateActiveWebContent", "mayCreatePublishedProjects"]


def add_field_to_definition(cmdargs, field_name, definition, must_have_len=False):
    field_value = getattr(cmdargs, field_name)
    if field_value is not None and (not must_have_len or len(field_value)):
        definition[field_name] = field_value

def add_permissions_fields_to_definition(cmdargs, group_def):
    add_field_to_definition(cmdargs, "admin", group_def)
    add_field_to_definition(cmdargs, "mayManageCodeEnvs", group_def)
    add_field_to_definition(cmdargs, "mayCreateCodeEnvs", group_def)
    add_field_to_definition(cmdargs, "mayManageClusters", group_def)
    add_field_to_definition(cmdargs, "mayCreateClusters", group_def)
    add_field_to_definition(cmdargs, "mayWriteUnsafeCode", group_def)
    add_field_to_definition(cmdargs, "mayWriteSafeCode", group_def)
    add_field_to_definition(cmdargs, "mayCreateProjects", group_def)
    add_field_to_definition(cmdargs, "mayCreateProjectsFromMacros", group_def)
    add_field_to_definition(cmdargs, "mayCreateProjectsFromTemplates", group_def)
    add_field_to_definition(cmdargs, "mayWriteInRootProjectFolder", group_def)
    add_field_to_definition(cmdargs, "mayManageUDM", group_def)
    add_field_to_definition(cmdargs, "mayEditLibFolders", group_def)
    add_field_to_definition(cmdargs, "mayDevelopPlugins", group_def)
    add_field_to_definition(cmdargs, "mayCreateAuthenticatedConnections", group_def)
    add_field_to_definition(cmdargs, "mayCreatePublishedAPIServices", group_def)
    add_field_to_definition(cmdargs, "mayViewIndexedHiveConnections", group_def)
    add_field_to_definition(cmdargs, "mayCreateActiveWebContent", group_def)
    add_field_to_definition(cmdargs, "mayCreatePublishedProjects", group_def)

def add_permissions_fields_to_parser(p):
    p.add_argument("--admin", dest="admin", help="is admin (true or false)")
    p.add_argument("--may-manage-code-envs", dest="mayManageCodeEnvs", help="May manage code envs (true or false)")
    p.add_argument("--may-create-code-envs", dest="mayCreateCodeEnvs", help="May create code envs (true or false)")
    p.add_argument("--may-manage-clusters", dest="mayManageClusters", help="May manage clusters (true or false)")
    p.add_argument("--may-create-clusters", dest="mayCreateClusters", help="May create clusters (true or false)")
    p.add_argument("--may-write-unsafe-code", dest="mayWriteUnsafeCode", help="May write unsafe code (true or false)")
    p.add_argument("--may-write-safe-code", dest="mayWriteSafeCode", help="May write safe code (true or false)")
    p.add_argument("--may-create-projects", dest="mayCreateProjects", help="May create projects (true or false)")
    p.add_argument("--may-create-projects-from-macros", dest="mayCreateProjectsFromMacros",
                   help="May create projects from macros (true or false)")
    p.add_argument("--may-create-projects-from-templates", dest="mayCreateProjectsFromTemplates",
                   help="May create projects from templates (true or false)")
    p.add_argument("--may-write-in-root-project-folder", dest="mayWriteInRootProjectFolder",
                   help="May write in root project folder (true or false)")
    p.add_argument("--may-manage-udm", dest="mayManageUDM", help="May manage UDM (true or false)")
    p.add_argument("--may-edit-lib-folders", dest="mayEditLibFolders", help="May edit lib folders (true or false)")
    p.add_argument("--may-develop-plugins", dest="mayDevelopPlugins", help="May develop plugins (true or false)")
    p.add_argument("--may-create-authenticated-connections", dest="mayCreateAuthenticatedConnections",
                   help="May create authenticated connections (true or false)")
    p.add_argument("--may-create-published-api-services", dest="mayCreatePublishedAPIServices",
                   help="May create published API services in the API deployer (true or false)")
    p.add_argument("--may-view-indexed-hive-connections", dest="mayViewIndexedHiveConnections",
                   help="May view indexed hive connections (true or false)")
    p.add_argument("--may-create-active-web-content", dest="mayCreateActiveWebContent",
                   help="May create active web content (true or false)")
    p.add_argument("--may-create-published-projects", dest="mayCreatePublishedProjects",
                   help="May create published projects in the Project deployer (true or false)")
