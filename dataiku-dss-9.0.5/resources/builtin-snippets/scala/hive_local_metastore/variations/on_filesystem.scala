val sqlContext = org.apache.spark.sql.hive.HiveContext(sparkContext) {
    val metastorePath = "/some/path"
    override def configure() = Map(
        "hive.metastore.uris" -> "",
        "javax.jdo.option.ConnectionDriverName" -> "org.apache.derby.jdbc.EmbeddedDriver",
        "javax.jdo.option.ConnectionURL" -> s"jdbc:derby:${metastorePath};create=true",
        "javax.jdo.option.ConnectionUserName" -> "",
        "javax.jdo.option.ConnectionPassword" -> "",
        "datanucleus.autoCreateSchema" -> "true",
        "datanucleus.fixedDataStore" -> "false",
        "hive.metastore.schema.verification" -> "false",
        "hive.support.concurrency"-> "false",
        "hive.txn.manager" -> "org.apache.hadoop.hive.ql.lockmgr.DummyTxnManager"
    )
}
