#! /bin/sh -e

DKU_R_ENV_PATH="$1"

"$1"/bin/R --slave --no-restore --file=- <<EOF
write.table(as.data.frame(installed.packages(noCache=TRUE))[c("Package","Version")], sep=",",row.names=FALSE, col.names=FALSE)
EOF
