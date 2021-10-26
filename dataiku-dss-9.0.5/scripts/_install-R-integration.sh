#! /bin/bash -e
# Configures or reconfigures DSS R integration
# Optional "pkgDir" parameter is a local repository of R packages for offline installation

# Don't call this directly. Use ./bin/dssadmin install-R-integration

Usage() {
	echo >&2 "Usage: $0 [-noDeps] [-repo REPO_URL | -pkgDir DIR]"
	echo >&2 "    -noDeps: do not check system dependencies"
	echo >&2 "    -repo REPO_URL: use CRAN repository REPO_URL (default: https://cloud.r-project.org)"
	echo >&2 "    -pkgDir DIR: install R packages from local directory DIR"
	exit 1
}

MYDIR=$(cd "$(dirname "$0")" && pwd -P)
DKUINSTALLDIR=$(dirname "$MYDIR")

if [ -z "$DIP_HOME" -o ! -d "$DIP_HOME" ]; then
	echo >&2 "*** Error: DIP_HOME not found"
	exit 1
fi

noDeps=
repo="https://cloud.r-project.org"
pkgDir=
while [ $# -gt 0 ]; do
	if [ "$1" = "-noDeps" ]; then
		noDeps=1
		shift
	elif [ $# -ge 2 -a "$1" = "-repo" ] ; then
		repo="$2"
		shift 2
	elif [ $# -ge 2 -a "$1" = "-pkgDir" ] ; then
		# Make absolute
		case "$2" in
			/*) pkgDir="$2";;
			*) pkgDir="$PWD/$2";;
		esac
		shift 2
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
		-without-java -without-python -with-r || {
		echo >&2 "
[-] Dependency check failed
[-] You can install required dependencies with:
[-]    sudo -i \"$DKUINSTALLDIR/scripts/install/install-deps.sh\" -without-java -without-python -with-r
[-] You can also disable this check with the -noDeps option
"
		exit 1
	}
fi

# R interpreter to use
if [ -z "$DKURBIN" ]; then
	if ! DKURBIN=$(command -v R); then
		echo >&2 "*** Error: R: command not found"
		exit 1
	fi
fi

# Python environment to use
if [ -z "$DKUPYTHONBIN" ]; then
	DKUPYTHONBIN="$DIP_HOME"/bin/python
fi

# Override default repository with local dir if required
if [ -n "$pkgDir" ]; then
	repo="file://$pkgDir"
	if ls -d "$pkgDir"/icudt*.zip >&/dev/null; then
		# This is needed for offline install of stringi (httr dep) in case it needs
		# to build its embedded version of libicu.
		# We do not use the documented "configure.vars" option to install.packages()
		# as it is silently ignored when several packages are installed simultaneously.
		export ICUDT_DIR="$pkgDir"
	fi
fi

# DSS instance local R library
DKURLIB="$DIP_HOME"/R.lib
mkdir -p "$DKURLIB"
if [ -z "$R_LIBS" ]; then
	export R_LIBS="$DKURLIB"
else
	export R_LIBS="$DKURLIB:$R_LIBS"
fi

# Ignore packages in the user library
export R_LIBS_USER="$DKURLIB"

#
# Install required R packages
#
echo "[+] Installing required R packages into $DKURLIB"
"$DKURBIN" --slave --no-restore --file=- <<EOF
dependencies <- read.table(text="
    pkg             ver
    httr            1.2
    RJSONIO         1.3
    dplyr           0.5
    curl            2.4
    IRkernel        0.7.1
    sparklyr        0.5.1
    ggplot2         2.2.1
    gtools          3.5.0
    tidyr           0.6.1
    rmarkdown       1.6
    base64enc       0.1
    filelock        1.0.2
", header=TRUE, stringsAsFactors=FALSE)

checkPackages <- function() {
	message("Checking installed packages ...")
	installedVersions <- installed.packages(noCache=TRUE)[,'Version']
	l <- apply(dependencies, 1, function(x) {
		p <- x['pkg']
		v <- x['ver']
		if (is.na(installedVersions[p])) {
			message("Package not installed: ", p)
			p
		} else if (package_version(installedVersions[p]) < package_version(v)) {
			message("Package too old: ", p, " installed=", installedVersions[p] , " required=", v)
			p
		} else {
			NA
		}
	})
	na.omit(l)
}

toInstall <- checkPackages()
if (length(toInstall) > 0) {
	message("Installing packages: ", paste(toInstall, collapse=" "))
	install.packages(toInstall, "$DKURLIB", repos="$repo")
	if (length(checkPackages()) > 0) {
		stop("at least one package failed to install required version")
	}
}
EOF

#
# Install the R kernel definition in Jupyter
#
echo "[+] Installing R kernel for Jupyter"
KERNELSPEC_LOCATION=$("$DKURBIN" --slave --no-restore -e 'cat(system.file("kernelspec", package="IRkernel"))')
TMP_DIR=$(mktemp -d /tmp/dkutmp.XXXXXX)

export JUPYTER_DATA_DIR="$DIP_HOME"/jupyter-run/jupyter
export PYTHONPATH="$DKUINSTALLDIR/dku-jupyter/packages"

"$DKUPYTHONBIN" - "$KERNELSPEC_LOCATION" "$TMP_DIR" "$DKURBIN" <<EOF
import json, os, shutil, sys
from jupyter_client.kernelspecapp import KernelSpecApp

srcDir = sys.argv[1]
dstDir = os.path.join(sys.argv[2], 'ir')
rBin = sys.argv[3]

# Copy IRkernel kernelspec to tmp dir and patch DKURBIN into command line
shutil.copytree(srcDir, dstDir)
kernFile = os.path.join(dstDir, 'kernel.json')
with open(kernFile) as f:
	kernelDef = json.load(f)
kernelDef['argv'][0] = rBin
with open(kernFile, 'w') as f:
	json.dump(kernelDef, f, indent=2)

# Install kernel spec into Jupyter
# jupyter kernelspec install --user --replace --name ir DIR
sys.argv = [ '-', 'install', '--user', '--replace', '--name', 'ir', dstDir ]
sys.exit(KernelSpecApp.launch_instance())
EOF

rm -rf "$TMP_DIR"

echo "[+] Creating wrapper script $DIP_HOME/bin/R"
cat >"$DIP_HOME"/bin/R <<'EOF'
#!/bin/bash -e

BINDIR=$(cd "$(dirname "$0")" && pwd -P)
DIP_HOME=$(dirname "$BINDIR")

source "$BINDIR"/env-default.sh
if [ -z "$DKUINSTALLDIR" ]; then
  echo >&2 "FATAL: DKUINSTALLDIR is not defined. Please check $BINDIR/env-default.sh"
  exit 1
fi
source "$DKUINSTALLDIR/scripts/_startup.inc.sh"

bkdl_set_R_env
bkdl_load_env_files

if [ -z "$R_LIBS" ]; then
	export R_LIBS="$DKURLIB"
else
	export R_LIBS="$DKURLIB:$R_LIBS"
fi
export R_LIBS_USER="$DKURLIB"

exec "$DKURBIN" "$@"
EOF
chmod 755 "$DIP_HOME"/bin/R

echo "[+] Done"
