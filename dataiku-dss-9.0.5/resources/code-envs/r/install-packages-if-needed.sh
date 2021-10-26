#! /bin/sh -e

DKU_R_ENV_PATH="$1"
CONDA_MODE="$2"
SPEC_FILE="$3"
MAIN_REPOS="$4"

if [ "$CONDA_MODE" = "true" ]; then
    TARGET_LIB="$DKU_R_ENV_PATH/lib/R/library"
else
    TARGET_LIB="$DKU_R_ENV_PATH/R.lib"
fi

if [ -z "$MAIN_REPOS" ]; then
    REPOS="NULL"
else
    REPOS="\"$MAIN_REPOS\""
fi

echo "Installing from $REPOS"
echo "Installing into $TARGET_LIB"

"$1"/bin/R --slave --no-restore --file=- <<EOF

print("known library paths:")
print(.libPaths())

dependencies <- read.table("$SPEC_FILE", col.names=c("pkg", "ver"), sep=",",stringsAsFactors=FALSE, fill=TRUE)

checkPackages <- function() {
    message("Checking installed packages ...")
    installedVersions <- installed.packages(noCache=TRUE)[,'Version']
    print("already has : ")
    print(installedVersions)
    l <- apply(dependencies, 1, function(x) {
        p <- x['pkg']
        v <- x['ver']
        if (is.na(installedVersions[p])) {
            message("Package not installed: ", p)
            p
        } else if (is.na(v) || v == "") {
            message("No version requested for ", p, " considering installed version OK:", installedVersions[p])
            NA
        } else if (package_version(installedVersions[p]) < package_version(v)) {
            message("Package too old: ", p, " installed=", installedVersions[p] , " required=", v)
            p
        } else {
            NA
        }
    })
    na.omit(l)
}

toInstall <- checkPackages()
if (length(toInstall) > 0) {
    message("Installing packages: ", paste(toInstall, collapse=" "))
    install.packages(toInstall, "$TARGET_LIB",
        repos=c($REPOS))
    if (length(checkPackages()) > 0) {
        stop("at least one package failed to install required version")
    }
}
EOF
