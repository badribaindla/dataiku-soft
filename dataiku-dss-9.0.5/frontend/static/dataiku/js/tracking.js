(function(){
'use strict';

    const app = angular.module('dataiku.services');

    app.factory("IntercomSupport", function($rootScope, $state, Assert, ContextualMenu, LoggerProvider){
        var Logger = LoggerProvider.getLogger("IntercomSupport");
        var loaded = false;
        var shown = false;

        var svc = {
            activate : function(){
                Assert.inScope($rootScope, "appConfig");

                if (!$rootScope.appConfig.licensing ||
                    !$rootScope.appConfig.licensing.licenseContent ||
                    !$rootScope.appConfig.licensing.licenseContent.properties ||
                    !$rootScope.appConfig.licensing.licenseContent.properties.intercomAppId) {
                    return;
                }

                /* CE users: even if license gives an app id, Intercom is only enabled
                 * during trial period. Except if specially allowed */
                if ($rootScope.appConfig.communityEdition) {
                    if (!$rootScope.appConfig.licensing.ceEntrepriseTrial && 
                        !$rootScope.appConfig.licensing.licenseContent.properties.intercomAfterTrial) {
                        return;
                    }
                }

                var appId = $rootScope.appConfig.licensing.licenseContent.properties.intercomAppId;
                var intercomCode = "<script>(function(){var w=window;var ic=w.Intercom;if(typeof ic==='function'){ic('reattach_activator');ic('update',intercomSettings);}else{var d=document;var i=function(){i.c(arguments)};i.q=[];i.c=function(args){i.q.push(args)};w.Intercom=i;function l(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/"+appId+"';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x);} w.dkuIntercomLoadFunction = l;}})()</script>"

                if (!loaded){
                    $("body").append($(intercomCode));
                    loaded = true;
                }
                $rootScope.intercomEnabled = true;

                $rootScope.forceShowIntercom = function(){
                   $("body").removeClass("dku-intercom-hidden");
                   Intercom("show");
                   ContextualMenu.prototype.closeAny();
                }

                var licenseKind = $rootScope.appConfig.licensing.licenseContent.licenseKind;
                var company = $rootScope.appConfig.licensing.licenseContent.licensee.company;
                var niceName = $rootScope.appConfig.user.displayName + " (" + $rootScope.appConfig.user.login + ") ("+ licenseKind + ": " + company + ")";
                Logger.info("Executing Intercom load hook");
                window.dkuIntercomLoadFunction();
                Logger.info("Enqueuing Intercom boot");
                window.Intercom("boot", {
                    app_id: appId,
                    license_kind : $rootScope.appConfig.licensing.licenseContent.licenseKind,
                    license_instance_id : $rootScope.appConfig.licensing.licenseContent.instanceId,
                    licensee_company: company,
                    licensee_email: $rootScope.appConfig.licensing.licenseContent.licensee.name,
                    name : niceName,
                    email: $rootScope.appConfig.user.email
                });
                Intercom("onShow", function(){
                    shown = true;
                })
                Intercom("onHide", function(){
                    shown = false;
                })

                if ($state.current.name == "home") {
                    $("body").removeClass("dku-intercom-hidden")
                } else {
                    $("body").addClass("dku-intercom-hidden")
                }

                $rootScope.$on("$stateChangeSuccess", function(event, toState) {
                    if(toState.name != "home") {
                        if (!shown) {
                            $("body").addClass("dku-intercom-hidden");
                        }
                    } else {
                        $("body").removeClass("dku-intercom-hidden");
                    }
                })
            }
        }
        return svc;
    })

    app.factory('TrackingService', function($rootScope, $state, $stateParams, Assert, Notification) {
            var lastEvent = new Date().getTime();
            var isIdle = false;

            // Max idle time before being considered idle (10 mn)
            var idleTime = 10 * 60 * 1000;

            // Track page changes
            $rootScope.$on("$stateChangeSuccess",function(event, toState, toParams, fromState, fromParams){
                // Some parameters (in catalog) are not a string: scope and _type are arrays.
                const arrayParameters =
                    Object.entries(toParams).filter(paramEntry => Array.isArray(paramEntry[1]));
                if (arrayParameters.length > 0) {
                    toParams = angular.copy(toParams);
                    arrayParameters.forEach(parameter => {
                        toParams[parameter[0]] = JSON.stringify(parameter[1]);
                    });
                }
                Notification.publishToBackend('ui-state-changed', {
                      stateName : toState.name,
                      stateParams : toParams
                  });
                  resetIdleTimer();
            });

            if($state.current && $state.current.name) {
                Notification.publishToBackend('ui-state-changed', {
                    stateName : $state.current.name,
                    stateParams : $stateParams
                });
            }

            var idleTimeout = null;

            var resetIdleTimer = function() {
                setIdleState(false);
                lastEvent = new Date().getTime();
                if(idleTimeout !== null) {
                    clearTimeout(idleTimeout);
                }
                idleTimeout = setTimeout(function() {
                    setIdleState(true);
                },idleTime);
            };

            var setIdleState = function(newIdleState) {
                if(isIdle != newIdleState) {
                    $rootScope.$apply(function() {
                        isIdle = newIdleState;
                        Notification.publishToBackend('ui-idle-state-changed',{
                            isIdle : newIdleState
                        });
                    });
                }
            };

            // Reset idle timer on page events
            var eventList = ['mousemove','mousedown','keypress','mousewheel','touchmove'];

            for(var k in eventList) {
                window.addEventListener(eventList[k],resetIdleTimer,false);
            }

            resetIdleTimer();
            Notification.publishToBackend('ui-idle-state-changed',{
                                    isIdle : false
            });

            return {
                isIdle : function() {
                    return isIdle;
                },
                setIdleTime : function(newIdleTime) {
                    idleTime = newIdleTime;
                },
                resetIdleTimer : resetIdleTimer,
                configurePingTracking : function(){
                    Assert.inScope($rootScope, "appConfig");
                    if ($rootScope.appConfig.udr && $rootScope.appConfig.pingTracking) {
                        window.setInterval(function(){
                            if (window.WT1SVC) {
                                window.WT1SVC.event("pingt", {
                                    "idle": isIdle,
                                    "lastEvent": new Date().getTime() - lastEvent
                                })
                            }
                        }, $rootScope.appConfig.pingTrackingInterval);
                    }
                }
            };

    });


    app.factory('WatchService',["Notification", "$rootScope", "$state", "$stateParams", "Debounce", "WebSocketService",
            function(Notification, $rootScope, $state, $stateParams, Debounce, WebSocketService) {

        var registeredWatchers = [];
        var id = 0;

        var newId = function() {
            id++;
            return 'W'+id;
        }

        var updateWatchList = Debounce().withDelay(50,50).wrap(function() {
            var watches = [];
            for(var k in registeredWatchers) {
                watches.push(registeredWatchers[k].watch);
            }
            Notification.publishToBackend('watch-list-changed',{
                watches : watches
            });
        });

        var watchState = function(callback, statePrefix, stateParams) {
            var watcher = {
                callback: callback,
                watch : {
                    statePrefix : statePrefix?statePrefix:'',
                    stateParams : angular.copy(stateParams?stateParams:{}),
                    watchId : newId()
                }
            };
            registeredWatchers.push(watcher);
            updateWatchList();

            return function() {
                 var idx = registeredWatchers.indexOf(watcher);
                 if(idx!=-1) {
                    registeredWatchers.splice(idx,1);
                 }
            };
        };

        Notification.registerEvent('watch-triggered',function(evt, message) {
            for(var k = 0 ; k <  message.results.length ; k++) {
                var theId = message.results[k].watchId;
                for(var j = 0 ; j < registeredWatchers.length ; j++) {
                    if(registeredWatchers[j].watch.watchId == theId) {
                        var watchResult = message.results[k];
                        var conflictingSessions = watchResult.sessions;
                        for(var l in conflictingSessions) {
                            var conflictingSession = conflictingSessions[l];
                            conflictingSession.isCurrentSession =
                                (conflictingSession.sessionId == WebSocketService.getSessionId());
                        }
                        registeredWatchers[j].callback(conflictingSessions);
                        break;
                    }
                }
            }
        });

        return {
            watchState : watchState
        };

    }]);


    app.factory('ConflictDetector', function($state, $stateParams, $rootScope, Notification, WatchService, Debounce, Logger) {
        var trackedStates = [
            {
                state : 'projects.project.datasets.dataset.settings',
                params : ['projectKey','datasetName'],
                title : 'Users editing this dataset'
            },
            {
                state : 'projects.project.datasets.dataset.edit',
                params : ['projectKey','datasetName'],
                title : 'Users editing this dataset'
            },
            {
                state : 'projects.project.recipes.recipe',
                params : ['projectKey','recipeName'],
                title : 'Users editing this recipe'
            },
            {
                state : 'projects.project.datasets.dataset.shakers.shaker',
                params : ['projectKey','datasetName','scriptId'],
                title : 'Users on this preparation script'
            },
            {
                state : 'projects.project.wiki.article.edit',
                params : ['projectKey', 'articleId'],
                title : 'Users on this article'
            },
            {
                state : 'projects.project.notebooks.jupyter_notebook',
                params : ['projectKey','notebookId'],
                title : 'Users on this notebook'
            },
            {
                state : 'projects.project.notebooks.sql_notebook',
                params : ['projectKey','notebookId'],
                title : 'Users on this notebook'
            },
            {
                state : 'projects.project.analyses.analysis',
                params : ['projectKey','analysisId'],
                title : 'Users on this analysis'
            },
            {
                state : 'projects.project.analyses.analysis.ml.predmltask',
                params : ['projectKey', 'mlTaskId'],
                title : 'Users on this ML task'
            },
            {
                state : 'projects.project.analyses.analysis.ml.clustmltask',
                params : ['projectKey', 'mlTaskId'],
                title : 'Users on this ML task'
            },
            {
                state : 'projects.project.dashboards.dashboard.edit',
                params : ['projectKey', 'dashboardId'],
                title : 'Users editing this dashboard'
            },
            {
                state : 'projects.project.dashboards.insights.insight.edit',
                params : ['projectKey', 'insightId'],
                title : 'Users editing this insight'
            },
            {
                state: 'projects.project.scenarios.scenario',
                params : ['projectKey', 'scenarioId'],
                title : 'Users on this scenario'
            },
            {
                state: 'projects.project.webapps.webapp.edit',
                params : ['projectKey', 'webAppId'],
                title : 'Users editing this webapp'
            },
            {
                state: 'plugindev.editor',
                params : ['pluginId'],
                title : 'Users editing this plugin'
            },
            {
                state : 'projects.project.datasets.dataset.statistics.worksheet',
                params : ['projectKey', 'datasetName', 'worksheetId'],
                title : 'Users on this worksheet'
            },
            {
                state : 'projects.project.foreigndatasets.dataset.statistics.worksheet',
                params : ['projectKey', 'datasetName','worksheetId'],
                title : 'Users on this worksheet'
            }
        ];

        // Sort by depth in the state hierarchy
        trackedStates.sort(function(a,b) {
            var cmp = b.state.length - a.state.length;
            if(cmp == 0) {
                cmp = b.params.length - a.params.length;
            }
            return cmp;
        });



        var notifyConflictListChanged = Debounce().withDelay(50,50).wrap(function() {
            $rootScope.$broadcast('conflict-list-changed');
        });

        var rebuildTrackersForState = function(toState,toParams) {
            for(var k in trackedStates) {
                (function(trackedState) {
                    if(trackedState.tracker) {
                        trackedState.tracker();
                        trackedState.tracker = null;
                    }
                    if(toState.indexOf(trackedState.state)== 0) {
                        var params = {};
                        for(var j in trackedState.params) {
                            var paramName = trackedState.params[j];
                            params[paramName] = toParams[paramName];
                        }
                        trackedState.tracker = WatchService.watchState(function(sessions) {
                            trackedState.sessions = [];
                            for(var k in sessions) {
                                var session = sessions[k];
                                //if(!session.isCurrentSession) {
                                    trackedState.sessions.push(session);
                                //}
                            }
                            notifyConflictListChanged();
                        },trackedState.state,params, trackedState.ignoredValues);
                    }
                })(trackedStates[k]);
            }
            notifyConflictListChanged();
        };

        $rootScope.$on("$stateChangeSuccess",function(event, toState, toParams, fromState, fromParams){
            rebuildTrackersForState(toState.name,toParams);
        });

        if($state.current && $state.current.name) {
            rebuildTrackersForState($state.current.name,$stateParams);
        }

        return {
            listConflicts : function() {

                let out = [];
                let userMap = {};

                for(let trackedStateItem in trackedStates) {
                    let trackedState = trackedStates[trackedStateItem];
                    let userList = [];

                    if($state.current.name.indexOf(trackedState.state) == 0) {
                        if(trackedState.sessions && trackedState.sessions.length) {
                            for(let sessionItem in trackedState.sessions) {
                                let session = trackedState.sessions[sessionItem];
                                if(!userMap[session.user.login]) {

                                    let sessionUser = {
                                        userLogin : session.user.login,
                                        userDisplayName : session.user.displayName,
                                        active : !session.isIdle
                                    };

                                    userList.push(sessionUser);
                                    userMap[session.user.login] = sessionUser;

                                } else {
                                    if(!session.isIdle) {
                                        userMap[session.user.login].active = true;
                                    }
                                }
                            }
                        }
                    }
                    if(userList.length>0) {
                        let totalNbWindows = 0;
                        for(let userListItem in userList) {
                            let user = userList[userListItem];
                            user.nbWindows = 0;
                            for(let s in trackedState.sessions) {
                                let userSession = trackedState.sessions[s];
                                if(userSession.user.login == user.userLogin) {
                                    user.nbWindows++;
                                    totalNbWindows++;
                                }
                            }
                        }

                        out.push({
                            state : trackedState.state,
                            params : trackedState.params,
                            title : trackedState.title,
                            warn : totalNbWindows > 1,
                            users : userList
                        });
                    }
                }
                for(let k in out) {
                    if(out[k].warn) {
                        Logger.info('Detected state conflict with another user!',out[k].users)
                    }
                }

               return out;
            }
        };

    });

})();