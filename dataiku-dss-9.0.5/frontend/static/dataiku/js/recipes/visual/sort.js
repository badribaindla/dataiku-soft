(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("SortRecipeCreationController", function($scope, $controller) {
        $scope.recipeType = "sort";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_sorted");
            }
        }
    });

    app.controller("SortRecipeController", function($scope, $controller, $q, DKUtils, RecipesUtils, Logger, DatasetUtils, $stateParams) {
        var visualCtrl = $controller('VisualRecipeEditorController', {$scope: $scope}); // Controller inheritance
        this.visualCtrl = visualCtrl;

        let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey : $stateParams.projectKey;
        /******  order columns  ******/
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

        /******. recipe related. ******/
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

        /******. overrides. ******/
        $scope.updateColumnNameOverride = function(column) {
            if (column.$beforeOverride != column.name) {
                $scope.params.outputColumnNameOverrides[column.$beforeOverride] = column.name;
            } else {
                delete $scope.params.outputColumnNameOverrides[column.$beforeOverride];
            }
        }

        /******  filters  ******/
        function validateFilters() {
            if (!$scope.params) {
                return; // not ready
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

        function loadParamsFromScripts(scriptData) {
            if (!scriptData) {
                return;
            }
            $scope.params = JSON.parse(scriptData);
            $scope.params.orders = $scope.params.orders || [];
            $scope.params.preFilter = $scope.params.preFilter || {};
            $scope.params.outputColumnNameOverrides = $scope.params.outputColumnNameOverrides || {};
            $scope.params.computedColumns = $scope.params.computedColumns || [];

            var i;
            $scope.uiState.columnStatus = angular.copy($scope.getColumns());
            var columnStatusNames = ($scope.uiState.columnStatus || []).map(function(col){return col.name});
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
            ($scope.uiState.columnStatus || []).forEach(function(col) {
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

            $scope.uiState.computedColumns = angular.copy($scope.params.computedColumns);

            // keep params for dirtyness detection
            visualCtrl.saveServerParams();

            // update recipe according to current schema
            resyncWithInputSchema();
            onColumnStatusChanged();
        }

        function resyncWithInputSchema() {
            // in cas the dataset schema changed since the recipe creation/last edition
            var inputColumns = $scope.getColumns();

            var newColumnStatus = [];
            var oldColumnStatusNames = ($scope.uiState.columnStatus || []).map(function(col){return col.name});
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
            $scope.params.orders = ($scope.uiState.columnStatus || [])
                                                    .filter(function(col){return col.status=='S'})
                                                    .sort(function(col1,col2){return col1.order-col2.order})
                                                    .map(function(col){return {column: col.name, desc: !!col.desc}});
            $scope.uiState.orderList = ($scope.uiState.columnStatus || [])
                                                    .filter(function(col){return col.status=='S'})
                                                    .sort(function(col1,col2){return col1.order-col2.order});
            $scope.updateRecipeStatusLater();
        }

        function onOrderListChanged(nv) {
            if (nv) {
                var orders = {};
                ($scope.uiState.orderList || []).forEach(function(col,idx){orders[col.name]=idx});
                ($scope.uiState.columnStatus || []).forEach(function(col){col.order=orders[col.name]});
            }
        }

        function onScriptChanged(nv) {
            if (nv) {
                loadParamsFromScripts($scope.script.data);
                DKUtils.reflowNext();
                DKUtils.reflowLater();
                $scope.hooks.updateRecipeStatus();
            }
        }

        /******  UI ******/
        $scope.uiState = {
            currentStep: 'sort',
            outputColumnNamesOverridable: true,
            computedColumns: []
        };

        $scope.hooks.onRecipeLoaded = function() {
            Logger.info("On Recipe Loaded");
            validateFilters();
            $scope.$watch("script.data", onScriptChanged, true);  // this will call $scope.hooks.updateRecipeStatus when ready
        };

        $scope.showOrderPreservationMessage = function(messages) {
            if (!messages) return; //not ready
            return messages.filter(msg => msg.code == 'SORT_OUTPUT_DS_ORDER_NOT_SUPPORTED').length;
        };

        $scope.enableAutoFixup();
        $scope.specificControllerLoadedDeferred.resolve();
        $scope.$watchCollection("recipe.inputs.main.items", function() {
            DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                .then(_ => resyncWithInputSchema());
        });
        $scope.$watch("uiState.columnStatus", onColumnStatusChanged, true);
        $scope.$watch("uiState.orderList", onOrderListChanged, true);
        $scope.$watch("params.computedColumns", resyncWithInputSchema, true);
        $scope.$watch("params", $scope.updateRecipeStatusLater, true);
    });

})();