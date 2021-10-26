(function() {
'use strict';

const app = angular.module('dataiku.controllers');


app.controller('ProjectBaseController', function($scope, $controller, $state, $stateParams, $timeout, $rootScope, $q, $filter,
            Assert, DataikuAPI, WT1, TopNav, Breadcrumb, CreateModalFromTemplate, TaggingService, FlowGraphSelection,
            GlobalProjectActions, Notification, HistoryService, FutureWatcher, ProgressStackMessageBuilder,
            AlationCatalogChooserService, WebAppsService) {

    $controller('_CreateRecipesBehavior', {$scope: $scope});

    $scope.standardizedSidePanel = {};
    $scope.standardizedSidePanel.slidePanel = function() {
        $scope.standardizedSidePanel.opened = !$scope.standardizedSidePanel.opened;
    }
    $scope.standardizedSidePanel.toggleTab = function(tabName) {
        $scope.standardizedSidePanel.tabToToggle = '';
        $timeout(() => { $scope.standardizedSidePanel.tabToToggle = tabName; });
    }
    
	$scope.refreshProjectData = function() {
		DataikuAPI.projects.getSummary($stateParams.projectKey).success(function(data) {
            $scope.projectCurrentBranch = data.projectCurrentBranch;
			$scope.projectSummary = data.object;
            $rootScope.projectSummary = $scope.projectSummary;
            $scope.objectInterest = data.interest;
            $scope.objectTimeline = data.timeline;
            $scope.projectSummaryStatus = data.objectsCounts;

            TopNav.setProjectData($scope.projectSummary, $scope.projectCurrentBranch);

            $scope.topNav.isProjectAnalystRO = $scope.isProjectAnalystRO();
            $scope.topNav.isProjectAnalystRW = $scope.isProjectAnalystRW();
            $scope.topNav.isCurrentProjectAdmin = $scope.isProjectAdmin();
            $scope.topNav.canAccessProjectSettings = $scope.isProjectAdmin();
            $scope.topNav.canAccessProjectSecurity = $scope.canAccessProjectSettings();
            $scope.topNav.isAppInstance = $scope.isAppInstance();
            $scope.topNav.showFlowNavLink = $scope.showFlowNavLink();
            $scope.topNav.showCodeNavLink = $scope.showCodeNavLink();
            $scope.topNav.showLabNavLink = $scope.showLabNavLink();
            $scope.topNav.showVersionControlFeatures = $scope.showVersionControlFeatures();

            if ($scope.projectSummary.tutorialProject) {
                WT1.setVisitorParam("tutorial-project", "true");
                WT1.setVisitorParam("tutorial-id", $scope.projectSummary.tutorialId);
                WT1.event("tutorial-project-open");
            }

            // number app tiles, if any
            if ($scope.projectSummary.appManifest && $scope.projectSummary.appManifest.homepageSections) {
                $scope.projectSummary.appManifest.homepageSections.forEach(function(section, sectionIdx) {
                    if (section.tiles) {
                        section.tiles.forEach(function(tile, tileIdx) {
                            tile.$sectionIdx = sectionIdx;
                            tile.$tileIdx = tileIdx;
                        });
                    }
                });
            }
		}).error(setErrorInScope.bind($scope));
	};

    $scope.$on("$destroy", function(){
        WT1.delVisitorParam("tutorial-project");
        WT1.delVisitorParam("tutorial-id");
        $scope.topNav.isCurrentProjectAdmin = false;
    });

    // The Pinboard controller puts stuff here for use by the pinboard page top level nav bar.
    $scope.dashboardContext = {};

	$scope.isProjectAdmin = function() {
        return $scope.projectSummary != null && $scope.projectSummary.isProjectAdmin;
	};
    $scope.canWriteProject = function() {
        // Alias
        return $scope.isProjectAnalystRW();
    };
	$scope.isProjectAnalystRW = function() {
		return $scope.projectSummary != null && $scope.projectSummary.canWriteProjectContent;
	};
	// To be in sync with PagesSettingsCatalogService:canAccessProjectSettings
    $scope.canAccessProjectSettings = function() {
        return $scope.projectSummary != null && $scope.projectSummary.canWriteProjectContent &&
            ($scope.projectSummary.canManageDashboardAuthorizations ||
             $scope.projectSummary.canManageExposedElements ||
             $scope.projectSummary.canManageAdditionalDashboardUsers);
    };
    $scope.isProjectAnalystRO = function() {
        return $scope.projectSummary != null && $scope.projectSummary.canReadProjectContent;
    };
	$scope.canModerateDashboards = function() {
		return $scope.projectSummary != null && $scope.projectSummary.canModerateDashboards;
	};
	$scope.canWriteDashboards = function() {
		return $scope.projectSummary != null && $scope.projectSummary.canWriteDashboards;
	};
	$scope.canReadDashboards = function() {
		return $scope.projectSummary != null && $scope.projectSummary.canReadDashboards;
	};
	$scope.canRunScenarios = function() {
		return $scope.projectSummary != null && $scope.projectSummary.canRunScenarios;
	};
	$scope.canManageExposedElements = function() {
		return $scope.projectSummary != null && $scope.projectSummary.canManageExposedElements;
	};
	$scope.canExportDatasetsData = function() {
		return $scope.projectSummary != null && $scope.projectSummary.canExportDatasetsData;
	};
    $scope.canExecuteApp = function() {
        return $scope.projectSummary != null && $scope.projectSummary.canExecuteApp;
    };
    $scope.isAppInstance = function() {
        return $scope.projectSummary != null && $scope.projectSummary.projectAppType == 'APP_INSTANCE';
    };
    $scope.showFlowNavLink = function() {
        return !$scope.isAppInstance() || $scope.projectSummary.appManifest.instanceFeatures.showFlowNavLink;
    };
    $scope.showCodeNavLink = function() {
        return !$scope.isAppInstance() || $scope.projectSummary.appManifest.instanceFeatures.showCodeNavLink;
    };
    $scope.showLabNavLink = function() {
        return !$scope.isAppInstance() || $scope.projectSummary.appManifest.instanceFeatures.showLabNavLink;
    };
    $scope.showVersionControlFeatures = function() {
        return !$scope.isAppInstance() || $scope.projectSummary.appManifest.instanceFeatures.showVersionControlFeatures;
    };

    $scope.newManagedDataset = function() {
        CreateModalFromTemplate("/templates/flow-editor/new-managed-dataset.html",
            $scope, "NewManagedDatasetController");
    };
    $scope.newManagedFolder = function() {
        CreateModalFromTemplate("/templates/managedfolder/new-box-modal.html", $scope);
    };
    $scope.newModelEvaluationStore = function() {
        CreateModalFromTemplate("/templates/modelevaluationstores/new-model-evaluation-store-modal.html", $scope);
    };

    $scope.importFromAlation = function(){
        AlationCatalogChooserService.openChooser();
    }

    $scope.displayPluginInfo = function(pluginId, showDatasets, showRecipes) {
    	var newScope = $scope.$new();
    	newScope.showDatasets = showDatasets;
    	newScope.showRecipes = showRecipes;
    	newScope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
            return x.id == pluginId;
        })[0];
        CreateModalFromTemplate("/templates/plugins/modals/plugin-learn-more.html", newScope);
    };

    $scope.getRelevantZoneId = function(zoneId) {
        $scope.relevantZoneId = zoneId;
        let selectedItems = FlowGraphSelection.getSelectedNodes();
        if (selectedItems.length == 1 && selectedItems[0].nodeType == "ZONE") {
            $scope.relevantZoneId = selectedItems[0].cleanId;
        } else if (selectedItems.length == 1) {
            $scope.relevantZoneId = selectedItems[0].ownerZone;
        }
        return $scope.relevantZoneId;
    }

    $scope.getDatasetWithStatus = function(datasetName, target) {
        DataikuAPI.datasets.getWithMetricsStatus($stateParams.projectKey, datasetName).success(function(data){
            target.dataset = data.dataset;
            target.datasetShortStatus = data.shortStatus;
        }).error(function(){
            // if an error occurs consider the dataset was removed. TODO discard also relatedItems? (analyses)
            HistoryService.notifyRemoved({ type: "DATASET", id: datasetName });
            setErrorInScope.apply('$id' in target ? target : $scope, arguments);
        });
    };
    $scope.showLabModal = function(datasetSmartName, datasetFullInfo) {
        CreateModalFromTemplate("/templates/datasets/lab-modal.html", $scope, null, function(newScope) {
            newScope.datasetFullInfo = datasetFullInfo;
            newScope.datasetSmartName = datasetSmartName;
        });
    };

    $scope.showSparkNotLicensedModal = function() {
        CreateModalFromTemplate("/templates/widgets/spark-not-licensed-modal.html", $scope);
    };
    $scope.showCERestrictionModal = function(feature) {
        CreateModalFromTemplate("/templates/profile/community-vs-enterprise-modal.html",
            $scope, null, function(newScope){ newScope.lockedFeature = feature; });
    };

    $rootScope.showCERestrictionModal = $scope.showCERestrictionModal;
    $scope.$on("$destroy", function(){
        $rootScope.showCERestrictionModal = null;
    })

    $scope.GlobalProjectActions = GlobalProjectActions;

	$scope.refreshProjectData();

    /* ********************** Tags handling **************** */

    $scope.tagColor = TaggingService.getTagColor;
    $rootScope.activeProjectTagColor = TaggingService.getTagColor;
    $rootScope.activeGlobalTagsCategory = TaggingService.getGlobalTagCategory;

    $scope.projectTagsMap = {};
    var refreshTagMapRefs = function () {
        $scope.projectTagsMap = TaggingService.getProjectTags();
        $scope.projectTagsMapDirty = angular.copy($scope.projectTagsMap); // For settings, we want to be able to change and cancel/save then
    }
    TaggingService.fetchGlobalTags();

    function updateTagList(type) {
        TaggingService.update(type=="page-reload").success(refreshTagMapRefs);
    }
    updateTagList("page-reload");

    function refreshForTagListChanged() {
        updateTagList();
        TaggingService.fetchGlobalTags(true);
        $rootScope.$broadcast('taggableObjectTagsChanged');
    }

    var deregister = Notification.registerEvent("tags-list-changed", refreshForTagListChanged);

    $scope.$on('projectTagsUpdated', refreshTagMapRefs);

    $scope.getTagsMap = function () {
        return $scope.projectTagsMap;
    }

    $scope.getAllProjectTags = function () {
        var deferred = $q.defer();
        if (!$scope.hasOwnProperty("allProjectLevelTags")) {
            $scope.allProjectLevelTags = [];
            DataikuAPI.projects.listAllTags()
            .success(function(data) {
                $scope.allProjectLevelTags = TaggingService.fillTagsMapFromArray(data);
                deferred.resolve($scope.allProjectLevelTags);
            })
            .error(() => {
                setErrorInScope.bind($scope);
                deferred.resolve($scope.allProjectLevelTags);
            });
        }
        else {
            deferred.resolve($scope.allProjectLevelTags);
        }
        return getRewrappedPromise(deferred);
    }

    $scope.getTags = function(global){
        var deferred = $q.defer();
        deferred.resolve($scope.projectTagsMap);
        return getRewrappedPromise(deferred);
    };

    $scope.$on("$destroy", function(){
        $rootScope.activeProjectTagColor = null;
        $rootScope.activeGlobalTagsCategory = null;
        deregister();
    });

    /* Macro roles mapping */

    $scope.macroRoles = {};
    $scope.webappRoles = {};

    const pluginsById = $rootScope.appConfig.loadedPlugins.reduce(function (map, obj) {
        map[obj.id] = obj;
        return map;
    }, {});

    $rootScope.appConfig.customRunnables.forEach(function(runnable) {
        if (!runnable.desc.macroRoles) return;

        const plugin = pluginsById[runnable.ownerPluginId];
        if (!plugin) return; // plugin might have been deleted

        runnable.desc.macroRoles.forEach(function(macroRole) {
            $scope.macroRoles[macroRole.type] = $scope.macroRoles[macroRole.type] || [];

            $scope.macroRoles[macroRole.type].push({
                label: runnable.desc.meta.label || runnable.id,
                icon: runnable.desc.meta.icon || plugin.icon,
                roleTarget: macroRole.targetParamsKey || macroRole.targetParamsKeys,
                roleType: macroRole.type,
                applicableToForeign: macroRole.applicableToForeign,
                runnable: runnable
            });
        });
    });
    $scope.showCreateRunnable = function(runnable, targetKey, targetValue) {
        CreateModalFromTemplate('/templates/macros/runnable-modal.html', $scope, null, function(newScope) {
            newScope.runnable = runnable;
            newScope.targetKey = targetKey;
            newScope.targetValue = targetValue;
        });
    };


    $rootScope.appConfig.customWebApps.forEach(function(loadedWebApp) {
        if (!loadedWebApp.desc.roles) {
            return;
        }

        const plugin = pluginsById[loadedWebApp.ownerPluginId];
        if (!plugin) {
            return; // plugin might have been deleted
        }

        loadedWebApp.desc.roles.forEach(function(role) {
            $scope.webappRoles[role.type] = $scope.webappRoles[role.type] || [];

            $scope.webappRoles[role.type].push({
                label: loadedWebApp.desc.meta.label || loadedWebApp.id,
                icon: loadedWebApp.desc.meta.icon || plugin.icon,
                roleTarget: role.targetParamsKey || role.targetParamsKeys,
                roleType: role.type,
                applicableToForeign: role.applicableToForeign,
                loadedWebApp: loadedWebApp
            });
        });
    });

    $scope.showCreateWebAppModal = function(webappCategory, loadedWebApp, targetKey, targetValue, defaultName) {

        if (webappCategory !== 'code' && webappCategory !== 'visual') {
           return; 
        }

        let templateName;

        $scope.webappCategory = webappCategory;

        if (webappCategory === 'code') {
            templateName = '/templates/webapps/new-code-webapp-modal.html';
        } else {
            templateName = '/templates/webapps/new-visual-webapp-modal.html';
        }

        CreateModalFromTemplate(templateName, $scope, null, function(modalScope) {
            if (loadedWebApp) {
                modalScope.loadedWebApp = loadedWebApp;
                modalScope.app.type = loadedWebApp.webappType;
                modalScope.loadedDesc = WebAppsService.getWebAppLoadedDesc(modalScope.app.type) || {};
                modalScope.desc = modalScope.loadedDesc.desc;
                modalScope.pluginDesc = WebAppsService.getOwnerPluginDesc(modalScope.app.type);
            }
            modalScope.app.name = defaultName;
            modalScope.app.configFromRole = modalScope.app.configFromRole || {};
            modalScope.app.configFromRole[targetKey] = targetValue;
            modalScope.app.config = modalScope.app.config || {};
            modalScope.app.config[targetKey] = targetValue;

        }).then(function(webapp) {
        	if (webapp.backendReadyOrNoBackend) {
        		// backend up and running, go directly to view 
	            $state.go("projects.project.webapps.webapp.view", {projectKey : $stateParams.projectKey, webAppId: webapp.id, webAppName: $filter('slugify')(webapp.name)});
        	} else {
	            $state.go("projects.project.webapps.webapp.edit", {projectKey : $stateParams.projectKey, webAppId: webapp.id, webAppName: $filter('slugify')(webapp.name)});
        	}
        });
    }
    
    $scope.showCreateCodeWebAppModal = function(loadedWebApp, targetKey, targetValue, defaultName) {
        $scope.showCreateWebAppModal('code', loadedWebApp, targetKey, targetValue, defaultName);
    };

    $scope.showCreateVisualWebAppModal = function(loadedWebApp, targetKey, targetValue, defaultName) {
        $scope.showCreateWebAppModal('visual', loadedWebApp, targetKey, targetValue, defaultName);
    };

    /* Global actions */

    $scope.deleteThisProject = function() {
        DataikuAPI.projects.checkDeletability($stateParams.projectKey).success(function(data) {
            if(data.anyMessage) {
                // Some error happened!
                CreateModalFromTemplate("/templates/projects/delete-project-results.html", $scope, null, function(newScope) {
                    newScope.beforeDeletion = true;
                    newScope.results = data.messages;
                });
            } else {
                CreateModalFromTemplate("/templates/projects/delete-project-confirm-dialog.html", $scope, null, function(newScope) {
                    newScope.dropManagedData = false;
                    newScope.dropManagedFoldersOutputOfRecipe = false;
                    newScope.confirmProjectDeletion = function(dropManagedData, dropManagedFoldersOutputOfRecipe) {
                        DataikuAPI.projects.delete($stateParams.projectKey, dropManagedData, dropManagedFoldersOutputOfRecipe).success(function(deletionResult) {
                            if(deletionResult.anyMessage) {
                                CreateModalFromTemplate("/templates/projects/delete-project-results.html", $scope, null, function(newScope) {
                                    newScope.beforeDeletion = false;
                                    newScope.results = deletionResult.messages;
                                    newScope.$on('$destroy',function() {
                                        $timeout(function() {
                                            $state.transitionTo("home",{});
                                        });
                                    });
                                });
                            } else {
                                $state.transitionTo("home",{});
                            }

                        }).error(setErrorInScope.bind($scope));
                        WT1.event("project-delete",{dropManagedData, dropManagedFoldersOutputOfRecipe});
                    }
                });
            }
        }).error(setErrorInScope.bind($scope));
    };

    $scope.saveCustomFields = function(newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'PROJECT'});
        let oldCustomFields = angular.copy($scope.projectSummary.customFields);
        $scope.projectSummary.customFields = newCustomFields;
        return DataikuAPI.projects.saveSummary($stateParams.projectKey, $scope.projectSummary)
            .success(function() {
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.projectSummary.customFields);
            })
            .error(function(a, b, c) {
                $scope.projectSummary.customFields = oldCustomFields;
                setErrorInScope.bind($scope)(a, b,c);
            });
    };

    $scope.editCustomFields = function() {
        if (!$scope.projectSummary) {
            return;
        }
        let modalScope = angular.extend($scope, {objectType: 'PROJECT', objectName: $scope.projectSummary.name, objectCustomFields: $scope.projectSummary.customFields});
        CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
            $scope.saveCustomFields(customFields);
        });
    };

    $scope.exportThisProject = function() {
        CreateModalFromTemplate("/templates/projects/export-project-dialog.html", $scope, null, function(newScope) {
            newScope.exportOptions = {
                exportUploads: true,
                exportManaged: true,
                exportAnalysisModels: true,
                exportSavedModels: true,
                exportInsights: true
            };
            newScope.uiState = {
                showAdvancedOptions : false
            }
            newScope.export = function() {

                DataikuAPI.projects.startProjectExport($stateParams.projectKey,
                    newScope.exportOptions).error(function() {newScope.dismiss();}).success(function(initialResponse){

                    CreateModalFromTemplate("/templates/projects/export-progress-modal.html", $scope, null, function(progressScope) {
                        newScope.dismiss();

                        progressScope.download = function(){
                            Assert.trueish(progressScope.finalResponse, 'no future final response');
                            downloadURL(DataikuAPI.projects.getProjectExportURL(progressScope.finalResponse.projectKey,
                                progressScope.finalResponse.exportId));
                            progressScope.dismiss();
                            WT1.event("project-download");
                        }

                        progressScope.abort = function(){
                            DataikuAPI.futures.abort(initialResponse.jobId).error(setErrorInScope.bind(progressScope));
                        }

                        progressScope.done = false;
                        progressScope.aborted = false;
                        FutureWatcher.watchJobId(initialResponse.jobId)
                        .success(function(data) {
                            progressScope.done = data.hasResult;
                            progressScope.aborted = data.aborted;
                            progressScope.futureResponse = null;
                            progressScope.finalResponse = data.result;
                        }).update(function(data){
                            progressScope.percentage =  ProgressStackMessageBuilder.getPercentage(data.progress);
                            progressScope.futureResponse = data;
                            progressScope.stateLabels = ProgressStackMessageBuilder.build(progressScope.futureResponse.progress, true);
                        }).error(function(data, status, headers) {
                            progressScope.done = true;
                            progressScope.futureResponse = null;
                            setErrorInScope.bind(progressScope)(data, status, headers);
                        });
                    });
                }).error(setErrorInScope.bind($scope));
                WT1.event("project-export", newScope.exportOptions);
            };
        });
    };
    $scope.duplicateThisProject = function() {
        CreateModalFromTemplate("/templates/projects/duplicate-project-dialog.html", $scope, "DuplicateProjectController");
    };
});


app.controller('_CreateRecipesBehavior', function($scope, CreateModalFromTemplate, RecipeDescService) {
    function preselect(inputDatasetSmartName,zone) {
        return function(newScope) {
            newScope.zone = zone;
            if (inputDatasetSmartName) {
                newScope.$broadcast('preselectInputDataset', inputDatasetSmartName);
            }
        };
    }
    $scope.showCreateShakerModal = function(inputDatasetSmartName, zone) {
        CreateModalFromTemplate('/templates/recipes/single-output-recipe-creation.html', $scope, 'ShakerRecipeCreationController', preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateWindowRecipeModal = function(inputDatasetSmartName, zone) {
        CreateModalFromTemplate('/templates/recipes/single-output-recipe-creation.html', $scope, 'WindowRecipeCreationController', preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateSamplingModal = function(inputDatasetSmartName,zone) {
        CreateModalFromTemplate('/templates/recipes/single-output-recipe-creation.html', $scope, 'SamplingRecipeCreationController', preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateSyncModal = function(inputDatasetSmartName,zone) {
        CreateModalFromTemplate('/templates/recipes/single-output-recipe-creation.html', $scope, 'SyncRecipeCreationController', preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateCSyncModal = function(inputDatasetSmartName, zone) {
        CreateModalFromTemplate('/templates/recipes/single-output-recipe-creation.html', $scope, 'CsyncRecipeCreationController', preselect(inputDatasetSmartName, zone));
    };
    $scope.showCreateUpdateModal = function(inputDatasetSmartName, zone) {
        CreateModalFromTemplate('/templates/recipes/update-recipe-creation.html', $scope, null, preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateExportModal = function(inputDatasetSmartName, zone) {
        CreateModalFromTemplate('/templates/recipes/export-recipe-creation.html', $scope, null, preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateDownloadModal = function(preselectedOutput, zone) {
        CreateModalFromTemplate('/templates/recipes/download-recipe-creation.html', $scope, null, function (newScope) {
            newScope.zone = zone;
            if (preselectedOutput) {
                newScope.io.newOutputTypeRadio = 'select';
                newScope.io.existingOutputDataset = preselectedOutput;
            }
        });
    };
    $scope.showCreateGroupingModal = function(inputDatasetSmartName,zone) {
        CreateModalFromTemplate('/templates/recipes/grouping-recipe-creation.html', $scope, null, preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateDistinctModal = function(inputDatasetSmartName,zone) {
        CreateModalFromTemplate('/templates/recipes/single-output-recipe-creation.html', $scope, 'DistinctRecipeCreationController', preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateSplitModal = function(inputDatasetSmartName,zone) {
        CreateModalFromTemplate('/templates/recipes/split-recipe-creation.html', $scope, null, preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateTopNModal = function(inputDatasetSmartName,zone) {
        CreateModalFromTemplate('/templates/recipes/single-output-recipe-creation.html', $scope, 'TopNRecipeCreationController', preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreateSortModal = function(inputDatasetSmartName,zone) {
        CreateModalFromTemplate('/templates/recipes/single-output-recipe-creation.html', $scope, 'SortRecipeCreationController', preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreatePivotModal = function(inputDatasetSmartName,zone) {
        CreateModalFromTemplate("/templates/recipes/pivot-recipe-creation.html", $scope, null, preselect(inputDatasetSmartName,zone));
    };
    $scope.showCreatePredictionModal = function() {
        CreateModalFromTemplate('/templates/models/prediction/create-scoring-recipe-modal.html', $scope, null);
    };
    $scope.showCreateAssignClustersModal = function() {
        CreateModalFromTemplate('/templates/models/clustering/create-scoring-recipe-modal.html', $scope, null);
    };

    $scope.showCreateJoinModal = function(preselectedInputs, zone) {
        CreateModalFromTemplate('/templates/recipes/2to1-recipe-creation.html', $scope, 'JoinRecipeCreationController', function(newScope) {
            newScope.zone = zone;
            if (preselectedInputs && preselectedInputs.length >= 1) {
                newScope.io.inputDataset = preselectedInputs[0]
            }
            if (preselectedInputs && preselectedInputs.length >= 2) {
                newScope.io.inputDataset2 = preselectedInputs[1];
            }
        });
    };
    $scope.showCreateFuzzyJoinModal = function(preselectedInputs, zone) {
            CreateModalFromTemplate('/templates/recipes/2to1-recipe-creation.html', $scope, 'FuzzyJoinRecipeCreationController', function(newScope) {
                newScope.zone = zone;
                if (preselectedInputs && preselectedInputs.length >= 1) {
                    newScope.io.inputDataset = preselectedInputs[0];
                }
                if (preselectedInputs && preselectedInputs.length >= 2) {
                    newScope.io.inputDataset2 = preselectedInputs[1];
                }
            });
        };
    $scope.showCreateVStackModal = function(preselectedInputs, zone) {
        CreateModalFromTemplate('/templates/recipes/Nto1-recipe-creation.html', $scope, 'VStackRecipeCreationController', function(newScope) {
            newScope.zone = zone;
            if (preselectedInputs) {
                preselectedInputs.forEach(function(input) {
                    newScope.recipe.inputs.main.items.push({ref: input});
                });
            }
        });
    };
    $scope.showCreateMergeFolderModal = function(preselectedInputs, zone) {
        CreateModalFromTemplate('/templates/recipes/merge_folder-recipe-creation.html', $scope, 'MergeFolderRecipeCreationController', function(newScope) {
            newScope.zone = zone;
            if (preselectedInputs) {
                preselectedInputs.forEach(function(input) {
                    newScope.recipe.inputs.main.items.push({ref: input});
                });
            }
        });
    };

    $scope.showSQLRecipeModal = function(inputDatasetSmartName, zone) {
        CreateModalFromTemplate('/templates/flow-editor/new-sql-recipe-box.html', $scope, null, function(newScope) {
            newScope.zone = zone;
            newScope.preselectedInputDataset = inputDatasetSmartName;
        }, 'new-sql-recipe-box');
    };

    $scope.showCreateRecipeFromNotebookModal = function(notebookName, recipeType, analyzedDataset) {
        CreateModalFromTemplate("/templates/recipes/recipe-from-notebook-creation.html", $scope, null, function(newScope) {
            newScope.notebookName = notebookName;
            newScope.newRecipeType = recipeType;
            newScope.analyzedDataset = analyzedDataset;
        });
    };

    // preselectedInputs can be a computable smartName or an array of smartNames
    $scope.showCreateCodeBasedModal = function(recipeType, preselectedInputs, zone, prefillKey) {
        CreateModalFromTemplate('/templates/recipes/code-based-recipe-creation.html', $scope, 'CodeBasedRecipeCreationController', function(newScope) {
            newScope.zone = zone;
            newScope.newRecipeType = recipeType;
            newScope.preselectedInputs = preselectedInputs;
            newScope.recipePrefillKey = prefillKey;
        });
    };

    $scope.showCreateCustomCodeRecipeModal = function(recipeType, inputRefs, inputRole, zone){
        CreateModalFromTemplate('/templates/recipes/custom-code-recipe-creation.html', $scope, null, function(newScope) {
            newScope.zone = zone;
            newScope.newRecipeType = recipeType;
            // there can be more than one preselected input,
            // but they have to be for the same role as there can only be one preselected role.
            newScope.preselectedInputs = inputRefs;
            newScope.preselectedInputRole = inputRole;
        });
    };

    $scope.showCreateRecipeFromPlugin = function(pluginId, inputRefs, zone) {
        let modalScope;
        CreateModalFromTemplate('/templates/recipes/recipe-from-plugin-creation.html', $scope, null, function(newScope) {
            newScope.zone = zone;
            newScope.pluginId = pluginId;
            newScope.inputs = inputRefs;
            if (inputRefs) {
                newScope.inputCount = {}
                for (const key in inputRefs) {
                    newScope.inputCount[key] = inputRefs[key].length
                }
            }
            modalScope = newScope;
            modalScope.$on('$destroy', () => modalScope = null);
        });
        // on opener scope destroy, dismiss the modal
        // e.g. recipe was created, going on recipe page
        this.$on('$destroy', () => modalScope && modalScope.dismiss());
    };

    $scope.showCreateAppRecipeModal = function(recipeType, inputRefs, inputRole){
        CreateModalFromTemplate('/templates/recipes/app-recipe-creation.html', $scope, null, function(newScope) {
            newScope.newRecipeType = recipeType;
            // there can be more than one preselected input,
            // but they have to be for the same role as there can only be one preselected role.
            newScope.preselectedInputs = inputRefs;
            newScope.preselectedInputRole = inputRole;
        });
    };

    $scope.showCreateDatasetFromPlugin = function(pluginId) {
        CreateModalFromTemplate('/templates/datasets/dataset-from-plugin-creation.html', $scope, null, function(newScope) {
            newScope.pluginId = pluginId;
        });
    };

    $scope.showCreateUrlDownloadToFolderDataset = function(projectKey) {
        CreateModalFromTemplate('/templates/recipes/download-url-to-folder-dataset.html', $scope, null, function(newScope) {
            newScope.params.projectKey = projectKey;
        });
    };

    $scope.showCreateStreamingEndpointModal = function(type) {
        CreateModalFromTemplate('/templates/streaming-endpoints/new-streaming-endpoint-modal.html', $scope, "NewStreamingEndpointController", function(newScope) {
            newScope.newStreamingEndpoint.type = type;
        });
    }

    // --- Copy

    $scope.recipeTypeIsCopiable = function(recipeType) {
        if (!recipeType) return false;
        const desc = RecipeDescService.getDescriptor(recipeType);
        if (!desc) {
            throw Error(`Could not find descriptor for recipe type ${recipeType}`);
        }
        return desc.copiable;
    };

    $scope.showCopyRecipeModal = function(recipe) {
        const newScope = $scope.$new();
        newScope.recipe = recipe;
        newScope.newInputs = angular.copy(recipe.inputs);
        newScope.newOutputs = {};
        newScope.zone = recipe.zone;
        CreateModalFromTemplate('/templates/recipes/recipe-copy-modal.html', newScope);
    };
});


app.controller('ProjectHomeTabController', function($scope, $state, $stateParams, Breadcrumb, TopNav, DataikuAPI, ActivityIndicator, HistoryService, StateUtils) {
    $scope.tabUiState = {
        projectAppView : 'REGULAR'
    };

    $scope.$watch("projectSummary", function(nv, ov) {
        if (!nv)  return;

        if ($scope.projectSummary.projectAppType == 'APP_INSTANCE') {
            $scope.tabUiState.projectAppView = "APP_TILES";
        } else {
            $scope.tabUiState.projectAppView = "REGULAR";
        }
    });

    $scope.switchToAppView = function(){
        $scope.tabUiState.projectAppView = "APP_TILES";
    }
    $scope.switchToRegularProjectView = function(){
        $scope.tabUiState.projectAppView = "REGULAR";
    }

});

app.controller('ProjectHomeController', function($scope, $state, $stateParams, Breadcrumb, TopNav, DataikuAPI, ActivityIndicator, HistoryService, StateUtils, WatchInterestState) {
    TopNav.setLocation(TopNav.TOP_HOME, null, null, "summary");
    TopNav.setItem(TopNav.ITEM_PROJECT, $stateParams.projectKey);

    $scope.$watch("projectSummary", function(nv, ov) {
        if (!nv)  return;
        if (nv.projectKey == $stateParams.projectKey) {
            if ($scope.projectSummary.name) {
                HistoryService.recordProjectOpen($scope.projectSummary);
                TopNav.setPageTitle($scope.projectSummary.name);
            }
            if ($scope.projectSummary.projectAppType == 'APP_INSTANCE' && nv.projectKey) {
                DataikuAPI.apps.getInstanceSummary(nv.projectKey).success(function (data) {
                    $scope.appSummary = data;
                }).error(setErrorInScope.bind($scope));
            }
        }
    });

    $scope.uiState = {
        editSummary: false,
        activeTimelineTab : 'full'
    };

    $scope.projectRecentItems = HistoryService.getRecentlyViewedItems(5, null, $stateParams.projectKey);

	$scope.refreshTimeline = function() {
        if ($scope.isProjectAnalystRO()) {
		    DataikuAPI.timelines.getForProject($stateParams.projectKey).success(function(data) {
	   		  $scope.objectTimeline = data;
    		}).error(setErrorInScope.bind($scope));
        }
	};

    $scope.historyItemHref = function(item) {
        return StateUtils.href.dssObject(item.type, item.id, item.projectKey);
    };

    $scope.isProjectStatusSelected = function(projectStatus) {
    	return projectStatus.name == $scope.projectSummary.projectStatus;
    };

    /* For update of name/tags/description */
    function save(){
        DataikuAPI.projects.saveSummary($stateParams.projectKey, $scope.projectSummary).success(function(data){
            ActivityIndicator.success("Saved!");
        }).error(setErrorInScope.bind($scope));
    };

	$scope.$on("objectSummaryEdited", function(event, currentEditing){
        save();
        // remove pattern image from cache to update initials on project image (for graph/list view on project explorer page)
        if (currentEditing === 'name' && $scope.projectSummary.showInitials && !$scope.projectSummary.isProjectImg) {
            DataikuAPI.images.removeImage($stateParams.projectKey, 'PROJECT', $stateParams.projectKey);
        }
        $scope.refreshTimeline();
    });

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields(customFields);
    });

    $scope.$on("projectImgEdited", function(ev, newState){
        $scope.projectSummary.imgColor = newState.imgColor;
        $scope.projectSummary.isProjectImg = newState.isProjectImg;
        $scope.projectSummary.imgPattern = parseInt(newState.imgPattern, 10);
        $scope.projectSummary.showInitials = newState.showInitials;
        save();
        $scope.refreshTimeline();
    });

    const { isWatching, isShallowWatching, isFullyWatching } = WatchInterestState;
    $scope.isWatching = isWatching;
    $scope.isShallowWatching = isShallowWatching;
    $scope.isFullyWatching = isFullyWatching;
});


app.controller('ProjectActivityViewCommonController', function($scope, Fn) {
    $scope.prepareData = function(data) {
        $scope.activitySummary = data;
        $scope.dailyData = {
            commits: data.totalCommits.dayTS.data.map(function(ts, i) {
                return { date: new Date(ts), value: data.totalCommits.value.data[i] };
            }),
            writeHours: data.totalHoursWithWrites.dayTS.data.map(function(ts, i) {
                return { date: new Date(ts), value: data.totalHoursWithWrites.value.data[i] };
            }),
            presenceHours: data.totalPresence.dayTS.data.map(function(ts, i) {
                return { date: new Date(ts), value: Math.round(data.totalPresence.value.data[i] / 1000) };
            })
        };

        data.contributorsChart.dates = data.contributorsChart.bucketsTS.data
            .map(function (ts) { return new Date(ts); });
        data.contributorsSummaryAllTime.forEach(function(c) {
            if (c.user in data.contributorsChart.perContributor) {
                data.contributorsChart.perContributor[c.user].totalCommits = c.commits;
                data.contributorsChart.perContributor[c.user].totalAddedLines = c.addedLines;
                data.contributorsChart.perContributor[c.user].totalRemovedLines = c.removedLines;
            }
        });
        // To array for sortability
        data.contributorsChart.perContributor = Object.keys(data.contributorsChart.perContributor)
            .map(Fn.from(data.contributorsChart.perContributor));
        // Scope is computed by first 'global' chart, then copy it to inididual charts
        // (global charts must render first)
        data.contributorsChart.scale = null;
        $scope.setContributorsChartScale = function(scale) {
            data.contributorsChart.scale = scale;
            return scale;
        };

        data.contributorsSummary.forEach(function (c) {
            c.presenceHours = c.totalPresence / 3600 / 1000; // precence in hours
        });

        $scope.totalCommitsPerHour = Array.reshape2d(data.totalCommitsPerHour.matrix, 24);
    }
});


app.controller('ProjectActivityDashboardController', function($scope, DataikuAPI, TopNav, $stateParams, $controller) {
    $controller('ProjectActivityViewCommonController', {$scope: $scope});

    TopNav.setLocation(TopNav.TOP_HOME, null, null, "activity");
    TopNav.setItem(TopNav.ITEM_PROJECT, $stateParams.projectKey);
    $scope.uiState = {
        settingsPane : "summary",
        summaryChart: 'commits',
        contributorsChart: 'commits'
    };

    $scope.niceHours = function(sec) {
        var h = (sec/3600);
        return h.toFixed(1).replace(/\.0$/, '') + (h >= 2 ? ' hrs' : ' hr');
    };

    $scope.$watch('uiState.timeSpan', function(timeSpan) {
        DataikuAPI.projects.activity.getActivitySummary($stateParams.projectKey, timeSpan).success(function(data){
            $scope.prepareData(data);
        }).error(setErrorInScope.bind($scope));
    });
    $scope.uiState.timeSpan = 'year';
});

app.controller('ProjectMetricsController', function($scope, DataikuAPI, TopNav, $stateParams, $controller) {
    TopNav.setLocation(TopNav.TOP_HOME, null, null, "status");
    TopNav.setItem(TopNav.ITEM_PROJECT, $stateParams.projectKey);

    $scope.$watch("projectSummary", function(nv, ov) {
        if (!nv)  return;
        TopNav.setPageTitle($scope.projectSummary.name);
    });
});


app.controller('ProjectMetricsEditionController', function($scope, DataikuAPI, TopNav, $stateParams, $controller, WT1) {
    $scope.newMetric = {};

    $scope.addMetricPoint = function(newMetric) {
        var metricsData = {};
        metricsData[newMetric.name] = newMetric.value;
        DataikuAPI.projects.saveExternalMetricsValues($stateParams.projectKey, metricsData, {}).success(function(data){
            WT1.event("project-metric-inserted");
        }).error(setErrorInScope.bind($scope));
    };
});

app.controller('ProjectChecksEditionController', function($scope, DataikuAPI, TopNav, $stateParams, $controller, WT1) {
    $scope.newCheck = {};

    $scope.addCheckPoint = function(newCheck) {
        var checksData = {};
        if (newCheck.message && newCheck.message.length > 0) {
            checksData[newCheck.name] = [newCheck.value, newCheck.message];
        } else {
            checksData[newCheck.name] = newCheck.value;
        }
        DataikuAPI.projects.saveExternalChecksValues($stateParams.projectKey, checksData).success(function(data){
            WT1.event("project-check-inserted");
        }).error(setErrorInScope.bind($scope));
    };
});

app.directive('projectScenariosRuns', function($controller, $state){
    return {
        templateUrl: '/templates/projects/home/project-scenarios-runs.html',
        scope: {
            scenariosDays: '<',
            activeScenarios: '=',
            totalScenarios: '=',
            projectKey: '='
        },
        link: function($scope, element, attrs){
            $controller('OutcomesBaseController', {$scope: $scope});

            $scope.uiState = {};

            $scope.$watch('scenariosDays', function(nv, ov) {
                if (!nv) return;
                $scope.fixupOutcomes($scope.scenariosDays.columns, 14);
                computeLastRuns();
                sortRows();
                fixupRows();
                $scope.hasNoScenario = computeHasNoScenario();
                $scope.scenariosDays.rows = $scope.scenariosDays.rows.slice(0,4);
                $scope.displayedColumns = $scope.scenariosDays.columns; // b/c the underlying directive, outcomeCells, needs it in its scope
            });

            function computeLastRuns() {
                $scope.scenariosDays.rows.forEach(function(row) {
                    const id = row.uniqueId;
                    for (let i = $scope.scenariosDays.columns.length - 1; i>=0; i--) {
                        const column = $scope.scenariosDays.columns[i];
                        if (column.actions && column.actions[id]) {
                            const actions = column.actions[id];
                            row.lastRun = {
                                date: column.date,
                                outcome: actions[actions.length - 1].outcome.toLowerCase()
                            };
                            break;
                        }
                    }
                });
            }

            function sortRows() {
                $scope.scenariosDays.rows.sort(function(r1, r2) {
                    if (angular.equals({}, r2)) {
                        return -1;
                    }
                    if (angular.equals({}, r1)) {
                        return 1;
                    }
                    if (r1.lastRun.date == r2.lastRun.date) {
                        return r1.info.name.localeCompare(r2.info.name)
                    }
                    return r1.lastRun.date.localeCompare(r2.lastRun.date);
                });
            }

            function fixupRows() {
                while($scope.scenariosDays.rows.length < 4) {
                    $scope.scenariosDays.rows.push({});
                }
            }

            function computeHasNoScenario() {
                for (let i = 0; i<$scope.scenariosDays.rows.length; i++) {
                    const row = $scope.scenariosDays.rows[i];
                    if (!angular.equals({}, row)) {
                        return false;
                    }
                }
                return true;
            }

            $scope.hover = function(evt, column, row, localScope) {
                if (!$scope.hasNoScenario) {
                    $scope.hovered.date = column.date;
                    if (row && row.uniqueId) {
                        $scope.hovered.row = row;
                    }
                    $scope.hovered.actions = row && row.uniqueId ? column.actions[row.uniqueId] : null;
                }
            };

            $scope.unhover = function(evt, column, row, localScope) {
                $scope.hovered.date = null;
                $scope.hovered.row = null;
                $scope.hovered.actions = null;
            };

            $scope.select = function(evt, column, row, localScope) {
                if (row && row.uniqueId) {
                    evt.stopPropagation();
                    $state.go('projects.project.monitoring.scenarios.scoped', {
                        projectKey: $scope.projectKey,
                        scopeToDay: column.date,
                        scenarioQuery: row.info.name
                    });
                }
            }
        }
    };
});

}());
