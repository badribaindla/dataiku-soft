(function(){
'use strict';

    const app = angular.module('dataiku.widgets.drawers', ['dataiku.filters', 'dataiku.services']);


    app.directive('topbarDrawer', function($timeout) {
        return {
            scope: true,
            link: function(scope, element, attrs) {
                scope.shown = false;
                $(element).hide();

                function hideIfClickElsewhere (event) {
                    if (event.target) {
                        var e = event.target;
                        // go back up to find a bootstrap-select or absence of <body> (that would indicate we're after a bootstrap-select closed itself)
                        var i = 0;
                        while (e) {
                            if (e.classList && e.classList.indexOf && e.classList.indexOf("bootstrap-select") >= 0) return;
                            if (e.tagName.toLowerCase() == 'body') break;
                            e = e.parentElement;
                        }
                        if (e == null) return;
                    }
                    if (!element.get(0).contains(event.target) && !event.target.classList.contains("dropdown-menu")) {
                        hide();
                    }
                }

                function hide () {
                    element.hide();
                    $("html").unbind("click", hideIfClickElsewhere);
                    scope.shown = false;
                }

                function show () {
                    scope.shown = true;
                    $(element).show();
                    window.setTimeout(function() { $("html").click(hideIfClickElsewhere);}, 0);
                }

                scope.toggle = function() {
                    if (scope.shown) hide(); else show();
                };

                scope.$on('$stateChangeSuccess', hide);
            }
        };
    });

    app.directive('adminDrawer', function($rootScope, $filter, DataikuAPI) {
        return {
            restrict: 'A',
            templateUrl : '/templates/widgets/topbar_drawers/admin-drawer.html',
            link : function(scope, element, attrs) {

                $rootScope.toggleAdminDrawer = function() {
                    scope.toggle();
                    if (scope.shown) {
                        //
                    }
                };
            }
        };
    });

    app.directive('helpDrawer', function($rootScope, $filter, DataikuAPI, CoachmarksService) {
        return {
            restrict: 'A',
            templateUrl : '/templates/widgets/topbar_drawers/help-drawer.html',
            link : function(scope, element, attrs) {

                $rootScope.toggleHelpDrawer = function() {
                    scope.toggle();
                    if (scope.shown) {
                        //
                    }
                };


        	    /* ********** UI ************ */

            	scope.closeMenu = function(){
            		ContextualMenu.prototype.closeAny();
            	}

            	scope.globallyEnableCoachmarks = function() {
                    CoachmarksService.enableAllSeries();
                    scope.currentSerieStatus.enabled = true;
                };

                scope.globallyDisableCoachmarks = function() {
                    CoachmarksService.disableAllSeries();
                    scope.currentSerieStatus.enabled = false;
                };

                scope.switchCurrentCoachmarkDisplay = function() {
                    var currentSerieId = CoachmarksService.getCurrentSerieId();
                    if (currentSerieId) {
                        if (CoachmarksService.isSerieDisabled(currentSerieId)) {
                            CoachmarksService.enableSerie(currentSerieId);
                        } else {
                            CoachmarksService.disableSerie(currentSerieId);
                        }
                    }
                };

                scope.getCurrentSerieId = function() {
                    return CoachmarksService.getCurrentSerieId();
                }

                scope.isCoachmarksHardDisabled = function() {
                    return CoachmarksService.isCoachmarksHardDisabled();
                }
                
                scope.$watch(() => CoachmarksService.getCurrentSerieId(), (nv, ov) => {
                    scope.currentSerieStatus = {
                        enabled : CoachmarksService.getCurrentSerieId() && !CoachmarksService.isSerieDisabled(CoachmarksService.getCurrentSerieId())
                    }
                })
            }
        };
    });

    app.directive('userDrawer', function($rootScope, $filter, DataikuAPI) {
        return {
            restrict: 'A',
            templateUrl : '/templates/widgets/topbar_drawers/user-drawer.html',
            link : function(scope, element, attrs) {
                scope.context = "drawer";
                var acknowledged = false;

                function getNotifications () {
                    DataikuAPI.notifications.get().success(update).error(setErrorInScope.bind(scope));
                }

                function ack () {
                    if (!scope.shown || !scope.pnotifications || acknowledged || !scope.pnotifications.totalUnread) {
                        return;
                    }
                    DataikuAPI.notifications.ack(scope.pnotifications.timestamp).error(setErrorInScope.bind(scope));
                    acknowledged = true;
                }

                function humanReadableObjectType (objectType) {
                    if (!objectType) return;
                    switch(objectType) {
                    case "MANAGED_FOLDER":
                        return "folder";
                    case "SAVED_MODEL":
                        return "model";
                    case "MODEL_EVALUATION_STORE":
                        return "evaluation store";
                    case "LAMBDA_SERVICE":
                        return "API service";
                    default:
                        return objectType.toLowerCase().replace('_', ' ');
                    }
                }

                function update (data) {
                    scope.timelineReady = true;
                    scope.pnotifications = data;
                    if (!data || !data.notifications) {
                        return;
                    }

                    //add a "day" attribute to all the menu elements to show grouping by day
                    $.each(data.notifications, function(idx, elt) {
                        elt.day = $filter('friendlyDate')(elt.timestamp);
                        if (elt.evt.objectType) {
                            elt.evt.humanReadableObjectType = humanReadableObjectType(elt.evt.objectType);
                        }
                        if (elt.evt.item) {
                            elt.evt.item.humanReadableObjectType = humanReadableObjectType(elt.evt.item.objectType);
                        }
                    });


                    var orderedItems = $filter('orderBy')(data.notifications, '-timestamp');
                    orderedItems = orderedItems.slice(0, maxItems);

                    /* Insert days separators */
                    scope.orderedItemsWithDays = [];
                    orderedItems.forEach(function(x, i) {
                        if (i === 0) {
                            scope.orderedItemsWithDays.push({isSeparator: true, day : x.day});
                            scope.orderedItemsWithDays.push(x);
                        } else if (x.day === orderedItems[i-1].day) {
                            scope.orderedItemsWithDays.push(x);
                        } else {
                            scope.orderedItemsWithDays.push({isSeparator: true, day : x.day});
                            scope.orderedItemsWithDays.push(x);
                        }
                    });

                    acknowledged = false;

                    ack();
                }

                $rootScope.toggleUserDrawer = function() {
                    scope.toggle();
                    if (scope.shown) {
                        maxItems = 15;
                        scope.timelineReady = false;
                        getNotifications();
                    }
                };

                var maxItems = 15;
                scope.scroll = function() {
                    if (!scope.shown || !scope.pnotifications || !scope.pnotifications.notifications) return;
                    maxItems += 5;
                    update(scope.pnotifications);
                };
            }
        };
    });

    app.directive('activityDrawer', function($rootScope, DataikuAPI, ActiveProjectKey) {
        return {
            restrict: 'A',
            templateUrl : '/templates/widgets/topbar_drawers/activity-drawer.html',
            link : function(scope) {
                scope.runnings = [];

                function isScenarioFuture(future) {
                    try {
                        return future.payload.action == 'run_scenario';
                    } catch (e) {}
                    return false;
                }

                scope.getActivityInfo = function() {
                    DataikuAPI.running.listPersonal().success(function(data) {
                        var runnings = [];
                        //scenario have normal futures, but we put them in another tab
                        data.futures.filter(function(f){return isScenarioFuture(f);}).forEach(function(o){
                            o.$runningType = 'scenario';
                            o.$id = o.scenarioId;
                            runnings.push(o);
                        });
                        data.futures.filter(function(f){return !isScenarioFuture(f);}).forEach(function(o){
                            o.$runningType = 'future';
                            o.$id = o.jobId;
                            runnings.push(o);
                        });
                        data.jobs.forEach(function(o){
                            o.$runningType = 'job';
                            o.$id = o.jobId;
                            runnings.push(o);
                        });
                        data.notebooks.forEach(function(o){
                            o.$runningType = 'notebook';
                            o.$id = o.name;
                            runnings.push(o)
                        });
                        scope.runnings = runnings;
                    }).error(setErrorInScope.bind(scope));
                };

                scope.getConnectedUsers = function() {
                    DataikuAPI.security.listConnectedUsers(ActiveProjectKey.get())
                        .success(connectedUsers => scope.connectedUsers = connectedUsers.filter(u => u.login !== scope.appConfig.user.login))
                        .error(setErrorInScope.bind(scope));
                }

                scope.Math = window.Math; // for the display of the running time

                // TODO : auto refresher but beware of huge calls
                // var refresher;
                // scope.$on('$destroy', function(){
                //     $interval.cancel(refresher);
                // });

                // scope.$watch('shown', function(nv){
                //     if (nv) { refresher = $interval(scope.getActivityInfo,5000) }
                //     else { $interval.cancel(refresher) };
                // })

                scope.refreshActivityDrawer = () => {
                    scope.getConnectedUsers();
                    scope.getActivityInfo();
                };

                $rootScope.toggleActivityDrawer = function() {
                    scope.toggle();
                    if (scope.shown) {
                        scope.refreshActivityDrawer();
                    }
                };
            }
        };
    });

    app.directive('conflictIcon',function($rootScope, $timeout, ConflictDetector) {
        return {
            restrict: 'A',
            transclude: true,
            templateUrl : '/templates/widgets/conflict-icon.html',
            link : function(scope, element) {

                var updateWarningState = function() {
                    scope.warn = false;
                    for(var k in scope.conflicts) {
                        if(scope.conflicts[k].warn) {
                            scope.warn = true;
                        }
                    }
                    if(scope.warn) {
                        element.addClass('warn');
                        if (scope.needToDisplayWarningPopUp) {
                            // First time there is a conflict on this page, we want to display the popup to let the user know
                            $timeout(function() {
                                var popoverIcon = element.find('>span');
                                if(popoverIcon && popoverIcon[0] && popoverIcon[0].showPopover) {
                                    popoverIcon[0].showPopover();
                                }
                            });

                            // Set the needToDisplayWarningPopUp variable to false, so we don't spam the user
                            scope.needToDisplayWarningPopUp = false;
                        }
                    } else {
                        // No more conflict
                        element.removeClass('warn');
                        scope.needToDisplayWarningPopUp = true;
                    }
                }
                $rootScope.$watch('appConfig.login',function(nv) {
                    scope.currentUserLogin = nv;
                });
                $rootScope.$on('conflict-list-changed',function() {
                    scope.conflicts = ConflictDetector.listConflicts();
                    updateWarningState();
                });
                scope.conflicts = ConflictDetector.listConflicts();
                scope.needToDisplayWarningPopUp = true;
                updateWarningState();
            }
        };

    });

    app.directive('futureMainTarget', function($filter) {
        return {
            scope: false,
            link: function($scope, element, attrs) {
                $scope.icon = null;
                var updateIcon = function() {
                    var future = $scope.$eval(attrs.futureMainTarget);
                    if (future && future.payload) {
                        // special cases first
                        if (future.payload.action == 'run_sql') {
                            $scope.icon = 'icon-code_sql_recipe';
                        } else if (future.payload.action == 'export') {
                            $scope.icon = 'icon-download';
                        } else if (future.payload.targets.length > 0) {
                            var main = future.payload.targets[0];
                            $scope.icon = $filter('typeToIcon')(main.objectType);
                        }
                    }
                };
                $scope.$watch(attrs.futureMainTarget, updateIcon);
            }
        };
    });
    app.directive('futureMainPayload', function($filter) {
        return {
            scope: false,
            link: function($scope, element, attrs) {
                $scope.futurePayload = null;
                $scope.futureDisplayName = null;
                var updatePayload = function() {
                    var future = $scope.$eval(attrs.futureMainPayload);
                    if (future && future.payload) {
                        if (future.payload.action == 'remote') {
                            $scope.futurePayload = future.payload.extras.remotePayload;
                            $scope.futureDisplayName = future.payload.extras.remotePayload.displayName;
                        } else {
                            $scope.futurePayload = future.payload;
                            $scope.futureDisplayName = future.jobDisplayName;
                        }
                    }
                };
                $scope.$watch(attrs.futureMainPayload, updatePayload);
            }
        };
    });
    app.directive('futureProgressBar', function(ProgressStackMessageBuilder) {
        return {
            scope: false,
            link: function($scope, element, attrs) {
                $scope.bar = {};
                var updateBar = function() {
                    var progress = $scope.$eval(attrs.futureProgressBar);
                    if (progress && progress.states && progress.states.length > 0) {
                        $scope.bar.percentage = ProgressStackMessageBuilder.getPercentage(progress);
                        $scope.bar.perpetual = false;
                    } else {
                        $scope.bar.perpetual = true;
                    }
                };
                $scope.$watch(attrs.futureProgressBar, updateBar, true);
            }
        };
    });

    app.directive('futureAbortConfirmation', function() {
        return {
            restrict: 'AE',
            scope : {
                future:'=futureAbortConfirmation',
                abortFn: '&',
                abortMsg: '=',
                abortTitle: '='
            },
            templateUrl: "/templates/widgets/topbar_drawers/future-abort-confirmation.html",
            link : function($scope, element, attrs) {
            }
        }
    });

    app.directive('activityFutureDisplay', function(DataikuAPI, StateUtils) {
        return {
            restrict: 'AE',
            scope : {
                future:'=activityFutureDisplay',
                refreshList:'=',
                inAdmin:'='
            },
            templateUrl: "/templates/widgets/topbar_drawers/activity-future-display.html",
            link : function($scope, element, attrs) {
                $scope.StateUtils = StateUtils;
                $scope.abortFuture = function(jobId) {
                    DataikuAPI.futures.abort(jobId).success(function(data) {
                        $scope.refreshList();
                    }).error(setErrorInScope.bind($scope));
                };
            }
        }
    });

    app.directive('activityScenarioDisplay', function(DataikuAPI, StateUtils) {
        return {
            restrict: 'AE',
            scope : {
                scenario:'=activityScenarioDisplay',
                refreshList:'=',
                inAdmin:'='
            },
            templateUrl: "/templates/widgets/topbar_drawers/activity-scenario-display.html",
            link : function($scope, element, attrs) {
                $scope.StateUtils = StateUtils;
                $scope.abortFuture = function(jobId) {
                    DataikuAPI.futures.abort(jobId).success(function(data) {
                        $scope.refreshList();
                    }).error(setErrorInScope.bind($scope));
                };
            }
        }
    });

    app.directive('activityClusterKernelDisplay', function(DataikuAPI, StateUtils) {
        return {
            restrict: 'AE',
            scope : {
                clusterKernel:'=activityClusterKernelDisplay',
                refreshList:'=',
                inAdmin:'='
            },
            templateUrl: "/templates/widgets/topbar_drawers/activity-cluster-kernel-display.html",
            link : function($scope, element, attrs) {
                $scope.StateUtils = StateUtils;
                $scope.abortKernel = function(clusterKernel) {
                    clusterKernel.aborted = true;
                    DataikuAPI.admin.clusters.abortKernel(clusterKernel.prefix, clusterKernel.kernelId).success(function(data) {
                        $scope.refreshList();
                    }).error(setErrorInScope.bind($scope));
                };
            }
        }
    });

    app.directive('activityNotebookDisplay', function(DataikuAPI, StateUtils) {
        return {
            restrict: 'AE',
            scope : {
                notebook:'=activityNotebookDisplay',
                refreshList:'=',
                inAdmin:'='
            },
            templateUrl: "/templates/widgets/topbar_drawers/activity-notebook-display.html",
            link : function($scope, element, attrs) {
                $scope.StateUtils = StateUtils;
                $scope.abortNotebook = function(jobId) {
                    DataikuAPI.jupyterNotebooks.unload(jobId).success(function(data) {
                        $scope.refreshList();
                    }).error(setErrorInScope.bind($scope));
                };
            }
        }
    });

    app.directive('activityJobDisplay', function(DataikuAPI, StateUtils) {
        return {
            restrict: 'AE',
            scope : {
                job:'=activityJobDisplay',
                refreshList:'=',
                inAdmin:'='
            },
            templateUrl: "/templates/widgets/topbar_drawers/activity-job-display.html",
            link : function($scope, element, attrs) {
                $scope.StateUtils = StateUtils;
                $scope.abortJob = function(projectKey, jobId) {
                    DataikuAPI.flow.jobs.abort(projectKey, jobId).success(function(data) {
                        $scope.refreshList();
                    }).error(setErrorInScope.bind($scope));
                };
            }
        }
    });


})();
