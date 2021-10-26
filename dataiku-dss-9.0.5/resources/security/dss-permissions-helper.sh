#! /bin/bash -e

# Usage:
# $0 DSS_HOME chown TARGET_PATH TARGET_USER
# $0 DSS_HOME setfacl TARGET_PATH PERMS
#
# DSS_HOME must be an absolute physical path, without terminal /
# TARGET_PATH must be within DSS_HOME

# The first argument (DSS_HOME) must be restricted by the sudo rule, as in:
#   Defaults! /PATH/TO/dss-permissions-helper.sh !requiretty
#   DSS_USER ALL = (root) NOPASSWD: /PATH/TO/dss-permissions-helper.sh /PATH/TO/DSS_HOME *

if  [ $# -ne 4 ]; then
    echo >&2 "[-] Illegal number of arguments $#"
    exit 1
fi

DSS_HOME="$1/"   # Add terminal /
ACTION="$2"
TARGET_PATH="$3"
shift 3

if [ $EUID -ne 0 ]; then
    echo >&2 "[-] FATAL: Must run as root"
    exit 1
fi

# Check that the target path is within the allowed DSS_HOME
DIRNAME=$(cd "$(dirname "$TARGET_PATH")" && pwd -P)
DIRNAME+="/"   # Add terminal /

if [ "${DIRNAME:0:${#DSS_HOME}}" != "$DSS_HOME" ]; then
    echo >&2 "[-] Illegal path: $TARGET_PATH"
    exit 1
fi

case "$ACTION" in
    chown)
        TARGET_USER="$1"
        echo "[+] Executing chown action to $TARGET_USER on $TARGET_PATH"
        chown -Rh "$TARGET_USER" "$TARGET_PATH"
        ;;

    setfacl)
        PERMS="$1"
        echo "[+] Executing setfacl on $TARGET_PATH perms=$PERMS"
        setfacl -RP -m "$PERMS" "$TARGET_PATH"
        ;;

    *)
        echo >&2 "[-] Illegal action $ACTION"
        exit 1
        ;;
esac
