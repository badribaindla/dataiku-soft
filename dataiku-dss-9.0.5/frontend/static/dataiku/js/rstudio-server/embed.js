(function() {
'use strict';

const app = angular.module('dataiku.rstudioserverembed', []);

// Ugly because I use a config block to keep a reference on sceDelegateProvider. I don't know how to do without that.
let ugly;

app.config(function($sceDelegateProvider) {
    ugly = $sceDelegateProvider;
})

app.controller('RStudioServerEmbedController', function ($scope, $stateParams, $state, $sce, $q, $rootScope, Dialogs, CreateExportModal, ExportUtils, DataikuAPI, TopNav, ActivityIndicator, LoggerProvider, WT1, $filter, CreateModalFromTemplate, $controller, StateUtils, Assert) {
    Assert.trueish($scope.appConfig.rstudioServerEmbedURL);
    Assert.trueish(ugly);

    ugly.resourceUrlWhitelist([
        "self",
        $scope.appConfig.rstudioServerEmbedURL +"**"
    ])

    var Logger = LoggerProvider.getLogger("dku.rstudio-server");

    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'notebooks', TopNav.TABS_JUPYTER_NOTEBOOK, null);
    TopNav.setItem(TopNav.ITEM_JUPYTER_NOTEBOOK, $stateParams.notebookId, {name:$stateParams.notebookId});
    $scope.$stateParams = $stateParams;

    $scope.rstudioServerURL = $sce.getTrustedResourceUrl($scope.appConfig.rstudioServerEmbedURL)

    $scope.snippetsType = "R";
    $scope.snippetsCategories = ["R-std-dkuapi", "R-std-3rd", "user-R-std", "R-notebook", "sparkr-dkuapi", "sparkr-3rd"];
    $scope.snippetsSaveCategory = "user-R-std";
    TopNav.setItem(TopNav.ITEM_JUPYTER_NOTEBOOK, $stateParams.notebookId, {name:$stateParams.notebookId, type: "R"});

    $scope.uiState = { codeSamplesSelectorVisible: false} ;
});

})();