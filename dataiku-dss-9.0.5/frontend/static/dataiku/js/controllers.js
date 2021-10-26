(function() {
'use strict';

const app = angular.module('dataiku.controllers', ['dataiku.services', 'dataiku.filters', 'dataiku.markdown']);



app.controller('DataikuController', function($cacheFactory, $filter, $http, $injector, $state, $location, $modal, $q, $rootScope,
       $route, $scope, $controller, $stateParams, $templateCache, $timeout, $exceptionHandler,
       Assert, Dialogs, ActivityIndicator, FlowToolsLoader, Discussions,
       BackendReportsService, Breadcrumb, Throttle, CachedAPICalls, CreateExportModal,
       CreateModalFromTemplate, DataikuAPI, localStorageService, ContextualMenu,
       LoggerProvider, Notification, TopNav, WebSocketService, TrackingService, WT1,
       Markdown, GrelMode, RMarkdownMode, //Not used but included here to force load
       TaggingService, ProjectFolderContext,
       ExportUtils, ErrorReporting, StateUtils, SmartId, IntercomSupport, RecipeDescService, MessengerUtils,
       AlationCatalogChooserService, CodeMirrorSettingService, UserImageUrl, ProjectStatusService, HomePageContextService,
       HomeBehavior, CatalogItemService, Debounce, FeatureFlagsService, DetectUtils, FullScreenService) {
           
    RecipeDescService.load($scope);
    $rootScope.DataikuAPI = DataikuAPI;
    $rootScope.$state = $state;
    $scope.isFullScreen = FullScreenService.isFullScreen;

    TopNav.setLocation(TopNav.DSS_HOME);

    // Since the controller is not properly declared, it's not possible to use "Logger" directly (see angular-instantiable.js)
    const Logger = LoggerProvider.getLogger('DataikuController');
    Logger.info("Starting DSS load");

    window.APIErrorLogger = LoggerProvider.getLogger("api.errors");

    $rootScope.wl = {
        productShortName: "DSS",
        productLongName: "Dataiku DSS"
    }
    $rootScope.dssMinorVersion = "9.0";
    $rootScope.versionDocRoot = "https://doc.dataiku.com/dss/9.0/";
    $rootScope.apiDocRoot = "https://doc.dataiku.com/dss/api/9.0/";
    $rootScope.academyRootUrl = "https://academy.dataiku.com/";
    $rootScope.learnRootUrl = "https://www.dataiku.com/learn/";


    $controller("DatasetsCommon", {$scope: $scope});

    function userAvatar(userLogin, size) {
        if (!userLogin)  return "";
        return '<img class="user-avatar" src="' + UserImageUrl(userLogin, size) + '" /> ';
    }

    function dssObjectLink(objectType, projectKey, objectId, innerHTML) {
        var link = StateUtils.href.dssObject(objectType, objectId, projectKey);
        return '<a href="'+link+'" class="link-std">'+innerHTML+'</a>';
    }

    function userLink(userLogin, innerHTML) {
        return '<a href="/profile/'+escape(userLogin)+'/" class="link-std">'+ innerHTML + '</a>';
    }

    $scope.$on("$stateChangeStart", function(event, toState, toParams, fromState, fromParams) {
        Logger.debug('State: '+((fromState && fromState.name)?fromState.name:'Unknown') + ' -> '+ ((toState && toState.name)?toState.name:'Unknown'), toParams);
    });

    // Check for unsaved changes in the page before leaving:
    window.addEventListener("beforeunload", function (event) {
        try {
            if (typeof window.dssHasDirtyThings == "function" && window.dssHasDirtyThings()) {
                var msg = 'Unsaved changes will be lost';
                event.returnValue = msg; //this string will not be displayed anyway
                return msg;
            }
        } catch (e){
            Logger.error("Failed to compute dirtiness. Let it go.", e);
        }
    });

    $scope.reflow = {};
    $scope.$on('reflow',function() {
        $scope.reflow = {};
    });

    Notification.registerEvent('websocket-status-changed',function(evt,data) {
        $scope.wsFail = false;
        $("body").removeClass("ws-disconnected");
        if(data.code == WebSocketService.ERROR_CODE.CONNECTION_FAILED) {
            $scope.wsFail = true;
        } else if(data.code == WebSocketService.ERROR_CODE.CONNECTION_LOST) {
            $("body").addClass("ws-disconnected");
        }
    });

    $scope.closeContextualMenus = function(){
        ContextualMenu.prototype.closeAny();
    };

    $scope.reconnectWebSocket = function() {
        WebSocketService.connect();
    };

    $scope.sendOfflineQueues = function() {
        DataikuAPI.internal.sendOfflineQueues();
    };
    $scope.failAllBackendCalls = function(fail) {
        DataikuAPI.internal.fail(fail);
    };
    $scope.sendDigests = function() {
        DataikuAPI.internal.sendDigests();
    };
    $scope.buildUsageSummaryReports = function () {
        DataikuAPI.internal.buildUsageSummaryReports();
    };

    /* Put some stuff in the global scopes */
    $rootScope.$stateParams = $stateParams;
    $rootScope.StateUtils = StateUtils;
    $rootScope.SmartId = SmartId;
    $scope.$state = $state;
    $scope.sanitize = sanitize;
    $scope.JSON = JSON;
    $scope.$route = $route;
    $scope.Object = Object;
    $scope.pendingRequests = $http.pendingRequests;
    $rootScope.spinnerPosition = undefined;
    $scope.isTouchDevice = isTouchDevice();

    Breadcrumb.set([])

    $timeout(function() {
        $('.selectpicker').selectpicker();
        $('[data-toggle=dropdown]').dropdown();
     },10);

    /* Some global state management */

    // Preserve Hash in URL (that ui-router discard otherwise)
    // We only do it for predmltask.report and clustmltask.report and mltask.list.design to go to the design page from the train information
    // It's absolutely ugly. But the problem is that keeping the hash seriously
    // breaks history

     var hash;
     $scope.$on('$stateChangeStart', function(e){
         hash = $location.hash();
     })
    $scope.$on('$stateChangeSuccess', function(e, toState){
        if (hash && (toState.name.includes("mltask.report") || toState.name.includes("mltask.list.design"))){
             $location.hash(hash, true).replace(true);
        }
        WT1.setSessionParam("currentState", toState.name);
        WT1.event("state-changed");
        $rootScope.$broadcast("dismissModals");
        $rootScope.$broadcast("dismissPopovers");
    });

    /* *************** Global login / config management ***************** */

    $scope.isSAASAuth = function() {
        return $rootScope.appConfig && $rootScope.appConfig.saasAuth;
    };

    $scope.onConfigurationLoaded = function() {
        IntercomSupport.activate();
        Assert.inScope($rootScope, 'appConfig');

        $rootScope.wl = $rootScope.appConfig.whiteLabeling;

        if ($rootScope.wl.referenceDocRootUrl) {
            $rootScope.versionDocRoot = $rootScope.wl.referenceDocRootUrl;
        }
        if ($rootScope.wl.apiDocRootUrl) {
            $rootScope.apiDocRoot = $rootScope.wl.apiDocRootUrl;
        }
        if ($rootScope.wl.academyRootUrl) {
            $rootScope.academyRootUrl = $rootScope.wl.academyRootUrl;
        }
        if ($rootScope.wl.learnRootUrl) {
            $rootScope.learnRootUrl = $rootScope.wl.learnRootUrl;
        }

        if ($rootScope.appConfig.loggedIn) {
            WebSocketService.connect();
            $scope.countNotifications();
            // Temporary stuff ... Just in case it remained here...
            WT1.delVisitorParam("tutorial-project");
            WT1.delVisitorParam("tutorial-id");
            WT1.configure();
            ErrorReporting.configure();
            TrackingService.configurePingTracking();
            if ($rootScope.appConfig.customJS) {
                function evalCustomJS() {
                    try {
                        eval($rootScope.appConfig.customJS); //NOSONAR
                    } catch (e){
                        $exceptionHandler(e);
                    }
                }
                evalCustomJS();
            }

            if ($rootScope.appConfig.loadedPlugins) {
                $rootScope.appConfig.loadedPlugins.forEach(function(pluginDesc) {
                    if (!pluginDesc.customJSSnippets) {
                        return;
                    }
                    function evalCustomJSSnippet(snippet) { //Keep a named function to easily spot custom js in stacks
                        try {
                            eval(snippet); //NOSONAR
                        } catch (e) {
                            $exceptionHandler(e);
                        }
                    }
                    pluginDesc.customJSSnippets.forEach(evalCustomJSSnippet);
                });
            }

            if ($rootScope.appConfig.theme) {
            	$scope.setTheme($rootScope.appConfig.theme);
            }

            /** Additional license info */
            $rootScope.addLicInfo = {};
            $rootScope.addLicInfo.sparkLicensed = $rootScope.appConfig.licensedFeatures && $rootScope.appConfig.licensedFeatures.sparkAllowed || $rootScope.appConfig.ceEntrepriseTrial;
            $rootScope.addLicInfo.hiveLicensed = !$rootScope.appConfig.community;
            $rootScope.addLicInfo.pigLicensed = !$rootScope.appConfig.community;
            $rootScope.addLicInfo.impalaLicensed = !$rootScope.appConfig.community;
            $rootScope.addLicInfo.containersLicensed = !$rootScope.appConfig.community;

            if ($rootScope.appConfig.alationSettings.enabled) {
                AlationCatalogChooserService.install();
            }
        } else {
            /* Still configure WT1 for push login state event */
            WT1.configure();
        }
        if (window.devInstance) {
            Mousetrap.bind("@ r r", function(){
                $templateCache.removeAll();
                $cacheFactory.get("$http").removeAll();
                $state.go($state.current, $stateParams, {reload:true, inherit: false, notify: true});
            })
            Mousetrap.bind("@ c c", function(){
                $templateCache.removeAll();
                $cacheFactory.get("$http").removeAll();
            })
        }
    };

    DataikuAPI.getConfiguration().success(function(data) {
        $rootScope.appConfig = data;
        $scope.appConfig = data;
        window.dkuAppConfig = data;

        var ac = data;
        WT1.event("studio-open", {
            loggedIn : ac.loggedIn,
            installId: ac.installId,
            version: ac.version,
            hadoopVersion: ac.hadoopVersion,
            hasNodeName: !!ac.nodeName,
            hasExternalURL: !!ac.dssExternalURL,
            themeId: ac.theme && ac.theme.id,

            hadoopEnabled: ac.hadoopEnabled,
            hiveEnabled: ac.hiveEnabled,
            impalaEnabled: ac.impalaEnabled,
            pigEnabled: ac.pigEnabled,
            twitterEnabled: ac.twitterEnabled,
            rEnabled: ac.rEnabled,
            legacyH2OEnabled: ac.h2oEnabled,
            impersonationEnabled: ac.impersonationEnabled,
            sparkEnabled: ac.sparkEnabled,
            pluginDevExplicitCommit: ac.pluginDevExplicitCommit,
            pluginDevGitMode: ac.pluginDevGitMode,
            alationEnabled: !!ac.alationSettings && ac.alationSettings.enabled,
            anonRegistrationAllowed: ac.anonRegistrationAllowed,
            gitMode : ac.gitMode,

            nbProjectStatus: ac.projectStatusList && ac.projectStatusList.length || 0,

            plugins: ac.loadedPlugins.map(x => x.id).join(","),
            customCodeRecipes: ac.customCodeRecipes && ac.customCodeRecipes.length || 0,
            customDatasets: ac.customDatasets && ac.customDatasets.length || 0,
            customDialects: ac.customDialects && ac.customDialects.length || 0,
            customExporters: ac.customExporters && ac.customExporters.length || 0,
            customFSProviders: ac.customFSProviders && ac.customFSProviders.length || 0,
            customJavaFormats: ac.customJavaFormats && ac.customJavaFormats.length || 0,
            customJythonProcessors: ac.customJythonProcessors && ac.customJythonProcessors.length || 0,
            customPythonChecks: ac.customPythonChecks && ac.customPythonChecks.length || 0,
            customPythonFormats: ac.customPythonFormats && ac.customPythonFormats.length || 0,
            customPythonPluginSteps: ac.customPythonPluginSteps && ac.customPythonPluginSteps.length || 0,
            customPythonPluginTriggers: ac.customPythonPluginTriggers && ac.customPythonPluginTriggers.length || 0,
            customPythonProbes: ac.customPythonProbes && ac.customPythonProbes.length || 0,
            customRunnables: ac.customRunnables && ac.customRunnables.length || 0,
            customWebApps: ac.customWebApps && ac.customWebApps.length || 0,
            customSQLProbes: ac.customSQLProbes && ac.customSQLProbes.length || 0,
            nbHomeMessages: ac.homeMessages && ac.homeMessages.length || 0
        });

        if (ac && ac.version && ac.version.product_version && ac.version.product_version.includes('dev') && !window.localStorage.forceRollbar) {
            // Disable WT1 and Rollbar reporting for dev kits
            window.devInstance = true;
        }

        if (!$scope.appConfig.loggedIn) {
            /* Don't redirect to login access to the login or logout page */
            if ($location.path().indexOf("/login/") === 0 || $location.path().indexOf("/logged-out") === 0) {
                return;
            } else if ($scope.appConfig.licensingMode == 'NONE'){
                Logger.info("Not logged in, but registration flow active, not redirecting");
            } else if ($scope.isSAASAuth() && !$scope.appConfig.saasAccess.loggedIn) {
                Logger.info("You are not logged in, redirecting you ...");
                window.location = $scope.appConfig.saasUserURL + "/login/?redirectTo=" + window.location;
            } else if ($scope.isSAASAuth() && $scope.appConfig.saasAccess.loggedIn) {
                Logger.info("logged in but no SAAS access");
            } else if ($scope.appConfig.noLoginMode) {
                Logger.info("Not logged in, but no-login-mode enabled, getting an access token");
                DataikuAPI.noLoginLogin().success(function(data){
                    location.reload();
                });
            } else if ($scope.appConfig.ssoLoginEnabled) {
                if ($scope.appConfig.ssoProtocol == "SAML") {
                    if ($location.path()) {
                        Logger.info("Setting a post-SSO redirect to", $location.path());
                        localStorageService.set("postSSOLoginRedirect", $location.path());
                    }
                    DataikuAPI.getSAMLRedirectURL().success(function(data){
                        window.location = data.url;
                    });
                } else if ($scope.appConfig.ssoProtocol == "SPNEGO") {
                    Logger.info("SPNEGO mode, redirecting to login URL");
                    window.location = "/dip/api/spnego-login";
                }
            } else {
                Logger.info("You are not logged in, redirecting you ...");
                // Redirect to login
                $state.transitionTo("login", {redirectTo : $location.path()});
            }
        } else if (!$scope.appConfig.unattendedMode &&  // When launched by puppeteer and automated tools, do not display the licence warning
                    $scope.appConfig.licensing.expired) {
            var last = localStorageService.get("licenseExpired");
            if (!last || last <= Date.now() - 24 * 3600000) {
                Dialogs.ack($scope,
                    "License expired!",
                    "Your DSS license expired on " + (new Date($scope.appConfig.licensing.expiresOn)).toLocaleString()
                );
                localStorageService.set("licenseExpired", Date.now());
            }
        } else if (!$scope.appConfig.unattendedMode && // When launched by puppeteer and automated tools, do not display the licence warning
                $scope.appConfig.licensing.expiresOn &&  // 0 on Free Edition
                $scope.appConfig.licensing.expiresOn <= Date.now() + 7 * 24 * 3600000) {
            var last = localStorageService.get("licenseExpiring");
            if (!last || last <= Date.now() - 24 * 3600000) {
                Dialogs.ack($scope,
                    "License expires soon!",
                    "Your DSS license expires on " + (new Date($scope.appConfig.licensing.expiresOn)).toLocaleString()
                );
                localStorageService.set("licenseExpiring", Date.now());
            }
        } else {
            const redirectTo = localStorageService.get("postSSOLoginRedirect");
            if (redirectTo) {
                Logger.info("There is a post-SSO login redirect, following it", redirectTo);
                localStorageService.remove("postSSOLoginRedirect");
                window.location.pathname = redirectTo;  // Only follow redirects to a local path, not to another site
                return;
            }
        }
        $scope.onConfigurationLoaded();
    }).error(setErrorInScope.bind($scope));

    $scope.isDSSAdmin = function(permission) {
        return $scope.appConfig && $scope.appConfig.loggedIn && $scope.appConfig.admin;
    };
    $rootScope.isDSSAdmin = $scope.isDSSAdmin;


    $scope.canWriteInProjectFolder = function() {
        let currentFolder = ProjectFolderContext.getCurrentProjectFolder();
        return ProjectFolderContext.getCurrentProjectFolderId() && (currentFolder || {}).id == ProjectFolderContext.getCurrentProjectFolderId() ? (currentFolder && currentFolder.canWriteContents) : $rootScope.appConfig.globalPermissions.mayWriteInRootProjectFolder;
    };
    $rootScope.canWriteInProjectFolder = $scope.canWriteInProjectFolder;

    $scope.isPluginDeveloper = function() {
        return $scope.appConfig && $scope.appConfig.loggedIn && ($scope.appConfig.admin || $scope.appConfig.globalPermissions.mayDevelopPlugins);
    };

    $scope.isLibFolderEditor = function() {
        return $scope.appConfig && $scope.appConfig.loggedIn && ($scope.appConfig.admin || $scope.appConfig.globalPermissions.mayEditLibFolders);
    };

    $scope.mayWriteSafeCode = function() {
        return $scope.appConfig && $scope.appConfig.loggedIn &&
        ($scope.appConfig.admin || $scope.appConfig.globalPermissions.mayWriteUnsafeCode || ($scope.appConfig.impersonationEnabled && $scope.appConfig.globalPermissions.mayWriteSafeCode));
    };

    $scope.mayWriteUnsafeCode = function() {
        return $scope.appConfig && $scope.appConfig.loggedIn &&
        ($scope.appConfig.admin || $scope.appConfig.globalPermissions.mayWriteUnsafeCode);
    };

    $scope.mayCreateActiveWebContent = function() {
        return $scope.appConfig && $scope.appConfig.loggedIn &&
        ($scope.appConfig.admin || $scope.appConfig.globalPermissions.mayCreateActiveWebContent);
    };

    $scope.canSeeAdminMenu = function() {
        if (!$scope.appConfig || !$scope.appConfig.loggedIn) {
            return false;
        }
        /* Because of code envs, anybody must be allowed to access the administration screen 
         * (almost anybody will have at least "use") */
        return true;
    };

    $scope.openRequestTrialModal = function(){
        CreateModalFromTemplate("/templates/request-trial-modal.html", $scope);
    };

    $scope.logout = function(){
        if ($scope.isSAASAuth()) {
            window.location = $scope.appConfig.saasUserURL + "/logout/";
        } else {
            DataikuAPI.logout().success(function(data) {
                // Violent redirect to avoid keeping a cached appConfig
                if ($scope.appConfig && $scope.appConfig.postLogoutBehavior == "CUSTOM_URL") {
                    window.location = $scope.appConfig.postLogoutCustomURL;
                } else {
                    window.location = "/logged-out";
                }
            });
        }
    };

    /* ********************* Keyboard shortcuts handling ******************* */
    $scope.keyboardsModal = { shown : false };
    $scope.showKeyboardShortcuts = function() {
        if (!$scope.keyboardsModal.shown) {
        	$scope.closeContextualMenus();
            $scope.keyboardsModal.shown = true;
            CreateModalFromTemplate("/templates/shortcuts.html", $scope, null, function(newScope) {
                newScope.$on("$destroy", function(){ $scope.keyboardsModal.shown = false});
            });
        }
    }

    $rootScope.showAdminContactInfo = function(){
        CreateModalFromTemplate("/templates/dialogs/admin-contact.html", $scope);
    }

    Mousetrap.bind("?", function() {
        $scope.showKeyboardShortcuts();
        $scope.$apply();
    });

    Mousetrap.bind(": q", function() {
        window.location = "about:blank"
    })

    var goToView = function(viewRoute) {
        return function() {
            if ($stateParams.projectKey) {
                let zoneId = $scope.getDestZone();
                $state.go(viewRoute, {projectKey : $stateParams.projectKey, zoneId : zoneId}, {reload: true});
            }
        }
    };

    $scope.reloadPluginConfiguration = function() {
    	// reload config & descriptors for smoother plugin development
    	if ($rootScope.appConfig && $rootScope.appConfig.loggedIn) {
    		// no point if you're not already logged in
    		DataikuAPI.plugindev.reloadAll().success(function(data) {
        		DataikuAPI.getConfiguration().success(function(data) {
        			$rootScope.appConfig = data;
        			$scope.appConfig = data;
        			window.dkuAppConfig = data;
        			if ( CachedAPICalls != null ) {
        				// for custom datasets, so that the parameter list from the descriptors is refreshed
        				CachedAPICalls.datasetTypes = DataikuAPI.datasets.get_types();
        				// reload recipe types
        				RecipeDescService.load($scope);
        			}
        		});
    		});
    	}
    };

    Mousetrap.bind("@ r c d", $scope.reloadPluginConfiguration);
    Mousetrap.bind("g c", function() { $state.go("catalog.items", {}, {reload: true});  });
    Mousetrap.bind("g f", goToView("projects.project.flow"));
    Mousetrap.bind("g n", goToView("projects.project.notebooks.list"));
    Mousetrap.bind("g d", goToView("projects.project.datasets.list"));
    Mousetrap.bind("g r", goToView("projects.project.recipes.list"));
    Mousetrap.bind("g a", goToView("projects.project.analyses.list"));
    Mousetrap.bind("g p", goToView("projects.project.dashboards.list"));
    Mousetrap.bind("g i", goToView("projects.project.dashboards.insights.list"));
    Mousetrap.bind("g j", goToView("projects.project.jobs.list"));
    Mousetrap.bind("g w", goToView("projects.project.wiki"));
    Mousetrap.bind("g l", goToView("projects.project.libedition"));

    Mousetrap.bind("c h a m p i o n s", function() {
        $(".master-nav").addClass("master-nav-champions");
        $(".icon-dkubird").replaceWith("<img class='champions'>");
        $(".champions").attr("src","/static/dataiku/images/coq.png");
    });

    Mousetrap.bind("@ r b", function(){
        if ($state.current.name.startsWith("projects.project.webapps.webapp")){
            DataikuAPI.webapps.restartBackend({"projectKey":$stateParams.projectKey, "id":$stateParams.webAppId})
        }
    })

    Mousetrap.bind("s e u m", function() {
        $(".master-nav").addClass("master-nav-seum");
    });

    Mousetrap.bind("k i t t y", function() {
        CreateModalFromTemplate("/templates/kitty.html", $scope, null, function(newScope) {
            $timeout(function(){
                $rootScope.$broadcast("reflow")
            }, 0);
        });
    });

    Mousetrap.bind("r o c k e t", function() {
        if ($state.current.name.startsWith('projectdeployer')) {
            const sentences = [
                {msg: "I'm stepping through the door"},
                {error: true, msg: "Your circuit's dead, there's something wrong"},
                {error: true, msg:"Can you hear me, Major Tom?"},
                {msg: "Now it's time to leave the capsule if you dare"}
            ];

            CreateModalFromTemplate("/templates/rocket.html", $scope, null, function(newScope) {
                $scope.leaveMessage = sentences[Math.floor(Math.random()*sentences.length)];
                $timeout(function(){
                    $rootScope.$broadcast("reflow")
                }, 0);
            });
        }
    });

    Mousetrap.bind("p u p p y", function() {
        CreateModalFromTemplate("/templates/puppy.html", $scope, null, function(newScope) {
            $timeout(function(){
                $rootScope.$broadcast("reflow")
            }, 0);
        });
    });

    Mousetrap.bind("c o m i c", function() {
        var rnd = Math.floor(Math.random()*3);
        var font = ["'Comic Neue'", "cursive", "fantasy"][rnd];

        $("head").append($("<link rel='stylesheet' type='text/css' href='https://dku-assets.s3.amazonaws.com/comicneue/comicneue.css'>"));
        $("head").append($("<style>div, button, p, span, a, input, textarea { font-family: " + font + " !important;}</style>"));
    });

    function setColor(x) {
        $("body").css("background-color", x);
        $("#flow-graph").css("background-color", x);
    }

    Mousetrap.bind("s a r c e l l e", function() {
        if (Math.random() > 0.75) {
           setColor("#045067");
        } else {
            setColor("#2AB1AC");
        }
    });

    Mousetrap.bind("p i n k", function() {
            $("body").css("background-color", "pink");
    });

    Mousetrap.bind("p u r p l e", function() {
            $("body").css("background-color", "purple");
    });

    Mousetrap.bind("& @ &", function(){
        CreateModalFromTemplate("/templates/debugging-tools.html", $scope, "DebuggingToolsController");
    });

    function trollMe() {
        $("i").addClass("icon-spin");
        $(".avatar20").addClass("icon-spin");
        $(".avatar32").addClass("icon-spin");
        $(".avatar").addClass("icon-spin");
    }

    function untrollMe() {
        $("i").removeClass("icon-spin");
        $(".avatar20").removeClass("icon-spin");
        $(".avatar32").removeClass("icon-spin");
        $(".avatar").removeClass("icon-spin");
    }

    window.showNativeNotification = function(txt, tag, onclick, user) {
        if ("document.hasFocus", document.hasFocus()) return; // Only display notification when the user is not on the page
        if (window.Notification.permission === "default") {
            // User did not choose the notifications type yet, ask (but don't wait for the answer to display in-window notification)
            window.Notification.requestPermission(function (permission) {
                WT1.event("allow-browser-notification", {permission : permission});
            });
        } else if (window.Notification.permission === "granted") {
            // User native browser Notifications
            var options = {
                icon: UserImageUrl(user || $rootScope.appConfig.login, 200),
                dir: "ltr",
                tag: tag,
                renotify: false,
                silent: true
            };
            var notification = new window.Notification(txt, options);

            notification.onclick = (function(onclick) {return function () {
                window.focus();
                if (onclick) onclick();
                this.close();
            };})(onclick);

            var timeout = setTimeout((function(n){return function(){ n.close()}; }(notification)), 5000);// native notifications have no custom timeout
        }
    }

    Notification.registerEvent('spinnee-troll',function() {
        trollMe();
    });

    Notification.registerEvent('spinnee-untroll',function() {
        untrollMe();
    });

    Mousetrap.bind("w h e e e", function() {
        // Troll others
        Notification.broadcastToOtherSessions('spinnee-troll',{lol:"salut"});

        // Untroll me
        untrollMe();
    });

    Mousetrap.bind("w h o o o", function() {
        // Untroll everyone
        Notification.broadcastToFrontends('spinnee-untroll',{lol:"salut"});
    })

    function fallingBird() {
        $(".icon-dkubird").css("visibility", "hidden");
        var falling = $("<i class='icon-dkubird falling-bird' />");
        $("body").append(falling);
        $("body").append($("<audio src='/static/dataiku/css/rifle.mp3' autoplay/>"));
        window.setTimeout(function(){falling.css("top", "105%")}, 10);
    }

    Mousetrap.bind("p a n", fallingBird);
    Mousetrap.bind("b a n g", fallingBird);

    Mousetrap.bind("s o n i a", function fallingBird() {
        $("body").append($("<audio src='/static/dataiku/css/sonia.mp3' autoplay/>"));
    });

    Mousetrap.bind("f u r y r o a d", function() {
        if ($state.current.name.startsWith('apideployer')) {
            $('head').append($('<style>@keyframes furyroad{from{left:0%;}to{left:100%;}}</style>'));
            $('body').append($('<div style="position: fixed; height: 400px; width: 600px; bottom: 0; animation-name: furyroad; animation-duration: 4s; animation-timing-function: ease-in-out; animation-iteration-count: infinite;"><svg viewBox="0 0 600 400"><circle cx="145" cy="295" r="30" fill="#6b6c69" stroke="#000"/><circle cx="145" cy="295" r="20" fill="#907354" stroke="#000"/><circle cx="145" cy="295" r="5" fill="#6b6c69" stroke="#000"/><circle cx="395" cy="295" r="30" fill="#6b6c69" stroke="#000"/><circle cx="395" cy="295" r="20" fill="#907354" stroke="#000"/><circle cx="395" cy="295" r="5" fill="#6b6c69" stroke="#000"/><path d="m100 300v-100q0-20 20-20h100q30 0 50 20l10 10q20 20 50 20l100-10q10 0 10 10v70h-10v-10q-7-13-20-20h-30q-13 7-20 20v10h-180v-10q-7-13-20-20h-30q-13 7-20 20v10h-10z" fill="#907354" stroke="#000"/><path d="m110 260q35-20 70 0l40 20q20 10 40 10" fill="transparent" stroke="#000"/><path d="m110 230v-30q0-10 10-10h50v40h-60z" fill="#ba9e9a" stroke="#000"/><path d="m180 230v-40h50q20 5 40 25v15h-90z" fill="#ba9e9a" stroke="#000"/><path d="m422 240l20-10q5-5 10 0v30q-5 5-10 0l-20-10q-5-5 0-10z" fill="#7d4842" stroke="#000"/><path d="m100 290l-80-40v-15l80 50v5z" fill="#6b6c69" stroke="#000"/><path d="m100 280l-80-60v-20l80 75v5z" fill="#6b6c69" stroke="#000"/><path d="m418 220l4-200h-2v-10h6v10h-2l-4 200h-2z" fill="#444" stroke="#000"/><path d="m422 220l10-200h-2v-10h6v10h-2l-10 200h-2z" fill="#444" stroke="#000"/><path d="m120 180l-30-50 40 50z" fill="#7d4842" stroke="#000"/><path d="m140 180l10-40v40z" fill="#7d4842" stroke="#000"/><path d="m170 180l-10-80 20 80z" fill="#7d4842" stroke="#000"/><path d="m190 180l-20-50 30 50z" fill="#7d4842" stroke="#000"/><path d="m210 180l40-50-30 50z" fill="#7d4842" stroke="#000"/><path d="m220 180l10-90v90z" fill="#7d4842" stroke="#000"/><path d="m130 180l-30-100 40 100z" fill="#7d4842" stroke="#000"/><path d="m155 180l-10-90 20 90z" fill="#7d4842" stroke="#000"/><path d="m180 180l20-80-10 80z" fill="#7d4842" stroke="#000"/><path d="m195 180v-120l10 120z" fill="#7d4842" stroke="#000"/><path d="m205 180l10-50v50z" fill="#7d4842" stroke="#000"/><path d="m330 230l-20-50 30 49z" fill="#7d4842" stroke="#000"/><path d="m352 228l10-40v38z" fill="#7d4842" stroke="#000"/><path d="m370 226l-10-80 20 79z" fill="#7d4842" stroke="#000"/><path d="m388 224l25-50-15 49z" fill="#7d4842" stroke="#000"/><path d="m410 222l-20-120 30 118z" fill="#7d4842" stroke="#000"/><path d="m420 220l30-90-20 90z" fill="#7d4842" stroke="#000"/><path d="m340 229l10-90v89z" fill="#7d4842" stroke="#000"/><path d="m358 227l50-120-40 119z" fill="#7d4842" stroke="#000"/></svg></div>'));
        }
    });

    Mousetrap.bind("n e y m a r", function() {
        $('head').append($('<style>@keyframes neymar{from{left:0%;transform:rotate(0deg);}to{left:100%;transform:rotate(4000deg);}}</style>'));
        const el = $('.icon-dkubird');
        el.css('position', 'absolute').css('color', 'yellow').css('background', '#184bad').css('top', '12px').css('animation-name', 'neymar').css('animation-duration', '10s').css('animation-timing-function', 'linear').css('animation-iteration-count', 'infinite');
    });

    Mousetrap.bind("b i g b r o t h e r", function() {
        $('body').append($('<div style="position: absolute;z-index: 2147483647000;bottom: 0;left: 0;right: 0;width: 100%;height: 415px;background: white;box-shadow: #121212 2px 2px 14px 2px;"><div style="margin: 20px auto;width: 450px;"><h4>This website uses quotes <i class="icon-eye-open"/></h4><p style=" line-height: 1.6em; font-size: 1.2em;">“He thought of the telescreen with its never-sleeping ear. They could spy upon you night and day, but if you kept your head you could still outwit them. With all their cleverness they had never mastered the secret of finding out what another human being was thinking. . . . Facts, at any rate, could not be kept hidden. They could be tracked down by inquiry, they could be squeezed out of you by torture. But if the object was not to stay alive but to stay human, what difference did it ultimately make? They could not alter your feelings; for that matter you could not alter them yourself, even if you wanted to. They could lay bare in the utmost detail everything that you had done or said or thought; but the inner heart, whose workings were mysterious even to yourself, remained impregnable.”</p><p class="" style="text-align: right;font-weight: bold;">― George Orwell, 1984</p><div><button class="btn btn--primary pull-right">2 + 2 = 5</button></div></div></div>'));
        $('body').append($('<div style="position: absolute;z-index: 2147483647000;top: 0;left: 0;right: 0;width: 100%;height: 150px;background: white;box-shadow: #121212 2px 2px 14px 2px;"><div style="margin: 20px auto;width: 450px;"><div class="alert alert-danger">Warning angry cookies</div><p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAYWSURBVGhD7VntU1RVGHf6UP0FNVOyb6z7cu/de++CgiE0vGqZExIKgiAi6iTCIqCiIqDZjFZDGjiZTpqAmIqShhNmmk5NHypzaqaZBLIPOdVk04uwCAVyOr/b2W2XvazLyq5+2N/Mb/ZwznOfl3vOec5zD9MiiCCCCCKI4EGBwSA+pjVwxTZBPinyUp9phjigN/CjOgM/ptVz+UzMB0aj8ZH0uNiugrS4XvzibzYUXkTprUkiJ102m8WhlVnpzvb6ZeTqAQe52bmZDHfXk1lyzC2tlrcycR/MluXNrWvT7nTXPENaStPuPGW317Ch8CDKyEfbaACiYB9qqS0cc56tI6PnG3wYbeRHtFrto+wxH8BxBOAKJEGyb2RDoYfeKCylMzD4uiNn9FZXrWoALibFxfXrdNan2aM+cC+tjPiesC4ti0ncIfLy8Jf7ylUdH8/j24rGOIv0g8HAaZiK+w+LRW5ImhU/eOP4RlWnJ2Jj+eJ/jDOEv5ia+wujUSiw0Zm4cWJyQYDnG1cTOotXmCo3BEGwPJ8Y+/WChJnfmM02M+sOHTQamwF74qv9gS2n8XxrQx4xzxD3MnVuJNrl3e9VzyOnq+cStFl36IDs1OhYNKrmpCf72qpIc8Ui5dezH4GYTLY3mDo3TKb/Z8RiEU2sWwE2fWKMvCNekpJZ171BOSdoiu3v2urlnBod2SnK23Vkp3r1d+0qIZLNfpmpDAgJNIj9q1PHMufM7GVd9waRky+10nPC07GJiAA6q+aRchqQZ/+fZ2oxI0M4/ZnauyJe4pNpEH3JsfIZ1hU89HrhcZzYA2fvPhvg90eqSFNFNrneXu0zVlecOWyxSMeY6vACtdOqrLnO8U6h9Dj5UhHZu24xuXa40mtsIuJlJM+Od9JzaA9V/dB/FsIEgbd3oHbydAhBVCxOJwdfTFOWUUN+Cjm7a4WXzET8jdZfC1OTnDwn9Wr03NLp06UnOY57mJ78Wo1eKIiKMj/BTE8tUMVePeCdcju2F5G3aRCojVzckJvmJeOPIx82kO5XV5L8+an9AicN0gr5jo2XBhckJ962mMW+yeyjgEE3qBNv0dMRLKfOqrnegeR4Z6lg2Vi+6G+zyTYoWOUzRqOtiR6in5hM4jXmTvDA98RQt3dVe+2dSlKfl+IOAkHVF833ksE5glRc/kIqTQC+G98ff+6oIZ0vFytnD2YOPjB3godaIGDXzhV0OWWQ9XQmGpY/R/44vcVrvMmRTVwnNtqeY5Ph7Q/qpiYQLK2bnZtUjfhjX1u1e0aut69XlQmEsA0fmDvBQ22zh4NX3iojX1DiU0Hi7T3MneAh8FLHkTrv9BsOtm0tVKoB/PK8fJy5Ezy0Wm55SVbGgJoxEGv48OZ8hWirybgIxw5uXEIO1ixR2moy47kiM31Ap+OKmDvBAzkdJcpEBeOWwmdJW1m6QrTVZMDfaTIoy0oh75ZnKCxdmDxhMN8eWkfOvbaKwCbdH8NTdq7QovHj9rplqkUjspYrDaOtJgNiJo46MtyyR2kwh2ryVGV3rM4iw+fqSWttwRg9Ry4wN+4dUQYucZYc60RpMt4oZqFlbbrCWj8zAqcDCeQ7Wre9v7NEWaaxUoxTY+DnMDemBjarfKm5MndkvGEYbNmylL49/3sE5wyWEwIA1/hZWuCeipwRnrN/xMxPHTQaUY9P3UBvTtSobHa60Q9tyvMJApXx9pULlfbn+8qI2SQ5tVqzjpmfWhgMXJ7ABXf54I9IBPUlmeQnqhe3M7Chi7bmMLOhAf2ursN10I/HNqg6NVni7WMmMEPQCd2wwcyFFlaztB3XQnBCzblA2NNaRXatySanaHGIv6ELOs1maRszEx7oosVcWm47mypzVYtKTyIJ/EIr2s+aS8mb6/PIK6XZuH0kuCvGs7sdOSPQFfLlNBGQAASrdDFGsg8i56vdASNb7a1aQtrqCsmnzWvcmxyyeAYplu6JCyHb2JOBJppPoMviIioAlBSoj3CR9+upTcobB9FGH8aKM9P6ISvQww7PMjUPDlBKoC6iQZ2gn669rn/0gGhLvNyDMciE5HM2gggiiCCCCILCtGn/AgQAuiyJeko6AAAAAElFTkSuQmCC"><img src="data:image/png;base64,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"><img src="data:image/png;base64,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"><img src="data:image/png;base64,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"><img src="data:image/png;base64,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"><img src="data:image/png;base64,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"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAYWSURBVGhD7VntU1RVGHf6UP0FNVOyb6z7cu/de++CgiE0vGqZExIKgiAi6iTCIqCiIqDZjFZDGjiZTpqAmIqShhNmmk5NHypzaqaZBLIPOdVk04uwCAVyOr/b2W2XvazLyq5+2N/Mb/ZwznOfl3vOec5zD9MiiCCCCCKI4EGBwSA+pjVwxTZBPinyUp9phjigN/CjOgM/ptVz+UzMB0aj8ZH0uNiugrS4XvzibzYUXkTprUkiJ102m8WhlVnpzvb6ZeTqAQe52bmZDHfXk1lyzC2tlrcycR/MluXNrWvT7nTXPENaStPuPGW317Ch8CDKyEfbaACiYB9qqS0cc56tI6PnG3wYbeRHtFrto+wxH8BxBOAKJEGyb2RDoYfeKCylMzD4uiNn9FZXrWoALibFxfXrdNan2aM+cC+tjPiesC4ti0ncIfLy8Jf7ylUdH8/j24rGOIv0g8HAaZiK+w+LRW5ImhU/eOP4RlWnJ2Jj+eJ/jDOEv5ia+wujUSiw0Zm4cWJyQYDnG1cTOotXmCo3BEGwPJ8Y+/WChJnfmM02M+sOHTQamwF74qv9gS2n8XxrQx4xzxD3MnVuJNrl3e9VzyOnq+cStFl36IDs1OhYNKrmpCf72qpIc8Ui5dezH4GYTLY3mDo3TKb/Z8RiEU2sWwE2fWKMvCNekpJZ171BOSdoiu3v2urlnBod2SnK23Vkp3r1d+0qIZLNfpmpDAgJNIj9q1PHMufM7GVd9waRky+10nPC07GJiAA6q+aRchqQZ/+fZ2oxI0M4/ZnauyJe4pNpEH3JsfIZ1hU89HrhcZzYA2fvPhvg90eqSFNFNrneXu0zVlecOWyxSMeY6vACtdOqrLnO8U6h9Dj5UhHZu24xuXa40mtsIuJlJM+Od9JzaA9V/dB/FsIEgbd3oHbydAhBVCxOJwdfTFOWUUN+Cjm7a4WXzET8jdZfC1OTnDwn9Wr03NLp06UnOY57mJ78Wo1eKIiKMj/BTE8tUMVePeCdcju2F5G3aRCojVzckJvmJeOPIx82kO5XV5L8+an9AicN0gr5jo2XBhckJ962mMW+yeyjgEE3qBNv0dMRLKfOqrnegeR4Z6lg2Vi+6G+zyTYoWOUzRqOtiR6in5hM4jXmTvDA98RQt3dVe+2dSlKfl+IOAkHVF833ksE5glRc/kIqTQC+G98ff+6oIZ0vFytnD2YOPjB3godaIGDXzhV0OWWQ9XQmGpY/R/44vcVrvMmRTVwnNtqeY5Ph7Q/qpiYQLK2bnZtUjfhjX1u1e0aut69XlQmEsA0fmDvBQ22zh4NX3iojX1DiU0Hi7T3MneAh8FLHkTrv9BsOtm0tVKoB/PK8fJy5Ezy0Wm55SVbGgJoxEGv48OZ8hWirybgIxw5uXEIO1ixR2moy47kiM31Ap+OKmDvBAzkdJcpEBeOWwmdJW1m6QrTVZMDfaTIoy0oh75ZnKCxdmDxhMN8eWkfOvbaKwCbdH8NTdq7QovHj9rplqkUjspYrDaOtJgNiJo46MtyyR2kwh2ryVGV3rM4iw+fqSWttwRg9Ry4wN+4dUQYucZYc60RpMt4oZqFlbbrCWj8zAqcDCeQ7Wre9v7NEWaaxUoxTY+DnMDemBjarfKm5MndkvGEYbNmylL49/3sE5wyWEwIA1/hZWuCeipwRnrN/xMxPHTQaUY9P3UBvTtSobHa60Q9tyvMJApXx9pULlfbn+8qI2SQ5tVqzjpmfWhgMXJ7ABXf54I9IBPUlmeQnqhe3M7Chi7bmMLOhAf2ursN10I/HNqg6NVni7WMmMEPQCd2wwcyFFlaztB3XQnBCzblA2NNaRXatySanaHGIv6ELOs1maRszEx7oosVcWm47mypzVYtKTyIJ/EIr2s+aS8mb6/PIK6XZuH0kuCvGs7sdOSPQFfLlNBGQAASrdDFGsg8i56vdASNb7a1aQtrqCsmnzWvcmxyyeAYplu6JCyHb2JOBJppPoMviIioAlBSoj3CR9+upTcobB9FGH8aKM9P6ISvQww7PMjUPDlBKoC6iQZ2gn669rn/0gGhLvNyDMciE5HM2gggiiCCCCILCtGn/AgQAuiyJeko6AAAAAElFTkSuQmCC"><img src="data:image/png;base64,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"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAYWSURBVGhD7VntU1RVGHf6UP0FNVOyb6z7cu/de++CgiE0vGqZExIKgiAi6iTCIqCiIqDZjFZDGjiZTpqAmIqShhNmmk5NHypzaqaZBLIPOdVk04uwCAVyOr/b2W2XvazLyq5+2N/Mb/ZwznOfl3vOec5zD9MiiCCCCCKI4EGBwSA+pjVwxTZBPinyUp9phjigN/CjOgM/ptVz+UzMB0aj8ZH0uNiugrS4XvzibzYUXkTprUkiJ102m8WhlVnpzvb6ZeTqAQe52bmZDHfXk1lyzC2tlrcycR/MluXNrWvT7nTXPENaStPuPGW317Ch8CDKyEfbaACiYB9qqS0cc56tI6PnG3wYbeRHtFrto+wxH8BxBOAKJEGyb2RDoYfeKCylMzD4uiNn9FZXrWoALibFxfXrdNan2aM+cC+tjPiesC4ti0ncIfLy8Jf7ylUdH8/j24rGOIv0g8HAaZiK+w+LRW5ImhU/eOP4RlWnJ2Jj+eJ/jDOEv5ia+wujUSiw0Zm4cWJyQYDnG1cTOotXmCo3BEGwPJ8Y+/WChJnfmM02M+sOHTQamwF74qv9gS2n8XxrQx4xzxD3MnVuJNrl3e9VzyOnq+cStFl36IDs1OhYNKrmpCf72qpIc8Ui5dezH4GYTLY3mDo3TKb/Z8RiEU2sWwE2fWKMvCNekpJZ171BOSdoiu3v2urlnBod2SnK23Vkp3r1d+0qIZLNfpmpDAgJNIj9q1PHMufM7GVd9waRky+10nPC07GJiAA6q+aRchqQZ/+fZ2oxI0M4/ZnauyJe4pNpEH3JsfIZ1hU89HrhcZzYA2fvPhvg90eqSFNFNrneXu0zVlecOWyxSMeY6vACtdOqrLnO8U6h9Dj5UhHZu24xuXa40mtsIuJlJM+Od9JzaA9V/dB/FsIEgbd3oHbydAhBVCxOJwdfTFOWUUN+Cjm7a4WXzET8jdZfC1OTnDwn9Wr03NLp06UnOY57mJ78Wo1eKIiKMj/BTE8tUMVePeCdcju2F5G3aRCojVzckJvmJeOPIx82kO5XV5L8+an9AicN0gr5jo2XBhckJ962mMW+yeyjgEE3qBNv0dMRLKfOqrnegeR4Z6lg2Vi+6G+zyTYoWOUzRqOtiR6in5hM4jXmTvDA98RQt3dVe+2dSlKfl+IOAkHVF833ksE5glRc/kIqTQC+G98ff+6oIZ0vFytnD2YOPjB3godaIGDXzhV0OWWQ9XQmGpY/R/44vcVrvMmRTVwnNtqeY5Ph7Q/qpiYQLK2bnZtUjfhjX1u1e0aut69XlQmEsA0fmDvBQ22zh4NX3iojX1DiU0Hi7T3MneAh8FLHkTrv9BsOtm0tVKoB/PK8fJy5Ezy0Wm55SVbGgJoxEGv48OZ8hWirybgIxw5uXEIO1ixR2moy47kiM31Ap+OKmDvBAzkdJcpEBeOWwmdJW1m6QrTVZMDfaTIoy0oh75ZnKCxdmDxhMN8eWkfOvbaKwCbdH8NTdq7QovHj9rplqkUjspYrDaOtJgNiJo46MtyyR2kwh2ryVGV3rM4iw+fqSWttwRg9Ry4wN+4dUQYucZYc60RpMt4oZqFlbbrCWj8zAqcDCeQ7Wre9v7NEWaaxUoxTY+DnMDemBjarfKm5MndkvGEYbNmylL49/3sE5wyWEwIA1/hZWuCeipwRnrN/xMxPHTQaUY9P3UBvTtSobHa60Q9tyvMJApXx9pULlfbn+8qI2SQ5tVqzjpmfWhgMXJ7ABXf54I9IBPUlmeQnqhe3M7Chi7bmMLOhAf2ursN10I/HNqg6NVni7WMmMEPQCd2wwcyFFlaztB3XQnBCzblA2NNaRXatySanaHGIv6ELOs1maRszEx7oosVcWm47mypzVYtKTyIJ/EIr2s+aS8mb6/PIK6XZuH0kuCvGs7sdOSPQFfLlNBGQAASrdDFGsg8i56vdASNb7a1aQtrqCsmnzWvcmxyyeAYplu6JCyHb2JOBJppPoMviIioAlBSoj3CR9+upTcobB9FGH8aKM9P6ISvQww7PMjUPDlBKoC6iQZ2gn669rn/0gGhLvNyDMciE5HM2gggiiCCCCILCtGn/AgQAuiyJeko6AAAAAElFTkSuQmCC"></p></div></div>'));
    });

    Mousetrap.bind("r m space - r f space /", function() {
        if ($state.current.name.startsWith('project-list')) {
            const e=$("<div style=\"position:absolute;padding:4px;width:500px;height:350px;top:50%;left:50%;transform:translate(-50%,-50%);background:#000;color:#fff;font-size:10px;font-family:Monaco,'SF Mono',Consolas,Console;z-index:999999999999;line-height:12px;font-weight:lighter;border-radius:6px;border-top:solid 20px #dedede;box-shadow:0 10px 20px rgba(0,0,0,.19),0 6px 6px rgba(0,0,0,.23)\"></div>"),i=$('<div style="overflow-y:auto;height:100%"></div>');e.append($('<div style="position:absolute;border:solid 6px #ff6158; border-radius:6px;top:-16px;left:7px"></div><div style="position:absolute;border:solid 6px #ffbd2e; border-radius:6px;top:-16px;left:26px"></div><div style="position:absolute;border:solid 6px #27c940; border-radius:6px;top:-16px;left:45px"></div>')),e.append(i),$("body").append(e);const h=$("<div>MBP-DKU:~ dataiku$ rm -rf /</div>");function l(){const o="rm: cannot remove `"+(1==Math.floor(2*Math.random())+1?"/etc/"+function(){const o=Math.floor(6*Math.random())+3;let t="";for(let e=0;e<o;e++)t+="abcdefghijklmnopqrstuvwxyz"[Math.floor(25*Math.random())];return t}()+".d":"/proc/"+(Math.floor(10235*Math.random())+255))+"': Permissions denied",t=$("<div>"+o+"</div>");i.append(t),t[0].scrollIntoView(),Math.floor(3*Math.random())===0&&$(".project-folder, .project").first().remove(),$timeout(l,Math.floor(50*Math.pow(10,Math.random()+.1))+2)}i.append(h),l(); //NOSONAR
        }
    });

    Mousetrap.bind("m a s s e", function() {
        let items = [
            { title: 'A', desc: "Qu'il n'est pas encore arrivé à Toronto" },
            { title: 'B', desc: "Qu'il est supposé arriver à Toronto, mais qu'on l'attend toujours" },
            { title: 'C', desc: "Qu'est-ce qu'il fout ce maudit pancake tabernacle ?" },
            { title: 'D', desc: "La réponse D" }
        ];
        Dialogs.select($scope, "Qui veut gagner de l'argent en masse ?",
            "Lorsqu'un Pancake prend l'avion à destination de Toronto, et qui s'en va faire une escale technique à St Claude, qui c'est qu'on va dire de ce pancake là ?",
            items,
        ).then(function(bafouille) {
            Dialogs.confirmSimple($scope, "C'est votre ultime bafouille ?", true).then(function() {
                 Dialogs.ack($scope, bafouille === items[2] ? "Bravo Gui" : "Vous auriez dû prendre le super moit-moit");
            });
        });
    });

    Mousetrap.bind("u n d e r space t h e space h o o d", () => {
        $('#dku-under-the-hood-dku').remove();
        $('.right-panel__content').append($('<div id="dku-under-the-hood-dku" style="position: absolute;z-index: 2147483647000;bottom: -151px;right: 0;width: 200px;height: 151px;background: white;transition: bottom 2s ease;-webkit-transition: bottom 2s ease;-moz-transition: bottom 2s ease;"><img style="width: 200px;height: 151px;" src="data:image/png;base64,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d09dTR21inqTmmSbEGOB0vQGfb7pD0iTNP6dFuccV5MJabON1prDw4PydVtjkDQFPJOrCTYMaGQDddDRTYStvr134McvImV//o76MicpOk9EaNM5Qpyv94Hv5X2E94Lm3eiq9pXaLEFt6FjWIeO7PVA9Gbao60W2Ed3/tb+ktt/U9sFoqbqr9Dn/mgOryBpU6yyayhY0yndVARSUozB95zYtzP8KH4EwQ9qM76vBtWUlImsInorU/HLWFqUThQCudBspUpALLwWta2YMag3cUcaGeUl05gnE2yCx6A/6tDtdkjSlkTZKG1Flws/N3Yp2pxN6kOqkrb+5YuOYGquWNbO2Ottf3ac63Ljq7//lvzjyv/OQtUKX3Jy8LMucc+QFiqN1pFjnQW0ngnce7/Jgxf+n+Ih/4lZU6r7TYvPuvefv9xIYBhsy4eVqxXKxwCYJ7VYrOlhW5Zh3rjR6/lJS2X14SHUDSzXRr8fdxY2hNhrBrQO8NdZDzTqzTkCMMzVdDJ0LhWTh1BIZHKaYmGtd3SLFYVkbFKLDQq7fy6XjZ/n7WvMmLt7IhTEEGGswxlafbXFTRVhc65T9/b0i/kDd4R1tnuhK1Wv1gmPlSmqH2tKAwZrc+M++Rb60XIuvG63B2vUrveba7fMV3vtgDu18cA+RvCRFK7l/GKFqtW8UhPxZm/hL10rx7fPZjNvZDKUUvW6XLM84PTml1W4h8znT6ZSdwYB2u11uRC+Cy7JwqhqDsrbGN9rMBd/S9AulfqJ4jyUtpFT0xRKosEIqbUNlPXBJ1T0LpBLH1TDsku1dmoEEY4xCe1MekTXfq7UNQmXkUVBNfHxmmlqmjKrWqqhKYFfA4LpWTRQeXcUFURIr1yLb4P8HawhyF+u6NdoAAABcdEVYdGNvbW1lbnQARmlsZSBzb3VyY2U6IGh0dHA6Ly93d3cucG9rZXBlZGlhLmZyL2luZGV4LnBocC9GaWNoaWVyOlNhcXVlZGVuZXVfZCUyNyVDMyU4OXJpa2EucG5nAwh41AAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAxNC0wNC0wOFQxMToyNTozNSswMjowMDTB9NsAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMTQtMDQtMDhUMTE6MjU6MzUrMDI6MDBFnExnAAAAR3RFWHRzb2Z0d2FyZQBJbWFnZU1hZ2ljayA2LjcuNy0xMCAyMDEyLTExLTA2IFExNiBodHRwOi8vd3d3LmltYWdlbWFnaWNrLm9yZyVyXygAAAAYdEVYdFRodW1iOjpEb2N1bWVudDo6UGFnZXMAMaf/uy8AAAAYdEVYdFRodW1iOjpJbWFnZTo6aGVpZ2h0ADQ2OG6GRb8AAAAXdEVYdFRodW1iOjpJbWFnZTo6V2lkdGgANjIw2xmPagAAABl0RVh0VGh1bWI6Ok1pbWV0eXBlAGltYWdlL3BuZz+yVk4AAAAXdEVYdFRodW1iOjpNVGltZQAxMzk2OTQ5MTM1wQVhxAAAABJ0RVh0VGh1bWI6OlNpemUAMzk3S0JCVIG1PwAAAFp0RVh0VGh1bWI6OlVSSQBmaWxlOi8vL3Nydi9wb2tlcGVkaWEvcG9rZXBlZGlhL3B1YmxpY19odG1sL2ltYWdlcy9jL2M2L1NhcXVlZGVuZXVfZCfDiXJpa2EucG5n88L/uQAAAABJRU5ErkJggg=="></div>'));
        setTimeout(() => $('#dku-under-the-hood-dku').css('bottom', '0px'), 200);
    });

    // Begining Clippy.js
    var clippyjs_agent;
    function create_clippyjs_agent(name_agent, callback) {
        name_agent = typeof name_agent !== 'undefined' ? name_agent : 'Clippy';
        clippy.load(name_agent, function(agent) {
            clippyjs_agent = agent;
            clippyjs_agent.show();
            //clippyjs_agent.moveTo(window.innerWidth-200,window.innerHeight-200);
            if (callback && typeof(callback) === "function") {
                callback();
            }
        });
    }

    Mousetrap.bind("c l i p p y", function() {
        if (typeof clippyjs_agent == 'undefined') {
            // First call : initializing
            clippyjs_agent = null;
            $("head").append($("<link rel='stylesheet' type='text/css' href='https://dku-assets.s3.amazonaws.com/clippy-js/clippy.css'>"));
            $("head").append($("<style>#loader-clippy{position:fixed;top:0px;left:0px;width:100%}#loader-clippy>div{margin:10em auto;"
                             +"font-size:10px;position:relative;text-indent:-9999em;border-top:1.1em solid rgba(255,255,255,.2);"
                             +"border-right:1.1em solid rgba(255,255,255,.2);border-bottom:1.1em solid rgba(255,255,255,.2);"
                             +"border-left:1.1em solid #ffc324;-webkit-transform:translateZ(0);transform:translateZ(0);"
                             +"-webkit-animation:load8 1.1s infinite linear;animation:load8 1.1s infinite linear;border-radius:50%;"
                             +"width:10em;height:10em}@-webkit-keyframes load8{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}"
                             +"@keyframes load8{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}"
                             +".clippy,.clippy-balloon{z-index:4000 !important}</style>"));
            $("body").append($("<div id='loader-clippy'><div></div></div>"));
            $("body").append($("<script type='text/javascript' src='https://dku-assets.s3.amazonaws.com/clippy-js/clippy.min.js'>"));
            setTimeout(function(){
                create_clippyjs_agent('Clippy', function(){
                    $("#loader-clippy").remove();
                });
            }, 1500);
        }
        else if (clippyjs_agent !== null) {
            // After first call : switching agent
            clippyjs_agent.hide(true, function() {
                $('.clippy').remove();
                $('.clippy-balloon').remove();
                if (clippyjs_agent.path.indexOf('Clippy') > -1) {
                    create_clippyjs_agent('Links', function() {
                        clippyjs_agent.play('GetWizardy');
                    });
                } else if (clippyjs_agent.path.indexOf('Links') > -1) {
                    create_clippyjs_agent('Merlin');
                } else {
                    create_clippyjs_agent('Clippy');
                }
            });
        }
    });

    Notification.registerEvent("job-state-change", function(evt, message) {
        if (message.state == "RUNNING" && typeof clippyjs_agent != 'undefined') {
            clippyjs_agent.play('Writing');
        } else if (message.state == "DONE" && typeof clippyjs_agent != 'undefined') {
            clippyjs_agent.play('Congratulate');
        } else if (message.state == "FAILED" && typeof clippyjs_agent != 'undefined') {
            clippyjs_agent.play('Alert');
        }
    });
    // End Clippy.js

    Mousetrap.bind("m s g a l l", function() {
        if ($rootScope.appConfig.admin === true) {
            var msg = window.prompt("What message do you want to send to all users?");
            Notification.broadcastToFrontends('msg-all', {msg:msg, user:$rootScope.appConfig.user});
        }
        else {
            alert("You must be admin to send a message."); // NOSONAR: OK to use alert for this message
        }
    });
    Notification.registerEvent('msg-all',function(evt, data) {
        MessengerUtils.post({
          message: "<div><b>Message from " + userLink(data.user.login, sanitize(data.user.displayName)) + ":</b><br>"+sanitize(data.msg)+"</div>",
          icon: userAvatar(data.user.login),
          hideAfter: 120,
          showCloseButton: true,
          id: 'msg-all-'+data.msg,
          type: 'no-severity'
        });
    });

    Mousetrap.bind("h a d o o p", function() {
        $("body").append($("<audio src='/static/dataiku/css/hadoop.mp3' autoplay/>"));
    });

    Mousetrap.bind("p i g", function() {
        $("body").append($("<audio src='/static/dataiku/css/pig.mp3' autoplay/>"));
    });

    Mousetrap.bind("h i v e", function() {
        $("body").append($("<audio src='/static/dataiku/css/hive.mp3' autoplay/>"));
    });

    Mousetrap.bind("p y t h o n", function() {
        $("body").append($("<audio src='/static/dataiku/css/python.mp3' autoplay/>"));
    });

    Mousetrap.bind("ctrl+e", function() {
        $rootScope.appConfig.easterEggs = true;
    });

    Mousetrap.bind("m i n i n g", function() {
        var elt = $("<div class='modal-container'><div id='minesweeper' class='modal modal3 dku-modal'><div class='modal-header'>"+
            "<h4><button type='button' class='close' data-dismiss='modal' aria-hidden='true'>&times;</button>"+
            "This is not data mining</h4></div><iframe  style='height: 500px;width: 98%' "+
            "src='http://www.chezpoor.com/minesweeper/minecore.html' /></div></div>");
        elt.modal("show");
    });

     Mousetrap.bind("k a t t a r s h i a n s", function() {
        var elt = $("<div class='modal-container'><div id='kattarshians' class='modal modal3 dku-modal relative-modal-90-90'>"+
            "  <iframe  style='width: 100%; height: 100%' "+
            "src='http://nutiminn.is/kattarshians/' /></div></div>");
        elt.modal("show");
    });

    Mousetrap.bind('up up down down left right left right b a enter', function() {
        CreateModalFromTemplate("/templates/infinity.html", $scope);
    });

    Mousetrap.bind("g e l l y", function(){
        window.setInterval(function(){
            d3.selectAll("g.node,g.edge").transition().duration(600).ease("elastic").attr("transform", function(d, i) {
                var x = 70 * Math.random() - 35;
                var y = 70 * Math.random() - 35;
                return "translate(" + x + " , " + y + ")";
            });
        }, 600)
    });

    Notification.registerEvent('discussions-wizz',function() {
        var elt = $('.discussions-widget-popover, .right-panel--opened .right-panel__content');
        elt.effect('shake');
    });

    Mousetrap.bind("w i z z", function() {
        Notification.broadcastToOtherSessions('discussions-wizz',{lol:"kikoo"});
    });

    Mousetrap.bind("l e a k s", function() {
        if ($state.current.name.startsWith('projects.project.wiki')) {
            $('.wiki-article-content.wiki-article-body-main').append($('<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0;"><div class="water"><div class="drop"></div><div class="drop"></div><div class="drop"></div><div class="drop"></div></div><svg version="1.1" xmlns="http://www.w3.org/2000/svg"><defs><filter id="goo"><feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="12"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 18 -7" result="goo"/></filter></defs></svg><style>.water{background:#083a44;width:200%;height:19%;position:absolute;bottom:-11%;left:-50%;-webkit-filter:url(#goo);filter:url(#goo)}.drop,.water::before{background:inherit;position:absolute;bottom:598%}.water::before{content:"";width:100%;height:100%}.drop{width:64px;height:64px;left:50%;border-radius:0 50% 50%;-webkit-transform:translateX(-50%) rotate(45deg);transform:translateX(-50%) rotate(45deg);-webkit-animation:drop 2s ease-in infinite;animation:drop 2s ease-in infinite}.drop:nth-child(1){width:64px;height:64px;-webkit-animation-delay:.1875s;animation-delay:.1875s}.drop:nth-child(2){width:51.2px;height:51.2px;-webkit-animation-delay:375ms;animation-delay:375ms}.drop:nth-child(3){width:38.4px;height:38.4px;-webkit-animation-delay:.5625s;animation-delay:.5625s}.drop:nth-child(4){width:25.6px;height:25.6px;-webkit-animation-delay:.75s;animation-delay:.75s}@-webkit-keyframes drop{0%{bottom:598%}100%,50%{bottom:0}}@keyframes drop{0%{bottom:598%}100%,50%{bottom:0}}</style></div>'));
        }
    });

    $scope.win = function() {
         Notification.publishToFrontend("achievement-unlocked", {achievementId : 'LOL'});
    };

    /* ********************* Various notification stuff ******************* */

    Notification.registerEvent("login", function(evt, message) {
        MessengerUtils.post({
          message: '<span>' + userLink(message.user, sanitize(message.userDisplayName)) + " just connected</span>",
          icon: userAvatar(message.user),
          hideAfter: 5,
          showCloseButton: true,
          id: message.user+'connected',
          type: 'no-severity'
        });
    });

    Notification.registerEvent("logout", function(evt, message) {
        MessengerUtils.post({
          message: '<span>' + userLink(message.user, sanitize(message.userDisplayName)) + " just disconnected</span>",
          icon: userAvatar(message.user),
          hideAfter: 5,
          showCloseButton: true,
          id: message.user+'disconnected',
          type: 'no-severity'
        });
    });

    Notification.registerEvent("job-state-change", function(evt, message) {
        if (!displayUserTaskNotification(message)) return;

        // If we are on the recipe page and the result panel is open, the info is already displayed
        try {
            var resultPanel = angular.element(".recipe-editor-job-result, .recipe-settings-floating-result");
            if (resultPanel.length && resultPanel.scope().isJobRunning()) {
                if (resultPanel.scope().startedJob.jobId == message.jobId) {
                    return;
                }
            }
        } catch (e) {
            Logger.error("Failed to check if user is on running recipe page.", e);
        }


        var initiatedByCurrentUser = $rootScope.appConfig.login == message.initiator;

        function jobLink(innerHTML) {
            var link = StateUtils.href.job(message.projectKey, message.jobId);
            return '<a href="'+link+'" class="link-std">'+innerHTML+'</a>';
        }

        function goToLogs() {
            return StateUtils.go.job(message.projectKey, message.jobId);
        }

        function goToFirstOutput() {
            var output = message.outputs[0];
            if (!output) {
                return;
            }
            if (!output.type) {
                throw new Error("Job output type not specified: "+ angular.toJson(output));
            }
            return StateUtils.go.dssObject(output.type, output.targetDataset, output.targetDatasetProjectKey);
        }

        var gotoJob = (function(message){ return function() {
            StateUtils.go.job(message.projectKey, message.jobId);
        }})(message);

        var triggerLabel = '<i class="icon-play"/> ';
        if (message.triggeredFrom == 'SCHEDULER') {
            triggerLabel = '<i class="icon-calendar" title="Scheduled in a scenario"/> ';
        } else if (message.triggeredFrom == 'API') {
            triggerLabel = '<i class="icon-code" title="Triggered from API"/> ';
        }

        var userLabel = initiatedByCurrentUser ? '' :
            userLink(message.initiator,
                        userAvatar(message.initiator, 20)
                        + '<span class="messenger-initiator">'
                        + sanitize(message.initiatorDisplayName || message.initiator)
                        + '</span>'
                    ) + '<br />';
        var jobLabel = jobLink(sanitize(message.humanReadableJobDesc));

        if (message.state == "DONE") {
            var warnLevel = message.warningsCount ? 'warning' : 'success';
            window.showNativeNotification("Job completed", message.jobId, gotoJob, message.initiator);
            if (!message.warningsCount) {
                MessengerUtils.post({
                    message: '<div>' + userLabel + 'Job completed<br/>' + jobLabel + '</div>',
                    icon: triggerLabel,
                    type: warnLevel + ' current-user',
                    id: message.jobId,
                    hideAfter: 5,
                    actions: {
                        target: {
                            label: "View",
                            action: goToFirstOutput
                        },
                        logs: {
                            label: "Logs",
                            action: goToLogs
                        }
                    }
                });
            }
        } else if (message.state == "RUNNING") {
            MessengerUtils.post({
                message: '<div>' + userLabel + 'Job started<br/>' + jobLabel + '</div>',
                icon: triggerLabel,
                type: 'current-user',
                hideAfter: 5,
                id: message.jobId,
                showCloseButton: true,
                actions: {
                    logs: {
                        label: "Logs",
                        action: goToLogs
                    }
                }
            });
        } else if(message.state == "FAILED" || message.state == "ABORTED") {
            window.showNativeNotification("Job " + message.state.toLowerCase(), message.jobId, gotoJob, message.initiator);
            MessengerUtils.post({
                message: '<div>' + userLabel + 'Job ' + message.state.toLowerCase() + '<br/>' + jobLabel + '</div>',
                icon: triggerLabel,
                type: 'error current-user',
                showCloseButton: true,
                id: message.jobId,
                hideAfter: 5,
                actions: {
                    logs: {
                        label: "Logs",
                        action: goToLogs
                    }
                }
            });
        }
    });


    function mlTaskLink(mlTaskType, projectKey, analysisId, mlTaskId, innerHTML) {
        var href = StateUtils.href.mlTask(mlTaskType, projectKey, analysisId, mlTaskId);
        return '<a href="'+href+'" class="link-std">'+innerHTML+'</a>';
    }

    function displayUserTaskNotification(evt) {
        var initiatedByCurrentUser = $rootScope.appConfig.login == evt.initiator;
        var otherUsersTasks = $rootScope.appConfig.userSettings.frontendNotifications.otherUsersTasks;
        return initiatedByCurrentUser || otherUsersTasks;
    }

    Notification.registerEvent("mltask-state-change", function(evt, message) {
        if (!displayUserTaskNotification(message)) return;

        // If we are on the mltask page, the info is already displayed
        try {
            var x = 'projects.project.analyses.analysis.ml.';
            if (
                ($state.current.name == x+'predmltask.list.results' || $state.current.name == x+'clustmltask.list.results')
                && message.projectKey == $stateParams.projectKey
                && message.taskId == $stateParams.mlTaskId
                ) {
                return;
            }
        } catch (e) {
            Logger.error("Failed to check if user is on running mlTask page.", e);
        }

        MessengerUtils.post({
            message: mlTaskLink(message.taskType, message.projectKey, message.analysisId, message.taskId, sanitize(message.name + ": training done")),
            icon: '<i class="icon-dku-nav_analysis" />',
            type: 'success',
            showCloseButton: true
        });
    });

    Notification.registerEvent("timeline-item", function(evt, message) {
        if (message.item.action == "COMMENT") {
            MessengerUtils.post({
                message: userLink(message.item.user, sanitize(message.item.details.userDisplayName))
                    + " commented on "
                    + dssObjectLink(message.item.objectType, message.item.projectKey, message.item.objectId, sanitize(message.item.details.objectDisplayName))
                    + ":"
                    + '<span class="messenger-comment">'
                    + sanitize(message.item.details.text.substr(0,400))
                    + (message.item.details.text.length > 400 ? '[...]' : '')
                    + '</span>'
                    ,
                icon: userAvatar(message.item.user),
                type: 'no-severity',
                hideAfter: 5,
                showCloseButton: true
            });
        } else if (message.item.action == "EDIT_COLLABORATIVE_METADATA") {
            Assert.trueish(message.item.details.doneTasks != null, 'no done tasks');
            var tasks = "";
            for (var i = 0; i < message.item.details.doneTasks.length; ++i) {
                tasks += '<i class="icon-ok" /> ' + sanitize(message.item.details.doneTasks[i]);
            }

            MessengerUtils.post({
                message: userLink(message.item.user, sanitize(message.item.details.userDisplayName))
                    + " completed a task on "
                    + dssObjectLink(message.item.objectType, message.item.projectKey, message.item.objectId, sanitize(message.item.details.objectDisplayName))
                    + ":"
                    + '<span class="messenger-comment">'
                    + tasks
                    + '</span>'
                    ,
                icon: userAvatar(message.item.user),
                type: 'no-severity',
                hideAfter: 5,
                showCloseButton: true
            });
        }
    });

    Notification.registerEvent("commit-mention", function(evt, message) {
        MessengerUtils.post({
            message: userLink(message.author, sanitize(message.details.authorDisplayName || message.author))
                + " mentioned you in commit: "
                + '<span class="messenger-comment">'
                + sanitize(message.message.substr(0,400))
                + (message.message.length > 400 ? '[...]' : '')
                + '</span>'
                ,
            icon: userAvatar(message.author),
            type: 'no-severity',
            showCloseButton: true
        });
    });

    Notification.registerEvent("interest-added", function(evt, message) {
        MessengerUtils.post({
            message: '<i class="icon-star interests-star active"></i>'
                + userLink(message.user, sanitize(message.details.userDisplayName))
                + ' starred '
                + dssObjectLink(message.objectType, message.projectKey, message.objectId, sanitize(message.details.objectDisplayName)),
            icon: userAvatar(message.user),
            id: message.user+'starred'+message.details.objectDisplayName,
            type: 'no-severity',
            showCloseButton: true
        });
    });

    Notification.registerEvent("scenario-run-failed-check-logs", function(evt, message) {
        if (!displayUserTaskNotification(message)) return;
        MessengerUtils.post({
          message: "Failed to run scenario " + message.projectKey+"."+message.scenarioId + ": " + message.message + ".\nPlease check logs",
          icon: '<i class="icon-calendar"/>',
          type: "error",
          id: "ScenarioState"+ message.scenarioId,
          showCloseButton: true
        });
    });

    Notification.registerEvent("scenario-state-change", function(evt, message) {
        function goToLogs() {
            return StateUtils.go.scenario(message.scenarioId, message.projectKey);
        }
        if (!displayUserTaskNotification(message)) return;
        var msg = {
                DONE: 'finished',
                RUNNING: 'started',
                FAILED: 'failed',
                ABORTED: 'aborted'
            };
        var isSuccess = ['DONE'].indexOf(message.state) >= 0;
        var isError = ['FAILED', 'ABORTED'].indexOf(message.state) >= 0;
        var triggerLabel = '<i class="icon-calendar" /> ';
        var actions = {};
        if (isSuccess || isError) {
            actions.logs = {label: "Logs",action: goToLogs};
        }
        MessengerUtils.post({
          message: "Scenario " + msg[message.state] + "<br/>" + dssObjectLink('SCENARIO', message.projectKey, message.scenarioId, message.scenarioName),
          icon: triggerLabel,
          id: "ScenarioState"+ message.scenarioId,
          type: isSuccess ? 'success' : (isError ? 'error' : ''),
          showCloseButton: true,
          actions : actions
        });
    });

    $scope.showAbout = function() {
    	$scope.closeContextualMenus();
        CreateModalFromTemplate("/templates/about-dss.html", $scope, null, function(modalScope){
            modalScope.currentYear = new Date().getFullYear();
        });
    };

    $scope.showAboutPartitioning = function() {
    	$scope.closeContextualMenus();
         CreateModalFromTemplate("/templates/about-partitioning.html", $scope);
    };

    $scope.showFeedbackModal = function() {
        $scope.closeContextualMenus();
        CreateModalFromTemplate("/templates/widgets/topbar_drawers/feedback-modal.html", $scope, 'FeedbackController');
    };

    this.getStateWithParam = (scope, state) => {
        let stateName = scope.appConfig.userSettings.home.behavior;
        let params = {};
        if (stateName === HomeBehavior.LAST) {
            const lastVisitedState = HomePageContextService.getLastVisitedState();
            if (lastVisitedState === undefined || lastVisitedState === null) {
                stateName = HomeBehavior.DEFAULT;
            } else {
                stateName = lastVisitedState.name;
                params = lastVisitedState.params;
            }
        }
        else if (stateName !== HomeBehavior.DEFAULT && stateName !== HomeBehavior.PROJECTS) {
            stateName = HomeBehavior.DEFAULT;
        }
        else if (stateName === HomeBehavior.PROJECTS) {
            params = {folderId: ''};
        }
        // In case the state is unknown (edited by the user, etc)
        stateName = state.href(stateName, params) != null ? stateName : HomeBehavior.DEFAULT;
        return { state: stateName, params };
    };

    $scope.getHomeHref = () => {
        const stateWithParam = this.getStateWithParam($scope, $state);
        return $state.href(stateWithParam.state, stateWithParam.params);
    };

    $scope.redirectHome = () => {
        const stateWithParam = this.getStateWithParam($scope, $state);
        $state.go(stateWithParam.state, stateWithParam.params, { reload: true });
    };

    $scope.onClickHref = (event) => {
        event.preventDefault();
        $scope.redirectHome();
    };

    $scope.freshWidgetInitDone = false;

    $rootScope.showHelpModal = function(){
        function showSupportWidget() {
            if (window.dkuAppConfig && window.dkuAppConfig.offlineFrontend){
                ActivityIndicator.error("Offline mode - Support widget not available");
                return;
            }
            if (!$scope.freshWidgetInitDone) {
                var version = nv.version && nv.version.product_version;
                var instanceId = nv.dipInstanceId;
                if (!window.devInstance) {
                    FreshWidget.init("", {
                        "queryString": "&widgetType=popup&helpdesk_ticket[custom_field][dss_version_112979]=" + version
                            + "&helpdesk_ticket[custom_field][dss_instance_112979]=" + instanceId,
                        "widgetType": "popup", "buttonType": "text", "buttonText": "Support",
                        "buttonColor": "white", "buttonBg": "#006063", "alignment": "4",
                        "submitThanks" : "Thanks for your message. We'll get in touch very soon",
                        "offset": "-1500px", "formHeight": "500px",
                        "url": "https://dataiku.freshdesk.com",
                        "loadOnEvent" : "immediate"
                    } );
                } else {
                    ActivityIndicator.error("Support widget not available on a dev instance");
                    return;
                }
                $scope.freshWidgetInitDone = true;
            }
            FreshWidget.show();
        }
        CreateModalFromTemplate("/templates/widgets/topbar_drawers/get-help-modal.html", $scope, null, function(newScope) {
            newScope.openSupport = function() {
                newScope.dismiss();
                showSupportWidget();
            };
            newScope.openIntercom = function() {
                newScope.dismiss();
                $scope.forceShowIntercom()
            }
        });
    };

    const getZoomedZoneCtxKey = () => {
        return `dku.flow.zoneId.${$stateParams.projectKey}`;
    }

    $scope.getDestZone = function() {
        if ($stateParams.zoneId || $state.current.name.includes('projects.project.home.regular')) {
            localStorageService.remove(getZoomedZoneCtxKey());
            return null;
        }
        return localStorageService.get(getZoomedZoneCtxKey());
    }

    $scope.$on("$stateChangeSuccess", function() {
        if ($state.$current.pageTitle) {
            TopNav.setPageTitle($state.$current.pageTitle($stateParams));
        }
        if ($state.current.name.includes('projects.project.flow')) {
            localStorageService.set(getZoomedZoneCtxKey(), $stateParams.zoneId);
        }
    });


    /* ******************* Persistent notifications handling ****************** */

    $scope.pnotifications = {};
    $scope.countNotifications = function() {
        DataikuAPI.notifications.count().success(function(data) {
            $scope.pnotifications.totalUnread = data.totalUnread;
            $rootScope.totalUnreadNotifications = data.totalUnread;
            TopNav.refreshPageTitle();
        });
    };

    Notification.registerEvent("export-state-change", function(evt, message) {
        if (message.status.state == "RUNNING") return;
        $scope.countNotifications()
    });
    Notification.registerEvent("job-state-change", function(evt, message) {
        if (message.state == "RUNNING") return;
        $scope.countNotifications()
    });
    Notification.registerEvent("update-notifications-count", function(evt, message) {
        // Sometimes the sent event contains the totalUnread value, no need to fetch it again
        if (message.totalUnread == -1) {
            $scope.countNotifications();
        } else {
            $scope.pnotifications.totalUnread = message.totalUnread;
            $rootScope.totalUnreadNotifications = message.totalUnread;
            TopNav.refreshPageTitle();
        }
    });

    $rootScope.discussionsUnreadStatus = $rootScope.discussionsUnreadStatus || {};
    Notification.registerEvent("discussions-unread-full-ids-changed", function(evt, message) {
        let newFIDs = angular.copy(message.unreadFullIds || []);
        $rootScope.discussionsUnreadStatus.unreadFullIds = newFIDs;
    });

    $scope.hasUnreadThings = function() {
        return $scope.pnotifications.totalUnread || ($rootScope.discussionsUnreadStatus.unreadFullIds || []).length;
    };


    /* ******************* Exports handling ****************** */

    Notification.registerEvent("export-state-change", function(evt, message) {
        if (!displayUserTaskNotification(message)) {
            return;
        }
        var txt = null;
        var type = null;
        if (message.status.state == 'DONE') {
            var lowerDescription = message.status.inputDescription.description ? message.status.inputDescription.description.toLowerCase() : '';
            if (lowerDescription.startsWith("dataset")) {
                var datasetName = sanitize(message.status.inputDescription.name);
                var datasetProjectKey = sanitize(message.status.inputDescription.projectKey);
                txt = 'Export done : dataset <a href="/projects/'+datasetProjectKey+'/datasets/'+datasetName+'/explore/" class="link-std">'+ datasetName + '</a>';
            } else if (lowerDescription.startsWith("apply shaker")) {
                var datasetName = sanitize(message.status.inputDescription.name);
                var datasetProjectKey = sanitize(message.status.inputDescription.projectKey);
                txt = 'Export done : apply shaker on <a href="/projects/'+datasetProjectKey+'/datasets/'+datasetName+'/explore/" class="link-std">'+ datasetName + '</a>';
            } else {
                txt = sanitize("Export done : "+ message.status.inputDescription.name);
            }
            type = 'success';
        } else if (message.status.state == 'FAILED'){
            txt = sanitize("Export failed : "+ message.status.inputDescription.name);
            type = 'error';
        }
        if (txt) {
            MessengerUtils.post({
                 message: txt,
                 icon: '<i class="icon-download-alt"></i>',
                 type: type,
                 hideAfter: 5,
                 showCloseButton: true
             });
        }
    });

    /* ********* Global actions we want in every scope ********************* */

    /* Open the modal for exporting a dataset */
    $scope.exportDataset = function(projectKey, datasetName, overrideFeatures) {
        DataikuAPI.datasets.getForExport(projectKey, datasetName, $stateParams.projectKey).success(function(datasetDetails) {
            var partitionLoader = (datasetDetails.partitioning.dimensions.length == 0) ? null : (function() {
                var deferred = $q.defer();
                DataikuAPI.datasets.listPartitions(datasetDetails).success(function(partitionData) {
                    deferred.resolve(partitionData);
                }).error(function() {
                    deferred.reject();
                });
                return deferred.promise;
            });
            var dialog = {
                title : 'Export "'+datasetName+'"',
                warn : null
            };
            var features = {
                partitionListLoader:partitionLoader,
                datasetDefinition: datasetDetails,
                downloadMethod: false
            };
            rextend(features,overrideFeatures);
            CreateExportModal($scope, dialog, features).then(function(params) {
                // Create export
                DataikuAPI.datasets.exportDS($stateParams.projectKey, projectKey, datasetName, params).success(function(data) {
                    ExportUtils.defaultHandleExportResult($scope, params, data);
                }).error(setErrorInScope.bind($scope));
            });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.datasetSmartHRef = function(smartName, subState) {
        if (!smartName) return;
        if(!subState) {
            subState = 'explore';
        }
        if (smartName.indexOf(".") > 0) {
            var chunks = smartName.split(".");
            return $state.href("projects.project.datasets.dataset."+subState, {projectKey :chunks[0], datasetName : chunks[1]})
        } else {
            return $state.href("projects.project.datasets.dataset."+subState, {projectKey :$stateParams.projectKey, datasetName :smartName})
        }
    };

    /* Shortcut : put the service in the scope so we can use it directly in templates */
    $scope.WT1Event = function(type, params) {
        WT1.event(type, params);
    };

    $scope.setSpinnerPosition = function(position){
    	$rootScope.spinnerPosition = position;
    };

    $scope.setTheme = function(theme) {
    	if (theme) {
    		var uri = $scope.getThemeUri(theme);
        	var cssUri = uri + "theme.css";
        	$("#theme-stylesheet").remove();
        	$("head").append('<link id="theme-stylesheet" rel="stylesheet" type="text/css" href="'+cssUri+'">');
        	if (!theme.isUnitedColorBg) {
                if (theme.background.startsWith("http")) {
                    var imgUri = theme.background;
                } else {
                    var imgUri = uri + theme.background;
                }
                $("#root-dom-element").css("background-image","url("+imgUri+")");
            } else {
                $("#root-dom-element").css("background-image","none");
            }
    	} else {
    		$("#theme-stylesheet").remove();
    		$("#root-dom-element").css("background-image","none");
    	}
        /* Update or revert favicon */
        var faviconLink = $("head").find("link[rel='shortcut icon']");
        if (theme && theme.favicon) {
            var faviconUri = uri + theme.favicon + '?t=' + new Date().getTime();
            faviconLink.attr("href", faviconUri);
        } else {
            faviconLink.attr("href", "/favicon.ico?v=3");
        }
    };

    $scope.getThemeUri = function(theme) {
    	var uri;
    	switch (theme.origin) {
    		case "BUILTIN":
    			uri = "/themes/builtin/" + theme.id + "/";
    			break;
    		case "PLUGIN":
    			uri = "/plugins/" + theme.pluginId + "/resource/themes/" + theme.id + "/";
    			break;
    		case "USER":
    			uri = "/themes/user/"  + theme.id + "/";
    			break;
    	}
    	return uri;
    };

    // refactor status color handling out into a service for easier usage in separated scopes
    $scope.getProjectStatusColor = function(status) {
        return ProjectStatusService.getProjectStatusColor(status);
    };


        $scope.codeMirrorSettingService = CodeMirrorSettingService;

    /* ******************* Top nav override ****************** */
    $scope.onEnterSecondNav = function(type){
        TopNav.setOverrideLeftType(type);
    };

    $scope.onLeaveSecondNav = function(){
        TopNav.setOverrideLeftType(null);
    };

    $scope.isShowNavSearch = function() {
        return TopNav.isShowHomePageNavSearch();
    };

    Logger.info("DSS loaded");

    $scope.closeNavMenu = function (triggerId) {
        let trigger = document.querySelector('#' + triggerId);
        trigger.classList.add('js-blurred');
        let blurListener = trigger.addEventListener('mouseout', function() {
            trigger.classList.remove('js-blurred');
            trigger.removeEventListener('mouseout', blurListener);
        })
    };

    /* ******************* Global Finder ****************** */
    Mousetrap(document.body).bind("mod+shift+f", e => {
        const inCodeMirror = $(e.target).closest('.CodeMirror').length > 0;
        if (inCodeMirror === false || DetectUtils.getOS() === "macos") {
            e.preventDefault();
            $scope.openGlobalFinder();
        }
    });

    $scope.modKey = DetectUtils.getOS() === "macos" ? "⌘" : "Ctrl"; //also used in shortcuts.html
    $scope.globalFinderShortcut = DetectUtils.getOS() === "macos" ? `${$scope.modKey}⇧F` : `${$scope.modKey}+Shift+F`;
    $scope.globalFinderLocalStorageKey = "global-search__last-searches";
    $scope.globalFinderTabStorageKey = "global-search__last-tabId";


    $scope.initQuery = (filter = '', advancedSearch = false) => {
        $scope.globalfinder = Object.assign({}, $scope.globalfinder, { q: filter, results: [], hits: [], searchResultsAnswers: {hits: []}, searchResultsDoc: {hits: []}, searchResultsLearn: {hits: []}, advancedSearch });
        $scope.initLastSearches();
    };

    $scope.initLastSearches = () => {
        let searches = localStorageService.get($scope.globalFinderLocalStorageKey);
        if (searches === null || Array.isArray(searches) === false) {
            searches = [];
        }
        let data = searches.map((q, index) => ({$idx: index, _type: 'search', _category: 'recent', _source: {name: q.query, query: q.query, time: q.time, tabId: q.tabId }, icon: 'global-finder-modal__search-type-icon--smaller--nomargin icon-time'}));
        $scope.initial.index = 1;
        data.unshift({_type: 'search-separator', selectable: false, _source: {name: 'Recent searches', query: '' }});
        $scope.globalfinder.results = data;
        $scope.globalfinder.allData = [...data];
    };

    $scope.globalFinderModal = null;

    $scope.openGlobalFinder = (filter = '', advancedSearch = false, tabId = undefined) => {
        if ($scope.globalFinderModal !== null) { // Forbid two modal at the same time
            return;
        }
        const filterPattern = '(\\w+:(".+"|[^ ]+))';
        $scope.initial = { index: 0 };
        $scope.initQuery(filter, advancedSearch);

        $scope.globalFinderModal = CreateModalFromTemplate("/templates/global-finder-modal.html", $scope, null, newScope => {

            const projectNames = {};
            DataikuAPI.projects.list()
                .success(function (response) {
                    angular.forEach(response, function (project) {
                        projectNames[project.projectKey] = project.name;
                    })
                })
                .error(setErrorInScope.bind($scope));

            const users = {};
            DataikuAPI.security.listUsers()
                .success(function (response) {
                    angular.forEach(response, function (user) {
                        users[user.login] = user.displayName;
                    })
                })
                .error(setErrorInScope.bind($scope));

            newScope.inProject = !!newScope.$stateParams.projectKey;

            newScope.getHelp = function () {
                newScope.dismiss();
                $scope.showHelpModal();
            };

            newScope.shouldTriggerBackendSearch = () => !newScope.globalfinder.advancedSearch || newScope.tabs.current.id !== "help";
            newScope.helpIntegrationEnabled = () => newScope.wl.contextualHelpSearchEnabled && newScope.appConfig.helpIntegrationEnabled;
            newScope.shouldTriggerHelpSearch = () => newScope.helpIntegrationEnabled() && (!newScope.globalfinder.advancedSearch || newScope.tabs.current.id === "all" || newScope.tabs.current.id === "help");

            newScope.updateLastSearches = (newSearch, tabId) => {
                if (newSearch === '') {
                    return;
                }

                let searches = localStorageService.get($scope.globalFinderLocalStorageKey);
                if (searches === null || Array.isArray(searches) === false) {
                    searches = [];
                }
                let index = searches.map(s => s.query.toLowerCase()).indexOf(newSearch.toLowerCase());
                if (index !== -1) {
                    searches.splice(index, 1);
                }
                let savedSearch = {
                    query: newSearch,
                    tabId: tabId,
                    time: Date.now()
                };
                searches.unshift(savedSearch);

                if (searches.length > 5) {
                    searches.splice(5);
                }
                localStorageService.set($scope.globalFinderLocalStorageKey, searches)
            };

            newScope.onSmartInputChange = () => {
                newScope.initial.index = 0;
                const tabSelected = newScope.tabs.current && newScope.tabs.current.id !== 'all';
                if (!tabSelected) {
                    disableAdvancedSearch();
                }
                newScope.triggerSearch(!tabSelected);
            };

            newScope.triggerSearch = function (shouldSelectTab = true, shouldHandleLoading = true) {
                if (shouldHandleLoading) {
                    newScope.globalfinder.searching = true;
                    newScope.globalfinder.results = [];
                    newScope.globalfinder.allData = [];
                }
                newScope.globalfinder.trimmedQuery = newScope.trimQuery(newScope.globalfinder.q);
                if (newScope.globalfinder.trimmedQuery === '') {
                    newScope.globalfinder.searching = false;
                }
                newScope.debouncedTriggerSearch(shouldSelectTab);
            };

            newScope.debouncedTriggerSearch = Debounce().withDelay(200, 200).wrap(function (shouldSelectTab = true) {
                let query = newScope.globalfinder.q;
                if (!newScope.globalfinder.advancedSearch && query === "") {
                    setCurrentTab();
                    $scope.initQuery('', newScope.globalfinder.advancedSearch);
                    return;
                }

                if (newScope.globalfinder.advancedSearch) {
                    newScope.initial.index = -1;
                }
                if (shouldSelectTab) {
                    newScope.selectTabBasedOnFilter();
                }
                if (newScope.shouldTriggerHelpSearch()) {
                    newScope.globalfinder.search(query);
                }
                if (newScope.shouldTriggerBackendSearch()) {
                    if (newScope.globalfinder.advancedSearch && newScope.tabs.current.filtersPrefix) {
                        for (var i = 0; i < newScope.tabs.current.filtersPrefix.length; i++) {
                            const filter = newScope.tabs.current.filtersPrefix[i];
                            if (!query.toLowerCase().includes(`${filter}:`)) {
                                query += ` ${filter}:all`;
                            }
                        }
                    }

                    if (newScope.inProject && newScope.tabs.current.id === 'project' && !query.toLowerCase().includes('project:')) {
                        query += ` project:${newScope.$stateParams.projectKey}`;
                    }

                    DataikuAPI.globalfinder.search(query, newScope.globalfinder.advancedSearch === true ? 100 : 10, newScope.$stateParams.projectKey)
                        .success(data => {
                            newScope.globalfinder.hits = data.hits.map(hit => Object.assign({url: newScope.getLink(hit)}, hit));
                            newScope.globalfinder.aggregations = data.aggregations;
                            newScope.buildResult();
                        })
                        .error(() => {
                            newScope.globalfinder.hits = [];
                            newScope.buildResult();
                        });
                } else {
                    newScope.globalfinder.hits = [];
                }
                newScope.focusSearchInput();
            });

            newScope.trimQuery = query => {
                return query.replace(new RegExp(filterPattern, 'g'), '').trim().replace(/\s{2,}/g, ' ').trim();
            };

            newScope.emptySearch = () => {
                newScope.globalfinder.q = "";
                disableAdvancedSearch();
                newScope.triggerSearch();
                newScope.focusSearchInput();
            };

            newScope.focusSearchInput = () => {
                const searchInputs = document.getElementsByClassName("global-finder-modal__search-input");
                if (searchInputs && searchInputs.length > 0) {
                    searchInputs[0].focus();
                }
            };

            newScope.enableTab = tab => {
                newScope.removeAllFilters();
                newScope.tabs.current = tab;
                newScope.globalfinder.aggregations = {};
                newScope.updateLastSearches(newScope.globalfinder.q, newScope.tabs.current.id);
                newScope.triggerSearch(false);
            };

            // We first select the tab based on filter in the query, then based on the last tab.
            newScope.selectTabBasedOnFilter = () => {
                const potentialTab = newScope.tabs.availables.find(t => t.filtersPrefix.some(f => newScope.hasFilter(`${f}:`)));
                if (potentialTab !== undefined) {
                    newScope.tabs.current = potentialTab;
                    return;
                }
                if (newScope.tabs.current === undefined) {
                    newScope.tabs.current = newScope.tabs.availables[0];
                }
            };

            newScope.removeFilter = filter => {
                newScope.globalfinder.q = newScope.globalfinder.q.replace(new RegExp(`${filter}(?=\\s|\$)`, 'g'), '').trim().replace(/\s{2,}/g, ' ');
            };

            newScope.addFilter = filter => {
                newScope.globalfinder.q = `${newScope.globalfinder.q} ${filter}`;
            };

            newScope.hasFilter = filter => newScope.globalfinder.q.includes(filter);

            newScope.hasFilterWithValue = filter => {
                return new RegExp(`${filter}(?=\\s|\$)`, 'g').test(newScope.globalfinder.q);
            };

            newScope.hasAnyFilter = () => new RegExp(filterPattern).test(newScope.globalfinder.q);

            newScope.buildFilterValue = (value) => value.includes(' ') ? `"${value}"` : value;

            newScope.removeAllFilters = prefix => {
                if (prefix === undefined) {
                    newScope.globalfinder.q = newScope.trimQuery(newScope.globalfinder.q);
                } else {
                    newScope.globalfinder.q = newScope.globalfinder.q.replace(new RegExp(`(${prefix}:(".+"|[^ ]+))`, 'g'), '').trim().replace(/\s{2,}/g, ' ').trim();
                }
            };

            newScope.toggleFilter = (facet, value, isAllFilter = false) => {
                const filter = `${facet}:${value}`;
                const hasFilter = newScope.hasFilterWithValue(filter);
                if (newScope.isHelpTabSelected()) {
                    newScope.removeAllFilters(facet);
                }
                if (hasFilter) {
                    newScope.removeFilter(filter);
                } else {
                    newScope.addFilter(filter);
                }
                const allFilter = `${facet}:all`;
                if (isAllFilter) {
                    newScope.removeAllFilters(facet);
                } else if (newScope.hasFilterWithValue(filter)) {
                    newScope.removeFilter(allFilter)
                }
                newScope.triggerSearch(false, false);
            };

            newScope.getAggregationTitle = key => {
                switch (key) {
                    case '_type':
                    case 'help':
                        return "Type";
                    case 'tag.raw':
                        return "Tags";
                    case 'projectKey.raw':
                        return 'Projects';
                    default:
                        return typeof key === 'string' ? key.charAt(0).toUpperCase() + key.slice(1) : key;
                }
            };

            newScope.getAggregationText = (key, aggKey, aggItem) => {
                if (aggKey === 'help') {
                    return aggItem.label ? aggItem.label : key;
                } else if (aggKey === 'projectKey.raw') {
                    return projectNames[key] || key;
                } else if (aggKey === 'user') {
                    return users[key] || key;
                }
                return typeof key === 'string' ? $filter('capitalize')(key.replace(/_/g, " ")) : key;
            };

            newScope.getLastModifiedDate = (item) => {
                let lastModifiedOn = '';
                let createdOn = '';
                let lastReplyTime = '';

                if (!item) {
                    return ''
                }

                if (item._type === "discussion") {
                    lastReplyTime = item._source.lastReplyTime;
                } else if (item._source) { // DSS items
                    lastModifiedOn = item._source.lastModifiedOn;
                    createdOn = item._source.createdOn;
                } else if (item.created_parsed) { // Questions & Answers items
                    lastModifiedOn = item.created_parsed;
                }

                let lastModifiedDate = lastModifiedOn || createdOn || lastReplyTime || '';
                if (!lastModifiedDate) {
                    return lastModifiedDate;
                }

                let currentYear = new Date().getFullYear();
                let itemYear = new Date(lastModifiedDate).getFullYear();

                if (itemYear === currentYear) {
                    return $filter("friendlyDate")(lastModifiedDate, "d MMM");
                } else {
                    return $filter("friendlyDate")(lastModifiedDate, "dd/MM/yyyy");
                }
            };

            newScope.getFilter = key => {
                if (key === '_type') {
                    return 'type';
                }
                if (key === 'tag.raw') {
                    return "tag";
                }
                if (key === 'projectKey.raw') {
                    return 'project';
                }
                return key;
            };

            newScope.formatItemName = item => {
                if (!item) {
                    return '';
                }
                if (item._type === 'discussion') {
                    return item._source.discussions && item._source.discussions.length && item._source.discussions[0].topic ? item._source.discussions[0].topic : "Unnamed discussion";
                }
                return item._source.name;
            };

            newScope.formatItemPath = item => {
                if (!item) {
                    return '';
                }
                if (newScope.isNavigation(item)) {
                    return item._source.path.replace(` > ${item._source.name}`, "");
                }
                if (item._type === 'discussion') {
                    return item._source.projectName + " > " + item._source.objectName;
                }
                if (item._type === 'project') {
                    return item._source.shortDesc;
                }
                return item._source.projectName;
            };

            newScope.formatItemHelpType = item => {
                if (item && item._type) {
                    return $filter('capitalize')(item._type.replace(/_/g, " "));
                }
                return "Help";
            };


            newScope.chunkSize = () => newScope.isHelpTabSelected() ? 10 : 3;
            if (newScope.globalfinder === undefined){
                newScope.globalfinder = {};
            }
            newScope.globalfinder.searchResults = {hits: []};

            newScope.globalfinder.search = (query = newScope.globalfinder.q) => {
                const trimmedQuery = newScope.trimQuery(query);
                // Google search does not accept empty query
                if (!trimmedQuery) {
                    return;
                }
                return newScope.getRowChunk(0)
                .success(newScope.onResult("searchResults"))
                .error(onError(newScope.globalfinder, "searchResults", {hits: []}));
            }

            const onError = (object, fieldName, defaultValue = []) => content => {
                object[fieldName] = defaultValue;
                newScope.buildResult();
            };

            newScope.onResult = fieldName => content => {
                newScope.globalfinder.searchInformation = content.searchInformation;
                newScope.globalfinder[fieldName] = Object.assign({nbHits: parseInt(content.searchInformation.totalResults, 10)}, content, {hits: (content.items ? content.items : []).map(item => Object.assign({url: item.link, isHelp: true, _type: newScope.getItemType(item), _id:item.cacheId}, item))});
                newScope.buildResult();
            };

            newScope.getRowChunk = pageNumber => {
                return DataikuAPI.help.search(newScope.globalfinder.q.replace('help:', 'more:'), {"num": newScope.chunkSize(), "start": (pageNumber * newScope.chunkSize()) + 1});
            }

            newScope.getListRowNumber = () => {
                // According to https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list
                // The JSON API will never return more than 100 results, even if more than 100 documents match
                // So we limit to 100 in case we have more results
                return Math.min(100, newScope.globalfinder.searchInformation ? parseInt(newScope.globalfinder.searchInformation.totalResults, 10) : 100);
            };

            newScope.getItemType = item => {
                const type = item && item.pagemap && item.pagemap.metatags ? item.pagemap.metatags.map(metatag => metatag["og:site_name"]).find(site => site) : undefined;
                if (type === undefined && item.displayLink) {
                    return item.displayLink.match("^[^\.]*")[0];
                }
                return type;
            };

            newScope.transformPage = (pageNumber, response) => {
                const data = (response.items ? response.items : []).map((item, index) => Object.assign({url: item.link, isHelp: true, _type: newScope.getItemType(item), _id: item.cacheId, $idx: index + (newScope.chunkSize() * pageNumber)}, item))
                if (pageNumber == 0) {
                    newScope.globalfinder.allData = [];
                }
                if (data.length > 0) {
                    newScope.globalfinder.allData.splice(data[0].$idx, 0, ...data);
                }
                if (response.searchInformation) {
                    newScope.globalfinder.searchInformation = response.searchInformation;
                }
                return function(i, j) {
                    return data[i % newScope.chunkSize()];
                };
            };

            newScope.buildSearchAggregations = () => {
                // In case the search is not configured to have facets, display them in full
                if (!newScope.globalfinder.searchResults || !newScope.globalfinder.searchResults.context) {
                    return;
                }
                newScope.globalfinder.aggregations = {
                    'help': {
                        doc_count: parseInt(newScope.globalfinder.searchInformation.totalResults, 10),
                        agg: {
                            buckets: (newScope.globalfinder.searchResults.context || {facets: []}).facets.map(facet => ({key: facet[0].label, doc_count: 0, label: facet[0].anchor}))
                        }
                    }
                };
            };

            newScope.isHelpTabSelected = _ => newScope.tabs.current.id === 'help';

            const nameMatch = (hit, query) => {
                if (!hit) {
                    return false;
                }
                if (hit._source.name) {
                    return hit._source.name.toLowerCase() === query.toLowerCase();
                }
                else if (hit._source.objectName) {
                    return hit._source.objectName.toLowerCase() === query.toLowerCase();
                }
                return false;
            };

            newScope.mergeResult = () => {
                const helpData = newScope.shouldTriggerHelpSearch() ? newScope.globalfinder.searchResults.hits : [];
                if (newScope.globalfinder.advancedSearch === true && newScope.isHelpTabSelected()) {
                    newScope.buildSearchAggregations();
                }
                const initialData = newScope.globalfinder.advancedSearch === true ? [] : [{_type: 'search', _source: {name: `Search ${newScope.globalfinder.q}`, query:newScope.globalfinder.q  }, icon: "global-finder-modal__search-type-icon icon-dku-search"}];
                const hits = newScope.hasFilter('help:') ? [] : newScope.globalfinder.hits.map(hit => {
                    if (hit.url && newScope.$stateParams.projectKey) {
                        hit.url = hit.url.replace(':projectKey:', newScope.$stateParams.projectKey);
                    }
                    return hit;
                });

                if (hits.length > 0 && nameMatch(hits[0], newScope.globalfinder.trimmedQuery)) {
                    newScope.globalfinder.results = hits.slice(0, 1).concat(initialData.concat(hits.slice(1).concat(helpData))).filter(el => el);
                } else {
                    newScope.globalfinder.results = initialData.concat(hits.concat(helpData)).filter(el => el);
                }
                newScope.globalfinder.results.forEach((val, index) => val.$idx = index);
                newScope.globalfinder.allData = [...newScope.globalfinder.results];
                newScope.globalfinder.searching = false;
            };

            newScope.buildResult = Debounce().withDelay(100, 100).wrap(newScope.mergeResult);

            newScope.clickItem = item => {
                if (item === null || item === undefined) {
                    return;
                }
                WT1.event("global-finder-item-open", {
                    type: item._type,
                    id: item._id || item.objectID,
                    currentTab: newScope.globalfinder.advancedSearch ? newScope.tabs.current.id : "",
                    filters: newScope.globalfinder.advancedSearch && newScope.hasAnyFilter() ? Array.from(newScope.globalfinder.q.matchAll(new RegExp(filterPattern, 'g')), x => x[0]) : []
                });
                if (item._type === 'search') {
                    newScope.globalfinder.advancedSearch = true;
                    newScope.globalfinder.q = item._source.query;

                    let isOldSearch = !!item._source.tabId;
                    if (isOldSearch) {
                        setCurrentTab(item._source.tabId);
                    }
                    newScope.triggerSearch(!isOldSearch);
                    newScope.updateLastSearches(newScope.globalfinder.q, newScope.tabs.current.id);
                    return;
                }
                if (newScope.simulateClick(item)) {
                    newScope.focusSearchInput(); // reset activeElement after a click
                }
            };

            newScope.openItem = item => {
                if (item && item.url) {
                    const aElem = document.querySelector(`.global-finder-modal__line a[href="${item.url}"]`);
                    if (aElem) {
                        $timeout(() => {
                            aElem.focus();
                            aElem.click();
                        });
                    }
                } else {
                    newScope.clickItem(item);
                }
            };

            newScope.simulateClick = item => {
                const itemURL = new URL(item.isHelp ? item.url : `${window.location.protocol}//${window.location.host}${item.url}`);
                // The redirect behavior is different if the user is already on the desired page
                if (window.location.pathname === itemURL.pathname) {
                    newScope.dismiss();
                    if (itemURL.hash) {
                        window.location.hash = itemURL.hash;
                        document.getElementById(itemURL.hash.substr(1)).scrollIntoView();
                    }
                    return false;
                }
                return true;
            };

            function disableAdvancedSearch() {
                newScope.globalfinder.advancedSearch = false;
            }

            newScope.tabs = {
                availables: [
                    {id: 'all', value: 'All', filtersPrefix: []},
                    {id: 'instance', value: `${newScope.wl.productShortName} Items`, filtersPrefix: ['type', 'user', 'tag', 'project']},
                    {id: 'navigation', value: 'Navigation', filtersPrefix: ['navigation']},
                    {id: 'help', value: 'Help topics', filtersPrefix: ['help']}
                ]
            };
            if (!newScope.helpIntegrationEnabled()) {
                newScope.tabs.availables.pop(); // Assuming help is the last tab
            }
            if (newScope.inProject && newScope.projectSummary) {
                newScope.tabs.availables.splice(1, 0, {id: 'project', value: newScope.projectSummary.name, filtersPrefix: ['type', 'user', 'tag']});
            }

            function setCurrentTab(currentTabId = undefined) {
                if (currentTabId !== undefined) {
                    const wantedTab = newScope.tabs.availables.find(t => t.id === currentTabId);
                    if (wantedTab !== undefined) {
                        newScope.enableTab(wantedTab);
                        return;
                    }
                }

                newScope.tabs.current = newScope.tabs.availables[0];
            }

            setCurrentTab(tabId);

            function shortcutTabAction(incr) {
                return e => {
                    if (!newScope.globalfinder.advancedSearch) {
                        return;
                    }
                    e.preventDefault();

                    // We want a positive result for a negative number
                    // Unfortunately, -1 % 4 = -1 in JS
                    function mod(n, m) {
                        return ((n % m) + m) % m;
                    }

                    const nextTab = newScope.tabs.availables[mod(newScope.tabs.availables.findIndex(tab => tab.id === newScope.tabs.current.id) + incr, newScope.tabs.availables.length)];
                    if (nextTab !== undefined) {
                        newScope.enableTab(nextTab);
                    }
                };
            }

            newScope.$on('selectedIndex', (event, index) => {
                if (!newScope.globalfinder.advancedSearch || index === -1) {
                    return;
                }
                newScope.$broadcast('scrollToLine', index);
            });

            newScope.selectItem = item => {
                if (item.selectable === false || item.$idx === newScope.selected.index) {
                    return;
                }
                newScope.selectIndex(item.$idx);
            };

            Mousetrap(document.querySelector(".global-finder-modal__search-input")).bind('tab', shortcutTabAction(1));
            Mousetrap(document.querySelector(".global-finder-modal__search-input")).bind('shift+tab', shortcutTabAction(-1));

            newScope.aggsCollapsing = {};

            const initialAggCollapsing = 7;
            const subsequentAggCollapsing = 50;
            newScope.getAggCollapsing = agg => {
                const aggId = agg._key;
                if (newScope.aggsCollapsing[aggId] === undefined) {
                    let result = initialAggCollapsing;
                    // If we are just 1 item away from the max, include it rather than displaying "+ 1 more".
                    if (result === agg.agg.buckets.length - 1) {
                        result++;
                    }
                    return result;
                } else {
                    return newScope.aggsCollapsing[aggId];
                }
            };
            // When user clicks on "+ X more", we first display up to 50 results, then each subsequent click doubles the number.
            newScope.setAggCollapsing = agg => {
                let result = newScope.getAggCollapsing(agg);
                result = result < subsequentAggCollapsing ? subsequentAggCollapsing : 2 * result;
                // If we are just 1 item away from the max, include it rather than displaying "+ 1 more".
                if (result === agg.agg.buckets.length - 1) {
                    result++;
                }
                newScope.aggsCollapsing[agg._key] = result;
            };
        });

        $scope.globalFinderModal.catch(() => {
            $scope.globalFinderModal = null
        });
    };

    $scope.isItemSelectable = item => item.selectable === undefined || item.selectable === true;
    $scope.isNavigation = item => item && item._type === 'page';

    $scope.itemToIcon = (item, inList) => {
        if (!item) {
            return;
        }
        if (item.isHelp) {
            return 'icon-dku-help';
        }
        if (item._type === 'page') {
            return 'icon-list'
        }
        return CatalogItemService.itemToIcon(item._type, item._source, inList);
    };

    $scope.itemToColor = item => {
        if (!item) {
            return;
        }
        if (item._type === 'page') {
            return 'navigation';
        }
        if (item.isHelp) {
            return 'home';
        }
        return CatalogItemService.itemToColor(item._type, item._source);
    };

    $scope.disableItemIcon = item => {
        if (item && item._source && item._source.closed) {
            return 'global-finder-modal__search-type-icon--disabled';
        }
    };

    $scope.getLink = (item, discussionId) => {
        if (!item || item.isHelp) {
            return;
        }
        if (item._type === 'page') {
            return item._source.url;
        }
        return CatalogItemService.getLink(item._type, item._source, discussionId);
    };
});


app.controller('RequestEETrialController', function ($scope, $state, Assert, DataikuAPI, DataikuCloudAPI, $rootScope) {
    Assert.inScope($scope, 'appConfig');
    Assert.trueish($scope.appConfig.licensing.community, 'not a free edition');
    $scope.request = {
        state : "initial"
    };

    $scope.request.updatedEmailAddress = $scope.appConfig.licensing.ceRegistrationEmail;

    $scope.sendRequest = function() {
        DataikuCloudAPI.community.requestEETrial(
                $scope.appConfig.licensing.ceInstanceId,
                $scope.request.updatedEmailAddress).success(function(data){

            $scope.trialRequestResponse = data;
            if (data.granted) {
                $scope.request.state = "granted";
            } else {
                $scope.request.state = "denied";
            }
        }).error(setErrorInScope.bind($scope));
    };
});


app.controller('RegisterController', function ($scope, $state, Assert, DataikuAPI, DataikuCloudAPI, $rootScope) {
    Assert.inScope($scope, 'appConfig');

    $scope.register = {
        state: 'welcome',
        wantEETrial: false,
        step: '1'
    };
    $scope.newAccount = {
        newsletter: true
    };
    $scope.existingAccount = {};
    $scope.existingKey = {};

    function fetchWebConfig() {
        DataikuCloudAPI.getWebConfig().then(function(id) {
            $scope.webVisitorId = id;
        });
         DataikuCloudAPI.getNewWebConfig().then(function(data) {
            $scope.webVisitorLocalId = data.visitor_id;
            $scope.webVisitorHSId = data.hs_id;
        });
    }
    fetchWebConfig();

    $scope.logMeIn = function() {
        window.location = '/';
    };

    $scope.switchStep = function(state, step) {
        $scope.register.state = state;
        $scope.register.step = step;
    }

    $scope.$watch("register.mode", function(nv, ov) {
        $scope.fatalAPIError = null;
    });

    function setCEThanks(data) {
        if (!data.trialRequestResponse) {
            $scope.register.state = "thanks-ce";
        } else if (data.trialRequestResponse.granted) {
            $scope.register.state = "thanks-ee-trial-granted";
        } else if (!data.trialRequestResponse.granted) {
            $scope.register.state = "thanks-ee-trial-denied";
        }
    }

    $scope.registerNewAccount = function() {
        Assert.trueish($rootScope.appConfig.saasManagerURL, 'Not a saas instance');

        DataikuCloudAPI.community.register(
            $scope.newAccount.firstName, $scope.newAccount.lastName,
            $scope.newAccount.company, $scope.newAccount.persona,
            $scope.newAccount.userEmail,
            $scope.newAccount.newsletter,
            $scope.register.wantEETrial,
            $rootScope.appConfig.version.product_version,
            $scope.webVisitorId, $scope.webVisitorLocalId, $scope.webVisitorHSId,
            $rootScope.appConfig.registrationChannel
        ).success(function(data) {
            /* Write the received license */
            DataikuAPI.registration.initialRegisterCommunity(
                $scope.newAccount.firstName, $scope.newAccount.lastName,
                $scope.newAccount.userEmail,
                data.instanceId, data.license).success(function(data2) {

                $scope.register.registrationResult = data;
                $scope.register.loginInfo = data2;
                if (data.trialRequestResponse && data.trialRequestResponse.granted) {
                    $scope.switchStep('enter-trial-license', 3);
                } else {
                    setCEThanks($scope.register.registrationResult);
                }
            }).error(setErrorInScope.bind($scope));
        }).error(setErrorInScope.bind($scope));
    };

    $scope.registerNoAccount = function () {
        Assert.trueish($rootScope.appConfig.saasManagerURL, 'not a saas instance');

        var firstName = "Unknown";
        var lastName = "Unknown";
        var company = "Unknown";
        var ts = new Date().getTime();
        var userEmail = $scope.webVisitorId + "-" + ts +  "@unknownvisitor.no";
        var password = "Unknown";

        DataikuCloudAPI.community.registerNewAccount(
            firstName, lastName,
            company, userEmail,
            password, 0,
            false,
            $rootScope.appConfig.version.product_version,
            $scope.webVisitorId, $scope.webVisitorLocalId, $scope.webVisitorHSId,
            $rootScope.appConfig.registrationChannel
        ).success(function(data) {
                /* Write the received license */
                DataikuAPI.registration.initialRegisterCommunity(
                    $scope.newAccount.firstName, $scope.newAccount.lastName,
                    $scope.newAccount.userEmail,
                    data.instanceId, data.license).success(function(data2) {

                        $scope.register.registrationResult = data;
                        $scope.register.loginInfo = data2;
                        setCEThanks(data);

                    }).error(setErrorInScope.bind($scope));
            }).error(setErrorInScope.bind($scope));
    };

    $scope.registerExistingAccount = function() {
        Assert.trueish($rootScope.appConfig.saasManagerURL, 'not a saas instance');

        DataikuCloudAPI.community.registerExistingAccount(
            $scope.existingAccount.userEmail,
            $scope.existingAccount.password,
            $scope.register.wantEETrial,
            $rootScope.appConfig.version.product_version,
            $scope.webVisitorId, $scope.webVisitorLocalId, $scope.webVisitorHSId,
            $rootScope.appConfig.registrationChannel
        ).success(function(data) {
            DataikuAPI.registration.initialRegisterCommunity(
                data.firstName, data.lastName,
                $scope.existingAccount.userEmail,
                data.instanceId, data.license).success(function(data2) {

                $scope.register.registrationResult = data;
                $scope.register.loginInfo = data2;
                setCEThanks(data);

            }).error(setErrorInScope.bind($scope));
        }).error(setErrorInScope.bind($scope));
    };

    $scope.setLicense = function() {
        DataikuAPI.registration.initialRegisterLicensed($scope.existingKey.license).success(function(data) {
            $scope.register.loginInfo = data;
            $scope.register.state = "thanks-license";
        }).error(setErrorInScope.bind($scope));
    };
});


app.controller('RenewLicenseController', function($scope, $state, Assert, DataikuAPI, DataikuCloudAPI, $rootScope) {
    Assert.inScope($scope, 'appConfig');
    $scope.existingKey = {}

    $scope.logMeIn = function(){
        window.location = '/';
    };

    $scope.setLicense = function() {
        DataikuAPI.registration.renewExpiredLicense($scope.existingKey.license).success(function(data) {
            $scope.registrationSuccessful = {}
        }).error(setErrorInScope.bind($scope));
    };
});

app.constant("HomeBehavior", { LAST: 'last', DEFAULT: 'home', PROJECTS: 'project-list' });

app.controller("FeedbackController", function($scope, WT1){
    $scope.feedbackContent = {
        comment: '',
        email: $scope.appConfig.user && $scope.appConfig.user.email ? $scope.appConfig.user.email : ''
    }
    $scope.finished = false;

    $scope.sendFeedback = function() {
        $scope.finished = true;
        WT1.event("dss-feedback", $scope.feedbackContent);
    }
});

app.controller('LoginController', function($scope, $state, $location, DataikuAPI, TopNav, LoggerProvider) {

    const Logger = LoggerProvider.getLogger('LoginController');

    TopNav.setLocation(TopNav.LOGIN, "login");

    var lic = $scope.appConfig.licensing;
    $scope.communityLook = lic.community && !lic.ceEntrepriseTrial;
    if (lic.ceEntrepriseTrialUntil > Date.now()) {
        $scope.daysLeft = Math.floor((lic.ceEntrepriseTrialUntil - Date.now()) / (24 * 3600 * 1000));
    }

    $scope.submit = function() {
        var formLogin = $("input[name=login]").val(),
            formPassword = $("input[name=password]").val();

        $scope.loginFailed = false;
        $scope.loginErrorMessage = '';
        DataikuAPI.login(formLogin, formPassword).success(function(data) {
            const redirectTo = $state.params.redirectTo;
            if (redirectTo) {
                Logger.info("GO " + redirectTo);
                // ui-router does not seem to manage changes of $location.url ... It just does not do anything
                // And since I have a URL, I can't use transitionTo
                // SO I have to reload. It sucks
                const url = new URL(window.location.href);
                url.search = '';            // Remove ?redirectTo
                url.pathname = redirectTo;  // Only follow redirects to a local path, not to another site
                window.location = url.href;
            } else {
                // I also do it here to ensure that we reload appConfig
                window.location = "/";
            }
        }).error(function(data, status, headers) {
            $scope.loginFailed = true;
            if (data.errorType) {
                $scope.loginError = getErrorDetails(data, status, headers)
            } else {
                $scope.loginErrorMessage = data;
            }
        });
    };


    if ($scope.appConfig.loggedIn && !$scope.appConfig.noLoginMode) {
        // it's confusing to leave people on a blank login screen when they are actually logged in
        $scope.redirectHome();
    }

});


app.controller('OAuth2ResponseController', function($scope, $state, $location, ActivityIndicator) {
    const userState = $state.params.userState;
    const success = $state.params.success;

    if (success === "true") {
        ActivityIndicator.success("OAuth2 credential obtained", 5000);
    } else {
        const message = $state.params.message;
        ActivityIndicator.error("Could not obtain OAuth2 credential: " + message, 10000);
    }

    if (userState) {
        $state.transitionTo(userState);
    } else {
        // Should only happen if the response comes back from the auth server and we don't recognize it
        $state.transitionTo("home")
    }
});


app.controller('NewTutorialProjectController', function($scope, Assert, DataikuAPI, $state, WT1, CreateModalFromTemplate) {
    function updateDisplay(){
        if (!$scope.tutorialsList) return;

        $scope.availableSections =[];
        $scope.availableTutorials ={};
        $scope.tutorialsList.items.forEach(function(x){
            if ( x.archiveType != 'FETCH' ) {
                // get the image from the backend for builtin tutorials. Remote tutorials have
                // to provide the image themselves, so we can use their imageURL directly
                x.imageURL = '/dip/api/image/get-tutorial-thumbnail?tutorialId=' + x.id;
            }
            if (x.type == $scope.uiState.currentType) {
                if ($scope.availableSections.indexOf(x.sectionName) < 0) {
                    $scope.availableSections.push(x.sectionName);
                    $scope.availableTutorials[x.sectionName] = [];
                }
                $scope.availableTutorials[x.sectionName].push(x);
            }
        });
        $scope.uiState.currentSection = $scope.availableSections[0]
    }

    DataikuAPI.projects.listTutorials().success(function(data){
        $scope.tutorialsList = data;
        updateDisplay();
    }).error(setErrorInScope.bind($scope));

    $scope.$watch("uiState.currentType", updateDisplay);

    $scope.start = function(id) {
        Assert.trueish(id, 'No tutorial id');

        // note to self: pass the parent scope of this modal's scope as the download modal's scope's parent, since
        // we're going to dismiss this modal right now (and if the download modal was using this scope, then it would be
        // created non functional...)
        CreateModalFromTemplate("/templates/projects/tutorial-download.html", $scope.attachDownloadTo, null, function(newScope) {
            newScope.tutorialIdToInstall = id;
            newScope.tutorialType = $scope.uiState.currentType;
        });

        $scope.dismiss();
    };
});


app.controller('TutorialDownloadController', function($scope, DataikuAPI, MonoFuture, Fn, WT1, $state, ProjectFolderContext) {
    $scope.state = "NOT_STARTED";

    function go(){
        MonoFuture($scope).wrap(DataikuAPI.projects.createTutorial)($scope.tutorialIdToInstall, $scope.tutorialType, ProjectFolderContext.getCurrentProjectFolderId()).success(function(data) {
            $scope.state = data.result.success ? "DONE" : "FAILED";
            $scope.stateShown = null;
            if (!data.result.success) {
                $scope.failure = {
                    message : data.result.installationError.detailedMessage
                }
                WT1.event("tutorial-project-creation-failed", {tutorialId : $scope.tutorialIdToInstall});
            } else {
                $scope.needsGoingToTutorial = true;
                $scope.projectKey = data.result.projectKey;
                WT1.event("tutorial-project-created", {tutorialId : $scope.tutorialIdToInstall});
            }

            $scope.installingFuture = null;
        }).update(function(data) {
            $scope.stateShown = data.progress != null && data.progress.states != null && data.progress.states.length > 0 ?
                                                                    data.progress.states[data.progress.states.length - 1] : null;
            $scope.state = "RUNNING";
            $scope.installingFuture = data;
        }).error(function (data, status, headers) {
            $scope.state = "FAILED";
            if ( data.aborted) {
                $scope.failure = {
                        message : "Aborted"
                }
            } else if (data.hasResult) {
                $scope.failure = {
                        message : data.result.errorMessage
                }
            } else {
                $scope.failure = {
                        message : "Unexpected error"
                }
            }
            $scope.installingFuture = null;
        });
    }

    $scope.abort = function() {
        $scope.state = "FAILED";
        $scope.failure = {
            message : "Aborted"
        }
        DataikuAPI.futures.abort($scope.installingFuture.jobId);
    };

    $scope.closeAndGo = function(){
        $scope.dismiss();
        $state.go("projects.project.home.regular", {projectKey : $scope.projectKey})
    }

    $scope.$on("$destroy", function(){
        if ($scope.state == "RUNNING") {
            $scope.abort();
        }
    });

    /* Wait for the plugin id to start */
    $scope.$watch("tutorialIdToInstall", Fn.doIfNv(go));
});


app.controller('NewProjectController', function($scope, DataikuAPI, $state, $stateParams, WT1, ProjectFolderContext) {
    $scope.modalTabState = { active: "create" };
    $scope.newProject = {};
    $scope.uniq = true;

    DataikuAPI.projects.listAllKeys()
        .success(function(data) { $scope.allProjectKeys = data; })
        .error(setErrorInScope.bind($scope));

    function isProjectKeyUnique(value) {
        return !$scope.allProjectKeys || $scope.allProjectKeys.indexOf(value) < 0;
    };

    $scope.$watch("newProject.projectKey", function(nv, ov) {
        $scope.uniq = !nv || isProjectKeyUnique(nv);
    });

    $scope.$watch("newProject.name", function(nv, ov) {
        if (!nv) return;
        var slug = nv.toUpperCase().replace(/\W+/g, ""),
            cur = slug,
            i = 0;
        while (!isProjectKeyUnique(cur)) {
            cur = slug + "_" + (++i);
        }
        $scope.newProject.projectKey = cur;
    });

    $scope.create = function() {
        DataikuAPI.projects.create($scope.newProject.projectKey, $scope.newProject.name, ProjectFolderContext.getCurrentProjectFolderId())
            .success(function(data) {
                $scope.dismiss();
                $state.transitionTo("projects.project.home.regular", {projectKey : $scope.newProject.projectKey});
            }).error(setErrorInScope.bind($scope));
        WT1.event("project-create");
    };
});


// Re-render dku-bs-select every time the source connection to update connection sorting
app.directive("importProjectRemappingForm", function() {
    return {
        scope: false,
        link: function($scope, $elt) {
            $scope.$watch("conn.source", function(nv) {
                if (!nv) return;
                $elt.find('select[dku-bs-select]').selectpicker('refresh');
            })
            $scope.$watch("codeEnv.source", function(nv) {
                if (!nv) return;
                $elt.find('select[dku-bs-select]').selectpicker('refresh');
            })
        }
    }
});


app.controller('ImportProjectController', function($scope, Assert, DataikuAPI, $state,
               FutureWatcher, ProgressStackMessageBuilder, CreateModalFromTemplate, Dialogs, $timeout, Fn, WT1, ProjectFolderContext) {
    // get the list, don't get it from the home (in case the call to populate the home is too slow)
    DataikuAPI.projects.listAllKeys()
    .success(function(data) { $scope.allProjectKeys = data; })
    .error(setErrorInScope.bind($scope));

    $scope.importData = {}
    $scope.importSettings = {
        remapping : {
            connections : []
        },
        targetProjectFolderId: ProjectFolderContext.getCurrentProjectFolderId()
    };

    $scope.phase = "READY_TO_UPLOAD";
    $scope.prepare = {enabled: false};

    $scope.selectFilter = function(selected) {
        return function(connection) {
            return !connection.mapped || connection.name == selected;
        }
    };

    $scope.updateSelect = function(e) {
        // Nothing to do
    };

    $scope.connComparator = function(sourceCon) {
        var
            source = $scope.findConnection(
            $scope.prepareResponse.usedConnections, sourceCon);
        var sourceType = source && source.type;
        return function(connection) {
            if (connection.type == sourceType) {
                return "AAAAA" + connection.type + "." + connection.name;
            } else {
                return "ZZZZZ" + connection.type + "." + connection.name;
            }
        };
    };

    $scope.codeEnvComparator = function(sourceCodeEnv) {
        var
            source = $scope.findCodeEnv(
            $scope.prepareResponse.usedCodeEnvs, sourceCodeEnv);
        var sourceEnvLang = source && source.envLang;
        return function(codeEnv) {
            if (codeEnv.envLang == sourceEnvLang) {
                return "AAAAA" + codeEnv.envLang + "." + codeEnv.name;
            } else {
                return "ZZZZZ" + codeEnv.envLang + "." + codeEnv.name;
            }
        };
    };

    $scope.findConnection = function(connections, connection) {
        return Array.dkuFindFn(connections, function(c) { return c.name == connection });
    };

    $scope.findCodeEnv = function(codeEnvs, codeEnvName) {
        return Array.dkuFindFn(codeEnvs, function(c) { return c.envName == codeEnvName });
    };

    var abortHook = null;
    $scope.attemptImport = function(){
        Assert.trueish($scope.phase == "READY_TO_IMPORT", 'not ready to import');
        Assert.trueish($scope.uploadResult.id, 'no upload id');

        $scope.phase = "IMPORTING";

        resetErrorInScope($scope);
        DataikuAPI.projects.startImport($scope.uploadResult.id, $scope.importSettings).success(function(initialResponse){
            abortHook = function() {
                DataikuAPI.futures.abort(initialResponse.jobId).error(setErrorInScope.bind($scope));
            };
            FutureWatcher.watchJobId(initialResponse.jobId)
                .success(function(data) {
                    abortHook = null;
                    $scope.futureResponse = null;
                    $scope.importResponse = data.result;
                    if ($scope.importResponse && $scope.importResponse.success){
                        var p2 = $scope.$parent.$parent;
                        $scope.dismiss();
                        Dialogs.infoMessagesDisplayOnly(p2, "Import report", $scope.importResponse).then(function(){
                            $state.transitionTo("projects.project.home.regular", {projectKey : $scope.importResponse.usedProjectKey});
                        });
                    } else {
                        $scope.phase = "READY_TO_IMPORT";

                        // fetch the new manifest in case the migration added some stuff
                        $scope.prepare.enabled = true;
                        prepareImport();
                    }

                }).update(function(data){
                    $scope.percentage =  ProgressStackMessageBuilder.getPercentage(data.progress);
                    $scope.futureResponse = data;
                    $scope.stateLabels = ProgressStackMessageBuilder.build($scope.futureResponse.progress, true);
                }).error(function(data, status, headers) {
                    abortHook = null;
                    $scope.futureResponse = null;
                    $scope.importResponse = null;
                    $scope.phase = "READY_TO_IMPORT";
                    setErrorInScope.bind($scope)(data, status, headers);
                    $timeout(checkProjectKey);
                });
        }).error(function(a,b,c){
            $scope.phase = 'READY_TO_IMPORT';
            setErrorInScope.bind($scope)(a,b,c);
            $scope.importResponse = null;
            $timeout(checkProjectKey);
        });
        WT1.event("project-import",{
            displayAdvancedOptions : $scope.prepare.enabled,
            nbRemappings : $scope.importSettings.remapping ? $scope.importSettings.remapping.connections ? $scope.importSettings.remapping.connections.length : 0 : 0
        });
    }

    $scope.$on("$destroy", function() {
        // cancel import if modal dismissed
        if (abortHook) abortHook();
    });

    $scope.startImport = function(){

        $scope.phase = "UPLOADING";

        DataikuAPI.projects.uploadForImport($scope.importData.file, function(e){
            if (e.lengthComputable) {
                $scope.$apply(function () {
                    $scope.uploadProgress = Math.round(e.loaded * 100 / e.total);
                });
            }
        }).then(function (data) {
            $scope.uploadResult = JSON.parse(data);
            prepareImport();

        }).catch((error) => {
            $scope.phase = '';
            setErrorInScope2.call($scope, error);
        });
    };

    function prepareImport() {
        DataikuAPI.projects.prepareImport($scope.uploadResult.id, $scope.importSettings)
            .success(function(data) {
                $scope.prepareResponse = data;

                $scope.usedConnections = data.usedConnections.map(Fn.prop('name'));
                $scope.usedCodeEnvs = data.usedCodeEnvs.map(Fn.prop('envName'));
                $scope.availableCodeEnvs = [{envLang:'PYTHON', envName:'Builtin', builtin:true}, {envLang:'R', envName:'Builtin', builtin:true}].concat($scope.prepareResponse.availableCodeEnvs);
                $scope.$watch("importSettings.targetProjectKey", checkProjectKey);

                $scope.phase = "READY_TO_IMPORT";
                if (!$scope.prepare.enabled) $scope.attemptImport();
            }).error(setErrorInScope.bind($scope));
    }

    $scope.refreshConnections = function() {
        $scope.prepare.enabled = true;
        prepareImport();
    };

    $scope.refreshCodeEnvs = function() {
        $scope.prepare.enabled = true;
        prepareImport();
    };

    function checkProjectKey(nv) {
        if ($scope.phase != "READY_TO_IMPORT") return;

        var unique;
        if(!$scope.importSettings.targetProjectKey) {
            unique = $scope.allProjectKeys.indexOf($scope.prepareResponse.originalProjectKey) == -1;
        } else {
            unique = $scope.allProjectKeys.indexOf($scope.importSettings.targetProjectKey.toUpperCase().replace(/\W+/g, "")) == -1;
        }
        $scope.importProjectForm.projectKey.$dirty = true;
        $scope.importProjectForm.projectKey.$setValidity("unique", unique);
    }
});

app.controller('DuplicateProjectController', function($scope, DataikuAPI, FutureWatcher, ProgressStackMessageBuilder, WT1, $state, ProjectFolderContext, PromiseService, $q, $window) {
    $scope.hasPartitionedDataset = false;
    $scope.uniq = true;
    $scope.dupProject = {
        projectKey: "COPY_OF_" + $scope.projectSummary.projectKey,
        name: "Copy of " + $scope.projectSummary.name
    };
    $scope.dupOptions = {
        exportAnalysisModels: true,
        exportSavedModels: true,
        exportGitRepository: true,
        exportInsightsData: true,
        duplicationMode: 'UPLOADS_ONLY',
        exportUploads: true,
        exportAllInputDatasets: true,
        exportAllInputManagedFolders: true,
        exportAllDatasets: false,
        exportManagedFolders: false,
        targetProjectFolderId: ProjectFolderContext.getCurrentProjectFolderId(),
    };
    $scope.phase = 'READY_TO_DUPLICATE';

    DataikuAPI.projects.listAllKeys()
        .success(function(data) {
            $scope.allProjectKeys = data;
            $scope.$watch("dupProject.name", function(nv, ov) {
                if (!nv) return;
                var slug = nv.toUpperCase().replace(/\W+/g, ""),
                    cur = slug,
                    i = 0;
                while (!isProjectKeyUnique(cur)) {
                    cur = slug + "_" + (++i);
                }
                $scope.dupProject.projectKey = cur;
            });
        })
        .error(setErrorInScope.bind($scope));

    DataikuAPI.projectFolders.listContents($scope.dupOptions.targetProjectFolderId === null ? '' : $scope.dupOptions.targetProjectFolderId, true, 1, true).success(data => {
        const pathElts = treeToList(data.folder, item => item.parent);
        $scope.dupFolder = angular.extend({}, data.folder, { pathElts: pathElts.map(f => f.name).join('/') });
    }).error(setErrorInScope.bind($scope));

    function isProjectKeyUnique(value) {
        return !$scope.allProjectKeys || $scope.allProjectKeys.indexOf(value) < 0;
    }

    $scope.uniq = isProjectKeyUnique($scope.dupProject.projectKey);

    $scope.$watch("dupProject.projectKey", function(nv, ov) {
        $scope.uniq = !nv || isProjectKeyUnique(nv);
    });

    $scope.connComparator = function(sourceCon) {
        var
            source = $scope.findConnection(
            $scope.prepareResponse.usedConnections, sourceCon);
        var sourceType = source && source.type;
        return function(connection) {
            /**
             * Returns the order in which the available connections will be displayed in the selector
             * - high up in the list if the connection types are compatible (so starting with "AAAAA")
             * - last in the list if they are not (starting with "ZZZZZ")
             */
            if (connection.type == sourceType) {
                return "AAAAA" + connection.type + "." + connection.name;
            } else {
                return "ZZZZZ" + connection.type + "." + connection.name;
            }
        };
    };

    $scope.findConnection = function(connections, connection) {
        return Array.dkuFindFn(connections, function(c) { return c.name == connection });
    };

    $scope.refreshConnections = function(projectKey) {
        DataikuAPI.projects.getProjectDatasets(
            projectKey
        ).then(function(initialResponse){
            $scope.prepareResponse = $scope.prepareResponse ? $scope.prepareResponse : {};
            $scope.prepareResponse.usedConnections = [];
            $scope.usedConnections = [];
            for (let requiredConnection in initialResponse.data.requiredConnections) {
                $scope.prepareResponse.usedConnections.push(initialResponse.data.requiredConnections[requiredConnection]);
                $scope.usedConnections.push(initialResponse.data.requiredConnections[requiredConnection].name);
            }
            $scope.hasPartitionedDataset = initialResponse.data.hasPartitionedDataset;
        });

        DataikuAPI.projects.prepareImport('', '')
            .then(function(response) {
                $scope.prepareResponse = $scope.prepareResponse ? $scope.prepareResponse : {};
                $scope.prepareResponse.availableConnections = [];
                response.data.availableConnections.forEach(function(availableConnection){
                    $scope.prepareResponse.availableConnections.push(availableConnection);
                });
            })
    };

    $scope.setDuplicationMode = function(mode) {
        $scope.dupOptions.duplicationMode = mode;
    };

    var abortHook = null;

    $scope.gotoResult = function() {
        $scope.dismiss();
        $window.location.assign($state.$current.url.sourcePath.replace(":projectKey",$scope.dupProject.projectKey));
    };

    $scope.duplicate = function() {
        $scope.phase = 'DUPLICATING';
        $scope.dupOptions.targetProjectKey = $scope.dupProject.projectKey;
        $scope.dupOptions.targetProjectName = $scope.dupProject.name;
        DataikuAPI.projects.startProjectDuplication(
            $scope.projectSummary.projectKey,
            $scope.dupOptions
        ).success(function(initialResponse){
            abortHook = function() {
                DataikuAPI.futures.abort(initialResponse.jobId).error(setErrorInScope.bind($scope));
            };
            FutureWatcher.watchJobId(initialResponse.jobId).success(function(data){
                abortHook = null;
                $scope.futureResponse = null;
                $scope.duplicateResponse = data.result;
                if (!data.aborted && (data.result.success || data.result.messages == null || data.result.messages.length == 0)) {
                	$scope.gotoResult();
                } else if ((data.result.warning || data.result.error) && !data.result.fatal) {
                	$scope.phase = "SHOW_WARNINGS";
                } else {
                    $scope.phase = "READY_TO_DUPLICATE";
                }
            }).update(function(data){
                $scope.percentage = ProgressStackMessageBuilder.getPercentage(data.progress);
                $scope.futureResponse = data;
                $scope.stateLabels = ProgressStackMessageBuilder.build($scope.futureResponse.progress, true);
            }).error(function(data, status, headers) {
                abortHook = null;
                $scope.futureResponse = null;
                $scope.duplicateResponse = null;
                $scope.phase = "READY_TO_DUPLICATE";
                setErrorInScope.bind($scope)(data, status, headers);
            })
        }).error(function(a,b,c){
            $scope.phase = 'READY_TO_DUPLICATE';
            setErrorInScope.bind($scope)(a,b,c);
            $scope.duplicateResponse = null;
        });
        WT1.event("project-duplicate", {
            duplicationMode: $scope.dupOptions.duplicationMode,
            exportAnalysisModels: $scope.dupOptions.exportAnalysisModels,
            exportSavedModels: $scope.dupOptions.exportSavedModels,
            exportModelEvaluationStores: $scope.dupOptions.exportModelEvaluationStores,
            exportGitRepository: $scope.dupOptions.exportGitRepository,
            exportInsightsData: $scope.dupOptions.exportInsightsData,
            nbRemappings: $scope.dupOptions.remapping ? $scope.dupOptions.remapping.connections ? $scope.dupOptions.remapping.connections.length : 0 : 0
        });
    };

    $scope.$on("$destroy", function() {
        // cancel import if modal dismissed
        if (abortHook) abortHook();
    });

    $scope.refreshConnections($scope.projectSummary.projectKey);
    $scope.$watch("conn.source", function(nv) {
        if (!nv) return;
        $elt.find('select[dku-bs-select]').selectpicker('refresh');
    });

    $scope.browse = folderIds =>  {
        return PromiseService.qToHttp($q(resolve => {
            const ids = folderIds.split('/');
            $scope.destination = ids[ids.length - 1];
            DataikuAPI.projectFolders.listContents($scope.destination, true, 1, true).success(data => {
                const folders = data.folder.children.map(f => angular.extend({}, f, { directory: true, fullPath: f.id }))
                const pathElts = treeToList(data.folder, item => item.parent);

                resolve({
                    children: folders,
                    pathElts: pathElts.map(f => angular.extend({}, f, { toString: () => f.id })),
                    exists: true,
                    directory: true,
                });
            }).error(setErrorInScope.bind($scope));
        }));
    };

    $scope.canSelect = item => item.canWriteContents;

    $scope.getProjectFolderName = item => item.name;
});

app.controller('DebuggingToolsController', function($scope, DataikuAPI, $state, $stateParams) {
    $scope.$state = $state;
    $scope.uiState = {};
    $scope.fakeFutureTypes = [];
    $scope.fakeFutureTypes.push({"name":"export from dataset", "payloadClassName":"com.dataiku.dip.export.LocalExportFutureThread", "payloadMethodName":"buildFuturePayload"});
    $scope.fakeFutureTypes.push({"name":"sql query in notebook", "payloadClassName":"com.dataiku.dip.server.services.SQLNotebooksService", "payloadMethodName":"buildFuturePayload"});
    $scope.fakeFutureTypes.push({"name":"sample building", "payloadClassName":"com.dataiku.dip.shaker.SampleBuilder", "payloadMethodName":"buildFuturePayload"});
    $scope.killBackend = function(){
        DataikuAPI.internal.debugKillBackend();
    }
    $scope.getBackendStacks = function(){
        DataikuAPI.internal.debugGetBackendStacks().success(function(data){
            $scope.retdata = data;
        })
    }
    $scope.restartAllHTMLBackends = function(){
        DataikuAPI.internal.restartAllHTMLBackends().success(function(data){
            $scope.retdata = data;
        })
    }
    $scope.runScenarioTriggers = function(){
        DataikuAPI.internal.runScenarioTriggers().success(function(data){
            $scope.retdata = data;
        })
    }
    $scope.insertFakeFuture = function(){
        var f = $scope.uiState.fakeFutureType;
        DataikuAPI.internal.fakeFuture($stateParams.projectKey, f.payloadClassName, f.payloadMethodName, false).success(function(data){
            $scope.retdata = data;
            $scope.uiState.fakeFutureType = null;
        })
    }
    $scope.getTriggerQueueingInfo = function(){
        DataikuAPI.internal.getTriggerQueueingInfo().success(function(data){
            $scope.retdata = data;
        })
    }
    $scope.resyncProjectFolders = () => {
        DataikuAPI.internal.resyncProjectFolders();
    };
    $scope.clearScenarioReportsCaches = function () {
        DataikuAPI.internal.clearScenarioReportsCaches();
    }
});

app.controller("NameFolderCommonController", $scope => {
    $scope.isNameValid = (nameFormInput, isPristineOk) => {
        if (!nameFormInput) {
            return false;
        }
        const name = nameFormInput.$viewValue;
        const isPristine = nameFormInput.$pristine;
        const hasName = name && name.length > 0;
        return (isPristineOk && isPristine) || hasName;
    };
});

app.directive("dkuShow", function($timeout) {
    return {
        scope: false,
        link: function(scope, elem, attrs) {
            let showTimer;
            let delay = parseInt(attrs.delay);
            delay = angular.isNumber(delay) ? delay : 200;

            scope.$watch(attrs.dkuShow, newVal => {
              newVal ? showSpinner() : hideSpinner();
            });

            const showSpinner = () => {
              if (showTimer) {
                  return;
              }
              showTimer = $timeout(showElement.bind(this, true), delay);
            }

            const hideSpinner = () =>  {
              if (showTimer) {
                $timeout.cancel(showTimer);
              }
              showTimer = null;
              showElement(false);
            }

            const showElement = (show) => {
              show ? elem.css({display:''}) : elem.css({display:'none'});
            }
        }
    }
});

}());
