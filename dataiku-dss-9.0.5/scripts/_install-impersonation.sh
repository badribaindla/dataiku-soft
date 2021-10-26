#!/bin/bash -e
# Enables impersonation on a newly-created DSS instance.

# Don't call this directly. Use ./bin/dssadmin install-impersonation
# Must be run as root

# Warning : converting an already-used instance to multi-user security is not officially supported.

Usage() {
	echo >&2 "Usage: dssadmin install-impersonation [-internal] [-securityDir SECURITY_DIR] [-pythonBin PYTHONBIN] [-noInstallSudoSnippet] DSS_USER"
	echo >&2 "    DSS_USER : Unix account name for this DSS instance"
	echo >&2 "    PYTHONBIN : python2.7 binary to use for secure privileged code, default 'python2.7'"
	echo >&2 "    SECURITY_DIR : Path where security settings and wrappers are installed, default /etc/dataiku-security/INSTANCE_ID"
	echo >&2 "    -internal : keep security dir inside DATADIR/security (pre-DSS-5.1 legacy mode). Not recommended for new installs."
	echo >&2 "    -noInstallSudoSnippet : do not install sudo authorization rules in /etc/sudoers.d"
	exit 1
}

# -external : install security dir and secure python code in external dir (default with DSS 5.1)

PYTHONBIN="python2.7"
MODE="external"
CONFIGURED_EXTERNAL_SECURITY_DIR=
INSTALL_SUDO_SNIPPET=1

while [[ "$1" == -* ]]; do
	if [ $# -ge 2 -a "$1" = "-pythonBin" ]; then
		PYTHONBIN="$2"
		shift 2
	elif [ $# -ge 1 -a "$1" = "-external" ]; then
		MODE="external"
		shift
	elif [ $# -ge 1 -a "$1" = "-internal" ]; then
		MODE="internal"
		shift
	elif [ $# -ge 2 -a "$1" = "-securityDir" ]; then
		CONFIGURED_EXTERNAL_SECURITY_DIR="$2"
		shift 2
	elif [ $# -ge 1 -a "$1" = "-noInstallSudoSnippet" ]; then
		INSTALL_SUDO_SNIPPET=0
		shift
	else
		Usage
	fi
done
if [ $# -ne 1 ]; then
	Usage
fi
DSS_USER="$1"

if [ -n "$CONFIGURED_EXTERNAL_SECURITY_DIR" ]; then
	if [ "$MODE" != "external" ]; then
		echo >&2 "-securityDir DIR requires -external"
		exit 1
	fi
	if [[ "$CONFIGURED_EXTERNAL_SECURITY_DIR" != /* ]]; then
		echo >&2 "Security directory must be absolute: $CONFIGURED_EXTERNAL_SECURITY_DIR"
		exit 1
	fi
fi

############# Initial sanity checks

if [ $EUID -ne 0 ]; then
	echo "[-] FATAL: Must run as root"
	exit 1
fi

if [ -z "$DKUINSTALLDIR" ]; then
  echo >&2 "[-] FATAL: DKUINSTALLDIR is not defined. Please check $DIR/env-default.sh"
  exit 1
fi

if [ -z "$DIP_HOME" -o ! -d "$DIP_HOME" ]; then
	echo >&2 "[-] FATAL: DIP_HOME not found"
	exit 1
fi

if [ "$(uname)" = "Darwin" ]; then
	DIPHOME_OWNER=$(stat -f "%Su" "$DIP_HOME")
else
	DIPHOME_OWNER=$(stat -c "%U" "$DIP_HOME")
fi
if [ "$DSS_USER" != "$DIPHOME_OWNER" ]; then
   echo "Bad owner on data directory - $DIPHOME_OWNER should be $DSS_USER"
   exit 1
fi

INSTANCE_ID=$("$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -get general installid)
if [ -z "$INSTANCE_ID" -o "$INSTANCE_ID" = "None" ]; then
	echo >&2 "Error : mandatory instance ID not found in $DIP_HOME/install.ini"
	exit 1
fi

############### Initial license check

echo "[+] Enabling impersonation in DSS"

############### Filesystem chmods on DKUINSTALLDIR

if [ "$MODE" = "internal" ]
then
	echo "[+] Setting permissions on $DKUINSTALLDIR"
	chown root "$DKUINSTALLDIR" "$DKUINSTALLDIR"/python
	chmod og-w "$DKUINSTALLDIR" "$DKUINSTALLDIR"/python
	chown -R root "$DKUINSTALLDIR"/python/dataikusecurity
	chmod -R og-w "$DKUINSTALLDIR"/python/dataikusecurity
fi

############### Create external security dir if configured
if [ "$MODE" = "external" ]
then
	if [ -z "$CONFIGURED_EXTERNAL_SECURITY_DIR" ]
	then
		SECURITY_CONF_DIR="/etc/dataiku-security/$INSTANCE_ID"
	else
		SECURITY_CONF_DIR="$CONFIGURED_EXTERNAL_SECURITY_DIR"
	fi
	echo "[+] Creating external security directory $SECURITY_CONF_DIR"
	mkdir -p "$SECURITY_CONF_DIR"
	rm -rf "$SECURITY_CONF_DIR/python"
	cp -rp "$DKUINSTALLDIR"/python/dataikusecurity "$SECURITY_CONF_DIR/python"
	chown -R root:root "$SECURITY_CONF_DIR/python"
	chmod -R og-w "$SECURITY_CONF_DIR/python"
else
	SECURITY_CONF_DIR="$DIP_HOME/security"
fi

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
	model_evaluation_stores \
	lib \
	plugins \
	R.lib \
	saved_models \
	scenarios \
	tmp \
	; do
	su - "$DSS_USER" -c "mkdir -p \"$DIP_HOME/$d\""
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
# Important: owned by root, not DSS_USER.
# This prevents additional privilege escalations by DSS admins
mkdir -p "$SECURITY_CONF_DIR"
chown root "$SECURITY_CONF_DIR"
chmod 700 "$SECURITY_CONF_DIR"

# There is a specific case: if the file does not exist in the target, but does exist in the
# internal folder (i.e. we are migrating from internal to external), then we copy it in order
# not to lose user configuration

if [ -f "$SECURITY_CONF_DIR/security-config.ini" ]; then
	echo "[+] Using existing security configuration file: $SECURITY_CONF_DIR/security-config.ini"
elif [ "$MODE" = "external" -a -f "$DIP_HOME/security/security-config.ini" ]; then
	echo "[+] Copying internal security configuration file: $DIP_HOME/security/security-config.ini"
	cp -p "$DIP_HOME/security/security-config.ini" "$SECURITY_CONF_DIR/security-config.ini"
	echo "[+]   Renaming previous internal security configuration to: $DIP_HOME/security/security-config.ini.MIGRATED"
	mv "$DIP_HOME/security/security-config.ini" "$DIP_HOME/security/security-config.ini.MIGRATED"
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
chown root "$SECURITY_CONF_DIR/security-config.ini"
chmod 600 "$SECURITY_CONF_DIR/security-config.ini"

############### Sudo wrapper

echo "[+] Creating sudo execution wrapper"

if [ "$MODE" = "external" ]
then
    sed \
	-e "s;{{PYTHONBIN}};$PYTHONBIN;g" \
	-e "s;{{PYTHONDIR}};$SECURITY_CONF_DIR/python;g" \
	-e "s;{{CONFIGDIR}};$SECURITY_CONF_DIR;g" \
	"$DKUINSTALLDIR"/scripts/execwrapper.sh.template \
	> "$SECURITY_CONF_DIR/execwrapper.sh"
else
    sed \
	-e "s;{{PYTHONBIN}};$PYTHONBIN;g" \
	-e "s;{{PYTHONDIR}};$DKUINSTALLDIR/python/dataikusecurity;g" \
	-e "s;{{CONFIGDIR}};$SECURITY_CONF_DIR;g" \
	"$DKUINSTALLDIR"/scripts/execwrapper.sh.template \
	> "$SECURITY_CONF_DIR/execwrapper.sh"
fi

chown root "$SECURITY_CONF_DIR/execwrapper.sh"
chmod 700 "$SECURITY_CONF_DIR/execwrapper.sh"

############### Sudoers installation

if [ "$INSTALL_SUDO_SNIPPET" = "1" ]
then
	if [ ! -d /etc/sudoers.d ]; then
		echo "[!] /etc/sudoers.d not found. You'll need to manually add the following sudoers snippet"
		echo "Defaults!$SECURITY_CONF_DIR/execwrapper.sh !requiretty"
		echo "$DSS_USER ALL = (root) NOPASSWD: $SECURITY_CONF_DIR/execwrapper.sh"
	else
		echo "[+] Installing sudoers policy file /etc/sudoers.d/dataiku-dss-$DSS_USER-$INSTANCE_ID"
		cat << EOF > /etc/sudoers.d/dataiku-dss-"$DSS_USER-$INSTANCE_ID"
Defaults!$SECURITY_CONF_DIR/execwrapper.sh !requiretty
$DSS_USER ALL = (root) NOPASSWD: $SECURITY_CONF_DIR/execwrapper.sh
EOF
	fi
fi
############### Configure install.ini for external mode

if [ "$MODE" = "external" ]
then
    su - "$DSS_USER" -c "\"$DKUPYTHONBIN\" \"$DKUINSTALLDIR\"/scripts/dkuinstall/install_config.py -d \"$DIP_HOME\" -set mus exec_wrapper_location \"$SECURITY_CONF_DIR\"/execwrapper.sh"
fi

############### Enable impersonation in DSS

echo "[+] Enabling impersonation in DSS"
su - "$DSS_USER" -c "\"$DIP_HOME\"/bin/dku __enable-impersonation"

echo "[+]"
echo "[+] *********************************************************************"
echo "[+] Impersonation initial setup complete"
echo "[+] Please follow the documentation for mandatory configuration steps"
echo "[+] (security module configuration and DSS setup)"
echo "[+] *********************************************************************"
