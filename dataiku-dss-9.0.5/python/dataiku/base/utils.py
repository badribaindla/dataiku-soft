"""Dataiku utilities"""
import dateutil.relativedelta
import imp
import inspect
import json
import logging
import os
import os.path as osp
import select
import shutil
import tempfile
import threading
import traceback
import random
import string
import sys

from contextlib import contextmanager
from six import reraise


def get_clazz_in_code(code, parent_clazz):
    """
        Gets a class inherinting from parent_clazz by parsing code (as a string)
    """
    with TmpFolder(tempfile.gettempdir()) as temp_folder:
        code_file = osp.join(temp_folder, "dku_code.py")
        with open(code_file, "wb") as f:
            f.write(encode_utf8(code))
        return get_clazz_in_file(code_file, parent_clazz)

def get_clazz_in_file(code_file, parent_clazz):
    """Gets a class inherinting from parent_clazz by reading code_file"""

    mymodule = imp.load_source("dku_nomatter_module_name", code_file)

    clazz = None
    for k in dir(mymodule):
        v = getattr(mymodule, k)
        if inspect.isclass(v):
            if issubclass(v, parent_clazz) and v is not parent_clazz:
                if clazz is not None:
                    raise safe_exception(Exception, u"Multiple classes inheriting {} defined, already had {} and found {}".format(parent_clazz, clazz, v))
                clazz = v
    return clazz


class ErrorMonitoringWrapper:
    """
        Allows to monitor the execution of arbitrary code in order to catch potential errors, format them and dump them
        on a file on the disk, for the backend to retrieve them and display them in the UI.

        To be used in the context of a with statement.

        Can be used when executing (with exec statement) free code from user that needs to run at top level of a script
        (See https://analytics.dataiku.com/projects/RDWIKI/wiki/About%20exec%20in%20python for more info on exec)

        :param exit_if_fail: whether the program should exit if the wrapped code fails. Must be the code number to use
                             when exiting, None if don't want to exit (default is 1)
        :param final_callback: callback to execute after wrapped code ends or fails. Will always be executed except if
                               catch_sysexit is False and there is a system exit in the wrapped code (default None)
        :param error_file: where to dump error information (default is "error.json")
        :param catch_sysexit: whether to catch system exit from wrapped code and finalize execution or exit immediately.
                              Often set to False, because DSS has another mechanism to catch those kinds of errors
                              (default is False)
    """

    def __init__(self, exit_if_fail=1, final_callback=None, error_file="error.json",
                 catch_sysexit=False):
        self.exit_if_fail = exit_if_fail
        self.final_callback = final_callback
        self.error_file = error_file
        self.catch_sysexit = catch_sysexit

    def __enter__(self):
        pass

    def __exit__(self, exc_type, exc_val, exc_tb):

        has_failed = exc_type is not None

        if has_failed:

            if not self.catch_sysexit and exc_type is SystemExit:
                return False

            sys.stderr.write("*************** Recipe code failed **************\n")
            sys.stderr.write("Begin Python stack\n")  # Smart log marker
            traceback.print_exc()
            sys.stderr.write("End Python stack\n")  # Smart log marker

            additional_prefix = u""
            while exc_tb is not None:
                if exc_tb.tb_frame is not None and exc_tb.tb_frame.f_code is not None:
                    if exc_tb.tb_frame.f_code.co_filename == "<string>" and exc_tb.tb_frame.f_code.co_name == "<module>":
                        additional_prefix = u"At line {}: ".format(exc_tb.tb_lineno)
                        break
                exc_tb = exc_tb.tb_next

            with open(self.error_file, "w") as f:
                err = {
                    "detailedMessage": u"{}{}: {}".format(additional_prefix, safe_unicode_str(exc_type), safe_unicode_str(exc_val)),
                    "errorType": safe_unicode_str(exc_type),
                    "message": safe_unicode_str(exc_val)
                }
                f.write(json.dumps(err))

        if callable(self.final_callback):
            self.final_callback()

        if (self.exit_if_fail is not None) and has_failed:
            sys.exit(self.exit_if_fail)

        return True

class RaiseWithTraceback:
    """
        A context manager to chain new exception to stack in case of executed code within the with statement
        raises an exception.

        :param fail_message: message that the new Exception will contain (default '')
        :param add_err_in_message: whether to add the Exception message at the end of the new Exception message
                                  (default True)

        works both for python 2 and 3

        Example (run in python 2):

          with RaiseExceptionWithTracebackIfFail("Bad error"):
            1 / 0

          => raises an: Exception: Bad error, Error: integer division or modulo by zero
             and displays the traceback
    """

    def __init__(self, fail_message='', add_err_in_message=True):
        self.fail_message = fail_message
        self.add_prev_err_in_message = add_err_in_message

    def __enter__(self):
        pass

    def __exit__(self, exc_type, exc_val, exc_tb):
        has_failed = exc_type is not None

        if has_failed:
            if self.add_prev_err_in_message:
                new_error_message = self.fail_message + ", " if self.fail_message else ''
                new_error_message += u"Error: {}".format(safe_unicode_str(exc_val))
            else:
                new_error_message = self.fail_message

            reraise(Exception,
                    safe_exception(Exception, new_error_message),
                    exc_tb)

def watch_stdin():
    """
    Starts a thread which watches stdin and exits the process when it closes
    so as not to survive the parent backend
    """
    def read_stdin():
        try:
            while True:
                # Block in select instead of read so as not to hang sys.exit() on Suse
                (r, w, x) = select.select([sys.stdin], [], [])
                if sys.stdin not in r:
                    # Should not happen
                    continue
                if not sys.stdin.read(1):
                    logging.warning("Standard input closed, exiting")
                    os._exit(0)
        except IOError as e:
            logging.warning("Error reading standard input, exiting", exc_info=True)
            os._exit(1)

    stdin_thread = threading.Thread(name="stdin-watcher", target=read_stdin)
    stdin_thread.daemon = True
    stdin_thread.start()

def check_base_package_version(p, name, min_version, max_version, error_details):
    from distutils.version import LooseVersion
    import warnings
    from dataiku.base import remoterun
    is_in_dss = remoterun.has_env_var("DKU_API_TICKET")

    if max_version is not None and LooseVersion(p.__version__) > LooseVersion(max_version):
        if is_in_dss:
            raise safe_exception(Exception, u"Base package {} is too recent: version {} was found. {}. You should not install overriding versions of DSS base packages.".format(name, p.__version__, error_details))
        else:
            warnings.warn(u"Package {} is too recent: version {} was found. {}. Some features may malfunction.".format(name, p.__version__, error_details), Warning)
    if min_version is not None and LooseVersion(p.__version__) < LooseVersion(min_version):
        if is_in_dss:
            raise safe_exception(Exception, u"Base package {} is too old: version {} was found. {}. You should not install overriding versions of DSS base packages.".format(name, p.__version__, error_details))
        else:
            warnings.warn(u"Package {} is too old: version {} was found. {}. Some features may malfunction.".format(name, p.__version__, error_details), Warning)

def package_is_at_least(p, min_version):
    from distutils.version import LooseVersion
    return LooseVersion(p.__version__) >= LooseVersion(min_version)

def get_json_friendly_error():
    ex_type, ex, tb = sys.exc_info()
    frames = traceback.extract_tb(tb)

    def friendlify(f):
        if isinstance(f, tuple):
            return f
        else:
            # damn you Python3
            return (f.filename, f.lineno, f.name, f.line)

    json_friendly_frames = [friendlify(f) for f in frames]
    return {'errorType': safe_unicode_str(ex_type), 'message': safe_unicode_str(ex), 'traceback': json_friendly_frames}


def safe_unicode_str(o):
    if (isinstance(o, Exception)):
        if (hasattr(o, "desc")):
            # Special case for Spark's AnalysisException which has a "desc" field
            # (but its __str__ is badly formatted so we dont want it)
            return safe_unicode_str(o.desc)
        elif isinstance(o, EnvironmentError) and hasattr(o, "errno") and hasattr(o, "strerror"):
            # Special handling for EnvironmentError because has multiple attributes ('errno', 'strerror')
            # Most common is IOError that has an additional 'filename' attribute
            error_message = u"[Errno {}] {}".format(o.errno, safe_unicode_str(o.strerror))
            if hasattr(o, "filename"):
                error_message += u": '{}'".format(safe_unicode_str(o.filename))
            return error_message
        elif (o.args is None) or (len(o.args) == 0):
            # Exception has no args, try to convert directly the exception to Unicode
            try:
                if sys.version_info > (3,0):
                    return str(o)
                else:
                    return unicode(o)
            except Exception as e:
                return safe_unicode_str('<No details>')
        else:
            return safe_unicode_str(o.args[0])
    else:
        if sys.version_info > (3, 0):
            # Python 3 special handling
            if (isinstance(o, str)):
                return o
            elif (isinstance(o, bytes)):
                try:
                    return smart_decode_str(o)
                except UnicodeDecodeError:
                    return str(o)
            else:
                return str(o)
        else:
            # Python 2 special handling
            if (isinstance(o, unicode)):
                return o
            elif (isinstance(o, str)):
                return smart_decode_str(o)
            else:
                try:
                    return unicode(o)
                except UnicodeDecodeError:
                    # There will be no infinite loop as Python guarantees that 'str(o)' will produce a string
                    return safe_unicode_str(str(o))


def smart_decode_str(o):
    try:
        # Try to decode the string as utf-8 (most common encoding)
        return o.decode('utf-8', 'strict')
    except UnicodeDecodeError:
        try:
            # Try to decode the string as latin1 (second most common encoding)
            return o.decode('iso-8859-1', 'strict')
        except UnicodeDecodeError:
            # We have run out of options. Skip characters that we cannot decode. This call will (in theory) never fail.
            return o.decode('utf-8', 'ignore')


def random_string(length):
    return ''.join(random.choice(string.ascii_letters) for _ in range(length))


class TmpFolder:
    """
        Helper to create temporary folder inside another folder.

        To be used as a with statement:
          - The __enter__ function returns the path of the new folder
          - The temporary folder is deleted when exiting the with statement

        Example:
            import os
            with TmpFolder("/path/to/parent/folder") as tmp_folder_path:
                file_in_folder_path = os.path.join(tmp_folder_path, "new-file.txt")
                with open(file_in_folder_path, 'w') as f:
                    f.write("this is a new file")
                os.rename(file_in_folder_path, "/new/path")

        Args:
            parent_folder (str): path of the folder in which the temporary folder will created. MUST exists
    """

    def __init__(self, parent_folder):
        unique_folder_name = "tmp_folder_{}".format(random_string(8))
        self._folder_path = osp.join(parent_folder, unique_folder_name)
        os.makedirs(self._folder_path)

    def __enter__(self):
        return self._folder_path

    def __exit__(self, exc_type, exc_val, exc_tb):

        if osp.isdir(self._folder_path):
            shutil.rmtree(self._folder_path)


def safe_exception(cls, msg):
    """
    Returns an exception with correct type for message: utf-8 encoded for python2, unicode (str) for python3
    so that is displayed correctly
    """
    major_version = sys.version_info[0]
    if major_version == 2 and isinstance(msg, unicode):
        msg = msg.encode("utf-8")
    return cls(msg)


def encode_utf8(s):
    major_version = sys.version_info[0]
    if major_version == 2 and isinstance(s, unicode):
        return s.encode("utf-8")
    elif major_version > 2 and isinstance(s, str):
        return s.encode("utf-8")
    return s


@contextmanager
def contextualized_thread_name(suffix):
    current_thread = threading.current_thread()
    previous_name = current_thread.name
    current_thread.name = "%s:%s" % (current_thread.name, suffix)
    try:
        yield
    finally:
        current_thread.name = previous_name


def duration_HHMMSS(total_seconds):
    """Convert seconds to a `HH MM SS` string"""
    rd = dateutil.relativedelta.relativedelta(seconds=total_seconds)
    strings = []
    if rd.hours:
        strings.append(str(int(rd.hours)) + "h")
    if rd.minutes:
       strings.append(str(int(rd.minutes)) + "m")
    if int(rd.seconds):
        strings.append(str(int(rd.seconds)) + "s")
    return " ".join(strings)
