import random
n = 10
sample_rows_index = random.sample(range(len(my_df)), 10)
my_sample = my_df.take(rows)
my_sample_complementary = my_df.drop(rows)