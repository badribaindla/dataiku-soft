##### SIMPLE CASE

If you have only one output dataset and your query starts with a SELECT, Data Science Studio automatically transforms it to a proper INSERT OVERWRITE statement in the proper partition.

##### CUSTOM INSERT

If you want to take control over your insert (see Hive recipes) and the output datasets are partitioned, then you must explicitely write the proper INSERT OVERWRITE statement in the output partition.

##### CUSTOM INSERT WITH VARIABLES

The values in the PARTITION clause must be static, i.e., they cannot be computed using the query itself. Each time the recipe is run, the values must be the ones of the partition being computed of this dataset. To automatically set the proper values depending on which partition is being built, you can use Partitioning variables substitutions
