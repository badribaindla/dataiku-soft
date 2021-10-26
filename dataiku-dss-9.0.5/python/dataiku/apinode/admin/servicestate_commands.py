import sys, json

###############################################################
# Enable/Disable
###############################################################

def service_enable(cmdargs, apiclient):
	print ("Enabling service %s" % cmdargs.service)
	apiclient.service(cmdargs.service).enable()
	print ("OK")

def declare_service_enable(subparsers, apiclient):
	p = subparsers.add_parser("service-enable", help="Enables a service")
	p.add_argument("service", help="Service identifier")
	p.set_defaults(func=service_enable, apiclient=apiclient)

def service_disable(cmdargs, apiclient):
	print ("Disabling service %s" % cmdargs.service)
	apiclient.service(cmdargs.service).disable()
	print ("OK")

def declare_service_disable(subparsers, apiclient):
	p = subparsers.add_parser("service-disable", help="disables a service")
	p.add_argument("service", help="Service identifier")
	p.set_defaults(func=service_disable, apiclient=apiclient)


###############################################################
# Switch to specific generation
###############################################################

def service_switch_to_generation(cmdargs, apiclient):
	print ("Switching to generation %s for service %s" % (cmdargs.generation, cmdargs.service)	)
	apiclient.service(cmdargs.service).switch_to_single_generation(cmdargs.generation)
	print ("OK")

def declare_service_switch_to_generation(subparsers, apiclient):
	p = subparsers.add_parser("service-switch-to-generation", help="Switch to a single generation identifier")
	p.add_argument("service", help="Service identifier")
	p.add_argument("generation", help="Generation identifier")
	p.set_defaults(func=service_switch_to_generation, apiclient=apiclient)

###############################################################
# Switch to newest
###############################################################

def service_switch_to_newest(cmdargs, apiclient):
	print ("Switching to newest available generation for service %s" % cmdargs.service)
	ret = apiclient.service(cmdargs.service).switch_to_newest()

	if ret is not None and "switchedToGeneration" in ret:
		print ("Switched to generation=%s" % ret["switchedToGeneration"])


def declare_service_switch_to_newest(subparsers, apiclient):
	p = subparsers.add_parser("service-switch-to-newest", help="Switch to newest available version for a service")
	p.add_argument("service", help="Service identifier")
	p.set_defaults(func=service_switch_to_newest, apiclient=apiclient)


###############################################################
# Set mapping
###############################################################

def service_set_mapping(cmdargs, apiclient):
	print ("Setting mapping for service %s" % cmdargs.service)
	mapping = json.load(sys.stdin)
	apiclient.service(cmdargs.service).set_generations_mapping(mapping)
	print ("OK")

def declare_service_set_mapping(subparsers, apiclient):
	p = subparsers.add_parser("service-set-mapping", help="Set generations mapping on service (read from stdin)")
	p.add_argument("service", help="Service identifier")
	p.set_defaults(func=service_set_mapping, apiclient=apiclient)
