stats = my_df.pivot_table(
    index=["make"],
    columns=["fuel_type", "aspiration"],
    values=["horsepower"],
    aggfunc='max',   # aggregation function
    margins=True     # add subtotals on rows and cols
)