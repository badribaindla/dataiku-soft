from .utils import p_format_arr, add_formatting_args
import os.path as osp

def api_service_package_create(cmdargs, apiclient):
    service = apiclient.get_project(cmdargs.project_key).get_api_service(cmdargs.service_id)
    
    package_id = cmdargs.name
    if package_id is None:
        packages = service.list_packages()
        packages_ids = [p["id"] for p in packages]
        i = 1
        while ('v%i' % i) in packages_ids:
            i = i + 1
        package_id = 'v%i' % i
    
    service.create_package(package_id)
    
    path = cmdargs.path
    if path is None:
        path = package_id + '.zip'
    elif osp.isdir(path):
        path = osp.join(path, package_id + '.zip')
    
    print("Downloading package to %s" % path)
    service.download_package_to_file(package_id, path)
    
def declare_api_service_package_create(subparsers, apiclient):
    p = subparsers.add_parser("api-service-package-create", help="Make a package of an API service and download it")
    p.add_argument("project_key", help="Project key containing service")
    p.add_argument("service_id", help="API service to package")
    p.add_argument("--name", required=False, help="Name for the package (default: auto-generated)")
    p.add_argument("--path", required=False, help="Path to download the package to (default: current directory)")
    p.set_defaults(func=api_service_package_create, apiclient=apiclient)

def api_services_list(cmdargs, apiclient):
    services = apiclient.get_project(cmdargs.project_key).list_api_services()
    def get_endpoint_description(endpoints):
        return ', '.join([endpoint["id"] + ' (' + endpoint["type"] + ')' for endpoint in endpoints])
    ret = [ [s["id"], 'Yes' if s["publicAccess"] else 'No', get_endpoint_description(s["endpoints"])] for s in services ]
    retrieved_cols = ["id", "publicAccess", "endpoints"]
    header_cols = ["Id", "Public?", "Endpoints"]
    p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_api_services_list(subparsers, apiclient):
    p = subparsers.add_parser("api-services-list", help="List API services")
    add_formatting_args(p)
    p.add_argument("project_key", help="Project key for which to list services")
    p.set_defaults(func=api_services_list, apiclient=apiclient)

