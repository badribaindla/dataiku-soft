(function() {
'use strict';

const app = angular.module('dataiku.webapps');


app.controller("WebAppViewController", function($scope, $stateParams, $rootScope, $state, $q, $sce, $controller, CreateModalFromTemplate, DataikuAPI, WT1, TopNav) {

    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'webapps', null, 'view');

    $scope.setupTypeSpecificWebAppBehaviour();
    $scope.getViewURL($scope.app).then(function(url) {
        $scope.iFrameUrl = url;
    });

    $scope.restartBackend = function(app) {
        var deferred = $q.defer();
        $scope.start(app)
            .then($scope.hooks.refreshWebAppView);
        return deferred.promise;
    };

    $scope.hooks.refreshWebAppView = function() {
        const iframe = $('iframe.webapp-container');
        $scope.getViewURL($scope.app).then(function(url) {
            iframe.attr('src', url);
        });
    };

    const backendRestartListener = $rootScope.$on('backendRestarted',function () {$scope.sharedState.backendRunning = true;});
    const backendStopListener = $rootScope.$on('backendStopped',function () {$scope.sharedState.backendRunning = false;});

    $scope.$on("$destroy", function() {
        backendRestartListener();
        backendStopListener();
    });
});

app.service('VirtualWebApp', function($stateParams, $q, DataikuAPI, Logger, WebAppsService, $compile, FutureWatcher,
    FutureProgressModal, LocalStorage, PluginConfigUtils) {
    function updateSkin($scope, $container, webAppTypeProp, webAppConfigProp, projectKey, objectId, objectType,
        pathInObject, uiState, reuseConfig) {

        const webAppType = $scope.$eval(webAppTypeProp);
        let localStorageKey = objectType + '.' + webAppType + '/' + projectKey + '.' + objectId + '/' + pathInObject;
        if ($scope.insight) {
            // for dashboards when multiple views in the same slide
            localStorageKey += "/insight-" + $scope.insight.id;
        } 
        const stored = LocalStorage.get(localStorageKey);
        if (stored) {
            Logger.info("Found stored for " + localStorageKey, stored);
            if ($scope.storedWebAppId === undefined || $scope.storedWebAppId !== stored.webAppId) {
                $scope.storedWebAppId = stored.webAppId;
                if (stored.cfg) {
                    // unplug the watch otherwise one webapp will 'bleed' on the next
                    if ($scope.webAppConfigDeregister) {
                        $scope.webAppConfigDeregister();
                        $scope.webAppConfigDeregister = null;
                    }

                    if (reuseConfig) {
                        // do this before the let webAppConfig = ...
                        $scope[webAppConfigProp] = stored.cfg;
                    }
                }
            }
        }

        uiState.forgetAndRegenerateWebAppView = function() {
            LocalStorage.set(localStorageKey, null);
            if (uiState.regenerateWebAppView) {
                uiState.regenerateWebAppView();
            }
        }

        let webAppConfig = $scope.$eval(webAppConfigProp);

        const hooks = {
            webAppReady: function(webAppId) {
                Logger.info("Store webapp id", webAppId);
                LocalStorage.set(localStorageKey, {webAppId:webAppId, cfg:webAppConfig});
                setCurrentWebAppConfig(webAppId, webAppConfig);

                if ($scope.webAppConfigDeregister) {
                    $scope.webAppConfigDeregister();
                }
                $scope.webAppConfigDeregister = $scope.$watch(webAppConfigProp, function() {
                    LocalStorage.set(localStorageKey, {webAppId:webAppId, cfg:$scope.$eval(webAppConfigProp)});
                    setCurrentWebAppConfig(webAppId, webAppConfig);
                }, true);
            }
        };

        function setCurrentWebAppConfig(webAppId, webAppConfig) {
            $scope.storedWebAppId = webAppId;
            $scope[webAppConfigProp] = webAppConfig;
        }

        return svc.update($scope, $container, webAppTypeProp, webAppConfigProp,
            DataikuAPI.webapps.getOrCreatePluginSkin.bind($scope, projectKey, objectType, objectId, webAppType, webAppConfig),
            uiState, hooks);
    }

    const svc = {
        changeSkin: function($scope, roleType, skin, uiState, skinHolderCSSClass, targetParamsKey, pathParamsKey,
        reuseConfig) {
            if (!skin || !skin.webappType) return;

            if (skin.webappType != $scope.webAppType) {
                Logger.info("Skin type change to " + skin.webappType);
                $scope.webAppConfig = {};
                if ($scope.webAppCustomConfig) {
                    // webAppCustomConfig from the dashboard param tile
                    $scope.webAppConfig = {
                        ...$scope.webAppCustomConfig
                    }
                }
                $scope.webAppType = skin.webappType;
                $scope.loadedDesc = WebAppsService.getWebAppLoadedDesc($scope.webAppType) || {};
                $scope.desc = $scope.loadedDesc.desc;
                $scope.pluginDesc = WebAppsService.getOwnerPluginDesc($scope.webAppType);
                PluginConfigUtils.setDefaultValues($scope.loadedDesc.desc.params, $scope.webAppConfig);
                const role = $scope.loadedDesc.desc.roles.filter(r => r.type === roleType)[0];
                $scope.webAppConfig[role.targetParamsKey] = targetParamsKey;
                if (pathParamsKey) {
                    $scope.webAppConfig[role.pathParamsKey] = pathParamsKey;
                }
            }

            const $container = angular.element($('.' + skinHolderCSSClass));

            uiState.skinWebApp = {};

            updateSkin($scope, $container, 'webAppType', 'webAppConfig',
                $stateParams.sourceProjectKey || $stateParams.projectKey, targetParamsKey, roleType, pathParamsKey,
                uiState.skinWebApp, reuseConfig);
        },
        update: function($scope, $container, webAppTypeProp, webAppConfigProp, getOrCreate, uiState, hooks) {
            Logger.info("Update virtual webapp in scope " + $scope.$id + " with container scope " + $container.scope().$id);

            var deferred = $q.defer();
            let existingWebAppId = null;
            // check is the webapp is already shown
            let existing = $container.find("div[virtual-web-app-holder]");
            if (existing.length > 0) {
                existingWebAppId = existing.attr("web-app-id");
                Logger.info("Located an existing webapp " + existingWebAppId);
            }
            let insightWebAppId = null;
            if (existingWebAppId == null && $scope.insight) {
                let localStorageKey = "insight-chart-" + $stateParams.projectKey + "." + $scope.insight.id;
                insightWebAppId = LocalStorage.get(localStorageKey);
                if (insightWebAppId) {
                    Logger.info("Located an existing webapp for the insight " + insightWebAppId);
                }
            }
            if ($scope.webAppCreationInProgress) {
                deferred.reject("already creating");
                return;
            }
            let runningWebAppId = $scope.storedWebAppId || existingWebAppId || insightWebAppId;

            let getIframeWindow = function() {
                let chartIframe = $container.find("iframe");
                if (!chartIframe || chartIframe.length == 0) {
                    Logger.warn("Failed to find chart's iframe", $container);
                    return null;
                } else {
                    return chartIframe[0].contentWindow;
                }
            };

            let sendConfig = function() {
                let iframeWindow = getIframeWindow();
                if (iframeWindow) {
                    let cfg = $scope.$eval(webAppConfigProp);
                    if (hooks && hooks.webAppConfigPreparation) {
                        cfg = hooks.webAppConfigPreparation(cfg);
                    }
                    iframeWindow.postMessage(JSON.stringify(cfg), location.origin)
                } else {
                    Logger.warn("Chart's iframe is not ready");
                }
            };
            
            if ($container.scope().pingFromWebapp == null) {
                $container.scope().pingFromWebapp = function(event) {
                    // check if it's from our iframe
                    let iframeWindow = getIframeWindow();
                    if (event.source && event.source == iframeWindow) {
                        Logger.info("Got ping from my iframe in " + $container.scope().$id + " saying " + event.data);
                        if (event.data == 'sendConfig') {
                            sendConfig();
                        }
                    }
                };
                Logger.info("Setup ping from child iframe listener in " + $container.scope().$id);
                window.addEventListener('message', $container.scope().pingFromWebapp);
                $container.scope().$on('$destroy', function () {
                    Logger.info("Teardown ping from child iframe listener in " + $container.scope().$id);
                    window.removeEventListener('message', $container.scope().pingFromWebapp);
                });
            } 

            var webAppConfigPropDeregister = null;
            if (!(uiState && uiState.noConfigWatch) && $scope.watchingWebAppConfigProp == null) {
                $scope.watchingWebAppConfigProp = true; // register a watch only once per scope
                webAppConfigPropDeregister = $scope.$watch(webAppConfigProp, sendConfig, true);
            }
            if (hooks && hooks.stopFunction != null && webAppConfigPropDeregister != null) {
                var stopFunctionDeregister = $scope.$watch(hooks.stopFunction, function() {
                    if (hooks.stopFunction()) {
                        webAppConfigPropDeregister();
                        stopFunctionDeregister();
                    }
                });
            }

            function cleanupExisting() {
                // cleanup scopes manually since we touch the DOM directly
                let existing = $container.find("div[virtual-web-app-holder]");
                if (existing.length > 0) {
                    Logger.info("Found existing holder to destroy in scope ", existing.scope().$id);
                    existing.scope().$destroy();
                }
                $container.html('');
            }

            var refreshWebAppView = function() {
                Logger.info("Update webapp shown to " + $scope.webAppId);
                if (!$scope.webAppId) {
                    return;
                }
                cleanupExisting();
                let newElement = $compile('<div class="h100" virtual-web-app-holder web-app-id="webAppId" web-app-type="' + webAppTypeProp + '"></div>')($scope.$new());
                newElement.attr("web-app-id", $scope.webAppId);
                $container.html(newElement);
                existingWebAppId = $scope.webAppId;
                if (uiState && uiState.skinWebApp) uiState.skinWebApp.webAppId = $scope.webAppId;
                
                if ($scope.insight) {
                    let localStorageKey = "insight-chart-" + $stateParams.projectKey + "." + $scope.insight.id;
                    LocalStorage.set(localStorageKey, existingWebAppId);
                }
            }

            function doCreation(webAppId) {
                if (uiState && uiState.skinWebApp) uiState.skinWebApp.webAppId = $scope.webAppId;
                $scope.webAppCreationInProgress = true;
                getOrCreate(webAppId)
                    .success(function (data) {
                        $scope.webAppCreationInProgress = false;
                        uiState.webAppId = data.webapp.id;
                        uiState.hasBackend = data.resp.backendState != null;
                        let showWebappIfNew = function() {
                            Logger.info("show if needed " + data.webapp.id + " vs. " + existingWebAppId);
                            if (data.webapp.id != existingWebAppId) {
                                $scope.webAppId = data.webapp.id;
                                refreshWebAppView();
                                sendConfig();
                            }
                        };
                        if (data.resp.backendState && data.resp.backendState.hasResult == false) {
                            // webapp backend is still starting
                            if ($scope.tile) {
                                $scope.chartSpecific = $scope.chartSpecific || {};
                                $scope.chartSpecific.backendStarting = true;
                                // don't show a in-your-face modal on dashboards (imagine several charts on the same)
                                FutureWatcher.watchJobId(data.resp.backendState.jobId)
                                .success(function() {
                                    $scope.chartSpecific.backendStarting = false;
                                    showWebappIfNew();
                                    sendConfig();
                                }).error(function(a,b,c) {
                                    $scope.chartSpecific.backendStarting = false;
                                    if (hooks && hooks.handleError != null) {
                                        hooks.handleError(a,b,c);
                                    } else {
                                        setErrorInScope.bind($scope)(a,b,c);
                                    }
                                });
                            } else {
                                FutureProgressModal.show($scope, data.resp.backendState, "Starting view")
                                .then(function() {
                                   showWebappIfNew();
                                   sendConfig();
                                });
                            }
                        } else {
                           showWebappIfNew();
                           sendConfig();
                        }
                        if (hooks && hooks.webAppReady) {
                            hooks.webAppReady(data.webapp.id);
                        }
                        deferred.resolve(data.webapp.id);
                    }).error(function(a,b,c) {
                        $scope.webAppCreationInProgress = false;
                        if (hooks && hooks.handleError != null) {
                            hooks.handleError(a,b,c);
                        } else {
                            setErrorInScope.bind($scope)(a,b,c);
                        }
                        deferred.reject("failed to create webapp");
                    });
            }

            uiState.refreshWebAppView = refreshWebAppView;
            uiState.regenerateWebAppView = function() {
                if (uiState.hasBackend) {
                    // kill it now, since we'll forget the webappid just after, and nobody else can have this webapp open
                    DataikuAPI.webapps.stopBackend({projectKey:$stateParams.projectKey, id:$scope.webAppId}); // don't care about the outcome
                }
                $scope.webAppId = null;
                cleanupExisting();
                doCreation(null);
            }
            uiState.restartBackend = function() {
                DataikuAPI.webapps.restartBackend({projectKey:$stateParams.projectKey, id:$scope.webAppId}).success(function(result) {
                    if (!result.alive && result.hasResult) {
                        // already finished
                       refreshWebAppView();
                       sendConfig();
                    } else {
                        FutureProgressModal.show($scope, result, "Restarting backend").then(function() {
                           refreshWebAppView();
                           sendConfig();
                        });
                    }
                }).error(function(a,b,c) {
                    if (hooks && hooks.handleError != null) {
                        hooks.handleError(a,b,c);
                    } else {
                        setErrorInScope.bind($scope)(a,b,c);
                    }
                });
            }

            // start the webapp
            doCreation(runningWebAppId);

            // make sure we cleanup when the webapp holder is removed (caution: the $scope is not necessarily that of the $container)
            $container.scope().$on('$destroy', function () {
                Logger.info("Teardown virtual webapp shown in " + $scope.$id);
                cleanupExisting();
            });

            return deferred.promise;
        }
    };
    return svc;
});

app.directive('virtualWebAppHolder', function($stateParams, $controller, $q, DataikuAPI, Logger, WebAppsService, $interval, Notification) {
    return {
        templateUrl: '/templates/webapps/virtual-web-app-holder.html',
        scope: {
            webAppType: '=',
            webAppId: '='
        },
        link: function($scope, element, attrs) {
            Logger.info("Linking virtual webApp holder in " + $scope.$id);
            $scope.element = element;

            const baseType = WebAppsService.getBaseType($scope.webAppType);
            if (baseType == 'STANDARD') {
                $controller("StandardWebAppController", {$scope: $scope});
            } else if (baseType == 'BOKEH') {
                $controller("BokehWebAppController", {$scope: $scope});
            } else if (baseType == 'DASH') {
                $controller("DashWebAppController", {$scope: $scope});
            } else if (baseType == 'SHINY') {
                $controller("ShinyWebAppController", {$scope: $scope});
            } else {
                Logger.error("Unknown app type: ", $scope.webAppType);
            }

            $scope.$watch('webAppId', function() {
                if ($scope.webAppId == null) {
                    return;
                }
                var app = {
                    projectKey: $stateParams.projectKey,
                    id: $scope.webAppId
                };
                $scope.getViewURL(app).then(function(url) {
                    $scope.iFrameUrl = url;
                });

                // ditch previous kept alive (even if it's the same webapp)
                if ($scope.cancelKeepAlive) {
                    Logger.info("[-] keepalive for " + app.projectKey + '.' + app.id + " in " + $scope.$id);
                    $interval.cancel($scope.cancelKeepAlive);
                }
                // keep the new one alive
                let KEEP_ALIVE_INTERVAL_MS = 10*1000;
                Logger.info("[+] keepalive for " + app.projectKey + '.' + app.id + " in " + $scope.$id);
                $scope.cancelKeepAlive = $interval(function () {
                    Logger.info("keep " + app.projectKey + '.' + app.id + " alive in " + $scope.$id)
                    Notification.publishToBackend('timeoutable-task-keepalive', {
                        taskId: 'webApp:' + app.projectKey + '.' + app.id
                    });
                }, KEEP_ALIVE_INTERVAL_MS);
            });

            $scope.$on('$destroy', function () {
                Logger.info("Stop keeping " + $stateParams.projectKey + '.' + $scope.webAppId + " alive in " + $scope.$id);
                if ($scope.cancelKeepAlive) {
                    $interval.cancel($scope.cancelKeepAlive);
                }
            });
        }
    };
});

})();