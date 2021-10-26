#!/bin/bash -e
# Download  the collectd package just like the install step would 

Usage() {
	echo >&2 "Usage: $0 [-installDir DKUINSTALLDIR] [-dir DOWNLOADDIR]"
	echo >&2 ""
  echo >&2 "Downloads the monitoring packages into this install dir. Defaults current INSTALLDIR if it is one."
	echo >&2 ""
	exit 1
}

SCRIPTPATH="$( cd "$(dirname "$0")" ; pwd -P )"
DKUINSTALLDIR=$(dirname $(dirname "$SCRIPTPATH"))

# Python binary to use
if [ -n "$DKUPYTHONBIN" ]; then
  pythonBin="$DKUPYTHONBIN"
elif command -v python2.7 >/dev/null; then
  pythonBin="python2.7"
elif command -v python3.6 >/dev/null; then
  pythonBin="python3.6"
else
  echo >&2 "*** Could not find suitable version of Python, define one with environment variable DKUPYTHONBIN"
  exit 1
fi

downloadDir=
while [ $# -gt 0 ]
do
  case "$1" in
    -installDir)
      DKUINSTALLDIR="$2"
      shift
      ;;
    -dir)
      downloadDir="$2"
      shift
      ;;
    -h|--help) 
      Usage
      exit 0
      ;;
     *) 
      echo "Unknown option $1"
      echo ""
      Usage
      exit 1
      ;;
  esac
  shift
done

collectdInstallDir="${DKUINSTALLDIR}/tools"
if [ ! -d "$collectdInstallDir/collectd" ]; then
  (
    # Create temporary dir if no dir requested by the user
    if [ -z "$downloadDir" ]; then
      downloadDir=$(mktemp -d)
      function cleanupTempData {
        rm -r "$downloadDir"
      }
      trap cleanupTempData EXIT
    fi

    # Fetch version of collectd
    collectd_version=$("$pythonBin" -c "import json; print(json.load(open('$DKUINSTALLDIR/dss-tools-version.json','r'))['collectd_version'])")

    # Download collectd
    cd "$downloadDir"
    curl -O "https://downloads.dataiku.com/public/tools/$collectd_version/collectd.tar.gz"
    tar xf collectd.tar.gz -C "${collectdInstallDir}"
  )
fi
