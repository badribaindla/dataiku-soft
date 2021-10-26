(function() {
'use strict';

var app = angular.module('dataiku.dashboards.insights');


app.constant("StaticFileInsightHandler", {
    name: "Static insight",
    desc: "Insight generated from code",
    icon: 'icon-file-alt',
    color: '',

    getSourceId: function(insight) {
        return insight.params.objectSmartId;
    },
    getSourceType: function(insight) {
        return insight.params.objectType;
    },
    hasEditTab: false,
    defaultTileParams: {
        numDisplayedComments: 5
    },
    defaultTileDimensions: [5, 3]
});


app.controller('StaticFileInsightViewCommon', function($scope, $controller, DataikuAPI, $stateParams, $timeout) {
    $scope.insightContentURL = '/dip/api/dashboards/insights/view-static-file?'
        + 'projectKey=' + $scope.insight.projectKey
        + '&insightId=' + $scope.insight.id
        + '&cacheBusting=' + new Date().getTime()

    $scope.loadHTML = function(element, resolve, reject) {
        if (typeof(resolve)==="function") resolve();
    };

    $scope.download = function() {
        downloadURL($scope.insightContentURL+"&download=true");
    };
});


app.directive('staticFileInsightTile', function($controller, InsightLoadingState) {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/tile.html',
        scope: {
            insight: '=',
            tile: '=',
            hook: '='
        },
        link: function($scope, element, attrs) {
            $controller('StaticFileInsightViewCommon', {$scope: $scope});

            $scope.loading = false;
            $scope.loaded = false;
            $scope.error = null;
            $scope.load = function(resolve, reject) {
                $scope.loading = true;
                $scope.loadHTML(element,
                    function() {
                         $scope.loading = false;
                         $scope.loaded = true;
                         $scope.error = null;
                         if ($scope.hook && $scope.hook.isErrorMap) {
                            $scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                         }
                         if (typeof(resolve)==="function") resolve();
                    }, function(data, status, headers, config, statusText) {
                        $scope.loading = false;
                        $scope.loaded = false;
                        $scope.error = data;
                        if ($scope.hook && $scope.hook.isErrorMap) {
                            $scope.hook.isErrorMap[$scope.tile.$tileId] = true;
                        }
                        $scope.hook.setErrorInDashboardPageScope(data, status, headers, config, statusText);
                        if (typeof(reject)==="function") reject();
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


app.directive('staticFileInsightTileParams', function() {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/tile_params.html',
        scope: {
            tileParams: '='
        },
        link: function($scope, element, attrs) {
            // No params
        }
    };
});



app.directive('staticFileInsightCreateForm', function() {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/create_form.html',
        scope: true,
        link: function($scope, element, attrs) {
            // Can't create static file insight from new insight modal
        }
    };
});


app.directive('staticFileInsightView', function($controller) {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/view.html',
        scope: true,
        link: function($scope, element, attrs) {
            $controller('StaticFileInsightViewCommon', {$scope: $scope});
            $scope.loadHTML(element);
        }
    };
});


app.directive('staticFileInsightEdit', function($controller, DataikuAPI) {
    return {
        templateUrl: '/templates/dashboards/insights/static_file/edit.html',
        scope: {
            insight: '='
        },
        link: function($scope, element, attrs) {
            $controller('ChartInsightViewCommon', {$scope: $scope});

            $scope.currentInsight = $scope.insight;

            $scope.bigChart = false;

            $scope.saveChart = function() {
                DataikuAPI.dashboards.insights.save($scope.insight)
                    .error(setErrorInScope.bind($scope))
            };

            $scope.$on('chartSamplingChanged', function() {
                $scope.summary = null;
                $scope.fetchColumnsSummary();
                $scope.saveChart();
            });

            $scope.fetchColumnsSummary();
        }
    };
});

})();
