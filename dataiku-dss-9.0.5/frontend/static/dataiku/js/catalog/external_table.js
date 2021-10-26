(function () {
'use strict';

    const app = angular.module('dataiku.catalog');


    app.controller('ExternalTableController', function ($scope,$rootScope, $injector, $stateParams, $route, DataikuAPI, $location,
                                                        $compile, $state, $q, CreateModalFromTemplate, $filter, WT1, $timeout, TopNav, DatasetsService,
                                                        $controller, StateUtils, Debounce, CatalogUtils, Navigator, DashboardUtils, ActivityIndicator,TaggingService) {
        $scope.query = {columnFilter: ""};
        $rootScope.activeProjectTagColor = TaggingService.getTagColor;

        function emptyToNull(string) {
            return string && string.length ? string : null;
        }

        $scope.tableKey = {
            connection: emptyToNull($stateParams.connection),
            catalog: emptyToNull($stateParams.catalog),
            schema: emptyToNull($stateParams.schema),
            table: emptyToNull($stateParams.table)
        };
        $scope.tableKeyJson = JSON.stringify($scope.tableKey);

        $scope.$watch('query.columnFilter',
            Debounce().withDelay(10, 200).withScope($scope).wrap(function (nv) {
                if ($scope.summary) {
                    $scope.columnFiltered = $filter('filter')($scope.summary.table.columns, nv);
                }
            }));

        $scope.selectColumn = function (column) {
            if ($scope.selectedColumn) {
                $scope.selectedColumn.selected = false;
            }
            $scope.selectedColumn = column;
            $scope.selectedColumn.selected = true;
        };
        $scope.import = function () {
            CreateModalFromTemplate("/templates/datasets/tables-import-project-selection-modal.html", $scope, "TablesImportProjectSelectionModalController");
        };
        $scope.getImportData = function(){
            return {
                workflowType : "KEYS",
                tableKeys : [$scope.summary.table.key]
            };
        }

        $scope.$on("objectSummaryEdited", function () {
            DataikuAPI.externalTable.save($scope.tableKey, {description: $scope.summary.table.description, tags : $scope.summary.table.tags}).success(function (data) {
                ActivityIndicator.success("Saved!");
                refreshSummary();
            }).error(setErrorInScope.bind($scope));
        });

        $scope.reloadSample = function () {
            DataikuAPI.externalTable.sample($scope.tableKey).success(data => {
                $scope.sample = data;
                $scope.sampleColumnsWidths = Array.from(Array($scope.sample.columns.length).fill(0));
                $scope.sample.rows.forEach((r, rownum) => {
                    r.forEach((e, i) => {
                        let l = Math.max($scope.sample.columns[i].name.length, e && e.length || 0)*8+10;
                        $scope.sampleColumnsWidths[i] = Math.max($scope.sampleColumnsWidths[i], l);
                    });
                    return r;
                });
                $scope.sampleColumnsWidths = $scope.sampleColumnsWidths.map(e => e);
                $scope.schema = {
                    "schema": $scope.sample.querySchema
                };
            }).error(setErrorInScope.bind($scope));
        };

        function refreshSummary() {
            DataikuAPI.externalTable.summary($scope.tableKey).success(function (data) {
                $scope.summary = data;
                $scope.object = $scope.summary.table;
                $scope.dataSchema = $scope.summary.table.columns;
                $scope.columnFiltered = $scope.summary.table.columns;

                $scope.grouppedDSSItems = [];
                if ($scope.summary.dssItems) {
                    $scope.summary.dssItems.projects.forEach(function (project) {
                        project.datasets.forEach(function (dataset) {
                            $scope.grouppedDSSItems.push({dataset: dataset, project: project, recipes: dataset.recipes})
                        })
                    });
                }
            }).error(setErrorInScope.bind($scope));
        }

        TaggingService.fetchGlobalTags();
        TopNav.setLocation(TopNav.DSS_HOME, "catalog");
        refreshSummary();
    });


    app.directive('externalTableSummary', function (_SummaryHelper) {
        return {
            link: function ($scope, element, attrs) {
                _SummaryHelper.addEditBehaviour($scope, element);
            },
            templateUrl: '/templates/catalog/external-table/summary.html'
        };
    });
})();