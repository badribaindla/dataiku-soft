#!/bin/bash -e
# Configures Dataiku DSS to start at boot

Usage() {
	echo "Usage: $0 [-n INSTANCE_NAME] DIP_HOME DIP_USER" >&2
	exit 1
}

SERVICE_NAME="dataiku"
if [ $# -ge 2 -a "$1" = "-n" ]; then
	SERVICE_NAME="dataiku.$2"
	shift 2
fi
if [ $# -ne 2 ]; then
	Usage
fi
DIP_HOME="$1"
DIP_USER="$2"

if [ ! -f "$DIP_HOME"/bin/env-default.sh ]; then
  echo "FATAL: Did not find $DIP_HOME/bin/env-default.sh" >&2
  exit 1
fi
source "$DIP_HOME"/bin/env-default.sh

if [ -z "$DKUINSTALLDIR" ]; then
  echo "FATAL: DKUINSTALLDIR is not defined in $DIP_HOME/bin/env-default.sh" >&2
  exit 1
fi

if [ -f /etc/debian_version ]; then
	mode=debian
	BOOT_CONFIG_FILE="/etc/default/$SERVICE_NAME"
elif [ -f /etc/system-release -o -f /etc/SuSE-release ]; then
	mode=redhat
	BOOT_CONFIG_FILE="/etc/sysconfig/$SERVICE_NAME"
elif [[ "$("$(dirname "$0")"/../_find-distrib.sh)" == "suse 15"* ]]; then
	# This legacy component required by chkconfig is not installed by default
	if ! command -v /sbin/insserv >/dev/null; then
		echo >&2 "* ERROR: insserv is not installed, please add it with:"
		echo >&2 "*   sudo zypper install insserv-compat"
		exit 1
	fi
	mode=redhat
	BOOT_CONFIG_FILE="/etc/sysconfig/$SERVICE_NAME"
else
	echo "Error : platform not supported" >&2
	exit 1
fi

# Install boot config file
cat <<EOF >"$BOOT_CONFIG_FILE"
# Service configuration file for Dataiku DSS instance $SERVICE_NAME
DIP_HOME="$DIP_HOME"
DIP_USER="$DIP_USER"

# Optional : create DSS-private cgroups on startup
# Group names below are just an example, adjust to your system and DSS configuration
# DIP_CGROUPS="memory/$SERVICE_NAME:cpu/$SERVICE_NAME"
EOF

# Install boot script
sed \
	-e "s,{{SERVICE_NAME}},$SERVICE_NAME,g" \
	-e "s,{{BOOT_CONFIG_FILE}},$BOOT_CONFIG_FILE,g" \
	"$DKUINSTALLDIR"/scripts/dataiku.boot.template \
	>/etc/init.d/"$SERVICE_NAME"
chmod 755 /etc/init.d/"$SERVICE_NAME"

# Configure boot start
case "$mode" in
	debian)
		update-rc.d "$SERVICE_NAME" defaults
		;;
	redhat)
		chkconfig --add "$SERVICE_NAME"
		chkconfig "$SERVICE_NAME" on
		;;
esac
