(function() {
'use strict';

const app = angular.module('dataiku.admin.codeenvs.common', []);

app.directive('codeEnvLogs', function($stateParams) {
    return {
        restrict : 'A',
        templateUrl : '/templates/admin/code-envs/common/code-env-logs.html',
        replace : true,
        scope : {
                envLang  : '=',
                envName  : '=',
                logs : '=',
                getLog : '&',
                downloadLog : '&'
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {
                    logsQuery : ''
                };

            $scope.currentLogName = null;
            $scope.currentLog = null;
            $scope.fetchLog = function(logName) {
                $scope.getLog()($scope.envLang, $stateParams.envName, logName).success(function(data) {
                    $scope.currentLogName = logName;
                    $scope.currentLog = data;
                }).error(setErrorInScope.bind($scope));
            };
            $scope.streamLog = function(logName) {
                $scope.downloadLog()($scope.envLang, $stateParams.envName, logName);
            };
        }
    };
});

app.directive('codeEnvSecurityPermissions', function(DataikuAPI, $rootScope, PermissionsService) {
    return {
        restrict : 'A',
        templateUrl : '/templates/admin/code-envs/common/security-permissions.html',
        replace : true,
        scope : {
                codeEnv  : '='
        },
        link : function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.ui = {};

            function makeNewPerm(){
                $scope.newPerm = {
                    update: true,
                    delete: true,
                    use: true
                }
            }
            makeNewPerm();

            const fixupPermissions = function() {
                if (!$scope.codeEnv) return;
                /* Handle implied permissions */
                $scope.codeEnv.permissions.forEach(function(p) {
                    p.$updateDisabled = false;
                    p.$manageUsersDisabled = false;
                    p.$useDisabled = false;
                    
                    if ($scope.codeEnv.usableByAll) {
                        p.$useDisabled = true;
                    }
                    if (p.update) {
                        p.$useDisabled = true;
                    }
                    if (p.manageUsers) {
                        p.$useDisabled = true;
                        p.$updateDisabled = true;
                    }
                });
            };
            
            DataikuAPI.security.listGroups(false).success(function(allGroups) {
                if (allGroups) {
                    allGroups.sort();
                }
                $scope.allGroups = allGroups;
                DataikuAPI.security.listUsers().success(function(data) {
                    $scope.allUsers = data;
                }).error(setErrorInScope.bind($scope));
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.codeEnv, $scope.allGroups);
            }).error(setErrorInScope.bind($scope));

            $scope.$watch("codeEnv.owner", function() {
                $scope.ui.ownerLogin = $scope.codeEnv.owner;
            });
            
            $scope.addPermission = function() {
                $scope.codeEnv.permissions.push($scope.newPerm);
                makeNewPerm();
            };

            $scope.$watch("codeEnv.usableByAll", function(nv, ov) {
                fixupPermissions();
            })
            $scope.$watch("codeEnv.permissions", function(nv, ov) {
                if (!nv) return;
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.codeEnv, $scope.allGroups);
                fixupPermissions();
            }, true)
            $scope.$watch("codeEnv.permissions", function(nv, ov) {
                if (!nv) return;
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.codeEnv, $scope.allGroups);
                fixupPermissions();
            }, false)
            $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.codeEnv, $scope.allGroups);
            fixupPermissions();

            // Ownership mgmt
            $scope.$watch("ui.ownerLogin", function() {
                PermissionsService.transferOwnership($scope, ($scope.codeEnv || {}).desc, "code env");
            });
        
        
        }
    };
});

app.directive('codeEnvContainers', function (DataikuAPI, $rootScope) {
    return {
        restrict: 'A',
        templateUrl: '/templates/admin/code-envs/common/code-env-containers.html',
        replace: true,
        scope: {
            codeEnv: '='
        },
        link: function ($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.addLicInfo = $rootScope.addLicInfo;

            let _mode = "NONE";
            if ($scope.codeEnv.allContainerConfs) {
                _mode = "ALL"
            } else if (!$scope.codeEnv.allContainerConfs && $scope.codeEnv.containerConfs.length !== 0) {
                _mode = "ALLOWED";
            }
            let _sparkMode = "NONE";
            if ($scope.codeEnv.allSparkKubernetesConfs) {
                _sparkMode = "ALL";
            } else if (!$scope.codeEnv.allSparkKubernetesConfs && $scope.codeEnv.sparkKubernetesConfs.length !== 0) {
                _sparkMode = "ALLOWED";
            }

            $scope.containerSelection = function (newMode) {
                if (!arguments.length) {
                    return _mode;
                }

                _mode = newMode;

                switch (newMode) {
                    case "NONE":
                        $scope.codeEnv.allContainerConfs = false;
                        $scope.codeEnv.containerConfs = [];
                        break;
                    case "ALLOWED":
                        $scope.codeEnv.allContainerConfs = false;
                        break;
                    case "ALL":
                        $scope.codeEnv.allContainerConfs = true;
                        break;
                }
            };
            $scope.sparkKubernetesSelection = function (newMode) {
                if (!arguments.length) {
                    return _sparkMode;
                }

                _sparkMode = newMode;

                switch (newMode) {
                    case "NONE":
                        $scope.codeEnv.allSparkKubernetesConfs = false;
                        $scope.codeEnv.sparkKubernetesConfs = [];
                        break;
                    case "ALLOWED":
                        $scope.codeEnv.allSparkKubernetesConfs = false;
                        break;
                    case "ALL":
                        $scope.codeEnv.allSparkKubernetesConfs = true;
                        break;
                }
            };

            $scope.removeOutdatedContainerConfs = function() {
                $scope.codeEnv.containerConfs = $scope.codeEnv.containerConfs.filter(o => $scope.outdatedContainerConfs.indexOf(o) === -1);
            };

            $scope.removeOutdatedSparkKubernetesConfs = function() {
                $scope.codeEnv.sparkKubernetesConfs = $scope.codeEnv.sparkKubernetesConfs.filter(o => $scope.outdatedSparkKubernetesConfs.indexOf(o) === -1);
            };

            DataikuAPI.containers.listNames()
                .success(data => {
                    $scope.containerNames = data;
                    $scope.outdatedContainerConfs = $scope.codeEnv.containerConfs.filter(o => $scope.containerNames.indexOf(o) === -1)

                    $scope.$watch("containerNames && codeEnv.containerConfs", function(nv, ov) {
                        $scope.outdatedContainerConfs = $scope.codeEnv.containerConfs.filter(o => $scope.containerNames.indexOf(o) === -1)
                    });
                })
                .error(setErrorInScope.bind($scope));
            DataikuAPI.containers.listSparkNames()
                .success(data => {
                    $scope.sparkKubernetesNames = data;
                    $scope.outdatedSparkKubernetesConfs = $scope.codeEnv.sparkKubernetesConfs.filter(o => $scope.sparkKubernetesNames.indexOf(o) === -1)

                    $scope.$watch("sparkKubernetesNames && codeEnv.sparkKubernetesConfs", function(nv, ov) {
                        $scope.outdatedSparkKubernetesConfs = $scope.codeEnv.sparkKubernetesConfs.filter(o => $scope.sparkKubernetesNames.indexOf(o) === -1)
                    });
                })
                .error(setErrorInScope.bind($scope));
        }
    };
});

}());
