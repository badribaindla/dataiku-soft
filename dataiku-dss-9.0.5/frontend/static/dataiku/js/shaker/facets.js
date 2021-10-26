(function() {
'use strict';

const app = angular.module('dataiku.shaker');

app.directive("shakerFacets", function($rootScope, $timeout, $filter, Assert, ChartDimension, WT1, Logger) {
    return {
        scope: true,
        priority: 99,
        controller: function($scope, $stateParams, $state) {
            /* Actions by filter type */
            let filterTypes = {
                facet: {
                    computeFilter : function(ff, active) {
                        let ret = {
                            "column" : ff.column,
                            params : {}
                        };
                        ret.type = ff.currentMode + "_FACET";
                        ret.active = active;
                        if (ff.currentMode === "ALPHANUM") {
                            ret.values = Object.keys(ff.selectedValues);
                            ret.effective = ret.values.length;
                            ret.canBecomeStep = ret.values.length >= 1;
                        } else if (ff.currentMode === "NUMERICAL") {
                            ret.minValue = ff.minValue;
                            ret.maxValue = ff.maxValue;
                            ret.effective = (ff.minValue || ff.maxValue);
                            ret.canBecomeStep = ret.effective;
                        } else if (ff.currentMode === "DATE") {
                            ret.dateFilterType = ff.dateFilterType;
                            if (ff.dateFilterType === "RANGE") {
                                ret.minValue = ff.minValue;
                                ret.maxValue = ff.maxValue;
                                ret.timezone = ff.timezone;
                                ret.effective = (ff.minValue || ff.maxValue);
                                ret.canBecomeStep = ret.effective;
                            } else if (ff.dateFilterType === "RELATIVE") {
                                ret.dateFilterPart = ff.dateFilterPart;
                                ret.dateFilterOption = ff.dateFilterRelativeOption;
                                ret.minValue = ff.dateFilterRelativeLast;
                                ret.maxValue = ff.dateFilterRelativeNext;
                                ret.effective = true;
                                ret.canBecomeStep = true;
                            } else {
                                ret.dateFilterPart = ff.dateFilterPart;
                                ret.values = Object.keys(ff.selectedValues);
                                ret.effective = ret.values.length;
                                ret.canBecomeStep = ret.effective;
                            }
                        }
                        return ret;
                    },
                    clearFilter : function(ff) {
                        ff.selectedValues = {};
                        ff.minValue = undefined;
                        ff.maxValue = undefined;
                        ff.timezone = 'UTC';
                        ff.dateFilterRelativeOption = "THIS";
                        ff.dateFilterPart = "YEAR";
                        ff.dateFilterRelativeLast = 1;
                        ff.dateFilterRelativeNext = 1;
                    },
                    addSteps : function(ff) {
                        if (ff.currentMode === 'ALPHANUM') {
                            $scope.addStepAndRefresh('FilterOnValue', {
                                appliesTo: 'SINGLE_COLUMN',
                                columns: [ff.column],
                                action: 'KEEP_ROW',
                                values: Object.keys(ff.selectedValues),
                                matchingMode: 'FULL_STRING',
                                normalizationMode: 'EXACT'
                            });
                        } else if (ff.currentMode === 'NUMERICAL') {
                            $scope.addStepAndRefresh('FilterOnNumericalRange', {
                                appliesTo: 'SINGLE_COLUMN',
                                columns: [ff.column],
                                action: 'KEEP_ROW',
                                min: ff.minValue,
                                max: ff.maxValue
                            });
                        } else if (ff.currentMode === 'DATE') {
                            if (ff.dateFilterType === 'RANGE') {
                                $scope.addStepAndRefresh('FilterOnDate', {
                                    appliesTo: 'SINGLE_COLUMN',
                                    columns: [ff.column],
                                    action: 'KEEP_ROW',
                                    filterType: 'RANGE',
                                    // The processor is expecting - in min & max - a string in ISO 8601 format without the time zone part (ex: "2020-01-01T18:00:00.000")
                                    min: ff.minValue ? formatDateToISOLocalDateTime(convertDateToTimezone(new Date(ff.minValue), ff.timezone)) : '',
                                    max: ff.maxValue ? formatDateToISOLocalDateTime(convertDateToTimezone(new Date(ff.maxValue), ff.timezone)) : '',
                                    timezone_id: ff.timezone,
                                    part: 'YEAR',
                                    option: 'THIS',
                                    relativeMin: 1,
                                    relativeMax: 1
                                });
                            } else if(ff.dateFilterType === 'RELATIVE') {
                                $scope.addStepAndRefresh('FilterOnDate', {
                                    appliesTo: 'SINGLE_COLUMN',
                                    columns: [ff.column],
                                    action: 'KEEP_ROW',
                                    filterType: 'RELATIVE',
                                    relativeMin: isNaN(ff.dateFilterRelativeLast) ? 1 : Math.max(1, ff.dateFilterRelativeLast),
                                    relativeMax: isNaN(ff.dateFilterRelativeNext) ? 1 : Math.max(1, ff.dateFilterRelativeNext),
                                    option: ff.dateFilterRelativeOption,
                                    part: ff.dateFilterPart,
                                    timezone_id: 'UTC'
                                });
                            } else {
                                let values = Object.keys(ff.selectedValues);
                                if (ff.dateFilterPart === 'INDIVIDUAL') {
                                    values = values.map(v => formatDateToISOLocalDate(new Date(v * 1000)));
                                } else if (['QUARTER_OF_YEAR', 'DAY_OF_WEEK', 'DAY_OF_MONTH'].includes(ff.dateFilterPart)) {
                                    values = values.map(v => parseInt(v) + 1);
                                }
                                $scope.addStepAndRefresh('FilterOnDate', {
                                    appliesTo: 'SINGLE_COLUMN',
                                    columns: [ff.column],
                                    action: 'KEEP_ROW',
                                    filterType: 'PART',
                                    part: ff.dateFilterPart,
                                    values: values,
                                    option: ff.dateFilterRelativeOption,
                                    timezone_id: 'UTC',
                                    relativeMin: 1,
                                    relativeMax: 1
                                });
                            }
                        }
                    }
                },
                alphanum : {
                    computeFilter : function(ff, active) {
                        return {
                            "column" : ff.column,
                            "type" : "ALPHANUM",
                            "values" : ff.values,
                            effective : ff.values.length,
                            params : ff.params,
                            active: active
                        }
                    },
                    clearFilter : function(ff) {
                        Assert.trueish(false, 'cannot call alphanum');
                    }
                },
                validity : {
                    computeFilter : function(ff, active) {
                        return {
                            "column" : ff.column,
                            "type" : "VALIDITY",
                            "params" : ff.params,
                            effective : !ff.params.empty || !ff.params.nok || !ff.params.ok,
                            active: active
                        };
                    },
                    clearFilter : function(ff) {
                        Assert.trueish(false, 'cannot call validity');
                    }
                },
                global_search : {
                    computeFilter : function(ff) {
                        return { "type" : "GLOBAL_SEARCH", "values" : [ff.filter], effective : ff.filter && ff.filter.length }
                    },
                    clearFilter : function(ff) {
                        Assert.trueish(false, 'cannot call global_search');
                    }
                }
            };

            $scope.dateFilterTypes = ChartDimension.getDateFilterTypes();
            $scope.dateFilterParts = ChartDimension.getDateFilterParts();
            $scope.dateRelativeFilterParts = ChartDimension.getDateRelativeFilterParts();

            /* This removes the *filters* and clears the built-in filter of a facet, but does not remove the filters */
            $scope.removeAllFiltersOnColumn = function(column) {
                let newFFs = [];
                for (let i in $scope.shaker.explorationFilters) {
                    let fi = $scope.shaker.explorationFilters[i];
                    if (fi.type == "facet" && fi.column == column) {
                        filterTypes[fi.type].clearFilter(fi);
                        newFFs.push(fi);
                    } else if (fi.column != column) {
                        newFFs.push(fi);
                    }
                }
                $scope.shaker.explorationFilters = newFFs;
            };

            $scope.viewAllFilter = false;
            $scope.toggleFilterView = function() {
            	$scope.viewAllFilter = !$scope.viewAllFilter;
            	if (!$scope.viewAllFilter) {
            	    $scope.setMustBeVisibleFilter('');
            	    $rootScope.$broadcast("reflow");
            	}
            };

            $scope.mustBeVisibleFilter = {column: ''};
            $scope.isMustBeVisibleFilter = function(column) {
                return column == $scope.mustBeVisibleFilter.column;
            };
            $scope.setMustBeVisibleFilter = function(column) {
                $scope.mustBeVisibleFilter.column = column;
            };

            $scope.removeAllFilters = function() {
                $scope.shaker.explorationFilters.splice(1);
                $scope.shaker.globalSearchQuery = "";
            };

            $scope.clearFilter = function(filter) {
                filterTypes[filter.type].clearFilter(filter);
            };

            $scope.removeFFByColumn = function(columnName) {
                let newFFs = [];
                for (let i in $scope.shaker.explorationFilters) {
                    if ($scope.shaker.explorationFilters[i].column != columnName) {
                        newFFs.push($scope.shaker.explorationFilters[i]);
                    }
                }
                $scope.shaker.explorationFilters = newFFs;
            };

            $scope.buildFilterRequest = function() {
                if ($scope.shaker == null) return [];
                let filterRequest = [];
                for (let ffidx in $scope.shaker.explorationFilters) {
                    let ffi = $scope.shaker.explorationFilters[ffidx];
                    let fList = getFiltersList(ffi);
                    for (let fidx in fList) {
                        let fi = fList[fidx];
                        let requestElt =filterTypes[fi.type].computeFilter(fi, ffi.active);
                        if (requestElt != null) {
                            filterRequest.push(requestElt);
                        }
                    }
                }
                if (typeof($scope.shaker.globalSearchQuery)!=='undefined' && $scope.shaker.globalSearchQuery.length > 0) {
                    let globalFilter = {
                        type : "global_search",
                        filter: $scope.shaker.globalSearchQuery
                    };
                    filterRequest.push(filterTypes[globalFilter.type].computeFilter(globalFilter, true));
                }
                return filterRequest;
            };

            $scope.hasAnyFilter = function() {
                if(!$scope.shaker) return false;
                let ret = false;
                for (let ffidx in $scope.shaker.explorationFilters) {
                    let ffi = $scope.shaker.explorationFilters[ffidx];
                    let fList = getFiltersList(ffi);
                    for (let fidx in fList) {
                        let fi = fList[fidx];
                        if (filterTypes[fi.type].computeFilter(fi).effective) {
                            ret = true;
                            break;
                        }
                    }
                }
                // UGLY ! But as we use the tabs directive, we don't have an easy access to the filters tab title ...
                if (ret) {
                    $(".leftPane .tabbable li:eq(2)").addClass("filter-active");
                } else {
                    $(".leftPane .tabbable li:eq(2)").removeClass("filter-active");
                }
                return ret;
            };

            $scope.hasAnyFilterOnColumn = function(column, uneffectiveFilterCount) {
                if(!$scope.shaker) return false;
                for (let ffidx in $scope.shaker.explorationFilters) {
                    let ffi = $scope.shaker.explorationFilters[ffidx];
                    let fList = getFiltersList(ffi);
                    for (let fidx in fList) {
                        let fi = fList[fidx];
                        if (fi.column && fi.column == column) {
                            if (filterTypes[fi.type].computeFilter(fi).effective || uneffectiveFilterCount) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            };

            $scope.filterIsEffective = function(filter) {
                let fList = getFiltersList(filter);
                for (let fidx in fList) {
                    let fi = fList[fidx];
                    if (filterTypes[fi.type].computeFilter(fi).effective) {
                        return true;
                    }
                }
                return false
            };

            $scope.filterCanBecomeStep = function(filter) {
                let fList = getFiltersList(filter);
                for (let fidx in fList) {
                    let fi = fList[fidx];
                    if (filterTypes[fi.type].computeFilter(fi).canBecomeStep) {
                        return true;
                    }
                }
                return false;
            };

            $scope.addStepsFromFilter = function(filter) {
                return filterTypes[filter.type].addSteps(filter);
            };

            var emitFilterHaveChanged = function(nv, ov) {
                if ((nv != null) && (ov != null)) {
                    $scope.$emit("filterHaveChanged");
                }
            };

            $scope.$watch("shaker.explorationFilters", function(nv,ov) {
                emitFilterHaveChanged(nv, ov);
            });

            $scope.$watch("shaker.globalSearchQuery", function(nv,ov) {
                emitFilterHaveChanged(nv, ov);
            });

            $scope.addColumnFilter = function(column, selectedValues, matchingMode, columnType, isDouble) {
                if (!$scope.hasAnyFilterOnColumn(column, true)) {
                    WT1.event("anum-facet-add");
                    let facetType = columnType === 'Date' ? 'DATE' : (isDouble ? 'NUMERICAL' : 'ALPHANUM');
                    let columnFilter = {
                        column: column,
                        type: 'columnFilter',
                        currentMode: 'FACET',
                        active: true,
                        facet: {
                            type: "facet",
                            column: column,
                            columnType : facetType,
                            currentMode : selectedValues && Object.keys(selectedValues).length ? 'ALPHANUM' : facetType,
                            sort:"count",
                            minValue : null,
                            maxValue : null,
                            selectedValues: selectedValues
                        },
                        alphanumFilter: {
                            type : "alphanum",
                            column : column,
                            values : [],
                            params : { mode : matchingMode, normalization : "exact"}
                        },
                        validityFilter : {
                            type : "validity",
                            column : column,
                            params : {
                                type : columnType,
                                ok : true,
                                nok : true,
                                empty : true
                            }
                        }
                    };
                    if (facetType === "DATE") {
                        columnFilter.facet.timezone = "UTC";
                        columnFilter.facet.dateFilterType = "RANGE";
                        columnFilter.facet.dateFilterPart = "YEAR";
                        columnFilter.facet.dateFilterRelativeOption = "THIS";
                        columnFilter.facet.dateFilterRelativeLast = 1;
                        columnFilter.facet.dateFilterRelativeNext = 1;
                        columnFilter.facet.minValue = undefined; // undefined <=> Reset the bound to the smallest value
                        columnFilter.facet.maxValue = undefined; // undefined <=> Reset the bound to the largest value
                    }
                    if (!$scope.viewAllFilter) {
                    	$scope.openFacetContextualMenuAtAnimationEnd(column);
                    }
                    $scope.shaker.explorationFilters.push(columnFilter);
                    if ($scope.viewAllFilter) {
					    $timeout(function() {
					    	$scope.$apply(function() {
					    		$scope.setMustBeVisibleFilter(column);
					    	})
					    }, 0, false);
					}
                } else {
                	if (!$scope.viewAllFilter) {
                		$scope.openFacetContextualMenuAtAnimationEnd(column);
                        $scope.$broadcast('slideToId', '.facetsFilters', '.filters-slider' , $scope.getFFGroupIdByColumn(column));
                	} else {
                		$timeout(function() {
					    	$scope.$apply(function() {
					    		$scope.setMustBeVisibleFilter(column);
					    	})
					    }, 0, false);
                	}
                }
            };

            $scope.getFFGroupIdByColumn = function(column) {
                return 'facet-' + column;
            };

            $scope.openFacetContextualMenuAtAnimationEnd = function(column) {
            	var off = $('[dku-arrow-slider]').scope().$on('DKU_ARROW_SLIDER:animation_over',function() {
            		 $scope.$broadcast('openFilterFacetContextualMenu', column);
            		 off(); //to unregister the listener set with $on
            	});
            };

            /*
             * If ff is a column filter, returns all its active filters
             * Else, returns a list only containing ff (the filter passed in parameter)
             */
            var getFiltersList = function(ff) {
                let ffList = [];
                if (ff.type === "columnFilter") {
                    if (ff.currentMode === "FACET") {
                        ffList.push(ff.facet);
                    } else if (ff.currentMode === "SIMPLE_ALPHANUM") {
                        ffList.push(ff.alphanumFilter);
                    }
                    ffList.push(ff.validityFilter);
                } else {
                    ffList.push(ff);
                }
                return ffList;
            };

            $scope.isFilterDateRange = ChartDimension.isFilterDateRange;
            $scope.isFilterDateRelative = ChartDimension.isFilterDateRelative;
            $scope.isFilterDatePart = ChartDimension.isFilterDatePart;
            $scope.isFilterDiscreteDate = ChartDimension.isFilterDiscreteDate;

            $scope.resetFilter = function(filter) {
                filterTypes[filter.type].resetFilter(filter);
            };

            $scope.getFilterByColumn = function(column) {
            	for (let ffIdx = 0; ffIdx<$scope.shaker.explorationFilters.length; ffIdx++) {
            		var ff = $scope.shaker.explorationFilters[ffIdx];
            		if (ff.type === "columnFilter" && ff.column == column) {
            			return ff;
            		}
            	}
            	return undefined;
            };

            $scope.updateFacetData = function() {
                if ($scope.filterTmpDataWatchDeregister) {
                    $scope.filterTmpDataWatchDeregister();
                }
                $scope.filterTmpData = {};
                /* Build tmpData */
                for (let fIdx = 0; fIdx < $scope.table.filterFacets.length; fIdx++ ) {
                    let responseFacet = $scope.table.filterFacets[fIdx];
                    let column = responseFacet.column;
                    let type = responseFacet.type;
                	type = type.replace('_FACET', '');
                    let filter = $scope.getFilterByColumn(column);

                    if (filter) {
                        let tmpData =  $scope.filterTmpData[column] ;
                        if (!tmpData) {
                            tmpData = {};
                            $scope.filterTmpData[column] = tmpData;
                        }

                        if (type === 'VALIDITY') {
                            for (let v = 0 ; v < responseFacet.values.length; v++) {
                                let facetVal = responseFacet.values[v];
                                if (facetVal.id === 'ok') {
                                    tmpData.nbOk = facetVal.count;
                                } else if (facetVal.id === 'nok') {
                                    tmpData.nbNok = facetVal.count;
                                } else if (facetVal.id === 'empty') {
                                    tmpData.nbEmpty = facetVal.count;
                                }
                            }
                            let total = tmpData.nbOk + tmpData.nbNok + tmpData.nbEmpty;
                            tmpData.okPercentageStr = total > 0 ? $filter("smartPercentage")(tmpData.nbOk/total) : 'none';
                            tmpData.nokPercentageStr = total > 0 ? $filter("smartPercentage")(tmpData.nbNok/total) : 'none';
                            tmpData.emptyPercentageStr = total > 0 ? $filter("smartPercentage")(tmpData.nbEmpty/total) : 'none';
                            tmpData.nonemptyPercentageStr = total > 0 ? $filter("smartPercentage")((total-tmpData.nbEmpty)/total) : 'none';
                            tmpData.okPercentage = total > 0 ? tmpData.nbOk*100 / total : 'none';
                            tmpData.nokPercentage = total > 0 ? tmpData.nbNok*100 / total : 'none';
                            tmpData.emptyPercentage = total > 0 ? tmpData.nbEmpty*100 / total : 'none';
                            tmpData.nonemptyPercentage = total > 0 ? (total - tmpData.nbEmpty)*100 / total : 'none';
                        } else {
                            const valuesLength = responseFacet.values.length;
                            tmpData.values = [];
                            tmpData.type = type;
                            tmpData.isRange = responseFacet.isRange;
                            if (type === 'ALPHANUM' || (type === 'DATE' && !responseFacet.isRange)) {
                                for (let v = 0 ; v < valuesLength; v++) {
                                    let facetVal = responseFacet.values[v];
                                    tmpData.values.push({
                                        id : facetVal.id,
                                        label : facetVal.label,
                                        count : facetVal.count,
                                        included : (filter.facet.selectedValues && filter.facet.selectedValues[facetVal.id])
                                    });
                                }
                            } else if (type === 'DATE' && responseFacet.isRange) {
                                tmpData.response = responseFacet;
                                if (filter.facet.timezone != null) {
                                    tmpData.timezone = filter.facet.timezone;
                                }
                                // For dates, we use the following convention to improve user experience:
                                // - valid number => Use the value
                                // - undefined    => Take the smallest/largest date found in the sample
                                // - null         => Leave as it is (it will display the default date placeholder in the UI)
                                tmpData.minValue = filter.facet.minValue !== undefined ? filter.facet.minValue : responseFacet.minValue;
                                tmpData.maxValue = filter.facet.maxValue !== undefined ? filter.facet.maxValue : responseFacet.maxValue;
                            } else if (type === 'NUMERICAL') {
                                tmpData.response = responseFacet;
                                tmpData.minValue = filter.facet.minValue != null ? filter.facet.minValue : responseFacet.minValue;
                                tmpData.maxValue = filter.facet.maxValue != null ? filter.facet.maxValue : responseFacet.maxValue;
                            }

                            tmpData.uniqueRowCount = responseFacet.count;
                        }
                    }
                }

                /* Triggered by slide end */
                $scope.filterTmpDataWatchDeregister =  $scope.$watch("filterTmpData", function(nv, ov) {
                    for (let column in $scope.filterTmpData) {
                        let filter = $scope.getFilterByColumn(column);
                        let tmpData = $scope.filterTmpData[column];

                        if (tmpData.type === "ALPHANUM" || (tmpData.type === 'DATE' && !tmpData.isRange)) {
                            filter.facet.selectedValues = {};
                            for (let i in tmpData.values) {
                                if (tmpData.values[i].included) {
                                    filter.facet.selectedValues[tmpData.values[i].id] = true;
                                }
                            }
                        } else if (tmpData.type  === "NUMERICAL" || (tmpData.type === 'DATE' && tmpData.isRange)) {
                            // Detect when the entered value is the same as the lower or upper bound, and replace it with an undefined value
                            // to say that we don't want to filter using this bound.
                            filter.facet.minValue = tmpData.minValue !== tmpData.response.minValue ? tmpData.minValue : undefined;
                            filter.facet.maxValue = tmpData.maxValue !== tmpData.response.maxValue ? tmpData.maxValue : undefined;
                            filter.facet.timezone = tmpData.timezone;
                        }
                    }
                }, true);
            };

            var filterChanged = function(nv, ov) {
                if (nv  == null || ov == null) return;
                
                if ($scope.isRecipe) {
                    $scope.refreshTable(true);
                } else {
                    $scope.refreshTable(true);
                    /* Don't save synchronously, we want optimal performance here */
                    $timeout($scope.shakerHooks.saveForAuto, 100);
                }
            };

            $scope.$watch("shaker.explorationFilters", function(nv, ov) {
                filterChanged(nv, ov);
            }, true);

            $scope.$watch("shaker.globalSearchQuery", function(nv, ov) {
                filterChanged(nv, ov);
            }, true)
        }
    }
});


/*
 * Directive grouping a shakerFacet, a simpleAlphanumFilter, and a validityFilter in order to display them all into one single contextual menu
 */
app.directive('columnFilter', ['$filter', 'ContextualMenu', '$window', function($filter, ContextualMenu, $window) {
    return {
        scope: true,
        restrict : 'AE',
        link : function($scope, element, attrs) {

            /*
             * Filter panel visibility
             */

            $scope.isFilterPanelVisible = false;
            let numFmt = $filter('smartNumber');

            $scope.menu = new ContextualMenu({
                template: "/templates/shaker/column-filter-panel.html",
                cssClass : "ff-contextual-menu",
                scope: $scope,
                contextual: false,
                handleKeyboard: false,
                onOpen: function() {
                    $scope.isFilterPanelVisible = true;
                },
                onClose: function() {
                    $scope.isFilterPanelVisible = false;
                },
                enableClick: true
            });

            $scope.showMenu = function() {
                let openAtX = $(element).offset().left;
            	if (openAtX > $($window).width()/2) {
            		openAtX += $(element).outerWidth();
            	}
                $scope.menu.openAtXY(openAtX, $(element).offset().top + $(element).height(), function() {}, false, true); // NOSONAR: OK to have empty method
            };

            $scope.hideMenu = function() {
                $scope.menu.closeAny();
            };

            $scope.toggleMenu = function() {
                if ($scope.isFilterPanelVisible) {
                    $scope.hideMenu();
                } else {
                    $scope.showMenu();
                }
            };

            $scope.$on("openFilterFacetContextualMenu", function(event, column) {
                if ($scope.ffGroup.column == column) {
                    $scope.showMenu();
                }
            });

            /*
             * Switching filter mode
             */

            $scope.switchToFacetNumerical = function() {
                $scope.ffGroup.currentMode = "FACET";
                $scope.ffGroup.facet.currentMode = "NUMERICAL";
            };
            $scope.switchToFacetAlphanum = function() {
                $scope.ffGroup.currentMode = "FACET";
                $scope.ffGroup.facet.currentMode = "ALPHANUM";
            };
            $scope.switchToSimpleAlphanum = function() {
                $scope.ffGroup.currentMode = "SIMPLE_ALPHANUM";
            };

            $scope.isFacet = function() {
                return $scope.ffGroup.currentMode === "FACET";
            };

            $scope.isFacetNumerical = function() {
                return $scope.isFacet() && $scope.ffGroup.facet.currentMode === "NUMERICAL";
            };

            $scope.isFacetAlphanum = function() {
                return $scope.isFacet() && $scope.ffGroup.facet.currentMode === "ALPHANUM";
            };

            $scope.isSimpleAlphanum = function() {
                return $scope.ffGroup.currentMode === "SIMPLE_ALPHANUM";
            };

            $scope.isFacetDate = function() {
                return $scope.isFacet() && $scope.ffGroup.facet.currentMode === "DATE";
            };

            $scope.isFacetDateRange = function() {
                return $scope.isFacet() && $scope.isFacetDate() && $scope.ffGroup.facet.dateFilterType === "RANGE";
            };

            $scope.isFacetDateRelativeRange = function() {
                return $scope.isFacet() && $scope.isFacetDate() && $scope.ffGroup.facet.dateFilterType === "RELATIVE";
            };

            $scope.isFacetDateValues = function() {
                return $scope.isFacet() && $scope.isFacetDate() && $scope.ffGroup.facet.dateFilterType !== "RANGE";
            };

            $scope.isEffective = function() {
            	if ($scope.filterIsEffective($scope.ffGroup.validityFilter)) {
            		return true;
            	} else if ($scope.isFacet()) {
                    return $scope.filterIsEffective($scope.ffGroup.facet);
                } else if ($scope.isSimpleAlphanum()) {
                    return $scope.filterIsEffective($scope.ffGroup.alphanumFilter);
                }
                return false;
            };

            $scope.$watch('ffGroup.facet.dateFilterType', () => {
                if($scope.ffGroup.facet.dateFilterType !== 'PART' && $scope.ffGroup.facet.dateFilterPart === 'INDIVIDUAL') {
                    $scope.ffGroup.facet.dateFilterPart = "YEAR"
                }
            })

            $scope.getFilterChipInfo = function() {
                function capitalize(str) {
                    if (!str) {
                        return '';
                    }
                    return str.charAt(0).toUpperCase() + str.slice(1);
                }

                if (!$scope.isEffective()) {
                    return 'All';
                }
                //if validity filter is the only one filtering
                if ($scope.filterIsEffective($scope.ffGroup.validityFilter) && !$scope.filterIsEffective($scope.ffGroup.facet) && !$scope.filterIsEffective($scope.ffGroup.alphanumFilter)) {
                    let validityChipInfo = '';
                	if ($scope.ffGroup.validityFilter.params.ok) {
                		validityChipInfo += 'OK';
                	}
                	if ($scope.ffGroup.validityFilter.params.nok) {
                		validityChipInfo += validityChipInfo.length ? ' & NOK' : 'NOK';
                	}
                	if ($scope.ffGroup.validityFilter.params.empty) {
                		validityChipInfo += validityChipInfo.length ? ' & ∅' : '∅';
                	}
                	return validityChipInfo;
                }
                //otherwise we compute info relatively to "more important filters"
                if ($scope.isFacetNumerical() || $scope.isFacetDateRange()) {
                    let formatedMinValue;
                    let formatedMaxValue;
                    if ($scope.isFacetNumerical()) {
                        if (typeof($scope.ffGroup.facet.minValue) !== 'undefined' && $scope.ffGroup.facet.minValue) {
                            formatedMinValue = numFmt($scope.ffGroup.facet.minValue);
                        }
                        if (typeof($scope.ffGroup.facet.maxValue) !== 'undefined' && $scope.ffGroup.facet.maxValue) {
                            formatedMaxValue = numFmt($scope.ffGroup.facet.maxValue);
                        }
                    } else {
                        if (typeof($scope.ffGroup.facet.minValue) !== 'undefined' && $scope.ffGroup.facet.minValue) {
                            formatedMinValue = $filter('date')($scope.ffGroup.facet.minValue, 'yyyy-MM-dd');
                        }
                        if (typeof($scope.ffGroup.facet.maxValue) !== 'undefined' && $scope.ffGroup.facet.maxValue) {
                            formatedMaxValue = $filter('date')($scope.ffGroup.facet.maxValue, 'yyyy-MM-dd');
                        }
                    }
                    if (typeof(formatedMinValue)==='undefined') {
                        return ' ≤ ' + formatedMaxValue;
                    } else if (typeof(formatedMaxValue)==='undefined') {
                        return ' ≥ ' + formatedMinValue;
                    } else {
                        return formatedMinValue + ' to ' + formatedMaxValue;
                    }
                } else if ($scope.isFacetDateRelativeRange()) {
                    const facet = $scope.ffGroup.facet;
                    const item = {THIS:"this", LAST:"last", NEXT:"next", TO: "to date"}[facet.dateFilterRelativeOption];
                    const unit = {YEAR:"year", QUARTER_OF_YEAR:"quarter", MONTH_OF_YEAR:"month", DAY_OF_MONTH:"day", HOUR_OF_DAY:"hour"}[facet.dateFilterPart];
                    if (facet.dateFilterRelativeOption === 'TO') {
                        return capitalize(unit + ' ' + item);
                    } if (facet.dateFilterRelativeOption === 'LAST' && facet.dateFilterRelativeLast > 1) {
                        return capitalize(item + ' ' + facet.dateFilterRelativeLast + ' ' + unit + 's');
                    } else if (facet.dateFilterRelativeOption === 'NEXT' && facet.dateFilterRelativeNext > 1) {
                        return capitalize(item + ' ' + facet.dateFilterRelativeNext + ' ' + unit + 's');
                    } else {
                        return capitalize(item + ' ' + unit);
                    }
                } else if ($scope.isFacetAlphanum() || $scope.isFacetDateValues()) {
                    let nbValues = 0;
                    for (let v in $scope.ffGroup.facet.selectedValues) { // NOSONAR
                        nbValues++;
                    }
                    return nbValues === 1 ? nbValues + ' value' : nbValues + ' values';
                } else if ($scope.isSimpleAlphanum()) {
                    let nbValues = $scope.ffGroup.alphanumFilter.values.length;
                    return nbValues === 1 ? nbValues + ' value' : nbValues + ' values';
                }
            }
        }
    };
}]);


app.directive('shakerFacet', [ '$timeout', 'Logger', 'DataikuAPI', 'Debounce', function($timeout, Logger, DataikuAPI, Debounce) {
    return {
        templateUrl : '/templates/shaker/facet.html',
        replace:true,
        scope:true,
        restrict : 'E',
        link : function($scope, element, attrs) {
            $(element).find(".accordion-body").addClass("in");
            $scope.dateRelativeFilterPartsLabel = "Year";
            $scope.dateRelativeFilterComputedStart = '-';
            $scope.dateRelativeFilterComputedEnd = '-';

            $scope.$watch("filterTmpData", function(nv, ov) {
                if (nv == null) return;
                if (!$scope.filterTmpData[$scope.facet.column] || $scope.filterTmpData[$scope.facet.column].type !== $scope.facet.currentMode) return;
                $scope.facetUiState = $scope.facetUiState || {};

                let minValue = $scope.filterTmpData[$scope.facet.column].minValue;
                let maxValue = $scope.filterTmpData[$scope.facet.column].maxValue;
                if ($scope.facet.currentMode === "DATE") {
                    const timezone = $scope.filterTmpData[$scope.facet.column].timezone || 'UTC';
                    $scope.facetUiState.timezoneDateRangeModel = timezone;
                    // For dates, we use the following convention to improve user experience:
                    // - valid number => Use the value
                    // - undefined    => Take the smallest/largest date found in the sample
                    // - null         => Leave as it is (it will display the default date placeholder in the UI)
                    if (minValue === undefined) {
                        minValue = $scope.facetUiState.sliderModelMin;
                    }
                    if (maxValue === undefined) {
                        maxValue = $scope.facetUiState.sliderModelMax;
                    }
                    $scope.facetUiState.fromDateRangeModel = minValue != null ? convertDateToTimezone(new Date(minValue), timezone) : null;
                    $scope.facetUiState.toDateRangeModel = maxValue != null ? convertDateToTimezone(new Date(maxValue), timezone) : null;
                } else {
                    $scope.facetUiState.sliderModelMin = minValue != null ? minValue : $scope.facetUiState.sliderModelMin;
                    $scope.facetUiState.sliderModelMax = maxValue != null ? maxValue : $scope.facetUiState.sliderModelMax;
                }

                // 10000 ticks
                let sliderSpan = $scope.facetUiState.sliderModelMax - $scope.facetUiState.sliderModelMin;
                if (sliderSpan > 0.00001) {
                    $scope.sliderStep = Math.round(10000*sliderSpan)/100000000;
                } else {
                    $scope.sliderStep = sliderSpan / 10000;
                }

                // Handle min=max
                if ($scope.sliderStep === 0) {
                    $scope.sliderStep = 1;
                }
                // handle scientific notation to get the # of decimal places
                $scope.sliderDecimals = 0;
                if ($scope.sliderStep < 1e-14) {
                    // no point in getting the # of decimal places, we'll end up below the precision of 64bit doubles
                    $scope.sliderDecimals = 14;
                } else {
                    let dec = 1;
                    while (dec > $scope.sliderStep) {
                        dec /= 10;
                        $scope.sliderDecimals++;
                    }
                }

                if ($scope.facet.currentMode === "NUMERICAL") {
                    let selector = $(element).find("div.ministogram-container").get(0);
                    let response = $scope.filterTmpData[$scope.facet.column].response;
                    $scope.isChart = response.histogramBars.length > 0;
                    $scope.isRangeSlider = $scope.isChart;
                    if ($scope.isChart) {
                    	d3.select(selector).selectAll("svg").remove();
                        let height = 100;
                        let width = $(selector).parent().width() !== 0 ? $(selector).parent().width() : 300;
                        let svg = d3.select(selector).append("svg").style("height", height).style("width", width).append("g");

                        let maxCount = 0;
                        for (let i = 0; i < response.histogramBars.length; i++) {
                            maxCount = Math.max(maxCount, response.histogramBars[i].count);
                        }
                        let xscale = d3.scale.linear().domain([response.minValue, response.maxValue]).range([0, width]);
                        let yscale = d3.scale.linear().domain([0, maxCount]).range([0, height]);

                        /* Each data is [lb, hb, value]*/
                        let barWidth = width / response.histogramBars.length;

                        let tooltip = d3.select("body").append("div")
                        .attr("class", "histogramtooltip")
                        .style("left", "0").style("top", "0")
                        .style("opacity", 0);

                        svg.selectAll("rect").data(response.histogramBars).enter().append("rect")
                        .attr("class", "histogrambar")
                        .attr("x", function(d) { return xscale(d.minValue) + 2; })
                        .attr("y", function(d) { return height - yscale(d.count);})
                        .attr("min", function(d) { return d.minValue;})
                        .attr("max", function(d) { return d.maxValue;})
                        .attr("count", function(d) { return d.count;})
                        .attr("width", barWidth-4)
                        .attr("height", function(d) { return yscale(d.count);})
                        .on("mouseover", function(d) {
                            tooltip.transition()
                            .duration(400)
                            .style("opacity", 1);
                            tooltip.html("[{0} - {1}] - {2} records".format(d.minValue.toFixed(2),
                                     d.maxValue.toFixed(2), Math.round(d.count)))
                            .style("left", (d3.event.pageX) + "px")
                            .style("top", (d3.event.pageY - 28) + "px");
                        }).on("mouseout", function(d) {
                            tooltip.transition()
                            .duration(500)
                            .style("opacity", 0);
                        });
                        svg.append("line").attr("x1", 0).attr("x2", width).attr("y1", height).attr("y2", height)
                        .style("stroke", "#ccc");
                    }
                }

                if ($scope.isFilterDateRange($scope.facet)) {
                	$scope.isChart = false;
                }
            }, true);

            $scope.dateRangeChange = function() {
                if ($scope.facetUiState) {
                    const from = $scope.facetUiState.fromDateRangeModel;
                    const to = $scope.facetUiState.toDateRangeModel;
                    const tz = $scope.facetUiState.timezoneDateRangeModel;

                    $scope.filterTmpData[$scope.facet.column].timezone = tz;
                    $scope.filterTmpData[$scope.facet.column].minValue = from != null ? convertDateFromTimezone(from, tz).getTime() : null;
                    $scope.filterTmpData[$scope.facet.column].maxValue = to != null ? convertDateFromTimezone(to, tz).getTime() : null;
                }
            };

            $scope.slideEnd = function() {
                $timeout(function() {
                    Logger.info("slideEnd event", $scope.facetUiState);
                    $scope.filterTmpData[$scope.facet.column].minValue = $scope.facetUiState.sliderModelMin;
                    $scope.filterTmpData[$scope.facet.column].maxValue = $scope.facetUiState.sliderModelMax;
                	$scope.$apply();
                }, 0);
            };

            $scope.switchToNumerical = function() {
                $scope.facet.currentMode = "NUMERICAL";
            };
            $scope.switchToAlphanum = function() {
                $scope.facet.currentMode = "ALPHANUM";
            };

            $scope.resetThisFilter = function() {
                $scope.clearFilter($scope.facet);
            };

            $scope.$watch("facet.dateFilterPart", function(nv, ov) {
                $scope.dateRelativeFilterPartsLabel = {YEAR:"Year", QUARTER_OF_YEAR:"Quarter", MONTH_OF_YEAR:"Month", DAY_OF_MONTH:"Day", HOUR_OF_DAY:"Hour"}[nv];
            });

            const computeRelativeDateIntervalDebounced = Debounce().withDelay(100,100).withScope($scope).wrap(function() {
                DataikuAPI.shakers.computeRelativeDateInterval({
                    part: $scope.facet.dateFilterPart,
                    option: $scope.facet.dateFilterRelativeOption,
                    offset: $scope.facet.dateFilterRelativeOption === 'NEXT' ? $scope.facet.dateFilterRelativeNext : $scope.facet.dateFilterRelativeLast
                }).success(function(interval) {
                    $scope.dateRelativeFilterComputedStart = interval.start;
                    $scope.dateRelativeFilterComputedEnd = interval.end;
                }).error(function() {
                    $scope.dateRelativeFilterComputedStart = '-';
                    $scope.dateRelativeFilterComputedEnd = '-';
                });
            })
            const refreshRelativeIntervalHint = function () {
                if ($scope.facet.dateFilterType === "RELATIVE") {
                    computeRelativeDateIntervalDebounced();
                }
            };

            $scope.$watchGroup(["facet.dateFilterType", "facet.dateFilterPart", "facet.dateFilterRelativeOption"], refreshRelativeIntervalHint);
            $scope.$watch("facet.dateFilterRelativeLast", () => {
                if ($scope.facet.dateFilterRelativeOption === 'LAST') {
                    refreshRelativeIntervalHint();
                }
            });
            $scope.$watch("facet.dateFilterRelativeNext", () => {
                if ($scope.facet.dateFilterRelativeOption === 'NEXT') {
                    refreshRelativeIntervalHint();
                }
            });

        	$scope.isSpinner = function() {
        		return !$scope.filterTmpData || !$scope.filterTmpData[$scope.facet.column] || (!$scope.filterTmpData[$scope.facet.column].values && !$scope.filterTmpData[$scope.facet.column].response);
        	}
        }
    };
}]);


app.directive('simpleAlphanumFilter', function() {
    return {
        templateUrl : '/templates/shaker/simple-alphanum-filter.html',
        replace:true,
        scope:true,
        restrict : 'E',
        link : function(scope, element, attrs) {
            scope.filterModes = {
                "full_string": "Full string",
                "substring": "Substring",
                "pattern": "Regular expression",
            };
            scope.filterNormalizations = {
                "exact": "Case-sensitive",
                "lowercase": "Lowercase",
                "normalized": "Normalized"
            };
            if (angular.isUndefined(scope.filter.params.mode)) {
                scope.filter.params.mode = "full_string";
            }
            $(element).find(".accordion-body").addClass("in");
            scope.onSmartChange = function() {
                if (angular.isDefined(scope.filter.values[0]) && scope.filter.values[0].length > 0) {
                    scope.refreshTable(true);
                }
            };
            scope.changeNormModeIfRegexp = function() {
            	if (scope.filter.params.mode === "pattern") {
            		scope.filter.params.normalization = "exact";
            	}
            };
        }
    };
});

app.directive('validityFilter', function() {
    return {
        templateUrl : '/templates/shaker/validity-filter.html',
        replace:true,
        scope:true,
        restrict : 'E',
        link : function(scope, element, attrs) {
            $(element).find(".accordion-body").addClass("in");

            scope.toggleValidityFacet = function(facetValue) {
            	return !facetValue;
            };

            scope.isAll = function() {
                return scope.filter.params.ok && scope.filter.params.nok && scope.filter.params.empty;
            };

            function goBackToAllIfNeeded(){
                if (!scope.filter.params.ok && !scope.filter.params.nok && !scope.filter.params.empty) {
                    scope.filter.params.ok = scope.filter.params.nok = scope.filter.params.empty = true;
                }
            }

            scope.toggleAll = function() {
                if (!scope.isAll()) {
                    scope.filter.params.ok = true;
                    scope.filter.params.nok = true;
                    scope.filter.params.empty = true;
                }
            };

            scope.toggleOk = function() {
                if (scope.isAll()) {
                    scope.filter.params.ok = true;
                    scope.filter.params.nok = false;
                    scope.filter.params.empty = false;
                } else {
                    scope.filter.params.ok = !scope.filter.params.ok;
                }
                goBackToAllIfNeeded();
            };

            scope.toggleNok = function() {
                if (scope.isAll()) {
                    scope.filter.params.ok = false;
                    scope.filter.params.nok = true;
                    scope.filter.params.empty = false;
                } else {
                    scope.filter.params.nok = !scope.filter.params.nok;
                }
                goBackToAllIfNeeded();

            };

            scope.toggleEmpty = function() {
                if (scope.isAll()) {
                    scope.filter.params.ok = false;
                    scope.filter.params.nok = false;
                    scope.filter.params.empty = true;
                } else {
                    scope.filter.params.empty = !scope.filter.params.empty;
                }
                goBackToAllIfNeeded();
            };

            scope.displayValue = function (value) {
                if (isNaN(value)) {
                    return value;
                } else {
                    return scope.roundForDisplay(value) + '%';
                }
            };

            scope.roundForDisplay = function (value) {
                let rounded = Math.floor(value);
                if (rounded == 0 && value > 0) {
                    return 1;
                }
                return rounded;
            };

            scope.isNaN = function(value) {
                return isNaN(value);
            }
        }
    };
});

})();
