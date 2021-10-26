import dataiku
import dataiku.spark as dspark

# Get the count of records by col1
count_df = df.groupBy("col1").count()

# Get the min of col2 grouped by col1
min_df = df.groupBy("col1").agg({"col2" : "min"})

# Get the min of col2 grouped by col1 (alternative 1)
min_df = df.groupBy("col1").min("col2")

# Get multiple mins (alternative 1)
min_df = df.groupBy("col1").min("col2", "col3")

# Get multiple aggregations (alternative 2)
from pyspark.sql import functions as F
min_df = df.groupBy("col2").agg(F.min(df.col2), F.max(df.col3))