(function() {
'use strict';

var app = angular.module('dataiku.datasets');


app.controller("BaseEditableDatasetController", function($scope, $stateParams, DatasetUtils, DataikuAPI) {
    DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, "sync").then(function(data){
        $scope.availableInputDatasets = data[0].filter(function(ds){
            // remove self
            return ds.name != $stateParams.datasetName || ds.projectKey != $stateParams.projectKey;
        });
    });
    $scope.dataset.managed = true;//Editable datasets are always managed
});


/* Settings controller (also used in new dataset page) */
app.controller("EditableDatasetController", function($scope, $stateParams, $controller, DataikuAPI, LoggerProvider) {
    $controller("BaseEditableDatasetController", {$scope: $scope});
    $controller("BaseUploadedFilesController", {$scope: $scope});
    $controller("ManagedFSLikeDatasetController", {$scope: $scope});

    var Logger = LoggerProvider.getLogger('datasets.editable');

    $scope.dataset.params = $scope.dataset.params || {};
    $scope.dataset.flowOptions = $scope.dataset.flowOptions || {};
    $scope.dataset.params.importProjectKey = $stateParams.projectKey;
    $scope.dataset.flowOptions.rebuildBehavior = $scope.dataset.flowOptions.rebuildBehavior || 'WRITE_PROTECT';
    $scope.dataset.flowOptions.crossProjectBuildBehavior = $scope.dataset.flowOptions.crossProjectBuildBehavior || 'STOP';

    $scope.interactionType = 'editable';
    $scope.uiState.autoTestOnFileSelection = true;

    $scope.test = function () {
        $scope.testing = true;
        $scope.testResult = null;
        DataikuAPI.datasets.editable.test($stateParams.projectKey, angular.toJson($scope.dataset)).then(
        function (data) {
            $scope.testing = false;
            $scope.testResult = data;
            if (!$scope.dataset.name) {
                $scope.new_dataset_name = $scope.testResult.suggestedName;
            }
            if ($scope.testResult.tableSchema && (!$scope.dataset.schema || !$scope.dataset.schema.columns == 0 || !$scope.dataset.schema.columns.length)) {
                // Overwrite schema using detected schema, if we have none
                $scope.dataset.schema = {
                        'userModified': false,
                        'columns': $scope.testResult.tableSchema.columns
                };
                $scope.testResult.schemaMatchesTable = true;
            }
        }, function (data) {
            $scope.testing = false;
        });
    };

    // Cannot save if downloading
    $scope.saveHooks.push(function() {
        return $scope.downloadingFiles == 0;
    });

    $scope.saveHooks.push(function() {
        var params = $scope.dataset.params;
        if(params.importSourceType == 'NONE') {
            return true;
        } else if(params.importSourceType == 'DATASET') {
            return !!params.importDatasetSmartName;
        } else if(params.importSourceType == 'FILE') {
            return $scope.files && $scope.files.length > 0;
        }
        Logger.warn("unknown source type", set.importSourceType);
    });

    $scope.onLoadComplete = function(){
        $scope.test(true);
    };

    // list of uploaded files (with finished upload)
    $scope.$watch(function () {
        return $.grep($scope.files, function (f) {
            return angular.isUndefined(f.progress);
        });
    }, function (nv, ov) {
        if (nv !== ov) {
            $scope.onCoreParamsChanged();
        }
    }, true);

    $scope.dataset.params = $scope.dataset.params || {};
    $scope.dataset.params.importSourceType = 'NONE';
    $scope.editableDataset = true;
});


/* Edit tab controller */
app.controller("DatasetEditController", function($scope, TopNav) {
    TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_DATASET, "edit");
    
    var getDatasetFromFullInfo = function() {
        if ($scope.datasetFullInfo) {
            $scope.dataset = $scope.datasetFullInfo.dataset;
        } else {
            $scope.dataset = null;
        }
    };
    
    $scope.$watch("datasetFullInfo", getDatasetFromFullInfo);
    getDatasetFromFullInfo();
});


app.controller("EditableDatasetImportController", function($scope, $rootScope, $stateParams, Dialogs, DataikuAPI, $controller) {
    $controller("BaseEditableDatasetController", {$scope: $scope});
    $controller("BaseUploadedFilesController", {$scope: $scope});

    function doImport() {
        $scope.dismiss();
        DataikuAPI.datasets.editable.import($stateParams.projectKey, $stateParams.datasetName, angular.toJson($scope.dataset))
            .success(
                function(data) {
                    $scope.loadData();
                    $scope.datasetSaved = true;
                }
            ).error(setErrorInScope.bind($rootScope));
    }

    $scope.isValid = function() {
        if ($scope.dataset.params.importSourceType == 'DATASET') {
            return !!$scope.dataset.params.importDatasetSmartName;
        }
        return true;
    };

    $scope.import = function() {
        Dialogs.confirm($scope, "Import data", "This operation cannot be reverted, are you sure you want to continue?").then(function() {
            if (!$scope.datasetSaved && $scope.dataset.params.importMode == 'APPEND') {
                $scope.saveDataset().then(doImport);
            } else {
                doImport();
            }
        });
    };
});


var widgets = angular.module('dataiku.directives.widgets');

widgets.directive("datasetSpreadsheet", function($stateParams, $timeout, CreateModalFromTemplate, DataikuAPI, Dialogs, Debounce, Logger) {
    var min = window.Math.min;
    var max = window.Math.max;

    function filledArray(size, value) {
        return $.map(Array(size), function(){return 1}).map(function(){return value;});//the double map is to be compatible with undefined/null as input and/or output
    }

    function generateUniqueColId(schema) {
        if (!schema || !schema.columns) return null;
        var colNames = schema.columns.map(function(col){return col.name});
        var id = 'new_column',
            i = 0;
        while(colNames.indexOf(id) >= 0) {
            id = 'new_column_'+(++i);
        }
        return id;
    }

    function markDirty(scope) {
        safeApply(scope, function(){
            //We don't analyse changes, any edit operation will mark the dataset as unsaved
            scope.datasetSaved = false;
        });
    }

    function makeContextMenu(scope, readOnly) {
        function columnsSelected(selection) {
            if (!selection) return 0;
            return selection[3] - selection[1] + 1;
        }
        function rowsSelected(selection) {
            if (!selection) return 0;
            return selection[2] - selection[0] + 1;
        }
        var contextMenu =  [
            {
                name: "Edit column",
                callback: function(key, selection) {
                    var visibleIdx = selection.start.col;
                    scope.editCol(visibleIdx);
                },
                disabled: function (x) {
                    if (readOnly) {
                        return true;
                    }
                    var selection = this.getSelected();
                    if (!selection) {
                        return true;
                    }
                    var singleColSelected = selection[1] == selection[3];
                    return selection[1] < 0 || this.countCols() >= this.getSettings().maxCols || !singleColSelected;
                }
            },
            {
                name: "Insert column before",
                callback: function(key, selection) {
                    var visibleIdx = selection.start.col;
                    scope.addCol(visibleIdx);
                },
                disabled: function () {
                    if (readOnly) {
                        return true;
                    }
                    var selection = this.getSelected();
                    return selection === undefined || selection[1] < 0;
                }
            },
            {
                name: function() {
                    var selection = this.getSelected();
                    return "Insert column after";
                },
                callback: function(key, selection) {
                    var visibleIdx = selection.end ? selection.end.col + 1: 0;
                    scope.addCol(visibleIdx);
                },
                disabled: function () {
                    if (readOnly) {
                        return true;
                    }
                    return false;
                }
            },
            {
                name: function(x,y) {
                    var selection = this.getSelected();
                    return "Remove column" + (columnsSelected(selection) > 1 ? 's' : '');
                },
                callback: function(key, selection) {
                    for(var visibleIdx = selection.end.col; visibleIdx >= selection.start.col; visibleIdx--) {
                        scope.removeCol(visibleIdx);
                    }
                },
                disabled: function () {
                    if (readOnly) {
                        return true;
                    }
                    var selection = this.getSelected();
                    return selection === undefined || selection[1] < 0;
                }
            },
            "---------",
            {
                name: function() {
                    var selection = this.getSelected();
                    return "Insert row" + (columnsSelected(selection) > 1 ? 's' : '')+ " above";
                },
                callback: function (key, selection) {
                    var nbRows = rowsSelected(this.getSelected());
                    this.alter("insert_row", selection.start.row, nbRows);
                },
                disabled: function () {
                    if (readOnly) {
                        return true;
                    }
                    var selection = this.getSelected();
                    return selection === undefined || this.getSelected()[0] < 0;
                }
            },
            {
                name: function() {
                    var selection = this.getSelected();
                    return "Insert row" + (columnsSelected(selection) > 1 ? 's' : '')+ " below";
                },
                callback: function (key, selection) {
                    var nbRows = rowsSelected(this.getSelected());
                    this.alter("insert_row", selection.end.row + 1, nbRows);
                },
                disabled: function () {
                    if (readOnly) {
                        return true;
                    }
                var selection = this.getSelected();
                return selection === undefined || this.getSelected()[0] < 0;
                }
            },
            {
                name: function() {
                    var selection = this.getSelected();
                    return "Remove row" + (columnsSelected(selection) > 1 ? 's' : '');
                },
                callback: function (key, selection) {
                    var amount = selection.end.row - selection.start.row + 1;
                    this.alter("remove_row", selection.start.row, amount);
                },
                disabled: function () {
                    if (readOnly) {
                        return true;
                    }
                    var selection = this.getSelected();
                    return selection === undefined || this.getSelected()[0] < 0;
                }
            },
            "---------",
            {
                name: "Mark as unchanged",
                callback: function (key, selection) {
                    var selection = this.getSelected(),
                        data = this.getData(),
                        changes = [];
                    for (var i = min(selection[2], selection[0]); i <= max(selection[2], selection[0]); ++i) {
                        for (var j = min(selection[3], selection[1]); j <= max(selection[3], selection[1]); ++j) {
                            var changedBefore = data[i].changed(j);
                            var stateBefore = data[i].getChangeState(j);
                            data[i].markUnchanged(j);
                            if (changedBefore && !data[i].changed(j)) {
                                changes.push([i, j, data[i].attr(j), data[i].attr(j), stateBefore, data[i].getChangeState(j)]);
                            }
                        }
                    };
                    if (changes.length > 0) {
                        var action = new Handsontable.UndoRedo.ChangeAction(changes);
                        this.undoRedo.done(action);
                        this.render();
                        markDirty(scope);
                    }
                },
                disabled: function () {
                    if (readOnly) {
                        return true;
                    }
                    var selection = this.getSelected(),
                        data = this.getData();
                    if (!selection) {
                        return true;
                    }
                    for (var i = min(selection[2], selection[0]); i <= max(selection[2], selection[0]); ++i) {
                        for (var j = min(selection[3], selection[1]); j <= max(selection[3], selection[1]); ++j) {
                            if (data[i].changed(j) && data[i].originalIdx >= 0) {
                                return false;
                            }
                        }
                    }
                    return true;
                }
            },
            "---------",
            {
                name: "Remove empty rows",
                callback: scope.removeEmptyRows,
                disabled: function () {
                    return readOnly
                }
            }
        ];
        return contextMenu;
    }


    var keysByCode = {
        9: 'tab',
        13: 'enter',
        39: 'right',
        40: 'down'
    };

    return {
        restrict : 'AE',
        link : function(scope, element, attrs) {
            var datasetName = scope.$eval(attrs.dataset) || $stateParams.datasetName || $stateParams.datasetFullName;
            var projectKey = scope.$eval(attrs.projectKey) || $stateParams.projectKey;
            scope.readOnly = !!scope.$eval(attrs.readOnly);
            scope.fixedRowNumber = !!scope.$eval(attrs.fixedRowNumber);

            /*
            Returns the html content for column headers as used by hansontable
             */
            function getColHeaders(schema) {
                return schema.columns.map(function(col, dataIdx){
                    return '<span class="column-name no-select" title="'+sanitize(col.name)+' ('+sanitize(col.type)+')" data-idx="' + dataIdx + '">' + sanitize(col.name) + '</span>' +
                        '<span class="column-type no-select">'+sanitize(col.type)+ '</span>'
                });
            }

            function getColumns(schema) {
                if (scope.readOnly) {
                    return schema.columns.map(function(col) {
                        return {
                            readOnly: scope.readOnly,
                            renderer: function(instance, td, row, visibleCol, prop, value, cellProperties) {
                                Handsontable.renderers.TextRenderer.apply(this, arguments);
                                td.style.backgroundColor = "#fafafa";
                            }
                        };
                    });
                } else {
                    return schema.columns.map(function(col, dataIdx) {
                        return {
                            data: property(dataIdx) ,
                            renderer: function(instance, td, row, visibleCol, prop, value, cellProperties) {
                                Handsontable.renderers.TextRenderer.apply(this, arguments);
                                var rowObj = instance.getSourceDataAtRow(row);
                                var colName = col.name;
                                if(scope.creatingRecipe && scope.creatingRecipe.params && scope.creatingRecipe.params.uniqueKey && scope.creatingRecipe.params.uniqueKey.indexOf(colName) >= 0) {
                                    $(td).addClass('key');
                                }
                                if (rowObj.changed(dataIdx)) {
                                    $(td).addClass('changed');
                                }
                            }
                        };
                    });
                }
            }

            function beforeKeyDown (evt) {
                function mod(a,b) {
                    return (a+b)%b;
                }
                var which = keysByCode[evt.which],
                    selection = handsontable.getSelected();
                if (!selection) {
                    return;
                }
                var lastRowSelected = min(selection[0],selection[2]) == handsontable.countRows() - 1,
                    lastColSelected = min(selection[1],selection[3]) == handsontable.countCols() - 1;
                if (which == 'down' && lastRowSelected) {
                    scope.addRow();
                    evt.stopImmediatePropagation();
                    Logger.debug("keyDown propagation stopped.");
                    return false;
                } else if (which == 'enter') {
                    if (evt.shiftKey) {
                        evt.isImmediatePropagationEnabled = false; // Prevent the handsontable library to handle the event
                        evt.stopImmediatePropagation();
                        Logger.debug("keyDown propagation stopped.");
                        return false;
                    }
                    if (lastRowSelected && handsontable.getActiveEditor().isOpened()) { //on enter when editing a cell of the last row
                        scope.addRow();
                        handsontable.selectCell(
                            handsontable.countRows() - 1,
                            selection[1]
                        );
                    }
                } else if (which == 'tab') {
                    if (lastRowSelected && lastColSelected) {
                        scope.addRow();
                    }
                    var colShift = evt.shiftKey ? -1 : 1,
                        rowShift = 0;
                    if (selection[1] + colShift < 0) {
                        rowShift = -1;
                    } else if (selection[1] + colShift >= handsontable.countCols()) {
                        rowShift = 1;
                    }

                    handsontable.selectCell(
                        max(0, selection[0] + rowShift),
                        mod(selection[1] + colShift, handsontable.countCols())
                    );
                    evt.preventDefault(); // Prevent a weird UI bug to happen
                    evt.isImmediatePropagationEnabled = false; // Prevent the handsontable library to handle the event
                    evt.stopImmediatePropagation();
                    Logger.debug("keyDown propagation stopped.");
                    return false;
                }
            }

            function afterCreateRow(newRowIdx, amount, auto) {
                //select inserted row (keep same selected col if there is one)
                var selection = handsontable.getSelected();
                var colIdx = selection ? selection[1] : 0;
                //called after each row creation => debounce render since it is expensive
                Debounce().withScope(scope).withDelay(50,50).wrap(function() {
                    handsontable.render();
                    handsontable.selectCell(newRowIdx, colIdx); //will also auto-scroll
                });
                afterChange();
            }

            function afterRemoveRow(newRowIdx, amount) {
                //select inserted row (keep same selected col if there is one)
                var selection = handsontable.getSelected();
                var colIdx = selection ? selection[1] : 0;
                handsontable.render();
                handsontable.selectCell(newRowIdx, colIdx); //will also auto-scroll

                afterChange();
            }

            function afterChange (changes, source) {
                if (source != 'loadData') {
                    markDirty(scope);
                }
                $timeout(function(){safeApply(scope)});
            }

            function afterRender() {
                // add double-click events on headers
                $('div[dataset-spreadsheet] .ht_clone_top table.htCore tr th:not(:first-child)').each(function(i, d) {
                    $(d).unbind('dblclick').bind('dblclick', function() {
                        scope.editColIdx($(this).find('.column-name').data('idx'));
                        handsontable.deselectCell();
                    });
                });
            }

            function makeSpreadSheet(data, schema) {
                var contextMenu = makeContextMenu(scope, scope.readOnly);

                //The UI is buggy when the "height" option is undefined
                var options = {
                    data: data,
                    colHeaders: getColHeaders(schema),
                    columns: getColumns(schema),

                    height: $(window).height() - $(container).offset().top
                            - parseInt($(container).css('padding-top')) - parseInt($(container).css('padding-bottom'))
                            - 2,

                    //stretchH: 'all',
                    rowHeaders: true,
                    manualColumnMove: true,
                    manualColumnResize: true,
                    //manualRowResize: true,
                    colWidths: 200,
                    maxRows: 100*1000,

                    contextMenu: contextMenu,

                    afterChange: afterChange,
                    afterCreateRow: afterCreateRow,
                    afterRemoveRow: afterRemoveRow,
                    afterRender: afterRender,

                    beforeKeyDown: beforeKeyDown,

                    dataSchema: Row
                };

                if (scope.readOnly) {
                    options.maxRows = data.length //prevents adding rows with paste
                }

                if (!handsontable || $.isEmptyObject(handsontable)) {
                    handsontable = new Handsontable(container, options);
                    handsontable.render();
                } else {
                    handsontable.updateSettings(options);
                    handsontable.render();
                }

                $(window).on('resize.handsontable', Debounce().withScope(scope).withDelay(200,200).wrap(function() {
                    handsontable.updateSettings({
                        height: $(window).height() - $(container).offset().top
                            - parseInt($(container).css('padding-top')) - parseInt($(container).css('padding-bottom'))
                            - 2,
                        width: $(window).width()
                    });
                }));

                /*
                * make the undo/redo function of handsontable compatible with change tracking
                */
                function propToCol(prop) {
                    return typeof prop == 'function' ? prop.attr : prop;
                }
                handsontable.addHook('beforeChange', function(changes, source) {
                    var rowObj, col, change;
                    if (source != 'loadData' && source != 'undo' && source != 'redo' && source != 'alter') {
                        for (var i = 0; i < changes.length; i++) {
                            change = changes[i];
                            rowObj = handsontable.getData()[change[0]];
                            col = propToCol(change[1]);
                            if (rowObj) {
                                change[4] = rowObj.getChangeState(col);
                            }
                        }
                    }
                });
                handsontable.addHook('afterChange', function(changes, source) {
                    var rowObj, col, change;
                    if (source == 'undo' || source == 'redo') {
                        for (var i = 0; i < changes.length; i++) {
                            change = changes[i];
                            if (change != null && change[1] != null && change[5] != null) {
                                rowObj = handsontable.getData()[change[0]];
                                col = propToCol(change[1]);
                                rowObj.setChangeState(col, change[5]);
                            }
                        }
                        handsontable.render();
                    } else if (source != 'loadData') {
                        for (var i = 0; i < changes.length; i++) {
                            change = changes[i];
                            rowObj = handsontable.getData()[change[0]];
                            col = propToCol(change[1]);
                            change[5] = rowObj.getChangeState(col);
                        }
                    }
                });
                handsontable.addHook('persistentStateSave', function(change, value) {
                    if (change == 'manualColumnPositions') {
                        markDirty(scope);
                    }
                });
            }

            function makeSaveQuery(data) {
                var empty = [];
                var query = {
                    data: data.map(function(row) {
                        if (row.changed() || row.changeFlagsOverwritten) {
                            return row.data;
                        } else {
                            // no change in the row, no need to send to server
                            return empty;
                        }
                    }),
                    schema: schema,
                    versionTag: datasetVersionTag
                };

                var hasNonIdentityRowMapping = false;
                var rowMapping = data.map(function(row, rowIdx) {
                    if (row.originalIdx != rowIdx) {
                        hasNonIdentityRowMapping = true;
                    }
                    return row.originalIdx;
                });
                if (hasNonIdentityRowMapping) { //no need to send an identity mapping
                    query.rowMapping = rowMapping;
                }

                var hasNonIdentityColMapping = false;
                var colMapping = schema.columns.map(function(col) {
                    if (col.originalName != col.name) {
                        hasNonIdentityColMapping = true;
                    }
                    return col.originalName;
                });
                if (hasNonIdentityColMapping) { //no need to send an identity mapping
                    query.colMapping = colMapping;
                }

                if (scope.dataset.params.keepTrackOfChanges) {
                    query.changes = data.map(function(row) {
                        if (row.changeFlagsOverwritten) {
                            return row.data.map(function(_,rowIdx){return row.changed(rowIdx)});
                        } else {
                            // default changedFlags, no need to send to server
                            return empty;
                        }
                    });
                }

                var schemaOrder = handsontable.manualColumnPositions;
                if (!isIdentity(schemaOrder)) {
                    query.schemaOrder = schemaOrder;
                }


                return query;
            }

            function resetDataChanges(data, resp) {
                data.map(function(row, rowIdx){
                    if (row.changeFlags && scope.dataset.params.keepTrackOfChanges) {
                        row.humanModified = row.humanModified || [];
                        for (var i = 0; i < row.changeFlags.length; i++) {
                            if (i < row.humanModified.length) {
                                row.humanModified[i] = row.changeFlags[i] || row.humanModified[i];
                            } else {
                                row.humanModified[i] = row.changeFlags[i];
                            }
                        }
                    }
                    row.originalIdx = rowIdx;
                    delete row.changeFlags;
                    delete row.changeFlagsOverwritten;
                });
                datasetVersionTag = resp.versionTag;
                handsontable.render();
                scope.datasetSaved = true;
            }

            function saveData(data, schema) {
                var formattedData = makeSaveQuery(data);
                var serializedData = angular.toJson(formattedData);
                return DataikuAPI.datasets.editable.save(projectKey, datasetName, serializedData)
                    .success(function(resp) {
                        if (resp && resp.canBeSaved === false) {
                            Logger.error("Dataset cannot be saved", resp);
                        } else {
                            resetDataChanges(data, resp);
                        }
                    })
                    .error(setErrorInScope.bind(scope));
            }

            checkChangesBeforeLeaving(scope, function(){ return scope.dataset.name && !scope.datasetSaved;});

            /* creation is true if the column is being created, false if it is edited */
            function showColumnEditModal(dataIdx, column, creation, onValidate) {
                var newScope = scope.$new();
                newScope.column = column;
                newScope.creation = creation;
                newScope.isValid = function() {
                    if (!column.name || !column.name.length) {
                        return false;
                    }
                    if (creation) {
                        var usedNames = schema.columns.map(function(col){return col.name});
                        return usedNames.indexOf(column.name) < 0;
                    }
                    return true;
                };
                newScope.validate = function(){
                    if (!newScope.isValid()) return;
                    safeApply(scope, onValidate);
                    if (newScope.hasChanged) scope.datasetSaved = false;
                    var modalScope = $(".dku-modal").scope();
                    modalScope.dismiss();
                };
                newScope.removeCol = function() {
                    var displayOrder = handsontable.manualColumnPositions;
                    var visibleIdx = displayOrder.indexOf(dataIdx);
                    scope.removeCol(visibleIdx);
                    scope.datasetSaved = false;
                    var modalScope = $(".dku-modal").scope();
                    modalScope.dismiss();
                };
                newScope.hasChanged = false;
                var init = true;
                newScope.$watch('column', function(nv, ov) {
                    if (init) return init = false;
                    newScope.hasChanged = true;
                }, true);

                CreateModalFromTemplate("/templates/datasets/editable-dataset-column-modal.html", newScope);
            }

            var handsontable = {},
                schema = {},
                datasetVersionTag,
                container = document.getElementById('spreadsheet');

            scope.datasetHooks.userIsWriting = function() {
                if (handsontable.getActiveEditor() == undefined) {return false}
                return handsontable.getActiveEditor()._opened || handsontable.getSelected() != undefined;
            }

            scope.countCols = function() {
                return handsontable.countCols ? handsontable.countCols() : 0;
            };
            scope.countRows = function() {
                return handsontable.countRows ? handsontable.countRows() : 0;
            };
            scope.addRow = function(visibleIdx){
                if (scope.readOnly) {
                    Logger.error("ReadOnly mode: cannot add row.");
                    return;
                }
                visibleIdx = (visibleIdx === undefined) ? handsontable.countRows() + 1 : visibleIdx;
                handsontable.alter("insert_row", visibleIdx);
            };

            scope.showImportModal = function() {
                if (scope.readOnly) {
                    Logger.error("ReadOnly mode.");
                    return;
                }
                var cfg = scope.dataset.params;
                var newScope = scope.$new();
                newScope.currentTab = 'source';
                cfg.importSourceType = 'DATASET';
                cfg.importMode = 'REPLACE';
                CreateModalFromTemplate("/templates/datasets/editable-dataset-import-modal.html", newScope, "EditableDatasetImportController");
            };

            scope.undo = function() {
                handsontable.undo();
            }
            scope.redo = function() {
                handsontable.redo();
            }
            scope.canUndo = function () {
                return handsontable && handsontable.undoRedo && handsontable.undoRedo.isUndoAvailable();
            };
            scope.canRedo = function () {
                return handsontable && handsontable.undoRedo && handsontable.undoRedo.isRedoAvailable();
            };

            scope.datasetSaved = true; // keep track of unsaved changes
            scope.saveDataset = function() {
                return saveData(handsontable.getData(), schema);
            };

            function empty(str) {
                return str == null || str.length == 0;
            }
            function same(str1, str2) {
                //this is an equivalence relation such that null == undefined == "" and usual for other cases
                if (empty(str1) && empty(str2)) {
                    return true;
                }
                return str1 == str2;
            }
            function isTrueish(x) {
                return !!(x && (x == true || x.toLowerCase() == "true") || !!parseFloat(x));
            }
            function isIdentity(arr) {
                for (var i = 0; i < arr.length; i++) {
                    if (arr[i] != i) {
                        return false;
                    }
                }
                return true;
            }


            /*
            * Data model for rows.
            * Attributes:
            *   - data (array)
            *   - originalIdx (int) row number in the data stored in the server (-1 means the row is new, so not on the server)
            *   - changeFlags (array[boolean]) true if the cell was modified *compared to the data on the server* (reset every time the data is loaded or saved). undefined === all false
            *   - humanModified (array[boolean]) true if the cell was ever modified manually
            *   - changeFlagdsOverwritten (boolean) true if at least a cell was forced to be marked as unchanged *in the current session* (reset every time the data is loaded or saved)
            */
            function Row(dataSource, rowIdx, humanModified) {
                //handsontable calls the constructor without "new", so the Row prototype cannot be used on rows created by handsontable
                if (!(this instanceof Row)){
                    return new Row(dataSource, rowIdx);
                }
                var width = schema.columns.length;
                if (Array.isArray(dataSource)) {
                    if (dataSource.length != width) {
                        Logger.warn("Row has invalid size: "+dataSource.length+". Schema has "+width+" columns")
                    }
                    this.data = angular.copy(dataSource);
                } else {
                    this.data = filledArray(schema.columns.length, '');
                }

                // humanModified means that the cell was someday modified. not necessarily during the current session
                if (humanModified) {
                    this.humanModified = humanModified.map(isTrueish);
                }
                this.originalIdx = rowIdx != undefined ? rowIdx : -1; //row index in the original dataset. -1 means new row
            }
            //getter/setter
            Row.prototype.attr = function (attr, val) {
                if (val === undefined) {
                    return this.data[attr];
                }
                if (!same(this.data[attr], val)) {
                    this.data[attr] = val;
                    this.markChanged(attr);
                }
            };
            Row.prototype.createCol = function (dataIdx, content) {
                content = content || {}
                dataIdx = dataIdx === undefined ? this.data.length : dataIdx;
                this.data.splice(dataIdx, 0, content.data || '');
                if (content.changeFlags) {
                    this.changeFlags = this.changeFlags || [];
                    this.changeFlags[dataIdx] = true;
                }
                if (content.humanModified) {
                    this.humanModified = this.humanModified || [];
                    this.humanModified[dataIdx] = true;
                }
            };
            Row.prototype.removeCol = function (dataIdx) {
                var removed = {};
                removed.data = this.data.splice(dataIdx, 1)[0];
                if (this.changeFlags) {
                    removed.changeFlags = this.changeFlags.splice(dataIdx, 1)[0];
                }
                if (this.humanModified) {
                    removed.humanModified = this.humanModified.splice(dataIdx, 1)[0];
                }
                return removed;
            };
            Row.prototype.isEmpty = function () {
                for (var i = 0; i < this.data.length; i++) {
                    if (this.data[i] && this.data[i].length > 0) {
                        return false;
                    }
                }
                return true;
            };
            Row.prototype.changed = function (colIdx) {
                if (colIdx === undefined) {
                    return this.changeFlags && this.changeFlags.indexOf(true) >=0;
                }

                if (this.changeFlags && this.changeFlags[colIdx]) {
                    return true;
                }
                if (this.humanModified && this.humanModified[colIdx]) {
                    return true;
                }
                return false;
            };
            Row.prototype.markUnchanged = function (colIdx) {
                if (!scope.dataset.params.keepTrackOfChanges) {
                    return;
                }
                if (this.originalIdx < 0) {
                    return; //cannot mark newly created row as unchanged
                }
                if (this.changeFlags && this.changeFlags[colIdx]) {
                    this.changeFlags[colIdx] = false;
                    this.changeFlagsOverwritten = true;
                }
                if (this.humanModified && this.humanModified[colIdx]) {
                    this.humanModified[colIdx] = false;
                    this.changeFlagsOverwritten = true;
                }
            };
            Row.prototype.markChanged = function (colIdx) {
                this.changeFlags = this.changeFlags || [];
                this.changeFlags[colIdx] = true;
            };
            Row.prototype.getChangeState = function (colIdx) {
                return [
                    this.changeFlags && this.changeFlags[colIdx] ? true : false,
                    this.humanModified && this.humanModified[colIdx] ? true : false,
                ];
            };
            Row.prototype.setChangeState = function (colIdx, state) {
                if (this.changeFlags && this.changeFlags[colIdx] != state[0]) {
                    this.changeFlags[colIdx] = state[0];
                } else if (!this.changeFlags && state[0]) {
                    this.changeFlags = [];
                    this.changeFlags[colIdx] = state[0];
                }
                if (this.humanModified && this.humanModified[colIdx] != state[1]) {
                    this.humanModified[colIdx] = state[1];
                } else if (!this.humanModified && state[1]) {
                    this.humanModified = [];
                    this.humanModified[colIdx] = state[1];
                }
            };
            function property(attr) {
                var f = function (row, value) {
                    if(!row) return null;
                    return row.attr(attr, value);
                };
                f.attr = attr;
                return f;
            }


            function RemoveColumnAction(visibleIdx, dataIdx, removedData, removedColumn) {
                this.visibleIdx = visibleIdx;
                this.dataIdx = dataIdx;
                this.removedData = removedData;
                this.removedColumn = angular.copy(removedColumn);
            }
            RemoveColumnAction.prototype.undo = function(instance, undoneCallback) {
                doAddCol(this.visibleIdx, this.dataIdx, this.removedColumn, this.removedData);
                if (undoneCallback) {
                    undoneCallback();
                }
                safeApply(scope);
            }
            RemoveColumnAction.prototype.redo = function(instance, redoneCallback) {
                doRemoveCol(this.visibleIdx);
                if (redoneCallback) {
                    redoneCallback();
                }
                safeApply(scope);
            }

            function AddColumnAction(visibleIdx, columnObject) {
                this.visibleIdx = visibleIdx;
                this.columnObject = angular.copy(columnObject);
            }
            AddColumnAction.prototype.undo = function(instance, undoneCallback) {
                doRemoveCol(this.visibleIdx);
                if (undoneCallback) {
                    undoneCallback();
                }
                safeApply(scope);
            }
            AddColumnAction.prototype.redo = function(instance, redoneCallback) {
                doAddCol(this.visibleIdx, angular.copy(this.columnObject));
                if (redoneCallback) {
                    redoneCallback();
                }
                safeApply(scope);
            }

            function EditColumnAction(visibleIdx, columnObjectBefore, columnObjectAfter) {
                this.visibleIdx = visibleIdx;
                this.columnObjectBefore = angular.copy(columnObjectBefore);
                this.columnObjectAfter = angular.copy(columnObjectAfter);
            }
            EditColumnAction.prototype.undo = function(instance, undoneCallback) {
                doEditCol(this.visibleIdx, angular.copy(this.columnObjectBefore));
                if (undoneCallback) {
                    undoneCallback();
                }
                safeApply(scope);
            }
            EditColumnAction.prototype.redo = function(instance, redoneCallback) {
                doEditCol(this.visibleIdx, angular.copy(this.columnObjectAfter));
                if (redoneCallback) {
                    redoneCallback();
                }
                safeApply(scope);
            }

            function doAddCol (visibleIdx, dataIdx, columnObject, content) {
                dataIdx = dataIdx === undefined ? handsontable.countCols() : dataIdx;
                var colId = generateUniqueColId(schema);
                var columnObject = columnObject || {
                    name: colId,
                    type: 'string',

                    dataIdx: dataIdx,
                    originalName: colId
                };
                var onValidate = function() {
                    schema.columns.splice(dataIdx, 0, angular.copy(columnObject));
                    visibleIdx = (visibleIdx === undefined) ? dataIdx : visibleIdx;

                    var displayOrder = angular.copy(handsontable.manualColumnPositions).map(function(otherDataIdx){
                        return otherDataIdx < dataIdx ? otherDataIdx :otherDataIdx + 1;
                    });
                    displayOrder.splice(visibleIdx, 0, dataIdx)

                    handsontable.getData().forEach(function(row, i){
                        row.createCol(dataIdx, content ? content[i] : content);
                    })

                    handsontable.updateSettings({
                        colHeaders: getColHeaders(schema),
                        columns: getColumns(schema)
                    });
                    if (!isIdentity(displayOrder)) {
                        handsontable.manualColumnPositions = displayOrder;
                        handsontable.render();
                    }
                };
                onValidate()
                return new AddColumnAction(visibleIdx, columnObject);
            }


            scope.addCol = function(visibleIdx, columnObject, content) {
                if (scope.readOnly) {
                    Logger.error("ReadOnly mode: cannot add col.");
                    return;
                }
                var action = doAddCol(visibleIdx, columnObject, content);
                handsontable.undoRedo.done(action);
                safeApply(scope);
                markDirty(scope);
            };

            function doRemoveCol (visibleIdx) {
                var displayOrder = angular.copy(handsontable.manualColumnPositions);
                var dataIdx = displayOrder[visibleIdx];
                //Handsontable cannot remove column with object data source or columns option specified, we need to take care of it
                var removedData = [];
                handsontable.getData().forEach(function(row){
                    removedData.push(row.removeCol(dataIdx));
                });
                var removedColumn = schema.columns.splice(dataIdx, 1)[0];

                displayOrder.splice(visibleIdx, 1);
                displayOrder = displayOrder.map(function(otherDataIdx) {
                    return otherDataIdx > dataIdx ? otherDataIdx - 1 : otherDataIdx;
                });

                handsontable.updateSettings({
                    colHeaders: getColHeaders(schema),
                    columns: getColumns(schema)
                });
                if (!isIdentity(displayOrder)) {
                    handsontable.manualColumnPositions = displayOrder;
                    handsontable.render();
                }
                return new RemoveColumnAction(visibleIdx, dataIdx, removedData, removedColumn);
            }

            scope.removeCol = function(visibleIdx) {
                if (scope.readOnly) {
                    Logger.error("ReadOnly mode: cannot remove col.");
                    return;
                }

                var action = doRemoveCol(visibleIdx);
                handsontable.undoRedo.done(action);
                safeApply(scope);
                markDirty(scope);
            };

            function doEditCol(visibleIdx, columnObject) {
                if (angular.equals(columnObject, schema.columns[dataIdx])) {
                    return false;
                }
                var displayOrder = handsontable.manualColumnPositions;
                var dataIdx = displayOrder[visibleIdx];
                schema.columns[dataIdx] = angular.copy(columnObject);
                handsontable.updateSettings({
                    colHeaders: getColHeaders(schema),
                    columns: getColumns(schema)
                });
                if (!isIdentity(displayOrder)) {
                    handsontable.manualColumnPositions = displayOrder;
                    handsontable.render();
                }
                handsontable.render();
                safeApply(scope);
                return true;
            }
            scope.editCol = function(visibleIdx) {
                if (scope.readOnly) {
                    Logger.error("ReadOnly mode: cannot edit col.");
                    return;
                }
                var displayOrder = handsontable.manualColumnPositions;
                scope.editColIdx(displayOrder[visibleIdx]);
            };

            scope.editColIdx = function(dataIdx) {
                var displayOrder = handsontable.manualColumnPositions;
                var visibleIdx = displayOrder.indexOf(dataIdx);
                var column = angular.copy(schema.columns[dataIdx]);
                var onValidate = function() {
                    var columnBefore = schema.columns[dataIdx];
                    if (doEditCol(visibleIdx, column)) {
                        var action = new EditColumnAction(visibleIdx, columnBefore, column);
                        handsontable.undoRedo.done(action);
                    }
                };
                showColumnEditModal(dataIdx, column, false, onValidate);
            };


            scope.loadData = function() {
                DataikuAPI.datasets.editable.getData(projectKey, datasetName)
                .success(function(resp) {
                    resp = resp || {};
                    datasetVersionTag = resp.versionTag || {versionNumber: 0};
                    if (resp.schema && resp.schema.columns && resp.schema.columns.length) {
                        schema = resp.schema;
                    } else {
                        schema = {
                            columns: [
                                { name: 'new_column', type: 'string'}
                            ]
                        };
                    }

                    schema.columns.forEach(function(col, dataIdx){
                        col.originalName = col.name;
                        col.dataIdx = dataIdx;
                    });

                    var data;
                    if (resp.data && resp.data.length > 0 && resp.data[0] && resp.data[0].length > 0) {
                        var nbRows = resp.data.length,
                            nbCols = resp.data[0].length,
                            humanModified = resp.humanModified || [],
                            data = [];
                        for (var i = 0; i < nbRows; ++i) {
                            var row = new Row(resp.data[i], i, humanModified[i]);
                            data.push(row);
                        }
                        scope.datasetSaved = true;
                    } else {
                        //Init data with an empty row if no data was received
                        data = [new Row()];
                        scope.datasetSaved = false;
                    }
                    scope.creatingRecipe = resp.creatingRecipe;
                    makeSpreadSheet(data, schema);
                });
            };

            scope.clearData = function() {
                if (scope.readOnly) {
                    Logger.error("ReadOnly mode: cannot clear.");
                    return;
                }
                handsontable.undoRedo.linkWithNextActions=true;
                handsontable.alter("remove_row", 0, handsontable.countRows());
                scope.addRow();
                scope.datasetSaved = false;
                handsontable.render();
            };

            scope.removeEmptyRows = function() {
                if (scope.readOnly) {
                    Logger.error("ReadOnly mode: cannot clear.");
                    return;
                }
                var data = handsontable.getData();
                var initialLength = data.length;
                for (var i = 1; i <= data.length; i++) {
                    var rowIdx = initialLength - i;
                    if (data[rowIdx].isEmpty()) {
                        handsontable.alter("remove_row", rowIdx, 1);
                    }
                }
            };

            scope.loadData();
        }
    }
});

}());
