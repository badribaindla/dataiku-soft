merged = my_df.merge(my_df2,
    left_on=['col_0', 'col_1'],
    right_on=['col_2', 'col_3'],
    # suffixes=('_from_my_df', '_from_my_df2')
    how='inner')
