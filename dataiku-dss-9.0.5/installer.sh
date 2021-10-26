#! /bin/bash -e

echo "*********************************************"
echo "*           Dataiku DSS installer           *"
echo "*********************************************"

MYDIR=$(cd "$(dirname "$0")" && pwd -P)

# Initial sanity checks
if [ $(id -u) -eq 0 ]; then
  echo >&2 "[-] Installing or running DSS as root is not supported."
  exit 1
fi

if [ "$(uname)" == "Darwin" ] && [ ! -d "$MYDIR/conda.packages/osx-"* ]; then
  echo >&2 "[-] This is the installer for the Linux version of DSS. Please download the Mac OSX version from www.dataiku.com."
  exit 1
fi

if [ "$(uname)" == "Linux" ] && [ ! -d "$MYDIR/conda.packages/linux-"* ]; then
  echo >&2 "[-] This is the installer for the Mac OSX version of DSS. Please download the Linux version from www.dataiku.com."
  exit 1
fi

# Parse command line options
usage() {
	prog=$(basename "$0")
	echo >&2 "
*** Usage:
New installation:    $prog -d DATADIR -p BASE_PORT [-t NODETYPE] [-s SIZE] [-l LICENSE_FILE] [-n] [-P BASE_PYTHON]
Upgrade:             $prog -u -d DATADIR [-y] [-n] [-P BASE_PYTHON]
Print this help:     $prog -h

  -d DATADIR : specify data directory
  -p BASE_PORT : specify base port
  -l LICENSE_FILE : specify license file
  -t NODETYPE : DSS node type to install ('design', 'automation', 'api' or 'deployer' - defaults to 'design')
  -s SIZE: Sizing of the install ('auto', 'big', 'medium', 'small' - defaults to 'auto')
  -n : do not check for required dependencies
  -u : upgrade an existing data directory
  -y : do not prompt, assume answer 'yes'
  -P BASE_PYTHON : Python binary on which to build DSS default virtual environment
  -h : prints this help
  "
	exit 1
}

NODETYPE=design
INSTALL_SIZE=auto
DIP_HOME=
LICENSE=
PORT=
noDeps=
upgrade=
conda=
BASE_PYTHON=
yes=
while getopts t:s:d:p:l:P:hnuyC OPT; do
	case "$OPT" in
	t)
		NODETYPE="$OPTARG"
		;;
	s)
		INSTALL_SIZE="$OPTARG"
		;;
	d)
		DIP_HOME="$OPTARG"
		;;
	p)
		PORT="$OPTARG"
		;;
	l)
		LICENSE="$OPTARG"
		;;
	P)
		BASE_PYTHON="$OPTARG"
		;;
	h)
		usage
		;;
	n)
		noDeps=1
		;;
	u)
		upgrade=1
		;;
	y)
		yes=1
		export DKU_MIGRATE_YES=1
		;;
	C)
		conda=1
		;;
	*)
		usage
		;;
	esac
done

if [ $OPTIND -le $# ]; then
	echo >&2 "[-] Bad usage: invalid argument : ${!OPTIND}"
	usage
fi

#
# Check arguments
#

if [ -z "$NODETYPE" ]; then
	echo >&2 "[-] Bad usage: node type (-t) can't be empty"
fi
if [ "$NODETYPE" = "apideployer" ]; then
	echo >&2 "[!] Warning: node type (-t) 'apideployer' is deprecated, please use 'deployer' instead. Installation will continue using 'deployer' node type."
	NODETYPE=deployer
fi
if [ "$NODETYPE" != "design" -a "$NODETYPE" != "automation" -a "$NODETYPE" != "api" -a "$NODETYPE" != "deployer" ]; then
	echo >&2 "[-] Bad usage: node type (-t) must be one of 'design', 'automation', 'api' or 'deployer'"
	usage
fi

if [ -z "$INSTALL_SIZE" ]; then
	echo >&2 "[-] Bad usage: install size (-s) can't be empty"
fi
if [ "$INSTALL_SIZE" != "auto" -a "$INSTALL_SIZE" != "big" -a "$INSTALL_SIZE" != "medium"  -a "$INSTALL_SIZE" != "small" ]; then
	echo >&2 "[-] Bad usage: install size (-s) must be one of 'auto', 'big', 'medium' or 'small'"
	usage
fi

if [ -n "$upgrade" -a \( -n "$PORT" -o -n "$LICENSE" \) ]; then
    echo "[-] Bad usage: cannot specify port or license file while upgrading" >&2
	usage
fi

if [ -n "$conda" -a -n "$BASE_PYTHON" ]; then
	echo "[-] Bad usage: cannot specify both conda (-C) and base python (-P)" >&2
	usage
fi

if [ -z "$DIP_HOME" ]; then
	echo "[-] Bad usage : -d DATADIR argument is mandatory" >&2
	usage
fi
# Sanity check, strip trailing / if any
case "$DIP_HOME" in
	. | ./ | .. | ../ | / )
		echo "[-] Invalid value for DATADIR : $DIP_HOME" >&2
		usage
		;;
	*/ )
		DIP_HOME=$(echo "$DIP_HOME" | sed 's_/$__')
		;;
esac

if [ -n "$upgrade" ]; then
	if [ -d "$DIP_HOME" -a -f "$DIP_HOME"/dss-version.json ]; then
		echo "[+] $DIP_HOME already exists and is a DSS installation"
	else
		echo >&2 "[-] $DIP_HOME does not appear to be a valid DSS installation"
		exit 1
	fi
else
	if [ -z "$PORT" ]; then
		echo "Bad usage : -p BASE_PORT argument is mandatory" >&2
		usage
	fi

	if [ -f "$DIP_HOME"/DSS-INITIAL-INSTALL-IN-PROGRESS.txt ]; then
		echo "[!] *****************************************************" >&2
		echo "[!] $DIP_HOME contains a previously failed install of DSS" >&2
		echo "[!] Moving it out of the way and proceeding" >&2
		echo "[!] *****************************************************" >&2
		mv "$DIP_HOME" "$DIP_HOME.dss_failed_install.`date +%Y%m%d-%H%M%S`"
	fi

	if [ -f "$DIP_HOME"/config/dip.properties ]; then
	    echo "[-] $DIP_HOME appears to already contain a DSS installation" >&2
	    echo "[-] If you want to upgrade it, rerun this installer with the -u flag" >&2
        exit 1
    fi
	if [ ! -e "$DIP_HOME" ]; then
		echo "[+] Creating data directory: $DIP_HOME" >&2
		mkdir -p "$DIP_HOME"
		touch "$DIP_HOME"/DSS-INITIAL-INSTALL-IN-PROGRESS.txt

	elif [ -d "$DIP_HOME" -a -z "$(ls "$DIP_HOME" 2>/dev/null)" ]; then
		echo "[+] Using data directory: $DIP_HOME" >&2
		touch "$DIP_HOME"/DSS-INITIAL-INSTALL-IN-PROGRESS.txt
	else
		echo "[-] Directory $DIP_HOME already exists, but is not empty. Aborting !" >&2
		exit 1
	fi
fi

DIP_HOME=$(cd "$DIP_HOME" && pwd -P)
umask 22

# Start logging script output
mkdir -p "$DIP_HOME"/run
logFile="$DIP_HOME"/run/install.log
echo "[+] Saving installation log to $logFile"
cat >>"$logFile" <<EOF
*********************************************************
Data Science Studio installer: $(date +%Y/%m/%d-%H:%M:%S)
Command line: $0 $@
Version: $(cat "$MYDIR"/dss-version.json)
DIP_HOME: $DIP_HOME

EOF

# Start block | tee -a "$logFile"
set -o pipefail
(
set +o pipefail

#
# Check for running instance
#
if "$DIP_HOME"/bin/dss status >/dev/null 2>/dev/null; then
	echo "[!] *********************************************************"
	echo "[!] There seem to be an already running instance of the Studio"
	echo "[!] using this data directory:"
	"$DIP_HOME"/bin/dss status
	echo "[!]"
	echo "[!] It is STRONGLY RECOMMENDED to stop it before upgrade."
	echo "[!] If you continue, you will not be able to use bin/dss stop"
	echo "[!] and will need to kill the processes manually"
	if [ -z "$yes" ]; then
		echo "[!] Press Enter to continue at your own risk, Ctrl+C to abort"
   		read
   	else
   		echo "[!] Non-interactive mode, continuing anyway"
   	fi
fi

#
# Check for DATADIR inside INSTALLDIR
#
# this check is enough because both DIP_HOME and MYDIR have been cleaned with (cd ... && pwd -P)
if [[ "$DIP_HOME" == "$MYDIR"/* ]]; then
	echo "[!] *********************************************************"
	echo "[!] Warning: the data directory you specified:"
	echo "[!]     $DIP_HOME"
	echo "[!] appears to be a subdirectory of the installation directory:"
	echo "[!]     $MYDIR"
	echo "[!] This is NOT RECOMMENDED for production environment as it complexifies subsequent Studio upgrades."
	if [ -z "$yes" ]; then
		echo "[!] Press Enter to continue, Ctrl+C to abort"
		read
	else
		echo "[!] Non-interactive mode, continuing anyway"
	fi
fi

#
# Check for SELinux
#
getenforce >/dev/null 2>/dev/null && true
SELINUX_STATE_VALUE=$?
if [[ "$SELINUX_STATE_VALUE" == "0" ]]; then
    # getenforce is here.
    if getenforce | grep -i -e "disabled" -e "permissive" >/dev/null; then
        echo "[!] SELinux is installed but not enforcing"
    else
        echo "[!] *********************************************************"
        echo "[!] Warning: you have SELinux installed and enforcing."
        echo "[!] DSS cannot run unless you edit the policies to allow nginx to serve its files."
        if [ -z "$yes" ]; then
            echo "[!] Press Enter to continue, Ctrl+C to abort"
            read
        else
            echo "[!] Non-interactive mode, continuing anyway"
        fi
    fi
fi

#
# Check system dependencies
#
deps_flags=
if [ -n "$DKUJAVABIN" ]; then
	echo "[+] Using custom Java environment \"$DKUJAVABIN\""
	javaBin="$DKUJAVABIN"
	deps_flags="$deps_flags -without-java"
elif javaBin=$("$MYDIR"/scripts/_find-java.sh); then
	deps_flags="$deps_flags -without-java"
else
	javaBin=
fi
if [ -n "$DKUPYTHONBIN" ]; then
	echo "[+] Using custom Python environment \"$DKUPYTHONBIN\""
	deps_flags="$deps_flags -without-python"
elif [ -n "$conda" -o -d "$DIP_HOME"/condaenv ]; then
	echo "[!] *****************************************************"
	echo "[!] WARNING: Usage of Conda for the base DSS environment"
	echo "[!]          is deprecated and will be removed in a later"
	echo "[!]          release"
	echo "[!] It is strongly recommended to stop using this option"
	echo "[!] *****************************************************"
	deps_flags="$deps_flags -with-conda"
fi

if [ -z "$noDeps" ]; then
	echo "[+] Checking required dependencies"
	"$MYDIR"/scripts/install/install-deps.sh -check $deps_flags || {
		echo >&2 "
[-] Dependency check failed
[-] You can install required dependencies with:
[-]    sudo -i \"$MYDIR/scripts/install/install-deps.sh\"$deps_flags
[-] You can also disable this check with the -n installer flag
"
		exit 1
	}
fi
if [ -z "$javaBin" ]; then
	echo "[-] Could not find suitable Java installation. Aborting!" >&2
	exit 1
elif "$javaBin" -version 2>&1 >/dev/null | grep -qE '^(java|openjdk) version "1\.7\.'; then
	echo "[!] *****************************************************" >&2
	echo "[!] WARNING: DSS support for Java 7 is deprecated        " >&2
	echo "[!]          and will be removed in a later release      " >&2
	echo "[!] Some DSS features will be disabled                   " >&2
	echo "[!] It is strongly advised to upgrade to Java 8 or later " >&2
	echo "[!] *****************************************************" >&2
fi

function precompile_python {
	pythonBin="$1"
	precompilePackages="$2"

	if [ ! -w "$MYDIR" ]; then
		echo "[-] Read-only installation directory $MYDIR, skipping Python precompilation"
		return
	fi

	echo "[+] Precompiling Dataiku Python code"
	"$pythonBin" -m compileall -q "$MYDIR"/python ||
		echo "[-] Error precompiling Dataiku Python code (ignored)"
	echo "[+] Precompiling Jupyter Python code"
	"$pythonBin" -m compileall -q "$MYDIR"/dku-jupyter ||
		echo "[-] Error precompiling Jupyter Python code (ignored)"

	if [ -n "$precompilePackages" ]; then
		pythonVersion=$("$pythonBin" -c "import sysconfig;print(sysconfig.get_python_version())")
		case "$pythonVersion" in
			"2.7") pkgDir="$MYDIR"/python.packages;;
			"3.6") pkgDir="$MYDIR"/python36.packages;;
			"3.7") pkgDir="$MYDIR"/python37.packages;;
			*) ;;
		esac
		# Ignore errors as there are a few Python3-specific files in there
		echo "[+] Precompiling third-party Python $pythonVersion code"
		"$pythonBin" -m compileall -q "$pkgDir" >/dev/null || true
	fi
}

if [ -n "$upgrade" ]
then
	######################################################################################
	#                             Upgrade
	######################################################################################

	# Create or upgrade Python environment unless overridden
	if [ -n "$DKUPYTHONBIN" ]; then
		pythonBin="$DKUPYTHONBIN"

	elif [ -d "$DIP_HOME"/condaenv ]; then
		echo "[+] Migrating Conda environment"
		"$MYDIR"/scripts/_install-condaenv.sh -u "$DIP_HOME"
		pythonBin="$DIP_HOME/bin/python"
		precompile_python "$pythonBin" ""

	elif [ -n "$conda" ]; then
		echo "[+] Initializing Conda environment"
		"$MYDIR"/scripts/_install-condaenv.sh "$DIP_HOME"
		pythonBin="$DIP_HOME/bin/python"
		precompile_python "$pythonBin" ""

	elif [ -d "$DIP_HOME"/pyenv ]; then
		echo "[+] Migrating Python environment"
		"$MYDIR"/scripts/_install-pyenv.sh -u "$DIP_HOME"
		pythonBin="$DIP_HOME/bin/python"
		precompile_python "$pythonBin" "yes"

	else
		if [ -z "$BASE_PYTHON" ]; then
			echo "[+] Initializing Python environment using platform default"
			"$MYDIR"/scripts/_install-pyenv.sh "$DIP_HOME"
		else
			echo "[+] Initializing Python environment using '$BASE_PYTHON'"
			"$MYDIR"/scripts/_install-pyenv.sh -p "$BASE_PYTHON" "$DIP_HOME"
		fi
		pythonBin="$DIP_HOME/bin/python"
		precompile_python "$pythonBin" "yes"
	fi

	# Perform migration
	echo "[+] Migrating data directory"
	PYTHONIOENCODING=UTF-8 PYTHONUNBUFFERED=1 DKUINSTALLDIR="$MYDIR" DKUJAVABIN="$javaBin" \
		"$pythonBin" "$MYDIR"/scripts/dkuinstall/migrate_auto.py "$DIP_HOME"

	NODETYPE=$("$pythonBin" "$MYDIR"/scripts/dkuinstall/install_config.py -d "$DIP_HOME" -get nodetype)
	echo "Node type : $NODETYPE"
else
	######################################################################################
	#                             Fresh install
	######################################################################################

	echo "[+] Installation starting"
	cp -p "$MYDIR"/dss-version.json "$DIP_HOME"/
	chmod u+w "$DIP_HOME"/dss-version.json   # should not be necessary
	mkdir -p "$DIP_HOME"/bin "$DIP_HOME"/config

	# Create empty env-site.sh
	cat <<EOF >"$DIP_HOME"/bin/env-site.sh
# This file is sourced last by DSS startup scripts
# You can add local customizations to it
EOF

	if [ -n "$LICENSE" ]; then
		echo "[+] Installing license file"
		cp -p "$LICENSE" "$DIP_HOME"/config/license.json
	fi

	# Create Python environment unless overridden
	if [ -n "$DKUPYTHONBIN" ]; then
		pythonBin="$DKUPYTHONBIN"
		precompile_python "$pythonBin" ""

	elif [ -n "$conda" ]; then
		echo "[+] Initializing Conda environment"
		"$MYDIR"/scripts/_install-condaenv.sh "$DIP_HOME"
		pythonBin="$DIP_HOME"/bin/python
		precompile_python "$pythonBin" ""

	else
		echo "[+] Initializing Python environment"
		if [ -z "$BASE_PYTHON" ]; then
			echo "[+] Initializing Python environment using platform default"
			"$MYDIR"/scripts/_install-pyenv.sh "$DIP_HOME"
		else
			echo "[+] Initializing Python environment using '$BASE_PYTHON'"
			"$MYDIR"/scripts/_install-pyenv.sh -p "$BASE_PYTHON" "$DIP_HOME"
		fi
		pythonBin="$DIP_HOME"/bin/python
		precompile_python "$pythonBin" "yes"
	fi

	# Perform various installation steps
	if [ "$NODETYPE" = "design" ] || [ "$NODETYPE" = "automation" ] || [ "$NODETYPE" = "deployer" ]
	then
		DKUINSTALLDIR="$MYDIR" DKUJAVABIN="$javaBin" \
		"$pythonBin" "$MYDIR"/scripts/dkuinstall/install_dss.py "$DIP_HOME" $PORT "$NODETYPE" "$INSTALL_SIZE"

		# Create initial stuff in config (FS connections and users/groups)
		echo "[+] Preparing data directory initial data"
		"$DIP_HOME"/bin/dku -s __initial-setup-home "$DIP_HOME" "$NODETYPE"

	elif [ "$NODETYPE" = "api" ]
	then
		DKUINSTALLDIR="$MYDIR" DKUJAVABIN="$javaBin" \
		"$pythonBin" "$MYDIR"/scripts/dkuinstall/install_apinode.py "$DIP_HOME" $PORT

		# For API node, everything is created in Python
	else
		echo "[!] Unexpected node type"
		exit 1
	fi
fi


# If we seem to be able to auto-detect Hadoop, then auto-install it
if [ "$NODETYPE" != "api" ]
then
	if HADOOP_VERSION=$(hadoop version 2>/dev/null); then
		echo "[+] Hadoop found, checking security settings"

		HADOOP_SECURITY_ENABLED=`hadoop jar $MYDIR/dist/dataiku-dip.jar com.dataiku.dip.hadoop.HadoopIsSecurityEnabled`
		if [ $HADOOP_SECURITY_ENABLED = "true" ]
		then
			echo "[-] Hadoop security is enabled, disabling auto-configuration"
		else
			echo "[+] Hadoop security is disabled, auto-configuring"
			"$DIP_HOME/bin/dssadmin" -noLog install-hadoop-integration || echo >&2 "[-] Failed auto-configuration of Hadoop. Please see documentation"
		fi
	fi
fi

# Install native IPython kernel
if [ "$NODETYPE" != "api" ]
then
	jupyterData="$DIP_HOME"/jupyter-run/jupyter
	JUPYTER_DATA_DIR="$jupyterData" "$pythonBin" -m ipykernel install --user

	jupyterConfig="$jupyterData"

	# Previous to 9.0.5 it was a symlink
	# Remove the link if exists and enable back the extensions
	if [ -L "$jupyterData/nbextensions" ]; then
		rm "$jupyterData/nbextensions"
	fi

	# Enable extensions by default if we don't already have a file
	if [ ! -f "$jupyterConfig/nbconfig/notebook.json" ]; then
		"$DIP_HOME/bin/dssadmin" jupyter-nbextensions enable collapsible_headings/main
		"$DIP_HOME/bin/dssadmin" jupyter-nbextensions enable codefolding/main
		"$DIP_HOME/bin/dssadmin" jupyter-nbextensions enable toggle_all_line_numbers/main
		"$DIP_HOME/bin/dssadmin" jupyter-nbextensions enable hide_input_all/main
		"$DIP_HOME/bin/dssadmin" jupyter-nbextensions enable addbefore/main
	else
		# Enable extension if the extension's folder is not present (migration prior to 9.0.5)
		for extension in $(JUPYTER_CONFIG_DIR="$jupyterData/config" "$DIP_HOME/bin/dssadmin" jupyter-nbextensions list | tail -n +2)
		do
			if [ ! -f "$jupyterData/nbextensions/$extension.js" ]; then
				"$DIP_HOME/bin/dssadmin" jupyter-nbextensions enable $extension
			fi
		done
		for extension in $("$DIP_HOME/bin/dssadmin" jupyter-nbextensions list | tail -n +2)
		do
			if [ ! -f "$jupyterData/nbextensions/$extension.js" ]; then
				"$DIP_HOME/bin/dssadmin" jupyter-nbextensions enable $extension
			fi
		done
	fi
fi

# Add log4j config for apinode
if [ "$NODETYPE" = "api" ]
then
	cp -p "$MYDIR/dist/apinode-default-log4j.properties" "$DIP_HOME"/bin/log4j.properties
fi

"$DIP_HOME"/bin/dssadmin -noLog regenerate-config

# Final steps that we always do
mkdir -p "$DIP_HOME"/lib/jdbc  "$DIP_HOME"/lib/java "$DIP_HOME"/lib/python

rm -f "$DIP_HOME"/DSS-INITIAL-INSTALL-IN-PROGRESS.txt

echo "$DIP_HOME" > "$DIP_HOME"/install-support/expected-dip-home.txt

echo "***************************************************************"
echo "* Installation complete (DSS node type: $NODETYPE)"
echo "* Next, start DSS using:"
echo "*         '$DIP_HOME/bin/dss start'"

if [ -z "$upgrade" -a "$NODETYPE" != "api" ]; then
	# Initial installation
	echo "* Dataiku DSS will be accessible on http://<SERVER ADDRESS>:$PORT"
	if [ "$(uname)" != "Darwin" ]; then
		echo "*"
		echo "* You can configure Dataiku DSS to start automatically at server boot with:"
		echo "*    sudo -i \"$MYDIR/scripts/install/install-boot.sh\" \"$DIP_HOME\" $(id -un)"
	fi
fi
echo "***************************************************************"

) 2>&1 | tee -a "$logFile"
