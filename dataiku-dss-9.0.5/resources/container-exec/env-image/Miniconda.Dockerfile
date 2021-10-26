# Injected into Dockerfile for conda code environments
# See also https://hub.docker.com/r/conda/miniconda2-centos7/~/dockerfile/

WORKDIR /opt/conda

RUN curl -sSL https://repo.continuum.io/miniconda/Miniconda2-4.6.14-Linux-x86_64.sh -o /tmp/miniconda.sh \
    && bash /tmp/miniconda.sh -bfp /opt/conda/ \
    && rm -rf /tmp/miniconda.sh

WORKDIR /opt/dataiku
