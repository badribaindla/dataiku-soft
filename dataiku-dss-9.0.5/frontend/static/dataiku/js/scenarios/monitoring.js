(function(){
'use strict';

var app = angular.module('dataiku.monitoring',[]);

app.controller("ScenariosMonitoringController", function($scope, TopNav, $stateParams) {
    TopNav.setItem(TopNav.ITEM_MONITORING, "scenarios", { name: "Scenario runs", id: null });
    TopNav.setLocation(TopNav.TOP_JOBS, "monitoring", TopNav.TABS_MONITORING, "outcomes");

    $scope.projectSummaryMap = {};
    $scope.$watch("projectSummary", function() {
        if (!$scope.projectSummary) return;
        $scope.projectSummaryMap[$stateParams.projectKey] = $scope.projectSummary;
    });
});

app.controller("ScenarioTimelineControllerCommon", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, WT1) {

	$scope.report = null;

	$scope.reportRange = {from : 0, to : 0};

    $scope.uiState = {viewMode : 'TIMELINE', viewDetails : 'STEP', stepQuery : null};

	$scope.setScenarioGantt = function(data) {
        $scope.report = data;
        $scope.topItems = [];
        if ( $scope.report == null ) return;

        // organizing items in a tree
        computeTopItems();

        // sort a bit the sub items
        var cmpItem = function(a,b) {
            var prefixForOrder = function(type) {
                if ( type == 'SCENARIO_TRIGGER') {
                    return '0';
                } else if ( type == 'JOB_EXECUTED') {
                    return '1';
                } else {
                    return '2' + type;
                }
            }
            var aType = prefixForOrder(a.target.type || '');
            var bType = prefixForOrder(b.target.type || '');
            return aType.localeCompare(bType);
        };
        $scope.report.items.forEach(function(item) {
            if ( item.subItems ) {
                item.subItems.sort(cmpItem);
            }
        });

        // expansion
        if ($scope.uiState.viewDetails == 'SCENARIO') {
            $scope.expandToScenario();
        } else if ($scope.uiState.viewDetails == 'STEP') {
            $scope.expandToStep();
        } else if ($scope.uiState.viewDetails == 'DETAILS') {
            $scope.expandToDetails();
        }

        // get the top-level actions for the brush

        // prepare access to row by id
        var topRowById = {};
        $scope.topItems.forEach(function(row) {topRowById[row.uniqueId] = row;}); // based on topItems and not just rows
        // get actions of these top rows
        $scope.topActions = [];
        $scope.report.columns.map(function(column) {
            angular.forEach(column.actions, function(columnActions, uniqueId) {
                if ( uniqueId in topRowById && columnActions.length > 0 ) {
                    var action = columnActions[0];
                    // use start/end from column because that's what used when filtering in gantt and runs view
                    $scope.topActions.push({start:column.start, end:column.end, outcome:action.outcome})
                }
            });
        });
        $scope.topActions.sort(function(a, b) {return a.start - b.start;})

        if ( $scope.report.key.from > $scope.reportRange.to || $scope.report.key.to < $scope.reportRange.from ) {
            // replace range
            $scope.reportRange.from = $scope.report.key.from;
            $scope.reportRange.to = $scope.report.key.to;
        } else {
            // clip range
            $scope.reportRange.from = $scope.report.key.from > $scope.reportRange.from ? $scope.report.key.from : $scope.reportRange.from;
            $scope.reportRange.to = $scope.report.key.to < $scope.reportRange.to ? $scope.report.key.to : $scope.reportRange.to;
        }
    };

    // rows in the graph
    var refreshRows = function() {
        $scope.rows = [];
        if ( $scope.topItems == null ) return;
        if ( $scope.uiState.viewMode == 'TIMELINE' ) {
        	// filter by scenario name, and only on top level
        	var recRefreshRows = function(item, depth) {
        		item.depth = depth;
                $scope.rows.push(item);
        		if ( item.expanded && item.subItems && item.subItems.length > 0) {
        		    // merge triggers on same row
        		    var triggerItems = item.subItems.filter(function(i) {return i.target.type == 'SCENARIO_TRIGGER'});
        		    if ( triggerItems.length > 1 ) { // otherwise no merging is needed
        		        var mergeTargetId = triggerItems[0].uniqueId;
        		        for (var i=1;i<triggerItems.length;i++) {
        		            triggerItems[i].displayOnRow = mergeTargetId;
        		        }
        		    }
        			item.subItems.forEach(function(subItem) {recRefreshRows(subItem, depth + 1);});
        		}
        	};
        	$scope.topItems.forEach(function(item) {if ( $scope.scenarioSearch(item) ) {recRefreshRows(item, 0);}});
        } else {
        	// filter by selected scenario, then expand all, and filter by step name
        	var recRefreshRows = function(item, depth) {
    			item.depth = depth;
    			$scope.rows.push(item);
    			if ( item.expanded && item.subItems && item.subItems.length > 0) {
    				item.subItems.forEach(function(subItem) {recRefreshRows(subItem, depth + 1);});
    			}
        	};
        	var acceptsScenario = function(item) {return $scope.uiState.scenario == null || $scope.uiState.scenario == item;};
        	$scope.topItems.forEach(function(item) {if ( acceptsScenario(item) ) {recRefreshRows(item, 0);}});
        	$scope.rows = $scope.rows.filter(function(item) {return $scope.stepSearch(item);});
        }
    };

    $scope.scenarioSearch = function(column) { return searchInTargetAndInfo(column, $scope.uiState.scenarioQuery); };
    $scope.stepSearch = function(column) { return searchInTargetAndInfo(column, $scope.uiState.stepQuery); };


    // update the displayed rows whenever an "expanded" flag changed, and since all items
    // are descendant of the top items, a single recursive $watch suffices
    $scope.$watch("topItems", function(nv, ov) {
        refreshRows();
    }, true);

    $scope.$watch("uiState", function(nv, ov) {
        refreshRows();
    }, true);

    /*
     * Quick views: scenario - step - details
     */

    $scope.expandToScenario = function() {
        $scope.topItems.forEach(function(item) {item.expanded = false;});
    };

    $scope.expandToStep = function() {
        $scope.topItems.forEach(function(item) {
            item.expanded = true;
            if ( item.subItems && item.subItems.length > 0) {
                item.subItems.forEach(function(subItem) {subItem.expanded = false;});
            }
        });
    };

    $scope.expandToDetails = function() {
        $scope.topItems.forEach(function(item) {
            item.expanded = true;
            if ( item.subItems && item.subItems.length > 0) {
                item.subItems.forEach(function(subItem) {subItem.expanded = true;});
            }
        });
    };

    /*
     * Organizing items in a tree
     */
    var computeTopItems = function() {
        var itemById = {};
        $scope.report.items.forEach(function(item) {
            itemById[item.uniqueId] = item;
            item.subItems = null;
            item.expanded = false;
        });
        $scope.report.items.forEach(function(item) {
            if ( item.parentId == null ) {
                // top item, add it under the root
                $scope.topItems.push(item);
            } else {
                var parent = itemById[item.parentId];
                if ( parent == null ) {
                    $scope.topItems.push(item);
                } else {
                    if ( parent.subItems == null ) {
                        parent.subItems = [];
                    }
                    parent.subItems.push(item);
                }
            }
        });
    }

});

app.controller("TimelineController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, WT1) {
	$controller('ScenarioTimelineControllerCommon', {$scope: $scope});

	$scope.scenarioId = $stateParams.scenarioId;

	// in a uiState object because the search field in below a ng-if and thus in another scope
    angular.extend($scope.uiState, {scenarioQuery: $stateParams.scenarioQuery, scenario: null});
	$scope.pickerFormat = 'YYYY-MM-DD HH:mm';
    $scope.backendFormat = "YYYY-MM-DDTHH:mm:ss.SSS";

    var rangeEnd = moment().add(1, 'hour').startOf('hour');
    if ( $stateParams.scopeToDay ) {
        rangeEnd = moment($stateParams.scopeToDay, "YYYY-MM-DD").add(1, 'days');
    }
    $scope.ganttRange = {from : moment(rangeEnd).subtract(1, 'days').format($scope.pickerFormat), to : moment(rangeEnd).format($scope.pickerFormat)};

    $scope.refreshScenarioGantt = function() {
        WT1.event("refresh-scenarios-gantt");
        var rangeFromTs = moment($scope.ganttRange.from, $scope.pickerFormat).utc();
        var rangeToTs = moment($scope.ganttRange.to, $scope.pickerFormat).utc();
        if ( $scope.scenarioId ) {
            DataikuAPI.scenarios.getScenarioReport($stateParams.projectKey, $scope.scenarioId, rangeFromTs.format($scope.backendFormat) + 'Z', rangeToTs.format($scope.backendFormat) + 'Z').success(function(data){
                $scope.setScenarioGantt(data);
            }).error(setErrorInScope.bind($scope));
        } else if ( $stateParams.projectKey ) {
            DataikuAPI.scenarios.getProjetReport($stateParams.projectKey, rangeFromTs.format($scope.backendFormat) + 'Z', rangeToTs.format($scope.backendFormat) + 'Z').success(function(data){
                $scope.setScenarioGantt(data);
            }).error(setErrorInScope.bind($scope));
        } else {
            DataikuAPI.scenarios.getInstanceReport(rangeFromTs.format($scope.backendFormat) + 'Z', rangeToTs.format($scope.backendFormat) + 'Z').success(function(data){
                $scope.setScenarioGantt(data);
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.$watch("ganttRange.from", function(nv, ov) {
        if ( nv == null || ov == nv ) return;
        $scope.refreshScenarioGantt();
    });
    $scope.$watch("ganttRange.to", function(nv, ov) {
        if ( nv == null || ov == nv ) return;
        $scope.refreshScenarioGantt();
    });

    if ( $scope.scenarioId ) {
        $scope.refreshScenarioGantt();
    }

    $scope.brushChanged = function() {
        $scope.$digest();
    };
    $scope.brushDrillDown = function(from, to) {
        $scope.shrinkRange(from, to);
        // finally, set angular loose
        $scope.$digest();
    };
    $scope.shrinkRange = function(from, to) {
        $scope.ganttRange.from = moment(from).startOf('hour').format($scope.pickerFormat);
        var roundedTo = moment(to).startOf('hour');
        if ( to != roundedTo.valueOf()) {
            roundedTo = roundedTo.add(1, 'hour')
        }
        $scope.ganttRange.to = roundedTo.format($scope.pickerFormat);
        $scope.reportRange.from = $scope.ganttRange.from;
        $scope.reportRange.to = $scope.ganttRange.to;
    };

    $scope.getActions = function(item) {
        var actions = [];
        if ( $scope.report && $scope.report.columns ) {
            $scope.report.columns.forEach(function(column) {
                if ( item.uniqueId in column.actions ) {
                    actions = actions.concat(column.actions[item.uniqueId]);
                }
            });
        }
        return actions;
    };
});

function searchInTargetAndInfo(item, query) {
    if (!query) return true;
    if (!item) return false;
    query = query.toLowerCase();
    for (var k in item.target) {
        var v = item.target[k];
        if (typeof v == 'string') {
            if (v.toLowerCase().indexOf(query) >= 0) return true;
        }
    }
    for (var k in item.info) {
        var v = item.info[k];
        if (typeof v == 'string') {
            if (v.toLowerCase().indexOf(query) >= 0) return true;
        }
    }
    return false;
}

app.controller("ActivitiesViewController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, WT1) {
    var pickerFormat = 'YYYY-MM-DD HH:mm';
    var backendFormat = "YYYY-MM-DDTHH:mm:ss.SSS";
    var nextHour = moment().add(1, 'hour').startOf('hour');
    $scope.activitiesRange = {from : moment(nextHour).subtract(1, 'days').format(pickerFormat), to : moment(nextHour).format(pickerFormat)};

    $scope.refreshActivities = function() {
        WT1.event("refresh-scenarios-activities");
        var rangeFromTs = moment($scope.activitiesRange.from, pickerFormat).utc();
        var rangeToTs = moment($scope.activitiesRange.to, pickerFormat).utc();
        DataikuAPI.scenarios.getProjetActivities($stateParams.projectKey, rangeFromTs.format(backendFormat) + 'Z', rangeToTs.format(backendFormat) + 'Z').success(function(data){
            $scope.activities = data;
        }).error(setErrorInScope.bind($scope));
    };
    $scope.$watch("activitiesRange.from", function(nv, ov) {
        if ( nv == null || ov == nv ) return;
        $scope.refreshActivities();
    });
    $scope.$watch("activitiesRange.to", function(nv, ov) {
        if ( nv == null || ov == nv ) return;
        $scope.refreshActivities();
    });

    // search filters (functions because we search specific fields inside the objects)
    $scope.datasetQuery = null;
    $scope.datasetSearch = function(splitRow) { return searchInTargetAndInfo(splitRow.row, $scope.datasetQuery); };
    $scope.scenarioQuery = null;
    $scope.scenarioSearch = function(column) { return searchInTargetAndInfo(column && column.scenario, $scope.scenarioQuery); };

    $scope.adjustForScroll = {left : 0, top : 0};

    $scope.refreshActivities();
});

app.controller("OutcomesBaseController", function($scope, Fn) {
    $scope.fixupOutcomes = function(columns, nbDays) {
        if(typeof(nbDays) === 'undefined') {
            nbDays = 31;
        }
        if (!columns.length) return;
        // fixup: make sure there are >=31 columns, since the view is set to display 31 columns
        var minDateStr = columns[0].date;
        columns.forEach(function(column) {minDateStr = minDateStr < column.date ? minDateStr : column.date;});
        var minDate = moment(minDateStr, 'YYYY-MM-DD');
        while (columns.length < nbDays) {
            minDate = minDate.subtract(1, 'days');
            columns.unshift({date: minDate.format('YYYY-MM-DD'), actions: {}});
        }
        // fixup: add day of week
        columns.forEach(function(column) {
            var dt = moment(column.date, 'YYYY-MM-DD');
            column.dow = dt.weekday();
            column.dateFormatted = dt.format("D/M");
            column.dateDay = dt.format("ddd");
        });
    };

    $scope.getCellGlobalOutcome = function(actions) {
        if ( actions == null || actions.length == 0 ) return null;
        const outcomes = actions.map(_ => _.outcome.toLowerCase());
        function hasOutcome(outcome) {
            return outcomes.includes(outcome.toLowerCase());
        }
        if (hasOutcome('FAILED'))  return 'failed';
        if (hasOutcome('WARNING')) return 'warning';
        if (hasOutcome('SUCCESS')) return 'success';
        return 'aborted';
    }

    $scope.getSummaryCellGlobalOutcome = function(summary) {
        if (summary.FAILED) return 'failed';
        if (summary.WARNING) return 'warning';
        if (summary.SUCCESS) return 'success';
        return 'aborted';
    }

    $scope.hovered = {date : null, row : null};
    $scope.selected = {column : null, row : null};
});

app.controller("OutcomesViewController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, ScenarioUtils, CreateModalFromTemplate, WT1) {
    $controller('OutcomesBaseController', {$scope: $scope});

    var selectedElement = null;
    var pickerFormat = 'YYYY-MM-DD';
    var backendFormat = "YYYY-MM-DD";
    var nextHour = moment().add(1, 'hour').startOf('hour');
    $scope.outcomesRange = {from : moment(nextHour).subtract(30, 'days').format(pickerFormat), to : moment(nextHour).format(pickerFormat)};

    $scope.projectKey = $stateParams.projectKey;
    $scope.scenarioId = $stateParams.scenarioId;

    $scope.reportRange = {from : 0, to : 0}
    $scope.displayedColumns = [];

    $scope.refreshOutcomes = function() {
        WT1.event("refresh-scenarios-outcomes");
        // send time as is, so that the backend get the day range inputted by the user
        var rangeFromTs = moment($scope.outcomesRange.from, pickerFormat);
        var rangeToTs = moment($scope.outcomesRange.to, pickerFormat);
        DataikuAPI.scenarios.getOutcomes(rangeFromTs.format(backendFormat), rangeToTs.add(1, 'days').format(backendFormat), $scope.projectKey, $scope.scenarioId).success(function(data){
            $scope.outcomes = data;
            $scope.fixupOutcomes(data.columns);
            // refresh displayed range
//            if ( $scope.outcomes.key.from > $scope.reportRange.to || $scope.outcomes.key.to < $scope.reportRange.from ) {
                // replace range
                $scope.reportRange.from = $scope.outcomes.key.from;
                $scope.reportRange.to = $scope.outcomes.key.to;
//            } else {
//                // clip range
//                $scope.reportRange.from = $scope.outcomes.key.from > $scope.reportRange.from ? $scope.outcomes.key.from : $scope.reportRange.from;
//                $scope.reportRange.to = $scope.outcomes.key.to < $scope.reportRange.to ? $scope.outcomes.key.to : $scope.reportRange.to;
//            }
            $scope.refreshDisplayedColumns();
        }).error(setErrorInScope.bind($scope));
    };
    $scope.$watch("outcomesRange.from", function(nv, ov) {
        if ( nv == null || ov == nv ) return;
        $scope.refreshOutcomes();
    });
    $scope.$watch("outcomesRange.to", function(nv, ov) {
        if ( nv == null || ov == nv ) return;
        $scope.refreshOutcomes();
    });

    $scope.refreshDisplayedColumns = function() {
        if ( $scope.outcomes == null || $scope.outcomes.columns == null || $scope.reportRange == null ) {
            $scope.displayedColumns = null;
        } else {
            var startDate = moment($scope.reportRange.from).format('YYYY-MM-DD');
            var endDate = moment($scope.reportRange.to).format('YYYY-MM-DD');
            $scope.displayedColumns = $scope.outcomes.columns.filter(function(column) {return column.date >= startDate && column.date <= endDate});
        }
    };
    $scope.$watch('reportRange', function(nv) {
        if ( nv == null ) return;
        $scope.refreshDisplayedColumns();
    }, true);

    $scope.scenarioQuery = null;
    $scope.scenarioSearch = function(row) { return searchInTargetAndInfo(row, $scope.scenarioQuery); };

    $scope.refreshOutcomes();

    $scope.brushChanged = function() { $scope.$digest(); };

    $scope.hover = function(evt, column, row, localScope) {
        $scope.hovered.date = column.date;
        $scope.hovered.row = row;
        $scope.hovered.actions = row ? column.actions[row.uniqueId] : null;
    };
    $scope.unhover = function(evt, column, row, localScope) {
        $scope.hovered.date = null;
        $scope.hovered.row = null;
        $scope.hovered.actions = null;
    };
    $scope.select = function(evt, column, row, localScope) {
        $scope.selected = {column : column, row : row, formattedDate : moment(column.date).format('dddd, MMMM Do')};
        if(selectedElement) selectedElement.classList.remove('active');
        selectedElement = evt.currentTarget;
        selectedElement.classList.add('active');
    };

    $scope.scenarioIsActive = function(scenarioRow) {
        return scenarioRow.info.active && !ScenarioUtils.getAutoTriggerDisablingReason($scope.appConfig, [$scope.projectSummaryMap[scenarioRow.target.projectKey]]);
    }

    var selectedTarget = null;
    var selectedTargetDate = null;
    $scope.$watch('selected', function() {
        if ( $scope.selected == null || $scope.selected.row == null || $scope.selected.row.target == null ) {
            $scope.selected.scenario = null;
            selectedTarget = null;
            selectedTargetDate = null;
        } else {
            var newSelectedTarget = $scope.selected.row.target;
            var newSelectedTargetDate = moment($scope.selected.column.date).format('YYYY-MM-DD');
            if (newSelectedTarget != selectedTarget || newSelectedTargetDate != selectedTargetDate) {
                selectedTarget = newSelectedTarget;
                selectedTargetDate = newSelectedTargetDate;
                DataikuAPI.scenarios.getOutcomesDetails(selectedTarget.projectKey, selectedTarget.scenarioId, selectedTargetDate).success(function(data){
                    $scope.selected.scenario = data;
                }).error(setErrorInScope.bind($scope));
            } else {
                // no change, don't bother re-fetching
            }
        }
    }, true);
});

app.directive('outcomeCells', function($filter, $timeout) {
    return {
        restrict : 'A',
        scope : true,
        link : function($scope, element, attrs) {
            var hoverCells = [];
            var refreshCells = function() {
                var rows = $scope.$eval(attrs.ngModel);
                var columns = $scope.displayedColumns;
                if (rows == null || columns == null) return;
                if ($scope.scenarioSearch) {
                    rows = $filter('filter')(rows, $scope.scenarioSearch);
                }
                element.empty();
                hoverCells.splice(0,hoverCells.length);
                rows.forEach(function(row) {
                    var rowElement = $(document.createElement("li"));
                    columns.forEach(function(column) {
                        var cellElement = $(document.createElement("div"));
                        // style the cell container
                        cellElement.addClass('cell');
                        cellElement.addClass('clickable');
                        if (angular.equals({}, row)) {
                            cellElement.addClass('empty-row');
                        }
                        if (column.dow == 6 || column.dow == 0) {
                            cellElement.addClass('weekend');
                        }
                        cellElement.css({'width' : (100 / columns.length) + '%'});
                        // put the outcome bar if there is one
                        var cellOutcome = $scope.getCellGlobalOutcome(column.actions[row.uniqueId]);
                        
                        if (cellOutcome) {
                            var lineElement = $(document.createElement("div"));
                            lineElement.addClass('line');
                            lineElement.addClass(cellOutcome);
                            cellElement.append(lineElement);
                        }
                        // add the div to make the hover, hidden by default
                        var hoverElement = $(document.createElement("div"));
                        hoverElement.addClass('fh');
                        hoverElement.addClass('hover-active');
                        hoverElement.addClass('ng-hide');
                        cellElement.append(hoverElement);
                        hoverElement.__row = row;
                        hoverElement.__column = column;
                        hoverCells.push(hoverElement);
                        // add listeners to update the hoverposition
                        cellElement.on('mouseenter', function($event) {$scope.hover($event, column, row, $scope); $timeout(function(){$scope.$digest();});});
                        cellElement.on('mouseleave', function($event) {$scope.unhover($event, column, row, $scope); $timeout(function(){$scope.$digest();});});
                        cellElement.on('click', function($event) {$scope.select($event, column, row, $scope); $timeout(function(){$scope.$digest();});});

                        rowElement.append(cellElement);
                    });
                    rowElement.__row = row;
                    element.append(rowElement);
                });
            };
            var updateHover = function() {
                if (!hoverCells || !$scope.hovered) return;
                hoverCells.forEach(function(hoverCell) {
                   var shown = $scope.hovered.date == hoverCell.__column.date || $scope.hovered.row == hoverCell.__row;
                   if (shown) {
                       if (hoverCell.hasClass('ng-hide')) {
                           hoverCell.removeClass('ng-hide');
                       }
                   } else {
                       if (!hoverCell.hasClass('ng-hide')) {
                           hoverCell.addClass('ng-hide');
                       }
                   }
                });
            };
            $scope.$watch('hovered', updateHover, true);
            $scope.$watch('displayedColumns', refreshCells);
            $scope.$watch(attrs.ngModel, refreshCells, true);
            $scope.$watch('uiState.scenarioQuery', refreshCells, true);
            $scope.$watch('scenarioQuery', refreshCells, true);
        }
    };
});


app.controller("TriggersViewController", function($scope, $controller, DataikuAPI, ActivityIndicator, WT1, Fn) {
    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
    $scope.listItemType = 'SCENARIO';

    $scope.noTags = true;
    $scope.noStar = true;
    $scope.noWatch = true;
    $scope.sortBy = [
        { value: 'projectKeyAndScenarioName', label: 'Scenario' },
        { value: 'nextRunForSort', label: 'Next planned run' },
        { value: 'activeForSort', label: 'Active' }
    ];
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            interest: {
                starred: '',
            },
        },
        filterParams: {
            userQueryTargets: ["projectKey","name","tags"],
            propertyRules: {tag:"tags"},
        },
        orderQuery: "projectKeyAndScenarioName",
        orderReversed: false,
    }, $scope.selection || {});
    $scope.sortCookieKey = 'scenarios';
    $scope.maxItems = 20;

    $scope.list = function() {
        WT1.event("refresh-scenarios-list");
        DataikuAPI.scenarios.listAllHeads().success(function(data){
            $scope.scenarios = data;
            $scope.listItems = data.items;
            $scope.listItems.forEach(function(x){
                x.projectKeyAndScenarioName =  x.projectKey + "$$$" + x.name;
                x.activeForSort = (x.active ? "A" : "Z") + "$$$" + x.projectKey + "$$$" + x.name;
                x.nextRunForSort = x.nextRun == 0 ? 900719925474099 : x.nextRun;
                // Make all non-active scenarios appear after active ones, but still before NA ones
                if (!x.active) x.nextRunForSort += (86400*365*1000);
            })
        }).error(setErrorInScope.bind($scope));
    };
    $scope.list() ;

    /* Specific actions */
    $scope.goToItem = function(data) {};

    $scope.toggleActive = function(scenario) {
        WT1.event("scenario-save-active");
        var message = scenario.active ? 'Activate ' : 'Deactivate ';
        message = message + 'auto-triggers of ' + scenario.projectKey + '.' + (scenario.name || scenario.id);
        DataikuAPI.scenarios.saveNoParams(scenario.projectKey, scenario, {commitMessage:message}).success(function(data){
            // save the expanded states
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.massAutoTriggers = true;
    $scope.allAutoTriggers = function(objects) {
        if (!objects || !objects.length) return;
        return objects.filter(_ => !$scope.getAutoTriggerDisablingReason($scope.appConfig, $scope.projectSummaryMap[_.projectKey])).every(_ => _.active);
    };

    $scope.allAutoTriggersDisabled = function(objects) {
        if (!objects || !objects.length) return;
        const uniqueProjectSummaries = objects.reduce((obj, scenario) => ({...obj, [scenario.projectKey]: $scope.projectSummaryMap[scenario.projectKey]}), {});
        return $scope.getAutoTriggerDisablingReason($scope.appConfig, Object.values(uniqueProjectSummaries));
    };

    $scope.autoTriggersObjects = function(autoTriggerStatus, objects) {
        objects.forEach(function(object) {
            if (!$scope.getAutoTriggerDisablingReason($scope.appConfig, $scope.projectSummaryMap[object.projectKey])
                && object.active !== autoTriggerStatus) {
                object.active = autoTriggerStatus;
                $scope.toggleActive(object);
            }
        });
    };

    $scope.toggleAutomationLocal = function(scenario) {
        //scenario.active = !scenario.active;
        WT1.event("scenario-save-automationLocal");
        DataikuAPI.scenarios.saveNoParams(scenario.projectKey, scenario, {}).success(function(data){
            // save the expanded states
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.runNow = function(scenario) {
        WT1.event("scenario-manual-run-from-list");
        DataikuAPI.scenarios.manualRun(scenario.projectKey, scenario.id)
        .success(function(data){})
        .error(setErrorInScope.bind($scope));
    };
});

app.controller("ReportersViewController", function($scope, $controller, DataikuAPI, ActivityIndicator, Dialogs, WT1) {
    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
    $scope.listItemType = 'SCENARIO';

    $scope.hidePreviewColumn = true;
    $scope.noTags = true;
    $scope.noStar = true;
    $scope.noWatch = true;
    $scope.massDelete = true;
    $scope.massReporters = true;
    $scope.noDelete = true;

    $scope.sortBy = [
        { value: 'projectKey', label: 'Project name' },
        { value: 'scenarioName', label: 'Scenario name' },
        { value: 'reporterName', label: 'Reporter name' },
        { value: 'reporterType', label: 'Reporter type' },
        { value: 'reporterActive', label: 'Active' }
    ];
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            interest: {
                starred: '',
            },
        },
        filterParams: {
            userQueryTargets: ["projectKey", "name", "tags", "reporterName", "reporterType", "reporterProps"],
            propertyRules: { tag: "tags" },
        },
        orderQuery: "scenarioName",
        orderReversed: false,
    }, $scope.selection || {});
    $scope.sortCookieKey = 'scenarios-with-reporters';
    $scope.maxItems = 100;

    $scope.list = () => {
        WT1.event("refresh-scenarios-with-reporters-list");
        DataikuAPI.scenarios.listAllReporters().success((data) => {
            $scope.scenarios = data;
            $scope.listItems = [];
            data.items.forEach(item => {
                item.scenarioName =  item.name;
                item.activeForSort = (item.active ? "A" : "Z") + "$$$" + item.projectKey + "$$$" + item.name;
                item.autoTriggers = item.active;

                item.reporterDigestItems.forEach(reporter => {
                    $scope.listItems.push({
                        ...item,
                        reporter,
                        reporterName: reporter.name,
                        reporterType: formatReporterName(reporter.messagingType),
                        reporterProps: reporter.properties,
                        reporterActive: reporter.active
                    });
                });
            });
        }).error(setErrorInScope.bind($scope));
    };
    $scope.list();

    $scope.toggleActive = (scenario) => {
        WT1.event("scenario-reporter-save-active");
        const message = `${scenario.reporter.active ? 'Activate' : 'Deactivate'}`
                    + ` reporter ${scenario.reporter.name} of ${scenario.projectKey}.${scenario.name || scenario.id}`;
        DataikuAPI.scenarios.saveReporterState(scenario.projectKey, scenario.id, scenario.reporter, { commitMessage:message }).success(() => {
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteReporter = (scenario) => {
        WT1.event("scenario-reporter-delete");
        const message = `Delete reporter ${scenario.reporter.name} of ${scenario.projectKey}.${scenario.name || scenario.id}`;
        DataikuAPI.scenarios.deleteReporter(scenario.projectKey, scenario.id, scenario.reporter, { commitMessage:message }).success(() => {
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.allReporters = (objects) => {
        if (!objects) return;
        return objects.map(s => s.reporter.active).reduce((a,b) => a && b, true);
    };

    $scope.setReporterObjects = (status, scenarios) => {
        scenarios.forEach((scenario) => {
            if (scenario.reporter && scenario.reporter.active === status) return;
            scenario.reporter.active = status;
            $scope.toggleActive(scenario);
        })
    };

    $scope.massDeletion = (scenarios) => {
        if(scenarios.length < 1) return;
        Dialogs.confirm($scope, "Confirm deletion", "Are you sure you want to delete the selected reporters?").then(function() {
            scenarios.forEach((scenario) => {
                scenario.reporter.active = status;
                $scope.deleteReporter(scenario);
                $scope.listItems = $scope.listItems.filter(s => s !== scenario)
            })
        });
    };

    const formatReporterName = (type) => {
        const typeMapping = {
            "mail-scenario": "Mail",
            "slack-scenario": "Slack",
            "msft-teams-scenario": "Microsoft Teams",
            "webhook-scenario": "Webhook",
            "twilio-scenario": "Twilio",
            "shell-scenario": "Shell command",
            "dataset-scenario": "Send to dataset"
        };
        return typeMapping[type] || type;
    }
});

app.controller("AutomationOutcomesController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, WT1, ScenarioUtils) {
	TopNav.setItem(TopNav.ITEM_MONITORING, "scenarios", { name: "Automation monitoring", id: null });
	TopNav.setLocation("DSS_HOME", "automation", TopNav.TABS_SCENARIO, "outcomes");

    $scope.getAutoTriggerDisablingReason = function(appConfig, projectSummaries) {
        if (!appConfig || !projectSummaries) return "";
        return ScenarioUtils.getAutoTriggerDisablingReason(appConfig, [].concat(projectSummaries));
    }

    $scope.projectSummaryMap = {};
    DataikuAPI.projects.list().success(function(projectSummaryList) {
        projectSummaryList.forEach(function(projectSummary) {
            $scope.projectSummaryMap[projectSummary.projectKey] = projectSummary;
        });
    });
});

app.controller("OutcomesSummaryController", function($scope, $controller, DataikuAPI, Fn, $stateParams, $state) {
    $controller('OutcomesBaseController', {$scope: $scope});

    $scope.projectKey = $stateParams.projectKey;

    var backendFormat = "YYYY-MM-DD";
    var nextHour = moment().add(1, 'hour').startOf('hour');
    DataikuAPI.scenarios.getOutcomesSummary(
        $scope.projectKey,
        moment(nextHour).subtract(31, 'days').format(backendFormat),
        moment(nextHour).add(1, 'days').format(backendFormat)
    ).success(function(data) {
        const columns = [];
        for (let i = 31 ; i >=0 ; i--) {
            const c = {date: moment(nextHour).subtract(i, 'days').format(backendFormat)};
            c.dateTooltip = moment(c.date).format('MMM. Do');
            c.scenarios = [];
            for (const scenario in data.countsByScenario) {
                if (c.date in data.countsByScenario[scenario].countsByDay) {
                    const curDate = data.countsByScenario[scenario].countsByDay[c.date];
                    c.scenarios.push({
                        name: scenario,
                        aborted: curDate.countByOutcome.ABORTED || 0,
                        failed: curDate.countByOutcome.FAILED || 0,
                        success: curDate.countByOutcome.SUCCESS || 0,
                        warning: curDate.countByOutcome.WARNING || 0,
                        runs: curDate.total,
                        outcome: $scope.getSummaryCellGlobalOutcome(curDate.countByOutcome)
                    });
                }
                c.outcome = $scope.getCellGlobalOutcome(c.scenarios);
                c.runs = c.scenarios.map(Fn.prop('runs')).reduce(Fn.SUM, 0);
            }
            columns.push(c);
        }

        $scope.fixupOutcomes(columns);
        $scope.totalRuns = data.total;
        $scope.columns = columns;
    })
    .error(setErrorInScope.bind($scope));

    $scope.hover = function(evt, column, localScope) {
        $scope.hovered.date = column.date;
        if (column.outcome) {
            evt.target.classList.add('mainzone');
            $scope.popoverColumn = column;
            localScope.showPopover();
        }
    };
    $scope.unhover = function(evt, column, localScope) {
        $scope.hovered.date = null;
        if (column.outcome) {
            evt.target.classList.remove('mainzone');
            $scope.popoverColumn = null;
            localScope.hidePopover();
        }
    };
    $scope.gotoRuns = function(column) {
        $state.go('projects.project.monitoring.scenarios.scoped', {scopeToDay : column.date});
    };
});

// directives to save the scroll position in the scope. The adjustForScroll object has to be put in the scope by someone else
app.directive('freezeHeader', function() {
    return {
        restrict : 'A',
        scope : true,
        link : function($scope, element, attrs) {
            element.on('scroll', function() {
                $scope.$apply(function() {$scope.adjustForScroll.top = element[0].scrollTop;});
            });
        }
    };
});
app.directive('freezeColumns', function() {
    return {
        restrict : 'A',
        scope : true,
        link : function($scope, element, attrs) {
            element.on('scroll', function() {
                $scope.$apply(function() {$scope.adjustForScroll.left = element[0].scrollLeft;});
            });
        }
    };
});

app.directive('actionsByOutcome', function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate) {
    return {
        restrict : 'A',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.actions = $scope.$eval(attrs.actions);
            $scope.outcomeActions = [];
            if ($scope.actions != null) {
                $scope.actions.forEach(function(action) {
                    var outcomeAction = null;
                    $scope.outcomeActions.forEach(function(ta) {
                        if ( ta.outcome == action.outcome ) {
                            outcomeAction = ta;
                        }
                    });
                    if ( outcomeAction == null ) {
                        outcomeAction = {outcome : action.outcome, actions : []};
                        $scope.outcomeActions.push(outcomeAction);
                    }
                    outcomeAction.actions.push(action);
                });
            }
        }
    }
});

app.directive('groupActionsByRowType', function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate) {
    return {
        restrict : 'A',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.splitRows = [];
            $scope.$watch(attrs.tableData, function() {
                var tableData = $scope.$eval(attrs.tableData);
                if (tableData != null) {
                    var allActionTypesByRow = {};
                    tableData.columns.forEach(function(column) {
                        column.actionsByRowType = {};
                        angular.forEach(column.actions, function(actions, rowId) {
                            var actionsByType = {};
                            if ( allActionTypesByRow[rowId] == null ) {
                                allActionTypesByRow[rowId] = {};
                            }
                            actions.forEach(function(action) {
                                allActionTypesByRow[rowId][action.type] = '';
                                if ( actionsByType[action.type] == null ) {
                                    actionsByType[action.type] = [];
                                }
                                actionsByType[action.type].push(action);
                            });
                            column.actionsByRowType[rowId] = actionsByType;
                        });
                    });
                    $scope.splitRows = [];
                    tableData.rows.forEach(function(row) {
                        var actionTypes = allActionTypesByRow[row.uniqueId];
                        var rowSpan = 0;
                        angular.forEach(actionTypes, function(value, key) {rowSpan++;}); // count types
                        angular.forEach(actionTypes, function(value, key) {
                            $scope.splitRows.push({row: row, actionType: key, span: rowSpan});
                            rowSpan = 0; // only the first cell of the first rows spans the next ones
                        });
                    });
                }
            });
        }
    }
});

app.directive('hierarchicalGantt', function($state, Fn, WT1) {
    return {
        restrict : 'A',
        scope : {
            rows : '=',
            columns : '=',
            reportRange : '=',
            hovered : '=',
            applyHover : '=',
            canWriteProject : '='
        },
        link : function($scope, element, attrs) {
            var headerHeight = 55;
            var rowHeight = 25;
            var triggerWidth = 10;

            // stuff to listen on for graph changes
            $scope.$watch('reportRange', function() {$scope.refreshPlot();}, true);
            $scope.$watch('rows', function() {$scope.refreshPlot();}, true);

            // the svg needs to update when the width changes (different # of ticks, for ex)
            var eventName = 'resize.gantt.' + $scope.$id;
            $(window).on(eventName, function() {$scope.refreshPlot();});
            $scope.$on('$destroy', function(){$(window).off(eventName)});

            // the graph area
            var chartSvg = d3.select(element[0]).classed('chart') ? d3.select(element[0]) : d3.select(element[0]).select(".chart");
            var chart = chartSvg.append("g").attr("transform", "translate(0,"+headerHeight+")");
            var yHoverBackgroundG = chart.append("g").attr("class", "y axis background");
            var actionsG = chart.append("g").attr("class", "actions");
            var triggersG = chart.append("g").attr("class", "triggers");
            var xAxisG = chart.append("g").attr("class", "x axis");
            var xGridLinesG = chart.append("g").attr("class", "x gridlines");
            var yGridLinesG = chart.append("g").attr("class", "y gridlines");

            var y = null;
            // update the graph
            $scope.refreshPlot = function() {
                if ( $scope.rows == null ) return;
                // flatten data
                var yLabels = $scope.rows.filter(function(row) {return row.displayOnRow == null;}).map(function(row) {return row.uniqueId;});
                var data = [];
                if ($scope.columns && $scope.columns.length > 0) {
                    data = $scope.columns.map(function(column) {
                    	var actions = [];
                		angular.forEach(column.actions, function(columnActions, uniqueId) {
                    		columnActions.forEach(function(action) {actions.push({x:action, y:uniqueId, runId:column.runId});});
                    	});
                    	return actions;
                    })
                    .reduce(function(list, actions) {return list.concat(actions);}, []);
                }
                // prepare access to row by id
                var rowById = {};
                $scope.rows.forEach(function(row) {rowById[row.uniqueId] = row;});

                // keep items of shown rows
                data = data.filter(function(action) {return action.y in rowById;});

                // split according to how we want to represent them
                var actionData = [];
                var triggerData = [];
                data.forEach(function(d) {
                    if ( d.x.type == 'TRIGGER_FIRED' ) {
                        triggerData.push(d);
                    } else {
                        actionData.push(d);
                    }
                });

                // get the available width
                var width = element.closest('.cells').innerWidth();
                // height is defined by the data
                var height =  rowHeight * yLabels.length;
                chartSvg.attr("width", width).attr("height", height);

                // make the axes
                var x = d3.time.scale().domain([new Date($scope.reportRange.from), new Date($scope.reportRange.to)]).range([0, width]);
                y = d3.scale.ordinal().domain(yLabels).rangeRoundBands([0, height]);

                var xAxis = d3.svg.axis().scale(x).tickFormat(Fn.getCustomTimeFormat()).orient("top").tickSize(4, 0, 0);
                var xGridLines = d3.svg.axis().scale(x).orient("top").tickSize(-height, 0, 0);
                xAxisG.call(xAxis);
                xGridLinesG.call(xGridLines).selectAll("text").remove();

                yGridLinesG.selectAll("line").remove();
                var yGridLines = yGridLinesG.selectAll("line").data(yLabels);
                yGridLines.enter().append("line")
                        .attr("x1", 0)
                        .attr("x2", width)
                        .attr("y1", function(d) {return y(d);})
                        .attr("y2", function(d) {return y(d);})
                        .classed("top-row", function(d) {return rowById[d].depth == 0;});

                // put the bars
                actionsG.selectAll("*").remove();
                var bars = actionsG.selectAll(".action").data(actionData)
                bars.enter().append("rect")
                      .classed("action", true)
                      .classed("success", function(d) {return d.x.outcome == 'SUCCESS'})
                      .classed("warning", function(d) {return d.x.outcome == 'WARNING'})
                      .classed("failed", function(d) {return d.x.outcome == 'FAILED'})
                      .classed("aborted", function(d) {return d.x.outcome == 'ABORTED'})
                      .classed("none", function(d) {return d.x.outcome == null})
                      .classed("scenario-level", function(d) {return d.x.type == 'SCENARIO_DONE'})
                      .classed("step-level", function(d) {return d.x.type == 'STEP_DONE'})
                      .attr("y", function(d) { return y(d.y); })
                      .attr("height", rowHeight);
                // update every time, not just on enter, for when just the x axis range is modified
                bars.attr("x", function(d) { return x(new Date(d.x.start)); })
                      .attr("width", function(d) { return d.x.end >= d.x.start ? Math.max(1, x(new Date(d.x.end)) - x(new Date(d.x.start))) : 0; });

                triggersG.selectAll("*").remove();
                var triangles = triggersG.selectAll(".trigger").data(triggerData)
                triangles.enter().append("path")
                        .classed("trigger", true)
                        .attr("d", function(d) { return "M" + x(new Date(d.x.start)) + "," + y(rowById[d.y].displayOnRow || d.y) + " l"+triggerWidth+","+(rowHeight/2)+" l-"+triggerWidth+","+(rowHeight/2)+" z"; });
                triangles.on("mouseover", function(d){
                			var row = rowById[d.y];
                			triggersG.append("text")
	                            .attr("x", x(new Date(d.x.start)) + triggerWidth + 3)
	                            .attr("y", y(rowById[d.y].displayOnRow || d.y) + rowHeight / 2 + 4)
	                            .classed("trigger-text", true)
	                            .text((row && row.info) ? row.info.name || row.info.type : '');
                         })
                		.on("mouseout", function(){triggersG.selectAll("text").remove();});

                // click handlers. At the moment, only one is not row-based: jobs
                if ($scope.canWriteProject) {
	                bars.filter(function(d) {return d.x.type == 'JOB_EXECUTED';}).classed("clickable", true).on("click", function(d){
	                    WT1.event("gantt-to-job");$state.go('projects.project.jobs.job', {jobId : d.x.jobId});
	                });
	                bars.filter(function(d) {return d.x.type == 'SCENARIO_DONE';}).classed("clickable", true).on("click", function(d){
	                    WT1.event("gantt-to-scenario-run");$state.go('projects.project.scenarios.scenario.runs.list.run', {projectKey : d.x.target.projectKey, scenarioId : d.x.target.scenarioId, runId : d.runId});
	                });
                }

                var hovers = yHoverBackgroundG.selectAll(".bar");
                hovers.attr("width", width);
           };

           $scope.$watch('hovered', function() {
        	   if (typeof($scope.applyHover)==='function') {
        		   $scope.applyHover(y, rowHeight, yHoverBackgroundG);
        	   }
           }, true);
        }
    };
});
app.directive('hierarchicalActivity', function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate, WT1) {
    return {
        restrict : 'A',
        scope : {
            rows : '=',
            columns : '=',
            reportRange : '=',
            hovered : '=',
            applyHover : '=',
            canWriteProject : '='
        },
        link : function($scope, element, attrs) {
            var headerHeight = 55;
            var rowHeight = 25;

            // stuff to listen on for graph changes
            $scope.$watch('reportRange', function() {$scope.refreshPlot();}, true);
            $scope.$watch('rows', function() {$scope.refreshPlot();}, true);

            // the svg needs to update when the width changes (different # of ticks, for ex)
            var eventName = 'resize.activity.' + $scope.$id;
            $(window).on(eventName, function() {$scope.refreshPlot();});
            $scope.$on('$destroy', function(){$(window).off(eventName)});

            // the graph area
            var chartSvg = d3.select(element[0]).classed('chart') ? d3.select(element[0]) : d3.select(element[0]).select(".chart");
            var chart = chartSvg.append("g").attr("transform", "translate(0,"+headerHeight+")");
            var yHoverBackgroundG = chart.append("g").attr("class", "y axis background");
            var actionsG = chart.append("g").attr("class", "actions");
            var xAxisG = chart.append("g").attr("class", "x axis");
            var xSubAxisG = chart.append("g").attr("class", "x sub-axis");
            var yGridLinesG = chart.append("g").attr("class", "y gridlines");

            var y = null;
            // update the graph
            $scope.refreshPlot = function() {
                if ( $scope.rows == null || $scope.columns == null ) return;
                // prepare access to row and column by id
                var rowById = {};
                $scope.rows.forEach(function(row) {rowById[row.uniqueId] = row;});
                var columnById = {};
                $scope.columns.forEach(function(column) {columnById[column.start] = column;});

                // flatten data
                var yLabels = $scope.rows.map(function(row) {return row.uniqueId;});
                var data = $scope.columns.map(function(column) {
                	var actions = [];
                    // filter x axis on range
                	if ( column.start >= $scope.reportRange.from && column.start <= $scope.reportRange.to ) {
                		angular.forEach(column.actions, function(columnActions, uniqueId) {
                			if ( uniqueId in rowById ) {
                                actions.push({x:column.start,
                                            y:uniqueId,
                                            a:columnActions[columnActions.length - 1],
                                            r:column.runId
                                });
                			}
                		});
                	}
                	return actions;
                })
                .reduce(function(list, actions) {return list.concat(actions);}, []);
                var usedColumns = {};
                data.forEach(function(d) {usedColumns[d.x] = d.x;});
                var filteredXLabels = [];
                angular.forEach(usedColumns, function(value, column) {filteredXLabels.push(value);});
                filteredXLabels.sort();

                var days = [];
                filteredXLabels.forEach(function(start, i) {
                	var day = moment(start).format('ddd MM/DD');
                	if (days.length == 0 || days[days.length-1].day != day) {
                		days.push({day:day, runs:1, i:i})
                	} else {
                		days[days.length-1].runs++;
                	}
                });

                // keep items of shown rows
                data = data.filter(function(action) {return action.x in columnById && action.y in rowById;});

                // get the available width
                var width = element.closest('.cells').innerWidth();
                // height is defined by the data
                var height =  rowHeight * yLabels.length;
                chartSvg.attr("width", width).attr("height", height);

                // make the axes
                y = d3.scale.ordinal().domain(yLabels).rangeRoundBands([0, height]);
                // make the x axis ourselves
                var bandWidth = filteredXLabels.length > 0 ? width / filteredXLabels.length : width;
                var xPos = {};
                filteredXLabels.forEach(function(start, i) {xPos[start] = i;});
                xAxisG.selectAll("*").remove();
                xAxisG.selectAll(".gridlines").data(filteredXLabels).enter().append("line")
                	.classed("gridlines", true)
	            	.attr("x1", function(d) {return bandWidth * xPos[d];})
	            	.attr("x2", function(d) {return bandWidth * xPos[d];})
	            	.attr("y1", -4)
	            	.attr("y2", height);
                xAxisG.selectAll(".tick").data(filteredXLabels).enter().append("text")
                	.classed("tick", true)
	            	.attr("x", function(d) {return bandWidth * (0.5 + xPos[d]);})
	            	.attr("y", -8)
	            	.text(function(d) {return moment(d).format('HH:mm');});
                // and the 'day' sub axis
                xSubAxisG.selectAll("*").remove();
                xSubAxisG.selectAll(".gridlines").data(days).enter().append("line")
                	.classed("gridlines", true)
	            	.attr("x1", function(d) {return bandWidth * d.i;})
	            	.attr("x2", function(d) {return bandWidth * d.i;})
	            	.attr("y1", -35)
	            	.attr("y2", height);
                xSubAxisG.selectAll(".tick").data(days).enter().append("text")
                	.classed("tick", true)
	            	.attr("x", function(d) {return bandWidth * (0.5 * d.runs + d.i);})
	            	.attr("y", -39)
	            	.text(function(d) {return d.day});

                yGridLinesG.selectAll("line").remove();
                var yGridLines = yGridLinesG.selectAll("line").data(yLabels);
                yGridLines.enter().append("line")
                        .attr("x1", 0)
                        .attr("x2", width)
                        .attr("y1", function(d) {return y(d);})
                        .attr("y2", function(d) {return y(d);})
                        .classed("top-row", function(d) {return rowById[d].depth == 0;});

                // put the bars
                actionsG.selectAll("*").remove();
                var dots = actionsG.selectAll("a").data(data)
                dots.enter().append("a")
                    .append("circle")
                        .attr("class", function(d) { return "action " + (d.a.outcome || 'none').toLowerCase(); })
                        .classed("scenario-level", function(d) {return d.a.type == 'SCENARIO_DONE'})
                        .classed("step-level", function(d) {return d.a.type == 'STEP_DONE'})
                        .attr("cy", function(d) { return y(d.y) + 0.5 * rowHeight; })
                        .attr("r", 0.3 * rowHeight);
                // update every time, not just on enter, for when just the x axis range is modified
                dots.selectAll("a circle.action")
                    .attr("cx", function(d) { return (xPos[d.x] + 0.5) * bandWidth; });
                if ($scope.canWriteProject) {
                	dots.filter(function(d) {return d.a.type == 'JOB_EXECUTED';}).classed("clickable", true).on("click", function(d){
                        WT1.event("runs-to-job");$state.go('projects.project.jobs.job', {jobId : d.a.jobId});
                    });
                    dots.filter(function(d) {return d.a.type == 'SCENARIO_DONE';}).classed("clickable", true).on("click", function(d){
                        WT1.event("runs-to-scenario-run");$state.go('projects.project.scenarios.scenario.runs.list.run', {projectKey : d.a.target.projectKey, scenarioId : d.a.target.scenarioId, runId : d.runId});
                    });
                }

                var hovers = yHoverBackgroundG.selectAll(".bar");
                hovers.attr("width", width);
           };

           $scope.$watch('hovered', function() {
        	   if (typeof($scope.applyHover)==='function') {
        		   $scope.applyHover(y, rowHeight, yHoverBackgroundG);
        	   }
           }, true);
        }
    };
});
app.directive('hierarchicalHover', function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate) {
    return {
        restrict : 'A',
        scope : false,
        link : function($scope, element, attrs) {
            // coordinated hovering in chart and header rows
            $scope.hovered = {};
            $scope.hoverOver = function(uniqueId, enter) {
                if ( enter ) $scope.hovered[uniqueId] = true; else delete $scope.hovered[uniqueId];
            };
            $scope.isHovered = function(item) {
                return $scope.hovered[item.uniqueId] || false;
            };

            $scope.applyHover = function(y, rowHeight, yHoverBackgroundG) {
                var uniqueIds = [];
                angular.forEach($scope.hovered, function(value, key) {uniqueIds.push(key);});
                if (y != null) {
                    yHoverBackgroundG.selectAll("*").remove();
                    var bars = yHoverBackgroundG.selectAll(".bar").data(uniqueIds);
                    bars.enter().append("rect")
                    .attr("x", 0)
                    .attr("y", function(d) { return y(d); })
                    .attr("height", rowHeight);

                    var width = element.find('.cells').innerWidth() - 1; // -1 for the last tick
                    bars.attr("width", width);
                }
           };
        }
    };
});

app.directive('actionsGraph', function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate, $filter) {
    return {
        restrict : 'E',
        templateUrl : '/templates/scenarios/fragments/actions-graph.html',
        scope : {
            actions : '=',
            averageDuration : '='
        },
        link : function($scope, element, attrs) {
            // propagate data changes into this directive
            $scope.$watch('actions', function(nv, ov) {
                if ( $scope.actions ) {
                    $scope.refreshPlot();
                }
            });

            var width = $(element).innerWidth();
            var height = $(element).innerHeight();
            var left = 30;
            var right = 10;
            var top = 5;
            var bottom = 10;

            // the graph area
            var chartSvg = d3.select(".actions-chart");
            var chart = chartSvg.append("g").attr("width", width).attr("height", height);
            var xAxisG = chart.append("g").attr("class", "x axis").attr("transform", "translate(" + left + "," + (height-bottom) + ")");
            var yAxisG = chart.append("g").attr("class", "y axis").attr("transform", "translate(" + left + "," + top + ")");
            var actionsG = chart.append("g").attr("class", "actions").attr("transform", "translate(" + left + "," + top + ")");
            var averageG = chart.append("g").attr("class", "average").attr("transform", "translate(" + left + "," + top + ")");

            // update the graph
            $scope.refreshPlot = function() {
                if ( $scope.actions == null ) return;

                var sortedActions = $scope.actions.concat().sort(function(a,b) {return a.start - b.start;});

                var maxDuration = 0;
                var starts = [];
                sortedActions.forEach(function(action) {
                    var duration = action.end - action.start;
                    if ( duration > maxDuration ) maxDuration = duration;
                    starts.push(action.start);
                });
                var x = d3.scale.ordinal().domain(starts).rangeRoundBands([0, width - (left + right)], 0.1, 0.05);
                var y = d3.scale.linear().domain([0, maxDuration]).range([height - (top + bottom), 0]);

                var formatDuration = function(d) {
                    var secs = d / 1000;
                    if ( secs < 120 ) {
                        return '' + Math.round(secs) + 's';
                    }
                    var mins = secs / 60;
                    if ( mins < 120 ) {
                        return '' + Math.round(mins) + 'm';
                    }
                    var hours = mins / 60;
                    return '' + Math.round(hours) + 'h';
                };

                var yAxis = d3.svg.axis()
                    .scale(y)
                    .orient("left")
                    .tickFormat(formatDuration);

                var xAxis = d3.svg.axis()
                    .scale(x)
                    .orient("bottom")
                    .tickFormat(function (d) { return ''; })
                    .tickSize(0);

                xAxisG.call(xAxis);
                //yAxisG.call(yAxis);

                var points = actionsG.selectAll(".action").data(sortedActions)
                points.enter().append("rect")
                    .classed("action", true)
                    .classed("success", function(d) {return d.outcome == 'SUCCESS'})
                    .classed("warning", function(d) {return d.outcome == 'WARNING'})
                    .classed("failed", function(d) {return d.outcome == 'FAILED'})
                    .classed("aborted", function(d) {return d.outcome == 'ABORTED'})
                    .classed("none", function(d) {return d.outcome == null})
                    .attr("x", function(d) { return x(d.start); })
                    .attr("y", function(d) { return y(d.end - d.start); })
                    .attr("width", Math.max(1, x.rangeBand()))
                    .attr("height", function(d) { return height - (top + bottom) - y(d.end - d.start); });

                averageG.selectAll("*").remove();
                averageG.append("line")
                    .attr("x1", 0)
                    .attr("x2", width)
                    .attr("y1", y($scope.averageDuration))
                    .attr("y2", y($scope.averageDuration));
                averageG.append("text")
                .attr("x", -2)
                .attr("y", y($scope.averageDuration))
                .text(formatDuration($scope.averageDuration));
            };
        }
    };
});

app.directive('timeRangeBrush', function(Fn) {
    return {
        restrict : 'A',
        templateUrl : '/templates/scenarios/fragments/time-range-brush.html',
        scope : {
            range : '=',
            selectedRange : '=',
            onChange : '&',
            onDrillDown : '&',
            rounding : '@'
        },
        replace : true,
        link : function($scope, element, attrs) {
            var padding = 10;
            var handleRadius = 5;
            var sliderWidth = 4;
            var brushHeight = 30;
            // the svg needs to update when the width changes (different # of ticks, for ex)
            var eventName = 'resize.brush.' + $scope.$id;
            $(window).on(eventName, function() { if ( $scope.range != null ) $scope.refreshRange();});
            $scope.$on('$destroy', function(){$(window).off(eventName)});
            // also add a watch on the width for the cases where the size changes as a result of
            // stuff being shown/hidden
            $scope.$watch(
                function () {return element.width();},
                function (newValue, oldValue) { if ( $scope.range != null ) $scope.refreshRange(); }
            );

            // get the brush : the root of the template
            var brushSvg = d3.select(element[0]);
            // resize
            brushSvg.attr("height", brushHeight);
            // add stuff in the svg
            var xAxisG = brushSvg.append("g").attr("class", "x axis").attr("transform", "translate(0," + (brushHeight - handleRadius) + ")");
            var xAxisLineG = brushSvg.append("g").attr("class", "x line");
            var brushG = brushSvg.append("g").attr("class", "x brush"); // brush on top (to catch mouse events)
            var xTicksG = brushSvg.append("g").attr("class", "x ticks").attr("transform", "translate(0," + (brushHeight - handleRadius) + ")");
            var brushHandlesG = brushSvg.append("g").attr("class", "x handles");

            brushSvg.on('dblclick', function(e) {
                var insideExtent = false;
                if ( xScale != null ) {
                    var pos = d3.mouse(element[0]);
                    var xPos = xScale.invert(pos[0]).getTime();
                    insideExtent = $scope.selectedRange.from < xPos && $scope.selectedRange.to > xPos;
                }
                if (insideExtent && $scope.onDrillDown() != null) {
                    // why can't I pass the first () in the html? dunno...
                    $scope.onDrillDown()($scope.selectedRange.from, $scope.selectedRange.to);
                } else {
                    $scope.selectedRange.from = $scope.range.from;
                    $scope.selectedRange.to = $scope.range.to;
                    $scope.refreshRange();
                    $scope.onChange();
                }
            });

            var xScale = null;

            // update the total range, and then the graph
            $scope.refreshRange = function() {
                if ( $scope.range == null || $scope.selectedRange == null ) {
                    return;
                }
                var width = $(element).innerWidth();
                // the full range we are selecting in
                var axisRange = [new Date($scope.range.from), new Date($scope.range.to)];
                // the selected range
                var extentRange = $scope.selectedRange.from > 0 ? [new Date($scope.selectedRange.from), new Date($scope.selectedRange.to)] : axisRange;
                // make the scale
                xScale = d3.time.scale().domain(axisRange).range([padding + handleRadius + 1, width - padding - handleRadius - 1]);
                // prepare the brush callback
                var brushed = function() {
                    var extent = brush.extent();
                    if (d3.event.mode === "move") {
                        if ( $scope.rounding == 'day') {
                            var startDay = d3.time.day.round(extent[0]);
                            var daySpan = Math.round((extent[1] - extent[0]) / (24 * 3600 * 1000));
                            var endDay = d3.time.day.offset(startDay, daySpan);
                            extent = [startDay, endDay];
                        }
                    } else {
                        if ( $scope.rounding == 'day') {
                            extent = extent.map(d3.time.day.round);
                            if (extent[0] >= extent[1] ) {
                                extent[0] = d3.time.day.floor(extent[0]);
                                extent[1] = d3.time.day.ceil(extent[1]);
                            }
                        }
                    }
                    d3.select(this).call(brush.extent(extent));
                    brushHandlesG.selectAll('.s').attr("cx", xScale(extent[0]));
                    brushHandlesG.selectAll('.e').attr("cx", xScale(extent[1]));

                    $scope.selectedRange.from = extent[0].getTime();
                    $scope.selectedRange.to = extent[1].getTime();
                    $scope.onChange();
                };
                // make the brush
                var brush = d3.svg.brush().x(xScale).on("brush", brushed).extent(extentRange);
                // make the axis from the scale
                var xAxis = d3.svg.axis().scale(xScale).tickFormat(Fn.getCustomTimeFormat()).orient("top").tickSize(handleRadius);
                // and create the svg objects
                var a = xAxisG.call(xAxis);
                var b = brushG.call(brush);

                var lineY = brushHeight - handleRadius - 0.5 * sliderWidth;
                // replace the axis line by a rect
                a.selectAll(".domain").remove();
                a.selectAll(".tick > line").remove();
                xAxisLineG.selectAll('rect').remove();
                xAxisLineG.append("rect").attr("x", padding + handleRadius + 1).attr("y", lineY).attr("width", Math.max(0, width - 2 * (padding + handleRadius + 1))).attr("height", sliderWidth);
                // make ticks, between the brush and the handles
                xTicksG.selectAll('circle').remove();
                a.selectAll(".tick").each(function(d) { xTicksG.append("circle").attr("r", 0.5 * sliderWidth).attr("cx", xScale(d)); });
                // the brush above it
                b.selectAll(".extent").attr("y", lineY).attr("height", sliderWidth);
                brushG.selectAll(".resize > rect").attr("y", 0).attr("height", brushHeight);
                  // and finally the handles
                brushHandlesG.selectAll('circle').remove();
                brushHandlesG.append("circle").attr("cx", xScale(extentRange[0])).attr("cy", brushHeight - handleRadius).attr("r", handleRadius).classed("s", true);
                brushHandlesG.append("circle").attr("cx", xScale(extentRange[1])).attr("cy", brushHeight - handleRadius).attr("r", handleRadius).classed("e", true);
            };

            // add event handler to adjust the brush when the selection changes
            $scope.$watch('range', function(nv, ov) {
                if ( nv == null ) return;
                $scope.refreshRange();
            }, true);
            $scope.$watch('selectedRange', function(nv, ov) {
                if ( nv == null ) return;
                $scope.refreshRange();
            }, true);
        }
    };
});

})();
