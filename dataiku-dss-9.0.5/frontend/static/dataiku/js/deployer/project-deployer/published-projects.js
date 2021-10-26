(function() {
    'use strict';
    
    const app = angular.module('dataiku.projectdeployer');
    
    app.service("ProjectDeployerProjectUtils", function() {
        const svc = {};

        svc.getBundleOriginInfo = function(designNodeInfo) {
            const originInfo = {};

            if (designNodeInfo) {
                originInfo.projectKey = designNodeInfo.projectKey;
                if (designNodeInfo.url) {
                    originInfo.url = designNodeInfo.url;
                    if (originInfo.url.substr(-1) !== '/') {
                        originInfo.url += '/';
                    }
                    originInfo.url += 'projects/' + originInfo.projectKey + '/';
                }
            }
            return originInfo;
        };

        return svc;
    });

    app.controller('ProjectDeployerProjectsController', function(TopNav, $scope) {
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_PROJECT_DEPLOYER, 'projects');
    });

    app.controller('ProjectDeployerProjectListController', function($scope, $state, DataikuAPI, WT1,
        CreateModalFromTemplate, ProjectDeployerProjectUtils, DeployerUtils, ActivityIndicator) {
        if ($scope.isFeatureLocked) return;

        const MAX_STAGE_COUNT = 3;
        let showOthersColumn = false;
        $scope.uiState = $scope.uiState || {};

        $scope.refreshProjectList = function() {
            DataikuAPI.projectdeployer.publishedProjects.listLightStatus()
                .success(projectStatusList => {
                    $scope.projectStatusList = projectStatusList;
                    $scope.canUploadBundles = $scope.appConfig.globalPermissions.mayCreatePublishedProjects;
                    $scope.currentStages = DeployerUtils.getStagesToDisplay(projectStatusList, $scope.stages, MAX_STAGE_COUNT);

                    projectStatusList.forEach(project => {
                        // check if the user can upload a bundle
                        $scope.canUploadBundles = $scope.canUploadBundles || project.canWrite;

                        // compute number of deployments per published project per stage
                        project.deploymentCountPerStage = DeployerUtils.getDeploymentCountsPerPublishedItemAndStage(project, $scope.stages, $scope.currentStages);
                        showOthersColumn = showOthersColumn || !!project.deploymentCountPerStage.counts['__OTHERS__'];

                        if (project.packages.length > 0) {
                            // The bundles are sorted by the publishedBy field in the backend, so the latest bundle is also
                            // the last element of the packages array
                            const latestBundle = project.packages.slice(-1).pop();
                            project.originInfo = ProjectDeployerProjectUtils.getBundleOriginInfo(latestBundle.designNodeInfo);
                          
                            project.lastPublishInfo = {
                                publishedOn: latestBundle.publishedOn,
                                publishedBy: latestBundle.publishedBy
                            };
                        }
                    });

                    // don't show others column if there aren't any grouped/unknown stages
                    if (!showOthersColumn) {
                        $scope.currentStages = $scope.currentStages.filter(stage => stage.id !== '__OTHERS__');
                    }
                })
                .error(setErrorInScope.bind($scope));
        };

        $scope.openUploadBundleModal = function() {
            CreateModalFromTemplate("/templates/project-deployer/upload-bundle-modal.html", $scope, "ProjectDeployerUploadBundleController", function(newScope) {
                newScope.publishedProjects = $scope.projectStatusList.filter(projectStatus => projectStatus.canWrite).sort((a, b) => a.projectBasicInfo.name.localeCompare(b.projectBasicInfo.name));
                if ($scope.appConfig.globalPermissions.mayCreatePublishedProjects) {
                    newScope.publishedProjects.unshift({
                        createProjectMessage: "Create a new project...",
                        projectBasicInfo: {}
                    });
                    newScope.publishedProjectKeys = newScope.publishedProjects.map(function(projectStatus) {
                        if (projectStatus.projectBasicInfo.id === projectStatus.projectBasicInfo.name) return "";
                        return projectStatus.projectBasicInfo.id;
                    });
                }
            }).then(function(projectKey) {
                ActivityIndicator.success("Bundle(s) uploaded successfully.");
                WT1.event('project-deployer-upload-package');
                $state.go("projectdeployer.projects.project.home.status", {publishedProjectKey: projectKey});
            });
        };

        $scope.filterProject = function(project) {
            if (!$scope.uiState.query) return true;
            const query = $scope.uiState.query.toLowerCase();
            return project.originInfo && project.originInfo.projectKey.toLowerCase().includes(query)
                || project.projectBasicInfo.id.toLowerCase().includes(query)
                || project.projectBasicInfo.name.toLowerCase().includes(query)
                || project.lastPublishInfo && project.lastPublishInfo.publishedBy.toLowerCase().includes(query);
        }

        $scope.refreshProjectList();
    });

    app.controller('ProjectDeployerProjectController', function($scope, $state, DataikuAPI, Dialogs, WT1, CreateModalFromTemplate, ActivityIndicator) {
        $scope.ui = {};

        $scope.refreshProjectSettings = function() {
            DataikuAPI.projectdeployer.publishedProjects.getSettings($state.params.publishedProjectKey)
                .success(settings => {
                    $scope.publishedProject = settings;
                    $scope.ui.ownerLogin = $scope.publishedProject.owner;
                    $scope.originalPublishedProject = angular.copy(settings);
                })
                .error(setErrorInScope.bind($scope));
        }

        $scope.refreshProjectStatus = function() {
            DataikuAPI.projectdeployer.publishedProjects.getLightStatus($state.params.publishedProjectKey)
                .success(status => {
                    $scope.projectStatus = status;
                })
                .error(setErrorInScope.bind($scope));
        };

        $scope.redirectToProject = function(project, event) {
            $state.go("projectdeployer.projects.project.home.status",
                { publishedProjectKey: project.projectBasicInfo.id });
            event.stopPropagation();
        }

        $scope.openUploadBundleModal = function() {
            if (!$scope.projectStatus) return;
            $scope.presetProjectKey = $scope.projectStatus.projectBasicInfo.id;
            CreateModalFromTemplate("/templates/project-deployer/upload-bundle-modal.html", $scope, "ProjectDeployerUploadBundleController").then(function() {
                $scope.refreshProjectStatus();
                ActivityIndicator.success("Bundle(s) uploaded successfully.");
                WT1.event('project-deployer-upload-package');
            });
        };

        $scope.deleteProject = function() {
            if (!$scope.projectStatus) {
                return;
            }
            if ($scope.projectStatus.deployments.length) {
                Dialogs.error($scope, 'Delete project', 'You cannot delete this project because it has deployments!');
                return;
            }
            Dialogs.confirm($scope, 'Delete project','Are you sure you want to delete this project?').then(function() {
                DataikuAPI.projectdeployer.publishedProjects.delete($scope.projectStatus.projectBasicInfo.id)
                    .success(() => {
                        ActivityIndicator.success(`Project ${$scope.projectStatus.projectBasicInfo.id} successfully deleted.`)
                        $state.go('projectdeployer.projects.list');
                    })
                    .error(setErrorInScope.bind($scope));
            });
        };
    });

    app.controller('ProjectDeployerProjectStatusController', function($scope, TopNav, DeployerUtils, ProjectDeployerProjectUtils) {
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_PROJECT_DEPLOYER, 'projects', null, 'status');

        $scope.refreshProjectStatus();

        $scope.uiState = {
            query: ''
        };

        const MAX_STAGE_COUNT = 3;
        $scope.$watch('projectStatus', function(nv, ov) {
            if (nv) {
                $scope.currentStages = DeployerUtils.getStagesToDisplay([$scope.projectStatus], $scope.stages, MAX_STAGE_COUNT);
                const deploymentsPerPackageAndStage = DeployerUtils.getDeploymentsPerPackageAndStage($scope.projectStatus, $scope.stages, $scope.currentStages, 'bundle');

                $scope.projectStatus.packages.forEach(bundle => {
                    bundle.originInfo = ProjectDeployerProjectUtils.getBundleOriginInfo(bundle.designNodeInfo);
                    bundle.stages = deploymentsPerPackageAndStage[bundle.id];
                });
            }
        });
    });

    app.controller('ProjectDeployerProjectSettingsController', function($scope, $controller, TopNav, DataikuAPI, PermissionsService) {
        $controller('_DeployerPermissionsController', {$scope: $scope});

        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_PROJECT_DEPLOYER, 'projects', null, 'settings');

        $scope.uiState = {
            active: 'permissions'
        };

        $scope.saveProject = function() {
            if (!$scope.publishedProject || !$scope.projectIsDirty()) return;
            DataikuAPI.projectdeployer.publishedProjects.save($scope.publishedProject)
                .success(function() {
                    $scope.refreshProjectStatus();
                    $scope.refreshProjectSettings();
                })
                .error(setErrorInScope.bind($scope));
        };
    
        $scope.projectIsDirty = function() {
            return !angular.equals($scope.originalPublishedProject, $scope.publishedProject);
        };

        const deregister = $scope.$watch("publishedProject", function(nv, ov) {
            if (!nv) return;
            $scope.initPermissions($scope.publishedProject, {
                read: true,
                write: false,
                deploy: false,
                admin: false
            }, true);
            deregister();
        }, false);

        $scope.$watch("publishedProject.permissions", function(nv, ov) {
            if (!nv) return;
            $scope.onPermissionChange($scope.publishedProject);
        }, true);

        $scope.$watch("publishedProject.permissions", function(nv, ov) {
            if (!nv) return;
            $scope.onPermissionChange($scope.publishedProject);
        }, false);

        $scope.$watch("ui.ownerLogin", function() {
            PermissionsService.transferOwnership($scope, $scope.publishedProject, "project");
        });

        $scope.refreshProjectStatus();
        $scope.refreshProjectSettings();

        checkChangesBeforeLeaving($scope, $scope.projectIsDirty);
    });

    app.controller('ProjectDeployerProjectHistoryController', function($scope, TopNav) {
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_PROJECT_DEPLOYER, 'projects', null, 'history');
    
        $scope.refreshProjectStatus();
        $scope.refreshProjectSettings();
    });

    app.controller('ProjectDeployerBundleController', function($scope, $state, $q, DataikuAPI, WT1, Dialogs, ActivityIndicator, DeployerUtils, ProjectDeployerProjectUtils) {
        const projectKey = $state.params.publishedProjectKey;
        const bundleId = $state.params.bundleId;
        const MAX_STAGE_COUNT = 3;

        $scope.bundleDeployments = {};

        $scope.refreshBundle = function() {
            const bundle = DataikuAPI.projectdeployer.publishedProjects.getBundleDetails(projectKey, bundleId)
            .success(bundleDetails => {
                $scope.bundleDetails = bundleDetails;
            })
            .error(setErrorInScope.bind($scope));
            
            $scope.bundleDeployments = {};
            const infraStagesById = DeployerUtils.getInfraStagesById($scope.projectStatus, $scope.stages);
            $scope.projectStatus.deployments
                .filter(deployment => deployment.bundleId === bundleId)
                .forEach(function(deployment) {
                    const stage = infraStagesById[deployment.infraId];
                    $scope.bundleDeployments[stage] = $scope.bundleDeployments[stage] || [];

                    $scope.bundleDeployments[stage].push({
                        infraBasicInfo: $scope.projectStatus.infras.find(infra => infra.id === deployment.infraId),
                        deploymentBasicInfo: deployment,
                        projectBasicInfo: $scope.projectStatus.projectBasicInfo
                    });
                });

            // only use stages that have any deployments
            const usedStages = $scope.stages.filter(stage => Object.keys($scope.bundleDeployments).includes(stage.id));
            $scope.currentStages = DeployerUtils.addOthersStage(usedStages.slice(0, MAX_STAGE_COUNT));

            $scope.deploymentsPerStage = DeployerUtils.getDeploymentsPerPackageAndStage($scope.projectStatus, $scope.stages, $scope.currentStages, 'bundle')[bundleId];

            const packageInfo = $scope.projectStatus.packages.find(pkg => pkg.id === bundleId);
            if (packageInfo) {
                $scope.publishedOn = packageInfo.publishedOn;
                $scope.publishedBy = packageInfo.publishedBy;
                $scope.originInfo = ProjectDeployerProjectUtils.getBundleOriginInfo(packageInfo.designNodeInfo);
            }

            return $q.all(bundle, $scope.projectStatus);
        };

        $scope.hasProjectConfig = function() {
            if (!$scope.bundleDetails) return;
            return Object.values($scope.bundleDetails.configContent).some(configTypeCount => !!configTypeCount);
        }

        $scope.hasAdditionalContent = function() {
            if (!$scope.bundleDetails) return;
            return ($scope.bundleDetails.includedDatasets || []).length + ($scope.bundleDetails.includedManagedFolders || []).length
                + ($scope.bundleDetails.includedSavedModels || []).length + ($scope.bundleDetails.includedModelEvaluationStores || []).length;
        }

        $scope.hasDeployments = function() {
            return Object.keys($scope.bundleDeployments).length;
        }

        $scope.deleteBundle = function() {
            if ($scope.deploymentsPerStage.count) {
                Dialogs.error($scope, 'Delete bundle', 'You cannot delete this bundle because it still has deployments!');
                return;
            }
            Dialogs.confirm($scope, 'Delete bundle ' + bundleId, 'Are you sure you want to delete this bundle?').then(function() {
                DataikuAPI.projectdeployer.publishedProjects.deleteBundle(projectKey, bundleId)
                .success(() => {
                    ActivityIndicator.success(`Bundle ${bundleId} successfully deleted.`)
                    $state.go('projectdeployer.projects.project.home.status', {publishedProjectKey: projectKey});
                })
                .error(setErrorInScope.bind($scope));
                WT1.event('project-deployer-packages-delete');
            });
        };
    });

    app.controller('ProjectDeployerBundleStatusController', function($scope, $state, DataikuAPI, ProjectDeployerProjectsService, ProjectDeployerAsyncHeavyStatusLoader, DeployerDeploymentTileService, DeployerUtils) {
        $scope.heavyStatusByDeploymentId = {};

        $scope.refreshProjectStatus();

        $scope.deployBundle = function() {
            ProjectDeployerProjectsService.deployBundle($scope.projectStatus, $state.params.bundleId, DeployerUtils.DEPLOY_SOURCE.PACKAGE);
        };

        $scope.$watch("projectStatus", function(ov, nv) {
            if ($scope.projectStatus) {
                $scope.refreshBundle();
            }
        });

        DataikuAPI.projectdeployer.infras.listLightStatus()
            .success(function(infraStatusList) {
                $scope.infraStatusList = infraStatusList;
            }).error(setErrorInScope.bind($scope));

        $scope.$watch('bundleDeployments', (nv) => {
            if (!$scope.bundleDeployments || !Object.keys($scope.bundleDeployments).length) return;

            const pseudoInfraLightStatusMap = {};
            for (let stage in $scope.bundleDeployments) {
                $scope.bundleDeployments[stage].forEach(deployment => {
                    const infraBasicInfo = deployment.infraBasicInfo;
                    if (!(infraBasicInfo.id in pseudoInfraLightStatusMap)) {
                        pseudoInfraLightStatusMap[infraBasicInfo.id] = {
                            infraBasicInfo,
                            deployments: []
                        };
                    }
                    pseudoInfraLightStatusMap[infraBasicInfo.id].deployments.push(deployment.deploymentBasicInfo);
                });
            }

            const heavyStatusByDeploymentId = {};
            let loader = ProjectDeployerAsyncHeavyStatusLoader.newLoader(Object.values(pseudoInfraLightStatusMap), heavyStatusByDeploymentId);
            loader.loadHeavyStatus();

            const deregister = $scope.$watch(function(){
                return loader.stillRefreshing();
            }, function(nv, ov) {
                if (nv || ov === nv) return;
                $scope.heavyStatusByDeploymentId = heavyStatusByDeploymentId;
                $scope.healthMap = DeployerDeploymentTileService.getDeploymentHealthMap($scope.projectStatus.deployments, heavyStatusByDeploymentId);
                deregister();
            });

            $scope.$on('$destroy', function() {
                loader && loader.stopLoading();
            });
        });
    });

    app.controller('ProjectDeployerUploadBundleController', function($scope, DataikuAPI, $controller) {
        $controller("_DeployerUploadPackageController", {$scope:$scope});
        if (!$scope.presetProjectKey) {
            $scope.uiState.useBundleProjectKey = true;

            $scope.$watch('uiState.useBundleProjectKey', function(nv, ov) {
                if (nv) {
                    delete $scope.uiState.overridingProject;
                }
            });
        }

        let uploadProjectKey;
        $scope.publishPackage = (fileToUpload, callback) => {
            uploadProjectKey = $scope.uiState.overridingProject && $scope.uiState.overridingProject.projectBasicInfo.id || $scope.presetProjectKey;
            return DataikuAPI.projectdeployer.publishedProjects.uploadBundle(uploadProjectKey, fileToUpload, callback);
        };
        $scope.afterUploadCallback = function(unparsedBundleInfo) {
            if ($scope.uiState.fileProperties.filter(f => !f.uploaded).length == 0) {
                $scope.resolveModal(uploadProjectKey || JSON.parse(unparsedBundleInfo).designNodeInfo.projectKey);
            }
        };
    });

    app.service('ProjectDeployerProjectsService', function($state, $q, DataikuAPI, Assert, WT1, DeployerPublishedItemsService, ProjectDeployerDeploymentUtils, ProjectDeployerDeploymentService) {
        this.deployBundle = function(projectStatus, bundleId, source) {
            Assert.trueish(projectStatus, 'project status not provided');
            Assert.trueish(projectStatus.deployments, 'no deployments in projectStatus');
    
            DeployerPublishedItemsService.deployPackage(projectStatus, 'bundle').then(deploymentMethodId => {
                if (deploymentMethodId === DeployerPublishedItemsService.DEPLOYMENT_METHOD_ID.NEW) {
                    deployBundleInNewDeployment(projectStatus, bundleId, source);
                } else {
                    deployBundleInExistingDeployment(projectStatus, bundleId, source);
                }
            })
        };
    
        function deployBundleInNewDeployment(projectStatus, bundleId, source) {
            return ProjectDeployerDeploymentService.startCreateDeployment(projectStatus.projectBasicInfo.id, bundleId).then(function(newDeployment) {
                $state.go('projectdeployer.deployments.deployment.status', {
                    deploymentId: newDeployment.id
                });
                WT1.event('project-deployer-deploy-bundle-in-new-deployment', {deploymentType: 'PROJECT', source });
            });
        };
    
        function deployBundleInExistingDeployment(projectStatus, bundleId, source) {
            DeployerPublishedItemsService.openDeploymentSelector(projectStatus, false).then(function(deployment) {
                const projectKey = projectStatus.projectBasicInfo.id;
                const settingsPromise = DataikuAPI.projectdeployer.deployments.getSettings(deployment.id);
                const bundleDetailsPromise = DataikuAPI.projectdeployer.publishedProjects.getBundleDetailsExtended(projectKey, bundleId);

                $q.all([settingsPromise, bundleDetailsPromise]).then(function([settingsResponse, bundleDetailsResponse]) {
                    const settings = settingsResponse.data;
                    const bundleDetails = bundleDetailsResponse.data;
                    
                    settings.bundleId = bundleId;
                    settings.scenariosToActivate = ProjectDeployerDeploymentUtils.getUpdatedScenarioMap(settings.scenariosToActivate, bundleDetails.scenarios);

                    DataikuAPI.projectdeployer.deployments.save(settings)
                    .success(function() {
                        $state.go('projectdeployer.deployments.deployment.settings', {
                            deploymentId: deployment.id
                        });
                        WT1.event('project-deployer-deploy-bundle-in-existing-deployment', { deploymentType: 'PROJECT', source });
                    })
                    .error(function() {
                        deferred.reject.call(this, arguments);
                    });
                });
            });
        };
    });


})();

