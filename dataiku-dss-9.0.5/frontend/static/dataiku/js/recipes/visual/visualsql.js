(function(){
'use strict';

var app = angular.module('dataiku.recipes');


app.controller("VisualRecipeEditorController", function ($scope, $stateParams, $q, $controller, DataikuAPI, PartitionDeps, CreateModalFromTemplate,
               ComputableSchemaRecipeSave, Dialogs, DKUtils, DatasetUtils, Logger) {
    $controller("_RecipeWithEngineBehavior", {$scope:$scope});
    var visualCtrl = this;

    $scope.hooks.preRunValidate = function() {
        var deferred = $q.defer();
        $scope.hooks.updateRecipeStatus().then(function(data) {
            if (data && data.invalid) {
                Logger.info("preRunValidate failed",data)
                Dialogs.confirm($scope, "Recipe contains errors", "The recipe contains errors. Are you sure you want to run it?").then(function() {
                    deferred.resolve({ok: true});
                }, function(){
                    deferred.reject("Validation failed");
                });
            } else {
                deferred.resolve({ok: true});
            }
        },
        function(data){
            Logger.error("Error when getting status", data);
            setErrorInScope.bind($scope);
            deferred.reject("Validation failed");
        });
        return deferred.promise;
    };

    var paramsSavedOnServer = undefined;
    visualCtrl.saveServerParams = function() {
        paramsSavedOnServer = angular.copy($scope.hooks.getPayloadData());
    }

    var superRecipeIsDirty = $scope.hooks.recipeIsDirty;
    $scope.hooks.recipeIsDirty = function() {
        var currentPayload = $scope.hooks.getPayloadData();
        if (currentPayload) {
            currentPayload = angular.fromJson(currentPayload);
        }
        var savedPayload = paramsSavedOnServer;
        if (savedPayload) {
            savedPayload = angular.fromJson(savedPayload);
        }
        return superRecipeIsDirty() || !angular.equals(currentPayload, savedPayload);
    };

    $scope.hooks.save = function() {
        var deferred = $q.defer();
        var recipeSerialized = angular.copy($scope.recipe);
        PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
        var payloadData = $scope.hooks.getPayloadData();
        ComputableSchemaRecipeSave.handleSave($scope, recipeSerialized, payloadData, deferred);
        return deferred.promise.then(visualCtrl.saveServerParams);
    };

    $scope.showChangeInputModal = function(virtualInputIndex) {
        var newScope = $scope.$new();
        newScope.virtualInputIndex = virtualInputIndex;
        CreateModalFromTemplate("/templates/recipes/visual-recipes-fragments/visual-recipe-change-input-modal.html", newScope);
    };

    $scope.convert = function(type, label) {
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
        newScope.convert = $scope.convert;
        newScope.uiState = {currentTab: 'query'};
        $scope.hooks.updateRecipeStatus(false, true).then(function(){
        	// get the latest values, not the ones of before the updatestatus call
        	newScope.query = $scope.recipeStatus.sql;
        	newScope.engine = $scope.recipeStatus.selectedEngine.type;
        	newScope.executionPlan = $scope.recipeStatus.executionPlan;
            newScope.cannotConvert = $scope.hasMultipleOutputs();
            CreateModalFromTemplate("/templates/recipes/fragments/sql-modal.html", newScope);
        });
    };

    $scope.hasMultipleOutputs = function() {
        return $scope.recipeStatus.sqlWithExecutionPlanList && $scope.recipeStatus.sqlWithExecutionPlanList.length > 1;
    };

    $scope.selectOutputForSql = outputName => {
        let sqlWithExecutionPlan = $scope.recipeStatus.sqlWithExecutionPlanList.find(s => s.outputName === outputName);
        if (sqlWithExecutionPlan === undefined) {
            sqlWithExecutionPlan = $scope.recipeStatus.sqlWithExecutionPlanList[0];
        }
        $scope.selectedOutputName = sqlWithExecutionPlan.outputName;
        $scope.recipeStatus.sql = sqlWithExecutionPlan.sql;
        $scope.recipeStatus.executionPlan = sqlWithExecutionPlan.executionPlan;
    };

    $scope.getSingleInputName = function() {
        if ($scope.recipe && $scope.recipe.inputs && $scope.recipe.inputs.main && $scope.recipe.inputs.main.items.length) {
            return $scope.recipe.inputs.main.items[0].ref;
        }
    };

    $scope.getColumns = function(datasetName) {
        var schema = DatasetUtils.getSchema($scope, datasetName || $scope.getSingleInputName());
        return schema ? schema.columns : [];
    };

    $scope.getColumnNames = function(datasetName) {
        return $scope.getColumns(datasetName).map(function(col) {return col.name});
    };

    $scope.getColumn = function(datasetName, name) {
        return $scope.getColumns(datasetName).filter(function(col) {return col.name==name})[0];
    };

    $scope.datasetHasColumn = function(datasetName, columnName) {
        return !!$scope.getColumn(datasetName, columnName);
    };

    $scope.columnTypes = [
        {name:'TINYINT',label:'tinyint (8 bit)'},
        {name:'SMALLINT',label:'smallint (16 bit)'},
        {name:'INT',label:'int'},
        {name:'BIGINT',label:'bigint (64 bit)'},
        {name:'FLOAT',label:'float'},
        {name:'DOUBLE',label:'double'},
        {name:'BOOLEAN',label:'boolean'},
        {name:'STRING',label:'string'},
        {name:'DATE',label:'date'},
        {name:'ARRAY',label:'array<...>'},
        {name:'MAP',label:'map<...>'},
        {name:'OBJECT',label:'object<...>'}
    ];

});


app.controller("ChangeRecipeVirtualInputController", function ($scope, DataikuAPI, $stateParams, DatasetUtils, RecipesUtils) {
    DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, "join").then(function(data){
        $scope.availableInputDatasets = data[0];
    });
    $scope.replacement = {};

    $scope.$watch("replacement.name", function(nv) {
        if (nv) {
            var payload = $scope.hooks.getPayloadData();
            var newInputName = nv;
            delete $scope.replacementImapact;
            DataikuAPI.flow.recipes.visual.testInputReplacement($stateParams.projectKey, $scope.recipe, payload, $scope.virtualInputIndex, newInputName).then(function(response){
                $scope.replacementImapact = response.data;
            });
        }
    })

    $scope.ok = function(dismiss) {
        // Add dataset to recipes
        if (RecipesUtils.getInput($scope.recipe, "main", $scope.replacement.name) == null) {
            RecipesUtils.addInput($scope.recipe, "main", $scope.replacement.name);
        }

        $scope.onInputReplaced($scope.replacement, $scope.virtualInputIndex);

        dismiss();
        $scope.hooks.updateRecipeStatus();
    }
});

app.directive('fieldsForFilterDesc', function() {
    return {
        restrict: 'A',
        scope: false,
        link : function($scope, element, attrs) {
            $scope.distinctOptionDisabled=true
            var updateFields = function() {
                if ($scope.params == null || $scope.recipe == null || $scope.computablesMap == null) {
                    return;
                }
                $scope.filterDesc = $scope.params.preFilter;
                $scope.dataset = $scope.recipe.inputs['main'].items[0].ref;
                $scope.schema = $scope.computablesMap[$scope.recipe.inputs['main'].items[0].ref].dataset.schema;
            };
            $scope.$watch('params', updateFields);
            $scope.$watch('recipe', updateFields, true);
            $scope.$watch('computablesMap', updateFields); // not deep => won't react to changes, but hopefully watching the recipe is enough
        }
    };
});

app.directive('baseTypeSelector', function($timeout, ListFilter) {
    return {
        restrict: 'A',
        scope: {
            schemaColumn: '='
        },
        templateUrl: '/templates/recipes/visual-recipes-fragments/base-type-selector.html',
        link : function($scope, element, attrs) {
            $scope.columnTypes = [
                                  {name:'tinyint',label:'tinyint (8 bit)'},
                                  {name:'smallint',label:'smallint (16 bit)'},
                                  {name:'int',label:'int'},
                                  {name:'bigint',label:'bigint (64 bit)'},
                                  {name:'float',label:'float'},
                                  {name:'double',label:'double'},
                                  {name:'boolean',label:'boolean'},
                                  {name:'string',label:'string'},
                                  {name:'date',label:'date'},
                                  {name:'array',label:'array<...>'},
                                  {name:'map',label:'map<...>'},
                                  {name:'object',label:'object<...>'}
                              ];
            $scope.select = function(columnType) {
                $scope.schemaColumn.type = columnType.name;
            };
        }
    };
});

app.directive('aggregateTypeEditor', function() {
    return {
        restrict: 'A',
        scope: {
            schemaColumn: '='
        },
        replace: true,
        templateUrl: '/templates/recipes/visual-recipes-fragments/aggregate-type-editor.html',
        link : function($scope, element, attrs) {
            $scope.addObjectField = function() {
                $scope.schemaColumn.objectFields = $scope.schemaColumn.objectFields || [];
                $scope.schemaColumn.objectFields.push({name:'', type:'string'});
            };
            var ensureSubFields = function() {
                if ($scope.schemaColumn.type == 'array') {
                    $scope.schemaColumn.arrayContent = $scope.schemaColumn.arrayContent || {name:'', type:'string'};
                }
                if ($scope.schemaColumn.type == 'map') {
                    $scope.schemaColumn.mapKeys = $scope.schemaColumn.mapKeys || {name:'', type:'string'};
                    $scope.schemaColumn.mapValues = $scope.schemaColumn.mapValues || {name:'', type:'string'};
                }
                if ($scope.schemaColumn.type == 'object') {
                    $scope.schemaColumn.objectFields = $scope.schemaColumn.objectFields || [];
                }
            };
            $scope.$watch('schemaColumn.type', ensureSubFields);
        }
    };
});

})();