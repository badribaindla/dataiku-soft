(function() {
'use strict';

var app = angular.module('dataiku.metrics.views', ['dataiku.metrics.core']);


app.controller("MetricsViewController", function($scope) {

    if ($scope.metricsCallbacks.isPartitioned()) {
        $scope.views = {
                values: [{name:'Partitions table', id:'Table'}, {name:'Partitions histories', id:'Partitions'}, {name:'Last value', id:'Last value'}, {name:'History', id:'History'}],
                selected: 'Table'
            };
    } else {
        $scope.views = {
                values: [{name:'Last value', id:'Last value'}, {name:'History', id:'History'}],
                selected: 'Last value'
            };
    }
    if ($scope.metricsCallbacks.hasColumnsView()) {
        $scope.views.values.push({name:'Columns', id:'Columns'});
    }

    $scope.displayedMetrics = {metrics : [], $loaded : false};
    // function is not there when the page is loaded the first time, but is there when tabs change
    if ( $scope.refreshAllComputedMetrics ) $scope.refreshAllComputedMetrics();
});

app.controller("ChecksViewController", function($scope) {
    $scope.displayedChecks = {checks : [], $loaded : false};
    // function is not there when the page is loaded the first time, but is there when tabs change
    if ( $scope.refreshAllComputedChecks ) $scope.refreshAllComputedChecks();
});

/**
 * @ngdoc directive
 * @name selectDisplayedMetrics
 * @description
 *   Directive for the selector of metrics / checks to display
 */
app.directive('displayedMetricsSelector', function(DataikuAPI, $stateParams, CreateModalFromTemplate, $timeout, $q, MetricsUtils, WT1, $filter) {
    return {
        scope : {
            choices : '=',
            selected : '=',
            refreshChoices : '=',
            onClose : '=',
            type : '@'      // either 'checks' or 'metrics'
        },
        restrict : 'A',
        replace : true,
        templateUrl : "/templates/metrics/displayed-metrics-selector.html",
        link : function($scope, $element, attrs) {
            $scope.MetricsUtils = MetricsUtils;

            $scope.openDisplayedMetricsModal = function() {
                CreateModalFromTemplate("/templates/metrics/displayed-metrics-modal.html", $scope, null, function(newScope) {
                    newScope.displayed = {items: $scope.selected[$scope.type].concat()};
                    newScope.choicesLeft = {items:[]};
                    newScope.filter = { query: ""};

                    var refreshChoicesLeft = function() {
                        newScope.choicesLeft.items.splice(0, newScope.choicesLeft.items.length);
                        $scope.choices[$scope.type].forEach(function(item) {
                            if (newScope.displayed.items.indexOf(item) < 0) {
                                newScope.choicesLeft.items.push(item);
                            }
                        });
                    };
                    refreshChoicesLeft();

                    newScope.addAll = function() {
                        var toAdd = $filter('filter')(newScope.choicesLeft.items, newScope.filter.query);
                        toAdd.forEach(function(added) {
                            var i = newScope.choicesLeft.items.indexOf(added);
                            if (i >= 0) {
                                newScope.choicesLeft.items.splice(i, 1);
                            }
                        });
                        newScope.displayed.items = newScope.displayed.items.concat(toAdd);
                    };

                    newScope.removeAll = function() {
                        newScope.displayed.items = [];
                        newScope.choicesLeft.items = $scope.choices[$scope.type].concat();
                    };

                    newScope.remove = function(item) {
                        var index = newScope.displayed.items.indexOf(item);
                        if ( index >= 0 ) {
                            newScope.displayed.items.splice(index, 1);
                            refreshChoicesLeft();
                        }
                    };

                    newScope.add = function(item) {
                        newScope.displayed.items.push(item);
                        refreshChoicesLeft();
                    };

                    $scope.$watch('choices', function(nv) {
                        if ( nv == null ) return;
                        // the list of items (metrics/checks) was refreshed
                        var newDisplayed = {items:[]};
                        newScope.displayed.items.forEach(function(item) {
                            var found = null;
                            $scope.choices[$scope.type].forEach(function(newItem) {
                                if ($scope.type == 'metrics' && item.metric.id == newItem.metric.id
                                    || $scope.type == 'checks' && item.name == newItem.name) {
                                    found = newItem;
                                }
                            });
                            if ( found != null ) {
                                newDisplayed.items.push(found);
                            }
                        });
                        newScope.displayed.items = newDisplayed.items;
                        refreshChoicesLeft();
                    }, true);

                }).then(function(newDisplayedItems) {
                    WT1.event($scope.type + "-selector-save");
                    $scope.selected[$scope.type] = newDisplayedItems;
                    if (angular.isFunction($scope.onClose)) $timeout($scope.onClose);
                });
            };

            $scope.$parent.openDisplayedMetricsModal = $scope.openDisplayedMetricsModal;
        }
    };
});

/**
 * @ngdoc directive
 * @name selectDisplayedMetrics
 * @description
 *   Directive for the selector of metrics / checks to display
 */
app.directive('displayedColumnsSelector', function(DataikuAPI, $stateParams, CreateModalFromTemplate, $timeout, $q, MetricsUtils, WT1, $filter) {
    return {
        scope : {
            datasetSchema : '=',
            selected : '=',
            refreshChoices : '=',
            onClose : '='
        },
        restrict : 'A',
        replace : true,
        templateUrl : "/templates/metrics/displayed-columns-selector.html",
        link : function($scope, $element, attrs) {
            $scope.MetricsUtils = MetricsUtils;

            $scope.openDisplayedMetricsModal = function() {
                CreateModalFromTemplate("/templates/metrics/displayed-columns-modal.html", $scope, null, function(newScope) {
                    $scope.choices = $scope.datasetSchema.columns.map(function(c) {return c.name;});
                    newScope.displayed = {items: ($scope.selected || []).concat()};
                    newScope.choicesLeft = {items:[]};
                    newScope.filter = { query: ""};

                    var refreshChoicesLeft = function() {
                        newScope.choicesLeft.items.splice(0, newScope.choicesLeft.items.length);
                        $scope.choices.forEach(function(item) {
                            if (newScope.displayed.items.indexOf(item) < 0) {
                                newScope.choicesLeft.items.push(item);
                            }
                        });
                    };
                    refreshChoicesLeft();

                    newScope.addAll = function() {
                        var toAdd = $filter('filter')(newScope.choicesLeft.items, newScope.filter.query);
                        toAdd.forEach(function(added) {
                            var i = newScope.choicesLeft.items.indexOf(added);
                            if (i >= 0) {
                                newScope.choicesLeft.items.splice(i, 1);
                            }
                        });
                        newScope.displayed.items = newScope.displayed.items.concat(toAdd);
                    };

                    newScope.removeAll = function() {
                        newScope.displayed.items = [];
                        newScope.choicesLeft.items = $scope.choices.concat();
                    };

                    newScope.remove = function(item) {
                        var index = newScope.displayed.items.indexOf(item);
                        if ( index >= 0 ) {
                            newScope.displayed.items.splice(index, 1);
                            refreshChoicesLeft();
                        }
                    };

                    newScope.add = function(item) {
                        newScope.displayed.items.push(item);
                        refreshChoicesLeft();
                    };

                    $scope.$watch('choices', function(nv) {
                        if ( nv == null ) return;
                        // the list of items (metrics/checks) was refreshed
                        var newDisplayed = {items:[]};
                        newScope.displayed.items.forEach(function(item) {
                            var found = null;
                            $scope.choices.forEach(function(newItem) {
                                if (item == newItem) {
                                    found = newItem;
                                }
                            });
                            if ( found != null ) {
                                newDisplayed.items.push(found);
                            }
                        });
                        newScope.displayed.items = newDisplayed.items;
                        refreshChoicesLeft();
                    }, true);

                }).then(function(newDisplayedItems) {
                    WT1.event("columns" + "-selector-save");
                    $scope.selected = newDisplayedItems;
                    if (angular.isFunction($scope.onClose)) $timeout($scope.onClose);
                });
            };

            $scope.$parent.openDisplayedMetricsModal = $scope.openDisplayedMetricsModal;
        }
    };
});

/**
 * @ngdoc directive
 * @name displayMetricsHistory
 * @description
 *   Directive for the pane showing the metrics' histories
 */
app.directive('displayMetrics', function(DataikuAPI, $stateParams, CreateModalFromTemplate, $timeout, $q, MetricsUtils, WT1, ActivityIndicator) {
    return {
        scope : true,
        restrict : 'A',
        templateUrl : "/templates/metrics/display-metrics.html",
        link : function($scope, $element, attrs) {
            $scope.uiState = {listMode : 'tile'};
            $scope.metricsScope = attrs.metricsScope;
            $scope.displayedMetricByTimeData = [];
            $scope.canCompute = $scope.$eval(attrs.canCompute); // if false, no 'compute' button, and only building the object can compute metrics (ie: saved models)

            $scope.$watch('metrics', function(nv, ov) {
                if ( $scope.metrics == null ) return;
                init();
            }, false);

            var init = function() {
                $scope.refreshDisplayedMetrics();
                refreshDisplayedMetricData();
            };

            $scope.refreshDisplayedMetrics = function() {
                if ( $scope.metrics == null || $scope.allComputedMetrics == null || $scope.metrics.displayedState == null) return;

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
                }
            };

            var refreshDisplayedList = function() {
                if ( $scope.displayedMetrics == null || $scope.metrics.displayedState == null) return;

                $scope.metrics.displayedState.metrics = $scope.displayedMetrics.metrics.map(function(metric) {return metric.metric.id;});
                // don't forget to tweak the allComputedMetrics for when we switch tabs and reload the displayedMetrics list
                $scope.allComputedMetrics.metrics.forEach(function(metric) {metric.displayedAsMetric = $scope.displayedMetrics.metrics.indexOf(metric) >= 0;});
            };
            var refreshDisplayedMetricData = function() {
                if ( $scope.displayedMetrics == null || !$scope.displayedMetrics.$loaded || $scope.metrics == null || $scope.metrics.displayedState == null) return;

                // fetch the data
                $scope.metricsCallbacks.getPreparedMetricHistories($scope.metrics.displayedState).success(function(data) {
                    $scope.displayedMetricByTimeData = data.histories.map(function(displayedData) {return MetricsUtils.fixupDisplayType(displayedData);});
                    $scope.displayedMetricByTimeData.forEach(function(displayedMetric) {
                        if (displayedMetric.metric.type === "adv_col_stats") {
                            // Limit the displayed top value to 10, only configurable for the column analysis dialog
                            displayedMetric.values.forEach(function(metric){
                                metric.value = metric.value.slice(0,10);
                            });
                            displayedMetric.lastValue.value = displayedMetric.lastValue.value.slice(0,10);
                        }
                    });
                    if ( data.from > 0 ) {
                        $scope.displayedMetricsRange = MetricsUtils.fixUpRange({from: data.from, to: data.to});
                        $scope.selectedRange = angular.copy($scope.displayedMetricsRange);
                    } else {
                        $scope.displayedMetricsRange = null; // empty range
                        $scope.selectedRange = null;
                    }
                }).error(setErrorInScope.bind($scope));
            };

            $scope.$on('metrics-refresh-displayed-data', refreshDisplayedMetricData);

            $scope.brushChanged = function() {
                $scope.$digest();
            };

            $scope.$watch('displayedMetrics', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedList();
                refreshDisplayedMetricData();
            }, true);

            $scope.$watch('metrics.displayedState.partition', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedMetricData();
            }, false);

            $scope.$watch('allComputedMetrics', function(nv, ov) {
                if ( nv == ov ) return;
                $scope.refreshDisplayedMetrics();
            }, true);

            $scope.getDisplayedData = function(displayedMetric) {
                if ( displayedMetric == null || displayedMetric.metric == null ) return null;
                var metricId = displayedMetric.metric.id;
                var found = null;
                $scope.displayedMetricByTimeData.forEach(function(displayedMetricHistory) {
                    if ( displayedMetricHistory.metricId == metricId ) {
                        found = displayedMetricHistory;
                    }
                });
                return found;
            };

            if ($scope.metricsCallbacks.canComputeMetrics()) {
                $scope.computeNow = function() {
                    WT1.event("metrics-compute-now");
                    $scope.saveMetricsNow().then(function() {
                        var partitionId = $scope.metricsCallbacks.getSelectedMetricsPartitionId();
                        var modalTitle = "Computing all metrics" + (partitionId == null ? "" : " for partition " + partitionId) + "…";
                        $scope.metricsCallbacks.computeMetrics(partitionId)
                            .success(MetricsUtils.computeProgressModal($scope, modalTitle))
                            .error(setErrorInScope.bind($scope));
                    });
                };

                $scope.computeAll = function() {
                    WT1.event("metrics-compute-all");
                    $scope.saveMetricsNow().then(function() {
                        $scope.metricsCallbacks.computeMetricsAll()
                            .success(MetricsUtils.computeProgressModal($scope, "Computing all metrics…"))
                            .error(setErrorInScope.bind($scope));
                    });
                };

                $scope.computeAllForPartition = function(partitionId) {
                    var modalTitle = "Computing all metrics" + (partitionId == null ? "" : " for partition " + partitionId) + "…";

                    $scope.metricsCallbacks.computeMetrics(partitionId)
                        .success(MetricsUtils.computeProgressModal($scope, modalTitle))
                        .error(setErrorInScope.bind($scope));
                };

                if ($scope.metricsCallbacks.isPartitioned()) {
                    $scope.computeMetricForSelected = function(displayedMetric) {
                        var probes = $scope.metrics.probes.filter(function(probe){return probe.type == displayedMetric.computingProbe;});
                        if ( probes.length == 1 ) {
                            var metrics = angular.copy($scope.metrics);
                            metrics.probes = probes;
                            var partitionId = $scope.metricsCallbacks.getSelectedMetricsPartitionId();
                            $scope.metricsCallbacks.computeProbe(partitionId, false, metrics)
                            .success(MetricsUtils.computeProgressModal($scope, "Computing metric on " + partitionId, true))
                            .error(setErrorInScope.bind($scope));
                        }
                    };
                } else {
                    $scope.computeMetricForObject = function(displayedMetric) {
                        var probes = $scope.metrics.probes.filter(function(probe){return probe.type == displayedMetric.computingProbe;});
                        if ( probes.length == 1 ) {
                            var metrics = angular.copy($scope.metrics);
                            metrics.probes = probes;
                            var partitionId = $scope.metricsCallbacks.getSelectedMetricsPartitionId();
                            $scope.metricsCallbacks.computeProbe('NP', false, metrics)
                            .success(MetricsUtils.computeProgressModal($scope, "Computing metric", true))
                            .error(setErrorInScope.bind($scope));
                        }
                    };
                }
            } else {
                $scope.computeNow = null;
                $scope.computeAll = null;
                $scope.computeAllForPartition = null;
                $scope.computeMetricForSelected = null;
                $scope.computeMetricForObject = null;
            }

            $scope.createAndPinInsight = function(displayedMetric) {
                var insight = {
                    projectKey: $stateParams.projectKey,
                    type: 'metrics',
                    params: {
                        objectType: $scope.metricsCallbacks.getObjectType(),
                        objectSmartId: $scope.metricsCallbacks.getObjectSmartId(),
                        metricId: displayedMetric.metric.id
                    },
                    name: displayedMetric.meta.name + " of " + (displayedMetric.metric.column ? (displayedMetric.metric.column + " on ") : "") + $scope.metricsCallbacks.getObjectName()
                };
                CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $scope, "CreateAndPinInsightModalController", function(newScope) {
                    newScope.init(insight);
                });
            };

            $scope.openMetricChartModal = function(displayedMetric) {
                WT1.event("metrics-open-metric-modal");
                CreateModalFromTemplate("/templates/metrics/metric-chart-modal.html", $scope, null, function(newScope) {
                        newScope.displayedMetric = displayedMetric;
                });
            };

            $scope.addAllMetricsDatasetInFlow = function(view, partition, filter) {
                WT1.event("metrics-add-dataset-in-flow", {all:true});
                $scope.metricsCallbacks.createMetricsDataset(view, partition, filter).success(function(data) {
                    ActivityIndicator.success("Metrics dataset created");
                    var i = $scope.allComputedMetrics.notExistingViews.indexOf(view);
                    if (i >= 0) {
                        $scope.allComputedMetrics.notExistingViews.splice(i, 1);
                    }
                }).error(setErrorInScope.bind($scope));
            };
            $scope.addOneMetricDatasetInFlow = function(computedMetric, view, partition, filter) {
                WT1.event("metrics-add-dataset-in-flow", {all:false});
                $scope.metricsCallbacks.createMetricsDataset(view, partition, filter).success(function(data) {
                    ActivityIndicator.success("Metrics dataset created");
                    var i = computedMetric.notExistingViews.indexOf(view);
                    if (i >= 0) {
                        computedMetric.notExistingViews.splice(i, 1);
                    }
                }).error(setErrorInScope.bind($scope));
            };
            $scope.clearAll  = function() {
                WT1.event("metrics-clear");
                $scope.metricsCallbacks.clearMetrics().success(function(data) {
                    ActivityIndicator.success("Metrics cleared");
                    $scope.$emit('metrics-refresh-displayed-data');
                }).error(setErrorInScope.bind($scope));
            };

            $scope.addMetricValue = function() {
                CreateModalFromTemplate("/templates/metrics/add-metric-value-modal.html", $scope, null, function(newScope) {
                    newScope.newMetric = {};
                    newScope.addMetricPoint = function(newMetric) {
                        var metricsData = {};
                        if (!isNaN(newMetric.value)) {
                            newMetric.value = parseFloat(newMetric.value);
                        } else if (moment(newMetric.value).isValid()) {
                            newMetric.value = moment(newMetric.value).toISOString();
                        }
                        metricsData[newMetric.name] = newMetric.value;
                        $scope.metricsCallbacks.saveExternalMetricsValues(metricsData, {}).success(function(data) {
                            WT1.event("metrics-metric-inserted", {objectType:$scope.metricsCallbacks.getObjectType()});
                            $scope.refreshAllComputedMetrics();
                            newScope.dismiss();
                        }).error(setErrorInScope.bind(newScope));
                    };
                });
            };
        }
    };
});


/**
 * @ngdoc directive
 * @name displayChecksHistory
 * @description
 *   Directive for the pane showing the checks' histories
 */
app.directive('displayChecks', function(DataikuAPI, $stateParams, CreateModalFromTemplate, $timeout, $filter, $q, MetricsUtils, ExportUtils, WT1, FutureProgressModal, ActivityIndicator) {
    return {
        scope : true,
        restrict : 'A',
        templateUrl : "/templates/metrics/display-checks.html",
        link : function($scope, $element, attrs) {
            $scope.uiState = {
                values: {'banner':'List', 'list':'Table'},
                listMode: 'banner'
            };
            $scope.metricsScope = attrs.metricsScope;
            $scope.displayedChecksHistories = [];
            $scope.canCompute = $scope.$eval(attrs.canCompute); // if false, no 'compute' button, and only building the object can compute checks (ie: saved models)

            $scope.$watch('metricsChecks', function(nv, ov) {
                if ( $scope.metricsChecks == null ) return;
                init();
            }, false);

            var init = function() {
                $scope.refreshDisplayedChecks();
                refreshDisplayedCheckData();
            };

            $scope.refreshDisplayedChecks = function() {
                if ( $scope.metricsChecks == null || $scope.allComputedChecks == null ) return;

                if ( !$scope.displayedChecks.$loaded && $scope.allComputedChecks.checks.length > 0 ) {
                    // select back the checks as the persisted state says
                    $scope.displayedChecks.checks = $scope.allComputedChecks.checks.filter(function(check) {return check.displayedAsCheck;});
                    $scope.displayedChecks.$loaded = true;
                }
            };

            var refreshDisplayedList = function() {
                if ( $scope.displayedChecks == null || $scope.metricsChecks.displayedState == null) return;
                $scope.metricsChecks.displayedState.checks = $scope.displayedChecks.checks.map(function(check) {return check.name;});
                // don't forget to tweak the allComputedMetrics for when we switch tabs and reload the displayedMetrics list
                $scope.allComputedChecks.checks.forEach(function(check) {check.displayedAsCheck = $scope.displayedChecks.checks.indexOf(check) >= 0;});
            };
            var refreshDisplayedCheckData = function() {
                if ( $scope.displayedChecks == null || !$scope.displayedChecks.$loaded || $scope.metricsChecks == null || $scope.metricsChecks.displayedState == null ) return;
                // fetch the data
                $scope.metricsCallbacks.getCheckHistories($scope.metricsChecks.displayedState).success(function(data) {
                    $scope.displayedChecksHistories = data.histories;
                    if ( data.from > 0 ) {
                        $scope.displayedChecksRange = {from: data.from, to: data.to};
                        $scope.selectedRange = {from: data.from, to: data.to};
                    } else {
                        $scope.displayedChecksRange = null; // empty range
                        $scope.selectedRange = null;
                    }
                }).error(setErrorInScope.bind($scope));
            };

            $scope.brushChanged = function() {
                $scope.$digest();
            };

            $scope.$watch('displayedChecks', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedList();
                refreshDisplayedCheckData();
            }, true);

            $scope.$watch('metricsChecks.displayedState.partition', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedCheckData();
            }, false);

            $scope.$watch('allComputedChecks', function(nv, ov) {
                if ( nv == ov ) return;
                $scope.refreshDisplayedChecks();
            }, true);

            $scope.getDisplayedData = function(displayedCheck) {
                if ( displayedCheck == null ) return null;
                var checkName = displayedCheck.name;
                var found = null;
                $scope.displayedChecksHistories.forEach(function(displayedCheckHistory) {
                    if ( displayedCheckHistory.name == checkName ) {
                        found = displayedCheckHistory;
                    }
                });
                return found;
            };

            var getNiceMetricName = function(metricId) {
                var found = metricId;
                $scope.allComputedMetrics.metrics.forEach(function(computedMetric) {
                   if ( metricId == computedMetric.metric.id ) {
                       found = MetricsUtils.getMetricDisplayName(computedMetric);
                   }
                });
                return found;
            };
            $scope.getNiceInfo = function(check) {
                if ( check.type == 'python') {
                    return "Custom check (Python)";
                } else if ( check.type == 'numericRange') {
                    var metricName = getNiceMetricName(check.metricId);
                    var strictRangeCheck = null;
                    if (check.minimumEnabled && check.maximumEnabled) {
                        strictRangeCheck = " is between " + check.minimum + " and " + check.maximum;
                    } else if (check.minimumEnabled) {
                        strictRangeCheck = " is above " + check.minimum;
                    } else if (check.maximumEnabled) {
                        strictRangeCheck = " is below " + check.maximum;
                    }
                    var softRangeCheck = null;
                    if (check.softMinimumEnabled && check.softMaximumEnabled) {
                        softRangeCheck = " is outside " + check.softMinimum + " and " + check.softMaximum;
                    } else if (check.softMinimumEnabled) {
                        softRangeCheck = " is below " + check.softMinimum;
                    } else if (check.softMaximumEnabled) {
                        softRangeCheck = " is above " + check.softMaximum;
                    }
                    if ( strictRangeCheck && softRangeCheck ) {
                        return "Check that " + metricName + strictRangeCheck + ", warn if " + metricName + softRangeCheck;
                    } else if ( strictRangeCheck ) {
                        return "Check that " + metricName + strictRangeCheck;
                    } else if ( softRangeCheck ) {
                        return "Warn if " + metricName + softRangeCheck;
                    } else {
                        return "Empty check on " + metricName;
                    }
                } else if ( check.type == 'valueSet') {
                    var metricName = getNiceMetricName(check.metricId);
                    var info = "Check that " + metricName + "is among " + check.values.length + " values";
                    return info;
                }
            };

            $scope.lastComputeResult = null;
            function setLastComputeResult(result) {
                $scope.lastComputeResult = result;
                if (result) {
                    $scope.hasErrors = result.runs && result.runs.some(_ => _.error);
                    refreshDisplayedCheckData();
                }
            }

            if ($scope.metricsCallbacks.canRunChecks()) {
                $scope.computeNow = function() {
                    WT1.event("checks-compute-now");
                    $scope.saveMetricsNow().then(function() {
                        var partitionId = $scope.metricsCallbacks.getSelectedChecksPartitionId();
                        $scope.metricsCallbacks.runChecks(partitionId).success(function(data) {
                            FutureProgressModal.show($scope, data, "Computing checks…").then(setLastComputeResult);
                        }).error(setErrorInScope.bind($scope));
                    });
                };
                $scope.computeAll = function() {
                    WT1.event("checks-compute-all");
                    $scope.saveMetricsNow().then(function() {
                        $scope.metricsCallbacks.runChecksAll()
                        .success(MetricsUtils.computeProgressModal($scope, "Computing all checks…"))
                        .error(setErrorInScope.bind($scope));
                    });
                };
            } else {
                $scope.computeNow = null;
                $scope.computeAll = null;
            }

            $scope.checkIfStillComputing = function() {
                DataikuAPI.futures.getUpdate($scope.computing.jobId).success(function(data) {
                    setComputing(data);
                }).error(function (a,b,c) {
                    setComputing(null);
                    setErrorInScope.bind($scope)(a,b,c);
                });
            };

            $scope.addAllChecksDatasetInFlow = function(view, partition, filter) {
                WT1.event("checks-add-dataset-in-flow", {all:true});
                $scope.metricsCallbacks.createMetricsDataset(view, partition, filter).success(function(data) {
                    ActivityIndicator.success("Checks dataset created");
                    var i = $scope.allComputedChecks.notExistingViews.indexOf(view);
                    if (i >= 0) {
                        $scope.allComputedChecks.notExistingViews.splice(i, 1);
                    }
                }).error(setErrorInScope.bind($scope));
            };
            $scope.addOneCheckDatasetInFlow = function(computedCheck, view, partition, filter) {
                WT1.event("checks-add-dataset-in-flow", {all:false});
                $scope.metricsCallbacks.createMetricsDataset(view, partition, filter).success(function(data) {
                    ActivityIndicator.success("Checks dataset created");
                    var i = computedCheck.notExistingViews.indexOf(view);
                    if (i >= 0) {
                        computedCheck.notExistingViews.splice(i, 1);
                    }
                }).error(setErrorInScope.bind($scope));
            };

            $scope.addCheckValue = function() {
                CreateModalFromTemplate("/templates/metrics/add-check-value-modal.html", $scope, null, function(newScope) {
                    newScope.newCheck = {};
                    newScope.addCheckPoint = function(newCheck) {
                        var checksData = {};
                        if (newCheck.message && newCheck.message.length > 0) {
                            checksData[newCheck.name] = [newCheck.value, newCheck.message];
                        } else {
                            checksData[newCheck.name] = newCheck.value;
                        }
                        $scope.metricsCallbacks.saveExternalChecksValues(checksData).success(function(data) {
                            WT1.event("metrics-check-inserted", {objectType:$scope.metricsCallbacks.getObjectType()});
                            $scope.refreshAllComputedChecks();
                            newScope.dismiss();
                        }).error(setErrorInScope.bind(newScope));
                    };
                });
            };

            $scope.exportTable = function(){
                var exportColumns = [{"name":"Checks","type":"string"},
                                     {"name":"Infos","type":"string"},
                                     {"name":"Runs","type":"string"},
                                     {"name":"Last","type":"string"},
                                     {"name":"Message","type":"string"},
                                     {"name":"Status","type":"string"}];
                var exportRows = $scope.displayedChecksHistories.map(function(r) {
                    return [r.name,
                            $scope.getNiceInfo(r.check),
                            r.values.length,
                            $filter('date')(r.lastValue.time, 'yyyy-MM-dd HH:mm'),
                            r.lastValue.message,
                            r.lastValue.outcome];
                });
                ExportUtils.exportUIData($scope, {
                    name : "Checks",
                    columns : exportColumns,
                    data : exportRows
                }, "Export checks");
            };

        }
    };
});

/**
 * @ngdoc directive
 * @name splitWidth
 * @description
 *   Directive to apply on a table or parent of a table to get a cellWidth property in some uiState field in the scope,
 *   that can then be bound to width in a style attribute. It evenly splits the table's width and then applies a min-width.
 *   That's all because min-width on th/td has an undefined behavior...
 */
app.directive('splitWidth', function($rootScope, $timeout) {
    return {
        restrict : 'A',
        scope : {
            columnCount : '=',
            minWidth : '=',
            uiState : '=dkuUiState'
        },
        link : function($scope, element, attrs) {

            var refreshWidth = function() {
                var width = $(element).innerWidth();
                if ( $scope.columnCount ) {
                    var cellWidth = (width - 18) / $scope.columnCount;
                    if ( $scope.minWidth ) {
                        cellWidth = Math.max(cellWidth, $scope.minWidth);
                    }
                    $scope.uiState.cellWidth = cellWidth;
                    // reuse the same array as much as possible, otherwise the other directives bound to it might execute before the value is flushed in the parent context
                    $scope.uiState.cellsWidth = $scope.uiState.cellsWidth || [];
                    $scope.uiState.cellsWidth.splice(0,$scope.uiState.cellsWidth.length)
                    var remainder = 0;
                    for (var i=0;i<$scope.columnCount;i++) {
                        var cellWidthNext = cellWidth + remainder;
                        var cellWidthInt = Math.floor(cellWidthNext);
                        remainder = cellWidthNext - cellWidthInt;
                        $scope.uiState.cellsWidth.push(cellWidthInt);
                    }
                    element.offsetHeight; // cheat to force a refresh of the table layout. sometimes. (how is that working??!!??)
                    $rootScope.$broadcast('reflow');
                }
            };
            $timeout(refreshWidth);

            // update cell width whenever needed
            var eventName = 'resize.table.' + $scope.$id;
            $(window).on(eventName, function() { refreshWidth();});
            $scope.$on('$destroy', function(){$(window).off(eventName)});

            $scope.$watch('columnCount', refreshWidth);
            $scope.$watch('minWidth', refreshWidth);
        }
    };
});

app.directive('displayMetricsPerPartition', function(DataikuAPI, $stateParams, CreateModalFromTemplate, $timeout, $q, $filter, Debounce, Fn, FutureProgressModal, MetricsUtils, WT1, ActivityIndicator) {
    return {
        scope : true,
        restrict : 'A',
        templateUrl : "/templates/metrics/display-metrics-per-partition.html",
        link : function($scope, $element, attrs) {
            $scope.adjustForScroll = {};
            $scope.uiState = {listMode : 'banner', partitionQuery : null};
            $scope.displayedMetricByPartitionData = [];
            $scope.canCompute = $scope.$eval(attrs.canCompute); // if false, no 'compute' button, and only building the object can compute metrics (ie: saved models)

            $scope.$watch('metrics', function(nv, ov) {
                if ( $scope.metrics == null ) return;
                init();
            }, false);

            var init = function() {
                refreshDisplayedPartitionData();
            };

            $scope.exportPartitionsTable = function() {
                $scope.$broadcast('exportPartitionsTable');
            };

            $scope.partitionSearch = function(partition) {
                if ( !$scope.uiState.partitionQuery ) return true;
                if ( partition == null || partition.partition == null) return false;
                return partition.partition.toLowerCase().indexOf($scope.uiState.partitionQuery.toLowerCase()) >= 0;
            };

            if ($scope.metricsCallbacks.canComputeMetrics()) {
                $scope.computeNow = function() {
                    $scope.saveMetricsNow().then(function() {
                        $scope.computeAllForPartition($scope.metricsCallbacks.getSelectedMetricsPartitionId());
                    });
                };

                $scope.computeAll = function() {
                    $scope.saveMetricsNow().then(function() {
                        $scope.metricsCallbacks.computeMetricsAll()
                        .success(MetricsUtils.computeProgressModal($scope, "Computing all metrics"))
                        .error(setErrorInScope.bind($scope));
                    });
                };
                $scope.computeMetricForAll = function(displayedMetric) {
                    var probes = $scope.metrics.probes.filter(function(probe){return probe.type == displayedMetric.computingProbe;});
                    if ( probes.length == 1 ) {
                        var metrics = angular.copy($scope.metrics);
                        metrics.probes = probes;
                        $scope.metricsCallbacks.computeProbe('ALL', true, metrics)
                        .success(MetricsUtils.computeProgressModal($scope, "Computing metric"))
                        .error(setErrorInScope.bind($scope));
                    }
                };

                $scope.computeAllForPartition = function(partitionId) {
                    var modalTitle = "Computing all metrics" + (partitionId == null ? "" : " for partition " + partitionId) + "…";

                    $scope.metricsCallbacks.computeMetrics(partitionId)
                    .success(MetricsUtils.computeProgressModal($scope, modalTitle))
                    .error(setErrorInScope.bind($scope));
                };
            } else {
                $scope.computeNow = null;
                $scope.computeAll = null;
                $scope.computeMetricForAll = null;
                $scope.computeAllForPartition = null;
            }

            $scope.orderByFunc = function(metricIdx) {
                if (metricIdx === '__partition__') return Fn.SELF;

                return function(partitionId) {
                    return MetricsUtils.getFormattedValueForPartition($scope.displayedMetrics.metrics[metricIdx], partitionId, $scope.displayedMetricByPartitionData);
                }
            };

            $scope.getDisplayedPartitionsData = function(displayedMetric) {
                if ( displayedMetric == null || displayedMetric.metric == null ) return null;
                var metricId = displayedMetric.metric.id;
                var found = null;
                $scope.displayedMetricByPartitionData.forEach(function(displayedMetricPartition) {
                    if ( displayedMetricPartition.metricId == metricId ) {
                        found = displayedMetricPartition;
                    }
                });
                return found;
            };

            $scope.addAllMetricsDatasetInFlow = function(view, partition, filter) {
                WT1.event("metrics-add-dataset-in-flow", {all:true});
                $scope.metricsCallbacks.createMetricsDataset(view, partition, filter).success(function(data) {
                    ActivityIndicator.success("Metrics dataset created");
                    var i = $scope.allComputedMetrics.notExistingViews.indexOf(view);
                    if (i >= 0) {
                        $scope.allComputedMetrics.notExistingViews.splice(i, 1);
                    }
                }).error(setErrorInScope.bind($scope));
            };
            $scope.clearAll  = function() {
                WT1.event("metrics-clear");
                $scope.metricsCallbacks.clearMetrics().success(function(data) {
                    ActivityIndicator.success("Metrics cleared");
                    $scope.$emit('metrics-refresh-displayed-data');
                }).error(setErrorInScope.bind($scope));
            };

            var refreshDisplayedPartitionData = function() {
                if ( $scope.displayedMetrics == null || !$scope.displayedMetrics.$loaded || $scope.metrics == null || $scope.metrics.displayedState == null ) return;
                // fetch the data
                $scope.metricsCallbacks.getPreparedMetricPartitions($scope.metrics.displayedState).success(function(data) {
                    $scope.displayedMetricByPartitionData = data.metrics.map(function(displayedData) {return MetricsUtils.fixupDisplayType(displayedData);});
                    refreshPartitionsRange();
                }).error(setErrorInScope.bind($scope));
            };

            $scope.$on('metrics-refresh-displayed-data', refreshDisplayedPartitionData);

            var refreshPartitionsRange = function() {
                if ($scope.metricsPartitions && $scope.metricsPartitions.isTimePartition) {
                    $scope.displayedPartitionsRange = {from: d3.min($scope.metricsPartitions.partitions, Fn.prop('partitionTime')), to: d3.max($scope.metricsPartitions.partitions, Fn.prop('partitionTime'))};
                    // try to keep the range
                    if ( $scope.selectedRange == null || $scope.selectedRange.from < 0 || $scope.selectedRange.from > $scope.displayedPartitionsRange.to ) {
                        $scope.selectedRange = {from : $scope.displayedPartitionsRange.from, to : $scope.displayedPartitionsRange.to};
                    } else if ( $scope.selectedRange == null || $scope.selectedRange.to < 0 || $scope.selectedRange.to < $scope.displayedPartitionsRange.from ) {
                        $scope.selectedRange = {from : $scope.displayedPartitionsRange.from, to : $scope.displayedPartitionsRange.to};
                    } else {
                        $scope.selectedRange = {from : Math.max($scope.selectedRange.from, $scope.displayedPartitionsRange.from)
                                                , to : Math.min($scope.selectedRange.to, $scope.displayedPartitionsRange.to)};
                    }
                    filterMetricsPartitions();
                }
            };

            var filterMetricsPartitions = function() {
                if (!$scope.metricsPartitions) return $scope.filteredMetricsPartitions = [];

                if ($scope.metricsPartitions.isTimePartition) {
                    $scope.filteredMetricsPartitions = $scope.metricsPartitions.partitions.filter(function(p) {
                        if ( !$scope.selectedRange || !$scope.selectedRange.from || !$scope.selectedRange.to ) {
                            // no filtering
                            return true;
                        }
                        return p.partitionTime >= $scope.selectedRange.from && p.partitionTime <= $scope.selectedRange.to;
                    }).map(Fn.prop('partition'));
                } else {
                    if ($scope.uiState.partitionQuery) {
                        $scope.filteredMetricsPartitions = $filter('filter')($scope.metricsPartitionsIds, $scope.uiState.partitionQuery);
                    } else {
                        $scope.filteredMetricsPartitions = $scope.metricsPartitionsIds.concat([]);
                    }
                }
                // remove ALL from the list
                $scope.filteredMetricsPartitions = $scope.filteredMetricsPartitions.filter(function(p) {return p != 'ALL';});
            };

            $scope.brushChanged = function() {
                $scope.$digest();
                filterMetricsPartitions();
            };

            $scope.$watch("metricsPartitionsIds", filterMetricsPartitions, true);
            $scope.$watch("metricsPartitions.partitions",  filterMetricsPartitions, true);
            $scope.$watch("uiState.partitionQuery", Debounce().withDelay(400, 400).wrap(filterMetricsPartitions));

            $scope.$on('metrics-refresh-partition-list', function(e, result) {
                $scope.lastComputeResult = result;
                $scope.hasErrors = result.runs && result.runs.some(_ => _.error);
            });

            $scope.$watch('displayedMetrics', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedPartitionData();
            }, true);
            filterMetricsPartitions();
        }
    };
});

app.directive('partitionTableData', function(MetricsUtils, ExportUtils) {
    return {
        scope : false,
        restrict : 'A',
        link: function($scope, element, attrs) {
            $scope.displayedTableColumns = [];
            $scope.displayedTableRows = [];

            var refreshDisplayedColumns = function() {
                $scope.displayedTableColumns = [{isPartition:true, $sortIndex:-1}];
                if ($scope.displayedMetrics && $scope.displayedMetrics.metrics) {
                    $scope.displayedMetrics.metrics.forEach(function(displayedMetric, i) {
                        displayedMetric.$sortIndex = i;
                        $scope.displayedTableColumns.push(displayedMetric);
                    });
                }
                $scope.displayedTableColumns.push({isActions:true});
            };
            var refreshDisplayedRows = function() {
                var sortedPartitions = sortPartitionRows();
                // build rows for the fattable
                $scope.displayedTableRows = [];
                if (sortedPartitions) {
                    sortedPartitions.forEach(function(partition) {
                        var row = [{isPartition:true, partition:partition}];
                        if ($scope.displayedMetrics && $scope.displayedMetrics.metrics) {
                            $scope.displayedMetrics.metrics.forEach(function(displayedMetric) {
                                row.push({displayedMetric:displayedMetric, partition:partition});
                            });
                        }
                        row.push({isActions:true, partition:partition});
                        $scope.displayedTableRows.push(row);
                    });
                }
                {
                    var partition = 'ALL';
                    var row = [{isPartition:true, partition:partition}];
                    if ($scope.displayedMetrics && $scope.displayedMetrics.metrics) {
                        $scope.displayedMetrics.metrics.forEach(function(displayedMetric) {
                            row.push({displayedMetric:displayedMetric, partition:partition});
                        });
                    }
                    row.push({isActions:true, partition:partition});
                    $scope.displayedTableRows.push(row);
                }
            };
            var sortPartitionRows = function() {
                if ($scope.filteredMetricsPartitions && $scope.sortColumn) {
                    var sortedPartitions = $scope.filteredMetricsPartitions.concat();
                    if ($scope.sortColumn < 0) {
                        sortedPartitions.sort(function(a,b) {
                            var cmp = a.localeCompare(b);
                            return $scope.sortDescending ? -cmp : cmp;
                        });
                    } else {
                        var displayedMetric = $scope.displayedMetrics.metrics[$scope.sortColumn];
                        var values = sortedPartitions.map(function(partition) {
                            const value = MetricsUtils.getRawValueForPartition(displayedMetric, partition, $scope.displayedMetricByPartitionData);
                            return {partition, value};
                        });
                        values.sort(function(a,b) {
                            // send the null values to the bottom (regardless of descending or not)
                            if (a.value == null && b.value == null) return 0;
                            if (a.value == null && b.value != null) return 1;
                            if (a.value != null && b.value == null) return -1;
                            // then sort for real
                            var cmp = 0;
                            if ( angular.isNumber(a.value) && angular.isNumber(b.value)) {
                                cmp = a.value - b.value;
                            } else {
                                cmp = ('' + a.value).localeCompare('' + b.value);
                            }
                            return $scope.sortDescending ? -cmp : cmp;
                        });
                        sortedPartitions = values.map(function(value) {return value.partition;})
                    }
                    return sortedPartitions;
                } else {
                    return $scope.filteredMetricsPartitions.concat();
                }
            };

            $scope.$on('exportPartitionsTable', function() {
                $scope.exportTable();
            });
            $scope.exportTable = function(){
                var exportColumns = $scope.displayedTableColumns.map(function(c) {
                    if (c.isPartition) return {"name":"Partition","type":"string"};
                    if (c.isActions) return null;
                    return {"name":MetricsUtils.getMetricDisplayName(c),"type":"string"};
                }).filter(function(c) {return c != null;});
                var exportRows = $scope.displayedTableRows.map(function(r) {
                    return r.map(function(c) {
                        if (c.isPartition) return c.partition;
                        if (c.isActions) return null;
                        // don't return null if empty, because of the filter below
                        return MetricsUtils.getRawValueForPartition(c.displayedMetric, c.partition, $scope.displayedMetricByPartitionData);
                    }).filter(function(c) {return c != null;});
                });
                ExportUtils.exportUIData($scope, {
                    name : "Metrics per partition",
                    columns : exportColumns,
                    data : exportRows
                }, "Export metrics");
            };

            refreshDisplayedColumns();
            refreshDisplayedRows();

            $scope.$watch("filteredMetricsPartitions", refreshDisplayedRows, true);
            $scope.$watch("displayedMetricByPartitionData", refreshDisplayedRows);
            $scope.$watch('displayedMetrics', function(nv, ov) {
                if (angular.equals(nv, ov)) return;
                refreshDisplayedColumns();
                refreshDisplayedRows();
            }, true);
            $scope.$watch("sortColumn", refreshDisplayedRows);
            $scope.$watch("sortDescending", refreshDisplayedRows);
       }
    };
});

app.directive('displayMetricsPerColumn', function(DataikuAPI, $stateParams, CreateModalFromTemplate, $timeout, $q, $filter, Debounce, Fn, FutureProgressModal, MetricsUtils, WT1, ActivityIndicator) {
    return {
        scope : true,
        restrict : 'A',
        templateUrl : "/templates/metrics/display-metrics-per-column.html",
        link : function($scope, $element, attrs) {
            $scope.adjustForScroll = {};
            $scope.uiState = {listMode : 'banner', columnQuery : null};
            $scope.displayedMetricByColumnData = [];
            $scope.canCompute = $scope.$eval(attrs.canCompute); // if false, no 'compute' button, and only building the object can compute metrics (ie: saved models)
            $scope.metricsColumnsNames = [];

            $scope.exportColumnsTable = function() {
                $scope.$broadcast('exportColumnsTable');
            };

            $scope.$watch('metrics', function(nv, ov) {
                if ( $scope.metrics == null ) return;
                init();
            }, false);

            var init = function() {
                refreshDisplayedColumnData();
            };

            $scope.columnSearch = function(column) {
                if ( !$scope.uiState.columnQuery ) return true;
                if ( column == null || column.column == null) return false;
                return column.column.toLowerCase().indexOf($scope.uiState.columnQuery.toLowerCase()) >= 0;
            };

            $scope.computeNow = function() {
                $scope.saveMetricsNow().then(function() {
                    $scope.computeAllForPartition($scope.metricsCallbacks.getSelectedMetricsPartitionId());
                });
            };

            $scope.computeAll = function() {
                $scope.saveMetricsNow().then(function() {
                    $scope.metricsCallbacks.computeMetricsAll()
                        .success(MetricsUtils.computeProgressModal($scope, "Computing all metrics"))
                        .error(setErrorInScope.bind($scope));
                });
            };

            $scope.computeAllForPartition = function(partitionId) {
                var modalTitle = "Computing all metrics" + (partitionId == null ? "" : " for partition " + partitionId) + "…";

                $scope.metricsCallbacks.computeMetrics(partitionId)
                    .success(MetricsUtils.computeProgressModal($scope, modalTitle))
                    .error(setErrorInScope.bind($scope));
            };

            $scope.computeAllForColumn = function(columnName) {
                var modalTitle = "Computing all metrics" + (columnName == null ? "" : " for column " + columnName) + "…";

                $scope.metricsCallbacks.computeColumnMetrics(columnName, $scope.metricsCallbacks.getSelectedMetricsPartitionId())
                    .success(MetricsUtils.computeProgressModal($scope, modalTitle))
                    .error(setErrorInScope.bind($scope));
            };

            $scope.getDisplayedColumnsData = function(displayedMetric) {
                if ( displayedMetric == null || displayedMetric.metric == null ) return null;
                var metricId = displayedMetric.metric.id;
                var found = null;
                $scope.displayedMetricByColumnData.forEach(function(displayedMetricColumn) {
                    if ( displayedMetricColumn.metricId == metricId ) {
                        found = displayedMetricColumn;
                    }
                });
                return found;
            };

            $scope.addAllMetricsDatasetInFlow = function(view, partition, filter) {
                WT1.event("metrics-add-dataset-in-flow", {all:true});
                $scope.metricsCallbacks.createMetricsDataset(view, partition, filter).success(function(data) {
                    ActivityIndicator.success("Metrics dataset created");
                    var i = $scope.allComputedMetrics.notExistingViews.indexOf(view);
                    if (i >= 0) {
                        $scope.allComputedMetrics.notExistingViews.splice(i, 1);
                    }
                }).error(setErrorInScope.bind($scope));
            };
            $scope.clearAll  = function() {
                WT1.event("metrics-clear");
                $scope.metricsCallbacks.clearMetrics().success(function(data) {
                    ActivityIndicator.success("Metrics cleared");
                    $scope.$emit('metrics-refresh-displayed-data');
                }).error(setErrorInScope.bind($scope));
            };

            var refreshDisplayedColumnData = function() {
                if ( $scope.displayedMetrics == null || !$scope.displayedMetrics.$loaded || $scope.metrics == null || $scope.metrics.displayedState == null ) return;
                // fetch the data
                $scope.metricsCallbacks.getPreparedMetricColumns($scope.metrics.displayedState).success(function(data) {
                    $scope.displayedMetricByColumnData = data.metrics.map(function(displayedData) {return MetricsUtils.fixupDisplayType(displayedData);});
                    var columnNames = [];
                    data.metrics.forEach(function(metricsColumn) {
                        metricsColumn.values.forEach(function(point) {
                            if (columnNames.indexOf(point.column) < 0) {
                                columnNames.push(point.column);
                            }
                        });
                    });
                    $scope.metricsColumnsNames = columnNames;
                }).error(setErrorInScope.bind($scope));
            };

            $scope.$on('metrics-refresh-displayed-data', refreshDisplayedColumnData);

            var filterMetricsColumns = function() {
                if (!$scope.metricsColumnsNames) return $scope.filteredMetricsColumns = [];
                if ($scope.uiState.columnQuery) {
                    $scope.filteredMetricsColumns = $filter('filter')($scope.metricsColumnsNames, $scope.uiState.columnQuery);
                } else {
                    $scope.filteredMetricsColumns = $scope.metricsColumnsNames.concat([]);
                }
                // remove ALL from the list
                $scope.filteredMetricsColumns = $scope.filteredMetricsColumns.filter(function(p) {return p != 'ALL';});
            };

            $scope.brushChanged = function() {
                $scope.$digest();
                filterMetricsColumns();
            };

            $scope.$watch("metricsColumnsNames", filterMetricsColumns, true);
            $scope.$watch("metricsColumns.columns",  filterMetricsColumns, true);
            $scope.$watch("uiState.columnQuery", Debounce().withDelay(400, 400).wrap(filterMetricsColumns));

            $scope.$watch('metrics.displayedState.columns', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedColumnData();
                // autosave?
            }, false);
            $scope.$watch('metrics.displayedState.partition', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedColumnData();
                // autosave?
            }, false);

            $scope.$watch('displayedMetrics', function(nv, ov) {
                if ( nv == ov ) return;
                refreshDisplayedColumnData();
            }, true);
            filterMetricsColumns();
        }
    };
});

app.directive('columnTableData', function(MetricsUtils, ExportUtils) {
    return {
        scope : false,
        restrict : 'A',
        link: function($scope, element, attrs) {
            $scope.displayedTableColumns = [];
            $scope.displayedTableRows = [];

            var refreshDisplayedColumns = function() {
                $scope.displayedTableColumns = [{isColumn:true, $sortIndex:-1}];
                if ($scope.displayedMetricByColumnData) {
                    $scope.displayedMetricByColumnData.forEach(function(displayedMetric, i) {
                        displayedMetric.$sortIndex = i;
                        $scope.displayedTableColumns.push(displayedMetric);
                    });
                }
                $scope.displayedTableColumns.push({isActions:true});
            };
            var refreshDisplayedRows = function() {
                var sortedColumns = sortColumnRows();
                // build rows for the fattable
                $scope.displayedTableRows = [];
                if (sortedColumns) {
                    sortedColumns.forEach(function(column) {
                        var row = [{isColumn:true, column:column}];
                        if ($scope.displayedMetricByColumnData) {
                            $scope.displayedMetricByColumnData.forEach(function(displayedMetric) {
                                row.push({displayedMetric:displayedMetric, column:column});
                            });
                        }
                        row.push({isActions:true, column:column});
                        $scope.displayedTableRows.push(row);
                    });
                }
            };
            var sortColumnRows = function() {
                if ($scope.filteredMetricsColumns && $scope.sortColumn) {
                    var sortedColumns = $scope.filteredMetricsColumns.concat();
                    if ($scope.sortColumn < 0) {
                        sortedColumns.sort(function(a,b) {
                            var cmp = a.localeCompare(b);
                            return $scope.sortDescending ? -cmp : cmp;
                        });
                    } else {
                        var displayedMetric = $scope.displayedMetricByColumnData[$scope.sortColumn];
                        var values = sortedColumns.map(function(column) {
                            const value = MetricsUtils.getRawValueForColumn(displayedMetric, column, $scope.displayedMetricByColumnData);
                            return {column, value};
                        });
                        values.sort(function(a,b) {
                            // send the null values to the bottom (regardless of descending or not)
                            if (a.value == null && b.value == null) return 0;
                            if (a.value == null && b.value != null) return 1;
                            if (a.value != null && b.value == null) return -1;
                            // then sort for real
                            var cmp = 0;
                            if ( angular.isNumber(a.value) && angular.isNumber(b.value)) {
                                cmp = a.value - b.value;
                            } else {
                                cmp = ('' + a.value).localeCompare('' + b.value);
                            }
                            return $scope.sortDescending ? -cmp : cmp;
                        });
                        sortedColumns = values.map(function(value) {return value.column;})
                    }
                    return sortedColumns;
                } else {
                    return $scope.filteredMetricsColumns.concat();
                }
            };

            refreshDisplayedColumns();
            refreshDisplayedRows();

            $scope.$on('exportColumnsTable', function() {
                $scope.exportTable();
            });
            $scope.exportTable = function(){
                var exportColumns = $scope.displayedTableColumns.map(function(c) {
                    if (c.isColumn) return {"name":"Column","type":"string"};
                    if (c.isActions) return null;
                    return {"name":MetricsUtils.getMetricName(c),"type":"string"};
                }).filter(function(c) {return c != null;});
                var exportRows = $scope.displayedTableRows.map(function(r) {
                    return r.map(function(c) {
                        if (c.isColumn) return c.column;
                        if (c.isActions) return null;
                        // don't return null if empty, because of the filter below
                        return MetricsUtils.getFormattedValueForColumn(c.displayedMetric, c.column, $scope.displayedMetricByColumnData);
                    }).filter(function(c) {return c != null;});
                });
                ExportUtils.exportUIData($scope, {
                    name : "Metrics per column",
                    columns : exportColumns,
                    data : exportRows
                }, "Export metrics");
            };

            $scope.$watch("filteredMetricsColumns", refreshDisplayedRows, true);
            $scope.$watch("displayedMetricByColumnData", refreshDisplayedRows);
            $scope.$watch("displayedMetricByColumnData", refreshDisplayedColumns);
            $scope.$watch('displayedMetrics', function(nv, ov) {
                if ( angular.equals(nv, ov) ) return;
                refreshDisplayedColumns();
                refreshDisplayedRows();
            }, true);
            $scope.$watch("sortColumn", refreshDisplayedRows);
            $scope.$watch("sortDescending", refreshDisplayedRows);
       }
    };
});

app.controller('ListWithCountsController', function($scope) {
    $scope.$watch('point.value', function() {
        $scope.listWithCounts = [];
        if ($scope.point && $scope.point.value) {
            $scope.listWithCounts = [];
            $scope.point.value.forEach(function(row) {
                var value = null;
                var count = null;
                angular.forEach(JSON.parse(row), function(v, k) {
                    value = k;
                    count = v;
                });
                $scope.listWithCounts.push({value:value, count:count})
            });
        }
    });
});
app.controller('HistogramMetricPointController', function($scope, MetricsUtils) {
    $scope.$watch('point.value', function() {
        $scope.histogram = null;
        if ($scope.point && $scope.point.value) {
        	$scope.histogram = MetricsUtils.preprocessHistogram($scope.point.value);
        }
    });
});

// take the last value of the metric and offer it as the 'point' variable for the displaying templates
app.directive('metricLastValue', function(MetricsUtils) {
    return {
        scope : {
            displayedMetric : '=',
            displayedData : '='
        },
        restrict : 'A',
        templateUrl : "/templates/metrics/last-value.html",
        link: function($scope, element, attrs) {
            $scope.MetricsUtils = MetricsUtils;
            $scope.$watch('displayedData', function(nv) {
                if (!nv) return;
                $scope.point = MetricsUtils.getLastValue($scope.displayedData);
            })
        }
    }
});
// one tile to display the last value of a metric
app.directive('metricTile', function(MetricsUtils) {
    return {
        scope : {
            displayedMetric : '=',
            displayedData : '=',
            computeMetricForAll : '=',
            computeMetricForSelected : '=',
            computeMetricForObject : '=',
            createAndPinInsight : '='
        },
        restrict : 'A',
        templateUrl : "/templates/metrics/tile.html",
        link: function($scope, element, attrs) {
            $scope.MetricsUtils = MetricsUtils;

            $scope.$watch('displayedData', function(nv) {
                if (!nv) return;
                $scope.lastValue = MetricsUtils.getLastValue($scope.displayedData);
            })
        }
    }
});
// on banner to display the last value and the history of values
app.directive('metricBanner', function(MetricsUtils) {
    return {
        scope : {
            displayedMetric : '=',
            displayedData : '=',
            displayedRange : '=',
            displayedPartitions : '=',
            displayedPartitionsRange : '=',
            computeMetricForAll : '=',
            computeMetricForSelected : '=',
            computeMetricForObject : '=',
            createAndPinInsight : '='
        },
        replace: true,
        restrict : 'A',
        templateUrl : "/templates/metrics/banner.html",
        link: function($scope, element, attrs) {
            $scope.MetricsUtils = MetricsUtils;
            $scope.adjustForScroll = {left:0};
            element.on('scroll', function() {
                $scope.$apply(function() {$scope.adjustForScroll.left = element[0].scrollLeft;});
            });

            $scope.$watch('displayedData', function(nv) {
                if (!nv) return;
                $scope.lastValue = MetricsUtils.getLastValue($scope.displayedData);
            })
        }
    }
});
// on banner to display the values of a metric on the different partitions (no 'last value' singled out)
app.directive('partitionBanner', function(MetricsUtils) {
    return {
        scope : {
            displayedMetric : '=',
            displayedData : '=',
            displayedPartitions : '=',
            displayedPartitionsRange : '=',
            computeMetricForAll : '=',
            computeMetricForSelected : '=',
            computeMetricForObject : '='
        },
        replace: true,
        restrict : 'A',
        templateUrl : "/templates/metrics/partition-banner.html",
        link: function($scope, element, attrs) {
            $scope.MetricsUtils = MetricsUtils;
            $scope.adjustForScroll = {left:0};
            element.on('scroll', function() {
                $scope.$apply(function() {$scope.adjustForScroll.left = element[0].scrollLeft;});
            });

            $scope.$watch('displayedData', function(nv) {
                if (!nv) return;
                $scope.lastValue = MetricsUtils.getLastValue($scope.displayedData);
            });
        }
    }
});
app.directive('checkBanner', function(MetricsUtils) {
    return {
        scope : {
            displayedCheck : '=',
            displayedData : '=',
            displayedRange : '='
        },
        replace: true,
        restrict : 'A',
        templateUrl : "/templates/metrics/check-banner.html",
        link: function($scope, element, attrs) {
            $scope.MetricsUtils = MetricsUtils;
            $scope.adjustForScroll = {left:0};
            element.on('scroll', function() {
                $scope.$apply(function() {$scope.adjustForScroll.left = element[0].scrollLeft;});
            });
            $scope.pointInRange = function(point) {
                return point.time >= $scope.displayedRange.from && point.time <= $scope.displayedRange.to;
            };

            $scope.$watch('displayedData', function(nv) {
                if (!nv) return;
                $scope.lastValue = $scope.displayedData.lastValue;
            })
        }
    }
});

/*
    Displays one of:
        - the history of the given metric for the given range (if displayedRange is set)
        - the last value of the metric for the given partitions (if displayedPartitions is set)
*/
app.directive('metricHistory', function($filter, MetricsUtils, Fn, $rootScope, Debounce) {
    return {
        scope : {
            displayedMetric : '=',
            displayedData : '=',
            displayedRange : '=',
            displayedPartitions : '=',
            displayedPartitionsRange : '=',
            averageValue : '=',
            tooltipsContainer: '@'
        },
        restrict : 'A',
        templateUrl : "/templates/metrics/metric-history.html",
        link : function($scope, element, attrs) {
            $scope.MetricsUtils = MetricsUtils;

            $scope.pointFilter = function(point) {
                if ($scope.displayedRange) return point.time >= $scope.displayedRange.from && point.time <= $scope.displayedRange.to;
                if ($scope.displayedPartitionsRange) return point.partitionTime >= $scope.displayedPartitionsRange.from && point.partitionTime <= $scope.displayedPartitionsRange.to;
                if ($scope.displayedPartitions) return $scope.displayedPartitions.indexOf(point.partition) > -1;
            };

            var init = function() {
                if ($scope.displayedData == null) return;
                var chartSvg = d3.select(element[0]).select(".chart");
                chartSvg.select("*").remove(); // clear chart
                if ($scope.displayedData.$isPlotted) {
                    var coldWarm = d3.interpolateRgb('#59B3CE', d3.rgb(255,50,50));
                    var values = $scope.displayedData.values.filter(function(v) { return v.hasOwnProperty('value'); });
                    if (values && values.length > 0) {
                        /** put the time of the next point in each point **/
                        for (var i=1;i<values.length;i++) {
                            values[i-1].$nextTime = values[i].time;
                            values[i-1].$nextPartitionTime = values[i].partitionTime;
                        }

                        /** Common behavior for the bar & line charts **/
                        var chartZone = $(element);
                        var margins = {left: 0, right: 0, top: 20, bottom: 35};
                        var width, height, vizWidth, vizHeight, drawn;
                        var x, updateRanges, draw;

                        var viz = chartSvg.append("g");

                        var xAxisG = viz.append("g").attr("class", "x axis");
                        var yAxisLinesG = viz.append("g").attr("class", "y axis lines");
                        var yAxisLabelsG = viz.append("g").attr("class", "y axis labels");
                        var hiddenRectsG = viz.append("g");
                        var actionsG = viz.append("g").attr("class", "actions");

                        var xAxis = d3.svg.axis()
                            .orient('bottom')
                            .ticks(10)
                            .tickSize(-5, 0);

                        var extent;
                        if ($scope.displayedData.$displayType != 'histogram') {
                        	extent = d3.extent(values, Fn.prop('value'));
                        } else {
                        	var min = NaN, max = NaN;
                        	values.forEach(function(v) {
                        		if (v.$histogram == null) {
                        			v.$histogram = MetricsUtils.preprocessHistogram(v.value);
                        		}
                        		if (v.$histogram != null) {
                        			v.$histogram.chistogram.forEach(function(bin) {
                        				if (isNaN(min) || isNaN(max)) {
                        					min = bin[0];
                        					max = bin[1];
                        				} else {
                        					min = Math.min(min, bin[0]);
                        					max = Math.max(max, bin[1]);
                        				}
                        			});
                        		}
                        	});
                        	extent = [min, max];
                        }

                        extent[0] = Math.min(extent[0], 0);
                        if (extent[1] <= 0 && $scope.displayedRange) { margins.top += 15; margins.bottom -= 15; xAxis.orient('top'); }
                        extent[1] = Math.max(extent[1], 0);
                        var y;
                        var yIsDate;
                        if ($scope.displayedData.schemaColumn && $scope.displayedData.schemaColumn.type == 'date') {
                            y = d3.time.scale().domain(extent);
                            yIsDate = true;
                        } else {
                            y = d3.scale.linear().domain(extent);
                            yIsDate = false;
                        }

                        var yAxisLines = d3.svg.axis()
                            .scale(y)
                            .orient('right')
                            .ticks(3);

                        var yAxisLabels = d3.svg.axis()
                            .scale(y)
                            .orient('right')
                            .tickSize(10)
                            .ticks(3);

                        viz.attr("transform", "translate(" + margins.left + ", " + margins.top + ")");

                        var drawCommon = function(resize) {
                            if (resize) {
                                xAxisG.attr("transform", "translate(0, " + y(0) + ")");
                                yAxisLinesG.call(yAxisLines);
                                yAxisLabelsG.call(yAxisLabels);
                                yAxisLinesG.select('path.domain').remove();
                                yAxisLabelsG.select('path.domain').remove();
                                yAxisLabelsG.selectAll('.tick').each(function() {
                                    var tick = d3.select(this);
                                    var bbox = this.getBoundingClientRect();
                                    tick.insert('rect', ':first-child')
                                        .attr('height', bbox.height+2)
                                        .attr('width', bbox.width+10)
                                        .attr('fill', 'white')
                                        .attr('stroke', 'none')
                                        .attr('x', bbox.x - 5)
                                        .attr('y', bbox.y - 1);
                                });
                            }

                            xAxisG.call(xAxis);
                        };

                        var updateRangesCommon = function() {
                            height = chartZone.innerHeight();
                            width = chartZone.select('.metric-plot').width();
                            vizWidth = width - margins.left - margins.right;
                            vizHeight = height - margins.top - margins.bottom;
                            x.range([0, vizWidth]);
                            y.range([vizHeight, 0]);
                            yAxisLines.tickSize(vizWidth);
                        };

                        /*** Metric history line chart ***/
                        if ($scope.displayedRange && $scope.displayedData.$displayType != 'histogram') { // metric history
                            x = d3.time.scale();
                            xAxis.scale(x);

                            updateRanges = updateRangesCommon;

                            var area = d3.svg.area()
                                .x(function(d) { return x(new Date(d.time)); })
                                .y0(function(d) { return y(0); })
                                .y1(function(d) { return y(d.value); });

                            var line = d3.svg.line()
                                .x(function(d) { return x(new Date(d.time)); })
                                .y(function(d) { return y(d.value); });

                            var areaPath = actionsG.append("path")
                                .datum(values)
                                .attr("class", "points-area");

                            var linePath = actionsG.append("path")
                                .datum(values)
                                .attr("class", "points-line");

                            var points = actionsG
                                .selectAll('circle.point')
                                .data(values)
                                .enter()
                                .append('circle')
                                .attr('class', 'point')
                                .attr('r', 4);

                            var addTooltipListener = function(sel) {
                                return sel.on("mousemove", function() {
                                    points.classed('focus', function(d,i) { return i === values.length -1; });

                                    var closest, min, offset = $(chartSvg[0][0]).offset();
                                    points.each(function() {
                                        var dist = Math.pow(Math.abs(d3.event.pageX - offset.left - margins.left - this.getAttribute('cx')),2)
                                            + Math.pow(Math.abs(d3.event.pageY - offset.top - margins.top - this.getAttribute('cy')),2);

                                        if (min === undefined || dist < min) {
                                            min = dist;
                                            closest = this;
                                        }
                                    });

                                    d3.select(closest).each(function(d) {
                                        $rootScope.$broadcast('metrics-charts-focus-point', {time: d.time});
                                    });

                                }).on("mouseout", function() {
                                    $rootScope.$broadcast('metrics-charts-unfocus-point');
                                });
                            };

                            if (points.length == 1) {
                                points.call(addTooltipListener);
                            }

                            var hoverPath = actionsG.append("path")
                                .datum(values)
                                .attr("stroke-width", 10)
                                .attr("stroke", "black")
                                .attr("opacity", 0)
                                .call(addTooltipListener);

                            $scope.$on('metrics-charts-focus-point', function(event, data) {
                                points.classed("focus", function(d,i) { return i === values.length -1; });
                                points
                                    .filter(function(d) { return d.time === data.time; })
                                    .classed("focus", true)
                                    .each(function(d) {
                                        $scope.setTooltipContent(
                                            '<h4><i class="point"></i>' + sanitize(MetricsUtils.getMetricDisplayName($scope.displayedMetric)) + '</h4>'+
                                            '<span class="date">' + sanitize($filter('date')(d.time, 'yyyy-MM-dd HH:mm')) + '</span>'+
                                            '<span class="value">' + sanitize(MetricsUtils.getFormattedValue(d.value, $scope.displayedMetric, $scope.displayedData)) + '</span>'
                                        );
                                        $scope.showTooltip(parseFloat(this.getAttribute('cx')) + margins.left, parseFloat(this.getAttribute('cy')) + margins.top);
                                    })
                            });

                            $scope.$on('metrics-charts-unfocus-point', function(event, data) {
                                points.classed("focus", function(d,i) { return i === values.length -1; });
                                $scope.hideTooltip();
                            });

                            draw = function(resized) {
                                drawCommon(resized);

                                areaPath.attr("d", area);
                                linePath.attr("d", line);
                                points.attr('cx', function(d) { return x(new Date(d.time)); })
                                    .attr('cy', function(d) { return y(d.value); })
                                    .classed('focus', function(d,i) { return i === values.length -1; });
                                hoverPath.attr("d", line);

                            };

                            $scope.$watch("displayedRange", function(nv) {
                                if (!nv) return;

                                /* Add a 3% margin on both sides */
                                var range = { from: nv.from, to: nv.to };
                                var margin = (range.to - range.from)*0.03;
                                range.to += margin;
                                range.from -= margin;

                                x.domain([new Date(range.from), new Date(range.to)]);
                                draw(!drawn);
                                drawn = true;
                            }, true);
                        }

                        /*** Metric history spectrogram ***/
                        if ($scope.displayedRange && $scope.displayedData.$displayType == 'histogram') { // metric history
                            var slices;
                            x = d3.time.scale();
                            xAxis.scale(x);

                            updateRanges = updateRangesCommon;

                            draw = function(resized) {
                                drawCommon(resized);
                                actionsG.style("pointer-events", "none");
                                actionsG.selectAll('g.histogram-slice').remove(); // refresh each time since otherwise the positions are not recomputed when the x domain changes
                                slices = actionsG.selectAll('g.histogram-slice').data(values);
                                slices.enter().append('g').attr('class', 'histogram-slice')
                                .attr('transform', function(d) {
                                    var start = new Date(d.time);
                                    return 'translate(' + x(start) + ',0)';
                                })
                                .attr('cx', function(d) {return x(new Date(d.time));}) // to anchor the tooltip
                                .attr('cy', function(d) {return y(d.$histogram.max);})
                                .each(function(d) {
                                    var start = new Date(d.time);
                                    var end = d.$nextTime ? new Date(d.$nextTime) : x.domain()[1];
                                    var width = x(end) - x(start);
                                    if (d.$histogram != null && width > 0) {
                                        var unitCountOpacity = 1.0 / d.$histogram.longestHistogramBar;
                                        d3.select(this).selectAll('histogram-tile').data(d.$histogram.chistogram).enter().append('rect')
                                                       .attr('class', 'histogram-tile')
                                                       .attr('x', 0)
                                                       .attr('width', Math.max(0, width - 1))
                                                       .attr('y', function(d) {return y(d[1]) + 1;})
                                                       .attr('height', function(d) {return Math.max(0, y(d[0]) - y(d[1]));})
                                                       .style('fill', function(d) {return coldWarm(unitCountOpacity * d[2]);});
                                    }
                                });
                                slices.exit().remove();

                                hiddenRectsG.selectAll('rect.hidd').remove();
                                hiddenRects = hiddenRectsG.selectAll('rect.hidd').data(values);
                                hiddenRects.enter().append('rect')
                                    .attr('class', 'hidd')
                                    .attr('x', function(d) {return x(new Date(d.time));})
                                    .attr('width', function(d) {
                                        var start = new Date(d.time);
                                        var end = d.$nextTime ? new Date(d.$nextTime) : x.domain()[1];
                                        var width = x(end) - x(start);
                                        return d.$histogram != null && width > 0 ? width : 0;
                                    })
                                    .attr('y', y.range()[1])
                                    .attr('height', vizHeight)
                                    .on("mousemove", function(d) {
                                        $rootScope.$broadcast('metrics-charts-focus-point', {time: d.time});
                                    })
                                    .on("mouseout", function(d) {
                                        $rootScope.$broadcast('metrics-charts-unfocus-point');
                                    });
                                hiddenRects.exit().remove();

                            };

                            $scope.$watch("displayedRange", function(nv) {
                                if (!nv) return;

                                /* Add a 3% margin on both sides */
                                var range = { from: nv.from, to: nv.to };
                                var margin = (range.to - range.from)*0.03;
                                range.to += margin;
                                range.from -= margin;

                                x.domain([new Date(range.from), new Date(range.to)]);
                                draw(!drawn);
                                drawn = true;
                            }, true);

                            $scope.$on('metrics-charts-focus-point', function(event, data) {
                                slices.filter(function(d) { return d.time === data.time; })
                                    .classed("focus", true)
                                    .each(function(d) {
                                        if (d.$histogram) {
                                            var minLabel = d.$histogram.min, maxLabel = d.$histogram.max;
                                            if (yIsDate) {
                                                minLabel = $filter('date')(minLabel, 'yyyy-MM-dd HH:mm');
                                                maxLabel = $filter('date')(maxLabel, 'yyyy-MM-dd HH:mm');
                                            }
                                            $scope.setTooltipContent(
                                                    '<h4><i class="point"></i>' + sanitize(MetricsUtils.getMetricDisplayName($scope.displayedMetric)) + '</h4>'+
                                                    '<span class="date">' + sanitize($filter('date')(d.time, 'yyyy-MM-dd HH:mm')) + '</span>'+
                                                    '<span class="value">' + sanitize(minLabel) + ' to ' + sanitize(maxLabel) + '</span>'
                                            );
                                        } else {
                                            $scope.setTooltipContent(
                                                    '<h4><i class="point"></i>' + sanitize(MetricsUtils.getMetricDisplayName($scope.displayedMetric)) + '</h4>'+
                                                    '<span class="date">' + sanitize($filter('date')(d.time, 'yyyy-MM-dd HH:mm')) + '</span>'+
                                                    '<span class="value"></span>'
                                            );
                                        }
                                        $scope.showTooltip(parseFloat(this.getAttribute('cx')) + margins.left, parseFloat(this.getAttribute('cy')) + margins.top);
                                    })
                            });

                            $scope.$on('metrics-charts-unfocus-point', function(event, data) {
                                slices.classed("focus", function(d,i) { return i === values.length -1; });
                                $scope.hideTooltip();
                            });

                        }

                        /*** Partitions chart ***/
                        if ($scope.displayedPartitions) {
                            var rects, hiddenRects, barWidth, fullBarWidth, xCoord, fullXCoord, averageLine, timePeriod;
                            actionsG.style("pointer-events", "none");

                            switch ($scope.displayedData.partitionTimePeriod) {
                                case 'YEAR':
                                    timePeriod = 1000 * 60 * 60 * 24 * 365;
                                    break;
                                case 'MONTH':
                                    timePeriod = 1000 * 60 * 60 * 24 * 30;
                                    break;
                                case 'DAY':
                                    timePeriod = 1000 * 60 * 60 * 24;
                                    break;
                                case 'HOUR':
                                    timePeriod = 1000 * 60 * 60;
                                    break;
                            }

                            if ($scope.displayedPartitionsRange) { // time x-axis
                                $scope.pointFilter = function() { return true; };
                                x = d3.time.scale();
                                xCoord = function(d) { return x(d.partitionTime); };
                                fullXCoord = function(d) { return x(d.partitionTime) - (fullBarWidth-barWidth)/2; };
                                $scope.$watch("displayedPartitionsRange", function() {
                                    if (!$scope.displayedPartitionsRange) return;

                                    /* Add a 3% margin on both sides */
                                    var range = { from: $scope.displayedPartitionsRange.from, to: $scope.displayedPartitionsRange.to };
                                    range.to += 0.8*timePeriod;
                                    var margin = (range.to - range.from)*0.1;
                                    range.to += margin;
                                    range.from -= margin;

                                    x.domain([new Date(range.from), new Date(range.to)]);
                                    draw(false);
                                }, true);
                            } else {
                                x = d3.scale.ordinal();
                                xCoord = function(d) { return x(d.partition); };
                                $scope.$watch("displayedPartitions", Debounce().withDelay(0, 200).wrap(function(nv) {
                                    if (!nv) return;
                                    x.domain(nv);
                                }));
                            }

                            xAxis.scale(x);

                            updateRanges = function(resized) {
                                if ($scope.displayedPartitionsRange) {
                                    if (resized) updateRangesCommon();
                                    var scale = (x.range()[1] - x.range()[0]) / (x.domain()[1] - x.domain()[0]);
                                    fullBarWidth = scale * timePeriod;
                                    barWidth = 0.8 * fullBarWidth;
                                }
                            };

                            draw = function(resized) {

                                var drawAxis = function() {
                                    drawCommon(resized);
                                    updateRanges(resized);
                                };

                                drawAxis();

                                if ($scope.displayedData.$displayType == 'histogram') {
                                    actionsG.selectAll('g.histogram-slice').remove(); // refresh each time since otherwise the positions are not recomputed when the x domain changes
                                    var slices = actionsG.selectAll('g.histogram-slice').data(values.filter($scope.pointFilter), Fn.prop('partition'));
                                    slices.enter().append('g').attr('class', 'histogram-slice')
                                    .attr('transform', function(d) {
                                        return 'translate(' + xCoord(d) + ',0)';
                                    })
                                    .each(function(d) {
                                        var start = new Date(d.partitionTime);
                                        if (d.$histogram != null) {
                                            var unitCountOpacity = 1.0 / d.$histogram.longestHistogramBar;
                                            d3.select(this).selectAll('histogram-tile').data(d.$histogram.chistogram).enter().append('rect')
                                                           .attr('class', 'histogram-tile')
                                                           .attr('x', 0)
                                                           .attr('width', barWidth)
                                                           .attr('y', function(d) {return y(d[1]) + 1;})
                                                           .attr('height', function(d) {return Math.max(0, y(d[0]) - y(d[1]));})
                                                           .style('fill', function(d) {return coldWarm(unitCountOpacity * d[2]);});
                                        }
                                    });
                                    slices.exit().remove();
                                } else {
                                    rects = actionsG.selectAll('rect.bar').data(values.filter($scope.pointFilter), Fn.prop('partition'));
                                    rects.enter().append('rect').attr('class', 'bar');
                                    rects.exit().remove();

                                    rects.attr('x', xCoord)
                                         .attr('width', Math.max(barWidth, 1));

                                    if (resized) {
                                        rects.attr('y', function(d) { return y(d.value); })
                                             .attr('height', function(d) { return y(0) - y(d.value); });

                                        xAxisG.attr("transform", "translate(0, " + vizHeight + ")");
                                    }
                                    if ($scope.averageValue != null) {
                                        averageLine = actionsG.selectAll('line.average').data([$scope.averageValue]);
                                        averageLine.enter().append('line').attr('class', 'average');
                                        averageLine.exit().remove();
                                        averageLine.attr('x1', x.range()[0])
                                            .attr('x2', x.range()[1])
                                            .attr('y1', y($scope.averageValue))
                                            .attr('y2', y($scope.averageValue));
                                   }
                                }

                                hiddenRects = hiddenRectsG.selectAll('rect.hidd').data(values.filter($scope.pointFilter), Fn.prop('partition'));
                                hiddenRects.enter().append('rect').attr('class', 'hidd')
                                    .on("mousemove", function(d) {
                                        var offset = $(chartSvg[0][0]).offset();
                                        $rootScope.$broadcast('metrics-charts-focus-partition', {
                                            partition: d.partition,
                                            pageX: d3.event.pageX - offset.left,
                                            pageY: d3.event.pageY - offset.top
                                        });
                                    })
                                    .on("mouseout", function(d) {
                                        $rootScope.$broadcast('metrics-charts-unfocus-partition');
                                    });
                                hiddenRects.exit().remove();
                                hiddenRects
                                    .attr('x', fullXCoord)
                                    .attr('width', fullBarWidth)
                                    .attr('y', y.range()[1])
                                    .attr('height', vizHeight);

                            };

                            $scope.$on('metrics-charts-focus-partition', function(event, data) {
                                hiddenRects.filter(function(d) { return d.partition === data.partition; })
                                    .classed('active', true)
                                    .each(function(d) {
                                        if ($scope.displayedData.$displayType == 'histogram' && d.$histogram) {
                                            var minLabel = d.$histogram.min, maxLabel = d.$histogram.max;
                                            if (yIsDate) {
                                                minLabel = $filter('date')(minLabel, 'yyyy-MM-dd HH:mm');
                                                maxLabel = $filter('date')(maxLabel, 'yyyy-MM-dd HH:mm');
                                            }
                                            $scope.setTooltipContent(
                                                    '<h4><i class="point"></i>' + sanitize(MetricsUtils.getMetricDisplayName($scope.displayedMetric)) + '</h4>'+
                                                    '<span class="date">' + sanitize(d.partition) + '</span>'+
                                                    '<span class="value">' + sanitize(minLabel) + ' to ' + sanitize(maxLabel) + '</span>'+
                                                    '<div class="partition-date">Computed on ' + sanitize($filter('date')(d.time, "yyyy-MM-dd 'at' HH:mm")) + '</div>'
                                            );
                                        } else {
                                            $scope.setTooltipContent(
                                                    '<h4><i class="point"></i>' + sanitize(MetricsUtils.getMetricDisplayName($scope.displayedMetric)) + '</h4>'+
                                                    '<span class="date">' + sanitize(d.partition) + '</span>'+
                                                    '<span class="value">' + sanitize(MetricsUtils.getFormattedValue(d.value, $scope.displayedMetric, $scope.displayedData)) + '</span>'+
                                                    '<div class="partition-date">Computed on ' + sanitize($filter('date')(d.time, "yyyy-MM-dd 'at' HH:mm")) + '</div>'
                                            );
                                        }
                                    });
                                $scope.showTooltip(data.pageX - margins.left, data.pageY - margins.top);
                            });

                            $scope.$on('metrics-charts-unfocus-partition', function(event, partition) {
                                hiddenRects.classed('active', false);
                                $scope.hideTooltip();
                            })
                        }

                        /** Draw chart **/
                        updateRanges(true); //NOSONAR: will always be initialized as a function since there's no situation where we did not enter one of the 3 if blocks above.
                        draw(true); //NOSONAR: same as above.

                        /** Redraw on resize **/
                        d3.select(window).on("resize." + $scope.displayedMetric.metric.id, function() {
                            updateRanges(true);
                            draw(true);
                        });

                        $scope.$on('resize', function() {
                            updateRanges(true);
                            draw(true);
                        });

                        $scope.$on("$destroy", function() {
                            d3.select(window).on("resize." + $scope.displayedMetric.metric.id, null);
                        });
                    }
                } else {
                    if ($scope.displayedData.$isArray) {
                        $scope.maxLength = d3.max($scope.displayedData.values, Fn.prop(['value', 'length']));
                        $scope.maxArray = Array($scope.maxLength);
                    }
                }
            };

            // Reset when data changes
            $scope.$watch('displayedData', function(nv) { if (nv != null) init();});

            init();
        }
    };
});

app.directive("autoResizeText", function($sce) {
    return {
        scope: {
            content: '=',          // the text to display
            minFontSize: '@',      // in px (default: 12)
            tooltip: '=',          // boolean: whether or not to display tooltip when the text gets to small (default: true),
            tooltipPlacement: '@', // (default: bottom)
            tooltipContainer: '@'  // (default: body)
        },

        template: '<div></div> ' +
        '          <div class="mx-textellipsis" ' +
        '               toggle="tooltip" ' +
        '               title="{{content}}" ' +
        '               placement="{{tooltipPlacement || \'bottom\'}}" ' +
        '               container="{{tooltipContainer || \' body\' }}"></div>',

        link: function($scope, element, attrs) {
            var $el = $(element);
            var tooltip = $scope.tooltip != false;
            var minFontSize = $scope.minFontSize || 12;

            var showToolTip = function () {
                $el.find('div').first().hide();
                $el.find('div').last().show();
            };

            var hideToolTip = function () {
                $el.find('div').first().show();
                $el.find('div').last().hide();
            };

            var originalFontSize = parseInt($el.css('font-size'));
            $scope.$watch("content", function (nv) {
                var c = $scope.content == undefined ? '' : $scope.content.toString();
                // for hackers like clement: use text, not html
                $el.find('div').text(c);
                if (nv == undefined) return;

                // reset original settings
                $el.css('font-size', originalFontSize + 'px');
                hideToolTip();

                var fontSize = originalFontSize;
                while (element[0].scrollWidth > $(element).parent().width() || element[0].scrollHeight > $(element).parent().height()) {
                    if (fontSize - 1 < minFontSize) {
                        if (tooltip) showToolTip();
                        break;
                    }
                    $el.css('font-size', --fontSize + 'px');
                }
            });
        }
    }
});

})();
