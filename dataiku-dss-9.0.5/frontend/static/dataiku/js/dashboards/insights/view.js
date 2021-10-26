(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.controller("InsightViewController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs,$state,$q, TopNav) {
        TopNav.setLocation(TopNav.TOP_DASHBOARD, 'insights', null, 'view');
        if ($scope.insight) {
            TopNav.setPageTitle($scope.insight.name + " - Insight");
        }

        $scope.uiState = $scope.uiState || {};
        $scope.uiState.fullScreen = $stateParams.fullScreen && $stateParams.fullScreen != "false";

        $scope.$watch("uiState.fullScreen", function(nv) {
            if (nv == null) return;
            $state.go($state.current, {fullScreen: (nv && nv != "false") ? true : null}, {location: true, inherit:true, notify:false, reload:false});
        });
    });

    app.directive("insightPreview", function(TileUtils) {
        return {
            template: '<dashboard-tile editable="false" insight="insight" tile="tile" hook="hook" />',
            scope: {
                insight: '=',
                autoload: '=?'
            },
            link: function($scope, $el) {
                $scope.$watch("insight", function(nv) {
                    if (!nv) return;
                    $scope.tile = TileUtils.newInsightTile($scope.insight);
                    $scope.tile.$tileId = 'this';
                });

                $scope.hook = {
                    loadPromises: {},
                    loadStates: {}
                };

                function load() {
                    $scope.$watch("hook.loadPromises['this']", function(nv) {
                        if (!nv) return;
                        nv();
                    });
                }

                if ($scope.autoload) load();
                $el.on("loadInsightPreview", load);
            }
        };
    });

    app.directive("insightPreviewLoading", function() {
        return {
            scope: false,
            link: function($scope, $element) {
                $scope.loadInsightPreview = function() {
                    $element.find(".insight-details [insight-preview]").trigger("loadInsightPreview");
                };
            }
        }
    });
})();
