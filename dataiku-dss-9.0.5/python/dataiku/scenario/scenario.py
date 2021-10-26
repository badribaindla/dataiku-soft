#!/usr/bin/env python
# encoding: utf-8
"""
scenario.py : callbacks for scenarios
Copyright (c) 2013-2015 Dataiku SAS. All rights reserved.
"""

import json
import logging
from dataiku.base import remoterun
from dataiku.core.intercom import backend_json_call
from dataiku.core.intercom import backend_void_call
from .step import StepHandle
from .messaging import ScenarioMessageSender
from .build_state import BuildState


class Scenario:
    """
    Handle to the current (running) scenario.
    """
    def __init__(self):
        self.project_key = remoterun.get_env_var('DKU_CURRENT_PROJECT_KEY')
        if remoterun.has_env_var('DKU_CURRENT_SCENARIO_TRIGGER_FILE'):
            trigger_json_file = remoterun.get_env_var('DKU_CURRENT_SCENARIO_TRIGGER_FILE')
            with open(trigger_json_file, 'r') as f:
                self.scenario_trigger = json.load(f)
        else:
            self.scenario_trigger = None
            
    def add_report_item(self, object_ref, partition, report_item):
        """
        When used in the code of a custom step, adds a report item to the current step run
        """
        backend_void_call("scenarios/add-step-report-item", data={
            'objectRef' : object_ref,
            'partition' : partition,
            'reportItem' : json.dumps(report_item)
        })

    def get_message_sender(self, channel_id, type=None):
        """
        Gets a sender for reporting messages, using one of DSS's Messaging channels
        """
        return ScenarioMessageSender(channel_id, type)

    def get_build_state(self):
        """Gets a handle to query previous builds"""
        return BuildState()

    def get_trigger_type(self):
        """
        Returns the type of the trigger that launched this scenario run
        """
        return self.scenario_trigger['trigger']['type'] if self.scenario_trigger is not None else None

    def get_trigger_name(self):
        """
        Returns the name (if defined) of the trigger that launched this scenario run
        """
        return self.scenario_trigger['trigger'].get('name', None) if self.scenario_trigger is not None else None

    def get_trigger_params(self):
        """
        Returns a dictionary of the params set by the trigger that launched this scenario run
        """
        return self.scenario_trigger['params'] if self.scenario_trigger is not None else None

    def set_scenario_variables(self, **kwargs):
        """
        Define additional variables in this scenario run
        """
        backend_json_call("scenarios/set-variables/", {
            "variables" : json.dumps(kwargs)
        }, err_msg = "Failed to set scenario variables")

    def get_previous_steps_outputs(self):
        """
        Returns the results of the steps previously executed in this scenario run. For example, if a SQL
        step ran before in the scenario, and its name is 'the_sql', then the list returned by this
        function will be like::

            [
                ...
                {
                    'stepName': 'the_sql',
                    'result': {
                        'success': True,
                        'hasResultset': True,
                        'columns': [ {'type': 'int8', 'name': 'a'}, {'type': 'varchar', 'name': 'b'} ],
                        'totalRows': 2,
                        'rows': [
                                    ['1000', 'min'],
                                    ['2500', 'max']
                                ],
                        'log': '',
                        'endedOn': 0,
                        'totalRowsClipped': False
                    }
                },
                ...
            ]

        Important note: the exact structure of each type of step run output is not precisely defined, and may vary 
        from a DSS release to another
        """
        return backend_json_call("scenarios/get-step-outputs/", err_msg="Failed to read step outputs")

    def get_all_variables(self):
        """
        Returns a dictionary of all variables (including the scenario-specific values)
        """
        return backend_json_call("scenarios/get-all-variables", err_msg="Failed to get variables")

    def run_step(self, step, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Run a step in this scenario.

        :param BuildFlowItemsStepDefHelper step: Must be a step definition returned by :func:`dataiku.scenario.BuildFlowItemsStepDefHelper.get_step`. (See code sample below)
        :param bool asynchronous: If True, the function launches a step run and returns immediately a :class:`dataiku.scenario.step.StepHandle` object, on which the user will need to call :func:`dataiku.scenario.step.StepHandle.is_done()` or :func:`dataiku.scenario.step.StepHandle.wait_for_completion()`. Otherwise the function waits until the step has finished running and returns the result of the step.
        :param bool fail_fatal: If True, returns an Exception if the step fails.

        Code sample: 

        .. code-block:: python

            # Code sample to build several datasets in a scenario step
            from dataiku.scenario import Scenario
            from dataiku.scenario import BuildFlowItemsStepDefHelper

            # The Scenario object is the main handle from which you initiate steps
            scenario = Scenario()

            # Create a 'Build Flow Items' step.
            step = BuildFlowItemsStepDefHelper("build_datasets_step")

            # Add each dataset / folder / model to build
            step.add_dataset("dataset_name_1", "project_key")
            step.add_dataset("dataset_name_2", "project_key")
            step.add_dataset("dataset_name_3", "project_key")

            # Run the scenario step. The dependencies engine will parallelize what can be parallelized.
            scenario.run_step(step.get_step())
        """

        # If this step was built through a definition helper,
        # extract the actual step dict
        if isinstance(step, StepDefHelper):
            step = step.get_step()

        step_handle = StepHandle(step, fail_fatal)
        # Backward compatibility:
        # - "async" promoted to reserved keyword in Python 3.7
        # - "async" used to be a keyword argument of the run_step method (prior to DSS compatibility with Python 3.7)
        # - => check for use of "async" in scenarios running with Python versions < 3.7 and that have not been modified
        if "async" in kwargs:
            asynchronous = kwargs["async"]
            logging.warning("Use of 'async' keyword variable has been deprecated in DSS 9.0 and should be replaced by 'asynchronous'")
            logging.warning("Executing Scenario.run_step with asynchronous={}".format(asynchronous))

        if asynchronous:
            step_handle.start()
            # return the step
            return step_handle
        else:
            # return the result
            return step_handle.run()


    # Shortcuts to create and launch steps
    def new_build_flowitems_step(self,step_name = None, build_mode = "RECURSIVE_BUILD"):
        """
        Creates and returns a helper to prepare a multi-item "build" step.
        
        :returns: a :class:`.BuildFlowItemsStepDefHelper` object
        """
        return BuildFlowItemsStepDefHelper(self, step_name, build_mode)

    # the different steps
    def build_dataset(self, dataset_name, project_key=None, build_mode = "RECURSIVE_BUILD", partitions=None,
                      step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Executes the build of a dataset
        
        :param dataset_name: name of the dataset to build
        :param project_key: optional, project key of the project in which the dataset is built
        :param build_mode: one of "RECURSIVE_BUILD" (default), "NON_RECURSIVE_FORCED_BUILD", "RECURSIVE_FORCED_BUILD", "RECURSIVE_MISSING_ONLY_BUILD"
        :param partitions: can be given as a partitions spec, variables expansion is supported"""
        helper = BuildFlowItemsStepDefHelper(self, step_name, build_mode)
        helper.add_dataset(dataset_name, project_key, partitions)
        return self.run_step(helper, asynchronous, fail_fatal, **kwargs)

    def build_folder(self, folder_id, project_key=None, build_mode = "RECURSIVE_BUILD", partitions=None,
                     step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Executes the build of a folder
        
        :param folder_id: the identifier of the folder (!= its name)
        :param partitions: Can be given as a partitions spec. Variables expansion is supported
        """
        helper = BuildFlowItemsStepDefHelper(self, step_name, build_mode)
        helper.add_folder(folder_id, project_key, partitions)
        return self.run_step(helper, asynchronous, fail_fatal, **kwargs)

    def train_model(self, model_id, project_key=None, build_mode = "RECURSIVE_BUILD",
                     step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Executes the train of a saved model
        
        :param model_id: the identifier of the model (!= its name)"""
        helper = BuildFlowItemsStepDefHelper(self, step_name, build_mode)
        helper.add_model(model_id, project_key)
        return self.run_step(helper, asynchronous, fail_fatal, **kwargs)

    def build_evaluation_store(self, evaluation_store_id, project_key=None, build_mode = "RECURSIVE_BUILD",
                     step_name=None, asynchronous=False, fail_fatal = True):
        """
        Executes the build of a model evaluation store, to produce a model evalution
        
        :param evaluation_store_id: the identifier of the model evaluation store (!= its name)"""
        helper = BuildFlowItemsStepDefHelper(self, step_name, build_mode)
        helper.add_evaluation_store(evaluation_store_id, project_key)
        return self.run_step(helper, asynchronous, fail_fatal)

    def invalidate_dataset_cache(self, dataset_name, project_key=None,
                      step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Invalidate the caches of a dataset
        """
        step_params = {'invalidates' : [{'type' : 'DATASET', 'projectKey' : self._pkey(project_key), 'itemId' : dataset_name, 'partitionsSpec' : None}]}
        return self._run_step("invalidate_cache", step_name, step_params, asynchronous, fail_fatal, **kwargs)

    def clear_dataset(self, dataset_name, project_key=None, partitions=None,
                      step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Executes a 'clear' operation on a dataset
        
        :param partitions: Can be given as a partitions spec. Variables expansion is supported
        """
        step_params = {'clears' : [{'type' : 'DATASET', 'projectKey' : self._pkey(project_key), 'itemId' : dataset_name, 'partitionsSpec' : partitions}]}
        return self._run_step("clear_items", step_name, step_params, asynchronous, fail_fatal, **kwargs)

    def clear_folder(self, folder_id, project_key=None,
                      step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Executes a 'clear' operation on a managed folder
        """
        step_params = {'clears' : [{'type' : 'MANAGED_FOLDER', 'projectKey' : self._pkey(project_key), 'itemId' : folder_id}]}
        return self._run_step("clear_items", step_name, step_params, asynchronous, fail_fatal, **kwargs)


    def run_dataset_checks(self, dataset_name, project_key=None, partitions=None,
                            step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Runs the checks defined on a dataset
        
        :param partitions: Can be given as a partitions spec. Variables expansion is supported"""
        step_params = {'checks' : [{'type' : 'DATASET', 'projectKey' :  self._pkey(project_key), 'itemId' : dataset_name, 'partitionsSpec' : partitions}]}
        return self._run_step("check_dataset", step_name, step_params, asynchronous, fail_fatal, **kwargs)

    def compute_dataset_metrics(self, dataset_name, project_key=None, partitions=None,
                                step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Computes the metrics defined on a dataset
        
        :param partitions: Can be given as a partitions spec. Variables expansion is supported"""
        step_params = {'computes' : [{'type' : 'DATASET', 'projectKey' : self._pkey(project_key), 'itemId' : dataset_name, 'partitionsSpec' : partitions}]}
        return self._run_step("compute_metrics", step_name, step_params, asynchronous, fail_fatal, **kwargs)

    def synchronize_hive_metastore(self, dataset_name, project_key=None,
                                    step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Synchronizes the Hive metastore from the dataset definition for a single dataset (all partitions).
        """
        step_params = {'syncs' : [{'type' : 'DATASET', 'projectKey' : self._pkey(project_key), 'itemId' : dataset_name}]}
        return self._run_step("sync_hive", step_name, step_params, asynchronous, fail_fatal, **kwargs)

    def update_from_hive_metastore(self, dataset_name, project_key=None,
                                    step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Update a single dataset definition (all partitions) from its table in the Hive metastore .
        """
        step_params = {'syncs' : [{'type' : 'DATASET', 'projectKey' : self._pkey(project_key), 'itemId' : dataset_name}]}
        return self._run_step("update_from_hive", step_name, step_params, asynchronous, fail_fatal, **kwargs)

    def execute_sql(self, connection, sql,
                    step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Executes a sql query
        
        :param connection: name of the DSS connection to run the query one
        :param sql: the query to run"""
        step_params = {'connection' : connection, 'sql' : sql}
        return self._run_step("exec_sql", step_name, step_params, asynchronous, fail_fatal, **kwargs)

    def set_project_variables(self, project_key =None, step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """Sets variables on the project.
        The variables are passed as named parameters to this function. For example:
        
        s.set_project_variables('PROJ', var1='value1', var2=True)
        
        will add 2 variables var1 and var2 in the project's variables, with values 'value1' and True respectively
        """
        if "async" in kwargs:
            # Handle legacy use of "async" (DSS pre 9.0) as a keyword variable
            # "async" is replaced by "asynchronous" to support execution with Python 3.7+
            asynchronous = kwargs["async"]
            del kwargs["async"]
            logging.warning("Use of 'async' keyword variable has been deprecated in DSS 9.0 and should be replaced by 'asynchronous'")
            logging.warning("Executing Scenario.set_project_variables with asynchronous={}".format(asynchronous))
        step_params = {'variables': kwargs}
        if project_key is not None:
            step_params["projectKey"] = project_key
        return self._run_step("set_project_vars", step_name, step_params, asynchronous, fail_fatal)

    def set_global_variables(self, step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """Sets variables on the DSS instance.
        The variables are passed as named parameters to this function. For example:
        
        s.set_global_variables(var1='value1', var2=True)
        
        will add 2 variables var1 and var2 in the instance's variables, with values 'value1' and True respectively
        """
        if "async" in kwargs:
            # Handle legacy use of "async" (DSS pre 9.0) as a keyword variable
            # "async" is replaced by "asynchronous" to support execution with Python 3.7+
            asynchronous = kwargs["async"]
            del kwargs["async"]
            logging.warning("Use of 'async' keyword variable has been deprecated in DSS 9.0 and should be replaced by 'asynchronous'")
            logging.warning("Executing Scenario.set_global_variables with asynchronous={}".format(asynchronous))
        step_params = {'variables': kwargs}
        return self._run_step("set_global_vars", step_name, step_params, asynchronous, fail_fatal)

    def run_global_variables_update(self, update_code=None,
                    step_name=None, asynchronous=False, fail_fatal = True, **kwargs):
        """
        Run the code for updating the DSS instance's variable defined in the global settings.
        
        :param update_code: custom code to run instead of the one defined in the global settings
        """
        step_params = {'updateCode' : update_code}
        return self._run_step("update_global_dss_variables", step_name, step_params, asynchronous, fail_fatal, **kwargs)

    def run_scenario(self, scenario_id, project_key=None, name=None, asynchronous=False, fail_fatal=True, **kwargs):
        """
        Runs a scenario
        
        :param scenario_id: identifier of the scenario (can be different from its name)    
        :param project_key: optional project key of the project where the scenario is defined (defaults to current project)
        :param name: optional name of the step
        :param bool asynchronous: If True, waits for result, else immediately returns a future. See :func:`dataiku.scenario.run_step` for details.
        :param bool fail_fatal: If True, returns an Exception if the step fails.. See :func:`dataiku.scenario.run_step` for details.
        
        Code sample: 

        .. code-block:: python

            # Code sample to run another scenario asynchronously without failing
            from dataiku.scenario import Scenario
            
            result = scenario.run_scenario("ANOTHER_SCENARIO", asynchronous=False, fail_fatal=False)
            print(result.get_outcome())
        """
        if project_key is None:
            project_key = self.project_key # by default, assume same project
        step_params = {'projectKey' : project_key, 'scenarioId' : scenario_id}
        step = {'type' : 'run_scenario', 'name' : name, 'params' : step_params}
        return self.run_step(step, asynchronous, fail_fatal, **kwargs)

    def create_jupyter_export(self, notebook_id, execute_notebook=False, name=None, asynchronous=False, **kwargs):
        """
        Create a new export from a jupyter notebook
        
        :param notebook_id: identifier of the notebook
        :param execute_notebook: should the notebook be executed prior to the export        
        """
        step_params = {'notebookId' : notebook_id, 'executeNotebook' : execute_notebook}
        step = {'type' : 'create_jupyter_export', 'name' : name, 'params' : step_params}
        return self.run_step(step, asynchronous, **kwargs)

    def package_api_service(self, service_id, package_id, transmogrify=False, name=None, asynchronous=False, **kwargs):
        """
        Make a package for an API service.
        
        :param service_id: identifier of the API service
        :param package_id: identifier for the created package
        :param transmogrify: if True, make the package_id unique by appending a number (if not unique already)      
        """
        step_params = {'serviceId' : service_id, 'packageId' : package_id, 'transmogrify' : transmogrify}
        step = {'type' : 'prepare_lambda_package', 'name' : name, 'params' : step_params}
        return self.run_step(step, asynchronous, **kwargs)


    def _pkey(self, project_key):
        if project_key is None:
            project_key = self.project_key # by default, assume same project
        return project_key

    def _run_step(self, step_type, step_name, step_params, asynchronous, fail_fatal, **kwargs):
        step = {'type' : step_type, 'name' : step_name, 'params' : step_params}
        return self.run_step(step, asynchronous, fail_fatal, **kwargs)


class StepDefHelper(object):
    pass

class BuildFlowItemsStepDefHelper(StepDefHelper):
    """
    Helper to build the definition of a 'Build Flow Items' step. Multiple items can be added
    """

    def __init__(self, scenario, step_name = None, build_mode = "RECURSIVE_BUILD"):
        self.scenario  = scenario
        self.step_name = step_name
        self.step_params = {
            'builds' : [],
            'jobType' : build_mode
        }
        pass

    def add_dataset(self, dataset_name, project_key = None, partitions = None):
        """
        Add a dataset to build
        
        :param dataset_name: name of the dataset
        :param partitions: partition spec
        """
        if project_key is None:
            project_key = self.scenario.project_key # by default, assume same project
        build = {'type' : 'DATASET', 'projectKey' : project_key, 'itemId' : dataset_name, 'partitionsSpec' : partitions}
        self.step_params["builds"].append(build)

    def add_folder(self, folder_id, project_key = None, partitions = None):
        """
        Add a folder to build
        
        :param folder_id: identifier of a folder (!= its name)
        """
        if project_key is None:
            project_key = self.scenario.project_key # by default, assume same project
        build = {'type' : 'MANAGED_FOLDER', 'projectKey' : project_key, 'itemId' : folder_id, 'partitionsSpec' : partitions}
        self.step_params["builds"].append(build)

    def add_model(self, model_id, project_key = None):
        """
        Add a saved model to build
        
        :param model_id: identifier of a saved model (!= its name)
        """
        if project_key is None:
            project_key = self.scenario.project_key # by default, assume same project
        build = {'type' : 'SAVED_MODEL', 'projectKey' : project_key, 'itemId' : model_id }
        self.step_params["builds"].append(build)

    def add_evaluation_store(self, evaluation_store_id, project_key = None):
        """
        Add a model evaluation store to build
        
        :param evaluation_store_id: identifier of a model evaluation store (!= its name)
        """
        if project_key is None:
            project_key = self.scenario.project_key # by default, assume same project
        build = {'type' : 'MODEL_EVALUATION_STORE', 'projectKey' : project_key, 'itemId' : evaluation_store_id }
        self.step_params["builds"].append(build)

    def get_step(self):
        """
        Get the step definition
        """
        return {
            'type' : 'build_flowitem',
            'name' : self.step_name,
            'params' : self.step_params
        }
