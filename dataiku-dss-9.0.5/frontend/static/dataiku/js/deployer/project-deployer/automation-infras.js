(function() {
    'use strict';
    
    const app = angular.module('dataiku.projectdeployer');

    app.controller('ProjectDeployerInfrasListController', function($scope, $controller, DataikuAPI) {
        $controller('_DeployerInfrasListController', {$scope: $scope});
        
        if ($scope.isFeatureLocked) return;
        
        $scope.uiState = $scope.uiState || {};

        $scope.filterInfra = function(infraStatus) {
            if (!$scope.uiState.query) return true;
            const query = $scope.uiState.query.toLowerCase();
            return infraStatus.infraBasicInfo.id.toLowerCase().includes(query)
                || infraStatus.infraBasicInfo.stage.toLowerCase().includes(query)
                || infraStatus.infraBasicInfo.automationNodeUrl.toLowerCase().includes(query);
        }

        $scope.$watch("infraStatusList", function(nv, ov) {
            if (nv) {
                nv.forEach(function(infraStatus) {
                    const infraId = infraStatus.infraBasicInfo.id;
                    DataikuAPI.projectdeployer.infras.checkStatus(infraId)
                        .success(function(healthStatus) {
                            infraStatus.infraHealthError = healthStatus.messages.find(function(msg) {
                                return msg.severity === healthStatus.maxSeverity;
                            }) || {};
                        })
                        .error(setErrorInScope.bind($scope));
                });
            }
        });
    });

    app.controller('ProjectDeployerInfraController', function($scope, $controller) {
        $controller('_DeployerInfraController', {$scope: $scope});
    });

    app.controller('ProjectDeployerInfraSetupModalController', function($scope, $controller) {
        $controller('_DeployerInfraSetupModalController', {$scope: $scope});
    });
    
    app.controller('ProjectDeployerInfraStatusController', function($scope, $controller, DataikuAPI, ProjectDeployerAsyncHeavyStatusLoader, DeployerDeploymentTileService) {
        $controller('_DeployerInfraStatusController', {$scope: $scope});

        $scope.$watch("infraStatus", function(nv) {
            if (nv) {
                DataikuAPI.projectdeployer.infras.checkStatus($scope.infraStatus.infraBasicInfo.id)
                    .success(function(healthStatus) {
                        if (healthStatus.anyMessage) {
                            $scope.infraHealthErrorMessage = healthStatus.messages.find(function(msg) {
                                return msg.severity === healthStatus.maxSeverity;
                            }).message;
                        }
                    })
                    .error(setErrorInScope.bind($scope));

                DataikuAPI.projectdeployer.publishedProjects.listBasicInfo()
                .success(function(projectBasicInfoList) {
                    const projectBasicInfoMap = projectBasicInfoList.projects.reduce((obj, basicInfo) => ({ ...obj, [basicInfo.id]: basicInfo }), {});
                    $scope.pseudoLightStatusList = $scope.infraStatus.deployments.map(function(deployment) {
                        return {
                            deploymentBasicInfo: deployment,
                            projectBasicInfo: projectBasicInfoMap[deployment.publishedProjectKey]
                        };
                    });
                });
                
                const infraStatusList = [{
                    infraBasicInfo: $scope.infraStatus.infraBasicInfo,
                    deployments: $scope.infraStatus.deployments
                }];
                const heavyStatusByDeploymentId = {};
                let loader = ProjectDeployerAsyncHeavyStatusLoader.newLoader(infraStatusList, heavyStatusByDeploymentId);
                loader.loadHeavyStatus();

                const deregister = $scope.$watch(function(){
                    return loader.stillRefreshing();
                }, function(nv, ov) {
                    if (nv || ov === nv) return;
                    $scope.healthMap = DeployerDeploymentTileService.getDeploymentHealthMap($scope.infraStatus.deployments, heavyStatusByDeploymentId);
                    deregister();
                });
                
                $scope.$on('$destroy', function() {
                    loader && loader.stopLoading();
                });
            }
        });
    });

    app.controller('ProjectDeployerInfraHistoryController', function($scope, $controller) {
        $controller('_DeployerInfraHistoryController', {$scope: $scope});
    });

    app.controller('ProjectDeployerInfraSettingsController', function($scope, $controller) {
        $controller('_DeployerInfraSettingsController', {$scope: $scope});
    });
})();