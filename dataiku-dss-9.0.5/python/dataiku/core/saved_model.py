from dataiku.base.utils import safe_unicode_str, random_string
from dataiku.core import base, flow, metrics, default_project_key
from dataiku.core import dkujson as dkujson
from dataiku.core.base import PartitionEscaper
from dataiku.base import remoterun
import os.path as osp, os
import six

import json
import math

import copy

import sys
import logging
try:
    import cPickle as pickle
except:
    import pickle

try:
    import pandas as pd
except:
    print("Pandas not available, saved models features disabled")

###########################
# IMPORTANT NOTE
# You must NEVER import dataiku.doctor here
# Because this file is imported by "import dataiku"
# and dataiku.doctor imports sklearn
#
# And the tableau plugin fails if sklearn is imported
# (known bug in Tableau SDK)
# So all imports of dataiku.doctor must be inline in functions
###########################

from .dataset import Dataset
from dataiku.core.dkujson import *
from dataiku.core.intercom import backend_json_call, backend_void_call
from dataiku.core import schema_handling
from dataiku.base import remoterun

###########################
# IMPORTANT NOTE
# You must NEVER import dataiku.doctor here
# Because this file is imported by "import dataiku"
# and dataiku.doctor imports sklearn
#
# And the tableau plugin fails if sklearn is imported
# (known bug in Tableau SDK)
# So all imports of dataiku.doctor must be inline in functions
###########################

logger = logging.getLogger(__name__)

class Model(base.Computable):
    """
    This is a handle to interact with a saved model
    """

    def __init__(self, lookup, project_key=None, ignore_flow=False):
        self.lookup = lookup
        self.versions = None
        self.definition = None
        self.info = None
        self._predictors = {}
        self.ignore_flow = ignore_flow
        self.read_partitions = None
        self.writePartition = None

        if flow.FLOW is not None and ignore_flow == False:
            self._init_data_from_flow(obj_type="Saved model", project_key=project_key)
        else:
            if "." not in lookup:
                self.project_key = project_key or default_project_key()
                self.short_name = lookup
                self.name = self.project_key + "." + lookup
            else:
                self.project_key = lookup.split(".")[0]
                self.short_name = lookup.split(".")[1]
                self.name = lookup
                # except:
                #    raise Exception("Managed folder %s is specified with a relative name, "
                #                    "but no default project was found. Please use complete name" % id)

    def _repr_html_(self, ):
        s = "Model[   <b>%s</b>   ]" % (self.name)
        return s

    @staticmethod
    def list_models(project_key=None):
        """
        Retrieve the list of saved models
        
        :param project_key: key of the project from which to list models
        """
        project_key = project_key or default_project_key()
        return backend_json_call("savedmodels/list", data={
            "projectKey": project_key
        })

    def get_info(self):
        if self.info is None:
            self.info = backend_json_call("savedmodels/get-info", data={
                "projectKey": self.project_key,
                "lookup": self.short_name
            })["info"]

        return self.info

    def get_id(self):
        """
        Get the unique identifier of the model
        """
        return self.get_info()["id"]

    def get_name(self):
        """
        Get the name of the model
        """
        return self.get_info()["name"]

    def get_type(self):
        """
        Get the type of the model, prediction or clustering
        """
        return self.get_info()["type"]

    def get_definition(self):
        if self.definition is None:
            self.definition = backend_json_call("savedmodels/get", data={
                "projectKey": self.project_key,
                "savedModelId": self.get_id()
            })

        return self.definition

    def list_versions(self):
        """
        List the versions this saved model contains
        """
        if self.versions is None:
            self.versions = backend_json_call("savedmodels/list-versions", data={
                "projectKey": self.project_key,
                "savedModelId": self.get_id()
            })

        return self.versions

    def activate_version(self, version_id):
        """
        Activate a version in the model
        
        :param version_id: the unique identifier of the version to activate
        """
        backend_void_call("savedmodels/set-active", data={
            "projectKey": self.project_key,
            "smId": self.get_id(),
            "versionId": version_id
        })

    def get_version_metrics(self, version_id):
        """
        Get the training metrics of a version of this model, as a :class:`.SavedModelVersionMetrics`

        :param version_id: the unique identifier of the version for which to retrieve metrics
        """
        return SavedModelVersionMetrics(
            metrics.ComputedMetrics(backend_json_call("metrics/saved-models/get-values-for-version", data={
                "projectKey": self.project_key,
                "modelId": self.get_id(),
                "modelVersionId": version_id
            })), version_id)

    def save_external_check_values(self, values_dict, version_id):
        """
        Save checks on this model. The checks are saved with the type "external"

        :param values_dict: the values to save, as a dict. The keys of the dict are used as check names
        """
        return backend_json_call("checks/saved-models/save-external-values", data = {
            "projectKey": self.project_key,
            "modelId": self.get_id(),
            "modelVersionId": version_id,
            "data" : json.dumps(values_dict)
        }, err_msg="Failed to save external check values")
        
    def get_predictor(self, version_id=None):
        """
        Returns a Predictor for the given version of this Saved Model. If no version is specified, the current active
        version will be used.
        """
        if version_id is None:
            version_id = [x for x in self.list_versions() if x["active"]][0]["versionId"]
        if version_id not in self._predictors:
            res = backend_json_call("savedmodels/get-model-details", data={
                "projectKey": self.project_key,
                "smId": self.get_id(),
                "versionId": version_id
            })
            model_folder = res["model_folder"]
            sm = res["saved_model"]
            if remoterun._is_running_remotely():
                # saved model folder doesn't exist, (try to) fetch it
                from dataiku.container.runner import read_execution, fetch_dir
                execution = read_execution()
                execution_id = execution['id']
                target_model_folder = os.path.join(".", "models", random_string(10))
                logging.info("Retrieve model to %s" % target_model_folder)
                if os.path.exists(target_model_folder):
                    raise Exception("Path %s already exists" % target_model_folder)
                os.makedirs(target_model_folder)
                dkujson.dump_to_filepath(os.path.join(target_model_folder, "_orig.json"), {'modelFolder':model_folder})
                fetch_dir(execution_id, model_folder, dest=target_model_folder, file_kind='FILTERED_PATHS')
                model_folder = target_model_folder
                
            self._predictors[version_id] = build_predictor_for_saved_model(model_folder, self.get_type(), sm.get("conditionalOutputs", []))
        return self._predictors[version_id]


def _generate_features(collector_data, pipeline):
    dat = {}
    for f in collector_data["per_feature"]:
        par = collector_data["per_feature"][f]
        if "category_possible_values" in par and len(par["category_possible_values"]) > 0:
            val = par["category_possible_values"][0]
        elif "stats" in par and "average" in par["stats"]:
            val = par["stats"]["average"]
        elif par.get('is_vector', False):
            val = "[" + ",".join(["0"] * par.get('vector_length', 0)) + "]"
        else:
            val = ""
        dat[f] = [val]
    df = pd.DataFrame(dat)
    return pipeline.process(df)["TRAIN"].columns()


def _renormalize_dates(df, schema, prep):
    from dataiku.doctor.utils import normalize_dataframe
    df = df.copy(deep=False)
    (names, dtypes, parse_dates) = Dataset.get_dataframe_schema_st(schema["columns"], infer_with_pandas=False, bool_as_str=True)
    # For columns for which preparation output schema says date, parse it,
    # because the Pandas CSV parser does not do it
    if parse_dates is not False:
        for col_idx in parse_dates:
            col = schema["columns"][col_idx]["name"]
            if col in df:
                df[col] = pd.to_datetime(df[col])
    return normalize_dataframe(df, prep["per_feature"])

def is_model_prediction(model_type):
    return model_type == "PREDICTION"


class ModelPartitioningInfo:
    def __init__(self, core_params, model_folder):
        self._partitioned = core_params is not None and core_params.get('partitionedModel', {}).get('enabled', False)
        self.partitions_versions = None
        self.part_model_folders = None
        self._is_analysis_base_model = False

        if self._partitioned:
            sm_folder = osp.abspath(osp.join(model_folder, os.pardir, os.pardir))
            
            if osp.isdir(osp.join(model_folder, "parts")):
                # On the API node, only one version for each partition
                # files hierarchy: {sm_id}/parts/{partition_id}/{ model partition files }
                partition_folders = os.listdir(osp.join(model_folder, "parts"))
                self.partition_names = [PartitionEscaper.unescape(part_folder) for part_folder in partition_folders]
                self.core_params = dkujson.load_from_filepath(osp.join(model_folder, "core_params.json"))
                self.part_model_folders = [osp.join(model_folder, "parts", part_folder) for part_folder in
                                           partition_folders]

            elif osp.isdir(osp.join(sm_folder, "pversions")):
                # For saved model, multiple versions for each partition may exist
                # files hierarchy: {sm_id}/pversions/{partition_id}/{version}/{ model partition files }
                self.core_params = dkujson.load_from_filepath(os.path.join(model_folder, "core_params.json"))

                partitions_folder = osp.join(sm_folder, "pversions")
                partitions_versions = dkujson.load_from_filepath(osp.join(model_folder, "parts.json"))["versions"]
                self.partition_names = partitions_versions.keys()

                self.part_model_folders = [
                    osp.join(partitions_folder, PartitionEscaper.escape(part_name), partitions_versions[part_name])
                    for part_name in self.partition_names
                ]

            elif osp.abspath(osp.join(model_folder, os.pardir)).endswith("-base"):  # analysis models
                # For analysis model, the session folder contains all the base model folders and the part model folders
                # base model: {session_id}/pp{x}-base/m1/{ model partition files }
                # part model: {session_id}/pp{x}-part-{partition_id}/m1/{ model partition files }

                self._is_analysis_base_model = True

                pp_folder_prefix = "{}-part-".format(
                    os.path.basename(osp.abspath(osp.join(model_folder, os.pardir))).replace("-base", ""))
                session_folder = osp.abspath(osp.join(model_folder, os.pardir, os.pardir))
                self.core_params = dkujson.load_from_filepath(os.path.join(session_folder, "core_params.json"))
                self.partition_names = []
                self.part_model_folders = []
                for folder_name in os.listdir(session_folder):
                    if not folder_name.startswith(pp_folder_prefix):
                        continue
                    part_model_folder = os.path.join(session_folder, folder_name, "m1")
                    train_info = dkujson.load_from_filepath(os.path.join(part_model_folder, "train_info.json"))
                    if train_info["state"] == "DONE":
                        self.part_model_folders.append(part_model_folder)
                        self.partition_names.append(PartitionEscaper.unescape(folder_name.replace(pp_folder_prefix, "")))

    def is_partitioned(self):
        return self._partitioned

    def is_base_model(self):
        return self.part_model_folders is not None

    def get_preprocessing_folder(self, partitioned_model_folder):
        if self._is_analysis_base_model:
            return os.path.abspath(os.path.join(partitioned_model_folder, os.pardir))
        else:
            return partitioned_model_folder

    def get_resolved_split_desc(self, part_model_folder):
        if self._is_analysis_base_model:
            from dataiku.doctor.utils.split import get_analysis_model_resolved_split_desc
            return get_analysis_model_resolved_split_desc(part_model_folder, True)
        else:
            from dataiku.doctor.utils.split import get_saved_model_resolved_split_desc
            return get_saved_model_resolved_split_desc(part_model_folder)


# saved_model is used to get the conditional outputs
def build_predictor_for_saved_model(model_folder, model_type, conditional_outputs):
    is_prediction = is_model_prediction(model_type)

    if is_prediction:
        core_params = dkujson.load_from_filepath(osp.join(model_folder, "core_params.json"))
    else:
        core_params = None

    from dataiku.doctor.utils.split import get_saved_model_resolved_split_desc
    split_desc = get_saved_model_resolved_split_desc(model_folder)
    return build_predictor(model_type, model_folder, model_folder, conditional_outputs, core_params, split_desc)


def build_predictor(model_type, model_folder, preprocessing_folder, conditional_outputs, core_params, split_desc):

    # Handle base partitioned model
    model_part_info = ModelPartitioningInfo(core_params, model_folder)
    if model_part_info.is_partitioned() and model_part_info.is_base_model():
        return PartitionedModelPredictor(core_params, model_folder, model_type, conditional_outputs, model_part_info)

    is_prediction = is_model_prediction(model_type)

    # import various parameters
    preprocessing_params = dkujson.load_from_filepath(osp.join(preprocessing_folder, "rpreprocessing_params.json"))
    modeling_params = dkujson.load_from_filepath(osp.join(model_folder, "rmodeling_params.json"))
    collector_data = dkujson.load_from_filepath(osp.join(preprocessing_folder, "collector_data.json"))
    user_meta = dkujson.load_from_filepath(osp.join(model_folder, "user_meta.json"))
    resolved_params = dkujson.load_from_filepath(osp.join(model_folder, "actual_params.json"))["resolved"]

    is_keras_backend = modeling_params["algorithm"] == "KERAS_CODE"

    # load model
    if is_keras_backend:
        try:

            # If model was trained on GPU, the prediction will always use GPU as well
            # In order for one model not to take all the GPU capabilities, we force TensorFlow
            # to "allow_growth" on each GPU, i.e. it will take only the required resources
            use_gpu = modeling_params.get("keras", {}).get("useGPU", False)
            from dataiku.doctor.deep_learning import gpu
            if use_gpu:
                gpu.load_gpu_options_only_allow_growth()
            else:
                gpu.deactivate_gpu()

            from dataiku.doctor.deep_learning import keras_model_io_utils
            model_path = osp.join(model_folder, "keras_model.h5")
            model = keras_model_io_utils.load_model(model_path)
        except IOError:
            raise NotImplementedError(
                "Using saved models in python recipes is limited to models trained using the Keras engine")
    else:
        try:
            pkl_path = osp.join(model_folder, "clf.pkl" if is_prediction else "clusterer.pkl")
            with open(pkl_path, "rb") as f:
                clf = pickle.load(f)
                try:
                    logger.info("Post-processing model")
                    clf.post_process(user_meta)
                except AttributeError:
                    pass
                    # method does not exist if model cannot be post-processed, just pass
        except IOError:
            raise NotImplementedError(
                "Using saved models in python recipes is limited to models trained using the python engine")

    # Only prediction has perf.json
    if osp.isfile(osp.join(model_folder, "perf.json")):
        model_perf = dkujson.load_from_filepath(osp.join(model_folder, "perf.json"))
    else:
        model_perf = {}

    if is_prediction:
        cluster_name_map = None
    else:
        cluster_name_map = {}
        if "clusterMetas" in user_meta:
            for cluster_id, cluster_data in user_meta["clusterMetas"].items():
                cluster_name_map[cluster_id] = cluster_data["name"]

    # create preprocessing
    from dataiku.doctor.preprocessing_handler import PreprocessingHandler
    from dataiku.doctor.preprocessing_handler import ClusteringPreprocessingHandler
    if is_prediction:
        preprocessing_handler = PreprocessingHandler.build(core_params, preprocessing_params, preprocessing_folder)
    else:
        preprocessing_handler = ClusteringPreprocessingHandler({}, preprocessing_params, preprocessing_folder)

    preprocessing_handler.collector_data = collector_data

    params = ModelParams(model_type, modeling_params, preprocessing_params, core_params, split_desc, user_meta, model_perf,
                         conditional_outputs, cluster_name_map, model_folder, resolved_params)

    if modeling_params["algorithm"] == "PYTHON_ENSEMBLE":
        return EnsemblePredictor(params, clf)
    else:
        if is_keras_backend:
            from dataiku.doctor.deep_learning.keras_utils import tag_special_features
            per_feature = preprocessing_params["per_feature"]
            tag_special_features(per_feature)
            preprocessing = KerasPreprocessing(preprocessing_handler, modeling_params, per_feature)
            return KerasPredictor(params, preprocessing, model, batch_size=100)
        else:
            preprocessing = Preprocessing(preprocessing_handler, modeling_params)
            features = _generate_features(collector_data, preprocessing.pipeline)
            return Predictor(params, preprocessing, features, clf)


class Preprocessing:
    def __init__(self, preprocessing_handler, modeling_params, with_prediction=False):
        self.pipeline = preprocessing_handler.build_preprocessing_pipeline()
        self.pipeline_with_target = preprocessing_handler.build_preprocessing_pipeline(with_target=True,
                                                                                       allow_empty_mf=True,
                                                                                       with_prediction=with_prediction)
        self.modeling_params = modeling_params
        self.debug_options = {}

    def _transform(self, df, with_target, with_sample_weights):
        if with_target or with_sample_weights:
            pipeline = self.pipeline_with_target
        else:
            pipeline = self.pipeline

        return pipeline.process(df), pipeline

    def _enrich_preprocess(self, preprocessed_result, transformed, with_target, with_sample_weights):
        if with_target:
            target = transformed.get("target", None)
            preprocessed_result = preprocessed_result + (target,)

        if with_sample_weights:
            sample_weights = transformed.get("weight", None)
            preprocessed_result = preprocessed_result + (sample_weights,)

        return preprocessed_result

    def preprocess(self, df, with_target=False, with_sample_weights=False):
        from dataiku.doctor.prediction import prepare_multiframe
        transformed, _ = self._transform(df, with_target, with_sample_weights)
        transformed_train = transformed["TRAIN"]
        input_mf_index = transformed_train.index

        if self.debug_options.get("dumpPreprocessedFirstLine", False) == True:
            fail_na = self.debug_options.get("failOnNADummy", False)
            fail_others = self.debug_options.get("failOnOthersDummy", False)
            features_X_df = transformed_train.as_dataframe()
            logger.info("Dumping first line of preprocessed data")
            for col in features_X_df:
                logger.info("F %s = %s" % (col, features_X_df[col].iloc[0]))

                val = features_X_df[col].iloc[0]
                if val == 1 and fail_na and col.startswith("dummy:") and col.endswith(":N/A"):
                    raise Exception("Unexpected N/A dummy: %s  = %s" % (col, val))
                if val == 1 and fail_others and col.startswith("dummy:") and col.endswith(":__Others__"):
                    raise Exception("Unexpected Others dummy: %s  = %s" % (col, val))

        X = prepare_multiframe(transformed_train, self.modeling_params)[0]
        is_empty = X.shape[0] == 0

        ret = (X, input_mf_index, is_empty)
        ret = self._enrich_preprocess(ret, transformed, with_target, with_sample_weights)
        return ret

class KerasPreprocessing(Preprocessing):

    def __init__(self, preprocessing_handler, modeling_params, per_feature):
        Preprocessing.__init__(self, preprocessing_handler, modeling_params)
        self.per_feature = per_feature

    def preprocess(self, df, with_target=False, with_sample_weights=False):
        from dataiku.doctor.deep_learning.keras_utils import split_train_per_input
        transformed, pipeline = self._transform(df, with_target, with_sample_weights)
        transformed_train = transformed["TRAIN"]
        input_mf_index = transformed_train.index
        is_empty = transformed_train.shape()[0] == 0
        X = split_train_per_input(transformed_train, self.per_feature,
                                  pipeline.generated_features_mapping)

        ret = (X, input_mf_index, is_empty)
        ret = self._enrich_preprocess(ret, transformed, with_target, with_sample_weights)
        return ret


class ModelParams:
    def __init__(self, model_type, modeling_params, preprocessing_params, core_params, split_desc, user_meta, model_perf,
                 conditional_outputs, cluster_name_map, model_folder, resolved_params):
        self.modeling_params = modeling_params
        self.preprocessing_params = preprocessing_params
        self.core_params = core_params
        self.user_meta = user_meta
        self.schema = split_desc["schema"]
        self.split_desc = split_desc
        self.model_perf = model_perf
        self.model_type = model_type
        if preprocessing_params.get("target_remapping", None) is not None:
            self.target_map = {t["mappedValue"]: t["sourceValue"] for t in preprocessing_params["target_remapping"]}
        self.conditional_outputs = conditional_outputs
        self.cluster_name_map = cluster_name_map
        self.model_folder = model_folder
        self.resolved_params = resolved_params


def _add_proba_percentiles(pred_df, model_perf, target_map):
    percentile = pd.Series(model_perf["probaPercentiles"])
    proba_1 = "proba_" + target_map[1]
    pred_df["proba_percentile"] = pred_df[proba_1].apply(
        lambda p: percentile.where(percentile <= p).count() + 1)


def _add_conditional_output(pred_df, co):
    inp = pred_df[co["input"]]
    acc = inp.notnull()  # condition accumulator
    for r in co["rules"]:
        if r["operation"] == 'GT':
            cond = inp > r["operand"]
        elif r["operation"] == 'GE':
            cond = inp >= r["operand"]
        elif r["operation"] == 'LT':
            cond = inp < r["operand"]
        elif r["operation"] == 'LE':
            cond = inp <= r["operand"]
        pred_df.loc[acc & cond, co["name"]] = r["output"]
        acc &= ~cond
    pred_df.loc[acc, co["name"]] = co.get("defaultOutput", None)


class BasePredictor:
    """
    Object allowing to preprocess and make predictions on a dataframe.
    """
    def __init__(self, params, clf):
        self.params = params
        self._clf = clf
        if self.params.conditional_outputs is not None:
            self.conditional_output_names = [co["name"] for co in self.params.conditional_outputs]
        else:
            self.conditional_output_names = []
        if hasattr(self.params, 'target_map'):
            self.classes = [l for (i, l) in sorted([(i, self.params.target_map[i]) for i in self.params.target_map], key=lambda t: t[0])]
        else:
            self.classes = None

        from dataiku.doctor.individual_explainer import IndividualExplainer

        self._individual_explainer = IndividualExplainer(self, self.params.model_folder,
                                                         self.params.split_desc,
                                                         self.params.preprocessing_params["per_feature"],
                                                         self.params.modeling_params.get("algorithm",
                                                                                        None) == "PYTHON_ENSEMBLE",
                                                         self.params.core_params["prediction_type"],
                                                         self.params.core_params["weight"].get(
                                                            "sampleWeightVariable", None))

    def get_classes(self):
        """
        Returns the classes from which this model will predict if a classifier, None if a regressor
        """
        return self.classes

    def get_proba_columns(self):
        """
        Returns the names of the probability columns if a classifier, None if a regressor
        """
        if self.classes is None:
            return None
        else:
            return ["proba_%s" % c for c in self.classes]

    def get_conditional_output_names(self):
        """
        Returns the name of all conditional outputs defined for this model (note: limited to binary classifiers)
        """
        return self.conditional_output_names

    def preload_explanations_background(self, df=None):
        """
        Preload the background rows to compute explanations
        :param df: data from which the random sample have to be drawn
        :type df: pd.DataFrame
        """
        self._check_can_compute_explanations()
        self._individual_explainer.preload_background(df)

    @staticmethod
    def _check_can_compute_explanations():
        pass

    def _predict_raw(self, X):
        return self._clf.predict(X)

    def _predict_raw_proba(self, X):
        target_map = self.params.preprocessing_params.get("target_remapping")
        probas = self._clf.predict_proba(X)
        # Need to make sure that the dimension of the probas match the number of classes in the train before PP
        (nb_rows, nb_present_classes) = probas.shape
        remapped_probas = np.zeros((nb_rows, len(target_map)))
        for j in range(nb_present_classes):
            actual_class_id = self._clf.classes_[j]
            remapped_probas[:, actual_class_id] = probas[:, j]
        return remapped_probas

    def _set_debug_options(self, debug_options):
        raise NotImplementedError()

    def _compute_explanations(self, df, method, n_explanations, mc_steps):
        if not self._individual_explainer.is_background_loaded():
            self.preload_explanations_background()

        explanations_df, _ = self._individual_explainer.explain(df, n_explanations, method,
                                                                shapley_background_size=mc_steps)

        explanations_df = self._individual_explainer.format_explanations(explanations_df, n_explanations)
        explanations_df.columns = [u"explanations_{}".format(safe_unicode_str(col)) for col in explanations_df.columns]
        return explanations_df
    

class Predictor(BasePredictor):
    """
    Object allowing to preprocess and make predictions on a dataframe.
    """
    def __init__(self, params, preprocessing, features, clf):
        BasePredictor.__init__(self, params, clf)
        self.preprocessing = preprocessing
        self.features = features
        self.debug_options = {}


    def _get_prediction_dataframe(self, input_df, with_prediction, with_probas,
                                  with_conditional_outputs, with_proba_percentile):
        if self.params.model_type == "PREDICTION":
            pred_df = self._prediction_type_dataframe(input_df, with_prediction, with_probas)
            self._add_percentiles_and_condoutputs(pred_df, with_proba_percentile, with_conditional_outputs)
            return pred_df
        else:
            if not with_prediction:
                raise ValueError("Predicting a clustering model with with_prediction=False. Oops.")
            return self._clustering_type_dataframe(input_df)

    def _add_percentiles_and_condoutputs(self, pred_df, with_proba_percentile, with_conditional_outputs):

        # Only compute percentiles and conditional outputs if there are actual predictions
        if pred_df.shape[0] == 0:
            return

        # percentiles and conditional outputs if applicable
        if "probaPercentiles" in self.params.model_perf and self.params.model_perf["probaPercentiles"] \
                and with_proba_percentile:
            _add_proba_percentiles(pred_df, self.params.model_perf, self.params.target_map)
        if with_conditional_outputs and self.params.conditional_outputs is not None:
            for co in self.params.conditional_outputs:
                _add_conditional_output(pred_df, co)

    def _prediction_type_dataframe(self, input_df, with_prediction, with_probas):
        X, input_mf_index, is_empty = self.preprocessing.preprocess(input_df)
        if is_empty:
            # special case for all empty scoring data : scikit-learn models reject them
            pred_df = pd.DataFrame(columns=["prediction"], index=input_df.index)
            return pred_df

        return self._predict_preprocessed(X, input_mf_index, with_prediction, with_probas)

    def _predict_preprocessed(self, X, input_mf_index, with_prediction, with_probas):
        prediction_type = self.params.core_params["prediction_type"]
        if prediction_type == "REGRESSION":
            if with_prediction:
                pred_df = pd.DataFrame({"prediction": self._clf.predict(X).flatten()})
            else:
                raise ValueError("Predicting a regression model with with_prediction=False. Oops.")
        else:
            proba_df = None
            try:
                probas = self._predict_raw_proba(X)
                if prediction_type == "BINARY_CLASSIFICATION":
                    threshold = self.params.user_meta.get("activeClassifierThreshold", 0.5)
                    pred_raw = (probas[:, 1] > threshold).astype(int)
                else:
                    pred_raw = self._predict_raw(X)
                if with_probas and self.classes is not None:
                    proba_columns = self.get_proba_columns()
                    proba_df = pd.DataFrame(data=probas, columns=proba_columns)
            except AttributeError:
                pred_raw = self._clf.predict(X)
            pred_df = pd.DataFrame({"prediction": pd.Series(pred_raw).map(self.params.target_map)})
            if proba_df is not None:
                pred_df = pd.concat([pred_df, proba_df], axis=1)

        # put back the original index (ie account for dropped rows)
        pred_df.index = input_mf_index
        return pred_df

    def _clustering_type_dataframe(self, input_df):
        from dataiku.doctor.clustering.clustering_fit import clustering_predict
        from dataiku.doctor import constants
        try:
            custom_labels = self._clf.get_cluster_labels()

            def map_fun_custom(i):
                name = custom_labels[i]
                return self.params.cluster_name_map.get(name, name)

            naming = map_fun_custom
        except AttributeError:
            def map_fun(i):
                name = "cluster_%i" % i
                return self.params.cluster_name_map.get(name, name)

            naming = map_fun
        transformed = self.preprocessing.pipeline.process(input_df)
        labels_arr, additional_columns = clustering_predict(self.params.modeling_params, self._clf, transformed)
        cluster_labels = pd.Series(labels_arr, name="cluster_labels").map(naming)
        cluster_labels.index = transformed["TRAIN"].index
        labels_df = pd.DataFrame({"cluster": cluster_labels}).reindex(input_df.index)
        result = pd.concat([labels_df, additional_columns], axis=1)
        if self.params.preprocessing_params["outliers"]["method"] == "CLUSTER":
            outlier_name = self.params.cluster_name_map.get(constants.CLUSTER_OUTLIERS, constants.CLUSTER_OUTLIERS)
            result['cluster'].fillna(outlier_name, inplace=True)
        return result

    def get_features(self):
        """
        Returns the feature names generated by this predictor's preprocessing
        """
        return self.features

    def predict(self, df, with_input_cols=False, with_prediction=True, with_probas=True, with_conditional_outputs=False,
                with_proba_percentile=False, with_explanations=False,
                explanation_method="ICE",
                n_explanations=3,
                n_explanations_mc_steps=100):
        """
        Predict a dataframe.
        The results are returned as a dataframe with columns corresponding to the various prediction information.

        :param with_input_cols: whether the input columns should also be present in the output
        :param with_prediction: whether the prediction column should be present
        :param with_probas: whether the probability columns should be present
        :param with_conditional_outputs: whether the conditional outputs for this model should be present (binary classif)
        :param with_proba_percentile: whether the percentile of the probability should be present (binary classif)
        :param with_explanations: whether explanations should be computed for each prediction
        :param explanation_method: method to compute the explanations
        :param n_explanations: number of explanations to output for each prediction
        :param n_explanations_mc_steps: number of Monte Carlo steps for SHAPLEY method (higher means more precise but slower)
        """
        if with_explanations:
            self._check_can_compute_explanations()

        dates_ok_df = _renormalize_dates(df, self.params.schema, self.params.preprocessing_params)
        per_feature_params = self.params.preprocessing_params["per_feature"]
        # don't cast to integer types, because astype() will fail on NaN, instead behave like ml_dtype_from_dss_column()
        types_map = {
                        'int': np.float64,
                        'bigint': np.float64,
                        'float': np.float64,
                        'double': np.float64,
                        'boolean': np.bool
                    }

        column_types = {}
        for c in self.params.schema['columns']:
            if c['name'] in df.columns:
                t = str(c['type'])
                # cast boolean features to string so that dummyfication works properly
                if t == 'boolean':
                    t = 'string'
                elif t == 'date':
                    t = 'bigint'
                column_types[six.text_type(c['name'])] = types_map[t] if t in types_map else t

        # replace "string" by np.object because astype behaves differently for both
        # also replace any type by np.object for categorical variables, otherwise this will break the dummyfier
        for k in column_types:
            if column_types[k] in {"string", "str"} or per_feature_params[k]["type"] == "CATEGORY":
                column_types[k] = np.object
        final_df = dates_ok_df.astype(column_types)
        pred_df = self._get_prediction_dataframe(final_df, with_prediction, with_probas, with_conditional_outputs,
                                                 with_proba_percentile)

        results = []
        if with_input_cols:
            results.append(df)
        results.append(pred_df)
        if with_explanations:
            explanations_df = self._compute_explanations(final_df, explanation_method,
                                                         n_explanations, n_explanations_mc_steps)
            results.append(explanations_df)

        return pd.concat(results, axis=1)

    def preprocess(self, df):
        """
        Preprocess a dataframe.
        The results are returned as a numpy 2-dimensional matrix (which may be sparse). The columns of this matrix
        correspond to the generated features, which can be listed by the `get_features` property of this Predictor.
        """
        return self.preprocessing.preprocess(df)

    def get_preprocessing(self):
        return self.preprocessing

    def _set_debug_options(self, debug_options):
        self.preprocessing.debug_options = debug_options

class KerasPredictor(Predictor):

    def __init__(self, params, preprocessing, model, batch_size=100):
        Predictor.__init__(self, params, preprocessing, None, clf=model)
        self.batch_size = batch_size

    def _predict_raw(self, X):
        prediction_type = self.params.core_params["prediction_type"]

        if prediction_type in ["MULTICLASS", "BINARY_CLASSIFICATION"]:
            return np.argmax(self._predict_raw_proba(X), axis=1)
        else:
            pred_raw = self._clf.predict(X)
            return np.squeeze(pred_raw, axis=1)

    def _predict_raw_proba(self, X):
        prediction_type = self.params.core_params["prediction_type"]
        if prediction_type == "MULTICLASS":
            return self._clf.predict(X)
        elif prediction_type == "BINARY_CLASSIFICATION":
            if not self.params.resolved_params["keras"]["oneDimensionalOutput"]:
                return self._clf.predict(X)
            else:
                probas_one = np.squeeze(self._clf.predict(X), axis=1)
                probas = np.zeros((probas_one.shape[0], 2))
                probas[:, 0] = 1 - probas_one
                probas[:, 1] = probas_one
                return probas
        else:
            raise AttributeError("Predict proba is not implemented for Regression problems.")

    def _get_prediction_dataframe(self, input_df, with_prediction, with_probas,
                                  with_conditional_outputs, with_proba_percentile):
        if self.params.model_type == "PREDICTION":

            pred_df_list = []
            num_rows = input_df.shape[0]
            nb_batches = int(math.ceil(num_rows  * 1.0 / self.batch_size))

            for num_batch in range(nb_batches):

                input_df_batch = input_df.iloc[num_batch * self.batch_size : (num_batch + 1) * self.batch_size, :]
                pred_df_list.append(self._prediction_type_dataframe(input_df_batch, with_prediction, with_probas))

            pred_df = pd.concat(pred_df_list)
            self._add_percentiles_and_condoutputs(pred_df, with_proba_percentile, with_conditional_outputs)
            return pred_df

        else:
            raise ValueError("Clustering problems are not implemented with Keras Backend.")

    @staticmethod
    def _check_can_compute_explanations():
        raise ValueError("Models built with Keras are not compatible with explanations")

class PartitionedModelPredictor(BasePredictor):

    def __init__(self, core_params, model_folder, model_type, conditional_outputs, model_part_info):
        self.conditional_outputs = conditional_outputs
        self.model_type = model_type
        self.model_folder = model_folder
        self.core_params = core_params

        self.predictors = {}
        self.any_predictor = None
        self.params = None
        self.partition = None

        self.model_part_info = model_part_info

        self._build_predictors()

    def _build_predictors(self):
        # /!\ Does not support container exec

        for part_name, part_model_folder in zip(self.model_part_info.partition_names,
                                                self.model_part_info.part_model_folders):

            part_pp_folder = self.model_part_info.get_preprocessing_folder(part_model_folder)
            split_desc = self.model_part_info.get_resolved_split_desc(part_model_folder)

            predictor = build_predictor(self.model_type, part_model_folder, part_pp_folder,
                                        self.conditional_outputs,  self.model_part_info.core_params, split_desc)
            self._set_predictor(part_name, predictor)

    def _set_predictor(self, partition_name, predictor):
        self.predictors[partition_name] = predictor

        if self.params is None and predictor.params.preprocessing_params is not None:
            self.params = copy.deepcopy(self.predictors[partition_name].params)

        if self.any_predictor is None:
            self.any_predictor = predictor

    def get_classes(self):
        return self.any_predictor.get_classes()

    def get_proba_columns(self):
        return self.any_predictor.get_proba_columns()

    def get_conditional_output_names(self):
        return self.any_predictor.get_conditional_output_names()

    def _predict_raw(self, X):
        raise NotImplementedError("Partitioned models do not support _predict_raw()")

    def _predict_raw_proba(self, X):
        raise NotImplementedError("Partitioned models do not support _predict_raw_proba()")

    def set_partition(self, partition):
        self.partition = partition

    def _predict_partition(self, df, partition_id, with_input_cols, with_prediction, with_probas,
                           with_conditional_outputs, with_proba_percentile, with_explanations,
                           explanation_method, n_explanations, n_explanations_mc_steps):
        predictor = self.predictors.get(partition_id, None)
        if predictor is not None:
            return predictor.predict(df, with_input_cols, with_prediction, with_probas,
                                     with_conditional_outputs, with_proba_percentile, with_explanations,
                                     explanation_method, n_explanations, n_explanations_mc_steps)
        elif with_input_cols:
            return df
        else:
            return pd.DataFrame()

    def predict(self, df, with_input_cols=False, with_prediction=True, with_probas=True, with_conditional_outputs=False,
                with_proba_percentile=False, with_explanations=False, explanation_method="ICE",
                n_explanations=3, n_explanations_mc_steps=100):

        if self.partition is not None:
            return self._predict_partition(df, self.partition, with_input_cols, with_prediction, with_probas,
                                           with_conditional_outputs, with_proba_percentile, with_explanations,
                                           explanation_method, n_explanations, n_explanations_mc_steps)
        origin_index = df.index.copy()

        dimension_names = self.params.core_params["partitionedModel"]["dimensionNames"]

        part_dfs = []
        for partition, part_df in df.groupby(dimension_names, sort=False):
            partition_id = PartitionEscaper.build_partition_id(partition)
            part_dfs.append(self._predict_partition(part_df, partition_id, with_input_cols, with_prediction,
                                                    with_probas, with_conditional_outputs, with_proba_percentile,
                                                    with_explanations, explanation_method, n_explanations,
                                                    n_explanations_mc_steps))

        pred_df = pd.concat(part_dfs, axis=0, sort=False)
        origin_index = origin_index[np.isin(origin_index, pred_df.index)]  # remove index dropped by PP
        return pred_df.reindex(origin_index)

    def _set_debug_options(self, debug_options):
        for predictor in self.predictors.values():
            predictor._set_debug_options(debug_options)

    def preload_explanations_background(self, df=None):
        if self.partition is not None:
            self._get_explainer(self.partition).preload_background(df)
        else:
            dimension_names = self.params.core_params["partitionedModel"]["dimensionNames"]
            if df is not None:
                partitions = df.groupby(dimension_names, sort=False)
            else:
                partitions = [(part_name, None) for part_name in self.predictors.keys()]

            for part_name, part_df in partitions:
                partition_id = PartitionEscaper.build_partition_id(part_name)
                self._get_explainer(partition_id).preload_background(part_df)
                logger.info("Explanations background for partition '{}' successfully loaded".format(partition_id))

    def _compute_explanations(self, df, method, n_explanations, mc_steps):
        if self.partition is not None:
            return self._get_predictor(self.partition)._compute_explanations(df, method, n_explanations,
                                                                             mc_steps)
        else:
            explanations_dfs = []

            dimension_names = self.params.core_params["partitionedModel"]["dimensionNames"]
            for partition, part_df in df.groupby(dimension_names, sort=False):
                partition_id = PartitionEscaper.build_partition_id(partition)
                explanations_dfs.append(self._get_predictor(partition_id)._compute_explanations(df, method,
                                                                                                n_explanations,
                                                                                                mc_steps))

        return pd.concat(explanations_dfs, axis=0)

    def _get_explainer(self, partition_id):
        return self._get_predictor(partition_id)._individual_explainer

    def _get_predictor(self, partition_id):
        """
        :rtype: Predictor
        """
        predictor = self.predictors.get(partition_id, None)
        if predictor is None:
            raise ValueError("The model for partition {} does not exist".format(partition_id))
        return predictor


class EnsemblePredictor(BasePredictor):
    """
    A predictor for Ensemble models.
    Unlike regular models, they do not have a preprocessing and do not have feature names
    (various models use different features and preprocessings).
    Attempted calls to preprocess, get_preprocessing and get_features will therefore raise an AttributeError
    """
    def __init__(self, params, clf):
        BasePredictor.__init__(self, params, clf)

    def get_prediction_dataframe(self, input_df, with_prediction, with_probas,
                                 with_conditional_outputs, with_proba_percentile):
        prediction_type = self.params.core_params["prediction_type"]
        if prediction_type == "REGRESSION":
            pred_df = pd.DataFrame({"prediction": self._clf.predict(input_df)})
        else:
            probas = self._clf.predict_proba(input_df)
            if probas.size == 0:
                return pd.DataFrame(columns=["prediction"], index=input_df.index)
            proba_columns = self.get_proba_columns()
            proba_df = pd.DataFrame(data=probas, columns=proba_columns)
            pred_df = None
            if prediction_type == "BINARY_CLASSIFICATION":
                threshold = self.params.user_meta.get("activeClassifierThreshold", 0.5)
                pred_raw = (probas[:, 1] > threshold).astype(int)
            else:
                pred_raw = self._clf.predict(input_df)
            if with_prediction:
                pred_df = pd.DataFrame({"prediction": pd.Series(pred_raw).map(self.params.target_map)})
            if with_probas or with_proba_percentile or with_conditional_outputs:
                pred_df = pd.concat([pred_df, proba_df], axis=1) if pred_df is not None else proba_df
            # percentiles and conditional outputs if applicable
            if with_proba_percentile and "probaPercentiles" in self.params.model_perf and self.params.model_perf["probaPercentiles"]:
                _add_proba_percentiles(pred_df, self.params.model_perf, self.params.target_map)
            if with_conditional_outputs and self.params.conditional_outputs is not None:
                for co in self.params.conditional_outputs:
                    _add_conditional_output(pred_df, co)

        if input_df.index.size != 0:
            pred_df.index = input_df.index
        return pred_df

    def predict(self, df, with_input_cols=False, with_prediction=True, with_probas=True, with_conditional_outputs=False,
                with_proba_percentile=False, with_explanations=False,
                explanation_method="ICE",
                n_explanations=3,
                n_explanations_mc_steps=100):
        """
        Predict a dataframe.
        The results are returned as a dataframe with prediction columns added.
        """
        pred_df = self.get_prediction_dataframe(df, with_prediction, with_probas, with_conditional_outputs, with_proba_percentile)

        results = []
        if with_input_cols:
            results.append(df)
        results.append(pred_df)
        if with_explanations:
            explanations_df = self._compute_explanations(df, explanation_method,
                                                         n_explanations, n_explanations_mc_steps)
            results.append(explanations_df)

        return pd.concat(results, axis=1)

    def _set_debug_options(self, debug_options):
        if debug_options.get("dumpPreprocessedFirstLine", False):
            logger.warn("Preprocessing advanced debugging options are not available for ensembling models")


class SavedModelVersionMetrics(object):
    """
    Handle to the metrics of a version of a saved model
    """

    def __init__(self, metrics, version_id):
        self.metrics = metrics
        self.version_id = version_id

    def get_performance_values(self):
        """
        Retrieve the metrics as a dict
        """
        ret = {}
        for metric_id in self.metrics.get_all_ids():
            if metric_id.startswith("model_perf:"):
                data = self.metrics.get_partition_data_for_version(metric_id, self.version_id)
                clean_id = metric_id.replace("model_perf:", "")
                ret[clean_id] = metrics.ComputedMetrics.get_value_from_data(data)
        return ret

    def get_computed(self):
        return self.metrics
