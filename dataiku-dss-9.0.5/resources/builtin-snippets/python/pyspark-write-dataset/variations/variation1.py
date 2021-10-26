
# df is a PySpark dataframe
import dataiku.spark as dspark
import dataiku

dataset = dataiku.Dataset("__FIRST_OUTPUT__")
dspark.write_with_schema(dataset, df)