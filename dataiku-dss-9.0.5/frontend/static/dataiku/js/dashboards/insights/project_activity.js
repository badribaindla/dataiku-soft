(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("ProjectActivityInsightHandler", {
        name: "Project activity",
        desc: "Activity charts of a project",
        icon: 'icon-dashboard',
        color: 'project',

        getSourceId: function(insight) {
            return insight.params.projectKey;
        },
        sourceType: 'PROJECT',
        hasEditTab: false,
        defaultTileParams: {
            displayMode: 'CONTRIBUTION_CHARTS',
            summaryChart: 'commits',
            contributorsChart: 'commits',
            timeSpan: 'year'
        }
    });

    app.controller('ProjectActivityInsightViewCommon', function($scope, DataikuAPI, $stateParams, MetricsUtils) {
        $scope.resolvedObject = resolveObjectSmartId($scope.insight.params.objectSmartId, $stateParams.projectKey);
        $scope.loadHistory = function(resolve, reject) {
            DataikuAPI.metrics.getComputedMetricWithHistory($scope.resolvedObject.projectKey, $scope.insight.params.objectType, $scope.resolvedObject.id, null, $scope.insight.params.metricId)
                .noSpinner()
                .success(function(data) {
                    $scope.metric = data.metric;
                    $scope.history = data.history;
                    $scope.fullRange = {from: data.history.from, to: data.history.to};
                    $scope.selectedRange = {from: data.history.from, to: data.history.to};
                    MetricsUtils.fixupDisplayType($scope.history);
                    if (typeof(resolve)==="function") resolve();
                })
                .error(function() {
                        setErrorInScope.bind($scope);
                        if (typeof(reject)==="function") reject();
                    }
                );
        };

        $scope.brushChanged = function() {
            $scope.$apply();
        }
    });


    app.directive('projectActivityInsightTile', function($controller, DataikuAPI, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $controller('ProjectActivityViewCommonController', {$scope: $scope});

                $scope.loading = false;
                $scope.loaded = false;
                $scope.load = function(resolve, reject) {
                	$scope.loading = true;
                    DataikuAPI.projects.activity.getActivitySummary($scope.insight.params.projectKey, $scope.tile.tileParams.timeSpan || 'year')
                        .success($scope.prepareData)
                        .success(DashboardUtils.setLoaded.bind([$scope, resolve]))
                        .error(DashboardUtils.setError.bind([$scope, reject]))
                        .noSpinner();
                };

                $scope.$watch("tile.tileParams.timeSpan", function(nv, ov) {
                    if (nv && ov && nv != ov) {
                        DataikuAPI.projects.activity.getActivitySummary($scope.insight.params.projectKey, $scope.tile.tileParams.timeSpan || 'year')
                            .success($scope.prepareData)
                            .error(DashboardUtils.setError.bind([$scope, reject]))
                        .noSpinner();
                    }
                });

                if ($scope.tile.autoLoad) {
                	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('projectActivityInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('projectActivityInsightCreateForm', function(DataikuAPI, $stateParams){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $scope.$watch("hook.sourceObject", updateName);
                $scope.hook.noReaderAuth = true;

                function updateName() {
                    if ($scope.hook.sourceObject && $scope.hook.sourceObject.label) {
                        $scope.hook.defaultName = "Activity of " + $scope.hook.sourceObject.label;
                    } else {
                        $scope.hook.defaultName = "Activity of project";
                    }
                }
            }
        };
    });

    app.directive('projectActivityInsightView', function($controller, DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_view.html',
            scope: true,
            link: function($scope, element, attrs){
                $controller('ProjectActivityViewCommonController', {$scope: $scope});
                $scope.uiState = {
                    settingsPane : 'summary',
                    summaryChart: 'commits',
                    contributorsChart: 'commits',
                    timeSpan: 'year'
                };

                $scope.$watch('uiState.timeSpan', function(timeSpan) {
                    if (!timeSpan) return;
                    DataikuAPI.projects.activity.getActivitySummary($scope.insight.params.projectKey, timeSpan)
                        .success($scope.prepareData)
                        .error(setErrorInScope.bind($scope));
                });
            }
        };
    });

    app.directive('projectActivityInsightEdit', function($controller, DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_edit.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('ChartInsightViewCommon', {$scope: $scope});

                $scope.currentInsight = $scope.insight;

                $scope.bigChart = false;
                $scope.saveChart = function() {};

                $scope.saveChart = function(){
                    DataikuAPI.dashboards.insights.save($scope.insight)
                        .error(setErrorInScope.bind($scope))
                        .success(function () {});
                };

                $scope.$on('chartSamplingChanged', function() {
                    $scope.summary = null;
                    $scope.fetchColumnsSummary();
                    $scope.saveChart();
                });

                $scope.fetchColumnsSummary();
            }
        };
    });

})();
