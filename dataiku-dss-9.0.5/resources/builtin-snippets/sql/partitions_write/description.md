##### For SQL query
###### Write to filebased partitioned
DSS “controls” how data is written and handles all partitioning issues.

###### Write to column based partitioned
In this case, the partitioning column must appear in the output data.

_WARNING_: It must appear in the SQL query at the correct position wrt. the output schema, and with the correct name.

In many case, you will use a [partitioning variables substitutions](http://doc.dataiku.com/dss/latest/partitions/variables.html) to set the value of that column.

##### For SQL script
When you write with a SQL script recipe, you are responsible for ensuring idempotence and inserting records with the correct partitioning values.

This generally involves performing a DELETE query with a restriction on the target partitioning value (or, if you are using native partitioning, using the correct database-specific commands to drop a partition) making sure that inserted records have their partitioning column value set to the target partitioning value.


Full documentation is available [here](http://doc.dataiku.com/dss/latest/partitions/sql_recipes.html#writing-into-partitioned-sql-query-writing-to-file-based-partitioned).
