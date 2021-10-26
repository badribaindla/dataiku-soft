py_recipe_output = dataiku.Dataset("__FIRST_OUTPUT__")
writer = py_recipe_output.get_writer()

# d is of the form :
#   {'col_0': value0, 'col_1': value1, ...}

for d in data_to_write:
    writer.write_row_dict(r)


