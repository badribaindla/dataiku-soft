(function() {
'use strict';

var app = angular.module('dataiku.admin.codeenvs.automation', []);


app.controller("AdminCodeEnvsAutomationController", function($scope, TopNav, DataikuAPI, Dialogs, FutureProgressModal, CreateModalFromTemplate, ActivityIndicator) {
    $scope.openDeleteEnvModal = function(envLang, envName){
        var newScope = $scope.$new();
        newScope.envLang = envLang;
        newScope.envName = envName;
        // modal appears when usages are ready
        DataikuAPI.admin.codeenvs.automation.listUsages(newScope.envLang, newScope.envName).success(function(data){
            newScope.usagesList = data;
            // group by type / project
            newScope.usageByType = {};
            newScope.usageByProject = {};
            newScope.usagesList.forEach(function(usage) {
                if (usage.envUsage) {
                    newScope.usageByType[usage.envUsage] = newScope.usageByType[usage.envUsage] || [];
                    newScope.usageByType[usage.envUsage].push(usage);
                }
                if (usage.projectKey) {
                    newScope.usageByProject[usage.projectKey] = newScope.usageByProject[usage.projectKey] || [];
                    newScope.usageByProject[usage.projectKey].push(usage);
                }
            });
            CreateModalFromTemplate("/templates/admin/code-envs/common/delete-env-modal.html", newScope, "AdminCodeEnvsAutomationDeleteController")
        }).error(setErrorInScope.bind($scope));
    }

    $scope.canCreateCodeEnv = function() {
        return $scope.appConfig.admin || $scope.appConfig.globalPermissions.mayCreateCodeEnvs || $scope.appConfig.globalPermissions.mayManageCodeEnvs;
    };

    $scope.getEnvDiagnostic = function(envLang, envName) {
        ActivityIndicator.success("Generating code env diagnostic ...");
        downloadURL(DataikuAPI.admin.codeenvs.automation.getDiagnosticURL(envLang, envName));
    };
});

app.controller("AdminCodeEnvsAutomationListController", function($scope, $controller, TopNav, DataikuAPI, Dialogs, CreateModalFromTemplate, $state) {
    $controller("AdminCodeEnvsAutomationController", {$scope:$scope});
	TopNav.setLocation(TopNav.DSS_HOME, "administration");

	var buildKernelSpecField = function(env) {
        if (env.currentVersion) {
            env.kernelSpecName = env.currentVersion.kernelSpecName;
        } else if (env.noVersion) {
            env.kernelSpecName = env.noVersion.kernelSpecName;
        } else if (env.versions) {
            var names = [];
            env.versions.forEach(function(ver) {
                angular.forEach(ver.kernelSpecNames, function(v, k) {names.push(k);});
            });
            env.kernelSpecName = names.join(', ');
        }
	};
    $scope.refreshList = function() {
        return DataikuAPI.admin.codeenvs.automation.list().success(function(data) {
            $scope.codeEnvs = data;
            $scope.codeEnvs.forEach(function(env) {buildKernelSpecField(env);});
        }).error(setErrorInScope.bind($scope));
    };
    $scope.refreshList();

    const YOU_DONT_REALLY_WANT_TO_CREATE =
            "Manually creating code envs in automation nodes is <strong>not recommended</strong>. The recommended way to manage " +
            "code envs in automation is to let bundle preload take care of it: simply preload and activate bundles " + 
            "and the required code envs will be automatically managed.<br /><strong>Manually created code envs may not be entirely "+
            "functional</strong>.";

    const YOU_DONT_REALLY_WANT_TO_IMPORT =
            "Manually importing code envs in automation nodes is <strong>not recommended</strong>. The recommended way to manage " +
            "code envs in automation is to let bundle preload take care of it: simply preload and activate bundles " + 
            "and the required code envs will be automatically managed.<br /><strong>Manually imported code envs may not be entirely "+
            "functional</strong>.";

    $scope.openNewPythonEnvModal = function(){
        Dialogs.confirm($scope, "Really create a new Python env?", YOU_DONT_REALLY_WANT_TO_CREATE).then(function(){
            CreateModalFromTemplate("/templates/admin/code-envs/automation/new-python-env-modal.html", $scope, "AdminCodeEnvsAutomationNewPythonController")
        });
    }
    $scope.openNewREnvModal = function(){
        Dialogs.confirm($scope, "Really create a new R env?", YOU_DONT_REALLY_WANT_TO_CREATE).then(function(){
            CreateModalFromTemplate("/templates/admin/code-envs/automation/new-R-env-modal.html", $scope, "AdminCodeEnvsAutomationNewRController")
        });
    }
    $scope.openImportEnvModal = function(){
        Dialogs.confirm($scope, "Really import a code env?", YOU_DONT_REALLY_WANT_TO_IMPORT).then(function(){
            CreateModalFromTemplate("/templates/admin/code-envs/automation/import-env-modal.html", $scope, "AdminCodeEnvsAutomationImportController")
        });
    }
    $scope.actionAfterDeletion = function() {
        $scope.refreshList();
    };
    $scope.goToEditIfExists = function(envName) {
        const env = $scope.codeEnvs.find(e => e.envName === envName);
        if(env && env.envLang === 'R') {
            $state.go("admin.codeenvs-automation.r-edit", { envName });
        } else if(env && env.envLang === 'PYTHON'){
            $state.go("admin.codeenvs-automation.python-edit", { envName });
        }
    };
});

app.controller("AdminCodeEnvsAutomationDeleteController", function($scope, TopNav, DataikuAPI, Dialogs, FutureProgressModal, $q) {
    $scope.delete = function() {
        var parentScope = $scope.$parent;
        DataikuAPI.admin.codeenvs.automation.delete($scope.envLang, $scope.envName).success(function(data){
            $scope.dismiss();
            FutureProgressModal.show(parentScope, data, "Env deletion").then(function(result){
                const infoModalClosed = result
                    ? Dialogs.infoMessagesDisplayOnly(parentScope, "Deletion result", result.messages, result.futureLog)
                    : $q.resolve();
                infoModalClosed.then(() => $scope.actionAfterDeletion());
            });
        }).error(setErrorInScope.bind($scope));

    };
});

app.controller("AdminCodeEnvsAutomationNewPythonController", function($scope, TopNav, DataikuAPI, Dialogs, FutureProgressModal, $q) {
    $scope.newEnv = {
            deploymentMode: "AUTOMATION_SINGLE",
            pythonInterpreter: "PYTHON36",
            conda: false,
            installCorePackages: true,
            // corePackagesSet : "PANDAS10", // let the backend decide
            installJupyterSupport: true
    };

    $scope.deploymentModes = [
                              ["AUTOMATION_VERSIONED", "Managed and versioned (recommended)"],
                              ["AUTOMATION_SINGLE", "Managed, non versioned"],
                              ["AUTOMATION_NON_MANAGED_PATH", "Externally-managed"],
                              ["EXTERNAL_CONDA_NAMED", "Named external Conda env"]
                          ];

    $scope.$watch("newEnv.conda", function(nv) {
        if (nv === true) {
            $scope.pythonInterpreters = [
                ["PYTHON27", "Python 2.7"],
                // ["PYTHON34", "Python 3.4"],
                ["PYTHON35", "Python 3.5"],
                ["PYTHON36", "Python 3.6"],
                ["PYTHON37", "Python 3.7"],
            ]
        } else if (nv === false) {
            $scope.pythonInterpreters = [
                ["PYTHON27", "Python 2.7 (from PATH)"],
                // ["PYTHON34", "Python 3.4 (from PATH)"],
                ["PYTHON35", "Python 3.5 (from PATH)"],
                ["PYTHON36", "Python 3.6 (from PATH)"],
                ["PYTHON37", "Python 3.7 (from PATH)"],
                ["CUSTOM", "Custom (lookup in PATH)"]
            ]
        }
    });

    $scope.create = function(){
        var parentScope = $scope.$parent.$parent;
        DataikuAPI.admin.codeenvs.automation.create("PYTHON", $scope.newEnv).success(function(data){
            $scope.dismiss();
            FutureProgressModal.show(parentScope, data, "Env creation").then(function(result){
                const modalClosed = result
                    ? Dialogs.infoMessagesDisplayOnly(parentScope, "Creation result", result.messages, result.futureLog, undefined, 'static', false)
                    : $q.resolve();

                const refreshed = parentScope.refreshList();

                $q.all([modalClosed, refreshed]).then(() => {
                    parentScope.goToEditIfExists(result && result.envName);
                });
            });
        }).error(setErrorInScope.bind($scope));
    }
});

app.controller("AdminCodeEnvsAutomationNewRController", function($scope, TopNav, DataikuAPI, Dialogs, FutureProgressModal, $q) {
    $scope.newEnv = {
            deploymentMode: "AUTOMATION_SINGLE",
            conda: false,
            installCorePackages: true,
            installJupyterSupport: true
        };

    $scope.deploymentModes = [
                              ["AUTOMATION_VERSIONED", "Managed and versioned (recommended)"], // versioned is only created/modified by bundles
                              ["AUTOMATION_SINGLE", "Managed, non versioned"],
                              ["AUTOMATION_NON_MANAGED_PATH", "Externally-managed"],
                              ["EXTERNAL_CONDA_NAMED", "Named external Conda env"]
                          ];

    $scope.create = function(){
        var parentScope = $scope.$parent.$parent;
        DataikuAPI.admin.codeenvs.automation.create("R", $scope.newEnv).success(function(data){
            $scope.dismiss();
            FutureProgressModal.show(parentScope, data, "Env creation").then(function(result){
                const modalClosed = result
                    ? Dialogs.infoMessagesDisplayOnly(parentScope, "Creation result", result.messages, result.futureLog, undefined, 'static', false)
                    : $q.resolve();

                const refreshed = parentScope.refreshList();

                $q.all([modalClosed, refreshed]).then(() => {
                    parentScope.goToEditIfExists(result && result.envName);
                });
            });
        }).error(setErrorInScope.bind($scope));
    }
});

app.controller("AdminCodeEnvsAutomationImportController", function($scope, $state, $stateParams, Assert, TopNav, DataikuAPI, FutureProgressModal, Dialogs, Logs, $q) {
    $scope.newEnv = {}

    $scope.import = function() {
        Assert.trueish($scope.newEnv.file, "No code env file");

        const parentScope = $scope.$parent.$parent;
        DataikuAPI.admin.codeenvs.automation.import($scope.newEnv.file).then(function(data) {
            $scope.dismiss();
            FutureProgressModal.show(parentScope, JSON.parse(data), "Env import").then(function(result) {
                const modalClosed = result
                    ? Dialogs.infoMessagesDisplayOnly(parentScope, "Creation result", result.messages, result.futureLog, undefined, 'static', false)
                    : $q.resolve();

                const refreshed = parentScope.refreshList();

                $q.all([modalClosed, refreshed]).then(() => {
                    parentScope.goToEditIfExists(result && result.envName);
                });
            });
        }, function(payload) {
            setErrorInScope.bind($scope)(JSON.parse(payload.response), payload.status, function(h) {return payload.getResponseHeader(h)});
        });
    }
});

app.controller("AdminCodeEnvsAutomationImportVersionController", function($scope, $state, $stateParams, Assert, TopNav, DataikuAPI, FutureProgressModal, Dialogs, Logs) {
    $scope.newEnv = {}

    $scope.import = function() {
        Assert.trueish($scope.newEnv.file, "No code env file");

        const parentScope = $scope.$parent.$parent;
        DataikuAPI.admin.codeenvs.automation.importVersion($scope.newEnv.file, $scope.envLang, $scope.envName).then(function(data) {
            $scope.dismiss();
            FutureProgressModal.show(parentScope, JSON.parse(data), "Env import").then(function(result) {
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly(parentScope, "Import result", result.messages, result.futureLog);
                    $scope.addImportedVersion(result.version);
                }
            });
        }, function(payload) {
            setErrorInScope.bind($scope)(JSON.parse(payload.response), payload.status, function(h) {return payload.getResponseHeader(h)});
        });
    }
});

app.controller("_AdminCodeEnvsAutomationEditController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, FutureProgressModal, Dialogs, Logs, CreateModalFromTemplate) {
    $controller("AdminCodeEnvsAutomationController", {$scope:$scope});
    TopNav.setLocation(TopNav.DSS_HOME, "administration");

     $scope.uiState = {
        active : 'info',
        upgradeAllPackages: true
     };

     $scope.actionAfterDeletion = function() {
         $state.go("admin.codeenvs-automation.list");
     };

     $scope.canBeUpdated = function() {
         return $scope.codeEnv && $scope.codeEnv.canUpdateCodeEnv && ['DESIGN_MANAGED', 'PLUGIN_MANAGED', 'AUTOMATION_SINGLE'].indexOf($scope.codeEnv.deploymentMode) >= 0;
     };
     $scope.canVersionBeUpdated = function(versionId) {
         return ['AUTOMATION_VERSIONED'].indexOf($scope.codeEnv.deploymentMode) >= 0 || $scope.canBeUpdated();
     };

     $scope.getSingleVersion = function(codeEnv) {
         if (codeEnv && codeEnv.currentVersion) {
             return codeEnv.currentVersion.versionId;
         } else if (codeEnv && codeEnv.noVersion) {
             return codeEnv.noVersion.versionId;
         } else {
             return null;
         }
     };

     var makeDiffedDesc = function(desc) {
         return {
             yarnPythonBin: desc.yarnPythonBin,
             yarnRBin: desc.yarnRBin,
             allContainerConfs: desc.allContainerConfs,
             containerConfs: desc.containerConfs,
             allSparkKubernetesConfs: desc.allSparkKubernetesConfs,
             sparkKubernetesConfs: desc.sparkKubernetesConfs
         };
     };
     var makeDiffedVersion = function(version) {
         return {
             specCondaEnvironment: version.specCondaEnvironment,
             specPackageList: version.specPackageList,
             desc: makeDiffedDesc(version.desc)
          };
     };
     var makeDiffedSpec = function(codeEnv) {
         var spec = {};
         if (codeEnv) {
             spec.desc = codeEnv.desc;
             spec.externalCondaEnvName = codeEnv.externalCondaEnvName;
             if (codeEnv.currentVersion) {
                 spec.currentVersion = makeDiffedVersion(codeEnv.currentVersion);
             }
             if (codeEnv.noVersion) {
                 spec.noVersion = makeDiffedVersion(codeEnv.noVersion);
             }
             if (codeEnv.versions) {
                 spec.versions = codeEnv.versions.map(function(v) {return makeDiffedVersion(v);});
             }
             spec.permissions = angular.copy(codeEnv.permissions);
             spec.envSettings = angular.copy(codeEnv.envSettings);
             spec.usableByAll = codeEnv.usableByAll;
             spec.owner = codeEnv.owner;
         }
         return spec;
     };

     $scope.specIsDirty = function() {
         if (!$scope.codeEnv) return false;
         var currentSpec = makeDiffedSpec($scope.codeEnv);
         return !angular.equals(currentSpec, $scope.previousSpec);
     };
     $scope.versionSpecIsDirty = function(versionId) {
         if (!$scope.codeEnv) return false;
         var idx = -1;
         $scope.codeEnv.versions.forEach(function(v, i) {if (v.versionId == versionId) {idx = i;}});
         if (idx < 0) {
             return false;
         } else {
             var currentSpec = makeDiffedVersion($scope.codeEnv.versions[idx]);
             return !angular.equals(currentSpec, $scope.previousSpec.versions[idx]);
         }
     };
    checkChangesBeforeLeaving($scope, $scope.specIsDirty);

    $scope.previousSpec = makeDiffedSpec($scope.codeEnv);

    var listLogs = function(){
        DataikuAPI.admin.codeenvs.automation.listLogs($scope.envLang, $stateParams.envName).success(function(data) {
            $scope.logs = data;
        }).error(setErrorInScope.bind($scope));
    };

    var refreshEnv = function(){
        DataikuAPI.admin.codeenvs.automation.get($scope.envLang, $stateParams.envName).success(function(data) {
            $scope.codeEnv = data;
            $scope.previousSpec = makeDiffedSpec($scope.codeEnv);
        }).error(setErrorInScope.bind($scope));
        listLogs();
    }
    var refreshEnvVersion = function(versionId){
        DataikuAPI.admin.codeenvs.automation.getVersion($scope.envLang, $stateParams.envName, versionId).success(function(data) {
            var idx = -1;
            $scope.codeEnv.versions.forEach(function(v, i) {if (v.versionId == versionId) {idx = i;}});
            if (idx >= 0) {
                $scope.codeEnv.versions[idx] = data;
                $scope.previousSpec.versions[idx] = makeDiffedVersion(data);
            }
        }).error(setErrorInScope.bind($scope));
    }
    refreshEnv();

    $scope.fetchNonManagedEnvDetails = function(){
        DataikuAPI.admin.codeenvs.automation.fetchNonManagedEnvDetails($scope.envLang, $stateParams.envName).success(function(data) {
            $scope.nonManagedEnvDetails = data;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.installJupyterSupport = function(versionId){
        DataikuAPI.admin.codeenvs.automation.installJupyterSupport($scope.envLang, $stateParams.envName, versionId).success(function(data) {
            FutureProgressModal.show($scope, data, "Env update").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                }
                if (versionId) {
                    refreshEnvVersion(versionId);
                } else {
                    refreshEnv();
                }
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.removeJupyterSupport = function(versionId) {
        DataikuAPI.admin.codeenvs.automation.removeJupyterSupport($scope.envLang, $stateParams.envName, versionId).success(function(data) {
            FutureProgressModal.show($scope, data, "Env update").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                }
                if (versionId) {
                    refreshEnvVersion(versionId);
                } else {
                    refreshEnv();
                }
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.updateEnv = function(upgradeAllPackages, forceRebuildEnv, versionToUpdate) {
        var updateSettings = {
            forceRebuildEnv: forceRebuildEnv,
            versionToUpdate: versionToUpdate
        }
        DataikuAPI.admin.codeenvs.automation.update($scope.envLang, $stateParams.envName, updateSettings).success(function(data) {
            FutureProgressModal.show($scope, data, "Env update").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                }
                if (versionToUpdate) {
                    refreshEnvVersion(versionToUpdate);
                } else {
                    refreshEnv();
                }
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.saveAndMaybePerformChanges = function(performChangesOnSave){
        DataikuAPI.admin.codeenvs.automation.save($scope.envLang, $stateParams.envName, $scope.codeEnv).success(function(data) {
            refreshEnv();
            if (performChangesOnSave) {
                $scope.updateEnv(false);
            }
        }).error(setErrorInScope.bind($scope));
    }

    $scope.saveVersionAndMaybePerformChanges = function(performChangesOnSave, version){
        DataikuAPI.admin.codeenvs.automation.saveVersion($scope.envLang, $stateParams.envName, version.versionId, version).success(function(data) {
            refreshEnvVersion(version.versionId);
            if (performChangesOnSave) {
                $scope.updateEnv(false, false, version.versionId);
            }
        }).error(setErrorInScope.bind($scope));
    }

    $scope.setContainerConfForAllVersions = function(origVersion) {
        $scope.codeEnv.versions.forEach(function(v) {
            v.desc.allContainerConfs = origVersion.desc.allContainerConfs;
            v.desc.containerConfs = origVersion.desc.containerConfs;
            v.desc.allSparkKubernetesConfs = origVersion.desc.allSparkKubernetesConfs;
            v.desc.sparkKubernetesConfs = origVersion.desc.sparkKubernetesConfs;
        });
    }

    $scope.getLog = DataikuAPI.admin.codeenvs.automation.getLog;
    $scope.downloadLog = Logs.downloadAutomationCodeEnv;

    $scope.openImportEnvVersionModal = function(){
        CreateModalFromTemplate("/templates/admin/code-envs/automation/import-env-version-modal.html", $scope, "AdminCodeEnvsAutomationImportVersionController", function(newScope) {
            newScope.envName = $stateParams.envName;
            newScope.envLang = $scope.envLang;
            newScope.addImportedVersion = function(version) {
                if (version == null) return; // aborted? failed?
                // put new version first (bc it's the most recent)
                $scope.codeEnv.versions.splice(0, 0, version);
                $scope.previousSpec.versions.splice(0, 0, makeDiffedVersion(version));
            };
        });
    }
});

app.controller("AdminCodeEnvsAutomationPythonEditController", function($scope, $controller,$state, $stateParams, TopNav, DataikuAPI, FutureProgressModal, Dialogs) {
    $scope.envLang = "PYTHON";
    $controller("_AdminCodeEnvsAutomationEditController", {$scope:$scope});
});

app.controller("AdminCodeEnvsAutomationREditController", function($scope, $controller,$state, $stateParams, TopNav, DataikuAPI, FutureProgressModal, Dialogs) {
    $scope.envLang = "R";
    $controller("_AdminCodeEnvsAutomationEditController", {$scope:$scope});
});

app.directive('pythonVersion', function(DataikuAPI, $state, $stateParams, $rootScope) {
    return {
        restrict : 'A',
        templateUrl : '/templates/admin/code-envs/automation/python-version.html',
        scope : {
                version : '=pythonVersion',
                updateEnv : '&' ,
                saveVersion : '&' ,
                versionSpecIsDirty : '&',
                installJupyterSupport : '&',
                removeJupyterSupport : '&',
                editable : '=',
                withSaveUpdate : '=',
                canVersionBeUpdated : '&'
        },
        link : function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.updateVersionEnv = function(updateAllPackages, forceRebuildEnv) {
                $scope.updateEnv()(updateAllPackages, forceRebuildEnv, $scope.version.versionId);
            }
            $scope.saveVersionEnv = function(performChangesOnSave) {
                $scope.saveVersion()(performChangesOnSave, $scope.version);
            }
            $scope.installJupyterSupportVersion = function() {
                $scope.installJupyterSupport()($scope.version.versionId);
            }
            $scope.specIsDirty = function() {
                return $scope.versionSpecIsDirty()($scope.version.versionId);
            }
            $scope.canBeUpdated = function() {
                return $scope.canVersionBeUpdated()($scope.version.versionId);
            }
            $scope.removeJupyterSupportVersion = function() {
                $scope.removeJupyterSupport()($scope.version.versionId);
            }
        }
    };
});

app.directive('rVersion', function(DataikuAPI, $state, $stateParams, $rootScope) {
    return {
        restrict : 'A',
        templateUrl : '/templates/admin/code-envs/automation/R-version.html',
        scope : {
                version : '=rVersion',
                updateEnv : '&',
                saveVersion : '&' ,
                versionSpecIsDirty : '&',
                installJupyterSupport : '&',
                removeJupyterSupport : '&',
                editable : '=',
                withSaveUpdate : '=',
                canVersionBeUpdated : '&'
        },
        link : function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.updateVersionEnv = function(updateAllPackages, forceRebuildEnv) {
                $scope.updateEnv()(updateAllPackages, forceRebuildEnv, $scope.version.versionId);
            }
            $scope.saveVersionEnv = function(performChangesOnSave) {
                $scope.saveVersion()(performChangesOnSave, $scope.version);
            }
            $scope.installJupyterSupportVersion = function() {
                $scope.installJupyterSupport()($scope.version.versionId);
            }
            $scope.specIsDirty = function() {
                return $scope.versionSpecIsDirty()($scope.version.versionId);
            }
            $scope.canBeUpdated = function() {
                return $scope.canVersionBeUpdated()($scope.version.versionId);
            }
            $scope.removeJupyterSupportVersion = function() {
                $scope.removeJupyterSupport()($scope.version.versionId);
            }
        }
    };
});

app.directive('containerVersion', function(DataikuAPI, $state, $stateParams, $rootScope, $timeout) {
    return {
        restrict : 'A',
        templateUrl : '/templates/admin/code-envs/automation/container-version.html',
        scope : {
            version : '=containerVersion',
            updateEnv : '&' ,
            saveVersion : '&' ,
            versionSpecIsDirty : '&',
            withSaveUpdate : '=',
            canVersionBeUpdated : '&',
            setForAllVersions: '&'
        },
        link : function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;
            $scope.updateVersionEnv = function(updateAllPackages, forceRebuildEnv) {
                $scope.updateEnv()(updateAllPackages, forceRebuildEnv, $scope.version.versionId);
            }
            $scope.saveVersionEnv = function(performChangesOnSave) {
                $scope.saveVersion()(performChangesOnSave, $scope.version);
            }
            $scope.specIsDirty = function() {
                return $scope.versionSpecIsDirty()($scope.version.versionId);
            }
            $scope.canBeUpdated = function() {
                return $scope.canVersionBeUpdated()($scope.version.versionId);
            }
            $scope.setThisForAllVersions = function() {
                $timeout(function() {
                    $scope.setForAllVersions()($scope.version);
                });
            }
        }
    };
});


}());
