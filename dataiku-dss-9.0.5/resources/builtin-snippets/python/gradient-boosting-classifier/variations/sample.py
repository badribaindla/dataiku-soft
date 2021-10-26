"Gradient Boosting"
import sklearn.ensemble
clf = sklearn.ensemble.GradientBoostingClassifier(
    loss='deviance',
    learning_rate=0.1,
    n_estimators=100,
    subsample=1.0,
    min_samples_split=2,
    min_samples_leaf=1,
    max_depth=3,
    init=None,
    random_state=None,
    max_features=None,
    verbose=0,
    max_leaf_nodes=None,
    warm_start=False)