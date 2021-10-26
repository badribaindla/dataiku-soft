#!/bin/bash -e
# Runs a command in a given conda environment (given by absolute path)
# Usage: $0 CONDA_ENV_PATH COMMAND [ARGS...]

DKU_CONDA_ENV_PATH="$1"
shift

# Figure out how to activate the conda environment, depending on the various conda deployment variants
if [ -n "$DKU_CONDA_ACTIVATE_PATH" ]; then
	# Path to "activate" explicitely forced by admin
	source "$DKU_CONDA_ACTIVATE_PATH"/activate "$DKU_CONDA_ENV_PATH"

elif [ -s "$DKU_CONDA_ENV_PATH"/bin/activate ]; then
	# Conda < 4.4 : "activate" is in the conda environment itself
	source "$DKU_CONDA_ENV_PATH"/bin/activate "$DKU_CONDA_ENV_PATH"

else
	if ! condabin=$(command -v conda); then
		echo >&2 "Error : conda command not found"
		exit 1
	fi
	condadir=$(dirname "$condabin")
	if [ -s "$condadir"/activate ]; then
		# Conda >= 4.4 : "activate" is next to "conda"
		source "$condadir"/activate "$DKU_CONDA_ENV_PATH"

	else
		# No activate found (only conda in PATH) - use internal shell initialization command
		activate_cmd=$("$condabin" shell.posix activate "$DKU_CONDA_ENV_PATH")
		eval "$activate_cmd"
	fi
fi

# Execute command in activated environment
exec "$@"
