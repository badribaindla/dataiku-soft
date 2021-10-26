(function() {
    'use strict';
    
    const app = angular.module('dataiku.deployer');
    
    app.controller('_DeployerUploadPackageController', function($scope, $timeout) {
        $scope.uiState = $scope.uiState || {};
        $scope.uiState.files = [];
        $scope.uiState.fileProperties = [];

        $scope.drop = function(files) {
            angular.forEach(files, function(file) {
                $scope.uiState.files.push(file);
                $scope.uiState.fileProperties.push({
                    path: file.name,
                    length: file.size
                });
            });
        };

        $scope.deleteFile = function(idx, e) {
            e.preventDefault();
            e.stopPropagation();
            $scope.uiState.files.splice(idx, 1);
            $scope.uiState.fileProperties.splice(idx, 1);
        };

        $scope.uploadFilesAfterDigest = function(files) {
            $timeout(function() {
                uploadFiles(files)
            });
        };

        function uploadFiles(files) {
            files.forEach((file, idx) => uploadOneFile(file, idx));
        }

        function uploadOneFile(fileToUpload, idx) {
            const file = {
                name: fileToUpload.name,
                size: fileToUpload.size,
                lastModified: fileToUpload.lastModified,
                progress: 0
            };

            $scope.publishPackage(fileToUpload, function(e) {
                if (e.lengthComputable) {
                    $scope.$apply(function() {
                        file.progress = Math.round(e.loaded * 100 / e.total);
                    });
                }
            }).then(
                function(response) {
                    $scope.uiState.fileProperties[idx].uploaded = true;
                    if ($scope.afterUploadCallback) {
                        $scope.afterUploadCallback(response);
                    }
                },
                function(payload) {
                    setErrorInScope.call($scope,
                        JSON.parse(payload.response || '{}'), payload.status, h => payload.getResponseHeader(h)
                    );
                }
            );
        }
    });
    
    app.service('DeployerPublishedItemsService', function($rootScope, $q, Dialogs) {
        const svc = this;

        svc.DEPLOYMENT_METHOD_ID = {
            'NEW': 'NEW',
            'UPDATE': 'UPDATE'
        }
    
        svc.deployPackage = function(publishedItemStatus, packageType) {
            const deferred = $q.defer();
            const deploymentMethods = getDeploymentMethods(packageType);

            if (!publishedItemStatus.deployments.length) {
                return $q.resolve(svc.DEPLOYMENT_METHOD_ID.NEW);
            } else {
                Dialogs.select($rootScope, `Deploy ${packageType}`, `Choose how to deploy this ${packageType}`, deploymentMethods, deploymentMethods[1])
                    .then(function(item) {
                        deferred.resolve(item.id);
                });
                return deferred.promise;
            }
        };
    
        svc.openDeploymentSelector = function(publishedItemStatus, includeInfraType) {
            const infraTypeMap = includeInfraType ? publishedItemStatus.infras.reduce((obj, infra) => ({ 
                ...obj,
                [infra.id]: infra.type
            }), {}) : {};
            const deployments = publishedItemStatus.deployments.map(depl => {
                const type = infraTypeMap[depl.infraId];
                return {
                    id: depl.id,
                    title: depl.id,
                    ...type && { type },
                    desc: `Infra: ${depl.infraId} ${type ? ` (${type})` : ''}`
                };
            });
            return Dialogs.select($rootScope, 'Choose the deployment', 'Choose which deployment you want to edit', deployments, deployments[0]);
        };

        function getDeploymentMethods(packageType) {
            return [
                {
                    id: svc.DEPLOYMENT_METHOD_ID.NEW,
                    title: 'Create',
                    desc: `Create a new deployment based on this ${packageType}`
                },
                {
                    id: svc.DEPLOYMENT_METHOD_ID.UPDATE,
                    title: 'Update',
                    desc: `Change the ${packageType} used in an existing deployment`
                }
            ]
        }
    });

})();
    