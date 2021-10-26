(function(){
'use strict';

    const app = angular.module('dataiku.dashboards', []);


    app.factory("DashboardUtils", function($rootScope, $injector, Logger) {
        var svc = {
            canEditInsight: function(insight, canModerateDashboards) {
                return insight && (canModerateDashboards || insight.owner == $rootScope.appConfig.login);
            },
            hasEditTab: function(insight) {
                return (insight && insight.type && svc.getInsightHandler(insight.type).hasEditTab);
            },
            setError: function(data, status, headers, config, statusText) {
                var $scope = this[0];
                var reject = this[1];

                $scope.loaded = false;
                $scope.loading = false;
                $scope.error = data;
                $scope.unconfigured = false;
                if ($scope.hook && $scope.hook.isErrorMap) {
                    $scope.hook.isErrorMap[$scope.tile.$tileId] = true;
                }
                if ($scope.hook && $scope.hook.setErrorInDashboardPageScope) {
                	$scope.hook.setErrorInDashboardPageScope(data, status, headers, config, statusText);
                }
                // Mark chart loading process as COMPLETE as it fails initializing
                // This allow the PDF export to know that the chart is ready to be snapshot
                if (typeof($scope.loadedCallback) === 'function') {
                    $scope.loadedCallback();
                }
                if (typeof(reject) === 'function') reject();
            },
            setLoaded: function(data, status, headers, config, statusText) {
                var $scope = this[0];
                var resolve = this[1];

                $scope.loading = false;
                $scope.loaded = true;
                $scope.error = null;
                $scope.unconfigured = false;
                if ($scope.hook && $scope.hook.isErrorMap) {
                    $scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                }
                if (typeof(resolve) === 'function') resolve();
            },
            setUnconfigured: function(data, status, headers, config, statusText) {
                var $scope = this[0];
                var reject = this[1];

                $scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.unconfigured = true;
                if ($scope.hook && $scope.hook.isErrorMap) {
                    $scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                }
                // Mark chart loading process as COMPLETE as it's not configured
                // This allow the PDF export to know that the chart is ready to be snapshot
                if (typeof($scope.loadedCallback) === 'function') {
                    $scope.loadedCallback();
                }
                if (typeof(reject) === 'function') reject();
            },
            tileCanLink: function(tile) {
                if (tile.insightType != 'scenario_run_button') return true;
                else return tile.displayMode != 'INSIGHT';
            },
            getInsightHandler: function(type) {
                if (!type || type=='INSIGHT') {
                    return;
                }
                var camelCaseType = type.replace(/-|_/g, ' ').replace(/\b\w/g, function(l){ return l.toUpperCase() }).replace(/ /g, '');
                try {
                    return $injector.get(camelCaseType + 'InsightHandler');
                } catch (err){
                    Logger.error('Failed to inject insight handler for type: '+type);
                };
            },
            getInsightSourceType: function(insight) {
                var handler = svc.getInsightHandler(insight.type);
                if (!handler) return null;
                return handler.sourceType || handler.getSourceType(insight);
            },
            getInsightSourceId: function(insight) {
                var handler = svc.getInsightHandler(insight.type);
                return handler.getSourceId(insight);
            },
            getInsightTypeGroup: function(type) {
                var insightTypeGroups = {
                    'scenario_last_runs': 'scenario',
                    'scenario_run_button': 'scenario'
                };

                return insightTypeGroups[type] || type;
            },
            getInsightSourceAccessMode: function(insight) {
            	var handler = svc.getInsightHandler(insight.type);
            	return handler.accessMode || 'READ';
            },
            getNeededReaderAuthorization: function(insight) {
				var ref = {
					objectType: svc.getInsightSourceType(insight)
				};

				var resolved = resolveObjectSmartId(svc.getInsightSourceId(insight));
				ref.objectId = resolved.id;
				if (resolved.projectKey) {
					ref.projectKey = resolved.projectKey;
				}
				var mode = svc.getInsightSourceAccessMode(insight);
				return {objectRef: ref, modes: [mode]};
            },
            hasOptions: function(insight) {
                if (insight && insight.type) {
                    let handler = svc.getInsightHandler(insight.type);
                    if ('hasOptions' in handler) {
                        return handler.hasOptions;
                    }
                }
                return true;
            }   
        };

        return svc;
    });

    app.controller("DashboardsCommonController", function($scope, $controller, $rootScope, TopNav, DataikuAPI, ActivityIndicator, CreateModalFromTemplate, $state, Dialogs, WT1) {
        function makeDashboardListed(dashboard, noNotification) {
            return DataikuAPI.dashboards.makeListed(dashboard.projectKey, [dashboard.id], !dashboard.listed)
                .success(function(data) {
                	if (!noNotification) {
                		ActivityIndicator.success("Saved!");
                	}
                    $scope.$broadcast("objectTimelineChanged");
                    dashboard.listed = !dashboard.listed;
                    if ($scope.origDashboard) $scope.origDashboard.listed = dashboard.listed;
                }).error(setErrorInScope.bind($scope));
        }

        $scope.canEditDashboard = function(dashboard) {
        	return dashboard && $scope.canWriteDashboards() && ($scope.canModerateDashboards() || dashboard.owner == $scope.appConfig.login);
        };

        $scope.toggleDashboardListed = function(dashboard) {
            if (!dashboard.listed && dashboard.hasMissingReaderAuthorizations) {
                CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", $scope, null, function(newScope) {
                    newScope.initForDashboards([dashboard], true);
                }).then(function() { makeDashboardListed(dashboard, true).success($scope.list); });
            } else {
                makeDashboardListed(dashboard, true);
            }
        };

        $scope.makeDashboardListed = makeDashboardListed;

        $scope.openInsightAccessModal = function(dashboard) {
            CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", $scope, null, function(newScope) {
                newScope.initForDashboards([dashboard], false);
            }).then($scope.list);
        };


        $scope.copy = function(dashboard, callBackFunc) {
            CreateModalFromTemplate("/templates/dashboards/copy-dashboard-modal.html", $scope, "CopyDashboardModalController", function(newScope) { newScope.init(dashboard); })
                .then(function() {
                    if (typeof callBackFunc === 'function') callBackFunc();
                });
        };


        $scope.exportDashboard = function(dashboard, massExport, fromDashboardViewOrEdit = false, dashboardNotSaved = false) {
            CreateModalFromTemplate("/templates/dashboards/export-dashboard-modal.html", $scope, "ExportDashboardModalController", function(newScope) {
                if (fromDashboardViewOrEdit) {
                    if (dashboard.pages.length != 1) {
                        newScope.showCheckbox = true;
                        newScope.pageIdx = newScope.uiState.currentPageIdx;
                    }
                    newScope.dashboardNotSaved = dashboardNotSaved;
                }
                newScope.init(dashboard, massExport);
            });
        };


        $scope.saveAndCopy = function(dashboard, callBackFund) {
            $scope.saveDashboard().then(function() {
                $scope.copy($scope.dashboard);
            });
        };

        $scope.saveCustomFields = function(newCustomFields) {
            WT1.event('custom-fields-save', {objectType: 'DASHBOARD'});
            let oldCustomFields = angular.copy($scope.dashboard.customFields);
            $scope.dashboard.customFields = newCustomFields;
            return $scope.saveDashboard().then(function() {
                    $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.dashboard.customFields);
                }, function() {
                    $scope.dashboard.customFields = oldCustomFields;
                });
        };

        $scope.editCustomFields = function() {
            if (!$scope.dashboard) {
                return;
            }
            let modalScope = angular.extend($scope, {objectType: 'DASHBOARD', objectName: $scope.dashboard.name, objectCustomFields: $scope.dashboard.customFields});
            CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                $scope.saveCustomFields(customFields);
            });
        };

        $scope.saveDashboard = function(commitMessage) {
            return DataikuAPI.dashboards.save($scope.dashboard, commitMessage)
            .success(function(data) {
                data.pages.forEach(function(page, i) {
                    $scope.dashboard.pages[i].id = page.id;
                });
                $scope.origDashboard = angular.copy($scope.dashboard);
            }).error(setErrorInScope.bind($scope));
        };
    });


    /** List of dashboards */
    app.controller("DashboardsListController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs,$state,$q, TopNav, Fn, $filter, ActivityIndicator, DashboardUtils, StateUtils) {

        $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
        $controller('DashboardsCommonController', {$scope:$scope});

        $scope.DashboardUtils = DashboardUtils;

        $scope.listHeads = DataikuAPI.dashboards.listHeads;

        $scope.sortBy = [
            { value: 'name', label: 'Name' },
            { value: '-lastModifiedOn', label: 'Last modified'},
        ];
        $scope.selection = $.extend({
            filterQuery: {
                userQuery: '',
                tags: [],
                listed : "",
                interest: {
                    starred: '',
                }
            },
            filterParams: {
                userQueryTargets: ["name","tags"],
                propertyRules: {tag: 'tags'},
            },
            inclusiveFilter: {
                owner: []
            },
            customFilterWatch: "selection.inclusiveFilter",
            customFilter: function(objList) {
                return objList.filter(function(obj) {
                    if ($scope.selection.inclusiveFilter.owner.length > 0) {
                        if ($scope.selection.inclusiveFilter.owner.indexOf(obj.owner) > -1) {
                            return true;
                        }
                        return false;
                    } else {
                        return true;
                    }
                });
            },
            orderQuery: "-lastModifiedOn",
            orderReversed: false,
        }, $scope.selection || {});
        $scope.sortCookieKey = 'dashboards';
        $scope.maxItems = 20;

        $scope.setOwnerFilter = function (owner) {
            if (!owner) {
                $scope.selection.inclusiveFilter.owner = [];
                return;
            }

            let arr = $scope.selection.inclusiveFilter.owner;
            const index = arr.indexOf(owner);

            if (index > -1) {
                arr.splice(index, 1);
            } else {
                arr.push(owner);
            }
        }

        $scope.setListedFilterQuery = function(value) {
            $scope.selection.filterQuery.listed = value ? 'true' : '';
        }

        if ($state.current.name.indexOf('dashboards') != -1) {
            TopNav.setLocation(TopNav.TOP_DASHBOARD, 'dashboards', TopNav.TABS_NONE, null);
            TopNav.setNoItem();
        }

        $scope.list();

        $scope.$watch("selection.selectedObject",function(nv) {
            if (!nv) return;

            DataikuAPI.dashboards.getSummary($stateParams.projectKey, nv.id).success(function(data) {
                $scope.dashboard = data.object;
            }).error(setErrorInScope.bind($scope));
        });

        /* Specific actions */
        $scope.goToItem = function(data) {
            $state.go("projects.project.analyses.analysis.script", {projectKey : $stateParams.projectKey, analysisId : data.id});
        };

        $scope.newDashboard = function(language) {
            CreateModalFromTemplate("/templates/dashboards/new-dashboard-modal.html", $scope)
                .then(function(dashboard) {
                    StateUtils.go.dashboard(dashboard.id, dashboard.projectKey, {name: dashboard.name, tab: 'edit'});
                });
        };

        $scope.isAllListed = function(items) {
            if (!items) return true;
            return items.map(Fn.prop('listed')).reduce(function(a,b){return a&&b},true);
        };

        $scope.canMassMakeListed = true;
        $scope.massMakeListed = function(items, listed) {
        	var apiCall = function() {
        		DataikuAPI.dashboards.makeListed(items[0].projectKey, ids, listed)
                .success(function(data) {
                    ActivityIndicator.success("Saved!");
                    $scope.list();
                }).error(setErrorInScope.bind($scope));
        	}

        	if (!(items && items.length > 0)) {
        		return;
        	}
        	var ids = [];
        	var hasMissingReaderAuthorizationsItems = [];
        	items.forEach(function(item) {
        		if (item.listed != listed) {
        			ids.push(item.id);
        		}
        		if (item.hasMissingReaderAuthorizations) {
        			hasMissingReaderAuthorizationsItems.push(item);
        		}
        	});

        	if (listed && hasMissingReaderAuthorizationsItems.length > 0) {
        		CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", $scope, null, function(newScope) {
                    newScope.initForDashboards(hasMissingReaderAuthorizationsItems, true);
                }).then(apiCall);
            } else {
                apiCall();
            }
        };

        // Used in the list
        $scope.canMassExportDashboard = true;

        $scope.owners = [];
        $scope.list = function() {
            $scope.listHeads($stateParams.projectKey, $scope.tagFilter).success(function(data) {
                $scope.filteredOut = data.filteredOut;
                $scope.listItems = data.items;
                $scope.restoreOriginalSelection();

                var ownersMap = {};
                data.items.forEach(function(dashboard) {
                    ownersMap[dashboard.owner] = {
                            login : dashboard.owner,
                            displayName : dashboard.ownerDisplayName
                    }
                });
                $scope.owners.length = 0;
                for (var login in ownersMap) {
                    $scope.owners.push(ownersMap[login]);
                }
                $scope.owners.sort(function(a, b){
                    if(a.displayName < b.displayName) return -1;
                    if(a.displayName > b.displayName) return 1;
                    return 0;
                });

            }).error(setErrorInScope.bind($scope));
        };
        $scope.list();

        $scope.getNbListedDashboards = function(dashboards) {
            if (dashboards && dashboards.length > 0) {
                return dashboards.filter(function(dashboard) {
                    return dashboard.listed;
                }).length
            }
            return 0;
        }
    });


    app.controller("ProjectHomeDashboardListController", function($scope, $stateParams, DataikuAPI) {
        $scope.listHeads = DataikuAPI.dashboards.listSummaries($stateParams.projectKey).success(function(data) {
            $scope.dashboards = data.map(function(summary) {
                var dashboard = summary.object;
                dashboard.interest = summary.interest;
                dashboard.numTiles = 0;
                dashboard.pages.forEach(function(page) {
                    dashboard.numTiles += page.grid.tiles.length;
                });
                dashboard.numPages = dashboard.pages.length;
                return dashboard;
            });
        }).error(setErrorInScope.bind($scope));
    });

    app.controller("DashboardCoreController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav, $filter, $state, ActivityIndicator, $controller, CreateModalFromTemplate) {
        $controller('DashboardsCommonController', {$scope:$scope});
        $scope.uiState = {};

        DataikuAPI.dashboards.getSummary($stateParams.projectKey, $stateParams.dashboardId).success(function(data) {
            $scope.ownerDisplayName = data.ownerDisplayName;
            $scope.dashboard = data.object;
            $scope.interest = data.interest;
            $scope.timeline = data.timeline;
            $scope.canEdit = $scope.canEditDashboard($scope.dashboard);
            if ($scope.canEdit) {
                $scope.origDashboard = angular.copy(data.object);
            }

            TopNav.setItem(TopNav.ITEM_DASHBOARD, $stateParams.dashboardId, $scope.dashboard);

            $scope.$watch("dashboard.name", function(nv) {
                if (!nv) return;
                TopNav.setPageTitle(nv + " - Dashboard");
                $state.go($state.current, {dashboardName: $filter('slugify')(nv), separator: '_'}, {location: 'replace', inherit:true, notify:false, reload:false});
            });
        }).error(setErrorInScope.bind($scope));

        $scope.isDirty = function() {
            return !angular.equals($scope.dashboard, $scope.origDashboard);
        };

        $scope.revertChanges = function() {
            $scope.dashboard = angular.copy($scope.origDashboard);
        };

        $scope.toggleDashboardListed = function() {
            if (!$scope.dashboard.listed) {
                DataikuAPI.dashboards.getMissingReaderAuthorizations($scope.dashboard.projectKey, [$scope.dashboard.id]).success(function(data) {
                    if (data.length) {
                        CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", $scope, null, function(newScope) {
                            newScope.initForDashboardsWithAuths([$scope.dashboard], true, data);
                        }).then(function() { $scope.makeDashboardListed($scope.dashboard); });
                    } else {
                        $scope.makeDashboardListed($scope.dashboard);
                    }
                });
            } else {
                $scope.makeDashboardListed($scope.dashboard);
            }

        };

        $scope.$on("dashboardSelectLastTile", function() {
            $scope.initialSelectedTile = 'LAST';
        });

        $scope.resetInitialSelectedTile = function() {
            delete $scope.initialSelectedTile;
        }
    });


    app.controller("DashboardSummaryController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav, $timeout, Logger, ActivityIndicator) {
        TopNav.setLocation(TopNav.TOP_DASHBOARD, 'dashboards', null, 'summary');
        if ($scope.dashboard) {
            TopNav.setPageTitle($scope.dashboard.name + " - Dashboard");
        }

        function refreshTimeline() {
            DataikuAPI.timelines.getForObject($stateParams.projectKey, "DASHBOARD", $stateParams.dashboardId)
            .success(function(data){
                $scope.timeline = data;
            })
            .error(setErrorInScope.bind($scope));
        }

        $scope.$on("objectSummaryEdited", function(){
            DataikuAPI.dashboards.save($scope.dashboard).error(setErrorInScope.bind($scope.$parent)).success(function() {
                ActivityIndicator.success("Saved!");
                refreshTimeline();
            });
        });

        $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
            $scope.saveCustomFields(customFields);
        });

        $scope.$on("objectTimelineChanged", refreshTimeline);
    });

    app.controller("DashboardDetailsController", function($scope, $stateParams, $state, FutureProgressModal, DatasetUtils, StateUtils, Dialogs, ActiveProjectKey) {
        $scope.isOnDashboardObjectPage = function() {
            return $state.includes('projects.project.dashboards.dashboard');
        }
    });

    app.directive('dashboardRightColumnSummary', function(DataikuAPI, $stateParams, $controller, QuickView, ActivityIndicator){
        return {
            templateUrl :'/templates/dashboards/right-column-summary.html',
            link : function($scope, element, attrs) {

                $controller('_TaggableObjectsMassActions', {$scope: $scope});

                $scope.QuickView = QuickView;

                /* Auto save when summary is modified */
                $scope.$on("objectSummaryEdited", function(){
                    DataikuAPI.dashboards.save($scope.dashboard).success(function(data) {
                        ActivityIndicator.success("Saved");
                    }).error(setErrorInScope.bind($scope));
                });

                $scope.refreshData = function() {
                    DataikuAPI.dashboards.getFullInfo($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.id).success(function(data) {
                        if (!$scope.selection.selectedObject
                                || $scope.selection.selectedObject.id != data.dashboard.id
                                || $scope.selection.selectedObject.projectKey != data.dashboard.projectKey) {
                            return; //too late!
                        }
						$scope.dashboardFullInfo = data;
                        $scope.dashboard = data.dashboard;
                    }).error(setErrorInScope.bind($scope));
                };

                $scope.$on('customFieldsSaved', $scope.refreshData);

                $scope.refreshTimeline = function(){
                    DataikuAPI.timelines.getForObject($stateParams.projectKey || $scope.selection.selectedObject.projectKey, "DASHBOARD", $scope.selection.selectedObject.id)
                    .success(function(data){
                        $scope.timeline = data;
                    })
                    .error(setErrorInScope.bind($scope));
                };

                $scope.$watch("selection.selectedObject",function(nv) {
                    if (!$scope.selection) $scope.selection = {}; 
                    $scope.dashboardFullInfo = {dashboard: $scope.selection.selectedObject, timeline: {}}; // display temporary (incomplete) data
                });

                $scope.$watch("selection.confirmedItem", function(nv, ov) {
                    if (!nv) return;
                    $scope.refreshTimeline();
                    $scope.refreshData();
                });
            }
        }
    });

    app.controller("DashboardPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, DataikuAPI, ActiveProjectKey) {

        $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});
    
        const dashboard = (await DataikuAPI.dashboards.get($stateParams.projectKey, $stateParams.dashboardId)).data;
        dashboard.nodeType = "DASHBOARD";
        dashboard.interest = {};
    
        $scope.selection = {
            selectedObject : dashboard,
            confirmedItem : dashboard
        };
    
        function updateListed() {
            DataikuAPI.dashboards.get($stateParams.projectKey, $stateParams.dashboardId).success(function(data) {
    
                $scope.selection.selectedObject.listed = data.listed;
    
            }).error(setErrorInScope.bind($scope));
        }

        function updateUserInterests() {
            DataikuAPI.interests.getForObject($rootScope.appConfig.login, "DASHBOARD", ActiveProjectKey.get(), $stateParams.dashboardId).success(function(data) {
    
                $scope.selection.selectedObject.interest.watching = data.watching;
                $scope.selection.selectedObject.interest.starred = data.starred;
    
            }).error(setErrorInScope.bind($scope));
        }
    
        updateUserInterests();
        const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);
        const listedListener = $scope.$on('objectTimelineChanged', updateListed);
        $scope.$on("$destroy", interestsListener);
        $scope.$on("$destroy", listedListener);
    });

})();

(function() {
'use strict';

const app = angular.module('dataiku.dashboards');

    app.constant("InsightLoadingState", {
        // Insight has registered itself and is waiting for the dashboard/insight-preview component to load it.
        WAITING: 0,

        // Dashboard/insight-preview component has called the promise in loadPromises map and is waiting for the promise to be resolved.
        LOADING: 1,

        // Loading promise has been resolved
        LOADED: 2,

        // Loading promise has been resolved and any additional asynchronous work has also completed.
        COMPLETE: 3
        }
    );

    app.constant("InsightLoadingBehavior", {
            // Once the promise registered in loadPromises has be resolved, the insight is fully loaded.
            NORMAL: undefined,

            // Additional work is needed to fully load the insight once the promise registered in loadPromises has be resolved.
            // The insight will itself change the loading state to COMPLETE asynchronously in `loadStates` map.
            DELAYED_COMPLETE: "DELAYED_COMPLETE",
        }
    );

    app.controller("DashboardViewController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs,$state,$q, TopNav) {
        if (typeof($scope.uiState)==='undefined'){
            $scope.uiState = {};
        }
        $scope.uiState.hideForExport = false;TopNav.setLocation(TopNav.TOP_DASHBOARD, 'dashboards', null, 'view');
        if ($scope.dashboard) {
            TopNav.setPageTitle($scope.dashboard.name + " - Dashboard");
        }
        $scope.$watch("fullScreen", function(nv) {
            let wrapper = $('body')[0];
            if (nv == null) return;

            if (nv) {
                requestFullscreen();
            } else {
                exitFullscreen();
            }
            $state.go($state.current, {fullScreen: (nv && nv != "false") ? true : null}, {location: true, inherit:true, notify:false, reload:false});

            $scope.$on("$destroy", () => {
                exitFullscreen();
            });

            function requestFullscreen() {
                let startFsNames = ['requestFullscreen', 'mozRequestFullScreen', 'webkitRequestFullScreen'];
                executeFirstAvailableFunction(startFsNames, wrapper);
            }

            function exitFullscreen() {
                if (document.fullscreenElement || 
                    document.webkitFullscreenElement || 
                    document.mozFullScreenElement) { // Can't exit fullscreen if there is no element in fullscreen
                        let stopFsNames = ['exitFullscreen', 'cancelFullScreen', 'webkitCancelFullScreen', 'mozCancelFullScreen'];
                        executeFirstAvailableFunction(stopFsNames, document);
                }
            }

            function executeFirstAvailableFunction(functionNames, elmt) {
                for (let i = 0; i < functionNames.length; i++) {
                    if (elmt[functionNames[i]]) {
                        elmt[functionNames[i]]();
                        break;
                    }
                }
            }
        });

        $scope.fullScreen = $stateParams.fullScreen && $stateParams.fullScreen != "false";
    });

app.directive('dashboardZone', function(DataikuAPI, $stateParams, $state) {
    return {
        restrict: 'EA',
        templateUrl: '/templates/dashboards/zone.html',
        replace: true,
        link: function($scope, elements, attrs) {
            $scope.editable = $scope.$eval(attrs.editable);

            $scope.insightsMap = {};
            $scope.insightAccessMap = {};

            if ($scope.dashboard && $scope.dashboard.pages) {
                $scope.dashboard.pages.forEach(function(page) {
                    delete page.$enriched;
                });
            }

            $scope.loadPage = function(pageIdx, forceRefresh, onlyAccessMap) {
                if (!($scope.dashboard.pages[pageIdx] || {}).id) return; // Page has not been saved yet
                if (!$scope.dashboard.pages[pageIdx].$enriched || forceRefresh) {
                    DataikuAPI.dashboards.getEnrichedPage($scope.dashboard.projectKey, $scope.dashboard.id, pageIdx)
                        .success(function(data) {
                            $scope.currentPageIdx = pageIdx;
                            if (!onlyAccessMap) angular.extend($scope.insightsMap, data.insightsData);
                            angular.extend($scope.insightAccessMap, data.insightAccessData);
                            $scope.dashboard.pages[pageIdx].$enriched = true;
                        })
                        .error(setErrorInScope.bind($scope));
                } else {
                    $scope.currentPageIdx = pageIdx;
                }
            };

            $scope.$on("dashboardReaderAccessChanged", function() {
                $scope.loadPage($scope.uiState.currentPageIdx, true, true);
            });

            $scope.$watch("dashboard", function(nv) {
                if (!nv) return;
                if (!$scope.dashboard.pages.length) {
                    $scope.dashboard.pages.push({});
                }

                if ($scope.uiState.currentPageIdx == null) {
                    if ($stateParams.pageId) {
                        $scope.uiState.currentPageIdx = Math.max(getPageIdxById($stateParams.pageId), 0);
                    } else {
                        $scope.uiState.currentPageIdx = 0;
                    }
                } else {
                    updateUrl();
                }

                if ($scope.initialSelectedTile != null) {
                    if ($scope.initialSelectedTile == 'LAST') {
                        $scope.uiState.selectedTile = $scope.dashboard.pages[$scope.uiState.currentPageIdx].grid.tiles[$scope.dashboard.pages[$scope.uiState.currentPageIdx].grid.tiles.length-1];
                    } else {
                        $scope.uiState.selectedTile = $scope.dashboard.pages[$scope.uiState.currentPageIdx].grid.tiles[$scope.initialSelectedTile];
                    }
                    $scope.initialSelectedTile = null;
                }
            });

            $scope.$watch("uiState.currentPageIdx", function(nv) {
                if (nv != null) {
                    $scope.loadPage($scope.uiState.currentPageIdx);
                    updateUrl();
                }
            });

            // On dashboard save
            $scope.$watch("origDashboard", updateUrl);

            function getPageIdxById(pageId) {
                for (var i = 0; i < $scope.dashboard.pages.length; i++) {
                    if ($scope.dashboard.pages[i].id == pageId) {
                        return i;
                    }
                }

                return -1;
            }

            function updateUrl() {
                if ($scope.uiState.currentPageIdx == null) return;
                $state.go($state.current, {pageId: ($scope.dashboard.pages[$scope.uiState.currentPageIdx] || {}).id || $scope.uiState.currentPageIdx}, {
                    location: 'replace',
                    inherit: true,
                    notify: false,
                    reload: false
                });
            }
        }
    }
});

app.directive('dashboardPage', function($timeout, $q, CreateModalFromTemplate, StateUtils, $rootScope, $stateParams, DashboardUtils, ContextualMenu, executeWithInstantDigest, Logger, InsightLoadingState, InsightLoadingBehavior) {
    return {
        restrict: 'EA',
        replace: true,
        templateUrl: '/templates/dashboards/page.html',
        scope: {
            page: '=',
            insightsMap: '=',
            accessMap: '=',
            editable: '=',
            selectedTile: '=',
            showGrid: '=',
            pageIdx: '=',
            dashboard: '=',
            uiState: '=dkuUiState',
            canEditDashboard: '=',
            canModerateDashboards: '='
        },
        link: function(scope, element, attrs) {
            scope.DashboardUtils = DashboardUtils;

                var cancelDeselect;
                if (scope.page && scope.page.grid && scope.page.grid.tiles) {
                	scope.page.grid.tiles.forEach(function(tile) {
                		tile.$added = false;
                	})
                }

                if(scope.page && !scope.page.$lastTileId) scope.page.$lastTileId = 1;
                if (scope.page.grid.tiles.indexOf(scope.selectedTile) == -1) {
                   scope.selectedTile = null;
                }

                /*
                 * Dashboard Export Toolbox
                 */

                scope.dashboardExportToolbox = {
                        checkLoading: function() {
                            return scope.isLoading;
                        },

                        getPageCount: function() {
                            return scope.dashboard.pages.length;
                        },

                        getVerticalBoxesCount: function(pageIndex) {
                            let total = 0;
                            for (let tile of scope.dashboard.pages[pageIndex].grid.tiles) {
                                if (tile.box.top + tile.box.height > total) {
                                    total = tile.box.top + tile.box.height;
                                }
                            }
                            return total;
                        },

                        getTilesCount: function(pageIndex) {
                            let pages = scope.dashboard.pages;
                            return (pageIndex && pageIndex < pages.length) ? pages[pageIndex].grid.tiles.length : 0;
                        },

                        scroll: function(scrolledHeight) {
                            return document.querySelector(".dashboard-export-page-wrapper").scrollTop = scrolledHeight;
                        },

                        getTitleBoundaries: function() {
                            return document.querySelector(".dashboard-export-title").getBoundingClientRect();
                        },

                        getGridBoundaries: function() {
                            return document.querySelector(".dashboard-export-grid").getBoundingClientRect();
                        },

                        clearDashboard: function() {
                            executeWithInstantDigest(_ => scope.uiState.hideForExport = true, scope);
                        },

                        goToFirstPage: function() {
                            executeWithInstantDigest(_ => {
                                if (scope.uiState.currentPageIdx > 0) {
                                    scope.uiState.currentPageIdx = 0;
                                }
                            }, scope);
                        },

                        goToNextPage: function() {
                            scope.isLoading = true;
                            executeWithInstantDigest(_ => {
                                if (scope.uiState.currentPageIdx < scope.dashboard.pages.length - 1) {
                                    scope.uiState.currentPageIdx = scope.uiState.currentPageIdx + 1;
                                }
                            }, scope);
                        },

                        goToPage: function(pageIdx) {
                            scope.isLoading = true;
                            executeWithInstantDigest(_ => {
                                if (scope.uiState.currentPageIdx != pageIdx) {
                                    scope.uiState.currentPageIdx = pageIdx;
                                }
                            }, scope);
                        }
                };

                /*
             * GridList
             */

            scope.addElements = function() {
                scope.$emit("dashboardOpenAddInsightModal");
            };

            scope.getOrSetTileId = function(tile) {
                if (!scope.page.$lastTileId) {
                    scope.page.$lastTileId = 1;
                }
                if (!tile.$tileId) {
                    tile.$tileId = ++scope.page.$lastTileId;
                }
                return tile.$tileId;
            };

            scope.deleteTile = function(tile) {
                var el = $('[data-id=' + tile.$tileId + ']');
                scope.$gridContainer.gridList('deleteItem', $(el));
                scope.syncModels();
                scope.selectedTile = null;
            };

                scope.openMoveCopyTileModal = function(tile) {
                	CreateModalFromTemplate("/templates/dashboards/insights/move-copy-tile-modal.html", scope, "MoveCopyTileModalController", function(newScope) {
                		newScope.dashboard = scope.dashboard;
                		newScope.page = scope.page;
                		newScope.tile = tile;
                		newScope.uiState = scope.uiState;
                		newScope.insight = tile.tileType == "INSIGHT" ? scope.insightsMap[tile.insightId] : null;
                		newScope.insightName = tile.tileType == "INSIGHT" ? newScope.insight.name : tile.title;
                		newScope.insightsMap = scope.insightsMap;

                        newScope.init(newScope.insight, tile.tileParams);
                	});
                };

                scope.syncModels = function() {
                    $timeout(function() {
                    	if (scope.$gridContainer.data('_gridList')) {
                    		var items = scope.$gridContainer.data('_gridList').items;
    	                	var tilesToRemove = [];
    	                    scope.page.grid.tiles.forEach(function(tile) {
    	                        var toRemove = true;
    	                        items.forEach(function(item) {
    	                            if (item.id == tile.$tileId) {
    	                                toRemove = false;
    	                                tile.box.left = item.x;
    	                                tile.box.top = item.y;
    	                                tile.box.width = item.w;
    	                                tile.box.height = item.h;
    	                            }
    	                        });
    	                        if (toRemove) {
    	                            tilesToRemove.push(tile);
    	                        }
    	                    });
    	                    tilesToRemove.forEach(function(tile) {
    	                        var index = scope.page.grid.tiles.indexOf(tile);
    	                        if (index > -1) {
    	                        	scope.page.grid.tiles.splice(index, 1);
    	                        }
    	                    });
                            scope.$emit("dashboardSyncModelsDone");
                    	}
                    }, 0);
                };

                scope.addTileToGridList = function(tile) {
                	$timeout(function() {
                		var el = element.find('[data-id = ' + tile.$tileId + ']');

                    	if (!scope.gridListRenderPromise) {
                    		scope.renderGridList();
                    	}

                    	scope.gridListRenderPromise.then(function() {
                    		if (!isTileInGridList(tile)) {
                    			scope.$gridContainer.gridList('addItem', $(el));
                                tile.$added = true;
                    		}
                            $timeout(scope.syncModels);
                    	}, 0);
                	})
                };

                var isTileInGridList = function(tile) {
                	var items = scope.$gridContainer.data('_gridList').items;
                	for (var i = 0; i < items.length; i++) {
                		if (items.id == tile.$tileId) {
                			return true;
                		}
                	}
                	return false;
                };

                var getTileByElement = function(el) {
                	var tileId = $(el).data("id");
                	for (var i = 0; i< scope.page.grid.tiles.length; i++) {
                		var tile = scope.page.grid.tiles[i];
                		if (tileId == tile.$tileId) {
                			return tile;
                		}
                	}
                }

                scope.gridListRendered = false;
                if (!scope.page || !scope.page.grid || !scope.page.grid.tiles || scope.page.grid.tiles.length == 0) {
                	scope.gridListRendered = true;
                }
                $rootScope.spinnerPosition = "dashboard-page";

            scope.renderGridList = function() {
                scope.gridListRenderPromise = $timeout(function() {
                    scope.$gridContainer = $(element.find('.dashboard-grid').addBack('.dashboard-grid')); //addBack to add self

                    /*
                     * Instantiating gridList
                     */

                    var currentSize = 12;

                    var flashItems = function(items) {
                        // Hack to flash changed items visually
                        for (var i = 0; i < items.length; i++) {
                            (function($element) {
                                $element.addClass('changed')
                                setTimeout(function() {
                                    $element.removeClass('changed');
                                }, 0);
                            })(items[i].$element);
                        }
                    };



                        scope.$on('$destroy', function() {
                            $(window).off('resize.dashboard' );
                        });

                        scope.$gridContainer.gridList(
                    		{
                                lanes: currentSize,
                                onChange: function(changedItems) {
                                    flashItems(changedItems);
                                },
                                direction: "vertical",
                                readOnly: !scope.editable
                            },
                            {
                                start: function(event, ui) {
                                    $(event.target).addClass("dragging");
                                    $timeout(function() {
                                    	var tile = getTileByElement(event.target);
                                        scope.selectTile(tile);
                                        tile.$showOverlay = false;
                                    });
                                },
                                stop: function(event, ui) {
                                    $(event.target).removeClass("dragging");
                                    scope.syncModels();
                                },
                                scroll: true,
                                containment: 'parent'
                            },
                            {
                            	resize: function(event, ui) {
                                	event.stopPropagation();
                                },
                                stop: function(event, ui) {
                                	$timeout(function() {
                                	    angular.element(event.target).scope().$broadcast("resize");
                                        scope.syncModels();
                                        cancelDeselect = false;
                                    }, 200);
                                	cancelDeselect = true;

                            	}
                            }
                        );

                        scope.gridListRendered = true;
                        $rootScope.spinnerPosition = undefined;
                        $rootScope.$broadcast("gridListRendered");

                    });
                };

                scope.isErrorMap = {};
                scope.hook = {
                	loadPromises : {},
                    loadStates: {},
                	isErrorMap : scope.isErrorMap,
                	setErrorInDashboardPageScope : function(data, status, headers, config, statusText) {
                		setErrorInScope.bind(scope)(data, status, headers, config, statusText);
                	},
                    editable: scope.editable
                };

                const nbSimultaneousLoading = $rootScope.appConfig.nbSimultaneousInsightLoading;

                let deferredLoadTileInProgress = false;
                scope.loadTiles = function() {
                    const loadingState = function(tileId) {
                        return (tileId in scope.hook.loadStates) ? scope.hook.loadStates[tileId] : InsightLoadingState.WAITING;
                    };
                    const areAllTilesComplete = function() {
                        return !Object.keys(scope.hook.loadPromises).some(function(tileId) {
                            return loadingState(tileId) !== InsightLoadingState.COMPLETE;
                        });
                    };
                    const getTileLoadingCallback = function(tileId, markComplete = true) {
                		return function() {
                		    // For simple tiles, mark them as fully loaded (i.e. complete). For tiles with delayed
                            // complete events, just mark them as loaded. This way we are still waiting for them but
                            // in the meantime we can load more tiles.
                            if (scope.hook.loadStates[tileId] !== InsightLoadingState.COMPLETE) {
                                scope.hook.loadStates[tileId] = markComplete ? InsightLoadingState.COMPLETE : InsightLoadingState.LOADED;
                            }

                            if (areAllTilesComplete()) {
                                // Finished loading all insights
                                scope.isLoading = false;
                                Logger.info("All dashboard insights have been fully loaded.");
                            } else if (!deferredLoadTileInProgress) {
                                // Finished loading some insights but there are pending ones. Trying to load more.
                                scope.loadTiles();
                            }
                		}
                	};

                	let tilesInsightTypes = {};
                	scope.page.grid.tiles.forEach(function(tile) {
                		tilesInsightTypes[tile.$tileId] = tile.insightType;
                	});

                    // Compute how many tiles we can load given the number of already loading tiles
                    let nbLoading = Object.keys(scope.hook.loadPromises).map(loadingState).filter(function(state){
                        return state === InsightLoadingState.LOADING;
                    }).length;
                    let remainingLoadingSlots = nbSimultaneousLoading - nbLoading;

                    // Build the list of tiles that we should load now.
                    let tilesToLoad = [];
                    Object.keys(scope.hook.loadPromises).filter(function(tileId) {
                        return loadingState(tileId) === InsightLoadingState.WAITING;
                    }).forEach(function(tileId){
                        if (tilesInsightTypes[tileId] in ["chart", "dataset_table"]) { // Load heavy tiles first to load them first.
                            tilesToLoad.push(tileId);
                        } else {
                            tilesToLoad.unshift(tileId);
                        }
                    });
                    // If there are too many loading requests. Only keeping the first ones
                    if (tilesToLoad.length > remainingLoadingSlots) {
                        tilesToLoad.length = remainingLoadingSlots;
                    }

                    if (tilesToLoad.length > 0) {
                        scope.isLoading = true;
                        for (let i in tilesToLoad) {
                            const tileId = tilesToLoad[i];
                            const d = $q.defer();
                            scope.hook.loadStates[tileId] = InsightLoadingState.LOADING;
                            const markComplete = scope.hook.loadPromises[tileId](d.resolve, d.reject) !== InsightLoadingBehavior.DELAYED_COMPLETE;
                            const tileLoadingCallback = getTileLoadingCallback(tileId, markComplete);
                            d.promise.then(tileLoadingCallback, tileLoadingCallback); // Don't try to reload a tile if an error appear the first time for now.
                        }
                    } else {
                        scope.isLoading = !areAllTilesComplete();
                        if (!scope.isLoading) {
                            Logger.info("All dashboard insights have been fully loaded.");
                        } else if (!deferredLoadTileInProgress) {
                            // If there are pending loading insights, call us back later
                            deferredLoadTileInProgress = true;
                            $timeout(function () {
                                deferredLoadTileInProgress = false;
                                scope.loadTiles();
                            }, 1000);
                        }
                    }
                };

                scope.$watch('hook.loadStates', function(nv, ov) {
                	// Waiting for newcomers
                	$timeout(function() {
                        if (!scope.isLoading) {
                            scope.loadTiles();
                        }
                	});
                }, true);

            scope.selectTile = function(tile, evt) {
                if (evt && evt.target.hasAttribute('dashboard-no-select')) return;
                if (scope.selectedTile == tile) {
                    var $tileWrapper = evt ? $(evt.target).closest('.tile-wrapper') : null;
                    if (!evt || (!$tileWrapper.hasClass('ui-draggable-dragging') && !$tileWrapper.hasClass('ui-resizable-resizing'))) {
                        tile.$showOverlay = true;
                    }
                }
                scope.selectedTile = tile;
            };

            scope.toggleTileSelection = function(tile, evt) {
                if (evt && evt.target.hasAttribute('dashboard-no-select')) return;
                if (scope.selectedTile === tile) scope.deselectTile(evt);
                else scope.selectedTile = tile;
            };

            scope.dashboardClicked = function(evt) {
                if (evt && $(evt.target).closest('.tile-wrapper').size() > 0) return;
                scope.deselectTile(evt);
            };

            scope.deselectTile = function(evt) {
                $timeout(function() {
                    if (cancelDeselect) {
                        cancelDeselect = false;
                        return;
                    }
                    scope.selectedTile = null;
                });
            };

            Mousetrap.bind("backspace", function() {
                if (scope.selectedTile) {
                    scope.deleteTile(scope.selectedTile);
                }
            });

            scope.$on("$destroy", function() {
                Mousetrap.unbind("backspace");
            });

            scope.openInsightAccessModal = function(insight) {
                CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", scope, null, function(newScope) {
                    newScope.initForInsights([insight], false);
                }).then(function(readerAccessChanged) {
                    if (readerAccessChanged) {
                        scope.$emit("dashboardReaderAccessChanged");
                    }
                });
            };

            scope.getTargetHref = function(tile, evt) {
                const insight = scope.insightsMap[tile.insightId];
                if (!insight) {
                    return;
                }
                const options = {};
                const canModerateDashboards = $rootScope.projectSummary && $rootScope.projectSummary.canModerateDashboards;
                if (scope.editable &&
                        DashboardUtils.canEditInsight(insight, canModerateDashboards) &&
                        DashboardUtils.hasEditTab(insight)) {
                    options.tab = 'edit';
                }
                switch (tile.clickAction) {
                case 'DO_NOTHING':
                case 'OPEN_INSIGHT':
                    options.name = insight.name;
                    return StateUtils.href.insight(tile.insightId, $stateParams.projectKey, options);
                case 'OPEN_OTHER_INSIGHT':
                    if (tile.targetInsightId) {
                        const targetInsight = scope.insightsMap[tile.targetInsightId] || {};
                        options.name = targetInsight.name;
                        return StateUtils.href.insight(tile.targetInsightId, $stateParams.projectKey, options);
                    }
                }
            };

            scope.tileMenu = new ContextualMenu({
                template: "/templates/dashboards/tile-contextual-menu.html"
            });

            scope.openTileMenu = function($event, tile) {
                let newScope = scope.$new();
                newScope.tile = angular.copy(tile);
                scope.tileMenu.scope = newScope;
                scope.tileMenu.openAtXY($event.pageX, $event.pageY);
            };
        }
    }
});

    app.directive('gridDisplay', function($timeout) {
        return {
            restrict: 'EA',
            replace: false,
            scope: {
                backgroundColor: '=',
                gridFormat: '=?'
            },
            template: '<div class="fh grid-display" ng-style="displayBackground()"></div>',
            link: function(scope, element, attrs) {
                let shadeColor = function(color, percent) {

                    let R = parseInt(color.substring(1,3),16);
                    let G = parseInt(color.substring(3,5),16);
                    let B = parseInt(color.substring(5,7),16);

                    R = parseInt(R * (100 + percent) / 100);
                    G = parseInt(G * (100 + percent) / 100);
                    B = parseInt(B * (100 + percent) / 100);

                    R = (R<255)?R:255;
                    G = (G<255)?G:255;
                    B = (B<255)?B:255;

                    let RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
                    let GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
                    let BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));

                    return "#"+RR+GG+BB;
                }

                let cellWidth = null;
                let gridColor;
                scope.$watch('backgroundColor', function() {
                    gridColor = scope.backgroundColor ? shadeColor(scope.backgroundColor, +20) : "#F4F4F4";
                });

                scope.displayBackground = function() {
                    if (cellWidth != null) {
                        if (scope.gridFormat == null) {
                            return {
                                'background': 'repeating-linear-gradient(180deg, ' + gridColor + ', '+ gridColor + ' 5px, transparent 6px, transparent ' + (cellWidth - 1) + 'px, ' + gridColor + ' ' + cellWidth + 'px),' +
                                'repeating-linear-gradient(90deg, ' + gridColor + ', '+ gridColor + ' 5px, transparent 6px, transparent ' + (cellWidth - 1) + 'px, ' + gridColor + ' ' + cellWidth + 'px)',
                                'width': (12*cellWidth + 5)+ 'px'
                            }
                        } else {
                            return {
                                'background': 'repeating-linear-gradient(180deg, ' + gridColor + ', '+ gridColor + ' 5px, transparent 5px, transparent ' + scope.gridFormat.numberBoxY*cellWidth + 'px),' +
                                'repeating-linear-gradient(90deg, ' + gridColor + ', '+ gridColor + ' 5px, transparent 5px, transparent ' + scope.gridFormat.numberBoxX*cellWidth + 'px)',
                                'width': (12*cellWidth + 5)+ 'px'
                            }
                        }
                    }
                }

                let dashboardGrid = angular.element(document).find('.dashboard-grid');
                scope.$on("gridListRendered", function() {
                    cellWidth = $(dashboardGrid).data('_gridList')._cellWidth
                });

                let resizeTimer;
                let resizeCallback = function() {
                    let customEvent = new Event('resize');
                    customEvent.data = {propagate: true};
                    window.dispatchEvent(customEvent);
                    dashboardGrid.gridList('reflow');
                    resizeTimer = null;
                };

                // We need to delay the window.resize event by 250ms so that the css animation on tiles width/height is done and the tile contents are drawn with the right dimensions
                $(window).on('resize.dashboard', function(event) {
                    if (!event.originalEvent || !event.originalEvent.data || !event.originalEvent.data.propagate) {
                        dashboardGrid.gridList('reflow');
                        cellWidth = $(dashboardGrid).data('_gridList')._cellWidth;
                        event.stopPropagation();
                        event.stopImmediatePropagation();

                        if (resizeTimer) {
                            $timeout.cancel(resizeTimer);
                        }
                        resizeTimer = $timeout(resizeCallback, 250);
                    }
                });
            }
        }
    });app.directive('dashboardTile', function($stateParams, TileUtils){
        return {
            restrict: 'EA',
            templateUrl: '/templates/dashboards/tile.html',
            scope: {
                tile: '=',
                insight: '=',
                editable: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $scope.$stateParams = $stateParams;

            $scope.openUploadPictureDialog = TileUtils.openUploadPictureDialog;

            $scope.getResizeImageClass = function(resizeImageMode) { //convert mode to css class name
                switch (resizeImageMode)
                {
                    case 'STRETCH_SIZE': return 'stretch-size';
                    case 'ORIG_SIZE': return 'orig-size';
                    case 'FIT_CROP_SIZE': return 'fit-crop-size';
                    default: return 'fit-size';
                }

            }
        }
    };
});


app.directive('dashboardMiniature', function($stateParams) {
    return {
        restrict: 'EA',
        templateUrl: '/templates/dashboards/dashboard-miniature.html',
        scope: {
            dashboard: '=',
            pageIdx: '='
        },
        link: function($scope, element, attrs) {
            $scope.tiles = $scope.dashboard.pages[$scope.pageIdx || 0].grid.tiles;

            $scope.$watch("dashboard", function () {
                $scope.tiles = $scope.dashboard.pages[$scope.pageIdx || 0].grid.tiles;
            });

            $scope.$watch("tiles", function () {
                var cells = [];

                var numCols = 12;
                var numRows = d3.max($scope.tiles, function (d) {
                    return d.box.top + d.box.height;
                });

                for (var i = 0; i < numRows; i++) {
                    cells[i] = [];
                    for (var j = 0; j < numCols; j++) {
                        cells[i][j] = "filler";
                    }
                }

                $scope.tiles.forEach(function (tile) {
                    var box = tile.box;
                    if (box.top == -1 || box.left == -1 || box.top == null || box.left == null || box.height == null || box.width == null) return;

                    cells[box.top][box.left] = tile;

                    for (var i = box.top; i < box.top + box.height; i++) {
                        for (var j = box.left; j < box.left + box.width; j++) {
                            if (i == box.top && j == box.left) continue;
                            cells[i][j] = false;
                        }
                    }
                });

                $scope.cells = cells;
            }, true);
        }
    };
});

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards');

    app.factory("TileUtils", function(DashboardUtils, CreateModalFromTemplate, $rootScope, $stateParams) {

        var getDefaultShowTitleMode = function(insight) {
            return DashboardUtils.getInsightHandler(insight.type).defaultTileShowTitleMode || 'YES';
        };

        var getDefaultTileParams = function(insight) {
            switch(insight.type) {
                case 'text':
                    return {
                    textAlign: 'LEFT'
                };
                case 'image':
                case 'iframe':
                    return {};
                default:
                    var handler = DashboardUtils.getInsightHandler(insight.type);
                    if (handler.getDefaultTileParams) {
                        return handler.getDefaultTileParams(insight);
                    }
                    return angular.copy(handler.defaultTileParams || {});
            }
        };

        var getDefaultTileBox = function(insight) {
            var dimensions;
            switch (insight.type) {
                case 'text':
                    dimensions = [2, 2];
                    break;
                case 'image':
                    dimensions = [3, 3];
                    break;
                case 'iframe':
                    dimensions = [6, 4];
                    break;
                default:
                    var handler = DashboardUtils.getInsightHandler(insight.type);
                    if (handler.getDefaultTileDimensions) {
                        dimensions = handler.getDefaultTileDimensions(insight);
                    } else {
                        dimensions = handler.defaultTileDimensions || [3, 3];
                    }
            }

            return { width: dimensions[0], height: dimensions[1] };
        };

        var openUploadPictureDialog = function(tile) {
            CreateModalFromTemplate(
                "/templates/widgets/image-uploader-dialog.html",
                $rootScope,
                null,
                function(newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.objectType = 'DASHBOARD_TILE';
                    newScope.objectId = tile.imageId
                },
            "image-uploader-dialog")
            .then(function(id) { tile.imageId = id; });
        };

        // TODO @dashboards move to insight handlers
        var getDefaultTileClickAction = function(insight) {
            switch (insight.type) {
                case 'chart':
                case 'dataset_table':
                case 'metrics':
                case 'scenario_last_runs':
                case 'eda':
                    return 'OPEN_INSIGHT';
                default:
                    return 'DO_NOTHING';
            }
        };

        var copyNonInsightTile = function(tile) {
            if (tile.tileType != 'INSIGHT') {
                var copy = angular.copy(tile);
                copy.box.left = -1;
                copy.box.top = -1;
                copy.clickAction = 'DO_NOTHING';
                return copy;
            }
        }

        return {
            newInsightTile : function(insight) {
                return {
                    tileType: 'INSIGHT',
                    insightId: insight.id,
                    insightType: insight.type,
                    tileParams: getDefaultTileParams(insight),
                    displayMode: 'INSIGHT',
                    box: getDefaultTileBox(insight),
                    clickAction: getDefaultTileClickAction(insight),
                    showTitle: getDefaultShowTitleMode(insight),
                    resizeImageMode: "FIT_SIZE",
                    autoLoad: true
                }
            },
            getDefaultTileParams : getDefaultTileParams,
            getDefaultTileBox : getDefaultTileBox,
            getDefaultTileClickAction: getDefaultTileClickAction,
            openUploadPictureDialog: openUploadPictureDialog,
            copyNonInsightTile: copyNonInsightTile
        }
    });

    app.controller("DashboardEditController", function($scope, $controller, $stateParams, $state, $q, $timeout,
        DataikuAPI, CreateModalFromTemplate, Dialogs, TopNav, INSIGHT_TYPES, TileUtils, ActivityIndicator, DashboardUtils, GRAPHIC_EXPORT_OPTIONS) {
        TopNav.setLocation(TopNav.TOP_DASHBOARD, 'dashboards', null, 'edit');
        if ($scope.dashboard) {
            TopNav.setPageTitle($scope.dashboard.name + " - Dashboard");
        }

        $scope.insightTypes = INSIGHT_TYPES;
        $scope.gridFormats = GRAPHIC_EXPORT_OPTIONS.fileFormats;

        Dialogs.saveChangesBeforeLeaving($scope, $scope.isDirty, $scope.saveDashboard, $scope.revertChanges, 'This dashboard has unsaved changes.');
        Dialogs.checkChangesBeforeLeaving($scope, $scope.isDirty);

        /*
        DataikuAPI.dashboards.insights.listWithAccessState($stateParams.projectKey)
            .success(function(data) {
                $scope.insights = data.insights;
                $scope.insightAccessMap = angular.extend($scope.insightAccessMap, data.insightAccessData);
            }).error(setErrorInScope.bind($scope));
         */

        $scope.$on("dashboardSyncModelsDone", function() {
            var insightIdList = [];
            $scope.dashboard.pages.forEach(function(page) {
                page.grid.tiles.forEach(function(tile) {
                    if (insightIdList.indexOf(tile.insightId) == -1) {
                        insightIdList.push(tile.insightId);
                    }
                })
            });
            Object.keys($scope.insightsMap).forEach(function(insightId) {
                if (insightIdList.indexOf(insightId) == -1) {
                    delete $scope.insightsMap[insightId];
                }
            })
        });

        $scope.createNewInsight = function() {
            CreateModalFromTemplate("/templates/dashboards/insights/new-insight-modal.html", $scope, "NewInsightModalController", function(modalScope) {
                modalScope.withSimpleTiles = true;
                modalScope.inDashboard = true;
                modalScope.pointerMode = {isPointerMode: false};
                modalScope.setDashboardCreationId($scope.dashboard.id);
                modalScope.addToDashboard = function(insight) {
                    if (!modalScope.pointerMode.isPointerMode) {
                        DataikuAPI.dashboards.insights.copy($scope.dashboard.projectKey, [insight.id], [insight.name], $scope.dashboard.id)
                        .error(setErrorInScope.bind($scope))
                        .success(function (data) {
                            var insightCopy = data[0];
                            $scope.insightsMap[insightCopy.id] = insightCopy;
                            $scope.addInsightToPage(insightCopy);
                            ActivityIndicator.success("Added");
                        });
                    } else {
                        $scope.addInsightToPage(insight);
                        ActivityIndicator.success("Added");
                    }
                };
                modalScope.isInsightInDashboard = function(insight) {
                    return typeof($scope.insightsMap[insight.id]) !== "undefined";
                };
            }).then(function(ret) {
                if (ret.tileType) { // simple tile
                    $scope.addSimpleTileToPage(ret.tileType);
                } else {
                    if (DashboardUtils.getInsightHandler(ret.insight.type).goToEditAfterCreation) {
                        $scope.$on("dashboardSyncModelsDone", function() {
                            $scope.saveDashboard().success(function() {
                                $timeout(function() {
                                    $state.go("projects.project.dashboards.insights.insight.edit", {insightId: ret.insight.id, insightName: ret.insight.name});
                                });
                            });
                        });
                    }

                    $scope.insightsMap[ret.insight.id] = ret.insight;
                    $scope.insightAccessMap[ret.insight.id] = ret.insight.isReaderAccessible ? 'READER' : 'ANALYST';
                    $scope.addInsightToPage(ret.insight);
                }
            });
        };

        $scope.$on("dashboardOpenAddInsightModal", $scope.createNewInsight);

        $scope.addInsightToPage = function(insight) {
            if (!$scope.insightsMap[insight.id]) {
                $scope.insightsMap[insight.id] = insight;
            }
            $scope.addTileToPage(TileUtils.newInsightTile(insight));
        };

        $scope.addTextTileToPage = function() {
            $scope.addTileToPage({
                tileType: 'TEXT',
                tileParams: TileUtils.getDefaultTileParams({type: 'text'}),
                box: TileUtils.getDefaultTileBox({type: 'text'}),
                showTitle: 'NO'
            });
        };

        $scope.addSimpleTileToPage = function(type) {
            var tile = {
                tileType: type.toUpperCase(),
                tileParams: TileUtils.getDefaultTileParams({type: type.toLowerCase()}),
                box: TileUtils.getDefaultTileBox({type: type.toLowerCase()})
            };

            if (type.toUpperCase() == 'IMAGE') {
                tile.displayMode = 'IMAGE';
                tile.showTitle = 'MOUSEOVER';
                tile.resizeImageMode = 'FIT_SIZE';
            } else {
                tile.showTitle = 'NO'
            }

            $scope.addTileToPage(tile);
        };


        $scope.createPage = function() {
            var page = {
                grid: {
                    tiles: []
                }
            };
            $scope.dashboard.pages.push(page);
            $scope.uiState.currentPageIdx = $scope.dashboard.pages.length - 1;
            $scope.uiState.activeTab = 'slide';
        };

        $scope.removePage = function(pageIdx) {
            $scope.dashboard.pages.splice(pageIdx, 1);
            if ($scope.dashboard.pages.length == 0) {
                $scope.createPage();
            }
            $scope.uiState.currentPageIdx = Math.min($scope.uiState.currentPageIdx, $scope.dashboard.pages.length-1);
        };

        $scope.openCopySlideModal = function(pageIdx) {
            CreateModalFromTemplate("/templates/dashboards/copy-page-modal.html", $scope, "CopyPageController", function(newScope) {
                newScope.pages = $scope.dashboard.pages;
                newScope.page = $scope.dashboard.pages[pageIdx];
                newScope.pageIdx = pageIdx;
                newScope.uiState = $scope.uiState;
                newScope.insightsMap = $scope.insightsMap;
                newScope.init();
            });
        };

        function onSortUpdated(evt, ui) {
            var prevIdx = ui.item.sortable.index, newIdx = ui.item.index();
            if (prevIdx == $scope.uiState.currentPageIdx) {
                $scope.uiState.currentPageIdx = ui.item.index();
            } else if (prevIdx < $scope.uiState.currentPageIdx && newIdx >= $scope.uiState.currentPageIdx) {
                $scope.uiState.currentPageIdx--;
            } else if (prevIdx > $scope.uiState.currentPageIdx && newIdx <= $scope.uiState.currentPageIdx) {
                $scope.uiState.currentPageIdx++;
            }
        }

        $scope.pageSortOptions = {
            axis:'x',
            cursor: 'move',
            update: onSortUpdated,
            handle: '.dashboard-slide-tab__content',
            items:'> .dashboard-slide-tab'
        };

        $scope.addTileToPage = function(tile) {
            $scope.dashboard.pages[$scope.uiState.currentPageIdx].grid.tiles.push(tile);
            $scope.uiState.selectedTile = tile;
        };

        $scope.$watch('uiState.selectedTile', function(nv) {
            if (nv == null) {
                if ($scope.uiState.activeTab == 'tile' && $scope.uiState.previousActiveTab) {
                    $scope.uiState.activeTab = $scope.uiState.previousActiveTab;
                }
            } else {
                if ($scope.uiState.activeTab != 'tile') {
                    $scope.uiState.previousActiveTab = $scope.uiState.activeTab;
                    $scope.uiState.activeTab = 'tile';
                }
            }
        });

        // Save dashboard on first gridListRendered to avoid dirty state caused by tile box initializations after publishing from object
        var unregister = $scope.$on("gridListRendered", function() {
            unregister();
            $timeout($scope.saveDashboard);
        });

        $scope.getPageTitle = function(page) {
            return page.title ? page.title : 'Slide ' + ($scope.dashboard.pages.indexOf(page) + 1);
        }

        $scope.$on('$destroy', $scope.resetInitialSelectedTile);

    });

    app.controller("CopyPageController", function($scope, DataikuAPI, $timeout, StateUtils) {

        $scope.pointerMode = false;

        // b/c when this function is called, CreateModalFromTemplate callback is not executed yet, therefore $scope.page does not exist yet.
        $scope.init = function() {
            $scope.copyPageName = $scope.page.title || 'Slide ' + ($scope.pageIdx + 1);
            $scope.copyPageName += " - COPY";

            DataikuAPI.dashboards.listEditable($scope.dashboard.projectKey, $scope.dashboard.id)
            .error(setErrorInScope.bind($scope))
            .success(function (data) {
                $scope.dashboards = data.dashboards;
                for (var i=0; i<$scope.dashboards.length; i++) {
                    var d = $scope.dashboards[i];
                    if (d.id == $scope.dashboard.id) {
                        $scope.targetedDashboard = d;
                        break;
                    }
                }
            });
        };

        $scope.copyPage = function() {
            var copyPageFront = function(insights) {
                var newPage = angular.copy($scope.dashboard.pages[$scope.pageIdx]);
                newPage.title = $scope.copyPageName;
                newPage.id = null;
                if (insights) {
                    newPage.grid.tiles.forEach(function(tile) {
                        if (tile.tileType == "INSIGHT") {
                            var insight = insights.shift();
                            tile.insightId = insight.id;
                        }
                    });
                }
                $scope.pages.splice($scope.pageIdx + 1, 0, newPage);
                $scope.uiState.currentPageIdx = $scope.pageIdx+1;
            }

            const tgt = $scope.targetedDashboard;

            if (tgt.id == $scope.dashboard.id) {
                if (!$scope.pointerMode) {
                    var insightIds = [];
                    var insightNames = [];
                    $scope.page.grid.tiles.forEach(function(tile) {
                        if (tile.tileType == "INSIGHT") {
                            insightIds.push(tile.insightId);
                            insightNames.push($scope.insightsMap[tile.insightId].name);
                        }
                    });
                    DataikuAPI.dashboards.insights.copy($scope.dashboard.projectKey, insightIds, insightNames, $scope.dashboard.id)
                    .error(setErrorInScope.bind($scope))
                    .success(function (data) {
                        data.forEach(function(insight) {
                            $scope.insightsMap[insight.id] = insight;
                        });
                        copyPageFront(data);
                        $scope.dismiss();
                    });
                } else {
                    copyPageFront();
                    $scope.dismiss();
                }
            } else {
                DataikuAPI.dashboards.copyPage($scope.dashboard.projectKey, $scope.dashboard.id, $scope.page, tgt.id, $scope.copyPageName, $scope.pointerMode)
                    .error(setErrorInScope.bind($scope))
                    .success(function (data) {
                        $timeout(function() {
                            StateUtils.go.dashboard(tgt.id, tgt.projectKey, {name: tgt.name, tab: 'edit', pageId: data});
                        });
                        $scope.dismiss();
                    });
            }
        }
    });

    app.directive('dashboardTileParams', function($stateParams, $controller, DashboardUtils, $timeout, TileUtils) {
        return {
            restrict: 'EA',
            templateUrl: '/templates/dashboards/tile-params.html',
            scope: {
                tile: '=',
                insight: '=',
                canModerateDashboards: '='
            },
            link: function($scope, $element) {
                $scope.$stateParams = $stateParams;
                $scope.getDefaultTileTitle = getDefaultTileTitle;
                $scope.canEditInsight = function(insight) { return DashboardUtils.canEditInsight(insight, $scope.canModerateDashboards); };
                $scope.DashboardUtils = DashboardUtils;

                $scope.feelIfEmpty = function() {
                    if (!$scope.tile.title) {
                        $scope.tile.title = getDefaultTileTitle($scope.tile, $scope.insight);
                    }
                };

                $scope.emptyIfUnchanged = function() {
                    if ($scope.tile.title == getDefaultTileTitle($scope.tile, $scope.insight)) {
                        delete $scope.tile.title;
                    }
                };

                $scope.$watch("tile.insightType", function() {
                    $timeout(function() {
                        $element.find('select.display-mode-select').selectpicker('refresh');
                    });
                });

                $scope.openUploadPictureDialog = TileUtils.openUploadPictureDialog;

                $scope.deleteTileBorderColor = function() {
                    delete $scope.tile.borderColor;
                }
            }
        }
    });


    app.controller("NewDashboardModalController", function($scope, $controller, $stateParams, DataikuAPI) {
        $scope.dashboard = {
                projectKey: $stateParams.projectKey,
                owner: $scope.appConfig.user.login
        };

        $scope.create = function() {
            $scope.dashboard.name = $scope.dashboard.name || ($scope.appConfig.user.displayName + "'s dashboard");
            DataikuAPI.dashboards.save($scope.dashboard).success(function (dashboard) {
                $scope.dashboard = dashboard;
                $scope.resolveModal($scope.dashboard);
            }).error(setErrorInScope.bind($scope));
        };
    });


    app.controller("CopyDashboardModalController", function($scope, DataikuAPI, ActivityIndicator, StateUtils) {
        $scope.init = function(dashboard) {
            $scope.dashboard = dashboard;
            $scope.dashboard.newName = "Copy of " + dashboard.name;
            $scope.pointerMode = false;
        };

        $scope.copy = function() {
            DataikuAPI.dashboards.copy($scope.dashboard.projectKey, $scope.dashboard.id, $scope.dashboard.newName, !$scope.pointerMode)
                .error(setErrorInScope.bind($scope))
                .success(function (data) {
                    ActivityIndicator.success( $scope.dashboard.name + " copied into " + data.name + ", <a href='" + StateUtils.href.dashboard(data.id, data.projectKey, {name: data.name}) + "' >view dashboard</a>.", 5000);
                    $scope.resolveModal();
                });
        }
    });

    app.directive('dashboardExportForm', function(GRAPHIC_EXPORT_OPTIONS, WT1, GraphicImportService) {
        return {
            replace: false,
            require: '^form',
            restrict: 'EA',
            scope: {
                params: '=',
                origin: '@origin',
                pageIdx: '=?'
            },
            templateUrl: '/templates/dashboards/export-form.html',
            link: function($scope, element, attrs, formCtrl) {
                WT1.event("dashboard-export-form-displayed", {});

                let gridOrWindowWidth = function () {
                    if (document.querySelector(".dashboard-export-grid") != null) {
                        // Add css margin of 5 and 5 for each side
                        return Math.round(Math.max(960, document.querySelector(".dashboard-export-grid").getBoundingClientRect().width + 10));
                    } else {
                        return Math.round(Math.max(960, window.outerWidth));
                    }
                };

                $scope.exportFormController = formCtrl;
                // Utilities that give us all the choices possible
                $scope.paperSizeMap = GRAPHIC_EXPORT_OPTIONS.paperSizeMap;
                $scope.orientationMap = GRAPHIC_EXPORT_OPTIONS.orientationMap;
                $scope.fileTypes = GRAPHIC_EXPORT_OPTIONS.fileTypes;

                $scope.minResW = 960;
                $scope.minResH = 540;
                $scope.maxResW = 7200;
                $scope.maxResH = 10000;
                $scope.selectedDashboard = {};

                // Parameters of the export
                if (angular.isUndefined($scope.params.exportFormat)) {
                    $scope.params.exportFormat = {
                        paperSize: "A4",
                        orientation: "LANDSCAPE",
                        fileType: "PDF",
                        width: ($scope.origin == 'modal') ? gridOrWindowWidth("LANDSCAPE") : 1920
                    };
                    $scope.params.exportFormat.height = GraphicImportService.computeHeight($scope.params.exportFormat.width, $scope.params.exportFormat.paperSize);
                }

                $scope.$watch('params.exportFormat.paperSize', function (newVal, oldVal) {
                    if (newVal !== oldVal) {
                        if (newVal != 'CUSTOM') {
                            $scope.params.exportFormat.width = ($scope.origin == 'modal') ? gridOrWindowWidth() :
                                $scope.params.exportFormat.orientation == "PORTRAIT" ? 1080 : 1920;
                            $scope.params.exportFormat.height = GraphicImportService.computeHeight($scope.params.exportFormat.width, $scope.params.exportFormat.paperSize, $scope.params.exportFormat.orientation);
                        }
                    }
                });
            }
        }
    });

    app.controller("ExportDashboardModalController", function($scope, DataikuAPI, ActivityIndicator, FutureProgressModal, WT1) {
        $scope.init = function (selection, massExport) {
            // Selection can correspond to multiple dashboards or a single dashboard
            $scope.params = {};

            if (massExport == true) {
                if ($scope.selection.selectedObjects.length > 0) {
                    $scope.projectKey = $scope.selection.selectedObjects[0].projectKey;
                } else {
                    $scope.projectKey = null;
                }
                $scope.params.dashboards = $scope.selection.selectedObjects.map(function(dashboard) {
                    return { dashboardId: dashboard.id, slideIndex: undefined };
                });
                if ($scope.selection.selectedObjects.length == 1) {
                    $scope.projectKey = $scope.dashboard.projectKey;
                    $scope.modalTitle = "Export dashboard : " + $scope.dashboard.name;
                } else {
                    $scope.projectKey = $scope.selection.selectedObjects.length == 0 ? null : $scope.selection.selectedObjects[0].projectKey;
                    $scope.modalTitle = "Export a list of " + $scope.selection.selectedObjects.length + " dashboards";
                }
            } else {
                $scope.projectKey = $scope.dashboard.projectKey;
                $scope.params.dashboards = [ {dashboardId: $scope.dashboard.id, slideIndex: undefined} ];
                $scope.modalTitle = "Export dashboard : " + $scope.dashboard.name;
            }
        };

        $scope.exportDashboard = function() {
            WT1.event("dashboard-exported-from-dashboard-universe", {
                format: $scope.params.exportFormat
            });

            if ($scope.params.exportOnlyCurrentSlide && $scope.params.dashboards.length == 1) {
                $scope.params.dashboards[0].slideIndex = $scope.pageIdx;
            }
            DataikuAPI.dashboards.export($scope.projectKey, $scope.params.exportFormat, $scope.params.dashboards)
                .error(setErrorInScope.bind($scope))
                .success(function (resp) {
                    FutureProgressModal.show($scope, resp, "Export dashboard").then(function (result) {
                        if (result) { // undefined in case of abort
                            downloadURL(DataikuAPI.dashboards.getExportURL(result.projectKey, result.exportId));
                            ActivityIndicator.success("Dashboard export(s) downloaded!", 5000);
                        } else {
                            ActivityIndicator.error("Export dashboard failed", 5000);
                        }
                        $scope.resolveModal();
                    });
                });
        }
    });

    function getDefaultTileTitle(tile, insight) {
        switch (tile.tileType) {
            case 'INSIGHT':
                return (insight || {}).name;
            case 'TEXT':
                return 'Text tile';
            case 'IMAGE':
                return 'Image tile';
        }
    }

})();

(function(){
'use strict';

    const app = angular.module('dataiku.dashboards.insights', []);


    app.constant('INSIGHT_TYPES', [
        'dataset_table',
        'chart',
        'discussions',
        'jupyter',
        'metrics',
        'saved-model_report',
        'managed-folder_content',
        'web_app',
        'report',
        'project_activity',
        'scenario',
        'runnable-button',
        'static_file',
        'article',
        'eda'
    ]);

    const reportInsightsDownloader = $('<iframe>').attr('id', 'reports-downloader');

    app.controller("_InsightsCommonController", function($scope, $controller, $rootScope, TopNav, DataikuAPI, ActivityIndicator, CreateModalFromTemplate, Dialogs, $stateParams, $state, RMARKDOWN_ALL_OUTPUT_FORMATS, WT1) {

        function makeInsightListed(insight, noNotification) {
            return DataikuAPI.dashboards.insights.makeListed(insight.projectKey, [insight.id], !insight.listed)
                .success(function(data) {
                    if (!noNotification) {
                        ActivityIndicator.success("Saved!");
                    }
                    $scope.$broadcast("objectTimelineChanged");
                    insight.listed = !insight.listed;
                    if ($scope.origInsight) $scope.origInsight.listed = insight.listed;
                }).error(setErrorInScope.bind($scope));
        }

        $scope.makeInsightListed = makeInsightListed;

        $scope.toggleInsightListed = function(insight) {
            if (!insight.listed && (insight.accessState &&  insight.accessState !== 'READER')) {
                CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", $scope, null, function(newScope) {
                    newScope.initForInsights([insight], true);
                }).then(function() { makeInsightListed(insight, true).success($scope.list); });
            } else {
                makeInsightListed(insight, true);
            }
        };

        $scope.openInsightAccessModal = function(insight) {
            CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", $scope, null, function(newScope) {
                newScope.initForInsights([insight], false);
            }).then($scope.list);
        };

        $scope.canEditInsight = function(insight) {
            return insight && $scope.canWriteDashboards() && ($scope.canModerateDashboards() || insight.owner == $scope.appConfig.login);
        };

        $scope.saveCustomFields = function(newCustomFields) {
            WT1.event('custom-fields-save', {objectType: 'INSIGHT'});
            let oldCustomFields = angular.copy($scope.insight.customFields);
            $scope.insight.customFields = newCustomFields;
            return DataikuAPI.dashboards.insights.save($scope.insight)
                .success(function() {
                    $scope.origInsight = angular.copy($scope.insight);
                    $scope.$broadcast('objectTimelineChanged');
                    $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.insight.customFields);
                })
                .error(function(a, b, c) {
                    $scope.insight.customFields = oldCustomFields;
                    setErrorInScope.bind($scope)(a, b, c);
                });
        };

        $scope.editCustomFields = function() {
            if (!$scope.insight) {
                return;
            }
            let modalScope = angular.extend($scope, {objectType: 'INSIGHT', objectName: $scope.insight.name, objectCustomFields: $scope.insight.customFields});
            CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                $scope.saveCustomFields(customFields);
            });
        };

        $scope.hasEditTab = function(insight) {
            //TODO @insights use handler!
            // Exclusion list
            return insight && [
                "metrics",
                "discussions",
                "web_app",
                "managed-folder_content",
                "saved-model_report",
                "scenario_run_button",
                "scenario_last_runs",
                "project_activity",
                "static_file",
                "article"
            ].indexOf(insight.type) == -1;
        };

        $scope.downloadRMarkdownReportInsight = function(insight) {
            const newScope = $scope.$new();
            newScope.insight = insight;
            const t = insight.params.loadLast ? 0 : insight.params.exportTimestamp;
            DataikuAPI.reports.snapshots.get(insight.projectKey, insight.params.reportSmartId, t).success(function(snapshot) {
                CreateModalFromTemplate("/templates/code-reports/download-report-modal.html", newScope, null, function(modalScope) {
                    modalScope.formats = RMARKDOWN_ALL_OUTPUT_FORMATS.filter(f => (snapshot.availableFormats||[]).includes(f.name));
                    modalScope.allFormats = RMARKDOWN_ALL_OUTPUT_FORMATS.length == modalScope.formats.length;

                    modalScope.options = {}
                    if (modalScope.formats.find(f => f.name == 'PDF_DOCUMENT')) {
                        modalScope.options.format = 'PDF_DOCUMENT';
                    } else if (modalScope.formats.length) {
                        modalScope.options.format = modalScope.formats[0].name;
                    }

                    modalScope.downloadReport = function() {
                        modalScope.dismiss(); // dismiss modal 1
                        const url = "/dip/api/reports/snapshots/download?" + $.param({
                            projectKey: insight.projectKey,
                            id: insight.id,
                            format: modalScope.options.format
                        });

                        reportInsightsDownloader.attr('src', url);
                        $('body').append(reportInsightsDownloader);
                    };
                });
            }).error(setErrorInScope.bind($scope));
        };

        $scope.copy = function(insight, callBackFunc) {
            CreateModalFromTemplate("/templates/dashboards/insights/copy-insight-modal.html", $scope, "CopyInsightModalController", function(newScope) { newScope.init(insight); })
            .then(function() {
                if (typeof(callBackFunc) === 'function') callBackFunc();
            });
        };

        $scope.mutiPin = function(insight, callbackFunc) {
            CreateModalFromTemplate("/templates/dashboards/insights/multi-pin-insight-modal.html", $scope, "MultiPinInsightModalController", function(newScope) {
                newScope.multiPinCallback = callbackFunc;
                newScope.init(insight);
            });
        };

    });

    // Resolves with true if any reader authorization was modified, false otherwise
    app.controller("InsightAccessWarningModalController", function($scope, $controller, DataikuAPI, $rootScope, SmartId) {
        $scope.SmartId = SmartId;

        $scope.initForInsights = function(insights, listing) {
            $scope.insightOrDashboard = 'insight';
            $scope.listing = listing;
            $scope.projectKey = insights[0].projectKey;
            DataikuAPI.dashboards.insights.getMissingReaderAuthorizations($scope.projectKey, insights.map(function(insight){return insight.id;})).success(function(data) {
                $scope.readerAuthorizations = data;
                $scope.selectedReaderAuthorizations = angular.copy($scope.readerAuthorizations);
            }).error(setErrorInScope.bind($scope));
        };

        $scope.initForDashboards = function(dashboards, listing) {
            $scope.insightOrDashboard = 'dashboard';
            $scope.listing = listing;
            $scope.projectKey = dashboards[0].projectKey;
            DataikuAPI.dashboards.getMissingReaderAuthorizations($scope.projectKey, dashboards.map(function(dashboard){return dashboard.id;})).success(function(data) {
                $scope.readerAuthorizations = data;
                $scope.selectedReaderAuthorizations = angular.copy($scope.readerAuthorizations);
            }).error(setErrorInScope.bind($scope));
        };

        $scope.initForDashboardsWithAuths = function(dashboards, listing, requiredAuths) {
            $scope.insightOrDashboard = 'dashboard';
            $scope.listing = listing;
            $scope.projectKey = dashboards[0].projectKey;
            $scope.readerAuthorizations = requiredAuths;
            $scope.selectedReaderAuthorizations = angular.copy(requiredAuths);
        };

        $scope.initForInsightsWithAuths = function(insights, listing, requiredAuths) {
            $scope.insightOrDashboard = 'dashboard';
            $scope.listing = listing;
            $scope.projectKey = insights[0].projectKey;
            $scope.readerAuthorizations = requiredAuths;
            $scope.selectedReaderAuthorizations = angular.copy(requiredAuths);
        };

        $scope.add = function() {
            if ($rootScope.projectSummary.canManageDashboardAuthorizations && $scope.selectedReaderAuthorizations.length) {
                DataikuAPI.projects.addReaderAuthorizations($scope.projectKey, $scope.selectedReaderAuthorizations).success(function(data) {
                    $scope.resolveModal(true);
                }).error(setErrorInScope.bind($scope));
            } else {
                $scope.resolveModal(false);
            }
        };
    });

        /** List of dashboards */
    app.controller("InsightsListController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs,$state,$q, TopNav, Fn, $filter, ActivityIndicator, DashboardUtils) {
        $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
        $controller('_InsightsCommonController', {$scope:$scope});

        $scope.listHeads = DataikuAPI.dashboards.insights.listHeads;

        $scope.sortBy = [
            { value: 'name', label: 'Name' },
            { value: '-lastModifiedOn', label: 'Last modified' },
            { value: 'type', label: 'Insight type' },
        ];
        $scope.selection = $.extend({
            filterQuery: {
                userQuery: '',
                tags: [],
                type: [],
                listed : "",
                interest: {
                    starred: '',
                },
            },
            filterParams: {
                userQueryTargets: ["name","tags","type"],
                propertyRules: {tag: 'tags'},
            },
            inclusiveFilter: {

                owner: []
            },
            customFilterWatch: "selection.inclusiveFilter",
            customFilter: function(objList) {
                return objList.filter(function(obj) {
                    if ($scope.selection.inclusiveFilter.owner.length > 0) {
                        if ($scope.selection.inclusiveFilter.owner.indexOf(obj.owner) > -1) {
                            return true;
                        }
                        return false;
                    } else {
                        return true;
                    }
                });
            },
            orderQuery: "-lastModifiedOn",
            orderReversed: false,
        }, $scope.selection || {});


        $scope.setOwnerFilter = function (owner) {
            if (!owner) {
                $scope.selection.inclusiveFilter.owner = [];
                return;
            }

            let arr = $scope.selection.inclusiveFilter.owner;
            const index = arr.indexOf(owner);

            if (index > -1) {
                arr.splice(index, 1);
            } else {
                arr.push(owner);
            }
        }

        $scope.setTypeFilter = function (type) {
            if (!type) {
                $scope.selection.filterQuery.type = [];
                return;
            }
            let arr = $scope.selection.filterQuery.type;
            const index = arr.indexOf(type);

            if (index > -1) {
                arr.splice(index, 1);
            } else {
                arr.push(type);
            }
        }

        $scope.setListedFilterQuery = function(value) {
            $scope.selection.filterQuery.listed = value ? 'true' : '';
        }

        $scope.sortCookieKey = 'insights';
        $scope.maxItems = 20;

        TopNav.setLocation(TopNav.TOP_DASHBOARD, 'insights', TopNav.TABS_NONE, null);
        TopNav.setNoItem();
        $scope.list() ;

        $scope.$watch("selection.selectedObject",function(nv) {
            if (!nv) return;

            DataikuAPI.dashboards.insights.getFullInfo($stateParams.projectKey, nv.id).success(function(data) {
                $scope.insight = data.insight;
            }).error(setErrorInScope.bind($scope));
        });

        /* Specific actions */
        $scope.goToItem = function(data) {
            $state.go("projects.project.dashboards.insights.insight.view", {projectKey : $stateParams.projectKey, analysisId : data.id, analysisName: data.name});
        };

        $scope.newInsight = function() {
            CreateModalFromTemplate("/templates/dashboards/insights/new-insight-modal.html", $scope, "NewInsightModalController")
                .then(function(ret) {
                    if(ret.callback) ret.callback();
                    $scope.list();
                });
        };

        $scope.isAllListed = function(items) {
            if (!items) return true;
            return items.map(Fn.prop('listed')).reduce(function(a,b){return a&&b},true);
        };

        $scope.canMassMakeListed = true;
        $scope.massMakeListed = function(items, listed) {
            var apiCall = function() {
                DataikuAPI.dashboards.insights.makeListed(items[0].projectKey, ids, listed)
                .success(function(data) {
                    ActivityIndicator.success("Saved!");
                    $scope.list();
                }).error(setErrorInScope.bind($scope));
            }

            if (!(items && items.length > 0)) {
                return;
            }
            var ids = [];
            var unreadableItems = [];
            items.forEach(function(item) {
                if (item.listed != listed) {
                    ids.push(item.id);
                }
                if (item.accessState !== 'READER') {
                    unreadableItems.push(item);
                }
            });
            if (listed && unreadableItems.length > 0) {
                CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", $scope, null, function(newScope) {
                    newScope.initForInsights(unreadableItems, true);
                }).then(apiCall);
            } else {
                apiCall();
            }
        };

        $scope.owners = [];
        $scope.types = [];
        $scope.ownersMap = {};
        $scope.list = function() {
            $scope.listHeads($stateParams.projectKey, $scope.tagFilter).success(function(data) {
                $scope.filteredOut = data.filteredOut;
                $scope.listItems = data.items;
                $scope.restoreOriginalSelection();

                var ownersMap = {};
                data.items.forEach(function(insight) {
                    ownersMap[insight.owner] = {
                        login : insight.owner,
                        displayName : insight.ownerDisplayName
                    };
                    if ($scope.types.indexOf(DashboardUtils.getInsightTypeGroup(insight.type)) == -1) {
                        $scope.types.push(DashboardUtils.getInsightTypeGroup(insight.type));
                    }
                });
                $scope.owners.length = 0;
                for (var login in ownersMap) {
                    $scope.owners.push(ownersMap[login]);
                }
                $scope.owners.sort(function(a, b){
                    if(a.displayName < b.displayName) return -1;
                    if(a.displayName > b.displayName) return 1;
                    return 0;
                });
                $scope.types.sort();
            }).error(setErrorInScope.bind($scope));

        }
        $scope.list();
    });

    app.directive('insightTypeSelector', function(DashboardUtils){
        return {
            template:
            '<ul>' +
            '    <li ng-repeat="insightType in insightTypesList" ng-click="toggleType(insightType)" ng-class="{\'selected\' : isTypeSelected(insightType)}">' +
            '       <i class="insight-icon {{insightType | insightTypeToIcon}} universe-background {{insightType | insightTypeToColor}}"></i> <span class="type-name">{{insightType | insightTypeToDisplayableName}}</span>' +
            '   </li>' +
            '</ul>',
            scope: {
                insightTypesList: '=insightTypeSelector',
                selectedTypesList: '='
            },
            link: function(scope, element){
                scope.DashboardUtils = DashboardUtils;
                scope.toggleType = function(type) {
                    if (type) {
                        var index = scope.selectedTypesList.indexOf(type);
                        index > -1 ? scope.selectedTypesList.splice(index, 1) : scope.selectedTypesList.push(type);
                    }
                };

                scope.isTypeSelected = function(type) {
                    return scope.selectedTypesList.indexOf(type) > -1;
                };
            }
        };
    });


    app.controller("InsightCoreController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav, $filter, $state, $controller, StateUtils, DashboardUtils, CreateModalFromTemplate) {

        $controller('_InsightsCommonController', {$scope:$scope});

        $scope.DashboardUtils = DashboardUtils;

        // Store the previous state to display the "go back to dashboard" button
        $scope.$on('$stateChangeSuccess', function (ev, to, toParams, from, fromParams) {
            if ($scope.originDashboardStateParams) return;
            if (from && from.name.startsWith('projects.project.dashboards.dashboard')) {
                $scope.originDashboardStateParams = fromParams;
                $scope.originDashboardState = from.name;
                $scope.originDashboardEdit = from.name.endsWith('edit');
            }
        });


        DataikuAPI.dashboards.insights.getFullInfo($stateParams.projectKey, $stateParams.insightId).success(function(data) {
            $scope.insight = data.insight;
            $scope.dashboardsPinnedOn = data.dashboardsPinnedOn;
            $scope.dashboardsLinkedFrom = data.dashboardsLinkedFrom;
            $scope.timeline = data.timeline;
            $scope.interest = data.interest;

            computeNbDashboardsPinnedOn();
            $scope.origInsight = angular.copy(data.insight);

            TopNav.setItem(TopNav.ITEM_INSIGHT, $stateParams.insightId, data.insight);
            TopNav.setPageTitle(data.insight.name + " - Insight");

            $scope.$watch("insight.name", function(nv) {
                if (!nv) return;
                $state.go($state.current, {insightName: $filter('slugify')(nv)}, {location: 'replace', inherit:true, notify:false, reload:false});
            });
        }).error(setErrorInScope.bind($scope));


        $scope.isDirty = function() {
            if (!$scope.canEditInsight($scope.insight)) {
                return false;
            }

            if ($scope.insight.type == 'chart') {
                delete $scope.insight.params.def.thumbnailData;
                delete $scope.origInsight.params.def.thumbnailData;
            }
            return !angular.equals($scope.insight, $scope.origInsight);
        };

        $scope.revertChanges = function() {
            $scope.insight = angular.copy($scope.origInsight);
        };

        $scope.saveInsight = function(commitMessage) {
            return DataikuAPI.dashboards.insights.save($scope.insight, commitMessage)
                .success(function(data) {
                    $scope.origInsight = angular.copy($scope.insight);
                }).error(setErrorInScope.bind($scope));
        };

        var computeNbDashboardsPinnedOn = function() {
            $scope.nbDashboardsPinnedOn = $scope.dashboardsPinnedOn.length;
            $scope.nbListedDashboardsPinnedOn = $scope.dashboardsPinnedOn.filter(function(d){return d.listed}).length;
            $scope.nbDashboardsLinkedFrom = $scope.dashboardsLinkedFrom.length;
            $scope.nbListedDashboardsLinkedFrom = $scope.dashboardsLinkedFrom.filter(function(d){return d.listed}).length;
        };

        $scope.backToDashboard = function() {
            const params = $scope.originDashboardStateParams;
            if (params) {
                const options = {
                    name: params.dashboardName,
                    tab: $scope.originDashboardEdit ? 'edit' : 'view',
                    pageId: params.pageId
                };
                StateUtils.go.dashboard(params.dashboardId, params.projectKey, options);
            }
        };

        $scope.toggleInsightListed = function() {
            if (!$scope.insight.listed) {
                DataikuAPI.dashboards.insights.getMissingReaderAuthorizations($scope.insight.projectKey, [$scope.insight.id]).success(function(data) {
                    if (data.length) {
                        CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", $scope, null, function(newScope) {
                            newScope.initForInsightsWithAuths([$scope.insight], true, data);
                        }).then(function() { $scope.makeInsightListed($scope.insight); });
                    } else {
                        $scope.makeInsightListed($scope.insight);
                    }
                });
            } else {
                $scope.makeInsightListed($scope.insight);
            }
        }
    });


    app.controller("InsightSummaryController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav, ActivityIndicator) {
        TopNav.setLocation(TopNav.TOP_DASHBOARD, 'insights', null, 'summary');
        if ($scope.insight) {
            TopNav.setPageTitle($scope.insight.name + " - Insight");
        }

        function refreshTimeline() {
            DataikuAPI.timelines.getForObject($stateParams.projectKey, "INSIGHT", $stateParams.insightId)
                .success(function(data){
                    $scope.timeline = data;
                })
                .error(setErrorInScope.bind($scope));
        }

        $scope.$on("objectSummaryEdited", function(){
            DataikuAPI.dashboards.insights.save($scope.insight).error(setErrorInScope.bind($scope.$parent)).success(function() {
                ActivityIndicator.success("Saved!");
                refreshTimeline();
            });
        });

        $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
            $scope.saveCustomFields($scope.insight, customFields);
        });

        $scope.$on("objectTimelineChanged", refreshTimeline);
    });

    app.controller("InsightDetailsController", function($scope, $stateParams, $state, FutureProgressModal, DatasetUtils, StateUtils, Dialogs, ActiveProjectKey) {
        $scope.isOnInsightObjectPage = function() {
            return $state.includes('projects.project.dashboards.insights.insight');
        }
    });

    app.directive('insightRightColumnSummary', function($controller, DataikuAPI, QuickView, ActiveProjectKey, ActivityIndicator){
        return {
            templateUrl :'/templates/dashboards/insights/right-column-summary.html',
            link : function($scope, element, attrs) {

                $controller('_TaggableObjectsMassActions', {$scope: $scope});

                $scope.QuickView = QuickView;

                /* Auto save when summary is modified */
                $scope.$on("objectSummaryEdited", function(){
                    DataikuAPI.dashboards.insights.save($scope.insight).success(function(data) {
                        ActivityIndicator.success("Saved");
                    }).error(setErrorInScope.bind(scope));
                });

                $scope.refreshData = function() {
                    DataikuAPI.dashboards.insights.getFullInfo($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.id).success(function(data) {
                        if (!$scope.selection.selectedObject
                            || $scope.selection.selectedObject.id != data.insight.id
                            || $scope.selection.selectedObject.projectKey != data.insight.projectKey) {
                            return; //too late!
                        }
                        $scope.insightFullInfo = data;
                        $scope.insightFullInfo.isProjectAnalystRO = $scope.isProjectAnalystRO ? $scope.isProjectAnalystRO() : false;
                        $scope.insight = data.insight;
                        computeNbDashboardsPinnedOn();
                    }).error(setErrorInScope.bind($scope));
                };

                $scope.$on('customFieldsSaved', $scope.refreshData);

                $scope.refreshTimeline = function(){
                    DataikuAPI.timelines.getForObject(ActiveProjectKey.get(), "INSIGHT", $scope.selection.selectedObject.id)
                        .success(function(data){
                            $scope.timeline = data;
                        })
                        .error(setErrorInScope.bind($scope));
                };


                $scope.$watch("selection.selectedObject",function(nv) {
                    if (!$scope.selection) $scope.selection = {};
                    $scope.insightFullInfo = {insight: $scope.selection.selectedObject, timeline: {}}; // display temporary (incomplete) data
                });

                $scope.$watch("selection.confirmedItem", function(nv, ov) {
                    if (!nv) return;
                    $scope.refreshTimeline();
                    $scope.refreshData();
                });

                var computeNbDashboardsPinnedOn = function() {
                    var ii = $scope.insightFullInfo;
                    $scope.nbDashboardsPinnedOn = ii.dashboardsPinnedOn.length;
                    $scope.nbListedDashboardsPinnedOn = ii.dashboardsPinnedOn.filter(function(d){return d.listed}).length;
                    $scope.nbDashboardsLinkedFrom = ii.dashboardsLinkedFrom.length;
                    $scope.nbListedDashboardsLinkedFrom = ii.dashboardsLinkedFrom.filter(function(d){return d.listed}).length;
                }
            }
        }
    });

    app.controller("InsightPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, GlobalProjectActions, DataikuAPI, ActiveProjectKey) {

            $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

            const insight = (await DataikuAPI.dashboards.insights.get(ActiveProjectKey.get(), $stateParams.insightId)).data;

            insight.nodeType = "INSIGHT";
            insight.interest = {};

            $scope.selection = {
                selectedObject : insight,
                confirmedItem : insight
            };

            function updateListed() {
                DataikuAPI.dashboards.insights.get(ActiveProjectKey.get(), $stateParams.insightId).success(function(data) {
                    $scope.selection.selectedObject.listed = data.listed;
                }).error(setErrorInScope.bind($scope));
            }

            function updateUserInterests() {
                DataikuAPI.interests.getForObject($rootScope.appConfig.login, "INSIGHT", ActiveProjectKey.get(), $stateParams.insightId).success(function(data) {

                    $scope.selection.selectedObject.interest = data;

                }).error(setErrorInScope.bind($scope));
            }

            updateUserInterests();
            const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);
            const listedListener = $scope.$on('objectTimelineChanged', updateListed);
            $scope.$on("$destroy", interestsListener);
            $scope.$on("$destroy", listedListener);
        });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.controller("InsightViewController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs,$state,$q, TopNav) {
        TopNav.setLocation(TopNav.TOP_DASHBOARD, 'insights', null, 'view');
        if ($scope.insight) {
            TopNav.setPageTitle($scope.insight.name + " - Insight");
        }

        $scope.uiState = $scope.uiState || {};
        $scope.uiState.fullScreen = $stateParams.fullScreen && $stateParams.fullScreen != "false";

        $scope.$watch("uiState.fullScreen", function(nv) {
            if (nv == null) return;
            $state.go($state.current, {fullScreen: (nv && nv != "false") ? true : null}, {location: true, inherit:true, notify:false, reload:false});
        });
    });

    app.directive("insightPreview", function(TileUtils) {
        return {
            template: '<dashboard-tile editable="false" insight="insight" tile="tile" hook="hook" />',
            scope: {
                insight: '=',
                autoload: '=?'
            },
            link: function($scope, $el) {
                $scope.$watch("insight", function(nv) {
                    if (!nv) return;
                    $scope.tile = TileUtils.newInsightTile($scope.insight);
                    $scope.tile.$tileId = 'this';
                });

                $scope.hook = {
                    loadPromises: {},
                    loadStates: {}
                };

                function load() {
                    $scope.$watch("hook.loadPromises['this']", function(nv) {
                        if (!nv) return;
                        nv();
                    });
                }

                if ($scope.autoload) load();
                $el.on("loadInsightPreview", load);
            }
        };
    });

    app.directive("insightPreviewLoading", function() {
        return {
            scope: false,
            link: function($scope, $element) {
                $scope.loadInsightPreview = function() {
                    $element.find(".insight-details [insight-preview]").trigger("loadInsightPreview");
                };
            }
        }
    });
})();

(function() {
	'use strict';
	
	const app = angular.module('dataiku.dashboards.insights');
	
	
	app.controller("InsightEditController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs, $state, $q, TopNav) {
		TopNav.setLocation(TopNav.TOP_DASHBOARD, 'insights', null, 'edit');
		if ($scope.insight) {
			TopNav.setPageTitle($scope.insight.name + " - Insight");
		}
	
		Dialogs.saveChangesBeforeLeaving($scope, $scope.isDirty, $scope.saveInsight, $scope.revertChanges, 'This insight has unsaved changes.');
		Dialogs.checkChangesBeforeLeaving($scope, $scope.isDirty);
	});
	
	
	app.directive("insightEditGoToView", function($state) {
		return {
			link: function() {
				$state.go('projects.project.dashboards.insights.insight.view', {location: 'replace', inherit:true});
			}
		};
	});
	
	
	app.controller("NewInsightModalController", function($scope, $controller, $stateParams, $q, $filter,
				   DataikuAPI, INSIGHT_TYPES, DashboardUtils) {
	
		$scope.DashboardUtils = DashboardUtils;
		$scope.insightTypes = INSIGHT_TYPES;
		$scope.displayableInsightType = null;
	
		$scope.uiState = $scope.uiState || {};
		$scope.uiState.modalTab = 'new';
		$scope.filter = {};
	
		// Load insight list
		DataikuAPI.dashboards.insights.listWithAccessState($stateParams.projectKey)
			.success(function(data) {
				$scope.insights = data.insights;
				filterInsights();
				$scope.insightAccessMap = angular.extend($scope.insightAccessMap || {}, data.insightAccessData);
			}).error(setErrorInScope.bind($scope));
	
		$scope.$watch('filter', function(nv, ov) {
			filterInsights();
		}, true);
	
		$scope.$watch('insight.type', function(nv, ov) {
			filterInsights();
		});
	
		function filterInsights() {
			$scope.filteredInsights = $filter('filter')($scope.insights, {type: $scope.insight.type});
			$scope.noInsightOfSelectedType = !$scope.filteredInsights || $scope.filteredInsights.length == 0;
			$scope.filconstsights = $filter('filter')($scope.filteredInsights, {name: $scope.filter.q});
			if ($scope.filter.sourceId) {
				$scope.filteredInsights = $scope.filteredInsights.filter(function(insight) {
					return DashboardUtils.getInsightSourceId(insight) == $scope.filter.sourceId;
				});
			}
		}
	
		// Insights types that share the same create-form directive
		const INSIGHT_TYPE_GROUPS = {
			'scenario_last_runs': 'scenario',
			'scenario_run_button': 'scenario'
		};
	
		$scope.getInsightTypeGroup = function(insightType) {
			return INSIGHT_TYPE_GROUPS[insightType] || insightType;
		};
	
		$scope.simpleTileTypes = {
			text: {name: "Text", desc: "Zone of text"},
			image: {name: "Image", desc: "Upload an image"},
			iframe: {name: "Web Content", desc: "Embedded web page"}
		};
	
		$scope.setDashboardCreationId = function(dashboardId) {
			$scope.insight.dashboardCreationId = dashboardId;
		};
	
		$scope.resetModal = function() {
			$scope.insight = {
				projectKey: $stateParams.projectKey,
				params: {},
			};
	
			$scope.displayableInsightType = null;
	
			$scope.filter = {};
	
			$scope.hook = {
				//Can be overwritten by {{insightType}}InsightCreateForm directives
				beforeSave: function(resolve, reject) {
					resolve();
				},
	
				//Can be overwritten by {{insightType}}InsightCreateForm directives
				afterSave: function(resolve, reject) {
					resolve();
				},
	
				defaultName: null,
				sourceObject: {},
				setErrorInModaleScope : function(data, status, headers, config, statusText) {
					setErrorInScope.bind($scope)(data, status, headers, config, statusText);
				}
			};
		};
	
		$scope.resetModal();
	
		$scope.returnSimpleTile = function(tileType) {
			$scope.resolveModal({
				tileType: tileType
			});
		};
	
		$scope.selectType = function(type) {
			$scope.insight.type = type;
			$scope.displayableInsightType = DashboardUtils.getInsightHandler(DashboardUtils.getInsightTypeGroup(type)).name;
			if (type === "static_file") {
				$scope.pointerMode.isPointerMode = true;
			}
		};
	
		function beforeSavePromise() {
			const deferred = $q.defer();
			$scope.hook.beforeSave(deferred.resolve, deferred.reject);
			return deferred.promise;
		}
	
		function afterSavePromise() {
			const deferred = $q.defer();
			$scope.hook.afterSave(deferred.resolve, deferred.reject);
			return deferred.promise;
		}
	
		$scope.create = function() {
			if (!$scope.insight.name) {
				$scope.insight.name = $scope.hook.defaultName;
			}
	
			beforeSavePromise().then(
				function() {
					function save() {
						DataikuAPI.dashboards.insights.save($scope.insight)
							.error(setErrorInScope.bind($scope))
							.success(function(insightId) {
								$scope.insight.id = insightId;
								if ($scope.hook.sourceObject && !$scope.hook.noReaderAuth) {
									$scope.insight.isReaderAccessible = $scope.hook.sourceObject.isReaderAccessible;
								} else {
									$scope.insight.isReaderAccessible = true;
								}
								$scope.resolveModal({insight: $scope.insight, redirect: $scope.hook.redirect});
								afterSavePromise().then(
									function() {
										//nothing specific to do in case of success
									},
									function(data, status, headers, config, statusText) {
										setErrorInScope.bind($scope)(data, status, headers, config, statusText);
									}
								);
							});
					}
	
					if ($scope.hook.addSourceToReaderAuthorizations) {
						const neededReaderAuthorization = DashboardUtils.getNeededReaderAuthorization($scope.insight);
	
						DataikuAPI.projects.addReaderAuthorizations($stateParams.projectKey, [neededReaderAuthorization])
							.success(function() {
								$scope.hook.sourceObject.isReaderAccessible = true;
								save();
							})
							.error(setErrorInScope.bind($scope));
					} else {
						save();
					}
				},
				function(argArray) {
					if (argArray) {
						setErrorInScope.bind($scope).apply(null, argArray);
					}
				}
			);
		};
	});
	
	app.directive("insightSourceInfo", function(DashboardUtils) {
		return {
			template: '' +
			'<div ng-if="inDashboard" ng-show="matching.length">' +
			'	<a ng-click="go()">{{matching.length}} existing {{"insight" | plurify: matching.length}} with this source</a>' +
			'</div>' +
			'' +
			'<div class="alert alert-warning" ng-if="hook.sourceObject.smartId && !hook.sourceObject.isReaderAccessible && !hook.noReaderAuth">' +
			'	<div>This source is not yet shared with dashboard-only users.</div>' +
			'	<label style="margin-top: 10px" ng-if="projectSummary.canManageDashboardAuthorizations">' +
			'		<input type="checkbox" ng-model="hook.addSourceToReaderAuthorizations" ng-init="hook.addSourceToReaderAuthorizations = true" checked style="margin: -1px 5px 0 0"/>' +
			'		Add <strong>{{hook.sourceObject.label}}</strong> to authorized objects' +
			'	</label>' +
			'   <div ng-show="!hook.addSourceToReaderAuthorizations" style="padding-top: 5px;"><i class="icon-warning-sign"></i>&nbsp;<strong>Dashboard-only users won\'t be able to see this insight.</strong></div>' +
			'</div>',
	
			link: function($scope, element, attrs) {
	
				if (!$scope.inDashboard) return;
	
				function updateMatches() {
					if (!$scope.insights) {
						return;
					}
					const handler = DashboardUtils.getInsightHandler($scope.insight.type);
					$scope.matching = $scope.insights.filter(function(insight) {
						return $scope.getInsightTypeGroup(insight.type) == $scope.getInsightTypeGroup($scope.insight.type)
							&& handler.getSourceId(insight) == handler.getSourceId($scope.insight)
							&& (handler.sourceType || (handler.getSourceType(insight) == handler.getSourceType($scope.insight)));
					});
				}
	
				$scope.go = function() {
					const handler = DashboardUtils.getInsightHandler($scope.insight.type);
					$scope.filter.sourceId = handler.getSourceId($scope.insight);
					$scope.filter.sourceType = handler.sourceType || handler.getSourceType($scope.insight);
					$scope.uiState.modalTab = 'existing';
				};
	
				$scope.$watch("insight", updateMatches, true);
			}
		};
	});
	
	
	app.controller("CopyInsightModalController", function($scope, DataikuAPI, ActivityIndicator, StateUtils, $stateParams) {
		$scope.init = function(insight) {
			$scope.insight = insight;
			$scope.insight.newName = "Copy of " + insight.name;
		};
	
		$scope.copy = function() {
			DataikuAPI.dashboards.insights.copy($stateParams.projectKey, [$scope.insight.id], [$scope.insight.newName])
			.error(setErrorInScope.bind($scope))
			.success(function(data) {
				const insightCopy = data[0];
				const href = StateUtils.href.insight(insightCopy.id, insightCopy.projectKey, {name: insightCopy.name});
				ActivityIndicator.success($scope.insight.name + " copied into " + insightCopy.name + ", <a href='" + href + "' >view insight</a>.", 5000);
				$scope.resolveModal();
			});
		};
	});
	
	
	app.controller("MoveCopyTileModalController", function($scope, DataikuAPI, $controller, StateUtils, $rootScope, $timeout, TileUtils, $stateParams) {
		$controller('MultiPinInsightModalController', {$scope:$scope});
	
		$scope.keepOriginal = true;
		$scope.pointerMode = {
			mode: false
		};
	
		const initCopy = $scope.init;
		$scope.init = function(insight, tileParams) {
			if ($scope.insight) {
				initCopy(insight, tileParams);
			} else {
				//creating new tile
				$scope.newTile = TileUtils.copyNonInsightTile($scope.tile);
				//listing dashboards
				$scope.listDashboards($scope.insight);
			}
		};
	
		/*
		 * Methods used if copying/moving tile to other dashboard
		 */
		$scope.addPinningOrder = function() {
	
			for (var i=0; i<$scope.dashboards.length; i++) {
				if ($scope.dashboards[i].id == $scope.dashboard.id) {
					$scope.pinningOrder = {
						dashboard: $scope.dashboards[i],
						page: $scope.dashboards[i].pages[$scope.uiState.currentPageIdx]
					}
					$scope.pinningOrders = [$scope.pinningOrder];
					break;
				}
			}
		};
	
		$scope.multiPinCallback = function() {
			removeOriginalIfNeeded();
			$timeout(function() {
				const pin = $scope.pinningOrders[0];
				const options = {
					name: pin.dashboard.name,
					tab: 'edit',
					pageId: pin.page.id
				};
				StateUtils.go.dashboard(pin.dashboard.id, $stateParams.projectKey, options).then(function() {
					$rootScope.$broadcast("dashboardSelectLastTile");
				});
			});
		};
	
		/*
		 * Methods used if copying/moving the tile in the current dashboard
		 */
	
		function moveCopyTile(destinationPageId) {
			let destinationPage = null;
			for (let i=0; i<$scope.dashboard.pages.length; i++) {
				if ($scope.dashboard.pages[i].id == destinationPageId || $scope.dashboard.pages[i].$$hashKey == destinationPageId) {
					destinationPage = $scope.dashboard.pages[i];
					break;
				}
			}
	
			function moveCopyTileFront(insightId) {
				const copyTile = angular.copy($scope.tile);
				delete copyTile.$added;
				delete copyTile.$tileId;
				delete copyTile.box.top;
				delete copyTile.box.left;
	
				if (insightId) {
					copyTile.insightId = insightId;
				}
				destinationPage.grid.tiles.push(copyTile);
				removeOriginalIfNeeded();
				$scope.uiState.currentPageIdx = $scope.dashboard.pages.indexOf(destinationPage);
				$scope.uiState.selectedTile = copyTile;
			}
	
			if ($scope.tile.tileType == "INSIGHT" && $scope.keepOriginal && !$scope.pointerMode.mode) {
				DataikuAPI.dashboards.insights.copy($stateParams.projectKey, [$scope.tile.insightId], [$scope.insightName], $scope.dashboard.id)
					.error(setErrorInScope.bind($scope))
					.success(function(data) {
						const insightCopy = data[0];
						$scope.insightsMap[insightCopy.id] = insightCopy;
						moveCopyTileFront(insightCopy.id);
						$scope.dismiss();
					});
			} else {
				moveCopyTileFront();
				$scope.dismiss();
			}
		}
	
		function removeOriginalIfNeeded() {
			if (!$scope.keepOriginal) {
				let tilePosition = -1;
				$scope.page.grid.tiles.find(function (tile, index) { 
					if (tile.insightId === $scope.tile.insightId) {
						tilePosition = index;
						return true;
					}
					return false;
				});
				if (tilePosition != -1) {
					$scope.page.grid.tiles.splice(tilePosition, 1);
				}
			}
		}
	
		/*
		 * Forms methods
		 */
	
		$scope.validate = function() {
			if ($scope.pinningOrder.dashboard.id == $scope.dashboard.id) {
				moveCopyTile($scope.pinningOrder.page.id || $scope.pinningOrder.page.$$hashKey);
			} else {
				$scope.sendPinningOrders();
			}
		};
	
		$scope.checkConsistency = function() {
			if ($scope.keepOriginal) {
				$scope.pointerMode.mode = false;
			}
		};
	
		$scope.getPagesList = function() {
			if (!$scope.pinningOrder) {
				return [];
			} 
	
			if (!$scope.keepOriginal) {
				return $scope.pinningOrder.dashboard.pages.filter(function(page) {
					return $scope.page.id != page.id;
				});
			} else {
				return $scope.pinningOrder.dashboard.pages;
			}
		};
	});
	
	
	app.controller("_MultiPinInsightModalCommonController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $stateParams) {
	
		$scope.existingPinningList = [];
		$scope.pinningOrders = [];
		$scope.initiated = false;
	
		/*
		 * Form initialization
		 */
	
		$scope.init = function(insight, tileParams, payload) {
			//create new tile
            $scope.insight = insight;
            $scope.newTile = $scope.initNewTile(insight, tileParams);
            $scope.payload = payload

			// list dashboards where we could copy it
			$scope.listDashboards(insight);
		};
	
		$scope.initNewTile = function(insight, tileParams) {
			let newTile = TileUtils.newInsightTile(insight);
			if (tileParams) angular.extend(newTile.tileParams, tileParams);
			
			if ($scope.tile) {
				newTile.box = angular.copy($scope.tile.box);
			}

			newTile.box.left = -1;
			newTile.box.top = -1;

			return newTile;
		}
	
		$scope.listDashboards = function(insight) {
			DataikuAPI.dashboards.listEditable($stateParams.projectKey)
				.error(setErrorInScope.bind($scope))
				.success(function(data) {
					$scope.dashboards = data.dashboards;
					$scope.allDashboardsCount = data.allDashboardsCount;
					//listing where insight got already pinned
					if (insight && insight.id) {
						$scope.dashboards.forEach(function(dashboard, index) {
							dashboard.pages.forEach(function(page, pageIndex) {
								page.index = pageIndex;
								page.grid.tiles.forEach(function(tile) {
									if (tile.insightId == insight.id) {
										$scope.existingPinningList.push({
											"dashboard": dashboard,
											"page": page
										});
									}
								});
							});
							// Use local state of current dashboard to take into account slides being added / removed
							if ($scope.dashboard && $scope.dashboard.id === dashboard.id) {
								$scope.dashboards[index] = $scope.dashboard;
							}
						});
					}
					if ($scope.dashboards.length > 0) {
						$scope.addPinningOrder();
					}
					$scope.initiated = true;
				});
		};
	
		/*
		 * PinningOrder CRUD
		 */
	
		$scope.addPinningOrder = function() {
			$scope.pinningOrders.push({
				"dashboard": $scope.dashboards[0],
				"page": $scope.dashboards[0].pages[0],
			});
		};
	
		$scope.removePinningOrder = function(index) {
			$scope.pinningOrders.splice(index, 1);
		};
	
		$scope.getLightPinningOrders = function() {
			const lightPinningOrders = [];
			$scope.pinningOrders.forEach(function(pinningOrder) {
				lightPinningOrders.push({
					dashboardId: pinningOrder.dashboard.id,
					pageId: pinningOrder.page.id
				});
			});
			return lightPinningOrders;
		};
	
		/*
		 * UI
		 */
	
		const pagesLabels = {};
		$scope.getPageLabel = function(dashboard, page) {
			if (page.id && pagesLabels[page.id]) {
				return pagesLabels[page.id];
			}
			let pageLabel = "";
			if (page.title) {
				pageLabel = page.title;
			} else {
				pageLabel = "Slide " + (dashboard.pages.indexOf(page) + 1);
			}
			if (page.id) {
				pagesLabels[page.id] = pageLabel;
			}
			return pageLabel;
		};
	});
	
	
	app.controller("MultiPinInsightModalController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $controller, $stateParams) {
		$controller('_MultiPinInsightModalCommonController', {$scope:$scope});
	
		const initCopy = $scope.init;
		$scope.init = function(insight, tileParams) {
			initCopy(insight, tileParams);
			$scope.pointerMode = {
				mode: insight.type == 'static_file'
			};
		};
	
		$scope.sendPinningOrders = function() {
			const lightPinningOrders = $scope.getLightPinningOrders();
			DataikuAPI.dashboards.multiPin($stateParams.projectKey, $scope.insight.id, $scope.newTile, lightPinningOrders, $scope.pointerMode.mode)
				.error(setErrorInScope.bind($scope))
				.success(function(data) {
					ActivityIndicator.success("Saved!");
					if ($scope.multiPinCallback && typeof($scope.multiPinCallback)==='function') {
						$scope.multiPinCallback();
					}
					$scope.resolveModal();
				});
		};
	});
	
	
	
	app.controller("_CreateAndPinInsightModalCommonController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $controller, $timeout, StateUtils, $rootScope, DashboardUtils, $stateParams) {
		$controller('_MultiPinInsightModalCommonController', {$scope:$scope});
	
		$scope.missingReaderAuthorizations = [];
		$scope.addReaderAuthorization = $scope.projectSummary.canManageDashboardAuthorizations;

		$scope.authorize = function(insights) {
			const neededReaderAuthorizations = insights.map(_ => DashboardUtils.getNeededReaderAuthorization(_));
			
			DataikuAPI.projects.checkReaderAuthorizations($stateParams.projectKey, neededReaderAuthorizations)
			.error(setErrorInScope.bind($scope))
			.success(function(data) {
				$scope.missingReaderAuthorizations = data;
			});
		};
	
		$scope.sendCreateAndPinOrders = function(insights, newTiles, payloads) {
			function save() {
				const lightPinningOrders = $scope.getLightPinningOrders();
				
				DataikuAPI.dashboards.insights.createAndPin($stateParams.projectKey, insights, newTiles, lightPinningOrders, payloads)
				.error(setErrorInScope.bind($scope))
				.success(function(data) {
					ActivityIndicator.success("Saved!");
					if ($scope.pinningOrders.length == 0) {
						StateUtils.go.insight(data[0], $stateParams.projectKey, {name: insights[0].name});
					} else {
						const pin = $scope.pinningOrders[0];
						const options = {
							name: pin.dashboard.name,
							tab: 'edit',
							pageId: pin.page.id
						};
						StateUtils.go.dashboard(pin.dashboard.id, $stateParams.projectKey, options).then(function() {
							$rootScope.$broadcast("dashboardSelectLastTile");
						});
					}
					$scope.resolveModal();
				});
			}
	
			if ($scope.addReaderAuthorization && $scope.missingReaderAuthorizations) {
				DataikuAPI.projects.addReaderAuthorizations($stateParams.projectKey, $scope.missingReaderAuthorizations)
				.success(save)
				.error(setErrorInScope.bind($scope));
			} else {
				save();
			}
		};
	});

	app.controller("CreateAndPinInsightModalController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $controller, $timeout, StateUtils, $rootScope, DashboardUtils, $stateParams) {
		$controller('_CreateAndPinInsightModalCommonController', {$scope:$scope});
	
		const initCopy = $scope.init;
		$scope.init = function(insight, tileParams, payload) {
			initCopy(insight, tileParams, payload)
			$scope.authorize([insight]);
		}

		const sendOrders = $scope.sendCreateAndPinOrders;
		$scope.sendCreateAndPinOrders = function() {
			sendOrders([$scope.insight], [$scope.newTile], [$scope.payload]);
		};
	});

	app.controller("CreateAndPinInsightsModalController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $controller, $timeout, StateUtils, $rootScope, DashboardUtils, $stateParams) {
		$controller('_CreateAndPinInsightModalCommonController', {$scope:$scope});
	
		$scope.insights = [];
		$scope.newTiles = [];
		$scope.insightData = [];

		$scope.init = function(insights, tileParams) {
            //create new tile
            insights.forEach(insight => {
                $scope.insights.push(insight);
                $scope.newTiles.push($scope.initNewTile(insight, tileParams));
            });
			// list dashboards where we could copy it
			$scope.listDashboards($scope.insights[0]);
			$scope.authorize(insights);
		};
	
		const sendOrders = $scope.sendCreateAndPinOrders;
		$scope.sendCreateAndPinOrders = function() {
			let insights = $scope.insights.filter((_, i) => $scope.insightData.items[i].selected);
			let newTiles = $scope.newTiles.filter((_, i) => $scope.insightData.items[i].selected);
			sendOrders(insights, newTiles);
		};

		$scope.canCreate = function() {
			return $scope.insightData.items && $scope.insightData.items.some(_ => _.selected);
		}
	});
	
})();
	

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    var hasFacetDimension = function(insight) {
        return insight.params && insight.params.def && insight.params.def.facetDimension && insight.params.def.facetDimension.length > 0;
    };

    app.constant("ChartInsightHandler", {
        name: "Chart",
        desc: "Visualize data from your source",
        icon: 'icon-dku-nav_dashboard',
        color: 'chart',

        sourceType: 'DATASET',
        getSourceId: function(insight) {
            return insight.params.datasetSmartName;
        },
        hasEditTab: true,
        goToEditAfterCreation: true,
        getDefaultTileParams: function(insight) {
            return {
                showXAxis: true,
                showYAxis: true,
                showLegend: false,
                showTooltips: true,
                autoPlayAnimation: true
            };
        },
        getDefaultTileDimensions(insight) {
            if (insight && hasFacetDimension(insight)) {
                return [5, 4];
            }
            return [2, 2];
        }
    });

    app.directive('chartInsightTile', function($controller, ChartRequestComputer, MonoFuture, LabelsController, ChartChangeHandler, DashboardUtils, InsightLoadingState, InsightLoadingBehavior){
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $scope.disableChartInteractivityGlobally = true;
                $scope.DashboardUtils = DashboardUtils;

                var origLegendPlacement = $scope.insight.params.def.legendPlacement;

                $controller('ChartInsightViewCommon', {$scope: $scope});

                $scope.noClickableTooltips = true;
                $scope.legends = [];
                $scope.animation = {};
                $scope.tooltips = {};
                $scope.noCoachmarks = true;
                $scope.chartSpecific = {};

                $scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.loadedCallback = function() {
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.COMPLETE;
                };
                $scope.load = function(resolve, reject) {

                    var successRoutine = DashboardUtils.setLoaded.bind([$scope, resolve]);
                    var errorRoutine = DashboardUtils.setError.bind([$scope, reject]);
                    var unconfiguredRoutine = DashboardUtils.setUnconfigured.bind([$scope, reject]);

                    ChartChangeHandler.fixupChart($scope.insight.params.def);
                    if ($scope.origInsight) ChartChangeHandler.fixupChart($scope.origInsight.params.def);

                    LabelsController($scope);
                    $scope.loading = true;
                    $scope.fetchColumnsSummary($scope.insight.projectKey).success(function() {
                        var request;
                        try {
                            request = ChartRequestComputer.compute($scope.insight.params.def, element.width(), element.height(), $scope.chartSpecific);
                        } catch (e) {}

                        if (!request) {
                            unconfiguredRoutine();
                        } else {
                            var executePivotRequest = MonoFuture($scope).wrap($scope.getExecutePromise);
                            executePivotRequest(request).update(function(data) {
                                $scope.request = request;
                                $scope.response = data;
                            }).success(function(data) {
                                $scope.request = request;
                                $scope.response = data;
                                successRoutine();
                                if (typeof(resolve)==="function") resolve();
                            }).error(function(data, status, headers, config, statusText){
                                errorRoutine(data, status, headers, config, statusText);
                                if (typeof(reject)==="function") reject();
                            });
                        }
                    }).error(function(data, status, headers, config, statusText) {
                        errorRoutine(data, status, headers, config, statusText);
                        if (typeof(reject)==="function") reject();
                    });
                    return InsightLoadingBehavior.DELAYED_COMPLETE;
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }

                $scope.$watch("tile.tileParams", function(nv) {
                    if (!nv) return;
                    $scope.noXAxis = !nv.showXAxis;
                    $scope.noYAxis = !nv.showYAxis;
                    $scope.noTooltips = !nv.showTooltips;
                    $scope.autoPlayAnimation = nv.autoPlayAnimation;
                    if ($scope.chart) {
                        $scope.chart.def.originLegendPlacement = origLegendPlacement;
                        if (!nv.showLegend) {
                            $scope.chart.def.legendPlacement = 'SIDEBAR';
                        } else {
                            $scope.chart.def.legendPlacement = origLegendPlacement;
                        }
                        $scope.chart.def.showXAxis = nv.showXAxis;
                    }
                    $scope.$broadcast('redraw');
                }, true);
            }
        };
    });

    app.directive('chartInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_tile_params.html',
            scope: {
                tileParams: '=',
                insight: '='
            },
            link: function($scope, element, attrs){
                $scope.$watch("insight", function(nv) {
                    if (!nv) return;
                    $scope.noAxis = ["pie", "scatter_map", "grid_map", "admin_map", "pivot_table", ]
                        .indexOf($scope.insight.params.def.type) != -1;
                    $scope.noLegend = ["pivot_table", "binned_xy", "lift"]
                        .indexOf($scope.insight.params.def.type) != -1 || $scope.insight.params.def.originLegendPlacement === 'SIDEBAR';
                    $scope.noAnimation = $scope.insight.params.def.animationDimension.length === 0;
                })
            }
        };
    });

    app.directive('chartInsightCreateForm', function(DataikuAPI, ChartChangeHandler, DatasetChartsUtils){
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $scope.hook.beforeSave = function(resolve, reject) {
                    DataikuAPI.explores.get($scope.insight.projectKey, $scope.insight.params.datasetSmartName)
                        .success(function(data) {
                            $scope.insight.params.refreshableSelection = DatasetChartsUtils.makeSelectionFromScript(data.script);
                            $scope.insight.params.def = ChartChangeHandler.defaultNewChart();
                            $scope.insight.params.engineType = "LINO";

                            resolve();
                        })
                        .error(function(data, status, headers, config, statusText){
                            reject(arguments);
                        });
                };

                $scope.$watch("insight.params.datasetSmartName", function(nv) {
                    if (!nv) return;
                    $scope.insight.name = "Chart on " + $scope.insight.params.datasetSmartName;
                })
            }
        };
    });

    app.controller('ChartInsightViewCommon', function($scope, DataikuAPI, $stateParams, $controller, ActiveProjectKey) {
        $controller('ShakerChartsCommonController', {$scope: $scope});

        $scope.isProjectAnalystRW = function() {
            return true;
        };

        $scope.resolvedDataset = resolveDatasetFullName($scope.insight.params.datasetSmartName, ActiveProjectKey.get());

        // Needed by chart directives
        $scope.chart = {
            def: $scope.insight.params.def,
            refreshableSelection: $scope.insight.params.refreshableSelection,
            engineType : $scope.insight.params.engineType
        };

        if ($scope.tile) {
            $scope.chart.def.showLegend = $scope.tile.tileParams.showLegend;
            $scope.chart.def.showXAxis = $scope.tile.tileParams.showXAxis;
        }

        function getDataSpec(){
            return {
                datasetProjectKey: $scope.resolvedDataset.projectKey,
                datasetName: $scope.resolvedDataset.datasetName,
                copyScriptFromExplore: true,
                copySelectionFromScript: false,
                sampleSettings : $scope.insight.params.refreshableSelection,
                engineType : $scope.insight.params.engineType
            };
        }

        $scope.getExecutePromise = function(request) {
            if(request) {
                request.maxDataBytes = $scope.insight.params.maxDataBytes;
                const projectKey = $scope.insight.projectKey || ActiveProjectKey.get();
                return DataikuAPI.shakers.charts.getPivotResponse(
                    projectKey, getDataSpec(),
                    request,
                    $scope.chart.summary.requiredSampleId).noSpinner();
            }
        };

        $scope.fetchColumnsSummary = function(projectKey){
            // get columns summary
            if (!projectKey) projectKey  = ActiveProjectKey.get();
            return DataikuAPI.shakers.charts.getColumnsSummary(projectKey, getDataSpec())
                .noSpinner()
                .success(function(data) {
                    $scope.chart.summary = data;
                    $scope.makeUsableColumns(data);
                }).error(setErrorInScope.bind($scope));
        };

        // chartHandler options
        $scope.noThumbnail = true;
    });

    app.directive('chartInsightView', function($controller, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $scope.disableChartInteractivityGlobally = true;
                $controller('ChartInsightViewCommon', {$scope: $scope});
                $controller("ChartsCommonController", {$scope:$scope});

                $scope.noClickableTooltips = true;
                $scope.noCoachmarks = true;
                $scope.readOnly = true;
                $scope.bigChart = true;
                $scope.bigChartDisabled = true;
                $scope.legendsShown = true;
                $scope.saveChart = function() {};

                $scope.fetchColumnsSummary().then(function(){
                    $scope.forceExecuteChartOrWait();
                })
            }
        };
    });

    app.directive('chartInsightEdit', function($controller, $stateParams, DataikuAPI, $timeout, $rootScope) {
        return {
            templateUrl: '/templates/dashboards/insights/chart/chart_edit.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('ChartInsightViewCommon', {$scope: $scope});
                $controller("ChartsCommonController", {$scope:$scope});

                $scope.currentInsight = $scope.insight;
                $scope.appConfig = $rootScope.appConfig;
                $scope.uiDisplayState = {};

                $scope.bigChart = false;
                $scope.saveChart = function() {};

                $scope.saveChart = function(){
                    DataikuAPI.dashboards.insights.save($scope.insight)
                        .error(setErrorInScope.bind($scope))
                        .success(function () {});
                };

                function fetchSummaryAndExecute(){
                    $scope.fetchColumnsSummary().then(function(){
                        $scope.forceExecuteChartOrWait();
                    })
                }

                $scope.$watch("chart.engineType", function(nv) {
                    if (!nv) return;
                    $scope.insight.params.engineType = nv;
                });

                $scope.$on('chartSamplingChanged', function() {
                    $scope.summary = null;
                    fetchSummaryAndExecute();
                    $scope.saveChart();
                });

                DataikuAPI.datasets.get($scope.resolvedDataset.projectKey, $scope.resolvedDataset.datasetName, $stateParams.projectKey)
                .success(function(data) {
                    $scope.dataset = data;
                    fetchSummaryAndExecute();
                }).error(setErrorInScope.bind($scope));

                $scope.$watch("chart.def.name", function(nv, ov) {
                    if ($scope.insight.name == "Chart on " + $scope.insight.params.datasetSmartName
                        || $scope.insight.name == ov + " on " + $scope.insight.params.datasetSmartName) {
                        $scope.insight.name = nv + " on " + $scope.insight.params.datasetSmartName
                    }
                })

            }
        };
    });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("DatasetTableInsightHandler", {
        name: "Dataset",
        nameForTileParams: "Dataset table",
        desc: "Partial or whole datatable",
        icon: 'icon-table',
        color: 'dataset',

        sourceType: 'DATASET',
        getSourceId: function(insight) {
            return insight.params.datasetSmartName;
        },
        hasEditTab: true,
        defaultTileParams: {
            showName: true,
            showDescription: true,
            showCustomFields: true,
            showMeaning: false,
            showProgressBar: false
        },
        defaultTileSize: [],
        defaultTileDimensions: [6, 3]
    });

    app.controller('DatasetTableViewCommon', function($scope, DataikuAPI, $stateParams) {
        $scope.resolvedDataset = resolveDatasetFullName($scope.insight.params.datasetSmartName,  $stateParams.projectKey);

    });

    app.directive('datasetTableInsightTile', function($controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
            	$controller('DatasetTableViewCommon', {$scope: $scope});

                $scope.ngShowLoaded = true;

            	$scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                    $scope.refreshNoSpinner = true;
                    $scope.refreshTableDone = DashboardUtils.setLoaded.bind([$scope, resolve]);
                    $scope.refreshTableFailed = DashboardUtils.setError.bind([$scope, reject]);
                    $scope.loading = true;
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('datasetTableInsightView', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_view.html',
            scope: {
                insight: '=',
                tileParams: '='
            },
            link: function($scope, element, attrs) {
                $controller('DatasetTableViewCommon', {$scope: $scope});
            }
        };
    });


    app.directive('datasetTableInsightEdit', function($controller, DataikuAPI, SmartId, WT1, $stateParams, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_edit.html',
            scope: true,
            link: function($scope, element, attrs) {
                $controller('DatasetTableViewCommon', {$scope: $scope});
            }
        };
    });


    app.directive("shakerExploreInsight", function($filter, $timeout, $q, Assert, DataikuAPI, WT1, SmartId) {
        return {
            scrope: true,
            controller: function ($scope, $stateParams, $state) {

                var resolvedDataset = SmartId.resolve($scope.insight.params.datasetSmartName);

                /* ********************* Callbacks for shakerExploreBase ******************* */

                $scope.shakerHooks.saveForAuto = function() {
                    $scope.insight.params.shakerScript = $scope.getShakerData();
                };

                $scope.inInsight = true;

                $scope.shakerHooks.setColumnMeaning = function(column, newMeaning){
                };

                $scope.shakerHooks.getSetColumnStorageTypeImpact = function(column, newType) {
                    return null;
                };
                $scope.shakerHooks.setColumnStorageType = function(column, newType, actionId){
                };

                $scope.shakerHooks.updateColumnDetails = function(column) {
                };

                $scope.setSpinnerPosition = function() {}

                /* ********************* Main ******************* */

                // Set base context and call baseInit
                Assert.inScope($scope, 'shakerHooks');

                $scope.table = null;
                $scope.scriptId = "__pristine__";
                $scope.shakerWithSteps = false;
                $scope.shakerWritable = false;
                $scope.shakerReadOnlyActions = true;
                $scope.inputDatasetProjectKey = resolvedDataset.projectKey;
                $scope.inputDatasetName = resolvedDataset.id;
                $scope.inputDatasetSmartName = $scope.insight.params.datasetSmartName;

                WT1.event("shaker-explore-open");

                $scope.shaker = $scope.insight.params.shakerScript;
                $scope.shakerState.writeAccess = true;
                $scope.shaker.origin = "DATASET_EXPLORE";
                if ($scope.origInsight) {
                    $scope.origInsight.params.shakerScript.origin = "DATASET_EXPLORE";
                }

                if ($scope.tile) {
                    $scope.shaker.$headerOptions = $scope.tile.tileParams;
                } else {
                    $scope.shaker.$headerOptions = {
                        showName: true,
                        showMeaning: true,
                        showDescription: true,
                        showCustomFields: true,
                        showProgressBar: true
                    };
                }

                $scope.fixupShaker();
                if ($scope.origInsight) {
                    $scope.fixupShaker($scope.origInsight.params.shakerScript);
                }
                $scope.requestedSampleId = null;
                $scope.refreshTable(false);
            }
        };
    });

    app.directive('datasetTableInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_tile_params.html',
            scope: {
                tileParams: '=',
                insight: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('datasetTableInsightCreateForm', function(DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/dataset_table/dataset_table_create_form.html',
            scope: true,
            link: function($scope, element, attrs) {

                $scope.hook.beforeSave = function(resolve, reject) {
                    DataikuAPI.explores.get($scope.insight.projectKey, $scope.insight.params.datasetSmartName)
                        .success(function(data) {
                            $scope.insight.params.shakerScript = data.script;
                            resolve();
                        })
                        .error(function(data, status, headers, config, statusText){
                            reject(arguments);
                        });
                };

                $scope.hook.defaultName = "Dataset table";
                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !nv.label) return;
                    $scope.hook.defaultName = nv.label + " table";
                });
            }
        };
    });

})();

(function () {
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("EdaInsightHandler", {
        name: "Eda",
        nameForTileParams: "Eda",
        desc: "Eda",
        icon: 'icon-dku-statistics',
        color: '',

        getSourceId: function (insight) {
            return insight.params.dataSpec.inputDatasetSmartName;
        },
        getSourceType: function (insight) {
            return 'DATASET';
        },
        hasOptions: false,
        hasEditTab: true,
        defaultTileSize: [],
        defaultTileDimensions: [10, 5]
    });

    app.controller('EdaInsightViewCommon', function ($scope, $controller, DataikuAPI, $stateParams, $timeout) {
        $scope.insightContentURL = '/dip/api/dashboards/insights/view-eda?'
            + 'projectKey=' + $scope.insight.projectKey
            + '&insightId=' + $scope.insight.id
            + '&cacheBusting=' + new Date().getTime()

        $scope.loadHTML = function (element, resolve, reject) {
            if (typeof (resolve) === "function") resolve();
        };
    });

    app.directive('edaInsightTile', function ($controller, InsightLoadingState) {
        return {
            templateUrl: '/templates/dashboards/insights/eda/eda_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function ($scope, element, attrs) {
                $controller('EdaInsightViewCommon', { $scope: $scope });

                $scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function (resolve, reject) {
                    $scope.loading = true;
                    $scope.loadHTML(element,
                        function () {
                            $scope.loading = false;
                            $scope.loaded = true;
                            $scope.error = null;
                            if ($scope.hook && $scope.hook.isErrorMap) {
                                $scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                            }
                            if (typeof (resolve) === "function") resolve();
                        }, function (data, status, headers, config, statusText) {
                            $scope.loading = false;
                            $scope.loaded = false;
                            $scope.error = data;
                            if ($scope.hook && $scope.hook.isErrorMap) {
                                $scope.hook.isErrorMap[$scope.tile.$tileId] = true;
                            }
                            $scope.hook.setErrorInDashboardPageScope(data, status, headers, config, statusText);
                            if (typeof (reject) === "function") reject();
                        }
                    );
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('edaInsightView', function ($controller) {
        return {
            templateUrl: '/templates/dashboards/insights/eda/eda_view.html',
            scope: true,
            link: function ($scope, element, attrs) {
                $controller('EdaInsightViewCommon', { $scope: $scope });
                $scope.loadHTML(element);
            }
        };
    });

    app.directive('edaInsightEdit', function($controller, $stateParams, DataikuAPI, $timeout, $rootScope) {
        return {
            templateUrl: '/templates/dashboards/insights/eda/eda_edit.html',
            scope: {
                insight: '='
            },
            link: function ($scope, element, attrs) {
                $controller('EdaInsightViewCommon', { $scope: $scope });
                $scope.loadHTML(element);
                $scope.onInsightChange = function( {card, result, dataSpec} ) {
                    var newInsight = _.cloneDeep($scope.insight);
                    newInsight.params.card = card;
                    newInsight.params.dataSpec = dataSpec;
                    DataikuAPI.dashboards.insights.save(newInsight, undefined, JSON.stringify(result))
                        .error(setErrorInScope.bind($scope))
                        .success(function () {
                            $scope.insight = newInsight;
                        });
                }
            }
        }
    });
})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("JupyterInsightHandler", {
        name: "Notebook",
        desc: "Code analysis",
        icon: 'icon-dku-nav_notebook',
        color: 'notebook',

        getSourceId: function(insight) {
            return insight.params.notebookSmartName;
        },
        sourceType: 'JUPYTER_NOTEBOOK',
        hasEditTab: false,
        defaultTileParams: {
            showCode: false
        },
        defaultTileDimensions: [4, 5]
    });

    app.controller('JupyterInsightCommonController', function($scope, DataikuAPI, $stateParams, $timeout) {

    	$scope.getLoadingPromise = function() {
        	if ($scope.insight.params.loadLast) {
        		return DataikuAPI.jupyterNotebooks.export.getLast($scope.insight.projectKey, $scope.insight.params.notebookSmartName);
        	} else {
        		return DataikuAPI.jupyterNotebooks.export.get($scope.insight.projectKey, $scope.insight.params.notebookSmartName, $scope.insight.params.exportTimestamp);
        	}
    	};

    	$scope.displayExport = function(element, html, showCode, pointer) {
    		if (html) {
    			$scope.exportNotFound = false;
            	$timeout(function() {
                	showHTML(element, html, showCode, pointer);
                }, 0);
            } else {
            	$scope.exportNotFound = true;
            }
    	}

    	var showHTML = function(element, html, showCode, pointer) {
            var $iframe = element.find('iframe'), iframe = $iframe[0], $parent = $iframe.parent();
            if (iframe && (iframe.document || iframe.contentDocument)) {
            	var doc = iframe.document || iframe.contentDocument;
                doc.open();
                if (showCode != null) {
                    html = html.replace("<a id='toggleCode' onclick='toggleCodeVisibility()'>Show code</a>", "");
                    if (showCode) {
                        html = html.replace('<body class="hideCode">', '<body>');
                    } else {
                        html = html.replace('<body>', '<body class="hideCode">');
                    }

                    if (pointer) {
                        html = html.replace('<body', '<body style="cursor: pointer;" onload="_load()"');
                    }
                }
                html = html.replace("</body>", "<style>div.output_subarea { max-width: none; } ::-webkit-scrollbar { -webkit-appearance: none; width: 5px; height: 7px; } ::-webkit-scrollbar-thumb { border-radius: 4px; background-color: rgba(0,0,0,.4); box-shadow: 0 0 1px rgba(255,255,255,.5); }</style></body>")
                doc.writeln(html);
                doc.close();
            }
    	}

    });

    app.directive('jupyterInsightTile', function($stateParams, $timeout, DataikuAPI, $controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
            	$controller('JupyterInsightCommonController', {$scope: $scope});

                var html;

                $scope.loaded = false;
            	$scope.loading = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                	$scope.loading = true;
                	var loadingPromise = $scope.getLoadingPromise().noSpinner();
                	//any case write in iframe to display html
                	loadingPromise
                        .success(DashboardUtils.setLoaded.bind([$scope, resolve]))
                        .success(function(data) {
                            html = data.html; $scope.displayExport(element, html, !!$scope.tile.tileParams.showCode, $scope.tile.clickAction != 'DO_NOTHING');

                            if ($scope.tile.clickAction != 'DO_NOTHING') {
                                // On click on body, redirect event to main-click link
                                $timeout(function() {
                                    element.find('iframe')[0].contentWindow._load = function() {
                                        element.find('iframe').contents().find('body').on('click', function(evt) {
                                            if(evt.originalEvent.preventRecursionMarker === 'norec') {
                                                // Prevent event recursion : do not handle this event if we generated it!
                                                return;
                                            }
                                            var cloneEvent = document.createEvent('MouseEvents');
                                            cloneEvent.preventRecursionMarker = 'norec';
                                            var e = evt.originalEvent;
                                            cloneEvent.initMouseEvent(e.type, e.bubbles, e.cancelable, window, e.detail,
                                                e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey,
                                                e.metaKey, e.button, e.relatedTarget);
                                            element.closest('.tile-wrapper').find('[main-click]')[0].dispatchEvent(cloneEvent);
                                            e.stopPropagation();
                                        });
                                    }
                                });
                            }
                        })
                        .error(DashboardUtils.setError.bind([$scope, reject]));
                };

                if ($scope.tile.autoLoad) {
                	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }

                $scope.$watch("tile.tileParams.showCode", function (nv) {
                    if (nv == null || !$scope.loaded) return;
                    $scope.displayExport(element, html, !!nv);
                });
            }
        };
    });

    app.directive('jupyterInsightView', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_view.html',
            scope: {
                insight: '=',
                tileParams: '='
            },
            link: function($scope, element, attrs) {
                $controller('JupyterInsightCommonController', {$scope: $scope});

                var loadingPromise = $scope.getLoadingPromise();
            	//any case write in iframe to display html
            	loadingPromise.success(function(data) {
            		$scope.displayExport(element, data.html);
            	}).error(function(data, status, headers, config, statusText) {
                	setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                });

            }
        };
    });

    app.directive('jupyterInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('jupyterInsightCreateForm', function(DataikuAPI, $filter, $stateParams){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_create_form.html',
            scope: true,
            link: function($scope, element, attrs){

                $scope.hook.defaultName = "Jupyter notebook";
                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !nv.label) return;
                    $scope.hook.defaultName = nv.label;
                });

            	$scope.insight.params.loadLast = true;

                $scope.facade = {
            		notebookSmartName : null,
                    availableExports : [],
                    createExport : $scope.canWriteProject()
                };

                $scope.setNotebook = function() {
                    if (!$scope.facade.notebookSmartName) return;
                	$scope.insight.params.notebookSmartName = $scope.facade.notebookSmartName;
                	$scope.facade.availableExports = $scope.notebookToExportsMap[$scope.facade.notebookSmartName];
                };

                $scope.$watch("facade.notebookSmartName", $scope.setNotebook);

                $scope.hook.beforeSave = function(resolve, reject) {
                	if ($scope.facade.createExport) {
                		DataikuAPI.jupyterNotebooks.export.create($stateParams.projectKey, $scope.insight.params.notebookSmartName)
                		.success(function(data) {
                			if (!$scope.insight.params.loadLast) {
                				$scope.insight.params.exportTimestamp = data.timestamp;
                			}
                			resolve();
                		})
                		.error(function(data, status, headers, config, statusText){
                        	reject(arguments);
                        });
                	} else {
                		resolve();
                	}
                };

                $scope.checkLoadLastAndTimestampConsistency = function() {
                	if (!$scope.insight.params.loadLast && !$scope.insight.params.exportTimestamp && !$scope.facade.createExport) {
                		$scope.newInsightForm.$setValidity('loadLastAndTimestampConsistency',false);
                	} else {
                		$scope.newInsightForm.$setValidity('loadLastAndTimestampConsistency',true);
                	}
                	return true;
                };

                $scope.formatDate = function(timestamp) {
                	return $filter('date')(timestamp, 'short');
                };

                $scope.resetTimestamp = function() {
                	$scope.insight.params.exportTimestamp = null;
                };

                DataikuAPI.jupyterNotebooks.mapNotebooksToExports($scope.insight.projectKey).success(function(data) {
                    $scope.notebookMap = data.first;
                    $scope.notebookToExportsMap = data.second;
                }).error($scope.hook.setErrorInModaleScope);
            }
        };
    });

    app.directive('jupyterInsightEdit', function($controller, DataikuAPI, $rootScope, Dialogs){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_edit.html',
            scope: {
                insight: '=',
            },
            link: function($scope, element, attrs) {
                $controller('JupyterInsightCommonController', {$scope: $scope});

                $scope.canWriteProject = $rootScope.topNav.isProjectAnalystRW;

                DataikuAPI.jupyterNotebooks.export.list($scope.insight.projectKey, $scope.insight.params.notebookSmartName).success(function(data) {
                    $scope.exports = data;
                });

                function refresh() {
                    if (!$scope.insight.params) return;
                    if (!$scope.insight.params.loadLast && !$scope.insight.params.exportTimestamp) {
                        $scope.insight.params.exportTimestamp = $scope.exports[0].timestamp;
                    }

                    var loadingPromise = $scope.getLoadingPromise();
                    //any case write in iframe to display html
                    loadingPromise.success(function(data) {
                        $scope.displayExport(element, data.html);
                    }).error(function(data, status, headers, config, statusText) {
                        setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                    });
                }

                $scope.$watch("insight.params", refresh, true);

                $scope.createNewExport = function() {
                    Dialogs.confirmPositive($scope, "Export Jupyter notebook",
                        "Create a new export of this Jupyter notebook? Note that it will not rerun the code of this notebook "+
                        "and will use the last saved state. To rerun the notebook, go to the notebook or use a DSS scenario").then(function(){
                        DataikuAPI.jupyterNotebooks.export.create($scope.insight.projectKey, $scope.insight.params.notebookSmartName)
                            .success(function(data) {
                                if (!$scope.insight.params.loadLast) {
                                    $scope.insight.params.exportTimestamp = data.timestamp;
                                }
                                refresh();
                                $scope.exports.unshift(data);
                            }).error(function(data, status, headers, config, statusText) {
                                setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                            });
                    });
                }
            }
        };
    });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');


    app.constant("ScenarioInsightHandler", {
        name: "Scenario",
        desc: "Run button or activity report of a scenario",
        icon: 'icon-list',
        color: 'scenario'
    });

    app.constant("ScenarioLastRunsInsightHandler", {

        icon: 'icon-list',
        color: 'scenario',
        name: 'Scenario last runs',

        getSourceId: function(insight) {
            return insight.params.scenarioSmartId;
        },
        sourceType: 'SCENARIO',
        hasEditTab: false,
        defaultTileParams: {
            displayMode: 'SIMPLE',
            range: 'CURRENT_MONTH'
        },
        defaultTileShowTitleMode: 'MOUSEOVER',
        defaultTileDimensions: [12, 1]
    });

    app.constant("ScenarioRunButtonInsightHandler", {

        icon: 'icon-list',
        color: 'scenario',
        name: 'Scenario run button',

        getSourceId: function(insight) {
            return insight.params.scenarioSmartId;
        },
        sourceType: 'SCENARIO',
        hasEditTab: false,
        defaultTileParams: {
        },
        defaultTileDimensions: [2, 2],
        accessMode: 'RUN'
    });

    app.controller('ScenarioLastRunsViewCommon', function($scope) {
        $scope.resolveRange = function(range) {
            var to, from;
            switch(range) {
                case 'CURRENT_DAY':
                    to = moment();
                    from = moment().startOf('day');
                    break;
                case 'PREVIOUS_DAY':
                    from = moment().subtract(1, 'day').startOf('day');
                    to = moment().subtract(1, 'day').endOf('day');
                    break;
                case 'LAST_NIGHT':
                    to = moment().set({'hours': 9, 'second': 0, 'millisecond': 0});
                    from = moment().subtract(1, 'day').set({'hours': 17, 'second': 0, 'millisecond': 0});
                    break;
                case 'CURRENT_WEEK':
                    to = moment();
                    from = moment().startOf('week');
                    break;
                case 'PREVIOUS_WEEK':
                    from = moment().subtract(1, 'week').startOf('week');
                    to = moment().subtract(1, 'week').endOf('week');
                    break;
                case 'CURRENT_MONTH':
                    to = moment();
                    from = moment().startOf('month');
                    break;
                case 'PREVIOUS_MONTH':
                    from = moment().subtract(1, 'month').startOf('month');
                    to = moment().subtract(1, 'month').endOf('month');
                    break;
                default:
                    throw "Unexpected range: " + range;
            }
            return {to: to.format(), from: from.format()};
        };


        $scope.ranges = [
            'CURRENT_DAY',
            'LAST_NIGHT',
            'PREVIOUS_DAY',
            'CURRENT_WEEK',
            'PREVIOUS_WEEK',
            'CURRENT_MONTH',
            'PREVIOUS_MONTH'
        ];
    });

    app.directive('scenarioLastRunsInsightTile', function($stateParams, $timeout, DataikuAPI, $controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_last_runs/scenario_last_runs_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
            	
            	$controller('ScenarioTimelineControllerCommon', {$scope: $scope});
                $controller('ScenarioLastRunsViewCommon', {$scope: $scope});

                $scope.scenarioId = $scope.insight.params.scenarioSmartId;
        		$scope.uiState.viewMode = $scope.insight.params.viewMode;

            	$scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                	$scope.loading = true;

                    $scope.$watch("tile.tileParams.range", function(nv) {
                        if (!nv) return;

                        var resolvedRange = $scope.resolveRange($scope.tile.tileParams.range);
                        DataikuAPI.scenarios.getScenarioReport($scope.insight.projectKey, $scope.insight.params.scenarioSmartId, resolvedRange.from, resolvedRange.to)
                            .noSpinner()
                            .success($scope.setScenarioGantt)
                            .success(DashboardUtils.setLoaded.bind([$scope, resolve]))
                            .error(DashboardUtils.setError.bind([$scope, reject]));
                    });

                };
                
                if ($scope.tile.autoLoad) {
                	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
                
            }
        };
    });

    app.directive('scenarioLastRunsInsightView', function($controller, DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_last_runs/scenario_last_runs_view.html',
            scope: {
                insight: '=',
                tileParams: '='
            },
            link: function($scope, element, attrs) {
            	$controller('ScenarioTimelineControllerCommon', {$scope: $scope});
                $controller('ScenarioLastRunsViewCommon', {$scope: $scope});

                $scope.editable = true;
                $scope.scenarioId = $scope.insight.params.scenarioSmartId;
                $scope.uiState.range = "CURRENT_MONTH";

                $scope.$watch("uiState.range", function(nv) {
                    if (!nv) return;
                    var resolvedRange = $scope.resolveRange($scope.uiState.range);

                    DataikuAPI.scenarios.getScenarioReport($scope.insight.projectKey, $scope.insight.params.scenarioSmartId, resolvedRange.from, resolvedRange.to).success(function(data){
                        $scope.setScenarioGantt(data);
                    }).error(function(data, status, headers, config, statusText) {
                        setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                    });
                });
            }
        };
    });

    app.directive('scenarioLastRunsInsightTileParams', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_last_runs/scenario_last_runs_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
                $controller('ScenarioLastRunsViewCommon', {$scope: $scope});
            }
        };
    });

    app.directive('scenarioInsightCreateForm', function(DataikuAPI, $filter, $controller){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_last_runs/scenario_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $controller('ScenarioLastRunsViewCommon', {$scope: $scope});

                $scope.insight.type = 'scenario_last_runs';
                $scope.insight.params.viewMode = 'TIMELINE';
                $scope.insight.params.range = 'CURRENT_DAY';
                $scope.hook.defaultName = "Scenario";

                function updateDefaultName() {
                    if ($scope.insight.type == 'scenario_last_runs') {
                        $scope.hook.defaultName = $filter('niceConst')($scope.insight.params.viewMode) + ' view of scenario';
                    } else if ($scope.insight.type == 'scenario_run_button') {
                        $scope.hook.defaultName = 'Run scenario';
                    } else {
                        $scope.hook.defaultName = 'Scenario';
                    }
                    if ($scope.hook.sourceObject && $scope.hook.sourceObject.label) {
                        $scope.hook.defaultName += ' ' + $scope.hook.sourceObject.label;
                    }
                }
                $scope.$watch("hook.sourceObject", updateDefaultName);
                $scope.$watch("insight.params.viewMode", updateDefaultName);
                $scope.$watch("insight.type", updateDefaultName);
            }
        };
        
    });


    app.directive('scenarioRunButtonInsightTile', function($stateParams, $timeout, DataikuAPI, WT1, Notification, SmartId, ScenarioUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_run_button/scenario_run_button_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){

                $scope.getTriggerName = ScenarioUtils.getTriggerName;

                // Check if there is a loading scenario
                function refreshScenarioRunState(resolve, reject) {
                    return DataikuAPI.scenarios.getLastScenarioRuns($scope.insight.projectKey, $scope.insight.params.scenarioSmartId, true, 1)
                        .success(function(data) {
                            $scope.lastRun = data[0];
                            $scope.runStarting = false;
                            $scope.scenario = data.scenario;
                            $scope.loading = false;
                            $scope.loaded = true;
                            if (resolve) resolve();
                        })
                        .error($scope.hook.setErrorInDashboardPageScope.bind($scope))
                        .error(function() {
                            $scope.loading = false;
                            if (reject) reject();
                        }).noSpinner();
                }

                $scope.load = function(resolve, reject) {
                    $scope.loading = true;

                    var resolvedScenario = SmartId.resolve($scope.insight.params.scenarioSmartId);

                    refreshScenarioRunState(resolve, reject)
                        .success(function() {
                            var unRegister = Notification.registerEvent("scenario-state-change", function(evt, message) {
                                if (message.scenarioId != resolvedScenario.id || message.projectKey != resolvedScenario.projectKey) return;
                                refreshScenarioRunState();
                            });
                            $scope.$on("$destroy", unRegister);
                        });
                };

                $scope.abort = function(resolve, reject) {
                    DataikuAPI.futures.abort($scope.lastRun.futureId);
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }

                $scope.runNow = function() {
                    $scope.runStarting = true;
                    WT1.event("scenario-manual-run-from-dashboard");
                    DataikuAPI.scenarios.manualRun($scope.insight.projectKey, $scope.insight.params.scenarioSmartId)
                        .success(function(data){})
                        .error(function(data, status, headers, config, statusText) {
                            $scope.runStarting = false;
                            $scope.hook.setErrorInDashboardPageScope.bind($scope)(data, status, headers, config, statusText);
                        });
                }
            }
        };
    });

    app.directive('scenarioRunButtonInsightTileParams', function(DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_run_button/scenario_run_button_tile_params.html',
            scope: {
                tileParams: '='
            }
        };
    });
    
})();

(function() {
'use strict';

const app = angular.module('dataiku.dashboards.insights');


app.constant("DiscussionsInsightHandler", {
    name: "discussions",
    desc: "Discussions feed on an object",
    icon: 'icon-comments-alt',
    color: 'discussions',

    getSourceId: function(insight) {
        return insight.params.objectId;
    },
    getSourceType: function(insight) {
        return insight.params.objectType;
    },

    hasEditTab: false,
    defaultTileParams: {
    },
    defaultTileDimensions: [5, 3]
});


app.controller('_discussionsInsightViewCommon', function($scope, $controller, DataikuAPI, $stateParams) {
    $scope.resolvedObject = {projectKey: $stateParams.projectKey, type: $scope.insight.params.objectType, id: $scope.insight.params.objectId};

    $scope.fetchdiscussions = function(resolve, reject, noSpinner) {
        const p = DataikuAPI.discussions.getForObject($stateParams.projectKey, $scope.insight.params.objectType, $scope.insight.params.objectId);
        if (noSpinner) {
            p.noSpinner();
        }
        p.noSpinner()
            .success(function(data) {
                $scope.discussions = data.discussions;
                if (typeof(resolve)==="function") resolve();
            }).error(function(data, status, headers, config, statusText) {
            	setErrorInScope.bind($scope)(data, status, headers, config, statusText);
            	if (typeof(reject)==="function") reject(data, status, headers, config, statusText);
        	});
    };
});


app.directive('discussionsInsightTile', function($controller, InsightLoadingState) {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_tile.html',
        scope: {
            insight: '=',
            tile: '=',
            hook: '='
        },
        link: function($scope, element, attrs) {
            $controller('_discussionsInsightViewCommon', {$scope: $scope});

            $scope.loading = false;
            $scope.loaded = false;
            $scope.error = null;
            $scope.load = function(resolve, reject) {
            	$scope.loading = true;
                $scope.fetchdiscussions(
            		function() {
            			 $scope.loading = false;
                         $scope.loaded = true;
                         $scope.error = null;
                         if ($scope.hook && $scope.hook.isErrorMap) {
                         	$scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                         }
                         if (typeof(resolve)==="function") resolve();
            		}, function(data, status, headers, config, statusText) {
            			$scope.loading = false;
                        $scope.loaded = false;
                        $scope.error = data;
                        if ($scope.hook && $scope.hook.isErrorMap) {
                        	$scope.hook.isErrorMap[$scope.tile.$tileId] = true;
                        }
                		$scope.hook.setErrorInDashboardPageScope(data, status, headers, config, statusText);
                        if (typeof(reject)==="function") reject();
            		}
        		);
            };

            if ($scope.tile.autoLoad) {
            	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
            }
        }
    };
});


app.directive('discussionsInsightTileParams', function() {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_tile_params.html',
        scope: {
            tileParams: '='
        }
    };
});


app.directive('discussionsInsightCreateForm', function() {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_create_form.html',
        scope: true,
        link: function($scope, element, attrs) {
            $scope.insight.params.objectType = 'DATASET';
            $scope.hook.defaultName = "discussions on object";
            $scope.$watch("hook.sourceObject", function(nv) {
                if (!nv || !nv.label) return;
                $scope.hook.defaultName = "discussions on " + nv.label;
            });
        }
    };
});


app.directive('discussionsInsightView', function($controller) {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_view.html',
        scope: true,
        link: function($scope, element, attrs) {
            $controller('_discussionsInsightViewCommon', {$scope: $scope});
            $scope.fetchdiscussions();
        }
    };
});


app.directive('discussionsInsightEdit', function($controller, DataikuAPI) {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_edit.html',
        scope: {
            insight: '='
        }
    };
});

})();

(function() {
'use strict';

var app = angular.module('dataiku.dashboards.insights');


app.constant("StaticFileInsightHandler", {
    name: "Static insight",
    desc: "Insight generated from code",
    icon: 'icon-file-alt',
    color: '',

    getSourceId: function(insight) {
        return insight.params.objectSmartId;
    },
    getSourceType: function(insight) {
        return insight.params.objectType;
    },
    hasEditTab: false,
    defaultTileParams: {
        numDisplayedComments: 5
    },
    defaultTileDimensions: [5, 3]
});


app.controller('StaticFileInsightViewCommon', function($scope, $controller, DataikuAPI, $stateParams, $timeout) {
    $scope.insightContentURL = '/dip/api/dashboards/insights/view-static-file?'
        + 'projectKey=' + $scope.insight.projectKey
        + '&insightId=' + $scope.insight.id
        + '&cacheBusting=' + new Date().getTime()

    $scope.loadHTML = function(element, resolve, reject) {
        if (typeof(resolve)==="function") resolve();
    };

    $scope.download = function() {
        downloadURL($scope.insightContentURL+"&download=true");
    };
});


app.directive('staticFileInsightTile', function($controller, InsightLoadingState) {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/tile.html',
        scope: {
            insight: '=',
            tile: '=',
            hook: '='
        },
        link: function($scope, element, attrs) {
            $controller('StaticFileInsightViewCommon', {$scope: $scope});

            $scope.loading = false;
            $scope.loaded = false;
            $scope.error = null;
            $scope.load = function(resolve, reject) {
                $scope.loading = true;
                $scope.loadHTML(element,
                    function() {
                         $scope.loading = false;
                         $scope.loaded = true;
                         $scope.error = null;
                         if ($scope.hook && $scope.hook.isErrorMap) {
                            $scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                         }
                         if (typeof(resolve)==="function") resolve();
                    }, function(data, status, headers, config, statusText) {
                        $scope.loading = false;
                        $scope.loaded = false;
                        $scope.error = data;
                        if ($scope.hook && $scope.hook.isErrorMap) {
                            $scope.hook.isErrorMap[$scope.tile.$tileId] = true;
                        }
                        $scope.hook.setErrorInDashboardPageScope(data, status, headers, config, statusText);
                        if (typeof(reject)==="function") reject();
                    }
                );
            };

            if ($scope.tile.autoLoad) {
                $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
            }
        }
    };
});


app.directive('staticFileInsightTileParams', function() {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/tile_params.html',
        scope: {
            tileParams: '='
        },
        link: function($scope, element, attrs) {
            // No params
        }
    };
});



app.directive('staticFileInsightCreateForm', function() {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/create_form.html',
        scope: true,
        link: function($scope, element, attrs) {
            // Can't create static file insight from new insight modal
        }
    };
});


app.directive('staticFileInsightView', function($controller) {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/view.html',
        scope: true,
        link: function($scope, element, attrs) {
            $controller('StaticFileInsightViewCommon', {$scope: $scope});
            $scope.loadHTML(element);
        }
    };
});


app.directive('staticFileInsightEdit', function($controller, DataikuAPI) {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/edit.html',
        scope: {
            insight: '='
        },
        link: function($scope, element, attrs) {
            $controller('ChartInsightViewCommon', {$scope: $scope});

            $scope.currentInsight = $scope.insight;

            $scope.bigChart = false;

            $scope.saveChart = function() {
                DataikuAPI.dashboards.insights.save($scope.insight)
                    .error(setErrorInScope.bind($scope))
            };

            $scope.$on('chartSamplingChanged', function() {
                $scope.summary = null;
                $scope.fetchColumnsSummary();
                $scope.saveChart();
            });

            $scope.fetchColumnsSummary();
        }
    };
});

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("MetricsInsightHandler", {
        name: "Metrics",
        desc: "Meta data about your source",
        icon: 'icon-external-link',
        color: 'metrics',

        getSourceId: function(insight) {
            return insight.params.objectSmartId;
        },
        getSourceType: function(insight) {
            return insight.params.objectType;
        },
        hasEditTab: false,
        defaultTileParams: {
            displayMode: 'LAST_VALUE'
        },
        defaultTileDimensions: [2, 2]
    });

    app.directive('metricsInsightTile', function($controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $controller('MetricsInsightsViewCommon', {$scope: $scope});

                $scope.loading = false;
                $scope.loaded = false;
                $scope.load = function(resolve, reject) {
                	$scope.loading = true;
                    $scope.loadHistory(
                        DashboardUtils.setLoaded.bind([$scope, resolve]),
                        DashboardUtils.setError.bind([$scope, reject])
               		);
                };
                
                if ($scope.tile.autoLoad) {
                	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('metricsInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('metricsInsightCreateForm', function(DataikuAPI, $stateParams, MetricsUtils, StateUtils){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $scope.MetricsUtils = MetricsUtils;
                $scope.insight.params.objectType = "DATASET";


                var apis = {
                    'DATASET': 'datasets',
                    'SAVED_MODEL': 'savedmodels',
                    'MANAGED_FOLDER': 'managedfolder',
                    'PROJECT' : 'projects'
                };

                $scope.hook.sourceTypes = Object.keys(apis);

                function objectIsSeleted(){
                    $scope.computedMetrics = null;
                    $scope.selectedMetric = null;
                    $scope.insight.params.metricId = null;
                    DataikuAPI[apis[$scope.insight.params.objectType]].listComputedMetrics($stateParams.projectKey, $scope.insight.params.objectSmartId)
                    .success(function(data) {
                        $scope.computedMetrics = data.metrics.filter(function(m) {
                            return m.partitionsWithValue.length > 0;
                        });
                    })
                    .error($scope.hook.setErrorInModaleScope);
                    updateName();
                }

                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !$scope.insight.params.objectSmartId) return;
                    objectIsSeleted();
                });

                $scope.$watch("insight.params.objectType", function(nv, ov) {
                    if (nv === "PROJECT") {
                        objectIsSeleted();
                    }
                })

                $scope.$watch("selectedMetric", function(nv) {
                    if (!nv) return;
                    $scope.insight.params.metricId = nv.metric.id;
                    updateName();
                });

                $scope.$watch("insight.params.metricId", updateName);

                function updateName() {
                    if ($scope.selectedMetric) {
                        $scope.hook.defaultName = MetricsUtils.getMetricDisplayName($scope.selectedMetric) + " on " + $scope.hook.sourceObject.label;
                    } else if ($scope.hook.sourceObject && $scope.hook.sourceObject.label) {
                        $scope.hook.defaultName = "Metric of " + $scope.hook.sourceObject.label;
                    } else {
                        $scope.hook.defaultName = "Metric on object";
                    }
                }

                $scope.getMetricsSettingsUrl = function() {
                    if ($scope.insight.params.objectType && $scope.insight.params.objectSmartId) {
                        switch ($scope.insight.params.objectType) {
                            case 'DATASET' :
                                return StateUtils.href.dataset($scope.insight.params.objectSmartId, $stateParams.projectKey).replace('explore/', 'status/settings/');
                                break;
                            case 'SAVED_MODEL':
                                return StateUtils.href.savedModel($scope.insight.params.objectSmartId, $stateParams.projectKey).replace('versions/', 'settings/#status-checks');
                                break;
                            case 'MANAGED_FOLDER':
                                return StateUtils.href.managedFolder($scope.insight.params.objectSmartId, $stateParams.projectKey).replace('view/', 'status/settings');
                                break;
                            default:
                                break;
                        }
                    }
                }
            }
        };
    });

    app.controller('MetricsInsightsViewCommon', function($scope, DataikuAPI, $stateParams, MetricsUtils) {
        $scope.resolvedObject = resolveObjectSmartId($scope.insight.params.objectSmartId, $stateParams.projectKey);
        $scope.loadHistory = function(resolve, reject) {
            DataikuAPI.metrics.getComputedMetricWithHistory($scope.resolvedObject.projectKey, $scope.insight.params.objectType, $scope.resolvedObject.id, null, $scope.insight.params.metricId)
                .noSpinner()
                .success(function(data) {
                    $scope.metric = data.metric;
                    $scope.history = data.history;
                    $scope.fullRange = MetricsUtils.fixUpRange({from: data.history.from, to: data.history.to});
                    $scope.selectedRange = angular.copy($scope.fullRange);
                    MetricsUtils.fixupDisplayType($scope.history);
                    if (typeof(resolve)==="function") resolve();
                })
                .error(function(data, status, headers, config, statusText) {
                	setErrorInScope.bind($scope);
                	if (typeof(reject)==="function") reject(data, status, headers, config, statusText);
            	}
            );
        };

        $scope.brushChanged = function() {
            $scope.$apply();
        }
    });

    app.directive('metricsInsightView', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('MetricsInsightsViewCommon', {$scope: $scope});
                $scope.loadHistory();
            }
        };
    });

    app.directive('metricsInsightEdit', function($controller, DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/metrics/metrics_edit.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('ChartInsightViewCommon', {$scope: $scope});

                $scope.currentInsight = $scope.insight;

                $scope.bigChart = false;
                $scope.saveChart = function() {};

                $scope.saveChart = function(){
                    DataikuAPI.dashboards.insights.save($scope.insight)
                        .error(setErrorInScope.bind($scope))
                        .success(function () {});
                };

                $scope.$on('chartSamplingChanged', function() {
                    $scope.summary = null;
                    $scope.fetchColumnsSummary();
                    $scope.saveChart();
                });

                $scope.fetchColumnsSummary();
            }
        };
    });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("ManagedFolderContentInsightHandler", {
        name: "Managed folder",
        desc: "Display content of a folder",
        icon: 'icon-folder-close-alt',
        color: 'managed-folder',

        getSourceId: function(insight) {
            return insight.params.folderSmartId;
        },
        sourceType: 'MANAGED_FOLDER',
        hasEditTab: false,
        defaultTileParams: {

        },
        getDefaultTileDimensions: function(insight) {
            if (insight && insight.params && insight.params.filePath && !insight.params.isDirectory) return [4, 5];
            else return [8, 5];
        }
    });

    app.controller('ManagedFolderContentViewCommon', function($scope, DataikuAPI, $stateParams, DashboardUtils, ActiveProjectKey) {
        $scope.resolvedFolder = resolveDatasetFullName($scope.insight.params.folderSmartId,
                                                        $stateParams.projectKey || $scope.insight.projectKey);
        $scope.previewedItem = null;
        $scope.getPreview = function(resolve, reject, noSpinner) {
            var p = DataikuAPI.managedfolder.getForInsight(ActiveProjectKey.get(), $scope.resolvedFolder.projectKey, $scope.resolvedFolder.datasetName)
                .success(function(data) {
                    $scope.folder = data;
                    $scope.odb = data;

                    if ($scope.insight.params.filePath != null && !$scope.insight.params.isDirectory) {
                        var p = DataikuAPI.managedfolder.previewItem($scope.insight.projectKey, $scope.odb.projectKey, $scope.insight.params.folderSmartId, $scope.insight.params.filePath)
                            .success(function(data){ $scope.previewedItem = data; })
                            .success(DashboardUtils.setLoaded.bind([$scope, resolve]))
                            .error(DashboardUtils.setError.bind([$scope, reject]))
                            .error(setErrorInScope.bind($scope));

                        if (noSpinner) p.noSpinner();
                    } else {
                        DashboardUtils.setLoaded.bind([$scope, resolve])();
                    }
                })
                .error(setErrorInScope.bind($scope))
                .error(DashboardUtils.setError.bind([$scope, reject]));

            if (noSpinner) p.noSpinner();
        };
        
        $scope.skinState = {itemSkins:[]}; // to placate the js in the directives, not to offer webapp views in tiles (make a webapp tile for that)
        
    });

    app.directive('managedFolderContentInsightTile', function($controller, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/managed-folder_content/managed-folder_content_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $controller('ManagedFolderContentViewCommon', {$scope: $scope});

                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                    $scope.loading = true;
                    $scope.getPreview(resolve, reject, true);
                };
                $scope.$on('load-tile', $scope.load);


                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('managedFolderContentInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/managed-folder_content/managed-folder_content_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('managedFolderContentInsightCreateForm', function(DataikuAPI, ChartChangeHandler){
        return {
            templateUrl: '/templates/dashboards/insights/managed-folder_content/managed-folder_content_create_form.html',
            scope: true,
            link: function($scope, element, attrs){

                function refreshFiles() {
                    $scope.files = [];
                    if ($scope.insight.params.singleFile && $scope.insight.params.folderSmartId) {
                        DataikuAPI.managedfolder.listFS($scope.insight.projectKey, $scope.insight.params.folderSmartId)
                        .success(function(data){
                            $scope.files = data.items;
                        })
                        .error($scope.hook.setErrorInModaleScope);
                    }
                }

                $scope.$watch("insight.params.singleFile", refreshFiles);
                $scope.$watch("insight.params.folderSmartId", refreshFiles);

                function updateDefaultName() {
                    if (!$scope.hook.sourceObject || !$scope.hook.sourceObject.label) {
                        $scope.hook.defaultName = "Content of folder";
                    } else if ($scope.insight.params.filePath) {
                        $scope.hook.defaultName = "File " + $scope.insight.params.filePath + " of " + $scope.hook.sourceObject.label;
                    } else {
                        $scope.hook.defaultName = "Content of " + $scope.hook.sourceObject.label;
                    }
                }

                $scope.$watch("hook.sourceObject", updateDefaultName);
                $scope.$watch("insight.params.filePath", updateDefaultName);
            }
        };
    });



    app.directive('managedFolderContentInsightView', function($controller, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/managed-folder_content/managed-folder_content_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('ManagedFolderContentViewCommon', {$scope: $scope});
                $scope.getPreview();
            }
        };
    });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("RunnableButtonInsightHandler", {
        name: "Macro",
        desc: "Run a DSS macro",
        icon: "icon-table",
        color: "project",

        getSourceType: function() {
            return null;
        },
        getSourceId: function() {
            return null;
        },

        hasEditTab: true,
        goToEditAfterCreation: true,
        defaultTileParams: {
            showName: true
        },
        defaultTileDimensions: [2,2]

    });


    app.controller('RunnableButtonViewCommon', function($scope, Assert, DataikuAPI, $stateParams, DashboardUtils, $rootScope, PluginConfigUtils) {
        $scope.runnable = null;
        $rootScope.appConfig.customRunnables.forEach(function(x) {
           if (x.runnableType == $scope.insight.params.runnableType) {
               $scope.runnable = x;
           }
        });

        Assert.inScope($scope, 'runnable');

        $scope.insight.params.config = $scope.insight.params.config || {};
        $scope.desc = $scope.runnable.desc;

        PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.insight.params.config);

        $scope.pluginDesc = $rootScope.appConfig.loadedPlugins.filter(function(x){
            return x.id == $scope.runnable.ownerPluginId;
        })[0];

        $scope.hasSettings = $scope.pluginDesc.hasSettings || ($scope.desc.params && $scope.desc.params.length > 0);
        $scope.runOutput = {};

        $scope.resetSettings = function() {
            $scope.insight.params.config = {};
            PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.insight.params.config);
        };
    });


    app.directive('runnableButtonInsightTile', function($controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $controller('RunnableButtonViewCommon', {$scope: $scope});

                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                    $scope.loading = true;
                    DashboardUtils.setLoaded.bind([$scope, resolve])();
                };
                $scope.$on('load-tile', $scope.load);


                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('runnableButtonInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('runnableButtonInsightCreateForm', function(DataikuAPI, $stateParams){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_create_form.html',
            scope: true,
            link: function($scope, element, attrs){

                var refreshList = function() {
                    DataikuAPI.runnables.listAccessible($stateParams.projectKey).success(function(data) {
                        $scope.runnables = data.runnables;
                        $scope.runnablesExist = data.runnablesExist;
                    }).error(setErrorInScope.bind($scope));
                };
                refreshList();

                $scope.hook.sourceObject = null;
                $scope.hook.defaultName = "Execute macro";


                function updateName() {
                }

                $scope.onRunnableSelected = function(runnable) {
                    $scope.insight.params.runnableType = runnable.runnableType;
                    $scope.hook.defaultName = "Execute " + (((runnable.desc || {}).meta || {}).label || "macro").toLowerCase();
                }
            }
        };
    });

    app.directive('runnableButtonInsightEdit', function($controller, DataikuAPI, SmartId, WT1, $stateParams, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_edit.html',
            scope: true,
            link: function($scope, element, attrs) {
                $controller('RunnableButtonViewCommon', {$scope: $scope});

                DataikuAPI.security.listUsers().success(function(data) {
                    $scope.allUsers = data;
                }).error(setErrorInScope.bind($scope));

            }
        };
    });

    app.directive('runnableButtonInsightView', function($controller, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('RunnableButtonViewCommon', {$scope: $scope});
            }
        };
    });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("SavedModelReportInsightHandler", {
        name: "Saved model report",
        desc: "Full report of a model",
        icon: 'icon-dku-modelize',
        color: 'saved-model',

        getSourceId: function(insight) {
            return insight.params.savedModelSmartId;
        },
        sourceType: 'SAVED_MODEL',
        hasEditTab: false,
        defaultTileParams: {
            displayMode: 'summary'
        },
        defaultTileDimensions: [8, 4],

    });

    app.controller("SavedModelReportViewCommon", function($scope, DataikuAPI, $controller, FullModelIdUtils, WebAppsService, $state, $stateParams) {
        $scope.noMlReportTourHere = true; // the tabs needed for the tour are not present
        $scope.readOnly = true;
        $scope.noUrlChange = true;

        $scope._getSkins = function (versionId, contentType, algorithm) {
            if (!contentType.endsWith("/")) {
                contentType = contentType + '/';
            }
            contentType += algorithm.toLowerCase();
            return WebAppsService.getSkins('SAVED_MODEL', versionId, contentType);
        };

        

        $scope.getModel = function(onLoadError) {
            const p = DataikuAPI.savedmodels.get($scope.insight.projectKey, $scope.insight.params.savedModelSmartId)
            .success(function(data) {
                $scope.insight.$savedModel = data;
                const version = $scope.insight.params.version || data.activeVersion;

                $scope.insight.$fullModelId = FullModelIdUtils.buildSavedModelFmi({
                    projectKey: data.projectKey,
                    savedModelId: data.id,
                    versionId: version
                });
                $scope.fullModelId = $scope.insight.$fullModelId;
                DataikuAPI.ml[data.miniTask.taskType.toLowerCase()].getModelDetails($scope.fullModelId).success(function(modelData) {
                    $scope.modelSkins = $scope._getSkins(version, data.contentType, modelData.modeling.algorithm);
                }).error(setErrorInScope.bind($scope));
                $state.go('.', Object.assign($stateParams, {smId: data.id}), {notify:false, reload:true});
                $scope.noSetLoc = true;
                $scope.versionsContext = {};

                switch (data.miniTask.taskType) {
                    case 'PREDICTION':
                        if ($scope.insight.$savedModel.miniTask.partitionedModel
                            && $scope.insight.$savedModel.miniTask.partitionedModel.enabled) {
                            $controller("PMLPartModelReportController", {$scope:$scope});
                        }
                        $controller("PredictionSavedModelReportController", {$scope:$scope});
                        break;
                    case 'CLUSTERING':
                        $controller("ClusteringSavedModelReportController", {$scope:$scope});
                        break;
                }
            })
            .error(function(data, status, headers, config, statusText) {
            	if (typeof(onLoadError) === "function") onLoadError(data, status, headers, config, statusText); 
            });

            if ($scope.noSpinner) p.noSpinner();
        };

    });

    app.directive('savedModelReportInsightTile', function($controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/saved-model_report/saved-model_report_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){

                $scope.load = function(resolve, reject) {
                    $scope.loading = true;
                    $scope.onLoadSuccess = DashboardUtils.setLoaded.bind([$scope, resolve]);
                    $scope.onLoadError = DashboardUtils.setError.bind([$scope, reject]);
                    $scope.noSpinner = true;
                    $scope.getModel($scope.onLoadError);
                };

                $scope.isPartitionedModel = function() {
                    return $scope.insight.$modelData
                    && $scope.insight.$modelData.coreParams
                    && $scope.insight.$modelData.coreParams.partitionedModel
                    && $scope.insight.$modelData.coreParams.partitionedModel.enabled;
                }

                $controller("SavedModelReportViewCommon", {$scope:$scope});

                // Expose model data for savedModelReportInsightTileParams to display the appropriate tabs
                $scope.$watch("modelData", function(nv) {
                    if (!nv) return;
                    $scope.insight.$modelData = nv;
                });

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }

                $scope.noSkinControls = true; // no need to display controls widget in dashboards view
            }
        };
    });

    app.directive('savedModelReportInsightView', function($controller, $stateParams, DataikuAPI) {
        return {
            templateUrl: '/templates/dashboards/insights/saved-model_report/saved-model_report_view.html',
            scope: true,
            link: function($scope, element, attrs) {
                $controller("SavedModelReportViewCommon", {$scope:$scope});
                $scope.getModel(setErrorInScope.bind($scope));
                $scope.uiState = $scope.uiState || {};
                $scope.$watch("modelData", function(nv, ov) {
                    if (!nv) return;
                    if ($scope.originDashboardStateParams) {
                        DataikuAPI.dashboards.getFullInfo($stateParams.projectKey, $scope.originDashboardStateParams.dashboardId).success(function(data) {
                            const tile = data.dashboard.pages.find(page => page.id === $scope.originDashboardStateParams.pageId).grid.tiles.find(tile => tile.insightId === $stateParams.insightId);
                            $scope.uiState.settingsPane = tile.tileParams.displayMode || "summary";
                        });
                    } else {
                        $scope.uiState.settingsPane = "summary";
                    }
                })
                $scope.onLoadError = function(data, status, headers, config, statusText) {
            		setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                }
            }
        };
    });

    app.directive('savedModelReportInsightTileParams', function($controller, $timeout, DataikuAPI, FullModelIdUtils, $q){
        return {
            templateUrl: '/templates/dashboards/insights/saved-model_report/saved-model_report_tile_params.html',
            scope: {
                tileParams: '=',
                insight: '='
            },
            link: function($scope, $element, attrs){
                $scope.$watch("insight.$modelData", function(nv) {
                    if (!nv) return;
                    $scope.modelData = nv;
                    $scope.fullModelId = $scope.insight.$fullModelId;

                    $controller("SavedModelReportViewCommon", {$scope:$scope});

                    function getVersionSkins(projectKey, smartId) {
                        const deferred = $q.defer();
                        DataikuAPI.savedmodels.get(projectKey, smartId)
                            .success(function (sm) {
                                const version = $scope.insight.params.version || sm.activeVersion;
                                const contentType = sm.contentType;
                                if (!$scope.fullModelId) {
                                    $scope.fullModelId = FullModelIdUtils.buildSavedModelFmi({
                                        projectKey: sm.projectKey,
                                        savedModelId: sm.id,
                                        versionId: version
                                    });
                                }
                                DataikuAPI.ml[sm.miniTask.taskType.toLowerCase()].getModelDetails($scope.fullModelId).success(function (modelDetails) {
                                    // _getSkins() defined in SavedModelReportViewCommon
                                    deferred.resolve($scope._getSkins(version, contentType, modelDetails.modeling.algorithm));
                                }).error(setErrorInScope.bind($scope));
                            });
                        return deferred.promise;
                    };




                    getVersionSkins($scope.insight.projectKey, $scope.insight.params.savedModelSmartId).then(function (modelSkins) {
                        $scope.modelSkins = modelSkins;
                        $timeout(function() {
                            $scope.$broadcast('selectPickerRefresh');
                        });
                    });

                    // set default for tileParams.advancedOptions.interactiveScoring
                    if (!($scope.tileParams.advancedOptions && $scope.tileParams.advancedOptions.interactiveScoring) && $scope.insight.$savedModel.miniTask.taskType == "PREDICTION") {
                        Promise.all([DataikuAPI.ml.prediction.getColumnImportance($scope.fullModelId),
                                     DataikuAPI.ml.prediction.getSplitDesc($scope.fullModelId),
                                     DataikuAPI.ml.prediction.getPreparationScript($scope.fullModelId),
                                     DataikuAPI.ml.prediction.getInputDatasetSchema($scope.fullModelId).catch(e => e)]).then(
                                ([columnImportanceResp, splitDescResp, preparationScriptResp, inputDatasetSchemaResp]) => {
                            let featuresOrder;
                            if (columnImportanceResp.data) { // sort by importance
                                const importances = columnImportanceResp.data.importances;
                                const columns = columnImportanceResp.data.columns;
                                featuresOrder = columns.sort((c1, c2) => importances[columns.indexOf(c2)] - importances[columns.indexOf(c1)])                                
                            } else { // same order as in dataset
                                const perFeature = $scope.modelData.preprocessing.per_feature;
                                const inputColumns = Object.keys(perFeature).filter(featureName => perFeature[featureName].role === "INPUT");
                                featuresOrder = splitDescResp.data.schema.columns.map(c => c.name).filter(c => inputColumns.includes(c));
                            }
                            const hasPreparationSteps = preparationScriptResp.data.steps.some(step => !step.disabled);
                            if (hasPreparationSteps) {
                                if (inputDatasetSchemaResp.data.columns) {
                                    const preScriptFeatures = inputDatasetSchemaResp.data.columns.map((col) =>  col.name);
                                    if (columnImportanceResp.data) {
                                        featuresOrder.push(...preScriptFeatures.filter(f => !featuresOrder.includes(f)));    
                                    } else {
                                        featuresOrder = [...preScriptFeatures, ...featuresOrder.filter(f => !preScriptFeatures.includes(f))];
                                    }
                                } else if (inputDatasetSchemaResp.status !== 404) {
                                    // 404 is expected when the model has no `input_dataset_schema.json` (old model)
                                    // and has no more origin analysis (deleted)
                                    setErrorInScope.call($scope, inputDatasetSchemaResp);
                                }
                            }

                            $scope.tileParams.advancedOptions = {
                                ...$scope.tileParams.advancedOptions,
                                interactiveScoring: {
                                    featuresOrder,
                                }
                            };
                        }).catch(setErrorInScope.bind($scope));
                    }

                    switch ($scope.insight.$savedModel.miniTask.taskType) {
                        case 'PREDICTION':
                            $controller("_PredictionModelReportController", {$scope:$scope});
                            break;
                        case 'CLUSTERING':
                            $controller("_ClusteringModelReportController", {$scope:$scope});
                            break;
                    }

                    $timeout(function() {
                        $element.find('.view-select').selectpicker('refresh');
                    });
                });

            }
        };
    });


    app.directive('savedModelReportInsightCreateForm', function(DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/saved-model_report/saved-model_report_create_form.html',
            scope: true,
            link: function($scope, element, attrs) {
                $scope.hook.defaultName = "Dataset table";
                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !nv.label) return;
                    $scope.hook.defaultName = nv.label + " table";
                });

                /*
                $scope.$watch("insight.params.savedModelSmartId", function(nv) {
                    $scope.versions = [];
                    if (!nv) return;
                    DataikuAPI.savedmodels.listVersionIds($scope.insight.projectKey, $scope.insight.params.savedModelSmartId).success(function() {
                        $scope.versions = data;
                    });
                })
                */
            }
        };
    });


})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');


    app.constant("WebAppInsightHandler", {
        name: "Webapp",
        desc: "Display webapp",
        icon: 'icon-code',
        color: 'notebook',

        getSourceId: function(insight) {
            return insight.params.webAppSmartId;
        },
        sourceType: 'WEB_APP',
        hasEditTab: false,
        defaultTileParams: {

        },
        defaultTileShowTitleMode: 'NO',
        defaultTileDimension: [6, 4]
    });


    app.controller('WebAppViewCommon', function($scope, $stateParams, $controller, $q, DataikuAPI, Logger, WebAppsService) {
        $scope.resolvedWebApp = resolveObjectSmartId($scope.insight.params.webAppSmartId,  $stateParams.projectKey);

        const baseType = WebAppsService.getBaseType($scope.insight.params.webAppType);
        if (baseType == 'STANDARD') {
            $controller("StandardWebAppController", {$scope: $scope});
        } else if (baseType == 'BOKEH') {
            $controller("BokehWebAppController", {$scope: $scope});
        } else if (baseType == 'DASH') {
            $controller("DashWebAppController", {$scope: $scope});
        } else if (baseType == 'SHINY') {
            $controller("ShinyWebAppController", {$scope: $scope});
        } else {
            Logger.error("Unknown app type: ", $scope.insight.params.webAppType)
        }

    });

    app.directive('webAppInsightTile', function($controller, $q, $timeout, DashboardUtils, InsightLoadingState, InsightLoadingBehavior){
        return {
            templateUrl: '/templates/dashboards/insights/web_app/web_app_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '=',
                editable: '='
            },
            link: function($scope, element, attrs){
                $scope.element = element;
                $scope.ngShowLoaded = true;

                $controller('WebAppViewCommon', {$scope: $scope});

                $scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;

                $scope.load = function(resolve, reject) {
                    let app = {
                        projectKey: $scope.insight.projectKey,
                        id: $scope.insight.params.webAppSmartId
                    };
                    $scope.getViewURL(app).then(function(url) {
                        $scope.iFrameUrl = url;
                    });

                    $scope.loaded = true;
                    DashboardUtils.setLoaded.bind([$scope, resolve])();
                    let timeoutInSeconds = Math.min($scope.tile.tileParams.loadTimeoutInSeconds, 240);
                    if (timeoutInSeconds > 0) {
                        $timeout(function () {
                            $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.COMPLETE;
                        }, timeoutInSeconds * 1000);
                        return InsightLoadingBehavior.DELAYED_COMPLETE;
                    }
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        }
    });

    app.directive('webAppInsightView', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/web_app/web_app_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs) {
                $scope.element = element;
                $controller('WebAppViewCommon', {$scope: $scope});
                var app = {
                    projectKey: $scope.insight.projectKey,
                    id: $scope.insight.params.webAppSmartId
                };
                $scope.getViewURL(app).then(function(url) {
                    $scope.iFrameUrl = url;
                });
            }
        };
    });

    app.directive('webAppInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/web_app/web_app_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
                // Used when creating a new tile to correctly initialize the timeout value in editor.
                $scope.$watch("tileParams", function(nv) {
                    if (nv && nv.loadTimeoutInSeconds === undefined) {
                        nv.loadTimeoutInSeconds = 0;
                    }
                });
                if ($scope.tileParams.loadTimeoutInSeconds === undefined) {
                    $scope.tileParams.loadTimeoutInSeconds = 0;
                }
            }
        };
    });


    app.directive('webAppInsightCreateForm', function(DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/web_app/web_app_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $scope.hook.defaultName = "Webapp";
                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !nv.label) return;
                    $scope.hook.defaultName = nv.label;
                    $scope.insight.params.webAppType = nv.subtype;
                });
            }
        };
    });

})();

(function(){
'use strict';

const app = angular.module('dataiku.dashboards.insights');


app.constant("ReportInsightHandler", {
    name: "Report",
    desc: "Display report",
    icon: 'icon-DKU_rmd',
    color: 'notebook',

    getSourceId: function(insight) {
        return insight.params.reportSmartId;
    },
    sourceType: 'REPORT',
    hasEditTab: true,
    defaultTileParams: {

    },
    defaultTileShowTitleMode: 'NO',
    defaultTileDimension: [4, 5]
});


app.controller('ReportSnapshotCommonController', function($scope, $stateParams, $sce, $timeout, $q, Assert, DataikuAPI, RMARKDOWN_PREVIEW_OUTPUT_FORMATS) {
    $scope.resolvedReport = resolveObjectSmartId($scope.insight.params.reportSmartId,  $stateParams.projectKey);


    $scope.displaySnapshot = function(element, snapshot) {
        if (!snapshot.timestamp) {
            return;
        }
        let format = $scope.insight.params.viewFormat;
        if (format == null && snapshot.availableFormats && snapshot.availableFormats.length) { // backwards compatibility
            const availablePreviewFormats = RMARKDOWN_PREVIEW_OUTPUT_FORMATS.filter(f => snapshot.availableFormats.includes(f.name));
            if (availablePreviewFormats.length) {
                format = availablePreviewFormats[0].name;
            }
        }
        const url = "/dip/api/reports/snapshots/view?" + $.param({
            projectKey: snapshot.projectKey,
            id: snapshot.reportId,
            format: format,
            timestamp: snapshot.timestamp
        });
        const iframe = element.find('iframe');
        iframe.attr('src', url);
    };

    $scope.getLoadingPromise = function() {
        const params = $scope.insight.params;
        const t = params.loadLast ? 0 : params.exportTimestamp;
        return DataikuAPI.reports.snapshots.get($scope.insight.projectKey, params.reportSmartId, t);
    };

});


app.directive('reportInsightTile', function($controller, $timeout, DashboardUtils, InsightLoadingState){
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_tile.html',
        scope: {
            insight: '=',
            tile: '=',
            hook: '=',
            editable: '='
        },
        link: function($scope, element, attrs){
            $scope.element = element;

            $controller('ReportSnapshotCommonController', {$scope: $scope});

            $scope.loaded = false;
            $scope.loading = false;
            $scope.error = null;
            $scope.load = function(resolve, reject) {
                $scope.loading = true;
                const loadingPromise = $scope.getLoadingPromise()//.noSpinner();
                //any case write in iframe to display html
                loadingPromise
                    .then(function(resp) {
                        DashboardUtils.setLoaded.bind([$scope, resolve])();
                        $timeout(function() { $scope.displaySnapshot(element, resp.data); });

                        if ($scope.tile.clickAction != 'DO_NOTHING') {
                            // On click on body, redirect event to main-click link
                            $timeout(function() {
                                element.find('iframe')[0].contentWindow._load = function() {
                                    element.find('iframe').contents().find('body').on('click', function(evt) {
                                        if(evt.originalEvent.preventRecursionMarker === 'norec') {
                                            // Prevent event recursion : do not handle this event if we generated it!
                                            return;
                                        }
                                        const cloneEvent = document.createEvent('MouseEvents');
                                        cloneEvent.preventRecursionMarker = 'norec';
                                        const e = evt.originalEvent;
                                        cloneEvent.initMouseEvent(e.type, e.bubbles, e.cancelable, window, e.detail,
                                            e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey,
                                            e.metaKey, e.button, e.relatedTarget);
                                        element.closest('.tile-wrapper').find('[main-click]')[0].dispatchEvent(cloneEvent);
                                        e.stopPropagation();
                                    });
                                }
                            });
                        }
                    }, DashboardUtils.setError.bind([$scope, reject]));
            };

            if ($scope.tile.autoLoad) {
                $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
            }
        }
    }
});


app.directive('reportInsightView', function($controller) {
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_view.html',
        scope: {
            insight: '='
        },
        link: function($scope, element, attrs) {
            $scope.element = element;
            $controller('ReportSnapshotCommonController', {$scope: $scope});

            const loadingPromise = $scope.getLoadingPromise();
            loadingPromise.then(function(resp) {
                $scope.displaySnapshot(element, resp.data);
            }, setErrorInScope.bind($scope));
        }
    };
});


app.directive('reportInsightTileParams', function(){
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_tile_params.html',
        scope: {
            tileParams: '='
        },
        link: function($scope, element, attrs){
            //No tile params
        }
    };
});


app.directive('reportInsightCreateForm', function($stateParams, $filter, DataikuAPI){
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_create_form.html',
        scope: true,
        link: function($scope, element, attrs) {
            let snapshotsByReportSmartId = {};
            $scope.hook.defaultName = "Rmarkdown report";
            $scope.$watch("hook.sourceObject", function(nv) {
                if (!nv || !nv.label) return;
                $scope.hook.defaultName = nv.label;
            });

            $scope.insight.params.loadLast = true;

            $scope.facade = {
                reportSmartId: null,
                availableSnapshots: [],
                createSnapshot: $scope.canWriteProject()
            };

            function setReport() {
                if (!$scope.facade.reportSmartId) {
                    return;
                }
                $scope.insight.params.reportSmartId = $scope.facade.reportSmartId;
                $scope.facade.availableSnapshots = snapshotsByReportSmartId[$scope.facade.reportSmartId];
            };

            $scope.$watch("facade.reportSmartId", setReport);

            $scope.hook.beforeSave = function(resolve, reject) {
                const snapshot = $scope.facade.snapshot;
                if (snapshot) {
                    const formatNames = getAvailablePreviewFormats(snapshot).map(_ => _.name);
                    if (formatNames.length && !formatNames.includes(params.viewFormat)) {
                        params.viewFormat = formatNames[0];
                    }
                    $scope.insight.params.exportTimestamp = snapshot.timestamp;
                }
                if ($scope.facade.createSnapshot) {
                    DataikuAPI.reports.snapshots.create($stateParams.projectKey, $scope.insight.params.reportSmartId)
                    .success(function(snapshot) {
                        if (!$scope.insight.params.loadLast) {
                            const formatNames = getAvailablePreviewFormats(snapshot).map(_ => _.name);
                            if (formatNames.length && !formatNames.includes(params.viewFormat)) {
                                params.viewFormat = formatNames[0];
                            }
                            $scope.insight.params.exportTimestamp = snapshot.timestamp;
                        }
                        resolve();
                    })
                    .error(function(data, status, headers, config, statusText){
                        reject(arguments);
                    });
                } else {
                    resolve();
                }
            };

            $scope.checkLoadLastAndTimestampConsistency = function() {
                if (!$scope.insight.params.loadLast && !$scope.facade.snapshot && !$scope.facade.createSnapshot) {
                    $scope.newInsightForm.$setValidity('loadLastAndTimestampConsistency', false);
                } else {
                    $scope.newInsightForm.$setValidity('loadLastAndTimestampConsistency', true);
                }
                return true;
            };

            $scope.formatDate = function(timestamp) {
                return $filter('date')(timestamp, 'short');
            };

            $scope.resetTimestamp = function() {
                $scope.insight.params.exportTimestamp = null;
            };

            DataikuAPI.reports.snapshots.listForAll($scope.insight.projectKey).success(function(data) {
                snapshotsByReportSmartId = data;
            }).error($scope.hook.setErrorInModaleScope);
        }
    };
});


app.directive('reportInsightEdit', function($controller, DataikuAPI, FutureProgressModal, $rootScope, Dialogs, RMARKDOWN_PREVIEW_OUTPUT_FORMATS) {
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_edit.html',
        scope: {
            insight: '=',
        },
        link: function($scope, element, attrs) {
            $controller('ReportSnapshotCommonController', {$scope});

            function getAvailablePreviewFormats(snapshot) {
                if (!snapshot || !snapshot.availableFormats) {
                    return [];
                }
                return RMARKDOWN_PREVIEW_OUTPUT_FORMATS.filter(f => snapshot.availableFormats.includes(f.name));
            }

            $scope.canWriteProject = $rootScope.topNav.isProjectAnalystRW;

            DataikuAPI.reports.snapshots.list($scope.insight.projectKey, $scope.insight.params.reportSmartId)
                .success(function(snapshots) {
                    $scope.snapshots = snapshots;
                    refresh();
                })
                .error(setErrorInScope.bind($scope));

            function refresh() {
                const params = $scope.insight.params;
                if (!params) {
                    return;
                }
                if (!params.loadLast && !params.exportTimestamp && $scope.snapshots && $scope.snapshots.length) {
                    params.exportTimestamp = $scope.snapshots[0].timestamp;
                }


                $scope.availablePreviewFormats = null;
                if ($scope.snapshots) {
                    if (params.loadLast) {
                        $scope.snapshot = $scope.snapshots[0];
                    } else if (params.exportTimestamp) {
                        $scope.snapshot = $scope.snapshots.find(e => e.timestamp == params.exportTimestamp);
                    }
                    $scope.availablePreviewFormats = getAvailablePreviewFormats($scope.snapshot);
                    const formatNames = $scope.availablePreviewFormats.map(_ => _.name);
                    if (formatNames.length && !formatNames.includes(params.viewFormat)) {
                        params.viewFormat = $scope.availablePreviewFormats[0].name;
                    }
                }
                console.info("Using exportFormat", params.exportFormat);

                const loadingPromise = $scope.getLoadingPromise();
                loadingPromise.then(function(resp) {
                    $scope.displaySnapshot(element, resp.data);
                }, setErrorInScope.bind($scope));
            }

            $scope.$watch("insight.params", refresh, true);

            $scope.createSnapshot = function() {
                const params = $scope.insight.params;
                Dialogs.confirmPositive($scope, "Snapshot report", `Run Rmarkdown?`).then(function() {
                    DataikuAPI.reports.snapshots.create($scope.insight.projectKey, params.reportSmartId)
                    .success(function(data) {
                        FutureProgressModal.show($scope, data, "Building report for snapshot...").then(function(result) {
                            var snapshot = result.snapshot;
                            if (!params.loadLast) {
                                const formatNames = getAvailablePreviewFormats(snapshot).map(_ => _.name);
                                if (formatNames.length && !formatNames.includes(params.viewFormat)) {
                                    params.viewFormat = formatNames[0];
                                }
                                params.exportTimestamp = snapshot.timestamp;
                            }
                            refresh();
                            $scope.snapshots.unshift(snapshot);
                        });
                    }).error(setErrorInScope.bind($scope));
                });
            };
        }
    };
});

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("ProjectActivityInsightHandler", {
        name: "Project activity",
        desc: "Activity charts of a project",
        icon: 'icon-dashboard',
        color: 'project',

        getSourceId: function(insight) {
            return insight.params.projectKey;
        },
        sourceType: 'PROJECT',
        hasEditTab: false,
        defaultTileParams: {
            displayMode: 'CONTRIBUTION_CHARTS',
            summaryChart: 'commits',
            contributorsChart: 'commits',
            timeSpan: 'year'
        }
    });

    app.controller('ProjectActivityInsightViewCommon', function($scope, DataikuAPI, $stateParams, MetricsUtils) {
        $scope.resolvedObject = resolveObjectSmartId($scope.insight.params.objectSmartId, $stateParams.projectKey);
        $scope.loadHistory = function(resolve, reject) {
            DataikuAPI.metrics.getComputedMetricWithHistory($scope.resolvedObject.projectKey, $scope.insight.params.objectType, $scope.resolvedObject.id, null, $scope.insight.params.metricId)
                .noSpinner()
                .success(function(data) {
                    $scope.metric = data.metric;
                    $scope.history = data.history;
                    $scope.fullRange = {from: data.history.from, to: data.history.to};
                    $scope.selectedRange = {from: data.history.from, to: data.history.to};
                    MetricsUtils.fixupDisplayType($scope.history);
                    if (typeof(resolve)==="function") resolve();
                })
                .error(function() {
                        setErrorInScope.bind($scope);
                        if (typeof(reject)==="function") reject();
                    }
                );
        };

        $scope.brushChanged = function() {
            $scope.$apply();
        }
    });


    app.directive('projectActivityInsightTile', function($controller, DataikuAPI, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $controller('ProjectActivityViewCommonController', {$scope: $scope});

                $scope.loading = false;
                $scope.loaded = false;
                $scope.load = function(resolve, reject) {
                	$scope.loading = true;
                    DataikuAPI.projects.activity.getActivitySummary($scope.insight.params.projectKey, $scope.tile.tileParams.timeSpan || 'year')
                        .success($scope.prepareData)
                        .success(DashboardUtils.setLoaded.bind([$scope, resolve]))
                        .error(DashboardUtils.setError.bind([$scope, reject]))
                        .noSpinner();
                };

                $scope.$watch("tile.tileParams.timeSpan", function(nv, ov) {
                    if (nv && ov && nv != ov) {
                        DataikuAPI.projects.activity.getActivitySummary($scope.insight.params.projectKey, $scope.tile.tileParams.timeSpan || 'year')
                            .success($scope.prepareData)
                            .error(DashboardUtils.setError.bind([$scope, reject]))
                        .noSpinner();
                    }
                });

                if ($scope.tile.autoLoad) {
                	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('projectActivityInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('projectActivityInsightCreateForm', function(DataikuAPI, $stateParams){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $scope.$watch("hook.sourceObject", updateName);
                $scope.hook.noReaderAuth = true;

                function updateName() {
                    if ($scope.hook.sourceObject && $scope.hook.sourceObject.label) {
                        $scope.hook.defaultName = "Activity of " + $scope.hook.sourceObject.label;
                    } else {
                        $scope.hook.defaultName = "Activity of project";
                    }
                }
            }
        };
    });

    app.directive('projectActivityInsightView', function($controller, DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_view.html',
            scope: true,
            link: function($scope, element, attrs){
                $controller('ProjectActivityViewCommonController', {$scope: $scope});
                $scope.uiState = {
                    settingsPane : 'summary',
                    summaryChart: 'commits',
                    contributorsChart: 'commits',
                    timeSpan: 'year'
                };

                $scope.$watch('uiState.timeSpan', function(timeSpan) {
                    if (!timeSpan) return;
                    DataikuAPI.projects.activity.getActivitySummary($scope.insight.params.projectKey, timeSpan)
                        .success($scope.prepareData)
                        .error(setErrorInScope.bind($scope));
                });
            }
        };
    });

    app.directive('projectActivityInsightEdit', function($controller, DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/project_activity/project_activity_edit.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('ChartInsightViewCommon', {$scope: $scope});

                $scope.currentInsight = $scope.insight;

                $scope.bigChart = false;
                $scope.saveChart = function() {};

                $scope.saveChart = function(){
                    DataikuAPI.dashboards.insights.save($scope.insight)
                        .error(setErrorInScope.bind($scope))
                        .success(function () {});
                };

                $scope.$on('chartSamplingChanged', function() {
                    $scope.summary = null;
                    $scope.fetchColumnsSummary();
                    $scope.saveChart();
                });

                $scope.fetchColumnsSummary();
            }
        };
    });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.directive('textTile', function(){
        return {
            templateUrl: '/templates/dashboards/insights/text/text_tile.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });

    app.directive('textTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/text/text_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.directive('imageTileParams', function(TileUtils){
        return {
            templateUrl: '/templates/dashboards/insights/image/image_tile_params.html',
            scope: {
                tile: '='
            },
            link: function($scope, element, attrs){
                $scope.openUploadPictureDialog = TileUtils.openUploadPictureDialog;
            }
        };
    });

})();

(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.directive('iframeTile', function($sce, $timeout, InsightLoadingState, InsightLoadingBehavior){
        return {
            templateUrl: '/templates/dashboards/insights/iframe/iframe_tile.html',
            scope: {
                tileParams: '=',
                editable: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){

                $scope.$watch("tileParams.url", function(nv) {
                    if (!nv) return;
                    /* Copied from angular-sanitize LINKY_REGEX */
                    const URL_REGEX = /((ftp|https?):\/\/|(www\.)|(mailto:)?[A-Za-z0-9._%+-]+@)\S*[^\s.;,(){}<>"\u201d\u2019]/i;
                    if ($scope.tileParams.url.match(URL_REGEX)) {

                        if ($scope.tileParams.url.startsWith(window.location.origin)) {
                            $scope.sandboxedIframe = true;
                        } else {
                            $scope.sandboxedIframe = false;
                        }

                        $scope.trustedUrl = $sce.trustAsResourceUrl($scope.tileParams.url);
                    } else {
                        $scope.trustedUrl = $scope.tileParams.url; // Since it's not trusted it will fail
                    }
                });

                let timeoutInSeconds = Math.min($scope.tileParams.loadTimeoutInSeconds, 240);
                if (timeoutInSeconds > 0) {
                    $scope.load = function (resolve, reject) {
                        $timeout(function () {
                            $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.COMPLETE;
                        }, timeoutInSeconds * 1000);
                        if (typeof(resolve) === 'function') resolve();
                        return InsightLoadingBehavior.DELAYED_COMPLETE;
                    };
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('iframeTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/iframe/iframe_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
                // Used when creating a new tile to correctly initialize the timeout value in editor.
                $scope.$watch("tileParams", function(nv) {
                    if (nv && nv.loadTimeoutInSeconds === undefined) {
                        nv.loadTimeoutInSeconds = 0;
                    }
                });
                if ($scope.tileParams.loadTimeoutInSeconds === undefined) {
                    $scope.tileParams.loadTimeoutInSeconds = 0;
                }
            }
        };
    });

})();

(function() {
'use strict';

const app = angular.module('dataiku.dashboards.insights');

app.constant("ArticleInsightHandler", {
    name: "article",
    desc: "Wiki article",
    icon: 'icon-file-text',
    color: 'article',

    getSourceId: function(insight) {
        return insight.params.articleId;
    },
    getSourceType: function(insight) {
        return "ARTICLE";
    },

    hasEditTab: false,
    defaultTileParams: {},
    defaultTileDimensions: [5, 5]
});

app.controller('_articleInsightViewCommon', function($scope, $stateParams, DataikuAPI) {
    $scope.fetchArticle = function(resolve, reject, noSpinner) {
        const p = DataikuAPI.wikis.getArticlePayload($stateParams.projectKey, $scope.insight.params.articleId);
        if (noSpinner) {
            p.noSpinner();
        }
        p.noSpinner()
            .success(function(data) {
                $scope.article = data;
                if (typeof(resolve)==="function") resolve();
            }).error(function(data, status, headers, config, statusText) {
                setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                if (typeof(reject)==="function") reject(data, status, headers, config, statusText);
            });
    };
});

app.directive('articleInsightTile', function($controller, InsightLoadingState) {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_tile.html',
        scope: {
            insight: '=',
            tile: '=',
            hook: '='
        },
        link: function($scope, element, attrs) {
            $controller('_articleInsightViewCommon', {$scope: $scope});

            $scope.loading = false;
            $scope.loaded = false;
            $scope.error = null;
            $scope.load = function(resolve, reject) {
                $scope.loading = true;
                $scope.fetchArticle(
                    function() {
                        $scope.loading = false;
                        $scope.loaded = true;
                        $scope.error = null;
                        if ($scope.hook && $scope.hook.isErrorMap) {
                            $scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                        }
                        if (typeof(resolve)==="function") resolve();
                    }, function(data, status, headers, config, statusText) {
                        $scope.loading = false;
                        $scope.loaded = false;
                        $scope.error = data;
                        if ($scope.hook && $scope.hook.isErrorMap) {
                            $scope.hook.isErrorMap[$scope.tile.$tileId] = true;
                        }
                        $scope.hook.setErrorInDashboardPageScope(data, status, headers, config, statusText);
                        if (typeof(reject)==="function") reject();
                    }
                );
            };

            if ($scope.tile.autoLoad) {
                $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
            }
        }
    };
});

app.directive('articleInsightTileParams', function() {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_tile_params.html',
        scope: {
            tileParams: '='
        }
    };
});

app.directive('articleInsightCreateForm', function() {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_create_form.html',
        scope: true,
        link: function($scope, element, attrs) {
            $scope.hook.defaultName = "article";
            $scope.$watch("hook.sourceObject", function(nv) {
                if (!nv || !nv.label) return;
                $scope.hook.defaultName = "article " + nv.label;
            });
        }
    };
});

app.directive('articleInsightView', function($controller) {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_view.html',
        scope: true,
        link: function($scope, element, attrs) {
            $controller('_articleInsightViewCommon', {$scope: $scope});
            $scope.fetchArticle();
        }
    };
});

app.directive('articleInsightEdit', function() {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_edit.html',
        scope: {
            insight: '='
        }
    };
});

})();