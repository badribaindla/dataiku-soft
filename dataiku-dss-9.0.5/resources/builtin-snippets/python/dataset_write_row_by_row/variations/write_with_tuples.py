py_recipe_output = dataiku.Dataset("__FIRST_OUTPUT__")
writer = py_recipe_output.get_writer()

# t is of the form :
#   (value0, value1, ...)

for t in data_to_write:
    writer.write_tuple(t)
