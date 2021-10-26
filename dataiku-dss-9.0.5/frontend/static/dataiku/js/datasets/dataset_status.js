(function() {
'use strict';

var app = angular.module('dataiku.datasets.status', []);

app.controller("DatasetStatusController", function($scope, DataikuAPI, $stateParams, TopNav, Dialogs, $state, $rootScope, $timeout, CreateModalFromTemplate) {
    TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_DATASET, "status");

});

})();