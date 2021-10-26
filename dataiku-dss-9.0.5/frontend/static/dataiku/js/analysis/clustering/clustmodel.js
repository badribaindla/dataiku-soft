(function(){
'use strict';

var app = angular.module('dataiku.analysis.mlcore');


/**
 * Controllers, services and directives for the views of a single model
 * of a MLTask
 */

/**
 * Injected into all controllers that display a single CMLTask model.  Handles:
 *   - the global nav handle to switch between PMLTask models
 *   - setting the top nav item
 */
app.controller("_CMLModelBaseController", function($scope, $controller, DataikuAPI, TopNav, $stateParams, CreateModalFromTemplate, $q, CMLFilteringService){
    $controller("_ModelUtilsController", {$scope:$scope});
    $controller("_MLModelBaseController",{$scope:$scope});
    $controller("downloadModelController", {$scope:$scope});

    $scope.whenHasModel = function(){
        if ($scope.modelData) return $q.when(null);
        else {
            return DataikuAPI.ml.clustering.getModelDetails($stateParams.fullModelId).success(function(data){
                $scope.modelData = data;
                // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                $scope.puppeteerHook_elementContentLoaded = true;
            });
        }
    }

    $scope.whenHasModel().then(function(){
        var algoName = $scope.modelData.modeling.algorithm;
        $scope.mlTasksContext.noPredicted = /^(MLLIB|SPARKLING|VERTICA|PYTHON_ENSEMBLE|SPARK_ENSEMBLE)/i.test(algoName);
        $scope.mlTasksContext.noExport = $scope.mlTasksContext.noPredicted; //todo: check this is correct for clustering
    });

    $scope.mlTasksContext.delete = function() {
        $scope.deleteTrainedAnalysisModel();
    }

    $scope.mlTasksContext.deploy = function(){
        $scope.whenHasModel().then(function(){
             CreateModalFromTemplate("/templates/analysis/clustering/model/deploy-modal.html",
                $scope,"AnalysisClusteringDeployController");
        });
    }
    $scope.mlTasksContext.exportNotebook = function(){
        $scope.whenHasModel().then(function(){
            CreateModalFromTemplate("/templates/analysis/mlcommon/export-notebook-modal.html",
            $scope,"AnalysisClusteringExportNotebookController");
        });
    }

    DataikuAPI.analysis.cml.getModelSnippets($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
        if (!$scope.mlTasksContext.activeMetric) {
            $scope.mlTasksContext.activeMetric = "SILHOUETTE"; // Temporary data.task.modeling.metrics.evaluationMetric;
        }
        $scope.mlTasksContext.models = Object.values(data).filter(function(m){
            return m.trainInfo.state == "DONE" && m.fullModelId != $stateParams.fullModelId;
        });
        $scope.mlTasksContext.models.sort(function(a, b) {
            var stardiff = (0+b.userMeta.starred) - (0+a.userMeta.starred)
            if (stardiff !=0) return stardiff;
            return b.sessionDate - a.sessionDate;
        });
        $scope.mlTasksContext.models.forEach(function(m){
            m.mainMetric = CMLFilteringService.getMetricFromSnippet(m, $scope.mlTasksContext.activeMetric);
        });
    }).error(setErrorInScope.bind($scope));
});


app.controller("CMLModelReportController", function($scope, $controller, TopNav, WebAppsService) {
    TopNav.setLocation(TopNav.TOP_ANALYSES, null, "CLUSTERING-ANALYSIS-MODEL", "report");

    $controller("_CMLModelBaseController",{$scope:$scope});
    $controller("_ClusteringModelReportController", {$scope:$scope});

    $scope.whenHasModel().then(function() {
        const contentType = `${$scope.modelData.coreParams.taskType}/${$scope.modelData.coreParams.backendType}/${$scope.modelData.modeling.algorithm}`.toLowerCase();
        $scope.modelSkins = WebAppsService.getSkins('ANALYSIS', '', contentType);
    });
});


app.controller("AnalysisClusteringDeployClusterRecipeController", function($scope, $stateParams, $controller, $state, Assert, DataikuAPI, DatasetUtils) {
    $scope.recipeType = "clustering_cluster";
    $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

    $scope.scoringRecipe = {};

    $scope.autosetName = function() {
        if ($scope.io.inputDataset) {
            const niceInputName = $scope.io.inputDataset.replace(/\w+\./,"");
            $scope.maybeSetNewDatasetName(niceInputName + "_clustered");
        }
    };
    $scope.deployCluster = function() {
        Assert.inScope($scope, "newOutputDataset");

        // build the 'settings' object, from the bits the template for the new dataset creation puts in place
        $scope.newOutputDataset.settings = {
            connectionId: $scope.newOutputDataset.connectionOption.id,
            specificSettings: {
                formatOptionId: $scope.newOutputDataset.formatOptionId,
                overrideSQLCatalog: $scope.newOutputDataset.overrideSQLCatalog,
                overrideSQLSchema: $scope.newOutputDataset.overrideSQLSchema
            },
            partitioningOptionId: $scope.newOutputDataset.partitioningOption || 'NP'
        };

        DataikuAPI.analysis.cml.deployCluster($stateParams.fullModelId,
            $scope.io.inputDataset,
            $scope.newOutputDataset.name,
            $scope.newOutputDataset.settings
        ).success(function(data) {
            $scope.dismiss();
            $state.go("projects.project.flow");
        }).error(setErrorInScope.bind($scope));
    }

    DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, "clustering_cluster").then(function(data){
        $scope.availableInputDatasets = data[0];
    });
});


app.controller("AnalysisClusteringDeployController", function($scope, $controller, DataikuAPI, $state, $stateParams, Assert, TopNav, DatasetUtils, Dialogs){

    $scope.uiState = { selectedMode: null };
    $scope.partitioningOptions = [{id: "NP", label: "Not partitioned"}];

    $scope.canCreateClusterRecipe = function(){
        return ['MLLIB_TWO_STEP', 'PY_TWO_STEP', 'VERTICA_KMEANS'].indexOf($scope.getAlgorithm()) == -1;
    };

    $scope.isCentroidType = function() {
        return ['KMEANS',
                'MiniBatchKMeans',
                'GMM',
                'MLLIB_KMEANS',
                'MLLIB_GAUSSIAN_MIXTURE',
                'VERTICA_KMEANS',
                'SPARKLING_KMEANS',
                'MLLIB_CUSTOM',
                'MLLIB_TWO_STEP',
                'PY_TWO_STEP',
                'PY_ISOLATION_FOREST',
                'MLLIB_ISOLATION_FOREST'].indexOf($scope.getAlgorithm()) >= 0;
    };

    $scope.onSelectTrain = function(){
        $scope.uiState.selectedMode = 'train';
        $scope.formData = {};
        function autoSetModelName() {
            var algo = $scope.getAlgorithm();
            if (!$scope.formData.modelName && $scope.formData.inputDatasetSM) {
                $scope.formData.modelName = "Clustering (" + algo + ") on " + $scope.formData.inputDatasetSM;
            }
        }
        $scope.$watch("inputDatasetSM",autoSetModelName);

        $scope.formData.inputDatasetSM = $scope.analysisCoreParams.inputDatasetSmartName;

        $scope.deployTrain = function() {
            DataikuAPI.analysis.cml.deployTrain($stateParams.fullModelId,
                $scope.formData.inputDatasetSM,
                $scope.formData.modelName
            ).success(function(data){
                $scope.dismiss();
                $state.go("projects.project.flow");
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.onSelectRedeployTrain = function() {
        $scope.uiState.selectedMode = 'redeploy-train';
        $scope.formData = {
            redeployTrainRecipeName: $scope.redeployableTrains.length === 1
                ? $scope.redeployableTrains[0].recipeName : null,
            redeployTrainActivate: true
        };
        $scope.redeployTrain = function() {
            DataikuAPI.analysis.cml.redeployTrain($stateParams.fullModelId,
                $scope.formData.redeployTrainRecipeName,
                $scope.formData.redeployTrainActivate
            ).success(function(data){
                var go = $state.go.bind($state, "projects.project.flow");
                var parentScope = $scope.$parent;
                $scope.dismiss();
                if (data.schemaChanged) {
                    Dialogs.ack(parentScope, "Schema changed",
                        "The preparation script schema of the updated version is different than the previously " +
                        "selected version, this may affect the ouput schema of downstream scoring recipes."
                    ).then(go);
                } else {
                    go();
                }
            }).error(setErrorInScope.bind($scope));
        };
    };

    $scope.onWantTrain = function() {
        if ($scope.redeployableTrains && $scope.redeployableTrains.length) {
            $scope.uiState.selectedMode = 'can-redeploy-train';
            $scope.canRedeployTrain = true;
        } else {
            $scope.onSelectTrain();
        }
    };

    $scope.onSelectCluster = function() {
        fetchManagedDatasetConnections($scope, DataikuAPI);
        $scope.uiState.selectedMode = 'cluster';
        $scope.io = {};

        $scope.deployCluster = function() {
            Assert.inScope($scope, "newDataset");

            // build the 'settings' object, from the bits the template for the new dataset creation puts in place
            $scope.newDataset.settings = {
                connectionId:$scope.newDataset.connectionOption.id,
                specificSettings : {
                    formatOptionId:$scope.newDataset.formatOptionId,
                    overrideSQLCatalog : $scope.newDataset.overrideSQLCatalog,
                    overrideSQLSchema : $scope.newDataset.overrideSQLSchema
                },
                partitioningOptionId:$scope.newDataset.partitioningOption || 'NP'
            }

            DataikuAPI.analysis.cml.deployCluster($stateParams.fullModelId,
                $scope.io.mainInputDataset,
                $scope.newDataset.name,
                $scope.newDataset.settings
            ).success(function(data) {
                $scope.dismiss();
                $state.go("projects.project.flow");
            }).error(setErrorInScope.bind($scope));
        };
    };

    $scope.onSelectRedeployCluster = function() {
        $scope.uiState.selectedMode = 'redeploy-cluster';
        $scope.formData = {
            redeployClusterRecipeName: $scope.redeployableClusters.length === 1
                ? $scope.redeployableClusters[0].recipeName : null
        };
        $scope.redeployCluster = function() {
            DataikuAPI.analysis.cml.redeployCluster($stateParams.fullModelId,
                $scope.formData.redeployClusterRecipeName
            ).success(function(data){
                var parentScope = $scope.$parent;
                $scope.dismiss();
                if (data.schemaChanged) {
                    Dialogs.ack(parentScope, "Schema changed",
                        "The preparation script schema of the updated version is different than before, " +
                        "you may want to check the output schema of this clustering recipe."
                    ).then($state.go.bind($state, "projects.project.recipes.recipe", {recipeName: $scope.formData.redeployClusterRecipeName}));
                } else {
                    $state.go("projects.project.flow");
                }
            }).error(setErrorInScope.bind($scope));
        };
    };

    $scope.onWantCluster = function() {
        if ($scope.redeployableClusters && $scope.redeployableClusters.length) {
            $scope.uiState.selectedMode = 'can-redeploy-cluster';
            $scope.canRedeployCluster = true;
        } else {
            $scope.onSelectCluster();
        }
    };

    function main() {
        Assert.inScope($scope, "modelData");
        Assert.inScope($scope, "analysisCoreParams");

        DataikuAPI.analysis.cml.listRedeployableCluster($stateParams.fullModelId).success(function(data) {
            $scope.redeployableClusters = data;
        });
        if ($scope.isCentroidType()) {
            DataikuAPI.analysis.cml.listRedeployableTrain($stateParams.fullModelId).success(function(data) {
                $scope.redeployableTrains = data;
            });
        }

        DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(function(data){
            $scope.availableDatasets = data;
        });
    };
    main();
});


app.controller("AnalysisClusteringExportNotebookController", function($scope, $controller, Assert, DataikuAPI, $state, $stateParams, TopNav){
    Assert.inScope($scope, "modelData");
    Assert.inScope($scope, "analysisCoreParams");
    $scope.formData = {};

    $scope.formData.notebookName = "Cluster "+ $scope.analysisCoreParams.inputDatasetSmartName.replace(/\./g, '_');

    $scope.createNotebook = function(){
        DataikuAPI.analysis.cml.createNotebook($stateParams.fullModelId, $scope.formData.notebookName)
            .success(function(data){
                $scope.dismiss();
                $state.go("projects.project.notebooks.jupyter_notebook", {notebookId : data.id});
            }).error(setErrorInScope.bind($scope));
    }
});

app.directive("analysisClusteringPredictedTable", function(MonoFuture, $q, Assert, WT1, TopNav){
    return {
        scope: true,
        priority : 1,
        controller : function($scope, $stateParams, $state, DataikuAPI, $controller) {
            Assert.inScope($scope, "loadMLTask");

            $controller("_CMLModelBaseController",{$scope:$scope});
            WT1.event("analysis-cmltask-model-table-open");
            TopNav.setLocation(TopNav.TOP_ANALYSES, null, "CLUSTERING-ANALYSIS-MODEL", "predictedtable");
            $scope.loadMLTask();

            DataikuAPI.ml.clustering.getModelDetails($stateParams.fullModelId).success(function(data){
                if ($scope.mlTasksContext) $scope.mlTasksContext.model = data;
                // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                $scope.puppeteerHook_elementContentLoaded = true;
            });
        }
    }
});


app.directive('analysisClusteringPredictedCharts', function(DataikuAPI, WT1, TopNav, DatasetUtils) {
 return {
        scope: true,
        controller: function ($scope, $stateParams, $state, $controller) {
            WT1.event("analysis-cmltask-model-charts-open");
            TopNav.setLocation(TopNav.TOP_ANALYSES, null, "CLUSTERING-ANALYSIS-MODEL", "charts");
            $controller("_CMLModelBaseController",{$scope:$scope});

            DataikuAPI.analysis.mlcommon.getCurrentSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
                $scope.mlTaskDesign = data;
                $scope.shaker = data.predictionDisplayScript;
                $scope.charts = data.predictionDisplayCharts;
                $scope.onSettingsLoaded();
            }).error(setErrorInScope.bind($scope));

            DataikuAPI.ml.clustering.getModelDetails($stateParams.fullModelId).success(function(data){
                if ($scope.mlTasksContext) $scope.mlTasksContext.model = data;
                // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                $scope.puppeteerHook_elementContentLoaded = true;
            });
        }
    };
});

})();
