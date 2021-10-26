# top n in aggregate dataframe
def top_n(group_df, col, n=2):
    bests = group_df[col].value_counts()[:n]
    return bests

# columns settings
grouped_on = 'col_0'
aggregated_column = 'col'

grouped = my_df.groupby(grouped_on)
groups_top_n = grouped.apply(top_n, aggregated_column, n=3)