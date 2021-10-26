#!/bin/bash -ex

#
# Check for running instance
#
if "$DIP_HOME"/bin/dss status >/dev/null 2>/dev/null; then
    echo "[!] *********************************************************"
    echo "[!] DSS seems to be running. Not continuing"
    echo "[!] *********************************************************"
    exit 1
fi

DATE=`date +%Y-%m-%d-%H-%M-%S`


for database in "jobs" "dss_usage"
do
    DUMPFILE="$DIP_HOME/databases/$database.dump.$DATE.sql"

    echo "Dumping $database database"
    java -cp $DKUINSTALLDIR/lib/ivy/common-run/h2*jar org.h2.tools.Script -url "jdbc:h2:$DIP_HOME/databases/$database" -script "$DUMPFILE"

    echo "Restoring new $database database"
    java -cp $DKUINSTALLDIR/lib/ivy/common-run/h2*jar org.h2.tools.RunScript -url "jdbc:h2:$DIP_HOME/databases/$database.new" -script "$DUMPFILE"

    echo "Replacing database"
    if [ -f "$DIP_HOME/databases/$database.h2.db" ]
    then
        mv "$DIP_HOME/databases/$database.h2.db" "$DIP_HOME/databases/$database.h2.db.$DATE.bak"
    else
        mv "$DIP_HOME/databases/$database.mv.db" "$DIP_HOME/databases/$database.mv.db.$DATE.bak"
    fi
    mv "$DIP_HOME/databases/$database.new.mv.db" "$DIP_HOME/databases/$database.mv.db"

done