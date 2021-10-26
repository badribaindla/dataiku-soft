(function(){
'use strict';

const app = angular.module('dataiku.ml.predicted', []);


/**
 * Shared stuff for predicted table and predicted charts.
 * Shared between analysis, saved models and insights
 */

app.directive("predictedTableBase", function($q, WT1, Assert, DataikuAPI, TopNav, MonoFuture, Logger) {
    return {
        scope: true,
        priority: 50,
        controller: function($scope, $stateParams, $state) {
            /* ********************* Callbacks for shakerExploreBase ******************* */

            $scope.shakerHooks.saveForAuto = function() {
                Assert.inScope($scope, 'mlTaskDesign');
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
                            $scope.invalidScriptError = {
                                index: stepIdx,
                                type: step.type,
                                message: err
                            };
                            Logger.info("script is invalid, not refreshing");
                            deferred.reject("Script is invalid");
                            return;
                        }
                    }
                    deferred.resolve();
                }).error(setErrorInScope.bind($scope));
                return deferred.promise;
            }

            /* ********************* Callbacks for shakerExploreBase ******************* */

            var monoFuturizedRefresh = MonoFuture($scope).wrap(DataikuAPI.analysis.predicted.predictedRefreshTable);

            $scope.shakerHooks.getRefreshTablePromise = function(filtersOnly, filterRequest) {
                return monoFuturizedRefresh($stateParams.fullModelId,
                    $scope.shaker,
                    filtersOnly, filterRequest);
            }

            $scope.shakerHooks.shakerForQuery = function(){
                var queryObj = angular.copy($scope.shaker);
                if ($scope.isRecipe) {
                    queryObj.recipeSchema = $scope.recipeOutputSchema;
                }
                queryObj.contextProjectKey = $stateParams.projectKey; // quick 'n' dirty, but there are too many call to bother passing the projectKey through them
                return queryObj;
            }

            $scope.shakerHooks.fetchDetailedAnalysis = function(setAnalysis, handleError, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics) {
                // withFullSampleStatistics, fullSamplePartitionId are not relevant in this context
            	DataikuAPI.analysis.predicted.detailedColumnAnalysis($stateParams.fullModelId, $scope.shakerHooks.shakerForQuery(), columnName, alphanumMaxResults).success(function(data){
                        	setAnalysis(data);
                }).error(function(a, b, c) {
                    if (handleError) {
                        handleError(a, b, c);
                    }    
                    setErrorInScope.bind($scope)(a, b, c);
                });
    		};

            $scope.shakerHooks.getTableChunk = function(firstRow, nbRows, firstCol, nbCols, filterRequest) {
                return DataikuAPI.analysis.predicted.predictedGetTableChunk($stateParams.fullModelId,
                    $scope.shaker, firstRow, nbRows, firstCol, nbCols, filterRequest)
            }

            $scope.loadMLTask = function(){
                Assert.inScope($scope, 'shakerState');
                Assert.inScope($scope, 'shakerHooks');
                $scope.shakerWithSteps = false;

                DataikuAPI.analysis.mlcommon.getCurrentSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
                    $scope.mlTaskDesign = data;

                    $scope.baseInit();
                    $scope.shaker = data.predictionDisplayScript;
                    $scope.originalShaker = angular.copy($scope.shaker);
                    $scope.fixupShaker();
                    $scope.refreshTable(false);
                }).error(setErrorInScope.bind($scope));
            }
        }
    }
});


app.directive("predictedChartsBase", function(){
    return {
        scope: true,
        priority: 50,

        controller: function() {
        }
    }
});


})();
