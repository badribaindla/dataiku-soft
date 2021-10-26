import numpy as np
from sklearn.metrics import *
from math import sqrt
import pandas as pd
import logging
from six.moves import xrange

from dataiku.doctor.utils.calibration import dku_calibration_curve, dku_calibration_loss

logger = logging.getLogger(__name__)

##################
# Classification #
##################

def log_odds(array, clip_min=0., clip_max=1.):
    """ Compute the log odd of each elements of a array
    logodd = p / (1-p) with p a probability
    :param array: numpy array or pandas Series
    :param clip_min: (float) minimum value
    :param clip_max: (float) maximum value
    :return: a numpy array with the same dimension as input array
    """
    a = array.astype(float)
    a = np.clip(a, clip_min, clip_max)
    return np.log(a / (1 - a))


def check_test_set_ok_for_classification(y_true):
    classes = np.unique(y_true)
    if len(classes) < 2:
        raise ValueError("Ended up with only one class in the test set. Cannot proceed")


def log_loss(y_true, y_pred, eps=1e-15, normalize=True, sample_weight=None):
    """Log loss, aka logistic loss or cross-entropy loss.

    sk-learn version is bugged when a class
    never appears in the predictions.
    """
    (nb_rows, nb_classes) = y_pred.shape
    assert y_true.shape == (nb_rows,)
    assert y_true.max() <= nb_classes - 1
    Y = np.clip(y_pred, eps, 1 - eps)
    Y /= Y.sum(axis=1)[:, np.newaxis]
    T = np.zeros((nb_rows, nb_classes))
    if sample_weight is not None:
        renorm = np.sum(sample_weight)
        if isinstance(sample_weight, pd.Series):
            for r in xrange(nb_rows):
                T[r, int(y_true.iloc[r])] = sample_weight.iloc[r]
        else:
            for r in xrange(nb_rows):
                T[r, int(y_true.iloc[r])] = sample_weight[r]
    else:
        renorm = T.shape[0]
        for r in xrange(nb_rows):
            T[r, int(y_true.iloc[r])] = 1.
    loss = -(T * np.log(Y)).sum()
    return loss / renorm if normalize else loss


def mroc_auc_score(y_true, y_predictions, sample_weight=None):
    """ Returns a auc score. Handles multi-class

    For multi-class, the AUC score is in fact the MAUC
    score described in


    David J. Hand and Robert J. Till. 2001.
    A Simple Generalisation of the Area Under the ROC Curve
    for Multiple Class Classification Problems.
    Mach. Learn. 45, 2 (October 2001), 171-186.
    DOI=10.1023/A:1010920819831

    http://dx.doi.org/10.1023/A:1010920819831
    """
    (nb_rows, max_nb_classes) = y_predictions.shape
    # Today, it may happen that if a class appears only once in a dataset
    # it can appear in the train and not in the validation set.
    # In this case it will not be in y_true and
    # y_predictions.nb_cols is not exactly the number of class
    # to consider when computing the mroc_auc_score.
    classes = np.unique(y_true)
    nb_classes = len(classes)
    if nb_classes > max_nb_classes:
        raise ValueError("Your test set contained more classes than the test set. Check your dataset or try a different split.")

    if nb_classes < 2:
        raise ValueError("Ended up with less than two-classes in the validation set.")

    if nb_classes == 2:
        classes = classes.tolist()
        y_true = y_true.map(lambda c: classes.index(c)) # ensure classes are [0 1]
        return roc_auc_score(y_true, y_predictions[:, 1], sample_weight=sample_weight)

    def A(i, j):
        """
        Returns a asymmetric proximity metric, written A(i | j)
        in the paper.

        The sum of all (i, j) with  i != j
        will give us the symmetry.
        """
        mask = np.in1d(y_true, np.array([i, j]))
        y_true_i = y_true[mask] == i
        y_pred_i = y_predictions[mask][:, i]
        if sample_weight is not None:
            sample_weight_i = sample_weight[mask]
        else:
            sample_weight_i = None
        return roc_auc_score(y_true_i, y_pred_i, sample_weight=sample_weight_i)

    C = 1.0 / (nb_classes * (nb_classes - 1))
    # TODO: double check
    return C * sum(
        A(i, j)
        for i in classes
        for j in classes
        if i != j)


def mcalibration_loss(y_true, y_pred, sample_weight=None):
    (nb_rows, max_nb_classes) = y_pred.shape
    classes = np.unique(y_true)
    nb_classes = len(classes)

    if nb_classes > max_nb_classes:
        raise ValueError("Your test set contained more classes than the test set. Check your dataset or try a different split.")

    if nb_classes < 2:
        raise ValueError("Ended up with less than two-classes in the validation set.")

    if nb_classes == 2:
        classes = classes.tolist()
        y_true = y_true.map(lambda c: classes.index(c))  # ensure classes are [0 1]
        probas = y_pred[:,1]
        freqs, avg_preds, weights = dku_calibration_curve(y_true.values, probas, sample_weight=sample_weight)
        return dku_calibration_loss(freqs, avg_preds, weights)

    else:
        arr_losses = np.zeros(nb_classes)
        for c in range(nb_classes):
            y_true_c = y_true == c
            y_pred_c = y_pred[:, c]
            freqs_c, avg_preds_c, weights_c = dku_calibration_curve(y_true_c, y_pred_c, sample_weight=sample_weight)
            arr_losses[c] = dku_calibration_loss(freqs_c, avg_preds_c, weights_c)
        return np.mean(arr_losses)


##############
# Regression #
##############


def rmse_score(y, y_pred, sample_weight=None):
    """Root Mean Square Error, more readable than MSE"""
    return sqrt(mean_squared_error(y, y_pred, sample_weight=sample_weight))


def rmsle_score(y, y_pred, sample_weight=None):
    """Root Mean Square Logarithmic Error
    https://www.kaggle.com/wiki/RootMeanSquaredLogarithmicError
    """
    if (y<0).sum() > 0 or (y_pred<0).sum() > 0:
        logger.info("Negative values, not computing RMSLE")
        return 0

    if sample_weight is None:
        rmsle = sqrt(np.power(np.log(y + 1) - np.log(y_pred + 1), 2).sum(0) / y.shape[0])
    else:
        rmsle = sqrt((sample_weight * np.power(np.log(y + 1) - np.log(y_pred + 1), 2)).sum(0) / np.sum(sample_weight))

    if np.isinf(rmsle) or np.isnan(rmsle):
        logger.warning("Unexpected RMSLE: %s - ignoring", rmsle)
        return 0

    return rmsle


def mean_absolute_percentage_error(y_true, y_pred, sample_weight=None):
    if sample_weight is None:
        df = pd.DataFrame({"y_true" : y_true, "y_pred" : y_pred})
        df = df[df["y_true"] != 0.]
        y_true = df["y_true"]
        y_pred = df["y_pred"]
        return np.mean(np.abs((y_true - y_pred) / (y_true)))
    else:
        df = pd.DataFrame({"y_true" : y_true, "y_pred" : y_pred, "sample_weight": sample_weight})
        df = df[df["y_true"] != 0.]
        y_true = df["y_true"]
        y_pred = df["y_pred"]
        sample_weight = df["sample_weight"]
        return np.sum(sample_weight * np.abs((y_true - y_pred) / (y_true))) / np.sum(sample_weight)
