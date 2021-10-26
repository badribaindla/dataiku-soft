# columns settings
grouped_on = 'col_0'  # ['col_0', 'col_1'] for multiple columns

grouped = my_df.groupby(grouped_on)

i = 0
for group_name, group_dataframe in grouped:
    if i > 10:
        break
    i += 1
    print(i, group_name, group_dataframe.mean())  ## mean on all numerical columns


