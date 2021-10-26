schema = [
    {'name':'col_name_0',   'type':'string'},
    {'name':'col_name_1',   'type':'float'}
    ]
my_dataset = dataiku.Dataset("my_dataset_name")
my_dataset.write_schema(schema)