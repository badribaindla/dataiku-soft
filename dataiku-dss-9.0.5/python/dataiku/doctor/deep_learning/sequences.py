# WARNING : Not to be imported directly in exposed file (e.g. commands, prediction_entrypoints...) because import
# libraries (such as keras) that are not available in regular doctor. Should be imported locally when required
# inside function definitions

import numpy as np
import math
from keras.utils import Sequence

from dataiku.core.dku_logging import LogLevelContext
from dataiku.doctor import constants
from dataiku.doctor.deep_learning.keras_utils import split_train_per_input
from dataiku.doctor.deep_learning import gpu
import logging

# Retrieving Preprocessing logger
preproc_logger = logging.getLogger(constants.PREPROCESSING_LOGGER_NAME)

class InputsDataWithTargetSequence(Sequence):

    TTL = 100

    @staticmethod
    def get_sequence_builder(prediction_type, input_df, pipeline, per_feature, generated_features_mapping,
                             modeling_params, target_map, name):
        return lambda batch_size=32, with_orig_index=False, verbose=False: InputsDataWithTargetSequence(
                                                                                         prediction_type,
                                                                                         batch_size,
                                                                                         with_orig_index,
                                                                                         input_df,
                                                                                         pipeline,
                                                                                         per_feature,
                                                                                         generated_features_mapping,
                                                                                         modeling_params,
                                                                                         target_map,
                                                                                         name,
                                                                                         verbose)

    def __init__(self, prediction_type, batch_size, with_orig_index, input_df, pipeline, per_feature,
                 generated_features_mapping, modeling_params, target_map, name, verbose):
        self.batch_size = batch_size
        self.prediction_type = prediction_type
        self.input_df = input_df
        self.num_rows = self.input_df.shape[0]
        self.pipeline = pipeline
        self.per_feature = per_feature
        self.generated_features_mapping = generated_features_mapping
        self.modeling_params = modeling_params
        self.target_map = target_map
        self.with_orig_index = with_orig_index
        self.num_gpus = gpu.get_num_gpu_used()
        self.name = name

        self.current_ttl = 0
        self.log_level_context = LogLevelContext(logging.INFO, [constants.PREPROCESSING_LOGGER_NAME], verbose, True)

    def __len__(self):
        return int(math.ceil(self.num_rows * 1.0 / self.batch_size))

    def _get_batch_indices_from_index(self, index):
        if index > len(self):
            raise ValueError("Trying to access index {}, out of range. Length of sequence {}"
                             .format(index, len(self)))
        return range(self.batch_size * index, min(self.batch_size * (index + 1), self.num_rows))

    # To generate missing data, we take randomly chosen rows from the input_df and add them to the batch,
    # taking into account that they may be dropped, so we iterate until the good number of rows are produced.
    # Besides, if all the rows of the dataset would be dropped, it could lead to infinite recursion, therefore
    # we add a time to leave logic to prevent from this to happen.
    def __generate_missing_data(self, num_rows):

        # First draw nb_rows indices from the input_df
        indices = np.random.randint(0, self.num_rows, size=num_rows)

        new_batch = self.__get_batch_from_array(indices)
        new_batch_num_rows = self.__get_num_rows_from_batch(new_batch)

        if new_batch_num_rows == num_rows:
            self.current_ttl = 0
            return new_batch
        else:
            if new_batch_num_rows == 0:
                self.current_ttl += 1
                print(self.current_ttl)
                if self.current_ttl > InputsDataWithTargetSequence.TTL:
                    raise ValueError("Are all the rows of the train/test dataset dropped by the preprocessing ?")
            return self.__concatenate_batches(new_batch, self.__generate_missing_data(num_rows - new_batch_num_rows))

    def __get_num_rows_from_batch(self, batch):
        if self.with_orig_index:
            _, batch_y, _ = batch
        else:
            _, batch_y = batch

        return batch_y.shape[0]

    def __concatenate_batches(self, batch1, batch2):
        if self.with_orig_index:
            batch1_x, batch1_y, orig_index1 = batch1
            batch2_x, batch2_y, orig_index2 = batch2
        else:
            batch1_x, batch1_y = batch1
            batch2_x, batch2_y = batch2

        batch_x = {}
        for key in batch1_x.keys():
            batch_x[key] = np.concatenate([batch1_x[key], batch2_x[key]])

        batch_y = np.concatenate([batch1_y, batch2_y])

        if self.with_orig_index:
            orig_index = orig_index1.append(orig_index2)
            return batch_x, batch_y, orig_index
        else:
            return batch_x, batch_y

    def __get_target_batch(self, target_batch):
        binary_and_two_dimensions = self.prediction_type == constants.BINARY_CLASSIFICATION and \
                                   not self.modeling_params["keras"]["oneDimensionalOutput"]
        if self.prediction_type == constants.MULTICLASS or binary_and_two_dimensions:
            num_labels = len(self.target_map)
            batch_size = target_batch.shape[0]
            new_target_batch = np.zeros((batch_size, num_labels))
            new_target_batch[range(batch_size), target_batch.astype(int)] = 1
            return new_target_batch
        else:
            # i.e. for REGRESSION and BINARY CLASSIF with one dimensional output
            return target_batch

    def __getitem__(self, index):
        index_array = self._get_batch_indices_from_index(index)
        batch = self.__get_batch_from_array(index_array)
        num_rows_batch = self.__get_num_rows_from_batch(batch)

        # Keras requires that batches it receives when fitting (for example in fit_generator) are not empty.
        # Actually it won't fail at train time but will return nan when predicting or have a weird behavior.
        # It means that we must return at least a batch with one row if we are in CPU mode and a batch with
        # as many rows as number of GPU(s) when we are in GPU mode (as each GPU receives a chunk of the data).
        # However, as we process the data while building the Sequence, we may drop some rows in the process,
        # even a full batch.
        # Therefore we must detect when there is missing data and generate as many new rows in the batch
        # as required.
        min_num_rows = max(1, self.num_gpus)

        if num_rows_batch < min_num_rows:

            return self.__concatenate_batches(batch, self.__generate_missing_data(min_num_rows))
        else:
            return batch

    def __get_batch_from_array(self, index_array):

        with self.log_level_context:
            preproc_logger.info("Start preprocessing batch in '{}' sequence builder "
                                "for indices : {}".format(self.name, index_array))
            batch_input_df = self.input_df.iloc[index_array].copy()
            orig_index = batch_input_df.index

            # Resetting index to 0..length to be working with current design of pipeline
            batch_input_df.index = range(batch_input_df.shape[0])
            batch_transformed = self.pipeline.process(batch_input_df)
            batch_x_mf = batch_transformed["TRAIN"]

            # Dropping rows that were dropped in pipeline in orig_index
            orig_index = orig_index[batch_x_mf.index]

            batch_y = batch_transformed["target"]
            batch_x = split_train_per_input(batch_x_mf, self.per_feature, self.generated_features_mapping)

            target_batch = self.__get_target_batch(batch_y)
            preproc_logger.info("End preprocessing batch in sequence builder for indices : {}".format(index_array))
            if self.with_orig_index:
                return batch_x, target_batch, orig_index
            else:
                return batch_x, target_batch

class LambdaSequence(Sequence):

    def __init__(self, original_sequence, process_batch_func):
        self.original_sequence = original_sequence
        self.process_batch_func = process_batch_func

    def __len__(self):
        return len(self.original_sequence)

    def __getitem__(self, index):
        return self.process_batch_func(self.original_sequence[index])

class DataAugmentationSequence(LambdaSequence):

    @staticmethod
    def duplicate_rows(array, n_augmentation):
        return np.tile(array, tuple([n_augmentation] + [1] * (len(array.shape) - 1)))

    def __init__(self, original_sequence, augmented_input_name, augmentator, n_augmentation, seed=None):

        def _process_batch_func(batch):

            X_batch, y_batch = batch

            new_X_batch = {}

            # Augment The required input
            X_input_to_augment = X_batch[augmented_input_name]

            new_X_input_to_augment_list = []

            for _ in range(n_augmentation):
                for num_row in range(X_input_to_augment.shape[0]):
                    x = X_input_to_augment[num_row, :]
                    new_X_input_to_augment_list.append(augmentator.random_transform(x, seed))

            new_X_input_to_augment = np.array(new_X_input_to_augment_list)

            new_X_batch[augmented_input_name] = new_X_input_to_augment

            # Duplicate rows for all other inputs
            for inp in X_batch.keys():
                if inp != augmented_input_name:
                    new_X_batch[inp] = DataAugmentationSequence.duplicate_rows(X_batch, n_augmentation)

            # Duplicate rows for target
            new_y_batch = DataAugmentationSequence.duplicate_rows(y_batch, n_augmentation)

            return new_X_batch, new_y_batch

        super(DataAugmentationSequence, self).__init__(original_sequence, _process_batch_func)
