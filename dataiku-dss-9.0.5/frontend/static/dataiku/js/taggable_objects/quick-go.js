(function(){
    'use strict';

    var app = angular.module('dataiku.services');

    app.directive('globalSearch', function($state, $stateParams, $filter, DataikuAPI, WT1, Debounce, HistoryService) {
        return {
            restrict : 'A',
            scope : true,
            link : function(scope, element, attrs) {
                var formerPattern;
                function search() {
                    if(formerPattern != scope.quickgo.searchPattern){
                        formerPattern = scope.quickgo.searchPattern;
                        scope.quickgo.searchResults = null;
                        if (!scope.quickgo.searchPattern.length) return;
                        var recentItems = HistoryService.getRecentlyViewedItems(20);
                        var recentKeys = recentItems.map(function(item){
                            return item.key
                        });
                        var serializedRecentKeys = angular.toJson(recentKeys);
                        scope.quickgo.searching = true;
                        DataikuAPI.home.projectSearch($stateParams.projectKey, scope.quickgo.searchPattern, scope.quickgo.requestedType, serializedRecentKeys)
                        .success(function(items) {
                            scope.quickgo.searching = false;
                            var lower = scope.quickgo.searchPattern.toLowerCase();
                            if (items.length > 15) {
                                items.splice(15);
                            }
                            scope.quickgo.searchResults = items;
                            if (scope.quickgo.searchPattern.length) {
                                Debounce()
                                    .withDelay(10000, 15000)
                                    .wrap(function(){WT1.event("global-search")})
                                    .call();
                            }
                        }).error(function(){
                            scope.quickgo.searching = false;
                        });
                    }
                }

                scope.$watch("quickgo.searchPattern", Debounce()
                    //.withDelay(200, 250)
                    .withSpinner(false)
                    .withScope(scope)
                    .wrap(search)
                );
            }
        };
    });


})();