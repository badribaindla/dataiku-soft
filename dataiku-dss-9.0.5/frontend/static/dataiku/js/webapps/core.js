(function(){
'use strict';

const app = angular.module('dataiku.webapps', []);

app.factory('WebAppSharedState', function () {
    return {};
});

app.controller("WebAppsCommonController", function($scope, $state, $rootScope, $stateParams, $q, $controller, TopNav,
        WebAppsService, LoggerProvider, WT1, DataikuAPI, FutureWatcher, Dialogs, CreateModalFromTemplate,
        ActivityIndicator, TAIL_STATUS, DKUtils, StateUtils, PluginsService, WebAppSharedState) {
    const Logger = LoggerProvider.getLogger('WebApps');

    $scope.hooks = $scope.hooks || {};

    /* Used to share some state between each specific kind of webapp controller, and the webapp edit/view controllers, which
     * are below this one */
    $scope.sharedState = WebAppSharedState;

    $scope.setupTypeSpecificWebAppBehaviour = function() {
        const baseType = $scope.getBaseType($scope.app.type);
        if (baseType == 'STANDARD') {
            $controller("StandardWebAppController", {$scope});
        } else if (baseType == 'BOKEH') {
            $controller("BokehWebAppController", {$scope});
        } else if (baseType == 'DASH') {
            $controller("DashWebAppController", {$scope});
        } else if (baseType == 'SHINY') {
            $controller("ShinyWebAppController", {$scope});
        } else {
            Logger.error("Unknown app base type: ", baseType);
        }
    };

    $scope.copy = function(app, callBackFunc) {
        function showModal() {
            const newScope = $scope.$new();
            newScope.app = app;
            CreateModalFromTemplate("/templates/webapps/copy-webapp-modal.html", newScope)
            .then(function() {
                if (typeof(callBackFunc) === 'function') callBackFunc();
            });
        }
        if ($scope.hooks.save) {
            $scope.saveWebAppWithCode().then(showModal, setErrorInScope.bind($scope));
        } else {
            showModal();
        }
    };

    $scope.transformToDevPlugin = function() {
        CreateModalFromTemplate("/templates/webapps/convert-webapp-to-custom.html", $scope, null, function(modalScope) {
            const getAPICallParams = function(scope) {
                const params = scope.convert;
                const pluginId = params.mode == 'NEW' ? params.newPluginId : params.targetPluginId;
                return [scope.app.projectKey,
                        scope.app.id,
                        pluginId,
                        params.targetFolder,
                        params.mode];
            };
            PluginsService.transformToDevPlugin(modalScope, DataikuAPI.webapps.convertToCustom, getAPICallParams,
                                                "plugin-convert-webapp", "customWebApps", $scope.app.type);
        });
    };

    $scope.createAndPinInsight = function(webapp) {
        WT1.event("webapp-publish", {webAppId: $stateParams.id, type: webapp.type});
        const insight = {
            projectKey: $stateParams.projectKey,
            type: 'web_app',
            params: {
                webAppSmartId: webapp.id,
                webAppType: webapp.type,
                apiKey: webapp.apiKey
            },
            name: webapp.name
        };
        CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $scope, "CreateAndPinInsightModalController", function(newScope) {
            newScope.init(insight);
        });
    };

    $scope.backendEnabled = function () {
        return $scope.app && ($scope.app.params.backendEnabled || ['BOKEH', 'DASH', 'SHINY'].indexOf($scope.app.type) >= 0);
    };

    $scope.setBackendLogs = function(data) {
        var logs = null;
        if (data) {
            if (data.logTail) {
                logs = data.logTail;
            } else if (data.lastCrashLogTail) {
                logs = data.lastCrashLogTail;
            } else if (data.currentLogTail) {
                logs = data.currentLogTail;
            }
        }
        $scope.sharedState.backendLogTail = logs;
        if (logs) {
            $scope.errorsInLogs = logs.maxLevel == TAIL_STATUS.ERROR;
            $scope.warningsInLogs = logs.maxLevel == TAIL_STATUS.WARNING;
        } else {
            $scope.errorsInLogs = false;
            $scope.warningsInLogs = false;
        }
    };

    $scope.setBackendState = function(data) {
        $scope.sharedState.backendState = data;
        $scope.sharedState.backendRunning = !!(data && data.futureId && data.futureInfo && data.futureInfo.alive);
        if ($scope.sharedState.backendState) {
            if ($scope.backendEnabled() && !$scope.sharedState.backendRunning) {
                ActivityIndicator.error("Backend not running");
            } else {
                $scope.$broadcast("previewDataUpdated");
            }
        } else {
            $scope.$broadcast("previewDataUpdated");
        }
    };
    
    const editableTypes = ['BOKEH', 'DASH', 'SHINY', 'STANDARD'];
    $scope.isCustomWebAppType = function(webappType) {
        return !editableTypes.includes(webappType);
    };

    $scope.getBaseType = function(webappType) {
        return WebAppsService.getBaseType(webappType);
    };

    $scope.getWebAppTypeName = function(webappType) {
        return WebAppsService.getWebAppTypeName(webappType);
    };

    $scope.restartError = function(data, status, headers, deferred) {
        $scope.setBackendLogs(data);
        ActivityIndicator.error("Backend start failed (check logs)");
        $scope.sharedState.backendFuture = null;
        $scope.sharedState.backendFatalError = getErrorDetails(data, status, headers);
        $scope.sharedState.backendRunning = false;
        deferred.reject();
    };
    $scope.restartSuccess = function(data, deferred) {
        $scope.setBackendLogs(data.result);
        $scope.setBackendState(data.result);
        $scope.sharedState.backendFuture = null;
        $scope.sharedState.backendRunning = true;
        $rootScope.$broadcast("previewDataUpdated");
        deferred.resolve();
    };
    
    $scope.handleStartFuture = function(result, deferred) {
        $scope.sharedState.backendFuture = result;

        if (!result.alive && result.hasResult) {
            // already finished
            $scope.restartSuccess(result, deferred);
        } else {
            FutureWatcher.watchJobId(result.jobId)
            .success(function(data) {
               $scope.restartSuccess(data, deferred);
            }).update(function(data){
                $scope.sharedState.backendFuture = data;
            }).error(function(a, b, c) {
               $scope.restartError(a, b, c, deferred);
            });
        }
    };
    
    $scope.start = function(app){
        if ($scope.sharedState.backendRunning == null) {
            throw new Error("webapp already starting");
        }
        $scope.sharedState.backendRunning = null;
        
        WT1.event("webapp-start", {webAppId: $stateParams.id, type: app.type});
        const deferred = $q.defer();

        $scope.sharedState.backendFatalError = null;
        DataikuAPI.webapps.restartBackend(app).success(function(result) {
            $scope.sharedState.backendFuture = result;

            if (!result.alive && result.hasResult) {
                // already finished
                $scope.restartSuccess(result, deferred);
            } else {
                FutureWatcher.watchJobId(result.jobId)
                .success(function(data) {
                    $scope.restartSuccess(data, deferred);
                }).update(function(data){
                    $scope.sharedState.backendFuture = data;
                }).error(function(a,b,c) {
                    $scope.restartError(a,b,c, deferred);
                });
            }
            $rootScope.$broadcast('backendRestarted');
        }).error(function(a,b,c) {
            $scope.restartError(a,b,c, deferred);
        });

        return deferred.promise;
    };


    $scope.stop = function(webapp) {
        if ($scope.sharedState.backendRunning == null) {
            throw new Error("webapp already starting");
        }
        $scope.sharedState.backendRunning = null;
        
        WT1.event("webapp-stop", {webAppId: $stateParams.id, type: webapp.type});
        return DataikuAPI.webapps.stopBackend(webapp)
            .success(function(){
                $scope.sharedState.backendRunning = false;
                $rootScope.$broadcast('backendStopped');
            })
            .error(setErrorInScope.bind($scope));
    };

    $scope.stopBackendWithDialog = function(webapp) {
        Dialogs.confirm($scope, 'Stop webapp backend', 'Are you sure you want to stop the backend?').then(function () {
            $scope.stop(webapp).then(function(){
                $scope.list();
            });
        });
    };

    $scope.saveWebAppMetadata = function() {
        WT1.event("webapp-save-metadata", {webAppId: $scope.app.id, type: $scope.app.type});
        return DataikuAPI.webapps.saveMetadata($scope.app)
            .error(setErrorInScope.bind($scope))
            .success(function(resp) {
                ActivityIndicator.success("Saved!");
                $scope.hooks.origWebApp = angular.copy($scope.app);
            });
    };

    $scope.saveCustomFields = function(newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'WEB_APP'});
        let oldCustomFields = angular.copy($scope.app.customFields);
        $scope.app.customFields = newCustomFields;
        return $scope.saveWebAppMetadata().then(function() {
            $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.app.customFields);
        }, function() {
            $scope.app.customFields = oldCustomFields;
        });
    };

    $scope.editCustomFields = function() {
        if (!$scope.app) {
            return;
        }
        let modalScope = angular.extend($scope, {objectType: 'WEB_APP', objectName: $scope.app.name, objectCustomFields: $scope.app.customFields});
        CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
            $scope.saveCustomFields(customFields);
        });
    };
});


app.controller("WebAppsListController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate,$state,$q, TopNav, Fn, $filter, Dialogs, WT1) {
    
    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
    $controller("WebAppsCommonController", {$scope: $scope});

    $scope.listHeads = DataikuAPI.webapps.listHeads;

    $scope.sortBy = [
        { value: 'name', label: 'Name' },
        { value: '-lastModifiedOn', label: 'Last modified' }
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
            userQueryTargets: ["name","tags"],
            propertyRules: {tag: "tags"},
        },
        orderQuery: "-lastModifiedOn",
        orderReversed: false,
    }, $scope.selection || {});

    $scope.sortCookieKey = 'webapps';
    $scope.maxItems = 20;

    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'webapps', TopNav.TABS_NONE, null);
    TopNav.setNoItem();
    $scope.list();

    $scope.hasVisualWebapps = false;

    DataikuAPI.webapps.listTypes().then(response => {
        const descriptors = Object.values(response.data);
        // in the flow, only show webapps with roles
        $scope.hasVisualWebapps = descriptors.some(descriptor => descriptor.baseType && (descriptor.roles == null || descriptor.roles.length == 0));
    });
    
    // override because there is no meaningfull sharedState
    $scope.stopBackendInList = function(webapp) {
        Dialogs.confirm($scope, 'Stop webapp backend', 'Are you sure you want to stop the backend?').then(function () {
            WT1.event("webapp-stop", {webAppId: $stateParams.id, type: webapp.type});
            return DataikuAPI.webapps.stopBackend(webapp)
                .success(function(){
                    $scope.list();
                })
                .error(setErrorInScope.bind($scope));
        });
    };
});


app.controller("WebAppCoreController", function($scope, $rootScope, $stateParams, $filter, $state, $controller, $timeout, $q, FutureWatcher, WT1, DKUtils, DataikuAPI, TopNav, WebAppsService, Assert, $interval, Notification) {

    $controller("WebAppsCommonController", {$scope: $scope});

    function getSummary() {
        return DataikuAPI.webapps.getSummary($stateParams.projectKey, $stateParams.webAppId).success(function(data) {
            $scope.app = data.object;
            $scope.timeline = data.timeline;
            $scope.interest = data.interest;
            $scope.setBackendState(data.backendState);
            $scope.hooks.origWebApp = angular.copy($scope.app);

            TopNav.setItem(TopNav.ITEM_WEB_APP, $stateParams.webAppId, $scope.app);
            TopNav.setPageTitle($scope.app.name + " - Webapp");

            $scope.$watch("app.name", function(nv) {
                if (!nv) return;
                $state.go($state.current, {webAppName: $filter('slugify')(nv)}, {location: true, inherit:true, notify:false, reload:false});
            });

            $scope.pluginDesc = WebAppsService.getOwnerPluginDesc($scope.app.type);
        }).error(setErrorInScope.bind($scope));
    }

    $scope.cancelKeepAlive = null;
    getSummary().then(function() {
        TopNav.setItem(TopNav.ITEM_WEB_APP, $stateParams.webAppId, $scope.app);
        TopNav.setPageTitle($scope.app.name + " - Webapp");

        $scope.$watch("app.name", function(nv) {
            if (!nv) return;
            $state.go($state.current, {webAppName: $filter('slugify')(nv)}, {location: true, inherit:true, notify:false, reload:false});
        });
    }).then(function() {
        if ($scope.app && $scope.app.isVirtual) {
            // keep it alive
            let KEEP_ALIVE_INTERVAL_MS = 10*1000;
            $scope.cancelKeepAlive = $interval(function () {
                Notification.publishToBackend('timeoutable-task-keepalive', {
                    taskId: 'webApp:' + $scope.app.projectKey + '.' + $scope.app.id
                });
            }, KEEP_ALIVE_INTERVAL_MS);
        }
    });

    $scope.$on('$destroy', function () {
        if ($scope.cancelKeepAlive) {
            $interval.cancel($scope.cancelKeepAlive);
        }
    });

    $scope.isDirty = function() {
        return !angular.equals($scope.app, $scope.hooks.origWebApp);
    };

    $scope.saveWebAppWithCode = function(commitMessage, forceRestartBackend) {
        WT1.event("webapp-save", {webAppId: $stateParams.id, type: $scope.app.type});
        var deferred = $q.defer();

        $scope.sharedState.backendFatalError = null;
        $scope.sharedState.backendRunning = null;
        DataikuAPI.webapps.save($scope.app, commitMessage, forceRestartBackend).success(function(result) {
        	$scope.hooks.origWebApp = angular.copy($scope.app);
            if (result.backendState == null) {
                // no backend, just update preview
                $scope.$broadcast("previewDataUpdated");
            } else {
                $scope.handleStartFuture(result.backendState, deferred);
            }
        }).error(setErrorInScope.bind($scope));

        return deferred.promise.then($scope.startUpdatePreview, function() {});
    };

    $scope.saveAndViewWebApp = function() {
        $scope.saveWebAppWithCode().then(function() {
            if ($scope.backendEnabled($scope.app)) {
                $scope.start($scope.app).then(function() {
                    $scope.startUpdatePreview().then(function(){
                        $state.go('projects.project.webapps.webapp.view');
                    });
                });
            } else {
                $state.go('projects.project.webapps.webapp.view');
            }
        });
    }

    let releaseListener = $scope.$watch("app", function(nv) {
        if (!nv) return;
        $scope.setupTypeSpecificWebAppBehaviour();
        releaseListener();
    });

    $scope.getBackendLogURL = function(app) {
        return DataikuAPI.webapps.getBackendLogURL(app.projectKey, app.id);
    };
});


app.controller("WebAppSummaryController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'webapps', null, 'summary');

    function refreshTimeline() {
        DataikuAPI.timelines.getForObject($stateParams.projectKey, "WEB_APP", $stateParams.webAppId)
            .success(function(data){
                $scope.timeline = data;
            })
            .error(setErrorInScope.bind($scope));
    }

    $scope.$on("objectSummaryEdited", $scope.saveWebAppMetadata);

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields(customFields);
    });
});

app.controller("WebAppPageRightColumnActions", async function($controller, $scope, $q, $rootScope, $stateParams, ActiveProjectKey, DataikuAPI, WT1) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});
    $controller("WebAppCoreController", {$scope: $scope});

    $scope.webAppFullInfo = (await DataikuAPI.webapps.getFullInfo(ActiveProjectKey.get(), $stateParams.webAppId)).data;
    $scope.app = $scope.webAppFullInfo.webapp;
    $scope.app.nodeType = 'WEB_APP';
    $scope.app.interest = $scope.webAppFullInfo.interest;


    $scope.selection = {
        selectedObject : $scope.app,
        confirmedItem : $scope.app
    };

    $scope.updateUserInterests = function() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "WEB_APP", ActiveProjectKey.get(), $scope.app.id)
            .success(function(data){
                $scope.selection.selectedObject.interest = data;
            })
            .error(setErrorInScope.bind($scope));
    }

    const interestsListener = $rootScope.$on('userInterestsUpdated', $scope.updateUserInterests);

    const backendRestartListener = $rootScope.$on('backendRestarted',function () {$scope.sharedState.backendRunning = true;});
    const backendStopListener = $rootScope.$on('backendStopped',function () {$scope.sharedState.backendRunning = false;});

    $scope.$on("$destroy", function() {
            interestsListener();
            backendRestartListener();
            backendStopListener();
        });

});

app.directive('webAppRightColumnSummary', function(DataikuAPI, $stateParams, GlobalProjectActions, QuickView, $controller, ActivityIndicator, $rootScope){
    return {
        templateUrl :'/templates/webapps/right-column-summary.html',
        link : function($scope, element, attrs) {
            $controller("WebAppsCommonController", {$scope: $scope});
            $controller('_TaggableObjectsMassActions', {$scope: $scope});
            $controller('_TaggableObjectsCapabilities', {$scope: $scope});

            $scope.QuickView = QuickView;

            /* Auto save when summary is modified */
            $scope.$on("objectSummaryEdited", function(){
                DataikuAPI.webapps.saveMetadata($scope.app).success(function(data) {
                    ActivityIndicator.success("Saved");
                }).error(setErrorInScope.bind($scope));
            });

            $scope.refreshData = function() {
                $scope.webAppFullInfo = { webapp: $scope.selection.selectedObject }; // temporary incomplete data
                DataikuAPI.webapps.getFullInfo($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.id).success(function(data) {
                    if (!$scope.selection.selectedObject
                        || $scope.selection.selectedObject.id != data.webapp.id
                        || $scope.selection.selectedObject.projectKey != data.webapp.projectKey) {
                        return; //too late!
                    }
                    $scope.webAppFullInfo = data;
                    $scope.app = data.webapp;
                }).error(setErrorInScope.bind($scope));
            };

            $scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) return;
                $scope.refreshData();
            });
        }
    }
});

app.controller("NewWebAppModalController", function($scope, $window, $state, $stateParams, $controller, DataikuAPI, WT1, FutureWatcher, SpinnerService, PluginsService, WebAppsService, PluginConfigUtils) {

    $scope.usedInsightNames = ($scope.listItems || []).map(function(x){return (x.name || '').toLowerCase();});

    $scope.app = {
        type: '',
        name: '',
        params: {},
        config: {},
        configFromRole: {}
    };

    $scope.searchFilter = '';

    DataikuAPI.webapps.listTypes().then(resp => {
        const descriptors = Object.values(resp.data);
        function f(a, b) {
            const x = (a.meta.label||a.id).toUpperCase();
            const y = (b.meta.label||b.id).toUpperCase();
            if (x < y) {
                return -1;
            }
            if (x > y) {
                return 1;
            }
            return 0;
        }
        $scope.codeWebApps = descriptors.filter(d => !d.baseType).sort(f).reverse();
        $scope.visualWebApps = descriptors.filter(d => d.baseType && (d.roles == null || d.roles.length == 0)).sort(f);

        if ($scope.webappCategory === 'visual' && (!$scope.app || !$scope.app.type) && $scope.visualWebApps.length > 0) {
            $scope.chooseType($scope.visualWebApps[0].id);
        }
    });

    $scope.create = function(preferVirtualOrPersisted){
        WT1.event("webapp-create", { webAppId: $stateParams.id || $scope.app.id, type: $scope.app.webappType || $scope.app.type });

        $scope.isCreating = true;
        DataikuAPI.webapps.create($stateParams.projectKey, $scope.app.name, $scope.app.webappType || $scope.app.type, $scope.app.template, $scope.app.config)
        .success(function(result) {
            $scope.app.id = result.webAppId;

            if (result.backendState && !result.backendState.hasResult) { // There is a backend still starting, wait for it
                SpinnerService.lockOnPromise(FutureWatcher.watchJobId(result.backendState.jobId)
                .success(function(data) {
                    $scope.app.backendReadyOrNoBackend = true;
                    $scope.resolveModal($scope.app);
                }).error(function(data, status, headers) {
                    $scope.app.backendReadyOrNoBackend = false;
                    $scope.resolveModal($scope.app);
                }));
            } else { // No backend, nothing to wait for
                if ($scope.desc && 'hasBackend' in $scope.desc) { // only defined for visual webapps
                    $scope.app.backendReadyOrNoBackend = !$scope.desc.hasBackend;
                } else {
                    $scope.app.backendReadyOrNoBackend = false; // go to edit tab upon creation for code webapp
                }
                $scope.resolveModal($scope.app);
            }
        }).error(function(data, status, headers, config, statusText, xhrStatus) {
            $scope.isCreating = false;
            setErrorInScope.bind($scope)(data, status, headers, config, statusText, xhrStatus);
        });
    };

    $scope.chooseType = function(type) {
        if (!type) {
            throw new Error("Choose webapp type: type parameter required");
        }

        if (type == 'STANDARD') {
            $controller("StandardWebAppController", {$scope: $scope});
        } else if (type == 'BOKEH') {
            $controller("BokehWebAppController", {$scope: $scope});
        } else if (type == 'DASH') {
            $controller("DashWebAppController", {$scope: $scope});
        } else if (type == 'SHINY') {
            $controller("ShinyWebAppController", {$scope: $scope});
        }

        $scope.app.type = type;
        $scope.loadedDesc = WebAppsService.getWebAppLoadedDesc(type) || {};
        $scope.desc = $scope.loadedDesc.desc;
        $scope.pluginDesc = WebAppsService.getOwnerPluginDesc(type);

        if ($scope.pluginDesc && $scope.desc && $scope.desc.params) {
            $scope.app.config = angular.copy($scope.app.configFromRole);
            PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.app.config);
        }

        DataikuAPI.webapps.listTemplates(type).success(function(data) {
            $scope.availableTemplates = data.templates;
            $scope.app.template = $scope.availableTemplates[0];
        }).error(setErrorInScope.bind($scope));

        setTimeout(function(){
            $($window).trigger('resize.modal');
            $('#webapp-name').focus();
        });
        ;
    };


    $scope.getWebAppTypeName = function(webappType) {
        return WebAppsService.getWebAppTypeName(webappType);
    };
});


app.controller("CopyWebAppModalController", function($scope, $state, DataikuAPI, ActivityIndicator, StateUtils, WT1) {

    $scope.newWebApp = {
        name: "Copy of "+$scope.app.name
    };

    $scope.copyWebApp = function() {
        WT1.event("webapp-copy", {type: $scope.app.type});
        return DataikuAPI.webapps.copy($scope.app.projectKey, $scope.app.id, $scope.newWebApp.name)
        .success(function(createdWebApp) {
            $scope.resolveModal(createdWebApp);
            let href = $state.href("projects.project.webapps.webapp.edit", {projectKey: createdWebApp.projectKey, webAppId: createdWebApp.id});

            ActivityIndicator.success(
                '<strong>'+$scope.app.name + '</strong> copied into <strong>' + createdWebApp.name + '</strong>, ' +
                '<a href="'+href+'">edit it now</a>.'
                , 5000);
            if ($scope.list) {
                $scope.list();
                $scope.selection.selectedObject = null;
            }
        })
        .error(setErrorInScope.bind($scope))
    };
});


app.controller("WebAppHistoryController", function($scope, TopNav) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, "webapps", null, "history");
});

app.controller("WebAppLogsController", function($scope, $stateParams, $timeout, $q, TopNav, DataikuAPI, WT1) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, "webapps", null, "logs");

    $scope.restartBackend = function(app) {
        var deferred = $q.defer();
        $scope.start(app).then($scope.refreshBackendLog, $scope.refreshBackendLog);
        return deferred.promise;
    };

    $scope.refreshBackendLog = function() {
        DataikuAPI.webapps.getBackendState($scope.app)
            .success(function(result) {
                $scope.setBackendLogs(result);
            }).error(setErrorInScope.bind($scope));
    };
    $scope.refreshBackendLog();
});

app.controller("_PreviewWebAppController", function($scope, $q, $sce, ActivityIndicator, DataikuAPI, Logger, $rootScope) {
    $scope.startUpdatePreview = function() {
        if ($scope.backendEnabled() && $scope.sharedState.backendRunning !== true) {
            Logger.warn("Not updating preview, backend is not running ...", printStackTrace());
            return;
        }
        return DataikuAPI.webapps.getBackendState($scope.app)
            .success(handleBackendStateResult)
            .error(setErrorInScope.bind($scope));
    };

    $scope.renderPreview = function(iframe) {
        if (!iframe || !iframe.length) {return;}
        if (!$scope.sharedState.backendState) {return;}
        startUpdatePreviewIFrameSource(iframe)
    };

    function startUpdatePreviewIFrameSource(iframe) {
        if ($scope.sharedState.backendState) {
            if ($rootScope.appConfig.webappsIsolationMode === "SANDBOX") {
                iframe.get(0).sandbox = "allow-forms allow-pointer-lock allow-popups allow-scripts" ;
            }
            $scope.getViewURL($scope.app).then(function(url) {
                iframe.attr('src', url);
            });
        }
    }

    function handleBackendStateResult(backendState) {
        if (backendState) {
            if ($scope.backendEnabled()) {
                $scope.sharedState.backendRunning = !!(backendState.futureId && backendState.futureInfo && backendState.futureInfo.alive);
                $scope.setBackendLogs(backendState);
                if (!backendState.futureInfo || !backendState.futureInfo.alive) {
                    ActivityIndicator.error("Backend not running");
                } else {
                    $scope.$broadcast("previewDataUpdated");
                }
            } else {
                $scope.$broadcast("previewDataUpdated");
            }
        } else {
            $scope.$broadcast("previewDataUpdated");
        }
    }
});


app.controller("_BokehDashOrShinyLikeWebAppController", function($scope, $controller, $q, $sce, ActivityIndicator, DataikuAPI, Logger, $rootScope) {
    $controller("_PreviewWebAppController", {$scope:$scope});
    
    $scope.availableTemplates = [
        {
            id : "default",
            label : "Default code"
        },
        {
            id : "empty",
            label : "Empty webapp"
        }
    ];
    $scope.defaultTemplate = 'default';

    $scope.backendEnabled = function (webapp) {
        return true;
    };

    $scope.showFrontendTabs = function(webapp) {
        return false;
    };
});


app.service('WebAppsService', function($rootScope, PluginsService) {
    const svc = this;
    svc.getWebAppLoadedDesc = function(webappType) {
        return $rootScope.appConfig.customWebApps.find(x => x.webappType == webappType);
    };
    svc.getOwnerPluginDesc = function(webappType) {
        return PluginsService.getOwnerPluginDesc(svc.getWebAppLoadedDesc(webappType));
    };
    svc.getWebAppIcon = function(webappType) {
        const loadedDesc = svc.getWebAppLoadedDesc(webappType);
        if (loadedDesc && loadedDesc.desc && loadedDesc.desc.meta && loadedDesc.desc.meta.icon) {
            return loadedDesc.desc.meta.icon;
        } else {
            const pluginDesc = PluginsService.getOwnerPluginDesc(loadedDesc);
            if (pluginDesc) {
                return pluginDesc.icon || "icon-puzzle-piece";
            } else {
                return "icon-puzzle-piece"; // plugin has been removed
            }
        }
    };
    svc.getWebAppTypeName = function(webappType) {
        const loadedDesc = svc.getWebAppLoadedDesc(webappType);
        if (loadedDesc && loadedDesc.desc && loadedDesc.desc.meta && loadedDesc.desc.meta.label) {
            return loadedDesc.desc.meta.label;
        } else {
            return webappType.toLowerCase();
        }
    };
    svc.getBaseType = function(webappType) {
        if (!webappType) return;
        const loadedDesc = svc.getWebAppLoadedDesc(webappType);
        if (loadedDesc && loadedDesc.desc && loadedDesc.desc.baseType) {
            return loadedDesc.desc.baseType;
        }
        return webappType;
    };
    svc.getSkins = function(objectType, path, contentType) {
        return $rootScope.appConfig.customWebApps.filter(function(w) {
            return (w.desc.roles || []).filter(function(r) {
                                                                if (r.type != objectType) return false;
                                                                if (path != null && path.length > 0) {
                                                                    // file in folder or version in model
                                                                    if (r.pathParamsKey == null || r.pathParamsKey.length == 0) return false;
                                                                } else {
                                                                    // folder or model
                                                                    if (r.pathParamsKey != null && r.pathParamsKey.length > 0) return false;
                                                                }
                                                                if (r.contentType != null && r.contentType.length > 0) {
                                                                    // additional filter on contentType
                                                                    if (contentType == null || contentType.length == 0) return false;
                                                                    if (!contentType.startsWith(r.contentType)) return false;
                                                                }
                                                                return true;
                                                            }).length == 1;
        });
    };
});

app.directive('webAppInfra', function(DataikuAPI, $stateParams, $controller, PluginConfigUtils, $timeout){
    return {
        templateUrl :'/templates/webapps/web-app-infra.html',
        scope : {
            infra: '=webAppInfra',
            webAppType: '='
        },
        link : function($scope, $element, attrs) {
            $scope.isVirtualWebappSettings = (!$stateParams.projectKey) && (!$stateParams.webAppId);
            // watch for changes in the container selection
            function fetchInfo() {
                if ($scope.infra && $scope.infra.containerSelection) {
                    DataikuAPI.containers.getConfigInfo($stateParams.projectKey, "WEBAPP", "WEBAPP", $scope.infra.containerSelection, null).success(function(data) {
                        $scope.containerInfo = data;
                    }).error(setErrorInScope.bind($scope));
                }
            };
            fetchInfo();
            $scope.$watch("infra.containerSelection", function(nv, ov) {
                if (!angular.equals(ov, nv)) fetchInfo()
            }, true);
        }
    }
});

// directive to maintain a $containerInfo field in the scope
app.controller('FetchContainerInfoController', function($scope, DataikuAPI, $stateParams, $controller, PluginConfigUtils, $timeout) {
    // watch for changes in the container selection
    function fetchInfo() {
        if ($scope.exposableKind && ($scope.containerSelection || $scope.inlineContainerConfig)) {
            DataikuAPI.containers.getConfigInfo($stateParams.projectKey, $scope.exposableKind, $scope.expositionUsageContext, $scope.containerSelection, $scope.inlineContainerConfig).success(function(data) {
                $scope.$containerInfo = data;
            }).error(setErrorInScope.bind($scope));
        } else if ($scope.containerType) {
            DataikuAPI.containers.getExpositions($scope.containerType, $scope.exposableKind, $scope.expositionUsageContext).success(function(data) {
                $scope.$containerInfo = data;
            }).error(setErrorInScope.bind($scope));
        }
    };
    // for when the containerInfo is set from outside (webapps)
    $scope.$watch("containerInfo", function() {
        if ($scope.containerInfo) {
            $scope.$containerInfo = $scope.containerInfo;
        }
    });
    // if the parent of this directive is not filling the containerInfo itself, do it
    if ($scope.containerInfo) {
        $scope.$containerInfo = $scope.containerInfo;
    } else {
        fetchInfo();
    }
    $scope.$watch("containerSelection", function(nv, ov) {
        if (!angular.equals(ov, nv)) fetchInfo()
    }, true);
    $scope.$watch("inlineContainerConfig", function(nv, ov) {
        if (!angular.equals(ov, nv)) fetchInfo()
    }, true);
    $scope.$watch("exposableKind", function(nv, ov) {
        if (!angular.equals(ov, nv)) fetchInfo()
    }, false);
});


app.directive('serviceExposition', function(DataikuAPI, $stateParams, $controller, PluginConfigUtils, $timeout, $rootScope){
    return {
        templateUrl :'/templates/webapps/service-exposition.html',
        scope : {
            exposition: '=serviceExposition',
            containerInfo: '=',
            exposableKind: '=',
            containerType: '=',
            expositionUsageContext: '=',
            containerSelection: '=',
            inlineContainerConfig: '='
        },
        link : function($scope, $element, attrs) {
            $controller('FetchContainerInfoController', {$scope});
            function getPluginInfoIfNeeded() {
                if ($scope.$exposition == null || $scope.exposition == null) return;
                // find the plugin if exposition is provided by a plugin
                $scope.$exposition.loadedDesc = $rootScope.appConfig.customExpositions.filter(function(x){
                    return x.expositionType == $scope.exposition.type;
                })[0];
            };
            // watch for changes in the containerInfo, to adjust the exposition
            function fixupExposition() {
                if ($scope.$containerInfo) {
                    if ($scope.$containerInfo.expositions) {
                        let currentExpositionType = $scope.exposition ? $scope.exposition.type : null;
                        $scope.$exposition = $scope.$containerInfo.expositions.filter(function(e) {return e.type == currentExpositionType;})[0];
                        if ($scope.$exposition == null) {
                            $scope.$exposition = $scope.$containerInfo.expositions[0];
                            $scope.exposition = $scope.exposition || {};
                            $scope.exposition.type = $scope.$exposition ? $scope.$exposition.type : null;
                        }
                        getPluginInfoIfNeeded();
                    } else {
                        $scope.exposition = null; // to set the default
                    }
                }
            };
            $scope.$watch("$containerInfo", fixupExposition, true);
 
            // watch for changes in the $exposition to set the type
            $scope.$watch("exposition.type", function(nv, ov) {
                if ($scope.exposition && $scope.exposition.type) {
                    $scope.exposition = $scope.exposition || {};
                    if ($scope.$containerInfo && $scope.$containerInfo.expositions) {
                        $scope.$exposition = $scope.$containerInfo.expositions.filter(function(e) {return e.type == $scope.exposition.type;})[0];
                        getPluginInfoIfNeeded();
                    }
                    $scope.exposition.params = $scope.exposition.params || {};
                    if ($scope.$exposition && $scope.$exposition.params) {
                        PluginConfigUtils.setDefaultValues($scope.$exposition.params, $scope.exposition.params);
                    }
                }
            }, false);
        }
    }
});
   
app.directive('deploymentHpa', function(DataikuAPI, $stateParams, $controller, PluginConfigUtils, $timeout){
    return {
        templateUrl :'/templates/webapps/deployment-hpa.html',
        scope : {
            scaling: '=deploymentHpa',
            containerInfo: '=',
            exposableKind: '=',
            containerType: '=',
            expositionUsageContext: '=',
            containerSelection: '=',
            inlineContainerConfig: '='
        },
        link : function($scope, $element, attrs) {
            $controller('FetchContainerInfoController', {$scope});
            
            var doShowExtraMetrics = false;
            $scope.areExtraMetricsShown = function() {
                return doShowExtraMetrics || $scope.scaling.extraMetrics;
            };
            $scope.showExtraMetrics = function() {
                doShowExtraMetrics = true;
            };
        }
    }
});

 app.directive('yamlModifier', function(DataikuAPI, $stateParams, $controller, PluginConfigUtils, $timeout){
    return {
        templateUrl :'/templates/webapps/yaml-modifier.html',
        scope : {
            yamlModifier: '=yamlModifier',
            containerInfo: '=',
            exposableKind: '=',
            containerType: '=',
            expositionUsageContext: '=',
            containerSelection: '=',
            inlineContainerConfig: '='
        },
        link : function($scope, $element, attrs) {
            $controller('FetchContainerInfoController', {$scope});
            
            $scope.uiState = {runnableType:null, runnableTypes:[{runnableType:null, desc:{meta:{label:'None'}, params:[]}}]};
            
            let fixupRunnableType = function() {
                // clear the runnable type if it's not valid
                if ($scope.$containerInfo && $scope.yamlModifier && $scope.yamlModifier.runnableType) {
                    let existing = $scope.$containerInfo.yamlModifiers.filter(function(e) {return e.runnableType == $scope.yamlModifier.runnableType;});
                    if (!existing || existing.length == 0) {
                        $scope.yamlModifier.runnableType = null;
                        $scope.uiState.runnableType = null;
                    } else {
                         $scope.$yamlModifier = existing[0];
                    }
                }
            };
            
            $scope.$watch('$containerInfo', function() {
                if ($scope.$containerInfo) {
                    $scope.uiState.runnableTypes.splice(1, $scope.uiState.runnableTypes.length - 1);
                    $scope.$containerInfo.yamlModifiers.forEach(function(d) {
                        $scope.uiState.runnableTypes.push(d)
                    });
                }
                fixupRunnableType();
            });
            
            let setRunnableTypeFromRunnable = function() {
                $scope.uiState.runnableType = $scope.yamlModifier.runnableType;
            };
            
            let setRunnableTypeFromUI = function() {
                let choice = $scope.uiState.runnableTypes.filter(function(e) {return e.runnableType == $scope.uiState.runnableType})[0];
                if (!choice) return;
                if (choice.runnableType == $scope.yamlModifier.runnableType) return;
                $scope.yamlModifier.runnableType = choice.runnableType;
            };
            $scope.$watch('uiState.runnableType', setRunnableTypeFromUI);
            
            let init = function() {
                if (!$scope.yamlModifier.config) {
                    $scope.yamlModifier.config = {};
                }

                fixupRunnableType();

                $scope.$watch("yamlModifier.runnableType", function(nv, ov) {
                    if ($scope.uiState.runnableTypes) {
                        $scope.$yamlModifier = $scope.uiState.runnableTypes.filter(function(e) {return e.runnableType == $scope.yamlModifier.runnableType;})[0];
                    } else {
                        $scope.$yamlModifier = null;
                    }
                    if ($scope.$yamlModifier) {
                        if ($scope.yamlModifier.config == null) {
                            $scope.yamlModifier.config = {};
                        }
                        PluginConfigUtils.setDefaultValues($scope.$yamlModifier.desc.params, $scope.yamlModifier.config);
                    }
                });
                setRunnableTypeFromRunnable();
            };
            if ($scope.yamlModifier) {
                init();
            } else {
                let deregister = $scope.$watch("yamlModifier", function() {
                    if ($scope.yamlModifier) {
                        init();
                        deregister();
                    }
                });
            }
        }
    }
});
   

})();
