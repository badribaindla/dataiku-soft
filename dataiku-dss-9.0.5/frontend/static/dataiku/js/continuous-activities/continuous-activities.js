(function(){
'use strict';

var app = angular.module('dataiku.continuous-activities',[]);


app.controller("ContinuousActivitiesListController", function($scope, $rootScope, $controller, $stateParams, $q, Fn, DataikuAPI, $state,
                TopNav, CreateModalFromTemplate, Dialogs, WT1, ActivityIndicator) {

    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
    
    $scope.listItemType = 'CONTINUOUS_ACTIVITY'; // set manually because it's not one of the taggable types

    $scope.sortBy = [
        { value: 'id', label: 'Id' },
        { value: 'name', label: 'Name' }
    ];
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            tags: [],
            interest: {
                starred: '',
            },
        },
        filterParams: {
            userQueryTargets: ["recipeId", "recipeType", "name","tags"],
            propertyRules: {tag:"tags"},
        },
        orderQuery: "id",
        orderReversed: false,
    }, $scope.selection || {});
    $scope.sortCookieKey = 'continuous-activities';
    $scope.maxItems = 20;
    
    $scope.noTags = true;
    $scope.noStar = true;
    $scope.noWatch = true;
    $scope.noDelete = true;

    $scope.list = function(noRestore) {
        DataikuAPI.continuousActivities.listProjectStates($stateParams.projectKey).success(function(data) {
            $scope.listItems = data.activities.map(a => {a.id = a.recipeId; return a;});
            $scope.restoreOriginalSelection();
        }).error(setErrorInScope.bind($scope));
    };

    TopNav.setLocation(TopNav.TOP_JOBS, "continuous-activities", TopNav.TABS_NONE, null);
    TopNav.setNoItem();
    $scope.list();

    $scope.$watch("selection.selectedObject",function(nv) {
        if (!nv) return;
        // TODO @streaming-ui
    });

    $scope.continuousActivityList = {}; // to be shared between the main page and the standardized panel
    $scope.continuousActivityList.list = $scope.list;

    /* Specific actions */
    $scope.goToItem = function(data) {};

    $scope.startContinuousActivity = function(item) {
        WT1.event("start-continuous", {from:'continuous-activities-list'})
        CreateModalFromTemplate("/templates/continuous-activities/start-continuous-activity-modal.html", $scope, "StartContinuousActivityController", function(newScope) {
            newScope.recipeId = item.recipeId;
        }).then(function(loopParams) {
            DataikuAPI.continuousActivities.start($stateParams.projectKey, item.recipeId, loopParams).success(function(data){
                $scope.list();
            }).error(setErrorInScope.bind($scope));
        });
    }
    $scope.stopContinuousActivity = function(item) {
        WT1.event("stop-continuous", {from:'continuous-activities-list'})
        DataikuAPI.continuousActivities.stop($stateParams.projectKey, item.recipeId).success(function(data){
            $scope.list();
        }).error(setErrorInScope.bind($scope));
    }
    
    // mass actions for the dropdown
    $scope.massStartStopContinuous = true;
    $scope.startAllContinuousActivities = function(objects) {
        WT1.event("start-continuous", {from:'continuous-activities-list'})
        CreateModalFromTemplate("/templates/continuous-activities/start-continuous-activity-modal.html", $scope, "StartContinuousActivityController", function(newScope) {
            newScope.recipeId = objects[0].recipeId;
        }).then(function(loopParams) {
            let promises = objects.map(function(object) {
                return DataikuAPI.continuousActivities.start($stateParams.projectKey, object.recipeId, loopParams)
            });
            $q.all(promises).then(function (values) {
                $scope.list();
            });
        });
    };
    $scope.stopAllContinuousActivities = function(objects) {
        WT1.event("stop-continuous", {from:'continuous-activities-list'})
        let promises = objects.map(function(object) {
            return DataikuAPI.continuousActivities.stop($stateParams.projectKey, object.recipeId)
        });
        $q.all(promises).then(function (values) {
            $scope.list();
        });
    };
    
});

app.controller("ContinuousActivityPageRightColumnActions", function($controller, $scope, $rootScope, $stateParams, ActiveProjectKey, DataikuAPI, CreateModalFromTemplate, WT1) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    let setLocalState = function(data) {
        // for the right column actions
        if (!data) return;
        $scope.data = data;
        $scope.continuousActivity = $scope.data;
        $scope.continuousActivity.nodeType = "CONTINOUS_ACTIVITY";
        $scope.continuousActivity.interest = {};
        $scope.selection = {
            selectedObject : $scope.continuousActivity,
            confirmedItem : $scope.continuousActivity
        };
    };
    if ($scope.continuousActivityPage) {
        // update the data in the right-column if it changes on the main page
        $scope.$watch("continuousActivityPage.state", function(data) {
            setLocalState($scope.continuousActivityPage.state);
        });
    }

    let refreshData = function() {
        DataikuAPI.continuousActivities.getState(ActiveProjectKey.get(), $stateParams.continuousActivityId).success(function(data) {
            setLocalState(data);
            if ($scope.continuousActivityPage) {
                // and update on the page too
                $scope.continuousActivityPage.state = data;
            }
        }).error(setErrorInScope.bind($scope));
    };
    if ($scope.continuousActivityPage) {
        // if the data is not expected to come from the page, go grab it
        refreshData();
    }
    
    $scope.startContinuousActivity = function() {
        WT1.event("start-continuous", {from:'continuous-activities-page'})
        CreateModalFromTemplate("/templates/continuous-activities/start-continuous-activity-modal.html", $scope, "StartContinuousActivityController", function(newScope) {
            newScope.recipeId = $scope.continuousActivity.recipeId;
        }).then(function(loopParams) {
            DataikuAPI.continuousActivities.start($stateParams.projectKey, $scope.continuousActivity.recipeId, loopParams).success(function(data){
                refreshData();
            }).error(setErrorInScope.bind($scope));
        });
    }
    $scope.stopContinuousActivity = function() {
        WT1.event("stop-continuous", {from:'continuous-activities-page'})
        DataikuAPI.continuousActivities.stop($stateParams.projectKey, $scope.continuousActivity.recipeId).success(function(data){
            refreshData();
        }).error(setErrorInScope.bind($scope));
    }
});

app.controller("StartContinuousActivityController", function($controller, $scope, $rootScope, $stateParams, ActiveProjectKey, DataikuAPI) {
    $scope.uiState = {loopParamsPreset:'FOREVER'};
    $scope.loopParamsPresets = [
                                    {id:'FOREVER', label:'Loop forever, no delay'}
                                  , {id:'ONCE',label:'Only one attempt'}
                                  , {id:'BOUNDED_ATTEMPTS',label:'N attempts max'}
                                  , {id:'CUSTOM',label:'Custom'}
                               ];

    let makeParams = function() {
        if ($scope.uiState.loopParamsPreset == 'FOREVER') return {abortAfterCrashes:-1, initialRestartDelayMS:0, maxRestartDelayMS:0, restartDelayIncMS:0};
        if ($scope.uiState.loopParamsPreset == 'ONCE') return {abortAfterCrashes:1, initialRestartDelayMS:0, maxRestartDelayMS:0, restartDelayIncMS:0};
        if ($scope.uiState.loopParamsPreset == 'BOUNDED_ATTEMPTS') return {abortAfterCrashes:$scope.uiState.abortAfterCrashes, initialRestartDelayMS:0, maxRestartDelayMS:0, restartDelayIncMS:0};
        if ($scope.uiState.loopParamsPreset == 'CUSTOM') return $scope.uiState;
        return {};
    };
    $scope.start = function() {
        $scope.resolveModal(makeParams());
    };
});

app.directive('continuousActivityRightColumnSummary', function($controller, DataikuAPI, $stateParams, GlobalProjectActions, QuickView, ActiveProjectKey, CreateModalFromTemplate, $q, WT1) {
    return {
        templateUrl :'/templates/continuous-activities/right-column-summary.html',

        link : function(scope, element, attrs) {

            $controller('_TaggableObjectsMassActions', {$scope: scope });
            $controller('_TaggableObjectsCapabilities', {$scope: scope });

            scope.QuickView = QuickView;

            if (scope.continuousActivityPage) {
                // we're on the run page, use the state that's already present
                scope.$watch("continuousActivityPage.state", function() {
                    scope.continuousActivity = scope.continuousActivityPage.state;
                });
            } else {
                scope.refreshData = function() {
                    if (!scope.selection.confirmedItem.id) return;
                    DataikuAPI.continuousActivities.getState(ActiveProjectKey.get(), scope.selection.confirmedItem.id).success(function(data) {
                        scope.continuousActivity = data;
                    }).error(setErrorInScope.bind(scope));
                };
    
                scope.$watch("selection.confirmedItem", function(nv, ov) {
                    if (!nv) return;
                    scope.refreshData();
                });
            }
    
            scope.startAllContinuousActivities = function(activities) {
                WT1.event("start-continuous", {from:'continuous-activities-right-column'})
                CreateModalFromTemplate("/templates/continuous-activities/start-continuous-activity-modal.html", scope, "StartContinuousActivityController", function(newScope) {
                    newScope.recipeId = activities[0].recipeId;
                }).then(function(loopParams) {
                    let promises = activities.map(function(activity) {
                        return DataikuAPI.continuousActivities.start($stateParams.projectKey, activity.recipeId, loopParams)
                    });
                    $q.all(promises).then(function (values) {
                        scope.continuousActivityList.list();
                    });
                });
            }
            scope.stopAllContinuousActivities = function(activities) {
                WT1.event("stop-continuous", {from:'continuous-activities-right-column'})
                let promises = activities.map(function(activity) {
                    return DataikuAPI.continuousActivities.stop($stateParams.projectKey, activity.recipeId)
                });
                $q.all(promises).then(function (values) {
                    scope.continuousActivityList.list();
                });
            }
        }
    }
});


app.controller("ContinuousActivityController", function($scope, $controller, $stateParams, $rootScope, DataikuAPI, $state, TopNav,
                CreateModalFromTemplate, ActivityIndicator, WT1, Dialogs, $q, $timeout, RecipesUtils) {

    TopNav.setItem(TopNav.ITEM_CONTINUOUS_ACTIVITY, $stateParams.continousActivityId);
    TopNav.setLocation(TopNav.TOP_JOBS, "continuous-activities", TopNav.TABS_CONTINUOUS_ACTIVITY, "status");
    
    $scope.continuousActivityPage = {}; // to be shared between the main page and the standardized panel

    DataikuAPI.continuousActivities.getFullInfo($stateParams.projectKey, $stateParams.continuousActivityId).success(function(data){
        $scope.continuousActivityPage.state = data.state;
        $scope.continuousActivityPage.recipe = data.recipe;
        $scope.continuousActivityPage.flatOutputs = [];
        if (data.recipe && data.recipe.outputs) {
            $.each(data.recipe.outputs, function(name, output) {  $scope.continuousActivityPage.flatOutputs.push(output); });
        }
    }).error(setErrorInScope.bind($scope));
});


app.controller("ContinuousActivityRunsController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, WT1, ActivityIndicator, $interval) {
    TopNav.setItem(TopNav.ITEM_CONTINUOUS_ACTIVITY, $stateParams.continousActivityId);
    TopNav.setLocation(TopNav.TOP_JOBS, "continuous-activities", TopNav.TABS_CONTINUOUS_ACTIVITY, "status");

    DataikuAPI.continuousActivities.getState($stateParams.projectKey, $stateParams.continuousActivityId).success(function(data) {
        TopNav.setItem(TopNav.ITEM_CONTINUOUS_ACTIVITY, $stateParams.continousActivityId, {name:data.recipeId, type:data.recipeType, state:data.desiredState});
    }).error(setErrorInScope.bind($scope));

    $scope.listLastRuns = function() {
        console.log("list runs");
        return DataikuAPI.continuousActivities.listLastRuns($stateParams.projectKey, $stateParams.continuousActivityId).success(function(data){
            $scope.lastRuns = data.runs;
        }).error(setErrorInScope.bind($scope));
    };
    $scope.listLastAttempts = function() {
        console.log("list attempts");
        return DataikuAPI.continuousActivities.listRunLastAttempts($stateParams.projectKey, $stateParams.continuousActivityId, $stateParams.runId).success(function(data){
            $scope.lastAttempts = data.attempts;
        }).error(setErrorInScope.bind($scope));
    };

    let selectRun = function(run) {
        console.log("select run", run);
        $scope.selectedRun = run;
        $scope.selectedAttempt = null;
        $stateParams.runId = run ? run.runId : null;
    };
    let selectAttempt = function(attempt) {
        console.log("select attempt", attempt);
        $scope.selectedAttempt = attempt;
        $stateParams.attemptId = attempt ? attempt.attemptId : null;
    }
    
    $scope.selectRun = function(run) {
        selectRun(run);
        $scope.refreshLastAttemps();
    };
    $scope.selectAttempt = function(attempt) {
        selectAttempt(attempt);
        $scope.refreshLog();
    };

    $scope.refreshLog = function() {
        if (!$scope.selectedAttempt) return;
        DataikuAPI.continuousActivities.smartTailAttemptLog($stateParams.projectKey, $stateParams.continuousActivityId, $scope.selectedRun.runId, $scope.selectedAttempt.attemptId).success(function(data){
            $scope.attemptLogTail = smartLogTailToHTML(data, false);
        }).error(setErrorInScope.bind($scope));
    }
    $scope.refreshLastAttemps = function() {
        if (!$scope.selectedRun) return;
        $scope.listLastAttempts().then(function() {
            if ($stateParams.attemptId) {
                const attempt = $scope.lastAttempts.filter(x => x.attemptId == $stateParams.attemptId)[0];
                selectAttempt(attempt || $scope.lastAttempts[0]);
            } else {
                // no run selected, pick first
                selectAttempt($scope.lastAttempts[0]);
            }
        }).then(function() {
            console.log("and refresh log");
            $scope.refreshLog();
        });
    };
    $scope.refreshLastRuns = function() {
        $scope.listLastRuns().then(function() {
            if ($stateParams.runId) {
                const run = $scope.lastRuns.filter(x => x.runId == $stateParams.runId)[0];
                selectRun(run || $scope.lastRuns[0]);
            } else {
                // no run selected, pick first
                selectRun($scope.lastRuns[0]);
            }
        }).then(function() {
            console.log("and refresh attempts");
            $scope.refreshLastAttemps();
        });
    };

    $scope.refreshLastRuns();
    
    $scope.getDownloadUrl = function() {
        return DataikuAPI.continuousActivities.getDownloadURL($stateParams.projectKey, $stateParams.continuousActivityId, $scope.selectedRun.runId, $scope.selectedAttempt.attemptId);
    };
    
    let cancelPoll = null;
    let poll = function() {
        DataikuAPI.continuousActivities.getState($stateParams.projectKey, $stateParams.continuousActivityId).success(function(data){
            $scope.continuousActivityPage.state = data;
            if (data && data.mainLoopState && data.mainLoopState.futureInfo && data.mainLoopState.futureInfo.hasResult) {
                // loop exited, no point in polling anymore
                stopPoll();
            }
            $scope.listLastAttempts();
            $scope.refreshLog();
        }).error(setErrorInScope.bind($scope));
    };
    let stopPoll = function() {
        if (cancelPoll) $interval.cancel(cancelPoll);
    };
    let startPoll = function() {
        cancelPoll = $interval(poll, 5000);
    };
    $scope.$watch('continuousActivityPage.state.desiredState', function() {
        if ($scope.continuousActivityPage && $scope.continuousActivityPage.state) {
            if ($scope.continuousActivityPage.state.desiredState == 'STARTED') {
                stopPoll();
                startPoll();            
                $scope.listLastRuns().then(function() {
                    // auto select the new run
                    selectRun($scope.lastRuns[0]);
                }).then(function() {
                    $scope.refreshLastAttemps();
                });
            } else {
                stopPoll();
            }
        }
    });
    
    $scope.getFixedUpRunStatus = function(run, i) {
        let mainLoopState = (($scope.continuousActivityPage || {}).state || {}).mainLoopState || {};
        let futureInfo = mainLoopState.futureInfo || {};
        if (futureInfo.alive) {
            if (mainLoopState.runId == run.runId) {
                return 'running'; // even if the run's lastStatus is not running
            }
        }
        if (run.lastStatus != 'running') return run.lastStatus;
        if (i > 0) {
            return 'interrupted'; // only the last run can be still running
        }
        if (futureInfo.hasResult) {
            return "stopped";
        } else {
            return "running";
        }
    };
    
    $scope.getFixedUpAttemptStatus = function(attempt, i) {
        let mainLoopState = (($scope.continuousActivityPage || {}).state || {}).mainLoopState || {};
        let futureInfo = mainLoopState.futureInfo || {};
        if (attempt.status != 'running') return attempt.status;
        if (i > 0) {
            return 'interrupted'; // only the last run can be still running
        }
        if (mainLoopState.runId != $scope.selectedRun.runId || futureInfo.hasResult) {
            return "stopped";
        } else {
            return "running";
        }
    };
    
    $scope.$on("$destroy", function() {
        stopPoll();
    });
});


})();
