class Formatter(object):
    """
    Custom formatter
    """
    def __init__(self, config, plugin_config):
        """
        Instantiate a formatter with the given parameters
        
        :param config: the settings of this formatter instance
        :param plugin_config: the plugin-level settings
        """
        self.config = config
        self.plugin_config = plugin_config
        
    def get_output_formatter(self, stream, schema):
        """
        Return a OutputFormatter for this format
        
        :param stream: the stream to write the formatted data to
        :param schema: the schema of the rows that will be formatted (never None)
        """
        raise NotImplementedError
        
    def get_format_extractor(self, stream, schema=None):
        """
        Return a FormatExtractor for this format
        
        :param stream: the stream to read the formatted data from
        :param schema: the schema of the rows that will be extracted. None when the extractor is used to detect the format.
        """
        raise NotImplementedError


class OutputFormatter(object):
    """
    Writes a stream of rows to a stream in a format. The calls will be:
    
    * write_header()
    * write_row(row_1)  
      ...
    * write_row(row_N)  
    * write_footer()  
    
    """
    def __init__(self, stream):
        """
        Initialize the formatter
        
        :param stream: the stream to write the formatted data to
        """
        self.stream = stream
        
    def write_header(self):
        """
        Write the header of the format (if any)
        """
        pass

    def write_row(self, row):
        """
        Write a row in the format
        
        :param row: array of strings, with one value per column in the schema
        """
        raise NotImplementedError
    
    def write_footer(self):
        """
        Write the footer of the format (if any)
        """
        pass
        

class FormatExtractor(object):
    """
    Reads a stream in a format to a stream of rows
    """
    def __init__(self, stream):
        """
        Initialize the extractor
        
        :param stream: the stream to read the formatted data from
        """
        self.stream = stream
        
    def read_schema(self):
        """
        Get the schema of the data in the stream, if the schema can be known upfront. 

        :returns: the list of columns as [{'name':'col1', 'type':'col1type'},...]
        """
        raise NotImplementedError
    
    def read_row(self):
        """
        Read one row from the formatted stream
        
        :returns: a dict of the data (name, value), or None if reading is finished
        """
        raise NotImplementedError
