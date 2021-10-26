(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("SamplingRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $controller) {
        $scope.recipeType = "sampling";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_filtered");
            }
        };
    });


    // Recipe edition page controller
    app.controller("SamplingRecipeController", function ($scope, $stateParams, $q, DataikuAPI, TopNav, Dialogs, PartitionDeps,
                                                         RecipesUtils, $controller, Logger, SamplingData,
                                                         CreateModalFromTemplate, DatasetUtils, RecipeComputablesService) {
        var visualCtrl = $controller('VisualRecipeEditorController', {$scope: $scope}); //Controller inheritance
        this.visualCtrl = visualCtrl;

        $scope.SamplingData = SamplingData;

        var defaultSampling = {
            "samplingMethod": "FULL",
            "maxRecords": 30000,
            "targetRatio": 0.1
        };

        $scope.hooks.getPayloadData = function() {
            return angular.toJson($scope.filter);
        };

        $scope.hooks.preRunValidate = function() {
            var deferred = $q.defer();
            $scope.hooks.updateRecipeStatus().then(function(data) {
                if (data) {
                    Logger.info("preRunValidate failed",data);
                    var validationData = {error: false, messages: []};
                    if (data.filter.invalid) {
                        validationData.error=true;
                        data.filter.errorMessages.forEach(function(m) {validationData.messages.push({"message":m});});
                    }
                    if (data.output.invalid) {
                        validationData.error=true;
                        data.output.errorMessages.forEach(function(m) {validationData.messages.push({"message":m});});
                    }
                    deferred.resolve(validationData);
                } else {
                    deferred.resolve({error: false});
                }
            },
            function(data){
                Logger.error("Error when getting status", data);
                setErrorInScope.bind($scope);
                deferred.reject("Validation failed");
            });
            return deferred.promise;
        };

        var superSave = $scope.hooks.save;
        $scope.hooks.save = function() {
            return superSave().then(function(){
                origSelection = angular.copy($scope.selection);
            });
        };

        var superRecipeIsDirty = $scope.hooks.recipeIsDirty;
        var origSelection;
        $scope.hooks.recipeIsDirty = function() {
            if (superRecipeIsDirty()) return true;
            // no need to compare the contents of the filter object if it is disabled
            var selectionEquals = angular.equals($scope.selection, origSelection);
            return !selectionEquals;
        };

        $scope.hooks.onRecipeLoaded = function(){
            Logger.info("On Recipe Loaded");
            origSelection = angular.copy($scope.selection);
            //keep params for dirtyness detection
            visualCtrl.saveServerParams();
            $scope.hooks.updateRecipeStatus();
            $scope.$watch("recipe.params",  $scope.updateRecipeStatusLater, true);
            $scope.$watch("filter", $scope.updateRecipeStatusLater, true);
        };

        $scope.hooks.updateRecipeStatus = function() {
            var deferred = $q.defer();
            var payload = $scope.hooks.getPayloadData();
            $scope.updateRecipeStatusBase(false, payload).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) return deferred.reject();
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        $scope.resyncSchema = function() {
            Dialogs.confirmPositive($scope,
                'Resynchronize schema',
                'The schema of "'+$scope.recipe.inputs[0]+'" will be copied to "'+$scope.recipe.outputs[0]+'". Are you sure you want to continue ?'
            )
            .then(function() {
                DataikuAPI.flow.recipes.basicResyncSchema($stateParams.projectKey,
                        $scope.hooks.getRecipeSerialized()).error(setErrorInScope.bind($scope));
            });
        };

        $scope.availableOutputDatasets = [];
        $scope.convertToSplitRecipe = function () {
            function doConvertToSplitRecipe(secondOutputDataset) {
                DataikuAPI.flow.recipes.visual.convertSamplingRecipeToSplitRecipe($stateParams.projectKey, $scope.recipe, secondOutputDataset)
                    .then(function () {
                        location.reload();
                    }, setErrorInScope.bind($scope));
            }
            if ($scope.hooks.recipeIsDirty()) {
                $scope.hooks.save();
            }
            CreateModalFromTemplate("/templates/recipes/io/output-selection-modal.html", $scope, null, function(modalScope) {
                $controller("_RecipeOutputNewManagedBehavior", {$scope: modalScope});

                DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, $scope.recipe.type).then(function(data) {
                    const alreadyInOutput = function(computable) {
                        if ($scope.recipe && $scope.recipe.outputs && $scope.recipe.outputs.main && $scope.recipe.outputs.main.items) {
                            return $scope.recipe.outputs.main.items.filter(item => item.ref == computable.smartName).length > 0;
                        } else {
                            return false;
                        }
                    };
                    $scope.availableOutputDatasets = data[1].filter(function(computable) {
                        return computable.usableAsOutput['main'].usable && !computable.alreadyUsedAsOutputOf && !alreadyInOutput(computable);
                    });
                });

                DataikuAPI.datasets.getManagedDatasetOptions($scope.recipe, 'main').success(function(data) {
                    modalScope.setupManagedDatasetOptions(data);
                });

                modalScope.ok = function() {
                    if (modalScope.io.newOutputTypeRadio == 'select') {
                        if (!modalScope.io.existingOutputDataset) return;
                        doConvertToSplitRecipe(modalScope.io.existingOutputDataset);
                    } else {
                        const creationSettings = {
                            connectionId : modalScope.newOutputDataset.connectionOption.id,
                            specificSettings : {
                                formatOptionId : modalScope.newOutputDataset.formatOptionId,
                                overrideSQLCatalog: modalScope.newOutputDataset.overrideSQLCatalog,
                                overrideSQLSchema: modalScope.newOutputDataset.overrideSQLSchema
                            },
                            partitioningOptionId : modalScope.newOutputDataset.partitioningOption
                        };
                        DataikuAPI.datasets.newManagedDataset($stateParams.projectKey, modalScope.newOutputDataset.name, creationSettings).success(function(dataset) {
                            RecipeComputablesService.getComputablesMap(modalScope.recipe, modalScope).then(function(map){
                                modalScope.setComputablesMap(map);
                                doConvertToSplitRecipe(dataset.name);
                            }, setErrorInScope.bind(modalScope));
                        }).error(setErrorInScope.bind(modalScope));
                    }
                };
            });
        };

        $scope.filter = {};
        if ($scope.script && $scope.script.data) {
            $scope.filter = JSON.parse($scope.script.data);
        }

        $scope.params = $scope.recipe.params;

        //TODO @sampling, why is this necessary?
        $scope.selection = $scope.recipe.params.selection;
        $scope.$watch("selection", function(nv, ov) {
            Logger.info("Selection changed", nv);
            if (nv) {
                $scope.recipe.params.selection = nv;
            }
        }, true);

        $scope.enableAutoFixup();
        $scope.specificControllerLoadedDeferred.resolve();
    });
})();