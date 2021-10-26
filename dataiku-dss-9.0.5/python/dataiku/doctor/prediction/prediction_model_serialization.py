import os.path as osp
import re

from .common import *
from dataiku.core import dkujson
from dataiku.doctor.utils.skcompat import get_gbt_regression_baseline
from dataiku.doctor.utils.skcompat import get_gbt_classification_baseline
from sklearn.calibration import CalibratedClassifierCV

from dataiku.doctor.utils.skcompat import extract_X_y_from_isotonic_regressor

logger = logging.getLogger(__name__)

class SerializableModel(object):
    def __init__(self, name, model):
        self.name = name
        self.model = model


class ModelSerializer(object):
    def __init__(self, columns, clf, modeling_params, run_folder, target_mapping):
        self.modeling_params = modeling_params
        self.target_mapping = target_mapping
        self.columns = columns
        self.clf = clf
        self.model_folder = run_folder

    def get_model(self):
        """
        Returns the serializable model for this model, which includes both the algorithm name to serialize and the model
        data
        """
        return None

    def _serialize_pipeline_meta(self, name):
        meta = {
            "backend": "KERAS" if self.modeling_params.get("algorithm") == "KERAS_CODE" else "PY_MEMORY",
            "algorithm_name": name,
            "columns": self.columns
        }
        if self.target_mapping is not None:
            # because scikit does it own class mapping, we have to remap here. So the final classes will be different
            # from the target_mapping if some were missing from the training set
            inv_mapping = {x[1]: x[0] for x in self.target_mapping.items()}
            meta["classes"] = [inv_mapping[i] for i in self.clf.classes_]
        dkujson.dump_to_filepath(osp.join(self.model_folder, "dss_pipeline_meta.json"), meta)

    def serialize(self):
        """
        Dump all relevant model-related information to the run_folder. This includes
            - the serialized model
            - the final preprocessed column names, in the order in which they are used by the model
            - in the case of binary or multiclass classification, the class mapping
        """
        model = self.get_model()
        if model is not None:
            self._serialize_pipeline_meta(model.name)
            dump = model.model
            import gzip
            with gzip.open(osp.join(self.model_folder, "dss_pipeline_model.gz"), 'wb') as f:
                f.write(dkujson.dumps(dump).encode("utf-8"))
            #dkujson.dump_to_filepath(osp.join(self.model_folder, "dss_pipeline_model.dss"), model.model)


def _listify(o):
    """ recursively listify arrays or lists """
    if type(o) is np.ndarray or type(o) is list:
        return [_listify(x) for x in o]
    else:
        return o


# this is not super efficient, in particular with large forests. May have to vectorize if turns out to be slow
def _serialize_sklearn_tree(tree, is_regression):
    extract = tree.tree_
    left = extract.children_left.tolist()
    right = extract.children_right.tolist()
    extract_thresholds = extract.threshold.tolist()
    extract_labels = extract.value.tolist()
    extract_features = extract.feature.tolist()
    node_ids = []
    leaf_ids = []
    labels = []
    features = []
    thresholds = []

    def process(index, id):
        # not a leaf
        if left[index] >= 0:
            node_ids.append(id)
            features.append(extract_features[index])
            thresholds.append(extract_thresholds[index])
            # id of current node children are 2*id + {1, 2} (NB: root id is 0, not 1)
            process(left[index], 2 * id + 1)
            process(right[index], 2 * id + 2)
        # no child => this is a leaf
        else:
            leaf_ids.append(id)
            if is_regression:
                labels.append(extract_labels[index][0][0])
            else:
                tab = extract_labels[index][0]
                norm = 1.0 / sum(tab)
                labels.append([x * norm for x in tab])

    process(0, 0)

    return {
        "node_id": node_ids,
        "feature": features,
        "threshold": thresholds,
        "leaf_id": leaf_ids,
        "label": labels
    }


def _serialize_decision_forest(forest, is_regression):
    return {"trees": [_serialize_sklearn_tree(t, is_regression) for t in forest.estimators_]}


def _serialize_regression_gbm(gbm, is_regression):
    return {
        # note that we do t[0] because scikit wraps gbm trees in another array because why the f*** not
        "trees": [_serialize_sklearn_tree(t[0], is_regression) for t in gbm.estimators_],
        "shrinkage": gbm.learning_rate,
        "baseline": get_gbt_regression_baseline(gbm)
    }


def _serialize_classification_gbm(gbm, is_binary):
    shrinkage = gbm.learning_rate
    if is_binary:
        baseline = get_gbt_classification_baseline(gbm, binary_classif=True)
        if gbm.loss == "exponential":
            # In sklearn, when loss is "exponential", the predicted probas are: sigmoid(2 * score),
            # while it's sigmoid(score) for the default "deviance" loss. We don't handle this case
            # in DSS, so we always compute sigmoid(score). To overcome this issue, we multiply both
            # the baseline and the shrinkage by 2. This is valid because:
            # 2*(baseline + shrinkage * trees_preds) == 2*baseline + 2*shrinkage * trees_preds
            [baseline_value] = baseline
            baseline = [2*baseline_value]
            shrinkage *= 2.0
        return SerializableModel("GRADIENT_BOOSTING_CLASSIFIER", {
            "trees": [[_serialize_sklearn_tree(t[0], True)] for t in gbm.estimators_],
            "shrinkage": shrinkage,
            "baseline": baseline
        })
    else:
        return SerializableModel("GRADIENT_BOOSTING_CLASSIFIER", {
            "trees": [[_serialize_sklearn_tree(t, True) for t in trees] for trees in gbm.estimators_],
            "shrinkage": shrinkage,
            "baseline": get_gbt_classification_baseline(gbm, binary_classif=False)
        })


# TODO: process dumps as json to avoid regexps
def _serialize_xgboost_tree(dump):
    all_nodes = [node.strip() for node in dump.split("\n") if node.strip() != ""]
    leaf_id = []
    label = []
    node_id = []
    feature = []
    threshold = []
    index_remapping = {0: 0}
    for node in all_nodes:
        tmp = node.split(":")
        xgb_index = int(tmp[0])
        index = index_remapping[xgb_index]
        is_leaf = tmp[1][:4] == "leaf"
        if is_leaf:
            leaf_id.append(index)
            label.append(float(tmp[1].split("=")[1]))
        else:
            if "<" in tmp[1]:
                # for cases FeatureMap::kInteger, FeatureMap::kFloat, FeatureMap::kQuantitative (default)
                f, t, il, ir, _ = re.search(r"\[(.*)<(.*)\] yes=(.*),no=(.*),missing=(.*)", tmp[1]).groups()
                index_remapping[int(il)] = 2*index + 1
                index_remapping[int(ir)] = 2*index + 2
            else:
                # boolean condition (FeatureMap::kIndicator) has no missing field
                f, il, ir, _ = re.search(r"\[(.*)\] yes=(.*),no=(.*)", tmp[1]).groups()
                t = 1.
                # NB: need to swap left and right as for boolean f as f = not float(f) < 1.
                index_remapping[int(il)] = 2*index + 2
                index_remapping[int(ir)] = 2*index + 1
            feature.append(int(f[1:]))
            node_id.append(index)
            threshold.append(float(t))
    return {
        "node_id": node_id,
        "feature": feature,
        "threshold": threshold,
        "leaf_id": leaf_id,
        "label": label,
        "xgboost": True
    }


def _serialize_regression_xgb(xgb_model):
    # TODO: get dumps as json => get_dump(dump_format='json')
    trees_as_dump = xgb_model.get_booster().get_dump()
    # If trained with early stopped, don't use the trees after best_ntree_limit (changed in xgboost==0.80)
    if hasattr(xgb_model, "best_ntree_limit"):
        trees_as_dump = trees_as_dump[:xgb_model.best_ntree_limit]
    # TODO: take bias and weight into account for gblinear models when added to DSS
    gamma_regression = xgb_model.get_params().get("objective") == "reg:gamma"
    return {
        "trees": [_serialize_xgboost_tree(t) for t in trees_as_dump],
        "shrinkage": 1.,
        "baseline": xgb_model.base_score,
        "gamma_regression": gamma_regression
    }


def _serialize_classification_xgb(xgb_model, is_binary):
    # TODO: get dumps as json => get_dump(dump_format='json')
    trees_as_dump = xgb_model.get_booster().get_dump()
    # TODO: take bias and weight into account for gblinear models when added to DSS
    if is_binary:
        # If trained with early stopped, don't use the trees after best_ntree_limit (changed in xgboost==0.80)
        if hasattr(xgb_model, "best_ntree_limit"):
            trees_as_dump = trees_as_dump[:xgb_model.best_ntree_limit]
        return {
            "trees": [[_serialize_xgboost_tree(t)] for t in trees_as_dump],
            "shrinkage": 1.,
            "baseline": [0.],
        }
    else:
        n_classes = xgb_model.n_classes_
        # If trained with early stopped, don't use the trees after best_ntree_limit (changed in xgboost==0.80)
        if hasattr(xgb_model, "best_ntree_limit"):
            trees_as_dump = trees_as_dump[:xgb_model.best_ntree_limit*n_classes]
        estimators = [[] for _ in range(n_classes)]
        for i, t in enumerate(trees_as_dump):
            estimators[i % n_classes].append(_serialize_xgboost_tree(t))
        logger.info(estimators)
        return {
            "trees": np.array(estimators).T.tolist(),
            "shrinkage": 1.,
            "baseline": [0.] * n_classes
        }


def _serialize_mlp(clf):
    return SerializableModel("MULTI_LAYER_PERCEPTRON", {
        "activation": clf.activation.upper(),
        "biases": _listify(clf.intercepts_),
        "weights": [_listify(np.transpose(x)) for x in clf.coefs_]
    })


class RegressionModelSerializer(ModelSerializer):
    def __init__(self, columns, clf, modeling_params, run_folder):
        super(RegressionModelSerializer, self).__init__(columns, clf, modeling_params, run_folder, target_mapping=None)

    def get_model(self):
        algo = self.modeling_params["algorithm"]

        # Ridge, Lasso, OLS, SGD ...
        if hasattr(self.clf, 'coef_') and hasattr(self.clf, 'intercept_') and algo != "SVM_REGRESSION":
            # for SGDRegressor, intercept_ comes as a (1,) ndarray, so we need to convert to float
            return SerializableModel("LINEAR", {
                "coefficients": self.clf.coef_,
                "intercept": float(self.clf.intercept_) 
            })

        if algo == "DECISION_TREE_REGRESSION":
            return SerializableModel("DECISION_TREE", _serialize_sklearn_tree(self.clf, True))

        if algo == "RANDOM_FOREST_REGRESSION" or algo == "EXTRA_TREES":
            return SerializableModel("FOREST_REGRESSOR", _serialize_decision_forest(self.clf, True))

        if algo == "GBT_REGRESSION":
            return SerializableModel("GRADIENT_BOOSTING_REGRESSOR", _serialize_regression_gbm(self.clf, True))

        if algo == "NEURAL_NETWORK":
            return _serialize_mlp(self.clf)

        if algo == "XGBOOST_REGRESSION":
            return SerializableModel("GRADIENT_BOOSTING_REGRESSOR", _serialize_regression_xgb(self.clf))

        return None


def _common_classif_serialization(algo, clf):
    # Logistic Regression, SGD ...
    if algo == "DECISION_TREE_CLASSIFICATION":
        return SerializableModel("DECISION_TREE", _serialize_sklearn_tree(clf, False))
    elif algo == "RANDOM_FOREST_CLASSIFICATION" or algo == "EXTRA_TREES":
        return SerializableModel("FOREST_CLASSIFIER", _serialize_decision_forest(clf, False))
    elif algo == "NEURAL_NETWORK":
        return _serialize_mlp(clf)
    else:
        return None


def _serialize_binary_logit(clf):
    return _serialize_binary_logistic(clf, "MULTINOMIAL")

def _serialize_binary_sgd(clf):
    if clf.loss == 'log':
        return _serialize_binary_logistic(clf, 'MULTINOMIAL')
    elif clf.loss == 'modified_huber':
        return _serialize_binary_logistic(clf, 'MODIFIED_HUBER')
    else:
        return None

def _serialize_binary_logistic(clf, policy):
    # to be compatible, we create dummy coefficients and intercept for the 0 class, all equal to zero, and treat the
    # model as multinomial (100% kosher)
    model_coef = clf.coef_.tolist()
    dummy_coef = [0.0 for x in model_coef[0]]
    model = {
        "policy": policy,
        "coefficients": [dummy_coef] + model_coef,
        "intercept": [0.0] + clf.intercept_.tolist()
    }
    return SerializableModel("LOGISTIC", model)


class ClassificationModelSerializer(ModelSerializer):
    def __init__(self, columns, clf, modeling_params, run_folder, target_mapping, calibrate_proba=False):
        super(ClassificationModelSerializer, self).__init__(columns, clf, modeling_params, run_folder, target_mapping)
        self.calibrate_proba = calibrate_proba

    def add_calibrator(self, model):
        if model is not None:
            calibrator = self._get_calibrator() if self.calibrate_proba else {}
            model.model["calibrator"] = calibrator

    def _get_calibrator(self):
        """
        Returns a serializable dict containing the calibration parameters
        """
        if not self.calibrate_proba or not isinstance(self.clf, CalibratedClassifierCV):
            raise ValueError("Cannot get calibrator of model that has not been calibrated")
        n_calibrators = 1 if len(self.clf.classes_) == 2 else len(self.clf.classes_)
        from_proba = not hasattr(self.clf.base_estimator, "decision_function")
        calibrators = [self.clf.calibrated_classifiers_[0].calibrators_[c] for c in range(n_calibrators)]
        if self.clf.method == "sigmoid":
            a_arr, b_arr = zip(*[(calibrator.a_, calibrator.b_) for calibrator in calibrators])
            return {
                "method": "SIGMOID",
                "from_proba": from_proba,
                "a_array": a_arr,
                "b_array": b_arr
            }
        elif self.clf.method == "isotonic":
            x_arr, y_arr = zip(*[extract_X_y_from_isotonic_regressor(calibrator) for calibrator in calibrators])
            return {
                "method": "ISOTONIC",
                "from_proba": from_proba,
                "x_array": x_arr,
                "y_array": y_arr
            }


class BinaryModelSerializer(ClassificationModelSerializer):
    def get_model(self):
        algo = self.modeling_params["algorithm"]
        if self.calibrate_proba:
            clf = self.clf.base_estimator
        else:
            clf = self.clf
        if algo == "LOGISTIC_REGRESSION":
            model = _serialize_binary_logit(clf)
        elif algo == "SGD_CLASSIFICATION":
            model = _serialize_binary_sgd(clf)
        elif algo == "GBT_CLASSIFICATION":
            model = _serialize_classification_gbm(clf, True)
        elif algo == "XGBOOST_CLASSIFICATION":
            model = SerializableModel("GRADIENT_BOOSTING_CLASSIFIER", _serialize_classification_xgb(clf, True))
        else:
            model = _common_classif_serialization(algo, clf)
        self.add_calibrator(model)
        return model


def _serialize_multicass_logit(clf):
    return _serialize_multicass_logistic(clf, "MULTINOMIAL" if clf.multi_class == "multinomial" else "ONE_VERSUS_ALL")

def _serialize_multicass_sgd(clf):
    if clf.loss == 'log':
        return _serialize_multicass_logistic(clf, "ONE_VERSUS_ALL")
    elif clf.loss == 'modified_huber':
        return _serialize_multicass_logistic(clf, "MODIFIED_HUBER")
    else:
        return None

def _serialize_multicass_logistic(clf, policy):
    model = {
        "coefficients": clf.coef_.tolist(),
        "intercept": clf.intercept_.tolist(),
        "policy": policy
    }
    return SerializableModel("LOGISTIC", model)


class MulticlassModelSerializer(ClassificationModelSerializer):
    def get_model(self):
        algo = self.modeling_params["algorithm"]
        if self.calibrate_proba:
            clf = self.clf.base_estimator
        else:
            clf = self.clf
        if algo == "LOGISTIC_REGRESSION":
            model = _serialize_multicass_logit(clf)
        elif algo == "SGD_CLASSIFICATION":
            model = _serialize_multicass_sgd(clf)
        elif algo == "GBT_CLASSIFICATION":
            model = _serialize_classification_gbm(clf, False)
        elif algo == "XGBOOST_CLASSIFICATION":
            model = SerializableModel("GRADIENT_BOOSTING_CLASSIFIER",_serialize_classification_xgb(clf, False))
        else:
            model = _common_classif_serialization(algo, clf)
        self.add_calibrator(model)
        return model
