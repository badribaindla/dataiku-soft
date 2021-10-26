(function() {
'use strict';

/* Base directives for the "exploration-only" part of shaker */

// Base_explore is the first loaded and creates the module.
const app = angular.module('dataiku.shaker', ['dataiku.filters', 'platypus.utils']);


app.directive("shakerExploreBase", function(Logger, $filter, $rootScope) {

    return {
        scope: true,
        priority : 100,
        controller : function($scope, $stateParams, $state, DataikuAPI, CachedAPICalls, $filter, CreateModalFromTemplate, WT1, ActivityIndicator, $timeout, $q, Debounce, MonoFuture, GraphZoomTrackerService, computeColumnWidths, SmartId){
            $scope.isRecipe = false;

            GraphZoomTrackerService.setFocusItemByName("dataset", $stateParams.datasetName);

            $scope.shakerState = {
                activeView: 'table',
                quickColumnsView: false,

                lockedHighlighting : []
            }

            // Real controller inserts its hooks here
            $scope.shakerHooks = {
                isMonoFuturizedRefreshActive: function(){}, // NOSONAR: OK to have an empty function

                // Returns a promise when save is done
                saveForAuto: undefined,
                // Returns a promise that resolves with a future for the refresh
                getRefreshTablePromise: undefined,

                // Sets the meaning of a column
                setColumnMeaning : undefined,

                // Sets the storage type of a column
                getSetColumnStorageTypeImpact : undefined,
                setColumnStorageType : undefined,

                // Should open a box to edit the details of the column
                // (meaning, storage type, description)
                editColumnDetails : undefined,

                // Hook called in parallel to the table refresh
                onTableRefresh : function(){}, // NOSONAR: OK to have an empty function that does nothing by default
                // Hook called after the table refresh
                afterTableRefresh : function(){}, // NOSONAR: OK to have an empty function that does nothing by default

                // analysis modal :
                // - fetch the detailed analysis of a column
                fetchDetailedAnalysis : undefined,
                // - get clusters
                fetchClusters : undefined,
                // - compute text analysis
                fetchTextAnalysis : undefined
            }

            Mousetrap.bind("r s", function(){
                DataikuAPI.shakers.randomizeColors();
                $scope.refreshTable(false);
            })

            Mousetrap.bind("alt+a", function(){
                $scope.$apply(function(){
                    $scope.shaker.exploreUIParams.autoRefresh = !$scope.shaker.exploreUIParams.autoRefresh;
                    ActivityIndicator.success("Auto refresh is now " +
                        ($scope.shaker.exploreUIParams.autoRefresh ? "enabled" : "disabled"));
                    if ($scope.shaker.exploreUIParams.autoRefresh) {
                        $scope.autoSaveAutoRefresh();
                    }
                });
            })

            $scope.$on("$destroy", function(){
                Mousetrap.unbind("r s");
                Mousetrap.unbind("alt+a")
            })

            function id(dataset) {
                //if the current dataset is foreign, force the use of full dataset names (equi-joiner for example requires it)
                if ($scope.inputDatasetProjectKey != $stateParams.projectKey) {
                    return dataset.projectKey + '.' + dataset.name;
                } else {
                    return dataset.smartName;
                }
            }

            $scope.datasetHref = function() {
                if (!$scope.dataset) {return ''}
                return $state.href('projects.project.datasets.dataset.explore', {datasetName: $scope.dataset.name});
            }
            /** Called by the real controller to fetch required data once context has been set */
            $scope.baseInit = function() {
                if ($scope.inputDatasetName) {

                    if ($rootScope.topNav.isProjectAnalystRO) {
                        DataikuAPI.datasets.getFullInfo($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName).success(function(data){
                            $scope.datasetFullInfo = data;
                        }).error(setErrorInScope.bind($scope));

                        DataikuAPI.datasets.get($scope.inputDatasetProjectKey, $scope.inputDatasetName, $stateParams.projectKey)
                        .success(function(data) {
                            $scope.dataset = data;
                        }).error(setErrorInScope.bind($scope));
                        var opts = {
                            datasetsOnly : true
                        };
                        DataikuAPI.flow.listUsableComputables($stateParams.projectKey, opts).success(function(computables) {
                            $scope.datasetNames = $.map(computables, function(val) {
                                return id(val);
                            });
                        }).error(setErrorInScope.bind($scope));

                        DataikuAPI.datasets.get_types().success(function(data) {
                            $scope.dataset_types = data;
                        }).error(setErrorInScope.bind($scope));

                        $scope.datasetColumns = {};
                        $scope.getDatasetColumns = function(datasetId) { // datasetId is something id() would return
                            // only for input datasets. Only once (we don't care if the schema is changing while we edit the shaker)
                            if ($scope.datasetNames.indexOf(datasetId) >= 0 && !(datasetId in $scope.datasetColumns)) {
                                let resolvedSmartId = SmartId.resolve(datasetId, $stateParams.projectKey);
                                $scope.datasetColumns[datasetId] = [];
                                DataikuAPI.datasets.get(resolvedSmartId.projectKey, resolvedSmartId.id, $stateParams.projectKey).success(function(dataset){
                                    $scope.datasetColumns[datasetId] = $.map(dataset.schema.columns, function(el) {
                                        return el.name;
                                    });
                                    // and let the digest update the UI...
                                }).error(setErrorInScope.bind($scope));
                            }
                            return $scope.datasetColumns[datasetId];
                        };
                    }
                }

                CachedAPICalls.processorsLibrary.success(function(processors){
                    $scope.processors = processors;
                }).error(setErrorInScope.bind($scope));

            }

            /** Real handler calls this once $scope.shaker is set to fixup incomplete scripts */

            $scope.fixupShaker = function(shaker) {
                shaker = shaker || $scope.shaker;
                if (shaker.exploreUIParams == null) {
                    shaker.exploreUIParams = {};
                }
                if (shaker.exploreUIParams.autoRefresh == null) {
                    shaker.exploreUIParams.autoRefresh = true;
                }
                if (shaker.explorationFilters == null) {
                    shaker.explorationFilters = [];
                }
            }

            $scope.$watch("shaker.steps", function(nv, ov){
                if (!nv) return;
                 function _addChange(s) {
                    if (s.metaType == "GROUP") {
                        if (s.steps) {
                            s.steps.forEach(_addChange);
                        }
                    }
                    if (s.$stepState == null) {
                        s.$stepState = {}
                    }
                }
                $scope.shaker.steps.forEach(_addChange);
            }, true);

            $scope.invalidScriptError = {};

            $scope.forgetSample = function() {
                $scope.requestedSampleId = null;
            };


            $scope.saveOnly = function() {
                $scope.shakerHooks.saveForAuto().then(function(){
                    ActivityIndicator.success("Changes saved");
                });
            };

            $scope.getSampleDesc = function() {
                if (!$scope.table) return "-";
                var nbRows = $scope.table ? $scope.table.initialRows : 0;
                var nbCols = $scope.table ? $scope.table.initialCols : 0;
                var desc = '<strong>' + nbRows + '</strong> row';
                if (nbRows > 1) {
                    desc += 's';
                }
                desc += ' <strong>' + nbCols + '</strong> col';
                if (nbCols > 1) {
                    desc += 's';
                }
                return desc;
            }



            $scope.$on('refresh-table',function() {
                $scope.autoSaveForceRefresh();
            });

            /* Save if auto-save is enabled and force a refresh */
            $scope.autoSaveForceRefresh = function() {
                if (!$scope.isRecipe && $scope.canWriteProject()) {
                    $scope.shakerHooks.saveForAuto();
                }
                $scope.refreshTable(false);
            };

            $scope.autoSave = function() {
                if (!$scope.isRecipe && $scope.canWriteProject()) {
                    $scope.shakerHooks.saveForAuto();
                }
            };

            // returns relevant shaker data, a fat-free data only object
            // without the change information.
            $scope.getShakerData = function() {
                // get only own property stuff.
                if ($scope.shaker == undefined)  {
                    return undefined;
                }

                function clearOne(step) {
                    if (step.metaType == "GROUP") {
                        step.steps.forEach(clearOne);
                    } else {
                        delete step.$stepState;
                        delete step.$$hashKey;
                    }
                }

                var shakerData = JSON.parse(JSON.stringify($scope.shaker));
                shakerData.steps.forEach(clearOne);
                return shakerData;
            };

            // formerShakerData is supposed to hold the last shaker state for which we updated
            // the table.
            $scope.setFormerShakerData = function() {
                $scope.formerShakerData = $scope.getShakerData();
            }

            /* Save if auto-save is enabled and refresh if auto-refresh is enabled */
            $scope.autoSaveAutoRefresh = function() {
                var shakerData = $scope.getShakerData();

                if (angular.equals(shakerData, $scope.formerShakerData)) {
                    // nothing has changed, we don't have to do this.
                    return;
                }

                $scope.autoRefreshDirty = true;
                if ($scope.isRecipe){
                    if ($scope.shaker.exploreUIParams.autoRefresh) {
                        $scope.refreshTable(false);
                    }
                } else {
                    if ($scope.shaker.exploreUIParams.autoRefresh) {
                        $scope.shakerHooks.saveForAuto();
                        $scope.refreshTable(false);
                    } else {
                        $scope.saveOnly();
                        $scope.autoRefreshDirty = true;
                        $scope.setFormerShakerData();
                    }
                }
            };

            $scope.getProcessorIcon = function(processor) {
                return getStepIcon(processor.type,processor.params);
            };

            $scope.$on("overrideTableUpdated", function(){
                $scope.autoSaveAutoRefresh();
            });

            function clearErrors(step) {
                step.$stepState.frontError = null;
                step.$stepState.backendError = null;
                if (step.metaType == "GROUP") {
                    step.steps.forEach(clearErrors);
                }
            }

            function mergeChanges(step, change) {
                step.$stepState.change = change;
                step.designTimeReport = change.recordedReport;
                if (step.metaType == "GROUP") {
                    step.steps.forEach(function(substep, i){
                        if (change.groupStepsChanges && change.groupStepsChanges[i]){
                            mergeChanges(substep, change.groupStepsChanges[i]);
                        } else {
                            substep.$stepState.change = null;
                            step.designTimeReport = null;
                        }
                    });
                }
            }
            function mergeBackendErrors(step, errHolder) {
                if (errHolder.error) {
                    step.$stepState.backendError = errHolder.error;
                } else {
                    step.$stepState.backendError = null;
                }
                if (step.metaType == "GROUP") {
                    step.steps.forEach(function(substep, i){
                        if (step.children && step.children[i]){
                            mergeChanges(substep, step.children[i]);
                        } else {
                            substep.$stepState.backendError = null;
                        }
                    });
                }
            }

            $scope.onRefreshFutureDone = function(filtersOnly) {
                $scope.shakerState.runError = null;
                $scope.shakerState.initialRefreshDone = true;
                $scope.requestedSampleId = $scope.future.result.usedSampleId;
                $scope.invalidScriptError = {};

                $scope.shakerState.lockedHighlighting = [];

                $scope.table = $scope.future.result;
                $scope.setSpinnerPosition(undefined);
                $scope.lastRefreshCallTime = (new Date().getTime()-$scope.refreshCallBeg);
                $scope.updateFacetData();

                $scope.shaker.columnsSelection = $scope.table.newColumnsSelection;

                $scope.shaker.steps.forEach(function(step, i){
                    if ($scope.table.scriptChange.groupStepsChanges[i] != null) {
                        mergeChanges(step, $scope.table.scriptChange.groupStepsChanges[i]);
                    }
                })

                $scope.shakerState.hasAnyComment = false;
                $scope.shakerState.hasAnyCustomFields = false;

                var getNoFakeExtremeDoubleDecimalPercentage = function(numerator, denominator) {
                    var result = numerator * 10000 / denominator;
                    switch (Math.round(result)) {
                        case 0:
                            result = result == 0 ? 0 : 1;
                            break;
                        case 10000:
                            result = result == 10000 ? 10000 : 9999;
                            break
                        default:
                            result = Math.round(result);
                    }
                    return result / 100;
                }

                $scope.columns = $.map($scope.table.headers, function(header) {
                    if (header.selectedType) {
                        header.selectedType.totalCount = (header.selectedType.nbOK + header.selectedType.nbNOK + header.selectedType.nbEmpty);
                        header.okPercentage = getNoFakeExtremeDoubleDecimalPercentage(header.selectedType.nbOK, header.selectedType.totalCount);
                        header.emptyPercentage = !header.selectedType.nbEmpty ? 0 : getNoFakeExtremeDoubleDecimalPercentage(header.selectedType.nbEmpty, header.selectedType.totalCount);
                        header.nonemptyPercentage = header.selectedType.nbEmpty == null ? 0 : getNoFakeExtremeDoubleDecimalPercentage(header.selectedType.totalCount - header.selectedType.nbEmpty, header.selectedType.totalCount);
                        header.nokPercentage = !header.selectedType.nbNOK ? 0 : getNoFakeExtremeDoubleDecimalPercentage(header.selectedType.nbNOK, header.selectedType.totalCount);

                        if (header.deletedMeaningName) {
                            header.meaningLabel = header.deletedMeaningName + ' (deleted)';
                        } else {
                            header.meaningLabel = $filter('meaningLabel')(header.selectedType.name);
                        }
                    }

                    /* Check if this column has a comment */
                    if (header.recipeSchemaColumn && header.recipeSchemaColumn.column.comment) {
                        $scope.shakerState.hasAnyComment = true;
                        header.comment = header.recipeSchemaColumn.column.comment
                    }
                    if (header.datasetSchemaColumn && header.datasetSchemaColumn.comment) {
                        $scope.shakerState.hasAnyComment = true;
                        header.comment = header.datasetSchemaColumn.comment
                    }
                    if ($scope.shaker.origin == "ANALYSIS" &&
                       $scope.shaker.analysisColumnData[header.name] &&
                       $scope.shaker.analysisColumnData[header.name].comment) {
                        $scope.shakerState.hasAnyComment = true;
                        header.comment = $scope.shaker.analysisColumnData[header.name].comment;
                    }

                    /* Check if this column has preview custom fields */
                    function addCustomFieldsPreviews(customFields) {
                        const ret = [];
                        const customFieldsMap = $rootScope.appConfig.customFieldsMap['COLUMN'];
                        for (let i = 0; i < customFieldsMap.length; i++) {
                            const selectCFList = (customFieldsMap[i].customFields || []).filter(cf => cf.type == 'SELECT');
                            for (let j = 0; j < selectCFList.length; j++) {
                                const cfDef = selectCFList[j];
                                const value = (cfDef.selectChoices || []).find(choice => choice.value == (customFields && customFields[cfDef.name] || cfDef.defaultValue));
                                if (value && value.showInColumnPreview) {
                                    ret.push({definition: cfDef, value: value});
                                }
                            }
                        }
                        return ret;
                    }
                    $scope.customFieldsMap = $rootScope.appConfig.customFieldsMap['COLUMN'];
                    if (header.recipeSchemaColumn) {
                        header.customFields = header.recipeSchemaColumn.column.customFields;
                    }
                    if (header.datasetSchemaColumn) {
                        header.customFields = header.datasetSchemaColumn.customFields;
                    }
                    if ($scope.shaker.origin == "ANALYSIS" &&
                        $scope.shaker.analysisColumnData[header.name]) {
                        header.customFields = $scope.shaker.analysisColumnData[header.name].customFields;
                    }
                    const cfPreviews = addCustomFieldsPreviews(header.customFields);
                    if (cfPreviews.length > 0) {
                        $scope.shakerState.hasAnyCustomFields = true;
                        header.customFieldsPreview = cfPreviews;
                    }

                    return header.name;
                });
                if ($scope.shakerState.activeView === 'table') {
                    $scope.setQuickColumns();
                    $scope.clearQuickColumnsCache();
                }
                if ($scope.isRecipe && $scope.table.newRecipeSchema) {
                    $scope.recipeOutputSchema = $scope.table.newRecipeSchema;
                }
                $scope.$broadcast("shakerTableChanged");



                getDigestTime($scope, function(time) {
                    $scope.lastRefreshDigestTime = time;
                    $scope.$broadcast("reflow");
                    WT1.event("shaker-table-refreshed", {
                        "activeFFs" : $scope.shaker.explorationFilters.length,
                        "backendTime" : $scope.lastRefreshCallTime,
                        "digestTime" : time,
                        "numCols" : $scope.table.headers.length,
                        "totalKeptRows" : $scope.table.totalKeptRows,
                        "totalRows" : $scope.table.totalRows
                    });
                });
            };
            $scope.onRefreshFutureFailed = function(data, status, headers) {
                $scope.shakerState.runError = null;
                $scope.shakerState.initialRefreshDone = true;
                $scope.setSpinnerPosition(undefined);
                if(data && data.hasResult && data.aborted) {
                    return; // Abortion is not an error
                }
                var apiErr = getErrorDetails(data, status, headers);
                $scope.shakerState.runError = apiErr;

                if (apiErr.errorType == "ApplicativeException" && apiErr.code == "STEP_RUN_EXCEPTION" && apiErr.payload) {
                    $scope.shaker.steps.forEach(function(step, i){
                        if (apiErr.payload.children[i] != null) {
                            mergeBackendErrors(step, apiErr.payload.children[i]);
                        }
                    })
                }
                if ($scope.refreshTableFailed) {
                    $scope.refreshTableFailed(data, status, headers);
                }
            };

            $scope.showWarningsDetails = function(){
                CreateModalFromTemplate("/templates/shaker/warnings-details.html", $scope);
            }

            $scope.markSoftDisabled = function(){
                function _mark(s, isAfterPreview) {
                    if (isAfterPreview) {
                        s.$stepState.softDisabled = true;
                    }
                    if (s.metaType == "GROUP") {
                        if (s.steps) {
                            for (var i = 0; i < s.steps.length; i++) {
                                isAfterPreview = _mark(s.steps[i], isAfterPreview);
                            }
                        }
                    }
                    if (s.preview) {
                        $scope.stepBeingPreviewed = s;
                        return true;
                    }
                    return isAfterPreview
                }
                $scope.stepBeingPreviewed = null;
                var isAfterPreview = false;
                for (var i = 0; i < $scope.shaker.steps.length; i++) {
                    isAfterPreview = _mark($scope.shaker.steps[i], isAfterPreview);
                }
            }

            $scope.hasAnySoftDisabled = function(){
                var hasAny = false;
                function _visit(s) {
                    if (s.metaType == "GROUP") {
                        s.steps.forEach(_visit);
                    }
                    if (s.$stepState.softDisabled) hasAny = true;
                }
                $scope.shaker.steps.forEach(_visit);
                return hasAny;
            }

            // Make sure that every step after a preview is marked soft-disabled
            $scope.fixPreview = function() {
                $scope.markSoftDisabled();
                // var disable = false;
                // for (var i = 0; i < $scope.shaker.steps.length; i++) {
                //     if(disable) {
                //         $scope.shaker.steps[i].disabled = true;
                //     }
                //     if($scope.shaker.steps[i].preview) {
                //         disable=true;
                //     }
                // }
                // #2459
                if ($scope.dataset && $scope.dataset.partitioning && $scope.dataset.partitioning.dimensions){
                    if (!$scope.dataset.partitioning.dimensions.length && $scope.shaker.explorationSampling.selection.partitionSelectionMethod != "ALL") {
                        Logger.warn("Partition-based sampling requested on non partitioned dataset. Force non-partitioned sample.")
                        $scope.shaker.explorationSampling.selection.partitionSelectionMethod = "ALL";
                        delete $scope.shaker.explorationSampling.selection.selectedPartitions;
                    }
                }

            };

            /**
            * Refreshes the whole table
            * Set "filtersOnly" to true if this refresh is only for a change of filters / facets
            */
            $scope.refreshTable = function(filtersOnly){
                CachedAPICalls.processorsLibrary.success(function(){
                    if ($scope.validateScript){
                        if (!$scope.validateScript()) {
                            Logger.info("Aborted refresh: script is invalid");
                            ActivityIndicator.error("Not refreshing: script is invalid !");
                            return;
                        }
                    }
                    $scope.refreshTable_(filtersOnly);
                });
            };

            const refreshDebounce = Debounce();
            $scope.refreshTable_ = refreshDebounce
                .withDelay(100,500)
                .withSpinner(!$scope.refreshNoSpinner)
                .withScope($scope)
                .wrap(function(filtersOnly){
                    if (!angular.isDefined(filtersOnly)) throw new Exception();
                    $scope.fixPreview();
                    var filterRequest = $scope.buildFilterRequest();
                    $scope.setFormerShakerData();

                    $scope.shaker.steps.forEach(clearErrors);

                    $scope.$broadcast("scrollToLine", 0);

                    $scope.refreshCallBeg  = new Date().getTime();
                    $scope.future = null;

                    $scope.shakerHooks.onTableRefresh();

                    $scope.shakerHooks.getRefreshTablePromise(filtersOnly, {"elements": filterRequest})
                    .update(function(future) {
                        $scope.autoRefreshDirty = true;
                        $scope.future = future;
                    }).success(function(future) {
                        $scope.autoRefreshDirty = false;
                        Logger.info("Got table data");
                        $scope.future = future;
                        $scope.onRefreshFutureDone(filtersOnly);
                        $scope.shakerHooks.afterTableRefresh();
                    }).error(function(data,status,headers) {
                        $scope.future = null;
                        $scope.onRefreshFutureFailed(data,status,headers);
                        $scope.shakerHooks.afterTableRefresh();
                    });
            });

            /**
             * Checks weather there is a pending debounced refresh. and if the MonoFuturizedRefresh has an empty refresh queue
             */
            $scope.allRefreshesDone = function() {
                return !refreshDebounce.active() && !$scope.shakerHooks.isMonoFuturizedRefreshActive();
            };

            /**
            * Waits for all RefreshTable calls to be resolved. Returns a promise.
            */
            $scope.waitAllRefreshesDone = function () {
                const deferred = $q.defer();
                const inter = setInterval(
                    function () {
                        if ($scope.allRefreshesDone()) {
                            clearInterval(inter);
                            deferred.resolve();
                        }
                    }, 500);
                return deferred.promise;
            }

            /**
            * Fetches a chunk of the table. Returns a promise.
            * Out of bound is NOT handled, and will throw.
            */
            $scope.getTableChunk = function(firstRow, nbRows, firstCol, nbCols) {
                var deferred = $q.defer();
                var filterRequest = $scope.buildFilterRequest();
                $scope.shakerHooks.getTableChunk(firstRow, nbRows, firstCol, nbCols,
                        {"elements":filterRequest}).success(deferred.resolve)
                .error(function(a,b,c) {
                    deferred.reject();
                    setErrorInScope.bind($scope)(a,b,c)
                });
                return deferred.promise;
            };

            $scope.analyseColumn = function(column, columns) {
                CreateModalFromTemplate("/templates/shaker/analyse-box.html",
                    $scope, "ColumnAnalysisController", function(newScope) {
                        newScope.setColumn(column, columns || $scope.table.headers);
                    }, "analyse-box");
            };

            $scope.editColumnDetails = function(column) {
                CreateModalFromTemplate("/templates/shaker/modals/shaker-edit-column.html",
                    $scope, null, function(newScope) {
                        newScope.setColumn(column);
                    });
            }

            $scope.scrollToColumn = $scope.$broadcast.bind($scope, 'scrollToColumn'); // broadcast to child fattable
            $scope.$watch('shakerState.activeView', function(nv) {
                if ($scope.shakerState.activeView === 'table') {
                    $scope.setQuickColumns();
                }
            });
            $scope.setQuickColumns = function(qc) {
                $scope.quickColumns = qc || ($scope.table && $scope.table.headers || []);
            };
            $scope.clearQuickColumnsCache = function() {
                $scope.quickColumnsCache = {};
            };
            $scope.quickColumns = [];
            $scope.quickColumnsCache = {};

            $scope.setDisplayModeMeaning = function(){
                $scope.shaker.coloring.scheme = "MEANING_AND_STATUS";
                $scope.autoSaveForceRefresh();
            }
            $scope.setDisplayModeValuesAllColumn = function(){
                $scope.shaker.coloring.scheme = "ALL_COLUMNS_VALUES";
                $scope.autoSaveForceRefresh();
            }
            $scope.setDisplayModeSingleColumnValues = function(column){
                $scope.shaker.coloring.scheme = "SINGLE_COLUMN_VALUES";
                $scope.shaker.coloring.singleColumn = column;
                $scope.autoSaveForceRefresh();
            }
            $scope.setDisplayModeIndividualToggleOne = function(column) {
                var c = $scope.shaker.coloring;
                if (c.scheme == "INDIVIDUAL_COLUMNS_VALUES") {

                    if (c.individualColumns.indexOf(column) >=0) {
                        c.individualColumns.splice(c.individualColumns.indexOf(column), 1);
                    } else {
                        c.individualColumns.push(column);
                    }
                } else {
                    c.scheme = "INDIVIDUAL_COLUMNS_VALUES";
                    c.individualColumns = [column];
                }
                $scope.autoSaveForceRefresh();
            }
            $scope.sortDirection = function(column) {
                var sortElem = ($scope.shaker.sorting || []).filter(function(e) {return e.column == column;})[0];
                return sortElem == null ? null : sortElem.ascending;
            };
            $scope.toggleSort = function(column) {
                if ($scope.shaker.sorting == null) {
                    $scope.shaker.sorting = [];
                }
                var sorting = $scope.shaker.sorting;
                if (sorting.length == 1 && sorting[0].column == column) {
                    sorting[0].ascending = !sorting[0].ascending;
                } else {
                    $scope.shaker.sorting = [{column:column, ascending:true}];
                }
                $scope.autoSaveForceRefresh();
            }
            $scope.addSort = function(column) {
                if ($scope.shaker.sorting == null) {
                    $scope.shaker.sorting = [];
                }
                var sorting = $scope.shaker.sorting;
                var matching = sorting.filter(function(s) {return s.column == column;});
                if (matching.length > 0) {
                    matching[0].ascending = !matching[0].ascending;
                } else {
                    $scope.shaker.sorting.push({column:column, ascending:true});
                }
                $scope.autoSaveForceRefresh();
            }

            $scope.openColumnsSelectionModal = function(){
                CreateModalFromTemplate("/templates/shaker/select-columns-modal.html", $scope);
            }
            $scope.openSortSelectionModal = function(){
                CreateModalFromTemplate("/templates/shaker/select-sort-modal.html", $scope);
            }
            $scope.clearSort = function(column) {
                if (column && $scope.shaker.sorting) {
                    var sorting = $scope.shaker.sorting;
                    var matching = sorting.filter(function(s) {return s.column == column;});
                    if (matching.length > 0) {
                        sorting.splice(sorting.indexOf(matching[0]), 1);
                    }
                } else {
                    $scope.shaker.sorting = [];
                }
                $scope.autoSaveForceRefresh();
            }

            $scope.clearResize = function() {
                const minColumnWidth = 100;
                $scope.shaker.columnWidthsByName = computeColumnWidths($scope.table.initialChunk, $scope.table.headers, minColumnWidth, $scope.hasAnyFilterOnColumn, $scope.shaker.columnWidthsByName, true)[1];
                $scope.autoSaveAutoRefresh();
            }

            this.$scope = $scope; // fugly
        }
    }
});

app.directive('quickColumnsView', function(DataikuAPI, Fn, Debounce, MonoFuture, $filter, $stateParams) {
    var COLUMN_CHUNK = 50,
        dateFmt = Fn(function(d){ return new Date(d); }, d3.time.format('%Y-%m-%d %H:%M')),
        numFmt = $filter('smartNumber');
    return {
        scope: true,
        require: '^shakerExploreBase',
        templateUrl: '/templates/shaker/quick-columns-view.html',
        link: function(scope, element, attrs, exploreCtrl) {
            var monoLoad = [];
            scope.$watch('shakerState.quickColumnsView', function(qcv) {
                scope.setShowRightPane(qcv);
                scope.quickColumnsView = scope.shakerState.quickColumnsView;
            });
            scope.initColumnScope = function(cScope) {
                if (!cScope.col) return;
                cScope.activateColBar = scope.activateBar.bind(null, cScope);
            };
            scope.quickColumnsChanged = function() {
                scope.quickColumnsFilterChanged(scope.quickColumnsFilter);
            };
            scope.quickColumnCacheCleared = function() {
                monoLoad.forEach(function(m){ if (m.running) m.abort(); });
            };
            scope.quickColumnsFilter = '';
            scope.quickColumnsFilterChanged = function(nv) {
                scope.quickColumnCacheCleared();
                scope.quickColumnsFiltered = !nv ? scope.quickColumns : scope.quickColumns.filter(
                    function(c) { return c.name.toLowerCase().indexOf(this) >= 0; }, nv.toLowerCase());
                // append MonoFuture at will
                for (var i = monoLoad.length; i < Math.ceil(scope.quickColumnsFiltered.length / COLUMN_CHUNK); i++) {
                    monoLoad[i] = MonoFuture(scope);
                }
            };
            // Can’t use PagedAsyncTableModel because of divergent invalidation policy:
            // cache is kept when closing QCV or filtering columns,
            // but reset when editing shaker steps
            scope.tableModel = function() {
                var model = new fattable.TableModel();
                model.hasCell = Fn.cst(true); // always drawable
                model.getCell = function(i, j, cb) {
                    if (!scope.quickColumnsView) return;
                    var page = Math.floor(i / COLUMN_CHUNK);
                    // Initiate block fetch...
                    loadQuickColumns(page, cb);
                    // ...but render immediately (name, type, validity)
                    cb(scope.quickColumnsFiltered[i]);
                };
                return model;
            };
            function loadQuickColumns(page, cb) {
                if (monoLoad[page].running) return;
                var uncached = scope.quickColumnsFiltered
                    .slice(page * COLUMN_CHUNK, (page + 1) * COLUMN_CHUNK)
                    .map(Fn.prop('name'))
                    .filter(Fn.not(Fn.dict(scope.quickColumnsCache)));
                if (!uncached.length) return;
                monoLoad[page].running = true;
                monoLoad[page].exec(
                    DataikuAPI.shakers.multiColumnAnalysis(
                        $stateParams.projectKey,
                        scope.inputDatasetProjectKey, scope.inputDatasetName, scope.inputStreamingEndpointId,
                        scope.shakerHooks.shakerForQuery(),
                        scope.requestedSampleId, uncached, '*', 40))
                .success(function(data){
                    monoLoad[page].running = false;
                    if (!data.hasResult) return;
                    data = data.result;
                    for (var k in data) {
                        if (data[k].facets) {
                            scope.quickColumnsCache[k] = {
                                values: data[k].facets.counts,
                                labels: data[k].facets.values
                            };
                        } else {
                            scope.quickColumnsCache[k] = { values: data[k].histogram };
                            var col = scope.quickColumns.filter(Fn(Fn.prop("name"), Fn.eq(k)))[0],
                                fmt = col && col.selectedType && col.selectedType.name === 'Date' ? dateFmt : numFmt;
                            scope.quickColumnsCache[k].labels =
                              data[k].histogramLowerBounds.map(fmt).map(
                                function(lb, i) { return lb + " - " + this[i]; },
                                data[k].histogramUpperBounds.map(fmt))
                        }
                    }
                }).error(function() {
                    monoLoad[page].running = false;
                    setErrorInScope.apply(exploreCtrl.$scope, arguments);
                });
            }
            scope.$watch('quickColumnsCache', scope.quickColumnCacheCleared);
            scope.$watch('quickColumns', scope.quickColumnsChanged, true);
            scope.$watch('quickColumnsFilter',
                Debounce().withDelay(150,300).withScope(scope).wrap(scope.quickColumnsFilterChanged));
            scope.activateBar = function(colScope, value, i) {
                colScope.setLabels(value !== null ? {
                    pop: value.toFixed(0),
                    label: scope.quickColumnsCache[colScope.col.name].labels[i],
                    part: (colScope.col.selectedType ? (value * 100 / colScope.col.selectedType.totalCount).toFixed(1) + '&nbsp;%' : '')
                } : null);
            };
            scope.defaultAction = !scope.scrollToColumn ? null :
                function(column) { scope.scrollToColumn(column.name); };
        }
    };
});

/**
 * Base directive for all instances where a shaker table is made on a dataset
 * (explore, analysis script, prepare recipe).
 * (Counter examples: predicted data)
 */
app.directive("shakerOnDataset", function() {
    return {
        scope: true,
        controller  : function ($scope, $state, $stateParams, DataikuAPI, MonoFuture) {
            const monoFuture = MonoFuture($scope);
            const monoFuturizedRefresh = monoFuture.wrap(DataikuAPI.shakers.refreshTable);

            $scope.shakerState.onDataset = true;

            $scope.shakerHooks.isMonoFuturizedRefreshActive = monoFuture.active;

            $scope.shakerHooks.shakerForQuery = function(){
                var queryObj = angular.copy($scope.shaker);
                if ($scope.isRecipe) {
                    queryObj.recipeSchema = $scope.recipeOutputSchema;
                }
                queryObj.contextProjectKey = $stateParams.projectKey; // quick 'n' dirty, but there are too many call to bother passing the projectKey through them
                return queryObj;
            }

            $scope.shakerHooks.updateColumnWidth = function(name, width) {
                $scope.shaker.columnWidthsByName[name] = width;
                $scope.autoSaveAutoRefresh();
            };

            $scope.shakerHooks.getRefreshTablePromise = function(filtersOnly, filterRequest) {
                var ret = monoFuturizedRefresh($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId, filtersOnly, filterRequest);

                return $scope.refreshNoSpinner ? ret.noSpinner() : ret;
            };

            /**
            * Fetches a chunk of the table. Returns a promise.
            * Out of bound is NOT handled, and will throw.
            */
            $scope.shakerHooks.getTableChunk = function(firstRow, nbRows, firstCol, nbCols, filterRequest) {
                return DataikuAPI.shakers.getTableChunk(
                    $stateParams.projectKey,
                    $scope.inputDatasetProjectKey,
                    $scope.inputDatasetName,
                    $scope.shakerHooks.shakerForQuery(),
                    $scope.requestedSampleId,
                    firstRow,
                    nbRows,
                    firstCol,
                    nbCols,
                    filterRequest);
            }

            $scope.shakerHooks.fetchDetailedAnalysis = function(setAnalysis, handleError, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics) {
                DataikuAPI.shakers.detailedColumnAnalysis($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics).success(function(data){
                            setAnalysis(data);
                }).error(function(a, b, c) {
                    if (handleError) {
                        handleError(a, b, c);
                    }    
                    setErrorInScope.bind($scope)(a, b, c);
                });
            };
            $scope.shakerHooks.fetchClusters = function(setClusters, columnName, setBased, radius, timeOut, blockSize) {
                DataikuAPI.shakers.getClusters($stateParams.projectKey,
                    $scope.inputDatasetProjectKey, $scope.inputDatasetName,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId,
                        columnName, setBased, radius, timeOut, blockSize
                    ).success(function(data) {
                        setClusters(data);
                    }).error(setErrorInScope.bind($scope));
            };
            $scope.shakerHooks.fetchTextAnalysis = function(setTextAnalysis, columnName, textSettings) {
                DataikuAPI.shakers.textAnalysis(
                        $stateParams.projectKey,
                        $scope.inputDatasetProjectKey, $scope.inputDatasetName,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId,
                        columnName, textSettings)
                    .success(function(data){setTextAnalysis(data);})
                    .error(setErrorInScope.bind($scope));
            };
        }
    }
});

/**
 * Base directive for all instances where a shaker table is made on a streaming endpoint
 */
app.directive("shakerOnStreamingEndpoint", function() {
    return {
        scope: true,
        controller  : function ($scope, $state, $stateParams, DataikuAPI, MonoFuture, WT1) {
            const monoFuture = MonoFuture($scope);
            const monoFuturizedRefresh = monoFuture.wrap(DataikuAPI.shakers.refreshCapture);

            $scope.shakerState.onDataset = false;

            $scope.shakerHooks.isMonoFuturizedRefreshActive = monoFuturizedRefresh.active;

            $scope.shakerHooks.shakerForQuery = function(){
                var queryObj = angular.copy($scope.shaker);
                if ($scope.isRecipe) {
                    queryObj.recipeSchema = $scope.recipeOutputSchema;
                }
                queryObj.contextProjectKey = $stateParams.projectKey; // quick 'n' dirty, but there are too many call to bother passing the projectKey through them
                return queryObj;
            }

            $scope.shakerHooks.updateColumnWidth = function(name, width) {
                $scope.shaker.columnWidthsByName[name] = width;
                $scope.autoSaveAutoRefresh();
            };

            $scope.shakerHooks.getRefreshTablePromise = function(filtersOnly, filterRequest) {
                WT1.event("streaming-refresh-explore")

                var ret = monoFuturizedRefresh($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputStreamingEndpointId,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId, filtersOnly, filterRequest);

                return $scope.refreshNoSpinner ? ret.noSpinner() : ret;
            };

            /**
            * Fetches a chunk of the table. Returns a promise.
            * Out of bound is NOT handled, and will throw.
            */
            $scope.shakerHooks.getTableChunk = function(firstRow, nbRows, firstCol, nbCols, filterRequest) {
                return DataikuAPI.shakers.getCaptureChunk(
                    $stateParams.projectKey,
                    $scope.inputDatasetProjectKey,
                    $scope.inputStreamingEndpointId,
                    $scope.shakerHooks.shakerForQuery(),
                    $scope.requestedSampleId,
                    firstRow,
                    nbRows,
                    firstCol,
                    nbCols,
                    filterRequest);
            }

            $scope.shakerHooks.fetchDetailedAnalysis = function(setAnalysis, handleError, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics) {
                DataikuAPI.shakers.detailedStreamingColumnAnalysis($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputStreamingEndpointId,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics).success(function(data){
                            setAnalysis(data);
                }).error(function(a, b, c) {
                    if (handleError) {
                        handleError(a, b, c);
                    }    
                    setErrorInScope.bind($scope)(a, b, c);
                });
            };
            $scope.shakerHooks.fetchClusters = function(setClusters, columnName, setBased, radius, timeOut, blockSize) {
                // Do nothing
            };
            $scope.shakerHooks.fetchTextAnalysis = function(setTextAnalysis, columnName, textSettings) {
                // Do nothing
            };
        }
    }
});

app.service("DatasetChartsUtils", function(SamplingData){
    var svc = {
        makeSelectionFromScript: function(script) {
            return {
                 selection : SamplingData.makeStreamableFromMem(script.explorationSampling.selection)
            }
        }
    }
    return svc;
})

app.controller("_ChartOnDatasetSamplingEditorBase", function($scope, $stateParams, Logger, DatasetChartsUtils,
                                                                    DataikuAPI, CreateModalFromTemplate, SamplingData){
    $scope.getPartitionsList = function() {
        return DataikuAPI.datasets.listPartitions($scope.dataset)
                .error(setErrorInScope.bind($scope))
                .then(function(ret) { return ret.data });
    };

    $scope.$watch("chart.copySelectionFromScript", function(nv, ov) {
        if ($scope.canCopySelectionFromScript) {
            if ($scope.chart.copySelectionFromScript === false && !$scope.chart.refreshableSelection) {
                $scope.chart.refreshableSelection = DatasetChartsUtils.makeSelectionFromScript($scope.script);
            }
        } else {
            Logger.warn("Can't copy selection from script");
        }
    })

    $scope.showFilterModal = function() {
        var newScope = $scope.$new();
        DataikuAPI.datasets.get($scope.dataset.projectKey, $scope.dataset.name, $stateParams.projectKey)
        .success(function(data){
            newScope.dataset = data;
            newScope.schema = data.schema;
            newScope.filter = $scope.chart.refreshableSelection.selection.filter;
            CreateModalFromTemplate('/templates/recipes/fragments/filter-modal.html', newScope);
        }).error(setErrorInScope.bind($scope));
    }

    $scope.SamplingData = SamplingData;
});

app.controller("ChartsCommonController", function ($scope, $timeout) {
    $scope.$on("listeningToForceExecuteChart", function() {
        $scope.canForceExecuteChart = true;
    });

    /**
     * Broadcast for a forceToExecute() call only if it's sure someone is already listening to such a broadcast.
     * Otherwise recheck every 100ms until some directive has told it it was listening or that 3s have passed (at which point broadcast will be made).
     */
    $scope.forceExecuteChartOrWait = function(){
        let nbTimeouts = 0;

        // Inner function does the job to isolate nbTimeouts
        function inner() {
            if ($scope.canForceExecuteChart || nbTimeouts > 30) {
                $scope.$broadcast("forceExecuteChart");
            } else {
                nbTimeouts++;
                $scope.forceExecuteChartTimeout = $timeout(inner,100);
            }
        }
        inner();
    };

    //avoid two concurrent timeouts if two calls were made to forceExecuteChartOrWait()
    $scope.$watch('forceExecuteChartTimeout', function(nv, ov) {
        if (ov!= null) {
            $timeout.cancel(ov);
        }
    })
});

app.controller("ShakerChartsCommonController", function ($scope, $timeout, $controller) {
    $controller("ChartsCommonController", {$scope:$scope});

    $scope.summary = {};
    $scope.currentChart = {index: 0};
    $scope.chartBottomOffset = 30;

    $scope.addChart = function (from) {
        var newChart = angular.copy(from || $scope.getDefaultNewChart());
        const targetIdx = from ? $scope.currentChart.index + 1 : $scope.charts.length; // if copied, put the new chart just after the current one, otherwise put it at the end
        $scope.charts.splice(targetIdx, 0, newChart);
        $scope.currentChart.index = targetIdx;
        newChart.def.name = "New chart";
        if (typeof $scope.fetchColumnsSummaryForCurrentChart === "function") {
            $scope.fetchColumnsSummaryForCurrentChart();
        }
        $scope.saveShaker();
    };

    $scope.pageSortOptions = {
        axis: 'x',
        cursor: 'move',
        update: onSortUpdated,
        handle: '.thumbnail',
        items: '> a.chart',
        delay: 100,
        'ui-floating': true
    };

    function onSortUpdated(evt, ui) {
        var prevIdx = ui.item.sortable.index, newIdx = ui.item.index();
        if (prevIdx == $scope.currentChart.index) {
            $scope.currentChart.index = ui.item.index();
        } else if (prevIdx < $scope.currentChart.index && newIdx >= $scope.currentChart.index) {
            $scope.currentChart.index--;
        } else if (prevIdx > $scope.currentChart.index && newIdx <= $scope.currentChart.index) {
            $scope.currentChart.index++;
        }

        $timeout($scope.saveShaker);
    }

    $scope.deleteChart = function(idx) {
        $scope.charts.splice(idx,1);
        if ($scope.currentChart.index >= $scope.charts.length) {
            $scope.currentChart.index = $scope.charts.length - 1;
        }
        if ($scope.charts.length == 0) {
            $scope.addChart();
        }
    };

    $scope.makeUsableColumns = function(data) {
        $scope.usableColumns = [{cacheable : true, column : "__COUNT__", label : "Count of records", type: 'NUMERICAL'}];
        for (var i  = 0 ; i < data.usableColumns.length; i++) {
            $scope.usableColumns.push({
                column : data.usableColumns[i].column,
                type : data.usableColumns[i].type,
                label: data.usableColumns[i].column,
                cacheable : data.usableColumns[i].cacheable,
                meaningInfo: data.usableColumns[i].meaningInfo
            });
        }
    };

    $timeout(function() {
        $scope.$broadcast("tabSelect", "columns");
    }, 0);
});

// Chart management for Analyses & Datasets
app.directive("shakerChartsCommon", function(CreateModalFromTemplate, Logger, ChartChangeHandler) {
    return {
        scope: true,
        priority : 100,
        controller  : 'ShakerChartsCommonController'
    }
});

})();
