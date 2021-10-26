(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("WindowRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $controller) {
        $scope.recipeType = "window";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

        $scope.autosetName = function() {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
                $scope.maybeSetNewDatasetName(niceInputName + "_windows");
            }
        };
    });

    app.controller("WindowRecipeController", function($scope, $stateParams, DataikuAPI, $q,Dialogs, TopNav, ContextualMenu, PartitionDeps, $rootScope,
     $timeout, DKUtils, Expressions, Logger, $controller,  RecipesUtils, CreateModalFromTemplate, Fn) {
        var groupingCtrl = $controller('GroupingRecipeController', {$scope: $scope}); //Controller inheritance
        var visualCtrl = groupingCtrl.visualCtrl; //FIXME ugly: inheritance cannot be expressed this way
        $scope.aggregateUsabilityFlag = "usableInWindow";

        $scope.simpleAggregationTypes =  [
            {name: "value", opType: "RETRIEVE", label: "Retrieve", tooltip: "Retrieve original value"},
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
        $scope.lagAggregationTypes = [
            {name: "lag", label: "Lag", tooltip: "Value in a previous row"},
            {name: "lagDiff", opType: "LAG_DIFF", label: "LagDiff", tooltip: "Difference with a previous row"},
        ];
        $scope.leadAggregationTypes = [
            {name: "lead", label: "Lead", tooltip: "Value in a following row"},
            {name: "leadDiff", opType: "LEAD_DIFF", label: "LeadDiff", tooltip: "Difference with a following row"},
        ];
        $scope.aggregationTypes = $scope.simpleAggregationTypes.concat($scope.lagAggregationTypes,$scope.leadAggregationTypes);

        function makeSelectionTest(f) {
            return function() {
                if (!$scope.selection||!$scope.selection.allObjects) { return false }
                return $scope.selection.allObjects.map(f).reduce(Fn.OR,false);
            }
        }
        $scope.shouldDisplayDateUnit = makeSelectionTest.call(null,function(o) {return (o.leadDiff || o.lagDiff) && o.type == 'date'});

        $scope.addWindow = function() {
            $scope.params.windows = $scope.params.windows || [];
            $scope.params.windows.push({
                prefix: $scope.params.windows.length ? "w"+($scope.params.windows.length+1) : ""
            });
        };

        $scope.removeWindow = function(index) {
            $scope.params.windows.splice(index,1);
        };

        $scope.allWindowsOrdered = function() {
            var ret = true;
            (($scope.params || {}).windows || []).forEach(function(w){
                ret = w.enableOrdering && w.orders && w.orders.length && ret;
            });
            return ret;
        }

        $scope.addPartitioningColumn = function(win) {
            win.partitioningColumns = win.partitioningColumns || [];
            var columns = $scope.getColumnsWithComputed();
            var colName;
            if (columns) {
                var columnNames = columns.map(function(col){return col.name});
                //TODO smarter autoselect ?
                for (var i = 0; i < columns.length; ++i) {
                    if (win.partitioningColumns.indexOf(columnNames[i]) < 0) {
                        colName = columnNames[i];
                        break;
                    }
                }
                colName = colName || columnNames[0]; //TODO smarter autoselect
            }
            win.partitioningColumns.push(colName);
        };

        $scope.removePartitioningColumn = function(win, index) {
            win.partitioningColumns.splice(index, 1);
        };

        $scope.addOrderColumn = function(win) {
            win.orders = win.orders || [];
            var columns = $scope.getColumnsWithComputed();
            var colName;
            if (columns) {
                var columnNames = columns.map(function(col){return col.name});
                var orderColumns = win.orders.map(function(order){return order.column});
                //TODO smarter autoselect => prefer dates
                for (var i = 0; i < columns.length; ++i) {
                    if (orderColumns.indexOf(columnNames[i]) < 0) {
                        colName = columnNames[i];
                        break;
                    }
                }
                colName = colName || columnNames[0];
            }
            win.orders.push({column: colName});
        };

        $scope.getOrderColumnType = function(win) {
            if (!win.orders || !win.orders.length) {
                return;
            }
            const colName = win.orders[0].column;
            //TODO build index
            const col = $scope.getColumnsWithComputed().find(c => c.name == colName);
            return col && col.type;
        };

        $scope.removeOrderColumn = function(win, index) {
            win.orders.splice(index, 1);
        };

        $scope.onResyncWithInputSchema = function() {
            var inputColumnsWithComputed = $scope.getColumnsWithComputed(true);
            var inputColumnsWithComputedNames = inputColumnsWithComputed.map(function(col){return col.name});

            (($scope.params || {}).windows || []).forEach(function(win) {
                var i = (win.partitioningColumns || []).length;
                while (i--) {
                    if (!win.partitioningColumns[i] || inputColumnsWithComputedNames.indexOf(win.partitioningColumns[i]) == -1) {
                        win.partitioningColumns.splice(i, 1);
                    }
                }
                i = (win.orders || []).length;
                while (i--) {
                    if (!win.orders[i] || !win.orders[i].column || inputColumnsWithComputedNames.indexOf(win.orders[i].column) == -1) {
                        win.orders.splice(i, 1);
                    }
                }
            });
        };

        $scope.isWindowFrameRowsLimitationInvalid = (window) =>  window.limitFollowing && window.limitPreceding && (window.followingRows + window.precedingRows < 0)

        $scope.uiState.currentStep = 'windows';

        $scope.$watch('topNav.tab',function(nv){
            if (nv == 'settings') {
                $timeout(function() {
                    $scope.$broadcast('redrawFatTable');
                });
            }
        });

        $scope.$watch("params.windows", $scope.updateRecipeStatusLater, true);

    });
})();
