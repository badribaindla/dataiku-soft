(function(){
'use strict';

const app = angular.module('dataiku.shaker');


app.directive("shakerExplorePristine", function($timeout, $q, Assert, DataikuAPI, WT1, ActivityIndicator, TopNav, DKUtils, DatasetErrorCta) {
    return {
        scope: true,
        controller: function ($scope, $stateParams, $state) {

            /* ********************* Callbacks for shakerExploreBase ******************* */

            $scope.shakerHooks.saveForAuto = function() {
                var deferred = $q.defer();
                resetErrorInScope($scope);
                var shakerData = $scope.getShakerData();

                if ($scope.isRecipe) {
                    throw "Should not call this for a recipe";
                } else {
                    DataikuAPI.explores.saveScript($stateParams.projectKey, $stateParams.datasetName,
                        shakerData).success(function(data){
                        $scope.originalShaker = shakerData;
                        deferred.resolve();
                    }).error(setErrorInScope.bind($scope));
                }
                return deferred.promise;
            };

            $scope.shakerHooks.setColumnMeaning = function(column, newMeaning){
                DataikuAPI.explores.setColumnMeaning($stateParams.projectKey, $stateParams.datasetName,
                    column.name, newMeaning).success(function(data){
                    $scope.refreshTable(false);
                }).error(setErrorInScope.bind($scope));
            };

            $scope.shakerHooks.getSetColumnStorageTypeImpact = function(column, newType){
                return DataikuAPI.explores.getSetColumnStorageTypeImpact($stateParams.projectKey, $stateParams.datasetName, column.name, newType);
            };

            $scope.shakerHooks.setColumnStorageType = function(column, newType, actions){
                DataikuAPI.explores.setColumnStorageType($stateParams.projectKey, $stateParams.datasetName,
                    column.name, newType, actions).success(function(data){
                        $scope.refreshTable(false);
                        if (data.reload) {
                            DKUtils.reloadState();
                        } else if (data.refreshSample) {
                            $scope.shaker.explorationSampling._refreshTrigger++;
                            $scope.forgetSample();
                            $scope.autoSaveForceRefresh();
                        } else {
                            ActivityIndicator.success("Dataset schema saved - You might need to refresh the sample", 4000);
                        }
                }).error(function(a,b,c) {
                    ActivityIndicator.error("Failed to change column name, check sampling pane", 4000);
                    setErrorInScope.bind($scope)(a,b,c)
                });
            };

            $scope.shakerHooks.updateColumnDetails = function(column) {
                Assert.trueish(column, 'cannot update column with null');
                DataikuAPI.explores.updateColumn($stateParams.projectKey, $stateParams.datasetName, column).success(function(data){
                    $scope.refreshTable(false);
                    ActivityIndicator.success("Dataset schema saved - You might need to refresh the sample", 4000);
                }).error(setErrorInScope.bind($scope));
            };
 
            /* ********************* Main ******************* */

            // Set base context and call baseInit
            Assert.inScope($scope, 'shakerHooks');

            TopNav.setLocation(TopNav.TOP_FLOW, 'datasets', TopNav.TABS_DATASET, "explore")

            $scope.table = null;
            $scope.scriptId = "__pristine__";
            $scope.shakerWithSteps = false;
            $scope.shakerReadOnlyActions = true;
            $scope.shakerWritable = false;
            $scope.inputDatasetProjectKey = $stateParams.projectKey;
            $scope.inputDatasetName = $stateParams.datasetName;
            $scope.inputDatasetSmartName = $stateParams.datasetName;

            WT1.event("shaker-explore-open");

            $scope.$watch("projectSummary", function(nv, ov) {
                $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            });

            //For datasetErrorCTA directive (CTA in case of error while loading dataset sample)

            $scope.updateUiState = DatasetErrorCta.getupdateUiStateFunc($scope);

            $scope.$watch("datasetFullInfo", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("shakerState", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("table", _ => $scope.updateUiState($scope.shakerState.runError));

            // Load shaker, set the necessary stuff in scope and call the initial refresh
            DataikuAPI.explores.getScript($stateParams.projectKey, $stateParams.datasetName).success(function(shaker) {
                $scope.shaker = shaker;
                $scope.shaker.origin = "DATASET_EXPLORE";
                $scope.fixupShaker();
                $scope.requestedSampleId = null;
                $scope.refreshTable(false);

            }).error(setErrorInScope.bind($scope));

            $timeout(function() { $scope.$broadcast("tabSelect", "Filters") });

            // Load stuff for "edit last analysis"
            DataikuAPI.analysis.listOnDataset($stateParams.projectKey, $stateParams.datasetName).success(function(data) {
                data.sort(function(a, b) {
                    return b.lastModifiedOn - a.lastModifiedOn;
                });
                if (data.length) {
                    Mousetrap.bind("g l a", $state.go.bind($state,
                        "projects.project.analyses.analysis.script", {analysisId: data[0].id}));
                    $scope.$on("$destroy", function(){
                        Mousetrap.unbind("g l a")
                    });
                }
            }).error(setErrorInScope.bind($scope));

        }
    }
});

app.directive("shakerExploreStreamingEndpoint", function($timeout, $q, Assert, DataikuAPI, WT1, ActivityIndicator, TopNav, DKUtils, DatasetErrorCta) {
    return {
        scope: true,
        controller: function ($scope, $stateParams, $state) {

            /* ********************* Callbacks for shakerExploreBase ******************* */

            $scope.shakerHooks.saveForAuto = function() {
                var deferred = $q.defer();
                resetErrorInScope($scope);
                var shakerData = $scope.getShakerData();

                if ($scope.isRecipe) {
                    throw "Should not call this for a recipe";
                } else {
                    DataikuAPI.explores.saveCaptureScript($stateParams.projectKey, $stateParams.streamingEndpointId,
                        shakerData).success(function(data){
                        $scope.originalShaker = shakerData;
                        deferred.resolve();
                    }).error(setErrorInScope.bind($scope));
                }
                return deferred.promise;
            };

            $scope.shakerHooks.setColumnMeaning = function(column, newMeaning){
            };

            $scope.shakerHooks.getSetColumnStorageTypeImpact = function(column, newType){
                return null;
            };

            $scope.shakerHooks.setColumnStorageType = function(column, newType, actions){
            };

            $scope.shakerHooks.updateColumnDetails = function(column) {
            };

            /* ********************* Main ******************* */

            // Set base context and call baseInit
            Assert.inScope($scope, 'shakerHooks');

            $scope.table = null;
            $scope.scriptId = "__pristine__";
            $scope.shakerWithSteps = false;
            $scope.shakerWritable = false;
            $scope.inputDatasetProjectKey = $stateParams.projectKey;
            $scope.inputStreamingEndpointId = $stateParams.streamingEndpointId;

            WT1.event("shaker-explore-open");

            $scope.$watch("projectSummary", function(nv, ov) {
                $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            });

            //For datasetErrorCTA directive (CTA in case of error while loading dataset sample)

            $scope.updateUiState = DatasetErrorCta.getupdateUiStateFunc($scope);

            $scope.$watch("streamingEndpoint", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("shakerState", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("table", _ => $scope.updateUiState($scope.shakerState.runError));

            // Load shaker, set the necessary stuff in scope and call the initial refresh
            DataikuAPI.explores.getCaptureScript($stateParams.projectKey, $stateParams.streamingEndpointId).success(function(shaker) {
                $scope.shaker = shaker;
                $scope.shaker.origin = "DATASET_EXPLORE";
                if ($scope.shaker.explorationSampling && $scope.shaker.explorationSampling.selection && $scope.shaker.explorationSampling.selection.timeout < 0) {
                    $scope.shaker.explorationSampling.selection.timeout = 10;
                }
                if ($scope.shaker.vizSampling && $scope.shaker.vizSampling.selection && $scope.shaker.vizSampling.selection.timeout < 0) {
                    $scope.shaker.vizSampling.selection.timeout = 10;
                }
                $scope.fixupShaker();
                $scope.requestedSampleId = null;
                $scope.refreshTable(false);

            }).error(setErrorInScope.bind($scope));

            $timeout(function() { $scope.$broadcast("tabSelect", "Filters") });
        }
    }
});


}());
