(function() {
'use strict';

const app = angular.module('dataiku.directives.widgets');

function setArrayValues(array = [], newValues) {
    array.length = 0;
    array.push(...newValues);
    return array;
}


app.directive("autoconfigFormElement", function($stateParams, DataikuAPI, Logger, CodeMirrorSettingService, CustomUISetup) {
    return {
        scope: {
            paramDesc: '=',
            model: '=',
            columnsPerInputRole: '=',
            chart: '=',
            side: '=',
            activeDragDrop: '=',
            validity: '=',
            pluginId: '=',
            componentId: '=',
            disabled: '=',
            viewMode: '=',
            errorScope: '<',
            recipeConfig: '=',
            addReloadCustomChoicesCallback: '<'
        },
        templateUrl: '/templates/widgets/autoconfig/form-element.html',
        link: function($scope, elem, attrs) {
            $scope.model = $scope.model || {};
            if ($scope.paramDesc.type === 'DATASET'){
                $scope.newDataset = {};
            }
            /* Watchers for values that depend on other fields (visibility, dataset columns.. */
            $scope.uiState = {};
            $scope.codeMirrorSettingService = CodeMirrorSettingService;

            if (!$scope.errorScope) {
                Logger.error("errorScope not specified"); // could be an assert, just for debug puposes
            }
            function fetchAccessibleFolders() {
                DataikuAPI.managedfolder.listWithAccessible($stateParams.projectKey).success(function (data) {
                    data.forEach(folder => { folder.foreign = (folder.projectKey != $stateParams.projectKey); });
                    if (!$scope.paramDesc.canSelectForeign) {
                        data = data.filter(folder => !folder.foreign);
                    }
                    $scope.accessibleFolders = data.map(ds => ({
                        ref: ds.foreign ? (ds.projectKey + '.' + ds.id) : ds.id,
                        displayName: ds.name + (ds.foreign ? ('(' + ds.projectKey + ')') : '')
                    }));
                }).error(setErrorInScope.bind($scope.errorScope));
            }

            function fetchFolderFilesRecursively(folderId, pathsList, mappingFunction, basePath='/') {
                DataikuAPI.managedfolder.browse($stateParams.projectKey, folderId, basePath).success(function (data) {
                    data.children && data.children.forEach(file => {
                        if (file.directory === true) {
                            fetchFolderFilesRecursively(folderId, pathsList, mappingFunction, file.fullPath);
                        } else {
                            let matchingPath = mappingFunction(file);
                            if (matchingPath) {
                                pathsList.push(matchingPath);
                            }
                        }
                    })
                }).error(setErrorInScope.bind($scope.errorScope));
            }

            if ($scope.model[$scope.paramDesc.name] === undefined) {
                if ($scope.paramDesc.defaultValue !== undefined) {
                    $scope.model[$scope.paramDesc.name] = $scope.paramDesc.defaultValue;
                } else if ($scope.paramDesc.type == 'INT' || $scope.paramDesc.type == 'DOUBLE') {
                    $scope.model[$scope.paramDesc.name] = 0; //important, otherwise angular UI shows 0 but the model is not set to 0
                }
            }

            // Visibility
            if ($scope.paramDesc.visibilityCondition) {
                $scope.$watch('model', function() {
                    $scope.uiState.$visibility = $scope.$eval($scope.paramDesc.visibilityCondition);
                }, true);
            }

            // Date string must be parsed in Date object
            if ($scope.paramDesc.type === 'DATE') {
                $scope.model[$scope.paramDesc.name] = new Date($scope.model[$scope.paramDesc.name]);
            }

            // Value of the dataset from which to select a column
            function updateAccessibleColumns(datasetRef) {
                if ($scope.viewMode) return;
                if (datasetRef) {
                    let projectKey = $stateParams.projectKey;
                    let datasetName = datasetRef;
                    const dotPos = datasetRef.indexOf('.');
                    if (dotPos > 0) {
                        projectKey = datasetRef.substring(0, dotPos);
                        datasetName = datasetRef.substring(dotPos + 1);
                    }
                    DataikuAPI.datasets.get(projectKey, datasetName, $stateParams.projectKey).success(function(data) {
                        $scope.accessibleDatasetColumns = data.schema.columns.map(col => ({
                            ref: col.name,
                            displayName: col.name,
                            type: col.type
                        }));
                        if ($scope.paramDesc.allowedColumnTypes && $scope.paramDesc.allowedColumnTypes.length) {
                            $scope.accessibleDatasetColumns = $scope.accessibleDatasetColumns.filter(col => $scope.paramDesc.allowedColumnTypes.includes(col.type));
                        }
                        $scope.accessibleDatasetColumnsList = $scope.accessibleDatasetColumns.map(x => x.ref);
                    }).error(setErrorInScope.bind($scope.errorScope));
                } else {
                    $scope.accessibleDatasetColumns = [];
                    $scope.accessibleDatasetColumnsList = [];
                }
            };

            if ($scope.paramDesc.datasetParamName) {
                $scope.$watch('model.' + $scope.paramDesc.datasetParamName, updateAccessibleColumns, true);
            } else if (['DATASET_COLUMN', 'DATASET_COLUMNS'].includes($scope.paramDesc.type)) {
                updateAccessibleColumns($stateParams.datasetName);
            }

            if (['COLUMN', 'COLUMNS'].includes($scope.paramDesc.type)) {
                function updateColumnsInRole() {
                    let columnsInRole = $scope.columnsPerInputRole[$scope.paramDesc.columnRole];
                    if (columnsInRole) {
                        $scope.accessibleColumnsList = columnsInRole.map(col => col.name);
                    } else {
                        Logger.error('No role for plugin column parameter');
                    }
                };
                updateColumnsInRole();
                $scope.$watch("columnsPerInputRole", updateColumnsInRole, true);
            }

            $scope.invalidColumnType = function() {
                let val = $scope.model[$scope.paramDesc.name];
                if (!val) return false;
                let columnsInRole = $scope.columnsPerInputRole[$scope.paramDesc.columnRole];
                if (columnsInRole) {
                    const types = $scope.paramDesc.allowedColumnTypes;
                    if (types && types.length) {
                        const col = columnsInRole.find(c => c.name == val);
                        if (!col) {
                            return false;
                        }
                        return !types.map(t => t.toLowerCase()).includes(col.type);
                    }
                } else {
                    Logger.error('No role for plugin column parameter');
                }
                return false;
            }

            // Value of the api service from which to select a package
            if ($scope.paramDesc.apiServiceParamName) {
                $scope.$watch('model.' + $scope.paramDesc.apiServiceParamName, function(apiService) {
                    if ($scope.viewMode) return;
                    if (apiService) {
                        const projectKey = $stateParams.projectKey;
                        DataikuAPI.lambda.packages.list(projectKey, apiService).success(function (data) {
                            $scope.accessibleAPIServicePackages = data.map(ds => ({ref: ds.id, displayName: ds.id}));
                        }).error(setErrorInScope.bind($scope.errorScope));

                    } else {
                        $scope.accessibleAPIServicePackages = [];
                    }
                }, true);
            }

            /* Field types that only need to be populated with the right API call */
            $scope.$watch('viewMode', function() {
                if ($scope.viewMode) return;
                refreshObjectLists();
            });

            let pluginIdDeregister = null;

            function buildReloadCustomChoicesCallback(customOptionsCallback) {
                return () => retrieveCustomChoices(customOptionsCallback, false);
            }

            function removeObsoleteSelectedItems(options, isMultiselect, model, parameterName) {
                // Fix the model if the selected items are no longer available in the options
                if (options && parameterName) {
                    if (isMultiselect) {
                        let selectedItems = model[parameterName];
                        if (selectedItems && Array.isArray(selectedItems)) {
                            model[parameterName] = selectedItems.filter(item => options.find(e => e.value === item));
                        }
                    } else {
                        const selectedValue = model[parameterName];
                        if (selectedValue && !options.find(e => e.value === selectedValue)) {
                            model[parameterName] = undefined;
                        }

                    }
                }
            }

            function wrapCallbackWithWithSelectedItemsCleanup(customOptionsCallback) {
                return function(options) {
                    removeObsoleteSelectedItems(options, $scope.paramDesc.type === 'MULTISELECT', $scope.model, $scope.paramDesc.name);
                    return customOptionsCallback(options);
                };
            }

            function retrieveCustomChoices(customOptionsCallback, isInitialization=true) {
                const customOptionsCallbackWithSelectedItemsCleanup = wrapCallbackWithWithSelectedItemsCleanup(customOptionsCallback);
                if (isInitialization) {
                    CustomUISetup.setupCallPythonDo($scope, $scope.errorScope, $scope.pluginId, $scope.componentId, $scope.model, $scope.side);
                    if (!$scope.paramDesc.disableAutoReload) {
                        $scope.addReloadCustomChoicesCallback(buildReloadCustomChoicesCallback(customOptionsCallbackWithSelectedItemsCleanup));
                    }
                }
                let doOneCallPythonDo = function() {
                    $scope.callPythonDoOngoing = true;
                    $scope.callPythonDo({ parameterType: $scope.paramDesc.type, parameterName: $scope.paramDesc.name, customChoices: true }).then(
                            data => customOptionsCallbackWithSelectedItemsCleanup(data.choices),
                            () => customOptionsCallbackWithSelectedItemsCleanup([])
                        )
                        .finally(function() {
                            $scope.callPythonDoOngoing = false;
                            if ($scope.enqueueCallPythonDo) {
                                $scope.enqueueCallPythonDo = false;
                                doOneCallPythonDo();
                            }
                        });
                };
                if ($scope.callPythonDoOngoing == true) {
                    $scope.enqueueCallPythonDo = true;
                } else {
                    doOneCallPythonDo();
                }
            }

            function refreshObjectLists() {
                if ($scope.paramDesc.getChoicesFromPython === true) {
                    if ($scope.paramDesc.type === 'MULTISELECT') {
                        $scope.retrieveCustomChoices = retrieveCustomChoices;
                    } else {
                        retrieveCustomChoices(function(options) {
                            $scope.paramDesc.selectChoices = setArrayValues($scope.paramDesc.selectChoices, options);
                        });
                    }
                }

                switch ($scope.paramDesc.type) {
                    case 'PROJECT':
                        DataikuAPI.projects.list().success(function (data) {
                            $scope.accessibleProjects = data.map(proj => ({ref: proj.projectKey, displayName: proj.name}));
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'DATASETS':
                        if (!$stateParams.projectKey) break;
                        DataikuAPI.datasets.listWithAccessible($stateParams.projectKey).success(function (data) {
                            data.forEach(ds => {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
                            if (!$scope.paramDesc.canSelectForeign) {
                                data = data.filter(ds => !ds.foreign);
                            }
                            $scope.accessibleDatasetsList = data.map(ds => ds.foreign ? (ds.projectKey + '.' + ds.name) : ds.name);
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'FOLDER':
                    case 'MANAGED_FOLDER':
                        if (!$stateParams.projectKey) break;
                        fetchAccessibleFolders();
                        break;

                    case 'MODEL':
                    case 'SAVED_MODEL':
                        if (!$stateParams.projectKey) break;
                        DataikuAPI.savedmodels.listWithAccessible($stateParams.projectKey).success(function (data) {
                            data.forEach(ds => {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
                            if (!$scope.paramDesc.canSelectForeign) {
                                data = data.filter(model => !model.foreign);
                            }
                            $scope.accessibleModels = data.map(ds => ({
                                ref: ds.foreign ? (ds.projectKey + '.' + ds.id) : ds.id,
                                displayName: ds.name + (ds.foreign ? ('(' + ds.projectKey + ')') : '')
                            }));
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'SCENARIO':
                        DataikuAPI.scenarios.listAccessible().success(function (data) {
                            data.forEach(ds => {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
                            $scope.accessibleScenarios = data.map(ds => ({
                                ref: ds.foreign ? (ds.projectKey + '.' + ds.id) : ds.id,
                                displayName: ds.name + (ds.foreign ? ('(' + ds.projectKey + ')') : '')
                            }));
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'API_SERVICE':
                        if (!$stateParams.projectKey) break;
                        DataikuAPI.lambda.services.list($stateParams.projectKey).success(function (data) {
                            $scope.accessibleAPIServices = data.map(ds => ({ref: ds.id, displayName: ds.id}));
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'BUNDLE':
                        if (!$stateParams.projectKey) break;
                        DataikuAPI.projects.design.listBundles($stateParams.projectKey).success(function (data) {
                            $scope.accessibleBundles = data.bundles.map(ds => ({ref: ds.bundleId, displayName: ds.bundleId}));
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'VISUAL_ANALYSIS':
                        if (!$stateParams.projectKey) break;
                        DataikuAPI.analysis.listHeads($stateParams.projectKey).success(function (data) {
                            $scope.accessibleVisualAnalyses = data.map(ds => ({ref: ds.id, displayName: ds.name}));
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'PRESET':
                    case 'PRESETS':
                        // pluginId is set afterwards
                        pluginIdDeregister = $scope.$watch("pluginId", function() {
                            if (!$scope.pluginId) return;
                            pluginIdDeregister();

                            DataikuAPI.plugins.listAccessiblePresets($scope.pluginId, $stateParams.projectKey, $scope.paramDesc.parameterSetId).success(function (data) {
                                $scope.inlineParams = data.inlineParams;
                                $scope.inlinePluginParams = data.inlinePluginParams;
                                $scope.accessiblePresets = [];
                                $scope.accessiblePresets.push({name:"NONE", label:"None", usable:true, description:null});
                                if (data.definableInline) {
                                    $scope.accessiblePresets.push({
                                        name:"INLINE",
                                        label:"Manually defined", usable:true,
                                        description: "Define values for these parameters"
                                    });
                                }
                                data.presets.forEach(function(p) {
                                    $scope.accessiblePresets.push({name:"PRESET " + p.name, label:p.name, usable:p.usable, description:p.description});
                                });
                                $scope.accessibleParameterSetDescriptions = $scope.accessiblePresets.map(function(p) {return p.description || '<em>No description</em>';});
                            }).error(setErrorInScope.bind($scope.errorScope));
                        });

                        if ($scope.paramDesc.type == 'PRESETS') {
                            $scope.model[$scope.paramDesc.name] = $scope.model[$scope.paramDesc.name] || [];
                            $scope.addPreset = function() {
                                $scope.model[$scope.paramDesc.name].push({ mode: "NONE"});
                            };
                        }
                        break;

                    // Non project related:
                    case 'CLUSTER':
                        DataikuAPI.admin.clusters.listAccessible().success(function (data) {
                            $scope.accessibleClusters = data.map(c => ({ref: c.id, displayName: c.name}));
                            $scope.accessibleClusterIds = data.map(c => c.id);
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'CODE_ENV':
                        $scope.accessibleCodeEnvs = [];
                        DataikuAPI.codeenvs.list('PYTHON').success(function (data) {
                            const codeEnvs = data.map(codeEnv => ({ref: codeEnv.envName, displayName: codeEnv.envName}));
                            $scope.accessibleCodeEnvs = $scope.accessibleCodeEnvs.concat(codeEnvs);
                        }).error(setErrorInScope.bind($scope.errorScope));
                        DataikuAPI.codeenvs.list('R').success(function (data) {
                            const codeEnvs = data.map(codeEnv => ({ref: codeEnv.envName, displayName: codeEnv.envName}));
                            $scope.accessibleCodeEnvs = $scope.accessibleCodeEnvs.concat(codeEnvs);
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'CONNECTION':
                    case 'CONNECTIONS':
                        DataikuAPI.connections.getNames('all').success(function(data) {
                            $scope.accessibleConnectionsList = data;
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'PLUGIN':
                        DataikuAPI.plugins.list(false).success(function (data) {
                            $scope.accessiblePlugins = data.plugins.filter(plugin => plugin.installed).map(plugin => {
                                return {
                                    id: plugin.id,
                                    label: plugin.installedDesc.desc.meta.label || plugin.id
                                };
                            });
                        }).error(setErrorInScope.bind($scope.errorScope));
                        break;

                    case 'OBJECT_LIST':
                        $scope.model[$scope.paramDesc.name] = $scope.model[$scope.paramDesc.name] || [];
                        $scope.addObject = function() {
                            $scope.model[$scope.paramDesc.name].push({});
                        };
                        break;

                    case 'CREDENTIAL_REQUEST':
                        if ($scope.paramDesc.credentialRequestSettings.type === 'OAUTH2') {
                            // Set usePkce to true by default
                            $scope.model[$scope.paramDesc.name] = $scope.model[$scope.paramDesc.name] || { usePkce: true };
                        }
                }
            }
            $scope.dimensionList = [];
            $scope.acceptCallback = function(column) {
                if (column && (column.column == "__COUNT__" || column.column == null && column['function'] == "COUNT")) {
                    return {accept:false, message:'Only dataset columns are accepted'};
                } else {
                    return {accept:true};
                }
            };
            var initChartStuff = function() {
                var p = 'model.' + $scope.paramDesc.name;
                $scope.$watch(p, function(nv, ov) {
                    if (nv == null && ov != null) {
                        $scope.dimensionList.splice(0, $scope.dimensionList.length);
                    } else if ($scope.model[$scope.paramDesc.name] == null) {
                        return;
                    } else if ($scope.dimensionList.length == 0 || $scope.dimensionList[0].column != $scope.model[$scope.paramDesc.name]) {
                        $scope.dimensionList.splice(0, $scope.dimensionList.length);
                        var n = $scope.model[$scope.paramDesc.name];
                        $scope.dimensionList.push({column:n, type:'ALPHANUM', label:n});
                    }
                });
                $scope.$watch('dimensionList', function(nv, ov) {
                    if (ov != null && nv != null && ov.length > 0 && nv.length == 0) {
                        $scope.model[$scope.paramDesc.name] = null;
                    } else if ($scope.dimensionList.length == 0) {
                        return;
                    } else if ($scope.dimensionList[0].column != $scope.model[$scope.paramDesc.name]) {
                        $scope.model[$scope.paramDesc.name] = $scope.dimensionList[0].column;
                    }
                }, true);
            };

            var chartDeregister = $scope.$watch("chart", function() {
                if ($scope.chart) {
                    initChartStuff();
                    chartDeregister();
                }
            });

            $scope.onDragEnd = function() {
                // Unhide the moved element, as ng-repeat will reuse it
                if($scope.activeDragDrop.draggedElementToHide) $scope.activeDragDrop.draggedElementToHide.show();
                clear($scope.activeDragDrop);
                $(".chart-configuration-wrapper").removeClass("drag-active");
            };
        }
    }
});

app.directive("autoconfigPresetElement", function($stateParams, DataikuAPI){
    return {
        scope: {
            paramDesc: '=',
            model: '=',
            pluginId: '=',
            componentId: '=',
            disabled: '=',
            inlineParams: '=',
            inlinePluginParams: '=',
            accessibleParameterSetDescriptions: '=',
            accessiblePresets: '=',
            errorScope: '<',
            qa: '@'
        },
        templateUrl: '/templates/widgets/autoconfig/preset-element.html',
        link: function($scope, elem, attrs) {
            $scope.$preset = {choice:"NONE"};
            let currentValue = $scope.model;
            if (currentValue) {
                if (currentValue.mode == "NONE") {
                    $scope.$preset.choice = "NONE";
                } else if (currentValue.mode == "INLINE") {
                    $scope.$preset.choice = "INLINE";
                } else {
                    $scope.$preset.choice = "PRESET " + currentValue.name;
                }
            }

            $scope.$watch("accessiblePresets", function() {
                if (!$scope.model || !$scope.accessiblePresets || !$scope.paramDesc) {
                    return;
                }
                if ($scope.paramDesc.mandatory) {
                    const realPresets = $scope.accessiblePresets.filter(ap => ap.name.startsWith("PRESET"))
                    const definableInline = $scope.accessiblePresets.filter(ap => ap.name.startsWith("INLINE")).length > 0;

                    if ($scope.model && $scope.model.mode == 'NONE' && realPresets.length > 0) {
                        $scope.$preset.choice = realPresets[0].name;
                    } else if ($scope.model && $scope.model.mode == 'NONE' && definableInline) {
                        $scope.$preset.choice = "INLINE";
                    }
                }
            });

            $scope.$watch("$preset.choice", function() {
                if ($scope.$preset.choice == null) return;
                $scope.model = $scope.model || {};
                if ($scope.$preset.choice == 'NONE' && $scope.model.mode != 'NONE') {
                    Object.keys($scope.model).forEach(function(k) {delete $scope.model[k];});
                    $scope.model.mode = 'NONE';
                } else if ($scope.$preset.choice == 'INLINE' && $scope.model.mode != 'INLINE') {
                    Object.keys($scope.model).forEach(function(k) {delete $scope.model[k];});
                    $scope.model.mode = 'INLINE';
                    $scope.model.inlinedConfig = {};
                    $scope.model.inlinedPluginConfig = {};
                } else if ($scope.$preset.choice.startsWith('PRESET') && ($scope.model.mode != 'PRESET' || $scope.model.name != $scope.$preset.choice.substring('PRESET '.length))) {
                    Object.keys($scope.model).forEach(function(k) {delete $scope.model[k];});
                    $scope.model.mode = 'PRESET';
                    $scope.model.name = $scope.$preset.choice.substring('PRESET '.length);
                }
            });
        }
    }
});

app.directive("autoconfigObjectListElement", function(){
    return {
        scope: {
            model: '=',
            pluginId: '=',
            disabled: '=',
            params: '=',
            errorScope: '<'
        },
        templateUrl: '/templates/widgets/autoconfig/object-list-element.html',
        link: function($scope, elem, attrs) {
            $scope.model = $scope.model || {};
        }
    }
});

app.filter('formatParamDescValue', function($sce, $filter) {
    const formatKeyValueList = function(value) {
        let ret = '<table><tbody>';
        for (let i = 0; i < value.length; i++) {
            ret += '<tr><td>' + $filter('encodeHTML')(value[i].from) + '</td><td>&nbsp;&nbsp;&nbsp;→&nbsp;&nbsp;&nbsp;</td><td>' + $filter('encodeHTML')(value[i].to) + '</td></tr>';
        }
        ret += '</tbody></table>';
        return ret;
    };
    const formatMap = function(value) {
        let ret = '<table><tbody>';
        for (let key in value) {
            if (!value.hasOwnProperty(key)) continue;
            ret += '<tr><td>' + $filter('encodeHTML')(key) + '</td><td>&nbsp;&nbsp;&nbsp;→&nbsp;&nbsp;&nbsp;</td><td>' + $filter('encodeHTML')(value[key]) + '</td></tr>';
        }
        ret += '</tbody></table>';
        return ret;
    };
    return function(value, paramDesc) {
        const valueOrDefault = value === undefined ? paramDesc.defaultValue : value;
        if (valueOrDefault === undefined) return 'N/A';
        let ret;
        switch (paramDesc.type) {
        case 'BOOLEAN':
            if (typeof valueOrDefault != 'boolean') return 'N/A';
            return valueOrDefault ? 'Yes' : 'No';
        case 'SEPARATOR':
            return '';
        case 'PASSWORD':
            return '***';
        case 'SELECT':
            const opt = paramDesc.selectChoices.find(opt => opt.value == valueOrDefault);
            if (!opt) return 'N/A';
            ret = '<span';
            if (opt.color) {
                ret += ' style="color: ' + opt.color + ';"'
            }
            ret += '>';
            if (opt.icon) {
                ret += '<i class="' + opt.icon + '"></i>&nbsp;';
            }
            ret += $filter('encodeHTML')(opt.label || opt.value) + '</span>';
            return $sce.trustAsHtml(ret);
        case 'KEY_VALUE_LIST':
            if (!Array.isArray(valueOrDefault)) return 'N/A';
            return $sce.trustAsHtml(formatKeyValueList(valueOrDefault));
        case 'MAP':
            if (typeof valueOrDefault != 'object') return 'N/A';
            return $sce.trustAsHtml(formatMap(valueOrDefault));
        case 'ARRAY':
            if (!Array.isArray(valueOrDefault)) return 'N/A';
            ret = '';
            for (let i = 0; i < valueOrDefault.length; i++) {
                if (i > 0) ret += '<br />';
                if (typeof valueOrDefault[i] == 'boolean') {
                    ret += valueOrDefault[i] ? 'Yes' : 'No';
                } else if (typeof valueOrDefault[i] == 'number') {
                    ret += $filter('encodeHTML')(valueOrDefault[i]);
                } else if (typeof valueOrDefault[i] == 'string') {
                    ret += '<span style="white-space: pre-wrap;">' + $filter('encodeHTML')(valueOrDefault[i]) + '</span>';
                } else if (typeof valueOrDefault[i] == 'object') {
                    if (Object.keys(valueOrDefault[i]).length == 2 && valueOrDefault[i].hasOwnProperty('from') && valueOrDefault[i].hasOwnProperty('to')) {
                        ret += formatKeyValueList(valueOrDefault[i]);
                    } else {
                        ret += formatMap(valueOrDefault[i]);
                    }
                }
            }
            return $sce.trustAsHtml(ret);
        case 'OBJECT_LIST':
            if (!Array.isArray(valueOrDefault)) return 'N/A';
            ret = '';
            for (let i = 0; i < valueOrDefault.length; i++) {
                if (i > 0) ret += '<br />';
                ret += $filter('encodeHTML')(valueOrDefault[i]);
            }
            return $sce.trustAsHtml(ret);
        case 'COLUMNS':
        case 'DATASETS':
        case 'DATASET_COLUMNS':
        case 'CONNECTIONS':
            if (!Array.isArray(valueOrDefault)) return 'N/A';
            return $sce.trustAsHtml(valueOrDefault.map($filter('encodeHTML')).join('<br />'));
        case 'TEXTAREA':
            return $sce.trustAsHtml('<span style="white-space: pre-wrap;">' + $filter('encodeHTML')(valueOrDefault) + '</span>');
        case 'STRING':
        case 'INT':
        case 'DOUBLE':
        case 'DATASET_COLUMN':
        case 'CONNECTION':
        case 'FOLDER':
        case 'MANAGED_FOLDER':
        case 'MODEL':
        case 'SAVED_MODEL':
        case 'SCENARIO':
        case 'API_SERVICE':
        case 'API_SERVICE_VERSION':
        case 'BUNDLE':
        case 'VISUAL_ANALYSIS':
        case 'CLUSTER':
        case 'DATASET':
        case 'PROJECT':
        case 'COLUMN':
        case 'PLUGIN':
            return $sce.trustAsHtml($filter('encodeHTML')(valueOrDefault));
        default:
            return $sce.trustAsHtml($filter('encodeHTML')(JSON.stringify(valueOrDefault)));
        }
    };
});

app.directive("autoconfigMapToMappingEditor", function($parse){
    return {
        scope : false,
        link : function($scope, elem, attrs) {
            let obj = $scope.$eval(attrs.autoconfigMapToMappingEditor);
            $scope.tempMap = []; // for MAP parameters: the representation as an array of key-value pairs
            if (obj != null) {
                angular.forEach(obj, function(value, key) {
                    $scope.tempMap.push({'from' : key, 'to': value});
                  }, $scope.tempMap);
            }
            $scope.$watch("tempMap", function(nv, ov) {
                if ( nv == null || obj == null ) return;
                Object.keys(obj).forEach(function(key) {delete obj[key]});
                $scope.tempMap.forEach(function(pair) {
                    if ( pair.from != null && pair.from.length > 0) {
                        obj[pair.from] = pair.to || "";
                    }
                });
                $parse(attrs.autoconfigMapToMappingEditor).assign($scope, obj);
            }, true);
        }
    }
});

app.directive("autoconfigArrayToMappingEditor", function(){
    return {
        scope : false,
        link : function($scope, elem, attrs) {
            let obj = $scope.$eval(attrs.autoconfigArrayToMappingEditor);
            $scope.tempArray = []; // for ARRAY parameters
            if (obj != null) {
                obj.forEach(function(e) {
                    $scope.tempArray.push({value:e});
                });
            }
            $scope.$watch("tempArray", function(nv, ov) {
                if ( nv == null || obj == null ) return;
                obj.splice(0, obj.length);
                $scope.tempArray.forEach(function(e) {
                    obj.push(e.value);
                });
            }, true);
        }
    }
});

app.directive('autoconfigFormArrayElementArray',function() {
    return {
        restrict:'A',
        scope: {
            elements: '=ngModel',
            onChange: '&',
            addLabel: '@',
            disabled: '=',
            qa: '@'
        },
        templateUrl : '/templates/widgets/autoconfig/form-array-element-array.html',
        compile: function() { return { pre: function(scope,element,attrs) {
            if(angular.isUndefined(scope.elements)){
                scope.elements = [];
            }
            if (!scope.addLabel) scope.addLabel = 'Add another';
            if ('preAdd' in attrs) {
                scope.preAdd = scope.$parent.$eval(attrs.preAdd);
            } else {
                scope.preAdd = Object.keys(scope.elements).length === 0;
            }
            if (scope.onChange) {
                scope.callback = scope.onChange.bind(scope, scope.elements);
            }
            scope.paramDesc = {};
            scope.prepareIt = function(it) {
                // noop
            };
            scope.templateIt = function() {
                return {value:null};
            };
            scope.validateIt = function(it) {
                if ( scope.contentDesc.type == 'STRING' || scope.contentDesc.type == 'TEXTAREA' ) {
                    return true;
                } else if (scope.contentDesc.type == 'MAP' || scope.contentDesc.type == 'KEY_VALUE_LIST' || scope.contentDesc.type == 'ARRAY' ) {
                    return true;
                } else if ( scope.contentDesc.type == 'INT' ) {
                    return true;
                } else if ( scope.contentDesc.type == 'DOUBLE' ) {
                    return true;
                } else if ( scope.contentDesc.type == 'BOOLEAN' ) {
                    return true;
                } else {
                    return false;
                }
            };
            scope.contentDesc = {};
        }, post : function(scope,element,attrs) {
            let guessType = function(value) {
                if ( value == null ) {
                    return 'STRING';
                } else {
                    let t = typeof value;
                    if ( t == 'number' ) {
                        if ( value % 1 == 0 ) {
                            return 'INT';
                        } else {
                            return 'DOUBLE';
                        }
                    } else if ( t == 'object' ) {
                        if ( value.constructor == Array ) {
                            return 'ARRAY';
                        } else {
                            return 'MAP';
                        }
                    } else if ( t == 'string' ) {
                        return 'STRING';
                    } else if ( t == 'boolean' ) {
                        return 'BOOLEAN';
                    } else {
                        return 'UNKNOWN';
                    }
                }
            };

            let types = [];
            if ( scope.elements ) {
                scope.elements.forEach(function(e) {
                    let type = guessType(e.value);
                    if ( types.indexOf(type) < 0 ) {
                        types.push(type);
                    }
                });
                if ( types.length == 0 ) {
                    scope.contentDesc.type = 'STRING';
                } else if ( types.length == 1 ) {
                    scope.contentDesc.type = types[0];
                } else if ( types.length == 2 ) {
                    if (( types[0] == 'INT' && types[1] == 'DOUBLE' ) || ( types[1] == 'INT' && types[0] == 'DOUBLE' )) {
                        scope.contentDesc.type = 'DOUBLE';
                    } else { // Array of mixed types, not editing
                        scope.contentDesc.type = 'UNKNOWN';
                    }
                } else {  // Array of mixed types, not editing
                    scope.contentDesc.type = 'UNKNOWN';
                }
            } else {
                scope.contentDesc.type = 'STRING';
            }
        }
        }; }

    };
});

app.directive('autoconfigFormArrayElement',function() {
    return {
        restrict:'A',
        scope: {
            it: '=ngModel',
            paramDesc: '=',
            disabled: '='
        },
        templateUrl: '/templates/widgets/autoconfig/form-array-element.html',
        link: function(scope,element,attrs) {
            let updateValueForType = function(type) {
                let value = scope.it.value;
                let reinit = false;
                if ( value == null ) {
                    reinit = true;
                } else {
                    let t = typeof value;
                    if ( type == 'MAP' ) {
                        reinit = t != 'object' || value.constructor == Array;
                    } else if ( type == 'ARRAY' ) {
                            reinit = t != 'object' || value.constructor != Array;
                    } else if ( type == 'INT' || type == 'DOUBLE' ) {
                        reinit = t != 'number';
                    } else if ( type == 'BOOLEAN' ) {
                        reinit = t != 'boolean';
                    } else if ( type == 'STRING' || type == 'TEXTAREA' ) {
                        reinit = t != 'string';
                    }
                }
                if ( reinit ) {
                    if ( type == 'MAP' ) {
                        scope.it.value = {};
                    } else if ( type == 'ARRAY' || type == 'KEY_VALUE_LIST' ) {
                        scope.it.value = [];
                    } else if ( type == 'INT' || type == 'DOUBLE' ) {
                        scope.it.value = 0;
                    } else if ( type == 'BOOLEAN' ) {
                        scope.it.value = false;
                    } else if ( type == 'STRING' || type == 'TEXTAREA' ) {
                        scope.it.value = '';
                    } else {
                        scope.it.value = null;
                    }
                }
            };
            scope.$watch('paramDesc.type', function(nv, ov) {
                if ( ov == nv ) return;
                updateValueForType(scope.paramDesc.type);
            });
        }
    };
});

/**
 * Built on top of Suggestions directive.
 * It is different of gsField in many ways :
 *  - It accepts any type of inputs (while gsField is for numeric values only).
 *  - It does not validate a tag when clicking space.
 *  - It allows free inputs ie text not from the suggestions list.
 *  - It can takes the list of suggestions as parameters
 * @param {array} [tags] - The list of selected suggestions displayed as tags in the input.
 * @param {array} [options] - Optional list of suggestions. Used for static choices.
 * @param {function} [retrieveOptions] - Optional function, taking a callback as a parameter. Said callback takes the
 *        list of suggestions as its parameter. Used for custom choices, should be mutually exclusive with options.
 * @param {string} [placeholder] - Optional placeholder of the suggestions list.
 * @param {boolean} [allowDubs] - True to select a suggestion more than once.
 * @param {boolean} [allowFree] - True to be able to select text not in the suggestions.
 * @param {boolean} [number] - True to force tags to be numerical.
 * @param {boolean} [selectOnBlur] - True to validate the current input on blur. Only in free input mode.
 *
 * @example
 *      <div ng-model="likedMovies" type="text" multiselect-field options="moviesList" allow-free></div>
*/
app.directive('multiselectField', function($compile, $timeout, $q){
    return {
        restrict:'A',
        scope: {
            inputValue: '=ngModel',
            retrieveOptions: '=',
            options: '<',
            placeholder: '@',
        },
        link: function(scope, element, attrs) {

            let className = 'multiselect-field';
            element.html($compile(
                '<div class="' + className + '" ng-click="setFocus($event)" ng-class="{focus: hasFocus()}" ng-disabled="changesDisabled">' +
                    '<div class="tag" ng-class="{active: tagIndex == $index}" ng-click="selectTag($event, $index)" ng-repeat="tag in tags track by $index" scroll-to-me="{{tagIndex == $index}}">{{ tag }}' +
                    '<i class="icon-remove" ng-click="unselectSuggestion($event, $index)"></i></div>' +
                    '<div ng-model="newTag" suggestions="getSuggestions()" allow-no-suggestions show-suggestions-on-focus filter-suggestions-on-type floating-suggestions="false" suggestion-blur="inputBlur" callback="selectSuggestion(value, event)" placeholder="{{ placeholder }}" ng-disabled="changesDisabled"></div>' +
                    '<input type="text" class="fake" style="position:absolute; left:-1000px; right:-1000px; z-index: -1" ng-disabled="changesDisabled"/>' +
                '</div>')(scope));

            // stash in a field for sub-elements
            scope.changesDisabled = false;
            attrs.$observe("disabled", function() {
                scope.changesDisabled = "disabled" in attrs && attrs.disabled !== false;
            });

            scope.tagIndex = undefined;
            let input = element.find('.suggestions input');
            scope.newTag = '';

            scope.hasFocus = function() {
                return document.activeElement === input[0] || input.is(":focus") || element.find(".fake").is(":focus");
            };

            scope.syncInput = function () {
                input.value = scope.inputValue;
            }

            scope.selectTag = function(e, index) {
                e.stopPropagation();
                scope.tagIndex = index;
            };

            scope.inputBlur = function(e) {
                if (e) {
                    e.stopPropagation();
                    if (attrs.allowFree !== undefined && attrs.selectOnBlur !== undefined && scope.addTag()) {
                        e.preventDefault();
                    }
                }
            }

            scope.selectSuggestion = function(value, e) {
                if (scope.changesDisabled) return;
                if (!value) { return }
                const tagLabel = value.label || value;
                const tagIndex = value && scope.tags.indexOf(tagLabel);
                if (tagIndex >= 0 && !attrs.allowDubs) {
                    scope.unselectSuggestion(e, tagIndex);
                } else {
                    scope.newTag = value;
                    e.stopPropagation();
                    if (scope.addTag()) {
                        if (scope.suggestionsList) {
                            scope.suggestionsList.map(suggestion => {
                                if (suggestion.label === value.label) {
                                    suggestion.selected = true;
                                }
                            });
                        }
                        e.preventDefault();
                        scope.$broadcast('showSuggestions');
                    }
                }
            };

            scope.addTag = function() {
                if (scope.changesDisabled) return;
                var added = false;
                if (scope.newTag) {
                    // If the input is not part of the suggestions, add the tag only if free input is allowed.
                    if (scope.suggestionsList.indexOf(scope.newTag) === -1 && (attrs.allowFree === undefined)) {
                        return;
                    }

                    let tagLabel = scope.newTag.label || scope.newTag;

                    if (attrs.number !== undefined) {
                        if (isNaN(tagLabel)) {
                            return;
                        } else {
                            tagLabel = parseFloat(tagLabel);
                        }
                    }

                    if (attrs.allowDubs === 'true' || scope.tags.indexOf(tagLabel) === -1) {
                        // add tag
                        scope.tags.push(tagLabel);

                        // Get the corresponding value and add it to the model
                        const matchingOption = scope.options.find(option => {
                            return (option.label === tagLabel)
                        });

                        const matchingValue = matchingOption && matchingOption.value;

                        if (matchingValue) {
                            scope.inputValue.push(matchingValue);
                            scope.syncInput();
                        } else if (attrs.allowFree !== undefined) {
                            // If no suggestions, the input value already contains the proper information.
                            if (scope.suggestionsList.length > 0) {
                                scope.inputValue.push(tagLabel);
                                scope.syncInput();
                            } else {
                                input.value = '';
                            }
                        }

                        added = true;
                    } else {
                        return;
                    }

                    scope.newTag = '';

                    if(!scope.$root.$$phase) scope.$apply();
                    $timeout(function(){ scope.$broadcast('showSuggestions') });
                }
                return added;
            };

            scope.unselectSuggestion = function(e, index) {
                if (e) { e.originalEvent.stopPropagation() }
                if (scope.changesDisabled) return;

                if (index === null || index === undefined) {
                    index = scope.tagIndex;
                }
                let removedTag = scope.deleteTag(e, index);
                if (removedTag) {
                    if (scope.suggestionsList) {
                        scope.suggestionsList.map(suggestion => {
                            if (suggestion.label === removedTag) {
                                suggestion.selected = false;
                            }
                        });
                    }
                    e.preventDefault();
                    scope.$broadcast('showSuggestions');
                }
            };

            scope.deleteTag = function(e, index) {
                if (scope.changesDisabled) return;

                if (index !== undefined) {

                    let tagValue, tagLabel;
                    if (attrs.allowFree === undefined) {
                        let matchingOption = scope.options.filter(option => {
                            return option.label === scope.tags[index];
                        })[0];
                        tagValue = matchingOption.value;
                        tagLabel = matchingOption.label
                    } else {
                        tagValue = scope.tags[index].label || scope.tags[index];
                        tagLabel = scope.tags[index].label || scope.tags[index];
                    }

                    scope.inputValue = scope.inputValue.filter(value => {
                        return value !== tagValue;
                    });

                    scope.syncInput();
                    scope.tags.splice(index, 1);

                    if(scope.tags.length) {
                        // set tagIndex to former tag
                        scope.tagIndex = Math.max(index - 1, 0);
                    } else {
                        // otherwise set focus to input, but only if this was from a backspace deletion
                        if (!e) { input.focus() }
                    }

                    return tagLabel;
                }
            };

            scope.$watch('tagIndex', function() {
                if (!angular.isUndefined(scope.tagIndex)){
                    input.blur();
                    element.find(".fake").focus();
                }
            });

            input.on('focus', function() {
                scope.tagIndex = undefined;
            });

            scope.setFocus = function(e) {
                input.focus();
                e.stopPropagation();
            };

            scope.$on("$destroy", function() {
                $(element).off("keydown.tags");
            });

            $(element).on('keydown.tags', function(e) {
                if (scope.hasFocus()) {
                    if (e.keyCode == 37) { // left arrow
                        if (!angular.isUndefined(scope.tagIndex)) {
                            scope.tagIndex = Math.max(scope.tagIndex - 1, 0);
                            scope.$apply();
                        } else {
                            if(scope.newTag.length === 0){
                                scope.tagIndex = scope.tags.length - 1;
                                scope.$apply();
                            }
                        }
                    } else if (e.keyCode == 39) { // right arrow
                        if (!angular.isUndefined(scope.tagIndex)) {
                            scope.tagIndex = scope.tagIndex + 1;
                            if(scope.tagIndex >= scope.tags.length) {
                                scope.tagIndex = undefined;
                                input.focus();
                            }
                            scope.$apply();
                        }
                    } else if (e.keyCode == 8) { // delete
                        if (angular.isUndefined(scope.tagIndex)) {
                            if (scope.newTag.length === 0){
                                scope.tagIndex = scope.tags.length - 1;
                                scope.$apply();
                            }
                        } else {
                            e.preventDefault();
                            scope.unselectSuggestion(e);
                            scope.$apply();
                        }
                    } else if (e.keyCode == 13) { // Enter: If we added a tag, don't let the "enter" key trigger a form submit
                        e.stopPropagation();
                        if (!scope.newTag || scope.newTag.length === 0) { return }
                        if (scope.selectSuggestion(scope.newTag, e)) {
                            e.preventDefault();
                        }
                    }
                }
            });

            scope.inputValue = scope.inputValue || [];

            function finishOptionsInit() {
                scope.suggestionsList = setArrayValues(scope.suggestionsList, []);
                scope.tags = setArrayValues(scope.tags, []);
                scope.options.forEach(option => {
                    if (option.selected) {
                        if (!scope.inputValue.includes(option.value)) {
                            scope.inputValue.push(option.value);
                        }
                    }

                    const isInInput = scope.inputValue.includes(option.value);

                    if (isInInput) {
                        scope.tags.push(option.label);
                    }

                    scope.suggestionsList.push({
                        label: option.label,
                        selected: (option.selected === true) || isInInput
                    });
                });

                scope.syncInput();
            }

            // From the provided options, get the labels to fill the suggestions and the tags, and compute the selected values.
            if (scope.retrieveOptions) {
                scope.tags = [];
                scope.suggestionsList = [];

                scope.retrieveOptions(function(options) {
                    scope.options = setArrayValues(scope.options, options);
                    finishOptionsInit();
                });

            } else if (scope.options) {
                scope.tags = [];
                scope.suggestionsList = [];
                finishOptionsInit();

            } else if (attrs.allowFree !== undefined) {
                if (scope.inputValue) {
                    scope.tags = scope.inputValue;
                }
                scope.options = [];
                scope.suggestionsList = [];
                scope.syncInput();

            } else {
                scope.tags = [];
                scope.options = [];
                scope.suggestionsList = [];
                scope.syncInput();
            }

            scope.getSuggestions = function() {
                let deferred = $q.defer();
                deferred.resolve(scope.suggestionsList);
                return deferred.promise;
            };

            scope.$watch('tags', function(nv, ov) {
                // Sometimes someone rebinds the ngModel to null, in our case the API...
                if (nv === null || nv === undefined) {
                    scope.tags = [];
                }
            });

            scope.$watch('inputValue', function(nv) {
                // Update tags when ngModel (inputValue) changes
                if (nv !== null && attrs.allowFree !== undefined) {
                    scope.tags = scope.inputValue;
                }
            });
        }
    };
});

})();
