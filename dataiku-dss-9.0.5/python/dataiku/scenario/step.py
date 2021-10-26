#!/usr/bin/env python
# encoding: utf-8
"""
step.py : callbacks for scenario steps
Copyright (c) 2013-2015 Dataiku SAS. All rights reserved.
"""

import json, os, sys, csv, time
from os import path as osp
import warnings
import struct
import threading, logging
from datetime import datetime
import dataiku
from dataiku.core.intercom import backend_json_call

class StepFailedException(Exception):
     def __init__(self, message):
         self.message = message
     def __str__(self):
         return repr(self.message)


class StepHandle:
    """
    Handle to a scenario step running in DSS. To get a Step object, call run_step() on a
    Scenario object, or call one of its step launching methods.
    """
    def __init__(self, step, fail_fatal):
        self.step = step
        self.fail_fatal = fail_fatal
        self.future_id = None
        self.result = None

    def run(self):
        """
        Fully runs the step synchronously and returns its result.

        If the step failed, and fail_fatal is True, an
        Exception is raised.
        """
        return self.wait_for_completion(self.start())

    def start(self):
        """
        Launches the execution of the step
        """
        if self.future_id is not None:
            raise Exception("Step already started")
        self.future_id = None
        self.result = None

        step_future = backend_json_call("scenarios/run-step/", data={
                "stepData" : json.dumps(self.step)
            }, err_msg="Step failed to start")
        self.future_id = step_future['jobId']

    def wait_for_completion(self, step_future=None):
        """
        Awaits the termination of the step and returns its result. If the step
        failed, an Exception is raised.
        """
        if self.future_id is None:
            raise Exception("Step not started")
        if step_future is None:
            step_future = {'hasResult' : False}

        while not step_future['hasResult']:
            time.sleep(5) # sleep a lot, this is expected to be long running tasks
            step_future = backend_json_call("futures/get-update", data={
                    "futureId": self.future_id
                })

        if not step_future['hasResult']:
            raise Exception("Step failed to run")

        self.result = step_future['result']

        ret = self.get_result()

        if self.fail_fatal:
            if ret.get_outcome() == "ABORTED":
                raise Exception("Scenario step was aborted")
            elif ret.get_outcome() == "FAILED":
                raise StepFailedException("Scenario step failed: %s" % ret.get_error_message())

        return ret

    def is_done(self):
        """
        Checks whether a running step is finished
        """
        if self.future_id is None:
            raise Exception("Step not started")

        step_future = backend_json_call("futures/get-update", data={
                "futureId": self.future_id
            }, err_msg="Failed to track step future")

        if step_future['hasResult']:
            self.result = step_future['result']
            return True
        else:
            return False

    def get_result(self):
        """
        Returns the result of a finished step
        """

        if self.step["type"] == "build_flowitem":
            return BuildFlowItemsStepResult(self.result)
        elif self.step["type"] == "compute_metrics":
            return ComputeMetricsStepResult(self.result)
        else:
            return StepResult(self.result)


class StepResult(object):
    def __init__(self, data):
        self.data = data

    def _result(self):
        return self.data.get("result", {})
    def _add_report_items(self):
        return self.data.get("additionalReportItems", [])
    def _payload(self):
        return self.data["payload"]

    def get_outcome(self):
        return self._result()["outcome"]

    def get_error_message(self):
        if self.get_outcome() in ["SUCCESS", "WARNING"]:
            return "No error"
        elif "thrown" in self._result():
            return self._result()["thrown"]["message"]
        else:
            return "Unknown error - please check logs"

    def get_data(self):
        """Returns the raw data for the result of this step.
        Note that the returned object does not have any stable guaranteed structure"""
        return self.data

    def count_warnings(self):
        return int(self._result().get("warnings", {}).get("totalCount", "0"))

    def get_warnings_count_by_type(self):
        wc = self._result().get("warnings", {})
        ret = {}
        for (wtype, typedata) in wc.get("warnings", {}).items():
            ret[wtype] = typedata["count"]
        return ret


class BuiltDatasetHandle(object):
    def __init__(self, report_item):
        self.report_item = report_item

class TrainedModelHandle(object):

    def __init__(self, report_item):
        self.report_item = report_item
        assert(self.report_item["type"] == "BUILT_MODEL")

    def get_new_version(self):
        return self.report_item["versionId"]

    def get_model(self):
        return dataiku.Model(self.report_item["target"]["modelId"], project_key = self.report_item["target"]["projectKey"])

    def activate_new_version(self):
        model = self.get_model()
        model.activate_version(self.get_new_version())

    def get_new_version_metrics(self):
        model = self.get_model()
        return model.get_version_metrics(self.get_new_version())


class BuiltEvaluationStoreHandle(object):

    def __init__(self, report_item):
        self.report_item = report_item
        assert(self.report_item["type"] == "BUILT_EVALUATION_STORE")

    def get_new_run_id(self):
        return self.report_item["runId"]

    def get_evaluation(self):
        return dataiku.ModelEvaluationStore(self.report_item["target"]["evaluationStoreId"], project_key = self.report_item["target"]["projectKey"]).get_run(self.get_new_run_id())


class BuildFlowItemsStepResult(StepResult):

    def get_trained_models(self):
        """
        Returns the list of models that were trained by this step.
        Each returned item is a TrainedModelHandle object
        """
        return [TrainedModelHandle(x) for x in self._add_report_items() if x["type"] == "BUILT_MODEL"]

    def get_trained_model(self):
        """
        Gets the single model trained by this step. The returned object is a TrainedModelHandle
        """
        models = self.get_trained_models()
        if len(models) == 0:
            raise ValueError("No model trained by this step")
        elif len(models) > 1:
            raise ValueError("Multiple models trained by this step, please use get_trained_models")
        else:
            return models[0]

    def get_built_evaluation_stores(self):
        """
        Returns the list of evaluation stores that were built by this step.
        Each returned item is a BuiltEvaluationStoreHandle object
        """
        return [BuiltEvaluationStoreHandle(x) for x in self._add_report_items() if x["type"] == "BUILT_EVALUATION_STORE"]

    def get_built_evaluation_store(self):
        """
        Gets the single evaluation store trained by this step. The returned object is a BuiltEvaluationStoreHandle
        """
        evaluation_stores = self.get_built_evaluation_stores()
        if len(evaluation_stores) == 0:
            raise ValueError("No model trained by this step")
        elif len(evaluation_stores) > 1:
            raise ValueError("Multiple evaluation stores trained by this step, please use get_built_evaluation_stores")
        else:
            return evaluation_stores[0]

    def get_built_datasets(self):
        """
        Returns the list of dataset (partitions) that were built by this step.
        Each returned item is a BuiltDatasetHandle
        """
        return [BuiltDatasetHandle(x) for x in self._add_report_items() if x["type"] == "BUILT_DATASET"]

    def get_job_report_item(self):
        for x in self._add_report_items():
            if x["type"] == "JOB_EXECUTED":
                return x
        raise Exception("Job report item not found in step result")

    def get_error_message(self):
        if self.get_outcome() in ["SUCCESS", "WARNING"]:
            return "No error"
        else:
            jri = self.get_job_report_item()
            if "thrown" in jri:
                return jri["thrown"]["message"]
            else:
                return "Unknown error, please check logs"

class ComputeMetricsStepResult(StepResult):

    def get_item_report(self, project_key = None, item_id = None, partition = None):
        for (k, v) in self._payload().items():
            target = v["target"]
            print ("Studying %s" % target)
            if target["type"] == "DATASET_PARTITION":
                if  (project_key is None or project_key ==target["projectKey"]) and \
                    (item_id is None or item_id == target["datasetName"]) and \
                    (partition is None or partition == target["partition"]):
                    return v
            if target["type"] == "DATASET":
                if  (project_key is None or project_key ==target["projectKey"]) and \
                    (item_id is None or item_id == target["datasetName"]) and \
                    (partition is None):
                    return v
            if target["type"] == "MANAGED_FOLDER_PARTITION":
                if  (project_key is None or project_key ==target["projectKey"]) and \
                    (item_id is None or item_id == target["folderId"]) and \
                    (partition is None or partition == target["partition"]):
                    return v
            if target["type"] == "MANAGED_FOLDER":
                if  (project_key is None or project_key ==target["projectKey"]) and \
                    (item_id is None or item_id == target["folderId"]) and \
                    (partition is None):
                    return v
        return None

    def has_any_failure(self, project_key = None, item_id = None, partition = None):
        item = self.get_item_report(project_key, item_id, partition)

        for run in item["runs"]:
            if "error" in run:
                return True
        return False

    def get_metric_values(self, project_key = None, item_id = None, partition = None):
         item = self.get_item_report(project_key, item_id, partition)
         return item["computed"]

    def get_metric_value(self, metric_lookup, project_key = None, item_id = None, partition = None):
        computed =self.get_metric_values(project_key, item_id, partition)
        for metric in computed:
            if metric["metricId"] == metric_lookup:
                return metric["value"]
        raise Exception("Unable to find metric value for %s" % metric_lookup)