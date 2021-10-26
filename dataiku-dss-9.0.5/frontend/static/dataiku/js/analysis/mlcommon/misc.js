(function(){
'use strict';

var app = angular.module('dataiku.analysis.mlcore');


app.directive("modelTrainProgress", function(ProgressStackMessageBuilder, MLDiagnosticsService) {
    return {
        scope : {
            progress : "=",
            gridsearchData: '=',
            trainDiagnostics: '='
        },
        templateUrl : "/templates/analysis/mlcommon/train-progress.html",
        link : function(scope) {
            scope.$watch("trainDiagnostics", () => {
                scope.groupedDiagnostics = MLDiagnosticsService.groupByStepAndType(scope.trainDiagnostics);
            }, true); // diagnostics can be added to the current step or edited
            scope.$watch("progress", () => {
                if (scope.progress && scope.progress.stack) {
                    scope.stackMessage = ProgressStackMessageBuilder.buildFull(scope.progress.stack);
                } else {
                    scope.stackMessage = '';
                }

                scope.allProgress = [];

                scope.progress.top_level_done.forEach(item => {
                    item.type = 'DONE';
                    scope.allProgress.push(item);
                })

                scope.allProgress.push({ type : "CURRENT", message : scope.stackMessage });

                scope.progress.top_level_todo.forEach(item => {
                    scope.allProgress.push({ type : "TODO", str : item });
                });

            }, true);

            scope.displaySearchProgress = (item) => {
                const searchingSteps = [
                    "Hyperparameter searching", // for regular grid search
                    "Fitting global model", // when training in k-fold
                ];
                return searchingSteps.includes(item.message) && scope.gridsearchData && scope.gridsearchData.gridPoints.length;
            };

            scope.displaySearchTimeProgress = (item) => {
                // we display time progress for searches that are bound by timeout, i.e. when gridSize is 0
                return scope.displaySearchProgress(item) && scope.gridsearchData.gridSize === 0;
            }

            scope.getSearchProgress = () => {
                const gsd = scope.gridsearchData;
                if (!gsd) {
                    return "";
                }
                let gridProgress = "(" + gsd.gridPoints.length + "/" + ((gsd.gridSize !== 0) ? gsd.gridSize : "?") + ")";
                return gridProgress;
            };

            scope.getSearchTimeProgress = () => {
                return durationHHMMSS(Math.max(0, (now - parseInt(scope.progress.stack[0].startTimestamp, 10)) / 1000)) + " / " + durationHHMM(scope.gridsearchData.timeout * 60);
            };
        }
    }
});


app.directive("analysisPredictedTableBase", function($q, Assert, DataikuAPI, Logger){
    return {
        scope: true,
        priority: 30,
        controller: function($scope, $stateParams, $state) {
            Logger.info("APTB");
            /* ********************* Callbacks for shakerExploreBase ******************* */

            $scope.shakerHooks.saveForAuto = function(){
                Assert.inScope($scope, "mlTaskDesign");
                var deferred = $q.defer();

                var toSave = angular.copy($scope.mlTaskDesign);
                toSave.predictedScript = $scope.getShakerData();

                var fn = null;
                if ($scope.mlTaskDesign.taskType == "PREDICTION") {
                    fn = DataikuAPI.analysis.pml.saveSettings;
                } else if ($scope.mlTaskDesign.taskType == "CLUSTERING") {
                    fn = DataikuAPI.analysis.cml.saveSettings;
                } else {
                    throw "Unexpected taskType";
                }

                fn($stateParams.projectKey, $stateParams.analysisId, toSave).success(function(data) {
                    // Reset modification detector
                    $scope.originalShaker = toSave.script;
                    $scope.invalidScriptError = {};
                    // TODO @analysis make this common
                    for (var stepIdx in $scope.shaker.steps) {
                        var step = $scope.shaker.steps[stepIdx];
                        var err = $scope.validateStep(step);
                        if (err != null) {
                            $scope.invalidScriptError = { index : stepIdx , type : step.type, message : err };
                            Logger.info("script is invalid, not refreshing");
                            deferred.reject("Script is invalid");
                            return;
                        }
                    }
                    deferred.resolve();
                }).error(setErrorInScope.bind($scope));
                return deferred.promise;
            }

            $scope.loadMLTask = function(){
                Assert.inScope($scope, "shakerState");
                Assert.inScope($scope, "shakerHooks");

                DataikuAPI.analysis.mlcommon.getCurrentSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
                    $scope.mlTaskDesign = data;

                    $scope.baseInit();
                    $scope.shaker = data.predictionDisplayScript;
                    $scope.originalShaker = angular.copy($scope.shaker);
                    $scope.fixupShaker();
                    $scope.refreshTable(false);
                }).error(setErrorInScope.bind($scope));
            }
            $scope.shakerReadOnlyActions = true;
            $scope.shakerState.isPredictedDataTable = true;
        }
    }
});


app.directive("analysisPredictedChartsBase", function($q, $timeout, Assert, DataikuAPI, Logger, ActivityIndicator, ChartChangeHandler) {
    return {
        scope: true,
        priority: 30,
        controller: function($scope, $stateParams, $state) {
            /* ********************* Execute Callbacks for chartsCommon ******************* */

            $scope.getExecutePromise = function(request) {
                $scope.saveShaker();
                if(request) {
                    return DataikuAPI.analysis.predicted.chartsGetPivotResponse($stateParams.fullModelId,
                        request,
                        $scope.summary.requiredSampleId);
                }
            };

            $scope.getDefaultNewChart = function() {
                return {
                    def: ChartChangeHandler.defaultNewChart(),
                    maxDataBytes: 150*1024*1024
                };
            };

            $scope.saveShaker = function() {
                // UGLY FIXME
                $scope.shaker.charts = $scope.charts;

                Assert.inScope($scope, "mlTaskDesign");

                var toSave = angular.copy($scope.mlTaskDesign);
                toSave.predictedScript = $scope.shaker;

                var fn = null;
                if ($scope.mlTaskDesign.taskType == "PREDICTION") {
                    fn = DataikuAPI.analysis.pml.saveSettings;
                } else if ($scope.mlTaskDesign.taskType == "CLUSTERING") {
                    fn = DataikuAPI.analysis.cml.saveSettings;
                } else {
                    throw "Unexpected taskType";
                }

                if ($scope.isProjectAnalystRW()){
                    fn($stateParams.projectKey, $stateParams.analysisId, toSave).success(function(data) {
                        ActivityIndicator.success("Charts saved");
                    }).error(setErrorInScope.bind($scope));
                } else {
                    ActivityIndicator.warning("You don't have write access - not saving");
                }
            };

            $scope.saveChart = $scope.saveShaker;

            /* ********************* Load callback ******************* */

            $scope.fetchColumnsSummary = function(){
                return DataikuAPI.analysis.predicted.chartsGetColumnsSummary($stateParams.fullModelId).success(function(data) {
                    $scope.summary = data;
                    $scope.makeUsableColumns(data);
                }).error(setErrorInScope.bind($scope));
            }

            $scope.onSettingsLoaded = function(){
                if ($scope.charts.length === 0) {
                    $scope.addChart();
                }

                Logger.info("Data loaded, get summary");
                $scope.fetchColumnsSummary().then(function(){
                    $scope.$watch("charts[currentChart.index]", function(nv){
                        Logger.info("Chart changed, executing");
                        $scope.forceExecuteChartOrWait();
                    });
                });
            }
        }
    }
});

app.controller("_MLModelBaseController", function($scope, $stateParams, DataikuAPI, TopNav, $state, Dialogs){
    TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId);

    DataikuAPI.analysis.getCore($stateParams.projectKey, $stateParams.analysisId).success(function(data) {
        $scope.analysisCoreParams = data;
        TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId, {name : data.name, dataset: data.inputDatasetSmartName});
    }).error(setErrorInScope.bind($scope));

    $scope.$on("$destroy", function(){
        $scope.clearMLTasksContext();
    });

    $scope.deleteTrainedAnalysisModel = function() {
        if ($scope.modelData) {
            Dialogs.confirm($scope,'Model deletion','Are you sure you want to delete this model?').then(function() {
                DataikuAPI.ml.deleteModels([$stateParams.fullModelId]).success(function(data) {
                    $state.go("projects.project.analyses.analysis.ml.list");
                }).error(setErrorInScope.bind($scope));
            });
           
        }
    }

});

app.controller("TrainedModelSkinsController", function($scope, $rootScope, $state, VirtualWebApp) {
    $scope.$watch('uiState.skin', function() {
        VirtualWebApp.changeSkin($scope, 'ANALYSIS', $scope.uiState.skin, $scope.uiState, 'skin-holder',
            $scope.modelData.fullModelId, null, true);
    }, true);
});
})();
