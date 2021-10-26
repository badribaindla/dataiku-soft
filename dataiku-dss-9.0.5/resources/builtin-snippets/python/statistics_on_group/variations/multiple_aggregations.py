# columns settings
grouped_on = 'col_0'  # ['col_0', 'col_2'] for multiple columns
aggregated_column = 'col_1'

### Choice of aggregate functions
## On non-NA values in the group
## - numeric choice :: mean, median, sum, std, var, min, max, prod
## - group choice :: first, last, count
# list of functions to compute
agg_funcs = ['mean', 'max']


# compute aggregate values
aggregated_values = my_df.groupby(grouped_on)[aggregated_columns].agg(agg_funcs)

# get the aggregate of group
aggregated_values.ix[group]

