(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');


    app.constant("WebAppInsightHandler", {
        name: "Webapp",
        desc: "Display webapp",
        icon: 'icon-code',
        color: 'notebook',

        getSourceId: function(insight) {
            return insight.params.webAppSmartId;
        },
        sourceType: 'WEB_APP',
        hasEditTab: false,
        defaultTileParams: {

        },
        defaultTileShowTitleMode: 'NO',
        defaultTileDimension: [6, 4]
    });


    app.controller('WebAppViewCommon', function($scope, $stateParams, $controller, $q, DataikuAPI, Logger, WebAppsService) {
        $scope.resolvedWebApp = resolveObjectSmartId($scope.insight.params.webAppSmartId,  $stateParams.projectKey);

        const baseType = WebAppsService.getBaseType($scope.insight.params.webAppType);
        if (baseType == 'STANDARD') {
            $controller("StandardWebAppController", {$scope: $scope});
        } else if (baseType == 'BOKEH') {
            $controller("BokehWebAppController", {$scope: $scope});
        } else if (baseType == 'DASH') {
            $controller("DashWebAppController", {$scope: $scope});
        } else if (baseType == 'SHINY') {
            $controller("ShinyWebAppController", {$scope: $scope});
        } else {
            Logger.error("Unknown app type: ", $scope.insight.params.webAppType)
        }

    });

    app.directive('webAppInsightTile', function($controller, $q, $timeout, DashboardUtils, InsightLoadingState, InsightLoadingBehavior){
        return {
            templateUrl: '/templates/dashboards/insights/web_app/web_app_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '=',
                editable: '='
            },
            link: function($scope, element, attrs){
                $scope.element = element;
                $scope.ngShowLoaded = true;

                $controller('WebAppViewCommon', {$scope: $scope});

                $scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;

                $scope.load = function(resolve, reject) {
                    let app = {
                        projectKey: $scope.insight.projectKey,
                        id: $scope.insight.params.webAppSmartId
                    };
                    $scope.getViewURL(app).then(function(url) {
                        $scope.iFrameUrl = url;
                    });

                    $scope.loaded = true;
                    DashboardUtils.setLoaded.bind([$scope, resolve])();
                    let timeoutInSeconds = Math.min($scope.tile.tileParams.loadTimeoutInSeconds, 240);
                    if (timeoutInSeconds > 0) {
                        $timeout(function () {
                            $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.COMPLETE;
                        }, timeoutInSeconds * 1000);
                        return InsightLoadingBehavior.DELAYED_COMPLETE;
                    }
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        }
    });

    app.directive('webAppInsightView', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/web_app/web_app_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs) {
                $scope.element = element;
                $controller('WebAppViewCommon', {$scope: $scope});
                var app = {
                    projectKey: $scope.insight.projectKey,
                    id: $scope.insight.params.webAppSmartId
                };
                $scope.getViewURL(app).then(function(url) {
                    $scope.iFrameUrl = url;
                });
            }
        };
    });

    app.directive('webAppInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/web_app/web_app_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
                // Used when creating a new tile to correctly initialize the timeout value in editor.
                $scope.$watch("tileParams", function(nv) {
                    if (nv && nv.loadTimeoutInSeconds === undefined) {
                        nv.loadTimeoutInSeconds = 0;
                    }
                });
                if ($scope.tileParams.loadTimeoutInSeconds === undefined) {
                    $scope.tileParams.loadTimeoutInSeconds = 0;
                }
            }
        };
    });


    app.directive('webAppInsightCreateForm', function(DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/web_app/web_app_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $scope.hook.defaultName = "Webapp";
                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !nv.label) return;
                    $scope.hook.defaultName = nv.label;
                    $scope.insight.params.webAppType = nv.subtype;
                });
            }
        };
    });

})();
