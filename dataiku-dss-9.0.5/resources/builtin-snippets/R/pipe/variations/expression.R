iris %>%
	{
		.$new_column1 = T
		.$new_column2 = .$Sepal.Length + .$Sepal.Width
		.
	}