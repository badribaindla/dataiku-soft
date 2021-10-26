(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.directive('iframeTile', function($sce, $timeout, InsightLoadingState, InsightLoadingBehavior){
        return {
            templateUrl: '/templates/dashboards/insights/iframe/iframe_tile.html',
            scope: {
                tileParams: '=',
                editable: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){

                $scope.$watch("tileParams.url", function(nv) {
                    if (!nv) return;
                    /* Copied from angular-sanitize LINKY_REGEX */
                    const URL_REGEX = /((ftp|https?):\/\/|(www\.)|(mailto:)?[A-Za-z0-9._%+-]+@)\S*[^\s.;,(){}<>"\u201d\u2019]/i;
                    if ($scope.tileParams.url.match(URL_REGEX)) {

                        if ($scope.tileParams.url.startsWith(window.location.origin)) {
                            $scope.sandboxedIframe = true;
                        } else {
                            $scope.sandboxedIframe = false;
                        }

                        $scope.trustedUrl = $sce.trustAsResourceUrl($scope.tileParams.url);
                    } else {
                        $scope.trustedUrl = $scope.tileParams.url; // Since it's not trusted it will fail
                    }
                });

                let timeoutInSeconds = Math.min($scope.tileParams.loadTimeoutInSeconds, 240);
                if (timeoutInSeconds > 0) {
                    $scope.load = function (resolve, reject) {
                        $timeout(function () {
                            $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.COMPLETE;
                        }, timeoutInSeconds * 1000);
                        if (typeof(resolve) === 'function') resolve();
                        return InsightLoadingBehavior.DELAYED_COMPLETE;
                    };
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('iframeTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/iframe/iframe_tile_params.html',
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

})();
