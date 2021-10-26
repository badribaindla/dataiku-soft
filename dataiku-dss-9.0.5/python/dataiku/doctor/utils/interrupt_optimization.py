import os

# Handle interruptions of optimization of ML model(s) requested by the user from the UI.
# Current interruptions are:
#   - Stopping grid search after some grid points have been computed (PYTHON backend)
#   - Stopping deep learning training after some epochs (KERAS backend)
# When the user requests an interruption, the backend writes an empty 'stop_search' file inside the run folder
# that is then accessible by the doctor to know whether it should stop its optimization process.
# A callback can be added prior to checking whether the file exists. It is useful to actually retrieve the 'stop_search'
# file from the backend when running the doctor in a container.

interrupt_callback = None
folder_path = None
interrupt_optimization_filename = "stop_search"

def set_before_interrupt_check_callback(new_callback):
    global interrupt_callback
    interrupt_callback = new_callback

def set_interrupt_folder(folder_p):
    global folder_path
    folder_path = folder_p

def _get_interrupt_file_path():
    if folder_path is None:
        raise Exception("You must define the folder path with 'set_interrupt_folder'.")
    return os.path.join(folder_path, interrupt_optimization_filename)

def must_interrupt():
    if interrupt_callback is not None:
        interrupt_callback(_get_interrupt_file_path())
    return (folder_path is not None) and os.path.isfile(_get_interrupt_file_path())

def create_interrupt_file():
    if (folder_path is not None) and (not os.path.exists(_get_interrupt_file_path())):
        open(_get_interrupt_file_path(), 'a').close()
