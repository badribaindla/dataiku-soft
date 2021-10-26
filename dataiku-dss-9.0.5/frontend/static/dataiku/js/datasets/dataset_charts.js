(function() {
"use strict";

const  app = angular.module('dataiku.shaker');


app.directive('datasetChartsBase', function(Assert, ChartChangeHandler, Logger, CreateModalFromTemplate, DatasetUtils, WT1, TopNav, DataikuAPI, $timeout, ActivityIndicator, $state, $stateParams, $q, DatasetChartsUtils, ChartSetErrorInScope, DatasetErrorCta){
    return {
        priority: 2,
        scope : true,
        controller: function ($scope, $stateParams) {
            ChartSetErrorInScope.defineInScope($scope);
            $scope.onLoad = function(projectKey, datasetName, contextProjectKey, datasetSmartName) {
                if ($stateParams.chartIdx) {
                    $scope.currentChart.index = parseInt($stateParams.chartIdx);
                }

                //For datasetErrorCTA directive (CTA in case of error while loading dataset sample)
                $scope.errorCTA = {};

                $scope.updateUiState = DatasetErrorCta.getupdateUiStateFunc($scope);

                $scope.$watch("datasetFullInfo", _ => $scope.updateUiState($scope.errorCTA.error), true);
                $scope.$watch("errorCTA", _ => $scope.updateUiState($scope.errorCTA.error), true);

                /* ********************* Execute Callbacks for chartsCommon ******************* */

                function getDataSpec(){
                    var currentChart = $scope.charts[$scope.currentChart.index];
                    Assert.trueish(currentChart, 'no currentChart');

                    var dataSpec = {
                        datasetProjectKey: projectKey,
                        datasetName: datasetName,
                        script: angular.copy($scope.shaker),
                        copySelectionFromScript: currentChart.copySelectionFromScript,
                        sampleSettings: currentChart.refreshableSelection,
                        engineType: currentChart.engineType
                    };
                    dataSpec.script.origin = "DATASET_EXPLORE";
                    return dataSpec;
                }

                $scope.getExecutePromise = function(request, saveShaker = true, noSpinner = false) {
                    var currentChart = $scope.charts[$scope.currentChart.index];
                    Assert.trueish(currentChart.summary, "Current chart summary is not ready");
                    (saveShaker !== false) && $scope.saveShaker();
                    if(request) {
                        request.maxDataBytes = currentChart.maxDataBytes;
                        let promise = DataikuAPI.shakers.charts.getPivotResponse(
                            projectKey,
                            getDataSpec(),
                            request,
                            currentChart.summary.requiredSampleId
                        );

                        if (noSpinner === true) {
                            promise = promise.noSpinner();
                        }

                        return promise;
                    }
                };

                $scope.$on("chartSamplingChanged", function(){
                    $scope.clearCachedSummaries();
                    $scope.fetchColumnsSummaryForCurrentChart().then(function(){
                        Logger.info("Sample reloaded, executing chart");
                        $scope.$broadcast("forceExecuteChart");
                    });
                });

                $scope.getDefaultNewChart = function() {
                    var newChart = null;
                    if ($scope.charts.length > 0) {
                        // Copy to retrieve the same sample, copySample and engine settings
                        newChart = angular.copy($scope.charts[$scope.charts.length - 1]);
                        newChart.def = ChartChangeHandler.defaultNewChart();
                    } else {
                        newChart = {
                            def : ChartChangeHandler.defaultNewChart(),
                            copySelectionFromScript : true,
                            engineType : "LINO",
                            maxDataBytes: 150*1024*1024
                        }
                    }
                    return newChart;
                }

                function exploreIsDirty(ignoreThumbnailChanges) {
                    try {
                        var savedExplore2 = angular.copy(savedExplore);
                        var explore = angular.copy($scope.explore);

                        if (ignoreThumbnailChanges) {
                            if (explore) {
                                explore.charts.forEach(function(chart){
                                    chart.def.thumbnailData = null;
                                });
                            }
                            if (savedExplore2) {
                                savedExplore2.charts.forEach(function(chart){
                                    chart.def.thumbnailData = null;
                                });
                            }
                        }
                        return !angular.equals(explore, savedExplore2);
                    } catch (e) {
                        Logger.error(e);
                        return true;
                    }
                }

                $scope.saveShaker = function() {
                    Logger.info("Saving shaker");
                    var ignoreThumbnailChanges = !$scope.isProjectAnalystRW();
                    if (!exploreIsDirty(ignoreThumbnailChanges)) {
                        Logger.info("No changes: don't save explore");
                        return;
                    }

                    if ($scope.isProjectAnalystRW()){
                        DataikuAPI.explores.save(contextProjectKey, datasetSmartName, $scope.explore).success(function(data) {
                            ActivityIndicator.success("Charts saved");
                        }).error(setErrorInScope.bind($scope));
                    } else {
                        ActivityIndicator.warning("You don't have write access - not saving");
                    }
                };

                $scope.saveChart = $scope.saveShaker;

                /* ********************* Load callback ******************* */

                var cachedColumnSummaries = {};

                $scope.clearCachedSummaries = function(){
                    $scope.charts.forEach(function(x) {
                        x.summary = null;
                    });
                    cachedColumnSummaries = {};
                }

                $scope.fetchColumnsSummaryForCurrentChart = function(forceRefresh){
                    var currentChart = $scope.charts[$scope.currentChart.index];
                    var dataSpec = getDataSpec();
                    var cacheKey = JSON.stringify(dataSpec).dkuHashCode();

                    var promise = null;
                    if (cachedColumnSummaries[cacheKey] != null && !forceRefresh) {
                        Logger.info("Already cached for", dataSpec);
                        promise = $q.when(cachedColumnSummaries[cacheKey]);
                    } else {
                        Logger.info("No cache for", dataSpec);
                        promise = DataikuAPI.shakers.charts.getColumnsSummary(projectKey, dataSpec)
                            .error($scope.chartSetErrorInScope)
                            .then(function(response) {
                            cachedColumnSummaries[cacheKey] = response.data;
                            return response.data;
                        })
                    }

                    return promise.then(
                        function(data) {
                            currentChart.summary = data;
                            $scope.makeUsableColumns(data);
                            if ($scope.errorCTA) {
                                $scope.errorCTA.error = null;
                            }
                        },
                        function(attr) {
                            if ($scope.errorCTA) {
                                $scope.errorCTA.error = getErrorDetails(attr.data, attr.status, attr.headers, attr.statusText);
                            }
                        }
                    );
                };

                $scope.createAndPinInsight = function(){
                    let insights = [];

                    $scope.charts.forEach(chart => {
                        let insight = {
                            type: 'chart',
                            projectKey: contextProjectKey,
                            name: chart.def.name + ' on ' + datasetSmartName,
                            params: {
                                datasetSmartName: datasetSmartName,
                                engineType: chart.engineType,
                                refreshableSelection: chart.refreshableSelection,
                                def : chart.def,
                                maxDataBytes: chart.maxDataBytes
                            }
                        };
                        if (insight.params.refreshableSelection == null) {
                            insight.params.refreshableSelection = DatasetChartsUtils.makeSelectionFromScript($scope.shaker);
                        }

                        insights.push(insight);
                    });

                    CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insights-modal.html", $scope, "CreateAndPinInsightsModalController", function(newScope) {
                        let selectedCharts = angular.copy($scope.charts);
                        selectedCharts.forEach(_ => _.selected = false);
                        selectedCharts[$scope.currentChart.index].selected = true;

                        newScope.insightData = {
                            items: selectedCharts,
                            type: 'chart'
                        }

                        newScope.init(insights);
                    });
                };

                /* ********************* Main ******************* */

                var savedExplore;
                var main = function(){
                    WT1.event("dataset-charts-open");
                    TopNav.setLocation(TopNav.TOP_FLOW, 'datasets', TopNav.TABS_DATASET, "visualize");

                    DataikuAPI.explores.get(contextProjectKey, datasetSmartName).success(function(data) {
                        $scope.explore = data;
                        $scope.shaker = data.script;
                        $scope.charts = data.charts;
                        savedExplore = angular.copy($scope.savedExplore);

                        DataikuAPI.datasets.get(projectKey, datasetName, $stateParams.projectKey).success(function(data){
                            $scope.dataset = data;
                        }).error(setErrorInScope.bind($scope));

                        if ($scope.charts.length == 0) {
                            $scope.addChart();
                        }

                        Logger.info("Explore loaded, get summary");

                        $scope.$watch("charts[currentChart.index]", function(nv){
                            Logger.info("Chart changed, fetching summary and executing");
                            if (nv) {
                                $scope.fetchColumnsSummaryForCurrentChart().then(function(){
                                    // Fixes a race condition that used to happen sometimes when explores.get returned before the
                                    // event listeners in chart_logic.js were properly set up, causing the forceExecuteChart to be missed
                                    // and nothing to be drawn.
                                    $scope.forceExecuteChartOrWait();
                                })
                            }
                        });
                        if ($scope.errorCTA) {
                            $scope.errorCTA.error = null;
                        }
                    }).error(function(data, status, headers, config, statusText, xhrStatus) {
                        setErrorInScope.bind($scope)(data, status, headers, config, statusText, xhrStatus);
                        if ($scope.errorCTA) {
                            $scope.errorCTA.error = getErrorDetails(data, status, headers, statusText);
                        }
                    });
                };

                main();
            };
        }
    }
});

app.directive('datasetCharts', function(){
    return {
        scope : true,
        controller  : function ($scope, $stateParams) {
            $scope.onLoad($stateParams.projectKey, $stateParams.datasetName, $stateParams.projectKey, $stateParams.datasetName);
        }
    }
});

app.directive('foreignDatasetCharts', function(Logger, DatasetUtils) {
    return {
        scope : true,
        controller  : function ($scope, $stateParams) {
            var loc = DatasetUtils.getLocFromFull($stateParams.datasetFullName);
            $scope.onLoad(loc.projectKey, loc.name, $stateParams.projectKey, $stateParams.datasetFullName);
        }
    }
});

app.directive("datasetChartSamplingEditor", function(DataikuAPI, $stateParams, $timeout, WT1, $q, CreateModalFromTemplate, DatasetUtils, ChartUtils, $rootScope) {
    return {
        scope : {
            dataset: '=',
            chart : '=',
            script : '=',
            canCopySelectionFromScript : '='
        },
        templateUrl : "/templates/simple_report/dataset-chart-sampling-editor.html",
        controller : function($scope, $controller){
            $controller("_ChartOnDatasetSamplingEditorBase", {$scope:$scope});

            function makeEnginesStatus(dataset, script, chartSpec) {
                var engines = [
                    ["LINO", $rootScope.wl.productShortName, true, ""]
                ]
                var sqlEngine = ["SQL", "In-database", false, ""];
                if (!DatasetUtils.canUseSQL($scope.dataset)) {
                    sqlEngine[3] = "Dataset is not SQL";
                } else if (script != null && script.steps.length) {
                    sqlEngine[3] = "Script contains steps";
                } else if (!ChartUtils.canUseSQL({def: chartSpec})) {
                    sqlEngine[3] = "This chart is not compatible with in-database";
                } else {
                    sqlEngine[2] = true;
                }
                engines.push(sqlEngine);
                if ($rootScope.appConfig.interactiveSparkEngine != null) {
                    var sparksqlEngine = ["SPARKSQL", "SparkSQL", false, ""];
                    if (!DatasetUtils.canUseSparkSQL($scope.dataset)) {
                        sqlEngine[3] = "Dataset is SQL, use in-database engine";
                    } else if (script != null && script.steps.length) {
                        sparksqlEngine[3] = "Script contains steps";
                    } else if (!ChartUtils.canUseSQL({def: chartSpec})) {
                        sparksqlEngine[3] = "This chart is not compatible with SparkSQL";
                    } else {
                        sparksqlEngine[2] = true;
                    }
                    engines.push(sparksqlEngine);
                }
                return engines;
            }

            $scope.$watch("chart", function(){
                $scope.availableEngines = makeEnginesStatus(
                                $scope.dataset, $scope.script, $scope.chart.def);
            });

            /* Auto-revert to compatible settings */
            $scope.$watch("chart.engineType", function(nv, ov){
                if (!nv || !ov) return;

                if ((nv == "SQL" || nv == "SPARKSQL") && !$scope.chart.refreshableSelection) {
                    $scope.chart.refreshableSelection = {
                        selection: {
                            samplingMethod: "FULL",
                            partitionSelectionMethod: "ALL"
                        }
                    }
                }
            });

            $scope.save = function() {
                if ($scope.chart.refreshableSelection != null) {
                    $scope.chart.refreshableSelection._refreshTrigger =
                            ($scope.chart.refreshableSelection._refreshTrigger||0)+1;
                }

                $scope.$emit("chartSamplingChanged");
            };

            $scope.saveNoRefresh = function() {
                $scope.$emit("chartSamplingChanged");
            };
        }
    }
});

})();
