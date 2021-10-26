(function() {
'use strict';

const app = angular.module('dataiku.dashboards.insights');

app.constant("ArticleInsightHandler", {
    name: "article",
    desc: "Wiki article",
    icon: 'icon-file-text',
    color: 'article',

    getSourceId: function(insight) {
        return insight.params.articleId;
    },
    getSourceType: function(insight) {
        return "ARTICLE";
    },

    hasEditTab: false,
    defaultTileParams: {},
    defaultTileDimensions: [5, 5]
});

app.controller('_articleInsightViewCommon', function($scope, $stateParams, DataikuAPI) {
    $scope.fetchArticle = function(resolve, reject, noSpinner) {
        const p = DataikuAPI.wikis.getArticlePayload($stateParams.projectKey, $scope.insight.params.articleId);
        if (noSpinner) {
            p.noSpinner();
        }
        p.noSpinner()
            .success(function(data) {
                $scope.article = data;
                if (typeof(resolve)==="function") resolve();
            }).error(function(data, status, headers, config, statusText) {
                setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                if (typeof(reject)==="function") reject(data, status, headers, config, statusText);
            });
    };
});

app.directive('articleInsightTile', function($controller, InsightLoadingState) {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_tile.html',
        scope: {
            insight: '=',
            tile: '=',
            hook: '='
        },
        link: function($scope, element, attrs) {
            $controller('_articleInsightViewCommon', {$scope: $scope});

            $scope.loading = false;
            $scope.loaded = false;
            $scope.error = null;
            $scope.load = function(resolve, reject) {
                $scope.loading = true;
                $scope.fetchArticle(
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

app.directive('articleInsightTileParams', function() {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_tile_params.html',
        scope: {
            tileParams: '='
        }
    };
});

app.directive('articleInsightCreateForm', function() {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_create_form.html',
        scope: true,
        link: function($scope, element, attrs) {
            $scope.hook.defaultName = "article";
            $scope.$watch("hook.sourceObject", function(nv) {
                if (!nv || !nv.label) return;
                $scope.hook.defaultName = "article " + nv.label;
            });
        }
    };
});

app.directive('articleInsightView', function($controller) {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_view.html',
        scope: true,
        link: function($scope, element, attrs) {
            $controller('_articleInsightViewCommon', {$scope: $scope});
            $scope.fetchArticle();
        }
    };
});

app.directive('articleInsightEdit', function() {
    return {
        templateUrl: '/templates/dashboards/insights/article/article_edit.html',
        scope: {
            insight: '='
        }
    };
});

})();