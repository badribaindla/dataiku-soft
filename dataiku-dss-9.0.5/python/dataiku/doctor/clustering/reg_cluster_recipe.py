# encoding: utf-8
"""
Execute a clustering training recipe in PyRegular mode
Must be called in a Flow environment
"""

from dataiku.doctor.utils import unix_time_millis
from dataiku.doctor.clustering.clustering_fit import *
from dataiku.doctor.utils.split import df_from_split_desc_no_normalization
from dataiku.doctor.preprocessing_handler import *
import dataiku
from dataiku.base.remoterun import read_dku_env_and_set
from dataiku.core import dkujson
from dataiku.doctor.utils.listener import ProgressListener


def main(exec_folder, output_dataset, keptInputColumns):
    start = unix_time_millis()
    listener = ProgressListener()

    split_desc = dkujson.load_from_filepath(osp.join(exec_folder, "_esplit.json"))
    preprocessing_params = dkujson.load_from_filepath(osp.join(exec_folder, "rpreprocessing_params.json"))
    modeling_params = dkujson.load_from_filepath(osp.join(exec_folder, "rmodeling_params.json"))

    with listener.push_step(constants.ProcessingStep.STEP_LOADING_SRC):
        input_df = df_from_split_desc_no_normalization(split_desc, "full", preprocessing_params["per_feature"])
        logging.info("Loaded full df: shape=(%d,%d)" % input_df.shape)
        input_df_orig = input_df.copy()
        input_df = utils.normalize_dataframe(input_df, preprocessing_params["per_feature"])        

    with listener.push_step(constants.ProcessingStep.STEP_COLLECTING_PREPROCESSING_DATA):
        collector = ClusteringPreprocessingDataCollector(input_df, preprocessing_params)
        collector_data = collector.build()

    preproc_handler = ClusteringPreprocessingHandler({}, preprocessing_params, exec_folder)
    preproc_handler.collector_data = collector_data
    pipeline = preproc_handler.build_preprocessing_pipeline()

    with listener.push_step(constants.ProcessingStep.STEP_PREPROCESS_SRC):
        transformed_train = pipeline.fit_and_process(input_df)

    start_train = unix_time_millis()

    (clf, actual_params, cluster_labels, additional_columns) = clustering_fit(modeling_params, transformed_train)

    # if model has custom labels, use them
    try:
        cluster_names = clf.get_cluster_labels()
    except AttributeError:
        cluster_names = ["cluster_%s" % i for i in range(len(np.unique(cluster_labels)))]
    cl = pd.Series(data=cluster_labels, name="cluster_labels").map(lambda i: cluster_names[i])
    cl.index = transformed_train["TRAIN"].index

    final_df = pd.concat([input_df_orig.join(cl, how='left'), additional_columns], axis=1)

    if keptInputColumns is not None:
        final_df = final_df[keptInputColumns + ['cluster_labels']]

    if preprocessing_params["outliers"]["method"] == "CLUSTER":
        final_df['cluster_labels'].fillna(constants.CLUSTER_OUTLIERS, inplace=True)

    dataiku.Dataset(output_dataset).write_from_dataframe(final_df)

    end = unix_time_millis()

    utils.write_done_traininfo(exec_folder, start, start_train, end, listener.to_jsonifiable())

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

    read_dku_env_and_set()
    
    keptInputColumns = None
    if len(sys.argv) > 3 and len(sys.argv[3]) > 0:
        try:
            logging.info("Kept input columns: "+sys.argv[3])
            keptInputColumns = json.loads(sys.argv[3])
        except Exception as e:
            logging.error(e)
            raise Exception("Failed to parse columns to keep, check the logs")

    main(sys.argv[1], sys.argv[2], keptInputColumns)
