import os, json

class Connector(object):
    """The base interface for a Custom Python connector"""

    def __init__(self, config, plugin_config=None):
        """config is the dict of the configuration of the object"""
        self.config = config
        self.app_config = None
        self.plugin_config = plugin_config

    def get_read_schema(self):
        """
        Returns the schema that this connector generates when returning rows.

        The returned schema may be None if the schema is not known in advance.
        In that case, the dataset schema will be infered from the first rows.

        Additional columns returned by the generate_rows are discarded if and only if
        connector.json contains "strictSchema":true

        The schema must be a dict, with a single key: "columns", containing an array of
        {'name':name, 'type' : type}.

        Example:
            return {"columns" : [ {"name": "col1", "type" : "string"}, {"name" :"col2", "type" : "float"}]}

        Supported types are: string, int, bigint, float, double, date, boolean
        """
        raise Exception("Unimplemented")

    def generate_rows(self, dataset_schema=None, dataset_partitioning=None,
                            partition_id=None, records_limit = -1):
        """
        The main reading method.

        Returns a generator over the rows of the dataset (or partition)
        Each yielded row must be a dictionary, indexed by column name.

        The dataset schema and partitioning are given for information purpose.

        Example:

            from apiLibrary import apiClient
            client = apiClient()  # Connect to API service.
            data = client.get_data()  # Get a list of JSON objects, where each element corresponds to row in dataset.

            for datum in data:
                yield {
                    "col1" : datum["api_json_key1"],
                    "col2" : datum["api_json_key2"]
                }
        """
        raise Exception("Unimplemented")


    def get_writer(self, dataset_schema=None, dataset_partitioning=None,
                         partition_id=None):
        """
        Returns a write object to write in the dataset (or in a partition)

        The dataset_schema given here will match the the rows passed in to the writer.

        Note: the writer is responsible for clearing the partition, if relevant
        """
        raise Exception("Unimplemented")


    def get_partitioning(self):
        """Return the partitioning schema that the connector defines.

        Example:

         return {
            "dimensions": [{
                    "name" : "date",  # Name of column to partition on.
                    "type" : "time",
                    "params" : {"period" : "DAY"}
            }]
        }
        """
        return { "dimensions" : [] }

    def list_partitions(self, partitioning):
        """Return the list of partitions for the partitioning scheme
        passed as parameter"""
        raise Exception("unimplemented: list_partitions")

    def partition_exists(self, partitioning, partition_id):
        """Return whether the partition passed as parameter exists

        Implementation is only required if the corresponding flag is set to True
        in the connector definition
        """
        raise Exception("unimplemented")

    def get_records_count(self, partitioning=None, partition_id=None):
        """
        Returns the count of records for the dataset (or a partition).

        Implementation is only required if the corresponding flag is set to True
        in the connector definition
        """
        raise Exception("unimplemented")

    def get_connector_resource(self):
        """You may create a folder DATA_DIR/plugins/dev/<plugin id>/resource/
        to hold resources useful fo your plugin, e.g. data files;
        this method returns the path of this folder.

        This resource folder is meant to be read-only, and included in the .zip release of your plugin.
        Do not put resources next to the connector.py or recipe.py.
        """
        return os.getenv("DKU_CUSTOM_RESOURCE_FOLDER")


class CustomDatasetWriter(object):
    def __init__(self):
        pass

    def write_row(self, row):
        """Row is a tuple with N + 1 elements matching the schema passed to get_writer.
        The last element is a dict of columns not found in the schema"""
        raise Exception("unimplemented")

    def close(self):
        pass
