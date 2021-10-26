df %>%
	group_by(col_0) %>%
	summarize(mean(col_1), mean(hp))