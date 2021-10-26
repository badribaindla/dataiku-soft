import abc
import numpy as np
from sklearn.linear_model import LogisticRegression, LinearRegression
from itertools import groupby
import logging
import tempfile


import os.path as osp

from dataiku.base.utils import TmpFolder
from dataiku.doctor.prediction.regression_scoring import regression_predict
from dataiku.doctor.preprocessing_collector import PredictionPreprocessingDataCollector
from dataiku.doctor.utils import dku_pickle
from dataiku.core import dkujson as dkujson
import pandas as pd

logger = logging.getLogger(__name__)

# Used by training recipe.


class EnsembleRegressor:
    def __init__(self, ensemble_params, core_params, split_desc):
        self.ensemble_params = ensemble_params
        self.split_desc = split_desc
        self.core_params = core_params

    def _fit_one(self, modeling_params, prediction_type, pipe, X, y):
        pred = None
        proba = None
        if modeling_params["algorithm"] == "PYTHON_ENSEMBLE":
            # required to import locally to avoid circular import
            from dataiku.doctor.prediction.regression_fit import regression_fit_ensemble
            from dataiku.doctor.prediction.classification_fit import classification_fit_ensemble
            if prediction_type == "REGRESSION":
                clf = regression_fit_ensemble(modeling_params, self.core_params, self.split_desc, X, y)[0]
                pred = clf.predict(X)
            else:
                clf = classification_fit_ensemble(modeling_params, self.core_params, self.split_desc, X, y)[0]
                if self.ensemble_params["proba_inputs"]:
                    proba = clf.predict_proba(X)
                else:
                    pred = clf.predict(X)
        else:
            train_transformed = pipe.process(X)
            train_X = train_transformed["TRAIN"].as_np_array()
            if prediction_type == "REGRESSION":
                # required to import locally to avoid circular import
                from dataiku.doctor.prediction.regression_fit import regression_fit_single
                clf = regression_fit_single(modeling_params, self.split_desc, train_transformed)[0]
                pred = clf.predict(train_X)
            else:
                from dataiku.doctor.prediction.classification_fit import classification_fit
                target_map = get_target_map(self.ensemble_params)
                clf = classification_fit(modeling_params, self.split_desc, train_transformed,
                                         self.core_params["prediction_type"], target_map=target_map)[0]
                if self.ensemble_params["proba_inputs"]:
                    proba = clf.predict_proba(train_X)
                else:
                    pred = clf.predict(train_X)
        return clf, pred, proba

    def fit(self, X, y, sample_weight=None):
        """
            Returns a pair (clf, train_X), where clf is the trained EnsembleModel and train_X is the training data
            ndarray obtained from the given multiframe
        """
        prediction_type = self.core_params["prediction_type"]
        model_ids = self.ensemble_params["model_ids"]
        prep_hashes = self.ensemble_params["preprocessing_hashes"]
        hashes_grouped = {a: list(b) for a, b in groupby(prep_hashes.items(), lambda x: x[1])}
        mod_map = {i: mod for (i, mod) in zip(model_ids, self.ensemble_params["modeling_params"])}
        pipelines_with_target, pipelines_without_target, collectors = self.fit_pipelines(X)
        clf_map = {}
        preds = []
        probas = []
        for hash, pipe in zip(self.ensemble_params["ordered_hashes"], pipelines_with_target):
            for (model_id, h) in hashes_grouped[hash]:
                modeling_params = mod_map[model_id]
                logger.info("Training algorithm %s with id %s " % (modeling_params["algorithm"], model_id))
                clf, pred, proba = self._fit_one(modeling_params, prediction_type, pipe, X, y)
                if pred is not None:
                    preds.append(pred)
                if proba is not None:
                    probas.append(proba)
                clf_map[model_id] = clf
        clfs = [clf_map[i] for i in model_ids]
        if prediction_type == "REGRESSION":
            ensembler = get_regression_ensembler(self.ensemble_params, preds, y, sample_weight)
        else:
            n_classes = len(self.ensemble_params["preprocessing_params"][0]["target_remapping"])
            if self.ensemble_params["proba_inputs"]:
                ensembler = get_probabilistic_ensembler(n_classes, self.ensemble_params, probas, y, sample_weight)
            else:
                ensembler = get_classifier_ensembler(n_classes, self.ensemble_params, preds, y, sample_weight)

        return EnsembleModel(self.core_params, self.ensemble_params, pipelines_without_target,
                             pipelines_with_target, clfs, ensembler)

    def fit_pipelines(self, X):
        from dataiku.doctor.preprocessing_handler import PredictionPreprocessingHandler
        pipelines_with_target = []  # for training/evaluation
        pipelines_without_target = []  # for scoring new data
        collectors = []
        for prep in self.ensemble_params["preprocessing_params"]:
            collector = PredictionPreprocessingDataCollector(X, prep)
            collector_data = collector.build()
            collectors.append(collector_data)
            with TmpFolder(tempfile.gettempdir()) as temp_dir:
                preproc_handler = PredictionPreprocessingHandler.build(self.core_params, prep, temp_dir)
                preproc_handler.set_selection_state_folder(temp_dir)
                preproc_handler.collector_data = collector_data
                pipeline = preproc_handler.build_preprocessing_pipeline(with_target=True)
                pipeline.fit_and_process(X)
                pipelines_with_target.append(pipeline)

               # `pipeline_without_target` is not fitted since the corresponding pipeline with target already is.
               #  Hence data for the common steps is already saved and available in `preproc_handler` resources.
                # NB: no need to `preproc_handler.save_data()` beforehand neither, which
                #     dumps pipeline data to disk, because the data is stored in memory
                #     in the preproc_handler resources.
                pipeline_without_target = preproc_handler.build_preprocessing_pipeline(with_target=False)
                pipelines_without_target.append(pipeline_without_target)

        return pipelines_with_target, pipelines_without_target, collectors


def is_probabilistic(ensemble_params):
    method = ensemble_params["method"]
    if method == "VOTE":
        return False
    return True


def get_regression_ensembler(ensemble_params, preds, y, sample_weight=None):
    method = ensemble_params["method"]
    if method == "AVERAGE":
        ensembler = AverageEnsembler()
    elif method == "LINEAR_MODEL":
        ensembler = LinearEnsembler()
    elif method == "MEDIAN":
        ensembler = MedianEnsembler()
    else:
        raise ValueError("Invalid method for regression ensembling : " + method)
    ensembler.fit(preds, y, sample_weight=sample_weight)
    return ensembler


def get_probabilistic_ensembler(n_classes, ensemble_params, probas, y, sample_weight=None, with_class_weight=False):
    method = ensemble_params["method"]
    if method == "PROBA_AVERAGE":
        ensembler = ProbabilisticAverageEnsembler(n_classes)
    elif method == "LOGISTIC_MODEL":
        ensembler = LogisticProbaEnsembler(n_classes)
    else:
        raise ValueError("Invalid method for probabilistic ensembling : " + method)
    if with_class_weight:
        from dataiku.doctor.prediction.classification_fit import get_class_weight_dict
        class_weight_dict = get_class_weight_dict(y)
        class_weight_arr = np.vectorize(class_weight_dict.get)(y)
        if sample_weight is None:
            sample_weight = class_weight_arr
        else:
            sample_weight *= class_weight_arr
    ensembler.fit(probas, y, sample_weight=sample_weight)
    return ensembler


def get_classifier_ensembler(n_classes, ensemble_params, preds, y, sample_weight=None, with_class_weight=False):
    method = ensemble_params["method"]
    if method == "VOTE":
        ensembler = VotingEnsembler(n_classes)
    elif method == "LOGISTIC_MODEL":
        ensembler = LogisticClassifEnsembler(n_classes)
    else:
        raise ValueError("Invalid method for classification ensembling : " + method)
    if with_class_weight:
        from dataiku.doctor.prediction.classification_fit import get_class_weight_dict
        class_weight_dict = get_class_weight_dict(y)
        class_weight_arr = np.vectorize(class_weight_dict.get)(y)
        if sample_weight is None:
            sample_weight = class_weight_arr
        else:
            sample_weight *= class_weight_arr
    ensembler.fit(preds, y, sample_weight=sample_weight)
    return ensembler


def extract_probas(p_df, target_map):
    class_map = {t["mappedValue"]: t["sourceValue"] for t in target_map}
    series = [p_df["proba_" + class_map[i]] for i in range(0, len(target_map))]
    return np.column_stack(series)

def get_target_map(ensemble_params):
    target_map = None if "target_remapping" not in ensemble_params["preprocessing_params"][0] else \
        {x["sourceValue"]: x["mappedValue"] for x in ensemble_params["preprocessing_params"][0]["target_remapping"]}
    return target_map

# used by doctor to combine models which are already trained
def ensemble_from_fitted(core_params, ensemble_params, prep_folders, model_folders, train, with_sample_weight=False, with_class_weight=False):
    logger.debug("creating ensemble for doctor")
    model_ids = ensemble_params["model_ids"]
    prep_hashes = ensemble_params["preprocessing_hashes"]
    rppp_map = {h: prep for h, prep in zip(ensemble_params["ordered_hashes"], ensemble_params["preprocessing_params"])}
    pipe_map = {}
    preds = []
    clfs = []
    y = None
    sample_weight = None
    target_map = None if "target_remapping" not in ensemble_params["preprocessing_params"][0] else \
        {x["sourceValue"]: x["mappedValue"] for x in ensemble_params["preprocessing_params"][0]["target_remapping"]}
    proba_inputs = ensemble_params["proba_inputs"]
    for i in range(len(model_ids)):
        fmi = model_ids[i]
        hash = prep_hashes[fmi]
        prep = rppp_map[hash]
        if hash in pipe_map:
            # prep pipeline was already cached
            pipe_with_target = pipe_map[hash]["with_target"]
        else:
            # load the preparation pipeline
            from dataiku.doctor.preprocessing_handler import PredictionPreprocessingHandler
            prep_folder = prep_folders[i]
            collector_data = dkujson.load_from_filepath(osp.join(prep_folder, "collector_data.json"))

            # Build a pipe with target for fitting the ensemble
            preprocessing_handler = PredictionPreprocessingHandler.build(core_params, prep, prep_folder)
            preprocessing_handler.collector_data = collector_data
            pipe_with_target = preprocessing_handler.build_preprocessing_pipeline(with_target=True)

            # Also build a pipe without target for scoring
            preprocessing_handler = PredictionPreprocessingHandler.build(core_params, prep, prep_folder)
            preprocessing_handler.collector_data = collector_data
            scorable_pipe = preprocessing_handler.build_preprocessing_pipeline(with_target=False)

            pipe_map[hash] = {"with_target" : pipe_with_target, "scorable" : scorable_pipe}
        with open(osp.join(model_folders[i], "clf.pkl"), "rb") as clf_file:
            clf = dku_pickle.load(clf_file)
        clfs.append(clf)
        if y is None:
            # because some rows might be dropped, we have to recover the target here
            # transformed is done on the first ensemble, because we are just dropping rows and every sub-models will be aligned, but the transformed will be different
            # We just need `y` and `sample_weight` which would be the same for all sub-models
            transformed = pipe_with_target.process(train)
            y = transformed["target"]
            # For classification need to treat classes, i.e. y values, as integers
            if core_params["prediction_type"] in ["BINARY_CLASSIFICATION", "MULTICLASS"]:
                y = y.astype(int)
            # because some rows might be dropped, we have to recover the sample weights here
            if with_sample_weight:
                sample_weight = transformed["weight"]
        # todo : group this to avoid multiple preprocessings.
        modeling_params = ensemble_params["modeling_params"][i]
        if core_params["prediction_type"] == "REGRESSION":
            p = regression_predict(clf, pipe_with_target, modeling_params, train)["prediction"]
        elif core_params["prediction_type"] == "BINARY_CLASSIFICATION":
            threshold = 0.5 if "thresholds" not in ensemble_params else ensemble_params["thresholds"][i]
            from dataiku.doctor.prediction import binary_classification_predict
            p_df = binary_classification_predict(clf, pipe_with_target, modeling_params, target_map, threshold, train).pred_and_proba_df
            if proba_inputs:
                p = extract_probas(p_df, prep["target_remapping"])
            else:
                p = p_df["prediction"]
        else:
            from dataiku.doctor.prediction import multiclass_predict
            p_df = multiclass_predict(clf, pipe_with_target, modeling_params, target_map, train).pred_and_proba_df
            if proba_inputs:
                p = extract_probas(p_df, prep["target_remapping"])
            else:
                p = p_df["prediction"]
        preds.append(p)

    # fit the ensemble
    if core_params["prediction_type"] == "REGRESSION":
        ensembler = get_regression_ensembler(ensemble_params, preds, y, sample_weight)
    elif proba_inputs:
        ensembler = get_probabilistic_ensembler(len(prep["target_remapping"]), ensemble_params, preds, y, sample_weight, with_class_weight)
    else:
        ensembler = get_classifier_ensembler(len(prep["target_remapping"]), ensemble_params, preds, y, sample_weight, with_class_weight)

    scorable_pipes = [pipe_map[h]["scorable"] for h in ensemble_params["ordered_hashes"]]
    pipes_with_target = [pipe_map[h]["with_target"] for h in ensemble_params["ordered_hashes"]]
    return EnsembleModel(core_params, ensemble_params, scorable_pipes, pipes_with_target, clfs, ensembler)


# a fitted ensemble model
class EnsembleModel:
    def __init__(self, core_params, ensemble_params, scorable_pipelines, pipelines_with_target, clfs, ensembler, thresholds=None):
        self.core_params = core_params
        self.ensemble_params = ensemble_params
        self.scorable_pipelines = scorable_pipelines
        self.pipelines_with_target = pipelines_with_target
        self.clfs = clfs
        self.ensembler = ensembler
        self.thresholds = [None for c in clfs] if thresholds is None else thresholds
        if core_params["prediction_type"] != "REGRESSION":
            self.target_map = {t["mappedValue"]: t["sourceValue"] for t in
                          self.ensemble_params["preprocessing_params"][0]["target_remapping"]}
            self.classes = ["proba_" + self.target_map[i] for i in range(len(self.target_map))]
            self.classes_ = [i for i in range(len(self.classes))]

        self.active_pipelines = self.scorable_pipelines

    def set_with_target_pipelines_mode(self,use_with_target):
        if use_with_target:
            self.active_pipelines = self.pipelines_with_target
        else:
            self.active_pipelines = self.scorable_pipelines

    def _reindex_probas(self, clf, probas):
        """
            Since probas output by a scikit clf are not necessarily in the order given by the target, we have to re-index them
        """
        (nb_rows, nb_present_classes) = probas.shape
        new_probas = np.zeros((nb_rows, len(self.target_map)))
        for j in range(nb_present_classes):
            actual_class_id = clf.classes_[j]
            new_probas[:, actual_class_id] = probas[:, j]
        return new_probas

    def _predict_one(self, clf, pipe, m_params, prepped_data, X, index):
        input_probas = self.ensembler.inputs_probas()
        if m_params["algorithm"] == "PYTHON_ENSEMBLE":
            if input_probas:
                p_df = clf.predict_proba_as_dataframe(X)
                p = p_df.values
            else:
                p_df = clf.predict_as_dataframe(X)
                p = p_df["prediction"].values
            if index is None:
                index = p_df.index
        else:
            if prepped_data is None:
                prepped_data = pipe.process(X)  # cache the preprocessed data for later use
            to_score = prepped_data["TRAIN"]
            if index is None:
                index = to_score.index

            to_score_np = to_score.as_np_array()
            if to_score_np.size == 0:
                p = np.asarray([])
            else:
                if input_probas:
                    p = clf.predict_proba(to_score_np)
                    p = self._reindex_probas(clf, p)
                else:
                    p = clf.predict(to_score_np)
        return p, index

    def _predict_base(self, X, output_probas):
        """
            Returns the predicted data as a dataframe, where the index is that of all the dataframes obtained through
            preprocessings from the submodels.

            Algorithm is the following :
                - first we group the models by preprocessing, in order not to recompute preprocessings multiple times
                - then we iterate on models from that group. If it's an ensemble we proceed without preprocessing
                - if it's not an ensemble, we used the cached preprocessed data for that group, or compute the data
                  if missing.

        """
        model_ids = self.ensemble_params["model_ids"]
        modeling_params = {i: m for i, m in zip(model_ids, self.ensemble_params["modeling_params"])}
        prep_hashes = self.ensemble_params["preprocessing_hashes"]
        hashes_grouped = groupby(prep_hashes.items(), lambda x: x[1])
        prep_map = {h: pipe for (h, pipe) in zip(self.ensemble_params["ordered_hashes"], self.active_pipelines)}
        clf_map = {i: clf for (i, clf) in zip(model_ids, self.clfs)}
        preds = []
        index = None
        for hash, group in hashes_grouped:
            pipe = prep_map[hash]
            prepped_data = None
            for m_id, hash in group:
                m_params = modeling_params[m_id]
                clf = clf_map[m_id]
                p, index = self._predict_one(clf, pipe, m_params, prepped_data, X, index)
                preds.append(p)

        if np.all(np.asarray(preds).size == 0):
            return pd.DataFrame(columns=["prediction"], index=index)

        if output_probas:
            p = self.ensembler.ensemble_probas(preds)
            if hasattr(self.ensembler, 'clf') and hasattr(self.ensembler.clf, 'classes_'):
                p = self._reindex_probas(self.ensembler.clf, p)
            preds_df = pd.DataFrame(p, index=index, columns=self.classes)
        else:
            p = self.ensembler.ensemble_predictions(preds)
            preds_df = pd.DataFrame({"prediction": p}, index=index)
        return preds_df

    def predict_as_dataframe(self, X):
        return self._predict_base(X, False)

    def predict(self, X):
        return self.predict_as_dataframe(X)["prediction"].values

    def predict_proba_as_dataframe(self, X):
        return self._predict_base(X, True)

    def predict_proba(self, X):
        return self.predict_proba_as_dataframe(X).values


class Ensembler:
    def __init__(self):
        pass

    @abc.abstractmethod
    def fit(self, preds, y, sample_weight=None):
        return

    @abc.abstractmethod
    def ensemble_predictions(self, preds):
        return

    def inputs_probas(self):
        return False

    def outputs_probas(self):
        return False


class ClassificationEnsembler(Ensembler):
    def __init__(self, n_classes):
        Ensembler.__init__(self)
        self.n_classes = n_classes

    @abc.abstractmethod
    def ensemble_predictions(self, preds):
        pass

    @abc.abstractmethod
    def ensemble_probas(self, preds):
        pass

    def fit(self, preds, y, sample_weight=None):
        pass

    def inputs_probas(self):
        return False

    def outputs_probas(self):
        return True


class ProbabilisticEnsembler(Ensembler):
    def __init__(self, n_classes):
        Ensembler.__init__(self)
        self.n_classes = n_classes

    def inputs_probas(self):
        return True

    def outputs_probas(self):
        return True

    @abc.abstractmethod
    def ensemble_probas(self, probas):
        return


class AverageEnsembler(Ensembler):
    def __init__(self):
        Ensembler.__init__(self)

    def fit(self, preds, y, sample_weight=None):
        pass

    def ensemble_predictions(self, preds):
        res = np.zeros(len(preds[0]))
        for p in preds:
            res += p
        res /= len(preds)
        return res


class MedianEnsembler(Ensembler):
    def __init__(self):
        Ensembler.__init__(self)

    def ensemble_predictions(self, preds):
        return np.median(np.column_stack(preds), axis=1)

    def fit(self, preds, y, sample_weight=None):
        pass


class LinearEnsembler(Ensembler):
    def __init__(self):
        Ensembler.__init__(self)
        self.clf = None

    def fit(self, preds, y, sample_weight=None):
        X = np.array(preds).transpose()
        self.clf = LinearRegression().fit(X, y, sample_weight=sample_weight)

    def ensemble_predictions(self, preds):
        if self.clf is None:
            raise ValueError("Must fit ensembler first")
        return self.clf.predict(np.array(preds).transpose())


class VotingEnsembler(ClassificationEnsembler):
    def __init__(self, n_classes):
        ClassificationEnsembler.__init__(self, n_classes)
        self.clf = None

    def ensemble_probas(self, preds):
        probas = []
        size = preds[0].shape[0]
        for i in range(0, self.n_classes):
            c = np.zeros(size)
            cst = np.full(size, i)
            for p in preds:
                c += (p == cst).astype(int)
            probas.append(c / len(preds))
        return np.column_stack(probas)

    def ensemble_predictions(self, preds):
        p = self.ensemble_probas(preds)
        return np.argmax(p, axis=1)

    def fit(self, preds, y, sample_weight=None):
        pass


class LogisticClassifEnsembler(ClassificationEnsembler):
    def __init__(self, n_classes):
        ClassificationEnsembler.__init__(self, n_classes)
        self.clf = None

    def fit(self, preds, y, sample_weight=None):
        X = np.column_stack(preds)
        self.clf = LogisticRegression(solver='liblinear', multi_class='ovr').fit(X, y, sample_weight=sample_weight)

    def ensemble_predictions(self, preds):
        if self.clf is None:
            raise ValueError("Must fit ensembler first")
        return self.clf.predict(np.column_stack(preds))

    def ensemble_probas(self, preds):
        if self.clf is None:
            raise ValueError("Must fit ensembler first")
        return self.clf.predict_proba(np.column_stack(preds))


class LogisticProbaEnsembler(ProbabilisticEnsembler):
    def __init__(self, n_classes):
        ProbabilisticEnsembler.__init__(self, n_classes)
        self.clf = None

    def coerce_probas(self, probas):
        # drop one proba column to avoid colinearity
        if probas[0].shape[1] > 1:
            probas = [x[:, 1:] for x in probas]
        probas = np.concatenate(probas, axis=1).clip(1e-16, 1-1e-16)
        return np.log(probas / (1 - probas))

    def fit(self, preds, y, sample_weight=None):
        X = self.coerce_probas(preds)
        self.clf = LogisticRegression(solver='liblinear', multi_class='ovr').fit(X, y, sample_weight=sample_weight)

    def ensemble_predictions(self, preds):
        if self.clf is None:
            raise ValueError("Must fit ensembler first")
        return self.clf.predict(self.coerce_probas(preds))

    def ensemble_probas(self, preds):
        return self.clf.predict_proba(self.coerce_probas(preds))


class ProbabilisticAverageEnsembler(ProbabilisticEnsembler):
    def __init__(self, n_classes):
        ProbabilisticEnsembler.__init__(self, n_classes)

    def fit(self, preds, y, sample_weight=None):
        pass

    def ensemble_predictions(self, preds):
        p = self.ensemble_probas(preds)
        return np.argmax(p, axis=1)

    def ensemble_probas(self, probas):
        p = probas[0]
        for i in range(1, len(probas)):
            p += probas[i]
        return p / len(probas)
