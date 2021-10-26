(function() {
'use strict';

const app = angular.module('dataiku', [
    'angular-blocks',
    'dataiku.controllers',
    'dataiku.services',
    'dataiku.logger',
    'dataiku.charts',

    'dataiku.common.func',
    'dataiku.common.nav',
    'dataiku.common.build',
    'dataiku.common.lists',
    'dataiku.common.pictures',
    'dataiku.common.sampling',

    'dataiku.services.help',

    'dataiku.shaker',
    'dataiku.shaker.analyse',
    'dataiku.shaker.table',
    'dataiku.shaker.misc',
    'dataiku.shaker.library',

    'dataiku.export.services',

    'dataiku.directives.bootstrap',
    'dataiku.directives.dip',
    'dataiku.directives.styling',
    'dataiku.directives.widgets',
    'dataiku.directives.forms',
    'dataiku.directives.snippetEditor',
    'dataiku.directives.scope',
    'dataiku.widgets.futures',
    'dataiku.widgets.integrations',
    'dataiku.widgets.drawers',
    'dataiku.widgets.tageditfield',

    'dataiku.filters',

    'dataiku.meanings',

    'dataiku.taggableobjects',

    'dataiku.notebooks.sql',
    'dataiku.rstudioserverembed',

    'dataiku.projects.settings',
    'dataiku.projects.actions',
    'dataiku.projects.directives',

    'dataiku.personal-home.directives',

    'dataiku.connections',

    'dataiku.datasets',
    'dataiku.datasets.status',
    'dataiku.datasets.custom',
    'dataiku.datasets.directives',
    'dataiku.datasets.foreign',
    'dataiku.datasets.partitioning',

    'dataiku.dashboards',
    'dataiku.dashboards.insights',

    'dataiku.webapps',
    'dataiku.report',

    'dataiku.metrics.core',
    'dataiku.metrics.views',
    'dataiku.metrics.savedmodels.views',
    'dataiku.metrics.edit',

    'dataiku.flow.graph',
    'dataiku.flow.tools',
    'dataiku.flow.project',
    'dataiku.flow.runtime',

    'dataiku.recipes',
    'dataiku.recipes.customcode',
    'dataiku.directives.insights',
    'dataiku.directives.simple_report',
    'dataiku.filters',


    'dataiku.admin',
    'dataiku.admin.codeenvs.common',
    'dataiku.admin.codeenvs.automation',
    'dataiku.admin.codeenvs.design',
    'dataiku.admin.security',
    'dataiku.admin.maintenance',
    'dataiku.admin.monitoring',
    'dataiku.admin.clusters',

    'dataiku.plugins',
    'dataiku.plugindev',
    'dataiku.folder_edit',
    'dataiku.catalog',
    'dataiku.deployer',
    'dataiku.apideployer',
    'dataiku.projectdeployer',

    /* ML (shared between analysis, saved model and insight) */
    'dataiku.ml.core',
    'dataiku.ml.predicted',
    'dataiku.ml.report',
    'dataiku.ml.explainability',
    'dataiku.ml.hyperparameters',

    'dataiku.analysis.core',
    'dataiku.analysis.script',
    'dataiku.analysis.mlcore',

    'dataiku.savedmodels',
    'dataiku.modelevaluationstores',

    'dataiku.managedfolder',

    /* Streaming endpoints */
    'dataiku.streaming-endpoints',

    'dataiku.scenarios',
    'dataiku.continuous-activities',
    'dataiku.monitoring',
    'dataiku.runnables',

    'dataiku.lambda',

    'dataiku.collab.timeline',
    'dataiku.collab.discussions',
    'dataiku.collab.wikis',
    'dataiku.git',

    'dataiku.bundles.common',
    'dataiku.bundles.design',
    'dataiku.bundles.automation',

    'dkuSanitize',

    'dataiku.integrations.alation',

    'dataiku.ngXmigration',

    /* 3rd party */
    'ngRoute',
    'ngSanitize',
    'ui.sortable',
    'ui.tree',
    'ui.router',
    'ui.codemirror',
    'ui.keypress',
    'infinite-scroll',
    'platypus.utils',
    'ui-rangeSlider',
    'pasvaz.bindonce',
    'colorContrast',
    'LocalStorageModule',
    'monospaced.elastic',
    'ngDragDrop',
    'checklist-model',
    '$strap'
]);


app.factory('dssInterceptor', function($location, $q, $rootScope) {
    return {
        'requestError': function(response) {
            const status = response.status;
            if (status == 401) {
                /*Don't redirect to login on failed login :D */
                if (response.config.url.indexOf("/api/login") >= 0) {
                    return $q.reject(response);
                }
                // It's not possible to inject $state here because of
                // Uncaught Error: Circular dependency: $templateFactory <- $state <- $http <- $compile
                // So we can't transition and have to refresh ...
                if ($location.path() !== '/login/') {
                    $rootScope.$evalAsync('appConfig.loggedIn = false');
                    $location.url("/login/?redirectTo=" + $location.path());
                } else {
                    return $q.reject(response);
                }
            } else {
                return $q.reject(response);
            }
        }
    };
});


app.config(function($stateProvider, $locationProvider, $urlRouterProvider, $httpProvider, $qProvider, $compileProvider) {

    $compileProvider.preAssignBindingsEnabled(true);
    $locationProvider.html5Mode(true);

    /* ************************* Top level routes ************************ */

    $stateProvider.state('root', {
        url: '/',
        params: {
            showSearchInNav: true
        },
        templateUrl: '/templates/personal-home.html',
        controller: 'PersonalHomeController',
        pageTitle: function(stateParams) {
            return "Home";
        }
    });
    $stateProvider.state('profile.ngx', {
        url: '/ngx-hello',
        template: '<ng2-downgrade-example></ng2-downgrade-example>'
    });
    $stateProvider.state('home', {
        url: '/home/',
        params: {
            showSearchInNav: true
        },
        templateUrl: '/templates/personal-home.html',
        controller: 'PersonalHomeController',
        pageTitle: function(stateParams) {
            return "Home";
        }
    });

    $stateProvider.state('wikis', {
        url: '/wikis/',
        params: {
            filterBy: undefined,
            standalone: true,
            row: 'wikis'
        },
        templateUrl: '/templates/personal-home.html',
        controller: 'PersonalHomeController',
        pageTitle: function(stateParams) {
            return "Wikis";
        }
    });

    $stateProvider.state('wikis.list', {
        url: 'list/',
        params: {
            filterBy: undefined,
            standalone: true,
            row: 'wikis'
        },
        templateUrl: '/templates/personal-home.html',
        controller: 'PersonalHomeController',
        pageTitle: function(stateParams) {
            return "Wikis";
        }
    });

    $stateProvider.state('home.expandedlist', {
        url: ':row/expandedlist',
        params: {
            filterBy: undefined
        },
        templateUrl: '/templates/personal-home.html',
        controller: 'PersonalHomeController',
        pageTitle: function(stateParams) {
            return "Home expanded";
        }
    });

    $stateProvider.state('home.expandedmosaic', {
        url: ':row/expandedmosaic',
        params: {
            filterBy: undefined,
            standalone: undefined
        },
        templateUrl: '/templates/personal-home.html',
        controller: 'PersonalHomeController',
        pageTitle: function(stateParams) {
            return "Home expanded mosaic";
        }
    });

    $stateProvider.state('project-list', {
        url: '/project-list/:folderId',
        controller: 'ProjectsListController',
        templateUrl: '/templates/projects-list/projects-list.html',
        pageTitle: function(stateParams) {
            return "Projects";
        }
    });

    $stateProvider.state('login', {
        url: '/login/?redirectTo',
        templateUrl: '/templates/login.html',
        controller: 'LoginController',
        pageTitle: function(stateParams) {
            return "Login";
        }
    });

    $stateProvider.state('logged-out', {
        url: '/logged-out',
        templateUrl: '/templates/logged-out.html',
        pageTitle: function(stateParams) {
            return "Logged out";
        }
    });

    $stateProvider.state('feedback', {
        url: '/feedback/',
        templateUrl: '/templates/feedback.html'
    });

    $stateProvider.state("blackhole", {
        url: "/blackhole/"
    });

    $stateProvider.state('projects', {
        url: '/projects',
        abstract: true,
        template: '<div ui-view class="h100"></div>'
    });

    $stateProvider.state('jambon', {
        url: '/admin/jambon/',
        templateUrl: '/templates/widgets/image-uploader-dialog.html'
    });


    /* ************************** Project Apps ********************** */

    $stateProvider.state('apps', {
        url: '/apps',
        abstract: true,
        template: "<div ui-view></div>"
    });

    $stateProvider.state('apps.list', {
        url: '/',
        controller: 'AppsListController',
        templateUrl: '/templates/apps/apps-list.html',
        pageTitle: function(stateParams) {
            return "Applications";
        }
    });

    $stateProvider.state('apps.app', {
        url: '/:appId',
        controller: 'AppPageController',
        templateUrl: '/templates/apps/app-page.html',
        pageTitle: function(stateParams) {
            return "App";
        }
    });

    // TODO: Maybe /profile isn't the best place for this?
    $stateProvider.state('oauth2', {
        url: '/profile/oauth2-response/?userState&success&message',
        controller: 'OAuth2ResponseController'
    });

    /* ************************** Project ********************** */

    $stateProvider.state('projects.project', {
        url: '/:projectKey',
        abstract: true,
        controller: 'ProjectBaseController',
        templateUrl: '/templates/projects/project.html'
    });

    $stateProvider.state('projects.project.home', {
        abstract: true,
        url: '',
        templateUrl: '/templates/projects/home/index.html',
        controller: 'ProjectHomeTabController',
    });

    $stateProvider.state('projects.project.home.regular', {
        url: '/?discussionId&testInstance',
        templateUrl: '/templates/projects/home/project-home.html',
        controller: 'ProjectHomeController',
        pageTitle: function(stateParams) {
            return "Summary";
        }
    });

    $stateProvider.state('projects.project.home.activity', {
        url: '/activity/',
        templateUrl: '/templates/projects/home/activity.html',
        controller: 'ProjectHomeController',
        pageTitle: function(stateParams) {
            return "Summary";
        }
    });

    $stateProvider.state('projects.project.home.status', {
        url: '/status',
        abstract: true,
        templateUrl: '/templates/projects/home/status.html',
        controller: 'ProjectMetricsController',
        pageTitle: function(stateParams) {
            return " Summary";
        }
    });

    $stateProvider.state('projects.project.home.status.settings', {
        url: '/settings',
        templateUrl: '/templates/projects/home/status-settings.html'
    });

    $stateProvider.state('projects.project.home.status.metrics', {
        url: '',
        templateUrl: '/templates/projects/home/status-metrics.html'
    });

    $stateProvider.state('projects.project.home.status.checks', {
        url: '/checks',
        templateUrl: '/templates/projects/home/status-checks.html'
    });

    /* Temporary redirect state */

    $stateProvider.state('projects.project.settings.tmp', {
        url: '/',
        controller: 'ProjectSettingsTmpController',
    });

    $stateProvider.state('projects.project.variables', {
        url: '/variables/',
        templateUrl: '/templates/projects/variables/variables.html'
    });

    $stateProvider.state('projects.project.appdesigner', {
        url: '/app-designer/',
        templateUrl: '/templates/apps/app-designer.html',
        controller: "AppDesignerController",
        pageTitle: function(stateParams) {
            return "Application designer";
        }
    });

    $stateProvider.state('projects.project.statisticsWorksheet', {
        url: '/statistics/worksheet/:worksheetId',
        template: '<ng2-eda-worksheet-redirection-page></ng2-eda-worksheet-redirection-page>'
    });

    $stateProvider.state('projects.project.settings', {
        url: '/settings/:selectedTab',
        templateUrl: '/templates/projects/settings/settings.html'
    });

    $stateProvider.state('projects.project.integrations', {
        url: '/settings/integrations',
        templateUrl: '/templates/projects/integrations/messaging-like-selection.html'
    });

    $stateProvider.state('projects.project.security', {
        url: '/security/:selectedTab',
        templateUrl: '/templates/projects/security/security.html'
    });

    $stateProvider.state("projects.project.libedition", {
        url: '/libedition',
        templateUrl: '/templates/plugins/development/lib-edition-project.html',
        controller: 'ProjectFolderEditionController',
        pageTitle: function(stateParams) {
            return "Library Editor";
        }
    });

    $stateProvider.state('projects.project.libedition.libpython', {
        url: '/libpython',
        redirectTo: 'projects.project.libedition'
    });

    $stateProvider.state('projects.project.libedition.localstatic', {
        url: '/localstatic',
        redirectTo: 'projects.project.libedition'
    });

    $stateProvider.state('projects.project.flow', {
        url: '/flow/?id&?zoneId',
        templateUrl: '/templates/flow-editor/flow-editor.html',
        pageTitle: function(stateParams) {
            return "Flow";
        }
    });

    $stateProvider.state('projects.project.version-control', {
        url: '/version-control/',
        templateUrl: '/templates/projects/git/project-git.html',
        controller: "ProjectVersionControlController",
        pageTitle: function(stateParams) {
            return "Version control";
        }
    });


    /* ************************** Dataset ********************** */

    $stateProvider.state('projects.project.datasets', {
        url: '/datasets',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.datasets.list', {
        url: '/',
        templateUrl: '/templates/datasets/list.html',
        controller: 'DatasetsListController',
        pageTitle: function(stateParams) {
            return "Datasets";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset', {
        url: '/:datasetName?discussionId',
        abstract: true,
        controller: 'DatasetCommonController',
        templateUrl: '/templates/datasets/dataset.html'
    });

    $stateProvider.state('projects.project.datasets.dataset.summary', {
        url: '/summary/',
        templateUrl: '/templates/datasets/summary.html',
        controller: 'DatasetSummaryController',
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Summary";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset.settings', {
        url: '/settings/',
        templateUrl: '/templates/datasets/settings.html',
        controller: 'DatasetSettingsController',
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Settings";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset.history', {
        url: '/history/',
        templateUrl: '/templates/datasets/history.html',
        controller: 'DatasetHistoryController',
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - History";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset.statistics', {
        url: '/statistics',
        template: `<ng2-eda
            dataset-name="{{$state.params.datasetName}}"
            project-key="{{$state.params.projectKey}}"
            worksheet-id="{{$state.params.worksheetId}}"></ng2-eda>`,
        controller: 'DatasetStatisticsController',
        reloadOnSearch: false,
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Statistics";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset.statistics.worksheet', {
        url: '/worksheet/:worksheetId',
        reloadOnSearch: false,
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Statistics";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset.edit', {
        url: '/edit/',
        templateUrl: '/templates/datasets/edit-dataset.html',
        controller: 'DatasetEditController',
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Edit";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset.explore', {
        url: '/explore/',
        templateUrl: '/templates/datasets/explore.html',
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Explore";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset.status', {
        url: '/status',
        abstract: true,
        templateUrl: '/templates/datasets/status.html',
        controller: 'DatasetStatusController',
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Status";
        }
    });

    $stateProvider.state('projects.project.datasets.dataset.status.settings', {
        url: '/settings/:selectedTab',
        templateUrl: '/templates/datasets/status-settings.html'
    });

    $stateProvider.state('projects.project.datasets.dataset.status.metrics', {
        url: '',
        templateUrl: '/templates/datasets/status-metrics.html'
    });

    $stateProvider.state('projects.project.datasets.dataset.status.checks', {
        url: '/checks',
        templateUrl: '/templates/datasets/status-checks.html'
    });

    $stateProvider.state('projects.project.datasets.dataset.visualize', {
        url: '/visualize/?chartIdx',
        templateUrl: '/templates/datasets/visualize.html',
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Visualize";
        }
    });

    $stateProvider.state('projects.project.datasets.new_with_type', {
        url: '/new/:type?fromOdbSmartId?fromOdbItemPath?fromOdbItemDirectory?zoneId',
        abstract: true,
        templateUrl: '/templates/datasets/dataset.html',
        controller: 'DatasetNewController',
    });

    $stateProvider.state('projects.project.datasets.new_with_type.settings', {
        url: '/?prefillParams',
        templateUrl: '/templates/datasets/new-settings.html',
        controller: 'DatasetSettingsController',
        pageTitle: function(stateParams) {
            return "New " + stateParams.type + " dataset";
        }
    });

    /* ************************** Foreign view of datasets ********************** */

    $stateProvider.state('projects.project.foreigndatasets', {
        url: '/foreigndatasets',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.foreigndatasets.dataset', {
        url: '/:datasetFullName',
        abstract: true,
        controller: 'ForeignDatasetCommonController',
        templateUrl: '/templates/foreigndatasets/dataset.html'
    });

    $stateProvider.state('projects.project.foreigndatasets.dataset.explore', {
        url: '/explore/',
        templateUrl: '/templates/foreigndatasets/explore.html',
        pageTitle: function(stateParams) {
            return stateParams.datasetFullName + " - Explore";
        }
    });

    $stateProvider.state('projects.project.foreigndatasets.dataset.visualize', {
        url: '/visualize/?insightId',
        templateUrl: '/templates/foreigndatasets/visualize.html',
        pageTitle: function(stateParams) {
            return stateParams.datasetFullName + " - Visualize";
        }
    });

    $stateProvider.state('projects.project.foreigndatasets.dataset.statistics', {
        url: '/statistics',
        template: `<ng2-eda
            dataset-name="{{$state.params.datasetFullName}}"
            project-key="{{$state.params.projectKey}}"
            worksheet-id="{{$state.params.worksheetId}}"></ng2-eda>`,
        controller: 'DatasetStatisticsController',
        reloadOnSearch: false,
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Statistics";
        }
    });

    $stateProvider.state('projects.project.foreigndatasets.dataset.statistics.worksheet', {
        url: '/worksheet/:worksheetId',
        reloadOnSearch: false,
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Statistics";
        }
    });

    $stateProvider.state('projects.project.foreigndatasets.dataset.edit', {
        url: '/edit/',
        templateUrl: '/templates/datasets/edit-dataset.html',
        controller: 'DatasetEditController',
        pageTitle: function(stateParams) {
            return stateParams.datasetName + " - Edit";
        }
    });

    /* ************************** Streaming enpdoints ********************** */

    $stateProvider.state('projects.project.streaming-endpoints', {
        url: '/streaming-endpoints',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.streaming-endpoints.list', {
        url: '/',
        templateUrl: '/templates/streaming-endpoints/list.html',
        controller: 'StreamingEndpointsListController',
        pageTitle: function(stateParams) {
            return "Streaming endpoints";
        }
    });

    $stateProvider.state('projects.project.streaming-endpoints.streaming-endpoint', {
        url: '/:streamingEndpointId?discussionId',
        abstract: true,
        controller: 'StreamingEndpointPageController',
        templateUrl: '/templates/streaming-endpoints/streaming-endpoint.html'
    });

    $stateProvider.state('projects.project.streaming-endpoints.streaming-endpoint.settings', {
        url: '/settings/',
        templateUrl: '/templates/streaming-endpoints/settings.html',
        controller: 'StreamingEndpointSettingsController',
        pageTitle: function(stateParams) {
            return stateParams.streamingEndpointId + " - Settings";
        }
    });
    
    $stateProvider.state('projects.project.streaming-endpoints.streaming-endpoint.history', {
        url: '/history/',
        templateUrl: '/templates/streaming-endpoints/history.html',
        controller: 'StreamingEndpointHistoryController',
        pageTitle: function(stateParams) {
            return stateParams.streamingEndpointId + " - History";
        }
    });

    $stateProvider.state('projects.project.streaming-endpoints.streaming-endpoint.explore', {
        url: '/explore/',
        templateUrl: '/templates/streaming-endpoints/explore.html',
        controller: 'StreamingEndpointExploreController',
        pageTitle: function(stateParams) {
            return stateParams.streamingEndpointId + " - Explore";
        }
    });

    /* ************************** Analysis ********************** */

    $stateProvider.state('projects.project.analyses', {
        url: '/analysis',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.analyses.list', {
        url: '/?datasetId',
        templateUrl: '/templates/analysis/list.html',
        controller: "AnalysesListController",
        pageTitle: function(stateParams) {
            return " Analyses";
        }
    });

    $stateProvider.state('projects.project.analyses.analysis', {
        url: '/:analysisId?discussionId',
        abstract: true,
        templateUrl: '/templates/analysis/analysis.html',
        controller: "AnalysisCoreController",
        pageTitle: function(stateParams) {
            return " Analysis";
        }
    });

    $stateProvider.state('projects.project.analyses.analysis.summary', {
        url: '/',
        templateUrl: '/templates/analysis/summary.html',
        controller: "AnalysisSummaryController"
    });

    $stateProvider.state('projects.project.analyses.analysis.script', {
        url: '/script/',
        templateUrl: '/templates/analysis/script.html',
    });

    $stateProvider.state('projects.project.analyses.analysis.charts', {
        url: '/charts/?chartIdx',
        templateUrl: '/templates/analysis/charts.html',
    });

    $stateProvider.state('projects.project.analyses.analysis.ml', {
        url: '/ml',
        abstract: true,
        template: '<div ui-view></div>'
    });
    // You never stay on this state except if no mltask
    $stateProvider.state('projects.project.analyses.analysis.ml.list', {
        url: '/',
        templateUrl: '/templates/analysis/mltasks.html',
        controller: "AnalysisMLTasksController"
    });

    /* ******************** Analysis/ML/Prediction **************** */

    $stateProvider.state('projects.project.analyses.analysis.ml.predmltask', {
        url: '/p/:mlTaskId',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.predmltask.list', {
        url: '/list',
        abstract: true,
        templateUrl: '/templates/analysis/models.html',
        controller: 'PMLTaskBaseController'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.predmltask.list.design', {
        url: '/design',
        templateUrl: '/templates/analysis/prediction/models-design.html',
        controller: 'PMLTaskDesignController'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.predmltask.list.results', {
        url: '/results',
        templateUrl: '/templates/analysis/mlcommon/models-results.html',
        controller: 'PMLTaskResultController'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.predmltask.model', {
        url: '/:fullModelId',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.predmltask.model.predictedtable', {
        url: '/table/',
        templateUrl: '/templates/analysis/prediction/model/model-predicted-table.html'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.predmltask.model.predictedcharts', {
        url: '/charts/',
        templateUrl: '/templates/analysis/prediction/model/model-predicted-charts.html'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.predmltask.model.report', {
        url: '/report/?exportMode',
        templateUrl: '/templates/analysis/prediction/model/model-report.html'
    });

    /* ******************** Analysis/ML/Clustering **************** */

    $stateProvider.state('projects.project.analyses.analysis.ml.clustmltask', {
        url: '/c/:mlTaskId',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.clustmltask.list', {
        url: '/list',
        abstract: true,
        templateUrl: '/templates/analysis/models.html',
        controller: 'CMLTaskBaseController'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.clustmltask.list.design', {
        url: '/design',
        templateUrl: '/templates/analysis/clustering/models-design.html',
        controller: 'CMLTaskDesignController'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.clustmltask.list.results', {
        url: '/results',
        templateUrl: '/templates/analysis/mlcommon/models-results.html',
        controller: 'CMLTaskResultController'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.clustmltask.model', {
        url: '/:fullModelId',
        abstract: true,
        template: '<div ui-view></div>'
    });
    $stateProvider.state('projects.project.analyses.analysis.ml.clustmltask.model.predictedtable', {
        url: '/table/',
        templateUrl: '/templates/analysis/clustering/model/c-model-predicted-table.html'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.clustmltask.model.predictedcharts', {
        url: '/charts/',
        templateUrl: '/templates/analysis/clustering/model/c-model-predicted-charts.html'
    });

    $stateProvider.state('projects.project.analyses.analysis.ml.clustmltask.model.report', {
        url: '/report/',
        templateUrl: '/templates/analysis/clustering/model/c-model-report.html'
    });

    /* ************************** Saved Model (Flow) ********************** */

    $stateProvider.state('projects.project.savedmodels', {
        url: '/savedmodels',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel', {
        url: '/:smId?discussionId',
        abstract: true,
        controller: "SavedModelController",
        templateUrl: '/templates/savedmodels/savedmodel.html'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.summary', {
        url: '/summary/',
        controller: "SavedModelSummaryController",
        templateUrl: '/templates/savedmodels/summary.html'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.settings', {
        url: '/settings/',
        controller: "SavedModelSettingsController",
        templateUrl: '/templates/savedmodels/settings.html'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.status', {
        url: '/status',
        templateUrl: '/templates/savedmodels/status.html'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.status.metrics', {
        url: '/metrics/',
        templateUrl: '/templates/savedmodels/status-metrics.html'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.status.checks', {
        url: '/checks/',
        templateUrl: '/templates/savedmodels/status-checks.html'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.versions', {
        url: '/versions/',
        controller: "SavedModelVersionsController",
        templateUrl: '/templates/savedmodels/versions.html'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.prediction', {
        url: '/p',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.prediction.report', {
        url: '/:fullModelId/?exportMode',
        templateUrl: '/templates/savedmodels/prediction-report.html'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.clustering', {
        url: '/c',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.savedmodels.savedmodel.clustering.report', {
        url: '/:fullModelId/',
        templateUrl: '/templates/savedmodels/clustering-report.html'
    });

    /* **************************  Model Evaluation Store (Flow) ********************** */

    $stateProvider.state('projects.project.modelevaluationstores', {
        url: '/modelevaluationstores',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.modelevaluationstores.modelevaluationstore', {
        url: '/:mesId?discussionId',
        abstract: true,
        controller: "ModelEvaluationStoreController",
        templateUrl: '/templates/modelevaluationstores/modelevaluationstore.html'
    });

    $stateProvider.state('projects.project.modelevaluationstores.modelevaluationstore.evaluations', {
        url: '/evaluations',
        controller: "ModelEvaluationStoreEvaluationsController",
        templateUrl: '/templates/modelevaluationstores/evaluations.html'
    });

    $stateProvider.state('projects.project.modelevaluationstores.modelevaluationstore.perfdrift', {
        url: '/perfdrift',
        controller: "ModelEvaluationStorePerfDriftController",
        templateUrl: '/templates/modelevaluationstores/perfdrift.html'
    });

    $stateProvider.state('projects.project.modelevaluationstores.modelevaluationstore.evaluation', {
        url: '/evaluations/:runId',
        abstract: true,
        controller: "ModelEvaluationStoreEvaluationController",
        templateUrl: '/templates/modelevaluationstores/evaluation.html'
    });

    $stateProvider.state('projects.project.modelevaluationstores.modelevaluationstore.evaluation.report', {
        url: '/report',
        templateUrl: '/templates/modelevaluationstores/evaluation-report.html'
    });

    $stateProvider.state('projects.project.modelevaluationstores.modelevaluationstore.evaluation.statistics', {
        url: '/statistics',
        templateUrl: '/templates/modelevaluationstores/evaluation-statistics.html'
    });

    $stateProvider.state('projects.project.modelevaluationstores.modelevaluationstore.summary', {
        url: '/summary/',
        controller: "ModelEvaluationStoreSummaryController",
        templateUrl: '/templates/modelevaluationstores/summary.html'
    });

    $stateProvider.state('projects.project.modelevaluationstores.modelevaluationstore.settings', {
        url: '/settings/',
        controller: "ModelEvaluationStoreSettingsController",
        templateUrl: '/templates/modelevaluationstores/settings.html'
    });

    /* ************************** Managed folder (Flow) ********************** */

    $stateProvider.state('projects.project.managedfolders', {
        url: '/managedfolder',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.managedfolders.managedfolder', {
        url: '/:odbId?discussionId',
        abstract: true,
        controller: "ManagedFolderBaseController",
        templateUrl: '/templates/managedfolder/managedfolder.html'
    });

    $stateProvider.state('projects.project.managedfolders.managedfolder.summary', {
        url: '/summary/',
        controller: "ManagedFolderSummaryController",
        templateUrl: '/templates/managedfolder/summary.html',
        pageTitle: function(stateParams) {
            return " Folder";
        }
    });

    $stateProvider.state('projects.project.managedfolders.managedfolder.view', {
        url: '/view/',
        controller: "ManagedFolderViewController",
        templateUrl: '/templates/managedfolder/view.html',
        pageTitle: function(stateParams) {
            return " Folder";
        }
    });

    $stateProvider.state('projects.project.managedfolders.managedfolder.settings', {
        url: '/settings/',
        controller: "ManagedFolderSettingsController",
        templateUrl: '/templates/managedfolder/settings.html',
        pageTitle: function(stateParams) {
            return " Folder";
        }
    });

    $stateProvider.state('projects.project.managedfolders.managedfolder.status', {
        url: '/status',
        abstract: true,
        templateUrl: '/templates/managedfolder/status.html',
        controller: 'ManagedFolderStatusController',
        pageTitle: function(stateParams) {
            return " Folder";
        }
    });

    $stateProvider.state('projects.project.managedfolders.managedfolder.status.settings', {
        url: '/settings',
        templateUrl: '/templates/managedfolder/status-settings.html'
    });

    $stateProvider.state('projects.project.managedfolders.managedfolder.status.metrics', {
        url: '',
        templateUrl: '/templates/managedfolder/status-metrics.html'
    });

    $stateProvider.state('projects.project.managedfolders.managedfolder.status.checks', {
        url: '/checks',
        templateUrl: '/templates/managedfolder/status-checks.html'
    });

    /* ************************** Foreign view of managed folders ********************** */

    $stateProvider.state('projects.project.foreignmanagedfolders', {
        url: '/foreignmanagedfolder',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.foreignmanagedfolders.managedfolder', {
            url: '/:odbId?discussionId?sourceProjectKey',
            abstract: true,
            controller: "ManagedFolderBaseController",
            templateUrl: '/templates/foreignmanagedfolder/managedfolder.html'
        });

    $stateProvider.state('projects.project.foreignmanagedfolders.managedfolder.view', {
            url: '/view/',
            controller: "ManagedFolderViewController",
            templateUrl: '/templates/managedfolder/view.html',
            pageTitle: function(stateParams) {
                return " Folder";
            }
        });

    /* ************************** Recipes ********************** */

    $stateProvider.state('projects.project.recipes', {
        url: '/recipes',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.recipes.list', {
        url: '/',
        templateUrl: '/templates/recipes/list.html',
        controller: 'RecipesListController',
        pageTitle: function(stateParams) {
            return "Recipes";
        }
    });

    $stateProvider.state('projects.project.recipes.new', {
        url: '/new/:type/?prefill&input&output',
        templateUrl: '/templates/recipes/recipe-editor.html',
        controller: 'RecipeEditorController',
        pageTitle: function(stateParams) {
            return "New " + stateParams.type + " recipe";
        }
    });

    $stateProvider.state('projects.project.recipes.recipe', {
        url: '/:recipeName/?newlyCreated?discussionId',
        templateUrl: '/templates/recipes/recipe-editor.html',
        controller: 'RecipeEditorController',
        pageTitle: function(stateParams) {
            return stateParams.recipeName + " - Recipe";
        }
    });

    $stateProvider.state('projects.project.recipes.recipesummary', {
        url: '/:recipeName/summary?newlyCreated',
        templateUrl: '/templates/recipes/recipe-editor.html',
        controller: 'RecipeEditorController',
        pageTitle: function(stateParams) {
            return stateParams.recipeName + " - Recipe";
        },
        data : {
            tab: 'summary'
        }
    });

    /* ************************** Flow jobs / monitoring  ********************** */

    $stateProvider.state('projects.project.jobs', {
        url: '/jobs',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.jobs.list', {
        url: '/',
        templateUrl: '/templates/jobs/list.html',
        controller: 'FlowJobsBrowserController',
        pageTitle: function(stateParams) {
            return "Jobs";
        }
    });

    $stateProvider.state('projects.project.jobs.job', {
        url: '/:jobId/?hideFlow',
        templateUrl: '/templates/jobs/job-status.html',
        pageTitle: function(stateParams) {
            return "Job " + stateParams.jobId + "";
        }
    });

    $stateProvider.state('projects.project.datasets.new', {
        url: '/new/?zoneId',
        templateUrl: '/templates/datasets/new-dataset.html',
        controller: function($scope, CreateModalFromTemplate, TopNav, GlobalProjectActions) {
            TopNav.setItem(null);
            TopNav.setLocation(TopNav.TOP_FLOW, "new-dataset", TopNav.TABS_NONE, null);
            $scope.newManagedDataset = function() {
                CreateModalFromTemplate("/templates/flow-editor/new-managed-dataset.html",
                    $scope, "NewManagedDatasetController");
            };

            GlobalProjectActions.getAllDatasetsByTiles($scope).then(val => $scope.datasetTiles = val);

            // similar to what's done for the new dataset menu. Instead of a submenu, we show a tile
            const pluginSections = {};
            // get connectors, grouped by ownerPluginId
            $scope.appConfig.customDatasets.forEach(function(x) {
                let pluginSection = pluginSections[x.ownerPluginId];
                if (pluginSection == null) {
                    pluginSection = {
                        pluginId: x.ownerPluginId,
                        items: []
                    };
                    pluginSections[x.ownerPluginId] = pluginSection;
                }

                pluginSection.items.push({
                    type: x.datasetType,
                    label: x.desc.meta != null && x.desc.meta.label != null ? x.desc.meta.label : x.ownerPluginId,
                    icon: x.desc.meta != null ? x.desc.meta.icon : null
                });
            });
            // get fs providers, grouped by ownerPluginId
            $scope.appConfig.customFSProviders.forEach(function(x) {
                let pluginSection = pluginSections[x.ownerPluginId];
                if (pluginSection == null) {
                    pluginSection = {
                        pluginId: x.ownerPluginId,
                        items: []
                    };
                    pluginSections[x.ownerPluginId] = pluginSection;
                }

                pluginSection.items.push({
                    type: x.fsProviderType,
                    label: x.desc.meta != null && x.desc.meta.label != null ? x.desc.meta.label : x.ownerPluginId,
                    icon: x.desc.meta != null ? x.desc.meta.icon : null
                });
            });
            // fetch plugin label for each ownerPluginId
            $scope.customConnectorPlugins = [];
            $.each(pluginSections, function(pluginId, pluginData) {
                const plugin = Array.dkuFindFn($scope.appConfig.loadedPlugins, function(n) {
                    return n.id == pluginData.pluginId
                });
                if (plugin == null) {
                    return;
                }
                pluginData.items.forEach(function(dtype) {
                    if (!dtype.icon) dtype.icon = plugin.icon;
                });
                $scope.customConnectorPlugins.push({
                    isSection: true,
                    id: "plugin_" + plugin.id,
                    icon: plugin.icon,
                    label: plugin.label || plugin.id,
                    connectors: pluginData.items,
                    plugin: plugin
                });
            });
        },
        pageTitle: function(stateParams) {
            return "New dataset";
        }
    });

    /* ************************** Notebooks (SQL and jupyter) ********************** */

    $stateProvider.state('projects.project.notebooks', {
        url: '/notebooks',
        abstract: true,
        template: '<div ui-view class="h100"></div>'
    });

    $stateProvider.state('projects.project.notebooks.list', {
        url: '/?datasetId',
        templateUrl: '/templates/notebooks/list.html',
        controller: 'NotebooksController',
        pageTitle: function(stateParams) {
            return "Notebooks";
        }
    });

    $stateProvider.state('projects.project.notebooks.jupyter_notebook', {
        url: '/jupyter/:notebookId/?discussionId&kernel_name',
        templateUrl: '/templates/notebooks/jupyter_notebook.html',
        controller: 'IPythonController',
        pageTitle: function(stateParams) {
            return stateParams.notebookId + " | Jupyter notebook";
        }
    });

    $stateProvider.state('projects.project.notebooks.jupyter_notebook_copied', {
        url: '/jupyter/:notebookId/copy/',
        templateUrl: '/templates/notebooks/jupyter_notebook.html',
        controller: function($scope, $stateParams, $sce) {
            $scope.$stateParams = $stateParams;
            $scope.notebookURL = $sce.getTrustedResourceUrl("/jupyter/notebooks/" + $stateParams.projectKey + "/" + $stateParams.notebookId + '/copy');
        },
        pageTitle: function(stateParams) {
            return "Jupyter notebook";
        }
    });

    $stateProvider.state('projects.project.notebooks.sql_notebook', {
        url: '/sql/:notebookId/?discussionId',
        templateUrl: '/templates/notebooks/sql_notebook.html',
        controller: 'SQLNotebookController',
        // The user-friendly name is not in the stateParams, so the controller overrides the title
        pageTitle: function(stateParams) {
            return "SQL notebook";
        }
    });

    /* ************************** RStudio Server ********************** */

    $stateProvider.state('projects.project.rstudioserver', {
        url: '/rstudio-server',
        abstract: true,
        template: "<div ui-view></div>"
    });

    $stateProvider.state('projects.project.rstudioserver.embed', {
        url: '/',
        templateUrl: '/templates/rstudio-server/embed.html',
        controller: "RStudioServerEmbedController",
        pageTitle : function(stateParams) {
            return "RStudio Server"
        }
    });

    /* ***************** Webapps ********************** */

    $stateProvider.state('projects.project.webapps', {
        url : "/webapps",
        abstract : true,
        template : "<div ui-view></div>"
    });

    $stateProvider.state('projects.project.webapps.list', {
        url : "/",
        templateUrl: '/templates/webapps/list.html',
        controller: 'WebAppsListController',
        pageTitle : function(stateParams) {
            return "Webapps";
        }
    });

    $stateProvider.state('projects.project.webapps.webapp', {
        url : "/{webAppId}_{webAppName}?discussionId",
        templateUrl: '/templates/webapps/webapp.html',
        controller: 'WebAppCoreController',
        abstract: true
    });

    $stateProvider.state('projects.project.webapps.webapp.edit', {
        url : "/edit?{safe-mode}",
        templateUrl: '/templates/webapps/edit.html',
        pageTitle : function(stateParams) {
            return "Webapp";
        }
    });

    $stateProvider.state('projects.project.webapps.webapp.view', {
        url : "/view",
        templateUrl: '/templates/webapps/view.html',
        pageTitle : function(stateParams) {
            return "Webapp";
        }
    });

    $stateProvider.state('projects.project.webapps.webapp.summary', {
        url : "/summary",
        templateUrl: '/templates/webapps/summary.html',
        controller : "WebAppSummaryController",
        pageTitle : function(stateParams) {
            return "Webapp";
        }
    });

    $stateProvider.state('projects.project.webapps.webapp.history', {
        url : "/history",
        templateUrl: '/templates/webapps/history.html',
        controller : "WebAppHistoryController",
        pageTitle : function(stateParams) {
            return "Webapp";
        }
    });

    $stateProvider.state('projects.project.webapps.webapp.logs', {
        url : "/logs",
        templateUrl: '/templates/webapps/logs.html',
        pageTitle : function(stateParams) {
            return "Webapp";
        }
    });

    /* ***************** Reports ********************** */

    $stateProvider.state('projects.project.reports', {
        url : "/report",
        abstract : true,
        template : "<div ui-view></div>"
    });

    $stateProvider.state('projects.project.reports.list', {
        url : "/",
        templateUrl: '/templates/code-reports/list.html',
        controller: 'ReportsListController',
        pageTitle : function(stateParams) {
            return "Report";
        }
    });

    $stateProvider.state('projects.project.reports.report', {
        url : "/{reportId}?discussionId",
        templateUrl: '/templates/code-reports/report.html',
        controller: 'ReportCoreController',
        abstract: true
    });

    $stateProvider.state('projects.project.reports.report.edit', {
        url : "/edit",
        templateUrl: '/templates/code-reports/edit.html',
        controller: 'ReportEditController',
        pageTitle : function(stateParams) {
            return "Report";
        }
    });

    $stateProvider.state('projects.project.reports.report.view', {
        url : "/view",
        templateUrl: '/templates/code-reports/view.html',
        controller: 'ReportViewController',
        pageTitle : function(stateParams) {
            return "Report";
        }
    });

    $stateProvider.state('projects.project.reports.report.summary', {
        url : "/summary",
        templateUrl: '/templates/code-reports/summary.html',
        controller : "ReportSummaryController",
        pageTitle : function(stateParams) {
            return "Report";
        }
    });

    $stateProvider.state('projects.project.reports.report.history', {
        url : "/history",
        templateUrl: '/templates/code-reports/history.html',
        controller : "ReportHistoryController",
        pageTitle : function(stateParams) {
            return "Report";
        }
    });

    /* ***************** Dashboards ********************** */

    $stateProvider.state('projects.project.dashboards', {
        url: "/dashboards",
        abstract: true,
        template: "<div ui-view></div>"
    });

    $stateProvider.state('projects.project.dashboards.list', {
        url: "/",
        templateUrl: '/templates/dashboards/list.html',
        controller: 'DashboardsListController',
        pageTitle: function(stateParams) {
            return "Dashboards";
        }
    });

    $stateProvider.state('projects.project.dashboards.dashboard', {
        url: "/{dashboardId:[0-9a-zA-Z]*}{separator:\_{0,1}}{dashboardName}?discussionId",
        templateUrl: '/templates/dashboards/dashboard.html',
        controller: 'DashboardCoreController',
        abstract: true
    });

    $stateProvider.state('projects.project.dashboards.dashboard.edit', {
        url: "/edit/:pageId",
        templateUrl: '/templates/dashboards/edit.html',
        controller: "DashboardEditController",
        pageTitle: function(stateParams) {
            return "Dashboard";
        }
    });

    $stateProvider.state('projects.project.dashboards.dashboard.view', {
        url: "/view/:pageId?fullScreen",
        templateUrl: '/templates/dashboards/view.html',
        controller: "DashboardViewController",
        pageTitle: function(stateParams) {
            return "Dashboard";
        }
    });

    $stateProvider.state('projects.project.dashboards.dashboard.summary', {
        url : "/summary",
        templateUrl: '/templates/dashboards/summary.html',
        controller : "DashboardSummaryController",
        pageTitle : function(stateParams) {
            return "Dashboard";
        }
    });

    $stateProvider.state('projects.project.dashboards.insights', {
        url: "/insights",
        abstract: true,
        template: "<div ui-view></div>"
    });

    $stateProvider.state('projects.project.dashboards.insights.list', {
        url: "/",
        templateUrl: '/templates/dashboards/insights/list.html',
        controller: 'InsightsListController',
        pageTitle: function(stateParams) {
            return "Insights";
        }
    });

    $stateProvider.state('projects.project.dashboards.insights.insight', {
        url: "/{insightId:[0-9a-zA-Z_-]*}_{insightName}?discussionId",
        templateUrl: '/templates/dashboards/insights/insight.html',
        controller: 'InsightCoreController',
        abstract: true
    });

    $stateProvider.state('projects.project.dashboards.insights.insight.edit', {
        url: "/edit",
        templateUrl: '/templates/dashboards/insights/edit.html',
        controller: "InsightEditController",
        pageTitle: function(stateParams) {
            return "Insight";
        }
    });

    $stateProvider.state('projects.project.dashboards.insights.insight.view', {
        url: "/view?fullScreen",
        templateUrl: '/templates/dashboards/insights/view.html',
        controller: "InsightViewController",
        pageTitle: function(stateParams) {
            return "Insight";
        }
    });

    $stateProvider.state('projects.project.dashboards.insights.insight.summary', {
        url: "/summary",
        templateUrl: '/templates/dashboards/insights/summary.html',
        controller: "InsightSummaryController",
        pageTitle: function(stateParams) {
            return "Insight";
        }
    });

    /* ************************** Bundles ********************** */

    // DSS Design node

    $stateProvider.state('projects.project.bundlesdesign', {
        url: '/bundles-design',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.bundlesdesign.list', {
        url: '/?showProgressModalFor',
        templateUrl: '/templates/bundles/design/list.html',
        controller: "DesignBundlesListController",
        pageTitle: function(stateParams) {
            return "Bundles export";
        }
    });

    $stateProvider.state('projects.project.bundlesdesign.new', {
        url: '/new/',
        templateUrl: '/templates/bundles/design/new.html',
        controller: "DesignBundlesNewController",
        pageTitle: function(stateParams) {
            return "Create bundle";
        }
    });

    // DSS Automation node

    $stateProvider.state('projects.project.bundlesautomation', {
        url: '/bundles-automation',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.bundlesautomation.list', {
        url: '/',
        templateUrl: '/templates/bundles/automation/list.html',
        controller: "AutomationBundlesListController",
        pageTitle: function(stateParams) {
            return "Bundles management";
        }
    });

    $stateProvider.state('projects.project.bundlesautomation.settings', {
        url: '/settings/',
        templateUrl: '/templates/bundles/automation/activation-settings.html',
        controller: "AutomationBundlesSettingsController",
        pageTitle: function(stateParams) {
            return "Bundles settings";
        }
    });

    /* ************************** Mass import           ********************** */
    $stateProvider.state('projects.project.tablesimport', {
        url: '/import-tables?zoneId',
        templateUrl: '/templates/datasets/project-tables-import.html',
        controller: 'ProjectMassTableToDatasetController',
        params: {
            importData: null
        },
        pageTitle: function(stateParams) {
            return "Import tables";
        }
    });

    $stateProvider.state('alationOpen', {
        url: '/alation-open/:alationOpenId',
        templateUrl: '/templates/datasets/alation-open.html',
        controller: "AlationOpenController",
        pageTitle: function(stateParams) {
            return "Mass import";
        }
    });

    /* ************************** API Services (Lambda) ********************** */

    $stateProvider.state('projects.project.lambdaservices', {
        url: '/api-designer',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.lambdaservices.list', {
        url: '/',
        templateUrl: '/templates/lambda/list.html',
        controller: "LambdaServicesListController",
        pageTitle: function(stateParams) {
            return "API Services";
        }
    });

    $stateProvider.state('projects.project.lambdaservices.service', {
        url: '/:serviceId?discussionId',
        abstract: true,
        controller: "LambdaServiceBaseController",
        templateUrl: '/templates/lambda/lambda-service.html'
    });

    $stateProvider.state('projects.project.lambdaservices.service.summary', {
        url: '/summary/',
        controller: "LambdaServiceSummaryController",
        templateUrl: '/templates/lambda/summary.html'
    });

    $stateProvider.state('projects.project.lambdaservices.service.endpoints', {
        url: '/endpoints/',
        controller: "LambdaServiceEndpointsController",
        templateUrl: '/templates/lambda/endpoints.html'
    });

    $stateProvider.state('projects.project.lambdaservices.service.config', {
        url: '/config/',
        controller: "LambdaServiceConfigController",
        templateUrl: '/templates/lambda/lambda-service-config.html'
    });

    $stateProvider.state('projects.project.lambdaservices.service.packages', {
        url: '/packages/',
        controller: "LambdaServicePackagesController",
        templateUrl: '/templates/lambda/packages.html'
    });

    /* ************************** Wiki ********************** */

    $stateProvider.state('projects.project.wiki', {
        url: '/wiki',
        controller: "WikiController",
        templateUrl: '/templates/wikis/wiki.html'
    });

    $stateProvider.state('projects.project.wiki.article', {
        url: '/:articleId/:articleName?fullScreen',
        abstract: true,
        controller: "ArticleController",
        params: {
            // When no articleName is given through the URL, the router will act as if it didn't exist
            // (aka having url:'/:articleId')
            articleName: {squash: true, value: null}
        },
        templateUrl: '/templates/wikis/article.html'
    });

    // templates for the 3 sub-routes for wiki are handled through ng-show and ng-if instead of ui-view because we need to keep the editor state when switching tabs
    // note that history template is kept at the top in order to trigger infinite-scroll directive when switching tabs
    $stateProvider.state('projects.project.wiki.article.view', {
        url: '?discussionId'
    });

    $stateProvider.state('projects.project.wiki.article.edit', {
        url: '/edit'
    });

    $stateProvider.state('projects.project.wiki.article.history', {
        url: '/history'
    });

    $stateProvider.state('projects.wikis', { //mjt placeholder for the page PC is writing
        url: '/wikis',
        templateUrl: '/templates/wikis/article-history.html'
    });

    /* ************************** Scenarios ********************** */

    $stateProvider.state('projects.project.scenarios', {
        url: '/scenarios',
        abstract: true,
        controller: "ScenarioCoreController",
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.scenarios.list', {
        url: '/',
        templateUrl: '/templates/scenarios/list.html',
        controller: "ScenariosListController",
        pageTitle: function(stateParams) {
            return "Scenarios";
        }
    });

    $stateProvider.state('projects.project.scenarios.scenario', {
        url: '/:scenarioId?discussionId',
        templateUrl: '/templates/scenarios/scenario.html',
        controller: "ScenarioController",
        pageTitle: function(stateParams) {
            return "Scenario";
        }
    });

    $stateProvider.state('projects.project.scenarios.scenario.settings', {
        url: '/settings',
        templateUrl: '/templates/scenarios/fragments/scenario-settings.html'
    });

    $stateProvider.state('projects.project.scenarios.scenario.summary', {
        url: '/summary',
        templateUrl: '/templates/scenarios/fragments/scenario-summary.html'
    });

    $stateProvider.state('projects.project.scenarios.scenario.runs', {
        url: '/runs',
        abstract: true,
        templateUrl: '/templates/scenarios/fragments/scenario-runs-timeline.html'
    });

    $stateProvider.state('projects.project.scenarios.scenario.runs.list', {
        url: '/list',
        templateUrl: '/templates/scenarios/fragments/scenario-runs.html'
    });
    // same as above, but go directly to a run
    $stateProvider.state('projects.project.scenarios.scenario.runs.list.run', {
        url: '/:runId',
        templateUrl: '/templates/scenarios/scenario.html',
        controller: "ScenarioRunController",
        pageTitle: function(stateParams) {
            return "Scenario";
        }
    });

    $stateProvider.state('projects.project.scenarios.scenario.runs.timeline', {
        url: '/timeline',
        templateUrl: '/templates/scenarios/fragments/scenario-timeline.html'
    });

    $stateProvider.state('projects.project.scenarios.scenario.history', {
        url: '/history',
        controller: "ScenarioHistoryController",
        templateUrl: '/templates/scenarios/fragments/scenario-git-log.html'
    });

    $stateProvider.state('projects.project.scenarios.scenario.steps', {
        url: '/steps',
        templateUrl: '/templates/scenarios/fragments/scenario-steps.html'
    });

    $stateProvider.state('projects.project.scenarios.scenario.script', {
        url: '/script',
        templateUrl: '/templates/scenarios/fragments/scenario-script.html'
    });

    $stateProvider.state('projects.project.monitoring', {
        url: '/monitoring',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.monitoring.scenarios', {
        url: '/',
        templateUrl: '/templates/scenarios/scenarios-monitoring.html',
        controller: "ScenariosMonitoringController",
        pageTitle: function(stateParams) {
            return "Monitoring";
        }
    });

    $stateProvider.state('projects.project.monitoring.scenarios.scoped', {
        url: ':scopeToDay',
        templateUrl: '/templates/scenarios/scenarios-monitoring.html',
        controller: "ScenariosMonitoringController",
        pageTitle: function(stateParams) {
            return "Monitoring";
        },
        params: {
            scenarioQuery: null
        }
    });

     /* ************************** Continuous Activities ********************** */

    $stateProvider.state('projects.project.continuous-activities', {
        url: '/continuous-activities',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.continuous-activities.list', {
        url: '/',
        templateUrl: '/templates/continuous-activities/list.html',
        controller: "ContinuousActivitiesListController",
        pageTitle: function(stateParams) {
            return "Continuous Activities";
        }
    });

    $stateProvider.state('projects.project.continuous-activities.continuous-activity', {
        url: '/:continuousActivityId',
        templateUrl: '/templates/continuous-activities/continuous-activity.html',
        controller: "ContinuousActivityController",
        pageTitle: function(stateParams) {
            return "Continuous Activity";
        }
    });

    $stateProvider.state('projects.project.continuous-activities.continuous-activity.runs', {
        url: '/runs?runId&attemptId',
        templateUrl: '/templates/continuous-activities/runs.html'
    });

    /* ************************** Macros ********************** */

    $stateProvider.state('projects.project.runnables', {
        url: '/macros',
        abstract: true,
        controller: "RunnableCoreController",
        template: '<div ui-view></div>'
    });

    $stateProvider.state('projects.project.runnables.list', {
        url: '/',
        templateUrl: '/templates/macros/runnables.html',
        controller: "RunnablesListController",
        pageTitle: function(stateParams) {
            return "Macros";
        }
    });

    /* ************************** User profile pages ********************** */

    $stateProvider.state('profile', {
        abstract: true,
        url: '/profile',
        template: '<div ui-view></div>'
    });

    $stateProvider.state('profile.my', {
        url: '/',
        abstract: true,
        templateUrl: '/templates/profile/index.html',
        controller: 'ProfileController'
    });

    /* Default */
    $stateProvider.state('profile.my.settings', {
        url: '',
        templateUrl: '/templates/profile/settings.html',
        pageTitle: function(stateParams) {
            return "Profile settings";
        },
        controller: 'MyProfileAccountController',
        data: {selectedTab: 'settings'}
    });

    $stateProvider.state('profile.my.achievements', {
        url: 'achievements/',
        templateUrl: '/templates/profile/achievements.html',
        pageTitle: function(stateParams) {
            return "My profile";
        },
        controller: 'MyProfileAchievementsController',
        data: {selectedTab: 'achievements'}
    });

    $stateProvider.state('profile.my.exports', {
        url: 'exports/',
        templateUrl: '/templates/profile/exports.html',
        pageTitle: function(stateParams) {
            return "My exports";
        },
        controller: 'MyProfileExportController',
        data: {selectedTab: 'exports'}
    });

    $stateProvider.state('profile.my.stars', {
        url: 'stars/',
        templateUrl: '/templates/profile/stars.html',
        pageTitle: function(stateParams) {
            return "My stars";
        },
        controller: 'MyProfileStarsController',
        data: {selectedTab: 'stars'}
    });

    $stateProvider.state('profile.my.credentials', {
        url: 'credentials/',
        templateUrl: '/templates/profile/credentials.html',
        pageTitle: function(stateParams) {
            return "Connection credentials";
        },
        controller: 'MyProfileConnectionCredentialsController',
        data: {selectedTab: 'credentials'}
    });

    $stateProvider.state('profile.my.apikeys', {
        url: 'apikeys/',
        templateUrl: '/templates/profile/personal-api-keys.html',
        pageTitle: function(stateParams) {
            return "Personal API Keys";
        },
        controller: 'MyProfilePersonalAPIKeysController',
        data: {selectedTab: 'apikeys'}
    });

    $stateProvider.state('profile.my.account', {
        url: 'account/',
        templateUrl: '/templates/profile/account.html',
        pageTitle: function(stateParams) {
            return "Account";
        },
        controller: 'MyProfileEditController',
        data: {selectedTab: 'account'}
    });

    $stateProvider.state('profile.my.notifications', {
        url: 'notifications/',
        templateUrl: '/templates/profile/notifications.html',
        pageTitle: function(stateParams) {
            return "My notifications";
        },
        data: {selectedTab: 'notifications'}
    });

    $stateProvider.state('profile.user', {
        url: '/:userLogin/',
        abstract: true,
        templateUrl: '/templates/profile/index.html',
        controller: 'ProfileController'
    });

    $stateProvider.state('profile.user.view', {
        url: '',
        templateUrl: '/templates/profile/achievements.html',
        controller: 'MyProfileAchievementsController',
        pageTitle: function(stateParams) {
            return "Profile";
        }
    });

    /* ************************** Plugins ********************** */

    $stateProvider.state('plugins', {
        url: '/plugins-explore',
        controller: 'PluginsExploreController',
        templateUrl: '/templates/plugins/index.html',
        pageTitle: function() {
            return 'Plugins';
        }
    });

    $stateProvider.state('plugins.store', {
        url: '/store/:pluginid',
        templateUrl: '/templates/plugins/store-list.html',
        controller: 'PluginsStoreController',
        pageTitle: function() {
            return 'Plugins store';
        }
    });

    $stateProvider.state('plugins.installed', {
        url: '/installed/',
        templateUrl: '/templates/plugins/installed-list.html',
        pageTitle: function() {
            return 'Installed plugins';
        }
    });

    $stateProvider.state('plugins.development', {
        url: '/development/',
        templateUrl: '/templates/plugins/development-list.html',
        pageTitle: function() {
            return 'Plugins Development';
        }
    });

    /* ************************** Plugin page ********************** */

    $stateProvider.state('plugin', {
        url: '/plugins/:pluginId',
        controller: 'PluginController',
        abstract: true,
        templateUrl: '/templates/plugins/plugin-details/index.html'
    });

    $stateProvider.state('plugin.installation', {
        url: '/installation/',
        controller: 'PluginInstallationController',
        templateUrl: '/templates/plugins/plugin-details/installation.html',
        pageTitle: function($stateParams) {
            return 'Installing ' + $stateParams.pluginId;
        }
    });

    $stateProvider.state('plugin.update', {
        url: '/update/',
        controller: 'PluginInstallationController',
        templateUrl: '/templates/plugins/plugin-details/installation.html',
        pageTitle: function($stateParams) {
            return 'Updating ' + $stateParams.pluginId;
        }
    });

    $stateProvider.state('plugin.upload', {
        url: '/upload',
        controller: 'PluginInstallationController',
        templateUrl: '/templates/plugins/plugin-details/installation.html',
        params: { uploadedPluginFile: null },
        pageTitle: function($stateParams) {
            return 'Uploading ' + $stateParams.pluginId;
        }
    });

    $stateProvider.state('plugin.upload.update', {
        url: '/update/',
        controller: 'PluginInstallationController',
        templateUrl: '/templates/plugins/plugin-details/installation.html',
        params: { uploadedPluginFile: null },
        pageTitle: function($stateParams) {
            return 'Updating ' + $stateParams.pluginId;
        }
    });

    $stateProvider.state('plugin.installationfromgit', {
        url: '/install-from-git/?uri&checkout&path',
        controller: 'PluginInstallationController',
        templateUrl: '/templates/plugins/plugin-details/installation.html',
        pageTitle: function($stateParams) {
            return 'Installing from Git'
        }
    });

    $stateProvider.state('plugin.updatefromgit', {
        url: '/update-from-git/?uri&checkout&path',
        controller: 'PluginInstallationController',
        templateUrl: '/templates/plugins/plugin-details/installation.html',
        pageTitle: function($stateParams) {
            return 'Updating from Git'
        }
    });


    $stateProvider.state('plugin.summary', {
        url: '/summary/',
        templateUrl: '/templates/plugins/plugin-details/summary.html',
        controller: 'PluginSummaryController',
        pageTitle: function($stateParams) {
            return 'Plugin - ' + $stateParams.pluginId ;
        }
    });

    $stateProvider.state('plugin.settings', {
        url: '/settings/:selectedTab',
        templateUrl: '/templates/plugins/plugin-details/settings.html',
        controller: 'PluginSettingsController',
        pageTitle: function($stateParams) {
            return 'Plugin settings - ' + $stateParams.pluginId ;
        }
    });

    $stateProvider.state('plugin.usages', {
        url: '/usages/',
        templateUrl: '/templates/plugins/plugin-details/usages.html',
        controller: 'PluginUsagesController',
        pageTitle: function($stateParams) {
            return 'Plugin usages - ' + $stateParams.pluginId ;
        }
    });

    $stateProvider.state('plugindev', {
        url: '/plugins/development/:pluginId',
        abstract: true,
        templateUrl: '/templates/plugins/development/plugin-details/index.html',
        controller: 'PlugindevEditionController'
    });

    $stateProvider.state('plugindev.definition', {
        url: '/definition/',
        templateUrl: '/templates/plugins/development/plugin-details/definition.html',
        controller: 'PlugindevDefinitionController',
        pageTitle: function($stateParams) {
            return 'Plugin - ' + $stateParams.pluginId;
        }
    });

    $stateProvider.state('plugindev.settings', {
        url: '/settings/:selectedTab',
        templateUrl: '/templates/plugins/development/plugin-details/settings.html',
        controller: 'PluginSettingsController',
        pageTitle: function($stateParams) {
            return 'Plugin settings - ' + $stateParams.pluginId;
        }
    });

    $stateProvider.state('plugindev.usages', {
        url: '/usages/',
        templateUrl: '/templates/plugins/plugin-details/usages.html',
        controller: 'PluginUsagesController',
        pageTitle: function($stateParams) {
            return 'Plugin usages - ' + $stateParams.pluginId ;
        }
    });

    $stateProvider.state('plugindev.editor', {
        url: '/editor/',
        templateUrl: '/templates/plugins/development/plugin-details/editor.html',
        controller: 'PlugindevEditorController',
        // to pass a param without putting it into the url
        resolve: {
            filePath: function($stateParams){
                return $stateParams.filePath;
            }
        },
        params: {
            filePath: null
        },
        pageTitle: function($stateParams) {
            return 'Plugin Editor - ' + $stateParams.pluginId ;
        }
    });

    $stateProvider.state('plugindev.history', {
        url: '/development/history/',
        templateUrl: '/templates/plugins/development/plugin-details/history.html',
        controller: 'PlugindevHistoryController',
        pageTitle: function($stateParams) {
            return 'Plugin History - ' + $stateParams.pluginId ;
        }
    });

    $stateProvider.state("libedition", {
        url: '/libedition',
        abstract: true,
        templateUrl: '/templates/plugins/development/lib-edition.html',
        controller: 'TopLevelFolderEditionController'
    });

    $stateProvider.state('libedition.libpython', {
        url: '/libpython',
        templateUrl: '/templates/plugins/development/lib-python-editor.html'
    });

    $stateProvider.state('libedition.libr', {
        url: '/libr',
        templateUrl: '/templates/plugins/development/lib-r-editor.html'
    });

    $stateProvider.state('libedition.localstatic', {
        url: '/localstatic',
        templateUrl: '/templates/plugins/development/local-static-editor.html',
        controller: 'TopLevelLocalStaticEditorController'
    });

    /* ************************** Catalog ********************** */

    $stateProvider.state("catalog", {
        url: '/catalog',
        abstract: true,
        templateUrl: '/templates/catalog/index.html',
        controller: function(TopNav) {
            TopNav.setLocation("DSS_HOME", "catalog", "items", null);
        }
    });

    const catalogItems = {
        url: '/search/:hash',
        templateUrl: '/templates/catalog/search.html',
        controller: "CatalogItemsController",
        params: {
            scope: null
        },
        pageTitle: function(stateParams) {
            return "DSS Data Catalog";
        }
    };

    const catalogMeanings = {
        url: '/meanings/:hash',
        templateUrl: '/templates/catalog/search.html',
        controller: "CatalogMeaningsController",
        pageTitle: function(stateParams) {
            return "Meanings";
        }
    };

    $stateProvider.state('meanings', {
        url: '/meanings',
        templateUrl: '/templates/meanings/index.html',
        controller: "CatalogMeaningsController",
        pageTitle: function(stateParams) {
            return "Meanings";
        }
    });

    $stateProvider.state('projects.project.catalog', {
        url: '/catalog',
        abstract: true,
        templateUrl: '/templates/catalog/index.html',
        controller: function(TopNav) {
            TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_NONE, null);
            TopNav.setNoItem();
        }
    });

    $stateProvider.state("catalog.items", $.extend({}, catalogItems));
    $stateProvider.state("projects.project.catalog.items", $.extend({}, catalogItems, {params: {scope: ['external'], _type: null}, url:catalogItems.url+'?zoneId'}));
    $stateProvider.state("projects.project.catalog.meanings", $.extend({}, catalogMeanings));

    $stateProvider.state("external-table", {
        url: '/external-table/:connection/:catalog/:schema/:table',
        abstract: true,
        templateUrl: '/templates/catalog/external-table/index.html',
        controller: "ExternalTableController"
    });

    $stateProvider.state("external-table.summary", {
        url: '',
        template: '<external-table-summary class="h100"></external-table-summary>'
    });

    $stateProvider.state("external-table.schema", {
        url: '/schema/',
        templateUrl: '/templates/catalog/external-table/schema.html'
    });
    $stateProvider.state("external-table.sample", {
        url: '/sample/',
        templateUrl: '/templates/catalog/external-table/sample.html'
    });
    $stateProvider.state("external-table.items", {
        url: '/items/',
        templateUrl: '/templates/catalog/external-table/items.html'
    });

    /* ************************** INBOX ********************** */

    $stateProvider.state("inbox", {
        url: '/inbox',
        templateUrl: '/templates/catalog/inbox.html',
        controller: 'DiscussionsInboxController',
        pageTitle: function() {
            return "Inbox";
        }
    });

    /* ************************** Deployer ********************** */

    $stateProvider.state('deployer', {
        url: '/deployer/',
        controller: 'DeployerHomeController',
        templateUrl: '/templates/deployer/index.html',
        pageTitle: () => "Deployer"
    });


    /* ************************** API Deployer ********************** */

    $stateProvider.state('apideployer', {
        url: '/api-deployer/',
        controller: 'APIDeployerController',
        abstract: true,
        templateUrl: '/templates/api-deployer/index.html'
    });


    $stateProvider.state('apideployer.deployments', {
        url: 'deployments',
        abstract: true,
        template: '<div ui-view class="h100"></div>'
    });
    $stateProvider.state('apideployer.deployments.dashboard', {
        url: '/',
        controller: 'APIDeployerDeploymentsDashboardController',
        templateUrl: '/templates/api-deployer/deployment-dashboard.html',
        pageTitle: function(stateParams) {
            return 'Deployments';
        }
    });
    $stateProvider.state('apideployer.deployments.deployment', {
        url: '/:deploymentId',
        abstract: true,
        controller: 'APIDeployerDeploymentController',
        templateUrl: '/templates/api-deployer/deployment.html'
    });
    $stateProvider.state('apideployer.deployments.deployment.status', {
        url: '/',
        controller: 'APIDeployerDeploymentStatusController',
        templateUrl: '/templates/api-deployer/deployment-status.html',
        pageTitle: function(stateParams) {
            return stateParams.deploymentId + ' - Deployments'
        }
    });
    $stateProvider.state('apideployer.deployments.deployment.history', {
        url: '/history/',
        controller: 'APIDeployerDeploymentHistoryController',
        templateUrl: '/templates/api-deployer/deployment-history.html',
        pageTitle: function(stateParams) {
            return stateParams.deploymentId + ' - Deployments'
        }
    });
    $stateProvider.state('apideployer.deployments.deployment.settings', {
        url: '/settings/',
        controller: 'APIDeployerDeploymentSettingsController',
        templateUrl: '/templates/api-deployer/deployment-settings.html',
        pageTitle: function(stateParams) {
            return stateParams.deploymentId + ' - Deployments'
        }
    });


    $stateProvider.state('apideployer.services', {
        url: 'services',
        abstract: true,
        template: '<div ui-view class="h100"></div>'
    });
    $stateProvider.state('apideployer.services.list', {
        url: '/',
        controller: 'APIDeployerServicesListController',
        templateUrl: '/templates/api-deployer/published-services-list.html',
        pageTitle: function(stateParams) {
            return 'Published API services';
        }
    });
    $stateProvider.state('apideployer.services.service', {
        url: '/:serviceId',
        abstract: true,
        controller: 'APIDeployerServiceController',
        templateUrl: '/templates/api-deployer/published-service.html'
    });
    $stateProvider.state('apideployer.services.service.status', {
        url: '/?versions',
        controller: 'APIDeployerServiceStatusController',
        params: {
            versions: { array: true }
        },
        templateUrl: '/templates/api-deployer/published-service-status.html',
        pageTitle: function(stateParams) {
            return stateParams.serviceId + ' - Published API services';
        }
    });
    $stateProvider.state('apideployer.services.service.history', {
        url: '/history/',
        controller: 'APIDeployerServiceHistoryController',
        templateUrl: '/templates/api-deployer/published-service-history.html',
        pageTitle: function(stateParams) {
            return stateParams.serviceId + ' - Published API services';
        }
    });
    $stateProvider.state('apideployer.services.service.settings', {
        url: '/settings/',
        controller: 'APIDeployerServiceSettingsController',
        templateUrl: '/templates/api-deployer/published-service-settings.html',
        pageTitle: function(stateParams) {
            return stateParams.serviceId + ' - Published API services';
        }
    });


    $stateProvider.state('apideployer.infras', {
        url: 'infras',
        abstract: true,
        template: '<div ui-view class="h100"></div>'
    });
    $stateProvider.state('apideployer.infras.list', {
        url: '/',
        controller: 'APIDeployerInfrasListController',
        templateUrl: '/templates/api-deployer/infras-list.html',
        pageTitle: function(stateParams) {
            return 'API Infrastructures';
        }
    });
    $stateProvider.state('apideployer.infras.infra', {
        url: '/:infraId',
        controller: 'APIDeployerInfraController',
        abstract: true,
        templateUrl: '/templates/api-deployer/infra.html'
    });
    $stateProvider.state('apideployer.infras.infra.status', {
        url: '/',
        controller: 'APIDeployerInfraStatusController',
        templateUrl: '/templates/api-deployer/infra-status.html',
        pageTitle: function(stateParams) {
            return stateParams.infraId + ' - API Infrastructures';
        }
    });
    $stateProvider.state('apideployer.infras.infra.history', {
        url: '/history/',
        controller: 'APIDeployerInfraHistoryController',
        templateUrl: '/templates/api-deployer/infra-history.html',
        pageTitle: function(stateParams) {
            return stateParams.infraId + ' - API Infrastructures';
        }
    });
    $stateProvider.state('apideployer.infras.infra.settings', {
        url: '/settings/',
        controller: 'APIDeployerInfraSettingsController',
        templateUrl: '/templates/api-deployer/infra-settings.html',
        pageTitle: function(stateParams) {
            return stateParams.infraId + ' - API Infrastructures';
        }
    });

    /* ************************** Project Deployer ********************** */
    $stateProvider.state('projectdeployer', {
        url: '/project-deployer/',
        controller: 'ProjectDeployerController',
        abstract: true,
        template: '<div ui-view class="h100"></div>'
    });
    
    $stateProvider.state('projectdeployer.deployments', {
        url: 'deployments',
        abstract: true,
        controller: 'ProjectDeployerDeploymentsController',
        template: '<div ui-view class="h100"></div>'
    });
    $stateProvider.state('projectdeployer.deployments.dashboard', {
        url: '/',
        controller: 'ProjectDeployerDeploymentDashboardController',
        templateUrl: '/templates/project-deployer/deployment-dashboard.html',
        pageTitle: function(stateParams) {
            return 'Deployments';
        }
    });
    $stateProvider.state('projectdeployer.deployments.deployment', {
        url: '/:deploymentId',
        abstract: true,
        controller: 'ProjectDeployerDeploymentController',
        templateUrl: '/templates/project-deployer/deployment.html'
    });
    $stateProvider.state('projectdeployer.deployments.deployment.status', {
        url: '/',
        controller: 'ProjectDeployerDeploymentStatusController',
        templateUrl: '/templates/project-deployer/deployment-status.html',
        pageTitle: function(stateParams) {
            return stateParams.deploymentId + ' - Deployments'
        }
    });
    $stateProvider.state('projectdeployer.deployments.deployment.settings', {
        url: '/settings/',
        controller: 'ProjectDeployerDeploymentSettingsController',
        templateUrl: '/templates/project-deployer/deployment-settings.html',
        pageTitle: function(stateParams) {
            return stateParams.deploymentId + ' - Deployments'
        }
    });
    $stateProvider.state('projectdeployer.deployments.deployment.history', {
        url: '/history/',
        controller: 'ProjectDeployerDeploymentHistoryController',
        templateUrl: '/templates/project-deployer/deployment-history.html',
        pageTitle: function(stateParams) {
            return stateParams.deploymentId + ' - Deployments'
        }
    });

    $stateProvider.state('projectdeployer.projects', {
        url: 'projects',
        abstract: true,
        controller: 'ProjectDeployerProjectsController',
        template: '<div ui-view class="h100"></div>'
    });
    $stateProvider.state('projectdeployer.projects.list', {
        url: '/',
        controller: 'ProjectDeployerProjectListController',
        templateUrl: '/templates/project-deployer/published-projects-list.html',
        pageTitle: function(stateParams) {
            return 'Projects';
        },
        params: {
            selectedProjectKey: null // open specified project accordion table on load
        }
    });
    $stateProvider.state('projectdeployer.projects.project', {
        url: '/:publishedProjectKey',
        abstract: true,
        controller: 'ProjectDeployerProjectController',
        template: '<div ui-view class="h100"></div>'
    });
    $stateProvider.state('projectdeployer.projects.project.home', {
        url: '',
        abstract: true,
        templateUrl: '/templates/project-deployer/published-project.html'
    });
    $stateProvider.state('projectdeployer.projects.project.home.status', {
        url: '/',
        controller: 'ProjectDeployerProjectStatusController',
        templateUrl: '/templates/project-deployer/published-project-status.html',
        pageTitle: function(stateParams) {
            return stateParams.publishedProjectKey + ' - Published Projects';
        }
    });
    $stateProvider.state('projectdeployer.projects.project.home.settings', {
        url: '/settings/',
        controller: 'ProjectDeployerProjectSettingsController',
        templateUrl: '/templates/project-deployer/published-project-settings.html',
        pageTitle: function(stateParams) {
            return stateParams.publishedProjectKey + ' - Published Projects';
        }
    });
    $stateProvider.state('projectdeployer.projects.project.home.history', {
        url: '/history/',
        controller: 'ProjectDeployerProjectHistoryController',
        templateUrl: '/templates/project-deployer/published-project-history.html',
        pageTitle: function(stateParams) {
            return stateParams.publishedProjectKey + ' - Published Projects';
        }
    });
    $stateProvider.state('projectdeployer.projects.project.bundle', {
        url: '/bundle/:bundleId',
        controller: 'ProjectDeployerBundleController',
        abstract: true,
        templateUrl: '/templates/project-deployer/published-bundle.html'
    });
    $stateProvider.state('projectdeployer.projects.project.bundle.status', {
        url: '/',
        controller: 'ProjectDeployerBundleStatusController',
        templateUrl: '/templates/project-deployer/published-bundle-status.html',
        pageTitle: function(stateParams) {
            return stateParams.bundleId + ' - Published Bundles';
        }
    });

    $stateProvider.state('projectdeployer.infras', {
        url: 'infras',
        abstract: true,
        template: '<div ui-view class="h100"></div>'
    });
    $stateProvider.state('projectdeployer.infras.list', {
        url: '/',
        controller: 'ProjectDeployerInfrasListController',
        templateUrl: '/templates/project-deployer/infras-list.html',
        pageTitle: function(stateParams) {
            return 'Infrastructures';
        }
    });
    $stateProvider.state('projectdeployer.infras.infra', {
        url: '/:infraId',
        controller: 'ProjectDeployerInfraController',
        abstract: true,
        templateUrl: '/templates/project-deployer/infra.html'
    });
    $stateProvider.state('projectdeployer.infras.infra.status', {
        url: '/',
        controller: 'ProjectDeployerInfraStatusController',
        templateUrl: '/templates/project-deployer/infra-status.html',
        pageTitle: function(stateParams) {
            return stateParams.infraId + ' - Automation Node Infrastructures';
        }
    });
    $stateProvider.state('projectdeployer.infras.infra.settings', {
        url: '/settings/',
        controller: 'ProjectDeployerInfraSettingsController',
        templateUrl: '/templates/project-deployer/infra-settings.html',
        pageTitle: function(stateParams) {
            return stateParams.infraId + ' - Automation Node Infrastructures';
        }
    });
    $stateProvider.state('projectdeployer.infras.infra.history', {
        url: '/history/',
        controller: 'ProjectDeployerInfraHistoryController',
        templateUrl: '/templates/project-deployer/infra-history.html',
        pageTitle: function(stateParams) {
            return stateParams.infraId + ' - Automation Node Infrastructures';
        }
    });

    /* ************************** Connection explorer           ********************** */
    const connectionExplorer = {
        url: '/connection-explorer?connectionName?schemaName?catalogName?zoneId',
        templateUrl: '/templates/datasets/connection-explorer.html',
        controller: "ConnectionsExplorerController",
        pageTitle: function(stateParams) {
            return "Connection explorer";
        }
    };

    $stateProvider.state('projects.project.catalog.connectionexplorer', $.extend({}, connectionExplorer));
    $stateProvider.state('catalog.connectionexplorer', $.extend({}, connectionExplorer));


    /* ************************** Automation  ********************** */

    $stateProvider.state("automation", {
        url: '/automation',
        abstract: true,
        templateUrl: '/templates/scenarios/instance-monitoring.html',
        pageTitle: stateParams => "Automation",
    });

    $stateProvider.state("automation.outcomes", {
        url: '/',
        templateUrl: '/templates/scenarios/outcomes-instance-view.html',
    });

    $stateProvider.state("automation.timeline", {
        url: '/timeline',
        templateUrl: '/templates/scenarios/timeline.html',
    });

    $stateProvider.state("automation.triggers", {
        url: '/triggers',
        templateUrl: '/templates/scenarios/triggers-instance-view.html',
    });

    $stateProvider.state("automation.reporters", {
        url: '/reporters',
        templateUrl: '/templates/scenarios/reporters-instance-view.html',
    });

    /* ************************** Administration ********************** */

    $stateProvider.state('admin', {
        url: '/admin/',
        abstract: true,
        templateUrl: '/templates/admin/index.html',
        controller: function(Breadcrumb) {
            Breadcrumb.set([{type: "admin"}]);
        }
    });

    $stateProvider.state('admin.home', {
        url: '',
        templateUrl: '/templates/admin/home.html',
        controller: "AdminLicensingController",
        pageTitle: function(stateParams) {
            return "Administration";
        }
    });

    $stateProvider.state('admin.general', {
        url: 'general/',
        templateUrl: '/templates/admin/general/index.html',
        controller: "AdminGeneralSettingsController",
    });

    $stateProvider.state('admin.general.themes', {
        url: 'themes/',
        controller: "AdminThemeController" ,
        templateUrl: '/templates/admin/general/themes.html',
        pageTitle: function(stateParams) {
            return "Themes";
        },
    });

    $stateProvider.state('admin.general.globaltags', {
        url: 'global-tags/',
        templateUrl: '/templates/admin/general/global-tags.html',
        pageTitle: function(stateParams) {
            return "Global tag categories";
        },
    });

    $stateProvider.state('admin.general.notifications', {
        url: 'notifications/',
        templateUrl: '/templates/admin/general/notifications.html',
        pageTitle: function(stateParams) {
            return "Notifications";
        },
    });

    $stateProvider.state('admin.general.engines', {
        url: 'engines/',
        templateUrl: '/templates/admin/general/engines.html',
        pageTitle: function(stateParams) {
            return "Engines";
        },
    });

    $stateProvider.state('admin.general.flowbuild', {
        url: 'flow-build/',
        templateUrl: '/templates/admin/general/flow-build.html',
        pageTitle: function(stateParams) {
            return "Flow build";
        },
    });

    $stateProvider.state('admin.general.variables', {
        url: 'variables/',
        controller: 'AdminVariablesController',
        templateUrl: '/templates/admin/general/variables.html',
        pageTitle: function(stateParams) {
            return "Variables";
        },
    });

    $stateProvider.state('admin.general.hadoop', {
        url: 'hadoop/',
        templateUrl: '/templates/admin/general/hadoop.html',
        pageTitle: function(stateParams) {
            return "Hadoop";
        },
    });

    $stateProvider.state('admin.general.hive', {
        url: 'hive/',
        templateUrl: '/templates/admin/general/hive.html',
        pageTitle: function(stateParams) {
            return "Hive";
        },
    });

    $stateProvider.state('admin.general.impala', {
        url: 'impala/',
        templateUrl: '/templates/admin/general/impala.html',
        pageTitle: function(stateParams) {
            return "Impala";
        },
    });

    $stateProvider.state('admin.general.spark', {
        url: 'spark/',
        templateUrl: '/templates/admin/general/spark.html',
        pageTitle: function(stateParams) {
            return "Spark";
        },
    });

    $stateProvider.state('admin.general.metastores', {
        url: 'metastores/',
        templateUrl: '/templates/admin/general/metastores.html',
        pageTitle: function(stateParams) {
            return "Hadoop";
        },
    });


    $stateProvider.state('admin.general.containers', {
        url: 'containers/',
        templateUrl: '/templates/admin/general/containers.html',
        pageTitle: function(stateParams) {
            return "Containers";
        },
    });

    $stateProvider.state('admin.general.security', {
        url: 'security/',
        templateUrl: '/templates/admin/general/security.html',
        pageTitle: function(stateParams) {
            return "Security";
        },
    });

    $stateProvider.state('admin.general.limits', {
        url: 'limits/',
        templateUrl: '/templates/admin/general/limits.html',
        pageTitle: function(stateParams) {
            return "Resources control";
        },
    });

    $stateProvider.state('admin.general.git', {
        url: 'git/',
        templateUrl: '/templates/admin/general/git.html',
        pageTitle: function(stateParams) {
            return "Git";
        },
    });

    $stateProvider.state('admin.general.deployer', {
        url: 'deployer/',
        templateUrl: '/templates/admin/general/deployer.html',
        pageTitle: function(stateParams) {
            return "Deployer";
        },
    });

    $stateProvider.state('admin.general.audit', {
        url: 'audit/',
        templateUrl: '/templates/admin/general/audit.html',
        pageTitle: function(stateParams) {
            return "Audit";
        },
    });

    $stateProvider.state('admin.general.eventserver', {
        url: 'eventserver/',
        templateUrl: '/templates/admin/general/eventserver.html',
        pageTitle: function(stateParams) {
            return "Event Server";
        },
    });

    $stateProvider.state('admin.general.misc', {
        url: 'misc/',
        templateUrl: '/templates/admin/general/misc.html',
        pageTitle: function(stateParams) {
            return "Misc";
        },
    });

    /********************
     * Admin / Code envs
     ********************/

    $stateProvider.state('admin.codeenvs-design', {
        url: 'code-envs/design',
        abstract: true,
        template:'<div ui-view></div>'
    });

    $stateProvider.state('admin.codeenvs-design.list', {
        url: '/',
        controller: "AdminCodeEnvsDesignListController",
        templateUrl: '/templates/admin/code-envs/design/list.html'
    });

    $stateProvider.state('admin.codeenvs-design.python-edit', {
        url: '/python/:envName/',
        controller: "AdminCodeEnvsDesignPythonEditController",
        templateUrl: '/templates/admin/code-envs/design/python-edit.html'
    });

    $stateProvider.state('admin.codeenvs-design.r-edit', {
        url: '/r/:envName/',
        controller: "AdminCodeEnvsDesignREditController",
        templateUrl: '/templates/admin/code-envs/design/R-edit.html'
    });

    $stateProvider.state('admin.codeenvs-automation', {
        url: 'code-envs/automation',
        abstract: true,
        template:'<div ui-view></div>'
    });

    $stateProvider.state('admin.codeenvs-automation.list', {
        url: '/',
        controller: "AdminCodeEnvsAutomationListController",
        templateUrl: '/templates/admin/code-envs/automation/list.html'
    });

    $stateProvider.state('admin.codeenvs-automation.python-edit', {
        url: '/python/:envName/',
        controller: "AdminCodeEnvsAutomationPythonEditController",
        templateUrl: '/templates/admin/code-envs/automation/python-edit.html'
    });

    $stateProvider.state('admin.codeenvs-automation.r-edit', {
        url: '/r/:envName/',
        controller: "AdminCodeEnvsAutomationREditController",
        templateUrl: '/templates/admin/code-envs/automation/R-edit.html'
    });

    /********************
     * Admin / Maintenance
     ********************/

    $stateProvider.state('admin.maintenance', {
        url: 'maintenance/',
        templateUrl: '/templates/admin/maintenance/index.html'
    });

    $stateProvider.state('admin.maintenance.info', {
        url: 'info/',
        templateUrl: '/templates/admin/maintenance/info.html',
        pageTitle: function(stateParams) {
            return "System info";
        },
        controller: "AdminMaintenanceInfoController"
    });

    $stateProvider.state('admin.maintenance.logs', {
        url: 'logs/',
        templateUrl: '/templates/admin/maintenance/logs.html',
        pageTitle: function(stateParams) {
            return "Logs";
        },
        controller: "AdminLogsController"
    });

    $stateProvider.state('admin.maintenance.diagnosis', {
        url: 'diagnosis/',
        templateUrl: '/templates/admin/maintenance/diagnosis.html',
        pageTitle: function(stateParams) {
            return "Diagnosis";
        },
        controller: "AdminDiagnosticsController"
    });

    $stateProvider.state('admin.maintenance.scheduledtasks', {
        url: 'scheduled/',
        templateUrl: '/templates/admin/maintenance/scheduled-tasks.html',
        pageTitle: function(stateParams) {
            return "Scheduled Tasks";
        },
        controller: "AdminScheduledTasksController" // Ugly ....
    });

    /********************
     * Admin / Monitoring
     ********************/

    $stateProvider.state('admin.monitoring', {
        url: 'monitoring',
        abstract: true,
        templateUrl: '/templates/admin/monitoring/index.html',
    });

    $stateProvider.state('admin.monitoring.summary', {
        url: '/',
        controller: "AdminMonitoringSummaryController",
        templateUrl: '/templates/admin/monitoring/global-summary.html',
    });

    $stateProvider.state('admin.monitoring.clustertasks', {
        url: '/cluster-tasks/',
        controller: "AdminMonitoringClusterTasksController",
        templateUrl: '/templates/admin/monitoring/cluster-tasks.html',
    });

    $stateProvider.state('admin.monitoring.connectiondata', {
        url: '/connection-data/',
        controller: "AdminMonitoringConnectionDataController",
        templateUrl: '/templates/admin/monitoring/connection-data.html',
    });

    $stateProvider.state('admin.monitoring.bgtasks', {
        url: '/background-tasks/',
        controller: "AdminMonitoringBackgroundTasksController",
        templateUrl: '/templates/admin/monitoring/background-tasks.html',
    });

    $stateProvider.state('admin.monitoring.webapps', {
        url: '/webapp-backends/',
        controller: "AdminMonitoringWebAppBackendsController",
        templateUrl: '/templates/admin/monitoring/webapp-backends.html',
        pageTitle : function() { return "Webapp backends"; }
    });

    $stateProvider.state('admin.monitoring.integrations', {
        url: '/integrations/',
        controller: "AdminMonitoringIntegrationsController",
        templateUrl: '/templates/admin/monitoring/integrations.html',
        pageTitle : function() { return "Integrations"; }
    });

    /********************
     * Admin / Security
     ********************/

    $stateProvider.state('admin.security', {
        url: 'security/',
        abstract: true,
        templateUrl: '/templates/admin/security/index.html',
        controller: "AdminSecurityController"
    });

    $stateProvider.state('admin.security.users', {
        url: 'users/',
        abstract: true,
        template: '<div ui-view class="h100"></div>',
    });

    $stateProvider.state('admin.security.users.list', {
        url:'',
        templateUrl: '/templates/admin/security/users.html',
        controller: 'UsersController',
        pageTitle: function(stateParams) {
            return "Users";
        }
    });

    $stateProvider.state('admin.security.users.new', {
        url: 'new/',
        templateUrl: '/templates/admin/security/user.html',
        controller: 'UserController',
        pageTitle: function(stateParams) {
            return "New user";
        }
    });

    $stateProvider.state('admin.security.users.edit', {
        url: 'edit/:login/',
        templateUrl: '/templates/admin/security/user.html',
        controller: 'UserController',
        pageTitle: function(stateParams) {
            return "Edit "+stateParams.login+"";
        }
    });

    $stateProvider.state('admin.security.groups', {
        url: 'groups/',
        abstract: true,
        template: '<div ui-view class="h100"></div>',
    });

    $stateProvider.state('admin.security.groups.list', {
        url: '',
        templateUrl: '/templates/admin/security/groups.html',
        pageTitle: function(stateParams) {
            return "Groups";
        },
        controller: "GroupsController"
    });

    $stateProvider.state('admin.security.groups.new', {
        url: 'new/',
        templateUrl: '/templates/admin/security/group.html',
        controller: 'GroupController',
        pageTitle: function(stateParams) {
            return "New group";
        }
    });

    $stateProvider.state('admin.security.groups.edit', {
        url: 'edit/:name/',
        templateUrl: '/templates/admin/security/group.html',
        controller: 'GroupController',
        pageTitle: function(stateParams) {
            return "Edit "+stateParams.name+"";
        }
    });

    $stateProvider.state('admin.security.globalapi', {
        url: 'apikeys/',
        abstract: true,
        template: '<div ui-view class="h100"></div>'
    });

    $stateProvider.state('admin.security.globalapi.list', {
        url: '',
        templateUrl: '/templates/admin/security/global-api-keys.html',
        pageTitle: function(stateParams) {
            return "API";
        },
        controller: "GlobalPublicAPIKeysController"
    });

    $stateProvider.state('admin.security.globalapi.new', {
        url: 'new/',
        templateUrl: '/templates/admin/security/global-api-key.html',
        pageTitle: function(stateParams) {
            return "API";
        },
        controller: "EditGlobalPublicAPIKeyController"
    });

    $stateProvider.state('admin.security.globalapi.edit', {
        url: 'edit/:id/',
        templateUrl: '/templates/admin/security/global-api-key.html',
        controller: 'EditGlobalPublicAPIKeyController',
        pageTitle: function(stateParams) {
            return "API";
        }
    });

    $stateProvider.state('admin.security.personalapi', {
        url: 'personalapikeys/',
        templateUrl: '/templates/admin/security/personal-api-keys.html',
        pageTitle: function(stateParams) {
            return "API";
        },
        controller: "AdminPersonalPublicAPIKeysController"
    });

    $stateProvider.state('admin.security.authorizationmatrix', {
        url: 'authorization-matrix/',
        templateUrl: '/templates/admin/security/authorization-matrix.html',
        controller: "AdminSecurityAuthorizationMatrixController"
    });

    $stateProvider.state('admin.security.auditbuffer', {
        url: 'audit-buffer/',
        templateUrl: '/templates/admin/security/audit-buffer.html',
        controller: "AdminSecurityAuditBufferController"
    });

    // Connections management

    $stateProvider.state('admin.connections', {
        url: 'connections/',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('admin.connections.list', {
        url: 'list/',
        templateUrl: '/templates/admin/connections.html',
        controller: 'ConnectionsController',
        pageTitle: function(stateParams) {
             return "Overview";
        }
    });

    $stateProvider.state('admin.connections.hiveindexing', {
        url: 'hive-indexing/',
        templateUrl: '/templates/admin/connections.html', // Reuses the same template
        controller: 'ConnectionsHiveIndexingController',
        pageTitle: function(stateParams) {
             return "Hive indexing";
        }
    });

    $stateProvider.state('admin.connections.new', {
        url: 'new/:type/',
        templateUrl: '/templates/admin/connection.html',
        controller: 'ConnectionController',
        pageTitle: function(stateParams) {
            return "New " + stateParams.type + " connection";
        }
    });

    $stateProvider.state('admin.connections.edit', {
        url: ':connectionName/',
        templateUrl: '/templates/admin/connection.html',
        controller: 'ConnectionController',
        pageTitle: function(stateParams) {
            return stateParams.connectionName + " - Connection";
        }
    });

    // Clusters admin
    $stateProvider.state('admin.clusters', {
        url: 'clusters',
        abstract: true,
        template: '<div ui-view></div>'
    });

    $stateProvider.state('admin.clusters.list', {
        url: '/',
        templateUrl: '/templates/admin/clusters/clusters.html',
        controller: "ClustersController",
        pageTitle: function(stateParams) {
            return "Clusters";
        }
    });

    $stateProvider.state('admin.clusters.cluster', {
        url: '/:clusterId',
        templateUrl: '/templates/admin/clusters/cluster.html',
        controller: "ClusterController",
        pageTitle: function(stateParams) {
            return "Cluster";
        }
    });

    //last but not the least : a route to cach everything that could not be routed

    $stateProvider.state("otherwise", {
        url: "*path",
        templateUrl: "/templates/404.html",
        controller: function($scope, $stateParams) {
            $scope.$stateParams = $stateParams;
        }
    });

    $httpProvider.interceptors.push('dssInterceptor');
});


})();
