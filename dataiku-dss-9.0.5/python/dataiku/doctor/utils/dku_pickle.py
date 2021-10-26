"""Dku Pickle Wrapper

This script is supposed to be used to perform all pickling operations in
the doctor.

Since many users have code envs that do not have cloudpickle installed,
the incentive to use this script instead of importing pickle or cloudpickle
directly is to let the user benefit from the power of cloudpickle.dump
while minimizing the chances to break things for users that didn't install
cloudpickle.
It also gives us better control and lets us provide explicit logs in case
of problems regarding pickle/cloudpickle.
"""

import sys
import logging

logger = logging.getLogger(__name__)

try:
    import cloudpickle as pickle
    logger.info("Setting cloudpickle as the pickling tool")
except ImportError:
    logger.warning("Cloudpickle is not installed on this code env. Falling back on pickle.")
    try:
        import cPickle as pickle
    except:
        import pickle


def dump(pkl_object, pkl_file, protocol=2):
    """
    Serializes an object in the given file using pickle or cloudpickle (if available)
    :param pkl_object: object to serialize
    :param pkl_file: pickle file to write
    :param protocol: pickle.dump's "protocol" attribute (cf. official pickle doc)
    """
    pickle.dump(pkl_object, pkl_file, protocol)


def load(pkl_file):
    """
    Deserializes an object in the given file using pickle
    :param pkl_file: pickle file to deserialize
    :return deserialized object
    """
    # pickle.load == cloudpickle.load, so here we don't care if it's cloudpickle or not
    return pickle.load(pkl_file)
