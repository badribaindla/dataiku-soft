(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.directive('textTile', function(){
        return {
            templateUrl: '/templates/dashboards/insights/text/text_tile.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });

    app.directive('textTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/text/text_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });

})();
