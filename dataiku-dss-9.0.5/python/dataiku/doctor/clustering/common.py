from sklearn.metrics import *
from ..utils.metrics import mroc_auc_score, log_loss

def prepare_multiframe(train_X, modeling_params):
    return (train_X.as_np_array(), False)

