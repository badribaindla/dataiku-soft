(function() {
'use strict';

const app = angular.module('dataiku.apideployer');

app.service('APIDeployerAsyncHeavyStatusLoader', function(DataikuAPI, Logger, DeployerUtils) {
    const nbSimultaneousLoading = 2;

    return {
        newLoader: function(deploymentIds, heavyStatusPerDeployment) {
            const loader = {};

            let canLoadStatus = true;
            loader.stopLoading = function() {
                canLoadStatus = false;
            };

            let loading = true;
            loader.stillRefreshing = () => loading;

            let running = 0;
            loader.loadAllHeavyStatus = function() {
                if (!deploymentIds || !deploymentIds.length && !running || !canLoadStatus) {
                    loading = false;
                    return;
                }
                const idListForStatusLoad = deploymentIds.splice(0, nbSimultaneousLoading - running);
                running += idListForStatusLoad.length;
                for (let deploymentId of idListForStatusLoad) {
                    Logger.info("Sending heavy status request for " + deploymentId);
                    DataikuAPI.apideployer.deployments.getHeavyStatus(deploymentId, false).success(function(heavyStatus) {
                        Logger.info("Got heavy status for " + deploymentId + "; health: " + heavyStatus.health);
                        heavyStatusPerDeployment[deploymentId] = heavyStatus;
                        running -= 1;
                        loader.loadAllHeavyStatus();

                    }).error(function(a,b,c) {
                        Logger.warn("Failed to load heavy status for " + deploymentId);
                        heavyStatusPerDeployment[deploymentId] = {
                            health: "LOADING_FAILED",
                            healthMessages: DeployerUtils.getFailedHeavyStatusLoadMessage(getErrorDetails(a,b,c))
                        };
                        running -= 1;
                        loader.loadAllHeavyStatus();
                    });
                }
            };
            return loader;
        }
    }
});

app.directive('apiDeploymentCard', function($state, DataikuAPI, TaggingService, APIDeployerDeploymentUtils,
    DeployerDeploymentTileService) {
    return {
        scope: {
            lightStatus: '=',
            heavyStatus: '=',
            showMonitoring: '=',
        },
        templateUrl: '/templates/api-deployer/deployment-card.html',
        replace: true,
        link: function(scope, elem, attrs) {
            scope.dashboardTile = attrs.hasOwnProperty("deploymentDashboardTile");
            scope.TaggingService = TaggingService;
            scope.APIDeployerDeploymentUtils = APIDeployerDeploymentUtils;
            let loadingSparkline;
            function loadSparkline() {
                if ((scope.deploymentStatus.currentState == "HEALTHY" || scope.deploymentStatus.currentState == "WARNING") &&
                    !loadingSparkline && !scope.lightStatus.failedToLoadSparkline && !scope.heavyStatus.sparkline &&
                    scope.lightStatus.infraBasicInfo.carbonAPIEnabled) {
                    loadingSparkline = true;
                    DataikuAPI.apideployer.deployments.getChartData(scope.lightStatus.deploymentBasicInfo.id, null, "OVERALL_QPS_COMBINED", "SIX_HOURS")
                        .success(function(spkData) {
                            let datapoints;
                            if (spkData[0] && spkData[0].datapoints) {
                                datapoints = spkData[0].datapoints;
                            } else {
                                datapoints = APIDeployerDeploymentUtils.buildZeroDatapoints("SIX_HOURS");
                            }
                            loadingSparkline = false;
                            scope.heavyStatus.sparkline = datapoints.map(x => x[0]);
                    }).error(function(a,b,c) {
                        loadingSparkline = false;
                        scope.lightStatus.failedToLoadSparkline = getErrorDetails(a,b,c);
                    });
                }
            }

            scope.redirect = function() {
                if (attrs.hasOwnProperty("redirectToDeploymentPage")) {
                    $state.go('apideployer.deployments.deployment.status', {deploymentId: scope.lightStatus.deploymentBasicInfo.id});
                }
            }

            scope.$watch('heavyStatus', function() {
                const isDisabled = scope.lightStatus && !scope.lightStatus.deploymentBasicInfo.enabled;
                scope.deploymentStatus = DeployerDeploymentTileService.getDeploymentHealth(scope.heavyStatus, isDisabled);
                if (scope.lightStatus && scope.heavyStatus) {
                    loadSparkline();
                }
            });

            scope.$watch('lightStatus', function() {
                if (scope.lightStatus && scope.heavyStatus) {
                    loadSparkline();
                }
            }, true);
        }
    };
});

app.directive('apiDeploymentsListWidget', function($state, TaggingService) {
    return {
        scope: {
            deployments: '=apiDeploymentsListWidget',
            statusPage: '=',
            healthMap: '='
        },
        templateUrl: '/templates/api-deployer/deployment-list.html',
        replace: true,
        link: function(scope) {
            scope.TaggingService = TaggingService;

            scope.redirect = function(deployment) {
                $state.go('apideployer.deployments.deployment.status', {deploymentId: deployment.id});
            };
        }
    };
});


app.controller('APIDeployerPackagesPanelController', function($scope, $controller, APIDeployerServicesService, APIDeployerDeploymentUtils, TaggingService, DeployerUtils) {
    $controller("_DeployerPackagesPanelController", {$scope});

    $scope.TaggingService = TaggingService;

    $scope.getPackageDeployments = function(deployments, versionId) {
        return deployments.filter(d => APIDeployerDeploymentUtils.getParticipatingVersions(d).includes(versionId));
    }

    $scope.deployVersion = function(serviceStatus, versionId) {
        APIDeployerServicesService.deployVersion(serviceStatus, versionId, DeployerUtils.DEPLOY_SOURCE.PACKAGE_PANEL);
    };

    $scope.$watch("serviceStatusList", function(nv) {
        if (!nv) return;

        $scope.uiState.fullServiceList = $scope.computeFullList(nv);
    });
});

app.controller('APIDeployerDeploymentCopyModalController', function($scope, DataikuAPI, Assert) {
    $scope.newDepl = $scope.newDepl || {};
    DataikuAPI.apideployer.infras.listBasicInfo()
        .success(infraBasicInfoList => {
            $scope.infraBasicInfoList = infraBasicInfoList.infras;
            if ($scope.infraBasicInfoList.length == 1) {
                $scope.newDepl.infraId = $scope.infraBasicInfoList[0].id;
            }
        })
        .error(setErrorInScope.bind($scope));

    DataikuAPI.apideployer.deployments.listBasicInfo()
        .success(deploymentBasicInfoList => {$scope.deploymentIdList = deploymentBasicInfoList.deployments.map(depl => depl.id)})
        .error(setErrorInScope.bind($scope));

    function autoSetDeploymentId() {
        if (!$scope.newDepl.publishedServiceId || !$scope.newDepl.infraId) {
            return;
        }
        let newDeplId = $scope.newDepl.publishedServiceId + '-on-' + $scope.newDepl.infraId;
        let counter = 0;
        while (($scope.deploymentIdList || []).indexOf(newDeplId + (counter ? ('-' + counter) : '')) >= 0) {
            counter++;
        }
        $scope.newDepl.id = newDeplId + (counter ? ('-' + counter) : '');

    }
    $scope.$watch('newDepl.infraId', autoSetDeploymentId);


    $scope.ok = function() {
        DataikuAPI.apideployer.deployments.copy($scope.oldDeplId, $scope.newDepl.id, $scope.newDepl.infraId)
            .success($scope.resolveModal)
            .error(setErrorInScope.bind($scope));
    };
});

app.controller('APIDeployerDeploymentCreationModalController', function($scope, DataikuAPI, Assert) {
    $scope.newDepl = $scope.newDepl || {};

    DataikuAPI.apideployer.infras.listBasicInfo()
        .success(infraBasicInfoList => {
            $scope.infraBasicInfoList = infraBasicInfoList.infras;
            if ($scope.infraBasicInfoList.length == 1) {
                $scope.newDepl.infraId = $scope.infraBasicInfoList[0].id;
            }
        })
        .error(setErrorInScope.bind($scope));

    DataikuAPI.apideployer.publishedAPIServices.listBasicInfo()
        .success(serviceBasicInfoList => {$scope.serviceBasicInfoList = serviceBasicInfoList.services})
        .error(setErrorInScope.bind($scope));

    DataikuAPI.apideployer.deployments.listBasicInfo()
        .success(deploymentBasicInfoList => {$scope.deploymentIdList = deploymentBasicInfoList.deployments.map(depl => depl.id)})
        .error(setErrorInScope.bind($scope));

    function setupVersionsIds() {
        if (!$scope.newDepl.publishedServiceId || !$scope.serviceBasicInfoList) {
            return;
        }
        $scope.versionsIds = [];
        for (let sbi of $scope.serviceBasicInfoList) {
            if (sbi.id == $scope.newDepl.publishedServiceId) {
                $scope.versionsIds = sbi.versionsIds;
                break;
            }
        }
        if (!$scope.versionsIds.includes($scope.newDepl.versionId)) {
            if ($scope.versionsIds.length) {
                $scope.newDepl.versionId = $scope.versionsIds[0];
            } else {
                delete $scope.newDepl.versionId;
            }
        }
    }
    $scope.$watch('newDepl.publishedServiceId', setupVersionsIds);
    $scope.$watch('serviceBasicInfoList', setupVersionsIds);

    function autoSetDeploymentId() {
        if (!$scope.newDepl.publishedServiceId || !$scope.newDepl.infraId) {
            return;
        }
        let newDeplId = $scope.newDepl.publishedServiceId + '-on-' + $scope.newDepl.infraId;
        let counter = 0;
        while (($scope.deploymentIdList || []).indexOf(newDeplId + (counter ? ('-' + counter) : '')) >= 0) {
            counter++;
        }
        $scope.newDepl.id = newDeplId + (counter ? ('-' + counter) : '');

    }
    $scope.$watch('newDepl.publishedServiceId', autoSetDeploymentId);
    $scope.$watch('newDepl.infraId', autoSetDeploymentId);


    $scope.ok = function() {
        DataikuAPI.apideployer.deployments.create($scope.newDepl.id, $scope.newDepl.publishedServiceId, $scope.newDepl.infraId, $scope.newDepl.versionId)
            .success($scope.resolveModal)
            .error(setErrorInScope.bind($scope));
    };
});

app.controller('APIDeployerDeploymentController', function($controller, $scope, $state, WT1, DataikuAPI, Dialogs, Assert,
    APIDeployerDeploymentUtils, CreateModalFromTemplate, FutureProgressModal, StaticDeploymentSyncHelper) {
    $controller('_DeployerDeploymentController', {$scope});

    $scope.unsavedTestQueries =  {} // map endpointId -> json query

    $scope.deleteWarning = 'The deployed API service will not be automatically deleted from the API node. To delete it, please ensure the deployment has been disabled and updated before deleting the deployment.';

    $scope.updateOnly = function(askMode, refreshMode) {
        Assert.trueish($scope.lightStatus);
        if ($scope.lightStatus.infraBasicInfo.type === "K8S") {
            DataikuAPI.apideployer.deployments.executeSyncK8S($scope.lightStatus.deploymentBasicInfo.id).success(function(data) {
                FutureProgressModal.show($scope, data, "Deploying").then(function(result) {
                    $scope.lightStatus.neverEverDeployed = false;
                    $scope.refreshLightAndHeavy();
                });
            }).error(setErrorInScope.bind($scope));
        } else {
            StaticDeploymentSyncHelper.init($scope, $scope.lightStatus, askMode, refreshMode);
        }
        // deployment type is same as infra type in this case
        WT1.event('api-deployer-deployment-update', { deploymentType: $scope.lightStatus.infraBasicInfo.type });
    };

    $scope.copyDeployment = function() {
        if (!$scope.lightStatus || !$scope.lightStatus.deploymentBasicInfo || !$scope.lightStatus.deploymentBasicInfo.id ||
                !$scope.lightStatus.serviceBasicInfo || !$scope.lightStatus.serviceBasicInfo.id) {
            return;
        }
        CreateModalFromTemplate("/templates/api-deployer/copy-deployment-modal.html",
            angular.extend($scope, {oldDeplId: $scope.lightStatus.deploymentBasicInfo.id, newDepl: {publishedServiceId: $scope.lightStatus.serviceBasicInfo.id}})).then(function(newDeployment) {
                $state.go('apideployer.deployments.deployment.status', {deploymentId: newDeployment.id});
                WT1.event('api-deployer-deployment-copy', { deploymentType: newDeployment.type });
        });
    };

    const allowedTransitions = [
        'apideployer.deployments.deployment.status',
        'apideployer.deployments.deployment.history',
        'apideployer.deployments.deployment.settings'
    ];
    checkChangesBeforeLeaving($scope, $scope.deploymentIsDirty, null, allowedTransitions);
});

app.controller('APIDeployerDeploymentStatusController', function($scope, TopNav, DataikuAPI,  DeployerUtils,
    DeployerDeploymentTileService) {
    TopNav.setNoItem();
    TopNav.setLocation(TopNav.TOP_API_DEPLOYER, 'deployments', null, 'status');

    $scope.chartURL = DataikuAPI.apideployer.deployments.chartURL;

    $scope.uiState = {};

    $scope.setCurrentEndpoint = function(endpoint) {
        $scope.currentEndpoint = endpoint;
    };

    $scope.$watch("lightStatus", function(nv, ov) {
        if (nv) {
            $scope.getHeavyStatus().then(function(data) {
                $scope.deploymentStatus = DeployerDeploymentTileService.getDeploymentHealth($scope.heavyStatus, $scope.lightStatus.deploymentBasicInfo.enabled);
                if ($scope.heavyStatus && $scope.heavyStatus.endpoints && $scope.heavyStatus.endpoints.length) {
                    $scope.setCurrentEndpoint($scope.heavyStatus.endpoints[0]);
                }
            }, function(err) {
                $scope.heavyStatus = {
                    health: "LOADING_FAILED",
                    healthMessages: DeployerUtils.getFailedHeavyStatusLoadMessage(getErrorDetails(err.data, err.status, err.headers))
                };
            });
        }
    });

});


app.controller('APIDeployerDeploymentStatusEndpointStatusController', function($scope, $controller, $state, TopNav, DataikuAPI, FutureProgressModal, Assert, CodeMirrorSettingService, DeploymentStatusEndpointSampleCodeGenerator, APIDeployerDeploymentUtils) {
    Assert.trueish($scope.lightStatus);
    Assert.trueish($scope.lightStatus.infraBasicInfo);
    Assert.trueish($scope.heavyStatus);

    $scope.codeMirrorSettingService = CodeMirrorSettingService;

    $scope.epUIState= {
        activeTab: "summary",
        sampleCodeLang: "CURL",
        chartsTimeRange: "SIX_HOURS"
    };
    $scope.chartsTimeRanges = [
        {
            id: 'ONE_HOUR',
            label: '1 hour'
        },
        {
            id: 'SIX_HOURS',
            label: '6 hours'
        },
        {
            id: 'ONE_DAY',
            label: '1 day'
        }
    ];
    $scope.sampleCodeOptions = [
        ["CURL", "Shell (cURL)"],
        ["PYTHON", "Python"],
        ["R", "R"],
        ["JAVA", "Java"]
        //["CSHARP", "C#"],
        //["PHP", "PHP"]
    ];

    if (!$scope.lightStatus.publicAccess && $scope.lightStatus.apiKeys.length) {
        $scope.apiKeyToUse = $scope.lightStatus.apiKeys[0].key;
    }

    function onCodeLangChanged() {
        if ($scope.epUIState.sampleCodeLang && $scope.serviceURLs && $scope.serviceURLs.length > 0) {
            $scope.sampleCode = DeploymentStatusEndpointSampleCodeGenerator.generateSampleCode($scope.lightStatus,
                        $scope.serviceURLs, $scope.endpoint, $scope.epUIState.sampleCodeLang, $scope.heavyStatus);
        } else {
            $scope.sampleCode = '';
        }
    }

    $scope.$watch("epUIState.sampleCodeLang", onCodeLangChanged);
    $scope.$watch("currentEndpoint", function(nv) {
        if (nv) {
            $scope.endpoint = $scope.currentEndpoint;
            $scope.serviceURLs = APIDeployerDeploymentUtils.computeEndpointURLs($scope.lightStatus, $scope.heavyStatus, $scope.endpoint);
            onCodeLangChanged();
            loadCharts($scope.endpoint);
        }
    });

    $scope.$watch("epUIState.chartsTimeRange", function(nv) {
        if (nv && $scope.currentEndpoint) {
            loadCharts($scope.currentEndpoint);
        }
    });

    $scope.$watch("epUIState.activeTab", function(nv, ov) {
        if (nv && ov && nv =="summary") {
            loadCharts($scope.currentEndpoint);
        }
    });

    function cleanupChart(svgId) {
        d3.selectAll('svg#' + svgId + ' > *').remove();
        d3.selectAll('.nvtooltip').remove();
    }

    function displayQPSChart(datapoints, svgId) {
        const data = [{
            key: "QPS",
            values: datapoints,
            color: "rgb(42, 177, 172)"
        },{
            values: datapoints,
            area: true,
            color: "rgba(42, 177, 172, 0.5)"
        }];
        const maxVal = d3.max(datapoints.map(dp => dp.y)) || 10;

        nv.addGraph(function() {
            const chart = nv.models.lineChart().options({
                useInteractiveGuideline:true
            });
            chart.useVoronoi(false);
            chart.showLegend(false);
            chart.margin({top: 5, right: 20, bottom: 20, left: 40});
            chart.xAxis.tickFormat(d => d3.time.format('%H:%M')(new Date(d*1000)));
            chart.yAxis.tickFormat(x => d3.format(',.1f')(x));
            chart.yDomain([0,maxVal])

            d3.select('svg#' + svgId)
                .datum(data)
                .transition().duration(500)
                .call(chart);

            nv.utils.windowResize(chart.update);

            return chart;
        });
    }
    function displayTimeChart(series, svgId) {
        const data = series.map(function(serie, i) {
            return {
                key: serie.target.replace(".totalProcessing.p95", ""),
                max: d3.max(serie.datapoints.map(dp => dp[0])),
                values: serie.datapoints.map(dp => ({x: dp[1], y: dp[0]}))
            }
        });
        const maxVal = d3.max(data.map(serie => serie.max)) || 10;
        nv.addGraph(function() {
            const chart = nv.models.lineChart().options({
                useInteractiveGuideline:true
            });
            chart.showLegend(false);
            chart.useVoronoi(false);
            chart.margin({top: 5, right: 20, bottom: 20, left: 40});
            chart.xAxis.tickFormat(d => d3.time.format('%H:%M')(new Date(d*1000)));
            chart.yAxis.tickFormat(x => d3.format(',.0f')(x) + " ms");
            chart.yDomain([0,maxVal])

            d3.select('svg#' + svgId)
                .datum(data)
                .transition().duration(500)
                .call(chart);

            nv.utils.windowResize(chart.update);

            return chart;
        });
    }

    function loadCharts(endpoint) {
        if ($scope.lightStatus && $scope.lightStatus.deploymentBasicInfo.enabled && $scope.lightStatus.infraBasicInfo.carbonAPIEnabled) {
            // cleanup and reload the queries chart
            delete endpoint.succeededToLoadQueries;
            delete endpoint.failedToLoadQueries;
            cleanupChart('deployment-graph-queries');
            DataikuAPI.apideployer.deployments.getChartData($scope.lightStatus.deploymentBasicInfo.id, endpoint.id, "ENDPOINT_QPS_COMBINED", $scope.epUIState.chartsTimeRange || "SIX_HOURS").success(function(spkData) {
                endpoint.succeededToLoadQueries = true;
                let datapoints;
                if (spkData[0] && spkData[0].datapoints) {
                    datapoints = spkData[0] && spkData[0].datapoints;
                } else {
                    // if no data, fill datapoints with dummy values in order to display the graph anyways
                    datapoints = APIDeployerDeploymentUtils.buildZeroDatapoints($scope.epUIState.chartsTimeRange);
                }
                displayQPSChart(datapoints.map(dp => ({x: dp[1], y: dp[0]})), 'deployment-graph-queries');
            }).error(function(a,b,c) {
                endpoint.failedToLoadQueries = getErrorDetails(a,b,c);
            });
            // cleanup and reload the processingtime chart
            delete endpoint.succeededToLoadTiming;
            delete endpoint.failedToLoadTiming;
            cleanupChart('deployment-graph-processingtime');
            DataikuAPI.apideployer.deployments.getChartData($scope.lightStatus.deploymentBasicInfo.id, endpoint.id, "ENDPOINT_TIMING_SPLIT", $scope.epUIState.chartsTimeRange || "SIX_HOURS").success(function(spkData) {
                endpoint.succeededToLoadTiming = true;
                if (!spkData.length) {
                    spkData.push({
                        target: '',
                        datapoints: APIDeployerDeploymentUtils.buildZeroDatapoints($scope.epUIState.chartsTimeRange)
                    });
                }
                displayTimeChart(spkData, 'deployment-graph-processingtime');
            }).error(function(a,b,c) {
                endpoint.failedToLoadTiming = getErrorDetails(a,b,c);
            });
        }
    }

    $scope.$on("$destroy", function() {
        // ensure chart tooltips get removed when navigating elsewhere
        d3.selectAll('.nvtooltip').remove();
    });
});

app.controller('APIDeployerDeploymentHistoryController', function($scope, TopNav) {
    TopNav.setNoItem();
    TopNav.setLocation(TopNav.TOP_API_DEPLOYER, 'deployments', null, 'history');

    if (!$scope.deploymentSettings) {
        $scope.getDeploymentSettings();
    }
});


app.controller('APIDeployerDeploymentSettingsController', function($scope, $q, TaggingService, TopNav, DataikuAPI,
    CreateModalFromTemplate, GENERATION_MAPPING_STRATEGIES, GENERATION_MAPPING_MODES) {
    TopNav.setNoItem();
    TopNav.setLocation(TopNav.TOP_API_DEPLOYER, 'deployments', null, 'settings');

    $scope.generationsMappingModes = GENERATION_MAPPING_MODES;
    $scope.generationsMappingStrategies = GENERATION_MAPPING_STRATEGIES;

    $scope.uiState = {
        settingsPane: 'general'
    };

    let inlineContainerConfig = {
        name: "inline",
        type: "KUBERNETES",
        baseImageType: "EXEC",
        properties: [],
    };

    $scope.$watch("lightStatus", function() {
        if (!$scope.lightStatus) return;
        DataikuAPI.apideployer.infras.getLightStatus($scope.lightStatus.infraBasicInfo.id)
            .success(function(infraStatus) {
                if (infraStatus.isAdmin && $scope.lightStatus.infraBasicInfo.type === "K8S") {
                    DataikuAPI.apideployer.infras.getSettings($scope.lightStatus.infraBasicInfo.id)
                        .success(infra => {$scope.infra = infra;})
                        .error(setErrorInScope.bind($scope));
                }
            })
            .error(setErrorInScope.bind($scope));
    });

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

    $scope.getAllTags = function () {
        var deferred = $q.defer();
        if (!$scope.hasOwnProperty("allProjectLevelTags")) {
            $scope.allProjectLevelTags = [];
            DataikuAPI.apideployer.deployments.listTags()
                .success(function(data) {
                    $scope.allProjectLevelTags = TaggingService.fillTagsMapFromArray(data);
                    deferred.resolve($scope.allProjectLevelTags);
                })
                .error(() => {
                    setErrorInScope.bind($scope);
                    deferred.resolve($scope.allProjectLevelTags);
                });
        }
        else {
            deferred.resolve($scope.allProjectLevelTags);
        }
        return getRewrappedPromise(deferred);
    };

    $scope.startEditTags  = function() {
        $scope.uiState.newTags = angular.copy($scope.deploymentSettings.tags);
        $scope.uiState.isEditingTags = true;
    };
    
    $scope.cancelEditTags  = function() {
        $scope.uiState.newTags = null;
        $scope.uiState.isEditingTags = false;
    };

    $scope.validateEditTags  = function() {
        if ($scope.uiState.isEditingTags) {
            $scope.deploymentSettings.tags = angular.copy($scope.uiState.newTags);
            $scope.uiState.isEditingTags = false;
        }
    };

    function editApiKey(isNew, apiKey) {
        return CreateModalFromTemplate("/templates/lambda/api-key-modal.html", $scope, null, mScope => { mScope.apiKey = apiKey; });
    }

    $scope.editAPIKey = editApiKey.bind(null, false);
    $scope.newAPIKey = function() {
        const apiKey = {
            createdOn: Date.now(),
            createdBy: $scope.appConfig.login
        };
        editApiKey(true, apiKey).then(k => { $scope.deploymentSettings.auth.apiKeys = $scope.deploymentSettings.auth.apiKeys || []; $scope.deploymentSettings.auth.apiKeys.push(apiKey); });
    };

    if (!$scope.deploymentSettings) {
        $scope.getDeploymentSettings();
    }
});


app.controller('APIDeployerTestQueriesController', function($scope, DataikuAPI, Assert, $stateParams) {
    Assert.inScope($scope, 'endpoint');

    $scope.getHeight =  function(q) {
        return Object.keys(q.features).length + 4;
    };

    function getGenericEndpointType(endpoint) {
        switch(endpoint.type) {
            case "STD_PREDICTION":
            case "CUSTOM_PREDICTION":
            case "CUSTOM_R_PREDICTION":
                return "predict";
            case "R_FUNCTION":
            case "PY_FUNCTION":
                return "function";
            case "SQL_QUERY":
                return "query";
            case "DATASETS_LOOKUP":
                return "lookup";
        }
    }

    $scope.$watch("endpoint", function(nv) {
        if (nv) {
            $scope.genericEndpointType = getGenericEndpointType(nv);
            delete $scope.testQueriesResult;
        }
    });

    $scope.uiState = {
        requestType: "EMPTY",
        queriesBatchSize: 1,
        inputDatasetSmartName: null
    };
    if (!$scope.endpoint.testQueries) {
        $scope.endpoint.testQueries = []
    }

    if ($scope.endpoint.testQueries.length > 0) {
        $scope.uiState.testQueryIndex = 0;
    }

    $scope.addQueries = function(requestType, queriesBatchSize, inputDatasetSmartName) {
        const newIndex = $scope.endpoint.testQueries.length;
        if (requestType === "EMPTY") {
            for (let i = 0; i < queriesBatchSize; i++) {
                $scope.endpoint.testQueries.push($scope.emptyTestQueryTemplate());
            }
        } else if (requestType === "DATASET") {
            DataikuAPI.lambda.services.getSampleQueriesFromDataset($stateParams.projectKey,
                inputDatasetSmartName, $scope.endpoint.modelRef, queriesBatchSize, "HEAD_SEQUENTIAL").success(function(data) {
                $scope.endpoint.testQueries.push.apply($scope.endpoint.testQueries, data);
            }).error(setErrorInScope.bind($scope));
        } else {
            setErrorInScope.bind($scope);
        }
        $scope.uiState.testQueryIndex = newIndex;
    };

    $scope.showTestQuery = function(index) {
        $scope.uiState.showUnsavedTestQuery = false;
        $scope.uiState.testQueryIndex = index;
    };

    $scope.showUnsavedTestQuery = function() {
        $scope.uiState.showUnsavedTestQuery = true;
        delete $scope.uiState.testQueryIndex;
    };

    $scope.getCollectedColumnMappings = function() {
        const mappings = {};
        $scope.endpoint.lookups.forEach(function(lookup) {
            angular.forEach(lookup.columnsMapping, function(v,k) {
                mappings[k] = v;
            });
        });
        return mappings;
    };

    $scope.runTestQueries = function() {
        const deploymentId = $scope.lightStatus.deploymentBasicInfo.id;
        const endpointId = $scope.endpoint.id;
        let unsavedTestQueries = {}
        $.each($scope.unsavedTestQueries, function(k, v) {
            if (v) {
                unsavedTestQueries[k] = { q: $scope.unsavedTestQueries[k] }
            }
        })
        DataikuAPI.apideployer.deployments.runTestQuery(deploymentId, endpointId, $scope.endpoint.testQueries, unsavedTestQueries)
            .success(function(testQueriesResult) {
                $scope.testQueriesResult = testQueriesResult;
            })
            .error(setErrorInScope.bind($scope));
    };
})

app.controller('APIDeployerDeploymentsDashboardController', function($scope, $controller, $state, $filter, WT1, APIDeployerAsyncHeavyStatusLoader, APIDeployerDeploymentUtils, APIDeployerDeploymentService) {
    $controller('_DeployerDeploymentDashboardController', {$scope});

    if ($scope.isFeatureLocked) return;

    $scope.uiState.query.healthStatusMap = [
        'HEALTHY',
        'WARNING',
        'UNHEALTHY',
        'ERROR',
        'UNKNOWN',
        'DISABLED',
        'LOADING_FAILED'
    ].map(hs => ({
        id: hs,
        $selected: false
    }));
    $scope.orderByExpression = ['serviceBasicInfo.id', (deployment) => $filter('deploymentToGenerationList')(deployment.deploymentBasicInfo), '-deploymentBasicInfo.enabled', 'deploymentBasicInfo.id'];
    
    $scope.stillRefreshing = function() {
        return !$scope.globalLightStatusLoaded || !loader || loader.stillRefreshing();
    };

    $scope.hasShownDeployments = function(deployments) {
        return deployments.length;
    };

    $scope.canCreateDeployments = function() {
        return true; //TODO @mad
    };

    $scope.startCreateDeployment = function() {
        APIDeployerDeploymentService.startCreateDeployment().then(function(newDeployment) {
            $state.go('apideployer.deployments.deployment.status', {deploymentId: newDeployment.id});
            WT1.event('api-deployer-deployment-create', {deploymentType: newDeployment.type });
        });
    };

    function filterOnSearchBarQuery(lightStatus) {
        if (!$scope.uiState.query.q) return true;
        const query = $scope.uiState.query.q.toLowerCase();
        return lightStatus.deploymentBasicInfo.publishedServiceId.toLowerCase().includes(query)
            || lightStatus.serviceBasicInfo.name.toLowerCase().includes(query)
            || APIDeployerDeploymentUtils.getParticipatingVersions(lightStatus.deploymentBasicInfo).join(', ').toLowerCase().includes(query)
            || lightStatus.deploymentBasicInfo.id.toLowerCase().includes(query)
            || lightStatus.deploymentBasicInfo.infraId.toLowerCase().includes(query)
            || lightStatus.deploymentBasicInfo.type.toLowerCase().includes(query);
    }

    $scope.deploymentIsInUI = function(lightStatus) {
        const selectedServices = $scope.uiState.query.services.filter(service => service.$selected);
        const selectedStatuses = $scope.uiState.query.healthStatusMap.filter(hs => hs.$selected);
        const deploymentHealthStatus = $scope.heavyStatusPerDeploymentId[lightStatus.deploymentBasicInfo.id];

        return filterOnSearchBarQuery(lightStatus) &&
            (!selectedServices.length || selectedServices.find(service => service.serviceBasicInfo.id === lightStatus.deploymentBasicInfo.publishedServiceId)) &&
            (!$scope.uiState.query.tags.length || $scope.uiState.query.tags.find(tag => lightStatus.deploymentBasicInfo.tags.find(deplTag => deplTag === tag))) &&
            (!selectedStatuses.length || selectedStatuses.find(hs => deploymentHealthStatus && deploymentHealthStatus.health === hs.id || hs.id === 'DISABLED' && !lightStatus.deploymentBasicInfo.enabled));
    };

    $scope.getFilteredDeploymentCountText = function(deployments) {
        const counts = getDeploymentsCounts(deployments.filter(deployment => $scope.deploymentIsInUI(deployment)));

        return (counts.disabled > 0 ? counts.enabled + '/' : '') + counts.total;
    };

    $scope.$watch('serviceStatusList', function(nv) { 
        if (!nv) return;

        $scope.uiState.query.services = angular.copy($scope.serviceStatusList);
    });

    function getDeploymentsCounts(deploymentsStatus) {
        const counts = {
            total: deploymentsStatus.length,
            enabled: deploymentsStatus.filter(ls => ls.deploymentBasicInfo.enabled).length,
        }
        counts.disabled = counts.total - counts.enabled;
        return counts;
    }

    let loader;
    $scope.$watch("deploymentsStatusList", function(nv) {
        if (!nv) return;
        $scope.hasCarbonAPIEnabled = $scope.deploymentsStatusList.some(deployment => deployment.infraBasicInfo.carbonAPIEnabled);
        $scope.deploymentsCounts = getDeploymentsCounts(nv);
        loader = APIDeployerAsyncHeavyStatusLoader.newLoader(nv.filter(_ => _.deploymentBasicInfo.enabled).map(_ => _.deploymentBasicInfo.id),
            $scope.heavyStatusPerDeploymentId);
        loader.loadAllHeavyStatus();
    });

    $scope.$on("$destroy", function() {
        loader.stopLoading();
    });
});


})();
