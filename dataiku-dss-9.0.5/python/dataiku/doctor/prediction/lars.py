from sklearn.linear_model import LassoLars, LogisticRegression
from sklearn.svm import l1_min_c
from sklearn.base import BaseEstimator

import numpy as np


class DkuLassoLarsRegressor(BaseEstimator):
    def __init__(self, max_var=0):
        self.max_var = max_var
        self.lars = None
        self.X_offset = None
        self.y_offset = None
        self.X_scale = None
        self.coef_ = None
        self.current_index = None
        self.intercept_ = None
        self.coef_path_ = None

    def fit(self, X, y):
        # note: for now we perform rescaling. While this requires some more computation on our part, it has better
        # numerical stability (could test with or without)
        self.lars = LassoLars(alpha=0.0).fit(X, y)
        # we recreate the rescaling
        _, _, self.X_offset, self.y_offset, self.X_scale = self.lars._preprocess_data(X, y,
                                                                                      True,
                                                                                      True,
                                                                                      True)
        # we normalize the coef path here
        self.coef_path_ = [x / self.X_scale for x in self.lars.coef_path_.T]
        self.coef_ = self.lars.coef_
        self.intercept_ = self.lars.intercept_
        self.alphas = self.lars.alphas_
        if self.max_var > 0:
            self._perform_cut(self.max_var)
        return self

    def _perform_cut(self, n):
        n = min(n, self.lars.coef_path_.shape[1] - 1)
        self.current_index = n
        # note: not normalized, this is normal since the _set_intercept will normalize it
        coef = self.lars.coef_path_[:, n]
        self.lars.coef_ = coef
        # recompute the intercept and normalize coefficients using scikit private method
        self.lars._set_intercept(self.X_offset, self.y_offset, self.X_scale)
        self.coef_ = self.lars.coef_

    def post_process(self, user_meta):
        if self.current_index is not None:
            n = self.current_index
        else:
            n = self.max_var
        n = user_meta.get("lars_cut", n)
        if n > 0:
            self._perform_cut(n)

    def predict(self, X):
        return self.lars.predict(X)


class DkuLassoLarsClassifier(BaseEstimator):
    def __init__(self, max_var=0, K=100):
        self.max_var = max_var
        self.K = K
        self.coef_ = None
        self.current_index = None
        self.intercept_ = None
        self.coef_path_ = None
        self.intercepts_ = None
        self.alphas = []
        self.classes_ = None

    def fit(self, X, y):
        cs = np.concatenate([[1e6], l1_min_c(X, y, loss='log') * np.logspace(3, 0, num=self.K - 1)])
        clf = LogisticRegression(C=1.0, penalty='l1', tol=1e-6, solver='liblinear', multi_class='ovr')
        self.coef_path_ = []
        self.intercepts_ = []
        self.alphas = []
        n = self.K
        for c in cs:
            n -= 1
            clf.set_params(C=c)
            clf.fit(X, y)
            if self.classes_ is None:
                self.classes_ = clf.classes_
            coef = clf.coef_
            intercept = clf.intercept_
            if self.coef_ is None and (
                    self.max_var <= 0 or np.sum(np.sum(np.abs(coef) > 1e-4, axis=0) > 0) <= self.max_var):
                self.coef_ = coef
                self.intercept_ = intercept
                self.current_index = n
            self.coef_path_.append(coef.copy())
            self.intercepts_.append(intercept)
            self.alphas.append(1.0 / c)
        if self.coef_ is None:  # shouldn't happen but ya never know
            self.coef_ = clf.coef_
            self.intercept_ = clf.intercept_
        self.coef_path_ = list(reversed(self.coef_path_))
        self.intercepts_ = list(reversed(self.intercepts_))
        self.alphas = list(reversed(self.alphas))
        return self

    def _perform_cut(self, n):
        self.coef_ = self.coef_path_[n]
        self.intercept_ = self.intercepts_[n]
        self.current_index = n

    def post_process(self, user_meta):
        if self.current_index is not None:
            n = self.current_index
        else:
            n = len(self.intercepts_) - 1
        n = user_meta.get("lars_cut", n)
        if n >= 0:
          self._perform_cut(n)

    def _fake_lr(self):
        lr = LogisticRegression()
        lr.coef_ = self.coef_
        lr.intercept_ = self.intercept_
        lr.classes_ = self.classes_
        return lr

    def predict(self, X):
        return self._fake_lr().predict(X)

    def predict_proba(self, X):
        return self._fake_lr().predict_proba(X)
