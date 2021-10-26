(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("MetricsInsightHandler", {
        name: "Metrics",
        desc: "Meta data about your source",
        icon: 'icon-external-link',
        color: 'metrics',

        getSourceId: function(insight) {
            return insight.params.objectSmartId;
        },
        getSourceType: function(insight) {
            return insight.params.objectType;
        },
        hasEditTab: false,
        defaultTileParams: {
            displayMode: 'LAST_VALUE'
        },
        defaultTileDimensions: [2, 2]
    });

    app.directive('metricsInsightTile', function($controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $controller('MetricsInsightsViewCommon', {$scope: $scope});

                $scope.loading = false;
                $scope.loaded = false;
                $scope.load = function(resolve, reject) {
                	$scope.loading = true;
                    $scope.loadHistory(
                        DashboardUtils.setLoaded.bind([$scope, resolve]),
                        DashboardUtils.setError.bind([$scope, reject])
               		);
                };
                
                if ($scope.tile.autoLoad) {
                	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('metricsInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('metricsInsightCreateForm', function(DataikuAPI, $stateParams, MetricsUtils, StateUtils){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $scope.MetricsUtils = MetricsUtils;
                $scope.insight.params.objectType = "DATASET";


                var apis = {
                    'DATASET': 'datasets',
                    'SAVED_MODEL': 'savedmodels',
                    'MANAGED_FOLDER': 'managedfolder',
                    'PROJECT' : 'projects'
                };

                $scope.hook.sourceTypes = Object.keys(apis);

                function objectIsSeleted(){
                    $scope.computedMetrics = null;
                    $scope.selectedMetric = null;
                    $scope.insight.params.metricId = null;
                    DataikuAPI[apis[$scope.insight.params.objectType]].listComputedMetrics($stateParams.projectKey, $scope.insight.params.objectSmartId)
                    .success(function(data) {
                        $scope.computedMetrics = data.metrics.filter(function(m) {
                            return m.partitionsWithValue.length > 0;
                        });
                    })
                    .error($scope.hook.setErrorInModaleScope);
                    updateName();
                }

                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !$scope.insight.params.objectSmartId) return;
                    objectIsSeleted();
                });

                $scope.$watch("insight.params.objectType", function(nv, ov) {
                    if (nv === "PROJECT") {
                        objectIsSeleted();
                    }
                })

                $scope.$watch("selectedMetric", function(nv) {
                    if (!nv) return;
                    $scope.insight.params.metricId = nv.metric.id;
                    updateName();
                });

                $scope.$watch("insight.params.metricId", updateName);

                function updateName() {
                    if ($scope.selectedMetric) {
                        $scope.hook.defaultName = MetricsUtils.getMetricDisplayName($scope.selectedMetric) + " on " + $scope.hook.sourceObject.label;
                    } else if ($scope.hook.sourceObject && $scope.hook.sourceObject.label) {
                        $scope.hook.defaultName = "Metric of " + $scope.hook.sourceObject.label;
                    } else {
                        $scope.hook.defaultName = "Metric on object";
                    }
                }

                $scope.getMetricsSettingsUrl = function() {
                    if ($scope.insight.params.objectType && $scope.insight.params.objectSmartId) {
                        switch ($scope.insight.params.objectType) {
                            case 'DATASET' :
                                return StateUtils.href.dataset($scope.insight.params.objectSmartId, $stateParams.projectKey).replace('explore/', 'status/settings/');
                                break;
                            case 'SAVED_MODEL':
                                return StateUtils.href.savedModel($scope.insight.params.objectSmartId, $stateParams.projectKey).replace('versions/', 'settings/#status-checks');
                                break;
                            case 'MANAGED_FOLDER':
                                return StateUtils.href.managedFolder($scope.insight.params.objectSmartId, $stateParams.projectKey).replace('view/', 'status/settings');
                                break;
                            default:
                                break;
                        }
                    }
                }
            }
        };
    });

    app.controller('MetricsInsightsViewCommon', function($scope, DataikuAPI, $stateParams, MetricsUtils) {
        $scope.resolvedObject = resolveObjectSmartId($scope.insight.params.objectSmartId, $stateParams.projectKey);
        $scope.loadHistory = function(resolve, reject) {
            DataikuAPI.metrics.getComputedMetricWithHistory($scope.resolvedObject.projectKey, $scope.insight.params.objectType, $scope.resolvedObject.id, null, $scope.insight.params.metricId)
                .noSpinner()
                .success(function(data) {
                    $scope.metric = data.metric;
                    $scope.history = data.history;
                    $scope.fullRange = MetricsUtils.fixUpRange({from: data.history.from, to: data.history.to});
                    $scope.selectedRange = angular.copy($scope.fullRange);
                    MetricsUtils.fixupDisplayType($scope.history);
                    if (typeof(resolve)==="function") resolve();
                })
                .error(function(data, status, headers, config, statusText) {
                	setErrorInScope.bind($scope);
                	if (typeof(reject)==="function") reject(data, status, headers, config, statusText);
            	}
            );
        };

        $scope.brushChanged = function() {
            $scope.$apply();
        }
    });

    app.directive('metricsInsightView', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('MetricsInsightsViewCommon', {$scope: $scope});
                $scope.loadHistory();
            }
        };
    });

    app.directive('metricsInsightEdit', function($controller, DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_edit.html',
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
