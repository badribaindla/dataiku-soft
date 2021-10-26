
# how to use : df should be the dataframe restricted to categorical values to impact,
# target should be the pd.series of target values.
# Use fit, transform etc.
# three types : binary, multiple, continuous.
# for now m is a param <===== but what should we put here ? I guess some function of total shape.
# I mean what would be the value of m we want to have for 0.5 ?

import pandas as pd
import numpy as np

NULL = '__NULL__'
default = '__default__'


def lambda_weight(n, m):
    # takes an array/series n and return n/(n+m)
    return n.astype('float') / (n + m)


class ImpactCoding(object):

    def __init__(self,
                 impact_type='binary',
                 m=10,
                 rescaling=False,
                 scaler=None,
                 filepath=None):  # add rescale = True ? may be a solution.
        self.type = impact_type
        self.m = m
        self.rescaling = rescaling
        self.scaler = scaler
        self.filepath = filepath

    def _check_fitted(self):
        if not hasattr(self, "impact"):
            raise AttributeError("Impact coding has not been trained yet.")

    def _check_columns(self, X):
        diff = set(self.feature_list).difference(set(list(X.columns)))
        if len(diff) > 1:
            AttributeError("New Dataframe columns do not correspond to the ones on which preprocessing was fitted.")

    def _impact_missing(self, df):
        df[self.feature_list] = df[self.feature_list].fillna(NULL)
        # Nulls are simply taken as another category

    def _simple_impact(self, df, t_value, feature):
        # impact on one value (all what is needed for binary target)
        n = df[feature].value_counts()
        n.name = 'n'
        impact_target = df['impact_target']
        nYi = df[impact_target == t_value][feature].value_counts()
        nYi.name = 'nYi'
        nnYi = pd.concat([n, nYi], axis=1).fillna(0)  # trick avoid na
        la = lambda_weight(n, self.m)
        nY = impact_target[impact_target == t_value].count()
        nTR = df.shape[0]
        prop = float(nY) / nTR
        imp = pd.Series((la * nnYi['nYi'].astype(float) / nnYi['n'] + (1 - la) * prop), name=feature + '_impact_coded_' + str(t_value))
        return pd.DataFrame(pd.concat([imp, pd.Series(prop, index=[default], name=feature + '_impact_coded_' + str(t_value))], axis=0))  # add default value

    def _impact_binary(self, df):
        val = df['impact_target'].unique()[0]
        for feature in self.feature_list:
            self.impact[feature] = self._simple_impact(df, val, feature)

    def _impact_multiple(self, df):
        target_values = df['impact_target'].unique()
        target_values = target_values[:len(target_values) - 1]
        # create one column per value but one
        for feature in self.feature_list:
            impact_list = []
            for val in target_values:
                impact_list.append(self._simple_impact(df, val, feature))
            self.impact[feature] = pd.DataFrame(pd.concat(impact_list, axis=1))

    def _impact_continuous(self, df):
        df['impact_target'] = df['impact_target'].astype('float')
        nY = df['impact_target'].mean()
        for feature in self.feature_list:
            n = df[feature].value_counts()
            nYi = df.groupby(feature)['impact_target'].mean()  # no need for trick here, always have a mean
            la = lambda_weight(n, self.m)
            imp = pd.Series((la * nYi + (1 - la) * nY), name=feature + '_impact_coded')
            self.impact[feature] = pd.DataFrame(pd.concat([imp, pd.Series([nY], index=[default], name=feature + '_impact_coded')], axis=0))  # add default value

    def _rescale(self, target):
        #  rescale the target
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

    def fit(self, X, target):
        # recreate dataframe
        print (target)
        target.name = 'impact_target'
        # rescale if asked
        if self.rescaling:
            target = self._rescale(target)
        self.feature_list = X.columns
        df = X.copy()
        df['impact_target'] = target
        self.impact = {}
        # calculate the impact coding
        self._impact_missing(df)
        if self.type == 'binary':
            self._impact_binary(df)
        elif self.type == 'multiple':
            self._impact_multiple(df)
        elif self.type == 'continuous':
            self._impact_continuous(df)
        else:
            raise AttributeError("The impact_type value is unknown. Please use 'binary', 'multiple' or 'continuous'. ")

    def transform(self, X):
        self._check_fitted()
        self._check_columns(X)
        df = X.copy()
        # fill na with null value
        self._impact_missing(df)
        for feature in df.columns:
            #  change unkown values to default.
            cat_values = df[feature].unique()
            cat_values_fitted = self.impact[feature].index
            for cat_val in cat_values:
                if cat_val not in cat_values_fitted:
                    feat = df[feature]
                    feat.loc[feat == cat_val] = default
            # merge with result of feature
            df = df.reset_index().merge(self.impact[feature], left_on=feature, right_index=True, how='left').set_index('index')  # bouyah
            del df[feature]
        return df

    def fit_transform(self, X, target):
        self.fit(X, target)
        return self.transform(X)
