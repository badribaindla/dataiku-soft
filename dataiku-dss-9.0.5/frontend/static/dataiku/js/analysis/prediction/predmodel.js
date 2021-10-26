(function(){
'use strict';

var app = angular.module('dataiku.analysis.mlcore');


/**
 * Controllers, services and directives for the views of a single model
 * of a MLTask
 */

/**
 * Injected into all controllers that display a single PMLTask model. Handles:
 *   - the global nav handle to switch between PMLTask models
 *   - setting the top nav item
 */
app.controller("_PMLModelBaseController", function($scope, $controller, $q, DataikuAPI, $stateParams, PMLFilteringService, CreateModalFromTemplate){
    $controller("_ModelUtilsController", {$scope:$scope});
    $controller("_MLModelBaseController", {$scope:$scope});
    $controller("downloadModelController", {$scope:$scope});

    $scope.whenHasModel = function() {
        if ($scope.modelData) return $q.when(null);
        else {
            return DataikuAPI.ml.prediction.getModelDetails($stateParams.fullModelId).success(function(data){
                // replace only if absent or different, else may have been enriched, e.g. in _PredictionModelReportController
                if (!$scope.modelData || $scope.modelData.fullModelId != data.fullModelId) {
                    $scope.modelData = data;
                    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                    $scope.puppeteerHook_elementContentLoaded = true;
                }
            });
        }
    }

    $scope.mlTasksContext.delete = function() {
        $scope.deleteTrainedAnalysisModel();
    }

    $scope.whenHasModel().then(function(){
        var algoName = $scope.modelData.modeling.algorithm;
        $scope.mlTasksContext.noPredicted = /^(MLLIB|SPARKLING|VERTICA|PYTHON_ENSEMBLE|SPARK_ENSEMBLE|KERAS)/i.test(algoName);
        $scope.mlTasksContext.noExport = $scope.mlTasksContext.noPredicted || (algoName === "CUSTOM_PLUGIN");
    });

    $scope.mlTasksContext.deploy = function(){
        $scope.whenHasModel().then(function(){
             CreateModalFromTemplate("/templates/analysis/prediction/model/deploy-modal.html",
                $scope,"AnalysisPredictionDeployController");
        });
    }
    $scope.mlTasksContext.exportNotebook = function(){
        $scope.whenHasModel().then(function(){
            CreateModalFromTemplate("/templates/analysis/mlcommon/export-notebook-modal.html",
            $scope,"AnalysisPredictionExportNotebookController");
        });
    }

    DataikuAPI.analysis.pml.getTaskStatus($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
        if (!$scope.mlTasksContext.activeMetric) {
            $scope.mlTasksContext.activeMetric = data.headSessionTask.modeling.metrics.evaluationMetric;
        }
    });

    DataikuAPI.analysis.pml.getModelSnippets($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
        $scope.mlTasksContext.models = Object.values(data).filter(function(m){
            return m.trainInfo.state == "DONE" && m.fullModelId != $stateParams.fullModelId;
        });
        $scope.mlTasksContext.models.sort(function(a, b) {
            var stardiff = (0+b.userMeta.starred) - (0+a.userMeta.starred)
            if (stardiff != 0) return stardiff;
            return b.sessionDate - a.sessionDate;
        });
        $scope.mlTasksContext.models.forEach(function(m){
            m.mainMetric = PMLFilteringService.getMetricFromSnippet(m, $scope.mlTasksContext.activeMetric);
            m.mainMetricStd = PMLFilteringService.getMetricStdFromSnippet(m, $scope.mlTasksContext.activeMetric);
        });
    }).error(setErrorInScope.bind($scope));
});

app.controller("downloadModelController", function($scope, MLExportService) {
    $scope.mlTasksContext.showDownloadModel = function(type) {
        if (!$scope.modelData) return false;
        return MLExportService.showDownloadModel($scope.appConfig, type);
    };
    $scope.mlTasksContext.mayDownloadModel = function(type) {
        if (!$scope.modelData) return false;
        return MLExportService.mayDownloadModel($scope.appConfig, $scope.modelData, type);
    };
    $scope.mlTasksContext.downloadModel = function(type) {
        $scope.whenHasModel().then(function(){
            MLExportService.downloadModel($scope, $scope.modelData, type, $scope.mlTasksContext.partitionName);
        });
    };

    $scope.mlTasksContext.exportToSnowflakeFunction = function() {
        $scope.whenHasModel().then(function(){
            MLExportService.exportToSnowflakeFunction($scope, $scope.modelData, $scope.mlTasksContext.partitionName);
        });
    }
});


/**
 * Controller for displaying results screen of a prediction model
 * in a PMLTask
 */
 app.controller("PMLModelReportController", function($scope, $controller, TopNav, WebAppsService) {
    TopNav.setLocation(TopNav.TOP_ANALYSES, null, "PREDICTION-ANALYSIS-MODEL", "report");

    $controller("_PMLModelBaseController",{$scope:$scope});
    $controller("_PredictionModelReportController",{$scope:$scope});

    $scope.whenHasModel().then(function() {
        const contentType = `${$scope.modelData.coreParams.taskType}/${$scope.modelData.coreParams.backendType}/${$scope.modelData.modeling.algorithm}`.toLowerCase();
        $scope.modelSkins = WebAppsService.getSkins('ANALYSIS', '', contentType);
    });
});

app.controller("PMLPartModelReportController", function($scope, $controller, DataikuAPI, $state, $stateParams, $location,
    FullModelIdUtils){
    const fullModelId = $stateParams.fullModelId || $scope.fullModelId;

    const setScopeSnippets = (partSnippets) => {
        if (partSnippets.fullModelId === fullModelId) {
            $scope.currentPartitionedModel = partSnippets;
        } else {
            $scope.currentPartitionedModel = Object.values(partSnippets.partitions.summaries)
                .find(m => m.snippet.fullModelId === fullModelId)
                .snippet;
            $scope.currentPartitionName = $scope.currentPartitionedModel.partitionName;
        }

        $scope.partitionedModelSnippets = partSnippets;

        if ($scope.mlTasksContext) {
            $scope.mlTasksContext.noPredicted = !$scope.isOnModelPartition();
            $scope.mlTasksContext.noExport = true;
            $scope.mlTasksContext.partitionName = $scope.currentPartitionName;
        }
        if ($scope.smContext) {
            $scope.smContext.partitionName = $scope.currentPartitionName;
        }
    };

    $scope.goToBaseModel = function() {
        $state.go('.', {fullModelId : $scope.partitionedModelSnippets.fullModelId});
    };

    $scope.goToPartitionedModel = function(partitionName) {
        if (partitionName) {
            // Switch between partitions, stay on the same tab (hashcode)
            const partitionFmi = $scope.partitionedModelSnippets.partitions.summaries[partitionName].snippet.fullModelId;
            $state.go('.', {fullModelId: partitionFmi, '#': $location.hash()})
        } else {
            // Switch from overall model to partitioned, go to the first one done
            const firstPartitionFmi = Object.values($scope.partitionedModelSnippets.partitions.summaries)
                .find(summary => summary.state.endsWith('DONE')).snippet.fullModelId;
            $state.go('.', {fullModelId: firstPartitionFmi});
        }
    };

    $scope.showPartitions = function() {
        return !$scope.insight;
    }

    $scope.isOnModelPartition = function (){
        return $scope.currentPartitionedModel && $scope.currentPartitionedModel.partitionName;
    };

    $scope.isOnPartitionedBaseModel = function () {
        return !$scope.currentPartitionedModel || !$scope.currentPartitionedModel.partitionName;
    };

    /* In analysis */
    $scope.$watch('mlTasksContext.models', function(models) {
        if (!models) {
            return;
        }
        DataikuAPI.analysis.pml.getPartitionedModelSnippets(fullModelId)
            .then((result) => setScopeSnippets(result.data), setErrorInScope.bind($scope));
    });

    /* In saved model */
    $scope.$watch('versionsContext.currentVersion', function(currentVersion) {
        if (!$scope.versionsContext || !$scope.versionsContext.versions) {
            return;
        }

        const baseFullModelId = FullModelIdUtils.getBase(fullModelId);
        const baseVersion = $scope.versionsContext.versions
            .find(m => m.snippet.fullModelId === baseFullModelId);

        if (!$scope.versionsContext.currentVersion || !$scope.versionsContext.currentVersion.snippet) {
            $scope.versionsContext.currentVersion = Object.values(baseVersion.snippet.partitions.summaries)
                .find(m => m.snippet.fullModelId === fullModelId);
        }

        if (baseVersion) {
            setScopeSnippets(baseVersion.snippet);
        } else {
            setScopeSnippets(currentVersion.snippet);
        }
    });
});

app.controller("AnalysisPredictionDeployController", function($scope, $controller, DataikuAPI, $state, $stateParams, Assert, TopNav, DatasetUtils, Dialogs){
    $scope.onSelectTrain = function(){
        $scope.uiState.selectedMode = 'train';
        $scope.formData = {
            optimizationBehaviour: "REDO",
            thresholdBehaviour: "REDO"
        };
        function autoSetModelName() {
            var algo = $scope.getAlgorithm();
            if (!$scope.formData.modelName && $scope.formData.trainDatasetSmartName) {
                const modelPredName = $scope.isPartitionedModel() ?
                    'Partitioned prediction' :
                    'Prediction';
                $scope.formData.modelName = `${modelPredName} (${algo}) on ${$scope.formData.trainDatasetSmartName}`;
            }
        }

        $scope.$watch("trainDatasetSmartName", autoSetModelName);

        var splitParams = $scope.modelData.splitDesc.params;
        if (splitParams.ttPolicy == 'SPLIT_SINGLE_DATASET') {
            $scope.formData.trainDatasetSmartName = $scope.analysisCoreParams.inputDatasetSmartName;
        } else if (splitParams.ttPolicy == 'EXPLICIT_FILTERING_TWO_DATASETS') {
            $scope.formData.trainDatasetSmartName = splitParams.eftdTrain.datasetSmartName;
            $scope.formData.testDatasetSmartName = splitParams.eftdTest.datasetSmartName;
        } else if (splitParams.ttPolicy == 'EXPLICIT_FILTERING_SINGLE_DATASET') {
            $scope.formData.trainDatasetSmartName = $scope.analysisCoreParams.inputDatasetSmartName;
        } else {
            throw "Unhandled split mode";
        }

        $scope.deployTrain = function() {
            var options = {
                redoOptimization: $scope.formData.optimizationBehaviour === "REDO",
                redoThresholdOptimization: $scope.formData.thresholdBehaviour === "REDO",
                fixedThreshold: $scope.modelData.userMeta.activeClassifierThreshold
            };
            DataikuAPI.analysis.pml.deployTrain($stateParams.fullModelId,
                $scope.formData.trainDatasetSmartName, $scope.formData.testDatasetSmartName,
                $scope.formData.modelName,
                options
            ).success(function(data){
                $scope.dismiss();
                $state.go("projects.project.flow");
            }).error(setErrorInScope.bind($scope));
        };
    };
    $scope.onSelectRedeployTrain = function() {
        $scope.uiState.selectedMode = 'redeploy-train';
        $scope.formData = {
            redeployTrainRecipeName: $scope.redeployables.length === 1
                ? $scope.redeployables[0].recipeName : null,
            redeployTrainActivate: true,
            optimizationBehaviour: "REDO",
            thresholdBehaviour: "REDO"
        };
        $scope.redeployTrain = function() {
            var options = {
                redoOptimization: $scope.formData.optimizationBehaviour === "REDO",
                redoThresholdOptimization: $scope.formData.thresholdBehaviour === "REDO",
                fixedThreshold: $scope.modelData.userMeta.activeClassifierThreshold
            };
            DataikuAPI.analysis.pml.redeployTrain($stateParams.fullModelId,
                $scope.formData.redeployTrainRecipeName,
                $scope.formData.redeployTrainActivate,
                options
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
    $scope.suggestRedeployTrain = function(redeployables) {
        $scope.uiState.selectedMode = 'can-redeploy';
        $scope.redeployables = redeployables;
        $scope.canRedeploy = true;
    };

    function main(){
        $scope.uiState = {};
        Assert.inScope($scope, "modelData");
        Assert.inScope($scope, "analysisCoreParams");

        DataikuAPI.analysis.pml.listRedeployableTrain($stateParams.fullModelId).success(function(data) {
            if (data && data.length) {
                $scope.suggestRedeployTrain(data);
            } else {
                $scope.onSelectTrain();
            }
        }).error($scope.onSelectTrain);

        DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(function(data){
            $scope.availableDatasets = data;
        });
    }

    main();
});


app.controller("DownloadModelDocumentationController", function($scope, DataikuAPI, WT1, FutureWatcher, ProgressStackMessageBuilder) {

    $scope.radio = { type: "default" };
    $scope.newTemplate = {};
    $scope.renderingInProgress = false;
    $scope.renderingDone = false;
    $scope.downloaded = false;
    $scope.errorOccured = false;
    $scope.hasDesignChangesOccurred = false;
    $scope.data = undefined;

    // The model data is stored in $scope.modelData for analysis and in $scope.smContext.model for savedmodels
    let fullModelId = (($scope.modelData) ? $scope.modelData : $scope.smContext.model).fullModelId;

    // Compute design changes before starting MDG to avoid wasting the user's time on generating documents 
    DataikuAPI.ml.prediction.getPreDocGenInfoMessages(fullModelId).success((data) => {
        $scope.data = data;
    }).error(setErrorInScope.bind($scope));

    $scope.export = (templateType) => {
        if (templateType === "custom") {
            WT1.event("render-model-documentation", {type: "custom"});
            DataikuAPI.ml.prediction.docGenCustom($scope.newTemplate.file, fullModelId, (e) => {
                // You can use here Math.round(e.loaded * 100 / e.total) to compute and display to the user the progress percentage of the template upload
            })
            .then(watchJobId)
            .catch((error) => {
                setErrorInScope2.call($scope, error);
            });
        } else {
            WT1.event("render-model-documentation", {type: "default"});
            DataikuAPI.ml.prediction.docGenDefault(fullModelId)
            .success(watchJobId)
            .error(setErrorInScope.bind($scope));
        }

        function watchJobId(initialResponse) {
            $scope.initialResponse = angular.fromJson(initialResponse);
            $scope.data = undefined;

            FutureWatcher.watchJobId($scope.initialResponse.jobId)
            .success(function(response) {
                let exportId = response.result.exportId;
                $scope.data = response.result.data;
                $scope.text = "The model documentation is ready.";
                if ($scope.data.maxSeverity === 'WARNING') {
                    $scope.text += " Be aware that the placeholders which couldn't be resolved are not shown in the model documentation.";
                } else if ($scope.data.maxSeverity === 'ERROR') {
                    $scope.text = "";
                    $scope.errorOccured = true;
                }
                
                // When an error occured it means the generation failed to produce the documentation, there is nothing to download
                if (!$scope.errorOccured) {
                    $scope.modelDocumentationURL = DataikuAPI.savedmodels.getModelDocumentationExportURL(exportId);
                }
                $scope.renderingInProgress = false;
                $scope.renderingDone = true;
            }).update(function(response) {
                $scope.futureResponse = response;
                $scope.percentage =  ProgressStackMessageBuilder.getPercentage(response.progress);
                $scope.stateLabels = ProgressStackMessageBuilder.build(response.progress, true);
            }).error(function(response, status, headers) {
                setErrorInScope.bind($scope)(response, status, headers);
            });
        }

        $scope.percentage = 100;
        $scope.stateLabels = "Uploading the template";
        $scope.renderingInProgress = true;
    };

    $scope.download = function() {
        downloadURL($scope.modelDocumentationURL);
        WT1.event("download-model-documentation");
        $scope.downloaded = true;
    };

    $scope.abort = function() {
        DataikuAPI.futures.abort($scope.initialResponse.jobId).error(setErrorInScope.bind($scope));
        $scope.dismiss();
        WT1.event("abort-model-documentation-rendering");
    }
});


app.controller("AnalysisPredictionExportNotebookController", function($scope, $controller, DataikuAPI, $state, $stateParams, Assert, TopNav) {
    Assert.inScope($scope, "modelData");
    Assert.inScope($scope, "analysisCoreParams");

    $scope.formData = {};

    var cp = $scope.modelData.coreParams;
    $scope.formData.notebookName = "Predict " + cp.target_variable + " in " +
        $scope.analysisCoreParams.inputDatasetSmartName.replace(/\./g, '_');

    $scope.createNotebook = function() {
        DataikuAPI.analysis.pml.createNotebook($stateParams.fullModelId, $scope.formData.notebookName)
        .success(function(data){
            $scope.dismiss();
            $state.go("projects.project.notebooks.jupyter_notebook", {notebookId : data.id});
        }).error(setErrorInScope.bind($scope));
    }
});


app.controller("PredictionScatterPlotController", function($scope){
    // remove duplicates in the scatter plot data - prevent d3 voronoi issue https://github.com/d3/d3/issues/1908
    $scope.$watch("modelData.perf.scatterPlotData", function(nv){
        if (!nv) { return }
        var hashTbl = {};
        for (var i=nv.x.length-1;i>=0;i--) {
            var key = nv.x[i] + '#' + nv.y[i];
            if (hashTbl[key]) { nv.x.splice(i,1) ; nv.y.splice(i,1) }
            else { hashTbl[key] = true }
        }
        $scope.spd = nv;
    });
});


app.directive("analysisPredictionPredictedTable", function($q, Assert, MonoFuture, WT1, TopNav) {
    return {
        scope: true,
        priority: 1,
        controller: function($scope, $stateParams, $state, DataikuAPI, $controller) {
            $controller("_PMLModelBaseController", {$scope});
            WT1.event("pml-model-prediction-open");
            TopNav.setLocation(TopNav.TOP_ANALYSES, null, "PREDICTION-ANALYSIS-MODEL", "predictedtable");
            Assert.inScope($scope, "loadMLTask");
            $scope.loadMLTask();

            DataikuAPI.ml.prediction.getModelDetails($stateParams.fullModelId)
                .success(function(data) {
                    if ($scope.mlTasksContext) $scope.mlTasksContext.model = data;
                    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                    $scope.puppeteerHook_elementContentLoaded = true;
                })
                .error(setErrorInScope.bind($scope));
        }
    }
});


app.directive('analysisPredictionPredictedCharts', function(Logger, DataikuAPI, WT1, TopNav) {
return {
        scope: true,
        controller: function ($scope, $stateParams, $state, $controller) {
            var main = function(){
                WT1.event("analysis-pml-charts-open");
                TopNav.setLocation(TopNav.TOP_ANALYSES, null, "PREDICTION-ANALYSIS-MODEL", "charts");
                $controller("_PMLModelBaseController",{$scope:$scope});

                DataikuAPI.analysis.mlcommon.getCurrentSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
                    $scope.mlTaskDesign = data;
                    $scope.shaker = data.predictionDisplayScript;
                    $scope.charts = data.predictionDisplayCharts;
                    $scope.onSettingsLoaded();
                }).error(setErrorInScope.bind($scope));

                DataikuAPI.ml.prediction.getModelDetails($stateParams.fullModelId).success(function(data){
                    if ($scope.mlTasksContext) $scope.mlTasksContext.model = data;
                    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                    $scope.puppeteerHook_elementContentLoaded = true;
                });
            }
            main();
        }
    };
});


})();
