#! /bin/bash -e
# Configures or reconfigures DSS event server
#

# Don't call this directly. Use ./bin/dssadmin install-event-server
Usage() {
	echo >&2 "Usage: ${DIP_HOME}/bin/dssadmin install-event-server"
	exit 1
}

MYDIR=$(cd "$(dirname "$0")" && pwd -P)
DKUINSTALLDIR=$(dirname "$MYDIR")

if [ -z "$DIP_HOME" -o ! -d "$DIP_HOME" ]; then
	echo >&2 "*** Error: DIP_HOME not found"
	exit 1
fi

echo "[+] Enabling event server"

# Loads install.ini and enables eventserver into it
cp "${DIP_HOME}/install.ini" "${DIP_HOME}/install.ini.BAK" 
"$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -set eventserver enabled true

echo "[+] Event server enabled"
