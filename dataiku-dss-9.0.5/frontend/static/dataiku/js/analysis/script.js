(function() {
'use strict';


const app = angular.module('dataiku.analysis.script', []);

/**
 * This acts as the controller of the analysis script page.
 * It is a directive for easy composition with the common shaker stuff
 *
 * It is loaded after shakerExploreBase
 */
app.directive("analysisScript", function($q, Assert, DataikuAPI, WT1, TopNav, DatasetUtils, computeColumnWidths) {
    return {
        scope: true,
        controller: function($scope, $stateParams, $state) {

            /* ********************* Callbacks for shakerExploreBase ******************* */

            var savedParams;

            $scope.shakerHooks.saveForAuto = function() {
                Assert.inScope($scope, 'analysisCoreParams');
                var deferred = $q.defer();

                var toSave = angular.copy($scope.analysisCoreParams);
                // fat-free
                toSave.script = $scope.getShakerData();
                savedParams.script = savedParams.script || {};
                savedParams.script.origin = "ANALYSIS";
                if (angular.equals($scope.analysisCoreParams.script, savedParams.script)) {
                	deferred.resolve();
                    return deferred.promise;
                }
                DataikuAPI.analysis.saveCore(toSave).success(function(data) {
                    // Reset modification detector
                    $scope.originalShaker = toSave.script;
                    deferred.resolve();
                }).error(setErrorInScope.bind($scope));
                return deferred.promise;
            };

            $scope.shakerHooks.setColumnMeaning = function(column, newMeaning) {
                Assert.inScope($scope, 'shaker');
                Assert.trueish($scope.shaker.analysisColumnData, 'analysisColumnData is null');

                var colData = $scope.shaker.analysisColumnData[column.name];
                if (!colData){
                    colData = {}
                    $scope.shaker.analysisColumnData[column.name] = colData;
                }
                colData.meaning = newMeaning;

                $scope.autoSaveAutoRefresh();
            };

            $scope.shakerHooks.updateColumnDetails = function(column) {
                Assert.inScope($scope, 'shaker');
                Assert.trueish($scope.shaker.analysisColumnData, 'analysisColumnData is null');

                $scope.shaker.analysisColumnData[column.name] = column;
                $scope.autoSaveAutoRefresh();
            };

            $scope.shakerHooks.updateColumnWidth = function(name, width) {
                Assert.inScope($scope, 'shaker');
                Assert.trueish($scope.shaker.columnWidthsByName, 'columnWidthsByName is null');

                $scope.shaker.columnWidthsByName[name] = width;
                $scope.autoSaveAutoRefresh();
            };

            $scope.clearResize = function() {
                Assert.inScope($scope, 'shaker');
                Assert.trueish($scope.shaker.columnWidthsByName, 'columnWidthsByName is null');

                const minColumnWidth = 100;
                $scope.shaker.columnWidthsByName = computeColumnWidths($scope.table.initialChunk, $scope.table.headers, minColumnWidth, $scope.hasAnyFilterOnColumn, $scope.shaker.columnWidthsByName, true)[1];
                $scope.autoSaveAutoRefresh();
            }

            /* ********************* Misc stuff ******************* */

            /* BEGIN DIRTY TO DESTROY */

            $scope.$watch("projectSummary", function(nv, ov) {
                $scope.shakerWritable = $scope.isProjectAnalystRW();
                $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            });

            /* END DIRTY TO DESTROY */

            /* ********************* Main ******************* */

            WT1.event("analysis-script-open");
            TopNav.setLocation(TopNav.TOP_ANALYSES, null, TopNav.TABS_ANALYSIS, "script");
            TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId);

            // Verify that shakerExploreBase is loaded
            Assert.inScope($scope, 'shakerState');
            Assert.inScope($scope, 'shakerHooks');

            $scope.shakerState.isInAnalysis = true;
            $scope.shakerState.origin = "ANALYSIS";

            DataikuAPI.analysis.getCore($stateParams.projectKey, $stateParams.analysisId).success(function(data) {
                var inputDatasetLoc = DatasetUtils.getLocFromSmart($stateParams.projectKey, data.inputDatasetSmartName);
                // set the context required for baseInit
                $scope.inputDatasetProjectKey = inputDatasetLoc.projectKey;
                $scope.inputDatasetName = inputDatasetLoc.name;
                $scope.inputDatasetSmartName = data.inputDatasetSmartName;
                $scope.analysisDataContext.inputDatasetLoc = inputDatasetLoc;
                $scope.baseInit();

                $scope.analysisCoreParams = data;
                savedParams = angular.copy(data);

                TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId, {name:data.name, dataset : data.inputDatasetSmartName});
                TopNav.setPageTitle(data.name);

                // Load shaker and call initial refresh

                $scope.shaker = data.script;
                $scope.shaker.origin = "ANALYSIS";
                $scope.originalShaker = angular.copy($scope.shaker.script);

                $scope.fixupShaker();
                $scope.requestedSampleId = null;
                $scope.refreshTable(false);

                // TODO @analysis
                // TopNav.setItemData({"name" : data.name })

            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("visualMlAccessCheck", function() {	
    return {	
        restrict: 'A',
        transclude: true,
        templateUrl: '/templates/analysis/visual-ml-access-check.html'
    }	
});

app.directive('datasetColumnsViewColumn', function(Assert, CreateModalFromTemplate, ContextualMenu, $state, DataikuAPI, WT1) {
    return {
        restrict: 'A',
        replace: false,
        scope: false,
        link: function(scope, element, attrs) {
            scope.isType = function(x) {
                return this.column.selectedType.name == x;
            };

            scope.possibleMeanings = [];
            scope.$watch("column.possibleTypes", function() {
            	if (scope.column.possibleTypes == null) return;
            	scope.possibleMeanings = $.map(scope.column.possibleTypes, function(t) {
            		return t.name;
            	});
            });

            scope.setColumnMeaning = function(newMeaning) {
                Assert.trueish(scope.shakerHooks.setColumnMeaning, 'no setColumnMeaning function');
                scope.shakerHooks.setColumnMeaning(scope.column, newMeaning);
            };

            scope.editColumnUDM = function(){
                CreateModalFromTemplate("/templates/meanings/column-edit-udm.html", scope, null, function(newScope){
                    newScope.initModal(scope.column.name, scope.setColumnMeaning);
                });
            }
        }
    };
});

app.directive("analysisColumns", function(Fn, ListFilter, DataikuAPI, Logger,
            CreateModalFromDOMElement, CreateModalFromTemplate,
            Debounce, MonoFuture, $filter, ShakerSuggestionsEngine, $stateParams) {

    var extractName = Fn.prop('name'),
        compInfos = ['cardinality', 'mode', 'min', 'max', 'mean', 'sum', 'median', 'stddev'],
        validInfos = ['okPercentage', 'nokPercentage', 'emptyPercentage', 'nonemptyPercentage'],
        extraInfos = ['missingCount', 'presentCount', 'invalidCount'];

    function refreshColumns($scope) {
        var cf = $scope.columnFilter;
        cf._cols = $scope.table.headers;
        cf.types = cf._cols.map(Fn.prop(['selectedType', 'name'])).filter(Fn.unique()).sort();
        cf.hasFetchedInfos = false;
        cf.hasFetchedFullInfos = false;
        cf.hasFetchedFullInfosForPartitionId = null;
        updateColumnsInfo($scope);
        if ($scope.clearQuickColumnsCache) {
            $scope.clearQuickColumnsCache();
        }
    }

    function copyPropFromData(data, fromProp, c, toProp) {
        c[toProp] = c.name in data && fromProp in data[c.name] ? data[c.name][fromProp] : null;
    }

    function fetchFullInfo($scope, callback) {
        var cf = $scope.columnFilter;
        cf.hasFetchedFullInfos = null;
        var partitionId = $scope.uiState.fullPartitionId;
        DataikuAPI.shakers.multiColumnFullAnalysis($stateParams.projectKey,
            $scope.inputDatasetProjectKey, $scope.inputDatasetName, $scope.shakerHooks.shakerForQuery()
                , partitionId, cf._cols.map(extractName)).success(function(data) {
            compInfos.forEach([].forEach.bind(cf._cols, function(c) {
                copyPropFromData(data, this, c, 'full_comp_' + this);
                copyPropFromData(data, this + '_current', c, 'full_comp_' + this + '_current');
                copyPropFromData(data, this + '_reason', c, 'full_comp_' + this + '_reason');
            }));
            validInfos.forEach([].forEach.bind(cf._cols, function(c) {
                copyPropFromData(data, this, c, 'full_' + this);
                copyPropFromData(data, this + '_current', c, 'full_' + this + '_current');
                copyPropFromData(data, this + '_reason', c, 'full_' + this + '_reason');
            }));
            extraInfos.forEach([].forEach.bind(cf._cols, function(c) {
                copyPropFromData(data, this, c, 'full_' + this);
            }));
            cf.hasFetchedFullInfos = true;
            cf.hasFetchedFullInfosForPartitionId = partitionId;
            callback($scope);
        }).error(setErrorInScope.bind($scope));
    }

    function fetchInfo($scope, callback) {
        var cf = $scope.columnFilter;
        cf.hasFetchedInfos = null;
        $scope.monoFetch.exec(
            DataikuAPI.shakers.multiColumnAnalysis(
                $stateParams.projectKey,
                $scope.inputDatasetProjectKey, $scope.inputDatasetName, $scope.inputStreamingEndpointId, $scope.shakerHooks.shakerForQuery(),
                $scope.requestedSampleId, cf._cols.map(extractName), '*'))
        .success((function(data) {
                if (!data.hasResult) return;
                data = data.result;
                compInfos.forEach([].forEach.bind(cf._cols, function(c) {
                    copyPropFromData(data, this, c, 'comp_' + this);
                }));
                cf.hasFetchedInfos = true;
                callback($scope);
            }).bind(this))
        .error(setErrorInScope.bind($scope));
    }

    function prepareInfoValuesForDisplay(cf) {
        var comp = cf.info.substr(0, 5) === 'comp_';
        if (comp) {
            cf._cols.forEach(function(c) {
                if (c.info === null || this === 'comp_cardinality') { /* no special formatting */ }
                else switch (c.selectedType.name) {
                case 'DoubleMeaning':
                    c.info = c.info.toFixed(4);
                    break;
                case 'Date':
                    if (this == 'comp_sum') {
                        c.info = null; // sum is meaningless for dates
                    } else {
                        c.info = $filter(this === 'comp_stddev' ? 'friendlyDurationShort' : 'date')(c.info);
                    }
                    break;
                default:
                    if (['comp_mean', 'comp_sum', 'comp_average', 'comp_stddev'].indexOf(this) > -1) {
                        c.info = c.info.toFixed(4);
                    }
                }
            }, cf.info);
        } else {
            if (cf.info.substr(-10) === 'Percentage') {
                cf._cols.forEach(function(c) { c.info = c.info != null ? c.info.toFixed(2) + '%' : null; });
            }
        }
    }

    function updateColumnsInfo($scope) {
        var cf = $scope.columnFilter;
        if (!cf._cols || cf._cols.length===0) {return;}
        if ($scope.uiState.useFullSampleStatistics) {
            if (cf.hasFetchedFullInfos == false || (cf.hasFetchedFullInfos == true && cf.hasFetchedFullInfosForPartitionId != $scope.uiState.fullPartitionId)) {
                fetchFullInfo($scope, function() {
                    updateColumnsInfo($scope);
                    if (cf.validity.valid || cf.validity.invalid || cf.validity.missing) {
                        filterColumns($scope);
                    }
                });
            } else if (cf.hasFetchedFullInfos == true) {
                cf._cols.forEach(Fn.assign('info', Fn.prop('full_' + cf.info))); // put the info in the column object
                cf._cols.forEach(Fn.assign('info_current', Fn.prop('full_' + cf.info + '_current')));
                cf._cols.forEach(Fn.assign('info_reason', Fn.prop('full_' + cf.info + '_reason')));
                prepareInfoValuesForDisplay(cf);
            }
        } else {
            if (cf.hasFetchedInfos == false) {
                fetchInfo($scope, function() {
                    updateColumnsInfo($scope);
                });
            } else if (cf.hasFetchedInfos == true) {
                cf._cols.forEach(Fn.assign('info', Fn.prop(cf.info))); // put the info in the column object
                prepareInfoValuesForDisplay(cf);
            }
        }
    }

    function selectActions($scope) {
        if ($scope.selection === undefined || $scope.selection.selectedObjects === undefined) {return;}
        var selectedObjects = $scope.selection.selectedObjects;
        if (selectedObjects.length === 0) {
            $scope.massColumnActions = $scope.massColumnActions2 = $scope.hasMoreMassColumnActions =
                $scope.suggestedTypes = $scope.otherTypes = null;
            return;
        }
        var maps = ShakerSuggestionsEngine.computeColumnSuggestions(selectedObjects, CreateModalFromDOMElement,
                CreateModalFromTemplate, undefined, undefined, $scope.appConfig),
            colTypes = selectedObjects.map(Fn.prop('possibleTypes')).filter(Array.isArray)
                .map(function (pts) { return pts.map(extractName); });
        $scope.massColumnActions = maps[0];
        $scope.massColumnActions2 = maps[1];
        $scope.hasMoreMassColumnActions = maps[2] > 0;
        var suggestedTypesNames = colTypes.slice(1).reduce(
                function(ts, ts2) { return ts.filter(Fn.inArray(ts2)); }, colTypes[0]);
        $scope.otherTypes = [];
        $scope.suggestedTypes = [];
        angular.forEach($scope.types, function(v,k) {
            if (Fn.not(Fn.inArray(suggestedTypesNames))(k)) {
                $scope.otherTypes.push({id:k, name:v});
            } else {
                $scope.suggestedTypes.push({id:k, name:v});
            }
        });
    }

    return {
        scope: false,
        controller: function($scope) {
            $scope.uiState = {};
            $scope.monoFetch = MonoFuture($scope);
            $scope.columnFilter = {
                _cols: $scope.table.headers,
                info: 'okPercentage',
                types: [],
                validity: { valid: false, invalid: false, missing: false },
            };

            function customFilter(objects) {
                var cf = $scope.columnFilter;
                if (cf.validity.valid || cf.validity.invalid || cf.validity.missing) {
                    objects = objects.filter((function(v, i, m, o) {
                        return (v && o.selectedType.nbNOK + o.selectedType.nbEmpty === 0)
                            || (i && o.selectedType.nbNOK   > 0)
                            || (m && o.selectedType.nbEmpty > 0);
                    }).bind(null, cf.validity.valid, cf.validity.invalid, cf.validity.missing));
                }
                return objects;
            }

            $scope.selection = {
                customFilter: customFilter,
                customFilterWatch: 'columnFilter.validity',
                orderQuery: '$idx',
            };

            $scope.$watch('table.headers', refreshColumns.bind(null, $scope));
            $scope.$watch('columnFilter.info', updateColumnsInfo.bind(null, $scope));
            $scope.$watch('uiState.useFullSampleStatistics', updateColumnsInfo.bind(null, $scope));
            $scope.$watch('uiState.fullPartitionId', updateColumnsInfo.bind(null, $scope));
            $scope.$watch('selection.selectedObjects', selectActions.bind(null, $scope));

            $scope.deleteColumns = function(selectedColumns) {
                var colNames = selectedColumns.map(Fn.prop('name'));
                $scope.addStepNoPreview('ColumnsSelector', { keep: false, appliesTo: 'COLUMNS', columns: colNames });
                $scope.mergeLastColumnDeleters();
                $scope.autoSaveForceRefresh();
            };
            $scope.renameColumns = function(selectedColumns) {
                var colNames = selectedColumns.map(Fn.prop('name'));
                CreateModalFromTemplate('/templates/shaker/modals/shaker-rename-columns.html', $scope, 'MassRenameColumnsController', function(newScope) {
                    newScope.$apply(function() { newScope.setColumns(colNames); });
                    newScope.doRenameColumns = function(renamings) {
                        var cols = $scope.table.headers;
                        renamings.forEach(function(renaming) {
                            cols.forEach(function(h) { if (h.name === renaming.from) h.name = renaming.to; });
                        });
                        $scope.addStepNoPreview("ColumnRenamer", { renamings : renamings });
                        $scope.mergeLastColumnRenamers();
                        $scope.autoSaveForceRefresh();
                    };
                });
            };
            $scope.changeType = function changeType(selectedColumns, typeName) {
                var colNames = selectedColumns.map(Fn.prop('name'));
                Logger.info("Set meaning", typeName, "on ", colNames);
                colNames.forEach(function(c){
                    $scope.shakerHooks.setColumnMeaning({name:c}, typeName);
                });
                $scope.autoSaveForceRefresh();
            };
            $scope.blur = function() {
                if (document.activeElement.tagName === 'INPUT') { document.activeElement.blur(); }
            };
            $scope.renameColumn = function(column, name) {
                if (column.name !== name) {
                    var old = column.name;
                    column.name = name; // for selection tracking
                    $scope.addStepNoPreviewAndRefresh("ColumnRenamer", {
                        renamings : [
                            { from : old, to : name }
                        ]
                    });
                    $scope.mergeLastColumnRenamers();
                }
            };
            $scope.analyzeColumn = function(column) {
                // Parent's (note the analySe) but prev/next limited to filtered columns
                $scope.analyseColumn(column, $scope.selection.filteredObjects);
            };
            $scope.initColumn = function(columnScope) {
                if (columnScope.column) {
                    var maps = ShakerSuggestionsEngine.computeColumnSuggestions(columnScope.column,
                            CreateModalFromDOMElement, CreateModalFromTemplate, undefined, undefined, $scope.appConfig);
                    columnScope.actions = maps[0];
                    columnScope.actions2 = maps[1];
                    columnScope.name = columnScope.column.name
                }
            };
            $scope.massColumnActions = $scope.massColumnActions2 = [];

            $scope.types = ($scope.appConfig.meanings.labelsMap);
            $scope.columnTypes = function columnTypes(col, probable) {
                var f = Fn.inArray((col.possibleTypes || []).map(extractName));
                f = probable ? f : Fn.not(f);
                var ret = {};
                angular.forEach($scope.types, function(v, k) {
                    if ( f(v) )
                        ret[k] = v;
                });
                return ret;
            };

            $scope.$watch('table.headers', refreshColumns.bind(null, $scope));
            $scope.$watch('columnFilter.info', updateColumnsInfo.bind(null, $scope));
            $scope.$watch('uiState.useFullSampleStatistics', function() {
                updateColumnsInfo.bind(null, $scope)();
            });
            $scope.$watch('uiState.fullPartitionId', function() {
                updateColumnsInfo.bind(null, $scope)();
            });

            // as callback for when the full sample statistics are ready
            $scope.refreshColumnsInfo = function() {
                $scope.columnFilter.hasFetchedFullInfos = false;
                updateColumnsInfo($scope);
            }
        }
    }
});

})();
