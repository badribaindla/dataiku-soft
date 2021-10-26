(function(){
'use strict';

var app = angular.module('dataiku.admin.monitoring', []);

app.controller("AdminMonitoringSummaryController", function($scope, $rootScope, $state, DataikuAPI, $filter, $anchorScroll, $timeout){
    $scope.refresh = function refresh(){
        DataikuAPI.admin.monitoring.getGlobalUsageSummary().success(function(data){
            $scope.globalSummary = data;
            $scope.globalSummary.datasets.allByTypeArray = $filter("toKVArray")($scope.globalSummary.datasets.allByType);
            $scope.globalSummary.recipes.byTypeArray = $filter("toKVArray")($scope.globalSummary.recipes.byType);
            $timeout(() => $anchorScroll());
        }).error(setErrorInScope.bind($scope));
    }
    $scope.refresh();
});

app.controller("AdminMonitoringWebAppBackendsController", function($scope, $rootScope, $state, DataikuAPI, ActivityIndicator) {
    $scope.refreshList = function(){
        DataikuAPI.webapps.listAllBackendsStates().success(function(data){
            $scope.backends = data;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.stopBackend = function(backend){
        DataikuAPI.webapps.stopBackend({projectKey:backend.projectKey, id:backend.webAppId}).success(function(data){
            ActivityIndicator.success("Backend stopped")
        }).error(setErrorInScope.bind($scope));
    }

    $scope.restartBackend = function(backend){
        DataikuAPI.webapps.restartBackend({projectKey:backend.projectKey, id:backend.webAppId}).success(function(data){
            ActivityIndicator.success("Backend start command sent")
        }).error(setErrorInScope.bind($scope));
    }
    $scope.refreshList();
});

app.controller("AdminMonitoringIntegrationsController", function($scope, DataikuAPI, ActivityIndicator, Dialogs, WT1) {
    $scope.hidePreviewColumn = true;
    $scope.noTags = true;
    $scope.noStar = true;
    $scope.noWatch = true;
    $scope.massDelete = true;
    $scope.massIntegrations = true;
    $scope.noDelete = true;

    $scope.sortBy = [
        { value: 'projectKey', label: 'Project name' },
        { value: 'integrationName', label: 'Integration type' },
        { value: 'integrationActive', label: 'Active' }
    ];
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            interest: {
                starred: '',
            },
        },
        filterParams: {
            userQueryTargets: ["projectKey", "name", "integrationName", "integrationProperties"],
            propertyRules: { },
        },
        orderQuery: "projectKey",
        orderReversed: false,
    }, $scope.selection || {});
    $scope.sortCookieKey = 'project-integrations';
    $scope.maxItems = 100;

    $scope.list = () => {
        WT1.event("refresh-project-integrations-list");
        DataikuAPI.admin.monitoring.getProjectsIntegrations().success((data) => {
            $scope.integrations = data;
            $scope.listItems = [];
            data.forEach(item => {
                item.integrations.forEach(integration => {
                    $scope.listItems.push({
                        ...integration,
                        integrationName: formatIntegrationName(integration.hook.type),
                        integrationActive: integration.active,
                        integrationDetails: integration.hook.configuration.webhookUrl || undefined,
                        integrationProperties: formatIntegrationProperties(integration),
                        projectKey: item.projectKey
                    });
                });
            });
        }).error(setErrorInScope.bind($scope));
    };
    $scope.list();

    $scope.toggleActive = function(item) {
        WT1.event("integration-save-active");
        DataikuAPI.admin.monitoring.saveProjectIntegration(item.projectKey, item).success(function(data){
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteIntegration = (item) => {
        WT1.event("integration-delete");
        DataikuAPI.admin.monitoring.deleteProjectIntegration(item.projectKey, item).success(() => {
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.massDeletion = (items) => {
        if(items.length < 1) return;
        Dialogs.confirm($scope, "Confirm deletion", "Are you sure you want to delete the selected integrations?").then(function() {
            items.forEach((item) => {
                item.active = status;
                $scope.deleteIntegration(item);
                $scope.listItems = $scope.listItems.filter(s => s !== item)
            })
        });
    };

    $scope.allIntegrations = function(objects) {
        if (!objects) return;
        return objects.map(o => o.active).reduce(function(a,b){return a&&b;},true);
    };

    $scope.autoIntegrationsObjects = function(autoIntegrationsStatus, objects) {
        objects.forEach(function(object) {
            if (object.active === autoIntegrationsStatus) return;
            object.active = autoIntegrationsStatus;
            $scope.toggleActive(object);
        })
    };

    const formatIntegrationProperties = (integration) => {
        if(integration.hook.type === "github") {
            return "Repository: " + integration.hook.configuration.repository;
        }

        const labels = [];
        if(integration.hook.configuration.selection.commits)                     { labels.push("Git commits"); }
        if(integration.hook.configuration.selection.discussions)                 { labels.push("Discussions messages"); }
        if(integration.hook.configuration.selection.jobEnds)                     { labels.push("Build jobs ends"); }
        if(integration.hook.configuration.selection.jobStarts)                   { labels.push("Build jobs beginnings"); }
        if(integration.hook.configuration.selection.mlEnds)                      { labels.push("Analysis ML training ends"); }
        if(integration.hook.configuration.selection.mlStarts)                    { labels.push("Analysis ML training beginnings"); }
        if(integration.hook.configuration.selection.scenarioEnds)                { labels.push("Scenario ends"); }
        if(integration.hook.configuration.selection.scenarioStarts)              { labels.push("Scenario starts"); }
        if(integration.hook.configuration.selection.timelineEditionItems)        { labels.push("Objects editions"); }
        if(integration.hook.configuration.selection.timelineItemsExceptEditions) { labels.push("Objects creation / deletion / ..."); }
        if(integration.hook.configuration.selection.watchStar)                   { labels.push("Watch / Star"); }
        return labels.length > 0 ? "Sends on " + labels.join(", ") : "";
    };

    const  formatIntegrationName = (type) => {
        const typeMapping = {
            "msft-teams-project": "Microsoft Teams",
            "github": "Github",
            "slack-project": "Slack"
        };
        return typeMapping[type] || type;
    }
});


app.controller("AdminMonitoringClusterTasksController", function($scope, $rootScope, $state, DataikuAPI, Fn, $filter){

	$scope.uiState = {}

    DataikuAPI.admin.connections.list().success(function(data) {
        var array = $filter("toArray")(data);
        var hasHDFS = array.filter(Fn.compose(Fn.prop("type"), Fn.eq("HDFS"))).length > 0;
        $scope.connections = array.filter(function(x){
            return x.type != "HDFS";
        }).map(function(x){
            return { "name"  :x.name , type  : x.type , "id" : x.name }
        });
        if (hasHDFS) {
            $scope.connections.push({
                "name" : "Hadoop",
                "type" : "Hadoop",
                "id" : "HADOOP"
            })
        }
    }).error(setErrorInScope.bind($scope));

    $scope.fetchData = function fetchData(connectionId){
        DataikuAPI.admin.monitoring.getConnectionTasksHistory(connectionId).success(function(data){
            $scope.connectionData = data;

            data.lastTasks.forEach(function(t) {
                t.elapsedTime = t.endTime - t.startTime;
            })

            $scope.projectData = [];
            data.perProject.forEach(function(p) {
                p.types.forEach(function(t, i){
                    $scope.projectData.push(angular.extend(t, {projectKey : p.project, l : p.types.length}));
                });
            });

            $scope.userData = [];
            data.perUser.forEach(function(p) {
                p.types.forEach(function(t, i){
                    $scope.userData.push(angular.extend(t, {initiator : p.user, l : p.types.length}));
                });
            });

        }).error(setErrorInScope.bind($scope));
    }
});

app.controller("AdminMonitoringBackgroundTasksController", function ($scope, DataikuAPI, $rootScope, Dialogs, ProgressStackMessageBuilder) {
    $rootScope.$emit("futureModalOpen");
    $scope.Math = window.Math; // for the display of the running time
    function isScenarioFuture(future) {
        try {
            return future.payload.action == 'run_scenario';
        } catch (e) {}
        return false;
    }
    $scope.refreshList = function() {
        $scope.running = {scenarios:[], futures:[], jobs:[], notebooks:[]};
        DataikuAPI.running.listAll().success(function(data) {
            $scope.running = data;
            //scenario have normal futures, but we put them in another tab
            $scope.running.scenarios = $scope.running.futures.filter(function(f){return isScenarioFuture(f);});
            $scope.running.futures = $scope.running.futures.filter(function(f){return !isScenarioFuture(f);});
        }).error(setErrorInScope.bind($scope));
    };

    $scope.abortFuture = function(jobId) {
        DataikuAPI.futures.abort(jobId).success(function(data) {
            $scope.refreshList();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.abortNotebook = function(jobId) {
        DataikuAPI.jupyterNotebooks.unload(jobId).success(function(data) {
            $scope.refreshList();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.abortJob = function(projectKey, jobId) {
        DataikuAPI.flow.jobs.abort(projectKey, jobId).success(function(data) {
            $scope.refreshList();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.refreshList();
    $scope.$on('$destroy', function() {
        $rootScope.$emit("futureModalClose");
    });
});


app.controller("AdminMonitoringConnectionDataController", function($scope, $rootScope, $state, DataikuAPI, Fn, $filter, CreateModalFromTemplate, FutureProgressModal, InfoMessagesModal, Dialogs, DatasetsService){

    $scope.uiState = {}

    DataikuAPI.admin.connections.list().success(function(data) {
        var array = $filter("toArray")(data);
        $scope.connections = array.map(function(x){
            return { "name"  :x.name , type  : x.type , "id" : x.name }
        });
    }).error(setErrorInScope.bind($scope));

    $scope.fetchData = function fetchData(connectionId){
        DataikuAPI.admin.monitoring.connectionData.get(connectionId).success(function(data){
            $scope.connectionData = data;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.focusOnProject = function(connectionId, projectKey) {
         DataikuAPI.admin.monitoring.connectionData.getForProject(connectionId, projectKey).success(function(data){
            $scope.projectData = data;
        }).error(setErrorInScope.bind($scope));
    }
    $scope.clearProjectData = function(){
        $scope.projectData = null;
    }

    $scope.updateForProject = function(connectionId, projectKey){
        CreateModalFromTemplate("/templates/admin/monitoring/connection-data-update-confirm.html", $scope, null, function(newScope){
            newScope.settings = {
                computeRecords : false,
                forceRecompute : false
            }
            newScope.go = function(){
                DataikuAPI.admin.monitoring.connectionData.updateForProject(
                    connectionId, projectKey, newScope.settings.computeRecords, newScope.settings.forceRecompute).success(function(data){
                    FutureProgressModal.show($scope, data, "Datasets update").then(function(result){
                        Dialogs.infoMessagesDisplayOnly($scope, "Update result", result);
                        $scope.fetchData(connectionId);
                    })
                    newScope.dismiss();
                });
            }
        });
    }

    $scope.updateSingleDataset = function(connectionId, projectKey, datasetName) {
        CreateModalFromTemplate("/templates/admin/monitoring/connection-data-update-confirm.html", $scope, null, function(newScope){
            newScope.settings = {
                computeRecords : false,
                forceRecompute : false
            }
            newScope.go = function(){
                DataikuAPI.admin.monitoring.connectionData.updateForDataset(
                    projectKey, datasetName, newScope.settings.computeRecords, newScope.settings.forceRecompute).success(function(data){
                    FutureProgressModal.show($scope, data, "Dataset update").then(function(result){
                        InfoMessagesModal.showIfNeeded($scope, result, "Update result");
                        $scope.focusOnProject(connectionId, projectKey);
                    })
                    newScope.dismiss();
                });
            }
        });
    };

    $scope.clearDataset = function(connectionId, projectKey, datasetName) {
        DatasetsService.clear($scope, projectKey, datasetName).then(function() {
            $scope.focusOnProject(connectionId, projectKey);
        });
    };


});


})();