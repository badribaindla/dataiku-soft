def to_log(v):
    try:
        return log(v)
    except:
        return np.nan
my_df['new_col'] = my_df['col_0'].map(to_log)


