(function(){
'use strict';

var app = angular.module('dataiku.ml.report', []);

/**
 * Controller for displaying results screen of a prediction model,
 * either in a PMLTask or a PredictionSavedModel
 *
 * Requires: $stateParams.fullModelId or $scope.fullModelId
 *
 * Must be inserted in another controller.
 */
app.controller("_PredictionModelReportController", function($state, $scope, $location, $rootScope, $controller, Assert,
    DataikuAPI, Debounce, $stateParams, ActivityIndicator, Fn, TopNav, BinaryClassificationModelsService, PartitionedModelsService, ActiveProjectKey){

    $controller("_ModelReportControllerBase", {$scope:$scope});

    $scope.uiState = $scope.uiState || {};

    $scope.areMetricsWeighted = function() {
        return $scope.modelData && !!$scope.modelData.coreParams.weight && ($scope.modelData.coreParams.weight.weightMethod == "SAMPLE_WEIGHT" || $scope.modelData.coreParams.weight.weightMethod == "CLASS_AND_SAMPLE_WEIGHT");
    };

    $scope.printWeightedIfWeighted = function() {
        return $scope.areMetricsWeighted() ? "Weighted" : "";
    }

    $scope.isTimeOrderingEnabled = function() {
        return $scope.modelData && !!$scope.modelData.coreParams.time && $scope.modelData.coreParams.time.enabled;
    };

    $scope.getAggregationExplanation = function(metricName, displayName) {
        return PartitionedModelsService.getAggregationExplanation(metricName, displayName || metricName);
    }

    function prepareFormat(modelData) {
        try {
            const pcd = modelData.perf.perCutData;
            const pdd = modelData.perf.densityData;
            const tr = modelData.preprocessing ? modelData.preprocessing.target_remapping : null;
            if (pcd) { // set default format for x, both y axes, and CMG in tooltip
                pcd.format = ['.02f', '.02f', '.02f', '.02f'];
            }
            modelData.classes = tr && tr.length ? tr.map(Fn.prop('sourceValue')) : (pdd ? Object.keys(pdd) : null);
            modelData.hasProbas = modelData.iperf && modelData.iperf.probaAware;
            if (pdd) { // Probability densities: make X coordinates
                pdd.x = pdd[modelData.classes[0]].incorrect.map(function(_, i, a) { return i / a.length; });
            }
        } catch(ignored) {
        }
    };
    
    $scope.currentGraphData = {};
    
    if ($scope.modelData) {
        $scope.fullModelId = $scope.fullModelId || $scope.modelData.fullModelId;
        prepareFormat($scope.modelData);
        $scope.headTaskCMW = $scope.modelData.headTaskCMW;
        computeCMG();

        $scope._selectPane();

        if ($scope.modelData.userMeta.activeClassifierThreshold) {
            updateGraphData($scope.modelData.userMeta.activeClassifierThreshold);
        }

        if ($scope.mlTasksContext) {
            $scope.mlTasksContext.model = $scope.modelData;
        }
        if ($scope.smContext) {
            $scope.smContext.model = $scope.modelData;
        }
    } else {

        const fullModelId = $stateParams.fullModelId || $scope.fullModelId;
        const p = DataikuAPI.ml.prediction.getModelDetails(fullModelId).success(function(modelData) {
            prepareFormat(modelData);
            $scope.modelData = modelData;
            $scope.headTaskCMW = modelData.headTaskCMW;
            computeCMG();

            $scope._selectPane();

            if (modelData.userMeta) {
                TopNav.setPageTitle(modelData.userMeta.name + " - Analysis");
                updateGraphData($scope.modelData.userMeta.activeClassifierThreshold);
            }

            if ($scope.mlTasksContext) {
                $scope.mlTasksContext.model = modelData;
            }
            if ($scope.smContext) {
                $scope.smContext.model = modelData;
            }

            if ($scope.onLoadSuccess) $scope.onLoadSuccess(); // used by saved-model-report-insight-tile

            // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
            $scope.puppeteerHook_elementContentLoaded = true;
        }).error(setErrorInScope.bind($scope))
          .error(function(data, status, headers, config, statusText) {
            if ($scope.onLoadError) $scope.onLoadError(data, status, headers, config, statusText);
        });

        if ($scope.noSpinner) p.noSpinner(); // used by saved-model-report-insight-tile
    }

    $scope.colors  = window.dkuColorPalettes.discrete[0].colors // adjacent colors are too similar
        .filter(function(c, i) { return i % 2 === 0; });        // take only even-ranked ones

    function isPrediction() {
        return $scope.modelData && this.indexOf($scope.modelData.coreParams.prediction_type) !== -1;
    }

    $scope.isClassification       = isPrediction.bind(['BINARY_CLASSIFICATION', 'MULTICLASS']);
    $scope.isBinaryClassification = isPrediction.bind(['BINARY_CLASSIFICATION']);
    $scope.isMulticlass           = isPrediction.bind(['MULTICLASS']);
    $scope.isRegression           = isPrediction.bind(['REGRESSION']);
    $scope.isPrediction           = Fn.cst(true);

    $scope.hasVariableImportance = function() {
        if (!$scope.modelData) return false;
        var iperf = $scope.modelData.iperf;
        return !!(iperf && iperf.rawImportance && iperf.rawImportance.variables && iperf.rawImportance.variables.length);
    };
    $scope.hasRawCoefficients = function() {
        if (!$scope.modelData) return false;
        var iperf = $scope.modelData.iperf;
        return !!(iperf && iperf.lmCoefficients);
    };

    $scope.hasDensityData = function() {
        return $scope.isClassification() &&
            $scope.modelData &&
            $scope.modelData.perf &&
            $scope.modelData.perf.densityData &&
            $scope.modelData.perf.densityData.x
    };

    $scope.hasNoAssociatedModel = function() {
        return !!$scope.evaluation
            && ($scope.evaluation.evaluation.modelType=='EXTERNAL'
                || $scope.evaluation.backingModelVersionDeleted);
    }

    $scope.hasNoAssociatedModelText = function() {
        if (!!$scope.evaluation) {
            if ($scope.evaluation.evaluation.modelType=='EXTERNAL') {
                return "Not available for model evaluations without a backing DSS model";
            }
            if ($scope.evaluation.backingModelVersionDeleted) {
                return "Not available as evaluated DSS model version is no longer available";
            }
        }
        return null;
    }

    $scope.tabNotAvailableText = function(tabName) {
        const tabModelNeeded = ["train", "pdp_plot", "individual_explanations", "interactive_scoring"];
        const tabProbaNeeded = ["pdp_plot", "subpopulation", "individual_explanations", "interactive_scoring"];
        const tabNoKeras = ["individual_explanations"];
        if (tabNoKeras.includes(tabName) && $scope.modelData && $scope.modelData.backendType == "KERAS") {
            return "Not available for Keras models";
        }
        if (tabModelNeeded.includes(tabName) && $scope.hasNoAssociatedModel()) {
            return $scope.hasNoAssociatedModelText();
        }
        // /!\ if no perf, tab is deactivated in any case (no matter its name)
        if ($scope.modelData && !$scope.modelData.perf) {
            return "Model performance was not computed (disabled or ground truth was missing)";
        }
        if ($scope.isClassification() && tabProbaNeeded.includes(tabName) && $scope.modelData.hasProbas === false) {
            return "Not available for non-probabilistic models";
        }
        if (tabName == "subpopulation" && $scope.isMulticlass()) {
            return "Not available for multi-class classification";
        }
        return null;
    }

    $scope.hasROCCurve = function() {
        return ($scope.isBinaryClassification() && $scope.modelData && $scope.modelData.perf && $scope.modelData.perf.rocVizData) ||
            ($scope.isMulticlass() && Object.keys($scope.modelData && $scope.modelData.perf && $scope.modelData.perf.oneVsAllRocCurves || {}).length);
    };

    $scope.isTreeModel = function() {
        return ['MLLIB_DECISION_TREE', 'DECISION_TREE_CLASSIFICATION', 'DECISION_TREE_REGRESSION'].indexOf($scope.getAlgorithm()) >=0;
    };

    $scope.isEnsembleModel = function(){
         var algo = $scope.getAlgorithm();
         return ['GBT_REGRESSION', 'GBT_CLASSIFICATION', 'RANDOM_FOREST_CLASSIFICATION', 'RANDOM_FOREST_REGRESSION',
            'MLLIB_GBT', 'MLLIB_RANDOM_FOREST'].indexOf(algo) >=0 && ! (
                algo == 'MLLIB_RANDOM_FOREST' && $scope.isMulticlass() //because we can't create summary correctly for this case
            );
    };

    // Cost Matrix Gain
    function computeCMG() {
        Assert.inScope($scope, 'modelData');

        const perCut = $scope.modelData.perf && $scope.modelData.perf.perCutData;
        if (!perCut) {
            return;
        }
        perCut.totalRows = $scope.modelData.trainInfo.testRows // 0 if k-fold
            || perCut.fn[0] + perCut.fp[0] + perCut.tn[0] + perCut.tp[0];
        perCut.cmg = perCut.cut.map(function(c, i) {
                return (this.fnGain * perCut.fn[i] + this.tnGain * perCut.tn[i] +
                        this.fpGain * perCut.fp[i] + this.tpGain * perCut.tp[i]
                    ) / (perCut.fn[i] + perCut.tn[i] +  perCut.fp[i] + perCut.tp[i]);
            }, $scope.headTaskCMW);
        if ($scope.currentCutData) {
            $scope.currentCutData.cmg = perCut.cmg[$scope.currentCutData.index];
        }
        const e = d3.extent(perCut.cmg);
        perCut.format[2] = e[1] - e[0] > 10 ? '1g' : '.02f';
    }

    $scope.uiState.displayMode = "records";

    $scope.getMaybeWeighted = function(x) {
        if (typeof x !== 'number') {
            return x; // for when it's percentage
        }
        return $scope.areMetricsWeighted() ? x.toFixed(2) : x.toFixed(0);
    };

    function getPercentString(p) {
        if (p < 0.01) {
            return "< 1 %";
        } else if (p > 1) {
            return "100 %";
        }
        else {
            return Math.round(p * 100) + " %";
        }
    }

    $scope.currentGraphData = {};
    function updateGraphData(nv) {
        if (nv === undefined) return;
        $scope.currentCutData = BinaryClassificationModelsService.findCutData($scope.modelData.perf, nv);
        angular.forEach($scope.currentCutData, // capitalized => graphed
            function(v, k) { if (k.charCodeAt(0) <= 90) {
              if ($scope.areMetricsWeighted()) this["Weighted " + k] = v;
              else this[k] = v;
          }},
          $scope.currentGraphData);
    }
    $scope.$watch("modelData.userMeta.activeClassifierThreshold", updateGraphData);

    // Handling of save
    if (!$scope.readOnly) {
        var simpleApiResult = function(msg, r) {
                r.success(function(){ ActivityIndicator.success(msg) })
                 .error(setErrorInScope.bind($scope));
        };
        var debouncedUpdateCMW = Debounce().withDelay(400, 1000).wrap(function() {
            if (!$scope.savedModel && !$scope.evaluation) {
                const fid = $stateParams.fullModelId || $scope.fullModelId;
                simpleApiResult("Weights saved", DataikuAPI.analysis.pml.saveCostMatrixWeights(fid, $scope.headTaskCMW));
            }
            computeCMG();
        });
        var saveMeta = function() {
            if ($scope.readOnly) return;
            if ($scope.evaluation) {
                let fme = makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId);
                simpleApiResult("Saved", DataikuAPI.modelevaluations.saveEvaluationUserMeta(
                        fme, $scope.modelData.userMeta));
            } else {
                simpleApiResult("Saved", DataikuAPI.ml.saveModelUserMeta(
                        $stateParams.fullModelId || $scope.fullModelId, $scope.modelData.userMeta));
            }
        };
        var debouncedSaveMeta = Debounce().withDelay(400, 1000).wrap(saveMeta);
        var saveIfDataChanged = function(nv, ov) { if (nv && ov && !$scope.evaluation) this.call(); }; // only applies to saved models
        $scope.$watch("headTaskCMW",               saveIfDataChanged.bind(debouncedUpdateCMW), true);
        $scope.$watch("modelData.userMeta.activeClassifierThreshold", saveIfDataChanged.bind(debouncedSaveMeta), true);
    
        $scope.$watch("modelData.userMeta", function(nv, ov){
            if (nv && ov && (nv.name != ov.name || nv.description != ov.description || !_.isEqual(nv.labels, ov.labels))) {
                saveMeta();
            }
        }, true)
    }
});


app.controller("PredictionPerformanceMetricsController", function ($scope, BinaryClassificationModelsService) {
    $scope.mu = $scope.modelData.userMeta;
    let updateAssertionResult = function () {
        // used for initialization in multiclass & regression and for initialization and update for binary classification
        if (!$scope.modelData) return;
        let assertionsMetrics;

        if ($scope.isBinaryClassification()) {
            $scope.currentCutData = BinaryClassificationModelsService.findCutData($scope.modelData.perf, $scope.modelData.userMeta.activeClassifierThreshold);
            if ($scope.currentCutData !== undefined) {
                $scope.cci = $scope.currentCutData.index
            }
            if ($scope.modelData.perf.perCutData.assertionsMetrics) {
                assertionsMetrics = $scope.modelData.perf.perCutData.assertionsMetrics[$scope.cci];
            }
        } else {
            assertionsMetrics = $scope.modelData.perf.metrics.assertionsMetrics;
        }
        if (assertionsMetrics) {
            // Reordering assertion results as {assertionName: {... assertion results ...}} for ease of use
            $scope.assertionsResult = {hasAnyDroppedRows: false};
            for (let assertionMetric of assertionsMetrics.perAssertion) {
                $scope.assertionsResult[assertionMetric.name] = assertionMetric;
                let nbDropped = assertionMetric.nbDroppedRows;
                if (nbDropped > 0) {
                    $scope.assertionsResult.hasAnyDroppedRows = true;
                }
                let nbMatchingRows = assertionMetric.nbMatchingRows;
                let nbPassing = Math.round(assertionMetric.validRatio * (nbMatchingRows - nbDropped));
                let nbFailing = Math.round(nbMatchingRows - nbDropped - nbPassing);
                $scope.assertionsResult[assertionMetric.name].nbPassing = nbPassing;
                $scope.assertionsResult[assertionMetric.name].nbFailing = nbFailing;
                $scope.assertionsResult[assertionMetric.name].passingPercentage = Math.round(100 * nbPassing / nbMatchingRows);
                $scope.assertionsResult[assertionMetric.name].failingPercentage = Math.round(100 * nbFailing / nbMatchingRows);
                $scope.assertionsResult[assertionMetric.name].droppedPercentage = Math.round(100 * nbDropped / nbMatchingRows);
            }
        }
    };
    $scope.$watch("modelData.userMeta.activeClassifierThreshold", updateAssertionResult);
})

app.controller('PMLReportTrainController', function($scope, PMLSettings, SamplingData, MLDiagnosticsService, FullModelIdUtils) {
    var split = $scope.modelData.splitDesc.params,
        ttPolicy = split.ttPolicy,
        samplingMethods = arr2obj(SamplingData.streamSamplingMethods),
        partitionSelectionMethods = arr2obj(SamplingData.partitionSelectionMethods),
        tmp;

    $scope.mti = $scope.modelData.trainInfo;
    $scope.diagnostics = MLDiagnosticsService.groupByType($scope.modelData.trainDiagnostics);

    $scope.isMLBackendType = function(mlBackendType) {
        return $scope.modelData.coreParams.backendType === mlBackendType;
    };

    $scope.canDisplayDiagnostics = function() {
        const modelData = $scope.modelData;
        if (FullModelIdUtils.isPartition(modelData.fullModelId)) {
            return true;  // Always display diagnostics on a partition
        }

        // We cannot know from a Saved Model if we are on a partition base or not, so use smOrigin to check that
        if (!angular.isUndefined(modelData.smOrigin) && !angular.isUndefined(modelData.smOrigin.fullModelId)) {
            return !FullModelIdUtils.isAnalysisPartitionBaseModel(modelData.smOrigin.fullModelId);  // Do not display Diagnostics on partition base
        }

        return !FullModelIdUtils.isAnalysisPartitionBaseModel(modelData.fullModelId);;
    };

    // Make a nice array for train & test policy

    function selection(prefix, ds, sel) {
        if (ds) {
            this.push([prefix + 'dataset',  ds]);
        }
        this.push([prefix + 'sampling method', samplingMethods[sel.samplingMethod]]);
        this.push([prefix + 'partitions', partitionSelectionMethods[sel.partitionSelectionMethod]]);
        if (sel.partitionSelectionMethod === 'SELECTED') {
            this[this.length-1].push(': ', sel.selectedPartitions.join(', '));
        }
        if (['HEAD_SEQUENTIAL', 'RANDOM_FIXED_NB', 'COLUMN_BASED'].indexOf(sel.samplingMethod) >= 0) {
            this.push([prefix + 'record limit', sel.maxRecords]);
            if (sel.samplingMethod === 'COLUMN_BASED') {
                this.push([prefix + 'column', sel.column]);
            }
        } else if (sel.samplingMethod === 'RANDOM_FIXED_RATIO') {
            this.push([prefix + 'sampling ratio', sel.targetRatio]);
        }
    }

    if (ttPolicy === 'SPLIT_SINGLE_DATASET') {
        ttPolicy = split.ssdDatasetSmartName ? 'SPLIT_OTHER_DATASET' : 'SPLIT_MAIN_DATASET';
    } else if (ttPolicy === 'EXPLICIT_FILTERING_SINGLE_DATASET') {
        ttPolicy = split.efsdDatasetSmartName ? 'EXPLICIT_FILTERING_SINGLE_DATASET_OTHER' : 'EXPLICIT_FILTERING_SINGLE_DATASET_MAIN';
    }
    $scope.cvParams = [["policy", arr2obj(PMLSettings.task.trainTestPolicies)[ttPolicy]]];
    switch (ttPolicy) {
        case 'SPLIT_MAIN_DATASET':
        case 'SPLIT_OTHER_DATASET':
            selection.call($scope.cvParams, '', split.datasetSmartName, split.ssdSelection);
            $scope.cvParams.push(['split mode', arr2obj(PMLSettings.task.splitModes)[split.ssdSplitMode]]);
            if (split.kfold) {
                $scope.cvParams.push(['number of folds', split.nFolds]);
            } else {
                $scope.cvParams.push(['train ratio', split.ssdTrainingRatio]);
            }
            $scope.cvParams.push(['random seed', split.ssdSeed]);
            break;
        case 'EXPLICIT_FILTERING_SINGLE_DATASET':
            selection.call($scope.cvParams, 'Train ', split.eftdTrain.datasetSmartName, split.eftdTrain.selection);
            selection.call($scope.cvParams, 'Test  ', split.eftdTest .datasetSmartName, split.eftdTest .selection);
            break;
        case 'EXPLICIT_FILTERING_TWO_DATASETS':
            selection.call($scope.cvParams, 'Train ', split.eftdTrain.datasetSmartName, split.eftdTrain.selection);
            selection.call($scope.cvParams, 'Test  ', split.eftdTest .datasetSmartName, split.eftdTest .selection);
            break;
        case 'FIXED_ID_BASED': break;
    }
});

// For elements that are instantly loaded (raw text for example) we signal right away to Puppeteer that they are available for content extraction
app.directive('puppeteerHookElementContentLoaded', function() {
    return {
        scope: false,
        restrict: 'A',
        link: function($scope) {
            // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
            $scope.puppeteerHook_elementContentLoaded = true;
        }
    };
});

app.controller('DecisionChartController', function($scope, $stateParams, MLChartsCommon) {
    $scope.pcd = $scope.modelData.perf.perCutData;
    if (!$scope.modelData.trainInfo.kfold) {
        return;
    }

    // wrap lines with confidence area
    $scope.svgCallback = MLChartsCommon.makeSvgAreaCallback(scope =>
        scope.theData
            .map(series => Object.assign({}, series, { std: $scope.pcd[series.key.toLowerCase() + 'std'] }))
            .filter(_ => _.std) // only series with a stddev series
            .map(series => ({
                color: series.color,
                values: series.values
                    // filter NaN data to prevent erroneous path
                    .filter(d => typeof d.y === 'number' && !isNaN(d.y))
                    .map((d, i) => ({
                        x: d.x,
                        y0: Math.max(0, d.y - 2 * series.std[i]),
                        y1: Math.min(1, d.y + 2 * series.std[i])
                    }))
            }))
    );
});


app.controller('ClassificationDensityController', function($scope) {
    var pdd = $scope.modelData.perf.densityData;
    $scope.colorsRep = $scope.colors.slice(0, 2).concat($scope.colors.slice(0, 2))
    $scope.setDensityClass = function(nc) {
        var dd = pdd[nc];
        $scope.densityClass = nc;
        $scope.ys = [dd.incorrect, dd.correct];
        $scope.xm = [dd.incorrectMedian, dd.correctMedian];
        $scope.labels = $scope.isMulticlass() ? ['For all classes but ' + nc, 'For class ' + nc]
                : ['For class ' + $scope.modelData.classes[0], 'For class ' + $scope.modelData.classes[1]];
    }
    $scope.setDensityClass($scope.modelData.classes[$scope.isMulticlass() ? 0 : 1]);
});


app.factory("VariablesImportanceService", function($filter){
    return {
        build: function(rawImportance, colors) {
            var imp = rawImportance,
                name = $filter('mlFeature'),
                rgb = colors[0];

            rgb = rgb.replace('#', '').replace(/^([0-9a-f])([0-9a-f])([0-9a-f])$/, '$1$1'); // 6-digit hex
            rgb = parseInt(rgb, 16);
            rgb = ['rgba(', rgb >> 16, ',', rgb >> 8 & 255, ', ', rgb & 255, ', '].join('');

            imp = imp.variables.map(function(v, i) { return { r : v, v: name(v), i: this[i] }; }, imp.importances);
            imp = $filter('orderBy')(imp, '-i');

            var filtered_imp = imp.slice(0, 20);
            var importances = filtered_imp.map(function(o) { return [o.v, o.i]; });
            var fades       = filtered_imp.map(function(o) { return rgb + Math.min(o.i / .3 + .4, 1) + ')'; });
            return [importances, fades, imp];
        }
    }
})

app.controller('VariableImportanceController', function($scope, VariablesImportanceService, $filter, ExportUtils) {
    var arr = VariablesImportanceService.build($scope.modelData.iperf.rawImportance, $scope.colors);
    $scope.importances = arr[0];
    $scope.fades = arr[1];
    $scope.unfilteredImportances = arr[2];

    $scope.exportImportance = function(){
        var f = $filter("mlFeature");
        var data = $scope.unfilteredImportances.map(function(x){
            return [x.r, x.v, x.i];
        });
        ExportUtils.exportUIData($scope, {
            name : "Variables importance for model:" + $scope.modelData.userMeta.name,
            columns : [
                { name : "feature_name", type : "string"},
                { name : "feature_description", type : "string"},
                { name : "importance", type : "double"}
            ],
            data : data
        }, "Export variable importances");
    }
});

app.controller('_snippetMetricsCommon', function($scope, PartitionedModelsService) {
    /* Compute various stats with precise number of decimals for display in table */

    function getMetric(metricFieldName) {
        return $scope.display.metrics.find(m => metricFieldName === m.fieldName);
    }

    $scope.getAggregationExplanation = function(metric) {
        const metricName = metric.metricName || metric.fieldName.toUpperCase();
        const displayName = metric.shortName || metric.name || metric.fieldName;
        return PartitionedModelsService.getAggregationExplanation(metricName, displayName);
    }

    function getNumDecimalsFromMetric(numDecimalsOrMetric) {
        if (!numDecimalsOrMetric) { return 0; }

        if (typeof numDecimalsOrMetric === "number") {
            return numDecimalsOrMetric;
        }

        let metric = getMetric(numDecimalsOrMetric);
        let numDecimals = $scope.display.numDecimalsMetrics[metric.fieldName];

        if (metric.minDecimals) {
            numDecimals = Math.max(metric.minDecimals, numDecimals);
        }
        if (metric.maxDecimals) {
            numDecimals = Math.min(metric.maxDecimals, numDecimals);
        }

        return numDecimals;
    }

    $scope.formatMetric = function(value, metricFieldName, forcedNumDecimals) {
        let metric = getMetric(metricFieldName);

        let numDecimals;
        if (forcedNumDecimals) {
            numDecimals = forcedNumDecimals;
        } else {
            numDecimals = getNumDecimalsFromMetric(metricFieldName);
        }

        if (angular.isUndefined(value) || (value === 0 && metric.ignoreZero)) {
            return '-';
        }

        let exp = value > 10000;
        if (exp) {
            numDecimals = 4;
        }

        if (metric.percentage) {
            return getDetailedPercent(value, numDecimals).toFixed(numDecimals) + " %";
        } else {
            return getDetailedValue(value, numDecimals)[exp ? 'toPrecision': 'toFixed'](numDecimals);
        }
    };

    function getDetailedValue(value, numDecimals) {
        return (Math.round(value * Math.pow(10, numDecimals)) / Math.pow(10, numDecimals));
    }

    function getDetailedPercent (p, numDecimals) {
        return getDetailedValue(p * 100, numDecimals);
    }

    function getDiffWithAllDataset(metric, numDecimals) {
        switch (metric) {
            case 'actual':
                return getDetailedPercent($scope.data.perf.singleMetrics.actPos["ratio"], numDecimals)
                    - getDetailedPercent($scope.allDatasetPerf.singleMetrics.actPos["ratio"], numDecimals);
            case 'predicted':
                return getDetailedPercent($scope.data.perf.singleMetrics.predPos["ratio"], numDecimals)
                    - getDetailedPercent($scope.allDatasetPerf.singleMetrics.predPos["ratio"], numDecimals);
            default:
                return 0;
        }
    }

    $scope.isAboveAllDataset = function(metric) {
        return getDiffWithAllDataset(metric, getNumDecimalsFromMetric(metric)) > 0;
    };

    $scope.isBelowAllDataset = function(metric) {
        return getDiffWithAllDataset(metric, getNumDecimalsFromMetric(metric)) < 0;
    };

    $scope.getAbsoluteDiffWithAllDataset = function(metric, numDecimalsOrMetric) {
        const numDecimals = getNumDecimalsFromMetric(numDecimalsOrMetric);
        return Math.abs(getDiffWithAllDataset(metric, numDecimals).toFixed(numDecimals)) + " %";
    };

});

app.directive("partitionSummaryValue", function() {
    return {
        restrict: 'E',
        templateUrl: "/templates/ml/prediction-model/partition_summary-value.html",
        scope: {
            allDatasetPerf: "=",
            data : "=",
            threshold: "=",
            colors: "=",
            display: "=",
            classes: "=",
            partitionStates: '='
        },
        controller: function($scope, $controller) {
            $controller("_snippetMetricsCommon", {$scope: $scope});

            // VISUAL HELPERS

            $scope.getLinearGradient = function(ratio) {
                return 'linear-gradient(to right, #c6e8d3 0%, #c6e8d3 '+ (ratio * 100) +'%,rgba(0, 0, 0, 0) '+ (ratio * 100) +'%, rgba(0, 0, 0, 0) 100%)';
            };

            // INIT

            $scope.uiState = {
                isExpanded: false
            }

            $scope.onClick = function(event) {
                if ($scope.data.excluded) return;

                // If click event originates from info icon, we do not want to expand/hide subpop table row content,  as
                // a popover is being shown/hidden.
                if (event.originalEvent.composedPath().some(_ => _.className === "icon-info-sign")) return;
                $scope.uiState.isExpanded = !$scope.uiState.isExpanded;
            }

        }
    }
});


app.controller('VariableCoefficientController', function($scope, $filter, ListFilter, Debounce, ExportUtils, getNameValueFromMLFeatureFilter) {
    $scope.uiState = {
        advanced: false
    }
    var coefs = $scope.modelData.iperf.lmCoefficients.variables.map(function(v, i) {
            var splitedFeature = getNameValueFromMLFeatureFilter(v),
                o = {
                        full: v,
                        name: splitedFeature.name,
                        value: splitedFeature.value,
                        coef: this.coefs[i],
                        coefRescaled: this.rescaledCoefs ? this.rescaledCoefs[i] : undefined,
                        abs: Math.abs(this.coefs[i]),
                        rescaledAbs:  this.rescaledCoefs ? Math.abs(this.rescaledCoefs[i]) : undefined
                   };
            if (this.tstat)  { o.tstat = this.tstat[i]; }
            if (this.pvalue) { o.pvalue = this.pvalue[i]; }
            if (this.stderr) { o.stderr = this.stderr[i]; }
            if (this.rescaledStderr) { o.rescaledStderr = this.rescaledStderr[i]; }
            return o;
        }, $scope.modelData.iperf.lmCoefficients),
        maxCoef = Math.max.apply(Math, $scope.modelData.iperf.lmCoefficients.coefs.map(Math.abs)),
        maxRescaledCoef = $scope.modelData.iperf.lmCoefficients.rescaledCoefs ?
            Math.max.apply(Math, $scope.modelData.iperf.lmCoefficients.rescaledCoefs.map(Math.abs)) : undefined,
        filteredCoefs = coefs;

    function getVars() {
        filteredCoefs = !$scope.coefFilter ? coefs : ListFilter.filter(coefs, $scope.coefFilter);
        sortVars();
    }
    function sortVars() {
        var sort = ['+name', '+value'];
        var by = $scope.sort.by;
        if(!$scope.displayOptions.showRawCoefs){
            if(by == "abs"){
                by = "rescaledAbs";
            } else if(by == "coef") {
                by = "coefRescaled";
            }
        }

        if ($scope.sort.by !== 'name') { sort.unshift('+' + by); }
        sort[0] = ($scope.sort.reverse ? '-' : '+') + sort[0].substring(1);
        console.debug(sort);
        $scope.pagination.list = $filter('orderBy')(filteredCoefs, sort);
        $scope.pagination.page = 1;
        getCoeffs();
    }
    function getCoeffs() {
        $scope.pagination.update();
        $scope.coefs = $scope.pagination.slice;
    }

    $scope.exportCoefficients = function(){
        let lmc = $scope.modelData.iperf.lmCoefficients;
        let f = $filter("mlFeature");
        let data;
        if ($scope.uiState.advanced) {
            data = $filter("orderBy")(coefs, "-abs").map(function (x) {
                return [x.full, f(x.full), $scope.displayOptions.showRawCoefs ? x.coef : x.coefRescaled,
                    x.stderr === 0 ? "" : x.stderr,
                    x.tstat === 0 ? "" : x.tstat,
                    x.pvalue === 0 ? "" : x.pvalue]
            });
            data.push(["Intercept", null,
                    $scope.displayOptions.showRawCoefs  ? lmc.interceptCoef : lmc.rescaledInterceptCoef,
                    lmc.interceptStderr === 0 ? "" : lmc.interceptStderr,
                    lmc.interceptTstat === 0 ? "" : lmc.interceptTstat,
                    lmc.interceptPvalue === 0 ? "" : lmc.interceptPvalue
                    ]);

        } else {
            data = $filter("orderBy")(coefs, "-abs").map(function (x) {
                return [x.full, f(x.full), $scope.displayOptions.showRawCoefs ? x.coef : x.coefRescaled]
            });
            data.push(["Intercept", null,
                    $scope.displayOptions.showRawCoefs  ? lmc.interceptCoef : lmc.rescaledInterceptCoef]
                    );
        }

        let columns = [
                { name : "feature_name", type : "string"},
                { name : "feature_description", type : "string"},
                { name : "coefficient", type : "double"}
        ];
        if ($scope.uiState.advanced) {
            columns.push({ name : "stderr", type : "double"});
            columns.push({ name : "tstat", type : "double"});
            columns.push({ name : "pvalue", type : "double"});
        }

        ExportUtils.exportUIData($scope, {
            columns : columns,
            data : data
        }, "Export coefficients");
    };

    $scope.sorts = { name: 'Name', coef: 'Coefficient', abs: '| Coefficient |' };
    if ($scope.modelData.iperf.lmCoefficients.pvalue) {
        $scope.sorts['pvalue'] = 'Trust';
    }
    $scope.sort = { by: 'abs', reverse: true };
    $scope.baseWidth = function(){
        return 50 / ($scope.displayOptions.showRawCoefs ? maxCoef : maxRescaledCoef);
    };
    $scope.displayPossibleSmall = function(value){
        if(value < 1e-4) {
            return "< 1e-4";
        } else {
            return value.toFixed(4);
        }
    };
    $scope.getCoef = function(c){
         return $scope.displayOptions.showRawCoefs ? c.coef : c.coefRescaled;
    };
    var lmc = $scope.modelData.iperf.lmCoefficients;
    $scope.getIntercept = function(){
        return $scope.displayOptions.showRawCoefs ? lmc.interceptCoef : lmc.rescaledInterceptCoef;
    };
    $scope.getInterceptStderr = function(){
        return $scope.displayOptions.showRawCoefs ? lmc.interceptStderr : lmc.rescaledInterceptStderr;
    };
    $scope.getInterceptTstat = function(){
        return $scope.displayOptions.showRawCoefs ? lmc.interceptTstat : lmc.rescaledInterceptTstat;
    };
    $scope.getInterceptPvalue = function(){
        return $scope.displayOptions.showRawCoefs ? lmc.interceptPvalue : lmc.rescaledInterceptPvalue;
    };
    $scope.getStderr = function(c){
        return $scope.displayOptions.showRawCoefs ? c.stderr : c.rescaledStderr;
    };
    $scope.getAbs = function(c){
        return $scope.displayOptions.showRawCoefs ? c.abs : c.rescaledAbs;
    };
    $scope.coefFilter = '';
    $scope.displayOptions = {
        showRawCoefs: !$scope.modelData.iperf.lmCoefficients.rescaledCoefs
    }

    $scope.pagination = new ListFilter.Pagination([], 50);
    $scope.$watch('coefFilter', Debounce().withScope($scope).withDelay(75,150).wrap(getVars), true);
    $scope.$watch('sort', sortVars, true);
    $scope.$watch('displayOptions', sortVars, true);
    $scope.$watch('pagination.page', getCoeffs);
    getVars();
    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
    $scope.puppeteerHook_elementContentLoaded = true;
});

app.controller('MultiClassConfusionMatrixController', function($scope, Fn, $filter, Assert) {
    Assert.trueish($scope.modelData.perf, 'no modelData.perf');
    Assert.trueish($scope.modelData.perf.confusion, 'no confusion matrix data');
    var perActual = $scope.modelData.perf.confusion.perActual;
    $scope.total = $scope.modelData.perf.confusion.totalRows;
    if ($scope.modelData.classes && $scope.modelData.classes.length) {
        $scope.cs = $scope.modelData.classes;
    } else {
        $scope.cs = $scope.modelData.perf.classes;
    }
    $scope.n = $scope.cs.length;
    $scope.displayMode = 'actual';

    var predictedClassCount = $scope.cs.map(Fn.cst(0)),
        all100 = $scope.cs.map(Fn.cst('100\u00a0%')),
        smartPC = $filter('smartPercentage'),
        data = {};
    data.records = $scope.cs.map(function(ca, i) { return $scope.cs.map(function(cp, j) {
            if (!perActual[ca] || !perActual[ca].perPredicted[cp]) return 0;
            predictedClassCount[j] += perActual[ca].perPredicted[cp];
            return perActual[ca].perPredicted[cp];
        }); });
    data.actual = data.records.map(function(cps, i) {
        if (!perActual[$scope.cs[i]]) return cps.map(_ => '-');
        return cps.map(function(cp) {
            return this > 0 ? smartPC(cp / this, 0, true) : '-';
        }, perActual[$scope.cs[i]].actualClassCount);
    });
    data.predicted = data.records.map(function(cps) { return cps.map(function(cp, j) {
            return predictedClassCount[j] > 0 ? smartPC(cp / predictedClassCount[j], 0, true) : '-';
        });
    });

    //if the  number of classes is large, don't display the table to avoid crashing the browser
    $scope.tableHidden = data.records.length > 50;
    $scope.showTable = function(){
        $scope.tableHidden = false;
    };
    $scope.data = data;
    $scope.sumActual = {
        records: $scope.cs.map(Fn.dict(perActual,{})).map(Fn.prop('actualClassCount')).map(x=> isNaN(x) ? 0 : x),
        actual: all100
    };
    $scope.sumPredicted = {
        records: predictedClassCount,
        predicted: all100
    };
    $scope.total = $scope.sumActual.records.reduce(function(x, y) {return Number(x)+Number(y);}, 0)

    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
    $scope.puppeteerHook_elementContentLoaded = true;
});


app.controller('ROCCurveController', function($scope, ExportUtils) {
    $scope.setLabels = function () {
        if ($scope.areMetricsWeighted()) {
            $scope.data.xlabel = 'Weighted False Positive Rate';
            $scope.data.ylabel = 'Weighted True Positive Rate';
        } else {
            $scope.data.xlabel = 'False Positive Rate';
            $scope.data.ylabel = 'True Positive Rate';
        }

    }

    var perf = $scope.modelData.perf;
    if ($scope.isMulticlass()) {
        $scope.setRocClass = function(nv) {
            $scope.data = [perf.oneVsAllRocCurves[nv]];
            $scope.rocAuc = perf.oneVsAllRocAUC[nv];
            $scope.setLabels()
        };
        $scope.rocClass = $scope.modelData.classes[0];
        $scope.setRocClass($scope.rocClass);
        $scope.auc = perf.metrics.mrocAUC;
        $scope.aucstd = perf.metrics.mrocAUCstd;
    } else {
        $scope.data = perf.rocVizData;
        $scope.auc = perf.tiMetrics.auc;
        $scope.aucstd = perf.tiMetrics.aucstd;
        $scope.setLabels();
    }

    $scope.exportROCData = function(){
        var data = $scope.data[0].map(function(x){
            return [ x.x, x.y, x.p > 1 ? 1 : x.p ]
        })
        ExportUtils.exportUIData($scope, {
            name : "ROC data for model: " + $scope.modelData.userMeta.name,
            columns : [
                { name : "False positive rate", type : "double"},
                { name : "True positive rate", type : "double"},
                { name : "Proba threshold", type : "double"}
            ],
            data : data
        }, "Export ROC curve");
    }
});

app.controller('CalibrationCurveController', function($scope, ExportUtils) {
    $scope.setLabels = function() {
        if ($scope.areMetricsWeighted()) {
            $scope.data.xlabel = 'Weighted Average of Predicted Probability for Positive Class';
            $scope.data.ylabel = 'Weighted Frequency of Positive Class';
        } else {
            $scope.data.xlabel = 'Average of Predicted Probability for Positive Class';
            $scope.data.ylabel = 'Frequency of Positive Class';
        }
    }

    var perf = $scope.modelData.perf;
    if ($scope.isMulticlass()) {
        $scope.setCalibrationClass = function(nv) {
            $scope.data = [perf.oneVsAllCalibrationCurves[nv]];
            $scope.calibrationLoss = perf.oneVsAllCalibrationLoss[nv];
            $scope.setLabels();
        };
        $scope.calibrationClass = $scope.modelData.classes[0];
        $scope.setCalibrationClass($scope.calibrationClass);
        $scope.mCalibrationLoss = perf.metrics.mCalibrationLoss;
        $scope.mCalibrationLossStd = perf.metrics.mCalibrationLossstd;
    } else {
        $scope.data = [perf.calibrationData];
        $scope.calibrationLoss = perf.tiMetrics.calibrationLoss;
        $scope.setLabels();
    }
    var calibrationMethod = $scope.modelData.coreParams.calibration.calibrationMethod;
    if (calibrationMethod==="ISOTONIC") {
        $scope.uiState.calibrationMethod = "Isotonic Regression";
    } else if (calibrationMethod==="SIGMOID") {
        $scope.uiState.calibrationMethod = "Sigmoid (Platt scaling)";
    } else {
      $scope.uiState.calibrationMethod = "No calibration";
    }

    $scope.exportCalibrationData = function(){
        const data = $scope.data[0].filter(_ => _.n > 0).map(_ => [_.x, _.y, _.n]);
        ExportUtils.exportUIData($scope, {
            name : "Calibration data for model: " + $scope.modelData.userMeta.name,
            columns : [
                { name : "Average of Predicted Probability for Positive Class", type : "double"},
                { name : "Frequency of Positive Class", type : "double"},
                { name : "Count of Records", type : "double"}
            ],
            data : data
        }, "Export Calibration Curve");
    }

    $scope.hasCalibrationData = function(){
        return (typeof($scope.modelData.perf.calibrationData) !== "undefined") ||
               (typeof($scope.modelData.perf.oneVsAllCalibrationCurves) !== "undefined");
    }
});

app.controller('ErrorDistributionController', function($scope) {
    var rp = $scope.modelData.perf.regression_performance,
        fmt = d3.format('.3s');
    angular.forEach(rp, function(v, k) {    // *_error metrics into scope
        if (k.substr(-6) === '_error' && typeof v === 'number') {
            $scope[k.substr(0, k.length - 6)] = v.toPrecision(5);
        } });
    $scope.hasRawMinMax = function() {
        return $scope.modelData.perf.regression_performance.raw_min_error !== Number.MIN_VALUE &&
               $scope.modelData.perf.regression_performance.raw_max_error !== Number.MAX_VALUE;
    };
    $scope.bars = rp.error_distribution.map(function(p) {
        return { min: p.bin_min, max: p.bin_max, count: p.count }; });
});


app.controller("StdModelReportFeaturesHandlingController", function($scope, ListFilter){
    $scope.filter = {
        query : "",
        pagination : new ListFilter.Pagination([], 40)
    }

    $scope.uiState = {
        showAllPreprocessedFeatures:false
    }

    $scope.getLimitedZippedImpact = function(feature) {
        var impact = zip($scope.modelData.preprocessingReport.impact[feature]['values'],
                         $scope.modelData.preprocessingReport.impact[feature]['impacts']);
        impact.sort(function(a, b) { return Math.abs(b[1]) - Math.abs(a[1])})
        return impact.slice(0, 20);
    }

    $scope.updateList = function(){
        $scope.filteredList = ListFilter.filter($scope.features, $scope.filter.query);
        $scope.currentPageItems = $scope.filter.pagination.updateAndGetSlice($scope.filteredList);
    }
    $scope.$watch("filter", $scope.updateList, true);

    $scope.$watch("modelData", function(nv, ov) {
        if (nv) {
            $scope.features = [];
            $.each($scope.modelData.preprocessing.per_feature, function(k, v){
                v.name = k;

                v.hasReport =
                    (v.type == "CATEGORY" && v.role != "REJECT" && v.category_handling == "IMPACT") ||
                    (v.type == "TEXT" && v.role != "REJECT" && v.text_handling == "TOKENIZE_COUNTS")||
                    (v.type == "TEXT" && v.role != "REJECT" && v.text_handling == "TOKENIZE_TFIDF");

                $scope.features.push(v);
            });
            $scope.updateList();
        }
    });
});


app.controller("GridSearchReportController", function($scope, $filter, PMLSettings, ExportUtils, MLChartsCommon, NumberFormatter, Fn){
    $scope.fieldList = [
        {field:'score', name:'Score', metric: true},
        {field:'scoreStd', name:'Score StdDev', metric: true},
        {field:'fitTime', name:'Fit Time', metric: true},
        {field:'fitTimeStd', name:'Fit Time StdDev', metric: true},
        {field:'scoreTime', name:'Score Time', metric: true},
        {field:'scoreTimeStd', name:'Score Time StdDev', metric:true}
    ];

    $scope.uiState = {
        showConstantColumns: false,
        chartColumn: null,
        chartLogScale: null, // null = N/A (non-numeric dimension)
        showFitTime: false,
        view: '1D' // Initialize the tab view to 1D plots
    };

    $scope.selectView = function(view) {
        $scope.uiState.view = view;
    }

    $scope.$watch('modelData.iperf.gridCells', gridCells => {
        if (!gridCells) return;
        $scope.gridCells = gridCells;
        if (['SVC_CLASSIFICATION', 'SVM_REGRESSION'].includes($scope.modelData.modeling.algorithm)) {
            $scope.gridCells.forEach(function(cell){
                let gamma_value = cell.params.gamma;
                if (typeof gamma_value !== 'undefined' && !['auto', 'scale'].includes(gamma_value)){
                    cell.params['custom_gamma'] = gamma_value;
                    cell.params['gamma'] = 'custom';
                }
            })
        }
        $scope.paramColumns = gridCells.map(_ => Object.keys(_.params))   // [['a', 'b'], ['a', 'c']]
            .reduce((a, b) => a.concat(b.filter(_ => a.indexOf(_) < 0)), []);   // ['a', 'b', 'c']
        $scope.gridData = gridCells.map(cell =>
            $scope.paramColumns.map(_ => cell.params[_]).concat($scope.fieldList.map(_ => cell[_.field]))
                               .map(_ => (_ === null || _ === undefined) ? "" : _)
        );
        $scope.pairwiseDependencies = computeHyperparametersPairwiseDependencies();

        // compute data when hiding columns that don't change
        const columnChanges = $scope.paramColumns.map( (col, i) =>
            $scope.gridData.map(_ => _[i])  // values of that column
                .some((cell, j, values) => j > 0 && cell != values[j-1]) // at least 1 differs from the previous
        );
        $scope.changingParamColumns = $scope.paramColumns.filter((col, i) => columnChanges[i]);
        $scope.changingGridData = $scope.gridData.map((row, j) =>
            row.filter((col, i) => i >= $scope.paramColumns.length || columnChanges[i]));
        if ($scope.changingParamColumns.indexOf($scope.uiState.chartColumn) < 0) {
            $scope.uiState.chartColumn = $scope.changingParamColumns[0];
        }

        const metric = $scope.$eval('modelData.modeling.metrics.evaluationMetric');
        const customEvaluationMetricGIB = $scope.$eval('modelData.modeling.metrics.customEvaluationMetricGIB');
        if (metric) {
            $scope.scoreMetric = ' (' + (PMLSettings.names.evaluationMetrics[metric] || metric) + ')';
        } else {
            $scope.scoreMetric = '';
        }
        $scope.currentMetric = metric;
        $scope.customEvaluationMetricGIB = customEvaluationMetricGIB;
    });

    $scope.$watch('uiState.showConstantColumns', showConstantColumns => {
        let tableData;
        let tableColumns;
        if (showConstantColumns) {
            tableColumns = $scope.paramColumns;
            tableData = $scope.gridData;
        } else {
            tableColumns = $scope.changingParamColumns;
            tableData = $scope.changingGridData;
        }

        // Generate the grid data as a list of objects (field name, value) so that it can be interactively ordered by users
        $scope.displayColumns = tableColumns.map(col => ({field: col, name: col, metric:false})).concat($scope.fieldList);
        $scope.displayData = tableData.map(row => {
            return $scope.displayColumns.reduce((result, item, index) => {
                result[item.field] = row[index];
                return result;
            }, {});
        });
    });

    // Simple formatter for train time on tick grid
    function formatTimeShort(maxValue, seconds) {
        let components = [];
        if (maxValue >= 86400) {
            components = [
                {v: Math.floor(seconds / 86400), t: 'd'}, //
                {v: Math.round((seconds % 86400) / 3600), t: 'h' }];
        } else if (maxValue >= 3600) {
            components = [
                {v: Math.floor(seconds / 3600), t: 'h'},
                {v: Math.round((seconds % 3600) / 60), t: 'm'}];
        } else if (maxValue >= 60) {
            components = [
                {v: Math.floor(seconds / 60), t: 'm'},
                {v: Math.round(seconds % 60), t: 's'}];
        } else if (maxValue >= 10) {
            components = [{v: Math.round(seconds), t: 's'}];
        } else if (maxValue >= 1) {
            components = [{v: seconds.toFixed(1), t: 's'}];
        } else if (maxValue >= 0.1) {
            components = [{v: seconds.toFixed(2), t: 's'}];
        } else {
            components = [{v: seconds.toFixed(3), t: 's'}];
        }
        if (seconds === 0) {
            // Special case for 0: print it using the smallest component type.
            return "0" + components[components.length - 1].t;
        } else {
            let result = "";
            components.forEach(function (item) {
                if (item.v > 0) {
                    if (result.length > 0) {
                        result += " ";
                    }
                    result += item.v + item.t;
                }
            });
            return result;
        }
    }
    // Simple formatter for train time in tooltip
    function formatTimeFull(seconds) {
        let str = '';
        if (seconds >= 86400) {
            str += Math.floor(seconds / 86400) + "d ";
            seconds = seconds % 86400;
        }
        if (seconds >= 3600) {
            str += Math.floor(seconds / 3600) + "h ";
            seconds = seconds % 3600;
        }
        if (seconds >= 60) {
            str += Math.floor(seconds / 60) + "m ";
            seconds = seconds % 60;
        }
        return str + seconds.toFixed(3) + 's';
    }

    $scope.$watch('uiState.chartColumn', column => {
        const colIdx = $scope.paramColumns.indexOf(column);
        if (colIdx < 0) return;

        const scoreIdx = $scope.paramColumns.length;
        const fitTimeIdx = scoreIdx + 2;
        const colors = $scope.colors.slice(0, 3); // We need 3 colors: Score, Fit time & Best score marker
        const naturalSort = (a, b) => (a == b ? 0 : (a < b ? -1 : 1));

        let x       = $scope.gridData.map(_ => _[colIdx]);      // [1,  2,  1,  2]
        let score   = $scope.gridData.map(_ => _[scoreIdx]);    // [.7, .6, .9, .8]
        let fitTime = $scope.gridData.map(_ => _[fitTimeIdx]);  // [10, 15, 20, 25]

        // Group by X (avg, min, max)
        function groupByX(series, x) {
            const values = {};
            const min = {};
            const max = {};
            for (let i in x) {
                const curX = x[i];
                if (! (curX in values)) {
                    values[curX] = [];
                }
                values[curX].push(series[i]);
            }
            for (let curX in values) {
                min[curX] = Math.min(...values[curX]);
                max[curX] = Math.max(...values[curX]);
                values[curX] = values[curX].reduce((a, b) => a + b, 0) / values[curX].length;
            }
            return { avg: values, min, max };
        }
        score   = groupByX(score, x);   // score.avg:   {1: .8, 2: .7}
        fitTime = groupByX(fitTime, x); // fitTime.avg: {1: 15, 2: 20}

        // Build series for plotting
        // Ignore values with empty (curX === "") X value (the parameter is not used/defined at point)
        x = x.sort(naturalSort).filter((curX, i, x) => curX !== "" && (i == 0 || curX != x[i-1])); // [1,  2]
        for (let k of ['avg', 'min', 'max']) {
            score[k]   = x.map(curX => score[k][curX]);    // [.8, .7]
            fitTime[k] = x.map(curX => fitTime[k][curX]);  // [15, 20]
        }
        const minScore = Math.min(...score.min);
        const maxScore = Math.max(...score.max);
        const minAvgScore = Math.min(...score.avg);
        const maxAvgScore = Math.max(...score.avg);
        const maxFitTime = Math.max(...fitTime.max);
        const lib = PMLSettings.sort.lowerIsBetter($scope.currentMetric, $scope.customEvaluationMetricGIB) ? -1 : 1;
        const indexOfBestScore = lib > 0 ? score.avg.indexOf(maxAvgScore) : score.avg.indexOf(minAvgScore);

        /* If the scores are between 0 and 1 and the difference is big, force the scale to [0, 1].
         * Else, use a scale that goes just a bit beyond the boundaries so that the data does not
         * align to the angles of the chart (because it looks a bit ugly)
         */
        const scale = (function() {
            if (minScore >= 0 && maxScore <= 1) {
                if (maxAvgScore - minAvgScore >= 0.2) {
                    return [0, 1];
                } else {
                    const factor = Math.abs(maxScore - minScore) * 0.1;
                    const furtherMax = maxScore > 0 ? (maxScore + factor) : (maxScore - factor);
                    const furtherMin = minScore > 0 ? (minScore - factor) : (minScore + factor);
                    return [Math.max(0, furtherMin), Math.min(1, furtherMax)]
                }
            } else {
                const furtherMax = maxScore > 0 ? maxScore * 1.05 : maxScore * 0.95;
                const furtherMin = minScore > 0 ? minScore * 0.95 : minScore * 1.05;
                return [furtherMin, furtherMax];
            }
        })();
        const scale2 = [0, maxFitTime];

        // Prepare the formats
        const xAreNumbers = x.every(_ => typeof _ === "number");
        const format = [
            "",                                               // x (overwritten in updateChartXScale function)
            minScore > -10 && maxScore < 10 ? '.4g' : '.4s',  // y1
            formatTimeShort.bind(null, maxFitTime),           // y2 (axis)
            formatTimeFull                                    // y2 (tooltip)
        ];

        // svg callbacks: 1. draw area for min/max
        const svgAreaCallback = MLChartsCommon.makeSvgAreaCallback(scope =>
            [{
                color: colors[0],
                values: $scope.chart.x.map((curX, i) => ({x: curX, y0: score.min[i], y1: score.max[i]}))
            }, {
                color: colors[1],
                yScale: scope.ys2.scale.copy().range(scope.chart.yScale().range()),
                values: $scope.chart.x.map((curX, i) => ({x: curX, y0: fitTime.min[i], y1: fitTime.max[i]}))
            }]
        );

        // and 2. color left axis with the color for score and overload the click on legend
        const svgCallback = (svg, scope) => {
            svg.selectAll(".nv-y.nv-axis text").style('fill', colors[0]);

            // Declare this method in $scope to get access to 'svg'.
            $scope.showHideFitTime = function () {
                // Show/hide the curve
                let displayValue = $scope.uiState.showFitTime ? "": "none";
                svg.selectAll("g.nv-lineChart g.nv-line g.nv-series-1").style('display', displayValue);

                // Show/hide the area (if present)
                let area = svg.select('.tubes').selectAll('path');
                if (area && area.length > 0) {
                    area[0][1].style.opacity = $scope.uiState.showFitTime ? '.3' : '0';
                }

                // Show/hide the secondary axis
                svg.select("g.nv-lineChart g.secondary-axis").style('display', displayValue);

                // Show/hide the legend
                svg.selectAll("g.nv-legendWrap g.nv-series:nth-child(2)").classed("nv-disabled", !$scope.uiState.showFitTime);
            };
            $scope.showHideFitTime(); // Call this method once to initially hide the "fit time" series.

            // Manually handle the click on legend
            scope.chart.legend.updateState(false);
            scope.chart.legend.dispatch.on('legendClick.overload', function (d, index) {
                if (index === 1) { // We only care about showing/hiding the "fit time" series (located at index 1).
                    $scope.$apply(function() {
                        $scope.uiState.showFitTime = !$scope.uiState.showFitTime;
                    });
                }
            });

            // Add tick vertical line to highlight the best score
            if (indexOfBestScore >= 0) {
                const xMarkStrokeWidth = 2;
                let xBestScore = x[indexOfBestScore];
                if (!xAreNumbers) {
                    // For ordinal values, use corresponding index
                    xBestScore = x.indexOf(xBestScore);
                }
                let xTranslate = scope.chart.xScale()(xBestScore);
                // In case the best score is the the first one on the X axis, slightly shift the line so that it
                // does not overlap with the left y-axis.
                if (indexOfBestScore === 0) {
                    xTranslate += xMarkStrokeWidth;
                }
                let xMarkG = svg.select(".nv-lineChart").append("g").attr("class", "x mark")
                    .attr("transform", "translate(" + xTranslate + ", 0)");
                xMarkG.append("path").attr('d', "M0,0 V" + scope.axisHeight)
                    .attr('stroke-width', xMarkStrokeWidth).attr('stroke', colors[2]).attr('stroke-dasharray', '5,3');
            }

            // Format tooltip x values
            if ($scope.uiState.chartLogScale === null) {
                // Use same formatter as x axis for categories
                scope.chart.interactiveLayer.tooltip.headerFormatter($scope.chart.format[0]);
            } else {
                // Use simple formatter for numbers
                scope.chart.interactiveLayer.tooltip.headerFormatter($scope.chart.xNumericFormat);
            }

            svgAreaCallback(svg, scope);

            // Fix tooltips persisting when changing column (https://github.com/krispo/angular-nvd3/issues/530#issuecomment-246745836)
            d3.selectAll('.nvtooltip').remove();
        };
        $scope.chart = {
            format, x, colors, scale, scale2, svgCallback,
            xLabels: x, score: score.avg, fitTime: fitTime.avg
        };

        // ~Smart default for log scale
        if (!xAreNumbers) {
            $scope.uiState.chartLogScale = null;
        } else {
            const min = Math.min(...x);
            const max = Math.max(...x);
            if (min == 0) {
                $scope.uiState.chartLogScale = max > 10;
            } else if (max == 0) {
                $scope.uiState.chartLogScale = min < -10;
            } else {
                $scope.uiState.chartLogScale = Math.abs(max / min) > 10;
            }

            // Determine numeric formatter as a function of min and max values of x
            if ( min <= 0.01 || max >= 100 ) {
                $scope.chart.xNumericFormat = _ => MLChartsCommon.trimTrailingZeros(d3.format(".3e")(_));
            } else {
                $scope.chart.xNumericFormat = _ => MLChartsCommon.trimTrailingZeros(d3.format(".4g")(_));
            }
        }
        updateChartXScale($scope.uiState.chartLogScale);
    });

    $scope.$watch('uiState.showFitTime', function () {
        if ($scope.showHideFitTime) {
            $scope.showHideFitTime();
        }
    });

    function updateChartXScale(chartLogScale) {
        let x = $scope.chart.x;
        if (chartLogScale === null) {
            // cheat for ordinal values using a linear scale & a custom formatter
            $scope.chart.xScale = d3.scale.linear().domain([-0.1, x.length - 0.9]);
            $scope.chart.x = x.map((_, i) => i);
            $scope.chart.xTicks = $scope.chart.x;  // fixed ticks for ordinals
            $scope.chart.format[0] = function(xValue) {  // check multiLineChart directive for format array meaning
                // format x axis values: empty strings for values that are not in categories, label string otherwise
                if (xValue < 0 || xValue > x.length - 1) {
                    return "";
                } else {
                    return $scope.chart.xLabels[xValue]
                }
            };
        } else {
            if (chartLogScale) {
                $scope.chart.xScale = d3.scale.log();
                if (x[0] <= 0) {
                    // protect against <= 0
                    x = x.slice();
                    x[0] = 1e-23;
                    $scope.chart.xScale.clamp(true);
                }
                $scope.chart.xTicks = false; // default ticks for log scale
                // Format x values for log scale
                $scope.chart.format[0] = function(xValue) {
                    if (xValue === x[0] || xValue === x[x.length - 1]){
                        // print exact value for x axis limits
                        return $scope.chart.xNumericFormat(xValue);
                    } else {
                        // print the ticks
                        if (!["1", "2", "4"].includes(d3.format(".0e")(xValue)[0])){
                            // only print ticks 1, 2, and 4
                            return "";
                        }
                        return $scope.chart.xNumericFormat(xValue);
                    }
                }
            } else {
                $scope.chart.xTicks = false; // default ticks for linear scale
                $scope.chart.xScale = d3.scale.linear();
                $scope.chart.format[0] = $scope.chart.xNumericFormat; // simple formatting for linear scale
            }
            $scope.chart.xScale.domain([x[0], x[x.length - 1]]);
        }
    }
    $scope.$watch('uiState.chartLogScale', updateChartXScale);

    $scope.exportGridSearchData = function(){
        if (!$scope.gridCells) return;
        ExportUtils.exportUIData($scope, {
            name : "Hyperparameter search data for model: " + $scope.modelData.userMeta.name,
            columns : $scope.paramColumns.map(_ => ({name: _, type: 'string'}))
                    .concat($scope.fieldList.map(_ => ({name: _.name, type: 'double'}))),
            data : $scope.gridData
        }, "Export hyperparameter search data");
    };

    $scope.isXGBoost = function() {
        return $scope.mlTasksContext.model.modeling.algorithm.startsWith('XGBOOST');
    };

    function computeHyperparametersPairwiseDependencies() {
        const scoreIdx = $scope.paramColumns.length;

        // Compute indices of all combinations of hyperparams
        const pairsIndices = [].concat(
            ...$scope.paramColumns.map((_, idx) =>
                $scope.paramColumns.slice(idx + 1).map((_, idx2) => [idx, idx + 1 + idx2])
            )
        );

        // Fill pairwise dependencies data with gridData
        let dependencies = Array.from(pairsIndices, function (pairIndices) {
            const [param1Idx, param2Idx] = pairIndices;

            // Accumulate scores by unique (x, y) values
            const scoresByXY = $scope.gridData.reduce(function (acc, data) {
                const [x, y, score] = [data[param1Idx], data[param2Idx], data[scoreIdx]];
                // Ignore undefined values
                if (x !== '' && y !== '') {
                    // Convert (x, y) pair to string for indexing
                    let xyKey = JSON.stringify([x, y]);
                    if (!(xyKey in acc)) {
                        acc[xyKey] = [];
                    }
                    acc[xyKey].push(score);
                }
                return acc;
            }, {});

            // Average scores by unique (x, y) value
            for (let xyPair in scoresByXY) {
                scoresByXY[xyPair] = scoresByXY[xyPair].reduce((a, b) => a + b, 0) / scoresByXY[xyPair].length;
            }

            // Create separate x, y, score arrays
            const x = Object.keys(scoresByXY).map((_) => JSON.parse(_)[0]);
            const y = Object.keys(scoresByXY).map((_) => JSON.parse(_)[1]);
            const score = Object.values(scoresByXY);

            // Ignore dependencies where one of the parameters has only one value
            // (equivalent to 1D plot)
            const xUnique = new Set(x);
            const yUnique = new Set(y);
            if (xUnique.size === 1 || yUnique.size === 1) {
                return {};
            }

            return {
                xLabel: $scope.paramColumns[param1Idx],
                yLabel: $scope.paramColumns[param2Idx],
                x: x,
                xCategorical: !x.every((_) => typeof _ === 'number'),
                y: y,
                yCategorical: !y.every((_) => typeof _ === 'number'),
                score: score,
            };
        });

        // Clean empty dependencies
        dependencies = dependencies.filter((dependency) => !angular.equals(dependency, {}));

        return dependencies;
    }
});

app.filter("modelImportantParamName", function(){
    var dict = {
        "depth" : "Depth",
        "min_samples" : "Min samples",
        "trees": "Trees",
        "penalty" : "Penalty",
        "max_depth" : "Max depth",
        "criterion": "Split criterion",
        "alpha": "Alpha",
        "lambda" : "Lambda",
        "epsilon" : "Epsilon",
        "gamma" : "Gamma",
        "C" : "C",
        "kernel" : "Kernel",
        "loss" : "Loss",
        "k" : "K",
        "distance_weighting" : "Distance weighting",
        "layer_sizes" : "Layer sizes",
        "max_iters" : "Max iterations",
        "hidden_layers" : "Hidden layers",
        "activation" : "Activation",
        "dropout":  "Dropout",
        "l1" : "L1",
        "l2" : "L2",
        "strategy" :"Strategy",
        "smoothing" : "Smoothing",
        "learning_rate": "Learning rate",
        "features": "Features",
        "solver":  "Solver",
        "epochs": "Epochs"

    }
    return function(input) {
        if (input && input in dict) return dict[input];
        return input;
    }
})


app.controller('HyperparametersPairwiseDependenciesController', ['$scope', 'MLChartsCommon', function ($scope, MLChartsCommon) {
    function groupByCategoryReducer(categories) {
        let groupByCategory = function (acc, value, index) {
            let category = categories[index];
            acc[category] = acc[category] || [];
            acc[category].push(value);
            return acc;
        };
        return groupByCategory;
    }

    function groupDependenciesByY(acc, dependency) {
        if (
            (acc.has(dependency.xLabel) && !(!dependency.xCategorical && dependency.yCategorical)) ||
            (dependency.xCategorical && !dependency.yCategorical)
        ) {
            // xLabel already present in acc and not only y is categorical,
            // or only x is categorical => We use y as x axis
            acc.set(dependency.xLabel, acc.get(dependency.xLabel) || []);
            acc.get(dependency.xLabel).push({
                x: dependency.y,
                xLabel: dependency.yLabel,
                xCategorical: dependency.yCategorical,
                y: dependency.x,
                yLabel: dependency.xLabel,
                yCategorical: dependency.xCategorical,
                score: dependency.score,
            });
        } else {
            // Otherwise we use x as x axis
            acc.set(dependency.yLabel, acc.get(dependency.yLabel) || []);
            acc.get(dependency.yLabel).push(dependency);
        }
        return acc;
    }

    function setXScaleMultiline(x) {
        let xScale, xNumericFormat, xScaleFormat, xTicks;

        const min = Math.min(...x);
        const max = Math.max(...x);

        xNumericFormat = MLChartsCommon.makeAxisNumericFormatter(min, max, 3, 1);

        const logScale = min > 0 && max / min > 10;
        if (logScale) {
            xScale = d3.scale.log().domain([min, max]);
            xTicks = [];
            if (max / min >= 1e5) {
                // If ratio is too high, only print major vertical lines
                for (let tickValue of xScale.ticks()) {
                    if (tickValue / 10 ** Math.floor(Math.log10(tickValue)) === 1) {
                        xTicks.push(tickValue);
                    }
                }
                // Show maximum ~4 major ticks
                xTicks = xTicks.filter((_, idx) => {
                    if (idx % Math.floor(xTicks.length / 4) === 0) return true;
                });
            } else {
                xTicks = false; // Default log ticks
            }
            xScaleFormat = function (xValue) {
                if (xValue === x[0] || xValue === x[x.length - 1]) {
                    // print exact value for x axis limits
                    return xNumericFormat(xValue);
                } else {
                    // print the ticks
                    if (d3.format('.0e')(xValue)[0] !== '1') {
                        // only print major ticks (does not hide the vertical line for minor ticks)
                        return '';
                    }
                    return xNumericFormat(xValue);
                }
            };
        } else {
            xTicks = false; // Default linear ticks
            xScale = d3.scale.linear().domain([min, max]);
            xScaleFormat = xNumericFormat;
        }

        return { xScale, xScaleFormat, xTicks };
    }

    $scope.$watch('pairwiseDependencies', (pairwiseDependencies) => {
        let dependenciesByY = pairwiseDependencies.reduce(groupDependenciesByY, new Map());
        let columnLabelCounts = {};
        let plotsDataByYDict = {};
        for (const [yLabel, dependencies] of dependenciesByY) {
            for (const dependency of dependencies) {
                let plotData = {};
                if (dependency.xCategorical && dependency.yCategorical) {
                    plotData.plotType = 'CATEGORIES-HEATMAP';
                    plotData.x = dependency.x;
                    plotData.y = dependency.y;
                    plotData.xLabel = dependency.xLabel;
                    plotData.yLabel = dependency.yLabel;
                    plotData.score = dependency.score;
                } else if (dependency.xCategorical || dependency.yCategorical) {
                    plotData.plotType = 'MULTILINE';
                    plotData.legend = [...new Set(dependency.y)];
                    plotData.legendLabel = dependency.yLabel;
                    plotData.colors = $scope.colors.slice(0, plotData.legend.length);

                    const { xScale, xScaleFormat, xTicks } = setXScaleMultiline(dependency.x);
                    plotData.xScale = xScale;
                    plotData.xTicks = xTicks;

                    const categories = dependency.y;
                    plotData.x = Object.values(dependency.x.reduce(groupByCategoryReducer(categories), {}));
                    plotData.xLabel = dependency.xLabel;
                    plotData.score = Object.values(dependency.score.reduce(groupByCategoryReducer(categories), {}));

                    // Sort by ascending order for x
                    plotData.x.forEach(function (_, idx) {
                        let combinedArray = [];
                        for (let j = 0; j < plotData.x[idx].length; j++) {
                            combinedArray.push({ x: plotData.x[idx][j], score: plotData.score[idx][j] });
                        }

                        combinedArray.sort(function (a, b) {
                            return a.x < b.x ? -1 : a.x == b.x ? 0 : 1;
                        });

                        for (let k = 0; k < combinedArray.length; k++) {
                            plotData.x[idx][k] = combinedArray[k].x;
                            plotData.score[idx][k] = combinedArray[k].score;
                        }
                    });

                    /* If the scores are between 0 and 1 and the difference is big, force the scale to [0, 1].
                     * Else, use a scale that goes just a bit beyond the boundaries so that the data does not
                     * align to the angles of the chart (because it looks a bit ugly)
                     */
                    let minScore = Math.min(...dependency.score);
                    let maxScore = Math.max(...dependency.score);
                    plotData.scale = (function () {
                        if (minScore >= 0 && maxScore <= 1) {
                            if (maxScore - minScore >= 0.2) {
                                return [0, 1];
                            } else {
                                const factor = Math.abs(maxScore - minScore) * 0.1;
                                const furtherMax = maxScore > 0 ? maxScore + factor : maxScore - factor;
                                const furtherMin = minScore > 0 ? minScore - factor : minScore + factor;
                                return [Math.max(0, furtherMin), Math.min(1, furtherMax)];
                            }
                        } else {
                            const furtherMax = maxScore > 0 ? maxScore * 1.05 : maxScore * 0.95;
                            const furtherMin = minScore > 0 ? minScore * 0.95 : minScore * 1.05;
                            return [furtherMin, furtherMax];
                        }
                    })();

                    let yScaleFormat = MLChartsCommon.makeAxisNumericFormatter(minScore, maxScore, 3, 1);

                    plotData.format = [xScaleFormat, yScaleFormat];

                    plotData.svgCallback = function (svg, scope) {
                        scope.chart.yAxis.axisLabelDistance(-15);
                        scope.chart.interpolate(gaussianSmooth);

                        let tooltipNumericFormat = MLChartsCommon.makeTooltipNumericFormatter(3, 4);
                        scope.chart.tooltip.contentGenerator(function (d) {
                            return `
                                <table class="mlchart-tooltip__table">
                                    <tr>
                                        <td class="mlchart-tooltip__label">Score ${$scope.scoreMetric}</td>
                                        <td class="mlchart-tooltip__value">${tooltipNumericFormat(
                                            d.series[0].value
                                        )}</td>
                                    </tr>
                                    <tr>
                                        <td class="mlchart-tooltip__label">${plotData.xLabel}</td>
                                        <td class="mlchart-tooltip__value">${tooltipNumericFormat(d.value)}</td>
                                    </tr>
                                    <tr>
                                        <td class="mlchart-tooltip__label">${plotData.legendLabel}</td>
                                        <td class="mlchart-tooltip__value">${d.series[0].key}</td>
                                    </tr>
                                </table>`;
                        });

                        // Redraw after axis modification
                        svg.datum(scope.theData).call(scope.chart);
                    };
                } else {
                    plotData.plotType = 'CONTOUR';
                    plotData.x = dependency.x;
                    plotData.y = dependency.y;
                    plotData.xLabel = dependency.xLabel;
                    plotData.yLabel = dependency.yLabel;
                    plotData.score = dependency.score;
                }
                columnLabelCounts[plotData.xLabel] = (columnLabelCounts[plotData.xLabel] || 0) + 1;
                plotsDataByYDict[yLabel] = plotsDataByYDict[yLabel] || [];
                plotsDataByYDict[yLabel].push(plotData);
            }
        }

        // We sort the columns and rows so that we are the closest possible to a triangular matrix:
        // - Rows sorted by descending length
        // - Columns sorted by descending number of rows where they are present
        // We also fill empty cells with 'EMPTY' plots not to break the tabular shape in case it is not
        // possible to obtain a triangular matrix
        $scope.orderedColumns = Object.keys(columnLabelCounts).sort(
            (a, b) => -columnLabelCounts[a] + columnLabelCounts[b]
        );
        $scope.plotsDataByY = Object.entries(plotsDataByYDict)
            .sort((a, b) => -a[1].length + b[1].length)
            .map(([yLabel, plotsData]) => {
                const newPlotsData = $scope.orderedColumns.map((xLabel) => {
                    let plotsWithXLabel = plotsData.filter((plotData) => {
                        return plotData.xLabel === xLabel;
                    });
                    return plotsWithXLabel.length ? plotsWithXLabel[0] : { plotType: 'EMPTY' };
                });
                return [yLabel, newPlotsData];
            });

        // Compute plot width so that they all approximately fit on a 1200px wide screen
        $scope.maxRowLength = Math.max(...$scope.plotsDataByY.map((_) => _[1].length));
        $scope.plotWidth = Math.max(
            Math.min(
                Math.floor(900 / $scope.maxRowLength), // Aim at a total width of ~900px
                350 // Maximum width is 350
            ),
            250 // Minimum width is 250
        );
    });

    // Gaussian kernel interpolation function for cat/num plots
    function gaussianSmooth(points) {
        let gaussian = function (a, b, bandwidth) {
            return Math.exp(-Math.pow(a - b, 2) / (2 * bandwidth * bandwidth));
        };

        if (points.length <= 2) {
            return points.join('L'); // Linear interpolation for <= 2 points
        }

        const x = points.map((_) => _[0]);
        const bandwidth = (Math.max(...x) - Math.min(...x)) / Math.min(points.length, 7);

        // The interpolated line is defined by 50 x values
        return MLChartsCommon.linspace(Math.min(...x), Math.max(...x), 50)
            .map(function (xValue) {
                var numerator = d3.sum(points, (point) => gaussian(point[0], xValue, bandwidth) * point[1]);
                var denominator = d3.sum(points, (point) => gaussian(point[0], xValue, bandwidth));
                return [xValue, numerator / denominator];
            })
            .join('L');
    }
}]);

})();
