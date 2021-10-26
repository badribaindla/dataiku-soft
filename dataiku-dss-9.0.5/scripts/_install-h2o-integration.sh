#!/bin/bash -e
# Configures or reconfigures DSS H2O / Sparkling water

# Don't call this directly. Use ./bin/dssadmin install-h2o-integration

Usage() {
	echo >&2 "Usage: $0 [-sparklingWaterDir SPARKLING_WATER_DIRECTORY]"
	exit 1
}

if [ -z "$DIP_HOME" -o ! -d "$DIP_HOME" ]; then
	echo >&2 "*** Error: DIP_HOME not found"
	exit 1
fi

sparklingWaterDir=AUTO
while [ $# -gt 0 ]; do
	if [ "$1" = "-sparklingWaterDir" -a $# -gt 1 ]; then
		sparklingWaterDir="$2"
		shift 2
	else
		Usage
	fi
done

if [ ! -f "$DIP_HOME/bin/env-spark.sh" ]
then
	echo >&2 "*** Error: Spark integration must be setup before H2O integration"
	echo >&2 "*** Please run ./bin/dssadmin install-spark-integration"
	exit 1
fi
source $DIP_HOME/bin/env-spark.sh

if [ -z "$DKU_SPARK_VERSION" ]
then
	echo >&2 "*** Error: Spark integration must be setup before H2O integration"
	echo >&2 "*** Please run ./bin/dssadmin install-spark-integration"
	exit 1
fi


swTarget=$DIP_HOME/lib/sparkling-water

# Before linking, remove existing links
rm -f $swTarget/sparkling-water-assembly*.jar

if [ "$sparklingWaterDir" = "AUTO" ]; then
	echo >&2 "++ Downloading Sparkling Water"

	case "$DKU_SPARK_VERSION" in
	1.4.*)
		echo >&2 "*** Error: cannot install H2O on Spark 1.4"
		exit 1
		;;
	1.5.*)
		DOWNLOAD_URL="http://h2o-release.s3.amazonaws.com/sparkling-water/rel-1.5/16/sparkling-water-1.5.16.zip"
		ZIP_DIR="sparkling-water-1.5.16"
		SW_KIT_DIR=$DIP_HOME/lib/sparkling-water-kit/1.5.16
		SW_KIT_REL_DIR=../sparkling-water-kit/1.5.16
		;;
	1.6.*)
		# Sparkling Water 1.6.11 and 1.6.12 do not work with cdh 5.12's spark 1.6, see #7618
		DOWNLOAD_URL="http://h2o-release.s3.amazonaws.com/sparkling-water/rel-1.6/10/sparkling-water-1.6.10.zip"
		ZIP_DIR="sparkling-water-1.6.10"
		SW_KIT_DIR=$DIP_HOME/lib/sparkling-water-kit/1.6.10
		SW_KIT_REL_DIR=../sparkling-water-kit/1.6.10
		;;
	2.0.*)
		DOWNLOAD_URL="http://h2o-release.s3.amazonaws.com/sparkling-water/rel-2.0/27/sparkling-water-2.0.27.zip"
		ZIP_DIR="sparkling-water-2.0.27"
		SW_KIT_DIR=$DIP_HOME/lib/sparkling-water-kit/2.0.27
		SW_KIT_REL_DIR=../sparkling-water-kit/2.0.27
		;;
	2.1.*)
		DOWNLOAD_URL="http://h2o-release.s3.amazonaws.com/sparkling-water/rel-2.1/51/sparkling-water-2.1.51.zip"
		ZIP_DIR="sparkling-water-2.1.51"
		SW_KIT_DIR=$DIP_HOME/lib/sparkling-water-kit/2.1.51
		SW_KIT_REL_DIR=../sparkling-water-kit/2.1.51
		;;
	2.2.*)
		DOWNLOAD_URL="http://h2o-release.s3.amazonaws.com/sparkling-water/rel-2.2/37/sparkling-water-2.2.37.zip"
		ZIP_DIR="sparkling-water-2.2.37"
		SW_KIT_DIR=$DIP_HOME/lib/sparkling-water-kit/2.2.37
		SW_KIT_REL_DIR=../sparkling-water-kit/2.2.37
		;;
	2.3.*)
		DOWNLOAD_URL="http://h2o-release.s3.amazonaws.com/sparkling-water/rel-2.3/26/sparkling-water-2.3.26.zip"
		ZIP_DIR="sparkling-water-2.3.26"
		SW_KIT_DIR=$DIP_HOME/lib/sparkling-water-kit/2.3.26
		SW_KIT_REL_DIR=../sparkling-water-kit/2.3.26
		;;
    2.4.*)
        DOWNLOAD_URL="http://h2o-release.s3.amazonaws.com/sparkling-water/rel-2.4/8/sparkling-water-2.4.8.zip"
        ZIP_DIR="sparkling-water-2.4.8"
        SW_KIT_DIR=$DIP_HOME/lib/sparkling-water-kit/2.4.8
        SW_KIT_REL_DIR=../sparkling-water-kit/2.4.8
        ;;
    3.0.*)
        DOWNLOAD_URL="https://h2o-release.s3.amazonaws.com/sparkling-water/spark-3.0/3.30.1.2-1-3.0/sparkling-water-3.30.1.2-1-3.0.zip"
        ZIP_DIR="sparkling-water-3.30.1.2-1-3.0"
        SW_KIT_DIR=$DIP_HOME/lib/sparkling-water-kit/3.0.1
        SW_KIT_REL_DIR=../sparkling-water-kit/3.0.1
        ;;
	*)
		echo >&2 "*** Error: Don't know how to find proper version of Sparkling Water for Spark '$DKU_SPARK_VERSION'"
		exit 1
		;;
	esac

	echo >&2 "++ Downloading from: $DOWNLOAD_URL"
	rm -rf $SW_KIT_DIR
	mkdir -p $SW_KIT_DIR
	curl -sS -o $SW_KIT_DIR/"$ZIP_DIR".zip $DOWNLOAD_URL
	(cd $SW_KIT_DIR && unzip "$ZIP_DIR".zip && mv $ZIP_DIR/* . && rm -rf $ZIP_DIR)

	sparklingWaterDir=$SW_KIT_DIR

else
	echo >&2 "++ Using Sparkling Water assembly from $sparklingWaterDir"
    # Minimal sanity check
    case "$sparklingWaterDir" in
        /* )
            ;;
        * )
            echo >&2 "*** Error: sparklingWaterDir should be absolute: $sparklingWaterDir"
            exit 1
            ;;
    esac
fi

# Existence check
lib_folder=
if [ -d "$sparklingWaterDir/assembly/build/libs/" ]
then
    lib_folder="$sparklingWaterDir/assembly/build/libs/"
elif  [ -d "$sparklingWaterDir/jars/" ]
then
    lib_folder="$sparklingWaterDir/jars/"
else
	echo >&2 "*** Error: Cannot find Sparkling Water assembly in $sparklingWaterDir"
	exit 1
fi

for f in  $lib_folder/sparkling-water-assembly*.jar
do
	# Check if the glob expanded to an existing file.
	if [ -e $f ]
	then
		echo "++ Linking assembly: $f"
		mkdir -p $swTarget
		(cd $swTarget && ln -sfn $f)
	else
		echo "*** Not a proper assembly, check your Sparkling Water dir: $f"
		exit 1
	fi
done

echo >&2 "+ DSS H2O support is enabled"
