# single value
cond1 = (my_df['col_0'] == value)
cond2 = (my_df['col_1'].isin([value1, value2]))
# boolean operators :
# - negation : ~  (tilde)
# - or : |
# - and : &
cond = (cond1 | cond2)
my_records = my_df[cond]