rules = {
    value: value1,
    value2: value3,
    'Invalid': np.nan  # replace by an true invalid value
}

my_df['col'] = my_df['col'].map(rules)


