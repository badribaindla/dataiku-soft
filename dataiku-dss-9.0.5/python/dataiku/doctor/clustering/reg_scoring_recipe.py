# encoding: utf-8
"""
Execute a clustering scoring recipe in PyRegular mode
Must be called in a Flow environment
"""

import dataiku
import sys, json, os.path as osp, logging

from dataiku import default_project_key
from dataiku.doctor.utils import unix_time_millis, normalize_dataframe
from dataiku.doctor.prediction_entrypoints import *
from ..preprocessing_handler import *
from dataiku.core import debugging

from dataiku import Dataset
from dataiku.doctor import utils
from dataiku.doctor.utils import dku_pickle
from dataiku.core import dkujson as dkujson
from dataiku.base.remoterun import read_dku_env_and_set

from dataiku.doctor.clustering.clustering_fit import *


def main(model_folder, input_dataset_smartname, output_dataset_smartname, recipe_desc, script, preparation_output_schema):
    input_dataset = dataiku.Dataset(input_dataset_smartname)
    logging.info("Will do preparation, output schema: %s" %preparation_output_schema)
    input_dataset.set_preparation_steps(script["steps"], preparation_output_schema,
                                        context_project_key=default_project_key())

    preprocessing_params = dkujson.load_from_filepath(osp.join(model_folder, "rpreprocessing_params.json"))
    modeling_params = dkujson.load_from_filepath(osp.join(model_folder, "rmodeling_params.json"))
    collector_data = dkujson.load_from_filepath(osp.join(model_folder, "collector_data.json"))

    # Name remapping
    user_meta = dkujson.load_from_filepath(osp.join(model_folder, "user_meta.json"))
    cluster_name_map = {}
    if "clusterMetas" in user_meta:
        logging.info("Cluster metas: %s" % user_meta["clusterMetas"])
        for (cluster_id, cluster_data) in user_meta["clusterMetas"].items():
            cluster_name_map[cluster_id] = cluster_data["name"]

    preprocessing_handler = ClusteringPreprocessingHandler({}, preprocessing_params, model_folder)
    preprocessing_handler.collector_data = collector_data
    pipeline = preprocessing_handler.build_preprocessing_pipeline()

    batch_size = recipe_desc.get("pythonBatchSize", 100000)
    logging.info("Scoring with batch size: {}".format(batch_size))

    with open(osp.join(model_folder, "clusterer.pkl"), "rb") as f:
        clf = dku_pickle.load(f)

    try:
        logging.info("Post-processing model")
        clf.post_process(user_meta)
    except AttributeError:
        # method does not exist if model cannot be post-processed, just pass
        pass

    try:
        custom_labels = clf.get_cluster_labels()

        def map_fun_custom(i):
            name = custom_labels[i]
            return cluster_name_map.get(name, name)

        naming = map_fun_custom
    except AttributeError:
        def map_fun(i):
            name = "cluster_%i" % i
            return cluster_name_map.get(name, name)
        naming = map_fun

    def output_generator():
        logging.info("Start output generator ...")

        (names, dtypes, parse_date_columns) = Dataset.get_dataframe_schema_st(
            preparation_output_schema["columns"], parse_dates=True, infer_with_pandas=False)
        logging.info("Reading with INITIAL dtypes: %s" % dtypes)
        dtypes = utils.ml_dtypes_from_dss_schema(preparation_output_schema, preprocessing_params["per_feature"])
        logging.info("Reading with dtypes: %s" % dtypes)

        for input_df in input_dataset.iter_dataframes_forced_types(
                        names, dtypes, parse_date_columns, chunksize=batch_size):
            input_df.index = range(input_df.shape[0])
            input_df_orig = input_df.copy()
            if recipe_desc.get("filterInputColumns", False):
                input_df_orig = input_df_orig[recipe_desc["keptInputColumns"]]

            logging.info("Got a dataframe : %s" % str(input_df.shape))
            normalize_dataframe(input_df, preprocessing_params['per_feature'])

            for col in input_df:
                logging.info("NORMALIZED: %s -> %s" % (col, input_df[col].dtype))

            logging.info("Processing it")
            transformed = pipeline.process(input_df)

            if transformed["TRAIN"].shape()[0] == 0:
                logging.info("Batch of size {} were dropped by preprocessing".format(input_df_orig.shape[0]))
                final_df = input_df_orig.copy()
                final_df["cluster_labels"] = np.nan
            else:
                logging.info("Applying it")
                (labels_arr, additional_columns) = clustering_predict(modeling_params, clf, transformed)

                cluster_labels = pd.Series(labels_arr, name="cluster_labels").map(naming)
                cluster_labels.index = transformed["TRAIN"].index
                final_df = pd.concat([input_df_orig.join(cluster_labels, how='left'), additional_columns], axis=1)

            if preprocessing_params["outliers"]["method"] == "CLUSTER":
                outliers_cluter_name = cluster_name_map.get(constants.CLUSTER_OUTLIERS, constants.CLUSTER_OUTLIERS)
                final_df['cluster_labels'].fillna(outliers_cluter_name, inplace=True)

            logging.info("Done predicting it")

            yield final_df

    output_dataset = dataiku.Dataset(output_dataset_smartname)
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

    # folder, ism, osm, desc, script, out_schema
    main(sys.argv[1], sys.argv[2], sys.argv[3],
          dkujson.load_from_filepath(sys.argv[4]),
          dkujson.load_from_filepath(sys.argv[5]),
          dkujson.load_from_filepath(sys.argv[6]))
