by_col_0 <- df %>% 
			group_by(col_0) %>% 
			summarise(a = n(), b = a + 1)