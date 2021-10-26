#!/bin/bash -e

BINDIR=$(cd "$(dirname "$0")" && pwd -P)
ENVDIR=`cd "$BINDIR/.." && pwd -P`

export R_LIBS="$ENVDIR/R.lib:/opt/dataiku/R/R.lib"
export R_LIBS_USER="$ENVDIR/R.lib"

exec "/usr/bin/R" "$@"
