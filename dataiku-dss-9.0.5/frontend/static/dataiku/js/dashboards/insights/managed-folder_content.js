(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("ManagedFolderContentInsightHandler", {
        name: "Managed folder",
        desc: "Display content of a folder",
        icon: 'icon-folder-close-alt',
        color: 'managed-folder',

        getSourceId: function(insight) {
            return insight.params.folderSmartId;
        },
        sourceType: 'MANAGED_FOLDER',
        hasEditTab: false,
        defaultTileParams: {

        },
        getDefaultTileDimensions: function(insight) {
            if (insight && insight.params && insight.params.filePath && !insight.params.isDirectory) return [4, 5];
            else return [8, 5];
        }
    });

    app.controller('ManagedFolderContentViewCommon', function($scope, DataikuAPI, $stateParams, DashboardUtils, ActiveProjectKey) {
        $scope.resolvedFolder = resolveDatasetFullName($scope.insight.params.folderSmartId,
                                                        $stateParams.projectKey || $scope.insight.projectKey);
        $scope.previewedItem = null;
        $scope.getPreview = function(resolve, reject, noSpinner) {
            var p = DataikuAPI.managedfolder.getForInsight(ActiveProjectKey.get(), $scope.resolvedFolder.projectKey, $scope.resolvedFolder.datasetName)
                .success(function(data) {
                    $scope.folder = data;
                    $scope.odb = data;

                    if ($scope.insight.params.filePath != null && !$scope.insight.params.isDirectory) {
                        var p = DataikuAPI.managedfolder.previewItem($scope.insight.projectKey, $scope.odb.projectKey, $scope.insight.params.folderSmartId, $scope.insight.params.filePath)
                            .success(function(data){ $scope.previewedItem = data; })
                            .success(DashboardUtils.setLoaded.bind([$scope, resolve]))
                            .error(DashboardUtils.setError.bind([$scope, reject]))
                            .error(setErrorInScope.bind($scope));

                        if (noSpinner) p.noSpinner();
                    } else {
                        DashboardUtils.setLoaded.bind([$scope, resolve])();
                    }
                })
                .error(setErrorInScope.bind($scope))
                .error(DashboardUtils.setError.bind([$scope, reject]));

            if (noSpinner) p.noSpinner();
        };
        
        $scope.skinState = {itemSkins:[]}; // to placate the js in the directives, not to offer webapp views in tiles (make a webapp tile for that)
        
    });

    app.directive('managedFolderContentInsightTile', function($controller, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/managed-folder_content/managed-folder_content_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $controller('ManagedFolderContentViewCommon', {$scope: $scope});

                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                    $scope.loading = true;
                    $scope.getPreview(resolve, reject, true);
                };
                $scope.$on('load-tile', $scope.load);


                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
            }
        };
    });

    app.directive('managedFolderContentInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/managed-folder_content/managed-folder_content_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('managedFolderContentInsightCreateForm', function(DataikuAPI, ChartChangeHandler){
        return {
            templateUrl: '/templates/dashboards/insights/managed-folder_content/managed-folder_content_create_form.html',
            scope: true,
            link: function($scope, element, attrs){

                function refreshFiles() {
                    $scope.files = [];
                    if ($scope.insight.params.singleFile && $scope.insight.params.folderSmartId) {
                        DataikuAPI.managedfolder.listFS($scope.insight.projectKey, $scope.insight.params.folderSmartId)
                        .success(function(data){
                            $scope.files = data.items;
                        })
                        .error($scope.hook.setErrorInModaleScope);
                    }
                }

                $scope.$watch("insight.params.singleFile", refreshFiles);
                $scope.$watch("insight.params.folderSmartId", refreshFiles);

                function updateDefaultName() {
                    if (!$scope.hook.sourceObject || !$scope.hook.sourceObject.label) {
                        $scope.hook.defaultName = "Content of folder";
                    } else if ($scope.insight.params.filePath) {
                        $scope.hook.defaultName = "File " + $scope.insight.params.filePath + " of " + $scope.hook.sourceObject.label;
                    } else {
                        $scope.hook.defaultName = "Content of " + $scope.hook.sourceObject.label;
                    }
                }

                $scope.$watch("hook.sourceObject", updateDefaultName);
                $scope.$watch("insight.params.filePath", updateDefaultName);
            }
        };
    });



    app.directive('managedFolderContentInsightView', function($controller, $timeout){
        return {
            templateUrl: '/templates/dashboards/insights/managed-folder_content/managed-folder_content_view.html',
            scope: {
                insight: '='
            },
            link: function($scope, element, attrs){
                $controller('ManagedFolderContentViewCommon', {$scope: $scope});
                $scope.getPreview();
            }
        };
    });

})();
