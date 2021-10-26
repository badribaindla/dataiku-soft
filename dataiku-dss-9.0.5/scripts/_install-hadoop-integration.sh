#!/bin/bash -e
# Configures or reconfigures DSS Hadoop integration

# Don't call this directly. Use ./bin/dssadmin install-hadoop-integration

Usage() {
    echo >&2 "Usage: $0 [-keytab KEYTAB_FILE_LOCATION -principal KERBEROS_PRINCIPAL] [-standaloneArchive ARCHIVE]"
    exit 1
}

if [ -z "$DIP_HOME" -o ! -d "$DIP_HOME" ]; then
    echo >&2 "*** Error: DIP_HOME not found"
    exit 1
fi

MYDIR=$(cd "$(dirname "$0")" && pwd -P)
DKUINSTALLDIR=$(dirname "$MYDIR")

keytabFilePath=
principal=
standaloneArchive=
while [ $# -gt 0 ]; do
    if [ "$1" = "-keytab" -a $# -gt 1 ]; then
        keytabFilePath="$2"
        shift 2
    elif [ "$1" = "-principal" -a $# -gt 1 ]; then
        principal="$2"
        shift 2
    elif [ "$1" = "-standalone" -a $# -gt 1 ]; then
        # Deprecated but keep support
        shift 2
    elif [ "$1" = "-standaloneArchive" -a $# -gt 1 ]; then
        standaloneArchive="$2"
        shift 2
    else
        Usage
    fi
done

if [[ -n "$keytabFilePath" && -z "$principal" ]]; then
    echo >&2 "*** Error: keytab provided without a principal"
    Usage
fi
if [[ -z "$keytabFilePath" && -n "$principal" ]]; then
    echo >&2 "*** Error: principal provided without a keytab"
    Usage
fi
if [[ -n "$keytabFilePath" && "$keytabFilePath" != /* ]]; then
    echo >&2 "*** Error: keytab file path should be absolute: $keytabFilePath"
    exit 1
fi

rm -f "$DIP_HOME"/bin/env-hadoop.sh

if [[ -n "$standaloneArchive" ]]; then
    echo "[+] Standalone mode selected"
    if [ -d "$DKUINSTALLDIR/hadoop-standalone-libs" ]; then
        rm -rf "$DKUINSTALLDIR/hadoop-standalone-libs"
    fi
    mkdir -p "$DKUINSTALLDIR/hadoop-standalone-libs"
    tar --strip-components=2 -C "$DKUINSTALLDIR/hadoop-standalone-libs" -xzf "$standaloneArchive"

    DKU_NOTDEBUG=1 "$DKUPYTHONBIN" "$MYDIR"/_build_standalone_hadoop_env.py "$DIP_HOME"/bin/env-hadoop.sh

    echo "[+] Enabling Hadoop in DSS"
    source "$DIP_HOME"/bin/env-hadoop.sh
    "$DIP_HOME"/bin/dku __enable-hadoop "false" "" ""
else
    echo "[+] Looking for hadoop ..."
    if HADOOP_VERSION=$(hadoop version 2>/dev/null); then
        echo "[+] Hadoop found, checking security"

        # Display warning if secured
        HADOOP_SECURITY_ENABLED=$(hadoop jar "$DKUINSTALLDIR"/dist/dataiku-dip.jar com.dataiku.dip.hadoop.HadoopIsSecurityEnabled)
        if [ "$HADOOP_SECURITY_ENABLED" = "true" ]
        then
            echo "[+] Hadoop security is enabled, checking login"

            if [ -z "$keytabFilePath" ]
            then
                echo "[!]"
                echo "[!] *************************************************"
                echo "[!] Hadoop security is enabled, and you did not pass"
                echo "[!] a keytab file location."
                echo "[!] It is highly recommend that you pass a keytab and"
                echo "[!] principal so that DSS configures automatic Kerberos"
                echo "[!] login"
                echo "[!] *************************************************"
                echo ""
                echo "Press Enter to continue, Ctrl+C to abort"
                read
            else
                export KRB5CCNAME=$(mktemp)
                echo "[+] Logging in with provided principal and keytab"
                kinit -kt "$keytabFilePath" "$principal" -l 0h10m
                echo "[+] OK, logged in"
            fi

            HADOOP_LOGGED_IN=$(hadoop jar "$DKUINSTALLDIR"/dist/dataiku-dip.jar com.dataiku.dip.hadoop.HadoopQuickCheckLoggedIn)
            if [ "$HADOOP_LOGGED_IN" = "false" ]
            then
                echo "[!]"
                echo "[!] ***********************************************"
                echo "[!] Hadoop security is enabled, and it seems"
                echo "[!] that you are not logged in (using kinit),"
                echo "[!] or DSS could not properly log in"
                echo "[!] using provided principal and keytab."
                echo "[!]"
                echo "[!] The rest of the installation will probably fail"
                echo "[!]"
                echo "[!] Please login with kinit before running "
                echo "[!]   dssadmin install-hadoop-integration "
                echo "[!] ***********************************************"
                echo ""
                echo "Press Enter to continue, Ctrl+C to abort"
                read
            fi
        else
            if [ -n "$keytabFilePath" ]
            then
                echo "[!]"
                echo "[!] *************************************************"
                echo "[!] Hadoop security is not enabled, and you did pass"
                echo "[!] a principal and keytab file location."
                echo "[!] These will be ignored, and"
                echo "[!] DSS will not configure automatic Kerberos login"
                echo "[!] ***********************************************"
                echo ""
                echo "Press Enter to continue, Ctrl+C to abort"
                read
            fi
        fi

        echo "[+] Hadoop found, configuring Pig and Hive integration"
        DKU_NOTDEBUG=1 "$DKUPYTHONBIN" "$MYDIR"/_build_hadoop_env.py "$HADOOP_VERSION" "$DIP_HOME"/bin/env-hadoop.sh

        # EMR provides a version of hadoop-aws which is binary incompatible with our version of aws-java-sdk
        # as a temporary workaround, replace our version with that of the distribution
        if grep -q -e '^export DKU_HADOOP_VERSION_STRING="Hadoop 2\.7\..-amzn-' "$DIP_HOME"/bin/env-hadoop.sh; then
            echo "[+] EMR detected, updating our version of aws-java-sdk"
            for file in $(find "$DKUINSTALLDIR"/lib/ivy/backend-run -type f -name "aws-java-sdk-*.jar"); do
                base=$(basename "$file" | sed 's/^\(aws-java-sdk-[^-]*-\).*/\1/')
                distribFile=$(ls /usr/share/aws/aws-java-sdk/"$base"*.jar)
                if [ -f "$distribFile" ]; then
                    echo "- $file => $distribFile"
                    mv "$file" "$file".ORIG
                    ln -s "$distribFile" "$DKUINSTALLDIR"/lib/ivy/backend-run/
                else
                    echo >&2 "[!] WARNING : file not found : $distribFile"
                fi
            done
        fi

        echo "[+] Enabling Hadoop in DSS"
        source "$DIP_HOME"/bin/env-hadoop.sh
        "$DIP_HOME"/bin/dku __enable-hadoop "$HADOOP_SECURITY_ENABLED" "$keytabFilePath" "$principal"

        if [ "$HADOOP_SECURITY_ENABLED" = "true" ]
        then
            if [ -n "$keytabFilePath" ]
            then
                echo "[+] Logging out from kerberos"
                kdestroy
            fi
            echo "[!]"
            echo "[!] ******************************************"
            echo "[!] Hadoop security is enabled, additional "
            echo "[!] configuration is required."
            echo "[!] Please check the documentation"
            echo "[!] ******************************************"
        fi
    else
        echo "[-] Hadoop not found in PATH"
    fi
fi
