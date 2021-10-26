(function() {
    'use strict';
	var app = angular.module('dataiku.recipes');

    // Creation modal controller
    app.controller("CsyncRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $controller) {
        $scope.recipeType = "csync";
        $scope.datasetsOnly = false;
        $scope.filterUsableInputsOn = "main";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});
        
        $scope.singleOutputRole.acceptsStreamingEndpoint = true; // add the possibility of streaming endpoints

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_copy");
            }
        };
    });


    app.controller("CsyncRecipeController", function($scope, $stateParams, $q, $controller, Assert, StateUtils, DataikuAPI, Dialogs, TopNav, RecipesUtils, PartitionDeps, ComputableSchemaRecipeSave, Logger) {
	    Assert.inScope($scope, 'recipe');

        $controller("_RecipeWithEngineBehavior", {$scope:$scope});
        $controller("_ContinuousRecipeInitStartedJobBehavior", {$scope:$scope});

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
        $scope.params = $scope.recipe.params;

        $scope.$watch("recipe.params", $scope.updateRecipeStatusLater, true);
        $scope.enableAutoFixup();
        $scope.specificControllerLoadedDeferred.resolve();
        
        $scope.isStreamingEndpointToDataset = function() {
            let input = RecipesUtils.getSingleInput($scope.recipe, "main");
            let output = RecipesUtils.getSingleOutput($scope.recipe, "main");
            let inputComputable = $scope.computablesMap[input.ref] || {};
            let outputComputable = $scope.computablesMap[output.ref] || {};
            return outputComputable.type === 'DATASET' && inputComputable.type === 'STREAMING_ENDPOINT';
        };
	});
})();