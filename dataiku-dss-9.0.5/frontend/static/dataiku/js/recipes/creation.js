(function(){
'use strict';

const app = angular.module('dataiku.recipes');


app.controller("_RecipeCreationControllerBase", function($scope, WT1, Dialogs, PartitionDeps, DataikuAPI, RecipeDescService, Logger) {
    $scope.setComputablesMap = function(map) {
        $scope.computablesMap = map;
        $scope.$broadcast('computablesMapChanged');
    };

    $scope.recipeWT1Event = function(type, params) {
        if (params == null) params = {}
        params.recipeId = ($scope.recipeName && $scope.recipeName.name) ? $scope.recipeName.name.dkuHashCode() : "unknown";
        params.recipeType = ($scope.recipe ? $scope.recipe.type : "unknown");
        params.creation = $scope.creation;
        WT1.event(type, params);
    };

    // Creates the recipe object and sends it to the backend
    // Default generic implementation, override it in the recipe controller for type specific handling
    $scope.doCreateRecipe = function() {
        var recipe = angular.copy($scope.recipe);
        if ($scope.recipeName) {
            recipe.name = $scope.recipeName.name; // TODO @recipes move to backend
        }
        PartitionDeps.prepareRecipeForSerialize(recipe); //TODO @recipes move to backend

        const settings = {
            script: $scope.script
        };
        if ($scope.zone) {
            settings.zone = $scope.zone;
        }

        return DataikuAPI.flow.recipes.generic.create(recipe, settings);
    };

    // launches the recipe creation and triggers associated events
    // for tracking, disabling creation button while the recipe is in creation, etc
    // transitions to the recipe page when it is creations
    $scope.createRecipe = function() {
        $scope.recipeWT1Event("recipe-create-" + $scope.recipeType);
        var p = $scope.doCreateRecipe();
        if (p) {
            $scope.creatingRecipe = true;
            p.success(function(data) {
                $scope.creatingRecipe = false;
                Dialogs.confirmInfoMessages($scope.$parent.$parent, "Recipe creation", data.messages, null, true).then(function(){
                    $scope.$state.go('projects.project.recipes.recipe', {recipeName: data.id});
                })
                $scope.dismiss();


            }).error(function(a, b, c) {
                $scope.creatingRecipe = false;
                setErrorInScope.bind($scope)(a,b,c);
            });
        }
    };

    function updateRecipeDesc() {
        $scope.recipeDesc = RecipeDescService.getDescriptor($scope.recipe.type);
        $scope.isSingleInputRecipe = RecipeDescService.isSingleInputRecipe($scope.recipe.type);
        $scope.isSingleInputRecipe = RecipeDescService.isSingleInputRecipe($scope.recipe.type);
    }

    if ($scope.recipe && $scope.recipe.type) {
        updateRecipeDesc();
    } else {
        $scope.$watch("recipe.type", function(nv) {
            nv && updateRecipeDesc();
        });
    }
});


app.controller("RecipeCopyController", function($scope, $controller, $stateParams,
               Assert, DataikuAPI, DatasetUtils, RecipeComputablesService, RecipeDescService, SavedModelsService, Logger) {
    Assert.inScope($scope, 'recipe');
    Assert.inScope($scope, 'newInputs');
    Assert.inScope($scope, 'newOutputs');

    $controller("_RecipeCreationControllerBase", {$scope: $scope});
    $controller("_RecipeOutputNewManagedBehavior", {$scope:$scope});
    addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);

    // to use the _RecipeOutputNewManagedBehavior fully (when adding a new output)
    $scope.setErrorInTopScope = function(scope) {
        return setErrorInScope.bind($scope);
    };

    $scope.role = null;

    function endEditOutput() {
        $scope.uiState.editingOutput = null;
        $scope.role = null;
    }

    $scope.setupUsableOutputs = function (role, acceptedType) {
        if (!$scope.computablesMap) {
            return;
        }
        Assert.trueish(role, 'no role');

        $scope.role = role;
        var roleName = role.name;
        $scope.noDataset = acceptedType != 'DATASET';
        $scope.noFolder = acceptedType != 'MANAGED_FOLDER';
        $scope.noEvaluationStore = acceptedType != 'MODEL_EVALUATION_STORE';
        $scope.noStreamingEndpoint = acceptedType != 'STREAMING_ENDPOINT';
        if (!$scope.noDataset) {
            $scope.io.newOutputTypeRadio = 'create';
        } else if (!$scope.noFolder) {
            $scope.io.newOutputTypeRadio = 'new-odb';
        } else if (!$scope.noEvaluationStore) {
            $scope.io.newOutputTypeRadio = 'new-mes';
        } else if (!$scope.noStreamingEndpoint) {
            $scope.io.newOutputTypeRadio = 'new-se';
        }

        var outputList = RecipeComputablesService.buildPossibleOutputList($scope.recipe, $scope.computablesMap, $scope.role, $scope.editOutput.filter)
            .filter(function(item) {
                return usableAsOutput(item);
            });

        // Sort possible outputs
        function usableAsOutput(computable) {
            return computable.usableAsOutput[roleName] && computable.usableAsOutput[roleName].usable && !computable.alreadyUsedAsOutputOf;
        }
        outputList.sort(function(a,b) {
            // put usable first
            if (usableAsOutput(a) && !usableAsOutput(b)) {
                return -1;
            }
            if (usableAsOutput(b) && !usableAsOutput(a)) {
                return 1;
            }
            //Otherwise sort by "label" (display name)
            return (a.label || '').localeCompare((b.label || ''));
        });

        $scope.editOutput.usable = outputList;
    };


    $scope.startEditOutput = function(roleName, index) {
        $scope.uiState.backendWarnings = null;
        $scope.uiState.editingOutput = {role: roleName, index: index};
        var outputName = $scope.recipe.outputs[roleName].items[index].ref;
        var computableType = $scope.computablesMap[outputName].type;

        if ($scope.outputRolesIndex == null || !$scope.outputRolesIndex[roleName]) {
            // This should not happen, maybe a new custom type was added and descriptors are not up-to-date
            throw new Error("Role not found in recipe descriptor, try reloading the page");
        }
        $scope.setupUsableOutputs($scope.outputRolesIndex[roleName], computableType);

        // the select element seems to be caching something, and after hiding and showing the
        // create new dataset form a few times (2 times on firefox, 3 on chrome) the option
        // shown to be selected is incorrect ('nothing selected' but the option is not null).
        // it's probably a race condition somewhere, so we solve it the hard way: make the
        // select reinitialize its sate each  time
        $scope.newOutputDataset.connectionOption = null;
        $scope.getManagedDatasetOptions($scope.role.name).then(function(data){
            $scope.setupManagedDatasetOptions(data);
        });
        $scope.getManagedFolderOptions($scope.role.name).then(function(data){
            $scope.setupManagedFolderOptions(data);
        });
        $scope.getModelEvaluationStoreOptions($scope.role.name).then(function(data){
            $scope.setupModelEvaluationStoreOptions(data);
        });
        $scope.getStreamingEndpointOptions($scope.role.name).then(function(data){
            $scope.setupStreamingEndpointOptions(data);
        });
    };

    //Called by a click on close new output
    $scope.cancelAddOutput = function() {
        endEditOutput();
    };

    $scope.acceptEdit = function(computable) {
        var editingOutput = $scope.uiState.editingOutput;
        $scope.newOutputs[editingOutput.role].items[editingOutput.index] = {ref: computable.smartName};
        endEditOutput();
    };

    // We should have a replacement for each input/output
    $scope.formIsValid = function() {
        if ($scope.isSingleOutputRecipe) {
            if ($scope.io.newOutputTypeRadio == 'create') {
                return $scope.newOutputDataset &&
                    $scope.newOutputDataset.name &&
                    $scope.newOutputDataset.connectionOption &&
                    $scope.isDatasetNameUnique($scope.newOutputDataset.name);
            } else if ($scope.io.newOutputTypeRadio == 'new-se') {
                return $scope.newOutputSE &&
                    $scope.newOutputSE.name &&
                    $scope.newOutputSE.connectionOption &&
                    $scope.isStreamingEndpointNameUnique($scope.newOutputSE.name);
            } else if ($scope.io.newOutputTypeRadio == 'select') {
                return $scope.io.existingOutputDataset && $scope.io.existingOutputDataset.length;
            } else {
                return false;
            }
        } else {
            var valid = true;
            $.each($scope.newInputs, function(roleName, role) {
                role.items.forEach(function(input) {
                    if (!input || !input.ref) {
                        valid = false;
                    }
                });
            });
            $.each($scope.newOutputs, function(roleName, role) {
                role.items.forEach(function(output) {
                    if (!output || !output.ref) {
                        valid = false;
                    }
                });
            });
            return valid;
        }
    };

    // Clicked on "create recipe", force=true to ignore warnings
    $scope.copy = function(force) {
        var doIt = function() {
            $scope.recipeWT1Event("recipe-copy-" + $scope.recipe.type);

            $scope.creatingRecipe = true; // for ui, avoids clicking twice on create recipe

            // Single ouput recipes have a simpler UI with different models to store the data
            var copySettings;
            if ($scope.isSingleOutputRecipe) {
                var createOutput = $scope.io.newOutputTypeRadio == 'create';
                var outputName = $scope.io.newOutputTypeRadio == 'create' ? $scope.newOutputDataset.name : ($scope.io.newOutputTypeRadio == 'new-se' ? $scope.newOutputSE.name : $scope.io.existingOutputDataset);
                var singleOutputRoleName = Object.keys($scope.newOutputs)[0];
                var outputs = {}
                outputs[singleOutputRoleName] = {items: [{ref: outputName}]}
                copySettings = {
                    zone: $scope.zone,
                    inputs : $scope.newInputs,
                    outputs : outputs,
                    createOutputDataset : $scope.io.newOutputTypeRadio == 'create',
                    createOutputStreamingEndpoint : $scope.io.newOutputTypeRadio == 'new-se',
                    outputDatasetSettings : $scope.getDatasetCreationSettings(),
                    outputStreamingEndpointSettings : $scope.getStreamingEndpointCreationSettings()
                };
            } else {
                copySettings = {
                    zone: $scope.zone,
                    inputs : $scope.newInputs,
                    outputs : $scope.newOutputs
                };
            }

            DataikuAPI.flow.recipes.generic.copy($stateParams.projectKey,
                                                 $scope.recipe.projectKey,
                                                 $scope.recipe.name,
                                                 copySettings)
            .success(function(data){
                $scope.creatingRecipe = false;
                $scope.dismiss();
                $scope.$state.go('projects.project.recipes.recipe', {
                    recipeName: data.id
                });
            }).error(function(a, b, c) {
                $scope.creatingRecipe = false;
                setErrorInScope.bind($scope)(a,b,c);
            });
        };

        if (!$scope.isSingleOutputRecipe || ['select', 'new-odb', 'new-se'].indexOf($scope.io.newOutputTypeRadio) >= 0 || force) {
            doIt();
        } else {
            DataikuAPI.datasets.checkNameSafety($stateParams.projectKey, $scope.newOutputDataset.name, $scope.getDatasetCreationSettings())
                .success(function(data) {
                    $scope.uiState.backendWarnings = data.messages;
                    if (!data.messages || !data.messages.length) {
                        doIt();
                    }
                })
                .error(function(){
                    Logger.error("Check name failed.", arguments);
                    doIt(); // don't block the creation
                });
        }
    };

    $scope.editOutput = {filter: ''};
    $scope.uiState = $scope.uiState || {};
    $scope.uiState.editingOutput = null;

    var index = RecipeDescService.getRolesIndex($scope.recipe.type);
    $scope.inputRolesIndex = index.inputs;
    $scope.outputRolesIndex = index.outputs;

    // Init new outputs with the same roles as original recipe outputs
    // Also count inputs/outputs to adapt UI
    var nOutputs = 0;
    var nInputs = 0;
    $.each($scope.recipe.outputs, function(roleName, role) {
        $scope.newOutputs[roleName] = {items: $scope.recipe.outputs[roleName].items.map(function(){return null;})};
        nOutputs += role.items.length;
    });
    $.each($scope.recipe.inputs, function(roleName, role) {
        nInputs += role.items.length;
    });

    $scope.hasSingleOutput = nOutputs == 1;
    $scope.hasSingleInput = nInputs == 1;
    $scope.isSingleOutputRecipe = RecipeDescService.isSingleOutputRecipe($scope.recipe.type);

    RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then($scope.setComputablesMap);

    DatasetUtils.listUsabilityInAndOut($scope.recipe.projectKey, $scope.recipe.type).then(function(data) {
        // Compute usable inputs for each role
        $scope.availableInputDatasets = {}
        $scope.availableInputFolders = {};
        $scope.availableInputModels = {};
        $scope.availableInputEndpoints = {};
        $scope.recipeDesc.inputRoles.forEach(function(role) {
            $scope.availableInputDatasets[role.name] = data[0].filter(function(computable) {
                return computable.type == 'DATASET' && computable.usableAsInput[role.name] && computable.usableAsInput[role.name].usable;
            });
            $scope.availableInputFolders[role.name] = data[0].filter(function(computable) {
                return computable.type == 'MANAGED_FOLDER' && computable.usableAsInput[role.name] && computable.usableAsInput[role.name].usable;
            });
            $scope.availableInputModels[role.name] = data[0].filter(function(computable) {
                if (computable.type != 'SAVED_MODEL') {
                    return false;
                }
                if (($scope.recipe.type == 'prediction_scoring' || $scope.recipe.type == 'evaluation') && computable.model.miniTask.taskType != 'PREDICTION') {
                    return false;
                } else if ($scope.recipe.type == 'clustering_scoring' && computable.model.miniTask.taskType != 'CLUSTERING') {
                    return false;
                }
                return computable.usableAsInput[role.name] && computable.usableAsInput[role.name].usable;
            });
            $scope.availableInputEndpoints[role.name] = data[0].filter(function(computable) {
                return computable.type == 'STREAMING_ENDPOINT' && computable.usableAsInput[role.name] && computable.usableAsInput[role.name].usable;
            });
        });
    });

    $scope.$watch("editOutput.filter", function() {
        try {
            if (!$scope.uiState.editingOutput) return;
            var roleName = $scope.uiState.editingOutput.role;
            var index = $scope.uiState.editingOutput.index; //index within role
            var outputName = $scope.recipe.outputs[roleName].items[index].ref;
            var computableType = $scope.computablesMap[outputName].type;
            $scope.setupUsableOutputs($scope.role, computableType);
        } catch (e) {
            Logger.error("Filter output failed", e)
        }
    });
});


app.controller("SingleOutputRecipeCopyController", function($scope, $controller, $stateParams, Assert, DataikuAPI, DatasetUtils, RecipeComputablesService) {
    Assert.inScope($scope, 'recipeDesc');
    Assert.trueish($scope.recipeDesc.outputRoles, 'no output roles');

    $scope.role = $scope.recipeDesc.outputRoles[0];

    var updateUsableOutputs = function() {
        var outputName = $scope.recipe.outputs[$scope.role.name].items[0].ref;
        var computableType = $scope.computablesMap[outputName].type;
        $scope.setupUsableOutputs($scope.role, computableType);
    };

    var updateManagedDatasetOptions = function(forceUpdate) {
        var fakeRecipe = angular.copy($scope.recipe);
        fakeRecipe.projectKey = $stateParams.projectKey;
        fakeRecipe.inputs = $scope.newInputs;
        DataikuAPI.datasets.getManagedDatasetOptions(fakeRecipe, $scope.role.name).success(function(data) {
            $scope.setupManagedDatasetOptions(data, forceUpdate);
        });
        DataikuAPI.datasets.getManagedFolderOptions(fakeRecipe, $scope.role.name).success(function(data) {
            $scope.setupManagedFolderOptions(data, forceUpdate);
        });
        DataikuAPI.datasets.getModelEvaluationStoreOptions(fakeRecipe, $scope.role.name).success(function(data) {
            $scope.setupModelEvaluationStoreOptions(data, forceUpdate);
        });
        DataikuAPI.datasets.getStreamingEndpointOptions(fakeRecipe, $scope.role.name).success(function(data) {
            $scope.setupStreamingEndpointOptions(data, forceUpdate);
        });
    };

    updateUsableOutputs();
    updateManagedDatasetOptions();

    $scope.$watch("sourceRecipe", function(nv) {
        if (!nv) return;
        updateManagedDatasetOptions(true);
    });

    $scope.$watch("computablesMap", function(nv) {
        if (!nv) return;
        updateUsableOutputs();
    });
});


app.controller("SingleOutputDatasetRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $q,Dialogs, DatasetsService, WT1, DatasetUtils, $controller, RecipeComputablesService, Logger, SmartId) {
    $controller("_RecipeCreationControllerBase", {$scope:$scope});
    $controller("_RecipeOutputNewManagedBehavior", {$scope:$scope});

    addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);

    // for safety, to use the _RecipeOutputNewManagedBehavior fully (maybe one day)
    $scope.setErrorInTopScope = function(scope) {
        return setErrorInScope.bind($scope);
    };
    
    $scope.singleOutputRole = {name:"main", arity:"UNARY", acceptsDataset:true};

    var updateManagedDatasetOptions = function(recipeType, inputRef, forceUpdate) {
        var fakeRecipe = {
            type : recipeType,
            projectKey : $stateParams.projectKey,
        }
        if (inputRef) {
            fakeRecipe.inputs = {main : {items : [{ref : inputRef}]}};
        }
        DataikuAPI.datasets.getManagedDatasetOptions(fakeRecipe, "main").success(function(data) {
            $scope.setupManagedDatasetOptions(data, forceUpdate);
        });
        DataikuAPI.datasets.getManagedFolderOptions(fakeRecipe, "main").success(function(data) {
            $scope.setupManagedFolderOptions(data, forceUpdate);
        });
        DataikuAPI.datasets.getModelEvaluationStoreOptions(fakeRecipe, "main").success(function(data) {
            $scope.setupModelEvaluationStoreOptions(data, forceUpdate);
        });
        DataikuAPI.datasets.getStreamingEndpointOptions(fakeRecipe, "main").success(function(data) {
            $scope.setupStreamingEndpointOptions(data, forceUpdate);
        });
    };

    $scope.maybeSetNewDatasetName = function(newName) {
        if ($scope.newOutputDataset && !$scope.newOutputDataset.name && newName) {
            $scope.newOutputDataset.name = newName;
        }
    };

    var makeMainRole = function (refs) {
        return {
            main: {
                items: refs.filter(function(ref) {return !!ref;}).map(function(ref) {return {ref: ref}; })
            }
        }
    };

    // Override to gather recipe type specific settings
    $scope.getCreationSettings = function () {
        return {};
    }

    // Creates the recipe object and sends it to the backend
    $scope.doCreateRecipe = function() {
        var createOutput = $scope.io.newOutputTypeRadio == 'create' || $scope.io.newOutputTypeRadio == 'new-se';
        var outputName = $scope.io.newOutputTypeRadio == 'create' ? $scope.newOutputDataset.name : ($scope.io.newOutputTypeRadio == 'new-se' ? $scope.newOutputSE.name : $scope.io.existingOutputDataset);
        var inputs = $scope.recipe && $scope.recipe.inputs ? $scope.recipe.inputs : makeMainRole([$scope.io.inputDataset]);
        var recipe = {
            type: $scope.recipeType,
            projectKey: $stateParams.projectKey,
            name: "compute_" + outputName, //TODO @recipes remove,

            inputs: inputs,
            outputs: makeMainRole([outputName]),
        };

        const settings = $scope.getCreationSettings();
        if ($scope.zone) {
            settings.zone = $scope.zone;
        }
        settings.createOutputDataset = $scope.io.newOutputTypeRadio == 'create';
        settings.createOutputStreamingEndpoint = $scope.io.newOutputTypeRadio == 'new-se';
        settings.outputDatasetSettings = $scope.getDatasetCreationSettings();
        settings.outputStreamingEndpointSettings = $scope.getStreamingEndpointCreationSettings();

        return DataikuAPI.flow.recipes.generic.create(recipe, settings);
    };

    var createRecipeAndDoStuff = $scope.createRecipe;
    // Called from UI, force means that no check-name-safety call is done
    $scope.createRecipe = function(force) {
        if (['select', 'new-odb', 'new-se'].indexOf($scope.io.newOutputTypeRadio) >= 0 || force) {
            createRecipeAndDoStuff();
        } else {
            DataikuAPI.datasets.checkNameSafety($stateParams.projectKey, $scope.newOutputDataset.name, $scope.getDatasetCreationSettings())
                .success(function(data) {
                    $scope.uiState.backendWarnings = data.messages;
                    if (!data.messages || !data.messages.length) {
                        createRecipeAndDoStuff();
                    }
                })
                .error(function(){
                    Logger.error("Check name failed.", arguments);
                    createRecipeAndDoStuff(); // don't block the creation
                });
        }
    };

    $scope.showOutputPane = function() {
        return !!$scope.io.inputDataset;
    };

    $scope.subFormIsValid = function() { return true; }; // overridable by sub-controllers for additional checks
    $scope.formIsValid = function() {
        if (!$scope.subFormIsValid()) return false;
        if (!($scope.io.inputDataset && $scope.activeSchema && $scope.activeSchema.columns && $scope.activeSchema.columns.length)) return false;
        if ($scope.io.newOutputTypeRadio == 'create') {
            return $scope.newOutputDataset && $scope.newOutputDataset.name && $scope.newOutputDataset.connectionOption && $scope.isDatasetNameUnique($scope.newOutputDataset.name);
        } else if ($scope.io.newOutputTypeRadio == 'new-se') {
            return $scope.newOutputSE && $scope.newOutputSE.name && $scope.newOutputSE.connectionOption && $scope.isStreamingEndpointNameUnique($scope.newOutputSE.name);
        } else if ($scope.io.newOutputTypeRadio == 'select') {
            return $scope.io.existingOutputDataset && $scope.io.existingOutputDataset.length;
        } else {
            return false;
        }
    };
    
    let updateInputDatasetSchema = function() {
        if ($scope.availableInputDatasets == null) return;
        if (!$scope.io.inputDataset) return;
        let resolvedSmartId = SmartId.resolve($scope.io.inputDataset, contextProjectKey);
        // get the object to first assert that we need to grab the schema
        let availableInput = $scope.availableInputDatasets.filter(o => o.name == resolvedSmartId.id && o.projectKey == resolvedSmartId.projectKey)[0];
        if (availableInput == null || availableInput.type == 'DATASET') {
            DataikuAPI.datasets.get(resolvedSmartId.projectKey, resolvedSmartId.id, contextProjectKey).success(function(data){
                $scope.activeSchema = data.schema;
            }).error(setErrorInScope.bind($scope));
        } else if (availableInput.type == 'STREAMING_ENDPOINT') {
            DataikuAPI.streamingEndpoints.get(resolvedSmartId.projectKey, resolvedSmartId.id).success(function(data){
                $scope.activeSchema = data.schema;
            }).error(setErrorInScope.bind($scope));
        } else {
            // other objects don't have a schema
            $scope.activeSchema = {columns:[]};
        }
    };

    var inputsIndex = {};
    DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, $scope.recipeType, $scope.datasetsOnly).then(function(data){
        $scope.availableInputDatasets = data[0];
        if ($scope.filterUsableInputsOn) {
            $scope.availableInputDatasets.forEach(function(c) {
                let usability = c.usableAsInput[$scope.filterUsableInputsOn] || {};
                c.usable = usability.usable;
                c.usableReason = usability.reason;
            });
        } else if ($scope.inputDatasetsOnly) {
            $scope.availableInputDatasets = data[0].filter(function(computable){
                return computable.usableAsInput['main'] && computable.usableAsInput['main'].usable;
            });
        }
        $scope.availableOutputDatasets = data[1].filter(function(computable){
            return computable.usableAsOutput['main'] && computable.usableAsOutput['main'].usable && !computable.alreadyUsedAsOutputOf;
        });
        $scope.availableInputDatasets.forEach(function(it) {
            inputsIndex[it.id] = it;
        });
        updateInputDatasetSchema(); // if the inputDataset arrived before the availableInputDatasets
    });

    let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey:$stateParams.projectKey;
    $scope.$on("preselectInputDataset", function(scope, preselectedInputDataset) {
        $scope.io.inputDataset = preselectedInputDataset;
        $scope.preselectedInputDataset = preselectedInputDataset;
    });
    $scope.$watch("io.inputDataset", Fn.doIfNv(function() {
        if ($scope.preselectedInputDataset && $scope.io.inputDataset != $scope.preselectedInputDataset){
            $scope.zone = null;
        }
        $scope.autosetName();

        updateInputDatasetSchema();
        
        updateManagedDatasetOptions($scope.recipeType, $scope.io.inputDataset, true);
    }));
    $scope.$watch("io.inputDataset2", Fn.doIfNv(function() {
        let resolvedSmartId = SmartId.resolve($scope.io.inputDataset2, contextProjectKey);
        DataikuAPI.datasets.get(resolvedSmartId.projectKey, resolvedSmartId.id, contextProjectKey).success(function(data){
            $scope.activeSchema2 = data.schema;
        }).error(setErrorInScope.bind($scope));
    }));
});


})();