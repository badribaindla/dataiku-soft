# columns settings
grouped_on = 'col_0'  # ['col_0', 'col_1'] for multiple columns
aggregated_column = 'col_1'

### Choice of aggregate functions
## On non-NA values in the group
## - numeric choice : mean, median, sum, std, var, min, max, prod
## - group choice : first, last, count
## On the group lines
## - size of the group : size
aggregated_values = my_df.groupby(grouped_on)[aggregated_column].mean()
aggregated_values.name = 'mean'

# get the aggregate of group
aggregated_values.ix[group]

