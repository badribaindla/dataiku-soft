(function(){
'use strict';


var app = angular.module('dataiku.scenarios',[]);

var getPluginStepDisplayType = function($scope, step) {
    if (step.type && step.type.startsWith('pystep_')) {
        if ($scope.appConfig.customPythonPluginSteps) {
            var found = null;
            $scope.appConfig.customPythonPluginSteps.forEach(function(x) {
                if (x.stepType == step.type) {
                    found = x;
                }
            });
            if (found && found.desc && found.desc.meta) {
                return found.desc.meta.label || found.desc.id;
            }
        }
    }
    return step.type;
};

var processUnavailables = function (scenario, data) {
    if (data.unavailableSteps && data.unavailableSteps.length) {
        for (let step of scenario.params.steps) {
            step.unavailable = false;
            for (let unavailInfo of data.unavailableSteps) {
                if (unavailInfo.stepId === step.id) {
                    step.unavailable = true;
                    step.unavailableMessage = "Element " + unavailInfo.elementId
                        + " of type " + unavailInfo.objectType
                        + " from plugin " + unavailInfo.pluginId + " is not available.";
                    break;
                }
            }
        }
    }
    if (data.unavailableTriggerIds && data.unavailableTriggerIds.length) {
        for (let trigger of scenario.triggers) {
            trigger.unavailable = data.unavailableTriggerIds.includes(trigger.id);
        }
    }
}

var getStepDisplayType = (function($scope, step) { return this[step.type] || getPluginStepDisplayType($scope, step); }).bind({
    build_flowitem: "Build",
    check_dataset: "Run checks",
    check_consistency: "Check flow consistency",
    compute_metrics: "Compute metrics",
    sync_hive: "Synchronize Hive",
    update_from_hive: "Update from Hive",
    schema_propagation: "Schema propagation",
    reload_schema: "Reload schema",
    run_scenario: "Run scenario",
    runnable: "Execute macro",
    kill_scenario: "Kill scenario",
    create_dashboard_export: "Export dashboard",
    create_jupyter_export: "Export notebook",
    create_rmarkdown_report_export: "Export RMarkdown report",
    create_wiki_export: "Export wiki",
    create_saved_model_documentation_export: "Export saved model documentation",
    create_analysis_model_documentation_export: "Export analysis model documentation",
    restart_webapp: "Restart webapp",
    exec_sql: "Execute SQL",
    custom_python: "Custom Python",
    run_global_vars_update: "Run global variables update",
    set_project_vars: "Set project variables",
    set_global_vars: "Set global variables",
    define_vars: "Define variables",
    send_report: "Send message",
    clear_items: "Clear",
    invalidate_cache: "Invalidate cache",
    prepare_lambda_package: "Create API service version",
    prepare_bundle: "Create bundle",
    update_apideployer_deployment: "Update API deployment",
    update_projectdeployer_deployment: "Update Project deployment",
    set_up_cluster: "Create a cluster",
    tear_down_cluster: "Destroy a cluster",
    start_cluster: "Start a cluster",
    stop_cluster: "Stop a cluster",
    pull_git_refs: "Update Git references",
    refresh_chart_cache: "Refresh statistics & chart cache",
    start_continuous_activity: "Start continuous activity",
    stop_continuous_activity: "Stop continuous activity",
    compute_data_drift: "Compute data drift",
    retrieve_active_model_version_deployment: "Retrieve active version of deployed model",
    finally: "Cleanup"
});

var getPluginTriggerDisplayType = function($scope, trigger) {
    if (trigger.type && trigger.type.startsWith('pytrigger_')) {
        if ($scope.appConfig.customPythonPluginTriggers) {
            var found = null;
            $scope.appConfig.customPythonPluginTriggers.forEach(function(x) {
                if (x.triggerType == trigger.type) {
                    found = x;
                }
            });
            if (found && found.desc && found.desc.meta) {
                return found.desc.meta.label || found.desc.id;
            }
        }
    }
    return trigger.type;
};

var getTriggerDisplayType = (function($scope, trigger) {
    return this[trigger.type] || getPluginTriggerDisplayType($scope, trigger); }).bind({
        temporal: "Time-based",
        ds_modified: "Dataset modified",
        custom_python: "Custom trigger",
        sql_query: "SQL query change",
        follow_scenariorun: "Follow scenario"
    });

var getReportTargetItemDisplayName = (function(item, info) { return this[item.type](item, info) || item.type; }).bind({
    PROJECT: function(item){return "project " + item.projectKey;},
    DATASET: function(item){return "dataset " + item.datasetName + " in " + item.projectKey;},
    RECIPE: function(item){return "recipe " + item.recipeName + " in " + item.projectKey;},
    DATASET_PARTITION: function(item){return "dataset " + item.datasetName + " in " + item.projectKey + " (partition: " + item.partition + ")";},
    MANAGED_FOLDER: function(item, info){return "folder " + (info && info.name ? info.name : item.folderId) + " in " + item.projectKey;},
    MANAGED_FOLDER_PARTITION: function(item, info){return "folder " + (info && info.name ? info.name : item.folderId) + " in " + item.projectKey + " (partition: " + item.partition + ")";},
    MANAGED_FOLDER_FILE: function(item, info){return "file " + item.itemPath + " in folder " + (info && info.name ? info.name : item.folderId) + " in " + item.projectKey;},
    SAVED_MODEL: function(item, info){return "model " + (info && info.name ? info.name : item.modelId) + " in " + item.projectKey;},
    SAVED_MODEL_PARTITION: function(item, info){return "model " + (info && info.name ? info.name : item.modelId) + " in " + item.projectKey + " (partition: " + item.partition + ")";},
    SCENARIO: function(item){return "scenario " + (info && info.name ? info.name : item.scenarioId) + " in " + item.projectKey;},
    SCENARIO_TRIGGER: function(item){return "trigger " + item.triggerId;},
    SCENARIO_STEP: function(item){return "step " + item.stepId;},
    SQL_CONNECTION: function(item){return "SQL on connection " + item.connection;},
    JOBS: function(item){return "Job";},
    INSIGHT: function(item){return "insight " + (info && info.name ? info.name : item.insightId) + " in " + item.projectKey;},
    PYTHON: function(item){return "Python";},
    KEPT_FILE: function(item){return "file " + item.path;},
    CLUSTER: function(item) {return "cluster" + item.clusterId;}
});


app.factory("ScenarioUtils", function($state, DataikuAPI, WT1, CreateModalFromTemplate) {
    var triggerTypes = {
        manual: "Manual trigger",
        sub: "Launched by scenario",
        temporal: "Time-based trigger",
        ds_modified: "Dataset changed",
        sql_query: "SQL query result changed",
        follow_scenariorun: "After scenario",
        custom_python: "Custom python trigger"
    };

    return {
        getTriggerName: function(trigger) {
            if ( trigger == null ) return "";
            return trigger.name || triggerTypes[trigger.type] || trigger.type;
        },
        duplicate: function(scope, scenario) {
            DataikuAPI.projects.listHeads("WRITE_CONF").success(function(projects) {
                if (projects.length == 0) {
                    Dialogs.error(scope, "No writable project", "You don't have write access to any project, can't duplicate scenario.");
                    return;
                }
                CreateModalFromTemplate("/templates/scenarios/duplicate-scenario-modal.html", scope, null, function(newScope) {
                    const currentProjectWritable = projects.some(_ => _.projectKey === scenario.projectKey);
                    newScope.writableProjects = projects;
                    newScope.projectKey = currentProjectWritable ? scenario.projectKey : projects[0].projectKey;
                    newScope.fillId = function () {
                        if (!newScope.name || newScope.id) return;
                        newScope.id = newScope.name.replace(/\W+/g, '').toUpperCase();
                    }
                    newScope.duplicate = function() {
                        DataikuAPI.scenarios.duplicate(scenario.projectKey, newScope.projectKey, scenario.id, newScope.id,
                            newScope.name).success(function(data) {
                                $state.go('projects.project.scenarios.scenario.settings', {projectKey: newScope.projectKey, scenarioId: data.id});
                        }).error(setErrorInScope.bind(newScope));
                        WT1.event("scenario-duplicate", {onSameProject: scenario.projectKey == newScope.projectKey});
                    };
                    newScope.$watch("projectKey", function (newProjectKey) {
                        if (newProjectKey == scenario.projectKey ) {
                            newScope.name = "Copy of " + scenario.name;
                            newScope.id = undefined;
                        } else {
                            newScope.name = scenario.name;
                            newScope.id = scenario.id;
                        }
                    });
                });
            }).error(setErrorInScope.bind(scope));
        },

        getAutoTriggerDisablingReason: function(appConfig, projectSummaries) {
            if (appConfig.disableAutomaticTriggers) {
                return "Auto-triggers have been disabled in the global automation settings";
            }
            if (projectSummaries && projectSummaries.length == 1 && projectSummaries[0].disableAutomaticTriggers) {
                return "Auto-triggers have been disabled in the project's automation settings";
            }
            if (projectSummaries && projectSummaries.length > 1 && projectSummaries.every(summary => summary.disableAutomaticTriggers)) {
                return "Auto-triggers have been disabled in the automation settings of all selected projects";
            }
            return "";
        }
    }
});


app.controller("ScenarioCoreController", function($scope, $stateParams, CreateModalFromTemplate) {
    $scope.createAndPinInsight = function(scenario) {
        var insight = {
            projectKey: $stateParams.projectKey,
            type: 'scenario_last_runs',
            params: { scenarioSmartId: scenario.id, range: 'LAST_WEEK'},
            name: "Last runs of scenario " + scenario.name
        };
        CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $scope, "CreateAndPinInsightModalController", function(newScope) {
            newScope.init(insight);
        });
    }
});


app.controller("ScenariosListController", function($scope, $rootScope, $controller, $stateParams, $q, Fn, DataikuAPI, $state,
                TopNav, CreateModalFromTemplate, Dialogs, WT1, ActivityIndicator, ScenarioUtils) {

    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
    $controller('ScenariosCommonController', {$scope:$scope});

    $scope.sortBy = [
        { value: 'id', label: 'Id' },
        { value: 'name', label: 'Name' },
        { value: 'triggerDigest', label: 'Runs when...' }
    ];
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            tags: [],
            interest: {
                starred: '',
            },
        },
        filterParams: {
            userQueryTargets: ["name","tags"],
            propertyRules: {tag:"tags"},
        },
        orderQuery: "id",
        orderReversed: false,
    }, $scope.selection || {});
    $scope.sortCookieKey = 'scenarios';
    $scope.maxItems = 20;

    $scope.list = function() {
        DataikuAPI.scenarios.listHeads($stateParams.projectKey).success(function(data) {
            $scope.listItems = data.items;
            $scope.restoreOriginalSelection();
        }).error(setErrorInScope.bind($scope));
    };

    TopNav.setLocation(TopNav.TOP_JOBS, "scenarios", TopNav.TABS_NONE, null);
    TopNav.setNoItem();
    $scope.list() ;

    $scope.$watch("selection.selectedObject",function(nv) {
        if (!nv) return;

        DataikuAPI.scenarios.getSummary($stateParams.projectKey, nv.id).success(function(data) {
            $scope.scenario = data.object;
            processUnavailables($scope.scenario, data);
        }).error(setErrorInScope.bind($scope));
    });

    $scope.newScenario = function() {
        CreateModalFromTemplate("/templates/scenarios/new-scenario-modal.html", $scope);
    };

    /* Specific actions */
    $scope.goToItem = function(data) {};

    $scope.refreshTimeline = function(){    // bound in the view
        DataikuAPI.timelines.getForObject($stateParams.projectKey, "SCENARIO", this.id)
            .success(function(data){
                $scope.objectTimeline = data;
            })
            .error(setErrorInScope.bind($scope));
    };

    $scope.$watch('selection.confirmedItem', function(nv){
        if (!nv) {return}
        $scope.refreshTimeline.bind(nv)();
    });

    $rootScope.$on('toggleActiveList', function(){
        $scope.selection.confirmedItem.active = !$scope.selection.confirmedItem.active;
    });

    $scope.toggleActive = function(scenario) {
        WT1.event("scenario-save-active");
        $rootScope.$emit('toggleActiveRightCol');
        var message = scenario.active ? 'Activate ' : 'Deactivate ';
        message = message + 'auto-triggers of ' + scenario.projectKey + '.' + (scenario.name || scenario.id);
        DataikuAPI.scenarios.saveNoParams($stateParams.projectKey, scenario, {commitMessage:message}).success(function(data){
            // save the expanded states
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.massAutoTriggers = true;
    $scope.allAutoTriggers = function(objects) {
        if (!objects) return;
        return objects.map(Fn.prop('active')).reduce(function(a,b){return a&&b;},true);
    };

    $scope.allAutoTriggersDisabled = function() {
        return $scope.getAutoTriggerDisablingReason($scope.appConfig, $scope.projectSummary);
    };

    $scope.autoTriggersObjects = function(autoTriggerStatus, objects) {
        objects.forEach(function(object) {
            if (object.active === autoTriggerStatus) return;
            object.active = autoTriggerStatus;
            $scope.toggleActive(object);
        });
    };

    $scope.toggleAutomationLocal = function(scenario) {
        //scenario.active = !scenario.active;
        WT1.event("scenario-save-automationLocal");
        DataikuAPI.scenarios.saveNoParams($stateParams.projectKey, scenario, {}).success(function(data){
            // save the expanded states
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.runNow = function(scenario) {
        WT1.event("scenario-manual-run-from-list");
        DataikuAPI.scenarios.manualRun($stateParams.projectKey, scenario.id)
        .success(function(data){})
        .error(setErrorInScope.bind($scope));
    };

    $scope.duplicateScenario = function(scenario) {
        ScenarioUtils.duplicate($scope, scenario);
    };

    $scope.getAutoTriggerDisablingReason = function(appConfig, projectSummaries) {
        if (!appConfig || !projectSummaries) return "";
        return ScenarioUtils.getAutoTriggerDisablingReason(appConfig, [].concat(projectSummaries));
    }
});

app.controller("ScenarioPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, ActiveProjectKey, DataikuAPI) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.data = (await DataikuAPI.scenarios.getSummary(ActiveProjectKey.get(), $stateParams.scenarioId)).data;

    $scope.scenario = $scope.data.object;
    $scope.scenario.nodeType = "SCENARIO";
    $scope.scenario.interest = $scope.data.interest;

    $scope.selection = {
        selectedObject : $scope.scenario,
        confirmedItem : $scope.scenario
    };

    $scope.updateUserInterests = function() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "SCENARIO", ActiveProjectKey.get(), $stateParams.scenarioId)
            .success(function(data){
                $scope.selection.selectedObject.interest = data;
            })
            .error(setErrorInScope.bind($scope));
    }

    const interestsListener = $rootScope.$on('userInterestsUpdated', $scope.updateUserInterests);

    $scope.$on("$destroy", interestsListener);
});

app.directive('scenarioRightColumnSummary', function($controller, DataikuAPI, $stateParams, GlobalProjectActions,
    QuickView, ActiveProjectKey, ActivityIndicator, ScenarioUtils, $rootScope) {
    return {
        templateUrl :'/templates/scenarios/right-column-summary.html',

        link : function(scope, element, attrs) {

            $controller('_TaggableObjectsMassActions', {$scope: scope });
            $controller('_TaggableObjectsCapabilities', {$scope: scope });

            scope.QuickView = QuickView;

            /* Auto save when summary is modified */
            scope.$on("objectSummaryEdited", function() {
                const scriptData = scope.script ? scope.script.data : {};
                DataikuAPI.scenarios.save(ActiveProjectKey.get(), scope.scenario, scriptData, {})
                    .success(() => ActivityIndicator.success("Saved"))
                    .error(setErrorInScope.bind(scope));
            });

            scope.refreshData = function(){
                DataikuAPI.scenarios.getSummary(ActiveProjectKey.get(), scope.selection.selectedObject.id).success(function(data) {
                    if (!scope.selection.selectedObject
                        || scope.selection.selectedObject.id != data.object.id
                        || scope.selection.selectedObject.projectKey != data.object.projectKey) {
                        return; //too late!
                    }
                    scope.scenarioFullInfo = data;
                    scope.scenarioFullInfo.object.triggerDigest = scope.selection.confirmedItem.triggerDigest;
                    scope.scenario = scope.scenarioFullInfo.object;
                    if (scope.projectSummary) {
                        scope.scenarioFullInfo.object.disabledAutoTriggerReason =
                            ScenarioUtils.getAutoTriggerDisablingReason($rootScope.appConfig, [scope.projectSummary]);
                    } else { // right panel from HOME > MYITEMS
                        DataikuAPI.projects.getSummary(scope.scenario.projectKey).success(function(data) {
                            scope.scenarioFullInfo.object.disabledAutoTriggerReason =
                                ScenarioUtils.getAutoTriggerDisablingReason($rootScope.appConfig, [data.object]);
                        });
                    }
                }).error(setErrorInScope.bind(scope));
            };

            scope.$on('customFieldsSaved', scope.refreshData);

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) return;
                scope.refreshData();
            });
        }
    }
});


app.controller("NewScenarioController", function($scope, $controller, $stateParams, DataikuAPI, $state, WT1) {
	WT1.event("scenario-creation-modal");
	$scope.newScenario = {type : 'step_based', name : '', params : {}};
	$scope.create = function() {
		WT1.event("scenario-create");
		DataikuAPI.scenarios.create($stateParams.projectKey, $scope.newScenario).success(function(data) {
			$scope.resolveModal('Scenario created');
			if (data && data.id) {
				$state.go('projects.project.scenarios.scenario.settings', { scenarioId: data.id });
			} else {
				// should not happen
			}
        }).error(setErrorInScope.bind($scope));
	};
    $scope.fillId = function() {
        if (!$scope.newScenario.name || $scope.newScenario.id) return;
        $scope.newScenario.id = $scope.newScenario.name.replace(/\W+/g, '').toUpperCase();
    };
});

app.controller("ScenariosCommonController", function($scope, $rootScope, DataikuAPI, ActivityIndicator, $stateParams,
    TopNav, CreateModalFromTemplate, WT1) {

    $scope.script = {data : null};

    var getMinTriggerDelayForType = function(type) {
        if (type == "ds_modified" || type == "sql_query") {
            return 900;
        } else if (type == "follow_scenariorun") {
            return 60;
        } else if (type == "custom_python" || type.startsWith("pytrigger_")) {
            return 3600;
        }
        return 5;
    };

    $scope.saveScenario = function(){
        WT1.event("scenario-save", {type:$scope.scenario.type});

        $scope.$broadcast("scenario-save");

        // fixup scenario:
        // - don't leave empty delays because they'll become 0
        $scope.scenario.triggers.forEach(function(trigger) {
            if (!trigger.delay) {
                trigger.delay = getMinTriggerDelayForType(trigger.type);
            }
        });
        return DataikuAPI.scenarios.save($stateParams.projectKey, $scope.scenario, $scope.script.data, {
            commitMessage : $scope.currentSaveCommitMessage
        }).success(function(data){
            // save the expanded states
            $scope.saveInfoFromOld.forEach(function(f) {f($scope.scenario, data.scenario)});
            $scope.scenario = data.scenario;
            processUnavailables($scope.scenario, data);
            $scope.oldScenario = angular.copy($scope.scenario);
            $scope.oldScript = angular.copy($scope.script);
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.saveCustomFields = function(newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'SCENARIO'});
        let oldCustomFields = angular.copy($scope.scenario.customFields);
        $scope.scenario.customFields = newCustomFields;
        return $scope.saveScenario().then(function() {
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.scenario.customFields);
            }, function() {
                $scope.scenario.customFields = oldCustomFields;
            });
    };

    $scope.editCustomFields = function() {
        if (!$scope.scenario) {
            return;
        }
        let modalScope = angular.extend($scope, {objectType: 'SCENARIO', objectName: $scope.scenario.name, objectCustomFields: $scope.scenario.customFields});
        CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
            $scope.saveCustomFields(customFields);
        });
    };
});


app.controller("ScenarioController", function($scope, $controller, $stateParams, $rootScope, DataikuAPI, $state, TopNav,
                CreateModalFromTemplate, ActivityIndicator, WT1, Dialogs, $q, $timeout, ScenarioUtils, ScenarioIntegrations) {

    $controller('ScenariosCommonController', {$scope:$scope});

    TopNav.setItem(TopNav.ITEM_SCENARIO, $stateParams.scenarioId);
    TopNav.setLocation(TopNav.TOP_JOBS, "scenarios", TopNav.TABS_SCENARIO, "settings");

    $scope.getTriggerDisplayType = function(trigger) {return getTriggerDisplayType($scope, trigger);};

    $scope.lastRuns = null;
    $scope.lastTriggerRuns = {};
    DataikuAPI.scenarios.getSummary($stateParams.projectKey, $stateParams.scenarioId).success(function(data){
        $scope.scenario = data.object;
        processUnavailables($scope.scenario, data);
        $scope.objectTimeline = data.timeline;
        $scope.objectInterest = data.interest;
        $scope.oldScenario = angular.copy($scope.scenario);
        TopNav.setItem(TopNav.ITEM_SCENARIO, $stateParams.scenarioId, { name: $scope.scenario.name, id: $scope.scenario.id });

        $scope.refreshLastRuns();

    }).error(setErrorInScope.bind($scope));

    $scope.refreshLastRuns = function() {
        DataikuAPI.scenarios.getLastScenarioRuns($stateParams.projectKey, $stateParams.scenarioId, false).success(function(data){
        	$scope.lastRuns = data;
        }).error(setErrorInScope.bind($scope));

        DataikuAPI.scenarios.getLastTriggerRuns($stateParams.projectKey, $stateParams.scenarioId).success(function(data){
            $scope.lastTriggerRuns = {};
            data.forEach(function(run) {$scope.lastTriggerRuns[run.trigger.id] = run;});
        }).error(setErrorInScope.bind($scope));
    };

    $scope.abortScenario = function(run) {
    	WT1.event("scenario-abort");
		DataikuAPI.futures.abort(run.futureId).success(function(data) {
			$scope.refreshLastRuns();
		}).error(setErrorInScope.bind($scope));
    };

    $scope.scenarioIsDirty = function(){
        return $scope.scenario && $scope.oldScenario && (!angular.equals($scope.scenario, $scope.oldScenario) || !angular.equals($scope.script, $scope.oldScript));
    }

    $scope.saveScenarioIfNeeded = function(){
        if ($scope.scenarioIsDirty()){
            $scope.saveScenario();
        }
    }

    $scope.oldScript = {data : null};

    var keepTriggerExpandeds = function(oldScenario, newScenario) {
    	if (oldScenario.triggers && newScenario.triggers) {
    		for (var i = 0; i < oldScenario.triggers.length; i++) {
    			if ( i < newScenario.triggers.length ) {
    				newScenario.triggers[i].$expanded = oldScenario.triggers[i].$expanded;
    			}
    		}
    	}
    };
    var keepReporterExpandeds = function(oldScenario, newScenario) {
    	if (oldScenario.reporters && newScenario.reporters ) {
    		for (var i = 0; i < oldScenario.reporters.length; i++) {
    			if ( i < newScenario.reporters.length ) {
    				newScenario.reporters[i].$expanded = oldScenario.reporters[i].$expanded;
    			}
    		}
    	}
    };

    $scope.saveInfoFromOld = [];
    $scope.saveInfoFromOld.push(keepTriggerExpandeds);
    $scope.saveInfoFromOld.push(keepReporterExpandeds);



    $scope.saveSummary = function(){
        return DataikuAPI.scenarios.saveNoParams($stateParams.projectKey, $scope.scenario, {summaryOnly: true}).success(function(data) {
            // save the expanded states
            $scope.saveInfoFromOld.forEach(function(f) {f($scope.scenario, data.scenario)});
            $scope.scenario = data.scenario;
            processUnavailables($scope.scenario, data);
            $scope.oldScenario = angular.copy($scope.scenario);
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };


    $scope.commitScenario = function(){
        CreateModalFromTemplate("/templates/git/commit-object-modal.html", $scope, null, function(newScope) {
            newScope.object = {
                objectType : "SCENARIO",
                objectId : $scope.scenario.id
            }
        });
    }

    $scope.saveScenarioWithCustomCommitMessage = function(){
        var deferred = $q.defer();

        CreateModalFromTemplate("/templates/git/commit-message-only-modal.html", $scope, null, function(newScope) {
            newScope.commitData = {};
            /* Reload previous message if any */
            if ($scope.currentSaveCommitMessage) {
                newScope.commitData.message = $scope.currentSaveCommitMessage;
            }

            newScope.commit = function(){
                deferred.resolve(newScope.commitData);
                newScope.dismiss();
            }
        });

        deferred.promise.then(function(commitData){
            $scope.currentSaveCommitMessage = commitData.message;
            $scope.saveScenario();
        })
    }


    $scope.buildModes = [
                         ["NON_RECURSIVE_FORCED_BUILD", "Build only this dataset"],
                         ["RECURSIVE_BUILD", "Build required datasets"],
                         ["RECURSIVE_FORCED_BUILD", "Force-rebuild dataset and dependencies"],
                         ["RECURSIVE_MISSING_ONLY_BUILD", "Build missing dependent datasets then this one"]
                     ];

    $scope.runNow = function() {
		WT1.event("scenario-manual-run");

        if ($scope.isProjectAnalystRW()) {
        	$scope.saveScenario().then(function() {
                DataikuAPI.scenarios.manualRun($stateParams.projectKey, $scope.scenario.id)
                .success(function(data){})
                .error(setErrorInScope.bind($scope));
        	});
        } else {
                DataikuAPI.scenarios.manualRun($stateParams.projectKey, $scope.scenario.id)
                .success(function(data){})
                .error(setErrorInScope.bind($scope));
        }
    };

    $scope.duplicateScenario = function() {
        $scope.saveScenarioIfNeeded();
        ScenarioUtils.duplicate($scope, $scope.scenario);
    };

    $scope.runWithCustomParams = function() {
        WT1.event("scenario-manual-run", { withCustomParams : true });
        $scope.saveScenario().then(function() {
            CreateModalFromTemplate("/templates/scenarios/run-with-custom-params-modal.html", $scope);
        });
    };


	$scope.addTrigger = function(trigger) {
        WT1.event("scenario-trigger-add", {type:trigger.type});
        const temporalTrigger = $scope.appConfig.licensedFeatures.temporalTriggerAllowed || $scope.appConfig.licensing.ceEntrepriseTrial;
        const otherTriggers = $scope.appConfig.licensedFeatures.allScenarioTriggersAllowed || $scope.appConfig.licensing.ceEntrepriseTrial;
        console.info("Add, t=", temporalTrigger, "o=", otherTriggers)
        if ((trigger.type == "temporal" && !temporalTrigger) || (trigger.type != "temporal" && !otherTriggers)) {
            Dialogs.eeUnavailableFeature($scope,
                "This kind of trigger is not enabled in your Dataiku DSS license",
                "https://www.dataiku.com/dss/features/data-workflow/");
            return;
        }

		if ( $scope.scenario.triggers == null ) {
			$scope.scenario.triggers = [];
		}
		trigger.$expanded = true; // new items show up as expanded. When loading a scenario, all will be collapsed
        if (trigger.type == "temporal") {
            const curDate = new Date();
            curDate.setSeconds(0, 0);
            trigger.params = {
                repeatFrequency: 1,
                frequency: "Hourly",
                monthlyRunOn: "ON_THE_DAY",
                daysOfWeek: [getDayLabels(curDate.getDay())],
                startingFrom: curDate,
                hour: curDate.getHours(),
                minute: curDate.getMinutes(),
                timezone: 'SERVER'
            }
        } else if (trigger.type == "ds_modified" || trigger.type == "sql_query") {
            trigger.delay = 900;
            trigger.graceDelaySettings = {
                delay: 120,
                checkAgainAfterGraceDelay: true
            }
        } else if (trigger.type == "follow_scenariorun") {
            trigger.delay = 60;
            trigger.graceDelaySettings = {
                delay: 0,
                checkAgainAfterGraceDelay: false
            }
        } else if (trigger.type == "custom_python") {
            trigger.delay = 3600;
            trigger.graceDelaySettings = {
                delay: 0,
                checkAgainAfterGraceDelay: false
            }
        } else if (trigger.type.startsWith("pytrigger_")) {
            trigger.delay = 3600;
            trigger.graceDelaySettings = {
                delay: 0,
                checkAgainAfterGraceDelay: false
            }
        }
        trigger.name = getTriggerDisplayType($scope, trigger);
		$scope.scenario.triggers.push(trigger);
	};

	$scope.removeTrigger = function(trigger) {
        WT1.event("scenario-trigger-remove");
		var index = $scope.scenario.triggers.indexOf(trigger);
		if ( index >= 0 ) {
			$scope.scenario.triggers.splice(index, 1);
		}
	};

	$scope.addReporter = function(type) {
	    WT1.event("scenario-reporter-add");
	    var reporter = {
            active : true,
            phase : "END",
            runConditionEnabled : true,
            runCondition : "outcome != 'SUCCESS'",
            messaging : {
                type : type,
                configuration : {
                    variables: [],
                    parameters: [],
                    headers: [],
                    form: []
                }
            }
        }

        if (type === 'slack-scenario' || type === 'webhook-scenario' || type === 'msft-teams-scenario') {
            reporter.messaging.configuration.useProxy = true;
        }
		if ($scope.scenario.reporters == null) {
			$scope.scenario.reporters = [];
		}
		reporter.$expanded = true; // new items show up as expanded. When loading a scenario, all will be collapsed
		$scope.scenario.reporters.push(reporter);
	};

	$scope.removeReporter = function(reporter) {
        WT1.event("scenario-reporter-remove");
		var index = $scope.scenario.reporters.indexOf(reporter);
		if ( index >= 0 ) {
			$scope.scenario.reporters.splice(index, 1);
		}
	};

    $scope.getIntegrationTypeLabel = ScenarioIntegrations.getLabelByType;

	$scope.refreshTimeline = function() {
        DataikuAPI.timelines.getForObject($stateParams.projectKey, "SCENARIO", $stateParams.scenarioId).success(function(data){
            $scope.objectTimeline = data;
        }).error(setErrorInScope.bind($scope));
    };

    DataikuAPI.security.listUsers().success(function(data) {
        $scope.allUsers = data;
    }).error(setErrorInScope.bind($scope));

    $scope.toggleItemExpanded = function(item) {
    	item.$expanded = !item.$expanded;
    };

	// list the flow items in the project, because that's going to be needed for actual work in the steps in any decent scenario
    DataikuAPI.datasets.listWithAccessible($stateParams.projectKey).success(function(data) {
    	data.forEach(function(ds) {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
        $scope.datasets = data;
        $scope.datasetSmartNames = data.map(function(ds) {return {smartName : ds.foreign ? (ds.projectKey + '.' + ds.name) : ds.name, displayName : ds.name + (ds.foreign ? ('(' + ds.projectKey + ')') : '')};});
        $scope.datasetSmartNames.push({smartName : '', displayName : 'Nothing selected'});
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.managedfolder.listWithAccessible($stateParams.projectKey).success(function(data) {
    	data.forEach(function(ds) {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
        $scope.managedfolders = data;
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.savedmodels.listWithAccessible($stateParams.projectKey).success(function(data) {
    	data.forEach(function(ds) {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
        $scope.savedmodels = data;
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.dashboards.listHeads($stateParams.projectKey, {}).success(function(data) {
        $scope.dashboards = data.items;
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.modelevaluationstores.listWithAccessible($stateParams.projectKey).success(function(data) {
        data.forEach(function(ds) {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
        $scope.modelevaluationstores = data;
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.admin.clusters.listAccessible().success(function(data){
        $scope.clusters = data;
        $scope.clusterIds = data.map(function(c) {return c.id;});
    }).error(setErrorInScope.bind($scope));

    function allowedTransitions(data) {
        // scenario has several top-level tabs, so we need to check if we move to a different state but on the same scenario
        return !((data.toState && data.toState.name && data.toState.name.indexOf("projects.project.scenarios.scenario") < 0) || data.toParams.scenarioId != data.fromParams.scenarioId);
    }
    checkChangesBeforeLeaving($scope, $scope.scenarioIsDirty, null, allowedTransitions);

    Mousetrap.bind("@ f a k e", function(){
        CreateModalFromTemplate("/templates/scenarios/fake-run-modal.html", $scope, null, function(newScope){
        	newScope.date = moment().format("YYYY-MM-DD");
        	newScope.time = moment().format("HH:mm");
            newScope.repeats = 1;
            newScope.spacing = 300;
        	newScope.outcome = "SUCCESS";
        	newScope.outcomes = ["SUCCESS", "WARNING", "FAILED", "ABORTED"];
    	    newScope.run = function() {
    	        var t = moment(newScope.date + ' ' + newScope.time + '.00');
    	        for (var i = 0; i < newScope.repeats; i++) {
        	        DataikuAPI.internal.fakeScenarioRun($stateParams.projectKey, $stateParams.scenarioId, t.format("YYYY-MM-DD") + 'T' + t.format("HH:mm:ss") + ".000Z", newScope.outcome).success(function(data) {
        	        }).error(setErrorInScope.bind($scope));
        	        t = t.add(newScope.spacing, 's')
        	    }
                newScope.dismiss();
        	}
        });
    })

    $scope.$on("$destroy", function(){
        Mousetrap.unbind("@ f a k e");
    });
});

app.controller("RunScenarioWithCustomParamsModalController", function($scope, $stateParams, DataikuAPI, Logger, LocalStorage, WT1, CodeMirrorSettingService){
    var storageKey = "dss.scenarios." + $stateParams.projectKey + "." + $scope.scenario.id + ".customRunParams";

    $scope.editorOptions = CodeMirrorSettingService.get('application/json', {onLoad: function(cm) {$scope.codeMirror = cm;}});

    $scope.run = {
        params : {}
    };

    var state = LocalStorage.get(storageKey);
    if (state) {
        try {
            $scope.run.params = JSON.parse(state);
        } catch (e) {
            Logger.warn("Failed to parse previously-saved scenario params", e);
        }
    }

    $scope.go = function(){
        try {
            LocalStorage.set(storageKey, JSON.stringify($scope.run.params));
        } catch (e) {
            Logger.warn("Failed to save scenario params", e);
        }
        WT1.event("scenario-manual-run-with-params");
        DataikuAPI.scenarios.manualRun($stateParams.projectKey, $scope.scenario.id, $scope.run.params).success(function(data){
            $scope.dismiss();
        }).error(setErrorInScope.bind($scope));
    }
})

app.controller("ScenarioRunController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
	$controller('ScenarioController', {$scope: $scope});
    if ($stateParams.runId != undefined) {
    	// go to that run directly
    	$scope.preSelectedRun = {runId : $stateParams.runId};
    }
});


app.controller("ScenarioSettingsController", function($scope, TopNav, ScenarioIntegrations, ScenarioUtils) {
    TopNav.setLocation(TopNav.TOP_JOBS, "scenarios", TopNav.TABS_SCENARIO, "settings");

     $scope.availableIntegrationTypes = ScenarioIntegrations.integrationTypes;
     $scope.getAutoTriggerDisablingReason = function(appConfig, projectSummaries) {
         if (!appConfig || !projectSummaries) return "";
        return ScenarioUtils.getAutoTriggerDisablingReason(appConfig, [].concat(projectSummaries));
     }
});


app.controller("ScenarioSummaryController", function($scope, TopNav) {
    TopNav.setLocation(TopNav.TOP_JOBS, "scenarios", TopNav.TABS_SCENARIO, "summary");

    /* Auto save when summary is modified */
    $scope.$on("objectSummaryEdited", $scope.saveScenario);

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields(customFields);
    });
});


app.controller("ScenarioStepsController", function($scope, TopNav) {
    TopNav.setLocation(TopNav.TOP_JOBS, "scenarios", TopNav.TABS_SCENARIO, "steps");
});


app.controller("ScenarioRunsTimelineController", function($scope, TopNav) {
    TopNav.setLocation(TopNav.TOP_JOBS, "scenarios", TopNav.TABS_SCENARIO, "runs");
});


app.controller("objectTimelineController", function($scope, TopNav) {
});


app.controller("ScenarioHistoryController", function($scope, TopNav) {
    TopNav.setLocation(TopNav.TOP_JOBS, "scenarios", TopNav.TABS_SCENARIO, "history");
});

var defaultCode =
"# This sample code helps you get started with the custom scenario API.\n" +
"#For more details and samples, please see our Documentation\n" +
"from dataiku.scenario import Scenario\n" +
"\n" +
"# The Scenario object is the main handle from which you initiate steps\n" +
"scenario = Scenario()\n" +
"\n" +
"# A few example steps follow\n" +
"\n" +
"# Building a dataset\n" +
"scenario.build_dataset(\"customers_prepared\", partitions=\"2015-01-03\")\n" +
"\n" +
"# Controlling the train of a dataset\n" +
"train_ret = scenario.train_model(\"uSEkldfsm\")\n" +
"trained_model = train_ret.get_trained_model()\n" +
"performance = trained_model.get_new_version_metrics().get_performance_values()\n" +
"if performance[\"AUC\"] > 0.85:\n" +
"    trained_model.activate_new_version()\n" +
"\n" +
"# Sending custom reports\n" +
"sender = scenario.get_message_sender(\"mail-scenario\", \"local-mail\") # A messaging channel\n" +
"sender.set_params(sender=\"dss@company.com\", recipient=\"data-scientists@company.com\")\n" +
"\n" +
"sender.send(subject=\"The scenario is doing well\", message=\"All is good\")\n"

app.controller("ScenarioScriptController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, WT1, ActivityIndicator) {
    TopNav.setLocation(TopNav.TOP_JOBS, "scenarios", TopNav.TABS_SCENARIO, "script");
});


app.controller("ScenarioRunsController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, WT1, ActivityIndicator, ScenarioUtils) {
	$scope.stepRuns = [];
	$scope.selectedRun = {runId : $stateParams.runId};

	$scope.refreshRunsAndSteps = function() {
		WT1.event("scenario-refresh-runs");
		if ( $scope.selectedRun != null && $scope.selectedRun.futureId != null ) {
			$scope.refreshSteps();
		}
		$scope.refreshLastRuns();
	};

	$scope.refreshSteps = function() {
		if ( $scope.selectedRun != null ) {
			DataikuAPI.scenarios.getScenarioRunDetails($stateParams.projectKey, $stateParams.scenarioId, $scope.selectedRun.runId).success(function(data){
                $scope.selectedRunDetails = data;
				$scope.selectedRunStepRuns = data.stepRuns;
                var results = [];
                if ( $scope.selectedRun.result ) results.push($scope.selectedRun.result);
                data.stepRuns.forEach(function(stepRun) { if ( stepRun.additionalReportItems && stepRun.additionalReportItems.length > 0 ) results.push.apply(results, stepRun.additionalReportItems); });
                results.forEach(function(item) {
                    if (item.logTail && item.logTail.lines && item.logTail.lines.length) {
                        item.logTail.text = item.logTail.lines.join('\n').replace(/^\s+|\s+$/g, '');
                    }
                });
			}).error(setErrorInScope.bind($scope));
		}
	};

	$scope.getTriggerName = ScenarioUtils.getTriggerName;

	$scope.selectRun = function(run) {
		$scope.selectedRun = run;
		if ( run == null ) {
	        $state.transitionTo('projects.project.scenarios.scenario.runs.list', {projectKey: $stateParams.projectKey, scenarioId: $stateParams.scenarioId}
            , {location: true, inherit: true, relative: $state.$current, notify: false})
		} else {
	        $state.transitionTo('projects.project.scenarios.scenario.runs.list.run', {projectKey: $stateParams.projectKey, scenarioId: $stateParams.scenarioId, runId:run.runId}
            , {location: true, inherit: true, relative: $state.$current, notify: false})
		}
		$scope.refreshSteps();
	};

    $scope.downloadRunDiagnosis = function(run) {
        ActivityIndicator.success("Preparing run diagnosis ...");
        downloadURL(DataikuAPI.scenarios.getRunDiagnosisURL($stateParams.projectKey, $stateParams.scenarioId, run.runId));
    };
    $scope.getRunLogURL = function(run) {
        return DataikuAPI.scenarios.getRunLogURL($stateParams.projectKey, $stateParams.scenarioId, run.runId);
    };
    $scope.getStepRunLogURL = function(run, stepRun) {
        return DataikuAPI.scenarios.getStepRunLogURL($stateParams.projectKey, $stateParams.scenarioId, run.runId,
            stepRun.step.type + '_' + stepRun.runId);
    };

    $scope.getDisplayType = function(step) {
        return getStepDisplayType($scope, step);
    };

    $scope.getReportTargetItemDisplayName = getReportTargetItemDisplayName;

	$scope.$watch('lastRuns', function(nv) {
		if ( $scope.lastRuns == null || $scope.selectedRun == null) return;
		// find the selectedRun in the new list (with its new state)
		var runToSelect = null;
		$scope.lastRuns.forEach(function(run) {
			if ( run.runId == $scope.selectedRun.runId ) {
				runToSelect = run;
			}
		});
    	if (!runToSelect) {
    		runToSelect = $scope.lastRuns[0];
    	}
		$scope.selectRun(runToSelect);
	}, true);

	$scope.refreshRunsAndSteps();
});

app.directive("scenarioStepsActionsList", function () {
    return {
        restrict: 'AE',
        templateUrl: '/templates/scenarios/fragments/step-actions-list.html'
    }
});

app.controller("CustomPythonScenarioController", function($scope, $controller, $stateParams, DataikuAPI, CodeMirrorSettingService) {
    DataikuAPI.scenarios.getScript($stateParams.projectKey, $stateParams.scenarioId).success(function(data){
    	$scope.script.data = data.script;
    	$scope.oldScript.data = data.script;

        $scope.scriptReady = true;

    }).error(setErrorInScope.bind($scope));

    $scope.editorOptions = CodeMirrorSettingService.get('text/x-python', {onLoad: function(cm) {$scope.cm = cm;}});
    $scope.editorOptions.gutters = ["CodeMirror-lint-markers","CodeMirror-foldgutter"];
    $scope.editorOptions.lint = {
        'getAnnotations' : function(cm,updateFunction) {
            $scope.linterFunction = function(err) {
                updateFunction(err);
            };
        },
        'async' : true
    };

    $scope.resolveCodeForInsertionFunc = function (sample) {
    	var code = "\n\n";
    	code += $scope.resolveCodeForPreviewFunc(sample);
    	return code;
    };
    $scope.resolveCodeForPreviewFunc = function (sample) {
    	var resolveCode = sample.code;
    	// TODO something. there must be something to do.
        return resolveCode;
    };
});


app.controller("StepBasedScenarioController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, WT1, Dialogs, ClipboardUtils, ActivityIndicator, openDkuPopin) {

    $scope.currentStep = null;

    $scope.selection = {};

    function setDefaultRunConditions(step) {
        step.runConditionType = 'RUN_IF_STATUS_MATCH';
        step.runConditionStatuses = ['SUCCESS', 'WARNING'];
        step.runConditionExpression = '';
        step.resetScenarioStatus = false;
        step.maxRetriesOnFail = 0;
        step.delayBetweenRetries = 10;
    }

    var keepStepExpandeds = function(oldScenario, newScenario) {
        if (oldScenario && oldScenario.params && oldScenario.params.steps && newScenario.params.steps ) {
            for (var i = 0; i < oldScenario.params.steps.length; i++) {
                if ( i < newScenario.params.steps.length ) {
                    newScenario.params.steps[i].$expanded = oldScenario.params.steps[i].$expanded;
                }
            }
        }
    };
    var keepCurrentStep = function(oldScenario, newScenario) {
        if (oldScenario && oldScenario.params && oldScenario.params.steps && newScenario.params.steps ) {
            var index = oldScenario.params.steps.indexOf($scope.currentStep);
            if ( index >= 0 && index < newScenario.params.steps.length ) {
                $scope.currentStep = newScenario.params.steps[index];
            } else {
                $scope.currentStep = null;
            }
        }
    };
    $scope.saveInfoFromOld.push(keepStepExpandeds);
    $scope.saveInfoFromOld.push(keepCurrentStep);

    $scope.getRunConditionIndicatorIcon = function(step) {
        if (step.runConditionType == 'DISABLED') return 'icon-ban-circle';
        if (step.runConditionType == 'RUN_ALWAYS') return 'icon-play-sign';
        if (step.runConditionType == 'RUN_CONDITIONALLY') return 'icon-code-fork';
        if (step.runConditionType == 'RUN_IF_STATUS_MATCH') {
            if (step.runConditionStatuses.includes('FAILED')) return 'icon-exclamation-sign';
            if (step.runConditionStatuses.includes('ABORTED')) return 'icon-stop';
        }
        return null;
    };

    $scope.addStep = function(step) {
        WT1.event("scenario-step-add", {type:step.type})
		if ( $scope.scenario.params.steps == null ) {
			$scope.scenario.params.steps = [];
		}

        const advancedStepsAllowed = $scope.appConfig.licensedFeatures.advancedScenarioStepsAllowed || $scope.appConfig.licensing.ceEntrepriseTrial;
        if (step.type != "build_flowitem" && !advancedStepsAllowed) {
            Dialogs.eeUnavailableFeature($scope,
                "This kind of scenario step is not enabled in your Dataiku DSS license",
                "https://www.dataiku.com/dss/features/data-workflow/");
            return;
        }

        if (step.type == "custom_python") {
            step.params.envSelection = {
                envMode: "INHERIT"
            }
        }

        setDefaultRunConditions(step);

        step.name = "Step #" + ($scope.scenario.params.steps.length + 1);

        step.$expanded = true; // new items show up as expanded. When loading a scenario, all will be collapsed
        $scope.scenario.params.steps.push(step);
        $scope.editStep(step);
    };

    $scope.deleteSelectedSteps = function() {
        const stepsToDelete = $scope.selection.selectedObjects;
        if (stepsToDelete.length > 0) {
            var dialogScope = $scope.$new();
            dialogScope.stepsToDelete = stepsToDelete;
            dialogScope.perform = function() {
                stepsToDelete.forEach((step) => {
                    $scope.removeStep(step)
                });
                WT1.event("scenario-step-remove", { nbSteps: stepsToDelete.length })
            }
            CreateModalFromTemplate("/templates/widgets/delete-step-dialog.html", dialogScope);
        }
    }

    $scope.copySelectedSteps = function() {
        $scope.copyData($scope.selection.selectedObjects)
    }

    $scope.openPasteModalFromSelectedSteps = function() {
        const selectedSteps = $scope.selection.selectedObjects;
        const insertAfterStep = selectedSteps[selectedSteps.length - 1];
        $scope.openPasteModalFromStep(insertAfterStep)
    }

    $scope.toggleRunConditionSelectedSteps = function() {
        const selectedSteps = $scope.selection.selectedObjects;
        const allStepsDisabled = selectedSteps.every(step => step.runConditionType == "DISABLED");
        for (const step of selectedSteps) {
            if (allStepsDisabled) {
                setDefaultRunConditions(step);
            } else {
                step.runConditionType = "DISABLED";
            }
        }
    }

    /*
        * Copy/Paste steps
        *
    */

    let copyType = 'scenario-steps';

    $scope.copyData = function(data) {
        let copy = {
            "type": copyType,
            "version": $scope.appConfig.version.product_version,
            steps: angular.copy(data)
        };
        copy.steps.forEach(step => step.$selected = false);

        const dataStr = JSON.stringify(copy, (key, value) => {
            let keysToRemove = ['id', '$$hashKey', '$variant'];

            return keysToRemove.includes(key) ? undefined : value;
        }, 2);
        const plural = copy.steps.length > 1 ? 's' : '';
        ClipboardUtils.copyToClipboard(dataStr, `Copied ${copy.steps.length} step${plural} to clipboard.`);
    };

    $scope.openPasteModalFromStep = function(insertAfterStep) {
        let newScope = $scope.$new();
        $scope.insertAfterStep = insertAfterStep;

        CreateModalFromTemplate("/templates/scenarios/paste-steps-modal.html", newScope, 'PasteModalController', function(modalScope) {
            modalScope.copyType = copyType;
            modalScope.itemKey = 'steps';
            modalScope.formatData = $scope.formatStepData;
            modalScope.pasteItems = $scope.pasteSteps;
        });
    };

    $scope.formatStepData = function(steps) {
        steps.forEach(step => {
            const name = step.name;
            if (typeof name !== 'undefined' && name.length > 0) {
                const suffix = ' (copy)';
                if (name.indexOf(suffix, name.length - suffix.length) === -1) {
                    step.name += ' (copy)';
                }
            }
        });

        return steps;
    };

    $scope.pasteSteps = function(stepsToPaste) {
        const allSteps = $scope.scenario.params.steps;

        let insertAfter = allSteps.indexOf($scope.insertAfterStep);
        insertAfter = insertAfter < 0 ? allSteps.length : insertAfter + 1;

        allSteps.splice(insertAfter, 0, ...stepsToPaste);

        const plural = stepsToPaste.length > 1 ? 's' : '';
        ActivityIndicator.success(`Pasted ${stepsToPaste.length} step${plural} successfully.`, 5000);

        WT1.event("scenario-steps-paste", { nbSteps: stepsToPaste.length })
        allSteps.forEach((step) => step.$selected = false);
        stepsToPaste.forEach((step) => step.$selected = true);
        $scope.insertAfterStep = null;
        $scope.currentStep = stepsToPaste[0];
    };

    // immediately show preview state since we've already pasted
    $scope.openPasteModalFromKeydown = function(data) {
        try {
            data = JSON.parse(data);
        } catch(e) {}

        if (data && data.steps && data.steps.length && data.type === copyType) {
            let newScope = $scope.$new();
            $scope.insertAfter = $scope.currentStep;

            CreateModalFromTemplate("/templates/scenarios/paste-steps-modal.html", newScope, 'PasteModalController', function(modalScope) {
                modalScope.uiState.editMode = false;
                modalScope.uiState.items = data.steps;
                modalScope.uiState.type = data.type;
                modalScope.pasteItems = $scope.pasteSteps;
            });
        }
    }

    $scope.keydownCopy = function(event) {
        const selectedSteps = $scope.selection.selectedObjects;
        if (selectedSteps.length > 0) {
            $scope.copyData(selectedSteps);
        }
        event.currentTarget.focus();
    }

    $scope.removeOneStep = function(step) {
        WT1.event("scenario-step-remove", { nbSteps: 1 })
        $scope.removeStep(step);
    }

	$scope.removeStep = function(step) {
		if ( step == $scope.currentStep ) {
			$scope.currentStep = null;
		}
		var index = $scope.scenario.params.steps.indexOf(step);
		if ( index >= 0 ) {
			$scope.scenario.params.steps.splice(index, 1);
		}
	};

	$scope.editStep = function(step, index) {
		$scope.currentStep = step;
		$('.step-help-popover').popover('hide');//hide any displayed help window
	};

    $scope.getDisplayType = function(step) {
        return getStepDisplayType($scope, step);
    };

	$scope.getDisplayName = function(step) {
		return step.name;
    };

    $scope.openMenu = function($event, step) {
        function isElsewhere() {
            return true;
        }

        const dkuPopinOptions = {
            isElsewhere,
            callback: null,
            popinPosition: 'CLICK',
            template: `<ul class="dropdown-menu" scenario-steps-actions-list></ul>`,
        };

        const selectedSteps = $scope.selection.selectedObjects;
        if (selectedSteps && selectedSteps.length > 0 && selectedSteps.indexOf(step) > -1) {
            openDkuPopin($scope, $event, dkuPopinOptions);
        } else {
            const newScope = $scope.$new();
            newScope.step = step;
            openDkuPopin(newScope, $event, dkuPopinOptions);
        }
    };

	$scope.$watch('scenario' , function(nv) {
	    if ( nv == null ) {
	        $scope.currentStep = null;
	    } else {

	    }
	}, true);

	$scope.$on("$destroy", function() {
        $('.step-help-popover').popover('hide');//hide any displayed help window
	});
});


app.directive('editStep', function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate, $timeout) {
    return {
        restrict : 'A',
        templateUrl : '/templates/scenarios/fragments/edit-step.html',
        scope : true,
        link : function($scope, element, attrs) {

            $scope.statuses = [
                           {id:'SUCCESS', label:'ok'},
                           {id:'WARNING', label:'warning'},
                           {id:'ABORTED', label:'aborted'},
                           {id:'FAILED', label:'failed'}
                       ];
            $scope.stepRunConditionVariants = [
                                               {label: 'Never'                      , type:'DISABLED'           , statuses:null                  },
                                               {label: 'If no prior step failed'    , type:'RUN_IF_STATUS_MATCH', statuses:['SUCCESS', 'WARNING']},
                                               {label: 'If some prior step failed'  , type:'RUN_IF_STATUS_MATCH', statuses:['FAILED']            },
                                               {label: 'Always'                     , type:'RUN_ALWAYS'         , statuses:null                  },
                                               {label: 'If current outcome is'      , type:'RUN_IF_STATUS_MATCH', statuses:null                  , showStatuses:true},
                                               {label: 'If condition satisfied'     , type:'RUN_CONDITIONALLY'  , statuses:null                  , showExpression:true}
                                           ];
            $scope.stepRunConditionDescriptions = [
                "This step is disabled and does not run",
                "This step only runs if the scenario is not currently in a failed state (either all previous steps succeedeed, or a prior step reset the failure status)",
                "This step only runs if the scenario is currently in a failed state (because a previous step failed)",
                "This step always runs, even if the scenario is currently in a failed state",
                "This step only runs if the current state of the scenario is among the select states",
                "This step runs if a custom expression is satisfied"
            ]
           $scope.conditionEditorOptions = {
                   mode:'text/grel',
                   theme:'elegant',
                   indentUnit: 4,
                   lineNumbers : false,
                   lineWrapping : true,
                   autofocus: true,
                   onLoad : function(cm) {$scope.codeMirror = cm;}
               };

           $scope.couldResetStatus = function(step) {
               if (step == null || step.runConditionType == null) return false;
               if (step.runConditionType == 'DISABLED') return false;
               if (step.runConditionType != 'RUN_IF_STATUS_MATCH') return true;
               return step.runConditionStatuses.includes('FAILED') || step.runConditionStatuses.includes('ABORTED');
           };

           var setVariant = function(variant, step) {
               if (step == null || variant == null) return;
               step.$variant = variant;
               step.runConditionType = variant.type;
               if (variant.statuses) {
                   step.runConditionStatuses = variant.statuses;
               }
           };
           var variantMatches = function(variant, step) {
               if (variant.type != step.runConditionType) return false;
               if (variant.statuses && step.runConditionStatuses) {
                   var aInB = variant.statuses.filter(function(s) {return !step.runConditionStatuses.includes(s);}).length == 0;
                   var bInA = step.runConditionStatuses.filter(function(s) {return !variant.statuses.includes(s);}).length == 0;
                   return aInB && bInA;
               }
               return true;
           };

           var initStep = function() {
               if ($scope.step == null) return;
               var matchingVariants = $scope.stepRunConditionVariants.filter(function(variant) {return variantMatches(variant, $scope.step);});
               if (matchingVariants.length > 0) {
                   $scope.step.$variant = matchingVariants[0];
               } else {
                   setVariant($scope.stepRunConditionVariants[0], $scope.step);
               }
           };

           $scope.$watch(attrs.editStep, function() {
               $scope.step = $scope.$eval(attrs.editStep);
               initStep();
           });
           $scope.$watch('step.$variant', function() {
               setVariant($scope.step.$variant, $scope.step);
           });
        }
    };
});

app.directive('stepDashboardsTable', function(CreateModalFromTemplate) {
    return {
        restrict: 'E',
        templateUrl: '/templates/scenarios/fragments/step-dashboards-table.html',
        scope: {
            items: '=',
            dashboards: '='
        },
        link: function($scope, element, attrs) {
            $scope.addItem = function() {
                CreateModalFromTemplate("/templates/scenarios/build_flowitem-new-dashboard-modal.html",
                            $scope, "AddDashboardToBuildModalController");
            };

            $scope.removeItem = function(i){
                $scope.items.splice(i, 1);
            };
        }
    }
});

app.directive('stepItemsTable', function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate) {
    return {
        restrict : 'E',
        templateUrl : '/templates/scenarios/fragments/step-items-table.html',
        scope : {
                items : '=',
                canDataset : '=',
                canManagedFolder : '=',
                canSavedModel : '=',
                versionLevelSavedModel : '=',
                canModelEvaluationStore : '=',
                needsPartitions : '=',
                noPartitionSelection : '=',
                datasets : '=',
                savedmodels : '=',
                managedfolders : '=',
                modelevaluationstores : '=',
                actionVerb : '@',
                type : '='
        },
        link : function($scope, element, attrs) {
            $scope.getProjectKeyIfNeeded = function(projectKey) {
                return projectKey && projectKey != $stateParams.projectKey ? projectKey : null;
            };
            $scope.getItemLoc = function(item) {
                return item == null ? null : (item.projectKey || $stateParams.projectKey) + '.' + item.itemId;
            };
            $scope.getDatasetLoc = function(item) {
                return item == null ? null : (item.projectKey || $stateParams.projectKey) + '.' + item.name;
            };
            $scope.getSavedModelLoc = function(item) {
                return item == null ? null : (item.projectKey || $stateParams.projectKey) + '.' + item.id;
            };
            $scope.getManagedFolderLoc = function(item) {
                return item == null ? null : (item.projectKey || $stateParams.projectKey) + '.' + item.id;
            };
            $scope.getModelEvaluationStoreLoc = function(item) {
                return item == null ? null : (item.projectKey || $stateParams.projectKey) + '.' + item.id;
            };

            $scope.partitioning = {};
            $scope.$watch('datasets', function(nv) {
                if (nv == null) return;
                $scope.datasetByLoc = {};
                $scope.datasets.forEach(function(dataset) {$scope.partitioning[$scope.getDatasetLoc(dataset)] = dataset.partitioning;});
                $scope.datasets.forEach(function(dataset) {$scope.datasetByLoc[$scope.getDatasetLoc(dataset)] = dataset;});
            });
            $scope.$watch('savedmodels', function(nv) {
                if (nv == null) return;
                $scope.modelByLoc = {};
                $scope.savedmodels.forEach(function(savedmodel) {$scope.partitioning[$scope.getSavedModelLoc(savedmodel)] = savedmodel.partitioning || {dimensions:[]};});
                $scope.savedmodels.forEach(function(savedmodel) {$scope.modelByLoc[$scope.getSavedModelLoc(savedmodel)] = savedmodel;});
            });
            $scope.$watch('managedfolders', function(nv) {
                if (nv == null) return;
                $scope.folderByLoc = {};
                $scope.managedfolders.forEach(function(managedfolder) {$scope.partitioning[$scope.getManagedFolderLoc(managedfolder)] = managedfolder.partitioning || {dimensions:[]};});
                $scope.managedfolders.forEach(function(managedfolder) {$scope.folderByLoc[$scope.getManagedFolderLoc(managedfolder)] = managedfolder;});
            });
            $scope.$watch('modelevaluationstores', function(nv) {
                if (nv == null) return;
                $scope.evaluationStoreByLoc = {};
                $scope.modelevaluationstores.forEach(function(modelevaluationstore) {$scope.partitioning[$scope.getModelEvaluationStoreLoc(modelevaluationstore)] = modelevaluationstore.partitioning || {dimensions:[]};});
                $scope.modelevaluationstores.forEach(function(modelevaluationstore) {$scope.evaluationStoreByLoc[$scope.getModelEvaluationStoreLoc(modelevaluationstore)] = modelevaluationstore;});
            });

            $scope.getItemDisplayName = function(item) {
                if (!item) return;
                if (item.type == 'DATASET') {
                    return $scope.datasetByLoc[$scope.getItemLoc(item)].name;
                } else if (item.type == 'MANAGED_FOLDER') {
                    return $scope.folderByLoc[$scope.getItemLoc(item)].name;
                } else if (item.type == 'SAVED_MODEL') {
                    return $scope.modelByLoc[$scope.getItemLoc(item)].name;
                } else if (item.type == 'MODEL_EVALUATION_STORE') {
                    return $scope.evaluationStoreByLoc[$scope.getItemLoc(item)].name;
                }
            };

            $scope.addItem = function(type) {
                if (type == 'DATASET') {
                    CreateModalFromTemplate("/templates/scenarios/build_flowitem-new-dataset-modal.html",
                            $scope, "AddDatasetToBuildModalController");
                } else if (type == 'MANAGED_FOLDER') {
                    CreateModalFromTemplate("/templates/scenarios/build_flowitem-new-managedfolder-modal.html",
                            $scope, "AddManagedFolderToBuildModalController");
                } else if (type == 'SAVED_MODEL') {
                    CreateModalFromTemplate("/templates/scenarios/build_flowitem-new-savedmodel-modal.html",
                            $scope, "AddSavedModelToBuildModalController");
                } else if (type == 'MODEL_EVALUATION_STORE') {
                    CreateModalFromTemplate("/templates/scenarios/build_flowitem-new-modelevaluationstore-modal.html",
                            $scope, "AddModelEvaluationStoreToBuildModalController");
                }
            };

            $scope.removeItem = function(i){
                $scope.items.splice(i, 1);
            };

            $scope.getPlaceholder = function(dimension) {
                let format = '';
                if (dimension.type == 'time') {
                    format = 'YYYY';
                    if (dimension.params.period == 'MONTH') {
                        format = 'YYYY-MM';
                    } else if (dimension.params.period == 'DAY') {
                        format = 'YYYY-MM-DD';
                    } else if (dimension.params.period == 'HOUR') {
                        format = 'YYYY-MM-DD-HH';
                    }
                }
                return format;
            };

            $scope.editPartitionSpec = function(item) {
                CreateModalFromTemplate("/templates/scenarios/build_flowitem-edit-partitionspec.html", $scope, null, function(modalScope) {
                    modalScope.item = item;
                    modalScope.flowItemPartitioning = modalScope.partitioning[modalScope.getItemLoc(modalScope.item)];
                    modalScope.newPartition = (item.partitionsSpec === undefined || item.partitionsSpec === null) ? [] : item.partitionsSpec.split('|');

                    modalScope.savePartitionSpec = function() {
                        item.partitionsSpec = modalScope.newPartition.join('|');
                        modalScope.dismiss();
                    }
                });
            };
        }
    };
});
app.directive('stepContinuousActivitiesTable', function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate) {
    return {
        restrict : 'E',
        templateUrl : '/templates/scenarios/fragments/step-continuous-activities-table.html',
        scope : {
                items : '=',
                continuousActivities : '=',
                actionVerb : '@'
        },
        link : function($scope, element, attrs) {
            $scope.$stateParams = $stateParams;

            $scope.addItem = function() {
                CreateModalFromTemplate("/templates/scenarios/start_stop_continuous_activity-new-continuous-activity-modal.html", $scope, "AddContinuousActivityToStartStopModalController");
            };

            $scope.removeItem = function(i){
                $scope.items.splice(i, 1);
            };
        }
    };
});

app.controller("AddContinuousActivityToStartStopModalController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.addToList = function(){
        let idx = - 1;
        for(let i = 0; i < $scope.items.length; i++){
            if($scope.items[i] == $scope.newContinuousActivity){
                idx = i;
            }
        }
        if(idx == -1) {
            $scope.items.push($scope.newContinuousActivity);
        }
        $scope.dismiss();
    };
});


app.controller("AddDashboardToBuildModalController", function($scope, $stateParams, SmartId) {
    $scope.addToList = function() {
    	var locToAdd = SmartId.resolve($scope.newDashboard.id, $scope.newDashboard.projectKey)
        if (!$scope.items.some(itm => angular.equals(SmartId.resolve(itm.smartName, $stateParams.projectKey), locToAdd))) {
            $scope.items.push({
                smartName: SmartId.fromTor(locToAdd, $stateParams.projectKey),
                name: $scope.newDashboard.name
            });
        }
        $scope.dismiss();
    }
});

app.controller("AddDatasetToBuildModalController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.newPartition = [];

    $scope.addToList = function(){
        let idx = - 1;
        for(let i = 0; i < $scope.items.length; i++){
            if($scope.getItemLoc($scope.items[i]) == $scope.getDatasetLoc($scope.newDataset)
            		&& $scope.items[i].partition == $scope.newPartition){
                idx = i;
            }
        }
        if(idx == -1){
            $scope.items.push({
                type:"DATASET",
                projectKey: $scope.getProjectKeyIfNeeded($scope.newDataset.projectKey),
                itemId: $scope.newDataset.name,
                partitionsSpec: $scope.newPartition.join('|')
            });
        }
        $scope.dismiss();
    };

    $scope.$watch('newDataset', function() {
        $scope.flowItemPartitioning = $scope.partitioning[$scope.getDatasetLoc($scope.newDataset)];
    });
});


app.controller("AddManagedFolderToBuildModalController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.newPartition = [];

    $scope.addToList = function() {
        var idx = - 1;
        for(var i = 0; i < $scope.items.length; i++){
            if($scope.getItemLoc($scope.items[i]) == $scope.getManagedFolderLoc($scope.newManagedFolder) && $scope.items[i].partition == $scope.newPartition){
                idx = i;
            }
        }
        if(idx == -1){
            $scope.items.push({
                type:"MANAGED_FOLDER",
                projectKey: $scope.getProjectKeyIfNeeded($scope.newManagedFolder.projectKey),
                itemId: $scope.newManagedFolder.id,
                partitionsSpec: $scope.newPartition.join('|')
            });
        }
        $scope.dismiss();
    };

    $scope.$watch('newManagedFolder', function() {
        $scope.flowItemPartitioning = $scope.partitioning[$scope.getManagedFolderLoc($scope.newManagedFolder)];
    });
});


app.controller("AddSavedModelToBuildModalController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.newPartition = [];

    $scope.addToList = function(){
        var idx = - 1;
        for(var i = 0; i < $scope.items.length; i++){
            if($scope.getItemLoc($scope.items[i]) == $scope.getSavedModelLoc($scope.newSavedModel)){
                idx = i;
            }
        }
        if(idx == -1){
            $scope.items.push({
                type:"SAVED_MODEL",
                projectKey: $scope.getProjectKeyIfNeeded($scope.newSavedModel.projectKey),
                itemId: $scope.newSavedModel.id,
                partitionsSpec: $scope.newPartition.join('|')
            });
        }
        $scope.dismiss();
    };

    $scope.$watch('newSavedModel', function() {
        $scope.flowItemPartitioning = $scope.partitioning[$scope.getSavedModelLoc($scope.newSavedModel)];
    });
});

app.controller("AddModelEvaluationStoreToBuildModalController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.newPartition = [];

    $scope.addToList = function(){
        var idx = - 1;
        for(var i = 0; i < $scope.items.length; i++){
            if($scope.getItemLoc($scope.items[i]) == $scope.getModelEvaluationStoreLoc($scope.newModelEvaluationStore)){
                idx = i;
            }
        }
        if(idx == -1){
            $scope.items.push({
                type:"MODEL_EVALUATION_STORE",
                projectKey: $scope.getProjectKeyIfNeeded($scope.newModelEvaluationStore.projectKey),
                itemId: $scope.newModelEvaluationStore.id,
                partitionsSpec: $scope.newPartition.join('|')
            });
        }
        $scope.dismiss();
    };

    $scope.$watch('newModelEvaluationStore', function() {
        $scope.flowItemPartitioning = $scope.partitioning[$scope.getModelEvaluationStoreLoc($scope.newModelEvaluationStore)];
    });
});


app.controller("BuildFlowItemStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
    	if ( $scope.step.type == 'build_flowitem' && $scope.step.params.builds == null ) {
    		$scope.step.params.builds = [];
    	}
    	if ( $scope.step.type == 'build_flowitem' && $scope.step.params.jobType == null ) {
    		$scope.step.params.jobType = 'RECURSIVE_BUILD';
    	}
    });
});


app.controller("ClearItemsStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'clear_items' && $scope.step.params.clears == null ) {
            $scope.step.params.clears = [];
        }
    });
});

app.controller("InvalidateCacheStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'invalidate_cache' && $scope.step.params.invalidates == null ) {
            $scope.step.params.invalidates = [];
        }
    });
});

app.controller("ReloadSchemaStepController", function($scope) {
    $scope.$watch('step', function() {
        if ($scope.step.type == 'reload_schema' && $scope.step.params.items == null ) {
            $scope.step.params.items = [];
        }
    });
});

app.controller("SchemaPropagationStepController", function($scope) {
    $scope.$watch('step', function() {
        if ($scope.step.type == 'schema_propagation' && $scope.step.params.options == null ) {
            $scope.step.params.options = {
                behavior: 'AUTO_WITH_BUILDS',
                recipeUpdateOptions: {},
                partitionByDim: [],
                partitionByComputable: [],
                excludedRecipes: [],
                markAsOkRecipes: []
            };
        }
    });
});

app.controller("RefreshChartCacheStepController", function($scope) {
    $scope.$watch('step', function() {
        if ($scope.step.type == 'refresh_chart_cache' && !$scope.step.params.dashboards) {
            $scope.step.params.dashboards = [];
        }
    });
});


app.controller("ComputeStatsStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
    	if ( $scope.step.type == 'compute_metrics' && $scope.step.params.computes == null ) {
    		$scope.step.params.computes = [];
    	}
    });
});

app.controller("ComputeDataDriftStepController", function($scope, $stateParams, DataikuAPI) {
    $scope.modelEvaluationStores = []
    DataikuAPI.modelevaluationstores.list($stateParams.projectKey).success(function(data) {
        $scope.modelEvaluationStores = data
    }).error(setErrorInScope.bind($scope));
});

app.controller("CheckDatasetStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
    	if ( $scope.step.type == 'check_dataset' && $scope.step.params.checks == null ) {
    		$scope.step.params.checks = [];
    	}
    });
});


app.controller("CheckConsistencyStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
});


app.controller("SynchronizeHiveStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'sync_hive' && $scope.step.params.syncs == null ) {
            $scope.step.params.syncs = [];
        }
    });
});


app.controller("UpdateFromHiveStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'update_from_hive' && $scope.step.params.syncs == null ) {
            $scope.step.params.syncs = [];
        }
    });
});


app.controller("ExecuteSQLStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
	$scope.connections = [];
    DataikuAPI.sqlNotebooks.listConnections($stateParams.projectKey).success(function(data) {
        $scope.connections = data.nconns; //.filter(function(connection){return connection.type != 'Hive' && connection.type != 'Impala';});
    }).error(setErrorInScope.bind($scope));

    $scope.$watch('step', function() {
        if ( $scope.step.type == 'exec_sql' && $scope.step.params.extraConf == null ) {
    		$scope.step.params.extraConf = [];
    	}
    });
});




app.controller("CustomPythonStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'custom_python' && $scope.step.params.envSelection == null ) {
            $scope.step.params.envSelection = {envMode:'INHERIT'};
        }
    });
});


app.controller("UpdateVariablesStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
});


app.controller("EvaluatedVariablesStepSubcontroller", function($scope) {
    $scope.step.params.definitions = $scope.step.params.definitions || [];

    $scope.removeDefinition = function(index) {
        $scope.step.params.definitions.splice(index, 1);
    };
    $scope.canAddDefinition = function() {
        if ( $scope.step.params.definitions == null || $scope.step.params.definitions.length == 0 ) {
            return true;
        }
        var last = $scope.step.params.definitions[$scope.step.params.definitions.length - 1];
        return (last.key && last.value);
    };
    $scope.addDefinition = function() {
        $scope.step.params.definitions.push({key:'', value:''});
    };
});


app.controller("DefineVariablesStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'define_vars' && $scope.step.params.definitions == null ) {
            $scope.step.params.definitions = [];
        }

        if ( $scope.step.type == 'define_vars' && $scope.step.params.variables == null ) {
            $scope.step.params.variables = {};
        }
    });
});


app.controller("SetProjectVariablesStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'set_project_vars' && $scope.step.params.definitions == null ) {
            $scope.step.params.definitions = [];
        }
        if ( $scope.step.type == 'set_project_vars' && $scope.step.params.variables == null ) {
            $scope.step.params.variables = {};
        }
    });
});


app.controller("SetGlobalVariablesStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'set_global_vars' && $scope.step.params.definitions == null ) {
            $scope.step.params.definitions = [];
        }
        if ( $scope.step.type == 'set_global_vars' && $scope.step.params.variables == null ) {
            $scope.step.params.variables = {};
        }
    });
});


app.controller("ExecuteRunnableStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, PluginConfigUtils) {
    $scope.step.params.config = $scope.step.params.config || {};
    var updatePluginDescs = function() {
        $scope.runnable = null;
        $scope.appConfig.customRunnables.forEach(function(x) {
            if (x.runnableType == $scope.step.params.runnableType) {
                $scope.runnable = x;
            }
        });

        if ($scope.runnable == null) {
            $scope.desc = null;
            $scope.pluginDesc = null;
            $scope.hasSettings = null;
        } else {
            $scope.desc = $scope.runnable.desc;

            PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.step.params.config);
            PluginConfigUtils.setDefaultValues($scope.desc.adminParams, $scope.step.params.adminConfig);

            $scope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
                return x.id == $scope.runnable.ownerPluginId;
            })[0];

            $scope.hasSettings = ($scope.pluginDesc && $scope.pluginDesc.hasSettings) || ($scope.desc.params && $scope.desc.params.length > 0);
        }
    };
    $scope.$watch('step.params.runnableType', function() {
        if ($scope.step.type != 'runnable') {
            return; // don't fixup the step, we're switching the entire step
        }
        $scope.step.params.config = $scope.step.params.config || {};
        $scope.step.params.adminConfig = $scope.step.params.adminConfig || {};
        updatePluginDescs();
    });
    //updatePluginDescs();
});


app.controller("RunOrKillScenarioStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    var completeSelectedObjectFromScenario = function() {
        if ($scope.scenarios == null) return; // not yet ready
        var found = null;
        $scope.scenarios.forEach(function(scenario) {
            if ( scenario.id == $scope.selected.id ) {
                var projectMatches = scenario.projectKey == $scope.selected.projectKey;
                if ( !projectMatches && scenario.projectKey == $stateParams.projectKey && $scope.selected.projectKey == null ) {
                    projectMatches = true;
                }
                if ( projectMatches ) {
                    found = scenario;
                }
            }
        });
        if ( found != null ) {
            $scope.selected = found;
        } else {
            $scope.scenarios.push($scope.selected);
        }
    };
    DataikuAPI.scenarios.listAccessible().success(function(data) {
        $scope.scenarios = data;
        $scope.scenarios.forEach(function(scenario) {
           scenario.foreign = scenario.projectKey != $stateParams.projectKey,
           scenario.displayName = (scenario.name || scenario.id) + (scenario.foreign ? (' ('+scenario.projectKey+')') : '');
        });
        $scope.scenarios.sort(function(a,b){return a.displayName.localeCompare(b.displayName);});
        completeSelectedObjectFromScenario();
    }).error(setErrorInScope.bind($scope));

    $scope.$watch('selected', function(nv) {
        if ( nv == null ) return;
        $scope.step.params.scenarioId = $scope.selected.id;
        $scope.step.params.projectKey = $scope.selected.projectKey != $stateParams.projectKey ? $scope.selected.projectKey : null;
    }, true);
    $scope.$watch('step', function(nv) {
        if ( nv == null ) return;
        $scope.selected = {id : nv.params.scenarioId, projectKey : nv.params.projectKey};
        completeSelectedObjectFromScenario();
    });
});


app.controller("SendReportStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, ScenarioIntegrations) {
    $scope.availableIntegrationTypes = ScenarioIntegrations.integrationTypes;
});

app.controller("PullGitRefsStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, ScenarioIntegrations) {
    DataikuAPI.git.getProjectExternalLibs($stateParams.projectKey).then((result) => {
        $scope.gitReferences = result.data.gitReferences;
    }, setErrorInScope.bind($scope));

    $scope.$watch('step', function() {
        if ($scope.step.type === 'pull_git_refs' && $scope.step.params.updateAll == null) {
            $scope.step.params.updateAll = true;
        }
    });
});

app.controller("PrepareLambdaPackageStepController", function($scope, $stateParams, StringUtils, DataikuAPI) {
    $scope.publishedServiceIds = [];
    DataikuAPI.lambda.services.list($stateParams.projectKey).success(function(data) {
        $scope.services = data;
        $scope.$broadcast("clearMultiSelect");
    }).error(setErrorInScope.bind($scope));

    $scope.ui = {};
    $scope.$watch('ui.selectedPublishedService', function(nv, ov) {
        if (!nv) return;
        $scope.step.params.publishedServiceId = nv.serviceBasicInfo.id;
    }, true);

    let preselectedPublishedService;
    const listPublishedServices = function() {
        DataikuAPI.apideployer.client.listPublishedServices()
        .success(function(response) {
            $scope.publishedServices = response.filter(serviceStatus => serviceStatus.canWrite).sort((a, b) => a.serviceBasicInfo.name.localeCompare(b.serviceBasicInfo.name));
            const suggestedServiceId = $scope.step.params.serviceId &&
                                        StringUtils.transmogrify($scope.step.params.serviceId,
                                        $scope.publishedServices.map(_ => _.serviceBasicInfo.id),
                                        (count, name) => `${name}-${count}`);
            $scope.publishedServices.unshift({createServiceMessage: "Create a new service...", serviceBasicInfo: {}});
            $scope.publishedServiceIds = $scope.publishedServices.map(function(serviceStatus) {
                if (serviceStatus.serviceBasicInfo.id === serviceStatus.serviceBasicInfo.name) return "";
                return serviceStatus.serviceBasicInfo.id;
            });
            preselectedPublishedService = $scope.publishedServices.find(service => service.serviceBasicInfo.id === ($scope.step.params.publishedServiceId || $scope.step.params.serviceId));
            if (!preselectedPublishedService) {
                $scope.publishedServices[0].id = $scope.step.params.publishedServiceId || suggestedServiceId;
                preselectedPublishedService = $scope.publishedServices[0];
            } else {
                $scope.publishedServices[0].id = suggestedServiceId;
            }
            $scope.ui.selectedPublishedService = preselectedPublishedService;
        })
        .error(setErrorInScope.bind($scope));
    }

    $scope.$watch("step.params.publishToAPIDeployer", function(nv, ov) {
        if (nv) {
            if (!$scope.publishedServices) {
                listPublishedServices();
            } else {
                $scope.ui.selectedPublishedService = preselectedPublishedService;
            }
        } else {
            delete $scope.ui.selectedPublishedService;
            delete $scope.step.params.publishedServiceId;
        }
    });
});

app.controller("UpdateAPIDeployerDeploymentStepController", function($scope, DataikuAPI) {
    let deploymentStatusList;
    DataikuAPI.apideployer.client.listDeployments().success(function(data) {
        deploymentStatusList = data;
        $scope.deploymentIds = deploymentStatusList.map(status => status.deploymentBasicInfo.id);
        refreshVersionIds();
    });

    function refreshVersionIds() {
        const deployment = deploymentStatusList.find(status => status.deploymentBasicInfo.id === $scope.step.params.deploymentId);
        if (deployment) {
            $scope.versionIds = deployment.packages.map(p => p.id);
        } else {
            $scope.versionIds = [];
        }
    }

    $scope.$watch("step.params.deploymentId", function(nv, ov) {
        if (nv === ov || !deploymentStatusList) return;
        refreshVersionIds();
    });
});

app.controller("PrepareBundleStepController", function($scope, StringUtils, $stateParams, DataikuAPI) {
    $scope.ui = {};
    $scope.publishedProjectKeys = [];
    $scope.$watch('ui.selectedPublishedProject', function(nv, ov) {
        if (!nv) return;
        $scope.step.params.publishedProjectKey = nv.projectBasicInfo.id;
    }, true);

    let preselectedPublishedProject;
    const listPublishedProjects = function() {
        DataikuAPI.projectdeployer.client.listPublishedProjects()
        .success(function(response) {
            $scope.publishedProjects = response.filter(projectStatus => projectStatus.canWrite).sort((a, b) => a.projectBasicInfo.name.localeCompare(b.projectBasicInfo.name));
            const suggestedProjectKey = StringUtils.transmogrify($stateParams.projectKey,
                                                          $scope.publishedProjects.map(_ => _.projectBasicInfo.id),
                                                          (count, name) => `${name}_${count}`);
            $scope.publishedProjects.unshift({createProjectMessage: "Create a new project...", projectBasicInfo: {}});
            $scope.publishedProjectKeys = $scope.publishedProjects.map(function(projectStatus) {
                if (projectStatus.projectBasicInfo.id === projectStatus.projectBasicInfo.name) return "";
                return projectStatus.projectBasicInfo.id;
            });
            preselectedPublishedProject = $scope.publishedProjects.find(project => project.projectBasicInfo.id === ($scope.step.params.publishedProjectKey || $stateParams.projectKey));
            if (!preselectedPublishedProject) {
                $scope.publishedProjects[0].id = $scope.step.params.publishedProjectKey || suggestedProjectKey;
                preselectedPublishedProject = $scope.publishedProjects[0];
            } else {
                $scope.publishedProjects[0].id = suggestedProjectKey;
            }
            $scope.ui.selectedPublishedProject = preselectedPublishedProject;
        })
        .error(setErrorInScope.bind($scope));
    }

    $scope.$watch("step.params.publishOnDeployer", function(nv, ov) {
        if (nv) {
            if (!$scope.publishedProjects) {
                listPublishedProjects();
            } else {
                $scope.ui.selectedPublishedProject = preselectedPublishedProject;
            }
        } else {
            delete $scope.step.params.publishedProjectKey;
            delete $scope.ui.selectedPublishedProject;
        }
    });
});

app.controller("UpdateProjectDeployerDeploymentStepController", function($scope, DataikuAPI) {
    let deploymentStatusList;
    DataikuAPI.projectdeployer.client.listDeployments().success(function(data) {
        deploymentStatusList = data;
        $scope.deploymentIds = deploymentStatusList.map(status => status.deploymentBasicInfo.id);
        refreshBundleIds();
    });

    function refreshBundleIds() {
        const deployment = deploymentStatusList.find(status => status.deploymentBasicInfo.id === $scope.step.params.deploymentId);
        if (deployment) {
            $scope.bundleIds = deployment.packages.map(p => p.id);
        } else {
            $scope.bundleIds = [];
        }
    }

    $scope.$watch("step.params.deploymentId", function(nv, ov) {
            if (nv === ov || !deploymentStatusList) return;
            refreshBundleIds();
        });
});

app.controller("PluginPythonStepController", function($scope, $controller, $stateParams, Assert, DataikuAPI, $state, TopNav, CreateModalFromTemplate, PluginConfigUtils) {
    $scope.$watch('step', function() { // do a watch on step because angular reuses controllers so you need to detect pystep1 -> pystep2 switches
        if (!$scope.step.unavailable && $scope.step.type.startsWith('pystep_')) { // only for pystep_..., otherwise you arrive here when switching to a non-pystep
            $scope.loadedDesc = $scope.appConfig.customPythonPluginSteps.filter(function(x){
                return x.stepType == $scope.step.type;
            })[0];
    
            $scope.desc = $scope.loadedDesc.desc;
    
            // put default values in place
            PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.step.params.config);
    
            $scope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
                return x.id == $scope.loadedDesc.ownerPluginId;
            })[0];
        }
    });
});


app.controller("PluginPythonTriggerController", function($scope, $controller, $stateParams, Assert, DataikuAPI, $state, TopNav, CreateModalFromTemplate, PluginConfigUtils) {
    $scope.loadedDesc = $scope.appConfig.customPythonPluginTriggers.filter(function(x){
        return x.triggerType == $scope.trigger.type;
    })[0];

    if ($scope.loadedDesc) {

        $scope.desc = $scope.loadedDesc.desc;

        // put default values in place
        PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.trigger.params.config);

        $scope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
            return x.id == $scope.loadedDesc.ownerPluginId;
        })[0];
    } else {
        $scope.unavailable = true;
        $scope.unavailablePluginId = $scope.trigger.type.split('_')[1];
    }
});

app.controller("SetUpClusterStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, PluginConfigUtils) {
    $scope.clusterTypes = [];
    $scope.appConfig.customPythonPluginClusters.forEach(function(t) {
        $scope.clusterTypes.push({id:t.clusterType, label:t.desc.meta.label || t.id, architecture:t.desc.architecture || 'HADOOP'})
    });
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'set_up_cluster' && $scope.step.params.clusterParams == null) {
            $scope.step.params.clusterParams = {config:{}};
        }
    });
});

app.controller("TearDownClusterStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.clusterShutdownModes = [{id:'NEVER', label:'No (only disassociate variable)'}, {id:'ALWAYS', label:'Always (if created by a scenario)'}, {id:'IF_EXISTS', label:'If it exists (and is created by a scenario)'}, {id:'IF_STARTED_BY_SCENARIO', label:'If created by this scenario'}];
    $scope.$watch('step', function() {
        if ( $scope.step.type == 'tear_down_cluster' && $scope.step.params.mode == null ) {
            $scope.step.params.mode = 'IF_STARTED_BY_SCENARIO';
        }
    });
});

app.controller("StartContinuousActivityStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, ScenarioIntegrations) {
    DataikuAPI.continuousActivities.listProjectStates($stateParams.projectKey).success(function (data) {
        $scope.continuousActivities = data.activities;
    }).error(setErrorInScope.bind($scope));

    $scope.$watch('step', function() {
        if ($scope.step.type === 'start_continuous_activity' && $scope.step.params.continuousActivityIds == null) {
            $scope.step.params.continuousActivityIds = [];
        }
        if ($scope.step.type === 'start_continuous_activity' && $scope.step.params.loopParams == null) {
            $scope.step.params.loopParams = {};
        }
    });
});

app.controller("StopContinuousActivityStepController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, ScenarioIntegrations) {
    DataikuAPI.continuousActivities.listProjectStates($stateParams.projectKey).success(function (data) {
        $scope.continuousActivities = data.activities;
    }).error(setErrorInScope.bind($scope));

    $scope.$watch('step', function() {
        if ($scope.step.type === 'start_continuous_activity' && $scope.step.params.continuousActivityIds == null) {
            $scope.step.params.continuousActivityIds = [];
        }
    });
});


app.controller("TemporalTriggerController", function($rootScope, $scope, DataikuAPI) {
    $scope.repeatCount = 0;
    $scope.frequencyOptions = [['Monthly', 'months'], ['Weekly', 'weeks'], ['Daily', 'days'], ['Hourly', 'hours'], ['Minutely', 'minutes']];
    $scope.monthyOptions = [[0, 0]];
    $scope.repeatFrequencyMax = 2147483647;
    $scope.startingFrom = new Date($scope.trigger.params.startingFrom);

    $scope.$on('scenario-save', () => {
        if($scope.trigger.params.frequency === 'Weekly' && $scope.trigger.params.daysOfWeek.length === 0) {
            $scope.trigger.params.daysOfWeek.push(getDayLabels((new Date()).getDay()));
        }
    });

    $scope.time = new Date();
    $scope.time.setMilliseconds(0);
    $scope.time.setSeconds(0);
    $scope.time.setMinutes($scope.trigger.params.minute);
    $scope.time.setHours($scope.trigger.params.hour);

    // Force format HH:mm for firefox
    $scope.twoDecimals = function (n) {
        if (n < 10) {
            return "0" + n;
        } else {
            return n;
        }
    };
    $scope.getHHmm = () => {
      return ('0' + ($scope.trigger.params.hour || 0)).slice(-2) + ':' + ('0' + ($scope.trigger.params.minute || 0)).slice(-2);
    };
    $scope.timezone_ids = [];
    DataikuAPI.timezone.shortlist().success(function(data){
        $scope.timezone_ids = [['SERVER', 'Server timezone'], ...data.ids.map(i => [i, i])];
    }).error(setErrorInScope.bind($rootScope));

    $scope.shouldDisplayStartingAt = () => {
        return $scope.trigger.params.frequency !== 'Minutely';
    };

    $scope.shouldDisplayTime = () => {
        return ['Hourly', 'Minutely'].includes($scope.trigger.params.frequency);
    };

    $scope.shouldDisplayMonthDayPicker = () => {
        return $scope.trigger.params.frequency === 'Monthly';
    };

    $scope.shouldDisplayWeekDayPicker = () => {
        return $scope.trigger.params.frequency === 'Weekly';
    };

    $scope.shouldDisplayRunAt = () => {
        return ['Monthly', 'Weekly', 'Daily'].includes($scope.trigger.params.frequency);
    };

    $scope.shouldDisplayTimezone = () => {
        return $scope.trigger.params.frequency !== 'Minutely';
    };


    $scope.timeChanged = () => {
        $scope.trigger.params.minute = $scope.time.getMinutes();
        $scope.trigger.params.hour = $scope.time.getHours();
    };

    $scope.getMonthlyRunOn = () => {
        const weekLabels = [['FIRST_WEEK', 'First'], ['SECOND_WEEK', 'Second'], ['THIRD_WEEK', 'Third'], ['FOURTH_WEEK', 'Fourth']];
        const day = $scope.startingFrom.getDate();
        const dayOfWeek =  $scope.startingFrom.getDay();
        // "day - 1" the the 7th day is still part of the first week
        const weekOfMonth = Math.floor((day - 1) / 7);

        // Because we love JS consistance, the method to get the max number of the day in a month need a real month and a real year
        var year = $scope.startingFrom.getYear();
        if (year < 1900) {
            year = year + 1900
        }
        var month = $scope.startingFrom.getMonth() + 1;
        const maxDayOfMonth = new Date(year, month, 0).getDate();


        const options = [['ON_THE_DAY', 'On day ' + day]];
        if (weekOfMonth < 4) { // We do not want to print the fifth week
            options.push([weekLabels[weekOfMonth][0], `On the ${weekLabels[weekOfMonth][1]} ${getDayLabels(dayOfWeek)}`]);
        }
        // If we are in the last 7 day of the months
        if (day > maxDayOfMonth - 7) {
            options.push(['LAST_WEEK', `On the last ${getDayLabels(dayOfWeek)}`]);
        }

        // Check if we are ont he last day of the months
        if (new Date($scope.startingFrom.getTime() + 86400000).getDate() === 1) {
            options.push(['LAST_DAY_OF_THE_MONTH', `On the last day of the month`]);
        }
        $scope.monthyOptions = options;
    }

    $scope.$watch('[trigger.params.frequency,startingFrom]', (nv, ov) => {
        $scope.repeatFrequencyMax = 2147483647;
        $scope.trigger.params.startingFrom = $scope.startingFrom.toISOString();

        if($scope.trigger.params.frequency === 'Monthly') {
            $scope.getMonthlyRunOn();
        }
        if (nv === ov) {
            return;
        }

        // Force the "Run on" to be on a value.
        var currentOptions = $scope.monthyOptions.map(function(x) {
            return x[0];
        });
        if (!$scope.trigger.params.monthlyRunOn || !currentOptions.includes($scope.trigger.params.monthlyRunOn)) {
            $scope.trigger.params.monthlyRunOn = $scope.monthyOptions[0][0];
        }
    });
});

app.controller("DatasetModifiedTriggerController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.trigger.params.triggerWhenAllFire = $scope.trigger.params.triggerWhenAllFire || false;
});


app.controller("FollowScenarioRunTriggerController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
    $scope.selected = {id : $scope.trigger.params.scenarioId, projectKey : $scope.trigger.params.projectKey};

    DataikuAPI.scenarios.listAccessible().success(function(data) {
        $scope.scenarios = data;
        // exclude the current scenario, for obvious reasons
        $scope.scenarios = data.filter(function(scenario) {
            return !(scenario.id === $stateParams.scenarioId && scenario.projectKey === $stateParams.projectKey);
        });

        $scope.scenarios.forEach(function(scenario) {
           scenario.foreign = scenario.projectKey != $stateParams.projectKey,
           scenario.displayName = (scenario.name || scenario.id) + (scenario.foreign ? (' ('+scenario.projectKey+')') : '');
        });
        $scope.scenarios.sort(function(a,b){return a.displayName.localeCompare(b.displayName);});
        var found = null;
        $scope.scenarios.forEach(function(scenario) {
            if ( scenario.id == $scope.selected.id ) {
                var projectMatches = scenario.projectKey == $scope.selected.projectKey;
                if ( !projectMatches && scenario.projectKey == $stateParams.projectKey && $scope.selected.projectKey == null ) {
                    projectMatches = true;
                }
                if ( projectMatches ) {
                    found = scenario;
                }
            }
        });
        if ( found != null ) {
            $scope.selected = found;
        } else {
            $scope.scenarios.push($scope.selected);
        }
    }).error(setErrorInScope.bind($scope));

    $scope.$watch('selected', function(nv) {
        if ( nv == null ) return;
        $scope.trigger.params.scenarioId = $scope.selected.id;
        $scope.trigger.params.projectKey = $scope.selected.projectKey != $stateParams.projectKey ? $scope.selected.projectKey : null;
        if ($scope.trigger.params.projectKey == null) {
            delete $scope.trigger.params.projectKey; // to match the state we compare to when checking dirtyness
        }
    }, true);
});


app.controller("SQLQueryTriggerController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate) {
	$scope.connections = [];
    DataikuAPI.sqlNotebooks.listConnections($stateParams.projectKey).success(function(data) {
        $scope.connections = data.nconns; //.filter(function(connection){return connection.type != 'Hive' && connection.type != 'Impala';});
    }).error(setErrorInScope.bind($scope));

    $scope.$watch('trigger.params.hasLimit', function(nv, ov){
        if (nv != ov && !$scope.trigger.params.limit) {
            $scope.trigger.params.limit = 10000;
        }
    });
});

app.service("ScenarioIntegrations", function(){
    var integrationTypes = [
            {"id" : "mail-scenario", "label" : "Mail"},
            {"id" : "slack-scenario", "label" : "Slack"},
            {"id" : "msft-teams-scenario", "label": "Microsoft Teams"},
            {"id" : "webhook-scenario", "label" : "Webhook"},
            {"id" : "twilio-scenario", "label" : "Twilio"},
            {"id" : "shell-scenario", "label" : "Shell command"},
            {"id" : "dataset-scenario", "label" : "Send to dataset"}
    ]

    var getLabelByType = function(type) {
        const integration = integrationTypes.find(element => element.id === type);
        return integration === undefined ? type : integration.label;
    }
    return {integrationTypes: integrationTypes, getLabelByType: getLabelByType};
});


app.directive("scenarioMessagingEditor", function($stateParams, DataikuAPI, CreateModalFromTemplate, ScenarioIntegrations){
    return {
        scope : true,
        link : function($scope, element, attrs) {
            $scope.integrationTypes = ScenarioIntegrations.integrationTypes;
            $scope.$watch(attrs.messaging, function(nv, ov){
                if (nv) {
                    $scope.messaging = nv;
                }
            })
        }
    }
});


app.controller("ReporterController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, $timeout, $parse) {
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
    $scope.$watch("reporter.messaging.configuration.channelId", function() {
        if ( $scope.codeMirror ) {
            $timeout(function() {$scope.codeMirror.refresh();});
        }
    }, true);

    $scope.editCustomVariablesCode = function() {
        CreateModalFromTemplate("/templates/scenarios/edit-custom-variables-code-modal.html", $scope, "EditCustomVariablesCodeController", function(newScope){
        	newScope.variablesCode = $scope.reporter.variablesCode;
        	if ( newScope.variablesCode == null ) {
        		newScope.variablesCode = 'import json\n'
        			                    +'# compute your additional variables from the list of report items \n'
										+'# and return them as a dictionary.\n'
										+'def get_variables(items_json, scenario_run_json, step_run_output_json):\n'
										+'    items = json.loads(items_json)\n'
										+'    return {}'
        	}
        }).then(function(value) {$scope.reporter.variablesCode = value;});
    };

    if ($scope.reporter.messaging == null) {
    	$scope.reporter.messaging = {};
    }
});


app.directive("messagingVariablesBehavior", function(){
    return {
        link : function($scope, element, attrs){

            $scope.$watch("reporter.phase", function(nv, ov){
                if (nv == "START") {
                    $scope.availableVariables = [
                        { name : 'triggerName', title : 'Name of the scenario trigger'},
                        { name : 'triggerType', title : 'Type of the scenario trigger'}
                    ];
                } else if( nv == "END") {
                    $scope.availableVariables = [
                        { name : 'scenarioName', title : 'Name of the scenario'},
                        { name : 'triggerName', title : 'Name of the scenario trigger'},
                        { name : 'triggerType', title : 'Type of the scenario trigger'},

                        { name : 'outcome', title : 'Scenario result'},

                        { name : 'allEventsSummary', title : 'Textual summary of all events in the scenario'},
                        { name : 'warningsEventsSummary', title : 'Textual summary of events with warnings'},
                        { name : 'failedEventsSummary', title : 'Textual summary of failed events'},

                        { name : 'allStepsCount', title : '# of steps'},
                        { name : 'successStepsCount', title : '# of successful steps'},
                        { name : 'warningStepsCount', title : '# of steps with warning'},
                        { name : 'failedStepsCount', title : '# of failed steps'},

                        { name : 'allJobsCount', title : '# of Jobs'},
                        { name : 'successJobsCount', title : '# of successful Jobs'},
                        { name : 'warningJobsCount', title : '# of Jobs with warning'},
                        { name : 'failedJobsCount', title : '# of failed Jobs'},

                        { name : 'allBuiltDatasetsCount', title : '# of Built datasets'},
                        { name : 'successBuiltDatasetsCount', title : '# of successfully built datasets'},
                        { name : 'warningBuiltDatasetsCount', title : '# of datasets builts with warnings'},
                        { name : 'failedBuiltDatasetsCount', title : '# of failed Datasets builds'},

                        { name : 'firstFailedStepName', title : 'Name of first failed step'},
                        { name : 'firstFailedJobName', title : 'Name of first failed build job'},

                        { name : 'dssURL', title : 'URL of the DSS instance'},
                        { name : 'scenarioRunURL', title : 'URL of the scenario run report'}
                    ];
                }
            });
        }
    }
});


app.directive("scenarioIntegrationParams", function(DataikuAPI){
    return {
        scope : {
            messaging : '=',
            reporter : '=',
            availableVariables : '=',
            datasets : '=',
            managedfolders : '=',
            datasetSmartNames : '=',
            form: '='
        },
        templateUrl : '/templates/scenarios/integrations/integration-params.html',
        link : function($scope, element, attrs) {

            DataikuAPI.scenarios.listReportTemplates().success(function(data){
                $scope.reportTemplates = data;
            }).error(setErrorInScope.bind($scope));

            $scope.$watch("messaging.type", function() {
                $scope.messaging.configuration = $scope.messaging.configuration || {};
                if ($scope.messaging.type) {
                    let messaging = $scope.messaging;
                    let messagingConf = $scope.messaging.configuration;
                    switch (messaging.type) {
                        case "slack-scenario":
                            messagingConf.message = messagingConf.message || "DSS Scenario <${scenarioRunURL}|${scenarioName}>"
                                + " triggered by ${triggerName} : ${outcome} "
                                + "${if(outcome == 'SUCCESS', ':white_check_mark:', '')}"
                                + "${if(outcome == 'FAILED', ':red_circle:', '')}"
                                + "${if(outcome == 'WARNING', ':red_circle:', '')}"
                                + "${if(outcome == '' || outcome == 'N/A', ':bell:', '')}";
                            messagingConf.blocks = messagingConf.blocks || '[\n'
                                + '    {\n'
                                + '        "type": "section",\n'
                                + '        "text": {\n'
                                + '            "type": "mrkdwn",\n'
                                // Next message must be in one line.
                                + '            "text": "*DSS Scenario <${scenarioRunURL}|${scenarioName}>:* ${outcome} '
                                + '${if(outcome == \'SUCCESS\', \':white_check_mark:\', \'\')}'
                                + '${if(outcome == \'FAILED\', \':red_circle:\', \'\')}'
                                + '${if(outcome == \'WARNING\', \':red_circle:\', \'\')}'
                                + '${if(outcome == \'\' || outcome == \'N/A\', \':bell:\', \'\')}"\n'
                                + '        }\n'
                                + '    },\n'
                                + '    {\n'
                                + '        "type": "context",\n'
                                + '        "elements": [\n'
                                + '            {\n'
                                + '                "type": "mrkdwn",\n'
                                + '                "text": "Triggered by ${triggerName}"\n'
                                + '            }\n'
                                + '        ]\n'
                                + '    }\n'
                                + ']\n';
                            break;

                        case "mail-scenario":
                            messagingConf.subject = messagingConf.subject || "DSS scenario ${scenarioName}: ${outcome}";
                            messagingConf.messageSource = messagingConf.messageSource || "TEMPLATE_FILE";
                            messagingConf.templateName = messagingConf.templateName || "default.ftl";
                            messagingConf.templateFormat = messagingConf.templateFormat || "FREEMARKER";
                            break;

                        case "webhook-scenario":
                            messagingConf.method = messagingConf.method || "POST";
                            messagingConf.mime = messagingConf.mime || "application/json";
                            messagingConf.payload = messagingConf.payload || '{ "success" : "${outcome}", "addYourOwn" : "payload"}';
                            break;

                        case "msft-teams-scenario":
                            messagingConf.message = messagingConf.message ||
                                "${if(outcome == 'SUCCESS', '&#x2705;', '')}"
                                + "${if(outcome == 'FAILED', '&#x1F534;', '')}"
                                + "${if(outcome == 'WARNING', '&#x1F536;', '')}"
                                + "${if(outcome == '' || outcome == 'N/A', '&#x1F514;', '')}"
                                + " DSS Scenario [${scenarioName}](${scenarioRunURL})"
                                + " triggered by ${triggerName}: **${outcome}**";
                            break;

                        case "twilio-scenario":
                            messagingConf.message = messagingConf.message || "DSS Scenario ${scenarioName} triggered by ${triggerName}: ${outcome}";
                            break;
                    }
                }
            });
        }
    }
});


app.controller("WebhookMessagingController", function($scope, CodeMirrorSettingService) {
    $scope.mimeTypes = [
        'text/plain',
        'text/html',
        'application/json',
        'application/xml',
        'application/x-www-form-urlencoded'
    ];
    $scope.methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

    $scope.editorOptions = {
        mode : 'text/plain',
        lineNumbers : true,
        matchBrackets : false,
        onLoad : function(cm) {$scope.codeMirror = cm;}
    };

    $scope.htmlEditorOptions = CodeMirrorSettingService.get('text/html', {onLoad: function(cm) {$scope.codeMirror = cm;}});

    $scope.jsonEditorOptions = CodeMirrorSettingService.get('application/json', {onLoad: function(cm) {$scope.codeMirror = cm;}});

    $scope.xmlEditorOptions = CodeMirrorSettingService.get('application/xml', {onLoad: function(cm) {$scope.codeMirror = cm;}});
});

app.controller("MicrosoftTeamsMessagingController", function($scope, CodeMirrorSettingService) {
    $scope.jsonEditorOptions = CodeMirrorSettingService.get('application/json', {onLoad: function(cm) {$scope.codeMirror = cm;}});

});

app.controller("AttachmentsController", function($scope, $controller, $stateParams, $state, $timeout, $parse, DataikuAPI, TopNav,
		CreateModalFromTemplate, RMARKDOWN_ALL_OUTPUT_FORMATS, $rootScope) {

    $scope.messaging.configuration.attachments = $scope.messaging.configuration.attachments || [];

    var availableAttachmentTypeNames = {
        LOG:'Scenario log',
        DATASET:'Dataset data',
        FOLDER:'Folder contents',
        FOLDER_ITEM:'File in folder',
        NOTEBOOK_EXPORT:'Notebook export',
        RMARKDOWN_REPORT: 'RMarkdown report'
    };

    if ($rootScope.appConfig.graphicsExportsEnabled) {
        availableAttachmentTypeNames.DASHBOARD_EXPORT = 'Dashboard export';
        availableAttachmentTypeNames.WIKI_EXPORT = 'Wiki article export';
        availableAttachmentTypeNames.ANALYSIS_MODEL_DOCUMENTATION_EXPORT = 'Analysis model documentation export';
        availableAttachmentTypeNames.SAVED_MODEL_DOCUMENTATION_EXPORT = 'Saved model documentation export';
    }

    $scope.availableAttachmentTypes = Object.keys(availableAttachmentTypeNames);

    var availableAttachmentTypeDefaultParams = {
        RMARKDOWN_REPORT: {rmdOutputFormat: 'PDF_DOCUMENT', useLatestSnapshotIfItContainsFormat: true},
        NOTEBOOK_EXPORT: {mode: "USE_LATEST"},
        WIKI_EXPORT: {exportType: 'WHOLE_WIKI', exportFormat: { paperSize: 'A4'}},
    };

    $scope.rmdOutputFormats = RMARKDOWN_ALL_OUTPUT_FORMATS;

    $scope.removeAttachment = function(attachment) {
		var index = $scope.messaging.configuration.attachments.indexOf(attachment);
		if (index >= 0) {
			$scope.messaging.configuration.attachments.splice(index, 1);
		}
    };

    $scope.addAttachment = function(type) {
    	$scope.messaging.configuration.attachments.push({
            type:type,
            params: availableAttachmentTypeDefaultParams[type] || {}
        });
    };

    $scope.getAttachmentTypeDisplayName = function(type) {
    	return availableAttachmentTypeNames[type];
    };
});


app.controller("AttachmentController", function($scope, $rootScope, $state, $stateParams, DataikuAPI, ExportService) {
	$scope.appConfig = $rootScope.appConfig;

	var updateForType = function() {
        if ($scope.attachment.type == 'DATASET') {
            let setExportParams = function(params) {
                $scope.attachment.params.exportParams = params;
            }
            ExportService.initExportBehavior($scope, {}, {advancedSampling : true, partitionListLoader: null},
                $scope.attachment.params, null, $scope.attachment.params.exportParams, setExportParams);
        }
	};

    $scope.$watch('attachment.type', function() {
        updateForType();
    });
    updateForType();

    var updateDataset = function() {
        if ($scope.datasets && $scope.attachment.params.attachedDataset) {
            $scope.dataset = $scope.datasets.filter(function(d) {return d.name == $scope.attachment.params.attachedDataset;})[0];
        } else {
            $scope.dataset = null;
        }
    };
    $scope.$watch('attachment.params.attachedDataset', function() {
        updateDataset();
    });
    $scope.$watch(function() {return $scope.datasets != null;}, function() {
        updateDataset();
    });
    updateDataset();
});


app.controller("ReporterMessageController", function($scope, CodeMirrorSettingService) {

    $scope.editorOptions = CodeMirrorSettingService.get('text/plain', {onLoad: function(cm) {$scope.codeMirror = cm;}});

    $scope.htmlEditorOptions = CodeMirrorSettingService.get('text/html', {onLoad: function(cm) {$scope.codeMirror = cm;}});
});


app.controller("EditCustomVariablesCodeController", function($scope, CodeMirrorSettingService) {
	$scope.editorOptions = CodeMirrorSettingService.get('text/x-python', {onLoad: function(cm) {$scope.codeMirror = cm;}});

    $scope.keep = function() {
		$scope.resolveModal($scope.variablesCode);
	};
});

app.directive("newCustomPythonStepMenu", function(GlobalProjectActions, $filter){
    return {
        scope : false,
        link : function($scope, element, attrs) {
            $scope.title = attrs.title;

            var elementsByPlugin = {}

            if ( $scope.appConfig.customPythonPluginSteps ) {
                $scope.appConfig.customPythonPluginSteps.forEach(function(x){
                    var pluginSection = elementsByPlugin[x.ownerPluginId];
                    if (pluginSection == null) {
                        pluginSection = {
                                pluginId : x.ownerPluginId,
                                items : []
                        };
                        elementsByPlugin[x.ownerPluginId] = pluginSection;
                    }
                    pluginSection.items.push(x)
                });
            }

            var pluginSections = [];

            $.each(elementsByPlugin, function(pluginId, pluginData){
                var plugin = Array.dkuFindFn($scope.appConfig.loadedPlugins, function(n){
                    return n.id == pluginData.pluginId
                });
                if ( plugin == null ) return;
                pluginData.items.forEach(function(dtype){
                    if (!dtype.icon) dtype.icon = plugin.icon;
                });
                pluginSections.push({
                    plugin : plugin,
                    items : pluginData.items
                });
            });

            $scope.create = function(item) {
            };

            // flatten to put in a non-hierarchical dropdown
            var ret = [];
            pluginSections.forEach(function(pluginSection) {
                var plugin = pluginSection.plugin;
                ret.push({divider:true});
                ret.push({
                    isSection:true,
                    id : "plugin_" + plugin.id,
                    icon : plugin.icon,
                    label : plugin.label || plugin.id
                });
                pluginSection.items.forEach(function(x) {
                    ret.push({
                        type : x.stepType,
                        label : x.desc.meta != null && x.desc.meta.label != null ? x.desc.meta.label : x.ownerPluginId,
                        icon : (x.desc.meta != null ? x.desc.meta.icon : null) || plugin.icon,
                        desc : x
                    });
                });
            });

            $scope.displayedCustomPythonSteps = ret;
        }
    }
});

app.directive("newCustomPythonTriggerMenu", function(GlobalProjectActions, $filter){
    return {
        scope : false,
        link : function($scope, element, attrs) {
            $scope.title = attrs.title;

            var ret = [];

            var pluginSections = {}

            if ( $scope.appConfig.customPythonPluginTriggers ) {
                $scope.appConfig.customPythonPluginTriggers.forEach(function(x){
                    var pluginSection = pluginSections[x.ownerPluginId];
                    if (pluginSection == null) {
                        pluginSection = {
                                pluginId : x.ownerPluginId,
                                items : []
                        };
                        pluginSections[x.ownerPluginId] = pluginSection;
                    }

                    pluginSection.items.push({
                        type : x.triggerType,
                        label : x.desc.meta != null && x.desc.meta.label != null ? x.desc.meta.label : x.ownerPluginId,
                                icon : x.desc.meta != null ? x.desc.meta.icon : null,
                                        desc : x
                    })
                });
            }

            $.each(pluginSections, function(pluginId, pluginData){
                var plugin = Array.dkuFindFn($scope.appConfig.loadedPlugins, function(n){
                    return n.id == pluginData.pluginId
                });
                if ( plugin == null ) return;
                pluginData.items.forEach(function(dtype){
                    if (!dtype.icon) dtype.icon = plugin.icon;
                });
                var section = {
                        isSection : true,
                        id : "plugin_" + plugin.id,
                        icon : plugin.icon,
                        label : plugin.label || plugin.id,
                        items : pluginData.items
                    };
                // add an item to point to the doc
                section.items.splice(0, 0, {isInfo : true, pluginId : plugin.id});
                ret.push(section);
            });

            $scope.displayedItems = ret;
        }
    }
});

app.directive("mailAttachment", function(DataikuAPI){
    return {
        scope : true,
        templateUrl : '/templates/scenarios/integrations/mail-attachment.html',
        link : function($scope, element, attrs) {
        	$scope.$watch(attrs.mailAttachment, function(nv, ov) {
        		$scope.attachment = $scope.$eval(attrs.mailAttachment);
        	});
        }
    }
});


app.controller("AddToScenarioModalController", function($scope, $stateParams, $rootScope, $state, $timeout,
    DataikuAPI, CreateModalFromTemplate, TaggableObjectsUtils) {

    $scope.selectedObjects = $scope.getSelectedTaggableObjectRefs().filter(
        tor => TaggableObjectsUtils.isComputable(tor) && TaggableObjectsUtils.isLocal(tor)
    );

    $scope.commonTaggableType = TaggableObjectsUtils.getCommonType($scope.selectedObjects, it => it.type);

    $scope.options = {
        creation: false,
        action: 'build_flowitem'
    };

    $scope.fillId = function() {
        if (!$scope.options.scenarioName || $scope.options.scenarioId) return;
        $scope.options.scenarioId = $scope.options.scenarioName.replace(/\W+/g, '').toUpperCase();
    };

    $scope.add = function() {
        DataikuAPI.scenarios.addToScenario($scope.selectedObjects, $scope.options)
            .success(function() {
                $scope.resolveModal();
                $state.go('projects.project.scenarios.scenario.steps', {scenarioId: $scope.options.scenarioId}).then(function(data) {
                    // GRUIK GRUIK
                    $timeout(function(){
                        const stepScope = $('.step-list li:last-child').scope();
                        stepScope.editStep(stepScope.step);
                    }, 600);
                });
            })
            .error(setErrorInScope.bind($scope));
    };
});

app.controller("RetrieveActiveModelVersionFromDeploymentController", function($scope, DataikuAPI) {
    $scope.uiState = {
        deploymentStatusList: [],
        currentEndpoints: []
    };

    if (!$scope.step.params.variableName) {
        $scope.step.params.variableName = "activeModelVersion";
    }

    function getPackageFromCurrentDeployment(currentDeploymentStatus) {
        const generation = currentDeploymentStatus.deploymentBasicInfo.generationsMapping.entries
            .reduce((prev,current) => prev?((prev.proba > current.proba)?prev:current):current,
            { generation: "unknown", proba: -1 }).generation;
        return currentDeploymentStatus.packages.find(p => p.id === generation);
    }

    let deploymentStatusList;
    DataikuAPI.apideployer.client.listDeployments()
        .success(data => {
            deploymentStatusList = data;
            $scope.uiState.deploymentsStatusList = deploymentStatusList.map(status => status.deploymentBasicInfo.id);
            refreshEndpoints();
        })
        .error(setErrorInScope.bind($scope));

    function refreshEndpoints() {
        const deployment = deploymentStatusList.find(status => status.deploymentBasicInfo.id === $scope.step.params.deploymentId);
        if (deployment) {
            $scope.uiState.currentEndpoints = (getPackageFromCurrentDeployment(deployment) || {endpoints: []}).endpoints.map(endpoint => endpoint.id);
        } else {
            $scope.uiState.currentEndpoints = [];
        }
    }

    $scope.$watch("step.params.deploymentId", function(nv, ov) {
        if (nv === ov || !deploymentStatusList) return;
        refreshEndpoints();
    });
});

app.directive('selectAnalysisModelForm', function(DataikuAPI, ActiveProjectKey, $filter) {
    function getAnalysisModelDescription(modelVersion) {
        let details = [];
        modelVersion.auc && details.push("AUC : " + modelVersion.auc.toFixed(3));
        modelVersion.silhouette && details.push("Silhouette : " + modelVersion.silhouette.toFixed(3));
        if (modelVersion.trainInfo.state == 'DONE' && modelVersion.trainInfo.endTime) {
            details.push("Done " + $filter('friendlyTimeDelta')(modelVersion.trainInfo.endTime)
            + " (" + $filter("friendlyDate")(modelVersion.trainInfo.endTime, 'yyyy-MM-dd HH:mm:ss') +")");
        }
        return details.join(', ');
    }

    function getModelSnippetsAPI(taskType) {
        switch(taskType) {
            case "CLUSTERING": return DataikuAPI.analysis.cml.getModelSnippets;
            case "PREDICTION": return DataikuAPI.analysis.pml.getModelSnippets;
            default : return null;
        }
    }

    return {
        scope: {
            params: '=',
        },
        templateUrl: '/templates/scenarios/fragments/select-analysis-model-form.html',
        link: ($scope, element, attrs, formCtrl) => {
            $scope.hooks = {mlTask: null};
            $scope.mlTasks = [];

            function cleanVersions() {
                $scope.models = [];
                $scope.descriptions = [];
            }
            function cleanMLTask() {
                cleanVersions();
                $scope.hooks.mlTask = null;
            }
            function cleanAll() {
                cleanMLTask();
                $scope.mlTasks = [];
            }

            function getMLTasks(analysisId) {
                analysisId && DataikuAPI.analysis.getSummary(ActiveProjectKey.get(), analysisId, true)
                .success(data => {
                    $scope.mlTasks = data.mlTasks;
                    setMLTask($scope.params.mlTaskId)
                })
                .error(setErrorInScope.bind($scope));
            }

            function setMLTask(mlTaskId) {
                if (!mlTaskId) return;

                const mlTask = $scope.hooks.mlTask
                if (mlTask && mlTask.mlTaskId == mlTaskId) return; // hooks.mlTask already has expected value

                const result = $scope.mlTasks.filter(m => m.mlTaskId == mlTaskId);
                if (result && result.length) $scope.hooks = {mlTask: result[0]};
            }

            function getAnalysisModels(analysisId, mlTaskId, mlTaskType) {
                const getModelSnippets = getModelSnippetsAPI(mlTaskType);
                if (!mlTaskId || !getModelSnippets) return;

                $scope.params.mlTaskType = mlTaskType;
                $scope.params.mlTaskId = mlTaskId;

                getModelSnippets(ActiveProjectKey.get(), analysisId, mlTaskId)
                .success(data => {
                    const defaultModel = {userMeta: {name: 'Latest version'}, fullModelId: "LATEST_VERSION"};
                    let modelDescriptions = ['Always select the latest version trained'];

                    $scope.models = Object.values(data)
                    .filter(m => m.trainInfo.state == "DONE")
                    .sort((a,b) => b.trainInfo.endTime - a.trainInfo.endTime);

                    $scope.models.forEach(v => {
                        v.userMeta.name += " - Session " + v.sessionId.replace("s","");
                        modelDescriptions.push(getAnalysisModelDescription(v));
                    });
                    $scope.models.unshift(defaultModel);
                    $scope.descriptions = modelDescriptions;
                })
                .error(setErrorInScope.bind($scope.$parent));
            }

            $scope.$watch('params.analysisId', a => a? getMLTasks(a) : cleanAll());
            $scope.$watch('params.mlTaskId', mlTaskId => mlTaskId? setMLTask(mlTaskId) : cleanMLTask());
            $scope.$watch('hooks.mlTask', m =>
                m? getAnalysisModels($scope.params.analysisId, m.mlTaskId, m.taskType) : cleanVersions());
        }
    }
});

app.directive('selectSavedModelVersionForm', function(DataikuAPI, $filter) {
    const DEFAULT_VERSIONS = [
        {label:'Active version', fullModelId: 'ACTIVE_VERSION'},
        {label:'Latest version', fullModelId: 'LATEST_VERSION'}
    ];
    const DEFAULT_DESCRIPTIONS = ['Always select the active version', 'Always select the latest version trained'];

    function getModelStatusAPI(taskType) {
        switch(taskType) {
            case "CLUSTERING": return DataikuAPI.savedmodels.clustering.getStatus;
            case "PREDICTION": return DataikuAPI.savedmodels.prediction.getStatus;
            default : return null;
        }
    }

    function getModelVersionDescription(version) {
        let details = [];
        const v = version.snippet;
        v.auc && details.push("AUC : " + v.auc.toFixed(3));
        v.silhouette && details.push("Silhouette : " + v.silhouette.toFixed(3));
        if (v.trainInfo.state == 'DONE' && v.trainInfo.endTime) {
            details.push("Done " + $filter('friendlyTimeDelta')(v.trainInfo.endTime)
            + " (" + $filter("friendlyDate")(v.trainInfo.endTime, 'yyyy-MM-dd HH:mm:ss') +")");
        }
        version.active && details.push("Active version");
        return details.join(', ');
    }

    return {
        scope: {
            params: '=',
        },
        templateUrl: '/templates/scenarios/fragments/select-saved-model-version-form.html',
        link: ($scope, element, attrs, formCtrl) => {
            function cleanVersions() {
                $scope.versions = [];
                $scope.descriptions = [];
            }

            function getModelVersions(projectKey, modelId, subType) {
                const getModelStatus = getModelStatusAPI(subType);
                if (!projectKey || !modelId || !getModelStatus) return;

                $scope.params.mlTaskType = subType;

                getModelStatus(projectKey, modelId)
                .success(data => {
                    let versions = [...DEFAULT_VERSIONS];
                    let modelDescriptions = [...DEFAULT_DESCRIPTIONS];

                    data.versions
                        .filter(m => m.snippet.trainInfo.state == "DONE")
                        .sort((a,b) => b.snippet.trainInfo.endTime - a.snippet.trainInfo.endTime)
                        .forEach(v => {
                            versions.push({
                                label: v.snippet.userMeta.name,
                                fullModelId: v.snippet.fullModelId
                            })
                            modelDescriptions.push(getModelVersionDescription(v));
                        });

                    $scope.versions = versions;
                    $scope.descriptions = modelDescriptions;
                })
                .error(setErrorInScope.bind($scope.$parent));
            }

            $scope.$watch('hooks.model', val => val? getModelVersions(val.projectKey, val.id, val.subtype) : cleanVersions());
        }
    }
});

app.directive('selectMdgTemplateForm', function(DataikuAPI, ActiveProjectKey) {
    return {
        scope: {
            params: '=',
        },
        templateUrl: '/templates/scenarios/fragments/select-mdg-template-form.html',
        link: ($scope, element, attrs, formCtrl) => {
            function getFiles(folderSmartId) {
                $scope.files = [];
                folderSmartId && DataikuAPI.managedfolder.listFS(ActiveProjectKey.get(), folderSmartId)
                .success(function(data){
                    $scope.files = data.items.filter(f => f.path.match(/.docx$/));
                })
                .error(setErrorInScope.bind($scope.$parent));
            }
            $scope.$watch("params.sourceFolderId", getFiles);
        }
    }
});

app.directive('modelDocumentationExportForm', function() {
    return {
        scope: {
            params: '=',
            type: '@'
        },
        templateUrl: '/templates/scenarios/fragments/model-documentation-export-form.html'
    }
});

app.directive('modelDocumentationExportResult', function() {
    const fmiInfo = {
        TYPE : 0, // 'A' for ANALYSIS or 'S' for SAVED_MODEL
        MODEL_PROJECT_KEY : 1,
        MODEL_ID : 2,
        ML_TASK : 3,
    };
    return {
        scope: {
            reportItem: '<',
        },
        templateUrl: '/templates/scenarios/fragments/model-documentation-export-result.html',
        link: ($scope) => {
            // Split fullModelId and parse result to get details
            const data = $scope.reportItem.fullModelId.split('-');
            $scope.reportType = data[fmiInfo.TYPE];
            $scope.modelProjectKey = data[fmiInfo.MODEL_PROJECT_KEY];
            $scope.modelId = data[fmiInfo.MODEL_ID];
            if ($scope.reportType == 'A') $scope.mlTaskId = data[fmiInfo.ML_TASK];
        }
    }
});

})();
