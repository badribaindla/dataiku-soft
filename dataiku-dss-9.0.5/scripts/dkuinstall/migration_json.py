from os import path as osp
import re
import shutil
import json, logging
from glob import glob
from copy import deepcopy

import base
import migration_base

################################################################
# JSON-aware operations
################################################################

SEGMENT_PTN = re.compile("(?P<selector>[^\[\]]+)(?:\[(?P<attr_key>[^=\]]+)(?:=(?P<attr_filter>[^=\]]+))?\])?")

class Segment:

    def __init__(self, name, selector=None, attr_key=None, attr_filter=None):
        self.name = name
        self.selector = selector
        self.attr_key = attr_key
        self.attr_filter = attr_filter

    def __repr__(self,):
        return self.name

    def match_attr(self, node):
        if self.attr_key is None:
            return True
        if self.attr_key not in node:
            return False
        if self.attr_filter is None:
            return True
        return node[self.attr_key] == self.attr_filter


def parse_segment(segment):
    m = SEGMENT_PTN.match(segment)
    if m is None:
        raise Exception(segment + " is not a valid pattern for jsonpath.")
    return Segment(segment, **m.groupdict())


def compare_obj(left, right):
    s1 = json.dumps(left, sort_keys=True)
    s2 = json.dumps(right, sort_keys=True)
    return s1 == s2

def transform_json_segments(transformer, json, segments, filepath):
    if type(json) == list:
        return [
            transform_json_segments(transformer, el, segments, filepath)
            for el in json
        ]
    if not segments:
        return transformer.transform(json, filepath)
    else:
        if type(json) == dict:
            (head, tail) = (segments[0], segments[1:])
            if head.selector == "*":
                return {k: transform_json_segments(transformer, v, tail, filepath) for (k, v) in json.items() if head.match_attr(v)}
            elif head.selector in json:
                v = json[head.selector]
                if type(v) == list:
                    res = []
                    for child in v:
                        if head.match_attr(child):
                            res.append(transform_json_segments(transformer, child, tail, filepath))
                        else:
                            res.append(child)
                    json[head.selector] = res
                    return json
                else:
                    if head.match_attr(v):
                        json[head.selector] = transform_json_segments(transformer, v, tail, filepath)
                    return json
            else:
                return json
            return json
        return json

def migrate_json_file(transformer, fp):
    with open(fp, 'r') as f:
        print("Migrating %s" % fp)
        obj = json.load(f)

        cobj = deepcopy(obj)

        jsonpath = transformer.jsonpath()
        if jsonpath:
            segments = list(map(parse_segment, jsonpath.split(".")))
            new_obj = transform_json_segments(transformer, cobj, segments, fp)
        else:
            new_obj = transformer.transform(cobj, fp)

    if not compare_obj(obj, new_obj):
        new_json = json.dumps(new_obj, indent=2, sort_keys=True)
        with open(fp, 'w') as f:
            f.write(new_json)

class JsonMigrationOperation(migration_base.MigrationOperation):
    def transform(self, obj, filepath):
        raise NotImplementedError("Pure virtual method called")

    def file_patterns(self,):
        raise NotImplementedError("Pure virtual method called")

    def jsonpath(self,):
        return ""

    def execute(self, diphome):
        for file_pattern in self.file_patterns():
            for fp in glob(osp.join(diphome.path, file_pattern)):
                migrate_json_file(self, fp)


class ProjectConfigJsonMigrationOperation(migration_base.ProjectLocalMigrationOperation):
    def transform(self, obj, filepath):
        raise NotImplementedError("Pure virtual method called")

    def file_patterns(self,):
        raise NotImplementedError("Pure virtual method called")

    def jsonpath(self,):
        return ""

    def execute(self, project_paths):
        for file_pattern in self.file_patterns():
            #print("FP : %s" % file_pattern)
            for fp in glob(osp.join(project_paths.config, file_pattern)):
                migrate_json_file(self, fp)


# An embeddable version
class EmbeddableJsonMigrationOperation(object):
    def transform(self, obj, filepath):
        raise NotImplementedError("Pure virtual method called")

    def file_patterns(self,):
        raise NotImplementedError("Pure virtual method called")

    def jsonpath(self,):
        return ""

    def execute(self, root):
        for file_pattern in self.file_patterns():
            #print("FP : %s from %s" % (file_pattern, root))
            for fp in glob(osp.join(root, file_pattern)):
                migrate_json_file(self, fp)