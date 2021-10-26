from .utils import p_tabulate_h
from datetime import datetime

###############################################################
# Import generations on disk
###############################################################

def service_import_generation(cmdargs, apiclient):
	print ("Importing service generation for service=%s from file=%s" % (cmdargs.service, cmdargs.archive))
	apiclient.service(cmdargs.service).import_generation_from_archive(cmdargs.archive)
	print ("OK")

def declare_service_import_generation(subparsers, apiclient):
	p = subparsers.add_parser("service-import-generation", help="Import a generation from an archive")
	p.add_argument("service", help="Service identifier")
	p.add_argument("archive", help="Archive path")
	p.set_defaults(func=service_import_generation, apiclient=apiclient)

###############################################################
# List generations on disk
###############################################################

def list_generations(cmdargs, apiclient):
	p_tabulate_h(	[ [s["generationId"], datetime.fromtimestamp(s["createdOn"] / 1000),
						str(s["mounted"]), s["mapped"] * 100]
						for s in apiclient.service(cmdargs.service).list_generations()],
					["Gen. Tag", "Created", "Mounted", "Mapped %"],
					cmdargs.header)

def declare_list_generations(subparsers, apiclient):
	p = subparsers.add_parser("service-list-generations", help="List generations available on disk for a service")
	p.add_argument("service", help="Service identifier")
	p.add_argument("--no-header", action="store_false", dest="header", help="Don't display column headers")
	p.set_defaults(func=list_generations, apiclient=apiclient)

###############################################################
# Preload generations on disk
###############################################################

def service_preload_generation(cmdargs, apiclient):
	print ("Preloading service generation %s for service=%s" % (cmdargs.generation, cmdargs.service))
	apiclient.service(cmdargs.service).preload_generation(cmdargs.generation)
	print ("OK")

def declare_service_preload_generation(subparsers, apiclient):
	p = subparsers.add_parser("service-preload-generation", help="Import a generation from an archive")
	p.add_argument("service", help="Service identifier")
	p.add_argument("generation", help="Generation identifier")
	p.set_defaults(func=service_preload_generation, apiclient=apiclient)
