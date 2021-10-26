"Bagging"

import sklearn.ensemble
clf =sklearn.ensemble.BaggingRegressor(base_estimator=None, n_estimators=10, max_samples=1.0, max_features=1.0, bootstrap=True, bootstrap_features=False, oob_score=False, n_jobs=1, random_state=None, verbose=0)