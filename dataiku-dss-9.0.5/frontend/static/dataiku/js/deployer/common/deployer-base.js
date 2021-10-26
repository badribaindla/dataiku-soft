(function() {
    'use strict';
    
    const app = angular.module('dataiku.deployer', []);

    app.controller('DeployerHomeController', function($scope, $rootScope, TopNav, DataikuAPI) {
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_DEPLOYER, '');
        const MAX_STAGE_COUNT = 5;

        function stageCounts(deployments, stages) {
            stages = stages.slice(0, MAX_STAGE_COUNT);
            const counts = stages.reduce((obj, stage) => ({ ...obj, [stage.id]: 0 }), {})

            deployments.forEach(deployment => {
                let stageId = deployment.infraBasicInfo.stage;
                if (!stages.find(stage => stage.id === stageId)) {
                    stageId = "__OTHERS__";
                }
                if (!(stageId in counts)) {
                    counts[stageId] = 0;
                }
                counts[stageId]++;
            });

            return counts;
        }

        DataikuAPI.projectdeployer.deployments.listLightStatus().success(function(deployments) {
            if (deployments.length) {
                $scope.projectStageCounts = stageCounts(deployments, $rootScope.appConfig.projectDeploymentStages);
            }
        });

        DataikuAPI.apideployer.deployments.listLightStatus().success(function(deployments) {
            if (deployments.length) {
                $scope.apiStageCounts = stageCounts(deployments, $rootScope.appConfig.apiDeploymentStages);
            }
        });
    });

    app.controller('_DeployerBaseController', function($scope, TaggingService) {
        TaggingService.fetchGlobalTags();
    });

    app.service('DeployerUtils', function(APIDeployerDeploymentUtils) {
        const svc = this;

        svc.DEPLOY_SOURCE = {
            PACKAGE_PANEL: 'PACKAGE_PANEL',
            PACKAGE: 'PACKAGE'
        };
        
        svc.hasUrlSuffix = function(url) {
            const pat = /https?:\/\/[^\/]+(\/+[^\/].*)/; // the fields in the UI enforce http[s] so we do the same here
            return pat.test(url);
        };

        svc.enabledDeploymentCount = function(deployments, enabled) {
            return deployments.filter(depl => depl.enabled === !!enabled).length;
        };

        svc.stageDetails = function(stages, stageId) {
            const foundStage = stages.find(s => s.id == stageId);
            return stageId + ' - ' + (foundStage ? foundStage.desc : 'Unknown stage');
        };

        /*
            allStages: list of all available stages
            displayedStages: list of stages to display
            packageType: bundle or version

            About "others" in packageInfo: 
            - Contains deployments with infras that have no longer existing stage names (__OTHERS__, aka Unknown stages)
            - Contains deployments with infras that are in allStages but not displayedStages

            When displaying stage counts, both these cases fall under __OTHERS__, but only truly unknown stages
            deployments are stored in packageInfo.perStage['__OTHERS__'].deployments.
        */
        svc.getDeploymentsPerPackageAndStage = function(publishedItemStatus, allStages, displayedStages, packageType) {
            const ret = {};
            const infraStagesById = svc.getInfraStagesById(publishedItemStatus, allStages);
            displayedStages = displayedStages || allStages;

            // If displayedStages has an OTHERS stage, add one to allStages as well
            if (displayedStages.some(stage => stage.id === '__OTHERS__')) {
                allStages = svc.addOthersStage(allStages);
            }

            (publishedItemStatus.packages || []).forEach(function(pkg) {
                ret[pkg.id] = {
                    count: 0,
                    perStage: allStages.reduce((obj, stage, idx) => ({
                        ...obj,
                        [stage.id]: {idx: idx, deployments: []}
                    }), {})
                };
            });

            (publishedItemStatus.deployments || []).forEach(function(deploymentBasicInfo) {
                if (packageType === 'bundle') {
                    addCounts(ret, deploymentBasicInfo.bundleId, deploymentBasicInfo);
                } else {
                    const participatingVersions = APIDeployerDeploymentUtils.getParticipatingVersions(deploymentBasicInfo);
                    participatingVersions.forEach(function(version) {
                        addCounts(ret, version, deploymentBasicInfo);
                    });
                }
            });

            return ret;

            function addCounts(item, packageId, deploymentBasicInfo) {
                const packageInfo = item[packageId];

                if (!packageInfo) return;

                const stageId = infraStagesById[deploymentBasicInfo.infraId];
                const isOtherStage = !displayedStages.some(stage => stage.id === stageId) || stageId === '__OTHERS__';

                packageInfo.count++;
                
                // included in the count of other stages
                if (isOtherStage) {
                    packageInfo.others = packageInfo.others || { 
                        stageCounts: {},
                        deployments: [] 
                    };

                    addStage(stageId, packageInfo.others.stageCounts);
                    packageInfo.others.deployments.push(deploymentBasicInfo);
                }
                
                /*
                    Add deployment to corresponding stage, even if it was added to the "others" deployment list. This is because there are pages where we show both a truncated list of stages and a list of all stages (e.g., bundle status page).
                */
                packageInfo.perStage[stageId].deployments.push(deploymentBasicInfo);
            }
        };

        /*
            Returns a map of deployment counts for a published item (project or service)
        */
        svc.getDeploymentCountsPerPublishedItemAndStage = function(publishedItemStatus, allStages, displayedStages) {
            const infraStagesById = svc.getInfraStagesById(publishedItemStatus, allStages);
            displayedStages = displayedStages || allStages;

            // include others stage for counting if displayedStages has them
            if (displayedStages.some(stage => stage.id === '__OTHERS__')) {
                allStages = svc.addOthersStage(allStages);
            }

            // deployment counts per project
            const deployments = {
                counts: allStages.reduce((obj, stage) => ({
                    ...obj,
                    [stage.id]: 0
                }), {})
            };
                        
            publishedItemStatus.deployments.forEach(deployment => {
                const originalStageId = infraStagesById[deployment.infraId];
                const isOtherStage = !displayedStages.some(stage => stage.id === originalStageId) || originalStageId === '__OTHERS__';
                const newStageId = isOtherStage ? '__OTHERS__' : originalStageId;

                addStage(newStageId, deployments.counts);

                if (isOtherStage) {
                    deployments.others = deployments.others || {};
                    addStage(originalStageId, deployments.others);
                }
            });

            return deployments;
        };

        function addStage(stageId, countObj) {
            countObj[stageId] = countObj[stageId] || 0;
            countObj[stageId]++;
        }

        /*
            Return a map of stages with infraId as key
        */
        svc.getInfraStagesById = function(publishedItemStatus, stages) {
            const infraStagesById = {};

            publishedItemStatus.infras.forEach(function(infra) {
                let stageId = infra.stage;
                // if infraId has a stage that no longer exists, set its stage to __OTHERS__
                infraStagesById[infra.id] = !stages.some(stage => stage.id === stageId) ? '__OTHERS__' : stageId;
            });

            return infraStagesById;
        };

        /*
            Returns an array of stages to show
        */
        svc.getStagesToDisplay = function(publishedItemStatusList, stages, maxStageCount) {
            const infraStagesByIdList = publishedItemStatusList.map(publishedItemStatus => svc.getInfraStagesById(publishedItemStatus, stages));
            const hasUnknownStages = infraStagesByIdList.some(infraStagesById => Object.values(infraStagesById).some(stage => stage === '__OTHERS__'));

            if (hasUnknownStages || maxStageCount < stages.length) {
                stages = svc.addOthersStage(stages.slice(0, maxStageCount));
            }

            return stages;
        };

        /*
            Adds "__OTHERS__" stage to stage list
        */
        svc.addOthersStage = function(stages) {
            stages = angular.copy(stages);
            if (!stages.some(stage => stage.id === '__OTHERS__')) {
                stages.push({
                    id: '__OTHERS__'
                });
            }
            return stages;
        };

        svc.getStageCountColor = function(deployments, heavyStatusByDeploymentId, canBeDisabled) {
            if (!deployments || !deployments.length) {
                return '#ddd';
            }
            if (canBeDisabled && !deployments.find(depl => depl.enabled)) {
                return '#ccc';
            }
            if (deployments.some(depl => ['ERROR', 'UNHEALTHY', 'LOADING_FAILED'].includes((heavyStatusByDeploymentId[depl.id] || {}).health))) {
                return '#ce1329';
            }
            if (deployments.some(depl => ['WARNING', 'UNKNOWN', 'OUT_OF_SYNC'].includes((heavyStatusByDeploymentId[depl.id] || {}).health))) {
                return '#f8931e';
            }
            return '#81c241';
        };

        /*
            isSinglePublishedItem: whether or not check if a specific bundle's project can be deployed
        */
        svc.getCannotDeployReason = function(publishedItemStatusList, infraStatusList, publishedItemType, isSinglePublishedItem = true) {
            if (!publishedItemStatusList || !publishedItemStatusList.length) {
                return `There are no ${publishedItemType}s to deploy`;
            }

            if (!canDeploy(publishedItemStatusList)) {
                return `You do not have permission to deploy ${isSinglePublishedItem ? 'this' : 'any'} ${publishedItemType}`;
            }

            if (!infraStatusList || !infraStatusList.length) {
                return 'There are no infras to deploy on';
            }

            if (!canDeploy(infraStatusList)) {
                return 'You do not have permission to deploy on any infra';
            }

            return ''; // can deploy
        };

        function canDeploy(statusList) {
            return statusList && statusList.some(status => status && status.canDeploy);
        }

        svc.getFailedHeavyStatusLoadMessage = function(errorDetails) {
            return {
                maxSeverity: "ERROR",
                messages: [{
                    details: errorDetails.detailedMessage,
                    message: errorDetails.detailedMessage,
                    severity: "ERROR",
                    title: "Failed loading the deployment status"
                }]
            }
        };
    });

    app.controller('_DeployerPermissionsController', function($scope, DataikuAPI) {
        let initialPermissions;
        let hasOwner;

        function makeNewPerm() {
            $scope.newPerm = angular.copy(initialPermissions);
        }

        function buildUnassignedGroups(item) {
            if (!item || !$scope.allGroups) return;

            $scope.unassignedGroups = $scope.allGroups.filter(function(groupName) {
                return item.permissions.every(perm => perm.group !== groupName);
            });
        }
        function fixupPermissions(item) {
            if (!item) {
                return;
            }
            item.permissions.forEach(function(p) {
                const permissionTypes = Object.keys(initialPermissions);
                permissionTypes.forEach(type => {
                    p[`$${type}Disabled`] = false;
                });
                if (p.admin) {
                    // set all to true
                    permissionTypes.filter(type => type !== 'admin').forEach(type => {
                        p[type] = true;
                        p[`$${type}Disabled`] = true;
                    });
                } else if (p.write || p.deploy) {
                    p.read = true;
                    p.$readDisabled = true;
                }
            });
        }

        function setGroups(item) {
            DataikuAPI.security.listGroups(false).success(function(allGroups) {
                if (allGroups) {
                    allGroups.sort();
                }
                $scope.allGroups = allGroups;

                if (hasOwner) {
                    DataikuAPI.security.listUsers().success(function(data) {
                        $scope.allUsers = data;
                    }).error(setErrorInScope.bind($scope));
                }

                buildUnassignedGroups(item);
            }).error(setErrorInScope.bind($scope));
        }

        $scope.addPermission = function(item) {
            item.permissions.push($scope.newPerm);
            makeNewPerm();
        };


        $scope.onPermissionChange = function(item) {
            buildUnassignedGroups(item);
            fixupPermissions(item);
        }

        $scope.initPermissions = function(item, permissions, showOwner) {
            initialPermissions = permissions;
            hasOwner = showOwner;

            fixupPermissions(item);
            setGroups(item);

            makeNewPerm();
        }
    });
})();
