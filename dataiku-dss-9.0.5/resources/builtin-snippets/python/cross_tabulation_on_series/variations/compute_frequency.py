freqs = pd.crosstab(
    index=my_df["make"],
    columns=[my_df["fuel_type"], my_df["aspiration"]]
)


