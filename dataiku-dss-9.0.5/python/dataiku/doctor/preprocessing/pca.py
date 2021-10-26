from sklearn import decomposition
import pandas as pd
import logging

logger = logging.getLogger(__name__)

class PCA(object):
    """ Implements PCA for DataFrames.

    Supports pre-normalization given frozen parameters.
    A normalization step can be included before
    performing the PCA.
    """

    __slots__ = ('input_columns',
                 'output_columns',
                 'n_components',
                 'kept_variance',
                 'pca',
                 'prefix',
                 'stats',
                 'do_normalize')

    def __init__(self, kept_variance, normalize=False, prefix="factor_",):
        assert 0 < kept_variance < 1.0
        self.stats = {}
        self.do_normalize = normalize
        self.prefix = prefix
        self.kept_variance = kept_variance
        self.pca = decomposition.PCA(n_components=kept_variance)
        self.input_columns = None
        self.output_columns = None

    def get_stats(self, df, column_name):
        if column_name not in self.stats:
            series = df[column_name]
            self.stats[column_name] = (series.mean(), series.std())
        return self.stats[column_name]

    def normalize(self, df):
        assert self.input_columns is not None and len(self.input_columns) >= 1
        if self.do_normalize:
            copy = df.copy()
            feature_rescalers = []
            for column in self.input_columns:
                column_preprocessors = []
                stats = self.get_stats(df, column)
                if stats is not None:
                    (average, std) = stats
                    if std != 0.0:
                        copy[column] = (copy[column] - average) / std
            return copy
        else:
            return df.copy()

    def fit_transform(self, df,):
        self.fit(df)
        return self.transform(df)

    def fit(self, df):
        logger.info("Fitting on %s (cols %s)" % (df.__class__, df.columns))
        self.input_columns = df.columns
        normalized_df = self.normalize(df)
        for col in normalized_df.columns:
            logger.info("%s -> %s" % (col, normalized_df[col].isnull().sum()))
        self.pca.fit(normalized_df)
        self.n_components = self.pca.components_.shape[0]
        self.output_columns = [
            self.prefix + str(i)
            for i in range(self.n_components)
        ]

    def transform(self, df):
        assert self.input_columns is not None and len(self.input_columns) >= 1
        normalize_df = self.normalize(df)
        projected_data = self.pca.transform(normalize_df)
        return pd.DataFrame(data=projected_data,
                                columns=self.output_columns,
                                index=df.index)



class PCA2(object):
    """ Implements PCA for named np arrays. Does not pre-normalize"""

    def __init__(self, kept_variance, prefix="factor_", random_state=1337):
        assert 0 < kept_variance < 1.0
        self.prefix = prefix
        self.kept_variance = kept_variance
        self.pca = decomposition.PCA(n_components=kept_variance)  # random_state only scikit>=0.18
        self.input_columns = None
        self.output_columns = None
        self.random_state = random_state

    def fit_transform(self, df,):
        self.fit(df)
        return self.transform(df)

    def fit(self, npa, names):
        logger.info("Fitting on %s (cols %s)" % (npa, names))
        self.input_columns = names
        normalized_npa = npa
        self.pca.fit(normalized_npa)
        self.n_components = self.pca.components_.shape[0]
        self.output_columns = [
            self.prefix + str(i)
            for i in range(self.n_components)
        ]

    def transform(self, npa, names):
        assert self.input_columns is not None and len(self.input_columns) >= 1
        projected_data = self.pca.transform(npa)
        return pd.DataFrame(data=projected_data,
                                columns=self.output_columns)