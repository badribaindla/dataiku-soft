(function() {
'use strict';

var app = angular.module('dataiku.controllers');


app.controller('RecipesListController', function ($controller, $scope, $state, $stateParams,
       DataikuAPI, TaggableObjectsService, Dialogs, TopNav) {

    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});

    TopNav.setLocation(TopNav.TOP_FLOW, "recipes", TopNav.TABS_NONE, null);
    TopNav.setItem(null);

    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            tags: [],
            interest: {
                starred: '',
            },
        },
        filterParams: {
            userQueryTargets: ["name","tags","type"],
            propertyRules: {tag:"tags"},
        },
        orderQuery: "-lastModifiedOn",
        orderReversed: false,
    }, $scope.selection || {});

    $scope.sortBy = [
        { value: 'name', label: 'Name' },
        { value: 'type', label: 'Type' },
        { value: '-lastModifiedOn', label: 'Last modified' }
    ];

    $scope.sortCookieKey = 'recipes';
    $scope.maxItems = 20;

    $scope.list = function() {
        DataikuAPI.flow.recipes.listHeads($stateParams.projectKey, $scope.tagFilter).success(function(data) {
            $scope.listItems = data.items;
            $scope.restoreOriginalSelection();
        }).error(setErrorInScope.bind($scope));
    };
    $scope.list() ;


    /* Specific actions */

    $scope.goToItem = function(recipe){
        $state.transitionTo('flow-editor.recipe', {recipeName : recipe.name});
    };
});

}());