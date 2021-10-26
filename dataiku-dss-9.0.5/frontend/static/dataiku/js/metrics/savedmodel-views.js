(function() {
'use strict';

var app = angular.module('dataiku.metrics.savedmodels.views', ['dataiku.metrics.views']);


app.controller("SavedModelStatusPageController", function($scope, DataikuAPI, $stateParams, TopNav, $filter){
    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_SAVED_MODEL, TopNav.TABS_SAVED_MODEL, "status");
    DataikuAPI.savedmodels.get($stateParams.projectKey, $stateParams.smId).success(function(data) {
        $scope.savedModel = data;
        TopNav.setItem(TopNav.ITEM_SAVED_MODEL, $stateParams.smId, {name: data.name, taskType: (data.miniTask || {}).taskType});

        if ($scope.savedModel.miniTask.taskType == "PREDICTION") {
            DataikuAPI.savedmodels.prediction.getStatus($stateParams.projectKey, $stateParams.smId).success(function(data){
                $scope.smStatus = data;
            }).error(setErrorInScope.bind($scope));
        } else if ($scope.savedModel.miniTask.taskType == "CLUSTERING"){
            DataikuAPI.savedmodels.clustering.getStatus($stateParams.projectKey, $stateParams.smId).success(function(data){
                $scope.smStatus = data;
            }).error(setErrorInScope.bind($scope));
        } else {
            throw new Exception("Not implemented");
        }

    }).error(setErrorInScope.bind($scope));

    $scope.getDisplayNameForVersion = function(versionId) {
        if ( !versionId || !$scope.smStatus ) return versionId;
        var version = null;
        $scope.smStatus.versions.forEach(function(v) {
            if ( v.versionId == versionId ) {
                version = v;
            }
        });
        if ( version == null || version.snippet == null || version.snippet.trainInfo == null ) {
            return versionId;
        }
        return $filter('date')(version.snippet.trainInfo.startTime, 'yyyy-MM-dd – HH:mm:ss');
    };
});

app.controller("SaveModelMetricsViewController", function($scope, Debounce, FutureProgressModal, MetricsUtils, $filter, Fn, DataikuAPI, $stateParams) {
    $scope.views = {
        selected : 'versionsTable'
    };

    var savedSettings;

    $scope.displayedMetrics = {metrics : [], $loaded : false};
    // function is not there when the page is loaded the first time, but is there when tabs change
    if ( $scope.refreshAllComputedMetrics ) $scope.refreshAllComputedMetrics();

    $scope.$watch("allComputedMetrics", function(nv, ov){
        $scope.allPartitions = [];

        var set = {}
        if (nv) {

            nv.metrics.forEach(function(metric) {
                metric.partitionsWithValue.forEach(function(p) {
                    set[p] = 1
                })
            });
        }
        $scope.allPartitions = Object.keys(set);

        filterMetricsPartitions();
        $scope.refreshDisplayedMetrics();
    }, true);

    $scope.uiState = {listMode : 'banner', partitionQuery : ''};
    $scope.displayedMetricByPartitionData = [];

    $scope.orderByFunc = function(metricIdx) {
        if (metricIdx === '__partition__') return Fn.SELF;

        return function(partitionId) {
            return MetricsUtils.getFormattedValueForPartition($scope.displayedMetrics.metrics[metricIdx], partitionId, $scope.displayedMetricByPartitionData);
        }
    };

    $scope.getDisplayedPartitionsData = function(displayedMetric) {
        var metricId = displayedMetric.metric.id;
        var found = null;
        $scope.displayedMetricByPartitionData.forEach(function(displayedMetricPartition) {
            if ( displayedMetricPartition.metricId == metricId ) {
                found = displayedMetricPartition;
            }
        });
        return found;
    };

    // TODO code duplication
    $scope.refreshDisplayedMetrics = function() {
        if ( $scope.metrics == null || $scope.allComputedMetrics == null || $scope.metrics.displayedState == null) return;

        // get the ones for the selected element, either partition or full dataset
        var partitionId = $scope.metricsCallbacks.getSelectedMetricsPartitionId();
        if ( !$scope.displayedMetrics.$loaded && $scope.allComputedMetrics.metrics.length > 0 ) {
            // select back the metrics as the persisted state says
            $scope.displayedMetrics.metrics = $scope.allComputedMetrics.metrics.filter(function(metric) {return metric.displayedAsMetric;});
            // re-order according to $scope.metrics.displayedState.metrics
            $scope.displayedMetrics.metrics.forEach(function(displayedMetric) {
                var i = $scope.metrics.displayedState.metrics.indexOf(displayedMetric.metric.id);
                if ( i < 0 ) {
                    i = $scope.metrics.displayedState.metrics.length;
                }
                displayedMetric.$indexInDisplayedState = i;
            });
            $scope.displayedMetrics.metrics.sort(function(a, b) {return a.$indexInDisplayedState - b.$indexInDisplayedState;});
            $scope.displayedMetrics.$loaded = true;
            refreshDisplayedPartitionData();
        }
    };

    var refreshDisplayedList = function() {
        if ( $scope.displayedMetrics == null || $scope.metrics.displayedState == null) return;
        $scope.metrics.displayedState.metrics = $scope.displayedMetrics.metrics.map(function(metric) {return metric.metric.id;});
        // don't forget to tweak the allComputedMetrics for when we switch tabs and reload the displayedMetrics list
        $scope.allComputedMetrics.metrics.forEach(function(metric) {metric.displayedAsMetric = $scope.displayedMetrics.metrics.indexOf(metric) >= 0;});
    };

       $scope.$watch('displayedMetrics', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedList();
                refreshDisplayedPartitionData();
            }, true);

    var refreshDisplayedPartitionData = function() {
        if ( $scope.displayedMetrics == null || !$scope.displayedMetrics.$loaded || $scope.metrics == null || $scope.metrics.displayedState == null ) {
            return;
        }
        // fetch the data
        $scope.metricsCallbacks.getPreparedMetricPartitions($scope.metrics.displayedState).success(function(data) {
            $scope.displayedMetricByPartitionData = data.metrics;
            //refreshPartitionsRange();
        }).error(setErrorInScope.bind($scope));
    };
    refreshDisplayedPartitionData();

    var refreshPartitionsRange = function() {
        if ($scope.metricsPartitions && $scope.metricsPartitions.isTimePartition) {
            var extents = $scope.displayedMetricByPartitionData.map(function(d) {
                return d3.extent(d.values, Fn.prop('partitionTime'));
            });
            $scope.displayedPartitionsRange = {from: d3.min(extents, Fn.prop(0)), to: d3.max(extents, Fn.prop(1))};
            $scope.selectedRange = {from: $scope.displayedPartitionsRange.from, to: $scope.displayedPartitionsRange.to};
            filterMetricsPartitions();
        }
    };

    var filterMetricsPartitions = function() {
        if (!$scope.allPartitions) $scope.filteredPartitions = [];
        $scope.filteredPartitions = $filter('filter')($scope.allPartitions, $scope.uiState.partitionQuery);
    };

});

})();