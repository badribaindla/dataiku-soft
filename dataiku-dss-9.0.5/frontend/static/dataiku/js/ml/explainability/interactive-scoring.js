(function(){
    'use strict';
        
    var app = angular.module('dataiku.ml.explainability');
        

    app.controller("InteractiveScoringController", function($scope, $timeout, DataikuAPI, WT1, $stateParams, Debounce, 
                                                            FutureWatcher, ExplanationBarUtils, localStorageService, CreateModalFromTemplate, 
                                                            ClipboardUtils, ActivityIndicator, ExportUtils, Dialogs, openDkuPopin, SpinnerService, epochShift) {
        if (! $scope.modelData) {
            return;
        }
        const perFeature = $scope.modelData.preprocessing.per_feature;
        const authorizedTypes = ['CATEGORY', 'NUMERIC', 'TEXT', 'VECTOR', 'IMAGE'];
        const authorizedRoles = ['INPUT'];
        let evaluationModelId = null;
        if ($scope.evaluation) {
            evaluationModelId = makeFullModelIdStringFromEvaluation($scope.evaluation.evaluation);
        }
        const fullModelId = evaluationModelId || $stateParams.fullModelId || $scope.fullModelId;
        const backendFormat = "YYYY-MM-DDTHH:mm:ss.SSS";
        const scorePrefix = 'proba_';
        const OTHERS_COLOR = '#ddd';

        let LOCAL_STORAGE_BUCKET_KEY,
            LOCAL_STORAGE_EXPLANATION_PARAMS_KEY,
            LOCAL_STORAGE_UI_STATE_KEY;
        if ($scope.insight && $scope.insight.id) {
            LOCAL_STORAGE_BUCKET_KEY = `dku.ml.interactivescoring.insight.${$scope.insight.id}.bucket`;
            LOCAL_STORAGE_EXPLANATION_PARAMS_KEY = `dku.ml.interactivescoring.insight.${$scope.insight.id}.explanationParams`;
            LOCAL_STORAGE_UI_STATE_KEY = `dku.ml.interactivescoring.insight.${$scope.insight.id}.uiState`;
        } else {
            LOCAL_STORAGE_BUCKET_KEY = `dku.ml.interactivescoring.${fullModelId}.bucket`;
            LOCAL_STORAGE_EXPLANATION_PARAMS_KEY = `dku.ml.interactivescoring.${fullModelId}.explanationParams`;
            LOCAL_STORAGE_UI_STATE_KEY = `dku.ml.interactivescoring.${fullModelId}.uiState`;
        }

        const nextTask = {
            "SCORE": null, "EXPLANATION": null,
        };

        const inputColumns = Object.keys(perFeature).filter(f => perFeature[f].role == "INPUT");

        // For dashboard
        $scope.userFeatures = null;

        $scope.computing = {
            "SCORE": false, "EXPLANATION": false,
        };
        $scope.ignoreFeatureTooltip = "Ignore feature: don't specify a value to the model";

        $scope.formatProba = (proba) => d3.format(",.2f")(proba*100);

        $scope.uiStateAlreadyLoaded = false;
        if (localStorageService.get(LOCAL_STORAGE_UI_STATE_KEY)) {
            $scope.uiState = localStorageService.get(LOCAL_STORAGE_UI_STATE_KEY);
            $scope.uiStateAlreadyLoaded = true;
        } else {
            $scope.uiState =  {
                features: [],
                preScriptFeatures: [],
                applyPreparationScript: null,
                couldNotRetrieveSchema: false,
                hasPreparationSteps: false,
                featureFilterOptions: [
                    { value: "index", label: "Dataset" },
                    { value: 'name', label: 'Name' },
                    { value: 'type', label: 'Type' }
                ],
            };
        }

        $scope.SCORE_VIEW = {
            COMPUTE: 'COMPUTE',
            COMPARE: 'COMPARE'
        };
        $scope.currentView = $scope.SCORE_VIEW.COMPUTE;
        $scope.showOtherFeatures = false;
        $scope.errors = {};

        $scope.labels = [''];
        $scope.barContainerWidth = 350;
        $scope.compareBarContainerWidth = 125;
        $scope.barMaxWidth = 100;
        $scope.compareBarMaxWidth = 50;

        $scope.getExplanationXBarPosition = ExplanationBarUtils.computeExplanationXBarPositionFunc($scope.barMaxWidth, $scope.barContainerWidth);
        $scope.getCompareExplanationXBarPosition = ExplanationBarUtils.computeExplanationXBarPositionFunc($scope.compareBarMaxWidth, $scope.compareBarContainerWidth);
        $scope.pickerFormat = "YYYY-MM-DD HH:mm";

        $scope.score = undefined;
        $scope.explanationParams = localStorageService.get(LOCAL_STORAGE_EXPLANATION_PARAMS_KEY) || {
            nbExplanations: 5,
            method: 'ICE',
        }

        $scope.bucket = localStorageService.get(LOCAL_STORAGE_BUCKET_KEY) || [];
        $scope.bucketCharts = [];
        $scope.scrollToLastItem = false;

        $scope.featureSortBy = {
            attribute: "index",
            isReversed: false,
        }

        $scope.getExplanationIncompatibility = function() {
            if ($scope.modelData.coreParams.backendType === "KERAS") {
                return "Cannot compute explanations for a model built with Keras";
            }
            return null;
        }

        $scope.sendBasicWT1Event = function() {
            WT1.event('interactive-scoring', {
                explanationParams: $scope.explanationParams,
                applyPreparationScript: $scope.uiState.applyPreparationScript
            })
        };

        // ----- UI interactions

        $scope.changeView = function(view) {
            $scope.currentView = view;
            $scope.scrollToLastItem = false;

            if (view === $scope.SCORE_VIEW.COMPARE) {
                WT1.event('interactive-scoring-compare-button', {
                    itemCount: $scope.bucket.length
                });
            }
        };

        $scope.changeEditMode = function(feature, newMode, triggerCompute=true) {
            feature.editMode = newMode;
            const featureOldValue = feature.value;
            switch(newMode) {
                case "UNSET":
                    feature.value = null;
                    break;
                case "DOMAIN":
                    if (feature.type === "NUMERIC" || feature.type === "DATE") {
                        if (feature.value === null || isNaN(feature.value)) {
                            feature.value = feature.defaultValue;
                        } else if (feature.value > feature.max) {
                            feature.value = feature.max;
                        } else if (feature.value < feature.min) {
                            feature.value = feature.min;
                        }
                    } else if (feature.type === "CATEGORY") {
                        if (!feature.possibleValues.includes(feature.value)) {
                            feature.value = feature.defaultValue;
                        }
                    }
                    break;
                case "RAW":
                    if (feature.type !== "NUMERIC") {
                        if (feature.value === null) {
                            feature.value = "";
                        }
                    }
                    break;
            }
            if (triggerCompute && featureOldValue !== feature.value) {
                onFeatureChange();
            }
        }

        $scope.toggleOtherFeatures = function() {
            $scope.showOtherFeatures = !$scope.showOtherFeatures;
        }

        $scope.isDoneLoading = function() {
            return Object.values($scope.computing).every(c => !c)  && $scope.score && ($scope.explanations || $scope.getExplanationIncompatibility());
        };

        $scope.toggleExplanationParamsPopin = function($event) {
            if (!$scope.popinOpen) {
                function isElsewhere(elt, e) {
                    return $(e.target).parents(".dropdown-menu").length == 0;
                }
                const dkuPopinOptions = {
                    template: '<explanation-params-form></explanation-params-form>',
                    isElsewhere,
                    popinPosition: 'SMART',
                    onDismiss: () => {
                        $scope.popinOpen = false;
                    }
                };
                $scope.dismissPopin = openDkuPopin($scope, $event, dkuPopinOptions);
                $scope.popinOpen = true;
            } else if ($scope.dismissPopin) {
                $scope.dismissPopin();
            }
        };

        $scope.fileUploaded = function(event, feature) {
            const file = event.srcElement.files[0];
            const reader = new FileReader();
            reader.onloadend = function(event){
                feature.value = event.target.result.split(",")[1]; // remove prefix "data:image/*;base64"
                $scope.onFeatureChange();
            }
            reader.readAsDataURL(file);
        }

        // ----- Feature formatting
        
        $scope.getFeatures = function() {
            return getFeaturesFromUiState($scope.uiState);
        }

        $scope.allFeaturesEmpty = function() {
            return $scope.getFeatures().every(f => f.value == undefined);
        } 

        $scope.getPredictedClassProba = function(score) {
            if ($scope.isClassification()) {
                return $scope.formatProba(score[scorePrefix + score.prediction]);
            }
        };

        $scope.getPositiveClassProba = function(score) {
            if ($scope.isBinaryClassification()) {
                return $scope.formatProba(score[scorePrefix + $scope.getPositiveClass()]);
            }
        };

        $scope.getProbaForBucketItem = function(score) {
            if ($scope.isMulticlass()) {
                return $scope.getPredictedClassProba(score);
            } else if ($scope.isBinaryClassification()) {
                return $scope.getPositiveClassProba(score);
            }
        }

        $scope.getFeatureComparator = function(inUserFeatures=true) {
            if ($scope.userFeatures && inUserFeatures) {
                return sortByListOfFeatures;
            } else {
                if (["index", "importance"].includes($scope.featureSortBy.attribute)) {
                    return sortByNumericValue;
                }
                return null; // default comparator
            }
        }

        function getIndexSortingAttibute() {
            return $scope.applyPreparationScript ? "preScriptIdx" : "index";
        }

        $scope.getFeatureOrderingExpression = function(inUserFeatures=true) {
            if ($scope.userFeatures && inUserFeatures) {
                return "name"; // in dashboard, the list of feature names will be used
            }
            if ($scope.featureSortBy.attribute === "type") {
                return [$scope.featureSortBy.attribute, hasFeatureImportance() ? "-importance" : getIndexSortingAttibute()];
            } else {
                return getIndexSortingAttibute();
            }
        }

        $scope.isSortReversed = function(inUserFeatures=true) {
            if ($scope.userFeatures && inUserFeatures) { 
                // no option to reverse sort in dashaboard
                return false;
            }
            return $scope.featureSortBy.isReversed;
        }

        function hasFeatureImportance() {
            return $scope.uiState.featureFilterOptions.map(o => o.value).includes("importance")
        }

        function sortByNumericValue(element1, element2) {
            return Number(element1.value) - Number(element2.value);
        }

        function sortByListOfFeatures(feature1, feature2) {
            return $scope.userFeatures.indexOf(feature1.value) - $scope.userFeatures.indexOf(feature2.value);
        }

        function getOtherFeatures() {
            if ($scope.tile) {
                if ($scope.tile.tileParams.advancedOptions.interactiveScoring) {
                    $scope.userFeatures = $scope.tile.tileParams.advancedOptions.interactiveScoring.featuresOrder;
                    return $scope.getFeatures()
                                 .map(f => f.name)
                                 .filter(col => !$scope.userFeatures.includes(col));
                } else {
                    return [];
                }
            }
        }

        $scope.hasFilteredOutFeatures = function() {
            const otherFeatures = getOtherFeatures();
            return $scope.userFeatures && otherFeatures && otherFeatures.length;
        }

        $scope.keepOnlyMainFeatures = function(feature) {
            if ($scope.userFeatures) {
                return $scope.userFeatures.includes(feature.name);
            }
            return !$scope.keepOnlyPartDimensions(feature);
        };

        $scope.keepOnlyPartDimensions = function(feature) {
            return feature.type == "PART_DIM";
        };

        $scope.keepOtherFeatures = function(feature) {
            const otherFeatures = getOtherFeatures();
            if (otherFeatures) {
                return otherFeatures.includes(feature.name);
            }
            return false;
        }

        // for binary classification
        $scope.getPositiveClass = function() {
            return $scope.modelData.classes ? $scope.modelData.classes[1] : '';
        };
        
        $scope.formatPrediction = function(prediction) {
            if ($scope.isRegression()) {
                return d3.format($scope.predictionFormat())(prediction);
            } else {
                return prediction;
            }
        }

        function getFeaturesFromUiState(uiState) {
            return uiState.applyPreparationScript ? uiState.preScriptFeatures : uiState.features;
        }

        function formatFeatures(features) {
            return features.map(feature => ({
                name: feature.name,
                value: feature.value,
                type: feature.type,
                importance: feature.importance,
            }));
        }

        function roundToXDigits(value, nDigits) {
            return parseFloat(value.toFixed(nDigits));
        }

        function smartNumberDigits(min, max) {
            if (min === max) {
                return 0;
            }
            const absoluteMin = Math.min(Math.abs(min), Math.abs(max));
            const differenceOrderOfMagnitude = Math.floor(Math.log10(max - min));
            if (differenceOrderOfMagnitude < 0) {
                return -differenceOrderOfMagnitude + 1;
            } else {
                return Math.max(max - min < 10 ? 1 : 0, -Math.floor(Math.log10(absoluteMin || 10)));
            }
        }

        function getFeatureInfo(collectorData, featuresStorageType, featureName, featureType) {
            let defaultValue;
            let defaultEditMode = "DOMAIN";
            switch (featureType) {
            case "NUMERIC":
                const isDate = featuresStorageType[featureName] === "date";
                const isInteger = featuresStorageType[featureName] === "bigint";

                const defaultNumValue = collectorData.per_feature[featureName].stats.median;
                const min = collectorData.per_feature[featureName].stats.min;
                const max = collectorData.per_feature[featureName].stats.max;
                const nDecimals = isInteger ? 0 : smartNumberDigits(min, max);
                defaultValue = isDate 
                    ? moment.unix(defaultNumValue - epochShift).utc().format($scope.pickerFormat) 
                    : roundToXDigits(defaultNumValue, nDecimals);
                return { 
                    value: defaultValue,
                    defaultValue,
                    min: roundToXDigits(min, nDecimals),
                    max: roundToXDigits(max, nDecimals),
                    type: isDate ? "DATE" : featureType,
                    defaultEditMode,
                    editMode: defaultEditMode,
                    nDecimals,
                }            
            case "CATEGORY":
                const possibleValues = [...(collectorData.per_feature[featureName].category_possible_values || [])];
                if (perFeature[featureName].dummy_drop === "DROP") {
                    const doppedModality = collectorData.per_feature[featureName].dropped_modality;
                    // when nan is the dropped modality it has been replaced by "__DKU_N/A__"
                    // and it will not be added to the possible values (can use ignore feature for that)
                    if (doppedModality !== undefined && doppedModality !== "__DKU_N/A__") {
                        possibleValues.push(doppedModality);
                    }
                }
                defaultValue = collectorData.per_feature[featureName].stats.mostFrequentValue;
                defaultEditMode = possibleValues && possibleValues.length ? "DOMAIN" : "RAW";
                return {
                    value: defaultValue,
                    defaultValue,
                    possibleValues,
                    defaultEditMode,
                    editMode: defaultEditMode,
                }
            case "VECTOR":
                defaultEditMode = "RAW";
                const vectorLength = collectorData.per_feature[featureName].vector_length || 0;
                defaultValue = "["+new Array(vectorLength).fill(0).join(", ")+"]";
                return { value: defaultValue, defaultValue , editMode: defaultEditMode, defaultEditMode};
            case "TEXT":
                defaultEditMode = "RAW";
                return { value: "", editMode: defaultEditMode, defaultEditMode };
            case "IMAGE":
                return { value: null, editMode: defaultEditMode, defaultEditMode };
            }
        }

        function formatFeaturesParams(featuresList) {
            const params = {
                features: []
            };
            featuresList.forEach((features, index) => {
                params.features[index] = {};
                features.forEach(feature => {
                    if (feature.value !== null) {
                        params.features[index][feature.name] = feature.type == "DATE" ? moment(feature.value).utc().format(backendFormat) : feature.value;
                    }
                });
            });
        
            return params;
        }

        // Scores/Explanations and charts

        $scope.predictionFormat = function () {
            const predictions = $scope.modelData.perf.scatterPlotData.y;
            const min = d3.min(predictions);
            const max = d3.max(predictions);
            return `.${smartNumberDigits(min, max)}f`;
        }

        function generateChartData() {
            if (! $scope.score) return;
            
            if ($scope.isClassification()) {
                const MAX_CLASSES = 6;
                $scope.predictions = getPredictionChartData($scope.score, MAX_CLASSES)
                $scope.threshold = $scope.isBinaryClassification() ? $scope.modelData.userMeta.activeClassifierThreshold : undefined;
            } else if ($scope.isRegression()) {
                $scope.prediction = $scope.score.prediction;
                const predictions = $scope.modelData.perf.scatterPlotData.y;
                const rangeLimit = { min: 0, max: 1 };
                rangeLimit.max = d3.max(predictions);
                rangeLimit.min = d3.min(predictions);
                const x = d3.scale.linear().domain([rangeLimit.min, rangeLimit.max]);
                const data = d3.layout.histogram()
                    .frequency(0)
                    .bins(x.ticks(20))
                    (predictions);

                $scope.axes = {
                    x: data.map(d => d.x),
                    ys: [data.map(d => d.y)]
                };
                $scope.xm = [$scope.prediction];
                $scope.dataAxes = ["Prediction", "Prediction density"];
                $scope.scale = d3.scale.linear().domain([rangeLimit.min, rangeLimit.max]);
            }
        }

        function sortAndFormatExplanations(allExplanations) {
            const allFormattedExplanations = []
            for (const explanationsForOneRow of allExplanations) {
                const formattedExplanations = [];
                if (!explanationsForOneRow)  {
                    allFormattedExplanations.push(null);
                } else {
                    for (const featureName in explanationsForOneRow) {
                        formattedExplanations.push({
                            feature: featureName,
                            value: explanationsForOneRow[featureName],
                        });
                    }
                    const sortedExplanations = formattedExplanations.sort((exp1, exp2) => Math.abs(exp2.value) - Math.abs(exp1.value));;
                    $scope.topExplanationValue = sortedExplanations[0].value;
                    sortedExplanations.forEach((explanation) => {
                        explanation.barWidthRatio =  ExplanationBarUtils.computeExplanationBarWidthFunc($scope.barMaxWidth)($scope.topExplanationValue, explanation.value) / $scope.barMaxWidth;
                    });
                    allFormattedExplanations.push(sortedExplanations);
                }
            } 
        return allFormattedExplanations;
        }

        if ($scope.uiStateAlreadyLoaded) {
            if (hasFeatureImportance()) {
                $scope.featureSortBy.attribute = "importance";
            }
            onFeatureChange();
            $scope.sendBasicWT1Event();
        } else {
            Promise.all([DataikuAPI.ml.prediction.getCollectorData(fullModelId),
                        DataikuAPI.ml.prediction.getColumnImportance(fullModelId),
                        DataikuAPI.ml.prediction.getSplitDesc(fullModelId)]).then(
                            ([collectorDataResp, columnImportanceResp, splitDescResp]) => {
                const collectorData = collectorDataResp.data;
                let perFeatureImportance;
                if (columnImportanceResp.data) {
                    const columns = columnImportanceResp.data.columns;
                    const importances = columnImportanceResp.data.importances;
                    perFeatureImportance = {};
                    columns.forEach((col, i) => perFeatureImportance[col] = importances[i]);
                    $scope.uiState.featureFilterOptions.push({value: "importance", label: "Importance"});
                    $scope.featureSortBy.attribute = "importance";
                }
                $scope.uiState.featuresStorageType = splitDescResp.data.schema.columns.reduce(
                    (obj, column) => Object.assign(obj, { [column.name]: column.type }), {});
                    
                $scope.uiState.features = Object.keys($scope.uiState.featuresStorageType)
                    .filter(featureName => authorizedTypes.includes(perFeature[featureName].type) && 
                                            authorizedRoles.includes(perFeature[featureName].role))
                    .map((name, index) => ({
                        index,
                        name,
                        type: perFeature[name].type,
                        role: perFeature[name].role,
                        importance: perFeatureImportance ? perFeatureImportance[name] : null,
                        ...getFeatureInfo(collectorData, $scope.uiState.featuresStorageType, name, perFeature[name].type)
                    }));

                if ($scope.isPartitionedModel() && $scope.isOnPartitionedBaseModel()) {
                    const dimensionNames = $scope.modelData.coreParams.partitionedModel.dimensionNames;
                    const donePartitions = Object.entries($scope.partitionedModelSnippets.partitions.summaries)
                                            .filter(([_, partition]) => partition.state.endsWith("DONE"))                        
                                            .map(([name, _]) => name.split("|"));

                    for (const [index, dimensionName] of dimensionNames.entries()) {
                        const possibleValues = [...new Set(donePartitions.map(part => part[index]))];
                        $scope.uiState.features.push({
                            name: dimensionName,
                            possibleValues,
                            defaultValue: donePartitions[0][index],
                            value: donePartitions[0][index],
                            type: "PART_DIM",
                        });
                    }
                }

                // Check if preparation script contains steps, if yes get the schema of the dataset before script
                DataikuAPI.ml.prediction.getPreparationScript(fullModelId).success((preparationScript) => {
                    $scope.uiState.hasPreparationSteps = preparationScript.steps.some(step => !step.disabled);
                    if ($scope.uiState.hasPreparationSteps) {
                        $scope.uiState.applyPreparationScript = true;
                        DataikuAPI.ml.prediction.getInputDatasetSchema(fullModelId).success((schema) => {
                            $scope.uiState.preScriptFeatures = schema.columns.map((col, index) =>  {
                                const f = $scope.uiState.features.find(f => f.name === col.name) ||
                                    { name: col.name, type: "TEXT", value: "", editMode: "RAW" };
                                f.preScriptIdx = index;
                                return f;
                            });
                            onFeatureChange();
                        }).catch((error) => {
                            if (error.status != 404) {
                                setErrorInScope.bind($scope)(error.data, error.status, error.headers);
                            } else {
                                $scope.uiState.applyPreparationScript = false;
                                $scope.uiState.couldNotRetrieveSchema = true;
                                onFeatureChange();
                            }
                        }).finally(() => {
                            $scope.sendBasicWT1Event();
                        });
                    } else {
                        onFeatureChange();
                        $scope.sendBasicWT1Event();
                    }
                }).catch(setErrorInScope.bind($scope));

            }).catch(setErrorInScope.bind($scope));
        }


        // ----- Comparator methods

        // We avoid having features before and after preparation script in the same comparator
        // If incompatible features are added to the comparator we offer two choices to the user:
        // cancel this adding or override the comprator content
        function protectBucketFromConflicts(needPreparationScript) {
            return new Promise((resolve, reject) => {
                if ($scope.bucket.length !== 0 &&
                    $scope.bucket[0].applyPreparationScript !== null &&
                    needPreparationScript !== null &&
                    $scope.bucket[0].applyPreparationScript !== needPreparationScript) {
                        CreateModalFromTemplate("templates/ml/prediction-model/interactive-scoring-conflict-dialog.html", $scope, null, function(newScope) {
                            newScope.showTips = true;
                            newScope.pasteAnyway = () => {
                                newScope.dismiss();
                                $scope.bucket = [];
                                resolve();
                            }
                            newScope.cancel = () => {
                                newScope.dismiss();
                                reject();
                            };
                        });
                } else {
                    resolve();
                }
            });
        }

        function safelyPasteInBucket(pastedItems) {
            const needPreparationScript = pastedItems[0].applyPreparationScript;
            protectBucketFromConflicts(needPreparationScript).then(() => {
                pasteInBucket(pastedItems);
            });
        }

        // Add current 
        function addToBucket() {
            const newItem = {
                name: '',
                score: $scope.score,
                explanation: $scope.explanations,
                features: $scope.getFeatures(),
                applyPreparationScript: $scope.uiState.applyPreparationScript,
            };
            // ignore any keys that aren't in the model's list of features
            //const features = $scope.uiState.features.map(feature => feature.name);
            newItem.features = formatFeatures(newItem.features);
            $scope.scrollToLastItem = true;
            $scope.bucket.push(newItem);
            ActivityIndicator.success("Added to comparator.");
            $scope.$apply();
        };

        $scope.safelyAddToBucket = function() {
            const needPreparationScript = $scope.uiState.applyPreparationScript;
            protectBucketFromConflicts(needPreparationScript).then(() => {
                addToBucket();
            });
        }

        $scope.removeFromBucket = function(index) {
            $scope.bucket[index].removing = true;
            
            $timeout(() => {
                $scope.bucket.splice(index, 1);
            }, 500);
        };

        $scope.removeAllFromBucket = function() {
            Dialogs.confirm($scope, "Clear all items", "Are you sure you want to clear all items in the comparator?").then(function () {
                $scope.bucket = [];
                ActivityIndicator.success('All items cleared from comparator.');
            });
        }

        // comparator item formatting
        function formatItems(items) {
            let formatedItems = angular.copy(items);

            return formatedItems.map(item => {
                Object.keys(item).forEach(key => {
                    if (key.startsWith('$')) {
                        delete item[key];
                    }
                });
                item.features = formatFeatures(item.features);

                return item;
            });
        }

        // Generates prediction chart under each item in the comparator
        function getPredictionChartData(predictions, maxClasses) {
            if (!$scope.isClassification()) return;

            // assign a color to each prediction
            let classes = $scope.modelData.classes.filter(pc => `${scorePrefix}${pc}` in predictions);
            let colorPalette = $scope.colors.slice(0, classes.length);
            let chartPredictions = classes.map((pc, index) => ({
                name: pc,
                value: predictions[`${scorePrefix}${pc}`],
                color: colorPalette[index]
            }));

            if ($scope.isBinaryClassification()) {
                chartPredictions = [chartPredictions[1], chartPredictions[0]];
            } else {
                chartPredictions.sort((p1, p2) => p2.value - p1.value);

                if (chartPredictions.length > maxClasses) {
                    chartPredictions = chartPredictions.slice(0, maxClasses - 1);
                    const othersPercentage = 1 - chartPredictions.reduce((total, prediction) => total + prediction.value, 0);
                    chartPredictions.push({
                        name: 'Others',
                        value: othersPercentage,
                        color: OTHERS_COLOR
                    });
                }
            }

            return chartPredictions;
        }

        $scope.$watch('bucket', function() {
            localStorageService.set(LOCAL_STORAGE_BUCKET_KEY, formatItems($scope.bucket));
            if ($scope.isClassification()) {
                $scope.bucketCharts = $scope.bucket.map(item => item.score ? getPredictionChartData(item.score, 3) : null);
            }

            if ($scope.bucket.length > 1) {
                const listOfFeatureValues = $scope.bucket[0].features.map((_, colIndex) => $scope.bucket.map(row => row.features[colIndex].value));
                const allEqual = arr => arr.every(v => v === arr[0]);
                for (const [i, featureValues] of listOfFeatureValues.entries()) {
                    for (const item of $scope.bucket) {
                        item.features[i].greyed = allEqual(featureValues);
                    }
                }
            } else if ($scope.bucket.length === 1) {
                $scope.bucket[0].features.forEach(f => f.greyed = false);
            }
        }, true);

        $scope.$watch("uiState", function() {
            localStorageService.set(LOCAL_STORAGE_UI_STATE_KEY, $scope.uiState);
        }, true);

        $scope.$watch("featureSortBy.attribute", function(nv, ov) {
            if (nv == "importance") {
                $scope.featureSortBy.isReversed = true;
            } else if (ov == "importance") {
                $scope.featureSortBy.isReversed = false;
            }
        });

        $scope.$on('$destroy', function() {
            localStorageService.set(LOCAL_STORAGE_BUCKET_KEY, $scope.bucket);
        });


        // ----- Copy/paste

        const copyType = 'interactive-scoring';

        $scope.copyValues = function(items) {
            let copy = {
                type: copyType,
                version: $scope.appConfig.version.product_version,
                samples: items.map(item => ({
                    name: item.name,
                    features: formatFeatures(item.features),
                    applyPreparationScript: item.applyPreparationScript,
                }))
            };

            ClipboardUtils.copyToClipboard(JSON.stringify(copy, null, 2), `Copied ${items.length} item${items.length === 1 ? '': 's'} to clipboard.`);
        };

        $scope.disableAllFeatures = function() {
            $scope.getFeatures().forEach(feature => $scope.changeEditMode(feature, "UNSET", false));
            onFeatureChange();
        }

        $scope.resetAllFeaturesToDefault = function() {
            $scope.getFeatures().forEach(feature => {
                feature.value = feature.defaultValue;
                feature.editMode = feature.defaultEditMode;
            });
            onFeatureChange();
        }

        $scope.openPasteDialog = function(pasteType) {
            let newScope = $scope.$new();

            CreateModalFromTemplate("/templates/ml/prediction-model/interactive_scoring_paste_modal.html", newScope, 'PasteModalController', function(modalScope) {
                modalScope.showTips = true;
                modalScope.copyType = 'interactive-scoring';
                modalScope.itemKey = 'samples';
                modalScope.pasteSingle = pasteType === $scope.SCORE_VIEW.COMPUTE;
                modalScope.pasteItems = pasteType === $scope.SCORE_VIEW.COMPUTE ? pasteFeatures : safelyPasteInBucket;
                modalScope.validateData = validatePastedData;
                modalScope.applyGenericFormat = formatCopiedData;
            });
        };

        function formatCopiedData(data) {
            if (Array.isArray(data.samples)) { 
                return data;
            } else {
                return { // May come from "Copy rows as JSON" in Dataset explore
                    type: copyType,
                    version: $scope.$root.appConfig.version.product_version,
                    samples: [{
                        name: "",
                        features: Object.entries(data).map(([name, value]) => { return {name , value} }),
                        applyPreparationScript: null,
                    }]
                }
            }
        }

        // immediately show preview state since we've already pasted
        $scope.openPasteModalFromKeydown = function(data) {
            try {
                data = JSON.parse(data);
            } catch(e) {}

            if (data && !Array.isArray(data.samples)) { // May come from "Copy rows as JSON" from Dataset explore
                data = formatCopiedData(data);  
                if (!validatePastedData(data.samples)) {
                    return;
                }
            }

            if (data && data.samples && data.samples.length && data.type === copyType) {
                let newScope = $scope.$new();

                CreateModalFromTemplate("/templates/ml/prediction-model/interactive_scoring_paste_modal.html", newScope, 'PasteModalController', function(modalScope) {
                    modalScope.uiState.editMode = false;
                    modalScope.uiState.items = data.samples;
                    modalScope.pasteSingle = $scope.currentView === $scope.SCORE_VIEW.COMPUTE;
                    modalScope.pasteItems = $scope.currentView === $scope.SCORE_VIEW.COMPUTE ? pasteFeatures : safelyPasteInBucket;
                    modalScope.validateData = validatePastedData;
                });
            }
        };

        $scope.getCurrentItem = function() {
            return {
                name: '',
                features: $scope.getFeatures(),
                applyPreparationScript: $scope.uiState.applyPreparationScript,
            };  
        };

        $scope.keydownCopy = function(event) {
            if ($scope.isDoneLoading() && $scope.currentView === $scope.SCORE_VIEW.COMPUTE) {
                $scope.copyValues([$scope.getCurrentItem()]);

                event.currentTarget.focus();
            }
        }

        function validatePastedData(pastedItems) {
            const allFeatures = $scope.getFeatures();

            // make sure at least one feature in each sample matches features used in the model
            return pastedItems.every(item => {
                return item.features.some(feature => {
                    return allFeatures.find(f => feature.name === f.name);
                });
            });
        }

        function pasteFeatures(pastedItems) {
            if (!pastedItems.length) return;
            const firstItem = pastedItems[0];
            $scope.uiState.applyPreparationScript = firstItem.applyPreparationScript;
            $scope.getFeatures().forEach(feature => {
                // take first set of features from list
                const pastedFeature = firstItem.features.find(f => feature.name === f.name);
                const pastedValue = pastedFeature ? pastedFeature.value : null;
                
                feature.editMode = getNewEditMode(feature, pastedValue);
                feature.value = pastedValue;
                feature.type = feature.type;
            });

            onFeatureChange();

            WT1.event('interactive-scoring-paste', {
                nbItems: pastedItems.length,
                type: 'features'
            });
        }

        // find the appropriate edit mode for the new value when pasted
        function getNewEditMode(feature, newValue) {
            if (newValue !== null) {
                if (feature.type === 'NUMERIC') {
                    if (newValue < feature.min || newValue > feature.max) {
                        return 'RAW';
                    }
                } else if (feature.type === "CATEGORY") {
                    if (!feature.possibleValues.includes(newValue)) {
                        return 'RAW';
                    }
                }

                return 'DOMAIN';
            }

            return 'UNSET';
        }

        function pasteInBucket(pastedItems) {
            const featureNames = $scope.getFeatures().map(feature => feature.name);
            const newItems = [];
            pastedItems.forEach(item => {
                newItems.push({ 
                    name: item.name,
                    features: featureNames.map(featureName => {
                        const matchedFeature = item.features.find(f => f.name === featureName) || {}
                        return {
                            name: featureName,
                            value: matchedFeature.value,
                            type: matchedFeature.type,
                        }
                    }),
                    applyPreparationScript: item.applyPreparationScript
                });
            });
            computeAll(newItems, null, () => {
                $scope.bucket = $scope.bucket.concat(angular.copy(newItems));
                $scope.scrollToLastItem = $scope.currentView === $scope.SCORE_VIEW.COMPARE ;
                ActivityIndicator.success(`${newItems.length} item${newItems.length === 1 ? '': 's'} successfully pasted.`);
            });

            WT1.event('interactive-scoring-paste', {
                nbItems: pastedItems.length,
                type: 'comparator'
            });
        }


        // ----- Export

        $scope.exportComparator = function() {
            // We supposed here that each item in the bucket have the same columns (theorically ensure when pasting or adding)
            const featureColumns = $scope.bucket[0].features.map((feature) => ({ name: feature.name, type: $scope.uiState.featuresStorageType[feature.name] || "string" }));
            const nameColumn = {
                name: 'score_name',
                type: 'string'
            };

            let predictionColumns = [];
            if ($scope.isClassification()) {
                predictionColumns = [...$scope.modelData.classes.map(c => ({
                    name: `${scorePrefix}${c}`,
                    type: 'string'
                })), {
                    name: 'prediction',
                    type: 'string'
                }];
            } else if ($scope.isRegression()) {
                predictionColumns = [{
                    name: 'prediction',
                    type: $scope.uiState.featuresStorageType[$scope.modelData.coreParams.target_variable]
                }];
            }

            const explanationColumns = [{
                name: 'explanations',
                type: 'string'
            }, {
                name: 'explanation_method',
                type: 'string'
            }];

            // for each bucket, 1) loop through the columns and find the associated value (if it exists)
            // and 2) add prediction information, and 3) explanations if present
            const data = $scope.bucket.map(item => {
                const featureValues = featureColumns.map(column => {
                    const feature = item.features.find(f => f.name === column.name);
                    
                    return feature ? feature.value : null;
                });
                let predictions = [item.score ? item.score.prediction[0] : null];
                // add proba for each class
                if ($scope.isClassification()) {
                    predictions = [...$scope.modelData.classes.map(c => item.score ? item.score[`${scorePrefix}${c}`] : null), ...predictions];
                }

                let values = [...featureValues, item.name, ...predictions]
                if ($scope.getExplanationIncompatibility() == null) {
                    const listOfExplanations = item.explanation.map(f => { return { [f.feature]: f.value }});
                    const explanationsStr = JSON.stringify(Object.assign({}, ...listOfExplanations));
                    values = [...values, explanationsStr, $scope.explanationParams.method]
                }
            
                return values;
            });
            
            let columns = [...featureColumns, nameColumn, ...predictionColumns];
            if ($scope.getExplanationIncompatibility() == null) {
                columns = [...columns, ...explanationColumns ]
            }

            ExportUtils.exportUIData($scope, {
                name : "Interactive scoring for model: " + $scope.modelData.userMeta.name,
                columns, 
                data : data
            }, 'Export Interactive Scoring');

            WT1.event('interactive-scoring-export-button', {
                explanationMethod: $scope.explanationParams.method,
                nbItems: data.length
            });
        }


        // ----- Backend handling and computing

        function startBackend() {
            return new Promise(function(resolve) {
                DataikuAPI.interactiveModel.startBackend(fullModelId).success(function(initialResponse) {
                    SpinnerService.lockOnPromise(FutureWatcher.watchJobId(initialResponse.jobId)
                        .success(function() {
                            resolve();
                        }).error(setErrorInScope.bind($scope)));
                }).error(setErrorInScope.bind($scope));
            });
        }

        async function startBackendIfNeeded() {
            const isBackendRunning = (await DataikuAPI.interactiveModel.backendStatus(fullModelId)).data;
            if (!isBackendRunning) {
                return await startBackend();
            }
        };

        function canCompute() {
            return !($scope.uiState.applyPreparationScript && $scope.uiState.couldNotRetrieveSchema) 
                && !$scope.allFeaturesEmpty();
        }

        function compute(actionFn, params, taskType, callback) {
            if (!$scope.computing[taskType]) {
                $scope.computing[taskType] = true;
                $scope.errors[taskType] = null;
                nextTask[taskType] = null;
                actionFn(params).noSpinner().success(function(data) {
                    if (nextTask[taskType]) { // if task was set during compute
                        $scope.computing[taskType] = false;
                        compute(actionFn, nextTask[taskType], taskType, callback);
                    } else {
                        callback(data);
                        $scope.computing[taskType] = false;
                    }
                }).error((error) => {
                    $scope.computing[taskType] = false;
                    if (nextTask[taskType]) { // if task was set during compute
                        compute(actionFn, nextTask[taskType], taskType, callback);
                    } else {
                        $scope.errors[taskType] = error;
                    }
                });
            } else {
                nextTask[taskType] = $scope.uiState;
            }
        };

        function computeScore() {
            const promiseFn = function(params) {
                return DataikuAPI.interactiveModel.computeScore(fullModelId, 
                    formatFeaturesParams([getFeaturesFromUiState(params)]),
                    params.applyPreparationScript);
            };

            return compute(promiseFn, $scope.uiState, "SCORE", (data) => {
                if ($scope.allFeaturesEmpty()) { // features way have been disabled during compute
                    $scope.score = null;
                } else {
                    $scope.score = data.scores[0];
                    generateChartData();
                }
            });
        }

        function computeExplanations() {
            const promiseFn = function(params) {
                return DataikuAPI.interactiveModel.computeExplanations(fullModelId,
                    formatFeaturesParams([getFeaturesFromUiState(params)]),
                    $scope.explanationParams.method, 
                    $scope.explanationParams.nbExplanations,
                    params.applyPreparationScript);
            };

            return compute(promiseFn, $scope.uiState, "EXPLANATION", function(data) {
                const allExplanations = sortAndFormatExplanations(data.explanations)
                if ($scope.allFeaturesEmpty()) { // features way have been disabled during compute
                    $scope.explanations = null;
                } else {
                    $scope.explanations = allExplanations.length ? allExplanations[0] : [];
                }
                $scope.outdatedExplanations = false;
            });
        }

        async function computeAll(bucketItems, currentFeatures, callback) {
            await startBackendIfNeeded();
            const allFeatures = bucketItems.map(item => item.features);
            if (currentFeatures) {
                allFeatures.push(currentFeatures);
            }
            const featuresParams = formatFeaturesParams(allFeatures);
            let computePromise;
            if ($scope.getExplanationIncompatibility()) {
                computePromise = DataikuAPI.interactiveModel.computeScore(fullModelId, 
                    featuresParams,
                    $scope.uiState.applyPreparationScript);
            } else {
                computePromise = DataikuAPI.interactiveModel.computeExplanations(fullModelId,
                    featuresParams,
                    $scope.explanationParams.method,
                    $scope.explanationParams.nbExplanations,
                    $scope.uiState.applyPreparationScript)
            }
            computePromise.success((results) => {
                const scores = results.scores;
                let explanations;
                if (results.explanations) {
                    explanations = sortAndFormatExplanations(results.explanations)
                }
                if (currentFeatures) {
                    $scope.score = scores.pop();
                    $scope.explanations = explanations ? explanations.pop() : null;
                }
                bucketItems.forEach((item, index) => {
                    item.explanation = explanations ? explanations[index] : null;
                    item.score = scores[index];
                });
                if (callback) {
                    callback();
                }
            }).catch(setErrorInScope.bind($scope));
        }

        $scope.onExplanationParamsChange = async function() {
            localStorageService.set(LOCAL_STORAGE_EXPLANATION_PARAMS_KEY, $scope.explanationParams);
            computeAll($scope.bucket, $scope.getFeatures());

            $scope.sendBasicWT1Event();
        };

        $scope.sendBasicWT1Event = function() {
            WT1.event('interactive-scoring', {
                explanationParams: $scope.explanationParams,
                applyPreparationScript: $scope.uiState.applyPreparationScript
            })
        };

        $scope.onFeatureChange = Debounce().withDelay(200, 200).withScope($scope).wrap(onFeatureChange);	
        const computeScoreDebounced = Debounce().withDelay(200, 200).withScope($scope).wrap(computeScore);	
        const computeExplanationsDebounced = Debounce().withDelay(1000, 1000).withScope($scope).wrap(computeExplanations);

        function onFeatureChange() {
            if ($scope.allFeaturesEmpty()) {
                $scope.score = null;
                $scope.explanations = null;
            } else {
                $scope.outdatedExplanations = true;
                if (canCompute()) {
                    computeFeature(true);
                }
            }
        };

        async function computeFeature(withDebounce) {
            await startBackendIfNeeded();
            if (withDebounce) {
                computeScoreDebounced();
                if (!$scope.getExplanationIncompatibility()) {
                    computeExplanationsDebounced();
                }
            } else {
                computeScore();
                if (!$scope.getExplanationIncompatibility()) {
                    computeExplanations();
                }       
            }
        }
    });

})();
