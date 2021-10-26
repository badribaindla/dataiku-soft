# Dummy helper to share variables between different part of user written code. In particular, it allows
# the user to share variables between preprocessing and model, for example to access pre-trained matrix_weights
# of an embedding

_shared_data_dict = {}

def set_variable(name, value, override=True):

    if exist_variable(name) and not override:
        raise ValueError("The key {} is already used in shared variables, please select another key".format(name))

    _shared_data_dict[name] = value

def get_variable(name):

    if not exist_variable(name):
        raise ValueError("The key {} does not exist in shared variables".format(name))

    return _shared_data_dict[name]

def exist_variable(name):

    return name in _shared_data_dict.keys()
