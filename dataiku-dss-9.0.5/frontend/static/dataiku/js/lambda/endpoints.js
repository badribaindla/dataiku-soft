(function() {
'use strict';

const app = angular.module('dataiku.lambda');


app.constant('ENDPOINT_TYPES', {
    STD_PREDICTION: "Prediction",
    CUSTOM_PREDICTION: "Custom prediction (Python)",
    CUSTOM_R_PREDICTION: "Custom prediction (R)",
    DATASETS_LOOKUP: "Lookup",
    SQL_QUERY: "SQL Query",
    PY_FUNCTION: "Python function",
    R_FUNCTION: "R function"
});


app.controller("LambdaServiceEndpointsController", function($stateParams, $scope, $state, DataikuAPI, WT1, TopNav, Dialogs, CreateModalFromTemplate, Fn, ENDPOINT_TYPES) {
    TopNav.setLocation(TopNav.TOP_HOME, "lambda", TopNav.TABS_LAMBDA, "endpoints");
    $scope.endpointTypes = ENDPOINT_TYPES;
    $scope.uiState = {
        activeEndpoint: null
    };
    $scope.$watch("uiState.activeEndpoint", function(nv, ov) {
        $scope.endpoint = nv;
    });
    $scope.$watch("service", function(nv, ov) {
        if (nv && $scope.uiState.activeEndpoint == null && nv.endpoints.length) {
            $scope.uiState.activeEndpoint = nv.endpoints[0];
        }
    });

    $scope.renameEndpoint = function() {
        Dialogs.prompt($scope, "Rename endpoint", "New endpoint name", $scope.endpoint.id, { pattern: "[\\w-_]+" }).then(function(newName) {
            if (!newName || newName === $scope.endpoint.id) return;
            if ($scope.service.endpoints.some(ep => ep.id === newName)) {
                Dialogs.ack("This name is already taken by another endpoint of this API service.");
                return;
            }
            $scope.endpoint.id = newName;
            $scope.saveService();
        });
    };

    $scope.deleteEndpoint = function() {
        const endpoints = $scope.service.endpoints;
        Dialogs.confirm($scope, "Confirm deletion", 'Are you sure you want to delete API endpoint "'+$scope.endpoint.id+'"?').then(function() {
            endpoints.splice(endpoints.indexOf($scope.uiState.activeEndpoint), 1);
            $scope.saveService();
            $scope.uiState.activeEndpoint = endpoints.length ? endpoints[0] : null;
        });
    };

    $scope.createNewEndpoint = function() {
        CreateModalFromTemplate("/templates/lambda/new-endpoint-modal.html", $scope, null, function(modalScope) {
            modalScope.ep = {
                projectKey: $stateParams.projectKey, id: null, type: 'STD_PREDICTION', code: '',
                modelType: 'CLASSIFICATION', testQueries: [], enrichMapping: [], useJava: true
            };

            modalScope.savedModels = [];
            DataikuAPI.savedmodels.list($stateParams.projectKey).success(function(savedModels) {
                modalScope.savedModels = savedModels.filter(Fn(Fn.propStr('miniTask.taskType'), Fn.eq('PREDICTION')));
            });

            modalScope.$watch("ep.modelRef", newVal => {
                if (!newVal || !modalScope.savedModels) return;
                modalScope.ep.backendType = modalScope.savedModels.find(el => el.id === newVal).miniTask.backendType;
                if (modalScope.ep.backendType === 'KERAS') {
                    modalScope.ep.useJava = false;
                } else if (modalScope.ep.backendType !== 'PY_MEMORY') {
                    modalScope.ep.useJava = true;
                }
            });
        }).then(function(endpoint) {
            if (!endpoint) {
                return;
            }
            if (endpoint.type === 'CUSTOM_PREDICTION') {
                const tpl = document.getElementById('custPredEndpointTpl/PYTHON_' + endpoint.modelType);
                if (tpl) {
                    endpoint.code = tpl.innerHTML;
                }
            } else if (endpoint.type === 'CUSTOM_R_PREDICTION') {
                const tpl = document.getElementById('custPredEndpointTpl/R_' + endpoint.modelType);
                if (tpl) {
                    endpoint.code = tpl.innerHTML;
                }
                endpoint.userFunctionName = "prediction_function";
            } else if (endpoint.type === 'R_FUNCTION') {
                const tpl = document.getElementById('custEndpointTpl/R_FUNCTION');
                if (tpl) {
                    endpoint.code = tpl.innerHTML;
                }
                endpoint.userFunctionName = "api_r_function";
            } else if (endpoint.type === 'PY_FUNCTION') {
                const tpl = document.getElementById('custEndpointTpl/PY_FUNCTION');
                if (tpl) {
                    endpoint.code = tpl.innerHTML;
                }
                endpoint.userFunctionName = "api_py_function";
            } else if (endpoint.type == "SQL_QUERY") {
                endpoint.queries = [{ query: "-- Insert your SQL code here", inputParameters: []}]
            } else if (endpoint.type == "DATASETS_LOOKUP") {
                endpoint.lookups = [];
            }
            $scope.service.endpoints.push(endpoint);
            WT1.event('create-api-endpoint', {type: endpoint.type, nEndpints: $scope.service.endpoints.length});
            $scope.saveService();
            $scope.uiState.activeEndpoint = $scope.service.endpoints[$scope.service.endpoints.length - 1];
        });
    };

    $scope.canDevServer = function(endpoint) {
        if (!endpoint) {
            return false;
        }
        const t = endpoint.type;
        return t.substring(t.length - 11) == '_PREDICTION'
            || t.substring(t.length-9) == '_FUNCTION'
            || t == 'DATASETS_LOOKUP'
            || t == 'SQL_QUERY';
    };

    $scope.sendPlayTestQueriesMsg = function() {
        $scope.$broadcast("playTestQueries");
    };
});


app.controller("_EndpointController", function($scope, $stateParams, DataikuAPI, Fn, DatasetUtils, Logger, WT1) {
    $scope.$on("devServerDeploymentStarted", function(evt, promise) {
        if ($scope.testSettingsPane) {
            promise.success(function(data) {
                $scope.deployResult = data;
                $scope.uiState.settingsPane = "test";
            }).catch(console.info.bind(console));   /*@console*/
        }
    });

    $scope.$on("playTestQueries", function() {
        WT1.event('api-designer-test-queries', {nQueries: $scope.endpoint.testQueries.length, outputExplanations: $scope.endpoint.outputExplanations});
        if ($scope.testQueriesMode) {
            Logger.info("Playing testQueries:", $scope.endpoint.testQueries);
            $scope.deployToDevServer().then(function() {
                DataikuAPI.lambda.services.playTestQueries($stateParams.projectKey, $stateParams.serviceId,
                        $scope.endpoint.id, $scope.testQueriesMode, $scope.endpoint.testQueries).success(function(data) {
                            $scope.testQueriesResult = data;
                        }).error(setErrorInScope.bind($scope));
            });
        }
    });
});


app.controller("_WithEnrichmentsController", function($scope, $controller, $stateParams, Assert, DataikuAPI, Fn, Logger) {
    $scope.enrichmentsList = null;

    if ($scope.endpoint.type == "DATASETS_LOOKUP") {
        $scope.enrichmentsList = $scope.endpoint.lookups;
    } else {
        $scope.enrichmentsList = $scope.endpoint.enrichMapping;
    }
    Assert.inScope($scope, 'enrichmentsList');

    $scope.uiState = {};
    if ($scope.enrichmentsList && $scope.enrichmentsList.length>0) {
        $scope.enrichmentIndex = 0;
    }
    DataikuAPI.flow.listUsableComputables($stateParams.projectKey, {datasetsOnly:true}).success(function(datasets) {
        $scope.datasets = datasets;
        $scope.datasets.forEach(function(ds) {
            ds.localProject = ds.projectKey === $stateParams.projectKey;
        });

        $scope.defaultDataset = datasets.filter(Fn.prop('localProject'))[0] || datasets[0];
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.admin.getGeneralSettings().success(function(gs) {
        $scope.devBundledConnection = gs.lambdaDevBundledConnection;
    });

    $scope.showEnrichment = function(index) {
        $scope.enrichmentIndex = index;
    };

    $scope.enrichMappingTemplate = function() { return ; };

    $scope.addEnrichment = function() {
        $scope.enrichmentsList.push({
            packagingType: 'BUNDLED_TOCONNECTION',
            on: [],
            columnsMapping: {},
            missingLookupKeyBehavior: 'IGNORE',
            notFoundBehavior: 'IGNORE',
            multiMatchBehavior: 'KEEP_FIRST'
        });
        $scope.enrichmentIndex = $scope.enrichmentsList.length - 1;
    };

    $scope.deleteEnrichment = function(index) {
        $scope.enrichmentsList.splice(index, 1);
        if (index < $scope.enrichmentIndex) {
            $scope.enrichmentIndex--;
        } else if (index === $scope.enrichmentIndex) {
            $scope.enrichmentIndex = -1;
        }
    };
});


app.controller("SingleEnrichmentController", function($scope, Logger, AnyLoc, $stateParams, DataikuAPI, DatasetUtils) {
    $scope.uiState = {};
    $scope.selection = {};
    $scope.currentEnrichment = $scope.enrichmentsList[$scope.enrichmentIndex];

    function getColumnsUIState(datasetColumns, columnsMapping) {
        if (datasetColumns) {
            datasetColumns
                .filter(column => column.name in columnsMapping)
                .forEach(column => {
                    column.$selected = true;
                    if (columnsMapping[column.name] != column.name) {
                        column.modelFeature = columnsMapping[column.name];
                    }
                });
        }
        return datasetColumns;
    }

    function getColumnsMapping(columns) {
        return columns
            .filter(col => col.$selected)
            .reduce((dict, col) => {
                dict[col.name] = col.modelFeature || col.name;
                return dict;
            }, {});
    }

    $scope.$watch("currentEnrichment.datasetRef", function(nv) {
        if (nv) {
            const datasetLoc = AnyLoc.getLocFromSmart($stateParams.projectKey, nv);
            DataikuAPI.datasets.get(datasetLoc.projectKey, datasetLoc.localId, $stateParams.projectKey)
                .success(function(data) {
                    $scope.uiState.columns = getColumnsUIState(data.schema.columns, $scope.currentEnrichment.columnsMapping);
                    // new uiState.columns => new columnsMapping thanks to watch on uiState.columns
                    // still need to update "on"
                    const columnNames = $scope.uiState.columns.map(x => x.name);
                    $scope.currentEnrichment.on = $scope.currentEnrichment.on.filter(x => (columnNames.indexOf(x.resourceLookupCol) > -1));
                }).error(setErrorInScope.bind($scope));
        }
    });

    $scope.$watch("currentEnrichment.packagingType", (newValue) => {
        if (newValue === 'REFERENCED') {
            $scope.datasets.forEach(ds => ds.usable = DatasetUtils.isSQL(ds.dataset));
        } else if (newValue == 'BUNDLED_TOCONNECTION') {
            $scope.datasets.forEach(ds => ds.usable = true);
        }
    });

    // if uiState.columns changes, update columnsMapping - this watches the change on feature name
    $scope.$watch("uiState.columns", function(nv) {
        if (nv) {
            $scope.currentEnrichment.columnsMapping = getColumnsMapping(nv);
        }
    }, true);
    // We need also to watch $selected of each item - since it's not watchable ($-prefixed),
    // instead we watch selection.selectedObjects in non-deep mode
    $scope.$watch("selection.selectedObjects", function(nv) {
        if (nv && $scope.uiState.columns) {
            $scope.currentEnrichment.columnsMapping = getColumnsMapping($scope.uiState.columns);
        }
    });
});

app.controller("PredictionEndpointController", function($scope, $controller, $stateParams, DataikuAPI, Fn, DatasetUtils, Logger) {
    $controller("_EndpointController", {$scope:$scope});
    $controller("_WithEnrichmentsController", {$scope:$scope});
    $scope.testSettingsPane = 'test';
    $scope.testQueriesMode = 'predict';

    $scope.uiState.settingsPane = 'loading';
    $scope.endpoint.outputExplanations = $scope.endpoint.outputExplanations || false;

    $scope.$watch('endpoint', function(nv) {
        if (!nv) return;
        // Set the correct default pane
        if (['loading', 'model', 'settings', 'code'].indexOf($scope.uiState.settingsPane) >= 0) {
            $scope.uiState.settingsPane = nv.type === 'STD_PREDICTION' ? 'model' : 'settings';
        }
        if (["CUSTOM_R_PREDICTION", "CUSTOM_PREDICTION"].indexOf($scope.endpoint.type) >= 0) {
            $scope.endpoint.envSelection = $scope.endpoint.envSelection || {envMode: 'INHERIT'};
        }
    });

    // STD_PREDICTION / Saved models
    function setSM(ref) {
        if (!ref || !$scope.savedModels) return;
        $scope.savedModel = $scope.savedModels.find(sm => sm.id == ref);
        if ($scope.savedModel.miniTask.backendType === 'KERAS') {
            $scope.endpoint.useJava = false;
            $scope.endpoint.outputExplanations = false;
        } else if ($scope.savedModel.miniTask.backendType !== 'PY_MEMORY') {
            $scope.endpoint.useJava = true;
            $scope.endpoint.outputExplanations = false;
        } else {
            if (!$scope.endpoint.individualExplanationParams) {
                $scope.endpoint.individualExplanationParams = {
                    method: "ICE",
                    nbExplanations: 3,
                    shapleyBackgroundSize: 100
                };
            }
        }
    }

    $scope.$watch("endpoint.modelRef", setSM);
    DataikuAPI.savedmodels.list($stateParams.projectKey).success(function(savedModels) {
        $scope.savedModels = savedModels.filter(Fn(Fn.propStr('miniTask.taskType'), Fn.eq('PREDICTION')));
        setSM($scope.endpoint.modelRef);
    });

    $scope.canComputeExplanations = function() {
        return $scope.savedModel && $scope.savedModel.miniTask.backendType === "PY_MEMORY";
    }

    $scope.getBackendSelectionDisableMessage = function () {
        if ($scope.endpoint.outputExplanations) {
            return "Java scoring is not available when explanations are enabled";
        } else {
            return "Backend selection is not available for this model";
        }
    } 

    $scope.onOutputExplanationsChange = function() {
        if ($scope.endpoint.outputExplanations) {
            $scope.endpoint.useJava = false;
        }
    }


    // CUSTOM_PREDICTION / Managed folders
    function setMF(ref) {
        if (!ref || !$scope.managedFolders) return;
        $scope.managedFolder = $scope.managedFolders.filter(Fn(Fn.prop('id'), Fn.eq(ref)))[0]; // possibly undefined
    }
    $scope.$watch("endpoint.inputFolderRef", setMF);
    DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(managedFolders) {
        $scope.managedFolders = managedFolders;
        setMF($scope.endpoint.inputFolderRef);
    });
    $scope.customCodeSnippetCategories = [''];
    $scope.$watch("endpoint.modelType", function(nv) {
        if (!nv) return;
        $scope.customCodeSnippetCategories = [nv === 'REGRESSION' ? 'py-regressor' : 'py-classifier'];
    });
});


app.controller("FunctionEndpointController", function($scope, $controller, $stateParams, DataikuAPI, Fn, DatasetUtils, Logger) {
    $controller("_EndpointController", {$scope:$scope});
    $scope.testSettingsPane = 'test';
    $scope.testQueriesMode = 'function';

    $scope.uiState.settingsPane = 'loading';

    $scope.$watch('endpoint', function(nv) {
        if (!nv) return;
        if (['loading', 'settings', 'code'].indexOf($scope.uiState.settingsPane) >= 0) {
            $scope.uiState.settingsPane = "code"
        }
        $scope.endpoint.envSelection = $scope.endpoint.envSelection || {envMode:'INHERIT'};
        if ($scope.endpoint.type == 'R_FUNCTION') {
            $scope.customCodeSnippetCategories = ['apinode-r-function-endpoint'];
            $scope.envLang = 'R';
            $scope.sampleType = 'R';
        } else if ($scope.endpoint.type == 'PY_FUNCTION') {
            $scope.customCodeSnippetCategories = ['apinode-py-function-endpoint'];
            $scope.envLang = 'PYTHON';
            $scope.sampleType = 'python';
        }
    });

    DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(managedFolders) {
        $scope.managedFolders = managedFolders;
        // setMF($scope.endpoint.inputFolderRef);
    });
});


app.controller("SQLQueryEndpointController", function($scope, $controller, $stateParams, DataikuAPI, Fn, DatasetUtils, Logger, CodeMirrorSettingService) {
    $controller("_EndpointController", {$scope:$scope});
    $scope.testSettingsPane = 'test';
    $scope.testQueriesMode = 'query';
    $scope.sqlQueryIndex = 0;

    $scope.uiState.settingsPane = 'loading';

    $scope.editorOptions =  CodeMirrorSettingService.get('text/x-sql');
    $scope.customCodeSnippetCategories = ['apinode-sql-query-endpoint'];
    $scope.sampleType = 'sql';

    DataikuAPI.connections.getNames('SQL').success(function (data) { $scope.sqlConnections = data; }).error(setErrorInScope.bind($scope));

    $scope.showSQLQuery = function(index) {
        $scope.sqlQueryIndex = index;
    };

    $scope.addSQLQuery = function() {
        $scope.endpoint.queries.push({query: "-- Insert your SQL code here", inputParameters: [], maxResults: 0});
    };

    $scope.deleteSQLQuery = function(index) {
        $scope.endpoint.queries.splice(index, 1);
        if (index < $scope.sqlQueryIndex) {
            $scope.sqlQueryIndex--;
        } else if (index === $scope.sqlQueryIndex) {
            $scope.sqlQueryIndex = -1;
        }
    };

    $scope.$watch('endpoint', function(nv) {
        if (!nv) return;
        // fromInputParameterNames();
        if (['loading', 'settings', 'query'].indexOf($scope.uiState.settingsPane) >= 0) {
            $scope.uiState.settingsPane = "query"
        }
    });
});


app.controller("DatasetsLookupEndpointController", function($scope, $controller, $stateParams, DataikuAPI, Fn, DatasetUtils, Logger) {
    $controller("_EndpointController", {$scope:$scope});
    $controller("_WithEnrichmentsController", {$scope:$scope});
    $scope.testSettingsPane = 'test';
    $scope.testQueriesMode = 'lookup';

    $scope.uiState.settingsPane = 'loading';

    $scope.$watch('endpoint', function(nv) {
        if (!nv) return;
        $scope.uiState.settingsPane = "lookups";
        $scope.endpoint.lookups = $scope.endpoint.lookups || [];
    });
});


app.directive('endpointTestQueries', function(DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, Dialogs, Fn, $filter, Logger, CodeMirrorSettingService) {
    return {
        restrict: 'A',
        templateUrl: '/templates/lambda/endpoint-test-queries.html',
        replace: true,
        scope: {
            endpoint: '=',
            deployResult: '=',
            testQueriesResult: '=',
            type: '@',
            datasets: '=',
            inputDatasetSmartName: '=',
            run: '&'
        },
        link: function($scope, element, attrs) {

            $scope.emptyTestQueryTemplate = function() {
                if ($scope.type === "predict") {
                    return enrichTestQueryWithExplanations({ q: { features: {} }});
                } else if ($scope.type == "lookup") {
                    return { q: { data: {} }};
                } else {
                    return { q: { paramNameToReplace: "paramValueToReplace" }};
                }
            };
            $scope.getHeight =  function(q) { return Object.keys(q.features).length + 4; };
            $scope.uiState = {
                requestType: "EMPTY",
                queriesBatchSize: 1,
                inputDatasetSmartName: null
            }
            if ($scope.endpoint.testQueries.length > 0) {
                $scope.uiState.testQueryIndex = 0;
            }
            $scope.createNewQueries = function() {
                if ($scope.type === "predict") {
                    $scope.showAddQueriesModal();
                }
                else {
                    $scope.endpoint.testQueries.push($scope.emptyTestQueryTemplate());
                    $scope.uiState.testQueryIndex  = $scope.endpoint.testQueries.length - 1;
                }
            };
            $scope.addQueries = function(requestType, queriesBatchSize, inputDatasetSmartName) {
                const newIndex = $scope.endpoint.testQueries.length;
                if (requestType === "EMPTY") {
                    for (let i = 0; i < queriesBatchSize; i++) {
                        $scope.endpoint.testQueries.push($scope.emptyTestQueryTemplate());
                    }
                } else if (requestType === "DATASET") {
                    DataikuAPI.lambda.services.getSampleQueriesFromDataset($stateParams.projectKey, 
                                                                           inputDatasetSmartName, 
                                                                           $scope.endpoint.modelRef, 
                                                                           queriesBatchSize, "HEAD_SEQUENTIAL").success(function(data) {
                        data.forEach(enrichTestQueryWithExplanations);
                        $scope.endpoint.testQueries.push.apply($scope.endpoint.testQueries, data);
                    }).error(setErrorInScope.bind($scope));
                } else {
                    setErrorInScope.bind($scope);
                }
                $scope.uiState.testQueryIndex = newIndex;
            }

            $scope.deleteTestQuery = function(index) {
                $scope.endpoint.testQueries.splice(index, 1);
                if ($scope.testQueriesResult && $scope.testQueriesResult.responses) {
                    $scope.testQueriesResult.responses.splice(index, 1);
                }
                if (index < $scope.uiState.testQueryIndex) {
                    $scope.uiState.testQueryIndex--;
                } else if (index === $scope.uiState.testQueryIndex) {
                    $scope.uiState.testQueryIndex = -1;
                }
            };

            $scope.duplicateTestQuery = function(index) {
                if (index < 0 || index >= $scope.endpoint.testQueries.length) return;
                const copied = angular.copy($scope.endpoint.testQueries[index]);
                if (copied.name) {
                    copied.name = 'Copy of ' + copied.name;
                }
                const newIndex = $scope.endpoint.testQueries.length;
                $scope.uiState.testQueryIndex = newIndex;
                $scope.endpoint.testQueries.push(copied);
            };

            $scope.showTestQuery = function(index) {
                $scope.uiState.testQueryIndex = index;
            };

            $scope.showAddQueriesModal = function() {
                CreateModalFromTemplate("/templates/lambda/add-queries-modal.html", $scope)
            };

            $scope.getCollectedColumnMappings = function() {
                const mappings = {};
                $scope.endpoint.lookups.forEach(function(lookup) {
                    angular.forEach(lookup.columnsMapping, function(v,k) {
                        mappings[k] = v;
                    });
                });
                return mappings;
            };
            
            function enrichTestQueryWithExplanations(query) {
                if ($scope.endpoint.outputExplanations) {
                    const tq = {
                        enabled: true,
                        method: $scope.endpoint.individualExplanationParams.method,
                        nExplanations: $scope.endpoint.individualExplanationParams.nbExplanations,
                    };
                    if (tq.method === "SHAPLEY") {
                        tq.nMonteCarloSteps = $scope.endpoint.individualExplanationParams.shapleyBackgroundSize;
                    }
                    query.q.explanations = tq;
                }
                return query;
            }
        }
    };
});


app.filter('endpointTypeToName', function(ENDPOINT_TYPES) {
    return function(type) {
        if (!type) {
            return;
        }
        return ENDPOINT_TYPES[type] || type;
    };
});


app.filter('endpointTypeToIcon', function(ENDPOINT_TYPES) {
    return function(type) { // @TODO lambda: improve endpoint icons
        if (!type) {
            return;
        } else if (type == 'STD_PREDICTION') {
            return 'icon-machine_learning_regression';
        } else if (type == 'CUSTOM_PREDICTION') {
            return 'icon-machine_learning_regression';
        } else if (type == 'CUSTOM_R_PREDICTION') {
            return 'icon-machine_learning_regression';
        } else if (type == 'DATASETS_LOOKUP') {
            return 'icon-dataset';
        } else if (type == 'SQL_QUERY') {
            return 'icon-sql';
        } else if (type == 'PY_FUNCTION') {
            return 'icon-dku-python';
        } else if (type == 'R_FUNCTION') {
            return 'icon-dku-r';
        } else {
            return;
        }
    };
});
})();