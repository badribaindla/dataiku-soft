(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("SavedModelReportInsightHandler", {
        name: "Saved model report",
        desc: "Full report of a model",
        icon: 'icon-dku-modelize',
        color: 'saved-model',

        getSourceId: function(insight) {
            return insight.params.savedModelSmartId;
        },
        sourceType: 'SAVED_MODEL',
        hasEditTab: false,
        defaultTileParams: {
            displayMode: 'summary'
        },
        defaultTileDimensions: [8, 4],

    });

    app.controller("SavedModelReportViewCommon", function($scope, DataikuAPI, $controller, FullModelIdUtils, WebAppsService, $state, $stateParams) {
        $scope.noMlReportTourHere = true; // the tabs needed for the tour are not present
        $scope.readOnly = true;
        $scope.noUrlChange = true;

        $scope._getSkins = function (versionId, contentType, algorithm) {
            if (!contentType.endsWith("/")) {
                contentType = contentType + '/';
            }
            contentType += algorithm.toLowerCase();
            return WebAppsService.getSkins('SAVED_MODEL', versionId, contentType);
        };

        

        $scope.getModel = function(onLoadError) {
            const p = DataikuAPI.savedmodels.get($scope.insight.projectKey, $scope.insight.params.savedModelSmartId)
            .success(function(data) {
                $scope.insight.$savedModel = data;
                const version = $scope.insight.params.version || data.activeVersion;

                $scope.insight.$fullModelId = FullModelIdUtils.buildSavedModelFmi({
                    projectKey: data.projectKey,
                    savedModelId: data.id,
                    versionId: version
                });
                $scope.fullModelId = $scope.insight.$fullModelId;
                DataikuAPI.ml[data.miniTask.taskType.toLowerCase()].getModelDetails($scope.fullModelId).success(function(modelData) {
                    $scope.modelSkins = $scope._getSkins(version, data.contentType, modelData.modeling.algorithm);
                }).error(setErrorInScope.bind($scope));
                $state.go('.', Object.assign($stateParams, {smId: data.id}), {notify:false, reload:true});
                $scope.noSetLoc = true;
                $scope.versionsContext = {};

                switch (data.miniTask.taskType) {
                    case 'PREDICTION':
                        if ($scope.insight.$savedModel.miniTask.partitionedModel
                            && $scope.insight.$savedModel.miniTask.partitionedModel.enabled) {
                            $controller("PMLPartModelReportController", {$scope:$scope});
                        }
                        $controller("PredictionSavedModelReportController", {$scope:$scope});
                        break;
                    case 'CLUSTERING':
                        $controller("ClusteringSavedModelReportController", {$scope:$scope});
                        break;
                }
            })
            .error(function(data, status, headers, config, statusText) {
            	if (typeof(onLoadError) === "function") onLoadError(data, status, headers, config, statusText); 
            });

            if ($scope.noSpinner) p.noSpinner();
        };

    });

    app.directive('savedModelReportInsightTile', function($controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/saved-model_report/saved-model_report_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){

                $scope.load = function(resolve, reject) {
                    $scope.loading = true;
                    $scope.onLoadSuccess = DashboardUtils.setLoaded.bind([$scope, resolve]);
                    $scope.onLoadError = DashboardUtils.setError.bind([$scope, reject]);
                    $scope.noSpinner = true;
                    $scope.getModel($scope.onLoadError);
                };

                $scope.isPartitionedModel = function() {
                    return $scope.insight.$modelData
                    && $scope.insight.$modelData.coreParams
                    && $scope.insight.$modelData.coreParams.partitionedModel
                    && $scope.insight.$modelData.coreParams.partitionedModel.enabled;
                }

                $controller("SavedModelReportViewCommon", {$scope:$scope});

                // Expose model data for savedModelReportInsightTileParams to display the appropriate tabs
                $scope.$watch("modelData", function(nv) {
                    if (!nv) return;
                    $scope.insight.$modelData = nv;
                });

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }

                $scope.noSkinControls = true; // no need to display controls widget in dashboards view
            }
        };
    });

    app.directive('savedModelReportInsightView', function($controller, $stateParams, DataikuAPI) {
        return {
            templateUrl: '/templates/dashboards/insights/saved-model_report/saved-model_report_view.html',
            scope: true,
            link: function($scope, element, attrs) {
                $controller("SavedModelReportViewCommon", {$scope:$scope});
                $scope.getModel(setErrorInScope.bind($scope));
                $scope.uiState = $scope.uiState || {};
                $scope.$watch("modelData", function(nv, ov) {
                    if (!nv) return;
                    if ($scope.originDashboardStateParams) {
                        DataikuAPI.dashboards.getFullInfo($stateParams.projectKey, $scope.originDashboardStateParams.dashboardId).success(function(data) {
                            const tile = data.dashboard.pages.find(page => page.id === $scope.originDashboardStateParams.pageId).grid.tiles.find(tile => tile.insightId === $stateParams.insightId);
                            $scope.uiState.settingsPane = tile.tileParams.displayMode || "summary";
                        });
                    } else {
                        $scope.uiState.settingsPane = "summary";
                    }
                })
                $scope.onLoadError = function(data, status, headers, config, statusText) {
            		setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                }
            }
        };
    });

    app.directive('savedModelReportInsightTileParams', function($controller, $timeout, DataikuAPI, FullModelIdUtils, $q){
        return {
            templateUrl: '/templates/dashboards/insights/saved-model_report/saved-model_report_tile_params.html',
            scope: {
                tileParams: '=',
                insight: '='
            },
            link: function($scope, $element, attrs){
                $scope.$watch("insight.$modelData", function(nv) {
                    if (!nv) return;
                    $scope.modelData = nv;
                    $scope.fullModelId = $scope.insight.$fullModelId;

                    $controller("SavedModelReportViewCommon", {$scope:$scope});

                    function getVersionSkins(projectKey, smartId) {
                        const deferred = $q.defer();
                        DataikuAPI.savedmodels.get(projectKey, smartId)
                            .success(function (sm) {
                                const version = $scope.insight.params.version || sm.activeVersion;
                                const contentType = sm.contentType;
                                if (!$scope.fullModelId) {
                                    $scope.fullModelId = FullModelIdUtils.buildSavedModelFmi({
                                        projectKey: sm.projectKey,
                                        savedModelId: sm.id,
                                        versionId: version
                                    });
                                }
                                DataikuAPI.ml[sm.miniTask.taskType.toLowerCase()].getModelDetails($scope.fullModelId).success(function (modelDetails) {
                                    // _getSkins() defined in SavedModelReportViewCommon
                                    deferred.resolve($scope._getSkins(version, contentType, modelDetails.modeling.algorithm));
                                }).error(setErrorInScope.bind($scope));
                            });
                        return deferred.promise;
                    };




                    getVersionSkins($scope.insight.projectKey, $scope.insight.params.savedModelSmartId).then(function (modelSkins) {
                        $scope.modelSkins = modelSkins;
                        $timeout(function() {
                            $scope.$broadcast('selectPickerRefresh');
                        });
                    });

                    // set default for tileParams.advancedOptions.interactiveScoring
                    if (!($scope.tileParams.advancedOptions && $scope.tileParams.advancedOptions.interactiveScoring) && $scope.insight.$savedModel.miniTask.taskType == "PREDICTION") {
                        Promise.all([DataikuAPI.ml.prediction.getColumnImportance($scope.fullModelId),
                                     DataikuAPI.ml.prediction.getSplitDesc($scope.fullModelId),
                                     DataikuAPI.ml.prediction.getPreparationScript($scope.fullModelId),
                                     DataikuAPI.ml.prediction.getInputDatasetSchema($scope.fullModelId).catch(e => e)]).then(
                                ([columnImportanceResp, splitDescResp, preparationScriptResp, inputDatasetSchemaResp]) => {
                            let featuresOrder;
                            if (columnImportanceResp.data) { // sort by importance
                                const importances = columnImportanceResp.data.importances;
                                const columns = columnImportanceResp.data.columns;
                                featuresOrder = columns.sort((c1, c2) => importances[columns.indexOf(c2)] - importances[columns.indexOf(c1)])                                
                            } else { // same order as in dataset
                                const perFeature = $scope.modelData.preprocessing.per_feature;
                                const inputColumns = Object.keys(perFeature).filter(featureName => perFeature[featureName].role === "INPUT");
                                featuresOrder = splitDescResp.data.schema.columns.map(c => c.name).filter(c => inputColumns.includes(c));
                            }
                            const hasPreparationSteps = preparationScriptResp.data.steps.some(step => !step.disabled);
                            if (hasPreparationSteps) {
                                if (inputDatasetSchemaResp.data.columns) {
                                    const preScriptFeatures = inputDatasetSchemaResp.data.columns.map((col) =>  col.name);
                                    if (columnImportanceResp.data) {
                                        featuresOrder.push(...preScriptFeatures.filter(f => !featuresOrder.includes(f)));    
                                    } else {
                                        featuresOrder = [...preScriptFeatures, ...featuresOrder.filter(f => !preScriptFeatures.includes(f))];
                                    }
                                } else if (inputDatasetSchemaResp.status !== 404) {
                                    // 404 is expected when the model has no `input_dataset_schema.json` (old model)
                                    // and has no more origin analysis (deleted)
                                    setErrorInScope.call($scope, inputDatasetSchemaResp);
                                }
                            }

                            $scope.tileParams.advancedOptions = {
                                ...$scope.tileParams.advancedOptions,
                                interactiveScoring: {
                                    featuresOrder,
                                }
                            };
                        }).catch(setErrorInScope.bind($scope));
                    }

                    switch ($scope.insight.$savedModel.miniTask.taskType) {
                        case 'PREDICTION':
                            $controller("_PredictionModelReportController", {$scope:$scope});
                            break;
                        case 'CLUSTERING':
                            $controller("_ClusteringModelReportController", {$scope:$scope});
                            break;
                    }

                    $timeout(function() {
                        $element.find('.view-select').selectpicker('refresh');
                    });
                });

            }
        };
    });


    app.directive('savedModelReportInsightCreateForm', function(DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/saved-model_report/saved-model_report_create_form.html',
            scope: true,
            link: function($scope, element, attrs) {
                $scope.hook.defaultName = "Dataset table";
                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !nv.label) return;
                    $scope.hook.defaultName = nv.label + " table";
                });

                /*
                $scope.$watch("insight.params.savedModelSmartId", function(nv) {
                    $scope.versions = [];
                    if (!nv) return;
                    DataikuAPI.savedmodels.listVersionIds($scope.insight.projectKey, $scope.insight.params.savedModelSmartId).success(function() {
                        $scope.versions = data;
                    });
                })
                */
            }
        };
    });


})();
