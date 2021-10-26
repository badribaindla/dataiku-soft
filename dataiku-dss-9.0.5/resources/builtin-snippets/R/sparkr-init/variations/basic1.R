library(SparkR)
library(dataiku.spark)

sc <- sparkR.init()
sqlContext <- sparkRSQL.init(sc)
