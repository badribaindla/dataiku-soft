(function() {
    'use strict';
    
    const app = angular.module('dataiku.deployer');

    app.filter('deploymentHealthToIcon', function() {
        const dict = {
            HEALTHY: 'icon-dku-success text-success',
            WARNING: 'icon-dku-warning text-warning',
            OUT_OF_SYNC: 'icon-dku-out-of-sync text-warning',
            UNHEALTHY: 'icon-dku-error text-error',
            ERROR: 'icon-dku-error text-error',
            UNKNOWN: 'icon-dku-help text-warning',

            LOADING: 'dku-loader icon-spin',
            DISABLED: 'icon-dku-pause',
            LOADING_FAILED: 'icon-dku-help text-error'
        };
        return function(health) {
            if (!health) {
                return dict.LOADING;
            }
            return dict[health] || '';
        };
    });

    app.filter('healthStatusToFriendly', function() {
        return function(healthStatus) {
            return healthStatus.charAt(0).toUpperCase() + healthStatus.substr(1).toLowerCase().replaceAll('_', ' ');
        };
    });

    app.service('DeployerDeploymentTileService', function($filter) {
        const deploymentHeavyStatusToHealthMessage = function(heavyStatus) {
            const displayedHealth = $filter('healthStatusToFriendly')(heavyStatus.health);
            if (heavyStatus.health === "HEALTHY") {
            // there still might be info messages in this case (appearing in the status page)
            // we do not want to startle the user by having them appear in the tooltip however
                return displayedHealth;
            }
            return displayedHealth + ' - ' + heavyStatus.healthMessages.messages.find(msg => msg.severity == heavyStatus.healthMessages.maxSeverity).message;
        }
        return {
            getDeploymentHealth: function(heavyStatus, isDisabled) {
                if (isDisabled) { // API deployments only
                    return {
                        currentState: "DISABLED",
                        message: "Deployment disabled"
                    };
                }
                if (!heavyStatus) {
                   return {
                       currentState: "LOADING"
                   };
                }
                return {
                    currentState: heavyStatus.health,
                    message: deploymentHeavyStatusToHealthMessage(heavyStatus)
                };
            },
            getDeploymentHealthMap: function(deployments, heavyStatusMap) {
                if (!deployments || !heavyStatusMap) return;

                const healthMap = {};

                deployments.forEach(deployment => {
                    healthMap[deployment.id] = this.getDeploymentHealth(heavyStatusMap[deployment.id], deployment.type === 'API_SERVICE' ? !deployment.enabled : false);
                });

                return healthMap;
            }
        }
    });

    app.controller('_DeployerDeploymentDashboardController', function($scope, $controller, $filter, TopNav, TaggingService) {
        $controller('_DeployerBaseController', {$scope});
        const navLocation = `TOP_${$scope.deployerType.toUpperCase()}_DEPLOYER`;
        TopNav.setNoItem();
        TopNav.setLocation(TopNav[navLocation], 'deployments');

        if ($scope.isFeatureLocked) return;

        $scope.uiState = $scope.uiState || {};
        $scope.uiState.query = {q: '', tags: []};
        $scope.uiState.query[`${$scope.publishedItemType}s`] = [];

        $scope.orderByExpression = [];

        $scope.rowHeaderHeight = 45;

        $scope.deployerAPIBase.deployments.listTags()
            .success(tags => { TaggingService.setProjectTags(TaggingService.fillTagsMapFromArray(tags)); })
            .error(setErrorInScope.bind($scope));

        $scope.deployerHasPublishedPackages = function(itemList) {
            return (itemList || []).some(item => !!item.packages.length);
        };

        $scope.displayedStages = angular.copy($scope.stages);

        const getDeploymentsPerStage = function(lightStatusList) {
            const deploymentsPerStage = $scope.displayedStages.reduce((obj, stage) => ({ ...obj, [stage.id]: [] }), {});
            lightStatusList.forEach(function(lightStatus) {
                let stageId = lightStatus.infraBasicInfo.stage;
                if (!$scope.displayedStages.find(stage => stage.id === stageId)) {
                    stageId = "__OTHERS__";
                }
                if (!(stageId in deploymentsPerStage)) {
                    deploymentsPerStage[stageId] = [];
                    $scope.displayedStages.push({id: stageId});
                }
                deploymentsPerStage[stageId].push(lightStatus);
            });
            return deploymentsPerStage;
        };

        $scope.refreshForFilter = function(filteredDeploymentStatusList) {
            $scope.deploymentsPerStage = getDeploymentsPerStage(filteredDeploymentStatusList);
            $scope.deploymentsByRow = [];
            $scope.deploymentHeaders = $scope.deploymentHeaders || Object.keys($scope.deploymentsPerStage);
            $scope.columnWidths =  $scope.columnWidths || $scope.deploymentHeaders.map(_ => 330);   
            const rowCount = Math.max.apply(null, Object.values($scope.deploymentsPerStage).map(d => d.length));
            
            if (rowCount > 0) {
                for (let row = 0; row < rowCount; row++) {
                    const rowData = [];
                    for (let stage in $scope.deploymentsPerStage) {
                        rowData.push(($scope.deploymentsPerStage[stage] || [])[row]);
                    }
                    $scope.deploymentsByRow.push(rowData);
                }
            }
        };

        function filterDeployments() {
            const filteredDeploymentStatusList = $filter('orderBy')(
                $scope.deploymentsStatusList.filter(lightStatus => $scope.deploymentIsInUI(lightStatus)), $scope.orderByExpression
            );
            $scope.refreshForFilter(filteredDeploymentStatusList);
        }

        $scope.selectAndFilterDeployments = function(item) {
            item.$selected = !item.$selected;
            filterDeployments();
        };
        
        $scope.$watch('uiState.query', (nv, ov) => {
            if (nv !== ov) {
                filterDeployments();
            }
        }, true);

        $scope.$on('tagSelectedInList', function(e, tag) {
            let index = $scope.uiState.query.tags.indexOf(tag);
            if (index >= 0) {
                $scope.uiState.query.tags.splice(index, 1);
            } else {
                $scope.uiState.query.tags.push(tag);
            }
            e.stopPropagation();
        });

        $scope.refreshAllDeployments = function() {
            $scope.heavyStatusPerDeploymentId = {};
            $scope.globalLightStatusLoaded = false;
            $scope.deployerAPIBase.globalLightStatus()
                .success(gls => {
                    $scope.globalLightStatusLoaded = true;
                    $scope.deploymentsStatusList = gls.deploymentsStatus;
                    $scope.infraStatusList = gls.infrasStatus;
                    $scope[`${$scope.publishedItemType}StatusList`] = gls[`${$scope.publishedItemType}sStatus`];
                    $scope.refreshForFilter($scope.deploymentsStatusList);
                })
                .error(setErrorInScope.bind($scope));
        }

        $scope.refreshAllDeployments();

        $scope.deployerHasPublishedPackages = function(itemList) {
            return (itemList || []).some(item => !!item.packages.length);
        };

        $scope.countSelectedItems = function(itemList) {
            return (itemList || []).filter(item => item.$selected).length;
        };

        $scope.clearSelectedItems = function(itemList) {
            return (itemList || []).forEach(item => item.$selected = false);
        };

        $scope.clearAndRefreshFilter = function(itemList) {
            $scope.clearSelectedItems(itemList);
            filterDeployments();
        }
        
        $scope.getSelectedHealthStatuses = function() {
            return $scope.countSelectedItems($scope.uiState.query.healthStatusMap) ? $scope.uiState.query.healthStatusMap.filter(healthStatus => healthStatus.$selected).map(healthStatus => $filter('healthStatusToFriendly')(healthStatus.id)).join(', ') : 'All states';
        }
    });

    app.controller('_DeployerPackagesPanelController', function($scope, $stateParams) {
        $scope.DEPLOYED_STATE = {
            'ALL': $scope.deployerType === 'api' ? 'All versions' : 'All bundles',
            'DEPLOYED': 'Deployed',
            'NOT_DEPLOYED': 'Not deployed'
        }

        $scope.uiState = {
            query: {
                search: '',
                deploy: $scope.DEPLOYED_STATE.ALL
            },
            noSelectedItem: true
        };

        function filterPublishedItemList() {
            $scope.uiState.noSelectedItem = itemList.every(item => !item.$selected);

            itemList.forEach(item => {
                let someVersionsAreShown = false;
                item.packages.forEach(pkg => {
                    // show deployed or not
                    pkg.$show = $scope.uiState.query.deploy === $scope.DEPLOYED_STATE.ALL
                        || ($scope.uiState.query.deploy === $scope.DEPLOYED_STATE.DEPLOYED && pkg.$deployed)
                        || ($scope.uiState.query.deploy === $scope.DEPLOYED_STATE.NOT_DEPLOYED && !pkg.$deployed);

                    // filtering by query: if query doesn't match item key/name, filter on packages
                    const query = $scope.uiState.query.search.toLowerCase();
                    if (!item[`${$scope.publishedItemType}BasicInfo`].id.toLowerCase().includes(query) &&
                        !item[`${$scope.publishedItemType}BasicInfo`].name.toLowerCase().includes(query)) {
                        // query matches package id or the id of one of the package deployments
                        pkg.$show = pkg.$show && ( pkg.id.toLowerCase().includes(query)
                            || pkg.$deployments.some(d => d.toLowerCase().includes(query)) );

                    }
                    someVersionsAreShown = pkg.$show || someVersionsAreShown;
                });
                // hide item if it is filtered out or all its packages are filtered out
                item.$show = ($scope.uiState.noSelectedItem || item.$selected) && someVersionsAreShown;
            });
        }

        let itemList;
        $scope.computeFullList = function(statusList) {
            itemList = statusList.filter(item => {
                    // remove any published items with no packages
                    return item.packages.length;
                }).map(item => {
                    item.$show = true; // whether the published item should be shown in list

                    item.packages.forEach(pkg => {
                        pkg.$show = true;
                        pkg.$deployments = $scope.getPackageDeployments(item.deployments, pkg.id).map(d => d.id);
                        pkg.$deployed = !!pkg.$deployments.length;
                    });
                    item.$latestPackage = item.packages.slice(-1).pop();
                    return item;
                });
            return itemList;
        }

        $scope.select = function(item) {
            item.$selected = !item.$selected;
            filterPublishedItemList();
        };

        $scope.clearItemFilter = function() {
            $scope.clearSelectedItems(itemList);
            filterPublishedItemList();
        };

        $scope.setDeployFilter = function(deploy) {
            $scope.uiState.query.deploy = deploy;
            filterPublishedItemList();
        };

        $scope.clearFilters = function() {
            $scope.uiState.query.search = '';
            $scope.uiState.query.deploy = $scope.DEPLOYED_STATE.ALL;
            $scope.clearItemFilter();
        };

        $scope.getFilteredPackageCount = function(item) {
            return item.packages.filter(pkg => pkg.$show).length;
        };

        $scope.deployerHasMatchingPublishedPackages = function() {
            return (itemList || []).some(item => item.$show && !!$scope.getFilteredPackageCount(item));
        };

        $scope.isNewPackage = function(pck) {
            return !pck.$deployed && pck.publishedOn >= (new Date()).getTime() - 24 * 3600 * 1000;
        };

        $scope.hasActiveFilters = function() {
            return $scope.uiState.query.search
                || $scope.uiState.query.deploy !== $scope.DEPLOYED_STATE.ALL
                || (itemList || []).some(item => item.$selected);
        };

        $scope.$watch("uiState.query.search", function(nv, ov) {
            if (nv === ov) return;
            filterPublishedItemList();
        });
    });

    app.controller('_DeployerDeploymentController', function($controller, $scope, $state, Dialogs, Assert, $rootScope, TaggingService) {
        $controller("_DeployerBaseController", {$scope: $scope});
        $scope.savedDeploymentSettings; // for dirtinessDetection

        $rootScope.activeProjectTagColor = TaggingService.getTagColor;
        
        $scope.getLightStatus = function() {
            return $scope.deployerAPIBase.deployments.getLightStatus($state.params.deploymentId).success(lightStatus => {
                $scope.lightStatus = lightStatus;
            }).error(setErrorInScope.bind($scope));
        };
    
        $scope.getHeavyStatus = function() {
            Assert.trueish($scope.lightStatus);
            return $scope.deployerAPIBase.deployments.getHeavyStatus($scope.lightStatus.deploymentBasicInfo.id, true).success(function(data) {
                $scope.heavyStatus = data;
            });
        };

        $scope.refreshLightAndHeavy = function(){
            $scope.getLightStatus(); // Heavy is refreshed by watch
        };
    
        $scope.getDeploymentSettings = function() {
            return $scope.deployerAPIBase.deployments.getSettings($state.params.deploymentId).success(function(data) {
                $scope.savedDeploymentSettings = angular.copy(data);
                $scope.deploymentSettings = data;
                
            }).error(setErrorInScope.bind($scope));
        };
    
        $scope.deploymentIsDirty = function() {
            return $scope.deploymentSettings && !angular.equals($scope.savedDeploymentSettings, $scope.deploymentSettings);
        };

        $scope.saveDeployment = function() {
            Assert.trueish($scope.deploymentSettings);
            if (!$scope.deploymentIsDirty()) return;
            return $scope.deployerAPIBase.deployments.save($scope.deploymentSettings).success(function(data) {
                $scope.getLightStatus();
                $scope.savedDeploymentSettings = angular.copy(data);
                $scope.deploymentSettings = data;
            }).error(setErrorInScope.bind($scope));
        };
    
        // abstract
        $scope.updateOnly = function() {};
    
        $scope.saveAndUpdate = function() {
            $scope.saveDeployment().then(function() { $scope.updateOnly(true); });
        };
    
        $scope.deleteDeployment = function() {
            if (!$scope.lightStatus) {
                return;
            }
            Dialogs.confirmAlert($scope, 'Delete deployment', 'Are you sure you want to delete this deployment?',
                                 $scope.deleteWarning, 'INFO').then(function() {
                $scope.deployerAPIBase.deployments.delete($scope.lightStatus.deploymentBasicInfo.id)
                    .success(_ => $state.go(`${$scope.deployerType}deployer.deployments.dashboard`))
                    .error(setErrorInScope.bind($scope));
            });
        };
    
        /* Main */
        $scope.getLightStatus();
    });
})();
