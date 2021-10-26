import dataiku
import dataiku.spark as dspark

from pyspark import SparkContext
from pyspark.sql import SQLContext

sc = SparkContext()
sql_context = SQLContext(sc)