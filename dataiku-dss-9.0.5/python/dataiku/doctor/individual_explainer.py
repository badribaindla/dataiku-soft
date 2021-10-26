import logging

import numpy as np
import pandas as pd

from dataiku.base.utils import safe_unicode_str
from dataiku.core import dkujson
from dataiku.core.dku_logging import LogLevelContext
from dataiku.doctor import constants
from dataiku.doctor.prediction.background_rows_handler import BackgroundRowsHandler
from dataiku.doctor.prediction.column_importance_handler import ColumnImportanceHandler
from dataiku.doctor.prediction.histogram_handler import HistogramHandler
from dataiku.doctor.utils.metrics import log_odds
from dataiku.doctor.utils.split import df_from_split_desc
from dataiku.doctor.utils.split import input_columns

DEFAULT_SHAPLEY_BACKGROUND_SIZE = 100
DEFAULT_SUB_CHUNK_SIZE = 10000
DEFAULT_NB_EXPLANATIONS = 3
RANDOM_SEED = 1337

logger = logging.getLogger(__name__)


class ExplanationMethod:
    ICE = "ICE"
    SHAPLEY = "SHAPLEY"


class IndividualExplainer:
    """ Computes prediction & per-row explanations of those predictions
    For that there are two methods:
    - ICE: it takes the difference between the prediction of one given example x and (an approximation of)
    the expectation of the predictions of the examples x created by replacing one specific feature in x by all
    its potential values, against the marginal distribution of this feature
    - Shapley values: it computes an estimation of the average impact on the prediction of switching a feature value
    from the value it takes in a random sample (background rows) to the value it takes in the sample to be explained
    while a random number of feature values have already been switched in the same way.

    Those methods use specific names like:
    - frankenstein: modified version of the original observations.
    - scores: the prediction in regression and the log-odd of the proba(s) in classification
    - modalities: unique values of a column for a categorical/text feature or bins for numerical one
    - background rows: sample of the test set used to get some feature values
    to tweak the observations and build the frankenstein
    """

    def __init__(self, predictor, model_folder, split_desc, per_feature, is_ensemble,
                 prediction_type, sample_weight_col=None):

        self._split_desc = split_desc
        self._is_kfolding = split_desc["params"].get("kfold", False)
        self._prediction_type = prediction_type
        self._per_feature = per_feature
        self._is_ensemble = is_ensemble
        self._predictor = predictor

        self.testset = None
        self.testset_prediction_results = None

        self.background_rows = None
        self.histograms = None
        self.column_importance = None

        self.sample_weight_col = sample_weight_col

        self.column_importance_handler = ColumnImportanceHandler(model_folder)
        self.column_importance_compute_has_failed = False

        self.background_rows_handler = BackgroundRowsHandler(model_folder,
                                                             self._split_desc,
                                                             self._prediction_type,
                                                             self._per_feature)

        self.histogram_handler = HistogramHandler(model_folder)

        self._input_columns = input_columns(per_feature)

    def sample_by_predictions(self, df, low_predictions_boundary, high_prediction_boundary, class_name=None):
        """ Return a sample of the given DataFrame using its predictions.

        If one prediction is between range_min and range_max its row is discarded
        :param df: DataFrame to sample
        :param low_predictions_boundary: the lower boundary
        :param high_prediction_boundary: the upper boundary
        :param class_name: the name of the class to be used for sampling by predictions. Mandatory in multiclass only.
        :return: the sample of the DataFrame
        """
        pred_df = self._predictor.predict(df, with_probas=True)
        if pred_df.empty:
            return RuntimeError("All rows have been dropped by the preprocessing")
        elif self._prediction_type == "REGRESSION":
            predictions = pred_df["prediction"]
            filtered_predictions = predictions[(predictions <= low_predictions_boundary) |
                                               (predictions >= high_prediction_boundary)]
        elif self._prediction_type == "BINARY_CLASSIFICATION":
            probas_1 = pred_df.iloc[:, 2]
            filtered_predictions = pred_df[(probas_1 <= low_predictions_boundary) |
                                           (probas_1 >= high_prediction_boundary)]
        else:
            if class_name is None:
                raise ValueError("The class used to sample by prediction should be specified")
            probas_selected_class = self._get_scores_or_probas_for_class(pred_df, class_name)
            filtered_predictions = pred_df[(probas_selected_class <= low_predictions_boundary) |
                                           (probas_selected_class >= high_prediction_boundary)]
        return df.loc[filtered_predictions.index]

    def preload_background(self, df=None):
        """ Load or compute everything that is necessary to compute the explanations: background rows,
         column importance, feature histograms
        :param df: (optional) dataset to use to compute those, if None will use the test set
        """
        prediction_results = None
        if df is not None:
            df = df.copy()
            # Rows can be dropped by PP
            prediction_results = self._get_prediction_results(df)

        self._load_or_compute_column_importance(df, prediction_results)

        self._load_or_draw_background_rows(df, prediction_results)

        self._load_or_compute_histograms(df)

    def is_background_loaded(self):
        return self.background_rows is not None and self.histograms is not None

    def explain(self, observations_df, nb_explanations, method, for_class=None, debug_mode=False, progress=None,
                sub_chunk_size=None, shapley_background_size=DEFAULT_SHAPLEY_BACKGROUND_SIZE):
        """ Compute the explanations for each rows in observations.
            :param observations_df: the rows to explain
            :type observations_df: pd.DataFrame
            :param nb_explanations: Number of explanations the user wants,
                more will be computed to be sure we don't miss too much
            :type nb_explanations: int
            :param method: Method to compute the explanation
            :type method: ExplanationMethod.ICE or ExplanationMethod.SHAPLEY
            :param for_class: in multiclass, a class can be provided to compute in one vs all mode
            :type for_class: str
            :param debug_mode: If False, silence pre-processing pipeline logs
            :type debug_mode: bool
            :param progress: Object to refresh the progress bar in the UI. Should be None if explanations are not done through the UI
            :type progress: None or PercentageProgress
            :param sub_chunk_size: into how much chunks the dataset to explain should be divided in chunks (to prevent OOM errors)
            :type sub_chunk_size: int
            :param shapley_background_size: Size of the background to use with shapley method
            :type shapley_background_size: int

            :return: the explanations with the same shape as the observations,
                 and the prediction results of each row in observations
            :rtype tuple(pd.DataFrame, PredictionResults)
        """
        if not self.is_background_loaded():
            raise Exception("Explanations background has not been loaded")

        columns_to_compute = self._get_most_important_columns(nb_explanations)
        try:
            prediction_results = self._get_prediction_results(observations_df)
        except DroppedBatchException:
            return pd.DataFrame(columns=self._input_columns, index=observations_df.index), None

        with LogLevelContext(logging.CRITICAL, [constants.PREPROCESSING_LOGGER_NAME], disable=debug_mode):
            if method == ExplanationMethod.SHAPLEY:
                nb_rows = self.background_rows.shape[0]
                if self.background_rows.shape[0] < shapley_background_size:
                    background_size = nb_rows
                    logger.info("Not enough rows, lowering the Monte Carlo steps to {}".format(nb_rows))
                else:
                    background_size = shapley_background_size

                background_rows = self.background_rows.head(background_size)

                explanations = self.compute_shapley_values(observations_df[self._input_columns], background_rows,
                                                           columns_to_compute, sub_chunk_size, for_class, progress)
            elif method == ExplanationMethod.ICE:
                explanations = self.compute_ice_values(observations_df[self._input_columns], prediction_results,
                                                       columns_to_compute, sub_chunk_size, for_class, progress)
            else:
                raise ValueError("Unknown method to explain prediction '{}'".format(method))

        return explanations, prediction_results

    def compute_shapley_values(self, observations_df, background_rows, columns_to_compute, sub_chunk_size,
                               for_class=None, progress=None):
        nb_rows = len(observations_df.index)
        nb_chunks = np.ceil(float(nb_rows) / sub_chunk_size) if sub_chunk_size else 1
        shapley_values_chunks = []
        columns_indices = [np.where(np.in1d(observations_df.columns, col_name))[0][0] for col_name in columns_to_compute]
        # Split the observations into smaller chunks (to limit OOM errors)
        nb_computed_rows = 0
        for chunk in np.array_split(observations_df, nb_chunks):

            frankensteins = self._create_shapley_frankensteins(chunk, background_rows, columns_to_compute, columns_indices)
            logger.info("Built two frankensteins of shape {} for this chunk".format(frankensteins[0].shape))

            if progress:
                progress.set_percentage(int(100 * (0.2 * chunk.shape[0] + nb_computed_rows) / nb_rows))
            scores = self._get_prediction_results(frankensteins[0]).scores_to_explain_df

            if progress:
                progress.set_percentage(int(100 * (0.5 * chunk.shape[0] + nb_computed_rows) / nb_rows))
            scores_to_compare = self._get_prediction_results(frankensteins[1]).scores_to_explain_df

            if progress:
                progress.set_percentage(int(100 * (0.8 * chunk.shape[0] + nb_computed_rows) / nb_rows))

            if self._prediction_type == "MULTICLASS":
                scores = self._get_scores_or_probas_for_class(scores, for_class)
                scores_to_compare = self._get_scores_or_probas_for_class(scores_to_compare, for_class)

            shapley_values_chunks.append(self._extract_shapley_explanations(chunk,
                                                                            scores,
                                                                            scores_to_compare,
                                                                            background_rows.shape[0],
                                                                            columns_to_compute,
                                                                            columns_indices))
            nb_computed_rows += chunk.shape[0]

        shapley_values_df = pd.concat(shapley_values_chunks, copy=False)
        return shapley_values_df[columns_to_compute]

    def _create_shapley_frankensteins(self, observations_df, background_rows, columns, columns_indices):
        background_size = background_rows.shape[0]

        # Create two huge frankensteins that will contain
        # for each rows all the permutations for all columns to explain
        all_columns = observations_df.columns

        # Building masks to replace some values by ones from the background
        permutations = self._get_permutations(len(background_rows.columns), background_size)
        fk_permutations_mask = np.zeros((len(all_columns), background_size, len(columns)), dtype=bool)
        fk_compare_permutations_mask = fk_permutations_mask.copy()

        # Doing it only once, over column length, which should be negligible compared to the other dimensions,
        # so the for loop is ok
        for col_index, col_name in enumerate(columns):
            # Build the first frankenstein mask so that
            # the frankenstein array is filled with the observations
            # after permuting some columns with the background rows
            # except the column being explained
            # More details here: https://analytics.dataiku.com/projects/RDWIKI/wiki/890
            col_index_in_all_cols = columns_indices[col_index]
            indices_to_permute_col = np.where(np.logical_not((permutations == col_index_in_all_cols).cumsum(axis=0)))
            fk_permutations_mask[:, :, col_index][permutations[indices_to_permute_col], indices_to_permute_col[1]] = 1

            # Build the second frankenstein mask so that
            # the frankenstein array is filled with the rows of the first frankenstein
            # except the column that is being explained, which is also permuted with the background rows
            fk_compare_permutations_mask[:, :, col_index] = fk_permutations_mask[:, :, col_index]
            fk_compare_permutations_mask[:, :, col_index][col_index_in_all_cols, :] = True

        frankenstein_arr = np.where(fk_permutations_mask[np.newaxis, :, :, :],
                                    background_rows.values.T[np.newaxis, :, :, np.newaxis],
                                    observations_df.values[:, :, np.newaxis, np.newaxis])

        frankenstein_to_compare_arr = np.where(fk_compare_permutations_mask[np.newaxis, :, :, :],
                                               background_rows.values.T[np.newaxis, :, :, np.newaxis],
                                               observations_df.values[:, :, np.newaxis, np.newaxis])

        return pd.DataFrame(data=frankenstein_arr.transpose((0, 2, 3, 1)).reshape(-1, len(all_columns)),
                            columns=all_columns).astype(observations_df.dtypes),\
               pd.DataFrame(data=frankenstein_to_compare_arr.transpose((0, 2, 3, 1)).reshape(-1, len(all_columns)),
                            columns=all_columns).astype(observations_df.dtypes)

    def _extract_shapley_explanations(self, observations_df, predictions, predictions_to_compare,
                                      background_size, columns, columns_indices):
        diff = (predictions.values - predictions_to_compare.values).reshape(len(columns),
                                                                            background_size,
                                                                            -1, order="F")
        reduced_diff = diff.mean(axis=1).T

        shapley_df = pd.DataFrame(index=observations_df.index, columns=observations_df.columns, dtype=np.float64)
        shapley_df.values[:, columns_indices] = reduced_diff
        return shapley_df

    def compute_ice_values(self, observations_df, base_prediction_results, columns_to_compute,
                           sub_chunk_size, for_class=None, progress=None):
        """ Compute explanations using ICE method
        This algorithm will split the observations in several chunks and for each chunk will:
         - construct per-column frankensteins using the modalities/bins of the columns
         - concatenate the per-column frankensteins
         - score this concatenated frankensteins
         - deconstruct the concatenated frankenstein scores to get per-column frankenstein scores
         - compute explanations for each column using the per-column frankenstein scores
        """

        # Retrieving scores as a one dimension array
        if self._prediction_type == constants.MULTICLASS:
            base_scores_arr = self._get_scores_or_probas_for_class(base_prediction_results.scores_to_explain_df,
                                                                   for_class).values
        else:
            base_scores_arr = np.squeeze(base_prediction_results.scores_to_explain_df.values, axis=1)

        # Gather information about columns to compute (name, modalities, distribution, index in all columns etc...)
        column_infos = []
        for col_name in columns_to_compute:
            modalities = self.histograms[col_name]["scale"].astype(observations_df[col_name].dtype)
            distribution = self.histograms[col_name]["distribution"]
            col_idx = list(observations_df.columns).index(col_name)
            column_infos.append(ICEColumnInfo(col_name, col_idx, modalities, distribution))

        # Split the observations into smaller chunks (to limit OOM errors)
        ice_values_chunks = []
        nb_rows = len(observations_df.index)
        nb_chunks = np.ceil(float(nb_rows) / sub_chunk_size) if sub_chunk_size else 1
        nb_computed_rows = 0
        for chunked_df, base_scores_arr_chunked in zip(np.array_split(observations_df, nb_chunks),
                                                       np.array_split(base_scores_arr, nb_chunks)):

            if progress:
                progress.set_percentage(int(100 * (0.2 * chunked_df.shape[0] + nb_computed_rows) / nb_rows))

            frankenstein_df = self._create_ice_frankenstein(chunked_df, column_infos)
            logger.info("Built frankenstein of shape {} for this chunk".format(frankenstein_df.shape))

            if progress:
                progress.set_percentage(int(100 * (0.5 * chunked_df.shape[0] + nb_computed_rows) / nb_rows))

            # Score the concatenated frankenstein that contains all per-column frankensteins
            scores_df = self._get_prediction_results(frankenstein_df).scores_to_explain_df

            if progress:
                progress.set_percentage(int(100 * (0.8 * chunked_df.shape[0] + nb_computed_rows) / nb_rows))

            explanations = self._extract_ice_explanations(scores_df, chunked_df, base_scores_arr_chunked,
                                                          column_infos, for_class)
            ice_values_chunks.append(explanations)
            nb_computed_rows += chunked_df.shape[0]

        return pd.concat(ice_values_chunks, copy=False)

    @staticmethod
    def _fast_repeat_df(df, n_times):
        repeat_df = df.loc[np.tile(df.index, n_times)]
        repeat_df.reset_index(inplace=True, drop=True)
        return repeat_df

    def _create_ice_frankenstein(self, observations_df, columns_info):
        """
        :type observations_df: pd.DataFrame
        :type columns_info: list of ICEColumnInfo
        :rtype: pd.DataFrame
        """
        num_duplicates = sum(col_info.modalities.shape[0] for col_info in columns_info)
        frankenstein_df = self._fast_repeat_df(observations_df, num_duplicates)
        curr_index = 0
        for col_info in columns_info:
            col_modalities_repeated = np.repeat(col_info.modalities, observations_df.shape[0])
            num_replacements = col_modalities_repeated.shape[0]
            frankenstein_df.iloc[curr_index: curr_index + num_replacements, col_info.index] = col_modalities_repeated
            curr_index += num_replacements

        return frankenstein_df

    def _extract_ice_explanations(self, frankenstein_scores_df, observations_df, base_scores_arr,
                                  column_infos, for_class):
        """
        :type frankenstein_scores_df: pd.DataFrame
        :type observations_df: pd.DataFrame
        :type base_scores_arr: np.ndarray
        :type column_infos: list of ICEColumnInfo
        :type for_class: str | None
        :rtype: pd.DataFrame
        """
        # Extract per-column predicted frankensteins and compute ice explanations
        explanations = pd.DataFrame(columns=[col_info.name for col_info in column_infos],
                                    index=observations_df.index, dtype=np.float64)

        if self._prediction_type == "MULTICLASS":
            frankenstein_scores_df = self._get_scores_or_probas_for_class(frankenstein_scores_df, for_class)

        one_dim_score = np.squeeze(frankenstein_scores_df.values)
        curr_index = 0

        for col_info in column_infos:
            # Compute explanations for one column out of the per-column scored frankenstein

            # number of rows in frankenstein corresponding to the per_column frankenstein
            nb_rows_for_col = col_info.modalities.shape[0] * observations_df.shape[0]

            # shape is (nb_modalities, nb_rows_to_explain)
            col_scores_arr = one_dim_score[curr_index: curr_index + nb_rows_for_col].reshape(-1, observations_df.shape[0])
            weighted_scores_arr = col_scores_arr * col_info.distribution[:, np.newaxis]

            explanations[col_info.name] = base_scores_arr - weighted_scores_arr.sum(axis=0)

            curr_index += nb_rows_for_col

        return explanations

    def format_explanations(self, explanations_df, nb_explanations, with_json=False):
        """
        Format explanations, keeping only the top `nb_explanations` per row

        Example:

          for the following explanation dataframe:

               Embarked     Sex      Age     Fare
            0  -0.14513 -0.5972  0.15309 -0.36280
            1  -0.14513 -0.5972  0.15309 -0.36280
            2   0.44099 -0.5972 -0.08990  0.29136
            3  -0.14513  1.0996  0.09234 -0.35590
            4  -0.14513 -0.5972 -0.04434  0.10560

          with 2 explanations, will yield:

           if with_json is True, the pd.Series:

                0         {"Fare": -0.3628, "Sex": -0.5972}
                1         {"Fare": -0.3628, "Sex": -0.5972}
                2     {"Embarked": 0.44099, "Sex": -0.5972}
                3          {"Fare": -0.3559, "Sex": 1.0996}
                4    {"Embarked": -0.14513, "Sex": -0.5972}

           if with_json is False, the pd.DataFrame:

                   Embarked     Sex  Age    Fare
                0       NaN -0.5972  NaN -0.3628
                1       NaN -0.5972  NaN -0.3628
                2   0.44099 -0.5972  NaN     NaN
                3       NaN  1.0996  NaN -0.3559
                4  -0.14513 -0.5972  NaN     NaN

        :param explanations_df: dataframe of explanations (obtained via self.explain(...))
        :type explanations_df: pd.DataFrame
        :param nb_explanations: number of explanations to output per row
        :type nb_explanations: int
        :param with_json: whether to output explanations as json or as a dataframe
        :type with_json: bool
        :return: pd.Series | pd.DataFrame
        """

        logger.info("Formatting most important explanations")
        nb_explanations = min(nb_explanations, len(explanations_df.columns))
        if with_json:
            top_explanations_indices = np.argpartition(np.abs(explanations_df.values),
                                                       -nb_explanations, axis=1)[:, -nb_explanations:]
            top_explanations_values = np.take_along_axis(explanations_df.values, top_explanations_indices, axis=1)

            top_explanations_cols = np.empty(top_explanations_values.shape, dtype="object")
            for index, column in enumerate(explanations_df.columns):
                top_explanations_cols[top_explanations_indices == index] = column
            
            top_explanations_list = list(np.dstack((top_explanations_cols, top_explanations_values)))
            return pd.Series(top_explanations_list).apply(lambda x: dkujson.dumps(dict(x), ensure_ascii=False))
        else:
            formatted_explanations_df = explanations_df.copy()
            bottom_explanations_indices = np.argpartition(np.abs(formatted_explanations_df.values),
                                                          -nb_explanations, axis=1)[:, :-nb_explanations]
            np.put_along_axis(formatted_explanations_df.values, bottom_explanations_indices, np.nan, axis=1)
            return formatted_explanations_df

    def _get_most_important_columns(self, n_explanations):
        max_n_col = n_explanations * 5
        if max_n_col > len(self._input_columns) or self.column_importance is None:
            return self._input_columns
        else:
            self.column_importance = self.column_importance.sort_values(by="importances", ascending=False)
            most_important_columns = self.column_importance["columns"].values[:max_n_col]
            logger.info("To reduce computation time, will compute explanations "
                        "for the {} most important columns: {}".format(max_n_col,
                                                                       most_important_columns))
            return most_important_columns

    def _get_test_set(self):
        """
        :rtype: pd.DataFrame
        """
        if self.testset is None:
            self.testset = df_from_split_desc(self._split_desc,
                                              "full" if self._is_kfolding else "test",
                                              self._per_feature,
                                              self._prediction_type)
        return self.testset

    def _get_permutations(self, n_columns, n_permutations):
        random_state = np.random.RandomState(RANDOM_SEED)
        return np.array([np.argsort(random_state.uniform(0, 1, n_columns)) for _ in range(n_permutations)]).T

    def _load_or_compute_column_importance(self, df=None, df_prediction_results=None):
        """ Retrieve the model's compute importance or build one
        :param df: data to build the column importance if needed
        :type df: pd.DataFrame
        :param df_prediction_results: prediction results of the data
        :type df_prediction_results: PredictionResults
        """
        if df is None and self.column_importance_handler.has_saved_column_importance():
            logger.info("Fetching column importance from model")
            self.column_importance = self.column_importance_handler.get_column_importance()
            # For model trained before 8.0.3, column importance can contain non-input columns (ch54832)
            self.column_importance = self.column_importance[self.column_importance["columns"].isin(self._input_columns)]
        elif not self.column_importance_compute_has_failed:
            if df is None:
                df_prediction_results = self._get_testset_prediction_results()

            scores_a = df_prediction_results.scores_to_explain_df.values

            logger.info("Computing column importance")
            try:
                if self._is_ensemble:
                    raise ValueError("Column importance incompatible with ensembling models")

                self.column_importance = self.column_importance_handler.compute_column_importance(
                    list(self._input_columns),
                    df_prediction_results.features,
                    df_prediction_results.transformed_a,
                    scores_a)
            except Exception as e:
                self.column_importance_compute_has_failed = True
                logger.exception("Could not optimize the number of columns to explain: {}".format(e))

    def _load_or_draw_background_rows(self, df=None, df_prediction_results=None):
        """ Retrieve the model's background rows or draw them.
        :param df: data from which the rows must be drawn (if needed)
        :type df: pd.DataFrame
        :param df_prediction_results: prediction results of the data
        :type df_prediction_results: PredictionResults
        """
        if df is None and self.background_rows_handler.has_saved_background_rows():
            self.background_rows = self.background_rows_handler.retrieve_background_rows()[self._input_columns]
        else:
            if df is None:
                df = self._get_test_set()
                df_prediction_results = self._get_testset_prediction_results()

            scores_df = df_prediction_results.scores_to_explain_df
            self.background_rows = self.background_rows_handler.draw_background_rows(dataset=df,
                                                                                     predictions_df=scores_df)[self._input_columns]

    def _load_or_compute_histograms(self, df=None):
        """ Load and build if needed the columns histograms.
       :param df: data from which the histograms must be computed (if needed)
       :type df: pd.DataFrame
       """
        if df is None and self.histogram_handler.has_saved_histograms():
            self.histograms = self.histogram_handler.get_histograms()
        else:
            df = df if df is not None else self._get_test_set()
            # Sample weights
            if self.sample_weight_col is not None:
                # Replace nan weights by zero because in the preprocessing steps,
                # rows with missing weights are dropped
                sample_weights = df[self.sample_weight_col].fillna(0)
            else:
                sample_weights = None

            self.histograms = self.histogram_handler.compute_histograms(df,
                                                                        self._per_feature,
                                                                        sample_weights)

    def _get_testset_prediction_results(self):
        if self.testset_prediction_results is None:
            self.testset_prediction_results = self._get_prediction_results(self._get_test_set())
        return self.testset_prediction_results

    def _get_prediction_results(self, observations_df):
        """ Predict the observations, return its PredictionResults
        :param observations_df: the rows to predict
        :type observations_df: pd.DataFrame
        :return: the prediction results
        :rtype PredictionResults
        """
        clip_min = 0.01
        clip_max = 0.99
        transformed_a, predicted_df = self._predict_and_get_transformed_df(observations_df)
        features = self._get_preprocessed_features()

        if self._prediction_type == "REGRESSION":
            return PredictionResults(predicted_df["prediction"], None, predicted_df[["prediction"]],
                                     transformed_a, features)
        elif self._prediction_type == "BINARY_CLASSIFICATION":
            prediction = predicted_df["prediction"]
            probas_df = predicted_df.drop("prediction", axis=1)
            class_1 = self._predictor.params.target_map[1]
            probas_1_df = self._get_scores_or_probas_for_class(probas_df, class_1).to_frame()
            scores_df = probas_1_df.apply(lambda col: log_odds(col, clip_min=clip_min, clip_max=clip_max))
            return PredictionResults(prediction, probas_df, scores_df, transformed_a, features)
        else:
            prediction = predicted_df["prediction"]
            probas_df = predicted_df.drop("prediction", axis=1)
            scores_df = probas_df.apply(lambda col: log_odds(col, clip_min=clip_min, clip_max=clip_max))
            return PredictionResults(prediction, probas_df, scores_df, transformed_a, features)

    def _predict_and_get_transformed_df(self, observations):
        if not self._is_ensemble:
            transformed_a, input_index, empty = self._predictor.preprocessing.preprocess(observations)
            if empty:
                raise DroppedBatchException("Whole batch has been dropped by preprocessing")

            predicted_df = self._predictor._predict_preprocessed(transformed_a,
                                                                 input_index, True, True)
            return transformed_a, predicted_df
        else:
            return None, self._predictor.get_prediction_dataframe(observations, True, True, False, False)

    def _get_preprocessed_features(self):
        if self._is_ensemble:
            return None
        else:
            return self._predictor.features

    @staticmethod
    def _get_scores_or_probas_for_class(df, for_class):
        """
        Extract from all the scores/probas, the scores/probas corresponding to the specified class. If for_class is None,
        extract the probas/scores for the predicted class for each row.
        :param df: all scores
        :type df: pd.DataFrame
        :param for_class: the class
        :type for_class: str or None
        :rtype: pd.Series
        """
        if for_class is not None:
            return df[u"proba_{}".format(safe_unicode_str(for_class))]
        else:
            return df.max(axis=1)


class DroppedBatchException(RuntimeError):
    pass


class ICEColumnInfo:
    """ Class to hold information about a column of the dataset to explain.
        :type name: str
        :type index: int
        :type modalities: np.ndarray
        :type distribution: np.ndarray
    """

    def __init__(self, name, index, modalities, distribution):
        self.name = name
        self.index = index
        self.modalities = modalities
        self.distribution = distribution


class PredictionResults:
    """ Class to hold all the information about a prediction:
        * the prediction itself (the predicted classes or the predicted values)
        * the probabilities (None if regression)
        * the "score_to_explain":
            * for regression, the prediction itself
            * for classification, the log_odd of the probabilities
        * transformed_a: the preprocessed dataset (None if ensembling)
        * features: preprocessed features (None if ensembling)
    """

    def __init__(self, predictions_s, probabilities_df, scores_to_explain_df, transformed_a, features):
        self.predictions_s = predictions_s
        self.probabilities_df = probabilities_df
        self.scores_to_explain_df = scores_to_explain_df
        self.features = features
        self.transformed_a = transformed_a
