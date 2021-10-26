#!/bin/bash -e
# Download a set of R packages and their dependencies
# and build a repository suitable for later offline installation

Usage() {
	echo >&2 "Usage: $0 -dir DIR [-repo REPO_URL] [PKG ...]"
	echo >&2 "    -dir DIR : output directory"
	echo >&2 "    -repo REPO_URL : use CRAN repository REPO_URL (default: https://cloud.r-project.org)"
	echo >&2 "    PKG ... : list of packages to download, with dependencies (default: DSS default list)"
	exit 1
}

dir=
repos="https://cloud.r-project.org"
while (($#)); do
	if [ "$1" = "-dir" -a $# -gt 1 ]; then
		dir="$2"
		shift 2
	elif [ "$1" = "-repo" -a $# -gt 1 ]; then
		repos="$2"
		shift 2
	elif [[ "$1" = -* ]]; then
		Usage
	else
		break
	fi
done

if [ -z "$dir" ]; then
	Usage
fi
mkdir -p "$dir"/src/contrib

# With no package arguments, download the default list from the default repositories
if [ $# -eq 0 ]; then
	set httr RJSONIO dplyr curl IRkernel sparklyr ggplot2 gtools tidyr rmarkdown base64enc filelock
fi

R --slave --no-restore --file=- --args "$@" <<EOF
library(tools, quietly=TRUE)
options(repos = "$repos",
	pkgType = "source",
	available_packages_filters = "duplicates")

packages <- commandArgs(TRUE)
db <- available.packages()

deps <- package_dependencies(packages, 
	db=db,
	which=c("Depends", "Imports", "LinkingTo"),
	recursive=TRUE)
deps <- unlist(deps)
deps <- intersect(deps, row.names(db))

download.packages(union(packages, deps), "$dir/src/contrib")

write_PACKAGES("$dir/src/contrib")
EOF

# If stringi is in the local repository, make sure the icu resource package is there too
# since it might need to be installed on the target machine
if ls "$dir"/src/contrib/stringi_*.tar.gz >&/dev/null; then
	test -f "$dir"/icudt61l.zip || {
		echo "Downloading icudt61 resource package"
		(cd "$dir" && curl -OLsS https://raw.githubusercontent.com/gagolews/stringi/master/src/icu61/data/icudt61l.zip)
	}
	test -f "$dir"/icu4c-69_1-data-bin-l.zip || {
		echo "Downloading icudt69 resource package"
		(cd "$dir" && curl -OLsS https://raw.githubusercontent.com/gagolews/stringi/master/src/icu69/data/icu4c-69_1-data-bin-l.zip)
	}
fi

echo "Done"
