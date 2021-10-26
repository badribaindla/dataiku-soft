from os import path as osp
import re, os, sys


import pandas as pd
import numpy as np
import logging

from dataiku.core import dkujson as dkujson
from dataiku.core import get_resources_dir
from .preprocessing import ContinuousImpactCoding, CategoricalImpactCoding
from dataiku.doctor import constants
from dataiku.doctor.utils import dku_pickle
from dataiku.doctor.utils import strip_accents
from dataiku.doctor.utils.listener import ProgressListener
from .preprocessing import PCA
from dataiku.doctor.prediction.feature_selection import *
# Dirty
from .preprocessing import *

from .preprocessing_collector import PredictionPreprocessingDataCollector, ClusteringPreprocessingDataCollector
from dataiku.doctor.prediction.feature_selection import *
from dataiku.doctor.deep_learning.preprocessing import DummyFileReader

logging.getLogger(__name__)
def load_relfilepath(basepath, relative_filepath):
    """ Returns None if the file does not exists """
    filepath = osp.join(basepath, relative_filepath)
    if osp.exists(filepath):
        return dkujson.load_from_filepath(filepath)
    else:
        return None


def extract_input_columns(preprocessing_params, with_target=False, with_profiling=True, with_sample_weight=False):
    role_filter = {"INPUT"}
    if with_sample_weight:
        role_filter.add("WEIGHT")
    if with_profiling:
        role_filter.add("PROFILING")
    if with_target:
        role_filter.add("TARGET")
    return [
        column_name
        for column_name, column_params in preprocessing_params["per_feature"].items()
        if column_params["role"] in role_filter
    ]

###
# This file contains the handlers for preprocessing, ie. responsible
# for building and saving the preprocessing pipelines
#
# core_params must be of ResolvedPredictionCoreParams type
###

class PreprocessingHandler(object):
    """Manager class for the preprocessing"""

    def __init__(self, core_params, preprocessing_params, data_path, assertions=None):
        """data_path is the path of the preprocessing set in the modelid"""
        self.core_params = core_params
        self.preprocessing_params = preprocessing_params
        self.data_path = data_path
        self.assertions = assertions
        self._impact_coders = None
        self.__resources = {}
        self.__resource_types = {}

#    @property
#    def sampling(self,):
#        default_sampling = {"samplingMethod": "FULL"}
#        return self.core_params.get("sampling", default_sampling)

    def _resource_filepath(self, resource_name, type):
        return osp.join(self.data_path, resource_name + "." + type)

    def get_resource(self, resource_name, type):
        """ Resources are just dictionaries either:
          - pickled in a .pkl named after their resource name.
          - dumped to a .json named after their resource name"""
        if resource_name in self.__resources:
            return self.__resources[resource_name]
        self.__resource_types[resource_name] = type
        filepath = self._resource_filepath(resource_name, type)
        if osp.exists(filepath):
            if type == "pkl":
                with open(filepath, 'rb') as resource_file:
                    self.__resources[resource_name] = dku_pickle.load(resource_file)
            else:
                with open(filepath, 'r') as resource_file: # binary for json lead() doesn't work in python3
                    self.__resources[resource_name] = dkujson.load(resource_file)
        else:
            self.__resources[resource_name] = {}
        return self.__resources[resource_name]

    def _save_resource(self, resource_name):
        assert resource_name in self.__resources
        resource = self.__resources[resource_name]
        type =  self.__resource_types[resource_name]
        if len(resource):
            # we only save non-empty resources
            if type == "pkl":
                with open(self._resource_filepath(resource_name, type), "wb") as resource_file:
                    dku_pickle.dump(resource, resource_file)
            else:
                with open(self._resource_filepath(resource_name, type), "w") as resource_file:
                    dkujson.dump(resource_file, resource)

    def open(self, relative_filepath, *args, **kargs):
        """ open a file relatively to self.folder_path"""
        filepath = osp.join(self.data_path, relative_filepath)
        return open(filepath, *args, **kargs)

    def input_columns(self, with_target=True, with_profiling=True):
        """ Return the list of input features.

        Can help limit RAM usage, by giving that
        to get_dataframe.

        (includes profiling columns)
        """
        return extract_input_columns(self.preprocessing_params, with_target, with_profiling)

    ###
    # Shorter accessors to some specific resources
    ###

    def get_pca_resource(self,):
        return self.get_resource('pca', 'pkl')

    def get_texthash_svd_data(self, column):
        res = self.get_resource("texthash_svd", 'pkl')
        if not column in res:
            res[column] = {}
        return res[column]

    def get_impact_coder(self, column):
        res = self.get_resource("impact", 'pkl')
        if not column in res:
            res[column] = self._create_impact_coder(column)
        return res[column]

    @property
    def prediction_type(self,):
        return self.core_params[constants.PREDICTION_TYPE]

    def _load_file(self, relative_filepath):
        return load_relfilepath(self.data_path, relative_filepath)

    def _save_file(self, relative_filepath, obj):
        dkujson.dump(self.open(relative_filepath, 'w'), obj)


    @staticmethod
    def build(core_params, preprocessing_params, data_path, assertions=None):
        """Build the proper type of preprocessing handling depending on the
        preprocessing params"""
        model_type = core_params[constants.PREDICTION_TYPE]
        return PREPROCESSING_HANDLER_TYPE_MAP[model_type](core_params, preprocessing_params, data_path,
                                                          assertions=assertions)

    def save_data(self,):
        self._save_file("collector_data.json", self.collector_data)
        for resource_name in self.__resources.keys():
            self._save_resource(resource_name)

    def preprocessing_steps(self, verbose=True, **kwargs):
        raise NotImplementedError()

    def build_preprocessing_pipeline(self, *args, **kwargs):
        pipeline = PreprocessingPipeline(steps=list(self.preprocessing_steps(*args, **kwargs)))
        pipeline.init_resources(self)
        return pipeline

    @property
    def target_variable(self,):
        return self.core_params.get(constants.TARGET_VARIABLE, None)

    @property
    def prediction_variable(self,):
        return self.core_params.get(constants.PREDICTION_VARIABLE, None)

    @property
    def probas_variables(self,):
        return self.core_params.get(constants.PROBA_COLUMNS, None)

    def _feature_interaction_steps(self, roles_filter):
        logger.info("generating interactions")
        interactions = self.preprocessing_params["feature_generation"]["manual_interactions"]["interactions"]

        def get_type(column_name):
            return self.preprocessing_params["per_feature"][column_name]["type"]

        def is_numeric(column_name):
            return get_type(column_name) == constants.NUMERIC

        num_num = filter(lambda x: is_numeric(x["column_1"]) and is_numeric(x["column_2"]), interactions)
        cat_cat = filter(lambda x: (not is_numeric(x["column_1"])) and not (is_numeric(x["column_2"])), interactions)
        num_cat = filter(lambda x: get_type(x["column_1"]) != get_type(x["column_2"])
                                   and (is_numeric(x["column_1"]) or is_numeric(x["column_2"])), interactions)

        num_block="interaction"

        for interaction in num_num:
            logger.info("generating : %s x %s" %(interaction["column_1"], interaction["column_2"]))
            yield NumericalNumericalInteraction(num_block, interaction["column_1"], interaction["column_2"],
                                                rescale=interaction["rescale"])
        yield FlushDFBuilder(num_block)

        for interaction in num_cat:
            logger.info("generating : %s x %s" %(interaction["column_1"], interaction["column_2"]))
            num, cat = (interaction["column_1"], interaction["column_2"]) if is_numeric(interaction["column_1"]) \
                else (interaction["column_2"], interaction["column_1"])
            out_block = "interaction:%s:%s" % (cat, num)
            yield NumericalCategoricalInteraction(out_block, cat, num,
                                                  interaction["max_features"])
            yield FlushDFBuilder(out_block)

        for interaction in cat_cat:
            logger.info("generating : %s x %s" %(interaction["column_1"], interaction["column_2"]))
            out_block = "interaction:%s:%s" % (interaction["column_1"], interaction["column_2"])
            yield CategoricalCategoricalInteraction(out_block, interaction["column_1"], interaction["column_2"],
                                                    interaction["max_features"])
            yield FlushDFBuilder(out_block)

    def _std_numerical_steps(self, roles_filter):

        def selected_num_features():
            for column_name in self.collector_data["feature_order"]:
                column_params = self.preprocessing_params["per_feature"][column_name]
                if column_params["role"] in roles_filter and column_params["type"] == constants.NUMERIC:
                    yield column_name

        # Numericals. Three main handlings
        #  * "Regular": Imputation + optional derivatives + optional rescaling
        #  * Flag presence
        #  * Binarization: Imputation + binarization
        #  * Binning (with NA bin)
        #
        # Nb: if we create derivative features and have rescaling then
        # the pipeline needs to fit

        numerical_imputer_map = {}
        numerical_imputed_block = "NUM_IMPUTED"
        derivatives_to_generate = []
        rescalers = []
        derivative_rescaler = None
        derivative_block = "NUM_DERIVATIVE"
        column_collectors = self.collector_data["per_feature"]

        # First pass for drop rows. After that, no row can get dropped
        for column_name in selected_num_features():
            column_params = self.preprocessing_params["per_feature"][column_name]
            method = column_params.get(constants.NUMERICAL_HANDLING, None)
            missing_handling_method = column_params.get(constants.MISSING_HANDLING, None)

            if method != "FLAG_PRESENCE" and missing_handling_method == constants.DROP_ROW:
                yield SingleColumnDropNARows(column_name)

        combination_candidates = []
        binarizers = []
        quantizers = []

        for column_name in selected_num_features():
            column_params = self.preprocessing_params["per_feature"][column_name]
            method = column_params.get(constants.NUMERICAL_HANDLING, None)
            missing_handling_method = column_params.get(constants.MISSING_HANDLING, None)

            is_impute = missing_handling_method == constants.IMPUTE
            is_treat_as_regular = missing_handling_method == constants.NONE
            is_droprows = missing_handling_method == constants.DROP_ROW

            column_collector = column_collectors[column_name]

            if method == "REGULAR":
                if is_impute:
                    numerical_imputer_map[column_name] = column_collector["missing_impute_with_value"]
                    combination_candidates.append(column_name)
                elif missing_handling_method == constants.DROP_ROW:
                    numerical_imputer_map[column_name] = None
                    # actually dropping the row will be done
                    # at the end of processing by drop na rows

                if column_params.get(constants.GENERATE_DERIVATIVE, False):
                    derivatives_to_generate.append(column_name)
                if column_params[constants.RESCALING] != "NONE":
                    rescalers.append(get_rescaler(numerical_imputed_block, column_name, column_params, column_collector))

            elif method == "FLAG_PRESENCE":
                yield FlagMissingValue2(column_name, "num_flagonly")
            elif method == "BINARIZE":
                if column_params["binarize_threshold_mode"] == "MEDIAN":
                    thresh = column_collector["stats"]["median"]
                elif column_params["binarize_threshold_mode"] == "MEAN":
                    thresh = column_collector["stats"]["average"]
                else:
                    thresh = column_params["binarize_constant_threshold"]
                if is_impute:
                    numerical_imputer_map[column_name] = column_collector["missing_impute_with_value"]
                    binarizers.append(BinarizeSeries(numerical_imputed_block, column_name, "num_binarized", thresh))
                else:
                    raise Exception("'Impute' is the only supported missing handling method for binarization")

            elif method == "QUANTILE_BIN":
                if is_impute:
                    numerical_imputer_map[column_name] = column_collector["missing_impute_with_value"]
                    # I have NO FUCKING IDEA why this becomes a float ...
                    quantizers.append(QuantileBinSeries(numerical_imputed_block, column_name, "num_quantized",
                                        int(column_params["quantile_bin_nb_bins"])))
                else:
                    raise Exception("'Impute' is the only supported missing handling method for quantile binning")
            elif method == "CUSTOM":
                yield CustomPreprocessingStep(column_name, column_params["customHandlingCode"], column_params["customProcessorWantsMatrix"])
            else:
                raise Exception("Unknown numerical method %s for column %s" % (method, column_name))

        yield MultipleImputeMissingFromInput(numerical_imputer_map, numerical_imputed_block, True, False)
        for proc in rescalers:
            yield proc

        if len(binarizers) > 0:
            for bin in binarizers:
                yield bin
            yield FlushDFBuilder("num_binarized")

        if len(quantizers) > 0:
            for bin in quantizers:
                yield bin
            yield FlushDFBuilder("num_quantized")

        if len(derivatives_to_generate) > 0:
            yield  NumericalDerivativesGenerator(numerical_imputed_block,
                                derivative_block, derivatives_to_generate)
            yield BlockStdRescalingProcessor(derivative_block)

        yield FlushDFBuilder("num_flagonly")

        if self.preprocessing_params["feature_generation"]["pairwise_linear"]["behavior"] == "ENABLED_MANUAL" and len(combination_candidates) >= 2:
            yield PairwiseLinearCombinationsGenerator(numerical_imputed_block, "pw_linear", combination_candidates)
            yield BlockStdRescalingProcessor("pw_linear")
        if self.preprocessing_params["feature_generation"]["polynomial_combinations"]["behavior"] == "ENABLED_MANUAL" and len(combination_candidates) >= 2:
            yield AllInteractionFeaturesGenerator(numerical_imputed_block, "polynomial_interaction", combination_candidates)
            yield BlockStdRescalingProcessor("polynomial_interaction")

    def _std_categorical_steps(self, role_filter):
        # Category handling. One of:
        #  - Flag
        #  - Optional Impute + (Dummify or Impact)

        categorical_imputed_block = "CAT_IMPUTED"
        categorical_imputer_map = {}
        post_impute = []
        column_collectors = self.collector_data["per_feature"]
        flaggers = []

        for column_name in self.collector_data["feature_order"]:
            column_params = self.preprocessing_params["per_feature"][column_name]
            role = column_params["role"]
            column_type = column_params["type"]
            if role not in role_filter or column_type != constants.CATEGORY:
                continue

            column_collector = column_collectors[column_name]

            method = column_params[constants.CATEGORY_HANDLING]
            missing_handling_method = column_params.get(constants.MISSING_HANDLING, None)
            is_impute = missing_handling_method == constants.IMPUTE
            is_treat_as_regular = missing_handling_method == constants.NONE
            is_droprow = missing_handling_method == constants.DROP_ROW

            # The below code is slightly duplicated and could be made more compact
            # but I think it's more readable this way as it matches the behavior of the UI.

            if method == constants.DUMMIFY:
                should_drop = column_params.get("dummy_drop", "NONE") == "DROP"
                vals = column_collector[constants.CATEGORY_POSSIBLE_VALUES]
                if is_impute:
                    impute_val = column_collector["missing_impute_with_value"]
                    if sys.version_info < (3,0) and isinstance(impute_val, unicode):
                        impute_val = impute_val.encode("utf8")
                    categorical_imputer_map[column_name] = impute_val
                    post_impute.append(FastSparseDummifyProcessor(categorical_imputed_block, column_name, vals, should_drop))
                elif is_treat_as_regular:
                    # TODO: Better to impute and just add a value to the possibles ones !!
                    yield FastSparseDummifyProcessor(None, column_name, vals, should_drop)
                elif is_droprow:
                    yield SingleColumnDropNARows(column_name)
                    yield FastSparseDummifyProcessor(None, column_name, vals, should_drop)

            elif method == constants.IMPACT:
                impact_coder = self.get_impact_coder(column_name)
                #impact_coder = self._create_impact_coder(column_name, impact_data)
                out_block = "impact:" + column_name

                if is_impute:
                    categorical_imputer_map[column_name] = column_collector["missing_impute_with_value"]
                    post_impute.append(
                        ImpactCodingStep(categorical_imputed_block, column_name, impact_coder,
                            self.target_variable, out_block))
                elif is_treat_as_regular:
                    categorical_imputer_map[column_name] = "_NA_"
                    post_impute.append(
                        ImpactCodingStep(categorical_imputed_block, column_name, impact_coder,
                            self.target_variable, out_block))
                elif is_droprow:
                    yield SingleColumnDropNARows(column_name)
                    yield ImpactCodingStep(None, column_name, impact_coder, self.target_variable, out_block)

            elif method == "FLAG_PRESENCE":
                flaggers.append(FlagMissingValue2(column_name, "cat_flagpresence"))

            elif method == "HASHING":
                nb_bins_hashing = column_params.get("nb_bins_hashing", 1048576)
                hash_whole_categories = column_params.get("hash_whole_categories", True)
                if is_impute:
                    categorical_imputer_map[column_name] = column_collector["missing_impute_with_value"]
                    post_impute.append(
                        CategoricalFeatureHashingProcessor(categorical_imputed_block, column_name, hash_whole_categories, nb_bins_hashing))
                elif is_treat_as_regular:
                    categorical_imputer_map[column_name] = "_NA_"
                    post_impute.append(
                        CategoricalFeatureHashingProcessor(categorical_imputed_block, column_name, hash_whole_categories, nb_bins_hashing))
                elif is_droprow:
                    yield SingleColumnDropNARows(column_name)
                    yield CategoricalFeatureHashingProcessor(None, column_name, hash_whole_categories, nb_bins_hashing)
            elif method == "CUSTOM":
                yield CustomPreprocessingStep(column_name, column_params["customHandlingCode"], column_params["customProcessorWantsMatrix"])
            else:
                raise ValueError("Category handling method %s is unknown" % method)

        yield MultipleImputeMissingFromInput(categorical_imputer_map, categorical_imputed_block, False, True)
        #yield DumpMFDetails("After IMPUTE CAT")
        for pi in post_impute:
            yield pi

        # We send the flaggers now because there must not be droppers between the flaggers and
        # the flagged block flush
        for flagger in flaggers:
            yield flagger

        yield FlushDFBuilder("cat_flagpresence")

    def _std_text_steps(self, roles_filter):

        for column_name in self.collector_data["feature_order"]:
            column_params = self.preprocessing_params["per_feature"][column_name]
            role = column_params["role"]
            column_type = column_params["type"]
            is_special_feature = column_params.get("isSpecialFeature", False)
            if role not in roles_filter or column_type != constants.TEXT:
                continue

            method = column_params["text_handling"]

            if method == "TOKENIZE_HASHING":
                hash_size = int(column_params.get("hashSize", 200000))
                yield TextHashingVectorizerProcessor(column_name, hash_size)
            elif method == "TOKENIZE_HASHING_SVD":
                hash_size = int(column_params.get("hashSize", 200000))
                svd_limit = int(column_params.get("hashSVDSVDLimit", 50000))
                n_components = int(column_params.get("hashSVDSVDComponents", 100))
                yield TextHashingVectorizerWithSVDProcessor(column_name, self.get_texthash_svd_data("column_name"),
                                                               n_components, hash_size, svd_limit)
            elif method == "TOKENIZE_COUNTS":
                stopwords = self._load_stop_words(column_params, "word_counts.json")
                yield TextCountVectorizerProcessor(column_name,
                        column_params["minRowsRatio"],
                        column_params["maxRowsRatio"],
                        int(column_params["maxWords"]),
                        int(column_params["ngramMinSize"]),
                        int(column_params["ngramMaxSize"]),
                        stopwords,
                        column_params["useCustomVectorizer"] and column_params["customVectorizerCode"] or None)
            elif method == "TOKENIZE_TFIDF":
                stopwords = self._load_stop_words(column_params, "tfidf.json")
                yield TextTFIDFVectorizerProcessor(column_name,
                        column_params["minRowsRatio"],
                        column_params["maxRowsRatio"],
                        int(column_params["maxWords"]),
                        int(column_params["ngramMinSize"]),
                        int(column_params["ngramMaxSize"]),
                        stopwords,
                        column_params["useCustomVectorizer"] and column_params["customVectorizerCode"] or None)
            elif method == "CUSTOM":
                yield CustomPreprocessingStep(column_name, column_params["customHandlingCode"],
                                              column_params["customProcessorWantsMatrix"],
                                              fit_and_process_only_fits=is_special_feature)
            else:
                raise ValueError("Not implemented text method %s" % method)

    def _load_stop_words(self, column_params, vectorizer_data_filename):
        stopwords_mode = column_params.get("stopWordsMode", "NONE")
        if stopwords_mode == "CUSTOM":
            return column_params["customStopWords"].split(" ")
        elif stopwords_mode != "NONE":
            vectorizer_data_path = osp.join(self.data_path, vectorizer_data_filename)
            if os.path.exists(vectorizer_data_path):
                logger.info("Reading stop words for {} in: {}".format(stopwords_mode, vectorizer_data_path))
                # Words saved from a previous training: we are in a saved model
                return dkujson.load_from_filepath(vectorizer_data_path)["stop_words"]
            else:
                stopwords_file_path = osp.join(
                    get_resources_dir(),
                    "nlp", "stopwords_{}.txt".format(stopwords_mode.lower()))
                with open(stopwords_file_path) as f:
                    logger.info("Reading stop words for {} in: {}".format(stopwords_mode, stopwords_file_path))
                    # No "stop_words" file found, we load the reference one: in a training
                    return f.read().splitlines()
        return None

    def _std_vector_steps(self, roles_filter):

        vector_imputer_map = {}
        vector_imputed_block = "VECTOR_IMPUTED"
        vec_steps = []

        for column_name in self.collector_data["feature_order"]:
            column_params = self.preprocessing_params["per_feature"][column_name]
            column_collectors = self.collector_data["per_feature"][column_name]
            role = column_params["role"]
            column_type = column_params["type"]
            if role not in roles_filter or column_type != constants.VECTOR:
                continue

            vec_length = column_collectors["vector_length"]
            method = column_params["vector_handling"]
            missing_handling_method = column_params.get(constants.MISSING_HANDLING, constants.DROP_ROW)
            is_impute = missing_handling_method == constants.IMPUTE

            if missing_handling_method == constants.DROP_ROW:
                yield SingleColumnDropNARows(column_name)

            if method == constants.UNFOLD:
                if is_impute:
                    impute_val = column_collectors["missing_impute_with_value"]
                    if sys.version_info < (3,0) and isinstance(impute_val, unicode):
                        impute_val = impute_val.encode("utf8")
                    vector_imputer_map[column_name] = impute_val
                    vec_steps.append(
                        UnfoldVectorProcessor(column_name, vec_length, in_block=vector_imputed_block)
                    )
                else:
                    vec_steps.append(
                        UnfoldVectorProcessor(column_name, vec_length, in_block=None)
                    )

        # First compute imputes
        yield MultipleImputeMissingFromInput(vector_imputer_map, vector_imputed_block, False, True)

        # Then, treat each Vector step
        for step in vec_steps:
            yield step

    def _std_image_steps(self, roles_filter):

        for column_name in self.collector_data["feature_order"]:
            column_params = self.preprocessing_params["per_feature"][column_name]
            column_collectors = self.collector_data["per_feature"][column_name]
            role = column_params["role"]
            column_type = column_params["type"]
            is_special_feature = column_params.get("isSpecialFeature", False)
            if role not in roles_filter or column_type != constants.IMAGE:
                continue

            method = column_params["image_handling"]
            missing_handling_method = column_params.get(constants.MISSING_HANDLING, constants.DROP_ROW)

            if missing_handling_method == constants.DROP_ROW:
                yield SingleColumnDropNARows(column_name)

            if method == "CUSTOM":
                img_reader = DummyFileReader(column_params["managed_folder_id"])
                yield FileFunctionPreprocessing(column_name, column_params["customHandlingCode"], img_reader,
                                                func_name="preprocess_image",
                                                fit_and_process_only_fits=is_special_feature)
            else:
                raise ValueError("Not implemented image method %s" % method)

    def report(self, pipeline):
        report = {}
        if hasattr(self, "core_params"):
            pipeline.report_fit(report, self.core_params)
        else:
            pipeline.report_fit(report, {})
        dkujson.dump_to_filepath(osp.join(self.data_path, "preprocessing_report.json"), report)


def get_rescaler(in_block, column_name, column_params, column_collector):
    """Build a rescaler for the original column"""
    # TODO Do we really want to use the collector for this?
    rescaling_method = column_params["rescaling"]
    if rescaling_method == constants.MINMAX:
        min_value = column_collector["stats"]["min"]
        max_value = column_collector["stats"]["max"]
        return RescalingProcessor2.from_minmax(in_block, column_name, min_value, max_value)
    else:
        avg_value = column_collector["stats"]["average"]
        std_value = column_collector["stats"]["std"]
        return RescalingProcessor2.from_avgstd(in_block, column_name, avg_value, std_value)


class ClusteringPreprocessingHandler(PreprocessingHandler):
    """
        Build the preprocessing pipeline for clustering projects

        Clustering preprocessing is especially difficult from
        misc reasons, we need to keep track of the multiframe at different
        state of its processing :

        - train
            The model used for clustering performs on
            preprocessed INPUT columns, on which we
            may or may not remove outliers, and may
            or may not apply a PCA.

            * TRAIN

        - profiling
            Columns that are not actually INPUT should still
            be preprocessed (e.g. Dummified) in order to compute
            different statistics on the the different values.
            Such columns have a role called "PROFILING".

            Dataframe preprocessed, (including PROFILING columns)

            * PREPROCESSED

        - feature importance
            Feature importance is done by making a classification on
            the variables.
            In order to have its result human readable, we need
            to do this analysis on prepca values.

            * TRAIN_PREPCA

        - outliers
            The outliers labels is used to make sure we can
            reannotated the initial datasets (for feature importance
            and profiling)

            * OUTLIERS

        """

    def preprocessing_steps(self):
        column_collectors = self.collector_data["per_feature"]

        # First, handle profiling.
        #  - Numericals are kept as-is
        #  - Text is dropped
        #  - Categorical is both kept as-is (for cluster profiles) and dummified (for scatterplot)
        numerical_copier_arr = []
        numerical_copied_block = "NUM_COPIED"

        cat_copier_arr = []
        cat_copied_block = "CAT_COPIED"

        for column_name in self.collector_data["feature_order"]:
            column_params = self.preprocessing_params["per_feature"][column_name]
            role = column_params["role"]

            if role == "PROFILING" or role == "INPUT":
                column_collector = column_collectors[column_name]
                column_type = column_params["type"]

                if column_type == "CATEGORY":
                    cat_copier_arr.append(column_name)
                    if column_params["category_handling"] == "DUMMIFY":
                        vals = column_collector[constants.CATEGORY_POSSIBLE_VALUES]
                        should_drop = column_params.get("dummy_drop", "NONE") == "DROP"
                        yield FastSparseDummifyProcessor(None, column_name, vals, should_drop)

                elif column_type == constants.NUMERIC:
                    numerical_copier_arr.append(column_name)

                else:
                    # Just drop text ...
                    pass

        yield CopyMultipleColumnsFromInput(numerical_copier_arr, numerical_copied_block)
        yield CopyMultipleColumnsFromInput(cat_copier_arr, cat_copied_block)
        yield EmitCurrentMFAsResult("PROFILING")

        yield DumpPipelineState("After create profiling")

        # Then handle the "regular" stuff - here, similar to prediction

        roles_filter = {"INPUT"}

        # Type coercion for all
        # TODO ??

        # Numericals
        for step in self._std_numerical_steps(roles_filter):
            yield step

        # Categories
        for step in self._std_categorical_steps(roles_filter):
            yield step

        # Text
        for step in self._std_text_steps(roles_filter):
            yield step

        # Vector
        for step in self._std_vector_steps(roles_filter):
            yield step

        for step in self._feature_interaction_steps(roles_filter):
            yield step

        yield DumpPipelineState("After std handling")

        # Outliers detection
        kept_variance = self.preprocessing_params['reduce'].get('kept_variance')
        seed = int(self.preprocessing_params.get('preprocessingFitSampleSeed', 1337))
        if kept_variance == 0.0:
            kept_variance = 0.9
        if self.preprocessing_params["outliers"]["method"] != "NONE":
            min_n = self.preprocessing_params['outliers']['min_n']
            min_cum_ratio = self.preprocessing_params['outliers']['min_cum_ratio']
            yield OutlierDetection(
                pca_kept_variance=kept_variance,
                min_n=min_n,
                min_cum_ratio=min_cum_ratio,
                outlier_name='OUTLIERS',
                random_state=seed)

        yield DumpPipelineState("After outliers")

        yield EmitCurrentMFAsResult("TRAIN_PREPCA")

        if self.preprocessing_params["reduce"]["enabled"]:
            pca_res = self.get_pca_resource()
            if 'END_PCA' not in pca_res:
                pca_res['END_PCA'] = PCA(kept_variance=kept_variance, normalize=True)
            yield PCAStep(pca=pca_res['END_PCA'], input_name = 'TRAIN_PREPCA', output_name='TRAIN')
        else:
            yield AddReferenceInOutput("TRAIN_PREPCA", "TRAIN")

        yield DumpPipelineState("After PCA")


class PredictionPreprocessingHandler(PreprocessingHandler):
    def _create_impact_coder(self, feature_name):
        raise NotImplementedError()
    @property
    def target_map(self, with_target=False):
        raise NotImplementedError()

    @property
    def weight_map(self):
        return None

    @property
    def sample_weight_variable(self):
        return self.core_params.get("weight", {}).get("sampleWeightVariable", None)

    @property
    def has_sample_weight_variable(self):
        return (self.core_params.get("weight", {})["weightMethod"] == "SAMPLE_WEIGHT") and \
               (self.core_params.get("weight", {})["sampleWeightVariable"] is not None)

    def set_selection_state_folder(self, selection_state_folder):
        self.selection_state_folder = selection_state_folder

    def preprocessing_steps(self, with_target=False, verbose=True, allow_empty_mf=False, with_prediction=False):
        # Move target away
        if with_target:
            yield RemapValueToOutput(self.target_variable, "target", self.target_map)

        # Move prediction away
        if with_prediction:
            yield RemapValueToOutput(self.prediction_variable, "prediction", self.target_map)
            if self.probas_variables:
                yield OutputRawColumns(self.probas_variables, constants.PROBA_COLUMNS)

        # Set weight apart
        # NB: only for training (not scoring / evaluate) recipes, so only when with_target is true
        if with_target and self.sample_weight_variable is not None:
            yield RemapValueToOutput(self.sample_weight_variable, "weight", self.weight_map)

        if self.assertions:
            yield ExtractMLAssertionMasksNbInitialRows(self.assertions)

        roles_filter = {"INPUT"}

        # Numericals
        for step in self._std_numerical_steps(roles_filter):
            yield step

        # Categories
        for step in self._std_categorical_steps(roles_filter):
            yield step

        # Text
        for step in self._std_text_steps(roles_filter):
            yield step

        # Vector
        for step in self._std_vector_steps(roles_filter):
            yield step

        # Image
        for step in self._std_image_steps(roles_filter):
            yield step


        for step in self._feature_interaction_steps(roles_filter):
            yield step

        logger.info(str(self.preprocessing_params))

        # Set weight apart
        # NB: only for training (not scoring / evaluate) recipes, so only when with_target is true
        if with_target and self.sample_weight_variable is not None:
            yield RealignWeight()

        if with_target:
            yield RealignTarget()
            if self.sample_weight_variable is not None:
                if with_prediction:
                    yield DropRowsWhereNoTargetOrNoWeightOrNoPrediction(allow_empty_mf=allow_empty_mf,
                                                                        has_probas=self.probas_variables)
                else:
                    yield DropRowsWhereNoTargetOrNoWeight(allow_empty_mf=allow_empty_mf)
            else:
                if with_prediction:
                    yield DropRowsWhereNoTargetOrNoPrediction(allow_empty_mf=allow_empty_mf,
                                                              has_probas=self.probas_variables)
                else:
                    yield DropRowsWhereNoTarget(allow_empty_mf=allow_empty_mf)

        # Features selection (output)
        yield DumpPipelineState("Before feature selection")

        # Feature generation experiments
        #yield RandomColumnsGenerator(10)
        #nfcg_settings = {
        #    "behavior" : "ENABLED_MANUAL",
        #    "all_features" : True,
        #    "k" : 5,
        #    "transformation_mode": "DUMMIFY_CLUSTERID" #"REPLACE_BY_DISTANCE"#DUMMIFY_CLUSTERID"#"REPLACE_BY_DISTANCE"
        #}
        #yield NumericalFeaturesClusteringGenerator(self.preprocessing_params, nfcg_settings)
        #cctg_settings = {
        #    "behavior" : "ENABLED_MANUAL",
        #    "all_features" : True
        #}
        #yield CategoricalsCountTransformerGenerator(self.preprocessing_params, cctg_settings)
        #yield DumpMFDetails("After feature generation")

        if "feature_selection_params" in self.preprocessing_params \
                and self.preprocessing_params["feature_selection_params"]["method"] != "NONE":
            logger.info("Performing feature reduction")
            yield FeatureSelectionStep(self.preprocessing_params["feature_selection_params"],
                                       self.core_params["prediction_type"])
        else:
            logger.info("No feature selection to perform")

        # running assertion as last step before emitting to have the last "version" of input_df, i.e. all rows
        # that needed to be dropped have been dropped
        if self.assertions:
            yield ExtractMLAssertionMasks(self.assertions)

        yield EmitCurrentMFAsResult("TRAIN")
        yield DumpPipelineState("At end")


class BinaryClassificationPreprocessingHandler(PredictionPreprocessingHandler):
    @property
    def target_map(self, with_target=False):
        ret = {}
        for tv in self.preprocessing_params["target_remapping"]:
            ret[tv["sourceValue"]] = tv["mappedValue"]
        if len(ret) != 2:
            raise ValueError("This is not a binary classification, found %s classes" % len(ret))
        return ret

    def _create_impact_coder(self, feature_name):
        return CategoricalImpactCoding()

class MulticlassPreprocessingHandler(PredictionPreprocessingHandler):
    @property
    def target_map(self, with_target=False):
        ret = {}
        for tv in self.preprocessing_params["target_remapping"]:
            ret[tv["sourceValue"]] = tv["mappedValue"]
        if len(ret) <= 2:
            raise ValueError("This is not multiclass, found %s classes" % len(ret))
        return ret

    def _create_impact_coder(self, feature_name):
        return CategoricalImpactCoding()


class RegressionPreprocessingHandler(PredictionPreprocessingHandler):
    @property
    def target_map(self, with_target=False):
        return None

    def _create_impact_coder(self, feature_name):
        feature_params = self.preprocessing_params["per_feature"][feature_name]
        rm =  feature_params.get('rescaling', "NONE")
        impact_rescale = (rm is not "NONE")
        impact_scaler = rm
        return ContinuousImpactCoding(rescaling=impact_rescale, scaler=impact_scaler)

PREPROCESSING_HANDLER_TYPE_MAP = {
    constants.BINARY_CLASSIFICATION: BinaryClassificationPreprocessingHandler,
    constants.MULTICLASS: MulticlassPreprocessingHandler,
    constants.REGRESSION: RegressionPreprocessingHandler,

    constants.CLUSTERING : ClusteringPreprocessingHandler
#    "clustering": PredictionPreprocessingHandler
}
