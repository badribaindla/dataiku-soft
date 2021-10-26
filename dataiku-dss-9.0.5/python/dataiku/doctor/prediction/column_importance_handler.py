import logging
import os.path as osp

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from dataiku.core import dkujson
from dataiku.doctor.prediction import should_be_sparsed

logger = logging.getLogger(__name__)


class ColumnImportanceHandler:
    """ Class to handle creation, saving and fetching of column importance for a model.
    Column importance should be distinguished from feature importance. Feature importance gives the importance
    of the preprocessed features (dummified colums, linear combinations...) while column importance
    gives the importance of the model input column (e.g. before pre-processing)
    """
    COLUMN_IMPORTANCE_FILENAME = "column_importance.json"
    MAX_ALLOWED_FEATURES = 100000

    def __init__(self, model_folder):
        self.model_folder = model_folder
        self.column_importance_filepath = osp.join(model_folder, self.COLUMN_IMPORTANCE_FILENAME)

    def compute_and_save(self, input_columns, features, preprocessed_mf, scores_a):
        try:
            if should_be_sparsed(preprocessed_mf):
                preprocessed_a = preprocessed_mf.as_csr_matrix()
            else:
                preprocessed_a = preprocessed_mf.as_np_array()

            column_importance = self.compute_column_importance(input_columns, features, preprocessed_a, scores_a)
            logger.info("Saving column importance")
            dkujson.dump_to_filepath(self.column_importance_filepath, column_importance.to_dict(orient="list"))
        except Exception as e:
            logger.exception("Could not compute column importance: {}".format(e))

    def has_saved_column_importance(self):
        return osp.exists(self.column_importance_filepath)

    def get_column_importance(self):
        """ Load the column importance file in the model folder"""
        return pd.DataFrame(dkujson.load_from_filepath(self.column_importance_filepath))

    def compute_column_importance(self, all_columns, features, preprocessed_array, y_true):
        iperf = dkujson.load_from_filepath(osp.join(self.model_folder, "iperf.json"))
        return self.compute_column_importance_impl(iperf.get('rawImportance'), all_columns, features, preprocessed_array, y_true)

    # TODO: split in two versions (surrogate model & from var. importance)
    @staticmethod
    def compute_column_importance_impl(raw_importance, all_columns, features, preprocessed_array, y_true):
        """Compute column importance using feature importance.
        Build a RF to get the feature importance, or reuse feature importance of model if available.
        Then, assign to each column the sum of the importance of the features created from that column.
        :param raw_importance: Raw importances
        :type raw_importance: dict
        :param all_columns: List of model input columns
        :type all_columns: list
        :param features: List of pre-processed columns
        :type features: list
        :param preprocessed_array: Data to use for building the RF
        :type preprocessed_array: scipy.sparse.csr_matrix or np.ndarray
        :param y_true: Targets for to use for building the RF
        :type y_true: np.ndarray
        :return: the column importance
        :rtype: pd.DataFrame
        """
        logger.info("Computing column importance")
        if raw_importance is not None:
            logger.info("Reusing the model feature importance")
            variables = raw_importance.get("variables")
            importances = raw_importance.get("importances")
        else:
            if preprocessed_array.shape[1] > ColumnImportanceHandler.MAX_ALLOWED_FEATURES:
                raise ValueError("Too many pre-processed features to compute column importance")

            variables = features
            importances = ColumnImportanceHandler._compute_feature_importance(preprocessed_array, y_true)

        column_importances = {}
        for col in all_columns:
            column_importances[col] = 0.0

        for (feature,  importance) in zip(variables, importances):
            if importance != 0:
                if feature in all_columns:
                    column_importances[feature] += importance
                else:  # generated features
                    parts = feature.split(":")
                    generation_mechanism = parts[0]
                    if generation_mechanism == "dummy":  # e.g. dummy:colA:val1
                        columns = [parts[1]]
                    elif generation_mechanism == "pw_linear":
                        if "+" in parts[1]:
                            columns = parts[1].split("+")  # e.g. pw_linear:colA+colB
                        else:
                            columns = parts[1].split("-")  # e.g. pw_linear:colA-colB
                    elif generation_mechanism == "poly_int":
                        columns = parts[1].split(" * ")  # e.g. poly_int:colA * colB
                    elif generation_mechanism == "interaction":
                        # e.g. interaction:colnumA:colnumB or
                        #      interaction:colcatA:colcatB:valA:valB or
                        #      interaction:colnumA:colcatB:valB
                        columns = parts[1:3]
                    elif generation_mechanism == "NUM_DERIVATIVE":
                        if "^2" in parts[1]:  # eg NUM_DERIVATIVE:colA^2
                            columns = [parts[1][:-2]]
                        else:  # NUM_DERIVATIVE:sqrt(colA) or NUM_DERIVATIVE:log(colA)
                            columns = [parts[1].split("(")[1][:-1]]
                    else:
                        # Raising error here is acceptable, not all feature generation mechanisms are supported:
                        # Will implement a better way to map generated features to their original column:
                        # https://app.clubhouse.io/dataiku/story/43914/
                        raise ValueError("Unknown feature generation mechanism {}".format(generation_mechanism))

                    if len(columns) == 1:
                        column_importances[columns[0]] += importance
                    elif len(columns) == 2:
                        column_importances[columns[0]] += importance / 2
                        column_importances[columns[1]] += importance / 2
        return pd.DataFrame({"columns": list(column_importances.keys()),
                             "importances": list(column_importances.values())})

    @staticmethod
    def _compute_feature_importance(preprocessed_array, target):
        # TODO: with sckit 0.22 - Replace feature importances method by permutation importance
        nb_rows = preprocessed_array.shape[0]
        idx = np.random.RandomState(1337).choice(nb_rows, min(1000, nb_rows), replace=False)
        clf = RandomForestRegressor(n_estimators=100, max_depth=5, random_state=0)
        clf.fit(preprocessed_array[idx], target[idx])
        return clf.feature_importances_
