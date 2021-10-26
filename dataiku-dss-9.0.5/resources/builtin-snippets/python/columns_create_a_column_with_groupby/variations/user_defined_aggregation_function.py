def zscore(x):
    return (x - x.mean()) / x.std()
   
my_df['zscore_col'] = my_df.groupby(grouped_on)[aggregated_column].transform(zscore)