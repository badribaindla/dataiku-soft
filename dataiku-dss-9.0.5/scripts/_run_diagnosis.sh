#!/bin/bash

MYDIR=`dirname $0`
MYDIR=`cd $MYDIR && pwd -P`

source $MYDIR/_startup.inc.sh

bkdl_set_py_env
bkdl_set_R_env
bkdl_set_julia_env
bkdl_set_R_libs


function dku_exec {
    # prints the command given in 1st arg in stdout and in the default diagnosis file
    # then executes the commands and prints the output in stdout and in the default diagnosis file
    printf "\n\n----------------------------------------------------------\n\n\n" | tee -a $MAIN_DIAGNOSIS_FILE
    D1=`date`
    echo $D1 | tee -a $MAIN_DIAGNOSIS_FILE
    echo ">" $1 | tee -a $MAIN_DIAGNOSIS_FILE
    $1 2>&1 | tee -a $MAIN_DIAGNOSIS_FILE
    D2=`date`
    echo "$D1   $D2   $1" >> $TIMINGS_FILE
}

function dku_exec_to_file {
    # executes the command given in 1st arg and prints its output in the file given as 2nd arg
    if [ -s $2 ]; then
        printf "\n\n----------------------------------------------------------\n\n\n" | tee -a $2
    else
        printf "\n\n----------------------------------------------------------\n\n\n"
        TEMP_FILES+=" "$2
    fi
    D1=`date`
    echo $D1 | tee -a $MAIN_DIAGNOSIS_FILE
    echo "> " $1 | tee -a $2
    $1 >> $2 2>&1
    D2=`date`
    echo "output written to "$2
    echo "$D1   $D2   $1" >> $TIMINGS_FILE
}

#############################################
# Main
#############################################

function Usage() {
    echo >&2 "Usage : dssadmin run-diagnosis [OPTIONS] OUTPUT_FILE"
    echo >&2 "Options:"
    echo >&2 "  -c : include config dir"
    echo >&2 "  -i : include iostat output"
    echo >&2 "  -v : include vmstat output"
    echo >&2 "  -s : include backend stacks"
    echo >&2 "  -d : include list of Docker images"
    echo >&2 "  -f : include full logs"
    echo >&2 "  -l : include full listing of data dir"
    exit 1
}

echo "[+] DSS diagnosis starting"

# Parse options

OPT_CONFIG=0
OPT_IOSTAT=0
OPT_VMSTAT=0
OPT_STACKS=0
OPT_DOCKER_IMAGES=0
OPT_FULL_RUNDIR=0
OPT_FULL_LISTING=0
while getopts "civdsfl" opt; do
    case $opt in
        c) OPT_CONFIG=1 ;;
        i) OPT_IOSTAT=1 ;;
        v) OPT_VMSTAT=1 ;;
        s) OPT_STACKS=1 ;;
        d) OPT_DOCKER_IMAGES=1 ;;
        f) OPT_FULL_RUNDIR=1 ;;
        l) OPT_FULL_LISTING=1 ;;
        \?)
            Usage
            ;;
    esac
done

shift $((OPTIND-1))

DIAG_OUTPUT_FILE="$1"

if [ -z "$DIP_HOME" ]; then
  echo "Expected DIP_HOME" >&2
  exit 1
fi

if [ -z "$DIAG_OUTPUT_FILE" ]; then
    echo "Missing 'Diagnostic output file' argument" >&2
    Usage
fi

echo "[+] Running with options: $OPT_CONFIG $OPT_IOSTAT $OPT_VMSTAT $OPT_STACKS $OPT_DOCKER_IMAGES $OPT_FULL_RUNDIR"


DIAG_TMP_DIR="$DIP_HOME/tmp/diag.$$"
MAIN_DIAGNOSIS_FILE="$DIAG_TMP_DIR/diag.txt"
TIMINGS_FILE="$DIAG_TMP_DIR/timings.txt"

mkdir -p $DIAG_TMP_DIR
touch "$MAIN_DIAGNOSIS_FILE"

echo "DSS Diagnosis" >> $MAIN_DIAGNOSIS_FILE
echo "Diagnosis started at `date`" >> $MAIN_DIAGNOSIS_FILE

echo "Diagnosis started at `date`" > $TIMINGS_FILE

if [ "$(uname)" == "Darwin" ]; then
    OS="OSX"
else
    OS="Linux"
fi

# list of existing files that will be saved
SAVED_FILES=""


# Locate binaries
NGINX_BINARY=$("$DKUPYTHONBIN" "$DKUINSTALLDIR"/scripts/dkuinstall/install_config.py -get server nginx_binary)
if [ -z "$NGINX_BINARY" -o "$NGINX_BINARY" = "None" ]; then
  NGINX_BINARY="nginx"
  for d in "$DKUINSTALLDIR"/tools/sbin /usr/sbin /opt/local/sbin /usr/local/sbin /usr/local/bin; do
    if [ -x "$d/nginx" ]; then
      NGINX_BINARY="$d/nginx"
      break
    fi
  done
  if ! command -v "$NGINX_BINARY" >/dev/null; then
    echo >&2 "nginx binary \"$NGINX_BINARY\" not found" | tee -a $MAIN_DIAGNOSIS_FILE
  fi
fi

if [ -z "$DKUJAVABIN" ]; then
  echo >&2 "DKUJAVABIN is not defined." | tee -a $MAIN_DIAGNOSIS_FILE
  DKUJAVABIN="java"
fi

PIP_BINARY="pip"
if [ -z "$DKUPYTHONBIN" ]; then
  echo >&2 "DKUPYTHONBIN is not defined." | tee -a $MAIN_DIAGNOSIS_FILE
  DKUPYTHONBIN="python"
else
  PIP_BINARY="$(dirname $DKUPYTHONBIN)/pip"
fi

if [ -z "$DKURBIN" ]; then
  echo >&2 "DKURBIN is not defined." | tee -a $MAIN_DIAGNOSIS_FILE
  DKURBIN="R"
fi

if [ -z "$DKUJULIABIN" ]; then
  echo >&2 "DKUJULIABIN is not defined." | tee -a $MAIN_DIAGNOSIS_FILE
  DKUJULIABIN="julia"
fi



#
# Dump everything we can in terms of short commands
#
dku_exec "uname -a"
dku_exec "id"
dku_exec "uptime"
dku_exec "cat /etc/hosts"
dku_exec "printenv"
dku_exec "date"
dku_exec "date -u"
dku_exec "$DKUJAVABIN -version"
dku_exec "java -version"
dku_exec "javac -version"
dku_exec "$NGINX_BINARY -V"
dku_exec "$DKUPYTHONBIN -V"
dku_exec "$PIP_BINARY -V"
dku_exec "which python2.7"
dku_exec "python2.7 -V"
dku_exec "which python3.6"
dku_exec "python3.6 -V"
dku_exec "which python3.7"
dku_exec "python3.7 -V"
dku_exec "which conda"
dku_exec "conda --version"

if [ $OS == "OSX" ]; then
    dku_exec "sw_vers"
    dku_exec "hostname"
    dku_exec_to_file "sysctl -a" $DIAG_TMP_DIR/sysctl.txt
else
    dku_exec "cat /etc/debian_version"
    dku_exec "cat /etc/redhat-release"
    dku_exec "lsb_release -a"
    dku_exec "hostname --fqdn"
fi

#
# installed programs/packages
#

if [ $OS == "OSX" ]; then
    dku_exec_to_file "brew list --versions" $DIAG_TMP_DIR/syspackages.txt
    dku_exec_to_file "port installed" $DIAG_TMP_DIR/syspackages.txt
else
    dku_exec "getenforce"
    dku_exec_to_file "dpkg --list" $DIAG_TMP_DIR/syspackages.txt
    dku_exec_to_file "rpm -qa" $DIAG_TMP_DIR/syspackages.txt
fi
dku_exec_to_file "$PIP_BINARY list" $DIAG_TMP_DIR/pip.txt

echo "installed.packages()" > installed_packages.r
dku_exec "$DKURBIN CMD BATCH installed_packages.r $DIAG_TMP_DIR/r.txt"
TEMP_FILES+=" $DIAG_TMP_DIR/r.txt"
rm installed_packages.r

#
# Ressources status
#
dku_exec "ulimit -a"
dku_exec "ulimit -a -H"

if [ $OS = "OSX" ]; then
    dku_exec_to_file "system_profiler SPHardwareDataType SPMemoryDataType" $DIAG_TMP_DIR/system_profiler.txt
else
    dku_exec "free -m"
    dku_exec "cat /proc/cpuinfo"
    dku_exec "cat /proc/meminfo"
    dku_exec "cat /proc/sys/vm/overcommit_memory"
    dku_exec "cat /proc/sys/vm/overcommit_ratio"
    dku_exec "cat /proc/sys/vm/swappiness"
    dku_exec "cat /proc/mounts"
    dku_exec "mstat 3"
fi

dku_exec "df -h"

dku_exec "lsblk -t"

dku_exec_to_file "dmesg" $DIAG_TMP_DIR/dmesg.txt

SAVED_FILES+=" /etc/security/limits.conf"

#
# Processes
#
if [ $OS = "OSX" ]; then
    dku_exec_to_file "ps aux"  $DIAG_TMP_DIR/ps.txt
else
    dku_exec_to_file "ps auxf"  $DIAG_TMP_DIR/ps.txt
fi

#
# DSS status
#
dku_exec "$DIP_HOME/bin/dss status"

#
# DSS listings
#
dku_exec_to_file "ls -la $DIP_HOME/bin"  $DIAG_TMP_DIR/bin_listing.txt
dku_exec_to_file "find $DIP_HOME/config -ls"  $DIAG_TMP_DIR/config_listing.txt
dku_exec_to_file "find $DIP_HOME/code-envs/desc $DIP_HOME/acode-envs/desc -ls"  $DIAG_TMP_DIR/code_envs_desc_listing.txt
dku_exec_to_file "find $DIP_HOME/lib -ls"  $DIAG_TMP_DIR/lib_listing.txt


if [ $OPT_FULL_LISTING = "1" ]; then
    dku_exec_to_file "find $DIP_HOME/ -ls"  $DIAG_TMP_DIR/datadir_listing.txt
fi

if [ $OPT_CONFIG = "1" ]; then
    SAVED_FILES+=" $DIP_HOME/config/"
    SAVED_FILES+=" $DIP_HOME/code-envs/desc/"
    SAVED_FILES+=" $DIP_HOME/acode-envs/desc/"
    SAVED_FILES+=" $DIP_HOME/plugins/dev/"
    SAVED_FILES+=" $DIP_HOME/jupyter-run/jupyter/config/nbconfig/"
fi

#
# DSS files
#
SAVED_FILES+=" $DIP_HOME/install.ini"
SAVED_FILES+=" $DIP_HOME/install-support/*conf"
SAVED_FILES+=" $DIP_HOME/caches/ipython-authorization.json"
SAVED_FILES+=" $DIP_HOME/caches/reflected-events-*.json"
SAVED_FILES+=" $DIP_HOME/caches/reports.json"
SAVED_FILES+=" $DIP_HOME/config/license.json"
SAVED_FILES+=" $DIP_HOME/config/dip.properties"
SAVED_FILES+=" $DIP_HOME/dss-version.json"
SAVED_FILES+=" $DKUINSTALLDIR/dss-version.json"
SAVED_FILES+=" $DIP_HOME/bin/env-*"
SAVED_FILES+=" $DIP_HOME/run/install.log*"
SAVED_FILES+=" $DIP_HOME/run/install-impersonation.log*"
SAVED_FILES+=" $DIP_HOME/code-envs/logs/"
SAVED_FILES+=" $DIP_HOME/acode-envs/logs/"
SAVED_FILES+=" $DIP_HOME/clusters/"
SETUP_DKU_SPARK_HOME="$(source "$DIP_HOME"/bin/env-spark.sh && echo $DKU_SPARK_HOME)"
if [ -n "$SETUP_DKU_SPARK_HOME" ]; then
	SAVED_FILES+=" $SETUP_DKU_SPARK_HOME/conf/spark-defaults.conf"
	SAVED_FILES+=" $SETUP_DKU_SPARK_HOME/conf/spark-env.sh"
fi

if [ $OPT_FULL_RUNDIR = "1" ]
then
    SAVED_FILES+=" $DIP_HOME/run/*" #TODO get last logs only
else
    echo "Selecting logs" >&2
    SAVED_FILES+=" "
    SAVED_FILES+=`$DKUPYTHONBIN $MYDIR/_diag_select-logs.py "$DIP_HOME/run" 200`
fi

#
# Backend stacks
#
dku_exec_to_file "$DKUPYTHONBIN $MYDIR/_diag_get_stacks.py" $DIAG_TMP_DIR/stacks.txt


#
# Slow copmmands
#

if [ $OPT_IOSTAT = "1" ]; then
    if [ $OS == "OSX" ]; then
        dku_exec "iostat -c 3 -w 3"
    else
        dku_exec "iostat -x 3 -c 3"
    fi
fi
if [ $OPT_VMSTAT = "1" ]; then
    if [ $OS == "OSX" ]; then
        dku_exec "vm_stat -c 3 3"
    else
        dku_exec "vmstat 3 3"
        :
    fi
fi
if [ $OPT_DOCKER_IMAGES = "1" ]; then
    dku_exec_to_file "$DKUPYTHONBIN $MYDIR/_diag_list_docker_images.py" $DIAG_TMP_DIR/docker_images_listing.txt
fi

# Prepare final archive
mkdir -p `dirname $DIAG_OUTPUT_FILE`

DIAG_OUTPUT_DIR=`dirname $DIAG_OUTPUT_FILE`
echo $DIAG_OUTPUT_DIR
DIAG_OUTPUT_DIR=`cd $DIAG_OUTPUT_DIR && pwd -P`
echo $DIAG_OUTPUT_DIR
DIAG_OUTPUT_FILE=$DIAG_OUTPUT_DIR/`basename $DIAG_OUTPUT_FILE`
echo $DIAG_OUTPUT_FILE
cd $DIAG_TMP_DIR

echo "Diagnosis is ready, zipping it..."
zip -q -r $DIAG_OUTPUT_FILE * $SAVED_FILES -x "*.git*" "*configkey.json"

# cleanup
rm -rf $DIAG_TMP_DIR

echo "***************************************"
echo "DSS diagnosis complete"
echo "Output is available in : $DIAG_OUTPUT_FILE"
echo "***************************************"
