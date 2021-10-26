#!/bin/bash -e
# Fixup installation directory after kit extraction

Usage() {
	echo >&2 "Usage: $0 [-pythonBin PYTHON] [-skipPythonPackages] INSTALLDIR"
	exit 1
}

pythonBin="python2.7"
skipPythonPackages=
while [[ "$1" = -* ]]; do
	if [ $# -ge 2 -a "$1" = "-pythonBin" ]; then
		pythonBin="$2"
		shift 2
	elif [ "$1" = "-skipPythonPackages" ]; then
		skipPythonPackages=1
		shift
	else
		Usage
	fi
done
if [ $# -ne 1 ]; then
	Usage
fi
installDir="$1"

umask 22

# Fix file permissions where permitted
echo "[+] Resetting file permissions"
chmod -f -R og-w,a+rX "$installDir" ||
	echo >&2 "[-] Error setting file permissions on $installDir (ignored)"

# Precompile Python packages
if command -v "$pythonBin" >/dev/null; then

	echo "[+] Checking Python version"
	pythonVersion=$("$pythonBin" -c "import sysconfig;print(sysconfig.get_python_version())")
	case "$pythonVersion" in
		"2.7")
			pkgDir="python.packages"
			;;
		"3.6")
			pkgDir="python36.packages"
			;;
		"3.7")
			pkgDir="python37.packages"
			;;
		*)
			echo >&2 "[-] Unsupported Python version: $pythonVersion, skipping Python compilation"
			exit
			;;
	esac

	echo "[+] Precompiling Dataiku Python code"
	"$pythonBin" -m compileall -q "$installDir"/python ||
		echo >&2 "[-] Error precompiling Dataiku Python code (ignored)"

	echo "[+] Precompiling Jupyter Python code"
	"$pythonBin" -m compileall -q "$installDir"/dku-jupyter ||
		echo >&2 "[-] Error precompiling Jupyter Python code (ignored)"

	if [ -z "$skipPythonPackages" ]; then
		echo "[+] Precompiling third-party Python code"
		# Ignore errors as there are a few Python3-specific files in the Python 2.7 library
		"$pythonBin" -m compileall -q "$installDir/$pkgDir" >/dev/null || true
	fi
else
	echo >&2 "[-] $pythonBin not found, skipping Python compilation"
fi
