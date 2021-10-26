If your input datasets are partitioned, only the partitions that are needed by the dependencies system are available.

Therefore, __you do not need to write any WHERE clause to restrict the selected partitions.__

Only the required partitions will be included in the results.