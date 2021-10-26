grouped_on = 'col_0' # ['col_1', 'col_1'] # for multiple columns

### Choice of aggregate functions
## On non-NA values in the group
## - numeric choice : mean, median, sum, std, var, min, max, prod
## - group choice : first, last, count
def filling_function(v):
    return v.fillna(v.mean())
                    
my_df['col'] = my_df.groupby(grouped_on)['col'].transform(filling_function)