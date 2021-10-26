#!/usr/bin/env python
# encoding: utf-8
"""
trigger.py : callbacks for custom triggers
Copyright (c) 2013-2015 Dataiku SAS. All rights reserved.
"""

import json, os, sys, csv, time
from dataiku.base import remoterun
from os import path as osp
import warnings
import struct
import threading, logging
from datetime import datetime
from dataiku.core.intercom import backend_void_call

class Trigger:
    """
    Handle to a scenario trigger being evaluated.
    """
    def __init__(self):
        self.trigger = json.loads(remoterun.get_env_var('DKU_TRIGGER'))
        self.trigger_state = remoterun.get_env_var('DKU_TRIGGER_STATE', None)

    def get_trigger(self):
        """
        Returns the trigger definition
        """
        return self.trigger

    def get_trigger_state(self):
        """
        Returns the current trigger state
        """
        return self.trigger_state

    def fire(self, state=None, params=None):
        """
        Activate the trigger. Optionally, a new value for the state can be
        passed in the 'state' parameter, and parameters for the scenario run
        in the 'params' parameter. The state is saved by DSS and will be 
        returned by get_trigger_state() in subsequent executions of the 
        trigger.
        """
        data = {}
        if state is not None:
            data['triggerState'] = state
        if params is not None:
            data['triggerFireParams'] = json.dumps(params)

        backend_void_call("scenarios/fire-trigger/", data=data)