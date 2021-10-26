(function(){
'use strict';

const app = angular.module('dataiku.projects.settings',[]);

//TODO: common controller
app.controller("ProjectSettingsVariablesController", function($scope, $stateParams, DataikuAPI, Logger, ActivityIndicator, TopNav) {
    TopNav.setLocation(TopNav.TOP_MORE, "variables", "NONE", null);
    $scope.projectVariables = {};

    function getSerialized() {
        return {
            standard : JSON.parse($scope.projectVariables.standardAsJSON || '{}'),
            local : JSON.parse($scope.projectVariables.localAsJSON || '{}')
        };
    }

    $scope.dirtyVariables = function() {
        if (!$scope.projectVariables.saved) {return false;}
        try {
            return !angular.equals(getSerialized(), $scope.projectVariables.saved);
        } catch (err) {
            Logger.error(err);
            return true; // Always dirty if invalid
        }
    };

    $scope.saveVariables = function(){
        try {
            var serialized = getSerialized();
            var gv = JSON.parse($scope.projectVariables.asJSON || '{}');
            return DataikuAPI.projects.variables.save($stateParams.projectKey, serialized).success(function(data) {
                $scope.projectVariables.saved = serialized;
                ActivityIndicator.success("Saved variables");
            }).error(setErrorInScope.bind($scope));
        } catch (err) {
            ActivityIndicator.error("Invalid format: "+err.message);
        }
    };

    DataikuAPI.projects.variables.get($stateParams.projectKey).success(function(data){
        $scope.projectVariables.saved = angular.copy(data);
        $scope.projectVariables.standardAsJSON = JSON.stringify(data.standard, null, 2);
        $scope.projectVariables.localAsJSON = JSON.stringify(data.local, null, 2);

    }).error(setErrorInScope.bind($scope));

    checkChangesBeforeLeaving($scope, $scope.dirtyVariables);
});

//TODO: common controller
app.controller("ProjectSettingsSettingsController", function($scope, $controller, $stateParams,$timeout, DataikuAPI, WT1, TopNav,
                                                             Dialogs, $q, ActivityIndicator,
                                                             ProjectIntegrations, FutureProgressModal, TaggingService, PluginConfigUtils) {

    $scope.uiState = {
        settingsPane : $stateParams.selectedTab || 'tags',
        selectedPlugin: null
    };

    $scope.sqlLikeRecipesInitializationModes = [
        ["RESOLVED_TABLE_REFERENCES", "Fully-resolved table references"],
        ["VARIABILIZED_TABLE_REFERENCES", "Table references with variables"],
        ["DATASET_REFERENCES", "Virtual dataset references"]
    ]
    $scope.sqlLikeRecipesInitializationModesDesc = [
        "Like MYPROJECT_mytable. The most 'understandable' form, it does not permit relocation to another project since the recipe will not 'follow'",
        "Like ${projectKey}_mytable. This form permits relocation to another project key, but does not support changing the name of the table in the datasets",
        "Like ${tbl:datasetName}. This is the most versatile form but is slightly less familiar for SQL developers"
    ]

    $scope.virtualWebAppBackendSettingsModes = [{id:"USE_DEFAULT", label:"Run as local processes"}, {id:"INHERIT", label:"Inherit instance-level settings"}, {id:"EXPLICIT", label:"Run in container"}];
    
    DataikuAPI.security.listUsers().success(function(data) {
        $scope.allUsers = data;
    }).error(setErrorInScope.bind($scope));

    var savedSettings = null;

    $scope.invalidTabs = new Set();

    $scope.$watch("uiState.settingsPane", function(nv, ov) {
        if (nv === ov) return;
        // We do not set 'Resource control' tab as invalid to avoid weird UI behavior. For this tab, a ng-model is not
        // changed if the new input value is not valid. Hence if a user exits the 'Resource control' tab with some
        // invalid fields and then switch back to it, the fields will no longer be invalid, which can be confusing.
        if ($scope.projectSettingsForms.$invalid && ov !== 'limits') {
            $scope.invalidTabs.add(ov);
        }
        $scope.invalidTabs.delete(nv);
    });

    $scope.isProjectSettingsFormInvalid = function() {
        return $scope.projectSettingsForms.$invalid || $scope.invalidTabs.size;
    }

    $scope.dirtySettings = function() {
        return !$scope.projectSettings
            || !angular.equals($scope.projectSettings.settings, savedSettings)
            || !angular.equals($scope.projectTagsMapDirty, $scope.projectTagsMap)
            || ($scope.originalPluginSettings !== null && !angular.equals($scope.originalPluginSettings, $scope.pluginSettings));
    };

    $scope.validIntegration = ProjectIntegrations.getValidity;

    loadSettings();

    function loadSettings() {
         DataikuAPI.projects.getSettings($stateParams.projectKey).success(function(projectSettings) {
             $scope.projectSettings = projectSettings;
             savedSettings = angular.copy($scope.projectSettings.settings);
             $scope.savedSettings = savedSettings;
         }).error(setErrorInScope.bind($scope));
    }

    // Settings mgmt
    $scope.saveSettings = function() {
        // filter out rules of exposed datasets where the projectKey is still null
        var settings = angular.copy($scope.projectSettings.settings);

        var promises = [];
        if (!angular.equals($scope.projectSettings.settings, savedSettings)) {
            promises.push(DataikuAPI.projects.saveSettings($stateParams.projectKey, settings).error(setErrorInScope.bind($scope)));
        }

        $q.all(promises).then(loadSettings).then($scope.refreshProjectData).then(() => {
            if (!$scope.validIntegration() || $scope.projectSettingsForms.$invalid) {
                ActivityIndicator.warning("Saved with some invalid fields");
            } else {
                ActivityIndicator.success("Saved!");
            }
        });

        TaggingService.saveToBackend($scope.projectTagsMapDirty).success(function() {
            $scope.projectTagsMap = angular.copy($scope.projectTagsMapDirty);
            $scope.$broadcast('projectSettingsSaved');
        });

        // Save plugins at project level by providing the project key
        $scope.dirtyPluginSettings() && $scope.savePluginSettings($stateParams.projectKey);
    };

    $scope.availableIntegrationTypes = ProjectIntegrations.integrationTypes;
    $scope.getIntegrationTypeLabel = function(type) {
        const integration = $scope.availableIntegrationTypes.find(element => element.id === type);
        return integration === undefined ? type : integration.label;
    };

    $scope.addIntegration = function(type) {
        WT1.event("project-integration-add", {type: type});
        var intConf = {};
        var integration = {
            active : true,
            hook : {
                type : type,
                configuration : intConf
            },
            $expanded:true
        };

        switch (type) {
            case "slack-project":
                intConf.mode = 'WEBHOOK';
                intConf.useProxy = true;
                intConf.selection = {
                    timelineEditionItems: true,
                    timelineItemsExceptEditions: true,
                    watchStar: true
                };
                break;
            case "msft-teams-project":
                intConf.useProxy = true;
                intConf.selection = {
                    timelineEditionItems: true,
                    timelineItemsExceptEditions: true,
                    watchStar: true
                };
                break;
        }

        $scope.projectSettings.settings.integrations.integrations.push(integration);
    };

    $scope.removeIntegration = function(index) {
        $scope.projectSettings.settings.integrations.integrations.splice(index, 1);
        ProjectIntegrations.removeIntegration(index);
    };

    $timeout(function() {
        checkChangesBeforeLeaving($scope, $scope.dirtySettings);
    });

    $scope.resyncHDFSDatasetPermissions = function(){
        DataikuAPI.projects.resyncHDFSDatasetPermissions($stateParams.projectKey).success(function(data){
            FutureProgressModal.show($scope, data, "ACLs sync").then(function(result){
                Dialogs.infoMessagesDisplayOnly($scope, "ACLs sync result", result);
            });
        });
    };
    
    DataikuAPI.admin.clusters.listAccessible('HADOOP').success(function(data){
        $scope.clusterIds = data.map(function(c) {return c.id;});
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.admin.clusters.listAccessible('KUBERNETES').success(function(data){
        $scope.k8sClusterIds = data.map(function(c) {return c.id;});
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.containers.listNames().success(function(data){
        $scope.containerNames = data;
    }).error(setErrorInScope.bind($scope));

    // Plugins presets
    $controller("PluginsExploreController", { $scope: $scope });
    $controller("PluginSettingsController", { $scope: $scope });

    $scope.refreshPluginsList = function() {
        DataikuAPI.plugins.listPluginsWithPresets().success(function(data) {
            $scope.projectPluginsList = { plugins: data };
        }).error(setErrorInScope.bind($scope));
    };

    $scope.selectPlugin = function(pluginId) {
        if (!pluginId) {
            return;
        }
        // Get plugin with project-level settings (by providing the project key)
        DataikuAPI.plugins.get(pluginId, $stateParams.projectKey).success(function(data) {
            $scope.pluginData = data;
            $scope.installed = data.installedDesc;

            if ($scope.installed.desc.params && data.settings.config) {
                PluginConfigUtils.setDefaultValues($scope.installed.desc.params, data.settings.config);
            }
            $scope.setPluginSettings(data.settings);
            $scope.uiState.selectedPlugin = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.refreshPluginsList();

    TopNav.setLocation(TopNav.TOP_MORE, "settings", "NONE", "config");
});

app.service("ProjectIntegrations", function(){
    var validIntegrations = [];
    return {
        integrationTypes :[
            {"id" : "slack-project", "label" : "Slack"},
            {"id" : "msft-teams-project", "label" : "Microsoft Teams"},
            {"id" : "github", "label" : "Github"}
        ],
        getValidity : () => !validIntegrations.includes(false),
        setValidity : (index, flag) => {
            validIntegrations[index] = flag;
        },
        removeIntegration : (index) => validIntegrations.splice(index,1)
    };
});

app.directive("projectIntegrationEditor", function(ProjectIntegrations){
    return {
        scope : true,
        templateUrl : '/templates/projects/project-integration-editor.html',
        link : function($scope, element, attrs) {
            $scope.integrationTypes = ProjectIntegrations.integrationTypes;
        }
    }
});

app.directive("projectIntegrationParams", function(ProjectIntegrations){
    return {
        scope : {
            hook : '=',
            form : '=',
            index : '='
        },
        link : function($scope, element) {
            $scope.$watch("form.$valid", () => ProjectIntegrations.setValidity($scope.index, $scope.form.$valid)); 
        },
        templateUrl : '/templates/projects/project-integration-params.html',
    }
});

app.controller("NotificationsReporterController", function($scope, $timeout) {
    $scope.noStartMessage = $scope.noStartMessage || false;
    $scope.showItemHeader = $scope.showItemHeader == undefined || $scope.showItemHeader;

    $scope.conditionEditorOptions = {
            mode:'text/grel',
            theme:'elegant',
            indentUnit: 4,
            lineNumbers : false,
            lineWrapping : true,
            autofocus: true,
            onLoad : function(cm) {$scope.codeMirror = cm;}
        };

    // because otherwise the codemirror pops up shrunk when the ng-show on reporter.messaging.channelId changes state
    $scope.$watch("reporter.messaging.channelId", function() {
        if ( $scope.codeMirror ) {
            $timeout(function() {$scope.codeMirror.refresh();});
        }
    }, true);

    if ($scope.reporter.messaging == null) {
        $scope.reporter.messaging = {};
    }
});

/***********************************
 * Security
 ***********************************/

 //TODO: common controller
app.controller("ProjectSettingsSecurityController", function($scope, TopNav, $stateParams) {
    TopNav.setLocation(TopNav.TOP_MORE, "security", "NONE", null);
    $scope.uiState = {
        securityPane : $stateParams.selectedTab || 'permissions',
    };
    $scope.$watch("projectSummary", function(nv) {
        if (!nv || $stateParams.selectedTab) return;

        if ($scope.projectSummary.isProjectAdmin) {
            $scope.uiState.securityPane = "permissions";
        } else if ($scope.projectSummary.canManageDashboardAuthorizations) {
            $scope.uiState.securityPane = "dashboard";
        } else if ($scope.projectSummary.canManageAdditionalDashboardUsers) {
            $scope.uiState.securityPane = "dashboardUsers";
        } else {
            $scope.uiState.securityPane = "exposed";
        }
    });
})

app.controller("ProjectSettingsAPIController", function($scope, $stateParams,
               DataikuAPI, Dialogs,CreateModalFromTemplate) {

    $scope.canAPI = function(){
        if ($scope.appConfig.communityEdition && !$scope.appConfig.licensing.ceEntrepriseTrial) return false;
        if ($scope.appConfig.licensingMode == "SAAS") return false;
        return true;
    }

    $scope.refreshProjectApiKeysList = function() {
        DataikuAPI.projects.publicApi.listProjectApiKeys($stateParams.projectKey).success(function(data) {
            $scope.apiKeys = data;
        }).error(setErrorInScope.bind($scope));
    };


    $scope.createProjectApiKey = function() {
        CreateModalFromTemplate("/templates/projects/project-api-key-modal.html", $scope, null, function(newScope) {
            newScope.apiKey = {
                projectKey : $stateParams.projectKey,
                label : "New key",
                localDatasets : [ {
                    datasets : ['__rw__dataset1__', '__rw__dataset2__'],
                    privileges : [
                        'READ_DATA',
                        'WRITE_DATA',
                        'READ_METADATA',
                        'WRITE_METADATA',
                        'READ_SCHEMA',
                        'WRITE_SCHEMA'
                    ]
                }, {
                    datasets : ['__r__dataset__'],
                    privileges : [
                        'READ_DATA',
                        'READ_METADATA',
                        'READ_SCHEMA'
                    ]
                }],
                projectPrivileges : {
                    admin: false,
                    readProjectContent: true,
                    writeProjectContent: false,
                    exportDatasetsData: true,
                    readDashboards: true,
                    writeDashboard: false,
                    moderateDashboards: false,
                    runScenarios: false,
                    manageDashboardAuthorizations: false,
                    manageExposedElements: false,
                    executeApp: false
                },
                execSQLLike: false
            };
            newScope.creation = true;
        });
    };

    $scope.editProjectApiKey = function(key) {
        CreateModalFromTemplate("/templates/projects/project-api-key-modal.html", $scope, null, function(newScope) {
            newScope.apiKey = angular.copy(key);
            newScope.creation = false;
        });
    };

    $scope.deleteProjectApiKey = function(keyLabel) {
        Dialogs.confirm($scope, "Remove API key", "Are you sure you want to remove this API key?").then(function() {
            DataikuAPI.projects.publicApi.deleteProjectApiKey($stateParams.projectKey, keyLabel).success(function(data){
               $scope.refreshProjectApiKeysList();
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.keyIsProjectAdmin = function(key) {
        return key && key.projectPrivileges && key.projectPrivileges.admin;
    };

    $scope.refreshProjectApiKeysList();
});


app.controller("ProjectSettingsPermissionsController", function($scope, $stateParams, DataikuAPI, Dialogs,
    ActivityIndicator, PermissionsService) {
    $scope.ui = {};
    
    function makeNewPerm(){
        $scope.newPerm = {
            writeProjectContent: true,
            exportDatasetsData: true
        }
    }
    makeNewPerm();

    $scope.isDirty = function() {
        return !angular.equals(lastProjectSettings,$scope.projectSettings);
    };
    checkChangesBeforeLeaving($scope, $scope.isDirty);

    let lastProjectSettings;
    DataikuAPI.security.listGroups(false).success(function(allGroups) {
        if (allGroups) {
            allGroups.sort();
        }
        $scope.allGroups = allGroups;
        DataikuAPI.security.listUsers().success(function(data) {
            $scope.allUsers = data;

            $scope.allUsers.sort(function(a, b){
                if (a.displayName < b.displayName) return -1;
                if (a.displayName > b.displayName) return 1;
                return 0;
            });

            DataikuAPI.projects.getSettings($stateParams.projectKey).success(function(projectSettings) {
                $scope.projectSettings = projectSettings;
                lastProjectSettings = angular.copy($scope.projectSettings);
                if ($scope.ui) {
                    $scope.ui.ownerLogin = projectSettings && projectSettings.owner;
                }
            }).error(setErrorInScope.bind($scope));
        }).error(setErrorInScope.bind($scope));
    }).error(setErrorInScope.bind($scope));

    $scope.save = function() {
        DataikuAPI.projects.savePermissions($stateParams.projectKey, $scope.projectSettings).success(function(data) {
            lastProjectSettings = angular.copy($scope.projectSettings);
            if (data.anyMessage) {
                Dialogs.infoMessagesDisplayOnly($scope, "Permissions update", data);
            }
            ActivityIndicator.success("Saved!");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.addPermission = function() {
        $scope.projectSettings.permissions.push($scope.newPerm);
        makeNewPerm();
    };

    $scope.getUserDisplayName = function (login) {
        const user = $scope.allUsers.find(u => u.login === login);
        return user ? user.displayName : null;
    }

    $scope.$watch("projectSettings.permissions", function(nv, ov) {
        if (!nv) return;

        $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.projectSettings, $scope.allGroups);
        $scope.unassignedUsers = PermissionsService.buildUnassignedUsers($scope.projectSettings, $scope.allUsers);

        /* Handle implied permissions */
        $scope.projectSettings.permissions.forEach(function(p) {
            p.$readProjectContentDisabled = false;
            p.$writeProjectContentDisabled = false;
            p.$exportDatasetsDataDisabled = false;
            p.$readDashboardsDisabled = false;
            p.$writeDashboardsDisabled = false;
            p.$moderateDashboardsDisabled = false;
            p.$runScenariosDisabled = false;
            p.$manageDashboardAuthorizationsDisabled = false;
            p.$manageExposedElementsDisabled = false;
            p.$manageAdditionalDashboardUsersDisabled = false;
            p.$executeAppDisabled = false;
            
            if (p.admin) {
                p.$readProjectContentDisabled = true;
                p.$writeProjectContentDisabled = true;
                p.$exportDatasetsDataDisabled = true;
                p.$readDashboardsDisabled = true;
                p.$writeDashboardsDisabled = true;
                p.$moderateDashboardsDisabled = true;
                p.$runScenariosDisabled = true;
                p.$manageDashboardAuthorizationsDisabled = true;
                p.$manageExposedElementsDisabled = true;
                p.$manageAdditionalDashboardUsersDisabled = true;
                p.$executeAppDisabled = true;
            }
            if (p.writeProjectContent) {
                p.$readProjectContentDisabled = true;
                p.$readDashboardsDisabled = true;
                p.$writeDashboardsDisabled = true;
                p.$moderateDashboardsDisabled = true;
                p.$runScenariosDisabled = true;
                p.$executeAppDisabled = true;
            }
            if (p.readProjectContent) {
                p.$readDashboardsDisabled = true;
                p.$executeAppDisabled = true;
            }
            if (p.writeDashboards) {
                p.$readDashboardsDisabled = true;
            }
            if (p.moderateDashboards) {
                p.$readDashboardsDisabled = true;
                p.$writeDashboardsDisabled = true;
            }
        });

    }, true);

    // Ownership mgmt
    $scope.$watch("ui.ownerLogin", function() {
        PermissionsService.transferOwnership($scope, $scope.projectSettings, "project");
    });
    $scope.$watch("projectSettings.owner", function(newOwnerLogin) {
        if (! newOwnerLogin) return;
        // Remove individual permissions for this user, if any
        let i;
        while ((i = $scope.projectSettings.permissions.findIndex(p => p.user === newOwnerLogin)) >= 0) {
            $scope.projectSettings.permissions.splice(i, 1);
        }
        // Rebuild assignable users list
        $scope.unassignedUsers = PermissionsService.buildUnassignedUsers($scope.projectSettings, $scope.allUsers);
    });
});


app.controller("EditProjectAPIKeyModalController", function($scope, DataikuAPI) {
    $scope.create = function(){
        DataikuAPI.projects.publicApi.createProjectApiKey($scope.apiKey).success(function(data){
            $scope.dismiss();
            $scope.refreshProjectApiKeysList();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.save = function(){
        DataikuAPI.projects.publicApi.saveProjectApiKey($scope.apiKey).success(function(data){
            $scope.dismiss();
            $scope.refreshProjectApiKeysList();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.makeAdmin = function(key) {
        if (angular.isObject(key.projectPrivileges)) {
            key.projectPrivileges.admin = true;
            key.projectPrivileges = angular.copy(key.projectPrivileges);
        } else {
            key.projectPrivileges = {'admin': true};
        }
        key.localDatasets = [];
    };
});


app.factory("ProjectSettingsObjectsListService", function(DataikuAPI, $stateParams, Fn) {
    var svc = {
        addOnScope: function($scope) {
            var projectKey = $stateParams.projectKey;

            function idsAndNames(data) {
                return data.map(function(x){return [x.id, x.name]});
            }

            DataikuAPI.savedmodels.list(projectKey).success(function(data){
                $scope.savedModels = idsAndNames(data);
            });
            DataikuAPI.modelevaluationstores.list(projectKey).success(function(data){
                $scope.modelEvaluationStores = idsAndNames(data);
            });
            DataikuAPI.managedfolder.list(projectKey).success(function(data){
                $scope.managedFolders = idsAndNames(data);
            });
            DataikuAPI.webapps.list(projectKey).success(function(data){
                $scope.webApps = idsAndNames(data);
            });
            DataikuAPI.reports.list(projectKey).success(function(data){
                $scope.reports = idsAndNames(data);
            });

            DataikuAPI.datasets.listNames(projectKey).success(function(data){
                $scope.datasetNames = data;
            });

            DataikuAPI.jupyterNotebooks.listHeads(projectKey, {}).success(function(data){
                $scope.jupyterNotebooks = data.items.map(Fn.prop('name'));
            });

            DataikuAPI.projects.list().success(function(data) {
                $scope.projectsList = data;
            }).error(setErrorInScope.bind($scope));
        }
    }
    return svc;
})

app.controller("ProjectSettingsExposedController", function($scope, $state, $stateParams, $filter,
               DataikuAPI, WT1, TopNav, Dialogs, CreateModalFromTemplate, ActivityIndicator, EXPOSABLE_TYPES) {

    $scope.exposableTypes = EXPOSABLE_TYPES;

    // object links
    $scope.openObject = function(object) {
        switch (object.type) {
            case 'DATASET':
                $state.go('projects.project.datasets.dataset.explore',{datasetName: object.localName});
                break;
            case 'SAVED_MODEL':
                $state.go('projects.project.savedmodels.savedmodel.versions',{smId: object.localName});
                break;
            case 'MODEL_EVALUATION_STORE':
                $state.go('projects.project.modelevaluationstoress.modelevaluationstores.versions',{mesId: object.localName});
                break;
            case 'MANAGED_FOLDER':
                $state.go('projects.project.managedfolders.managedfolder.view',{odbId: object.localName});
                break;
            case 'JUPYTER_NOTEBOOK':
                $state.go('projects.project.notebooks.jupyter_notebook',{notebookId: object.localName});
                break;
            case 'WEB_APP':
                $state.go('projects.project.webapps.webapp.view',{webAppId: object.localName, webAppName:$filter('slugify')(object.displayName)});
                break;
            case 'REPORT':
                $state.go('projects.project.reports.report.view',{reportId: object.localName});
                break;
            case 'SCENARIO':
                $state.go('projects.project.scenarios.scenario.steps',{scenarioId: object.localName});
                break;
        }
    };

    function removeItemFromArray(item, arr) {
        var idx = arr.indexOf(item);
        if (idx > -1) {
            arr.splice(idx, 1);
        }
    }

    $scope.uiState = $scope.uiState || {};
    $scope.uiState.view = 'objects';

    $scope.newSource = {};
    $scope.projects = [];

    // Global indices to disable existing objects / projects when adding to list (per-object and per-project indices are stored on the object/project itself)
    $scope.projectsIndex = {};
    $scope.objectsIndex = {};

    if ($stateParams.projectKey) {
        $scope.projectsIndex[$stateParams.projectKey] = true;
    }

    // Caches for object-picker objects
    $scope.available = {};

    function loadSettings() {
        DataikuAPI.projects.getEnrichedExposedObjects($stateParams.projectKey, true).success(function(exposedObjects) {
            $scope.exposedObjects = exposedObjects;
            $scope.origExposedObjects = dkuDeepCopy($scope.exposedObjects, function(key) { return !key.startsWith('$'); });

            $scope.exposedObjects.objects.forEach(function(object) {
                object.$open = object.rules.length == 0;
                for (var i = 0; i < object.rules.length; i++) {

                    var project = object.rules[i];
                    if (!$scope.projectsIndex[project.targetProject]) {
                        $scope.projectsIndex[project.targetProject] = project;
                        $scope.projects.push(project);
                    } else {
                        project = $scope.projectsIndex[project.targetProject];
                        object.rules[i] = project;
                    }

                    $scope.getProjectKeysForObject(object)[project.targetProject] = true;
                    $scope.getObjectsForProject(project).push(object);
                    $scope.getObjectIdsForProject(project, object.type)[object.localName] = true;
                }
                $scope.getObjectsIndex(object.type)[object.localName] = object;
            });
            $scope.projects.forEach(function(project){
                project.$open = project.$exposedObjects.length == 0;
            });
        }).error(setErrorInScope.bind($scope));
    }

    loadSettings();

    $scope.saveAndMaybePerformChanges = function() {
        var copy = dkuDeepCopy($scope.exposedObjects, function(key) { return !key.startsWith('$'); });
        DataikuAPI.projects.saveExposedObjects($stateParams.projectKey, $scope.exposedObjects).success(function(){
            ActivityIndicator.success("Saved!");
            $scope.origExposedObjects = copy;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.isDirty = function() {
        return !angular.equals($scope.exposedObjects, $scope.origExposedObjects);
    };
    checkChangesBeforeLeaving($scope, $scope.isDirty);

    $scope.addObject = function(newObject) {
        if (!newObject) return
        var object = {
            type: newObject.type,
            localName: newObject.id,
            displayName: newObject.label,
            rules: [],
            $open: true
        };
        $scope.exposedObjects.objects.push(object);
        $scope.getObjectsIndex(object.type)[object.localName] = object;
    };

    $scope.addProject = function(newProject) {
        var project = {
            targetProject : newProject.id,
            targetProjectDisplayName: newProject.label,
            appearOnFlow : true,
            $exposedObjects: [],
            $open: true
        };

        $scope.projects.push(project);
        $scope.projectsIndex[project.targetProject] = project;
    };

    $scope.removeObject = function(object) {
        // Remove from every project
        $scope.getProjectsForObject(object).forEach(function(project) {
            $scope.removeRule(project, object);
            if (!$scope.getObjectsForProject(project).length) {
                $scope.removeProject(project);
            }
        });

        removeItemFromArray(object, $scope.exposedObjects.objects);
        delete $scope.getObjectsIndex(object.type)[object.localName];
    };

    $scope.removeProject = function(project) {
        // Remove from every object
        $scope.getObjectsForProject(project).forEach(function(object) {
            $scope.removeRule(project, object);
            if (!$scope.getProjectsForObject(object).length) {
                $scope.removeObject(object);
            }
        });

        removeItemFromArray(project, $scope.projects);
        delete $scope.projectsIndex[project.targetProject];
    };

    $scope.addObjectToProject = function(newObject, project) {
        if (!$scope.getObjectsIndex(newObject.type)[newObject.id]) {
            $scope.addObject(newObject);
        }

        var object = $scope.getObjectsIndex(newObject.type)[newObject.id];
        $scope.addRule(project, object);
    };

    $scope.addProjectToObject = function(newProject, object) {
        if (!$scope.projectsIndex[newProject.id]) {
            $scope.addProject(newProject);
        }

        var project = $scope.projectsIndex[newProject.id];
        $scope.addRule(project, object);
    };

    $scope.addRule = function(project, object) {
        $scope.getProjectsForObject(object).push(project);
        $scope.getProjectKeysForObject(object)[project.targetProject] = true;
        $scope.getObjectsForProject(project).push(object);
        $scope.getObjectIdsForProject(project, object.type)[object.localName] = true;
    };

    $scope.removeRule = function(project, object) {
        removeItemFromArray(project, $scope.getProjectsForObject(object));
        removeItemFromArray(object, $scope.getObjectsForProject(project));

        delete $scope.getProjectKeysForObject(object)[project.targetProject];
        delete $scope.getObjectIdsForProject(project, object.type)[object.localName];
    };


    // Getters with empty defaults for object lists / maps

    $scope.getProjectsForObject = function(object) {
        if (!object.rules) {
            object.rules = [];
        }
        return object.rules;
    };

    $scope.getProjectKeysForObject = function(object) {
        if (!object.$targetProjectKeys) {
            object.$targetProjectKeys = {};
            if ($stateParams.projectKey) {
                object.$targetProjectKeys[$stateParams.projectKey] = true;
            }
        }
        return object.$targetProjectKeys;
    };

    $scope.getObjectsForProject = function(project) {
        if (!project.$exposedObjects) {
            project.$exposedObjects = [];
        }
        return project.$exposedObjects;
    };

    $scope.getObjectIdsForProject = function(project, objectType) {
        if (!project.$exposedObjectIds) {
            project.$exposedObjectIds = {};
        }
        if (!project.$exposedObjectIds[objectType]) {
            project.$exposedObjectIds[objectType] = {};
        }
        return project.$exposedObjectIds[objectType];
    };

    $scope.getObjectsIndex = function(objectType) {
        if (!$scope.objectsIndex[objectType]) {
            $scope.objectsIndex[objectType] = {};
        }
        return $scope.objectsIndex[objectType];
    };

});

app.controller("ProjectSettingsDashboardController", function($scope, $stateParams, $timeout,
        DataikuAPI, ActivityIndicator, SmartId, ProjectSettingsObjectsListService, EXPOSABLE_TYPES) {

    ProjectSettingsObjectsListService.addOnScope($scope);

    $scope.exposableTypes = EXPOSABLE_TYPES;

    function loadSettings() {
        DataikuAPI.projects.getDashboardAuthorizations($stateParams.projectKey, true).success(function(authorizations) {

            $scope.dashboardAuthorizations = authorizations;
            $scope.initialDashboardAuthorizations = angular.copy($scope.dashboardAuthorizations);

            $scope.readerAuthorizationsByType = {};
            $scope.dashboardAuthorizations.authorizations.forEach(function(ref) {
                if (!$scope.readerAuthorizationsByType[ref.objectRef.objectType]) {
                    $scope.readerAuthorizationsByType[ref.objectRef.objectType] = [SmartId.fromRef(ref.objectRef)];
                } else {
                    $scope.readerAuthorizationsByType[ref.objectRef.objectType].push(SmartId.fromRef(ref.objectRef));
                }
            });
            $timeout(function(){
                $scope.$broadcast('redrawFatTable')
            });
        }).error(setErrorInScope.bind($scope));
    }

    loadSettings();

    $scope.saveAuthorizations = function() {
        DataikuAPI.projects.saveDashboardAuthorizations($stateParams.projectKey, $scope.dashboardAuthorizations).success(function(){
            ActivityIndicator.success("Saved!");
            $scope.initialDashboardAuthorizations = angular.copy($scope.dashboardAuthorizations);
        }).error(setErrorInScope.bind($scope));
    }

    $scope.newSource = {
        modes: ['READ'],
        type: null
    };

    $scope.isDashboardAuthorizationDirty = function() {
        return !angular.equals($scope.dashboardAuthorizations, $scope.initialDashboardAuthorizations);
    }
    checkChangesBeforeLeaving($scope, $scope.isDashboardAuthorizationDirty);

    $scope.addReaderAuthorization = function(object) {
        if ($scope.dashboardAuthorizations.allAuthorized || !object || !object.id
            || ($scope.readerAuthorizationsByType[object.type] || []).indexOf(object.smartId) != -1) {
            return;
        }

        var readerAuth = {
            modes: angular.copy($scope.newSource.modes),
            objectRef: {
                objectId: object.id,
                objectType: object.type,
                objectDisplayName: object.label
            }
        };

        if (!object.localProject) {
            readerAuth.objectRef.projectKey = object.projectKey;
        }

        $scope.dashboardAuthorizations.authorizations.push(readerAuth);

        if (!$scope.readerAuthorizationsByType[readerAuth.objectRef.objectType]) {
            $scope.readerAuthorizationsByType[readerAuth.objectRef.objectType] = [SmartId.fromRef(readerAuth.objectRef)];
        } else {
            $scope.readerAuthorizationsByType[readerAuth.objectRef.objectType].push(SmartId.fromRef(readerAuth.objectRef));
        }

        $scope.clearFilters();
        $timeout(function(){
            $scope.$broadcast('redrawFatTable');
            $scope.$broadcast('scrollToLine', -1);
        },10); // wait for clearfilters
    };

    $scope.removeReaderAuthorization = function(ref) {
        var idx1 = $scope.dashboardAuthorizations.authorizations.indexOf(ref);
        $scope.dashboardAuthorizations.authorizations.splice(idx1, 1);
        var idx2 = $scope.readerAuthorizationsByType[ref.objectRef.objectType].indexOf(SmartId.fromRef(ref.objectRef));
        if (idx2 > -1) {
            $scope.readerAuthorizationsByType[ref.objectRef.objectType].splice(idx2, 1);
        }
    };
    $scope.removeReaderAuthorizations = function(refs) {
        refs.forEach(function(ref) {
            $scope.removeReaderAuthorization(ref);
        })
    };

    $scope.getReaderAuthUrl = function(readerAuth) {
        if (readerAuth&&$stateParams.projectKey) {
            return $scope.$root.StateUtils.href.dssObject(readerAuth.objectRef.objectType, SmartId.fromRef(readerAuth.objectRef))
        } else {
            return "";
        }
    }
    $scope.isDisabledReaderAuth = function(selection,mode) {
        if (!selection || !selection.selectedObjects) {return false;}
        return selection.selectedObjects.map(function(o){
            return ($scope.availableModesForType[o.objectRef.objectType] || []).indexOf(mode) === -1;
        }).reduce(function(a,b){return a&&b},true);
    }

    $scope.isAllReaderAuth = function(selection, mode) {
        if (!selection || !selection.selectedObjects) {return false;}
        return selection.selectedObjects.filter(function(o){
            return ($scope.availableModesForType[o.objectRef.objectType] || []).indexOf(mode) > -1
        }).map(function(o){
            return (o.modes.indexOf(mode) > -1)
        }).reduce(function(a,b){return a&&b},true);
    }
    $scope.setReaderAuth = function(objects, val, mode) {
        objects.forEach(function(o){
            if (($scope.availableModesForType[o.objectRef.objectType] || []).indexOf(mode) > -1) {
                if (val&&o.modes.indexOf(mode)===-1) {
                    o.modes.push(mode);
                }
                if (!val&&o.modes.indexOf(mode)>-1) {
                    o.modes.splice(o.modes.indexOf(mode),1);
                }
            }
        });
    }

    $scope.setNewSourceType = function(sourceType) {
        $scope.newSourceType = sourceType;
        this.hidePopover();
    }

    $scope.availableModesForType = {
        'DATASET':  ['READ', 'WRITE'],
        'SCENARIO': ['READ', 'RUN']
    };
    $scope.$watch("newSource.type", function(nv) {
       if (!nv) return;
       $scope.availableReaderAuthModes = $scope.availableModesForType[nv] || ['READ'];
       $scope.newSource.modes = ['READ'];
    });
});

app.controller("ProjectSettingsDashboardUsersController", function($scope, $stateParams,$timeout, DataikuAPI, ActivityIndicator) {

    function loadSettings() {
        DataikuAPI.projects.getAdditionalDashboardUsers($stateParams.projectKey).success(function(data) {
            $scope.additionalDashboardUsers = data;
            $scope.initialAdditionalDashboardUsers = angular.copy($scope.additionalDashboardUsers);
            $timeout(function(){
                $scope.$broadcast('redrawFatTable')
            });
        }).error(setErrorInScope.bind($scope));

        DataikuAPI.security.listUsers().success(function(data) {
            $scope.userLogins = data.map(function(x) { return x.login });
        }).error(setErrorInScope.bind($scope));
    }

    loadSettings();

    $scope.save = function() {
        DataikuAPI.projects.saveAdditionalDashboardUsers($stateParams.projectKey, $scope.additionalDashboardUsers).success(function(){
            ActivityIndicator.success("Saved!");
            $scope.initialAdditionalDashboardUsers = angular.copy($scope.additionalDashboardUsers);
        }).error(setErrorInScope.bind($scope));
    }

    $scope.isDirty = function() {
        return !angular.equals($scope.additionalDashboardUsers, $scope.initialAdditionalDashboardUsers);
    }
    checkChangesBeforeLeaving($scope, $scope.isDirty);

    $scope.add = function() {
        $scope.additionalDashboardUsers.users.push({
            login: ""
        });
        $scope.clearFilters();
        $timeout(function(){
            $scope.$broadcast('redrawFatTable');
            $scope.$broadcast('scrollToLine', -1);
        },10); // wait for clearfilters
    };

    function removeOne(user) {
        var idx = $scope.additionalDashboardUsers.users.indexOf(user);
        if (idx >= 0) {
            $scope.additionalDashboardUsers.users.splice(idx, 1);
        }
    }

    $scope.remove = function(users) {
        users.forEach(removeOne);
    }
});


// expects dates corresponding to UTC days
app.directive("weekDayHeatmap", function(Fn){
    function previousSunday(date) { return d3.time.week.utc(date); }
    function niceDate(date, year) {
        return date.toUTCString().replace(/^\w+,? 0?(\d+) (\w+) (\d+) .+$/,
            year ? '$2 $1, $3' : '$2 $1');
    }

    function monthTickFormat(date) {
        var endOfWeek = new Date(date.getTime() + 7*24*60*60*1000);
        var range = d3.time.days.utc(date, endOfWeek);
        for (var i = 0; i < range.length; i++) {
            if (range[i].getDate() == 1) {
                return range[i].toUTCString().replace(/^\w+,? 0?(\d+) (\w+) (\d+) .+$/, '$2').toUpperCase();
            }
        }
        return '';
    }

    return {
        scope: { data: '=', formatter: '=?', light: '=?'},
        require: ['?svgTitles'],
        link: function(scope, element, attrs, controllers) {
            var itemSize = 16, // ajusted for project summary (1 year w/o scroll @ 925px container)
                gap = 2,
                cellSize = itemSize - gap,
                margin = scope.light ? {top:15,right:0,bottom:0,left:0} : {top:40,right:20,bottom:20,left:30},
                data = [],
                weeks = 0,
                dayScale = d3.scale.ordinal().domain([0, 1, 2, 3, 4, 5, 6])
                    .rangeBands([0, 7 * itemSize - gap], gap / (7 * itemSize - gap), 0),
                weekScale = d3.scale.ordinal(),
                heatScale = d3.scale.linear().range(['#bbdefb', '#0a69b5']),
                svg = d3.select(element.get(0)),
                svgTitles = controllers[0],
                minWidth = 140;

            scope.$watch('data', function() {
                svg.selectAll('g').remove();
                data = scope.data && scope.data.length ? scope.data.concat() : [{date: new Date(), value:0}];
                data.sort(function(a, b) { return Fn.CMP(a.date, b.date); });

                weeks = d3.time.weeks.utc(data[0].date, data[data.length-1].date).length + 1;
                var previousSundayOfDate = previousSunday(data[0].date);
                var weekDomain = [];
                for (var i=0;i<weeks;i++) {weekDomain.push(previousSundayOfDate);}
                weekScale = weekScale.domain(
                        weekDomain
                            .map(function(first, i){ return d3.time.week.utc.offset(first, i); })
                    ).rangeBands([0, weeks * itemSize - gap], gap / (weeks * itemSize - gap), 0);
                heatScale = heatScale.domain([d3.min(data.map(Fn.prop('value'))), d3.max(data.map(Fn.prop('value')))]);

                var xAxis = d3.svg.axis().orient('top').scale(weekScale)
                        .tickFormat(function(d){ return scope.light ? monthTickFormat(new Date(d)) : niceDate(new Date(d), false); }),
                    yAxis = d3.svg.axis().orient('left').scale(dayScale).tickSize(1)
                        .tickFormat(Fn.from(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])),
                    years = weeks > 26,
                    width  = Math.max(minWidth, xAxis.scale().rangeExtent()[1] + margin.left + margin.right),
                    height = yAxis.scale().rangeExtent()[1] + margin.top + margin.bottom + (years ? 16 : 0);
                svg .attr('viewBox', [0, 0, width, height].join(' '))
                    .attr('width', width).attr('height', height)
                    .classed('crisp-edges svg-defaults', true);

                svg.selectAll("text").remove();
                svg.selectAll("defs").remove();

                //declaring diagonal stripes pattern
                svg.append('defs').append('pattern')
                    .attr("id","pattern-stripes")
                    .attr("width","4")
                    .attr("height","4")
                    .attr("patternUnits","userSpaceOnUse")
                    .attr("patternTransform","rotate(45)")
                    .append("rect")
                        .attr("width","2")
                        .attr("height","4")
                        .attr("transform","translate(0,0)")
                        .attr("fill","#eee")

                //render axes
                svg.append('g')
                    .attr('transform','translate('+margin.left+','+margin.top+')')
                    .attr('class','x axis')
                    .call(xAxis)
                if (scope.light) {
                    svg.selectAll('g.tick text').style("text-anchor", "start").attr('transform', 'translate('+ -cellSize/2 +','+ xAxis.innerTickSize() +')');
                } else {
                    svg.selectAll('g.tick text').attr('transform', 'translate(18,-8) rotate(-45)');
                }
                if (years) {
                    var extent = d3.extent(weekScale.domain());
                    extent[1] = d3.time.week.utc.offset(extent[1], 1);   // end of axis = last week + 1
                    var yearScale = d3.time.scale.utc().domain(extent).range(weekScale.rangeExtent());
                    svg.append('g')
                        .attr('transform','translate('+margin.left+','+ (height - margin.bottom - 18) +')')
                        .attr('class','x axis')
                        .call(d3.svg.axis().orient('bottom').scale(yearScale)
                            .tickValues(yearScale.ticks(d3.time.year.utc, 1).map(d3.time.week.utc.ceil))
                            .tickFormat(d3.time.format('%Y')));
                }
                if (!scope.light) {
                    svg.append('g')
                        .attr('transform','translate(' + margin.left + ',' + margin.top + ')')
                        .attr('class','y axis')
                        .call(yAxis);
                }
                svg.selectAll('path.domain, g.tick line').remove();

                svg.append('g')
                    .attr('transform','translate(' + (margin.left + gap) + ',' + (margin.top + gap) + ')')
                    .attr('class','heatmap')
                    .selectAll('rect').data(data).enter().append('rect')
                        .attr('width', cellSize)
                        .attr('height', cellSize)
                        .attr('x', Fn(Fn.prop('date'), previousSunday, weekScale))
                        .attr('y', Fn(Fn.prop('date'), Fn.method('getUTCDay'), dayScale))
                        .attr('fill', function(d) {
                            if (d.value === 0) {
                                return '#eee';
                            } else if (d.value === -1) { //meaning project did not exist at this time
                                return 'url(#pattern-stripes)';
                            } else {
                                return heatScale(d.value);
                            }
                        })
                        .attr('data-title', function(d) {
                            return d.value === -1 ? "Project did not exist on {0}".format(niceDate(d.date, true)) : "<strong>{0}</strong> on {1}".format((scope.formatter || Fn.SELF)(d.value), niceDate(d.date, true));
                        });

                if (svgTitles) {
                    svgTitles.update();
                }

                //If no activity at all adding overlaying text entitled 'No activity'
                var noActivity = data.every(function(d) {
                    return d.value <= 0;
                });

                if (noActivity) {
                    svg.append('text')
                        .attr('transform','translate(' + margin.left + ',' + margin.top + ')')
                        .attr('x', (width - margin.left - margin.right)/2)
                        .attr('y', (height - margin.top - margin.bottom)/2)
                        .attr("alignment-baseline", "middle")
                        .attr("text-anchor", "middle")
                        .attr("style", "text-transform:uppercase")
                        .attr("fill", "#999")
                        .text("no activity");
                }
            });
        }
    };
});



app.directive("simpleTimeAreaChart", function(Fn, NumberFormatter){

    return {
        scope: { ts: '=', values: '=', scale: '=?', color: '@?', width: '@?', height: '@?' },
        link: function(scope, element, attrs, controllers) {
            var margin = {top:20,right:20,bottom:30,left:40},
                svg = d3.select(element.get(0)),
                height, width;

            var tScale = d3.time.scale(),
                yScale = d3.scale.linear(),
                viz = svg.append('g').attr('transform','translate(' + margin.left + ',' + margin.top + ')'),
                xAxis = d3.svg.axis().orient('bottom').scale(tScale).outerTickSize(0),
                yAxis = d3.svg.axis().orient('left').scale(yScale).ticks(3),
                yAxisG = viz.append('g').attr('class','y axis crisp-edges').style('stroke', '#bdbdbd'),
                area = viz.append('g').attr('class', 'area').append('path').attr('fill', scope.color || '#64B5F6'),
                xAxisG = viz.append('g').attr('class','x axis crisp-edges stroke-cc').style('color', '#bdbdbd');

            var resize = function() {
                height = scope.height == '100%' ? element.parent().height() : (parseInt(scope.height) || 160);
                width = scope.width === '100%' ? element.parent().width() : (parseInt(scope.width) || 400);

                svg .attr('viewBox', [0, 0, width, height].join(' '))
                    .attr('width', width).attr('height', height)
                    .classed('svg-defaults', true);

                xAxisG.attr('transform','translate(0,' + (height - margin.bottom - margin.top) + ')');
                xAxis.ticks(width/100);
                yAxis.tickSize(-width + margin.left + margin.right, 0);
            };

            resize();
            scope.$on('resize', function() {
                resize();
                draw();
            });


            var draw = function() {
                if (!scope.ts || !scope.ts.length || !scope.values.length) return;

                var xs = scope.ts,
                    ys = scope.values;

                tScale.domain([d3.min(xs, Fn.method('valueOf')), d3.max(scope.ts, Fn.method('valueOf'))])
                      .range([0, width - margin.left - margin.right]);

                yScale.range([height - margin.top - margin.bottom, 0]);

                if (d3.time.weeks.utc.apply(null, tScale.domain()).length > 4) {
                    // aggregate by week to avoid jigsaw graph
                    xs = xs.map(d3.time.week.utc).filter(Fn(Fn.method('valueOf'), Fn.unique()));
                    ys = xs.map(Fn.cst(0));
                    scope.values.forEach(function(y, i) {
                        ys[this.indexOf(d3.time.week.utc(scope.ts[i]).valueOf())] += y;
                    }, xs.map(Fn.method('valueOf')));
                    xs = xs.map(d3.time.thursday.utc.ceil); // place data points on thursdays, 12am (~middle of the week)
                    tScale.domain([d3.min(xs, Fn.method('valueOf')), d3.max(xs, Fn.method('valueOf'))]); // readjust axis
                }

                yScale.domain([d3.min(ys.concat(0)), d3.max(ys)]);
                if (typeof scope.scale === 'function') { // scale callback from computed scale
                    yScale.domain(scope.scale(yScale.domain().concat()));
                } else if (scope.scale) {   // fixed
                    yScale.domain(scope.scale);
                }

                NumberFormatter.addToAxis(yAxis);
                yAxisG.transition().call(yAxis);
                yAxisG.selectAll('path.domain').remove();

                area.datum(xs.map(Fn.INDEX))
                    .transition()
                    .attr('d', d3.svg.area().x(Fn(Fn.from(xs), tScale))
                        .y0(yScale.range()[0])
                        .y1(Fn(Fn.from(ys), yScale))
                        .interpolate("monotone"));

                xAxisG.call(xAxis);
                xAxisG.select('path.domain').style('stroke', 'black');
       };

            scope.$watch('values', draw);
        }
    };
});

app.directive("weekPunchCard", function(Fn){
    return {
        scope: { data: '=' }, // data: 7 by 24 numbers array
        link: function(scope, element, attrs) {
            scope.cellSize = scope.cellSize || 25;
            if (!scope.data || !scope.data.length) return;

            var rowHeight = 50,
                colWidth = 35,
                margin = {top: 0, right: 20, bottom: 20, left: 75},
                vizWidth = 24 * colWidth,
                vizHeight = 7 * rowHeight,
                data = scope.data.concat(),
                xScale = d3.scale.ordinal().domain(Array.range(24)).rangeRoundBands([0, vizWidth], 0.1, 0),
                yScale = d3.scale.ordinal().domain(Array.range(7)).rangeRoundBands([0, vizHeight], 0.1, 0),
                maxRadius = Math.min(xScale.rangeBand()/ 2, yScale.rangeBand()/2),
                sizeScale = d3.scale.sqrt().range([2, maxRadius]).domain([0, d3.max(data, Fn.passFirstArg(d3.max))]),
                svg = d3.select(element.get(0)),
                viz = svg.classed('svg-defaults', true).style('color', '#ccc')
                    .attr('viewBox', [0, 0, vizWidth + margin.left + margin.right, vizHeight + margin.top + margin.bottom].join(' '))
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            /* Draw x axis */
            var xAxis = d3.svg.axis().scale(xScale)
                .tickSize(0)
                .tickFormat(function(d) { return (d % 12 || 12) + (d > 12 ? 'p': 'a'); });
            viz.append("g").call(xAxis)
                .attr('class', 'x axis crisp-edges')
                .attr('transform', 'translate(0,' + vizHeight + ')')
                .select('.domain').remove();

            /* Draw all horizontal lines with ticks */
            var evenHoursAxis = d3.svg.axis().scale(xScale)
                .orient('top')
                .tickFormat('')
                .tickSize(0.1 * scope.cellSize, 0)
                .tickValues(Array.range(12).map(function(_, i) { return 2*i; }));
            var oddHoursAxis = d3.svg.axis().scale(xScale)
                .orient('top')
                .tickFormat('')
                .tickSize(0.2 * scope.cellSize, 0)
                .tickValues(Array.range(12).map(function(_, i) { return 2*i + 1; }));
            var xLines = viz.append("g")
                .attr('class', 'line axis stroke-cc crisp-edges')
                .selectAll('g.line').data(data).enter()
                    .append('g')
                    .attr('transform', function(d,i) { return 'translate(0, ' + (yScale(i) + yScale.rangeBand()) + ')'; });
            xLines.append('g').call(evenHoursAxis);
            xLines.append('g').call(oddHoursAxis);

            // move all ticks to the left by half a column so that circle are in-between full hours
            viz.selectAll('.tick').each(function() { // may already have transform
                this.setAttribute('transform', 'translate(-' + (colWidth/2) + ', 0) ' + this.getAttribute('transform'));
            });

            /* Draw day labels on the left and extend horizontal lines */
            var yLabels = svg.append("g")
                .attr("class", "day-labels stroke-cc crisp-edges")
                .selectAll("g")
                    .data(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
                    .enter().append("g").attr('class', 'y axis');
            yLabels.append('text')
                .text(Fn.SELF)
                .attr('x', 5)
                .attr('y', function(d,i) { return yScale(i) + yScale.rangeBand() * 0.55; });
            yLabels.append('line')
                .attr('x1', 5)
                .attr('x2', margin.left)
                .attr('y1', function(d,i) { return yScale(i) + yScale.rangeBand(); })
                .attr('y2', function(d,i) { return yScale(i) + yScale.rangeBand(); });

            /* Draw circles */
             var circles = viz.selectAll('g.day').data(data).enter().append('g')
                .attr('class', 'day')
                .attr('transform', function (d, i) { return 'translate(0, ' + (yScale(i) + yScale.rangeBand()/2 - 0.1 * scope.cellSize) + ')'; })
                .selectAll('circle').data(Fn.SELF).enter().append('circle')
                    .attr('cx', function(d, i, j) { return xScale(i) + xScale.rangeBand()/2; })
                    .attr('r', sizeScale)
                    .attr('fill', 'grey').classed('hover-fill', true)
                    .attr('data-title', function(d) { return "{0} commit{1}".format(d, d > 1 ? "s" : ""); });
        }
    }
});

app.directive("userLeaderboard", function(Fn, $state, UserImageUrl){
    return {
        scope: { data: '=', prop: '=?' },
        require: ['?svgTitles'],
        link: function(scope, element, attrs, controllers) {

            var margin = {top: 10, right: 20, bottom: 40, left: 40},
                vizHeight = 120,
                barWidth = 24,
                padding = 5,
                vizMaxWidth = 800,
                maxBars = vizMaxWidth / (barWidth + padding),
                xScale = function(i) { return padding + (padding + barWidth) * i; },
                yScale = d3.scale.linear().range([vizHeight, 0]),
                svg = d3.select(element.get(0)).classed('svg-defaults crisp-edges', true),
                svgTitles = controllers[0],
                format = d3.format('.3s');

            /* Draw x axis */

            function redraw() {
                svg.select('g').remove();

                if (!scope.data || !scope.prop || !scope.data.length || !(scope.prop in scope.data[0])) return;

                var extract = Fn.prop(scope.prop),
                    n = Math.min(maxBars, scope.data.length),
                    vizWidth = n * (barWidth + padding),
                    svgWidth = vizWidth + margin.left + margin.right,
                    sorted = scope.data.concat(),
                    viz = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
                sorted.sort(function(a,b) { // descending order
                    return extract(a) > extract(b) ? -1 : (extract(a) < extract(b)) ? 1 : 0;
                });
                sorted = sorted.slice(0, n);

                viz.append('clipPath').attr('id', 'user-clip-path')
                    .append('circle').attr('cx', barWidth/2).attr('cy', barWidth/2).attr('r', barWidth/2).attr('fill', 'black');

                svg .attr('viewBox', [0, 0, svgWidth, vizHeight + margin.top + margin.bottom].join(' '))
                    .attr('width', svgWidth);
                yScale.domain([0, Math.max(1, d3.max(sorted, extract))]);
                var yAxis = d3.svg.axis().scale(yScale).orient('left').tickSize(-vizWidth, 0).ticks(3);

                viz.datum(sorted);
                viz.append("g").attr('class', 'y axis').call(yAxis)
                    .select('.domain').remove();
                viz.selectAll('.tick line').attr('stroke', '#ddd');

                var tooltip = function(d) { return '<strong>{0}</strong> for {1}'.format(format(extract(d)), d.user); };
                viz.selectAll('rect.user').data(Fn.SELF).enter().append('rect')
                    .data(Fn.SELF)
                    .attr('class', 'user')
                    .attr('x', function(d,i) { return xScale(i); })
                    .attr('y', Fn(extract, yScale))
                    .attr('fill', '#64B5F6')
                    .attr('height', function(d) { return vizHeight - yScale(extract(d)); })
                    .attr('width', barWidth)
                    .attr('data-title', tooltip);

                viz.append('g').attr('class', 'users')
                    .selectAll('g').data(Fn.SELF).enter().append('g')
                    .attr('clip-path', 'url(#user-clip-path)')
                    .attr('transform', function(d, i) { return 'translate(' + xScale(i) + ',' + (vizHeight+5) + ')'; })
                    .append('a').attr('xlink:href', function(d) { return '/profile/' + d.user + '/'; })
                    .attr('xlink-href', function(d) { return '/profile/' + d.user + '/'; })
                    .on('click', function(d) { // work around xlink:href not fully working in Chrome
                        if (d3.event.which == 1 && !d3.event.metaKey) {
                            $state.go('profile.user.view', {userLogin: d.user});
                        }
                    })
                    .attr('data-title', tooltip)
                    .append('image')
                        .attr ('xlink:href', function(d) {
                            return UserImageUrl(d.user, barWidth);
                        })
                        .attr('x', 0)
                        .attr('y', 0)
                        .attr('width', barWidth).attr('height', barWidth);

                if (svgTitles) {
                    svgTitles.update();
                }
            }
            scope.$watch("data", redraw);
            scope.$watch("prop", redraw);
        }
    }
});


})();
