FROM __DKU_BASE_IMAGE_ID__

USER root

WORKDIR /opt/dataiku

ENV PYTHONPATH=
ENV R_LIBS_USER=

# __DKU_CODE_ENV_BUILD__

ENV PYTHONPATH=/opt/dataiku/python
ENV CODE_ENV_PYTHONPATH=/opt/dataiku/code-env
ENV R_LIBS_USER=/opt/dataiku/R/R.lib

USER dataiku

WORKDIR /home/dataiku
