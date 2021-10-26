# encoding: utf-8

"""
Execute a prediction scoring recipe in Keras mode
Must be called in a Flow environment
"""
import logging
import sys

import dataiku
from dataiku.core import dkujson
from dataiku.doctor.deep_learning.keras_support import scored_dataset_generator
from dataiku.base.remoterun import read_dku_env_and_set

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

def main(model_folder, input_dataset_smartname, output_dataset_smartname, recipe_desc, script,
         preparation_output_schema, cond_outputs=None):

    output_generator = scored_dataset_generator(model_folder, dataiku.Dataset(input_dataset_smartname), recipe_desc, script,
                                                preparation_output_schema, cond_outputs)

    output_dataset = dataiku.Dataset(output_dataset_smartname)
    logging.info("Starting writer")
    with output_dataset.get_writer() as writer:
        i = 0
        logging.info("Starting to iterate")
        for output_dict in output_generator:
            output_df = output_dict["scored"]
            logging.info("Generator generated a df {}".format(str(output_df.shape)))
            i += 1
            writer.write_dataframe(output_df)
            logging.info("Output df written")


if __name__ == "__main__":
    read_dku_env_and_set()

    main(sys.argv[1], sys.argv[2], sys.argv[3],
         dkujson.load_from_filepath(sys.argv[4]),
         dkujson.load_from_filepath(sys.argv[5]),
         dkujson.load_from_filepath(sys.argv[6]),
         dkujson.load_from_filepath(sys.argv[7]))
