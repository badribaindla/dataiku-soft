(function(){
'use strict';

const app = angular.module('dataiku.savedmodels', ['dataiku.ml.report', 'dataiku.lambda']);


app.service("SavedModelsService", function($q, DataikuAPI, $stateParams, CreateModalFromTemplate, SmartId, $rootScope,
    ActiveProjectKey, FullModelIdUtils) {
    var listModels = function(projectKey, type) {
        var deferred = $q.defer();
        DataikuAPI.savedmodels.listWithAccessible(projectKey).success(function(data){
            var savedModels = data.filter(function(sm) { return sm.miniTask.taskType === type; });
            savedModels.forEach(function(sm) {
                if (sm.projectKey !== projectKey) {
                    sm.name = sm.projectKey + "." + sm.name;
                    sm.id = sm.projectKey + "." + sm.id;
                }
            });
            deferred.resolve(savedModels);
        });
        return deferred.promise;
    };

    var svc = {
        listPredictionModels: function(projectKey) {
            return listModels(projectKey, 'PREDICTION');
        },
        listClusteringModels: function(projectKey) {
            return listModels(projectKey, 'CLUSTERING');
        },
        isActiveVersion: function(fullModelId, savedModel) {
            if (!fullModelId || !savedModel) return;
            return FullModelIdUtils.parse(fullModelId).versionId === savedModel.activeVersion;
        },
        isPartition: function(fullModelId) {
            if (!fullModelId) return;
            return !!FullModelIdUtils.parse(fullModelId).partitionName;
        },
        createAndPinInsight: function(model, settingsPane, fullModelId) {
            var insight = {
                projectKey: ActiveProjectKey.get(),
                type: 'saved-model_report',
                params: {savedModelSmartId: SmartId.create(model.id, model.projectKey)},
                name: "Full report of model " + model.name
            };

            if (fullModelId) {
                insight.params.fullModelId = fullModelId;
            }

            if (settingsPane) {
                var params = {displayMode: settingsPane};
            }

            CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $rootScope, "CreateAndPinInsightModalController", function (newScope) {
                newScope.init(insight, params);
            });
        }
    };

    return svc;
});

/* ************************************ List / Right column  *************************** */

app.controller("SavedModelPageRightColumnActions", function($controller, $scope, $rootScope, DataikuAPI, $stateParams, ActiveProjectKey) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.selection = {};

    DataikuAPI.savedmodels.get(ActiveProjectKey.get(), $stateParams.smId).success((data) => {
        data.description = data.shortDesc;
        data.nodeType = 'LOCAL_SAVEDMODEL';
        data.name = data.id;
        data.interest = {};

        $scope.selection = {
            selectedObject : data,
            confirmedItem : data,
        };

        updateUserInterests();

    }).error(setErrorInScope.bind($scope));

    function updateUserInterests() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "SAVED_MODEL", ActiveProjectKey.get(), $stateParams.smId).success(function(data) {

            $scope.selection.selectedObject.interest.watching = data.watching;
            $scope.selection.selectedObject.interest.starred = data.starred;

        }).error(setErrorInScope.bind($scope));
    }

    const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);
    $scope.$on("$destroy", interestsListener);
});


app.directive('savedModelRightColumnSummary', function($controller, $state, $stateParams, SavedModelCustomFieldsService, $rootScope, FlowGraphSelection,
    DataikuAPI, CreateModalFromTemplate, QuickView, TaggableObjectsUtils, SavedModelsService, LambdaServicesService, ActiveProjectKey, ActivityIndicator, SelectablePluginsService) {

    return {
        templateUrl :'/templates/savedmodels/right-column-summary.html',

        link : function(scope, element, attrs) {
            $controller('_TaggableObjectsMassActions', {$scope: scope});

            scope.$stateParams = $stateParams;
            scope.QuickView = QuickView;
            scope.LambdaServicesService = LambdaServicesService;

            scope.createAndPinInsight = SavedModelsService.createAndPinInsight;

            scope.getSmartName = function (projectKey, name) {
                if (projectKey == ActiveProjectKey.get()) {
                    return name;
                } else {
                    return projectKey + '.' + name;
                }
            }

            scope.refreshData = function() {
                var projectKey = scope.selection.selectedObject.projectKey;
                var name = scope.selection.selectedObject.name;
                DataikuAPI.savedmodels.getFullInfo(ActiveProjectKey.get(), scope.getSmartName(projectKey, name)).success(function(data){
                    if (!scope.selection.selectedObject || scope.selection.selectedObject.projectKey != projectKey || scope.selection.selectedObject.name != name) {
                        return; // too late!
                    }
                    scope.savedModelData = data;
                    scope.savedModel = data.model;
                    scope.savedModel.zone = (scope.selection.selectedObject.usedByZones || [])[0] || scope.selection.selectedObject.ownerZone;
                    scope.isLocalSavedModel = projectKey == ActiveProjectKey.get();
                }).error(setErrorInScope.bind(scope));
            };

            scope.publishEnabled = function() {
                if (!$state.is('projects.project.savedmodels.savedmodel.prediction.report')
                    && !$state.is('projects.project.savedmodels.savedmodel.clustering.report')) {
                    return true;
                }
                if (SavedModelsService.isPartition($stateParams.fullModelId)) {
                    scope.publishDisabledReason = "Only the overall model can be published";
                    return false;
                }
                if (!SavedModelsService.isActiveVersion($stateParams.fullModelId, scope.smContext.savedModel)) {
                    scope.publishDisabledReason = "Only the active version can be published";
                    return false;
                }
                return true;
            }

            scope.$on("objectSummaryEdited", function() {
                DataikuAPI.savedmodels.save(scope.savedModel, {summaryOnly: true})
                .success(function(data) {
                    ActivityIndicator.success("Saved");
                }).error(setErrorInScope.bind(scope));
            });

            scope.$watch("selection.selectedObject",function() {
                if(scope.selection.selectedObject != scope.selection.confirmedItem) {
                    scope.savedModel = null;
                    scope.objectTimeline = null;
                }
            });

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) {
                    return;
                }
                if (!nv.projectKey) {
                    nv.projectKey = ActiveProjectKey.get();
                }
                scope.refreshData();
            });

            scope.zoomToOtherZoneNode = function(zoneId) {
                const otherNodeId = scope.selection.selectedObject.id.replace(/zone__.+?__saved/, "zone__" + zoneId + "__saved");
                if ($stateParams.zoneId) {
                    $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId: zoneId, id: graphVizUnescape(otherNodeId) }))
                }
                else {
                    scope.zoomGraph(otherNodeId);
                    FlowGraphSelection.clearSelection();
                    FlowGraphSelection.onItemClick(scope.nodesGraph.nodes[otherNodeId]);
                }
            }

            scope.isSMZoneInput = function() {
                return (scope.selection.selectedObject.usedByZones.length && scope.selection.selectedObject.usedByZones[0] != scope.selection.selectedObject.ownerZone);
            }

            scope.trainModel = function() {
                CreateModalFromTemplate("/templates/savedmodels/build-model-modal.html", scope, "BuildSavedModelController", function(newScope) {
                    newScope.projectKey = scope.selection.selectedObject.projectKey;
                    newScope.modelId = scope.selection.selectedObject.name;
                    newScope.redirectAfterTrain = !!attrs.redirectAfterTrain;
                });
            };

            scope.editCustomFields = function() {
                if (!scope.selection.selectedObject) {
                    return;
                }
                DataikuAPI.savedmodels.getSummary(scope.selection.selectedObject.projectKey, scope.selection.selectedObject.name).success(function(data) {
                    let savedModel = data.object;
                    let modalScope = angular.extend(scope, {objectType: 'SAVED_MODEL', objectName: savedModel.name, objectCustomFields: savedModel.customFields});
                    CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                        SavedModelCustomFieldsService.saveCustomFields(savedModel, customFields);
                    });
                }).error(setErrorInScope.bind(scope));
            };

            scope.selectablePlugins = SelectablePluginsService.listSelectablePlugins({'SAVED_MODEL' : 1});

            const customFieldsListener = $rootScope.$on('customFieldsSaved', scope.refreshData);
            scope.$on("$destroy", customFieldsListener);
        }
    }
});

app.service("SavedModelCustomFieldsService", function($rootScope, TopNav, DataikuAPI, ActivityIndicator, WT1){
    let svc = {};

    svc.saveCustomFields = function(savedModel, newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'SAVED_MODEL'});
        let oldCustomFields = angular.copy(savedModel.customFields);
        savedModel.customFields = newCustomFields;
        return DataikuAPI.savedmodels.save(savedModel, {summaryOnly: true})
            .success(function(data) {
                ActivityIndicator.success("Saved");
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), savedModel.customFields);
                $rootScope.$broadcast('reloadGraph');
            })
            .error(function(a, b, c) {
                savedModel.customFields = oldCustomFields;
                setErrorInScope.bind(scope)(a, b, c);
            });
    };

    return svc;
});


app.controller("SavedModelSummaryController", function($scope, $rootScope, $stateParams, $timeout, DataikuAPI, TopNav, ActivityIndicator, ActiveProjectKey, SavedModelCustomFieldsService) {
    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_SAVED_MODEL, TopNav.TABS_SAVED_MODEL, "summary");
    TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId);

    DataikuAPI.savedmodels.getSummary(ActiveProjectKey.get(), $stateParams.smId).success(function(data) {
        $scope.savedModel = data.object;
        $scope.objectInterest = data.interest;
        $scope.objectTimeline = data.timeline;

        TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId, {name: $scope.savedModel.name, taskType: ($scope.savedModel.miniTask || {}).taskType});
        TopNav.setPageTitle($scope.savedModel.name + " - Model");
    }).error(setErrorInScope.bind($scope));

    $scope.refreshTimeline = function() {
        DataikuAPI.timelines.getForObject(ActiveProjectKey.get(), "SAVED_MODEL", $scope.savedModel.id)
        .success(function(data){
            $scope.objectTimeline = data;
        })
        .error(setErrorInScope.bind($scope));
    };

    var save = function() {
        DataikuAPI.savedmodels.save($scope.savedModel, {summaryOnly: true})
            .success(function(data) {
                ActivityIndicator.success("Saved");
            })
            .error(setErrorInScope.bind($scope));
    };

    /* Auto save */
    $scope.$watch("savedModel", function(nv, ov) {
        if (nv && ov) {
            save();
        }
    }, true);

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        SavedModelCustomFieldsService.saveCustomFields($scope.savedModel, customFields);
    });
});


app.controller("SavedModelController", function($scope, Assert, DataikuAPI, CreateModalFromTemplate, $state,
    $stateParams, SavedModelsService, MLExportService, ActiveProjectKey, WebAppsService, FullModelIdUtils){
    $scope.versionsContext = {}
    $scope.smContext = {};
    $scope.uiState = {};
    $scope.clearVersionsContext = function(){
        clear($scope.versionsContext);
    };

    $scope.trainModel = function() {
        CreateModalFromTemplate("/templates/savedmodels/build-model-modal.html", $scope, "BuildSavedModelController", function(newScope) {
            newScope.projectKey = $stateParams.projectKey;
            newScope.modelId = $stateParams.smId;
            newScope.redirectAfterTrain = true;
        });
    };

    $scope.goToAnalysisModelFromVersion = function(){
        Assert.trueish($scope.smContext.model, 'no model data');
        Assert.trueish($scope.smContext.model.smOrigin, 'no origin analysis');

        const id = $scope.smContext.model.smOrigin.fullModelId;
        const elements = FullModelIdUtils.parse(id);

        var params =  {
            projectKey: elements.projectKey, // ProjectKey from SavedModels is updated when reading it
            analysisId: elements.analysisId,
            mlTaskId: elements.mlTaskId,
            fullModelId: id
        }

        var state = "projects.project.analyses.analysis.ml.";
        if ($state.includes("projects.project.savedmodels.savedmodel.prediction")) {
            state += "predmltask.model.report";
        } else {
            state += "clustmltask.model.report";
        }

        if ($scope.smContext.model.smOrigin.origin == "EXPORTED_FROM_ANALYSIS") {
             $state.go(state, params);
         } else {
            CreateModalFromTemplate("/templates/savedmodels/go-to-analysis-model-modal.html", $scope, null, function(newScope){
                newScope.go = function(){
                    newScope.dismiss();
                    $state.go(state, params);
                }
            })
        }
    }

    $scope.showDownloadModel = function(type) {
        return $scope.smContext.model && MLExportService.showDownloadModel($scope.appConfig, type);
    };
    $scope.mayDownloadModel = function(type) {
        return MLExportService.mayDownloadModel($scope.appConfig, $scope.smContext.model, type);
    };
    $scope.downloadModel = function(type) {
        MLExportService.downloadModel($scope, $scope.smContext.model, type, $scope.smContext.partitionName);
    };
    $scope.exportToSnowflakeFunction = function(type) {
        MLExportService.exportToSnowflakeFunction($scope, $scope.smContext.model, $scope.smContext.partitionName);
    };

    $scope.createAndPinInsight = SavedModelsService.createAndPinInsight;

    $scope.isActiveVersion = SavedModelsService.isActiveVersion;
    $scope.isPartition = SavedModelsService.isPartition;

    $scope.$on("$destroy", $scope.clearVersionsContext);

    DataikuAPI.savedmodels.get(ActiveProjectKey.get(), $stateParams.smId).success(function(data) {
        $scope.savedModel = data;
    }).error(setErrorInScope.bind($scope));
});


app.filter('savedModelMLTaskHref', function($state, $stateParams, ActiveProjectKey, FullModelIdUtils) {
    return function(sm) {
        if (!sm || !sm.lastExportedFrom) return;

        const elements = FullModelIdUtils.parse(sm.lastExportedFrom);

        const params =  {
            projectKey: elements.projectKey,  // ProjectKey from SavedModels is updated when reading it
            analysisId: elements.analysisId,
            mlTaskId: elements.mlTaskId
        };

        const type = sm.type || sm.miniTask.taskType;
        let state = "projects.project.analyses.analysis.ml.";
        if (type == "PREDICTION") {
            state += "predmltask.list.results";
        } else {
            state += "clustmltask.list.results";
        }
        return $state.href(state, params);
    };
});

/* ************************************ Versions listing *************************** */


app.controller("SavedModelVersionsController", function($scope, Assert, DataikuAPI, $q, Fn, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, GraphZoomTrackerService, ActiveProjectKey, MLDiagnosticsService){
    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_SAVED_MODEL, TopNav.TABS_SAVED_MODEL, "versions");
    TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId);
    angular.extend($scope, MLDiagnosticsService);

    GraphZoomTrackerService.setFocusItemByName("savedmodel", $stateParams.smId);

    $scope.snippetSource = 'SAVED';

    $scope.isModelDone = function() {
        return true;
    };
    $scope.isModelRunning = function() {
        return false;
    };
    $scope.isSessionRunning = function() {
        return false;
    };
    DataikuAPI.savedmodels.get(ActiveProjectKey.get(), $stateParams.smId).success(function(data) {
        $scope.savedModel = data;
        $scope.smContext.savedModel = data;
        TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId, {name: data.name, taskType: (data.miniTask || {}).taskType});

        const taskType = $scope.savedModel.miniTask.taskType;
        Assert.trueish(['PREDICTION', 'CLUSTERING'].includes(taskType), 'Unknown task type');
        if (taskType === 'PREDICTION') {
            $scope.sRefPrefix = 'projects.project.savedmodels.savedmodel.prediction';
            $controller("PredictionSavedModelVersionsController" , {$scope});
        } else if (taskType === "CLUSTERING") {
            $scope.sRefPrefix = 'projects.project.savedmodels.savedmodel.clustering';
            $controller("ClusteringSavedModelVersionsController" , {$scope});
        }
    }).error(setErrorInScope.bind($scope));

    $scope.canDeleteSelectedModels = function() {
        if (!$scope.selection || !$scope.selection.selectedObjects) {return false}
        return (!$scope.selection.selectedObjects.every(function(o){return o.active}));
    };
});


app.controller("PredictionSavedModelVersionsController", function($scope, DataikuAPI, $q, Fn, CreateModalFromTemplate, $state, $stateParams, TopNav, MLTasksNavService, PMLFilteringService, $controller, Dialogs, ActivityIndicator, ActiveProjectKey, PartitionedModelsService){
    angular.extend($scope, PartitionedModelsService);
    function filterIntermediatePartitionedModels(status) {
        if (status.task && status.task.partitionedModel && status.task.partitionedModel.enabled) {
            /* Keeping all models exported from analysis (they don't have intermediate versions) */
            const analysisModels = status.versions
                .filter(model => model.smOrigin && model.smOrigin.origin === 'EXPORTED_FROM_ANALYSIS');

            /* Grouping models trained from recipe by their JobId */
            const recipeModelsByJobId = status.versions
                .filter(model => model.smOrigin && model.smOrigin.origin === 'TRAINED_FROM_RECIPE')
                .reduce((map, model) => {
                    map[model.smOrigin.jobId] = (map[model.smOrigin.jobId] || []).concat(model);
                    return map;
                }, {});

            /* Keeping most recent or active models in those groups */
            const recipeMostRecentModels = Object.entries(recipeModelsByJobId)
                .map((jobEntries) =>
                    jobEntries[1].reduce((mostRecentModel, currentModel) => {
                        if (!mostRecentModel || currentModel.active) {
                            return currentModel;
                        }

                        return (currentModel.snippet.trainDate > mostRecentModel.snippet.trainDate) ? currentModel : mostRecentModel;
                    }, null));

            status.versions = analysisModels.concat(recipeMostRecentModels);
        }
    }

    $scope.refreshStatus = function(){
        DataikuAPI.savedmodels.prediction.getStatus(ActiveProjectKey.get(), $stateParams.smId).success(function(data){
            data.versions.map(function(v) { v.snippet.versionRank = +v.versionId || 0; });
            $scope.smStatus = data;
            $scope.setMainMetric();
            $scope.possibleMetrics = PMLFilteringService.getPossibleMetrics($scope.smStatus.task);
            if ($scope.smStatus.task.modeling && !$scope.uiState.currentMetric) {
                $scope.uiState.currentMetric = $scope.smStatus.task.modeling.metrics.evaluationMetric;
            }
        }).error(setErrorInScope.bind($scope));
    }

    $scope.refreshStatus();

    $scope.setMainMetric = function() {
        if(!$scope.smStatus || !$scope.smStatus.versions) { return; }
        PMLFilteringService.setMainMetric($scope.smStatus.versions,
            ["snippet"],
            $scope.uiState.currentMetric,
            $scope.smContext.savedModel.miniTask.modeling.metrics.customEvaluationMetricGIB);

        if ($scope.smStatus.task.partitionedModel.enabled) {
            // Updating main metrics for saved model partition snippets too
            angular.forEach($scope.smStatus.versions, (version) => {
                if (version.snippet && version.snippet.partitions) {
                    const modelSnippets = Object.values(version.snippet.partitions.summaries).map(summary => summary.snippet);
                    PMLFilteringService.setMainMetric(modelSnippets,
                        [],
                        $scope.uiState.currentMetric,
                        $scope.smContext.savedModel.miniTask.modeling.metrics.customEvaluationMetricGIB);
                }
            })
        }
    };
    $scope.$watch('uiState.currentMetric', $scope.setMainMetric);

    $scope.makeActive = function(data) {
        Dialogs.confirmPositive($scope, "Set model as active", "Do you want to set this model version as the active scoring version ?").then(function(){
            DataikuAPI.savedmodels.prediction.setActive(ActiveProjectKey.get(), $stateParams.smId, data.versionId)
                .success(function(data) {
                    $scope.refreshStatus();
                    if (data.schemaChanged) {
                        Dialogs.ack($scope, "Schema changed", "The preparation script schema of the selected version is different than " +
                            "the previously selected version, this may affect the ouput schema of downstream scoring recipes.");
                    }
                })
                .error(setErrorInScope.bind($scope));
        });
    };

    $scope.deleteSelectedModels = function() {
        DataikuAPI.savedmodels.prediction.deleteVersions(ActiveProjectKey.get(), $stateParams.smId,
                $scope.selection.selectedObjects.filter(function(o){return !o.active}).map(Fn.prop('versionId')))
            .success($scope.refreshStatus)
            .error(setErrorInScope.bind($scope));
    };
});


app.controller("ClusteringSavedModelVersionsController", function($scope, DataikuAPI, $q, Fn, CreateModalFromTemplate, $state, $stateParams, CMLFilteringService, $controller, Dialogs, ActivityIndicator, ActiveProjectKey){
    $scope.refreshStatus = function(){
        return DataikuAPI.savedmodels.clustering.getStatus(ActiveProjectKey.get(), $stateParams.smId).success(function(data){
            $scope.smStatus = data;
            $scope.setMainMetric();
            $scope.possibleMetrics = CMLFilteringService.getPossibleMetrics($scope.smStatus.task);
            if (!$scope.uiState.currentMetric) {
                $scope.uiState.currentMetric = "SILHOUETTE"; // Dirty tmp
            }
        }).error(setErrorInScope.bind($scope));
    }

    $scope.setMainMetric = function() {
        if(!$scope.smStatus || !$scope.smStatus.versions) { return; }
        CMLFilteringService.setMainMetric($scope.smStatus.versions,
            ["snippet"],
            $scope.uiState.currentMetric,
            $scope.smContext.savedModel.miniTask.modeling.metrics.customEvaluationMetricGIB);
    };

    $scope.makeActive = function(data) {
        Dialogs.confirmPositive($scope, "Set model as active", "Do you want to set this model version as the active scoring version ?").then(function(){
            DataikuAPI.savedmodels.clustering.setActive(ActiveProjectKey.get(), $stateParams.smId, data.versionId)
                .success(function(data) {
                    $scope.refreshStatus();
                    if (data.schemaChanged) {
                        Dialogs.ack($scope, "Schema changed", "The preparation script schema of the selected version is different than " +
                            "the previously selected version, this may affect the ouput schema of downstream scoring recipes.");
                    }
                })
                .error(setErrorInScope.bind($scope));
        });
    };

    $scope.deleteSelectedModels = function() {
        DataikuAPI.savedmodels.clustering.deleteVersions(ActiveProjectKey.get(), $stateParams.smId,
                $scope.selection.selectedObjects.filter(function(o){return !o.active}).map(Fn.prop('versionId')))
            .success($scope.refreshStatus)
            .error(setErrorInScope.bind($scope));
    };

    // Watchers & init

    $scope.$watch('uiState.currentMetric', $scope.setMainMetric);
    $scope.refreshStatus();
});

/* ************************************ Settings *************************** */

app.controller("SavedModelSettingsController", function($scope, DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, ActivityIndicator, ComputableSchemaRecipeSave, WT1, ActiveProjectKey, Logger){
    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_SAVED_MODEL, TopNav.TABS_SAVED_MODEL, "settings");
    TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId);

    var savedSettings;
    DataikuAPI.savedmodels.get(ActiveProjectKey.get(), $stateParams.smId).success(function(data) {
        $scope.savedModel = data;
        $scope.canHaveConditionalOutput = data.miniTask.taskType === 'PREDICTION' && data.miniTask.predictionType === 'BINARY_CLASSIFICATION';
        savedSettings = angular.copy(data);
        TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId, {name: data.name, taskType: (data.miniTask || {}).taskType});

        if (!$scope.canHaveConditionalOutput) return;
        $scope.targetRemapping = ['0', '1'];
        DataikuAPI.ml.prediction.getModelDetails(['S', data.projectKey, data.id, data.activeVersion].join('-')).success(function(data){
            $scope.targetRemapping = [];
            data.preprocessing.target_remapping.forEach(function(r){ $scope.targetRemapping[r.mappedValue] = r.sourceValue; });
        }).error(setErrorInScope.bind($scope));
    }).error(setErrorInScope.bind($scope));

    var getUpdatePromises = function(datasets){
        var promises = [];
        $.each(datasets, function(idx, val) {
            promises.push(DataikuAPI.flow.recipes.saveOutputSchema(ActiveProjectKey.get(),
                        val.type == "DATASET" ?val.datasetName: val.id,
                        val.newSchema, val.dropAndRecreate, val.synchronizeMetastore));
        });
        return promises;
    }
    let oldNumberChecksOnAssertionsMetrics;
    let oldNumberChecks;
    $scope.save = function() {
        try {
            let numberChecksOnAssertionsMetrics = 0;
            let numberChecks = 0;
            if ($scope.savedModel && $scope.savedModel.metricsChecks && $scope.savedModel.metricsChecks.checks) {
                numberChecksOnAssertionsMetrics = $scope.savedModel.metricsChecks.checks.filter(m => m.metricId).filter(
                    m => m.metricId.startsWith("model_perf:ASSERTION_") ||
                        m.metricId === "model_perf:PASSING_ASSERTIONS_RATIO"
                ).length;
                numberChecks = $scope.savedModel.metricsChecks.checks.length || 0;
            }
            if (numberChecksOnAssertionsMetrics !== oldNumberChecksOnAssertionsMetrics ||
                numberChecks !== oldNumberChecks) {

                WT1.event("checks-save", {
                    numberChecksOnAssertionsMetrics: numberChecksOnAssertionsMetrics,
                    numberChecks: numberChecks
                });
            }
            oldNumberChecksOnAssertionsMetrics = numberChecksOnAssertionsMetrics;
            oldNumberChecks = numberChecks;
        }  catch (e) {
            Logger.error('Failed to report checks info', e);
        }
        DataikuAPI.savedmodels.save($scope.savedModel).success(function(data) {
            savedSettings = angular.copy($scope.savedModel);
            if ($scope.canHaveConditionalOutput && data && 'recipes' in data) {
                if (data.recipes.length) {
                    DataikuAPI.flow.recipes.getComputableSaveImpacts($scope.savedModel.projectKey, data.recipes, data.payloads).success(function(data){
                        if (!data.totalIncompatibilities) return;
                        CreateModalFromTemplate("/templates/recipes/fragments/recipe-incompatible-schema-multi.html", $scope, null,
                            function(newScope) {
                                ComputableSchemaRecipeSave.decorateChangedDatasets(data.computables, false);

                                newScope.schemaChanges = data;
                                newScope.customMessage = "The output datasets of scoring recipes using this model have incompatible schemas.";
                                newScope.noCancel = true;
                                function done(){ newScope.dismiss(); };
                                newScope.ignoreSchemaChangeSuggestion = done;
                                newScope.updateSchemaFromSuggestion = function() {
                                    $q.all(ComputableSchemaRecipeSave.getUpdatePromises(data.computables))
                                        .then(done).catch(setErrorInScope.bind($scope));
                                }
                            }
                        );
                    });
                } else if (data.hiddenRecipes) {    // TODO warn?
                }
            }
        }).error(setErrorInScope.bind($scope));
    };

    $scope.dirtySettings = function() {
        return !angular.equals(savedSettings, $scope.savedModel);
    }
    checkChangesBeforeLeaving($scope, $scope.dirtySettings);
});


/* ************************************ Report *************************** */

app.controller("_SavedModelReportController", function($scope, TopNav, $stateParams, DataikuAPI, ActiveProjectKey, WebAppsService){
    if (!$scope.noSetLoc) {
        TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId);
    }

    DataikuAPI.savedmodels.get(ActiveProjectKey.get(), $stateParams.smId).success(function(data) {
        $scope.savedModel = data;
        if ($scope.smContext) $scope.smContext.savedModel = data;
        if (!$scope.noSetLoc) {
            TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId, {name: data.name, taskType: (data.miniTask || {}).taskType});
        }
    });

    $scope.fillVersionSelectorStuff = function(statusData, type){
        if (!$scope.versionsContext.activeMetric) {
            $scope.versionsContext.activeMetric= statusData.task.modeling.metrics.evaluationMetric;
        }
        $scope.versionsContext.versions = statusData.versions.filter(function(m){
            return m.snippet.trainInfo.state == "DONE" && m.snippet.fullModelId != $stateParams.fullModelId;
        });
        $scope.versionsContext.currentVersion = statusData.versions.filter(function(m){
            return m.snippet.fullModelId === $stateParams.fullModelId;
        })[0] || {}; // (partitioned models) ensure watch on versionsContext.currentVersion is fired (see ch45900)
        $scope.versionsContext.versions.sort(function(a, b) {
            var stardiff = (0+b.snippet.userMeta.starred) - (0+a.snippet.userMeta.starred)
            if (stardiff !=0) return stardiff;
            return b.snippet.sessionDate - a.snippet.sessionDate;
        });

        statusData.versions.forEach(function(version) {
            if (version.active) {
                $scope.versionsContext.activeVersion = version;
            }
        });

        if ($scope.versionsContext.currentVersion.snippet) {
            var contentType = $scope.savedModel.contentType;
            if (!contentType.endsWith("/")) {
                contentType = contentType + '/';
            }
            contentType = contentType + $scope.versionsContext.currentVersion.snippet.algorithm.toLowerCase();
            $scope.modelSkins = WebAppsService.getSkins('SAVED_MODEL', $scope.versionsContext.currentVersion.versionId, contentType);
        }
    }
})

app.controller("PredictionSavedModelReportController", function($scope, DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, PMLFilteringService, ActiveProjectKey, ModelEvaluationUtils){
    $scope.noMlReportTourHere = true; // the tabs needed for the tour are not present

    $controller("_PredictionModelReportController",{$scope:$scope});
    $controller("_SavedModelReportController", {$scope:$scope})

    if (!$scope.noSetLoc) {
        TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_SAVED_MODEL, "PREDICTION-SAVED_MODEL-VERSION", "report");
    }

    // Fill the version selector
    DataikuAPI.savedmodels.prediction.getStatus(ActiveProjectKey.get(), $stateParams.smId).success(function(data){
        $scope.fillVersionSelectorStuff(data, "PREDICTION");
        $scope.versionsContext.versions.forEach(function(m){
            m.snippet.mainMetric = PMLFilteringService.getMetricFromSnippet(m.snippet, $scope.versionsContext.activeMetric);
            m.snippet.mainMetricStd = PMLFilteringService.getMetricStdFromSnippet(m.snippet, $scope.versionsContext.activeMetric);
        });
    });
});


app.controller("ClusteringSavedModelReportController", function($scope, $controller, $state, $stateParams, $q, DataikuAPI, CreateModalFromTemplate, TopNav, CMLFilteringService, ActiveProjectKey){
    $controller("_ClusteringModelReportController",{$scope:$scope});
    $controller("_SavedModelReportController", {$scope:$scope})

    if (!$scope.noSetLoc) {
        TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_SAVED_MODEL, "CLUSTERING-SAVED_MODEL-VERSION", "report");
    }

    // Fill the version selector
    DataikuAPI.savedmodels.clustering.getStatus(ActiveProjectKey.get(), $stateParams.smId).success(function(data){
        $scope.fillVersionSelectorStuff(data, "CLUSTERING");
        $scope.versionsContext.versions.forEach(function(m){
            m.snippet.mainMetric = CMLFilteringService.getMetricFromSnippet(m.snippet, $scope.versionsContext.activeMetric);
        });
    });
});


/* ***************************** Scoring recipe creation ************************** */

app.controller("NewPredictionScoringRecipeModalController", function($scope, $stateParams, $controller, DataikuAPI, Fn, SavedModelsService, ActiveProjectKey) {
    $scope.recipeType = "prediction_scoring";
    $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

    $scope.scoringRecipe = {};

    $scope.autosetName = function() {
        if ($scope.io.inputDataset) {
            var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
            $scope.maybeSetNewDatasetName(niceInputName + "_scored");
        }
    };

    $scope.doCreateRecipe = function() {
        var createOutput = $scope.io.newOutputTypeRadio == 'create';

        var finalRecipe = angular.copy($scope.scoringRecipe);
        finalRecipe.inputDatasetSmartName = $scope.io.inputDataset;
        finalRecipe.savedModelSmartName = $scope.smId;
        finalRecipe.createOutput = createOutput;
        finalRecipe.outputDatasetSmartName = createOutput ? $scope.newOutputDataset.name : $scope.io.existingOutputDataset;
        finalRecipe.outputDatasetCreationSettings = $scope.getDatasetCreationSettings();
        finalRecipe.zone = $scope.zone;

        return DataikuAPI.savedmodels.prediction.deployScoring(ActiveProjectKey.get(), finalRecipe);
    };

    $scope.subFormIsValid = function() {
        return !!$scope.smId;
    };

    $scope.$watch('projectKey', function() {
        SavedModelsService.listPredictionModels($scope.projectKey).then(function(savedModels){
            $scope.savedModels = savedModels;
        }, setErrorInScope.bind($scope));;
    });
});


app.controller("NewClusteringScoringRecipeModalController", function($scope, Fn, $stateParams, $controller, DataikuAPI, SavedModelsService, ActiveProjectKey) {
    $scope.recipeType = "prediction_scoring";
    $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

    $scope.scoringRecipe = {};

    $scope.autosetName = function() {
        if ($scope.io.inputDataset) {
            var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
            $scope.maybeSetNewDatasetName(niceInputName + "_scored");
        }
    };

    $scope.doCreateRecipe = function() {
        var createOutput = $scope.io.newOutputTypeRadio == 'create';
        return DataikuAPI.savedmodels.clustering.deployScoring(
            ActiveProjectKey.get(),
            $scope.smId,
            $scope.io.inputDataset,
            createOutput,
            createOutput ? $scope.newOutputDataset.name : $scope.io.existingOutputDataset,
            $scope.getDatasetCreationSettings());
    };

    $scope.subFormIsValid = function() { return !!$scope.smId; };
    $scope.$watch('projectKey', function() {
        SavedModelsService.listClusteringModels($scope.projectKey).then(function(savedModels){
            $scope.savedModels = savedModels;
        }, setErrorInScope.bind($scope));
    });
});

/* ***************************** Evaluation recipe creation ************************** */

app.controller('NewEvaluationRecipeModalController', function($scope, $controller, $stateParams, $state, DataikuAPI, DatasetsService,
DatasetUtils, RecipeComputablesService, PartitionDeps, ActiveProjectKey, $rootScope){
    $scope.recipeType = "evaluation";
    //$controller("VisualRecipeCreationController", {$scope:$scope});
    $controller("_RecipeCreationControllerBase", {$scope:$scope});

    $scope.autosetName = function() {
        if ($scope.io.inputDataset) {
            var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
            $scope.maybeSetNewDatasetName(niceInputName + "_scored");
        }
    };

    addDatasetUniquenessCheck($scope, DataikuAPI, ActiveProjectKey.get());
    fetchManagedDatasetConnections($scope, DataikuAPI);
    DatasetsService.updateProjectList(ActiveProjectKey.get());

    $scope.recipeParams = {
        inputDs: "",
        smId: "",
    };

    $scope.recipe = {
        projectKey : ActiveProjectKey.get(),
        type: "evaluation",
        inputs : {},
        outputs : {},
        params: {}
    };
    $scope.$on("preselectInputDataset", function(scope, preselectedInputDataset) {
        $scope.recipeParams.inputDs = preselectedInputDataset;
    });

    $scope.$watch("recipeParams.inputDs", function(nv, ov) {
        if (nv) {
            $scope.recipe.name = "evaluate_" + nv;
        }
        if ($scope.recipeParams.inputDs) {
            $scope.recipe.inputs.main = {items:[{ref:$scope.recipeParams.inputDs}]}; // for the managed dataset creation options
        } else {
            $scope.recipe.inputs.main = {items:[]}; // for the managed dataset creation options
        }
    }, true);
    $scope.$watch("recipeParams.smId", function(nv, ov) {
        if ($scope.recipeParams.smId) {
            $scope.recipe.inputs.model = {items:[{ref:$scope.recipeParams.smId}]}; // for the managed dataset creation options
        } else {
            $scope.recipe.inputs.model = {items:[]}; // for the managed dataset creation options
        }
    }, true);

    //fetch saved models list
    $scope.$watch('projectKey', function() {
        DataikuAPI.savedmodels.listWithAccessible($scope.projectKey).success(function(data){
            $scope.savedModels = data.filter(function(sm) { return sm.miniTask.taskType === 'PREDICTION' && sm.miniTask.backendType !== 'VERTICA'; });
            $scope.savedModels.forEach(function(sm) {
                if (sm.projectKey !== $scope.projectKey) {
                    sm.name = sm.projectKey + "." + sm.name;
                    sm.id = sm.projectKey + "." + sm.id;
                }
            });
        }).error(setErrorInScope.bind($scope));
    });

    DatasetUtils.listDatasetsUsabilityInAndOut(ActiveProjectKey.get(), "evaluation").then(function(data){
        $scope.availableInputDatasets = data[0];
    });

    RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
        $scope.setComputablesMap(map);
    });

    $scope.hasMain = function() {
        const outputs = $scope.recipe.outputs;
        return outputs.main && outputs.main.items && outputs.main.items.length > 0 && outputs.main.items[0].ref
    }
    $scope.hasMetrics = function() {
        const outputs = $scope.recipe.outputs;
        return outputs.metrics && outputs.metrics.items && outputs.metrics.items.length > 0 && outputs.metrics.items[0].ref
    }
    $scope.hasEvaluationStore = function() {
        const outputs = $scope.recipe.outputs;
        return outputs.evaluationStore && outputs.evaluationStore.items && outputs.evaluationStore.items.length > 0 && outputs.evaluationStore.items[0].ref
    }

    $scope.canCreate = function(){
        return $scope.recipe.name
            && $scope.recipe.name.length > 0
            && $scope.recipe.outputs
            && ($scope.hasMain() || $scope.hasMetrics() || $scope.hasEvaluationStore())
            && !($scope.newRecipeForm.$invalid)
    }

    $scope.shouldDisplayOutputExplanation = function () {
        return !$scope.hasMain() && !$scope.hasMetrics() && !$scope.hasEvaluationStore();
    };

    $scope.generateOutputExplanation = function () {
        const requiredOutputRoles = [];
        $scope.recipeDesc.outputRoles.forEach((role, outputRoleidx) => {
            if (!$rootScope.featureFlagEnabled('model_evaluation_stores')) {
                let canOtherThanEvaluationStore = role.acceptsDataset || role.acceptsSavedModel || role.acceptsManagedFolder || role.acceptsStreamingEndpoint;
                if (!canOtherThanEvaluationStore && role.acceptsModelEvaluationStore) {
                    // skip roles that are only MES
                    return;
                }
            }

            requiredOutputRoles.push(role.name === "main" ? "main output" : '"' + (role.label || role.name) + '"');
        });
        const message = "This recipe requires at least one output in: "
            + requiredOutputRoles.slice(0, -1).join(', ')
            + (requiredOutputRoles.length === 2 ? ' or ' : ', or ')
            + requiredOutputRoles.slice(-1) + ".";
        return message;
    };

    $scope.createRecipe = function() {
        $scope.creatingRecipe = true;
        var finalRecipe = {};

        finalRecipe.inputDatasetSmartName = $scope.recipeParams.inputDs;
        finalRecipe.savedModelSmartName = $scope.recipeParams.smId;
        finalRecipe.scoredDatasetSmartName = $scope.recipe.outputs.main && $scope.recipe.outputs.main.items ? $scope.recipe.outputs.main.items[0].ref : null;
        finalRecipe.metricsDatasetSmartName = $scope.recipe.outputs.metrics && $scope.recipe.outputs.metrics.items ? $scope.recipe.outputs.metrics.items[0].ref : null;
        finalRecipe.evaluationStoreSmartName = $scope.recipe.outputs.evaluationStore && $scope.recipe.outputs.evaluationStore.items ? $scope.recipe.outputs.evaluationStore.items[0].ref : null;
        finalRecipe.zone = $scope.zone;

        DataikuAPI.savedmodels.prediction.deployEvaluation(ActiveProjectKey.get(), finalRecipe)
            .success(function(data) {
                $scope.creatingRecipe = false;
                $scope.dismiss();
                $scope.$state.go('projects.project.recipes.recipe', {
                    recipeName: data.id
                });
            }).error(function(a, b, c) {
                $scope.creatingRecipe = false;
                setErrorInScope.bind($scope)(a,b,c);
            });;

    };
});

app.controller('NewStandaloneEvaluationRecipeModalController', function($scope, $controller, $stateParams, $state, DataikuAPI, DatasetsService,
DatasetUtils, RecipeComputablesService, PartitionDeps, ActiveProjectKey){
    $scope.recipeType = "standalone_evaluation";
    //$controller("VisualRecipeCreationController", {$scope:$scope});
    $controller("_RecipeCreationControllerBase", {$scope:$scope});

    $scope.autosetName = function() {
        if ($scope.io.inputDataset) {
            var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
            $scope.maybeSetNewDatasetName(niceInputName + "_scored");
        }
    };

    addDatasetUniquenessCheck($scope, DataikuAPI, ActiveProjectKey.get());
    DatasetsService.updateProjectList(ActiveProjectKey.get());

    $scope.recipeParams = {
        inputDs: "",
    };

    $scope.recipe = {
        projectKey : ActiveProjectKey.get(),
        type: "standalone_evaluation",
        inputs : {},
        outputs : {},
        params: {}
    };
    $scope.$on("preselectInputDataset", function(scope, preselectedInputDataset) {
        $scope.recipeParams.inputDs = preselectedInputDataset;
    });

    $scope.$watch("recipeParams.inputDs", function(nv, ov) {
        if (nv) {
            $scope.recipe.name = "standalone_evaluate_" + nv;
        }
        if ($scope.recipeParams.inputDs) {
            $scope.recipe.inputs.main = {items:[{ref:$scope.recipeParams.inputDs}]}; // for the managed dataset creation options
        } else {
            $scope.recipe.inputs.main = {items:[]}; // for the managed dataset creation options
        }
    }, true);

    //fetch saved models list
    DatasetUtils.listDatasetsUsabilityInAndOut(ActiveProjectKey.get(), "standalone_evaluation").then(function(data){
        $scope.availableInputDatasets = data[0];
    });

    RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
        $scope.setComputablesMap(map);
    });

    $scope.hasMain = function() {
        const outputs = $scope.recipe.outputs;
        return outputs.main && outputs.main.items && outputs.main.items.length > 0 && outputs.main.items[0].ref
    }

    $scope.canCreate = function(){
        return $scope.recipe.name
            && $scope.recipe.name.length > 0
            && $scope.recipe.outputs
            && $scope.hasMain()
            && !($scope.newRecipeForm.$invalid)
    }

    $scope.shouldDisplayOutputExplanation = function () { return !$scope.hasMain(); };

    $scope.createRecipe = function() {
        $scope.creatingRecipe = true;
        var finalRecipe = {};

        finalRecipe.inputDatasetSmartName = $scope.recipeParams.inputDs;
        finalRecipe.evaluationStoreSmartName = $scope.recipe.outputs.main.items[0].ref;
        finalRecipe.zone = $scope.zone;

        DataikuAPI.savedmodels.prediction.deployStandaloneEvaluation(ActiveProjectKey.get(), finalRecipe)
            .success(function(data) {
                $scope.creatingRecipe = false;
                $scope.dismiss();
                $scope.$state.go('projects.project.recipes.recipe', {
                    recipeName: data.id
                });
            }).error(function(a, b, c) {
                $scope.creatingRecipe = false;
                setErrorInScope.bind($scope)(a,b,c);
            });;

    };
});

app.controller("SavedModelVersionSkinsController", function($scope, $state, VirtualWebApp, $rootScope, $timeout) {
    function setSkinFromTile() {
        // if insight or dashboard tile, we select the skin defined in the params
        if ($scope.tile.tileParams && $scope.tile.tileParams.advancedOptions && $scope.tile.tileParams.advancedOptions.customViews) {
            const viewId = $scope.tile.tileParams.advancedOptions.customViews.viewId;
            $scope.uiState.skin = $scope.modelSkins.find(s => s.id === viewId);
        }
    }

    let modelId = '';
    let version = '';
    if ($scope.savedModel && $scope.savedModel.id) {
        // when called from sm
        modelId = $scope.savedModel.id;
    } else if ($scope.insight &&  $scope.insight.$savedModel && $scope.insight.$savedModel.id) {
        // when called from insight
        modelId = $scope.insight.$savedModel.id;
    } else {
        Logger.error("Skin missing model's modelId");
    }
    if ($scope.versionsContext && $scope.versionsContext.currentVersion && $scope.versionsContext.currentVersion.versionId) {
        // when called from sm
        version = $scope.versionsContext.currentVersion.versionId
    } else if ($scope.insight && $scope.insight.$savedModel && $scope.insight.$savedModel.activeVersion) {
        // when called from insight
        version = $scope.insight.$savedModel.activeVersion;
    } else {
        Logger.error("Skin missing model's version");
    }
    if ($scope.tile && $scope.tile.insightId) {
        $scope.skinHolderClass = "skin-holder-insight-" + $scope.tile.insightId;
        const deregister = $scope.$watch('modelSkins', function (nv, ov) {
            if (!nv) {return}
            // make sure modelSkins is defined before calling setSkinFromTile
            $scope.$watch('tile.tileParams.advancedOptions.customViews.viewId', function () {
                setSkinFromTile(); // changes uiState.skin accordingly
            });
            deregister();
        });
    } else {
        $scope.skinHolderClass = "skin-holder"
    }

    $scope.$watch('uiState.skin', function() {
        if (!$scope.uiState.skin) {return;}
        if ($scope.tile && $scope.tile.tileParams && $scope.tile.tileParams.displayMode === 'skins'
            && $scope.tile.tileParams.advancedOptions && $scope.tile.tileParams.advancedOptions.customViews) {
            // we are in a dashboard tile and the tile has a custom config
            const tileView = $scope.tile.tileParams.advancedOptions.customViews;
            $scope.webAppCustomConfig = {
                ...tileView.viewParams
            }
        }

        // ng-class="skinHolderClass"  needs to be evaluated before changing skin
        $timeout(() =>
            VirtualWebApp.changeSkin($scope, 'SAVED_MODEL', $scope.uiState.skin, $scope.uiState, $scope.skinHolderClass, modelId,
                version, false)
        );
    }, true);
});


})();
