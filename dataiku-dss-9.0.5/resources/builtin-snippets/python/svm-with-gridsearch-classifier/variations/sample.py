"Grid Search with SVM"

import sklearn.svm
import sklearn.grid_search
grid_parameters = {'kernel':('linear', 'rbf'), 'C':[1, 10]}
clf_base = sklearn.svm.SVC(probability=True)
clf =  sklearn.grid_search.GridSearchCV(clf_base, grid_parameters,
    scoring=None, 
    fit_params=None,
    n_jobs=1,
    iid=True,
    refit=True,
    cv=None, 
    verbose=0,
    pre_dispatch='2*n_jobs')
