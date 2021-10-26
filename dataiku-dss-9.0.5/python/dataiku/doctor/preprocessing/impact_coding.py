
# how to use : df should be the dataframe restricted to categorical values to impact,
# target should be the pd.series of target values.
# Use fit, transform etc.
# three types : binary, multiple, continuous.
# for now m is a param <===== but what should we put here ? I guess some function of total shape.
# I mean what would be the value of m we want to have for 0.5 ?

import pandas as pd
import numpy as np


def lambda_weight(n, m):
    # takes an array/series n and return n/(n+m)
    return n.astype('float') / (n + m)


class ImpactCoding(object):
    """ ImpactCoding is an alternative way to cope with
    categorical values in a regression or in a classification project.

    The base idea is to replace categorical values by their overall observed
    impact on the target value.

    For instance, let's consider a dataset with 5000 persons. We
    aim at predicting their height. Their home country is a feature
    of the dataset, but it can take as many as 300 different values.

    Impact coding consists of replacing the country information by the
    average height of the people in their home country.
    (Note that it may not be a good idea if for instance the
    ratio of men and woman is different in these countries.)

    Because some countries may be underrepresented, we prefer to use
    a more robust estimate of the average. Here we simply use additive
    smoothing.
    ie, if a category is represented X times, we compute lambda = X/(X+10)
    and instead of CAT_AVG, we use lambda*CAT_AVG + (1-lambda) * TARGET_AVG
    (so when a category has very low cardinality like 2 or 3, most of its actual
    value is smoothened by the global average)
    """
    DEFAULT_VALUE = '__default__'
    NULL = '__NULL__'

    __slots__ = ('m', '_impact_map', '_category_counts')

    def __init__(self,
                 m=10):
        self.m = m
        self._impact_map = None

    def is_fitted(self):
        return self._impact_map is not None

    def _simple_impact(self, serie, target_serie, val):
        # impact on one value (all what is needed for binary target)
        category_counts = serie.value_counts()
        positive_category_counts = serie[target_serie == val].value_counts()
        both_counts = pd.concat([category_counts, positive_category_counts], axis=1).fillna(0)
        both_counts.columns = ["overall", "positive"]
        print ("VALUE COUNT %s" % category_counts)

        self._category_counts = category_counts

        lambda_weights = lambda_weight(category_counts, self.m)
        nb_positive = target_serie[target_serie == val].count()
        nb_total = serie.shape[0]
        positive_ratio = float(nb_positive) / nb_total
        impact_coded_values = lambda_weights * both_counts["positive"].astype(float) / both_counts["overall"] +\
            (1.0 - lambda_weights) * positive_ratio
        default_value = pd.Series(positive_ratio, index=[ImpactCoding.DEFAULT_VALUE])
        # add default value
        return pd.DataFrame(pd.concat([impact_coded_values, default_value], axis=0))

    def default_value(self):
        return self._impact_map.loc[ImpactCoding.DEFAULT_VALUE]

    def get_reportable_map(self):
        self._category_counts.name = "count"
        fullmap = pd.concat([self._category_counts, self._impact_map], axis=1)
        fullmap.sort_values(by="count", ascending=False, inplace=True)
        return fullmap.head(100)

    def fit(self, serie, target_serie):
        # rescale if required
        # consider null as a category in itself.
        serie.fillna(ImpactCoding.NULL, inplace=True)
        # calculate the impact coding
        self._impact_map = self.compute_impact_map(serie, target_serie)

    def transform(self, serie):
        serie_unique = serie.unique()
        cat_values_fitted = self._impact_map.index
        for v in serie_unique:
            if v not in cat_values_fitted:
                serie.loc[serie == v] = ImpactCoding.DEFAULT_VALUE
        result_df = pd.DataFrame({"__feature": serie}).merge(self._impact_map, left_on="__feature", right_index=True, how='left')
        del result_df["__feature"]
        return result_df

    def fit_transform(self, X, target):
        self.fit(X, target)
        return self.transform(X)

    def compute_impact_map(self, serie, target_serie):
        """ Compact the impact coding value map.

        Given a serie of values for a categorical feature,
        and the respective serie of target value,
        returns the map of impact values as a dataframe indexed
        by the series values.
        """
        raise NotImplementedError("See CategoricalImpactCoding or ContinuousImpactCoding")


class CategoricalImpactCoding(ImpactCoding):

    def compute_impact_map(self, serie, target_serie):
        target_values = target_serie.unique()
        target_values = target_values[:-1]  # TODO do we really want linear independance.
        impact_list = []
        columns = []
        for val in target_values:
            impact_serie = self._simple_impact(serie, target_serie, val)
            columns.append("impact:" + str(val))
            impact_list.append(impact_serie)
        impact_df = pd.DataFrame(pd.concat(impact_list, axis=1),)
        impact_df.columns = columns
        return impact_df


class ContinuousImpactCoding(ImpactCoding):

    __slots__ = ('rescaling', 'scaler')

    def __init__(self, m=10, rescaling=False, scaler=None):
        ImpactCoding.__init__(self, m)
        self.rescaling = rescaling
        self.scaler = scaler

    def _rescale(self, target):
        #  rescale the target
        # TODO use the correct processor for that
        # TODO align scaler type names to rescaling processor.
        if self.scaler == 'standard':
            _avg = target.mean()
            _std = target.std()
            if _std != 0:
                target = (target - _avg).astype(np.float64) / _std
        elif self.scaler == 'min_max':
            _min = target.min()
            _max = target.max()
            if _min != _max:
                target = (target - _min).astype(np.float64) / (_max - _min)
        return target

    def compute_impact_map(self, serie, target_serie):
        if self.rescaling:
            target_serie = self._rescale(target_serie)
        target_mean = target_serie.mean()
        df = pd.DataFrame({"feature": serie, "target": target_serie})
        category_means = df.groupby("feature")['target'].mean()
        category_counts = df["feature"].value_counts()
        self._category_counts = category_counts
        lambda_weights = lambda_weight(category_counts, self.m)
        impact_coded_values = pd.Series((lambda_weights * category_means + (1 - lambda_weights) * target_mean))
        # add default value
        return pd.DataFrame(pd.concat([impact_coded_values, pd.Series([target_mean],
                            index=[ImpactCoding.DEFAULT_VALUE])],
                            axis=0), columns=["impact"])

from sklearn.model_selection import KFold
class NestedKFoldImpactCoder(object):

    def set_data(self, mapping, default_mean):
        self.mapping = mapping
        self.default_mean = default_mean

    def fit(self, feature_series, target_series):
        df = pd.DataFrame({"feature" : feature_series, "target" : target_series})
        impact_coded_series, mapping, default_mean = NestedKFoldImpactCoder.impact_coding(df, "feature", "target")

        self.mapping = mapping
        self.default_mean = default_mean

        # Resort by index so that it has the same index has the original feature
        return impact_coded_series.sort_index()

    def transform(self, feature_series):
        return feature_series.map(self.mapping).fillna(self.default_mean)

    @staticmethod
    def impact_coding(data, feature, target):
        """
        This function does two things:
          - Directly compute the impact coded series of the feature
          - Compute the mapping to apply to test data and data to score

        Notably, the train data does not use the mapping to avoid leaking information. Instead,
        train data is computed using nested KFold

        TODO: Check if there are issues with the usage of "rsuffix" that may be buggy in Pandas+Python 2
        If there are non-ascii elements (even in unicode type) in the columns of the dataframes being joined
        """
        np.random.seed(13)
        n_folds = 10
        n_inner_folds = 3
        impact_coded = pd.Series()
        
        # Global mean of the target, applied to unknown values
        global_mean = data[target].mean()

        # This DF receives all computed means, per value of the feature.
        # Shape: (n_feature_values, n_folds * n_inner_folds)
        # Globally averaging it yields the final mapping to apply to test data
        mapping_computation_df = pd.DataFrame()

        split = 0
        kf = KFold(n_splits=n_folds, shuffle=True)

        for infold, oof in kf.split(data[feature]):

            # This dataframe has, at the end of the loop, shape=(n_feature_values, n_inner_folds)
            # It's what we will append to the global mapping_computation_df
            inner_means_df = pd.DataFrame()

            # Fallback value for this outer fold when one of the inner fold has missing value
            infold_mean = data.iloc[infold][target].mean()

            kf_inner = KFold(n_splits=n_inner_folds, shuffle=True)
            inner_split = 0
            for infold_inner, oof_inner in kf_inner.split(data.iloc[infold]):
                # Actual mean per target value on the infold_inner
                infold_inner_mean = data.iloc[infold].iloc[infold_inner].groupby(by=feature)[target].mean()

                # Append the means per value to the per-innerfold DF
                inner_means_df = inner_means_df.join(pd.DataFrame(infold_inner_mean), rsuffix=inner_split, how='outer')
                inner_means_df.fillna(infold_mean, inplace=True)

                inner_split += 1

            # Now, just append all infold_inner means to the global mapping_computation_df
            # And fill with global means values that were not in the infold (so not in any of the infold_inner)
            mapping_computation_df = mapping_computation_df.join(pd.DataFrame(inner_means_df), rsuffix=split, how='outer')
            mapping_computation_df.fillna(global_mean, inplace=True)
            
            # And actually apply the mean of all infold_inner means to the actual train data, on oof
            oof_data = data.iloc[oof]
            inner_folds_mean = inner_means_df.mean(axis=1)
            impact_coded_oof = oof_data[feature].map(inner_folds_mean).fillna(global_mean)
            impact_coded = impact_coded.append(impact_coded_oof)

            split += 1

        # Compute final mapping table for test data by averaging means over outer folds
        mapping = mapping_computation_df.mean(axis=1)

        return impact_coded, mapping, global_mean