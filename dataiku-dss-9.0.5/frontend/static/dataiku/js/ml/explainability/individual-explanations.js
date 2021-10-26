(function(){
    'use strict';

    var app = angular.module('dataiku.ml.explainability');
        

    app.controller("IndividualExplanationsController", function($scope, DataikuAPI, $stateParams, FutureProgressModal, ExportUtils, WT1, ActiveProjectKey) {
        
        const rangeLimit = { min: 0, max: 1 };
        const NUMBER_OF_BINS = 20;
        $scope.isKFolding = $scope.modelData.splitDesc.params.kfold;
        $scope.computationParams = {
            sample_size: Math.min(1000, maxRows()),
            random_state: 1337,
            n_jobs: 1,
            debug_mode: false,
        };
        $scope.uiState = {
            selectedFeature: undefined,
            showLowPredictions: true,
            showHighPredictions: true,
            nbExplanations: 3,
            method: "ICE",
            exportMode: false // true when the page is rendered by Model Document Generator
        };

        $scope.chartColor = '#D5D9D9';
        $scope.labels = [""];
        if ($scope.isMulticlass()) {
            // The classes that do not appear in test set should not be selectable to compute explanations
            $scope.selectableClasses = Object.keys($scope.modelData.perf.confusion.perActual);
        }

        $scope.selectedRange = {};
        $scope.forms = {};

        $scope.puppeteerPrepareForExport = function() {
            $scope.uiState.exportMode = true;
        };

        function getMultiClassificationDataToPlot(className) {
            const total = $scope.modelData.perf.confusion.totalRows;
            const actualRate = $scope.modelData.perf.confusion.perActual[className].actualClassCount / total;
            const otherRate = 1 - actualRate;
            const densityData = $scope.modelData.perf.densityData;
            const positiveClassDensityData = densityData[className];
            const median = positiveClassDensityData.incorrectMedian * otherRate + positiveClassDensityData.correctMedian * actualRate;
            return {
                x: densityData.x,
                y: positiveClassDensityData.correct.map(function (value, i) {
                    return value * actualRate + positiveClassDensityData.incorrect[i] * otherRate;
                }),
                median,
            };
        }

        function updateChartDataWithClass(className) {
            const data = getMultiClassificationDataToPlot(className);
            $scope.axes = {
                x: data.x,
                ys: [data.y]
            };
            $scope.average = data.median;
        }

        function maxRows() {
            if ($scope.isKFolding) {
                return $scope.modelData.trainInfo.fullRows;
            } else {
                return $scope.modelData.trainInfo.testRows;
            }
        }

        $scope.$watch("selectedClass", function (className) {
            if (className) {
                updateChartDataWithClass(className);
                updateResultsWithClass(className);
            }
        });

        $scope.$watch("axes", function () {
            let binSize = 0.01;
            if ($scope.isRegression()) {
                const predictions = $scope.modelData.perf.scatterPlotData.y;

                rangeLimit.max = d3.max(predictions);
                rangeLimit.min = d3.min(predictions);

                binSize = (rangeLimit.max - rangeLimit.min) / NUMBER_OF_BINS;
            }

            const { from, to } = getInitialBrushRange(10, binSize);
            $scope.selectedRange.from = from;
            $scope.selectedRange.to = to;

        }, true);

        if ($scope.isClassification()) {
            if ($scope.isMulticlass()) {
                $scope.selectedClass = $scope.modelData.classes[0];
            } else {
                const nbTrue = $scope.modelData.perf.perCutData.tp[0] + $scope.modelData.perf.perCutData.fn[0];
                const nbFalse = $scope.modelData.perf.perCutData.fp[0] + $scope.modelData.perf.perCutData.tn[0];
                const positiveRate = nbTrue / (nbTrue + nbFalse)
                const negativeRate = 1 - positiveRate;
                const densityData = $scope.modelData.perf.densityData;
                const positiveClassDensityData = densityData[$scope.modelData.classes[1]];
                $scope.average = positiveClassDensityData.correctMedian * positiveRate + positiveClassDensityData.incorrectMedian * negativeRate;
                $scope.axes = {
                    x: densityData.x,
                    ys: [positiveClassDensityData.correct.map(function (value, i) {
                        return value * positiveRate + positiveClassDensityData.incorrect[i] * negativeRate;
                    })]
                };
            }
            $scope.dataAxes = ["Predicted probability", "Probability density"];
            $scope.scale = d3.scale.linear().domain([0, 1]);
        } else if ($scope.isRegression()) {
            const predictions = $scope.modelData.perf.scatterPlotData.y;

            rangeLimit.max = d3.max(predictions);
            rangeLimit.min = d3.min(predictions);
            const x = d3.scale.linear().domain([rangeLimit.min, rangeLimit.max]);
            const data = d3.layout.histogram()
                .frequency(0)
                .bins(x.ticks(NUMBER_OF_BINS))
                (predictions);

            $scope.axes = {
                x: data.map(d => d.x),
                ys: [data.map(d => d.y)]
            };
            $scope.average = weightedMean($scope.axes.x, $scope.axes.ys[0]);
            $scope.dataAxes = ["Prediction", "Prediction density"];
            $scope.scale = d3.scale.linear().domain([rangeLimit.min, rangeLimit.max]);
        }

        function weightedMean(arrValues, arrWeights) {
            let cumSum = 0;
            let totalWeight = 0;
            for (let i = 0; i < arrValues.length; i++) {
                cumSum += arrValues[i] * arrWeights[i];
                totalWeight += arrWeights[i];
            }
            return cumSum / totalWeight;
        }

        function getInitialBrushRange(nbWantedRows, binSize) {
            let estimatedNbRowsInLeft = 0;
            let estimatedNbRowsInRight = 0;

            let xInfBrush, xSupBrush;
            for (let i=0; i < $scope.axes.x.length; i++) {
                if ($scope.isRegression()) {
                    estimatedNbRowsInLeft += $scope.axes.ys[0][i] * $scope.computationParams.sample_size;
                    estimatedNbRowsInRight += $scope.axes.ys[0][$scope.axes.x.length - i - 1] * $scope.computationParams.sample_size;
                } else {
                    estimatedNbRowsInLeft += binSize * $scope.axes.ys[0][i] * $scope.computationParams.sample_size;
                    estimatedNbRowsInRight += binSize * $scope.axes.ys[0][$scope.axes.x.length - i - 1] * $scope.computationParams.sample_size;
                }
                if (xInfBrush === undefined && estimatedNbRowsInLeft >= nbWantedRows) {
                    xInfBrush = $scope.axes.x[i];
                }
                if (xSupBrush === undefined && estimatedNbRowsInRight >= nbWantedRows) {
                    xSupBrush = $scope.axes.x[$scope.axes.x.length-i - 1];
                }
            }
            const middleRange = (rangeLimit.max - rangeLimit.min) / 2;
            if (!xInfBrush) {
                xInfBrush = middleRange;
            }
            if (!xSupBrush) {
                xSupBrush = middleRange;
            }
            return { from: xInfBrush, to: xSupBrush };
        }

        function setNumberOfRowsInLeftBrush() {
            let binSize = 0.01; // True only for classification but not needed in regression
            let estimatedNbRowsInLeft = 0;
            for (let i=0; i < $scope.axes.x.length; i++) {
                if ($scope.isRegression()) {
                    if ($scope.axes.x[i] <= $scope.selectedRange.from) {
                        estimatedNbRowsInLeft += $scope.axes.ys[0][i] * $scope.computationParams.sample_size;
                    }
                } else {
                    if ($scope.axes.x[i] <= $scope.selectedRange.from) {
                        estimatedNbRowsInLeft += binSize * $scope.axes.ys[0][i] * $scope.computationParams.sample_size;
                    }
                }
            }
            $scope.nbRowsLeft = Math.round(estimatedNbRowsInLeft);
        }

        function setNumberOfRowsInRightBrush() {
            let binSize = 0.01; // True only for classification but not needed in regression
            let estimatedNbRowsInRight = 0;
            for (let i=0; i < $scope.axes.x.length; i++) {
                if ($scope.isRegression()) {
                    if ($scope.axes.x[$scope.axes.x.length-i - 1] >= $scope.selectedRange.to) {
                        estimatedNbRowsInRight += $scope.axes.ys[0][$scope.axes.x.length - i - 1] * $scope.computationParams.sample_size;
                    }
                } else {
                    if ($scope.axes.x[$scope.axes.x.length-i - 1] >= $scope.selectedRange.to) {
                        estimatedNbRowsInRight += binSize * $scope.axes.ys[0][$scope.axes.x.length - i - 1] * $scope.computationParams.sample_size;
                    }
                }
            }
            $scope.nbRowsRight = Math.round(estimatedNbRowsInRight);
        }

        $scope.addBrush = function() {
            const epsilon = (rangeLimit.max - rangeLimit.min) / 1000;
            // clean up
            d3.selectAll(".line-chart-brush__right").remove();
            d3.selectAll(".line-chart-brush__left").remove();
            d3.selectAll(".x-average-mark").remove();

            const backgroundRect = d3.select(".nv-background rect");
            const backgroundG = d3.select(".nv-background")
            const brushHeight = Number(backgroundRect.style("height").split("px")[0]);
            const brushSvg = backgroundG.select(function() { return this.parentNode; });
            brushSvg.attr("height", backgroundRect.style("height"));

            const rightExtentRange = [$scope.selectedRange.to, rangeLimit.max];
            const leftExtentRange = [rangeLimit.min, $scope.selectedRange.from];

            if (leftExtentRange[1] > rightExtentRange[0]) {
                leftExtentRange[1] = rightExtentRange[0];
            }

            // avoid 0 width brushes
            if (leftExtentRange[1] === rangeLimit.min) {
                leftExtentRange[1] += epsilon;
            }
            if (rightExtentRange[0] === rangeLimit.max) {
                rightExtentRange[0] -= epsilon;
            }

            const width = backgroundG.node().getBoundingClientRect().width;
            const xScale = $scope.scale.range([0, width]);
            const brushHandlerHeight = 30;
            const brushHandlerWidth = 15;

            const onRightBrushed = function() {
                let rightExtent = rightBrush.extent();
                if (d3.event.mode === "move") { // disable brush moving
                    rightExtent = [$scope.selectedRange.to, rangeLimit.max];
                }  else if (rightExtent[1] === rightExtent[0]) {
                    rightExtent[0] -= epsilon; // avoid to have a brush with a width of 0
                    $scope.selectedRange.to = rightExtent[1];
                } else {
                    if (leftBrush && rightExtent[0] < leftBrush.extent()[1]) { // avoid to have a brush over the other
                        rightExtent[0] = leftBrush.extent()[1];
                    }
                    $scope.selectedRange.to = rightExtent[0];
                }
                $scope.$digest();
                d3.select(this).call(rightBrush.extent(rightExtent));
            };

            const onLeftBrushed = function() {
                let leftExtent = leftBrush.extent();
                if (d3.event.mode === "move") { // disable brush moving
                    leftExtent = [rangeLimit.min, $scope.selectedRange.from];
                } else if (leftExtent[1] === leftExtent[0]) {
                    leftExtent[1] += epsilon; // avoid to have a brush with a width of 0
                    $scope.selectedRange.from = leftExtent[0];
                } else {
                    if (rightBrush && leftExtent[1] > rightBrush.extent()[0]) { // avoid to have a brush over the other
                        leftExtent[1] = rightBrush.extent()[0];
                    }
                    $scope.selectedRange.from = leftExtent[1];
                }
                $scope.$digest();
                d3.select(this).call(leftBrush.extent(leftExtent));
            };
            // Add average mark
            brushSvg.append("path").attr("d", "M0,0 V" + (brushHeight-10))
                .attr("stroke-width", "1px").attr("stroke", $scope.chartColor).attr("stroke-dasharray", "5,3")
                .attr("transform", "translate(" + xScale($scope.average) + ", 10)").attr("class", "x-average-mark")
            brushSvg.append("text").attr("x", xScale($scope.average)).attr("y",  -1).attr("text-anchor", "middle").attr("class", "x-average-mark")
                .attr("fill", $scope.chartColor).text( $scope.isClassification() ? "Average probability" : "Average prediction");
            // make the brushes
            let leftBrush, rightBrush;
            if ($scope.uiState.showLowPredictions) {
                const leftBrushG = brushSvg.append("g").attr("class", "x line-chart-brush__left");
                leftBrush = d3.svg.brush().x(xScale).on("brush", onLeftBrushed).extent(leftExtentRange);
                const lB = leftBrushG.call(leftBrush);
                lB.selectAll(".extent").attr("y", 0).attr("height", brushHeight).style("cursor", "unset");
                leftBrushG.selectAll(".resize.e > rect").attr("y", 0).attr("height", brushHeight).attr("width", 5).style("visibility", "visible");
                leftBrushG.selectAll(".resize.e").append("rect").attr("x", -8).attr("y", (brushHeight / 2) - brushHandlerHeight /2).attr("height", brushHandlerHeight).attr("width", brushHandlerWidth);
            }
            if ($scope.uiState.showHighPredictions) {
                const rightBrushG = brushSvg.append("g").attr("class", "x line-chart-brush__right");
                rightBrush = d3.svg.brush().x(xScale).on("brush", onRightBrushed).extent(rightExtentRange);

                const rB = rightBrushG.call(rightBrush);
                rB.selectAll(".extent").attr("y", 0).attr("height", brushHeight).style("cursor", "unset");
                rightBrushG.selectAll(".resize.w > rect").attr("y", 0).attr("height", brushHeight).attr("width", 5).style("visibility", "visible");
                rightBrushG.selectAll(".resize.w").append("rect").attr("x", -8).attr("y", (brushHeight / 2) - brushHandlerHeight /2).attr("height", brushHandlerHeight).attr("width", brushHandlerWidth);
            }

            setNumberOfRowsInRightBrush();
            setNumberOfRowsInLeftBrush();
        };
        $scope.uiState.selectedColumn = findAnIdentifier();
        getExplanations();

        $scope.canCompute = function() {
            return $scope.forms.explanationsForm.nbExplanations.$valid && ($scope.uiState.showHighPredictions || $scope.uiState.showLowPredictions)
        };

        $scope.compute = function() {
            let computationParams = {
                low_predictions_boundary: $scope.selectedRange.from,
                high_predictions_boundary: $scope.selectedRange.to,
                nb_explanations: $scope.uiState.nbExplanations,
                class_to_compute: $scope.selectedClass,
                method: $scope.uiState.method,
                ...$scope.computationParams,
            };
            if ($stateParams.mesId) {
                DataikuAPI.modelevaluations.individualExplanationsComputationStart(makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId),
                    computationParams).success((result) => {
                    FutureProgressModal.show($scope, result, "Computing Individual Explanations").then((explanationResults) => {
                        formatExplanationResults(explanationResults);
                    });
                }).error(setErrorInScope.bind($scope));
            } else {
                DataikuAPI.ml.prediction.individualExplanationsComputationStart($stateParams.fullModelId || $scope.fullModelId, computationParams)
                    .success((result) => {
                    FutureProgressModal.show($scope, result, "Computing Individual Explanations").then((explanationResults) => {
                        formatExplanationResults(explanationResults);
                    });
                }).error(setErrorInScope.bind($scope));
            }
            WT1.event("doctor-compute-explanations", {
                lowPredictionsBoundary: $scope.selectedRange.from,
                highPredictionsBoundary: $scope.selectedRange.to,
                nbExplanations: $scope.uiState.nbExplanations,
                predictionType: $scope.modelData.coreParams.prediction_type,
                sampleSize: $scope.computationParams.sample_size,
                method: $scope.uiState.method,
            });
        };

        function sortAndSplitExplanations() {
            const results = $scope.results;
            const explanations = {
                high: {
                    values: [],
                    index: [],
                },
                low: {
                    values: [],
                    index: [],
                }
            };
            for (let i=0; i<results.predictions.length; i++) {
                const prediction = results.predictions[i];
                explanations.high.values[i] = [];
                explanations.low.values[i] = [];
                if (prediction <= $scope.selectedRange.from) {
                    explanations.low.index.push(i);
                } else if (prediction >= $scope.selectedRange.to) {
                    explanations.high.index.push(i);
                }

                for (const feature in results.explanations) {
                    const explanation = {
                        featureName: feature,
                        featureValue: results.observations[feature][i],
                        value: results.explanations[feature][i],
                    };
                    if (prediction <= $scope.selectedRange.from) {
                        explanations.low.values[i].push(explanation);
                    } else if (prediction >= $scope.selectedRange.to) {
                        explanations.high.values[i].push(explanation);
                    }
                }
                explanations.low.values[i].sort((exp1, exp2) => Math.abs(exp2.value) - Math.abs(exp1.value));
                explanations.low.values[i] = explanations.low.values[i].slice(0, results.nbExplanations);

                explanations.high.values[i].sort((exp1, exp2) => Math.abs(exp2.value) - Math.abs(exp1.value));
                explanations.high.values[i] = explanations.high.values[i].slice(0, results.nbExplanations);
            }
            explanations.low.index.sort((i1, i2) => results.predictions[i1] - results.predictions[i2]);
            explanations.high.index.sort((i1, i2) => results.predictions[i2] - results.predictions[i1]);
            return explanations;
        }

        function findAnIdentifier() {
            const perFeature = $scope.modelData.preprocessing.per_feature;
            let defaultIdentifier; // default identifier is the first feature (sorted by alphabetical order)
            for (const feature in perFeature) {
                if (defaultIdentifier === undefined || feature < defaultIdentifier) {
                    defaultIdentifier = feature;
                }
                if (perFeature[feature].autoReason === "REJECT_IDENTIFIER") {
                    return feature;
                }
            }
            return defaultIdentifier;
        }

        function getExplanations() {
            if ($stateParams.mesId) {
                DataikuAPI.modelevaluations.getIndividualExplanations(makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId))
                .success((allResults) => {
                    formatExplanationResults(allResults);
                });
            } else {
                DataikuAPI.ml.prediction.getIndividualExplanations($stateParams.fullModelId || $scope.fullModelId).success((allResults) => {
                    formatExplanationResults(allResults);
                });
            }
        }

        function formatExplanationResults(explanationResults) {
            if (explanationResults.perClass) {
                $scope.perClassResults = explanationResults.perClass;
                updateResultsWithClass($scope.selectedClass);
            }
        }

        function updateResultsWithClass(className) {
            if ($scope.perClassResults) {
                $scope.results = $scope.perClassResults[ $scope.isMulticlass() ? className : "unique" ]
                if ($scope.results) {
                    $scope.uiState.nbExplanations = $scope.results.nbExplanations;
                    $scope.computationParams.sample_size = $scope.results.nbRecords;
                    $scope.computationParams.random_state = $scope.results.randomState;
                    $scope.uiState.method = $scope.results.method;
                    $scope.selectedRange = {
                        from: $scope.results.lowPredictionsBoundary,
                        to: $scope.results.highPredictionsBoundary,
                    }
                    $scope.explanations = sortAndSplitExplanations($scope);
                }
            }
        }

        $scope.exportExplanations = function() {
            const exportColumns = Object.keys($scope.results.observations).map((feature) => {
                return { name: feature, type: "string"};
            });
            exportColumns.push({ name: $scope.isRegression() ? "predictions" : "probas", type: "string" });
            exportColumns.push({ name: "explanations", type: "string" });
            const indices = [...$scope.explanations.high.index, ...$scope.explanations.low.index];
            const data = [];
            for (let i=0; i < indices.length; i++) {
                const newRows = [];
                for (const col of Object.keys($scope.results.observations)) {
                    newRows.push($scope.results.observations[col][i]);
                }
                newRows.push($scope.results.predictions[i]);
                const explanationRow = {};
                const explanations = $scope.explanations.low.index.includes(i) ? $scope.explanations.low.values[i]: $scope.explanations.high.values[i];
                for (const explanation of explanations) {
                    explanationRow[explanation.featureName] = explanation.value;
                }
                newRows.push(JSON.stringify(explanationRow));
                data.push(newRows);
            }

            ExportUtils.exportUIData($scope, {
                name : "Individual explanations for model:" + $scope.modelData.userMeta.name,
                columns : exportColumns,
                data : data
            }, "Export explanations");
        };

        $scope.$watch("selectedRange.to", (newValue, oldValue) => { // FIX: trigger with high latency
            if (oldValue !== newValue) {
                setNumberOfRowsInRightBrush();
            }
        })

        $scope.$watch("selectedRange.from", (newValue, oldValue) => {
            if (oldValue !== newValue) {
                setNumberOfRowsInLeftBrush();
            }
        });

        $scope.$watch("computationParams.sample_size", () => {
            setNumberOfRowsInLeftBrush();
            setNumberOfRowsInRightBrush();
        });
    });

    app.factory("ExplanationBarUtils", function() {
        return {
            computeExplanationBarWidthFunc: function(explanationBarMaxWidth) {
                return (higherExplanation, currentExplanation) => {
                    const width = Math.trunc(Math.abs(currentExplanation / higherExplanation) * explanationBarMaxWidth);
                    return width === 0 ? 1 : width;
                }
            },

            computeExplanationXBarPositionFunc: function(explanationBarMaxWidth, explanationBarContainerWidth) {
                return (higherExplanation, currentExplanation) => {
                    const orientatedWidth = Math.trunc(currentExplanation / Math.abs(higherExplanation) * explanationBarMaxWidth);
                    if (orientatedWidth > 0) {
                        return Math.trunc(explanationBarContainerWidth / 2);
                    } else {
                        return Math.trunc(explanationBarContainerWidth / 2 + orientatedWidth)
                    }
                }
            },
        }
    });

    /**
     * This directive is used to display the explanations.
     */
    app.directive("individualExplanationCards", function(ExplanationBarUtils) {
        return {
            restrict: 'E',
            templateUrl: "/templates/ml/prediction-model/individual_explanation_cards.html",
            scope: {
                selectedColumn: '=',
                results: '=',
                isRegression: '=',
                explanations: '='
            },
            link: function(scope) {
                scope.explanationsHidden = [];
                scope.featuresShown = [];
                scope.subtitle = scope.isRegression ? 'Prediction' : 'Probability';
                const barMaxWidth = 40;
                scope.barContainerWidth = 100;
                scope.getBarWidth = ExplanationBarUtils.computeExplanationBarWidthFunc(barMaxWidth);
                scope.getXBarPosition = ExplanationBarUtils.computeExplanationXBarPositionFunc(barMaxWidth, scope.barContainerWidth);
                
                scope.toggleExplanations = function(index) {
                    scope.explanationsHidden[index] = !scope.explanationsHidden[index];
                }

                scope.toggleFeatures = function(index) {
                    scope.featuresShown[index] = !scope.featuresShown[index];
                }
            }
        }
    });


})();
