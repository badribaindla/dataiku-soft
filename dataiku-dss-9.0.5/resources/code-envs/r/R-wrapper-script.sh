#!/bin/bash -e

BINDIR=$(cd "$(dirname "$0")" && pwd -P)
ENVDIR=`cd "$BINDIR/.." && pwd -P`

DKUINSTALLDIR_R="$DKUINSTALLDIR/R"
if [ "$DSS_DEV" = "1" ]; then
    >&2 echo 'Running in dev' 
    DKUINSTALLDIR_R="$DKUINSTALLDIR/dist/R"
else
    source "$DIP_HOME"/bin/env-default.sh
    if [ -z "$DKUINSTALLDIR" ]; then
      echo >&2 "FATAL: DKUINSTALLDIR is not defined. Please check $DIP_HOME/bin/env-default.sh"
      exit 1
    fi
    source "$DKUINSTALLDIR/scripts/_startup.inc.sh"

    bkdl_load_env_files
fi

if [ -z "$DKU_CODEENV_R_LIBS" ]; then
	export R_LIBS="$ENVDIR/R.lib:$DKUINSTALLDIR_R"
else
	export R_LIBS="$ENVDIR/R.lib:$DKUINSTALLDIR_R:$DKU_CODEENV_R_LIBS"
fi
export R_LIBS_USER="$ENVDIR/R.lib"

exec "$DKURBIN" "$@"
