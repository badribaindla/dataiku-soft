(function() {
'use strict';

const app = angular.module('dataiku.notebooks.sql', ['dataiku.services', 'dataiku.filters']);


app.controller('SQLNotebookController', function (
        $scope, $state, $timeout, $q, $modal, $stateParams, $rootScope,
        Assert, WT1, Logger, DataikuAPI, Dialogs, TopNav, BigDataService,
        LocalStorage, HistoryService, SQLExplorationService, CreateExportModal,
        ExportUtils, CreateModalFromTemplate) {

	/* *********************** Basic CRUD ********************* */

    $scope.loadNotebook = function() {
        var deferred = $q.defer();
    	DataikuAPI.sqlNotebooks.getSummary($stateParams.projectKey, $stateParams.notebookId).success(function(data) {
            $scope.notebookParams = data.object;
            $scope.objectInterest = data.interest;
            $scope.objectTimeline = data.timeline;

            TopNav.setItem(TopNav.ITEM_SQL_NOTEBOOK, $scope.notebookParams.id, {
                name : $scope.notebookParams.name
                , isHive: $scope.notebookParams.language == 'HIVE'
                , isImpala: $scope.notebookParams.language == 'IMPALA'
                , isSpark: $scope.notebookParams.language == 'SPARKSQL'
            });
            TopNav.setPageTitle($scope.notebookParams.name + " - SQL");

            WT1.event("sql-notebook-load", {language: $scope.notebookParams.language});

    		DataikuAPI.sqlNotebooks.listConnections($stateParams.projectKey).success(function(connections) {
    		    $scope.connectionDetails = undefined;
                $scope.connectionFailed = false;
                for (var i = 0; i < connections.nconns.length; i++) {
                    if (connections.nconns[i].name == $scope.notebookParams.connection) {
                        $scope.connectionDetails = connections.nconns[i];
                        break;
                    }
                }
                if(!$scope.connectionDetails) {
                    $scope.connectionFailed = true;
                } else {
                    $scope.notebookMode = $scope.connectionDetails.type == "HiveServer2" ? "HIVE" : "SQL";
                }

                $scope.notebookLocalState = {};
                $scope.notebookTmpState = {};
                $scope.notebookLocalState.cellMode = 'SINGLE';
                $scope.notebookLocalState.tableListingMode = 'PROJECT';
                $scope.notebookLocalState.tableOrdering = 'TABLE';
                $scope.notebookLocalState.leftPaneTab = 'Cells';

                $scope.$watch("notebookLocalState", $scope.saveLocalStates, true);

                $scope.updateNotebookHistory().then(function() {
                    $scope.$broadcast("history-first-time-loaded");
                });

                if($scope.connectionDetails) {
                    deferred.resolve("ok");
                    $scope.$broadcast('notebookLoaded');
                }
            }).error(setErrorInScope.bind($scope));
    	}).error(setErrorInScope.bind($scope));
        return deferred.promise;
    };

    $scope.refreshTimeline = function(projectKey) {
        DataikuAPI.timelines.getForObject(projectKey || $stateParams.projectKey, "SQL_NOTEBOOK", $stateParams.notebookId).success(function(data) {
            $scope.objectTimeline = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.duplicateNotebook = function() {
        WT1.event("sql-notebook-copy", {});
        DataikuAPI.sqlNotebooks.copy($stateParams.projectKey, $stateParams.notebookId, $scope.notebookParams.name+'_copy').success(function(data) {
            $state.transitionTo("projects.project.notebooks.sql_notebook", {projectKey: $stateParams.projectKey, notebookId: data.id});
        }).error(setErrorInScope.bind($scope));
    };

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields(customFields);
    });

    $scope.saveCustomFields = function(newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'SQL_NOTEBOOK'});
        let oldCustomFields = angular.copy($scope.notebookParams.customFields);
        $scope.notebookParams.customFields = newCustomFields;
        return DataikuAPI.sqlNotebooks.save($scope.notebookParams).success(function(data) {
                $scope.refreshTimeline();
                HistoryService.notifyRenamed({
                    type: "SQL_NOTEBOOK",
                    id: $scope.notebookParams.id,
                    projectKey: $scope.notebookParams.projectKey
                }, $scope.notebookParams.name);
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.notebookParams.customFields);
            }).error(function(a, b, c) {
                $scope.notebookParams.customFields = oldCustomFields;
                setErrorInScope.bind($scope)(a, b,c);
            });
    };

    $scope.editCustomFields = function() {
        if (!$scope.notebookParams) {
            return;
        }
        let modalScope = angular.extend($scope, {objectType: 'SQL_NOTEBOOK', objectName: $scope.notebookParams.name, objectCustomFields: $scope.notebookParams.customFields});
        CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
            $scope.saveCustomFields(customFields);
        });
    };

	var saveParams = function() {
		DataikuAPI.sqlNotebooks.save($scope.notebookParams).success(function(data) {
			if (data && data.versionTag) {
				$scope.notebookParams.versionTag = data.versionTag;
			}
			doSaveLocalStates();
			$scope.refreshTimeline();
            HistoryService.notifyRenamed({
                type: "SQL_NOTEBOOK",
                id: $scope.notebookParams.id,
                projectKey: $scope.notebookParams.projectKey
            }, $scope.notebookParams.name);
	   	}).error(setErrorInScope.bind($scope));
	};

    /* Auto save */
    var saveParamsTimer;
    $scope.$watch("notebookParams", function(nv, ov) {
        if (nv && ov) {
            Logger.info("Notebook params updated");
            const beforeCopy = angular.copy(ov);
            const afterCopy = angular.copy(nv);
            beforeCopy.versionTag = null;
            afterCopy.versionTag = null;
            if (angular.equals(beforeCopy, afterCopy)) {
                Logger.debug("Only the version tag was modifed, ignoring")
                return;
            }
            $timeout.cancel(saveParamsTimer);
            saveParamsTimer = $timeout(saveParams, 1000);
        }
    }, true);

	/* *********************** Initialization code **************** */

    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'notebooks', TopNav.TABS_SQL_NOTEBOOK, "query");
    TopNav.setItem(TopNav.ITEM_SQL_NOTEBOOK, $stateParams.notebookId);

    $scope.uiState = { codeSamplesSelectorVisible: false };

	$scope.loadNotebook().then(function() {
        $scope.cells = $scope.notebookParams.cells;//TODO is that useful?
        $scope.cells.forEach(function(cell){
            cell.$localState = cell.$localState || {}; // localStorage, not sent to server
            cell.$tmpState = cell.$tmpState || {}; // non persistent state
            cell.type = cell.type || 'QUERY';
            if (cell.type == 'QUERY') {
                cell.$localState.query = cell.$localState.query || {};
                var q = cell.$localState.query;
                if ((!q.sql || !q.sql.length) && cell.code) {
                    q.sql = cell.code;
                }
            }
        })
        loadLocalStates();
    });

    $scope.$watch("notebookLocalState.leftPaneTab", function() {
        $scope.$broadcast("reflow");
    });

    /* ************  Cells management *************** */

    var getSpecifiedCellOrSelectedOrLast = function(index) {
        if (index !== undefined) return index;
        var selected = $scope.getSelectedCellIndex();
        if (selected !== undefined) return selected;
        var last = $scope.cells.length - 1;
        return last;
    };

    $scope.selectCell = function(index) {
        $scope.cells.forEach(function(cell, idx) {
            var wasSelected = cell.$localState.selected;
            cell.$localState.selected = idx == index;
            if (!wasSelected && cell.$localState.selected && cell.focusQuery) {
                $timeout(function(){
                    cell.focusQuery();
                }, 500);
            }
        });
        loadResultsIfNeeded();
    };

    //returns the index of the selected cell or undefined if none selected
    $scope.getSelectedCellIndex = function() {
        if (!$scope.cells) return;
        for (var i = 0; i < $scope.cells.length; i++) {
            var cell = $scope.cells[i];
            if (cell.$localState && cell.$localState.selected) return i;
        }
    };

    $scope.selectedCell = function() {
        if (!$scope.cells) return;
        return $scope.cells[$scope.getSelectedCellIndex()];
    };

    $scope.addCell = function(type, index) {
        if (index === undefined) index = $scope.cells.length;
        var cell = {
            type: type,
            id: generateUniqueId(),
            $localState: {unfolded: true},
            $tmpState: {},
            querySettings: {
                addLimitToStatement: true,
                statementsParseMode : "SPLIT",
                statementsExecutionMode : "PREPARED"
            }
        };
        $scope.cells.splice(index, 0, cell);
        $scope.selectCell(index);
        $scope.scrollToCell(index);

        WT1.event("sql-notebook-add-cell", {number_of_cells: $scope.cells.length});
        return cell;
    };

    $scope.removeCell = function(index) {
        if (index === undefined) return;
        Dialogs.confirm($scope, "Confirm deletion", "Are you sure you want to remove this cell ?").then(function() {
            $scope.cells.splice(index, 1);
            if ($scope.cells.length) {
                $scope.selectCell(index < $scope.cells.length ? index : $scope.cells.length - 1);
            }
        });
    };

    $scope.duplicateCell = function(index) {
        if (index === undefined) return;
        WT1.event("sql-notebook-duplicate-cell", {});
        var originalCell = $scope.cells[index];
        //avoid copying some things. Not very pretty...
        var l = originalCell.$localState;
        var t = originalCell.$tmpState;
        originalCell.$localState = {};
        originalCell.$tmpState = {};
        var newCell = angular.copy(originalCell);
        newCell.id = Math.random();
        originalCell.$localState = l;
        originalCell.$tmpState = t;
        if (originalCell.type == 'QUERY') {
            newCell.$localState.query = {sql: l.query.sql};
        }
        $scope.cells.splice(index + 1, 0, newCell);
    };

    $scope.moveCell = function(index, shift) {
        if (index === undefined) return;
        WT1.event("sql-notebook-move-cell", {});
        if (index + shift < 0) {
            shift = -index;
        } else if (index + shift >= $scope.cells.length) {
            shift = $scope.cells.length - 1 - index;
        }
        var cell = $scope.cells[index + shift];
        $scope.cells[index + shift] = $scope.cells[index];
        $scope.cells[index] = cell;
        $scope.scrollToCell(index + shift);
    };

    $scope.hasUnfoldedCell = function() {
        if (!$scope.cells) return;
        for (var i = 0; i < $scope.cells.length; i++) {
            var cell = $scope.cells[i];
            if (cell.$localState && cell.$localState.unfolded) return true;
        }
        return false;
    };

    $scope.unfoldAllCells = function(unfold) {
        WT1.event("sql-notebook-unfold-all-cells", {});
        if (!$scope.cells) return;
        for (var i = 0; i < $scope.cells.length; i++) {
            var cell = $scope.cells[i];
            cell.$localState.unfolded = unfold;
        }
    };

    $scope.selectCellAndScroll = function(index) {
        $scope.selectCell(index);
        $timeout(function(){
            $scope.scrollToCell(index);
        }, 200)
    };

    $scope.scrollToCell = function(index) {
        $timeout(function() {
            $('.multi-query-editor').scrollTop($('.sql-notebook-cell')[index].offsetTop);
        }, 100);
    };

    $scope.filterCells = function() {
        var filteredCells = $scope.cells;
        if (!$scope.cells || !$scope.notebookLocalState) return;
        var query = $scope.notebookLocalState.cellsQuery;
        if (query && query.trim().length) {
            angular.forEach(query.split(/\s+/), function(token){
                token = token.toLowerCase();
                if (token.length) {
                    filteredCells = $.grep(filteredCells, function(cell){
                        return cell.name && cell.name.toLowerCase().indexOf(token) >= 0 ||
                        (cell.$localState && cell.$localState.query && cell.$localState.query.sql && cell.$localState.query.sql.toLowerCase().indexOf(token) >= 0);
                    });
                }
            });
            $scope.cells.forEach(function(cell){
                cell.$tmpState.filteredOut = true;
            });
        }
        filteredCells.forEach(function(cell){
            cell.$tmpState.filteredOut = false;
        });
        $scope.filteredCells = filteredCells.length;
    };
    $scope.$watchCollection("cells", $scope.filterCells);
    $scope.filterCells();

    /* ************  Locally persistent state *************** */

    function localStorateId() {
        return "SQL_NOTEBOOK_"+$stateParams.projectKey + "_" + $scope.notebookParams.id;
    }

    var onLocalStatesLoaded = function() {
        // Make sure a cell is selected
        if ($scope.cells && $scope.cells.length) {
            var selectedCell = $scope.selectedCell();
            if (!selectedCell) {
                $scope.selectCell(0);
            }
        }
    };

    var loadLocalStates = function() {
        if (!$scope.cells) return;
        var localState = LocalStorage.get(localStorateId()) || {cellsStates:{}};
        Logger.info("Loading SQL notebook local state", localState);
        if (localState.notebookLocalState && localState.notebookLocalState.versionTag && localState.notebookLocalState.versionTag.versionNumber < $scope.notebookParams.versionTag.versionNumber) {
            Logger.info("Local state is outdated, discarding saved queries");
            // the localState is outdated, discard all saved queries
            $.each(localState.cellsStates, function(id, cell) {
                delete cell.query;
            });
        }
        $scope.notebookLocalState = $.extend($scope.notebookLocalState || {}, localState.notebookLocalState);
        $scope.cells.forEach(function(cell){
            cell.$localState = $.extend(cell.$localState || {}, localState.cellsStates[cell.id]);
        });
        onLocalStatesLoaded();
    };

    var doSaveLocalStates = function() {
        if (!$scope.notebookParams) return;
        var localState = {cellsStates: {}};
        localState.notebookLocalState = $scope.notebookLocalState;
        localState.notebookLocalState.versionTag = $scope.notebookParams.versionTag
        if ($scope.cells) {
            $scope.cells.forEach(function(cell){
                localState.cellsStates[cell.id] = cell.$localState;
            });
        }
        const now = new Date().getTime();
        LocalStorage.set(localStorateId(), localState);
        Logger.info("Saved SQL notebook local state time=" + (new Date().getTime() - now));
    };

    var saveLocalStateTimer;
    $scope.saveLocalStates = function() {
        $timeout.cancel(saveLocalStateTimer);
        saveLocalStateTimer = $timeout(doSaveLocalStates, 250);
    };

    /* ************  Text insertion *************** */

    function insertText(text, addSelectIfEmptyQuery) {
        var cell = $scope.selectedCell();
        if (cell && cell.$tmpState.insertText) {
            cell.$tmpState.insertText(text, addSelectIfEmptyQuery);
        } else {
            Logger.warn("Cannot insert text: no current cell or no insertText function");
        }
    }

    $scope.onTableClicked = function(table) {
        insertText(table.quoted, true);
    };

    $scope.onFieldClicked = function(field) {
        insertText(field.quotedName);
    };

    $scope.insertCodeSnippet = function(snippet) {
        insertText(snippet.code);
    }

    /* ************ History ************ */

    $scope.updateNotebookHistory = function() {
        var deferred = $q.defer();
        DataikuAPI.sqlNotebooks.getHistory($stateParams.projectKey, $stateParams.notebookId).success(function(data) {
            $scope.notebookTmpState.history = data;
            deferred.resolve("ok");
        }).error(setErrorInScope.bind($scope));
        return deferred.promise;
    };

    $scope.clearHistory = function(cellId) {
        var deferred = $q.defer();
        Dialogs.confirm($scope, 'Are you sure you want to clear query history?').then(function() {
            WT1.event("sql-notebook-clear-history", {});
            DataikuAPI.sqlNotebooks.clearHistory($stateParams.projectKey, $stateParams.notebookId, cellId).success(function(data) {
                delete $scope.notebookTmpState.history[cellId];
                deferred.resolve("ok");
            }).error(setErrorInScope.bind($scope));
        });
        return deferred.promise;
    };

    var loadResultsIfNeeded = function() {
        var cell = $scope.selectedCell();
        if ($scope.notebookLocalState.cellMode == 'SINGLE' && cell.$localState.selected) {
            if (!$scope.fetchingResults[cell.id] && cell.$tmpState.lastQuery  && !cell.$tmpState.runningQuery && !cell.$tmpState.results) { //&& cell.$tmpState.lastQuery.state == 'DONE'
                $scope.fetchLastResults(cell, cell.$tmpState.lastQuery.id)
            }
        }
    };

    $scope.loadQuery = function(cell, query, fetchResults) {
        Assert.trueish(cell, 'no cell');
        delete cell.$tmpState.results;
        cell.$localState.query = angular.copy(query);
        cell.$localState.unfolded = true;
        if(query.state == "RUNNING" || query.state == "NOT_STARTED") {
            cell.$tmpState.runningQuery = angular.copy(query);
            cell.$tmpState.waitFuture();
        } else {
            cell.$tmpState.lastQuery = angular.copy(query);
            loadResultsIfNeeded();
        }
    };

    $scope.createCellWithQuery = function(hQuery, index) {
        var initialCell = $scope.selectedCell();
        var cell = $scope.addCell('QUERY', index);
        cell.name = initialCell.name ? initialCell.name + '_copy' : '';
        cell.$localState.query = cell.$localState.query || {};
        cell.$localState.query.sql = hQuery.sql;
        //TODO add the query to the cell history
        $scope.notebookLocalState.leftPaneTab = 'Cells';
    };

    $scope.removeQuery = function(q) {
        var cell = $scope.selectedCell();
        if (cell && cell.$tmpState && cell.$tmpState.removeQuery) {
            cell.$tmpState.removeQuery(q);
        }
    };

    $scope.fetchingResults = {};
    $scope.fetchLastResults = function(cell, queryId) {
        if ($scope.fetchingResults[cell.id]) {
            Logger.warn("Cell Already fetching results", cell.id);
            return;
        }
        $scope.fetchingResults[cell.id] = true;
        return DataikuAPI.sqlNotebooks.getHistoryResult($stateParams.projectKey, $stateParams.notebookId, queryId).then(function(resp) {
            cell.$tmpState.results = resp.data;
            cell.$tmpState.clearError();
            return resp;
        }, function(resp) {
            cell.$tmpState.error(resp.data, resp.status, resp.headers);
        })
        .finally(function(){
            delete $scope.fetchingResults[cell.id];
        });
    };
});



app.controller('SqlNotebookQueryCellController', function ($scope, $element, $stateParams, $timeout, $q, DataikuAPI,
               WT1, Logger, Dialogs, CreateModalFromTemplate, CreateExportModal, BigDataService, SQLExplorationService, ExportUtils, CodeMirrorSettingService) {

    /* ************  Execution ************ */

    function resetResults() {
        delete $scope.cell.$tmpState.logs;
        if ($scope.cell.$tmpState.results) {
            delete $scope.cell.$tmpState.results.hasResultset;
        }
    }

    $scope.run = function() {
        if($scope.isQueryEmpty() || $scope.cell.$tmpState.runningQuery) {
            return;
        }
        resetResults();
        WT1.event("sql-notebook-run", {});

        var query = angular.copy($scope.cell.$localState.query);
        query.id = Math.random();
        query.connection = $scope.connectionDetails.name;
        query.mode = $scope.notebookMode;
        query.querySettings = $scope.cell.querySettings;

        var full = false;
        
        $scope.cell.$tmpState.initializingQuery = true;
        DataikuAPI.sqlNotebooks.run($stateParams.projectKey, $stateParams.notebookId, $scope.cell.id, query, full).success(function(startedQuery) {
            $scope.cell.$tmpState.runningQuery = startedQuery.toAddtoHistory;
            $scope.waitFuture();
            $scope.updateCellHistory();
            if ($scope.notebookMode == 'HIVE') {
                $scope.cell.$tmpState.resultsTab = 'LOGS';
            }
            $scope.cell.$tmpState.clearError();
        }).error($scope.cell.$tmpState.error)
        .finally(function(){$scope.cell.$tmpState.initializingQuery = false;});
    };

    $scope.abort = function() {
        if(!$scope.cell.$tmpState.runningQuery) return;
        WT1.event("sql-notebook-abort", {});
        DataikuAPI.sqlNotebooks.abort($stateParams.projectKey, $stateParams.notebookId, $scope.cell.id, $scope.cell.$tmpState.runningQuery.id).success(function(data) {
            // No need to do more, the next future refresh it will handle it
        }).error($scope.cell.$tmpState.error);
    };

    $scope.computeFullCount = function(full) {
        resetResults();
        WT1.event("sql-notebook-full-count", {});
        DataikuAPI.sqlNotebooks.computeFullCount($stateParams.projectKey, $stateParams.notebookId, $scope.cell.id, $scope.cell.$localState.query.id).success(function(startedQuery) {
            $scope.cell.$tmpState.runningQuery = startedQuery.toAddtoHistory;
            $scope.cell.$localState.query = angular.copy(startedQuery.toAddtoHistory);
            $scope.waitFuture();
            $scope.updateCellHistory();

            if ($scope.notebookMode == 'HIVE') {
                $scope.cell.$tmpState.resultsTab = 'LOGS';
            }
            $scope.cell.$tmpState.clearError();
        }).error($scope.cell.$tmpState.error);
    };

    $scope.waitFuture = function() {
        $scope.stopfutureTimer();
        DataikuAPI.sqlNotebooks.getProgress($stateParams.projectKey, $stateParams.notebookId, $scope.cell.id, $scope.cell.$tmpState.runningQuery.id).success(function(data) {
            $scope.runningStatus = data;
            $scope.cell.$tmpState.runningQuery = data.query;
            if (data.logTail) {
                $scope.cell.$tmpState.logs = data.logTail;
            }
            if (data.running) {
                $scope.stopfutureTimer();
                $scope.futureTimer = $timeout($scope.waitFuture, 1000);
            } else {
                $scope.onFutureDone(data);
            }
        }).error(function(a,b,c) {
            $scope.onFutureFailed(a,b,c);
        });
    };
    $scope.cell.$tmpState.waitFuture = $scope.waitFuture;

    $scope.onFutureDone = function() {
        var flr = $scope.fetchLastResults($scope.cell, $scope.cell.$tmpState.runningQuery.id)
        if (flr) {
            flr.then(function(){
                $scope.stopfutureTimer();

                $scope.cell.$localState.query = angular.copy($scope.cell.$tmpState.runningQuery);//TODO move query to tmpState and remove running query
                $scope.cell.$tmpState.lastQuery = angular.copy($scope.cell.$tmpState.runningQuery);

                $scope.cell.$tmpState.resultsTab = 'RESULTS';

                delete $scope.cell.$tmpState.runningQuery;
                $scope.updateCellHistory();
            });
        }
    };

    $scope.onFutureFailed = function(a,b,c) {
        $scope.cell.$tmpState.error(a,b,c);
        $scope.runningStatus = null;
        $scope.updateCellHistory(); // TODO per cell
    };

    $scope.stopfutureTimer = function() {
        if($scope.futureTimer) {
            $timeout.cancel($scope.futureTimer);
            $scope.futureTimer = null;
        }
    };

    $scope.showExecutionPlan = function() {
        if($scope.isQueryEmpty()) {
            return;
        }
        var query = angular.copy($scope.cell.$localState.query);
        query.id = Math.random();
        query.connection = $scope.connectionDetails.name;
        query.mode = $scope.notebookMode;
        query.querySettings = $scope.cell.querySettings;

        DataikuAPI.sqlNotebooks.getExecutionPlan($stateParams.projectKey, query).success(function(data) {
            CreateModalFromTemplate("/templates/recipes/fragments/sql-modal.html", $scope, null, function(newScope) {
                newScope.executionPlan = data.executionPlan;
                newScope.failedToComputeExecutionPlan = data.failedToComputeExecutionPlan;
                if (!data.failedToComputeExecutionPlan){
                    newScope.query = data.executionPlan.query;
                }
                newScope.uiState = {currentTab: 'plan'};
                newScope.engine = query.mode;
                newScope.isNotebook = true;
            });
        }).error($scope.cell.$tmpState.error);
    };

    /* ************ Code edition ************ */

    $scope.autocompleteSQL = function(cm,type) {
        SQLExplorationService.listTables($scope.notebookParams.connection, $stateParams.projectKey).then(function(tables) {
            var fieldsToAutocomplete = CodeMirror.sqlFieldsAutocomplete(cm, tables);
            if (fieldsToAutocomplete && fieldsToAutocomplete.length) {
                SQLExplorationService.listFields($scope.notebookParams.connection, fieldsToAutocomplete).then(function(data) {
                    CodeMirror.showHint(cm, function(editor) {
                        return CodeMirror.sqlNotebookHint(editor, type+"-notebook", tables.map(function(t) {return t.table;}),data);
                    }, {completeSingle:false});
                });
            } else {
                CodeMirror.showHint(cm, function(editor){
                    return CodeMirror.sqlNotebookHint(editor, type+"-notebook", tables.map(function(t) {return t.table;}), null);
                }, {completeSingle:false});
            }
        });
    };

    $scope.cell.$tmpState.insertText = function(text, addSelectIfEmptyQuery) {
        if (addSelectIfEmptyQuery && $scope.isQueryEmpty()) {
            text = 'SELECT * FROM '+text;
        }
        $scope.cm.replaceSelection(text);
        var endPos = $scope.cm.getCursor(false);
        $scope.cm.setCursor(endPos);
        $scope.cm.focus();
    };

    $scope.cell.$tmpState.removeQuery = function(hQuery) {
        // if(q.id == $scope.query.id) {
        //     $scope.query.id = undefined;
        //     $scope.query.cachedResult = undefined;
        // }

        DataikuAPI.sqlNotebooks.removeQuery($stateParams.projectKey, $stateParams.notebookId, $scope.selectedCell().id, hQuery.id)
            .success($scope.updateCellHistory)
            .error($scope.cell.$tmpState.error);
    };

    /* ************ History ************ */

    $scope.showHistoryModal = function() {
        CreateModalFromTemplate("/templates/notebooks/sql-notebook-history-modal.html", $scope);
    };

    $scope.updateCellHistory = function() {
        var deferred = $q.defer();
        DataikuAPI.sqlNotebooks.getCellHistory($stateParams.projectKey, $stateParams.notebookId, $scope.cell.id).success(function(data) {
            $scope.notebookTmpState.history = $scope.notebookTmpState.history || {};
            $scope.notebookTmpState.history[$scope.cell.id] = data;
            deferred.resolve("ok");
            $scope.cell.$tmpState.clearError();
        }).error($scope.cell.$tmpState.error);
        return deferred.promise;
    };

    /* ************ Export to recipe ************ */

    // https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions
    function escapeRegExp(string){
        return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    };

    $scope.createRecipe = function() {
        var script = $scope.cell.$localState.query.sql
        var fromPosition = script.search(/\sfrom\s/i);
        var candidateTables = [];

        if(fromPosition != -1) {
            // Extract table names
            var afterFrom = script.substring(fromPosition+5).toLowerCase();
            candidateTables = afterFrom.split(/['"`.\s]+/);
        }

        // Load table mapping
        DataikuAPI.connections.getSQLTableMapping($scope.notebookParams.connection).success(function(mapping){
            var candidateInputs = [];
            // Assign inputs
            for(var i in candidateTables) {
                for(var j in mapping) {
                    if(mapping[j].projectKey == $stateParams.projectKey
                    && mapping[j].table.toLowerCase() == candidateTables[i].toLowerCase()) {
                        candidateInputs.push(mapping[j].dataset);
                    }
                }
            }

            // Dedup
            candidateInputs = candidateInputs.filter(function(e,i) { return candidateInputs.indexOf(e) == i;});
            var recipeType = 'sql_query';
            if ($scope.notebookParams.connection.startsWith('@virtual(hive-hproxy)')) recipeType = 'hive';
            if ($scope.notebookParams.connection.startsWith('@virtual(hive-jdbc)')) recipeType = 'hive';
            if ($scope.notebookParams.connection.startsWith('@virtual(impala-jdbc)')) recipeType = 'impala';
            if ($scope.notebookParams.connection.startsWith('@virtual(spark-livy)')) recipeType = 'spark_sql_query';
            var prefillKey = BigDataService.store({
                script : script,
                input : candidateInputs,
                output :[]
            });
            $scope.showCreateCodeBasedModal(recipeType, null, null, prefillKey);
        }).error($scope.cell.$tmpState.error);
    };

    /* ************ Export results ************ */

    $scope.exportCurrent = function() {
        WT1.event("sql-notebook-export", {});
        DataikuAPI.sqlNotebooks.testStreamedExport($stateParams.projectKey, $stateParams.notebookId, $scope.cell.id, $scope.cell.$tmpState.lastQuery.id).success(function(data) {
            var features = {
                advancedSampling : false,
                partitionListLoader : null,
                isDownloadable : data.streamedExportAvailable
            };
            var dialog = {
                title : 'SQL Query',
                warn : data.streamedExportAvailable ? null : 'Warning! The query will be re-run'
            };
            CreateExportModal($scope,dialog,features).then(function(params) {
                DataikuAPI.sqlNotebooks.exportResults($stateParams.projectKey, $stateParams.notebookId, $scope.cell.id, $scope.cell.$tmpState.lastQuery.id, params).success(function(data) {
                    ExportUtils.defaultHandleExportResult($scope, params, data);
                }).error($scope.cell.$tmpState.error);
            });

        }).error($scope.cell.$tmpState.error);
    };

    /* ************ UI ************ */

    var setupFattable = function(results) {
        if(!results) {
            return;
        }
        $scope.columnWidths = [];
        for(var k in results.columns) {
            var name = results.columns[k].name;
            var size = 100;
            if(name) {
                size = Math.max(size,name.length*7+10);
            }
            $scope.columnWidths.push(size);
        }
        for(var r in results.rows) {
            for(var k in results.rows[r]) {
                var cell = results.rows[r][k];
                if(cell) {
                    $scope.columnWidths[k] = Math.max(cell.length*7+10,$scope.columnWidths[k]);
                }
            }
        }
    };

    var setupAutoComplete = function(tables, suggestions) { //TODO tables should be in suggestions?
        if (!$scope.cm) {
            Logger.warn("Failed to setup autocomplete");
            return;
        }
        CodeMirror.showHint($scope.cm, function(editor) {
            return CodeMirror.sqlNotebookHint(editor, $scope.notebookMode+"-notebook", tables.map(function(t) {return t.table;}), data);
        }, {completeSingle:false});
    };

    var scrollToResults = function(){
        $('.multi-query-editor').scrollTop($('.sql-results-header', $element)[0].offsetTop);
    };

    $scope.focusQuery = function() {
        if (!$scope.cm) return;
        $scope.cm.focus();
    };

    $scope.focusQueryAfter = function() {
        $scope.cell.$tpmState = $scope.cell.$tpmState || {};
    };

    $scope.isQueryEmpty = function() {
        return !$scope.cell.$localState.query || !$scope.cell.$localState.query.sql || !$scope.cell.$localState.query.sql.trim();
    };

    $scope.foldQuery = function(fold) {
        WT1.event("sql-notebook-fold-cell", {});
        $scope.cell.$localState.foldQuery = fold;
    };

    $scope.toggleUnfoldTable = function() {
        $scope.cell.$localState.unfoldTable = !$scope.cell.$localState.unfoldTable;
        $scope.$broadcast("reflow"); //For fattable to resize
        if ($scope.cell.$localState.unfoldTable) {
            $timeout(scrollToResults);
        };
    };

    /* ************ init ************ */
    $scope.cell.focusQuery = $scope.focusQuery;

    function initQuery() {
        $scope.cell.$localState.query = {
            sql : ''
        };
        if ($scope.cm && $scope.notebookMode == 'HIVE' || $scope.notebookMode == 'IMPALA' || $scope.notebookMode == 'SPARKSQL') {
            $scope.cm.setOption('mode', 'text/x-hivesql');
        }
    }

    $scope.$on('notebookLoaded', initQuery);
    $scope.$on('autocompleteSuggestionsLoaded', setupAutoComplete);

    $scope.editorOptions = function() {
        var mode = ($scope.notebookMode == 'HIVE' || $scope.notebookMode == 'IMPALA' || $scope.notebookMode == 'SPARKSQL') ? 'text/x-hivesql' : 'text/x-sql';
        var opt = {
            noFullScreen: true,
            onLoad: function(cm) {
                $scope.cm = cm;
                if ($scope.notebookMode) {
                    setTimeout(function () {
                        if ($scope.cell.$localState.selected) {
                            cm.focus();
                        }
                    }, 200);
                    $(".CodeMirror", $element).append($('<div class="running-query-overlay"><i class="icon-spin icon-spinner" /></div>'));
                }
            }
        };
        var editorOptions = CodeMirrorSettingService.get(mode, opt);
        editorOptions.extraKeys[CodeMirrorSettingService.getShortcuts()['AUTOCOMPLETE_SHORTCUT']] = function(cm) {
            return $scope.autocompleteSQL(cm, $scope.notebookMode);
        };
        return editorOptions;
    };
    $scope.columnWidths = [];

    $scope.futureTimer = null;
    $scope.$on("$destroy", $scope.stopfutureTimer);

    var saveLocalStatesTimer;
    function saveLocalStateLater() {
        $timeout.cancel(saveLocalStatesTimer);
        saveLocalStatesTimer = $timeout($scope.saveLocalStates, 400);
    }
    $scope.$watch('cell.$localState.query.sql', saveLocalStateLater);

    $scope.$watch('cell.$tmpState.results', setupFattable ,false);

    $scope.$watch('cell.$tmpState.resultsTab', function(nv) {
        if (nv != 'logs') {
            $scope.$broadcast("reflow"); // update fat repeat layout
        }
    });

    setupFattable($scope.cell.$tmpState.results); //DEBUG

    var initLastQuery = function() {
        // Check if the current code is the same as last query, in this case mark the last query as active and load results
        var cellHistory = $scope.notebookTmpState.history[$scope.cell.id];
        $scope.cell.$localState.query = $scope.cell.$localState.query || {};
        var cellCode = $scope.cell.$localState.query.sql
        if (cellHistory && cellHistory.length) {
            var lastQuery = cellHistory[0];
            if (!cellCode || !cellCode.trim() || cellCode == lastQuery.sql) {
                $scope.loadQuery($scope.cell, lastQuery);
            }
        }
    };

    $scope.$on("history-first-time-loaded", initLastQuery);
    if ($scope.notebookTmpState.history) {
        initLastQuery();
    }
});


app.directive('sqlNotebookCell', function(DataikuAPI, $stateParams){
    return {
        link : function(scope, element, attrs) {
            if (scope.cells.length == 1) {
                scope.cell.$localState.unfolded = true;
            }
            scope.$watch("cell.$localState", scope.saveLocalStates, true);

            scope.toggleCell = function() {
                scope.cell.$localState.unfolded = !scope.cell.$localState.unfolded;
            };

            $(element).focus(function(){
                scope.selectCell(scope.$index);
                scope.$apply();
            });
        }
    };
});


app.directive('sqlNotebookQueryCell', function($stateParams, DataikuAPI){
    return {
        templateUrl:'/templates/notebooks/sql-notebook-query-cell.html',
        controller: 'SqlNotebookQueryCellController',
        link : function(scope, element, attrs) {
            scope.cell.$localState.query = scope.cell.$localState.query || {};

            scope.cell.$tmpState.error = function(a,b,c){
                if ($('.local-api-error', element).length > 0) {
                    setErrorInScope.bind($('.local-api-error', element).scope())(a,b,c);
                }
            };

            scope.cell.$tmpState.clearError = function(){
                if ($('.local-api-error', element).length > 0) {
                    resetErrorInScope($('.local-api-error', element).scope());
                }
            };

            $(element).on('click', '.CodeMirror-gutters', function() {
                if (scope.cell.$localState.selected) {
                    scope.foldQuery(true);
                    scope.$apply();
                }
            });
        }
    };
});


app.directive('sqlNotebookQuerySingleCell', function(){
    return {
        templateUrl:'/templates/notebooks/sql-notebook-query-single-cell.html',
        controller: 'SqlNotebookQueryCellController',
        link : function(scope, element, attrs) {
            scope.cell.$tmpState.error = function(a,b,c){
                if ($('.local-api-error', element).length > 0) {
                    setErrorInScope.bind($('.local-api-error', element).scope())(a,b,c);
                }
            };
            scope.cell.$tmpState.clearError = function(){
                if ($('.local-api-error', element).length > 0) {
                    resetErrorInScope($('.local-api-error', element).scope());
                }
            };
        }
    }
});


app.directive('localApiError', function(){
    return {
        scope: {}
    }
});


app.directive('sqlNotebookMdCell', function(DataikuAPI, $stateParams){
    return {
        templateUrl :'/templates/notebooks/sql-notebook-md-cell.html',
        link : function(scope, element, attrs) {
            scope.cell.$localState.tmpCode = scope.cell.code;
            scope.ok = function() {
                scope.cell.code = scope.cell.$localState.tmpCode;
                scope.cell.$tmpState.mdCellEditModeOn = false;
            }
            if (scope.cell.$localState.unfolded === undefined) {
                scope.cell.$localState.unfolded = true;
            }
        }
    };
});


app.directive('sqlNotebookMdSingleCell', function(DataikuAPI, $stateParams){
    return {
        templateUrl :'/templates/notebooks/sql-notebook-md-single-cell.html',
        link : function(scope, element, attrs) {
            scope.cell.$localState.tmpCode = scope.cell.$localState.tmpCode || scope.cell.code;
            scope.ok = function() {
                scope.cell.code = scope.cell.$localState.tmpCode;
                scope.cell.$tmpState.mdCellEditModeOn = false;
            };
        }
    };
});

app.controller("sqlNotebookPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, ActiveProjectKey, DataikuAPI) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.notebook = (await DataikuAPI.sqlNotebooks.get(ActiveProjectKey.get(), $stateParams.notebookId)).data;

    $scope.selection = {
        selectedObject : {
            projectKey : ActiveProjectKey.get(),
            name : $scope.notebook.name,
            id : $scope.notebook.id,
            nodeType : 'SQL_NOTEBOOK',
            interest : {},
            language : $scope.notebook.language
        },
        confirmedItem : {
            projectKey : ActiveProjectKey.get(),
            name : $stateParams.name,
            id : $scope.notebook.id,
            nodeType : 'SQL_NOTEBOOK',
            interest : {},
            language : $scope.notebook.language
        }
    };

    function updateUserInterests() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "SQL_NOTEBOOK", ActiveProjectKey.get(), $scope.selection.selectedObject.id)
            .success(function(data) {
                $scope.selection.selectedObject.interest = data;
            }).error(setErrorInScope.bind($scope));
    }

    updateUserInterests();
    const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);

    $scope.$on("$destroy", interestsListener);
});

app.directive('sqlNotebookRightColumnSummary', function(DataikuAPI, $stateParams, QuickView, NotebooksUtils, $controller, ActiveProjectKey, ActivityIndicator, WT1, CreateModalFromTemplate){
    return {
        templateUrl :'/templates/notebooks/sql-notebook-right-column-summary.html',

        link : function(scope, element, attrs) {

            $controller('_TaggableObjectsMassActions', {$scope: scope});
            $controller('_TaggableObjectsCapabilities', {$scope: scope});

            scope.QuickView = QuickView;

            /* Auto save when summary is modified */
            scope.$on("objectSummaryEdited", function(){
                DataikuAPI.sqlNotebooks.save(scope.notebook).success(function(data){
                    ActivityIndicator.success("Saved");
                })
                .error(setErrorInScope.bind(scope));
            });

            scope.saveCustomFields = function(newCustomFields) {
                WT1.event('custom-fields-save', {objectType: 'SQL_NOTEBOOK'});
                let oldCustomFields = angular.copy(scope.notebook.customFields);
                scope.notebook.customFields = newCustomFields;
                return DataikuAPI.sqlNotebooks.save(scope.notebook).success(function(data) {
                        scope.refreshTimeline();
                        HistoryService.notifyRenamed({
                            type: "SQL_NOTEBOOK",
                            id: scope.notebook.id,
                            projectKey: scope.notebook.projectKey
                        }, scope.notebook.name);
                        $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), scope.notebook.customFields);
                    }).error(function(a, b, c) {
                        scope.notebook.customFields = oldCustomFields;
                        setErrorInScope.bind(scope)(a, b,c);
                    });
            };

            scope.editCustomFields = function() {
                if (!scope.notebook) {
                    return;
                }
                let modalScope = angular.extend(scope, {objectType: 'SQL_NOTEBOOK', objectName: scope.notebook.name, objectCustomFields: scope.notebook.customFields});
                CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                    scope.saveCustomFields(customFields);
                });
            };

            scope.refreshData = function(){
                DataikuAPI.sqlNotebooks.get(ActiveProjectKey.get(), scope.selection.selectedObject.id).success(function(data){
                    scope.notebookData = {notebook: data, timeline: scope.notebookTimeline};
                    scope.notebook = data;
                }).error(setErrorInScope.bind(scope));
            }

            scope.refreshTimeline = function(projectKey) {
                if (!scope.selection.selectedObject) return;
                var pkey = scope.selection.selectedObject.projectKey;
                var id = scope.selection.selectedObject.id;
                DataikuAPI.timelines.getForObject(projectKey || ActiveProjectKey.get(), "SQL_NOTEBOOK", scope.selection.selectedObject.id).success(function(data){
                    if (!scope.selection.selectedObject || scope.selection.selectedObject.projectKey != pkey || scope.selection.selectedObject.id != id) {
                        return; // too late!
                    }
                    scope.notebookTimeline = data;
                    if (scope.notebookData) scope.notebookData.timeline = data;
                }).error(setErrorInScope.bind(scope));
            };

            scope.$watch("selection.selectedObject", function(nv, ov) {
                if (!nv) return;
                scope.notebookData = {notebook: nv, timeline: scope.notebookTimeline};
                if(scope.selection.confirmedItem != scope.selection.selectedObject) {
                    scope.notebookTimeline = null;
                }
            });

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) return;
                scope.refreshTimeline(nv.projectKey);
                scope.refreshData();
            });

            scope.$watch('notebook', function(nv, ov){
                if (ov && nv && nv.name == ov.name && !angular.equals(nv.tags, ov.tags)) {
                    DataikuAPI.sqlNotebooks.save(scope.notebook).success(function(data){
                    }).error(setErrorInScope.bind(scope));
                }
            }, true);

            scope.getNotebookIcon = function(item) {
                return NotebooksUtils.getNotebookIcon(item);
            };
        }
    }
});


app.directive('sqlTableExplorer', function($stateParams, $filter, DataikuAPI, SQLExplorationService, Debounce, Logger){
    function generateOnlyLastCall() {
        var ref = null;
        return function() {
            ref = {};
            var curr = ref;
            return function() {
                return curr === ref;
            };
        };
    }

    return {
        templateUrl :'/templates/notebooks/sql-explorer.html',
        restrict: 'E',
        scope : {
            connection: '=',
            connectionDetails: '=',
            notebook: '=',
            onTableClicked: '&?',
            onFieldClicked: '&?'
        },

        link : function(scope) {
            scope.uiState = {
                confirmListTablesFromDB: false, // listing from DB requires user explicit action
                fetchingTables: true
            };
            scope.sortBy = [
                { value: 'DATASET', label: 'Dataset name' },
                { value: 'TABLE', label: 'Table name' }
            ];

            var lastFetchSpecs = null;
            var ignorePreviousListSQLTables = generateOnlyLastCall();
            function load() {
                Logger.info('Init SQL explorer');
                if(!scope.connection) {
                    scope.tables = [];
                    rebuildFatList();
                } else {
                    if (scope.notebook.tableListingMode === 'ALL' && !scope.uiState.confirmListTablesFromDB) {
                        return;
                    }
                    var fetchSpecs = {mode:scope.notebook.tableListingMode, connection:scope.connection, projectKey:$stateParams.projectKey};
                    if (scope.uiState.fetchingTables && angular.equals(lastFetchSpecs, fetchSpecs)) {
                        Logger.info('Same table list fetch is already ongoing');
                    	return;
                    }
                    lastFetchSpecs = fetchSpecs;
                    var isLast = ignorePreviousListSQLTables();
                    scope.uiState.fetchingTables = true;

                    scope.catalogAwareDatabase = scope.connectionDetails.type === 'BigQuery' || scope.connectionDetails.type === 'Snowflake';
                    (scope.notebook.tableListingMode === 'PROJECT'
                        ? SQLExplorationService.listTablesFromProject(scope.connection, $stateParams.projectKey)
                        : SQLExplorationService.listTables(scope.connection, $stateParams.projectKey))
                    .then(function(tables) {
                        if(!isLast()) {
                            return;
                        }
                        scope.uiState.fetchingTables = false;
                        let schemas;
                        if (!scope.catalogAwareDatabase || (scope.notebook.tableListingMode === 'PROJECT' && scope.notebook.tableOrdering === 'DATASET')) {
                            // Build classic "Schema > Table" hierarchy
                            let hasNull = false;
                            let tablesBySchema = {};
                            $.each(tables, function(index, table) {
                                let schema = table.schema;
                                if (!schema) {
                                    hasNull = true;
                                    schema = '(default)';
                                }
                                if (!tablesBySchema[schema]) {
                                    tablesBySchema[schema] = [];
                                }
                                tablesBySchema[schema].push(table);
                            });
                            scope.singleCatalog = true;
                            scope.singleSchema = Object.keys(tablesBySchema).length === 1;
                            scope.schemalessDatabase = scope.singleSchema && hasNull;
                            schemas = $.map(tablesBySchema, function(v, k) {
                                return {
                                    name: k,
                                    tables: v.sort(function(a, b) {
                                        return a.table.localeCompare(b.table);
                                    }),
                                    state: { shown: scope.singleSchema }
                                };
                            });
                        } else {
                            // Build "Catalog > Schema > Table" hierarchy
                            let tablesByCatalogAndSchema = {};
                            $.each(tables, function(index, table) {
                                let schema = table.schema;
                                if (!schema) {
                                    schema = '(default)';
                                }
                                let catalog = table.catalog;
                                if (!catalog) {
                                    catalog = '(default)';
                                }
                                if (!tablesByCatalogAndSchema[catalog]) {
                                    tablesByCatalogAndSchema[catalog] = {};
                                }
                                if (!tablesByCatalogAndSchema[catalog][schema]) {
                                    tablesByCatalogAndSchema[catalog][schema] = [];
                                }
                                tablesByCatalogAndSchema[catalog][schema].push(table);
                            });
                            scope.singleCatalog = Object.keys(tablesByCatalogAndSchema).length === 1;
                            scope.singleSchema = false;
                            scope.schemalessDatabase = false;
                            schemas = $.map(tablesByCatalogAndSchema, function(v, k) {
                                return {
                                    name: k,
                                    schemas: $.map(v, function(sv, sk) {
                                        return {
                                            name: sk,
                                            tables: sv.sort(function(a, b) {
                                                return a.table.localeCompare(b.table);
                                            }),
                                            state: { shown: false }
                                        }
                                    }),
                                    state: { shown: scope.singleCatalog }
                                };
                            });
                        }
                        if (scope.notebook.tableListingMode === 'PROJECT') {
                            scope.schemasRestrictedToProject = schemas;
                        } else {
                            scope.schemasAll = schemas;
                        }
                        rebuildFatList();
                    });
                }
            }

            function loadAndRebuildFatList() {
                load();
                rebuildFatList();
            }

            scope.$watch('connection', load);
            scope.$watch('uiState.confirmListTablesFromDB', load);

            scope.refreshTableList = function() {
                SQLExplorationService.clearCache();
                load();
            };

            scope.openTable = function(table) {
                SQLExplorationService.listFields(scope.connection,[table]).then(function(data) {
                     table.fields = data;
                     rebuildFatList();
                });
            };

            scope.closeTable = function(table) {
                table.fields = undefined;
                rebuildFatList();
            };

            scope.toggleTable = function(table) {
                if(table.fields) {
                    scope.closeTable(table);
                } else {
                    scope.openTable(table);
                }
            };

            scope.toggleCatalog = function(catalog) {
                catalog.state.shown = !catalog.state.shown;
                rebuildFatList();
            };

            scope.toggleSchema = function(schema) {
                schema.state.shown = !schema.state.shown;
                rebuildFatList();
            };

            scope.filterSort = {};

            /**
             * Builds a fat list from a "Schema > Table" hierarchy
             */
            var makeSchemaTableFieldFatList = function(schemas, query) {
                let displayedSchemas = [];
                for (const schema of Object.values(schemas)) {
                    let tables = filterTables(schema.tables, query);
                    if (tables.length > 0) {
                        displayedSchemas.push({
                            name: schema.name,
                            tables: tables,
                            state: schema.state
                        });
                    }
                }

                if (displayedSchemas.length === 1) {
                    displayedSchemas[0].state.shown = true;
                }

                let fatList = [];
                for (const schema of Object.values(displayedSchemas)) {
                    if (!scope.schemalessDatabase) {
                        fatList.push({ type: 's', schema: schema, class: "schema-item" });
                    }
                    if (schema.state.shown) {
                        schema.tables.forEach(function(table, k) {
                            let clazz = k % 2 ? 'even' : 'odd';
                            fatList.push({ type: 't', table: table, 'class': (scope.schemalessDatabase ? 'flat-table-item' : 'table-item') + ' ' + clazz });
                            if (table.fields) {
                                table.fields.forEach(function(f) {
                                    fatList.push({ type: 'f', field: f, 'class': (scope.schemalessDatabase ? 'field-item' : 'flat-field-item') + ' ' + clazz });
                                });
                                if (table.fields.length === 0) {
                                    fatList.push({ type: 'nf', 'class': (scope.schemalessDatabase ? 'flat-nofield-item' : 'nofield-item') + ' ' + clazz });
                                }
                            }
                        });
                    }
                }
                return fatList;
            };

            /**
             * Builds a fat list from a "Catalog > Schema > Table" hierarchy
             */
            var makeCatalogSchemaTableFieldFatList = function(catalogs, query) {
                let displayedCatalogs = [];
                for (const catalog of Object.values(catalogs)) {
                    let displayedSchemas = [];
                    for (const schema of Object.values(catalog.schemas)) {
                        let tables = filterTables(schema.tables, query);
                        if (tables.length > 0) {
                            displayedSchemas.push({
                                name: schema.name,
                                tables: tables,
                                state: schema.state
                            });
                        }
                    }
                    if (displayedSchemas.length > 0) {
                        displayedCatalogs.push({
                            name: catalog.name,
                            schemas: displayedSchemas,
                            state: catalog.state
                        });
                    }
                }

                if (displayedCatalogs.length === 1) {
                    displayedCatalogs[0].state.shown = true;
                    if (displayedCatalogs[0].schemas.length === 1) {
                        displayedCatalogs[0].schemas[0].state.shown = true;
                    }
                }

                let fatList = [];
                for (const catalog of Object.values(displayedCatalogs)) {
                    fatList.push({ type: 'c', catalog: catalog });
                    if (catalog.state.shown) {
                        for (const schema of Object.values(catalog.schemas)) {
                            fatList.push({ type: 's', schema: schema, class: "catalog-schema-item" });
                            if (schema.state.shown) {
                                schema.tables.forEach(function(table, k) {
                                    let clazz = k % 2 ? 'even' : 'odd';
                                    fatList.push({ type: 't', table: table, 'class': 'catalog-table-item ' + clazz });
                                    if (table.fields) {
                                        table.fields.forEach(function(f) {
                                            fatList.push({ type: 'f', field: f, 'class': 'catalog-field-item ' + clazz });
                                        });
                                        if (table.fields.length === 0) {
                                            fatList.push({ type: 'nf', 'class': 'catalog-nofield-item ' + clazz });
                                        }
                                    }
                                });
                            }
                        }
                    }
                }
                return fatList;
            };

            var makeDatasetFieldFatList = function(schemas, query) {
                let tables = [];
                for (const schema of Object.values(schemas)) {
                    tables.push.apply(tables, filterTables(schema.tables, query)); //in place concat
                }
                tables.sort(function(a, b) {
                    return a.dataset.localeCompare(b.dataset);
                });

                let fatList = [];
                tables.forEach(function(table, k) {
                    var clazz = k % 2 ? 'even' : 'odd';
                    fatList.push({ type: 't', table: table, 'class': clazz });
                    if (table.fields) {
                        table.fields.forEach(function(f) {
                            fatList.push({ type: 'f', field: f, 'class': clazz });
                        });
                        if (table.fields.length === 0) {
                            fatList.push({ type: 'nf', 'class': clazz });
                        }
                    }
                });
                return fatList;
            };

            var filterTables = function(tables, query) {
                angular.forEach(query.split(/\s+/), function(token){
                    token = token.toLowerCase();
                    if (token.length) {
                        tables = $.grep(tables, function(item){
                            return item.table.toLowerCase().indexOf(token) >= 0 ||
                            (item.schema && item.schema.toLowerCase().indexOf(token) >= 0);
                        });
                    }
                });
                return tables;
            };

            var rebuildFatList = Debounce().withScope(scope).withDelay(10,200).wrap(function() {
                let query = scope.filterSort.tableFilter || '';
                let schemas = (scope.notebook.tableListingMode == 'PROJECT' ? scope.schemasRestrictedToProject : scope.schemasAll) || [];
                if (scope.notebook.tableListingMode == 'PROJECT' && scope.notebook.tableOrdering == 'DATASET') {
                    scope.fatList = makeDatasetFieldFatList(schemas, query);
                } else {
                    if (scope.catalogAwareDatabase) {
                        scope.fatList = makeCatalogSchemaTableFieldFatList(schemas, query);
                    } else {
                        scope.fatList = makeSchemaTableFieldFatList(schemas, query);
                    }
                }
                scope.$broadcast("reflow"); // update fat repeat layout
            });

            scope.$watch('filterSort', rebuildFatList, true);
            scope.$watch('notebook.tableListingMode', loadAndRebuildFatList);
            scope.$watch('notebook.tableOrdering', loadAndRebuildFatList);
        }
    };
});

})();
