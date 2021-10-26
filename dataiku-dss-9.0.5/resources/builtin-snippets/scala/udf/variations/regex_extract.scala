val DateRE = """(\d{4})-(\d{2})-(\d{2})""".r
val extractDate = udf { (d: String) => d match {
        case DateRE(y, m, d) => (y.toInt, m.toInt, d.toInt)
        case _               => null
    }
}
val dateCol = extractDate(df("date_str"))
df.select(dateCol("_1").as("year"),
          dateCol("_2").as("month"),
          dateCol("_3").as("day"))