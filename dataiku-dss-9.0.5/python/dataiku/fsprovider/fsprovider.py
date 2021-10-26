import os, json

class FSProvider(object):
    """
    The base interface for a Custom FS provider

    :param root: the root path for this provider
    :param config: the dict of the configuration of the object
    :param plugin_config: contains the plugin settings
    """

    def __init__(self, root, config, plugin_config):
        """
        Create a new instance  of this provider
        """
        self.config = config
        self.plugin_config = plugin_config
        self.root = root

    def close(self):
        """
        Perform any necessary cleanup
        """
        pass

    def stat(self, path):
        """
        Get the info about the object at the given path 
        
        :param path: where the object to inspect is located
        :returns: a dict with the fields:
        
                      * 'path' : the location of the object (relative to the root this instance was created with)
                      * 'isDirectory' : True if the object is a folder
                      * 'size' : size of the object in bytes, 0 for folders
                      * 'lastModified' : modification time in ms since epoch, -1 if not defined
                  
                  If there is no object at the given location, return None
        """
        return {"path" : path, "isDirectory" : False, "size" : 125, "lastModified" : 165165133}
        
    def set_last_modified(self, path, last_modified):
        """
        Change the modification time of an object.
        
        :param path: where the object to modify is located.
        :param last_modidied: timestamp as ms since epoch
        :returns: True if the change was done, False if not or if the operation is not supported
        """
        return False
        
    def browse(self, path):
        """
        Enumerate files non-recursively from a path
        
        :param path: what to enumerate
        :returns: a dict with the fields:

                      * 'fullPath' : the path from the root this instance was created with
                      * 'exists' : True if there is something at path
                      * 'directory' : True if the path denotes a folder
                      * 'size' : the size of the file at path; 0 if it's a folder
                  
                  If the object at path is a folder, then there should be a 'children' attribute
                  which is a list of dicts with the same fields (without a 'children' field for subfolders)
        """
        element = {"fullPath" : path, "directory" : True, "exists" : True, "size" : 0}
        children = [] # list of the contants of path, if it's a directory, in the same structure as element  
        element["children"] = children
        return element
        
    def enumerate(self, prefix, first_non_empty):
        """
        Enumerate files recursively from a path.

        :param prefix: where to start the enumeration
        :param first_non_empty: if first_non_empty, stop at the first non-empty file.
        :returns: a list of dicts corresponding to the enumerated files (not folders).
                  Each dict is expected to contain these fields:
 
                      * 'path' : the path relative to the root this instance was created with, 
                      * 'size' : size in bytes
                      * 'lastModified' : modification time in ms since epoch (-1 if not defined)
                  
                  If there is nothing at the prefix, not even empty folders, return None
        """
        return [{'path': prefix, 'size':125, 'lastModified':151131}]
 
    def delete_recursive(self, path):
        """
        Delete recursively 
        
       :param path: path to the folder or file to remove
        """
        return {"path" : path, "isDirectory" : False, "size" : 125, "lastModified" : 165165133}
        
    def move(self, from_path, to_path):
        """
        Move (rename) an object 

        :param from_path: where the data to move is located (relative to the root this instance was created with)
        :param to_path: the target path for the data
        """
        return False
    
    def read(self, path, stream, limit):
        """
        Read data
        
        :param path: where to read the data (relative to the root this instance was created with)
        :param stream: a file-like to write the data into
        :param limit: if not -1, max number of bytes needed. Any more bytes will be discarded by the backend
        """
        pass
    
    def write(self, path, stream):
        """
        Write data
        
        :param path: where to write the data (relative to the root this instance was created with)
        :param stream: a file-like to read the data from
        """
        pass
    
        
                