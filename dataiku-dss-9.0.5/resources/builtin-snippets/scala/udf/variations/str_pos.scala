val strPos = udf { (s: String, part: String) =>
    s.indexOf(part)
}
df.withColumn("pos",
    strPos(df("haystack"), df("needle")))