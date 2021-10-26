df.registerTempTable("my_table")
val df2 = sqlContext.sql("SELECT * FROM my_table")