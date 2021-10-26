(function() {
'use strict';

const app = angular.module('dataiku.common.nav', ['dataiku.notebooks']);


app.service("TopNav", function($stateParams, $rootScope, Logger) {
    const svc = this;

    let currentPageTitle = "Dataiku";
    $rootScope.topNav = { item : {}, isProjectAnalystRO : true, homeSearchFilter: "" }

    function getItemKey(item) {
        const projectKey = item.projectKey || $stateParams.projectKey;
        const type = item.type || "";
        return projectKey + ':' + type + ':' + item.id;
    }

    function sameItem(item1, item2) {
        return item1 && item2 && (getItemKey(item1) == getItemKey(item2));
    }

    svc.setOverrideLeftType = function(type) {
        $rootScope.topNav.overrideLeftType = type;
    };

    svc.setPageTitle = function(title) {
        currentPageTitle = title;
        svc.refreshPageTitle();
    };

    svc.refreshPageTitle = function(){
        var pn = "";
        if ($rootScope.totalUnreadNotifications && $rootScope.totalUnreadNotifications > 0) {
            pn = "(" + $rootScope.totalUnreadNotifications + ") "
        }
        var it = "";
        if ($rootScope.appConfig && $rootScope.appConfig.isAutomation) {
            it = " (Automation)";
        }
        document.title = pn + currentPageTitle + " | Dataiku" + it;
    }

    /**
     * Valid "top" elements
     * Frontend only
     */
    svc.LOGIN = "LOGIN";
    svc.DSS_HOME = "DSS_HOME";
    svc.TOP_HOME = "HOME";
    svc.TOP_FLOW = "FLOW";
    svc.TOP_ANALYSES = "ANALYSES";
    svc.TOP_NOTEBOOKS = "NOTEBOOKS";
    svc.TOP_JOBS = "JOBS";
    svc.TOP_DASHBOARD = "DASHBOARD";
    svc.TOP_WIKI = "WIKI";
    svc.TOP_DEPLOYER = "DEPLOYER";
    svc.TOP_API_DEPLOYER = "API_DEPLOYER";
    svc.TOP_PROJECT_DEPLOYER = "PROJECT_DEPLOYER";
    svc.TOP_MORE = "MORE";

    /**
     * Valid item types
     * Shared with backend
     */
    svc.ITEM_DATASET = "DATASET";
    svc.ITEM_RECIPE = "RECIPE";
    svc.ITEM_ANALYSIS = "ANALYSIS";
    svc.ITEM_DASHBOARD = "DASHBOARD";
    svc.ITEM_WEB_APP = "WEB_APP";
    svc.ITEM_REPORT = "REPORT";
    svc.ITEM_SQL_NOTEBOOK = "SQL_NOTEBOOK";
    svc.ITEM_JUPYTER_NOTEBOOK = "JUPYTER_NOTEBOOK";
    svc.ITEM_SAVED_MODEL = "SAVED_MODEL";
    svc.ITEM_MODEL_EVALUATION_STORE = "MODEL_EVALUATION_STORE";
    svc.ITEM_MANAGED_FOLDER = "MANAGED_FOLDER";
    svc.ITEM_STREAMING_ENDPOINT = "STREAMING_ENDPOINT";
    svc.ITEM_JOB = "JOB";
    svc.ITEM_CONTINUOUS_ACTIVITY = "CONTINUOUS_ACTIVITY";
    svc.ITEM_INSIGHT = "INSIGHT";
    svc.ITEM_LAMBDA_SERVICE = "LAMBDA_SERVICE";
    svc.ITEM_SCENARIO = "SCENARIO";
    svc.ITEM_MONITORING = "MONITORING";
    svc.ITEM_PROJECT = "PROJECT";
    svc.ITEM_ARTICLE = "ARTICLE";

    /**
     * Valid tabs-type
     * Frontend only
     */
    svc.TABS_NONE = "NONE";
    svc.TABS_ANALYSIS = "ANALYSIS";
    svc.TABS_DATASET = "DATASET";
    svc.TABS_STREAMING_ENDPOINT = "STREAMING_ENDPOINT";
    svc.TABS_NEW_DATASET = "NEW-DATASET";
    svc.TABS_SAVED_MODEL = "SAVED_MODEL";
    svc.TABS_SAVED_MODEL_VERSION = "SAVED_MODEL-VERSION";
    svc.TABS_MODEL_EVALUATION_STORE = "MODEL_EVALUATION_STORE";
    svc.TABS_RECIPE = "RECIPE";
    svc.TABS_SQL_NOTEBOOK = "SQL_NOTEBOOK";
    svc.TABS_JUPYTER_NOTEBOOK = "JUPYTER_NOTEBOOK";
    svc.TABS_DASHBOARD = "DASHBOARD";
    svc.TABS_INSIGHT = "INSIGHT";
    svc.TABS_JOB = "JOB";
    svc.TABS_CONTINUOUS_ACTIVITY = "CONTINUOUS_ACTIVITY";
    svc.TABS_MANAGED_FOLDER = "MANAGED_FOLDER";
    svc.TABS_LAMBDA = "LAMBDA";
    svc.TABS_SCENARIO = "SCENARIO";
    svc.TABS_MONITORING = "MONITORING";
    svc.TABS_RUNNABLE = "RUNNABLE";


    svc.refreshPageTitle = function() {
        let pn = "";
        if ($rootScope.totalUnreadNotifications && $rootScope.totalUnreadNotifications > 0) {
            pn = "(" + $rootScope.totalUnreadNotifications + ") "
        }
        let it = "";
        if ($rootScope.appConfig && $rootScope.appConfig.isAutomation) {
            it = " (Automation)";
        }
        document.title = pn + currentPageTitle + " | Dataiku" + it;
    };

    /**
     * top = which universe is highlighted in the global nav (+color for item icon)
     * left = which "sub-universe" is active (e.g. Project Home > Settings)
     * tabsType = which tabs to show on the right on secondary nav
     * tab = which tab is active on the right on secondary nav
     */
    svc.setLocation = function setLocation(top, left, tabsType, tab) {
        $rootScope.topNav.top = top;
    	$rootScope.topNav.left = left;
    	$rootScope.topNav.tabsType = tabsType;
    	$rootScope.topNav.tab = tab;

    	$rootScope.topNav.isTall = (top == 'DSS_HOME' && !left);

    	Logger.debug("Set location to ", $rootScope.topNav);
    };

    svc.setProjectData = function(projectSummary, projectCurrentBranch) {
    	$rootScope.topNav.project = projectSummary;
    	$rootScope.topNav.projectCurrentBranch = (projectCurrentBranch && projectCurrentBranch !== "master") ? projectCurrentBranch : "";
    };

    svc.setItem = function(type, id, data) {
        Logger.debug("Set item", type, id, data);
        const oldItem = $rootScope.topNav.item;
    	const newItem = {
            type: type,
            id: id,
            data: data
        }
        const same = svc.sameItem(oldItem, newItem);
        $rootScope.topNav.item = newItem;
        // If we change item and don't have data yet, show "Loading..." state
        if (type && !same && !data) {
            $rootScope.topNav.item.data = {name: "Loading ...", loading: true };
        }
    };

    svc.getItem = function() {
        return $rootScope.topNav.item;
    };

    svc.setNoItem = function() {
        svc.setItem(null, null, null);
    };

    // Only changes the tab, nothing elses
    svc.setTab = function(tab) {
        $rootScope.topNav.tab = tab;
    };

    svc.sameItem = function(item1, item2) {
        return item1 && item2 && (getItemKey(item1) == getItemKey(item2));
    };

    svc.isShowHomePageNavSearch = function() {
        return ('showSearchInNav' in $stateParams) && !('filterBy' in $stateParams);
    }

    svc.sameItem = sameItem;
});


app.factory("StateUtils", function($state, $stateParams, $filter, $rootScope, objectTypeFromNodeFlowType, SmartId, ActiveProjectKey) {
    function makeStateService(handlingFunction) {
        const that = {
            project: function(projectKey, options = {}) {
                return handlingFunction('projects.project.home.regular', {
                    projectKey: projectKey,
                    discussionId: options.discussionId
                });
            },
            pinboard: function(projectKey) {
                return handlingFunction('projects.project.pinboard', {
                    projectKey: projectKey
                });
            },
            dataset: function(datasetName, contextProject, options = {}) {
                contextProject = contextProject || ActiveProjectKey.get();
                const ref = SmartId.resolve(datasetName, contextProject);
                const tab = options.tab || 'explore';

                if (contextProject && ref.projectKey != contextProject && !options.moveToTargetProject) {
                    return handlingFunction('projects.project.foreigndatasets.dataset.' + tab, {
                        datasetFullName: datasetName,
                        projectKey: contextProject,
                        discussionId: options.discussionId
                    });
                } else {
                    return handlingFunction('projects.project.datasets.dataset.' + tab, {
                        projectKey: ref.projectKey,
                        datasetName: ref.id,
                        discussionId: options.discussionId
                    });
                }
            },
            //reprecated, use dataset
            datasetChart: function(chartIdx, datasetSmartName, projectKey) {
                const parts = datasetSmartName.split('.');
                if (parts.length == 2) {
                    if (parts[0] != projectKey) {
                        return handlingFunction('projects.project.foreigndatasets.dataset.visualize', {
                            chartIdx: chartIdx,
                            datasetFullName: datasetSmartName,
                            projectKey: projectKey || ActiveProjectKey.get()
                        });
                    } else {
                        datasetSmartName = parts[1];
                    }
                }

                return handlingFunction('projects.project.datasets.dataset.visualize', {
                    chartIdx: chartIdx,
                    datasetName: datasetSmartName,
                    projectKey: projectKey || ActiveProjectKey.get()
                });
            },
            managedFolder: function(id, projectKey, contextProject, options = {}) {
                //Note that foreign dataset view is not implemented
                contextProject = contextProject || ActiveProjectKey.get();
                const ref = SmartId.resolve(id, projectKey);
                const tab = options.tab || 'view'

                if (contextProject && ref.projectKey != contextProject && !options.moveToTargetProject) {
                    return handlingFunction('projects.project.foreignmanagedfolders.managedfolder.' + tab, {
                        projectKey: contextProject,
                        sourceProjectKey: ref.projectKey,
                        odbId: ref.id,
                        discussionId: options.discussionId
                    });
                } else {
                    return handlingFunction('projects.project.managedfolders.managedfolder.' + tab, {
                        projectKey: ref.projectKey,
                        odbId: ref.id,
                        discussionId: options.discussionId
                    });
                }
            },
            streamingEndpoint: function(id, projectKey, contextProject, options = {}) {
                //Note that foreign streaming endpoint view is not implemented
                contextProject = contextProject || ActiveProjectKey.get();
                const ref = SmartId.resolve(id, projectKey);
                const tab = options.tab || 'settings' // TODO:

                if (contextProject && ref.projectKey != contextProject && !options.moveToTargetProject) {
                    return handlingFunction('projects.project.foreignstreaming-endpoints.streaming-endpoint.' + tab, {
                        projectKey: contextProject,
                        sourceProjectKey: ref.projectKey,
                        streamingEndpointId: ref.id,
                        discussionId: options.discussionId
                    });
                } else {
                    return handlingFunction('projects.project.streaming-endpoints.streaming-endpoint.' + tab, {
                        projectKey: ref.projectKey,
                        streamingEndpointId: ref.id,
                        discussionId: options.discussionId
                    });
                }
            },
            savedModel: function(id, projectKey, options = {}) {
                //Note that foreign saved model view is not implemented
                const ref = SmartId.resolve(id, projectKey);
                const tab = options.tab || 'versions';
                return handlingFunction('projects.project.savedmodels.savedmodel.' + tab, {
                    projectKey: ref.projectKey,
                    smId: ref.id,
                    discussionId: options.discussionId
                });
            },
            //deprecated use savedModel
            savedModelVersion: function(savedModelType, smId, fullModelId, projectKey) {
                return handlingFunction('projects.project.savedmodels.savedmodel.' +  savedModelType.toLowerCase() + '.report', {
                    smId: smId,
                    fullModelId: fullModelId,
                    projectKey: projectKey || ActiveProjectKey.get()
                });
            },
            modelEvaluationStore: function(id, projectKey, options = {}) {
                //Note that foreign model evaluation store view is not implemented
                const ref = SmartId.resolve(id, projectKey);
                return handlingFunction('projects.project.modelevaluationstores.modelevaluationstore.evaluations', {
                    projectKey: ref.projectKey,
                    mesId: ref.id,
                    discussionId: options.discussionId
                });
            },
            modelEvaluation: function(mesId, runId, projectKey) {
                //Note that foreign model evaluation store view is not implemented
                const ref = SmartId.resolve(mesId, projectKey);
                return handlingFunction('projects.project.modelevaluationstores.modelevaluationstore.evaluation.report', {
                    projectKey: ref.projectKey,
                    mesId: ref.id,
                    runId: runId
                });
            },
            recipe: function(recipeName, projectKey, options = {}) {
                const ref = SmartId.resolve(recipeName, projectKey);
                return handlingFunction('projects.project.recipes.recipe', {
                    projectKey: ref.projectKey,
                    recipeName: ref.id,
                    discussionId: options.discussionId
                });
            },
            analysis: function(id, projectKey, options = {}) {
                const ref = SmartId.resolve(id, projectKey);
                const tab = options.tab || 'script';
                return handlingFunction('projects.project.analyses.analysis.' + tab, {
                    projectKey: ref.projectKey,
                    analysisId: ref.id,
                    discussionId: options.discussionId
                });
            },
            //deprecated use analysis
            analysisChart: function(chartIdx, analysisId, projectKey) {
                return handlingFunction('projects.project.analyses.analysis.charts', {
                    chartIdx: chartIdx,
                    analysisId: analysisId,
                    projectKey: projectKey || ActiveProjectKey.get()
                });
            },
            //deprecated use analysis
            mlTask: function(mlTaskType, projectKey, analysisId, mlTaskId) {
                return handlingFunction(
                    'projects.project.analyses.analysis.ml.' + (mlTaskType == 'PREDICTION' ? 'predmltask' : 'clustmltask')+'.list.results',
                    {
                        projectKey: projectKey || ActiveProjectKey.get(),
                        analysisId: analysisId,
                        mlTaskId: mlTaskId
                    }
                );
            },
            sqlNotebook: function(id, projectKey, options = {}) {
                const ref = SmartId.resolve(id, projectKey);
                return handlingFunction('projects.project.notebooks.sql_notebook', {
                    projectKey: ref.projectKey,
                    notebookId: ref.id,
                    discussionId: options.discussionId
                });
            },
            jupyterNotebook: function(id, projectKey, options = {}) {
                const ref = SmartId.resolve(id, projectKey);
                return handlingFunction('projects.project.notebooks.jupyter_notebook', {
                    projectKey: ref.projectKey,
                    notebookId: ref.id,
                    discussionId: options.discussionId
                });
            },
            notebook: function(notebookType, notebookId, projectKey, options = {}) {
                if (notebookType.toUpperCase().includes('SQL')) {
                    return that.sqlNotebook(notebookId, projectKey, options);
                }
                return that.jupyterNotebook(notebookId, projectKey, options);
            },
            webapp: function(webAppId, projectKey, options = {}) {
                const ref = SmartId.resolve(webAppId, projectKey);
                const tab = options.tab || 'view';
                return handlingFunction("projects.project.webapps.webapp." + tab, {
                    projectKey: ref.projectKey || ActiveProjectKey.get(),
                    webAppId: ref.id,
                    webAppName: options.name,
                    discussionId: options.discussionId
                });
            },
            report: function(reportId, projectKey, options = {}) {
                const ref = SmartId.resolve(reportId, projectKey);
                const tab = options.tab || 'view';
                return handlingFunction("projects.project.reports.report." + tab, {
                    projectKey: ref.projectKey || ActiveProjectKey.get(),
                    reportId: ref.id,
                    reportName: options.name,
                    discussionId: options.discussionId
                });
            },
            scenario: function(scenarioId, projectKey, options = {}) {
                const ref = SmartId.resolve(scenarioId, projectKey);
                const tab = options.tab || 'runs.list';
                return handlingFunction("projects.project.scenarios.scenario." + tab, {
                    projectKey: ref.projectKey || ActiveProjectKey.get(),
                    scenarioId: ref.id,
                    discussionId: options.discussionId
                });
            },

            dashboard: function(id, projectKey, options = {}) {
                const ref = SmartId.resolve(id, projectKey);
                const tab = options.tab || 'view';
                return handlingFunction('projects.project.dashboards.dashboard.' + tab, {
                    projectKey: ref.projectKey,
                    dashboardId: ref.id,
                    dashboardName: options.name ? $filter('slugify')(options.name) : '',
                    pageId: options.pageId ? options.pageId : '',
                    fullScreen: options.fullScreen,
                    separator: '_',
                    discussionId: options.discussionId
                });
            },
            insight: function(id, projectKey, options = {}) {
                const ref = SmartId.resolve(id, projectKey);
                const tab = options.tab || 'view';
                return handlingFunction('projects.project.dashboards.insights.insight.' + tab, {
                    projectKey: ref.projectKey,
                    insightId: ref.id,
                    insightName: options.name ? $filter('slugify')(options.name) : '',
                    fullScreen: options.fullScreen,
                    discussionId: options.discussionId
                });
            },
            lambdaService: function(id, projectKey, options = {}) {
                const ref = SmartId.resolve(id, projectKey);
                const tab = options.tab || 'endpoints';
                return handlingFunction('projects.project.lambdaservices.service.' + tab, {
                    projectKey: ref.projectKey,
                    serviceId: ref.id,
                    discussionId: options.discussionId
                });
            },
            article: function(articleId, projectKey, options = {}) {
                const ref = SmartId.resolve(articleId, projectKey);
                const tab = options.tab || 'view';
                return handlingFunction("projects.project.wiki.article." + tab, {
                    projectKey: ref.projectKey || ActiveProjectKey.get(),
                    articleId: ref.id,
                    articleName: options.articleName,
                    discussionId: options.discussionId,
                    '#': ''
                });
            },
            cluster: function(clusterId, options = {}) {
                return handlingFunction('admin.clusters.cluster', {
                    clusterId: clusterId,
                    discussionId: options.discussionId
                });
            },
            statisticsWorksheet: function(worksheetId, contextProject) {
                const ref = SmartId.resolve(worksheetId, contextProject);
                return handlingFunction('projects.project.statisticsWorksheet', {
                    projectKey: ref.projectKey,
                    worksheetId: ref.id
                });
            },
            flowZone: function(id, contextProject, name, options = {}) {
                contextProject = contextProject || ActiveProjectKey.get();
                const ref = SmartId.resolve(id, contextProject);

                return handlingFunction('projects.project.flow', {
                    projectKey: ref.projectKey,
                    zoneId: ref.id,
                });
            },
            continuousActivity: function(id, contextProject, options = {}) {
                contextProject = contextProject || ActiveProjectKey.get();
                const ref = SmartId.resolve(id, contextProject);

                return handlingFunction('projects.project.continuous-activities.continuous-activity.runs', {
                    projectKey: ref.projectKey,
                    continuousActivityId: ref.id,
                });
            },
            /* for all taggable types */
            dssObject: function(type, id, projectKey, options = {}) { //if moveToTargetProject is falsish, explore as foreign object
                projectKey = projectKey || ActiveProjectKey.get();
                switch (type) {
                    case 'DATASET':
                        return that.dataset(id, projectKey, options);
                    case 'SAVED_MODEL':
                        return that.savedModel(id, projectKey, options);
                    case 'MODEL_EVALUATION_STORE':
                        return that.modelEvaluationStore(id, projectKey, options);
                    case 'MANAGED_FOLDER':
                        return that.managedFolder(id, projectKey, null, options);
                    case 'STREAMING_ENDPOINT':
                        return that.streamingEndpoint(id, projectKey, null, options);
                    case 'RECIPE':
                        return that.recipe(id, projectKey, options);
                    case 'ANALYSIS':
                        return that.analysis(id, projectKey, options);
                    case 'STATISTICS_WORKSHEET':
                        return that.statisticsWorksheet(id, projectKey, options);
                    case 'SQL_NOTEBOOK':
                        return that.sqlNotebook(id, projectKey, options);
                    case 'JUPYTER_NOTEBOOK':
                        return that.jupyterNotebook(id, projectKey, options);
                    case 'INSIGHT':
                        return that.insight(id, projectKey, options);
                    case 'WEB_APP':
                        return that.webapp(id, projectKey, options);
                    case 'REPORT':
                        return that.report(id, projectKey, options);
                    case 'ARTICLE':
                        return that.article(id, projectKey, options);
                    case 'SCENARIO':
                        return that.scenario(id, projectKey, options);
                    case 'DASHBOARD':
                        return that.dashboard(id, projectKey, options);
                    case 'PROJECT':
                        return that.project(id || projectKey, options);
                    case 'LAMBDA_SERVICE':
                        return that.lambdaService(id, projectKey, options);
                    case 'CLUSTER':
                        return that.cluster(id, options);
                    case 'JOB':
                        return that.job(projectKey, id);
                    case 'FLOW_ZONE':
                        return that.flowZone(id, projectKey, options);
                    case 'CONTINUOUS_ACTIVITY':
                        return that.continuousActivity(id, projectKey, options);
                }
                throw new Error("Unknown object type: '" + type + "' for " + projectKey + '.' + id);
            },
            taggableObject: function(tor, options = {}) { //if moveToTargetProject is falsish, explore as foreign object
                return that.dssObject(tor.type, tor.id, tor.projectKey, options);
            },
            table: function(projectKey, options = {}) {
                return handlingFunction('external-table', {
                    projectKey: projectKey,
                    discussionId: options.discussionId
                });
            },
            node: function(flowNode) {
                if (!flowNode) return;
                switch (flowNode.nodeType) {
                    case 'LOCAL_DATASET':
                        return that.dataset(flowNode.name, flowNode.projectKey);
                    case 'FOREIGN_DATASET':
                        return that.dataset(flowNode.projectKey + '.' + flowNode.name, ActiveProjectKey.get());
                    case 'LOCAL_SAVEDMODEL':
                        return that.savedModel(flowNode.name, flowNode.projectKey);
                    case 'FOREIGN_SAVEDMODEL':
                        return that.savedModel(flowNode.name, flowNode.projectKey);
                    case 'LOCAL_MODELEVALUATIONSTORE':
                        return that.modelEvaluationStore(flowNode.name, flowNode.projectKey);
                    case 'FOREIGN_MODELEVALUATIONSTORE':
                        return that.modelEvaluationStore(flowNode.name, flowNode.projectKey);
                    case 'LOCAL_MANAGED_FOLDER':
                        return that.managedFolder(flowNode.name, flowNode.projectKey);
                    case 'FOREIGN_MANAGED_FOLDER':
                        return that.managedFolder(flowNode.name, flowNode.projectKey);
                    case "LOCAL_STREAMING_ENDPOINT":
                        return that.streamingEndpoint(flowNode.name, flowNode.projectKey);
                    case "FOREIGN_STREAMING_ENDPOINT":
                        return that.streamingEndpoint(flowNode.name, flowNode.projectKey);
                    case 'RECIPE':
                        return that.recipe(flowNode.name, flowNode.projectKey);
                }
            },
            // contextProjectKey is the project the foreign dataset currently is in
            flowLink: function(flowNode, contextProjectKey) {
                const type = objectTypeFromNodeFlowType(flowNode.nodeType).toLowerCase();
                return handlingFunction('projects.project.flow', {
                    id: type + '_' + (type == 'recipe' ? '' : (flowNode.projectKey + '.')) + flowNode.name,
                    projectKey: contextProjectKey || flowNode.projectKey
                });
            },
            job: function(projectKey, jobId) {
                return handlingFunction("projects.project.jobs.job", {
                    projectKey : projectKey || ActiveProjectKey.get(),
                    jobId : jobId
                });
            },
            home: function() {
                return handlingFunction("home", {});
            },
            projectFolder: function(folderId) {
                return handlingFunction("project-list", {
                    folderId: folderId
                });
            },
            pluginDefinition: function(pluginId) {
                return handlingFunction('plugindev.definition', {
                    pluginId: pluginId
                });
            },
            pluginEditor: function(pluginId, path) {
                return handlingFunction('plugindev.editor', {
                    pluginId: pluginId,
                    filePath: path
                });
            }
        };
        return that;
    }

    function getDefaultTab(alternate) {
        const scd = $state.current.data;
        return scd && scd.tab ? scd.tab : alternate;
    }

    return {
        href: makeStateService($state.href.bind($state)),
        go: makeStateService($state.go.bind($state)),
        defaultTab: getDefaultTab
    };
});


app.directive("stdObjectBreadcrumb", function($rootScope, $state, Navigator, DatasetCustomFieldsService) {
    return {
        templateUrl: '/templates/widgets/std-object-breadcrumb.html',
        scope: {
            jobDef: "=jobDef",
            jobStatus: "=jobStatus"
        },
        link: function(scope) {
            scope.topNav = $rootScope.topNav;
            scope.$state = $state;
            scope.Navigator = Navigator;
            scope.DatasetCustomFieldsService = DatasetCustomFieldsService;
        }
    };
});


app.directive("itemHeader", function() {
    return {
        scope: {
            item: '=',
            href: '=',
            color: '@',
            icon: '@',
            title: '@',
            class: '@',
            flowLink: '=?',
            exposeObjectFn: '=?',
            exposeLabel: '=?',
            exposeDisabled: '=?',
            navigatorFn: '=?',
            editable: '=?',
            edit: '&?',
            deletable: '=?',
            delete: '&?',
        },
        transclude: true,
        template:
            `<div class="{{class}} item-header horizontal-flex">
                <div class="noflex object-icon universe-background {{color}}">
                    <div class="middle"><i class="icon {{icon}}"></i></div>
                </div>
                <h2 class="flex" title="{{title}}">
                    <a href="{{href}}" ng-if="href"><ng-transclude></ng-transclude></a>
                   <span ng-if="!href"><ng-transclude></ng-transclude></span>
                </h2>
                <div class="btn-items">
                    <button disabled-if='exposeDisabled' disabled-message="{{exposeLabel}}" ng-if="exposeObjectFn" ng-click="exposeObjectFn()" class="btn btn--secondary" alt="{{exposeLabel}}" title="{{exposeLabel}}" toggle="tooltip"><i class='icon-dku-share'></i> EXPOSE</button>
                    <a ng-if="navigatorFn" ng-click="navigatorFn()" class="btn btn--secondary btn--icon" alt="Navigate around" title="Navigate around">
                        <i class="icon-compass"></i>
                    </a>
                    <a ng-if="flowLink" class="btn btn--secondary btn--icon" href="{{flowLink}}" alt="See in flow" title="See in flow">
                        <i class="icon-dku-nav_flow"></i>
                    </a>
                    <a ng-if="editable" ng-click="edit()" class="btn btn--secondary btn--icon" alt="Edit">
                        <i class="icon-pencil"></i>
                    </a>
                    <a ng-if="deletable" ng-click="delete()" class="btn btn--secondary btn--icon" alt="Delete">
                        <i class="icon-trash"></i>
                    </a>
                </div>
            </div>`,
        link: function(scope, element, attrs, ctrl, transclude) {
          //NOSONAR ng1.6 doesnt work; doesnt appear necessary probably due to https://github.com/angular/angular.js/commit/32aa7e7395527624119e3917c54ee43b4d219301 //element.find('ng-transclude').replaceWith(transclude());
        }
    };
});


app.directive("simpleRightColActionHref", function($rootScope) {
    return {
        scope: {
            href: '@',
            label: '@',
            icon: '@',
            title: '@',
            target: '@'
        },
        replace: true,
        template:   `<div class="action-icon" full-click>
                        <a href="{{href}}" target="{{target}}" main-click><i class="{{icon}}"></i></a>
                        <label>{{label}}</label>
                    </div>`
    };
});


app.directive("simpleRightColActionClick", function($rootScope) {
    return {
        scope: {
            onClick : '&',
            label : '@',
            icon : '@',
            title : '@',
            isclickable : '<'
        },
        replace: true,
        template:   `<div class="action-icon" full-click>
                        <a ng-click="localClick()" main-click><i class="{{icon}}"></i></a>
                        <label>{{label}}</label>
                    </div>`,
        link: function(scope) {
            scope.localClick = function() {
                scope.onClick();
            }
        }
    };
});

app.directive("clickNext", function($timeout, $stateParams, $state, Dialogs) {
    return {
        scope: false,
        restrict: 'A',
        link: function(scope, element, attrs) {
            const $e = $(element);
            $e.on('click', function(evt) {
                $e.next().trigger(evt);
            });
        }
    };
});

app.directive("tabModel", function($timeout, $stateParams, $state, Dialogs) {
    return {
        scope: false,
        restrict: 'A',
        link: function(scope, element, attrs) {
            const $e = $(element),
                expr = attrs.tabModel + ' = $tab',
                klass = attrs.tabActiveClass || 'active',
                notify = attrs.tabModelNotify === "true" ? true : false,
                disableTransition = attrs.disableTransition === "true" ? true : false;

            function transition(evt, e) {
                const tab = e.getAttribute('tab-set');
                if (disableTransition) {
                    scope.$eval.bind(scope, expr, {$tab: tab})();
                } else {
                    $state.go('.', {selectedTab: tab}, {location: true, inherit: true, relative: $state.$current, notify: notify }).then(function() {
                        scope.$eval.bind(scope, expr, {$tab: tab})();
                    });
                }
            }

            $e.on('click', '[tab-set]', function(evt) {
                const that = this;
                if(scope.hooks && scope.hooks.dirty && scope.hooks.dirty()) {
                    Dialogs.confirm(scope, 'Unsaved changes', "You have unsaved changes. Are you sure you want to leave this page ?")
                        .then( _ => transition(evt, that) );
                } else {
                    scope.$apply( _ => transition(evt, that) );
                }
            });

            scope.$watch(attrs.tabModel, function(val) {
                $timeout(function() {
                    $e.find('[tab-active]').each(function() {
                        this.classList[this.getAttribute('tab-active') === val ? 'add' : 'remove'](klass);
                    });
                }, 0);
            });
        }
    };
});


app.service("QuickView", function(CreateCustomElementFromTemplate, $rootScope, $timeout) {
    const svc = this;

    let elScope, removeListener;

    this.show = function(projectKey, objectType, objectId) {
        if (projectKey === false) return;

        if (!elScope) {
            CreateCustomElementFromTemplate("/templates/object-details/quick-view.html", $rootScope, null, function(newScope) {
                elScope = newScope;
                elScope.hasObject = false;
                elScope.objectType = objectType;
                elScope.objectId = objectId;
                elScope.projectKey = projectKey;
                $timeout(function() { $('.object-quick-view-wrapper').addClass('visible'); });
            });
        } else {
            elScope.hasObject = false;
            elScope.objectType = objectType;
            elScope.objectId = objectId;
            elScope.projectKey = projectKey;
        }

        $('.object-quick-view-wrapper').removeClass('loading');
        removeListener = $rootScope.$on("$stateChangeStart", svc.hide);
    };

    this.showObject = function(object, objectType) {
        if (object === false) return;

        const objectData = {};
        objectData[objectType.toLowerCase()] = object;

        if (!elScope) {
            CreateCustomElementFromTemplate("/templates/object-details/quick-view.html", $rootScope, null, function(newScope) {
                elScope = newScope;
                elScope.hasObject = true;
                elScope.objectType = objectType;
                elScope.objectData = objectData;
                $timeout(function() { $('.object-quick-view-wrapper').addClass('visible'); });
            });
        } else {
            elScope.hasObject = true;
            elScope.objectType = objectType;
            elScope.objectData = objectData;
        }

        $('.object-quick-view-wrapper').removeClass('loading');
        removeListener = $rootScope.$on("$stateChangeStart", svc.hide);
    };

    this.hide = function() {
        if (elScope && elScope.dismiss) {
            elScope.dismiss();
            elScope = null;
        }

        if (removeListener) removeListener();
    };

    this.setLoading = function() {
        $('.object-quick-view-wrapper').addClass('loading');
    };
});

app.directive("objectDetails", function ($rootScope, $q, $stateParams, DataikuAPI, ActivityIndicator, RecipesUtils, QuickView, NotebooksUtils, StateUtils, LoggerProvider, CreateModalFromTemplate, TaggingService, TAGGABLE_TYPES, ActiveProjectKey, _SummaryHelper) {
    const logger = LoggerProvider.getLogger('objectDetails');

    return {
        restrict: 'E',
        template: '<div ng-if="objectType" ng-include="getTemplateFile()" />',
        scope: {
            projectKey: '=',
            objectType: '@',
            objectId: '=',
            data: '=?objectData',
            context: '@',
            hoverIntentCallback: '=?',
            editable: '=?',
            editCustomFields: '='
        },
        link: function($scope, element, attrs) {
            _SummaryHelper.addEditBehaviour($scope, element);

            $scope.uiState = {
                isHoverEdit: false
            };
            $scope.appConfig = $rootScope.appConfig;

            $scope.resolveObjectSmartId = resolveObjectSmartId;

            $scope.QuickView = QuickView;
            $scope.StateUtils = StateUtils;

            $scope.canWriteProject = () => $scope.editable;

            $scope.saveCustomFields = function (customFields) {
                $scope.$emit('customFieldsSummaryEdited', customFields);
            };

            $scope.inNavigator = function() {
                return $scope.context != 'right-column';
            };

            $scope.setHoverEdit = function (on)  {
                $scope.uiState.isHoverEdit = on;
            };

            $scope.inRightColumn = function() {
                return $scope.context == 'right-column';
            };

            $scope.inQuickView = function() {
                return $scope.context && $scope.context.toLowerCase() === 'quick-view'
            };

            if (!$scope.context) $scope.context = '';
            if ($scope.inQuickView()) {
                $scope.maxListItems = 5;
            }

            $scope.getTemplateFile = function() {
                return '/templates/object-details/' + $scope.objectType.toLowerCase() + '.html';
            };

            $scope.getTaggableObject = function() {
                return {
                    type: $scope.objectType.toUpperCase(),
                    projectKey: $scope.object.projectKey,
                    id: $scope.object.id || $scope.object.name,
                    displayName: $scope.object.displayName || $scope.object.name
                }
            };

            $rootScope.$on('toggleActiveRightCol', function(){
                $scope.object.active = !$scope.object.active;
            });

            $scope.toggleActive = function(scenario) {
                var message = scenario.active ? 'Activate ' : 'Deactivate ';
                $rootScope.$emit('toggleActiveList');
                message = message + 'auto-triggers of ' + scenario.projectKey + '.' + (scenario.name || scenario.id);
                DataikuAPI.scenarios.saveNoParams(scenario.projectKey, scenario, {commitMessage:message}).success(function(data){
                    // save the expanded states
                    ActivityIndicator.success("Saved");
                }).error(setErrorInScope.bind($scope));
            };

            $scope.isMetaDataEditable = function () {
                return !$scope.inNavigator() && $stateParams.projectKey;
            };

            $scope.isMetaDataSupported = function(){
                return TAGGABLE_TYPES.includes($scope.objectType.toUpperCase());
            }

            $scope.getAllTagsForProject = function () {
                const deferred = $q.defer();
                deferred.resolve(TaggingService.getProjectTags());
                return getRewrappedPromise(deferred);
            }

            $scope.setUpdatedMetaData = function(update) {
                const o = $scope.object;
                o.tags = update.tags;
                o.shortDesc = update.shortDesc;
                o.description = update.description;
            };

            $scope.$watch("data", function(nv) {
                if (!nv) return;
                enrichData();
                if($scope.object) {
                    $scope.object.isFlowObj = isShownInFlow($scope.objectType.toUpperCase())
                }
            });

            $scope.showEditMetadataModal = function () {
                if (!$scope.editable) {
                    return;
                }
                // _SummaryHelper add edit behavior and create a shortDesc obj
                // but we can erase safely the things related to the description
                $scope.state.shortDesc = '';
                $scope.state.description = '';
		$scope.state.customFields = {};

                CreateModalFromTemplate("/templates/widgets/edit-metadata-modal.html", $scope, null, function(modalScope) {

                    modalScope.cancel = function() {modalScope.dismiss();};

                    if (!modalScope.object) {
                        return;
                    }

                    modalScope.state.tags = {
                        newVal : undefined,
                        savedVal :angular.copy(modalScope.object.tags),
                        editing: false
                    };
                    modalScope.state.shortDesc = angular.copy(modalScope.object.shortDesc);
                    modalScope.state.description = angular.copy(modalScope.object.description);
		            modalScope.state.customFields = angular.copy(modalScope.object.customFields);

                    modalScope.startEditTags  = function() {
                        modalScope.state.tags.newVal = angular.copy(modalScope.state.tags.savedVal);
                        modalScope.state.tags.editing = true;
                    }
                    modalScope.cancelEditTags  = function() {
                        modalScope.state.tags.newVal = null;
                        modalScope.state.tags.editing = false;
                    }
                    modalScope.validateEditTags  = function() {
                        if (modalScope.state.tags.editing) {
                            modalScope.state.tags.savedVal = modalScope.state.tags.newVal;
                            modalScope.state.tags.editing = false;
                        }
                    }

                    modalScope.getAllTagsForProject = function () {
                        const deferred = $q.defer();
                        deferred.resolve(TaggingService.getProjectTags());
                        return getRewrappedPromise(deferred);
                    }
                    modalScope.save = function() {
                        const ui = modalScope.state;

                        if (modalScope.state.tags.editing) {
                            modalScope.validateEditTags();
                        }

                        const request = {
                            shortDesc: ui.shortDesc,
                            description: ui.description,
			    customFields: ui.customFields,
                            tags: ui.tags.newVal ? ui.tags.newVal : ui.tags.savedVal
                        };
                        DataikuAPI.taggableObjects.setMetaData($scope.getTaggableObject(), request)
                        .success(function() {
                            $scope.setUpdatedMetaData(request);
                            $rootScope.$broadcast('objectMetaDataChanged', request);
                            modalScope.resolveModal();
                        })
                        .error(setErrorInScope.bind($scope));
                    };

                },true);
                }

            $scope.isDescMoreLinkSupported = function () {
                return ($scope.objectType != "JUPYTER_NOTEBOOK");
            }

            $scope.showDescMoreLink = function () {
                if (!$scope.isDescMoreLinkSupported()) return false;
                if (!$scope.elDescWrapDiv || $scope.elDescWrapDiv.height()==0) {
                    $scope.elDescWrapDiv = $(element).find('.description-wrapper');
                    $scope.elDescFullDiv = $scope.elDescWrapDiv.children().first();
                }
                const showMore = ($scope.elDescWrapDiv.height() < $scope.elDescFullDiv.height());
                if (showMore) {
                    $scope.elDescWrapDiv.removeClass('full');
                } else if (!$scope.elDescWrapDiv.hasClass('full')) {
                    $scope.elDescWrapDiv.addClass('full');
                }
                return showMore;
            };

            $scope.expandDescription = () => {
                $scope.object.$descriptionExpanded = true;
            };

            $scope.objectSummaryLink = function() {
                const to = $scope.getTaggableObject();
                return $scope.StateUtils.href.taggableObject(to, {tab: 'summary'});
            };

            $scope.$watchCollection('[objectType, projectKey, objectId]', function(nv, ov) {
                if (!nv[0]) return;
                if (!attrs.hasOwnProperty('objectData') && (!nv[1] || !nv[2])) return;

                if (!attrs.hasOwnProperty('objectData')) {
                    switch ($scope.objectType.toUpperCase()) {
                    case 'CONNECTION':
                        return;

                    case 'DATASET_CONTENT':
                        let projectKey = $scope.projectKey,
                            name = $scope.objectId;
                        const parts = $scope.objectId.split('.');
                        if (parts.length == 2) {
                            projectKey = parts[0];
                            name = parts[1];
                        }
                        DataikuAPI.datasets.get(projectKey, name, ActiveProjectKey.get()).noSpinner()
                            .success(function(data) {
                                $scope.data = {dataset_content: data}
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'RECIPE':
                        DataikuAPI.flow.recipes.getFullInfo($scope.projectKey, $scope.objectId).noSpinner()
                            .success(function(data) {
                                $scope.data = data;
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'MANAGED_FOLDER':
                        DataikuAPI.managedfolder.getWithStatus($scope.projectKey, $scope.objectId).noSpinner()
                            .success(function(data) {
                                $scope.data = {folder: data};
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'STREAMING_ENDPOINT':
                        DataikuAPI.streamingEndpoints.getFullInfo($scope.projectKey, $scope.objectId).noSpinner()
                            .success(function(data){
                                $scope.data = data;
                            }).error(setErrorInScope.bind(scope));
                        return;

                    case 'SAVED_MODEL':
                        DataikuAPI.savedmodels.get($scope.projectKey, $scope.objectId).noSpinner()
                            .success(function(data) {
                                $scope.data = {model: data};
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'MODEL_EVALUATION_STORE':
                        DataikuAPI.modelevaluationstores.get($scope.projectKey, $scope.objectId).noSpinner()
                            .success(function(data) {
                                $scope.data = {model: data};
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'ANALYSIS':
                        DataikuAPI.analysis.getCore($scope.projectKey, $scope.objectId).noSpinner()
                            .success(function(data) {
                                 $scope.data = {analysis: data};
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'SQL_NOTEBOOK':
                        DataikuAPI.sqlNotebooks.get($scope.projectKey, $scope.objectId).noSpinner()
                            .success(function(data) {
                                $scope.data = {notebook: data};
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'JUPYTER_NOTEBOOK':
                        DataikuAPI.jupyterNotebooks.getNotebook($scope.projectKey, $scope.objectId, undefined).noSpinner()
                            .success(function(data) {
                                $scope.data = {notebook: data};
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'INSIGHT':
                        DataikuAPI.dashboards.insights.get($scope.projectKey, $scope.objectId).noSpinner()
                            .success(function(data) {
                                 $scope.data = {insight: data};
                            })
                            .error(setErrorInScope.bind($scope));
                        return;

                    case 'DASHBOARD':
                        DataikuAPI.dashboards.getFullInfo($scope.projectKey, $scope.objectId).noSpinner()
                          .success(function(data) {
                              $scope.data = data;
                          })
                          .error(setErrorInScope.bind($scope));
                        return;

                    case 'FLOW_ZONE':
                        DataikuAPI.zones.getFullInfo($scope.projectKey, $scope.objectId).noSpinner()
                          .success(function(data) {
                              $scope.data = data;
                          })
                          .error(setErrorInScope.bind($scope));
                        return;

                    case 'CONTINUOUS_ACTIVITY':

                        DataikuAPI.continuousActivities.getState(ActiveProjectKey.get(), $stateParams.continuousActivityId).noSpinner()
                            .success(function(data) {
                                $scope.data = data;
                            }).error(setErrorInScope.bind($scope));
                        return;
                    }
                    logger.error("Unknown type: "+$scope.objectType.toUpperCase());
                }
           });

           function refreshMetadata(o) {
                if (o.metaRefreshed) return;
                DataikuAPI.taggableObjects.getMetadata($scope.getTaggableObject()).success(function(data) {
                    o.description = data.description;
                    o.shortDesc = data.shortDesc;
                    o.tags = data.tags; //mjt suspicious that this was missing....
                    o.metaRefreshed = true;
                });
            }

            function isShownInFlow(objType) {

                switch(objType) {
                    case 'DATASET_CONTENT':
                    case 'RECIPE':
                    case 'DATASET':
                    case 'SAVED_MODEL':
                    case 'MODEL_EVALUATION_STORE':
                    case 'MANAGED_FOLDER':
                    case 'STREAMING_ENDPOINT':
                        return true;

                    //'CONNECTION', 'SCENARIO', 'ANALYSIS', 'SQL_NOTEBOOK', 'JUPYTER_NOTEBOOK', 'INSIGHT', 'DASHBOARD', 'WEB_APP', 'REPORT'
                    default:
                        return false;
                }
            }

            function enrichData() {
                const objectData = $scope.data;
                const objType = $scope.objectType.toUpperCase()

                switch(objType) {

                case 'CONNECTION':
                case 'BUNDLE':
                    return;
                case 'SCENARIO':
                    $scope.object = objectData.object;
                    refreshMetadata(objectData.object);
                    return;
                case 'DATASET_CONTENT':
                    if ($scope.data.dataset_content) {
                        $scope.dataset = $scope.data.dataset_content;
                    }
                    $scope.object = $scope.dataset;
                    return;

                case 'ANALYSIS':
                    if (!objectData.mlTasks) {
                        DataikuAPI.analysis.listMLTasks(objectData.analysis.projectKey, objectData.analysis.id)
                            .success(function (data) {
                                objectData.mlTasks = data;
                            })
                            .error(setErrorInScope.bind($scope));
                    }

                    if (!objectData.timeline) {
                        objectData.timeline = {};
                        if (objectData.analysis.creationTag) {
                            objectData.timeline.createdBy = objectData.analysis.creationTag.lastModifiedBy;
                            objectData.timeline.createdOn = objectData.analysis.creationTag.lastModifiedOn;
                        }
                        if (objectData.analysis.versionTag) {
                            objectData.timeline.lastModifiedBy = objectData.analysis.versionTag.lastModifiedBy;
                            objectData.timeline.lastModifiedOn = objectData.analysis.versionTag.lastModifiedOn;
                        }
                    }
                    $scope.object = objectData.analysis;
                    return;
                case 'RECIPE':
                    RecipesUtils.parseScriptIfNeeded(objectData);
                    //fetchTimeline(objectData.recipe.projectKey, objectData.recipe.name);
                    $scope.object = objectData.recipe;
                    return;
                case 'DATASET':
                    //fetchTimeline(objectData.dataset.projectKey, objectData.dataset.name);
                    $scope.object = objectData.dataset;
                    return;
                case 'STREAMING_ENDPOINT':
                    //fetchTimeline(objectData.streamingEndpoint.projectKey, objectData.streamingEndpoint.id);
                    $scope.object = objectData.streamingEndpoint;
                    return;
                case 'SQL_NOTEBOOK':
                    if (!objectData.notebook) objectData.notebook = objectData.sql_notebook;
                    $scope.object = objectData.notebook;
                    if (!objectData.notebook.niceConnection) {
                        objectData.notebook.niceConnection = NotebooksUtils.parseConnection(objectData.notebook.connection).niceConnection;
                    }
                    refreshMetadata(objectData.notebook);
                    return;
                case 'JUPYTER_NOTEBOOK':
                    if (!objectData.notebook) objectData.notebook = objectData.jupyter_notebook;
                    $scope.object = objectData.notebook;
                    refreshMetadata(objectData.notebook);
                    return;
                case 'INSIGHT':
                    $scope.object = objectData.insight;
                    return;
                case 'DASHBOARD':
                    $scope.object = objectData.dashboard;
                    return;
                case 'WEB_APP':
                    $scope.object = objectData.webapp;
                    return;
                case 'REPORT':
                    $scope.object = objectData.report;
                    return;
                case 'LAMBDA_SERVICE':
                    $scope.object = objectData.object;
                    return;
                case 'FLOW_ZONE':
                    $scope.object = objectData.zone;
                    return;
                case 'SAVED_MODEL':
                    if (!objectData.model) objectData.model = objectData.saved_model;
                    if (!objectData.status) {
                        switch (objectData.model.miniTask.taskType) {
                            case 'CLUSTERING':
                                DataikuAPI.savedmodels.clustering.getStatus(objectData.model.projectKey, objectData.model.id)
                                    .success(function (data) {
                                        objectData.status = data;
                                    })
                                    .error(setErrorInScope.bind($scope));
                                break;
                            case 'PREDICTION':
                                DataikuAPI.savedmodels.prediction.getStatus(objectData.model.projectKey, objectData.model.id)
                                    .success(function (data) {
                                        objectData.status = data;
                                    })
                                    .error(setErrorInScope.bind($scope));
                                break;
                        }
                    }
                    $scope.object = objectData.model;
                    return;
                case 'MODEL_EVALUATION_STORE':
                    if (!objectData.evaluationStore) objectData.evaluationStore = objectData.model_evaluation_store;
                    $scope.object = objectData.evaluationStore;
                    return;
                case 'MANAGED_FOLDER':
                    if (!objectData.folder) objectData.folder = objectData.managed_folder;
                    $scope.object = objectData.folder;
                    if (!objectData.timeline) {
                        objectData.timeline = {};
                        if (objectData.folder.creationTag) {
                            objectData.timeline.createdBy = objectData.folder.creationTag.lastModifiedBy;
                            objectData.timeline.createdOn = objectData.folder.creationTag.lastModifiedOn;
                        }
                        if (objectData.folder.versionTag) {
                            objectData.timeline.lastModifiedBy = objectData.folder.versionTag.lastModifiedBy;
                            objectData.timeline.lastModifiedOn = objectData.folder.versionTag.lastModifiedOn;
                        }
                    }
                    return;
                case "ARTICLE":
                    $scope.object = objectData.article ? objectData.article.data : (objectData.object ? objectData.object : undefined);
                    return
                case 'CONTINUOUS_ACTIVITY':
                    $scope.object = objectData.object;
                    return;
                }

                logger.error("Unknown type: "+$scope.objectType.toUpperCase());
            }

           function fetchTimeline(projectKey, objectId) {
                if (!$scope.data.timeline) {
                    const objectType = $scope.objectType == 'DATASET_CONTENT' ? 'DATASET' : $scope.objectType.toUpperCase();
                    DataikuAPI.timelines.getForObject(projectKey, objectType, objectId)
                        .success(function(data) {
                            $scope.data.timeline = data;
                        })
                        .error(setErrorInScope.bind($scope));
                }
            }
        }
    };
});


app.directive("rightColumnTab", function(QuickView) {
    return {
        scope: false,
        link: function(scope, element, attrs) {
            function updateActiveTab(tabName = "actions", update = false) {
                scope.uiState = { activeTab: tabName };
                if(scope.setCurrentTab !== undefined){ // old right panel still need to work
                    scope.setCurrentTab(tabName, update);
                }
            }

            attrs.$observe("rightColumnTab", value => {
              updateActiveTab(value);
            });

            Mousetrap.bind('space', function() {
                const nextTab = scope.displayedTabs[((scope.displayedTabs.findIndex(tab => tab.name === scope.currentTab) + 1) % scope.displayedTabs.length)];
                if (nextTab !== undefined) {
                    updateActiveTab(nextTab.name, true);
                }
            });
            scope.$on('$destroy', function() {
                Mousetrap.unbind('space');
                QuickView.hide();
            });
        }
    };
});


app.directive("samplingDetailsBlock", function($controller) {
    return {
        scope: {
            selection: '='
        },
        restrict: 'AE',
        templateUrl: '/templates/object-details/sampling-block.html'
    };
});


app.constant("STANDARDIZED_SIDE_PANEL_KEY", "dss.standardizedSidePanel");

app.service("ActivateOldRightPanel", function($state){
    return {
        isActivated: function(){
            return !["projects.project.analyses.list",
                     "projects.project.datasets.list",
                     "projects.project.streaming-endpoints.list",
                     "projects.project.bundlesdesign.list",
                     "projects.project.lambdaservices.list",
                     "projects.project.recipes.list",
                     "projects.project.notebooks.list",
                     "projects.project.scenarios.list",
                     "projects.project.continuous-activities.list",
                     "projects.project.webapps.list",
                     "projects.project.reports.list",
                     "projects.project.dashboards.list",
                     "projects.project.dashboards.insights.list",
                     "projects.project.flow"].includes($state.current.name);
        }
    }
});

app.directive('standardizedSidePanel', function (LocalStorage, STANDARDIZED_SIDE_PANEL_KEY, $rootScope, $stateParams) {
    return {
        restrict: "E",
        scope: true,
        templateUrl: '/templates/standardized-right-panel.html',
        link: function($scope, $element, attrs) {
            let allTabs = [
              {
                name: "actions",
                icon: "icon-dku-right-panel-actions"
              },
              {
                name: "details",
                icon: "icon-dku-right-panel-info"
              },
              {
                name: "preview",
                icon: "icon-dku-right-panel-preview"
              },
              {
                name: "schema",
                icon: "icon-dku-right-panel-schema"
              },
              {
                name: "discussions",
                icon: "icon-dku-right-panel-discussions"
              },
              {
                name: "lab",
                icon: "icon-dku-right-panel-lab"
              }
            ];

            let objectsToTabsMapping = [
              {
                objectTypes: ["DATASET", "LOCAL_DATASET", "FOREIGN_DATASET"],
                tabNames: ["actions", "details", "schema", "discussions", "lab"]
              },
              {
                objectTypes: ["RECIPE"],
                tabNames: ["actions", "details", "discussions"] // TO DO : add & implement preview tab
              },
              {
                objectTypes: ["ANALYSIS"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["SQL_NOTEBOOK"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["JUPYTER_NOTEBOOK"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["SCENARIO"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["WEB_APP"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["REPORT"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["SAVED_MODEL", "LOCAL_SAVEDMODEL", "FOREIGN_SAVEDMODEL"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["MODEL_EVALUATION_STORE", "LOCAL_MODELEVALUATIONSTORE", "FOREIGN_MODELEVALUATIONSTORE"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["MANAGED_FOLDER", "LOCAL_MANAGED_FOLDER", "FOREIGN_MANAGED_FOLDER"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["DASHBOARD"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["INSIGHT"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["ZONE"],
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["CONTINUOUS_ACTIVITY"],
                tabNames: ["actions", "details"]
              },
              {
                objectTypes: ["STREAMING_ENDPOINT", "LOCAL_STREAMING_ENDPOINT", "FOREIGN_STREAMING_ENDPOINT"], // the foreign version doesn't exist yet
                tabNames: ["actions", "details", "discussions"]
              },
              {
                objectTypes: ["BUNDLES_DESIGN"],
                tabNames: ["actions", "details"]
              },
              {
                objectTypes: ["BUNDLES_DESIGN_MULTI"], // not a taggable object, has own multi
                tabNames: ["actions"]
              },
              {
                objectTypes: ["LAMBDA_SERVICE"],
                tabNames: ["actions", "details"]
              },
              {
                objectTypes: ["MULTI"],
                tabNames: ["actions"]
              },
              {
                objectTypes: [""],
                tabNames: []
              }
            ];

            $scope.standardizedSidePanel.tabToToggle = '';

            function getLatestUsedTab(objectType, tabs) {
                const key = !objectType ? `${STANDARDIZED_SIDE_PANEL_KEY}.tab` : `${STANDARDIZED_SIDE_PANEL_KEY}.${objectType}.tab`;
                const lastTabState = LocalStorage.get(key);
                let lastGeneralTab = undefined;
                if (objectType) {
                    lastGeneralTab = getLatestUsedTab(null, tabs);
                }
                if (lastGeneralTab !== undefined) {
                    return lastGeneralTab;
                }
                if (lastTabState !== undefined && Array.isArray(tabs)) {
                    const found = tabs.map(tab => tab.name).find(tabName => tabName === lastTabState);
                    return found !== undefined || objectType === null ? found : "actions";
                }
                return Array.isArray(tabs) && tabs.length > 0 ? tabs[0].name : "actions";
            }

            function updateLatestUsedTab(objectType, tab) {
                const key = !objectType ? `${STANDARDIZED_SIDE_PANEL_KEY}.tab` : `${STANDARDIZED_SIDE_PANEL_KEY}.${objectType}.tab`;
                LocalStorage.set(key, tab);
                if (objectType) {
                    updateLatestUsedTab(null, tab);
                }
            }

            let panel = document.getElementsByClassName('right-panel')[0];
            $scope.standardizedSidePanel.opened = false;
            $scope.defaultTab = "actions"; // TO DO : replace with remembered state

            let openPanelOnLoad;
            switch (attrs.page) {
                case 'flow':
                    openPanelOnLoad = getLastPanelState(true);
                    break;
                case 'objects_list':
                    openPanelOnLoad = true;
                    break;
                case 'object':
                default:
                    openPanelOnLoad = false;
            }

            function computeTabsToDisplay() {
                for (let e of objectsToTabsMapping) {
                    if (e.objectTypes.includes(attrs.objectType)) {
                        $scope.displayedTabs = allTabs
                            .filter(tab => e.tabNames.includes(tab.name))
                            .sort((a, b) => e.tabNames.indexOf(a.name) - e.tabNames.indexOf(b.name));
                        if (e.tabNames && e.tabNames.length > 0 && !e.tabNames.includes($scope.defaultTab)) {
                            $scope.defaultTab = e.tabNames[0].name;
                        }
                        break;
                    }
                }
            }
            computeTabsToDisplay();

            attrs.$observe("closeOnClickOutside", newValue => {
                if (newValue) {
                    let mainPanes = document.getElementsByClassName('main-panel');
                    if (mainPanes.length > 0) {
                        let mainPane = mainPanes[0];
                        mainPane.addEventListener("click", (event) => {
                            if (event && event.target && event.target.id === "qa_generic_actions-dropdown") {
                                return;
                            }
                            $scope.closePanel();
                        });
                    }
                }
            });

            attrs.$observe("page", newValue => {
                computeTabsToDisplay();
                $scope.page = newValue;
            });

            attrs.$observe("objectType", newValue => {
                computeTabsToDisplay();
                $scope.objectType = newValue;
                const mayChooseDiscussionsTab = $stateParams.discussionId && $scope.displayedTabs.find(tab => tab.name == 'discussions');
                const lastUsedTab = (mayChooseDiscussionsTab && 'discussions') || getLatestUsedTab(newValue, $scope.displayedTabs);
                if (lastUsedTab !== $scope.currentTab && newValue !== '') {
                    $scope.currentTab = lastUsedTab;
                    updateLatestUsedTab(newValue, $scope.currentTab);
                }
                if (mayChooseDiscussionsTab) {
                    $scope.openPanel();
                }
            });

            attrs.$observe("toggleTab", tabName => {
                if (tabName && tabName != "") {
                    $scope.clickTab(tabName, true);
                }
            });

            attrs.$observe("singleType", newValue => {
                $scope.singleType = newValue;
            });

            $scope.getTooltipText = function (tab) {
                return tab.name.charAt(0).toUpperCase() + tab.name.slice(1);
            }

            $scope.togglePanel = function () {
                if ($scope.isPanelOpened()) {
                    $scope.closePanel();
                } else {
                    $scope.openPanel();
                }
            }
            
            $scope.openPanel = function () {
                $scope.changePanelStateIfNeeded(true);
                if (!angular.isDefined($scope.currentTab) || !$scope.currentTab) {
                    $scope.setCurrentTab($scope.defaultTab, false);
                }
            }
            
            $scope.closePanel = function () {
                $scope.changePanelStateIfNeeded(false);
            }

            $scope.clickTab = function (tabName, forceOpen=false) {
                if ($scope.isPanelOpened() && $scope.isCurrentTab(tabName) && !forceOpen) {
                    $scope.closePanel();
                } else {
                    $scope.setCurrentTab(tabName);
                    $scope.openPanel();
                }
            }

            $scope.setCurrentTab = function (tabName, update = true) {
                $scope.currentTab = tabName;
                if (update === true) {
                    if (tabName === 'actions' && attrs.objectType && attrs.objectType.includes('DATASET')) {
                        $rootScope.$broadcast('taggableObjectTagsChanged');
                    }
                    updateLatestUsedTab($scope.objectType, tabName);
                }
            }

            $scope.getCurrentTab = function() {
                return $scope.currentTab;
            };
            
            $scope.isCurrentTab = function (tabName) {
                return $scope.currentTab === tabName;
            }
            
            $scope.isPanelOpened = function () {
                return $scope.standardizedSidePanel.opened;
            }
            
            $scope.isTabActive = function (tabName) {
                return ($scope.isPanelOpened() && $scope.isCurrentTab(tabName));
            }

            $scope.changePanelStateIfNeeded = function (newState) {
                let currentState = $scope.isPanelOpened();
                if (currentState != newState) {
                    $scope.standardizedSidePanel.slidePanel();
                    savePanelState();
                }
            };

            // Init states
            if (openPanelOnLoad) {
                $scope.openPanel();
            }

            // Activate transitions only after page load
            // N.B. : If we start using this mecanism in other places in the code it would be better
            // to place the following block in a stateChange event in DataikuController
            let httpRequestsListener = $rootScope.$watch('httpRequests.length', (newVal) => {
                if (newVal !== 0) {
                    return;
                }

                const noTransitionsOnLoadClass = 'no-transitions-on-load';
                let noTransitionsElements = document.getElementsByClassName(noTransitionsOnLoadClass);
                const nbElmts = noTransitionsElements.length;
                
                for (let i = 0; i < nbElmts; i++) {
                    noTransitionsElements[0].classList.remove(noTransitionsOnLoadClass);
                }
                
                httpRequestsListener();
            });

            // Refresh fat-repeats of the object list views
            panel.addEventListener('transitionend', refreshFatRepeats); // To do : add event only if the page contains fat-repeat
            function refreshFatRepeats() {
                $rootScope.$broadcast("reflow"); // To do : call reflow only on the fat-repeat scope ?
            }

            // Settings using Local Storage
            function getLastPanelState(defaultValue) {
                let key = STANDARDIZED_SIDE_PANEL_KEY + '.' + attrs.page + 'Panel';
                let lastPanelState = LocalStorage.get(key);

                if (lastPanelState != undefined) {
                    return lastPanelState;
                } else {
                    return defaultValue;
                }
            }

            function savePanelState() {
                let key = STANDARDIZED_SIDE_PANEL_KEY + '.' + attrs.page + 'Panel';
                LocalStorage.set(key, $scope.isPanelOpened());
            }

        }
    };
});

app.directive("hideIfNoFilter", function($controller) {
    return {
        restrict : 'A',
        link : function(scope, element, attrs) {

            scope.$watch("noTags", function(nv) {
                let elmts = document.getElementsByClassName('list-page__filter');
                let c = 0;

                for(let i = 0; i < elmts.length; i++) {
                    c += elmts[i].childNodes.length;
                }

                if (c == 0 && nv) {
                    element.addClass('display-none');
                } else {
                    element.removeClass('display-none');
                }
            });
            
        }
    }
});

})();
