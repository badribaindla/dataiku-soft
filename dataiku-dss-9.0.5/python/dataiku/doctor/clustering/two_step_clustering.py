from six.moves import xrange
from sklearn.cluster import KMeans, AgglomerativeClustering
import numpy as np


class TwoStepClustering(object):
    def __init__(self, k, kmeans_k, max_iterations, seed):
        self.k = k
        self.kmeans_k = kmeans_k
        self.max_iterations = max_iterations
        self.seed = seed

    def _fit_kmeans(self, X):
        self.kmeans = KMeans(n_clusters=self.kmeans_k, max_iter=self.max_iterations, random_state=self.seed).fit(X)

    def _fit_ward(self):
        ward = AgglomerativeClustering(n_clusters=self.k).fit(self.kmeans.cluster_centers_)
        self.ward = ward
        # build tree and active ids
        nodes = {}
        active = {}
        leaves = {}

        # Explanation : scikit stores the hierarchy in the ward.children_ matrix. Each line has an array containing
        # the ids of its children. It does not include lines for the leaves (which have no children).
        # The ids of the children are given by their index in the training dataset.
        # The internal nodes appear in the order by which they were collapsed.

        # We build the leaves corresponding to the kmeans centroids
        for i in xrange(0, self.kmeans_k):
            nodes[i] = Tree(i)
            active[i] = True
            leaves[i] = nodes[i]

        # We build the internal nodes, corresponding to agglomerated clusters
        for i in range(0, len(ward.children_)):
            children = ward.children_[i]
            nodes[self.kmeans_k + i] = nodes[children[0]].merge(nodes[children[1]], self.kmeans_k + i)
            if len(active) > self.k:
                del active[children[0]]
                del active[children[1]]
                active[self.kmeans_k + i] = True
        self.root = nodes[self.kmeans_k + len(ward.children_) - 1]
        self.active_ids = list(active.keys())
        self.leaves = leaves

    def _compute_intrinsic_clustering(self):

        base = {x: i for (i, x) in enumerate(self.active_ids)}

        intrinsic_clustering = {}

        def add_all_leaves(node, cluster_id):
            if node.is_leaf():
                intrinsic_clustering[node.id] = cluster_id
            else:
                add_all_leaves(node.left_son, cluster_id)
                add_all_leaves(node.right_son, cluster_id)

        def process(node):
            if node.id in self.active_ids:
                add_all_leaves(node, base[node.id])
            elif not node.is_leaf():
                process(node.left_son)
                process(node.right_son)

        process(self.root)
        self.intrinsic_clustering = intrinsic_clustering

    def fit(self, X):
        self._fit_kmeans(X)
        self._fit_ward()
        self._compute_intrinsic_clustering()
        return self

    def predict(self, X):
        scored = self.kmeans.predict(X)
        return np.vectorize(self.intrinsic_clustering.get)(scored)

    def post_process(self, user_meta):
        # if the user did not do any manual intervention on the clustering, the user meta will be empty
        if "kept_hierarchy_node_ids" in user_meta:
            self.active_ids = user_meta["kept_hierarchy_node_ids"]
        self._compute_intrinsic_clustering()

    def fit_predict(self, X):
        self.fit(X)
        return self.predict(X)

    def to_json(self, data, rescalers):
        clusters = self.kmeans.predict(data)
        self.root.compute_statistics(data, clusters)
        feature_names = data.columns.tolist()
        scalings = {rescaler.in_col: rescaler for rescaler in rescalers}
        shifts = [scalings[f].shift if f in scalings else 0.0 for f in feature_names]
        inv_scales = [scalings[f].inv_scale if f in scalings else 1.0 for f in feature_names]
        res = {
            "variable_names": feature_names,
            "active_ids": self.active_ids,
            "root": self.root.to_json(shifts, inv_scales)
        }
        self.root.clean_statistics()
        return res

    def get_cluster_labels(self):
        return ["node_%s" % id for id in self.active_ids]


class Tree(object):
    def __init__(self, id, left_son=None, right_son=None, parent=None):
        self.id = id
        self.weight = None
        self.representative = None
        self.squares = None
        self.left_son = left_son
        self.right_son = right_son
        self.parent = parent

    def is_leaf(self):
        return self.left_son is None

    def _init_statistics(self, data, clusters):
        filtered = data[clusters == self.id]
        self.weight = len(filtered)
        self.representative = np.sum(filtered, axis=0) / self.weight
        self.squares = np.sum(filtered * filtered, axis = 0)

    def compute_statistics(self, data, clusters):
        if self.left_son is None:
            self._init_statistics(data, clusters)
        else:
            if self.left_son.weight is None:
                self.left_son.compute_statistics(data, clusters)
                self.right_son.compute_statistics(data, clusters)
            lw = self.left_son.weight
            rw = self.right_son.weight
            self.weight = lw + rw
            self.representative = [(lw * l + rw * r) / self.weight
                                   for (l, r) in zip(self.left_son.representative, self.right_son.representative)]
            self.squares = [l + r for (l, r) in zip(self.left_son.squares, self.right_son.squares)]

    def clean_statistics(self):
        self.weight = None
        self.representative = None
        self.squares = None

    def merge(self, other, id):
        parent = Tree(id, self, other)
        self.parent = parent
        other.parent = parent
        return parent

    def to_json(self, shifts, inv_scales):
        # we rescale the representative and sum of squares
        rep = [x / inv_scale + shift for (x, shift, inv_scale) in zip(self.representative, shifts, inv_scales)]
        s = [sq / (inv_scale * inv_scale) + self.weight * shift * (shift + 2 * x  / inv_scale)
             for (sq, x, shift, inv_scale) in zip(self.squares, self.representative, shifts, inv_scales)]
        from pprint import pprint

        #print("NODE DEBUG")
        #print(self.id)
        #pprint(rep)
        #pprint(s)
        #print()

        json = {
            "id": self.id,
            "representative": rep,
            "squares": s,
            "weight": self.weight,
        }
        if self.left_son is not None:
            json["left_son"] = self.left_son.to_json(shifts, inv_scales)
            json["right_son"] = self.right_son.to_json(shifts, inv_scales)
        return json
