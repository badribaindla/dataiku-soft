(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("RunnableButtonInsightHandler", {
        name: "Macro",
        desc: "Run a DSS macro",
        icon: "icon-table",
        color: "project",

        getSourceType: function() {
            return null;
        },
        getSourceId: function() {
            return null;
        },

        hasEditTab: true,
        goToEditAfterCreation: true,
        defaultTileParams: {
            showName: true
        },
        defaultTileDimensions: [2,2]

    });


    app.controller('RunnableButtonViewCommon', function($scope, Assert, DataikuAPI, $stateParams, DashboardUtils, $rootScope, PluginConfigUtils) {
        $scope.runnable = null;
        $rootScope.appConfig.customRunnables.forEach(function(x) {
           if (x.runnableType == $scope.insight.params.runnableType) {
               $scope.runnable = x;
           }
        });

        Assert.inScope($scope, 'runnable');

        $scope.insight.params.config = $scope.insight.params.config || {};
        $scope.desc = $scope.runnable.desc;

        PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.insight.params.config);

        $scope.pluginDesc = $rootScope.appConfig.loadedPlugins.filter(function(x){
            return x.id == $scope.runnable.ownerPluginId;
        })[0];

        $scope.hasSettings = $scope.pluginDesc.hasSettings || ($scope.desc.params && $scope.desc.params.length > 0);
        $scope.runOutput = {};

        $scope.resetSettings = function() {
            $scope.insight.params.config = {};
            PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.insight.params.config);
        };
    });


    app.directive('runnableButtonInsightTile', function($controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $controller('RunnableButtonViewCommon', {$scope: $scope});

                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                    $scope.loading = true;
                    DashboardUtils.setLoaded.bind([$scope, resolve])();
                };
                $scope.$on('load-tile', $scope.load);


                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('runnableButtonInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('runnableButtonInsightCreateForm', function(DataikuAPI, $stateParams){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_create_form.html',
            scope: true,
            link: function($scope, element, attrs){

                var refreshList = function() {
                    DataikuAPI.runnables.listAccessible($stateParams.projectKey).success(function(data) {
                        $scope.runnables = data.runnables;
                        $scope.runnablesExist = data.runnablesExist;
                    }).error(setErrorInScope.bind($scope));
                };
                refreshList();

                $scope.hook.sourceObject = null;
                $scope.hook.defaultName = "Execute macro";


                function updateName() {
                }

                $scope.onRunnableSelected = function(runnable) {
                    $scope.insight.params.runnableType = runnable.runnableType;
                    $scope.hook.defaultName = "Execute " + (((runnable.desc || {}).meta || {}).label || "macro").toLowerCase();
                }
            }
        };
    });

    app.directive('runnableButtonInsightEdit', function($controller, DataikuAPI, SmartId, WT1, $stateParams, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_edit.html',
            scope: true,
            link: function($scope, element, attrs) {
                $controller('RunnableButtonViewCommon', {$scope: $scope});

                DataikuAPI.security.listUsers().success(function(data) {
                    $scope.allUsers = data;
                }).error(setErrorInScope.bind($scope));

            }
        };
    });

    app.directive('runnableButtonInsightView', function($controller, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/runnable-button/runnable-button_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('RunnableButtonViewCommon', {$scope: $scope});
            }
        };
    });

})();
