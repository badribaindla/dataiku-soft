(function(){
'use strict';

var app = angular.module('dataiku.ml.core', []);

/**
 * Filtering of prediction models
 */

app.factory("_MLFilteringServicePrototype", function(Fn) {
    return {
        setMainMetric: function(modelsList, prop, currentMetric, customEvaluationMetricGIB)  {
            if (!prop) prop = [];

            const computeMetric = (model) => {
                var modelProp = Fn.prop(prop)(model);
                var lib = this.MLSettings.sort.lowerIsBetter(currentMetric, customEvaluationMetricGIB) ? -1 : 1;
                modelProp.mainMetric = modelProp[this.metricMap[currentMetric]];
                modelProp.sortMainMetric = modelProp.mainMetric ? lib * modelProp.mainMetric : -1 * Number.MAX_VALUE;
                if (this.getMetricStdFromSnippet) {
                    modelProp.mainMetricStd = this.getMetricStdFromSnippet(modelProp, currentMetric);
                }
            };

            modelsList.forEach((m) => {
                computeMetric(m);

                if (m.partitions && m.partitions.summaries) {
                    Object.values(m.partitions.summaries)
                        .forEach(summary => summary.snippet && computeMetric(summary.snippet));
                }
            });
        },
        getMetricFromSnippet: function(model, metric) {
            return model[this.metricMap[metric]];
        },
    };
});

app.factory("PMLFilteringService", function(_MLFilteringServicePrototype, Assert, PMLSettings) {
    var svc = Object.create(_MLFilteringServicePrototype);
    svc.MLSettings = PMLSettings;
    svc.metricMap = {
        ACCURACY: 'accuracy',
        PRECISION: 'precision',
        RECALL: 'recall',
        F1: 'f1',
        CALIBRATION_LOSS: 'calibrationLoss',
        COST_MATRIX: 'costMatrixGain',
        CUMULATIVE_LIFT: 'lift',
        LOG_LOSS: 'logLoss',
        ROC_AUC: 'auc',
        EVS: 'evs',
        MAPE: 'mape',
        MAE: 'mae',
        MSE: 'mse',
        RMSE: 'rmse',
        RMSLE: 'rmsle',
        R2: 'r2',
        PEARSON: 'pearson',
        CUSTOM: 'customScore'
    };
    svc.getPossibleMetrics = function(mlTask) {
        var ret = [];
        switch(mlTask.predictionType) {
            case 'BINARY_CLASSIFICATION':
                ret = ['ACCURACY', 'PRECISION', 'RECALL', 'F1', 'COST_MATRIX', 'LOG_LOSS', 'ROC_AUC', 'CALIBRATION_LOSS', 'CUMULATIVE_LIFT'];
                break;
            case 'MULTICLASS':
                ret = ['ACCURACY', 'PRECISION', 'RECALL', 'F1', 'LOG_LOSS', 'ROC_AUC', 'CALIBRATION_LOSS'];
                break;
            case 'REGRESSION':
                ret = ['EVS', 'MAPE', 'MAE', 'MSE', 'RMSE', 'RMSLE', 'R2', 'PEARSON'];
        }
        if (mlTask.modeling && mlTask.modeling.metrics.customEvaluationMetricCode){
            ret.push('CUSTOM');
        }
        return ret.map(function(m) { return [m, PMLSettings.names.evaluationMetrics[m]] });
    };
    svc.getMetricStdFromSnippet = function(model, metric) {
        switch (metric) {
            case "LOG_LOSS" : return model.logLossstd;
            case "CUSTOM" : return model.customScorestd;
            default:
                return model[svc.metricMap[metric] + "std"];
        }
    }

    svc.getMetricValueFromModel = function(modelData, metric, currentCutData) {
        function getFromTIMetrics() {
            if (!(modelData.perf && modelData.perf.tiMetrics)) {
                return '<No metric available>';
            }
            if (!modelData.perf.tiMetrics[svc.metricMap[metric]]) {
                return '<'+metric+' not available>';
            }
            return modelData.perf.tiMetrics[svc.metricMap[metric]];
        };
        function getFromCurrentCutData(key) {
            Assert.trueish(currentCutData, 'no currentCutData');
            return currentCutData[key];
        };        
        
        Assert.trueish(modelData, 'no modelData');
        switch (modelData.coreParams.prediction_type) {
            case 'BINARY_CLASSIFICATION':
                Assert.trueish(metric, 'metric not specified');
                switch (metric) {
                    case "F1":
                        Assert.trueish(currentCutData, 'no currentCutData');
                        return getFromCurrentCutData("F1-Score");
                    case "RECALL":
                        Assert.trueish(currentCutData, 'no currentCutData');
                        return getFromCurrentCutData("Recall");
                    case "PRECISION":
                        Assert.trueish(currentCutData, 'no currentCutData');
                        return getFromCurrentCutData("Precision")
                    case "ACCURACY":
                        Assert.trueish(currentCutData, 'no currentCutData');
                        return getFromCurrentCutData("Accuracy")
                    case "COST_MATRIX":
                        Assert.trueish(currentCutData, 'no currentCutData');
                        return getFromCurrentCutData("cmg");
                    case "CUSTOM":
                        if (modelData.modeling && modelData.modeling.metrics) {
                            // we can know whether it's custom-with-proba or not
                            if (modelData.modeling.metrics.customEvaluationMetricNeedsProba) {
                                return getFromTIMetrics();
                            } else {
                                Assert.trueish(currentCutData, 'no currentCutData');
                                return getFromCurrentCutData("customScore");
                            }
                        } else {
                            // assume custom-with-proba
                            return getFromTIMetrics();
                        }
                    case "LOG_LOSS":
                    case "ROC_AUC":
                    case "CUMULATIVE_LIFT":
                        return getFromTIMetrics();
                }
                Assert.fail('Unknown metric ' + metric);
            case "MULTICLASS":
                if (metric === 'ROC_AUC') {
                    if (!(modelData.perf && modelData.perf.metrics)) {
                        return '<No metric available>';
                    }
                    if (!modelData.perf.metrics.mrocAUC) {
                        return '<multi ROC AUC not available>';
                    }
                    return modelData.perf.metrics.mrocAUC;
                }   // else FALLTHROUGH to perf.metric
            case "REGRESSION":
                Assert.trueish(metric, 'metric not specified');
                Assert.trueish(svc.metricMap[metric], 'cannot display metric '+metric);
                if (!(modelData.perf && modelData.perf.metrics)) {
                    return '<No metric available>';
                }
                if (!modelData.perf.metrics[svc.metricMap[metric]]) {
                    return '<'+svc.metricMap[metric]+' not available>';
                }
                return modelData.perf.metrics[svc.metricMap[metric]];
        }
    };

    return svc;
});

app.factory("CMLFilteringService", function(_MLFilteringServicePrototype, Assert, CMLSettings, Fn) {
    var svc = Object.create(_MLFilteringServicePrototype);
    svc.MLSettings = CMLSettings;
    svc.metricMap = { SILHOUETTE: 'silhouette', INERTIA: 'inertia', NB_CLUSTERS: 'nbClusters' };
    svc.getPossibleMetrics = Fn.cst(CMLSettings.task.evaluationMetrics);

    svc.getMetricNameFromModel = function(modelData) {
        Assert.trueish(modelData, 'no modelData');
        return modelData.actualParams.resolved.metrics.evaluationMetric;
    };

    svc.getMetricValueFromModel = function(modelData) {
        Assert.trueish(modelData, 'no modelData');
        let metricName = modelData.actualParams.resolved.metrics.evaluationMetric;
        metricName = svc.metricMap[metricName];
        let metricValue = modelData.perf.metrics[metricName];
        return metricValue;
    };

    return svc;
});

app.service("MLExportService", function(DataikuAPI, WT1, $stateParams, Dialogs, CreateModalFromTemplate, SpinnerService, FutureWatcher,
    FullModelIdUtils, FutureProgressModal, ActivityIndicator) {
    this.downloadFile = (scope, generateFile, getUrl) => {
        generateFile()
            .success(data => {
                SpinnerService.lockOnPromise(FutureWatcher.watchJobId(data.jobId)
                    .success(data => {
                        downloadURL(getUrl(data.result.exportId));
                    }).error(error => {
                        Dialogs.error(scope, "An error occured while exporting file", error.message);
                    }));
               })
            .error(error => {
                Dialogs.error(scope, "An error occured while exporting file", error.message);
            });
    };
    this.showDownloadModel = function(appConfig, type) {
        if (! appConfig.licensedFeatures) {
            return false;
        }
        switch (type) {
            case 'pmml': return appConfig.licensedFeatures.modelsPMMLExport;
            case 'jar':  return appConfig.licensedFeatures.modelsJarExport;
            case 'snowflakefunction': return appConfig.licensedFeatures.modelsJarExport;
            case 'docgen' : return true;
            default: return true;
        }
    };
    this.mayDownloadModel = function(appConfig, model, type) {
        switch (type) {
            case 'pmml': return model && model.pmmlCompatibility.compatible;
            case 'jar': return model && model.javaCompatibility.compatible;
            case 'snowflakefunction': return model && model.javaCompatibility.compatible;
            case 'docgen': return appConfig.graphicsExportsEnabled && model && !model.modeling.algorithm.endsWith('_ENSEMBLE') && !model.modeling.algorithm.endsWith('KERAS_CODE'); // Disable MDG for ensemble models
            default: return false;
        }
    };
    this.exportToSnowflakeFunction = function(scope, model) {
        console.info("ETSF", arguments);
        CreateModalFromTemplate("/templates/analysis/prediction/model/export-to-snowflake-function-modal.html", scope, null, function(modalScope){
            DataikuAPI.sqlNotebooks.listConnections($stateParams.projectKey).success(function(connections) {
                scope.snowflakeConnectionNames = connections.nconns.filter((c) => c.type == "Snowflake").map((c) => c.name);
            }).error(setErrorInScope.bind(scope));

            modalScope.exportOptions = {
            }
            modalScope.export = function(){
                DataikuAPI.ml.prediction.exportToSnowflakeFunction(modalScope.exportOptions.snowflakeConnectionName,
                            model.fullModelId, modalScope.exportOptions.functionName).success(function(data){
                    modalScope.dismiss();
                    FutureProgressModal.show(scope, data, "Exporting to Snowflake").then(() => {
                        ActivityIndicator.success("Successfully exported to Snowflake function")
                    });
                }).error(setErrorInScope.bind(modalScope));
            }
        });
    }
    this.downloadModel = function(scope, model, type, partitionName) {
        if (type == 'docgen') {
            if (scope.appConfig.graphicsExportsEnabled) {
                if (!model.modeling.algorithm.endsWith('_ENSEMBLE') && !model.modeling.algorithm.endsWith('KERAS_CODE')) {
                    CreateModalFromTemplate("/templates/analysis/prediction/model/download-documentation-modal.html",
                        scope, "DownloadModelDocumentationController", undefined, undefined, 'static');
                } else if (model.modeling.algorithm.endsWith('KERAS_CODE')){
                    Dialogs.error(scope, "Model is not compatible", "Model backend not supported: KERAS");
                } else {
                    Dialogs.error(scope, "Model is not compatible", "Ensemble models are not compatible with documentation export.");
                }
            } else {
                CreateModalFromTemplate("/templates/exports/graphics-export-disabled-modal.html", scope);
            }
            
        } else if (type === 'jar-thin' || type === 'jar-fat') {
            if (model.javaCompatibility.compatible) {
                const downloadPrompt = (id) => {
                    Dialogs.prompt(
                        scope,
                        "Download model JAR",
                        "Fully-qualified class name for the model",
                        "com.company.project.Model",
                        { pattern: "^((?:[a-z]\\w*\\.)*)?([A-Z]\\w*)$" }
                    ).then( name => {
                        WT1.event("model-export", {exportType: type});
                        this.downloadFile(scope, () => DataikuAPI.ml.prediction.createScoringModelFile(type, id, "&fullClassName=" + encodeURIComponent(name)),
                            (exportId) => DataikuAPI.ml.prediction.getScoringModelDownloadURL(type, exportId));
                    });
                };
                if (! partitionName) {
                    downloadPrompt(model.fullModelId);
                } else {
                    const choices = [
                        {
                            id: FullModelIdUtils.getBase(model.fullModelId),
                            title: "Full model, with all partitions"
                        }, {
                            id: model.fullModelId,
                            title: "Single model partition",
                            desc: partitionName
                        }
                    ];
                    Dialogs.select(
                        scope,
                        "Export partitioned model",
                        "Do you want to export the full model or just the current partition?",
                        choices,
                        choices[0]
                    ).then((selected) => { downloadPrompt(selected.id); });
                }
            } else {
                Dialogs.error(scope, "Model is not compatible with Jar export", model.javaCompatibility.reason);
            }
        } else if (type === 'pmml' && ! model.pmmlCompatibility.compatible) {
            Dialogs.error(scope, "Model is not compatible with PMML export", model.pmmlCompatibility.reason);
        } else {
            WT1.event("model-export", {exportType: type});
            this.downloadFile(scope, () => DataikuAPI.ml.prediction.createScoringModelFile(type, model.fullModelId),
             (exportId) => DataikuAPI.ml.prediction.getScoringModelDownloadURL(type, exportId));
        }
    }
});

app.filter("gridParameter", function(){
    return function(par){
        if (par.vals) {
             return par.vals.join(", ");
        } else if (par.val) {
            return par.val;
        } else if (par.cnt) {
            return par.cnt + " value(s)";
        } else if (par.min && par.max) {
            return "(" + par.min + ", " + par.max + ")";
        }
    };
});

app.directive("gridDescription", function(){
    return {
        scope: {desc: '=', trained: '=', gridsearchData: "="},
        restrict: 'A',
        templateUrl: '/templates/ml/model-snippet-grid-description.html'
    };
});

app.directive("modelSnippet", function($state, PMLSettings, $rootScope) {
    return {
        scope: { snippetData: '=', snippetSource : '@', taskType : '=', smData : '=', makeActive : '=', hideSelectors: '@', currentMetric: "="},
        templateUrl: '/templates/ml/model-snippet.html',
        link: function($scope) {
            $scope.$state = $state;
            $scope.appConfig = $rootScope.appConfig;
            $scope.out = $scope.$parent;
        }
    };
});

app.filter('niceModelState', function ($filter) {
    return function (state, source) {
        if (!state) {
            return '-';
        }
        if (state.startsWith('REUSED_')) {
            return 'Re-used';
        } else if (state === 'DONE') {
            return 'Trained';
        }

        return $filter('niceConst')(state);
    }
});

app.directive("modelState", function($state) {
    return {
        scope: { state: '=', model: '=', sRefPrefix: '=', displayDiagnosticsPopup: '=', displayDiagnostics: '='},
        templateUrl: '/templates/ml/model-snippet-state.html',
        link: function($scope) {
            $scope.$state = $state;
        }
    };
});


app.directive("modelsTable", function($state, DataikuAPI){
    return {
        scope:true,
        link : function($scope, element) {
            $scope.saveMeta = function(snippetData) {
                DataikuAPI.ml.saveModelUserMeta(snippetData.fullModelId, snippetData.userMeta)
                            .error(setErrorInScope.bind($scope.$parent));
            }
        }
    }
});


app.filter('mlMetricFormat', function() {
    // probably 0 is suspicious in any metric but for already identified cases, we do not display 0
    var ignoreZerosForMetrics = [
        'INERTIA', // Inertia is missing for all but K-means, don't display it
        'RMSLE', // RMSLE cannot be computed sometimes (negative values in log)
    ];

    var usePercentageForMetrics = [
        'MAPE'
    ];

    return function(metricValue, metricName, precision, sigma, exp) {
        if ( (metricValue === undefined) || ('<No metric available>' == metricValue)) {
            return "-";
        }
        if (ignoreZerosForMetrics.indexOf(metricName) >= 0 && metricValue == 0) {
            return "-";
        }

        var percent = usePercentageForMetrics.indexOf(metricName) >= 0;
        var sigmaPrecision;
        var pc = '';

        if(typeof precision === 'number') {
            sigmaPrecision = precision;
        } else {
            precision = 4;
            sigmaPrecision = 2;
        }

        if (percent) {
            pc = '%';
            metricValue *= 100;
            sigma = (sigma || 0) * 100;
            precision = Math.max(1, precision - 2);
            sigmaPrecision = Math.max(1, sigmaPrecision - 2);
        }

        var abs = Math.abs(metricValue);
        if (abs >= 10000 && !percent)    { exp = true; }    // big numbers in exp notation
        else if (abs >= 100) { precision = 0; exp = false; } // medium numbers w/o decimals

        return (metricValue || 0)[exp ? 'toPrecision' : 'toFixed'](precision) + pc +
            (sigma ? ' <span class="sigma">(\u00b1\u00a0' + (2 * sigma)[exp ? 'toPrecision' : 'toFixed'](sigmaPrecision) + pc + ')</span>' : '');
    };
});

app.filter("mlMetricName", function($filter, PMLSettings, CMLSettings, Fn) {
    var allMetrics = angular.extend({},
            PMLSettings.names.evaluationMetrics,
            CMLSettings.names.evaluationMetrics);
    return function(input, snippetData){
        if (input == "CUMULATIVE_LIFT") {
            return $.isNumeric(snippetData.liftPoint) ? "Lift at " + Math.round(snippetData.liftPoint* 100) + "%" : "Lift";
        } else {
            return allMetrics[input] || $filter("niceConst")[input]
        }
    }
});

app.filter('mlScoreAssess', function() {
    var SCORES = { // all lowercase and attached for easy access
        auc: [ ["...too good to be true?", 1], ["excellent", .9], ["very good", .8], ["good", .7],
               ["fair", .6], ["not very good...", .5], ["worse than random guess :("] ],
        pearson: [ ["...too good to be true?", 1], ["very good", .8], ["good", .7], ["fair", .5], ["not very good..."] ],
        pvalue: [ ["\u2605\u2605\u2605", .001], ["\u2605\u2605\u2606", .01],
                  ["\u2605\u2606\u2606", .05 ], ["\u2606\u2606\u2606", 1] ]
    }, LOWER_BETTER = ['pvalue'];

    function test(k) {
        if (k.length === 1 || (this.lt ? this.score <= k[1] : this.score >= k[1])) {
            this.ret = k[0];
            return true;
        }
        return false;
    }

    return function(score, metric) {
        metric = metric.toLowerCase().split('_').join(''); // accomodate constants
        if (! metric in SCORES) { throw "Unkown metric: " + metric; }
        var ctx = { score: +score, grades: SCORES[metric], ret: null,
                lt: LOWER_BETTER.indexOf(metric) !== -1 };
        return ctx.grades.some(test, ctx) ? ctx.ret : "";
    };
});



app.filter('mlFeature', function($filter, Fn, FeatureNameUtils) {
    return function(input, asHtml) {
        if(asHtml){
            return FeatureNameUtils.getAsHtmlString(input);
        } else {
            return FeatureNameUtils.getAsText(input);
        }
    };
});

// FMI parsing methods should be equivalent to the ones defined in com.dataiku.dip.analysis.ml.FullModelId
app.service("FullModelIdUtils", function(){
    function parseAnalysisModel(fullModelId) {
        const analysisPattern = /^A-(\w+)-(\w+)-(\w+)-(s[0-9]+)-(pp[0-9]+(?:-part-(\w+)|-base)?)-(m[0-9]+)$/;
        const matchingResult = fullModelId.match(analysisPattern);
        if (!matchingResult) {
            throw new Error("Invalid analysis model id: " + fullModelId);
        } else {
            const [_, projectKey, analysisId, mlTaskId, sessionId, ppsId, partitionName, modelId] = matchingResult;
            return { projectKey, analysisId, mlTaskId, sessionId, ppsId, partitionName, modelId,
                partitionedBase: ppsId.endsWith('-base')};
        }
    }

    function parseSavedModel(fullModelId) {
        const savedModelPattern = /^S-(\w+)-(\w+)-(\w+)(?:-part-(\w+)-(v?\d+))?$/;
        const matchingResult = fullModelId.match(savedModelPattern);
        if (!matchingResult) {
            throw new Error("Invalid saved model id: " + fullModelId);
        } else {
            const [_, projectKey, savedModelId, versionId, partitionName, partitionVersion] = matchingResult;
            return { projectKey, savedModelId, versionId, partitionName, partitionVersion };
        }
    }

    function buildAnalysisModelFmi(fmiComponents) {
        // ppsId holds potential partition info
        return "A-{0}-{1}-{2}-{3}-{4}-{5}".format(fmiComponents.projectKey, fmiComponents.analysisId,
                                                 fmiComponents.mlTaskId, fmiComponents.sessionId,
                                                 fmiComponents.ppsId, fmiComponents.modelId);
    }

    function buildSavedModelFmi(fmiComponents) {
        let fmi = "S-{0}-{1}-{2}".format(fmiComponents.projectKey, fmiComponents.savedModelId, fmiComponents.versionId);
        if (fmiComponents.partitionName) {
            fmi += "-part-{0}-{1}".format(fmiComponents.partitionName, fmiComponents.partitionVersion);
        }
        return fmi;
    }

    function isAnalysis(fullModelId) {
        return fullModelId.startsWith("A");
    }

    function isSavedModel(fullModelId) {
        return fullModelId.startsWith("S");
    }

    function parse(fullModelId) {
        if (isAnalysis(fullModelId)) {
            return parseAnalysisModel(fullModelId);
        } else if (isSavedModel(fullModelId)) {
            return parseSavedModel(fullModelId);
        } else {
            throw new Error("Invalid model id: " + fullModelId);
        }
    }

    // Enforcing projectKey to be current Project and not the one hard coded in fullModelId
    // to prevent from breaking when changing projectKey of analysis (e.g. importing project
    // and changing projectKey)
    // See FullModelId.buildFmiWithEnforcedProjectKey() in the backend
    function parseWithEnforcedProjectKey(fmi, projectKey) {
        const elements = parse(fmi);
        elements.projectKey = projectKey;
        return {elements, fullModelId: buildAnalysisModelFmi(elements)};
    }

    return {
        parse: parse,
        getBase: function(fullModelId) {
            if (isAnalysis(fullModelId)) {
                const fmiComponents = parseAnalysisModel(fullModelId);
                fmiComponents.ppsId = fmiComponents.ppsId.replace(/-part-(\w+)/, "-base")
                return buildAnalysisModelFmi(fmiComponents);
            } else if (isSavedModel(fullModelId)) {
                const fmiComponents = parseSavedModel(fullModelId);
                delete fmiComponents.partitionName;
                return buildSavedModelFmi(fmiComponents);
            } else {
                throw new Error("Invalid model id: " + fullModelId);
            }
        },
        buildAnalysisModelFmi,
        buildSavedModelFmi,
        parseWithEnforcedProjectKey,
        isAnalysisPartitionBaseModel: function (fullModelId) {
            if (isAnalysis(fullModelId)) {
                const parts = parse(fullModelId);
                return parts.partitionedBase;
            }
            return false;
        },
        isPartition: function (fullModelId) {
            const parts = parse(fullModelId);
            return !angular.isUndefined(parts.partitionName);
        }
    }
});

app.controller("_ModelUtilsController", function($scope) {
    $scope.getAlgorithm = function(){
        if($scope.modelData &&
            $scope.modelData.actualParams &&
            $scope.modelData.actualParams.resolved &&
            $scope.modelData.actualParams.resolved.algorithm) {
            return $scope.modelData.actualParams.resolved.algorithm;
        } else if ($scope.modelData &&
            $scope.modelData.modeling &&
            $scope.modelData.modeling.algorithm) {
            return $scope.modelData.modeling.algorithm;
        }

    };

    $scope.isPartitionedModel = function() {
        return $scope.modelData
            && $scope.modelData.coreParams
            && $scope.modelData.coreParams.partitionedModel
            && $scope.modelData.coreParams.partitionedModel.enabled;
    };
});

app.controller("_ModelReportControllerBase", function($scope, $rootScope, $controller, $location, $timeout, DataikuAPI) {
    
    $controller("_ModelUtilsController", {$scope:$scope});

    DataikuAPI.analysis.mlcommon.getDiagnosticsDefinition().success(function(data) {
        $scope.diagnosticsDefinition = data;
    });

    $scope._selectPane = function() {
        $scope.uiState = $scope.uiState || {};

        if (!$scope.noUrlChange) {
            const stateChangeListener = $rootScope.$on('$stateChangeSuccess', (e, toState, toParams, fromState) => {
                if (fromState.name !== toState.name) {
                    $location.hash("").replace();
                    stateChangeListener();
                }
            });

            $scope.uiState.settingsPane = $location.hash() || 'summary';
            if ($location.hash() === '') {
                $location.hash($scope.uiState.settingsPane).replace();
            }
            $scope.$watch("uiState.settingsPane", function (nv, ov) {
                if (nv && ov && nv != ov) {
                    $location.hash(nv);
                }
            });
            $scope.$on("$locationChangeSuccess", function (angularEvent, newUrl, oldUrl) {
                var newHash = newUrl.split("#")[1];
                if (newHash) {
                    $scope.uiState.settingsPane = newHash;
                }
            })
        }
    };

    $scope.hooks = {};

});

app.controller('MLReportPreparationController', function($scope, Assert, ShakerProcessorsUtils) {
    Assert.inScope($scope, 'modelData');
    $scope.steps = $scope.modelData.trainedWithScript.steps;
    $scope.getStepDescription = ShakerProcessorsUtils.getStepDescription;
    $scope.getStepIcon        = ShakerProcessorsUtils.getStepIcon;
});


app.controller("_MLReportSummaryController", function($scope) {
    $scope.editState = {
        editing : false,
    }
    $scope.startEdit = function(){
        $scope.editState.editing = true;
        $scope.editState.name = $scope.modelData.userMeta.name;
        $scope.editState.description = $scope.modelData.userMeta.description;
    }
    $scope.cancelEdit = function(){
        $scope.editState.editing = false;
    }
    $scope.validateEdit = function() {
        $scope.modelData.userMeta.name = $scope.editState.name;
        $scope.modelData.userMeta.description = $scope.editState.description;
        $scope.editState.editing = false;
    }
});

app.controller("_ModelViewsController", function($scope, $rootScope, $state, $stateParams, $controller) {
    $scope.uiState = {};
    $scope.appConfig = $rootScope.appConfig;
    $scope.$state = $state;

    $scope.webAppConfig = {};
    $scope.webAppType = null;
    $scope.runningWebAppId = null;

    if ($stateParams.analysisId) {
        $controller("TrainedModelSkinsController", {$scope});
    } else {
        $controller("SavedModelVersionSkinsController", {$scope});
    }
});


app.controller("EvaluationLabelUtils", function($scope) {
    const DATASET_RE = /^[^:]*dataset:/i;
    const MODEL_RE = /^[^:]*model:/i;
    const EVALUATION_RE = /^[^:]*evaluation:/i;

    const DOMAIN_MAPPING = [
        {re: DATASET_RE, icon: "icon-dataset universe-color dataset"},
        {re: MODEL_RE, icon: "icon-machine_learning_regression universe-color saved_model"},
        {re: EVALUATION_RE, icon: "icon-model-evaluation-store universe-color saved_model"},
    ];

    $scope.setIcon = function(label) {
        if (label.key) {
            for (const mapping of DOMAIN_MAPPING) {
                if (mapping.re.test(label.key)) {
                    return mapping.icon;
                }
            }
        }
        return "icon-dku-edit";
    }
});

app.controller("PMLReportSummaryController", function($scope, $controller, DataikuAPI, PMLFilteringService, SmartId, StateUtils, $stateParams, ActiveProjectKey, Debounce, PMLSettings, $filter) {
    $controller("_MLReportSummaryController", {$scope:$scope});
    $controller("EvaluationLabelUtils", {$scope:$scope});

    const fullModelId = $stateParams.fullModelId || $scope.fullModelId;
    
    $scope.SmartId = SmartId;
    $scope.StateUtils = StateUtils;

    if ($scope.versionsContext) {
        $scope.$watch("versionsContext.activeMetric", function() {
            $scope.activeMetric = $scope.versionsContext.activeMetric;
        });
        $scope.activeMetric = $scope.versionsContext.activeMetric;
    } else if ($scope.mlTasksContext) {
        $scope.$watch("mlTasksContext.activeMetric", function() {
            $scope.activeMetric = $scope.mlTasksContext.activeMetric;
        });
        $scope.activeMetric = $scope.mlTasksContext.activeMetric;
    }

    $scope.getMetricValueFromModel = PMLFilteringService.getMetricValueFromModel.bind(PMLFilteringService);

    $scope.saveModelUserMeta = function(nv, ov) {
        if ((ov != nv) || nv && !_.isEqual(nv.labels, ov.labels)) {
            DataikuAPI.ml.saveModelUserMeta(fullModelId, $scope.modelData.userMeta)
                                .error(setErrorInScope.bind($scope));
        }
    }
    $scope.saveEvaluationLabels = function(nv, ov) {
        if ((ov != nv) || nv && !_.isEqual(nv, ov)) {
            let fme = makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId);
            DataikuAPI.modelevaluations.saveEvaluationLabels(fme, $scope.modelData.modelEvaluation.labels)
                .error(setErrorInScope.bind($scope));
        }
    }

    $scope.refreshMetrics = function(predictionType) {
        $scope.possibleMetrics = [];
        if (!predictionType) {
            return;
        }
    
        let toDropdownElems = function(a) {
            return a.map(function(m) { return [m, PMLSettings.names.evaluationMetrics[m]] });
        };
        if ('BINARY_CLASSIFICATION' === predictionType) {
            $scope.possibleMetrics.push([null, 'Binary classification']);
            $scope.possibleMetrics = $scope.possibleMetrics.concat(toDropdownElems(['ACCURACY', 'PRECISION', 'RECALL', 'F1', 'COST_MATRIX', 'LOG_LOSS', 'ROC_AUC', 'CALIBRATION_LOSS', 'CUMULATIVE_LIFT', 'CUSTOM']));
        }
        if ('MULTICLASS' === predictionType) {
            $scope.possibleMetrics.push([null, 'Multiclass classification']);
            $scope.possibleMetrics = $scope.possibleMetrics.concat(toDropdownElems(['ACCURACY', 'PRECISION', 'RECALL', 'F1', 'LOG_LOSS', 'ROC_AUC', 'CALIBRATION_LOSS', 'CUSTOM']));
        }
        if ('REGRESSION' === predictionType) {
            $scope.possibleMetrics.push([null, 'Regression']);
            $scope.possibleMetrics = $scope.possibleMetrics.concat(toDropdownElems(['EVS', 'MAPE', 'MAE', 'MSE', 'RMSE', 'RMSLE', 'R2', 'PEARSON', 'CUSTOM']));
        }
        if ($scope.uiState.currentMetric && $scope.possibleMetrics.filter(_ => _[0] == $scope.uiState.currentMetric).length == 0) {
            // old selected metric isn't possible anymore
            $scope.uiState.currentMetric = null;
        }
        if ($scope.uiState.currentMetric == null) {
            if ('BINARY_CLASSIFICATION' === predictionType) {
                $scope.uiState.currentMetric = 'ROC_AUC';
            }
            if ('MULTICLASS' === predictionType) {
                $scope.uiState.currentMetric = 'ROC_AUC';
            }
            if ('REGRESSION' === predictionType) {
                $scope.uiState.currentMetric = 'R2';
            }
        }
        $scope.uiState.currentMetrics = $scope.possibleMetrics.map(pm => pm[0]).filter(x => x);
        $scope.refreshCurrentMetricNames();
    }

    $scope.refreshCurrentMetricNames = function() {
        if ($scope.uiState.currentMetrics) {
            $scope.uiState.currentFormattedNames = $scope.uiState.currentMetrics.map(cur => {
                return {
                    key: PMLFilteringService.metricMap[cur],
                    label: $scope.possibleMetrics.find(x => x[0] === cur)[1],
                    code: cur
                };
            });
        } else {
            $scope.uiState.currentFormattedNames = [];
        }
        $scope.refreshMetricsValues();
    }

    $scope.getMetricValue = function(metrics,metricCode) {
        return $filter('nicePrecision')(metrics[PMLFilteringService.metricMap[metricCode]],2);
    }

    $scope.refreshMetricsValues = function() {
        let metrics = ($scope.evaluation&&$scope.evaluation.metrics)?$scope.evaluation.metrics:null;

        $scope.uiState.formattedMetrics = {};
        if (!metrics || !Object.keys(metrics).length) {
            $scope.uiState.noperf = true;
            return;
        }

        for (let metricCode of $scope.uiState.currentMetrics) {
            $scope.uiState.formattedMetrics[PMLFilteringService.metricMap[metricCode]] = $scope.getMetricValue(metrics, metricCode);
        }
    }

    $scope.$watch("modelData", () => {
        if ($scope.modelData) $scope.refreshMetrics($scope.modelData.coreParams.prediction_type)
    });

    $scope.$watch("modelData.userMeta.labels", Debounce().withDelay(400, 1000).wrap($scope.saveModelUserMeta));
    $scope.$watch("modelData.modelEvaluation.labels", Debounce().withDelay(400, 1000).wrap($scope.saveEvaluationLabels));
});

app.controller("PartPMLReportSummaryController", function($scope, $controller, $stateParams, DataikuAPI) {
    $controller("PMLReportSummaryController", {$scope: $scope});
    $controller('_SubpopTableUtilsController', {$scope: $scope});

    $scope.dimensionsList = function() {
        return $scope.modelData.coreParams.partitionedModel.dimensionNames
            .map(dim => `<b>${sanitize(dim)}</b>`)
            .join(' and ');
    };

    $scope.getCurrentFeatureData = () => {
        return $scope.partitionsPerf;
    };

    const mergeSnippetsWithModalities = (data, snippets) => {
        data.modalities.forEach((modality) => {
            let snippet;
            if (modality.value && modality.value in snippets.partitions.summaries) {
                snippet = snippets.partitions.summaries[modality.value].snippet;
                // 'status' corresponds:
                //  * for ANALYSIS, to trainInfo.state (ModelTrainState)
                //  * for SAVED, to trainInfo.state if partition was trained or REUSED_... if partition was reused (PartitionState)
                snippet["status"] = snippets.partitions.summaries[modality.value].state;
                modality.snippet= snippet;
            }
        });

        data.allDatasetModality.snippet = snippets;
    };

    const getThreshold = (snippets) => (mod) => {
        if (mod.value && mod.value in snippets.partitions.summaries) {
            const partSnippet = snippets.partitions.summaries[mod.value].snippet;
            if (partSnippet && partSnippet.userMeta) {
                return partSnippet.userMeta.activeClassifierThreshold;
            }
        }

        return snippets.baseModel;
    };

    const preparePartitionsPerf = (partSnippets) => {
        DataikuAPI.ml.prediction.getPartitionsPerf(partSnippets.fullModelId)
            .then(resp => {
                $scope.formatTableResults(resp.data, resp.data.allDatasetPerf, getThreshold(partSnippets));
                mergeSnippetsWithModalities(resp.data, partSnippets);

                $scope.partitionsPerf = resp.data;
            }, setErrorInScope.bind($scope));
    };

    $scope.$watch('partitionedModelSnippets', function(partSnippets) {
        if (!partSnippets) {
            return;
        }

        preparePartitionsPerf(partSnippets);
    });
});

app.controller("PMLReportDriftController", function($scope, $controller, $stateParams, DataikuAPI, ActiveProjectKey, FutureProgressModal, ModelEvaluationUtils, WT1) {
    $scope.fullModelId = $stateParams.fullModelId || $scope.fullModelId;
    $scope.mesId = $stateParams.mesId;
    $scope.runId = $stateParams.runId;
    $scope.driftState.dataDriftResult = undefined;
    $scope.uiState = {
        selectedReference: null,
        refDensityData: null,
        pdd: null,
        currentClass: null,
        refPredValueCount: null,
        curPredValueCount: null,
        pdfs: null
    };

    $scope.dataDriftParams = {
        nbBins: 20,
        confidenceLevel: 0.95,
        psiThreshold: 0.2,
        columns: {} // Full auto by default
    };

    $scope.colors = window.dkuColorPalettes.discrete[0].colors.filter((_,idx) => idx%2 === 0);

    $scope.computePddForClass = function(className) {
        $scope.driftState.pdd = null;
        if ($scope.driftState.refDensityData && (className != null) && Object.keys($scope.driftState.refDensityData).length
            && Object.keys($scope.evaluation.details.perf.densityData).length) {
            $scope.driftState.pdd = {};
            let dd = $scope.driftState.refDensityData[className];
            let dd2 = $scope.evaluation.details.perf.densityData[className];
            let dd_values = dd.correct.map((val, idx) => val + dd.incorrect[idx]);
            let dd2_values = dd2.correct.map((val, idx) => val + dd2.incorrect[idx]);
            $scope.driftState.pdd.x = dd.correct.map(function(_, i, a) { return i / a.length; });
            $scope.driftState.pdd.ys = [dd_values, dd2_values];
            $scope.driftState.pdd.labels = ['class ' + className + ' reference', 'class ' + className + ' current'];
            $scope.driftState.pdd.colors = $scope.colors.slice(0, 2).concat("#9467bd");
        } else {
            $scope.driftState.pdd = null;
        }
    }

    $scope.computePredictionHistogram = function() {
        const source = [['Class', 'Current', 'Reference']];
        for (const currentClass of $scope.driftState.classes) {
            source.push([
                currentClass,
                $scope.driftState.curPredValueCount[currentClass].pct,
                $scope.driftState.refPredValueCount[currentClass].pct
            ]);
        }
        const colors = window.dkuColorPalettes.discrete[0].colors.filter((x,idx) => idx%2 === 0)
        $scope.driftState.predHistogramOptions = {
            tooltip: {},
            dataset: {
                source
            },
            xAxis: {type: 'category', name: 'Predicted class', nameLocation: 'middle', nameGap: 25},
            yAxis: {name: '% of predicted classes', nameLocation: 'middle', nameGap: 25},
            series: [
                {type: 'bar', color: colors[0]},
                {type: 'bar', color: colors[1]}
            ]
        }
    }

    $scope.computeDataDrift = function() {
        const referenceId = makeModelLikeIDStringFromObject($scope.driftState.selectedReference.ref);
        const currentId = makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId);
        WT1.event("compute-drift")
        const promise = DataikuAPI.modelevaluations.computeDataDrift(ActiveProjectKey.get(), referenceId, currentId, $scope.dataDriftParams);
        const copiedParams = angular.copy($scope.dataDriftParams);
        promise.success((result) => {
            $scope.driftState.univariateCols = [];
            FutureProgressModal.show($scope, result, "Computing Data Drift").then((driftResults) => {
                $scope.driftState.dataDriftResult = driftResults;
                $scope.driftState.dataDriftParamsOfResult = copiedParams;
                generateDriftVersusImportanceChart();
            });
        }).error(setErrorInScope.bind($scope));

        return promise;
    }

    function getPerfValueCountFromPerCutData(cutToFind, pcd) {
        if (!pcd) {
            return;
        }
        let i = 0;
        let iMax = pcd.cut.length - 1;
        if (cutToFind >= pcd.cut[iMax]) {
            i = iMax;
        } else {
            while (pcd.cut[i] < cutToFind && i <= iMax) {
                i++;
            }
        }
        var tp = pcd.tp[i], tn = pcd.tn[i], fp = pcd.fp[i], fn = pcd.fn[i];
        var predPos = tp + fp;
        var predNeg = tn + fn;
        var ret = {};
        ret[$scope.driftState.classes[1]] = { records: predPos, pct: ((100.*predPos)/(predPos+predNeg)).toFixed(2) };
        ret[$scope.driftState.classes[0]] = { records: predNeg, pct: ((100.*predNeg)/(predPos+predNeg)).toFixed(2) };
        return ret;
    }

    function getPerfValueCountFromConfusion(confusion) {
        if (!confusion) {
            return;
        }
        let ret = {};
        for (const currentClass of $scope.driftState.classes) {
            ret[currentClass] = { records: 0 };
        }

        for (const actualClass in confusion.perActual) {
            for(let predictedClass in confusion.perActual[actualClass].perPredicted) {
                ret[predictedClass].records += confusion.perActual[actualClass].perPredicted[predictedClass];
            }
        }

        const count = confusion.totalRows;
        for (const currentClass of $scope.driftState.classes) {
            ret[currentClass].pct = ((100.*ret[currentClass].records) / count).toFixed(2);
        }
        return ret;
    }

    function getPerfValueCountFromSavedModel(data) {
        if (data.perf && data.perf.perCutData) {
            return getPerfValueCountFromPerCutData(data.userMeta.activeClassifierThreshold, data.perf.perCutData);
        }
        return getPerfValueCountFromConfusion(data.perf.confusion);
    }

    function getPerfValueCountFromEvaluation(data) {
        if (data.evaluation.details.perf && data.evaluation.details.perf.perCutData) {
            return getPerfValueCountFromPerCutData(data.evaluation.details.userMeta.activeClassifierThreshold, data.evaluation.details.perf.perCutData);
        }

        let ret = {};
        const tops = data.evaluation.evaluatedDataStatistics.univariate[data.evaluation.evaluation.predictionVariable].top;
        const nbRows = data.evaluation.evaluatedDataStatistics.nbRows;
        for (let curClass of $scope.driftState.classes) {
            let topClass = tops.find(t => t.value === curClass);
            if (!topClass) {
                ret[curClass] = { records: 0, pct: 0. };
            } else {
                ret[curClass] = { records: topClass.count, pct: ((topClass.count*100.)/nbRows).toFixed(2) };
            }
        }
        return ret;
    }

    function generateDriftVersusImportanceChart() {
        if(!$scope.driftState.dataDriftResult.driftModelResult.driftVersusImportance.columnImportanceScores) {
            $scope.driftVersusImportanceChart = null;
            return;
        }

        $scope.driftVersusImportanceChart = {
            animation: false,
            tooltip: {
                trigger: 'item',
                axisPointer: { type: 'cross', label: { formatter: ({value})=> Math.round(100 * value) + '%'  } }
            },
            grid: { left: 40, top: 20, right: 20, bottom: 30, containLabel: true },
            xAxis: {
                type: 'value',
                min: 0,
                name: "Drift model feature importance (%)",
                nameLocation: "middle",
                nameGap: 30,
                axisLabel: { formatter: value => Math.round(100 * value) + '%' }
            },
            yAxis: {
                type: 'value',
                min: 0,
                name: "Original model feature importance (%)",
                nameLocation: "middle",
                nameGap: 40,
                axisLabel: { formatter: value => Math.round(100 * value) + '%' }
            },
            series: {
                type: 'scatter',
                symbolSize: 10,
                data: _.zip(
                    $scope.driftState.dataDriftResult.driftModelResult.driftVersusImportance.columnDriftScores,
                    $scope.driftState.dataDriftResult.driftModelResult.driftVersusImportance.columnImportanceScores,
                    $scope.driftState.dataDriftResult.driftModelResult.driftVersusImportance.columns,
                ),
                tooltip: {
                    formatter: ({value}) => '<b>Column: '+sanitize(value[2])+'</b><br>'
                            + 'Drift model feature importance: '+ Math.round(100 * value[0]) + '%<br>'
                            + 'Original model feature importance: '+ Math.round(100 * value[1]) + '%<br>'
                },
                itemStyle: {
                    color: value => dkuColorPalettes.discrete[0].colors[value.dataIndex % dkuColorPalettes.discrete[0].colors.length]
                }
            }
        };
    }

    $scope.isPvalueRejected = function(pvalue) {
        const confidenceLevel = $scope.driftState.dataDriftParamsOfResult && $scope.driftState.dataDriftParamsOfResult.confidenceLevel;
        if(confidenceLevel == null) {
            return false;
        }
        const significanceLevel = 1 - confidenceLevel;
        if (pvalue != null) {
            return pvalue <= significanceLevel;
        }
        return false;
    }

    $scope.isPSIAboveThreshold = function(psi) {
        const threshold = $scope.driftState.dataDriftParamsOfResult && $scope.driftState.dataDriftParamsOfResult.psiThreshold;
        if ((threshold != null) && (psi != null)) {
            return psi > threshold;
        }
        return false;
    }

    $scope.isDriftDetected = function() {
        return $scope.driftState.dataDriftResult
            && $scope.driftState.dataDriftResult.driftModelResult.driftModelAccuracy.pvalue <= (1 - $scope.dataDriftParams.confidenceLevel);
    }

    function listClassesFromPreprocessing(preprocessing) {
        return preprocessing.target_remapping.map(mapping => mapping.sourceValue);
    }

    $scope.computePredictionDrift = function() {
        if ("DOCTOR_MODEL_EVALUATION" === $scope.driftState.selectedReference.refType) {
            DataikuAPI.ml.prediction.getModelDetails(makeFullModelIdStringFromObject($scope.driftState.selectedReference.ref)).success(function(data) {
                if ("REGRESSION" === $scope.evaluation.evaluation.predictionType) {
                    let xs = [];
                    let ys = [];
                    let labels = [];
                    const refDataAvailable = data.perf && data.perf.predictionPDF;
                    const curDataAvailable = $scope.evaluation.details.perf && $scope.evaluation.details.perf.predictionPDF;
                    if (refDataAvailable) {
                        xs.push(data.perf.predictionPDF.x);
                        ys.push(data.perf.predictionPDF.pdf)
                        labels.push('Reference');
                    }
                    if (curDataAvailable) {
                        xs.push($scope.evaluation.details.perf.predictionPDF.x);
                        ys.push($scope.evaluation.details.perf.predictionPDF.pdf)
                        labels.push('Current');
                    }
                    $scope.driftState.unavailableReference = !refDataAvailable;
                    $scope.driftState.unavailableCurrent = !curDataAvailable;

                    $scope.driftState.pdfs = {
                        xs: xs,
                        ys: ys,
                        colors: $scope.colors.slice(0, 2),
                        labels: labels
                    };
                } else {
                    const refDataAvailable = data.perf && data.perf.densityData;
                    const curDataAvailable = $scope.evaluation.details.perf && $scope.evaluation.details.perf.densityData;
                    $scope.driftState.unavailableReference = !refDataAvailable;
                    $scope.driftState.unavailableCurrent = !curDataAvailable;

                    if(refDataAvailable && curDataAvailable) {
                        $scope.driftState.refDensityData = data.perf.densityData;
                        const refClasses = listClassesFromPreprocessing(data.preprocessing);
                        const curClasses = listClassesFromPreprocessing($scope.evaluation.details.preprocessing);
                        $scope.driftState.classes = _.sortedUniq(_.sortBy(refClasses.concat(curClasses)));
                        $scope.driftState.currentClass = $scope.driftState.classes[0];
                        $scope.computePddForClass($scope.driftState.classes[0]);
                        $scope.driftState.refPredValueCount = getPerfValueCountFromSavedModel(data);
                        $scope.driftState.curPredValueCount = getPerfValueCountFromEvaluation($scope);
                        $scope.computePredictionHistogram();
                    }
                }
            }).error(setErrorInScope.bind($scope));
        } else if ("MODEL_EVALUATION" === $scope.driftState.selectedReference.refType) {
            DataikuAPI.modelevaluationstores.getEvaluation($scope.driftState.selectedReference.ref.projectKey,
                                                            $scope.driftState.selectedReference.ref.id,
                                                            $scope.driftState.selectedReference.ref.runId).success(function(data) {
                if ("REGRESSION" === $scope.evaluation.evaluation.predictionType) {
                    let xs = [];
                    let ys = [];
                    let labels = [];
                    const refDataAvailable = data.evaluation.details.perf && data.evaluation.details.perf.predictionPDF;
                    const curDataAvailable = $scope.evaluation.details.perf && $scope.evaluation.details.perf.predictionPDF;
                    if (refDataAvailable) {
                        xs.push(data.evaluation.details.perf.predictionPDF.x);
                        ys.push(data.evaluation.details.perf.predictionPDF.pdf)
                        labels.push('Reference');
                    }
                    if (curDataAvailable) {
                        xs.push($scope.evaluation.details.perf.predictionPDF.x);
                        ys.push($scope.evaluation.details.perf.predictionPDF.pdf)
                        labels.push('Current');
                    }
                    $scope.driftState.unavailableReference = !refDataAvailable;
                    $scope.driftState.unavailableCurrent = !curDataAvailable;

                    $scope.driftState.pdfs = {
                        xs: xs,
                        ys: ys,
                        colors: $scope.colors.slice(0, 2),
                        labels: labels
                    };
                } else {
                    const refDataAvailable = data.evaluation.details.perf && data.evaluation.details.perf.densityData;
                    const curDataAvailable = $scope.evaluation.details.perf && $scope.evaluation.details.perf.densityData;
                    $scope.driftState.unavailableReference = !refDataAvailable;
                    $scope.driftState.unavailableCurrent = !curDataAvailable;

                    if(refDataAvailable && curDataAvailable) {
                        $scope.driftState.refDensityData = data.evaluation.details.perf.densityData;
                        const refClasses = listClassesFromPreprocessing(data.evaluation.details.preprocessing);
                        const curClasses = listClassesFromPreprocessing($scope.evaluation.details.preprocessing);
                        $scope.driftState.classes = _.sortedUniq(_.sortBy(refClasses.concat(curClasses)));
                        $scope.driftState.currentClass = $scope.driftState.classes[0];
                        $scope.computePddForClass($scope.driftState.classes[0]);
                        $scope.driftState.refPredValueCount = getPerfValueCountFromEvaluation(data);
                        $scope.driftState.curPredValueCount = getPerfValueCountFromEvaluation($scope);
                        $scope.computePredictionHistogram();
                    }
                }
            }).error(setErrorInScope.bind($scope));
        }
    }

    DataikuAPI.modelevaluationstores.listWithAccessible(ActiveProjectKey.get()).success(function(data){
        $scope.storeList = data;
    });
    DataikuAPI.savedmodels.listWithAccessible($stateParams.projectKey).success(function(data){
        $scope.modelList = data;
    });

    $scope.computePerformanceDrift = function() {
        if ("DOCTOR_MODEL_EVALUATION" === $scope.driftState.selectedReference.refType) {
            DataikuAPI.modelevaluations.getFMIEvaluationInfo($stateParams.projectKey, makeFullModelIdStringFromObject($scope.driftState.selectedReference.ref)).success(function(data) {
                let ref = ModelEvaluationUtils.makeRefDisplayItemFromFMInfo(data, $scope.modelList);
                ref.metrics = data.metrics;
                let cur = ModelEvaluationUtils.makeRefDisplayItemFromEvaluation($scope.evaluation.evaluation, $scope.storeList);
                cur.metrics = $scope.evaluation.metrics;
                $scope.driftState.perfDriftRefs = [cur, ref];
            }).error(setErrorInScope.bind($scope));
        } else if ("MODEL_EVALUATION" === $scope.driftState.selectedReference.refType) {
            DataikuAPI.modelevaluationstores.getEvaluation($scope.driftState.selectedReference.ref.projectKey,
                                                            $scope.driftState.selectedReference.ref.id,
                                                            $scope.driftState.selectedReference.ref.runId).success(function(data) {
                let ref = ModelEvaluationUtils.makeRefDisplayItemFromEvaluation(data.evaluation.evaluation, $scope.storeList);
                ref.metrics = data.evaluation.metrics;
                let cur = ModelEvaluationUtils.makeRefDisplayItemFromEvaluation($scope.evaluation.evaluation, $scope.storeList);
                cur.metrics = $scope.evaluation.metrics;
                $scope.driftState.perfDriftRefs = [cur, ref];

            }).error(setErrorInScope.bind($scope));
        }
    }

    $scope.getColumnParams = function(columnName) {
        const params = $scope.dataDriftParams.columns[columnName];
        return params ? params : { handling: 'AUTO', enabled: true };
    }

    $scope.changeColumnEnabled = function(columnName, enabled) {
        const previousColumnParams = $scope.getColumnParams(columnName);
        const newColumnParams = { ... previousColumnParams, enabled };

        $scope.changeColumnParams(columnName, newColumnParams);
    }

    $scope.changeColumnParams = function(columnName, newColumnParams) {
        $scope.dataDriftParams.columns[columnName] = newColumnParams;
        $scope.computeDataDrift();
    }

    $scope.changeColumnHandling = function(columnName, handling) {
        const previousColumnParams = $scope.getColumnParams(columnName);
        const newColumnParams = { ... previousColumnParams, handling };

        $scope.changeColumnParams(columnName, newColumnParams);
    }

    $scope.driftingColumns = function() {
        let driftingColumns = [];
        for (const [columnName, columnDrift] of Object.entries($scope.driftState.dataDriftResult.univariateDriftResult.columns)) {
            if($scope.isPvalueRejected(columnDrift.chiSquareTestPvalue)
                || $scope.isPvalueRejected(columnDrift.ksTestPvalue)
                || $scope.isPSIAboveThreshold(columnDrift.populationStabilityIndex)) {
                    driftingColumns.push(columnName);
                }
        }
        return driftingColumns;
    }

    $scope.sortValue = function(sortColumn) {
        return columnReport => {
            const univariateResult = $scope.driftState.dataDriftResult.univariateDriftResult.columns[columnReport.name];
            if(univariateResult && univariateResult[sortColumn] != null) {
                return univariateResult[sortColumn];
            }
            return columnReport[sortColumn];
        };
    }

    $scope.$watch('driftState.currentClass', function(nv) {
        $scope.computePddForClass(nv);
    });

    $scope.perfDriftLabel = function(item) {
        return item.perfDriftLabel;
    }

    $scope.preselectBestReferences = function() {
        if ($scope.driftState.selectedReference || !$scope.currentMEReference) {
            return;
        }
        if (!$scope.compatibleReferences || !$scope.compatibleReferences.length) {
            return;
        }
        const matchingReferences = $scope.compatibleReferences.filter(cr => (cr.trainDataSetName === $scope.currentMEReference.trainDataSetName)
            && (cr.modelName === $scope.currentMEReference.modelName));
            if (matchingReferences && matchingReferences.length) {
            let matchingSavedModels = matchingReferences.find(cr => "DOCTOR_MODEL_EVALUATION" === cr.refType);
            if (matchingSavedModels && matchingSavedModels.length) {
                matchingSavedModels.sort((sm1,sm2) => sm1.trainDataSetOrder < sm2.trainDataSetOrder);
                $scope.driftState.selectedReference = matchingSavedModels[matchingSavedModels.length - 1];
            } else {
                $scope.driftState.selectedReference = matchingReferences[matchingReferences.length-1];
            }
        }
    }


    $scope.displayParams = null;
    $scope.cloneDisplayParams = function() {
        $scope.displayParams = angular.copy($scope.modelEvaluationStore.displayParams);
    }

    $scope.$watch('compatibleReferences', $scope.preselectBestReferences);

    $scope.$watch('modelEvaluationStore.displayParams', $scope.cloneDisplayParams);
});

app.service("ModelEvaluationUtils", function($stateParams) {
    function addOrderToTitle(title, order) {
        if (!title) {
            return null;
        }
        if (!order) {
            return title;
        }
        if (!isNaN(order)) {
            let intOrder = parseInt(order);
            if (intOrder > 1451606400) // 2016/1/1 00:00:00
                return title + " " + moment(intOrder).format("YYYY-MM-DD HH:mm:ss");
        }
        return title + " " + order;
    }

    function processDatasetOrder(datasetParams) {
        return processOrder(datasetParams.generationDate);
    }

    function processOrder(order) {
        if (!order) {
            return null;
        }
        if (!isNaN(order)) {
            let intOrder = parseInt(order);
            if (intOrder > 1451606400) // 2016/1/1 00:00:00
                return moment(intOrder).format("YYYY-MM-DD HH:mm:ss");
            return intOrder;
        }
        return order;
    }

    var makeRefDisplayItemFromEvaluation = function (evaluation, storeList) {
        if (!evaluation) {
            return null;
        }
        if (!storeList) {
            storeList = [];
        }
        let modelUniqueId = null;
        const trainDataSetOrder = evaluation.trainDataParams?processDatasetOrder(evaluation.trainDataParams):null;
        let trainDataSetName = (evaluation.trainDataParams && evaluation.trainDataParams.datasetName)?evaluation.trainDataParams.datasetName: "Unknown train dataset";
        trainDataSetName = addOrderToTitle(trainDataSetName, trainDataSetOrder);

        const modelOrder = (evaluation.modelParams && evaluation.modelParams.trainEndTime)?processOrder(evaluation.modelParams.trainEndTime):null;
        let modelName = (evaluation.modelParams && evaluation.modelParams.versionName)?evaluation.modelParams.versionName:"Unknown model";
        if ("SAVED_MODEL" === evaluation.modelType) {
            modelUniqueId = "S-" + evaluation.ref.projectKey + "-" + evaluation.modelParams.ref + "-" + evaluation.modelParams.versionId;
        }

        // cheating a bit : setting evaluation dataset generation date to evaluation creation date - which is right as of now
        evaluation.dataParams.generationDate = evaluation.created;
        const evaluationDataSetOrder = evaluation.dataParams?processDatasetOrder(evaluation.dataParams):null;
        let evaluationDatasetName = (evaluation.dataParams && evaluation.dataParams.ref)?evaluation.dataParams.ref:"Unknown test dataset";
        evaluationDatasetName = addOrderToTitle(evaluationDatasetName, evaluationDataSetOrder);

        const store = storeList.find(s => (s.id === evaluation.ref.id) && (s.projectKey === evaluation.ref.projectKey));
        const storeStr = (store ? store.name : evaluation.ref.id) + ($stateParams.projectKey == evaluation.ref.projectKey ? '' : ` in ${evaluation.ref.projectKey}`);
        const isFromCurrentMES = $stateParams.projectKey == evaluation.ref.projectKey && $stateParams.mesId == evaluation.ref.id;

        return {
            trainDataSetName: trainDataSetName,
            trainDataSetOrder: trainDataSetOrder,
            evaluationDatasetName: evaluationDatasetName,
            evaluationDataSetOrder: evaluationDataSetOrder,
            modelName: modelName,
            modelUniqueId: modelUniqueId,
            modelOrder: modelOrder,
            runId: evaluation.ref.runId,
            ref: evaluation.ref,
            refStr: `${evaluation.ref.runId}` + (isFromCurrentMES ? '' : ` (store: ${storeStr})`),
            refType: "MODEL_EVALUATION",
            labels: evaluation.labels.reduce((map, obj) => {
                    map.set(obj.key, obj.value);
                    return map;
                }, new Map())
        };
    };

    var makeRefDisplayItemFromFMInfo = function(smInfo, savedModelList) {
        if (!savedModelList) {
            savedModelList = [];
        }
        const trainDataSetOrder = smInfo.trainDataParams?processDatasetOrder(smInfo.trainDataParams):null;
        let trainDataSetName = (smInfo.trainDataParams && smInfo.trainDataParams.datasetName)?smInfo.trainDataParams.datasetName: "Unknown train dataset";
        trainDataSetName = addOrderToTitle(trainDataSetName, trainDataSetOrder);

        const modelOrder = (smInfo.modelParams && smInfo.modelParams.trainEndTime)?processOrder(smInfo.modelParams.trainEndTime):null;
        let modelName = (smInfo.modelParams && smInfo.modelParams.versionName)?smInfo.modelParams.versionName:"Unknown model";

        const sm = savedModelList.find(s => (s.id === smInfo.ref.smId) && (s.projectKey === smInfo.ref.projectKey));
        const smStr = (sm ? sm.name : smInfo.ref.smId) + ($stateParams.projectKey == smInfo.ref.projectKey ? '' : ` in ${smInfo.ref.projectKey}`);

        const labels = smInfo.labels?smInfo.labels.reduce((map, obj) => {
                map.set(obj.key, obj.value);
                return map;
            }, new Map()):new Map();
        return {
            trainDataSetName: trainDataSetName,
            trainDataSetOrder: trainDataSetOrder,
            evaluationDatasetName: null,
            evaluationDataSetOrder: -1, // ###TODO change this
            modelName: modelName,
            modelOrder: modelOrder,
            modelUniqueId: smInfo.ref.fullId,
            ref: smInfo.ref,
            refStr: `${smStr}, version ${smInfo.ref.smVersionId}`,
            refType: "DOCTOR_MODEL_EVALUATION",
            labels: labels
        };
    };

    var makeRefDisplayItemFromModelLikeInfo = function(mli, storeList, savedModelList) {
        if (!mli) {
            return null;
        }
        if (mli instanceof Array) {
            return mli.map(cur => makeRefDisplayItemFromModelLikeInfo(cur, storeList, savedModelList));
        }
        if ("DOCTOR_MODEL_EVALUATION" === mli.modelLikeType) {
            return makeRefDisplayItemFromFMInfo(mli, savedModelList);
        } else if("MODEL_EVALUATION" === mli.modelLikeType) {
            return makeRefDisplayItemFromEvaluation(mli, storeList);
        } else {
            throw new Error(`Unknown model-like type ${mli.modelLikeType}`) ;
        }
    }

    var computeReferenceLabels = function(references) {
        if (!references || !references.length) {
            return [];
        }
        let labeledReferences = references.map(r => {
            if ("DOCTOR_MODEL_EVALUATION" === r.refType) {
                r.inputDriftLabel = `Dataset ${r.trainDataSetName} used to train model ${r.modelName}`;
                r.perfDriftLabel = `Model ${r.modelName} trained on ${r.trainDataSetName}`;
            } else if ("MODEL_EVALUATION" === r.refType) {
                r.inputDriftLabel  = `Dataset ${r.evaluationDatasetName} used to evaluate Model ${r.modelName} trained on ${r.trainDataSetName}`;
                r.perfDriftLabel = `Model ${r.modelName} trained on ${r.trainDataSetName} evaluated on ${r.evaluationDatasetName}`;
            } else {
                throw new Error(`Unknown model-like type ${r.refType}`) ;
            }
            r.inputDriftLabel += ` (${r.refStr})`;
            r.perfDriftLabel += ` (${r.refStr})`;
            return r;
        });
        return labeledReferences;
    }

    return {
        makeRefDisplayItemFromEvaluation,
        makeRefDisplayItemFromFMInfo,
        makeRefDisplayItemFromModelLikeInfo,
        computeReferenceLabels
    };
});

})();
