(function() {
'use strict';

const app = angular.module('dataiku.recipes.customcode', []);


app.controller("RecipeFromPluginCreationController", function($scope, DataikuAPI, WT1, $rootScope, CreateModalFromTemplate, SelectablePluginsService){
    $scope.uiState = {
        step : "choose-recipe"
    };
    $scope.recipes = [];

    $scope.$watch("pluginId", function(nv, ov) {
        if (!nv) return;
        $scope.plugin = Array.dkuFindFn($rootScope.appConfig.loadedPlugins, function(n){
            return n.id === nv
        });

        if ($scope.plugin) {
            $rootScope.appConfig.customCodeRecipes.forEach(function(recipe) {
                if (recipe.ownerPluginId == $scope.pluginId) {
                    $scope.recipes.push({
                        activated: SelectablePluginsService.canBeBuildFromInputs(recipe, $scope.inputCount),
                        preselectedInputs: getPreselectedInputs(recipe.desc, $scope.inputs),
                        preselectedRole: getPreselectedRole(recipe.desc, $scope.inputs),
                        recipeType: recipe.recipeType,
                        label: recipe.desc.meta.label,
                        description: recipe.desc.meta.description,
                        icon: recipe.desc.meta.icon || $scope.plugin.icon,
                        iconColor: recipe.desc.meta.iconColor,
                        displayOrderRank: recipe.desc.meta.displayOrderRank
                    });
                }
            });
        }

        function getPreselectedInputs(desc, inputs) {
            if (!inputs)
                return null;
            return (inputs.MANAGED_FOLDER || []).concat(inputs.DATASET || []).concat(inputs.SAVED_MODEL || [])
        }

        function getPreselectedRole(desc, inputs) {
            let preselectedRoles = [];
            if (!inputs) {
                return null;
            }
            if (inputs.DATASET && inputs.DATASET.length > 0 && desc.selectableFromDataset) {
                preselectedRoles[desc.selectableFromDataset] = inputs.DATASET;
            }
            if (inputs.MANAGED_FOLDER && inputs.MANAGED_FOLDER.length > 0 && desc.selectableFromFolder) {
                preselectedRoles[desc.selectableFromFolder] = inputs.MANAGED_FOLDER;
            }
            if (inputs.SAVED_MODEL && inputs.SAVED_MODEL.length > 0 && desc.selectableFromSavedModel) {
                preselectedRoles[desc.selectableFromSavedModel] = inputs.SAVED_MODEL;
            }
            return preselectedRoles;
        }

        $scope.recipes.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    });

    $scope.create = function(recipe, zoneId) {
        $scope.showCreateCustomCodeRecipeModal(recipe.recipeType, recipe.preselectedInputs, recipe.preselectedRole, zoneId);
    };
});


app.controller("CustomCodeRecipeCreationController", function($scope, Assert, DataikuAPI, WT1, $stateParams, TopNav, Fn, PartitionDeps,
               RecipeComputablesService, DatasetsService, $controller, $state, RecipesUtils, RecipeDescService, PluginConfigUtils){

    var realDismiss = $scope.dismiss;
    $scope.dismiss = function() {
        if (angular.isDefined($scope.oldScope)) {
            $scope.oldScope.dismiss();
        }
        realDismiss();
    };

    $controller("_RecipeCreationControllerBase", {$scope:$scope});

    $scope.helpState = {};

    $scope.recipeName = {};
    function init(){
        $scope.recipe = {
            projectKey : $stateParams.projectKey,
            type : $scope.newRecipeType,
            inputs: {}, outputs: {},
            params : {
                customConfig : {}
            },
            zone: $scope.zone
        }

        $scope.loadedDesc = $scope.appConfig.customCodeRecipes.filter(function(x){
            return x.recipeType == $scope.recipe.type;
        })[0];

        Assert.inScope($scope, 'loadedDesc');
        // clone, so that we can put additional flags in the roles
        $scope.desc = angular.copy($scope.loadedDesc.desc);

        // put default values in place
        PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.recipe.params.customConfig);

        $scope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
            return x.id == $scope.loadedDesc.ownerPluginId;
        })[0];

        RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
            $scope.setComputablesMap(map);
        });

        if ($scope.preselectedInputs) {
            for (let [inputType, ids] of Object.entries($scope.preselectedInputRole)) {
                ids.forEach(function(id) {
                    RecipesUtils.addInput($scope.recipe, inputType, id);
                })
            }
        }

    }
    $scope.$watch("newRecipeType", Fn.doIfNv(init));

    addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);
    DatasetsService.updateProjectList($stateParams.projectKey);

    // we will autofill the name if needed
    $scope.$watch("[recipe.inputs, recipe.outputs]", function(nv, ov) {
        if (nv && $scope.recipe && $scope.recipe.inputs && $scope.recipe.outputs) {
            if ($scope.preselectedInputs
                && !RecipesUtils.getFlatInputsList($scope.recipe).some(_ => _.ref === $scope.preselectedInputs[0])) {
                $scope.zone = null;
            }
            var outputs = RecipesUtils.getFlatOutputsList($scope.recipe);
            $scope.hasRequiredIO = RecipeDescService.hasValidRequiredRoles($scope.recipe);
            if (outputs.length && $scope.hasRequiredIO) {
                let firstNonNullOutput = outputs.find(o => !!o);
                // hasValidRequiredRoles does not imply that there is an output since plugin recipes could have several non-mandatory output roles
                // let's not fail here in that case, the backend should send back a proper error
                if (firstNonNullOutput) {
                    $scope.recipeName.name = "compute_" + firstNonNullOutput.ref;
                } else {
                    $scope.recipeName.name = null;
                }
            } else {
                $scope.recipeName.name = null;
            }
        }
    }, true);
});


app.controller("CustomCodeRecipeController", function($rootScope, $scope, Assert, DataikuAPI, WT1, $stateParams, StateUtils, TopNav, RecipesUtils, PluginConfigUtils, Logger, DatasetUtils) {
    $scope.loadedDesc = $scope.appConfig.customCodeRecipes.filter(function(x){
        return x.recipeType == $scope.recipe.type;
    })[0];

    Assert.inScope($scope, 'loadedDesc');
    // clone, so that we can put additional flags in the roles
    $scope.desc = angular.copy($scope.loadedDesc.desc);

    $scope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
        return x.id == $scope.loadedDesc.ownerPluginId;
    })[0];

    if ($scope.creation) {
        TopNav.setTab(StateUtils.defaultTab("io"));
    }

    if (!$scope.recipe.params) {
        $scope.recipe.params = {}
    }
    if (!$scope.recipe.params.customConfig){
        $scope.recipe.params.customConfig = {}
    }

    $scope.anyPipelineTypeEnabled = function() {
        return $rootScope.projectSummary.sparkPipelinesEnabled;
    };

    $scope.columnsPerInputRole = {};
    PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.recipe.params.customConfig);
    /* In addition to default values, set properly the columns stuff */
    $scope.desc.params.forEach(function(param) {
    	if ($scope.recipe.params.customConfig[param.name] === undefined) {
        	if ( param.type == "COLUMNS" ) {
        		// the dku-list-typeahead expects something not null
        		$scope.recipe.params.customConfig[param.name] = [];
        	}
    	}
    	if (param.columnRole != null) {
    		$scope.columnsPerInputRole[param.columnRole] = [];
    	}
    });

    $scope.enableAutoFixup();

    function refreshColumnListsFromComputablesMap() {
        if (!$scope.computablesMap) { // not ready
            return;
        }
        DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, $stateParams.projectKey).then(function(){
            for (const roleName in $scope.recipe.inputs) {
                $scope.columnsPerInputRole[roleName] = [];
                const items = RecipesUtils.getInputsForRole($scope.recipe, roleName);
                items.forEach(function(item) {
                    const computable = $scope.computablesMap[item.ref];
                    if (computable == null) {
                        Logger.error("Computable not found for " + item.ref);
                    } else {
                        if (!(roleName in $scope.columnsPerInputRole)) {
                            $scope.columnsPerInputRole[roleName] = [];
                        }
                        if (computable.dataset) {
                            $scope.columnsPerInputRole[roleName] = $scope.columnsPerInputRole[roleName].concat(computable.dataset.schema.columns);
                        }
                    }
                });
            }
        });
    }

    $scope.roleChanged = function(roleName) {
        // clear first, in case the inputs of this role are all gone
    	$scope.columnsPerInputRole[roleName] = [];
    	// then compute the new list, when non empty
    	const inputs = RecipesUtils.getInputsForRole($scope.recipe, roleName);
        inputs.forEach(function(input) {
            const computable = $scope.computablesMap[input.ref];
            if (computable == null) {
                Logger.error("Computable not found for " + input.ref);
            } else {
                if (computable.dataset) {
                    $scope.columnsPerInputRole[roleName] = $scope.columnsPerInputRole[roleName].concat(computable.dataset.schema.columns);
                }
            }
        });
    };

    $scope.toggleShowRequirements = function() {
    	if ( $scope.showRequirements === undefined ) {
    		$scope.showRequirements = false;
    		// first time : fetch requirements from the backend, with the command line to install them
    	    DataikuAPI.flow.recipes.getRequirements($stateParams.projectKey, $scope.recipe.type).success(function(data){
    	    	$scope.requirements = data;
    	    }).error(setErrorInScope.bind($scope));
    	}
    	$scope.showRequirements = !$scope.showRequirements;
    };

    refreshColumnListsFromComputablesMap();
    $scope.$on('computablesMapChanged', function() {
    	refreshColumnListsFromComputablesMap();
    });
});


app.controller("AppRecipeCreationController", function($scope, Assert, DataikuAPI, WT1, $stateParams, TopNav, Fn, PartitionDeps,
               RecipeComputablesService, DatasetsService, $controller, $state, RecipesUtils, RecipeDescService, PluginConfigUtils){

    var realDismiss = $scope.dismiss;
    $scope.dismiss = function() {
        if (angular.isDefined($scope.oldScope)) {
            $scope.oldScope.dismiss();
        }
        realDismiss();
    };

    $controller("_RecipeCreationControllerBase", {$scope:$scope});

    $scope.helpState = {};

    $scope.recipeName = {};
    function init(){
        $scope.recipe = {
            projectKey : $stateParams.projectKey,
            type : $scope.newRecipeType,
            inputs: {}, outputs: {},
            params : {
                customConfig : {}
            }
        }

        $scope.loadedDesc = $scope.appConfig.appRecipes.filter(function(x){
            return x.recipeType == $scope.recipe.type;
        })[0];

        Assert.inScope($scope, 'loadedDesc');
        // clone, so that we can put additional flags in the roles
        $scope.desc = angular.copy($scope.loadedDesc);

        RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
            $scope.setComputablesMap(map);
        });

        if ($scope.preselectedInputs) {
            $scope.preselectedInputs.forEach( (preselectedInput) => {
                RecipesUtils.addInput($scope.recipe, $scope.preselectedInputRole, preselectedInput);
            });
        }

    }
    $scope.$watch("newRecipeType", Fn.doIfNv(init));

    addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);
    DatasetsService.updateProjectList($stateParams.projectKey);

    // we will autofill the name if needed
    $scope.$watch("[recipe.inputs, recipe.outputs]", function(nv, ov) {
        if (nv && $scope.recipe && $scope.recipe.inputs && $scope.recipe.outputs){
            var outputs = RecipesUtils.getFlatOutputsList($scope.recipe);
            if (outputs.length) {
                let firstNonNullOutput = outputs.find(o => !!o);
                if (firstNonNullOutput) {
                    $scope.recipeName.name = "compute_" + firstNonNullOutput.ref;
                } else {
                    $scope.recipeName.name = null;
                }
            } else {
                $scope.recipeName.name = null;
            }
        }
    }, true);
});


app.controller("AppRecipeController", function($rootScope, $scope, Assert, DataikuAPI, WT1, $state, $stateParams, StateUtils, TopNav, RecipesUtils, PluginConfigUtils, Logger, DatasetUtils) {
    $scope.loadedDesc = $scope.appConfig.appRecipes.filter(function(x){
        return x.recipeType == $scope.recipe.type;
    })[0];
    Assert.inScope($scope, 'loadedDesc');
    // clone, so that we can put additional flags in the roles
    $scope.desc = angular.copy($scope.loadedDesc);

    TopNav.setTab("settings");

    if (!$scope.recipe.params) {
        $scope.recipe.params = {}
    }
    if (!$scope.recipe.params.variables){
        $scope.recipe.params.variables = {}
    }

    $scope.desc.variablesEditionTile.behavior = 'INLINE_AUTO_SAVE'; // it's a bit of a lie, but that way you don't have the save button next to the form
    
    $scope.columnsPerInputRole = {};

    $scope.enableAutoFixup();

    function refreshColumnListsFromComputablesMap() {
        if (!$scope.computablesMap) { // not ready
            return;
        }
        DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, $stateParams.projectKey).then(function(){
            for(var roleName in $scope.recipe.inputs) {
                $scope.columnsPerInputRole[roleName] = [];
                var items = RecipesUtils.getInputsForRole($scope.recipe, roleName);
                if (items.length > 0) {
                    var input = items[0];
                    var computable = $scope.computablesMap[input.ref];
                    if (computable == null) {
                        Logger.error("Computable not found for " + input.ref);
                    } else {
                        $scope.columnsPerInputRole[roleName] = computable.dataset ? computable.dataset.schema.columns : [];
                    }
                }
            }
        });
    }
    $scope.roleChanged = function(roleName) {
        // clear first, in case the inputs of this role are all gone
        $scope.columnsPerInputRole[roleName] = [];
        // then compute the new list, when non empty
        const inputs = RecipesUtils.getInputsForRole($scope.recipe, roleName);
        if (inputs.length > 0) {
            const computable = $scope.computablesMap[inputs[0].ref];
            if (computable == null) {
                Logger.error("Computable not found for " + input.ref);
            } else {
                $scope.columnsPerInputRole[roleName] = computable.dataset ? computable.dataset.schema.columns : [];
            }
        }
    };

    refreshColumnListsFromComputablesMap();
    $scope.$on('computablesMapChanged', function() {
        refreshColumnListsFromComputablesMap();
    });
    
    $scope.hasParameters = function() {
        let tile = $scope.desc ? $scope.desc.variablesEditionTile : null;
        if (!tile) return false;
        return (tile.html && tile.html.length > 0) || (tile.params && tile.params.length > 0);
    };
    
    DataikuAPI.apps.getAppRecipeUsability($scope.recipe.type).success(function(data){
        $scope.usability = data;
    }).error(setErrorInScope.bind($scope));
    
    $scope.canGoToDesigner = function() {
        if (!$scope.usability) return false;
        return $scope.usability.canEdit;
    };
    $scope.goToDesigner = function() {
        if (!$scope.usability) return;
        if ($scope.usability.origin == 'PROJECT') {
            $state.go('projects.project.appdesigner', {projectKey : $scope.usability.projectKey});
        } else if ($scope.usability.origin == 'PLUGIN') {
            $state.go('projects.project.appdesigner', {projectKey : $scope.desc.recipeType.substring('App_PROJECT_'.length)});
        }
    };
});


})();