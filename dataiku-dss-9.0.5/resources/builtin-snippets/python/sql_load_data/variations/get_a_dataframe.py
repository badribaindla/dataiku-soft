import dataiku

executor = dataiku.SQLExecutor2("connection_name")

df = executor.query_to_df('select "col1", COUNT(*) as count from "my_schema"."my_table" group by "col1"')