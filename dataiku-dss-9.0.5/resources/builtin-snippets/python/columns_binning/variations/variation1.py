# Set columns type
my_df['col'] = my_df['col'].astype(np.float64)

# Computations
bins = [0, 100, 1000, 10000, 100000] # 5 binned, labeled 0,1,2,3,4
bins_col = pd.cut(my_df['col'], bins)
bins_col_label = pd.cut(my_df['col'], bins).labels