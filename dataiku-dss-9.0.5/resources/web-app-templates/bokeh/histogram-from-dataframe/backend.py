import dataiku
from bokeh.io import curdoc
from bokeh.plotting import figure

# This loads sample dataset of cars data into a dataframe
# Let's disply a simple histogram of horsepower (the column is called hp)
from bokeh.sampledata.autompg import autompg
df = autompg
column = 'hp'

# Uncomment the following to read your own dataset
#dataset = dataiku.Dataset("YOUR_DATASET_NAME_HERE")
#df = dataset.get_dataframe()
#column = "YOUR_COLUMN_NAME"

value_counts = df[column].value_counts(bins=8, sort=False)
values = value_counts.index.map(str).values

hist = figure(x_range=values, plot_height=250)
hist.vbar(x=values, top=value_counts, width=0.8)

# For more details about Bokeh's histograms and other charts,
# check Bokeh's documentation:
# https://bokeh.pydata.org

curdoc().add_root(hist)