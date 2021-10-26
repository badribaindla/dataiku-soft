(function() {
'use strict';

var app = angular.module('dataiku.metrics.core', []);

/**
 * @ngdoc service
 * @name MetricsUtils
 * @description
 *   Some functions for making metrics manipulation easier, mostly on the display side
 */
app.service('MetricsUtils', function($filter, FutureProgressModal, $rootScope) {
    function getValuePointForId(currentMetric, id, displayedMetricDataList, isPartition) {
        if (currentMetric == null || id == null) return {rawValue:null, formattedValue:null};
        const currentData = displayedMetricDataList
            .find(displayedMetric => displayedMetric.metric.id === currentMetric.metric.id);
        let found = null;
        if (currentData) {
            if (isPartition && id === 'ALL') {
                // special case
                found = currentData.partitionAll;
            } else {
                const field = isPartition ? 'partition' : 'column';
                currentData.values.forEach(function (point) {
                    if (point[field] === id) {
                        found = point;
                    }
                });
            }
        }
        if (!found) {
            return {rawValue:null, formattedValue:null};
        }
        const valueType = isPartition ? currentData.valueType : found.valueType;
        const rawValue = found.value;
        const format = currentMetric.meta ? currentMetric.meta.format : null;
        const formattedValue = formatValue(rawValue, valueType, format, 'N/A', true);
        return {rawValue, formattedValue};
    }

    function formatValue(rawValue, valueType, format, undefinedString, concatenateArray) {
        if (rawValue === null) {
            return '';
        } else if (rawValue === undefined) {
            return undefinedString;
        }
        let standardTypes = ['BIGINT', 'DOUBLE', 'STRING', 'BOOLEAN', 'FLOAT', 'INT'];
        if (!concatenateArray) {
            standardTypes.push('ARRAY')
        }
        if (standardTypes.indexOf(valueType) >= 0) {
            if (format) {
                return $filter(format)(rawValue);
            } else {
                return rawValue;
            }
        } else if ('DATE' === valueType) {
            return $filter('utcDate')(rawValue, 'YYYY-MM-DD HH:mm:ss');
        } else if (concatenateArray && 'ARRAY' === valueType && rawValue.join !== undefined) {
            // backend sends an array of strings
            return '[' + rawValue.join(', ') + ']';
        } else {
            return rawValue;
        }
    }

    return {
        getMetricDisplayName: function (computedMetric) {
            if (computedMetric == null) {
                return '';
            } else {
                if (computedMetric.meta) {
                    if (computedMetric.meta.fullName) {
                        return computedMetric.meta.fullName;
                    }
                    if (computedMetric.meta.name) {
                        return computedMetric.meta.name;
                    }
                }
            }
            return null;
        },

        getMetricName: function (computedMetric) {
            if (computedMetric == null) {
                return '';
            } else {
                if (computedMetric.meta) {
                    if (computedMetric.meta.name) {
                        return computedMetric.meta.name;
                    }
                }
            }
            return null;
        },

        getFormattedValue: function (value, displayedMetric, displayedData) {
            if (!displayedData) return value;
            const format = displayedMetric.meta ? displayedMetric.meta.format : null;
            return formatValue(value, displayedData.valueType, format, 'No data', false);
        },

        getLastValue: function (displayedData) {
            if (displayedData == null) return null;
            return displayedData.lastValue;
        },

        fixupDisplayType: function (displayedData) {
            var shouldShowAverage = function (metric) {
                // don't add ["basic:SIZE", "basic:COUNT_FILES", "records:COUNT_RECORDS"] because they're additive (and won't show on the plot)
                var whiteList = ["col_stats:STDDEV", "col_stats:MEAN", "col_stats:MIN", "col_stats:MAX", "adv_col_stats:MODE", "adv_col_stats:MODE", "percentile_stats:"];
                var ok = false;
                whiteList.forEach(function (prefix) {
                    if (metric.metricId.startsWith(prefix)) {
                        ok = true;
                    }
                });
                return ok && ['BIGINT', 'DOUBLE'].indexOf(metric.dataType) >= 0;
            };
            if (displayedData == null) return null;
            displayedData.$isArray = ['ARRAY'].indexOf(displayedData.valueType) >= 0;
            displayedData.$isPlotted = displayedData.isTimePartition != false && ['BIGINT', 'DOUBLE'].indexOf(displayedData.valueType) >= 0;
            if (displayedData.partitionAll && shouldShowAverage(displayedData)) {
                displayedData.partitionAll.averageValue = displayedData.partitionAll.value;
            }
            if (displayedData.$isArray) {
                if (displayedData.metricId.startsWith('col_stats:HISTOGRAM:')) {
                    displayedData.$displayType = 'histogram';
                    displayedData.$isPlotted = true;
                } else if (displayedData.metricId.startsWith('adv_col_stats:TOP10_WITH_COUNTS:')) {
                    displayedData.$displayType = 'list-with-counts';
                } else {
                    displayedData.$displayType = 'list';
                }
            } else {
                displayedData.$displayType = 'single-value';
            }
            return displayedData;
        },

        hasData: function (displayedData) {
            if (displayedData == null) return false;
            if (displayedData.values == null) return false;
            return displayedData.values.length > 0;
        },
        getRawValueForPartition: function (displayedMetric, partition, displayedMetricByPartitionData) {
            return getValuePointForId(displayedMetric, partition, displayedMetricByPartitionData, true).rawValue;
        },
        getFormattedValueForPartition: function (displayedMetric, partition, displayedMetricByPartitionData) {
            return getValuePointForId(displayedMetric, partition, displayedMetricByPartitionData, true).formattedValue;
        },
        getRawValueForColumn: function (displayedMetric, column, displayedMetricByColumnData) {
            return getValuePointForId(displayedMetric, column, displayedMetricByColumnData, false).rawValue;
        },
        getFormattedValueForColumn: function (displayedMetric, column, displayedMetricByColumnData) {
            return getValuePointForId(displayedMetric, column, displayedMetricByColumnData, false).formattedValue;
        },

        getNiceValue: function (displayedData, value) {
            if (displayedData && displayedData.schemaColumn) {
                if (displayedData.schemaColumn.type == 'date') {
                    return $filter('utcDate')(value, 'YYYY-MM-DD HH:mm:ss');
                } else {
                    return value;
                }
            } else {
                return value;
            }
        },

        computeProgressModal: function ($scope, modalTitle) {
            return function (data) {
                FutureProgressModal.show($scope, data, modalTitle)
                    .then(function (result) {
                        $scope.lastComputeResult = result;
                        if (result) {
                            if (result.runs) {
                                $scope.hasErrors = result.runs.some(_ => _.error);
                            } else {
                                $scope.result = result;
                                $scope.hasErrors = false;
                                $scope.lastComputeResult = {
                                    startTime: null,
                                    endTime: null,
                                    allRuns: [],
                                    partitionsList: result.partitionsList || result.partitionIds
                                };
                                result.reports.forEach(function (report) {
                                    $scope.lastComputeResult.allRuns = $scope.lastComputeResult.allRuns.concat(report.runs);
                                    $scope.lastComputeResult.errorRuns = $scope.lastComputeResult.allRuns.filter(_ => !!_.error);
                                    $scope.hasErrors = $scope.lastComputeResult.errorRuns.length > 0;
                                    $scope.lastComputeResult.startTime = $scope.lastComputeResult.startTime == null ? report.startTime : Math.min($scope.lastComputeResult.startTime, report.startTime);
                                    $scope.lastComputeResult.endTime = $scope.lastComputeResult.endTime == null ? report.endTime : Math.max($scope.lastComputeResult.endTime, report.endTime);
                                });
                            }
                        }
                        $rootScope.$broadcast('metrics-refresh-displayed-data');
                    });
            }
        },

        hasAverage: function (displayedData) {
            return displayedData.partitionAll.averageValue != null;
        },

        getColoringClass: function (displayedMetric, value) {
            if (displayedMetric.metric.type == 'check') {
                return value && value.value ? ('outcome-' + value.value.toLowerCase()) : '';
            } else if (value == undefined) {
                return 'no-data-color';
            } else {
                return '';
            }
        },

        preprocessHistogram: function (value) {
            if (value == null) return null;
            var edges = [];
            value.forEach(function (row) {
                var value = null;
                var count = null;
                angular.forEach(JSON.parse(row), function (v, k) {
                    value = parseFloat(k); // only numeric values can have histogram metrics
                    count = v;
                });
                edges.push({value: value, count: count});
            });
            if (edges.length >= 2) {
                var bins = [];
                var min = edges[0].value, max = edges[edges.length - 1].value;
                var maxCount = 0;
                for (var i = 1; i < edges.length; i++) {
                    var lower = edges[i - 1].value;
                    var upper = edges[i].value;
                    var count = edges[i - 1].count;
                    maxCount = Math.max(maxCount, count);
                    bins.push([lower, upper, count]);
                }
                return {min: min, max: max, chistogram: bins, longestHistogramBar: maxCount};
            } else if (edges.length == 1) {
                return {min: edges[0].value, max: edges[0].value}
            } else {
                return null;
            }
        },

        // enlarge if tiny
        fixUpRange: function (range) {
            if (range.from == range.to) {
                var now = new Date().getTime();
                if (now > range.to) {
                    range.to = now;
                    range.from = range.from - (now - range.from);
                } else {
                    range.from = now;
                    range.to = range.to + (range.to - now);
                }
            }
            return range;
        }
    };
});

/**
 * @ngdoc directive
 * @name objectMetrics
 * @description
 *   core metrics directive, to ensure that a 'metrics' object is in the scope. Provides the
 *   metricsIsDirty() for the save button
 */
app.directive('objectMetrics', function($stateParams, CreateModalFromTemplate, $timeout, ActivityIndicator, $q, DataikuAPI, MetricsUtils, $state, WT1) {
    return {
        scope : false,
        restrict : 'A',
        link : function($scope, $element, attrs) {

            $scope.objectMetricsCtx = {
            };

            $scope.MetricsUtils = MetricsUtils;

            var autoSave = $scope.$eval(attrs.metricsAutoSave || 'true');

            var saveWatch = null;

            $scope.objectMetricsInit = function() {
                $scope.origMetricsChecks = $scope.metricsChecks == null ? null : angular.copy($scope.metricsChecks);

                if ( saveWatch != null ) {
                    saveWatch();
                }

                // init the displayState object for datasets/folders/models from old versions passed as-is to the frontend
                if ($scope.metrics && $scope.metrics.displayedState == null) {
                    $scope.metrics.displayedState = {};
                }
                if ($scope.metricsChecks && $scope.metricsChecks.displayedState == null) {
                    $scope.metricsChecks.displayedState = {};
                    $scope.origMetricsChecks.displayedState = {};
                }

                if ( $scope.metrics && $scope.metrics.displayedState && $scope.metrics.displayedState.partition == null ) {
                    $scope.metrics.displayedState.partition = $scope.metricsCallbacks.isPartitioned() ? 'ALL' : 'NP';
                }
                if ( $scope.metricsChecks && $scope.metricsChecks.displayedState && $scope.metricsChecks.displayedState.partition == null ) {
                    $scope.metricsChecks.displayedState.partition = $scope.metricsCallbacks.isPartitioned() ? 'ALL' : 'NP';
                    $scope.origMetricsChecks.displayedState.partition = $scope.metricsChecks.displayedState.partition;
                }

                $scope.refreshAllComputedMetrics();
                $scope.refreshAllComputedChecks();
            };

            $scope.metricsIsDirty = function() {
                var metricsDirty = $scope.metrics && $scope.origMetrics && !angular.equals($scope.metrics, $scope.origMetrics);
                var metricsChecksDirty = $scope.metricsChecks && $scope.origMetricsChecks && !angular.equals($scope.metricsChecks, $scope.origMetricsChecks);
                return metricsDirty || metricsChecksDirty;
            };

            $scope.allComputedMetrics = {metrics:[]};
            $scope.allComputedChecks = {checks:[]};
            var i = 0;
            $scope.refreshAllComputedMetrics = function() {
                $scope.metricsCallbacks.listComputed().success(function(data) {
                    $scope.allComputedMetrics.metrics = data.metrics;
                    $scope.allComputedMetrics.notExistingViews = data.notExistingViews;
                    $scope.allComputedMetrics.i = i++; // dirty the object, so that it gets to the modal $watch
                }).error(setErrorInScope.bind($scope));
            };
            $scope.refreshAllComputedChecks = function() {
                $scope.metricsCallbacks.listComputedChecks().success(function(data) {
                    $scope.allComputedChecks.checks = data.checks;
                    $scope.allComputedChecks.notExistingViews = data.notExistingViews;
                    $scope.allComputedChecks.i = i++; // dirty the object, so that it gets to the modal $watch
                }).error(setErrorInScope.bind($scope));
            };

            var doSaveMetrics = function(deferred) {
                // save: wt1 of which part has changed
                var metricsDisplayedStateChange = false;
                var metricsSettingsChange = false;
                var metricsEngineConfigChange = false;
                if ( $scope.metrics && $scope.origMetrics ) {
                    if ($scope.metrics.displayedState && $scope.origMetrics.displayedState) {
                        metricsDisplayedStateChange = !angular.equals($scope.origMetrics.displayedState, $scope.metrics.displayedState);
                    }
                    if ($scope.metrics.probes && $scope.origMetrics.probes) {
                        metricsSettingsChange = !angular.equals($scope.origMetrics.probes, $scope.metrics.probes);
                    }
                    if ($scope.metrics.engineConfig && $scope.origMetrics.engineConfig) {
                        metricsEngineConfigChange = !angular.equals($scope.origMetrics.engineConfig, $scope.metrics.engineConfig);
                    }
                }
                var checksDisplayedStateChange = false;
                var checksSettingsChange = false;
                var checksEngineConfigChange = false;
                if ( $scope.metricsChecks && $scope.origMetricsChecks ) {
                    if ($scope.metricsChecks.displayedState && $scope.origMetricsChecks.displayedState) {
                        checksDisplayedStateChange = !angular.equals($scope.origMetricsChecks.displayedState, $scope.metricsChecks.displayedState);
                    }
                    if ($scope.metricsChecks.probes && $scope.origMetricsChecks.probes) {
                        checksSettingsChange = !angular.equals($scope.origMetricsChecks.probes, $scope.metricsChecks.probes);
                    }
                    if ($scope.metricsChecks.runOnBuild && $scope.origMetricsChecks.runOnBuild) {
                        checksEngineConfigChange = !angular.equals($scope.origMetricsChecks.runOnBuild, $scope.metricsChecks.runOnBuild);
                    }
                }
                WT1.event("metrics-save", {metricsDisplayedState : metricsDisplayedStateChange,
                    metricsSettings : metricsSettingsChange,
                    metricsEngineConfigChange : metricsEngineConfigChange,
                    checksDisplayedState : checksDisplayedStateChange,
                    checksSettings : checksSettingsChange,
                    checksEngineConfigChange : checksEngineConfigChange});

                $scope.metricsCallbacks.save().success(function(data) {
                    $scope.origMetrics = angular.copy($scope.metrics);
                    $scope.origMetricsChecks = $scope.metricsChecks == null ? null : angular.copy($scope.metricsChecks);
                    ActivityIndicator.success("Saved");
                    if (deferred) {
                        deferred.resolve("Saved");
                    }
                }).error(function (a,b,c) {
                    setErrorInScope.bind($scope)(a,b,c);
                    if (deferred) {
                        deferred.reject("Not saved");
                    }
                });
            };
            $scope.saveMetricsNow = function() {
                var deferred = $q.defer();
                if ( !$scope.metricsIsDirty() ) {
                    deferred.resolve("Saved");
                    return deferred.promise;
                }
                doSaveMetrics(deferred);
                return deferred.promise;
            };

            function allowedTransitions(data) {
                return !(data.toState && data.toState.name && data.toState.name.indexOf("dataset.status") < 0 && data.toState.name.indexOf("managedfolder.status") < 0 && data.toState.name.indexOf("savedmodel.status") < 0);
            }
            checkChangesBeforeLeaving($scope, function(data){
                /* Not yet loaded */
                return $scope.metricsIsDirty();
            }, null, allowedTransitions);

            // hint about each engine's 'speed'
            $scope.getEngineSpeed = function(engineType) {
                if ( engineType == 'Basic' ) {
                    return 'medium';
                }
                if ( engineType == 'DSS' ) {
                    return 'slow';
                }
                if ( engineType == 'SQL_Metrics' || engineType == 'SQL_ColumnMetrics' || engineType == 'SQLQuery' ) {
                    return 'fast';
                }
                if ( engineType == 'Hive_Metrics' || engineType == 'Hive_ColumnMetrics' || engineType == 'HiveQuery' ) {
                    return 'medium fast';
                }
                if ( engineType == 'Impala_Metrics' || engineType == 'Impala_ColumnMetrics' || engineType == 'ImpalaQuery' ) {
                    return 'fast';
                }
                if ( engineType == 'Spark_Metrics' || engineType == 'Spark_ColumnMetrics' || engineType == 'SparkQuery' ) {
                    return 'fast';
                }
                if ( engineType == 'Python' ) {
                    return 'slow';
                }
                return 'N/A';
            };

            $scope.$watch('metricsCallbacks', function(nv) {
                if ( nv == null) return;
                $scope.metricsCallbacks.listAvailableMetrics().success(function(data) {
                    $scope.availableProbes = data;
                    $scope.isHive = data.isHive;
                    $scope.isSql = data.isSql;
                    $scope.regenMetricsSet();
                }).error(setErrorInScope.bind($scope));
            }, false);

            // recreate the 'metrics' object on the dataset, from what is selected in the metrics selector. This will drop
            // metrics whose definition has disappeared
            $scope.regenMetricsSet = function() {

                if ($scope.metrics == null) {
                    // wait for metrics to be loaded then rerun
                    var unbind = $scope.$watch("metrics", function(nv) {
                        if (nv == null) return;
                        $scope.regenMetricsSet();
                        unbind();
                    });
                    return;
                }

                if (!$scope.availableProbes || !$scope.availableProbes.probes) return;

                var probes = [];
                $scope.availableProbes.probes.forEach(function(availableProbe) {
                    var probe = availableProbe.probe;
                    if ( probe.type == 'verify_col' || probe.type == 'col_stats' || probe.type == 'adv_col_stats' || probe.type == 'percentile_stats') {
                        var aggregates = [];
                        availableProbe.hint.columns.forEach(function(column) {
                            column.metrics.forEach(function(metric) {
                                if (metric.active && !metric.disabled) {
                                    aggregates.push({column:column.column, aggregated:metric.aggregated});
                                }
                            });
                        });
                        probe.configuration.aggregates = aggregates;
                    }
                    if (probe.type == 'adv_col_stats') {
                        DataikuAPI.datasets.getFullSampleStatisticsConfig($stateParams.projectKey, $stateParams.projectKey, $stateParams.datasetName).success(function(sampleConfig) {
                            probe.configuration.numberTopValues = sampleConfig.numberTopValues;
                        });
                    }
                    if (probe.type == 'sql_query' || probe.type.startsWith('sql_plugin')) {
                        var columns = [];
                        availableProbe.hint.columns.forEach(function(column) {
                            column.metrics.forEach(function(metric) {
                                if (metric.active && !metric.disabled) {
                                    columns.push(column.column);
                                }
                            });
                        });
                        probe.configuration.columns = columns;
                    }
                    if (probe.type == 'cell') {
                        var columns = [];
                        availableProbe.hint.columns.forEach(function(column) {
                            if (column.active) {
                                columns.push(column.column);
                            }
                        });
                        probe.configuration.columns = columns;
                    }
                    probes.push(probe);
                });
                // swap the list (not the engine config)
                $scope.metrics.probes = probes;
                if (!$scope.origMetrics) $scope.origMetrics = angular.copy($scope.metrics);
            };
        }
    };
});

/**
 * @ngdoc directive
 * @name datasetMetricsMain
 * @description
 *   This directive is composed on the same scope as object-metrics.
 *   It is responsible for setting up the callback, fetching the dataset configuration,
 *   and actually calling the object-metrics-base initialization function
 */
app.directive('datasetMetricsMain', function(DataikuAPI, $stateParams, Dialogs, $state) {
    return {
        scope : false,
        restrict : 'A',
        link : {
            pre: function($scope, $element, attrs) {
                // metricsCallbacks needs to be on the scope before child controllers are initialized
                $scope.metricsCallbacks = {
                    save : function() {
                        return DataikuAPI.datasets.saveMetrics($stateParams.projectKey, $stateParams.datasetName, $scope.metrics, $scope.metricsChecks, false);
                    },
                    listComputed : function() {
                        return DataikuAPI.datasets.listComputedMetrics($stateParams.projectKey, $stateParams.datasetName);
                    },
                    listAvailableMetrics : function() {
                        return DataikuAPI.datasets.listAvailableMetrics($stateParams.projectKey, $stateParams.datasetName);
                    },
                    getPreparedMetricHistory : function(partitionId, metric, metricId) {
                        return DataikuAPI.datasets.getPreparedMetricHistory($stateParams.projectKey, $stateParams.datasetName, partitionId, metric, metricId);
                    },
                    getPreparedMetricHistories : function(displayedState) {
                        return DataikuAPI.datasets.getPreparedMetricHistories($stateParams.projectKey, $stateParams.datasetName, displayedState);
                    },
                    getPreparedMetricPartitions : function(displayedState) {
                        return DataikuAPI.datasets.getPreparedMetricPartitions($stateParams.projectKey, $stateParams.datasetName, displayedState);
                    },
                    getPreparedMetricColumns : function(displayedState) {
                        return DataikuAPI.datasets.getPreparedMetricColumns($stateParams.projectKey, $stateParams.datasetName, displayedState);
                    },
                    computeMetrics : function(partitionId) {
                        return DataikuAPI.datasets.computeMetrics($stateParams.projectKey, $stateParams.datasetName, partitionId, false);
                    },
                    computeColumnMetrics : function(columnName, partitionId) {
                        return DataikuAPI.datasets.computeColumnMetrics($stateParams.projectKey, $stateParams.datasetName, columnName, partitionId, false);
                    },
                    computeMetricsAll : function() {
                        return DataikuAPI.datasets.computeMetrics($stateParams.projectKey, $stateParams.datasetName, null, true);
                    },
                    computeColumnMetricsAll : function(columnName) {
                        return DataikuAPI.datasets.computeColumnMetrics($stateParams.projectKey, $stateParams.datasetName, columnName, null, true);
                    },
                    computeProbe : function(partitionId, allPartitions, metrics) {
                        return DataikuAPI.datasets.computeProbe($stateParams.projectKey, $stateParams.datasetName, partitionId, allPartitions, metrics);
                    },
                    runChecks : function(partitionId) {
                        return DataikuAPI.datasets.runChecks($stateParams.projectKey, $stateParams.datasetName, partitionId, false);
                    },
                    runChecksAll : function() {
                        return DataikuAPI.datasets.runChecks($stateParams.projectKey, $stateParams.datasetName, null, true);
                    },
                    runCheck : function(partitionId, allPartitions, metricsChecks) {
                        return DataikuAPI.datasets.runCheck($stateParams.projectKey, $stateParams.datasetName, partitionId, allPartitions, metricsChecks);
                    },
                    canComputeMetrics : function() {
                        return true;
                    },
                    canRunChecks : function() {
                        return true;
                    },
                    isPartitioned : function() {
                        return $scope.datasetFullInfo.partitioned;
                    },
                    getSelectedMetricsPartitionId : function() {
                        if ( $scope.metrics.displayedState == null || $scope.metrics.displayedState.partition == null || $scope.metrics.displayedState.partition == 'ALL' ) {
                            return $scope.metricsCallbacks.isPartitioned() ? 'ALL' : 'NP';
                        } else {
                            return $scope.metrics.displayedState.partition;
                        }
                    },
                    createMetricsDataset : function(view, partition, filter) {
                        return DataikuAPI.datasets.createMetricsDataset($stateParams.projectKey, $stateParams.datasetName, view, partition, filter);
                    },
                    computePlan : function(metrics) {
                        return DataikuAPI.datasets.computePlan($stateParams.projectKey, $stateParams.datasetName, metrics);
                    },
                    getSelectedChecksPartitionId : function() {
                        if ( $scope.metricsChecks.displayedState == null || $scope.metricsChecks.displayedState.partition == null || $scope.metricsChecks.displayedState.partition == 'ALL' ) {
                            return $scope.metricsCallbacks.isPartitioned() ? 'ALL' : 'NP';
                        } else {
                            return $scope.metricsChecks.displayedState.partition;
                        }
                    },
                    listComputedChecks : function() {
                        return DataikuAPI.datasets.listComputedChecks($stateParams.projectKey, $stateParams.datasetName);
                    },
                    getCheckHistories : function(displayedState) {
                        return DataikuAPI.datasets.getCheckHistories($stateParams.projectKey, $stateParams.datasetName, displayedState);
                    },
                    getPythonProbeStartCode : function() {
                        return "# Define here a function that returns the metric.\n"
                            + "def process(dataset, partition_id):\n"
                            + "    # dataset is a dataiku.Dataset object\n"
                            + "    return {'metric_name1' : 42, 'metric_name2' : True}\n";
                    },
                    canAddPluginProbe : function(desc, kind) {
                        return kind == 'sql' || desc.handlesDataset;
                    },
                    getHint : function(probe) {
                        return DataikuAPI.datasets.getHint($stateParams.projectKey, $stateParams.datasetName, probe);
                    },
                    hasColumnsView : function() {
                        return true;
                    },
                    getObjectType : function() {
                        return 'DATASET';
                    },
                    getObjectSmartId : function() {
                        return $stateParams.datasetName;
                    },
                    getObjectName : function() {
                        return $stateParams.datasetName;
                    },
                    clearMetrics : function() {
                        return DataikuAPI.datasets.clearMetrics($stateParams.projectKey, $stateParams.datasetName, null);
                    },
                    getPartitionListMetric : function() {
                        return DataikuAPI.datasets.getPartitionListMetric($stateParams.projectKey, $stateParams.datasetName);
                    },
                    refreshPartitionListMetric : function() {
                        return DataikuAPI.datasets.refreshPartitionListMetric($stateParams.projectKey, $stateParams.datasetName);
                    }
                };
            },
            post:function($scope, $element, attrs) {

                /// TEMPORARY TO DELETE
                $scope.getNbRecords = function() {
                    DataikuAPI.datasets.getCachedNbRecords($stateParams.projectKey, $stateParams.datasetName).success(function(data) {
                        $scope.nbRecords = data;
                    }).error(setErrorInScope.bind($scope));
                };
                $scope.updateNbRecords = function(recomputeAll) {
                    DataikuAPI.datasets.updateNbRecords($stateParams.projectKey, $stateParams.datasetName, recomputeAll).success(function(data) {
                        $scope.nbRecords2 = data;
                    }).error(setErrorInScope.bind($scope));
                };
                /// END TEMPORARY TO DELETE

                /* Dataset specific stuff: available actions on the partitions list */

                $scope.explorePartition = function(partitionId) {
                    DataikuAPI.explores.setExploreOnSinglePartition($stateParams.projectKey, $stateParams.datasetName, partitionId).success(function(data) {
                        $state.transitionTo('projects.project.datasets.dataset.explore', {projectKey : $stateParams.projectKey, datasetName : $stateParams.datasetName})
                    }).error(setErrorInScope.bind($scope));
                };

                $scope.clearPartition = function (partitionId) {
                    Dialogs.confirm($scope,'Clear partition', 'Are you sure you want to clear this partition ?').then(function(){
                        DataikuAPI.datasets.clearPartitions($stateParams.projectKey,$stateParams.datasetName,[partitionId]).success(function() {
                            $scope.$broadcast('metrics-refresh-displayed-data');
                        }).error(setErrorInScope.bind($scope));
                    });
                };

                DataikuAPI.datasets.get($stateParams.projectKey, $stateParams.datasetName, $stateParams.projectKey).success(function(data){
                    $scope.objectMetricsObjectId = $stateParams.datasetName;
                    $scope.metrics = data.metrics;
                    $scope.metricsChecks = data.metricsChecks;

                    $scope.objectMetricsInit();
                    $scope.datasetSchema = data.schema;
                }).error(setErrorInScope.bind($scope));
            }
        }
    };
});

var fixedResponseMock = function(data) {
    var response = {};
    response.success = function(callback) {callback(data); return response;};
    response.error = function(callback) {return response;};
    return response;
}

/**
 * @ngdoc directive
 * @name datasetMetrics
 * @description
 *   This directive is composed on the same scope as object-metrics-base.
 *   It is responsible for setting up the callback, waiting for the folder configuration,
 *   and actually calling the object-metrics-base initialization function
 */
app.directive('folderMetricsMain', function(DataikuAPI, $state, $stateParams, Dialogs) {
    return {
        scope : false,
        restrict : 'A',
        link : function($scope, $element, attrs) {
            $scope.metricsCallbacks = {
                save : function() {
                    return DataikuAPI.managedfolder.saveMetrics($stateParams.projectKey, $stateParams.odbId, $scope.metrics, $scope.metricsChecks, false);
                },
                listComputed : function() {
                    return DataikuAPI.managedfolder.listComputedMetrics($stateParams.projectKey, $stateParams.odbId);
                },
                listAvailableMetrics : function() {
                    return DataikuAPI.managedfolder.listAvailableMetrics($stateParams.projectKey, $stateParams.odbId);
                },
                getPreparedMetricHistory : function(partitionId, metric, metricId) {
                    return DataikuAPI.managedfolder.getPreparedMetricHistory($stateParams.projectKey, $stateParams.odbId, partitionId, metric, metricId);
                },
                getPreparedMetricHistories : function(displayedState) {
                    return DataikuAPI.managedfolder.getPreparedMetricHistories($stateParams.projectKey, $stateParams.odbId, displayedState);
                },
                computeMetrics : function(partitionId) {
                    return DataikuAPI.managedfolder.computeMetrics($stateParams.projectKey, $stateParams.odbId, partitionId, false);
                },
                computeMetricsAll : function() {
                    return DataikuAPI.managedfolder.computeMetrics($stateParams.projectKey, $stateParams.odbId, null, true);
                },
                computeProbe : function(partitionId, allPartitions, metrics) {
                    return DataikuAPI.managedfolder.computeProbe($stateParams.projectKey, $stateParams.odbId, partitionId, allPartitions, metrics);
                },
                canComputeMetrics : function() {
                    return true;
                },
                canRunChecks : function() {
                    return true;
                },
                isPartitioned : function() {
                    return $scope.odb != null && $scope.odb.partitioning != null && $scope.odb.partitioning.dimensions.length > 0;
                },
                getSelectedMetricsPartitionId : function() {
                    if ( $scope.metrics.displayedState == null || $scope.metrics.displayedState.partition == null || $scope.metrics.displayedState.partition == 'ALL' ) {
                        return $scope.metricsCallbacks.isPartitioned() ? 'ALL' : 'NP';
                    } else {
                        return $scope.metrics.displayedState.partition;
                    }
                },
                createMetricsDataset : function(view, partition, filter) {
                    return DataikuAPI.managedfolder.createMetricsDataset($stateParams.projectKey, $stateParams.odbId, view, partition, filter);
                },
                computePlan : function(metrics) {
                    return DataikuAPI.managedfolder.computePlan($stateParams.projectKey, $stateParams.odbId, metrics);
                },
                runChecks : function(partitionId) {
                    return DataikuAPI.managedfolder.runChecks($stateParams.projectKey, $stateParams.odbId, partitionId, false);
                },
                runChecksAll : function() {
                    return DataikuAPI.managedfolder.runChecks($stateParams.projectKey, $stateParams.odbId, null, true);
                },
                runCheck : function(partitionId, allPartitions, metricsChecks) {
                    return DataikuAPI.managedfolder.runCheck($stateParams.projectKey, $stateParams.odbId, partitionId, allPartitions, metricsChecks);
                },

                // no checks on this object, so just return empty objects for the generic js code
                getPreparedMetricPartitions : function(displayedState) {
                    return DataikuAPI.managedfolder.getPreparedMetricPartitions($stateParams.projectKey, $stateParams.odbId, displayedState);
                },
                getSelectedChecksPartitionId : function() {
                    if ( $scope.metricsChecks.displayedState == null || $scope.metricsChecks.displayedState.partition == null || $scope.metricsChecks.displayedState.partition == 'ALL' ) {
                        return $scope.metricsCallbacks.isPartitioned() ? 'ALL' : 'NP';
                    } else {
                        return $scope.metricsChecks.displayedState.partition;
                    }
                },
                listComputedChecks : function() {
                    return DataikuAPI.managedfolder.listComputedChecks($stateParams.projectKey, $stateParams.odbId);
                },
                getCheckHistories : function(displayedState) {
                    return DataikuAPI.managedfolder.getCheckHistories($stateParams.projectKey, $stateParams.odbId, displayedState);
                },
                getPythonProbeStartCode : function() {
                    return "# Define here a function that returns the metric.\n"
                        + "def process(folder, partition_id):\n"
                        + "    # folder is a dataiku.Folder object\n"
                        + "    return {'metric_name1' : 42, 'metric_name2' : True}\n";
                },
                canAddPluginProbe : function(desc, kind) {
                    return kind == 'python' && desc.handlesManagedFolder;
                },
                getHint : function(probe) {
                    return DataikuAPI.managedfolder.getHint($stateParams.projectKey, $stateParams.odbId, probe);
                },
                hasColumnsView : function() {
                    return false;
                },
                getObjectType : function() {
                    return 'MANAGED_FOLDER';
                },
                getObjectSmartId : function() {
                    return $scope.odb.id;
                },
                getObjectName : function() {
                    return $scope.odb.name;
                },
                clearMetrics : function() {
                    return DataikuAPI.managedfolder.clearMetrics($stateParams.projectKey, $stateParams.odbId);
                },
                getPartitionListMetric : function() {
                    return DataikuAPI.managedfolder.getPartitionListMetric($stateParams.projectKey, $stateParams.odbId);
                },
                refreshPartitionListMetric : function() {
                    return DataikuAPI.managedfolder.refreshPartitionListMetric($stateParams.projectKey, $stateParams.odbId);
                }
            };

            $scope.explorePartition = function(partitionId) {
                DataikuAPI.managedfolder.setExploreOnSinglePartition($stateParams.projectKey, $stateParams.odbId, partitionId).success(function(data) {
                    $state.transitionTo("projects.project.managedfolders.managedfolder.view", {projectKey : $stateParams.projectKey, odbId : $stateParams.odbId})
                }).error(setErrorInScope.bind($scope));
            };

            $scope.clearPartition = function (partitionId) {
                Dialogs.confirm($scope,'Clear partition', 'Are you sure you want to clear this partition ?').then(function(){
                    DataikuAPI.managedfolder.clearPartitions($stateParams.projectKey,$stateParams.odbId,[partitionId]).success(function() {
                        $scope.$broadcast('metrics-refresh-displayed-data');
                    }).error(setErrorInScope.bind($scope));
                });
            };

            /* It is already fetched by the top level controller */
            $scope.$watch("odb", function(nv){
                if (!nv) return;
                $scope.objectMetricsObjectId = $scope.odb.id;
                $scope.metrics = $scope.odb.metrics;
                $scope.metricsChecks = $scope.odb.checks;

                $scope.objectMetricsInit();
            })
        }
    };
});

/**
 * @ngdoc directive
 * @name projectMetrics
 * @description
 *   This directive is composed on the same scope as object-metrics-base.
 *   It is responsible for setting up the callback, waiting for the folder configuration,
 *   and actually calling the object-metrics-base initialization function
 */
app.directive('projectMetricsMain', function(DataikuAPI, $state, $stateParams, Dialogs) {
    return {
        scope : false,
        restrict : 'A',
        link : function($scope, $element, attrs) {
            $scope.metricsCallbacks = {
                save : function() {
                    return DataikuAPI.projects.saveMetrics($stateParams.projectKey, $scope.metrics, $scope.metricsChecks);
                },
                listComputed : function() {
                    return DataikuAPI.projects.listComputedMetrics($stateParams.projectKey);
                },
                listAvailableMetrics : function() {
                    return DataikuAPI.projects.listAvailableMetrics($stateParams.projectKey);
                },
                getPreparedMetricHistory : function(partitionId, metric, metricId) {
                    return DataikuAPI.projects.getPreparedMetricHistory($stateParams.projectKey, partitionId, metric, metricId);
                },
                getPreparedMetricHistories : function(displayedState) {
                    return DataikuAPI.projects.getPreparedMetricHistories($stateParams.projectKey, displayedState);
                },
                computeMetrics : function(partitionId) {
                    return null;
                },
                computeMetricsAll : function() {
                    return null;
                },
                computeProbe : function(partitionId, allPartitions, metrics) {
                    return null;
                },
                canComputeMetrics : function() {
                    return false;
                },
                isPartitioned : function() {
                    return false;
                },
                getSelectedMetricsPartitionId : function() {
                    return 'NP';
                },
                createMetricsDataset : function(view, partition, filter) {
                    return DataikuAPI.projects.createMetricsDataset($stateParams.projectKey, view, partition, filter);
                },
                computePlan : function(metrics) {
                    return null;
                },
                canRunChecks : function() {
                    return false;
                },
                runChecks : function(partitionId) {
                    return null;
                },
                runChecksAll : function() {
                    return null;
                },
                runCheck : function(partitionId, allPartitions, metricsChecks) {
                    return null;
                },
                getPreparedMetricPartitions : function(displayedState) {
                    return null;
                },
                getSelectedChecksPartitionId : function() {
                    return null;
                },
                listComputedChecks : function() {
                    return DataikuAPI.projects.listComputedChecks($stateParams.projectKey);
                },
                getCheckHistories : function(displayedState) {
                    return DataikuAPI.projects.getCheckHistories($stateParams.projectKey, displayedState);
                },
                getPythonProbeStartCode : function() {
                    return null;
                },
                canAddPluginProbe : function(desc, kind) {
                    return false;
                },
                getHint : function(probe) {
                    return null;
                },
                hasColumnsView : function() {
                    return false;
                },
                getObjectType : function() {
                    return 'PROJECT';
                },
                getObjectSmartId : function() {
                    return null;
                },
                getObjectName : function() {
                    return $scope.projectSummary.name;
                },
                clearMetrics : function() {
                    return DataikuAPI.projects.clearMetrics($stateParams.projectKey);
                },
                getPartitionListMetric : function() {
                    return null;
                },
                refreshPartitionListMetric : function() {
                    return null;
                },
                saveExternalMetricsValues : function(metricsData, typesData) {
                    return DataikuAPI.projects.saveExternalMetricsValues($stateParams.projectKey, metricsData, typesData);
                },
                saveExternalChecksValues : function(checksData) {
                    return DataikuAPI.projects.saveExternalChecksValues($stateParams.projectKey, checksData);
                }
            };

            $scope.explorePartition = function(partitionId) {
                // no partition on projects
            };

            $scope.clearPartition = function (partitionId) {
                // no partition on projects
            };

            /* It is already fetched by the top level controller */
            $scope.$watch("projectSummary", function(nv){
                if (!nv) return;
                $scope.objectMetricsObjectId = null;
                $scope.metrics = $scope.projectSummary.metrics;
                $scope.metricsChecks = $scope.projectSummary.metricsChecks;

                $scope.objectMetricsInit();
            })
        }
    };
});

/**
 * @ngdoc directive
 * @name modelMetricsMain
 * @description
 *   This directive is composed on the same scope as object-metrics-base.
 *   It is responsible for setting up the callback, waiting for the model settings
 *   and actually calling the object-metrics-base initialization function
 */
app.directive('modelMetricsMain', function(DataikuAPI, $stateParams) {
    return {
        scope : false,
        restrict : 'A',
        link : function($scope, $element, attrs) {
            $scope.metricsCallbacks = {
                save : function() {
                    return DataikuAPI.savedmodels.save($scope.savedModel);
                },
                listComputed : function() {
                    return DataikuAPI.savedmodels.listComputedMetrics($stateParams.projectKey, $stateParams.smId);
                },
                listAvailableMetrics : function() {
                    return fixedResponseMock({probes:[],isHive:false,isSql:false});
                },
                getPreparedMetricHistory : function(partitionId, metric, metricId) {
                    return DataikuAPI.savedmodels.getPreparedMetricHistory($stateParams.projectKey, $stateParams.smId, metric, metricId);
                },
                getPreparedMetricHistories : function(displayedState) {
                    return DataikuAPI.savedmodels.getPreparedMetricHistories($stateParams.projectKey, $stateParams.smId, displayedState);
                },
                computeMetrics : function(partitionId) {
                    return null;
                },
                computeProbe : function(partitionId, allPartitions, metrics) {
                    return null;
                },
                canRunChecks : function() {
                    return true;
                },
                runChecks : function(partitionId) {
                    return DataikuAPI.savedmodels.runChecks($stateParams.projectKey, $stateParams.smId);
                },
                runCheck : function(partitionId, allPartitions, metricsChecks) {
                    return DataikuAPI.savedmodels.runCheck($stateParams.projectKey, $stateParams.smId, metricsChecks);
                },
                canComputeMetrics : function() {
                    return false;
                },
                isPartitioned : function() {
                    return false;
                },
                getSelectedMetricsPartitionId : function() {
                    return null;
                },
                createMetricsDataset : function(view, partition, filter) {
                    return DataikuAPI.savedmodels.createMetricsDataset($stateParams.projectKey, $stateParams.smId, view, partition, filter);
                },
                computePlan : function(metrics) {
                    return null;
                },
                getPreparedMetricPartitions : function(displayedState) {
                    return DataikuAPI.savedmodels.getPreparedMetricPartitions($stateParams.projectKey, $stateParams.smId, displayedState);
                },
                getSelectedChecksPartitionId : function() {
                    return null;
                },
                listComputedChecks : function() {
                    return DataikuAPI.savedmodels.listComputedChecks($stateParams.projectKey, $stateParams.smId);
                },
                getCheckHistories : function(displayedState) {
                    return DataikuAPI.savedmodels.getCheckHistories($stateParams.projectKey, $stateParams.smId, displayedState);
                },
                getPythonProbeStartCode : function() {
                    return "# ";
                },
                canAddPluginProbe : function(desc, kind) {
                    return false;
                },
                getHint : function(probe) {
                    return DataikuAPI.savedmodels.getHint($stateParams.projectKey, $stateParams.smId, probe);
                },
                hasColumnsView : function() {
                    return false;
                },
                getObjectType : function() {
                    return 'SAVED_MODEL';
                },
                getObjectSmartId : function() {
                    return $scope.savedModel.id;
                },
                getObjectName : function() {
                    return $scope.savedModel.name;
                },
                clearMetrics : function() {
                    return DataikuAPI.savedmodels.clearMetrics($stateParams.projectKey, $stateParams.smId, null);
                },
                getPartitionListMetric : function() {
                    return null;
                },
                refreshPartitionListMetric : function() {
                    return null;
                }
            };

            /* It is already fetched by the top level controller */
            $scope.$watch("savedModel", function(nv){
                if (!nv) return;
                $scope.objectMetricsObjectId = $scope.savedModel.id;
                $scope.metrics = $scope.savedModel.metrics;
                $scope.metricsChecks = $scope.savedModel.metricsChecks;

                $scope.objectMetricsInit();
            })
        }
    };
});


/**
 * @ngdoc directive
 * @name metricsPartitionSelection
 * @description
 *   This directive is composed with dataset metrics main.
 *   It provides the ability to get the cached list of partitions from the "union of all known partitions in metrics DB"
 *   and to force a refresh of the list of partitions.
 *
 *   This list of partition is used both in the Settings (Probes and Checks) and in the "History" tabs, since
 *   there are compute buttons in the settings screen, which uses the "currently selected in history" metric
 */
 app.directive('metricsPartitionSelection', function(DataikuAPI, $timeout, $stateParams, WT1) {
    return {
        scope : false,
        restrict : 'A',
        link : function($scope, $element, attrs) {
            $scope.metricsPartitionsIds = ['ALL'];
            $scope.metricsPartitionsIdsExcludingAll = [];
            $scope.setPartitionList = function(data) {
                $scope.metricsPartitions = data.partitionsList;
                $scope.metricsPartitions.partitions = $scope.metricsPartitions.partitions || [];
                $scope.metricsPartitions.partitions.sort(function(a, b) { return a.partition < b.partition ? -1 : (a.partition > b.partition ? 1 : 0) });
                $scope.metricsPartitionsIds = data.partitionsList.partitions.map(function(p) {return p.partition;});
                $scope.metricsPartitionsIds.sort();
                if (data.partitionsList.isTimePartition) {
                    // most recent on top
                    $scope.metricsPartitionsIds = $scope.metricsPartitionsIds.reverse();
                }
                $scope.metricsPartitionsIdsExcludingAll = $scope.metricsPartitionsIds.concat();
                $scope.metricsPartitionsIds.unshift('ALL');
            };

            var initDeregister = $scope.$watch('metricsCallbacks', function(nv) {
                if (!nv) return;
                $scope.metricsCallbacks.getPartitionListMetric().success(function(data) {
                    $scope.setPartitionList({partitionsList : data});
                }).error(setErrorInScope.bind($scope));
                initDeregister();
            });

            $scope.refreshMetricsPartitions = function() {
                WT1.event("metrics-refresh-partition-list");
                $scope.metricsCallbacks.refreshPartitionListMetric().success(function(data) {
                    $scope.setPartitionListRefreshing(data);
                    $scope.refreshAllComputedMetrics();
                    $scope.refreshAllComputedChecks();
                }).error(setErrorInScope.bind($scope));
            };
            $scope.refreshing = null;
            $scope.setPartitionListRefreshing = function(data) {
                if (data && data.hasResult) {
                    $scope.metricsCallbacks.getPartitionListMetric().success(function(data) {
                        $scope.setPartitionList({partitionsList : data});
                    }).error(setErrorInScope.bind($scope));
                    $scope.refreshing = null;
                    $scope.$broadcast('metrics-refresh-partition-list', data.result);
                } else if (data && !data.hasResult) {
                    $scope.refreshing = data;
                    $timeout(function(){
                        $scope.checkIfStillRefreshing();
                    }, 5000);
                } else {
                    $scope.refreshing = null;
                }
            };
            $scope.checkIfStillRefreshing = function() {
                DataikuAPI.futures.getUpdate($scope.refreshing.jobId).success(function(data) {
                    $scope.setPartitionListRefreshing(data);
                }).error(function (a,b,c) {
                    $scope.setPartitionListRefreshing(null);
                    setErrorInScope.bind($scope)(a,b,c);
                });
            };
        }
    };
});




app.controller("EditMetricsSettingsController", function($scope) {
    $scope.engineConfig = angular.copy($scope.metrics.engineConfig);
    var origEngineConfig = angular.copy($scope.engineConfig);
    $scope.save = function() {
        $scope.metrics.engineConfig = $scope.engineConfig;
        $scope.dismiss();
    };
    $scope.isDirty = function() {
        return !angular.equals($scope.engineConfig, origEngineConfig);
    };
});


// filter to exclude metrics relevant only for the full dataset
app.filter('onlyMetricsForPartition', function() {
    return function (metrics) {
        return metrics.filter(function (metric) {
            return !metric.metric.id.startsWith("partitioning:");
        });
    };
});



})();