#!/bin/bash -e
# Install a locally-compiled version of Python 3.7 in a CentOS 7 container image

PYTHON_VERSION="3.7.10"
PYTHON_MD5="0b19e34a6dabc4bf15fdcdf9e77e9856"

TMPDIR="/tmp.build-python37"

yum -y install \
  @development \
  bzip2-devel \
  gdbm-devel \
  libffi-devel \
  libuuid-devel \
  ncurses-devel \
  openssl-devel \
  readline-devel \
  sqlite-devel \
  xz-devel \
  zlib-devel \

mkdir -p "$TMPDIR"
cd "$TMPDIR"

curl -OsS "https://www.python.org/ftp/python/$PYTHON_VERSION/Python-$PYTHON_VERSION.tgz"
echo "$PYTHON_MD5 Python-$PYTHON_VERSION.tgz" | md5sum -c

tar xf Python-"$PYTHON_VERSION".tgz
cd Python-"$PYTHON_VERSION"

./configure --enable-ipv6
make -j 2
make altinstall

cd /
rm -rf "$TMPDIR"
yum clean all
