import numpy as np
from sklearn.model_selection import BaseCrossValidator
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.model_selection import LeavePGroupsOut

from dataiku.base.utils import safe_exception
from dataiku.base.utils import safe_unicode_str


######################################################################################
## BEGIN CLASSES USED BY DKU-CONTRIB-PRIVATE in code samples                        ##
## In the UI: Analysis/Design/Hyperparameters/Cross-validation strategy/Custom code ##
## DO NOT REMOVE                                                                    ##
######################################################################################
class BaseDKULeaveGroupOut(object):
    """ This class and sub classes are used for code snippets in the repository dku-contrib-private/snippets """
    def __init__(self, column_name, splitter):
        self.column_name = column_name
        self.splitter = splitter
        self.column_labels = None

    def _get_column_index(self):
        try:
            return self.column_labels.index(self.column_name)
        except ValueError as e:
            raise safe_exception(Exception, u"Column {} not found among {}".format(safe_unicode_str(self.column_name), safe_unicode_str(self.column_labels)))

    def set_column_labels(self, column_labels):
        self.column_labels = column_labels

    def get_n_splits(self, X, y, groups=None):
        column_idx = self._get_column_index()
        groups_array = X[:, column_idx]

        ret = self.splitter.get_n_splits(X, y, groups_array)
        return ret

    def split(self, X, y, groups=None):
        column_idx = self._get_column_index()
        groups_array = X[:, column_idx]

        return self.splitter.split(X, y, groups_array)


class DKULeaveOneGroupOut(BaseDKULeaveGroupOut):
    """
    In dku-contrib-private/snippets/BUILTIN/python/crossval-leave-one-label-out/variations/sample.py
    DO NOT REMOVE
    """
    def __init__(self, column_name):
        super(DKULeaveOneGroupOut, self).__init__(column_name, LeaveOneGroupOut())
        self.column_name = column_name


class DKULeavePGroupsOut(BaseDKULeaveGroupOut):
    """
    In dku-contrib-private/snippets/BUILTIN/python/crossval-leave-p-labels-out/variations/sample.py
    DO NOT REMOVE
    """
    def __init__(self, column_name, p):
        super(DKULeavePGroupsOut, self).__init__(column_name, LeavePGroupsOut(p))
        self.column_name = column_name
###########################################
## END CLASS USED BY DKU-CONTRIB-PRIVATE ##
###########################################


class DKUSortedSingleSplit(BaseCrossValidator):

    """
    Class for the most basic non-shuffled single split where split is done without shuffle (useful for forecast)
    NB: for consistency with scikit-learn, test_size should be a float between 0.0 and 1.0 and represent the proportion
        of the dataset to include in the test split
    """
    def __init__(self, test_size):
        assert 0 < test_size < 1., "Both train and test need to be non-empty, cannot accept zero ratio"
        self.test_size = test_size

    def get_n_splits(self, X=None, y=None, groups=None):
        return 1

    def split(self, X, y=None, groups=None):
        n_records = X.shape[0]
        n_records_train = int(n_records * (1 - self.test_size))
        train = np.arange(n_records_train)
        test = np.arange(n_records_train, n_records)
        return [(train, test)]