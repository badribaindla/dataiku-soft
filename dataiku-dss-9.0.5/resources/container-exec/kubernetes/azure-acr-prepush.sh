#! /bin/bash

# make commands non-fatal, it's ok if they fail as long as we log on stdout what failed.
# basically the script attempts to log docker into acr, but it may still fail to do so
# and you get a docker push error afterwards
set +e

# Azure ACR requires a call to `az acr login ...` before docker can 
# push to the repo, but that az-cli command sets up a fast-expiring
# authentication, so one has to re-run the command often

REPOSITORY=$1
IMAGE=$2

# if repository is like foobarregistry.azurecr.io/stuff/here/
# then repository name for the az acr command is just the foobarregistry.azurecr.io
# part (azure will gracefully strip the azurecr.io)
REPOSITORY_ROOT=$(echo "$REPOSITORY"/"$IMAGE" | sed 's_^\([^/]*\)/.*$_\1_')
echo "INFO: making sure repository '$REPOSITORY_ROOT' exists on ACR" >&2

if [ -z `command -v az` ]; then
    echo 'ERROR: required `az` binary is not in PATH' >&2
    exit 1
fi

AZ_VERSION=$(az version --query '"azure-cli"' 2>&1 | tr -d '"')
echo "az cli version = $AZ_VERSION"

# login the az cli, in case the creds have expired
if [ -n "$AZURE_CLIENT_ID" ]; then 
    # we have a managed identity client id, use it
    az login --identity -u "$AZURE_CLIENT_ID"
    if [ $? -ne 0 ]; then
        echo 'WARNING: could not login UAMI' >&2
    fi
else
    # pray that there is only one identity assigned to the VM, or this
    # login will fail
    az login --identity
    if [ $? -ne 0 ]; then
        echo 'WARNING: could not login default UAMI' >&2
    fi
fi

az acr login -n $REPOSITORY_ROOT
if [ $? -ne 0 ]; then
    echo 'WARNING: could not login into acr' >&2
fi
