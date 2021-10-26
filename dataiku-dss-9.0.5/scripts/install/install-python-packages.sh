#!/bin/bash -e
# Helper script to install the packages required by DSS in an externally-managed Python installation
# Requires that an up-to-date pip be available in this Python installation

Usage() {
	echo "Usage: $0 PIP_COMMAND" >&2
	exit 1
}

if [ $# -ne 1 ]; then
	Usage
fi
pip="$1"

# List of packages to install
# keep the pandas version number in sync with the check in core/dataset.py
PKGLIST="
numpy>=1.15,<1.16
scipy>=1.2,<1.3
scikit-learn>=0.20,<0.21
tornado>=5.1,<5.2
matplotlib>=2.2,<2.3
pandas>=0.23,<0.24
patsy>=0.5,<0.6
statsmodels>=0.10,<0.11
jinja2>=2.10,<2.11
flask>=1.0,<1.1
brewer2mpl>=1.4,<1.5
pyzmq>=18.0,<18.1
supervisor>=4.1,<4.2
requests>=2.22,<2.23
bottleneck>=1.3,<1.4
numexpr>=2.6,<2.7
seaborn>=0.9,<0.10
tabulate>=0.8,<0.9
xgboost>=0.82,<0.83
bokeh>=0.12.10,<0.13
bkcharts>=0.2,<0.3
sortedcontainers>=2.1,<2.2
python-docx>=0.8,<0.9
cloudpickle>=1.3,<1.6
terminado>=0.8.1,<0.9
ipython_genutils>=0.2
traitlets>=4.3,<4.4
jupyter-core>=4.4,<4.5
jupyter-client>=5.2.2,<5.3
nbformat>=4.4,<4.5
nbconvert>=5.3,<5.4
ipython>=5.5,<5.6
ipykernel>=4.8,<4.9
Send2Trash>=1.5,<1.6
notebook==5.4.0
ipywidgets>=7.1,<7.2
"

echo "+ Installing required Python packages ..."
for p in $PKGLIST; do
	$pip install "$p"
done
echo "+ Done."
