import os
import json
from tabulate import tabulate

def json_dumpf(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=4)


def json_loadf(path):
    with open(path, "r") as f:
        return json.load(f)

def add_formatting_args(parser):
    parser.add_argument("--output", action="store", dest="output", default="fancy", choices=['fancy','json'], help="Output format ('fancy', 'json')")
    parser.add_argument("--no-header", action="store_false", dest="header", help="Don't display column headers")

def p_tabulate_h(data, headers, headers_opt, **kwargs):
	if headers_opt:
		print (tabulate(data, headers, **kwargs))
	else:
		print (tabulate(data, tablefmt="plain", **kwargs))
