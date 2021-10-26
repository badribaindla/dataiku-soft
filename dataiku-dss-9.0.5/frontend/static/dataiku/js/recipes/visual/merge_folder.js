(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("MergeFolderRecipeCreationController", function($scope, $controller, $stateParams, DataikuAPI, Fn, RecipeComputablesService) {

        $controller("CodeBasedRecipeCreationController", {$scope:$scope});

        $scope.recipeType = "merge_folder";
        $scope.recipeName = {};
        $scope.recipe = {
            type: 'merge_folder',
            projectKey: $stateParams.projectKey,
            inputs: {
                main: {
                    items: []
                }
            },
            outputs: {
                main: {
                    items: []
                }
            }
        };

        RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map) {
            $scope.setComputablesMap(map);
        });

    });

    app.controller("MergeFolderRecipeController", function($scope, $stateParams, $q, $timeout, DataikuAPI, PartitionDeps) {
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

        $scope.conflictHandlings = [
            ["SUFFIX", "Add a suffix when conflicts happen"],
            ["FAIL", "Fail if files conflict"],
            ["OVERWRITE", "Overwrite files with the same name"]
        ];

        $scope.recipe.params.conflictHandling = $scope.recipe.params.conflictHandling || "OVERWRITE";
    });

})();
