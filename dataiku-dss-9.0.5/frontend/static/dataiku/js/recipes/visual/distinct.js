(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("DistinctRecipeCreationController", function($scope, $controller) {
        $scope.recipeType = "distinct";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_distinct");
            }
        };
    });


    app.controller("DistinctRecipeController", function($scope, $stateParams, DataikuAPI, $q, Dialogs, ContextualMenu, PartitionDeps, $rootScope,
     $timeout, DKUtils, Expressions, Logger, $controller, DatasetUtils, RecipesUtils) {
        var visualCtrl = $controller('VisualRecipeEditorController', {$scope: $scope}); //Controller inheritance
        this.visualCtrl = visualCtrl;

        let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey:$stateParams.projectKey;
        /****** distinct column selection *****/
        $scope.selectLine = function(event, col, ignore) {
            event.preventDefault();
            var hasLastSelection = $scope.uiState.columnStatus.filter(function(c) {
                return c.ignore == ignore && !!c.$lastSelection;
            }).length > 0 ;
            if (event.shiftKey && hasLastSelection) {
                var selecting = false;
                for (var i = 0; i < $scope.uiState.columnStatus.length; i++) {
                    var c = $scope.uiState.columnStatus[i];
                    if (c.ignore != ignore) {
                        continue;
                    }
                    var bound = !!c.$lastSelection || c.name === col.name;
                    var firstBound = !selecting && bound;
                    var lastBound = !!selecting && bound;
                    if (firstBound) {
                        selecting = true;
                        c.$selected = true;
                    }
                    c.$selected = selecting;
                    if (lastBound) {
                        selecting = false;
                    }
                }
            } else {
                // refresh the last clicked item
                $scope.uiState.columnStatus
                        .filter(function(c) {
                            return c.ignore == ignore;
                        }).forEach(function(c) {
                            c.$lastSelection = c.name === col.name;
                        });
                // handle meta/ctrl click or normal click
                if (event.metaKey || event.ctrlKey) {
                    col.$selected = !col.$selected;
                } else {
                    $scope.uiState.columnStatus
                        .filter(function(c) {
                            return c.ignore == ignore;
                        }).forEach(function(c) {
                            c.$selected = c.name === col.name;
                        });
                }
            }
        };

        function assignIgnoreSelected(ignore, selected) {
            return function(col) {
                col.ignore = ignore;
                col.$selected = selected;
                col.$lastSelection = false;
            };
        }

        $scope.removeAllDistinctColumns = function() {
            if (!$scope.uiState.columnStatus) {
                return;
            }
            $scope.uiState.columnStatus.forEach(assignIgnoreSelected(true, false));
        };
        $scope.addAllDistinctColumns = function() {
            if (!$scope.uiState.columnStatus) {
                return;
            }
            $scope.uiState.columnStatus.forEach(assignIgnoreSelected(false, false));
        };
        $scope.removeDistinctColumns = function(col) {
            if (col) {
                assignIgnoreSelected(true, false)(col);
            } else if ($scope.uiState.columnStatus) {
                $scope.uiState.columnStatus
                    .filter(function(col) {
                        return !col.ignore && col.$selected;
                    }).forEach(assignIgnoreSelected(true, false));
            }
        };
        $scope.addDistinctColumns = function(col) {
            if (col) {
                assignIgnoreSelected(false, false)(col);
            } else if ($scope.uiState.columnStatus) {
                $scope.uiState.columnStatus
                    .filter(function(col) {
                        return col.ignore && col.$selected;
                    }).forEach(assignIgnoreSelected(false, false));
            }
        };

        /****** recipe related ******/
        $scope.hooks.getPayloadData = function() {
            return angular.toJson($scope.params);
        };

        $scope.hooks.updateRecipeStatus = function(forceUpdate, exactPlan) {
            var payload = $scope.hooks.getPayloadData();
            if (!payload) {
                return $q.reject("payload not ready");
            }
            var deferred = $q.defer();
            $scope.updateRecipeStatusBase(forceUpdate, payload, {reallyNeedsExecutionPlan: exactPlan, exactPlan: exactPlan}).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) {
                    return deferred.reject();
                }
                var outputSchema = $scope.recipeStatus.outputSchema;
                var outputSchemaBO = $scope.recipeStatus.outputSchemaBeforeOverride;
                if (outputSchema) {
                    $scope.params.postFilter.$status = $scope.params.postFilter.$status || {};
                    $scope.params.postFilter.$status.schema = outputSchemaBO;
                    // override handling:

                    $scope.params.outputColumnNameOverrides = $scope.params.outputColumnNameOverrides || {};
                    var columnsAO = outputSchema.columns; // after override
                    var columnsBO = (outputSchemaBO && outputSchemaBO.columns) ? outputSchemaBO.columns : columns; // before override

                    for (var i in columnsAO) {
                        if (columnsAO[i].name != columnsBO[i].name) {
                            $scope.params.outputColumnNameOverrides[columnsBO[i].name] = columnsAO[i].name;
                        }
                        columnsAO[i].$beforeOverride = columnsBO[i].name;
                        columnsAO[i].name = $scope.params.outputColumnNameOverrides[columnsBO[i].name] || columnsBO[i].name;
                    }
                }
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        /******  overrides *****/
        $scope.updateColumnNameOverride = function(column) {
            if (column.$beforeOverride != column.name) {
                $scope.params.outputColumnNameOverrides[column.$beforeOverride] = column.name;
            } else {
                delete $scope.params.outputColumnNameOverrides[column.$beforeOverride];
            }
        };

        /******  filters  ******/

        function validateFilters() {
            if (!$scope.params) {
                return;//not ready
            }
            var inputRef = RecipesUtils.getSingleInput($scope.recipe, "main").ref;
            var inputSchema = $scope.computablesMap[inputRef].dataset.schema;
            validateFilter($scope.params.preFilter, inputSchema);
            validateFilter($scope.params.postFilter);
        }

        function validateFilter(filterDesc, schema) {
            var deferred = $q.defer();
            if (!filterDesc.enabled) {
                return;
            }
            if (angular.isUndefined(filterDesc.expression)) {
                return;
            }
            Expressions.validateExpression(filterDesc.expression, schema)
                .success(function(data) {
                    if (data.ok && $scope.mustRunInDatabase && !data.fullyTranslated) {
                        data.ok = false;
                    }
                    filterDesc.$status = data;
                    filterDesc.$status.validated = true;
                    deferred.resolve(data);
                })
                .error(function(data) {
                    setErrorInScope.bind($scope);
                    deferred.reject('Error while validating filter');
                });
            return deferred.promise;
        }

        /* callback given to the filter module */
        $scope.onFilterUpdate = $scope.updateRecipeStatusLater;

        /********  general init  ********/

        function loadParamsFromScript(scriptData) {
            if (!scriptData) {
                return;
            }
            $scope.params = JSON.parse(scriptData);
            $scope.params.keys = $scope.params.keys || [];
            $scope.params.preFilter = $scope.params.preFilter || {};
            $scope.params.postFilter = $scope.params.postFilter || {};
            $scope.params.outputColumnNameOverrides = $scope.params.outputColumnNameOverrides || {};

            $scope.uiState.columnStatus = angular.copy($scope.getColumns());
            $scope.uiState.distinctAllColumns = $scope.params.keys.length == $scope.uiState.columnStatus.length;
            var keyColNames = $scope.params.keys.map(function(k){return k.column});
            $scope.uiState.columnStatus.forEach(function(col) {
                col.ignore = !$scope.uiState.distinctAllColumns && keyColNames.indexOf(col.name) == -1;
            });

            //keep params for dirtyness detection
            visualCtrl.saveServerParams();

            // update recipe according to current schema
            resyncWithInputSchema();
            onColumnStatusChanged();
        }

        function resyncWithInputSchema() {
            // in case the dataset schema changed since the recipe creation/last edition
            var inputColumns = $scope.getColumns();

            var newColumnStatus = [];
            var oldColumnStatusNames = ($scope.uiState.columnStatus || []).map(function(col){return col.name});
            inputColumns.forEach(function(col) {
                var oldCSNIdx = oldColumnStatusNames.indexOf(col.name);
                if (oldCSNIdx >= 0) {
                    newColumnStatus.push(angular.extend($scope.uiState.columnStatus[oldCSNIdx], col));
                } else {
                    newColumnStatus.push(angular.copy(col));
                }
            });
            $scope.uiState.columnStatus = newColumnStatus;
        }

        function onColumnStatusChanged() {
            if (!$scope.params) {
                return;
            }
            $scope.params.keys = ($scope.uiState.columnStatus || [])
                                    .filter(function(col){return !col.ignore})
                                    .map(function(col){return {column:col.name}});
            $scope.updateRecipeStatusLater();
        }

        function onDistinctAllColumnsChanged(nv) {
            if (nv) {
                $scope.addAllDistinctColumns();
            }
            onColumnStatusChanged();
        }

        function onScriptChanged(nv) {
             if (nv) {
                loadParamsFromScript($scope.script.data);
                DKUtils.reflowNext();
                DKUtils.reflowLater();
                $scope.hooks.updateRecipeStatus();
            }
        }

        // UI:
        $scope.uiState = {
            currentStep: 'group',
            outputColumnNamesOverridable: true,
            distinctAllColumns: true
        };

        $scope.hooks.onRecipeLoaded = function(){
            Logger.info("On Recipe Loaded");
            validateFilters();
            $scope.$watch("script.data", onScriptChanged, true); // this will call $scope.hooks.updateRecipeStatus when ready
        };

        $scope.enableAutoFixup();
        $scope.specificControllerLoadedDeferred.resolve();
        $scope.$watchCollection("recipe.inputs.main.items", function() {
            DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                .then(_ => resyncWithInputSchema());
        });
        $scope.$watch("uiState.columnStatus", onColumnStatusChanged, true);
        $scope.$watch("uiState.distinctAllColumns", onDistinctAllColumnsChanged, true);
    });
})();
