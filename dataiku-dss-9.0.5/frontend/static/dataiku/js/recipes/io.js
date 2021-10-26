(function() {
'use strict';

const app = angular.module('dataiku.recipes');


app.directive("recipeIoInputs", function(RecipesUtils, RecipeComputablesService, $stateParams) {
    return {
        scope: true,
        templateUrl: function(element, attrs) {
            return '/templates/recipes/io/' + attrs.location + '-inputs.html';
        },
        link: {
        	// pre, because otherwise link is post by default, and executed after its children's link
        	pre : function($scope, element, attrs) {
            	// propagate
            	$scope.roles = $scope.$eval(attrs.roles);
            	$scope.location = attrs.location;
            	$scope.longRoleList = $scope.roles.length > 2;
                $scope.editInputs = [];
            	if ($scope.roles) {
            		$scope.roles.forEach(function(role) {role.editing = false;});
            	}
            	$scope.setErrorInTopScope = function(scope) {
            	    return setErrorInScope.bind($scope.$parent);
            	};

                // Determines if we show explanation for disabled recipe creation button
                $scope.shouldDisplayDisabledCreateExplanation = function () {
                    if (
                        !$scope.roles // No input roles
                        || ($scope.roles.some((role) => role.editing) || $scope.editInputs.length > 0) // Roles are being edited
                    ) { return false; }

                    // Has a specific condition defined in shouldDisplayOutputExplanation
                    if ("shouldDisplayInputExplanation" in $scope) { return $scope.shouldDisplayInputExplanation(); }

                    // Has some unset required input
                    return $scope.roles.some(
                        (role) =>
                            role.required &&
                            (!$scope.recipe.inputs[role.name] || !$scope.recipe.inputs[role.name].items.length)
                    );
                };

                $scope.generateDisabledCreateExplanation = function () {
                    // Has a specific explanation message defined in generateInputExplanation
                    if ("generateInputExplanation" in $scope) { return $scope.generateInputExplanation(); }

                    if ($scope.roles.length === 0) { return ""; }

                    if ($scope.roles.length === 1) {
                        return "This recipe requires at least one input.";
                    } else {
                        const requiredRoles = $scope.roles
                            .filter((role) => role.required)
                            .map((role, inputRoleIdx) => {
                                if (role.name === "main" && !role.label) {
                                    return "main input";
                                } else if (!role.name && !role.label) {
                                    return "input " + (inputRoleIdx + 1); // No label at all => print role index
                                } else {
                                    return '"' + (role.label || role.name) + '"'; // Otherwise print displayed label
                                }
                            });

                        return "This recipe requires at least one input in: "
                            + requiredRoles.slice(0, -1).join(', ')
                            + (requiredRoles.length === 2 ? ' and ' : ', and ')
                            + requiredRoles.slice(-1) + ".";
                    }
                }
            }
        }
    }
});


app.directive("recipeIoOutputs", function(RecipesUtils, RecipeComputablesService, $stateParams){
    return {
        scope: true,
        templateUrl: function(element, attrs) {
            return '/templates/recipes/io/' + attrs.location + '-outputs.html';
        },
        link: {
        	// pre, because otherwise link is post by default, and executed after its children's link
        	pre : function($scope, element, attrs) {
            	// propagate
                $scope.roles = $scope.$eval(attrs.roles);
            	$scope.location = attrs.location;
            	$scope.longRoleList = $scope.roles.length > 2;
                $scope.editOutputs = [];
            	if ($scope.roles) {
            		$scope.roles.forEach(function(role) {role.editing = false;});
            	}
            	$scope.canAppend = function(computable) {
            	    if (computable.noAppend) return false; // no ambiguity here
            	    if (['cpython', 'ksql', 'csync', 'streaming_spark_scala'].indexOf($scope.recipe.type) >= 0) return false; // can't overwrite with continuous activities
            	    if (computable.onlyAppendOnStreamEngine) {
            	        return $scope.recipe == null || $scope.recipe.params == null || $scope.recipe.params.engine == 'DSS';
            	    } else {
            	        return true; // maybe.
            	    }
            	};
                $scope.setErrorInTopScope = function(scope) {
                    return setErrorInScope.bind($scope.$parent);
                };

                // Determines if we show explanation for disabled recipe creation button
                $scope.shouldDisplayDisabledCreateExplanation = function () {
                    if (
                        !$scope.roles // No output roles
                        || ($scope.roles.some((role) => role.editing) || $scope.editOutputs.length > 0) // Roles are being edited
                    ) { return false; }

                    // Has a specific condition defined in shouldDisplayOutputExplanation
                    if ("shouldDisplayOutputExplanation" in $scope) { return $scope.shouldDisplayOutputExplanation(); }

                    // Has some unset required output
                    return $scope.roles.some(
                        (role) =>
                            role.required &&
                            (!$scope.recipe.outputs[role.name] || !$scope.recipe.outputs[role.name].items.length)
                    );
                };

                $scope.generateDisabledCreateExplanation = function () {
                    // Has a specific explanation message defined in generateOutputExplanation
                    if ("generateOutputExplanation" in $scope) { return $scope.generateOutputExplanation(); }

                    if ($scope.roles.length === 0) { return ""; }

                    if ($scope.roles.length === 1) {
                        return "This recipe requires at least one output.";
                    } else {
                        const requiredRoles = $scope.roles
                            .filter((role) => role.required)
                            .map((role, outputRoleIdx) => {
                                if (role.name === "main" && !role.label) {
                                    return "main output";
                                } else if (!role.name && !role.label) {
                                    return "output " + (outputRoleIdx + 1); // No label at all => print role index
                                } else {
                                    return '"' + (role.label || role.name) + '"'; // Otherwise print displayed label
                                }
                            });

                        return "This recipe requires at least one output in: "
                            + requiredRoles.slice(0, -1).join(', ')
                            + (requiredRoles.length === 2 ? ' and ' : ', and ')
                            + requiredRoles.slice(-1) + ".";
                    }
                }
            }
        }
    }
});


// this is more or less a custom ng-repeat, because ngRepeat AND another directive on the same element makes some things
// impossible, like using interpolated attributes for the other directive
app.directive("recipeIoInputList", function(RecipesUtils, RecipeComputablesService, $stateParams, $compile){
    return {
        scope: true,
        restrict: 'E',
        link : function($scope, element, attrs) {
        	var roleElements = [];
        	$scope.roles.forEach(function(role, index){
        		roleElements.push('<div recipe-io-input-display-list role-index="' + index + '" location="' + $scope.location + '"/>');
            	roleElements.push('<div recipe-io-input-add-list role-index="' + index + '"location="' + $scope.location + '"/>');
        	});
        	element.replaceWith($compile(roleElements.join('\n'))($scope));
        }
    }
});


app.directive("recipeIoOutputList", function(RecipesUtils, RecipeComputablesService, $stateParams, $compile, $rootScope){
    return {
        scope: true,
        restrict: 'E',
        link : function($scope, element, attrs) {
        	var roleElements = [];
        	$scope.roles.forEach(function(role, index) {
                if (!$rootScope.featureFlagEnabled('model_evaluation_stores')) {
                    let canOtherThanEvaluationStore = role.acceptsDataset || role.acceptsSavedModel || role.acceptsManagedFolder || role.acceptsStreamingEndpoint;
                    if (!canOtherThanEvaluationStore && role.acceptsModelEvaluationStore) {
                        // skip roles that are only MES
                        return;
                    }
                }
        		roleElements.push('<div recipe-io-output-display-list role-index="' + index + '" location="' + $scope.location + '"/>');
            	roleElements.push('<div recipe-io-output-add-list role-index="' + index + '"location="' + $scope.location + '"/>');
        	});
        	element.replaceWith($compile(roleElements.join('\n'))($scope));
        }
    }
});


app.directive("recipeIoInputDisplayList", function(RecipesUtils, RecipeComputablesService, $stateParams){
    return {
        scope: true,
        replace: true,
        templateUrl: function(element, attrs) {
            return '/templates/recipes/io/' + attrs.location + '-input-display-list.html';
        },
        link : function($scope, element, attrs){
        	$scope.role = $scope.roles[parseInt(attrs.roleIndex)];
            $scope.hasAnyPartitioning = function(){
                if (!$scope.recipe || !$scope.computablesMap) return false;
                return RecipesUtils.hasAnyPartitioning($scope.recipe, $scope.computablesMap);
            }
        }
    }
});


app.directive("recipeIoInputAddList", function(Assert, RecipesUtils, RecipeDescService, RecipeComputablesService, $stateParams, DKUtils, DataikuAPI, $q){
    return {
        scope: true,
        replace: true,
        templateUrl: function(element, attrs) {
            return '/templates/recipes/io/' + attrs.location + '-input-add-list.html';
        },
        link : function($scope, element, attrs) {
        	$scope.role = $scope.roles[parseInt(attrs.roleIndex)];
            $scope.hasAnyPartitioning = function(){
                if (!$scope.recipe || !$scope.computablesMap) return false;
                return RecipesUtils.hasAnyPartitioning($scope.recipe, $scope.computablesMap);
            }

            $scope.addInput = {
                adding : false,
                role:null,
                filter : null
            }
            var beginEdition = function() {
            	$scope.addInput.adding = true;
            	$scope.role.editing = true;
            	$scope.editInputs.push($scope.addInput);
            };

            var endEdition = function() {
            	$scope.addInput.adding = false;
            	$scope.role.editing = false;
            	var idx = $scope.editInputs.indexOf($scope.addInput);
            	if (idx >= 0) $scope.editInputs.splice(idx, 1);
            };

            var setUsable = function(list) {
            	// put usable datasets at the beginning
                var roleName = $scope.role.name;
                list.sort(function(a,b) {
                    var aIsUsable = a.usableAsInput[roleName] && a.usableAsInput[roleName].usable;
                    var bIsUsable = b.usableAsInput[roleName] && b.usableAsInput[roleName].usable;
            		if (aIsUsable && !bIsUsable)
            			return -1;
            		if (!aIsUsable && bIsUsable)
            			return 1;
            		return (a.label || '').localeCompare((b.label || ''));
            	});
            	$scope.addInput.usable = list;
            };
            $scope.$watch("addInput.filter", function(nv){
                if ($scope.recipe && $scope.computablesMap) {
                	setUsable(RecipeComputablesService.buildPossibleInputList(
                        $scope.recipe, $scope.computablesMap, $scope.addInput.role, $scope.addInput.filter));
                }
            });

            $scope.itemsWatchHooked = false;
            var hookItemsWatch = function() {
                $scope.itemsArray = $scope.recipe.inputs[$scope.role.name].items;
                $scope.$watchCollection("itemsArray", function(nv){
                    if ($scope.roleChanged) {
                    	$scope.roleChanged($scope.role.name);
                    }
                });
                $scope.itemsWatchHooked = true;
            };
            if ( $scope.recipe.inputs[$scope.role.name] != null ) {
            	// items can be null in a recipe newly created
            	hookItemsWatch();
            }

            $scope.enterAddInput = function(role) {
                beginEdition();
                $scope.addInput.role = role;
                setUsable(RecipeComputablesService.buildPossibleInputList(
                            $scope.recipe, $scope.computablesMap, role, $scope.addInput.filter));
            }
            $scope.cancelAddInput = function(){
                endEdition();
            }

            $scope.acceptAddInput = function(computable){
                Assert.trueish($scope.addInput.adding, 'not adding inputs');
                var promise = $q.when(null);

                if (attrs.location == "modal") {
                    if ($scope.recipe.inputs[$scope.addInput.role] == null || $scope.role.arity == 'UNARY') {
                        $scope.recipe.inputs[$scope.addInput.role] = { items : []}
                    }
                    $scope.recipe.inputs[$scope.addInput.role].items.push({
                        ref : computable.smartName,
                        deps : []
                    });
                } else {
                    var currentRecipeAndPayload = {
                        recipe : angular.copy($scope.recipe),
                        payload: angular.copy($scope.script.data)
                    }
                    var newRecipeAndPayload = {
                        recipe : angular.copy($scope.recipe),
                        payload: angular.copy($scope.script.data)
                    }
                    if (newRecipeAndPayload.recipe.inputs[$scope.addInput.role] == null || $scope.role.arity == 'UNARY') {
                        newRecipeAndPayload.recipe.inputs[$scope.addInput.role] = { items : []}
                    }
                    newRecipeAndPayload.recipe.inputs[$scope.addInput.role].items.push({
                        ref : computable.smartName,
                        deps : []
                    });
                    promise = DataikuAPI.flow.recipes.getIOChangeResult($stateParams.projectKey, currentRecipeAndPayload, newRecipeAndPayload)
                        .error($scope.setErrorInTopScope($scope))
                        .then(function(resp) {
                            var roleDesc = RecipeDescService.getInputRoleDesc($scope.recipe.type, $scope.addInput.role);
                            $scope.recipe.inputs = resp.data.updated.recipe.inputs;
                            $scope.recipe.outputs = resp.data.updated.recipe.outputs;

                            if (roleDesc.saveAndReloadAfterEditInEditor) {
                                $scope.baseSave($scope.hooks.getRecipeSerialized(), $scope.script ? $scope.script.data : null).then(function(){
                                    DKUtils.reloadState();
                                });
                            }

                            return;
                        });
                }

                promise.then(function(){
                    endEdition();
                    if (!$scope.itemsWatchHooked) {
                  	 hookItemsWatch();
                    }
                });
            }
        }
    }
});


app.controller("_RecipeOutputNewManagedBehavior", function($scope, Logger, DataikuAPI, $stateParams, RecipeComputablesService, $rootScope){
    $scope.newOutputDataset = {};
    $scope.newOutputODB = {};
    $scope.newOutputMES = {};
    $scope.newOutputSE = {};
    $scope.io = $scope.io || {};
    $scope.io.newOutputTypeRadio = "create";
    $scope.forms = {};
    $scope.uiState = $scope.uiState || {};
    delete $scope.uiState.backendWarnings;

    $scope.getManagedDatasetOptions = function(role){
        return DataikuAPI.datasets.getManagedDatasetOptions($scope.recipe, role)
            .then(function(data){return data.data})
            .catch($scope.setErrorInTopScope($scope));
    };

    $scope.setupManagedDatasetOptions = function(data, forceUpdate){
        $scope.managedDatasetOptions = data;
        if (data.connections.length && (!$scope.newOutputDataset.connectionOption || forceUpdate) ){
            $scope.newOutputDataset.connectionOption = data.connections[0];
        }

        $scope.partitioningOptions = [
            {"id" : "NP", "label" : "Not partitioned"}
        ];

        $scope.partitioningOptions = $scope.partitioningOptions
                                        .concat(data.inputPartitionings)
                                        .concat(data.projectPartitionings)

        if (data.inputPartitionings.length) {
            $scope.newOutputDataset.partitioningOption = data.inputPartitionings[0].id
        } else {
            $scope.newOutputDataset.partitioningOption = "NP";
        }
    };

    $scope.getManagedFolderOptions = function(role){
        return DataikuAPI.datasets.getManagedFolderOptions($scope.recipe, role)
            .then(function(data){return data.data})
            .catch($scope.setErrorInTopScope($scope));
    };

    $scope.getModelEvaluationStoreOptions = function(role){
        return DataikuAPI.datasets.getModelEvaluationStoreOptions($scope.recipe, role)
            .then(function(data){return data.data})
            .catch($scope.setErrorInTopScope($scope));
    };

    $scope.getStreamingEndpointOptions = function(role){
        return DataikuAPI.datasets.getStreamingEndpointOptions($scope.recipe, role)
            .then(function(data){return data.data;})
            .catch($scope.setErrorInTopScope($scope));
    };

    var updateFolderConnection = function() {
        if ($scope.newOutputODB.$connection == null) return;
        $scope.newOutputODB.connectionOption = $scope.newOutputODB.$connection.connectionName;
        $scope.newOutputODB.typeOption = $scope.newOutputODB.$connection.fsProviderTypes[0];
    };

    var updateStreamingEndpointConnection = function() {
        if ($scope.newOutputSE.$connection == null) return;
        $scope.newOutputSE.connectionOption = $scope.newOutputSE.$connection.connectionName;
        if ($scope.newOutputSE.$connection.formats && $scope.newOutputSE.$connection.formats.length) {
            $scope.newOutputSE.formatOptionId = $scope.newOutputSE.$connection.formats[0].id;
        }
    };

    $scope.setupManagedFolderOptions = function(data, forceUpdate){
        $scope.managedFolderOptions = data;
        $scope.managedFolderOptions.connections = $scope.managedFolderOptions.connections.filter(function(c) {return c.fsProviderTypes != null;});
        if (data.connections.length && (!$scope.newOutputODB.connectionOption || forceUpdate) ){
            $scope.newOutputODB.$connection = data.connections[0];
            updateFolderConnection();
        }

        $scope.partitioningOptions = [
            {"id" : "NP", "label" : "Not partitioned"}
        ];

        $scope.partitioningOptions = $scope.partitioningOptions
                                        .concat(data.inputPartitionings)
                                        .concat(data.projectPartitionings)

        if (data.inputPartitionings.length) {
            $scope.newOutputODB.partitioningOption = data.inputPartitionings[0].id
        } else {
            $scope.newOutputODB.partitioningOption = "NP";
        }
    };

    $scope.setupModelEvaluationStoreOptions = function(data, forceUpdate){
        $scope.modelEvaluationStoreOptions = data;

        $scope.partitioningOptions = [
            {"id" : "NP", "label" : "Not partitioned"}
        ];

        $scope.partitioningOptions = $scope.partitioningOptions
                                        .concat(data.inputPartitionings)
                                        .concat(data.projectPartitionings)

        //if (data.inputPartitionings.length) {
        //    $scope.newOutputMES.partitioningOption = data.inputPartitionings[0].id
        //} else {
            $scope.newOutputMES.partitioningOption = "NP";
        //}
    };

    $scope.setupStreamingEndpointOptions = function(data, forceUpdate){
        $scope.streamingEndpointOptions = data;
        if (data.connections.length && (!$scope.newOutputSE.connectionOption || forceUpdate) ){
            $scope.newOutputSE.$connection = data.connections[0];
            updateStreamingEndpointConnection();
        }
    };

    $scope.$watch("newOutputDataset.connectionOption", function(nv, ov){
        if (nv && nv.formats && nv.formats.length) {
            $scope.newOutputDataset.formatOptionId = nv.formats[0].id;
        }
        if (nv && nv.fsProviderTypes && nv.fsProviderTypes.length > 1) {
            $scope.newOutputDataset.typeOption = nv.fsProviderTypes[0];
        }
    }, true);

    function doCreateAndUseNewOutputDataset(projectKey, datasetName, settings) {
        Logger.info("Create and use ", $scope);
        DataikuAPI.datasets.newManagedDataset(projectKey, datasetName, settings).success(function(dataset) {
                RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
                    $scope.setComputablesMap(map);

                    $scope.acceptEdit($scope.computablesMap[dataset.name]);

                    // Clear form
                    $scope.newOutputDataset.name = '';
                    $scope.forms.newOutputDatasetForm.$setPristine(true);

                    $rootScope.$emit('datasetsListChangedFromModal'); // communicate with the flow editor (note: don't broadcast)
                });

        }).error($scope.setErrorInTopScope($scope));

        $scope.recipeWT1Event("recipe-create-managed-dataset", {
            connection : $scope.newOutputDataset.connection,
            schemaFrom : $scope.newOutputDataset.schema,
            partitioningFrom : $scope.newOutputDataset.partitioning
        });
    }

    $scope.getDatasetCreationSettings = function() {
        let datasetCreationSetting = {
            connectionId : ($scope.newOutputDataset.connectionOption || {}).id,
            specificSettings : {
                overrideSQLCatalog: $scope.newOutputDataset.overrideSQLCatalog,
                overrideSQLSchema: $scope.newOutputDataset.overrideSQLSchema,
                formatOptionId : $scope.newOutputDataset.formatOptionId,
            },
            partitioningOptionId : $scope.newOutputDataset.partitioningOption,
            inlineDataset : $scope.inlineDataset,
            zone : $scope.zone
        };
        if ($scope.newOutputDataset &&
            $scope.newOutputDataset.connectionOption &&
            $scope.newOutputDataset.connectionOption.fsProviderTypes &&
            $scope.newOutputDataset.connectionOption.fsProviderTypes.length > 1) {
            datasetCreationSetting['typeOptionId'] = $scope.newOutputDataset.typeOption;
        }
        return datasetCreationSetting;
    }

    $scope.getFolderCreationSettings = function() {
        return {
            partitioningOptionId : $scope.newOutputODB.partitioningOption,
            connectionId : $scope.newOutputODB.connectionOption,
            typeOptionId : $scope.newOutputODB.typeOption,
            zone: $scope.zone
        };
    }

    $scope.getEvaluationStoreCreationSettings = function() {
        return {
            partitioningOptionId : $scope.newOutputMES.partitioningOption,
            zone: $scope.zone
        };
    }

    $scope.getStreamingEndpointCreationSettings = function() {
        return {
            connectionId : $scope.newOutputSE.connectionOption,
            formatOptionId : $scope.newOutputSE.formatOptionId,
            typeOptionId : $scope.newOutputSE.typeOption,
            zone: $scope.zone
        };
    }

    $scope.$watch("newOutputODB.$connection", updateFolderConnection);
    $scope.$watch("newOutputSE.$connection", updateStreamingEndpointConnection);


    $scope.createAndUseNewOutputDataset = function(force) {
        var projectKey = $stateParams.projectKey,
            datasetName = $scope.newOutputDataset.name,
            settings = $scope.getDatasetCreationSettings();

        if (force) {
            doCreateAndUseNewOutputDataset(projectKey, datasetName, settings);
        } else {
            DataikuAPI.datasets.checkNameSafety(projectKey, datasetName, settings).success(function(data) {
                $scope.uiState.backendWarnings = data.messages;
                if (!data.messages || !data.messages.length) {
                    doCreateAndUseNewOutputDataset(projectKey, datasetName, settings);
                }
            }).error($scope.setErrorInTopScope($scope));
        }
    };

    $scope.createAndUseManagedFolder = function() {
        Logger.info("Create and use managed folder", $scope);
        var settings = $scope.getFolderCreationSettings();
        DataikuAPI.datasets.newManagedFolder($stateParams.projectKey, $scope.newOutputODB.name, settings).success(function(odb) {

            RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
                $scope.setComputablesMap(map);

                $scope.acceptEdit($scope.computablesMap[odb.id]);

                // Clear form
                $scope.newOutputODB.name = '';
                $scope.forms.newOutputODBForm.$setPristine(true);

                $rootScope.$emit('datasetsListChangedFromModal'); // communicate with the flow editor (note: don't broadcast)
            });

        }).error($scope.setErrorInTopScope($scope));

        $scope.recipeWT1Event("recipe-create-managed-folder", {});
    };
    
    $scope.createAndUseModelEvaluationStore = function() {
        Logger.info("Create and use model evaluation store", $scope);
        var settings = $scope.getEvaluationStoreCreationSettings();
        DataikuAPI.datasets.newModelEvaluationStore($stateParams.projectKey, $scope.newOutputMES.name, settings).success(function(mes) {

            RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
                $scope.setComputablesMap(map);

                $scope.acceptEdit($scope.computablesMap[mes.id]);

                // Clear form
                $scope.newOutputMES.name = '';
                $scope.forms.newOutputMESForm.$setPristine(true);

                $rootScope.$emit('datasetsListChangedFromModal'); // communicate with the flow editor (note: don't broadcast)
            });

        }).error($scope.setErrorInTopScope($scope));

        $scope.recipeWT1Event("recipe-create-model-evaluation-store", {});
    };
    
    $scope.createAndUseStreamingEndpoint = function() {
        Logger.info("Create and use streaming endpoint", $scope);
        var settings = $scope.getStreamingEndpointCreationSettings();
        DataikuAPI.datasets.newStreamingEndpoint($stateParams.projectKey, $scope.newOutputSE.name, settings).success(function(se) {

            RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
                $scope.setComputablesMap(map);

                $scope.acceptEdit($scope.computablesMap[se.id]);

                // Clear form
                $scope.newOutputSE.name = '';
                $scope.forms.newOutputSEForm.$setPristine(true);

                $rootScope.$emit('datasetsListChangedFromModal'); // communicate with the flow editor (note: don't broadcast)
            });

        }).error($scope.setErrorInTopScope($scope));

        $scope.recipeWT1Event("recipe-create-streaming-endpoint", {});
    };
});


app.directive("recipeIoOutputDisplayList", function(RecipesUtils, RecipeComputablesService, $stateParams){
    return {
        scope: true,
        replace: true,
        templateUrl: function(element, attrs) {
            return '/templates/recipes/io/' + attrs.location + '-output-display-list.html';
        },
        link : function($scope, element, attrs){
        	$scope.role = $scope.roles[parseInt(attrs.roleIndex)];
            $scope.hasAnyPartitioning = function(){
                if (!$scope.recipe || !$scope.computablesMap) return false;
                return RecipesUtils.hasAnyPartitioning($scope.recipe, $scope.computablesMap);
            }
        }
    }
});


app.directive("recipeIoOutputAddList", function($controller, Assert, RecipesUtils, RecipeComputablesService, Logger, DataikuAPI,$state, $stateParams, $q) {
    return {
        scope: true,
        replace: true,
        // Not using isolate scope because we need to $eval
        templateUrl: function(element, attrs) {
            return '/templates/recipes/io/' + attrs.location + '-output-add-list.html';
        },
        link : function($scope, elemnt, attrs){
        	$controller("_RecipeOutputNewManagedBehavior", {$scope:$scope});
        	$scope.role = $scope.roles[parseInt(attrs.roleIndex)];

            $scope.hasAnyPartitioning = function(){
                if (!$scope.recipe || !$scope.computablesMap) return false;
                return RecipesUtils.hasAnyPartitioning($scope.recipe, $scope.computablesMap);
            }

            $scope.editOutput = {
                adding : false,
                role:null
            }
            var beginEdition = function() {
            	$scope.editOutput.adding = true;
            	$scope.role.editing = true;
            	$scope.editOutputs.push($scope.editOutput);

            	var selectOption = function(role) {
                	if (role.acceptsDataset) {
                		return "create";
                    } else if (role.acceptsManagedFolder) {
                        return "new-odb";
                    } else if (role.acceptsModelEvaluationStore) {
                        return "new-mes";
                	} else {
                		return "select";
                	}
            	};
            	if ( $scope.io.newOutputTypeRadio == null ) {
            		$scope.io.newOutputTypeRadio = selectOption($scope.role);
            	} else if ( $scope.io.newOutputTypeRadio == "create" && !$scope.role.acceptsDataset ) {
            		$scope.io.newOutputTypeRadio = selectOption($scope.role);
                } else if ( $scope.io.newOutputTypeRadio == "new-odb" && !$scope.role.acceptsManagedFolder ) {
                    $scope.io.newOutputTypeRadio = selectOption($scope.role);
                } else if ( $scope.io.newOutputTypeRadio == "new-mes" && !$scope.role.acceptsModelEvaluationStore ) {
                    $scope.io.newOutputTypeRadio = selectOption($scope.role);
            	}
            };
            var endEdition = function() {
            	$scope.editOutput.adding = false;
            	$scope.role.editing = false;
            	var idx = $scope.editOutputs.indexOf($scope.editOutput);
            	if (idx >= 0) $scope.editOutputs.splice(idx, 1);
            };

            var setUsable = function(list){
               	// put usable datasets at the beginning
               	list.sort(function(a,b) {
               		if (a.usableAsOutput[$scope.role.name] && a.usableAsOutput[$scope.role.name].usable && !a.alreadyUsedAsOutputOf &&
                        (!b.usableAsOutput[$scope.role.name] || !b.usableAsOutput[$scope.role.name].usable || b.alreadyUsedAsOutputOf))
               			return -1;
               		if ((!a.usableAsOutput[$scope.role.name] || !a.usableAsOutput[$scope.role.name].usable || a.alreadyUsedAsOutputOf) &&
                        b.usableAsOutput[$scope.role.name] && b.usableAsOutput[$scope.role.name].usable && !b.alreadyUsedAsOutputOf)
               			return 1;
            		return (a.label || '').localeCompare((b.label || ''));
               	});
               	$scope.editOutput.usable = list;
            };

            $scope.itemsWatchHooked = false;
            var hookItemsWatch = function() {
            	$scope.itemsArray = $scope.recipe.outputs[$scope.role.name].items;
                $scope.$watchCollection("itemsArray", function(nv){
                    if ($scope.roleChanged) {
                    	$scope.roleChanged($scope.role.name);
                    }
                });
                $scope.itemsWatchHooked = true;
            };
            if ( $scope.recipe.outputs[$scope.role.name] != null ) {
            	// items can be null in a recipe newly created
            	hookItemsWatch();
            }

            $scope.$watch("editOutput.filter", function(){
            	setUsable(RecipeComputablesService.buildPossibleOutputList(
            			$scope.recipe, $scope.computablesMap, $scope.editOutput.role, $scope.editOutput.filter));
            });

            $scope.enterAddOutput = function(role) {
                $scope.uiState.backendWarnings = null;
                beginEdition();
                $scope.editOutput.role = role;
                setUsable(RecipeComputablesService.buildPossibleOutputList(
                            $scope.recipe, $scope.computablesMap, role, $scope.editOutput.filter));

                // the select element seems to be caching something, and after hiding and showing the
                // create new dataset form a few times (2 times on firefox, 3 on chrome) the option
                // shown to be selected is incorrect ('nothing selected' but the option is not null).
                // it's probably a race condition somewhere, so we solve it the hard way: make the
                // select reinitialize its sate each  time
                $scope.newOutputDataset.connectionOption = null;
                $scope.getManagedDatasetOptions(role).then(function(data){
                    $scope.setupManagedDatasetOptions(data);
                })
                $scope.getManagedFolderOptions(role).then(function(data){
                    $scope.setupManagedFolderOptions(data);
                })
                $scope.getModelEvaluationStoreOptions(role).then(function(data){
                    $scope.setupModelEvaluationStoreOptions(data);
                })
                $scope.getStreamingEndpointOptions(role).then(function(data){
                    $scope.setupStreamingEndpointOptions(data);
                })
            };

            $scope.cancelAddOutput = function(){
                endEdition();
            };

            $scope.acceptEdit = function(computable){
                Assert.trueish($scope.editOutput.adding, 'not adding inputs');
                var promise = $q.when(null);

                if (attrs.location == "modal") {
                    if ($scope.role.arity == "UNARY") {
                        $scope.recipe.outputs[$scope.role.name] = { items : []};
                    }
                    RecipesUtils.addOutput($scope.recipe, $scope.role.name, computable.smartName);
                } else {
                    var currentRecipeAndPayload = {
                        recipe : angular.copy($scope.recipe),
                        payload: angular.copy($scope.script.data)
                    }
                    var newRecipeAndPayload = {
                        recipe : angular.copy($scope.recipe),
                        payload: angular.copy($scope.script.data)
                    }
                    if ($scope.role.arity == "UNARY") {
                        newRecipeAndPayload.recipe.outputs[$scope.role.name] = { items : []};
                    }
                    RecipesUtils.addOutput(newRecipeAndPayload.recipe, $scope.role.name, computable.smartName);
                    promise = DataikuAPI.flow.recipes.getIOChangeResult($stateParams.projectKey, currentRecipeAndPayload, newRecipeAndPayload)
                        .error($scope.setErrorInTopScope($scope))
                        .then(function(resp){
                            $scope.recipe.inputs = resp.data.updated.recipe.inputs;
                            $scope.recipe.outputs = resp.data.updated.recipe.outputs;
                            return;
                        });
                }

                promise.then(function(){
                    endEdition();
                    if (!$scope.itemsWatchHooked) {
                      	hookItemsWatch();
                    }
                });
            };

            if ($scope.role.arity == 'UNARY' && attrs.location != 'modal') {
                /* Auto enter edit mode if none selected */
                if ($scope.role.required && (!$scope.recipe.outputs[$scope.role.name] || $scope.recipe.outputs[$scope.role.name].items.length == 0)) {
                    beginEdition();
                }
            }
        }
    }
});

})();
