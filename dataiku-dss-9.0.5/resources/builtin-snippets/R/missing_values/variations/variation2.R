df = data.frame(x=c(1,2,NA,4),
				y=rnorm(4))

filtered_df <- df %>% filter(!is.na(x))