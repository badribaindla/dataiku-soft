from dataiku.core import base, flow, metrics, dkuio, default_project_key
from dataiku.base import remoterun
import os.path as osp, os
import json, logging, sys
from dataiku.core.intercom import jek_or_backend_json_call, jek_or_backend_void_call, jek_or_backend_stream_call, backend_json_call, backend_void_call, backend_stream_call

class ManagedFolderWriter:
    active_writers = dict()

    @staticmethod
    def atexit_handler():
        tobeclosed = []
        if sys.version_info > (3,0):
            for k,v in ManagedFolderWriter.active_writers.items():
                print ('WARNING : A folder writer MUST be closed (%s)'%k)
                tobeclosed+=[v]
        else:
            for k in ManagedFolderWriter.active_writers:
                v = ManagedFolderWriter.active_writers[k]
                print ('WARNING : A folder writer MUST be closed (%s)'%k)
                tobeclosed+=[v]
        ManagedFolderWriter.active_writers = dict()
        for v in tobeclosed:
            v.close()

    def __init__(self, project_key, folder_id, path):
        self.project_key = project_key
        self.folder_id = folder_id
        self.path = path
        self.full_name = "%s.%s" % (project_key, folder_id)
        logging.info("Initializing folder writer for folder %s" % (self.full_name))
        if ManagedFolderWriter.active_writers.get(self.full_name):
            raise Exception('Unable to instanciate a new folder writer. There is already another active writer for this folder (%s).' % self.full_name)
        # Register itself as active writer
        ManagedFolderWriter.active_writers[self.full_name]= self
        
        def upload_call(g):
            jek_or_backend_void_call("managed-folders/upload-path", params={
                        "projectKey": self.project_key,
                        "lookup" : self.folder_id,
                        "path" : self.path
                    }, data=g)
        self.piping_thread = dkuio.PipeToGeneratorThread('%s.%s.%s' % (self.project_key, self.folder_id, self.path), upload_call)
    
    def write(self, b):
        self.piping_thread.write(b)

    def close(self):
        if ManagedFolderWriter.active_writers.get(self.full_name) == self:
            del ManagedFolderWriter.active_writers[self.full_name]
        self.piping_thread.close()
        self.piping_thread.wait_for_completion()

    def __enter__(self,):
        return self

    def __exit__(self, type, value, traceback):
        self.close()

def _folder_writer_atexit_handler():
    ManagedFolderWriter.atexit_handler()

class Folder(base.Computable):
    """
    This is a handle to interact with a managed folder.

    Note: this class is also available as ``dataiku.Folder``
    """

    def __init__(self, lookup, project_key=None, ignore_flow=False):
        """Obtain a handle for a named managed folder

        :param str lookup: Name or identifier of the managed folder
        :param str project_key: Project key of the managed folder, if it is not in the current project.
        """
        self.lookup = lookup
        self.path = None
        self.info = None
        self.access_granted = None
        self.partition_infos = {}
        self.ignore_flow = ignore_flow
        self.read_partitions = None
        self.writePartition = None

        if flow.FLOW is not None and ignore_flow == False:
            self._init_data_from_flow(obj_type="Managed folder", project_key=project_key)

        else:
            if "." not in lookup:
                self.project_key = project_key or default_project_key()
                self.short_name = lookup
                self.name = self.project_key + "." + lookup
            else:
                self.project_key = lookup.split(".")[0]
                self.short_name = lookup.split(".")[1]
                self.name = lookup
                #except:
                #    raise Exception("Managed folder %s is specified with a relative name, "
                #                    "but no default project was found. Please use complete name" % id)

    def _repr_html_(self,):
        s = "Folder[   <b>%s</b>   ]" % (self.name)
        return s

    def get_info(self, sensitive_info=False):
        """
        Get information about the location and settings of this managed folder
        :rtype: dict
        """
        if self.info is None:
            self.info = jek_or_backend_json_call("managed-folders/get-info", {
                "projectKey": self.project_key,
                "lookup" : self.short_name,
                "sensitiveInfo" : sensitive_info
            })
        return self.info["info"]

    def get_partition_info(self, partition):
        """
        Get information about the partitions of this managed folder
        :rtype: dict
        """
        self.partition_infos[partition] = jek_or_backend_json_call("managed-folders/get-partition-paths", {
            "projectKey": self.project_key,
            "lookup" : self.short_name,
            "partition" : partition
        })
        return self.partition_infos[partition]["info"]

    def _ensure_and_check_direct_access(self):
        if remoterun._is_running_remotely():
            raise Exception('Python process is running remotely, direct access to folder is not possible')
        elif self.get_info().get("type", None) == 'Filesystem':
            if self.access_granted is None:
                self.access_granted = jek_or_backend_json_call("managed-folders/ensure-direct-access", {
                    "projectKey": self.project_key,
                    "lookup" : self.short_name,
                })
        else:
            raise Exception('Folder is not on the local filesystem (uses %s), cannot perform direct filesystem access. Use the read/write API instead. '%
                 self.get_info().get('type', 'unknown'))

    def get_path(self):
        """
        Gets the filesystem path of this managed folder. This method can only be called for 
        managed folders that are stored on the local filesystem of the DSS server. 

        For non-filesystem managed folders (HDFS, S3, ...), you need to use the various read/download and write/upload 
        APIs.
        """
        self._ensure_and_check_direct_access()
        if 'path' in self.get_info():
            return self.get_info()["path"]
        else:
            raise Exception("Path is not available for this folder storage backend : %s" % self.get_info().get('type', 'unknown'))

    def is_partitioning_directory_based(self):
        """Whether the partitioning of the folder is based on sub-directories"""
        return self.get_info().get("directoryBasedPartitioning", False)

    def list_paths_in_partition(self, partition=''):
        """Gets the filesystem paths of the folder for the given partition (or for the entire folder) """
        return self.get_partition_info(partition)["paths"]

    def list_partitions(self):
        """
        Gets the partitions in the folder
    
        :rtype: list
        """
        return jek_or_backend_json_call("managed-folders/list-partitions", {
            "projectKey": self.project_key,
            "lookup" : self.short_name
        })

    def get_partition_folder(self, partition):
        """Gets the filesystem path of the directory corresponding to the partition (if the partitioning is directory-based) """
        return self.get_partition_info(partition)["folder"]

    def get_id(self):
        return self.get_info()["id"]

    def get_name(self):
        return self.get_info()["name"]

    def file_path(self, filename):
        """
        Gets the filesystem path for a given file within the folder. This method can only be called for 
        managed folders that are stored on the local filesystem of the DSS server. 

        For non-filesystem managed folders (HDFS, S3, ...), you need to use the various read/download and write/upload 
        APIs.

        :param str filename: Name of the file within the folder
        """
        self._ensure_and_check_direct_access()
        root_path = self.get_info().get("path", '')
        if filename is None or len(filename) == 0:
            return root_path
        else:
            if filename[0] == '/':
                clean_filename = filename[1:]
            else:
                clean_filename = filename
            return osp.join(root_path, clean_filename)

    def read_json(self, filename):
        """
        Reads a JSON file within the folder and returns its parsed content

        :param str filename: Path of the file within the folder
        :rtype: list or dict: Depending on the content of the file
        """
        with self.get_download_stream(filename) as f:
            return json.load(f)

    def write_json(self, filename, obj):
        """
        Writes a JSON-serializable (mostly dict or list) object as JSON to a file within the folder

        :param str filename: Path of the target file within the folder
        :param str obj: JSON-serializable object to write (generally dict or list)
        """
        self.upload_data(filename, json.dumps(obj).encode("utf-8"))

    def clear(self):
        """Removes all files from the folder"""
        return self.clear_partition('')
                    
    def clear_partition(self, partition):
        """Removes all files from a specific partition of the folder."""
        return jek_or_backend_void_call("managed-folders/clear-partition", {
                "projectKey": self.project_key,
                "lookup" : self.short_name,
                "partition" : partition
            })
                    
    def clear_path(self, path):
        """DEPRECATED - Use delete_path instead"""
        return self.delete_path(path)

    def delete_path(self, path):
        """Removes a file or directory from the folder"""
        return jek_or_backend_void_call("managed-folders/clear-path", {
            "projectKey": self.project_key,
            "lookup": self.short_name,
            "path": path
        })

    def get_path_details(self, path='/'):
        """
        Get details about a specific path (file or directory) in the folder

        :rtype: dict
        """
        return jek_or_backend_json_call("managed-folders/get-path-details", {
                "projectKey": self.project_key,
                "lookup" : self.short_name,
                "path" : path
            })

    def get_download_stream(self, path):
        """
        Gets a file-like object that allows you to read a single file from this folder.

        .. code-block:: python

            with folder.get_download_stream("myfile") as stream:
                data = stream.readline()
                print("First line of myfile is: {}".format(data))

        :rtype: file-like
        """
        return jek_or_backend_stream_call("managed-folders/download-path", params={
                "projectKey": self.project_key,
                "lookup" : self.short_name,
                "path" : path
            })

    def upload_stream(self, path, f):
        """
        Uploads the content of a file-like object to a specific path in the managed folder.
        If the file already exists, it will be replaced.

        .. code-block:: python

            # This copies a local file to the managed folder
            with open("local_file_to_upload") as f:
                folder.upload_stream("name_of_file_in_folder", f)

        :param str path: Target path of the file to write in the managed folder
        :param f: file-like object open for reading
        """
        return jek_or_backend_void_call("managed-folders/upload-path", params={
                "projectKey": self.project_key,
                "lookup" : self.short_name,
                "path" : path
            }, data=f)

    def upload_file(self, path, file_path):
        """
        Uploads a local file to a specific path in the managed folder.
        If the file already exists, it will be replaced.

        :param str path: Target path of the file to write in the managed folder
        :param file_path: Absolute path to a local file
        """
        with open(file_path, 'rb') as f:
            self.upload_stream(path, f)

    def upload_data(self, path, data):
        """
        Uploads binary data to a specific path in the managed folder.
        If the file already exists, it will be replaced.

        :param str path: Target path of the file to write in the managed folder
        :param data: str or unicode data to upload
        """
        f = dkuio.new_bytesoriented_io(data)
        self.upload_stream(path, f)
        
    def get_writer(self, path):
        """
        Get a writer object to write incrementally to a specific path in the managed folder.
        If the file already exists, it will be replaced.

        :param str path: Target path of the file to write in the managed folder
        """
        return ManagedFolderWriter(self.project_key, self.short_name, path)

    # ################################### Metrics #############################

    def get_last_metric_values(self, partition=''):
        """
        Get the set of last values of the metrics on this folder, as a :class:`dataiku.ComputedMetrics` object
        """
        return metrics.ComputedMetrics(backend_json_call("metrics/managed-folders/get-last-values", data = {
            "projectKey": self.project_key,
            "folderId" : self.get_id(),
        }))

    def get_metric_history(self, metric_lookup, partition=''):
        """
        Get the set of all values a given metric took on this folder
        :param metric_lookup: metric name or unique identifier
        :param partition: optionally, the partition for which the values are to be fetched
        """
        return backend_json_call("metrics/managed-folders/get-metric-history", data = {
            "projectKey": self.project_key,
            "folderId" : self.get_id(),
            "metricLookup" : metric_lookup if isinstance(metric_lookup, str) or isinstance(metric_lookup, unicode) else json.dumps(metric_lookup)
        })

    def save_external_metric_values(self, values_dict):
        """
        Save metrics on this folder. The metrics are saved with the type "external"

        :param values_dict: the values to save, as a dict. The keys of the dict are used as metric names
        """
        return backend_json_call("metrics/managed-folders/save-external-values", data = {
            "projectKey": self.project_key,
            "folderId" : self.get_id(),
            "data" : json.dumps(values_dict)
        }, err_msg="Failed to save external metric values")

    def save_external_check_values(self, values_dict):
        """
        Save checks on this folder. The checks are saved with the type "external"

        :param values_dict: the values to save, as a dict. The keys of the dict are used as check names
        """
        return backend_json_call("checks/managed-folders/save-external-values", data = {
            "projectKey": self.project_key,
            "folderId" : self.get_id(),
            "data" : json.dumps(values_dict)
        }, err_msg="Failed to save external check values")
        