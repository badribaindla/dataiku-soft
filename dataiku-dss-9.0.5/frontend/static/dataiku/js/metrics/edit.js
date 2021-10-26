(function() {
'use strict';

var app = angular.module('dataiku.metrics.edit', ['dataiku.metrics.core']);

app.directive('editChecksSettings', function(DataikuAPI, $stateParams, CreateModalFromTemplate, $timeout, WT1, CodeMirrorSettingService) {
    return {
        scope : true,
        restrict : 'A',
        templateUrl : "/templates/metrics/edit-checks-settings.html",
        link : function($scope, $element, attrs) {
            // python checks
            $scope.pythonEditorOptions = CodeMirrorSettingService.get("text/x-python");

            $scope.lastCheckResult = null;
            var setLastCheckResult = function(result) {
                $scope.lastCheckResult = result;
            };

            var pythonCheckStartCode = "# Define here a function that returns the outcome of the check.\n"
                                     + "def process(last_values, dataset, partition_id):\n"
                                     + "    # last_values is a dict of the last values of the metrics,\n"
                                     + "    # with the values as a dataiku.metrics.MetricDataPoint.\n"
                                     + "    # dataset is a dataiku.Dataset object\n"
                                     + "    return 'OK', 'optional message' # or 'WARNING' or 'ERROR'\n";
            $scope.addCheck = function(checkType) {
                WT1.event("checks-add-check", {checkType:checkType});
                var check = {type:checkType, meta:{}, fullDatasetMode:'PARTITION'};
                if ( checkType == 'numericRange' ) {
                    check.meta.name = 'Value in range';
                    check.metricId = null;
                    check.minimum = 0;
                    check.maximum = 0;
                    check.minimumEnabled = false;
                    check.maximumEnabled = false;
                } else if ( checkType == 'valueSet' ) {
                    check.meta.name = 'Value in set';
                    check.metricId = null;
                    check.values = [];
                } else if ( checkType == 'python' ) {
                    check.meta.name = 'Custom check';
                    check.code = pythonCheckStartCode;
                    check.envSelection = {envMode: "INHERIT"};
                }
                $scope.metricsChecks.checks.push(check);
            };

            $scope.addCustomCheck = function(loadedDesc) {
                WT1.event("metrics-add-plugin-check", {checkType:loadedDesc.checkType});
                var name = loadedDesc.desc.meta.label || loadedDesc.desc.id;
                var check = {type:loadedDesc.checkType, fullDatasetMode:'PARTITION', meta:{name:name}, config: {}};
                $scope.metricsChecks.checks.push(check);
            };

            $scope.removeCheck = function(check) {
                var i = $scope.metricsChecks.checks.indexOf(check);
                if ( i >= 0 ) {
                    $scope.metricsChecks.checks.splice(i,1);
                }
            };

            var refreshAllMetrics = function() {
                $scope.allMetrics = [];
                if ( $scope.allComputedMetrics ) {
                    // stuff with values already existing in the db
                    $scope.allComputedMetrics.metrics.forEach(function(computedMetric) {
                        $scope.allMetrics.push(computedMetric);
                    });
                }
            };
            refreshAllMetrics();
            $scope.$watch('metrics', function() {refreshAllMetrics();}, true);
            $scope.$watch('allComputedMetrics', function() {refreshAllMetrics();}, true);

            var checksRunSettings = {};
            $scope.getCheckRunSettings = function(metricsCheck) {
                var checkRunSettings = checksRunSettings[metricsCheck.name];
                if ( checkRunSettings == null ) {
                    checkRunSettings = {fullDataset : false, partition : null};
                    checksRunSettings[metricsCheck.name] = checkRunSettings;
                }
                return checkRunSettings;
            };
        }
    };
});

app.directive('editProbesSettings', function($stateParams, CreateModalFromTemplate, WT1, CodeMirrorSettingService) {
    return {
        scope : true,
        restrict : 'A',
        templateUrl : "/templates/metrics/edit-probes-settings.html",
        link : function($scope, $element, attrs) {
            // python metrics
            $scope.pythonEditorOptions = CodeMirrorSettingService.get("text/x-python");
            // sql metrics
            $scope.sqlEditorOptions = CodeMirrorSettingService.get("text/x-sql");

            $scope.dataTypes = ['STRING', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'DATE'];

            var pythonProbeStartCode = $scope.metricsCallbacks.getPythonProbeStartCode();
            var sqlProbeStartCode = "-- the metrics values and names are taken from the columns of the select statement\n"
                                  + "SELECT 42 AS metric_1, 'xxx' AS metric_2 FROM ${DKU_DATASET_TABLE_NAME}\n"
                                  + "-- when partitioned, a filter for the WHERE clause can be added like:\n"
                                  + "-- WHERE ${DKU_PARTITION_FILTER} \n"
                                  + "-- when the dataset is a sql query, the select query is available as\n"
                                  + "-- ${DKU_DATASET_QUERY} and, if any, statements before and after the\n"
                                  + "-- select as ${DKU_DATASET_PRE_QUERIES} and  ${DKU_DATASET_POST_QUERIES}\n";

            $scope.cellProbeRowSelectionModes = [
                ["SINGLE_CELL_STRICT", "Single row matching the filter"],
                ["SINGLE_CELL_OR_NONE", "Single row matching the filter, or none"],
                ["FIRST_CELL_OR_NONE", "First row matching the filter"],
                ["MULTI_CELL", "All rows matching the filter"]
            ]
            $scope.cellProbeRowSelectionModesDesc = [
                "Fails if the filter returns 0 or more than 1 rows",
                "Fails if the filter returns more than 1 rows. If the filter returns 0 rows, metric has no value",
                "Takes the first row matching the filter. If the filter returns 0 rows, metric has no value",
                "All rows (creates a array-typed metric) - advanced use"
            ]


            $scope.addProbe = function(probeType) {
                WT1.event("metrics-add-probe", {probeType:probeType});
                var level = probeType == 'python' ? 8 : 9;
                var name = probeType == 'python' ? 'Python probe' : (probeType == 'cell' ? 'Cell value' : 'SQL probe');
                var probe = {type:probeType,meta:{level:level, name:name}, computeOnBuildMode:'NO', configuration:{code:''}};
                if ( probeType == 'python') {
                    probe.configuration.code = pythonProbeStartCode;
                    probe.configuration.envSelection = {envMode: "INHERIT"};
                }
                if ( probeType == 'sql_query') {
                    probe.configuration.code = sqlProbeStartCode;
                    probe.configuration.canRunOnImpala = true;
                }
                if ( probeType == 'cell') {
                    probe.configuration.filter = {enabled:true, uiData:{mode:'&&'}};
                    probe.configuration.mode = 'SINGLE_CELL_STRICT';
                    probe.enabled = true;
                }
                $scope.metricsCallbacks.getHint(probe).success(function(hint) {
                    $scope.availableProbes.probes.push({probe:probe, metrics:[], hint:hint});
                    $scope.regenMetricsSet();
                }).error(setErrorInScope.bind($scope));
            };
            $scope.addCustomProbe = function(loadedDesc) {
                WT1.event("metrics-add-plugin-probe", {probeType:loadedDesc.probeType});
                var level = 10;
                var name = loadedDesc.desc.meta.label || loadedDesc.desc.id;
                var probe = {type:loadedDesc.probeType, meta:{level:level, name:name}, computeOnBuildMode:'NO', configuration:{config:{}}};
                $scope.metricsCallbacks.getHint(probe).success(function(hint) {
                    $scope.availableProbes.probes.push({probe:probe, metrics:[], hint:hint});
                    $scope.regenMetricsSet();
                }).error(setErrorInScope.bind($scope));
            };

            $scope.removeProbe = function(probe) {
                var i = $scope.availableProbes.probes.indexOf(probe);
                if ( i >= 0 ) {
                    $scope.availableProbes.probes.splice(i,1);
                }
                $scope.regenMetricsSet();
            };

            $scope.columnQuery = null;
            $scope.columnSearch = function(metric) {
                if ( !$scope.columnQuery ) return true;
                if ( metric == null || !metric.column ) return false;
                return metric.column.toLowerCase().indexOf($scope.columnQuery.toLowerCase()) >= 0;
            };
            $scope.metricQuery = null;
            $scope.metricSearch = function(metric) {
                if ( !$scope.metricQuery ) return true;
                if ( metric == null) return false;
                var lowerCasedSearch = $scope.metricQuery.toLowerCase();
                if ( metric.name && metric.name.toLowerCase().indexOf(lowerCasedSearch) >= 0 ) {
                    return true;
                }
                if ( metric.aggregated && metric.aggregated.toLowerCase().indexOf(lowerCasedSearch) >= 0 ) {
                    return true;
                }
                return false;
            };

            var getFilteredMetrics = function() {
                var selectedMetrics = [];
                if ( !$scope.metricQuery && !$scope.columnQuery ) return selectedMetrics;
                $scope.availableProbes.probes.forEach(function(availableProbe){
                    var probe = availableProbe.probe;
                    if ( probe.type == 'verify_col' || probe.type == 'col_stats' || probe.type == 'adv_col_stats' || probe.type == 'percentile_stats') {
                        availableProbe.hint.metrics.forEach(function(metric) {
                            if ( $scope.metricSearch(metric) ) {
                                metric.columns.forEach(function(column) {
                                    if ( $scope.columnSearch(column) ) {
                                        selectedMetrics.push(column);
                                    }
                                });
                            }
                        });
                    }
                });
                return selectedMetrics;
            };

            $scope.activateFilteredMetrics = function() {
                getFilteredMetrics().forEach(function(metric) {if (!metric.disabled) metric.active=true;});
                $scope.regenMetricsSet();
            };
            $scope.deactivateFilteredMetrics = function() {
                getFilteredMetrics().forEach(function(metric) {metric.active=false;});
                $scope.regenMetricsSet();
            };

            $scope.editRunSettings = function() {
                WT1.event("metrics-edit-run-settings");
                CreateModalFromTemplate("/templates/metrics/edit-metrics-settings-modal.html", $scope, "EditMetricsSettingsController", undefined, true);
            };


            // display computation plan
            var timeout;
            var lastPlanUpdate = { metrics : null, plan : null};
            $scope.computationPlan = null;
            var doUpdatePlan = function() {
                $scope.metricsCallbacks.computePlan(lastPlanUpdate.metrics).success(function(data) {
                    lastPlanUpdate.plan = data;
                    $scope.computationPlan = data;
                    $scope.totalCost = 0;
                    $scope.totalCount = 0;
                    data.forEach(function(run) {$scope.totalCost += run.cost; $scope.totalCount += run.computations.length;})
                }).error(setErrorInScope.bind($scope));
            };
            var updatePlan = function() {
                if ( $scope.metrics == null ) return;
                var dirty = lastPlanUpdate.metrics == null;
                if ( !dirty ) {
                    // do not compare the selection of metrics to display
                    dirty = !angular.equals($scope.metrics.probes, lastPlanUpdate.metrics.probes) || !angular.equals($scope.metrics.engineConfig, lastPlanUpdate.metrics.engineConfig);
                }
                if ( !dirty ) return;

                lastPlanUpdate.metrics = angular.copy($scope.metrics);
                clearTimeout(timeout);
                timeout = setTimeout(function() {doUpdatePlan();}, 2000);
            };
            $scope.$watch('metrics', function() {
                updatePlan();
            }, true);

            $scope.getAvailableProbeName = function(availableProbe) {
                if (availableProbe.probe.type == 'partitioning') return 'Partitions list & count';
                if (availableProbe.probe.type == 'records') return 'Records count';
                if (availableProbe.probe.type  == 'basic') {
                    if ( availableProbe.hint.hasSize && availableProbe.hint.hasCountFiles && availableProbe.hint.hasCountColumns ) return 'Size, files count & columns count';
                    if ( availableProbe.hint.hasSize && availableProbe.hint.hasCountFiles && !availableProbe.hint.hasCountColumns ) return 'Size & files count';
                    if ( availableProbe.hint.hasSize && !availableProbe.hint.hasCountFiles && availableProbe.hint.hasCountColumns ) return 'Size & columns count';
                    if ( availableProbe.hint.hasSize && !availableProbe.hint.hasCountFiles && !availableProbe.hint.hasCountColumns ) return 'Size';
                    if ( !availableProbe.hint.hasSize && availableProbe.hint.hasCountFiles && availableProbe.hint.hasCountColumns ) return 'Files count & columns count';
                    if ( !availableProbe.hint.hasSize && availableProbe.hint.hasCountFiles && !availableProbe.hint.hasCountColumns ) return 'Files count';
                    if ( !availableProbe.hint.hasSize && !availableProbe.hint.hasCountFiles && availableProbe.hint.hasCountColumns ) return 'Columns count';
                }
                return availableProbe.probe.meta.name || availableProbe.probe.type;
            };
        }
    };
});

app.directive("newCustomProbeMenu", function(GlobalProjectActions, $filter){
    return {
        templateUrl : '/templates/datasets/fragments/new-custom-probe-menu.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.title = attrs.title;

            var ret = [];

            var pluginSections = {}

            if ( $scope.appConfig.customPythonProbes ) {
                $scope.appConfig.customPythonProbes.forEach(function(x){
                    if (!$scope.metricsCallbacks.canAddPluginProbe(x.desc, "python")) {
                        return;
                    }
                    var pluginSection = pluginSections[x.ownerPluginId];
                    if (pluginSection == null) {
                        pluginSection = {
                                pluginId : x.ownerPluginId,
                                items : []
                        };
                        pluginSections[x.ownerPluginId] = pluginSection;
                    }

                    pluginSection.items.push({
                        type : x.probeType,
                        label : x.desc.meta != null && x.desc.meta.label != null ? x.desc.meta.label : x.ownerPluginId,
                                icon : x.desc.meta != null ? x.desc.meta.icon : null,
                                        desc : x
                    })
                });
            }
            if ( $scope.appConfig.customSQLProbes ) {
                $scope.appConfig.customSQLProbes.forEach(function(x){
                    if (!$scope.metricsCallbacks.canAddPluginProbe(x.desc, "sql")) {
                        return;
                    }
                    var pluginSection = pluginSections[x.ownerPluginId];
                    if (pluginSection == null) {
                        pluginSection = {
                                pluginId : x.ownerPluginId,
                                items : []
                        };
                        pluginSections[x.ownerPluginId] = pluginSection;
                    }

                    pluginSection.items.push({
                        type : x.probeType,
                        label : x.desc.meta != null && x.desc.meta.label != null ? x.desc.meta.label : x.ownerPluginId,
                                icon : x.desc.meta != null ? x.desc.meta.icon : null,
                                        desc : x
                    })
                });
            }

            $.each(pluginSections, function(pluginId, pluginData){
                var plugin = Array.dkuFindFn($scope.appConfig.loadedPlugins, function(n){
                    return n.id == pluginData.pluginId
                });
                if ( plugin == null ) return;
                pluginData.items.forEach(function(dtype){
                    if (!dtype.icon) dtype.icon = plugin.icon;
                });
                var section = {
                        isSection : true,
                        id : "plugin_" + plugin.id,
                        icon : plugin.icon,
                        label : plugin.label || plugin.id,
                        items : pluginData.items
                    };
                // add an item to point to the doc
                section.items.splice(0, 0, {isInfo : true, pluginId : plugin.id});
                ret.push(section);
            });

            $scope.create = function(item) {
                $scope.addCustomProbe(item.desc);
            };

            $scope.displayedItems = ret;
        }
    }
});

app.directive("newCustomCheckMenu", function(GlobalProjectActions, $filter){
    return {
        templateUrl : '/templates/datasets/fragments/new-custom-check-menu.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.title = attrs.title;

            var ret = [];

            var pluginSections = {}

            if ( $scope.appConfig.customPythonChecks ) {
                $scope.appConfig.customPythonChecks.forEach(function(x){
                    var pluginSection = pluginSections[x.ownerPluginId];
                    if (pluginSection == null) {
                        pluginSection = {
                                pluginId : x.ownerPluginId,
                                items : []
                        };
                        pluginSections[x.ownerPluginId] = pluginSection;
                    }

                    pluginSection.items.push({
                        type : x.checkType,
                        label : x.desc.meta != null && x.desc.meta.label != null ? x.desc.meta.label : x.ownerPluginId,
                                icon : x.desc.meta != null ? x.desc.meta.icon : null,
                                        desc : x
                    })
                });
            }

            $.each(pluginSections, function(pluginId, pluginData){
                var plugin = Array.dkuFindFn($scope.appConfig.loadedPlugins, function(n){
                    return n.id == pluginData.pluginId
                });
                if ( plugin == null ) return;
                pluginData.items.forEach(function(dtype){
                    if (!dtype.icon) dtype.icon = plugin.icon;
                });
                var section = {
                        isSection : true,
                        id : "plugin_" + plugin.id,
                        icon : plugin.icon,
                        label : plugin.label || plugin.id,
                        items : pluginData.items
                    };
                // add an item to point to the doc
                section.items.splice(0, 0, {isInfo : true, pluginId : plugin.id});
                ret.push(section);
            });

            $scope.create = function(item) {
                $scope.addCustomCheck(item.desc);
            };

            $scope.displayedItems = ret;
        }
    }
});

app.directive('pluginProbeConfig', function($filter, PluginConfigUtils) {
    return {
        scope : false,
        restrict : 'A',
        link : function($scope, element, attrs) {
            $scope.probeType = $scope.$eval(attrs.probeType);
            $scope.probeConfig = $scope.$eval(attrs.probeConfig);

            var pythonProbe = $scope.appConfig.customPythonProbes.filter(function(x){
                return x.probeType == $scope.probeType;
            });
            var sqlProbe = $scope.appConfig.customSQLProbes.filter(function(x){
                return x.probeType == $scope.probeType;
            });
            if ( pythonProbe.length > 0 ) {
                $scope.loadedDesc = pythonProbe[0];
            } else if ( sqlProbe.length > 0 ) {
                $scope.loadedDesc = sqlProbe[0];
            }

            $scope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
                return x.id == $scope.loadedDesc.ownerPluginId;
            })[0];

            if (!$scope.probeConfig.config) {
                $scope.probeConfig.config = {}
            }
            PluginConfigUtils.setDefaultValues($scope.loadedDesc.desc.params, $scope.probeConfig.config);
        }
    };
});

app.directive('pluginCheckConfig', function($filter, PluginConfigUtils) {
    return {
        scope : false,
        restrict : 'A',
        link : function($scope, element, attrs) {
            $scope.checkType = $scope.$eval(attrs.checkType);
            $scope.checkConfig = $scope.$eval(attrs.checkConfig);

            var pythonCheck = $scope.appConfig.customPythonChecks.filter(function(x){
                return x.checkType == $scope.checkType;
            });
            if ( pythonCheck.length > 0 ) {
                $scope.loadedDesc = pythonCheck[0];
            }

            $scope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
                return x.id == $scope.loadedDesc.ownerPluginId;
            })[0];

            if (!$scope.checkConfig.config) {
                $scope.checkConfig.config = {}
            }
            PluginConfigUtils.setDefaultValues($scope.loadedDesc.desc.params, $scope.checkConfig.config);
        }
    };
});

app.directive('probePreview', function(FutureProgressModal, Logger, WT1) {
    return {
        scope : true,
        restrict : 'A',
        link : function($scope, element) {
            $scope.canPreview = $scope.metricsCallbacks.computeProbe != null;
            $scope.previewSettings = { mode: 'PARTITION' };

            var computeProbeForPartition = function (probe, partition) {
                if (!$scope.canPreview) {
                    Logger.error("Computation of individual probes on this object is not possible");
                } else {
                    var allPartitions = $scope.metricsCallbacks.isPartitioned() && partition == null;
                    var partitionId = partition || $scope.metricsCallbacks.getSelectedMetricsPartitionId();
                    var metrics = angular.copy($scope.metrics);
                    metrics.probes = [probe];
                    $scope.computing = true;
                    $scope.computingModalHandle = true;
                    $scope.runResult = null;
                    $scope.runPartitions = null;

                    WT1.event("metrics-preview-probe", {probeType: probe.type});
                    $scope.metricsCallbacks.computeProbe(partitionId, allPartitions, metrics).success(function (data) {
                        $scope.computing = data.jobId;

                        $scope.computingModalHandle = FutureProgressModal.reopenableModal($scope, data, "Computing probe…");
                        $scope.computingModalHandle.promise.then(function (result) {
                                $scope.computing = false;
                                $scope.computingModalHandle = null;
                                var allReports = [];
                                $scope.resultingPartitions = null;
                                $scope.resultingMetrics = null;
                                if (result) {
                                    if (allPartitions) {
                                        $scope.setPartitionListRefreshing({hasResult: true, result: result});
                                        allReports = result.reports;
                                        $scope.resultingPartitions = result.partitionsList;
                                    } else {
                                        allReports = [result];
                                        $scope.resultingMetrics = result.computed;
                                    }
                                    $scope.allRuns = [];
                                    allReports.forEach(function(report) {
                                        $scope.allRuns = $scope.allRuns.concat(report.runs);
                                    });
                                    var errorRuns = $scope.allRuns.filter(_ => !!_.error);
                                    $scope.errorRunsCount = errorRuns.length;
                                    $scope.previewErrorRun = $scope.errorRunsCount > 0 ? errorRuns[0] : null;
                                    $scope.runResult = {startTime: null, endTime: null};
                                    allReports.forEach(function(report) {
                                        $scope.runResult.startTime = $scope.runResult.startTime == null ? report.startTime : Math.min($scope.runResult.startTime, report.startTime);
                                        $scope.runResult.endTime = $scope.runResult.endTime == null ? report.endTime : Math.max($scope.runResult.endTime, report.endTime);
                                    });
                                } else {
                                    // future failed (ex: aborted)
                                    $scope.runResult = false;
                                }
                            }, function(err) {
                                setErrorInScope.bind($scope)(err.data, err.status, err.headers);
                                $scope.computing = false;
                                $scope.runResult = false;
                                $scope.computingModalHandle = null;
                            });
                        $scope.showProgressModal();
                    }).error(function(data, status, headers) {
                        setErrorInScope.bind($scope)(data, status, headers)
                        $scope.computing = false;
                        $scope.runResult = false;
                        $scope.computingModalHandle = null;
                    });
                }
            };

            $scope.computeProbe = function(probe) {
                switch($scope.previewSettings.mode) {
                    case 'ALL':
                        computeProbeForPartition(probe, 'ALL');
                        break;
                    case 'PARTITION':
                        computeProbeForPartition(probe, $scope.previewSettings.partition);
                        break;
                    case 'PARTITIONS':
                        computeProbeForPartition(probe, null);
                        break;
                }
            };

            $scope.showProgressModal = function (jobId) {
                if ($scope.computingModalHandle && $scope.computingModalHandle.open) {
                    $scope.computingModalHandle.open();
                }
            }
        }
    };
});

app.directive('checkPreview', function($filter, WT1, Logger, FutureProgressModal) {
    return {
        scope: true,
        restrict: 'A',
        link: function($scope, element) {
            $scope.canPreview = $scope.metricsCallbacks.runCheck != null;
            $scope.previewSettings = { mode: 'PARTITION' };
            $scope.checking = false;
            var checkCheckForPartition = function(check, partition) {
                if ( !$scope.canPreview ) {
                    Logger.error("Running individual checks on this object is not possible");
                } else {
                    var allPartitions = $scope.metricsCallbacks.isPartitioned() && partition == null;
                    var partitionId = partition || $scope.metricsCallbacks.getSelectedMetricsPartitionId();
                    var metricsChecks = angular.copy($scope.metricsChecks);
                    metricsChecks.checks = [check];
                    $scope.runResult = null;
                    $scope.runPartitions = null;
                    $scope.checking = true;
                    $scope.previewRun = null;
                    $scope.previewRuns = null;
                    WT1.event("checks-preview-check", {checkType: check.type});
                    $scope.metricsCallbacks.runCheck(partitionId, allPartitions, metricsChecks).success(function(data) {
                        $scope.computingModalHandle = FutureProgressModal.reopenableModal($scope, data, "Running check…");
                        $scope.computingModalHandle.promise.then(function(result) {
                                $scope.checking = false;
                                if (result) {
                                    if (allPartitions) {
                                        if (result.reports.length == 0) {
                                            $scope.previewRuns = {notRun: true};
                                        } else {
                                            $scope.previewRuns = {
                                                partitionIds: result.partitionIds,
                                                errors: result.reports.map(r => r.runs).reduce((list, results) => list.concat(results.map(_=> _.error)), [])
                                            };
                                            $scope.previewRuns.errors = $scope.previewRuns.errors.filter(e => e != null)
                                            $scope.previewResults = result.reports.map(r => r.results).reduce((list, results) => list.concat(results), []);
                                        }
                                    } else {
                                        if (!result.runs || !result.runs.length) {
                                            $scope.previewRun = {notRun: true};
                                        } else {
                                            $scope.previewRun = result.runs[0];
                                            $scope.previewResult = result.results.length > 0 ? result.results[0] : null;
                                            $scope.previewResults = result.results;
                                        }
                                    }
                                    $scope.hasCheckErrors = $scope.previewRuns && $scope.previewRuns.errors && $scope.previewRuns.errors.length > 0;
                                    $scope.hasCheckError = $scope.previewRun && $scope.previewRun.error;
                                    $scope.hasCheckErrorOrErrors = $scope.hasCheckError || $scope.hasCheckErrors;
                                    $scope.countError = 0;
                                    $scope.countWarning = 0;
                                    $scope.countOk = 0;
                                    $scope.countEmpty = 0;
                                    if ( $scope.previewResults ) {
                                        $scope.previewResults.forEach(function(result) {
                                            if (result.value.outcome == 'OK') $scope.countOk++;
                                            if (result.value.outcome == 'WARNING') $scope.countWarning++;
                                            if (result.value.outcome == 'ERROR') $scope.countError++;
                                            if (result.value.outcome == 'EMPTY') $scope.countEmpty++;
                                        });
                                    }

                                    $scope.isError = $scope.hasCheckErrorOrErrors || $scope.countError > 0;
                                    $scope.isWarning = !$scope.isError && $scope.countWarning > 0;
                                    $scope.isOk = !$scope.isError && !$scope.isWarning && $scope.countOk > 0;
                                    $scope.isEmpty = !$scope.isError && !$scope.isWarning && !$scope.isOk && $scope.countEmpty > 0;
                                    $scope.isUnknown = !$scope.isError && !$scope.isWarning && !$scope.isOk && !$scope.isEmpty;
                                } else {
                                    // future failed, probably aborted
                                }
                            });
                        $scope.showProgressModal();
                    }).error(function (a,b,c) {
                        $scope.checking = false;
                        $scope.isOk = false;
                        $scope.isError = true;
                        $scope.isWarning = false;
                        setErrorInScope.bind($scope)(a,b,c);
                    });
                }
            };

            $scope.showProgressModal = function (jobId) {
                if ($scope.computingModalHandle && $scope.computingModalHandle.open) {
                    $scope.computingModalHandle.open();
                }
            };

            $scope.checkCheck = function(check) {
                switch($scope.previewSettings.mode) {
                    case 'ALL':
                        checkCheckForPartition(check, 'ALL');
                        break;
                    case 'PARTITION':
                        checkCheckForPartition(check, $scope.previewSettings.partition);
                        break;
                    case 'PARTITIONS':
                        checkCheckForPartition(check, null);
                        break;
                }
            };

            $scope.getResultOutcome = function() {
                return $scope.countError > 0 ? 'ERROR' : ($scope.countWarning > 0 ? 'WARNING' : ($scope.countOk > 0 ? 'OK' : ($scope.countEmpty > 0 ? 'EMPTY' : null)));
            };
        }
    };
});

app.controller("MassMetricSelectionController", function($scope, $timeout) {

    $scope.aggregation = {'all':{},'some':{},'none':{},'disabled':{}};

    $scope.recomputeAggregationStates = function() {
        var cols = $scope.selection.selectedObjects;
        $scope.aggregation = {'all':{},'some':{},'none':{},'disabled':{}};

        angular.forEach(cols, function(column){
            angular.forEach(column.metrics, function(metric) {
                $scope.aggregation.all[metric.aggregated] =
                    ($scope.aggregation.all[metric.aggregated] == undefined ? true : $scope.aggregation.all[metric.aggregated])
                    && (metric.disabled ? false : metric.active);
                $scope.aggregation.some[metric.aggregated] =
                    ($scope.aggregation.some[metric.aggregated] || false)
                    || (metric.disabled ? false : metric.active);
                $scope.aggregation.disabled[metric.aggregated] =
                    ($scope.aggregation.disabled[metric.aggregated] || false)
                    || !metric.disabled;
            });
        });
        for (var agg in $scope.aggregation.all) {
            $scope.aggregation.disabled[agg] = !$scope.aggregation.disabled[agg];
            $scope.aggregation.some[agg] = $scope.aggregation.some[agg] && !$scope.aggregation.all[agg];
            $scope.aggregation.none[agg] = !$scope.aggregation.some[agg] && !$scope.aggregation.all[agg];
        };
    }

    $scope.massAction = function(metricName){
        angular.forEach($scope.selection.selectedObjects, function(col) {
            angular.forEach(col.metrics, function(metric) {
                if (metric.aggregated === metricName && !metric.disabled) {
                    metric.active = $scope.aggregation.all[metricName];
                }
            });
        });
        $scope.aggregation.some[metricName] = false;
        $scope.aggregation.none[metricName] = !$scope.aggregation.all[metricName];
        $scope.regenMetricsSet();
    }

    $timeout(function() {
        $scope.selection.allObjects.forEach(function(e){
            e.$selected = e.metrics[0].active || false;
        });
        $scope.regenSelectionStateFromFlags();
    });

    $scope.setMetricStateFromSelected = function() {
        $scope.selection.allObjects.forEach(function(e){
            e.metrics[0].active = e.$selected || false;
        });
        $scope.regenMetricsSet();
    }

});

app.controller("MassMetricColumnSelectionController", function($scope, $timeout) {

    var aggregated = 'dummy';
    $scope.aggregation = {'all':{},'some':{},'none':{},'disabled':{}};

    $scope.recomputeAggregationStates = function() {
        var cols = $scope.selection.selectedObjects;
        $scope.aggregation = {'all':{},'some':{},'none':{},'disabled':{}};

        angular.forEach(cols, function(column){
            $scope.aggregation.all[aggregated] =
                ($scope.aggregation.all[aggregated] == undefined ? true : $scope.aggregation.all[aggregated])
                && (column.disabled ? false : column.active);
            $scope.aggregation.some[aggregated] =
                ($scope.aggregation.some[aggregated] || false)
                || (column.disabled ? false : column.active);
            $scope.aggregation.disabled[aggregated] =
                ($scope.aggregation.disabled[aggregated] || false)
                || !column.disabled;
        });
        for (var agg in $scope.aggregation.all) {
            $scope.aggregation.disabled[agg] = !$scope.aggregation.disabled[agg];
            $scope.aggregation.some[agg] = $scope.aggregation.some[agg] && !$scope.aggregation.all[agg];
            $scope.aggregation.none[agg] = !$scope.aggregation.some[agg] && !$scope.aggregation.all[agg];
        };
    }

    $timeout(function() {
        $scope.selection.allObjects.forEach(function(e){
            e.$selected = e.active || false;
        });
        $scope.regenSelectionStateFromFlags();
    });

    $scope.setMetricStateFromSelected = function() {
        $scope.selection.allObjects.forEach(function(e){
            e.active = e.$selected || false;
        });
        $scope.regenMetricsSet();
    }

});

})();