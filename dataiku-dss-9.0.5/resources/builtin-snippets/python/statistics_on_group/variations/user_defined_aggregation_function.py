# columns settings
grouped_on = ['col_0']
aggregated_columns = ['col_1']

def my_func(my_group_array):
    return my_group_array.min() * my_group_array.count()

## list of functions to compute
agg_funcs = [my_func] # could be many

# compute aggregate values
aggregated_values = my_df.groupby(grouped_on)[aggregated_columns].agg(agg_funcs)

