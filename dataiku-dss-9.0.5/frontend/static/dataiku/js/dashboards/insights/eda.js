(function () {
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("EdaInsightHandler", {
        name: "Eda",
        nameForTileParams: "Eda",
        desc: "Eda",
        icon: 'icon-dku-statistics',
        color: '',

        getSourceId: function (insight) {
            return insight.params.dataSpec.inputDatasetSmartName;
        },
        getSourceType: function (insight) {
            return 'DATASET';
        },
        hasOptions: false,
        hasEditTab: true,
        defaultTileSize: [],
        defaultTileDimensions: [10, 5]
    });

    app.controller('EdaInsightViewCommon', function ($scope, $controller, DataikuAPI, $stateParams, $timeout) {
        $scope.insightContentURL = '/dip/api/dashboards/insights/view-eda?'
            + 'projectKey=' + $scope.insight.projectKey
            + '&insightId=' + $scope.insight.id
            + '&cacheBusting=' + new Date().getTime()

        $scope.loadHTML = function (element, resolve, reject) {
            if (typeof (resolve) === "function") resolve();
        };
    });

    app.directive('edaInsightTile', function ($controller, InsightLoadingState) {
        return {
            templateUrl: '/templates/dashboards/insights/eda/eda_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function ($scope, element, attrs) {
                $controller('EdaInsightViewCommon', { $scope: $scope });

                $scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function (resolve, reject) {
                    $scope.loading = true;
                    $scope.loadHTML(element,
                        function () {
                            $scope.loading = false;
                            $scope.loaded = true;
                            $scope.error = null;
                            if ($scope.hook && $scope.hook.isErrorMap) {
                                $scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                            }
                            if (typeof (resolve) === "function") resolve();
                        }, function (data, status, headers, config, statusText) {
                            $scope.loading = false;
                            $scope.loaded = false;
                            $scope.error = data;
                            if ($scope.hook && $scope.hook.isErrorMap) {
                                $scope.hook.isErrorMap[$scope.tile.$tileId] = true;
                            }
                            $scope.hook.setErrorInDashboardPageScope(data, status, headers, config, statusText);
                            if (typeof (reject) === "function") reject();
                        }
                    );
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('edaInsightView', function ($controller) {
        return {
            templateUrl: '/templates/dashboards/insights/eda/eda_view.html',
            scope: true,
            link: function ($scope, element, attrs) {
                $controller('EdaInsightViewCommon', { $scope: $scope });
                $scope.loadHTML(element);
            }
        };
    });

    app.directive('edaInsightEdit', function($controller, $stateParams, DataikuAPI, $timeout, $rootScope) {
        return {
            templateUrl: '/templates/dashboards/insights/eda/eda_edit.html',
            scope: {
                insight: '='
            },
            link: function ($scope, element, attrs) {
                $controller('EdaInsightViewCommon', { $scope: $scope });
                $scope.loadHTML(element);
                $scope.onInsightChange = function( {card, result, dataSpec} ) {
                    var newInsight = _.cloneDeep($scope.insight);
                    newInsight.params.card = card;
                    newInsight.params.dataSpec = dataSpec;
                    DataikuAPI.dashboards.insights.save(newInsight, undefined, JSON.stringify(result))
                        .error(setErrorInScope.bind($scope))
                        .success(function () {
                            $scope.insight = newInsight;
                        });
                }
            }
        }
    });
})();
