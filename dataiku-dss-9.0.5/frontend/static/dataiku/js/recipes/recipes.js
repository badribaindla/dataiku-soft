(function() {
'use strict';

const app = angular.module('dataiku.recipes', ['dataiku.common.lists']);


app.directive('checkRecipeNameUnique', function(DataikuAPI, $stateParams) {
    return {
        require: 'ngModel',
        link: function(scope, elem, attrs, ngModel) {
            DataikuAPI.flow.recipes.list($stateParams.projectKey).success(function(data) {
                scope.unique_recipes_names = $.map(data, function(recipe) {
                    return recipe.name;
                });
                /* Re-apply validation as soon as we get the list */
                apply_validation(ngModel.$modelValue);
            });
            var initialValue = null, initialValueInitialized = false;
            function apply_validation(value) {
                // Implicitely trust the first value (== our own name)
                if (initialValueInitialized == false && value != undefined && value != null && value.length > 0) {
                    initialValue = value;
                    initialValueInitialized = true;
                }
                // It is fake, but other check will get it.
                if (value == null || value.length === 0) return true;
                // We are back to our name, accept.
                if (initialValueInitialized && value == initialValue) return value;
                var valid = scope.unique_recipes_names ? scope.unique_recipes_names.indexOf(value) === -1 : true;
                ngModel.$setValidity('recipeNameUnique', valid);
                return valid ? value : undefined;
            }
             //For DOM -> model validation
            ngModel.$parsers.unshift(apply_validation);

            //For model -> DOM validation
            ngModel.$formatters.unshift(function(value) {
                apply_validation(value);
                return value;
            });
        }
    };
});

app.filter("buildModeDescription", function(){
    var dict = {
        "NON_RECURSIVE_FORCED_BUILD": "Build only this dataset",
        "RECURSIVE_BUILD": "Build required datasets",
        "RECURSIVE_FORCED_BUILD": "Force-rebuild dataset and dependencies",
        "RECURSIVE_MISSING_ONLY_BUILD": "Build missing dependencies then this one"
    };
    return function(input) {
        return dict[input] || input;
    }
});

app.directive('recipePipelineConfig', function() {
    return {
        restrict: 'E',
        templateUrl: '/templates/recipes/fragments/recipe-pipeline-config.html',
        scope: {
          config: "=",
          anyPipelineTypeEnabled: "&"
        }
    };
});

app.directive('otherActionListItem', function() {
    return {
        restrict: 'E',
        templateUrl: '/templates/recipes/fragments/other-action-list-item.html',
        scope: {
            icon: "@",
            label: "@",
            onClick: '&',
            showCondition: "<?",
            enableCondition: "<?",
            disabledTooltip: "@?"
        },
        link: function(scope) {
            if (scope.showCondition === undefined) {
                scope.showCondition = true;
            }
            if (scope.enableCondition === undefined) {
                scope.enableCondition = true;
            }
        }
    };
});

app.directive("sparkDatasetsReadParamsBehavior", function(Assert, $stateParams, RecipesUtils, Logger, DatasetUtils) {
    return {
        scope: true,
        link: function($scope, element, attrs) {
            Logger.info("Loading spark behavior");
            Assert.inScope($scope, 'recipe');
            let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey:$scope.recipe.projectKey;

            $scope.readParams = $scope.$eval(attrs.readParams);
            Assert.inScope($scope, 'readParams');

            function autocomplete() {
                RecipesUtils.getFlatInputsList($scope.recipe).forEach(function(input) {
                    Assert.inScope($scope, 'computablesMap');
                    const computable = $scope.computablesMap[input.ref];
                    if (!computable) {
                        throw Error('dataset is not in computablesMap, try reloading the page');
                    }
                    const dataset = computable.dataset;
                    if (dataset && !$scope.readParams.map[input.ref]) {
                        $scope.readParams.map[input.ref] = {
                            repartition: ['HDFS', 'hiveserver2'].includes(dataset.type) ? 1 : 10,
                            cache: false
                        };
                    }
                });
                Logger.info("Updated map", $scope.readParams.map);
            }

            $scope.$watch("recipe.inputs", function(nv, ov) {
                if (nv && $scope.computablesMap) {
                    DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                        .then(_ => autocomplete());
                }
            }, true);
            $scope.$watch("computablesMap", function(nv, ov) {
                if (nv) {
                    DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                        .then(_ => autocomplete());
                }
            }, true);
        }
    }
});


app.directive("sparkDatasetsReadParams", function(Assert, RecipesUtils) {
    return {
        scope: true,
        templateUrl: "/templates/recipes/fragments/spark-datasets-read-params.html",
        link: function($scope, element, attrs) {
            Assert.inScope($scope, 'recipe');
            $scope.readParams = $scope.$eval(attrs.readParams);
            Assert.inScope($scope, 'readParams');
        }
    };
});


app.service('RecipesCapabilities', function(RecipeDescService, CodeEnvsService, AppConfig, $rootScope) {

    function getRecipeType(recipe) {
        if (recipe) {
            // A bit dirty, we don't know what recipe is (taggableObjectRef, graphNode, listItem...)
            if (recipe.recipeType) {
                return recipe.recipeType;
            } else if (recipe.subType) {
                return recipe.subType;
            } else if (recipe.type) {
                return recipe.type;
            }
        }
        return undefined;
    }

    this.isMultiEngine = function(recipe) {
        const desc = RecipeDescService.getDescriptor(getRecipeType(recipe));
        return !!desc && desc.isMultiEngine;
    };

    this.canEngine = function(recipe, engine) {
        if (!recipe) {
            return false;
        }
        const recipeType = getRecipeType(recipe);
        if (!recipeType) {
            return false;
        }
        if (recipeType.toLowerCase().includes(engine)) {
            return true;
        }
        const desc = RecipeDescService.getDescriptor(recipeType);
        // we can't be sure though...
        return !!(desc && desc.isMultiEngine);
    };

    this.isSparkEnabled = function() {
        return !AppConfig.get() || AppConfig.get().sparkEnabled;
    };

    this.canSpark = function(recipe) {
        return this.isSparkEnabled() && this.canEngine(recipe, 'spark');
    };

    this.canSparkPipeline = function (recipe) {
        return $rootScope.projectSummary.sparkPipelinesEnabled &&
            this.canSpark(recipe) &&
            !(['pyspark', 'sparkr'].includes(getRecipeType(recipe)));
    };

    this.canSqlPipeline = function(recipe) {
        const canEngine = this.canEngine(recipe, 'sql');
        const b = !(['spark_sql_query', 'sql_script'].includes(getRecipeType(recipe)));
        return $rootScope.projectSummary.sqlPipelinesEnabled &&
            canEngine &&
            b;
    };

    this.canChangeSparkPipelineability= function(recipe) {
        if (recipe) {
            // Prediction scoring is supported but there is a bug that prevent the backend to compute the pipelineabilty (Clubhouse #36393)
            if (getRecipeType(recipe) === 'prediction_scoring') {
                return false;
            }
            return this.canSpark(recipe);
        }
        return false;
    };

    this.canChangeSqlPipelineability= function(recipe) {
        const recipeType = getRecipeType(recipe);
        if (recipeType) {
            // The following recipes are the only ones that can run on SQL and be part of a SQL pipeline.
            if (['sync', 'shaker', 'sampling', 'grouping', 'distinct', 'window', 'join', 'split', 'topn', 'sort',
                    'pivot', 'vstack', 'sql_query', 'prediction_scoring'].includes(recipeType)) {
                return true;
            }
        }
        return false;
    };

    this.canImpala = function(recipe) {
        if (recipe) {
            const recipeType = getRecipeType(recipe);
            if (recipeType === 'impala') {
                return true;
            }
            if (AppConfig.get() && !AppConfig.get().sparkEnabled) {
                return false;
            }
            const desc = RecipeDescService.getDescriptor(recipeType);
            if (desc && desc.isMultiEngine) {
                return true; // we can't be sure...
            }
        }
        return false;
    };

    this.canHive = function(recipe) {
        if (recipe) {
            const recipeType = getRecipeType(recipe);
            if (recipeType === 'hive') {
                return true;
            }
            if (AppConfig.get() && !AppConfig.get().sparkEnabled) {
                return false;
            }
            const desc = RecipeDescService.getDescriptor(recipeType);
            if (desc && desc.isMultiEngine) {
                return true; // we can't be sure...
            }
        }
        return false;
    };

    this.canPythonCodeEnv = function(recipe) {
        return CodeEnvsService.canPythonCodeEnv(recipe);
    };

    this.canRCodeEnv = function(recipe) {
        return CodeEnvsService.canRCodeEnv(recipe);
    };
});

app.controller("RecipePageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, ActiveProjectKey, DataikuAPI) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});
    $controller('_RecipeWithEngineBehavior', {$scope: $scope});

    $scope.recipeData = (await DataikuAPI.flow.recipes.getFullInfo(ActiveProjectKey.get(), $stateParams.recipeName)).data;

    $scope.recipe = $scope.recipeData.recipe;
    $scope.recipe.recipeType = $scope.recipe.type;
    $scope.recipe.nodeType = 'RECIPE';
    $scope.recipe.id = $stateParams.recipeName;
    $scope.recipe.interest = $scope.recipeData.interest;

    $scope.selection = {
        selectedObject : $scope.recipe,
        confirmedItem : $scope.recipe
    };

    $scope.updateUserInterests = function() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "RECIPE", ActiveProjectKey.get(), $scope.selection.selectedObject.name)
            .success(function(data){
                $scope.selection.selectedObject.interest = data;
            })
            .error(setErrorInScope.bind($scope));
    }

    const interestsListener = $rootScope.$on('userInterestsUpdated', $scope.updateUserInterests);

    $scope.$on("$destroy", interestsListener);
});


app.directive('recipeRightColumnSummary', function($controller, $stateParams, $state, $rootScope,
        DataikuAPI, Dialogs, CreateModalFromTemplate, Logger, RecipeComputablesService, ActiveProjectKey, RecipeRunJobService, ActivityIndicator, WT1) {
    return {
        templateUrl: '/templates/recipes/right-column-summary.html',

        link: function(scope, element, attrs) {

            $controller('_TaggableObjectsMassActions', {$scope: scope});
            $controller('_TaggableObjectsCapabilities', {$scope: scope});

            var enrichSelectedObject = function (selObj, recipe) {
                selObj.tags = recipe.tags; // for apply-tagging modal
            }

            scope.refreshData = function() {
                DataikuAPI.flow.recipes.getFullInfo(scope.selection.selectedObject.projectKey, scope.selection.selectedObject.name).success(function(data){
                    scope.recipeData = data;
                    scope.recipe = data.recipe;
                    if (/^\s*\{/.test(data.script || '')) {
                        try { // payload may not be JSON; if it is we only need backendType
                            scope.payload = { backendType: JSON.parse(data.script).backendType };
                        } catch (ignored) {}
                    }

                    enrichSelectedObject(scope.selection.selectedObject, scope.recipe);

                    if (scope.selection.selectedObject.continuous) {
                        // update the build indicator on the flow
                        let selObj = scope.selection.selectedObject;
                        let ps = data.continuousState;
                        // the only change that could not be on the flow is when the activity fails
                        if (!selObj.continuousActivityDone) {
                            if (ps && ps.mainLoopState != null && ps.mainLoopState.futureInfo != null && ps.desiredState == "STARTED" && ps.mainLoopState.futureInfo.hasResult) {
                                selObj.continuousActivityDone = true;
                                $rootScope.$broadcast("graphRendered");
                            }
                        }
                    }
                    scope.recipe.zone = (scope.selection.selectedObject.usedByZones || [])[0] || scope.selection.selectedObject.ownerZone;
                }).error(setErrorInScope.bind(scope));
            };

            scope.$on('taggableObjectTagsChanged', () => scope.refreshData());

            /* Auto save when summary is modified */
            scope.$on("objectSummaryEdited", function(){
                DataikuAPI.flow.recipes.save(ActiveProjectKey.get(), scope.recipe, { summaryOnly: true })
                    .success(() => ActivityIndicator.success("Saved"))
                    .error(setErrorInScope.bind(scope));
            });

            scope.$watch("selection.selectedObject", function(nv, ov) {
                if (!nv) return;
                scope.recipeData = {recipe: nv, timeline: {}}; // display temporary (incomplete) data
                if(scope.selection.confirmedItem != scope.selection.selectedObject) {
                    scope.recipe = null;
                }
                scope.recipeType = nv.recipeType || nv.type;
            });

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) {
                    return;
                }
                scope.refreshData();
            });

            scope.saveCustomFields = function(newCustomFields) {
                WT1.event('custom-fields-save', {objectType: 'RECIPE'});
                const oldCustomFields = angular.copy(scope.recipe.customFields);
                scope.recipe.customFields = newCustomFields;
                return DataikuAPI.flow.recipes.save(ActiveProjectKey.get(), scope.recipe, { summaryOnly: true })
                    .success(() => $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), scope.recipe.customFields))
                    .error((data, status, headers, config, statusText, xhrStatus) => {
                        scope.recipe.customFields = oldCustomFields;
                        setErrorInScope.bind(scope)(data, status, headers, config, statusText, xhrStatus);
                    });
            };

            scope.editCustomFields = function() {
                if (!scope.recipe) {
                    return;
                }
                let modalScope = angular.extend(scope, {objectType: 'RECIPE', objectName: scope.recipe.name, objectCustomFields: scope.recipe.customFields});
                CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                    scope.saveCustomFields(customFields);
                });
            };

            scope.buildOutput = function() {
                RecipeComputablesService.getComputablesMap(scope.recipe, scope).then(function(computablesMap){
                    const outputRef = RecipeRunJobService.getOutputAndPartitioning(scope.recipe, computablesMap).output.ref;
                    if (computablesMap && computablesMap[outputRef]) {
                        switch(computablesMap[outputRef].type) {
                            case 'DATASET':
                                DataikuAPI.datasets.get(scope.recipe.projectKey, outputRef, ActiveProjectKey.get())
                                .success(function(dataset) {
                                    CreateModalFromTemplate("/templates/datasets/build-dataset-modal.html", scope, "BuildDatasetController", function(modalScope) {
                                        modalScope.dataset = dataset;
                                    }, "build-dataset-modal");
                                }).error(setErrorInScope.bind(scope));
                                break;
                            case 'SAVED_MODEL':
                                CreateModalFromTemplate("/templates/savedmodels/build-model-modal.html", scope, "BuildSavedModelController", function(modalScope) {
                                    modalScope.modelId = outputRef;
                                });
                                break;
                            case 'MANAGED_FOLDER':
                                    CreateModalFromTemplate("/templates/managedfolder/build-folder-modal.html", scope, "BuildManagedFolderController", function(modalScope) {
                                    modalScope.odbId = outputRef;
                                });
                                break;
                            case 'MODEL_EVALUATION_STORE':
                                    CreateModalFromTemplate("/templates/modelevaluationstores/build-store-modal.html", scope, "BuildModelEvaluationStoreController", function(modalScope) {
                                    modalScope.mesId = outputRef;
                                });
                                break;
                            case 'STREAMING_ENDPOINT':
                                    CreateModalFromTemplate("/templates/streaming-endpoints/build-streaming-endpoint-modal.html", scope, "BuildStreamingEndpointController", function(modalScope) {
                                    modalScope.streamingEndpointId = outputRef;
                                });
                                break;
                        }
                    }
                });
            };

            scope.startContinuous = function() {
                WT1.event("start-continuous", {from:'recipe'})
                CreateModalFromTemplate("/templates/continuous-activities/start-continuous-activity-modal.html", scope, "StartContinuousActivityController", function(newScope) {
                    newScope.recipeId = scope.recipe.name;
                }).then(function(loopParams) {
                    DataikuAPI.continuousActivities.start($stateParams.projectKey, scope.recipe.name, loopParams).success(function(data){
                        scope.refreshData();
                    }).error(setErrorInScope.bind(scope));
                });
            }
            scope.stopContinuous = function(){
                WT1.event("stop-continuous", {from:'recipe'})
                DataikuAPI.continuousActivities.stop($stateParams.projectKey, scope.recipe.name).success(function(data){
                    scope.refreshData();
                }).error(setErrorInScope.bind(scope));
            }
    
            scope.goToCurrentRun = function() {
                let recipeState = scope.recipeData.continuousState || {};
                let mainLoopState = recipeState.mainLoopState || {};
                $state.go("projects.project.continuous-activities.continuous-activity.runs", {continuousActivityId: recipeState.recipeId, runId: mainLoopState.runId, attemptId: mainLoopState.attemptId});
            };

        }
    }
});


app.controller("RecipeDetailsController", function ($scope, $rootScope, $filter, $state, StateUtils) {
    $scope.StateUtils = StateUtils;
    $scope.getObjectIcon = function(object) {
        switch(object.type) {
            case 'SAVED_MODEL':             return 'icon-machine_learning_regression saved-model';
            case 'MANAGED_FOLDER':          return 'icon-folder-open managed-folder';
            case 'MODEL_EVALUATION_STORE':  return 'icon-model-evaluation-store';
            default:                        return $filter('datasetTypeToIcon')(object.type) + ' dataset';
        }
    };

    $scope.getObjectLink = function(object) {
        switch(object.type) {
            case 'SAVED_MODEL':             return StateUtils.href.savedModel(object.id, object.projectKey);
            case 'MANAGED_FOLDER':          return StateUtils.href.managedFolder(object.id, object.projectKey);
            case 'MODEL_EVALUATION_STORE':  return StateUtils.href.modelEvaluationStore(object.id, object.projectKey);
            default:                        return StateUtils.href.dataset(object.id);
        }
    };

    $scope.getObjectType = function(object) {
        switch(object.type) {
            case 'SAVED_MODEL':     return 'SAVED_MODEL';
            case 'MANAGED_FOLDER':  return 'MANAGED_FOLDER';
            default:                return 'DATASET_CONTENT';
        }
    };

    $scope.isOnRecipeObjectPage = function() {
        return $state.includes('projects.project.recipes.recipe');
    }

    $scope.getFlatAggregates = function(values) {
        if (!values) {
            return [];
        }
        var aggregates = [];
        values.forEach(function(value) {
            if (value.customExpr) {
                aggregates.push(value);
            } else {
                angular.forEach(value, function(x, agg) {
                    if (agg.startsWith("__")) return; // temp field
                    if (x === true) {
                        aggregates.push({agg:agg, column:value.column, type:value.type});
                    }
                });
            }
        });
        return aggregates;
    }
});


/**
 * The summary of recipes is managed a bit differently than all other objects.
 * For a recipe, the tabs that are available are depending on the recipe. That's true
 * even for the summary tab (all xxx-recipe-editor.html files include the summary tab)
 *
 * Thus, when we enter this summary controller, we already have the recipe, and we'll
 * reuse the regular save mechanism.
 *
 * Timelines and interests are fetched manually. Also, there is no specific state for the
 * summary tab
 */
app.controller("RecipeSummaryController", function($scope, Assert, DataikuAPI, $rootScope, $stateParams, Logger){
    Assert.inScope($scope, 'recipe');

    // Interests are fetched separately since we already have the recipe at that point
    DataikuAPI.interests.getForObject($rootScope.appConfig.login, "RECIPE", $stateParams.projectKey, $stateParams.recipeName)
        .success(function(data){
            $scope.objectInterest = data;
        })
        .error(setErrorInScope.bind($scope));

    /* Auto save when modified */
    $scope.$on("objectSummaryEdited", function(){
        Logger.info("Recipe summary edited");
        $scope.saveRecipe();
    });

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields(customFields);
    });
});

app.controller("RecipeEditorController",
    function ($scope, $rootScope, $timeout, $stateParams, $filter, $location, $state, $q,
    Assert, BigDataService, DataikuAPI, Dialogs, WT1, FutureProgressModal,
    TopNav, PartitionDeps, DKUtils, Logger, HistoryService,
    CreateModalFromTemplate, AnyLoc, JobDefinitionComputer, RecipeComputablesService, RecipesUtils,
    RecipeRunJobService, PartitionSelection, RecipeDescService, InfoMessagesUtils, StateUtils, GraphZoomTrackerService,
    DatasetUtils) {

    $scope.InfoMessagesUtils = InfoMessagesUtils;

    let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey:$stateParams.projectKey;
	function main(){
        /* Init scope */
        $scope.uiState = {editSummary:false};
        $scope.startedJob = {};
        $scope.recipe = null;
        $scope.recipeStatus = null;
        $scope.payloadRequired = false; // override for recipe specific recipe types. Avoids to get-status before the payload is ready
        $scope.script = {};
        $scope.creation = false;
        $scope.recipeName = { "name" : $scope.$state.params.recipeName };
        $scope.projectKey = $stateParams.projectKey;
        $scope.hooks = $scope.hooks || {};
        GraphZoomTrackerService.setFocusItemByName("recipe", $scope.recipeName.name);
        $scope.RecipesUtils = RecipesUtils

        // Validation context
        $scope.valCtx = {};

        const tabToSelect = StateUtils.defaultTab("settings");
        TopNav.setLocation(TopNav.TOP_FLOW, "recipes", TopNav.TABS_RECIPE, tabToSelect);
        TopNav.setItem(TopNav.ITEM_RECIPE, $stateParams.recipeName);

        $scope.validations = [
            function(){
                return $scope.renaming.recipe_name.$valid && $scope.recipeName.name.length;
            }
        ];

        $scope.PartitionDeps = PartitionDeps;
        addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);

        // DO NOT INITIALIZE IT, IT HELPS CATCH ERRORS
        $scope.computablesMap = null;
        $scope.$broadcast('computablesMapChanged');

        Assert.trueish($scope.recipeName.name, 'no recipe name');

        DataikuAPI.flow.recipes.generic.getVariables($stateParams.projectKey).success(function(data) {
            $scope.recipeVariables = data;
        }).error(setErrorInScope.bind($scope));

        DataikuAPI.flow.recipes.getWithInlineScript($stateParams.projectKey, $scope.recipeName.name).success(function(data) {
            $scope.recipe = data.recipe;
            $scope.script.data = data.script;
            $scope.origRecipe = angular.copy($scope.recipe);
            $scope.origScript = angular.copy($scope.script);

            $scope.recipeDesc = RecipeDescService.getDescriptor($scope.recipe.type);

            TopNav.setItem(TopNav.ITEM_RECIPE, data.recipe.name, {
                recipeType :data.recipe.type,
                name : data.recipe.name,
                inputs: data.recipe.inputs,
                outputs: data.recipe.outputs
            });

            RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
                $scope.setComputablesMap(map);
                DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                    .then(_ => {
                                    $scope.onload();
                                    $scope.$broadcast('computablesMapChanged'); // because the schema are there now (they weren't when setComputablesMap() was called)
                                });
            });
            DataikuAPI.flow.zones.getZoneId($stateParams.projectKey, {id: data.recipe.name, type: "RECIPE", projectKey: data.recipe.projectKey}).success(zone => {
                if (zone) {
                    // Put it in zone so the io:getDatasetCreationSettings can find it
                    // and we can target more recipes
                    $scope.zone = zone.id;
                }
            });

        }).error(function(){
            HistoryService.notifyRemoved({
                type: "RECIPE",
                id: $scope.recipeName.name,
                projectKey: $stateParams.projectKey
            });
            setErrorInScope.apply($scope, arguments);
        });

        TopNav.setTab(tabToSelect);
    }
    main();

    function extractWT1EventParams(recipe, payload) {
        if (recipe.type === "prediction_scoring") {
            const recipeParams = JSON.parse(payload.data);
            let eventParams = {
                filterInputColumns: recipeParams.filterInputColumns,
                forceOriginalEngine: recipeParams.forceOriginalEngine,
                outputExplanations: recipeParams.outputExplanations,
                outputProbaPercentiles: recipeParams.outputProbaPercentiles,
                outputProbabilities: recipeParams.outputProbabilities,
            };
            if (eventParams.outputExplanations) {
                eventParams = {
                    individualExplMethod: recipeParams.individualExplanationParams.method,
                    individualExplCount: recipeParams.individualExplanationParams.nbExplanations,
                    ... eventParams
                };
            }
            return eventParams;
        } else {
            return {};
        }
    }

    $scope.recipeWT1Event = function(type, params) {
        if (params == null) params = {};
        params.recipeId = ($scope.recipeName && $scope.recipeName.name) ? $scope.recipeName.name.dkuHashCode() : "unknown";
        params.recipeType = ($scope.recipe ? $scope.recipe.type : "unknown");
        params.creation = $scope.creation;
        if ($scope.recipe && $scope.recipe.type) {
            const extractParams = extractWT1EventParams($scope.recipe, $scope.script);
            params = { ...params, ...extractParams };
        }
        WT1.event(type, params);
    };

    $scope.editThisRecipeInNotebook = function() {
        var editInNotebook = function() {
            DataikuAPI.flow.recipes.editInNotebook($stateParams.projectKey, $stateParams.recipeName, $scope.recipe.params.envSelection, $scope.recipe.params.containerSelection).success(function(data) {
                StateUtils.go.jupyterNotebook(data.id, $stateParams.projectKey);
            }).error(setErrorInScope.bind($scope));
        };
        $scope.saveRecipeIfPossible().then(function() {
            DataikuAPI.flow.recipes.checkNotebookEdition($stateParams.projectKey, $stateParams.recipeName).success(function(data) {
                if (!data || data.conflict !== true || !data.notebook) {
                    editInNotebook();
                } else {
                    Dialogs.openEditInNotebookConflictDialog($scope).then(
                        function(resolutionMethod) {
                            if(resolutionMethod == 'erase') {
                                editInNotebook();
                            } else if(resolutionMethod == 'ignore') {
                                StateUtils.go.jupyterNotebook(data.notebook, $stateParams.projectKey);
                            }
                        }
                    );
                }
            }).error(setErrorInScope.bind($scope));
        }).catch(setErrorInScope.bind($scope));
    };

    $scope.saveCustomFields = function(newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'RECIPE'});
        let oldCustomFields = angular.copy($scope.recipe.customFields);
        $scope.recipe.customFields = newCustomFields;
        return $scope.hooks.save().then(function() {
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.recipe.customFields);
            }, function() {
                $scope.recipe.customFields = oldCustomFields;
            });
    };

    $scope.editCustomFields = function() {
        if (!$scope.recipe) {
            return;
        }
        let modalScope = angular.extend($scope, {objectType: 'RECIPE', objectName: $scope.recipe.name, objectCustomFields: $scope.recipe.customFields});
        CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
            $scope.saveCustomFields(customFields);
        });
    };

    $scope.renameRecipe = function(){
        if ($scope.hooks.recipeIsDirty()) {
            Dialogs.error($scope, "Save the recipe", "You must save the recipe before renaming it");
            return;
        }
        CreateModalFromTemplate("/templates/recipes/rename-recipe-box.html", $scope, null, function(newScope){
            newScope.recipeName = $stateParams.recipeName;
            newScope.uiState = {
                step : "input"
            };

            newScope.go = function(){
                DataikuAPI.flow.recipes.rename($stateParams.projectKey, $stateParams.recipeName, newScope.uiState.newName).success(function() {
                    HistoryService.notifyRenamed({
                        type: "RECIPE",
                        id: $stateParams.recipeName,
                        projectKey: $stateParams.projectKey
                    }, newScope.uiState.newName);
                    newScope.dismiss();
                    newScope.$emit("recipesListChanged");
                    $state.transitionTo($state.current, { projectKey : $stateParams.projectKey, recipeName : newScope.uiState.newName });
                }).error(setErrorInScope.bind(newScope));
            }
        });
    };

    $scope.gotoLine = function(cm, line) {
        if(cm && line>0) {
            var pos = {ch:0,line:line-1};
            cm.scrollIntoView(pos);
            cm.setCursor(pos);
            cm.focus();
        }
    };

    $scope.specificControllerLoadedDeferred = $q.defer();

    /* Method called once recipe is loaded */
    var onloadcalled = false;
    $scope.onload = function() {
        Assert.inScope($scope, 'recipe');
        Assert.trueish(!onloadcalled, 'already loaded');
        onloadcalled = true;
        $scope.fixupPartitionDeps();

        $scope.recipeWT1Event("recipe-open");

        // TODO: Check if still needed
        $scope.ioFilter = {};

        $scope.testRun = {
            build_partitions: {},
            runMode: "NON_RECURSIVE_FORCED_BUILD"
        };

        /* Synchronize the definition of build_partitions for the test run
         * with the partitioning schema of the first partitioned output */
        $scope.$watch("recipe.outputs", function(nv, ov) {
            if (nv != null) {
                clear($scope.testRun.build_partitions);
                DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                    .then(_ => {
                        const definingOutputPartitioning = RecipeRunJobService.getOutputAndPartitioning($scope.recipe, $scope.computablesMap).partitioning;
                        if (definingOutputPartitioning && definingOutputPartitioning.dimensions.length) {
                            $scope.outputPartitioning = definingOutputPartitioning;
                            $scope.testRun.build_partitions = PartitionSelection.getBuildPartitions($scope.outputPartitioning);
                        } else {
                            $scope.outputPartitioning = { dimensions: [] };
                        }
                    });
            } else {
                $scope.testRun.build_partitions = null;
            }
        }, true);

        $scope.fixupPartitionDeps();

        /* When the specific recipe controller has finished loading AND we have
         * the computables map, then we call its own onload hook */
        $scope.specificControllerLoadedDeferred.promise.then(function() {
            if ($scope.hooks && $scope.hooks.onRecipeLoaded){
                $scope.hooks.onRecipeLoaded();
            }
        });
    };

    $scope.hooks.getRecipeSerialized = function(){
        var recipeSerialized = angular.copy($scope.recipe);
        PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
        return recipeSerialized;
    };

    $scope.hooks.resetScope = function() {
        clear($scope.startedJob);
        clear($scope.valCtx);
    };

    //Override it to return a string representing the payload
    $scope.hooks.getPayloadData = function() {};

    /* ***************************** Inputs/Outputs *************************** */

    $scope.hasAllRequiredOutputs = function() {
        if (!$scope.recipe || !$scope.recipe.outputs) {
            return false;
        }
        var out = $scope.recipe.outputs;
        //TODO implement for any role
        if(out.main) {
            return !!(out.main.items && out.main.items.length);
        }
        return true;//Other roles: don't know
    };

    $scope.hasPartitionedOutput = function() {
        return $scope.getOutputDimensions().length > 0;
    };

    $scope.hasInvalidPartitionSelection = function() {
        return $scope.getOutputDimensions().some((dimension) => {
            return !$scope.testRun || $scope.testRun.build_partitions[dimension.name] === void 0 || $scope.testRun.build_partitions[dimension.name] === "";
        });
    };

    // This method should be called each time inputs or outputs are modified.
    $scope.fixupPartitionDeps = function(){
        if (!$scope.recipe || !$scope.computablesMap) return;
        var ret = PartitionDeps.fixup($scope.recipe, $scope.computablesMap);
        $scope.outputDimensions = ret[0];
        $scope.outputDimensionsWithNow = ret[1];
    };

    $scope.testPDep = function(inputRef, pdep) {
        PartitionDeps.test($scope.recipe, inputRef, pdep, $scope);
    };

    $scope.refreshDatasetInComputablesMap = function(dataset) {
        var found = null;
        $.each($scope.computablesMap, function(smartName, computable) {
            if (computable.projectKey == dataset.projectKey && computable.name == dataset.name)
                found = computable;
        });
        // the dataset has to be in the computablesMap, otherwise that means it's not even shown in the dataset left pane
        Assert.trueish(found);
        found.dataset = dataset;
    };

    /* Simple recipes that don't want to manage themselves inputs and outputs
     * should enable auto fixup */
    $scope.enableAutoFixup = function() {
        $scope.$watch("recipe.inputs", function() {
            DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                    .then(_ => $scope.fixupPartitionDeps());
        }, true);
        $scope.$watch("recipe.outputs", function() {
            DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                    .then(_ => $scope.fixupPartitionDeps());
        }, true);
    };

    $scope.$watch("recipe.inputs", function(nv, ov) {
        if (!nv) return;
        if (!$scope.outputDimensions) return;
        DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                    .then(_ => {
            RecipesUtils.getFlatInputsList($scope.recipe).forEach(function(input) {
                if (!input.deps) return;
                input.deps.forEach(function(pdep){
                    PartitionDeps.autocomplete(pdep, $scope.outputDimensions, $scope.outputDimensionsWithNow);
                });
            });
        });
    }, true);

    $scope.$watch("recipe.outputs", function() {
        DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey);
    }, true);

    $scope.setComputablesMap = function(map) {
        $scope.computablesMap = map;
        $scope.$broadcast('computablesMapChanged');
    };

    $scope.getOutputDimensions = function(){
        if (!$scope.recipe || !$scope.computablesMap) return [];
        return RecipeRunJobService.getOutputDimensions($scope.recipe, $scope.computablesMap);
    };

    $scope.hasAnyPartitioning = function(){
        if (!$scope.recipe || !$scope.computablesMap) return false;
        return RecipesUtils.hasAnyPartitioning($scope.recipe, $scope.computablesMap);
    };


    /* ***************************** Save *************************** */

    $scope.hooks.save = function() {
        return $scope.baseSave($scope.hooks.getRecipeSerialized(), $scope.script ? $scope.script.data : null);
    };
    $scope.hooks.origSaveHook = $scope.hooks.save;

    $scope.baseSave = function(recipeSerialized, payloadData){
        $scope.recipeWT1Event("recipe-save");
        return DataikuAPI.flow.recipes.save($stateParams.projectKey, recipeSerialized,
            payloadData, $scope.currentSaveCommitMessage).success(function(savedRecipe){
            var newVersionTag = savedRecipe.versionTag;
            $scope.origRecipe = angular.copy($scope.recipe);
            $scope.origScript = angular.copy($scope.script);
            $scope.recipe.versionTag = newVersionTag;
            $scope.origRecipe.versionTag = newVersionTag;
            $scope.creation = false;
            $scope.currentSaveCommitMessage = null;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.canSave = function(){
        if (!$scope.creation) return true;
        return $scope.recipeName.name && $scope.recipeName.name.length;
    };

    $scope.hooks.recipeIsDirty = function() {
        if (!$scope.recipe) return false;
        if ($scope.creation) {
            return true;
        } else {
            // compare after fixing up the partition deps, otherwise their change is missed by the dirtyness tracking
            var recipeSerialized = angular.copy($scope.recipe);
            PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
            var origRecipeSerialized = angular.copy($scope.origRecipe);
            PartitionDeps.prepareRecipeForSerialize(origRecipeSerialized, true);

            var dirty = !angular.equals(recipeSerialized, origRecipeSerialized);
            if ($scope.script) {
                dirty = dirty || !angular.equals($scope.origScript, $scope.script);
            }
            return dirty;
        }
    };

    //Don't link to the default recipeIsDirty is function, get the actual one that may be defined later
    checkChangesBeforeLeaving($scope, (function(_scope){return function() {return _scope.hooks.recipeIsDirty(); }})($scope));

    $scope.saveRecipe = function(commitMessage){
        var deferred = $q.defer();

        var saveAfterConflictCheck = function() {
            $scope.currentSaveCommitMessage = commitMessage;
            $scope.hooks.save().then(function() {
                deferred.resolve('recipe saved');
            },function() {
                deferred.reject();
            });
        };

        DataikuAPI.flow.recipes.checkSaveConflict($stateParams.projectKey, $stateParams.recipeName,$scope.recipe).success(function(conflictResult) {
            if(!conflictResult.canBeSaved) {
                Dialogs.openConflictDialog($scope,conflictResult).then(
                        function(resolutionMethod) {
                            if(resolutionMethod == 'erase') {
                                saveAfterConflictCheck();
                            } else if(resolutionMethod == 'ignore') {
                                deferred.reject();
                                DKUtils.reloadState();
                            }
                        }
                );
            } else {
                saveAfterConflictCheck();
            }
        }).error(setErrorInScope.bind($scope));
        return deferred.promise;
    };

    $scope.saveRecipeIfPossible = function(){
        if ($scope.canSave()) {
            return $scope.saveRecipe();
        }
        return $q.defer().promise;
    };

    $scope.displayAllMessagesInModal = function(){
        Dialogs.infoMessagesDisplayOnly($scope, "Recipe validation",
            $scope.valCtx.validationResult.allMessagesForFrontend);
    };

    /* ***************************** Execution *************************** */

    $scope.buildModes = [
        ["NON_RECURSIVE_FORCED_BUILD", "Run only this recipe"],
        ["RECURSIVE_BUILD", "Build required dependent datasets"],
        ["RECURSIVE_FORCED_BUILD", "Force-rebuild all dependent datasets"],
        ["RECURSIVE_MISSING_ONLY_BUILD", "Build missing dependencies and run this recipe"]
    ];

    $scope.jobCheckTimer = null;

    $scope.hooks.preRunValidate = function() {
        var deferred = $q.defer();
        DataikuAPI.flow.recipes.generic.validate($stateParams.projectKey,
            $scope.hooks.getRecipeSerialized()).success(function(data) {
            deferred.resolve(data);
        }).error(function(a,b,c) {
            setErrorInScope.bind($scope)(a,b,c);
            deferred.reject("Validation failed");
        });
        return deferred.promise;
    };

    $scope.editRunOptions = function(){
        CreateModalFromTemplate("/templates/recipes/recipe-run-options-modal.html", $scope);
    };

    $scope.waitForEndOfStartedJob = function() {
        Logger.info("Wait for end of job:", $scope.startedJob.jobId);
        DataikuAPI.flow.jobs.getJobStatus($stateParams.projectKey, $scope.startedJob.jobId).success(function(data) {
            $scope.startedJob.jobStatus = data;
            data.totalWarningsCount = 0;
            if (data.logTail != null) {
                data.logTailHTML = smartLogTailToHTML(data.logTail, false);
            }
            for (var actId in data.baseStatus.activities) {
                var activity = data.baseStatus.activities[actId];
                if (activity.warnings) {
                    data.totalWarningsCount += activity.warnings.totalCount;
                }
            }
            if (data.baseStatus.state != "DONE" && data.baseStatus.state != "ABORTED" &&
                data.baseStatus.state != "FAILED") {
                $scope.jobCheckTimer = $timeout($scope.waitForEndOfStartedJob, 2000);
            } else {
                $scope.recipeWT1Event("recipe-run-finished", {
                    state : data.baseStatus.state
                });
            }
            $timeout(function() {$rootScope.$broadcast("reflow");},50);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.waitForEndOfStartedContinuousActivity = function() {
        Logger.info("Wait for end of continuous activity:", $scope.startedJob.jobId);
        DataikuAPI.continuousActivities.getState($stateParams.projectKey, $stateParams.recipeName).success(function(data) {
            $scope.startedJob.persistent = data;
            $scope.startedJob.current = data.mainLoopState;
            if ($scope.startedJob.current && $scope.startedJob.current.futureInfo && ($scope.startedJob.current.futureInfo.alive || !$scope.startedJob.current.futureInfo.hasResult)) {
                $scope.jobCheckTimer = $timeout($scope.waitForEndOfStartedContinuousActivity, 2000);
            } else {
                // not running anymore
            }
            $timeout(function() {$rootScope.$broadcast("reflow");},50);
        }).error(setErrorInScope.bind($scope));

    };

    $scope.discardStartedJob = function(){
        clear($scope.startedJob);
        if($scope.jobCheckTimer) {
           $timeout.cancel($scope.jobCheckTimer);
           $scope.jobCheckTimer = null;
           $timeout(function() {
               $rootScope.$broadcast('redrawFatTable');
           });
        }
    };

    $scope.abortSingleRecipeExecution = function() {
        Dialogs.confirm($scope, 'Aborting a job','Are you sure you want to abort this job?').then(function() {
            DataikuAPI.flow.jobs.abort($stateParams.projectKey,$scope.startedJob.jobId).success(function(data) {
                $scope.discardStartedJob();
            }).error(function(e) {
                // swallow this error
                Logger.error(e);
            });
            $scope.recipeWT1Event("recipe-running-abort");
        });
    };

    $scope.isJobRunning = function() { return RecipeRunJobService.isRunning($scope.startedJob); };

    $scope.isContinuousActivityRunning = function() { return $scope.startedJob && $scope.startedJob.jobId && $scope.startedJob.current && $scope.startedJob.current.futureInfo && ($scope.startedJob.current.futureInfo.alive || !$scope.startedJob.current.futureInfo.hasResult); };

    //TODO @recipes32 this is a little flawed, there is a short moment between starting and running...
    $scope.isJobRunningOrStarting = function() {
        return $scope.isJobRunning() || !!$scope.startedJob.starting;
    };
    $scope.isContinuousActivityRunningOrStarting = function() {
        return $scope.isContinuousActivityRunning() || !!$scope.startedJob.starting;
    };

    $scope.startSingleRecipeExecution = function(forced) {
        $scope.hooks.resetScope();
        $scope.startedJob.starting = true;

        function doIt() {
            RecipeRunJobService.run($scope.recipe, $scope.computablesMap, $scope.testRun, $scope.startedJob, $scope).then(function(){
                $scope.waitForEndOfStartedJob();
            });
        }

        $scope.saveRecipe().then(function() {
            if (forced) {
                $scope.recipeWT1Event("recipe-run-start-forced");
                doIt();
            } else if ($scope.recipe.params && $scope.recipe.params.skipPrerunValidate) {
                $scope.recipeWT1Event("recipe-run-start-no-validation");
                doIt();
            } else {
                $scope.recipeWT1Event("recipe-run-start");
                $scope.hooks.preRunValidate().then(function(validationResult) {
                    if (validationResult.ok == true || validationResult.error == false || validationResult.allMessagesForFrontend && !validationResult.allMessagesForFrontend.error) {
                        $scope.recipeWT1Event("recipe-run-start-validated");
                        doIt();
                    } else {
                        $scope.startedJob.starting = false;
                        $scope.valCtx.preRunValidationError = validationResult;
                        $scope.recipeWT1Event("recipe-run-start-blocked", {
                            firstError : validationResult.allMessagesForFrontend && validationResult.allMessagesForFrontend.messages.length ? validationResult.allMessagesForFrontend.messages[0].message : "unknown"
                        });
                    }
                }, function(error) {
                    $scope.startedJob.starting = false;
                });
            }
        }, function(error) {
            $scope.startedJob.starting = false;
        });
    };


    $scope.startContinuousActivity = function(forced) {
        $scope.hooks.resetScope();
        $scope.startedJob.starting = true;

        function doIt() {
            const onceLoopParams = { abortAfterCrashes: 0 };
            DataikuAPI.continuousActivities.start($stateParams.projectKey, $stateParams.recipeName, onceLoopParams).success(function(data){
                FutureProgressModal.show($scope, data, "Starting continuous recipe...").then(function(data) {
                    $scope.startedJob.jobId = data.futureId;
                    $scope.waitForEndOfStartedContinuousActivity();
                });
            }).error(setErrorInScope.bind($scope));
        }

        $scope.saveRecipe().then(function() {
            if (forced) {
                $scope.recipeWT1Event("recipe-run-start-forced");
                doIt();
            } else if ($scope.recipe.params && $scope.recipe.params.skipPrerunValidate) {
                $scope.recipeWT1Event("recipe-run-start-no-validation");
                doIt();
            } else {
                $scope.recipeWT1Event("recipe-run-start");
                $scope.hooks.preRunValidate().then(function(validationResult) {
                    if (validationResult.ok == true || validationResult.error == false || !validationResult.allMessagesForFrontend.error) {
                        $scope.recipeWT1Event("recipe-run-start-validated");
                        doIt();
                    } else {
                        $scope.startedJob.starting = false;
                        $scope.valCtx.preRunValidationError = validationResult;
                        $scope.recipeWT1Event("recipe-run-start-blocked", {
                            firstError : validationResult.allMessagesForFrontend && validationResult.allMessagesForFrontend.messages.length ? validationResult.allMessagesForFrontend.messages[0].message : "unknown"
                        });
                    }
                }, function(error) {
                    $scope.startedJob.starting = false;
                });
            }
        }, function(error) {
            $scope.startedJob.starting = false;
        });
    };

    $scope.stopContinuousActivity = function(){
        $scope.continuousActivityState = null;
        DataikuAPI.continuousActivities.stop($stateParams.projectKey, $stateParams.recipeName).success(function(data){
            // TODO - start displaying some useful stuff...
        }).error(setErrorInScope.bind($scope));
    }
    
    $scope.openContinuousActivity = function() {
        $state.go("projects.project.continuous-activities.continuous-activity.runs", {continuousActivityId: $scope.recipe.name});
    }; 

    // Stop the timer at exit
    $scope.$on("$destroy",function() {
       if($scope.jobCheckTimer) {
           $timeout.cancel($scope.jobCheckTimer);
           $scope.jobCheckTimer = null;
       }
       Mousetrap.unbind("@ r u n");
       $scope.hooks = null;
    });

    Mousetrap.bind("@ r u n", function(){
        $scope.startSingleRecipeExecution();
    });

});


app.controller("_RecipeWithEngineBehavior", function($rootScope, $scope, $q, $stateParams, DataikuAPI, Dialogs, PartitionDeps, DKUtils, Logger, CreateModalFromTemplate) {
    $scope.setRecipeStatus = function(data) {
        $scope.recipeStatus = data;

        const engineType = $scope.recipeStatus.selectedEngine.type;
        if (engineType === "SPARK") {
            $scope.anyPipelineTypeEnabled = function() {
                return $rootScope.projectSummary.sparkPipelinesEnabled;
            };
        } else if (engineType === "SQL") {
            $scope.anyPipelineTypeEnabled = function() {
                return $rootScope.projectSummary.sqlPipelinesEnabled;
            };
        }
    };

    $scope.hooks.updateRecipeStatus = function() {};

    var requestsInProgress = 0;
    var sendTime = 0;
    var lastSequenceId = 0;
    var lastPromise;
    // to avoid updating multiple times with same data:
    var lastPayload;
    var lastRequestData;
    var lastRecipeSerialized; //(json string)
    $scope.updateRecipeStatusBase = function(forceUpdate, payload, requestSettings) {
        var recipeCopy = angular.copy($scope.recipe);
        /* Complete the partition deps from the "fixedup" version */
        PartitionDeps.prepareRecipeForSerialize(recipeCopy);
        var recipeSerialized = angular.toJson(recipeCopy);
        var requestData = angular.toJson(requestSettings || {});

        if (!forceUpdate
            && lastPayload == payload
            && lastRequestData == requestData
            && lastRecipeSerialized == recipeSerialized) {
            Logger.info("Update recipe: cache hit, not requesting");
            // We already made this request
            return lastPromise;
        }

        lastPayload = payload;
        lastRequestData = requestData;
        lastRecipeSerialized = recipeSerialized;
        lastSequenceId++;

        requestsInProgress++;
        sendTime = new Date().getTime();
        $scope.recipeStateUpdateInProgress = true;
        lastPromise = DataikuAPI.flow.recipes.generic.getStatus(recipeCopy, payload, lastSequenceId, requestSettings)
            .catch(function(response) {
                setErrorInScope.bind($scope)(response.data, response.status, response.headers);
                //we can't get the sequenceId so wait for all answers to mark as idle
                if (requestsInProgress == 1) {
                    $scope.recipeStateUpdateInProgress = false;
                }
                return response;
            })
            .finally(function(){
                requestsInProgress--;
            })
            .then(function(response) {
                if (parseInt(response.data.sequenceId) < lastSequenceId) {
                    return; //Too late!
                }
                if (new Date().getTime() - sendTime > 1500) {
                    aPreviousCallWasLong = true;
                }
                $scope.recipeStateUpdateInProgress = false;
                $scope.setRecipeStatus(response.data);
                return response.data;
            });
        return lastPromise;
    };

    var timeout;
    $scope.updateRecipeStatusLater = function() {
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            $('.CodeMirror').each(function(idx, el){Logger.debug(el.CodeMirror.refresh())});//Make sure codemirror is always refreshed (#6664 in particular)
            if (!$scope.hooks) return;
            $scope.hooks.updateRecipeStatus();
        }, 400);
    };

    /* this function helps the UI have a more appropriate look when status computation is long (small spinner, etc) */
    var aPreviousCallWasLong = false;
    $scope.expectLongRecipeStatusComputation = function() {
        return !$scope.recipeStatus || !$scope.recipeStatus.selectedEngine || aPreviousCallWasLong;
    };

    $scope.canChangeEngine = function() {
        if(!$scope.recipeStatus || !$scope.recipeStatus.engines) {
            return false;
        }
        if ($scope.isJobRunningOrStarting() || $scope.recipeStateUpdateInProgress) {
            return false;
        }
        return true;
    };

    $scope.convertToQueryRecipe = function(type, label) {
        Dialogs.confirm($scope, "Convert to " + label + " recipe",
                        "Converting the recipe to "+label+" will enable you to edit the query, but you will not be able to use the visual editor anymore."+
                        "<br/><strong>This operation is irreversible.</strong>")
        .then(function() {
            var payloadData = $scope.hooks.getPayloadData();
            var recipeSerialized = angular.copy($scope.recipe);
            PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
            $scope.hooks.save().then(function() {
                DataikuAPI.flow.recipes.visual.convert($stateParams.projectKey, recipeSerialized, payloadData, type)
                .success(function(data) {
                    DKUtils.reloadState();
                }).error(setErrorInScope.bind($scope));
            });
        });
    };

    $scope.showSQLModal = function(){
        var newScope = $scope.$new();
        newScope.convert = $scope.convertToQueryRecipe;
        newScope.uiState = {currentTab: 'query'};
        $scope.hooks.updateRecipeStatus(false, true).then(function(){
            // get the latest values, not the ones of before the updatestatus call
        	newScope.query = $scope.recipeStatus.sql;
        	newScope.engine = $scope.recipeStatus.selectedEngine.type;
        	newScope.executionPlan = $scope.recipeStatus.executionPlan;
        	CreateModalFromTemplate("/templates/recipes/fragments/sql-modal.html", newScope);
        });
    };

    var save = $scope.baseSave;
    $scope.baseSave = function() {
        var p = save.apply(this, arguments);
        p.then($scope.updateRecipeStatusLater);
        return p;
    };

    $scope.$watchCollection("recipe.inputs.main.items", () => {
        //call updateRecipeStatus without args!
        Promise.resolve($scope.hooks.updateRecipeStatus()).catch(() => {
            Logger.info("Failed to updateRecipeStatus. Likely due to result of backend call discarded due to multiple parallel calls.");
        });
    });
    $scope.$watchCollection("recipe.outputs.main.items", () => {
        //call updateRecipeStatus without args!
        Promise.resolve($scope.hooks.updateRecipeStatus()).catch(() => {
            Logger.info("Failed to updateRecipeStatus. Likely due to result of backend call discarded due to multiple parallel calls.");
        });
    });

    $scope.$watch("params.engineParams", $scope.updateRecipeStatusLater, true);
});


app.controller("SqlModalController", function($scope, CodeMirrorSettingService) {

    $scope.editorOptions = CodeMirrorSettingService.get('text/x-sql2');

    // if ($scope.engine == 'HIVE' || $scope.engine == 'IMPALA' || $scope.engine == 'SPARK') {
    //     $scope.editorOptions.mode = 'text/x-hive';
    // }
});


app.directive("recipeEnginesPreferenceConfig", function(){
    return {
        restrict: 'A',
        templateUrl : '/templates/recipes/widgets/recipe-engines-preference-config.html',
        scope: {
            model: '='
        }
    }
});


app.service('RecipesEnginesService', function($rootScope, $q, Assert, CreateModalFromTemplate, DataikuAPI) {
    this.startChangeEngine = function(selectedItems) {
        return CreateModalFromTemplate("/templates/recipes/fragments/change-recipes-engines-modal.html", $rootScope, null, function(modalScope) {
            modalScope.selectedRecipes = selectedItems.filter(it => it.type == 'RECIPE');
            modalScope.options = {};
            modalScope.AUTO = '__AUTO__';

            modalScope.getEngineShortStatus = function(engine) {
                for(let msg of engine.messages.messages) {
                    if (msg.severity == "ERROR") {
                        return msg.details;
                    }
                }
                for(let msg of engine.messages.messages) {
                    if (msg.severity == "WARNING") {
                        return msg.details;
                    }
                }
            };

            DataikuAPI.flow.recipes.massActions.startChangeEngines(modalScope.selectedRecipes).success(function(data) {
                Assert.trueish(data.engines, 'no engines');
                modalScope.availableEngines = data.engines;
                modalScope.options.engine = data.currentEngine;
                modalScope.nUnselectableEngines = data.engines.filter(e => !e.isSelectable).length;
                modalScope.messages = data.messages;
            }).error(function(...args) {
                modalScope.fatalError = true;
                setErrorInScope.apply(modalScope, args);
            });


            modalScope.test = function() {
                const deferred = $q.defer();
                delete modalScope.messages;
                delete modalScope.maxSeverity;
                resetErrorInScope(modalScope);
                DataikuAPI.flow.recipes.massActions.testChangeEngines(modalScope.selectedRecipes, modalScope.options.engine).success(function(data) {
                    modalScope.messages = data.messages;
                    modalScope.maxSeverity = data.maxSeverity || 'OK';
                    if (modalScope.maxSeverity != 'OK') {
                        deferred.reject();
                    } else {
                        deferred.resolve(data)
                    }
                }).error(setErrorInScope.bind(modalScope));
                return deferred.promise;
            };

            modalScope.ok = function(force) {
                if (force || modalScope.options.engine == modalScope.AUTO) { //No need to test AUTO
                    performChange();
                } else {
                    modalScope.test().then(performChange);
                }
            };

            function performChange() {
                DataikuAPI.flow.recipes.massActions.changeEngines(modalScope.selectedRecipes, modalScope.options.engine).success(function(data) {
                    modalScope.resolveModal();
                }).error(setErrorInScope.bind(modalScope));
            }
        });
    };
});


app.directive("codeEnvSelectionForm", function(DataikuAPI, $stateParams){
    return {
        restrict: 'A',
        templateUrl : '/templates/recipes/fragments/code-env-selection-form.html',
        scope: {
            envSelection: '=codeEnvSelectionForm',
            inPlugin: '=',
            isStep: '=',
            envLang: '=',
            selectionLabel: '='
        },
        link: function($scope, element, attrs) {
            if ($scope.inPlugin == true) {
                $scope.envModes = [
                    ['USE_BUILTIN_MODE', 'Use plugin environment'],
                    ['EXPLICIT_ENV', 'Select an environment'],
                ];
            } else {
                $scope.envModes = [
                    ['USE_BUILTIN_MODE', 'Use DSS builtin env'],
                    ['INHERIT', 'Inherit project default'],
                    ['EXPLICIT_ENV', 'Select an environment']
                ];
            }

            function setDefaultValue() {
                if (!$scope.envSelection) { // not ready
                    return;
                }
                if ($scope.envSelection.envMode == "EXPLICIT_ENV" && $scope.envSelection.envName == null && $scope.envNamesWithDescs && $scope.envNamesWithDescs.envs && $scope.envNamesWithDescs.envs.length > 0) {
                    $scope.envSelection.envName = $scope.envNamesWithDescs.envs[0].envName;
                }
            }
            $scope.$watch("envSelection.envMode", setDefaultValue);

            $scope.envNamesWithDescs = [];
            console.info("list", $scope);
            DataikuAPI.codeenvs.listNamesWithDefault($scope.envLang, $stateParams.projectKey).success(function(data) {
                $scope.envNamesWithDescs = data;
                data.envs.forEach(function(x) {
                    if (x.owner) {
                        x.envDesc = x.envName + " (" + x.owner + ")";
                    } else {
                        x.envDesc = x.envName;
                    }
                });
                if (!$scope.inPlugin) {
                    if (data.resolvedInheritDefault == null) {
                        $scope.envModes[1][1] = "Inherit project default (DSS builtin env)"
                    } else {
                        $scope.envModes[1][1] = "Inherit project default (" + data.resolvedInheritDefault + ")";
                    }
                }
                setDefaultValue();
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("containerSelectionForm", function(DataikuAPI, $stateParams){
        return {
            restrict: 'A',
            templateUrl : '/templates/recipes/fragments/container-selection-form.html',
            scope: {
                containerSelection: '=containerSelectionForm',
                selectionLabel: '=',
                inPlugin: '='
            },
            link: {
                post: function($scope, element, attrs) {
                    $scope.containerModes = [
                        ['NONE', 'None - Use backend to execute'],
                        ['INHERIT', 'Inherit project default'],
                        ['EXPLICIT_CONTAINER', 'Select a container configuration'],
                    ];

                    $scope.containerNames = [];
                    if ($stateParams.projectKey) {
                        DataikuAPI.containers.listNamesWithDefault($stateParams.projectKey).success(function(data) {
                            $scope.containerNames = data.containerNames;
                            if (data.resolvedInheritValue) {
                                $scope.containerModes[1][1] += ' (' + data.resolvedInheritValue + ')';
                            } else {
                                $scope.containerModes[1][1] += ' (local execution)';
                            }
                        }).error(setErrorInScope.bind($scope));
                    } else {
                        DataikuAPI.containers.listNames($stateParams.projectKey).success(function(data) {
                            $scope.containerNames = data;
                        }).error(setErrorInScope.bind($scope));                    
                    }
                }
            }



        }
    });

/**
 * Inputs for specifying the container configuration to apply in the context of the hyperparameter search.
 * @param {object} searchParams: the parameters of the hyperparameter search (either from an analysis or a recipe)
 * @param {function} hasSelectedK8sContainer: tells whether the user has selected a k8s container to run the search
 */
app.component('mlHpDistribution', {
     templateUrl : '/templates/recipes/fragments/ml-hp-distribution.html',
     bindings: {
         searchParams: '=',
         hasSelectedK8sContainer: '<',
         k8sRuntimeEnvTooltip: '@?',
     },
     controller: function() {
         const $ctrl = this;

         $ctrl.getK8sRuntimeEnvTooltip = () => {
             if ($ctrl.k8sRuntimeEnvTooltip) {
                 return $ctrl.k8sRuntimeEnvTooltip;
             }

             return  "Distributed search requires a Kubernetes container configuration to be selected";
         };
     },
});

app.controller("_ContinuousRecipeInitStartedJobBehavior", function ($scope, $stateParams, DataikuAPI, Logger) {
    // get the current state
    DataikuAPI.continuousActivities.getState($stateParams.projectKey, $stateParams.recipeName).success(function(data) {
        $scope.startedJob = $scope.startedJob || {};
        $scope.startedJob.persistent = data;
        $scope.startedJob.current = data.mainLoopState;
        if (data.mainLoopState) {
            if (!data.mainLoopState.futureInfo || !data.mainLoopState.futureInfo.hasResult) {
                $scope.startedJob.jobId = data.mainLoopState.futureId;
                $scope.waitForEndOfStartedContinuousActivity();
            }
        }
    }).error(function() {
        Logger.warn("Recipe " + $stateParams.recipeName + " doesn't have a continuous activity yet")
    });
    
});

})();
