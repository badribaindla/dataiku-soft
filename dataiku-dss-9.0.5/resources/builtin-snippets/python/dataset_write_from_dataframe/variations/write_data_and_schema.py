py_recipe_output = dataiku.Dataset("__FIRST_OUTPUT__")
py_recipe_output.write_with_schema(pandas_dataframe)

