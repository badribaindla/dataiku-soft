def process(row):
    # In 'cell' mode, the process function must return
    # a single cell value for each row,
    # which will be affected to a new column.
    # The 'row' argument is a dictionary of columns of the row`
    max_len = -1
    longest_str = None
    for val in row.values():
        if val is None:
            continue
        if len(val) > max_len:
            max_len = len(val)
            longest_str = val
    return longest_str
