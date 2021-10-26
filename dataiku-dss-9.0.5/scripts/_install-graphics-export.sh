#!/bin/bash -e
# Installing dependencies needed for dashboard and flow export feature to work in DSS.

# Don't call this directly. Use ./bin/dssadmin install-graphics-export

Usage() {
	echo >&2 "Usage: $0 [-noDeps]"
	echo >&2 "    -noDeps: do not check system dependencies"
	exit 1
}

MYDIR=$(cd "$(dirname "$0")" && pwd -P)
DKUINSTALLDIR=$(dirname "$MYDIR")

if [ -z "$DIP_HOME" -o ! -d "$DIP_HOME" ]; then
	echo >&2 "*** Error: DIP_HOME not found"
	exit 1
fi

noDeps=
while [ $# -gt 0 ]; do
	if [ "$1" = "-noDeps" ]; then
		noDeps=1
		shift
	else
		Usage
	fi
done

#
# Check system dependencies
#
if [ -z "$noDeps" ]; then
	echo "[+] Checking dependencies"
	"$DKUINSTALLDIR"/scripts/install/install-deps.sh -check \
		-without-java -without-python -with-chrome || {
		echo >&2 "
[-] Dependency check failed
[-] You can install required dependencies with:
[-]    sudo -i \"$DKUINSTALLDIR/scripts/install/install-deps.sh\" -without-java -without-python -with-chrome
[-] You can also disable this check with the -noDeps option
"
		exit 1
	}
fi

#
# Install required libraries by the export-dashboards.js and export-flow.js script
#

echo "[+] Installing additional modules for dashboard and flow export feature"

cd "$DKUINSTALLDIR"/resources/graphics-export/
npm install puppeteer@1.20.0 fs

# Add node to env-site.sh on macOS only
if [ "$(uname)" == "Darwin" ]; then

NODE_PATH=$(dirname "$(which node)")
cat <<EOF >>"$DIP_HOME"/bin/env-site.sh
#
# Add '${NODE_PATH}' to the PATH environment variable for graphics export where
# node was found
# You can change or remove the following line if you installed node in a
# different directory.
export PATH=\$PATH:${NODE_PATH}
EOF

fi

#
# Enable graphics export in DSS
#

echo "[+] Enabling graphics export in DSS"
"$DIP_HOME"/bin/dku __enable-graphics-export

echo "[+] Done"
