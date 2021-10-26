from dataiku.doctor.utils import crossval


# You need to select the column (of the design matrix) that is used to split the dataset
# This column is *after preprocessing* - so for example, categorical columns are not available
# anymore.

# To know the names of the columns after preprocessing, train a first model with regular crossval
# and find the names in the "Features" section of the model results.

# Note that the column will always be used for training

# Replace "p" by the number of groups you want to leave out

cv = crossval.DKULeavePGroupsOut("column_to_split_on", p)
