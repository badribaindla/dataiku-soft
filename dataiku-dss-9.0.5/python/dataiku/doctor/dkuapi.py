import inspect
import re
from dataiku.core import dkujson as dkujson
import logging
TRIM_UNDERSCORES = re.compile("(.*[^_])_*")


def trim_underscores(s):
    if s == "":
        return ""
    else:
        return TRIM_UNDERSCORES.match(s).group(1)


def json_api(api):
    argspec = inspect.getargspec(api)
    kwd_map = {
        trim_underscores(argname): argname
        for argname in argspec.args
    }
    required_args = argspec.args
    defaults_args = argspec.defaults
    if defaults_args is not None and len(defaults_args) > 0:
        required_args = required_args[:-len(defaults_args)]

    def aux(payload):
        obj = dkujson.loads(payload)
        kwargs = {}
        unknown_arguments = []
        for (k, v) in obj.items():
            if k in kwd_map:
                kwargs[kwd_map[k]] = v
            else:
                unknown_arguments.append(k)
        if unknown_arguments:
            raise ValueError("Unknown arguments: " + ", ".join(unknown_arguments) +
                             ". Expected " + ",".join(kwd_map.keys()))
        missing_arguments = [
            req_args
            for req_args in required_args
            if req_args not in kwargs
        ]
        if missing_arguments:
            raise ValueError("Missing required arguments:", ", ".join(missing_arguments))
        return api(**kwargs)
    return aux
