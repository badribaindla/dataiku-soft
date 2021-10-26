stats =  pd.crosstab(
    index=my_df["make"],
    columns=[my_df["fuel_type"], my_df["aspiration"]],
    values=my_df["horsepower"],
    aggfunc='max',   # aggregation function
    margins=True     # add subtotals on rows and cols
)