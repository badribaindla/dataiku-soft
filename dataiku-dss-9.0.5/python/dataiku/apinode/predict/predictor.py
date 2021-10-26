import os

class ClassificationPredictor(object):
    """The base interface for a classification Custom API node predictor"""

    def __init__(self, data_folder):
        """data_folder is the absolute path to the managed folder storing the data for the model"""
        pass

    def predict(self, df):
        """
        The main prediction method.

        :param: df: a dataframe of 1 or several records to predict

        :return: Either:
            ``decision_series`` or
            ``(decision_series, proba_df)`` or
            ``(decision_series, proba_df, custom_keys_list)``

        decision_series must be a Pandas Series of decisions

        proba_df is optional and must contain one column per class

        custom_keys_list is optional and must contain one entry per input row. Each entry of
        custom_keys_list must be a Python dictionary. These custom keys will be sent in the
        output result

        decision_series, proba_df and custom_keys_list must have the same number of rows than df.
        It is legal to refuse to score a record. Leave a NA in decision_series
        """
        raise Exception("Unimplemented")


class RegressionPredictor(object):
    """The base interface for a classification Custom API node predictor"""

    def __init__(self, data_folder):
        """data_folder is the absolute path to the managed folder storing the data for the model"""
        pass

    def predict(self, df):
        """
        The main prediction method.

        :param: df: a dataframe of 1 or several records to predict

        :return: Either:
            ``prediction_series`` or
            ``(prediction_series, custom_keys_list)``

        prediction_series must be a Pandas Series of decisions

        custom_keys_list is optional and must contain one entry per input row. Each entry of
        custom_keys_list must be a Python dictionary. These custom keys will be sent in the
        output result

        prediction_series and custom_keys_list must have the same number of rows than df.
        It is legal to refuse to score a record. Leave a NA in prediction_series
        """
        raise Exception("Unimplemented")
