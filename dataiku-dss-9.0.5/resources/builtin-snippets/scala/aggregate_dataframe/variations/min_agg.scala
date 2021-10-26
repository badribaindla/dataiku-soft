val minDf  = df.groupBy("col1").agg("col2" -> "min", "col3" -> "min")
// column names: "col1", "min(col2)" & "min(col3)"

// same but with column functions
// assumes import org.apache.spark.sql.functions._
val minDf2 = df.groupBy("col1").agg(min("col2").as("min_col2"), min("col3"))
// column names: "col1", "min_col2" & "min(col3)"