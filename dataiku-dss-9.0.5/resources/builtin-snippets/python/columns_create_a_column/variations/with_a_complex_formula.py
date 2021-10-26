def complex_formula(col0_value, col1_value):
    return "%s (%s)" % (col0_value, col1_value)

my_df['new_col'] = np.vectorize(complex_formula)(my_df['col_0'], my_df['col_1'])