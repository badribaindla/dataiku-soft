(function() {

'use strict';
var app = angular.module('dataiku.recipes');

app.controller("HiveRecipeController", function($scope, DataikuAPI,ActivityIndicator, $q, WT1, $stateParams, RecipeRunJobService, RecipesUtils, Fn, DKUtils, CreateModalFromTemplate, Dialogs, $state, $timeout,  CodeBasedEditorUtils, CodeBasedValidationUtils, ComputableSchemaRecipeSave, CodeMirrorSettingService) {
    // Editor
    $scope.identifierQuote = '`';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-hivesql', $scope, true);
    $scope.editorOptions.extraKeys[CodeMirrorSettingService.getShortcuts()['AUTOCOMPLETE_SHORTCUT']] = function(cm) {
        $scope.recipeWT1Event("hive-script-autocomplete");
        CodeMirror.showHint(cm, function(cm){
            var relevantDatasetRefs = RecipesUtils.getFlatIOList($scope.recipe).map(Fn.prop("ref"));
            var fieldsToAutocomplete = CodeMirror.sqlFieldsAutocomplete(cm, relevantDatasetRefs.map(function(v) { return {table:v}; }));
            var sqlFields = [];
            if (fieldsToAutocomplete && fieldsToAutocomplete.length) {
                for(var i in relevantDatasetRefs) {
                    var tableName = relevantDatasetRefs[i];
                    var columns = $scope.computablesMap[tableName].dataset.schema.columns;
                    for(var j in columns) {
                        sqlFields.push({name:columns[j].name,table:tableName});
                    }
                }
            }
            CodeMirror.showHint(cm, function(cm){
                return CodeMirror.sqlNotebookHint(cm, "hive-recipe", relevantDatasetRefs,sqlFields);
            }, {completeSingle:false});
        });
    };

    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            $scope.cm.replaceSelection(' ${'+variableName+'} ', "end");
        });
        $scope.cm.focus();
    }

    $scope.enableAutoFixup();

    $scope.validateRecipe = function() {
        var preValidate = new Date().getTime();

        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;

            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            $scope.recipeWT1Event("hive-validate", {
                ok : !valResult.topLevelMessages.error,
                time : (new Date().getTime() - preValidate),
                schemaChange : (valResult.schemaResult ? (valResult.schemaResult.totalIncompatibilities > 0) : false),
                firstError : (valResult.topLevelMessages.messages.length ? valResult.topLevelMessages.messages[0].message : null)
            });

            return ComputableSchemaRecipeSave.handleSchemaUpdateWithPrecomputed($scope, valResult.schemaResult).then(function(changeResult){
                if (changeResult.changed) {
                    // Validate again
                    return $scope.validateRecipe();
                } else {
                    return valResult;
                }
            });
        });
    };

    $scope.hooks.preRunValidate = $scope.validateRecipe;

    $scope.synchronizeInput = function(datasetLoc) {
        const datasets = [datasetLoc];
        DataikuAPI.datasets.synchronizeHiveMetastore(datasets).success(function () {
            $scope.validateRecipe();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.autofillCode = function() {
        //Nothing to do: Hive recipes are prefilled on creation
    };

    $scope.doConversionToImpala = function(type, label) {
        Dialogs.confirm($scope, "Convert to Impala recipe", "Are you sure you want to convert "+
            "this to an Impala recipe? This operation is irreversible.").then(function() {
            $scope.recipe.type = "impala";
            $scope.saveRecipe().then(function() {
                $state.go('projects.project.recipes.recipe', {projectKey : $stateParams.projectKey, recipeName: $scope.recipe.name});
                DKUtils.reloadState();
            });
        });
    };

    $scope.convertToImpala = function() {
        DataikuAPI.flow.recipes.hive.checkImpalaConvertibility($stateParams.projectKey,
            $scope.hooks.getRecipeSerialized(),
            $scope.script.data, RecipeRunJobService.getTargetPartition($scope, $stateParams)).success(function(data) {
                var newScope = $scope.$new();
                newScope.executionPlan = data.executionPlan;
                newScope.query = data.sql;
                newScope.runsOnImpala = true;
                newScope.validatesOnImpala = data.runsOnImpala;
                newScope.impalaImpossibilityReason = data.impalaImpossibilityReason;
                newScope.convert = $scope.doConversionToImpala;
                newScope.uiState = {currentTab: 'query'};
                CreateModalFromTemplate("/templates/recipes/fragments/sql-modal.html", newScope, null, function(newScope){
                    newScope.engine = 'IMPALA';
                    newScope.isAlreadyRecipe = false; // this is the conversion modal, show the conversion button
                });
        }).error(setErrorInScope.bind($scope));
    };
});

app.controller("ImpalaRecipeController", function($scope, DataikuAPI,ActivityIndicator, $q, WT1, $stateParams, RecipeRunJobService, RecipesUtils, Fn, CreateModalFromTemplate, $state, Dialogs, MonoFuture, CodeBasedEditorUtils, CodeBasedValidationUtils, ComputableSchemaRecipeSave, SQLRecipeHelperService, $timeout, CodeMirrorSettingService) {
    $scope.enableAutoFixup();

    $scope.identifierQuote = '`';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-hivesql', $scope, true);
    $scope.editorOptions.extraKeys[CodeMirrorSettingService.getShortcuts()['AUTOCOMPLETE_SHORTCUT']] = function(cm) {
        $scope.recipeWT1Event("impala-script-autocomplete");
        SQLRecipeHelperService.handleAutocompleteRequest($scope, cm, "impala-recipe")
    };

     $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            $scope.cm.replaceSelection(' ${'+variableName+'} ', "end");
        });
        $scope.cm.focus();
    }

    $scope.autofillCode = function() {
        //Nothing to do: Impala recipes are prefilled on creation
    };


    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;

            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            $scope.recipeWT1Event("impala-validate", {
                ok : !valResult.topLevelMessages.error,
                firstError : (valResult.topLevelMessages.messages.length ? valResult.topLevelMessages.messages[0].message : null)
            });

            return ComputableSchemaRecipeSave.handleSchemaUpdateWithPrecomputed($scope, valResult.schemaResult).then(function(changeResult){
                if (changeResult.changed) {
                    // Validate again
                    return $scope.validateRecipe();
                } else {
                    return valResult;
                }
            });
        });
    };

    $scope.hooks.preRunValidate = $scope.validateRecipe;

    $scope.showExecutionPlan = function() {
        $scope.hooks.resetScope();

        MonoFuture($scope).wrap(DataikuAPI.flow.recipes.impala.getExecutionPlan)($stateParams.projectKey,
                $scope.hooks.getRecipeSerialized(),
                $scope.script.data,
                RecipeRunJobService.getTargetPartition($scope)).success(function(data) {
                    $scope.future = null;
                    $scope.valCtx.validationResult = data.result.validationResult;
                    if (!data.result.validationResult.topLevelMessages.error) {
                        CreateModalFromTemplate("/templates/recipes/fragments/sql-modal.html", $scope, null, function(newScope){
                            newScope.executionPlan = data.result.executionPlan;
                            newScope.query = data.result.executionPlan.query;
                            newScope.uiState = {currentTab: 'plan'};
                            newScope.engine = 'IMPALA';
                            newScope.isAlreadyRecipe = true;
                        });
                    }
        }).update(function(data) {
            $scope.future = data;
        }).error(function(data) {
            $scope.future = null;
            if ( data.aborted ) {
                $scope.valCtx = {validationResult : {topLevelMessages : { messages : [{severity: "error", line: -1, message: "Query aborted"}]}}}
            } else {
                $scope.valCtx = {validationResult : {topLevelMessages : { messages : [{severity: "error", line: -1, message: "Query failed unexpectedly"}]}}}
            }
        });
    };

    $scope.run = function() {
        $scope.hooks.resetScope();

        MonoFuture($scope).wrap(DataikuAPI.flow.recipes.impala.run)($stateParams.projectKey,
                $scope.hooks.getRecipeSerialized(),
                $scope.script.data, RecipeRunJobService.getTargetPartition($scope)).success(function(data) {
                    $scope.future = null;
                    $scope.valCtx.validationResult = data.result;
                    $scope.recipeWT1Event("impala-query-run", {
                        ok : !data.result.topLevelMessages.error,
                        runOK : (data.result.runResult && data.result.runResult.success),
                        runRows : (data.result.runResult ? data.result.runResult.totalRows : -1)
                    });
                    if (data.result && data.result.runResult && data.result.runResult.success && data.result.runResult.rows){
                       CreateModalFromTemplate("/templates/recipes/sql/rows-preview-modal.html", $scope);
                    }
        }).update(function(data) {
            $scope.future = data;
        }).error(function(data) {
            $scope.future = null;
            if ( data.aborted ) {
                $scope.valCtx = {validationResult : {genericCheckResult : { errors : [{severity: "error", line: -1, message: "Query aborted"}]}}}
            } else {
                $scope.valCtx = {validationResult : {genericCheckResult : { errors : [{severity: "error", line: -1, message: "Query failed unexpectedly"}]}}}
            }
        });
    };

    $scope.$watch("[ recipe.inputs, recipe.outputs]", function(nv, ov) {
        DataikuAPI.flow.recipes.impala.checkFullSqlAvailability($stateParams.projectKey,
                $scope.hooks.getRecipeSerialized()).success(function(data) {
                $scope.fullSqlAvailability = data;
            }).error(setErrorInScope.bind($scope));
    }, true);

    $scope.visitUnsynchonizedDataset = function() {
        var name = $scope.valCtx.validationResult.runResult.datasetInNeedOfSynchronization;
        if ( name != null ) {
            $state.go('projects.project.datasets.dataset.settings', {projectKey : $stateParams.projectKey, datasetName : name});
        }
    };
    $scope.resynchronizeMetastore = function() {
        var name = $scope.valCtx.validationResult.runResult.datasetInNeedOfSynchronization;
        if ( name != null ) {
            Dialogs.confirmPositive($scope,
                'Hive metastore resynchronization',
                'Are you sure you want to resynchronize ' + name + ' to the Hive metastore?')
            .then(function() {
                    ActivityIndicator.waiting('Synchronizing Hive metastore...');
                    const datasets = [{
                        type: 'DATASET',
                        projectKey: $stateParams.projectKey,
                        id: name
                    }];
                    DataikuAPI.datasets.synchronizeHiveMetastore(datasets).success(function(data,status,headers){
                        $scope.valCtx.validationResult = null;
                        ActivityIndicator.success('Hive metastore successfully synchronized');
                    }).error(function(data, status, headers) {
                        ActivityIndicator.hide();
                        setErrorInScope.call($scope,data,status,headers);
                    });
            });
        }
    };

});

app.controller("PigRecipeController", function($scope, DataikuAPI, ActivityIndicator, $q, WT1, TopNav, $stateParams, RecipesUtils, Fn, RecipeRunJobService, $timeout, CodeBasedEditorUtils, CodeBasedValidationUtils, ComputableSchemaRecipeSave, CodeMirrorSettingService) {
    $scope.enableAutoFixup();

    // Editor
    $scope.identifierQuote = ''; // explicitly don't quote
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-dkupig', $scope, true);
    $scope.editorOptions.extraKeys[CodeMirrorSettingService.getShortcuts()['AUTOCOMPLETE_SHORTCUT']] = function(cm) {
        $scope.recipeWT1Event("pig-autocomplete");
        CodeMirror.showHint(cm, function(editor){
            var inputs = RecipesUtils.getFlatInputsList($scope.recipe).map(Fn.prop("ref"));
            var outputs= RecipesUtils.getFlatOutputsList($scope.recipe).map(Fn.prop("ref"));

            var relations = $scope.valCtx.validationResult;
            if(relations) {
                relations = relations.relationSchemas;
            }
            return CodeMirror.pigHintWithContext(editor,{inputs:inputs, outputs:outputs,relations:relations});
        }, {completeSingle:false});
    };

    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            $scope.cm.replaceSelection(' ${'+variableName+'} ', "end");
        });
        $scope.cm.focus();
    }

    $scope.validateRecipe = function() {
        // we store the state of the tree
        if($scope.valCtx.validationResult && $scope.valCtx.validationResult.relationSchemas) {
            populateOpenList('',$scope.valCtx.validationResult.relationSchemas);
        }
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);

            if (valResult.relationSchemas) {
                // restore the state of the tree
                restoreOpenState('',$scope.valCtx.validationResult.relationSchemas);
            }

            $scope.recipeWT1Event("pig-query-validate", { ok : !valResult.topLevelMessages.error});

            return ComputableSchemaRecipeSave.handleSchemaUpdateWithPrecomputed($scope, valResult.schemaResult).then(function(changeResult){
                if (changeResult.changed) {
                    // Validate again
                    return $scope.validateRecipe();
                } else {
                    return valResult;
                }
            });
        });
    };

    $scope.hooks.preRunValidate = $scope.validateRecipe;

    $scope.widgets = [];

    var openList = [];
    var openListSeparator = '!#|~';

    function populateOpenList(path,oldResponse) {
        if(oldResponse) {
            for(var k in oldResponse) {
                var field = oldResponse[k];
                var npath = path+openListSeparator+field.name;
                if(field.fields) {
                    populateOpenList(npath, field.fields);
                }
                if(field.show) {
                    // add to open list
                    openList.push(npath);
                } else {
                    // remove from open list
                    var idx = openList.indexOf(npath);
                    if(idx!=-1) {
                        openList.splice(idx,1);
                    }
                }
            }
        }
        // deduplicate
        openList.filter(function(elm,idx){return openList.indexOf(elm)==idx;});
    }

    function restoreOpenState(path, newResponse) {
        if(newResponse) {
            for(var k in newResponse) {
                var field = newResponse[k];
                if(field.name) {
                    var npath = path+openListSeparator+field.name;
                    if(openList.indexOf(npath)!=-1) {
                        field.show=true;
                        restoreOpenState(npath,field.fields);
                    }
                }
            }
        }
    }

    $scope.autofillCode = function() {
        $scope.script.data = "";

        var inputDatasets = RecipesUtils.getInputsForRole($scope.recipe, "main");
        if (inputDatasets.length > 0) {
            $scope.script.data += "-- Read input datasets\n";
            for (var i=0; i<inputDatasets.length; i++) {
                var dataset = inputDatasets[i].ref;
                $scope.script.data += "relation_" + cleanupVariable(dataset) + " = DKULOAD '"+ dataset +"';\n";
            }
        }

        $scope.script.data += "\n";
        $scope.script.data += "-- Applicative code\n\n";

        var outputDatasets = RecipesUtils.getOutputsForRole($scope.recipe, "main");
        if (outputDatasets.length > 0) {
            $scope.script.data += "-- Store output datasets\n";
            for (var i=0; i<outputDatasets.length; i++) {
                var dataset = outputDatasets[i].ref;
                $scope.script.data +="DKUSTORE relation_" +cleanupVariable(dataset) + " INTO '" + dataset+"';\n";
            }
        }
    };

});

})();