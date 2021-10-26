(function() {
    'use strict';
    
    const app = angular.module('dataiku.deployer');
    
    app.controller('_DeployerInfrasListController', function($scope, $controller, $state, TopNav, CreateModalFromTemplate, WT1, $rootScope) {
        $controller('_DeployerBaseController', {$scope});
        
        const navLocation = `TOP_${$scope.deployerType.toUpperCase()}_DEPLOYER`;
        TopNav.setNoItem();
        TopNav.setLocation(TopNav[navLocation], 'infras');
    
        if ($scope.isFeatureLocked) return;

        $scope.uiState = {};
    
        $scope.canCreateInfras = function() {
            return $rootScope.appConfig.admin;
        };
    
        $scope.startCreateInfra = function() {
            CreateModalFromTemplate(`/templates/${$scope.deployerType}-deployer/new-infra-modal.html`, $scope).then(function(newInfra) {
                $state.go(`${$scope.deployerType}deployer.infras.infra.settings`, {infraId: newInfra.id});
                WT1.event(`${$scope.deployerType}-deployer-infra-setup`, {infraType: newInfra.type});
            });
        };
    
        $scope.refreshInfraStatusList = function() {
            $scope.deployerAPIBase.infras.listLightStatus()
                .success(function(infraStatusList) {
                    $scope.infraStatusList = infraStatusList;
                }).error(setErrorInScope.bind($scope));
        };
    
        $scope.refreshInfraStatusList();
    });
    
    app.controller('_DeployerInfraController', function($scope, $state, $controller, Dialogs, ActivityIndicator) {
        $controller('_DeployerBaseController', {$scope: $scope});
        $scope.refreshInfraStatus = function() {
            $scope.deployerAPIBase.infras.getLightStatus($state.params.infraId)
            .success(infraStatus => {
                $scope.infraStatus = infraStatus;
            }).error(setErrorInScope.bind($scope));
        }

        $scope.deleteInfra = function() {
            if (!$scope.infraStatus) {
                return;
            }
            if ($scope.infraStatus.deployments.length) {
                Dialogs.error($scope, 'Delete infra', 'You cannot delete this infra because it still has deployments!');
                return;
            }
            Dialogs.confirm($scope, 'Delete infra','Are you sure you want to delete this infra?').then(function() {
                $scope.deployerAPIBase.infras.delete($scope.infraStatus.infraBasicInfo.id)
                    .success(() => {
                        ActivityIndicator.success(`Infra ${$scope.infraStatus.infraBasicInfo.id} successfully deleted.`)
                        $state.go($scope.deployerType + 'deployer.infras.list');
                    })
                    .error(setErrorInScope.bind($scope));
            });
        };

        $scope.refreshInfraStatus();
    });

    app.controller('_DeployerInfraStatusController', function($scope, TopNav) {
        const navLocation = `TOP_${$scope.deployerType.toUpperCase()}_DEPLOYER`;
        TopNav.setNoItem();
        TopNav.setLocation(TopNav[navLocation], 'infras', null, 'status');
    });

    app.controller('_DeployerInfraSetupModalController', function($scope, DeployerUtils) {
        $scope.newInfra = {
            stage: (($scope.stages || [])[0] || {}).id
        };
        
        $scope.hasUrlSuffix = DeployerUtils.hasUrlSuffix;

        $scope.ok = function() {
            $scope.deployerAPIBase.infras.create($scope.newInfra)
                .success($scope.resolveModal)
                .error(setErrorInScope.bind($scope));
        };
    });

    app.controller('_DeployerInfraHistoryController', function($scope, TopNav) {
        const navLocation = `TOP_${$scope.deployerType.toUpperCase()}_DEPLOYER`;
        TopNav.setNoItem();
        TopNav.setLocation(TopNav[navLocation], 'infras', null, 'history');
    });

    app.controller('_DeployerInfraSettingsController', function($scope, $controller, $state, TopNav, ActivityIndicator, DeployerUtils) {
        const navLocation = `TOP_${$scope.deployerType.toUpperCase()}_DEPLOYER`;
        TopNav.setNoItem();
        TopNav.setLocation(TopNav[navLocation], 'infras', null, 'settings');

        $scope.uiState = {
            settingsPane: 'general'
        };

        $scope.hasUrlSuffix = DeployerUtils.hasUrlSuffix;

        $scope.invalidTabs = new Set();
        $scope.$watch("uiState.settingsPane", function(nv, ov) {
            if (nv === ov) return;
            if ($scope.infraSettingsForm.$invalid) {
                $scope.invalidTabs.add(ov);
            }
            $scope.invalidTabs.delete(nv);
        });

        let savedInfra; // for dirtyness detection
        function refreshInfra() {
            $scope.deployerAPIBase.infras.getSettings($state.params.infraId)
                .success(infra => {
                    $scope.infra = infra;
                    savedInfra = angular.copy(infra);
                })
                .error(setErrorInScope.bind($scope));
        };

        $scope.infraIsDirty = function() {
            return !angular.equals(savedInfra, $scope.infra);
        };

        $scope.isInfraSettingsFormInvalid = function() {
            return $scope.infraSettingsForm.$invalid || $scope.invalidTabs.size;
        }

        $scope.saveInfra = function() {
            if (!$scope.infra) return;

            $scope.deployerAPIBase.infras.save($scope.infra)
                .success(function() {
                    if ($scope.isInfraSettingsFormInvalid()) {
                        ActivityIndicator.warning("Saved with some invalid fields");
                    }
                    refreshInfra();
                    $scope.refreshInfraStatus();
                }).error(setErrorInScope.bind($scope));
        };

        /********* Permissions *********/
        $controller('_DeployerPermissionsController', {$scope: $scope});

        // don't initialize until obj is available or else timing issues can occur
        const deregister = $scope.$watch("infra", function(nv, ov) {
            if (!nv) return;

            $scope.initPermissions($scope.infra, {
                deploy: true,
                admin: false,
                read: false
            }, false);

            deregister();
        }, false);

        $scope.$watch("infra.permissions", function(nv, ov) {
            if (!nv) return;
            $scope.onPermissionChange($scope.infra);
        }, true);

        $scope.$watch("infra.permissions", function(nv, ov) {
            if (!nv) return;
            $scope.onPermissionChange($scope.infra);
        }, false);

        refreshInfra();
        checkChangesBeforeLeaving($scope, $scope.infraIsDirty);
    });
})();