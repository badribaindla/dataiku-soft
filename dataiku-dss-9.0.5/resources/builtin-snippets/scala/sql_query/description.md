Register a temporary table & run a SparkSQL query.

If you want to run a HiveQL query (superset of SparkSQL),
you should instantiate a `HiveContext` as your `SQLContext`.
See _Instantiate a HiveContext (local metastore)_ for a sample code.