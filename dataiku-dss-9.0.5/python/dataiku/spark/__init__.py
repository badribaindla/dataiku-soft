# Spark SQL python interface

# Sample use:
#
# from pyspark.sql import SQLContext
# from dataiku import Dataset
# from dataiku.spark import getAsDataFrame, writeSchema, saveDataFrame
#
# ssc = SQLContext(sc)
# ds1 = Dataset("PROJECT.dataset_name_1")
# df1 = getAsDataFrame(ssc, ds1)
# df1.show()
#
# ds2 = Dataset("PROJECT.dataset_name_2")
# df2 = df1.select("col1", "col2")
# writeSchema(df2, ds2)
# saveDataFrame(df2, ds2)

import pyspark
from pyspark.sql import DataFrame

import os, logging, json
from dataiku.core import default_project_key

DISTRIBUTED = None

#
# Instantiate a DataikuSparkContext in the companion JVM
# TODO - find a better way to do this?
#
def __get_clazz(jvm, class_name):
    # Retrieve Scala org.apache.spark.util.Utils object
    sparkUtils = jvm.__getattr__('org.apache.spark.util.Utils$').__getattr__('MODULE$')
    # Use it to lookup DSS code in the right classloader
    if pyspark.__version__.startswith("3."):
        return sparkUtils.classForName(class_name, True, False)
    else:
        return sparkUtils.classForName(class_name)
    
def __dataikuSparkContext(jvm):
    clazz = __get_clazz(jvm, 'com.dataiku.dip.spark.StdDataikuSparkContext')
    return clazz.newInstance()

def __shaker_applier(gateway, project_key, recipe_name):
    jvm = gateway.jvm
    clazz = __get_clazz(jvm, 'com.dataiku.dip.shaker.sparkimpl.ShakerApplier')
    
    object_array = gateway.new_array(gateway.jvm.Class, 2)
    string_clazz = __get_clazz(jvm, 'java.lang.String')
    object_array[0] = string_clazz
    object_array[1] = string_clazz
    constructor = clazz.getConstructor(object_array)

    object_array = gateway.new_array(gateway.jvm.Object, 2)
    object_array[0] = project_key
    object_array[1] = recipe_name
    return constructor.newInstance(object_array)

def start_spark_context_and_setup_sql_context(load_defaults=True, hive_db='dataiku', conf={}):
    """
    Helper to start a Spark Context and a SQL Context "like DSS recipes do".
    This helper is mainly for information purpose and not used by default.
    """
    pyspark.SparkContext._ensure_initialized()
    # the jvm gateway is now up
    jvm = pyspark.SparkContext._jvm
    # Retrieve Scala org.apache.spark.util.Utils object
    spark_utils = jvm.__getattr__('org.apache.spark.util.Utils$').__getattr__('MODULE$')
    # Use it to lookup DSS code in the right classloader (in spark 1.6 just
    # jvm.__getattr__('com.dataiku.dip.spark.package$').__getattr__('MODULE$') 
    # doesn't work)
    # get the com.dataiku.dip.spark singleton
    clazz = spark_utils.classForName('com.dataiku.dip.spark.package$')
    singleton = clazz.getField('MODULE$').get(None)
    # spice up the spark conf like pyspark does (check python/pyspark/context.py in spark's code
    for key, value in pyspark.context.DEFAULT_CONFIGS.items():
        if key not in conf:
            conf[key] = str(value)
    # do the call to start the spark context, and wrap it in python, instead of letting the pyspark
    # code create it
    context_tuple = singleton.startSparkContextAndSetupSQLContext(conf, hive_db, load_defaults)
    java_spark_context = context_tuple._1()
    scala_sql_context = context_tuple._2()
    is_hive_context = context_tuple._3()
    # get and wrap the spark conf
    spark_conf = pyspark.SparkConf(_jconf=java_spark_context.getConf())
    # create the spark context (python side)
    spark_context = pyspark.SparkContext(conf=spark_conf, jsc=java_spark_context)
    # and the sql context flavor
    if java_spark_context.version().startswith("2."):
        if is_hive_context:
            sql_context = pyspark.sql.HiveContext(spark_context, jhiveContext=scala_sql_context)
        else:
            sql_context = pyspark.sql.SQLContext(spark_context, jsqlContext=scala_sql_context)
    else:
        if is_hive_context:
            sql_context = pyspark.sql.HiveContext(spark_context, hiveContext=scala_sql_context)
        else:
            sql_context = pyspark.sql.SQLContext(spark_context, sqlContext=scala_sql_context)
    distribute_py_libs(spark_context)
    return spark_context, sql_context
        
def setup_sql_context(sc, hive_db='dataiku', conf={}):
    """
    Helper to start a SQL Context "like DSS recipes do".
    This helper is mainly for information purpose and not used by default.
    """
    # the jvm gateway is should be up
    jvm = pyspark.SparkContext._jvm
    # Retrieve Scala org.apache.spark.util.Utils object
    spark_utils = jvm.__getattr__('org.apache.spark.util.Utils$').__getattr__('MODULE$')
    # Use it to lookup DSS code in the right classloader (in spark 1.6 just
    # jvm.__getattr__('com.dataiku.dip.spark.package$').__getattr__('MODULE$') 
    # doesn't work)
    # get the com.dataiku.dip.spark singleton
    clazz = spark_utils.classForName('com.dataiku.dip.spark.package$')
    singleton = clazz.getField('MODULE$').get(None)
    # do the call to start the spark context, and wrap it in python, instead of letting the pyspark
    # code create it
    context_tuple = singleton.createSQLContext(conf, hive_db, sc._jsc)
    scala_sql_context = context_tuple._1()
    is_hive_context = context_tuple._2()
    # create the sql context flavor
    if sc._jsc.version().startswith("2."):
        if is_hive_context:
            sql_context = pyspark.sql.HiveContext(sc, jhiveContext=scala_sql_context)
        else:
            sql_context = pyspark.sql.SQLContext(sc, jsqlContext=scala_sql_context)
    else:
        if is_hive_context:
            sql_context = pyspark.sql.HiveContext(sc, hiveContext=scala_sql_context)
        else:
            sql_context = pyspark.sql.SQLContext(sc, sqlContext=scala_sql_context)
    return sql_context
    
def distribute_py_libs(sc):
    global DISTRIBUTED
    if DISTRIBUTED is not None:
        return
    if os.path.exists('/etc/initial-fetch-request/initial-fetch-request.json'):
        logging.info("Running pyspark-over-k8s in cluster mode")        
        # add the python packages so that they are available for udfs in executors
        with open('/etc/initial-fetch-request/initial-fetch-request.json', 'r') as f:
            fr = json.load(f)
        logging.info("fetch request is %s" % fr)
        for p in fr.get("pathsToPyDistribute", []):
            sc.addPyFile(p)
        DISTRIBUTED = fr
    else:
        logging.info("Not running pyspark-over-k8s in cluster mode, not distributing")
        DISTRIBUTED = {}

def get_dataframe(sqlContext, dataset):
    """Opens a DSS dataset as a SparkSQL dataframe. The 'dataset' argument must be a dataiku.Dataset object"""
    distribute_py_libs(sqlContext._sc)

    if type(sqlContext).__name__ == "SparkSession":
         underlying_sqlctx = sqlContext._wrapped._ssql_ctx
    else:
         underlying_sqlctx = sqlContext._ssql_ctx
    
    dsc = __dataikuSparkContext(sqlContext._jvm)
    jdf = dsc.getPyDataFrame(underlying_sqlctx, dataset.full_name, dataset.read_partitions)
    return DataFrame(jdf, sqlContext)


def write_schema_from_dataframe(dataset, dataframe):
    """Sets the schema on an existing dataset to be write-compatible with given SparkSQL dataframe"""

    distribute_py_libs(dataframe._sc)

    dsc = __dataikuSparkContext(dataframe._sc._jvm)
    dsc.writeSchema(dataset.full_name, dataframe._jdf)
    # Invalidate local cache
    dataset.cols = None


def write_dataframe(dataset, dataframe, delete_first=True):
    """Saves a SparkSQL dataframe into an existing DSS dataset"""

    distribute_py_libs(dataframe._sc)

    dsc = __dataikuSparkContext(dataframe._sc._jvm)
    dsc.savePyDataFrame(dataset.full_name, dataframe._jdf, dataset.writePartition, delete_first and "OVERWRITE" or "APPEND", False)


def write_with_schema(dataset, dataframe, delete_first=True):
    """Writes a SparkSQL dataframe into an existing DSS dataset. This first overrides
    the schema of the dataset to match the schema of the dataframe"""

    distribute_py_libs(dataframe._sc)

    write_schema_from_dataframe(dataset, dataframe)
    write_dataframe(dataset, dataframe, delete_first)


def apply_prepare_recipe(df, recipe_name, project_key=None):
    if project_key is None:
        project_key = default_project_key()
    applier = __shaker_applier(df._sc._gateway, project_key, recipe_name)
    jdf = applier.apply(df._jdf)
    return DataFrame(jdf, df.sql_ctx)

