#!/bin/bash -e
# Boostraps or upgrades a Python virtual environment for Dataiku Science Studio

MYDIR=$(cd "$(dirname "$0")" && pwd -P)
INSTALLDIR=$(dirname "$MYDIR")

#
# Parse arguments
#
Usage() {
    echo >&2 "Usage: $0 [-u] [-p PYTHONBIN] DSS_DATADIR"
    echo >&2 "  -u : upgrade existing DSS Python environment (default: create new)"
    echo >&2 "  -p PYTHONBIN : base Python binary to use"
    exit 1
}

#
# Default Python interpreter for this platform
#
defaultPython() {
    detectedDistrib=$("$MYDIR"/_find-distrib.sh 2>/dev/null || echo "unknown unknown")
    read distrib distribVersion <<< "$detectedDistrib"
    case "$distrib" in
        debian)
            case "$distribVersion" in
                10*) echo "python3.7"; return;;
            esac
            ;;
        ubuntu)            
            case "$distribVersion" in
                "16.04") echo "python3.6"; return;;
                "18.04") echo "python3.6"; return;;
                "20.04") echo "python3.7"; return;;
            esac
            ;;
        centos | redhat | oraclelinux)
            echo "python3.6"; return
            ;;
        amazonlinux)
            case "$distribVersion" in
                2018.*) echo "python3.6"; return;;
                2) echo "python3.7"; return;;
            esac
            ;;
        suse)
            case "$distribVersion" in
                12.5) echo "python3.6"; return;;
                15*) echo "python3.6"; return;;
            esac
            ;;
        osx)
            echo "/usr/bin/python2.7"; return
            ;;
    esac
    echo "python2.7"
}

upgrade=
pythonBin=
while [[ "$1" == -* ]]; do
    if [[ "$1" == "-u" ]]; then
        upgrade=1
        shift
    elif [[ $# -ge 2 && "$1" == "-p" ]]; then
        pythonBin="$2"
        shift 2
    else
        Usage
    fi
done
if [[ $# -ne 1 || ! -d "$1" ]]; then
    Usage
fi
DIP_HOME="$1"

if [ -n "$upgrade" ]; then
    if [ -n "$pythonBin" ]; then
        echo >&2 "Error : cannot specify base Python binary when upgrading environment"
        exit 1
    fi
    # Reuse existing virtual environment
    pythonBin="$DIP_HOME"/pyenv/bin/python
elif [ -z "$pythonBin" ]; then
    pythonBin="$(defaultPython)"
    echo "+ Using default base Python for this platform : $pythonBin"
else
    echo "+ Using specified base Python binary: $pythonBin"
fi

#
# Check Python interpreter
#
if [ "$(uname)" = "Darwin" ]; then
    pythonPlatform="macosx"
else
    pythonPlatform="linux"
fi

pythonVersion=$("$pythonBin" -c "import sysconfig;print(sysconfig.get_python_version())")

# Binary compat tag should actually be retrieved with : wheel.pep425tags.get_abi_tag()
# but we may not have this package available, so we hardcode the value for now
case "$pythonVersion" in
    "2.7")
        pythonTag=$("$pythonBin" -c "import sys;print('cp27m' if sys.maxunicode <= 65535 else 'cp27mu')")
        pythonArch="$pythonTag-$pythonPlatform"
        pkgDir="python.packages"
        ;;
    "3.6")
        pythonTag="cp36m"
        pythonArch="$pythonTag-$pythonPlatform"
        pkgDir="python36.packages"
        ;;
    "3.7")
        pythonTag="cp37m"
        pythonArch="$pythonTag-$pythonPlatform"
        pkgDir="python37.packages"
        ;;
    *)
        echo >&2 "Unsupported Python version: $pythonVersion"
        exit 1
        ;;
esac

# Check the arch tag from the python.packages subdirectory
pkgArch=$(awk -F '=' '($1 == "arch"){print $2}' "$INSTALLDIR/$pkgDir/dss-version.txt")

if [ "$pythonArch" != "$pkgArch" ]; then
    echo >&2 "[-] Error: Python interpreter $pythonBin is not compatible with DSS-provided standard packages"
    echo >&2 "[-] Actual architecture $pythonArch differs from expected $pkgArch"
    # This should only happen with Unicode mismatch on Python 2.7
    if [ "$pythonVersion" = "2.7" ]; then
        case "$pkgArch" in
            cp27m-*) UNICODE="ucs2";;
            cp27mu-*) UNICODE="ucs4";;
        esac
        echo >&2 "
[-] Please use a Python installation built with \"--enable-unicode=$UNICODE\" configuration option
[-] or define DKUPYTHONBIN to an externally-provided Python installation already containing
[-] the required set of standard packages.
"
    fi
    exit 1
fi

if [ -z "$upgrade" ]; then
    # Initialize virtualenv
    mkdir "$DIP_HOME"/pyenv
    "$pythonBin" "$MYDIR"/virtualenv.pyz --no-download "$DIP_HOME"/pyenv || {
        echo >&2 "[-] Error: could not initialize Python virtualenv in $DIP_HOME/pyenv"
        rm -rf "$DIP_HOME"/pyenv
        exit 1
    }
fi

# Link standard packages from kit
rm -f "$DIP_HOME"/pyenv/lib/python"$pythonVersion"/sitecustomize.{py,pyc} \
      "$DIP_HOME"/pyenv/lib/python"$pythonVersion"/__pycache__/sitecustomize.*.pyc  # migration from DSS versions <= 8
mkdir -p "$DIP_HOME"/pyenv/lib/python"$pythonVersion"/site-packages
cat >"$DIP_HOME"/pyenv/lib/python"$pythonVersion"/site-packages/_dss_packages.pth <<EOF
import site; site.addsitedir('$INSTALLDIR/$pkgDir')
EOF

# Entry point wrapper scripts
mkdir -p "$DIP_HOME"/bin
for x in python pip; do
    rm -f "$DIP_HOME"/bin/$x
    cat <<EOF >"$DIP_HOME"/bin/$x
#!/bin/bash -e
exec "$DIP_HOME/pyenv/bin/$x" "\$@"
EOF
    chmod a+rx "$DIP_HOME"/bin/$x
done
