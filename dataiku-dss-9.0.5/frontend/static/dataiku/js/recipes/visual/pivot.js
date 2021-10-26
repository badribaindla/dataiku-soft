(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("PivotRecipeCreationController", function($scope, $controller, Fn) {
        $scope.recipeType = "pivot";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset && $scope.io.targetVariable) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                var niceTargetVariable = $scope.io.targetVariable.replace(/[^\w ]+/g,"").replace(/ +/g,"_");
                $scope.maybeSetNewDatasetName(niceInputName + "_by_" + niceTargetVariable);
            }
        };

        $scope.getCreationSettings = function () {
            return {key: $scope.io.targetVariable};
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

    
    app.controller("EditCustomAggregatesController", function ($scope, $q, Logger, $timeout, Dialogs, DataikuAPI, $stateParams) {
        $scope.commitAggregates = function() {
            $scope.doCommitAggregates($scope.customAggregates);
            $scope.dismiss();
        };
        
        $scope.addAggregate = function() {
            $scope.customAggregates.push({name:"custom_" + $scope.customAggregates.length, label:null, suffix:null, expression:"", type:"string"});
        };
        $scope.removeAggregate = function(aggregate) {
            var idx = $scope.customAggregates.indexOf(aggregate);
            if (idx >= 0) {
                $scope.customAggregates.splice(idx, 1);
            }
        };
    });
    
    app.controller("PivotRecipeController", function ($scope, $rootScope, $q, $controller, DKUtils, RecipesUtils, Logger, RecipeStatusHelper, InfoMessagesUtils, $timeout, Dialogs, DataikuAPI, $stateParams, ComputableSchemaRecipeSave, CreateModalFromTemplate) {
        var visualCtrl = $controller('VisualRecipeEditorController', {$scope: $scope}); //Controller inheritance
        this.visualCtrl = visualCtrl;

        /******  recipe related *****/
        $scope.hooks.getPayloadData = function () {
            var cleanuped = angular.copy($scope.params);
            if (cleanuped != null) {
                delete cleanuped.$candidateExplicitIdentifierColumns;
                cleanuped.pivots.forEach(function(pivot) {
                    delete pivot.$candidateKeyColumns;
                    delete pivot.$status;
                    delete pivot.$statusClass;
                    delete pivot.$errors;
                    delete pivot.$warnings;
                    delete pivot.$confirmations;
                    delete pivot.$currentModalities;
                    pivot.valueColumns = pivot.valueColumns.filter(function(valueColumn) {return $scope.columnHasSomeComputation(valueColumn);}); 
                });
                cleanuped.otherColumns = cleanuped.otherColumns.filter(function(otherColumn) {return $scope.columnHasSomeComputation(otherColumn);}); 
            }
            return angular.toJson(cleanuped);
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
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        $scope.hooks.save = function() {
            var deferred = $q.defer();
            if ($scope.recipeStatus && $scope.recipeStatus.outputSchema) {
                // output schema computation seems doable: do the schema validation modal
                var recipeSerialized = $scope.hooks.getRecipeSerialized();
                var payloadData = $scope.hooks.getPayloadData();
                ComputableSchemaRecipeSave.handleSave($scope, recipeSerialized, payloadData, deferred);
            } else {
                // no output schema : just save and let the runner alter the schema
                $scope.baseSave($scope.hooks.getRecipeSerialized(), $scope.hooks.getPayloadData()).then(function(){
                    deferred.resolve("Save done");
                }, function(error) {
                    Logger.error("Could not save recipe");
                    deferred.reject("Could not save recipe");
                });
            }
            return deferred.promise.then(visualCtrl.saveServerParams);
        };

        /********* dispatching of columns into identifiers / keys / values ************/

        var fixupFieldsForPivot = function(params) {
            params.keyColumns = params.keyColumns || [];
            params.valueColumns = params.valueColumns || [];
            params.explicitValues = params.explicitValues || [];
            params.valueLimit = params.valueLimit || 'TOP_N';
            params.topnLimit = params.topnLimit || 20;
            params.valueColumns.forEach(function(valueColumn) {
                angular.forEach($scope.aggregationTypes,function(agg){
                    if (valueColumn[agg.name] == true) {
                        valueColumn.$agg = agg.name;
                    }
                });
                angular.forEach(params.customAggregates,function(agg){
                    if (valueColumn.customAggr == agg.name) {
                        valueColumn.$agg = agg.name;
                    }
                });
            })
        };
        var fixupParamsFieldsForPivotSection = function(params) {
            params.identifierColumnsSelection = params.identifierColumnsSelection || 'EXPLICIT';
            params.customAggregates = params.customAggregates || [];
            params.explicitIdentifiers = params.explicitIdentifiers || [];
            params.pivots = params.pivots || [];
            if (params.pivots.length == 0) {
                // add 1 by default
                params.pivots.push({globalCount:true})
            }
            params.pivots.forEach(function(pivot) {fixupFieldsForPivot(pivot);});
        };
        var fixupParamsFieldsForComputedColumnsSection = function(params) {
            params.computedColumns = params.computedColumns || [];
        };
        var fixupParamsFieldsForOtherColumnsSection = function(params) {
            params.otherColumns = params.otherColumns || [];
        };
        var fixupParamsGeneric = function(params) {
            params.enginesPreferences = params.enginesPreferences || {};
        };
        
        var indexOfValueColumn = function(pivot, name) {
            var found = -1;
            pivot.valueColumns.forEach(function(valueColumn, i) {
                if (valueColumn.column == name) {
                    found = i;
                }
            });
            return found;
        };
        var indexOfValueColumnObject = function(pivot, col) {
            var found = -1;
            pivot.valueColumns.forEach(function(valueColumn, i) {
                if (valueColumn == col) {
                    found = i;
                }
            });
            return found;
        };
        
        var indexOfKeyColumn = function(pivot, name) {
            return pivot.keyColumns.indexOf(name);
        };
        
        var indexOfIdentifierColumn = function(name) {
            return $scope.params.explicitIdentifiers.indexOf(name);
        };
        
        var indexOfOtherColumn = function(name) {
            var found = -1;
            $scope.params.otherColumns.forEach(function(otherColumn, i) {
                if (otherColumn.column == name) {
                    found = i;
                }
            });
            return found;
        };
        
        $scope.$candidateExplicitIdentifierColumns = [];
        var buildColumnListsForPivotSection = function() {
            if ($scope.params == null) {
                return; // can't do anything
            }
            if ($scope.recipeStatus == null || $scope.recipeStatus.pivotStageSchema == null) {
                return; // column list not sent by the backend (yet)
            }
            // column list ready, split into lists for the selectors
            // explicitIdentifiers : any column that is not already an identifier can be used
            var notAlreadyInExplicitIdentifiers = [];
            $scope.recipeStatus.pivotStageSchema.columns.forEach(function(column) {
                if (indexOfIdentifierColumn(column.name) < 0) {
                    notAlreadyInExplicitIdentifiers.push(column);
                }
            });
            $scope.$candidateExplicitIdentifierColumns = notAlreadyInExplicitIdentifiers;
            // for each pivot:
            //   keyColumns : any column that is not an identifier and not already a keyColumn
            //   valueColumns : any column that is not an identifier and not already a valueColumn
            $scope.params.pivots.forEach(function(pivot) {
                pivot.$candidateKeyColumns = [];
                notAlreadyInExplicitIdentifiers.forEach(function(column) {
                    if (indexOfKeyColumn(pivot, column.name) < 0) {
                        pivot.$candidateKeyColumns.push(column);
                    } 
                });
            });
            // all non-identifier columns can be 'other' columns (even if already used in a pivot)
            var otherColumns = [];
            $scope.recipeStatus.pivotStageSchema.columns.forEach(function(column) {
                if (indexOfIdentifierColumn(column.name) < 0) {
                    var oidx = indexOfOtherColumn(column.name);
                    if (oidx >= 0) {
                        otherColumns.push($scope.params.otherColumns[oidx]);
                    } else {
                        otherColumns.push({column:column.name, type:column.type});
                    }
                }
            });
            // replace the contents of the array
            $scope.params.otherColumns = otherColumns;

        };
        var associateStatusToPivotElements = function() {
            if ($scope.params == null) {
                return;
            }
            $scope.params.pivots.forEach(function(pivot) {pivot.$status = null;});
            if ($scope.recipeStatus == null || $scope.recipeStatus.pivot == null) {
                return;
            }
            var status = $scope.recipeStatus.pivot;
            for (var i = 0; i < $scope.params.pivots.length; i++) {
                var pivot = $scope.params.pivots[i];
                var filteredStatus = InfoMessagesUtils.filterForLine(status, i);
                pivot.$status = filteredStatus;
                pivot.$statusClass = RecipeStatusHelper.getStatusClass(filteredStatus);
                pivot.$errors = RecipeStatusHelper.getErrors(filteredStatus.messages);
                pivot.$warnings = RecipeStatusHelper.getWarnings(filteredStatus.messages);
                pivot.$confirmations = RecipeStatusHelper.getConfirmations(filteredStatus.messages);
            }
            if ($scope.recipeStatus.pivotModalities) {
                for (var i = 0; i < $scope.params.pivots.length; i++) {
                    var pivot = $scope.params.pivots[i];
                    var modalities = $scope.recipeStatus.pivotModalities[i];
                    pivot.$currentModalities = modalities;
                }                
            }
        };
        $scope.$watch('recipeStatus.pivotStageSchema', buildColumnListsForPivotSection, true);
        $scope.$watch('recipeStatus.pivot', associateStatusToPivotElements);

        $scope.removeIdentifier = function(col) {
            var idx = indexOfIdentifierColumn(col);
            if (idx >= 0) {
                $scope.params.explicitIdentifiers.splice(idx, 1);
                buildColumnListsForPivotSection();
            }
        };

        $scope.addIdentifier = function(col) {
            var idx = indexOfIdentifierColumn(col);
            if (idx < 0) {
                $scope.params.explicitIdentifiers.push(col);
                // remove from pivots' keyColumns and valueColumns
                $scope.params.pivots.forEach(function(pivot) {
                    var kidx = indexOfKeyColumn(pivot, col);
                    if (kidx >= 0) {
                        pivot.keyColumns.splice(kidx, 1);
                    }
                    for (var vidx = indexOfValueColumn(pivot, col); vidx >= 0; vidx = indexOfValueColumn(pivot, col)) {
                        pivot.valueColumns.splice(vidx, 1);
                    }
                });
                buildColumnListsForPivotSection();
            }
        };
        
        $scope.removeKeyColumn = function(pivot, col) {
            var idx = indexOfKeyColumn(pivot, col);
            if (idx >= 0) {
                pivot.keyColumns.splice(idx, 1);
                removeKeyColumnInExplicitValues(pivot, idx);
                buildColumnListsForPivotSection();
            }
        };

        $scope.addKeyColumn = function(pivot, col) {
            var idx = indexOfKeyColumn(pivot, col);
            if (idx < 0) {
                pivot.keyColumns.push(col);
                addKeyColumnInExplicitValues(pivot);
                // remove from valueColumns
                for (var vidx = indexOfValueColumn(pivot, col); vidx >= 0; vidx = indexOfValueColumn(pivot, col)) {
                    pivot.valueColumns.splice(vidx, 1);
                }
                buildColumnListsForPivotSection();
            }
        };

        $scope.removeValueColumn = function(pivot, col) {
            var idx = indexOfValueColumnObject(pivot, col);
            if (idx >= 0) {
                $rootScope.$broadcast("dismissPopovers"); // in case the delete aggregate is currently being edited
                pivot.valueColumns.splice(idx, 1);
                buildColumnListsForPivotSection();
            }
        };

        $scope.addValueColumn = function(pivot, col) {
            pivot.valueColumns.push({column:col.name, type:col.type, count:true, $agg: "count"});
            var idx = indexOfKeyColumn(pivot, col.name);
            if (idx >= 0) {
                $scope.removeKeyColumn(pivot, col.name);
            }
            buildColumnListsForPivotSection();
        };

        $scope.removePivot = function(pivot) {
            var idx = $scope.params.pivots.indexOf(pivot);
            if (idx >= 0) {
                $scope.params.pivots.splice(idx, 1);
                buildColumnListsForPivotSection();
            }
        };

        $scope.addPivot = function() {
            var pivot = {};
            fixupFieldsForPivot(pivot);
            $scope.params.pivots.push(pivot);
            buildColumnListsForPivotSection();
        };
        
        $scope.listTypesOf = function(columns) {
            return columns ? columns.map(function(c) {return c.type;}) : [];
        };

        // call this in a ng-init when toggling some aggregate triggers the need for more setup. Otherwise
        // the get-status call might exclude the engine because of incomplete setup (typically: the ordercolumn
        // for first/last
        $scope.initColumnExtraFields = function(valueColumn) {
            valueColumn.concatSeparator = valueColumn.concatSeparator != null ? valueColumn.concatSeparator : ',';
            valueColumn.concatDistinct = valueColumn.concatDistinct || false;
        };
        
        /********  computed columns      *******/
        function computedColumnListUpdated(computedColumns) {
            $scope.params.computedColumns = angular.copy(computedColumns);
            $scope.updateRecipeStatusLater();
        }

        /* callback given to the computed columns module */
        $scope.onComputedColumnListUpdate = computedColumnListUpdated;
        
        
        /********  custom aggregations   *******/
        $scope.showEditCustomAggregatesModal = function() {
            var newScope = $scope.$new();
            newScope.customAggregates = angular.copy($scope.params.customAggregates);
            newScope.doCommitAggregates = function(customAggregates) {
                $scope.params.customAggregates = customAggregates;
            };
            CreateModalFromTemplate("/templates/recipes/visual-recipes-fragments/edit-custom-aggregates-modal.html", newScope, null, null);
        };

        /********  aggregations selector *******/
        $scope.aggregateUsabilityFlag = "usableInGroup";
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

        $scope.getAggregationLabel = function(valueColumn, withHtmlTags) {
            var label = '';
            if (withHtmlTags) {
                label += '<strong>';
            }
            label += valueColumn.$agg + '(';
            if (valueColumn.concat && valueColumn.concatDistinct) {
                label += 'distinct ';
            }
            label += valueColumn.column + ')';
            if (withHtmlTags) {
                label += '</strong>';
            }
            if (valueColumn.first || valueColumn.last) {
                label += ' ordered by ';
                if (withHtmlTags) {
                    label += '<strong>';
                }
                label += valueColumn.orderColumn;
                if (withHtmlTags) {
                    label += '</strong>';
                }
                if (valueColumn.firstLastNotNull) {
                    label += ' ignoring null values';
                }
            }
            if (valueColumn.concat && valueColumn.concatSeparator && valueColumn.concatSeparator.length > 0) {
                label += ' using separator "' + valueColumn.concatSeparator + '"';
            }
            return label;
        };

        $scope.columnHasSomeComputation = function (col) {
            var ret = false;
            $scope.aggregationTypes.forEach(function(agg) {
                ret = ret || col[agg.name];
            });
            ret = ret || (col.customAggr && col.customAggr.length > 0);
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

        $scope.getColumnsForOrder = function() {
            if ($scope.recipeStatus == null || $scope.recipeStatus.pivotStageSchema == null) {
                return [];
            } else {
                return $scope.recipeStatus.pivotStageSchema.columns;
            }
        };
             
        $scope.initOrderColumn = function(col) {
            var cols = $scope.getColumnsForOrder();
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
        
        $scope.updateAgg = function(valueColumn) {
            angular.forEach($scope.aggregationTypes,function(agg) {
                valueColumn[agg.name] = false;
            });
            valueColumn.customAggr = null;
            if (valueColumn.$agg) {
                if ($scope.params.customAggregates.map(function(a) {return a.name;}).indexOf(valueColumn.$agg) >= 0) {
                    valueColumn.customAggr = valueColumn.$agg;
                } else if ($scope.aggregationTypes.map(function(a) {return a.name;}).indexOf(valueColumn.$agg) >= 0) {
                    valueColumn[valueColumn.$agg] = true;
                } else {
                    logger.error("Unknown aggregate", valueColumn.$agg);
                }
            }
            if ((valueColumn.first || valueColumn.last) && !valueColumn.orderColumn) {
                $scope.initOrderColumn(valueColumn);
            }
        };
        
        /********* modalities **************/
        
        var removeKeyColumnInExplicitValues = function(pivot, idx) {
            pivot.explicitValues.forEach(function(keyValues) {
                if (keyValues.length > idx) {
                    keyValues.splice(idx, 1);
                }
            });
        };
        var addKeyColumnInExplicitValues = function(pivot) {
            pivot.explicitValues.forEach(function(keyValues) {
                keyValues.push(null);
            });
        };
        
        $scope.addModality = function(pivot) {
            var keyValues = pivot.keyColumns.map(function(k) {return null;});
            pivot.explicitValues.push(keyValues);
        };
        
        $scope.removeModality = function(pivot, keyValues) {
            var idx = pivot.explicitValues.indexOf(keyValues);
            if (idx >= 0) {
                pivot.explicitValues.splice(idx, 1);
            }
        };
        
        $scope.loadModalitiesFromOutput = function(pivot) {
            if (!pivot.$currentModalities) return;
            pivot.explicitValues = pivot.$currentModalities.map(function(o) {return o.keyValues;});
        };
        $scope.loadModalitiesFromDataset = function(pivot, smartName) {
            DataikuAPI.flow.recipes.pivot.getDatasetModalities($stateParams.projectKey, smartName, pivot).success(function(data) {
                pivot.explicitValues = data.explicitValues;
            }).error(setErrorInScope.bind($scope));
        };
        
        /********* schema handling **********/
        
        $scope.dropOutputSchema = function() {
            var output = RecipesUtils.getSingleOutput($scope.recipe, "main");
            Dialogs.confirmPositive($scope, 'Drop output schema', 'The schema of "'+output.ref+'" will be cleared. Are you sure you want to continue ?').then(function() {
                 DataikuAPI.flow.recipes.basicDropSchema($stateParams.projectKey, $scope.hooks.getRecipeSerialized()).success(function() {$scope.hooks.updateRecipeStatus(true);}).error(setErrorInScope.bind($scope));
            });
        };

        $scope.modalitySlugifications = [
                                     ["NONE", "None"],
                                     ["SOFT_SLUGIFY", "Soft slugification"],
                                     ["HARD_SLUGIFY", "Hard slugification"],
                                     ["NUMBER", "Numbering"]
                                 ];

        $scope.modalitySlugificationsDesc = [
                                     "Column names are built by concatenating the modality's values",
                                     "Replace punctuation and whitespace by _",
                                     "Keep only safe characters (latin letters, numbers)",
                                     "Number modalities instead of build a name from their values"
                                 ];
        
        $scope.$watch("params.$withModalityMaxLength", function() {
            if ($scope.params && !$scope.params.$withModalityMaxLength) {
                $scope.params.modalityMaxLength = null;
            }
        });

        /*********  ************/

        var onScriptChanged = function(nv) {
            if (nv) {
               loadParamsFromScript($scope.script.data);
               DKUtils.reflowNext();
               DKUtils.reflowLater();
               $scope.hooks.updateRecipeStatus();
           }
        };

        var loadParamsFromScript = function(scriptData) {
            if (!scriptData) {
                return;
            }
            $scope.params = JSON.parse(scriptData);
            fixupParamsGeneric($scope.params);
            fixupParamsFieldsForComputedColumnsSection($scope.params);
            fixupParamsFieldsForPivotSection($scope.params);
            fixupParamsFieldsForOtherColumnsSection($scope.params);
            buildColumnListsForPivotSection();
            
            $scope.uiState.computedColumns = angular.copy($scope.params.computedColumns);

            //keep params for dirtyness detection
            visualCtrl.saveServerParams();
        };
        
        // UI:
        $scope.uiState = {
            currentStep: 'pivot',
            modalitiesDatasetSmartName: null,
            computedColumns: []
        };

        $scope.hooks.onRecipeLoaded = function(){
            Logger.info("On Recipe Loaded");
            $scope.$watch("script.data", onScriptChanged, true);
            onScriptChanged($scope.script.data);
        };

        $scope.enableAutoFixup();
        $scope.specificControllerLoadedDeferred.resolve();
        $scope.$watch("params", $scope.updateRecipeStatusLater, true);
    });

    app.directive('pivotHelp', function() {
        return {
            restrict: 'A',
            scope: true,
            templateUrl: '/templates/recipes/fragments/pivot-help.html',
            link : function($scope, element, attrs) {
                $scope.examples = [];
                $scope.examples.push({
                    title: 'Simple count',
                    column: 'year',
                    row: '\u2014',
                    hasIdentifier: false,
                    content: 'count of records',
                    input: {
                        columns: ['id', 'country', 'year', 'qty'],
                        rows: [
                               ['1', 'US', '2016', 7 ],
                               ['2', 'US', '2017', 12],
                               ['3', 'US', '2017', 23],
                               ['4', 'FR', '2017', 8 ]
                              ]
                    },
                    output: {
                        title: 'Count of records',
                        columns: ['2016', '2017'],
                        rows: [
                               [1, 3]
                              ]
                    }
                });
                $scope.examples.push({
                    title: 'Pivot table',
                    column: 'year',
                    row: 'country',
                    hasIdentifier: true,
                    content: 'sum of qty',
                    input: {
                        columns: ['id', 'country', 'year', 'qty'],
                        rows: [
                               ['1', 'US', '2016', 7 ],
                               ['2', 'US', '2017', 12],
                               ['3', 'US', '2017', 23],
                               ['4', 'FR', '2017', 8 ]
                              ]
                    },
                    output: {
                        title: 'Qty per country/year',
                        columns: ['', '2016', '2017'],
                        rows: [
                               ['US', 7   , 35],
                               ['FR', null, 8]
                              ]
                    }
                });
                $scope.examples.push({
                    title: 'Pivot values',
                    column: 'metric',
                    row: 'id',
                    hasIdentifier: true,
                    content: 'first of values',
                    hint: 'Mostly used on input with a single value per key combination',
                    input: {
                        columns: ['id', 'metric', 'values'],
                        rows: [
                               ['1', 'weight' , 2],
                               ['1', 'height' , 4],
                               ['2', 'weight' , 3],
                               ['2', 'height' , 5],
                               ['3', 'weight' , 8],
                               ['3', 'height' , 5]
                              ]
                    },
                    output: {
                        title: 'Pivoted values',
                        columns: ['', 'weight', 'height'],
                        rows: [
                               ['1', 2, 4],
                               ['2', 3, 5],
                               ['3', 8, 5]
                              ]
                    }
                });
                $scope.examples.push({
                    title: 'Frequency table',
                    column: 'year',
                    row: 'country',
                    hasIdentifier: true,
                    content: 'count of records',
                    input: {
                        columns: ['id', 'country', 'year', 'qty'],
                        rows: [
                               ['1', 'US', '2016', 7 ],
                               ['2', 'US', '2017', 12],
                               ['3', 'US', '2017', 23],
                               ['4', 'FR', '2017', 8 ]
                              ]
                    },
                    output: {
                        title: 'Count of records',
                        columns: ['', '2016', '2017'],
                        rows: [
                               ['US', 1   , 2],
                               ['FR', null, 1]
                              ]
                    }
                });
                $scope.examples.push({
                    title: 'Various statistics',
                    column: 'year',
                    row: 'country',
                    hasIdentifier: true,
                    content: 'sum of qty',
                    other: 'average of qty',
                    input: {
                        columns: ['id', 'country', 'year', 'qty'],
                        rows: [
                               ['1', 'US', '2016', 7 ],
                               ['2', 'US', '2017', 12],
                               ['3', 'US', '2017', 23],
                               ['4', 'FR', '2017', 8 ]
                              ]
                    },
                    output: {
                        title: 'Qty per country/year',
                        columns: ['', '2016', '2017', 'avg(qty)'],
                        rows: [
                               ['US', 7   , 35, 14],
                               ['FR', null, 8 , 8]
                              ]
                    }
                });
                $scope.uiState = {selected : $scope.examples[0], hovered: null};
                $scope.getDisplayed = function() {
                    return $scope.uiState.hovered || $scope.uiState.selected;
                };
            }
        };
    });
    
    app.controller("PivotRecipeOutputColumnsController", function ($scope) {
        $scope.selection = $.extend({
            filterQuery: {
                userQuery: '',
                tags: [],
                interest: {},
            },
            filterParams: {
                userQueryTargets: ["name","type"],
                propertyRules: {},
            },
            orderQuery: null,
            orderReversed: false,
        }, $scope.selection || {});
    });
    
})();