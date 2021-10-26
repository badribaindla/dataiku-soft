(function() {
    'use strict';
    
    const app = angular.module('dataiku.projectdeployer');

    app.controller('_ProjectDeployerDeploymentsBaseController', function(TopNav) {
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_PROJECT_DEPLOYER, 'deployments');
    });

    app.controller('ProjectDeployerDeploymentsController', function($scope, $controller) {
        $controller('_ProjectDeployerDeploymentsBaseController', {$scope: $scope});
    });

    app.service('ProjectDeployerAsyncHeavyStatusLoader', function(DataikuAPI, Logger, DeployerUtils) {
        return {
            newLoader: function(infraStatusList, heavyStatusPerDeploymentId) {
                const loader = {};
                let loading = true;
                loader.stillRefreshing = () => loading

                let canLoadStatus = true;
                loader.stopLoading = function() {
                    canLoadStatus = false;
                },

                loader.loadHeavyStatus = function() {
                    if (!infraStatusList.length || !canLoadStatus) {
                        loading = false;
                        return;
                    }

                    const infraStatus = infraStatusList.shift();
                    const infraId = infraStatus.infraBasicInfo.id;
                    const deploymentIds = infraStatus.deployments.map(_ => _.id);
                    Logger.info("Sending heavy status list request for deployments of infra " + infraId);
                    DataikuAPI.projectdeployer.deployments.listHeavyStatus(infraId)
                        .success(function(heavyStatusList) {
                            Logger.info("Got heavy status list for infra " + infraId);
                            heavyStatusList.forEach((heavyStatus) => {
                                heavyStatusPerDeploymentId[heavyStatus.deploymentId] = heavyStatus;
                            });
                            loader.loadHeavyStatus();
                        }).error(function(a,b,c) {
                            Logger.warn("Failed to load heavy status list for infra " + infraId);
                            deploymentIds.forEach((deploymentId) => {
                                heavyStatusPerDeploymentId[deploymentId] = {
                                    health: "LOADING_FAILED",
                                    healthMessages: DeployerUtils.getFailedHeavyStatusLoadMessage(getErrorDetails(a,b,c))
                                };
                            });
                            loader.loadHeavyStatus();
                        });
                }
                return loader;
            },
        }
    });

    app.directive('projectDeploymentCard', function(ProjectDeployerProjectUtils, ProjectDeployerDeploymentUtils, DeployerDeploymentTileService, $state) {
        return {
            scope: {
                lightStatus: '=',
                heavyStatus: '='
            },
            templateUrl: '/templates/project-deployer/deployment-card.html',
            replace: true,
            link: function(scope, elem, attrs) {
                scope.dashboardTile = attrs.hasOwnProperty("deploymentDashboardTile");
                function onLightStatusChanged() {
                    if (!scope.dashboardTile) {
                        const bundleId = scope.lightStatus.deploymentBasicInfo.bundleId;
                        const bundle = scope.lightStatus.packages.find(p => p.id === bundleId);

                        scope.bundleOriginInfo = ProjectDeployerProjectUtils.getBundleOriginInfo(bundle.designNodeInfo);

                        scope.automationInfo = {};
                        scope.automationInfo.automationProjectKey = ProjectDeployerDeploymentUtils.getAutomationProject(scope.lightStatus.deploymentBasicInfo);
                        scope.automationInfo.automationUrl = ProjectDeployerDeploymentUtils.getAutomationProjectUrl(scope.lightStatus.infraBasicInfo.automationNodeUrl, scope.automationInfo.automationProjectKey);
                    }
                }

                scope.outcome = {
                    FAILED: "failed",
                    WARNING: "with warnings",
                    RUNNING: "currently running",
                    ABORTED: "aborted",
                    SUCCESS: "successful"
                };

                function getAutomationProjectMonitoringSummary(monitoring) {
                    if (!monitoring) {
                        return {
                            unreachable: true
                        }
                    }
                    if (!monitoring.hasScenarios) {
                        return {
                            noScenarios: true
                        };
                    }
                    if (!monitoring.hasActiveScenarios) {
                        return {
                            noActiveScenarios: true
                        };
                    }

                    const failedRuns = monitoring.failed.length;
                    const warningRuns = monitoring.warning.length;
                    const stillRunningRuns = monitoring.running.length;
                    const abortedRuns = monitoring.aborted.length;
                    const successRuns = monitoring.successful.length;
                    const scenarioLastRuns = {
                        total: failedRuns + warningRuns + stillRunningRuns + abortedRuns + successRuns,
                        highestSeverity: {}
                    };

                    if (failedRuns) {
                        scenarioLastRuns.highestSeverity.value = scope.outcome.FAILED;
                        scenarioLastRuns.highestSeverity.scenarios = monitoring.failed;
                    } else if (warningRuns) {
                        scenarioLastRuns.highestSeverity.value = scope.outcome.WARNING;
                        scenarioLastRuns.highestSeverity.scenarios = monitoring.warning;
                    } else if (stillRunningRuns) {
                        scenarioLastRuns.highestSeverity.value = scope.outcome.RUNNING;
                        scenarioLastRuns.highestSeverity.scenarios = monitoring.running;
                    } else if (abortedRuns) {
                        scenarioLastRuns.highestSeverity.value = scope.outcome.ABORTED;
                        scenarioLastRuns.highestSeverity.scenarios = monitoring.aborted;
                    } else if (successRuns) {
                        scenarioLastRuns.highestSeverity.value = scope.outcome.SUCCESS;
                        scenarioLastRuns.highestSeverity.scenarios = monitoring.successful;
                    }

                    return scenarioLastRuns;
                }

                scope.getSummaryLine = function(scenarioLastRuns) {
                    if (!scenarioLastRuns.highestSeverity.scenarios) return;
                    if (scenarioLastRuns.highestSeverity.scenarios.length < scenarioLastRuns.total) {
                        return `${scenarioLastRuns.total} (${scenarioLastRuns.highestSeverity.scenarios.length} ${scenarioLastRuns.highestSeverity.value})`;
                    }
                    return `${scenarioLastRuns.total}, all ${scenarioLastRuns.highestSeverity.value}`;
                }

                scope.displayScenarioNamesOfHighestSeverity = function(scenarioLastRuns, cap=15) {
                    const scenarioNames = scenarioLastRuns.highestSeverity.scenarios;
                    if (!scenarioNames || scenarioNames.length === scenarioLastRuns.total) return '';
                    let tooltipMsg = scenarioNames.slice(0, cap).join(", ");
                    const hiddenRuns = scenarioNames.length - cap;
                    if (hiddenRuns > 0) {
                        tooltipMsg += " and " + hiddenRuns + " more";
                    }
                    return tooltipMsg;
                }

                scope.redirect = function() {
                    if (attrs.hasOwnProperty("redirectToDeploymentPage")) {
                        $state.go('projectdeployer.deployments.deployment.status', {deploymentId: scope.lightStatus.deploymentBasicInfo.id});
                    }
                }

                scope.$watch('lightStatus', function() {
                    if (scope.lightStatus) {
                        onLightStatusChanged();
                    }
                }, true);

                scope.$watch("heavyStatus", function() {
                    scope.deploymentStatus = DeployerDeploymentTileService.getDeploymentHealth(scope.heavyStatus);
                    if (scope.heavyStatus) {
                        scope.scenarioLastRuns = getAutomationProjectMonitoringSummary(scope.heavyStatus.monitoring);
                    } else {
                        delete scope.scenarioLastRuns;
                    }
                })
            }
        }
    });

    app.directive('projectDeploymentsListWidget', function($state) {
        return {
            scope: {
                deployments: '=projectDeploymentsListWidget',
                statusPage: '=',
                healthMap: '='
            },
            templateUrl: '/templates/project-deployer/deployment-list.html',
            replace: true,
            link: function(scope) {
                scope.redirect = function(deployment) {
                    $state.go('projectdeployer.deployments.deployment.status', {deploymentId: deployment.deploymentBasicInfo.id});
                };
            }
        };
    });

    app.controller('ProjectDeployerDeploymentDashboardController', function($scope, $controller, $state, WT1,
    ProjectDeployerDeploymentService, ProjectDeployerAsyncHeavyStatusLoader) {
        $controller('_DeployerDeploymentDashboardController', {$scope});
        
        if ($scope.isFeatureLocked) return;

        $scope.uiState.query.healthStatusMap = [
            'HEALTHY',
            'WARNING',
            'OUT_OF_SYNC',
            'UNHEALTHY',
            'ERROR',
            'UNKNOWN',
            'LOADING_FAILED'
        ].map(hs => ({
            id: hs,
            $selected: false
        }));
        $scope.orderByExpression = ['projectBasicInfo.id', 'deploymentBasicInfo.bundleId', 'deploymentBasicInfo.id'];

        function filterOnSearchBarQuery(lightStatus) {
            if (!$scope.uiState.query.q) return true;
            const query = $scope.uiState.query.q.toLowerCase();
            return lightStatus.deploymentBasicInfo.publishedProjectKey.toLowerCase().includes(query)
                || lightStatus.deploymentBasicInfo.deployedProjectKey && lightStatus.deploymentBasicInfo.deployedProjectKey.toLowerCase().includes(query)
                || lightStatus.deploymentBasicInfo.bundleId.toLowerCase().includes(query)
                || lightStatus.deploymentBasicInfo.id.toLowerCase().includes(query)
                || lightStatus.deploymentBasicInfo.infraId.toLowerCase().includes(query)
                || lightStatus.projectBasicInfo.name.toLowerCase().includes(query);
        }

        $scope.deploymentIsInUI = function(lightStatus) {
            const selectedProjects = $scope.uiState.query.projects.filter(project => project.$selected);
            const selectedStatuses = $scope.uiState.query.healthStatusMap.filter(hs => hs.$selected);
            const deploymentHealthStatus = $scope.heavyStatusPerDeploymentId[lightStatus.deploymentBasicInfo.id];

            return filterOnSearchBarQuery(lightStatus) &&
                (!selectedProjects.length || selectedProjects.find(project => project.projectBasicInfo.id === lightStatus.deploymentBasicInfo.publishedProjectKey)) &&
                (!$scope.uiState.query.tags.length || $scope.uiState.query.tags.find(tag => lightStatus.deploymentBasicInfo.tags.find(deplTag => deplTag === tag))) &&
                (!selectedStatuses.length || selectedStatuses.find(hs => deploymentHealthStatus && deploymentHealthStatus.health === hs.id));
        };

        $scope.getFilteredDeploymentCount = function(deployments) {
            return deployments.filter(deployment => $scope.deploymentIsInUI(deployment)).length;
        };

        $scope.startCreateDeployment = function() {
            ProjectDeployerDeploymentService.startCreateDeployment().then(function(newDeployment) {
                $state.go('projectdeployer.deployments.deployment.status', {deploymentId: newDeployment.id});
                WT1.event('project-deployer-deployment-create', {deploymentType: 'PROJECT' });
            });
        };

        let loader;
        $scope.$watch("infraStatusList", function(nv) {
            if (!nv) return;
            loader = ProjectDeployerAsyncHeavyStatusLoader.newLoader([].concat(nv), $scope.heavyStatusPerDeploymentId);
            loader.loadHeavyStatus();
        });

        $scope.stillRefreshing = function() {
            return !$scope.globalLightStatusLoaded || !loader || loader.stillRefreshing();
        };

        $scope.$on("$destroy", function() {
            loader.stopLoading();
        });

        $scope.$watch('projectStatusList', function(nv) {
            if (!nv) return;

            $scope.uiState.query.projects = angular.copy($scope.projectStatusList);
        });
    });


    app.controller('ProjectDeployerPackagesPanelController', function($scope, $controller, ProjectDeployerProjectsService, DeployerUtils) {
        $controller("_DeployerPackagesPanelController", {$scope});

        $scope.getPackageDeployments = function(deployments, bundleId) {
            return deployments.filter(d => d.bundleId === bundleId);
        };

        $scope.deployBundle = function(projectStatus, bundleId) {
            ProjectDeployerProjectsService.deployBundle(projectStatus, bundleId, DeployerUtils.DEPLOY_SOURCE.PACKAGE_PANEL);
        };

        $scope.$watch('projectStatusList', function(nv) {
            if (!nv) return;

            $scope.uiState.fullProjectList = $scope.computeFullList(nv);
        });
    });

    app.controller('_ProjectDeployerEditDeploymentController', function($scope, $controller,  DataikuAPI) {
        $controller('_ProjectDeployerDeploymentsBaseController', {$scope: $scope});

        $scope.uiState = $scope.uiState || {};

        // --- Target folder setup ---
        $scope.projectFolderHierarchy = {};
    
        $scope.setFolderHierarchy = function(callback) {
            $scope.projectFolderHierarchy = {};

            if ($scope.deploymentSettings.infraId) {
                DataikuAPI.projectdeployer.infras.getProjectFolderHierarchy($scope.deploymentSettings.infraId).success(rootFolder => {
                    $scope.projectFolderHierarchy = rootFolder;

                    // add necessary elements for using browse-path directive
                    function fixupTree(tree) {
                        const children = tree.children;
                        // add pathElts
                        tree.directory = true;
                        tree.fullPath = tree.id;
                        
                        // remove parent and children
                        const treeWithoutChildren = Object.assign({}, tree, { children: [] });
                        children.forEach(child => {
                            child.parent = treeWithoutChildren;
                            fixupTree(child);
                        })
                    }

                    fixupTree($scope.projectFolderHierarchy);

                    if (typeof callback === 'function') {
                        callback();
                    }
                });
            }
        };

        DataikuAPI.projectdeployer.publishedProjects.listLightStatus()
        .success(projects => {
            $scope.projects = projects;
        })
        .error(setErrorInScope.bind($scope));
    });

    app.controller('_ProjectDeployerDeploymentModalController', function($scope, $controller, $timeout, DataikuAPI, StringUtils, PromiseService) {
        $controller('_ProjectDeployerEditDeploymentController', {$scope: $scope});

        let deploymentIds = [];

        $scope.uiState = $scope.uiState || {};
        angular.extend($scope.uiState, {
            deploymentInfo: {},
            selectedFolder: {},
            selectedProject: {}
        });
        $scope.deploymentSettings = {};
        $scope.deployableProjectStatusList = [];
        

        // --- Project folders

        $scope.canSelect = item => item.canWriteContents;
        $scope.getProjectFolderName = item => item.name;
        $scope.browse = (folderIds) => {
            const ids = folderIds.split('/');
            const destination = ids[ids.length - 1];
            const folder = (destination && searchTree($scope.projectFolderHierarchy, destination)) || $scope.projectFolderHierarchy;
            const pathElts = treeToList(folder, folder => folder.parent).map(f => angular.extend({}, f, { toString: () => f.id }));

            return PromiseService.qToHttp($timeout(() => ({
                exists: true,
                directory: true,
                children: folder.children,
                pathElts: pathElts
            }), 0));
        };
        $scope.canEditFolder = function() {
            return $scope.projectFolderHierarchy.id;
        };

        function setProjectFolder() {
            if ($scope.projectFolderHierarchy && $scope.projectFolderHierarchy.id) {
                $scope.uiState.selectedFolder = $scope.projectFolderHierarchy;

                if ($scope.deploymentSettings.projectFolderId) {
                    const folder = searchTree($scope.projectFolderHierarchy, $scope.deploymentSettings.projectFolderId);

                    if (folder) {
                        $scope.uiState.selectedFolder = folder;
                    } else {
                        $scope.deploymentSettings.projectFolderId = ''; // if we couldnt find the ID, reset it
                    }
                }

                $scope.uiState.selectedFolder.pathElts = $scope.uiState.selectedFolder.parent ? treeToList($scope.uiState.selectedFolder, folder => folder.parent).map(f => f.name).join('/') : '/';
            }
        }
        

        // --- Project/deployment naming ---

        $scope.setDeploymentId = function() {
            if ($scope.deploymentSettings.publishedProjectKey && $scope.deploymentSettings.infraId) {
                $scope.deploymentSettings.id = StringUtils.transmogrify(
                    `${$scope.deploymentSettings.publishedProjectKey}-on-${$scope.deploymentSettings.infraId}`, 
                    deploymentIds, 
                    (count, name) => `${name}-${count}`
                );
            }
        };

        $scope.doesDeploymentIdExist = function(deploymentId) {
            return !deploymentIds.includes(deploymentId);
        };

        // default deployment settings 
        let automationProjectList = null;
        function setAutomationProjects() {
            if ($scope.deploymentSettings.infraId) {
                resetErrorInScope($scope);
                $scope.publishedProjectKeyExistsOnAutomationNode = false;
                return DataikuAPI.projectdeployer.infras.getProjectKeys($scope.deploymentSettings.infraId).success(infraProjects => {
                    automationProjectList = infraProjects;
                    $scope.setTargetProjectKey();
                });
            }
        }

        $scope.setTargetProjectKey = function() {            
            if ($scope.deploymentSettings.publishedProjectKey) {
                const projectList = automationProjectList || ($scope.deploymentSettings.deployedProjectKey ? [$scope.deploymentSettings.deployedProjectKey] : []);

                $scope.deploymentSettings.deployedProjectKey = StringUtils.transmogrify(
                    $scope.deploymentSettings.publishedProjectKey, 
                    projectList,
                    (count, name) => `${name}_${count}`
                );

                $scope.publishedProjectKeyExistsOnAutomationNode = $scope.deploymentSettings.deployedProjectKey !== $scope.deploymentSettings.publishedProjectKey;
            }
        };
        
        $scope.$watch('uiState.selectedProject', function(nv) {
            if (nv && $scope.deploymentSettings) {
                if ($scope.deploymentSettings.publishedProjectKey && $scope.uiState.selectedProject) {
                    $scope.bundles = $scope.uiState.selectedProject.packages;
                }
            }
        });

        $scope.setSelectedProject = function() {
            if ($scope.deployableProjectStatusList) {
                $scope.uiState.selectedProject = $scope.deployableProjectStatusList.find(project => $scope.deploymentSettings && project.projectBasicInfo.id === $scope.deploymentSettings.publishedProjectKey);
            }
        };

        $scope.$watch('projects', function(nv) {
            if (nv) {
                $scope.deployableProjectStatusList = $scope.projects.filter(project => project.packages.length && project.canDeploy);
                $scope.setSelectedProject();
            }
        });
        
        DataikuAPI.projectdeployer.infras.listLightStatus().success(infras => {
            $scope.deployableInfraStatusList = infras.filter(infra => infra.canDeploy);
        }).error(setErrorInScope.bind($scope));

        $scope.$watch('deploymentSettings.infraId', function(nv, ov) {
            if (nv) {
                if (ov || !$scope.deploymentSettings.projectFolderId) {
                    $scope.deploymentSettings.projectFolderId = 'ROOT'; // reset
                }

                setAutomationProjects();
                $scope.setFolderHierarchy(setProjectFolder);
                $scope.setDeploymentId();
            }
        });

        $scope.ok = function() {
            DataikuAPI.projectdeployer.deployments.create($scope.deploymentSettings.id, $scope.deploymentSettings.publishedProjectKey, $scope.deploymentSettings.infraId, $scope.deploymentSettings.bundleId, $scope.deploymentSettings.deployedProjectKey, $scope.deploymentSettings.projectFolderId)
                .success($scope.resolveModal)
                .error(setErrorInScope.bind($scope));
        };

        function setDeployments() {
            DataikuAPI.projectdeployer.deployments.listBasicInfo().success(infras => {
                deploymentIds = infras.deployments.map(d => d.id);
            }).error(setErrorInScope.bind($scope));
        }

        setDeployments();
    });

    app.controller('ProjectDeployerDeploymentCreationModalController', function($scope, $controller, DataikuAPI) {
        $controller('_ProjectDeployerDeploymentModalController', {$scope: $scope});

        $scope.ok = function() {
            DataikuAPI.projectdeployer.deployments.create($scope.deploymentSettings.id, $scope.deploymentSettings.publishedProjectKey, $scope.deploymentSettings.infraId, $scope.deploymentSettings.bundleId, $scope.deploymentSettings.deployedProjectKey, $scope.deploymentSettings.projectFolderId)
                .success($scope.resolveModal)
                .error(setErrorInScope.bind($scope));
        };

        $scope.$watch('deploymentSettings.publishedProjectKey', function(nv) {
            if (nv) {
                $scope.setSelectedProject();
                $scope.setTargetProjectKey();
                $scope.setDeploymentId();
            }
        });
    });

    app.controller('ProjectDeployerDeploymentCopyModalController', function($scope, $controller, DataikuAPI) {
        $controller('_ProjectDeployerDeploymentModalController', {$scope: $scope});

        $scope.ok = function() {
            DataikuAPI.projectdeployer.deployments.copy($scope.oldDeploymentId, $scope.deploymentSettings.id, $scope.deploymentSettings.infraId, $scope.deploymentSettings.deployedProjectKey, $scope.deploymentSettings.projectFolderId)
                .success($scope.resolveModal)
                .error(setErrorInScope.bind($scope));
        };

        $scope.$watch('deploymentSettings.publishedProjectKey', function(nv) {
            if (nv) {
                $scope.setTargetProjectKey();
                $scope.setDeploymentId();
            }
        });
    });

    app.controller('ProjectDeployerDeploymentController', function(TopNav, $scope, $rootScope, $state, $controller,
        ActivityIndicator, CreateModalFromTemplate, WT1, DataikuAPI, DeployerUtils) {
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_PROJECT_DEPLOYER, 'deployments');

        $controller('_DeployerDeploymentController', {$scope});

        $scope.localVariables = {
            asJSON: '{}',
            saved: '{}'
        };

        $scope.deleteWarning = 'The deployed project on the Automation node will not be deleted. You will need to manually delete the project on the Automation node.';

        if (!$scope.deploymentSettings) {
            $scope.getDeploymentSettings();
        }

        $scope.getScenarioRuns = function() {
            const dateFormat = 'YYYY-MM-DD';
            $scope.loadingScenarioRuns = true;
            return DataikuAPI.projectdeployer.deployments.scenarioLastRuns($state.params.deploymentId, moment().subtract(14, 'days').format(dateFormat), moment().add(1, 'days').format(dateFormat))
            .success(scenarioRuns => {
                $scope.scenarioRuns = scenarioRuns;
            }).error(() => {
                $scope.scenarioRuns = $scope.scenarioRuns || {};
            }).finally(() => {
                $scope.loadingScenarioRuns = false;
                addLastRuns();
            });
        };

        function addLastRuns() {
            ($scope.scenarioRuns.rows || []).forEach(function(row) {
                const id = row.uniqueId;
                for (let i = $scope.scenarioRuns.columns.length - 1; i>=0; i--) {
                    const column = $scope.scenarioRuns.columns[i];
                    if (column.actions && column.actions[id]) {
                        const actions = column.actions[id];
                        row.lastRun = {
                            date: column.date,
                            outcome: actions[actions.length - 1].outcome.toLowerCase()
                        };
                        break;
                    }
                }
            });
        }

        $scope.getScenarioRuns();

        $scope.projectDeploymentIsDirty = function() {
            return $scope.localVariables.asJSON !== $scope.localVariables.saved || $scope.deploymentIsDirty();
        };

        $scope.saveProjectDeployment = function() {
            try {
                $scope.deploymentSettings.localVariables = JSON.parse($scope.localVariables.asJSON || '{}');

                return $scope.saveDeployment();
            } catch (err) {
                ActivityIndicator.error("Invalid format: "+err.message);
            }
        };
    
        $scope.saveAndUpdateProjectDeployment = function() {
            const savePromise = $scope.saveProjectDeployment();

            if (savePromise) {
                savePromise.then(function() { $scope.updateOnly(); });
            }
        };

        $scope.updateOnly = function() {
            CreateModalFromTemplate("/templates/project-deployer/deploy-modal.html", $scope, 'ProjectDeployerDeployModalController');
            WT1.event('project-deployer-deployment-update', { deploymentType: 'PROJECT' });
        };

        $scope.copyDeployment = function() {
            if ($scope.deploymentSettings) {
                CreateModalFromTemplate('/templates/project-deployer/copy-deployment-modal.html', $rootScope, null, function(modalScope) {
                    modalScope.oldDeploymentId = $scope.deploymentSettings.id;
                    modalScope.deploymentSettings = {
                        publishedProjectKey: $scope.deploymentSettings.publishedProjectKey,
                    };
                }).then(function(newDeployment) {
                    $state.go('projectdeployer.deployments.deployment.status', {deploymentId: newDeployment.id});
                    WT1.event('project-deployer-deployment-copy', { deploymentType: 'PROJECT' });
                });
            }
        };

        $scope.$watch("lightStatus", function(nv, ov) {
            if ($scope.lightStatus) {
                $scope.getHeavyStatus().error(function(a,b,c) {
                    $scope.heavyStatus = {
                        health: "LOADING_FAILED",
                        healthMessages: DeployerUtils.getFailedHeavyStatusLoadMessage(getErrorDetails(a,b,c))
                    };
                });
            }
        });

        const allowedTransitions = [
            'projectdeployer.deployments.deployment.status',
            'projectdeployer.deployments.deployment.history',
            'projectdeployer.deployments.deployment.settings'
        ];
        checkChangesBeforeLeaving($scope, $scope.projectDeploymentIsDirty, null, allowedTransitions);
    });

    app.controller('ProjectDeployerDeployModalController', function($scope, ProjectDeployerDeploymentSyncHelper, ActivityIndicator) {
        const MODAL_TITLES = {
            IN_PROGRESS: 'Updating project',
            FAILED: 'Project update failed',
            DONE_WITH_WARNINGS: 'Project successfully updated (with warnings)'
        };
        $scope.STEP_STATUS = ProjectDeployerDeploymentSyncHelper.STEP_STATUS;
        $scope.DEPLOY_STEPS = ProjectDeployerDeploymentSyncHelper.DEPLOY_STEPS;
        $scope.DEPLOY_STATUS = ProjectDeployerDeploymentSyncHelper.DEPLOY_STATUS;
        $scope.deployment = {};

        $scope.retryDeploy = function() {
            startDeployment();
        };

        $scope.close = function() {
            const deploymentStatus = $scope.deployment.status;
            if (deploymentStatus === $scope.DEPLOY_STATUS.DONE ||
                deploymentStatus === $scope.DEPLOY_STATUS.DONE_WITH_WARNINGS) {
                let message = 'Deployment updated successfully' +
                    (deploymentStatus === $scope.DEPLOY_STATUS.DONE_WITH_WARNINGS ? ' (with warnings)' : '');
                ActivityIndicator.success(message);
            }
            $scope.dismiss();
            $scope.refreshLightAndHeavy();
            $scope.getScenarioRuns();
            $scope.$destroy();
        };

        function startDeployment() {
            $scope.modalTitle = MODAL_TITLES.IN_PROGRESS;
            ProjectDeployerDeploymentSyncHelper.start($scope, $scope.deploymentSettings, $scope.DEPLOY_STEPS.PREPARE_SYNC, $scope.DEPLOY_STEPS.ACTIVATE_BUNDLE);
        }

        $scope.$on('projectDeploymentUpdate', (event, deployment) => {
            $scope.deployment = deployment;
            $scope.percentage = deployment.progress.current / deployment.progress.end * 100;
            if (deployment.status === $scope.DEPLOY_STATUS.DONE) {
                $scope.close(deployment.status);
            } else {
                $scope.modalTitle = MODAL_TITLES[deployment.status];
            }
        });

        startDeployment();
    });

    app.controller('ProjectDeployerDeploymentSettingsController', function($scope, $controller, DataikuAPI, ProjectDeployerDeploymentUtils, CodeMirrorSettingService, AutomationUtils) {
        $controller('_ProjectDeployerEditDeploymentController', {$scope: $scope});

        $scope.codeMirrorSettingService = CodeMirrorSettingService;
        $scope.AutomationUtils = AutomationUtils;

        angular.extend($scope.uiState, {
            selectedBundle: {},
            connectionNames: [],
            settingsPane: 'information'
        });

        $scope.setupDeploymentUI = function() {
            $scope.localVariables.asJSON = JSON.stringify($scope.deploymentSettings.localVariables, null, 2);
            $scope.localVariables.saved = $scope.localVariables.asJSON;
        };

        // Scenarios
        $scope.allScenariosActive = function () {
            const scenarioIds = Object.keys($scope.deploymentSettings.scenariosToActivate);
            return scenarioIds.length && scenarioIds.every(key => $scope.deploymentSettings.scenariosToActivate[key]);
        };
        
        $scope.toggleScenarios = function () {
            const allActive = $scope.allScenariosActive();

            $scope.uiState.selectedBundle.scenarios.forEach(scenario => {
                $scope.deploymentSettings.scenariosToActivate[scenario.id] = !allActive;
            });
        };

        function setProjectFolderPath() {            
            if ($scope.deploymentSettings.projectFolderId) {
                const folder = searchTree($scope.projectFolderHierarchy, $scope.deploymentSettings.projectFolderId);

                if (folder && folder.parent) {
                    $scope.projectFolderPath = treeToList(folder, folder => folder.parent).map(f => f.name).join('/');
                }
            }
        }

        function getBundleDetails() {
            if ($scope.deploymentSettings.publishedProjectKey && $scope.deploymentSettings.bundleId) {
                // reset selected bundle in case of error
                $scope.uiState.selectedBundle = { usedCodeEnvs: [], scenarios: [] };
                $scope.uiState.connectionNames = [];
                DataikuAPI.projectdeployer.publishedProjects.getBundleDetailsExtended($scope.deploymentSettings.publishedProjectKey, $scope.deploymentSettings.bundleId).success(bundleDetails => {
                    $scope.uiState.selectedBundle = bundleDetails;
                    $scope.uiState.connectionNames = bundleDetails.usedConnections.map(c => c.name); // for suggestions
                    
                    $scope.deploymentSettings.scenariosToActivate = ProjectDeployerDeploymentUtils.getUpdatedScenarioMap($scope.deploymentSettings.scenariosToActivate, bundleDetails.scenarios);
                });
            }
        }

        function setBundleList() {
            if ($scope.bundles || !$scope.deploymentSettings || !$scope.projects) return;

            const project = $scope.projects.find(project => $scope.deploymentSettings && project.projectBasicInfo.id === $scope.deploymentSettings.publishedProjectKey);

            if (project) {
                $scope.bundles = project.packages;
    
                // if a deployment's bundle was deleted, still include it in the list of bundles
                const bundleId = $scope.deploymentSettings.bundleId;
    
                if (!$scope.bundles.some(bundle => bundle.id === bundleId)) {
                    $scope.bundles.unshift({
                        id: bundleId,
                        name: `${bundleId} (deleted)`
                    });
                }
            }
        }

        $scope.$watch('deploymentSettings', function (nv, ov) {
            if (nv) {
                $scope.setupDeploymentUI();
                $scope.setFolderHierarchy(setProjectFolderPath);
            }
        });
                
        $scope.$watch('deploymentSettings.bundleId', function(nv, ov) {
            if (nv) {
                getBundleDetails();
                setBundleList();
            }
        });

        $scope.$watch('projects', function(nv) {
            if (nv) {
                setBundleList();
            }
        });
    });

    app.controller('ProjectDeployerDeploymentStatusController', function(TopNav) {
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_PROJECT_DEPLOYER, 'deployments', null, 'status');
    });

    app.service("ProjectDeployerDeploymentUtils", function() {
        const svc = {};

        svc.getAutomationProject = function(deploymentBasicInfo) {
            return deploymentBasicInfo.deployedProjectKey || deploymentBasicInfo.publishedProjectKey;
        };

        svc.getAutomationProjectUrl = function(baseUrl, projectKey) {
            if (baseUrl.substr(-1) !== '/') {
                baseUrl += '/';
            }

            return `${baseUrl}projects/${projectKey}/`;
        };

        /*
            When switching bundles, check if any of the scenarios
            found in the new bundle already exist in the deployment
            scenarios (from the previous bundle)
            If so, use the same value
        */
        svc.getUpdatedScenarioMap = function(previousBundleScenarios, bundleScenarios) {
            return bundleScenarios.reduce((obj, scenario) => {
                const isExistingScenario = scenario.id in previousBundleScenarios;
                const newScenario = isExistingScenario ? {
                    [scenario.id]: previousBundleScenarios[scenario.id]
                } : {};

                return { ...obj, ...newScenario };
            }, {});
        };

        return svc;
    });

    app.controller('ProjectDeployerDeploymentScenarioRunsController', function($scope, ProjectDeployerDeploymentUtils) {
        const DAYS = 15;
        $scope.columns = Array.from(Array(DAYS)).map((day, index) => { 
            const date = moment().subtract(DAYS - index - 1, 'days');
            
            return {
                date: date.format('YYYY-MM-DD'),
                dow: date.weekday(),
                dateFormatted: date.format('D/M'),
                dateDay: date.format('ddd')
            }
        });

        const automationProjectKey = ProjectDeployerDeploymentUtils.getAutomationProject($scope.lightStatus.deploymentBasicInfo);
        const automationProjectUrl = ProjectDeployerDeploymentUtils.getAutomationProjectUrl($scope.lightStatus.infraBasicInfo.automationNodeUrl, automationProjectKey);

        $scope.getScenarioLastRunsUrl = function(scenarioId) {
            return automationProjectUrl + "scenarios/" + scenarioId + "/runs/list/";
        };

        $scope.getDailyRunsUrl = function(day) {
            return automationProjectUrl + "monitoring/" + day;
        };

        $scope.hovered = {date : null};

        $scope.hover = function(column) {
            $scope.hovered.date = column.date;
        };

        $scope.unhover = function() {
            $scope.hovered.date = null;
        };

        $scope.getCellGlobalOutcome = function(date, id) {
            const outcomes = $scope.scenarioRuns.columns.find(column => column.date === date);
            if (!outcomes || !outcomes.actions[id]) return "";
            if (outcomes.actions[id].some(scenarioOutcome => scenarioOutcome.outcome === "FAILED")) return "failed";
            if (outcomes.actions[id].some(scenarioOutcome => scenarioOutcome.outcome === "WARNING")) return "warning";
            if (outcomes.actions[id].some(scenarioOutcome => scenarioOutcome.outcome === "SUCCESS")) return "success";
            return "aborted";
        };
    });

    app.controller('ProjectDeployerDeploymentHistoryController', function(TopNav) {
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.TOP_PROJECT_DEPLOYER, 'deployments', null, 'history');
    });
    
})();
