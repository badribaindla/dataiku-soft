#!/bin/bash
set -e

DATA_DIR="/home/dataiku/data"
#PREBUILT_SERVICE=/home/dataiku/prebuilt-services

(head -10 "$DATA_DIR/install.ini"; cat "/home/dataiku/install-details/install.ini.add" ) > "$DATA_DIR/install.ini.final"
mv "$DATA_DIR/install.ini.final" "$DATA_DIR/install.ini"

# Preload the already-unpacked services dir
#cp -r "$PREBUILT_SERVICE"/* "$DATA_DIR/services"

# Preload the already-unpacked config dir

# Patch install.ini for installid
DIP_HOME="${DATA_DIR}" "${DATA_DIR}/bin/python" /home/dataiku/installdir/scripts/dkuinstall/install_config.py -set general installid "apideployer-k8s-$DKU_APIDEPLOYER_K8S_NAME"

# Regenerate config to take install.ini into account
DKU_DSSADMIN_NO_CHMOD_SUPERVISORD=1 "${DATA_DIR}/bin/dssadmin" regenerate-config

# Open the local-only non-authenticated metrics server for advanced autoscaling
export DKU_APINODE_LOCAL_METRICS_PORT=13000

# Then run DSS in the foreground

echo "************ STARTING ************************"
set +e
"${DATA_DIR}/bin/dss" run
RETCODE=$?
echo "DSS Stopped ! With return code $RETCODE. Probably apimain crashed"
echo "apimain log:"
echo "------------"
cat "$DATA_DIR/run/apimain.log"

echo "DSS stopped with code $RETCODE" > /dev/termination-log