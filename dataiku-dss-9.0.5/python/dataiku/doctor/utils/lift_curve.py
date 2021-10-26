#!/usr/bin/env python
# encoding: utf-8

import json
import logging
from six.moves import xrange
import pandas as pd
import numpy as np
from numpy.testing import assert_almost_equal

from dataiku.doctor.prediction.common import weighted_quantiles


class LiftBuilder(object):
    """Builds the data for lift curves"""
    def __init__(self, data, actual, predicted, with_weight=False):
        self.data = data
        self.actual = actual
        self.predicted = predicted
        self.with_weight = with_weight

    def _make_cuts(self):
        # We attempt first 10 bins, if there are not enough different probas then
        # we go down until we find a suitable cut.
        if self.with_weight:
            # sort lines by probas
            self._data = self.data[[self.predicted, "sample_weight", "__target__"]].sort_values(by=self.predicted).reset_index()
            cumsum_weight = np.cumsum(self._data["sample_weight"].values)
            sum_weight = cumsum_weight[-1]
            weight_offset = cumsum_weight[0]
        for c in xrange(10, 1, -1):
            try:
                if self.with_weight:
                    # get bins as (cut_categorical, cut_mins)
                    bin_boundaries = weighted_quantiles(self._data[self.predicted].values, self._data["sample_weight"].values, np.arange(c+1)/c)
                    # For each observation, write the bin id
                    self._data['percentile_id'] = ((cumsum_weight - weight_offset) / sum_weight * c).astype(int)
                else:
                    (cut_categorical, bin_boundaries) = pd.qcut(self.data[self.predicted], c, retbins=True, labels=xrange(0,c))

                    # For each observation, write the bin id
                    self.data['percentile_id'] = cut_categorical

                # Extract the bins boundaries
                bin_id = []
                bin_min = []
                bin_max = []
                for x in xrange(0, len(bin_boundaries) - 1):
                    bin_id.append(x)
                    bin_min.append(bin_boundaries[x])
                    bin_max.append(bin_boundaries[x+1])
                self.bin_bounds = pd.DataFrame({"bin_id" : bin_id, "bin_min" : bin_min, "bin_max" : bin_max})
                self.bin_bounds = self.bin_bounds.set_index("bin_id")

                break
            except Exception as e:
                logging.info("Failed to qcut proba in %s" % c)
                if c == 2:
                    logging.exception("All attempts to cut probas in deciles failed")
                    raise

    def _get_stats(self):
        # Make one row per (probability bin, actual value) with the number of obs
        if self.with_weight:
            lift = self._data.groupby(['percentile_id', '__target__'])["sample_weight"].sum().reset_index()
        else:
            lift = self.data.groupby(['percentile_id', '__target__']).size().reset_index()
        lift.columns = ['percentile_id', '__target__', 'count']

        # Now make one row per probability bin and one column per target value (in order 0->1)
        lift = lift.pivot_table(values="count", columns='__target__', index="percentile_id", fill_value=0, aggfunc="sum").sort_index(ascending=False)
        positives = lift[1]
        zeros = lift[0]

        # Compute the ratio of actual positive in each probability bin
        lift['bin_pos_prop'] = positives.astype(np.float64) / (zeros + positives)
        dec_tolerance = 7

        # Total ratio of positives in the target, make sure it matches the perfect model (wizard)
        # (that's just another way of computing it)
        global_positive_proportion = positives.astype(np.float64).sum() / (zeros.sum() + positives.sum())
        wizard_global_positive_proportion = float(self.wizard["positives"]) / float(self.wizard["total"])
        assert_almost_equal(global_positive_proportion, wizard_global_positive_proportion, decimal=dec_tolerance)

        # For each bin, lift of the bin is the ratio of the proportion of positives in this bin
        # to the proportion of global positives
        lift['bin_lift'] = lift['bin_pos_prop'] / global_positive_proportion

        # Cumulative lift per bin
        # Last value must be 1.
        lift['cum_lift'] = positives.astype(np.float64).cumsum() / positives.sum()
        assert_almost_equal(lift['cum_lift'].iloc[lift.shape[0]-1], 1.0, decimal=dec_tolerance)

        # For each lift, compute the cumulative ratio of the number of observations up to it
        # Last value must be 1.
        lift['cum_size'] = (zeros + positives).astype(np.float64).cumsum() / (zeros + positives).sum()
        assert_almost_equal(lift['cum_size'].iloc[lift.shape[0]-1], 1.0, decimal=dec_tolerance)

        lift = lift.join(self.bin_bounds).reset_index()

        # Useless columns
        lift.drop([0.0, 1.0, "percentile_id"], axis=1, inplace=True)

        lift['percentile_idx'] = lift.index
        return json.loads(lift.to_json(orient='records'))

    def build(self):
        self._make_cuts()
        if self.with_weight:
            self.wizard = {
                "positives": np.dot(self._data['__target__'].values, self._data['sample_weight'].values),
                "total": np.sum(self._data['sample_weight'].values)
            }
        else:
            self.wizard = {
                "positives": self.data['__target__'].sum(),
                "total": len(self.data)
            }
        return {
            "bins": self._get_stats(),
            "wizard" : self.wizard
        }
