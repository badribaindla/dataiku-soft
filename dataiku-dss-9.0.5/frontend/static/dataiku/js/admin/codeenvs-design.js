(function() {
'use strict';

var app = angular.module('dataiku.admin.codeenvs.design', []);

app.controller("AdminCodeEnvsDesignController", function($scope, TopNav, DataikuAPI, Dialogs, FutureProgressModal, CreateModalFromTemplate, ActivityIndicator) {
    $scope.openDeleteEnvModal = function(envLang, envName){
        var newScope = $scope.$new();
        newScope.envLang = envLang;
        newScope.envName = envName;
        // modal appears when usages are ready
        DataikuAPI.admin.codeenvs.design.listUsages(newScope.envLang, newScope.envName).success(function(data){
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
            CreateModalFromTemplate("/templates/admin/code-envs/common/delete-env-modal.html", newScope, "AdminCodeEnvsDesignDeleteController");
        }).error(setErrorInScope.bind(newScope));
    }
    $scope.isExportable = function(codeEnv) {
        return codeEnv && ['PLUGIN_MANAGED', 'PLUGIN_NON_MANAGED'].indexOf(codeEnv.deploymentMode) < 0;
    };
    $scope.exportEnv = function(envLang, envName) {
        ActivityIndicator.success("Exporting code env ...");
        downloadURL(DataikuAPI.admin.codeenvs.design.getExportURL(envLang, envName));
    };

    $scope.getEnvDiagnostic = function(envLang, envName) {
        ActivityIndicator.success("Generating code env diagnostic ...");
        downloadURL(DataikuAPI.admin.codeenvs.design.getDiagnosticURL(envLang, envName));
    };

    $scope.canCreateCodeEnv = function() {
        return $scope.appConfig.admin || $scope.appConfig.globalPermissions.mayCreateCodeEnvs || $scope.appConfig.globalPermissions.mayManageCodeEnvs;
    };
});

app.controller("AdminCodeEnvsDesignListController", function($scope, $controller, TopNav, DataikuAPI, Dialogs, CreateModalFromTemplate, $state) {
    $controller("AdminCodeEnvsDesignController", {$scope:$scope});
	TopNav.setLocation(TopNav.DSS_HOME, "administration");
    $scope.refreshList = function() {
        return DataikuAPI.admin.codeenvs.design.list().success(function(data) {
            $scope.codeEnvs = data;
        }).error(setErrorInScope.bind($scope));
    };
    $scope.refreshList();

    $scope.openNewPythonEnvModal = function(){
        CreateModalFromTemplate("/templates/admin/code-envs/design/new-python-env-modal.html", $scope, "AdminCodeEnvsDesignNewPythonController")
    }
    $scope.openNewREnvModal = function(){
        CreateModalFromTemplate("/templates/admin/code-envs/design/new-R-env-modal.html", $scope, "AdminCodeEnvsDesignNewRController")
    }
    $scope.openImportEnvModal = function(){
        CreateModalFromTemplate("/templates/admin/code-envs/design/import-env-modal.html", $scope, "AdminCodeEnvsDesignImportController")
    }
    $scope.actionAfterDeletion = function() {
        $scope.refreshList();
    };
    $scope.goToEditIfExists = function(envName) {
        const env = $scope.codeEnvs.find(e => e.envName === envName);
        if(env && env.envLang === 'R') {
            $state.go("admin.codeenvs-design.r-edit", { envName });
        } else if(env && env.envLang === 'PYTHON'){
            $state.go("admin.codeenvs-design.python-edit", { envName });
        }
    };
});

app.controller("AdminCodeEnvsDesignDeleteController", function($scope, TopNav, DataikuAPI, Dialogs, FutureProgressModal, $q) {
    $scope.delete = function() {
        var parentScope = $scope.$parent;
        DataikuAPI.admin.codeenvs.design.delete($scope.envLang, $scope.envName).success(function(data){
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

app.controller("AdminCodeEnvsDesignNewPythonController", function($scope, TopNav, DataikuAPI, Dialogs, FutureProgressModal, $q) {

    $scope.newEnv = {
        deploymentMode: "DESIGN_MANAGED",
        pythonInterpreter: "PYTHON36",
        conda: false,
        installCorePackages: true,
        // corePackagesSet : "PANDAS10", // let the backend decide
        installJupyterSupport: true
    }

    $scope.deploymentModes = [
        ["DESIGN_MANAGED", "Managed by DSS (recommended)"],
        ["DESIGN_NON_MANAGED", "Non-managed path"],
        ["EXTERNAL_CONDA_NAMED", "Named external Conda env"]
    ]

    $scope.$watch("newEnv.conda", function(nv) {
        if (nv === true) {
            $scope.pythonInterpreters = [
                ["PYTHON27", "Python 2.7"],
                //["PYTHON34", "Python 3.4"],
                ["PYTHON35", "Python 3.5"],
                ["PYTHON36", "Python 3.6"],
                ["PYTHON37", "Python 3.7"],
            ]
        } else if (nv === false) {
            $scope.pythonInterpreters = [
                ["PYTHON27", "Python 2.7 (from PATH)"],
                //["PYTHON34", "Python 3.4 (from PATH)"],
                ["PYTHON35", "Python 3.5 (from PATH)"],
                ["PYTHON36", "Python 3.6 (from PATH)"],
                ["PYTHON37", "Python 3.7 (from PATH)"],
                ["CUSTOM", "Custom (lookup in PATH)"]
            ]
        }
    });

    $scope.create = function(){
        var parentScope = $scope.$parent.$parent;
        DataikuAPI.admin.codeenvs.design.create("PYTHON", $scope.newEnv).success(function(data){
            $scope.dismiss();
            FutureProgressModal.show(parentScope, data, "Env creation", undefined, 'static', false).then(function(result){
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

app.controller("AdminCodeEnvsDesignNewRController", function($scope, TopNav, DataikuAPI, Dialogs, FutureProgressModal, $q) {

    $scope.newEnv = {
        deploymentMode: "DESIGN_MANAGED",
        conda: false,
        installCorePackages: true,
        installJupyterSupport: true
    }

    $scope.deploymentModes = [
        ["DESIGN_MANAGED", "Managed by DSS (recommended)"],
        ["DESIGN_NON_MANAGED", "Non-managed path"],
        ["EXTERNAL_CONDA_NAMED", "Named external Conda env"]
    ]

    $scope.create = function(){
        var parentScope = $scope.$parent.$parent;
        DataikuAPI.admin.codeenvs.design.create("R", $scope.newEnv).success(function(data){
            $scope.dismiss();
            FutureProgressModal.show(parentScope, data, "Env creation", undefined, 'static', false).then(function(result){
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


app.controller("AdminCodeEnvsDesignImportController", function($scope, $state, $stateParams, Assert, TopNav, DataikuAPI, FutureProgressModal, Dialogs, Logs, $q) {
    $scope.newEnv = {}

    $scope.import = function() {
        Assert.trueish($scope.newEnv.file, "No code env file");

        const parentScope = $scope.$parent.$parent;
        DataikuAPI.admin.codeenvs.design.import($scope.newEnv.file).then(function(data) {
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


app.controller("_AdminCodeEnvsDesignEditController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, FutureProgressModal, Dialogs, Logs, CreateModalFromTemplate, $timeout, $q, ActivityIndicator) {
    $controller("AdminCodeEnvsDesignController", {$scope:$scope});
    TopNav.setLocation(TopNav.DSS_HOME, "administration");

    $scope.uiState = {
        performChangesOnSave: true,
        upgradeAllPackages: true,
        active : 'info'
    }

    $scope.getSingleVersion = function(codeEnv) {
        return null;
    };

    $scope.actionAfterDeletion = function() {
        $state.go("admin.codeenvs-design.list");
    };

    $scope.canBeUpdated = function() {
        return $scope.codeEnv && $scope.codeEnv.canUpdateCodeEnv && ['DESIGN_MANAGED', 'PLUGIN_MANAGED', 'AUTOMATION_SINGLE', 'AUTOMATION_VERSIONED'].indexOf($scope.codeEnv.deploymentMode) >= 0;
    };

    var makeCurrentDesc = function(desc) {
        return {
                yarnPythonBin: angular.copy(desc.yarnPythonBin),
                yarnRBin: angular.copy(desc.yarnRBin),
                owner: angular.copy(desc.owner),
                installJupyterSupport : desc.installJupyterSupport,
                installCorePackages : desc.installCorePackages,
                corePackagesSet : desc.corePackagesSet,
                envSettings : angular.copy(desc.envSettings)
            };
    };
    var makeCurrentSpec = function(spec) {
        return {
                specPackageList: angular.copy(spec.specPackageList),
                desc: makeCurrentDesc(spec.desc),
                specCondaEnvironment: angular.copy(spec.specCondaEnvironment),
                permissions: angular.copy(spec.permissions),
                usableByAll: spec.usableByAll,
                allContainerConfs: angular.copy(spec.allContainerConfs),
                containerConfs: angular.copy(spec.containerConfs),
                allSparkKubernetesConfs: angular.copy(spec.allSparkKubernetesConfs),
                sparkKubernetesConfs: angular.copy(spec.sparkKubernetesConfs)
            };
    };


    /** Gets the set of package names mentioned in a code env listing */
    function getPackageNames(listStr) {
        let ret = new Set();
        for (let line of listStr.split("\n")) {
            // Ignore packages that are not clean package names
            if (line.indexOf("-e") >= 0 || line.indexOf("git+") >= 0 || line.indexOf("ssh") >= 0) continue;

            const chunks = line.split(/[\s>=<,\[\]]+/);
            const packageName = chunks[0].trim().replaceAll('"',"");
            if (packageName.length > 0) {
                ret.add(packageName.toLowerCase());
            }
        }
        return ret;
    }

    function intersection(setA, setB) {
        let intersection = new Set();
        for (let elt of setB) {
            if (setA.has(elt)) {
                intersection.add(elt)
            }
        }
        return intersection;
    }

    function difference(setA, setB) {
        let difference = new Set();
        for (let elt of setA) {
            if (!setB.has(elt)) {
                difference.add(elt)
            }
        }
        return difference;
    }

    function getPackagesThatAreBothRequiredAndInstalled(spec, actual) {
        if (!spec || !actual) {
            return new Set();
        }
        return intersection(getPackageNames(spec), getPackageNames(actual));
    }

    function getPackagesThatAreRequired(codeEnv, packageSystem) {
        let spec = null;
        let mandatory = null;
        if (packageSystem == 'pip') {
            spec = codeEnv.specPackageList;
            mandatory = codeEnv.mandatoryPackageList;
        } else if (packageSystem == 'conda') {
            spec = codeEnv.specCondaEnvironment;
            mandatory = codeEnv.mandatoryCondaEnvironment;
        }
        if (!spec) return new Set();
        let packages = getPackageNames(spec);
        if (mandatory) {
            getPackageNames(mandatory).forEach(p => packages.add(p));
        }
        return packages;
    }

    $scope.getPackagesThatWereRequiredAndInstalledButAreNotRequiredAnymore = function(packageSystem){
        if (!$scope.codeEnv || !$scope.previousPackagesSetForRemovalWarning[packageSystem]) return [];

        const newSet = getPackagesThatAreRequired($scope.codeEnv, packageSystem);

        return [...difference($scope.previousPackagesSetForRemovalWarning[packageSystem], newSet)];
    }

    $scope.specIsDirty = function() {
        if (!$scope.codeEnv) return false;
        var currentSpec = makeCurrentSpec($scope.codeEnv);
        return !angular.equals(currentSpec, $scope.previousSpec);
    };
    checkChangesBeforeLeaving($scope, $scope.specIsDirty);

    $scope.previousSpec = {
    }
    $scope.previousPackagesSetForRemovalWarning = {'pip': new Set(), 'conda': new Set()};

    var listLogs = function(){
        DataikuAPI.admin.codeenvs.design.listLogs($scope.envLang, $stateParams.envName).success(function(data) {
            $scope.logs = data;
        }).error(setErrorInScope.bind($scope));
    };

    var refreshEnv = function(){
        DataikuAPI.admin.codeenvs.design.get($scope.envLang, $stateParams.envName).success(function(data) {
            $scope.codeEnv = data;
            $scope.previousSpec = makeCurrentSpec(data);
            $scope.previousPackagesSetForRemovalWarning['pip'] = getPackagesThatAreBothRequiredAndInstalled(data.specPackageList, data.actualPackageList);
            $scope.previousPackagesSetForRemovalWarning['conda'] = getPackagesThatAreBothRequiredAndInstalled(data.specCondaEnvironment, data.actualCondaEnvironment);
        }).error(setErrorInScope.bind($scope));
        listLogs();
    }

    refreshEnv();

    $scope.updateEnv = function(upgradeAllPackages){
        var updateSettings = {
            upgradeAllPackages: upgradeAllPackages,
            forceRebuildEnv: $scope.uiState.forceRebuildEnv
        }
        DataikuAPI.admin.codeenvs.design.update($scope.envLang, $stateParams.envName, updateSettings).success(function(data) {
            FutureProgressModal.show($scope, data, "Env update").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                }
                refreshEnv();
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.saveAndMaybePerformChanges = function(performChangesOnSave){
        DataikuAPI.admin.codeenvs.design.save($scope.envLang, $stateParams.envName, $scope.codeEnv).success(function(data) {
            refreshEnv();
            if (performChangesOnSave) {
                $scope.updateEnv();
            }
        }).error(setErrorInScope.bind($scope));
    }

    $scope.fetchNonManagedEnvDetails = function(){
        DataikuAPI.admin.codeenvs.design.fetchNonManagedEnvDetails($scope.envLang, $stateParams.envName).success(function(data) {
            $scope.nonManagedEnvDetails = data;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.installJupyterSupport = function(){
        DataikuAPI.admin.codeenvs.design.installJupyterSupport($scope.envLang, $stateParams.envName).success(function(data) {
            FutureProgressModal.show($scope, data, "Env update").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                }
                refreshEnv();
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.removeJupyterSupport = function(){
        DataikuAPI.admin.codeenvs.design.removeJupyterSupport($scope.envLang, $stateParams.envName).success(function(data) {
            FutureProgressModal.show($scope, data, "Env update").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                }
                refreshEnv();
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.setRemoteSparkSupport = function(remoteKernelType, active) {
        DataikuAPI.admin.codeenvs.setRemoteSparkSupport($scope.envLang, $stateParams.envName, remoteKernelType, active).success(function(data) {
            ActivityIndicator.success("Operation successful");
        }).error(setErrorInScope.bind($scope));
    }

    $scope.specPackageListEditorOptionsPip = $scope.codeMirrorSettingService.get("text/plain", {onLoad: function(cm){$scope.codeMirrorPip = cm;}});
    $scope.specPackageListEditorOptionsConda = $scope.codeMirrorSettingService.get("text/plain", {onLoad: function(cm){$scope.codeMirrorConda = cm;}});


    function insertCode(codeToInsert, type) {
        let cm;
        if (type === 'pip') {
            cm = $scope.codeMirrorPip;
        } else {
            cm = $scope.codeMirrorConda;
        }
        //timeout to make sure of an angular safe apply
        $timeout(function() {
            cm.replaceSelection(codeToInsert, "end");
        });

        cm.focus();
    }

    $scope.openPipRequirementsEditHelp = function() {
        Dialogs.ackMarkdown($scope, "Pip requirements", 
            "Specify the packages you want:\n\n"+
            "* one row per package\n"+
            "* each row is a PIP package specification ( [link](https://setuptools.readthedocs.io/en/latest/pkg_resources.html#requirement-objects) )\n"+
            "\n"+
            "Examples of package specifications:\n\n"+
            "* pandas==0.20.3\n"+
            "* numpy>=0.19");
    }

    $scope.openPyCondaSpecEditHelp = function() {
        Dialogs.ackMarkdown($scope, "Conda packages", 
            "Specify the packages you want:\n\n"+
            "* one row per package\n"+
            "* each row is a Conda package match specification ( [link](https://conda.io/docs/user-guide/tasks/build-packages/package-spec.html#package-match-specifications) )\n"+
            "\n"+
            "Examples of package specifications:\n\n"+
            "* pandas=0.20.3\n"+
            "* numpy>=0.19");
    }

    $scope.openRCondaSpecEditHelp = function() {
        Dialogs.ackMarkdown($scope, "Conda packages", 
            "Specify the packages you want:\n\n"+
            "* one row per package\n"+
            "* each row is a Conda package match specification ( [link](https://conda.io/docs/user-guide/tasks/build-packages/package-spec.html#package-match-specifications) )\n"+
            "\n"+
            "Examples of package specifications:\n\n"+
            "* r-irkernel>=0.7");
    }

    $scope.openCRANEditHelp = function() {
        Dialogs.ackMarkdown($scope, "R packages", 
            "Specify the packages you want:\n\n"+
            "* one row per package\n"+
            "* each row is a pair of package name and minimal package version (optional)\n"+
            "\n"+
            "The version is only a minimal version. It is not supported to specify an explicity version.\n\n"+
            "Examples of package specifications:\n\n"+
            "* RJSONIO,0.13\n"+
            "* dplyr,");
    }

    $scope.insertAdditionalPackages = function(type) {

        let deferred = $q.defer();
        let newScope = $scope.$new();

        // For "DOCTOR_DL_GPU_CUDA100" "DOCTOR_DL_CPU", keras >=2.3.0 requires keras-preprocessing>=1.0.5.
        // Currently, it installs version 1.1.2, which breaks the `keras.preprocessing.image.load_img` 
        // API by only accepting path, whereas we send file-like objects. 
        // Therefore we restrist to using version 1.1.0.
        const packageListTypes = [
            ["DOCTOR", "Visual Machine Learning (scikit-learn, XGBoost)"],
            ["DOCTOR_BAYESIAN_SKOPT", "Visual Machine Learning with Bayesian search (scikit-learn, XGBoost, scikit-optimize)"],
            ["DOCTOR_DL_CPU", "Visual Deep Learning: Keras, Tensorflow (CPU)"],
            ["DOCTOR_DL_GPU_CUDA100", "Visual Deep Learning: Keras, Tensorflow (GPU with CUDA 10.0 and cuDNN 7)"],
            ["DOCTOR_DL_GPU_CUDA9", "Visual Deep Learning: Keras, Tensorflow (GPU with CUDA 9 and cuDNN 7)"],
            ["STREAMING", "Native access to streams (Kafka, HTTP SSE)"]
        ];

        const doctorPackagesPip = "scikit-learn>=0.20,<0.21\n" +
                                  "scipy>=1.2,<1.3\n" +
                                  "xgboost==0.82\n" +
                                  "statsmodels>=0.10,<0.11\n" +
                                  "jinja2>=2.10,<2.11\n" +
                                  "flask>=1.0,<1.1\n" +
                                  "cloudpickle>=1.3,<1.6\n";

        const doctorDLPackagesPipWithoutTF = "scikit-learn>=0.20,<0.21\n" +
                                     "scipy>=1.2,<1.3\n" +
                                     "statsmodels>=0.10,<0.11\n" +
                                     "jinja2>=2.10,<2.11\n" +
                                     "flask>=1.0,<1.1\n" +
                                     "h5py==2.10.0\n" +
                                     "pillow==6.2.2\n" +
                                     "cloudpickle>=1.3,<1.6\n";

        const packageListPipValues = {
            DOCTOR: doctorPackagesPip,
            DOCTOR_BAYESIAN_SKOPT: "scikit-optimize>=0.7,<0.8\n" + doctorPackagesPip,
            DOCTOR_DL_CPU: "tensorflow==1.15.0\nkeras==2.3.1\nkeras-preprocessing==1.1.0\n" + doctorDLPackagesPipWithoutTF,
            DOCTOR_DL_GPU_CUDA100: "tensorflow-gpu==1.15.0\nkeras==2.3.1\nkeras-preprocessing==1.1.0\n" + doctorDLPackagesPipWithoutTF,
            DOCTOR_DL_GPU_CUDA9: "tensorflow-gpu==1.8.0\nkeras==2.1.5\n" + doctorDLPackagesPipWithoutTF,
            STREAMING: "pykafka==2.8.0\nsseclient==0.0.26"
        };

        const doctorPackagesConda = "scikit-learn>=0.20,<0.21\n" +
                                    "scipy>=1.2,<1.3\n" +
                                    "xgboost==0.82\n" +
                                    "statsmodels>=0.10,<0.11\n" +
                                    "jinja2>=2.10,<2.11\n" +
                                    "flask>=1.0,<1.1\n" +
                                    "cloudpickle>=1.3,<1.6\n";

        const doctorDLPackagesCondaWithoutTF = "scikit-learn>=0.20,<0.21\n" +
                                       "scipy>=1.2,<1.3\n" +
                                       "statsmodels>=0.10,<0.11\n" +
                                       "jinja2>=2.10,<2.11\n" +
                                       "flask>=1.0,<1.1\n" +
                                       "h5py==2.10.0\n" +
                                       "pillow==6.2.2\n" +
                                       "cloudpickle>=1.3,<1.6\n";

        const packageListCondaValues = {
            DOCTOR: doctorPackagesConda,
            DOCTOR_BAYESIAN_SKOPT: "scikit-optimize>=0.7,<0.8\n" + doctorPackagesConda,
            DOCTOR_DL_CPU: "tensorflow==1.15.0\nkeras==2.3.1\nkeras-preprocessing==1.1.0\n" + doctorDLPackagesCondaWithoutTF,
            DOCTOR_DL_GPU_CUDA100: "tensorflow-gpu==1.15.0\nkeras==2.3.1\nkeras-preprocessing==1.1.0\n" + doctorDLPackagesPipWithoutTF,
            DOCTOR_DL_GPU_CUDA9: "tensorflow-gpu==1.8.0\nkeras==2.1.5\n" + doctorDLPackagesCondaWithoutTF,
            STREAMING: "pykafka >=2.8.0,<2.9\nsseclient >=0.0.26,<0.1"
        };

        newScope.packageListTypes = packageListTypes;
        if (type === "pip") {
            newScope.packageListValues = packageListPipValues;
        } else {
            newScope.packageListValues = packageListCondaValues;
        }

        newScope.selectedPackages = newScope.packageListTypes[0][0];

        newScope.insertReadOnlyOptions = $scope.codeMirrorSettingService.get('text/plain');
        newScope.insertReadOnlyOptions["readOnly"]= "nocursor";
        newScope.insertReadOnlyOptions["lineNumbers"]= false;
        newScope.insertReadOnlyOptions["foldGutter"]= false;

        CreateModalFromTemplate("/templates/admin/code-envs/design/add-additional-packages-modal.html",
            newScope,
            null,
            function(scope) {
                scope.acceptedDeffered = deferred;

                scope.insertPackages = function() {
                    scope.acceptedDeffered.resolve(scope.packageListValues[scope.selectedPackages]);
                    scope.dismiss();
                };
            }
        );
        deferred.promise.then(function(inputCode) {
            insertCode(inputCode, type);
        });
    };

    $scope.getLog = DataikuAPI.admin.codeenvs.design.getLog;
    $scope.downloadLog = Logs.downloadDesignCodeEnv;
});

app.controller("AdminCodeEnvsDesignPythonEditController", function($scope, $controller,$state, $stateParams, TopNav, DataikuAPI, FutureProgressModal, Dialogs) {
    $scope.envLang = "PYTHON";
    $controller("_AdminCodeEnvsDesignEditController", {$scope:$scope});
});

app.controller("AdminCodeEnvsDesignREditController", function($scope, $controller,$state, $stateParams, TopNav, DataikuAPI, FutureProgressModal, Dialogs) {
    $scope.envLang = "R";
    $controller("_AdminCodeEnvsDesignEditController", {$scope:$scope});
});

}());
