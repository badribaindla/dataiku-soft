#! /bin/bash -e
# Configures or reconfigures DSS collectd integration
#

# Don't call this directly. Use ./bin/dssadmin install-collectd-integration
Usage() {
	echo >&2 "Usage: ${DIP_HOME}/bin/dssadmin install-monitoring-integration -graphiteServer HOSTNAME:PORT [-hostname HOSTNAME] [-pkg LOCAL_COLLECTD_PACKAGE]"
	echo >&2 "    -graphiteServer: Hostname and port of the Graphite metrics server"
  echo >&2 "    -prefix: Metrics prefix, defaults to dss.reverted.fully.qualidifed.name (ex: dataiku0.company.com -> dss.com.company.dataiku0)"
	#echo >&2 "    -collectdInstallDir: Defaults to \"${DKUINSTALLDIR}/tools/\", but can be forced otherwise. Must be writable."
	echo >&2 "    -pkg: Use a local package instead of downloading it, either as an archive or a directory"
	exit 1
}

MYDIR=$(cd "$(dirname "$0")" && pwd -P)
DKUINSTALLDIR=$(dirname "$MYDIR")

if [[ "${OSTYPE:0:6}" == "darwin" ]]; then
  echo >&2 "*** Error: The collectd integration is not available on MacOS."
  exit 1
fi

if [ -z "$DIP_HOME" -o ! -d "$DIP_HOME" ]; then
	echo >&2 "*** Error: DIP_HOME not found"
	exit 1
fi

# Interpret command line arguments
server=
pkg=
prefix=""
# Taken as an option but not overridabled easily unless stored
# in default-env or install.ini, which is a pain and not really 
# userful
collectdInstallDir="$DKUINSTALLDIR/tools" 
while [ $# -gt 0 ]
do
  case "$1" in
    -graphiteServer)
      server="$2"
      shift
      ;;
    -prefix) 
      prefix="$2"
      shift
      ;;
    #-collectdInstallDir)
      #collectdInstallDir="$2"
      #shift
      #;;
    -pkg)
      pkg="$2"
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

if [ -z "$server" ]; then
  echo ""
  echo "*** Error: the \"-graphiteServer\" option is mandatory to install collectd integration."
  echo ""
  Usage
  exit 1
fi

# Download the package and unpack in installdir
test -d "${collectdInstallDir}/collectd" || (
  if [ -z "$pkg" ]; then
    # Create temporary dir
    downloadDir=$(mktemp -d)
    function cleanupTempData {
      rm -r "$downloadDir"
    }
    trap cleanupTempData EXIT

    # Fetch version of collectd
    collectd_version=$("$DKUPYTHONBIN" -c "import json; print(json.load(open('$DKUINSTALLDIR/dss-tools-version.json','r'))['collectd_version'])")

    # Download collectd
    cd "$downloadDir"
    curl -O "https://downloads.dataiku.com/public/tools/$collectd_version/collectd.tar.gz"
    tar xf collectd.tar.gz -C "${collectdInstallDir}"
  else
    if [ -d "$pkg" ]; then
      cp -r "$pkg" "${collectdInstallDir}"
    else
      tar xf "$pkg" -C "${collectdInstallDir}"
    fi
  fi
)

# Loads install.ini and enables collectd into it
cp "${DIP_HOME}/install.ini" "${DIP_HOME}/install.ini.BAK" 
"$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -set collectd enabled true
"$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -set collectd graphite_server "$server"
if [ -z "$prefix" ]; then
  # Do not modify existing prefix
  prefix=$("$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -get collectd prefix)
  if [[ -z "$prefix" || "$prefix" == "None" ]]; then
    port=$("$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -get server port)
    prefix=dss.$("$DKUPYTHONBIN" -c "import socket; print('.'.join(reversed(socket.getfqdn().split('.'))))").$port
  fi
fi
"$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -set collectd prefix "$prefix"
rm "${DIP_HOME}/install.ini.BAK" 

# Store settings in the general settings too
nodetype=$("$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -get general nodetype)
if [[ "$nodetype" == "api" ]]; then
  # Add new config keys but does not override existing ones
  cp "${DIP_HOME}/config/server.json" "${DIP_HOME}/config/server.json.BAK" 
  "$DKUPYTHONBIN" <(cat <<EOF
import json
carbon_server = "$server"
prefix = "$prefix"
current_conf = json.load(open("${DIP_HOME}/config/server.json","r"))
new_conf = {
    "graphiteCarbonServerURL": carbon_server,
    "graphiteCarbonPrefix": prefix
}
new_conf.update(current_conf)
with open("${DIP_HOME}/config/server.json", "w") as output:
    json.dump(new_conf, output, indent=4)
EOF
)
  rm "${DIP_HOME}/config/server.json.BAK" 
else
  "$DIP_HOME"/bin/dku __set-monitoring-config
fi

# The main script will handle configuration regen
echo "[+] Configuration done"
