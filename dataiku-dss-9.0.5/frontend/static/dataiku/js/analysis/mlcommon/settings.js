(function(){
'use strict';

const app = angular.module('dataiku.analysis.mlcore');

app.directive('featureDescription', function(){
    return {
        scope: { feature: '=' },
        templateUrl: '/templates/analysis/mlcommon/one-feature.html',
        link: function(scope, element, attrs) {
            var params = {
                placement: 'right',
                animation: false,
                container: 'body',
                html: true,
                template: '<div class="tooltip feature-description" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>'
            };
            element.tooltip(params);
            // Remove other tooltips on hover out
            element.hover(function() { $(this).tooltip('show'); }, function() {
                $('.tooltip').not(element.next()).remove();
            });
            scope.$watch('feature', function() {
                element.attr('data-original-title', element.find('.sub-feature').html());
                element.attr('title', '');
            })
        },
    }
});


app.directive("diagnosticIcon", function() {
    return {
        scope: { size: "@" },
        template:'<svg class="diagnostic-icon-wrapper-{{size}}" xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="50%" cy="50%" r="{{ size === \'large\' ? 10 : 8}}" class="diagnostic-icon-stethoscope-{{size}}"></circle>' +
            '<text x="50%" y="{{ size === \'large\' ? 70 : 80}}%" class="diagnostic-icon">&#xf0f1;</text></svg>',
    };
});

app.directive("diagnosticsModal", function() {
    return {
        scope: { diagnostics: '=', displayPopup: '=', textContent: "@", popupContent: "@", iconSize: "@" },
        templateUrl: '/templates/ml/diagnostics-modal.html',
        link: ($scope, element, attrs) => {
            $scope.maxLength = attrs.maxLength || 120; // Number of characters per message
            $scope.iconPlacement = attrs.iconPlacement || "left"; // Number of characters per message
            $scope.maxDiagnostics = attrs.maxDiagnostics || 5; // Number of diagnostics to display in the popup

            const firstNDiagnostics = (firstN) => {
                if (!$scope.diagnostics) {
                    return null;
                }

                const diagnostics = {};
                let total = 0;
                for (const diagnostic of $scope.diagnostics) {
                    if (attrs.state && attrs.state !== diagnostic.step) { // Skip if only display for a single state
                        continue;
                    }

                    diagnostics[diagnostic.displayableType] = diagnostics[diagnostic.displayableType] || [];
                    diagnostics[diagnostic.displayableType].push(diagnostic.message);
                    total++;

                    if (total >= firstN) { // Reached max numbers of diagnostics to display
                        return diagnostics;
                    }
                }
                return diagnostics;
            }

            $scope.$watch("diagnostics", () => {
                $scope.filteredDiagnostics = firstNDiagnostics($scope.maxDiagnostics);
            }, true);
        }
    };
});

app.controller('EnsembleModalController', function($scope){
    $scope.params = {};
    $scope.getMethod = function(){ return $scope.params.method; };
});


app.controller("_MLTaskDesignController", function($scope, $controller, $state, $stateParams, $rootScope, TopNav, Fn,
    Dialogs, DataikuAPI, MLTasksNavService, CreateModalFromTemplate, Collections, $timeout, CodeMirrorSettingService,
    PMLSettings, WT1, $q, MLDiagnosticsDefinition) {

    DataikuAPI.analysis.listHeads($stateParams.projectKey).success(function(data) {
        $scope.analyses = data;
    });

    MLDiagnosticsDefinition.fetch(data => { $scope.diagnosticsDefinition = data; });

    $scope.backendTypeNames = {
        "PY_MEMORY": "Python in-memory",
        "MLLIB": "MLLib",
        "H20": "H20",
        "VERTICA": "Vertica",
        "KERAS": "Keras"
    };

    $scope.displayTypes = {
        CLUSTERING: "Clustering",
        BINARY_CLASSIFICATION: "Classification",
        MULTICLASS: "Classification",
        REGRESSION: "Regression"
    };

    $scope.getCustomAlgorithm = function(custom_id) {
        if (custom_id.startsWith('custom_python_')) {
            return $scope.mlTaskDesign.modeling.custom_python[custom_id.slice(14)];
        } else if (custom_id.startsWith('custom_mllib_')) {
            return $scope.mlTaskDesign.modeling.custom_mllib[custom_id.slice(13)];
        }
    };

    $scope.isPluginAlgorithm = function(alg) {
        return alg.algKey.startsWith("CustomPyPredAlgo_");
    }

    $scope.getPluginAlgorithmSettings = function(pluginModelId) {
        return $scope.mlTaskDesign.modeling.plugin_python[pluginModelId] || {};
    };

    $scope.getPluginAlgorithm = function(algKey) {
        return $scope.algorithms["PY_MEMORY"].find(alg => alg.algKey === algKey);
    }

    $scope.getAlgorithmModeling = function(algKey) {
        const alg = Collections.indexByField($scope.algorithms[$scope.mlTaskDesign.backendType], 'algKey')[algKey];
        if (!alg) {
            throw new Error("Algorithm not found: " + algKey);
        } else if (alg.isCustom) {
            return $scope.getCustomAlgorithm(algKey);
        } else if ($scope.isPluginAlgorithm(alg)) {
            return $scope.getPluginAlgorithmSettings(alg.algKey);
        } else {
            return $scope.mlTaskDesign.modeling[alg.paramsName || algKey];
        }
    };

    $scope.isMLBackendType = function(mlBackendType){
        // mlTasksContext is initialized much faster than mlTaskDesign
        if (!$scope.mlTasksContext || !$scope.mlTasksContext.activeMLTask) return false; // might not be initialized
        return $scope.mlTasksContext.activeMLTask.backendType == mlBackendType;
    };

    $scope.isBayesianSearchWithSkopt = function() {
        if (!$scope.mlTaskDesign 
            || !$scope.mlTaskDesign.modeling
            || !$scope.mlTaskDesign.modeling.gridSearchParams) {
            return false;
        }
        const gridSearchParams = $scope.mlTaskDesign.modeling.gridSearchParams;
        return (gridSearchParams.strategy === "BAYESIAN" && gridSearchParams.bayesianOptimizer === "SCIKIT_OPTIMIZE");
    }

    $scope.isSparkBased = function(){
        return $scope.mlTaskDesign.backendType == 'MLLIB' || $scope.mlTaskDesign.backendType == 'H2O';
    };

    $scope.removeCustomAlgorithm = function(custom_id) {
        var idx;
        if (custom_id.startsWith('custom_python_')) {
            idx = parseInt(custom_id.slice(14));
            $scope.mlTaskDesign.modeling.custom_python.splice(idx, 1);
        } else if (custom_id.startsWith('custom_mllib_')) {
            idx = parseInt(custom_id.slice(13));
            $scope.mlTaskDesign.modeling.custom_mllib.splice(idx, 1);
        }
        var algs = $scope.algorithms[$scope.mlTaskDesign.backendType]
            .filter(function(o){return (!o.condition||o.condition())});
        var balgs = $scope.base_algorithms[$scope.mlTaskDesign.backendType]
            .filter(function(o){return (!o.condition||o.condition())});
        $scope.uiState.algorithm = algs[balgs.length+idx-1].algKey;
    };

    function updateCustomAlgorithms(nv) {
        if (!nv) { return }
        $scope.algorithms = angular.copy($scope.base_algorithms);
        if (!$scope.mlTaskDesign) {return}
        
        if ($scope.isMLBackendType("MLLIB")) {
            $scope.editorOptionsCustom = CodeMirrorSettingService.get("text/x-scala");
        } else {
            $scope.editorOptionsCustom = CodeMirrorSettingService.get("text/x-python");
        }
        
        var i;
        for (i=0;i<$scope.mlTaskDesign.modeling.custom_python.length;i++) {
            $scope.algorithms.PY_MEMORY.push({
                name: $scope.mlTaskDesign.modeling.custom_python[i].name || "Custom python model",
                algKey: 'custom_python_' + i,
                isCustom: true,
            });
        }
        for (i=0;i<$scope.mlTaskDesign.modeling.custom_mllib.length;i++) {
            $scope.algorithms.MLLIB.push({
                name: $scope.mlTaskDesign.modeling.custom_mllib[i].name || "Custom mllib model",
                algKey: 'custom_mllib_' + i,
                isCustom: true,
            })
        }
    }

    $scope.getAlgorithmSettings = function(alg) {
        if (alg.isCustom) {
            return $scope.getCustomAlgorithm(alg.algKey)
        } else if (alg.algKey.startsWith("CustomPyPredAlgo_")) {
            return $scope.getPluginAlgorithmSettings(alg.algKey);
        } else {
            return $scope.mlTaskDesign.modeling[alg.paramsName || alg.algKey];
        }
    };

    $scope.retrieveCodeEnvsInfo = function() {
        if ($scope.appConfig.isAutomation) {
            return;
        }
        // On Design node, listing all available envs for this MLtask, along with compatibility to run ML, for 
        // further use:
        // * in "Hypeparamaters" tab for prediction and bayesian search to make sure a proper env is used
        // * in "Runtime environment" to make sure a proper env is used
        if ($scope.isMLBackendType("PY_MEMORY") || $scope.isMLBackendType("KERAS")) {
            DataikuAPI.codeenvs.listWithVisualMlPackages($stateParams.projectKey).success(function(data) {
                $scope.codeEnvsCompat = data;
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.copyFeaturesHandling = function(exportSettings) {
        if ($scope.dirtySettings()) {
            $scope.saveSettings();
        }
        DataikuAPI.projects.listHeads(exportSettings ? 'WRITE_CONF' : null).success(function(projectData) {
            CreateModalFromTemplate("/templates/analysis/mlcommon/settings/copy-settings.html", $scope, null, function(newScope) {
                newScope.title = "Copy features handling " + (exportSettings ? "to" : "from");
                newScope.totem = "icon-" + (exportSettings ? "copy" : "paste");
                newScope.infoMessages = ["Features handling will be copied based on their names"];
                if ($scope.mlTaskDesign.taskType === "PREDICTION") {
                    newScope.infoMessages.push("Pasting features handling on the "
                                               + (exportSettings ? "selected " : "current ")
                                               + "model will not change the role of its target variable "
                                               + ($scope.isSampleWeightEnabled() ? " nor of its sample weight " : ""));
                }
                newScope.projects = projectData;
                newScope.selectProject = function() {
                    DataikuAPI.analysis.listHeads(newScope.selectedProjectKey).success(function(analysisData) {
                        newScope.analyses = analysisData;
                        newScope.selectedAnalysisId = undefined;
                        newScope.selectedTask = undefined;
                    }).error(setErrorInScope.bind($scope));
                };
                newScope.selectAnalysis = function () {
                    DataikuAPI.analysis.listMLTasks(newScope.selectedProjectKey, newScope.selectedAnalysisId)
                    .success(function(taskData) {
                        newScope.tasks = taskData;
                        newScope.descriptions = [];
                        newScope.tasks.forEach(task => {
                            // task can be selected if it is not the current one
                            task.isNotSelectable = task.mlTaskId === $stateParams.mlTaskId
                                            && newScope.selectedAnalysisId === $stateParams.analysisId
                                            && newScope.selectedProjectKey === $stateParams.projectKey;
                            newScope.descriptions.push($scope.displayTypes[task.predictionType || task.taskType] + " ("
                            + ($scope.backendTypeNames[task.backendType] || $scope.mlTaskDesign.backendType)
                            + ")");
                        });
                        newScope.selectedTask = undefined;
                    }).error(setErrorInScope.bind($scope));
                };
                if (newScope.projects.some(_ => _.projectKey === $stateParams.projectKey)) {
                    newScope.selectedProjectKey = $stateParams.projectKey;
                    newScope.analyses = $scope.analyses;
                    newScope.selectedAnalysisId = $stateParams.analysisId;
                    newScope.selectAnalysis();
                }
                newScope.confirm = function() {
                    if (exportSettings) {
                        DataikuAPI.analysis.mlcommon.copyFeatureSettings($stateParams.projectKey, $stateParams.analysisId,
                            $stateParams.mlTaskId, newScope.selectedProjectKey, newScope.selectedAnalysisId,
                            newScope.selectedTask.mlTaskId).error(setErrorInScope.bind($scope));
                    } else {
                        DataikuAPI.analysis.mlcommon.copyFeatureSettings(newScope.selectedProjectKey, newScope.selectedAnalysisId,
                            newScope.selectedTask.mlTaskId, $stateParams.projectKey, $stateParams.analysisId,
                            $stateParams.mlTaskId).success(function(data) {
                                // Keep existing order of features
                                for (let featureName in $scope.mlTaskDesign.preprocessing.per_feature) {
                                    Object.assign($scope.mlTaskDesign.preprocessing.per_feature[featureName], data.preprocessing.per_feature[featureName]);
                                }
                            }).error(setErrorInScope.bind($scope));
                    }
                    WT1.event("mltask-copy-features-handling", {
                        export: exportSettings,
                        sameProject: $stateParams.projectKey === newScope.selectedProjectKey,
                        sameAnalysis: $stateParams.analysisId === newScope.selectedAnalysisId,
                        typeDest: newScope.selectedTask.taskType === "CLUSTERING" ? "CLUSTERING" : newScope.selectedTask.predictionType,
                        typeSrc: $scope.mlTaskDesign.taskType === "CLUSTERING" ? "CLUSTERING" : $scope.mlTaskDesign.predictionType
                    });
                    newScope.dismiss();
                };
                newScope.cancel = function() {
                    newScope.dismiss();
                };
            });
        }).error(setErrorInScope.bind($scope));
    };


    $scope.$watch('mlTaskDesign.modeling.custom_python', updateCustomAlgorithms, true);
    $scope.$watch('mlTaskDesign.modeling.custom_mllib', updateCustomAlgorithms, true);

    $scope.displayWeightWarning = function(algKey) {
        return $scope.isSampleWeightEnabled() && $scope.algosWithoutWeightSupport.has(algKey);
    };

});



/**
 * Injected into all controllers that display a single ML task.
 * It handles:
 *   - the global nav handle to switch between ML tasks
 *   - setting the top nav
 */
app.controller("_MLTaskBaseController", function($scope, $state, Collections, DataikuAPI, TopNav, $stateParams,
    $location, CreateModalFromTemplate, Dialogs, ActivityIndicator, Fn, $q, Throttle, MLTasksNavService, $rootScope,
    algorithmsPalette, DatasetUtils, WT1, PartitionedModelsService){
    TopNav.setLocation(TopNav.TOP_ANALYSES, null, TopNav.TABS_ANALYSIS, "models");
    TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId);

    $scope.selection = {
        partialProperty: 'sessionId'
    };
    $scope.sessionInfo = {};
    $scope.hooks = {};
    $scope.uiState = {
        currentMetric: ''
    };

    $scope.uiState.settingsPane = $location.hash().split('.')[0] || 'learning';
    $scope.uiState.viewMode = $location.hash().split('.')[1] || 'sessions';
    if ($location.hash() === '') {
        $location.hash($scope.uiState.settingsPane + '.' + $scope.uiState.viewMode).replace();
    }

    $scope.$watch("uiState", function(nv, ov) {
        if (nv && ov && (nv.settingsPane !== ov.settingsPane || nv.viewMode !== ov.viewMode)) {
            $location.hash(nv.settingsPane + '.' + nv.viewMode);
        }
    }, true);
    $scope.$on("$locationChangeSuccess", function(angularEvent, newUrl, oldUrl){
         // Do not update uiState if we leave the page: newUrl != current ($state.href("."))
         // Otherwise the uiState update will trigger the watch above and modify the new $location.hash()
        if (!newUrl.includes($state.href("."))) {
            return;
        }

        const newHash = newUrl.split("#")[1];
        if (newHash) {
            $scope.uiState.settingsPane = newHash.split('.')[0] || 'learning';
            $scope.uiState.viewMode = newHash.split('.')[1] || 'sessions';
        }
    })

    $scope.listMLTasks = function() {
        return DataikuAPI.analysis.listMLTasks($stateParams.projectKey, $stateParams.analysisId).success(function(data){
            $scope.mlTasksContext.type = "mltasks";
            $scope.mlTasksContext.analysisMLTasks = data;
            $scope.mlTasksContext.activeMLTask = null;
            for (var i in data) {
                if (data[i].mlTaskId == $stateParams.mlTaskId) {
                    $scope.mlTasksContext.activeMLTask = data[i];
                }
            }
        }).error(setErrorInScope.bind($scope));
    }

    $scope.createNewMLTask = function() {
        CreateModalFromTemplate("/templates/analysis/new-mltask-modal.html", $scope, "AnalysisNewMLTaskController");
    };

    $scope.renameMLTask = function() {
        DataikuAPI.analysis.mlcommon.getCurrentSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId)
        .success(function(mlTaskDesign){
            Dialogs.prompt($scope, "Rename modeling task", "Rename modeling task", mlTaskDesign.name).then(function(newName) {
                var fn;
                if (mlTaskDesign.taskType == "PREDICTION") {
                    fn = DataikuAPI.analysis.pml.saveSettings;
                } else if (mlTaskDesign.taskType == "CLUSTERING") {
                    fn = DataikuAPI.analysis.cml.saveSettings;
                } else {
                    throw "Unknown mlTaskDesign Type"
                }
                mlTaskDesign.name = newName;
                fn($stateParams.projectKey, $stateParams.analysisId, mlTaskDesign).success(function(data){
                    $state.go("projects.project.analyses.analysis.ml.list");
                });
            });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteMLTask = function() {
        Dialogs.confirm($scope, "Delete modeling task", "Do you want to delete this modeling task ?").then(function(data){
            DataikuAPI.analysis.mlcommon.deleteMLTask($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data) {
                $state.go("projects.project.analyses.analysis.ml.list");
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.duplicateMLTask = function() {
        const DEFAULT_ANALYSIS = {id: "new", name: "Create a new analysis…"};
        if ($scope.dirtySettings()) {
            $scope.saveSettings();
        }
        DataikuAPI.projects.listHeads('WRITE_CONF').success(function(writableProjects) {
            if (writableProjects.length == 0) {
                Dialogs.error($scope, "No writable project", "You don't have write access to any project, can't duplicate model.");
                return;
            }
            const currentProjectWritable = writableProjects.some(_ => _.projectKey === $stateParams.projectKey);
            CreateModalFromTemplate("/templates/analysis/mlcommon/duplicate-mltask.html", $scope, null, function(newScope) {
                newScope.totem = "icon-machine_learning_" +
                                ($scope.mlTaskDesign.taskType === "CLUSTERING" ? "clustering" : "regression");
                newScope.projects = writableProjects;
                newScope.selectedProject = currentProjectWritable ? $stateParams.projectKey : writableProjects[0].projectKey;

                newScope.$watch('selectedProject', function(project) {
                    if (!project) return;
                    DatasetUtils.listDatasetsUsabilityForAny(project).success(function(datasets) {
                        newScope.availableDatasets = datasets;
                        newScope.selectedDataset = project == $stateParams.projectKey ?
                                $scope.analysisCoreParams.inputDatasetSmartName : undefined;
                    }).error(setErrorInScope.bind(newScope));
                });
                newScope.$watch('selectedDataset', function(dataset) {
                    newScope.analyses = undefined;
                    if (!dataset) return;
                    const selectedDataset = newScope.availableDatasets.find(_ => _.smartName === dataset);

                    // Use selectedProject instead of contextProject because we do not need to check exposed objects
                    DataikuAPI.datasets.get(newScope.selectedProject, selectedDataset.name, newScope.selectedProject)
                        .then(({data}) => newScope.columnNames = data.schema.columns.map(_ => _.name))
                        .then(() => DataikuAPI.analysis.listOnDataset(newScope.selectedProject, dataset))
                        .then(({data}) => {
                            const analyses = data;
                            analyses.unshift(Object.assign({newName: "Analyze " + newScope.selectedDataset}, DEFAULT_ANALYSIS));
                            newScope.analyses = analyses;
                            newScope.selectedAnalysis = analyses[0];
                            if (newScope.selectedProject == $stateParams.projectKey
                                    && newScope.selectedDataset == $scope.analysisCoreParams.inputDatasetSmartName) {
                                newScope.selectedAnalysis = analyses.find(_ => _.id === $scope.analysisCoreParams.id);
                            }
                        })
                        .catch(setErrorInScope.bind(newScope));
                });

                // checks whether the target is in the feature columns of the dataset or not;
                // if not, a dropdown is displayed with the actual features so the user can pick a new target
                // the check is only done if the selected analysis has no step or is new,
                // else the target could have been created by the script => checked in backend
                function checkDatasetContainsTarget() {
                    newScope.features = {};
                    if ($scope.mlTaskDesign.taskType == "CLUSTERING"
                            || ! newScope.selectedAnalysis
                            || newScope.selectedAnalysis.id === $stateParams.analysisId) {
                        return;
                    }
                    if (newScope.selectedAnalysis.id == "new" || newScope.selectedAnalysis.nbSteps === 0) {
                        if (! newScope.columnNames.includes($scope.mlTaskDesign.targetVariable)) {
                            newScope.features.available = newScope.columnNames;
                        }
                    }
                }
                newScope.$watch('selectedAnalysis', checkDatasetContainsTarget);

                function duplicate() {
                    if ($scope.mlTaskDesign.taskType == "PREDICTION") {
                        DataikuAPI.analysis.pml.duplicate(
                            $stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId,
                            newScope.selectedProject, newScope.selectedAnalysis.id, newScope.features.selected
                        ).success(function(result) {
                            if (result.success) {
                                $state.go("projects.project.analyses.analysis.ml.predmltask.list.design", {
                                    projectKey: newScope.selectedProject,
                                    analysisId: newScope.selectedAnalysis.id,
                                    mlTaskId: result.newMlTaskId.id
                                });
                            } else {
                                newScope.features.available = result.possibleTargets;
                            }
                        }).error(setErrorInScope.bind(newScope));
                    } else {
                        DataikuAPI.analysis.cml.duplicate($stateParams.projectKey, $stateParams.analysisId,
                            $stateParams.mlTaskId, newScope.selectedProject, newScope.selectedAnalysis.id
                        ).success(function(data) {
                                $state.go("projects.project.analyses.analysis.ml.clustmltask.list.design", {
                                    projectKey: newScope.selectedProject,
                                    analysisId: newScope.selectedAnalysis.id,
                                    mlTaskId: data.id
                                });
                        }).error(setErrorInScope.bind(newScope));
                    }
                }

                newScope.confirm = function () {
                    if (newScope.selectedAnalysis.id == "new") {
                        DataikuAPI.analysis.create(newScope.selectedProject, newScope.selectedDataset,
                            newScope.selectedAnalysis.newName).success(function (data) {
                                newScope.selectedAnalysis.id = data.id;
                                duplicate();
                        }).error(setErrorInScope.bind(newScope));
                    } else {
                        duplicate();
                    }

                    WT1.event("mltask-duplicate", {
                        sameProject: $stateParams.projectKey == newScope.selectedProject,
                        sameDataset: $scope.analysisCoreParams.inputDatasetSmartName == newScope.selectedDataset,
                        sameAnalysis: $stateParams.analysisId == newScope.selectedAnalysis.id,
                        taskType: $scope.mlTaskDesign.taskType == "CLUSTERING" ? "CLUSTERING" : $scope.mlTaskDesign.predictionType,
                    });
                };
            });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.mlTaskFeatures = function(features, roles) {
        if (!features) {return 0}
        return $.map(features, function(v,k){
            v._name = k;
            return v;
        }).filter(function(f){
            return roles.indexOf(f.role) !== -1;
        });
    }

    $scope.getEnabledModels = function(models) {
        var enabledModels = [];
        for (var name in models) {
            if (name === 'custom_mllib' || name === 'custom_python') {
                const enabledCustomModels = models[name].filter(m => m.enabled);
                enabledModels = enabledModels.concat(enabledCustomModels);
            } else if (name.startsWith("plugin_python")) {
                const enabledPluginModels = Object.values(models[name]).filter(m => m.enabled);
                enabledModels = enabledModels.concat(enabledPluginModels);
            } else if (models[name].enabled) {
                enabledModels.push(models[name]);
            }
        }
        return enabledModels;
    };

    $scope.dirtySettings = function() {
        return !angular.equals($scope.savedSettings, dkuDeepCopy($scope.mlTaskDesign, $scope.SettingsService.noDollarKey));
    };

    $scope.setMlTaskDesign = function(mlTaskDesign) {
        $scope.mlTaskDesign = mlTaskDesign;
    };

    $scope.beforeUpdateSettingsCallback = function(settings) {
        // Do nothing. Will be overriden in PMLTaskBaseController
    }

    $scope.updateSettings = function(settings) {
        $scope.beforeUpdateSettingsCallback(settings);
        $scope.setMlTaskDesign(settings);
        $scope.saveSettings();
    }

    $scope.removeTaskStatus = function() {
        $scope.mlTaskStatus = null;
    }

    $scope.trainDirectly = function() {
        $scope.touchMlTask();
        // Remove the mltaskstatus to prevent the fugitive "no model trained"
        $scope.mlTaskStatus = null;
        $scope.MLAPI.trainStart($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId)
            .success(function(){
                $scope.initialRefreshAndAutoRefresh();
            }).error(setErrorInScope.bind($scope));
    };

    function updateSessionModels(){
        if ($scope.selection && $scope.selection.allObjects && $scope.sessionTask && $scope.sessionTask.sessionId) {
            $scope.selection.sessionModels = $scope.selection.allObjects.filter(function(x){
                return x.sessionId == $scope.sessionTask.sessionId;
            });
        }
    }

    $scope.$watch("selection.allObjects", updateSessionModels, true);
    $scope.$watch("sessionTask", updateSessionModels, true);

    $scope.abortTraining = function(){
        CreateModalFromTemplate("/templates/analysis/mlcommon/abort-train-modal.html", $scope, null, function(newScope) {
            newScope.confirm = function() {
                var toAbort = $scope.selection.allObjects
                .filter(function(o){ return o.trainInfo.state === 'PENDING' || o.trainInfo.state === 'RUNNING' });
                DataikuAPI.analysis.mlcommon
                    .trainAbort($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId)
                    .success(function(){
                        ActivityIndicator.success("Abort requested");
                        toAbort.map(function(o){ o.trainInfo.$userRequestedState = "ABORTED" });
                        refreshStatusAndModelSnippets();
                    }).error(setErrorInScope.bind($scope));
                newScope.dismiss();
            }
            newScope.finalize = function() {
                var toAbort = $scope.selection.allObjects
                .filter(function(o){return o.trainInfo.state === 'RUNNING' || o.trainInfo.state === 'PENDING'});
                DataikuAPI.analysis.mlcommon.stopGridSearchSession($scope.analysisCoreParams.projectKey,
                $scope.analysisCoreParams.id, $scope.sessionTask.id, $scope.sessionTask.sessionId)
                    .success(function(data){
                        toAbort.map(function(o){ o.trainInfo.$userRequestedState = "FINALIZE" });
                        $scope.refreshStatus();
                    }).error(setErrorInScope.bind($scope));
                newScope.dismiss();
            }
        });
    };

    // init & refresh

    // Refreshing mltaskStatus (general refresh)

    $scope.selectRunningOrFirstSession = function() {
        if ($scope.mlTaskStatus.fullModelIds.length > 0) {
            var sids = $scope.mlTaskStatus.fullModelIds.filter(function(o){ return o.training });
            if (sids.length === 0) { sids = $scope.mlTaskStatus.fullModelIds }
            sids = sids.map(Fn.propStr('fullModelId.sessionId'))
               .map(function(sid){ return parseInt(sid.slice(1)) }).sort(function(a,b){ return b-a });
            $scope.getSessionTaskIfChanged("s" + sids[0], true);
        }
    }

    $scope.refreshStatus = function() {
        return $scope.MLAPI.getTaskStatus($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId)
            .success(function(data){
                $scope.mlTaskStatus = data;
            })
            .error(setErrorInScope.bind($scope));
    };

    const refreshStatusAndModelSnippets = function(){
         $scope.refreshStatus().then(function(){
                    $scope.getModelSnippets($scope.mlTaskStatus.fullModelIds
                        .filter(function(o){ return o.training })
                        .map(function(o){ return o.id }));
                    if (!$scope.mlTaskStatus.training && !$scope.mlTaskStatus.guessing && $scope.modelSnippets) {
                        // last call, refresh remaining models
                        $scope.getModelSnippets(Object.values($scope.modelSnippets)
                            .filter(function(o){ return o.trainInfo.state === 'RUNNING' || o.trainInfo.state === 'PENDING' })
                            .map(Fn.prop('fullModelId')));
                    }
                });
    }

    $scope.initialRefreshAndAutoRefresh = function() {
        var deferred = $q.defer(),
            refreshStartDate = new Date(),
            refreshFirstDelay = 1000,
            refreshLastDelay = 15 * 1000,
            refreshGrowLength = 120 * 1000,
            throttle = Throttle().withScope($scope).withDelay(refreshFirstDelay);
        var autoRefresh = throttle.wrap(function() {
            if ($scope.mlTaskStatus.training || $scope.mlTaskStatus.guessing) {
                refreshStatusAndModelSnippets();

                // Delay progressively grows from refreshFirstDelay to refreshLastDelay over time (refreshGrowLength)
                // Scaling of the delay is to the power of 2, until we reach refreshLastDelay
                var newDelay = refreshFirstDelay + Math.round( (refreshLastDelay-refreshFirstDelay)
                    * Math.min((new Date() - refreshStartDate) / refreshGrowLength)**2, 1);
                throttle.withDelay(newDelay);
                autoRefresh();
            }
        });
        $scope.refreshStatus().then(function() {
            $scope.selectRunningOrFirstSession();
            $scope.refreshStatus().then(function(){
                deferred.resolve();
                $scope.getModelSnippets($scope.mlTaskStatus.fullModelIds
                    .filter(function(o){ return o.training || !($scope.modelSnippets && o.id in $scope.modelSnippets)})
                    .map(function(o){ return o.id }));
            }, function() {
                deferred.reject();
            });
            autoRefresh();
        });
        return deferred.promise;
    };

    // Refreshing sessionTasks (task info)

    $scope.$watch('mlTaskStatus.guessing', function(nv){
        if (nv === false) {
            $scope.initMlTaskDesign();
        }
    });

    $scope.getSessionTask = function(sessionId) {
        return $scope.MLAPI.getSessionTask($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId, sessionId)
            .then((response) => {
                return response.data;
            }, setErrorInScope.bind($scope));
    };

    $scope.getPretrainEquivalentMLTask = function(fullModelId, usePostTrain){
        return $scope.MLAPI.getPretrainEquivalentMLTask(fullModelId, usePostTrain)
            .then((response) => {
                return response.data;
            }, setErrorInScope.bind($scope));
    };

    $scope.setPossibleMetrics = function() {
        $scope.possibleMetrics = $scope.FilteringService.getPossibleMetrics($scope.mlTaskStatus.headSessionTask);
        if ($scope.mlTaskStatus.headSessionTask.modeling && !$scope.uiState.currentMetric) {
            $scope.uiState.currentMetric = $scope.mlTaskStatus.headSessionTask.modeling.metrics
                ? $scope.mlTaskStatus.headSessionTask.modeling.metrics.evaluationMetric
                : $scope.possibleMetrics[0][0];
        }
        $scope.possibleMetricsHooks = $scope.possibleMetrics.map((m) => m[0]);
    }

    var sessions = {};
    $scope.getSessionTaskIfChanged = function(newSessionId, dropCache) {
        if (!newSessionId || (!dropCache && $scope.sessionTask && $scope.sessionTask.sessionId === newSessionId)) { return }
        if (!dropCache && sessions[newSessionId]) { $scope.sessionTask = sessions[newSessionId] ; return }
        $scope.getSessionTask(newSessionId).then(function(sessionTask) {
            $scope.sessionTask = sessionTask;
            $scope.sessionTask.sessionId = newSessionId;
            $scope.setPossibleMetrics();
            sessions[newSessionId] = $scope.sessionTask;
        });
    }

    // Refreshing snippets

    $scope.setContainerUsageMetrics = function () {
        if (!$scope.mlTaskStatus || !$scope.modelSnippets || !$scope.mlTaskDesign || !$scope.mlTaskDesign.modeling || !$scope.mlTaskDesign.modeling.gridSearchParams || !$scope.mlTaskDesign.modeling.gridSearchParams.distributed) {
            return;
        }
        angular.forEach($scope.modelSnippets, function (snippet) {
            snippet.maxKubernetesContainers = $scope.mlTaskDesign.modeling.gridSearchParams.nContainers;
            if (snippet.partitionedModelEnabled) {
                snippet.maxKubernetesContainers *= PartitionedModelsService.getPartitionsSnippetStateSize(snippet, 'RUNNING');
            }
            snippet.containerUsageMetrics = $scope.mlTaskStatus.fullModelIds.filter((_) => _.id === snippet.fullModelId)[0].containerUsageMetrics;
        });
    };

    $scope.setAlgorithmColors = function() {
        if (!($scope.mlTasksContext.activeMLTask.backendType in $scope.base_algorithms)){
            return;
        }

        var algList = $scope.base_algorithms[$scope.mlTasksContext.activeMLTask.backendType].filter(function(o){return !o.condition||o.condition()});
        var algKeyList = algList.map(Fn.prop('algKey'))
        var offset = 1;
        angular.forEach($scope.modelSnippets, function(snippet, k){
            var idx = algKeyList.indexOf(snippet.algorithm.toLowerCase());

            if (idx === -1) {
                idx = algKeyList.length + offset;
                offset++;
            }
            snippet.color = algorithmsPalette(idx);
            snippet.algorithmOrder = idx;
        });
    }

    $scope.setMainMetric = function() {
        if ( !$scope.mlTaskStatus || !$scope.modelSnippets || !$scope.mlTaskDesign || !$scope.mlTaskDesign.modeling) { return }
        $scope.FilteringService.setMainMetric(Object.values($scope.modelSnippets),
            [],
            $scope.uiState.currentMetric,
            $scope.mlTaskDesign.modeling.metrics.customEvaluationMetricGIB);
    }

    $scope.libMetric = function(metric) {
        return $scope.SettingsService.sort.lowerIsBetter(metric, $scope.sessionTask.modeling.metrics.customEvaluationMetricGIB);
    }

    $scope.setMetricScales = function() {
        if ($scope.sessionTask&&$scope.sessionTask.modeling) {
            $scope.metricScales = {}
            $scope.possibleMetrics.map(Fn.prop(0)).forEach(function(metric) {
                var metrics = Object.values($scope.modelSnippets).map(Fn.prop(this.metricMap[metric])),
                    rev = $scope.libMetric(metric),
                    min = d3.min(metrics), max = d3.max(metrics);
                $scope.metricScales[metric] = min === max ? Fn.cst('grey') :
                    d3.scale.linear().range(['red', 'orange', 'green'])
                        .domain([rev ? max : min, (max + min) / 2, rev ? min : max]);
            }, $scope.FilteringService);
        }
    }

    $scope.getModelSnippets = function(fullModelIds, getAll) { // getAll calls getModelSnippets with an empty list -> long call
        if (!$scope.modelSnippets) { $scope.modelSnippets = {} }
        if (!getAll && fullModelIds.length==0) { return }
        return $scope.MLAPI.getModelSnippets($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId, fullModelIds, getAll).then(function(response){
            angular.forEach(response.data, function(model, fmi) {
                $scope.modelSnippets[fmi] = Collections.updateNoDereference($scope.modelSnippets[fmi], model);
            });
            $scope.setMetricScales();
            $scope.setAlgorithmColors();
            $scope.setMainMetric();
            $scope.setContainerUsageMetrics();
        });
    }

    // init

    $scope.compareFMIs = function(b,a) {
        var af = a.fullModelId, bf = b.fullModelId;
        if (af.sessionId !== bf.sessionId) return parseInt(af.sessionId.slice(1)) - parseInt(bf.sessionId.slice(1));
        if (af.preprocessingId !== bf.preprocessingId) return parseInt(af.preprocessingId.slice(2)) - parseInt(bf.preprocessingId.slice(2));
        return parseInt(af.modelId.slice(1)) - parseInt(bf.modelId.slice(1));
    }

    DataikuAPI.analysis.getCore($stateParams.projectKey, $stateParams.analysisId).success(function(data) {
        $scope.analysisCoreParams = data;
        TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId, {name:data.name, dataset: data.inputDatasetSmartName});
        TopNav.setPageTitle(data.name + " - Analysis");
    }).error(setErrorInScope.bind($scope));

    $scope.listMLTasks().then($scope.initialRefreshAndAutoRefresh);

    $scope.$watch("mlTaskDesign.modeling.metrics", (nv) => {
        if (nv) {
            $scope.headIds = $scope.mlTaskStatus.fullModelIds
                .sort($scope.compareFMIs)
                .map(o => o.id).slice(0, 1);
            $scope.getModelSnippets([], true).then(() => {
                console.log("loaded mdg");
                $scope.puppeteerHook_elementContentLoaded = true;
            }); // get all snippets (long call)
            $scope.getModelSnippets($scope.headIds); // first quick call to display outline
        }
    });

    $scope.$on("$destroy", $scope.clearMLTasksContext);

    MLTasksNavService.setMlTaskIdToGo($stateParams.analysisId, $stateParams.mlTaskId);
    checkChangesBeforeLeaving($scope, $scope.dirtySettings, null, [$scope.sRefPrefix + '.list.design', $scope.sRefPrefix + '.list.results',]);

    if ($rootScope.mlTaskJustCreated === true) {
        delete $rootScope.mlTaskJustCreated;
        $scope.mlTaskJustCreated = true;
        $scope.touchMlTask = function() { delete $scope.mlTaskJustCreated; };
    } else {
        $scope.touchMlTask = function(){
            // nothing to touch, not just created
        };
    }

    $scope.prepareGuessPolicies = function(policies) {
        policies.forEach(policy => {
            // Disabled every policy that does not support current backend type
            if (!policy.supported_backends.includes($scope.mlTaskDesign.backendType)) {
                policy.disabled = true;
            }

            // Inject current backend type in custom algorithms policy description
            if (policy.id === 'CUSTOM') {
                policy.description = `Train your own ${ $scope.mlTaskDesign.backendType === 'PY_MEMORY' ? 'Python' : 'Scala' } models.`;
            }
        });
        return policies;
    }
    
    $scope.switchGuessPolicy = function(policy) {

        if (policy.disabled) { return; }

        if ($scope.dirtySettings()) {
            $scope.saveSettings();
        }
        
        CreateModalFromTemplate("/templates/analysis/mlcommon/settings/change-algorithm-presets-modal.html", $scope, null, function(newScope) {
            newScope.taskType = $scope.mlTaskDesign.taskType.toLowerCase();
            newScope.confirm = function() {
                $scope.MLAPI.changeGuessPolicy($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId, policy.id).then(function(response){
                        $scope.setMlTaskDesign(response.data);
                        $scope.saveSettings();
                        $scope.uiState.algorithm = $scope.base_algorithms[$scope.mlTaskDesign.backendType]
                            .find(_ => !_.condition || _.condition()).algKey;
                }, setErrorInScope.bind($scope));
                newScope.dismiss();
            };
            newScope.cancel = function() {
                newScope.dismiss();
            };
        });
    };

    $scope.$watch("selection.selectedObject", function(nv){
        $scope.getSessionTaskIfChanged((nv||{}).sessionId)
    });

    $scope.$watch('uiState.currentMetric', $scope.setMainMetric);

});


app.controller("_MLTaskResultsController", function($scope, $timeout, $state, $stateParams, ActivityIndicator,
    CreateModalFromTemplate, DataikuAPI, Fn, Dialogs, Collections, PartitionedModelsService, FullModelIdUtils,
    MLDiagnosticsService) {
    angular.extend($scope, PartitionedModelsService);
    angular.extend($scope, MLDiagnosticsService);

    $scope.partiallyAbortTraining = function(fullModelIds){
        var gsModels;
        if (!$scope.isModelOptimizing) {
            gsModels = [];
        } else {
            gsModels = fullModelIds.map(function(o){return $scope.modelSnippets[o]})
                .filter($scope.isModelOptimizing)
                .map(Fn.prop("fullModelId"));
        }
        CreateModalFromTemplate("/templates/analysis/mlcommon/abort-train-modal.html", $scope, null, function(newScope) {
            newScope.gsModels = gsModels;
            newScope.confirm = function() {
                DataikuAPI.analysis.mlcommon
                    .trainAbortPartial($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId, fullModelIds)
                    .success(function(){
                        ActivityIndicator.success("Abort requested");
                        fullModelIds.forEach(function(fmi){
                            $scope.modelSnippets[fmi].trainInfo.$userRequestedState = 'ABORTED';
                        });
                    }).error(setErrorInScope.bind($scope));
                newScope.dismiss();
            }
            newScope.finalize = function() {
                DataikuAPI.analysis.mlcommon.stopGridSearch(gsModels)
                    .success(function(data){
                        gsModels.map(function(fmi){ $scope.modelSnippets[fmi].trainInfo.$userRequestedState = 'FINALIZE' });
                        $scope.refreshStatus();
                    })
                    .error(setErrorInScope.bind($scope));
                newScope.dismiss();
            }
        });
    };

     function revertScriptToSession(projectKey, analysisId, mlTaskDesignId, sessionId) {
        return DataikuAPI.analysis.mlcommon.revertScriptToSession(projectKey, analysisId, mlTaskDesignId, sessionId)
        .then(function(response) {
            return response.data;
        }, setErrorInScope.bind($scope));
     };

    $scope.revertDesignToSession = function(sessionId) {
        $scope.getSessionTask(sessionId).then(function(sessionDesign){
            CreateModalFromTemplate("/templates/analysis/mlcommon/dump-session-design-modal.html", $scope, null, function(newScope) {
                newScope.sessionId = sessionId.slice(1);
                newScope.sessionDesign = sessionDesign;
                newScope.algorithms = {};
                newScope.selectAlgorithms = false;
                var algByKey = Collections.indexByField($scope.base_algorithms[$scope.mlTaskDesign.backendType], 'algKey');
                angular.forEach(sessionDesign.modeling, function(v,k) {
                    if (v.enabled) {
                        // for some reason XGBoost is referred to by its algKey "xgboost_regression" / "xgboost_classification" in base_algorithms
                        // but its key is xgboost in mlTask TODO: set this straight
                        if (k === "xgboost") {
                            newScope.algorithms[k] = {
                                enabled: true,
                                name: "XGBoost"
                            };
                        } else {
                            newScope.algorithms[k] = {
                                enabled: true,
                                name: algByKey[k].name
                            };
                        }
                    }
                });
                angular.forEach(sessionDesign.modeling.custom_mllib, function(v,k) {
                    if (v.enabled) {
                        newScope.algorithms["custom_mllib_"+k] = {
                            enabled: true,
                            name: "Custom MLLIB algorithm #" + k,
                        };
                    }
                });
                angular.forEach(sessionDesign.modeling.custom_python, function(v,k) {
                    if (v.enabled) {
                        newScope.algorithms["custom_python_"+k] = {
                            enabled: true,
                            name: "Custom python algorithm #" + k,
                        };
                    }
                });
                newScope.noEnabledAlgorithms = function() {
                    return $.map(newScope.algorithms, function(v,k) {return !v.enabled}).reduce(Fn.AND,true);
                }
                newScope.confirm = function() {
                    revertScriptToSession(newScope.projectSummary.projectKey, newScope.analysisId, newScope.mlTaskDesign.id, sessionId).then(function(scriptFile) {
                        $scope.analysisCoreParams.script = scriptFile;
                        if (newScope.selectAlgorithms) {
                            angular.forEach(newScope.algorithms, function(v,k) {
                                if (k.startsWith("custom_mllib_")) {
                                    newScope.sessionDesign.modeling.custom_mllib[parseInt(k.slice(13))].enabled = v.enabled;
                                } else if (k.startsWith("custom_python_")) {
                                    newScope.sessionDesign.modeling.custom_python[parseInt(k.slice(14))].enabled = v.enabled;
                                } else {
                                    newScope.sessionDesign.modeling[k].enabled = v.enabled;
                                }
                            });
                        }
                        $scope.updateSettings(newScope.sessionDesign);
                        $state.go('^.design');
                        newScope.dismiss();
                    });
                }
            });
        });
    }
    
    $scope.revertDesignToModel = function(fullModelId, algorithm){
        const idTokens = FullModelIdUtils.parse(fullModelId);
        const sessionId = idTokens.sessionId;
        CreateModalFromTemplate("/templates/analysis/mlcommon/dump-model-design-modal.html", $scope, null, function(newScope) {
            newScope.sessionId = sessionId.slice(1);            
            newScope.canChoose = ("SCIKIT_MODEL" !== algorithm && !$scope.isPartitionedSession(sessionId));
            if (newScope.canChoose) {
                newScope.dumpMode = "OPTIMIZED";
            } else {
                newScope.dumpMode = "INITIAL";
            }
            newScope.confirm = function() {
                revertScriptToSession(newScope.projectSummary.projectKey, newScope.analysisId, newScope.mlTaskDesign.id, sessionId).then(function(scriptFile) {
                    $scope.analysisCoreParams.script = scriptFile;
                    if (newScope.dumpMode=="OPTIMIZED") {
                        $scope.revertDesignToGridsearchedModel(fullModelId);
                        newScope.dismiss();
                    } else {
                        $scope.revertDesignToPretrainModel(fullModelId);
                        newScope.dismiss();
                    }
                });
            }
        });
    }

    $scope.revertDesignToPretrainModel = function (fullModelId) {
        $scope.getPretrainEquivalentMLTask(fullModelId,false).then(function(sessionDesign){
            $scope.updateSettings(sessionDesign);
            $state.go('^.design');
        });
    }

    $scope.revertDesignToGridsearchedModel = function (fullModelId) {
        $scope.getPretrainEquivalentMLTask(fullModelId, true).then(function(sessionDesign) {
            $scope.updateSettings(sessionDesign);
            $state.go('^.design');
        });
    }

    $scope.isMLBackendType = function(mlBackendType){
        if (!$scope.mlTaskDesign) return false; // might not be initialized
        return $scope.mlTaskDesign.backendType == mlBackendType;
    };

    $scope.isSparkBased = function(){
        return $scope.mlTaskDesign.backendType == 'MLLIB' || $scope.mlTaskDesign.backendType == 'H2O';
    };

    $scope.updateOrderQueryMetric = function(metric) {
        var ss = $scope.selection;
        ss.orderQuery = '-sortMainMetric';
        if ($scope.uiState.currentMetric === metric) {
            ss.orderReversed = !ss.orderReversed;
        } else {
            ss.orderReversed = false;
        }
        $scope.uiState.currentMetric = metric;
        $timeout($scope.updateSorted);
    }

    $scope.canDeleteSelectedModels = function() {
        return (!$scope.selection.selectedObjects.map(Fn.prop("trainInfo"))
            .map(function(o){return o.state=='RUNNING';})
            .reduce(function(a,b){return a&&b},true));
    }

    $scope.canCreateEnsemble = function(){
        // only watch for design taskType (front-end should not allow creating various taskType / targets inside single MLTask)
        if ($scope.mlTasksContext.activeMLTask.taskType != "PREDICTION" || $scope.selection.selectedObjects.length < 2){
            return false;
        }
        return $scope.selection.selectedObjects.every(function(so){ return so.trainInfo.state == "DONE"; });
    };

    $scope.createEnsemble = function(){
        var fmis = $scope.selection.selectedObjects.map(function(o){ return o.fullModelId; });

        DataikuAPI.analysis.pml.checkCanEnsemble(fmis).success(function(data){
            CreateModalFromTemplate("/templates/analysis/prediction/create-ensemble-modal.html", $scope, "EnsembleModalController", function(newScope){
                newScope.fmis = fmis;
                newScope.params.method = (data.availableMethods && data.availableMethods.length) ? data.availableMethods[0].method : null;
                newScope.canEnsemble = data.canEnsemble;
                newScope.reason = data.reason;
                newScope.availableMethods = data.availableMethods;
                var methodMap = {};
                for(var i = 0; i < newScope.availableMethods.length; i++){
                    var par = newScope.availableMethods[i];
                    methodMap[par.method] = par.description;
                }
                newScope.getSelectedMethodDescription = function(){
                    return methodMap[newScope.getMethod()];
                };
                newScope.showTiesWarning = function(){
                    if(newScope.getMethod()==='VOTE'){
                        if($scope.mlTaskDesign.predictionType==="BINARY_CLASSIFICATION"){
                            return ((fmis.length % 2)===0); // show warning only if even number of models
                        } else {
                            // for c classes, and m models the condition for no-ties guaranty is that
                            // m > c and
                            // m % 2 ≠ 0, ..., m % c ≠ 0 which is, more often than not, false.
                            return ($scope.mlTaskDesign.predictionType==="MULTICLASS");
                        }
                    } else {
                        return false;
                    }
                };
                newScope.submit = function(){
                    DataikuAPI.analysis.pml.createEnsemble(
                        $stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId, fmis, newScope.getMethod()
                    ).success(function(){
                        $scope.removeTaskStatus();
                        $scope.initialRefreshAndAutoRefresh();
                        newScope.dismiss();
                    }).error(setErrorInScope.bind($scope));
                };
            });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.allStarredModels = function() {
        var selectedObjects = $scope.selection.selectedObjects.filter(function(o){return o.trainInfo.state==='DONE';})
        return selectedObjects.map(Fn.prop("userMeta"))
            .map(Fn.prop("starred"))
            .reduce(function(a,b){return a&&b},true);
    }
    $scope.canStarSelectedModels = function() {
        return $scope.selection.selectedObjects.map(Fn.prop("trainInfo"))
            .map(function(o){return o.state=='DONE';})
            .reduce(function(a,b){return a&&b},true);
    }
    $scope.starSelectedModels = function(star) {
        var selectedObjects = $scope.selection.selectedObjects.filter(function(o){return o.trainInfo.state==='DONE';})
        selectedObjects.map(function(m){
            m.userMeta.starred = star;
        });
    }

    $scope.isModelFinalizing = function(model) {
        let key = $scope.isMLBackendType("KERAS") ? "modelTrainingInfo" : "gridsearchData";
        if (!model||!model[key]) { return false }
        return model[key].isFinalizing && $scope.isModelRunning(model);
    }

    $scope.isModelOptimizing = function(model) {
        // Interrupting model is currently not supported for partitioned models
        if (model.partitionedModelEnabled) {
            return false;
        }
        if (!$scope.isMLBackendType("KERAS")) {
            if (!model) { return false }
            const doingGridSearch = model.gridsearchData && !model.gridsearchData.isFinalizing && model.gridsearchData.gridPoints.length > 0;
            return doingGridSearch && $scope.isModelRunning(model);
        } else {
            if (!model||!model.modelTrainingInfo) { return false }
            return !model.modelTrainingInfo.isFinalizing
                && $scope.anySessionModelHasOptimizationResults()
                && !$scope.anyModelHasAllEpochsFinished()
                && $scope.isModelRunning(model);
        }
    };

    $scope.hasOptimizingModels = function(sessionId) {
        return $scope.selection && $scope.selection.allObjects && $scope.selection.allObjects
            .some(function(model) {
                return model.sessionId === sessionId
                    && $scope.isModelOptimizing(model);
            });
    }

    $scope.isModelOptimizationResumable = function(model) {
        // Resuming optimization is not supported for KERAS algorithms
        if ($scope.isMLBackendType("KERAS")) {
            return false;
        }

        // Resuming optimization is not supported for partitioned models
        if (model.partitionedModelEnabled) {
             return false;
        }
        
        const searchProgress = $scope.getModelSearchProgress(model);
        return $scope.isModelDone(model) 
            && ($scope.isModelOptimizationBoundByTimeout(model) || (searchProgress !== undefined && searchProgress < 1));
    };

    $scope.isModelOptimizationBoundByTimeout = function(model) {
        const gsd = model.gridsearchData;
        if (!gsd) {
            return false;
        }
        return (gsd.gridSize === 0 && gsd.timeout > 0);
    };
    
    $scope.getModelSearchProgress = function(model) {
        const gsd = model.gridsearchData;
        if (!gsd) {
            return undefined;
        }

        if (gsd.gridSize !== 0) {
            return model.gridsearchData.gridPoints.length / model.gridsearchData.gridSize;
        } else if (gsd.timeout > 0) { // model search is bound by timeout, need to look at time spent
            return  Math.min(1, (model.trainInfo.hyperparamsSearchTime / 1000) / (gsd.timeout * 60));
        }
        return 0;
    };

    $scope.isModelDone = function(model) {
        if (!model||!model.trainInfo) { return false }
        return model.trainInfo.state === 'DONE';
    }

    $scope.isModelPending = function(model) {
        if (!model||!model.trainInfo) { return false }
        return model.trainInfo.state === 'PENDING';
    }

    $scope.isModelFailedOrAborted = function(model) {
        if (!model||!model.trainInfo) { return false }
        return model.trainInfo.state === 'FAILED' || model.trainInfo.state === 'ABORTED';
    }
    $scope.isModelFailed = function(model) {
        if (!model||!model.trainInfo) { return false }
        return model.trainInfo.state === 'FAILED';
    }

    $scope.isModelRetrainable = function(model) {
        return  !$scope.mlTaskStatus.training
            && $scope.mlTasksContext.activeMLTask.taskType === "PREDICTION"
            && !$scope.isMLBackendType("KERAS")
            && ($scope.isModelAborted(model)
                || model.partitionedModelEnabled && $scope.getPartitionsSnippetStateSize(model, "ABORTED") > 0);
    }

    $scope.hasResumableModels = function(sessionId) {
        return $scope.selection && $scope.selection.allObjects
            && $scope.selection.allObjects.some(function(model) {
                return model.sessionId === sessionId
                    && ($scope.isModelOptimizationResumable(model) || $scope.isModelRetrainable(model));
            });
    }

    $scope.isModelAborted = function(model) {
        if (!model||!model.trainInfo) { return false }
        return model.trainInfo.state === 'ABORTED';
    }

    $scope.isModelRunning = function(model) {
        if (!model||!model.trainInfo) { return false }
        return model.trainInfo.state === 'RUNNING' || model.trainInfo.state === 'PENDING';
    }

    $scope.isBestModelScore = function(model, sameSession) {
        return model.sortMainMetric >= $scope.selection.allObjects
            .filter(o => !sameSession || o.sessionId === model.sessionId)
            .map(Fn.prop('sortMainMetric'))
            .reduce(Fn.MAX,-Number.MAX_VALUE);
    }

    $scope.sessionRunningCount = function(sessionId) {
        if (!$scope.selection||!$scope.selection.allObjects){return false;}
        return $scope.selection.allObjects.filter(function(o){return o.sessionId===sessionId})
            .map($scope.isModelRunning).map(function(o){return o?1:0}).reduce(Fn.SUM,0);
    }

    $scope.isSessionRunning = function(sessionId) {
        if (!$scope.selection||!$scope.selection.allObjects){return false;}
        return $scope.selection.allObjects.filter(function(o){return o.sessionId===sessionId})
            .map(function(m){return m.trainInfo.state === 'RUNNING' || m.trainInfo.state === 'PENDING'})
            .reduce(Fn.OR,false);
    }

    $scope.isPartitionedSession = function(sessionId) {
        if (!$scope.selection || !$scope.selection.allObjects) { return false; }

        return $scope.selection.allObjects
            .filter(o => o.sessionId === sessionId)
            .every(m => m.partitionedModelEnabled);
    };

    $scope.getAggregationExplanation = function(metricName) {
        const displayName = $scope.possibleMetrics.find(_ => _[0] === metricName)[1];
        return PartitionedModelsService.getAggregationExplanation(metricName, displayName);
    }

    $scope.getSessionStartDate = function(sessionId) {
        var minDate = 0;
        $scope.getSessionModels($scope.selection.allObjects, sessionId).forEach(function(x) {
            if (x && x.trainInfo && x.trainInfo.startTime) {
                minDate = Math.max(minDate, x.trainInfo.startTime)
            }
        });
        if (minDate == 0) {
            return null;
        } else {
            return new Date(minDate);
        }
    }

    $scope.getSessionEndDate = function(sessionId) {
        var maxDate = 0;
        $scope.getSessionModels($scope.selection.allObjects, sessionId).forEach(function(x) {
            if (x && x.trainInfo && x.trainInfo.endTime) {
                maxDate = Math.max(maxDate, x.trainInfo.endTime)
            }
        });
        if (maxDate == 0) {
            return null;
        } else {
            return new Date(maxDate);
        }
    }


    $scope.deleteSession = function(sessionId) {
        var fullModelIds = $scope.selection.allObjects
            .filter(function(o){return !$scope.isModelRunning(o) && o.sessionId === sessionId})
            .map(Fn.prop("fullModelId"));
        Dialogs.confirm($scope, "Delete " + fullModelIds.length + " models",
        "Do you want to delete these models ?").then(function() {
            DataikuAPI.ml.deleteModels(fullModelIds).success(function(data){
                fullModelIds.forEach(function(fmi){ delete $scope.modelSnippets[fmi] })
                $scope.refreshStatus().then($scope.selectRunningOrFirstSession);
            });
        });
    }

    $scope.deleteModel = function(model) {
        if ($scope.isModelRunning(model)) { return; }
        Dialogs.confirm($scope, "Delete this model", "Do you want to delete this model ?").then(function() {
            DataikuAPI.ml.deleteModels([model.fullModelId]).success(function(data){
                delete $scope.modelSnippets[model.fullModelId];
                if (Object.values($scope.modelSnippets)
                    .filter(function(s){ return s.sessionId === $scope.sessionTask.sessionId }).length === 0) {
                    $scope.refreshStatus().then($scope.selectRunningOrFirstSession);
                }
            });
        });
    }

    $scope.deleteSelectedModels = function() {
        var fullModelIds = $scope.selection.selectedObjects
            .filter(function(o) { return o.trainInfo.state !== 'RUNNING' })
            .map(Fn.prop("fullModelId"));
        Dialogs.confirm($scope, "Delete " + fullModelIds.length + " models",
        "Do you want to delete these models ?").then(function() {
            DataikuAPI.ml.deleteModels(fullModelIds).success(function(data){
                fullModelIds.forEach(function(fmi){ delete $scope.modelSnippets[fmi] });
                if (Object.values($scope.modelSnippets)
                    .filter(function(s){ return s.sessionId === $scope.sessionTask.sessionId }).length === 0) {
                    $scope.refreshStatus().then($scope.selectRunningOrFirstSession);
                }
            });
        });
    };

    $scope.toggleStarred = function(snippetData) {
        snippetData.userMeta.starred = !snippetData.userMeta.starred;
        DataikuAPI.ml.saveModelUserMeta(snippetData.fullModelId, snippetData.userMeta)
                            .error(setErrorInScope.bind($scope.$parent));
        $scope.$emit('refresh-list');
    }

    $scope.getSessions = function(models){
        return models.map(function(m){
            return m.sessionId;
        }).filter(function(value, index, self){
            return self.indexOf(value) === index;
        }).sort(function(a, b){
            return parseInt(b.slice(1))-parseInt(a.slice(1))
        });
    };

    $scope.getSessionModels = function(models, sessionId) {
        return (models || []).filter(m => m.sessionId === sessionId);
    };

    $scope.$watch("uiState.viewMode", function(nv){
        if (nv==='sessions') {
            $scope.selection.orderQuery = ['-sessionDate','algorithmOrder'];
        } else {
            $timeout(function(){
                $scope.$broadcast('redrawFatTable');
            });
            $scope.selection.orderQuery = [];
        }
    });

    $scope.scrollToModel = (selectedModel) => {
        if (!selectedModel) { return }
        const selectedModelDOM = document.getElementById(selectedModel.fullModelId);
        if (selectedModelDOM) {
            selectedModelDOM.scrollIntoView();
        }
    };

    function getAllAlgorithmTypes() {
        let allAlgorithmTypes = [];
        Object.keys($scope.algorithmCategories).forEach((key, index) => {
            allAlgorithmTypes = allAlgorithmTypes.concat($scope.algorithmCategories[key])
        });
        return allAlgorithmTypes;
    }

    $scope.resetCategories = function() {
        for (let key of Object.keys($scope.selection.filterCategory)) {
            $scope.selection.filterCategory[key] = false;
        }
    }
    
    $scope.uiState.filterAlgorithms = false;
    $scope.clearModelsListFilters = function() {
        $scope.uiState.filterAlgorithms = false;
        $scope.clearFilters();
        $scope.resetCategories();
    }
    $scope.algorithmsFilter = function (filteredObjects) {
        if ($scope.selection.filterCategory) {
            for (let key of Object.keys($scope.selection.filterCategory)) {
                if (key === "Others" && $scope.selection.filterCategory["Others"]) {
                    filteredObjects = filteredObjects.filter(x => getAllAlgorithmTypes().includes(x.algorithm));
                }
                else if ($scope.selection.filterCategory[key]) {
                    filteredObjects = filteredObjects.filter(x => !$scope.algorithmCategories[key].includes(x.algorithm));
                }
            }
        }
        return filteredObjects;
    };
    $scope.algorithmCategoriesWithOthers = Object.keys($scope.algorithmCategories).concat("Others");
});

app.service("MLDiagnosticsDefinition", (DataikuAPI) => {
    const promise = DataikuAPI.analysis.mlcommon.getDiagnosticsDefinition(); // eager fetch
    return {
        fetch: function(callback) {
            promise.success(callback);
        }
    };
});

app.service("MLDiagnosticsService", () => {
    return {
        groupByStepAndType: (trainDiagnostics) => {
            if (!trainDiagnostics || !trainDiagnostics.diagnostics) {
                return {};
            }

            const groupedDiagnostics = {};
            for (const diagnostic of trainDiagnostics.diagnostics) {
                groupedDiagnostics[diagnostic.step] = groupedDiagnostics[diagnostic.step] || {};
                const groupedStep = groupedDiagnostics[diagnostic.step];
                groupedStep[diagnostic.displayableType] = groupedStep[diagnostic.displayableType] || [];

                const messages = groupedStep[diagnostic.displayableType];
                messages.push(diagnostic.message);
            }

            return groupedDiagnostics;
        },
        groupByType: (trainDiagnostics) => {
            if (!trainDiagnostics || !trainDiagnostics.diagnostics) {
                return {};
            }

            const groupedDiagnostics = {};
            for (const diagnostic of trainDiagnostics.diagnostics) {
                groupedDiagnostics[diagnostic.type] = groupedDiagnostics[diagnostic.type] || [];
                const messages = groupedDiagnostics[diagnostic.type];
                messages.push(diagnostic.message);
            }

            return groupedDiagnostics;
        },
        hasDiagnostics: (model) => {
            if (!model) {
                return false;
            }

            const _hasDiagnostics = model => ((model.trainDiagnostics && model.trainDiagnostics.diagnostics) || []).length > 0;

            if (!model.partitionedModelEnabled) {
                return _hasDiagnostics(model);
            } else {
                return model.partitions &&  // check warnings in each summary
                    Object.values(model.partitions.summaries).map(s => s.snippet).some(_hasDiagnostics);
            }
        },
        countDiagnostics: model => {
            if (!model) {
                return 0;
            }

            const _countDiagnostics = model => {
                if (!model.trainDiagnostics || !model.trainDiagnostics.diagnostics) {
                    return 0;
                }

                return model.trainDiagnostics.diagnostics.length;
            }

            let total = 0;
            if (!model.partitionedModelEnabled) {
                total = _countDiagnostics(model);
            } else { // check warnings in each summary
                for (const s of Object.values(model.partitions.summaries)) {
                    if (s.state === "FAILED") {
                        continue;
                    }
                    total += _countDiagnostics(s.snippet);
                }
            }

            return total;
        },
        getDiagnosticsTextForPartitions: model => {
            if (!model || !model.partitionedModelEnabled) {
                return null;
            }

            let countWithDiagnostics = 0;
            for (const s of Object.values(model.partitions.summaries)) {
                if (s.state !== "FAILED" && Object.keys((s.snippet.trainDiagnostics && s.snippet.trainDiagnostics.diagnostics) || []).length > 0) {
                    countWithDiagnostics++;
                }
            }

            const totalPartitions = Object.values(model.partitions.summaries).length;
            if (countWithDiagnostics === 1) {
                return `On one partition out of ${totalPartitions}`;
            } else {
                return `On ${countWithDiagnostics} out of ${totalPartitions} partitions`;
            }
        }
    };
});

app.factory("VisualMlCodeEnvCompatibility", function() {
    return {
        isCompatible: function(envSelection, envCompatList, isDeepLearning, isSkopt) {
            if (!envSelection || !envCompatList || !envCompatList.envs) {
                return false;
            }

            let envCompat;
            switch(envSelection.envMode) {
                case "USE_BUILTIN_MODE":
                    envCompat = envCompatList.builtinEnvCompat;
                    break;
                case "INHERIT": {
                    if (!envCompatList.resolvedInheritDefault) { // Project code-env is builtin
                        envCompat =  envCompatList.builtinEnvCompat;
                    } else {
                        envCompat = envCompatList.envs.find(env => env.envName == envCompatList.resolvedInheritDefault);
                    }
                    break;
                }
                case "EXPLICIT_ENV":
                    envCompat = envCompatList.envs.find(env => env.envName == envSelection.envName);
                    break;
            }

            return envCompat && (
                isDeepLearning ? envCompat.deepLearning
                     : isSkopt ? envCompat.regularMlWithBayesian
                     : envCompat.regularMl
                 ).compatible;
        }
    }
})

app.directive("codeEnvSelectionWithMlPackagesForm", function(VisualMlCodeEnvCompatibility){
    return {
        restrict: 'A',
        templateUrl : '/templates/analysis/mlcommon/code-env-selection-with-ml-packages-form.html',
        scope: {
            envSelection: '=codeEnvSelectionWithMlPackagesForm',
            codeEnvsCompat: "=",
            isDeepLearning: "=",
            isSkopt: "="
        },
        link: function($scope, element, attrs) {

            $scope.envModes = [
                ['USE_BUILTIN_MODE', 'Use DSS builtin env'],
                ['INHERIT', 'Inherit project default'],
                ['EXPLICIT_ENV', 'Select an environment']
            ];

            $scope.isCompatible = function() {
                return VisualMlCodeEnvCompatibility.isCompatible($scope.envSelection, $scope.codeEnvsCompat, $scope.isDeepLearning, $scope.isSkopt);
            };

            function setDefaultValue() {
                if (!$scope.envSelection) { // not ready
                    return;
                }
                const atLeastOneEnv = $scope.sortedCodeEnvs && $scope.sortedCodeEnvs.length > 0;
                if ($scope.envSelection.envMode == "EXPLICIT_ENV" && $scope.envSelection.envName == null && atLeastOneEnv) {
                    $scope.envSelection.envName = $scope.sortedCodeEnvs[0].envName;
                }
            }
            $scope.$watch("envSelection.envMode", setDefaultValue);

            // Artificially add null value to description list when selected env does not match any listed envs
            // to prevent from breaking the UI (this can happen if selected env has been deleted for example)
            function addNullValueToDescriptionsIfNameNotInList() {
                const isExplicit = $scope.envSelection && $scope.envSelection.envMode === "EXPLICIT_ENV";
                const atLeastOneEnv = $scope.sortedCodeEnvs && $scope.sortedCodeEnvs.length > 0;
                if (!isExplicit || !atLeastOneEnv) {
                    return;
                }
                const listHasNullFirst = ($scope.envDescriptions[0] === null);
                if (!$scope.sortedCodeEnvs.some(x => x.envName === $scope.envSelection.envName)) {
                    if (!listHasNullFirst) {
                        $scope.envDescriptions.unshift(null);
                    }
                } else if (listHasNullFirst) {
                    $scope.envDescriptions.shift();
                }
            }
            $scope.$watch("envSelection.envName", addNullValueToDescriptionsIfNameNotInList);

            function getIncompatibleDesc(reasons, defaultDesc) {
                if (!reasons || reasons.length === 0) {
                    return  `<span class='text-warning'>${defaultDesc}</span>`;
                } else if (reasons.length === 1) {
                    return `<span class='text-warning'>${reasons[0]}</span>`;
                } else {
                    return reasons.map(r => `<p class='text-warning'>${r}</p>`).join('');
                }
            }

            function fillEnvsData() {
                if ($scope.codeEnvsCompat.resolvedInheritDefault == null) {
                    $scope.envModes[1][1] = "Inherit project default (DSS builtin env)";
                } else {
                    $scope.envModes[1][1] = "Inherit project default (" + $scope.codeEnvsCompat.resolvedInheritDefault + ")";
                }
    
                $scope.sortedCodeEnvs = $scope.codeEnvsCompat.envs.map( env => {
                    let envDesc;
                    if ($scope.isDeepLearning) {
                        if (env.deepLearning.compatible) {
                            env.compatible = true;
                            if (env.deepLearning.supportsGpu) {
                                envDesc = "has required packages for Deep Learning (GPU or CPU).";
                            } else {
                                envDesc = "has required packages for Deep Learning (CPU).";
                            }
                        } else {
                            env.compatible = false;
                            envDesc = getIncompatibleDesc(env.deepLearning.reasons,
                                "seems incompatible with Deep Learning models");
                        }
                    } else if ($scope.isSkopt) {
                        if (env.regularMlWithBayesian.compatible) {
                            env.compatible = true;
                            envDesc = "has required packages for visual ML with bayesian search.";
                        } else {
                            env.compatible = false;
                            envDesc = getIncompatibleDesc(env.regularMlWithBayesian.reasons,
                                "seems incompatible with visual ML models with bayesian search");
                        }
                    } else {
                        if (env.regularMl.compatible) {
                            env.compatible = true
                            envDesc = "has required packages for visual ML.";
                        } else {
                            env.compatible = false;
                            envDesc = getIncompatibleDesc(env.regularMl.reasons,
                                "seems incompatible with run visual ML models");
                        }
                    }
                    env.envDesc = envDesc;
                    return env;
                }).sort((env1, env2) => (env1.compatible === env2.compatible) ? 0 : (env1.compatible ? -1 : 1));
    
                $scope.envDescriptions = $scope.sortedCodeEnvs.map(env => env.envDesc);
                addNullValueToDescriptionsIfNameNotInList();
            }
            $scope.$watch("[ codeEnvsCompat, isDeepLearning, isSkopt ]", fillEnvsData, true);

        }
    }
});

app.directive('modelsTableData', ['computeColumnWidths', '$window', function(computeColumnWidths, $window) {
    return {
        scope : false,
        restrict : 'A',
        link: function($scope, element) {
            $scope.displayedTableColumns = [];
            $scope.displayedTableRows = [];

            // To correct table width on window resize
            angular.element($window).on('resize', function(){
                $scope.$apply($scope.adjustColumnWidths);
            });

            $scope.$on("$destroy",function (){
                angular.element($window).off("resize"); //remove the handler added earlier
            });

            $scope.adjustColumnWidths = function() {
                let maxWidth = element.prop("clientWidth") - 16; // The -16px is to take into account the fatTable
                                                                 // vertical scrollbar width on firefox

                if ($scope.computedTableWidth < maxWidth) {
                    $scope.displayedColumnsWidths = [];
                    let totalWidth = 0; // Keep track of the total width to correct rounding error
                    $scope.computedColumnWidths.forEach(function(width) {
                       let newWidth = Math.round(width * maxWidth/$scope.computedTableWidth);
                       totalWidth += newWidth;
                       $scope.displayedColumnsWidths.push(newWidth);
                    });
                    if (totalWidth > maxWidth) {
                        // Correct width rounding error (usually difference is 0 or 1), by removing
                        // the difference to last column's width
                        $scope.displayedColumnsWidths.push(
                            $scope.displayedColumnsWidths.splice(-1, 1)[0] - (totalWidth - maxWidth)
                        );
                    }
                } else {
                    $scope.displayedColumnsWidths = $scope.computedColumnWidths;
                }
            }

            var refreshDisplayedColumns = function() {
                $scope.displayedTableColumns = [
                    {isModelSel: true},
                    {isModelName: true},
                    {isModelTrainTime: true},
                    {isModelTrainTimeMetric: true}
                ];

                let header = [
                    {name: "sel", ncharsToShow: 5},
                    {name: "Name", ncharsToShow: 25},
                    {name: "Trained", ncharsToShow: 20},
                    {name: "Train time", ncharsToShow: 6}
                ];

                if ($scope.mlTaskDesign.backendType=='PY_MEMORY' && $scope.mlTaskDesign.taskType=='PREDICTION') {
                    $scope.displayedTableColumns.push({isSampleWeights: true});
                    header.push({name: "Sample weights", ncharsToShow: 5})
                }

                if ($scope.possibleMetrics) {
                    $scope.possibleMetrics.forEach(function(metric) {
                        $scope.displayedTableColumns.push({isModelMetric: true, metric: metric});
                        header.push({name: "MMMMM MMMMM", ncharsToShow: 10}) // Dummy name of length 11 for all metrics
                    });
                }

                $scope.displayedTableColumns.push({isModelStarred: true});
                header.push({name: "star", ncharsToShow: 1})

                $scope.computedColumnWidths = computeColumnWidths([], header, 30, () => false, {}, true)[0];
                $scope.computedTableWidth =  $scope.computedColumnWidths.reduce((a, b) => a + b);
                $scope.adjustColumnWidths();
            };

            var refreshDisplayedRows = function() {

                // build rows for the fattable
                $scope.displayedTableRows = [];
                if ($scope.selection.filteredObjects) {
                    $scope.selection.filteredObjects.forEach(function(summ) {
                        var row = [
                            {isModelSel: true, summ: summ},
                            {isModelName: true, summ: summ},
                            {isModelTrainTime: true, summ: summ},
                            {isModelTrainTimeMetric: true, summ: summ}
                        ];
                        if ($scope.mlTaskDesign.backendType=='PY_MEMORY' && $scope.mlTaskDesign.taskType=='PREDICTION') {
                            row.push({isSampleWeights: true, summ: summ});
                        }
                        if ($scope.possibleMetrics) {
                            $scope.possibleMetrics.forEach(function(metric) {
                                row.push({isModelMetric: true, metric: metric, summ: summ});
                            });
                        }
                        row.push({isModelStarred: true, summ: summ});
                        $scope.displayedTableRows.push(row);
                    });
                }

            };

            refreshDisplayedColumns();

            $scope.$watchCollection('selection.filteredObjects', function() {
                refreshDisplayedRows();
            });

            $scope.$on('redrawFatTable', function() {
                refreshDisplayedColumns();
                refreshDisplayedRows();
            });
       }
    };
}])

})();
