import dataiku

executor = dataiku.SQLExecutor2("connection_name")

for it in executor.query_to_iter('select "col1", COUNT(*) as count from "my_schema"."my_table" group by "col1"'):
    print it