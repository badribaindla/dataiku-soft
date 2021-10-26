const ACTIVITY_TYPE_SPARK_PIPELINE = 'SPARK_PIPELINE';
const ACTIVITY_TYPE_SQL_PIPELINE = 'SQL_PIPELINE';

function isPipeline(activity) {
    return [ACTIVITY_TYPE_SPARK_PIPELINE, ACTIVITY_TYPE_SQL_PIPELINE].includes(activity.activityType);
}

(function(){
'use strict';

const app = angular.module('dataiku.flow.runtime', []);

/**
* Simple directive to show the reason why an activity is/was required on a job page
*/
app.directive("activityRequiredReason", function (){
    return {
        scope: {
            activity : "=",
            sentence : '=',
            past : '='
        },
        templateUrl : "/templates/jobs/activity-required-reason.html"
    }
});

app.factory("JobStatusUtils", function(AnyLoc){
    var svc = {
        selectRecipes : function(activity, $element) {
            let recipeNames;
            if (isPipeline(activity)) {
                recipeNames = activity.pipelineRecipes.map(recipe => recipe.recipeName);
            } else {
                recipeNames = [activity.recipeName];
            }
            recipeNames.forEach(recipeName => {
                let elt = $element.find('svg [data-name="' + recipeName + '"][data-type="RECIPE"]')[0];
                d3.select(elt).classed("selected", true);
            })
        },

        statsifyActivity : function(activity, jobStatus) {
            activity.stateOrder =
                {"RUNNING" : -1, "FAILED": 0,  "DONE": 1, "WAITING" : 2,"NOT_STARTED" : 3 }
                [activity.state];

            if (activity.state == 'RUNNING') {
                activity.duration = new Date().getTime() - activity.startTime;
            } else if (activity.endTime > 0) {
                activity.duration = activity.endTime - activity.startTime;
            } else if (activity.startTime > 0 && jobStatus.baseStatus.jobEndTime > 0) {
                activity.duration = jobStatus.baseStatus.jobEndTime - activity.startTime;
            } else {
                activity.duration = 0;
            }
            activity.mainPartition = 'N/A';
            if (activity.targets.length >= 1) {
                var p = activity.targets[0].partition.id;
                if (p != "NP") {
                    activity.mainPartition = p;
                }
            }
            (function () {
                for (var tgtIdx in activity.targets) {
                    var tgt = activity.targets[tgtIdx];
                    if (tgt.type == "SAVED_MODEL") {
                        tgt.smId = AnyLoc.getLocFromFull(tgt.id).localId;
                        tgt.smProjectKey = AnyLoc.getLocFromFull(tgt.id).projectKey;
                    } else if (tgt.type == "MODEL_EVALUATION_STORE") {
                        tgt.mesId = AnyLoc.getLocFromFull(tgt.id).localId;
                        tgt.mesProjectKey = AnyLoc.getLocFromFull(tgt.id).projectKey;
                    } else if (tgt.type == "MANAGED_FOLDER") {
                        tgt.odbId = AnyLoc.getLocFromFull(tgt.id).localId;
                        tgt.odbProjectKey = AnyLoc.getLocFromFull(tgt.id).projectKey;
                    }
                }
            }());
            (function () {
                activity.fwpSources = [];
                activity.fwgpSources = [];
                activity.noneSources = [];
                activity.fwopSources = [];
                for (var srcIdx in activity.sources) {
                    var src = activity.sources[srcIdx];

                    if (src.type == "SAVED_MODEL") {
                        src.smId = AnyLoc.getLocFromFull(src.id).localId;
                        src.smProjectKey = AnyLoc.getLocFromFull(src.id).projectKey;
                    } else if (src.type == "MODEL_EVALUATION_STORE") {
                        src.mesId = AnyLoc.getLocFromFull(src.id).localId;
                        src.mesProjectKey = AnyLoc.getLocFromFull(src.id).projectKey;
                    } else if (src.type == "MANAGED_FOLDER") {
                        src.odbId = AnyLoc.getLocFromFull(src.id).localId;
                        src.odbProjectKey = AnyLoc.getLocFromFull(src.id).projectKey;
                    }

                    if (src.statsType == 'FILES_WITH_PROGRESS') {
                        for (var pidx in src.partitions) {
                            activity.fwpSources.push({
                                id : src.id, type : src.type,
                                'partition': src.partitions[pidx].id,
                                'files': src.partitions[pidx].totalFiles,
                                'bytes': src.partitions[pidx].totalSize,
                                'progress': src.partitions[pidx].readBytes / src.partitions[pidx].totalSize
                            });
                        }
                    } else if (src.statsType == 'FILES_WITH_GLOBAL_PROGRESS') {
                        var srcs = [];
                        var totalSize = 0;
                        for (var pidx in src.partitions) {
                            srcs.push({
                                id : src.id, type : src.type,
                                'partition': src.partitions[pidx].id,
                                'files': src.partitions[pidx].totalFiles,
                                'bytes': src.partitions[pidx].totalSize
                            });
                            totalSize += src.partitions[pidx].totalSize;
                        }
                        for (var srcIdx2 in srcs) {
                            srcs[srcIdx2].progress = src.totalReadBytes / totalSize;
                            activity.fwgpSources.push(srcs[srcIdx2]);
                        }
                    } else if (src.statsType == 'NONE') {
                        for (var pidx in src.partitions) {
                            activity.noneSources.push({
                                id : src.id, type : src.type,
                                'partition': src.partitions[pidx].id
                            });
                        }
                    } else if (src.statsType == 'FILES_WITHOUT_PROGRESS') {
                        for (var pidx in src.partitions) {
                            activity.fwopSources.push({
                                id : src.id, type : src.type,
                                'partition': src.partitions[pidx].id,
                                'files': src.partitions[pidx].totalFiles,
                                'bytes': src.partitions[pidx].totalSize
                            });
                        }
                    }
                }
            }());
        }

    }
    return svc;
});

/** Root directive of the whole status page */
app.directive("jobStatusBase", function(DataikuAPI, $stateParams, $state, Dialogs, Throttle, $rootScope, TopNav, ActivityIndicator, FutureProgressModal, $q, WT1){
    return {
        controller: function ($scope, $element, $timeout) {
            TopNav.setLocation(TopNav.TOP_JOBS, "jobs", TopNav.TABS_JOB, "activities");
            $stateParams.jobId && TopNav.setItem(TopNav.ITEM_JOB, $stateParams.jobId);

            $scope.filter = {};
            $scope.uiState = { isFlowVisible: true };

            $scope.setFlowVisibility = function(toggle) {
                $scope.uiState.isFlowVisible = toggle;
                $rootScope.$broadcast("reflow");
            }

            $scope.retryJob = function () {
                if(!$scope.retrying) {
                    $scope.retrying = true;
                    DataikuAPI.flow.jobs.retry($stateParams.projectKey, $stateParams.jobId).success(function (data) {
                        $state.transitionTo('projects.project.jobs.job', { projectKey:$stateParams.projectKey, jobId: data.id });
                        $scope.retrying = false;
                    }).error(setErrorInScope.bind($scope));
                }
            };

            $scope.abortJob = function () {
                Dialogs.confirm($scope, 'Aborting a job','Are you sure you want to abort this job ?').then(function() {
                    DataikuAPI.flow.jobs.abort($stateParams.projectKey, $stateParams.jobId).success(function(data) {
                        $scope.refreshStatus();
                    }).error(setErrorInScope.bind($scope));
                });
            };

            $scope.downloadJobDiagnosis = function(){
                ActivityIndicator.success("Preparing job diagnosis ...");
                downloadURL(DataikuAPI.flow.jobs.getJobDiagnosisURL($stateParams.projectKey, $stateParams.jobId));
            }

            $scope.setYarnLogsPerActivityId = function(result) {
                $scope.yarnLogs = {};
                if (result) {
                    result.forEach(function(yarnLog) {
                        $scope.yarnLogs[yarnLog.activityId] = $scope.yarnLogs[yarnLog.activityId] || [];
                        $scope.yarnLogs[yarnLog.activityId].push(yarnLog.yarnAppId);
                    });
                }
            };
            
            $scope.setK8SLogsPerActivityId = function(result) {
                $scope.k8sLogs = {};
                if (result) {
                    result.forEach(function(k8sLog) {
                        $scope.k8sLogs[k8sLog.activityId] = $scope.k8sLogs[k8sLog.activityId] || [];
                        $scope.k8sLogs[k8sLog.activityId].push(k8sLog.podName);
                    });
                }
            };
            
            $scope.fetchYarnLogs = function(){
                DataikuAPI.flow.jobs.fetchYarnLogs($stateParams.projectKey, $stateParams.jobId).success(function(data){
                    FutureProgressModal.show($scope, data, "Fetch Yarn logs").then(function(result){
                        if (result) { // undefined in case of abort
                            $scope.setYarnLogsPerActivityId(result)
                        }
                    });
                }).error(setErrorInScope.bind($scope));
            }

            $scope.hooks = { saveUIState : function(){} }

            $scope.refreshStatus = function () {
                var deferred = $q.defer();
                $scope.hooks.saveUIState();

                DataikuAPI.flow.jobs.getJobStatus($stateParams.projectKey, $stateParams.jobId).success(function (data) {
                    $scope.jobState = data.baseStatus.state;
                    $scope.jobDef = data.baseStatus.def;
                    $scope.jobDef.stepRun = data.stepRun;
                    $scope.setYarnLogsPerActivityId(data.yarnLogs)
                    $scope.setK8SLogsPerActivityId(data.k8sLogs)
                    $scope.setJobStatusData(data);

                    $timeout(function() { $rootScope.$broadcast("reflow"); }, 20);
                    deferred.resolve("updated");
                }).error(function (a,b,c) {
                    setErrorInScope.bind($scope)(a,b,c);
                    deferred.reject("not updated");
                });
                return deferred.promise;
            };

            var autoRefresh = Throttle().withScope($scope).withDelay(6000).wrap(function(force) {
                if (force || !$scope.jobState || $scope.jobState == "RUNNING" || $scope.jobState == "COMPUTING_DEPS") {
                    $scope.refreshStatus().then(function() { autoRefresh() ;}); // don't re-enqueue a status update until the current one is done
                }
            });

            autoRefresh();

            $scope.clearJobLogs = function(jobId = $stateParams.jobId) {

                if (!jobId) { return; }
        
                const title = 'Confirm logs deletion';
                const message = 'Are you sure you want to clear the logs for this job?';
        
                Dialogs.confirm($scope, title, message)
                    .then(() => {
                        WT1.event('job-delete', { modelBenchId : jobId });
                        DataikuAPI.flow.jobs
                            .clearLogs($stateParams.projectKey, jobId)
                            .success($scope.refreshStatus)
                            .error(setErrorInScope.bind($scope));
                    });
            };

            var jobStatusBaseStatusActivities = null;
            var jobStatusBaseStatusJobAllActivities = null;
            var jobStatusBaseStatusJobBeforePruneAllActivities = null;
            $scope.disabledActivities = [];

            $scope.setJobStatusData = function(data) {
            	$scope.elapsedTime = data && data.baseStatus ? (new Date().getTime()) - data.baseStatus.jobStartTime : 0;
                if (data == null) {
                    jobStatusBaseStatusActivities = null;
                    jobStatusBaseStatusJobAllActivities = null;
                    jobStatusBaseStatusJobBeforePruneAllActivities = null;
                    $scope.jobStatus = null;
                } else {
                    if (!data.baseStatus) {
                        jobStatusBaseStatusActivities = null;
                        jobStatusBaseStatusJobAllActivities = null;
                        jobStatusBaseStatusJobBeforePruneAllActivities = null;
                    } else {
                        jobStatusBaseStatusActivities = data.baseStatus.activities;
                        // a bit of fixup
                        angular.forEach(jobStatusBaseStatusActivities, function(activity, activityName) {
                            // the 'classic' bug-report generating glitch: when a job is aborted
                            // by a DSS restart, then the job is properly in ABORTED state but some
                            // activities are still in RUNNING and appear as such in the UI (blinking).
                            // so we set them to ABORTED so that the user is not confused
                            if (data.baseStatus.state == 'ABORTED' && activity.state == 'RUNNING') {
                                activity.state = 'ABORTED';
                            }
                        });
                        data.baseStatus.activities = null;
                        if (!data.baseStatus.job) {
                            jobStatusBaseStatusJobAllActivities = null;
                        } else {
                            jobStatusBaseStatusJobAllActivities = data.baseStatus.job.allActivities;
                            data.baseStatus.job.allActivities = null;
                        }
                        if (!data.baseStatus.jobBeforePrune) {
                            jobStatusBaseStatusJobBeforePruneAllActivities = null;
                        } else {
                            jobStatusBaseStatusJobBeforePruneAllActivities = data.baseStatus.jobBeforePrune.allActivities;
                            data.baseStatus.jobBeforePrune.allActivities = null;
                        }
                    }
                    $scope.jobStatus = data;
                }
            };

            $scope.validateRun = function() {
                DataikuAPI.flow.jobs.validateRunFully($stateParams.projectKey, $stateParams.jobId,
                    $scope.disabledActivities).success(function(data) {
                    autoRefresh(true);
                }).error(setErrorInScope.bind($scope));
            }

            $scope.getJobActivities = function() {
                return jobStatusBaseStatusActivities || {};
            };
            $scope.getJobAllActivities = function() {
                return jobStatusBaseStatusJobAllActivities || {};
            };
            $scope.getJobBeforePruneAllActivities = function() {
                return jobStatusBaseStatusJobBeforePruneAllActivities || {};
            };
            $scope.getInJobActivities = function(activityId) {
                return $scope.getJobActivities()[activityId];
            };
            $scope.getInJobAllActivities = function(activityId) {
                return $scope.getJobAllActivities()[activityId];
            };
            $scope.getInJobBeforePruneAllActivities = function(activityId) {
                return $scope.getJobBeforePruneAllActivities()[activityId];
            };
        }
    }
});

/** Directive for status page of a running or finished job (ie, after compute) */
app.directive('jobStatusRegular', function(Assert, DataikuAPI, $stateParams, $state,Dialogs, $location, TopNav, $rootScope, Debounce, $filter, JobStatusUtils, CreateModalFromTemplate) {
    return {
        controller: function ($scope, $element, $timeout) {
            $scope.logOptions = { compactLog : true};
            $scope.jobTotalEndedActivities = 0;

            if ($state.params.hideFlow === 'true') {
                $scope.uiState.isFlowVisible = false;
            }

            $scope.selectActivity = function(activity) {
                activity = $scope.activitiesFatTable.find(activityFatTable => activityFatTable.activityId === activity.activityId);
                if (!activity) { return; }
                $scope.selectedActivity = activity;
                $scope.smartTail();
                $scope.unhighlightActivities();
                d3.selectAll($element.find('svg .selected')).classed("selected", false);
                JobStatusUtils.selectRecipes(activity, $element);
            };

            $scope.hoverActivity = function(activity) {
                JobStatusUtils.selectRecipes(activity, $element);
            };

            $scope.unhoverActivity = function() {
                d3.selectAll($element.find('svg .selected')).classed("selected", false);
            };

            $scope.highlightActivity = function(activity) {
                let retrievedActivity = $scope.activitiesFatTable.filter(activityFatTable => activityFatTable.activityId === activity.activityId)[0];
                if (retrievedActivity) {
                    retrievedActivity.highlighted = true;
                }
            };

            $scope.unhighlightActivities = function() {
                $scope.activitiesFatTable.forEach(activityFatTable => activityFatTable.highlighted = false);
            };

            $scope.getActivitiesByDatasetName = function(datasetName) {
                if (!$scope.activitiesFatTable) { return; }
                return Object.values($scope.activitiesFatTable).filter(activity => {
                    let isTarget = activity.targets.filter(target => {
                        return target.datasetName === datasetName;
                    }).length > 0;
                    return isTarget;
                });
            };

            $scope.getActivitiesByRecipeName = function(recipeName) {
                if (!$scope.activitiesFatTable) { return; }
                return Object.values($scope.activitiesFatTable).filter(activity => {
                    return activity.recipeName == recipeName;
                });
            };

            /* Handle filter/sort of activities table */
            $scope.sortBy = [
                { 'value': 'stateOrder', 'label': 'Status' },
                { 'value': 'recipeName', 'label': 'Recipe' },
                { 'value': 'output', 'label': 'Output' },
                { 'value': 'startTime', 'label': 'Start Time' },
                { 'value': 'endTime', 'label': 'End Time' },
                { 'value': 'duration', 'label': 'Duration'}
            ];
            var rebuildActivitiesList = function() {
                $scope.activitiesFatTable = filterSortLimitTagsAndQ(
                    $filter,
                    $scope.activitiesFlat,
                    { q : $scope.filter.activities },
                    {
                        column : [$scope.order.column, 'partialExecutionOrder', 'activityId'],
                        reverse : $scope.order.reverse
                    },
                    2000000).formatted;

                $scope.totalFailedActivities = 0;
                $scope.totalDoneActivities = 0;
                $scope.totalWarningActivities = 0;
                $scope.totalAbortedActivities = 0;
                $scope.totalNotStartedActivities = 0;
                $scope.totalRunningActivities = 0;

                for (let i = 0; i < $scope.activitiesFatTable.length; i++) {
                    let activity = $scope.activitiesFatTable[i];

                    switch(activity.state) {
                        case 'FAILED':
                            $scope.totalFailedActivities++;
                        break;
                        case 'DONE':
                            if (activity.warnings.totalCount > 0) {
                                $scope.totalWarningActivities++;
                            } else {
                                $scope.totalDoneActivities++;
                            }
                        break;
                        case 'ABORTED':
                            $scope.totalAbortedActivities++;
                        break;
                        case 'SKIPPED':
                            $scope.totalAbortedActivities++;
                        break;
                        case 'NOT_STARTED':
                            $scope.totalNotStartedActivities++;
                        break;
                        case 'RUNNING':
                            $scope.totalRunningActivities++;
                        break;
                    }
                }
            }
            var rebuildActivitiesListDebounced = Debounce().withScope($scope).withDelay(10,200).wrap(rebuildActivitiesList);
            $scope.order = { column : "stateOrder" }
            $scope.$watch("order", rebuildActivitiesListDebounced, true);
            $scope.$watch("filter.activities", rebuildActivitiesListDebounced);

            $scope.onJobStatusUpdate = function() {

                TopNav.setItem(TopNav.ITEM_JOB, $stateParams.jobId, { name: $scope.jobStatus.baseStatus.def.name });
                
                $scope.activitiesFlat = $.map($scope.getJobActivities(), function(v, k) {
                    return v;
                });

                if (!$scope.jobStatus.removed) {
                    $scope.jobTotalWarningsCount = 0;
                    $scope.jobTotalEndedActivities = 0;

                    // Put an order on activity state
                    $.each($scope.activitiesFlat, function(idx, activity){
                        JobStatusUtils.statsifyActivity(activity, $scope.jobStatus);
                        if (activity.warnings) {
                            $scope.jobTotalWarningsCount += activity.warnings.totalCount;
                        }

                        if (activity.state !== 'NOT_STARTED' && activity.state !== 'RUNNING') {
                            $scope.jobTotalEndedActivities++;
                        }
                    });

                    rebuildActivitiesList();

                    /* If no activity selected yet, select the first OR the one pre-selected */
                    if (!$scope.selectedActivity) {
                        if ($rootScope.preSelectedActivity) {
                            $scope.selectActivity($rootScope.preSelectedActivity);
                            $rootScope.preSelectedActivity = null;
                        } else {
                            if ($scope.jobStatus.globalState.failed > 0) {
                                Assert.inScope($scope, 'activitiesFatTable');
                                for (let i = 0; i < $scope.activitiesFatTable.length; i++) {
                                    if ($scope.activitiesFatTable[i].state =="FAILED") {
                                        $scope.selectActivity($scope.activitiesFatTable[0]);
                                        break;
                                    }
                                }
                            } else if($scope.activitiesFlat.length) {
                                $scope.selectActivity($scope.activitiesFatTable[0]);
                            }
                        }

                    } else {
                        // "Re-select" it to update state
                        var previousId = $scope.selectedActivity.activityId;
                        $scope.selectedActivity = null;
                        for (let i = 0; i < $scope.activitiesFlat.length; i++) {
                            if ($scope.activitiesFlat[i].activityId == previousId) {
                                $scope.selectActivity($scope.activitiesFlat[i]);
                                break;
                            }
                        }
                        $scope.smartTail();
                    }
                    $scope.activityStats = {}
                    $scope.activityStats.runningRatio = $scope.jobStatus.globalState.running / $scope.jobStatus.globalState.total;
                    $scope.activityStats.not_startedRatio = $scope.jobStatus.globalState.notStarted / $scope.jobStatus.globalState.total;
                    $scope.activityStats.doneRatio = $scope.jobStatus.globalState.done / $scope.jobStatus.globalState.total;
                    $scope.activityStats.failedRatio = $scope.jobStatus.globalState.failed / $scope.jobStatus.globalState.total;
                }

                $timeout(function() { $rootScope.$broadcast("reflow"); });
            }

            $scope.$watch("jobStatus", function(nv, ov) {
                if (!nv) return;
                $scope.onJobStatusUpdate();
            }, true);

            var UIState = {};
            $scope.smartTail = function() {
                var saveLogState = function() {
                    var logPre = $('#logTailPre')[0];
                    UIState.logScroll = null;
                    UIState.logScrollFollow = false;
                    if(logPre) {
                        UIState.logScroll = logPre.scrollTop;
                        UIState.logScrollFollow = (logPre.scrollTop>=logPre.scrollHeight-logPre.clientHeight);
                    }
                };
                // It is very important to reapply changes AFTER the angular digest cycle
                var applyLogState = function() {
                    $timeout(function() {
                        var logPre = $('#logTailPre')[0];
                        if(UIState.logScroll != undefined && logPre) {
                            if(UIState.logScrollFollow) {
                                logPre.scrollTop = logPre.scrollHeight-logPre.clientHeight;
                            } else {
                                logPre.scrollTop = UIState.logScroll;
                            }
                        }
                    },0);
                };
                saveLogState();

                if ($scope.selectedActivity.state !== 'NOT_STARTED') {
                    DataikuAPI.flow.jobs.smartTailActivityLog($stateParams.projectKey, $stateParams.jobId, $scope.selectedActivity.activityId, 500).success(function (data) {
                        $scope.logTail = smartLogTailToHTML(data, $scope.logOptions.compactLog);
                        applyLogState();
                    }).error(function(data){
                        $scope.logTail = '';
                        applyLogState();
                    });
                }
            };

            $scope.showSummary = function() {
                $scope.closeContextualMenus();
                CreateModalFromTemplate("/templates/jobs/activity-summary-modal.html", $scope, null, function(modalScope){
                    modalScope.selectedActivity = $scope.selectedActivity;
                });
            };
        }
    };
});


/** Base directive for status page of a job in preview */
app.directive("jobPreview", function(Assert, DataikuAPI, $stateParams, $timeout, $rootScope, Debounce, $filter, TopNav, JobStatusUtils) {
    return {
        scope: true,
        controller: function($scope, $element){
            $scope.focusOnSelectedItem = function() {
                Assert.inScope($scope, 'selectedItemData');
                $scope.filter.activities = $scope.selectedItemData.uiFilterExpr;
                $scope.topNav.tab = "activities";
            };

            $scope.selectedItemData = {};

            $scope.$watch("jobStatus", function(nv, ov) {
                if (!nv) return;
                TopNav.setItem(TopNav.ITEM_JOB, $stateParams.jobId, {name: $scope.jobStatus.baseStatus.def.name});
                if ($scope.jobState == "WAITING_CONFIRMATION") {
                    DataikuAPI.flow.jobs.getPreviewResult($stateParams.projectKey, $stateParams.jobId).success(function(data){
                        $scope.jobPreviewResult = data;
                        $.each($scope.getJobPreviewAllActivities(), function(k, v){
                            $.each(v.targets, function(k2, v2) {
                                v.mainPartition = v2.partitionId;
                            });
                            if (v.mainPartition == 'NP') v.mainPartition = null;
                            var activityInJobStatus = $scope.getInJobActivities(k);
                            if (activityInJobStatus) {
                                v.activityType = activityInJobStatus.activityType;
                                v.pipelineRecipes = activityInJobStatus.pipelineRecipes;
                            }
                        });
                        $scope.jobPreviewResultFlat = $.map($scope.getJobPreviewAllActivities(), function(v, k){
                            return v;
                        });
                        rebuildActivitiesList();
                    })
                }
                $timeout(function() {$rootScope.$broadcast("reflow");},20);
            }, true);


            $scope.sortBy = [
                {'value': 'recipeName', 'label': 'Recipe' },
                {'value': 'targets[0].datasetName','label': 'Output dataset'},
                {'value': 'mainPartition','label': 'Output partition'}
            ];
            var rebuildActivitiesList = Debounce().withScope($scope).withDelay(10,200).wrap(function() {
                $scope.jobPreviewResultTable = filterSortLimitTagsAndQ($filter,
                    $scope.jobPreviewResultFlat, { q : $scope.filter.activities},
                    {
                        column : [$scope.order.column, 'partialExecutionOrder', 'activityId'],
                        reverse : $scope.order.reverse
                    },
                    20000000).formatted;
                if (!$scope.selectedActivity && $scope.jobPreviewResultTable.length) {
                    $scope.selectActivity($scope.jobPreviewResultTable[0]);
                }
            });
            $scope.order = { column : "recipeName" }
            $scope.$watch("order", rebuildActivitiesList, true);
            $scope.$watch("filter.activities", rebuildActivitiesList);
            rebuildActivitiesList();

            $scope.disableActivity = function(activity) {
                if ($scope.disabledActivities.indexOf(activity.activityId) < 0) {
                    $scope.disabledActivities.push(activity.activityId);
                }
                // recursively disable depending activities
                $.each($scope.jobPreviewResultTable, function(idx, activity2) {
                    if (!$scope.disabledActivities.includes(activity2.activityId)
                        && activity2.dependencies.includes(activity.activityId)) {
                            $scope.disableActivity(activity2, true);
                    }
                });
            }
            $scope.enableActivity = function(activity) {
                removeFirstFromArray($scope.disabledActivities, activity.activityId);
                // recursively enable dependencies.
                $.each(activity.dependencies, function(idx, depId) {
                    $scope.enableActivity($scope.getInJobPreviewAllActivities(depId));
                });
            }

            $scope.selectActivity = function(activity) {
                activity = $scope.jobPreviewResultTable.find(activityFatTable => activityFatTable.activityId === activity.activityId);
                if (!activity) { return; }
                $scope.selectedActivity = activity;
                $scope.unhighlightActivities();
                d3.selectAll($element.find('svg .selected')).classed("selected", false);
                JobStatusUtils.selectRecipes(activity, $element);
                let activityIndex = $scope.jobPreviewResultTable.findIndex(jobPreviewActivity => jobPreviewActivity.activityId === activity.activityId);
                $scope.$broadcast('scrollToLine', activityIndex);
            };

            $scope.highlightActivity = function(activity) {
                let retrievedActivity = $scope.jobPreviewResultTable.filter(jobPreviewActivity => jobPreviewActivity.activityId === activity.activityId)[0];
                if (retrievedActivity) {
                    retrievedActivity.highlighted = true;
                }
            };

            $scope.unhighlightActivities = function() {
                $scope.jobPreviewResultTable.forEach(jobPreviewActivity => jobPreviewActivity.highlighted = false);
            };

            $scope.showEnableActivity = function(activityId) {
                return $scope.disabledActivities.includes(activityId);
            }

            $scope.getActivitiesByDatasetName = function (datasetName) {
                if (!$scope.jobPreviewResultTable) { return; }
                return Object.values($scope.jobPreviewResultTable).filter(activity => {
                    let isTarget = activity.targets.filter(target => {
                        return target.datasetName === datasetName;
                    }).length > 0;
                    return isTarget;
                });
            };

            $scope.getActivitiesByRecipeName = function (recipeName) {
                if (!$scope.jobPreviewResultTable) { return; }
                return Object.values($scope.jobPreviewResultTable).filter(activity => {
                    return activity.recipeName == recipeName;
                });
            };

            let activitiesForRecipeName = function(recipeName) {
                let result = [];
                $.each($scope.getJobPreviewAllActivities(), function (activityId, activity) {
                    if (activityIncludesRecipe(activity, recipeName)) {
                        result.push(activity);
                    }
                });
                return result;
            };

            let activityIncludesRecipe = function(activity, recipeName) {
                return activity.recipes.map(recipe => recipe.name).includes(recipeName)
                    // For backward compatibility with jobs created by a version of DSS before 4.1.2
                    || (activity.recipeName && activity.recipeName === recipeName);
            };

            $scope.nbDisabledForRecipe = function(recipeName) {
                return $scope.disabledActivities
                    .map(activityId => $scope.getInJobPreviewAllActivities(activityId))
                    .filter(activity => activityIncludesRecipe(activity, recipeName))
                    .length;
            };
            $scope.getDisabledStateForRecipe = function(recipeName) {
                let disabled = $scope.nbDisabledForRecipe(recipeName);
                if (disabled === 0) {
                    return "recipe-enabled";
                }

                let total = activitiesForRecipeName(recipeName).length;
                if (disabled === total) {
                    return "recipe-disabled";
                }
                return "recipe-partial";
            };

            // TODO: Should use full recipe id !!
            $scope.disableAllForRecipe = function(recipeName){
                activitiesForRecipeName(recipeName).forEach($scope.disableActivity);
            };
            $scope.enableAllForRecipe = function(recipeName){
                activitiesForRecipeName(recipeName).forEach($scope.enableActivity);
            };

            $scope.getJobPreviewAllActivities = function() {
                if (!$scope.jobPreviewResult) return {};
                if (!$scope.jobPreviewResult.job) return {};
                if (!$scope.jobPreviewResult.job.allActivities) return {};
                return $scope.jobPreviewResult.job.allActivities;
            };
            $scope.getJobPreviewBeforePruneAllActivities = function() {
                if (!$scope.jobPreviewResult) return {};
                if (!$scope.jobPreviewResult.jobBeforePrune) return {};
                if (!$scope.jobPreviewResult.jobBeforePrune.allActivities) return {};
                return $scope.jobPreviewResult.jobBeforePrune.allActivities;
            };
            $scope.getInJobPreviewAllActivities = function(activityId) {
                return $scope.getJobPreviewAllActivities()[activityId];
            };
            $scope.getInJobPreviewBeforePruneAllActivities = function(activityId) {
                return $scope.getJobPreviewBeforePruneAllActivities()[activityId];
            };

        }

    }
});

/** Base directive for preview of clicked job in jobs list page */
app.directive("clickedJobPreview", function($state, $rootScope) {
    return {
        controller: function ($scope) {

            var jobStatusBaseStatusActivities = null;
            var jobStatusBaseStatusJobAllActivities = null;
            var jobStatusBaseStatusJobBeforePruneAllActivities = null;
            $scope.setJobStatusData = function(data) {
            	$scope.elapsedTime = data && data.baseStatus ? (new Date().getTime()) - data.baseStatus.jobStartTime : 0;
                if (data == null) {
                    jobStatusBaseStatusActivities = null;
                    jobStatusBaseStatusJobAllActivities = null;
                    jobStatusBaseStatusJobBeforePruneAllActivities = null;
                    $scope.jobStatus = null;
                } else {
                    if (!data.baseStatus) {
                        jobStatusBaseStatusActivities = null;
                        jobStatusBaseStatusJobAllActivities = null;
                        jobStatusBaseStatusJobBeforePruneAllActivities = null;
                    } else {
                        jobStatusBaseStatusActivities = data.baseStatus.activities;
                        // a bit of fixup
                        angular.forEach(jobStatusBaseStatusActivities, function(activity, activityName) {
                            // the 'classic' bug-report generating glitch: when a job is aborted
                            // by a DSS restart, then the job is properly in ABORTED state but some
                            // activities are still in RUNNING and appear as such in the UI (blinking).
                            // so we set them to ABORTED so that the user is not confused
                            if (data.baseStatus.state == 'ABORTED' && activity.state == 'RUNNING') {
                                activity.state = 'ABORTED';
                            }
                        });
                        data.baseStatus.activities = null;
                        if (!data.baseStatus.job) {
                            jobStatusBaseStatusJobAllActivities = null;
                        } else {
                            jobStatusBaseStatusJobAllActivities = data.baseStatus.job.allActivities;
                            data.baseStatus.job.allActivities = null;
                        }
                        if (!data.baseStatus.jobBeforePrune) {
                            jobStatusBaseStatusJobBeforePruneAllActivities = null;
                        } else {
                            jobStatusBaseStatusJobBeforePruneAllActivities = data.baseStatus.jobBeforePrune.allActivities;
                            data.baseStatus.jobBeforePrune.allActivities = null;
                        }
                    }
                    $scope.jobStatus = data;
                }
            };

            $scope.getJobActivities = function() {
                return jobStatusBaseStatusActivities || {};
            };
            $scope.getJobAllActivities = function() {
                return jobStatusBaseStatusJobAllActivities || {};
            };
            $scope.getJobBeforePruneAllActivities = function() {
                return jobStatusBaseStatusJobBeforePruneAllActivities || {};
            };
            $scope.getInJobActivities = function(activityId) {
                return $scope.getJobActivities()[activityId];
            };
            $scope.getInJobAllActivities = function(activityId) {
                return $scope.getJobAllActivities()[activityId];
            };
            $scope.getInJobBeforePruneAllActivities = function(activityId) {
                return $scope.getJobBeforePruneAllActivities()[activityId];
            };
            $scope.goToActivity = function(activity) {
                const job = $scope.selection.selectedObject;
                $rootScope.preSelectedActivity = activity;
                $state.go('projects.project.jobs.job', {'jobId': job.def.id });
            };
        }
    }
});
})();

(function(){
'use strict';

var app = angular.module('dataiku.controllers');

app.controller('FlowJobsBrowserController', function($scope, WT1, $stateParams, $state, DataikuAPI, Dialogs,
    $controller, $location, Notification, TopNav, Throttle, JobStatusUtils, $filter, $element) {

    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});

    TopNav.setLocation(TopNav.TOP_JOBS, "jobs", TopNav.TABS_NONE, null);
    TopNav.setNoItem();

    $scope.maxDisplayedItems = 0;
    $scope.statusLabel = 'Any status';
    $scope.userLabel = 'All users'
    $scope.isJobsList = true;
    $scope.noWatch = true;
    $scope.noStar = true;
    $scope.noDelete = true;
    $scope.noTags = true;
    $scope.listItems;
    $scope.queryFilters = {
        status: '',
        user: '',
        search: ''
    }

    if ($scope.isDSSAdmin()) {
        DataikuAPI.admin.users.list().success(function(data) {
            $scope.users = data;
        }).error(setErrorInScope.bind($scope));
    }

    /* List common stuff */
    $scope.sortBy = [
        { value: '-def.initiationTimestamp', label: 'Newest' },
        { value: 'def.initiationTimestamp', label: 'Oldest' },
        { value: 'state', label: 'Status' },
        { value: 'def.initiator', label: 'User A to Z' },
        { value: '-def.initiator', label: 'User Z to A' },
        { value: '-(endTime - startTime)', label: 'Longest' },
        { value: 'endTime - startTime', label: 'Shortest' }
    ];

    $scope.sortCookieKey = 'jobs';
    $scope.maxItems = 40;

    $scope.list = function() {
        resetErrorInScope($scope);
          DataikuAPI.flow.jobs.listLastJobs($stateParams.projectKey, 100).success(function (data) {
            $scope.listItems = data;
            let now = Date.now();
            $scope.listItems.forEach(function(item) {
                item.timeSinceInitiation = now - item.def.initiationTimestamp;
                item.partitionsCount = 0;
                item.datasetsCount = 0;
                item.def.outputs.forEach(function(output) {
                    if (output.targetPartition) {
                        item.partitionsCount++;
                    }
                    if (output.targetDataset) {
                        item.datasetsCount++;
                    }
                });
                // Adding warning status on UX side
                if (item.warningsCount > 0) {
                    item.stateTitle = item.state + ' WITH WARNINGS';
                } else {
                    item.stateTitle = item.state;
                }
            });

            $scope.$broadcast("clearMultiSelect");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.selection = $.extend({
        filterParams: {
            userQueryTargets: ["def.name", "state"],
            propertyRules: { name:"def.name", recipe:"def.recipe" }
        },
        orderQuery: $scope.sortBy[0].value,
        orderReversed: false,
        customFilterWatch: "queryFilters",
    }, $scope.selection || {});

    $scope.list();

    $scope.$on("$destroy", Notification.registerEvent("job-state-change", Throttle().withScope($scope).withDelay(10000).wrap(function() {
        $scope.list();
    })));

    $scope.isFiltering = function () {
        return $scope.queryFilters.search.length > 0 || $scope.queryFilters.status.length > 0 || $scope.queryFilters.user.length > 0;
    }

    $scope.resetFilters = function() {
        $scope.setStatusFilter('', 'Any status');
        $scope.setUserFilter('', 'All users');
        $scope.setSearchFilter('');
        $scope.selection.filteredObjects = $scope.listItems;
    }

    $scope.filterJobsList = function () {

        if (!$scope.selection) {
            return;
        }

        $scope.selection.allObjects = $scope.listItems || [];

        if (!$scope.selection.allObjects) {
            $scope.selection.allObjects = [];
            $scope.selection.loaded = false;
        } else {
            $scope.selection.loaded = true;
        }

        if ($scope.selection.allObjects.constructor !== Array) {
            $scope.selection.allObjects = $.map($scope.selection.allObjects, function(v,k) {v._name=k; return [v]});
        }

        $scope.selection.allObjects.forEach(function (c, i) {
            c.$idx = i;
        });

        // Filtering on full text query
        let filteredJobsList = $scope.selection.allObjects;

        // Filtering on users
        if ($scope.queryFilters.user && $scope.queryFilters.user.length) {
            filteredJobsList = $.grep(filteredJobsList, function(item) {
                return item.def.initiator === $scope.queryFilters.user;
            });
        }

        if ($scope.queryFilters.status && $scope.queryFilters.status.length) {
            filteredJobsList = $.grep(filteredJobsList, function(item) {
                return $scope.queryFilters.status === item.stateTitle;
            });
        }

        if ($scope.queryFilters.search && $scope.queryFilters.search.length) {
            filteredJobsList = $.grep(filteredJobsList, function(item) {
                return item.def.name.toLowerCase().indexOf($scope.queryFilters.search.toLowerCase()) > -1
                || (item.def.outputs && item.def.outputs[0] && item.def.outputs[0].targetDataset.toLowerCase().indexOf($scope.queryFilters.search.toLowerCase()) > -1)
                || (item.def.outputs && item.def.outputs[0] && item.def.outputs[0].targetPartition && item.def.outputs[0].targetPartition.toLowerCase().indexOf($scope.queryFilters.search.toLowerCase()) > -1);
            });
        }

        return filteredJobsList;
    }

    $scope.selection.customFilter = $scope.filterJobsList;

    $scope.setStatusFilter = function (status, statusLabel) {
        $scope.queryFilters.status = status;
        $scope.statusLabel = statusLabel;
    }

    $scope.setUserFilter = function (user, userLabel) {
        $scope.queryFilters.user = user;
        $scope.userLabel = userLabel;
    }

    $scope.handleJobStatusChange = function(evtType, message) {
        $.grep($scope.jobs, function(job) {
            return job.def.id == message.jobId;
        }).map(function(job) {
            if (job.attempts[0]) {
                if (job.attempts[0]) {
                    job.attempts[0].state = message.state;
                }
            }
        });
    };

    var jobStatusBaseStatusActivities = null;
    $scope.setJobStatusData = function(data) {
    	$scope.elapsedTime = data && data.baseStatus ? (new Date().getTime()) - data.baseStatus.jobStartTime : 0;
        if (data == null) {
            jobStatusBaseStatusActivities = null;
            $scope.jobStatus = null;
        } else {
            if (!data.baseStatus) {
                jobStatusBaseStatusActivities = null;
            } else {
                jobStatusBaseStatusActivities = data.baseStatus.activities;
                data.baseStatus.activities = null;
                if (data.baseStatus.job) {
                    data.baseStatus.job.allActivities = null;
                }
                if (data.baseStatus.jobBeforePrune) {
                    data.baseStatus.jobBeforePrune.allActivities = null;
                }
            }
            $scope.jobStatus = data;
        }
    };

    $scope.getJobActivities = function() {
        return jobStatusBaseStatusActivities || {};
    };
    $scope.getInJobActivities = function(activityId) {
        return $scope.getJobActivities()[activityId];
    };

    $scope.$stateParams = $stateParams;
    $scope.jobs = undefined;
    $scope.currentJob = undefined;
    $scope.setJobStatusData(undefined);

    $scope.clearListWithConfirmation = function(filter) {
        var title = 'Clear failed jobs';
        var msg = 'Are you sure you want to clear logs for all failed jobs? Note: this only removes job logs, not the jobs themselves.';
        if(filter == 'finished') {
            title = 'Clear finished jobs';
            msg = 'Are you sure you want to clear logs for all finished jobs? Note: this only removes job logs, not the jobs themselves.';
        }
        Dialogs.confirm($scope, title, msg).then(function() {
            $scope.clearList(filter);
        });
    };

    $scope.clearList = function(filter) {
        DataikuAPI.flow.jobs.clearLogsWithFilter($stateParams.projectKey,filter).success(function(data) {
            $scope.list();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.viewJob = function (job) {
        $state.transitionTo('projects.project.jobs.job', { 'id': job.def.id });
    };

    $scope.filter = {}
    $scope.order = { column : "stateOrder" }
    var rebuildActivitiesList = function(activitiesFlat) {
        $scope.activitiesFatTable = filterSortLimitTagsAndQ(
            $filter,
            activitiesFlat,
            { q : $scope.filter.activities},
            {
                column : [$scope.order.column, 'partialExecutionOrder', 'activityId'],
                reverse : $scope.order.reverse
            },
            2000000).formatted;
    }

    var setJobStatus = function(jobId) {
        DataikuAPI.flow.jobs.getJobStatus($stateParams.projectKey, jobId).success(function (data) {
            $scope.setJobStatusData(data);
            var activitiesFlat = [];
            for (var actId in $scope.getJobActivities()) {
                if (!$scope.getJobActivities().hasOwnProperty(actId)) {
                    continue;
                }
                var activity = $scope.getInJobActivities(actId);
                if (activity.warnings) {
                    $scope.jobStatus.warningsCount += activity.warnings.totalCount;
                }
                if (activity.state == 'RUNNING') {
                    activity.duration = new Date().getTime() - activity.startTime;
                } else if (activity.endTime > 0) {
                    activity.duration = activity.endTime - activity.startTime;
                } else if (activity.startTime > 0 && $scope.jobStatus.baseStatus.jobEndTime > 0) {
                    activity.duration = $scope.jobStatus.baseStatus.jobEndTime - activity.startTime; // probably aborted
                } else {
                    activity.duration = 0;
                }
                activitiesFlat.push(activity);
            }
            $.each(activitiesFlat, function(idx, activity){
                JobStatusUtils.statsifyActivity(activity, $scope.jobStatus);
            });
            rebuildActivitiesList(activitiesFlat);
        }).error(setErrorInScope.bind($scope));
    }

    $scope.$watch('job',function(nv) {
        if (!nv) return;
        setJobStatus(nv.def.id);
    });

    $scope.selectActivity = function(activity) {
        activity = $scope.activitiesFatTable.find(activityFatTable => activityFatTable.activityId === activity.activityId);
        if (!activity) { return; }
        $scope.selectedActivity = activity;
        $scope.unhighlightActivities();
        d3.selectAll($element.find('svg .selected')).classed("selected", false);
        JobStatusUtils.selectRecipes(activity, $element);
        let activityIndex = $scope.activitiesFatTable.findIndex(activityFatTable => activityFatTable.activityId === activity.activityId);
        $scope.$broadcast('scrollToLine', activityIndex);
    };

    $scope.hoverActivity = function(activity) {
        JobStatusUtils.selectRecipes(activity, $element);
    };

    $scope.unhoverActivity = function() {
        d3.selectAll($element.find('svg .selected')).classed("selected", false);
    };

    $scope.highlightActivity = function(activity) {
        let retrievedActivity = $scope.activitiesFatTable.find(activityFatTable => activityFatTable.activityId === activity.activityId)[0];
        if (retrievedActivity) {
            retrievedActivity.highlighted = true;
        }
    };

    $scope.unhighlightActivities = function() {
        $scope.activitiesFatTable.forEach(activityFatTable => activityFatTable.highlighted = false);
    }

    $scope.getActivitiesByDatasetName = function (datasetName) {
        if (!$scope.activitiesFatTable) { return; }
        return Object.values($scope.activitiesFatTable).filter(activity => {
            let isTarget = activity.targets.filter(target => {
                return target.datasetName === datasetName;
            }).length > 0;
            return isTarget;
        });
    };

    $scope.getActivitiesByRecipeName = function (recipeName) {
        if (!$scope.activitiesFatTable) { return; }
        return Object.values($scope.activitiesFatTable).filter(activity => {
            return activity.recipeName == recipeName;
        });
    };

    $scope.hasDuration =function (item) {
        return item != null && item.duration > 0;
    };

    $scope.abortJob = function (jobId) {
        Dialogs.confirm($scope, 'Aborting a job','Are you sure you want to abort this job ?').then(function() {
            DataikuAPI.flow.jobs.abort($stateParams.projectKey, jobId).success(function(data) {
                $scope.list();
                setJobStatus(jobId);
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.deleteSelected = function() {

        var toDelete = $scope.selection.selectedObjects;

        if (toDelete.length==0) {
            return;
        }

        var title = 'Confirm logs deletion';
        var message = 'Are you sure you want to clear the logs for the selected job?';

        if (toDelete.length>1) {
            title='Confirm multiple logs deletion';
            message = 'Are you sure you want to clear logs for the '+toDelete.length+' selected jobs?';
        }

        Dialogs.confirm($scope,title,message).then(function() {
            var cnt = toDelete.length;
            for (var k in toDelete){
                WT1.event("job-delete", {modelBenchId : toDelete[k].def.id});
                DataikuAPI.flow.jobs.clearLogs($stateParams.projectKey, toDelete[k].def.id).error(setErrorInScope.bind($scope))['finally'](function() {
                    cnt--;
                    if(cnt==0) {
                        $scope.list();
                    }
                });
            }
        });

    };
});

app.directive('multiBuildSupport', function($stateParams, DataikuAPI, Dialogs, CreateModalFromTemplate) {
    return {
        restrict: 'AE',
        link : function(scope, element, attrs) {

            function openBuildDownstreamModal(errorMessage) {
                return function(data) {
                    if (!data.length) {
                        Dialogs.error(scope, "Nothing to build", errorMessage);
                    } else {
                        CreateModalFromTemplate(
                            "/templates/flow-editor/tools/build-downstream-modal.html",
                            scope,
                            "BuildDownstreamController",
                            function(modalScope) {
                                modalScope.initModal(data);
                            }
                        );
                    }
                }
            }

            scope.buildSelectedComputables = function(selectedComputables) {
                // Get all buildable from backend and filter based on selection. TODO @flow Too slow?
                return DataikuAPI.flow.getComputables(selectedComputables)
                    .success(openBuildDownstreamModal("The selected items are not buildable."))
                    .error(setErrorInScope.bind(scope));
            };

            scope.buildAll = function() {
                DataikuAPI.flow.listDownstreamComputables($stateParams.projectKey)
                    .success(openBuildDownstreamModal("This project flow has no buildable dataset."))
                    .error(setErrorInScope.bind(scope));
            };

            scope.buildFromRecipe = function(recipeId) {
                DataikuAPI.flow.listDownstreamComputables($stateParams.projectKey, {runnable: recipeId})
                    .success(openBuildDownstreamModal())
                    .error(setErrorInScope.bind(scope));
            };

            scope.buildFromComputable = function(computableId) {
                DataikuAPI.flow.listDownstreamComputables($stateParams.projectKey, {computable: computableId})
                    .success(openBuildDownstreamModal("This dataset is not linked to any recipe."))
                    .error(setErrorInScope.bind(scope));
            };
        }
    }
});

app.directive('jobActivitiesList', function(Assert, Logger) {
    return {
        restrict: 'E',
        replace : 'true',
        scope : {
            activitiesFatTable: '=',
            rowHeight: '@',
            jobRemoved: '=',
            onActivityClick: '=',
            onMouseOverActivity: '=?',
            onMouseLeaveActivity: '=?'
        },
        templateUrl : "/templates/jobs/job-activities-list.html"
    }
});

app.directive('pipelineActivityTitle', function() {
    return {
        restrict: 'E',
        replace : true,
        scope: {
            activity: '='
        },
        link : function(scope) {
            scope.$watch('activity', function() {
                const activity = scope.activity;
                scope.showItem = isPipeline(activity);
                if (!scope.showItem) {
                    return;
                }
                scope.pipelineTypeText = (activity.activityType === ACTIVITY_TYPE_SPARK_PIPELINE ? 'Spark' : 'SQL');
                scope.activityCount = activity.pipelineRecipes.length;
            });
        },
        templateUrl : "/templates/jobs/pipeline-activity-title.html"
    }
});

}());
