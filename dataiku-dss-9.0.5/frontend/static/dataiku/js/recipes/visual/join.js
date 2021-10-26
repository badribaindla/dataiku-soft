(function() {
    'use strict';

    var app = angular.module('dataiku.recipes');

    app.controller("JoinRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $controller) {
        $scope.recipeType = "join";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_joined");
            }
        };

        $scope.getCreationSettings = function () {
            return {virtualInputs: [$scope.io.inputDataset, $scope.io.inputDataset2]};
        };

        var superFormIsValid = $scope.formIsValid;
        $scope.formIsValid = function() {
            return !!(superFormIsValid() &&
                $scope.io.inputDataset2 && $scope.activeSchema2 && $scope.activeSchema2.columns && $scope.activeSchema2.columns.length
            );
        };
        $scope.showOutputPane = function() {
            return !!($scope.io.inputDataset && $scope.io.inputDataset2);
        };
    });


    app.controller("JoinRecipeController", function ($scope, $timeout, $controller, $q, $stateParams, DataikuAPI, DKUtils, Dialogs,
                   PartitionDeps, CreateModalFromTemplate, RecipesUtils, Logger, DatasetUtils) {
        var visualCtrl = $controller('VisualRecipeEditorController', {$scope: $scope}); //Controller inheritance

        let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey:$stateParams.projectKey;
        /****** computed columns ********/
        function computedColumnListUpdated(computedColumns) {
            $scope.params.computedColumns = angular.copy(computedColumns);
            $scope.updateRecipeStatusLater();
        }

        var isOpen = false;
        $scope.setOpen = function (state) {
            isOpen = state;
        }
        $scope.isOpen = function () {
            return isOpen;
        }

        $scope.getColumnsWithComputed = function(datasetName) {
            if (!$scope.uiState.columnsWithComputed || !$scope.uiState.columnsWithComputed[datasetName]) {
                var columns = angular.copy($scope.getColumns(datasetName));
                var datasetIdx;
                RecipesUtils.getInputsForRole($scope.recipe, "main").forEach(function(input, idx){
                    if (input.ref === datasetName) {
                        datasetIdx = idx;
                    }
                });
                var hasVirtualInputs = $scope.params && $scope.params.virtualInputs;
                if (datasetIdx >= 0 && hasVirtualInputs) {
                    var computedColumns = ($scope.params.virtualInputs.find(vi => vi.index == datasetIdx) || {}).computedColumns;
                    if (computedColumns) {
                        for (var i = 0; i < computedColumns.length; i++) {
                            columns.push({
                                name: computedColumns[i].name,
                                type: computedColumns[i].type,
                                timestampNoTzAsDate: false,
                                maxLength: -1
                            });
                        }
                    }
                }
                $scope.uiState.columnsWithComputed = $scope.uiState.columnsWithComputed || {};
                $scope.uiState.columnsWithComputed[datasetName] = columns;
            }
            return $scope.uiState.columnsWithComputed[datasetName];
        };

        $scope.getColumnWithComputed = function(datasetName, name) {
            return $scope.getColumnsWithComputed(datasetName).filter(function(col){return col.name===name})[0];
        };

        /* callback given to the computed columns module */
        $scope.onComputedColumnListUpdate = computedColumnListUpdated;

        var savePayloadAsIsForDirtyness = true;
        $scope.hooks.getPayloadData = function () {
            if (!$scope.params) return;
            if (savePayloadAsIsForDirtyness) {
                savePayloadAsIsForDirtyness = false;
            } else {
                $scope.params.selectedColumns = $scope.getSelectedColumns();
            }
            // cleanup : - null values for alias
            var clean = angular.copy($scope.params);
            (clean.selectedColumns || []).forEach(function(c) {if (c.alias == null) delete c.alias;});
            return angular.toJson(clean);
        };

        var applyEngineLimitations = function(){
            if ($scope.params.joins) {
                var eng = $scope.recipeStatus.selectedEngine;
                if (eng != null && eng.canDeduplicateJoinMatches === false) {
                    $scope.params.joins.forEach(function(join){
                        if (join.rightLimit != null && join.rightLimit.enabled) {
                            Logger.warn("Deactivate rightLimit (deduplicate join matches) because of engine");
                            join.rightLimit.enabled = false;
                        }
                    });
                }
                $scope.params.joins.forEach(function(join){
                    if (join.rightLimit != null && join.rightLimit.enabled && $scope.hasNonSymmetricConditions(join)) {
                        Logger.warn("Deactivate rightLimit because (deduplicate join matches) of non equi-join");
                        join.rightLimit.enabled = false;
                    }
                });
            }
        };

        var removeUnusedInputs = function() {
            if (!$scope.params.virtualInputs) return;
            var usedIndices = [];
            $scope.params.virtualInputs.forEach(function(vi){
                if (usedIndices.indexOf(vi.index) < 0) {
                    usedIndices.push(vi.index);
                }
            });
            var newIndices = {};
            for(var i=0;i<$scope.recipe.inputs.main.items.length;i++) {
                newIndices[i] = usedIndices.filter(function(k) {return k < i;}).length;
            }
            $scope.recipe.inputs.main.items = $scope.recipe.inputs.main.items.filter(function(input, idx) {
                return usedIndices.indexOf(idx) >= 0;
            });
            $scope.params.virtualInputs.forEach(function(vi) {vi.index = newIndices[vi.index];});
        };

        $scope.onInputReplaced = function(replacement, virtualIndex) {
            var inputNames = RecipesUtils.getInputsForRole($scope.recipe, "main").map(function(input){return input.ref});
            var inputDesc = {index: inputNames.indexOf(replacement.name)};
            $scope.params.virtualInputs[virtualIndex] = inputDesc;
            removeUnusedInputs();
            DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                    .then(_ => $scope.resyncSchemas());
        }

        var updateCodeMirrorUI = function(){
            $('.CodeMirror').each(function(idx, el){
                el.CodeMirror.refresh();
            });
        };

        $scope.hooks.updateRecipeStatus = function(forceUpdate, exactPlan) {
            var payload = $scope.hooks.getPayloadData();
            if (!payload) return $q.reject("payload not ready");
            var deferred = $q.defer();
            $scope.updateRecipeStatusBase(forceUpdate, payload, {reallyNeedsExecutionPlan: exactPlan, exactPlan: exactPlan}).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) return deferred.reject();
                if ($scope.recipeStatus.outputSchema) {
                    $scope.params.postFilter = $scope.params.postFilter || {};
                    $scope.params.postFilter.$status = $scope.params.postFilter.$status || {};
                    $scope.params.postFilter.$status.schema = $scope.recipeStatus.outputSchema;
                }
                applyEngineLimitations();
                DKUtils.reflowLater();
                $timeout(updateCodeMirrorUI);
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        $scope.getJoinSuggestions = function() {
            var payload = $scope.hooks.getPayloadData();
            var recipeSerialized = angular.copy($scope.recipe);
            PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
            let fetchSuggestions = $scope.isFuzzy ? DataikuAPI.flow.recipes.fuzzyjoin.getSuggestions : DataikuAPI.flow.recipes.join.getSuggestions;
            return fetchSuggestions($stateParams.projectKey, recipeSerialized, payload)
                .success(function(suggestions) {
                    var lastJoin = $scope.params.joins[$scope.params.joins.length - 1];
                    if (suggestions.length > 0 ) {
                        // select everything available, let the user clean up later if he wants to
                        suggestions.forEach(function(condition) {condition.selected = true;});
                        $scope.addConditions(lastJoin, suggestions);
                        $scope.hooks.updateRecipeStatus();
                    }
                })
                .error(setErrorInScope.bind($scope));
        };

        $scope.canNonEquiJoin = function(join) {
            return $scope.recipeStatus && $scope.recipeStatus.selectedEngine != null && $scope.recipeStatus.selectedEngine.canNonEquiJoin;
        };

        $scope.showNewJoinModal = function() {
            CreateModalFromTemplate("/templates/recipes/visual-recipes-fragments/join-modal.html", $scope);
        };

        $scope.showJoinEditModal = function(join, tab) {
            $scope.setOpen(true);
            //check if the modal is already shown
            if (!$('#join-condition-modal').parent().hasClass('in')) {
                var newScope = $scope.$new();
                newScope.join = join;
                newScope.current = {};
                newScope.current.tab = tab || 'conditions'
                newScope.current.condition = null; //no selected condition when the modal is created
                newScope.showConditionRemove = true;

                if (!newScope.isFuzzy) {
                    newScope.join.rightLimit = newScope.join.rightLimit || {decisionColumn: {}};
                    const rl = newScope.join.rightLimit;
                    rl.maxMatches = rl.maxMatches || 1;
                    rl.enabled = (rl.enabled === true || rl.enabled === false) ? rl.enabled : false;
                    rl.type = rl.type || 'KEEP_LARGEST';
                }

                CreateModalFromTemplate("/templates/recipes/visual-recipes-fragments/join-edit-modal.html", newScope, $scope.isFuzzy ? "FuzzyJoinEditController" : "JoinEditController", (scope, el) => {
                    $timeout(() => {
                            scope.joinBlockBodyEl = el[0].getElementsByClassName('join-block-body')[0];
                        }
                    );
                });
            }
        };

        $scope.getSelectedColumns = function() {
            var outputSchema = [];
            if (!$scope.uiState || !$scope.uiState.selectedColumns) return;
            $scope.uiState.selectedColumns.forEach(function(datasetColumns, tableIndex) {
                datasetColumns.forEach(function(column) {
                    if(column.selected) {
                        outputSchema.push({
                            name: column.name,
                            alias: column.alias,
                            table: tableIndex,
                            type: column.type
                        });
                    }
                })
            });
            return outputSchema;
        };

        $scope.addDataset = function(datasetName) {
            if (RecipesUtils.getInput($scope.recipe, "main", datasetName) == null) {
                RecipesUtils.addInput($scope.recipe, "main", datasetName);
            }
            var inputNames = RecipesUtils.getInputsForRole($scope.recipe, "main").map(function(input){return input.ref});
            var inputDesc = {
                index: inputNames.indexOf(datasetName)}
            ;
            $scope.params.virtualInputs.push(inputDesc);
            $scope.uiState.currentStep = 'join';
        }

        $scope.autoSelectColumns = function(inputDesc) {
            $scope.uiState.columnsWithComputed = undefined;
            //Auto select columns that do not conflict
            $scope.params.selectedColumns = $scope.params.selectedColumns || [];
            var selectedNames = $scope.params.selectedColumns.map(function(col){
                return $scope.getColumnOutputName(inputDesc, col).toLowerCase();
            });

            var selectColumn = function(columnName) {
                $scope.params.selectedColumns.push({
                    name: columnName,
                    table: $scope.params.virtualInputs.length-1
                });
            }

            var datasetName = $scope.outputDatasetName;
            var excludedColumnNames = [];
            if ($scope.computablesMap && datasetName && $scope.computablesMap[datasetName] && $scope.computablesMap[datasetName].dataset) {
                var dataset = $scope.computablesMap[datasetName].dataset;
                if (dataset.type == 'HDFS') {
                    if (dataset.partitioning && dataset.partitioning.dimensions.length > 0) {
                        dataset.partitioning.dimensions.forEach(function(p) {excludedColumnNames.push(p.name);});
                    }
                }
            }

            $scope.getColumnsWithComputed($scope.getDatasetNameFromRecipeInputIndex(inputDesc.index)).forEach(function(column) {
                var outputName = $scope.getColumnOutputName(inputDesc, {
                    name: column.name
                });
                if (selectedNames.indexOf(outputName.toLowerCase()) < 0 && !excludedColumnNames.includes(column.name)) { //no conflict
                    selectColumn(column.name);
                }
            });

            createColumnList();
        }

        var removeDatasets = function(indices) {
            indices.sort().reverse();
            indices.forEach(function(index) {
                $scope.params.joins = $scope.params.joins.filter(function(join) {
                    return join.table1 != index && join.table2 != index;
                });
                $scope.params.joins.forEach(function(join) {
                    if (join.table1 > index) {
                        join.table1--;
                        join.on.forEach(function(condition){
                            condition.column1.table--;
                        })
                    }
                    if (join.table2 > index) {
                        join.table2--;
                        join.on.forEach(function(condition){
                            condition.column2.table--;
                        })
                    }
                });
                $scope.params.selectedColumns = $scope.params.selectedColumns.filter(function(column) {
                    return column.table != index;
                });
                $scope.params.selectedColumns.forEach(function(column) {
                    if(column.table > index) {
                        column.table--;
                    }
                });

                var datasetName = $scope.getDatasetNameFromRecipeInputIndex($scope.params.virtualInputs[index].index);
                var numberOfUses = $scope.params.virtualInputs.filter(function(table) {
                    return table.name == datasetName;
                }).length;
                if (numberOfUses == 1) {
                    RecipesUtils.removeInput($scope.recipe, "main", datasetName);
                    $scope.params.virtualInputs.forEach(function(vi) {
                        if (vi.index > index) {
                            vi.index--;
                        }
                    });
                }

                $scope.params.virtualInputs.splice(index, 1);
                $scope.uiState.selectedColumns.splice(index, 1);
            });

            $scope.hooks.updateRecipeStatus();

            if ($scope.params.virtualInputs.length == 0) {
                $scope.showNewJoinModal();
            }
        };

        var getDependantDatasets = function(index) {
            var dependantDatasets = [];
            for(var i = 0; i < $scope.params.joins.length; i++) {
                var join = $scope.params.joins[i];
                if (join.table1 == index) {
                    dependantDatasets.push(join.table2);
                    dependantDatasets = dependantDatasets.concat(getDependantDatasets(join.table2))
                }
            }
            return dependantDatasets;
        };

        $scope.removeDataset = function(index) {
            var datasetsToBeRemoved = getDependantDatasets(index);
            datasetsToBeRemoved.push(index);
            if (datasetsToBeRemoved.length == 1) {
                removeDatasets(datasetsToBeRemoved);
            } else {
                var datasetList = datasetsToBeRemoved.map(function(index) {
                    return $scope.getDatasetNameFromRecipeInputIndex($scope.params.virtualInputs[index].index);
                })
                Dialogs.confirm($scope,
                    'Remove datasets',
                    'The following datasets will be removed from the recipe:'+
                    '<ul><li>'+datasetList.join('</li><li>')+'</li></ul>'
                )
                .then(function() {
                     removeDatasets(datasetsToBeRemoved);
                });
            }
        };

        // gets the dataset name from the index within the virtual inputs
        $scope.getDatasetName = function(virtualIndex) {
            var dataset = $scope.params.virtualInputs[virtualIndex];
            return $scope.getDatasetNameFromRecipeInputIndex(dataset.index);
        };

        // gets the dataset name from the index within the recipe's inputs
        $scope.getDatasetNameFromRecipeInputIndex = function(index) {
            var input = $scope.recipe.inputs.main.items[index];
            return input ? input.ref : "";
        };

        var createColumnList = function() {
            var selectedColumns = (($scope.params || {}).virtualInputs || []).map(function() {return {};});
            if ($scope.params.selectedColumns) {
                $scope.params.selectedColumns.forEach(function(column) {
                    selectedColumns[column.table][column.name] = column.alias || null;
                });
            }

            var columnList = [];
            (($scope.params || {}).virtualInputs || []).forEach(function(inputDesc, index) {
                var inputColumns = $scope.getColumnsWithComputed($scope.getDatasetNameFromRecipeInputIndex(inputDesc.index)).map(function(column) {
                    var alias = selectedColumns[index][column.name];
                    return {
                        name: column.name,
                        type: column.type,
                        maxLength: column.maxLength,
                        selected: alias !== undefined,
                        alias: alias
                    }
                });
                columnList.push(inputColumns);
            });
            $scope.uiState.selectedColumns = columnList;
        };

        $scope.resyncSchemas = function() {
            $scope.uiState.columnsWithComputed = undefined;
            // regenerated selected columns (drop columns that don't exist anymore)
            createColumnList();

            // remove join conditions if the columns do not exist anymore
            $scope.params.joins.forEach(function(join){
                var dataset1 = $scope.getDatasetNameFromRecipeInputIndex($scope.params.virtualInputs[join.table1].index);
                var dataset2 = $scope.getDatasetNameFromRecipeInputIndex($scope.params.virtualInputs[join.table2].index);
                var columns1 = ($scope.getColumnsWithComputed(dataset1)||[]).map(function(col){return col.name});
                var columns2 = ($scope.getColumnsWithComputed(dataset2)||[]).map(function(col){return col.name});
                join.on = join.on.filter(function(cond){
                    if (!columns1 || !columns2 || columns1.indexOf(cond.column1.name) < 0 || columns2.indexOf(cond.column2.name) < 0) {
                        return false;
                    }
                    return true;
                })
            });
        };

        $scope.getColumnList = function(index) {
            return $scope.uiState.selectedColumns[index];
        };

        $scope.getColumnOutputName = function(inputDesc, column) { //TODO compute on server
            if (column.alias) {
                return column.alias;
            } else if (inputDesc.prefix) {
                return inputDesc.prefix + '_' + column.name;
            } else {
                return column.name;
            }
        };

        $scope.hasNonSymmetricConditions = function(join) {
            if (!join || !join.on) {
                return false;
            }
            var asymetricConditions = ['K_NEAREST', 'K_NEAREST_INFERIOR'];
            for (var i = 0; i < join.on.length; ++i) {
                if (asymetricConditions.indexOf(join.on[i].type) >= 0) {
                    return true;
                }
            }
            return false;
        };

        $scope.addEmptyCondition = function(join, current) {
            var newCondition = {
                column1: {
                    table: join.table1,
                    name: $scope.getColumnsWithComputed($scope.getDatasetName(join.table1))[0].name
                },
                column2: {
                    table: join.table2,
                    name: $scope.getColumnsWithComputed($scope.getDatasetName(join.table2))[0].name
                },
                type: 'EQ'
            };
            join.on = join.on || [];
            join.on.push(newCondition);
            if (current) {
                current.condition = newCondition;
            }
        };

        $scope.addConditions = function(join, conditions) {
            conditions.forEach(function(condition){
                if (condition.selected) {
                    delete condition.selected;
                    join.on.push(condition);
                }
            });
            $scope.updateRecipeStatusLater(0);
        };

        $scope.removeCondition = function(scope, join, condition) {
            if ( scope.current != null && scope.current.condition == condition ) {
                scope.current.condition = null;
            }
            var index = join.on.indexOf(condition);
            join.on.splice(index, 1);
            $scope.hooks.updateRecipeStatus();
        };

        $scope.removeAllConditions = function(scope, join) {
            if ( scope.current != null ) {
                scope.current.condition = null;
            }
            join.on = [];
            $scope.hooks.updateRecipeStatus();
            $scope.setOpen(true);
        };

        $scope.range = function(n) {
            return Array.apply(null, Array(n)).map(function(_, i) {return i;});
        };

        $scope.getConditionString = function(condition) {
            var col1 = condition.column1.name,
                col2 = condition.column2.name,
                dataset1 = $scope.getDatasetNameFromRecipeInputIndex($scope.params.virtualInputs[condition.column1.table].index),
                dataset2 = $scope.getDatasetNameFromRecipeInputIndex($scope.params.virtualInputs[condition.column2.table].index);
            switch(condition.type) {
                case 'EQ':
                    return dataset1+'.'+col1+' = '+dataset2+'.'+col2;
                case 'WITHIN_RANGE':
                    return 'abs('+dataset2+'.'+col2+' - '+dataset1+'.'+col1+') < '+condition.maxDistance;
                case 'K_NEAREST':
                    return dataset2+'.'+col2+' is the nearest match for '+dataset1+'.'+col1+(condition.strict ? '(strict)' : '');
                case 'K_NEAREST_INFERIOR':
                    return dataset2+'.'+col2+' is the nearest match before '+dataset1+'.'+col1+(condition.strict ? '(strict)' : '');
                case 'CONTAINS':
                    return dataset1+'.'+col1+' contains '+dataset2+'.'+col2;
                case 'STARTS_WITH':
                    return dataset1+'.'+col1+' contains '+dataset2+'.'+col2;
                case 'LTE':
                    return dataset1+'.'+col1+' is before '+dataset2+'.'+col2;
                case 'GTE':
                    return dataset1+'.'+col1+' is after '+dataset2+'.'+col2;
                case 'NE':
                    return dataset1+'.'+col1+' different from '+dataset2+'.'+col2;
            }
        };

        $scope.onFilterUpdate = function(filterDesc) {
            $scope.updateRecipeStatusLater();
        };

        $scope.listColumnsForCumstomColumnsEditor = function(){
            return scope.getSelectedColumns().map(function(c){
                var inputDesc = scope.params.virtualInputs[c.table];
                return scope.getColumnOutputName(inputDesc, c);
            });
        };

        $scope.$watch("params.postFilter.expression", $scope.updateRecipeStatusLater);
        $scope.$watch("params.postFilter.enabled", $scope.updateRecipeStatusLater);
        $scope.$watch("params.virtualInputs", $scope.updateRecipeStatusLater, true);

        var matchingTypeName = {
            'EQ': '=',
            'WITHIN_RANGE': '~',
            'K_NEAREST': '~',
            'NEAREST_INFERIOR': '~',
            'CONTAINS': '~',
            'STARTS_WITH': '~',
            'LTE': '<=',
            'LT': '<',
            'GTE': '>=',
            'GT': '>',
            'NE': '!='
        };

        $scope.isRelativeDistance = function (condition) {
            return angular.isNumber(condition.fuzzyMatchDesc.relativeTo);
        };

        $scope.getMatchingTypeSymbol = function(condition) {
            if ($scope.isFuzzy) {
                const fuzzyMatchDesc = condition.fuzzyMatchDesc;
                let threshold = fuzzyMatchDesc.threshold;
                if (!fuzzyMatchDesc || !angular.isNumber(threshold)) return '?';
                if (fuzzyMatchDesc.distanceType === 'EXACT') return '=';
                if ($scope.isRelativeDistance(condition)) {
//                  Rounding to avoid long decimal tail after floating point math operations e.g. 0.072*100=7.199999999999999
                    threshold = Math.round((threshold * 100) * 10 ** 12) / 10 ** 12;
                    return `${threshold} %`;
                } else {
                    return threshold.toString();
                }
            } else {
                const type = condition.type;
                if (matchingTypeName.hasOwnProperty(type)) {
                    return matchingTypeName[type];
                }
            }
        };

        $scope.getDatasetColorClass = function(datasetIndex) {
            return 'dataset-color-'+(datasetIndex%6);
        };

        $scope.getJoinTypeName = function(join) {
            if (join.type) {
                var name = (join.conditionsMode == 'NATURAL' && join.type != 'ADVANCED' && join.type != 'CROSS' ? 'Natural ' : '') + join.type + ' join';
                return name.charAt(0).toUpperCase() + name.substr(1).toLowerCase()
            }
        };

        function onScriptChanged(nv, ov) {
            if (nv) {
                $scope.params = JSON.parse($scope.script.data);
                $scope.params.computedColumns = $scope.params.computedColumns || [];
                $scope.uiState.computedColumns = angular.copy($scope.params.computedColumns);
                $scope.uiState.columnsWithComputed = undefined;
                savePayloadAsIsForDirtyness = true;
                visualCtrl.saveServerParams(); //keep for dirtyness detection
                createColumnList();
                $scope.hooks.updateRecipeStatus();
                DKUtils.reflowLater();
                if ($scope.params.joins && $scope.params.joins.length > 0 && $scope.params.joins[$scope.params.joins.length-1].on.length == 0) {
                    $scope.getJoinSuggestions();
                    var lastJoin = $scope.params.joins[$scope.params.joins.length-1];
                    var lastInputDesc = $scope.params.virtualInputs[lastJoin.table2];
                    $scope.autoSelectColumns(lastInputDesc);
                }
            }
        };

        $scope.$watchCollection("recipe.outputs.main.items", function() {
            var outputs = RecipesUtils.getOutputsForRole($scope.recipe, "main");
            if (outputs.length == 1) {
                $scope.outputDatasetName = outputs[0].ref;
            }
            $scope.updateRecipeStatusLater();
        });

        $scope.$watchCollection("params.virtualInputs", removeUnusedInputs);
        $scope.$watch("params.virtualInputs", function() {
            $scope.uiState.columnsWithComputed = undefined;
            DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, contextProjectKey)
                    .then(_ => createColumnList());
        }, true);

        $scope.hooks.onRecipeLoaded = function() {
            Logger.info("On Recipe Loaded");
            $scope.$watch("script.data", onScriptChanged);
            // the onScriptChanged will be called because adding a $watch on the scope triggers an 'initialization' run
        };

        $scope.specificControllerLoadedDeferred.resolve();

        $scope.params = $scope.params || {};
        $scope.enableAutoFixup();
        $scope.uiState = {
            currentStep: 'join',
            computedColumns: []
        };
    });


    app.controller("NewJoinController", function ($scope, DataikuAPI, $q, $stateParams, Dialogs, DatasetUtils) {
        $scope.params.virtualInputs = $scope.params.virtualInputs || [];
        $scope.creation = !$scope.params.virtualInputs || !$scope.params.virtualInputs.length;
        $scope.newJoin = {
            table1Index: 0
        };

        $scope.joinIsValid = function() {
            return !!(($scope.newJoin.dataset1 || $scope.newJoin.table1Index != null) && $scope.newJoin.dataset2);
        };

        $scope.addJoin = function() {
            if ($scope.creation) {
                $scope.newJoin.table1Index = 0;
                $scope.addDataset($scope.newJoin.dataset1);
            }

            let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey:$stateParams.projectKey;
            DatasetUtils.updateDatasetInComputablesMap($scope, $scope.newJoin.dataset2, $stateParams.projectKey, contextProjectKey)
            .then(() => {
                if (!$scope.dataset2IsValid($scope.newJoin.dataset2)) {
                    return;
                }
                $scope.newJoin.table2Index = $scope.params.virtualInputs.length;

                $scope.addDataset($scope.newJoin.dataset2);

                var join = {
                    table1: $scope.newJoin.table1Index,
                    table2: $scope.newJoin.table2Index,
                    type: 'LEFT',
                    conditionsMode : 'AND',
                    on: [],
                    outerJoinOnTheLeft: true, // just for ADVANCED join type
                    rightLimit: {}
                };
                $scope.params.joins = $scope.params.joins || [];
                $scope.params.joins.push(join);
                $scope.dismiss();
                $scope.getJoinSuggestions();

                var table2Input = $scope.params.virtualInputs[$scope.newJoin.table2Index];
                $scope.autoSelectColumns(table2Input);
            });
        };

        $scope.dataset2IsValid = function(datasetName) {
            if (!datasetName) {
                return false;
            }
            const computable = $scope.computablesMap[datasetName];
            if (!computable) {
                $scope.error = 'Dataset '+datasetName+' does not seem to exist, try reloading the page.';
                return false;
            }
            if (!computable.dataset) {
                $scope.error = datasetName+' is not a dataset';
                return false;
            }
            if (!computable.dataset.schema || !computable.dataset.schema.columns.length) {
                $scope.error = 'Dataset '+datasetName+' has an empty schema';
                return false;
            }
            return true;
        };

        $scope.$on('$destroy', function() {
            $scope.updateRecipeStatusLater(0);
        });

        DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, "join").then(function(data){
            $scope.availableInputDatasets = data[0];
        });
    });

    /*
    Controller for join edit modal
    */
    app.controller("JoinEditController", function ($scope, CodeMirrorSettingService) {
        $scope.uiState = $scope.uiState || {};

        if (($scope.join.on.length == 0) && (!$scope.inFuzzy)){
            $scope.addEmptyCondition($scope.join);
            $scope.current.condition = $scope.join.on[0];
        }

        //TODO @join add $right, $left in autocompletion
        $scope.sqlEditorOptions = CodeMirrorSettingService.get('text/x-sql');
        $scope.sqlEditorOptions.autofocus = true;

        $scope.updateDecisionColumn = function() {
            var decisionColumn = $scope.join.rightLimit.decisionColumn;
            $scope.join.rightLimit.decisionColumn = {
                name: $scope.uiState.decisionColumnName,
                table: $scope.join.table2
            };
            $scope.hooks.updateRecipeStatus();
        };

        // getColumn: 1 or 2
        $scope.getColumn = function (condition, columnIdx) {
            const col = !columnIdx || columnIdx === 1 ? 'column1' : 'column2';
            return $scope.getColumnWithComputed($scope.getDatasetNameFromRecipeInputIndex($scope.params.virtualInputs[condition[col].table].index), condition[col].name);
        };

        $scope.hasStringOperand = function(condition, columnIdx) {
            const col = $scope.getColumn(condition, columnIdx);
            return col && col.type === 'string';
        };

        $scope.hasNumOperand = function(condition, columnIdx) {
            const col = $scope.getColumn(condition, columnIdx);
            return col && ['tinyint', 'smallint', 'int', 'bigint', 'float', 'double'].includes(col.type);
        };

        $scope.hasDateOperand = function(condition, columnIdx) {
            const col = $scope.getColumn(condition, columnIdx);
            return col && col.type === 'date';
        };

        $scope.hasGeoOperand = function(condition, columnIdx) {
            const col = $scope.getColumn(condition, columnIdx);
            return col && col.type === 'geopoint';
        };

        $scope.setJoinType = function(join, type) {
            join.type = type;
        };

        /* on operand change, make sure the condition type makes sense, if not fall back to = condition */
        var updateOperandType = function() {
            var condition = $scope.current.condition;
            if (!condition) {
                return;
            }
            var numOrDateJoinType = ['EQ', 'K_NEAREST', 'K_NEAREST_INFERIOR', 'WITHIN_RANGE', 'LTE', 'GTE', 'NE'];
            var stringJoinType = ['EQ', 'CONTAINS', 'STARTS_WITH', 'LTE', 'GTE', 'NE'];
            if (($scope.hasNumOperand(condition) || $scope.hasDateOperand(condition)) && numOrDateJoinType.indexOf(condition.type) < 0) {
                condition.type = 'EQ';
            } else if ($scope.hasStringOperand(condition) && stringJoinType.indexOf(condition.type) < 0) {
                condition.type = 'EQ';
            }
        };
        if (!$scope.isFuzzy) {
            $scope.$watch('current.condition.column1.name', updateOperandType);
            $scope.$watch('current.condition.column2.name', updateOperandType);
        }
        $scope.$on('$destroy', function() {
            $scope.updateRecipeStatusLater(0);
        });
    });

    var app = angular.module('dataiku.directives.widgets');

    app.directive('fuzzyJoinConditionSettings', function () {
        return {
            templateUrl: 'templates/recipes/fragments/join-condition-settings.html',
            link: function ($scope, element, attrs) {
                $scope.$watch('[current.condition.column1.name, current.condition.column2.name]', function (nv, ov) {
                    if (nv !== ov) {
                        $scope.guessDistanceType($scope.current.condition);
                    }
                });
                $scope.$watch('isRelativeDistance(current.condition)', function (nv, ov) {
                    if (angular.isDefined(nv) && angular.isDefined(ov) && nv !== ov) {
                        $scope.setInitialThreshold($scope.current.condition);
                    }
                });
            }
        };
    });

    /*
    this directive creates an element representing a join between two datasets
    */
    app.directive('joinBlock', function() {
        return {
            restrict: 'EA',
            scope: true,
            templateUrl: '/templates/recipes/fragments/join-block.html',
            link : function(scope, element, attrs) {
                scope.onConditionClicked = function (join, condition) {
                    if (attrs.onConditionClicked) {
                        if (!scope.current || scope.current.condition !== condition) {
                            var newScope = scope.$new();
                            newScope.join = join;
                            newScope.condition = condition;
                            newScope.$eval(attrs.onConditionClicked);
                        } else {
                            scope.current.condition = null;
                        }
                    }
                };
            }
        };
    });

    app.directive('joinBlockDropdownJoin', function() {
        return {
            restrict: 'EA',
            scope: true,
            templateUrl: '/templates/recipes/fragments/join-block-dropdown-join.html',
            link : function(scope, element, attrs) {
                scope.getJoinTypes = function() {
                    if (scope.isFuzzy) {
                        return ['LEFT', 'INNER', 'FULL', 'RIGHT'];
                    } else {
                        return ['LEFT', 'INNER', 'FULL', 'RIGHT', 'CROSS', 'ADVANCED'];
                    }
                };
                scope.joinTypes = scope.getJoinTypes();

                scope.getClass = function(type) {
                    if (type !== 'FULL') {
                        return `{selected: join.type == '${type}'}`;
                    } else {
                        return "{selected: join.type == 'FULL', disabled: !recipeStatus.selectedEngine.canFullOuterJoin}"
                    }
                }

                scope.getIconType = function (type) {
                    switch (type) {
                        case 'LEFT': return "icon-jointype-left"; break;
                        case 'INNER': return "icon-jointype-inner"; break;
                        case 'FULL': return "icon-jointype-outer"; break;
                        case 'RIGHT': return "icon-jointype-right"; break;
                        case 'CROSS': return "icon-jointype-cross"; break;
                        case 'ADVANCED': return "icon-jointype-advanced"; break;
                    }
                };


                scope.getTypeType = function (type) {
                    switch (type) {
                        case 'LEFT': return "Left Join"; break;
                        case 'INNER': return "Inner join"; break;
                        case 'FULL': return "Outer join"; break;
                        case 'RIGHT': return "Right join"; break;
                        case 'CROSS': return "Cross join"; break;
                        case 'ADVANCED': return "Advanced join"; break;
                    }
                };

                scope.getDescriptionType = function (type) {
                    switch (type) {
                        case 'LEFT': return "Keep all rows of the left dataset and add information from the right dataset"; break;
                        case 'INNER': return "Keep matches and drop rows without match from both datasets"; break;
                        case 'FULL': return "Keep all matches and keep rows without match from both datasets"; break;
                        case 'RIGHT': return "Keep all matches and keep rows without match from the right dataset"; break;
                        case 'CROSS': return "Cartesian product : match all rows of the left dataset with all rows of the right dataset"; break;
                        case 'ADVANCED': return "Custom options for rows selection and deduplication"; break;
                    }
                };
                scope.setJoinType = function(join, type) {
                    join.type = type;
                    if (!scope.isOpen() && (type != 'CROSS')) {
                        scope.showJoinEditModal(join);
                    }
                };
                scope.isSafari = function() {
                    var ua = navigator.userAgent.toLowerCase();
                    if (ua.indexOf('safari') != -1) {
                      if (ua.indexOf('chrome') > -1) {
                        return false;
                      } else {
                        return true; // Safari
                      }
                    } else {
                        return false;
                    }
                }
                scope.getCSSStyle = function(join) {
                    if (scope.isSafari()) {
                        return "";
                    } else {
                        return "background-image: linear-gradient(to right, "+ scope.getRealColor(join.table1) + " 50%,  " + scope.getRealColor(join.table2) + " 50%);" +
                                "background-clip: text;" +
                                "-webkit-background-clip: text;" +
                                "-moz-background-clip: text;" +
                                "-webkit-text-fill-color: transparent;" +
                                "color: transparent;" +
                                "display: inline;"
                    }
                };

                scope.getRealColor = function (index) {
                    // Grab color from visual-recipes (and color-variable.less)
                    switch (index%6) {
                        case 0: return "#28A9DD";break;
                        case 1: return "#29AF5D";break;
                        case 2: return "#8541AA";break;
                        case 3: return "#F44336";break;
                        case 4: return "#4785A4";break;
                        case 5: return "#F28C38";break;
                    }
                }

            }
        }
    });
    app.directive('joinBlockEmpty', function() {
        return {
            restrict: 'EA',
            scope: true,
            templateUrl: '/templates/recipes/fragments/join-block-empty.html',
            link : function(scope, element, attrs) {
                scope.onConditionClicked = function (join, condition) {
                    if (attrs.onConditionClicked) {
                        if (!scope.current || scope.current.condition !== condition) {
                            var newScope = scope.$new();
                            newScope.join = join;
                            newScope.condition = condition;
                            newScope.$eval(attrs.onConditionClicked);
                        } else {
                            scope.current.condition = null;
                        }
                    }
                };
            }
        };
    });

    /*
    Widget to select columns from input dataset and edit their output names
    */
    app.directive('selectedColumnsEditor', function($timeout) {
        return {
            restrict: 'EA',
            scope: true,
            link : function(scope, element, attrs) {
                var getColumns = function() {
                    return scope.$eval(attrs.columns);
                };

                var getExpectedFinalColumnName = function(name) {
                    if (scope.input && scope.input.prefix) {
                        return scope.input.prefix + '_' + name;
                    } else {
                        return name;
                    }
                }

                scope.editColumnAlias = function(columnIndex, column) {
                    scope.currentEditedColumn = column;
                    $timeout(function(){$('.alias-editor', element).get(columnIndex).focus();});
                };

                scope.endColumnEdition = function() {
                    var col = scope.currentEditedColumn;
                    var expected = getExpectedFinalColumnName(col ? col.name : '');
                    if (col && col.alias == expected) {
                        delete col.alias;
                    }
                    scope.currentEditedColumn = null;
                    scope.hooks.updateRecipeStatus();
                };

                scope.keyDownOnAliasBox = function(event) {
                   if (event.keyCode == 13 || event.keyCode == 27){//enter or esc
                        scope.endColumnEdition();
                   }
                };

                scope.updateSelectAll = function() {
                    $.each(getColumns(), function(idx, column) {
                        column.selected = scope.selected.all;
                    });
                    scope.selected.any = scope.selected.all;
                    scope.hooks.updateRecipeStatus();
                };

                var updateGlobalSelectionStatus = function() {
                    var all = true, any = false;
                    $.each(getColumns(), function(idx, column) {
                        if (column.selected) {
                            any = true;
                        } else {
                            all = false;
                        }
                    });
                    scope.selected = {
                        all: all, any: any
                    };
                };

                scope.onSelectionChange = function() {
                    updateGlobalSelectionStatus();
                    scope.hooks.updateRecipeStatus();
                };

                scope.hasDuplicates = function (datasetIndex, column) {
                    if (!scope.recipeStatus || !scope.recipeStatus.selectedColumns || !scope.recipeStatus.selectedColumns.duplicates)
                        return false;
                    if (!column.selected)
                        return false;
                    var duplicates = scope.recipeStatus.selectedColumns.duplicates;
                    for (var i = 0; i < duplicates.length; ++i) {
                        var duplicate = duplicates[i];
                        if (
                            duplicate.dataset1 == datasetIndex && duplicate.column1 == column.name
                            ||
                            duplicate.dataset2 == datasetIndex && duplicate.column2 == column.name
                        ) {
                            return true;
                        }
                    }
                    return false;
                };

                updateGlobalSelectionStatus();
            }
        };
    });
})();
