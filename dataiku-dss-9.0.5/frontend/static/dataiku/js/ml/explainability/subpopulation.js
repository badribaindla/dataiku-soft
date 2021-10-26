(function(){
    'use strict';

    var app = angular.module('dataiku.ml.explainability');
        

    app.controller("_SubpopTableUtilsController", function($scope, $filter, Fn, $interpolate, epochShift) {

        $scope.colorsRep = $scope.colors.slice(0, 2).concat($scope.colors.slice(0, 2));

        function getPercentString(v) {
            if (v < 0.01) {
                return "< 1 %";
            } else if (v > 1) {
                return "100 %";
            } else {
                return Math.round(v * 100) + " %";
            }
        }

        // Actually save "percentage" and "title" to be able
        // to search them when filtering
        function formatModalitiesInformation(data) {
            if (data) {
                if (data.modalities) {
                    data.modalities.forEach(function(modality) {
                        modality.weightedPercentage = modality.weightedCount / data.weightedNbRecords;
                        modality.weightedPercentageStr = getPercentString(modality.weightedPercentage);
                        modality.title = getValueTitle(modality, data.computed_as_type, data.isDate);
                        modality.longTitle = getValueLongTitle(modality, data.computed_as_type, data.isDate);
                    })
                }
                if (data.allDatasetModality) {
                    data.allDatasetModality.title = "";
                    data.allDatasetModality.longTitle = "";
                    data.allDatasetModality.weightedPercentage = 1;
                    data.allDatasetModality.weightedPercentageStr = "100 %";
                }
            }
        }

        function convertPyTimestampToDateStr(dateFormat) {
            return (tmstp) => {
                return d3.time.format(dateFormat)(new Date( 1000 * (tmstp - epochShift)));
            }
        }

        function getValueTitle(modality, computedAsType, isDate) {
            if (modality.missing_values) {
                return "Missing values";
            }
            switch(computedAsType) {
                case "CATEGORY": {
                    return modality.value;
                }
                case "NUMERIC": {
                    let formatData = isDate ? convertPyTimestampToDateStr("%Y/%m/%d") : (value => " " + $filter("smartNumber")(value) + " ");
                    const gt = modality.gte !== undefined ? "[" + formatData(modality.gte) : "(" + formatData(modality.gt);
                    const lt = modality.lte !== undefined ? formatData(modality.lte) + "]" : formatData(modality.lt) + ")";
                    return gt + ", " + lt;
                }
            }
        }

        // Different behaviour than getValueTitle only for numericals:
        // - slightly different presentation with "min < featureName <= max" instead of "(min, max]"
        // - put the full number, not a smartNumber version of it
        function getValueLongTitle(modality, computedAsType, isDate) {

            let longTitle = modality.weightedPercentageStr;
            if ($scope.areMetricsWeighted()) {
                longTitle += " (weighted out of " + modality.count + " rows)";
            } else if (angular.isDefined(modality.count)) {
                longTitle += " (" + modality.count + " rows)";
            }

            longTitle += " — ";
            if (computedAsType === "NUMERIC" && !modality.missing_values) {
                let formatData = isDate ? convertPyTimestampToDateStr("%Y-%m-%d %H:%M:%S") : (value => value);
                const gt = modality.gte !== undefined ? formatData(modality.gte) + " <= " : formatData(modality.gt) + " < ";
                const lt = modality.lte !== undefined ? " <= " + formatData(modality.lte) : " < " + formatData(modality.lt);
                return longTitle + gt + $scope.modelData.selectedSubpopFeat + lt;
            } else {
                return longTitle + getValueTitle(modality, computedAsType);
            }
        }

        function formatMultiClassifPerfData(perfData, index) {
            // CONFUSION MATRIX AND METRICS
            if (!perfData) {
                return;
            }

            perfData.singleMetrics =  {
                index: index,
                hammingLoss: perfData.metrics.hammingLoss,
                Precision: perfData.metrics.precision,
                Recall: perfData.metrics.recall,
                "F1-Score": perfData.metrics.f1,
                Accuracy: perfData.metrics.accuracy,
                logLoss:perfData.metrics.logLoss,
                auc:perfData.metrics.mrocAUC,
            };

            // ADD CUSTOM SCORE IF ANY
            if ($scope.modelData.modeling && $scope.modelData.modeling.metrics.evaluationMetric === "CUSTOM") {
                if (perfData.metrics.customScore !== undefined ) {
                    perfData.singleMetrics["customScore"] = perfData.metrics.customScore;
                }
            }
        }

        function formatBinaryClassifPerfData(perfData, cut) {

            // CONFUSION MATRIX AND METRICS
            let pcd = perfData && perfData.perCutData;
            if (!pcd) {
                return;
            }
            let i = 0;
            let iMax = pcd.cut.length - 1;
            if (cut >= pcd.cut[iMax]) {
                i = iMax;
            } else {
                while (pcd.cut[i] < cut && i <= iMax) {
                    i++;
                }
            }
            let headTaskCMW = $scope.modelData.headTaskCMW;
            let tp = pcd.tp[i], tn = pcd.tn[i], fp = pcd.fp[i], fn = pcd.fn[i];
            let actPos = tp + fn;
            let actNeg = tn + fp;
            let predPos = tp + fp;
            let predNeg = tn + fn;
            let eps = 0.01;
            perfData.singleMetrics =  {
                index: i, cut: pcd.cut[i],
                tp: {records: tp, actual: getPercentString(tp / (actPos + eps)), predicted: getPercentString(tp / (predPos + eps)), actualNum: tp / (actPos + eps)},
                tn: {records: tn, actual: getPercentString(tn / (actNeg + eps)), predicted: getPercentString(tn / (predNeg + eps)), actualNum: tn / (actNeg + eps)},
                fp: {records: fp, actual: getPercentString(fp / (actNeg + eps)), predicted: getPercentString(fp / (predPos + eps)), actualNum: fp / (actNeg + eps)},
                fn: {records: fn, actual: getPercentString(fn / (actPos + eps)), predicted: getPercentString(fn / (predNeg + eps)), actualNum: fn / (actPos + eps)},
                actPos: {records: tp + fn, actual: "100 %", ratio: actPos / (actPos + actNeg)},
                actNeg: {records: tn + fp, actual: "100 %", ratio: actNeg / (actPos + actNeg)},
                predPos: {records: tp + fp, predicted: "100 %", ratio: predPos / (predPos + predNeg)},
                predNeg: {records: tn + fn, predicted: "100 %", ratio: predNeg / (predPos + predNeg)},
                mcc: pcd.mcc[i], hammingLoss: pcd.hammingLoss[i],
                Precision: pcd.precision[i], Recall: pcd.recall[i],
                "F1-Score": pcd.f1[i], Accuracy: pcd.accuracy[i],
                logLoss:perfData.tiMetrics.logLoss,
                auc:perfData.tiMetrics.auc,
                lift:perfData.tiMetrics.lift,
                cmg: (headTaskCMW.tnGain * tn + headTaskCMW.tpGain * tp + headTaskCMW.fpGain * fp + headTaskCMW.fnGain * fn) / (tn + tp + fn + fp)
            };

            // ADD CUSTOM SCORE IF ANY
            if ($scope.modelData.modeling && $scope.modelData.modeling.metrics.evaluationMetric === "CUSTOM") {
                if (pcd.customScore !== undefined && pcd.customScore.length > 0) {
                    perfData.singleMetrics["customScore"] = pcd.customScore[i];
                } else if (perfData.tiMetrics.customScore !== undefined) {
                    perfData.singleMetrics["customScore"] = perfData.tiMetrics.customScore;
                }
            }

            // DENSITY CHART
            let pdd = perfData.densityData;
            let c = $scope.modelData.classes[1];
            let dd = pdd[c];
            if (pdd && Object.keys(pdd).length) {
                pdd.x = dd.incorrect.map(function(_, i, a) { return i / a.length; });
                pdd.ys = [dd.incorrect, dd.correct];
                pdd.xm = [cut];
                pdd.labels = ['class ' + $scope.modelData.classes[0], 'class ' + $scope.modelData.classes[1]];
                pdd.colors = $scope.colors.slice(0, 2).concat("#9467bd");
            }
        }

        function formatRegressionPerfData(perfData) {
            // ERROR DISTRIB CHART
            if (perfData.regression_performance) {
                const ed = perfData.regression_performance.error_distribution;
                if (ed) {
                    perfData.errorDistribBars = ed.map((p) => ({ min: p.bin_min, max: p.bin_max, count: p.count}))
                }
            }


            // SCATTER PLOT
            // remove duplicates in the scatter plot data - prevent d3 voronoi issue https://github.com/d3/d3/issues/1908
            let spd = perfData.scatterPlotData;
            if (spd) {
                let hashTbl = new Set();
                for (var i=spd.x.length-1;i>=0;i--) {
                    const key = spd.x[i] + '#' + spd.y[i];
                    if (hashTbl.has(key)) {
                        spd.x.splice(i,1);
                        spd.y.splice(i,1);
                    } else {
                        hashTbl.add(key);
                    }
                }
                perfData.spd = spd;
            }
        }

        function formatPerfDataAllModalities(data, thresholdFn = Fn.cst($scope.modelData.userMeta.activeClassifierThreshold)) {

            let formatFunc;
            if ($scope.isBinaryClassification()) {
                formatFunc = (mod) => formatBinaryClassifPerfData(mod.perf, thresholdFn(mod));
            } else if ($scope.isRegression()) {
                formatFunc = (mod) => formatRegressionPerfData(mod.perf);
            } else if ($scope.isMulticlass()) {
                formatFunc = (mod) => formatMultiClassifPerfData(mod.perf, mod.index);
            }

            if (data) {
                if (data.modalities) {
                    data.modalities.forEach(modality => {
                        if (!modality.excluded && modality.perf) {
                            formatFunc(modality); // NOSONAR: formatFunc is defined we are always in one the 3 handled cases
                        }
                    });
                }
                if (data.allDatasetModality && data.allDatasetModality.perf) {
                    formatFunc(data.allDatasetModality); // NOSONAR: formatFunc is defined we are always in one the 3 handled cases
                }
            }
        }

        $scope.getCurrentFeatureData = () => {
            return $scope.modelData.subPopulation[$scope.modelData.selectedSubpopFeat];
        };

        $scope.getNumModalities = () => {
            return $scope.getCurrentFeatureData().modalities.length;
        };

        $scope.isSelectedFeatureInput = () => {
            return $scope.per_feature && ($scope.per_feature[$scope.modelData.selectedSubpopFeat] || {}).role == "INPUT";
        };

        $scope.getNbRecords = () => {
            return $scope.getCurrentFeatureData().nbRecords;
        };

        $scope.getMetricName = function(metric) {
            if (!metric) { return '-'; }

            return metric.shortName || metric.name || metric.fieldName;
        };

        $scope.getMetricLongName = function(metric) {
            if (!metric) { return '-'; }

            return metric.name || metric.fieldName;
        };

        $scope.getModalityType = (plural) => {
            const featType = $scope.getCurrentFeatureData().computed_as_type;

            switch(featType) {
                case "NUMERIC":
                    return plural ? "bins" : "bin";
                case "CATEGORY":
                default:
                    return plural ? "modalities" : "modality";
            }
        }

        $scope.isScrolling = false;
        $scope.setAllDatasetScrolled = (userAction) => {
            $scope.isScrolling = (userAction.target.scrollTop > 0);
            $scope.$apply();
        };

        $scope.sortByMetric = (metricName) => {

            let ss = $scope.selection;
            let metric = $scope.uiState.display.metrics.find(m => m.fieldName === metricName);
            let modalities = $scope.getCurrentFeatureData().modalities;

            if ($scope.uiState.sortMetric === metricName) {
                ss.orderReversed = !ss.orderReversed;

                if (metricName !== "modality") {
                    // Put all excluded modalities at bottom
                    modalities.filter(modality => modality.excluded)
                        .forEach( modality => {
                            modality.sortMetric *= -1;
                        });
                }

                return;
            } else {
                ss.orderReversed = false;
            }

            $scope.uiState.sortMetric = metricName;

            // Set value of 'sortMetric'
            modalities.forEach( modality => {
                let sortMetric;
                // Distinguish "modality" because they are not actual metrics,
                if (metricName === "modality") {
                    sortMetric = - modality.index;
                } else {
                    if (!modality.excluded) {
                        // Use metric function or retrieve it from the object
                        if (angular.isDefined(metric)) {
                            sortMetric = metric.getMetricFromPerf(modality.perf);
                        } else {
                            sortMetric = $interpolate(`{{${metricName}}}`)(modality);
                        }
                    } else {
                        // Put all excluded modalities at bottom
                        if (ss.orderReversed) {
                            sortMetric = Number.MAX_VALUE;
                        } else {
                            sortMetric = - Number.MAX_VALUE;
                        }
                    }
                }
                modality.sortMetric = sortMetric;
            });

            ss.orderQuery = "-sortMetric";
        };

        $scope.isSortMetric = function(metricFieldName) {
            return $scope.uiState.sortMetric === metricFieldName;
        }

        function reinitializeSort() {
            let ss = $scope.selection;
            $scope.uiState.sortMetric = undefined;
            ss.orderQuery = undefined;
            ss.orderReversed = undefined;
        }

        function setNumDecimalsMetrics(subpopData) {

            let getArrayMinDiffNumDecimals = (arr) => {
                let minDiff = Number.MAX_VALUE;
                let sortedArr = arr.sort((a, b) => (a > b) ? 1 : -1);
                let diff;

                for (let i=0 ; i < sortedArr.length - 1; i++) {
                    diff = sortedArr[i + 1] - sortedArr[i];
                    if (diff < minDiff) {
                        minDiff = diff;
                    }
                }

                // minDiff > 10 => return 0
                // 10 => minDiff > 1 => return 1
                // 1 => minDiff > 0.1 => return 2
                // ...
                return Math.max(-Math.ceil(Math.log10(minDiff)), 0);
            };

            let numDecimalsMetrics = $scope.uiState.display.numDecimalsMetrics;
            let nonExcludedModalitiesPerf = subpopData.modalities.concat(subpopData.allDatasetModality).filter(modality => !modality.excluded)
                .map(modality => modality.perf);
            $scope.uiState.display.metrics.forEach(m => {
                let numDecimals = getArrayMinDiffNumDecimals(nonExcludedModalitiesPerf.map(perf => m.getMetricFromPerf(perf)));
                if (m.percentage) {
                    numDecimals = Math.max(numDecimals - 2, 0);
                }
                numDecimalsMetrics[m.fieldName] = numDecimals;
            });
        }

        function setDisplayedMetrics() {
            if ($scope.modelData.modeling) {
                $scope.uiState.display.modelMetric = $scope.uiState.display.metrics.find(m => $scope.modelData.modeling.metrics.evaluationMetric == (m.metricName || m.fieldName.toUpperCase()));
                $scope.uiState.display.modelMetric.displayed = true;
                $scope.uiState.display.modelMetric.isModelMetric = true;
            }

            $scope.uiState.display.metrics.filter(m => !m.isModelMetric)
            // Sorting first metrics that are 'byDefault'
                .sort((m1, m2) => (m1.byDefault === m2.byDefault) ? 0 : (m1.byDefault ? -1: 1))
                .slice(0, 3)
                .forEach(m => {m.displayed = true;});
        }

        function buildAllDatasetModality(data, allDatasetPerf) {
            if (data) {
                data.allDatasetModality = {
                    isAllDataset: true,
                    count: data.nbRecords,
                    perf: allDatasetPerf,
                    index: -1
                }
            }
        }

        $scope.formatTableResults = function(data, allDatasetPerf, thresholdFn) {
            setDisplayedMetrics();
            buildAllDatasetModality(data, allDatasetPerf);
            formatModalitiesInformation(data);
            formatPerfDataAllModalities(data, thresholdFn);
            setNumDecimalsMetrics(data);
            reinitializeSort();

        }

        // SETTINGS FOR FILTERING RESULTS

        $scope.selection = $.extend({
            filterParams: {
                userQueryTargets: ["title", "weightedPercentageStr"]
            }
        }, $scope.selection || {})

        // STATIC VARIABLES

        const probabilityCharts = [
            ["DENSITY", "Density Chart"],
            ["PROBA_DISTRIB", "Probability Distribution"]
        ];

        const confusionMatrixModes = [
            ["records", $scope.areMetricsWeighted() ? "Weighted record count" : "record count"],
            ["actual", $scope.areMetricsWeighted() ? "Weighted % of actual classes" : "% of actual classes"],
            ["predicted", $scope.areMetricsWeighted() ? "Weighted % of predicted classes" : "% of predicted classes"]
        ];


        // METRICS

        const bcSingleMetrics = [
            {
                fieldName: "auc",
                name: "ROC - AUC Score",
                shortName: "ROC AUC",
                metricName: "ROC_AUC",
                minDecimals: 2,
                maxDecimals: 4,
                byDefault: true
            },
            {
                fieldName: "Precision",
                minDecimals: 2,
                maxDecimals: 4,
                byDefault: true
            },
            {
                fieldName: "Recall",
                minDecimals: 2,
                maxDecimals: 4,
                byDefault: true
            },
            {
                fieldName: "Accuracy",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "F1-Score",
                name: "F1 Score",
                metricName: "F1",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "hammingLoss",
                name: "Hamming Loss",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "mcc",
                name: "Matthews Correlation Coefficient",
                shortName: "MC Coeff.",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "logLoss",
                metricName: "LOG_LOSS",
                name: "Log Loss",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "customScore",
                shortName: "Custom",
                name: "Custom Score",
                metricName: "CUSTOM",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "lift",
                shortName: "Lift",
                name: "Cumulative lift",
                metricName: "CUMULATIVE_LIFT",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "cmg",
                name: "Cost matrix",
                metricName: "COST_MATRIX",
                minDecimals: 2,
                maxDecimals: 4
            },
            // Put fake metrics for 'actual' and 'predicted' for highlighted columns
            {
                fieldName: 'actual',
                fake: true,
                percentage: true,
                maxDecimals: 1,
                getMetricFromPerf: perf => perf.singleMetrics.actPos["ratio"]
            },
            {
                fieldName: 'predicted',
                fake: true,
                percentage: true,
                maxDecimals: 1,
                getMetricFromPerf: perf => perf.singleMetrics.predPos["ratio"]
            }
        ];

        // Adding function to retrieve metric value from perf
        bcSingleMetrics.forEach( sm => {
            if (sm.getMetricFromPerf === undefined) {
                sm.getMetricFromPerf = (perf) => perf.singleMetrics[sm.fieldName];
            }
        });

        const regSingleMetrics = [
            {
                fieldName: "mae",
                shortName: "MAE",
                name: "Mean Absolute Error (MAE)",
                minDecimals: 1,
                maxDecimals: 2,
                byDefault: true
            },
            {
                fieldName: "rmse",
                shortName: "RMSE",
                name: "Root Mean Squared Error (RMSE)",
                minDecimals: 1,
                maxDecimals: 2,
                byDefault: true
            },
            {
                fieldName: "r2",
                shortName: " R2 Score",
                minDecimals: 2,
                maxDecimals: 4,
                byDefault: true
            },
            {
                fieldName: "pearson",
                shortName: "Pearson coeff.",
                name: "Pearson coefficient",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "mape",
                shortName: "MAPE",
                name: "Mean Absolute Percentage Error",
                minDecimals: 1,
                maxDecimals: 2,
                percentage: true
            },
            {
                fieldName: "evs",
                name: " Explained Variance Score",
                shortName: "Explained Var.",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "mse",
                shortName: "MSE",
                name: "Mean Squared Error (MSE)",
                minDecimals: 0,
                maxDecimals: 1
            },
            {
                fieldName: "rmsle",
                shortName: "RMSLE",
                name: "Root Mean Squared Logarithmic Error (RMSLE)",
                ignoreZero: true,
                minDecimals: 1,
                maxDecimals: 2
            },
            {
                fieldName: "customScore",
                shortName: "Custom",
                name: "Custom Score",
                metricName: "CUSTOM",
                minDecimals: 2,
                maxDecimals: 4
            }
        ];

        // Adding function to retrieve metric value from perf
        regSingleMetrics.forEach( sm => {
            sm.getMetricFromPerf = (perf) => perf.metrics[sm.fieldName];
        });

        const mcSingleMetrics = [
            {
                fieldName: "auc",
                name: "ROC - AUC Score",
                shortName: "ROC AUC",
                metricName: "ROC_AUC",
                minDecimals: 2,
                maxDecimals: 4,
                byDefault: true
            },
            {
                fieldName: "Precision",
                minDecimals: 2,
                maxDecimals: 4,
                byDefault: true
            },
            {
                fieldName: "Recall",
                minDecimals: 2,
                maxDecimals: 4,
                byDefault: true
            },
            {
                fieldName: "Accuracy",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "F1-Score",
                name: "F1 Score",
                metricName: "F1",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "hammingLoss",
                name: "Hamming Loss",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "logLoss",
                metricName: "LOG_LOSS",
                name: "Log Loss",
                minDecimals: 2,
                maxDecimals: 4
            },
            {
                fieldName: "customScore",
                shortName: "Custom",
                name: "Custom Score",
                metricName: "CUSTOM",
                minDecimals: 2,
                maxDecimals: 4
            }
        ];

        // Adding function to retrieve metric value from perf
        mcSingleMetrics.forEach( sm => {
            if (sm.getMetricFromPerf === undefined) {
                sm.getMetricFromPerf = (perf) => perf.singleMetrics[sm.fieldName];
            }
        });

        $scope.toggleMetricDisplay = function(metric) {
            if (!metric.isModelMetric) {
                metric.displayed = !metric.displayed;
            }
        };

        $scope.metricExists = function(metric) {
            return !metric.fake && metric.getMetricFromPerf($scope.getCurrentFeatureData().allDatasetModality.perf) !== undefined;
        };

        // INIT

        $scope.per_feature = $scope.modelData.preprocessing.per_feature;

        $scope.metricsWeighted = false;
        $scope.authorizedColTypes = ["CATEGORY", "NUMERIC"];
        $scope.authorizedColRoles = ["INPUT", "REJECT"];
        $scope.computedSubpopulations = new Set();

        let metrics;
        if ($scope.isBinaryClassification()) {
            metrics = bcSingleMetrics;
        } else if ($scope.isRegression()) {
            metrics = regSingleMetrics;
        } else if ($scope.isMulticlass()) {
            metrics = mcSingleMetrics;
        }

        $scope.uiState = {
            display: {
                predictionType: $scope.modelData.coreParams.prediction_type,
                probabilityCharts: probabilityCharts,
                probabilityChart: probabilityCharts[0][0],
                confusionMatrixModes: confusionMatrixModes,
                confusionMatrixMode: confusionMatrixModes[0][0],
                metrics: metrics,
                numDecimalsMetrics: {}
            },
            // Saving selection in uiState to be able to retrieve if switching tabs and coming back
            selection: $scope.selection,
            noValueComputed: !$scope.modelData.selectedSubpopFeat,
        };
    });

    app.controller("SubpopulationController", function($scope, DataikuAPI, $stateParams, FutureProgressModal, WT1, $filter, $controller, ActiveProjectKey) {
        $controller('_SubpopTableUtilsController', {$scope: $scope});

        $scope.computationParams = {
            sample_size: 10000,
            random_state: 1337,
            n_jobs: 1,
            debug_mode: false,
        }

        function processSubpopInfo(subpopInfo) {
            $scope.computedSubpopulations = new Set(subpopInfo.features
                .filter((f) => f.done_at).map((f) => f.feature));
            $scope.computedOn = subpopInfo.computedOn;
            $scope.onSample = subpopInfo.onSample;
            if (subpopInfo.onSample) {
                $scope.computationParams.sample_size = subpopInfo.sampleSize;
                $scope.computationParams.random_state = subpopInfo.randomState;
            }
            $scope.lastRandomState = subpopInfo.randomState;
            $scope.lastSampleSize = subpopInfo.sampleSize;
            // If not subpopulation displayed and at least one already computed, display it
            if ($scope.modelData.selectedSubpopFeat === undefined && $scope.computedSubpopulations.size > 0) {
                $scope.uiState.subpopFeature = $scope.computedSubpopulations.values().next().value;
            }
        }

        function retrieveSubpopulationsInfo() {
            var id = $stateParams.fullModelId || $scope.fullModelId;
            if ($stateParams.mesId) 
                DataikuAPI.modelevaluations.getSubpopulationsInfo(makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId)).success(function(subpopInfo){
                    if (!$.isEmptyObject(subpopInfo)) {
                        processSubpopInfo(subpopInfo);
                    }
                }).error(setErrorInScope.bind($scope));
            else
                DataikuAPI.ml.prediction.getSubpopulationsInfo(id).success(function(subpopInfo){
                    if (!$.isEmptyObject(subpopInfo)) {
                        processSubpopInfo(subpopInfo);
                    }
                }).error(setErrorInScope.bind($scope));
        }

        function fetchSubpopulationResults(feature) {
            var id = $stateParams.fullModelId || $scope.fullModelId;
            if ($stateParams.mesId)  {
                if ($stateParams.mesId)  {
                    DataikuAPI.modelevaluations.getSubpopulation(makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId), [feature]).success(function(data) {
                        updateWithNewSubpopulationResults(feature, data);
                    });
                }
            } else {
                DataikuAPI.ml.prediction.getSubpopulation(id, [feature]).success(function(data) {
                    updateWithNewSubpopulationResults(feature, data);
                });
            }
        }

        function updateWithNewSubpopulationResults(feature, subpopulationResults) {
            $scope.modelData.selectedSubpopFeat = feature;
            $scope.modelData.subPopulation = $scope.modelData.subPopulation || new Map();
            $scope.modelData.subPopulation[feature] = subpopulationResults.subpopulationAnalyses.find(sa => sa.feature === feature);
            $scope.modelData.allDatasetPerf = subpopulationResults.global.perf;
            retrieveSubpopulationsInfo();
            $scope.formatTableResults($scope.modelData.subPopulation[feature], $scope.modelData.allDatasetPerf);
            $scope.uiState.noValueComputed = false;
        }

        function selectFetchedSubpopulationResults(feature) {
            $scope.modelData.selectedSubpopFeat = feature;
            $scope.formatTableResults($scope.modelData.subPopulation[feature], $scope.modelData.allDatasetPerf);
        }

        function restoreSortbyMetricFromUiState() {
            let uiStateSelection = $scope.uiState.selection;
            let selection = $scope.selection;

            selection.orderReversed = uiStateSelection.orderReversed;
            selection.orderQuery = uiStateSelection.orderQuery;
            selection.filterQuery = uiStateSelection.filterQuery;
        }

        // Directly display results when an already computed feature is selected
        $scope.$watch("uiState.subpopFeature", function(newFeature, oldFeature) {
            if (!newFeature || newFeature === oldFeature ) {
                return;
            }
            if ($scope.computedSubpopulations.has(newFeature)) {
                if ($scope.modelData.subPopulation && $scope.modelData.subPopulation[newFeature]) {
                    selectFetchedSubpopulationResults(newFeature);
                } else {
                    fetchSubpopulationResults(newFeature);
                }
            }
        });

        $scope.$watch("modelData.userMeta.activeClassifierThreshold", function() {
            if ($scope.modelData.selectedSubpopFeat
                    && $scope.modelData.subPopulation && $scope.modelData.subPopulation[$scope.modelData.selectedSubpopFeat]) {
                $scope.formatTableResults($scope.modelData.subPopulation[$scope.modelData.selectedSubpopFeat], $scope.modelData.allDatasetPerf);
            }
        });

        $scope.canCompute = function() {
            return $scope.uiState.subpopFeature && $scope.computationParams.n_jobs !== 0;
        } 

        $scope.computeSubpopulation = function(feature) {

            if (!feature) {
                return;
            }

            if ($stateParams.mesId) {
                DataikuAPI.modelevaluations.subpopulationComputationStart(makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId),
                        [feature], $scope.computationParams).success(function(data) {
                    var newScope = $scope.$new();
                    FutureProgressModal.show(newScope, data, "Computing Subpopulation").then(function(subpopulationResults) {
                        if (subpopulationResults) { // will be undefined if computation was aborted
                            updateWithNewSubpopulationResults(feature, subpopulationResults);
                        }
                    });
                }).error(setErrorInScope.bind($scope));

                // TODO: adjust the following
                WT1.event("me-compute-subpopulation", {
                    predictionType: $scope.evaluation.evaluation.predictionType,
                    feature_selection_params: $scope.evaluation.details.preprocessing.feature_selection_params,
                    metrics: $scope.evaluation.metrics,
                    weightMethod: $scope.evaluation.details.coreParams.weight.weightMethod
                });
            } else {
                var id = $stateParams.fullModelId || $scope.fullModelId;
                DataikuAPI.ml.prediction.subpopulationComputationStart(id, [feature], $scope.computationParams).success(function(data) {
                    var newScope = $scope.$new();
                    FutureProgressModal.show(newScope, data, "Computing Subpopulation").then(function(subpopulationResults) {
                        if (subpopulationResults) { // will be undefined if computation was aborted
                            updateWithNewSubpopulationResults(feature, subpopulationResults);
                        }
                    });
                }).error(setErrorInScope.bind($scope));

                WT1.event("pml-compute-subpopulation", {
                    backendType: $scope.modelData.backendType,
                    taskType: "PREDICTION",
                    predictionType: $scope.modelData.coreParams.prediction_type,
                    feature_selection_params: $scope.modelData.preprocessing.feature_selection_params,
                    metrics: $scope.modelData.modeling.metrics,
                    weightMethod: $scope.modelData.coreParams.weight.weightMethod
                });
            }
        }

        retrieveSubpopulationsInfo();

        // Save uiState into $scope.modelData to be able to restore the UI switching tabs and coming back
        if ($scope.modelData.$uiStateSubpopulation !== undefined) {
            $scope.uiState = $scope.modelData.$uiStateSubpopulation;
            restoreSortbyMetricFromUiState();
        } else {
            $scope.modelData.$uiStateSubpopulation = $scope.uiState;
        }

    });

    app.directive("subpopulationValue", function() {
        return {
            restrict: 'E',
            templateUrl: "/templates/ml/prediction-model/subpopulation-value.html",
            scope: {
                allDatasetPerf: "=",
                data : "=",
                threshold: "=",
                colors: "=",
                display: "=",
                classes: "=",
            },
            controller: function($scope, $controller) {
                $controller("_snippetMetricsCommon", {$scope: $scope});

                // VISUAL HELPERS

                $scope.getLinearGradient = function(ratio) {
                    return 'linear-gradient(to right, #9dccfe 0%, #9dccfe '+ (ratio * 100) +'%,rgba(0, 0, 0, 0) '+ (ratio * 100) +'%, rgba(0, 0, 0, 0) 100%)';
                };


                // INIT

                $scope.uiState = {
                    isExpanded: false,
                    excludedReasons: {
                        "DROPPED": "(all subpopulation dropped by the preprocessing)",
                        "NOTARGET": "(no target or weights on the subpopulation)",
                        "ONECLASS": "(only one class in subpopulation)"
                    }
                }

            }
        }
    });

})();
