(function() {
'use strict';

/*
* This file defines a set of "Standard" flow views
*
* They implement a common API, in particular they are essentially a mapping: node -> single value
* (the single value can be structured but will be displayed as a single value as opposed to multi-valued views like tags)
*
*/
const app = angular.module('dataiku.flow.tools');


const WARN_LEVEL_COLORS = {
    OK: '#81C241',
    WARN: 'darkorange',
    ERROR: 'red'
};


app.service('WatchView', function(StandardFlowViews) {
    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('WATCH', 'Watched and starred items', {
            getRepr: val => val.w ? 'Watching' : undefined,
            colorMap: repr => repr == 'Watching' ? 'green' : '#e9e9e9',
            totem: function(val) {
                return {
                    class: val.s ? 'icon-star' : '',
                    style: val.s ? 'color: gold; font-size: 32px;' : ''
                }
            }
        });
    }
});


app.service('SparkConfigView', function(ColorPalettesService, StandardFlowViews) {
    this.getDefinition = function() {
        const colorPalette = ColorPalettesService.fixedColorsPalette('spark-config-flow-view');

        return StandardFlowViews.getDefinition('SPARK_CONFIG', 'Spark configurations', {
            colorMap: colorPalette,
            getRepr: val => val.inheritConf,
            totem: function(val) {
                return {
                    class: val.conf.length ? 'icon-plus flow-totem-ok' : '',
                    style: ''
                }
            },
            tooltipTemplate: '/templates/flow-editor/tools/spark-config-view-tooltip.html',
            helpLink: 'spark/configuration.html'
        });
    }
});


app.service('ConnectionsView', function(ColorPalettesService, StandardFlowViews) {
    this.getDefinition = function() {
        const colorPalette = ColorPalettesService.fixedColorsPalette('connections-flow-view');

        return StandardFlowViews.getDefinition('CONNECTIONS', 'Connections', {
            getRepr: val => val.connection,
            colorMap: function(connection) {
                if (connection == 'No connection') {
                    return '#333333';
                }
                return colorPalette(connection);
            },
            listValuesForLegend: function(list, tool) {
                let sorted = angular.copy(list);
                return sorted.sort(function(a, b) {
                    if (a == 'No connection') {
                        return 1;
                    }
                    if (b == 'No connection') {
                        return -1;
                    }
                    return tool.user.state.countByValue[b] - tool.user.state.countByValue[a];
                });
            },
            tooltipTemplate: '/templates/flow-editor/tools/connections-view-tooltip.html',
            helpLink: 'connecting/index.html'
        });
    }
});

app.service('FlowZonesView', function(ColorPalettesService, StandardFlowViews, FlowGraphFolding, FlowGraphSelection, WT1, FlowGraphFiltering) {

    this.getDefinition = function() {
        var zonesMap = new Map();

        return StandardFlowViews.getDefinition('FLOW_ZONES', 'Flow Zones', {

            getRepr: function(val) {
                return val.id;
            },
            colorMap: function(zoneId) {
                let color = zonesMap[zoneId].color;
                const rgbColor = d3.rgb(color);
                const darkerColor = rgbColor.darker(2).toString();
                color = (rgbColor.r*0.299 + rgbColor.g*0.587 + rgbColor.b*0.114) >= 250 ? darkerColor : color;
                return color;
            },
            listValuesForLegend: function(list, tool) {
                zonesMap = tool.user.state.zonesMap;
                let sorted = angular.copy(Object.keys(zonesMap));
                return sorted.sort(function(a, b) {
                    return (tool.user.state.countByValue[b] || 0) - (tool.user.state.countByValue[a] || 0);
                });
            },
            postInit: function(tool){
                tool.zonesMap = zonesMap;
                if (tool.currentSession.options.drawZones === false) {
                    Object.keys(tool.user.state.countByValue).forEach(zoneName => {
                        tool.user.state.countByValue[zoneName] = Math.max(0, tool.user.state.countByValue[zoneName] - 1);
                    });
                }
                function isItemSelectedbyId(itemId) {
                    var val = undefined;
                    if (tool.currentSession.options.drawZones === false || itemId.startsWith("zone_")) {
                        val = tool.user.state.valueByNode[itemId];
                    }
                    if (val === undefined) {
                        return false;
                    }
                    // Multi-valued view (tags, scenarios)
                    if (angular.isArray(tool.getRepr(val))) {
                        for (let v of tool.getRepr(val)) {
                            if (tool.user.state.focusMap[v]) {
                                return true;
                            }
                        }
                        return false;
                    }
                    // Single-valued view
                    return tool.user.state.focusMap[tool.getRepr(val)];
                }

                function isItemSelected(item) {
                    return isItemSelectedbyId(item.realId);
                }

                function getSelectedIdsList() {
                    const selectedIdslist = [];
                    Object.keys(tool.user.state.valueByNode).forEach(itemId => {
                        if (isItemSelectedbyId(itemId)) {
                            selectedIdslist.push(itemId);
                        }
                    });
                    return selectedIdslist;
                }
                tool.user.selectFocused = () => {
                    WT1.event("flow-view-select-focused", {tool: tool.def.getName()});
                    FlowGraphFolding.ensureNodesNotFolded(getSelectedIdsList());
                    FlowGraphSelection.select(isItemSelected);
                }

                tool.user.needFocusClass = (val, itemId) => {
                    if (itemId && tool.currentSession.options.drawZones !== false && !itemId.startsWith("zone_")) {
                        return false;
                    }
                    return tool.user.state.focusMap[tool.getRepr(val)];
                };
            },
            tooltipTemplate: '/templates/flow-editor/tools/flow-zones-view-tooltip.html',
            settingsTemplate: '/templates/flow-editor/tools/flow-zones-settings.html'
        });
    }
});

/*
* Note that the tag view is a multi-valued one (each node has several labels)
*/
app.service('TagsView', function($rootScope, $filter, $stateParams,
    DataikuAPI, CreateModalFromTemplate, TaggableObjectsUtils, TaggingService,
    FlowTool, FlowGraph, FlowToolsUtils, StandardFlowViews) {

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('TAGS', 'Tags', {
            postInit: function(tool) {
                tool.manageTags = function() {
                    CreateModalFromTemplate("/templates/widgets/edit-tags-modal.html", $rootScope, null, function(modalScope) {
                        modalScope.tagsDirty = angular.copy(TaggingService.getProjectTags());

                        modalScope.save = function() {
                            TaggingService.saveToBackend(modalScope.tagsDirty)
                                .success(modalScope.resolveModal)
                                .error(FlowGraph.setError());
                        };
                        modalScope.cancel = function() {modalScope.dismiss();};
                    });
                };
                tool.displayGlobalTags = true;
            },
            getRepr: function(val) {
                return val;
            },
            colorMap: function(repr, tool) {
                if (typeof repr == 'string') {
                    // called for a value, not a node (for legend)
                    return $filter('tagToColor')(repr);
                } else if (angular.isArray(repr)) {
                    const focused = tool.user.getFocusedAsList();
                    // if only one tag matches, make sure to use that tag color
                    const matchedTags = repr.filter(_ => focused.indexOf(_) !== -1);
                    if (matchedTags.length === 1) {
                        const tag = matchedTags[0];
                        return $filter('tagToColor')(tag);
                    }
                    return '#333'
                }
            },
            listValuesForLegend: function(list, tool) {
                return list.sort(function(a, b) {
                    return tool.user.state.countByValue[b] - tool.user.state.countByValue[a];
                });
            },
            postProcessNode: function(tags, nodeElt, tool) {
                if (!tags) return;
                tags.forEach(function(tag, idx) {
                    function onClick() {
                        tool.user.focus(tag);
                        $rootScope.$digest();
                        d3.event.stopPropagation();
                        d3.event.preventDefault();
                    }
                    FlowToolsUtils.addSimpleZone(nodeElt, $filter('tagToColor')(tag), idx, onClick);
                });
            },
            actions: {
                setTags: function(tags, nodes, mode) { // mode = TOGGLE, ADD or REMOVE
                    const request = {
                        elements: nodes.map(TaggableObjectsUtils.fromNode),
                        operations: [{mode: mode, tags: tags}]
                    };

                    DataikuAPI.taggableObjects.applyTagging($stateParams.projectKey, request).success(function(data) {
                        TaggingService.bcastTagUpdate(false, true);
                    }).error(FlowGraph.setError());
                }
            },
            autoSelectFirstOnly: true,
            tooltipTemplate: '/templates/flow-editor/tools/tags-view-tooltip.html',
            settingsTemplate: '/templates/flow-editor/tools/tags-settings.html'
        });
    }
});


app.service('CustomFieldsView', function($rootScope, $stateParams, FlowTool, StandardFlowViews, objectTypeFromNodeFlowType, localStorageService) {
    let refreshOverriden = false;

    function getLocalStorageKey() {
        return 'CustomFieldsFlowView.' + $stateParams.projectKey;
    }

    function getSelectedOption(value, fromLabel) {
        let selectedCustomField = FlowTool.getCurrent().currentSession.options.selectedCustomField;
        if (!selectedCustomField) {
            return null;
        }
        for (let taggableType in $rootScope.appConfig.customFieldsMap) {
            if ($rootScope.appConfig.customFieldsMap.hasOwnProperty(taggableType)) {
                let componentList = $rootScope.appConfig.customFieldsMap[taggableType];
                for (let i = 0; i < componentList.length; i++) {
                    let paramDesc = (componentList[i].customFields.filter(cf => cf.type == 'SELECT' && cf.selectChoices) || []).find(cf => cf.name == selectedCustomField);
                    if (paramDesc) {
                        let selOpt = (paramDesc.selectChoices || []).find(function(choice) {
                            if (fromLabel) {
                                return value && choice.label == value;
                            } else {
                                return value ? choice.value == value : (paramDesc.defaultValue && choice.value == paramDesc.defaultValue);
                            }
                        });
                        if (selOpt) {
                            return selOpt;
                        }
                    }
                }
            }
        }
        return null;
    }

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('CUSTOM_FIELDS', 'Metadata fields', {
            getRepr: function(val) {
                let selOpt = getSelectedOption(val);
                return (selOpt && (selOpt.label || selOpt.value)) || val;
            },
            postInit: function(tool) {
                tool.objectTypeFromNodeFlowType = objectTypeFromNodeFlowType;
                // override refreshStateLater in order to save the field in local storage
                if (!refreshOverriden) {
                    let refreshStateLater = FlowTool.getCurrent().refreshStateLater;
                    FlowTool.getCurrent().refreshStateLater = function() {
                        let selectedCustomField = FlowTool.getCurrent().currentSession.options.selectedCustomField;
                        localStorageService.set(getLocalStorageKey(), selectedCustomField);
                        refreshStateLater();
                    };
                    refreshOverriden = true;
                }

                // build selectable fields
                let selFields = [];
                for (let taggableType in $rootScope.appConfig.customFieldsMap) {
                    if (['DATASET', 'MANAGED_FOLDER', 'STREAMING_ENDPOINT', 'SAVED_MODEL', 'MODEL_EVALUATION_STORE', 'RECIPE'].includes(taggableType) && $rootScope.appConfig.customFieldsMap.hasOwnProperty(taggableType)) {
                        let componentList = $rootScope.appConfig.customFieldsMap[taggableType];
                        for (let i = 0; i < componentList.length; i++) {
                            selFields = selFields.concat(componentList[i].customFields.filter(cf => cf.type == 'SELECT' && !selFields.find(sf => sf.name == cf.name))
                                .map(paramDesc => ({name: paramDesc.name, label: componentList[i].meta.label + ' - ' + paramDesc.label})));
                        }
                    }
                }
                tool.selectableFields = selFields;

                // get the previously selected field in storge if it exists
                let storedSelectedCustomField = localStorageService.get(getLocalStorageKey());
                let hasToChange = storedSelectedCustomField && tool.currentSession.options.selectedCustomField != storedSelectedCustomField;
                if (hasToChange) {
                    tool.currentSession.options.selectedCustomField = storedSelectedCustomField;
                    tool.refreshStateLater();
                } else if (!tool.currentSession.options.selectedCustomField) {
                    tool.currentSession.options.selectedCustomField = (tool.selectableFields[0] || {}).name;
                    tool.refreshStateLater();
                }
            },
            colorMap: function(repr, tool) {
                let selOpt = getSelectedOption(repr, true);
                return (selOpt && selOpt.color) || '#333';
            },
            listValuesForLegend: function(list, tool) {
                return list.sort(function(a, b) {
                    return tool.user.state.countByValue[b] - tool.user.state.countByValue[a];
                });
            },
            tooltipTemplate: '/templates/flow-editor/tools/custom-fields-view-tooltip.html',
            settingsTemplate: '/templates/flow-editor/tools/custom-fields-settings.html'
        });
    };
});


/*
* Note that the scenarios view is a multi-valued one (each node has several labels)
*/
app.service('ScenariosView', function($rootScope, $filter, ColorPalettesService, FlowToolsUtils, StandardFlowViews) {
    const ACTIONS = {
        'build_flowitem': 'Build',
        'clear_items': 'Clear',
        'check_dataset': 'Run checks',
        'compute_metrics': 'Compute metrics',
        'sync_hive': 'Synchronize Hive',
        'update_from_hive': 'Update from Hive'
    };

    this.getDefinition = function() {
        const colorPalette = ColorPalettesService.fixedColorsPalette('scenarios-flow-view');

        return StandardFlowViews.getDefinition('SCENARIOS', 'Scenarios', {
            getRepr: function(uses) {
                return uses.map(use => use.scenarioName+' ('+use.scenarioId+')');
            },
            colorMap: function(repr, tool) {
                if (typeof repr == 'string') {
                    // called for a value, not a node (for legend)
                    return colorPalette(repr);
                } else if (angular.isArray(repr)) {
                    const focused = tool.user.getFocusedAsList();
                    if (focused.length == 1) {
                        const scenarioId = focused[0];
                        return colorPalette(scenarioId);
                    }
                    return '#333';
                }
            },
            listValuesForLegend: function(list, tool) {
                return list.sort(function(a, b) {
                    return tool.user.state.countByValue[b] - tool.user.state.countByValue[a];
                });
            },
            postProcessNode: function(uses, nodeElt, tool) {
                if (!uses) return;
                uses.forEach(function(use, idx) {
                    function onClick() {
                        tool.user.focus(use);
                        $rootScope.$digest();
                        d3.event.stopPropagation();
                        d3.event.preventDefault();
                    }
                    const fullId = use.scenarioName+' ('+use.scenarioId+')';
                    FlowToolsUtils.addSimpleZone(nodeElt, colorPalette(fullId), idx, onClick);
                });
            },
            actions: {
                getActionsNames(actions) {
                    if (!actions) return;
                    return actions.map(a => ACTIONS[a]);
                }
            },
            autoSelectFirstOnly: true,
            tooltipTemplate: '/templates/flow-editor/tools/scenarios-view-tooltip.html',
            helpLink: 'scenarios/definitions.html'
        });
    }
});


app.service('FileformatsView', function(ColorPalettesService, StandardFlowViews) {
    this.getDefinition = function() {
        const colorPalette = ColorPalettesService.fixedColorsPalette('fileformat-flow-view');

        return StandardFlowViews.getDefinition('FILEFORMATS', 'File format', {
            getRepr: val => val.formatType,
            colorMap: function(connection) {
                return colorPalette(connection);
            },
            listValuesForLegend: function(list, tool) {
                return list.sort();
            },
            tooltipTemplate: '/templates/flow-editor/tools/fileformats-view-tooltip.html',
        });
    }
});


app.service('PipelinesView', function(ColorPalettesService, StandardFlowViews) {
    this.getService = function(toolName) {
        let displayName;
        let helpLink;
        if (toolName === "SPARK_PIPELINES") {
            displayName = "Spark pipelines";
            helpLink = "spark/pipelines.html"
        } else if (toolName === "SQL_PIPELINES") {
            displayName = "SQL pipelines";
            helpLink = "sql/pipelines/index.html"
        }
        return {
            getDefinition: function() {

                const colorPalette = ColorPalettesService.fixedColorsPalette('pipelines-flow-view');
                for (let i = 1; i <= 12; i++) {
                    colorPalette('Pipeline '+i); //Force the order or the colors since the palette is optimized for using first colors
                }

                return StandardFlowViews.getDefinition(toolName,  displayName, {
                    getRepr: function(val) {
                        if (val.pipelineId) {
                            return val.pipelineId
                        }
                        if (val.virtualizable) {
                            return null;// Dataset
                        }
                        return;
                    },
                    listValuesForLegend: function(list) {
                        return list.map( (x, idx) => 'Pipeline '+(idx+1));
                    },
                    colorMap: colorPalette,
                    colorSuccessorsWithSameColor: true,
                    totem: function(val) {
                        return {
                            class: val.virtualizable ? 'icon-forward flow-totem-ok' : '',
                            style: ''
                        }
                    },
                    tooltipTemplate: '/templates/flow-editor/tools/pipeline-view-tooltip.html',
                    helpLink: helpLink
                });
            }
        }
    };
});


app.service('ImpalaWriteModeView', function(StandardFlowViews) {
    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('IMPALA_WRITE_MODE', 'Impala write mode', {
            getRepr: val => val,
            colorMap: function(flag) {
                return {
                    'Stream': '#00CC00',
                    'Impala write': '#0000CC',
                    'ERROR': '#333333',
                }[flag];
            },
            helpLink: 'hadoop/impala.html#using-impala-to-write-outputs'
        });
    }
});


app.service('HiveModeView', function(StandardFlowViews) {
    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('HIVE_MODE', 'Hive mode', {
            getRepr: function(val) {
                if (val == "HIVECLI_LOCAL") return "Hive CLI (isolated metastore)";
                if (val == "HIVECLI_GLOBAL") return "Hive CLI (global metastore)";
                if (val == "HIVESERVER2") return "HiveServer2";
                return val;
            },
            colorMap: function(flag) {
                return {
                    'Hive CLI (isolated metastore)': 'blue',
                    'Hive CLI (global metastore)': 'pink',
                    'HiveServer2': 'purple',
                    'ERROR': 'red',
                }[flag];
            },
            helpLink: 'hadoop/hive.html#recipes'
        });
    }
});

app.service('SparkEngineView', function(StandardFlowViews) {
    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('SPARK_ENGINE', 'Spark execution engine', {
            getRepr: function(val) {
                if (val == "SPARK_SUBMIT") return "CLI (spark-submit)";
                if (val == "LIVY_BATCH") return "Livy";
                return val;
            },
            colorMap: function(flag) {
                return {
                    'CLI (spark-submit)': 'blue',
                    'Livy': 'purple',
                    'ERROR': 'red',
                }[flag];
            },
            helpLink: 'spark/usage.html'
        });
    }
});


app.service('PartitioningView', function(ColorPalettesService, StandardFlowViews) {
    this.getDefinition = function() {
        const colorPalette = ColorPalettesService.fixedColorsPalette('partitioning-flow-view');

        return StandardFlowViews.getDefinition('PARTITIONING',  'Partitioning schemes', {
            getRepr: function(val) {
                if (val.dimensions.length) {
                    return val.dimensions.map(x => x.name).sort().join(', ');
                } else {
                    return 'Not partitioned';
                }
            },
            colorMap: function(repr) {
                if (repr == 'Not partitioned') {
                    return '#333';
                }
                return colorPalette(repr);
            },
            helpLink: 'partitions/index.html',
            tooltipTemplate: '/templates/flow-editor/tools/partitioning-view-tooltip.html',
        });
    }
});


app.service('PartitionsView', function($filter, StandardFlowViews) {
    let colorScale;

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('PARTITIONS', 'Partitions count', {
            getRepr: function(val) {
                return val;
            },
            postInit: function(tool) {
                const DISCRETE_THRESHOLD = 6; // A change of 1 can be significant: for low cardinality, we use discrete map
                const LOG_SCALE_THRESHOLD = 20; // In continuous mode, if max/min > LOG_SCALE_THRESHOLD, we use log color scale
                colorScale = makeSmartIntegerColorScale(tool, DISCRETE_THRESHOLD, LOG_SCALE_THRESHOLD);
            },
            colorMap: function(repr, tool) {
                return applySmartColorScale(repr, tool, colorScale);
            },
            helpLink: 'partitions/index.html',
            tooltipTemplate: '/templates/flow-editor/tools/partitions-view-tooltip.html',
        });
    }
});


app.service('DatasetMetricsView', function($filter, StandardFlowViews) {
    let colorScale;

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('METRICS', 'Metrics', {

        });
    }
});


app.service('DatasetChecksView', function($filter, StandardFlowViews) {
    let colorScale;

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('CHECKS', 'Checks', {

        });
    }
});


app.service('RecentActivityView', function(StandardFlowViews) {
    let colorScale;

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('RECENT_ACTIVITY', 'Recent modifications', {
            getRepr: function(val) {
                return val.numberOfModifications;
            },
            postInit: function(tool) {
                if (!tool.currentSession.options.since) {
                    const lastWeek = new Date(new Date().getTime()-7*24*3600*1000);
                    tool.currentSession.options.since = lastWeek;
                }
                const DISCRETE_THRESHOLD = 6; // Don't use discrete color map
                const LOG_SCALE_THRESHOLD = 20; // In continuous mode, if max/min > LOG_SCALE_THRESHOLD, we use log color scale
                colorScale = makeSmartIntegerColorScale(tool, DISCRETE_THRESHOLD, LOG_SCALE_THRESHOLD);
            },
            colorMap: function(repr, tool) {
                return applySmartColorScale(repr, tool, colorScale);
            },
            tooltipTemplate: '/templates/flow-editor/tools/recent-activity-view-tooltip.html',
            settingsTemplate: '/templates/flow-editor/tools/recent-activity-settings.html'
        });
    }
});


app.service('FilesizeView', function($filter, StandardFlowViews) {
    let colorScale;

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('FILESIZE', 'File size', {
            scaleUnit: 'FILESIZE',
            getRepr: function(val) {
                let totalValue = parseFloat(val.size.totalValue);
                if (isNaN(totalValue) || totalValue <= 0) {
                    return 'Unknown';
                }
                return totalValue;
            },
            postInit: function(tool) {
                const DISCRETE_THRESHOLD = 0; // Don't use discrete color map
                const LOG_SCALE_THRESHOLD = 20; // In continuous mode, if max/min > LOG_SCALE_THRESHOLD, we use log color scale
                colorScale = makeSmartIntegerColorScale(tool, DISCRETE_THRESHOLD, LOG_SCALE_THRESHOLD);
            },
            colorMap: function(repr, tool) {
                return applySmartColorScale(repr, tool, colorScale);
            },
            colorScale: function() {
                return colorScale;
            },
            tooltipTemplate: '/templates/flow-editor/tools/filesize-view-tooltip.html',
        });
    }
});


app.service('CountOfRecordsView', function(StandardFlowViews) {
    let colorScale;
    let values;
    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('COUNT_OF_RECORDS', 'Count of records', {
            getRepr: function(val) {
                let totalValue = parseFloat(val.countOfRecords.totalValue);
                if (totalValue == -1) {
                    return 'Unknown';
                }
                return totalValue;
            },
            postInit: function(tool) {
                const DISCRETE_THRESHOLD = 6; // A change of 1 can be significant: for low cardinality, we use discrete map
                const LOG_SCALE_THRESHOLD = 20; // In continuous mode, if max/min > LOG_SCALE_THRESHOLD, we use log color scale
                colorScale = makeSmartIntegerColorScale(tool, DISCRETE_THRESHOLD, LOG_SCALE_THRESHOLD);
            },
            colorMap: function(repr, tool) {
                return applySmartColorScale(repr, tool, colorScale);
            },
            totem: function(val) {
                return {
                    class: 'icon-refresh '+(val.autoCompute ? 'flow-totem-ok' : 'flow-totem-disabled'),
                    style: ''
                }
            },
            colorScale: function() {
                return colorScale;
            },
            tooltipTemplate: '/templates/flow-editor/tools/count-of-records-view-tooltip.html',
        });
    }
});



const DATE_REPR = [
    'Just now',
    'Past hour',
    'Past 24h',
    'Past week',
    'Past month',
    'Past year',
    'More than a year ago',
    'Unknown'
];
function simpleTimeDelta(timestamp) {
    if (typeof timestamp == 'string' && !isNaN(parseFloat(timestamp))) { //TODO @flow dirty
        timestamp = parseFloat(timestamp);
    }
    if (!timestamp || typeof timestamp != 'number') {
        return DATE_REPR[7];
    }
    const seconds = (new Date().getTime() - timestamp)/1000;
    if (seconds < 60) {
        return DATE_REPR[0];
    }
    if (seconds < 3600) {
        return DATE_REPR[1];
    }
    if (seconds < 3600*24) {
        return DATE_REPR[2];
    }
    if (seconds < 3600*24*7) {
        return DATE_REPR[3];
    }
    if (seconds < 3600*24*30) {
        return DATE_REPR[4];
    }
    if (seconds < 3600*24*365) {
        return DATE_REPR[5];
    }
    return DATE_REPR[6];
}



app.service('CreationView', function($filter, StandardFlowViews, UserImageUrl, Fn, FlowTool, ColorPalettesService) {

    const colorPalette = ColorPalettesService.fixedColorsPalette('creation-flow-view');
    const viewByUser = {
        getRepr: function(val) {
            return val.userLogin;
        },
        listValuesForLegend: function(list) {
            return list;
        },
        colorMap: function(repr, tool) {
            return colorPalette(repr);
        }
    };
    const viewByDate = {
        getRepr: function(val) {
            const time = parseFloat(val.time);
            return simpleTimeDelta(time);
        },
        listValuesForLegend: function(list) {
            return DATE_REPR.filter(x => list.includes(x));
        },
        colorMap: function(repr, tool) {
            const idx = tool.user.state.values.indexOf(repr);
            if (idx < 0) {
                throw new Error("Value not listed");
            }
            const values = tool.user.state.values.filter(v => v != 'Unknown');
            const scale = makeDiscreteBlueScale(values.length);
            return scale[idx];
        }
    };

    function getSubview() {
        const mode = FlowTool.getCurrent().currentSession.options.mode;
        if (mode == 'BY_USER') {
            return viewByUser;
        }
        return viewByDate;
    }

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('CREATION', 'Creation', {
            postInit: function(tool) {
                tool.currentSession.options.mode = tool.currentSession.options.mode || 'BY_DATE';
            },
            getRepr: function(val) {
                if (!val) return;
                return getSubview().getRepr(val);
            },
            listValuesForLegend: function(list) {
                return getSubview().listValuesForLegend(list);
            },
            colorMap: function(repr, tool) {
                return getSubview().colorMap(repr, tool);
            },
            totem: function(val) {
                return {
                    class: 'avatar32',
                    style: "background-image: url('"+UserImageUrl(val.userLogin, 128)+"')"
                };
            },
            tooltipTemplate: '/templates/flow-editor/tools/creation-view-tooltip.html',
            settingsTemplate: '/templates/flow-editor/tools/creation-view-settings.html'
        });
    };
});


app.service('LastModifiedView', function($filter, StandardFlowViews, UserImageUrl, Fn, FlowTool, ColorPalettesService) {

    const colorPalette = ColorPalettesService.fixedColorsPalette('creation-flow-view');
    const viewByUser = {
        getRepr: function(val) {
            return val.userLogin;
        },
        listValuesForLegend: function(list) {
            return list;
        },
        colorMap: function(repr, tool) {
            return colorPalette(repr);
        }
    };
    const viewByDate = {
        getRepr: function(val) {
            const time = parseFloat(val.time);
            return simpleTimeDelta(time);
        },
        listValuesForLegend: function(list) {
            return DATE_REPR.filter(x => list.includes(x));
        },
        colorMap: function(repr, tool) {
            const idx = tool.user.state.values.indexOf(repr);
            if (idx < 0) {
                throw new Error("Value not listed");
            }
            const values = tool.user.state.values.filter(v => v != 'Unknown');
            const scale = makeDiscreteBlueScale(values.length);
            return scale[idx];
        }
    };

    function getSubview() {
        const mode = FlowTool.getCurrent().currentSession.options.mode;
        if (mode == 'BY_USER') {
            return viewByUser;
        }
        return viewByDate;
    }

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('LAST_MODIFICATION', 'Last modification', {
            postInit: function(tool) {
                tool.currentSession.options.mode = tool.currentSession.options.mode || 'BY_DATE';
            },
            getRepr: function(val) {
                if (!val) return;
                return getSubview().getRepr(val);
            },
            listValuesForLegend: function(list) {
                return getSubview().listValuesForLegend(list);
            },
            colorMap: function(repr, tool) {
                return getSubview().colorMap(repr, tool);
            },
            totem: function(val) {
                return {
                    class: 'avatar32',
                    style: "background-image: url('"+UserImageUrl(val.userLogin, 128)+"')"
                };
            },
            tooltipTemplate: '/templates/flow-editor/tools/last-modification-view-tooltip.html',
            settingsTemplate: '/templates/flow-editor/tools/last-modification-view-settings.html',
        });
    };
});


app.service('LastBuildView', function($filter, StandardFlowViews, Fn) {

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('LAST_BUILD', 'Last build', {
            getRepr: function(val) {
                if (!val) return;
                const time = parseFloat(val.buildEndTime);
                return simpleTimeDelta(time);
            },
            listValuesForLegend: function(list) {
                return DATE_REPR.filter(x => list.includes(x));
            },
            totem: function(val) {
                return {
                    class: val.buildSuccess ? 'icon-ok flow-totem-ok' : 'icon-remove flow-totem-error',
                    style: ''
                }
            },
            colorMap: function(repr, tool) {
                const idx = tool.user.state.values.indexOf(repr);
                if (idx < 0) {
                    throw new Error("Value not listed");
                }
                const values = tool.user.state.values.filter(v => v != 'Unknown');
                const scale = makeDiscreteBlueScale(values.length);
                return scale[idx];
            },
            tooltipTemplate: '/templates/flow-editor/tools/last-build-view-tooltip.html',
        });
    };
});


app.service('LastBuildDurationView', function(StandardFlowViews, FlowTool) {
    let lastSelectedScale = 'LINEAR';
    let linearColorScale, logColorScale;
    const getColorScale = () => FlowTool.getCurrent().currentSession.options.scale === 'LINEAR' ? linearColorScale : logColorScale;

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('LAST_BUILD_DURATION', 'Last build duration', {
            scaleUnit: 'DURATION',
            getRepr: function(val) {
                if (val < 0) return;
                return val;
            },
            postInit: function(tool) {
                tool.currentSession.options.scale = tool.currentSession.options.scale || lastSelectedScale;
                lastSelectedScale = tool.currentSession.options.scale;
                linearColorScale = makeSmartIntegerColorScale(tool, 0, Infinity, timeColorRange);
                logColorScale = makeSmartIntegerColorScale(tool, 0, 0, timeColorRange);
            },
            colorMap: function(repr, tool) {
                return applySmartColorScale(repr, tool, getColorScale());
            },
            colorScale: function() {
                return getColorScale();
            },
            colorSuccessorsWithSameColor: true,
            tooltipTemplate: '/templates/flow-editor/tools/last-build-duration-view-tooltip.html',
            settingsTemplate: '/templates/flow-editor/tools/last-build-duration-view-settings.html',
        });
    };
});

app.service('RecipesEnginesView', function($filter, StandardFlowViews) {
    const COLORS = { //Keep this in order of display
        Spark: '#f28c38',
        Impala: '#795548',
        Hive: '#f9bd38',
        'Hadoop mapreduce': '#bfcd31',
        Pig: '#f48fb1',
        'S3 to redshift': '#c85dcb',
        Sql: '#28aadd',

        DSS: '#2ab1ac',

        'Docker/kubernetes': '#386fde',
        'User code in container': '#4E77B1',

        'User code': '#607d8b',
        'Plugin code': '#8541aa',

        Other: '#333333',
        Error: '#ff0000'
    };

    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('RECIPES_ENGINES', 'Recipe engines', {
            colorSuccessorsWithSameColor: true,
            colorMap: engineType => COLORS[engineType],
            getRepr: function(engineStatus) {
                if (engineStatus.type == 'DSS') {
                    return 'DSS';
                } else {
                    return $filter('capitalize')(engineStatus.type.toLowerCase().replace('_', ' '));
                }
            },
            listValuesForLegend: function(list) {
                return Object.keys(COLORS).filter(x => list.includes(x));
            },

            totem: function(val) {
                return {
                    class: val.statusWarnLevel == 'ERROR' ? 'icon-remove flow-totem-error' : '',
                    style: ''
                }
            },
            tooltipTemplate: '/templates/flow-editor/tools/recipes-engines-view-tooltip.html'
        });
    }
});

app.service('RecipesCodeEnvsView', function($filter, StandardFlowViews, ColorPalettesService) {
    const colorPalette = ColorPalettesService.fixedColorsPalette('code-envs-flow-view');
    this.getDefinition = function() {
        return StandardFlowViews.getDefinition('RECIPES_CODE_ENVS', 'Recipe code environments', {
            colorMap: function(repr) {
                if (repr === 'DSS builtin env') {
                    return '#4d4d4d';
                } else {
                    return colorPalette(repr);
                }
            },
            getRepr: function(codeEnvState) {
                return codeEnvState.selectedEnvName || codeEnvState.envName || 'DSS builtin env';
            },

            totem: function(val) {
                return {
                    class: val.preventedByProjectSettings ? 'icon-remove flow-totem-error' : '',
                    style: ''
                }
            },
            tooltipTemplate: '/templates/flow-editor/tools/recipes-code-envs-view-tooltip.html',
            helpLink: 'code-envs/index.html'
        });
    }
});

app.service('StandardFlowViews', function($stateParams, $rootScope, Debounce, DataikuAPI, FlowToolsUtils, FlowViewsUtils, FlowGraph, FlowGraphHighlighting, Logger) {
this.getDefinition = function(name, displayName, {
        getRepr,
        listValuesForLegend,
        colorMap,
        colorScale,
        colorSuccessorsWithSameColor,
        totem,
        autoSelectFirstOnly,
        tooltipTemplate,
        settingsTemplate,
        helpLink,
        postInit,
        postProcessNode,
        actions,
        scaleUnit, // (optional) allows to choose how the tool scale will be lableled. Options are 'FILESIZE', 'DURATION', anything else will display the value as a number.
    }) {

    return {
        getName: () => name,
        getToolDisplayName: () => displayName,

        initFlowTool : function(tool) {
            tool.user = {};
            tool.projectKey = $stateParams.projectKey;

            tool.refreshState = function(needToResetFocused, needToUpdateGraphTags) {
                DataikuAPI.flow.tools.getState($stateParams.projectKey, name, tool.currentSession.options).success(function(data) {
                    tool.user.state = data;
                    if (needToResetFocused) {
                        tool.user.state.focused = tool.user.state.values;
                    } else {
                        tool.currentSession.options.mode = tool.user.state.mode;
                    }

                    if (needToUpdateGraphTags) {
                        FlowGraph.updateTagsFromFlowTool(tool.user.state.valueByNode);
                    }

                    const countByValue = {};
                    $.each(tool.user.state.valueByNode, function(nodeId, val) {
                        const repr = getRepr(val);
                        if (angular.isArray(repr)) {
                            repr.forEach(function(it) {
                                countByValue[it] = (countByValue[it] || 0) + 1;
                            });
                        } else if (repr !== null && repr !== undefined) {
                            countByValue[repr] = (countByValue[repr] || 0) + 1;
                        }
                    });
                    tool.user.state.countByValue = countByValue;
                    tool.user.state.values = Object.keys(countByValue);
                    if (listValuesForLegend) { // The order of values is not standard
                        tool.user.state.values = listValuesForLegend(tool.user.state.values, tool);
                    } else {
                        tool.user.state.values.sort();
                    }

                    tool.user.state.focusMap = {};
                    try {
                        if (!tool.user.state.focused || !tool.user.state.focused.length) {
                            if (autoSelectFirstOnly) {
                                if (tool.user.state.values.length) {
                                    const first = listValuesForLegend(tool.user.state.values, tool)[0];
                                    tool.user.state.focusMap[first] = true;
                                }
                            } else {
                                tool.user.state.values.forEach(function(v) {
                                    tool.user.state.focusMap[v] = true;
                                });
                            }
                        } else {
                            tool.user.state.focused.forEach(function(v) {
                                tool.user.state.focusMap[v] = true;
                            })
                        }
                    } catch (e) {
                        Logger.error(e);
                    }

                    if (postInit) {
                        postInit(tool);
                    }

                    tool.drawHooks.updateFlowToolDisplay();
                }).error(FlowGraph.setError());
            };

            tool.refreshStateLater = Debounce().withDelay(400, 400).wrap(tool.refreshState);

            FlowViewsUtils.addFocusBehavior(tool, true);

            tool.user.getColor = function(repr) {
                if (repr == 'Unknown') {
                    return '#333';
                }
                return colorMap(repr, tool);
            };

            function colorNode(nodeId, node, val) {
                const isZone = node.nodeType === 'ZONE';
                const nodeElt = isZone ? FlowGraph.d3ZoneNodeWithId(nodeId) : FlowGraph.d3NodeWithId(nodeId);
                const focused = tool.user.needFocusClass ? tool.user.needFocusClass(val, node.realId) : true;
                nodeElt.classed('focus', focused).classed('out-of-focus', false);
                const repr = getRepr(val);
                if (repr === null) {
                    return;
                }
                const color = tool.user.getColor(repr);
                if (!color) {
                    Logger.debug('No color');
                    return;
                }
                FlowToolsUtils.colorNode(node, nodeElt, color);
            }

            tool.drawHooks.updateFlowToolDisplay = function() {
                if (!tool.user.state) return; // protect against slow state fetching
                if (!FlowGraph.ready()) return; // protect against slow graph fetching

                // TODO @flow too slow?
                $.each(FlowGraph.get().nodes, function(nodeId, node) {
                    let realNodeId = node.realId || nodeId;
                    if (tool.user.state.valueByNode[realNodeId] === undefined) {
                        const nodeElt = FlowGraph.d3NodeWithId(nodeId);
                        nodeElt.classed('focus', false).classed('out-of-focus', true);
                        $('.node-totem span', nodeElt[0]).removeAttr('style').removeClass();
                        $('.never-built-computable *', nodeElt[0]).removeAttr('style');
                    }
                });

                $('.tool-simple-zone', FlowGraph.getSvg()).empty();

                // We first iterate over all non-recipes then on recipes,
                // This is because in some cases, recipes color their outputs
                function styleNodes(recipesOnly) {
                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        let val = tool.user.state.valueByNode[node.realId];
                        if (!node) { // If some nodes are broken, they might not be rendered in the flow
                            return;
                        }
                        const isRecipe = node.nodeType == 'RECIPE';
                        if (recipesOnly != isRecipe) {
                            return;
                        }
                        const isZone = node.nodeType == "ZONE";
                        if (isZone && tool.user.state.focusMap[node.name] && !$stateParams.zoneId) {
                            FlowGraphHighlighting.highlightZoneCluster(d3.select(`g[id=cluster_zone_${node.name}]`)[0][0], colorMap(node.name));
                        }
                        if (val !== undefined) {
                            const nodeElt = isZone ? FlowGraph.d3ZoneNodeWithId(nodeId) : FlowGraph.d3NodeWithId(nodeId);
                            if (tool.user.isFocused(val)) {
                                colorNode(nodeId, node, val);
                                if (recipesOnly && colorSuccessorsWithSameColor) {
                                    $.each(node.successors, function(index, nodeId2) {
                                        colorNode(nodeId2, FlowGraph.node(nodeId2), val);
                                    });
                                }
                            } else {
                                nodeElt.classed('focus', false).classed('out-of-focus', true);
                            }

                            const nodeTotem = $('.node-totem span', nodeElt[0]);
                            nodeTotem.removeAttr('style').removeClass();
                            if (totem && totem(val)) {
                                nodeTotem.attr('style', totem(val).style).addClass(totem(val).class);
                            }

                            if (postProcessNode) {
                                postProcessNode(val, nodeElt, tool);
                            }
                        }
                    });
                }
                d3.selectAll(".zone_cluster.clusterHighlight").each(function() {
                    this.style.backgroundColor = null;
                    this.style.color = "#000"; // Because default background is whitish
                }).classed("clusterHighlight", false);
                styleNodes(false);
                styleNodes(true);
            };

            tool.drawHooks.setupTootip = function(node) {
                if (!tool.user || !tool.user.state) return;
                const tooltip = {};
                tooltip.val = tool.user.state.valueByNode[node.realId];
                tooltip.template = tooltipTemplate || '/templates/flow-editor/tools/default-view-tooltip.html';
                if (!tooltip.val || getRepr(tooltip.val) == null) {
                    return tooltip;
                }
                const repr = getRepr(tooltip.val);
                let bulletText = tool.type == "FLOW_ZONES" ? tooltip.val.name : repr;
                tooltip.bullets = [{text: bulletText, color: tool.user.getColor(repr)}];
                return tooltip;
            };

            tool.saveFocus = function() {
                const focusedList = [];
                $.each(tool.user.state.focusMap, function (val, f) {
                    if (f) {
                        focusedList.push(val);
                    }
                });
                DataikuAPI.flow.tools.setFocused($stateParams.projectKey, focusedList, tool.currentSession.options.mode).error(FlowGraph.setError());
            };

            tool.helpLink = helpLink;
            tool.getRepr = getRepr;
            tool.colorScale = colorScale;
            tool.def.settingsTemplate = settingsTemplate;
            tool.currentSession.options = {};
            tool.actions = actions;
            tool.scaleUnit = scaleUnit;

            tool.refreshState();
        },

        template: '/templates/flow-editor/tools/standard-flow-view.html'
    };
};

function makeForeignObject(attrs, jq) {
    const el = makeSVG('foreignObject', attrs)
    $(el).append(jq);
    return el;
}
});


app.controller("StandardFlowViewsMainController", function($scope, FlowTool) {
    $scope.tool = FlowTool.getCurrent();
});

function makeDiscreteBlueScale(cardinality) {
    if (!(cardinality > -1 && cardinality < 8)) {
        throw new Error("Color scales can only be 0 to 7 colors. Got "+cardinality);
    }
    return [
        [],
        ['#5479D5'],
        ['#5479D5','#94CEF9'],
        ['#304389','#5479D5','#94CEF9'],
        ['#304389','#3E58B2','#6B9DED','#94CEF9',],
        ['#304389','#3E58B2','#6B9DED','#94CEF9','#B3E7FC'],
        ['#304389','#3E58B2','#5479D5','#6B9DED','#94CEF9','#B3E7FC'],
        ['#1C2D71','#304389','#3E58B2','#5479D5','#6B9DED','#94CEF9','#B3E7FC'],
    ][cardinality]
}

const viridisRange = ["#440154","#440256","#450457","#450559","#46075a","#46085c","#460a5d","#460b5e",
                    "#470d60","#470e61","#471063","#471164","#471365","#481467","#481668","#481769",
                    "#48186a","#481a6c","#481b6d","#481c6e","#481d6f","#481f70","#482071","#482173",
                    "#482374","#482475","#482576","#482677","#482878","#482979","#472a7a","#472c7a",
                    "#472d7b","#472e7c","#472f7d","#46307e","#46327e","#46337f","#463480","#453581",
                    "#453781","#453882","#443983","#443a83","#443b84","#433d84","#433e85","#423f85",
                    "#424086","#424186","#414287","#414487","#404588","#404688","#3f4788","#3f4889",
                    "#3e4989","#3e4a89","#3e4c8a","#3d4d8a","#3d4e8a","#3c4f8a","#3c508b","#3b518b",
                    "#3b528b","#3a538b","#3a548c","#39558c","#39568c","#38588c","#38598c","#375a8c",
                    "#375b8d","#365c8d","#365d8d","#355e8d","#355f8d","#34608d","#34618d","#33628d",
                    "#33638d","#32648e","#32658e","#31668e","#31678e","#31688e","#30698e","#306a8e",
                    "#2f6b8e","#2f6c8e","#2e6d8e","#2e6e8e","#2e6f8e","#2d708e","#2d718e","#2c718e",
                    "#2c728e","#2c738e","#2b748e","#2b758e","#2a768e","#2a778e","#2a788e","#29798e",
                    "#297a8e","#297b8e","#287c8e","#287d8e","#277e8e","#277f8e","#27808e","#26818e",
                    "#26828e","#26828e","#25838e","#25848e","#25858e","#24868e","#24878e","#23888e",
                    "#23898e","#238a8d","#228b8d","#228c8d","#228d8d","#218e8d","#218f8d","#21908d",
                    "#21918c","#20928c","#20928c","#20938c","#1f948c","#1f958b","#1f968b","#1f978b",
                    "#1f988b","#1f998a","#1f9a8a","#1e9b8a","#1e9c89","#1e9d89","#1f9e89","#1f9f88",
                    "#1fa088","#1fa188","#1fa187","#1fa287","#20a386","#20a486","#21a585","#21a685",
                    "#22a785","#22a884","#23a983","#24aa83","#25ab82","#25ac82","#26ad81","#27ad81",
                    "#28ae80","#29af7f","#2ab07f","#2cb17e","#2db27d","#2eb37c","#2fb47c","#31b57b",
                    "#32b67a","#34b679","#35b779","#37b878","#38b977","#3aba76","#3bbb75","#3dbc74",
                    "#3fbc73","#40bd72","#42be71","#44bf70","#46c06f","#48c16e","#4ac16d","#4cc26c",
                    "#4ec36b","#50c46a","#52c569","#54c568","#56c667","#58c765","#5ac864","#5cc863",
                    "#5ec962","#60ca60","#63cb5f","#65cb5e","#67cc5c","#69cd5b","#6ccd5a","#6ece58",
                    "#70cf57","#73d056","#75d054","#77d153","#7ad151","#7cd250","#7fd34e","#81d34d",
                    "#84d44b","#86d549","#89d548","#8bd646","#8ed645","#90d743","#93d741","#95d840",
                    "#98d83e","#9bd93c","#9dd93b","#a0da39","#a2da37","#a5db36","#a8db34","#aadc32",
                    "#addc30","#b0dd2f","#b2dd2d","#b5de2b","#b8de29","#bade28","#bddf26","#c0df25",
                    "#c2df23","#c5e021","#c8e020","#cae11f","#cde11d","#d0e11c","#d2e21b","#d5e21a",
                    "#d8e219","#dae319","#dde318","#dfe318","#e2e418","#e5e419","#e7e419","#eae51a",
                    "#ece51b","#efe51c","#f1e51d","#f4e61e","#f6e620","#f8e621","#fbe723","#fde725"].reverse();

const timeColorRange = ["#D2030E", "#D3090E", "#D40F0F", "#D51610", "#D71D11", "#D82311", "#D92912",
                        "#DA3013", "#DB3613", "#DD3C14", "#DE4115", "#DE4415", "#DF4716", "#E04B17",
                        "#E14E18", "#E15118", "#E25419", "#E3581A", "#E45B1B", "#E45E1B", "#E5621C",
                        "#E6651D", "#E7681E", "#E76B1E", "#E86F1F", "#E97320", "#E97721", "#EA7A22",
                        "#EB7E23", "#EB8124", "#EC8525", "#ED8926", "#ED8C27", "#EE9028", "#EF9429",
                        "#EF982A", "#F09B2B", "#F09E2C", "#F1A22D", "#F1A52E", "#F1A82F", "#F2AC30",
                        "#F2AF31", "#F3B232", "#F3B633", "#F3B934", "#F4BD35", "#F4C036", "#F0C03B",
                        "#E5BE47", "#DDBB52", "#D4B95C", "#CBB765", "#C2B570", "#B9B27B", "#AFB086",
                        "#A7AE90", "#9EAB9A", "#94A9A5", "#8BA7AF", "#83A5B9", "#7AA2C4", "#70A0CF",
                        "#699DD6", "#669BD4", "#6498D3", "#6296D1", "#5F93CF", "#5D90CD", "#5B8DCC",
                        "#588BCA", "#5688C8", "#5485C7", "#5182C5", "#4F80C3", "#4D7EC2", "#4A7BC0",
                        "#4879BE", "#4577BC", "#4374BB", "#4072B9", "#3E70B7", "#3B6DB6", "#396BB4",
                        "#3668B2", "#3466B1", "#3265B0", "#3063AE", "#2E62AD", "#2C60AC", "#2A5EAB",
                        "#285DAA", "#265BA9", "#245AA7", "#2258A6", "#1F56A5", "#1D55A4", "#1B53A3",
                        "#1952A2", "#1750A1"].reverse();

function makeSmartScale(range, domain, log = false) {
    const minValue = domain[0];
    const maxValue = domain[1];
    return function(val) {
        const n = range.length;
        let t = log ? (Math.log10(val) - Math.log10(minValue)) / (Math.log10(maxValue) - Math.log10(minValue)) : ((val - minValue) / (maxValue - minValue));
        return range[Math.max(0, Math.min(n - 1, Math.floor(t * n)))];
    };
}

function makeSmartIntegerColorScale(tool, discreteThreshold, logScaleThreshold, range = viridisRange) {
    const colorScale = {};

    // convert to number (when possible)
    tool.user.state.values = tool.user.state.values.map(x => !isNaN(parseFloat(x)) ? parseFloat(x) : x);
    tool.user.state.values.sort((a,b) => typeof a == 'number' && typeof b == 'number' ? b - a : -1);

    const numberValues = tool.user.state.values.filter(x => typeof x == 'number');
    const maxValue = Math.max.apply(null, numberValues);
    const minValue = Math.min.apply(null, numberValues);
    if (maxValue == -Infinity) {
        colorScale.mode = 'ERROR';
    } else if (tool.user.state.values.length < discreteThreshold) {
        colorScale.mode = 'DISCRETE';
        colorScale.domain = [0, Math.max(numberValues.length - 1, 1)];
    } else {
        const nonZeroValues = tool.user.state.values.filter(x => typeof x == 'number' && x > 0);
        const nonZeroMaxValue = Math.max.apply(null, nonZeroValues);
        const nonZeroMinValue = Math.min.apply(null, nonZeroValues);
        if (nonZeroMaxValue != -Infinity && nonZeroMaxValue != nonZeroMinValue && nonZeroMaxValue / nonZeroMinValue > logScaleThreshold) {
            colorScale.mode = 'CONTINUOUS_LOG';
            colorScale.continuous = true;
            colorScale.log = true;
            // domain size is not 0
            colorScale.domain = [nonZeroMinValue, nonZeroMaxValue];
        } else {
            colorScale.mode = 'CONTINUOUS_LINEAR';
            colorScale.continuous = true;
            colorScale.log = false;
            colorScale.domain = [minValue, maxValue];
            if (colorScale.domain[0] == colorScale.domain[1]) {
                colorScale.domain[0] = 0; // todo check if its okay
            }
        }
    }
    if (colorScale.mode != 'ERROR') {
        colorScale.range = range;
        colorScale.scale = makeSmartScale(colorScale.range, colorScale.domain, !!colorScale.log);
    }

    return colorScale;
}

function applySmartColorScale(repr, tool, colorScale) {
    if (colorScale.mode == 'DISCRETE') {
        const numberValues = tool.user.state.values.filter(x => typeof x == 'number');
        numberValues.sort((a,b) => typeof a == 'number' && typeof b == 'number' ? a - b : -1);
        return colorScale.scale(numberValues.indexOf(repr));
    } else if (colorScale.mode == 'CONTINUOUS_LINEAR') {
        return colorScale.scale(repr);
    } else if (colorScale.mode == 'CONTINUOUS_LOG') {
        if (repr == 0) {
            return colorScale.range[0]; // Log scale can't handle 0, fallback to edge of range
        }
        return colorScale.scale(repr);
    }
}

})();
