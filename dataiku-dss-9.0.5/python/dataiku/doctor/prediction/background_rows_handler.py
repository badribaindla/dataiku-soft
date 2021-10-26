import logging
import os.path as osp

import numpy as np
import pandas as pd

from dataiku.core.dku_pandas_csv import DKUCSVFormatter
from dataiku.doctor.utils.split import input_columns
from dataiku.doctor.utils.split import load_df_with_normalization

logger = logging.getLogger(__name__)


class BackgroundRowsHandler:
    BACKGROUND_FILENAME = "background_rows.csv"
    MIN_BACKGROUND_SIZE = 25
    MAX_BACKGROUND_SIZE = 1000
    MAX_ITER_BACKGROUND = 200
    ALLOWED_BACKGROUND_BIAS = 0.05

    def __init__(self, model_folder, split_desc, prediction_type, per_feature):
        self.background_rows_path = osp.join(model_folder, self.BACKGROUND_FILENAME)

        self.split_desc = split_desc
        self.prediction_type = prediction_type
        self.per_feature = per_feature
        self.input_cols = input_columns(per_feature)

    def has_saved_background_rows(self):
        """ Does the model folder contains the background rows file?
        :rtype: bool
        """
        return osp.exists(self.background_rows_path)

    def retrieve_background_rows(self):
        """ Load the saved background rows file
        :return: All the background rows
        :rtype: pd.DataFrame
        """
        logger.info("Using saved background rows")
        background_rows_df = load_df_with_normalization(self.background_rows_path,
                                                        self.split_desc["schema"],
                                                        self.per_feature,
                                                        prediction_type=self.prediction_type)
        logger.info("Loaded background rows with shape={}".format(background_rows_df.shape))
        return background_rows_df[self.input_cols]

    def draw_and_save_background_rows(self, dataset, predictions_df):
        """ Draw MAX_BACKGROUND_SIZE rows in the dataset and ensure that the MIN_BACKGROUND_SIZE first rows have
        a average prediction close to the overall dataset prediction average and save them in the model folder.
        :param dataset: dataset in which the rows should be drawn
        :type dataset: pd.DataFrame
        :param predictions_df: prediction of the dataset (dataset.shape[0] == predictions.shape[0])
        :type predictions_df: pd.DataFrame
        """
        background_rows_df = self.draw_background_rows(dataset, predictions_df)
        logger.info("Saving background rows with shape={}".format(background_rows_df.shape))
        with open(self.background_rows_path, "wb") as fp:
            DKUCSVFormatter(background_rows_df, path_or_buf=fp, sep="\t",
                            header=False, index=False).save()

    @staticmethod
    def draw_background_rows(dataset, predictions_df):
        logger.info("Building background rows")
        nb_rows = dataset.shape[0]

        if nb_rows < BackgroundRowsHandler.MIN_BACKGROUND_SIZE:
            raise ValueError("Can not compute explanations: not enough rows to build background rows")

        # Building first background rows centered around prediction results
        lowest_mean_differences = np.repeat(np.inf, predictions_df.shape[1])
        best_background_index = None
        predictions_averages = np.asarray([np.mean(predictions_df[col].values) for col in predictions_df.columns])
        predictions_std = np.asarray([np.std(predictions_df[col].values) for col in predictions_df.columns])
        random_state = np.random.RandomState(1337)
        attempt = 0
        for attempt in range(BackgroundRowsHandler.MAX_ITER_BACKGROUND):
            sample_predictions = predictions_df.sample(n=BackgroundRowsHandler.MIN_BACKGROUND_SIZE, random_state=random_state)
            sample_predictions_means = np.asarray([np.mean(sample_predictions[col].values) for col in sample_predictions.columns])
            means_differences = np.abs(predictions_averages - sample_predictions_means)
            if all(means_differences < BackgroundRowsHandler.ALLOWED_BACKGROUND_BIAS * predictions_std):
                best_background_index = sample_predictions.index
                lowest_mean_differences = means_differences
                break
            elif all(predictions_averages < lowest_mean_differences):
                lowest_mean_differences = means_differences
                best_background_index = sample_predictions.index
        if attempt == BackgroundRowsHandler.MAX_ITER_BACKGROUND - 1:
            logger.warning("Could not find a well-centered background, will take the best one")
        logger.info("Background estimated bias <= {}".format(lowest_mean_differences.max()))
        first_background_rows_df = dataset.loc[best_background_index]

        # Filling the remaining with sample
        df_orig_without_first_rows = dataset.drop(first_background_rows_df.index, errors="ignore")
        remaining_rows_to_add = min(dataset.shape[0],
                                    BackgroundRowsHandler.MAX_BACKGROUND_SIZE) - first_background_rows_df.shape[0]
        if remaining_rows_to_add > 0:
            remaining_background_df = df_orig_without_first_rows.sample(n=remaining_rows_to_add, random_state=1337)

            background_rows_df = pd.concat([first_background_rows_df, remaining_background_df])
        else:
            background_rows_df = first_background_rows_df

        logger.info("Built background rows with shape={}".format(background_rows_df.shape))

        return background_rows_df


