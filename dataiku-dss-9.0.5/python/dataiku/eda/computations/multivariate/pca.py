# coding: utf-8
from __future__ import unicode_literals

import numpy as np
from sklearn import decomposition
from sklearn import preprocessing

from dataiku.eda.computations.computation import MultivariateComputation
from dataiku.eda.exceptions import NotEnoughDataError, InvalidParams
from dataiku.eda.filtering.and_filter import AndFilter
from dataiku.eda.filtering.missing_filter import MissingFilter
from dataiku.eda.filtering.not_filter import NotFilter
from dataiku.eda.grouping.grouping import Grouping


class PCA(MultivariateComputation):
    TYPE = "pca"

    def __init__(self, columns, projection_grouping, projection_dim):
        super(PCA, self).__init__(columns)
        self.projection_grouping = projection_grouping
        self.projection_dim = projection_dim

    @staticmethod
    def build(params):
        return PCA(params['columns'], Grouping.build(params['projectionGrouping']), params['projectionDim'])

    def apply(self, idf, ctx):
        if len(self.columns) < self.projection_dim:
            raise InvalidParams("Number of columns must be greater or equal to projection dimension")

        # Drop all rows containing at least a missing value
        filtered_idf = AndFilter([NotFilter(MissingFilter(column)) for column in self.columns]).apply(idf)

        # Fail fast (better than raw sklearn error - but doesn't guarantee that result
        # will be meaningful if input is too small)
        if len(filtered_idf) < 2:
            raise NotEnoughDataError()

        # Stack requested columns into a matrix
        data = np.stack([filtered_idf.float_col(column) for column in self.columns], axis=1)

        # Fit PCA
        rescaler = preprocessing.StandardScaler().fit(data)
        pca = decomposition.PCA().fit(rescaler.transform(data))

        # Project data for each group
        groups = self.projection_grouping.compute_groups(idf)
        projections = []
        for group_idf in groups.iter_groups():
            filtered_group_idf = group_idf & filtered_idf
            if len(filtered_group_idf) > 0:
                group_data = np.stack([filtered_group_idf.float_col(column) for column in self.columns], axis=1)
                projection = pca.transform(rescaler.transform(group_data))[:, :self.projection_dim].T
                projections.append(projection.tolist())
            else:
                projections.append([[]] * self.projection_dim)

        return {
            "type": self.TYPE,
            "groups": groups.serialize(),
            "projections": projections,
            "eigenvectors": pca.components_.tolist(),
            "eigenvalues": pca.explained_variance_.tolist()
        }
