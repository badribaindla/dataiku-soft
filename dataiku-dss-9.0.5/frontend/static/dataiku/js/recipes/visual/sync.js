(function() {
    'use strict';
	var app = angular.module('dataiku.recipes');

    // Creation modal controller
    app.controller("SyncRecipeCreationController", function($scope, $rootScope, Fn, $stateParams, DataikuAPI, $controller, FeatureFlagsService) {
        $scope.recipeType = "sync";
        if ($rootScope.appConfig.streamingEnabled) {
            $scope.datasetsOnly = false;
            $scope.inputDatasetsOnly = true;
        }        
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        if ($rootScope.appConfig.streamingEnabled) {
            $scope.singleOutputRole.acceptsStreamingEndpoint = true; // add the possibility of streaming endpoints
        }        

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_copy");
            }
        };
    });


    app.controller("SyncRecipeController", function($scope, $stateParams, $q, $controller, Assert, StateUtils, DataikuAPI, Dialogs, TopNav, RecipesUtils, PartitionDeps, ComputableSchemaRecipeSave, Logger) {
	    Assert.inScope($scope, 'recipe');

        $controller("_RecipeWithEngineBehavior", {$scope:$scope});

        $scope.schemaModes = [
            ["FREE_SCHEMA_NAME_BASED", "Free output schema (name-based matching)"],
            ["STRICT_SYNC", "Maintain strict schema equality"]
        ];

        $scope.hooks.save = function(){
            if ($scope.recipe.params.schemaMode == "FREE_SCHEMA_NAME_BASED") {
                return $scope.hooks.origSaveHook();
            } else {
                var deferred = $q.defer();
                var recipeSerialized = angular.copy($scope.recipe);
                PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
                ComputableSchemaRecipeSave.handleSave($scope, recipeSerialized, null, deferred);
                return deferred.promise;
            }
        };

        $scope.hooks.onRecipeLoaded = function() {
            Logger.info("On Recipe Loaded");
            $scope.hooks.updateRecipeStatus();
        };

        $scope.hooks.updateRecipeStatus = function() {
            var deferred = $q.defer();
            $scope.updateRecipeStatusBase(false).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) return deferred.reject();
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        $scope.resyncSchema = function() {
            var input = RecipesUtils.getSingleInput($scope.recipe, "main");
            var output = RecipesUtils.getSingleOutput($scope.recipe, "main");
            Dialogs.confirmPositive($scope, 'Resynchronize schema',
                'The schema of "'+input.ref+'" will be copied to "'+output.ref+'". Are you sure you want to continue ?')
            .then(function() {
                 DataikuAPI.flow.recipes.basicResyncSchema($stateParams.projectKey, $scope.hooks.getRecipeSerialized()).error(setErrorInScope.bind($scope));
            });
        };

        TopNav.setTab(StateUtils.defaultTab("io"));

        $scope.recipe.params = $scope.recipe.params || {};
        $scope.recipe.params.schemaMode = $scope.recipe.params.schemaMode || "FREE_SCHEMA_NAME_BASED";
        $scope.params = $scope.recipe.params;

        $scope.$watch("recipe.params", $scope.updateRecipeStatusLater, true);
        $scope.enableAutoFixup();
        $scope.specificControllerLoadedDeferred.resolve();
	});
})();