# coding: utf-8
from __future__ import unicode_literals
import logging
import threading
from contextlib import contextmanager

import six
from enum import Enum

from dataiku.doctor import utils

logger = logging.getLogger(__name__)


class DiagnosticType(Enum):
    """ Keep in sync with Enum in the backend WarningContext.WarningType """
    ML_DIAGNOSTICS_DATASET_SANITY_CHECKS = "ML_DIAGNOSTICS_DATASET_SANITY_CHECKS"
    ML_DIAGNOSTICS_MODELING_PARAMETERS = "ML_DIAGNOSTICS_MODELING_PARAMETERS"
    ML_DIAGNOSTICS_TRAINING_OVERFIT = "ML_DIAGNOSTICS_TRAINING_OVERFIT"
    ML_DIAGNOSTICS_LEAKAGE_DETECTION = "ML_DIAGNOSTICS_LEAKAGE_DETECTION"
    ML_DIAGNOSTICS_MODEL_CHECK = "ML_DIAGNOSTICS_MODEL_CHECK"
    ML_DIAGNOSTICS_ML_ASSERTIONS = "ML_DIAGNOSTICS_ML_ASSERTIONS"
    ML_DIAGNOSTICS_RUNTIME = "ML_DIAGNOSTICS_RUNTIME"


@six.python_2_unicode_compatible
class DoctorDiagnostic(object):
    """
    Class that stores types and message
    A diagnostic_type must match the corresponding WarningsContext.WarningType in the backend
    """

    def __init__(self, diagnostic_type, message, diagnostic_id=None):
        """
        :param DiagnosticType diagnostic_type: type associated with the diagnostic, the corresponding WarningsContext.WarningType in the backend
        :param string message: message that will be displayed to the user
        :param string diagnostic_id: id of the diagnostic, so it can be "edited" from the list
        """
        self.type = diagnostic_type
        self.message = message
        self.diagnostic_id = diagnostic_id
        self.step = None  # Current step in which the diagnostic was generated

    def __str__(self):
        if self.diagnostic_id:
            return "<{}(id:{}) {}: {}>".format(self.__class__.__name__, self.diagnostic_id, self.type.value, self.message)
        return "<{} {}: {}>".format(self.__class__.__name__, self.type.value, self.message)

    def to_dict(self):
        return {
            "type": self.type.name,
            "message": self.message,
            "step": self.step.value,
        }


class DiagnosticCallback(object):
    """
    Object to subclass to add custome diagnostics at the end of each ProgressStep
    Each method must return a list of DoctorDiagnostic object or None
    Implement the method "on_${STEP_NAME}" to generate the diagnostic for said Step
    """
    def __init__(self, diagnostic_type):
        self.diagnostic_type = diagnostic_type

    def on_load_train_dataset_end(self, prediction_type=None, df=None, target_variable=None):
        pass

    def on_load_test_dataset_end(self, prediction_type=None, df=None, target_variable=None):
        pass

    def on_fitting_end(self, prediction_type=None, clf=None, train_target=None, features=None):
        pass

    def on_scoring_end(self, model_params=None, transformed_test=None, transformed_train=None, with_sample_weight=False):
        pass

    def on_processing_all_kfold_end(self, prediction_type=None, folds=None, with_sample_weight=False, perf_data=None):
        pass


class AbstractDiagnosticsContext(object):
    """
    Base class that defines default methods for calling diagnostics on registered callbacks
    All methods need to be reimplemented
    """
    def is_type_enabled(self, diagnostic_type):
        """ true if diagnostic_type is enabled in that context """
        return True

    def register_callback(self, cb):
        """
        register a callback to be called by the module scoped on_* functions on the current DiagnosticContext
        :param cb: an instance of DiagnosticCallback
        """
        raise NotImplementedError()

    def callbacks(self):
        """
        :return: list of registered callbacks
        """
        raise NotImplementedError()

    def add_or_update(self, diagnostic):
        """
        Add a diagnostic to be stored for the current ProgressStep
        Update it with the new diagnostic if a diagnostic with the same id already exists
        :param diagnostic: an instance of DoctorDiagnostic
        """
        raise NotImplementedError()

    def delete(self, diagnostic_id):
        """
        Delete diagnostic identified by `diagnostic_id`
        """
        raise NotImplementedError()

    def enter_step(self, step, listener):
        """
        Set the current step (ProgressStep) to the context
        :param step: an instance of ProgressStep
        :param listener: the current listener, used to save diagnostics
        """
        raise NotImplementedError()

    def exit_step(self):
        """
        Remove the current step (ProgressStep) from the context
        """
        raise NotImplementedError()

    def save(self):
        """
        Save all diagnostics
        """
        raise NotImplementedError()


class DefaultDiagnosticsContext(AbstractDiagnosticsContext):
    """
    The default context for storing diagnostics and registered callbacks for all ProgressSteps
    Thread safe
    """
    def __init__(self):
        self._step = None  # current step where the diagnostics will be saved
        self._listener = None  # current listener, used to save diagnostics
        self._callbacks = []  # Registered DiagnosticCallback to be called at the end of each ProgressStep
        self._lock = threading.RLock()
        self._diagnostics = []  # Diagnostics generated for the current step, cleared at the end of a step
        self._enabled_types = {}

    def is_type_enabled(self, diagnostic_type):
        """ true if diagnostic_type is enabled in that context """
        return self._enabled_types.get(diagnostic_type, False)

    def register_callback(self, cb):
        with self._lock:
            self._callbacks.append(cb)

    def callbacks(self):
        return self._callbacks

    def save(self):
        with self._lock:
            if self._step is None:
                raise Exception("must be inside a ProgressStep to save diagnostics")
            self._save_from_listener(self._listener)

    def _save_from_listener(self, listener):
        with self._lock:
            folder = listener.context.folder
            if folder is not None and len(self._diagnostics) > 0:
                utils.save_diagnostics(folder, self._diagnostics)
            for child in listener.children:
                self._save_from_listener(child)

    def add_or_update(self, diagnostic):
        with self._lock:
            if not self.is_type_enabled(diagnostic.type):
                return
            if self._step is None:
                raise Exception("must be inside a ProgressStep to add a diagnostic")
            diagnostic.step = self._step
            for i, h in enumerate(self._diagnostics):
                if diagnostic.diagnostic_id is not None and h.diagnostic_id == diagnostic.diagnostic_id:
                    logger.info("Editing diagnostic: {}".format(diagnostic))
                    self._diagnostics[i] = diagnostic
                    return
            # Diagnostic was not found, just add it
            logger.info("Adding diagnostic: {}".format(diagnostic))
            self._diagnostics.append(diagnostic)

    def delete(self, diagnostic_id):
        with self._lock:
            if self._step is None:
                raise Exception("must be inside a ProgressStep to add a diagnostic")
            for i, h in enumerate(self._diagnostics):
                if diagnostic_id == h.diagnostic_id:
                    del self._diagnostics[i]
                    return

    def enter_step(self, step, listener):
        with self._lock:
            self._step = step
            self._listener = listener

    def exit_step(self):
        """ clear step """
        with self._lock:
            self._step = None
            self._listener = None


class _DiagnosticsContextStore(object):
    """
    Singleton that stores the current diagnostic context, global to the whole Python process
    Access this class should be done by the `get_context` / `with_context` module functions
    Thread safe
    """
    _lock = threading.Lock()
    _context = DefaultDiagnosticsContext()

    @classmethod
    def get_context(cls):
        with cls._lock:
            return cls._context

    @classmethod
    def set_context(cls, ctx):
        with cls._lock:
            cls._context = ctx


def get_context():
    return _DiagnosticsContextStore.get_context()


@contextmanager
def with_context(ctx):
    old_ctx = get_context()
    _DiagnosticsContextStore.set_context(ctx)
    yield ctx
    _DiagnosticsContextStore.set_context(old_ctx)


def register(callbacks, settings):
    """ Register callbacks to be called at the end of a ProgressStep.
        :param callbacks: list: list of callbacks that will be called. The callback must be an instance of DiagnosticCallback
        :param settings: dict: with "enabled": boolean and settings: list of diagnostics {"type": DiagnosticType, "enabled": boolean}
    """
    if not settings.get("enabled", False):  # Do not register anything if diagnostics are disabled
        logger.info("disabling diagnostics")
        return

    ctx = get_context()
    ctx._enabled_types = {DiagnosticType[s["type"]]: s["enabled"] for s in settings["settings"]}
    for cb in callbacks:
        assert isinstance(cb, DiagnosticCallback)
        if ctx.is_type_enabled(cb.diagnostic_type):
            logger.info("enabling diagnostic callback: {} of type {}".format(cb.__class__.__name__, cb.diagnostic_type))
            ctx.register_callback(cb)


def disable():
    """ disable all diagnostics: do not register any diagnostics, so nothing will be raised """
    register([], {})


def enter_step(step, listener):
    ctx = get_context()
    ctx.enter_step(step, listener)


def exit_step():
    """ clear current step """
    ctx = get_context()
    ctx.exit_step()


def add_or_update(typ, msg, diagnostic_id=None):
    """ Add a diagnostic for the current ProcessingStep, inside a ProgressStep
        Fails if outside a ProgressStep
        If diagnostic_id is not None and another diagnostic has that id, update it instead
    """
    ctx = get_context()
    ctx.add_or_update(DoctorDiagnostic(typ, msg, diagnostic_id=diagnostic_id))
    ctx.save()


def delete(diagnostic_id):
    """
    Delete the diagnostic identified by `diagnostic_id`
    """
    ctx = get_context()
    ctx.delete(diagnostic_id)
    ctx.save()


def on_load_train_dataset_end(prediction_type=None, df=None, target_variable=None):
    _call_callbacks("on_load_train_dataset_end", prediction_type=prediction_type, df=df, target_variable=target_variable)


def on_load_test_dataset_end(prediction_type=None, df=None, target_variable=None):
    _call_callbacks("on_load_test_dataset_end", prediction_type=prediction_type, df=df, target_variable=target_variable)


def on_fitting_end(prediction_type=None, clf=None, train_target=None, features=None):
    _call_callbacks("on_fitting_end", features=features, clf=clf, prediction_type=prediction_type, train_target=train_target)


def on_scoring_end(scorer=None, prediction_type=None, transformed_test=None, transformed_train=None, with_sample_weight=False):
    model_params = ModelParams(prediction_type, scorer)
    _call_callbacks("on_scoring_end", model_params=model_params, transformed_test=transformed_test, transformed_train=transformed_train, with_sample_weight=with_sample_weight)


def on_processing_all_kfold_end(prediction_type=None, folds=None, with_sample_weight=False, perf_data=None):
    if folds is not None:
        folds = [{"model_params": ModelParams(prediction_type, f["scorer"]),
                  "transformed_train": f["transformed_train"],
                  "transformed_test": f["transformed_test"]}
                 for f in folds]
    _call_callbacks("on_processing_all_kfold_end", folds=folds, with_sample_weight=with_sample_weight, perf_data=perf_data, prediction_type=prediction_type)


class ModelParams(object):
    def __init__(self, prediction_type, scorer):
        self.prediction_type = prediction_type
        self.metrics = None
        self.perf_data = None
        self.algorithm = None
        if scorer is not None:
            self.metrics = scorer.modeling_params["metrics"]
            self.perf_data = scorer.perf_data
            self.algorithm = scorer.modeling_params["algorithm"]


def _dispatch(func_name, cb, **kwargs):
    """
    Dispatch diagnostic generation to cb based on step name
    :param func_name: function to call on the callback
    :param cb: the callback to be called, must have a method named "on_${func_name}" to be called
    :return: list of diagnostics (DoctorDiagnostic) at the given step or None
    """
    logger.debug("calling {}.{}()".format(cb.__class__.__name__, func_name))
    if not hasattr(cb, func_name):
        logger.debug("{} not found for {}".format(func_name, cb.__class__.__name__))
        return []

    func = getattr(cb, func_name)
    if not callable(func):
        logger.debug("{}.{} is not callable".format(cb.__class__.__name__, func_name))
        return []

    diagnostics = func(**kwargs)
    if diagnostics is None:
        return []
    logger.debug("{}.{}() generated diagnostics: {}".format(cb.__class__.__name__, func_name, diagnostics))
    return diagnostics


def _call_callbacks(func_name, **kwargs):
    ctx = get_context()
    for cb in ctx.callbacks():
        for msg in _dispatch(func_name, cb, **kwargs):
            if not isinstance(msg, six.string_types):
                logger.warning("removing warning {} from list because it is not an instance a string".format(msg))
                continue
            ctx.add_or_update(DoctorDiagnostic(cb.diagnostic_type, msg))
    ctx.save()
