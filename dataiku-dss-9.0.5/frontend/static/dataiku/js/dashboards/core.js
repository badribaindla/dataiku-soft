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
