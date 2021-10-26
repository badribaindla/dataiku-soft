# encoding: utf-8

"""
Execute a prediction scoring recipe in PyRegular mode
Must be called in a Flow environment
"""

import sys, json, os.path as osp, logging
from six.moves import xrange
from six import iteritems

from dataiku.core.base import PartitionEscaper, is_container_exec
from dataiku.doctor.individual_explainer import DEFAULT_NB_EXPLANATIONS
from dataiku.doctor.individual_explainer import DEFAULT_SHAPLEY_BACKGROUND_SIZE
from dataiku.doctor.individual_explainer import DEFAULT_SUB_CHUNK_SIZE
from dataiku.doctor.posttraining.model_information_handler import PredictionModelInformationHandler
from dataiku.doctor.utils import dku_pickle
from dataiku.doctor.utils import normalize_dataframe
from dataiku.doctor.prediction_entrypoints import *
from dataiku.doctor import utils
from dataiku.doctor.utils.split import get_saved_model_resolved_split_desc
from ..preprocessing_handler import *
from dataiku.core import debugging, default_project_key
from dataiku.core import dkujson as dkujson
from dataiku import Dataset
from dataiku.base.remoterun import read_dku_env_and_set


def load_model(model_folder, core_params, for_eval=False, global_model_assertions_params_list=None):
    modeling_params = dkujson.load_from_filepath(osp.join(model_folder, "rmodeling_params.json"))
    collector_data = dkujson.load_from_filepath(osp.join(model_folder,"collector_data.json"))
    preprocessing_params = dkujson.load_from_filepath(osp.join(model_folder, "rpreprocessing_params.json"))

    assertions_params_list = global_model_assertions_params_list
    if for_eval and global_model_assertions_params_list is None:
        assertions_params_list = _load_assertions_params(model_folder)

    preprocessing_handler = PreprocessingHandler.build(core_params, preprocessing_params, model_folder,
                                                       assertions=assertions_params_list)
    preprocessing_handler.collector_data = collector_data
    pipeline = preprocessing_handler.build_preprocessing_pipeline(with_target=for_eval)
    with open(osp.join(model_folder, "clf.pkl"), "rb") as f:
        clf = dku_pickle.load(f)
    return model_folder, preprocessing_params, clf, pipeline, modeling_params, preprocessing_handler


def _load_assertions_params(model_folder):
    assertions_params_list = None
    assertions_params_filepath = osp.join(model_folder, "rassertions.json")
    if osp.exists(assertions_params_filepath):
        assertions_params_list = dkujson.load_from_filepath(assertions_params_filepath).get("assertions", None)
    return assertions_params_list


def is_partition_dispatch(model_folder):
    return osp.isfile(osp.join(model_folder, "parts.json"))


def load_model_partitions(model_folder, core_params, for_eval=False):
    # Prepare partitioned models if in partition dispatch mode, meaning model_folder is the base mode
    partition_dispatch = is_partition_dispatch(model_folder)
    if partition_dispatch:
        # enforcing assertions params to the one of global model
        global_model_assertions_params_list = _load_assertions_params(model_folder)
        partitions = {}
        for partition, pversion in iteritems(
                dkujson.load_from_filepath(osp.join(model_folder, "parts.json"))["versions"]):
            if is_container_exec():
                pfolder = osp.join(model_folder, "..", "pmodels", PartitionEscaper.escape(partition))
            else:
                pfolder = osp.join(model_folder, "..", "..", "pversions", PartitionEscaper.escape(partition), pversion)
            partitions[partition] = load_model(pfolder, core_params, for_eval=for_eval,
                                               global_model_assertions_params_list=global_model_assertions_params_list)
    else:
        partitions = {"NP": load_model(model_folder, core_params, for_eval=for_eval)}
    return partition_dispatch, partitions


def generate_part_df_and_model_params(input_df, partition_dispatch, core_params, partitions,
                                      raise_if_not_found=False):
    if not partition_dispatch:
        yield (input_df, partitions["NP"])
    else:
        dimension_names = core_params["partitionedModel"]["dimensionNames"]
        for part_value, part_df in input_df.groupby(dimension_names, sort=False):
            partition_id = PartitionEscaper.build_partition_id(part_value)
            if partition_id not in partitions.keys():
                if raise_if_not_found:
                    raise ValueError("Unknown model partition %s" % partition_id)
                else:
                    logging.info("Unknown model partition %s, discarding %s rows" % (partition_id, part_df.shape[0]))
                    continue
            else:
                logging.info("Handling partition '%s'" % partition_id)
                yield (part_df, partitions[partition_id])


def get_input_parameters(model_folder, input_dataset_smartname, preparation_output_schema, script):
    # Obtain a streamed result of the preparation
    input_dataset = Dataset(input_dataset_smartname)
    logging.info("Will do preparation, output schema: %s" % preparation_output_schema)
    input_dataset.set_preparation_steps(script["steps"], preparation_output_schema,
                                        context_project_key=default_project_key())

    # Load common model params
    core_params = dkujson.load_from_filepath(osp.join(model_folder, "core_params.json"))
    # Only using cross-partition safe params: in per_feature[FEATURE_NAME], .type and .role
    feature_preproc = dkujson.load_from_filepath(osp.join(model_folder, "rpreprocessing_params.json"))["per_feature"]

    # Input column infos
    (names, dtypes, parse_date_columns) = Dataset.get_dataframe_schema_st(
        preparation_output_schema["columns"], parse_dates=True, infer_with_pandas=False)
    logging.info("Reading with INITIAL dtypes: %s" % dtypes)

    dtypes = utils.ml_dtypes_from_dss_schema(preparation_output_schema, feature_preproc,
                                             prediction_type=core_params["prediction_type"])
    if is_partition_dispatch(model_folder):
        partition_cols = core_params.get("partitionedModel", {}).get("dimensionNames", [])
        if len(partition_cols) > 0:
            logging.info("Scoring in partition dispatch with partition columns: %s" % partition_cols)
            logging.info("Forcing their dtype to be 'str")
            for partition_col in partition_cols:
                dtypes[partition_col] = "str"

    logging.info("Reading with dtypes: %s" % dtypes)
    for i in xrange(0, len(names)):
        logging.info("Column %s = %s (dtype=%s)" % (i, names[i], dtypes.get(names[i], None)))

    return input_dataset, core_params, feature_preproc, names, dtypes, parse_date_columns


def get_empty_pred_df(input_df_columns, output_dataset_schema):
    """
        Output an empty dataframe with the relevant added columns (proba_classX, predict, cond_output...)

        Output schema of Scoring recipe can vary a lot depending on the parameters of the recipe:
         * prediction type (with proba for probabilistic classif for example)
         * proba percentiles
         * conditional outputs
         * ...

        This logic is handled in the backend when creating the recipe. It's also handled in python depending on
        the code path followed according to the params of the recipe.
        In order not to duplicate the logic in python when needing an empty dataframe, we rely on the backend
        created schema.

        :param list(str) input_df_columns: list of input columns
        :param Schema    output_dataset_schema: Output dataset schema
        :return: empty pd.DataFrame with relevant cols
    """
    output_columns = [out["name"] for out in output_dataset_schema if "name" in out.keys()]
    created_columns = [col for col in output_columns if col not in input_df_columns]
    return pd.DataFrame(columns=created_columns)


def main(model_folder, input_dataset_smartname, output_dataset_smartname, recipe_desc, script,
         preparation_output_schema, cond_outputs = None):

    input_dataset, core_params, feature_preproc, names, dtypes, parse_date_columns = \
        get_input_parameters(model_folder, input_dataset_smartname, preparation_output_schema, script)

    batch_size = recipe_desc.get("pythonBatchSize", 100000)
    logging.info("Scoring with batch size: {}".format(batch_size))
    partition_dispatch, partitions = load_model_partitions(model_folder, core_params)
    output_dataset = Dataset(output_dataset_smartname)

    def output_generator():
        logging.info("Start output generator ...")
        individual_explainer = None
        for input_df in input_dataset.iter_dataframes_forced_types(
                    names, dtypes, parse_date_columns, chunksize=batch_size, float_precision="round_trip"):
            input_df.index = range(input_df.shape[0])
            input_df_orig = input_df.copy()
            logging.info("Got a dataframe : %s" % str(input_df.shape))

            normalize_dataframe(input_df, feature_preproc)
            for col in input_df:
                logging.info("NORMALIZED: %s -> %s" % (col, input_df[col].dtype))

            part_dfs = []
            for part_df, part_params in generate_part_df_and_model_params(input_df, partition_dispatch, core_params,
                                                                          partitions, raise_if_not_found=False):

                model_folder, preprocessing_params, clf, pipeline, modeling_params, preprocessing_handler = part_params

                logging.info("Predicting it")
                if core_params["prediction_type"] == constants.BINARY_CLASSIFICATION:

                    # Computing threshold
                    if recipe_desc["overrideModelSpecifiedThreshold"]:
                        used_threshold = recipe_desc.get("forcedClassifierThreshold")
                    else:
                        used_threshold = dkujson.load_from_filepath(osp.join(model_folder, "user_meta.json")) \
                                                .get("activeClassifierThreshold")

                    pred_df = binary_classification_predict(
                        clf,
                        pipeline,
                        modeling_params,
                        preprocessing_handler.target_map,
                        used_threshold,
                        part_df,
                        output_probas=recipe_desc["outputProbabilities"]).pred_and_proba_df
                    # Probability percentile & Conditional outputs
                    pred_df = binary_classif_scoring_add_percentile_and_cond_outputs(pred_df,
                                                                                     recipe_desc,
                                                                                     model_folder,
                                                                                     cond_outputs,
                                                                                     preprocessing_handler.target_map)
                elif core_params["prediction_type"] == constants.MULTICLASS:
                    pred_df = multiclass_predict(clf, pipeline, modeling_params,
                            preprocessing_handler.target_map, part_df, output_probas=recipe_desc["outputProbabilities"]).pred_and_proba_df
                elif core_params["prediction_type"] == constants.REGRESSION:
                    pred_df = regression_predict(clf, pipeline, modeling_params, part_df)
                else:
                    raise ValueError("bad prediction type %s" % core_params["prediction_type"])
                part_dfs.append(pred_df)

            if partition_dispatch:
                if len(part_dfs) > 0:
                    pred_df = pd.concat(part_dfs, axis=0)
                else:
                    logging.warn("All partitions found in dataset are unknown to "
                                 "the model, all predictions will be empty for this batch")
                    pred_df = get_empty_pred_df(input_df_orig.columns, output_dataset.read_schema())
            else:
                pred_df = part_dfs[0]

            logging.info("Done predicting it")
            # Row level explanations
            if recipe_desc.get("outputExplanations"):
                use_probas = is_proba_aware(modeling_params["algorithm"], clf)
                if partition_dispatch:
                    logging.warn("Could not compute explanations with partition redispatch")
                    pred_df["explanations"] = np.nan
                elif not use_probas:
                    logging.warn("Could not compute explanations with a non-probabilistic model")
                    pred_df["explanations"] = np.nan
                else:
                    individual_explanation_params = recipe_desc.get("individualExplanationParams", {})
                    if individual_explainer is None:
                        split_desc = get_saved_model_resolved_split_desc(model_folder)
                        model_info_handler = PredictionModelInformationHandler(split_desc, core_params,
                                                                               model_folder,
                                                                               model_folder)
                        individual_explainer = model_info_handler.get_explainer()
                        individual_explainer.preload_background(input_df if individual_explanation_params.get("drawInScoredSet", False) else None)
                    logging.info("Starting row level explanations for this batch using {} method".format(
                        individual_explanation_params.get("method")
                    ))

                    nb_explanation = individual_explanation_params.get("nbExplanations", DEFAULT_NB_EXPLANATIONS)
                    method = individual_explanation_params.get("method")
                    shapley_background_size = individual_explanation_params.get("shapleyBackgroundSize",
                                                                                DEFAULT_SHAPLEY_BACKGROUND_SIZE)
                    sub_chunk_size = individual_explanation_params.get("subChunkSize", DEFAULT_SUB_CHUNK_SIZE)
                    explanations, _ = individual_explainer.explain(input_df,
                                                                   nb_explanation,
                                                                   method,
                                                                   sub_chunk_size=sub_chunk_size,
                                                                   shapley_background_size=shapley_background_size)
                    pred_df["explanations"] = individual_explainer.format_explanations(explanations, nb_explanation,
                                                                                       with_json=True)
                    logging.info("Done row level explanations for this batch")

            if recipe_desc.get("filterInputColumns", False):
                clean_kept_columns = [c for c in recipe_desc["keptInputColumns"] if c not in pred_df.columns]
            else:
                clean_kept_columns = [c for c in input_df_orig.columns if c not in pred_df.columns]
            yield pd.concat([input_df_orig[clean_kept_columns], pred_df], axis=1)

    logging.info("Starting writer")
    with output_dataset.get_writer() as writer:
        i = 0
        logging.info("Starting to iterate")
        for output_df in output_generator():
            logging.info("Generator generated a df %s" % str(output_df.shape))
            #if i == 0:
            #    output_dataset.write_schema_from_dataframe(output_df)
            i = i+1
            writer.write_dataframe(output_df)
            logging.info("Output df written")


if __name__ == "__main__":
    debugging.install_handler()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    read_dku_env_and_set()

    main(sys.argv[1], sys.argv[2], sys.argv[3],
          dkujson.load_from_filepath(sys.argv[4]),
          dkujson.load_from_filepath(sys.argv[5]),
          dkujson.load_from_filepath(sys.argv[6]),
          dkujson.load_from_filepath(sys.argv[7]))
