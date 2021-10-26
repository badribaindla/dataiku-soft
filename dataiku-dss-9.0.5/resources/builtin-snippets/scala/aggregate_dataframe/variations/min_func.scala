val minDf = df.groupBy("col1").min("col2", "col3")
// column names: "col1", "min(col2)" & "min(col3)"