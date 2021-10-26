(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("VStackRecipeCreationController", function($scope, $controller, $stateParams, DataikuAPI, Fn, RecipeComputablesService) {
        $scope.recipeType = "vstack";
        $scope.recipe = {
            type: 'vstack',
            projectKey: $stateParams.projectKey,
            inputs: {
                main: {
                    items: []
                }
            },
            outputs: {
                main: {
                    items: []
                }
            }
        };

        RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map) {
            $scope.setComputablesMap(map);
        });

        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_stacked");
            }
        };

        $scope.getCreationSettings = function () {
            return {virtualInputs: $scope.recipe.inputs.main.items.map(input => input.ref)};
        };


        $scope.formIsValid = function() {
            return $scope.recipe.inputs.main.items.length &&
            (
                $scope.io.newOutputTypeRadio == 'create' && $scope.newOutputDataset && $scope.newOutputDataset.name && $scope.newOutputDataset.connectionOption && $scope.isDatasetNameUnique($scope.newOutputDataset.name)
                || $scope.io.newOutputTypeRadio == 'select' && $scope.io.existingOutputDataset
            );
        };

        $scope.showOutputPane = function() {
            return $scope.recipe.inputs.main.items.length > 0;
        };

        $scope.$watchCollection('recipe.inputs.main.items', function(nv) {
            if (nv && nv.length) {
                $scope.io.inputDataset = nv[0].ref;
            }
        })
    });


    app.controller("VStackRecipeController", function ($scope, $controller, $q, $stateParams, DataikuAPI, Dialogs, PartitionDeps,
        CreateModalFromTemplate, RecipesUtils, Logger, DatasetUtils) {
        var visualCtrl = $controller('VisualRecipeEditorController', {$scope: $scope});

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
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        $scope.hooks.getPayloadData = function () {
            if (!$scope.params) {
                return null;
            }
            var us = $scope.unionSchema || [];
        	if ($scope.params.mode != 'FROM_INDEX' && $scope.params.mode != 'REMAP') {
                $scope.params.selectedColumns = us.filter(function(column){
                    return column.selected;
                })
                .map(function(column) {
                    return column.name
                });
            }
            return angular.toJson($scope.params);
        };

        $scope.showNewInputModal = function() {
            CreateModalFromTemplate("/templates/recipes/fragments/virtual-input-modal.html", $scope);
        };

        $scope.selected = {
        };

        $scope.selectedFromIndex = {
        };

        $scope.addDataset = function(datasetName) {
            if (RecipesUtils.getInput($scope.recipe, "main", datasetName) == null) {
                RecipesUtils.addInput($scope.recipe, "main", datasetName);
            }
            var inputNames = RecipesUtils.getInputsForRole($scope.recipe, "main").map(function(input){return input.ref});
            var inputDesc = {
                index: inputNames.indexOf(datasetName),
                originLabel: datasetName,
                preFilter: {},
                columnsMatch: []
            };
            buildInitialColumnsMatchForInput(inputDesc);
            $scope.params.virtualInputs.push(inputDesc);
            updateUnionSchema();
            $scope.updateColumnsSelection();
            $scope.updateRecipeStatusLater();
        }

        $scope.removeDataset = function(index) {
            removeDatasets([index]);
        };

        $scope.updateSelectAllColumns = function() {
            for (let i = 0; i < $scope.unionSchema.length; i++) {
                if ($scope.unionSchema[i]) {
                    $scope.unionSchema[i].selected = $scope.selected.all;
                }
            }
            $scope.selected.any = $scope.selected.all;
        };

        $scope.updateSelectAllColumnsFromIndex = function() {
            for (let i = 0; i < $scope.getSelectableColumns.length; i++) {
                if (!$scope.selectedColumns[i]) {
                    $scope.selectedColumns[i] = {name: $scope.getSelectableColumns[i][0]};
                }
                $scope.selectedColumns[i].selected = $scope.selectedFromIndex.all;
            }
            $scope.selectedFromIndex.any = $scope.selectedFromIndex.all;
        };

        $scope.updateGlobalSelectionStatus = function() {
            var all = true, any = false;
            for (let i = 0; i < $scope.unionSchema.length; i++) {
                if ($scope.unionSchema[i] && $scope.unionSchema[i].selected) {
                    any = true;
                } else {
                    all = false;
                }
            }
            $scope.selected = {
                all: all, any: any
            };
            all = true;any=false;
            if ($scope.params.mode == 'FROM_INDEX') {
                for (let i = 0 ; i < $scope.getSelectableColumns.length; i++)  {
                    const selectableCol = $scope.getSelectableColumns[i];
                    const selCol = $scope.selectedColumns.find(col => col && selectableCol.indexOf(col.name) >= 0);
                    if (selCol && selCol.selected) {
                        any = true;
                    } else {
                        all = false;
                    }
                }
            } else {
                for (let i = 0 ; i < $scope.selectedColumns.length; i++) {
                    if ($scope.selectedColumns[i] && $scope.selectedColumns[i].selected) {
                        any = true;
                    } else {
                        all = false;
                    }
                }
            }
            $scope.selectedFromIndex = {
                all: all, any: any
            };
        };

        // gets the dataset name from the index within the virtual inputs
        $scope.getDatasetName = function(virtualIndex) {
            var dataset = $scope.params.virtualInputs[virtualIndex];
            return $scope.getDatasetNameFromRecipeInputIndex(dataset.index);
        };

        $scope.getColumnList = function(datasetIndex) {
            var selectedColumns;
            if (datasetIndex != null) {
                selectedColumns = $scope.getColumns($scope.getDatasetNameFromRecipeInputIndex(datasetIndex));
            } else {
                selectedColumns = [];
            }
            return selectedColumns;
        };

        $scope.selectedColumns = [];// Used to decouple from $scope.params.selectedColumns

        $scope.addColumn = function () {
            let newColumnName = null;
            // find a name that has not been used yet
            $scope.params.virtualInputs.forEach(function(virtualInput){
                if (newColumnName) return;
                let inputColumns = $scope.getColumns(virtualInput.originLabel);
                for (const inputColumn of inputColumns) {
                    if (virtualInput.columnsMatch.indexOf(inputColumn.name) == -1) {
                        if (!newColumnName) newColumnName = inputColumn.name;
                        break;
                    }
                }
            });
            if (!newColumnName) { // No valid name found, Col-X instead
                let idx = 1;
                let possibleColName = "Col-" + idx;
                while ($scope.params.selectedColumns.indexOf(possibleColName) != -1) {
                    idx++;
                    possibleColName = "Col-" + idx;
                }
                newColumnName = possibleColName;
            }
            $scope.params.selectedColumns = $scope.params.selectedColumns.slice(); // Will enforce ng2-values-list two-way data binding
            $scope.params.selectedColumns.push(newColumnName);
            $scope.unionSchema.push({'name':newColumnName, 'selected':true });
            $scope.params.virtualInputs.forEach(function(virtualInput) { // building an index based columnsMatch
                let inputColumns = $scope.getColumns(virtualInput.originLabel);
                let inputColumnName = inputColumns.map(function(col){return col.name});
                if (inputColumnName.indexOf(newColumnName) > -1) {
                    virtualInput.columnsMatch.push(newColumnName);
                } else {
                    virtualInput.columnsMatch.push(null);
                }
            });
        };

        $scope.removeColumn = function (columnIndex) {
            // We're not removing the item from params.selectedColumns as editable-list already does it.
            if (columnIndex > -1) {
                const colName = $scope.params.selectedColumns[columnIndex];
                ($scope.unionSchema.find(col => col.name == colName) || {}).selected = false;
                $scope.params.virtualInputs.forEach(virtualInput => {virtualInput.columnsMatch.splice(columnIndex, 1);})
            }
        };

        $scope.reorderColumns = function (event) {
            $scope.params.virtualInputs.forEach(virtualInput => {
                moveItemInArray(virtualInput.columnsMatch, event.previousIndex, event.currentIndex);
            })
        }

        $scope.removeAllColumns = function() {
            $scope.params.selectedColumns = [];
            $scope.params.selectedColumnsIndexes = [];
            $scope.params.virtualInputs.forEach(virtualInput => {virtualInput.columnsMatch = []});
            $scope.unionSchema.forEach(column => { column.selected = false });
        };

        $scope.sortableOptions = {
            stop: function(e, ui) {
                if (ui.item.sortable.dropindex != null) {
                    moveSelectableColumn(ui.item.sortable.index, ui.item.sortable.dropindex);
                }
            },
            axis:'y', cursor: 'move', cancel:'', handle: '.handle-row'
        };

        function moveSelectableColumn(initialIndex, targetIndex) {
            function shiftArray(inputArray, initialIndex, targetIndex) {
                if (inputArray) inputArray.splice(targetIndex, 0, inputArray.splice(initialIndex, 1)[0]);
            }
            shiftArray($scope.params.selectedColumns, initialIndex, targetIndex);
            shiftArray($scope.params.selectedColumnsIndexes, initialIndex, targetIndex);
            shiftArray($scope.selectedColumns, initialIndex, targetIndex);
            for (const virtualInput of $scope.params.virtualInputs) {
                shiftArray(virtualInput.columnsMatch, initialIndex, targetIndex);
            }
        }

        $scope.useAsReference = function(referenceIndex) {
            let selectedColumnsNames = [];
            $scope.params.copySchemaFromDatasetWithName = referenceIndex;
            let selectedColumns = $scope.getColumns($scope.params.copySchemaFromDatasetWithName);
            selectedColumnsNames = selectedColumns.map(col => col.name);
            updateSelectableColumns();
            $scope.params.selectedColumns = selectedColumnsNames;
            $scope.selectedColumns = [];
            $scope.params.selectedColumnsIndexes = [];
            for (let index in selectedColumnsNames) {
                $scope.selectedColumns.push({
                    name:selectedColumnsNames[index],
                    selected:true
                });
                $scope.params.selectedColumnsIndexes.push(index);
            }
            $scope.updateGlobalSelectionStatus();
        }

        $scope.syncSelectedColumns = function() {
            $scope.params.selectedColumns = [];
            $scope.params.selectedColumnsIndexes = [];
            for (let columnIndex = 0 ; columnIndex < $scope.selectedColumns.length; columnIndex++) {
                if (($scope.selectedColumns[columnIndex] || {}).selected) {
                    $scope.selectedColumns[columnIndex].name = $scope.selectedColumns[columnIndex].name || $scope.getSelectableColumns[columnIndex][0];
                    $scope.params.selectedColumns.push($scope.selectedColumns[columnIndex].name);
                    $scope.params.selectedColumnsIndexes.push(columnIndex);
                    $scope.unionSchema[columnIndex].selected = true;
                } else if ($scope.unionSchema[columnIndex]) {
                    $scope.unionSchema[columnIndex].selected = false;
                }
            }
        }

        function syncSelectors() {
            $scope.selectedColumns = [];
            for (let columnIndex in $scope.params.selectedColumns) {
                let targetColumn = $scope.params.selectedColumnsIndexes[columnIndex];
                $scope.selectedColumns[targetColumn] = {};
                $scope.selectedColumns[targetColumn].selected = true;
                $scope.selectedColumns[targetColumn].name = $scope.params.selectedColumns[columnIndex];
            }
        }

        $scope.updateNewSchema = function(obj){
            $scope.params.selectedColumns = [];
        }

        $scope.columnsSelection = {};

        // gets the dataset name from the index within the recipe's inputs
        $scope.getDatasetNameFromRecipeInputIndex = function(index) {
            var input = $scope.recipe.inputs.main.items[index];
            return input ? input.ref : "";
        };

        $scope.getDatasetColorClass = function(datasetIndex) {
            return 'dataset-color-'+(datasetIndex%6);
        };

        $scope.updateColumnsSelection = function() {
            // clear the columnsMatch value in each input if the mode is not REMAP
            if ($scope.params.mode != 'REMAP') {
                $scope.params.virtualInputs.forEach(vi => { delete vi.columnsMatch; });
            }

            if ($scope.params.mode == 'CUSTOM') {
                return;
            } else if ($scope.params.mode == 'UNION') {
                $scope.params.selectedColumns = $scope.unionSchema.map(function(col) {
                    return col.name;
                });
            } else {
                var selectedColumnsNames = [];
                if ($scope.params.mode == 'FROM_DATASET') {
                    $scope.params.copySchemaFromDatasetWithName = $scope.params.copySchemaFromDatasetWithName || $scope.recipe.inputs.main.items[0].ref;
                    let selectedColumns = $scope.getColumns($scope.params.copySchemaFromDatasetWithName);
                    selectedColumnsNames = selectedColumns.map(col => col.name);
                } else if ($scope.params.mode == 'FROM_INDEX') {
                    if ($scope.params.selectedColumnsIndexes && $scope.params.selectedColumns
                        && $scope.params.selectedColumnsIndexes.length == $scope.params.selectedColumns.length) {
                        selectedColumnsNames = $scope.params.selectedColumns;
                    } else {
                        $scope.params.copySchemaFromDatasetWithName = $scope.params.copySchemaFromDatasetWithName || $scope.recipe.inputs.main.items[0].ref;
                        let selectedColumns = $scope.getColumns($scope.params.copySchemaFromDatasetWithName);
                        selectedColumnsNames = selectedColumns.map(col => col.name);
                        $scope.useAsReference($scope.params.copySchemaFromDatasetWithName);
                    }
                    updateSelectableColumns();
                    syncSelectors();
                    let maxColNb = 0;
                    for (let i = 0; i < $scope.recipe.inputs.main.items.length; i++) {
                        maxColNb = Math.max(maxColNb, $scope.getColumns($scope.recipe.inputs.main.items[i].ref).length);
                    }
                    $scope.selectedColumns.forEach((col, idx) => { if (idx >= maxColNb) { col.selected = false; } });
                } else if ($scope.params.mode == 'REMAP') {
                    $scope.params.copySchemaFromDatasetWithName = $scope.params.copySchemaFromDatasetWithName || $scope.recipe.inputs.main.items[0].ref;
                    $scope.columnsSelection.possibleColumnNames = $scope.columnsSelection.possibleColumnNames || []
                    let selectedColumns = $scope.getColumns($scope.params.copySchemaFromDatasetWithName);
                    if ($scope.params.selectedColumns) {
                        selectedColumnsNames = $scope.params.selectedColumns;
                        $scope.unionSchema.forEach(col => { col.selected = false })
                    } else {
                        selectedColumnsNames = selectedColumns.map(col => col.name);
                    }
                    buildInitialColumnsMatch(selectedColumnsNames);
                } else if ($scope.params.mode == 'INTERSECT') {
                    let allInputs = RecipesUtils.getFlatInputsList($scope.recipe);
                    let selectedColumns = $scope.getColumns(allInputs[0].ref);
                    selectedColumnsNames = selectedColumns.map(col => col.name);
                    for (var i = 1; i < allInputs.length; i++) {
                        var columnNames = $scope.getColumns(allInputs[i].ref).map(function(col){return col.name;});
                        for (var c = selectedColumnsNames.length - 1; c >= 0; c--) {
                            if (columnNames.indexOf(selectedColumnsNames[c]) < 0) {
                                selectedColumnsNames.splice(c, 1);
                            }
                        }
                    }
                }
                $scope.params.selectedColumns = selectedColumnsNames;
            }
            updateSelectedColumns();
            $scope.updateGlobalSelectionStatus(); // keep "select all" checkbox synchronised
        };

        $scope.isColumnsMatch = function(referenceColumns, selectedColumns) {
            if (referenceColumns.length != selectedColumns.length) {
                return false;
            } else {
                for (let columnIndex in referenceColumns) {
                    if (!referenceColumns[columnIndex] || !selectedColumns[columnIndex] || !(selectedColumns[columnIndex] === referenceColumns[columnIndex].name)) {
                        return false;
                    }
                }
                return true;
            }
        }

        function updateSelectableColumns(){
            //returns a 2D table containing possible header names for each index
            let selectableColumns = [];
            for (const input of $scope.params.virtualInputs) {
                var inputColumns = $scope.getColumns(input.originLabel);
                for (let columnIndex in inputColumns) {
                    let thisInput = {};
                    if(selectableColumns[columnIndex]) thisInput = selectableColumns[columnIndex];
                    thisInput[inputColumns[columnIndex].name] = 1;
                    selectableColumns[columnIndex] = thisInput;
                }
            }
            $scope.getSelectableColumns = selectableColumns.map(record => {
                let column = [];
                for (var key in record){
                    column.push(key);
                }
                return column;
            });
        }

        function buildInitialColumnsMatch(selectedColumnsNames) {
            for (const input of $scope.params.virtualInputs) {
                const inputColumns = $scope.getColumns(input.originLabel);
                let columnsMatch = [];
                for (let indexColumn in selectedColumnsNames) {
                    if (input.columnsMatch && indexColumn < input.columnsMatch.length) {
                        columnsMatch.push(input.columnsMatch[indexColumn]);
                    } else if (indexColumn < inputColumns.length) {
                        columnsMatch.push(inputColumns[indexColumn].name);
                    } else {
                        columnsMatch.push('');
                    }
                }
                input.columnsMatch = columnsMatch;
            }
        }

        function buildInitialColumnsMatchForInput(input) {
            const inputColumns = $scope.getColumns(input.originLabel);
            let columnsMatch = [];
            for (let indexColumn in $scope.params.selectedColumns) {
                if (indexColumn < inputColumns.length) {
                    columnsMatch.push(inputColumns[indexColumn].name);
                } else {
                    columnsMatch.push('');
                }
            }
            input.columnsMatch = columnsMatch;
        }

        function removeDatasets(virtualIndices) {
            /* removes a dataset from recipe inputs if it not used anymore */
            var updateRecipeInputs = function (index) {
                var used = false;
                $scope.params.virtualInputs.forEach(function(vi) {
                    if (vi.index == index) {
                        used = true;
                    }
                });
                if (!used) {
                    RecipesUtils.removeInput($scope.recipe, "main", $scope.getDatasetNameFromRecipeInputIndex(index));
                    $scope.params.virtualInputs.forEach(function(vi) {
                        if (vi.index > index) {
                            vi.index--;
                        }
                    });
                }
            }

            virtualIndices.sort().reverse();
            virtualIndices.forEach(function(virtualIndex) {
                var recipeInputsIndex = $scope.params.virtualInputs[virtualIndex].index;
                $scope.params.virtualInputs.splice(virtualIndex, 1);
                updateRecipeInputs(recipeInputsIndex);
            });


            updateUnionSchema();
            $scope.updateColumnsSelection();
            if ($scope.params.mode == 'FROM_INDEX') {
                $scope.syncSelectedColumns();
            }
            updateSelectableColumns();
            updateSelectedColumns();
            $scope.hooks.updateRecipeStatus();
        }

        function updateSelectedColumns() {
            if ($scope.params.selectedColumns) {
                $scope.unionSchema.forEach(col => {
                    col.selected = $scope.params.selectedColumns.indexOf(col.name) >= 0;
                });
            }
        }

        function updateUnionSchema () {
            $scope.flatInputRefs = [];

            var columns = [];
            var columnNames = [];
            $scope.unionSchema = $scope.unionSchema || [];
            var previouslySelected = $scope.unionSchema.filter(function(col){
                return col.selected;
            }).map(function(col) {
                return col.name;
            });
            RecipesUtils.getFlatInputsList($scope.recipe).forEach(function(input) {
                $scope.flatInputRefs.push(input.ref);
                $scope.getColumns(input.ref).forEach(function(column) {
                    if (columnNames.indexOf(column.name) < 0) {
                        columns.push(column);
                        columnNames.push(column.name);
                        if (previouslySelected[column.name]) {
                            column.selected = true;
                        }
                    }
                });
            });
            $scope.unionSchema = columns;
        }

        $scope.uiState = {
            currentStep: 'selectedColumns'
        };

        $scope.enableAutoFixup();

        function onScriptChanged(nv, ov) {
            if (nv) {
                if ($scope.script.data) {
                    $scope.params = JSON.parse($scope.script.data);

                    updateUnionSchema();
                    $scope.updateColumnsSelection();
                    updateSelectedColumns();

                    visualCtrl.saveServerParams(); //keep for dirtyness detection

                    $scope.updateGlobalSelectionStatus();
                    $scope.hooks.updateRecipeStatus();
                }
            }
        }

        $scope.hooks.onRecipeLoaded = function(){
            Logger.info("On Recipe Loaded");

            $scope.$watch("script.data", onScriptChanged);
            $scope.$watch("recipe.inputs", function() {
                DatasetUtils.updateRecipeComputables($scope, $scope.recipe, $stateParams.projectKey, $stateParams.projectKey)
                    .then(_ => updateUnionSchema());
            }, true);
            $scope.$watch("params.postFilter", $scope.updateRecipeStatusLater, true);
            $scope.$watch("params.virtualInputs", $scope.updateRecipeStatusLater, true);
            $scope.$watch("params.selectedColumns", $scope.updateRecipeStatusLater, true);
            $scope.$watch("params.mode", updateUnionSchema, true);
            // don't pass $scope.updateRecipeStatus as the callback, because it will get parameters which are absolutely not what is expected:
            $scope.$watch("unionSchema", function(){$scope.updateRecipeStatusLater()}, true); //call updateRecipeStatus without args!
            $scope.$watch("recipe.outputs", function(){
                var outputs = RecipesUtils.getOutputsForRole($scope.recipe, "main");
                if (outputs.length == 1) {
                    $scope.outputDatasetName = outputs[0].ref;
                }
                $scope.updateRecipeStatusLater();
            }, true);

            updateUnionSchema();
            onScriptChanged($scope.script.data);
        };

        $scope.specificControllerLoadedDeferred.resolve();
    });

    app.controller("NewVirtualInputController", function ($scope, $stateParams, DatasetUtils) {
        $scope.newInput = {};

        $scope.isValid = function() {
            return !!$scope.newInput.dataset;
        };

        $scope.addInput = function() {
            $scope.addDataset($scope.newInput.dataset);
        };

        DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, "vstack").then(function(data){
            $scope.availableInputDatasets = data[0];
        });
    });

})();
