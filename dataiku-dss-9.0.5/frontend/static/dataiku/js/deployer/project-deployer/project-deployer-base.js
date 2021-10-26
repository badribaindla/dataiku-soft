(function() {
    'use strict';

    const app = angular.module('dataiku.projectdeployer', []);

    app.controller('ProjectDeployerController', function($scope, $rootScope, DeployerUtils, DataikuAPI) {
        $scope.DeployerUtils = DeployerUtils;
        $scope.deployerType = 'project';
        $scope.publishedItemType = 'project';
        $scope.deployerAPIBase = DataikuAPI.projectdeployer;
        $scope.stages = [].concat($rootScope.appConfig.projectDeploymentStages);
        $scope.isFeatureLocked = !($rootScope.appConfig.licensedFeatures.bundlesAllowed || $rootScope.appConfig.licensing.ceEntrepriseTrial);
    });
}());
