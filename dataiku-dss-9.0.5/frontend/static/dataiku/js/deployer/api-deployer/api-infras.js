(function() {
'use strict';

const app = angular.module('dataiku.apideployer');


app.constant('INFRA_TYPES', {
    STATIC: "static",
    K8S: "Kubernetes"
});


app.controller('APIDeployerInfrasListController', function($scope, $controller, DeployerUtils) {
    $controller('_DeployerInfrasListController', {$scope: $scope});

    if ($scope.isFeatureLocked) return;

    $scope.$watch("infraStatusList", function(nv) {
        if (!nv) return;
        nv.forEach(function(infraStatus) {
            infraStatus.enabledDeploymentCount = DeployerUtils.enabledDeploymentCount(infraStatus.deployments, true);
        });
    });
});


app.controller('APIDeployerInfraController', function($controller, $scope) {
    $controller('_DeployerInfraController', {$scope: $scope});
});


app.controller('APIDeployerInfraSetupModalController', function($scope, $controller) {
    $controller('_DeployerInfraSetupModalController', {$scope: $scope});
    $scope.newInfra.type = 'STATIC';
});


app.controller('APIDeployerInfraStatusController', function($scope, $controller, APIDeployerAsyncHeavyStatusLoader, DeployerDeploymentTileService) {
    $controller("_DeployerInfraStatusController", {$scope: $scope});

    $scope.$watch("infraStatus", function(nv) {
        if (nv) {
            const heavyStatusByDeploymentId = {};
            let loader = APIDeployerAsyncHeavyStatusLoader.newLoader($scope.infraStatus.deployments.filter(_ => _.enabled).map(_ => _.id), heavyStatusByDeploymentId);

            loader.loadAllHeavyStatus();

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

app.controller('APIDeployerInfraHistoryController', function($scope, $controller) {
    $controller('_DeployerInfraHistoryController', {$scope: $scope});
});


app.controller('APIDeployerInfraSettingsController', function($scope, $controller, $rootScope, DataikuAPI, ClipboardUtils) {
    $controller('_DeployerInfraSettingsController', {$scope: $scope});
    
    $scope.getUrlSuffixWarning = function(value) {
        if ($scope.hasUrlSuffix(value)) {
            return "URL should be http[s]://host[:port], an URL suffix is unexpected and will likely not work";
        }
        return null;
    }

    let inlineContainerConfig = {
        name: "inline",
        type: "KUBERNETES",
        baseImageType: "EXEC",
        properties: [],
    };

    $scope.getInlineContainerConfig = function() {
        if ($scope.infra) {
            inlineContainerConfig.kubernetesNamespace = $scope.infra.k8sNamespace;
            inlineContainerConfig.kubeCtlContext = $scope.infra.k8sContext;
            inlineContainerConfig.kubeConfigPath = $scope.infra.k8sConfigPath;
            inlineContainerConfig.properties = $scope.infra.k8sProperties;
            inlineContainerConfig.baseImage = $scope.infra.baseImageTag;
            inlineContainerConfig.repositoryURL = $scope.infra.registryHost;
            inlineContainerConfig.prePushMode = $scope.infra.prePushMode;
            inlineContainerConfig.prePushScript = $scope.infra.prePushScript;
        }
        return inlineContainerConfig; // return the same object to avoid never-ending $digest() issues
    };

    if ($rootScope.appConfig.admin) {
        DataikuAPI.admin.connections.list().success(function(allConnections) {
            $scope.allConnections = allConnections;
        }).error(setErrorInScope.bind($scope));
    }
    
    /******** cluster *******/
    DataikuAPI.admin.clusters.listAccessible('KUBERNETES').success(function(data){
        $scope.k8sClusterIds = data.map(function(c) {return c.id;});
    }).error(setErrorInScope.bind($scope));
    

    /******** actions *******/
    $scope.onLocalConnectionChanged = function() {
        if ($scope.uiState.selectedLocalConnectionName) {
            ClipboardUtils.copyToClipboard(JSON.stringify($scope.allConnections[$scope.uiState.selectedLocalConnectionName], null, 2));
        }
    };

    $scope.deleteRemappedConnection = function(pckConId) {
        if ($scope.infra && $scope.infra.remappedConnections) {
            delete $scope.infra.remappedConnections[pckConId];
        }
    };

    $scope.hasRemappedConnections = function() {
        return $scope.infra && Object.keys($scope.infra.remappedConnections).length;
    };
});


app.filter('infraTypeToName', function(INFRA_TYPES) {
    return function(type) {
        if (!type) {
            return;
        }
        return INFRA_TYPES[type] || type;
    };
});


app.filter('infraTypeToIcon', function() {
    return function(type) {
        if (!type) {
            return;
        }
        return 'icon-hdd';
    };
});

})();