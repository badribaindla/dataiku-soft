# - ffill : propagate last valid observation forward to next valid
# - backfill : use NEXT valid observation to fill gap
my_df['col'] = my_df['col'].fillna(method='ffill')

