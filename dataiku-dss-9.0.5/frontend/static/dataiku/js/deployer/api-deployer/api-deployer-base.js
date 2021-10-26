(function() {
    'use strict';

    const app = angular.module('dataiku.apideployer', ['dataiku.lambda']);

    app.controller('APIDeployerController', function($scope, $rootScope, DeployerUtils, DataikuAPI) {
        $scope.DeployerUtils = DeployerUtils;
        $scope.deployerType = 'api';
        $scope.publishedItemType = 'service';
        $scope.deployerAPIBase = DataikuAPI.apideployer;
        $scope.stages = [].concat($rootScope.appConfig.apiDeploymentStages);
        $scope.defaultTitle = "API Deployer";
        $scope.deployerObjectBar = {
            title: $scope.defaultTitle
        };
        $scope.isFeatureLocked = !($rootScope.appConfig.licensedFeatures.apiNodeAllowed || $rootScope.appConfig.licensing.ceEntrepriseTrial);
    });
}());
