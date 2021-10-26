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
