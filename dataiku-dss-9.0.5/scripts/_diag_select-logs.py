#! /usr/bin/env python

# Returns the list of file absolute paths to keep in a diagnosis file

import sys, os, os.path as osp
import functools

rundir = sys.argv[1]
max_mb_per_process = int(sys.argv[2])

rotated_processes = ["backend", "ipython", "jupyter", "hproxy", "frontend", "nginx", "supervisord", "apimain"]

all_files = []

for process in rotated_processes:
	pfiles = []

	# Isolate the logs of this process
	names = [x for x in os.listdir(rundir) if x.startswith(process + ".log") and not x.endswith(".lck")]
	# Sort by last modified
	snames = sorted(names, key = lambda x : os.stat(osp.join(rundir, x)).st_mtime, reverse=True)

	if len(snames) == 0:
		continue

	# Always take the first
	pfiles = [snames[0]]

	for logfile in snames[1:]:
		size_before = functools.reduce(lambda acc, f: acc + os.stat(osp.join(rundir, f)).st_size, pfiles, 0)
		if size_before > max_mb_per_process * 1024 * 1024 :
			break
		pfiles.append(logfile)

	all_files.extend([osp.join(rundir, f) for f in pfiles])

	# TODO: How to ensure quoting ?
	print(" ".join(all_files))
