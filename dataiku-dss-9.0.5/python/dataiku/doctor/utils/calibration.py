import numpy as np
import pandas as pd


def dku_calibration_curve(y_true, y_prob, sample_weight=None, n_bins=10, pos_label=None):
    if pos_label is None:
        pos_label = y_true.max()
    y_true = np.array(y_true == pos_label, int)
    freqs = []
    avg_preds = []
    weights = []

    # Order by increasing probability
    remapping = np.argsort(y_prob)
    y_true = y_true[remapping]
    y_prob = y_prob[remapping]
    if sample_weight is not None:
        # Using a ndarray instead of a pd.Series as we remap by location in the array,
        # not by index and we only use it as a ndarray afterwards
        sample_weight_values = sample_weight.values if isinstance(sample_weight, pd.Series) else sample_weight
        sample_weight_values = sample_weight_values[remapping]

    step_size = 1 / float(n_bins)

    # Map the boundaries of the probabilities grid to the sorted data
    i_thres = list(np.searchsorted(y_prob, np.arange(0, 1, step_size)))
    i_thres.append(y_true.shape[0])

    # For each bin, compute frequency of positive class, average prediction, and bin weight
    for i, i_start in enumerate(i_thres[:-1]):
        i_end = i_thres[i+1]
        if sample_weight is None:
            weight = float(i_end - i_start)
            freq_pos = y_true[i_start:i_end].sum() / weight
            avg_pred = y_prob[i_start:i_end].sum() / weight
        else:
            weight = float(sample_weight_values[i_start:i_end].sum())
            freq_pos = (np.dot(y_true[i_start:i_end],
                               sample_weight_values[i_start:i_end])
                         / weight)
            avg_pred = (np.dot(y_prob[i_start:i_end],
                               sample_weight_values[i_start:i_end])
                        / weight)
        if not (weight == 0. or np.isnan(weight) or np.isnan(avg_pred) or np.isnan(freq_pos)):
            weights.append(weight)
            freqs.append(freq_pos)
            avg_preds.append(avg_pred)
    return freqs, avg_preds, weights


def dku_calibration_loss(freqs, avg_preds, weights, reducer="sum", normalize=True):
    freqs_arr = np.array(freqs)
    avg_preds_arr = np.array(avg_preds)
    weights_arr = np.array(weights).astype(float)
    if reducer == "max":
        loss = np.max(np.abs(freqs_arr - avg_preds_arr))
    elif reducer == "sum":
        loss = np.dot(np.abs(freqs_arr - avg_preds_arr), weights_arr)
        if normalize:
            loss /= np.sum(weights_arr)
    else:
        raise ValueError("reducer is neither 'sum' nor 'max'")
    return loss

