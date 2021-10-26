(function() {
'use strict';

const app = angular.module('dataiku.analysis.script');


app.directive('analysisCharts', function($q, $timeout, Logger, Assert, DataikuAPI, WT1, ActivityIndicator, TopNav, DatasetUtils, ChartChangeHandler) {
return {
        scope: true,
        controller: function ($scope, $stateParams, $state) {
            if ($stateParams.chartIdx) {
                $scope.currentChart.index = parseInt($stateParams.chartIdx);
            }

            /* ********************* Execute Callbacks for chartsCommon ******************* */

            function getDataSpec() {
                const currentChart = $scope.charts[$scope.currentChart.index];
                Assert.trueish(currentChart, "No current chart");
                const dataSpec = {
                    datasetProjectKey : $scope.inputDatasetProjectKey,
                    datasetName : $scope.inputDatasetName,
                    script: angular.copy($scope.shaker),
                    copySelectionFromScript: currentChart.copySelectionFromScript,
                    sampleSettings : currentChart.refreshableSelection,
                    engineType : "LINO"
                }
                dataSpec.script.origin = "ANALYSIS";
                return dataSpec;
            }

            $scope.getExecutePromise = function(request, saveShaker = true, noSpinner = false) {
                const currentChart = $scope.charts[$scope.currentChart.index];
                Assert.trueish(currentChart, "No current chart");
                Assert.trueish(currentChart.summary, "Current chart summary is not ready");

                (saveShaker !== false) && $scope.saveShaker();
                if (request) {
                    let promise = DataikuAPI.shakers.charts.getPivotResponse($stateParams.projectKey, getDataSpec(), request, currentChart.summary.requiredSampleId);

                    if (noSpinner === true) {
                        promise = promise.noSpinner();
                    }

                    return promise;
                }
            };

            $scope.saveChart = function(){
                $scope.saveShaker();
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
                        maxDataBytes: 150*1024*1024
                    }
                }
                newChart.engineType = "LINO";
                return newChart;
            }

            function acpIsDirty(ignoreThumbnailChanges) {
                try {
                    var savedACP2 = angular.copy(savedACP);
                    var acp = angular.copy($scope.acp);

                    if (ignoreThumbnailChanges) {
                        acp.charts.forEach(function(chart){
                            chart.def.thumbnailData = null;
                        });
                        savedACP2.charts.forEach(function(chart){
                            chart.def.thumbnailData = null;
                        });
                    }
                    return !angular.equals(acp, savedACP2);
                } catch (e) {
                    Logger.error(e);
                    return true;
                }
            }

            $scope.saveShaker = function() {
                Logger.info("Save ACP");

                var ignoreThumbnailChanges = !$scope.isProjectAnalystRW();
                if (!acpIsDirty(ignoreThumbnailChanges)) {
                    Logger.info("No changes: don't save shaker")
                    return;
                }

                if ($scope.isProjectAnalystRW()){
                    DataikuAPI.analysis.saveCore($scope.acp).success(function(data) {
                        ActivityIndicator.success("Charts saved");
                    }).error(setErrorInScope.bind($scope));
                } else {
                    ActivityIndicator.warning("You don't have write access - not saving");
                }
            };

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
                    promise = DataikuAPI.shakers.charts.getColumnsSummary($stateParams.projectKey, dataSpec)
                        .error(setErrorInScope.bind($scope))
                        .then(function(response) {
                        cachedColumnSummaries[cacheKey] = response.data;
                        return response.data;
                    })
                }

                return promise.then(function(data){
                    currentChart.summary = data;
                    $scope.makeUsableColumns(data);
                });
            }

            /* ********************* Main ******************* */

            var savedACP;
            var main = function(){
                WT1.event("analysis-charts-open");
                TopNav.setLocation(TopNav.TOP_ANALYSES, null, TopNav.TABS_ANALYSIS, "charts");
                TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId);

                DataikuAPI.analysis.getCore($stateParams.projectKey, $stateParams.analysisId).success(function(data) {
                    $scope.acp = data;
                    $scope.shaker = data.script;
                    $scope.charts = data.charts;
                    savedACP = angular.copy(data);
                    TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId, {name:data.name, dataset: data.inputDatasetSmartName});
                    TopNav.setPageTitle(data.name);

                    var inputDatasetLoc = DatasetUtils.getLocFromSmart($stateParams.projectKey, data.inputDatasetSmartName);
                    // set the context required for baseInit
                    $scope.analysisDataContext.inputDatasetLoc = inputDatasetLoc;
                    $scope.inputDatasetProjectKey = inputDatasetLoc.projectKey;
                    $scope.inputDatasetName = inputDatasetLoc.name;

                    DataikuAPI.datasets.get($scope.inputDatasetProjectKey, $scope.inputDatasetName, $stateParams.projectKey).success(function(data){
                        $scope.dataset = data;
                    }).error(setErrorInScope.bind($scope));

                    if ($scope.charts.length === 0) {
                        $scope.addChart();
                    }
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
                }).error(setErrorInScope.bind($scope));
            }

            main();
        }
    }
})


app.directive("analysisChartSamplingEditor", function(DataikuAPI, $controller, $stateParams, $timeout, WT1, $q, CreateModalFromTemplate, DatasetUtils, ChartUtils) {
    return {
        scope : {
            dataset: '=',
            chart : '=',
            script : '='
        },
        templateUrl : "/templates/analysis/charts-sampling-editor-tab.html",
        controller : function($scope){
            $scope.canCopySelectionFromScript = true;
            $controller("_ChartOnDatasetSamplingEditorBase", {$scope:$scope});

            $scope.save = function() {
                if ($scope.chart.refreshableSelection) {
                    $scope.chart.refreshableSelection._refreshTrigger =
                            ($scope.chart.refreshableSelection._refreshTrigger||0)+1;
                }

                // $scope.validateChange().then(function(){
                    // $scope.origSampling = angular.copy($scope.sampling);
                    $scope.$emit("chartSamplingChanged");
                // }).catch(function() {
                    // $scope.sampling = angular.copy($scope.origSampling);
                // });
            };
            $scope.saveNoRefresh = function() {
                $scope.$emit("chartSamplingChanged");
            };

        }
    }
});

app.directive('columnAnalysis', function(DataikuAPI, $stateParams) { return {
    scope: { ids: '=', column: '=', callback: '=?', cache: '=?',
        isNumeric: '=?', isDate: '=?', asList: '=?' , distinctValues: '=?'},
    templateUrl: '/templates/analysis/column-analysis.html',
    transclude: true,
    link: function(scope, element, attrs) {
        if (scope.cache === true) {
            scope.cache = {};
        }
        scope.$watch('column', function(column) {
            function fixupData(data) {
                if (typeof scope.callback === 'function') { // not sure it's still used
                    scope.callback(data);
                }
                if (typeof data.missing === 'number') { // if not 0 but rounded to 0.0%, force emphasize => 0.1%
                    data.pcEmpty = data.missing ? ((Math.round(data.missing * 1000) || 1) / 10) : 0.0;
                }
                if (typeof data.bad === 'number') { // same
                    data.pcNOK = data.bad ? ((Math.round(data.bad * 1000) || 1) / 10) : 0.0;
                }
            };

            const key = column;
            function setData(data) {
                if (!data) return;
                if (scope.cache) {
                    scope.cache[key] = data;
                }

                const analysisData = scope.isNumeric && data.numericalAnalysis || !scope.isNumeric && data.alphanumFacet;
                if (!analysisData) return;

                scope.data = analysisData;
                scope.distinctValues = scope.data.totalNbValues;
                fixupData(scope.data);
            };

            scope.count = attrs.alphaFacets && parseInt(attrs.alphaFacets) || 7;
            if (scope.cache && key in scope.cache) {
                setData(scope.cache[key]);
            } else if (scope.ids) {
                DataikuAPI.shakers.detailedColumnAnalysis.apply(DataikuAPI.shakers,[$stateParams.projectKey].concat(scope.ids()).concat(scope.column).concat(50))
                .success(function(data){
                    setData(data);
                }).error(setErrorInScope.bind(scope.$parent || scope));
            }
        });
    }
}; });

})();
