(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("TopNRecipeCreationController", function($scope, $controller) {
        $scope.recipeType = "topn";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_topn");
            }
        };
    });


    app.controller("TopNRecipeController", function ($scope, $q, $controller, DKUtils, RecipesUtils, Logger, DatasetUtils, $stateParams) {
        var visualCtrl = $controller('VisualRecipeEditorController', {$scope: $scope}); //Controller inheritance
        this.visualCtrl = visualCtrl;

        /******  order columns *****/
        $scope.addOrderColumn = function(col) {
            var orderList = $scope.uiState.columnStatus
                                .filter(function(c){return c.status=='S'})
                                .map(function(c){return c.order || 0;});
            var nextOrder = orderList.length ? Math.max.apply(null, orderList) + 1 : 0;
            col.status = 'S';
            col.order = nextOrder;
        };
        $scope.removeOrderColumn = function(col) {
            var colOrder = col.order;
            col.status = 'X';
            $scope.uiState.columnStatus.forEach(function(c) {
                if (c.status == 'S' && (c.order || 0) >= colOrder) {
                    c.order = Math.max((c.order || 0) - 1, 0);
                }
            });
        };

        /******  retrieved column selection *****/
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
            }
        }

        $scope.removeAllRetrievedColumns = function() {
            if (!$scope.uiState.columnStatus) {
                return;
            }
            $scope.uiState.columnStatus.forEach(assignIgnoreSelected(true, false));
        };
        $scope.addAllRetrievedColumns = function() {
            if (!$scope.uiState.columnStatus) {
                return;
            }
            $scope.uiState.columnStatus.forEach(assignIgnoreSelected(false, false));
        };
        $scope.removeRetrievedColumns = function(col) {
            if (col) {
                assignIgnoreSelected(true, false)(col);
            } else if ($scope.uiState.columnStatus) {
                $scope.uiState.columnStatus
                    .filter(function(col){
                        return !col.ignore && col.$selected;
                    }).forEach(assignIgnoreSelected(true, false));
            }
        };
        $scope.addRetrievedColumns = function(col) {
            if (col) {
                assignIgnoreSelected(false, false)(col);
            } else if ($scope.uiState.columnStatus) {
                $scope.uiState.columnStatus
                    .filter(function(col) {
                        return col.ignore && col.$selected;
                    }).forEach(assignIgnoreSelected(false, false));
            }
        };

        /******  recipe related *****/
        $scope.hooks.getPayloadData = function () {
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
        }

        function validateFilter(filterDesc, schema) {
            if (!filterDesc || !filterDesc.enabled) {
                return;
            }
            if (angular.isUndefined(filterDesc.expression)) {
                return;
            }
            var deferred = $q.defer();
            Expressions.validateExpression(filterDesc.expression, schema)
                .success(function(data) {
                    if (data.ok && $scope.mustRunInDatabase && !data.fullyTranslated) {
                        data.ok = false;
                    }
                    filterDesc.$status = data;
                    filterDesc.$status.validated = true;
                    deferred.resolve(data);
                })
                .error(function() {
                    setErrorInScope.bind($scope);
                    deferred.reject('Error while validating filter');
                });
            return deferred.promise;
        }

        /* callback given to the filter module */
        $scope.onFilterUpdate = $scope.updateRecipeStatusLater;

        /****** computed columns ********/
        function computedColumnListUpdated(computedColumns) {
            $scope.params.computedColumns = angular.copy(computedColumns);
            $scope.updateRecipeStatusLater();
        }

        /* callback given to the computed columns module */
        $scope.onComputedColumnListUpdate = computedColumnListUpdated;

        function loadParamsFromScript(scriptData) {
            if (!scriptData) {
                return;
            }
            $scope.params = JSON.parse(scriptData);
            $scope.params.keys = $scope.params.keys || [];
            $scope.params.orders = $scope.params.orders || [];
            $scope.params.preFilter = $scope.params.preFilter || {};
            $scope.params.computedColumns = $scope.params.computedColumns || [];
            $scope.params.outputColumnNameOverrides = $scope.params.outputColumnNameOverrides || {};
            $scope.params.retrievedColumns = $scope.params.retrievedColumns || [];

            var i;
            $scope.uiState.columnStatus = angular.copy($scope.getColumns());
            var columnStatusNames = $scope.uiState.columnStatus.map(function(col){return col.name});
            var addedComputedColumns = [];
            for (i = 0; i < $scope.params.computedColumns.length; i++) {
                var computedCol = $scope.params.computedColumns[i];
                // the computed column name must be valid and should not exists in
                // the input schema or if it was already added as a computed column
                if (computedCol.name
                    && computedCol.name.length > 0
                    && columnStatusNames.indexOf(computedCol.name) == -1
                    && addedComputedColumns.indexOf(computedCol.name) == -1) {
                    addedComputedColumns.push(computedCol.name);
                    $scope.uiState.columnStatus.push({
                        name: computedCol.name,
                        type: computedCol.type
                    });
                }
            }
            $scope.uiState.retrieveAllColumns = $scope.params.retrievedColumns.length == 0 || $scope.params.retrievedColumns.length == $scope.uiState.columnStatus.length;
            $scope.uiState.columnStatus.forEach(function(col) {
                col.ignore = !$scope.uiState.retrieveAllColumns && $scope.params.retrievedColumns.indexOf(col.name) == -1;
                col.status = 'X';
            });
            // refresh the column status names (because some computed columns could have been added since last computation)
            columnStatusNames = ($scope.uiState.columnStatus || []).map(function(col){return col.name});
            var orderIdx = 0;
            for (i = 0; i < $scope.params.orders.length; i++) {
                var order = $scope.params.orders[i];
                var csnIdx = columnStatusNames.indexOf(order.column);
                if (csnIdx >= 0) {
                    $scope.uiState.columnStatus[csnIdx].status = 'S';
                    $scope.uiState.columnStatus[csnIdx].desc = !!order.desc;
                    $scope.uiState.columnStatus[csnIdx].order = orderIdx++;
                }
            }
            var hasGroupKey = false;
            $scope.params.keys.forEach(function(column) {
                var csnIdx = columnStatusNames.indexOf(column);
                if (csnIdx >= 0) {
                    hasGroupKey = true;
                    $scope.uiState.columnStatus[csnIdx].status = 'G';
                }
            });

            $scope.uiState.computedColumns = angular.copy($scope.params.computedColumns);
            $scope.uiState.fromSelection = hasGroupKey ? 'GROUPS' : 'WHOLE';

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
            var oldColumnStatusNames = ($scope.uiState.columnStatus || []).map(function(col){return col.name});
            inputColumns.forEach(function(col) {
                var oldCSNIdx = oldColumnStatusNames.indexOf(col.name);
                if (oldCSNIdx >= 0) {
                    newColumnStatus.push(angular.extend($scope.uiState.columnStatus[oldCSNIdx], col));
                } else {
                    newColumnStatus.push(angular.extend(col, { status: 'X' }));
                }
            });
            var inputColumnNames = newColumnStatus.map(function(col){return col.name});
            var addedComputedColumns = [];
            if ($scope.params && $scope.params.computedColumns) {
                for (var i = 0; i < $scope.params.computedColumns.length; i++) {
                    var cc = $scope.params.computedColumns[i];
                    if (cc.name
                        && cc.name.length > 0
                        && inputColumnNames.indexOf(cc.name) == -1
                        && addedComputedColumns.indexOf(cc.name) == -1) {
                        addedComputedColumns.push(cc.name);
                        var col = {
                            name: cc.name,
                            type: cc.type
                        };
                        var oldCSNIdx = oldColumnStatusNames.indexOf(cc.name);
                        if (oldCSNIdx >= 0) {
                            newColumnStatus.push(angular.extend($scope.uiState.columnStatus[oldCSNIdx], col));
                        } else {
                            newColumnStatus.push(angular.extend(col, { status: 'X' }));
                        }
                    }
                }
            }
            $scope.uiState.columnStatus = newColumnStatus;
        }


        function onColumnStatusChanged() {
            if (!$scope.params) {
                return;
            }
            $scope.params.keys = ($scope.uiState.columnStatus || [])
                                                .filter(function(col){return col.status=='G'})
                                                .map(function(col){return col.name});
            $scope.params.orders = ($scope.uiState.columnStatus || [])
                                                .filter(function(col){return col.status=='S'})
                                                .sort(function(col1,col2){return col1.order-col2.order})
                                                .map(function(col){return {column: col.name, desc: !!col.desc}});
            $scope.params.retrievedColumns = ($scope.uiState.columnStatus || [])
                                                .filter(function(col){return $scope.uiState.retrieveAllColumns || !col.ignore})
                                                .map(function(col){return col.name});
            $scope.uiState.orderList = ($scope.uiState.columnStatus || [])
                                                .filter(function(col){return col.status=='S'})
                                                .sort(function(col1,col2){return col1.order-col2.order});
            $scope.updateRecipeStatusLater();
        }

        function onRetrieveAllColumnsChanged(nv) {
            if (nv) {
                $scope.addAllRetrievedColumns();
            }
            onColumnStatusChanged();
        }

        function onFromSelectionChanged(nv) {
            if (nv) {
                if (nv == 'WHOLE') {
                    ($scope.uiState.columnStatus || []).forEach(function(col){
                        if (col.status == 'G') {
                            col.status = 'X';
                        }
                    });
                }
            }
            onColumnStatusChanged();
        }

        function onOrderListChanged(nv) {
            if (nv) {
                var orders = {};
                ($scope.uiState.orderList || []).forEach(function(col,idx){orders[col.name]=idx});
                ($scope.uiState.columnStatus || []).forEach(function(col){col.order=orders[col.name]});
            }
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
            currentStep: 'topn',
            outputColumnNamesOverridable: true,
            retrieveAllColumns: true,
            computedColumns: [],
            fromSelection: 'WHOLE',
        };

        $scope.getFullStatus = function(status) {
            switch (status) {
                case 'G': return 'Group';
                case 'S': return 'Sort';
                default: return '';
            }
        };

        $scope.getDsOrGrpLabel = function() {
            return $scope.uiState.columnStatus.filter(function(col){return col.status=='G'}).length == 0 ? 'the whole dataset' : 'its group';
        };

        $scope.hooks.onRecipeLoaded = function(){
            Logger.info("On Recipe Loaded");
            validateFilters();
            $scope.$watch("script.data", onScriptChanged, true);  // this will call onScriptChanged and $scope.hooks.updateRecipeStatus when ready
        };

        $scope.enableAutoFixup();
        $scope.specificControllerLoadedDeferred.resolve();
        $scope.$watchCollection("recipe.inputs.main.items", function() {
            DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, $stateParams.projectKey)
                .then(_ => resyncWithInputSchema());
        });
        $scope.$watch("uiState.columnStatus", onColumnStatusChanged, true);
        $scope.$watch("uiState.orderList", onOrderListChanged, true);
        $scope.$watch("uiState.retrieveAllColumns", onRetrieveAllColumnsChanged, true);
        $scope.$watch("uiState.fromSelection", onFromSelectionChanged);
        $scope.$watch("params.computedColumns", resyncWithInputSchema, true);
        $scope.$watch("params", $scope.updateRecipeStatusLater, true);
    });

})();