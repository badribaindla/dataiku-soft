from .utils import p_tabulate_h
import argparse
import os
import dataikuapi
import json

def metrics_get(cmdargs, apiclient):
	print (json.dumps(apiclient.get_metrics()))

def declare_metrics_get(subparsers, apiclient):
	p = subparsers.add_parser("metrics-get", help="Get metrics")
	p.set_defaults(func=metrics_get, apiclient=apiclient)


def predict(cmdargs, apiclient):
	dic = {}
	for feature in cmdargs.features:
		chunks = feature.split("=")
		if len(chunks) < 2:
			raise ValueError("Malformed feature: %s - Expected key=value" % feature)
		dic[chunks[0]] = chunks[1:]

	port = int(os.environ["DKU_APIMAIN_PORT"])
	client = dataikuapi.APINodeClient("http://127.0.0.1:%s" % port, cmdargs.service)

	print (json.dumps(client.predict_record(cmdargs.endpoint, dic, forced_generation=cmdargs.forced_generation,
		dispatch_key=cmdargs.dispatch_key)))


def declare_predict(subparsers, apiclient):
	p = subparsers.add_parser("predict", help="Runs a simple prediction on a public-access service")
	p.add_argument("--forced-generation", dest="forced_generation")
	p.add_argument("--dispatch-key", dest="dispatch_key")
	p.add_argument("service")
	p.add_argument("endpoint")
	p.add_argument("features", help="Features as k=v k=v couples", nargs=argparse.REMAINDER)
	p.set_defaults(func=predict, apiclient=apiclient)