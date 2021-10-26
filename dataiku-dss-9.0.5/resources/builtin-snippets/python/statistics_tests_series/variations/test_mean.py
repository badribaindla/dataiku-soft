from scipy import stats

# The mean you want to test for
tested_mean = 0

stats.ttest_1samp(my_df["col_0"], tested_mean)
