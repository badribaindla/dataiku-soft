merged = my_df.merge(my_df2,
    on='col', # ['col_0', 'col_1'] for many
    how='inner',
    # suffixes=('_from_my_df', '_from_my_df2')
    )


