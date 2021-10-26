#!/bin/bash -e
# Install impersonation support in DSS from a non-privileged session
#
# Only supports "external" and "noInstallSudoSnippet" MUS installation modes
# Should only be used with execution_handling_mode=DIRECT_SUDO and fs_acl_handling_mode=PERMISSIONS_HELPER
# in order to avoid privilege escalation through tampering of the dataikusecurity Python code.
#
# This script should be installed in DKUINSTALLDIR/scripts/install/

Usage() {
	echo >&2 "Usage: $0 -dataDir DATADIR [-securityDir SECURITY_DIR] [-pythonBin PYTHONBIN] DSS_USER"
	exit 1
}

me=$(basename "$0")
BINDIR=$(cd "$(dirname "$0")" && pwd -P)
export DKUINSTALLDIR=$(dirname "$(dirname "$BINDIR")")

if [ $(id -u) -eq 0 ]; then
	echo >&2 "*** $me: running under superuser account is not supported."
	exit 1
fi

############### Parse arguments

dataDir=
securityDir=
pythonBin=
while [[ "$1" == -* ]]; do
	if [ $# -ge 2 -a "$1" = "-dataDir" ]; then
		dataDir="$2"
		shift 2
	elif [ $# -ge 2 -a "$1" = "-securityDir" ]; then
		securityDir="$2"
		shift 2
	elif [ $# -ge 2 -a "$1" = "-pythonBin" ]; then
		pythonBin="$2"
		shift 2
	else
		Usage
	fi
done
if [ -z "$dataDir" -o $# -ne 1 ]; then
	Usage
fi
DSS_USER="$1"

export DIP_HOME=$(cd "$dataDir" && pwd -P)

if [ -z "$securityDir" ]; then
	SECURITY_CONF_DIR="$DIP_HOME/security"
else
	SECURITY_CONF_DIR="$securityDir"
fi
if [[ "$SECURITY_CONF_DIR" != /* ]]; then
	echo >&2 "Security directory must be absolute: $SECURITY_CONF_DIR"
	exit 1
fi

if [ -z "$pythonBin" ]; then
	PYTHONBIN="python2.7"
else
	PYTHONBIN="$pythonBin"
fi

############### Load basic environment

source "$DIP_HOME"/bin/env-default.sh
source "$DKUINSTALLDIR/scripts/_startup.inc.sh"

bkdl_set_global_env
bkdl_set_py_env

INSTANCE_ID=$("$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -get general installid)
if [ -z "$INSTANCE_ID" -o "$INSTANCE_ID" = "None" ]; then
	echo >&2 "Error : mandatory instance ID not found in $DIP_HOME/install.ini"
	exit 1
fi

############### Initial license check

echo "[+] Enabling impersonation in DSS"

############### Populate external security dir

echo "[+] Creating external security directory $SECURITY_CONF_DIR"
mkdir -p "$SECURITY_CONF_DIR"

rm -rf "$SECURITY_CONF_DIR/python"
cp -rp "$DKUINSTALLDIR"/python/dataikusecurity "$SECURITY_CONF_DIR/python"
chmod -R a+rX,og-w "$SECURITY_CONF_DIR/python"

############### Filesystem chmods on DIP_HOME

echo "[+] Setting permissions on $DIP_HOME"

chmod 711 "$DIP_HOME"
# Default is 700 / 600
chmod u+rwX,og-rwx "$DIP_HOME"/*
# These must be traversable - create if needed and set perm
# These should all exist since they are created by InitialSetupHome,
# but in the case of migrations, it's not always true, so we create
# (as DSS_USER) to be sure.
for d in \
	analysis-data \
	bin \
	acode-envs \
	code-envs \
	jobs \
	exports \
	exports/jupyter-notebooks \
	jupyter-run	\
	jupyter-run/jupyter	\
	jupyter-run/jupyter/runtime	\
	managed_folders \
	lib \
	plugins \
	R.lib \
	saved_models \
	scenarios \
	tmp \
	; do
	mkdir -p "$DIP_HOME/$d"
	chmod 711 "$DIP_HOME/$d"
done
# R.lib should be enumerable for library()
chmod 755 "$DIP_HOME/R.lib"

# These must be traversable only if they already exist
for d in pyenv condaenv; do
	if [ -d "$DIP_HOME/$d" ]; then
		chmod 711 "$DIP_HOME/$d"
	fi
done

############### Security module configuration file

# Create the security module configuration.
mkdir -p "$SECURITY_CONF_DIR"
chmod 711 "$SECURITY_CONF_DIR"

if [ -f "$SECURITY_CONF_DIR/security-config.ini" ]; then
	echo "[+] Using existing security configuration file : $SECURITY_CONF_DIR/security-config.ini"
else
	echo "[+] Creating security configuration file : $SECURITY_CONF_DIR/security-config.ini"
	cat << EOF > "$SECURITY_CONF_DIR/security-config.ini"
[users]
# Enter here the list of groups that are allowed to execute commands.
# DSS may impersonate all users belonging to one of these groups
#
# Specify this as a semicolon;separated;list
#
# This must double-check with the settings of the groups with
# code-writing or Hadoop/Spark privileges in DSS
allowed_user_groups =

[dirs]
# Absolute path to DSS data dir.
dss_datadir = $DIP_HOME

# Additional 'allowed' folders. File operations are allowed in
# the dss datadir and these folders. Use this if you use symlinks for jobs/
# or any other DSS folder
#
# Specify this as a semicolon;separated;list
additional_allowed_file_dirs =
EOF
fi
chmod 600 "$SECURITY_CONF_DIR/security-config.ini"

############### Sudo wrapper

echo "[+] Creating sudo execution wrapper $SECURITY_CONF_DIR/execwrapper.sh"

sed \
	-e "s;{{PYTHONBIN}};$PYTHONBIN;g" \
	-e "s;{{PYTHONDIR}};$SECURITY_CONF_DIR/python;g" \
	-e "s;{{CONFIGDIR}};$SECURITY_CONF_DIR;g" \
	"$DKUINSTALLDIR"/scripts/execwrapper.sh.template \
	> "$SECURITY_CONF_DIR/execwrapper.sh"
chmod 755 "$SECURITY_CONF_DIR/execwrapper.sh"

echo "[!] *********************************************************************"
echo "[!] You need to install the following sudo authorization rules"
echo "        Defaults!$SECURITY_CONF_DIR/execwrapper.sh !requiretty"
echo "        $DSS_USER ALL = (root) NOPASSWD: $SECURITY_CONF_DIR/execwrapper.sh"
echo "[!] *********************************************************************"

############### Configure install.ini for external mode

exec_wrapper_location=$("$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -get mus exec_wrapper_location)

if [ -z "$exec_wrapper_location" -o "$exec_wrapper_location" = "None" ]; then
	"$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -set mus exec_wrapper_location "$SECURITY_CONF_DIR"/execwrapper.sh
elif [ "$exec_wrapper_location" != "$SECURITY_CONF_DIR"/execwrapper.sh ]; then
	echo "[!] *********************************************************************"
	echo "[!] WARNING : exec_wrapper_location currently set to $exec_wrapper_location"
	echo "[!] Should be $SECURITY_CONF_DIR/execwrapper.sh"
	echo "[!] Check configuration file $DIP_HOME/install.ini"
	echo "[!] *********************************************************************"
fi

############### Enable impersonation in DSS

echo "[+] Enabling impersonation in DSS"
"$DIP_HOME"/bin/dku __enable-impersonation

echo "[+]"
echo "[+] *********************************************************************"
echo "[+] Impersonation initial setup complete"
echo "[+] Please follow the documentation for mandatory configuration steps"
echo "[+] (security module configuration and DSS setup)"
echo "[+] *********************************************************************"
