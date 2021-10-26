#! /usr/bin/env python

import sys, os, re, json, shutil
import functools
import subprocess
import requests
import zipfile

if __name__ == "__main__":
    with open(sys.argv[1], 'w') as output_file:
        libs_folder = 'hadoop-standalone-libs' if os.environ.get("DSS_DEV", '0') != '1' else 'packagers/resources-build/hadoop-standalone-libs/dist'

        output_file.write('export DKU_HADOOP_ENABLED=true\n')
        output_file.write("export DKU_HADOOP_FLAVOR=generic\n")
        output_file.write('export DKU_HADOOP_VERSION_STRING="dss-standalone-libs-generic-hadoop3"\n')
        output_file.write("export DKU_HADOOP_CP=\"$DKUINSTALLDIR/%s/*:$DKUINSTALLDIR/lib/ivy/parquet-run/*:$DKUINSTALLDIR/lib/shims/*\"\n" % libs_folder)
        output_file.write("export DKU_HADOOP_FLAVOR2='{\"flavor\": \"generic\"}'\n")