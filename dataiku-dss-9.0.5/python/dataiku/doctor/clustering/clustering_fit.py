import inspect
import logging
import pandas as pd
import numpy as np
import json

from sklearn.mixture import GaussianMixture

from dataiku.doctor.clustering.common import *
from sklearn.cluster import KMeans, MiniBatchKMeans, AgglomerativeClustering, DBSCAN, SpectralClustering

from dataiku.doctor.clustering.anomaly_detection import DkuIsolationForest
from dataiku.doctor.clustering.two_step_clustering import TwoStepClustering
from dataiku.doctor.utils.estimator import set_column_labels


logger = logging.getLogger(__name__)


def scikit_model(modeling_params):
    code = modeling_params['scikit_clf']
    ctx = {"n_clusters": modeling_params.get("k", None)}
    exec(code, ctx)

    clf = ctx.get("clf", None)

    if clf is None:
        raise Exception("No variable 'clf' defined in Custom Python model")

    return clf

def clustering_model_from_params(modeling_params, rows=0):
    algorithm = modeling_params['algorithm']
    seed = modeling_params.get("seed") # None means random
    n_jobs = modeling_params.get("n_jobs", 2)

    k = int(modeling_params.get("k", 0))
    if algorithm == "SCIKIT_MODEL":
        return scikit_model(modeling_params)
    elif algorithm == 'KMEANS':
        logger.info("KMEANS k=%d n_jobs=%d" % (k, n_jobs))
        return KMeans(n_clusters=k, n_jobs=n_jobs, random_state=seed)
    elif algorithm == 'MiniBatchKMeans':
        return MiniBatchKMeans(n_clusters=k, random_state=seed)
    elif algorithm == 'SPECTRAL':
        return SpectralClustering(n_clusters=k,
                                  affinity=modeling_params["affinity"],
                                  coef0=modeling_params.get("coef0"),
                                  gamma=modeling_params.get("gamma"),
                                  random_state=seed)
    elif algorithm == 'WARD':
        return AgglomerativeClustering(n_clusters=k)
    elif algorithm == 'DBSCAN':
        return DBSCAN(eps=float(modeling_params["epsilon"]),
                      min_samples=int(float(modeling_params["min_sample_ratio"]) * rows))
    elif algorithm == 'GMM':
        return GaussianMixture(n_components=k, random_state=seed, max_iter=modeling_params["max_iterations"])
    elif algorithm == 'PY_TWO_STEP':
        return TwoStepClustering(k, int(modeling_params["ts_kmeans_k"]), int(modeling_params["max_iterations"]), seed)
    elif algorithm == 'PY_ISOLATION_FOREST':
        par = modeling_params["isolation_forest"]
        return DkuIsolationForest(n_estimators=par["n_estimators"], max_samples=par["max_samples"],
                                  max_features=par["max_features"], contamination=par["contamination"],
                                  bootstrap=par["bootstrap"], max_anomalies=par["max_anomalies"],
                                  random_state=par["seed"])


class ClusteringModelInspector(object):
    def __init__(self, modeling_params, clf):
        self.modeling_params = modeling_params
        self.clf = clf

    def get_actual_params(self):
        ret = json.loads(json.dumps(self.modeling_params))
        algorithm = self.modeling_params['algorithm']

        logger.info("Clustering model inspector algo=%s" % algorithm)

        # Anything to do ?

        logger.info("End of get_actu_params: now %s" % ret)
        return {"resolved": ret}


def clustering_predict(modeling_params, clusterer, transformed_data):
    """Returns (labels np array, addtional columns DF)"""
    train = transformed_data["TRAIN"]
    train_np, is_sparse = prepare_multiframe(train, modeling_params)

    train_df = train.as_dataframe()
    for col in train_df:
        logger.info("F %s=%s" % (col, train_df[col].iloc[0]))
    try:
        additional_columns = clusterer.get_additional_scoring_columns(train_np)
        additional_columns.index = train_df.index
    except AttributeError:
        additional_columns = pd.DataFrame({}, index=train_df.index)

    return clusterer.predict(train_np), additional_columns


def clustering_fit(modeling_params, transformed_train):
    """
        Returns (clf, actual_params, cluster_labels)
    """
    train = transformed_train["TRAIN"]

    clf = clustering_model_from_params(modeling_params, len(train.index))
    # feed the column labels to the model
    set_column_labels(clf, train.columns())

    train_np, is_sparse = prepare_multiframe(train, modeling_params)

    train_df = train.as_dataframe()
    for col in train_df:
        logger.info("FP %s=%s" % (col, train_df[col].iloc[0]))

    if 'fit_predict' in dir(clf):
        cluster_labels_arr = clf.fit_predict(train_np)
    else:
        clf.fit(train_np)
        cluster_labels_arr = clf.predict(train_np)

    actual_params = ClusteringModelInspector(modeling_params, clf).get_actual_params()
    try:
        additional_columns = clf.get_additional_scoring_columns(train_np)
        additional_columns.index = train_df.index
    except AttributeError:
        additional_columns = pd.DataFrame({}, index=train_df.index)
    return (clf, actual_params, cluster_labels_arr, additional_columns)
