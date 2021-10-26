from .utils import p_tabulate_h

###############################################################
# Create service command
###############################################################

def service_create(cmdargs, apiclient):
	print ("Creating service %s" % cmdargs.service)
	apiclient.create_service(cmdargs.service)
	print ("OK")

def declare_service_create(subparsers, apiclient):
	p = subparsers.add_parser("service-create", help="Create a service")
	p.add_argument("service")
	p.set_defaults(func=service_create, apiclient=apiclient)

###############################################################
# List services
###############################################################

def services_list(cmdargs, apiclient):
	p_tabulate_h(	[ [s["serviceId"], str(s["enabled"]), s.get("startAbortedReason", "-")] for s in apiclient.list_services()],
					["Service", "Enabled", "Error"],
					cmdargs.header)

def declare_services_list(subparsers, apiclient):
	p = subparsers.add_parser("services-list", help="List services")
	p.add_argument("--no-header", action="store_false", dest="header", help="Don't display column headers")
	p.set_defaults(func=services_list, apiclient=apiclient)

###############################################################
# Delete service
###############################################################

def service_delete(cmdargs, apiclient):
	apiclient.service(cmdargs.service).delete()

def declare_service_delete(subparsers, apiclient):
	p = subparsers.add_parser("service-delete", help="Delete a service")
	p.add_argument("service", help="Service id to delete")
	p.set_defaults(func=service_delete, apiclient=apiclient)