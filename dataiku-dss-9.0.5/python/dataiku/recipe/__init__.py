import os, json
from dataiku.core import flow
from dataiku.core.dataset import Dataset
from dataiku.core.managed_folder import Folder
from dataiku.core.saved_model import Model
from dataiku.core.model_evaluation_store import ModelEvaluationStore
from dataiku.core.streaming_endpoint import StreamingEndpoint

def get_input_names(full=True):
    flow_spec = flow.FLOW
    return [x["fullName" if (full) else "smartName"] for x in flow_spec["in"]]

def get_output_names(full=True):
    flow_spec = flow.FLOW
    return [x["fullName" if (full) else "smartName"] for x in flow_spec["out"]]

def get_input_names_for_role(role, full=True):
    flow_spec = flow.FLOW
    return [x["fullName" if (full) else "smartName"] for x in flow_spec["in"] if x["role"] == role]

def get_output_names_for_role(role, full=True):
    flow_spec = flow.FLOW
    return [x["fullName" if (full) else "smartName"] for x in flow_spec["out"] if x["role"] == role]

def get_inputs_as_datasets(role=None):
    if role is None:
        names = get_input_names()
    else:
        names = get_input_names_for_role(role)
    return [Dataset(n) for n in names]

def get_outputs_as_datasets(role=None):
    if role is None:
        names = get_output_names()
    else:
        names = get_output_names_for_role(role)
    return [Dataset(n) for n in names]

def _get_typed_recipe_input_output(x, as_type='object'):
    if as_type == 'object' or as_type == 'objects':
        if x['type'] == 'DATASET':
            return Dataset(x['fullName'])
        elif x['type'] == 'MANAGED_FOLDER':
            return Folder(x['fullName'])
        elif x['type'] == 'SAVED_MODEL':
            return Model(x['fullName'])
        elif x['type'] == 'MODEL_EVALUATION_STORE':
            return ModelEvaluationStore(x['fullName'])
        elif x['type'] == 'STREAMING_ENDPOINT':
            return StreamingEndpoint(x['fullName'])
        else:
            return Dataset(x['fullName']) # dubious default, but we're doing it in the backend too
    elif as_type == 'name' or as_type == 'names':
        return x['fullName']
    elif as_type == 'ref' or as_type == 'refs':
        return x['smartName']
    else:
        return x
        
def _recipe_input_output_matches(x, index=None, role=None, object_type=None):
    if role is not None and role != x['role']:
        return False
    if index is not None and index != x['indexInRole']:
        return False
    if object_type is not None and object_type != x['type']:
        return False
    return True
    
def get_inputs(index=None, role=None, object_type=None, as_type='object'):
    flow_spec = flow.FLOW
    return [_get_typed_recipe_input_output(x, as_type) for x in flow_spec["in"] if _recipe_input_output_matches(x, index, role, object_type)]

def get_input(index=None, role=None, object_type=None, as_type='object'):
    l = get_inputs(index, role, object_type, as_type)
    if len(l) > 1:
        raise Exception("Too many inputs match")
    elif len(l) == 0:
        return None
    else:
        return l[0]        
    
def get_outputs(index=None, role=None, object_type=None, as_type='object'):
    flow_spec = flow.FLOW
    return [_get_typed_recipe_input_output(x, as_type) for x in flow_spec["out"] if _recipe_input_output_matches(x, index, role, object_type)]

def get_output(index=None, role=None, object_type=None, as_type='object'):
    l = get_outputs(index, role, object_type, as_type)
    if len(l) > 1:
        raise Exception("Too many outputs match")
    elif len(l) == 0:
        return None
    else:
        return l[0]        
    