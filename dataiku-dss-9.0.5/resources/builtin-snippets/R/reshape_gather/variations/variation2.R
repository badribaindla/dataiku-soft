long_df <- wide_df %>%
			gather(key_col_name, value_col_name, col_0_to_fold, col_1_to_fold)