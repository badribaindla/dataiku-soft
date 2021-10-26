from sklearn import preprocessing
import numpy as np

# Applies log transformation to the feature
processor = preprocessing.FunctionTransformer(np.log1p)

# ***Warning*** to function, this sample needs the "Processor wants matrix" flag 
# set to true