"XMas Trees"

import sklearn.ensemble
clf = sklearn.ensemble.ExtraTreesClassifier(
    n_estimators=10,
    criterion='gini',
    max_depth=None,
    min_samples_split=2,
    min_samples_leaf=1,
    max_features='auto',
    max_leaf_nodes=None,
    bootstrap=False,
    oob_score=False,
    n_jobs=1,
    random_state=None,
    verbose=0)
