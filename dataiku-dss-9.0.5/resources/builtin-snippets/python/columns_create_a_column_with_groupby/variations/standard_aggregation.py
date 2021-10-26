# columns settings
grouped_on = 'col_1'
aggregated_column = 'col_0'

### Choice of aggregate functions
## On non-NA values in the group
## - numeric choice : mean, median, sum, std, var, min, max, prod
## - group choice : first, last, count
my_df['aggregate_values_on_col'] = my_df.groupby(grouped_on)[aggregated_column].transform(lambda v: v.mean())


