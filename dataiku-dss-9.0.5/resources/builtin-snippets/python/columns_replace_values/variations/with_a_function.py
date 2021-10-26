def remove_minus_sign(v):
    return str.replace('-', ' ', max=2)

my_df['col'] = my_df['col'].map(remove_minus_sign)