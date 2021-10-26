(function() {
'use strict';

const app = angular.module('dataiku.apideployer');


app.controller('APIDeployerServicesListController', function($scope, $controller, $state, TopNav, DataikuAPI,
    CreateModalFromTemplate, WT1, DeployerUtils) {
    $controller('_DeployerBaseController', {$scope});
    TopNav.setNoItem();
    TopNav.setLocation(TopNav.TOP_API_DEPLOYER, 'services');

    if ($scope.isFeatureLocked) return;

    $scope.uiState = {};
        
    $scope.canCreateServices = function() {
        return $scope.appConfig.globalPermissions && $scope.appConfig.globalPermissions.mayCreatePublishedAPIServices;
    };

    $scope.startCreateService = function() {
        CreateModalFromTemplate("/templates/api-deployer/new-published-service-modal.html", $scope).then(function(newService) {
            $state.go('apideployer.services.service.status', {serviceId: newService.id});
            WT1.event('api-deployer-service-create');
        });
    };

    function getLastUpdatedTime(serviceStatus) {
        const publishedOn = (serviceStatus.packages[0] || {}).publishedOn || 0;
        const settingsLastModified = (serviceStatus.serviceBasicInfo.versionTag||{}).lastModifiedOn||0;
        return Math.max(publishedOn, settingsLastModified);
    }

    DataikuAPI.apideployer.publishedAPIServices.listLightStatus()
        .success(function(serviceStatusList) {
            $scope.serviceStatusList = serviceStatusList;
            serviceStatusList.forEach(function(serviceStatus) {
                serviceStatus.enabledDeploymentCount = DeployerUtils.enabledDeploymentCount(serviceStatus.deployments, true);
                serviceStatus.lastUpdated = getLastUpdatedTime(serviceStatus);
            })
        })
        .error(setErrorInScope.bind($scope));
});


app.controller('APIDeployerServiceCreationModalController', function($scope, DataikuAPI) {
    $scope.newService = $scope.newService || {};
    $scope.$watch("newService.name", function(nv, ov) {
        if (!nv) return;
        $scope.newService.id = nv.replace(/\W+/g, "");
    });
    $scope.ok = function() {
        DataikuAPI.apideployer.publishedAPIServices.create($scope.newService.id, $scope.newService.name)
            .success($scope.resolveModal)
            .error(setErrorInScope.bind($scope));
    };
});


app.controller('APIDeployerServiceController', function($scope, $controller, $state, DataikuAPI, Dialogs, CreateModalFromTemplate) {
    $controller('_DeployerBaseController', {$scope});

    $scope.refreshServiceStatus = function() {
        return DataikuAPI.apideployer.publishedAPIServices.getLightStatus($state.params.serviceId)
            .success(serviceStatus => {
                $scope.serviceStatus = serviceStatus;
            })
            .error(setErrorInScope.bind($scope));
    };
    $scope.refreshServiceStatus();

    $scope.ui = {};
    let savedService; //for dirtyness detection
    $scope.refreshServiceSettings = function() {
        return DataikuAPI.apideployer.publishedAPIServices.getSettings($state.params.serviceId)
            .success(service => {
                $scope.service = service;
                $scope.ui.ownerLogin = service.owner;
                savedService = angular.copy(service);
            })
            .error(setErrorInScope.bind($scope));
    };

    $scope.serviceIsDirty = function() {
        return !angular.equals(savedService, $scope.service);
    };

    $scope.saveService = function() {
        if (!$scope.service || !$scope.serviceIsDirty()) return;
        DataikuAPI.apideployer.publishedAPIServices.save($scope.service)
            .success(function() {
                $scope.refreshServiceSettings();
                $scope.refreshServiceStatus();
            })
            .error(setErrorInScope.bind($scope));
    };

    $scope.deleteService = function() {
        if (!$scope.serviceStatus) {
            return;
        }
        if ($scope.serviceStatus.deployments.length) {
            Dialogs.error($scope, 'Delete service', 'You cannot delete this service because it has deployments!');
            return;
        }
        Dialogs.confirm($scope, 'Delete service','Are you sure you want to delete this service?').then(function() {
            DataikuAPI.apideployer.publishedAPIServices.delete($scope.serviceStatus.serviceBasicInfo.id)
                .success(() => { $state.go('apideployer.services.list'); })
                .error(setErrorInScope.bind($scope));
        });
    };

    $scope.startUploadPackages = function() {
        CreateModalFromTemplate("/templates/api-deployer/published-service-upload-packages-modal.html", $scope);
    };
});


app.controller('APIDeployerServiceUploadPackagesController', function($scope, $controller, DataikuAPI, WT1) {
    $controller("_DeployerUploadPackageController", {$scope:$scope});
    $scope.publishPackage = (fileToUpload, callback) => {
        return DataikuAPI.apideployer.publishedAPIServices.publishVersion($scope.serviceStatus.serviceBasicInfo.id,
            fileToUpload, callback
        );
    };
    $scope.afterUploadCallback = function() {
        $scope.refreshServiceSettings();
        $scope.refreshServiceStatus();
        if ($scope.uiState.fileProperties.filter(f => !f.uploaded).length == 0) {
            $scope.dismiss();
            WT1.event('api-deployer-upload-package');
        }
    };
});


app.controller('APIDeployerServiceStatusController', function($scope, $stateParams, TopNav, Dialogs, DataikuAPI, WT1, APIDeployerServicesService, APIDeployerAsyncHeavyStatusLoader, DeployerDeploymentTileService, DeployerUtils) {
    TopNav.setNoItem();
    TopNav.setLocation(TopNav.TOP_API_DEPLOYER, 'services', null, 'status');

    $scope.heavyStatusByDeploymentId = {};

    $scope.deployVersion = function(versionId) {
        APIDeployerServicesService.deployVersion($scope.serviceStatus, versionId, DeployerUtils.DEPLOY_SOURCE.PACKAGE);
    };

    $scope.deleteVersion = function(serviceId, versionId) {
        Dialogs.confirm($scope, 'Delete version ' + versionId, 'Are you sure you want to delete this version?').then(function() {
            DataikuAPI.apideployer.publishedAPIServices.deletePackage(serviceId, versionId)
            .success($scope.refreshServiceStatus)
            .error(setErrorInScope.bind($scope));
            WT1.event('api-deployer-packages-delete');
        });
    };

    DataikuAPI.apideployer.infras.listLightStatus()
    .success(function(infraStatusList) {
        $scope.infraStatusList = infraStatusList;
    }).error(setErrorInScope.bind($scope));

    let showOthersStage = false;

    // Only show an empty "others" stage if other versions contain a filled "others" stage
    $scope.showEmptyOthersStage = function(stage, pkg) {
        return stage === '__OTHERS__' && showOthersStage && !$scope.deploymentsPerVersionAndStage[pkg.id].others;
    };

    $scope.$watch("serviceStatus", function() {
        if (!$scope.serviceStatus) return;

        if ($stateParams.versions) {
            $scope.serviceStatus.packages.forEach(function(p) {
                if ($stateParams.versions.includes(p.id)) {
                    p.$expanded = true;
                }
            });
        }

        const MAX_STAGE_COUNT = 3;
        $scope.currentStages = DeployerUtils.getStagesToDisplay([$scope.serviceStatus], $scope.stages, MAX_STAGE_COUNT);
        $scope.deploymentsPerVersionAndStage = DeployerUtils.getDeploymentsPerPackageAndStage($scope.serviceStatus, $scope.stages, $scope.currentStages, 'version');
        showOthersStage = $scope.serviceStatus.packages.some(pkg => $scope.deploymentsPerVersionAndStage[pkg.id].others);

        const heavyStatusByDeploymentId = {};
        let loader = APIDeployerAsyncHeavyStatusLoader.newLoader($scope.serviceStatus.deployments.filter(_ => _.enabled).map(_ => _.id), heavyStatusByDeploymentId);
        loader.loadAllHeavyStatus();

        const deregister = $scope.$watch(function(){
            return loader.stillRefreshing();
        }, function(nv, ov) {
            if (nv || ov === nv) return;
            $scope.heavyStatusByDeploymentId = heavyStatusByDeploymentId;
            $scope.healthMap = DeployerDeploymentTileService.getDeploymentHealthMap($scope.serviceStatus.deployments, heavyStatusByDeploymentId);
            deregister();
        });

        $scope.$on('$destroy', function() {
            loader && loader.stopLoading();
        });
    });
});


app.controller('APIDeployerServiceHistoryController', function($scope, TopNav) {
    TopNav.setNoItem();
    TopNav.setLocation(TopNav.TOP_API_DEPLOYER, 'services', null, 'history');

    $scope.refreshServiceSettings();
});


app.controller('APIDeployerServiceSettingsController', function($controller, $scope, TopNav) {
    TopNav.setNoItem();
    TopNav.setLocation(TopNav.TOP_API_DEPLOYER, 'services', null, 'settings');
    $scope.uiState = {
        active: 'general'
    };

    $controller('_APIDeployerServicePermissionsController', {$scope});

    $scope.refreshServiceSettings();
    checkChangesBeforeLeaving($scope, $scope.serviceIsDirty);
});


app.controller('_APIDeployerServicePermissionsController', function($scope, $controller, PermissionsService) {
    $controller('_DeployerPermissionsController', {$scope: $scope});

    // don't initialize until obj is available
    const deregister = $scope.$watch("service", function(nv, ov) {
        if (!nv) return;
        $scope.initPermissions($scope.service, {
            read: true,
            write: false,
            deploy: false,
            admin: false
        }, true);
        deregister();
    }, false);

    $scope.$watch("ui.ownerLogin", function() {
        PermissionsService.transferOwnership($scope, $scope.service, "service");
    });

    $scope.$watch("service.permissions", function(nv, ov) {
        if (!nv) return;
        $scope.onPermissionChange($scope.service);
    }, true);

    $scope.$watch("service.permissions", function(nv, ov) {
        if (!nv) return;
        $scope.onPermissionChange($scope.service);
    }, false);
});


app.service('APIDeployerServicesService', function($state, DataikuAPI, Assert, WT1, DeployerPublishedItemsService, APIDeployerDeploymentService) {
    this.deployVersion = function(serviceStatus, versionId, source) {
        Assert.trueish(serviceStatus, 'serviceStatus not provided');
        Assert.trueish(serviceStatus.deployments, 'no deployments in serviceStatus');

        DeployerPublishedItemsService.deployPackage(serviceStatus, 'version').then(deploymentMethodId => {
            if (deploymentMethodId == DeployerPublishedItemsService.DEPLOYMENT_METHOD_ID.NEW) {
                deployVersionInNewDeployment(serviceStatus, versionId, source);
            } else {
                deployVersionInExistingDeployment(serviceStatus, versionId, source);
            }
        })
    };

    function deployVersionInNewDeployment(serviceStatus, versionId, source) {
        return APIDeployerDeploymentService.startCreateDeployment(serviceStatus.serviceBasicInfo.id, versionId).then(function(newDeployment) {
            $state.go('apideployer.deployments.deployment.status', {deploymentId: newDeployment.id});
            WT1.event('api-deployer-deploy-version-in-new-deployment', {deploymentType: newDeployment.type, source });
        });
    }

    function deployVersionInExistingDeployment(serviceStatus, versionId, source) {
        DeployerPublishedItemsService.openDeploymentSelector(serviceStatus, true).then(function(depl) {
            DataikuAPI.apideployer.deployments.switchVersion(depl.id, versionId)
                .success(function() {
                    WT1.event('api-deployer-deploy-version-in-existing-deployment', { deploymentType: depl.type, source });
                    $state.go('apideployer.deployments.deployment.settings', {deploymentId: depl.id});
                })
                .error(function() {
                    deferred.reject.call(this, arguments);
                });
        });
    }
});


})();
