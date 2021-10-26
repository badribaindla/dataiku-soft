my_dataset = dataiku.Dataset("__FIRST_INPUT__")

for partial_dataframe in my_dataset.iter_dataframes(chunksize=2000):
    # Insert here applicative logic on each partial dataframe.
    pass