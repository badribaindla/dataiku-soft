#!/bin/bash -e
# Looks up for a suitable Java binary

Usage() {
	echo "Usage: $0 [-osxInstallTest]" >&2
	exit 1
}

# CheckVersion JAVA_BIN
CheckVersion() {
	"$1" -version 2>&1 >/dev/null | grep -E '^(java|openjdk) version "(1[01][\."]|1\.8\.)' && test "$PIPESTATUS" -eq 0
}

# AbsolutePath FILE
AbsolutePath() {
	case "$1" in
		/* )
			echo "$1"
			;;
		* )
			local dir=$(cd "$(dirname "$1")" && pwd -P)
			echo "$dir/$(basename "$1")"
			;;
	esac
}

osxInstallTest=
if [ $# -eq 1 -a "$1" = "-osxInstallTest" ]; then
    # Only check whether a suitable Java will be later found by the installer
    osxInstallTest=1
elif [ $# -ne 0 ]; then
	Usage
fi

javaBin=
javaVersion=

# Use JAVA_HOME if externally defined
if [ -n "$JAVA_HOME" ]; then
	if javaVersion=$(CheckVersion "$JAVA_HOME"/bin/java); then
		javaBin="$JAVA_HOME"/bin/java
	else
		echo "[*] WARNING: JAVA_HOME is defined but does not point to a suitable version of Java" >&2
		echo "[*] WARNING: DSS requires Java 8 or Java 11, 64-bit version" >&2
	fi
fi

if [ -z "$javaBin" ]; then
	if [ "$(uname)" = "Darwin" ]; then
		jre="/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home"
		# Look for a suitable installed JDK
		if javaHome=$(/usr/libexec/java_home -d64 -v1.8+ 2>/dev/null) && javaVersion=$(CheckVersion "$javaHome"/bin/java); then
			javaBin="$javaHome"/bin/java
		# Check JRE if any
		elif [ -e "$jre"/bin/java ] && javaVersion=$(CheckVersion "$jre"/bin/java); then
			javaBin="$jre"/bin/java
		# Check java in PATH
		# This will show the "you need to install Java" popup if needed
		# so we skip this test if called by the dmg installer, which handles this case by itself
		elif [ -z "$osxInstallTest" ] && java=$(command -v java) && javaVersion=$(CheckVersion "$java"); then
			javaBin=$(AbsolutePath "$java")
		fi

	else
		# Check java in PATH if any
		if java=$(command -v java) && javaVersion=$(CheckVersion "$java"); then
			javaBin=$(AbsolutePath "$java")
		else
			# Search well-known installation directories
			for dir in /usr/lib/jvm/* /usr/java/*; do
				if [ -e "$dir"/bin/java ] && javaVersion=$(CheckVersion "$dir"/bin/java); then
					javaBin="$dir"/bin/java
					break
				fi
			done
		fi
	fi
fi

if [ -z "$javaBin" ]; then
	echo "[*] Could not find suitable version of Java" >&2
	exit 1
fi

echo "[+] Using Java at $javaBin : $javaVersion" >&2
echo "$javaBin"
