(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("GroupingRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $controller) {
        $scope.recipeType = "grouping";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset && $scope.io.targetVariable) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                var niceTargetVariable = $scope.io.targetVariable.replace(/[^\w ]+/g,"").replace(/ +/g,"_");
                $scope.maybeSetNewDatasetName(niceInputName + "_by_" + niceTargetVariable);
            }
        };

        $scope.getCreationSettings = function () {
            return {groupKey: $scope.io.targetVariable};
        };

        var superFormIsValid = $scope.formIsValid;
        $scope.formIsValid = function() {
            return !!(superFormIsValid() && $scope.io.targetVariable !== undefined);
        };
        $scope.showOutputPane = function() {
            return !!($scope.io.inputDataset && $scope.io.targetVariable !== undefined);
        };

        $scope.$watch("io.targetVariable", Fn.doIfNv($scope.autosetName));
    });


    app.controller("GroupingRecipeController", function($scope, $stateParams, DataikuAPI, $q, Dialogs, ContextualMenu, PartitionDeps, $rootScope,
     $timeout, DKUtils, Expressions, Logger, $controller,  RecipesUtils, Fn, DatasetUtils) {
        var visualCtrl = $controller('VisualRecipeEditorController', {$scope: $scope}); //Controller inheritance
        this.visualCtrl = visualCtrl;
        $scope.aggregateUsabilityFlag = "usableInGroup";
        let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey:$stateParams.projectKey;

        $scope.hooks.getPayloadData = function () {
            return angular.toJson($scope.params);
        };

        $scope.hooks.updateRecipeStatus = function(forceUpdate, exactPlan) {
            var payload = $scope.hooks.getPayloadData();
            if (!payload) return $q.reject("payload not ready");
            var deferred = $q.defer();
            $scope.updateRecipeStatusBase(forceUpdate, payload, {reallyNeedsExecutionPlan: exactPlan, exactPlan: exactPlan}).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) return deferred.reject();
                var outputSchema = $scope.recipeStatus.outputSchema;
                var outputSchemaBO = $scope.recipeStatus.outputSchemaBeforeOverride;
                if (outputSchema) {
                    $scope.params.postFilter.$status = $scope.params.postFilter.$status || {};
                    $scope.params.postFilter.$status.schema = outputSchemaBO;
                    // override handling:

                    $scope.params.outputColumnNameOverrides = $scope.params.outputColumnNameOverrides || {};
                    var columnsAO = outputSchema.columns; // after override
                    var columnsBO = (outputSchemaBO&&outputSchemaBO.columns) ? outputSchemaBO.columns : columns; // before override

                    for (var i in columnsAO) {
                        if (columnsAO[i].name != columnsBO[i].name) {$scope.params.outputColumnNameOverrides[columnsBO[i].name] = columnsAO[i].name;}
                        columnsAO[i].$beforeOverride = columnsBO[i].name;
                        columnsAO[i].name = $scope.params.outputColumnNameOverrides[columnsBO[i].name] || columnsBO[i].name;
                    }
                    resyncWithEngine();
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
            if (!$scope.params) return;//not ready
            var inputRef = RecipesUtils.getSingleInput($scope.recipe, "main").ref
            var inputSchema = $scope.computablesMap[inputRef].dataset.schema
            validateFilter($scope.params.preFilter, inputSchema);
            validateFilter($scope.params.postFilter);
        }

        function validateFilter(filterDesc, schema) {
            var deferred = $q.defer();
            if (!filterDesc || !filterDesc.enabled) return;
            if (angular.isUndefined(filterDesc.expression)) return;
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
        };

        /* callback given to the filter module */
        $scope.onFilterUpdate = $scope.updateRecipeStatusLater;

        /****** computed columns ********/
        function computedColumnListUpdated(computedColumns) {
            $scope.params.computedColumns = angular.copy(computedColumns);
            resyncWithInputSchema();
            $scope.updateRecipeStatusLater();
        }

        /* callback given to the computed columns module */
        $scope.onComputedColumnListUpdate = computedColumnListUpdated;

        $scope.getColumnsWithComputed = function() {
            if (!$scope.uiState.columnsWithComputed) {
                var columns = [].concat($scope.getColumns());
                for (var i = 0; i < (($scope.params || {}).computedColumns || []).length; i++) {
                    var computedCol = $scope.params.computedColumns[i];
                    // do not add computed columns if they are blank
                    if (computedCol.name && columns.map(function(col){return col.name}).indexOf(computedCol.name) == -1) {
                        columns.push({
                            name: computedCol.name,
                            type: computedCol.type
                        });
                    }
                }
                $scope.uiState.columnsWithComputed = columns;
            }
            return $scope.uiState.columnsWithComputed;
        };

        /******  grouping key/values  ********/

        $scope.removeGroupKey = function(col) {
            var idx = $scope.params.keys.indexOf(col);
            if (idx > - 1) {
                $scope.params.keys.splice(idx, 1);
            }
            if (col.column) {
                var presentColumns = $scope.params.values.map(Fn.prop('column'));
                presentColumns.push(col.column);
                var insertIndex = $scope.listColumnsForCumstomColumnsEditor()
                    .filter(Fn.inArray(presentColumns)).indexOf(col.column);
                $scope.params.values.splice(Math.max(insertIndex,0), 0, col);
            }
        };

        $scope.addGroupKey = function(col) {
            if (!col) {
                return;
            }
            const idx = $scope.params.values.map(Fn.prop('column')).indexOf(col.column);
            if (idx === -1) {
                return;
            }
            const key = angular.copy(col);
            key.$selected = false;
            $scope.params.keys.push(key);
            $scope.params.values.splice(idx, 1);
            $scope.hooks.updateRecipeStatus();
        };
        $scope.groupKeyFilter = {};

        $scope.addCustomValue = function(){
            var newVal = {
                customName : userFriendlyTransmogrify('custom_aggr', $scope.params.values.filter(function(v) {return v.column == null;}), 'customName', '_', true),
                customExpr : ''
            }
            $scope.params.values.push(newVal);

            //activate edit mode and focus name field
            $timeout(function(){
                var el = angular.element('[computed-column-editor]').last();
                $timeout(function(){ $('.name-editor', el).focus(); });
                $scope.$apply();
            });
        };
        // /!\ Watch out /!\
        // params comes from a json.parse : if multiple calls are made
        // a $watch(true) won't trigger the copy to realValues, thus makeing object refs
        // used in frontend disconnected from actual data
        $scope.$watchCollection("params.values", function(nv) {
            $scope.realValues = getRealValues();
        });
        var getRealValues = function() {
            var realValues = (!$scope.params||!$scope.params.values) ? [] : $scope.params.values.filter(function(val) { return !!val.column });
            var realValuesNames = realValues.map(function(rv){return rv.column});
            var newRealValues = [];
            var i;
            var oldRVIdx;
            var columns = $scope.getColumns();
            for (i = 0; i < columns.length; i++) {
                var col = columns[i];
                if (col.name && col.name.length > 0) {
                    oldRVIdx = realValuesNames.indexOf(col.name);
                    if (oldRVIdx >= 0) {
                        newRealValues.push(realValues[oldRVIdx]);
                    }
                }
            }
            var newRealValuesNames = newRealValues.map(function(rv){return rv.column});
            var computedColumns = (($scope.params || {}).computedColumns || []);
            for (i = 0; i < computedColumns.length; i++) {
                var compCol = computedColumns[i];
                // make sure that there is no previous value named the same
                if (compCol.name && compCol.name.length > 0 && newRealValuesNames.indexOf(compCol.name) == -1) {
                    oldRVIdx = realValuesNames.indexOf(compCol.name);
                    if (oldRVIdx >= 0) {
                        newRealValues.push(realValues[oldRVIdx]);
                    }
                }
            }
            return newRealValues;
        }
        $scope.getCustomValues = function() {
            if (!$scope.params||!$scope.params.values) { return [] }
            return $scope.params.values.filter(function(val) { return !val.column });
        }

        //This lists the input dataset column names
        $scope.listColumnsForCumstomColumnsEditor = function(){
            return $scope.getColumns().map(function (col) {
                return col.name;
            });
        };

        /********  aggregations selector *******/

        $scope.aggregationTypes =  [
            {name: "countDistinct", opType:"DISTINCT", label: "Distinct", tooltip: "Count distinct values"},
            {name: "min", label: "Min"},
            {name: "max", label : "Max"},

            {name: "avg", label: "Avg"},
            {name: "sum", label: "Sum"},
            {name: "concat", label: "Concat", tooltip: "Concatenate values in one string"},
            {name: "stddev", label: "Std. dev."},

            {name: "count", label: "Count", tooltip: "Count non-null"},
            {name: "first", label: "First"},
            {name: "last", label: "Last"},
        ];

        $scope.columnHasSomeComputation = function (col) {
            var ret = false;
            $scope.aggregationTypes.forEach(function(agg) {
                ret = ret || col[agg.name];
            });
            return ret;
        };

        // Checks if we can perform the specified aggregation on column col
        $scope.colCanAggr = function(col, agg) {
            if (!$scope.engineCanAggr(agg)) return false;
            var opType = agg.opType || agg.name.toUpperCase();
            var aggregability = $scope.recipeStatus.selectedEngine.aggregabilities[opType];
            var typeCategory = {"string":"strings",
                                "date":"dates",
                                "boolean":"booleans",
                                "tinyint":"numerics",
                                "smallint":"numerics",
                                "int":"numerics",
                                "bigint":"numerics",
                                "float":"numerics",
                                "double":"numerics"
                            }[col.type];
            return aggregability && typeCategory && aggregability[typeCategory];
        };

        $scope.engineCanAggrType = function(opType) {
            if (!$scope.recipeStatus || !$scope.recipeStatus.selectedEngine) return false;
            var aggregability = $scope.recipeStatus.selectedEngine.aggregabilities[opType];
            return aggregability && aggregability[$scope.aggregateUsabilityFlag];
        };
        $scope.engineCanAggr = function(agg) {
            if (!$scope.recipeStatus || !$scope.recipeStatus.selectedEngine) return false;
            var opType = agg.opType || agg.name.toUpperCase();
            var aggregability = $scope.recipeStatus.selectedEngine.aggregabilities[opType];
            return aggregability && aggregability[$scope.aggregateUsabilityFlag];
        };

        $scope.initOrderColumn = function(col) {
            var cols = $scope.getColumns();
            col.orderColumn = col.orderColumn || (cols && cols.length ? cols[0].name : undefined);
        };
        // call this in a ng-init when toggling some aggregate triggers the need for more setup. Otherwise
        // the get-status call might exclude the engine because of incomplete setup (typically: the ordercolumn
        // for first/last
        $scope.initColumnExtraFields = function(column) {
            $scope.initOrderColumn(column);
            column.concatSeparator = column.concatSeparator != null ? column.concatSeparator : ',';
            column.concatDistinct = column.concatDistinct || false;
        };

        $scope.aggregation = {'all':{},'some':{},'none':{},'disabled':{}};

        function filterUnused(vals) {
            return vals.filter(function(val){
                return !$scope.uiState.hideUseless || $scope.columnHasSomeComputation(val);
            });
        }

        $scope.selection = {
            'customFilter':filterUnused,
            'customFilterWatch':'uiState.hideUseless',
        }

        $scope.recomputeAggregationStates = function(cols) {
            for (var k in $scope.aggregation) {$scope.aggregation[k]={};}

            cols.forEach(function(column){
                $scope.aggregationTypes.forEach(function(agg) {
                    var colEnabled = $scope.colCanAggr(column, agg);
                    $scope.aggregation.all[agg.name] =
                        ($scope.aggregation.all[agg.name] == undefined ? true : $scope.aggregation.all[agg.name])
                        && (colEnabled ? column[agg.name] : false);
                    $scope.aggregation.some[agg.name] =
                        ($scope.aggregation.some[agg.name] || false)
                        || (colEnabled ? column[agg.name] : false);
                    $scope.aggregation.disabled[agg.name] =
                        ($scope.aggregation.disabled[agg.name] || false)
                        || colEnabled;
                });
            });
            angular.forEach($scope.aggregationTypes,function(agg){
                $scope.aggregation.disabled[agg.name] = !$scope.aggregation.disabled[agg.name];
                $scope.aggregation.some[agg.name] = $scope.aggregation.some[agg.name] && !$scope.aggregation.all[agg.name];
                $scope.aggregation.none[agg.name] = !$scope.aggregation.some[agg.name] && !$scope.aggregation.all[agg.name];
            });
        }

        // Apply/disapply aggregation to all selected columns
        $scope.massAction = function(agg, selectedObjects){
            selectedObjects.forEach(function(val) {
                if ($scope.colCanAggr(val, agg)) {
                    val[agg.name] = $scope.aggregation.all[agg.name];
                }
            });
            // run the orderColumn init before updating the status, otherwise the ng-init will run while the new status is
            // computed and will be overwritten
            if (['first', 'last'].indexOf(agg.name) >= 0) {
                selectedObjects.forEach(function(val) {
                    $scope.initOrderColumn(val);
                });
            }
            $scope.aggregation.some[agg.name] = false;
            $scope.aggregation.none[agg.name] = !$scope.aggregation.all[agg.name];
            $scope.hooks.updateRecipeStatus();
        }

        $scope.massUseAsKeys = function() {
            // add selected values to keys
            $scope.selection.selectedObjects.forEach(function(val) {
                var key = angular.copy(val);
                key.$selected = false;
                $scope.params.keys.push(key);
            });
            //remove from values list
            $scope.params.values = $scope.selection.allObjects.filter(function(val) {
                return !val.$selected;
            });
            $scope.hooks.updateRecipeStatus();
        };

        /********  general init  ********/

        function loadParamsFromScript(scriptData) {
            if (!scriptData) return;
            $scope.params = JSON.parse(scriptData);
            $scope.params.preFilter = $scope.params.preFilter || {};
            $scope.params.computedColumns = $scope.params.computedColumns || [];
            $scope.params.postFilter = $scope.params.postFilter || {};
            $scope.params.outputColumnNameOverrides = $scope.params.outputColumnNameOverrides || {};

            $scope.uiState.computedColumns = angular.copy($scope.params.computedColumns);

            //keep params for dirtyness detection
            visualCtrl.saveServerParams();

            // update recipe according to current schema
            resyncWithInputSchema();

            // update aggragation according to engine capabilities
            resyncWithEngine();

            //Add column types in the grouping values & keys, it will make things easier
            var colsByName = {};
            $scope.getColumns().forEach(function(col){
                colsByName[col.name] = col;
            });
            $scope.params.values.forEach(function(gv){
                if (colsByName[gv.column]) {
                    gv.type = colsByName[gv.column].type;
                }
            });
            $scope.params.keys.forEach(function(gv){
                if (colsByName[gv.column]) {
                    gv.type = colsByName[gv.column].type;
                }
            });
        }

        function resyncWithInputSchema() {
            // in case the dataset schema changed since the recipe creation/last edition
            // reset the calculated columns with computed to force refresh
            $scope.uiState.columnsWithComputed = undefined;
            var inputColumnsWithComputed = $scope.getColumnsWithComputed();
            var inputColumnsWithComputedNames = inputColumnsWithComputed.map(function(col){return col.name});

            var keys = {};
            (($scope.params || {}).keys || []).forEach(function(col, i) {
                col.$$originalIndex = i;
                if (col.column && inputColumnsWithComputedNames.indexOf(col.column) >= 0) {
                    keys[col.column] = col;
                }
            });
            var values = {}, customValues = [];
            (($scope.params || {}).values || []).forEach(function(col) {
                if (col.column) {
                    if (inputColumnsWithComputedNames.indexOf(col.column) >= 0) {
                        values[col.column] = col;
                    }
                } else {
                    customValues.push(col);
                }
            });

            var newKeys = [];
            var newValues = [];
            inputColumnsWithComputed.forEach(function(col){
                var newCol;
                if (keys[col.name]) {
                    newCol = keys[col.name];
                } else if (values[col.name]) {
                    newCol = values[col.name];
                } else {
                    //this is apparently a new column in the dataset. Add an empty value
                    //put everything to false to avoid dirtyness on check/uncheck
                    newCol = {
                        column: col.name,
                        type: col.type
                    };
                }
                angular.extend(newCol, {
                    column: col.name,
                    type: col.type
                });
                $scope.aggregationTypes.forEach(function(agg){
                    newCol[agg.name] = newCol[agg.name] || false;
                });
                if (keys[col.name]) {
                    newKeys.push(newCol);
                } else {
                    newValues.push(newCol);
                }
            });

            customValues.forEach(function(val){
                newValues.push(val);
            });

            // Sorting the keys by origin index to preserve pre-existing order
            newKeys.sort((a, b) => a.$$originalIndex - b.$$originalIndex);

            // remove outdated columns (keep computed columns or column that is in the schema)
            $scope.params = $scope.params || {};
            $scope.params.keys = newKeys;
            $scope.params.values = newValues;

            // call the callback if it exists
            if ($scope.onResyncWithInputSchema) {
                $scope.onResyncWithInputSchema();
            }
        }

        function resyncWithEngine() {
            if (!$scope.recipeStatus || !$scope.recipeStatus.selectedEngine) return; // no aggregability available yet, let's not jump to conclusions and deactivate everything
            //prevent inconsistent aggregations (ex: avg selected for number then type changed to string)
            $scope.params.values.forEach(function(val){
                $scope.aggregationTypes.forEach(function(agg){
                    if (val[agg.name] && !$scope.colCanAggr(val, agg)) {
                        val[agg.name] = false;
                    }
                });
            });
            if ($scope.engineCanAggrType('CONCAT_DISTINCT') != true) {
                $scope.params.values.forEach(function(val){
                    val.concatDistinct = false; // otherwise you never get to click on the checkbox
                });
            }
            if ($scope.engineCanAggrType('FIRST_NOTNULL') != true) {
                $scope.params.values.forEach(function(val){
                    val.firstLastNotNull = false; // otherwise you never get to click on the checkbox
                });
            }
        }

        function onScriptChanged(nv, ov) {
             if (nv) {
                loadParamsFromScript($scope.script.data);
                DKUtils.reflowNext();
                DKUtils.reflowLater();
                $scope.hooks.updateRecipeStatus();
            }
        }

        $scope.uiState = {
            currentStep: 'group',
            outputColumnNamesOverridable: true,
            computedColumns: []
        };

        $scope.hooks.onRecipeLoaded = function(){
            Logger.info("On Recipe Loaded");
            validateFilters();
            $scope.$watch("script.data", onScriptChanged, true); // this will call $scope.hooks.updateRecipeStatus when ready
            $scope.$watchCollection("recipe.inputs.main.items", function() {
                DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                    .then(_ => resyncWithInputSchema());
            });
        };

        $scope.$watch('topNav.tab',function(nv){
            if (nv == 'settings') {
                $timeout(function() {
                    $scope.$broadcast('redrawFatTable');
                });
            }
        });

        $scope.enableAutoFixup();
        $scope.specificControllerLoadedDeferred.resolve();
    });
})();
