# temp only one one variable.
# need to check at least 1

import random
import pandas as pd
import dataiku.core.pandasutils as pdu
import logging

class Subsampler(object):

    def __init__(self, df, variable, sampling_type='stratified', ratio=0.1):
        self.df = df
        self.sampling_type = sampling_type
        self.variable = variable
        self.values = self.df[self.variable].unique()
        #logging.info("Unique values: %s" % self.values)
        self.nb_values = len(self.values)
        self.ratio = ratio

    def balanced_subsampling(self,):
        """ Subsample targetting the representation
        of clusters in a scatter plot.
        This has really no statistical property whatsoever.

        Proper stratified subsampling may lead to cluster
        with too few sample to be visible.

        This method tries a same number of points for each class.

        The number of rows outputted is 'about' ratio * nb_rows.

        # TODO we may want to change this code to
        # make big cluster actually look big.
        """
        # compute the counts of each class :

        target = self.df[self.variable]
        nb_rows = len(target)
        value_counts = dict(target.value_counts())

        # we make sure to have at least min_sample_value_counts
        # per value whenever possible
        target_sample_size_per_class = int((nb_rows * self.ratio) / self.nb_values)

        #selected_rows = #pd.Series(np.zeros((nb_rows,), dtype=np.bool), index=target.index)
        selected_rows = pd.Index([])
        for val, count in value_counts.items():
            if count > target_sample_size_per_class:
                value_selected_rows = pd.Index(random.sample(target[target == val].index.tolist(), target_sample_size_per_class))
                selected_rows = selected_rows.append(value_selected_rows)
            else:
                selected_rows = selected_rows.append(target[target == val].index)
        return self.df.loc[selected_rows]
    
    def stratified_subsampling(self,):
        """ Pick samples from each category proportionally.
        """
        sub = pd.DataFrame(columns=self.df.columns)
        for val in self.values:
            (keep, throw) = pdu.split_train_valid(self.df[self.df[self.variable] == val], prop=self.ratio)
            sub = pd.concat([sub, keep], axis=0, ignore_index=True)
        return sub

    def stratified_forced_subsampling(self):
        """ Pick samples from each category proportionally,
        but force a minimal sample size per category.
        """
        # same as stratified but force at least one for each modalities to avoid other functions bugs
        sub = pd.DataFrame(columns=self.df.columns)
        for val in self.values:
            #logging.info(" -> Sample on value %s" % val)
            temp = self.df[self.df[self.variable] == val]
            #logging.info("TEMP: %s" % temp)
            keep, throw = pdu.split_train_valid(temp, prop=self.ratio)
            if keep.shape[0] < 1:  # force here
                ind = random.randint(0, temp.shape[0] - 1)
                keep = temp.iloc[[ind]]
            sub = pd.concat([sub, keep], axis=0, ignore_index=True)
        return sub

    def cluster_sampling(self):
        """ Sample on the categories itself.

        Select a proportion (prop) of the categories.
        """
        k = max(1, int(round(self.ratio * self.nb_values)))
        cluster_list = random.sample(self.values.tolist(), k)
        return self.df[self.df[self.variable].isin(cluster_list)]

    def run(self):
        if self.sampling_type == 'stratified':
            return self.stratified_subsampling()
        elif self.sampling_type == 'balanced':
            return self.balanced_subsampling()
        elif self.sampling_type == 'stratified_forced':
            return self.stratified_forced_subsampling()
        elif self.sampling_type == 'cluster':
            return self.cluster_sampling()


def subsample(df, variable, sampling_type='stratified', ratio=0.1):
    return Subsampler(df, variable, sampling_type=sampling_type, ratio=ratio).run()
