(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.directive('imageTileParams', function(TileUtils){
        return {
            templateUrl: '/templates/dashboards/insights/image/image_tile_params.html',
            scope: {
                tile: '='
            },
            link: function($scope, element, attrs){
                $scope.openUploadPictureDialog = TileUtils.openUploadPictureDialog;
            }
        };
    });

})();
