#!/bin/bash -e
# Configures or reconfigures DSS Spark integration

# Don't call this directly. Use ./bin/dssadmin install-spark-integration

Usage() {
	echo >&2 "Usage: $0 [-sparkHome SPARK_HOME] [-pysparkPython PYSPARK_PYTHON] [-standaloneArchive ARCHIVE] [-forK8S]"
	exit 1
}

if [ -z "$DIP_HOME" -o ! -d "$DIP_HOME" ]; then
	echo >&2 "*** Error: DIP_HOME not found"
	exit 1
fi

sparkHome=
pysparkPython=
standaloneArchive=
forK8S="0"
yes=
force="0"
while [ $# -gt 0 ]; do
	if [ "$1" = "-sparkHome" -a $# -gt 1 ]; then
		sparkHome="$2"
		shift 2
	elif [ "$1" = "-pysparkPython" -a $# -gt 1 ]; then
		pysparkPython="$2"
		shift 2
    elif [ "$1" = "-standaloneArchive" -a $# -gt 1 ]; then
        standaloneArchive="$2"
        shift 2
    elif [ "$1" = "-forK8S" ]; then 
        forK8S="1"
        shift 1
    elif [ "$1" = "-f" ]; then
        force="1"
        shift 1
    elif [ "$1" = "-y" ]; then
        yes="1"
        shift 1
	else
		Usage
	fi
done

if [[ -n "$standaloneArchive" ]]; then
    echo "[+] Standalone mode selected"
    if [ -d "$DKUINSTALLDIR/spark-standalone-home" ]
    then
        rm -rf "$DKUINSTALLDIR/spark-standalone-home"
    fi
    mkdir "$DKUINSTALLDIR/spark-standalone-home"
    tar --strip-components=1 -C "$DKUINSTALLDIR/spark-standalone-home" -xzf "$standaloneArchive"
    sparkHome="$DKUINSTALLDIR/spark-standalone-home"
fi


# If SPARK_HOME has not been specified, attempt to find it using spark-submit in PATH
if [ -z "$sparkHome" ]; then
	if sparkSubmit=$(command -v "spark-submit"); then
		script=/tmp/dku-install-spark-$$.py
		cat <<EOF >"$script"
import os, sys, time
print ("DKU_DETECTED_SPARK_HOME=%s" % os.environ['SPARK_HOME'])
# Work around a race condition in Spark 1.5 spark-submit for Python output forwarding
sys.stdout.flush()
time.sleep(0.5)
EOF
		if ! "$sparkSubmit" "$script" >"$script.out" 2>"$script.err"; then
			echo >&2 "*** Error detecting SPARK_HOME using spark-submit"
			# spark-submit tends to send python errors to stdout
			cat >&2 "$script.out"
			echo >&2 "---"
			cat >&2 "$script.err"
			exit 1
		fi
		sparkHome=$(sed -n 's/^DKU_DETECTED_SPARK_HOME=//p' "$script.out")
		if [ -z "$sparkHome" ]; then
			echo >&2 "*** Error: could not detect SPARK_HOME using 'spark-submit $script'"
			exit 1
		fi
		rm -f "$script" "$script.out" "$script.err"
	else
		echo >&2 "*** Error: SPARK_HOME not specified and spark-submit not found in PATH"
		exit 1
	fi
fi

# Minimal sanity check
case "$sparkHome" in
	/* )
		;;
	* )
		echo >&2 "*** Error: SPARK_HOME should be absolute: $sparkHome"
		exit 1
		;;
esac
if [ ! -x "$sparkHome/bin/spark-submit" ]; then
	echo >&2 "*** Error: $sparkHome/bin/spark-submit not found"
	exit 1
fi
echo "+ Using SPARK_HOME=$sparkHome"

# Grab Spark version from banner ascii art (!)
# Could also get it from a spark-submit'ed Python script, but this needs to open a context,
# which is expensive and chatty
sparkVersion=$("$sparkHome"/bin/spark-submit --version 2>&1 | sed -n 's_.* version \([^ ]*\)$_\1_p')
case "$sparkVersion" in
	3.0.* | 2.[0-4].* | 1.[5-6].* )
		echo "+ Found Spark version $sparkVersion"
		;;
	"" )
		echo >&2 "*** Error: could not find Spark version"
		exit 1
		;;
	*)
		echo >&2 "*** Error: Spark version not supported: $sparkVersion"
		exit 1
		;;
esac

javaVersion=$("$DKUJAVABIN" -version 2>&1 >/dev/null | grep -E '^(java|openjdk) version "[1-9]' | cut -d '"' -f 2)

if [[ $sparkVersion == 1.* ]]; then
	if [[ "$javaVersion" != 1.[78].* ]]; then
		echo >&2 "*** Error: Spark 1 support requires Java 7 or 8, $DKUJAVABIN is $javaVersion"
		exit 1
	fi
    # deprecated spark version
    echo "[!] *********************************************************"
    echo "[!] Warning: you are integrating DSS with a Spark version whose support in DSS is deprecated"
    if [ -z "$yes" ]; then
        echo "[!] Press Enter to continue, Ctrl+C to abort"
        read
    else
        echo "[!] Non-interactive mode, continuing anyway"
    fi
fi

if [[ $sparkVersion == 2.* ]]; then
	if [[ "$javaVersion" == 1.7.* ]]; then
		# Toree for Spark2 requires Java 8
		java7spark2=1
		if [[ $sparkVersion =~ 2\.[2-9]\..+ ]]; then
			echo >&2 "*** Error: Java 8 is required for Spark 2.2 or newer, $DKUJAVABIN is $javaVersion"
			exit 1
		fi
	elif [[ "$javaVersion" != 1.8.* ]]; then
		echo >&2 "*** Error: Spark 2 support requires Java 8, $DKUJAVABIN is $javaVersion"
		exit 1
	fi
fi

# TODO - autodetect additional Python path using a pyspark script?
if ! py4j=$(ls "$sparkHome"/python/lib/py4j-*-src.zip); then
	echo >&2 "*** Warning: py4j package not found in $sparkHome/python/lib"
elif [ "$(echo "$py4j" | wc -l)" -ne 1 ]; then
	# MapR 5.2 packages two versions of py4j - keep only the latest, with a warning
	# We could probably also hardcode a table spark_version => py4j_version
	echo >&2 "*** Warning: multiple py4j packages found in $sparkHome/python/lib"
	py4j="$(echo "$py4j" | sort -V | tail -n 1)"
	echo >&2 "*** Using version $py4j"
fi

echo "+ Creating configuration file: $DIP_HOME/bin/env-spark.sh"
(
	echo "export DKU_SPARK_ENABLED=true"
	echo "export DKU_SPARK_HOME='$sparkHome'"
	echo "export DKU_SPARK_VERSION='$sparkVersion'"
	echo "export PYSPARK_DRIVER_PYTHON=\"\$DKUPYTHONBIN\""
	if [ -n "$pysparkPython" ]; then
		echo "export PYSPARK_PYTHON='$pysparkPython'"
	fi
	if [ -n "$py4j" ]; then
		echo "export DKU_PYSPARK_PYTHONPATH='$sparkHome/python:$py4j'"
	else
		echo "export DKU_PYSPARK_PYTHONPATH='$sparkHome/python'"
	fi
	echo "if [ -n \"\$DKURBIN\" ]; then"
	echo "  export SPARKR_DRIVER_R=\"\$DKURBIN\""
	echo "fi"

	# MapR 5.1 adds spring-context 3.0.3 to the classpath, without the companion cglib/asm libraries
	# which are needed to support Configuration annotations. Add them if present.
	MAPR_HOME="${MAPR_HOME:-/opt/mapr}"
	if grep -qs "^5\.[1-9]\." "$MAPR_HOME/MapRBuildVersion"; then
		if cglib=$(ls "$MAPR_HOME"/lib/cglib-2.*.jar 2>/dev/null) &&
		   [ $(echo "$cglib" | wc -l) -eq 1 ]; then
			echo "# Add cglib/asm to MapR classpath for Spring annotations to work under Spark"
			echo "if [ -z \"\$DKU_MAPR_CLASSPATH_SET\" ]; then"
			echo "  if [ -z \"\$MAPR_CLASSPATH\" ]; then"
			echo "    export MAPR_CLASSPATH=\"$cglib\""
			echo "  else"
			echo "    MAPR_CLASSPATH+=\":$cglib\""
			echo "  fi"
			if asm=$(ls "$MAPR_HOME"/lib/asm-3.*.jar 2>/dev/null) &&
			   [ $(echo "$asm" | wc -l) -eq 1 ]; then
				echo "  MAPR_CLASSPATH+=\":$asm\""
			fi
			echo "  export DKU_MAPR_CLASSPATH_SET=1"
			echo "fi"
		else
			# cglib not installed in /opt/mapr/lib (mapr-client package) - use DSS-provided version
			echo "# Add cglib to MapR classpath for Spring annotations to work under Spark"
			echo "if [ -z \"\$DKU_MAPR_CLASSPATH_SET\" ]; then"
			echo "  cglib=\"\$(ls \"\$DKUINSTALLDIR\"/lib/ivy/backend-run/cglib*.jar)\""
			echo "  if [ -z \"\$MAPR_CLASSPATH\" ]; then"
			echo "    export MAPR_CLASSPATH=\"\$cglib\""
			echo "  else"
			echo "    MAPR_CLASSPATH+=\":\$cglib\""
			echo "  fi"
			echo "  export DKU_MAPR_CLASSPATH_SET=1"
			echo "fi"
		fi
	fi
) >"$DIP_HOME"/bin/env-spark.sh

#
# DSS Spark setup
#
echo >&2 "+ Enabling DSS Spark support"
source "$DIP_HOME"/bin/env-spark.sh
DKU_NOTDEBUG=1 "$DIP_HOME"/bin/dku __enable-spark $force $forK8S

#
# Setup toree jupyter kernel for Spark-Scala notebooks
#
if [[ $java7spark2 == 1 ]]; then
	echo >&2 "*** Warning: Java 8 is required for Scala notebooks on Spark 2, $DKUJAVABIN is $javaVersion"
	echo >&2 "*** NOT installing toree/jupyter integration"
	exit
fi

echo >&2 "+ Installing toree/jupyter integration"

toreeHome="$DIP_HOME"/jupyter-run/jupyter/kernels/toree
mkdir -p "$toreeHome"

cat <<"EOF" >"$toreeHome/kernel.json"
{
  "language": "scala",
  "display_name": "Spark-Scala",
  "env": { "DEFAULT_INTERPRETER": "Scala" },
  "argv": [
    "/bin/bash",
    "-ec",
    "exec \"$DIP_HOME\"/jupyter-run/jupyter/kernels/toree/toree.sh --profile \"$0\"",
    "{connection_file}"
  ]
}
EOF
chmod a+r "$toreeHome/kernel.json"

cat <<"EOF" >"$toreeHome/toree.sh"
#!/bin/bash -e
export SPARK_HOME="$DKU_SPARK_HOME"
if [[ "$DKU_SPARK_VERSION" == 3.* ]]; then
  SCALA_VERSION="2.12"
elif [[ "$DKU_SPARK_VERSION" == 2.* ]]; then
  SCALA_VERSION="2.11"
else
  SCALA_VERSION="2.10"
fi
exec "$SPARK_HOME"/bin/spark-submit $TOREE_SUBMIT_ARGS \
  --class com.dataiku.dip.spark.notebook.SparkScalaNotebookEntryPoint \
  "$DKUINSTALLDIR/dku-jupyter/toree_${SCALA_VERSION}.jar" --nosparkcontext "$@"
EOF
chmod a+rx "$toreeHome/toree.sh"

echo >&2 "+ Done"
