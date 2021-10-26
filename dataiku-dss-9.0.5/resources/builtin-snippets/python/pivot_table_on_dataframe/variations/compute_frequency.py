freqs = my_df.pivot_table(
    index=["make"],
    columns=["fuel_type", "aspiration"],
    margins=True     # add subtotals on rows and cols
)

