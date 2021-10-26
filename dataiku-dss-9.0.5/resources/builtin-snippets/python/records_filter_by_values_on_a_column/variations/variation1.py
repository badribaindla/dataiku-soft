cond = (my_df['col'] == value)

# multiple values
# cond = my_df['col'].isin([value1, value2])

# null value
# cond = my_df['col'].isnull()

# exclude (negate condition)
# cond = ~cond

my_records = my_df[cond]