In SQL recipes (both “query” and “script”), reading partitioned datasets require that you manually restrict what is being read in your query.

    SELECT col1 FROM input_table
            WHERE country = 'the partition I want to read';

The partition(s) that you want to read is determined by the partition dependencies system and should not be hard-coded in your recipe. Instead, you should use [Partitioning variables substitutions](http://doc.dataiku.com/dss/latest/partitions/variables.html).


Full documentation is available [here](http://doc.dataiku.com/dss/latest/partitions/sql_recipes.html#reading-from-partitioned-datasets).