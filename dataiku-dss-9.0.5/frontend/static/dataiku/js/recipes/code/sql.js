(function() {
'use strict';

const app = angular.module('dataiku.recipes');


app.factory("SQLRecipeHelperService", function(RecipesUtils, Fn, DKUSQLFormatter){
    var svc = {
        buildSQLDatasetsList : function($scope) {
            var sqlDatasets = [];
            if ( $scope.computablesMap == null ) {
                return sqlDatasets;
            }
            var found = null;
            if ($scope.recipe.inputs && $scope.recipe.inputs['main'] && $scope.recipe.inputs['main'].items) {
                $scope.recipe.inputs['main'].items.forEach(function(input) {
                    if (input.ref == $scope.recipe.params.mainConnectionDataset) {
                        found = input;
                    }
                    if ( $scope.computablesMap[input.ref].dataset != null) {
                        sqlDatasets.push(input);
                    }
                });
            }
            if ($scope.recipe.outputs && $scope.recipe.outputs['main'] && $scope.recipe.outputs['main'].items) {
                $scope.recipe.outputs['main'].items.forEach(function(output) {
                    if (output.ref == $scope.recipe.params.mainConnectionDataset) {
                        found = output;
                    }
                    if ($scope.computablesMap[output.ref].dataset != null) {
                        sqlDatasets.push(output);
                    }
                });
            }

            if (found == null) {
                // dataset used to give the main connection has been removed, clear it
                delete $scope.recipe.params.mainConnectionDataset;
            }
            return sqlDatasets;
        },
        maintainSQLDatasetList: function($scope) {
            $scope.sqlDatasets = [];
            var onRecipeIoOrComputableChange = function() {
                $scope.sqlDatasets = svc.buildSQLDatasetsList($scope);
            };
            $scope.$on('computablesMapChanged', onRecipeIoOrComputableChange);
            $scope.$watch("[recipe.inputs, recipe.outputs]", onRecipeIoOrComputableChange, true);
        },

        handleAutocompleteRequest: function($scope, cm, type) {
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
                    return CodeMirror.sqlNotebookHint(cm, type, relevantDatasetRefs,sqlFields);
                }, {completeSingle:false});
            });
        },
        sqlFormat: function($scope){
            var codeMirrors = $(".editor .CodeMirror");
            var cm = codeMirrors[0].CodeMirror;
            cm.setValue(DKUSQLFormatter.format(cm.getValue(), cm.getOption("indentUnit")));
        }
    }
    return svc;
});

app.factory('DKUSQLFormatter', function(){
    function escapeDkuExpansions(code) {
        const replacementMap = {};
        var cnt = 0;
        var escapedCode = code.replace(/\$\{[^}]*\}/g, (match) => {
            const token = "dku__var__" + (cnt++) + "__ukd";
            replacementMap[token] = match;
            return token;
        });
        return [escapedCode, replacementMap];
    }

    function unescapeDkuExpansions(code, map) {
        const tokens = Object.keys(map);
        if(tokens.length == 0) return code;
        const pattern = new RegExp(tokens.join('|'), 'g');
        return code.replace(pattern, (token)=> map[token]);
    }
    
    return {
        format: function(sql, indent) {
            // Dataiku's variable expansions are not standard SQL and the
            // library 'sql-formatter' doesn't deal with them nicely.
            //
            // This issue can be alleviated by temporarily replacing all
            // expansions by SQL-friendly tokens.
            const [escapedSql, replacementMap] = escapeDkuExpansions(sql);
            const formattedEscapedSql = sqlFormatter.format(escapedSql, {indent: Array(indent + 1).join(' ')});
            return unescapeDkuExpansions(formattedEscapedSql, replacementMap);
        }
    };
});

app.controller("SQLScriptRecipeController", function($scope, CodeBasedEditorUtils, CodeBasedValidationUtils, CodeBasedToPluginConverter, DataikuAPI, $q, WT1, $stateParams, RecipeRunJobService, RecipesUtils, Fn, $timeout, SQLRecipeHelperService, CodeMirrorSettingService) {
    $scope.enableAutoFixup();

    // Editor settings
    $scope.identifierQuote = null; // guess quoting style from dataset input type
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-sql2', $scope);
    $scope.editorOptions.extraKeys[CodeMirrorSettingService.getShortcuts()['AUTOCOMPLETE_SHORTCUT']] = function(cm) {
        $scope.recipeWT1Event("sql-script-autocomplete");
        SQLRecipeHelperService.handleAutocompleteRequest($scope, cm, "sql-recipe");
    };

    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            $scope.cm.replaceSelection(' ${'+variableName+'} ', "end");
        });
        $scope.cm.focus();
    }

    // Autofill: none in SQL script
    if ($scope.script.data == null) $scope.script.data = " ";

    // Maintenance of the list of SQL datasets for selecting connection
    $scope.getInputOrOuputLabel = function(ref) {
        if ( ref == null || ref.length == 0 ) {
            return '';
        }
        if ( $scope.computablesMap == null ) {
            return '';
        }
        var computable = $scope.computablesMap[ref];
        return computable.label;
    };
    SQLRecipeHelperService.maintainSQLDatasetList($scope);

    $scope.sqlFormat = SQLRecipeHelperService.sqlFormat.bind(this, $scope);

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            $scope.recipeWT1Event("sql-script-validate", { ok : !valResult.topLevelMessages.error});
            return valResult;
        });
    };
    $scope.hooks.preRunValidate = $scope.validateRecipe;
});

app.factory("HoverIntent", function(){
    var svc = {
        create: function(cb) {
            return {
                cb : cb
            }
        },
        move: function(hi, evt, triggerTag) {
            if (hi.triggerTag == triggerTag) {
                // Still over the same trigger
                return;
            } else if (hi.timeout) {
                // We moved away
                clearTimeout(hi.timeout);
            }
            hi.timeout = setTimeout(function(){
                hi.cb(hi.origEvent, hi.triggerTag);
            }, 500);
            hi.triggerTag = triggerTag;
            hi.origEvent = evt;
        },
        clear : function(hi) {
            clearTimeout(hi.timeout);
        }

    }
    return svc;
})


app.controller("SQLQueryRecipeController", function($rootScope, $scope, CodeBasedEditorUtils, CodeBasedValidationUtils, CodeBasedToPluginConverter, DataikuAPI, $q, WT1, $stateParams, CreateModalFromTemplate, RecipeRunJobService, RecipesUtils, Fn, MonoFuture, $timeout, ComputableSchemaRecipeSave, SQLRecipeHelperService, CodeMirrorSettingService){
    $scope.enableAutoFixup();

    // Editor settings
    $scope.identifierQuote = null; // guess quoting style from dataset input type
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-sql2', $scope);
    $scope.editorOptions.extraKeys[CodeMirrorSettingService.getShortcuts()['AUTOCOMPLETE_SHORTCUT']] = function(cm) {
        $scope.recipeWT1Event("sql-script-autocomplete");
        SQLRecipeHelperService.handleAutocompleteRequest($scope, cm, "sql-recipe");
    }

    $scope.anyPipelineTypeEnabled = function() {
        return $rootScope.projectSummary.sqlPipelinesEnabled;
    };

    // var hi = HoverIntent.create(function(origEvent, triggerTag){
    //     //console.info("HI on ", triggerTag);

    //     if (popup) popup.remove();

    //     popup = $("<div style='position: absolute; background: white;padding: 3px; display: none; border: 1px #ddd solid; box-shadow: 2px 2px rgba(0,0,0,0.3)'/>")

    //     if (triggerTag.type == 'variable-2' && triggerTag.string.indexOf("${") == 0) {
    //         var variableName = triggerTag.string.replace("${", "").replace("}", "")
    //         if ($scope.valCtx.validationResult && $scope.valCtx.validationResult.substitutionVariables) {
    //             var variableValue =$scope.valCtx.validationResult.substitutionVariables[variableName];
    //             if (variableValue) {
    //                 popup.html($("<span>" +variableName + " =  "+ variableValue.value + "</span>"));
    //                 popup.show();
    //                 popup.css("left", origEvent.clientX);
    //                 popup.css("top", origEvent.clientY);
    //                 $("body").append(popup);
    //             }
    //         }
    //     }
    // });
    // var popup = null;

    // $scope.$watch("cm", function(nv, ov){
    //     if (!nv) return;
    //     CodeMirror.on($scope.cm.getWrapperElement(), "mousemove", function(evt){
    //         var pos = $scope.cm.coordsChar({ left: evt.clientX, top: evt.clientY });
    //         var token = $scope.cm.getTokenAt(pos);
    //         HoverIntent.move(hi, evt, token);
    //     });
    //     CodeMirror.on($scope.cm.getWrapperElement(), "mouseout", function(){
    //         HoverIntent.clear(hi);
    //     })
    // });

    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            $scope.cm.replaceSelection(' ${'+variableName+'} ', "end");
        });
        $scope.cm.focus();
    }

    //Nothing to do: SQL query recipes are prefilled on creation
    $scope.autofillCode = function() {
    };

    // Maintenance of the list of SQL datasets for selecting connection
    $scope.getInputOrOuputLabel = function(ref) {
        if ( ref == null || ref.length == 0 ) {
            return '';
        }
        if ( $scope.computablesMap == null ) {
            return '';
        }
        var computable = $scope.computablesMap[ref];
        return computable.label;
    };
    SQLRecipeHelperService.maintainSQLDatasetList($scope);

    $scope.sqlFormat = SQLRecipeHelperService.sqlFormat.bind(this, $scope);

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);

            $scope.recipeWT1Event("sql-query-validate", { ok : !valResult.topLevelMessages.error});

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

        DataikuAPI.flow.recipes.sqlQuery.getExecutionPlan($stateParams.projectKey,
            $scope.hooks.getRecipeSerialized(),
            $scope.script.data,
            RecipeRunJobService.getTargetPartition($scope)).success(function(data) {
                $scope.valCtx.validationResult = data.validationResult;
                if (!data.validationResult.topLevelMessages.error) {
                    CreateModalFromTemplate("/templates/recipes/fragments/sql-modal.html", $scope, null, function(newScope) {
                        newScope.executionPlan = data.executionPlan;
                        if (data.executionPlan) {
                            newScope.query = data.executionPlan.query;
                        } else {
                            newScope.failedToComputeExecutionPlan = true; //TODO @recipes, report source error
                        }
                        newScope.uiState = {currentTab: 'plan'};
                        newScope.engine = 'SQL';
                        newScope.isAlreadyRecipe = true;
                    });
                }
        }).error(setErrorInScope.bind($scope));
    };

    $scope.showExpandedQuery = function(query) {
        CreateModalFromTemplate("/templates/recipes/fragments/sql-modal.html", $scope, null, function(newScope){
            newScope.query = query;
            newScope.uiState = {currentTab: 'query'};
            newScope.engine = 'SQL';
            newScope.isAlreadyRecipe = true;
        });
    };

    $scope.run = function() {
        $scope.hooks.resetScope();

        MonoFuture($scope).wrap(DataikuAPI.flow.recipes.sqlQuery.run)($stateParams.projectKey,
                $scope.hooks.getRecipeSerialized(),
                $scope.script.data, RecipeRunJobService.getTargetPartition($scope)).success(function(data) {
                    $scope.future = null;
                    //console.info(data.result);
                    $scope.valCtx.validationResult = data.result;
                    $scope.recipeWT1Event("sql-query-run", {
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
                $scope.valCtx = {validationResult : {topLevelMessages : { messages : [{severity: "error", line: -1, message: "Query aborted"}]}}}
            } else {
                $scope.valCtx = {validationResult : {topLevelMessages : { messages : [{severity: "error", line: -1, message: "Query failed unexpectedly"}]}}}
            }
        });
    };
});

})();
