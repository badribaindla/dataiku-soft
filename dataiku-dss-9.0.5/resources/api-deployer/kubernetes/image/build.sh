#! /bin/sh -e

MYDIR=`dirname $0`
MYDIR=`cd $MYDIR && pwd -P`

cd $MYDIR

CONTEXT_DIR="$1"
IMAGE_NAME="$2"
IMAGE_TAG="$3"
BASE_IMAGE_TAG="$4"

echo "Building local image ctx=$CONTEXT_DIR IMAGE_NAME=$2 IMAGE_TAG=$3 BASE_TAG=$4"

cp docker-entrypoint.sh "$CONTEXT_DIR"

echo "FROM $BASE_IMAGE_TAG" > "$CONTEXT_DIR/Dockerfile"
cat Dockerfile-fragment >> "$CONTEXT_DIR/Dockerfile"

echo "Content of context dir: $CONTEXT_DIR"
(cd $CONTEXT_DIR && find  . | grep -v ".git")

set -x
docker build -t "$IMAGE_NAME:$IMAGE_TAG" "$CONTEXT_DIR"
set +x