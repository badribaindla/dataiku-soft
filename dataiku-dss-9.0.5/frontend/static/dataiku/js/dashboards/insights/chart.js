(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    var hasFacetDimension = function(insight) {
        return insight.params && insight.params.def && insight.params.def.facetDimension && insight.params.def.facetDimension.length > 0;
    };

    app.constant("ChartInsightHandler", {
        name: "Chart",
        desc: "Visualize data from your source",
        icon: 'icon-dku-nav_dashboard',
        color: 'chart',

        sourceType: 'DATASET',
        getSourceId: function(insight) {
            return insight.params.datasetSmartName;
        },
        hasEditTab: true,
        goToEditAfterCreation: true,
        getDefaultTileParams: function(insight) {
            return {
                showXAxis: true,
                showYAxis: true,
                showLegend: false,
                showTooltips: true,
                autoPlayAnimation: true
            };
        },
        getDefaultTileDimensions(insight) {
            if (insight && hasFacetDimension(insight)) {
                return [5, 4];
            }
            return [2, 2];
        }
    });

    app.directive('chartInsightTile', function($controller, ChartRequestComputer, MonoFuture, LabelsController, ChartChangeHandler, DashboardUtils, InsightLoadingState, InsightLoadingBehavior){
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $scope.disableChartInteractivityGlobally = true;
                $scope.DashboardUtils = DashboardUtils;

                var origLegendPlacement = $scope.insight.params.def.legendPlacement;

                $controller('ChartInsightViewCommon', {$scope: $scope});

                $scope.noClickableTooltips = true;
                $scope.legends = [];
                $scope.animation = {};
                $scope.tooltips = {};
                $scope.noCoachmarks = true;
                $scope.chartSpecific = {};

                $scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.loadedCallback = function() {
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.COMPLETE;
                };
                $scope.load = function(resolve, reject) {

                    var successRoutine = DashboardUtils.setLoaded.bind([$scope, resolve]);
                    var errorRoutine = DashboardUtils.setError.bind([$scope, reject]);
                    var unconfiguredRoutine = DashboardUtils.setUnconfigured.bind([$scope, reject]);

                    ChartChangeHandler.fixupChart($scope.insight.params.def);
                    if ($scope.origInsight) ChartChangeHandler.fixupChart($scope.origInsight.params.def);

                    LabelsController($scope);
                    $scope.loading = true;
                    $scope.fetchColumnsSummary($scope.insight.projectKey).success(function() {
                        var request;
                        try {
                            request = ChartRequestComputer.compute($scope.insight.params.def, element.width(), element.height(), $scope.chartSpecific);
                        } catch (e) {}

                        if (!request) {
                            unconfiguredRoutine();
                        } else {
                            var executePivotRequest = MonoFuture($scope).wrap($scope.getExecutePromise);
                            executePivotRequest(request).update(function(data) {
                                $scope.request = request;
                                $scope.response = data;
                            }).success(function(data) {
                                $scope.request = request;
                                $scope.response = data;
                                successRoutine();
                                if (typeof(resolve)==="function") resolve();
                            }).error(function(data, status, headers, config, statusText){
                                errorRoutine(data, status, headers, config, statusText);
                                if (typeof(reject)==="function") reject();
                            });
                        }
                    }).error(function(data, status, headers, config, statusText) {
                        errorRoutine(data, status, headers, config, statusText);
                        if (typeof(reject)==="function") reject();
                    });
                    return InsightLoadingBehavior.DELAYED_COMPLETE;
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }

                $scope.$watch("tile.tileParams", function(nv) {
                    if (!nv) return;
                    $scope.noXAxis = !nv.showXAxis;
                    $scope.noYAxis = !nv.showYAxis;
                    $scope.noTooltips = !nv.showTooltips;
                    $scope.autoPlayAnimation = nv.autoPlayAnimation;
                    if ($scope.chart) {
                        $scope.chart.def.originLegendPlacement = origLegendPlacement;
                        if (!nv.showLegend) {
                            $scope.chart.def.legendPlacement = 'SIDEBAR';
                        } else {
                            $scope.chart.def.legendPlacement = origLegendPlacement;
                        }
                        $scope.chart.def.showXAxis = nv.showXAxis;
                    }
                    $scope.$broadcast('redraw');
                }, true);
            }
        };
    });

    app.directive('chartInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_tile_params.html',
            scope: {
                tileParams: '=',
                insight: '='
            },
            link: function($scope, element, attrs){
                $scope.$watch("insight", function(nv) {
                    if (!nv) return;
                    $scope.noAxis = ["pie", "scatter_map", "grid_map", "admin_map", "pivot_table", ]
                        .indexOf($scope.insight.params.def.type) != -1;
                    $scope.noLegend = ["pivot_table", "binned_xy", "lift"]
                        .indexOf($scope.insight.params.def.type) != -1 || $scope.insight.params.def.originLegendPlacement === 'SIDEBAR';
                    $scope.noAnimation = $scope.insight.params.def.animationDimension.length === 0;
                })
            }
        };
    });

    app.directive('chartInsightCreateForm', function(DataikuAPI, ChartChangeHandler, DatasetChartsUtils){
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $scope.hook.beforeSave = function(resolve, reject) {
                    DataikuAPI.explores.get($scope.insight.projectKey, $scope.insight.params.datasetSmartName)
                        .success(function(data) {
                            $scope.insight.params.refreshableSelection = DatasetChartsUtils.makeSelectionFromScript(data.script);
                            $scope.insight.params.def = ChartChangeHandler.defaultNewChart();
                            $scope.insight.params.engineType = "LINO";

                            resolve();
                        })
                        .error(function(data, status, headers, config, statusText){
                            reject(arguments);
                        });
                };

                $scope.$watch("insight.params.datasetSmartName", function(nv) {
                    if (!nv) return;
                    $scope.insight.name = "Chart on " + $scope.insight.params.datasetSmartName;
                })
            }
        };
    });

    app.controller('ChartInsightViewCommon', function($scope, DataikuAPI, $stateParams, $controller, ActiveProjectKey) {
        $controller('ShakerChartsCommonController', {$scope: $scope});

        $scope.isProjectAnalystRW = function() {
            return true;
        };

        $scope.resolvedDataset = resolveDatasetFullName($scope.insight.params.datasetSmartName, ActiveProjectKey.get());

        // Needed by chart directives
        $scope.chart = {
            def: $scope.insight.params.def,
            refreshableSelection: $scope.insight.params.refreshableSelection,
            engineType : $scope.insight.params.engineType
        };

        if ($scope.tile) {
            $scope.chart.def.showLegend = $scope.tile.tileParams.showLegend;
            $scope.chart.def.showXAxis = $scope.tile.tileParams.showXAxis;
        }

        function getDataSpec(){
            return {
                datasetProjectKey: $scope.resolvedDataset.projectKey,
                datasetName: $scope.resolvedDataset.datasetName,
                copyScriptFromExplore: true,
                copySelectionFromScript: false,
                sampleSettings : $scope.insight.params.refreshableSelection,
                engineType : $scope.insight.params.engineType
            };
        }

        $scope.getExecutePromise = function(request) {
            if(request) {
                request.maxDataBytes = $scope.insight.params.maxDataBytes;
                const projectKey = $scope.insight.projectKey || ActiveProjectKey.get();
                return DataikuAPI.shakers.charts.getPivotResponse(
                    projectKey, getDataSpec(),
                    request,
                    $scope.chart.summary.requiredSampleId).noSpinner();
            }
        };

        $scope.fetchColumnsSummary = function(projectKey){
            // get columns summary
            if (!projectKey) projectKey  = ActiveProjectKey.get();
            return DataikuAPI.shakers.charts.getColumnsSummary(projectKey, getDataSpec())
                .noSpinner()
                .success(function(data) {
                    $scope.chart.summary = data;
                    $scope.makeUsableColumns(data);
                }).error(setErrorInScope.bind($scope));
        };

        // chartHandler options
        $scope.noThumbnail = true;
    });

    app.directive('chartInsightView', function($controller, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $scope.disableChartInteractivityGlobally = true;
                $controller('ChartInsightViewCommon', {$scope: $scope});
                $controller("ChartsCommonController", {$scope:$scope});

                $scope.noClickableTooltips = true;
                $scope.noCoachmarks = true;
                $scope.readOnly = true;
                $scope.bigChart = true;
                $scope.bigChartDisabled = true;
                $scope.legendsShown = true;
                $scope.saveChart = function() {};

                $scope.fetchColumnsSummary().then(function(){
                    $scope.forceExecuteChartOrWait();
                })
            }
        };
    });

    app.directive('chartInsightEdit', function($controller, $stateParams, DataikuAPI, $timeout, $rootScope) {
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_edit.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('ChartInsightViewCommon', {$scope: $scope});
                $controller("ChartsCommonController", {$scope:$scope});

                $scope.currentInsight = $scope.insight;
                $scope.appConfig = $rootScope.appConfig;
                $scope.uiDisplayState = {};

                $scope.bigChart = false;
                $scope.saveChart = function() {};

                $scope.saveChart = function(){
                    DataikuAPI.dashboards.insights.save($scope.insight)
                        .error(setErrorInScope.bind($scope))
                        .success(function () {});
                };

                function fetchSummaryAndExecute(){
                    $scope.fetchColumnsSummary().then(function(){
                        $scope.forceExecuteChartOrWait();
                    })
                }

                $scope.$watch("chart.engineType", function(nv) {
                    if (!nv) return;
                    $scope.insight.params.engineType = nv;
                });

                $scope.$on('chartSamplingChanged', function() {
                    $scope.summary = null;
                    fetchSummaryAndExecute();
                    $scope.saveChart();
                });

                DataikuAPI.datasets.get($scope.resolvedDataset.projectKey, $scope.resolvedDataset.datasetName, $stateParams.projectKey)
                .success(function(data) {
                    $scope.dataset = data;
                    fetchSummaryAndExecute();
                }).error(setErrorInScope.bind($scope));

                $scope.$watch("chart.def.name", function(nv, ov) {
                    if ($scope.insight.name == "Chart on " + $scope.insight.params.datasetSmartName
                        || $scope.insight.name == ov + " on " + $scope.insight.params.datasetSmartName) {
                        $scope.insight.name = nv + " on " + $scope.insight.params.datasetSmartName
                    }
                })

            }
        };
    });

})();
