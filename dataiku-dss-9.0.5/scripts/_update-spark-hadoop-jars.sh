#!/bin/bash -e
# Configures or reconfigures DSS Spark integration

# Don't call this directly. Use ./bin/dssadmin update-spark-hadoop-jars

Usage() {
	echo >&2 "Usage: $0 -sparkHome SPARK_HOME [-standalone FLAVOR]"
	exit 1
}

if [ -z "$DKUINSTALLDIR" -o ! -d "$DKUINSTALLDIR" ]; then
	echo >&2 "*** Error: DKUINSTALLDIR not found"
	exit 1
fi

sparkHome=
flavor=generic
ADJUST_HIVE=0
while [ $# -gt 0 ]; do
    if [ "$1" = "-sparkHome" -a $# -gt 1 ]; then
        sparkHome="$2"
        shift 2
    elif [ "$1" = "-standalone" -a $# -gt 1 ]; then
        flavor="$2"
        shift 2
    elif [ "$1" = "-d" ]; then
        DEV_MODE="1"
        shift 1
    elif [ "$1" = "-adjust-hive" ]; then
        ADJUST_HIVE="1"
        shift 1
	else
		Usage
	fi
done


HADOOP_LIBS=
if [ "x$DEV_MODE" = "x1" ]
then
    echo "[+] Building $flavor hadoop libs package"
    cd $DKUINSTALLDIR/packagers/resources-build/hadoop-standalone-libs/
    make clean dist _$flavor
    HADOOP_LIBS=$DKUINSTALLDIR/packagers/resources-build/hadoop-standalone-libs/dist/$flavor
    cd $MYDIR
elif [ "x$DEV_MODE" = "xprebuilt" ]
then
    echo "[+] Using prebuilt $flavor hadoop libs package"
    HADOOP_LIBS=$DKUINSTALLDIR/packagers/resources-build/hadoop-standalone-libs/dist/$flavor
    cd $MYDIR
else
    if [ ! -d "$DKUINSTALLDIR/hadoop-standalone-libs/" ]; then
        echo >&2 "- Missing standalone Hadoop libs"
        exit 1
    fi
    HADOOP_LIBS=$DKUINSTALLDIR/hadoop-standalone-libs/
fi

if [ -z "$sparkHome" ]; then
    sparkHome=$DKU_SPARK_HOME
fi

if [ -z "$sparkHome" ]; then
    echo >&2 "- No Spark home argument"
    exit 1
fi

echo "[+] Using Spark located at $sparkHome"

echo >&2 "+ Swap hadoop jars in Spark"
# see https://github.com/dataiku/dss-doc/blob/release/5.1/app-notes/src/spark-on-k8s-azure/index.md
rm -f $sparkHome/jars/hadoop-*
rm -f $sparkHome/jars/httpc*
rm -f $sparkHome/jars/snappy-java-*.jar
if [[ $flavor == *"hadoop3"* ]]; then
    cp $HADOOP_LIBS/hadoop-*3.1* $sparkHome/jars/
    cp $HADOOP_LIBS/hadoop-*3.2* $sparkHome/jars/
    cp $HADOOP_LIBS/woodstox* $sparkHome/jars/
    cp $HADOOP_LIBS/stax2* $sparkHome/jars/
    cp $HADOOP_LIBS/re2j-* $sparkHome/jars/
    cp $HADOOP_LIBS/wildfly-openssl-* $sparkHome/jars/
    cp $HADOOP_LIBS/commons-configuration2-* $sparkHome/jars/
    
    rm -f $sparkHome/jars/jetty-util-*
    cp $HADOOP_LIBS/jetty-util-* $sparkHome/jars/

    # Remove too-old guava from Spark, replace with DSS version (+deps)
    rm -f $sparkHome/jars/guava-*.jar $sparkHome/jars/jsr305-*.jar
    for f in guava \
            animal-sniffer-annotations checker-qual error_prone_annotations \
            failureaccess j2objc-annotations jsr305 listenablefuture; do \
        cp $DKUINSTALLDIR/lib/ivy/backend-run/$f-*.jar $sparkHome/jars/
    done
else
    cp $HADOOP_LIBS/hadoop-*2.8* $sparkHome/jars/
fi
cp $HADOOP_LIBS/htrace-core4-*.jar $sparkHome/jars/
cp $HADOOP_LIBS/azure* $sparkHome/jars/
cp $HADOOP_LIBS/*aws* $sparkHome/jars/
cp $HADOOP_LIBS/gcs-connector-* $sparkHome/jars/
cp $DKUINSTALLDIR/lib/ivy/backend-run/snappy-java-*.jar $sparkHome/jars/
cp $DKUINSTALLDIR/lib/ivy/backend-run/httpc* $sparkHome/jars/

if [[ "x$ADJUST_HIVE" = "x1" && $flavor == *"hadoop3"* ]]
then
    echo >&2 "+ Build and swap hive-exec jar to support hadoop3"
    # note: dirty hack
    # proper resolution pending (see https://jira.apache.org/jira/browse/SPARK-18673)
    if [ -z "$HIVE_SRC_DIR" ]; then
        HIVE_SRC_DIR=$(mktemp -d)
        function cleanupTempData {
            rm -rf "$HIVE_SRC_DIR"
        }
        trap cleanupTempData EXIT
    
        cd $HIVE_SRC_DIR
        echo >&2 "+ Clone hive 1.2.1 into $HIVE_SRC_DIR"        
        git clone --depth=1 --branch release-1.2.1  --single-branch https://github.com/apache/hive.git 
        HIVE_SRC_DIR=$HIVE_SRC_DIR/hive
    fi
    
    echo >&2 "+ Patching and building modified Hive"
    cd $HIVE_SRC_DIR
    cat <<EOF >./hadoop3.patch
diff --git a/shims/common/src/main/java/org/apache/hadoop/hive/shims/ShimLoader.java b/shims/common/src/main/java/org/apache/hadoop/hive/shims/ShimLoader.java
index c7fa11bffb..971da9ff9a 100644
--- a/shims/common/src/main/java/org/apache/hadoop/hive/shims/ShimLoader.java
+++ b/shims/common/src/main/java/org/apache/hadoop/hive/shims/ShimLoader.java
@@ -169,6 +169,7 @@ public static String getMajorVersion() {
     case 1:
       return HADOOP20SVERSIONNAME;
     case 2:
+    case 3:
       return HADOOP23VERSIONNAME;
     default:
       throw new IllegalArgumentException("Unrecognized Hadoop major version number: " + vers);
EOF
    git apply hadoop3.patch
    mvn clean install -DskipTests -Phadoop-2
    
    echo '+ Swapping Hive jars'
    rm $sparkHome/jars/hive-exec*
    cp $HIVE_SRC_DIR/*/target/hive-exec*1.2.1.jar $sparkHome/jars/
fi

echo >&2 "+ Done"
