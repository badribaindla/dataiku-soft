(function() {
'use strict';

const app = angular.module('dataiku.recipes');


app.service("RecipesUtils", function(Assert, Logger, $filter){
    var svc = {
        isMLRecipe: function(recipe){
            return recipe.type in {
                "prediction_training" : true,
                "prediction_scoring" : true,
                "clustering_training" : true,
                "clustering_scoring" : true,
                "clustering_complete" : true,
                "evaluation": true,
                "standalone_evaluation": true
            };
        },

        getInputsForRole: function(recipe, role) {
            if (recipe.inputs[role] != null) return recipe.inputs[role].items;
            return [];
        },
        getOutputsForRole: function(recipe, role) {
            if (recipe.outputs[role] != null) return recipe.outputs[role].items;
            return [];
        },

        getFlatInputsList: function(recipe) {
            var flat =[];
            $.each(recipe.inputs, function(roleName, roleData){
                flat = flat.concat(roleData.items);
            });
            return flat;
        },
        getFlatOutputsList: function(recipe) {
            Assert.trueish(recipe, 'no recipe');
            var flat =[];
            $.each(recipe.outputs, function(roleName, roleData){
               flat = flat.concat(roleData.items);
            });
            return flat;
        },
        getFlatIOList: function(recipe) {
            return svc.getFlatInputsList(recipe).concat(svc.getFlatOutputsList(recipe));
        },

        hasAnyPartitioning: function(recipe, computablesMap) {
            var hap = svc.getFlatIOList(recipe).some(function(input){
                var computable = computablesMap[input.ref];
                if (computable == null) {
                    Logger.error("Computable not found for " + input.ref);
                    return false;
                }
                const partitioning = $filter('retrievePartitioning')(computable);
                return partitioning && partitioning.dimensions && partitioning.dimensions.length;
            });
            return hap;
        },

        addInput: function(recipe, role, ref) {
            if (recipe.inputs == null) recipe.inputs = {};
            if (recipe.inputs[role] == null) recipe.inputs[role] = { items : [] }
            recipe.inputs[role].items.push({ref:ref, deps : []});
        },
        addOutput: function(recipe, role, ref) {
            if (recipe.outputs == null) recipe.outputs = {};
            if (!recipe.outputs[role]) recipe.outputs[role] = { items : [] }
            recipe.outputs[role].items.push({ref:ref, deps : []});
        },

        getSingleInput: function(recipe, role) {
            if (recipe.inputs[role] == null) throw Error("No input found in role " + role);
            if (recipe.inputs[role].items.length  == 0) throw Error("No input found in role " + role);
            if (recipe.inputs[role].items.length > 1) throw Error("Multiple inputs found in role " + role);
            return recipe.inputs[role].items[0]
        },
        getSingleOutput: function(recipe, role) {
            if (recipe.outputs[role] == null) throw Error("No output found in role " + role);
            if (recipe.outputs[role].items.length  == 0) throw Error("No output found in role " + role);
            if (recipe.outputs[role].items.length > 1) throw Error("Multiple outputs found in role " + role);
            return recipe.outputs[role].items[0]
        },

        getInput: function(recipe, role, ref) {
            if (recipe.inputs[role] == null) return null;
            if (recipe.inputs[role].items.length  == 0) return null;
            var i = 0;
            for (i = 0; i < recipe.inputs[role].items.length; i++) {
                var input = recipe.inputs[role].items[i];
                if (input.ref == ref) return input;
            }
            return null;
        },
        removeInput: function(recipe, role, ref) {
            if (recipe.inputs[role] == null) return;
            if (recipe.inputs[role].items.length  == 0) return;
            recipe.inputs[role].items = recipe.inputs[role].items.filter(function(x){
                return x.ref != ref;
            })
        },
        parseScriptIfNeeded: function(recipeData) {
            if (['shaker', 'join', 'grouping', 'sampling', 'split', 'clustering_training', 'prediction_training'].indexOf(recipeData.recipe.type) > -1 && typeof recipeData.script === 'string') {
                recipeData.script = JSON.parse(recipeData.script);
            }

        }
    };
    return svc;
});


app.service("RecipeRunJobService", function(Assert, DataikuAPI, $stateParams, RecipesUtils, JobDefinitionComputer, $filter) {

    function getOutputAndPartitioning(recipe, computablesMap) {
        if (!computablesMap) {
            throw new Error("computablesMap not ready");
        }
        const outputs = RecipesUtils.getFlatOutputsList(recipe);
        for (const output of outputs) {
            const computable = computablesMap[output.ref];
            const partitioning = $filter('retrievePartitioning')(computable);

            if (partitioning && partitioning.dimensions.length > 0) {
                return { output, partitioning };
            }
        }
        return { output: outputs[0] };
    }
    var svc = {
        getOutputAndPartitioning,

        getOutputDimensions: function(recipe, computablesMap) {
            const partitioning = getOutputAndPartitioning(recipe, computablesMap).partitioning
            return partitioning ? partitioning.dimensions : [];
        },

        getTargetPartition: function($scope) {
        	if ( $scope.testRun == null ) return "";
            var outputs = RecipesUtils.getFlatOutputsList($scope.recipe);
            /* First find a dataset */
            for (var i = 0; i < outputs.length; i++) {
                var output = outputs[i];
                if (!$scope.computablesMap) {
                    throw new Error("computablesMap not ready");
                }
                var computable = $scope.computablesMap[output.ref];
                if (computable.type == "DATASET") {
                    var jd = JobDefinitionComputer.computeJobDefForSingleDataset($stateParams.projectKey,
                                $scope.testRun.runMode,
                                computable.dataset,
                                $scope.testRun.build_partitions);
                    return jd.outputs[0].targetPartition;
                }
            }
            /* No dataset found ... */
            return "";
        },

        isRunning: function(startedJob) {
            if (!startedJob || !startedJob.jobStatus || !startedJob.jobStatus.baseStatus){
                return false;
            }
            var state = startedJob.jobStatus.baseStatus.state;
            return ["RUNNING", "NOT_STARTED", "COMPUTING_DEPS"].includes(state);
        },

        run: function(recipe, computablesMap, testRun, startedJob, errorScope) {
            Assert.trueish(recipe, 'no recipe');
            Assert.trueish(computablesMap, 'no computablesMap');
            Assert.trueish(RecipesUtils.getFlatOutputsList(recipe).length > 0, 'no outputs');
            /* Identify the computable to build. First we look for a partitioned dataset or model */
            var computable = null;
            var outputs = RecipesUtils.getFlatOutputsList(recipe);
            for (var i = 0; i < outputs.length; i++) {
                var output = outputs[i];
                var _computable = computablesMap[output.ref];
                if (_computable.type == "DATASET" && _computable.dataset.partitioning.dimensions.length) {
                    computable = _computable;
                    break;
                }
            }
            /* No partitioning so just take the first output */
            if (computable == null) {
                computable = computablesMap[outputs[0].ref];
            }

            if (computable.type == "SAVED_MODEL") {
                var jd = JobDefinitionComputer.computeJobDefForSavedModel($stateParams.projectKey, testRun.runMode, computable.model, testRun.build_partitions, 'RECIPE', $stateParams.recipeName);
            } else if (computable.type == "MANAGED_FOLDER") {
                var jd = JobDefinitionComputer.computeJobDefForBox($stateParams.projectKey, testRun.runMode, computable.box, testRun.build_partitions, 'RECIPE', $stateParams.recipeName);
            } else if (computable.type == "STREAMING_ENDPOINT") {
                var jd = JobDefinitionComputer.computeJobDefForStreamingEndpoint($stateParams.projectKey, testRun.runMode, computable.streamingEndpoint, testRun.build_partitions, 'RECIPE', $stateParams.recipeName);
            } else if (computable.type == "MODEL_EVALUATION_STORE") {
                var jd = JobDefinitionComputer.computeJobDefForModelEvaluationStore($stateParams.projectKey, testRun.runMode, computable.mes, testRun.build_partitions, 'RECIPE', $stateParams.recipeName);
            } else {
                var jd = JobDefinitionComputer.computeJobDefForSingleDataset(
                            $stateParams.projectKey,
                            testRun.runMode,
                            computable.dataset,
                            testRun.build_partitions,
                            'RECIPE',
                            $stateParams.recipeName || recipe.name);
            }
            return DataikuAPI.flow.jobs.start(jd).success(function(data) {
                startedJob.starting = false;
                startedJob.jobId = data.id;
            }).error(function(a, b, c) {
                startedJob.starting = false;
                setErrorInScope.bind(errorScope)(a, b,c);
                errorScope.recipeWT1Event("recipe-run-start-failed");
            });
        }
    }
    return svc;
});

app.service("RecipeDescService", function($stateParams, DataikuAPI, Logger, WT1) {

    var descriptors;

    function capitalize(str) {
        if (!str) return '';
        if(str.length>0) {
            str = str.substring(0,1).toUpperCase() + str.substring(1);
        }
        return str;
    }
    function formatNice(str) {
        if (!str) return '';
        str = str.toLowerCase();
        str = str.replace(/[_ ]+/g,' ');
        return str;
    }

    function isOverallUnary(roles) {
        if (!roles) return false;
        var unary = null;
        roles.forEach(function(r) {
            if (r.arity != 'UNARY') {
                unary = false;
            } else if (unary === null) {
                // first one
                unary = true;
            } else {
                // 2 unaries => not overall unary
                unary = false;
            }
        });
        return unary;
    }

    var svc = {
        load: function(errorScope) {
            DataikuAPI.flow.recipes.getTypesDescriptors().success(function(data) {
                Logger.info("Received recipe descriptors");
                descriptors = data;
            }).error(function(a, b, c) {
                Logger.error("Failed to get recipe descriptors");
                setErrorInScope.bind(errorScope)(a, b, c);
                WT1.event("get-recipe-descriptors-failed");
            });
        },
        getDescriptors: function() {
            if (!descriptors) {
                logger.error("Recipes descriptors not ready");
            }
            return descriptors;
        },
        isRecipeType: function(recipeType) {
            var desc;
            if (!descriptors) {
                Logger.error("Recipe descriptors are not ready");
            } else {
                return !!descriptors[recipeType];
            }
        },
        getDescriptor: function(recipeType) {
            var desc;
            if (!descriptors) {
                Logger.error("Recipe descriptors are not ready");
            } else {
                angular.forEach(descriptors, function(d, t) {
                    if (t == recipeType || t.toLowerCase() == recipeType) desc = d;
                });
                if (!desc) {
                    // This should not happen (maybe a new plugin recipe type)
                    Logger.error("Recipe descriptor not found for type: "+recipeType);
                }
                return angular.copy(desc);
            }
        },
        getRolesIndex: function(recipeType) {
            var desc = svc.getDescriptor(recipeType);
            var inputRolesIndex = {};
            var outputRolesIndex = {};
            desc.inputRoles.forEach(function(r) {
                inputRolesIndex[r.name] = r;
            });
            desc.outputRoles.forEach(function(r) {
                r.editing = true; //Ugly, to be compatible with current templates
                outputRolesIndex[r.name] = r;
            });
            return {inputs: inputRolesIndex, outputs: outputRolesIndex};
        },

        getInputRoleDesc: function(recipeType, roleName) {
            return svc.getRolesIndex(recipeType).inputs[roleName];
        },

        getRecipeTypeName: function(recipeType, capitalize) {
            if(!recipeType) return '';
            var desc = svc.getDescriptor(recipeType);
            var name = (desc && desc.meta && desc.meta.label) || formatNice(recipeType);
            return capitalize ? capitalize(name) : name;
        },
        isSingleInputRecipe: function(recipeType) {
            return !recipeType.startsWith('CustomCode_') && !recipeType.startsWith('App_') && isOverallUnary(svc.getDescriptor(recipeType).inputRoles);
        },
        isSingleOutputRecipe: function(recipeType) {
            return !recipeType.startsWith('CustomCode_') && !recipeType.startsWith('App_') && isOverallUnary(svc.getDescriptor(recipeType).outputRoles);
        },
        hasValidRequiredRoles: function(recipe) {
            const desc = svc.getDescriptor(recipe.type);
            return !desc.inputRoles.some(role => role.required && (!recipe.inputs[role.name] || recipe.inputs[role.name].items.length == 0))
                && !desc.outputRoles.some(role => role.required && (!recipe.outputs[role.name] || recipe.outputs[role.name].items.length == 0));
        }
    };

    return svc;
});

app.service("SelectablePluginsService", function($rootScope) {
    var svc = {

        listSelectablePlugins : function (inputTypesCount) {

            const pluginsById = $rootScope.appConfig.loadedPlugins.reduce( function (map, obj) {
                map[obj.id] = obj;
                return map;
            }, {});

            var selectablePlugins = [];
            var alreadySelectedPlugins = {};

            $rootScope.appConfig.customCodeRecipes.forEach( (recipe) => {
                if (!alreadySelectedPlugins[recipe.ownerPluginId] && svc.canBeBuildFromInputs(recipe, inputTypesCount).ok && pluginsById.hasOwnProperty(recipe.ownerPluginId)) {
                    const plugin = pluginsById[recipe.ownerPluginId];
                    plugin.pluginId = plugin.id;
                    selectablePlugins.push(plugin);
                    alreadySelectedPlugins[plugin.id] = true;
                }
            });

            return selectablePlugins;
        },

        canBeBuildFromInputs: function (recipe, inputTypesCount) {
            if (!inputTypesCount)
                return { ok: true};

            const allTypes = {
                "DATASET": {
                    "selectableFromRole": 'selectableFromDataset',
                    "inputName" : recipe.desc.selectableFromDataset,
                    "inputTypeCount": inputTypesCount.DATASET
                },
                "MANAGED_FOLDER":  {
                    "selectableFromRole": 'selectableFromFolder',
                    "inputName": recipe.desc.selectableFromFolder,
                    "inputTypeCount": inputTypesCount.MANAGED_FOLDER
                },
                "SAVED_MODEL": {
                    "selectableFromRole": 'selectableFromSavedModel',
                    "inputName": recipe.desc.selectableFromSavedModel,
                    "inputTypeCount": inputTypesCount.SAVED_MODEL
                }
            };
            for (let [inputType, nb_input] of Object.entries(inputTypesCount)) {
                const typeParams = allTypes[inputType];
                var role = recipe.desc.inputRoles.find( (el) => { return el.name == typeParams.inputName; });
                // role does not exist
                if (!role)
                    return { ok: false, reason: "InputRole selectable from " + inputType + " doesn't exist in this recipe."};

                // recipe does not accept selectable inputs of this type
                if (!recipe.desc.hasOwnProperty(typeParams.selectableFromRole)) {
                    return { ok: false, reason: "Input role type " + inputType + " of (" + role.name + ") is not selectable for this recipe."};
                }
                // recipe does not accept inputs of type of the role
                if ((inputType === "DATASET" && !role.acceptsDataset) ||
                    (inputType === "MANAGED_FOLDER" && !role.acceptsManagedFolder) ||
                    (inputType === "SAVED_MODEL" && !role.acceptsSavedModel)) {
                    return { ok: false, reason: "Recipe doesn't accept " + inputType + " as input for the selectable role (" + role.name + ")."};
                }

                if (nb_input > 1 && role.arity == 'UNARY')
                    return { ok: false, reason: "Recipe only accepts unary inputs for the selectable role (" + role.name + ")."};
            }
            return {ok: true};
        }

    };
    return svc;
});

app.service("RecipeComputablesService", function(Assert, DataikuAPI, $stateParams, RecipesUtils, Logger) {
    var svc = {

        isUsedAsInput: function(recipe, ref) {
            var found = false;
            $.each(recipe.inputs, function(role, roleData){
                 found |= roleData.items.some(function(input) {
                    return input.ref == ref;
                 });
            })
            return found;
        },
        isUsedAsOutput: function(recipe, ref) {
            var found = false;
            $.each(recipe.outputs, function(role, roleData){
                 found |= roleData.items.some(function(x) {
                    return x.ref == ref;
                 });
            })
            return found;
        },
        getComputablesMap: function(recipe, errorScope) {
            return DataikuAPI.flow.listUsableComputables($stateParams.projectKey, {
                forRecipeType : recipe.type
            }).then(function(data) {
                var computablesMap ={};
                $.each(data.data, function(idx, elt) { computablesMap[elt.smartName]  = elt;});
                // added bonus: lots of places expect computablesMap to contain all the input/outputs of the recipe
                // so that if one of the elements is removed or stopped being exposed, the UI throws gobs of js
                // errors
                // => we pad the map with fake elements to cover the input/outputs
                var unusable = {};
                angular.forEach(recipe.inputs, function(x, role) {unusable[role] = {};});
                angular.forEach(recipe.outputs, function(x, role) {unusable[role] = {};});
                RecipesUtils.getFlatIOList(recipe).forEach(function(io){
                    var computable = computablesMap[io.ref];
                    if (computable == null) {
                        Logger.warn("Computable not found for " + io.ref + ". Inserting dummy computable.");
                        computablesMap[io.ref] = {type:'MISSING', name:io.ref, usableAsInput:unusable, usableAsOutput:unusable};
                    }
                });
                return computablesMap;
            }, function(resp){
                setErrorInScope.bind(errorScope)(resp.data, resp.status, resp.headers)
            });
        },

        /* returns the name of an output computable */
        getAnyOutputName: function(recipe) {
            if (!recipe || !recipe.outputs) return;
            var roles = Object.keys(recipe.outputs);
            for (var r = 0; r < roles.length; r++) {
                var items = recipe.outputs[roles[r]].items;
                if (items && items.length > 0) {
                    return items[0].ref;
                }
            }
        },

        /**
         * Builds the list of usable inputs for a given role.
         * Note: it actually also includes some non-usable inputs ...
         */
        buildPossibleInputList: function(recipe, computablesMap, role, filter){
            var usableInputs = [];
            var filterStr = null;
            if (filter && filter.length) {
                filterStr = filter.toLowerCase();
            }
            Assert.trueish(computablesMap, 'no computablesMap');
            $.each(computablesMap, function(k, v) {
                if (!filter || !filter.length || v.smartName.toLowerCase().indexOf(filterStr) >= 0 || (v.label && v.label.toLowerCase().indexOf(filterStr) >= 0)) {
                    if (!svc.isUsedAsInput(recipe, v.smartName)) {
                        usableInputs.push(v);
                    }
                }
            });
            return usableInputs;
        },
        /**
         * Builds the list of usable outputs for a given role.
         * Note: it actually also includes some non-usable outputs ...
         * It removes the ones that are currently used in the recipe, and executes the filter
         */
        buildPossibleOutputList: function(recipe, computablesMap, role, filter){
            if (!computablesMap) {
                throw Error("No computablesMap");
            }
            var usable = [];
            var filterStr = null;
            if (filter && filter.length) {
                filterStr = filter.toLowerCase();
            }

            $.each(computablesMap, function(k, v) {
                if (!filter || !filter.length || v.smartName.toLowerCase().indexOf(filterStr) >= 0) {
                    if (!svc.isUsedAsOutput(recipe, v.smartName)) {
                        usable.push(v);
                    }
                }
            });
            return usable;
        }
    };
    return svc;
});

app.service("CodeEnvsService", function(DataikuAPI, $stateParams, RecipeDescService, Logger, CreateModalFromTemplate) {
    var svc = {
        canPythonCodeEnv: function(recipe) {
            if (recipe.nodeType !== 'RECIPE' && recipe.interest && recipe.interest.objectType !== 'RECIPE') {
                return false;
            }
            var t = recipe.recipeType || recipe.type;
            if(['python','pyspark'].indexOf(t) >= 0) {
                return true;
            }
            if (t.startsWith('CustomCode_')) {
                var desc = RecipeDescService.getDescriptor(t);
                if (!desc) return;
                if (['PYTHON'].indexOf(desc.kind) >= 0) {
                    return true;
                }
            }
            return false;
        },

        canRCodeEnv: function(recipe) {
            if (recipe.nodeType !== 'RECIPE' && recipe.interest && recipe.interest.objectType !== 'RECIPE') {
                return false;
            }
            var t = recipe.recipeType || recipe.type;
            if(['r','sparkr'].indexOf(t) >= 0) {
                return true;
            }
            if (t.startsWith('CustomCode_')) {
                var desc = RecipeDescService.getDescriptor(t);
                if (!desc) return;
                if (['R'].indexOf(desc.kind) >= 0) {
                    return true;
                }
            }
            return false;
        },
        startChangeCodeEnv: function(selectedRecipes, envLang, $scope) {
            return CreateModalFromTemplate('/templates/recipes/fragments/change-code-env-modal.html', $scope, null, function(modalScope) {
                modalScope.uiState = {envSelection : {envMode : 'INHERIT'}};
                modalScope.envLang = envLang;
                modalScope.selectedObjects = selectedRecipes;

                modalScope.change = function() {
                    DataikuAPI.flow.recipes.massActions.changeCodeEnv(modalScope.selectedObjects, modalScope.uiState.envSelection).success(function() {
                        modalScope.resolveModal();
                    }).error(setErrorInScope.bind(modalScope));
                };
            })
        }
    };
    return svc;
});

})();