#!/bin/bash -e
# Boostraps or upgrades a Conda environment for Dataiku Science Studio
# conda binaries must be in PATH

upgrade=
if [ "$1" = "-u" ]; then
    upgrade=1
    shift
fi

if [ $# -lt 1 -o $# -gt 3 -o ! -d "$1" ]
then
    echo "Usage: $0 [-u] DIP_HOME [-pkgDir PKG_DIR]" >&2
    exit 1
fi
DIP_HOME="$1"
shift

local_install=
local_channel=
if [ "$1" = "-pkgDir" ]
then
  local_install=1
  local_channel=$2
  shift 2
fi

MYDIR=$(cd "$(dirname "$0")" && pwd -P)
INSTALLDIR=$(cd "$MYDIR"/.. && pwd -P)
CONDACOMMAND=install

if [ -z "$upgrade" ]; then
  # Create new environment
  CONDACOMMAND=create
else
  # Migration: remove any "py-xgboost" package as we now use "xgboost"
  if conda list --prefix "$DIP_HOME"/condaenv --full-name 'py-xgboost' --no-pip | grep -q '^py-xgboost[[:space:]]'; then
    echo "[+] Removing outdated conda package 'py-xgboost'"
    conda remove --prefix "$DIP_HOME"/condaenv --yes py-xgboost
  fi
fi

if [ -z "$local_install" ]; then
  conda "$CONDACOMMAND" --prefix "$DIP_HOME"/condaenv \
      --channel file://"$INSTALLDIR"/conda.packages \
      --yes \
      --file "$INSTALLDIR"/conda.packages/dss.spec
else
  conda "$CONDACOMMAND" --prefix "$DIP_HOME"/condaenv \
      --channel file://"$local_channel" \
      --channel file://"$INSTALLDIR"/conda.packages \
      --yes \
      --offline \
      --file "$INSTALLDIR"/conda.packages/dss.spec
fi

# Symlink entry points
mkdir -p "$DIP_HOME"/bin
ln -sf ../condaenv/bin/{python,pip} "$DIP_HOME"/bin/
