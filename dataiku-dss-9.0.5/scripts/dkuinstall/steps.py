from __future__ import print_function
from six import iteritems
from os import path as osp
import re
import shutil
import random
import string
import os
import json, logging
import sys
from glob import glob
import time
import datetime
from collections import OrderedDict

import base, install_config
import migration_base, migration_json, migration_app

if sys.version_info > (3,):
    dku_basestring_type = str
else:
    dku_basestring_type = basestring

###############################################################################
# V9 / DSS 2.1
###############################################################################

class V9ElasticSearchDatasetParams(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Upgrades dataset parameters for ElasticSearch datasets"

    def transform(self, obj, filepath=None):
        if "type" in obj and obj["type"] == "ElasticSearch":
            obj['params']['rawCopyColumns'] = '*'
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["datasets/*.json"]

class V9RecipeRoles(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Input/Output roles in recipes"

    def transform(self, obj, filepath=None):
        # Broken recipe, don't do anything
        if not "type" in obj:
            return

        old_inputs = obj.get("inputs", [])
        old_outputs = obj.get("outputs", [])
        old_pdeps = obj.get("partitionDeps", [])

        new_inputs_all = []

        for old_input in old_inputs:
            new_input = { "ref" : old_input }
            new_input["deps"] = [ dep for dep in old_pdeps if dep.get("in", None) == old_input]
            new_inputs_all.append(new_input)

        def first_input_to_main():
            if len(new_inputs_all) > 0:
                obj["inputs"] = {
                    "main" : {
                        "items" : [new_inputs_all[0]]
                    }
                }
        def convert_outputs():
            obj["outputs"] = {
                "main" :{
                    "items" : [ {"ref":x} for x in old_outputs ]
                }
            }

        if obj["type"] == "shaker" or \
            obj["type"] == "prediction_scoring" or \
            obj["type"] == "clustering_training" or \
            obj["type"] == "clustering_scoring" or \
            obj["type"] == "clustering_cluster":
            # First input goes to main, others go to "scriptDeps"
            first_input_to_main()
            if len(new_inputs_all) > 1:
                obj["inputs"]["scriptDeps"] = {
                    "items" : new_inputs_all[1:]
                }
            convert_outputs()

        elif obj["type"] == "prediction_training":
            payload = base.json_loadf(filepath.replace(".json", ".prediction_training"))
            ttPolicy = payload.get("splitParams", {}).get("ttPolicy", None)
            if ttPolicy == "EXPLICIT_FILTERING_TWO_DATASETS":
                if len(new_inputs_all) < 2:
                    print("WARNING: EXPLICIT_FILTERING recipe with only one input - BROKEN")
                    first_input_to_main()
                    convert_outputs()
                    return obj
                # First input goes to main, second to test, others to scriptdeps
                first_input_to_main()
                obj["inputs"] = {
                    "test" : {
                        "items" : [new_inputs_all[1]]
                    }
                }
                if len(new_inputs_all) > 2:
                    obj["inputs"]["scriptDeps"] = {
                        "items" : new_inputs_all[2:]
                    }
            else:
                first_input_to_main()
                if len(new_inputs_all) > 1:
                    obj["inputs"]["scriptDeps"] = {
                        "items" : new_inputs_all[1:]
                    }
            convert_outputs()
        else:
            # Regular behaviour: all inputs and all outputs to main
            obj["inputs"] = {
                "main" : {
                    "items" : new_inputs_all
                }
            }
            convert_outputs()

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]


class V9FilterRecipeSelection(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Inline selection in filter recipe"

    def transform(self, obj, filepath):
        if obj.get("type", "") != "sampling":
            return obj
        if obj.get("params", {}).get("selection", None) is not None:
            try:
                sel = json.loads(obj["params"]["selection"])
                obj["params"]["selection"] = sel
            except Exception as e:
                logging.exception("Failed to migrate sampling recipe %s" % filepath)
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]


def v9_transform_chart(chart):
    newchart = {} #json.loads(base.json.dumps(chart))

    newchart["name"] = chart.get("name", "Untitled")
    newchart["userEditedName"] = True

    newchart["includeZero"] = chart.get("includeZero", True)
    newchart["showLegend"] = chart.get("showLegend", True)
    newchart["smoothing"] = chart.get("smoothing", True)

    def set_compute_on_measures(arr):
        cmode = chart.get("computeMode", "NONE")
        xmode = chart.get("xAxisMode", "NONE")

        if cmode == "LIFT_AVG":
            for measure in arr:
                measure["computeMode"] = "AVG_RATIO"
        elif xmode == "CUMULATIVE":
            for measure in arr:
                measure["computeMode"] = "CUMULATIVE"
        elif xmode == "DIFFERENCE":
            for measure in arr:
                measure["computeMode"] = "DIFFERENCE"

    if chart.get("yAxisMode", "NORMAL") == "LOG":
        newchart["axis1LogScale"] = True
        newchart["axis2LogScale"] = True

    newchart["colorOptions"] = {
        "singleColor": "#659a88",
        "transparency": 0.9,
        "colorPalette" : chart.get("colorPalette", "default")
    }

    if "thumbnailData" in chart:
        newchart["thumbnailData"] = chart["thumbnailData"]

    newchart["filters"] = chart.get("filters", [])
    for f in newchart["filters"]:
        if f["columnType"] == "NUMERICAL":
            f["filterType"] = "NUMERICAL_FACET"
        elif f["columnType"] == "ALPHANUM":
            f["filterType"] = "ALPHANUM_FACET"
        elif f["columnType"] == "DATE":
            f["filterType"] = "DATE_FACET"

    def copy_obj(fromArr, idx, toArr):
        if len(fromArr) > idx:
            print("Migrating from %s=%s to %s" % (fromArr, idx, toArr))
            newchart[toArr] = [fromArr[idx]]
        else:
            newchart[toArr] = []

    def do_generic_stdaggr():
        copy_obj(chart.get("dimensions", []), 0, "genericDimension0")
        copy_obj(chart.get("dimensions", []), 1, "genericDimension1")

        newchart["genericMeasures"] = chart.get("genericMeasures", [])
        set_compute_on_measures(newchart["genericMeasures"])

    if chart.get("type", None) is None:
        chart["type"] = "grouped_bars"

    if chart["type"] == "grouped_bars":

        if len(chart.get("dimensions", [])) == 2:
            newchart["type"] = "grouped_columns"
            newchart["variant"] = "normal"
        else:
            newchart["type"] = "multi_columns_lines"
            newchart["variant"] = "normal"

        do_generic_stdaggr()

    elif chart["type"] == "scatter_2d":

        newchart["type"] = "binned_xy"
        newchart["variant"] = "normal"
        if chart.get("hexbin", False):
            newchart["variant"] = "binned_xy_hex"
            newchart["hexbinRadius"] = chart.get("hexbinRadius", 20)

        copy_obj(chart.get("dimensions", []), 0, "xDimension")
        copy_obj(chart.get("dimensions", []), 1, "yDimension")

        newchart["colorMeasure"] = chart.get("colorMeasures", [])
        newchart["sizeMeasure"] = chart.get("sizeMeasures", [])

    elif chart["type"] == "scatter_1d":
        newchart["type"] = "grouped_xy"
        newchart["variant"] = "normal"

        copy_obj(chart.get("dimensions", []), 0, "groupDimension")

        newchart["colorMeasure"] = chart.get("colorMeasures", [])
        newchart["sizeMeasure"] = chart.get("sizeMeasures", [])

        copy_obj(chart.get("genericMeasures", []), 0, "xMeasure")
        copy_obj(chart.get("genericMeasures", []), 1, "yMeasure")

    elif chart["type"] == "lines":
        newchart["type"] = "lines"
        newchart["variant"] = "normal"

        do_generic_stdaggr()

    elif chart["type"] == "stacked_bars":
        newchart["type"] = "stacked_columns"
        newchart["variant"] = "normal"

        if chart.get("yAxisMode", "NORMAL") == "PERCENTAGE_STACK":
            newchart["variant"] = "stacked_100"

        do_generic_stdaggr()

    elif chart["type"] == "stacked_area":
        newchart["type"] = "stacked_area"
        newchart["variant"] = "normal"

        if chart.get("yAxisMode", "NORMAL") == "PERCENTAGE_STACK":
            newchart["variant"] = "stacked_100"

        do_generic_stdaggr()

    elif chart["type"] == "diminishing_returns":
        newchart["type"] = "lift"
        newchart["variant"] = "normal"

        copy_obj(chart.get("dimensions", []), 0, "groupDimension")
        copy_obj(chart.get("genericMeasures", []), 0, "xMeasure")
        copy_obj(chart.get("genericMeasures", []), 1, "yMeasure")

    elif chart["type"] == "map":
        newchart["type"] = "admin_map"
        newchart["variant"] = "normal"

        if chart.get("filledMap", False) == True:
            newchart["variant"] = "filled_map"

        copy_obj(chart.get("dimensions", []), 0, "geometry")

        newchart["colorMeasure"] = chart.get("typedMeasures", {}).get("mapColor", [])
        newchart["sizeMeasure"] = chart.get("typedMeasures", {}).get("mapSize", [])

    return newchart

class V9AnalysisCharts(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update charts in analyses"


    def transform(self, obj, filepath=None):
        for chart in obj.get("script", {}).get("charts", []):
            if "data" in chart:
                chart["data"] = v9_transform_chart(chart["data"])
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["analysis/*/core_params.json"]

class V9DatasetCharts(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update charts in datasets"

    def transform(self, obj, filepath=None):
        if obj.get("type", "UNKNOWN") != "CHART":
            return obj
        chart = obj.get("content", {}).get("chart", None)
        if chart is not None:
            obj["content"]["chart"] = v9_transform_chart(chart)
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["insights/*.json"]

class V9ShakerRecipeEngine(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Upgrade preparation scripts on Hadoop"

    def transform(self, obj, filepath=None):
        if obj.get("type", None) != "shaker":
            return obj

        if obj.get("params", {}).get("runOnHadoop", False) == True:
            obj.get("params")["engine"] = "HADOOP_MAPREDUCE"

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]

class V9APIKeysForWebapps(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Migrate webapp API keys to public API keys"

    def execute(self, diphome, simulate=False):
        keys_file = osp.join(diphome.path, "config/apikeys.json")

        if not osp.isfile(keys_file):
            return

        old_keys_data = base.json_loadf(keys_file)
        new_keys_data = { "keys" : [] }

        projects_keys = {}

        for old_key in old_keys_data.get("keys", []):
            print("Migrating old key: %s" % old_key)
            if old_key.get("type", "") == "DATASETS_READ":

                datasetNames = []
                pkey = "???"
                for datasetInfo in old_key.get("readableDatasets", []):
                    pkey = datasetInfo.get("projectKey", "???")
                    datasetName = datasetInfo.get("datasetName", "???")
                    datasetNames.append(datasetName)

                # We only support one project key per key ...
                project_keys = projects_keys.get(pkey, [])
                projects_keys[pkey] = project_keys

                new_key = {
                    "key" : old_key["key"],
                    "localDatasets" : [
                        {
                            "datasets" : datasetNames,
                            "privileges" : ["READ_DATA"]
                        }
                    ]
                }
                project_keys.append(new_key)
            else:
                new_keys_data["keys"].append(old_key)

        base.json_dumpf(keys_file, new_keys_data)

        projects_folder = osp.join(diphome.path, "config/projects")

        for (project, keys) in projects_keys.items():
            print("Writing new keys for %s" % project)
            pkeys_file = osp.join(projects_folder, project, "apikeys.json")
            if osp.isdir(osp.join(projects_folder, project)):
                base.json_dumpf(pkeys_file, keys)
            else:
                print("Not writing keys for removed project %s" % project)


class V9RenameArraysCombine(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        super(V9RenameArraysCombine, self).__init__("ArraysCombine")

    def transform_step(self, step):
        assert step["type"] == "ArraysCombine"
        step["type"] = "ZipArraysProcessor"
        return step

class V9ColumnRenamerMultiColumns(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        super(V9ColumnRenamerMultiColumns, self).__init__("ColumnRenamer")

    def transform_step(self, step):
        sfrom = step.get("params", {}).get("inCol", "")
        sto = step.get("params", {}).get("outCol", "")

        step.get("params", {})["renamings"] = [
            { "from" : sfrom, "to" : sto }
        ]
        return step

###############################################################################
# V 10 / DSS 2.2
###############################################################################

class V10UpDownFiller(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "UpDownFiller")

    def transform_step(self, step):
        step.get("params",{})["columns"] = [ step.get("params", {}).get("column", "") ]
        return step

class V10TimestamNoTzInSqlDatasets(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Keep old behavior for timestamp columns without time zone"

    def transform(self, obj, filepath=None):
        dataset_type = obj['type']
        if dataset_type in ['PostgreSQL', 'MySQL', 'Vertica', 'Redshift', 'Greenplum', 'Teradata']:
            # impossible to know from just the schema whether some columns had no timestamp, but until
            # the user clicks on 'Test' again, the schema won't change. Leave assumed timezone empty for
            # local
            obj["params"]["readColsWithUnknownTzAsDates"] = True
        elif dataset_type in ['Oracle', 'SQLServer']:
            # the old behavior was already to read these dates as strings, keep doing that
            obj["params"]["readColsWithUnknownTzAsDates"] = False
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["datasets/*.json"]

class V10TrueInPluginRecipesConfig(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update representation of booleans in plugin recipes config"

    def transform(self, obj, filepath=None):
        recipe_type = obj.get("type", "")
        if recipe_type.startswith("CustomCode_"):
            params = obj.get("params", {})
            for k in params.keys():
                if params.get(k, None) == "true":
                    params[k] = True
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]


###############################################################################
# V11 / DSS 2.3
###############################################################################

class V11InstallIni(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Migrate port and nodetype to install.ini configuration file"

    def appliesTo(self):
        return [ "design", "api" ]

    def execute(self, diphome, simulate=False):

        # Read base port from env-default
        envDefault = osp.join(diphome.path, "bin", "env-default.sh")
        base_port = None
        with open(envDefault) as f:
            for line in f.read().split('\n'):
                if line.find("export DKU_BASE_PORT") >= 0:
                    base_port = int(line.split('"')[1])
        if base_port is None:
            raise Exception("Failed to detect DKU_BASE_PORT in %s" % envDefault)

        # Read node type from install.properties if any
        node_type = migration_base.get_node_type(diphome)

        if simulate:
            return

        # Create install.ini
        install_config.initConfig(diphome, base_port, node_type, "auto", gitMode='global')

        # Remove legacy install.properties
        installprops = osp.join(diphome.path, "install.properties")
        if osp.isfile(installprops):
            print("Remove legacy file %s" % installprops)
            os.remove(installprops)

class V11SQLNotebooks(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update SQL notebooks"

    def randId(self,):
        return str(random.randint(0, 1e9))

    def transform(self, notebook, filepath=None):
        if notebook.get("cells", None) != None:
            return notebook

        notebook["cells"] = []

        rep = osp.dirname(filepath)
        fav_file = osp.join(rep, "favorites.json")
        if osp.exists(fav_file):
            fav_data = base.json_loadf(fav_file)
            for fav in fav_data["favorites"]:
                cell = {"id": self.randId(), "code": fav.get("sql", ""), "name": fav.get("name", ""), "type": "QUERY"}
                notebook["cells"].append(cell)

        queries_file = osp.join(rep, "queries.json")
        if osp.exists(queries_file):
            history = base.json_loadf(queries_file)
            new_queries = {}
            queries = history.get("queries", [])
            if len(queries) > 0:
                #create a cell for all queries in history
                cell = {
                    "id": self.randId(),
                    "name": "History from migration"
                }
                new_queries[cell["id"]] = queries
                notebook["cells"].append(cell)
            base.json_dumpf(queries_file, {"queries": new_queries})

        return notebook

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["notebooks/sql/*/params.json"]


class V11FillEmptyWithValue(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "FillEmptyWithValue")

    def transform_step(self, step):
        params = step.get("params", {})
        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("column", "")]

        return step

class V11RemoveRowsOnEmpty(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "RemoveRowsOnEmpty")

    def transform_step(self, step):
        params = step.get("params", {})
        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("column", "")]

        return step

class V11RoundProcessor(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "RoundProcessor")

    def transform_step(self, step):
        params = step.get("params", {})
        columns = params.get("columns", [""])

        if len(columns) > 1:
            params["appliesTo"] = "COLUMNS"
        else:
            params["appliesTo"] = "SINGLE_COLUMN"

        return step

class V11FindReplace(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "FindReplace")

    def transform_step(self, step):
        params = step.get("params", {})

        if params.get("global", False):
            params["appliesTo"] = "ALL"

        else:
            params["appliesTo"] = "SINGLE_COLUMN"
            params["columns"] = [params.get("input", "")]

        return step

class V11StringTransformer(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "StringTransformer")

    def transform_step(self, step):
        params = step.get("params", {})
        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("column", "")]
        params["mode"] = params.get("mode", "").upper()

        return step

class V11CellClearer(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "CellClearer")

    def transform_step(self, step):
        step["type"] = "FilterOnValue"

        params = step.get("params", {})

        params["values"] = [params.get("value", "")]
        params["action"] = "CLEAR_CELL"

        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("column", "")]

        return step

class V11RowsSelector(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "RowsSelector")

    def transform_step(self, step):
        step["type"] = "FilterOnValue"

        params = step.get("params", {})
        if (params.get("keep", False)):
            params["action"] = "KEEP_ROW"
        else:
            params["action"] = "REMOVE_ROW"

        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("column", "")]

        return step

class V11ClearCellsOnBadType(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "ClearCellsOnBadType")

    def transform_step(self, step):
        step["type"] = "FilterOnBadType"
        params = step.get("params", {})
        params["action"] = "CLEAR_CELL"

        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("column", "")]

        return step

class V11RemoveRowsOnBadType(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "RemoveRowsOnBadType")

    def transform_step(self, step):
        step["type"] = "FilterOnBadType"
        params = step.get("params", {})
        params["action"] = "REMOVE_ROW"

        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("column", "")]

        return step

class V11NumericalRangeSelector(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "NumericalRangeSelector")

    def transform_step(self, step):
        step["type"] = "FilterOnNumericalRange"
        params = step.get("params", {})

        if params.get("keep", False):
            params["action"] = "KEEP_ROW"
        else:
            params["action"] = "REMOVE_ROW"

        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("column", "")]
        return step

class V11SplitFoldTrimFalse(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        super(V11SplitFoldTrimFalse, self).__init__("SplitFold")

    def transform_step(self, step):
        assert step["type"] == "SplitFold"
        step.get("params", {})["trimSpaces"] = False
        return step

class V11JSONFlattenNull(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        super(V11JSONFlattenNull, self).__init__("JSONFlattener")

    def transform_step(self, step):
        step.get("params", {})["nullAsEmpty"] = False
        return step

class V11DateParser(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "DateParser")

    def transform_step(self, step):
        params = step.get("params", {})
        params["appliesTo"] = "SINGLE_COLUMN"
        params["columns"] = [params.get("inCol", "")]
        return step

class V11RemoveShakerFilters(migration_app.ShakerScriptMigrationOperation):
    def __init__(self):
        migration_app.ShakerScriptMigrationOperation.__init__(self)

    def transform_script(self, script):
        script["explorationFilters"] = []
        return script


class V11RemoveStepsFromInsightCharts(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Remove steps from chart insights"

    def transform(self, obj, filepath=None):
        if obj.get("type", "") == "CHART":
            dv = obj.get("content", {}).get("dataView", {})
            dv["steps"] = []
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["insights/*.json"]


###############################################################################
# V12 / DSS 3.0
###############################################################################


class V12SchedulerToScenario(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Migrate scheduled builds to scenarios"

    def convert_to_item_specification(self, project_key, dataset_with_partition):
        return {'type' : 'DATASET', 'projectKey' : project_key, 'itemId' : dataset_with_partition.get('dataset', None), 'partitionsSpec' : dataset_with_partition.get('partition', None)}

    def convert_to_step(self, project_key, scheduled_job):
        step = {'id' : 'extracted', 'type' : 'build_flowitem', 'name' : 'Datasets from scheduled job'}
        step['params'] = {'jobType' : scheduled_job.get('type', 'NON_RECURSIVE_FORCED_BUILD')
                        , 'refreshHiveMetastore' : False
                        , 'builds' : [self.convert_to_item_specification(project_key, dataset) for dataset in scheduled_job.get('datasets', [])]}
        return step;

    def convert_to_trigger(self, scheduled_job):
        trigger = {'id' : 'converted', 'type' : 'temporal', 'name' : 'Job frequency', 'delay' : '30', 'active' : scheduled_job['enabled']} # 30s delay
        trigger['params'] = {'frequency' : scheduled_job.get('frequency', 'Daily')
                            , 'dayOfWeek' : scheduled_job.get('dayOfWeek', None)
                            , 'dayOfMonth' : scheduled_job.get('dayOfMonth', 1)
                            , 'minute' : scheduled_job.get('minute', 0)
                            , 'hour' : scheduled_job.get('hour', 0)}
        return trigger

    def get_project_owner(self, diphome, project_key):
        project_file = osp.join(diphome.path, "config/projects/%s/params.json" % project_key)

        if not osp.isfile(project_file):
            return None

        project = base.json_loadf(project_file)

        return project.get('owner', None)

    def execute(self, diphome, simulate=False):
        scheduler_file = osp.join(diphome.path, "config/scheduler.json")

        if not osp.isfile(scheduler_file):
            return

        old_scheduler_data = base.json_loadf(scheduler_file)

        scenarios_by_project = {}
        for scheduled_job in old_scheduler_data.get('scheduledJobs', []):
            project_key = scheduled_job['projectKey']

            owner = self.get_project_owner(diphome, project_key)
            if owner is None:
                continue # project doesn't exist anymore

            scenarios = scenarios_by_project.get(project_key, [])

            index_in_project = len(scenarios)
            # build scenario
            scenario = {'id' : 'scheduled_job_%i' % index_in_project, 'type' : 'step_based', 'name' : 'Converted scheduled job %i' % index_in_project, 'active' : False}
            scenario['versionTag'] = {'versionNumber': 1, 'lastModifiedBy': {'login': 'dss_migration', 'displayName': 'Migration DSS'}, 'lastModifiedOn': int(time.time() * 1000)}
            scenario['runAsUser'] = owner
            scenario['triggers'] = [self.convert_to_trigger(scheduled_job)]
            scenario['params'] = {'steps' : [self.convert_to_step(project_key, scheduled_job)]}

            # and keep for that project
            scenarios.append(scenario)
            scenarios_by_project[project_key] = scenarios

            print("converted scenario in %s" % project_key)

        # dump all these scenarios on disk, in appropriate folder
        for project_key, scenarios in iteritems(scenarios_by_project):
            print("saving scenario in %s" % project_key)
            for scenario in scenarios:
                scenarios_folder = osp.join(diphome.path, 'config/projects/%s/scenarios' % project_key)
                if not os.path.exists(scenarios_folder):
                    os.mkdir(scenarios_folder) # ensure existence
                scenario_file = osp.join(scenarios_folder, "%s.json" % scenario['id'])
                base.json_dumpf(scenario_file, scenario)
                print("saved scenario in %s" % scenario_file)

        # get rid of old scheduled jobs
        base.json_dumpf(scheduler_file, {})


def migrate_custom_python(modeling):
    custom_python = modeling.get("custom_python", None)
    if isinstance(custom_python, list):
        return modeling # make migration idempotent, just in case
    if custom_python is None:
        modeling["custom_python"] = []
    else:
        modeling["custom_python"] = [custom_python]
    return modeling


class V12CustomPythonModelsInAnalysisConfig(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update custom python models in analyses config"

    def transform(self, modeling, filepath=None):
        return migrate_custom_python(modeling)

    def jsonpath(self,):
        return "modeling"

    def file_patterns(self,):
        return ["analysis/*/ml/*/params.json"]



class V12CustomPythonModelsInAnalysisData(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Update custom python models in analyses data"

    def execute(self, project_paths):
        if not osp.isdir(project_paths.analysis_data):
            return
        #a7QE8ig7/ecsqyuFW/sessions/s1/mltask.json
        for anl in os.listdir(project_paths.analysis_data):
            anl_dir = osp.join(project_paths.analysis_data, anl)
            if not osp.isdir(anl_dir):
                continue
            for mltask in os.listdir(anl_dir):
                sessions_dir = osp.join(anl_dir, mltask, "sessions")
                if not osp.isdir(sessions_dir):
                    continue
                for session in os.listdir(sessions_dir):
                    session_file = osp.join(sessions_dir, session, "mltask.json")
                    if not osp.isfile(session_file):
                        continue
                    print("Migrating saved ML Task session: %s %s %s" % (anl, mltask, session))
                    try:
                        data = base.json_loadf(session_file)
                        migrate_custom_python(data.get("modeling", {}))
                        base.json_dumpf(session_file, data)
                    except Exception as e:
                        print("Model migration FAILED: %s" % e)


class V12CustomPythonModelsInSavedModels(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update custom python models in saved models"

    def transform(self, modeling, filepath=None):
        return migrate_custom_python(modeling)

    def jsonpath(self,):
        return "miniTask.modeling"

    def file_patterns(self,):
        return ["saved_models/*.json"]


class V12AnalysisCharts(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update charts in analyses"

    def transform(self, obj, filepath=None):
        for chart in obj.get("script", {}).get("charts", []):
            if "data" in chart:
                chart["data"] = v12_transform_chart(chart["data"])
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["analysis/*/core_params.json"]


class V12DatasetCharts(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update charts in datasets"

    def transform(self, obj, filepath=None):
        if obj.get("type", "UNKNOWN") != "CHART":
            return obj
        chart = obj.get("content", {}).get("chart", None)
        if chart is not None:
            obj["content"]["chart"] = v12_transform_chart(chart)
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["insights/*.json"]


def v12_transform_chart(chart):

    def fix_dimension(dimension):
        if dimension['isA'] == 'ua' and dimension['type'] == 'DATE':
            if 'dateMode' not in dimension:
                dimension['dateMode'] = 'RANGE'

    for dimension in chart.get('uaXDimension', []):
        fix_dimension(dimension)
    for dimension in chart.get('uaYDimension', []):
        fix_dimension(dimension)

    return chart


class V12GroupPermissions(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Migrate to new group permission system"

    def execute(self, diphome, simulate=False):
        projects_path = osp.join(diphome.path, "config/projects")
        usersf = osp.join(diphome.path, "config/users.json")
        users_data = base.json_loadf(usersf)

        # First, find all users who had the "may write code" permissions
        users_who_can_code = []

        for user in users_data["users"]:
            if not "login" in user:
                continue
            if user.get("codeAllowed", False) == True:
                users_who_can_code.append(user["login"])

        # And create a new group for them
        code_group = {
            "name" : "_may_write_code_",
            "description" : "Users who may write unsafe code (migrated from DSS 2.X)",
            "mayWriteUnsafeCode" : True,
            "sourceType" : "LOCAL"
        }
        users_data["groups"].append(code_group)
        for user in users_data["users"]:
            if user["login"] in users_who_can_code:
                user_groups = user.get("groups", [])
                user_groups.append("_may_write_code_")
                user["groups"] = user_groups


        # Find all users who are currently analysts
        groups_who_are_analysts = set()

        if osp.isdir(projects_path):
            for project in os.listdir(projects_path):
                project_paramsf = osp.join(projects_path, project, "params.json")
                if osp.isfile(project_paramsf):
                    project_params = base.json_loadf(project_paramsf)
                    for permission in project_params.get("permissions", []):
                        group = permission.get("group", None)
                        if group is None:
                            continue
                        permtype = permission.get("type", "READER")
                        if permtype == "ANALYST_READWRITE" or permtype == "ANALYST_READONLY" or permtype == "ADMIN":
                            groups_who_are_analysts.add(group)

        print("Groups who are analysts: %s" % groups_who_are_analysts)

        users_who_are_analysts = set()
        for user in users_data["users"]:
            for group in user["groups"]:
                if group in groups_who_are_analysts:
                    users_who_are_analysts.add(user["login"])
        print("Users who are analysts: %s" % users_who_are_analysts)

        # And make their profile DATA_SCIENTIST
        for user in users_data["users"]:
            if user["login"] in users_who_are_analysts:
                user["userProfile"] = "DATA_SCIENTIST"
            else:
                user["userProfile"] = "READER"

        print("Writing new users file")
        base.json_dumpf(usersf, users_data)


class V12AddGitMode(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Add mandatory git mode to install.ini configuration file"

    def appliesTo(self):
        return [ "design", "api" ]

    def execute(self, diphome, simulate=False):
        installConfig = diphome.get_install_config()
        if not installConfig.getOption('git', 'mode'):
            installConfig.addOption('git', 'mode', 'global')
            if simulate:
                return
            installConfig.save()


class V12ConnectionParams(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        """
        properties are not (map str->str) anymore but (list {name, value})
        """
        return "Update connections models"

    def paramToBool(self, params, key):
        if isinstance(params.get(key, None), dku_basestring_type):
            params[key] = (params[key] == "true")

    def paramToObj(self, params, key): #obj or array
        if isinstance(params.get(key, None), dku_basestring_type):
            print("DO MIGRATE ", key)
            params[key] = json.loads(params[key])

    def paramToInt(self, params, key):
        if params.get(key, None) == "":
            del params[key]

    def transform(self, connections, filepath=None):
        for name, conn in iteritems(connections):
            params = conn.get("params", None)
            if params is not None:
                self.paramToInt(params, "port")
                self.paramToInt(params, "readTimeout") #cassandra
                self.paramToInt(params, "connectionLimit") #ftp

                self.paramToBool(params, "useTruncate")
                self.paramToBool(params, "ssl") #cassandra
                self.paramToBool(params, "passive") #ftp
                self.paramToBool(params, "useURL") #oracle
                self.paramToBool(params, "usePublicKey") #ssh

                self.paramToObj(params, "datanodeFqns") #impala

                params['dialectName'] = params.get('dialect', None) # renamed param

                properties =  params.get("properties", None)
                if properties is not None:
                    if isinstance(properties, list): # migration step idempotence
                        continue
                    new_properties = []
                    for key, value in iteritems(properties):
                        new_properties.append({"name": key, "value": value})
                    params["properties"] = new_properties
        return connections

    def jsonpath(self,):
        return "connections"

    def file_patterns(self,):
        return ["config/connections.json"]

class V12ColumnsSelector(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "ColumnsSelector")

    def transform_step(self, step):
        params = step.get("params", {})
        columns = params.get("columns", [""])

        params["columns"] = list(OrderedDict.fromkeys(columns)) # remove duplicates from the list

        if len(params["columns"]) > 1:
            params["appliesTo"] = "COLUMNS"
        else:
            params["appliesTo"] = "SINGLE_COLUMN"

        return step


class V12NestProcessor(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "NestProcessor")

    def transform_step(self, step):
        params = step.get("params", {})
        columns = params.get("inputColumns", [""])

        if len(columns) > 1:
            params["appliesTo"] = "COLUMNS"
        else:
            params["appliesTo"] = "SINGLE_COLUMN"

        params["columns"] = columns

        if "inputColumns" in params:
            del params["inputColumns"]

        return step


class V12NumericalCombinator(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        migration_app.ShakerStepMigrationOperation.__init__(self, "NumericalCombinator")

    def transform_step(self, step):
        params = step.get("params", {})
        params["appliesTo"] = "COLUMNS"
        return step


# Must be idempotent as it was actually applied starting with DSS 2.3.4 without version bump
class V12DkuSparkHome(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Migrate SPARK_HOME to DKU_SPARK_HOME in env-spark.sh"

    def appliesTo(self):
        return [ "design", "api" ]

    def execute(self, diphome, simulate=False):
        sparkEnv = osp.join(diphome.path, "bin", "env-spark.sh")
        if not osp.isfile(sparkEnv):
            return

        lines = []
        with open(sparkEnv) as f:
            for line in f.readlines():
                if line.startswith('export SPARK_HOME='):
                    lines.append(line.replace('export SPARK_HOME=', 'export DKU_SPARK_HOME=', 1))
                else:
                    lines.append(line)
        if simulate:
            return

        with open(sparkEnv, 'w') as f:
            for line in lines:
                f.write(line)

class V12SetupDefaultMetrics(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Activate default metrics on datasets"

    def transform(self, obj, filepath=None):
        def add_or_set_probe(probes, probe):
            probe_type = probe['type']
            existing = [p for p in probes if p.get('type','') == probe_type]
            for p in existing:
                probes.remove(p)
            probes.append(probe)

        def add_or_set_displayed(displayed_metrics, metric_id):
            if metric_id not in displayed_metrics:
                displayed_metrics.append(metric_id)

        metrics = obj.get('metrics', {})
        # make sure the fields we are going to fill are there
        probes = metrics.get('probes', [])
        displayed_state = metrics.get('displayedState', {})
        metrics['probes'] = probes
        metrics['displayedState'] = displayed_state

        displayed_metrics = displayed_state.get('metrics', [])
        displayed_state['metrics'] = displayed_metrics

        if 'partitioning' in obj and len(obj['partitioning'].get('dimensions', [])) > 0:
            # partitioned dataset, activate partition list and count
            probe = { "type": "partitioning", "computeOnBuildMode": "WHOLE_DATASET", "enabled":True, "configuration": { } }
            add_or_set_probe(probes, probe)

            displayed_state['partition'] = 'ALL'
        else:
            displayed_state['partition'] = 'NP'

        probe = { "type": "basic", "computeOnBuildMode": "PARTITION", "enabled":True,  "configuration": { } }
        add_or_set_probe(probes, probe)
        add_or_set_displayed(displayed_metrics, "basic:COUNT_COLUMNS")

        dataset_type = obj.get('type', '')
        fs_like_types = ["Filesystem", "HDFS", "S3", "FTP", "UploadedFiles", "RemoteFiles", "Twitter"]
        if dataset_type in fs_like_types:
            add_or_set_displayed(displayed_metrics, "basic:COUNT_FILES")
            add_or_set_displayed(displayed_metrics, "basic:SIZE")

        probe = { "type": "records", "computeOnBuildMode": "NO", "enabled":True, "configuration": { } }
        add_or_set_probe(probes, probe)
        add_or_set_displayed(displayed_metrics, "records:COUNT_RECORDS")

        # set the metrics setup on the dataset
        obj['metrics'] = metrics
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["datasets/*.json"]


###############################################################################
# V13 / DSS 3.0.2
###############################################################################

class V13EnableMetrics(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Propagate metrics enabled flags"

    def transform(self, obj, filepath=None):
        metrics = obj.get('metrics', {})
        probes = metrics.get('probes', [])

        metrics['probes'] = probes
        obj['metrics'] = metrics

        for probe in probes:
            pt = probe.get("type", "???")

            if pt == "basic" or pt == "records" or pt == "python" or pt == "sql_query" or pt == "py_plugin" or pt == "sql_plugin":
                probe["enabled"] = True

            if pt == "partitioning":
                if 'partitioning' in obj and len(obj['partitioning'].get('dimensions', [])) > 0:
                    probe["enabled"] = True

            if pt == "col_stats" or pt == "adv_col_stats" or pt == "verify_col":
                if len(probe.get("configuration", {}).get("aggregates", [])) > 0:
                    probe["enabled"] = True

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["datasets/*.json"]



###############################################################################
# V14 / DSS 3.1
###############################################################################

def transformRecipeInput(obj, filepath, recipeType):
    virtualInputs = obj.get("virtualInputs", None)
    recipe_filepath = filepath[0:-len(recipeType)] + "json"

    if not osp.exists(recipe_filepath):
        # Recipe does not actually exist, so do nothing
        return obj

    recipe_data = base.json_loadf(recipe_filepath)
    if "main" in recipe_data["inputs"]:
        input_names = [input["ref"] for input in recipe_data["inputs"]["main"]["items"]]

    if virtualInputs is not None:
        for vi in virtualInputs:
            if vi.get("index", None) is None:
                if vi.get("name", None) is not None and vi["name"] in input_names:
                    vi["index"] = input_names.index(vi["name"])
                    del vi["name"]
                else:
                    print("WARNING: recipe file is broken: inputs are inconsistent. File: " + filepath)
    else:
        print("WARNING: recipe file is broken:" + filepath)

    return obj


class V14JoinRecipesInputs(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Join recipes inputs representation"

    def transform(self, obj, filepath):
        return transformRecipeInput(obj, filepath, "join")

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.join"]

class V14JoinRecipesJoinType(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Join recipes join types"


    def getNewJoinType(self, join):
        """
        Note: the new LEFT mode is a restriction of the (ASYMMETRIC, outer) mode which was shown as LEFT and is now 'ADVANCED'
        """
        if join.get('type', None) == 'ASYMMETRIC':
            if join.get('outerJoin', False):
                return 'ADVANCED'
            return 'INNER'
        if join.get('outerJoin', False):
            return 'FULL'
        return 'INNER'

    def transform(self, obj, filepath):
        for join in obj.get("joins", []):
            join['type'] = self.getNewJoinType(join)
            join['outerJoinOnTheLeft'] = join.get('outerJoin', False)
            join.pop('outerJoin', None)
            join['conditionsMode'] = 'AND'
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.join"]

class V14StackRecipesInputs(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Stack recipes inputs representation"

    def transform(self, obj, filepath):
        return transformRecipeInput(obj, filepath, "vstack")

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.vstack"]

class V14HideHiveDkuUdf(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
         """
         dataiku-hive-udf.jar is now optional
         """
         return "Make dataiku-hive-udf.jar optional in Hive recipes"

    def transform(self, obj, filepath=None):
        # only touch hive recipes
        if obj.get("type", "") != "hive":
            return obj
        # add the new parameter
        params = obj.get("params", {})
        params["addDkuUdf"] = True
        obj["params"] = params # in case params didn't exist before
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]


def migrate_scatter_data(model_folder):
    import pandas as pd
    df = pd.read_pickle(osp.join(model_folder, "scatter_sample.pkl"))
    # create temp folder
    scatter_folder = osp.join(model_folder, "scatter")
    filtered = df._get_numeric_data()
    if not os.path.exists(scatter_folder):
        os.makedirs(scatter_folder)

    def write(name, items):
        f = open(osp.join(scatter_folder, name), 'w')
        newitems = []
        for item in items:
            if sys.version_info < (3,) and isinstance(item, unicode):
                newitems.append(item.encode("utf8"))
            else:
                newitems.append(item)
        f.write("\n".join(newitems))
        f.close()

    header = filtered.columns.values
    write('header', header)

    n_clusters = len(df['cluster_labels'].unique())
    write('c', df['cluster_labels'].map(
        lambda c: int(c.split("_")[1]) if c != 'cluster_outliers' else n_clusters - 1).astype(
        str).tolist())
    write('cluster', df['cluster_labels'].astype(str).tolist())
    for i in range(len(header)):
        write(str(i), filtered[header[i]].astype(str).tolist())

    shutil.make_archive(osp.join(model_folder, "scatter_sample"), 'zip', scatter_folder)
    shutil.rmtree(scatter_folder)


class V14ClusteringScatterplot(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Update scatter plot data in trained clustering models"

    def execute(self, project_paths):
        if osp.isdir(project_paths.analysis_data):
            self.execute_analysis_data(project_paths.analysis_data)
        if osp.isdir(project_paths.saved_models):
            self.execute_saved_models(project_paths.saved_models)

    def execute_saved_models(self, saved_models):
        for mod in os.listdir(saved_models):
            versions_dir = osp.join(saved_models,mod,"versions")
            if not osp.isdir(versions_dir):
                continue
            for version in os.listdir(versions_dir):
                model_folder = osp.join(versions_dir,version)
                if not osp.isdir(model_folder):
                    continue
                if "scatter_sample.pkl" in os.listdir(model_folder):
                    print("Migrating scatter plot in saved model : %s %s" % (mod,version))
                    try :
                        migrate_scatter_data(model_folder)
                    except Exception as e:
                        print("Saved model migration failed %s" % e)

    def execute_analysis_data(self, analysis_data):
        for anl in os.listdir(analysis_data):
            anl_dir = osp.join(analysis_data, anl)
            if not osp.isdir(anl_dir):
                continue
            for mltask in os.listdir(anl_dir):
                sessions_dir = osp.join(anl_dir, mltask, "sessions")
                if not osp.isdir(sessions_dir):
                    continue
                for session in os.listdir(sessions_dir):
                    session_dir = osp.join(sessions_dir,session)
                    if not osp.isdir(session_dir):
                        continue
                    for in_session in os.listdir(session_dir):
                        in_session_dir = osp.join(session_dir,in_session)
                        if osp.isdir(in_session_dir) and in_session.startswith("pp"):
                            for in_pp in os.listdir(in_session_dir):
                                in_pp_dir = osp.join(in_session_dir,in_pp)
                                if osp.isdir(in_pp_dir) and in_pp.startswith("m"):
                                    if "scatter_sample.pkl" in os.listdir(in_pp_dir):
                                        try:
                                            print("Migrating scatter plot in analysis : %s %s %s %s %s" % (anl, mltask, session,in_session,in_pp))
                                            migrate_scatter_data(in_pp_dir)
                                        except Exception as e:
                                            print("Analysis model migration failed %s" % e)


class V14NormalizeDoubles(migration_json.ProjectConfigJsonMigrationOperation):
    SQL_DATASET_TYPES = ["PostgreSQL", "MySQL", "Vertica", "Redshift", "JDBC", "Greenplum", "Teradata", "Oracle", "SQLServer"]

    def __repr__(self,):
        return "Normalize doubles"

    def transform(self, obj, filepath):
        if "formatType" in obj and obj["formatType"] == "csv" and "formatParams" in obj:
            obj["formatParams"]["normalizeDoubles"] = obj["formatParams"].get("normalizeDoubles", False)
        elif "type" in obj and obj["type"] in self.SQL_DATASET_TYPES and "params" in obj:
            obj["params"]["normalizeDoubles"] = obj["params"].get("normalizeDoubles", False)
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["datasets/*.json"]


class V14DefaultProjectStatus(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Add default project status in project-settings.json"

    def transform(self, obj, filepath=None):
        if obj and not hasattr(obj, "projectStatusList"):
            obj["projectStatusList"] = [
                {
                  "name": "Sandbox",
                  "color": "#4285F4"
                },
                {
                  "name" : "Draft",
                  "color": "#77bec2"
                },
                {
                  "name": "In use",
                  "color": "#94BF51"
                },
                {
                  "name": "In production",
                  "color": "#ee874a"
                },
                {
                  "name": "Archived",
                  "color": "#CCCCCC"
                }
            ]
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]


class V14RenameProjectPayloadFiles(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Update recipe payload file names"

    def execute(self, project_paths):
        recipes_folder = osp.join(project_paths.config, "recipes")
        if osp.isdir(recipes_folder):
            for f in os.listdir(recipes_folder):
                nf = None

                if f.endswith(".spark_sql_query"):
                    nf = re.sub(r"\.spark_sql_query$", ".sql", f)
                if f.endswith(".pyspark"):
                    nf = re.sub(r"\.pyspark$", ".py", f)
                if f.endswith(".sparkr"):
                    nf = re.sub(r"\.sparkr$", ".r", f)

                if nf is not None:
                    print("Moving %s to %s" % (f, nf))
                    shutil.move(osp.join(recipes_folder, f), osp.join(recipes_folder, nf))


###############################################################################
# V15 / DSS 4.0
###############################################################################


class V15ClusteringHeatmap(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Update scatter plot data in trained clustering models"

    def transform(self, old_heatmap, filepath=None):

        cluster_sizes = []
        num_averages = []
        cluster_averages = []
        num_std = []
        cluster_std = []

        for fs in old_heatmap["clusters_stats"][0]["feature_stats"]:
            num_averages.append(fs["global_mean"])
            num_std.append(fs["global_std"])

        for cs in old_heatmap["clusters_stats"]:
            cluster_sizes.append(cs["size"])
            avgs = []
            stds = []
            for fs in cs["feature_stats"]:
                avgs.append(fs["mean"])
                stds.append(fs["std"])
            cluster_averages.append(avgs)
            cluster_std.append(stds)

        return {
            "cluster_labels": old_heatmap["cluster_labels"],
            "cluster_sizes": cluster_sizes,
            "total_size": old_heatmap["nb_rows"],
            "num_names": old_heatmap["variable_names"],
            "num_averages": num_averages,
            "cluster_num_averages": cluster_averages,
            "num_std_devs": num_std,
            "cluster_num_std_devs": cluster_std,
            "cat_names": [],
            "levels": [],
            "proportions": [],
            "cluster_proportions": []
        }

    def jsonpath(self,):
        return ""

    def execute(self, project_paths):
        if osp.isdir(project_paths.analysis_data):
            self.execute_analysis_data(project_paths.analysis_data)
        if osp.isdir(project_paths.saved_models):
            self.execute_saved_models(project_paths.saved_models)

    def execute_saved_models(self, saved_models):
        for mod in os.listdir(saved_models):
            versions_dir = osp.join(saved_models, mod, "versions")
            if not osp.isdir(versions_dir):
                continue
            for version in os.listdir(versions_dir):
                model_folder = osp.join(versions_dir,version)
                if not osp.isdir(model_folder):
                    continue
                if "heatmap.json" in os.listdir(model_folder):
                    print("Migrating heatmap in saved model : %s %s" % (mod,version))
                    try:
                        migration_json.migrate_json_file(self, osp.join(model_folder, "heatmap.json"))
                    except Exception as e:
                        print("Saved model migration failed %s" % e)

    def execute_analysis_data(self, analysis_data):
        for anl in os.listdir(analysis_data):
            anl_dir = osp.join(analysis_data, anl)
            if not osp.isdir(anl_dir):
                continue
            for mltask in os.listdir(anl_dir):
                sessions_dir = osp.join(anl_dir, mltask, "sessions")
                if not osp.isdir(sessions_dir):
                    continue
                for session in os.listdir(sessions_dir):
                    session_dir = osp.join(sessions_dir,session)
                    if not osp.isdir(session_dir):
                        continue
                    for in_session in os.listdir(session_dir):
                        in_session_dir = osp.join(session_dir,in_session)
                        if osp.isdir(in_session_dir) and in_session.startswith("pp"):
                            for in_pp in os.listdir(in_session_dir):
                                in_pp_dir = osp.join(in_session_dir,in_pp)
                                if osp.isdir(in_pp_dir) and in_pp.startswith("m"):
                                    if "heatmap.json" in os.listdir(in_pp_dir):
                                        try:
                                            migration_json.migrate_json_file(self, osp.join(in_pp_dir, "heatmap.json"))
                                        except Exception as e:
                                            print("Analysis model migration failed %s" % e)

class V15JsonFlattenerWithCustomSeparator(migration_app.ShakerStepMigrationOperation):
    """
    JSONFlattener used '.' separator in output column names to separate hierarchical levels
    But it is best to avoid '.' in column names.
    """

    def __init__(self):
        super(V15JsonFlattenerWithCustomSeparator, self).__init__("JSONFlattener")

    def __repr__(self,):
        return "Enable custom separators in JSONFlattener (unnest object) processor"

    def transform_step(self, step):
        step.get("params", {})["separator"] = '.'
        return step

class V15RoundProcessor(migration_app.ShakerStepMigrationOperation):
    """
    RoundProcessor has new 'precision' & 'places' parameters.
    """

    def __init__(self):
        super(V15RoundProcessor, self).__init__("RoundProcessor")

    def __repr__(self,):
        return "Add precision & places parameters to round processor"

    def transform_step(self, step):
        params = step.get("params", {"mode": "ROUND"})
        params["precision"] = 0
        params["places"] = 0
        return step


class V15RefreshNotebookInsightScenarioStep(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update refresh_notebook_insight scenario step"

    def transform(self, step, filepath):
        if step.get('type', None) == 'refresh_notebook_insight':
            # Read the notebookId from the insight file
            project_dir = osp.dirname(osp.dirname(filepath))
            insight_file = osp.join(project_dir, 'insights', step.get('params', {}).get('insightId', 'none') + '.json')
            if (osp.isfile(insight_file)):
                insight = base.json_loadf(insight_file)
                step.get('params', {})['notebookId'] = insight.get('notebook', '').replace('.', '_')
            step['type'] = 'create_jupyter_export'
        return step

    def jsonpath(self,):
        return "params.steps"

    def file_patterns(self,):
        return ["scenarios/*.json"]

def v15_add_to_dashboard_authorizations(dashboard_authorizations, object_type, object_smart_name):
    # Turn smart name into smart ref
    splits = object_smart_name.split(".")
    if len(splits) == 1:
        object_ref = {'objectType': object_type, 'objectId': object_smart_name}
    else:
        object_ref = {'objectType': object_type, 'projectKey': splits[0], 'objectId': splits[1]}

    for auth in dashboard_authorizations:
        if object_ref == auth['objectRef']:
            return

    dashboard_authorizations.append({'objectRef': object_ref, 'modes': ['READ']})


def v15_migrate_chart_def(chart_def):
    if chart_def.get('type', None) == 'binned_xy' and chart_def.get('variant', None) == 'binned_xy_hex':
        chart_def['hexbinRadiusMode'] = 'ABSOLUTE'
    return chart_def

def v15_migrate_chart_insight(insight, insight_id, is_pinned, dashboard_authorizations, project_paths):
    #print("Migrate chart insight id=%s is_pinned=%s (insight=%s)\n" % (insight_id, is_pinned, insight))
    # Create chart in dataset explore
    dataset_smart_name = insight['content']['dataset']
    dataset_chart = {
        'refreshableSelection': insight.get('content', {}).get('dataView', {}).get("sampling",{}),
        'def': v15_migrate_chart_def(insight.get('content', {}).get('chart', {}))
    }

    dataset = None
    if dataset_smart_name.find(".") == -1:
        dataset_file = osp.join(project_paths.config, "datasets", "%s.json" % dataset_smart_name)
        if osp.isfile(dataset_file):
            dataset = base.json_loadf(dataset_file)
        else:
            print("No dataset (file %s does not exist) ..." % dataset_file)
    #print("Migrate chart insight dataset_name=%s has_dataset=%s" % (dataset_smart_name, dataset is not None))

    maybe_set_chart_engine(dataset_chart, dataset, dataset_chart["refreshableSelection"], dataset_chart["def"])

    base.create_dir_if_needed(osp.join(project_paths.config, 'explore'))
    explore_file = osp.join(project_paths.config, 'explore', dataset_smart_name + '.json')
    explore = base.json_loadf(explore_file) if osp.isfile(explore_file) else {}

    explore_charts = explore.get('charts', None)
    if explore_charts is None:
        explore["charts"] = []
        explore_charts = explore["charts"]
    explore_charts.append(dataset_chart)
    base.json_dumpf(explore_file, explore)

    if is_pinned:
        # Create insight
        new_insight = v15_migrate_insight_common(insight)
        new_insight['type'] = 'chart'
        new_insight['params'] = {
            'datasetSmartName': dataset_smart_name,
            'refreshableSelection': insight.get('content', {}).get('dataView', {}).get("sampling",{}),
            'def': v15_migrate_chart_def(insight.get('content', {}).get('chart', {}))
        }

        maybe_set_chart_engine(new_insight, dataset, new_insight["params"]["refreshableSelection"], new_insight["params"]["def"])

        new_insight_file = osp.join(project_paths.config, 'insights', insight_id + '.json')
        print("Write new insight to %s" % new_insight_file)
        base.json_dumpf(new_insight_file, new_insight)

        # Add to dashboardAuthorizations
        v15_add_to_dashboard_authorizations(dashboard_authorizations, 'DATASET', dataset_smart_name)

        minimal = insight.get('miniature', {}).get('type', None) == 'chart' # 'chart' was the minichart, 'full_chart' was the detailed chart
        chart_type = new_insight['params']['def'].get('type', None)

        # Return tile
        return v15_create_tile_common({
            'tileType': "INSIGHT",
            'insightType': "chart",
            'insightId': insight_id,
            'tileParams': {
                'showXAxis': (not minimal) and (chart_type != 'stacked_bars'),
                'showYAxis': (not minimal) or (chart_type == 'stacked_bars'),
                'showTooltips': True,
                'showLegend': insight.get('miniature', {}).get('type', None) != 'chart' or insight.get('content', {}).get('chart', {}).get('type', None) == 'pie'
            }
        }, insight, project_paths)

def v15_migrate_web_app_insight(insight, insight_id, is_pinned, dashboard_authorizations, project_paths):
    base.create_dir_if_needed(osp.join(project_paths.config, "web_apps"))

    # Create web app
    web_app = v15_migrate_insight_common(insight)
    web_app['pyBackendEnabled'] = insight.get('pyBackendEnabled', False)
    web_app['pyBackendMustRun'] = insight.get('pyBackendMustRun', False)
    web_app['apiKey'] = insight.get('apiKey', "")
    web_app['libraries'] = insight.get('libraries', [])
    web_app_id = insight_id
    web_app_file = osp.join(project_paths.config, 'web_apps', web_app_id + '.json')
    shutil.copytree(osp.join(project_paths.config, 'insights_old', insight_id), osp.join(project_paths.config, 'web_apps', web_app_id))

    base.json_dumpf(web_app_file, web_app)

    if is_pinned:
        # Create insight
        new_insight = v15_migrate_insight_common(insight)
        new_insight['type'] = 'web_app'
        new_insight['params'] = {
            'webAppSmartId': web_app_id
        }
        new_insight_file = osp.join(project_paths.config, 'insights', insight_id + '.json')
        base.json_dumpf(new_insight_file, new_insight)

        # Add to dashboardAuthorizations
        v15_add_to_dashboard_authorizations(dashboard_authorizations, 'WEB_APP', web_app_id)

        # Return tile
        return v15_create_tile_common({
            'insightType': "web_app",
            'insightId': insight_id,
            'tileParams': {

            }
        }, insight, project_paths)

def v15_migrate_dataset_insight(insight, insight_id, is_pinned, dashboard_authorizations, project_paths):
    base.create_dir_if_needed(osp.join(project_paths.config, "explore"))

    # Create insight
    new_insight = v15_migrate_insight_common(insight)
    new_insight['type'] = 'dataset_table'
    new_insight['params'] = {
        'datasetSmartName': insight.get('dataset', '')
    }
    new_insight_file = osp.join(project_paths.config, 'insights', insight_id + '.json')
    base.json_dumpf(new_insight_file, new_insight)

    if is_pinned:
        # Add to dashboardAuthorizations
        v15_add_to_dashboard_authorizations(dashboard_authorizations, 'DATASET', insight.get('odbId', ''))

        # Return tile
        return v15_create_tile_common({
            'insightType': "dataset_table",
            'insightId': insight_id,
            'tileParams': {

            }
        }, insight, project_paths)

def v15_migrate_folder_insight(insight, insight_id, is_pinned, dashboard_authorizations, project_paths):
    # Create insight
    new_insight = v15_migrate_insight_common(insight)
    new_insight['type'] = 'managed-folder_content'
    new_insight['params'] = {
        'folderSmartId': insight.get('odbId', None),
        'itemPath': insight.get('itemPath', None)
    }
    new_insight_file = osp.join(project_paths.config, 'insights', insight_id + '.json')
    base.json_dumpf(new_insight_file, new_insight)

    if is_pinned:
        # Add to dashboardAuthorizations
        v15_add_to_dashboard_authorizations(dashboard_authorizations, 'MANAGED_FOLDER', insight.get('odbId', ''))

        # Return tile
        return v15_create_tile_common({
            'insightType': "managed-folder_content",
            'insightId': insight_id,
            'tileParams': {

            }
        }, insight, project_paths)


def rename_jupyter_notebook(old_name):
    if old_name.endswith(".ipynb"):
        x = re.sub(r".ipynb$", "", old_name)
        return x.replace(".", "_") + ".ipynb"
    else:
        # Should not happen ...
        return old_name.replace(".", "_")

def v15_migrate_notebook_insight(insight, insight_id, is_pinned, dashboard_authorizations, project_paths):
    base.create_dir_if_needed(project_paths.jupyter_exports)

    notebook_name = insight.get("notebook", None)
    if notebook_name is not None:
        notebook_name = rename_jupyter_notebook(notebook_name)
    else:
        notebook_name = "__unknown_notebook__"

    # Move existing notebook export
    new_insight = v15_migrate_insight_common(insight)
    export_file_src = osp.join(project_paths.config, 'insights_old', insight_id + '.ipython.html')
    if osp.isfile(export_file_src):
        base.create_dir_if_needed(osp.join(project_paths.jupyter_exports, notebook_name))
        export_file_dst = osp.join(project_paths.jupyter_exports, notebook_name, str(insight.get('refreshedOn', int(round(time.time() * 1000)))) + '.html')
        os.rename(export_file_src, export_file_dst)


    # Create insight
    new_insight['type'] = 'jupyter'
    new_insight['params'] = {
        'notebookSmartName': notebook_name,
        'loadLast': True
    }
    new_insight_file = osp.join(project_paths.config, 'insights', insight_id + '.json')
    base.json_dumpf(new_insight_file, new_insight)

    # Add to dashboardAuthorizations
    v15_add_to_dashboard_authorizations(dashboard_authorizations, 'JUPYTER_NOTEBOOK', notebook_name)

    if is_pinned:
        # Return tile
        return v15_create_tile_common({
            'insightType': "jupyter",
            'insightId': insight_id,
            'tileParams': {

            }
        }, insight, project_paths)

def v15_migrate_insight_common(insight):
    return {
        'name': insight.get('name'),
        'tags': insight.get('tags', []),
        'description': insight.get('description', ''),
        'checklists': insight.get('checklists', {}),
        'creationTag': {
            'lastModifiedBy': {'login': insight.get('createdBy')},
            'lastModifiedOn': insight.get('createdOn')
        },
        'shortDesc': insight.get('shortDesc', ''),
        'listed': True,
        'owner': insight.get('createdBy')
    }

def v15_create_tile_common(tile, insight, project_paths):
    tile['tileType'] = 'INSIGHT'
    tile['showTitle'] = insight.get('miniature', {}).get('showTitle', False)
    if tile['showTitle']:
        tile['showTitle'] = 'YES'
    else:
        tile['showTitle'] = 'NO'
    miniatureType = insight.get('miniature', {}).get('type', None)

    # Migrate insight image if it exists
    insight_image_folder = osp.join(project_paths.config, 'pictures', 'INSIGHT-' + tile.get('insightId', ''))
    insight_image = osp.join(insight_image_folder, 'original.png')
    if osp.isfile(insight_image):
        insight_image_dst_folder = osp.join(project_paths.config, 'pictures', 'DASHBOARD_TILE-' + tile.get('insightId', ''))
        shutil.move(insight_image_folder, insight_image_dst_folder)
        tile['imageId'] = tile.get('insightId', '')

    tile['resizeImage'] = tile.get('miniature', {}).get('fullImage', True)

    if miniatureType == 'picture':
        tile['displayMode'] = 'IMAGE'
        tile['showTitle'] = 'MOUSEOVER'
        tile['clickAction'] = 'OPEN_INSIGHT'
    elif miniatureType == 'description':
        tile['displayMode'] = 'INSIGHT_DESC'
        tile['clickAction'] = 'OPEN_INSIGHT'
    elif miniatureType == 'description_and_picture':
        tile['displayMode'] = 'IMAGE_AND_INSIGHT_DESC'
        tile['clickAction'] = 'OPEN_INSIGHT'
    else:
        tile['displayMode'] = 'INSIGHT'
        tile['clickAction'] = 'DO_NOTHING'

    return tile

class V15Insights(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Move insights"

    def execute(self, project_paths):
        insight_migrations = {
            'CHART': v15_migrate_chart_insight,
            'HTML_APP': v15_migrate_web_app_insight,
            'DATASET': v15_migrate_dataset_insight,
            'MANAGED_FOLDER': v15_migrate_folder_insight,
            'IPYTHON': v15_migrate_notebook_insight
        }

        base.create_dir_if_needed(osp.join(project_paths.config, "dashboards"))
        base.create_dir_if_needed(osp.join(project_paths.config, "insights"))

        pinned_insights = {}
        pinboard_file = osp.join(project_paths.config, "pinboard.json")
        if osp.isfile(pinboard_file):
            pinboard = base.json_loadf(pinboard_file)
            for section in pinboard.get('sections', []):
                for pinlet in section.get('pinlets', []):
                    pinned_insights[pinlet.get('insightId', '')] = True
        else:
            pinboard = {}

        print("Insights that were pinned: %s" % json.dumps(pinned_insights))

        insights_dir = osp.join(project_paths.config, "insights")
        if not osp.isdir(insights_dir):
            return

        insights_old_dir = osp.join(project_paths.config, "insights_old")
        if osp.isdir(insights_old_dir):
            shutil.rmtree(insights_old_dir)

        os.rename(insights_dir, insights_old_dir)
        base.create_dir_if_needed(osp.join(project_paths.config, "insights"))

        dashboard_authorizations = []

        for file in os.listdir(insights_old_dir):
            insight_id, extension = os.path.splitext(file)
            print("Migrate old insight: %s (%s) was_pinned: %s" % (insight_id, extension, insight_id in pinned_insights))
            if extension != '.json': continue
            insight = base.json_loadf(osp.join(insights_old_dir, file))
            pinned_insights[insight_id] = insight_migrations[insight['type'].upper()](insight, insight_id, insight_id in pinned_insights, dashboard_authorizations, project_paths)

        dashboard = {
            'pages': [],
            'owner': 'admin', # TODO @dashboards project owner
            'listed': True,
            'name': 'Default dashboard'
        }

        for section in pinboard.get('sections', []):
            tiles = []
            for pinlet in section.get('pinlets', []):
                tile = pinned_insights[pinlet.get('insightId', '')]
                if type(tile) != dict:
                    continue
                tile['box'] = {
                    'left': pinlet.get('box', {}).get('left', 1) * 2 + 3,
                    'width': pinlet.get('box', {}).get('width', 1) * 2,
                    'top': pinlet.get('box', {}).get('top', 1) * 2,
                    'height': pinlet.get('box', {}).get('height', 1) * 2
                }
                tiles.append(tile)

            dashboard['pages'].append({
                'id': base.generate_random_id(7),
                'title': section.get('title', ''),
                'grid': {'tiles': tiles}}
            )

        if len(dashboard['pages']) == 0:
            dashboard['pages'].append({
                'id': base.generate_random_id(7),
                'grid': {'tiles': []}}
            )

        dashboard_id = base.generate_random_id(7)
        dashboard_file = osp.join(project_paths.config, 'dashboards', dashboard_id + '.json')
        base.json_dumpf(dashboard_file, dashboard)

        params_file = osp.join(project_paths.config, "params.json")
        params = base.json_loadf(params_file)
        params['dashboardAuthorizations'] = {'allAuthorized': False, 'authorizations': dashboard_authorizations}
        base.json_dumpf(params_file, params)

        # Delete insights_old & pinboard.json
        if osp.isdir(insights_old_dir):
            shutil.rmtree(insights_old_dir)
        if osp.isfile(pinboard_file):
            os.remove(pinboard_file)


class V15JupyterExportsDir(migration_base.MigrationOperation):
    def __repr__(self, ):
        return "Create jupyter_exports directory"

    def execute(self, diphome, simulate=False):
        if not simulate:
            base.create_dir_if_needed(osp.join(diphome.path, "jupyter_exports"))


class V15ProjectSettingsExposed(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Move exposedComputables to exposedObjects"

    def transform(self, obj, filepath=None):
        obj['exposedObjects'] = {
            "objects": obj.get("settings", {}).get("exposedComputables", [])
        }
        if "exposedComputables" in obj.get("settings", {}):
            del obj["settings"]["exposedComputables"]

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["params.json"]

class V15HProxyRemovalInRecipes(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Switch to Hiveserver2 for Hive recipes"

    def transform(self, obj, filepath):
        recipe_type = obj.get("type", "")
        multi_engine_recipe_types = ["grouping", "join", "window", "vstack"]
        def convert_flag(use_global_metastore):
            return "HIVECLI_GLOBAL" if use_global_metastore else "HIVECLI_LOCAL"
        if recipe_type == "hive":
            if obj.get("params", {}).get("useGlobalMetastore", None) is not None:
                obj["params"]["executionEngine"] = convert_flag(obj["params"]["useGlobalMetastore"])
        elif recipe_type in multi_engine_recipe_types:
            payloadf = filepath.decode("utf8").replace(".json", ".%s" % recipe_type)
            payload = base.json_loadf(payloadf)
            if payload.get("engineParams", {}).get("hive", {}).get("useGlobalMetastore", None) is not None:
                payload["engineParams"]["hive"]["executionEngine"] = convert_flag(payload["engineParams"]["hive"]["useGlobalMetastore"])
                base.json_dumpf(payloadf, payload)

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]


class V15HProxyRemovalInNotebooks(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Switch to Hiveserver2 for Hive notebooks"

    def transform(self, obj, filepath):
        old_prefix = "@virtual(hive-hproxy)"
        new_prefix = "@virtual(hive-jdbc)"
        connection = obj.get("connection", "")
        if connection.startswith(old_prefix):
            obj["connection"] = new_prefix + connection[len(old_prefix):]

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["notebooks/sql/*/params.json"]

class V15HProxyRemovalInScenarios(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Switch to Hiveserver2 for scenarios"

    def transform(self, obj, filepath):
        old_prefix = "@virtual(hive-hproxy)"
        new_prefix = "@virtual(hive-jdbc)"
        for trigger in obj.get("triggers", []):
            if trigger.get("params", {}).get("connection", "").startswith(old_prefix):
                trigger["params"]["connection"] = new_prefix + trigger["params"]["connection"][len(old_prefix):]
        for step in obj.get("params", {}).get("steps", []):
            if step.get("params", {}).get("connection", "").startswith(old_prefix):
                step["params"]["connection"] = new_prefix + step["params"]["connection"][len(old_prefix):]

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["scenarios/*.json"]


class V15DenormalizeMessagingChannels(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Denormalize dataset/webhook messaging channels setup"

    def execute(self, diphome, simulate=False):
        channels_file = osp.join(diphome.path, "config/messaging-channels.json")

        if not osp.isfile(channels_file):
            return

        channels_data = base.json_loadf(channels_file)
        old_channels = channels_data.get('channels',[])
        new_channels = [c for c in old_channels if c.get('type', '') not in ['webhook', 'dataset']]
        new_channels_data = {'channels' : new_channels}
        base.json_dumpf(channels_file, new_channels_data)

        def get_channel_by_id(id):
            for channel_data in old_channels:
                if channel_data.get('id', None) == id:
                    return channel_data
            return None

        def update_messaging(messaging):
            if messaging is None:
                return
            if messaging.get('type', None) == 'webhook':
                keys_to_copy = ['useProxy']
            elif messaging.get('type', None) == 'dataset':
                keys_to_copy = ['projectKey', 'datasetName']
            else:
                keys_to_copy = []

            if len(keys_to_copy) > 0:
                #print("Messaging to migrate")
                #print(json.dumps(messaging, indent=2))
                channel_id = messaging.get('channelId', None)
                channel_data = get_channel_by_id(channel_id)
                if channel_data is not None:
                    messaging['configuration'] = messaging.get('configuration', None)
                    for prop in keys_to_copy:
                        messaging['configuration'][prop] = channel_data.get('configuration', {}).get(prop, None)
                else:
                    print('Messaging channel not found : %s' % channel_id)

        def update_reporter(reporter):
            update_messaging(reporter.get('messaging', None))

        def update_step(step):
            if step.get('type', None) == 'send_report':
                update_messaging(step.get('params', {}).get('messaging', None))

        for scenario_file in glob(osp.join(diphome.path, 'config/projects/*/scenarios/*json')):
            scenario = base.json_loadf(scenario_file)

            for reporter in scenario.get('reporters', []):
                update_reporter(reporter)
            for step in scenario.get('params', {}).get('steps', []):
                update_step(step)

            base.json_dumpf(scenario_file, scenario)

class V15RetypeChannels(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Change types in messaging channels configuration"

    def transform(self, channel, filepath=None):
        if channel.get('type', None) == 'aws':
            channel['type'] = 'aws-ses-mail'
        return channel

    def jsonpath(self,):
        return "channels"

    def file_patterns(self,):
        return ["config/messaging-channels.json"]

messaging_type_mapping = { "smtp":"mail-scenario" ,
            "aws":"mail-scenario",
            "hipchat":"hipchat-scenario",
            "slack":"slack-scenario",
            "webhook":"webhook-scenario",
            "twilio":"twilio-scenario",
            "shell":"shell-scenario",
            "dataset":"dataset-scenario",
          }
def update_messaging(messaging):
    if messaging is None:
        return
    messaging['type'] = messaging_type_mapping.get(messaging.get('type', ''), None)
    messaging['configuration'] = messaging.get('configuration', {})
    messaging['configuration']['channelId'] = messaging.get('channelId', None)
    if messaging['type'] == "hipchat-scenario":
        messaging['configuration']['useGlobalChannel'] = True

class V15RetypeMessagings(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update type and channelId in messaging configurations"

    def transform(self, scenario, filepath):
        def update_reporter(reporter):
            update_messaging(reporter.get('messaging', None))

        def update_step(step):
            if step.get('type', None) == 'send_report':
                update_messaging(step.get('params', {}).get('messaging', None))

        for reporter in scenario.get('reporters', []):
            update_reporter(reporter)
        for step in scenario.get('params', {}).get('steps', []):
            update_step(step)
        return scenario

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["scenarios/*.json"]


class V15RetypeMessagingsInScenarioRuns(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Update type and channelId in messaging configurations of scenario runs"

    def transform(self, obj, filepath):
        def update_reporter(reporter):
            update_messaging(reporter.get('messaging', None))

        def update_step(step):
            if step.get('type', None) == 'send_report':
                update_messaging(step.get('params', {}).get('messaging', None))

        scenario = obj.get("scenario", {})
        for reporter in scenario.get('reporters', []):
            update_reporter(reporter)
        for step in scenario.get('params', {}).get('steps', []):
            update_step(step)
        for reporter_state in obj.get('reportersStates', []):
            reporter_state['messagingType'] = messaging_type_mapping.get(reporter_state.get('messagingType', ''), None)

        return obj

    def file_patterns(self,):
        return ["scenarios/*/*/*/run.json"]

    def jsonpath(self,):
        return ""

class V15FixupAuthCtxInScenarioRuns(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Update authentication context of scenario runs"

    def transform(self, obj, filepath):
        run_as_user = obj.get("runAsUser", {})
        run_as_user['authSource'] = 'USER_FROM_UI'
        return obj

    def file_patterns(self,):
        return ["scenarios/*/*/*/run.json"]

    def jsonpath(self,):
        return ""


class V15AddGridSearchRFGBTETInAnalysisConfig(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update ML parameters in analysis config"

    def transform(self, modeling, filepath=None):
        v15addgridsearch_do_update_dict(modeling)
        v15_add_missing_modeling_params(modeling)
        return modeling

    def jsonpath(self,):
        return "modeling"

    def file_patterns(self,):
        return ["analysis/*/ml/*/params.json","recipes/*.prediction_training"]


class V15AddGridSearchRFGBTETInAnalysisData(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Update ML parameters in analysis data"

    def execute(self, project_paths):
        #a7QE8ig7/ecsqyuFW/sessions/s1/mltask.json
        for mltask_file in glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data):
            print("Migrating saved ML Task session: %s " % (mltask_file))
            try:
                data = base.json_loadf(mltask_file)
                v15addgridsearch_do_update_dict(data.get("modeling", {}))
                v15_add_missing_modeling_params(data.get("modeling", {}))
                base.json_dumpf(mltask_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)

        #a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/rmodeling_params.json
        for rm_file in glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data):
            print("Migrating saved ML Task rmodeling file: %s" % rm_file)
            try:
                data = base.json_loadf(rm_file)
                v15addgridsearch_do_update_dict(data)
                v15_add_missing_modeling_params(data)
                base.json_dumpf(rm_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)

        #a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/actual_params.json
        for ap_file in glob("%s/*/*/sessions/*/*/*/actual_params.json" % project_paths.analysis_data):
            print("Migrating saved ML Task actualparams file: %s" % ap_file)
            try:
                data = base.json_loadf(ap_file)
                v15addgridsearch_do_update_dict(data.get('resolved',{}))
                v15_add_missing_modeling_params(data.get("resolved",{}))
                base.json_dumpf(ap_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)


class V15AddGridSearchRFGBTETInRootSavedData(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Update ML parameters in root saved models"

    def execute(self, project_paths):
        # modelid/versions/vid/rmodeling_params.json
        for rm_file in glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models):
            print("Migrating saved ML Task rmodeling file: %s" % rm_file)
            try:
                data = base.json_loadf(rm_file)
                v15addgridsearch_do_update_dict(data)
                v15_add_missing_modeling_params(data)
                base.json_dumpf(rm_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)

        # modelid/versions/vid/actual_params.json
        for ap_file in glob("%s/*/versions/*/actual_params.json" % project_paths.saved_models):
            print("Migrating saved ML Task rmodeling file: %s" % ap_file)
            try:
                data = base.json_loadf(ap_file)
                v15addgridsearch_do_update_dict(data.get("resolved",{}))
                v15_add_missing_modeling_params(data.get("resolved",{}))
                base.json_dumpf(ap_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)


class V15AddGridSearchRFGBTETInSavedModels(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update ML parameters in saved models"

    def transform(self, modeling, filepath=None):
        v15addgridsearch_do_update_dict(modeling)
        v15_add_missing_modeling_params(modeling)
        return modeling

    def jsonpath(self,):
        return "miniTask.modeling"

    def file_patterns(self,):
        return ["saved_models/*.json"]


def v15addgridsearch_do_update_dict(modeling):
    if modeling.get('algorithm') == 'EXTRA_TREES':
        if modeling.get('rf_regressor_grid'):
            modeling['extra_trees_grid'] = modeling['rf_regressor_grid']
            del modeling['rf_regressor_grid']
        if modeling.get('rf_classifier_grid'):
            modeling['extra_trees_grid'] = modeling['rf_classifier_grid']
            del modeling['rf_classifier_grid']

    def replace_auto(modeling):
        if modeling.get('n_estimators') == [0]:
            modeling['n_estimators'] = [100]
    if modeling.get('rf_estimators') == 0:
        modeling['rf_estimators'] = 100

    extra_trees = {
        'listify': [('max_tree_depth', 100), ('min_samples_leaf', 8), ('max_features', 0)],
    }
    random_forest = {
        'listify': [('max_tree_depth', 100), ('min_samples_leaf', 8), ('max_features', 0)],
        'funcs': [replace_auto],
    }
    gbt = {
        'listify': [('learning_rate', 0.1), ('max_depth', 3), ('min_samples_leaf', 3), ('max_features', 0)],
    }
    key_properties_list = {
        'extra_trees': extra_trees,
        'extra_trees_grid': extra_trees,
        'random_forest_classification': random_forest,
        'random_forest_regression': random_forest,
        'rf_regressor_grid': random_forest,
        'rf_classifier_grid': random_forest,
        'gbt_regression': gbt,
        'gbt_classification': gbt,
        'gbt_classifier_grid': gbt,
        'gbt_regressor_grid': gbt,
    }

    for key, properties in key_properties_list.items():
        modeling_key = modeling.get(key, dict())
        for prop, prop_default in properties.get('listify', []):
            modeling_key_prop = modeling_key.get(prop, None)
            if not modeling_key_prop:
                modeling_key[prop] = [prop_default]
            elif isinstance(modeling_key_prop, list):
                pass  # make migration idempotent, just in case (but still fills empty with default vals)
            else:
                modeling_key[prop] = [modeling_key_prop]
        for func in properties.get('funcs', []):
            func(modeling_key)
    return modeling

def v15_add_missing_modeling_params(modeling):
    missing_keys = {
        "gbt_max_features": 0,
        "gbt_min_samples_leaf": 3,
        "gbt_max_feature_prop": 0.1,
        "gbt_selection_mode": "auto",
        "rf_selection_mode" : "auto"
    }
    for key, value in missing_keys.items():
        if not modeling.get(key):
            modeling[key] = value
    return modeling


def unsecure_random_string(N=16):
    return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(N))

def maybe_set_chart_engine(engine_container, dataset, refreshable_selection, chart_def):
    if dataset is None:
        return

    dataset_type = dataset.get("type", "???")

    if dataset_type in ["MySQL", "PostgreSQL", "Greenplum", "Vertica", "Oracle", "Netezza",
                "Redshift", "SAPHANA", "HDFS"]:
        if refreshable_selection.get("selection", {}).get("samplingMethod", "???") == "FULL":
            if chart_def.get("useLiveProcessingIfAvailable", False) == True:
                if chart_def["type"] in ["multi_columns_lines", "grouped_columns", "stacked_columns", "stacked_bars",
                    "lines", "stacked_area", "pivot_table", "pie", "grouped_xy"]:
                    print("Setting a chart as SQL engine (dataset %s)" % (dataset_type))
                    engine_container["engineType"] = "SQL"

class V15ChartsInExplore(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Refactor charts in explore"

    def transform(self, obj, filepath):
        explore = {
            "script" : obj,
            "charts" : []
        }

        # This probably does not exist, so we don't bother migrating engines ...
        for chart in obj.get("charts", []):
            newChart = {
                "def" : v15_migrate_chart_def(chart.get("data", {}))
            }

            vizSampling = obj.get("vizSampling", {})
            if vizSampling.get("selection", None) is None:
                newChart["copySelectionFromScript"] = True
            else:
                newChart["refreshableSelection"] = vizSampling
                maybe_set_chart_engine(newChart, None, newChart["refreshableSelection"], newChart["def"])

            explore["charts"].append(newChart)

        return explore

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["explore/*.json"]


class V15ChartsInAnalysis(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Refactor charts in analysis"

    def transform(self, obj, filepath):
        script = obj.get("script", {})
        obj["charts"] = []

        for chart in script.get("charts", []):
            newChart = {
                "def" : v15_migrate_chart_def(chart.get("data", {}))
            }

            vizSampling = script.get("vizSampling", {})
            if vizSampling.get("selection", None) is None:
                newChart["copySelectionFromScript"] = True
            else:
                newChart["refreshableSelection"] = vizSampling

            obj["charts"].append(newChart)

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["analysis/*/core_params.json"]


class V15ChartsInAnalysisModels(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Refactor charts in analysis predicted data"

    def transform(self, obj, filepath):
        script = obj.get("predictionDisplayScript", {})
        obj["predictionDisplayCharts"] = []

        for chart in script.get("charts", []):
            newChart = {
                "def" : v15_migrate_chart_def(chart.get("data", {}))
            }
            obj["predictionDisplayCharts"].append(newChart)

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["analysis/*/ml/*/params.json"]

class V15PrepareRecipeEngine(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update engine in Prepare recipes"

    def transform(self, obj, filepath=None):
        if obj.get('type', None) != 'shaker':
            return obj

        if 'params' not in obj:
            obj['params'] = {}

        old_engine = obj['params'].get('engine', None)
        new_engine = {'DSS_STREAM':'DSS','SPARK':'SPARK','HADOOP_MAPREDUCE':'HADOOP_MAPREDUCE'}.get(old_engine, 'DSS')
        obj['params']['engineType'] = new_engine
        if 'engine' in obj['params']:
            del obj['params']['engine']

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]

class V15SelectDSSSyncRecipeEngine(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Set engine to DSS stream in sync recipes"

    def transform(self, obj, filepath=None):
        if obj.get('type', None) != 'sync':
            return obj

        if 'params' not in obj:
            obj['params'] = {}


        output_dataset_type = "???"

        main_output_items = obj.get("outputs", {}).get("main", {}).get("items", [])
        if len(main_output_items) == 1:
            main_output_ref = main_output_items[0].get("ref", "???")

            rep = osp.dirname(filepath)
            dataset_file = osp.join(rep, "..", "datasets", "%s.json" % main_output_ref)
            if osp.isfile(dataset_file):
                dataset = base.json_loadf(dataset_file)
                output_dataset_type = dataset.get("type", "???")
            else:
                print(" Dataset file not found")

        print("Output dataset type is %s" % output_dataset_type)
        if output_dataset_type != "Redshift":
            obj['params']['engineType'] = 'DSS'

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]

class V15SelectDSSRecipeEngine(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Set engine to DSS stream in split and sampling recipes"

    def transform(self, obj, filepath=None):
        obj['engineType'] = 'DSS'
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.split", "recipes/*.sampling"]

class JavaPropertiesFile(object):
    def __init__(self, path):
        self.props = {}
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                m = re.search('^([^=#]+)=([^#]*)(#.*)?$', line)
                if m is not None:
                    self.props[m.group(1).strip()] = m.group(2).strip()

    def get(self, key, default=None):
        return self.props.get(key, default)

    def get_as_bool(self, key, default=None):
        v = self.get(key, default)
        if v is not None and isinstance(v, bool):
            return v
        else:
            return string.lower(v) in ['true', 't', 'yes', 'y', 'oui', 'o']

class V15MoveKerberosSettings(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Move old Kerberos settings"

    def execute(self, diphome, simulate=False):
        settings_file = osp.join(diphome.path, "config/general-settings.json")
        if not osp.isfile(settings_file):
            return

        # read old properties
        props = JavaPropertiesFile(osp.join(diphome.path, "config", "dip.properties"))

        # put the relevant ones in the general-settings.json
        settings = base.json_loadf(settings_file)

        hadoop_settings = settings.get('hadoopSettings', {})
        settings['hadoopSettings'] = hadoop_settings

        hadoop_settings['kerberosLoginEnabled'] = props.get_as_bool('hadoop.security.kerberos', False)
        hadoop_settings['dssPrincipal'] = props.get('hadoop.kerberos.principal', None)
        hadoop_settings['dssKeytabPath'] = props.get('hadoop.kerberos.keytab', None)

        base.json_dumpf(settings_file, settings)

def is_blank(obj, field):
    return field in obj and obj[field] is not None and len(obj[field]) > 0

class V15ConnectionNamingRule(migration_json.JsonMigrationOperation):
    def transform(self, obj, filepath):

        for conn in obj.get("connections", []):
            cp = conn.get("params", {})
            ct = conn.get("type", "????")

            # Special case for Teradata: split of default database and default schema for managed datasets
            if ct == "Teradata":
                if not is_blank(cp, "defaultSchemaForManagedDatasets"):
                    cp["defaultDatabase"] = cp["defaultSchemaForManagedDatasets"]

            if ct in ['PostgreSQL', 'MySQL', 'Vertica', 'Redshift', 'Greenplum', 'Teradata', 'Oracle', 'SQLServer',
                      'BigQuery', 'JDBC', 'Netezza', 'SAPHANA']:

                cp["namingRule"] = {}
                if not is_blank(cp, "defaultSchemaForManagedDatasets"):
                    cp["namingRule"]["schemaName"] = cp["defaultSchemaForManagedDatasets"]

            if ct == "HDFS":
                if not is_blank(cp, "database"):
                    cp["defaultDatabase"] = cp["database"]
                cp["namingRule"] = {
                    "hdfsPathDatasetNamePrefix" : "${projectKey}/"
                }
                if not is_blank(cp, "database"):
                    cp["namingRule"]["hiveDatabaseName"] = cp["database"]

        return obj


    def file_patterns(self,):
        return ["config/connections.json"]

    def jsonpath(self,):
        return ""


def migrate_project_level_permissions(from_perms):
    to_perms = {}

    for fp in from_perms:
        if fp == "READ_DATA" or fp == "READ_METADATA" or fp == "READ_SCHEMA":
            to_perms["readProjectContent"] = True
        elif fp == "WRITE_DATA" or fp == "WRITE_METADATA" or fp == "WRITE_SCHEMA":
            to_perms["writeProjectContent"] = True
        elif fp == "ADMIN":
            to_perms["admin"] = True
    return to_perms

class V15ProjectAPIKeys(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update project-specific API keys"

    def transform(self, obj, filepath=None):
        if obj is None:
            return None
        for key in obj:
            if "EXEC_SQLIKE" in key.get("projectPrivileges", []):
                key["execSQLLike"] = True
            key["projectPrivileges"] = migrate_project_level_permissions(key.get("projectPrivileges", []))
            key["id"] = base.generate_random_id(16)

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["apikeys.json"]

class V15ProjectAccessLevels(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update project access levels"

    def transform(self, obj, filepath=None):
        for perm in obj.get("permissions", []):
            pt = perm.get("type", "????")

            if pt == "ADMIN":
                perm["admin"] = True
            elif pt == "ANALYST_READWRITE":
                perm["writeProjectContent"] = True
            elif pt == "ANALYST_READONLY":
                perm["readProjectContent"] = True
            elif pt == "READER":
                perm["writeDashboards"] = True

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["params.json"]


class V15GlobalAPIKeys(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Update global API keys"

    def transform(self, obj, filepath):
        for key in obj:
            new_projects = {}
            for (project_key, perm) in key.get("projects", {}).items():
                new_projects[project_key] = migrate_project_level_permissions(perm)
                if "EXEC_SQLIKE" in perm:
                    obj["execSQLLike"] = True
            key["projects"] = new_projects
            key["id"] = base.generate_random_id(16)
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/public-apikeys.json"]


class V15SplitRecipesOutput(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Change split recipes outputs representation"

    def transform(self, obj, filepath):
        filterSplits = obj.get("filterSplits", None)
        valueSplits = obj.get("valueSplits", None)
        defaultOutputDataset = obj.get("defaultOutputDataset", None)

        recipe_filepath = filepath[0:-5] + "json"

        if not osp.exists(recipe_filepath):
            # Recipe does not actually exist, we must be on instance owned by @Mattsco, so do nothing, it's his problem :)
            return obj

        recipe_data = base.json_loadf(recipe_filepath)
        if ("main" in recipe_data["outputs"]) and ("items" in recipe_data["outputs"]["main"]):
            output_names = [output["ref"] for output in recipe_data["outputs"]["main"]["items"]]
        else:
            return obj #give up too

        if filterSplits is not None:
            for v in filterSplits:
                if v.get("outputIndex", None) is None:
                    v["outputIndex"] = -1
                    if v.get("outputDataset", None) is not None and v["outputDataset"] in output_names:
                        v["outputIndex"] = output_names.index(v["outputDataset"])
                        del v["outputDataset"]
                    else:
                        print("WARNING: recipe file is broken: outputs are inconsistent. File: " + filepath)

        if valueSplits is not None:
            for v in valueSplits:
                if v.get("outputIndex", None) is None:
                    v["outputIndex"] = -1
                    if v.get("outputDataset", None) is not None and v["outputDataset"] in output_names:
                        v["outputIndex"] = output_names.index(v["outputDataset"])
                        del v["outputDataset"]
                    else:
                        print("WARNING: recipe file is broken: outputs are inconsistent. File: " + filepath)

        if defaultOutputDataset is not None:
            obj["defaultOutputIndex"] = -1
            if defaultOutputDataset in output_names:
                obj["defaultOutputIndex"] = output_names.index(defaultOutputDataset)
                del obj["defaultOutputDataset"]

        else:
            print("WARNING: recipe file is broken:" + filepath)

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.split"]


class V15AddInstallId(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Add mandatory installation id to install.ini configuration file"

    def execute(self, diphome, simulate=False):
        installConfig = diphome.get_install_config()
        if not installConfig.getOption('general', 'installid'):
            installConfig.addOption('general', 'installid', base.generate_random_id(24))
            if simulate:
                return
            installConfig.save()


class V15HiveDefaultDatabase(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Change defaultDatabase parameter name in connections"

    def transform(self, obj, filepath=None):
        for (conn_name, conn_data) in obj.get("connections", {}).items():
            print("Conndata: %s" % conn_data)
            if conn_data.get("type", "??") == "HDFS":
                print("It is HDFS")
                cp = conn_data.get("params", {})
                if "database" in cp:
                    print("DB is %s" % cp["database"])
                    cp["defaultDatabase"] = cp["database"]
                    del cp["database"]
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/connections.json"]

class V15HiveOverrideDatabase(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Set previous value for Hive override DB setting"

    def transform(self, obj, filepath=None):
        hs = obj.get("hiveSettings", {})
        if not "overrideDatabaseInLocalMetastore" in hs:
            hs["overrideDatabaseInLocalMetastore"] = True
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]

class V15HiveJobCompressionCommands(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Activate adding compression commands to Hive jobs"

    def transform(self, obj, filepath=None):
        hs = obj.get("hiveSettings", {})
        if not "addCompressionCommands" in hs:
            hs["addCompressionCommands"] = True
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]


class V15HiveExecutionConfig(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Add a default Hive execution config"

    def transform(self, obj, filepath=None):
        hs = obj.get("hiveSettings", {})
        if len(hs.get("executionConfigs",[])) == 0:
            hs["executionConfigs"] = [{ "name" : "default" }]
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]


class V15RenameJupyterNotebooks(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Rename Jupyter notebooks"

    def execute(self, project_paths):
        print("Renaming Jupyter notebooks from %s" % project_paths.jupyter_notebooks)
        if osp.isdir(project_paths.jupyter_notebooks):
            for notebook in os.listdir(project_paths.jupyter_notebooks):
                if not notebook.endswith(".ipynb"):
                    continue
                new_name = rename_jupyter_notebook(notebook)
                print("Renaming Jupyter notebook: %s -> %s" % (notebook, new_name))
                if new_name != notebook:
                    shutil.move(osp.join(project_paths.jupyter_notebooks, notebook), \
                                osp.join(project_paths.jupyter_notebooks,new_name))


class V15MoveDatabases(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Move internal databases"

    def execute(self, diphome):
        db_folder = osp.join(diphome.path, "databases")
        if not osp.isdir(db_folder):
            os.makedirs(db_folder)

        j = osp.join(diphome.path, "jobs_database.h2.h2.db")
        if osp.isfile(j):
            shutil.move(j, osp.join(db_folder, "jobs.h2.db"))
        fs = osp.join(diphome.path, "flow_state.h2.db")
        if osp.isfile(fs):
            shutil.move(fs, osp.join(db_folder, "flow_state.h2.db"))
        s = osp.join(diphome.path, "statsdb.h2.db")
        if osp.isfile(s):
            shutil.move(s, osp.join(db_folder, "dss_usage.h2.db"))


class V15DKUCommand(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Final operations (migrate timelines)"

    def execute(self, diphome):
        pass

    def post_execute(self, diphome):
        tmp_folder = osp.join(diphome.path, "tmp")
        if not osp.isdir(tmp_folder):
            os.makedirs(tmp_folder)

        clean_h2_timestamps(diphome)

        import subprocess
        dkupath = os.getenv("DKUBIN", diphome.path + "/bin/dku")
        subprocess.check_call('"%s" __migrate_v15' % dkupath, shell=True)


class V15FixScoringRecipes(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self):
        return "Rewire scoring recipe inputs"

    def extract_datasets(self, project_paths):
        if osp.isdir(osp.join(project_paths.config, "datasets")):
            paths = os.listdir(osp.join(project_paths.config, "datasets"))
            return {n for (n, ext) in [os.path.splitext(p) for p in paths] if ext == ".json"}
        else:
            return {}

    def extract_recipe_parameter_paths(self, project_paths):
        recipe_folder = osp.join(project_paths.config, "recipes")
        if osp.isdir(recipe_folder):
            return [osp.join(recipe_folder, n + ext) for (n, ext) in [os.path.splitext(p) for p in os.listdir(recipe_folder)] if ext == ".json"]
        else:
            return []

    def execute(self, project_paths):
        types = {"prediction_scoring", "clustering_scoring"}
        datasets = self.extract_datasets(project_paths)
        for path in self.extract_recipe_parameter_paths(project_paths):
            par = base.json_loadf(path)
            if par["type"] in types:
                dataset_items = []
                model_item = None
                for role, items in par["inputs"].items():
                    for item in items["items"]:
                        chunks = item["ref"].split(".")
                        if len(chunks) == 1:
                            local_name = chunks[0]
                        else:
                            local_name = chunks[1]
                        might_be_a_model = len(local_name) == 8

                        if not local_name in datasets and might_be_a_model:
                            # has to be the model
                            model_item = item
                        else:
                            dataset_items.append(item)

                inputs = {
                    "main": {"items" : [dataset_items[0]]},
                    "model": {"items": [model_item]}
                }

                if model_item is None:
                    inputs["model"]["items"] = []

                if len(dataset_items) > 1:
                    inputs["scriptDeps"] = {"items" : dataset_items[1:]}
                par["inputs"] = inputs
                base.json_dumpf(path, par)


###############################################################################
# V16 / DSS 4.0.5
###############################################################################

class V16DKUCommand(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Switch timestamps to longs in databases"

    def execute(self, diphome):
        pass

    def post_execute(self, diphome):
        tmp_folder = osp.join(diphome.path, "tmp")
        if not osp.isdir(tmp_folder):
            os.makedirs(tmp_folder)

        clean_h2_timestamps(diphome)

        import subprocess

        dkupath = os.getenv("DKUBIN", diphome.path + "/bin/dku")
        subprocess.check_call('"%s" __migrate_v16' % dkupath, shell=True)

class V16UpdateWeeklyTriggers(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update time-based trigger with weekly frequency"

    def transform(self, trigger, filepath):
        if trigger.get('type', None) == 'temporal':
            params = trigger.get('params', {})
            if params.get('frequency', None) == 'Weekly':
                print("Handling trigger %s" % trigger.get('name', ''))
                # move the dayOfWeek to the list of daysOfWeek
                days_of_week = []
                day_of_week = params.get('dayOfWeek', '')
                if day_of_week != '':
                    days_of_week.append(day_of_week)
                params['daysOfWeek'] = days_of_week
        return trigger

    def jsonpath(self,):
        return "triggers"

    def file_patterns(self,):
        return ["scenarios/*.json"]



###############################################################################
# V17 / DSS 4.1
###############################################################################


class V17UpdateMailAttachment(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Update parametrization of attachments on scenario mail reporters"

    def transform(self, obj, filepath):
        def handle_messaging(messaging):
            if messaging.get('type', None) == 'mail-scenario':
                configuration = messaging.get('configuration', {})
                has_dataset_html_var = 'datasetHtml' in configuration.get('message', '')
                attachments = [];
                if configuration.get('attachLog', False):
                    attachments.append({'type':'LOG'})
                if len(configuration.get('attachedDataset', '')) > 0:
                    export_params = {}
                    current_format = configuration.get('format', None)
                    if current_format == 'TSV':
                        export_params = {
                            "destinationType": "DOWNLOAD",
                            "selection": {
                                "samplingMethod": "FULL",
                                "partitionSelectionMethod": "ALL",
                                "selectedPartitions": []
                            },
                            "advancedMode": False,
                            "originatingOptionId": "tsv-excel-header-gz",
                            "format": {
                                "type": "csv",
                                "params": {
                                    "style": "excel",
                                    "charset": "utf8",
                                    "separator": ",",
                                    "quoteChar": "\"",
                                    "escapeChar": "\\",
                                    "dateSerializationFormat": "ISO",
                                    "arrayMapFormat": "json",
                                    "skipRowsBeforeHeader": 0,
                                    "parseHeaderRow": True,
                                    "skipRowsAfterHeader": 0,
                                    "normalizeBooleans": False,
                                    "normalizeDoubles": True,
                                    "compress": "gz"
                                }
                            },
                            "destinationDatasetConnection": "filesystem_managed"
                        }
                    elif current_format == 'EXCEL':
                        export_params = {
                            "destinationType": "DOWNLOAD",
                            "selection": {
                                "samplingMethod": "FULL",
                                "partitionSelectionMethod": "ALL",
                                "selectedPartitions": []
                            },
                            "advancedMode": False,
                            "originatingOptionId": "excel",
                            "format": {
                                "type": "excel",
                                "params": {
                                    "xlsx": True,
                                    "preserveNumberFormatting": False,
                                    "parseDatesToISO": False,
                                    "skipRowsBeforeHeader": 0,
                                    "parseHeaderRow": False,
                                    "skipRowsAfterHeader": 0
                                }
                            },
                            "destinationDatasetConnection": "filesystem_managed"
                        }
                    attachment_params = {'attachedDataset':configuration.get('attachedDataset'), 'addAsHtmlVariable':False, 'exportParams':export_params}
                    attachments.append({'type':'DATASET', 'params':attachment_params})
                    if has_dataset_html_var:
                        # add a second time, for the variable
                        attachment_params = {'attachedDataset':configuration.get('attachedDataset'), 'addAsHtmlVariable':True, 'exportParams':export_params}
                        attachments.append({'type':'DATASET', 'params':attachment_params})
                configuration['attachments'] = attachments

        def handle_step(step):
            if step.get("type", "") == 'send_report':
                handle_messaging(step.get('params', {}).get('messaging', {}))

        def handle_reporter(reporter):
            handle_messaging(reporter.get('messaging', {}))

        for reporter in obj.get("reporters", []):
            handle_reporter(reporter)
        for step in obj.get("params", {}).get("steps", []):
            handle_step(step)

        return obj

    def file_patterns(self,):
        return ["scenarios/*.json"]


class V17DKUCommand(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Set partition information on folder metrics and checks"

    def execute(self, diphome):
        pass

    def post_execute(self, diphome):
        tmp_folder = osp.join(diphome.path, "tmp")
        if not osp.isdir(tmp_folder):
            os.makedirs(tmp_folder)

        import subprocess

        dkupath = os.getenv("DKUBIN", diphome.path + "/bin/dku")
        subprocess.check_call(dkupath + " __migrate_v17", shell=True)


def v17_find_and_replace_compute_dims(obj):
    if type(obj) is dict:
        for key, value in obj.items():
            if key == 'computeModeDim':
                obj[key] = (obj[key]+1) % 2 # 0 becomes 1, 1 becomes 0
            else:
                v17_find_and_replace_compute_dims(value)

    elif type(obj) is list:
        for value in obj:
            v17_find_and_replace_compute_dims(value)

def v17_add_empty_bins_mode(obj):
    if type(obj) is dict:
        if "def" in obj:
            obj_def = obj["def"]
            if "genericDimension0" in obj_def:
                dimensions = obj_def["genericDimension0"]
                for dim in dimensions:
                    dim["numParams"] = dim.get("numParams", {})
                    dim["numParams"]["emptyBinsMode"] = dim["numParams"].get("emptyBinsMode", "ZEROS")
            if "genericDimension1" in obj_def:
                dimensions = obj_def["genericDimension1"]
                for dim in dimensions:
                    dim["numParams"] = dim.get("numParams", {})
                    dim["numParams"]["emptyBinsMode"] = dim["numParams"].get("emptyBinsMode", "ZEROS")
    elif type(obj) is list:
        for value in obj:
            v17_add_empty_bins_mode(value)


def v17_migrate_chart(chart):
    v17_find_and_replace_compute_dims(chart)
    v17_add_empty_bins_mode(chart)
    return chart


class V17ChartsInExplore(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Migrate charts in explore"

    def transform(self, obj, filepath):
        return v17_migrate_chart(obj)

    def jsonpath(self,):
        return "charts"

    def file_patterns(self,):
        return ["explore/*.json"]


class V17ChartsInAnalysis(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self, ):
        return "Migrate charts in analysis"

    def transform(self, obj, filepath):
        return v17_migrate_chart(obj)

    def jsonpath(self, ):
        return "charts"

    def file_patterns(self, ):
        return ["analysis/*/core_params.json"]


class V17ChartsInAnalysisModels(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self, ):
        return "Migrate charts in analysis predicted data"

    def transform(self, obj, filepath):
        return v17_migrate_chart(obj)

    def jsonpath(self, ):
        return "predictionDisplayCharts"

    def file_patterns(self, ):
        return ["analysis/*/ml/*/params.json"]

class V17ChartsInInsights(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self, ):
        return "Migration charts in insights data"

    def transform(self, obj, filepath):
        if obj.get("type", "") == "chart":
            obj["params"] = v17_migrate_chart(obj["params"])
        return obj

    def jsonpath(self, ):
        return ""

    def file_patterns(self, ):
        return ["insights/*.json"]

class V17AddManagedFoldersConnection(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Add connection to the managed_folders in $DIP_HOME"

    def transform(self, connections, filepath=None):
        connections['filesystem_folders'] = {
                                              "params": {
                                                "root": "${dip.home}/managed_folders"
                                              },
                                              "allowManagedDatasets":False,
                                              "type": "Filesystem"
                                            }
        return connections

    def jsonpath(self,):
        return "connections"

    def file_patterns(self,):
        return ["config/connections.json"]


class V17FoldersOnProviders(migration_json.ProjectConfigJsonMigrationOperation):
    def __init__(self):
        self.connections_used = {}

    def __repr__(self,):
        return "Update folders to handle several FS backends"

    def transform(self, folder, filepath=None):
        folder['type'] = 'Filesystem'
        old_path = folder.get('path', '/path/not/found') # an empty 'path' fields means the folder was non functional => it's ok to put the a dummy path
        expected_starts = ['${env:DIP_HOME}/managed_folders/', '${dip.home}/managed_folders/']
        replaced = False
        for es in expected_starts:
            if old_path.startswith(es):
                folder['params'] = {'connection' : 'filesystem_folders', 'path' : old_path[len(es):]}
                replaced = True
                break
        if not replaced:
            folder['params'] = {'connection' : 'filesystem_root', 'path' : old_path}

        self.connections_used[folder['params']['connection']] = 'Filesystem'
        return folder

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["managed_folders/*.json"]

    def get_manifest_additions(self, additions, project_paths):
        if self.connections_used is None or len(self.connections_used) == 0:
            return # no folder was changed
        required_connections = additions.get('requiredConnections', {})
        for connection_name, connection_type in iteritems(self.connections_used):
            if connection_name in required_connections:
                required_connection = required_connections[connection_name]
                if connection_type != required_connection.get('type', None):
                    print('Additional required connection %s with different type (%s instead of %s)' % (connection_name, required_connection['type'], connection_type))
            else:
                required_connections[connection_name] = {'name':connection_name, 'type':connection_type}
        additions['requiredConnections'] = required_connections

class V17UpdatePluginSettings(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Update the plugin settings files"

    def transform(self, obj, filepath=None):
        return {'config': obj}

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/plugins/*/settings.json"]

class V17WebApps(migration_json.ProjectConfigJsonMigrationOperation):

    def __repr__(self,):
        return "Transform webapps to 4.1 format"

    def transform(self, obj, filepath):
        if obj.get("type") is None:
            params = {
                "html": obj.get("html", None),
                "css": obj.get("css", None),
                "js": obj.get("js", None),
                "python": obj.get("pyBackendCode", None),

                "backendEnabled": obj.get("pyBackendEnabled", False),
                "autoStartBackend": obj.get("autoStartPyBackend", False),

                "libraries": obj.get("libraries", None)
            }
            obj["hasLegacyBackendURL"] = obj.get("pyBackendEnabled", False)

            obj['type'] = 'STANDARD'
            obj['params'] = params

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["web_apps/*.json"]


class V17WebAppsSnippets(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Move web apps code snippets"

    def execute(self, diphome, simulate=False):
        if not simulate:
            try:
                old = osp.join(diphome.path, "config", "code-snippets", "webapp")
                new = osp.join(diphome.path, "config", "code-snippets", "webapp_standard")
                os.rename(old, new)
            except Exception as e:
                logging.exception("Failed to move code snippets for webapps: %s", e)



class V17WebAppsInsights(migration_json.ProjectConfigJsonMigrationOperation):

    def __repr__(self,):
        return "Transform webapps insights to 4.1 format"

    def transform(self, obj, filepath):
        if obj.get("type", "???") == "web_app":
            obj.get("params", {})["webAppType"] = "STANDARD"
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["insights/*.json"]

class V17SplitUnfoldProcessor(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        super(V17SplitUnfoldProcessor, self).__init__("SplitUnfold")

    def transform_step(self, step):
        assert step["type"] == "SplitUnfold"
        params = step.get('params', None)
        if params is not None:
            params["limit"] = 0
            params["overflowAction"] = "KEEP"
        return step


class V17UnfoldProcessor(migration_app.ShakerStepMigrationOperation):
    def __init__(self):
        super(V17UnfoldProcessor, self).__init__("Unfold")

    def transform_step(self, step):
        assert step["type"] == "Unfold"
        params = step.get('params', None)
        if params is not None:
            prefix = params.pop("prefix", False)
            column = params.get('column', None)
            if prefix and column:
                params['prefix'] = column + "_"
            params["limit"] = 0
            params["overflowAction"] = "KEEP"
        return step

# instance migration, able to keep the files from the datasets
class V17ChangeRemoteFilesDataset(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Change remote files datasets into download recipes (instance level)"

    def execute(self, diphome):
        config_folder = osp.join(diphome.path, "config")
        projects_folder = osp.join(config_folder, "projects")
        if not osp.isdir(projects_folder):
            return

        for project_key in os.listdir(projects_folder):
            if not osp.isfile(osp.join(projects_folder, project_key, "params.json")):
                continue

            logging.info("Applying migration of RemoteFiles datasets on project %s" % project_key)
            self.convert_project(config_folder, projects_folder, project_key, diphome.path)

    def convert_project(self, config_folder, projects_folder, project_key, dip_home):
        project_folder = osp.join(projects_folder, project_key)
        datasets_folder = osp.join(project_folder, "datasets")
        if osp.isdir(datasets_folder):
            for dataset_file_name in os.listdir(datasets_folder):
                dataset_file = osp.join(datasets_folder, dataset_file_name)
                with open(dataset_file, 'r') as f:
                    dataset = json.load(f)
                    if dataset.get('type', None) == 'RemoteFiles':
                        print("Migrating %s" % dataset_file)
                        self.convert_dataset(dataset, dataset_file, project_folder, project_key, config_folder, dip_home)

    def convert_dataset(self, dataset, dataset_file, project_folder, project_key, config_folder, dip_home):
        folders_folder = osp.join(project_folder, "managed_folders")
        if not osp.exists(folders_folder):
            os.mkdir(folders_folder) # ensure existence
        recipes_folder = osp.join(project_folder, "recipes")
        if not osp.exists(recipes_folder):
            os.mkdir(recipes_folder) # ensure existence

        dataset_file_name = osp.basename(dataset_file)
        dataset_name = dataset.get('name', dataset_file_name[:-5]) # to remove the .json extension

        # find the connection used by the dataset to store files
        connections_file = osp.join(config_folder, 'connections.json')
        if osp.exists(connections_file):
             with open(connections_file, 'r') as f:
                connections = json.load(f).get('connections', {})
        else:
            connections = {}

        storage_connection = dataset.get('params', {}).get('connection', 'filesystem_managed')
        storage_connection_type = connections.get(storage_connection, {}).get('type', None)
        storage_connection_root = connections.get(storage_connection, {}).get('params', {}).get('root', '')

        folder_id = 'v17conversion_%s' % dataset_name

        # if data was cached on filesystem, move it to the managed_folders connection
        storage_path = dataset.get('params', {}).get('tmpPath', '%s.%s' % (project_key, dataset_name))
        if storage_connection_type == 'Filesystem':
            clean_storage_path = storage_path[1:] if storage_path.startswith('/') else storage_path
            src_path = osp.join(storage_connection_root, clean_storage_path)
            new_storage_path = '%s.%s' % (project_key, folder_id)
            dst_path = osp.join(dip_home, 'managed_folders', new_storage_path)
            if osp.exists(src_path):
                shutil.move(src_path, dst_path)
                storage_path = new_storage_path
                storage_connection = 'filesystem_folders'

        # create a managed folder to hold the files
        folder = {
                    'type' : storage_connection_type,
                    'name' : '%s_storage' % dataset_name,
                    'params' : {
                        'connection' : storage_connection,
                        'path' : storage_path
                    },
                    'partitioning' : dataset.get('partitioning', {'filePathPattern':'', 'dimensions':[]}),
                    'selection' : {'partitionSelectionMethod':'ALL'},
                    'metrics' : {},
                    'checks' : {},
                    'flowOptions' : {}
                }
        folder_file = osp.join(folders_folder, folder_id + '.json')
        folder_json = json.dumps(folder, indent=2, sort_keys=True)
        with open(folder_file, 'w') as f:
            f.write(folder_json)

        # create a recipe to replace the sync logic
        recipe = {
                    'type' : 'download',
                    'params' : {
                        'deleteExtraFiles' : True,
                        'copyEvenUpToDateFiles' : False,
                        'sources' : [self.convert_source(source, connections) for source in dataset.get('remoteFiles', {}).get('sources', [])]
                    },
                    'neverRecomputeExistingPartitions' : False,
                    'optionalDependencies' : False,
                    'redispatchPartitioning' : False,
                    'doc' : 'Automatically converted from the RemoteFiles dataset %s' % dataset_name,
                    'overrideTable' : {},
                    'customMeta' : {},
                    'inputs' : {},
                    'outputs' : {'main':{'items':[{'ref':folder_id, 'appendMode':False}]}}
                }
        recipe_name = 'download_v17conversion_%s' % dataset_name
        recipe_file = osp.join(recipes_folder, recipe_name + '.json')
        recipe_json = json.dumps(recipe, indent=2, sort_keys=True)
        with open(recipe_file, 'w') as f:
            f.write(recipe_json)

        # change the old dataset to become a FilesInFolder one
        dataset['type'] = 'FilesInFolder'
        dataset['remoteFiles'] = {}
        dataset['params'] = {
                                'folderSmartId' : folder_id,
                                'itemPathPattern' : '.*',
                                'previewPartition': ''
                            }
        dataset_json = json.dumps(dataset, indent=2, sort_keys=True)
        with open(dataset_file, 'w') as f:
            f.write(dataset_json)

    def convert_source(self, source, connections):
        converted = {'useGlobalProxy' : source.get('useGlobalProxy', False)}
        if not source.get('useConnection', False):
            converted['providerType'] = 'URL'
            converted['params'] = {'path':source.get('url', ''), 'timeout':10000}
        else:
            connection_name = source.get('connection', '')
            print('get connection %s' %  connection_name)
            connection = connections.get(connection_name, {})
            connection_type = connection.get('type', '')
            if connection_type == 'SSH':
                converted['providerType'] = source.get('protocol', 'SCP')
            else:
                converted['providerType'] = connection_type
            converted['params'] = {'connection':connection_name, 'path':source.get('path', ''), 'timeout':10000}

        return converted

# project migration, will do best effort to keep files, and leave the code to guess the providerType based on connection name
class V17ChangeRemoteFilesDatasetInProject(migration_base.ProjectLocalMigrationOperation):
    def __init__(self):
        self.connections_used = {}

    def __repr__(self,):
        return "Change remote files datasets into download recipes (project-level)"

    def execute(self, project_paths):
        project_folder = project_paths.config
        datasets_folder = osp.join(project_folder, "datasets")
        if osp.isdir(datasets_folder):
            for dataset_file_name in os.listdir(datasets_folder):
                dataset_file = osp.join(datasets_folder, dataset_file_name)
                with open(dataset_file, 'r') as f:
                    dataset = json.load(f)
                    if dataset.get('type', None) == 'RemoteFiles':
                        print("Migrating %s" % dataset_file)
                        self.convert_dataset(dataset, dataset_file, project_folder)

    def convert_dataset(self, dataset, dataset_file, project_folder):
        folders_folder = osp.join(project_folder, "managed_folders")
        if not osp.exists(folders_folder):
            os.mkdir(folders_folder) # ensure existence
        recipes_folder = osp.join(project_folder, "recipes")
        if not osp.exists(recipes_folder):
            os.mkdir(recipes_folder) # ensure existence

        dataset_file_name = osp.basename(dataset_file)
        dataset_name = dataset.get('name', dataset_file_name[:-5]) # to remove the .json extension

        storage_connection = dataset.get('params', {}).get('connection', 'filesystem_managed')
        storage_path = dataset.get('params', {}).get('tmpPath', '${projectKey}.%s' % (dataset_name))

        folder_id = 'v17conversion_%s' % dataset_name

        # create a managed folder to hold the files
        folder = {
                    'type' : ('HDFS' if 'hdfs' in storage_connection.lower() else 'Filesystem'), # might not be filesystem, but null is not an option
                    'name' : '%s_storage' % dataset_name,
                    'params' : {
                        'connection' : storage_connection,
                        'path' : storage_path
                    },
                    'partitioning' : dataset.get('partitioning', {'filePathPattern':'', 'dimensions':[]}),
                    'selection' : {'partitionSelectionMethod':'ALL'},
                    'metrics' : {},
                    'checks' : {},
                    'flowOptions' : {}
                }
        folder_file = osp.join(folders_folder, folder_id + '.json')
        folder_json = json.dumps(folder, indent=2, sort_keys=True)
        with open(folder_file, 'w') as f:
            f.write(folder_json)

        # create a recipe to replace the sync logic
        recipe = {
                    'type' : 'download',
                    'params' : {
                        'deleteExtraFiles' : True,
                        'copyEvenUpToDateFiles' : False,
                        'sources' : [self.convert_source(source) for source in dataset.get('remoteFiles', {}).get('sources', [])]
                    },
                    'neverRecomputeExistingPartitions' : False,
                    'optionalDependencies' : False,
                    'redispatchPartitioning' : False,
                    'doc' : 'Automatically converted from the RemoteFiles dataset %s' % dataset_name,
                    'overrideTable' : {},
                    'customMeta' : {},
                    'inputs' : {},
                    'outputs' : {'main':{'items':[{'ref':folder_id, 'appendMode':False}]}}
                }
        recipe_name = 'download_v17conversion_%s' % dataset_name
        recipe_file = osp.join(recipes_folder, recipe_name + '.json')
        recipe_json = json.dumps(recipe, indent=2, sort_keys=True)
        with open(recipe_file, 'w') as f:
            f.write(recipe_json)

        # change the old dataset to become a FilesInFolder one
        dataset['type'] = 'FilesInFolder'
        dataset['remoteFiles'] = {}
        dataset['params'] = {
                                'folderSmartId' : folder_id,
                                'itemPathPattern' : '.*',
                                'previewPartition': ''
                            }
        dataset_json = json.dumps(dataset, indent=2, sort_keys=True)
        with open(dataset_file, 'w') as f:
            f.write(dataset_json)

    def convert_source(self, source):
        converted = {'useGlobalProxy' : source.get('useGlobalProxy', False)}
        if not source.get('useConnection', False):
            converted['providerType'] = 'URL'
            converted['params'] = {'path':source.get('url', ''), 'timeout':10000}
        else:
            protocol = source.get('protocol', None)
            connection_name = source.get('connection', '')
            connection_type = "SSH" if protocol is not None and len(protocol) > 0 else "FTP"
            converted['providerType'] = protocol if protocol is not None and len(protocol) > 0 else "FTP"
            converted['params'] = {'connection':connection_name, 'path':source.get('path', ''), 'timeout':10000}
            if connection_name is not None and len(connection_name) > 0:
                self.connections_used[connection_name] = connection_type

        return converted

    def get_manifest_additions(self, additions, project_paths):
        if self.connections_used is None or len(self.connections_used) == 0:
            return # no dataset was changed
        required_connections = additions.get('requiredConnections', {})
        for connection_name, connection_type in iteritems(self.connections_used):
            if connection_name in required_connections:
                required_connection = required_connections[connection_name]
                if connection_type != required_connection.get('type', None):
                    print('Additional required connection %s with different type (%s instead of %s)' % (connection_name, required_connection['type'], connection_type))
            else:
                required_connections[connection_name] = {'name':connection_name, 'type':connection_type}
        additions['requiredConnections'] = required_connections

v17_grid_names = [
        "mllib_logit",
        "mllib_naive_bayes",
        "mllib_linreg",
        "mllib_rf",
        "mllib_gbt",
        "mllib_dt"
    ]

v17_to_gridify = {
        "mllib_logit" : ["reg_param", "enet_param"],
        "mllib_naive_bayes" : ["lambda"],
        "mllib_linreg": ["reg_param", "enet_param"],
        "mllib_rf": ["max_depth", "step_size", "num_trees"],
        "mllib_gbt": ["max_depth", "step_size", "num_trees"],
        "mllib_dt": ["max_depth"]
    }


def v17_make_grids(obj):
    mllib_grid = {}
    if "custom_mllib" in obj:
        mllib_grid["custom_mllib"] = obj["custom_mllib"]
    for grid_name in v17_grid_names:
        grid = {}
        mllib_grid[grid_name] = grid
        for key in obj:
            if key.startswith(grid_name):
                new_name = key.split(grid_name + "_")[1]
                grid[new_name] = obj[key]
    obj["mllib_grids"] = mllib_grid
    return obj

def v17_gridify(obj):
    grids = obj.get("mllib_grids", {})
    for grid_name in v17_to_gridify:
        if grid_name in grids:
            grid = grids[grid_name]
            for par in v17_to_gridify[grid_name]:
                if par in grid:
                    if not isinstance(grid[par], list):
                        grid[par] = [grid[par]]
    return obj

def v17_migrate_mltask(obj):
    modeling = obj.get("modeling", {})
    for grid_name in v17_to_gridify:
        if grid_name in modeling:
            grid = modeling[grid_name]
            for par in v17_to_gridify[grid_name]:
                if par in grid:
                    if not isinstance(grid[par], list):
                        grid[par] = [grid[par]]
    return obj

def v17_migrate_resolved(obj):
    if "ts_kmeans_k" in obj:  # don't do it for clustering
        return obj
    else:
        return v17_gridify(v17_make_grids(obj))

class V17MLLibUnresolvedGridsInSM(migration_json.ProjectConfigJsonMigrationOperation):
    def __init__(self):
        pass

    def __repr__(self,):
        return "Move SavedModel MLLib parameters to gridified versions"

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["saved_models/*.json"]

    def transform(self, obj, filepath):
        mltask = obj.get("miniTask", None)
        if mltask is not None and mltask.get("taskType", None) == "PREDICTION":
            obj["miniTask"] = v17_migrate_mltask(mltask)
        return obj

class V17MLLibUnresolvedGridsInAnalysis(migration_json.ProjectConfigJsonMigrationOperation):
    def __init__(self):
        pass

    def __repr__(self,):
        return "Move analysis MLLib parameters to gridified versions"

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["analysis/*/ml/*/params.json"]

    def transform(self, obj, filepath):
        if obj.get("taskType", None) == "PREDICTION":
            return v17_migrate_mltask(obj)
        else:
            return obj

class V17MLLibResolvedGrids(migration_base.ProjectLocalMigrationOperation):
    """
    Migrates ResolvedPredictionModelingParameters
    """
    def __init__(self):
        pass

    def __repr__(self,):
        return "Move resolved mllib parameters back into their gridified versions"

    def execute(self, project_paths):
        for mltask_file in glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data):
            print("Migrating saved ML Task session: %s " % (mltask_file))
            try:
                data = base.json_loadf(mltask_file)
                data = v17_migrate_mltask(data)
                base.json_dumpf(mltask_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)

        for rm_file in glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data):
            print("Migrating saved ML Task rmodeling file: %s" % rm_file)
            try:
                data = base.json_loadf(rm_file)
                data = v17_migrate_resolved(data)
                base.json_dumpf(rm_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)

        for ap_file in glob("%s/*/*/sessions/*/*/*/actual_params.json" % project_paths.analysis_data):
            print("Migrating saved ML Task actualparams file: %s" % ap_file)
            try:
                data = base.json_loadf(ap_file)
                data["resolved"] = v17_migrate_resolved(data.get("resolved", {}))
                base.json_dumpf(ap_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)

        # modelid/versions/vid/rmodeling_params.json
        for rm_file in glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models):
            print("Migrating saved ML Task rmodeling file: %s" % rm_file)
            try:
                data = base.json_loadf(rm_file)
                data = v17_migrate_resolved(data)
                base.json_dumpf(rm_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)

        # modelid/versions/vid/actual_params.json
        for ap_file in glob("%s/*/versions/*/actual_params.json" % project_paths.saved_models):
            print("Migrating saved ML Task rmodeling file: %s" % ap_file)
            try:
                data = base.json_loadf(ap_file)
                data["resolved"] = v17_migrate_resolved(data.get("resolved", {}))
                base.json_dumpf(ap_file, data)
            except Exception as e:
                print("Model migration FAILED: %s" % e)

class V17ComputedColumnsGroupingRecipe(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Grouping recipe: move the custom grouping key to a computed column"

    def transform(self, grouping, filepath=None):
        counter = 0
        grouping['computedColumns'] = grouping.get('computedColumns', [])
        for gkey in grouping['keys']:
            if gkey.get('column', None) is None:
                counter += 1
                new_name = gkey.get('customName', 'newComputedColumn' + str(counter))
                new_type = gkey.get('colType', 'DOUBLE').lower()
                grouping['computedColumns'].append({
                        "name": new_name,
                        "type": new_type,
                        "expr": gkey.get('customExpr', ''),
                        "mode": "SQL"
                    })
                gkey['last'] = gkey.get('last', False)
                gkey['max'] = gkey.get('max', False)
                gkey['column'] = new_name
                gkey['count'] = gkey.get('count', False)
                gkey['sum'] = gkey.get('sum', False)
                gkey['type'] = new_type
                gkey['sum2'] = gkey.get('sum2', False)
                gkey['min'] = gkey.get('min', False)
                gkey['countDistinct'] = gkey.get('countDistinct', False)
                gkey['avg'] = gkey.get('avg', False)
                gkey['stddev'] = gkey.get('stddev', False)
                gkey['first'] = gkey.get('first', False)
                gkey.pop('customName', None)
                gkey.pop('customExpr', None)
                gkey.pop('colType', None)

        return grouping

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.grouping"]

class V17ComputedColumnsJoinRecipe(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Join recipe: migrate the computed column to the new version"

    def transform(self, join, filepath=None):
        counter = 0
        join['computedColumns'] = join.get('computedColumns', [])
        for comp_col in join['computedColumns']:
            mode = comp_col.get('language', 'GREL')
            if mode == 'DSS':
                mode = 'GREL'
            comp_col['name'] = comp_col.get('name', '')
            comp_col['expr'] = comp_col.get('expression', '')
            comp_col['mode'] = mode
            comp_col['type'] = comp_col.get('type', 'double').lower()
            comp_col.pop('expression', None)
            comp_col.pop('language', None)

        return join

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.join"]

class V17GlobalAPIKeys(migration_json.JsonMigrationOperation):
    def __repr__(self, ):
        return "Update global API keys"

    def transform(self, obj, filepath):
        for key in obj:
            if key.get("globalAdmin", False):
                key["globalPermissions"] = {"admin": True}
        return obj

    def jsonpath(self, ):
        return ""

    def file_patterns(self, ):
        return ["config/public-apikeys.json"]

class V17Meanings(migration_json.JsonMigrationOperation):
    def __repr__(self, ):
        return "Update user-defined meanings"

    def transform(self, obj, filepath):
        if obj.get("type", None) == "VALUES_LIST":
            obj["entries"] = list(map(lambda v: {"value": v}, obj.get("values", [])))
            del obj["values"]
        elif obj.get("type", None) == "VALUES_MAPPING":
            obj["mappings"] = list(map(lambda m: {"from": m.get("from", None), "to": {"value": m.get("to", None)}}, obj.get("mappings", [])))

        return obj

    def jsonpath(self, ):
        return ""

    def file_patterns(self, ):
        return ["config/meanings/*.json"]

class V17ConvertVariablesToComputedColumnsSplitRecipe(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Convert Variables to Computed Columns in Split recipe"

    def transform(self, params, filepath=None):
        params["computedColumns"] = []
        variables = params.get("variables", [])
        for variable in variables:
            computed_column = {
                "name" : variable.get("name", ""),
                "expr" : variable.get("expression", ""),
                "type" : variable.get("type", "double").lower(),
                "mode" : "GREL"
            }
            params["computedColumns"].append(computed_column)
        params["writeComputedColumnsInOutput"] = params.get("writeVariablesInOutput", False)
        params.pop("writeVariablesInOutput", None)
        params.pop("variables", None)
        params.pop("enableVariables", None)
        return params

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.split"]

class V17ConvertFilesInFolderSelectionPattern(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Updates Files-in-Folder datasets' settings"

    def transform(self, obj, filepath=None):
        if "type" in obj and obj["type"] == "FilesInFolder":
            params = obj['params']
            params["filesSelectionRules"] = {"mode": "RULES_INCLUDED_ONLY", "excludeRules": [], "explicitFiles": [], "includeRules": []}
            if params.get("itemPathPattern", None) is not None:
                pattern = params.get("itemPathPattern", None)
                if len(pattern) > 0 and pattern[0] == '/':
                    pattern = pattern[1:]
                rule = { "matchingMode": "FULL_PATH", "mode": "REGEXP", "expr": "^/?%s$" % pattern}
                params["filesSelectionRules"]["includeRules"].append(rule)
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["datasets/*.json"]


class V17EngineCreationSettings(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Set new engine creation settings"

    def transform(self, obj, filepath=None):
        hive_settings = obj.get("hiveSettings", {})
        hive_settings["engineCreationSettings"] = {
            "executionEngine" : hive_settings.get("defaultRecipesExecutionEngine", "HIVECLI_LOCAL")
        }
        obj["hiveSettings"] = hive_settings

        impala_settings = obj.get("impalaSettings", {})
        impala_settings["engineCreationSettings"] = {
            "streamMode" : impala_settings.get("createRecipeInStreamMode", True)
        }
        obj["impalaSettings"] = impala_settings
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]

class V17MoveJupyterExports(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Move Jupyter notebook exports"

    def execute(self, diphome, simulate=False):
        if not simulate:
            old = osp.join(diphome.path, "jupyter_exports")
            exports = osp.join(diphome.path, "exports")
            new = osp.join(diphome.path, "exports", "jupyter-notebooks")

            if not osp.isdir(exports):
                os.makedirs(exports)

            if osp.isdir(old):
                os.rename(old, new)

class V17InitGraceDelays(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Init grace delays in scenario triggers"

    def transform(self, obj, filepath):
        for trigger in obj.get("triggers", []):
            delay = trigger.get('delay', 0)
            if isinstance(delay, dku_basestring_type):
                try:
                    delay = int(delay)
                except Exception as e:
                    delay = 0
            trigger["graceDelaySettings"] = {'checkAgainAfterGraceDelay':False, 'delay':int(max(1, delay) / 2)}
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["scenarios/*.json"]


###############################################################################
# V18 / DSS 4.2
###############################################################################

class V18MigrateDashboardImageResizeSetting(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Upgrade the y/n resize-to-fit setting of dashboard images to new multi-option setting "

    def transform(self, obj, filepath=None):
        if "pages" in obj:
            for page in obj['pages']:
                if "grid" in page:
                    if "tiles" in page["grid"]:
                        for tile in page["grid"]["tiles"]:
                            resizeMode = "FIT_SIZE"

                            if "resizeImage" in tile and tile["resizeImage"]==False:
                                resizeMode = "ORIG_SIZE"

                            tile.pop("resizeImage", None)

                            if not "resizeImageMode" in tile:
                                tile["resizeImageMode"] = resizeMode

        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["dashboards/*.json"]

class V18UpdateSQLDatasets(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Clean up the partitioning of SQL datasets"

    def transform(self, obj, filepath=None):
        all_sql_types = ['PostgreSQL', 'MySQL', 'Vertica', 'Redshift', 'Greenplum', 'Teradata', 'Oracle', 'SQLServer', 'BigQuery', 'JDBC', 'Netezza', 'SAPHANA']
        if obj.get("type", '') in all_sql_types:
            config = obj.get('params', {})
            obj['params'] = config
            if config.get('partitioned', False) and config.get('mode', '') == 'table':
                # make sure the partitioningColumn is in the partitioning scheme (until now it's the responsability of the frontend to fixup this)
                partitioning_column = config.get('partitioningColumn', None)
                if partitioning_column is not None and len(partitioning_column) > 0:
                    partitioning = obj.get('partitioning', {})
                    obj['partitioning'] = partitioning
                    dimensions = partitioning.get('dimensions', [])
                    partitioning['dimensions'] = dimensions
                    if len(dimensions) == 0:
                        dimensions.append({'name':partitioning_column, 'type':'value', 'params':{}})
                    else:
                        dimensions[0]['name'] = partitioning_column
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["datasets/*.json"]


class V18CleanupMLResolvedParams(migration_base.ProjectLocalMigrationOperation):
    """
    Migrates ResolvedPredictionModelingParameters in rmodeling_params and actual_params
    (in analysis_data and saved_models data)
    """
    def __init__(self):
        pass

    def __repr__(self,):
        return "Cleanup trained models parameters"

    def pretrain_unnest_mllib_grids(self, old_resolved):
        #print("Before unnest mllib: %s" % json.dumps(old_resolved, indent=2))
        """In pre-train, mllib grids were below a weird prefix"""
        mllib_grids = old_resolved.get("mllib_grids", {})

        if "mllib_logit" in mllib_grids:
            old_resolved["mllib_logit_grid"] = mllib_grids["mllib_logit"]
        if "mllib_naive_bayes" in mllib_grids:
            old_resolved["mllib_naive_bayes_grid"] = mllib_grids["mllib_naive_bayes"]
        if "mllib_linreg" in mllib_grids:
            old_resolved["mllib_linreg_grid"] = mllib_grids["mllib_linreg"]
        if "mllib_rf" in mllib_grids:
            old_resolved["mllib_rf_grid"] = mllib_grids["mllib_rf"]
        if "mllib_gbt" in mllib_grids:
            old_resolved["mllib_gbt_grid"] = mllib_grids["mllib_gbt"]
        if "mllib_dt" in mllib_grids:
            old_resolved["mllib_dt_grid"] = mllib_grids["mllib_dt"]

        if "custom_mllib" in old_resolved:
            old_resolved["custom_mllib_grid"] = old_resolved["custom_mllib"]

        if "mllib_grids" in old_resolved:
            del old_resolved["mllib_grids"]

        #print("After unnest mllib: %s" % json.dumps(old_resolved, indent=2))

    def pretrain_call_everything_grid(self, old_pretrain):
        #print("Before call everything grid : %s" % json.dumps(old_pretrain, indent=2))
        """In pre-train, some grids were not called _grid"""

        def append_grid_to_key(key):
            if key in old_pretrain:
                old_pretrain[key + "_grid"] = old_pretrain[key]
                del old_pretrain[key]

        append_grid_to_key("least_squares")
        append_grid_to_key("xgboost")
        append_grid_to_key("deep_learning_sparkling")
        append_grid_to_key("gbm_sparkling")
        append_grid_to_key("glm_sparkling")
        append_grid_to_key("rf_sparkling")
        append_grid_to_key("nb_sparkling")

        #print("After call everything grid : %s" % json.dumps(old_pretrain, indent=2))

    def pretrain_regridify_if_needed(self, pretrain):
        """Pre-train was not always gridified, so gridify if needed"""

        #print("Before regridify : %s" % json.dumps(pretrain, indent=2))

        def _identity(value=None,col=None):
            return value


        def _listify(value=None,col=None):
            if isinstance(value,list):
                return value
            else:
                return [value]

        def _expand_value(value=None,col=None):
            return col in value.split()

        INGRIDS = {
            'RANDOM_FOREST_REGRESSION': {
                'grid_name': 'rf_regressor_grid',
                'replace_strategy': {
                    "rf_estimators": ("n_estimators", _listify),
                    "rf_njobs": "n_jobs",
                    "rf_max_tree_depth": ("max_tree_depth", _listify),
                    "rf_min_samples_leaf": ("min_samples_leaf", _listify),
                    "rf_selection_mode": "selection_mode",
                    "rf_max_features": ("max_features", _listify),
                    "rf_max_feature_prop": "max_feature_prop",
                },
            },
            'RANDOM_FOREST_CLASSIFICATION' : {
                'grid_name': 'rf_classifier_grid',
                'replace_strategy': {
                    "rf_estimators": ("n_estimators", _listify),
                    "rf_njobs": "n_jobs",
                    "rf_max_tree_depth": ("max_tree_depth", _listify),
                    "rf_min_samples_leaf": ("min_samples_leaf", _listify),
                    "rf_selection_mode": "selection_mode",
                    "rf_max_features": ("max_features", _listify),
                    "rf_max_feature_prop": "max_feature_prop",
                },
            },
            'EXTRA_TREES': {
                'grid_name': 'extra_trees_grid',
                'replace_strategy': {
                    "rf_estimators": ("n_estimators", _listify),
                    "rf_njobs": "n_jobs",
                    "rf_max_tree_depth": ("max_tree_depth", _listify),
                    "rf_min_samples_leaf": ("min_samples_leaf", _listify),
                    "rf_selection_mode": "selection_mode",
                    "rf_max_features": ("max_features", _listify),
                    "rf_max_feature_prop": "max_feature_prop",
                },
            },
            'GBT_CLASSIFICATION': {
                'grid_name' : 'gbt_classifier_grid',
                'replace_strategy' : {
                    "gbt_n_estimators": ("n_estimators", _listify),
                    "gbt_learning_rate": ("learning_rate", _listify),
                    "gbt_max_depth": ("max_depth", _listify),
                    "gbt_max_features": ("max_features", _listify),
                    "gbt_min_samples_leaf": ("min_samples_leaf", _listify),
                    "gbt_max_feature_prop": "max_feature_prop",
                    "gbt_selection_mode": "selection_mode",
                    "gbt_loss": (['deviance','exponential','huber'], _expand_value),
                },
            },
            'GBT_REGRESSION': {
                'grid_name': 'gbt_regressor_grid',
                'replace_strategy': {
                    "gbt_n_estimators": ("n_estimators", _listify),
                    "gbt_learning_rate": ("learning_rate", _listify),
                    "gbt_max_depth": ("max_depth", _listify),
                    "gbt_max_features": ("max_features", _listify),
                    "gbt_min_samples_leaf": ("min_samples_leaf", _listify),
                    "gbt_max_feature_prop": "max_feature_prop",
                    "gbt_selection_mode": "selection_mode",
                    "gbt_loss": (['ls','lad','huber'], _expand_value),
                },
            },
            'DECISION_TREE_CLASSIFICATION': {
                'grid_name': 'dtc_classifier_grid',
                'replace_strategy': {
                    "dtc_max_depth": ("max_depth", _listify),
                    "dtc_min_samples_leaf": ('min_samples_leaf', _listify),
                    "dtc_criterion": (['gini','entropy'], _expand_value),
                    "dtc_splitter": (['random','best'], _expand_value),
                },
            },
            'DECISION_TREE_REGRESSION': {
                'grid_name': 'dtc_classifier_grid',
                'replace_strategy': {
                    "dtc_max_depth": ("max_depth", _listify),
                    "dtc_min_samples_leaf": ('min_samples_leaf', _listify),
                    "dtc_criterion": (['gini','entropy'], _expand_value),
                    "dtc_splitter": (['random','best'], _expand_value),
                },
            },
            'LOGISTIC_REGRESSION': {
                'grid_name': 'logit_grid',
                'replace_strategy': {
                    "logit_penalty": (['l1','l2'], _expand_value),
                    'C':('C', _listify),
                    'n_jobs':'n_jobs',
                    'logit_multi_class': 'multi_class',
                },
            },
            'SVM_REGRESSION': {
                'grid_name': 'svr_grid',
                'replace_strategy' : {
                    'tol': 'tol',
                    'C':('C', _listify),
                    'gamma':('gamma', _listify),
                    'kernel': (['linear','poly','sigmoid','rbf'], _expand_value),
                    'coef0': 'coef0',
                    'max_iter': 'max_iter',
                },
            },
            'SVC_CLASSIFICATION': {
                'grid_name': 'svc_grid',
                'replace_strategy' : {
                    'tol': 'tol',
                    'C':('C', _listify),
                    'gamma':('gamma', _listify),
                    "kernel": (['linear','poly','sigmoid','rbf'], _expand_value),
                    'coef0': 'coef0',
                    'max_iter': 'max_iter',
                },
            },
            'SGD_REGRESSION': {
                'grid_name': 'sgd_reg_grid',
                'replace_strategy': {
                    'l1_ratio': 'l1_ratio',
                    'penalty': (['l1','l2','elasticnet'], _expand_value),
                    'alpha': ('alpha', _listify),
                    'n_jobs': 'n_jobs',
                    'max_iter': 'n_iter',
                    'loss': (['squared_loss','huber'], _expand_value),
                },
            },
            'SGD_CLASSIFICATION': {
                'grid_name': 'sgd_grid',
                'replace_strategy': {
                    'l1_ratio': 'l1_ratio',
                    "penalty": (['l1','l2','elasticnet'], _expand_value),
                    'alpha': ('alpha', _listify),
                    'max_iter': 'n_iter',
                    "loss": (['log','modified_huber'], _expand_value),
                },
            },
            'RIDGE_REGRESSION': {
                'grid_name': 'ridge_grid',
                'replace_strategy': {
                    'ridge_alphamode': 'alphaMode',
                    'alpha': ('alpha', _listify),
                },
            },
            'LASSO_REGRESSION': {
                'grid_name': 'lasso_grid',
                'replace_strategy': {
                    'lasso_alphamode': 'alphaMode',
                    'alpha': ('alpha', _listify),
                },
            },
            'KNN': {
                'grid_name': 'knn_grid',
                'replace_strategy': {
                    'knn_k': ('k', _listify),
                    'knn_distance_weighting': 'distance_weighting',
                    'knn_algorithm': 'algorithm',
                    'knn_p': 'p',
                    'knn_leaf_size': 'leaf_size',
                },
            },
            'XGBOOST_CLASSIFICATION': {
                'grid_name': 'xgboost_grid',
                'replace_strategy': {
                    'xgboost_max_depth': ('max_depth', _listify),
                    'xgboost_learning_rate': ('learning_rate', _listify),
                    'xgboost_n_estimators': 'n_estimators',
                    'xgboost_nthread': 'nthread',
                    'xgboost_gamma': ('gamma', _listify),
                    'xgboost_min_child_weight': ('min_child_weight', _listify),
                    'xgboost_max_delta_step': ('max_delta_step', _listify),
                    'xgboost_subsample': ('subsample', _listify),
                    'xgboost_colsample_bytree': ('colsample_bytree',_listify),
                    'xgboost_colsample_bylevel': ('colsample_bylevel',_listify),
                    'xgboost_alpha': ('alpha', _listify),
                    'xgboost_lambda': ('lambda', _listify),
                    'xgboost_seed': 'seed',
                    'xgboost_impute_missing': 'impute_missing',
                    'xgboost_missing': 'missing',
                    'xgboost_base_score': 'base_score',
                    'xgboost_scale_pos_weight': 'scale_pos_weight',
                    'xgboost_enable_early_stopping': 'enable_early_stopping',
                    'xgboost_early_stopping_rounds': 'early_stopping_rounds',
                    'xgboost_silent': None,
                    'xgboost_objective': None,
                },
            },
            'XGBOOST_REGRESSION': {
                'grid_name': 'xgboost_grid',
                'replace_strategy': {
                    'xgboost_max_depth': ('max_depth', _listify),
                    'xgboost_learning_rate': ('learning_rate', _listify),
                    'xgboost_n_estimators': 'n_estimators',
                    'xgboost_nthread': 'nthread',
                    'xgboost_gamma': ('gamma', _listify),
                    'xgboost_min_child_weight': ('min_child_weight', _listify),
                    'xgboost_max_delta_step': ('max_delta_step', _listify),
                    'xgboost_subsample': ('subsample', _listify),
                    'xgboost_colsample_bytree': ('colsample_bytree',_listify),
                    'xgboost_colsample_bylevel': ('colsample_bylevel',_listify),
                    'xgboost_alpha': ('alpha', _listify),
                    'xgboost_lambda': ('lambda', _listify),
                    'xgboost_seed': 'seed',
                    'xgboost_impute_missing': 'impute_missing',
                    'xgboost_missing': 'missing',
                    'xgboost_base_score': 'base_score',
                    'xgboost_scale_pos_weight': 'scale_pos_weight',
                    'xgboost_enable_early_stopping': 'enable_early_stopping',
                    'xgboost_early_stopping_rounds': 'early_stopping_rounds',
                    'xgboost_silent': None,
                    'xgboost_objective': None,
                },
            },
            'LEASTSQUARE_REGRESSION': {
                'grid_name': 'least_squares_grid',
                'replace_strategy': {
                    'n_jobs': 'n_jobs',
                },
            },
            'NEURAL_NETWORK': {
                'grid_name': 'neural_network_grid'
            },
            'LARS' : {
                'grid_name': "lars_grid",
                "replace_strategy": {
                    "lars_max_features" : "max_features",
                    "lars_K" : "K"
                }
            }
        }

        algorithm = pretrain.get("algorithm", "unknown")
        if algorithm == 'SCIKIT_MODEL':
            pass

        elif algorithm in INGRIDS:
            grid_descriptor = INGRIDS[algorithm]
            grid_name = grid_descriptor['grid_name']
            if grid_name in pretrain:
                # Already gridified, do nothing
                pass
            else:
                ingrid = {}
                for old_key, strategy in grid_descriptor['replace_strategy'].items():
                    if not strategy:
                        continue
                    if isinstance(strategy, tuple):
                        dest_col_names, clean_func = strategy
                    else:
                        dest_col_names = strategy
                        clean_func = _identity
                    if not isinstance(dest_col_names, list):
                        dest_col_names = [dest_col_names]
                    for dest_col_name in dest_col_names:
                        if old_key in pretrain:
                            ingrid[dest_col_name] = clean_func(col=dest_col_name, value=pretrain[old_key])

                pretrain[grid_name] = ingrid

        elif algorithm == "VERTICA_LINEAR_REGRESSION":
            pretrain["vertica_linreg_grid"] = {
                "optimizer" : pretrain.get("vertica_reg_optimizer", "BFGS"),
                "maxIterations": pretrain.get("vertica_reg_iterations", 200),
                "epsilon": pretrain.get("vertica_reg_epsilon", 0.000001),
            }
        elif algorithm == "VERTICA_LOGISTIC_RERESSION":
            pretrain["vertica_logit_grid"] = {
                "optimizer" : pretrain.get("vertica_reg_optimizer", "BFGS"),
                "maxIterations": pretrain.get("vertica_reg_iterations", 200),
                "epsilon": pretrain.get("vertica_reg_epsilon", 0.000001),
            }

        #print("Aftr regridify : %s" % json.dumps(pretrain, indent=2))

    def posttrain_nest(self, old_resolved):
        """In post-train, put all parameters that were at top-level behind their personal algorithm key"""
        d = old_resolved
        a = old_resolved.get("algorithm", "unknown")

        #print("Before post nest: %s" % json.dumps(old_resolved, indent=2))
        #print ("Algorithm : %s" % a)

        # Generic helpers
        def nest_unprefix(old_dict, new_dict, prefix):
            for key in old_dict.keys():
                if key.startswith(prefix):
                    new_dict[key.replace(prefix, "", 1)] = old_dict[key]

        def nest_explicit(old_dict, new_dict, *args):
            for key in args:
                if key in old_dict:
                    new_dict[key] = old_dict[key]

        # MLLib specific helper because mllib was already gridified
        def unnest_mllib_grid_post(dic, grid_name, already_ungridified, to_ungridify):
            grid = dic.get("mllib_grids", {}).get(grid_name, {})

            dic[grid_name] = {}

            for p in already_ungridified:
                v = grid.get(p, None)
                if v is not None:
                    dic[grid_name][p] =  v

            for p in to_ungridify:
                v = grid.get(p, None)
                if v is not None and len(v) == 1:
                    dic[grid_name][p] = v[0]

        if a == "RANDOM_FOREST_CLASSIFICATION" or a == "RANDOM_FOREST_REGRESSION":
            d["rf"] = {}
            nest_unprefix(d, d["rf"], "rf_")

        elif a == "GBT_CLASSIFICATION" or a == "GBT_REGRESSION":
            d["gbt"] = {}
            nest_unprefix(d, d["gbt"], "gbt_")

        elif a == "DECISION_TREE_CLASSIFICATION" or a == "DECISION_TREE_REGRESSION":
            d["dt"] = {}
            nest_unprefix(d, d["dt"], "dtc_")

        elif a == "LOGISTIC_REGRESSION":
            d["logit"] = {}
            nest_unprefix(d, d["logit"], "logit_")

        elif a == "SVC_CLASSIFICATION":
            d["svm"] = {}
            nest_explicit(d, d["svm"], "C", "gamma", "kernel", "coef0", "tol", "max_iter")

        elif a == "SGD_CLASSIFICATION" or a == "SGD_REGRESSION" :
            d["sgd"] = {}
            nest_explicit(d, d["sgd"], "alpha", "l1_ratio", "loss", "penalty", "n_jobs")

        elif a == "RIDGE_REGRESSION":
            d["ridge"] = {}
            nest_explicit(d, d["ridge"], "alpha")

        elif a == "LASSO_REGRESSION":
            d["lasso"] = {}
            nest_explicit(d, d["lasso"], "alpha")

        elif a == "LARS":
            d["lars"] = {}
            nest_unprefix(d, d["lars"], "lars_")

        elif a == "LEASTSQUARE_REGRESSION":
            d["least_squares"] = {}

        elif a == "XGBOOST_CLASSIFICATION" or a == "XGBOOST_REGRESSION":
            d["xgboost"] = {}
            nest_unprefix(d, d["xgboost"], "xgboost_")

        elif a == "MLLIB_LOGISTIC_REGRESSION":
            unnest_mllib_grid_post(d, "mllib_logit", ["max_iter"], ["reg_param","enet_param"])

        elif a == "MLLIB_DECISION_TREE":
            unnest_mllib_grid_post(d, "mllib_dt", ["max_bins", "min_info_gain", "min_instance_per_node"], ["max_depth"])

        elif a == "MLLIB_LINEAR_REGRESSION":
            unnest_mllib_grid_post(d, "mllib_linreg", ["max_iter"], ["reg_param", "enet_param"])

        elif a == "MLLIB_NAIVE_BAYES":
            unnest_mllib_grid_post(d, "mllib_naive_bayes", [], ["lambda"])

        elif a == "MLLIB_RANDOM_FOREST":
            unnest_mllib_grid_post(d, "mllib_rf", ["impurity", "max_bins", "min_info_gain", "min_instance_per_node", "subsampling_rate", "subset_strategy"], ["max_depth", "num_trees", "step_size"])

        elif a == "MLLIB_GBT":
            unnest_mllib_grid_post(d, "mllib_gbt", ["impurity", "max_bins", "min_info_gain", "min_instance_per_node", "subsampling_rate", "subset_strategy"], ["max_depth", "num_trees", "step_size"])

        elif a == "KNN":
            d["knn"] = {}
            nest_unprefix(d, d["knn"], "knn_")

        else:
            print(" ** WARNING: Unhandled algorithm: %s" % a)

        #print("After post nest: %s" % json.dumps(old_resolved, indent=2))

    def execute(self, project_paths):
        for rm_file in glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data):
            print("Migrating analysis-data MS rmodeling file: %s" % rm_file)
            try:
                data = base.json_loadf(rm_file)
                self.pretrain_unnest_mllib_grids(data)
                self.pretrain_call_everything_grid(data)
                self.pretrain_regridify_if_needed(data)

                base.json_dumpf(rm_file, data)
            except Exception as e:
                import traceback
                traceback.print_exc()
                print("Model migration FAILED: %s" % e)

        for ap_file in glob("%s/*/*/sessions/*/*/*/actual_params.json" % project_paths.analysis_data):
            print("Migrating analysis-data MS actualparams file: %s" % ap_file)
            try:
                data = base.json_loadf(ap_file)
                self.posttrain_nest(data.get("resolved", {}))

                base.json_dumpf(ap_file, data)
            except Exception as e:
                import traceback
                traceback.print_exc()
                print("Model migration FAILED: %s" % e)

        # modelid/versions/vid/rmodeling_params.json
        for rm_file in glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models):
            print("Migrating saved-model rmodeling file: %s" % rm_file)
            try:
                data = base.json_loadf(rm_file)
                self.pretrain_unnest_mllib_grids(data)
                self.pretrain_call_everything_grid(data)
                self.pretrain_regridify_if_needed(data)

                base.json_dumpf(rm_file, data)
            except Exception as e:
                import traceback
                traceback.print_exc()
                print("Model migration FAILED: %s" % e)

        # modelid/versions/vid/actual_params.json
        for ap_file in glob("%s/*/versions/*/actual_params.json" % project_paths.saved_models):
            print("Migrating saved-model actualparams file: %s" % ap_file)
            try:
                data = base.json_loadf(ap_file)
                self.posttrain_nest(data.get("resolved", {}))

                base.json_dumpf(ap_file, data)
            except Exception as e:
                import traceback
                traceback.print_exc()
                print("Model migration FAILED: %s" % e)

        # recipes/*.prediction_training
        for pt_file in glob("%s/*/*.prediction_training" % project_paths.config):
            print("Migrating train recipe config: %s" % pt_file)
            try:
                data = base.json_loadf(pt_file)

                modeling = data.get("modeling", {})

                self.pretrain_unnest_mllib_grids(modeling)
                self.pretrain_call_everything_grid(modeling)
                self.pretrain_regridify_if_needed(modeling)

                base.json_dumpf(pt_file, data)
            except Exception as e:
                import traceback
                traceback.print_exc()
                print("Model migration FAILED: %s" % e)


class V18FeatureGenerationParams(migration_base.ProjectLocalMigrationOperation):
    """
    Migrates to clean FeatureGenerationParams
    """
    def __init__(self):
        pass

    def __repr__(self,):
        return "Nest feature generation parameters"

    def process_file(self, the_file):
        data = base.json_loadf(the_file)
        self.process_preprocessing(data)
        base.json_dumpf(the_file, data)

    def process_preprocessing(self, data):
        data["feature_generation"] = {}

        if data.get("numerical_combinations", {}).get("pairwiseLinear", False):
            data["feature_generation"]["pairwise_linear"] = { "behavior": "ENABLED_MANUAL" }
        else:
            data["feature_generation"]["pairwise_linear"] = { "behavior": "DISABLED" }
        if data.get("numerical_combinations", {}).get("polynomialInteraction", False):
            data["feature_generation"]["polynomial_combinations"] = { "behavior": "ENABLED_MANUAL" }
        else:
            data["feature_generation"]["polynomial_combinations"] = { "behavior": "DISABLED" }

        data["feature_generation"]["manual_interactions"] = {
            "interactions" : data.get("feature_interactions", [])
        }

    def execute(self, project_paths):
        for pfile in glob("%s/*/*/sessions/*/*/rpreprocessing_params.json" % project_paths.analysis_data):
            print("Migrating analysis-data rpreprocessing file: %s" % pfile)
            self.process_file(pfile)

        for pfile in glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data):
            print("Migrating analysis-data mltask file: %s" % pfile)
            data = base.json_loadf(pfile)
            self.process_preprocessing(data.get("preprocessing", {}))
            base.json_dumpf(pfile, data)

        for pfile in glob("%s/*/versions/*/rpreprocessing_params.json" % project_paths.saved_models):
            print("Migrating saved-model rpreprocessing file: %s" % pfile)
            self.process_file(pfile)

        for pfile in glob("%s/recipes/*.prediction_training" % project_paths.config):
            print("Migrating train recipe config: %s" % pfile)
            data = base.json_loadf(pfile)
            self.process_preprocessing(data.get("preprocessing", {}))
            base.json_dumpf(pfile, data)

        for pfile in glob("%s/analysis/*/ml/*/params.json" % project_paths.config):
            print("Migrating analysis mltask config: %s" % pfile)
            data = base.json_loadf(pfile)
            if data is None:
                print("Analysis MLTask file is corrupted: %s, ignoring" % pfile)
                continue
            self.process_preprocessing(data.get("preprocessing", {}))
            base.json_dumpf(pfile, data)

###############################################################################
# V19 / DSS 4.3
###############################################################################

# Nothing to do !

###############################################################################
# V20 / DSS 5.0
###############################################################################

class V20AddParamsToMLRecipes(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Add params to ML recipes"

    def transform(self, obj, filepath=None):
        if obj.get('type', '') not in [
                'prediction_training', 'prediction_scoring', 'evaluation',
                'clustering_training', 'clustering_scoring', 'clustering_cluster']:
            return obj
        obj['params'] = obj.get('params', {})
        return obj

    def file_patterns(self,):
        return ["recipes/*.json"]


class V20TransformCommentsInsightsToDiscussionsInsights(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Transform comments insight to discussions insights"

    def transform(self, obj, filepath=None):
        if obj.get("type", "") != "comments":
            return obj
        obj["type"] = "discussions"
        params = obj.get("params", {})
        if params.get("objectSmartId", None) is not None:
            params["objectId"] = params["objectSmartId"]
            del params["objectSmartId"]
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["insights/*.json"]

class V20TransformCommentsInsightsToDiscussionsInsightsInDashboards(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Transform dashboard by changing comments insight to discussions insights"

    def transform(self, obj, filepath=None):
        if "pages" in obj:
            for page in obj.get("pages"):
                if "grid" in page:
                    if "tiles" in page["grid"]:
                        tiles = page["grid"]["tiles"]
                        for tile in tiles:
                            if tile.get("insightType", "") == "comments":
                                tile["insightType"] = "discussions"
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["dashboards/*.json"]

class V20DKUCommand(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Update project timelines for discussions"

    def execute(self, diphome):
        pass

    def post_execute(self, diphome):
        tmp_folder = osp.join(diphome.path, "tmp")
        if not osp.isdir(tmp_folder):
            os.makedirs(tmp_folder)

        import subprocess

        dkupath = os.getenv("DKUBIN", diphome.path + "/bin/dku")
        subprocess.check_call(dkupath + " __migrate_v20", shell=True)

###############################################################################
# V21 / DSS 5.0.2
###############################################################################

def migrate_ml_spark_params(obj):
    spark_params = {}
    for prop in ["sparkConf", "sparkPreparedDFStorageLevel", "sparkRepartitionNonHDFS", "pipelineAllowStart", "pipelineAllowMerge"]:
        spark_params[prop] = obj.get(prop, None)
        if prop in obj:
            del obj[prop]
    obj["sparkParams"] = spark_params
    return obj

class V21RegoupMLSparkParamsInRecipes(migration_json.ProjectConfigJsonMigrationOperation):
    """
    Migrates spark params in recipes into a common object
    """
    def __repr__(self,):
        return "Regroup spark params in recipes"

    def transform(self, obj, filepath=None):
        recipe_type = obj['type']
        if recipe_type in ['clustering_training', 'clustering_scoring', 'clustering_cluster', 'prediction_training', 'prediction_scoring', 'evaluation']:
            payload_file = filepath.replace(".json", ".%s" % recipe_type)
            payload = base.json_loadf(payload_file)
            payload = migrate_ml_spark_params(payload)
            base.json_dumpf(payload_file, payload)
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.json"]

class V21RegoupMLSparkParamsInAnalysesMLTasks(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Migrates spark params in analyses' ml tasks into a common object"

    def transform(self, modeling, filepath=None):
        return migrate_ml_spark_params(modeling)

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["analysis/*/ml/*/params.json"]

class V21RegoupMLSparkParamsInAnalysisDataMLTasks(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Migrates spark params in analyses' models into a common object"

    def execute(self, project_paths):
        if not osp.isdir(project_paths.analysis_data):
            return
        #a7QE8ig7/ecsqyuFW/sessions/s1/mltask.json
        for anl in os.listdir(project_paths.analysis_data):
            anl_dir = osp.join(project_paths.analysis_data, anl)
            if not osp.isdir(anl_dir):
                continue
            for mltask in os.listdir(anl_dir):
                sessions_dir = osp.join(anl_dir, mltask, "sessions")
                if not osp.isdir(sessions_dir):
                    continue
                for session in os.listdir(sessions_dir):
                    session_file = osp.join(sessions_dir, session, "mltask.json")
                    if not osp.isfile(session_file):
                        continue
                    print("Migrating saved ML Task session: %s %s %s" % (anl, mltask, session))
                    try:
                        data = base.json_loadf(session_file)
                        data = migrate_ml_spark_params(data)
                        base.json_dumpf(session_file, data)
                    except Exception as e:
                        print("Model migration FAILED: %s" % e)

class V21RegoupMLSparkParamsInSavedModelsMLTasks(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Migrates spark params in saved models into a common object"

    def transform(self, modeling, filepath=None):
        return migrate_ml_spark_params(modeling)

    def jsonpath(self,):
        return "miniTask"

    def file_patterns(self,):
        return ["saved_models/*.json"]

###############################################################################
# V22 / DSS 5.0.3
###############################################################################

class V22GiveNPSSurveySettingsToUsers(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Give NPS Survey Settings to each user"

    def execute(self, diphome):
        usersf = osp.join(diphome.path, "config/users.json")
        users_data = base.json_loadf(usersf)
        defaultSetting = {
            "state": "INITIAL",
            "nextAction": int((datetime.datetime.now() + datetime.timedelta(days=30)).strftime("%s")) * 1000 # 30 days from now
        }

        for user in users_data["users"]:
            user["npsSurveySettings"] = defaultSetting

        print("Writing users file with NPS survey settings")
        base.json_dumpf(usersf, users_data)


###############################################################################
# V23 / DSS 5.1.0
###############################################################################

class V23MigrateH2Databases(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Upgrade structure of dss_schema_info in H2 databases"

    def execute(self, diphome):
        pass

    def post_execute(self, diphome):
        tmp_folder = osp.join(diphome.path, "tmp")
        if not osp.isdir(tmp_folder):
            os.makedirs(tmp_folder)

        import subprocess

        dkupath = os.getenv("DKUBIN", diphome.path + "/bin/dku")
        subprocess.check_call(dkupath + " __migrate_v23", shell=True)


class V23MakeClassWeightTheDefaultForClassifications(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Make CLASS_WEIGHT the default weighting strategy for classification saved models"

    def must_process(self, data):
        prediction_type = data.get("predictionType") or data.get("prediction_type")
        task_type = data.get("taskType") or data.get("task_type")
        return task_type == "PREDICTION" and prediction_type in {"BINARY_CLASSIFICATION", "MULTICLASS"}

    def process_file(self, the_file, field=None, also_core_params=False):
        data = base.json_loadf(the_file)
        if field is None:
            if self.must_process(data):
                data = self.process_weight(data)
                base.json_dumpf(the_file, data)
                if also_core_params:
                    backend_type = data.get("backendType") or data.get("backend_type")
                    core_params_file = osp.join(osp.dirname(the_file), "core_params.json")
                    if osp.isfile(core_params_file):
                        core_params_data = base.json_loadf(core_params_file)
                        core_params_data = self.process_weight(core_params_data, backend_type=backend_type)
                        base.json_dumpf(core_params_file, core_params_data)
        else:
            backend_type = data.get("backendType")
            prediction_type = data["core"].get("prediction_type")
            if backend_type == "PY_MEMORY" and prediction_type in {"BINARY_CLASSIFICATION", "MULTICLASS"}:
                data[field] = self.process_weight(data[field], backend_type=backend_type)
                base.json_dumpf(the_file, data)
            if also_core_params:
                backend_type = data.get("backendType") or data.get("backend_type")
                core_params_file = osp.join(osp.dirname(the_file), "core_params.json")
                if osp.isfile(core_params_file):
                    core_params_data = base.json_loadf(core_params_file)
                    core_params_data = self.process_weight(core_params_data, backend_type=backend_type)
                    base.json_dumpf(core_params_file, core_params_data)

    def process_weight(self, data, backend_type=None):
        weight_params = data.get("weight")
        backend_type = backend_type or data.get("backendType") or data.get("backend_type")
        if backend_type == "PY_MEMORY":
            if weight_params is None:
                data["weight"] = {"weightMethod": "CLASS_WEIGHT"}
            elif weight_params.get("weightMethod") == "NO_WEIGHTING":
                weight_params["weightMethod"] = "CLASS_WEIGHT"
        else:
            if weight_params is None:
                data["weight"] = {"weightMethod": "NO_WEIGHTING"}
        return data

    def execute(self, project_paths):
        for pfile in glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data):
            print("Migrating analysis-data mltask.json file (and related core_params.json): %s" % pfile)
            self.process_file(pfile, also_core_params=True)
        for pfile in glob("%s/*/versions/*/core_params.json" % project_paths.saved_models):
            print("Migrating saved-model core_params file: %s" % pfile)
            self.process_file(pfile)
        for pfile in glob("%s/analysis/*/ml/*/params.json" % project_paths.config):
            print("Migrating analysis params config: %s" % pfile)
            self.process_file(pfile)
        for pfile in glob("%s/recipes/*.prediction_training" % project_paths.config):
            print("Migrating train recipe config: %s" % pfile)
            self.process_file(pfile, field="core")


class V23TransferKernelSpecEnvName(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Setup metadata for code envs in Jupyter kernels' specs"

    def execute(self, diphome, simulate=False):
        kernels_dir = osp.join(diphome.path, "jupyter-run", "jupyter", "kernels")

        if not osp.isdir(kernels_dir):
            return

        for kernel_file in glob(osp.join(kernels_dir, '*', 'kernel.json')):
            kernel_name = kernel_file.split('/')[-2]

            if not kernel_name.startswith('py-dku-venv-') and not kernel_name.startswith('r-dku-venv-'):
                # not a code env kernel
                continue
            with open(kernel_file, 'r') as f:
                kernel = json.load(f)

            kernel_metadata = kernel.get('metadata', {})
            kernel['metadata'] = kernel_metadata

            display_name = kernel.get('display_name', kernel_name)
            m = re.search('(Python|R) \((version (.*)\.(.*) of )?env (.*)\)', display_name)
            if m is not None:
                kernel_metadata["envName"] = m.group(5)
                kernel_metadata["projectKey"] = m.group(3)
                kernel_metadata["bundleId"] = m.group(4)

                print("Updated kernel : %s" % display_name)
                with open(kernel_file, 'w') as f:
                    json.dump(kernel, f, indent=2)

            else:
                print("Kernel from DSS with unexpected display name : %s" % display_name)


class V23DefaultGitURLWhitelist(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Sets a default Git URL whitelist for clones/pulls"

    def transform(self, obj, filepath=None):
        obj["git"] = {
            "enforcedConfigurationRules": [{
                "remoteWhitelist": ["^(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)?(\/?|\#[-\d\w._]+?)$"]
            }]
        }
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]


class V23UseSmartnameInRefreshChartsStep(migration_json.ProjectConfigJsonMigrationOperation):
    """
    Migrates dashboard references from (projectKey,id) to smartName in refresh charts step
    """
    def __repr__(self,):
        return "Use smartName in refresh charts steps"

    def transform(self, step, filepath):
        if step is not None and step.get('type', None) == 'refresh_chart_cache':
            project_key = os.environ.get('DKU_ORIGINAL_PROJECT_KEY', osp.basename(osp.dirname(osp.dirname(filepath))))
            step_params = step.get('params', {})
            dashboards = step_params.get('dashboards', [])
            smart_dashboards = []
            for dashboard in dashboards:
                dashboard_project_key = dashboard.get('projectKey', None)
                dashboard_id = dashboard.get('id', None)
                if dashboard_id is None:
                    # simply ignore, no point in keeping an empty slot
                    continue
                if dashboard_project_key == project_key or dashboard_project_key is None:
                    dashboard['smartName'] = dashboard_id
                else:
                    # this is not supposed to happen unless the user has edited the scenario manually or via the public API
                    dashboard['smartName'] = '%s.%s' % (dashboard_project_key, dashboard_id)
                del dashboard['projectKey']
                del dashboard['id']
                smart_dashboards.append(dashboard)
            step_params['dashboards'] = smart_dashboards
        return step

    def jsonpath(self,):
        return "params.steps"

    def file_patterns(self,):
        return ["scenarios/*.json"]


class V23SkipExpensiveReportsInMLTasks(migration_json.ProjectConfigJsonMigrationOperation):
    """
    Move ml task param 'skipExpensiveReports' in 'modeling'
    """
    def __repr__(self,):
        return "Move ml task param skipExpensiveReports in modeling"

    def transform(self, obj, filepath):
        if "skipExpensiveReports" in obj and "modeling" in obj:
            obj["modeling"]["skipExpensiveReports"] = obj["skipExpensiveReports"]
            del obj["skipExpensiveReports"]
        return obj

    def jsonpath(self):
        return ""

    def file_patterns(self,):
        return ["analysis/*/ml/*/params.json"]

###############################################################################
# V24 / DSS 5.1.1
###############################################################################

class V24UseSmartnameInArticleAttachments(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Migrating article attachments to use smart IDs"

    def transform(self, obj, filepath=None):
        context_pkey = os.environ.get('DKU_ORIGINAL_PROJECT_KEY', osp.basename(osp.dirname(osp.dirname(osp.dirname(filepath)))))
        if "attachments" in obj:
            for att in obj.get("attachments"):
                if att.get("attachmentType", None) == "DSS_OBJECT":
                    ttype = att.get("taggableType", None)
                    pkey = att.get("projectKey", None)
                    obj_id = att.get("id", None)
                    att["smartId"] = (pkey + '.' + obj_id) if (ttype != "PROJECT" and pkey is not None and pkey != context_pkey) else obj_id
                else:
                    att["smartId"] = att.get("id", None)
                if "id" in att:
                    del att["id"]
                if "projectKey" in att:
                    del att["projectKey"]
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["wiki/articles/*.json"]

###############################################################################
# V6000 / DSS 6.0.0
###############################################################################

class V6000SetEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, set):
            return list(obj)
        return json.JSONEncoder.default(self, obj)


class V6000MigrateProjectPathToProjectFolder(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Migrating project path to project folder"

    def execute(self, diphome):
        folders = {};
        for fp in glob(osp.join(diphome.path, "config/projects/*/params.json")):
            with open(fp, 'r') as f:
                print("Migrating %s" % fp)
                obj = json.load(f)
                path = obj.get(self.jsonpath(), {}).get('path', '/')
                project_permissions = obj.get("permissions", [])
                folders_in_path = self.cleanup_path(path).split('/')
                last_index = len(folders_in_path) - 1
                for idx, name in reversed(list(enumerate(folders_in_path))):
                    folder_id = 'ROOT' if idx == 0 else self.generate_small_id(list(map(lambda e: folders[e]['id'], folders)))
                    key = '/'.join(folders_in_path[:idx + 1])
                    folder = folders.get(key, {'id': folder_id, 'object': {'parentId': '', 'name': name, 'projectKeys': set([]), 'childrenIds': set([]), 'permissions': [], 'owner': ''}})
                    folders[key] = folder # Update the map in case the entry does not exists
                    if idx < last_index:
                        child_key = '/'.join(folders_in_path[:idx + 2])
                        child = folders[child_key]
                        child['object']['parentId'] = folder['id']
                        folder['object']['childrenIds'].add(child['id'])
                    else:
                        folder['object']['projectKeys'].add(osp.basename(osp.dirname(fp)))
                    if idx > 0: # root does not need permissions
                        for permission in project_permissions:
                            group = permission.get('group')
                            admin = permission.get('admin', False)
                            read = self.has_any_access(permission)
                            if group is None:
                                continue
                            new_permission = { 'group': group, 'admin': admin if idx == last_index else False, 'writeContents': admin, 'read': read }
                            existing_permission = self.get_permission(folder['object']['permissions'], group)
                            if existing_permission is not None:
                                self.update_permission(existing_permission, new_permission, 'admin')
                                self.update_permission(existing_permission, new_permission, 'writeContents')
                                self.update_permission(existing_permission, new_permission, 'read')
                            else:
                                folder['object']['permissions'].append(new_permission)
                if obj.get(self.jsonpath(), {}).get('path') is not None:
                    del obj[self.jsonpath()]['path']
                with open(fp, 'w') as f:
                    f.write(json.dumps(obj, indent=2, sort_keys=True))
        for entry in map(lambda e: folders[e], folders):
            file_path_id = osp.join(diphome.path, 'config', 'project_folders', entry['id'] + '.json')
            folder_json = json.dumps(entry['object'], indent=2, sort_keys=True, cls=V6000SetEncoder)
            print("Create file %s" % file_path_id)
            directory = osp.dirname(file_path_id)
            if not osp.exists(directory):
                os.makedirs(directory)
            with open(file_path_id, 'w+') as f:
                f.write(folder_json)

    def has_any_access(self, project_permission):
        # the executeApp is left out of this one
        return (project_permission.get('admin', False) or
                project_permission.get('readProjectContent', False) or
                project_permission.get('writeProjectContent', False) or
                project_permission.get('exportDatasetsData', False) or
                project_permission.get('readDashboards', False) or
                project_permission.get('writeDashboards', False) or
                project_permission.get('moderateDashboards', False) or
                project_permission.get('runScenarios', False) or
                project_permission.get('manageDashboardAuthorizations', False) or
                project_permission.get('manageExposedElements', False) or
                project_permission.get('manageAdditionalDashboardUsers', False))

    def cleanup_path(self, path):
        new_path = path
        if new_path[0] != '/':
            new_path = '/' + new_path
        if path[len(path) - 1] == '/':
            new_path = new_path[:-1]
        if len(new_path) > 0:
            new_path = self.remove_duplicates_slash(new_path)
        return new_path

    def remove_duplicates_slash(self, path):
        new_path = path[0]
        for char in path[1:]:
            if char == '/' and new_path[-1] == '/':
                continue
            new_path += char
        return new_path

    def update_permission(self, existing_permission, new_permission, name):
        existing_permission[name] = existing_permission[name] or new_permission[name]

    def get_permission(self, permissions, group_name):
        for permission in permissions:
            if permission.get('group') == group_name:
                return permission
        return None

    def generate_small_id(self, existing_ids):
        alphabet = string.ascii_letters + string.digits
        while True:
            new_id = ''.join(alphabet[random.randint(0, len(alphabet)-1)] for i in range(7))
            if new_id not in existing_ids:
                return new_id

    def jsonpath(self,):
        return "settings"


class V6000MigrateHomeSettings(migration_json.JsonMigrationOperation):
    def __repr__(self, ):
        return "Change project home behavior in user-settings.json"

    def transform(self, obj, filepath=None):
        behavior = obj.get('behavior', 'home');
        if behavior == 'all-projects-expanded':
            obj['behavior'] = 'project-list';
        return obj;

    def jsonpath(self,):
        return "userSettings.*.home"

    def file_patterns(self,):
        return ["config/user-settings.json"]


class V6000UseNumericIdsForArticle(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Migrating article IDs to numeric IDs instead of names"

    # Transforming numbers into strings to protect from weird deserialization
    def name_str(self, name):
        if sys.version_info < (3,):
            if isinstance(name, (int, long, float)):
                return str(name)
        else:
            if isinstance(name, (int, float)):
                return str(name)
        return name

    def process_articles(self, project_paths, mapping):
        articles_base = osp.join(project_paths.config, "wiki", "articles")
        articles_migrated = osp.join(project_paths.config, "wiki", "articles_migrated")

        if not osp.exists(articles_migrated):
            os.makedirs(articles_migrated)

        for name, id in iteritems(mapping):
            for ext in [".json", ".md"]:
                origin = osp.join(articles_base, name + ext)
                target = osp.join(articles_migrated, str(id) + ext)
                if not osp.isfile(origin):
                    continue

                if ext == ".json":
                    data = base.json_loadf(origin)
                    data['name'] = name
                    base.json_dumpf(origin, data)

                shutil.move(origin, target)

        shutil.rmtree(articles_base, ignore_errors=True)
        shutil.move(articles_migrated, articles_base)

    def transform_taxonomy(self, project_paths):
        taxonomy_file = osp.join(project_paths.config, "wiki", "taxonomy.json")
        mapping = {}

        if osp.isfile(taxonomy_file):
            data = base.json_loadf(taxonomy_file)
            if 'taxonomy' in data:
                # `[] +` needed to duplicate the list (we don't want to edit it)
                queue = [] + data['taxonomy']
                id = 1

                while len(queue) != 0:
                    node = queue.pop(0)
                    article_name = self.name_str(node['id'])

                    if article_name not in mapping:
                        mapping[article_name] = id
                        id += 1

                    node['id'] = mapping[article_name]
                    queue.extend(node['children'])

                data['homeArticleId'] = mapping.get(self.name_str(data['homeArticleId']), None)

                base.json_dumpf(taxonomy_file, data)

        return mapping

    def execute(self, project_paths):
        mapping = self.transform_taxonomy(project_paths)
        self.process_articles(project_paths, mapping)




class V6000MigrateHomepagesArticles(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Migrating homepage articles to ids"

    def execute(self, diphome):
        general_settings = osp.join(diphome.path, "config", "general-settings.json")
        mapping = {}

        for fp in glob(osp.join(diphome.path, "config", "projects", "*", "wiki", "articles", "*.json")):
            try:
                article = base.json_loadf(fp)
                identifier = osp.basename(fp)
                project_key = osp.basename(osp.dirname(osp.dirname(osp.dirname(fp))))
                articles = mapping.get(project_key, {})
                articles[article["name"]] = identifier[0:identifier.index(".")]
                mapping[project_key] = articles
            except:
                logging.exception("Unexpected error when trying to read: %s" % fp)

        data_modified = False
        data = base.json_loadf(general_settings)
        for article in data.get("personalHomePages", {}).get("articles", []):
            if "projectKey" in article and "id" in article:
                project_mapping = mapping.get(article["projectKey"], {})
                article_id = project_mapping.get(article["id"], None)
                if article_id is not None:
                    article["id"] = article_id # Replace name with the new Id
                    data_modified = True
        if data_modified:
            base.json_dumpf(general_settings, data)

class V6000MigrateDashboardArticles(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Migrating dashboard articles to ids"

    def execute(self, project_paths):
        article_id_old_to_new = {}
        article_id_new_to_old = {}
        for article_file in glob(osp.join(project_paths.config, "wiki", "articles", "*.json")):
            article = base.json_loadf(article_file)
            old_id = article.get("name", None)
            new_id = osp.basename(article_file)[:-5] # trim the .json extension
            if old_id is not None:
                article_id_old_to_new[old_id] = new_id
                article_id_new_to_old[new_id] = old_id

        def convert_id(article_id):
            if article_id in article_id_new_to_old:
                # id is already a new id, keep it (would go wrong if you used numeric names for articles pre-6.0. but then you're insane)
                return article_id
            else:
                return article_id_old_to_new.get(article_id, article_id)

        for insight_file in glob(osp.join(project_paths.config, "insights", "*.json")):
            insight = base.json_loadf(insight_file)
            if insight.get('type', None) != "article":
                continue
            article_id = insight.get('params', {}).get('articleId', None)
            print('migrate article id %s in insight %s' % (article_id, insight_file))
            insight['params']['articleId'] = convert_id(article_id)
            base.json_dumpf(insight_file, insight)

        params_file = osp.join(project_paths.config, "params.json")
        params = base.json_loadf(params_file)
        for authorization in params.get('dashboardAuthorizations', {}).get('authorizations', []):
            object_ref = authorization.get('objectRef', {})
            if object_ref.get('objectType', None) != 'ARTICLE':
                continue
            print('migrate article %s in dashboard authorizations' % object_ref.get('objectId', ''))
            article_id = object_ref.get('objectId', '')
            object_ref['objectId'] = convert_id(article_id)
        base.json_dumpf(params_file, params)


class V6000UpgradeWikiTimelineNumericIds(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Upgrade Wiki timeline with numeric article IDs"

    def execute(self, diphome, simulate=False):
        pass

    def post_execute(self, diphome):
        import subprocess

        dkupath = os.getenv("DKUBIN", diphome.path + "/bin/dku")
        subprocess.check_call(dkupath + " __migrate_v6000", shell=True)

class V6000UpgradeEC2Connections(migration_json.JsonMigrationOperation):
    def __repr__(self, ):
        return "Change credentials mode in AWS connections"

    def transform(self, obj, filepath=None):
        for (name, conn) in obj.get("connections", {}).items():
            if conn.get("type", "?") == "EC2":
                print("Upgrading credentials for EC2 connection: %s" % name)
                params = conn.get("params", {})
                if params.get("useDefaultCredentials", False):
                    params["credentialsMode"] = "ENVIRONMENT"
                else:
                    params["credentialsMode"] = "KEYPAIR"
        return obj;

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/connections.json"]

class V6000PrePushHookGeneralSettings(migration_json.JsonMigrationOperation):
    def __repr__(self, ):
        return "Upgrade pre-push hook in general settings"

    def transform(self, obj, filepath=None):
        for execConfig in obj.get("containerSettings", {}).get("executionConfigs", []):
            pps = execConfig.get("prePushScript", None)
            if pps is not None and pps != "":
                execConfig["prePushMode"] = "CUSTOM"
            else:
                execConfig["prePushMode"] = "NONE"
        for execConfig in obj.get("sparkSettings", {}).get("executionConfigs", []):
            k8s = execConfig.get("kubernetesSettings", None)
            if k8s is not None:
                pps = k8s.get("prePushScript", None)
                if pps is not None and pps != "":
                    k8s["prePushMode"] = "CUSTOM"
                else:
                    k8s["prePushMode"] = "NONE"
        return obj;

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]

class V6000PrePushHookInAPIDeployerInfras(migration_json.JsonMigrationOperation):
    def __repr__(self, ):
        return "Upgrade pre-push hook in API deployer"

    def transform(self, obj, filepath=None):
        pps = obj.get("prePushScript", None)
        if pps is not None and pps != "":
            obj["prePushMode"] = "CUSTOM"
        else:
            obj["prePushMode"] = "NONE"
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/api-deployer/infras/*.json"]


class V6000MigrateDoctorExecutionParams(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self):
        return "Migrating visual ML execution params"


    def default_execution_params(self):
        # Relies on the fact that current (in DSS<=5.1) default value for envSelection is Inherit
        return {
            "sparkCheckpoint": "NONE",
            "sparkParams": {
                "sparkConf": {
                "inheritConf": "default",
                "conf": []
                },
                "sparkUseGlobalMetastore": False,
                "sparkPreparedDFStorageLevel": "MEMORY_AND_DISK",
                "sparkRepartitionNonHDFS": 1,
                "pipelineAllowStart": True,
                "pipelineAllowMerge": True,
                "sparkExecutionEngine": "SPARK_SUBMIT"
            },
            "containerSelection":{
                "containerMode": "INHERIT"
            },
            "envSelection": {
                "envMode": "INHERIT"
            }
        }

    def migrate_trained_session(self, session_dir, project_code_env_name):
        mltask_file = osp.join(session_dir, "mltask.json")

        backend_type = "PY_MEMORY"
        task_type = "PREDICTION"
        if osp.isfile(mltask_file):
            mltask_data = base.json_loadf(mltask_file)
            execution_params = self.get_execution_params_from_mltask(mltask_data, project_code_env_name)
            backend_type = mltask_data.get("backendType", "PY_MEMORY")
            task_type = mltask_data.get("taskType", "PREDICTION")
        else:
            execution_params = self.default_execution_params()

        core_params_file =  osp.join(session_dir, "core_params.json")
        if osp.isfile(core_params_file):
            core_params = base.json_loadf(core_params_file)
        else: # for clustering
            core_params = {}

        core_params["taskType"] = task_type
        core_params["backendType"] = backend_type
        core_params["executionParams"] = execution_params
        base.json_dumpf(core_params_file, core_params)

    def migrate_saved_model_version(self, sm_version_dir, sm_id, project_paths, project_code_env_name):
        execution_params = None

        # First need to retrieve the corresponding MLTask
        sm_origin_file = osp.join(sm_version_dir, "sm_origin.json")
        has_found_original_analysis = False
        backend_type = "PY_MEMORY"
        task_type = "PREDICTION"
        if osp.isfile(sm_origin_file):

            sm_origin = base.json_loadf(sm_origin_file)
            origin_full_model_id = sm_origin.get("fullModelId", None)

            if origin_full_model_id is not None:

                fmi_info = self.partial_parse_analysis_full_model_id(origin_full_model_id)

                if fmi_info is not None:

                    origin_session_folder = osp.join(project_paths.analysis_data,
                                                     fmi_info["analysis_id"],
                                                     fmi_info["mltask_id"],
                                                     fmi_info["session_id"])

                    if osp.isfile(origin_session_folder):
                        mltask_file = osp.join(origin_session_folder, "mltask.json")
                        if osp.isfile(mltask_file):
                            mltask_data = base.json_loadf(mltask_file)
                            execution_params = self.get_execution_params_from_mltask(mltask_data, project_code_env_name)
                            backend_type = mltask_data.get("backendType", "PY_MEMORY")
                            task_type = mltask_data.get("taskType", "PREDICTION")
                            has_found_original_analysis = execution_params is not None

        if not has_found_original_analysis:
            # Try to fetch params from Saved Model miniTask, which is how it behaved previously
            sm_config_file = osp.join(project_paths.config, "saved_models", "{}.json".format(sm_id))

            if osp.isfile(sm_config_file):
                sm_config = base.json_loadf(sm_config_file)
                minitask_data = sm_config.get("miniTask", None)
                if minitask_data is not None:
                    execution_params = self.get_execution_params_from_mltask(minitask_data, project_code_env_name)
                    backend_type = minitask_data.get("backendType", "PY_MEMORY")
                    task_type = minitask_data.get("taskType", "PREDICTION")

        if execution_params is None:
            execution_params = self.default_execution_params()

        core_params_file =  osp.join(sm_version_dir, "core_params.json")
        if osp.isfile(core_params_file):
            core_params = base.json_loadf(core_params_file)
        else: # for clustering
            core_params = {}

        core_params["backendType"] = backend_type
        core_params["taskType"] = task_type
        core_params["executionParams"] = execution_params
        base.json_dumpf(core_params_file, core_params)

    def get_execution_params_from_mltask(self, mltask_data, project_code_env_name):
        execution_params = self.default_execution_params()

        env_selection_to_migrate = mltask_data.get("envSelection", {})
        env_name, env_selection = self.resolve_env_selection(env_selection_to_migrate, project_code_env_name)

        if env_selection is not None:
            execution_params["envSelection"] = env_selection

        if env_name is not None:
            execution_params["envName"] = env_name

        for k in ({"containerSelection", "sparkParams", "sparkCheckpoint", "sparkCheckpointDir"} & set(mltask_data.keys())):
            execution_params[k] = mltask_data[k]

        return execution_params

    def resolve_env_selection(self, env_selection, project_code_env_name):
        env_mode = env_selection.get("envMode", None)
        if env_mode == "INHERIT":
            env_name = project_code_env_name
        elif env_mode == "EXPLICIT_ENV":
            env_name = env_selection.get("envName", None)
        else:
            env_name = None
        return env_name, env_selection

    def fetch_project_code_env(self, project_paths):
        project_code_env_name = None
        if osp.isdir(project_paths.config):
            project_params_file = osp.join(project_paths.config, "params.json")
            if osp.isfile(project_params_file):
                project_params = base.json_loadf(project_params_file)
                project_py_code_envs_params = project_params.get("settings", {}).get("codeEnvs", {}).get("python", {})
                use_builtin = project_py_code_envs_params.get("useBuiltinEnv", True)
                if not use_builtin:
                    project_code_env_name = project_py_code_envs_params.get("envName", None)
        return project_code_env_name

    def partial_parse_analysis_full_model_id(self, full_model_id_str):
        """
            Example: A-TOTO-RwMNEg5m-CDX4wKoq-s2-pp1-m1
        """
        elements = full_model_id_str.split("-")

        if elements[0] != "A" or len(elements) != 7:
            return None

        analysis_id = elements[2]
        mltask_id = elements[3]
        session_id = elements[4]

        return {
            "analysis_id": elements[2],
            "mltask_id": elements[3],
            "session_id": elements[4]
        }

    def execute(self, project_paths):
        # Fetch project code env for future use
        project_code_env_name = self.fetch_project_code_env(project_paths)

        # Migrating analysis data
        if osp.isdir(project_paths.analysis_data):
            for anl in os.listdir(project_paths.analysis_data):
                anl_dir = osp.join(project_paths.analysis_data, anl)
                if not osp.isdir(anl_dir):
                    continue
                for mltask in os.listdir(anl_dir):
                    sessions_dir = osp.join(anl_dir, mltask, "sessions")
                    if not osp.isdir(sessions_dir):
                        continue
                    for session in os.listdir(sessions_dir):
                        session_dir = osp.join(sessions_dir, session)
                        if not osp.isdir(session_dir):
                            continue
                        print("Migrating trained ML Task session: %s %s %s" % (anl, mltask, session))
                        try:
                            self.migrate_trained_session(session_dir, project_code_env_name)
                        except Exception as e:
                            print("Trained model '%s %s %s' migration FAILED: %s" % (anl, mltask, session, e))

        # Migrating saved model data
        if osp.isdir(project_paths.saved_models):
            for sm in os.listdir(project_paths.saved_models):
                sm_versions_dir = osp.join(project_paths.saved_models, sm, "versions")
                if not osp.isdir(sm_versions_dir):
                    continue
                for sm_version in os.listdir(sm_versions_dir):
                    sm_version_dir = osp.join(sm_versions_dir, sm_version)
                    if not osp.isdir(sm_version_dir):
                        continue
                    print("Migrating saved model session: %s %s" % (sm, sm_version))
                    try:
                        self.migrate_saved_model_version(sm_version_dir, sm, project_paths, project_code_env_name)
                    except Exception as e:
                        print("Saved model '%s %s' migration FAILED: %s" % (sm, sm_version, e))

class V6000MigrateKerasModelListedInCodeEnv(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrating listing of code-envs used in visual deep-learning"

    def __init__(self):
        self.used_code_envs = []

    def execute(self, project_paths):
        pass

    def find_dl_code_env_usage_in_mltask(self, mltask_file):
        mltask_data = base.json_loadf(mltask_file)
        if mltask_data.get("backendType", "PY_MEMORY") == "KERAS":
            env_selection = mltask_data.get("envSelection", None)
            if env_selection is not None:
                env_mode = env_selection.get("envMode", None)
                if env_mode == "EXPLICIT_ENV":
                    env_name = env_selection.get("envName", None)
                    if env_name is not None:
                        self.used_code_envs.append({
                            "envName": env_name,
                            "envLang": "PYTHON"
                        })

    def find_dl_code_env_usage_in_recipe(self, recipe_file):
        recipe_data = base.json_loadf(recipe_file)
        if recipe_data.get("backendType", "PY_MEMORY") == "KERAS":
            env_name = recipe_data.get("envName", None)
            if env_name is not None:
                self.used_code_envs.append({
                    "envName": env_name,
                    "envLang": "PYTHON"
                })

    def get_manifest_additions(self, additions, project_paths):
        if osp.isdir(project_paths.config):
            # Looking for all DL MLTasks with explicit code-env
            analysis_data_dir = osp.join(project_paths.config, "analysis")
            if osp.isdir(analysis_data_dir):
                for anl in os.listdir(analysis_data_dir):
                    anl_dir = osp.join(analysis_data_dir, anl, "ml")
                    if osp.isdir(anl_dir):
                        for mltask in os.listdir(anl_dir):
                            mltask_dir = osp.join(anl_dir, mltask)
                            if osp.isdir(mltask_dir):
                                mltask_file = osp.join(mltask_dir, "params.json")
                                if osp.isfile(mltask_file):
                                    try:
                                        self.find_dl_code_env_usage_in_mltask(mltask_file)
                                    except Exception as e:
                                        print("Cannot find code-env usage of Mltask: %s %s" % (anl, mltask))

            # Looking for all DL ML train recipes to find code env usages
            recipes_dir = osp.join(project_paths.config, "recipes")
            if osp.isdir(recipes_dir):
                for train_recipe_name in glob(osp.join(recipes_dir, "*.prediction_training")):
                    train_recipe_file = osp.join(recipes_dir, train_recipe_name)
                    if osp.isfile(train_recipe_file):
                        try:
                            self.find_dl_code_env_usage_in_recipe(train_recipe_file)
                        except Exception as e:
                            print("Cannot find code-env usage of train recipe: %s" % train_recipe_name)

        # Add used code-envs if any
        if len(self.used_code_envs) > 0:
            used_code_envs = additions.get("usedCodeEnvRefs", [])
            for used_code_env in self.used_code_envs:
                already_in_list = any(c for c in used_code_envs if
                                      c.get("envName", None) == used_code_env["envName"] and c.get("envLang", None) == used_code_env["envLang"])
                if not already_in_list:
                    used_code_envs.append(used_code_env)
            additions["usedCodeEnvRefs"] = used_code_envs


class V6000MigrateEvaluationRecipeMetricsOutputs(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self, ):
        return "Upgrade evaluation recipe metrics and ouputs configurations"

    def get_evaluated_recipe_ref(self, obj, filepath):
        eval_recipe_suffix = ".evaluation"
        eval_json_file_path = filepath[:-len(eval_recipe_suffix)] + ".json"
        if osp.isfile(eval_json_file_path):
            with open(eval_json_file_path) as eval_json_file:
                eval_json = json.load(eval_json_file)
                if eval_json and eval_json.get("inputs", None):
                    inputs = eval_json["inputs"]
                    if len(inputs.get("model", {}).get("items", [])) > 0:
                        item = inputs.get("model", {}).get("items", [])[0]
                        if item.get("ref", None):
                            return item["ref"]
        return None

    def get_evaluated_recipe_type(self, obj, filepath):
        searched_ref = self.get_evaluated_recipe_ref(obj, filepath)
        if searched_ref:
            recipes_dir = osp.dirname(filepath)
            if osp.isdir(recipes_dir):
                for recipe_file_name in os.listdir(recipes_dir):
                    if recipe_file_name[-4:] != "json":
                        continue
                    recipe_path = osp.join(recipes_dir, recipe_file_name)
                    if osp.isfile(recipe_path):
                        with open(recipe_path) as recipe_file:
                            recipe = json.load(recipe_file)
                            if recipe and recipe.get("outputs", {}).get("main", {}).get("items", None):
                                items = recipe["outputs"]["main"]["items"]
                                for item in items:
                                    if searched_ref == item.get("ref", None):
                                        prediction_training_filename = osp.join(recipes_dir, "%s.prediction_training" % recipe_file_name[:-len(".json")])
                                        if osp.isfile(prediction_training_filename):
                                            with open(prediction_training_filename) as prediction_training_file:
                                                prediction_training = json.load(prediction_training_file)
                                                if prediction_training.get("core", None) and prediction_training.get("core").get("prediction_type", None):
                                                    return prediction_training["core"]["prediction_type"]
        return None

    def add_all_metrics(self, obj, evaluated_recipe_type):
        if "REGRESSION" == evaluated_recipe_type:
            obj["metrics"] = ["evs", "mae", "mse", "mape", "rmse", "rmsle", "r2", "pearson", "customScore"]
        elif "BINARY_CLASSIFICATION" == evaluated_recipe_type:
            obj["metrics"] = ["precision", "recall", "auc", "f1", "accuracy", "mcc", "hammingLoss", "logLoss", "lift", "calibrationLoss", "customScore"]
        elif "MULTICLASS" == evaluated_recipe_type:
            obj["metrics"] = ["mrocAUC", "recall", "precision", "accuracy", "logLoss", "hammingLoss", "mcalibrationLoss", "customScore"]

    def add_all_prior_outputs(self, obj, evaluated_recipe_type):
        if "REGRESSION" == evaluated_recipe_type:
            obj["outputs"] = ["error", "error_decile", "abs_error_decile"]
        else:
            obj["outputs"] = ["prediction_correct"]

    def transform(self, obj, filepath=None):

        evaluated_recipe_type = self.get_evaluated_recipe_type(obj, filepath)
        filter_metrics = obj.get("filterMetrics", None)
        # no metrics filtering was defined. Let's add all metrics
        if not filter_metrics:
            self.add_all_metrics(obj, evaluated_recipe_type)
        else:
            del obj["filterMetrics"]

        self.add_all_prior_outputs(obj, evaluated_recipe_type)
        return obj

    def file_patterns(self,):
        return ["recipes/*.evaluation"]

###############################################################################
# V6020 / DSS 6.0.2
###############################################################################

class V6020FixArticleIdMigration(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Migrating article IDs to numeric IDs in dashboards"

    def execute(self, project_paths):
        # V6000UseNumericIdsForArticle was incomplete and didn't handle the links to articles
        # that can be found in insights and dashboards. So:
        # - build a mapping of old articleId -> new numericId by going over the articles' jsons
        # - apply the mapping to:
        #   * insights
        #   * reader authorizations
        # - change the V6000UseNumericIdsForArticle to handle dashboards too (actually by
        #   adding a V6000MigrateDashboardArticles step)

        article_id_old_to_new = {}
        article_id_new_to_old = {}
        for article_file in glob(osp.join(project_paths.config, "wiki", "articles", "*.json")):
            article = base.json_loadf(article_file)
            old_id = article.get("name", None)
            new_id = osp.basename(article_file)[:-5] # trim the .json extension
            if old_id is not None:
                article_id_old_to_new[old_id] = new_id
                article_id_new_to_old[new_id] = old_id

        def convert_id(article_id):
            if article_id in article_id_new_to_old:
                # id is already a new id, keep it (would go wrong if you used numeric names for articles pre-6.0. but then you're insane)
                return article_id
            else:
                return article_id_old_to_new.get(article_id, article_id) # keep article_id if it's already numeric

        for insight_file in glob(osp.join(project_paths.config, "insights", "*.json")):
            insight = base.json_loadf(insight_file)
            if insight.get('type', None) != "article":
                continue
            article_id = insight.get('params', {}).get('articleId', None)
            print('migrate article id %s in insight %s' % (article_id, insight_file))
            insight['params']['articleId'] = convert_id(article_id)
            base.json_dumpf(insight_file, insight)

        params_file = osp.join(project_paths.config, "params.json")
        params = base.json_loadf(params_file)
        for authorization in params.get('dashboardAuthorizations', {}).get('authorizations', []):
            object_ref = authorization.get('objectRef', {})
            if object_ref.get('objectType', None) != 'ARTICLE':
                continue
            print('migrate article %s in dashboard authorizations' % object_ref.get('objectId', ''))
            article_id = object_ref.get('objectId', '')
            object_ref['objectId'] = convert_id(article_id)
        base.json_dumpf(params_file, params)

###############################################################################
# V6030 / DSS 6.0.3
###############################################################################

class V6030FixMicrosoftTeamsIntegrationMigration(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self,):
        return "Migrating Microsoft Teams scenarios reporters"

    def execute(self, project_paths):
        # For Microsoft Teams reporters:
        # - rename 'url' into 'webhookUrl'
        # - rename 'payload' into 'message'
        for fp in glob(osp.join(project_paths.config, "scenarios", "*.json")):
            try:
                scenario_config = base.json_loadf(fp)
                scenario_config_modified = False
                for reporter in scenario_config.get("reporters", []):
                    messaging = reporter.get("messaging", None)
                    if messaging is not None:
                        type = messaging.get("type", None)
                        if type == "msft-teams-scenario":
                            configuration = messaging.get("configuration", None)
                            if configuration is not None:
                                webhookUrl = configuration.pop("url", None)
                                if webhookUrl is not None:
                                    configuration["webhookUrl"] = webhookUrl
                                message = configuration.pop("payload", None)
                                if message is not None:
                                    configuration["message"] = message
                                else:
                                    configuration["message"] = "${if(outcome == 'SUCCESS', '&#x2705;', '')}${if(outcome == 'FAILED', '&#x1F534;', '')}${if(outcome == 'WARNING', '&#x1F536;', '')}${if(outcome == '' || outcome == 'N/A', '&#x1F514;', '')} DSS Scenario [${scenarioName}](${scenarioRunURL}) triggered by ${triggerName}: **${outcome}**"
                                configuration["useGlobalChannel"] = False
                                scenario_config_modified = True
                if scenario_config_modified:
                    base.json_dumpf(fp, scenario_config)
            except:
                logging.exception("Unexpected error when trying to read: %s" % fp)

###############################################################################
# V7000 / DSS 7.0.0
###############################################################################

class V7000UserCredentialsRenaming(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Renaming connectionCredentials to credentials for each user"

    def execute(self, diphome):
        users_file = osp.join(diphome.path, "config/users.json")
        users_data = base.json_loadf(users_file)

        for user in users_data.get("users", []):
            if "connectionCredentials" in user:
                user["credentials"] = user.pop("connectionCredentials")

        print("Writing users file with renamed credentials field")
        base.json_dumpf(users_file, users_data)


class V7000ExpositionkInAPIDeployerInfras(migration_json.JsonMigrationOperation):
    def __repr__(self, ):
        return "Convert expositions in infras of API deployer"

    def transform(self, obj, filepath=None):
        exposition = obj.get("defaultServiceExposition", {})
        type_map = {'CLUSTER_IP':'cluster_ip', 'NODE_PORT':'node_port', 'LOAD_BALANCER':'load_balancer', 'INGRESS':'ingress'}
        obj["defaultServiceExposition"] = {
                                               'type':type_map.get(exposition.get('serviceType', ''), 'cluster_ip'),
                                               'params': {'port':exposition.get('port', -1)}
                                            }
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/api-deployer/infras/*.json"]

class V7000ExpositionkInAPIDeployerDeployments(migration_json.JsonMigrationOperation):
    def __repr__(self, ):
        return "Convert expositions in deployments of API deployer"

    def transform(self, obj, filepath=None):
        exposition = obj.get("serviceExposition", {})
        type_map = {'CLUSTER_IP':'cluster_ip', 'NODE_PORT':'node_port', 'LOAD_BALANCER':'load_balancer', 'INGRESS':'ingress'}
        obj["serviceExposition"] = {
                                               'type':type_map.get(exposition.get('serviceType', ''), 'cluster_ip'),
                                               'params': {'port':exposition.get('port', -1)}
                                            }
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/api-deployer/deployments/*.json"]

class V7000RemoveHipchatReporters(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self):
        return "Removing existing Hipchat Reporters"

    def transform(self, obj, filepath=None):
        if obj is not None:
            reporters = obj.get("reporters", [])
            obj["reporters"] = [reporter for reporter in reporters if not self.isHipchatReporter(reporter)]
        return obj

    def isHipchatReporter(self, reporter):
        messaging = reporter.get("messaging")
        return messaging is not None and messaging.get("type") == "hipchat-scenario"

    def file_patterns(self,):
        return ["scenarios/*.json"]


class V7000RemoveHipchatChannels(migration_json.JsonMigrationOperation):
    def __repr__(self):
        return "Removing existing Hipchat Channels"

    def transform(self, obj, filepath=None):
        if obj is not None:
            channels = obj.get("channels", [])
            obj["channels"] = [channel for channel in channels if channel.get('type', None) != 'hipchat']
        return obj

    def file_patterns(self,):
        return ["config/messaging-channels.json"]

class V7000RemoveHipchatIntegrations(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self):
        return "Removing existing Hipchat Integrations"

    def transform(self, obj, filepath=None):
        if obj is not None:
            integrations = obj.get("settings", {}).get("integrations", None)
            if integrations is not None:
                cleaned_integrations = []
                for integration in integrations.get("integrations", []):
                    if (integration.get('hook', {}).get('type', None) != 'hipchat-project'):
                        cleaned_integrations.append(integration)
                integrations["integrations"] = cleaned_integrations
        return obj

    def file_patterns(self,):
        return ["params.json"]

class V7000MigrateSamlSPConfig(migration_json.JsonMigrationOperation):
    def __repr__(self):
        return "Migrating SAML SP configuration"

    def transform(self, obj, filepath=None):
        ssoSettings = obj.get("ssoSettings")
        if ssoSettings and ssoSettings.get("enabled", False) and ssoSettings.get("protocol") == "SAML":
            if ssoSettings.get("samlSPMetadata") and not ssoSettings.get("samlSPParams"):
                import xml.etree.ElementTree as ET

                logging.info("Parsing SAML SP Metadata")
                spMeta = ET.fromstring(ssoSettings['samlSPMetadata'])
                if spMeta.tag != '{urn:oasis:names:tc:SAML:2.0:metadata}EntityDescriptor':
                    raise Exception("Invalid XML tag for SP metadata : %s" % spMeta.tag)

                entityID = spMeta.get('entityID')
                if not entityID:
                    raise Exception("entityID not found in SP metadata")
                logging.info("Found entityID = %s" % entityID)

                ns = { 'md' : 'urn:oasis:names:tc:SAML:2.0:metadata' }
                acs = spMeta.findall('./md:SPSSODescriptor/md:AssertionConsumerService', ns)
                if not acs:
                    raise Exception("AssertionConsumerService node not found in SP metadata")
                elif len(acs) > 1:
                    raise Exception("Multiple AssertionConsumerService nodes found in SP metadata - not supported")

                acsURL = acs[0].get('Location')
                if not acsURL:
                    raise Exception("ACS URL not found in SP metadata")
                logging.info("Found ACS URL = %s" % acsURL)

                del(ssoSettings['samlSPMetadata'])
                ssoSettings['samlSPParams'] = {
                    'entityId': entityID,
                    'acsURL': acsURL
                }
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]

class V7000MigrateAlgorithmsParamsStructure(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrating algorithms params structure"


    # Per dimension migration

    def migrate_numerical_params(self, algo_params, dimension):
        if not isinstance(algo_params, dict) or dimension not in algo_params.keys():
            return

        previous_values = algo_params.get(dimension, [])

        algo_params[dimension] = {
            "values": previous_values,
            "gridMode": "EXPLICIT"
        }

    # If no element of `boolean_fields` is found in the original model, we enable the first one
    def migrate_categorical_params(self, algo_params, dimension, boolean_fields):

        if not isinstance(algo_params, dict):
            return

        algo_params[dimension] = {
            "values": {}
        }

        all_fields_none = all(algo_params.get(field, None) is None for field in boolean_fields)

        for field in boolean_fields:
            algo_params[dimension]["values"][field] = {
                "enabled": algo_params.get(field, False)
            }
            if algo_params.get(field) is not None:
                del algo_params[field]
        
        if all_fields_none:
            for field, val in algo_params[dimension]["values"].items():
                if field == boolean_fields[0]:
                    val["enabled"] = True
                    break


    # List of all algorithms to migrate

    def migrate_tree_based(self, algo_params):
        self.migrate_numerical_params(algo_params, "n_estimators")
        self.migrate_numerical_params(algo_params, "max_tree_depth")
        self.migrate_numerical_params(algo_params, "min_samples_leaf")
        self.migrate_numerical_params(algo_params, "max_features")


    def migrate_gbt_classification(self, algo_params):
        self.migrate_numerical_params(algo_params, "n_estimators")
        self.migrate_numerical_params(algo_params, "max_depth")
        self.migrate_numerical_params(algo_params, "min_samples_leaf")
        self.migrate_numerical_params(algo_params, "max_features")
        self.migrate_numerical_params(algo_params, "learning_rate")
        self.migrate_categorical_params(algo_params, "loss", ["deviance", "exponential"])

    def migrate_gbt_regression(self, algo_params):
        self.migrate_numerical_params(algo_params, "n_estimators")
        self.migrate_numerical_params(algo_params, "max_depth")
        self.migrate_numerical_params(algo_params, "min_samples_leaf")
        self.migrate_numerical_params(algo_params, "max_features")
        self.migrate_numerical_params(algo_params, "learning_rate")
        self.migrate_categorical_params(algo_params, "loss", ["ls", "lad", "huber"])


    def migrate_decision_tree(self, algo_params):
        self.migrate_numerical_params(algo_params, "max_depth")
        self.migrate_numerical_params(algo_params, "min_samples_leaf")
        self.migrate_categorical_params(algo_params, "criterion", ["gini", "entropy"])
        self.migrate_categorical_params(algo_params, "splitter", ["best", "random"])


    def migrate_logistic_regression(self, algo_params):
        self.migrate_numerical_params(algo_params, "C")
        self.migrate_categorical_params(algo_params, "penalty", ["l2", "l1"])


    def migrate_neural_network(self, algo_params):
        self.migrate_numerical_params(algo_params, "layer_sizes")


    def migrate_svm(self, algo_params):
        self.migrate_numerical_params(algo_params, "C")
        self.migrate_numerical_params(algo_params, "gamma")
        self.migrate_categorical_params(algo_params, "kernel", ["rbf", "linear", "poly", "sigmoid"])

    def migrate_sgd_classif(self, algo_params):
        self.migrate_numerical_params(algo_params, "alpha")
        self.migrate_categorical_params(algo_params, "loss", ["log", "modified_huber"])
        self.migrate_categorical_params(algo_params, "penalty", ["l1", "l2", "elasticnet"])


    def migrate_sgd_regression(self, algo_params):
        self.migrate_numerical_params(algo_params, "epsilon")
        self.migrate_numerical_params(algo_params, "alpha")
        self.migrate_categorical_params(algo_params, "loss", ["squared_loss", "huber"])
        self.migrate_categorical_params(algo_params, "penalty", ["l1", "l2", "elasticnet"])


    def migrate_ridge_regression(self, algo_params):
        self.migrate_numerical_params(algo_params, "alpha")


    def migrate_lasso(self, algo_params):
        self.migrate_numerical_params(algo_params, "alpha")


    def migrate_knn(self, algo_params):
        self.migrate_numerical_params(algo_params, "k")


    def migrate_xgboost(self, algo_params):
        self.migrate_numerical_params(algo_params, "max_depth")
        self.migrate_numerical_params(algo_params, "learning_rate")
        self.migrate_numerical_params(algo_params, "gamma")
        self.migrate_numerical_params(algo_params, "min_child_weight")
        self.migrate_numerical_params(algo_params, "max_delta_step")
        self.migrate_numerical_params(algo_params, "subsample")
        self.migrate_numerical_params(algo_params, "colsample_bytree")
        self.migrate_numerical_params(algo_params, "colsample_bylevel")
        self.migrate_numerical_params(algo_params, "alpha")
        self.migrate_numerical_params(algo_params, "lambda")
        self.migrate_categorical_params(algo_params, "booster", ["gbtree", "dart"])
        self.migrate_categorical_params(algo_params, "objective", ["reg_linear", "reg_logistic", "reg_gamma", "binary_logistic", "multi_softprob"])


    def migrate_mllib_logit(self, algo_params):
        self.migrate_numerical_params(algo_params, "reg_param")
        self.migrate_numerical_params(algo_params, "enet_param")


    def migrate_mllib_decision_tree(self, algo_params):
        self.migrate_numerical_params(algo_params, "max_depth")


    def migrate_mllib_naive_bayes(self, algo_params):
        self.migrate_numerical_params(algo_params, "lambda")


    def migrate_mllib_linear_regression(self, algo_params):
        self.migrate_numerical_params(algo_params, "reg_param")
        self.migrate_numerical_params(algo_params, "enet_param")


    def migrate_mllib_random_forest(self, algo_params):
        self.migrate_numerical_params(algo_params, "max_depth")
        self.migrate_numerical_params(algo_params, "num_trees")
        self.migrate_numerical_params(algo_params, "step_size")


    def migrate_algo_params_in_mltask(self, mltask_data):

        # PY_MEMORY ALGOS
        modeling_params = mltask_data.get("modeling", {})
        self.migrate_tree_based(modeling_params.get("random_forest_regression", {}))
        self.migrate_tree_based(modeling_params.get("random_forest_classification", {}))
        self.migrate_tree_based(modeling_params.get("extra_trees", {}))
        self.migrate_gbt_classification(modeling_params.get("gbt_classification", {}))
        self.migrate_gbt_regression(modeling_params.get("gbt_regression", {}))
        self.migrate_decision_tree(modeling_params.get("decision_tree_classification", {}))
        self.migrate_decision_tree(modeling_params.get("decision_tree_regression", {}))
        self.migrate_ridge_regression(modeling_params.get("ridge_regression", {}))
        self.migrate_lasso(modeling_params.get("lasso_regression", {}))
        # no need to migrate "leastsquare_regression", no grid search params
        self.migrate_sgd_regression(modeling_params.get("sgd_regression", {}))
        self.migrate_knn(modeling_params.get("knn", {}))
        self.migrate_logistic_regression(modeling_params.get("logistic_regression", {}))
        self.migrate_neural_network(modeling_params.get("neural_network", {}))
        self.migrate_svm(modeling_params.get("svc_classifier", {}))
        self.migrate_svm(modeling_params.get("svm_regression", {}))
        self.migrate_sgd_classif(modeling_params.get("sgd_classifier", {}))
        # no need to migrate "lars_params", no grid search params
        self.migrate_xgboost(modeling_params.get("xgboost", {}))

        # MLlib ALGOS
        self.migrate_mllib_logit(modeling_params.get("mllib_logit", {}))
        self.migrate_mllib_naive_bayes(modeling_params.get("mllib_naive_bayes", {}))
        self.migrate_mllib_linear_regression(modeling_params.get("mllib_linreg", {}))
        self.migrate_mllib_random_forest(modeling_params.get("mllib_rf", {}))
        self.migrate_mllib_random_forest(modeling_params.get("mllib_gbt", {}))
        self.migrate_mllib_decision_tree(modeling_params.get("mllib_dt", {}))


    def migrate_algo_params_in_modeling(self, rmodeling_data):

        # PY_MEMORY ALGOS
        self.migrate_tree_based(rmodeling_data.get("rf_regressor_grid", {}))
        self.migrate_tree_based(rmodeling_data.get("rf_classifier_grid", {}))
        self.migrate_tree_based(rmodeling_data.get("extra_trees_grid", {}))
        self.migrate_gbt_classification(rmodeling_data.get("gbt_classifier_grid", {}))
        self.migrate_gbt_regression(rmodeling_data.get("gbt_regressor_grid", {}))
        self.migrate_decision_tree(rmodeling_data.get("dtc_classifier_grid", {}))
        self.migrate_logistic_regression(rmodeling_data.get("logit_grid", {}))
        self.migrate_neural_network(rmodeling_data.get("neural_network_grid", {}))
        self.migrate_svm(rmodeling_data.get("svc_grid", {}))
        self.migrate_svm(rmodeling_data.get("svr_grid", {}))
        # no need to migrate "least_squares_grid", no grid search params
        self.migrate_sgd_classif(rmodeling_data.get("sgd_grid", {}))
        self.migrate_sgd_regression(rmodeling_data.get("sgd_reg_grid", {}))
        self.migrate_ridge_regression(rmodeling_data.get("ridge_grid", {}))
        self.migrate_lasso(rmodeling_data.get("lasso_grid", {}))
        # no need to migrate "lars_grid", no grid search params
        self.migrate_knn(rmodeling_data.get("knn_grid", {}))
        self.migrate_xgboost(rmodeling_data.get("xgboost_grid", {}))

        # MLlib ALGOS
        self.migrate_mllib_logit(rmodeling_data.get("mllib_logit_grid", {}))
        self.migrate_mllib_decision_tree(rmodeling_data.get("mllib_dt_grid", {}))
        self.migrate_mllib_naive_bayes(rmodeling_data.get("mllib_naive_bayes_grid", {}))
        self.migrate_mllib_linear_regression(rmodeling_data.get("mllib_linreg_grid", {}))
        self.migrate_mllib_random_forest(rmodeling_data.get("mllib_rf_grid", {}))
        self.migrate_mllib_random_forest(rmodeling_data.get("mllib_gbt_grid", {}))

        # Ensemble ALGOS
        for origin_model_mp in rmodeling_data.get("ensemble_params", {}).get("modeling_params", []):
            self.migrate_algo_params_in_modeling(origin_model_mp)


    def execute(self, project_paths):

        # config/projects/PROJECT_KEY/analysis/a7QE8ig7/ml/ecsqyuFW/params.json
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/mltask.json
        for mltask_file in (glob("%s/analysis/*/ml/*/params.json" % project_paths.config) \
                          + glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data)):
            print("Migrating algorithms params in MLTask: %s" % mltask_file)
            try:
                mltask_data = base.json_loadf(mltask_file)
                self.migrate_algo_params_in_mltask(mltask_data)
                base.json_dumpf(mltask_file, mltask_data)
            except Exception as e:
                print("Algo params in mltask migration FAILED: %s" % e)

        # config/projects/PROJECT_KEY/recipes/*.prediction_training
        for train_recipe_params_file in glob("%s/recipes/*.prediction_training" % project_paths.config):
            print("Migrating algorithms params in training recipe: %s " % train_recipe_params_file)
            try:
                train_recipe_data = base.json_loadf(train_recipe_params_file)
                self.migrate_algo_params_in_modeling(train_recipe_data.get("modeling", {}))
                base.json_dumpf(train_recipe_params_file, train_recipe_data)
            except Exception as e:
                print("Algo params in train recipe migration FAILED: %s" % e)

        # saved_models/PROJECT_KEY/58ipAuN7/versions/1573723995773/rmodeling_params.json (regular models, partitioned base models)
        # saved_models/PROJECT_KEY/58ipAuN7/pversions/female/v1/rmodeling_params.json (model partitions)
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/rmodeling_params.json
        for rm_file in (glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models) \
                      + glob("%s/*/pversions/*/*/rmodeling_params.json" % project_paths.saved_models) \
                      + glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data)):
            print("Migrating algorithms params in rmodeling file: %s " % rm_file)
            try:
                rmodeling_data = base.json_loadf(rm_file)
                self.migrate_algo_params_in_modeling(rmodeling_data)
                base.json_dumpf(rm_file, rmodeling_data)
            except Exception as e:
                print("Algo params in trained model rmodeling migration FAILED: %s" % e)

        # config/PROJECT_KEY/saved_models/58ipAuN7*.json
        for saved_model_file in (glob("%s/saved_models/*.json" % project_paths.config)):
            print("Migrating algorithms params in saved model miniTask: %s " % saved_model_file)
            try:
                sm_data = base.json_loadf(saved_model_file)
                self.migrate_algo_params_in_mltask(sm_data.get("miniTask", {}))
                base.json_dumpf(saved_model_file, sm_data)
            except Exception as e:
                print("Algo params in saved model miniTask migration FAILED: %s" % e)


class V7000MigratePosttrainComputationParams(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrating posttrain computation params"
    
    def migrate_pdp_params(self, iperf_file):
        iperf_data = base.json_loadf(iperf_file)
        for pdp_result in iperf_data.get("partialDependencies", []):
            if isinstance(pdp_result, dict) and "onFullTestSet" in pdp_result.keys():
                pdp_result["onSample"] = not pdp_result["onFullTestSet"]
                del pdp_result["onFullTestSet"]
        base.json_dumpf(iperf_file, iperf_data)

    def migrate_subpopulation_params(self, modality_file):
        modality_data = base.json_loadf(modality_file)
        if isinstance(modality_data, dict):
            if "totalRows" in modality_data.keys():
                modality_data["nbRecords"] = modality_data["totalRows"]
                del modality_data["totalRows"]

            if "weightedTotalRows" in modality_data.keys():
                modality_data["weightedNbRecords"] = modality_data["weightedTotalRows"]
                del modality_data["weightedTotalRows"]

        base.json_dumpf(modality_file, modality_data)

    def execute(self, project_paths):

        # saved_models/PROJECT_KEY/58ipAuN7/versions/1573723995773/iperf.json (regular models, partitioned base models)
        # saved_models/PROJECT_KEY/58ipAuN7/pversions/female/v1/iperf.json (model partitions)
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/iperf.json
        for iperf_file in (glob("%s/*/versions/*/iperf.json" % project_paths.saved_models) \
                         + glob("%s/*/pversions/*/*/iperf.json" % project_paths.saved_models) \
                         + glob("%s/*/*/sessions/*/*/*/iperf.json" % project_paths.analysis_data)):
            try:
                print("Migrating partial dependencies params in iperf file: %s" % iperf_file)
                self.migrate_pdp_params(iperf_file)
            except Exception as e:
                print("Migration of partial dependencies params failed: %s" % e)

        # saved_models/PROJECT_KEY/58ipAuN7/versions/1573723995773/posttrain/subpop-8da8b33a3b6a367b885b54caf27703b7/modality.json (regular models)
        # saved_models/PROJECT_KEY/58ipAuN7/pversions/female/v1/posttrain/subpop-8da8b33a3b6a367b885b54caf27703b7/modality.json (model partitions)
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/posttrain/subpop-8da8b33a3b6a367b885b54caf27703b7/modality.json
        for modality_file in (glob("%s/*/versions/*/posttrain/*/modality.json" % project_paths.saved_models) \
                      + glob("%s/*/pversions/*/*/posttrain/*/modality.json" % project_paths.saved_models) \
                      + glob("%s/*/*/sessions/*/*/*/posttrain/*/modality.json" % project_paths.analysis_data)):
            print("Migrating subpopulation params in modality file: %s" % modality_file)
            try:
                self.migrate_subpopulation_params(modality_file)
            except Exception as e:
                print("Migration of subpopulation params failed: %s" % e)


class V7020MigrateExplanationsScoringRecipeParams(migration_json.ProjectConfigJsonMigrationOperation):

    def __init__(self):
        pass

    def __repr__(self, ):
        return "Migrate scoring recipe explanation params"

    def transform(self, obj, filepath=None):
        if isinstance(obj, dict):
            explanation_params = obj.get("individualExplanationParams", None)
            if explanation_params is not None and explanation_params.get("drawInScoredSet") is None:
                explanation_params["drawInScoredSet"] = True
        return obj

    def jsonpath(self):
        return ""

    def file_patterns(self, ):
        return ["recipes/*.prediction_scoring"]



###############################################################################
# V8000 / DSS 8.0.0
###############################################################################


class V8000MigrateAlgorithmsSVMParamsStructure(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrating SVM algorithms params structure"

    def migrate_svm(self, algo_params):

        if not isinstance(algo_params, dict):
            return

        if "custom_gamma" in algo_params:  # already migrated, not doing it again
            return

        auto_gamma = False
        custom_gamma = False
        custom_gamma_values = []
        for prev_gamma in algo_params.get("gamma", {}).get("values", []):
            if prev_gamma <= 0:
                auto_gamma = True
            else:
                custom_gamma = True
                custom_gamma_values.append(prev_gamma)

        gamma_cat_params = {
            "scale": {"enabled": False},
            "auto": {"enabled": auto_gamma},
            "custom": {"enabled": custom_gamma}
        }

        algo_params["gamma"] = {
            "values": gamma_cat_params
        }

        if not custom_gamma:  # putting default value if no other values
            custom_gamma_values = [0.001]

        algo_params["custom_gamma"] = {
            "values": custom_gamma_values,
            "gridMode": "EXPLICIT"
        }


    def migrate_algo_params_in_mltask(self, mltask_data):
        modeling_params = mltask_data.get("modeling", {})
        self.migrate_svm(modeling_params.get("svc_classifier"))
        self.migrate_svm(modeling_params.get("svm_regression"))

    def migrate_algo_params_in_modeling(self, rmodeling_data):
        self.migrate_svm(rmodeling_data.get("svc_grid"))
        self.migrate_svm(rmodeling_data.get("svr_grid"))

        # Ensemble ALGOS
        for origin_model_mp in rmodeling_data.get("ensemble_params", {}).get("modeling_params", []):
            self.migrate_algo_params_in_modeling(origin_model_mp)

    def migrate_actual_params(self, actual_params):
        if not isinstance(actual_params, dict) \
            or actual_params.get("resolved", {}).get("algorithm") not in ["SVC_CLASSIFICATION", "SVM_REGRESSION"] \
            or "svm" not in actual_params.get("resolved", {}):
            return

        svm_params = actual_params["resolved"]["svm"]
        gamma = svm_params.get("gamma", 0.0)  # should always be there, putting default value just in case

        if gamma in ["auto", "custom"]: # already migrated, not doing it again
            return

        if gamma <= 0:
            svm_params["gamma"] = "auto"
        else:
            svm_params["gamma"] = "custom"
            svm_params["custom_gamma"] = gamma


    def execute(self, project_paths):

        # config/projects/PROJECT_KEY/analysis/a7QE8ig7/ml/ecsqyuFW/params.json
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/mltask.json
        for mltask_file in (glob("%s/analysis/*/ml/*/params.json" % project_paths.config) \
                          + glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data)):
            print("Migrating algorithms params in MLTask: %s" % mltask_file)
            try:
                mltask_data = base.json_loadf(mltask_file)
                self.migrate_algo_params_in_mltask(mltask_data)
                base.json_dumpf(mltask_file, mltask_data)
            except Exception as e:
                print("Algo params in mltask migration FAILED: %s" % e)

        # config/projects/PROJECT_KEY/recipes/*.prediction_training
        for train_recipe_params_file in glob("%s/recipes/*.prediction_training" % project_paths.config):
            print("Migrating algorithms params in training recipe: %s " % train_recipe_params_file)
            try:
                train_recipe_data = base.json_loadf(train_recipe_params_file)
                self.migrate_algo_params_in_modeling(train_recipe_data.get("modeling", {}))
                base.json_dumpf(train_recipe_params_file, train_recipe_data)
            except Exception as e:
                print("Algo params in train recipe migration FAILED: %s" % e)

        # saved_models/PROJECT_KEY/58ipAuN7/versions/1573723995773/rmodeling_params.json (regular models, partitioned base models)
        # saved_models/PROJECT_KEY/58ipAuN7/pversions/female/v1/rmodeling_params.json (model partitions)
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/rmodeling_params.json
        for rm_file in (glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models) \
                      + glob("%s/*/pversions/*/*/rmodeling_params.json" % project_paths.saved_models) \
                      + glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data)):
            print("Migrating algorithms params in rmodeling file: %s " % rm_file)
            try:
                rmodeling_data = base.json_loadf(rm_file)
                self.migrate_algo_params_in_modeling(rmodeling_data)
                base.json_dumpf(rm_file, rmodeling_data)
            except Exception as e:
                print("Algo params in trained model rmodeling migration FAILED: %s" % e)

        # config/PROJECT_KEY/saved_models/58ipAuN7*.json
        for saved_model_file in (glob("%s/saved_models/*.json" % project_paths.config)):
            print("Migrating algorithms params in saved model miniTask: %s " % saved_model_file)
            try:
                sm_data = base.json_loadf(saved_model_file)
                self.migrate_algo_params_in_mltask(sm_data.get("miniTask", {}))
                base.json_dumpf(saved_model_file, sm_data)
            except Exception as e:
                print("Algo params in saved model miniTask migration FAILED: %s" % e)

        # saved_models/PROJECT_KEY/58ipAuN7/versions/1573723995773/actual_params.json (regular models, partitioned base models)
        # saved_models/PROJECT_KEY/58ipAuN7/pversions/female/v1/actual_params.json (model partitions)
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/actual_params.json
        for ap_file in (glob("%s/*/versions/*/actual_params.json" % project_paths.saved_models) \
                      + glob("%s/*/pversions/*/*/actual_params.json" % project_paths.saved_models) \
                      + glob("%s/*/*/sessions/*/*/*/actual_params.json" % project_paths.analysis_data)):
            print("Migrating algorithms params in actual params file: %s " % ap_file)
            try:
                actual_params = base.json_loadf(ap_file)
                self.migrate_actual_params(actual_params)
                base.json_dumpf(ap_file, actual_params)
            except Exception as e:
                print("Algo params in trained model actual params migration FAILED: %s" % e)


class V8000MigratePredictionAlgorithmsRanges(V7000MigrateAlgorithmsParamsStructure):

    min_positive = 1e-23

    def __repr__(self):
        return "Migrating prediction algorithms params structure to add range"

    # Per dimension migration
    def migrate_numerical_params(self, algo_params, dimension, limit_min=None, limit_max=None, range_min=None, range_max=None, scaling="LINEAR"):
        if not isinstance(algo_params, dict) or dimension not in algo_params.keys():
            return

        algo_params[dimension]["randomMode"] = "RANGE"
        algo_params[dimension]["range"] = {"min": range_min, "max": range_max, "scaling": scaling, "nbValues": 3}
        algo_params[dimension]["limit"] = {"min": limit_min, "max": limit_max}

    # List of all algorithms to migrate
    def migrate_rf(self, algo_params):
        self.migrate_numerical_params(algo_params, "n_estimators", limit_min=1, limit_max=None, range_min=80, range_max=200, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "max_tree_depth", limit_min=1, limit_max=None, range_min=5, range_max=10, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "min_samples_leaf", limit_min=1, limit_max=None, range_min=3, range_max=20, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "max_features", limit_min=1, limit_max=None, range_min=1, range_max=20, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "max_feature_prop", limit_min=self.min_positive, limit_max=1, range_min=0.1, range_max=0.7, scaling="LINEAR")

    def migrate_extra_trees(self, algo_params):
        self.migrate_rf(algo_params)
        self.migrate_numerical_params(algo_params, "n_estimators", limit_min=1, limit_max=None, range_min=10, range_max=50, scaling="LINEAR")

    def migrate_gbt(self, algo_params):
        self.migrate_numerical_params(algo_params, "n_estimators", limit_min=1, limit_max=None, range_min=80, range_max=200, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "max_depth", limit_min=1, limit_max=None, range_min=3, range_max=8, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "min_samples_leaf", limit_min=1, limit_max=None, range_min=1, range_max=20, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "max_features", limit_min=1, limit_max=None, range_min=1, range_max=20, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "max_feature_prop", limit_min=self.min_positive, limit_max=1, range_min=0.1, range_max=0.7, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "learning_rate", limit_min=self.min_positive, limit_max=1., range_min=0.05, range_max=0.5, scaling="LINEAR")

    def migrate_decision_tree(self, algo_params):
        self.migrate_numerical_params(algo_params, "max_depth", limit_min=1, limit_max=None, range_min=3, range_max=8, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "min_samples_leaf", limit_min=1, limit_max=None, range_min=1, range_max=20, scaling="LINEAR")

    def migrate_logistic_regression(self, algo_params):
        self.migrate_numerical_params(algo_params, "C", limit_min=self.min_positive, limit_max=None, range_min=0.01, range_max=100., scaling="LOGARITHMIC")

    def migrate_neural_network(self, algo_params):
        self.migrate_numerical_params(algo_params, "layer_sizes", limit_min=1, limit_max=None, range_min=8, range_max=16, scaling="LINEAR")

    def migrate_svm(self, algo_params):
        self.migrate_numerical_params(algo_params, "C", limit_min=self.min_positive, limit_max=None, range_min=0.1, range_max=10., scaling="LOGARITHMIC")
        self.migrate_numerical_params(algo_params, "custom_gamma", limit_min=self.min_positive, limit_max=None, range_min=0.0001, range_max=1., scaling="LOGARITHMIC")

    def migrate_sgd_classif(self, algo_params):
        self.migrate_numerical_params(algo_params, "alpha", limit_min=self.min_positive, limit_max=None, range_min=0.00001, range_max=0.001, scaling="LOGARITHMIC")

    def migrate_sgd_regression(self, algo_params):
        self.migrate_numerical_params(algo_params, "epsilon", limit_min=self.min_positive, limit_max=None, range_min=0.01, range_max=0.1, scaling="LOGARITHMIC")
        self.migrate_numerical_params(algo_params, "alpha", limit_min=self.min_positive, limit_max=None, range_min=0.00001, range_max=0.001, scaling="LOGARITHMIC")

    def migrate_ridge_regression(self, algo_params):
        self.migrate_numerical_params(algo_params, "alpha", limit_min=self.min_positive, limit_max=None, range_min=0.1, range_max=3., scaling="LOGARITHMIC")

    def migrate_lasso(self, algo_params):
        self.migrate_numerical_params(algo_params, "alpha", limit_min=self.min_positive, limit_max=None, range_min=0.1, range_max=10., scaling="LOGARITHMIC")

    def migrate_knn(self, algo_params):
        self.migrate_numerical_params(algo_params, "k", limit_min=1, limit_max=None, range_min=3, range_max=7, scaling="LINEAR")

    def migrate_xgboost(self, algo_params):
        self.migrate_numerical_params(algo_params, "max_depth", limit_min=1, limit_max=None, range_min=2, range_max=5, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "learning_rate", limit_min=self.min_positive, limit_max=1., range_min=0.1, range_max=0.5, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "gamma", limit_min=0., limit_max=None, range_min=0., range_max=1., scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "min_child_weight", limit_min=0., limit_max=None, range_min=0., range_max=1., scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "max_delta_step", limit_min=0., limit_max=None, range_min=0., range_max=1., scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "subsample", limit_min=self.min_positive, limit_max=1., range_min=0.5, range_max=1., scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "colsample_bytree", limit_min=self.min_positive, limit_max=1., range_min=0.5, range_max=1., scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "colsample_bylevel", limit_min=self.min_positive, limit_max=1., range_min=0.5, range_max=1., scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "alpha", limit_min=0., limit_max=1., range_min=0., range_max=0.1, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "lambda", limit_min=self.min_positive, limit_max=1., range_min=0.5, range_max=1., scaling="LINEAR")

    def migrate_mllib_linear(self, algo_params):
        self.migrate_numerical_params(algo_params, "reg_param", limit_min=0., limit_max=None, range_min=0.001, range_max=10, scaling="LOGARITHMIC")
        self.migrate_numerical_params(algo_params, "enet_param", limit_min=0., limit_max=None, range_min=0., range_max=1., scaling="LINEAR")

    def migrate_mllib_naive_bayes(self, algo_params):
        self.migrate_numerical_params(algo_params, "lambda", limit_min=self.min_positive, limit_max=None, range_min=0.1, range_max=10., scaling="LOGARITHMIC")

    def migrate_mllib_decision_tree(self, algo_params):
        self.migrate_numerical_params(algo_params, "max_depth", limit_min=1, limit_max=None, range_min=3, range_max=8, scaling="LINEAR")

    def migrate_mllib_random_forest(self, algo_params):
        self.migrate_numerical_params(algo_params, "max_depth", limit_min=1, limit_max=None, range_min=3, range_max=8, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "num_trees", limit_min=1, limit_max=None, range_min=10, range_max=50, scaling="LINEAR")
        self.migrate_numerical_params(algo_params, "step_size", limit_min=self.min_positive, limit_max=1, range_min=0.05, range_max=0.5, scaling="LINEAR")

    def migrate_algo_params_in_mltask(self, mltask_data):
        # PY_MEMORY ALGOS
        modeling_params = mltask_data.get("modeling", {})
        self.migrate_rf(modeling_params.get("random_forest_regression", {}))
        self.migrate_rf(modeling_params.get("random_forest_classification", {}))
        self.migrate_extra_trees(modeling_params.get("extra_trees", {}))
        self.migrate_gbt(modeling_params.get("gbt_classification", {}))
        self.migrate_gbt(modeling_params.get("gbt_regression", {}))

        self.migrate_decision_tree(modeling_params.get("decision_tree_classification", {}))
        self.migrate_decision_tree(modeling_params.get("decision_tree_regression", {}))
        self.migrate_ridge_regression(modeling_params.get("ridge_regression", {}))
        self.migrate_lasso(modeling_params.get("lasso_regression", {}))
        # no need to migrate "leastsquare_regression", no grid search params
        self.migrate_sgd_regression(modeling_params.get("sgd_regression", {}))
        self.migrate_knn(modeling_params.get("knn", {}))
        self.migrate_logistic_regression(modeling_params.get("logistic_regression", {}))
        self.migrate_neural_network(modeling_params.get("neural_network", {}))
        self.migrate_svm(modeling_params.get("svc_classifier", {}))
        self.migrate_svm(modeling_params.get("svm_regression", {}))
        self.migrate_sgd_classif(modeling_params.get("sgd_classifier", {}))
        # no need to migrate "lars_params", no grid search params
        self.migrate_xgboost(modeling_params.get("xgboost", {}))

        # MLlib ALGOS
        self.migrate_mllib_naive_bayes(modeling_params.get("mllib_naive_bayes", {}))
        self.migrate_mllib_linear(modeling_params.get("mllib_logit", {}))
        self.migrate_mllib_linear(modeling_params.get("mllib_linreg", {}))
        self.migrate_mllib_random_forest(modeling_params.get("mllib_rf", {}))
        self.migrate_mllib_random_forest(modeling_params.get("mllib_gbt", {}))
        self.migrate_mllib_decision_tree(modeling_params.get("mllib_dt", {}))


    def migrate_algo_params_in_modeling(self, rmodeling_data):
        # PY_MEMORY ALGOS
        self.migrate_rf(rmodeling_data.get("rf_regressor_grid", {}))
        self.migrate_rf(rmodeling_data.get("rf_classifier_grid", {}))
        self.migrate_extra_trees(rmodeling_data.get("extra_trees_grid", {}))
        self.migrate_gbt(rmodeling_data.get("gbt_classifier_grid", {}))
        self.migrate_gbt(rmodeling_data.get("gbt_regressor_grid", {}))
        self.migrate_decision_tree(rmodeling_data.get("dtc_classifier_grid", {}))
        self.migrate_logistic_regression(rmodeling_data.get("logit_grid", {}))
        self.migrate_neural_network(rmodeling_data.get("neural_network_grid", {}))
        self.migrate_svm(rmodeling_data.get("svc_grid", {}))
        self.migrate_svm(rmodeling_data.get("svr_grid", {}))
        # no need to migrate "least_squares_grid", no grid search params
        self.migrate_sgd_classif(rmodeling_data.get("sgd_grid", {}))
        self.migrate_sgd_regression(rmodeling_data.get("sgd_reg_grid", {}))
        self.migrate_ridge_regression(rmodeling_data.get("ridge_grid", {}))
        self.migrate_lasso(rmodeling_data.get("lasso_grid", {}))
        # no need to migrate "lars_grid", no grid search params
        self.migrate_knn(rmodeling_data.get("knn_grid", {}))
        self.migrate_xgboost(rmodeling_data.get("xgboost_grid", {}))

        # MLlib ALGOS
        self.migrate_mllib_naive_bayes(rmodeling_data.get("mllib_naive_bayes_grid", {}))
        self.migrate_mllib_linear(rmodeling_data.get("mllib_logit_grid", {}))
        self.migrate_mllib_linear(rmodeling_data.get("mllib_linreg_grid", {}))
        self.migrate_mllib_decision_tree(rmodeling_data.get("mllib_dt_grid", {}))
        self.migrate_mllib_random_forest(rmodeling_data.get("mllib_rf_grid", {}))
        self.migrate_mllib_random_forest(rmodeling_data.get("mllib_gbt_grid", {}))

        # Ensemble ALGOS
        for origin_model_mp in rmodeling_data.get("ensemble_params", {}).get("modeling_params", []):
            self.migrate_algo_params_in_modeling(origin_model_mp)


class V8000MigrateAuditConfig(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Initialize audit settings"

    def transform(self, general_settings, filepath=None):
        general_settings["auditTrailSettings"] = {
            "targets": [
                {
                    "type": "LOG4J",
                    "appendTopicToLogger": True,
                    "topicsFiltering": "ALL",
                    "routingKeysFiltering": "ALL",
                }
            ]
        }
        return general_settings

    def file_patterns(self,):
        return ["config/general-settings.json"]


class V8000MigrateAuditConfigAPINode(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Initialize audit settings (API node)"

    def appliesTo(self):
        return [ "api" ]

    def transform(self, server_config, filepath=None):
        audit_log = server_config.get("auditLog", {})
        audit_log["settings"] = {
            "targets": [
                {
                    "type": "LOG4J",
                    "appendTopicToLogger": True,
                    "topicsFiltering": "ALL",
                    "routingKeysFiltering": "ALL",
                }
            ]
        }
        server_config["auditLog"] = audit_log
        return server_config

    def file_patterns(self,):
        return ["config/server.json"]


class V8000MigrateGridLengthForNonSearchableAlgos(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrating grid length for non-searchable algos"

    def migrate_grid_length(self, rmodeling_file):
        rmodeling_data = base.json_loadf(rmodeling_file)
        # setting gridLength to 1 for both:
        # * missing gridLength (should not happen, maybe for very old models)
        # * previous gridLength == 0
        # which represent cases where no grid search has been performed
        if rmodeling_data.get("gridLength", 0) == 0:
            rmodeling_data["gridLength"] = 1
        base.json_dumpf(rmodeling_file, rmodeling_data)

    def execute(self, project_paths):

        # saved_models/PROJECT_KEY/58ipAuN7/versions/1573723995773/rmodeling_params.json (regular models, partitioned base models)
        # saved_models/PROJECT_KEY/58ipAuN7/pversions/female/v1/rmodeling_params.json (model partitions)
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/rmodeling_params.json (regular models, partitioned base models)
        for rmodeling_file in (glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models) \
                         + glob("%s/*/pversions/*/*/rmodeling_params.json" % project_paths.saved_models) \
                         + glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data)):
            try:
                print("Migrating grid length in rmodeling_params file: %s" % rmodeling_file)
                self.migrate_grid_length(rmodeling_file)
            except Exception as e:
                print("Migration of grid length failed: %s" % e)


class V8000MigrateMaxFeaturePropStructure(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrating structure of 'proportion of features to sample'"

    def migrate_max_feature_prop(self, algo_params):
        dimension = "max_feature_prop"
        if not isinstance(algo_params, dict) or dimension not in algo_params.keys():
            return

        previous_values = algo_params[dimension]
        if isinstance(previous_values, dict):
            return

        algo_params[dimension] = {
            "values": [previous_values],
            "gridMode": "EXPLICIT"
        }

    # List of all algorithms to migrate
    def migrate_algo_params_in_mltask(self, mltask_data):
        # PY_MEMORY ALGOS
        modeling_params = mltask_data.get("modeling", {})
        self.migrate_max_feature_prop(modeling_params.get("random_forest_regression", {}))
        self.migrate_max_feature_prop(modeling_params.get("random_forest_classification", {}))
        self.migrate_max_feature_prop(modeling_params.get("extra_trees", {}))
        self.migrate_max_feature_prop(modeling_params.get("gbt_classification", {}))
        self.migrate_max_feature_prop(modeling_params.get("gbt_regression", {}))

    def migrate_algo_params_in_modeling(self, rmodeling_data):
        # PY_MEMORY ALGOS
        self.migrate_max_feature_prop(rmodeling_data.get("rf_regressor_grid", {}))
        self.migrate_max_feature_prop(rmodeling_data.get("rf_classifier_grid", {}))
        self.migrate_max_feature_prop(rmodeling_data.get("extra_trees_grid", {}))
        self.migrate_max_feature_prop(rmodeling_data.get("gbt_classifier_grid", {}))
        self.migrate_max_feature_prop(rmodeling_data.get("gbt_regressor_grid", {}))

        # Ensemble ALGOS
        for origin_model_mp in rmodeling_data.get("ensemble_params", {}).get("modeling_params", []):
            self.migrate_algo_params_in_modeling(origin_model_mp)

    def execute(self, project_paths):
        for mltask_file in (glob("%s/analysis/*/ml/*/params.json" % project_paths.config)
                            + glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data)):
            print("Migrating structure of 'proportion of features to sample' in MLTask: %s" % mltask_file)
            try:
                mltask_data = base.json_loadf(mltask_file)
                self.migrate_algo_params_in_mltask(mltask_data)
                base.json_dumpf(mltask_file, mltask_data)
            except Exception as e:
                print("Structure of 'proportion of features to sample' in mltask migration FAILED: %s" % e)

        for train_recipe_params_file in glob("%s/recipes/*.prediction_training" % project_paths.config):
            print("Migrating structure of 'proportion of features to sample' in training recipe: %s "
                  % train_recipe_params_file)
            try:
                train_recipe_data = base.json_loadf(train_recipe_params_file)
                self.migrate_algo_params_in_modeling(train_recipe_data.get("modeling", {}))
                base.json_dumpf(train_recipe_params_file, train_recipe_data)
            except Exception as e:
                print("Structure of 'proportion of features to sample' in train recipe migration FAILED: %s" % e)

        for rm_file in (glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models)
                        + glob("%s/*/pversions/*/*/rmodeling_params.json" % project_paths.saved_models)
                        + glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data)):
            print("Migrating structure of 'proportion of features to sample' in rmodeling file: %s " % rm_file)
            try:
                rmodeling_data = base.json_loadf(rm_file)
                self.migrate_algo_params_in_modeling(rmodeling_data)
                base.json_dumpf(rm_file, rmodeling_data)
            except Exception as e:
                print("Structure of 'proportion of features to sample' in trained model rmodeling migration FAILED: %s"
                      % e)

        for saved_model_file in (glob("%s/saved_models/*.json" % project_paths.config)):
            print("Migrating structure of 'proportion of features to sample' in saved model miniTask: %s "
                  % saved_model_file)
            try:
                sm_data = base.json_loadf(saved_model_file)
                self.migrate_algo_params_in_mltask(sm_data.get("miniTask", {}))
                base.json_dumpf(saved_model_file, sm_data)
            except Exception as e:
                print("Structure of 'proportion of features to sample' in saved model miniTask migration FAILED: %s"
                      % e)


class V8000MigrateCodeEnvSelection(migration_json.ProjectConfigJsonMigrationOperation):

    def __init__(self):
        pass

    def __repr__(self, ):
        return "Migrate code env selection"

    def transform(self, obj, filepath=None):
        cd = obj.get("settings", {}).get("codeEnvs", {})

        def migrate_lang(lang):
            if lang.get("useBuiltinEnv", True):
                lang["mode"] = "INHERIT"
            else:
                lang["mode"] = "EXPLICIT_ENV"

        migrate_lang(cd.get("python", {}))
        migrate_lang(cd.get("r", {}))
        migrate_lang(cd.get("julia", {}))
        return obj

    def jsonpath(self):
        return ""

    def file_patterns(self, ):
        return ["params.json"]

class V8020MigrateTreeBasedMLResults(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrating tree visualisations to take into account difference between class and sample weights"

    def update_tree(self, tree_data, weighting_strategy):

        if tree_data is None or tree_data == {}:
            print("Failed to update tree visualization: empty tree data")
            return

        if weighting_strategy == "NO_WEIGHTING":
            # nSamples is the unweighted count of samples, nothing to do
            pass
        elif weighting_strategy == "SAMPLE_WEIGHT":
            # nSamples is the weighted count of samples, need to delete nSamples and add the nSamplesWeighted field
            if "nSamples" in tree_data:
                tree_data["nSamplesWeighted"] = tree_data["nSamples"]
                del tree_data["nSamples"]
        elif weighting_strategy == "CLASS_WEIGHT":
            # nSamples is the weighted count of samples, which is corrupted by class weights
            # Cannot compute the proper nSamples exactly so encourage the user to retrain
            tree_data["warningMessage"] = "Tree samples count may be invalid due to target class weighting." \
                                          "Please retrain this model to update the visualization."
        elif weighting_strategy == "CLASS_AND_SAMPLE_WEIGHT":
            # nSamples is the weighted count of samples, which is corrupted by class weights
            # Cannot compute the proper nSamples and nSamplesWeighted so encourage the user to retrain
            tree_data["warningMessage"] = "Tree samples count may be invalid due to interaction between target class " \
                                          "and sample weighting. Please retrain this model to update the visualization."
        else:
            print("Failed to update tree visualization: unknown weighting strategy \"%s\"" % weighting_strategy)

    def migrate_tree_viz(self, tree_viz, weighting_strategy):

        if "tree" in tree_viz:
            # Decision tree
            tree = tree_viz["tree"]
            self.update_tree(tree, weighting_strategy)
        elif "trees" in tree_viz:
            # RF, ET or GBT
            trees = tree_viz["trees"]
            for tree in trees:
                self.update_tree(tree, weighting_strategy)
        else:
            print("Failed to update tree visualization: data has no \"tree\" nor \"trees\" field")


    def execute(self, project_paths):
        for tree_file in (glob("%s/*/*/sessions/*/*/*/tree.json" % project_paths.analysis_data) \
                          + glob("%s/*/*/sessions/*/*/*/trees.json" % project_paths.analysis_data)):
            print("Attempting migration of file %s" % tree_file)
            try:
                tree_data = base.json_loadf(tree_file)
                core_params_file = osp.join(osp.dirname(tree_file), "..", "..", "core_params.json")
                if osp.isfile(core_params_file):
                    core_params_data = base.json_loadf(core_params_file)
                    if "weight" in core_params_data and "weightMethod" in core_params_data["weight"]:
                        weighting_strategy = core_params_data["weight"]["weightMethod"]
                        self.migrate_tree_viz(tree_data, weighting_strategy)
                        base.json_dumpf(tree_file, tree_data)
            except Exception as e:
                print("Failed to migrate tree visualization -- Error : %s" % str(e))

        for tree_file in (glob("%s/*/versions/*/tree.json" % project_paths.saved_models) \
                          + glob("%s/*/versions/*/trees.json" % project_paths.saved_models) \
                          + glob("%s/*/pversions/*/*/tree.json" % project_paths.saved_models) \
                          + glob("%s/*/pversions/*/*/trees.json" % project_paths.saved_models)):
            print("Attempting migration of file %s" % tree_file)
            try:
                tree_data = base.json_loadf(tree_file)
                core_params_file = os.path.join(os.path.dirname(tree_file), "core_params.json")
                if osp.isfile(core_params_file):
                    core_params_data = base.json_loadf(core_params_file)
                    if "weight" in core_params_data and "weightMethod" in core_params_data["weight"]:
                        weighting_strategy = core_params_data["weight"]["weightMethod"]
                        self.migrate_tree_viz(tree_data, weighting_strategy)
                        base.json_dumpf(tree_file, tree_data)
            except Exception as e:
                print("Failed to migrate tree visualization -- Error : %s" % str(e))

class V8020UpdateGlobalTagsStructure(migration_json.JsonMigrationOperation):
    def __repr__(self,):
        return "Migrating structure of global tags categories"

    def transform(self, obj, filepath=None):
        globalTagsCategories = obj.get("globalTagsCategories", [])
        for category in globalTagsCategories:
            if category.get("globalTagsList"):
                category["globalTags"] = category.pop("globalTagsList")
                for tag in category.get("globalTags", []):
                    if tag.get("updatedTagName"):
                        tag["name"] = tag.pop("updatedTagName")
            else:
                category["globalTagsList"] = []

            if category.get("applyTo"):
                category["appliesTo"] = category.pop("applyTo")
                if "FLOW" in category["appliesTo"]:
                    category["appliesTo"].remove("FLOW")
                    category["appliesTo"].extend(["DATASET", "RECIPE", "MANAGED_FOLDER", "FLOW_ZONE", "STREAMING_ENDPOINT"])
                if "MODELS" in category["appliesTo"]:
                    category["appliesTo"].remove("MODELS")
                    category["appliesTo"].extend(["SAVED_MODEL", "ANALYSIS"])
                if "NOTEBOOK" in category["appliesTo"]:
                    category["appliesTo"].remove("NOTEBOOK")
                    category["appliesTo"].extend(["SQL_NOTEBOOK", "JUPYTER_NOTEBOOK"])
                if "DASHBOARD" in category["appliesTo"]:
                    category["appliesTo"].extend(["INSIGHT"])

        return obj

    def jsonpath(self,):
            return ""

    def file_patterns(self,):
        return ["config/general-settings.json"]

class V8020RenameHashSizeField(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self):
        return "Rename 'hashSVDhashSize' field to 'hashSize' for text features"

    @staticmethod
    def process_file(the_file, preprocessing_access_func):
        file_data = base.json_loadf(the_file)
        preprocessing_data = preprocessing_access_func(file_data)
        V8020RenameHashSizeField.process_preprocessing(preprocessing_data)
        base.json_dumpf(the_file, file_data)

    @staticmethod
    def process_preprocessing(data):
        for params in data.get("per_feature", {}).values():
            if params.get("type") == "TEXT" and "hashSize" not in params:
                hash_size = params.pop("hashSVDHashSize", 200000)
                if params.get("text_handling") == "TOKENIZE_HASHING":
                    params["hashSize"] = 2**20
                else:
                    params["hashSize"] = hash_size

    def execute(self, project_paths):
        for mltask_file in (glob("%s/analysis/*/ml/*/params.json" % project_paths.config)
                            + glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data)):
            print("Renaming 'hashSVDhashSize' of text features in MLTask: %s" % mltask_file)
            try:
                V8020RenameHashSizeField.process_file(mltask_file, lambda data: data.get("preprocessing", {}))
            except Exception as e:
                print("Renaming of 'hashSVDhashSize' in MLTask FAILED: %s" % e)

        for train_recipe_params_file in (glob("%s/recipes/*.prediction_training" % project_paths.config)
                                         + glob("%s/recipes/*.clustering_training" % project_paths.config)
                                         + glob("%s/recipes/*.clustering_cluster" % project_paths.config)):
            print("Renaming 'hashSVDhashSize' of text features in recipe: %s " % train_recipe_params_file)
            try:
                V8020RenameHashSizeField.process_file(train_recipe_params_file,
                                                      lambda data: data.get("preprocessing", {}))
            except Exception as e:
                print("Renaming of 'hashSVDhashSize' in train recipe migration FAILED: %s" % e)

        for rp_file in (glob("%s/*/versions/*/rpreprocessing_params.json" % project_paths.saved_models)
                        + glob("%s/*/pversions/*/*/rpreprocessing_params.json" % project_paths.saved_models)
                        + glob("%s/*/*/sessions/*/*/rpreprocessing_params.json" % project_paths.analysis_data)):
            print("Renaming 'hashSVDhashSize' of text features in rpreprocessing file: %s " % rp_file)
            try:
                V8020RenameHashSizeField.process_file(rp_file, lambda data: data)
            except Exception as e:
                print("Renaming of 'hashSVDhashSize' in trained model rpreprocessing migration FAILED: %s" % e)

###############################################################################
# V9000 / DSS 9.0.0
###############################################################################

class V9000MigrateCategoricalHashingMethod(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self):
        return "Migrate categorical hashing method"

    @staticmethod
    def process_file(the_file, preprocessing_access_func):
        file_data = base.json_loadf(the_file)
        preprocessing_data = preprocessing_access_func(file_data)
        V9000MigrateCategoricalHashingMethod.process_preprocessing(preprocessing_data)
        base.json_dumpf(the_file, file_data)

    @staticmethod
    def process_preprocessing(data):
        for params in data.get("per_feature", {}).values():
            if params.get("type") == "CATEGORY" and "hash_whole_categories" not in params:
                params["hash_whole_categories"] = False

    def execute(self, project_paths):
        for mltask_file in (glob("%s/analysis/*/ml/*/params.json" % project_paths.config)
                            + glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data)):
            print("Migrating categorical hashing method in MLTask: %s" % mltask_file)
            try:
                V9000MigrateCategoricalHashingMethod.process_file(mltask_file,
                                                                  lambda data: data.get("preprocessing", {}))
            except Exception as e:
                print("Migrating categorical hashing method in MLTask FAILED: %s" % e)

        for rp_file in (glob("%s/*/*/sessions/*/*/rpreprocessing_params.json" % project_paths.analysis_data)):
            print("Migrating categorical hashing method in analysis rpreprocessing file: %s " % rp_file)
            try:
                V9000MigrateCategoricalHashingMethod.process_file(rp_file, lambda data: data)
            except Exception as e:
                print("Migrating categorical hashing method in analysis rpreprocessing file FAILED: %s" % e)

        for train_recipe_params_file in (glob("%s/recipes/*.prediction_training" % project_paths.config)
                                         + glob("%s/recipes/*.clustering_training" % project_paths.config)
                                         + glob("%s/recipes/*.clustering_cluster" % project_paths.config)):
            print("Migrating categorical hashing method in recipe: %s " % train_recipe_params_file)
            try:
                V9000MigrateCategoricalHashingMethod.process_file(train_recipe_params_file,
                                                                  lambda data: data.get("preprocessing", {}))
            except Exception as e:
                print("Migrating categorical hashing method in train recipe FAILED: %s" % e)

        for rp_file in (glob("%s/*/versions/*/rpreprocessing_params.json" % project_paths.saved_models)
                        + glob("%s/*/pversions/*/*/rpreprocessing_params.json" % project_paths.saved_models)):
            print("Migrating categorical hashing method in saved model rpreprocessing file: %s " % rp_file)
            try:
                V9000MigrateCategoricalHashingMethod.process_file(rp_file, lambda data: data)
            except Exception as e:
                print("Migrating categorical hashing method in saved model rpreprocessing file FAILED: %s" % e)


class V9000FilterAndFlagOnDateRangeProcessor(migration_app.ShakerStepMigrationOperation):
    def __init__(self, original_name, new_name):
        super(V9000FilterAndFlagOnDateRangeProcessor, self).__init__(original_name)
        self.original_name = original_name
        self.new_name = new_name

    def transform_step(self, step):
        assert step["type"] == self.original_name
        step["type"] = self.new_name
        params = step.get('params', None)
        if params is not None:
            params["filterType"] = "RANGE"
            self.fix_incomplete_date(params, "min")
            self.fix_incomplete_date(params, "max")
            params["timezone_id"] = params.get("timezone_id", "UTC")
            params["part"] = "YEAR"
            params["option"] = "THIS"
            params["relativeMin"] = 1
            params["relativeMax"] = 1
        return step

    def fix_incomplete_date(self, params, value_name):
        if len(params.get(value_name, "")) > 0:
            full_date = "1970-01-01T00:00:00.000"
            value = params[value_name]
            value_length = len(value)
            if value_length < len(full_date):
                suffix = full_date[value_length:]
                params[value_name] = value + suffix

class V9000MigrateNotebook(migration_base.ProjectLocalMigrationOperation):
    def __repr__(self):
        return "Migrating of the jupyter storage path to project"

    def execute(self, project_paths):
        if osp.exists(project_paths.jupyter_notebooks):
            project_notebooks = osp.join(project_paths.config, "ipython_notebooks")
            if not osp.exists(project_notebooks):
                os.makedirs(project_notebooks)

            for root, dirs, files in os.walk(project_paths.jupyter_notebooks):
                for f in files:
                    src = osp.join(root, f)
                    dest = osp.join(project_notebooks, osp.relpath(osp.join(root, f), project_paths.jupyter_notebooks))
                    target_dir = osp.dirname(dest)
                    if not osp.exists(target_dir):
                        os.makedirs(target_dir)
                    print("Migrate notebook %s to %s" % (src, dest))
                    shutil.move(src, dest)
            import subprocess
            # The migration tasks may be called when we migrate a full DSS or when we import a project.
            # On a full DSS, we are directly on the final git directory, and we need to add the jupyter notebook to git;
            # On a simple import, we are on a temporary directory (which is not a git one) but the git add will be done automatically,
            # So we check if we are inside the git repository before adding file to the git.
            try:
                subprocess.check_call("if git rev-parse --git-dir > /dev/null 2>&1; then git add . && git -c user.name='DSS' -c user.email='noreply@dataiku.com' "
                                      "commit -m 'Migration task: adding Jupyter notebooks to git repository'; fi",
                                      cwd = project_notebooks, shell=True)
            except subprocess.CalledProcessError as e:
                print(e)
                print("WARNING: Jupyter Notebooks will not be added to the remote control of this project.")

class V9000MigrateTimeTriggers(migration_json.ProjectConfigJsonMigrationOperation):

    def __repr__(self):
        return "Migrating time triggers"

    def transform(self, trigger, filepath):
        if trigger.get('type', None) == 'temporal':
            params = trigger.get('params', {})

            if params.get('frequency', None) == 'Minutely':
                # Minutely mode -> rename count into repeatFrequency
                params['repeatFrequency'] = params.get('count', 1)
            else:
                params['repeatFrequency'] = 1
            if params.get('frequency', None) == 'Monthly':
                # Monthly mode -> the start date should use the day of "dayOfMonth"
                # Since the month does not really matter, we will force January to avoid the 29 February or 31 April
                from datetime import datetime
                from dateutil.tz import tzlocal
                dayOfMonth = params.get('dayOfMonth', 1)
                if dayOfMonth is None or not isinstance(dayOfMonth, int) or dayOfMonth < 1 or dayOfMonth > 31:
                    dayOfMonth = 1
                upgrade_date = datetime.now(tzlocal()).replace(month=1, day=dayOfMonth, hour=0, minute=0, second=0, microsecond=0)
                params['startingFrom'] = upgrade_date.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + upgrade_date.strftime('%z')
            else:
                # Use the current date as a starting point
                from datetime import datetime
                from dateutil.tz import tzlocal
                upgrade_date = datetime.now(tzlocal()).replace(hour=0, minute=0, second=0, microsecond=0)
                params['startingFrom'] = upgrade_date.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + upgrade_date.strftime('%z')
            params['monthlyRunOn'] = "ON_THE_DAY"
            params['timezone'] = "SERVER"

            # Finally, remove unnecessary elements
            params.pop('count', None)
            params.pop('dayOfMonth', None)
        return trigger

    def jsonpath(self,):
        return "triggers"

    def file_patterns(self,):
        return ["scenarios/*.json"]

class V9000AddEvaluationRecipeParameters(migration_json.ProjectConfigJsonMigrationOperation):
    def __repr__(self,):
        return "Add parameters to evaluation recipes"

    def transform(self, obj, filepath=None):
        obj['selection'] = {"samplingMethod": "FULL"}
        obj['modelVersionId'] = ''
        return obj

    def jsonpath(self,):
        return ""

    def file_patterns(self,):
        return ["recipes/*.evaluation"]

class V9000MigrateAPIServiceParamsWithType(migration_json.JsonMigrationOperation):

    def __init__(self):
        pass

    def __repr__(self, ):
        return "Migrate API service params to use type parameter"

    def transform(self, service_params, filepath=None):
        service_params["type"] = "API_SERVICE"
        return service_params

    def jsonpath(self):
        return ""

    def file_patterns(self, ):
        return ["config/api-deployer/published-services/*.json"]


class V9000MigrateDeployerSettings(migration_json.JsonMigrationOperation):

    def __init__(self):
        pass

    def __repr__(self, ):
        return "Migrating API Deployer settings to be Deployer settings"

    def transform(self, general_settings, filepath=None):
        if "apiDeployerClientSettings" in general_settings:
            general_settings["deployerClientSettings"] = general_settings.pop("apiDeployerClientSettings")

        api_deployer_server_settings = general_settings.get("apiDeployerServerSettings")
        if api_deployer_server_settings and "serverEnabledDespiteRemote" in api_deployer_server_settings:
            general_settings["deployerServerEnabledDespiteRemote"] = \
                api_deployer_server_settings.pop("serverEnabledDespiteRemote")

        return general_settings

    def file_patterns(self, ):
        return ["config/general-settings.json"]


class V9000MigrateTreeBasedModelsMaxDepth(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrate max depth for tree based models"

    def migrate_tree_based_algo_params(self, algo_params):
        if not isinstance(algo_params, dict) or "max_tree_depth" not in algo_params:
            return

        algo_params["max_tree_depth"]["values"] = [
            value if value != 0 else (2 ** 31) - 1
            for value in algo_params["max_tree_depth"].get("values", [])
        ]

    def migrate_algo_params_in_mltask(self, mltask_data):
        modeling_params = mltask_data.get("modeling", {})
        self.migrate_tree_based_algo_params(modeling_params.get("random_forest_regression", {}))
        self.migrate_tree_based_algo_params(modeling_params.get("random_forest_classification", {}))
        self.migrate_tree_based_algo_params(modeling_params.get("extra_trees", {}))

    def migrate_algo_params_in_modeling(self, rmodeling_data):
        self.migrate_tree_based_algo_params(rmodeling_data.get("rf_regressor_grid", {}))
        self.migrate_tree_based_algo_params(rmodeling_data.get("rf_classifier_grid", {}))
        self.migrate_tree_based_algo_params(rmodeling_data.get("extra_trees_grid", {}))

        # Ensemble ALGOS
        for origin_model_mp in rmodeling_data.get("ensemble_params", {}).get("modeling_params", []):
            self.migrate_algo_params_in_modeling(origin_model_mp)

    def migrate_tree_based_resolved_actual_params(self, resolved_actual_params):
        if not isinstance(resolved_actual_params, dict) or "max_tree_depth" not in resolved_actual_params:
            return

        # in the actual params, you have the scikit learn param, a.k.a. None for no max depth
        if resolved_actual_params["max_tree_depth"] == None:
            resolved_actual_params["max_tree_depth"] = (2 ** 31) - 1

    def migrate_actual_params(self, actual_params):
        if (
            not isinstance(actual_params, dict)
            or actual_params.get("resolved", {}).get("algorithm") not in ["RANDOM_FOREST_CLASSIFICATION", "RANDOM_FOREST_REGRESSION", "EXTRA_TREES"]
        ):
            return

        self.migrate_tree_based_resolved_actual_params(actual_params.get("resolved", {}).get("rf", {}))
        self.migrate_tree_based_resolved_actual_params(actual_params.get("resolved", {}).get("extra_trees", {}))

    def execute(self, project_paths):
        # config/projects/PROJECT_KEY/analysis/a7QE8ig7/ml/ecsqyuFW/params.json
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/mltask.json
        for mltask_file in (glob("%s/analysis/*/ml/*/params.json" % project_paths.config)
                          + glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data)):
            print("Migrating algorithms params in MLTask: %s" % mltask_file)
            try:
                mltask_data = base.json_loadf(mltask_file)
                self.migrate_algo_params_in_mltask(mltask_data)
                base.json_dumpf(mltask_file, mltask_data)
            except Exception as e:
                print("Algo params in mltask migration FAILED: %s" % e)

        # config/projects/PROJECT_KEY/recipes/*.prediction_training
        for train_recipe_params_file in glob("%s/recipes/*.prediction_training" % project_paths.config):
            print("Migrating algorithms params in training recipe: %s " % train_recipe_params_file)
            try:
                train_recipe_data = base.json_loadf(train_recipe_params_file)
                self.migrate_algo_params_in_modeling(train_recipe_data.get("modeling", {}))
                base.json_dumpf(train_recipe_params_file, train_recipe_data)
            except Exception as e:
                print("Algo params in train recipe migration FAILED: %s" % e)

        # saved_models/PROJECT_KEY/58ipAuN7/versions/1573723995773/rmodeling_params.json (regular models, partitioned base models)
        # saved_models/PROJECT_KEY/58ipAuN7/pversions/female/v1/rmodeling_params.json (model partitions)
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/rmodeling_params.json
        for rm_file in (glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models)
                        + glob("%s/*/pversions/*/*/rmodeling_params.json" % project_paths.saved_models)
                        + glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data)):
            print("Migrating algorithms params in rmodeling file: %s " % rm_file)
            try:
                rmodeling_data = base.json_loadf(rm_file)
                self.migrate_algo_params_in_modeling(rmodeling_data)
                base.json_dumpf(rm_file, rmodeling_data)
            except Exception as e:
                print("Algo params in trained model rmodeling migration FAILED: %s" % e)

        # config/PROJECT_KEY/saved_models/58ipAuN7*.json
        for saved_model_file in (glob("%s/saved_models/*.json" % project_paths.config)):
            print("Migrating algorithms params in saved model miniTask: %s " % saved_model_file)
            try:
                sm_data = base.json_loadf(saved_model_file)
                self.migrate_algo_params_in_mltask(sm_data.get("miniTask", {}))
                base.json_dumpf(saved_model_file, sm_data)
            except Exception as e:
                print("Algo params in saved model miniTask migration FAILED: %s" % e)

        # saved_models/PROJECT_KEY/58ipAuN7/versions/1573723995773/actual_params.json (regular models, partitioned base models)
        # saved_models/PROJECT_KEY/58ipAuN7/pversions/female/v1/actual_params.json (model partitions)
        # analysis_data/PROJECT_KEY/a7QE8ig7/ecsqyuFW/sessions/s1/pp1/m1/actual_params.json
        for ap_file in (glob("%s/*/versions/*/actual_params.json" % project_paths.saved_models)
                        + glob("%s/*/pversions/*/*/actual_params.json" % project_paths.saved_models)
                        + glob("%s/*/*/sessions/*/*/*/actual_params.json" % project_paths.analysis_data)):
            print("Migrating algorithms params in actual params file: %s " % ap_file)
            try:
                actual_params = base.json_loadf(ap_file)
                self.migrate_actual_params(actual_params)
                base.json_dumpf(ap_file, actual_params)
            except Exception as e:
                print("Algo params in trained model actual params migration FAILED: %s" % e)


class V9020MigrateCVSeed(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrating seed used for cross-validation"

    def migrate_mltask(self, mltask_data):
        backend = mltask_data["backendType"]
        if backend in {"PY_MEMORY", "MLLIB"}:
            mltask_data["modeling"]["gridSearchParams"]["cvSeed"] = self._get_seed_from_mltask(mltask_data)

    def migrate_saved_ensemble(self, rmodeling_data, seed):
        for sub_rmodeling_data in rmodeling_data.get("ensemble_params", {}).get("modeling_params", []):
            sub_rmodeling_data["grid_search_params"]["cvSeed"] = seed
            self.migrate_saved_ensemble(sub_rmodeling_data, seed)

    def _get_seed_from_mltask(self, mltask_data):
        backend = mltask_data["backendType"]
        prediction_type = mltask_data.get("predictionType", None)
        ssd_seed = mltask_data.get("splitParams", {}).get("ssdSeed", None)
        return self._get_seed(backend, prediction_type, ssd_seed)


    def _get_seed(self, backend, prediction_type, ssd_seed):
        if backend == "PY_MEMORY":
            if prediction_type == "REGRESSION" and ssd_seed is not None:
                return ssd_seed
            else:
                return 1337
        elif backend == "MLLIB":
            return 42

    def execute(self, project_paths):

        for mltask_file in (glob("%s/analysis/*/ml/*/params.json" % project_paths.config)
                            + glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data)):
            print("Migrating cross-validation seed in MLTask: %s" % mltask_file)
            try:
                mltask_data = base.json_loadf(mltask_file)
                task_type = mltask_data["taskType"]
                if task_type == "PREDICTION":
                    self.migrate_mltask(mltask_data)
                    base.json_dumpf(mltask_file, mltask_data)
            except Exception as e:
                print("Migration of cross-validation seed in MLTask FAILED: %s" % e)

        for train_recipe_params_file in glob("%s/recipes/*.prediction_training" % project_paths.config):
            print("Migrating cross-validation seed in train recipe: %s" % train_recipe_params_file)
            try:
                train_recipe_data = base.json_loadf(train_recipe_params_file)
                backend = train_recipe_data["backendType"]
                prediction_type = train_recipe_data["core"]["prediction_type"]
                ssd_seed = train_recipe_data.get("splitParams", {}).get("ssdSeed", None)
                seed = self._get_seed(backend, prediction_type, ssd_seed)
                train_recipe_data["modeling"]["grid_search_params"]["cvSeed"] = seed
                base.json_dumpf(train_recipe_params_file, train_recipe_data)
            except Exception as e:
                print("Migration of cross-validation seed in train recipe FAILED: %s" % e)

        for saved_model_file in (glob("%s/saved_models/*.json" % project_paths.config)):
            print("Migrating cross-validation seed in saved model miniTask: %s "% saved_model_file)
            try:
                sm_data = base.json_loadf(saved_model_file)
                mltask_data = sm_data.get("miniTask", None)
                if mltask_data is not None and mltask_data["taskType"] == "PREDICTION":
                    self.migrate_mltask(mltask_data)
                    base.json_dumpf(saved_model_file, sm_data)
            except Exception as e:
                print("Migration of cross-validation seed in saved model miniTask FAILED: %s" % e)

        # Sessions rmodeling
        for rm_file in glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data):
            print("Migrating cross-validation seed in rmodeling file: %s " % rm_file)
            try:
                rmodeling_data = base.json_loadf(rm_file)
                mltask_data = base.json_loadf(os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(rm_file))), "mltask.json"))
                backend = mltask_data["backendType"]
                task_type = mltask_data["taskType"]
                if task_type == "PREDICTION" and backend in {"PY_MEMORY", "MLLIB"}:
                    seed = self._get_seed_from_mltask(mltask_data)
                    rmodeling_data["grid_search_params"]["cvSeed"] = seed
                    self.migrate_saved_ensemble(rmodeling_data, seed)
                    base.json_dumpf(rm_file, rmodeling_data)
            except Exception as e:
                print("Migration of cross-validation seed in rmodeling FAILED: %s" % e)

        # Saved models rmodeling
        for rm_file in (glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models)
                        + glob("%s/*/pversions/*/*/rmodeling_params.json" % project_paths.saved_models)):
            print("Migrating cross-validation seed in rmodeling file: %s " % rm_file)
            try:
                rmodeling_data = base.json_loadf(rm_file)
                core_params = base.json_loadf(os.path.join(os.path.dirname(rm_file), "core_params.json"))
                backend = core_params["backendType"]
                task_type = core_params["taskType"]
                if task_type == "PREDICTION" and backend in {"PY_MEMORY", "MLLIB"}:
                    prediction_type = core_params["prediction_type"]
                    split_params = base.json_loadf(os.path.join(os.path.dirname(rm_file), "split", "split.json"))["params"]
                    ssd_seed = split_params["ssdSeed"]
                    seed = self._get_seed(backend, prediction_type, ssd_seed)
                    rmodeling_data["grid_search_params"]["cvSeed"] = seed
                    self.migrate_saved_ensemble(rmodeling_data, seed)
                    base.json_dumpf(rm_file, rmodeling_data)
            except Exception as e:
                print("Migration of cross-validation seed in rmodeling FAILED: %s" % e)


class V9020MigrateNumericalFeatureRescaling(migration_base.ProjectLocalMigrationOperation):

    def __repr__(self):
        return "Migrate feature rescaling to reflect past behavior (always avg/std)"

    @staticmethod
    def process_file(the_file, preprocessing_access_func, transformation_func):
        file_data = base.json_loadf(the_file)
        preprocessing_data = preprocessing_access_func(file_data)
        transformation_func(preprocessing_data)
        base.json_dumpf(the_file, file_data)

    @staticmethod
    def process_preprocessing(data):
        for params in data.get("per_feature", {}).values():
            if params.get("type") == "NUMERIC" and params.get("rescaling") == "MINMAX":
                params["rescaling"] = "AVGSTD"

    @staticmethod
    def process_ensemble_preprocessings(rmodeling_data):
        for sub_rmodeling_data in rmodeling_data.get("ensemble_params", {}).get("preprocessing_params", []):
            V9020MigrateNumericalFeatureRescaling.process_preprocessing(sub_rmodeling_data)

    def execute(self, project_paths):
        for mltask_file in (glob("%s/analysis/*/ml/*/params.json" % project_paths.config)
                            + glob("%s/*/*/sessions/*/mltask.json" % project_paths.analysis_data)):
            print("Migrating numeric feature rescaling in MLTask: %s" % mltask_file)
            try:
                V9020MigrateNumericalFeatureRescaling.process_file(mltask_file,
                                                                   lambda data: data.get("preprocessing", {}),
                                                                   V9020MigrateNumericalFeatureRescaling.process_preprocessing)
            except Exception as e:
                print("Migrating numeric feature rescaling in MLTask FAILED: %s" % e)

        for rp_file in (glob("%s/*/*/sessions/*/*/rpreprocessing_params.json" % project_paths.analysis_data)):
            print("Migrating numeric feature rescaling in analysis rpreprocessing file: %s " % rp_file)
            try:
                V9020MigrateNumericalFeatureRescaling.process_file(rp_file,
                                                                   lambda data: data,
                                                                   V9020MigrateNumericalFeatureRescaling.process_preprocessing)
            except Exception as e:
                print("Migrating numeric feature rescaling in analysis rpreprocessing file FAILED: %s" % e)

        for train_recipe_params_file in (glob("%s/recipes/*.prediction_training" % project_paths.config)
                                         + glob("%s/recipes/*.clustering_training" % project_paths.config)
                                         + glob("%s/recipes/*.clustering_cluster" % project_paths.config)):
            print("Migrating numeric feature rescaling in recipe: %s " % train_recipe_params_file)
            try:
                V9020MigrateNumericalFeatureRescaling.process_file(train_recipe_params_file,
                                                                   lambda data: data.get("preprocessing", {}),
                                                                   V9020MigrateNumericalFeatureRescaling.process_preprocessing)
                V9020MigrateNumericalFeatureRescaling.process_file(train_recipe_params_file,
                                                                   lambda data: data.get("modeling", {}),
                                                                   V9020MigrateNumericalFeatureRescaling.process_ensemble_preprocessings)
            except Exception as e:
                print("Migrating numeric feature rescaling in train recipe FAILED: %s" % e)

        for rp_file in (glob("%s/*/versions/*/rpreprocessing_params.json" % project_paths.saved_models)
                        + glob("%s/*/pversions/*/*/rpreprocessing_params.json" % project_paths.saved_models)):
            print("Migrating numeric feature rescaling in saved model rpreprocessing file: %s " % rp_file)
            try:
                V9020MigrateNumericalFeatureRescaling.process_file(rp_file,
                                                                   lambda data: data,
                                                                   V9020MigrateNumericalFeatureRescaling.process_preprocessing)
            except Exception as e:
                print("Migrating numeric feature rescaling in saved model rpreprocessing file FAILED: %s" % e)

        for rm_file in (glob("%s/*/*/sessions/*/*/*/rmodeling_params.json" % project_paths.analysis_data)
                        + glob("%s/*/versions/*/rmodeling_params.json" % project_paths.saved_models)):
            print("Migrating numeric feature rescaling in saved ensemble model rmodeling file: %s " % rm_file)
            try:
                V9020MigrateNumericalFeatureRescaling.process_file(rm_file,
                                                                   lambda data: data,
                                                                   V9020MigrateNumericalFeatureRescaling.process_ensemble_preprocessings)
            except Exception as e:
                print("Migrating numeric feature rescaling in saved ensemble model rmodeling file FAILED: %s" % e)


class V9050RenameFmInstanceImagesFile(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Rename instance images file in data dir to avoid shadowing newer version"

    def appliesTo(self):
        return ["fm"]

    def execute(self, diphome, simulate=False):
        # get cloud provider in 'config/settings.json'
        settings_file = osp.join(diphome.path, 'config', 'settings.json')
        if not osp.isfile(settings_file):
            return
        settings = base.json_loadf(settings_file)
        cloud = settings.get('cloud', 'aws').lower()

        # rename instance images file if it exists
        file = osp.join(diphome.path, 'resources', cloud + '-instance-images.json')
        if osp.isfile(file):
            backup = file + '.bak'
            os.rename(file, backup)
            print('%s was renamed to %s as it may shadow newer releases of DSS images, if it was intended you can safely undo the renaming' % (file, backup))


###############################################################################
# Generic stuff
###############################################################################

class GenericDropCaches(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Drop caches"

    def execute(self, diphome, simulate=False):
        caches_folder = osp.join(diphome.path, "caches")
        if osp.isdir(caches_folder):
            shutil.rmtree(caches_folder)

class GenericDropPnotifications(migration_base.MigrationOperation):
    def __repr__(self,):
        return "Drop persistent notifications database"

    def execute(self, diphome, simulate=False):
        pnotif_db = osp.join(diphome.path, "config", "pnotifications.db")
        if osp.isfile(pnotif_db):
            os.remove(pnotif_db)

def clean_h2_timestamps(diphome):
    """
    H2 v1.3 was storing some weird values for timestamp close to midnight, and when bumping
    to 1.4, H2 stopped accepting them, instead crashing.
    """
    import subprocess

    java_bin = os.getenv("DKUJAVABIN", "java")
    old_h2_jar = osp.join(os.environ["DKUINSTALLDIR"], 'scripts', 'h2-1.3.176.jar')
    h2_cleanup_jar = osp.join(os.environ["DKUINSTALLDIR"], 'scripts', 'h2-cleanup.jar')
    for db in ['jobs', 'user_offline_queues', 'user_interests', 'persistent_notifications', 'flow_state', 'dss_usage']:
        if not osp.isfile(osp.join(diphome.path, 'databases', db + '.h2.db')):
            continue # that database doesn't exist (yet?)
        cmd = '"%s" -cp "%s:%s" com.dataiku.CleanH2Timestamps databases/%s "%s"' % (java_bin, old_h2_jar, h2_cleanup_jar, db, diphome.path)
        print('Cleaning timestamps in %s' % db)
        subprocess.check_call(cmd, shell=True)


###############################################################################
# Main table
###############################################################################

# Now removed:
    # Config V2 (from 0.6.12+): Large cleanup of types
    # Config V3 (0.8): Refactoring of shaker files to prepare for new selections and charts
    # Config V4 (DSS 1.1) : Projects
    # Config V5 (DSS 1.2): minor changes
    # Config V6 (DSS 1.3): minor changes
    # Config V7 (DSS 1.4) : new general settings system, LDAP groups
    # Config V8 (DSS 2.0) : Huge refactoring


# Config V9 (DSS 2.1)
migration_base.declare_version_migration(8, 9, [
    V9ElasticSearchDatasetParams(),
    V9RecipeRoles(),
    V9FilterRecipeSelection(),
    V9AnalysisCharts(),
    V9DatasetCharts(),
    V9ShakerRecipeEngine(),
    V9APIKeysForWebapps(),

    V9RenameArraysCombine(),
    V9ColumnRenamerMultiColumns(),

    GenericDropCaches(),
    GenericDropPnotifications()
])

# Config V10 (DSS 2.2)
migration_base.declare_version_migration(9, 10, [
    V10UpDownFiller(),
    V10TimestamNoTzInSqlDatasets(),
    V10TrueInPluginRecipesConfig()
])

# Config V11 (DSS 2.3)
migration_base.declare_version_migration(10, 11, [
    V11InstallIni(),
    V11SQLNotebooks(),
    V11FillEmptyWithValue(),
    V11RemoveRowsOnEmpty(),
    V11RoundProcessor(),
    V11FindReplace(),
    V11StringTransformer(),
    V11CellClearer(),
    V11RowsSelector(),
    V11ClearCellsOnBadType(),
    V11RemoveRowsOnBadType(),
    V11NumericalRangeSelector(),
    V11SplitFoldTrimFalse(),
    V11JSONFlattenNull(),
    V11DateParser(),
    V11RemoveShakerFilters(),
    V11RemoveStepsFromInsightCharts(),

    GenericDropCaches(),
    GenericDropPnotifications()
])

# Config V12 (DSS 3.0)
migration_base.declare_version_migration(11, 12, [
    V12SchedulerToScenario(),
    V12CustomPythonModelsInAnalysisConfig(),
    V12CustomPythonModelsInAnalysisData(),
    V12CustomPythonModelsInSavedModels(),
    V12AnalysisCharts(),
    V12DatasetCharts(),
    V12GroupPermissions(),
    V12AddGitMode(),
    V12ConnectionParams(),
    V12ColumnsSelector(),
    V12NestProcessor(),
    V12NumericalCombinator(),
    V12DkuSparkHome(),
    V12SetupDefaultMetrics()
])


# Config V13 (DSS 3.0.2)
migration_base.declare_version_migration(12, 13, [
     V13EnableMetrics()
])

# Config V14 (DSS 3.1)
migration_base.declare_version_migration(13, 14, [
    V14JoinRecipesInputs(),
    V14JoinRecipesJoinType(),
    V14StackRecipesInputs(),
    V14HideHiveDkuUdf(),
    V14ClusteringScatterplot(),
    V14NormalizeDoubles(),
    V14DefaultProjectStatus(),
    V14RenameProjectPayloadFiles(),

    GenericDropCaches(),
    GenericDropPnotifications()
])

# Config V15 (DSS 4.0)
migration_base.declare_version_migration(14, 15, [
    V15JsonFlattenerWithCustomSeparator(),
    V15RoundProcessor(),
    V15ClusteringHeatmap(),
    V15JupyterExportsDir(),
    V15RefreshNotebookInsightScenarioStep(),
    V15ProjectSettingsExposed(),
    V15HProxyRemovalInRecipes(),
    V15HProxyRemovalInScenarios(),
    V15HProxyRemovalInNotebooks(),
    V15DenormalizeMessagingChannels(),
    V15RetypeChannels(),
    V15RetypeMessagings(),
    V15RetypeMessagingsInScenarioRuns(),
    V15FixupAuthCtxInScenarioRuns(),
    V15MoveKerberosSettings(),

    V15AddGridSearchRFGBTETInAnalysisData(),
    V15AddGridSearchRFGBTETInAnalysisConfig(),
    V15AddGridSearchRFGBTETInSavedModels(),
    V15AddGridSearchRFGBTETInRootSavedData(),

    V15ChartsInExplore(),
    V15ChartsInAnalysis(),
    V15ChartsInAnalysisModels(),
    V15PrepareRecipeEngine(),
    V15SelectDSSSyncRecipeEngine(),
    V15SelectDSSRecipeEngine(),

    # MUST be after V15ChartsInExplore
    V15Insights(),

    V15ProjectAPIKeys(),
    V15ProjectAccessLevels(),
    V15GlobalAPIKeys(),
    V15SplitRecipesOutput(),
    V15AddInstallId(),
    V15HiveOverrideDatabase(),
    V15HiveJobCompressionCommands(),
    V15HiveExecutionConfig(),
    V15HiveDefaultDatabase(),
    V15RenameJupyterNotebooks(),
    V15MoveDatabases(),
    V15DKUCommand(),
    V15FixScoringRecipes(),

    GenericDropPnotifications()
])


# Config V16 (DSS 4.0.5)
migration_base.declare_version_migration(15, 16, [
     V16DKUCommand(),
     V16UpdateWeeklyTriggers()
])

# Config V17 (DSS 4.1)
migration_base.declare_version_migration(16, 17, [
    V17DKUCommand(),
    V17UpdatePluginSettings(),
    V17ChartsInExplore(),
    V17ChartsInAnalysis(),
    V17ChartsInAnalysisModels(),
    V17ChartsInInsights(),
    V17AddManagedFoldersConnection(),
    V17FoldersOnProviders(),
    V17WebApps(),
    V17WebAppsSnippets(),
    V17WebAppsInsights(),
    V17UnfoldProcessor(),
    V17SplitUnfoldProcessor(),
    V17ChangeRemoteFilesDataset(),
    V17ChangeRemoteFilesDatasetInProject(), # after the instance-level migration, so that it's only effective in project imports
    V17MLLibResolvedGrids(),
    V17MLLibUnresolvedGridsInAnalysis(),
    V17MLLibUnresolvedGridsInSM(),
    V17ComputedColumnsGroupingRecipe(),
    V17ComputedColumnsJoinRecipe(),
    V17GlobalAPIKeys(),
    V17Meanings(),
    V17ConvertVariablesToComputedColumnsSplitRecipe(),
    V17ConvertFilesInFolderSelectionPattern(),
    V17EngineCreationSettings(),
    V17MoveJupyterExports(),
    V17InitGraceDelays(),
    V17UpdateMailAttachment(),

    GenericDropCaches(),
    GenericDropPnotifications()
])

# Config V18 (DSS 4.2)
migration_base.declare_version_migration(17, 18, [
    V18UpdateSQLDatasets(),
    V18MigrateDashboardImageResizeSetting(),
    V18CleanupMLResolvedParams(),
    V18FeatureGenerationParams(),

    GenericDropCaches(),
    GenericDropPnotifications()
])

# Config V19 (DSS 4.3)
migration_base.declare_version_migration(18, 19, [
    # Nothing to do
])

# Config V20 (DSS 5.0)
migration_base.declare_version_migration(19, 20, [
    V20AddParamsToMLRecipes(),
    V20TransformCommentsInsightsToDiscussionsInsights(),
    V20TransformCommentsInsightsToDiscussionsInsightsInDashboards(),
    #V20DKUCommand(),

    GenericDropCaches(),
    GenericDropPnotifications()
])

# Config V21 (DSS 5.0.2)
migration_base.declare_version_migration(20, 21, [
    V21RegoupMLSparkParamsInSavedModelsMLTasks(),
    V21RegoupMLSparkParamsInAnalysisDataMLTasks(),
    V21RegoupMLSparkParamsInAnalysesMLTasks(),
    V21RegoupMLSparkParamsInRecipes(),
    #V21DKUCommand(),

    GenericDropCaches(),
    GenericDropPnotifications()
])

# Config V22 (DSS 5.0.3)
migration_base.declare_version_migration(21, 22, [
    V22GiveNPSSurveySettingsToUsers()
])

# Config V23 (DSS 5.1)
migration_base.declare_version_migration(22, 23, [
    V23TransferKernelSpecEnvName(),
    V23MigrateH2Databases(),
    V23MakeClassWeightTheDefaultForClassifications(),
    V23DefaultGitURLWhitelist(),
    V23UseSmartnameInRefreshChartsStep(),
    V23SkipExpensiveReportsInMLTasks(),
    GenericDropCaches(),
    GenericDropPnotifications()
])

# Config V24 (DSS 5.1.1)
migration_base.declare_version_migration(23, 24, [
    V24UseSmartnameInArticleAttachments()
])

# Config V6000 (DSS 6.0.0)
migration_base.declare_version_migration(24, 6000, [
    V6000MigrateProjectPathToProjectFolder(),
    V6000MigrateHomeSettings(),
    V6000UseNumericIdsForArticle(),
    V6000MigrateHomepagesArticles(),
    V6000MigrateDashboardArticles(),
    V6000UpgradeWikiTimelineNumericIds(),
    V6000UpgradeEC2Connections(),
    V6000PrePushHookGeneralSettings(),
    V6000PrePushHookInAPIDeployerInfras(),
    V6000MigrateDoctorExecutionParams(),
    V6000MigrateKerasModelListedInCodeEnv(),
    V6000MigrateEvaluationRecipeMetricsOutputs()
])

# Config V6020 (DSS 6.0.2)
migration_base.declare_version_migration(6000, 6020, [
    V6020FixArticleIdMigration()
])

# Config V6030 (DSS 6.0.3)
migration_base.declare_version_migration(6020, 6030, [
    V6030FixMicrosoftTeamsIntegrationMigration()
])

# Config V7000 (DSS 7.0.0)
migration_base.declare_version_migration(6030, 7000, [
    V7000UserCredentialsRenaming(),
    V7000ExpositionkInAPIDeployerInfras(),
    V7000ExpositionkInAPIDeployerDeployments(),
    V7000RemoveHipchatChannels(),
    V7000RemoveHipchatReporters(),
    V7000RemoveHipchatIntegrations(),
    V7000MigrateAlgorithmsParamsStructure(),
    V7000MigratePosttrainComputationParams(),
    V7000MigrateSamlSPConfig()
])

# Config V7020 (DSS 7.0.2)
migration_base.declare_version_migration(7000, 7020, [
    V7020MigrateExplanationsScoringRecipeParams(),
])

# Config V8000 (DSS 8.0.0)
migration_base.declare_version_migration(7020, 8000, [
    V8000MigrateAuditConfig(),
    V8000MigrateAuditConfigAPINode(),
    V8000MigrateAlgorithmsSVMParamsStructure(),  # MUST be executed before V8000MigratePredictionAlgorithmsRanges
    V8000MigrateMaxFeaturePropStructure(),  # MUST be executed before V8000MigratePredictionAlgorithmsRanges
    V8000MigratePredictionAlgorithmsRanges(),
    V8000MigrateGridLengthForNonSearchableAlgos(),
    V8000MigrateCodeEnvSelection()
])

# Config V8020 (DSS 8.0.2)
migration_base.declare_version_migration(8000, 8020, [
    V8020MigrateTreeBasedMLResults(),
    V8020RenameHashSizeField(),
    V8020UpdateGlobalTagsStructure()
])

# Config V9000 (DSS 9.0.0)
migration_base.declare_version_migration(8999, 9000, [
    V9000MigrateCategoricalHashingMethod(),
    V9000FilterAndFlagOnDateRangeProcessor("FilterOnDateRange", "FilterOnDate"),
    V9000FilterAndFlagOnDateRangeProcessor("FlagOnDateRange", "FlagOnDate"),
    V9000MigrateNotebook(),
    V9000AddEvaluationRecipeParameters(),
    V9000MigrateAPIServiceParamsWithType(),
    V9000MigrateDeployerSettings(),
    V9000MigrateTimeTriggers(),
    V9000MigrateTreeBasedModelsMaxDepth()
])

# Config V9020 (DSS 9.0.2)
migration_base.declare_version_migration(9000, 9020, [
    V9020MigrateCVSeed(),
    V9020MigrateNumericalFeatureRescaling()
])

# Config V9050 (DSS & FM 9.0.5)
migration_base.declare_version_migration(9020, 9050, [
    V9050RenameFmInstanceImagesFile()
])
