(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');


    app.controller("UpdateRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $controller) {
        $scope.recipeType = "update";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.inlineDataset = true; // to send to the check-name-safety

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_copy");
            }
        };
    });


    app.controller("UpdateRecipeController", function($scope, $stateParams, $q, $timeout, DataikuAPI, Dialogs, PartitionDeps, RecipesUtils, ActivityIndicator, ComputableSchemaRecipeSave) {
        $scope.hooks.save = function() {
            var deferred = $q.defer();
            var recipeSerialized = angular.copy($scope.recipe);
            PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
            var serializedPayload = angular.toJson($scope.recipe.params);
            ComputableSchemaRecipeSave.handleSave($scope, recipeSerialized, serializedPayload, deferred);
            return deferred.promise;
        };

        $scope.hooks.preRunValidate = function() {
            var deferred = $q.defer();
            if (!$scope.recipe.params.uniqueKey || $scope.recipe.params.uniqueKey.length == 0) {
                ActivityIndicator.error("Unique key is required");
                deferred.reject("Unique key is required");
            } else {
                deferred.resolve({ok: true});
            }
            return deferred.promise;
        };

        $scope.uiState = {};
        $scope.recipe.params = $scope.recipe.params || {};
        $scope.recipe.params.uniqueKey = $scope.recipe.params.uniqueKey || [];
        $scope.recipe.params.filter = $scope.recipe.params.filter || {};
        $scope.recipe.params.addMissingRows =   $scope.recipe.params.addMissingRows !== undefined ? $scope.recipe.params.addMissingRows : true;
        $scope.recipe.params.deleteMissingCols = $scope.recipe.params.deleteMissingCols || false;
        $scope.recipe.params.deleteMissingRows = $scope.recipe.params.deleteMissingRows || false;
        $scope.recipe.params.addMissingCols = $scope.recipe.params.addMissingCols !== undefined ? $scope.recipe.params.addMissingCols : true;

        //TODO move
        $scope.getInputName = function(idx, role) {
            idx = idx || 0;
            role = role || 'main';
            return $scope.recipe.inputs[role].items[idx].ref;
        };

        $scope.getInputSchema = function(idx, role) {
            if ($scope.computablesMap) {
                return $scope.computablesMap[$scope.getInputName(idx, role)].dataset.schema;
            }
        };

        function getInputColumns() {
            return $scope.getInputSchema().columns.map(function(col){return col.name});
        }

        $scope.updateSuggests = function() {
            var schema = $scope.getInputSchema();
            if (schema && schema.columns) {
                $scope.remainingSuggests = listDifference(getInputColumns(), $scope.recipe.params.uniqueKey);
            }
        };

        $scope.addKeyPart = function(name) {
            if (listDifference(getInputColumns(), $scope.recipe.params.uniqueKey).indexOf(name) >= 0) {
                $scope.recipe.params.uniqueKey.push(name);
                $scope.updateSuggests();
                $timeout(function() {$scope.uiState.newKeyPart = '';$('#keypart').blur();});
            }
        };

        $scope.removeKeyPart = function(index) {
            $scope.recipe.params.uniqueKey.splice(index,1);
            $scope.updateSuggests();
        };

        //enable auto-add key part on click (no need to type enter)
        $scope.$on("typeahead-updated", function() {
            safeApply($scope, function(){
                $scope.addKeyPart($scope.uiState.newKeyPart);
            });
        });

        $scope.$on('computablesMapChanged', $scope.updateSuggests, true);

        $scope.$watch('getInputSchema()', $scope.updateSuggests);

        $scope.updateSuggests();
        $scope.enableAutoFixup();
    });

    app.directive("exportRecipeBody", function(Assert, ExportService) {
        return {
            scope: true,
            link: function($scope) {
                Assert.inScope($scope, 'recipe');
                let setExportParams = function(params) {
                    $scope.recipe.params.exportParams = params;
                };
                ExportService.initExportBehavior($scope, {}, {advancedSampling: true, partitionListLoader: null},
                    $scope.recipe.params, null, $scope.recipe.params.exportParams, setExportParams);
            }
        };
    });


app.controller("ExportRecipeCreationController", function($scope, $stateParams, $state, $controller, Fn,
        DataikuAPI, WT1, RecipesUtils, RecipeDescService, DatasetsService, RecipeComputablesService, PartitionDeps, BigDataService) {

    $controller("_RecipeCreationControllerBase", {$scope:$scope});

    function init(){

        $scope.recipeName = {};
        $scope.script = "";
        $scope.recipe = {
            projectKey : $stateParams.projectKey,
            type: "export",
            inputs : {},
            outputs : {},
            params: {}
        };

        if($scope.recipePrefillKey) {
            var prefill = BigDataService.fetch($scope.recipePrefillKey);

            if(prefill) {
                if(prefill.script) {
                    $scope.script = prefill.script;
                }
                if(prefill.input) {
                    prefill.input.forEach(function(x){
                        RecipesUtils.addInput($scope.recipe, "main", x);
                    })
                }
                if(prefill.output) {
                    prefill.output.forEach(function(x){
                        RecipesUtils.addOutput($scope.recipe, "main", x);
                    });
                }
            }
        }
        $scope.$on("preselectInputDataset", function(scope, preselectedInputDataset) {
            RecipesUtils.addInput($scope.recipe, "main", preselectedInputDataset);
            $scope.preselectedInputDataset = preselectedInputDataset;
        });

        RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
            $scope.setComputablesMap(map);
        });
    }

    // we will autofill the name if needed
    $scope.$watch("[recipe.inputs, recipe.outputs]", function(nv, ov) {
        if (nv && $scope.recipe && $scope.recipe.inputs && $scope.recipe.outputs){
            if ($scope.preselectedInputDataset && $scope.recipe.inputs.main.items[0].ref != $scope.preselectedInputDataset) {
                $scope.zone = null;
            }
            var outputs = RecipesUtils.getFlatOutputsList($scope.recipe);
            $scope.hasRequiredIO = RecipeDescService.hasValidRequiredRoles($scope.recipe);
            if (outputs.length && $scope.hasRequiredIO) {
                $scope.recipeName.name = "compute_" + outputs[0].ref;
            } else {
                // erase the name to make the modal not ready to close
                $scope.recipeName.name = null;
            }
        }
    }, true);


    init();

    addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);
    fetchManagedDatasetConnections($scope, DataikuAPI);
    DatasetsService.updateProjectList($stateParams.projectKey);
});


    app.controller("ExportRecipeController", function($scope, $stateParams, $q, $timeout, DataikuAPI, Dialogs, PartitionDeps) {
        $scope.hooks.save = function() {
            var deferred = $q.defer();
            var recipeSerialized = angular.copy($scope.recipe);
            PartitionDeps.prepareRecipeForSerialize(recipeSerialized);

            $scope.baseSave(recipeSerialized, null).then(function(){
                        deferred.resolve("Save done");
                    }, function(error) {
                        Logger.error("Could not save recipe");
                        deferred.reject("Could not save recipe");
                    })
            return deferred.promise;
        };

        $scope.hooks.preRunValidate = function() {
            var deferred = $q.defer();
            deferred.resolve({"ok" : true});
            return deferred.promise;
        };

        $scope.enableAutoFixup();
    });
})();
