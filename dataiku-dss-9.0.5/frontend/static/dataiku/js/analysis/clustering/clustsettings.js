(function(){
'use strict';

var app = angular.module('dataiku.analysis.mlcore');


app.service('CMLSettings', function(Fn) {
    var cst = {
        task: {
            evaluationMetrics: [
                ["SILHOUETTE", "Silhouette"],
                ["INERTIA", "Inertia"],
                ["NB_CLUSTERS", "Clusters"]
            ],
            outliersMethods: [
                ["NONE", "Do not detect outliers"],
                ["DROP", "Drop outliers"],
                ["CLUSTER", "Create a cluster with all outliers"]
            ]
        }, names: {
            evaluationMetrics: {
                SILHOUETTE: "Silhouette",
                INERTIA: "Inertia",
                NB_CLUSTERS: "Clusters"
            },
            algorithms: {
                a_km: "KMeans",
                b_hc: "Hierarchical",
                c_sc: "Spectral",
                d_db: "Density-based"
            }
        }, filter: {
            algorithms: {
                a_km: ['KMEANS', 'MiniBatchKMeans'],
                b_hc: ['WARD'],
                c_sc: ['SPECTRAL'],
                d_db: ['DBSCAN', 'OPTICS']
            }
        }, sort: {
            lowerBetter: ['INERTIA', 'NB_CLUSTERS'] // Simplification
        }, base_algorithms: {
            PY_MEMORY: [
                {name:'KMeans',algKey:'kmeans_clustering'},
                {name:'Gaussian Mixture',algKey:'gmm_clustering'},
                {name:'Mini-Batch KMeans',algKey:'mini_batch_kmeans_clustering'},
                {name:'Agglomerative clustering',algKey:'ward_clustering'},
                {name:'Spectral clustering',algKey:'spectral_clustering'},
                {name:'DBSCAN',algKey:'db_scan_clustering'},
                {name:'Interactive clustering',algKey:'two_step'},
                {name:'Isolation Forest',algKey:'isolation_forest'},
            ],
            MLLIB: [
                {name:'KMeans',algKey:'mllib_kmeans_clustering'},
                {name:'Gaussian Mixture',algKey:'mllib_gaussian_mixture_clustering'},
                {name:'Interactive clustering',algKey:'two_step'},
                {name:'Isolation Forest',algKey:'isolation_forest'},
            ],
            H2O :[
                {name:'KMeans',algKey:'h2o_kmeans'},
            ],
        }, algorithmCategories: {
            "KMeans": ['KMEANS', 'MiniBatchKMeans'],
            "Hierarchical": ['WARD'],
            "Spectral": ['SPECTRAL'],
            "Density-based": ['DBSCAN', 'OPTICS']
        }, noDollarKey: function(k) {
            return !k.startsWith('$') && k != "_name" && k != "datasetColumnId" && k != "userModified";
        },
    };
    cst.sort.lowerIsBetter = function (e, customEvaluationMetricGIB) {
        if (e === "CUSTOM") {
            if (customEvaluationMetricGIB == undefined) {return false;}
            else {return !customEvaluationMetricGIB;}
        }
        return (cst.sort.lowerBetter.indexOf(e) !== -1);
    };
    return cst;
});


app.controller("CMLTaskBaseController", function($scope, $timeout, $controller, Assert, DataikuAPI, CMLSettings, CMLFilteringService,
            $state, $stateParams, TopNav, Collections, Dialogs, CreateModalFromTemplate, Fn) {
    $scope.MLAPI = DataikuAPI.analysis.cml;
    $scope.FilteringService = CMLFilteringService;
    $scope.SettingsService = CMLSettings;

    $scope.$state = $state;
    $scope.sRefPrefix = 'projects.project.analyses.analysis.ml.clustmltask';
    $scope.algorithmCategories = CMLSettings.algorithmCategories;
    $scope.base_algorithms = CMLSettings.base_algorithms;
    $scope.metricMap = CMLFilteringService.metricMap;
    $scope.outliersMethods = CMLSettings.task.outliersMethods;

    $controller("_MLTaskBaseController",{$scope:$scope});

    $scope.newTrainSessionModalDisplayed = false;
    function newTrainSessionCallback() {
        DataikuAPI.analysis.cml.getUpdatedSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
            DataikuAPI.analysis.cml.saveSettings($stateParams.projectKey, $stateParams.analysisId, data).success(function(data){
                if (!$scope.newTrainSessionModalDisplayed) {
                    $scope.newTrainSessionModalDisplayed = true;
                    CreateModalFromTemplate("/templates/analysis/clustering/pre-train-modal.html", $scope, "CMLTaskPreTrainModal").then(function(){
                        $scope.newTrainSessionModalDisplayed = false;
                        $scope.initialRefreshAndAutoRefresh();
                        if ($state.current.name !== $scope.sRefPrefix + '.list.results') {
                            $state.go($scope.sRefPrefix + '.list.results');
                        } else {
                            $scope.uiState.viewMode = "sessions";
                        }
                    }, function(){
                        $scope.newTrainSessionModalDisplayed = false;
                    });
                }
            }).error(setErrorInScope.bind($scope));
        }).error(setErrorInScope.bind($scope));
    }
    $scope.newTrainSession = function() {
        if ($scope.dirtySettings()) { $scope.saveSettings().then(newTrainSessionCallback) }
        else { newTrainSessionCallback() }
    };

    $scope.saveSettings = function() {
        Assert.inScope($scope, "mlTaskDesign");

        return DataikuAPI.analysis.cml.saveSettings($stateParams.projectKey, $stateParams.analysisId, $scope.mlTaskDesign).success(function(data) {
            resetErrorInScope($scope);
            $scope.savedSettings = dkuDeepCopy($scope.mlTaskDesign, CMLSettings.noDollarKey);
        }).error(setErrorInScope.bind($scope));
    };

    // watchers & init

    DataikuAPI.analysis.mlcommon.getLastPreprocessingStatus($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
        $scope.lastPreprocessingStatus = data;
    }).error(setErrorInScope.bind($scope));

    // to be run if not guessing
    $scope.initMlTaskDesign = function() {
        $scope.$watch("analysisCoreParams", function(nv, ov) {
            if (!nv) return;
            DataikuAPI.analysis.cml.getUpdatedSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
                $scope.setMlTaskDesign(data);
                
                DataikuAPI.analysis.cml.listGuessPolicies().success(data => {
                    $scope.guessPolicies = data.auto.concat(data.expert).filter(policy => policy.id !== 'ALGORITHMS'); // useless (choose from all algos)
                    $scope.guessPolicies = $scope.prepareGuessPolicies($scope.guessPolicies);
                }).error(setErrorInScope.bind($scope));    

                $scope.savedSettings = dkuDeepCopy($scope.mlTaskDesign, CMLSettings.noDollarKey);
                $scope.uiState.algorithm = $scope.base_algorithms[data.backendType]
                    .filter(function(o){ return (!o.condition || o.condition()) })[0].algKey;
                $scope.uiState.userPredictionType = data.predictionType;
           }).error(setErrorInScope.bind($scope));
        });
    }
});


app.controller("CMLTaskResultController", function($scope, $controller) {
    $controller("_MLTaskResultsController", {$scope});

});


app.controller("CMLTaskDesignController", function($scope, $controller, $state, $stateParams,
            DataikuAPI, TopNav, Dialogs, CreateModalFromTemplate, Fn, CMLSettings, PMLSettings, CMLFilteringService,
            WT1) {
    $controller("_MLTaskDesignController",{$scope:$scope});
    
    $scope.addCustomPython = function() {
        var code = "# This sample code uses a standard scikit-learn algorithm, the Birch clustering.\n\n" +
                   "# Your code must create a 'clf' variable. This clf must be a scikit-learn compatible\n" +
                   "# model, ie, it should:\n" +
                   "#  1. have at least fit(X), fit_predict(X) and predict(X) methods\n" +
                   "#  2. inherit sklearn.base.BaseEstimator\n" +
                   "#  3. handle the attributes in the __init__ function\n" +
                   "#     See: https://doc.dataiku.com/dss/latest/machine-learning/custom-models.html\n\n" +
                   "from sklearn.cluster import Birch\n\n"+
                   "clf = Birch(n_clusters=5)\n"

        $scope.mlTaskDesign.modeling.custom_python = $scope.mlTaskDesign.modeling.custom_python || [];
        var expectedAlgKey = 'custom_python_' + $scope.mlTaskDesign.modeling.custom_python.length;
        $scope.uiState.algorithm = expectedAlgKey;
        $scope.mlTaskDesign.modeling.custom_python.push({
            enabled: true,
            k: [5],
            name: "Custom Python model",
            code: code,
        });
    };

    $scope.addCustomMLLib = function() {
        var code = "// This sample code uses a standard MLlib algorithm, the KMeans.\n\n" +
                   "// import the Estimator from spark.ml\n" +
                   "import org.apache.spark.ml.clustering.KMeans\n\n" +
                   "// instantiate the Estimator\n" +
                   "new KMeans()\n" +
                   "  .setFeaturesCol(\"__dku_features\") // Must always be __dku_features\n" +
                   "  .setPredictionCol(\"cluster\") // Must always be cluster\n" +
                   "  .setK(5)\n";

        $scope.mlTaskDesign.modeling.custom_mllib = $scope.mlTaskDesign.modeling.custom_mllib || [];
        var expectedAlgKey = 'custom_mllib_' + $scope.mlTaskDesign.modeling.custom_mllib.length;
        $scope.uiState.algorithm = expectedAlgKey;
        $scope.mlTaskDesign.modeling.custom_mllib.push({
            enabled: true,
            k: [5],
            name: "Custom MLlib model",
            initializationCode: code,
        });
    };

    $scope.getAlgorithmTemplate = function() {
        if (!$scope.uiState||!$scope.uiState.algorithm) {
            return;
        } else if ($scope.uiState.algorithm.startsWith("custom")) {
            return '/templates/analysis/clustering/settings/algorithms/'+$scope.mlTaskDesign.backendType.toLowerCase()+'/custom.html'
        } else {
            return '/templates/analysis/clustering/settings/algorithms/'+$scope.mlTaskDesign.backendType.toLowerCase()+'/'+$scope.uiState.algorithm+'.html'
        }
    };

    $scope.reguessAll = function(){
        Dialogs.confirm($scope, "Reguess", "Are you sure you want to reguess? All settings will be reset").then(function(){
            DataikuAPI.analysis.cml.reguess($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId)
                .success(function(data){
                    $scope.setMlTaskDesign(data);
                    $scope.savedSettings = dkuDeepCopy($scope.mlTaskDesign, CMLSettings.noDollarKey);
                })
        });
    };

    $scope.copyAlgorithmSettings = function(exportSettings) {
        if ($scope.dirtySettings()) {
                $scope.saveSettings();
        }
        DataikuAPI.projects.listHeads(exportSettings ? 'WRITE_CONF' : null).success(function(projectData) {
             CreateModalFromTemplate("/templates/analysis/mlcommon/settings/copy-settings.html", $scope, null, function(newScope) {
                 newScope.projects = projectData;
                 newScope.totem = "icon-" + (exportSettings ? "copy" : "paste");
                 newScope.title = "Copy algorithms " + (exportSettings ? "to" : "from");
                 newScope.selectedProjectKey = $stateParams.projectKey;
                 newScope.analyses = $scope.analyses;
                 newScope.selectedAnalysisId = $stateParams.analysisId;
                 newScope.infoMessages = ["You can only choose a clustering model using a "
                                            + ($scope.backendTypeNames[$scope.mlTaskDesign.backendType] || $scope.mlTaskDesign.backendType)
                                            + " engine"];
                 newScope.selectProject = function() {
                     DataikuAPI.analysis.listHeads(newScope.selectedProjectKey).success(function(analysisData) {
                         newScope.analyses = analysisData;
                         newScope.selectedAnalysisId = undefined;
                         newScope.selectedTask = undefined;
                     }).error(setErrorInScope.bind($scope));
                 };
                 newScope.selectAnalysis = function() {
                     DataikuAPI.analysis.listMLTasks(newScope.selectedProjectKey, newScope.selectedAnalysisId)
                     .success(function(taskData) {
                         newScope.tasks = taskData;
                         newScope.descriptions = [];
                         newScope.tasks.forEach(task => {
                             // task can be selected if it is not the current one + is a clustering + same backend
                             task.isNotSelectable = task.mlTaskId === $stateParams.mlTaskId
                                                && newScope.selectedAnalysisId === $stateParams.analysisId
                                                && newScope.selectedProjectKey === $stateParams.projectKey
                                                || task.backendType !== $scope.mlTaskDesign.backendType
                                                || task.taskType !== "CLUSTERING";
                             newScope.descriptions.push($scope.displayTypes[task.predictionType || task.taskType] + " ("
                             + ($scope.backendTypeNames[task.backendType] || task.backendType) + ")");
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
                        DataikuAPI.analysis.cml.copyAlgorithmSettings($stateParams.projectKey, $stateParams.analysisId,
                            $stateParams.mlTaskId, newScope.selectedProjectKey, newScope.selectedAnalysisId,
                            newScope.selectedTask.mlTaskId).error(setErrorInScope.bind($scope));
                    } else {
                        DataikuAPI.analysis.cml.copyAlgorithmSettings(newScope.selectedProjectKey, newScope.selectedAnalysisId,
                            newScope.selectedTask.mlTaskId, $stateParams.projectKey, $stateParams.analysisId,
                            $stateParams.mlTaskId).success(function(data) {
                                $scope.setMlTaskDesign(data);
                        }).error(setErrorInScope.bind($scope));
                    }
                    WT1.event("mltask-copy-algorithms", {
                        export: exportSettings,
                        sameProject: $stateParams.projectKey === newScope.selectedProjectKey,
                        sameAnalysis: $stateParams.analysisId === newScope.selectedAnalysisId,
                        typeDest: "CLUSTERING",
                        typeSrc: "CLUSTERING"
                    });
                    newScope.dismiss();
                 };
                 newScope.cancel = function() {
                     newScope.dismiss();
                 };
             });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.$watch('mlTaskDesign', function(nv){
        if (nv) {
            if (nv.guessPolicy === 'CUSTOM' && nv.backendType === 'PY_MEMORY' && $scope.mlTaskDesign.modeling.custom_python.length > 0) {
                let expectedAlgKey = 'custom_python_' + ($scope.mlTaskDesign.modeling.custom_python.length - 1);
                $scope.uiState.algorithm = expectedAlgKey;
            }

            if (nv.guessPolicy === 'CUSTOM' && nv.backendType === 'MLLIB' && $scope.mlTaskDesign.modeling.custom_mllib.length > 0) {
                let expectedAlgKey = 'custom_mllib_' + ($scope.mlTaskDesign.modeling.custom_mllib.length - 1);
                $scope.uiState.algorithm = expectedAlgKey;
            }
            
            $scope.retrieveCodeEnvsInfo();
        }
    });
});

app.controller("CMLTaskSamplingController", function($scope, $timeout, $stateParams, DataikuAPI, DatasetUtils){
    DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(function(data){
        $scope.availableDatasets = data;
    });
});

app.controller("CMLTaskReductionController", function($scope, $controller, $timeout, $stateParams, Assert, DataikuAPI, DatasetUtils){
    Assert.inScope($scope, "mlTaskDesign");
    // This code handles the mapping between how reduce options are presented to the user (radio boxes)
    // & how we handle them internally (two booleans)
    $scope.$watch("mlTaskDesign.preprocessing.reduce", function(nv, ov) {
        if (nv == null) return;
        if (!nv.disable && !nv.enable) {
            if (ov.disable) {
                nv.enable = true;
            } else {
                nv.disable = true;
            }
        }
        if (nv.disable && nv.enable) {
            $scope.modelUI.reduceOption = "both";
        } else if (nv.disable && !nv.enable) {
            $scope.modelUI.reduceOption = "disable";
        } else {
            $scope.modelUI.reduceOption = "enable";
        }
    }, true);
    $scope.modelUI = { reduceOption : 'disable'};

    $scope.$watch('modelUI.reduceOption', function(nv, ov) {
        if(!nv) return;
        if($scope.modelUI.reduceOption=='both') {
            $scope.mlTaskDesign.preprocessing.reduce.disable = true;
            $scope.mlTaskDesign.preprocessing.reduce.enable = true;
        } else if($scope.modelUI.reduceOption=='enable') {
            $scope.mlTaskDesign.preprocessing.reduce.disable = false;
            $scope.mlTaskDesign.preprocessing.reduce.enable = true;
        } else  {
            $scope.mlTaskDesign.preprocessing.reduce.disable = true;
            $scope.mlTaskDesign.preprocessing.reduce.enable = false;
        }
        if ($scope.mlTaskDesign.preprocessing.reduce.enable && !$scope.mlTaskDesign.preprocessing.reduce.kept_variance) {
            $scope.mlTaskDesign.preprocessing.reduce.kept_variance = 0.9;
        }
    });
});


app.controller("CMLTaskPreTrainModal", function($scope, $stateParams, $state, DataikuAPI, WT1, Logger) {
    $scope.uiState = {
        confirmRun: false
    };

    DataikuAPI.analysis.cml.getPreTrainStatus($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data) {
        $scope.preTrainStatus = data;
        $scope.splitStatus = data.splitStatus;
        $scope.uiState.anyError = data.messages.some(x => x.severity == 'FATAL');
        $scope.uiState.anyWarning = data.messages.some(x => x.severity == 'WARNING');
    }).error(setErrorInScope.bind($scope));

    $scope.train = function() {
        try {
            const algorithms = {};
            $.each($scope.mlTaskDesign.modeling, function(alg, params) {
                if (params.enabled){
                    algorithms[alg] = params;
                }
            });
            WT1.event("clustering-train", {
                backendType: $scope.mlTaskDesign.backendType,
                nbModelsPreGS: $scope.preTrainStatus.nbModelsPreGS,
                taskType: $scope.mlTaskDesign.taskType,
                guessPolicy: $scope.mlTaskDesign.guessPolicy,
                feature_generation: JSON.stringify($scope.mlTaskDesign.preprocessing.feature_generation),
                outliers: JSON.stringify($scope.mlTaskDesign.preprocessing.outliers),
                reduce: JSON.stringify($scope.mlTaskDesign.preprocessing.reduce),
                algorithms: JSON.stringify(algorithms),
                metrics: JSON.stringify($scope.mlTaskDesign.modeling.metrics),
                hasSessionName: !!$scope.uiState.userSessionName,
                hasSessionDescription: !!$scope.uiState.userSessionDescription
            });
        } catch (e) {
            Logger.error('Failed to report mltask info', e);
        }
        DataikuAPI.analysis.cml.trainStart($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId,
            $scope.uiState.userSessionName, $scope.uiState.userSessionDescription, $scope.uiState.forceRefresh)
        .success(function(data) {
            $scope.resolveModal();
        }).error(setErrorInScope.bind($scope));
    };
})

})();
