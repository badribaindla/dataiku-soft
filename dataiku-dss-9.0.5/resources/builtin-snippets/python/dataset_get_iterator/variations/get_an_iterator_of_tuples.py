my_dataset = dataiku.Dataset("__FIRST_INPUT__")

i = 0
for my_row_as_tuple in my_dataset.iter_tuples():
    if i > 10:
        break
    i += 1
    print my_row_as_tuple
