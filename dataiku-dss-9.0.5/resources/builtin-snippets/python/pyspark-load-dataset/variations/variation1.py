import dataiku
import dataiku.spark as dspark

dataset = dataiku.Dataset("__FIRST_INPUT__")
dataframe = dspark.get_dataframe(sql_context, dataset)