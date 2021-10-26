(function() {
'use strict';


const app = angular.module('dataiku.admin.clusters', []);

app.controller("ClusterCoreController", function($scope, CreateModalFromTemplate) {
    $scope.openDeleteClusterModal = function(clusterId, actionAfterDeletion) {
        var newScope = $scope.$new();
        newScope.clusterId = clusterId;
        newScope.actionAfterDeletion = actionAfterDeletion || function(){};
        CreateModalFromTemplate("/templates/admin/clusters/delete-cluster-modal.html", newScope, "ClusterDeleteController");
    }

    $scope.getStateDisplayString = function(state) {
        var displayNames = {NONE:'Stopped/Detached', RUNNING:'Running/Attached', STARTING:'Starting/Attaching', STOPPING:'Stopping/Detaching'};
        if (state == null) return null;
        return displayNames[state] || state;
    }
    $scope.getStateDisplayClass = function(state) {
        var classes = {NONE:'text-error', RUNNING:'text-success', STARTING:'text-warning', STOPPING:'text-warning'};
        if (state == null) return null;
        return classes[state];
    }
});

app.controller("ClusterDeleteController", function($scope, Assert, DataikuAPI, FutureProgressModal) {
    $scope.uiState = {stop:true};

    DataikuAPI.admin.clusters.getStatus($scope.clusterId).success(function(data) {
        $scope.clusterStatus = data;
    }).error(setErrorInScope.bind($scope));

    $scope.doesntNeedStop = function() {
        return $scope.clusterStatus && $scope.clusterStatus.clusterType != 'manual' && $scope.clusterStatus.state == 'NONE';
    };
    $scope.mayNeedStop = function() {
        return $scope.clusterStatus && $scope.clusterStatus.clusterType != 'manual' && $scope.clusterStatus.state != 'NONE';
    };

    $scope.delete = function() {
        Assert.inScope($scope, 'clusterStatus');
        if ($scope.mayNeedStop() && $scope.uiState.stop) {
            var parentScope = $scope.$parent;
            DataikuAPI.admin.clusters.stop($scope.clusterId, true).success(function(data){
                $scope.dismiss();
                FutureProgressModal.show(parentScope, data, "Stop cluster", undefined, 'static', 'false').then(function(result){
                    if (result) { // undefined in case of abort
                        $scope.actionAfterDeletion();
                    }
                });
            }).error(setErrorInScope.bind($scope));
        } else {
            DataikuAPI.admin.clusters.delete($scope.clusterId).success(function(data){
                $scope.dismiss();
                $scope.actionAfterDeletion();
            }).error(setErrorInScope.bind($scope));
        }
    };
});

app.controller("ClustersController", function ($scope, $controller, DataikuAPI, CreateModalFromTemplate, TopNav) {
    $controller("ClusterCoreController", {$scope:$scope});

    TopNav.setLocation(TopNav.DSS_HOME, "administration");

    $scope.uiState = {query:null};

    $scope.clusters = [];
    $scope.refreshList = function() {
        DataikuAPI.admin.clusters.list().success(function(data){
            $scope.clusters = data;
        }).error(setErrorInScope.bind($scope));
    };
    $scope.refreshList();

    $scope.createCluster = function() {
        CreateModalFromTemplate("/templates/admin/clusters/new-cluster-modal.html", $scope, "NewClusterController")
    };

    $scope.deleteCluster = function(clusterId) {
        $scope.openDeleteClusterModal(clusterId, $scope.refreshList);
    };
});

app.controller("NewClusterController", function($scope, $rootScope, $state, DataikuAPI) {

    $scope.newCluster = {type:'manual', params: {}};
    $scope.clusterArchitectures = [{id:'HADOOP', label:'Hadoop'}, {id:'KUBERNETES', label:'K8S'}];
    $scope.clusterTypes = [{id:'manual', label:'Non managed', architecture:'MANUAL'}];
    $rootScope.appConfig.customPythonPluginClusters.forEach(function(t) {
        $scope.clusterTypes.push({id:t.clusterType, label:t.desc.meta.label || t.id, architecture:t.desc.architecture || 'HADOOP'})
    });

    $scope.$watch('newCluster.type', function() {
        if ($scope.newCluster.type && $scope.newCluster.type != 'manual') {
            let clusterType = $scope.clusterTypes.filter(function(t) {return $scope.newCluster.type == t.id;})[0];
            $scope.newCluster.architecture = clusterType ? clusterType.architecture : null;
        }
    });
    $scope.create = function(){
        var parentScope = $scope.$parent.$parent;
        DataikuAPI.admin.clusters.create($scope.newCluster).success(function(data){
            $scope.dismiss();
            parentScope.refreshList();
            $state.go("admin.clusters.cluster", {clusterId:data.id});
        }).error(setErrorInScope.bind($scope));
    }
});

app.controller("ClusterController", function($scope, $controller, $stateParams, Assert, DataikuAPI, $state, TopNav, FutureProgressModal, ActivityIndicator, $q, Logs) {
    $controller("ClusterCoreController", {$scope:$scope});

    TopNav.setLocation(TopNav.DSS_HOME, "administration");

    $scope.uiState = {active:'info', logsQuery : ''};

    $scope.cluster = {};
    $scope.origCluster = {};

    $scope.listLogs = function(){
        DataikuAPI.admin.clusters.listLogs($scope.cluster.id).success(function(data) {
            $scope.logs = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.refreshItem = function() {
        DataikuAPI.admin.clusters.get($stateParams.clusterId).success(function(data) {
            $scope.cluster = data;
            $scope.origCluster = angular.copy(data);
            $scope.cluster.params = $scope.cluster.params || {};
            $scope.listLogs();
            $scope.refreshStatus();
        }).error(setErrorInScope.bind($scope));
    };
    $scope.refreshItem();

    $scope.refreshStatus = function() {
        if (!$scope.cluster.canUpdateCluster) return;
        DataikuAPI.admin.clusters.getStatus($stateParams.clusterId).success(function(data) {
            $scope.clusterStatus = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.clusterIsDirty = function() {
        if (!$scope.cluster || !$scope.origCluster) return false;
        return !angular.equals($scope.cluster, $scope.origCluster);
    };

    checkChangesBeforeLeaving($scope, $scope.clusterIsDirty);

    $scope.saveCluster = function() {
        var deferred = $q.defer();
        if (!$scope.clusterIsDirty()) { // for when it's called with a keystroke or from start button
            deferred.resolve("Saved");
            return deferred.promise;
        }
        DataikuAPI.admin.clusters.save(angular.copy($scope.cluster)).success(function(data) {
            $scope.cluster = data;
            $scope.origCluster = angular.copy(data);
            deferred.resolve("Saved");
        }).error(function (a,b,c) {
            setErrorInScope.bind($scope)(a,b,c);
            deferred.reject("Not saved");
        });
        return deferred.promise;
    };

    $scope.deleteCluster = function() {
        $scope.openDeleteClusterModal($scope.cluster.id, function() {
            $state.go("admin.clusters.list");
        });
    };

    const doStartCluster = function(){
        Assert.inScope($scope, 'cluster');
        return DataikuAPI.admin.clusters.start($scope.cluster.id)
            .then(response => FutureProgressModal.show($scope, response.data, "Start cluster", undefined, 'static', 'false'))
            .then(function(result){
                if (result) { // undefined in case of abort
                    result.canUpdateCluster = $scope.cluster.canUpdateCluster; // keep the fields from the ClusterItem
                    result.canManageUsersCluster = $scope.cluster.canManageUsersCluster; // keep the fields from the ClusterItem
                    $scope.cluster = result;
                    $scope.origCluster = angular.copy(result);
                }
             })
            .catch(setErrorInScope.bind($scope));
    };

    const wrapLongClusterOperationRunning = function(operation) {
        return () => {
            if ($scope.isLongClusterOperationRunning) {
                return;
            }
            $scope.isLongClusterOperationRunning = true;
            operation().finally(() => $scope.isLongClusterOperationRunning = false);
        };
    };

    $scope.startCluster = wrapLongClusterOperationRunning(function(){
        return $scope.saveCluster().then(doStartCluster);
    });

    $scope.stopCluster = wrapLongClusterOperationRunning(function(){
        Assert.inScope($scope, 'cluster');
        return DataikuAPI.admin.clusters.stop($scope.cluster.id, false)
            .then(response => FutureProgressModal.show($scope, response.data, "Stop cluster", undefined, 'static', 'false'))
            .then(function(result){
                if (result) { // undefined in case of abort
                    $scope.refreshItem();
                }
             })
            .catch(setErrorInScope.bind($scope));
    });
    $scope.markStoppedCluster = function(){
        Assert.inScope($scope, 'cluster');

        DataikuAPI.admin.clusters.markStopped($scope.cluster.id).success(function(data){
            $scope.refreshItem();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.currentLogName = null;
    $scope.currentLog = null;
    $scope.fetchLog = function(logName) {
    	DataikuAPI.admin.clusters.getLog($scope.cluster.id, logName).success(function(data) {
            $scope.currentLogName = logName;
            $scope.currentLog = data;
        }).error(setErrorInScope.bind($scope));
    };
    $scope.streamLog = function(logName) {
    	Logs.downloadCluster($scope.cluster.id, logName);
    };

    $scope.downloadClusterDiagnostic = function() {
        ActivityIndicator.success("Preparing cluster diagnosis ...");
        downloadURL(DataikuAPI.admin.clusters.getDiagnosisURL($scope.cluster.id));
    };
});

app.directive('clusterParamsForm', function(Assert, $rootScope, PluginConfigUtils) {
    return {
        restrict: 'A',
        templateUrl: '/templates/admin/clusters/cluster-params-form.html',
        scope: {
            params : '=',
            clusterType : '='
        },
        link: function($scope, element, attrs) {
            $scope.$watch('clusterType', function() {
                if (!$scope.clusterType) return;
                $scope.loadedDesc = $rootScope.appConfig.customPythonPluginClusters.filter(function(x){
                    return x.clusterType == $scope.clusterType;
                })[0];

                Assert.inScope($scope, 'loadedDesc');

                $scope.desc = $scope.loadedDesc.desc;

                // put default values in place
                $scope.params.config = $scope.params.config || {};
                PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.params.config);

                $scope.pluginDesc = $rootScope.appConfig.loadedPlugins.filter(function(x){
                    return x.id == $scope.loadedDesc.ownerPluginId;
                })[0];
            });
        }
    };
});

app.directive('clusterActionsForm', function($rootScope, CreateModalFromTemplate) {
    return {
        restrict: 'A',
        templateUrl: '/templates/admin/clusters/cluster-actions-form.html',
        scope: {
            params : '=',
            clusterId : '=',
            clusterType : '='
        },
        link: function($scope, element, attrs) {
            var refreshClusterActions = function() {
                $scope.clusterActions = [];

                const pluginsById = $rootScope.appConfig.loadedPlugins.reduce(function (map, obj) {
                    map[obj.id] = obj;
                    return map;
                }, {});

                $rootScope.appConfig.customRunnables.forEach(function(runnable) {
                    if (!runnable.desc.macroRoles) return;

                    const plugin = pluginsById[runnable.ownerPluginId];
                    if (!plugin) return; // plugin might have been deleted
                    
                    runnable.desc.macroRoles.forEach(function(macroRole) {
                        if (macroRole.type != 'CLUSTER') return;
                        if (macroRole.limitToSamePlugin) {
                            if (!$scope.loadedDesc || runnable.ownerPluginId != $scope.loadedDesc.ownerPluginId) return;
                        }
                        
                        $scope.clusterActions.push({
                            label: runnable.desc.meta.label || runnable.id,
                            icon: runnable.desc.meta.icon || plugin.icon,
                            roleTarget: macroRole.targetParamsKey || macroRole.targetParamsKeys,
                            runnable: runnable
                        });
                    });
                });

                $scope.showCreateRunnable = function(runnable, targetKey, targetValue) {
                    CreateModalFromTemplate('/templates/macros/runnable-modal.html', $scope, null, function(newScope) {
                        newScope.runnable = runnable;
                        newScope.targetKey = targetKey;
                        newScope.targetValue = targetValue;
                        newScope.cluster = true;
                    });
                };
            };
            $scope.$watch('clusterType', function() {
                if (!$scope.clusterType) return;
                $scope.loadedDesc = $rootScope.appConfig.customPythonPluginClusters.filter(function(x){
                    return x.clusterType == $scope.clusterType;
                })[0];

                refreshClusterActions();
            });
        }
    };
});

app.directive('hadoopClusterSettingsBlock', function($rootScope) {
    return {
        restrict: 'A',
        templateUrl: '/templates/admin/clusters/fragments/hadoop-cluster-settings-block.html',
        scope: {
            settings : '=',
            mask : '=',
            impersonationEnabled : '='
        },
        link: function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.addLicInfo = $rootScope.addLicInfo;
        }
    };
});

app.directive('hiveClusterSettingsBlock', function($rootScope, CodeMirrorSettingService) {
    return {
        restrict: 'A',
        templateUrl: '/templates/admin/clusters/fragments/hive-cluster-settings-block.html',
        scope: {
            settings : '=',
            hadoopSettings : '=',
            mask : '=',
            impersonationEnabled : '='
        },
        link: function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.addLicInfo = $rootScope.addLicInfo;
            $scope.codeMirrorSettingService = CodeMirrorSettingService;

            $scope.copyHadoopSettings = function() {
                if (!$scope.settings) return;
                if (!$scope.hadoopSettings) return;

                var hiveProps = $scope.settings.executionConfigsGenericOverrides;
                var hadoopPropsNames = $scope.hadoopSettings.extraConf.map(function(p) {return p.key;});
                // remove existing properties with the names of those we add (avoid duplicates)
                hadoopPropsNames.forEach(function(k) {
                   var indices = hiveProps.map(function(p, i) {return p.key == k ? i : null;}).filter(function(x) {return x != null;});
                   indices.reverse().forEach(function(i) {hiveProps.splice(i, 1);});
                });
                $scope.hadoopSettings.extraConf.forEach(function(p) {
                    var hp = angular.copy(p);
                    hiveProps.push(hp);
                });
                // to make the list's UI refresh
                $scope.settings.executionConfigsGenericOverrides = [].concat(hiveProps)
            };
        }
    };
});

app.directive('impalaClusterSettingsBlock', function($rootScope) {
    return {
        restrict: 'A',
        templateUrl: '/templates/admin/clusters/fragments/impala-cluster-settings-block.html',
        scope: {
            settings : '=',
            mask : '=',
            impersonationEnabled : '='
        },
        link: function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.addLicInfo = $rootScope.addLicInfo;
        }
    };
});

app.directive('sparkClusterSettingsBlock', function(DataikuAPI, $rootScope, FutureProgressModal, ActivityIndicator) {
    return {
        restrict: 'A',
        templateUrl: '/templates/admin/clusters/fragments/spark-cluster-settings-block.html',
        scope: {
            settings : '=',
            hadoopSettings : '=',
            mask : '=',
            impersonationEnabled : '=',
            clusterId : '='
        },
        link: function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.addLicInfo = $rootScope.addLicInfo;

            $scope.executionEngines = [
                                       {value:null, label:'No interactive SparkSQL'},
                                       {value:'SPARK_SUBMIT', label:'CLI (spark-submit)'},
                                       {value:'LIVY_SESSION', label:'Livy (interactive session)', disabled:!$scope.appConfig.livyEnabled},
                                       {value:'LIVY_BATCH', label:'Livy (batch)', disabled:!$scope.appConfig.livyEnabled},
                                       {value:'DATABRICKS', label:'Databricks'},
                                      ];

            $scope.copyHadoopSettings = function() {
                if (!$scope.settings) return;
                if (!$scope.hadoopSettings) return;

                var sparkProps = $scope.settings.executionConfigsGenericOverrides;
                var hadoopPropsNames = $scope.hadoopSettings.extraConf.map(function(p) {return p.key;});
                // remove existing properties with the names of those we add (avoid duplicates)
                hadoopPropsNames.forEach(function(k) {
                   var indices = sparkProps.map(function(p, i) {return p.key == 'spark.hadoop.' + k ? i : null;}).filter(function(x) {return x != null;});
                   indices.reverse().forEach(function(i) {sparkProps.splice(i, 1);});
                });
                $scope.hadoopSettings.extraConf.forEach(function(p) {
                    var sp = angular.copy(p);
                    sp.key = 'spark.hadoop.' + p.key;
                    sparkProps.push(sp);
                });
                // to make the list's UI refresh
                $scope.settings.executionConfigsGenericOverrides = [].concat(sparkProps);
            };
            
            $scope.preloadYarnClusterFiles = function(yarnClusterSettings) {
                DataikuAPI.admin.clusters.preloadYarnClusterFiles(yarnClusterSettings).success(function(data){
                    FutureProgressModal.show($scope, data, "Preload files on cluster", undefined, 'static', 'false').then(function(result) {
                    });
                }).error(setErrorInScope.bind($scope));
            };
            
            $scope.testLivy = function(livySettings) {
                $scope.testedSettings = angular.copy(livySettings);
                $scope.livyTestResult = null;
                DataikuAPI.admin.clusters.testLivy($scope.clusterId, livySettings).success(function(data){
                    FutureProgressModal.show($scope, data, "Test Livy", undefined, 'static', 'false').then(function(result) {
                        $scope.livyTestResult = result;
                    });
                }).error(setErrorInScope.bind($scope));
            };
            $scope.sparkVersionsCompatible = function(dssVersion, livyVersion) {
                if (dssVersion == null || dssVersion.length == 0) dssVersion = $rootScope.appConfig.sparkVersion;
                if (dssVersion == null || dssVersion.length == 0) return true;
                if (livyVersion == null || livyVersion.length == 0) return true;
                return dssVersion.substring(0,2) == livyVersion.substring(0,2)
            };
            $scope.shouldUseYarnCluster = function(sparkMaster, deployMode) {
                if (sparkMaster == 'yarn' && deployMode == 'cluster') return true;
                if (sparkMaster == 'yarn-cluster') return true;
                return false;
            };


            $scope.setRemoteSparkJupyterSupport = function(remoteKernelType, active) {
                DataikuAPI.admin.codeenvs.setRemoteSparkSupport("PYTHON", "__BUILTIN__", remoteKernelType, active).success(function(data) {
                    ActivityIndicator.success("Operation successful");
                }).error(setErrorInScope.bind($scope));
            }
        }
    };
});

app.directive('containerClusterSettingsBlock', function(DataikuAPI, WT1, $rootScope, FutureProgressModal, Dialogs, CodeMirrorSettingService) {
    return {
        restrict: 'A',
        templateUrl: '/templates/admin/clusters/fragments/container-cluster-settings-block.html',
        scope: {
            settings : '=',
            mask : '=',
            impersonationEnabled : '=',
            clusterId : '=',
            k8sClusters: '='
        },
        link: function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.addLicInfo = $rootScope.addLicInfo;
            $scope.codeMirrorSettingService = CodeMirrorSettingService;

            $scope.getNewContainerConfig = function() {
                return {
                    type: 'KUBERNETES',
                    usableBy: 'ALL', allowedGroups: [],
                    dockerResources: [],
                    kubernetesResources: {
                        memRequestMB: -1, memLimitMB: -1,
                        cpuRequest: -1, cpuLimit: -1,
                        customRequests: [], customLimits: [],
                        hostPathVolumes: []
                    },
                    properties: []
                };
            };

            DataikuAPI.security.listGroups(false)
                .success(data => {
                    if (data) {
                        data.sort();
                    }
                    $scope.allGroups = data;
                })
                .error(setErrorInScope.bind($scope));
        
            $scope.isBaseImageNameSuspicious = function(baseImage) {
                return /^(?:[\w-_]+\.)+\w+(?::\d+)?\//.test(baseImage);
            };
            
            var testErrors = {};
            $scope.getTestError = function(config) {
                let s = testErrors[config.name];
                return s != null ? s.fatalAPIError : null;
            };

            $scope.testConf = function(configuration, clusterId) {
                testErrors[configuration.name] = {}; // doesn't need to be a scope for setErrorInScope()
                DataikuAPI.admin.containerExec.testConf(configuration, $scope.clusterId && $scope.clusterId != '__builtin__', clusterId || $scope.clusterId, $scope.settings.executionConfigsGenericOverrides).success(function(data){
                    FutureProgressModal.show($scope, data, "Testing container configuration", undefined, 'static', 'false').then(function(result){
                        if (result) {
                            Dialogs.infoMessagesDisplayOnly($scope, "Container test result", result.messages, result.futureLog);
                        }
                    })
                }).error(setErrorInScope.bind(testErrors[configuration.name]));
                WT1.event('container-conf-test');
            }
            
            $scope.getExtraClusters = function() {
                if (!$scope.k8sClusters) return [];
                return $scope.k8sClusters.filter(function(c) {return (c.id || '__builtin__') != ($scope.clusterId || '__builtin__');});
            };

        }
    };
});

app.directive('clusterSecurityPermissions', function(DataikuAPI, $rootScope, PermissionsService) {
    return {
        restrict : 'A',
        templateUrl : '/templates/admin/clusters/fragments/security-permissions.html',
        replace : true,
        scope : {
                cluster  : '='
        },
        link : function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.ui = {};

            function makeNewPerm(){
                $scope.newPerm = {
                    update: true,
                    use: true
                }
            }
            makeNewPerm();

            const fixupPermissions = function() {
                if (!$scope.cluster) return;
                /* Handle implied permissions */
                $scope.cluster.permissions.forEach(function(p) {
                    p.$updateDisabled = false;
                    p.$manageUsersDisabled = false;
                    p.$useDisabled = false;

                    if ($scope.cluster.usableByAll) {
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
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.cluster, $scope.allGroups);
            }).error(setErrorInScope.bind($scope));

            $scope.$watch("cluster.owner", function() {
                $scope.ui.ownerLogin = $scope.cluster.owner;
            });

            $scope.addPermission = function() {
                $scope.cluster.permissions.push($scope.newPerm);
                makeNewPerm();
            };

            $scope.$watch("cluster.usableByAll", function(nv, ov) {
                fixupPermissions();
            })
            $scope.$watch("cluster.permissions", function(nv, ov) {
                if (!nv) return;
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.cluster, $scope.allGroups);
                fixupPermissions();
            }, true)
            $scope.$watch("cluster.permissions", function(nv, ov) {
                if (!nv) return;
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.cluster, $scope.allGroups);
                fixupPermissions();
            }, false)
            $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.cluster, $scope.allGroups);
            fixupPermissions();

            // Ownership mgmt
            $scope.$watch("ui.ownerLogin", function() {
                PermissionsService.transferOwnership($scope, $scope.cluster, "cluster");
            });


        }
    };
});

})();