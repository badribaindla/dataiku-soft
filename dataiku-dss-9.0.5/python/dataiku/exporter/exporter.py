import os, json

class Exporter(object):
    """The base interface for a Custom Python exporter"""

    def __init__(self, config, plugin_config):
        """
        :param config: the dict of the configuration of the object
        :param plugin_config: contains the plugin settings
        """
        self.config = config
        self.plugin_config = plugin_config

    def open(self, schema):
        """
        Start exporting. Only called for exporters with behavior MANAGES_OUTPUT
        :param schema: the column names and types of the data that will be streamed
                       in the write_row() calls
        """
        raise Exception("unimplemented")

    def open_to_file(self, schema, destination_file_path):
        """
        Start exporting. Only called for exporters with behavior OUTPUT_TO_FILE
        :param schema: the column names and types of the data that will be streamed
                       in the write_row() calls
        :param destination_file_path: the path where the exported data should be put
        """
        raise Exception("unimplemented")

    def write_row(self, row):
        """
        Handle one row of data to export
        :param row: a tuple with N strings matching the schema passed to open.
        """
        raise Exception("unimplemented")

    def close(self):
        """
        Perform any necessary cleanup
        """
        pass
