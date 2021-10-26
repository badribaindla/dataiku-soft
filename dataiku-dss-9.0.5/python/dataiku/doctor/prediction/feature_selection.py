from abc import abstractmethod
from math import sqrt

import scipy.sparse
from sklearn import decomposition
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.feature_selection import f_classif
from sklearn.linear_model import Lasso, LogisticRegression
from sklearn.model_selection import GridSearchCV
from sklearn.utils.extmath import safe_sparse_dot

from dataiku.doctor.multiframe import *
from dataiku.doctor.preprocessing import Step 
from dataiku.doctor.preprocessing import preproc_logger

import logging
import numpy as np
from six.moves import xrange


class FeatureSelection:
    def __init__(self):
        pass

    @abstractmethod
    def transform(self, mf):
        pass

    @abstractmethod
    def get_selection_params(self):
        pass

    @abstractmethod
    def get_method(self):
        pass

    def to_json(self):
        return {
            "method": self.get_method(),
            "selection_params": self.get_selection_params()
        }


class FeatureSelector:
    def __init__(self):
        pass

    @abstractmethod
    def fit(self, mf, target):
        pass


class FeatureSelectionStep(Step):
    def __init__(self, params, prediction_type):
        super(FeatureSelectionStep, self).__init__()
        self.params = params
        self.prediction_type = prediction_type
        self.method = None
        self.selection = None
        self.resources = None

    def fit_and_process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        self.selection = get_feature_selector(self.params, self.prediction_type).fit(current_mf, output_ppr["target"])
        self.method = self.selection.get_method()
        self.resources["method"] = self.method
        self.resources["selection_params"] = self.selection.get_selection_params()
        return self.selection.transform(current_mf)

    def process(self, input_df, current_mf, output_ppr, generated_features_mapping):
        return self.selection.transform(current_mf)

    @staticmethod
    def build_selection(method, selection_params):
        if method == "NOOP":
            return NoopFeatureSelection()
        elif method == "DROP":
            return DropFeatureSelection(selection_params["kept_columns"])
        elif method == "PCA":
            return PCAFeatureSelection(selection_params["sparse"],
                                       selection_params["input_names"],
                                       np.array(selection_params["rot"]),
                                       np.array(selection_params["explained_variance"]),
                                       np.array(selection_params["means"]))
        else:
            raise ValueError("Unknown method for selection : %s" % method)

    def init_resources(self, resources_handler):
        self.resources = resources_handler.get_resource("feature_selection", "json")
        if "method" in self.resources:
            self.method = self.resources["method"]
            self.selection = self.build_selection(self.method,
                                                  self.resources["selection_params"])


class NoopFeatureSelection(FeatureSelection):
    def transform(self, mf):
        return mf

    def get_selection_params(self):
        return {}

    def get_method(self):
        return "NO_OP"


class DropFeatureSelection(FeatureSelection):
    def __init__(self, kept_columns):
        FeatureSelection.__init__(self)
        self.kept_columns = kept_columns

    def transform(self, mf):
        mf.select_columns(self.kept_columns)
        return mf

    def get_selection_params(self):
        return {"kept_columns": self.kept_columns}

    def get_method(self):
        return "DROP"


class PCAFeatureSelection(FeatureSelection):
    def __init__(self, sparse, input_names, rot, explained_variance=None, means=None):
        FeatureSelection.__init__(self)
        self.sparse = sparse
        self.input_names = input_names
        self.output_names = ["principal_component:%s" % i for i in xrange(0, rot.shape[1])]
        self.rot = rot
        self.explained_variance = explained_variance
        self.means = means

    def transform(self, mf):
        if self.sparse:
            block = safe_sparse_dot(mf.as_csr_matrix(), self.rot)
        else:
            X = mf.as_np_array()
            if self.means is not None:
                X = X - self.means
            block = np.dot(X, self.rot) / np.sqrt(self.explained_variance)
        mf.select_columns([])  # clear the multiframe
        mf.append_np_block("pca_features", block, self.output_names)
        return mf

    def get_selection_params(self):
        return {
            "sparse": self.sparse,
            "rot": [[t for t in x] for x in self.rot],
            "explained_variance": self.explained_variance,
            "means": self.means,
            "input_names": self.input_names
        }

    def get_method(self):
        return "PCA"


class DropSelector(FeatureSelector):
    def __init__(self):
        FeatureSelector.__init__(self)

    @abstractmethod
    def get_pruned_names(self, mf, target):
        pass

    def fit(self, mf, target):
        names = self.get_pruned_names(mf, target)
        return DropFeatureSelection(names)


def extract_features(mf, sparse=False):
    if sparse:
        return mf.as_csr_matrix()
    else:
        return mf.as_np_array()


class ClassificationCorrelationSelector(DropSelector):
    def __init__(self, params):
        DropSelector.__init__(self)
        self.n_features = params["n_features"]

    def get_pruned_names(self, mf, target):
        # we compute the F-score for each feature.
        f_values = []
        for block_name, blk, keep in mf.iter_blocks(True):
            if not keep:
                continue
            if isinstance(blk, NamedNPArray):
                X = blk.array
                names = blk.names
            elif isinstance(blk, SparseMatrixWithNames):
                X = blk.matrix
                names = blk.names
            elif isinstance(blk, DataFrameWrapper):
                X = blk.df.values
                names = blk.df.columns
            else:
                raise ValueError("UNKNOWN BLOCK TYPE : %s" % type(blk))
            F = f_classif(X, target)[0]
            f_values.extend(zip(names, F))
        return [x[0] for x in sorted(f_values, key=lambda t: -t[1])[:self.n_features]]


class RegressionCorrelationSelector(DropSelector):
    def __init__(self, params):
        DropSelector.__init__(self)
        self.n_features = params["n_features"]
        self.min_abs_correlation = params["min_abs_correlation"]
        self.max_abs_correlation = params["max_abs_correlation"]

    @staticmethod
    def sparse_abs_cor(sparse, target_sparse, t_mean, t_std):
        s_mean = sparse.mean(axis=0)[0]
        s_sqmean = sparse.power(2).mean(axis=0)[0]
        s_std = sqrt(max(s_sqmean - s_mean * s_mean, 0.0))
        if s_std == 0.0:
            return 0.0
        else:
            xy = (target_sparse * sparse).mean(axis=0)[0]
            return abs((xy - t_mean * s_mean) / (s_std * t_std))

    @staticmethod
    def dense_abs_cor(dense, target, t_mean, t_std):
        s_std = dense.std()
        if s_std == 0.0:
            return 0.0
        else:
            s_mean = dense.mean()
            xy = (dense * target).mean()
            return abs((xy - t_mean * s_mean) / (s_std * t_std))

    def get_pruned_names(self, mf, target):
        correlations = []
        filtered_columns = []

        # cached quantities to speedup correlation computations
        target_sparse = None
        t_mean = target.mean()
        t_std = target.std()
        for col_name, col in mf.iter_columns():
            if type(col) is scipy.sparse.csr_matrix:
                if target_sparse is None:
                    # target_sparse is a sparse diagonal matrix with diagonal target, for efficient sparse computations
                    target_sparse = scipy.sparse.diags(target, 0)
                cor = self.sparse_abs_cor(col, target_sparse, t_mean, t_std)
            else:
                cor = self.dense_abs_cor(col, target, t_mean, t_std)
            if self.min_abs_correlation < cor < self.max_abs_correlation:
                correlations.append([col_name, cor])
            else:
                if preproc_logger.isEnabledFor(logging.DEBUG):
                    filtered_columns.append(col_name)

        preproc_logger.info('Filtered %s features because of the correlation range: [%s-%s]' % (
            len(filtered_columns), self.min_abs_correlation, self.max_abs_correlation))
        if preproc_logger.isEnabledFor(logging.DEBUG):
            preproc_logger.debug('The following features have been filtered out because of the correlation range:')
            preproc_logger.debug(filtered_columns)

        if len(correlations) == 0:
            raise ValueError("No columns left after reduction because threshold was too high. Adjust in parameters.")
        return [t[0] for t in sorted(correlations, key=lambda x: -x[1])[0:self.n_features]]


class RandomForestSelector(DropSelector):
    def __init__(self, prediction_type, params):
        DropSelector.__init__(self)
        self.n_trees = params["n_trees"]
        self.depth = params["depth"]
        self.n_features = params["n_features"]
        self.prediction_type = prediction_type

    def get_pruned_names(self, mf, target):
        X = extract_features(mf)
        if self.prediction_type == "REGRESSION":
            clf = RandomForestRegressor(n_estimators=self.n_trees, max_depth=self.depth).fit(X, target)
        else:
            clf = RandomForestClassifier(n_estimators=self.n_trees, max_depth=self.depth).fit(X, target)
        imp = clf.feature_importances_
        indices = [x[0] for x in sorted(enumerate(imp), key=lambda t: -t[1])[:self.n_features]]
        cols = mf.columns()
        return [cols[i] for i in indices]


class LassoSelector(DropSelector):
    def __init__(self, prediction_type, params):
        DropSelector.__init__(self)
        self.alphas = params["alpha"]
        self.prediction_type = prediction_type

    def get_pruned_names(self, mf, target):
        X = extract_features(mf, sparse=True)
        if self.prediction_type == "REGRESSION":
            if len(self.alphas) == 1:
                coef = Lasso(alpha=self.alphas[0]).fit(X, target).coef_
            else:
                coef = GridSearchCV(Lasso(), {"alpha": self.alphas}, cv=3).fit(X, target).best_estimator_.coef_
        elif self.prediction_type == "BINARY_CLASSIFICATION":
            if len(self.alphas) == 1:
                coef = LogisticRegression(penalty='l1', C=1.0 / self.alphas[0], solver='liblinear').fit(X, target).coef_
            else:
                cv = GridSearchCV(LogisticRegression(penalty='l1', solver='liblinear'), {"C": [1.0 / a for a in self.alphas]}, cv=3)
                coef = cv.fit(X, target).best_estimator_.coef_
            coef = [x[0] for x in coef.T]
        else:
            raise ValueError("Lasso not supported for multiclass feature selection")
        indices = [i for i, x in enumerate(coef) if x != 0.0]
        cols = mf.columns()
        return [cols[i] for i in indices]


class PCASelector(FeatureSelector):
    def __init__(self, params):
        FeatureSelector.__init__(self)
        self.n_features = params["n_features"]
        self.variance_proportion = params["variance_proportion"]

    @staticmethod
    def use_sparse_pca(mf):
        (nrows, ncols) = mf.shape()
        tn = nrows * ncols
        nnz = mf.nnz()
        fill_ratio = (float(nnz) / float(tn)) if tn != 0 else 0.0
        return tn > 500 * 500 and fill_ratio < 0.5

    def n_features_from_variance(self, var):
        cum = np.cumsum(var)
        am = np.argmax(cum > self.variance_proportion)
        n_var = len(var) if am == 0 else am
        return min(self.n_features, n_var)

    def fit(self, mf, target):
        sparse = self.use_sparse_pca(mf)
        if sparse:
            matrix = mf.as_csr_matrix()
            n_components = min(matrix.shape[0], matrix.shape[1]) - 1
            # we use the truncated SVD which is compatible with sparse matrices
            svd = decomposition.TruncatedSVD(n_components=n_components).fit(matrix)
            n_features = self.n_features_from_variance(svd.explained_variance_ratio_)
            rot = svd.components_[:n_features, :].T
            means = None
            explained_variance = None
        else:
            matrix = mf.as_np_array()
            n_components = min(matrix.shape[0], matrix.shape[1])
            pca = decomposition.PCA(n_components=n_components, whiten=True).fit(matrix)
            n_features = self.n_features_from_variance(pca.explained_variance_ratio_)
            rot = pca.components_[:n_features, :].T
            means = pca.mean_
            explained_variance = pca.explained_variance_[:n_features]
        return PCAFeatureSelection(sparse, mf.columns(), rot, explained_variance, means)


def get_feature_selector(params, prediction_type):
    method = params["method"]
    if method == "LASSO":
        return LassoSelector(prediction_type, params["lasso_params"])
    elif method == "RANDOM_FOREST":
        return RandomForestSelector(prediction_type, params["random_forest_params"])
    elif method == "CORRELATION":
        if prediction_type == "REGRESSION":
            return RegressionCorrelationSelector(params["correlation_params"])
        else:
            return ClassificationCorrelationSelector(params["correlation_params"])
    elif method == "PCA":
        return PCASelector(params["pca_params"])
    else:
        raise ValueError("unknown feature selection method : %s" % method)
