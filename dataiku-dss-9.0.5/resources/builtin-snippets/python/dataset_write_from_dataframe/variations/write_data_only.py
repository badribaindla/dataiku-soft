py_recipe_output = dataiku.Dataset("__FIRST_OUTPUT__")
py_recipe_output.write_from_dataframe(pandas_dataframe)