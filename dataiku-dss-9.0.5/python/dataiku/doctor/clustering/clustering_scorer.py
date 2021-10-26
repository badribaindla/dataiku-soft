#!/usr/bin/env python
# encoding: utf-8
"""
clustering_scorer : Takes a trained clusterer, dataframe and outputs appropriate scoring data
"""

import math
import logging
import os, sys
from os import path as osp
from copy import deepcopy
import numpy as np
import pandas as pd
import shutil
from sklearn.metrics import silhouette_score
from scipy.interpolate import interp1d
import json

from dataiku.doctor.preprocessing import RescalingProcessor2
from dataiku.base.utils import encode_utf8
from dataiku.doctor.utils import subsample, dku_isnan, dku_nonan, dku_deterministic_value_counts
from collections import OrderedDict, Counter
from sklearn.ensemble import RandomForestClassifier
import heapq
from dataiku.core import dkujson
from dataiku.doctor import constants

SILHOUETTE_LIMIT = 2000
SCATTER_NPOINTS = 1000
NBOOTSTRAP = 10
GAP_STATISTIC_ENABLED = False
CLUSTER_GLOB = 'global_distribution'

logger = logging.getLogger(__name__)

def value_counts(series, n_most_common=100):
    """ Returns an ordered dict, value -> count

    Handles null. n.b. in new versions of pandas
    value_counts can handle null as well.
    """
    global_counts = Counter(dict(dku_deterministic_value_counts(series).head(n_most_common)))
    global_counts[None] = series.isnull().sum()
    return OrderedDict(global_counts.most_common(n_most_common))


def make_percentile(vals):
    if vals.shape[0] == 1: # edge case in malformed data
        def cst_aux(x):
            return vals.iloc[0]
        return cst_aux
        
    percentile_x = np.linspace(0, 100, num=vals.shape[0])
    percentile_y = np.sort(vals)

    def aux(x):
        return float(interp1d(percentile_x, percentile_y)(x))

    return aux


class ClusteringModelScorer(object):
    def __init__(
            self,
            cluster_model,
            transformed_source,
            source_index,
            cluster_labels,
            preprocessing_params,
            modeling_params,
            pipeline,
            run_folder):

        self.cluster_model = cluster_model
        self.preprocessing_params = preprocessing_params
        self.modeling_params = modeling_params
        self.cluster_labels_unaligned = pd.Series(cluster_labels, name="cluster_labels")
        self.cluster_labels = pd.Series(cluster_labels, name="cluster_labels")

        self.cluster_labels.index = transformed_source["TRAIN"].index
        self.pipeline = pipeline

        logger.info("Clustering scoring: transform to dataframes")

        # This is ugly, we loose the MultiFrame interest ... but it works
        self.transformed_source = transformed_source
        self.train = transformed_source["TRAIN"].as_dataframe()
        self.profiling_df = transformed_source["PROFILING"].as_dataframe()
        self.train_prepca = transformed_source["TRAIN_PREPCA"].as_dataframe()
        self.results_path = run_folder
        self.ret = {"metrics": {}, "processed_feature_names": transformed_source["TRAIN"].columns()}

        self.source_index = source_index

        # if model has custom labels, use them
        try:
            self.cluster_names = self.cluster_model.get_cluster_labels()
        except AttributeError:
            self.cluster_names = ["cluster_%s" % i for i in range(len(np.unique(self.cluster_labels)))]

        logger.info("Clustering scoring: Dumping shapes")
        logger.info("  Train df = %s" % str(self.train.shape))
        logger.info("  Profiling df = %s" % str(self.profiling_df.shape))
        logger.info("  Prepca df = %s" % str(self.train_prepca.shape))

    def score(self):
        logger.info("Clustering scoring: Starting work")
        nb_clusters = len(np.unique(self.cluster_labels))

        # Metrics
        if hasattr(self.cluster_model, "inertia_"):
            self.ret["metrics"]["inertia"] = dku_nonan(self.cluster_model.inertia_)
        if nb_clusters > 1:
            self.ret["metrics"]["silhouette"] = self.silhouette_score()
        self.ret["metrics"]["nbClusters"] = dku_nonan(nb_clusters)

        # Importance
        self.ret["variables_importance"] = self.variables_importance()

        # Build profiling_df
        logger.info("Clustering scoring: building final profiling_df")

        cluster_labels = self.cluster_labels.map(lambda x: self.cluster_names[x])

        #Keep only cluster_names that actually appear in cluster_labels
        self.cluster_names = [cn for cn in self.cluster_names if cn in cluster_labels.unique()]

        self.profiling_df = self.profiling_df.join(cluster_labels)
        if set(self.train.columns).intersection(self.profiling_df.columns):
            # There was no PCA, so we append all columns from train to profiling to get the dummies
            self.ret["reduce_vars"] = []
            train_with_suffixed = self.train.copy(False)
            train_with_suffixed.columns = [u"%s__fromtrain" % x for x in train_with_suffixed.columns]
            self.profiling_df = self.profiling_df.join(train_with_suffixed)
        else:
            # There was a PCA, so train only contains the PCA columns.
            self.ret["reduce_vars"] = list(self.train.columns)
            # We append train to get the factors in scatter plot
            self.profiling_df = self.profiling_df.join(self.train)
            # We append the PREPCA to profiling for the dummies
            train_with_suffixed = self.train_prepca.copy(False)
            train_with_suffixed.columns = [u"%s__fromtrain" % x for x in train_with_suffixed.columns]
            self.profiling_df = self.profiling_df.join(train_with_suffixed)

        # Dedup ...
        # I find it very stupid to have to do that while I just wanted to add some columns ...
        self.profiling_df = self.profiling_df[
            list(filter(lambda x: not x.endswith("__fromtrain"), self.profiling_df.columns))]

        self.nfact = self.profiling_df.columns
        nb_outliers = self.profiling_df.shape[0] - self.train.shape[0]
        self.fact = ['cluster_labfels']
        logger.info("shape ofw train : %i,%i" % self.train.shape)
        logger.info("shape of global dataframe : %i,%i" % self.profiling_df.shape)

        if self.preprocessing_params["outliers"]["method"] == "CLUSTER" and self.profiling_df['cluster_labels'].isnull().sum() > 0:
            self.profiling_df['cluster_labels'].fillna(constants.CLUSTER_OUTLIERS, inplace=True)
            self.cluster_names.append(constants.CLUSTER_OUTLIERS)

        self.ret.update({
            "train_nb_records": self.train.shape[0],
            "train_nb_features": self.train.shape[1],
            "train_nb_outliers": nb_outliers
        })
        logger.info("Clustering scorer: final profiling_df %s" % str(self.profiling_df.shape))

        labels_df = pd.DataFrame({"cluster_labels": self.profiling_df["cluster_labels"]})
        # Realign
        full = pd.DataFrame(index=self.source_index)
        labels_df = full.join(labels_df, how="left")
        # If model has additional scoring columns, fetch them
        if hasattr(self.cluster_model, "get_additional_scoring_columns"):
            additional_scoring_columns = self.cluster_model.get_additional_scoring_columns(self.train)
            labels_df = labels_df.join(additional_scoring_columns, how="left")

        labels_df.to_csv(self.results_path + "/clustered.csv", sep="\t", header=True, index=False, encoding='utf-8')

        self.cluster_description()
        self.cluster_profiling()
        self.ret["summary"] = {"clusters": []}
        logger.info("Done cluster desc/profiling/summary")
        self.build_scatter()
        self.build_numerical_cluster_stats()
        #If there is only one cluster, the heatmap is irrelevant
        if len(self.cluster_names) > 1:
            self.build_heatmap()
        self.build_facts()

        dkujson.dump_to_filepath(self.pk_path('results.json'), self.ret)

        # intrinsic scoring
        IntrinsicClusteringModelScorer(self.modeling_params, self.cluster_model, self.train,
                                       self.pipeline, self.results_path, self.profiling_df).score()

    def pk_path(self, path):
        return osp.join(self.results_path, path)

    def silhouette_score(self, ):
        nb_rows = self.train.shape[0]
        if nb_rows > SILHOUETTE_LIMIT:
            # TODO check this !
            ratio = float(SILHOUETTE_LIMIT) / nb_rows
            labeled_train = self.train.join(self.cluster_labels_unaligned)
            #logger.info("Labeled train %s" % labeled_train)
            logger.info("Silhouhette: taking sample of %f on df %s" % (ratio, str(labeled_train.shape)))
            subset = subsample(labeled_train,
                               'cluster_labels',
                               sampling_type='stratified_forced',
                               ratio=ratio)
            return silhouette_score(subset.drop('cluster_labels', axis=1).values,
                                    subset['cluster_labels'].values,
                                    metric='euclidean')
        else:
            return silhouette_score(self.train.values, self.cluster_labels.values, metric="euclidean")

    def variables_importance(self):
        clf = RandomForestClassifier(n_estimators=100, n_jobs=-1)
        clf.fit(self.train_prepca.values, self.cluster_labels)
        features = self.train_prepca.columns
        rfi = {"variables": [], "importances": []}
        for v, i in zip(features, clf.feature_importances_):
            if i != 0.0:
                rfi["variables"].append(v)
                rfi["importances"].append(i)
        return rfi

    def build_scatter(self):
        # we save a kind of stratified subsample (but not really).
        nb_lines = self.profiling_df.shape[0]
        # drop na in cluster_label column (occur if we dropped outliers)
        sub = self.profiling_df.dropna(subset=['cluster_labels'])
        if nb_lines > SCATTER_NPOINTS:
            ratio = min(float(SCATTER_NPOINTS) / nb_lines, 1.0)
            sub = subsample(self.profiling_df,
                            variable='cluster_labels',
                            sampling_type='balanced',
                            ratio=ratio)
            logger.info("SUBSAMPLED %d %d " % sub.shape)
        filtered = sub._get_numeric_data()

        # create temp folder for data files
        tmp_folder = self.pk_path('scatter_tmp')
        if not os.path.exists(tmp_folder):
            os.makedirs(tmp_folder)

        def write(name, items):
            first_row = True
            with open(osp.join(tmp_folder, name), 'wb') as f:
                for item in items:
                    if not first_row:
                        f.write(encode_utf8('\n'))
                    first_row = False
                    f.write(encode_utf8(item))

        # create temp data files
        header = filtered.columns.values
        write('header', header)

        cmap = {}
        i = 0
        for name in self.cluster_names:
            cmap[name] = i
            i += 1
        cmap["cluster_outliers"] = len(self.cluster_names)

        write('c', sub['cluster_labels'].map(cmap).astype(str).tolist())
        write('cluster', sub['cluster_labels'].astype(str).tolist())
        for i in range(len(header)):
            write(str(i), filtered[header[i]].astype(str).tolist())

        shutil.make_archive(self.pk_path("scatter_sample"), 'zip', tmp_folder)
        shutil.rmtree(tmp_folder)

    def iter_facts(self, ):
        K = 10
        profiling_df = self.profiling_df[self.nfact]
        self.cluster_dfs = {
            cluster_label: profiling_df[profiling_df["cluster_labels"] == cluster_label]
            for cluster_label in self.cluster_names
            }
        for col_name in profiling_df.columns:
            if col_name == "cluster_labels":
                continue
            if col_name.startswith("factor_"):
                continue
            series = profiling_df[col_name]
            if float in series.dtype.type.mro():
                continue
            val_counts = value_counts(series, n_most_common=10)
            nb_rows = series.shape[0]
            # we only keep values for which we have a valid approximation
            # of the probability.
            val_counts = OrderedDict(
                (cat_value, count / float(nb_rows))
                for cat_value, count in val_counts.items()
                if count * (1 - count / float(nb_rows)) > 10.
            )
            for (category_value, global_ratio) in val_counts.items():
                for cluster_label in self.cluster_names:
                    cluster_series = self.cluster_dfs[cluster_label][col_name]
                    if category_value is not None:
                        cluster_ratio = (cluster_series == category_value).sum() / float(cluster_series.shape[0])
                        # bayesian smoothing
                        cluster_impact = ((cluster_series == category_value).sum() + global_ratio * K) / float(
                            cluster_series.shape[0] + K)
                        if cluster_impact >= 0.3:
                            yield {
                                "type": "categorical",
                                "feature_label": col_name,
                                "cluster_label": cluster_label,
                                "category_value": category_value,
                                "global_ratio": global_ratio,
                                "current_ratio": cluster_ratio,
                                "current_impact": cluster_impact,
                                "diff": (global_ratio - cluster_ratio) / global_ratio,
                            }
        for cluster_stats in self.clusters_stats:
            for feature_stat in cluster_stats["feature_stats"]:
                if not dku_isnan(feature_stat["diff"]):
                    yield feature_stat

    def build_facts(self, ):
        fact_aggregators = [
                               ["global", 10],
                           ] + [[cluster_label, 3] for cluster_label in self.cluster_names]
        facts = list(self.iter_facts())
        facts_selection_map = {}
        for [aggregator_key, limit] in fact_aggregators:
            if aggregator_key == "global":
                filtered_facts = facts  # [fact for fact in facts if predicate(fact)]
            else:
                filtered_facts = [fact for fact in facts if fact["cluster_label"] == aggregator_key]
            best_filtered_facts = list(heapq.nlargest(limit, filtered_facts, key=lambda x: abs(x["diff"])))
            facts_selection_map[aggregator_key] = best_filtered_facts
        facts_selection = {}
        facts_selection["global"] = {
            "size": self.profiling_df.shape[0],
            "facts": facts_selection_map["global"]
        }
        facts_selection["clusters"] = [
            {
                "cluster": cluster_label,
                "size": self.cluster_dfs[cluster_label].shape[0],
                "facts": facts_selection_map[cluster_label]
            }
            for cluster_label in self.cluster_names
            ]
        facts_filepath = self.pk_path('facts.json')
        json.dump(facts_selection, open(facts_filepath, "w"))

    def build_numerical_cluster_stats(self):
        # Note : we keep this very verbose intermediary data structure because it is still used for the cluster facts
        for col in self.profiling_df.columns:
            logger.info("Summarizing numerical column : %s (%s)" % (col, self.profiling_df[col].dtype))

        variable_names = sorted(col
                                for col in self.profiling_df.columns
                                if (self.profiling_df[col].dtype == np.float or self.profiling_df[col].dtype == np.int)
                                and (not col.startswith("dummy:"))
                                and (not col.startswith("factor_"))
                                )
        global_stats = {
            variable_name: {
                "label": variable_name,
                "mean": dku_nonan(self.profiling_df[variable_name].mean()),
                "std": dku_nonan(self.profiling_df[variable_name].std())
            }
            for variable_name in variable_names
            }

        def compute_stats(sub_df, cluster_label=None):
            feature_stats = []
            stats = {
                "size": sub_df.shape[0],
                "feature_stats": feature_stats
            }
            for variable_name in variable_names:
                variable_series = sub_df[variable_name]
                mean = variable_series.mean()
                std = variable_series.std()
                global_feature_stats = global_stats[variable_name]
                global_mean = global_feature_stats["mean"]
                global_std = global_feature_stats["std"]
                if global_std > 0.:
                    feature_stats.append({
                        "type": "numerical",
                        "feature_label": variable_name,
                        "cluster_label": cluster_label,
                        "mean": dku_nonan(mean),
                        "std": dku_nonan(std),
                        "diff": dku_nonan(((mean - global_mean) / global_std) if global_std > 0. else np.nan),
                        "global_mean": dku_nonan(global_mean),
                        "global_std": dku_nonan(global_std)
                    })
            return stats

        clusters_stats = []
        for cluster_label in self.cluster_names:
            cluster_df = self.profiling_df[self.profiling_df["cluster_labels"] == cluster_label]
            cluster_stats = compute_stats(cluster_df, cluster_label)
            cluster_stats["label"] = cluster_label
            clusters_stats.append(cluster_stats)
        self.clusters_stats = clusters_stats

    def build_heatmap(self, ):

        # build the numerical feature statistics

        num_names = [x["feature_label"] for x in self.clusters_stats[0]["feature_stats"]]
        num_avg = [x["global_mean"] for x in self.clusters_stats[0]["feature_stats"]]
        num_std = [x["global_std"] for x in self.clusters_stats[0]["feature_stats"]]
        cluster_avg = [[x["mean"] for x in cs["feature_stats"]] for cs in self.clusters_stats]
        cluster_std = [[x["std"] for x in cs["feature_stats"]] for cs in self.clusters_stats]

        cat_names = sorted(col for col in self.profiling_df.columns
                                if (not (self.profiling_df[col].dtype == np.float or self.profiling_df[col].dtype == np.int))
                                and (not col.startswith("dummy:"))
                                and (not col.startswith("factor_"))
                                and (not col.startswith("cluster_labels")))

        cluster_sizes = [stat["size"] for stat in self.clusters_stats]
        levels = []
        proportions = []
        n_points = self.profiling_df.shape[0]
        cluster_proportions = [[] for x in self.cluster_names]
        for col in cat_names:
            cat_col = self.profiling_df[col]
            counts = cat_col.value_counts()
            cat_levels = counts.index.tolist()
            levels.append(cat_levels)
            proportions.append(counts.map(lambda x: float(x)/n_points).values.tolist())
            for i in range(len(self.cluster_names)):
                cluster_label = self.cluster_names[i]
                filtered = cat_col[self.profiling_df["cluster_labels"] == cluster_label]
                clust_counts = filtered.value_counts().to_dict()
                clust_size = filtered.size
                cluster_proportions[i].append([float(clust_counts.get(lev, 0))/clust_size for lev in cat_levels]) #fixme : wrong ?

        heatmap = {
            "cluster_labels": self.cluster_names,
            "cluster_sizes": cluster_sizes,
            "total_size": n_points,
            "num_names": num_names,
            "num_averages": num_avg,
            "num_std_devs": num_std,
            "cluster_num_averages": cluster_avg,
            "cluster_num_std_devs": cluster_std,
            "cat_names": cat_names,
            "levels": levels,
            "proportions": proportions,
            "cluster_proportions": cluster_proportions
        }

        heatmap_filepath = self.pk_path('heatmap.json')
        json.dump(heatmap, open(heatmap_filepath, "w"))

    def cluster_description(self):
        logger.info("clusters list : %s" % np.unique(list(self.cluster_names)))
        logger.info("cluster in dataframe : %s" % np.unique(list(self.profiling_df["cluster_labels"].values)))

        # 1) for mean values ...
        variable_clust = []

        # add source variables
        if len(self.nfact) >= 2:  # cause 'cluster' in it anyway.
            temp = self.profiling_df[self.nfact].groupby('cluster_labels', as_index=False).mean()
            temp = temp.where(pd.notnull(temp), None)
            for v in temp.columns:
                if v not in ['cluster_labels', 'color']:
                    variance = round(temp[v].var(), 2) if not dku_isnan(float(temp[v].var())) else 0
                    clust = []
                    for (_, cluster, val) in temp[['cluster_labels', v]].itertuples():
                        if not val is None:
                            clust.append({'cluster': cluster, 'value': val})
                    variable_clust.append({'variable': v, 'var': variance, 'values': clust})
        # add count variables
        logger.info("Labels: %s" % self.profiling_df[['cluster_labels']])
        logger.info("Grouped: %s" % self.profiling_df[['cluster_labels']].groupby('cluster_labels').count())
        logger.info("Grouped2: %s" % self.profiling_df[['cluster_labels']].groupby('cluster_labels', as_index=True))
        temp = pd.DataFrame({"counts": self.profiling_df['cluster_labels'].value_counts()})
        temp = temp.where(pd.notnull(temp), None)
        variance = round(temp["counts"].var(), 2) if not dku_isnan(temp["counts"].var()) else 0
        clust = [
            {'cluster': cluster, 'value': value}
            for (cluster, value) in temp.itertuples()
            ]
        variable_clust.append({'variable': 'cluster_size', 'var': variance, 'values': clust})

        self.ret['cluster_description'] = variable_clust

    def cluster_profiling(self, ):
        cluster_profiling = []

        # aggs = [np.min, np.max, np.median, percentile(25), percentile(75)]
        def profile_numerical(vals, scale):
            vals = np.array(vals)
            vals_no_nan = vals[~np.isnan(vals)]
            nb_rows = vals_no_nan.shape[0]
            if nb_rows < 2:
                return {
                    "min": None,
                    "max": None,
                    "median": None,
                    "percentile25": None,
                    "percentile75": None,
                    "percentile9": None,
                    "percentile91": None,
                    "std": None,
                    "distribution": None,
                    "total_no_nan": nb_rows,
                    "max_ratio": 0.0,
                    "total": vals.shape[0]
                }
            else:
                percentile = make_percentile(vals_no_nan)
                distribution = np.histogram(vals_no_nan, scale)[0]
                max_ratio = distribution.max() / float(nb_rows)
                # TODO use the interpolation option in numpy 1.9
                return {
                    "min": np.min(vals_no_nan),
                    "max": np.max(vals_no_nan),
                    "median": float(percentile(50)),
                    "percentile25": float(percentile(25)),
                    "percentile75": float(percentile(75)),
                    "percentile9": float(percentile(9)),
                    "percentile91": float(percentile(91)),
                    "std": np.std(vals_no_nan),
                    "distribution": distribution,
                    "max_ratio": max_ratio,
                    "total_no_nan": nb_rows,
                    "total": vals.shape[0]
                }

        def profile_categorical(vals, categories):
            nb_rows = vals.shape[0]
            if nb_rows == 0:
                return {
                    "distribution": None,
                    "max_ratio": 0.0,
                    "total_no_nan": nb_rows,
                    "total": nb_rows
                }
            else:
                counts = value_counts(vals, n_most_common=30)
                distribution = [
                    {
                        "label": category,
                        "total_no_nan": counts.get(category, 0),
                        "ratio": counts.get(category, 0) / float(nb_rows)
                    }
                    for category in categories
                    ]
                max_ratio = max(counts.values()) / float(nb_rows)
                return {
                    "distribution": distribution,
                    "max_ratio": max_ratio,
                    "total": nb_rows,
                    "total_no_nan": nb_rows
                }

        # add source variables
        if len(self.nfact) >= 2:  # cause 'cluster' in it anyway.
            profiling_df = self.profiling_df[self.nfact]
            cluster_labels = profiling_df["cluster_labels"]
            cluster_names = self.cluster_names  # sorted(np.unique(cluster_labels))
            for col in profiling_df.columns:
                logger.info("Study profiling column: %s dtype=%s" % (col, profiling_df[col].dtype))
                if col == "cluster_labels":
                    continue
                if col.startswith("factor_"):
                    continue
                if col.startswith("dummy:"):
                    continue

                col_profiling = {"variable": col}
                per_cluster = []
                col_profiling["per_cluster"] = per_cluster
                if float in profiling_df[col].dtype.type.mro() or int in profiling_df[col].dtype.type.mro():
                    logger.info("  It's a float")
                    col_profiling["type"] = "numerical"
                    cluster_profiling.append(col_profiling)
                    col_vals = profiling_df[col]
                    col_vals_no_na = col_vals[~np.isnan(col_vals)]
                    percentile = make_percentile(col_vals_no_na)
                    scale_start = percentile(0)
                    scale_stop = percentile(100)
                    max_ratio = 0.01
                    col_profiling["scale"] = {
                        "min": scale_start,
                        "max": scale_stop,
                    }
                    if scale_stop - scale_start == 0:
                        logger.info("This variable has no variance")
                        col_profiling["no_variance"] = True
                        continue
                    scale = np.linspace(scale_start, scale_stop, num=61)
                    col_profiling["global"] = profile_numerical(col_vals, scale)
                    max_ratio = max(max_ratio, col_profiling["global"]["max_ratio"])
                    for cluster_label in cluster_names:
                        filtered_col_vals = np.array(col_vals[cluster_labels == cluster_label])
                        cluster_profile = profile_numerical(filtered_col_vals, scale)
                        max_ratio = max(max_ratio, cluster_profile["max_ratio"])
                        cluster_profile["cluster_name"] = cluster_label
                        per_cluster.append(cluster_profile)
                    col_profiling["scale"]["max_ratio"] = max_ratio
                else:
                    col_profiling["type"] = "categorical"
                    logger.info("  It's a cat")
                    # categorical stuff.
                    col_vals = profiling_df[col]
                    global_counts = value_counts(col_vals, n_most_common=30)
                    # global_counts contains the counts for the category values we break down on
                    mask = col_vals.isin(global_counts.keys())
                    if None in global_counts:
                        mask |= col_vals.isnull()
                    col_vals = col_vals[mask]
                    cluster_profiling.append(col_profiling)
                    col_profiling["global"] = profile_categorical(col_vals, global_counts.keys())
                    max_ratio = 0.0
                    for cluster_label in cluster_names:
                        filtered_col_vals = col_vals[cluster_labels == cluster_label]
                        cluster_profile = profile_categorical(filtered_col_vals, global_counts.keys())
                        cluster_profile["cluster_name"] = cluster_label
                        max_ratio = max(max_ratio, cluster_profile["max_ratio"])
                        per_cluster.append(cluster_profile)
                    scale = {"max_ratio": max_ratio}
                    col_profiling["scale"] = scale
                    scale["categories"] = list(global_counts.keys())

        dkujson.dump_to_filepath(self.pk_path('profiling.json'), cluster_profiling)
        logger.info("DONE cluster profiling")


class IntrinsicClusteringModelScorer(object):
    def __init__(self, modeling_params, clf, train_X, pipeline, out_folder, profiling_df=None):
        self.modeling_params = modeling_params
        self.clf = clf
        self.train_X = train_X
        self.pipeline = pipeline
        self.out_folder = out_folder
        self.profiling_df = profiling_df

    def pk_path(self, path):
        return osp.join(self.out_folder, path)

    def _extract_rescalers(self):
        return list(filter(lambda u: isinstance(u, RescalingProcessor2), self.pipeline.steps))

    def score(self):
        logger.info("Intrinsic scoring of clustering model")
        if self.modeling_params['algorithm'] in ['PY_TWO_STEP']:
            dkujson.dump_to_filepath(self.pk_path('hierarchy.json'),
                                     self.clf.to_json(self.train_X, self._extract_rescalers()))

        # anomaly detection
        if self.modeling_params['algorithm'] in ['PY_ISOLATION_FOREST']:
            columns_to_keep = [s for s in list(set(self.profiling_df.columns) - (set(self.train_X.columns) | set(["cluster_labels"]))) if s[:6]!="dummy:"]
            extra_columns_df = self.profiling_df[columns_to_keep]
            # if there are actually two clusters (regular and anomaly)
            if self.profiling_df["cluster_labels"].nunique() > 1:
                dkujson.dump_to_filepath(self.pk_path('anomalies.json'), self.clf.get_top_outliers(self.train_X, self._extract_rescalers(), extra_columns_df))

