df %>%
	group_by(col_0, col_1) %>%
	summarise(n = n())