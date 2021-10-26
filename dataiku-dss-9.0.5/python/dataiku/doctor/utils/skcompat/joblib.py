"""Joblib import wrapper

In sklearn < 0.23, joblib is bundled with sklearn. Which means
that it was accessible though sklearn.externals.joblib.

In sklearn >= 0.21, it's defined as a dependency of sklearn. So:
1. we don't need to add it manually in the list of doctor packages
2. we must `import joblib` instead of `import sklearn.externals.joblib`

Doc: https://scikit-learn.org/0.24/whats_new/v0.21.html#miscellaneous
"""

import sklearn

from dataiku.base.utils import package_is_at_least

if package_is_at_least(sklearn, "0.21"):
    from joblib import Parallel
    from joblib import delayed
else:
    from sklearn.externals.joblib import Parallel
    from sklearn.externals.joblib import delayed
