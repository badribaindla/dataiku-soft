#! /usr/bin/env python

# Gets the stacks of the backend

import sys, os, os.path as osp
import re
import functools
import subprocess
import requests
import six

session = requests.Session()

TIMEOUT=20

with open(osp.join(os.getenv("DIP_HOME"), "run", "shared-secret.txt")) as f:
	shared_secret = f.read().strip()

session.headers.update({"X-DKU-IPythonSharedSecret" : shared_secret})

def get_backend_pid():
	pid_re = re.compile("^([A-Za-z]*).*pid ([0-9]+).*")

	(stdout, _) = subprocess.Popen("$DIP_HOME/bin/dss status", shell=True, stdout=subprocess.PIPE).communicate()

	for line in six.ensure_str(stdout).split("\n"):
		match = pid_re.match(line)
		if match and match.group(1) == "backend":
			return match.group(2)
	raise Exception("Backend pid not found")

print("********************************")
print("Backend stacks")

try:
	r = session.get('http://127.0.0.1:%s/dip/api/debugging/dump-backend-stacks' % os.getenv("DKU_BACKEND_PORT"), timeout=TIMEOUT)
	print(r.text)
except Exception as e:
	print("Could not get backend stats using HTTP, trying kill -3 (%s)" % e)

	try:
		backend_pid = get_backend_pid()
		print("Killing -3: %s" % backend_pid)
		subprocess.Popen("kill -3 %s" % backend_pid, shell=True)
	except Exception as e2:
		print("Could not get stacks at all: %s" % e2)

print("")
print("********************************")
print("Backend TXN status")
try:
	r = session.get('http://127.0.0.1:%s/dip/api/debugging/dump-transactions-state' % os.getenv("DKU_BACKEND_PORT"), timeout=TIMEOUT)
	print(r.text)
except Exception as e:
	print("Could not get TXN status: %s" % e)

print("")
print("********************************")
print("Backend NamedLocks status")
try:
	r = session.get('http://127.0.0.1:%s/dip/api/debugging/dump-named-locks' % os.getenv("DKU_BACKEND_PORT"), timeout=TIMEOUT)
	print(r.text)
except Exception as e:
	print("Could not get locks status: %s" % e)

print("")
print("********************************")
print("Backend metrics")
try:
	r = session.get('http://127.0.0.1:%s/dip/api/debugging/dump-metrics' % os.getenv("DKU_BACKEND_PORT"), timeout=TIMEOUT)
	print(r.text)
except Exception as e:
	print("Could not get metrics status: %s" % e)


print("")
print("********************************")
print("Backend tickets")
try:
	r = session.get('http://127.0.0.1:%s/dip/api/debugging/dump-api-tickets' % os.getenv("DKU_BACKEND_PORT"), timeout=TIMEOUT)
	print(r.text)
except Exception as e:
	print("Could not get API tickets status: %s" % e)
