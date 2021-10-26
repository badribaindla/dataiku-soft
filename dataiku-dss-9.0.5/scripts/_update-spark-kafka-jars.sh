#!/bin/bash -e

Usage() {
    echo >&2 "Usage: $0 [-sparkHome SPARK_HOME]"
    exit 1
}

if [ -z "$DKUINSTALLDIR" -o ! -d "$DKUINSTALLDIR" ]; then
    echo >&2 "*** Error: DKUINSTALLDIR not found"
    exit 1
fi

sparkHome=
while [ $# -gt 0 ]; do
    if [ "$1" = "-sparkHome" -a $# -gt 1 ]; then
        sparkHome="$2"
        shift 2
    elif [ "$1" = "-d" ]; then
        DEV_MODE="1"
        shift 1
    else
        Usage
    fi
done


if [ -z "$sparkHome" ]; then
    sparkHome=$DKU_SPARK_HOME
fi

if [ -z "$sparkHome" ]; then
    echo >&2 "- No Spark home argument"
    exit 1
fi

if [ -z "$DKU_SPARK_VERSION" ]; then
    # Grab Spark version from banner ascii art (!)
    # Could also get it from a spark-submit'ed Python script, but this needs to open a context,
    # which is expensive and chatty
    SPARK_VERSION=$("$sparkHome"/bin/spark-submit --version 2>&1 | sed -n 's_.* version \([^ ]*\)$_\1_p')
else
    SPARK_VERSION="$DKU_SPARK_VERSION"
fi

echo "[+] Using Spark located at $sparkHome"

echo >&2 "+ Fetch Kafka jars"
KAFKA_JARS_DIR=$(mktemp -d)
function cleanupTempData {
    rm -rf "$KAFKA_JARS_DIR"
}
trap cleanupTempData EXIT

cd $KAFKA_JARS_DIR
wget https://repo1.maven.org/maven2/org/apache/kafka/kafka-clients/2.5.0/kafka-clients-2.5.0.jar
case "$SPARK_VERSION" in
    3.0.* )
        wget https://repo1.maven.org/maven2/org/apache/spark/spark-sql-kafka-0-10_2.12/$SPARK_VERSION/spark-sql-kafka-0-10_2.12-$SPARK_VERSION.jar
        wget https://repo1.maven.org/maven2/org/apache/spark/spark-avro_2.12/$SPARK_VERSION/spark-avro_2.12-$SPARK_VERSION.jar
        wget https://repo1.maven.org/maven2/org/apache/spark/spark-token-provider-kafka-0-10_2.12/3.0.1/spark-token-provider-kafka-0-10_2.12-3.0.1.jar
        wget https://repo1.maven.org/maven2/org/apache/commons/commons-pool2/2.8.0/commons-pool2-2.8.0.jar
        ;;
    2.[2-4].* )
        wget https://repo1.maven.org/maven2/org/apache/spark/spark-sql-kafka-0-10_2.11/$SPARK_VERSION/spark-sql-kafka-0-10_2.11-$SPARK_VERSION.jar
        wget https://repo1.maven.org/maven2/org/apache/spark/spark-avro_2.11/$SPARK_VERSION/spark-avro_2.11-$SPARK_VERSION.jar
        ;;
    *)
        echo >&2 "*** Error: Spark version not supported: $SPARK_VERSION"
        exit 1
        ;;
esac

echo >&2 "+ Add Kafka jars to Spark"
cp "$KAFKA_JARS_DIR/"*jar "$sparkHome/jars"

echo >&2 "+ Update commons-lang3 in Spark"
rm "$sparkHome/jars/"commons-lang3*
cp "$DKUINSTALLDIR/lib/ivy/common-run/"commons-lang3* "$sparkHome/jars"

echo >&2 "+ Done"
