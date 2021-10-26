(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("DatasetTableInsightHandler", {
        name: "Dataset",
        nameForTileParams: "Dataset table",
        desc: "Partial or whole datatable",
        icon: 'icon-table',
        color: 'dataset',

        sourceType: 'DATASET',
        getSourceId: function(insight) {
            return insight.params.datasetSmartName;
        },
        hasEditTab: true,
        defaultTileParams: {
            showName: true,
            showDescription: true,
            showCustomFields: true,
            showMeaning: false,
            showProgressBar: false
        },
        defaultTileSize: [],
        defaultTileDimensions: [6, 3]
    });

    app.controller('DatasetTableViewCommon', function($scope, DataikuAPI, $stateParams) {
        $scope.resolvedDataset = resolveDatasetFullName($scope.insight.params.datasetSmartName,  $stateParams.projectKey);

    });

    app.directive('datasetTableInsightTile', function($controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
            	$controller('DatasetTableViewCommon', {$scope: $scope});

                $scope.ngShowLoaded = true;

            	$scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                    $scope.refreshNoSpinner = true;
                    $scope.refreshTableDone = DashboardUtils.setLoaded.bind([$scope, resolve]);
                    $scope.refreshTableFailed = DashboardUtils.setError.bind([$scope, reject]);
                    $scope.loading = true;
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('datasetTableInsightView', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_view.html',
            scope: {
                insight: '=',
                tileParams: '='
            },
            link: function($scope, element, attrs) {
                $controller('DatasetTableViewCommon', {$scope: $scope});
            }
        };
    });


    app.directive('datasetTableInsightEdit', function($controller, DataikuAPI, SmartId, WT1, $stateParams, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_edit.html',
            scope: true,
            link: function($scope, element, attrs) {
                $controller('DatasetTableViewCommon', {$scope: $scope});
            }
        };
    });


    app.directive("shakerExploreInsight", function($filter, $timeout, $q, Assert, DataikuAPI, WT1, SmartId) {
        return {
            scrope: true,
            controller: function ($scope, $stateParams, $state) {

                var resolvedDataset = SmartId.resolve($scope.insight.params.datasetSmartName);

                /* ********************* Callbacks for shakerExploreBase ******************* */

                $scope.shakerHooks.saveForAuto = function() {
                    $scope.insight.params.shakerScript = $scope.getShakerData();
                };

                $scope.inInsight = true;

                $scope.shakerHooks.setColumnMeaning = function(column, newMeaning){
                };

                $scope.shakerHooks.getSetColumnStorageTypeImpact = function(column, newType) {
                    return null;
                };
                $scope.shakerHooks.setColumnStorageType = function(column, newType, actionId){
                };

                $scope.shakerHooks.updateColumnDetails = function(column) {
                };

                $scope.setSpinnerPosition = function() {}

                /* ********************* Main ******************* */

                // Set base context and call baseInit
                Assert.inScope($scope, 'shakerHooks');

                $scope.table = null;
                $scope.scriptId = "__pristine__";
                $scope.shakerWithSteps = false;
                $scope.shakerWritable = false;
                $scope.shakerReadOnlyActions = true;
                $scope.inputDatasetProjectKey = resolvedDataset.projectKey;
                $scope.inputDatasetName = resolvedDataset.id;
                $scope.inputDatasetSmartName = $scope.insight.params.datasetSmartName;

                WT1.event("shaker-explore-open");

                $scope.shaker = $scope.insight.params.shakerScript;
                $scope.shakerState.writeAccess = true;
                $scope.shaker.origin = "DATASET_EXPLORE";
                if ($scope.origInsight) {
                    $scope.origInsight.params.shakerScript.origin = "DATASET_EXPLORE";
                }

                if ($scope.tile) {
                    $scope.shaker.$headerOptions = $scope.tile.tileParams;
                } else {
                    $scope.shaker.$headerOptions = {
                        showName: true,
                        showMeaning: true,
                        showDescription: true,
                        showCustomFields: true,
                        showProgressBar: true
                    };
                }

                $scope.fixupShaker();
                if ($scope.origInsight) {
                    $scope.fixupShaker($scope.origInsight.params.shakerScript);
                }
                $scope.requestedSampleId = null;
                $scope.refreshTable(false);
            }
        };
    });

    app.directive('datasetTableInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_tile_params.html',
            scope: {
                tileParams: '=',
                insight: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('datasetTableInsightCreateForm', function(DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_create_form.html',
            scope: true,
            link: function($scope, element, attrs) {

                $scope.hook.beforeSave = function(resolve, reject) {
                    DataikuAPI.explores.get($scope.insight.projectKey, $scope.insight.params.datasetSmartName)
                        .success(function(data) {
                            $scope.insight.params.shakerScript = data.script;
                            resolve();
                        })
                        .error(function(data, status, headers, config, statusText){
                            reject(arguments);
                        });
                };

                $scope.hook.defaultName = "Dataset table";
                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !nv.label) return;
                    $scope.hook.defaultName = nv.label + " table";
                });
            }
        };
    });

})();
