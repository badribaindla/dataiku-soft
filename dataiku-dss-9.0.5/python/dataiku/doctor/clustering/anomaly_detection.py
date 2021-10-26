from dataiku.doctor.utils.skcompat import handle_behaviour_param_of_isolation_forest
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


class DkuIsolationForest(object):
    def __init__(self, n_estimators, max_samples, max_features, contamination, bootstrap, max_anomalies, random_state):
        self.n_estimators = n_estimators
        self.max_samples = max_samples
        self.max_features = max_features
        self.max_anomalies = max_anomalies
        self.contamination = contamination
        self.bootstrap = bootstrap
        self.clf = None
        self.random_state = random_state

    def fit(self, X):
        self.clf = IsolationForest(n_estimators=self.n_estimators, max_samples=self.max_samples,
                                   contamination=self.contamination, bootstrap=self.bootstrap,
                                   max_features=self.max_features, random_state=self.random_state)
        handle_behaviour_param_of_isolation_forest(self.clf)
        self.clf.fit(X)
        return self

    def predict(self, X):
        scored = self.clf.predict(X)
        scored[scored == 1] = 0
        scored[scored == -1] = 1
        return scored

    def fit_predict(self, X):
        self.fit(X)
        return self.predict(X)

    def get_cluster_labels(self):
        return ["regular", "anomalies"]

    def get_top_outliers(self, train_X, rescalers, extra_profiling_df):
        columns = train_X.columns.tolist()

        # descale the data
        scalings = {rescaler.in_col: rescaler for rescaler in rescalers}
        shifts = np.array([scalings[f].shift if f in scalings else 0.0 for f in columns])
        inv_scales = np.array([scalings[f].inv_scale if f in scalings else 1.0 for f in columns])
        X = train_X.values
        X_norm = X / inv_scales + shifts

        # compute global stats (necessary to compute z-score)
        avg = np.mean(X_norm, axis=0)
        std = np.std(X_norm, axis=0)

        # compute top anomalies
        n_anomalies = np.sum(self.predict(X) == 1)
        p = self.clf.decision_function(X)
        sorted_indices = p.argsort()
        top_indices = sorted_indices[:min(self.max_anomalies, n_anomalies)]
        bottom_indices = sorted_indices[-10:]
        samples = (X / inv_scales + shifts)[top_indices,:]
        regular_samples = (X / inv_scales + shifts)[bottom_indices,:]

        ret = {
            "columns": columns,
            "data": [x.tolist() for x in samples],
            "regular_data" : [x.tolist() for x in regular_samples],
            "scores": p[top_indices].tolist(),
            "regular_scores": p[bottom_indices].tolist(),
            "score_mean": np.mean(p),
            "score_std": np.std(p),
            "averages": avg,
            "standard_deviations": std,
            "total_anomalies": n_anomalies
        }
        # add extra columns used for profiling only
        if extra_profiling_df is not None and len(extra_profiling_df.columns) is not 0:
            extra_profiling_columns = list(extra_profiling_df.columns)
            extra_profiling_samples = extra_profiling_df.iloc[top_indices].values
            extra_profiling_regular_samples = extra_profiling_df.iloc[bottom_indices].values
            ret["extra_profiling_columns"] = extra_profiling_columns
            ret["extra_profiling_data"] = [x.tolist() for x in extra_profiling_samples]
            ret["extra_profiling_regular_data"] = [x.tolist() for x in extra_profiling_regular_samples]

        return ret

    def get_additional_scoring_columns(self, X):
        return pd.DataFrame({"anomaly_score": self.clf.decision_function(X)})
