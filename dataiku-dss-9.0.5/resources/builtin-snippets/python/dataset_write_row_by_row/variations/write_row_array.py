py_recipe_output = dataiku.Dataset("__FIRST_OUTPUT__")
writer = py_recipe_output.get_writer()

# a is of the form :
#   [value0, value1, ...]

for a in data_to_write:
    writer.write_row_array(a)