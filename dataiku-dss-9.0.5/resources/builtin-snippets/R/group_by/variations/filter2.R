filtered_df <- df %>%	
	group_by(col_0) %>%
	filter(col_1 == max(col_1))