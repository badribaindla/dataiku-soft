from scipy import stats

# Variance is assumed to be equal

stats.ttest_ind(my_df["col_0"], my_df["col_1"])
