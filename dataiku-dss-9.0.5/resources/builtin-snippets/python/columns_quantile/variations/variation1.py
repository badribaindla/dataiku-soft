 # set columns type
my_df['col'] = my_df['col'].astype(np.float64)

# computations for 4 quantiles : quartiles
bins_col = pd.qcut(my_df['col'], 4)
bins_col_label = pd.qcut(my_df['col'], 4).labels
