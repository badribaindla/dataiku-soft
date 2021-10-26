#! /bin/bash

# AWS EKS/ECR requires repositories (full docker image name) to be created before pushing
# Also, docker push needs a login token that is granted for 12 hours only
# Use this script as pre-push script to automatically perform those operations before pushing to ECR

REPOSITORY=$1
REGION=$2
IMAGE=$3
TAG=$4


# if repository is like 000000000000.dkr.ecr.us-east-1.amazonaws.com/project
# then repository name for aws ecr command is project/image-name
NAME=`echo "$REPOSITORY"/"$IMAGE" | sed 's_^[^/]*/__'`
REPOSITORY_ROOT=`echo "$REPOSITORY"/"$IMAGE" | sed 's_^\([^/]*\)/.*$_\1_'`
echo "INFO: making sure repository '$NAME' exists on ECR" >&2

if [ -z `command -v aws` ]; then
    echo 'ERROR: required `aws` binary is not in PATH' >&2
    exit 1
fi

AWS_VERSION=`aws --version 2>&1 | sed 's_^[^/]*/\(.\.\)\?.*$_\1_'`
echo "aws cli version = $AWS_VERSION"

if [[ $AWS_VERSION = "1." ]]; then
    `aws ecr get-login --region $REGION --no-include-email`
    if (( $? )); then
        echo 'WARNING: could not log in' >&2
    fi
elif [[ $AWS_VERSION = "2." ]]; then
    DOCKER_PASSWORD=`aws ecr get-login-password --region $REGION`
    if (( $? )); then
        echo 'WARNING: could not get password' >&2
    fi
    docker login --username AWS --password $DOCKER_PASSWORD $REPOSITORY_ROOT
    if (( $? )); then
        echo 'WARNING: could not log in' >&2
    fi
else
    echo "ERROR: 'aws' binary version $AWS_VERSION is not in {1., 2.}" >&2
    exit 1
fi

A=`aws ecr describe-repositories --repository-name "$NAME" --region $REGION 2>&1`
if (( $? )); then
    if (( `echo $A | grep -c RepositoryNotFoundException` )); then
        echo 'INFO: repository does not exist, creating' >&2
        aws ecr create-repository --repository-name "$NAME" --region $REGION
        if (( $? )); then
            echo 'ERROR: could not create repository' >&2
            exit 2
        else
            echo 'INFO: created repository' >&2
        fi
    else
        echo 'ERROR: could not check repository:' >&2
        echo "$A" >&2
        exit 2
    fi
else
    echo 'INFO: repository already exist'
fi