import json
import logging

import six

from dataiku.doctor import utils, constants
from dataiku.doctor.diagnostics import diagnostics

logger = logging.getLogger(__name__)


def merge_listeners(plistener, mlistener):
    ret = json.loads(json.dumps(plistener.to_jsonifiable()))
    if mlistener is not None:
        mlistener_json = json.loads(json.dumps(mlistener.to_jsonifiable()))
        ret["stack"].extend(mlistener_json["stack"])
        ret["top_level_todo"].extend(mlistener_json["top_level_todo"])
        ret["top_level_done"].extend(mlistener_json["top_level_done"])
    return ret


class StrStep(object):
    def __init__(self, value):
        self.name = None
        self.value = value


class ProgressStep(object):
    def __init__(self, listener):
        self.listener = listener
        self.diagnostics = []

    def __exit__(self, typ, value, traceback):
        self.listener.pop_step()

    def __enter__(self):
        self.listener.save_status()
        return self


class AbstractContext(object):
    """
    Context used by a listener to save its state into the dedicated model folder.
    """
    def __init__(self, folder):
        self.folder = folder

    def save_status(self, listener, parent_listener):
        """
        Save the current listener(s) status(es)
        :param listener: current ProgressListener
        :param parent_listener: parent ProgressListener if exists, or None
        :return:
        """
        raise NotImplementedError()


class NoOpContext(AbstractContext):
    def save_status(self, listener, parent_listener):
        pass


class ModelStatusContext(AbstractContext):
    def __init__(self, folder, start):
        super(ModelStatusContext, self).__init__(folder)
        self.start = start

    def save_status(self, listener, parent_listener):
        if parent_listener is None:
            listeners = listener.to_jsonifiable()
        else:
            listeners = merge_listeners(parent_listener, listener)
        utils.write_running_traininfo(self.folder, self.start, listeners)


class ProgressListener(object):
    """
    ProgressListener records information about a training:
    - The top level steps: stored in `top_level_todo` (when training in the Lab, to be displayed in the model snippet) and moved to `top_level_done` when finished, must be an instance of constants.ProcessingStep
    - Sub-steps: stored in `stack`, may be a string or instances of constants.ProcessingStep
    For each top level step:
        - the current status
        - the time taken

    Diagnostics are always stored on the most outer step which must be an instance of constants.ProcessingStep
    Multiple diagnostics declared as:
        listener.add_future_step(constants.ProcessingStep.STEP_LOADING_SRC)
        with listener.push_step(constants.ProcessingStep.STEP_LOADING_SRC):
            with listener.push_step("sub step"):
                diagnostics.add_or_update(diagnostic_type, "message 1")
                with listener.push_step("sub step 2"):
                    diagnostics.add_or_update(diagnostic_type, "message 2")
    will be stored and displayed for the most outer step: constants.ProcessingStep.STEP_LOADING_SRC
    """
    def __init__(self, context=None, verbose=True):
        # Holds the top level step and then an arbitrary number of sub-steps defined in "top_level_todo". The first element must always be an instance of constants.ProcessingStep
        self.stack = []
        # Steps that will be displayed, items must be instances of constants.ProcessingStep
        self.top_level_todo = []
        # Finished steps that are displayed, items must be instances of constants.ProcessingStep
        self.top_level_done = []
        self.verbose = verbose
        self.top_level_step_start = 0
        if context is None:
            context = NoOpContext(None)
        self.context = context
        self.children = []
        self.parent = None

    def new_child(self, context=None):
        child = ProgressListener(context=context)
        child.parent = self
        self.children.append(child)
        return child


    def save_status(self):
        self.context.save_status(self, self.parent)
        for child in self.children:
            child.save_status()

    def merge(self, other):
        return merge_listeners(self, other)

    def to_jsonifiable(self):
        stack = [d.copy() for d in self.stack]
        return {
            "stack": stack,
            "top_level_todo": [s.value for s in self.top_level_todo],
            "top_level_done": self.top_level_done
        }

    def reset(self):
        self.top_level_todo = []
        self.top_level_done = []
        self.stack = []

    def add_future_step(self, state):
        self.top_level_todo.append(state)

    def add_future_steps(self, states):
        self.top_level_todo.extend(states)

    def push_step(self, step, target=None, previous_duration=None):
        if isinstance(step, six.string_types):
            step = StrStep(step)
        if self.verbose:
            logger.info("START -  " + step.value)
        if len(self.stack) == 0:
            assert isinstance(step, constants.ProcessingStep), 'Outer step "{}" must be an instance of constants.ProcessingStep)'.format(step.value)
            diagnostics.enter_step(step, self)
            self.top_level_step_start = utils.unix_time_millis()
            try:
                self.top_level_todo.remove(step)  # Removed from todo list, only used for training
            except:
                pass
        new_stack_step = {"name": step.value, "target": target, "startTimestamp": utils.unix_time_millis()}
        if previous_duration is not None:
            new_stack_step["previousDuration"] = previous_duration
        self.stack.append(new_stack_step)
        return ProgressStep(self)

    def pop_step(self):
        step = self.stack.pop()
        new_done_step = None
        step_name = step["name"]
        if self.verbose:
            logger.info("END -  " + step_name)
        if len(self.stack) == 0:
            step_len = utils.unix_time_millis() - self.top_level_step_start
            if "previousDuration" in step:
                step_len += step["previousDuration"]
            new_done_step = {"name": step_name, "time": step_len}
            self.top_level_done.append(new_done_step)
            diagnostics.exit_step()
        return new_done_step
