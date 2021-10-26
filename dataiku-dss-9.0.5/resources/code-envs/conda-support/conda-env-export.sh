#! /bin/sh

#
# Runs "conda env export" in a specified env path
#

DKU_CONDA_ENV_PATH="$1"

source "$DKU_CONDA_ACTIVATE_PATH"activate $1

conda env export