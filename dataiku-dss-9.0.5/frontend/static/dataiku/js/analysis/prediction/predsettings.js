(function(){
'use strict';

let app = angular.module('dataiku.analysis.mlcore');

app.service('PMLSettings', function(Fn) {
    var cst = {
        taskF: function(backend){ return {
            bcEvaluationMetrics: function(backend){
                var base = [
                    ["F1", "F1 Score"],
                    ["ACCURACY", "Accuracy"],
                    ["PRECISION", "Precision"],
                    ["RECALL", "Recall"],
                    ["COST_MATRIX", "Cost matrix"],
                    ["ROC_AUC", "AUC"],
                    ["LOG_LOSS", "Log Loss"],
                    ["CUMULATIVE_LIFT", "Cumulative lift"]
                ];
                if(backend == "PY_MEMORY" || backend == "KERAS"){
                    base.push(["CUSTOM", "Custom code"]);
                }
                return base;
            }(backend),
            mcEvaluationMetrics: function(backend){
                var base = [
                    ["F1", "F1 Score"],
                    ["ACCURACY", "Accuracy"],
                    ["PRECISION", "Precision"],
                    ["RECALL", "Recall"],
                    ["ROC_AUC", "AUC"],
                    ["LOG_LOSS", "Log Loss"]
                ];
                if(backend == "PY_MEMORY" || backend == "KERAS"){
                    base.push(["CUSTOM", "Custom code"]);
                }
                return base;
            }(backend),
            regressionEvaluationMetrics: function(backend){
                var base = [
                    ["EVS", "Explained Variance Score"],
                    ["MAPE", "Mean Absolute Percentage Error"],
                    ["MAE", "Mean Absolute Error"],
                    ["MSE", "Mean Squared Error"],
                    ["RMSE", "Root Mean Square Error"],
                    ["RMSLE", "Root Mean Square Logarithmic Error"],
                    ["R2", "R2 Score"]
                ];
                if(backend == "PY_MEMORY" || backend == "KERAS"){
                    base.push(["CUSTOM", "Custom code"]);
                }
                return base;
            }(backend),
            crossvalModesRandom: function(backend){
                var base = [
                    ["SHUFFLE", "Simple train/validation split"],
                    ["KFOLD", "K-fold"]
                ]
                if(backend == "PY_MEMORY"){
                    base.push(["CUSTOM", "Custom code"]);
                }
                return base;
            }(backend),
            getCrossvalModesRandomForDocumentation(crossValidationStrategy, mlTaskDesign) {
                let crossvalModeDoc;

                switch (crossValidationStrategy) {
                    case 'SHUFFLE': 
                        crossvalModeDoc = 'Simple train/validation split';
                    break;

                    case 'KFOLD':
                        crossvalModeDoc = `${mlTaskDesign.modeling.gridSearchParams.nFolds}-fold cross-validation`;
                    break;

                    case 'CUSTOM':
                        crossvalModeDoc = 'Custom Code';
                    break;
                }

                return crossvalModeDoc;
            },
            crossvalModesWithTime: [["TIME_SERIES_SINGLE_SPLIT", "Time-based train/validation split"],
                                    ["TIME_SERIES_KFOLD", "Time-based K-fold (with overlap)"],
                                    ["CUSTOM", "Custom code"]],
            getCrossvalModesWithTimeForDocumentation(crossValidationStrategy, mlTaskDesign) {
                let crossvalModeDoc;

                switch (crossValidationStrategy) {
                    case 'TIME_SERIES_SINGLE_SPLIT': 
                        crossvalModeDoc = 'Simple train/validation split';
                    break;

                    case 'TIME_SERIES_KFOLD':
                        crossvalModeDoc = `Time-based ${mlTaskDesign.modeling.gridSearchParams.nFolds}-fold (with overlap)`;
                    break;

                    case 'CUSTOM':
                        crossvalModeDoc = 'Custom code';
                    break;
                }

                return crossvalModeDoc;
            }
        }}, task: {
            predictionTypes: [
                ["BINARY_CLASSIFICATION", "Two-class classification"],
                ["MULTICLASS", "Multiclass classification"],
                ["REGRESSION", "Regression"]
            ],
            thresholdOptimizationMetrics: [
                ["F1", "F1 Score"],
                ["ACCURACY", "Accuracy"],
                ["COST_MATRIX", "Cost matrix"]
            ],
            trainTestPolicies: [
                ["SPLIT_MAIN_DATASET", "Split the dataset"],
                ["EXPLICIT_FILTERING_SINGLE_DATASET_MAIN", "Explicit extracts from the dataset"],
                ["EXPLICIT_FILTERING_TWO_DATASETS", "Explicit extracts from two datasets"],
                ["SPLIT_OTHER_DATASET", "Split another dataset"],
                ["EXPLICIT_FILTERING_SINGLE_DATASET_OTHER", "Explicit extracts from another dataset"],
                //["FIXED_ID_BASED", "Use fixed identifiers from two datasets"]
            ],
            trainTestPoliciesDesc: function(inputDatasetSmartName) { return [
                "Split a subset of "+inputDatasetSmartName,
                "Use two extracts from "+inputDatasetSmartName+", one for train, one for test",
                "Use two extracts from two different datasets, one for train, one for test",
                "Split a subset of another dataset, compatible with "+inputDatasetSmartName,
                "Use two extracts from another dataset, one for train, one for test",
            ]},
            splitModes: [ ["RANDOM", "Randomly"],
                          ["SORTED", "Based on time variable"]]
        }, names: {
            evaluationMetrics: {
                PRECISION: "Precision",
                RECALL: "Recall",
                F1: "F1 Score",
                ACCURACY: "Accuracy",
                EVS : "EVS",
                MAPE : "MAPE",
                MAE : "MAE",
                MSE : "MSE",
                RMSE: "RMSE",
                RMSLE: "RMSLE",
                R2: "R2 Score",
                PEARSON: "Correlation",
                COST_MATRIX: "Cost Matrix Gain",
                LOG_LOSS: "Log Loss",
                ROC_AUC: "ROC AUC",
                CUSTOM: "Custom score",
                CALIBRATION_LOSS : "Calibration Loss",
                CUMULATIVE_LIFT : "Lift"
            },
            algorithms: {
                a_lm: "Linear Models",
                b_rf: "Random Forests",
                c_svm: "Support Vector Machines",
                d_sgd: "Stochastic Gradient Descent",
                e_gbm: "Gradient Boosting",
                f_dt: "Decision Tree",
                g_other: "Others"
            }
        }, filter: {
            algorithms: {
                a_lm: ['RIDGE_REGRESSION', 'LASSO_REGRESSION', 'LEASTSQUARE_REGRESSION', 'LOGISTIC_REGRESSION', 'GLM_H2O', 'MLLIB_LOGISTIC_REGRESSION', 'MLLIB_LINEAR_REGRESSION', 'SPARKLING_GLM'],
                b_rf: ['RANDOM_FOREST_REGRESSION', 'RANDOM_FOREST_CLASSIFICATION', 'DISTRIBUTED_RF_H2O', 'MLLIB_RANDOM_FOREST', 'SPARKLING_RF'],
                c_svm: ['SVC_CLASSIFICATION', 'SVM_REGRESSION'],
                d_sgd: ['SGD_CLASSIFICATION', 'SGD_REGRESSION'],
                e_gbm: ['GBM_H2O', 'GBT_CLASSIFICATION', 'GBT_REGRESSION', 'XGBOOST_CLASSIFICATION', 'XGBOOST_REGRESSION', 'SPARKLING_GBM', 'MLLIB_GBT'],
                f_dt: ['DECISION_TREE_CLASSIFICATION', 'MLLIB_DECISION_TREE'],
                g_other: ['SCIKIT_MODEL', 'DEEP_LEARNING_H2O', 'SPARKLING_NB', 'SPARKLING_DEEP_LEARNING', 'MLLIB_NAIVE_BAYES']
            }
        }, sort: {
            lowerBetter: ['MAE', 'MSE', 'RMSE', 'RMSLE', 'LOG_LOSS', 'MAPE', "CALIBRATION_LOSS"]
        }, normalizedMetrics: [ // metrics that are between 0 and 1
            "ROC_AUC", "PRECISION", "RECALL", "F1", "ACCURACY", "EVS", "R2",  "CALIBRATION_LOSS"
        ] ,algorithmCategories : {
            "Linear Models": ['RIDGE_REGRESSION', 'LASSO_REGRESSION', 'LEASTSQUARE_REGRESSION', 'LOGISTIC_REGRESSION', 'GLM_H2O', 'MLLIB_LOGISTIC_REGRESSION', 'MLLIB_LINEAR_REGRESSION', 'SPARKLING_GLM'],
            "Random Forests": ['RANDOM_FOREST_REGRESSION', 'RANDOM_FOREST_CLASSIFICATION', 'DISTRIBUTED_RF_H2O', 'MLLIB_RANDOM_FOREST', 'SPARKLING_RF'],
            "Support Vector Machines": ['SVC_CLASSIFICATION', 'SVM_REGRESSION'],
            "Stochastic Gradient Descent": ['SGD_CLASSIFICATION', 'SGD_REGRESSION'],
            "Gradient Boosting": ['GBM_H2O', 'GBT_CLASSIFICATION', 'GBT_REGRESSION', 'XGBOOST_CLASSIFICATION', 'XGBOOST_REGRESSION', 'SPARKLING_GBM', 'MLLIB_GBT'],
            "Decision Tree": ['DECISION_TREE_CLASSIFICATION', 'MLLIB_DECISION_TREE']
        }, noDollarKey: function(k) {
            return !k.startsWith('$') && k != "_name" && k != "datasetColumnId" && k != "userModified";
        }, isSpecialFeature: function(featParams) {
            // ONLY FOR KERAS (DEEP LEARNING) BACKEND

            if (!featParams || featParams.role === "REJECT") {
                return false;
            }

            var featType = featParams.type;

            if (featType === "TEXT") {

                var handling = featParams.text_handling;
                if (handling === "CUSTOM") {
                    return true;
                }
            }

            if (featType === "IMAGE") {

                var handling = featParams.image_handling;
                if (handling === "CUSTOM") {
                    return true;
                }
            }

            return false;
        }
    };
    cst.sort.lowerIsBetter = function (e, customEvaluationMetricGIB) {
        if (e === "CUSTOM") {
            if (customEvaluationMetricGIB == undefined) {return false;}
            else {return !customEvaluationMetricGIB;}
        }
        return (cst.sort.lowerBetter.indexOf(e) !== -1);
    }

    // Consider that input is "Special" if it contains special features
    // In practice, each special input has its own input
    cst.isSpecialInput = function (inputName, perFeature) {
        if (!inputName || !perFeature) {
            return false;
        }
        return Object.values(perFeature).some(f => f.sendToInput == inputName && cst.isSpecialFeature(f));
    };

    return cst;
});

app.service("PartitionedModelsService", function(PMLSettings, Logger) {

    let cst = {
        getPartitionsSnippetStateSize: (snippetData, ...states) => {
            if (!snippetData || !snippetData.partitions || !snippetData.partitions.states) {
                return 0;
            }
    
            return Object.entries(snippetData.partitions.states)
                .reduce((total, pair) => {
                    const [state, amount] = pair;
                    if (states.includes(state)) {
                        return total + amount;
                    }
                    return total;
                }, 0);
        },
    
        getTotalAmountOfPartitions: (snippetData) => {
            if (!snippetData || !snippetData.partitions || !snippetData.partitions.states) {
                return 0;
            }
    
            return Object.values(snippetData.partitions.states)
                .reduce((total, amount) => total + amount, 0);
        },
    
        getPartitionResultMetricGradient: (snippetData, sortMainMetric, currentMetric) => {
            
            // We are dealing here with sort Metric that may be infinite (i.e. the corresponding metric
            // is undefined)
            if (sortMainMetric === undefined || Math.abs(sortMainMetric) === Number.MAX_VALUE) {
                return "none";
            }
    
            let ratio;
            if (PMLSettings.normalizedMetrics.includes(currentMetric) 
               && !PMLSettings.sort.lowerBetter.includes(currentMetric)) {
                ratio = sortMainMetric;
            } else {
    
                const existingMetricsList = Object.values(snippetData.partitions.summaries)
                                                  .map( summary => summary.snippet.sortMainMetric)
                                                 // Remove infinite values that may have been introduce for sorting purpose
                                                  .filter(m => Math.abs(m) < Number.MAX_VALUE);
                const metricsMax = Math.max(...existingMetricsList);
                const metricsMin = Math.min(...existingMetricsList);                    
                const minRatio = 0.05;
                const maxRatio = 1;
    
                if (metricsMax === metricsMin) {
                    ratio = maxRatio;
                } else {
                    ratio = minRatio + maxRatio * (sortMainMetric - metricsMin) / (metricsMax - metricsMin) 
                }
            }
    
            const greenBaseColor = "#29AF5D";
            return 'linear-gradient(to right, '+ greenBaseColor +' 0%, ' + greenBaseColor + ' '+ (ratio * 100) +'%,rgba(0, 0, 0, 0) '+ (ratio * 100) +'%, rgba(0, 0, 0, 0) 100%)';
        },

        getAggregationExplanation: (metricName, displayName) => {
            switch (metricName) {
                case "ACCURACY":
                case "PRECISION":
                case "RECALL":
                case "F1":
                case "COST_MATRIX":
                case "MCC":
                case "HAMMINGLOSS":
                    return "{0} of the global model, using optimal threshold for each partition.".format(displayName);
                // same as MSE/MAPE/MAE but here the name is displayed in lower case instead
                case "LOG_LOSS":
                    return "Log loss of the global model (equal to the average log loss per partition, weighted by test weight).";
                // same as CUMULATIVE_LIFT/CALIBRATION_LOSS but here the name is displayed in upper case instead
                case "ROC_AUC":
                        return "Average ROC AUC per partition weighted by test weight as an approximation of the true ROC AUC.";
                case "CUMULATIVE_LIFT":
                case "CALIBRATION_LOSS":
                    const displayNameLowerCase = displayName.toLowerCase();
                    return "Average {0} per partition weighted by test weight as an approximation of the true {1}.".format(displayNameLowerCase, displayNameLowerCase);
                case "CUSTOM":
                    return "Average custom score per partition weighted by test weight.\n"
                           + "It may be an approximation of the true custom score depending on the way it has been defined.";
                case "MSE":
                case "MAPE":
                case "MAE":
                        return "{0} of the global model (equal to the average {1} per partition, weighted by test weight).".format(displayName, displayName);
                case "RMSE":
                case "RMSLE":
                case "R2":
                case "EVS":
                case "PEARSON":
                    return "{0} of the global model.".format(displayName);
                default:
                    Logger.error("Metric name is not valid");
            }
        }
    }

    return cst;

});

app.service("BinaryClassificationModelsService", function () {
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
    return {
        findCutData: (modelDataPerf, cutToFind) => {
            let pcd = modelDataPerf && modelDataPerf.perCutData;
            if (!pcd || !pcd.cmg) {
                return;
            }
            // Cut values are rounded because of a 0.025 step increase that led to some numerical discrepencies and bad comparisons
            // See also classification_scoring.py::decision_for_all_cuts_generator()
            const round = v => Math.round(1000 * v) / 1000;
            cutToFind = round(cutToFind);
            let i = 0;
            for (i = 0; i < pcd.cut.length - 1; i++) {
                if (round(pcd.cut[i]) >= cutToFind) {
                    break;
                }
            }
            var tp = pcd.tp[i], tn = pcd.tn[i], fp = pcd.fp[i], fn = pcd.fn[i];
            var actPos = tp + fn;
            var actNeg = tn + fp;
            var predPos = tp + fp;
            var predNeg = tn + fn;
            var eps = 0.01;
            let ret = { // capitalized = will be graphed
                index: i, cut: round(pcd.cut[i]),
                tp: {
                    records: tp,
                    actual: getPercentString(tp / (actPos + eps)),
                    predicted: getPercentString(tp / (predPos + eps))
                },
                tn: {
                    records: tn,
                    actual: getPercentString(tn / (actNeg + eps)),
                    predicted: getPercentString(tn / (predNeg + eps))
                },
                fp: {
                    records: fp,
                    actual: getPercentString(fp / (actNeg + eps)),
                    predicted: getPercentString(fp / (predPos + eps))
                },
                fn: {
                    records: fn,
                    actual: getPercentString(fn / (actPos + eps)),
                    predicted: getPercentString(fn / (predNeg + eps))
                },
                actPos: {records: tp + fn, actual: "100 %"},
                actNeg: {records: tn + fp, actual: "100 %"},
                predPos: {records: tp + fp, predicted: "100 %"},
                predNeg: {records: tn + fn, predicted: "100 %"},
                mcc: pcd.mcc[i], hammingLoss: pcd.hammingLoss[i],
                Precision: pcd.precision[i], Recall: pcd.recall[i],
                "F1-Score": pcd.f1[i], Accuracy: pcd.accuracy[i],
                customScore: (pcd.customScore ? pcd.customScore[i] : null)
            };
            if (pcd.cmg) {
                ret["cmg"] = pcd.cmg[i];
            }
            return ret;
        }
    };
});

app.controller("DeepLearningPMLController", function ($scope, $timeout, $interval, $controller, DataikuAPI, PMLSettings, PMLFilteringService,
                                                      $state, $stateParams, TopNav, Collections, Dialogs, CreateModalFromTemplate, Fn, Logger, $q, CodeBasedEditorUtils) {
    const inputsShown = {};

    function insertCode(codeToInsert) {
        //timeout to make sure of an angular safe apply
        $timeout(function() {
            $scope.cm.replaceSelection(`${codeToInsert}\n`, "around");
        });

        $scope.cm.focus();
    }

    function fillFitCodeKeras() {
        if ($scope.mlTaskDesign.modeling.keras.fitCode === undefined) {
            // language=Python
            const stepsPerEpochCode = $scope.mlTaskDesign.modeling.keras.trainOnAllData ? "" : "                        steps_per_epoch=" + $scope.mlTaskDesign.modeling.keras.stepsPerEpoch + ",\n";
            const fitCode = "# A function that builds train and validation sequences.\n" +
                "# You can define your custom data augmentation based on the original train and validation sequences\n\n" +
                "#   build_train_sequence_with_batch_size        - function that returns train data sequence depending on\n" +
                "#                                                 batch size\n" +
                "#   build_validation_sequence_with_batch_size   - function that returns validation data sequence depending on\n" +
                "#                                                 batch size\n" +
                "def build_sequences(build_train_sequence_with_batch_size, build_validation_sequence_with_batch_size):\n" +
                "    \n" +
                "    batch_size = " + $scope.mlTaskDesign.modeling.keras.batchSize + "\n" +
                "    \n" +
                "    train_sequence = build_train_sequence_with_batch_size(batch_size)\n" +
                "    validation_sequence = build_validation_sequence_with_batch_size(batch_size)\n" +
                "    \n" +
                "    return train_sequence, validation_sequence\n\n\n" +
                "# A function that contains a call to fit a model.\n\n" +
                "#   model                 - compiled model\n" +
                "#   train_sequence        - train data sequence, returned in build_sequence\n" +
                "#   validation_sequence   - validation data sequence, returned in build_sequence\n" +
                "#   base_callbacks        - a list of Dataiku callbacks, that are not to be removed. User callbacks can be added to this list\n" +
                "def fit_model(model, train_sequence, validation_sequence, base_callbacks):\n" +
                "    epochs = " + $scope.mlTaskDesign.modeling.keras.epochs + "\n" +
                "    model.fit_generator(train_sequence,\n" +
                "                        epochs=epochs,\n" +
                stepsPerEpochCode +
                "                        callbacks=base_callbacks,\n" +
                "                        shuffle=" + ($scope.mlTaskDesign.modeling.keras.shuffleData ? "True" : "False") + ")\n";
            $scope.mlTaskDesign.modeling.keras.fitCode = fitCode;
        }
    }

    // Allow transition of Inputs area only on click
    $scope.addEventOnTransition = function() {
        $(".keras-inputs__wrapper").on("transitionend", function() {
            $scope.uiState.canTransition = false;
        })
    };

    $scope.showHideInputs = function() {
        $scope.uiState.canTransition = true;
        $scope.uiState.displayInput = !$scope.uiState.displayInput;
    };

    $scope.startEditInput = function(input) {
        $scope.uiState.currentlyEditing=input;
        $scope.uiState.newEditInputName=input;
    };

    $scope.isBeingEdited = function(input) {
        return $scope.uiState.currentlyEditing === input;
    };

    $scope.editInputIfValid = function() {
        if (!$scope.isValidEditInput()) {
            return;
        }
        var inputIndex = $scope.mlTaskDesign.modeling.keras.kerasInputs.indexOf($scope.uiState.currentlyEditing);
        $scope.mlTaskDesign.modeling.keras.kerasInputs[inputIndex] = $scope.uiState.newEditInputName;

        // Modifying input for each feature in it
        Object.values($scope.mlTaskDesign.preprocessing.per_feature).forEach(function(featParams) {
            if (featParams["sendToInput"] === $scope.uiState.currentlyEditing) {
                featParams["sendToInput"] = $scope.uiState.newEditInputName;
            }
        });

        // Resetting UI variables
        $scope.uiState.currentlyEditing=null;
        $scope.uiState.newEditInputName='';
    };

    $scope.isValidEditInput = function() {
        // Has not change name so far
        if ($scope.uiState.newEditInputName === $scope.uiState.currentlyEditing) {
            return true;
        }
        if ($scope.uiState.newEditInputName === "") {
            return false;
        }
        if ($scope.mlTaskDesign.modeling.keras.kerasInputs.indexOf($scope.uiState.newEditInputName) > -1) {
            return false;
        }
        return true;
    }

    $scope.cancelEditInput = function() {
        // Resetting UI variables
        $scope.uiState.currentlyEditing=null;
        $scope.uiState.newEditInputName='';
    };

    $scope.deleteInput = function(input) {
        Dialogs.confirm($scope, "Delete Deep Learning Input", "Do you want to delete this input ? All its features will be sent to the 'main' input").then(function(data){
            const inputIndex = $scope.mlTaskDesign.modeling.keras.kerasInputs.indexOf(input);
            $scope.mlTaskDesign.modeling.keras.kerasInputs.splice(inputIndex, 1);

            // Sending all features to 'main' input
            Object.values($scope.mlTaskDesign.preprocessing.per_feature).forEach(function (featParams) {
                if (featParams["sendToInput"] === input) {
                    featParams["sendToInput"] = "main";
                }
            });
        });
    };

    $scope.createInputIfValid = function() {
        if (!$scope.isValidNewInput()) {
            return;
        }
        $scope.mlTaskDesign.modeling.keras.kerasInputs.push($scope.uiState.newInputName);
        $scope.uiState.creatingNewInput = false;
        $scope.uiState.newInputName = '';

    };

    $scope.isValidNewInput = function() {
        if (!$scope.uiState.newInputName) {
            return false;
        }
        return $scope.mlTaskDesign.modeling.keras.kerasInputs.indexOf($scope.uiState.newInputName) <= -1;

    };

    $scope.isCreatingInput = function() {
        return $scope.uiState.creatingNewInput;
    };

    $scope.startCreatingInput = function() {
        $scope.uiState.creatingNewInput = true
    };

    $scope.cancelCreateInput = function() {
        $scope.uiState.creatingNewInput = false;
        $scope.uiState.newInputName = '';
    };

    $scope.insertInput = function(input) {

        if (!$scope.isSpecialInput(input)) {
            var code = "input_" + input + " = Input(shape=input_shapes[\""+input+"\"], name=\""+input+"\")";
            insertCode(code);
        } else {


            let deferred = $q.defer();
            let newScope = $scope.$new();
            newScope.input = input;
            newScope.uiState = {processorCodeShown: true};
            newScope.perFeature = $scope.mlTaskDesign.preprocessing.per_feature;

            newScope.insertReadOnlyOptions = $scope.codeMirrorSettingService.get('text/x-python');
            newScope.insertReadOnlyOptions["readOnly"]= "nocursor";
            newScope.insertReadOnlyOptions["lineNumbers"]= false;
            newScope.insertReadOnlyOptions["foldGutter"]= false;

            CreateModalFromTemplate("templates/analysis/prediction/insert-special-input-modal.html",
                newScope,
                null,
                function(scope) {

                    scope.acceptDeferred = deferred;

                    scope.uiState.insertInput = input;
                    scope.uiState.insertFeature = Object.keys(scope.perFeature)
                        .find(featName => scope.perFeature[featName]["sendToInput"] === input);
                    scope.uiState.insertFeatParams = scope.perFeature[scope.uiState.insertFeature];
                    scope.uiState.insertStartInputCode = "input_" + input + " = Input(shape=";
                    scope.uiState.insertEndInputCode = ", name=\""+input+"\")";

                    scope.insertSpecialInput = function () {
                        const inputCode = scope.uiState.insertStartInputCode + scope.uiState.insertInputShape + scope.uiState.insertEndInputCode;
                        scope.acceptDeferred.resolve(inputCode);
                        scope.dismiss();
                    };

                    scope.showHideProcessorCode = function() {
                        scope.uiState.processorCodeShown = !scope.uiState.processorCodeShown;
                    };
                });
            deferred.promise.then(function(inputCode) {
                insertCode(inputCode);
            });
        }
    };

    $scope.showHideInput = function(input) {
        inputsShown[input] = ! inputsShown[input];
    };

    $scope.isShown = function(input) {
        return inputsShown[input];
    };

    $scope.getNumFeatures = function(input) {
        return Object.values($scope.mlTaskDesign.preprocessing.per_feature)
            .filter(function(p) { return p["sendToInput"] === input && p["role"] === "INPUT" ;})
            .length
    };

    $scope.filterFeatures = function(input) {
        return function(feat) {
            return feat.sendToInput === input && feat.role === "INPUT";
        };
    };

    $scope.isSpecialInput = function(input) {
        return $scope.SettingsService.isSpecialInput(input, $scope.mlTaskDesign.preprocessing.per_feature);
    };

    function getSpecialInputType(input) {
        const specialFeature = Object.values($scope.mlTaskDesign.preprocessing.per_feature)
            .find(function(p) { return p["sendToInput"] === input && p["role"] === "INPUT" ;});
        return specialFeature.type;
    }

    $scope.getSpecialInputIcon = function(input) {
        const specialInputType = getSpecialInputType(input);
        let iconClass;
        if (specialInputType === "TEXT") {
            iconClass = "icon-italic";
        } else if (specialInputType === "IMAGE") {
            iconClass = "icon-picture";
        } else {
            iconClass = "";
        }
        return iconClass;
    };

    $scope.isMainInput = function(input) {
        return input === 'main';
    };

    $scope.isEditable = function(input) {
        return (!$scope.isSpecialInput(input) && !$scope.isMainInput(input));
    };

    $scope.getEditTitle = function(input) {
        if ($scope.isMainInput(input)) {
            return "Main input cannot be edited"
        } else if ($scope.isSpecialInput(input)) {
            return "Special input cannot be edited"
        } else {
            return "Edit input"
        }
    };

    $scope.getInsertTitle = function(input) {
        if ($scope.getNumFeatures(input) === 0) {
            return "Empty Input cannot be inserted";
        } else {
            return "Insert";
        }
    };

    $scope.isInsertable = function(input) {
        return $scope.getNumFeatures(input) > 0;
    };

    function getTextNetworkAndAddInput(input, inputInNetworks) {
        let inputVarName = "input_" + input;
        const feature = Object.keys($scope.mlTaskDesign.preprocessing.per_feature)
                              .find(featName => $scope.mlTaskDesign.preprocessing.per_feature[featName]["sendToInput"] === input);
        inputInNetworks.push(inputVarName);
        return "    # This input will receive preprocessed text from '" + feature + "' column\n" +
               "    " + inputVarName + " = Input(shape=(32,), name=\""+input+"\")\n" +
               "    x_" + input + " = Embedding(output_dim=512, input_dim=10000, input_length=32)(input_" + input + ")\n" +
               "    x_" + input + " = Flatten()(x_" + input + ")\n\n";
    }

    $scope.fillBuildCodeKeras = function(keepAndCommentPrevious) {
        if (keepAndCommentPrevious || $scope.mlTaskDesign.modeling.keras.buildCode === undefined) {

            let predictionLine;
            let lossFunction;
            let problemType;
            if ($scope.mlTaskDesign.predictionType === "REGRESSION") {
                predictionLine = "    predictions = Dense(1)(x)";
                lossFunction = "mse";
                problemType = "regression";
            } else {
                predictionLine = "    predictions = Dense(n_classes, activation='softmax')(x)";
                if ($scope.mlTaskDesign.predictionType === "BINARY_CLASSIFICATION") {
                    lossFunction = "binary_crossentropy";
                    problemType = "binary classification";
                } else {
                    lossFunction = "categorical_crossentropy";
                    problemType = "multiclass classification";
                }
            }

            // Retrieve Text special inputs that may have been guessed
            const specialTextInputNames = $scope.mlTaskDesign.modeling.keras.kerasInputs.filter(x => $scope.isSpecialInput(x) && getSpecialInputType(x) === "TEXT");
            const hasSpecialTextInputs = specialTextInputNames.length >= 1;
            const hasMain = $scope.getNumFeatures("main") >= 1;
            const numRealInputs = $scope.mlTaskDesign.modeling.keras.kerasInputs.length - (hasMain ? 0 : 1);
            let actualInputsInNetwork = [];

            let startNetwork = "";
            let lastLayerSoFar;
            if (hasMain || numRealInputs === 0) {
                const mainInputVarName ="input_main";
                startNetwork += '    # This input will receive all the preprocessed features\n' +
                                '    # sent to \'main\'\n' +
                                '    ' + mainInputVarName +' = Input(shape=input_shapes["main"], name="main")\n\n';
                lastLayerSoFar = mainInputVarName;
                actualInputsInNetwork.push(mainInputVarName);
            }
            if (hasSpecialTextInputs) {
                specialTextInputNames.forEach( input => {
                    startNetwork += getTextNetworkAndAddInput(input, actualInputsInNetwork);
                    lastLayerSoFar = "x_" + input;
                });
            }
            if (numRealInputs > 1) {
                const concatLayers = [];
                if (hasMain) {
                    concatLayers.push("input_main");
                }
                specialTextInputNames.forEach( input => {
                    concatLayers.push("x_" + input);
                })
                startNetwork += "    x = concatenate([" + concatLayers.join(", ") + "])\n\n";
                lastLayerSoFar = "x";
            }

            let layerImportLine = "from keras.layers import Input, Dense";
            if (hasSpecialTextInputs) {
                layerImportLine += ", Embedding, Flatten";
            }
            if (numRealInputs > 1) {
                layerImportLine += ", concatenate"
            }

            // language=Python
            let buildCode = layerImportLine + "\n" +
                              "from keras.models import Model\n\n" +
                              "# Define the keras architecture of your model in 'build_model' and return it. Compilation must be done in 'compile_model'.\n" +
                              "#   input_shapes  - dictionary of shapes per input as defined in features handling\n" +
                              "#   n_classes - For classification, number of target classes\n" +
                              "def build_model(input_shapes, n_classes=None):\n\n" +
                              startNetwork +
                              "    x = Dense(64, activation='relu')(" + lastLayerSoFar + ")\n" +
                              "    x = Dense(64, activation='relu')(x)\n" +
                              "\n" +
                              predictionLine + "\n" +
                              "\n" +
                              "    # The 'inputs' parameter of your model must contain the\n" +
                              "    # full list of inputs used in the architecture\n" +
                              "    model = Model(inputs=[" + actualInputsInNetwork.join(", ") + "], outputs=predictions)\n" +
                              "\n" +
                              "    return model\n" +
                              "\n" +
                              "# Compile your model and return it\n" +
                              "#   model   - model defined in 'build_model'\n" +
                              "def compile_model(model):\n" +
                              "    \n" +
                              "    # The loss function depends on the type of problem you solve.\n" +
                              "    # '" + lossFunction + "' is appropriate for a " + problemType + ".\n" +
                              "    model.compile(optimizer='rmsprop',\n" +
                              "                  loss='" + lossFunction + "')\n" +
                              "\n" +
                              "    return model";

            if (keepAndCommentPrevious && $scope.mlTaskDesign.modeling.keras.buildCode) {
                 buildCode = buildCode + "\n\n### PREVIOUS CODE\n" +
                    $scope.mlTaskDesign.modeling.keras.buildCode.replace(/^/gm, '# ');
            }

            $scope.mlTaskDesign.modeling.keras.buildCode = buildCode;
            $scope.saveSettings();
        }
    };

    $scope.switchFitMode = function() {
        if (!$scope.mlTaskDesign.modeling.keras.advancedFitMode) {
            fillFitCodeKeras();
        }
        $scope.mlTaskDesign.modeling.keras.advancedFitMode = !$scope.mlTaskDesign.modeling.keras.advancedFitMode;
    };

    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-python', $scope, true);
    $scope.validateRecipe = function () {
        const deferred = $q.defer();
        try {
            $scope.runningValidation = true;
            DataikuAPI.analysis.pml.validateArchitecture(
                $scope.mlTaskDesign.modeling.keras.buildCode,
                $scope.mlTaskDesign.envSelection,
                $stateParams.projectKey
            ).success(data => {
                $scope.valCtx.showPreRunValidationError = false;
                $scope.valCtx.validationResult = data;
                deferred.resolve(data);
            }).error(setErrorInScope.bind($scope));
        } finally {
            $scope.runningValidation = false;
        }
        return deferred.promise;
    };

    $scope.gotoLine = function(cm, line) {
        if(cm && line>0) {
            var pos = {ch:0,line:line-1};
            cm.scrollIntoView(pos);
            cm.setCursor(pos);
            cm.focus();
        }
    };
    $scope.goToKerasArchitecture = function () {
        $scope.uiState.settingsPane = "keras-build";
        $scope.uiState.viewMode = "sessions";
    };

    $scope.$watch('mlTaskDesign', (nv) => {
        if (nv) {
            $scope.fillBuildCodeKeras();

            // Display Inputs area by default if there are more than one input
            if ($scope.mlTaskDesign && $scope.mlTaskDesign.modeling.keras && $scope.mlTaskDesign.modeling.keras.kerasInputs.length > 1) {
                $scope.uiState.displayInput = true;
            }
        }
    });

    // Required for architecture code validation:
    $scope.valCtx = {};
    $scope.recipe = {type:'python', params: {}}

    // Retrieving list of containers to know if computation will occur on a container or not
    let listContainersWithDefault = null;
    DataikuAPI.containers.listNamesWithDefault($stateParams.projectKey).success(function(data) {
                listContainersWithDefault = data;
    }).error(setErrorInScope.bind($scope));

    $scope.inContainer = function(selectedContainer) {
        if (selectedContainer.containerMode === "NONE" || listContainersWithDefault === null) {
            return false;
        } else if (selectedContainer.containerMode === "INHERIT") {
            return listContainersWithDefault.resolvedInheritValue != null;
        } else {
            return true;
        }
    };


});

app.controller("PMLTaskBaseController", function($scope, $timeout, $interval, $controller, DataikuAPI, PMLSettings, PMLFilteringService,
                                                 $state, $stateParams, TopNav, Collections, Dialogs, CreateModalFromTemplate, Fn, Logger, Debounce,
                                                 $q, CodeMirrorSettingService, Assert, Notification, StringUtils, $rootScope) {
    $scope.MLAPI = DataikuAPI.analysis.pml;
    $scope.FilteringService = PMLFilteringService;
    $scope.SettingsService = PMLSettings;
    $scope.codeMirrorSettingService = CodeMirrorSettingService;
    $scope.sRefPrefix = 'projects.project.analyses.analysis.ml.predmltask';
    $scope.algorithmCategories = PMLSettings.algorithmCategories;

    $scope.isXgboostGpuAllowed = function(){
        return $scope.mlTaskDesign.envSelection.envMode==="EXPLICIT_ENV";
    }

    $scope.isClassification = function(){
        if (!$scope.mlTaskDesign) return false;
        return $scope.mlTaskDesign.predictionType in {"BINARY_CLASSIFICATION":true, "MULTICLASS":true};
    }
    $scope.h2oEnabled = function(){
        if (!$scope.appConfig) return false;
        return $scope.appConfig.h2oEnabled;
    }
    $scope.isRegression = function(){
        if (!$scope.mlTaskDesign) return false;
        return $scope.mlTaskDesign.predictionType == "REGRESSION";
    }
    $scope.isBinaryClassification = function(){
        if (!$scope.mlTaskDesign) return false;
        return $scope.mlTaskDesign.predictionType == "BINARY_CLASSIFICATION";
    }
    $scope.isMulticlass = function(){
        if (!$scope.mlTaskDesign) return false;
        return $scope.mlTaskDesign.predictionType == "MULTICLASS";
    }

    $scope.isMLBackendType = function(mlBackendType){
        if (!$scope.mlTaskDesign) return false;
        return $scope.mlTaskDesign.backendType == mlBackendType;
    };

    $scope.isPythonBased = function(mlBackendType){
        return $scope.isMLBackendType('KERAS') || $scope.isMLBackendType('PY_MEMORY');
    };
    $scope.base_algorithms = {
        PY_MEMORY: [
            {name:'Random Forest', algKey:'random_forest_classification',condition:$scope.isClassification},
            {name:'Random Forest', algKey:'random_forest_regression',condition:$scope.isRegression},

            {name:'Gradient tree boosting', algKey:'gbt_classification',condition:$scope.isClassification},
            {name:'Gradient tree boosting', algKey:'gbt_regression',condition:$scope.isRegression},

            {name:'Logistic Regression', algKey:'logistic_regression',condition:$scope.isClassification},

            {name:'Ordinary Least Squares', algKey:'leastsquare_regression',condition:$scope.isRegression},
            {name:'Ridge Regression', algKey:'ridge_regression',condition:$scope.isRegression},
            {name:'Lasso Regression', algKey:'lasso_regression',condition:$scope.isRegression},

            {name:'XGBoost', algKey:'xgboost_classification',condition:$scope.isClassification, paramsName:'xgboost'},
            {name:'XGBoost', algKey:'xgboost_regression', condition: $scope.isRegression, paramsName:'xgboost'},

            {name:'Decision Tree', algKey:'decision_tree_classification',condition:$scope.isClassification},
            {name:'Decision Tree', algKey:'decision_tree_regression',condition:$scope.isRegression},

            {name:'Support Vector Machine', algKey:'svc_classifier',condition:$scope.isClassification, paramsName:'svc_classifier'},
            {name:'Support Vector Machine', algKey:'svm_regression',condition:$scope.isRegression, paramsName:'svm_regression'},

            {name:'Stochastic Gradient Descent', algKey:'sgd_classifier',condition:$scope.isClassification},
            {name:'Stochastic Gradient Descent', algKey:'sgd_regression',condition:$scope.isRegression},

            {name:'KNN', algKey:'knn'},
            {name:'Extra Random Trees', algKey:'extra_trees'},
            {name:'Neural Network', algKey:'neural_network'},
            {name:'Lasso Path', algKey:'lars_params'},
            {name:'Deep Learning (H2O)', algKey:'deep_learning_h2o',condition:$scope.h2oEnabled},
            {name:'GLM (H2O)',  algKey:'glm_h2o',condition:function(){return $scope.h2oEnabled()&&$scope.isRegression()}},
            {name:'Gradient Boosting (H2O)',  algKey:'gbm_h2o',condition:$scope.h2oEnabled},
            {name:'Random Forest (H2O)',  algKey:'distributed_rf_h2o',condition:$scope.h2oEnabled},
        ],
        MLLIB: [
            {name:'Linear Regression',algKey:'mllib_linreg',condition:$scope.isRegression},
            {name:'Logistic Regression',algKey:'mllib_logit',condition:$scope.isClassification},
            {name:'Decision Tree',algKey:'mllib_dt'},
            {name:'Random Forest',algKey:'mllib_rf'},
            {name:'Gradient tree boosting',algKey:'mllib_gbt',condition:Fn.not($scope.isMulticlass)},
            {name:'Naive Bayes',algKey:'mllib_naive_bayes',condition:$scope.isMulticlass},
        ],
        H2O :[
            {name:'Deep Learning',algKey:'deep_learning_sparkling'},
            {name:'Generalized Linear Model',algKey:'glm_sparkling'},
            {name:'Gradient Boosting',algKey:'gbm_sparkling'},
            {name:'Random Forest',algKey:'rf_sparkling'},
            {name:'Naive Bayes',algKey:'nb_sparkling',condition:$scope.isClassification},
        ],
        KERAS: [
            {name: "Deep Learning with Keras", algKey: "keras"}
        ]
    };

    function enrichBaseAlgorithmsWithPlugins() {
        DataikuAPI.analysis.pml.listCustomPythonAlgos($stateParams.projectKey).success(function(data) {
            // Add custom algorithms from plugins if they are not here
            data.map(alg => {
                return {
                    algKey: alg.pyPredAlgoType,
                    name: alg.desc.meta.label,
                    customInfo: alg,
                    pluginDesc: $rootScope.appConfig.loadedPlugins.find(plugin => plugin.id === alg.ownerPluginId),
                    condition: function() {
                        const regCond = alg.desc.predictionTypes.includes("REGRESSION") && $scope.isRegression();
                        const binCond = alg.desc.predictionTypes.includes("BINARY_CLASSIFICATION") && $scope.isBinaryClassification();
                        const multCond = alg.desc.predictionTypes.includes("MULTICLASS") && $scope.isMulticlass();
                        return regCond || binCond || multCond;
                    }
                }
            }).filter(alg => ! $scope.base_algorithms["PY_MEMORY"].map(_ => _.algKey).includes(alg.algKey))
              .forEach(alg => {
                  // Adding Custom algos to algo list
                  $scope.base_algorithms["PY_MEMORY"].push(alg);

                  // Adding custom algo without sample weights support to dedicated list
                  if (!alg.customInfo.desc.supportsSampleWeights) {
                      $scope.algosWithoutWeightSupport.add(alg.algKey);
                  }
              });
        }).error(setErrorInScope.bind($scope));
    }

    $scope.algosWithoutWeightSupport = new Set(['lasso_regression', 'knn', 'neural_network', 'lars_params']);

    enrichBaseAlgorithmsWithPlugins();

    $scope.$watch("mlTaskDesign.backendType", function (nv, ov) {
        if (nv) {
            if (nv !== ov && nv === 'KERAS') {
                $controller("DeepLearningPMLController", {$scope: $scope});
            }
        }
    }, true);

    $controller("_MLTaskBaseController",{$scope:$scope});

    $scope.beforeUpdateSettingsCallback = function(settings) {
        $scope.fillUISplitParams(settings.splitParams);
    };

    $scope.onChangePredictionType = function(){
        if ($scope.dirtySettings()) {
            $scope.saveSettings();
        }
        CreateModalFromTemplate("/templates/analysis/prediction/change-target-or-type-modal.html", $scope, null, function(newScope) {
            newScope.newType = $scope.uiState.predictionType;
            // allows to retrieve the old prediction type if the modal is exited by clicking outside of it
            $scope.uiState.predictionType = $scope.mlTaskDesign.predictionType;
            newScope.change = "prediction type";
            newScope.loseMetrics = true;
            newScope.loseAssertions = true;
            newScope.loseAlgo = $scope.mlTaskDesign.backendType !== "KERAS"
                                && ((newScope.newType === "REGRESSION") !== $scope.isRegression());
            newScope.loseArchitecture = $scope.mlTaskDesign.backendType === "KERAS";
            newScope.loseWeight = ($scope.mlTaskDesign.weight.weightMethod === "CLASS_WEIGHT" || $scope.mlTaskDesign.weight.weightMethod === "CLASS_AND_SAMPLE_WEIGHT")
                                                    && newScope.loseAlgo;
            newScope.confirm = function(redetect) {
                DataikuAPI.analysis.pml.reguessWithType($stateParams.projectKey, $stateParams.analysisId,
                    $stateParams.mlTaskId, newScope.newType, redetect).then(function(response){
                        $scope.setMlTaskDesign(response.data);
                        $scope.uiState.predictionType = $scope.mlTaskDesign.predictionType;

                        if ($scope.mlTaskDesign.backendType === "KERAS") {
                            $scope.fillBuildCodeKeras(true);
                        }
                        $scope.saveSettings();
                        $scope.uiState.algorithm = $scope.base_algorithms[$scope.mlTaskDesign.backendType]
                            .find(_ => !_.condition || _.condition()).algKey;
                        $scope.customCodeSnippetCategories = [$scope.isRegression() ? "py-regressor" : "py-classifier"];
                }, setErrorInScope.bind($scope));
                newScope.dismiss();
            };
            newScope.cancel = function() {
                $scope.uiState.predictionType = $scope.mlTaskDesign.predictionType;
                newScope.dismiss();
            };
        });
    };

    $scope.onChangeTargetFeature = function() {
        if ($scope.dirtySettings()) {
            $scope.saveSettings();
        }
        CreateModalFromTemplate("/templates/analysis/prediction/change-target-or-type-modal.html", $scope, null, function(newScope) {
            newScope.targetVariable = $scope.uiState.targetVariable;
            // allows to retrieve the old target variable if the modal is exited by clicking outside of it
            $scope.uiState.targetVariable = $scope.mlTaskDesign.targetVariable;
            newScope.renameMLTask = true;
            newScope.loseAssertions = true;
            newScope.change = "target";
            newScope.loseWeight = $scope.mlTaskDesign.weight.sampleWeightVariable === newScope.targetVariable;
            newScope.loseArchitecture = $scope.mlTaskDesign.backendType === "KERAS";
            newScope.oldName = $scope.mlTaskDesign.targetVariable;
            newScope.newName = StringUtils.transmogrify("Predict " + newScope.targetVariable,
                                                        $scope.mlTasksContext.analysisMLTasks.map(_ => _.name));
            newScope.confirm = function(redetect) {
                DataikuAPI.analysis.pml.reguessWithTarget($stateParams.projectKey, $stateParams.analysisId,
                    $stateParams.mlTaskId, newScope.targetVariable, redetect).then(function(response){
                        $scope.setMlTaskDesign(response.data);
                        if (newScope.renameMLTask) {
                            $scope.mlTaskDesign.name = newScope.newName;

                        }
                        if ($scope.mlTaskDesign.backendType === "KERAS") {
                            $scope.fillBuildCodeKeras(true);
                        }
                        $scope.saveSettings();
                        $scope.uiState.targetVariable = $scope.mlTaskDesign.targetVariable;
                        $scope.uiState.algorithm = $scope.base_algorithms[$scope.mlTaskDesign.backendType]
                            .find(_ => !_.condition || _.condition()).algKey;
                    $scope.customCodeSnippetCategories = [$scope.isRegression() ? "py-regressor" : "py-classifier"];
                }, setErrorInScope.bind($scope));
                newScope.dismiss();
            };
            newScope.cancel = function() {
                $scope.uiState.targetVariable = $scope.mlTaskDesign.targetVariable;
                newScope.dismiss();
            };
        });
    };
    $scope.checkSplitParams = function(splitParams, checkSingle) {
        if (!splitParams) {
            throw new Error('No split params');
        }
        var error = null;
        if (splitParams.ttPolicy === 'EXPLICIT_FILTERING_TWO_DATASETS') {
            if (!splitParams.eftdTest || !splitParams.eftdTest.datasetSmartName) {
                error = 'No test dataset specified.';
            }
            if (!splitParams.eftdTrain || !splitParams.eftdTrain.datasetSmartName) {
                error = error ? 'No train nor test dataset specified.' : 'No train dataset specified.';
            }
        } else if (checkSingle) { // not in settings, so EFSD_MAIN / SPLIT_MAIN should have filled the dataset
            if (    ('ssdDatasetSmartName' in splitParams && !splitParams.ssdDatasetSmartName)
                 || ('efsdDatasetSmartName' in splitParams && !splitParams.efsdDatasetSmartName)) {
                error = 'No dataset specified.';
            }
        } else if ( ($scope.uiSplitParams.policy === "SPLIT_OTHER_DATASET" && !splitParams.ssdDatasetSmartName)
                    || ($scope.uiSplitParams.policy === "EXPLICIT_FILTERING_SINGLE_DATASET_OTHER" && !splitParams.efsdDatasetSmartName)) {
            error = 'No dataset specified.';    // in settings + in explicit dataset
        }
        if (error) {
            Dialogs.ack($scope, 'Incorrect Train/Test settings', error);
            return false;
        }
        return true;
    };
    $scope.dumpUISplitParams = function(){
        const sp = $scope.mlTaskDesign.splitParams;
        if (!sp) {
            throw new Error('No split params');
        }
        if ($scope.uiSplitParams.policy == "SPLIT_MAIN_DATASET") {
            sp.ttPolicy = "SPLIT_SINGLE_DATASET";
            sp.ssdDatasetSmartName = null;
        } else if ($scope.uiSplitParams.policy == "SPLIT_OTHER_DATASET") {
            sp.ttPolicy = "SPLIT_SINGLE_DATASET";
        } else if ($scope.uiSplitParams.policy == "EXPLICIT_FILTERING_SINGLE_DATASET_MAIN") {
            sp.ttPolicy = "EXPLICIT_FILTERING_SINGLE_DATASET";
            sp.efsdDatasetSmartName = null;
        } else if ($scope.uiSplitParams.policy == "EXPLICIT_FILTERING_SINGLE_DATASET_OTHER") {
            sp.ttPolicy = "EXPLICIT_FILTERING_SINGLE_DATASET";
        } else {
            sp.ttPolicy = $scope.uiSplitParams.policy;
        }
        Logger.info("DUMP UI SPLIT", sp, $scope.uiSplitParams);
    };
    $scope.saveSettings = function() {
        Assert.inScope($scope, "mlTaskDesign");
        $scope.dumpUISplitParams();

        return DataikuAPI.analysis.pml.saveSettings($stateParams.projectKey, $stateParams.analysisId, $scope.mlTaskDesign)
            .success(function(data){
                resetErrorInScope($scope);
                $scope.savedSettings = dkuDeepCopy($scope.mlTaskDesign, PMLSettings.noDollarKey);
                $scope.listMLTasks();
            }).error(setErrorInScope.bind($scope));
    };

    $scope.newTrainSessionModalDisplayed = false;

    $scope.onTrainModalResolution = function() {
        $scope.newTrainSessionModalDisplayed = false;
        $scope.uiState.$userRequestedState = false;
        $scope.initialRefreshAndAutoRefresh();
        if ($state.current.name !== $scope.sRefPrefix + '.list.results') {
            $state.go($scope.sRefPrefix + '.list.results');
        } else {
            $scope.uiState.viewMode = "sessions";
        }
    };

    function newTrainSessionCallback() {
        return DataikuAPI.analysis.pml.getUpdatedSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).then(function(response){
            if ($scope.checkSplitParams(response.data.splitParams, true)) {
                DataikuAPI.analysis.pml.saveSettings($stateParams.projectKey, $stateParams.analysisId, response.data).success(function(data){
                    $scope.savedSettings = dkuDeepCopy($scope.mlTaskDesign, PMLSettings.noDollarKey);
                    if (!$scope.newTrainSessionModalDisplayed) {
                        $scope.newTrainSessionModalDisplayed = true;
                        CreateModalFromTemplate("/templates/analysis/prediction/pre-train-modal.html", $scope, "PMLTaskPreTrainModal").then(function() {
                            $scope.onTrainModalResolution();
                        }, function(){
                            $scope.newTrainSessionModalDisplayed = false;
                        });
                    }
                }).error(setErrorInScope.bind($scope));
            }
        },setErrorInScope.bind($scope));
    }
    $scope.newTrainSession = function() {
        if ($scope.dirtySettings()) { $scope.saveSettings().then(newTrainSessionCallback) }
        else { newTrainSessionCallback() }
    };

    $scope.uiSplitParams = {};

    // watchers & init

    DataikuAPI.analysis.mlcommon.getLastPreprocessingStatus($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId)
        .success(function(data){ $scope.lastPreprocessingStatus = data; })
        .error(setErrorInScope.bind($scope));

    $scope.fillUISplitParams = function(splitParams) {
        if (!splitParams) {
            throw new Error('No split params');
        }
        if (splitParams.ttPolicy == 'SPLIT_SINGLE_DATASET') {
            if (splitParams.ssdDatasetSmartName == null) {
                $scope.uiSplitParams.policy = "SPLIT_MAIN_DATASET";
            } else {
                $scope.uiSplitParams.policy = "SPLIT_OTHER_DATASET";
            }
        } else if (splitParams.ttPolicy == "EXPLICIT_FILTERING_SINGLE_DATASET") {
            if (splitParams.efsdDatasetSmartName == null) {
                $scope.uiSplitParams.policy = "EXPLICIT_FILTERING_SINGLE_DATASET_MAIN";
            } else {
                $scope.uiSplitParams.policy = "EXPLICIT_FILTERING_SINGLE_DATASET_OTHER";
            }
        } else {
            $scope.uiSplitParams.policy = splitParams.ttPolicy;
        }
    };

    // to be run if not guessing
    $scope.initMlTaskDesign = function() {
        $scope.$watch("analysisCoreParams", function(nv, ov) {
            if (!nv) return;
            DataikuAPI.analysis.pml.getUpdatedSettings($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data){
                $scope.setMlTaskDesign(data);
                
                DataikuAPI.analysis.pml.listGuessPolicies().success(data => {
                    $scope.guessPolicies = data.auto.concat(data.expert).filter(policy => ![
                        'ALGORITHMS', // useless (choose from all)
                        'DEEP' // incompatible interface
                    ].includes(policy.id));
                    $scope.guessPolicies = $scope.prepareGuessPolicies($scope.guessPolicies);
                }).error(setErrorInScope.bind($scope));    

                $scope.savedSettings = dkuDeepCopy($scope.mlTaskDesign, PMLSettings.noDollarKey);
                if (data.backendType in $scope.base_algorithms) {
                    $scope.uiState.algorithm = $scope.base_algorithms[data.backendType]
                        .filter(function (o) {
                            return (!o.condition || o.condition())
                        })[0].algKey;
                    $scope.fillUISplitParams($scope.mlTaskDesign.splitParams);
                    $scope.customCodeSnippetCategories = [$scope.isRegression() ? "py-regressor" : "py-classifier"];
                }
            }).error(setErrorInScope.bind($scope));
        });
    }

    // Weighting strategy
    $scope.setWeightOptions = function(){
        if($scope.isRegression()) {
            $scope.uiState.weightMethods = [['NO_WEIGHTING', 'No weighting'],
                                            ['SAMPLE_WEIGHT', 'Sample weights']];
        } else {
          $scope.uiState.weightMethods = [['NO_WEIGHTING', 'No weighting'],
                                          ['SAMPLE_WEIGHT', 'Sample weights'],
                                          ['CLASS_WEIGHT', 'Class weights'],
                                          ['CLASS_AND_SAMPLE_WEIGHT', 'Class and sample weights'],
                                        ];
        }
    }

    $scope.$watch('mlTaskDesign.predictionType', (nv) => {
        if (nv) {
            $scope.setWeightOptions();
        }
    });

    $scope.$watch('mlTaskDesign.partitionedModel', Debounce().withScope($scope).withDelay(300, 300).wrap((nv, ov) => {
        if (nv) {
            if (nv.enabled) {
                const sampleSelection = $scope.mlTaskDesign.splitParams.ssdSelection;
                const partitionSelection = nv.ssdSelection;

                const partitionModelSettings = {
                    partitionSelectionMethod: partitionSelection.partitionSelectionMethod,
                    selectedPartitions: partitionSelection.selectedPartitions,
                    latestPartitionsN: partitionSelection.latestPartitionsN
                }
    
                // set sample partition method to partition model partition method
                Object.assign(sampleSelection, partitionModelSettings);
            } else if (ov && ov.enabled && !nv.enabled) {
                // partitioned models unchecked
                $scope.mlTaskDesign.splitParams.ssdSelection.partitionSelectionMethod = 'ALL';
            }
        } 
    }), true)

    $scope.onChangeWeightMethod = function() {
      if($scope.uiState.weightMethod==="NO_WEIGHTING" || $scope.uiState.weightMethod==="CLASS_WEIGHT"){
          // free previous weight variable by setting its role as INPUT
          if($scope.mlTaskDesign.weight.sampleWeightVariable) {
              if ($scope.mlTaskDesign.preprocessing.per_feature[$scope.mlTaskDesign.weight.sampleWeightVariable]) {
                  $scope.mlTaskDesign.preprocessing.per_feature[$scope.mlTaskDesign.weight.sampleWeightVariable].role = "INPUT";
              }
          }
          // reinitialize the weight variable params in UI and mlTaskDesign
          $scope.uiState.sampleWeightVariable = null;
          $scope.mlTaskDesign.weight.sampleWeightVariable = null;
      }
      $scope.mlTaskDesign.weight.weightMethod = $scope.uiState.weightMethod;
      $scope.saveSettings();
    };

    $scope.onChangeSampleWeightVariable = function() {
        if($scope.uiState.sampleWeightVariable){
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/analysis/prediction/change-weight-modal.html", $scope, null, function(newScope) {
                newScope.deferred = deferred;
                newScope.confirm = function() {
                    // free previous weight variable by setting its role as INPUT
                    if($scope.mlTaskDesign.weight.sampleWeightVariable){
                        if ($scope.mlTaskDesign.preprocessing.per_feature[$scope.mlTaskDesign.weight.sampleWeightVariable]) {
                            $scope.mlTaskDesign.preprocessing.per_feature[$scope.mlTaskDesign.weight.sampleWeightVariable].role = "INPUT";
                        }
                    }
                    $scope.mlTaskDesign.weight.sampleWeightVariable = $scope.uiState.sampleWeightVariable;
                    let featureData = $scope.mlTaskDesign.preprocessing.per_feature[$scope.uiState.sampleWeightVariable];
                    featureData.role = "WEIGHT";
                    if (featureData.type != "NUMERIC") {
                        featureData.missing_handling = "IMPUTE";
                        featureData.missing_impute_with = "MEAN";
                        featureData.numerical_handling = "REGULAR";
                        featureData.rescaling = "AVGSTD";
                        featureData.type = "NUMERIC";
                    }
                    $scope.saveSettings();
                    newScope.deferred.resolve("changed")
                    newScope.dismiss();
                };
                newScope.cancel = function() {
                    newScope.deferred.reject("cancelled")
                    newScope.dismiss();
                };
                newScope.$on("$destroy",function() {
                    if(newScope.deferred) {
                        newScope.deferred.reject("destroyed");
                    }
                    newScope.deferred = null;
                });
            });
            deferred.promise.then(function(a) {
                // nothing to do here
            }, function(a) {
                // reset the UI weight variable to the saved weight variable
                $scope.uiState.sampleWeightVariable = $scope.mlTaskDesign.weight.sampleWeightVariable;
            });
        }
    };

    $scope.isSampleWeightEnabled = function() {
        var weightMethod = $scope.mlTaskDesign.weight.weightMethod;
        return weightMethod=='SAMPLE_WEIGHT' || weightMethod=='CLASS_AND_SAMPLE_WEIGHT';
    }

    $scope.potentialWeightFeatures = function() {
        var per_feature = $scope.mlTaskDesign.preprocessing.per_feature;
        return Object.keys(per_feature).filter(x=>per_feature[x].role!=="TARGET");
    }

    $scope.uiState.calibrationMethods = [['NO_CALIBRATION', 'None'], ['SIGMOID', 'Sigmoid (Platt scaling)'], ['ISOTONIC', 'Isotonic Regression']];

    $scope.isCalibrationEnabled = function() {
        return $scope.mlTaskDesign.calibration.calibrationMethod!='NO_CALIBRATION';
    }

    //Time-based Ordering
    $scope.uiState.gsModes = [['TIME_SERIES_SINGLE_SPLIT', 'Time-based train/validation split'], ['TIME_SERIES_KFOLD', 'Time-based K-fold (with overlap)']];

    $scope.isTimeOrderingEnabled = function() {
        return !!$scope.mlTaskDesign.time && $scope.mlTaskDesign.time.enabled;
    };

    $scope.isTimeVariable = function(feature) {
        return !!$scope.mlTaskDesign.time && $scope.mlTaskDesign.time.enabled && $scope.mlTaskDesign.time.timeVariable == feature._name;
    };

});


app.controller("PMLTaskResultController", function($scope, $timeout, $controller, DataikuAPI, PMLSettings, PMLFilteringService,
            $state, $stateParams, TopNav, Collections, Dialogs, CreateModalFromTemplate, Fn, Logger, WT1, FutureWatcher, $q) {

    angular.extend($scope, PMLSettings.taskF($scope.mlTasksContext.activeMLTask.backendType));
    angular.extend($scope, PMLSettings.task);
    $scope.metricMap = PMLFilteringService.metricMap;
    $controller("_MLTaskResultsController",{$scope:$scope});

    let tensorboardUrls = {};
    $scope.getTensorboardUrl = function(sessionId) {
        if (sessionId in tensorboardUrls) {
            return tensorboardUrls[sessionId];
        }
        tensorboardUrls[sessionId] = null;
        let webAppId = `TENSORBOARD_${$scope.analysisCoreParams.projectKey}-${$stateParams.analysisId}-${$stateParams.mlTaskId}-${sessionId}`
        DataikuAPI.webapps.getBackendUrl($scope.analysisCoreParams.projectKey, webAppId, null).success(function(data) {
            $timeout(function() {
                tensorboardUrls[sessionId] = data.location;
            });
        }).error(setErrorInScope.bind($scope));
        return null;
    };
    $scope.canShowTensorboard = function () {
        return $scope.sessionTask.backendType === 'KERAS';
    };

    $scope.$watch('sessionTask', (nv) => {
        if (nv) {
            if (nv.tensorboardStatus === undefined) {
                nv.tensorboardStatus = {
                    isShown: false,
                    isBackendReady: false,
                    isFrontendReady: false,
                    showIfFrontIsNotReady: false,
                    fullScreen: false
                };
            } else {
                nv.tensorboardStatus.isFrontendReady = false;
                nv.tensorboardStatus.showIfFrontIsNotReady = true;
            }
        }
    });

    $scope.showHideTensorboard = function () {
        $scope.sessionTask.tensorboardStatus.showIfFrontIsNotReady = false;
        $scope.sessionTask.tensorboardStatus.fullScreen = false;
        $scope.sessionTask.tensorboardStatus.isBackendReady = false;
        $scope.sessionTask.tensorboardStatus.isFrontendReady = false;
        $scope.sessionTask.tensorboardStatus.isShown = !$scope.sessionTask.tensorboardStatus.isShown;
        if ($scope.sessionTask.tensorboardStatus.isShown) {
            let sessionId = $scope.selection.sessionModels[0].sessionId;
            DataikuAPI.webapps.startTensorboard($scope.analysisCoreParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId, sessionId).success(function (result) {
                if (result && result.jobId && !result.hasResult) { // There is a backend still starting, wait for it
                    FutureWatcher.watchJobId(result.jobId)
                        .success(function (data) {
                            $scope.sessionTask.tensorboardStatus.isBackendReady = true;
                        }).error(function (data, status, headers, config, statusText, xhrStatus) {
                        $scope.sessionTask.tensorboardStatus.isShown = false;
                        setErrorInScope.bind($scope)(data, status, headers, config, statusText, xhrStatus);
                    })
                } else {
                    $scope.sessionTask.tensorboardStatus.isBackendReady = true;
                }
            }).error(setErrorInScope.bind($scope));
        }

    };
    $scope.anySessionModelNeedsHyperparameterSearch = function () {
        return ($scope.selection.sessionModels || []).some(function (x) {
            return (x.gridLength != 1 || x.pluginAlgoCustomGridSearch) && !x.partitionedModelEnabled;
        })
    };
    $scope.anySessionModelHasOptimizationResults = function () {
        if ($scope.isMLBackendType("KERAS")) {
            return ($scope.selection.sessionModels || []).some(function (x) {
                return x.modelTrainingInfo;
            });
        } else {
            return ($scope.selection.sessionModels || []).some(function (x) {
                return x.gridsearchData && x.gridsearchData.gridPoints && x.gridsearchData.gridPoints.length > 0;
            })
        }
    };

    $scope.anyModelHasOneEpochFinished = function() {
        return ($scope.selection.sessionModels || []).some(function(model) {
            return (model.modelTrainingInfo && model.modelTrainingInfo.epochs && model.modelTrainingInfo.epochs.length > 0);
        });
    };

    $scope.anyModelHasAllEpochsFinished = function() {
        return ($scope.selection.sessionModels || []).some(function(model) {
            return (model.modelTrainingInfo && model.modelTrainingInfo.nbEpochs == model.modelTrainingInfo.epochs.length);
        });
    };

    $scope.anyModelHasFailedOrAborted = function() {
        return $scope.anyModelHasFailed() || $scope.anyModelAborted();
    }

    $scope.anyModelHasFailed = function() {
        return ($scope.selection.sessionModels || []).some(function(model) {
            return model.trainInfo.state === 'FAILED';
        });
    };

    $scope.anyModelAborted = function() {
        return ($scope.selection.sessionModels || []).some(function(model) {
            return model.trainInfo.state === 'ABORTED';
        });
    }

    $scope.stopGridSearch = function(fullModelIds, setUiState = false) {
        Dialogs.confirm($scope, "Suspend optimization for this model",
            "Do you want to suspend the optimization for this model?").then(function() {
                WT1.event("stop-grid-search", {});
                DataikuAPI.analysis.mlcommon.stopGridSearch(fullModelIds)
                    .success(() => {
                        fullModelIds.forEach(fmi => { $scope.modelSnippets[fmi].trainInfo.$userRequestedState = "FINALIZE" });
                        if (setUiState) {
                            $scope.uiState.$userRequestedState = 'FINALIZE';
                        }
                        $scope.refreshStatus();
                    }).error(setErrorInScope.bind($scope));
            });
    };

    $scope.retrainModel = function(sessionId, fullModelIds, setUiState = false) {
        WT1.event("start-retrain-model", {});
        return DataikuAPI.analysis.pml.retrainStart($scope.analysisCoreParams.projectKey,
            $scope.analysisCoreParams.id, $stateParams.mlTaskId, sessionId, fullModelIds)
            .success(() => {
                fullModelIds.forEach(fmi => { $scope.modelSnippets[fmi].trainInfo.$userRequestedState = false });
                if (setUiState) {
                    $scope.uiState.$userRequestedState = false;
                }
                $scope.initialRefreshAndAutoRefresh();
            }).error(setErrorInScope.bind($scope));
    };

    $scope.stopGridSearchSession = function(sessionId) {
        const fullModelIds = $scope.selection.allObjects
            .filter(model => model.sessionId === sessionId && $scope.isModelOptimizing(model))
            .map(Fn.prop('fullModelId'));

        $scope.stopGridSearch(fullModelIds, true);
    };

    $scope.retrainSession = function(sessionId) {
        const fullModelIds = $scope.selection.allObjects
            .filter(function(model) {
                return model.sessionId === sessionId
                    && ($scope.isModelOptimizationResumable(model) || $scope.isModelRetrainable(model));
            })
            .map(Fn.prop('fullModelId'));

        $scope.retrainModel(sessionId, fullModelIds, true);
    };
});

app.controller("PMLTaskDesignController", function($scope, $timeout, $controller, Assert, DataikuAPI, PMLSettings, PMLFilteringService,
            $state, $stateParams, TopNav, Collections, Dialogs, CreateModalFromTemplate, Fn, Logger, WT1) {
    $scope.$state = $state;
    angular.extend($scope, PMLSettings.taskF($scope.mlTasksContext.activeMLTask.backendType));
    angular.extend($scope, PMLSettings.task);
    $controller("_MLTaskDesignController",{$scope:$scope});
    $scope.reguessAll = function(){
        Dialogs.confirm($scope, "Reguess settings", "Are you sure you want to reguess all settings ? Your changes will be lost.").then(function(){
            DataikuAPI.analysis.pml.reguessWithType($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId,
                $scope.mlTaskDesign.predictionType, true).success(function(data){
                    $scope.setMlTaskDesign(data);
                    $scope.savedSettings = dkuDeepCopy($scope.mlTaskDesign, PMLSettings.noDollarKey);
                })
        });
    };

    $scope.isValidMetric = function(metric){
        return !($scope.isSparkBased() && metric[0] == "CUSTOM");
    };

    $scope.uiState.generatorPage = "manual_interactions";

    $scope.countNumericCombinations = function() {
        var n = Object.keys($scope.mlTaskDesign.preprocessing.per_feature)
                    .map(Fn(Fn.dict($scope.mlTaskDesign.preprocessing.per_feature), Fn.prop('type')))
                    .filter(Fn.eq('NUMERIC')).length;
        return n < 2 ? 0 : (n * (n-1) / 2); // n take 2
    };

    $scope.addInteraction = function(){
        var prep = $scope.mlTaskDesign.preprocessing;
        var fs = Object.keys(prep.per_feature).filter(function(f){ return prep.per_feature[f].role == "INPUT"; });
        var interaction = {
            column_1: fs[0],
            column_2: fs.length > 1 ? fs[1] : fs[0],
            rescale: true,
            max_features: 100
        }
        var ints = prep.feature_generation.manual_interactions.interactions;
        if(!ints){
            ints = [];
            prep.feature_generation.manual_interactions.interactions = ints;
        }
        ints.push(interaction);
    };

    $scope.activeFeatures = function(){
        var feats = [];
        for(var f in $scope.mlTaskDesign.preprocessing.per_feature){
            if($scope.mlTaskDesign.preprocessing.per_feature[f].role == 'INPUT'){
                feats.push(f);
            }
        }
        feats.sort();
        return feats;
    };

    $scope.removeInteraction = function(i){
        $scope.mlTaskDesign.preprocessing.feature_generation.manual_interactions.interactions.splice(i, 1);
    };

    $scope.willDummify = function(interaction){
        var isNumeric = function(f){
            return $scope.mlTaskDesign.preprocessing.per_feature[f].type == "NUMERIC";
        };
        return ! (isNumeric(interaction.column_1) && isNumeric(interaction.column_2));
    };

    $scope.addCustomPython = function() {
        $scope.mlTaskDesign.modeling.custom_python = $scope.mlTaskDesign.modeling.custom_python || [];

        var code = null;
        if ($scope.isRegression()){
            code = "# This sample code uses a standard scikit-learn algorithm, the Adaboost regressor.\n\n" +
                   "# Your code must create a 'clf' variable. This clf must be a scikit-learn compatible\n" +
                   "# model, ie, it should:\n" +
                   "#  1. have at least fit(X,y) and predict(X) methods\n" +
                   "#  2. inherit sklearn.base.BaseEstimator\n" +
                   "#  3. handle the attributes in the __init__ function\n" +
                   "#     See: https://doc.dataiku.com/dss/latest/machine-learning/custom-models.html\n\n" +
                   "from sklearn.ensemble import AdaBoostRegressor\n\n"+
                   "clf = AdaBoostRegressor(n_estimators=20)\n"
        } else {
            code = "# This sample code uses a standard scikit-learn algorithm, the Adaboost classifier.\n\n" +
                   "# Your code must create a 'clf' variable. This clf must be a scikit-learn compatible\n" +
                   "# classifier, ie, it should:\n" +
                   "#  1. have at least fit(X,y) and predict(X) methods\n" +
                   "#  2. inherit sklearn.base.BaseEstimator\n" +
                   "#  3. handle the attributes in the __init__ function\n" +
                   "#  4. have a classes_ attribute\n" +
                   "#  5. have a predict_proba method (optional)\n" +
                   "#     See: https://doc.dataiku.com/dss/latest/machine-learning/custom-models.html\n\n" +
                   "from sklearn.ensemble import AdaBoostClassifier\n\n" +
                   "clf = AdaBoostClassifier(n_estimators=20)\n"
        }

        var expectedAlgKey = 'custom_python_' + $scope.mlTaskDesign.modeling.custom_python.length;
        $scope.uiState.algorithm = expectedAlgKey;
        $scope.mlTaskDesign.modeling.custom_python.push({
            enabled: true,
            name: "Custom Python model",
            code: code
        });
    };

    $scope.addCustomMLLib = function() {
        $scope.mlTaskDesign.custom_mllib = $scope.mlTaskDesign.custom_mllib || [];

        let code = null;
        if ($scope.isRegression()) {
            code = "// This sample code uses a standard MLlib algorithm, the RandomForestRegressor.\n\n" +
                   "// import the Estimator from spark.ml\n" +
                   "import org.apache.spark.ml.regression.RandomForestRegressor\n\n" +
                   "// instantiate the Estimator\n" +
                   "new RandomForestRegressor()\n" +
                   "   .setLabelCol(\"" + $scope.mlTaskDesign.targetVariable + "\")  // Must be the target column\n" +
                   "   .setFeaturesCol(\"__dku_features\")  // Must always be __dku_features\n" +
                   "   .setPredictionCol(\"prediction\")  // Must always be prediction\n" +
                   "   .setNumTrees(50)\n" +
                   "   .setMaxDepth(8)";
       } else {
            code = "// This sample code uses a standard MLlib algorithm, the RandomForestClassifier.\n\n" +
                   "// import the Estimator from spark.ml\n" +
                   "import org.apache.spark.ml.classification.RandomForestClassifier\n\n" +
                   "// instantiate the Estimator\n" +
                   "new RandomForestClassifier()\n" +
                   "   .setLabelCol(\"" + $scope.mlTaskDesign.targetVariable + "\")  // Must be the target column\n" +
                   "   .setFeaturesCol(\"__dku_features\")  // Must always be __dku_features\n" +
                   "   .setPredictionCol(\"prediction\")    // Must always be prediction\n" +
                   "   .setNumTrees(50)\n" +
                   "   .setMaxDepth(8)";
       }

        var expectedAlgKey = 'custom_mllib_' + $scope.mlTaskDesign.modeling.custom_mllib.length;
        $scope.uiState.algorithm = expectedAlgKey;
        $scope.mlTaskDesign.modeling.custom_mllib.push({
            enabled: true,
            name: "Custom MLlib model",
            initializationCode: code
        });
    };

    $scope.getAlgorithmTemplate = function() {
        if (!$scope.uiState || !$scope.uiState.algorithm) {
            return;
        } else if ($scope.uiState.algorithm.startsWith("CustomPyPredAlgo_")) {
            return '/templates/analysis/prediction/settings/algorithms/'+$scope.mlTaskDesign.backendType.toLowerCase()+'/plugin-model.html'

        } else if ($scope.uiState.algorithm.startsWith("custom")) {
            return '/templates/analysis/prediction/settings/algorithms/'+$scope.mlTaskDesign.backendType.toLowerCase()+'/custom.html'
        } else {
            Assert.inScope($scope, 'algorithms');
            const availableAlgorithms = $scope.algorithms[$scope.mlTaskDesign.backendType];
            const alg = Collections.indexByField(availableAlgorithms, 'algKey')[$scope.uiState.algorithm];
            if ($scope.uiState.algorithm.startsWith("xgboost")) {
                return '/templates/analysis/prediction/settings/algorithms/'+$scope.mlTaskDesign.backendType.toLowerCase()+'/xgboost.html';
            } else {
                return '/templates/analysis/prediction/settings/algorithms/'+$scope.mlTaskDesign.backendType.toLowerCase()+'/'+(alg.paramsName || $scope.uiState.algorithm)+'.html'
            }
        }
    };


    $scope.copyAlgorithmSettings = function(exportSettings) {
        if ($scope.dirtySettings()) {
                $scope.saveSettings();
        }
        DataikuAPI.projects.listHeads(exportSettings ? 'WRITE_CONF' : null).success(function(projectData) {
             CreateModalFromTemplate("/templates/analysis/mlcommon/settings/copy-settings.html", $scope, null, function(newScope) {
                 newScope.projects = projectData;
                 newScope.title = newScope.title = "Copy "
                                + ($scope.mlTaskDesign.backendType === "KERAS" ? "architecture " : " algorithms ")
                                + (exportSettings ? "to" : "from");
                 newScope.totem = "icon-" + (exportSettings ? "copy" : "paste");
                 newScope.infoMessages = ["You can only choose a "
                                    + ($scope.mlTaskDesign.predictionType === "REGRESSION" ? "regression" : "classification (binary or multiclass)")
                                    + " model using a "
                                    + ($scope.backendTypeNames[$scope.mlTaskDesign.backendType] || $scope.mlTaskDesign.backendType)
                                    + " engine"];
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
                        newScope.descriptions = [];
                        newScope.tasks = taskData;
                        newScope.tasks.forEach(task => {
                            // task can be selected if it is not the current one + has same pred type + same backend
                            task.isNotSelectable = task.mlTaskId === $stateParams.mlTaskId
                                                && newScope.selectedAnalysisId === $stateParams.analysisId
                                                && newScope.selectedProjectKey === $stateParams.projectKey
                                                || task.backendType !== $scope.mlTaskDesign.backendType
                                                || task.taskType !== "PREDICTION"
                                                || ((task.predictionType === "REGRESSION") !== $scope.isRegression());
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
                        DataikuAPI.analysis.pml.copyAlgorithmSettings($stateParams.projectKey, $stateParams.analysisId,
                            $stateParams.mlTaskId, newScope.selectedProjectKey, newScope.selectedAnalysisId,
                            newScope.selectedTask.mlTaskId).error(setErrorInScope.bind($scope));
                    } else {
                        DataikuAPI.analysis.pml.copyAlgorithmSettings(newScope.selectedProjectKey, newScope.selectedAnalysisId,
                            newScope.selectedTask.mlTaskId, $stateParams.projectKey, $stateParams.analysisId,
                            $stateParams.mlTaskId).success(function(data) {
                                $scope.setMlTaskDesign(data);
                        }).error(setErrorInScope.bind($scope));
                    }
                    WT1.event("mltask-copy-algorithms", {
                        export: exportSettings,
                        sameProject: $stateParams.projectKey === newScope.selectedProjectKey,
                        sameAnalysis: $stateParams.analysisId === newScope.selectedAnalysisId,
                        typeDest: newScope.selectedTask.predictionType,
                        typeSrc: $scope.mlTaskDesign.predictionType
                    });
                     newScope.dismiss();
                 };
                 newScope.cancel = function() {
                     newScope.dismiss();
                 };
             });
         }).error(setErrorInScope.bind($scope));
    };

    $scope.$watch("mlTaskDesign.modeling.metrics.evaluationMetric", function(nv, ov) {
        if (nv && nv == "CUSTOM" && !$scope.mlTaskDesign.modeling.metrics.customEvaluationMetricCode) {
            $scope.mlTaskDesign.modeling.metrics.customEvaluationMetricCode =
                    "def score(y_valid, y_pred):\n"+
                    "    \"\"\"\n"+
                    "    Custom scoring function.\n" +
                    "    Must return a float quantifying the estimator prediction quality.\n"+
                    "      - y_valid is a pandas Series\n"+
                    "      - y_pred is a numpy ndarray with shape:\n"+
                    "           - (nb_records,) for regression problems and classification problems\n"+
                    "             where 'needs probas' (see below) is false\n"+
                    "             (for classification, the values are the numeric class indexes)\n"+
                    "           - (nb_records, nb_classes) for classification problems where\n"+
                    "             'needs probas' is true\n"+
                    "      - [optional] X_valid is a dataframe with shape (nb_records, nb_input_features)\n"+
                    "      - [optional] sample_weight is a numpy ndarray with shape (nb_records,)\n"+
                    "                   NB: this option requires a variable set as \"Sample weights\"\n"+
                    "    \"\"\"\n"
        }
    });


    $scope.$watch('mlTaskDesign', function(nv){
        if (nv) {
            $scope.uiState.predictionType = nv.predictionType;
            $scope.uiState.targetVariable = nv.targetVariable;
            $scope.uiState.sampleWeightVariable = nv.weight.sampleWeightVariable ? nv.weight.sampleWeightVariable : null;
            $scope.uiState.weightMethod = nv.weight.weightMethod ? nv.weight.weightMethod : null;
            $scope.uiState.splitMethodDesc = nv.splitParams.ssdSplitMode==="SORTED" ? "Based on time variable" : "Randomly";
            if (nv.backendType === "PY_MEMORY") {
                $scope.uiState.hyperparamSearchStrategies =  [["GRID", "Grid search"],
                                                              ["RANDOM", "Random search"],
                                                              ["BAYESIAN", "Bayesian search"]];
            } else {
                $scope.uiState.hyperparamSearchStrategies =  [["GRID", "Grid search"]];
            }
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

    $scope.getCrossvalModes = function() {
        if($scope.mlTaskDesign.time && $scope.mlTaskDesign.time.enabled) {
            return $scope.crossvalModesWithTime;
        } else {
            return $scope.crossvalModesRandom;
        }
    };

    $scope.$watch('mlTaskDesign.time', function(nv, ov){
        // Propagate changes of `mlTaskDesign.time` object to:
        //   - split params
        //   - per feature
        //   - grid search params
        // Be careful to propagate only if actual change in order not to dirtify the mlTaskDesign object for nothing 
        if(nv && ov && nv !== ov) {
            const splitSingleDataset = $scope.mlTaskDesign.splitParams.ttPolicy === "SPLIT_SINGLE_DATASET";
            if (nv.timeVariable && nv.timeVariable !== ov.timeVariable) {
                let featureData = $scope.mlTaskDesign.preprocessing.per_feature[nv.timeVariable];
                featureData.missing_handling = "DROP_ROW";
                featureData.autoReason = null;
                if (splitSingleDataset) {
                    $scope.mlTaskDesign.splitParams.ssdColumn = nv.timeVariable;
                }
            }

            if (nv.ascending !== ov.ascending && splitSingleDataset) {
                $scope.mlTaskDesign.splitParams.testOnLargerValues = nv.ascending;
            }

            if (nv.enabled !== ov.enabled) {
                if (nv.enabled) {
                    $scope.mlTaskDesign.splitParams.ssdSplitMode = "SORTED";
                    $scope.uiState.splitMethodDesc = "Based on time variable";
                    switch ($scope.mlTaskDesign.modeling.gridSearchParams.mode) {
                        case "KFOLD":
                            $scope.mlTaskDesign.modeling.gridSearchParams.mode = "TIME_SERIES_KFOLD";
                            break;
                        case "SHUFFLE":
                            $scope.mlTaskDesign.modeling.gridSearchParams.mode = "TIME_SERIES_SINGLE_SPLIT";
                            break;
                        default:
                            break;
                    }
                    $scope.mlTaskDesign.splitParams.kfold = false;
                } else {
                    $scope.mlTaskDesign.splitParams.ssdSplitMode = "RANDOM";
                    $scope.uiState.splitMethodDesc = "Randomly";
                    switch ($scope.mlTaskDesign.modeling.gridSearchParams.mode) {
                        case "TIME_SERIES_KFOLD":
                            $scope.mlTaskDesign.modeling.gridSearchParams.mode = "KFOLD";
                            break;
                        case "TIME_SERIES_SINGLE_SPLIT":
                            $scope.mlTaskDesign.modeling.gridSearchParams.mode = "SHUFFLE";
                            break;
                        default:
                            break;
                    }
                    $scope.mlTaskDesign.time.timeVariable = null;
                    if ($scope.mlTaskDesign.splitParams.ssdColumn) {
                        $scope.mlTaskDesign.splitParams.ssdColumn = null;
                    }
                }
            }
        }
    }, true);
});

app.controller("PMLTaskPreTrainBase", function ($scope, $stateParams, $state, $controller, DataikuAPI, WT1, Logger) {
    $controller('_PMLTaskWithK8sContainerInformationController', { $scope });

    $scope._doTrain = function () {
        try {
            const algorithms = {};
            $.each($scope.mlTaskDesign.modeling, function (alg, params) {
                if (params.enabled) {
                    algorithms[alg] = params;
                }
            });

            // Adding custom py algorithms
            $.each($scope.mlTaskDesign.modeling.custom_python, function(algNum, params) {
                if (params.enabled) {
                    algorithms["CUSTOM_PYTHON_" + algNum] = params;
                }
            });

            // Adding custom mllib algorithms
            $.each($scope.mlTaskDesign.modeling.custom_mllib, function(algNum, params) {
                if (params.enabled) {
                    algorithms["CUSTOM_MLLIB_" + algNum] = params;
                }
            });

            // Adding plugin algorithms
            $.each($scope.mlTaskDesign.modeling.plugin_python, function(alg, params) {
                if (params.enabled) {
                    algorithms[alg] = params;
                }
            });

            WT1.event("prediction-train", {
                backendType: $scope.mlTaskDesign.backendType,
                taskType: $scope.mlTaskDesign.taskType,
                predictionType: $scope.mlTaskDesign.predictionType,
                guessPolicy: $scope.mlTaskDesign.guessPolicy,
                feature_generation: JSON.stringify($scope.mlTaskDesign.preprocessing.feature_generation),
                feature_selection_params: JSON.stringify($scope.mlTaskDesign.preprocessing.feature_selection_params),
                algorithms: JSON.stringify(algorithms),
                metrics: JSON.stringify($scope.mlTaskDesign.modeling.metrics),
                weightMethod: $scope.mlTaskDesign.weight.weightMethod,
                hasSessionName: !!$scope.uiState.userSessionName,
                hasSessionDescription: !!$scope.uiState.userSessionDescription,
                calibrationMethod: $scope.mlTaskDesign.calibration.calibrationMethod,
                hasTimeOrdering: $scope.mlTaskDesign.time.enabled,
                gridSearchParams: JSON.stringify($scope.mlTaskDesign.modeling.gridSearchParams),
                runsOnKubernetes: $scope.hasSelectedK8sContainer(),
                assertionsParams: JSON.stringify(aggregateAssertionsParams())
            });
        } catch (e) {
            Logger.error('Failed to report mltask info', e);
        }
        return DataikuAPI.analysis.pml.trainStart($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId,
            $scope.uiState.userSessionName, $scope.uiState.userSessionDescription, $scope.uiState.forceRefresh).error(setErrorInScope.bind($scope));
    };
    function aggregateAssertionsParams() {
        let assertionsConditionsModes = {}
        $scope.mlTaskDesign.assertionsParams.assertions.map(a => a.filter.uiData.mode)
            .forEach(val => assertionsConditionsModes[val] = (assertionsConditionsModes[val] || 0) + 1)
        return {
            "count": $scope.mlTaskDesign.assertionsParams.assertions.length || 0,
            "assertionsConditionsModes": assertionsConditionsModes
        };
    }
});

app.controller("PMLTaskPreTrainBaseKeras", function ($scope, $controller) {
    $controller("PMLTaskPreTrainBase", {$scope:$scope});
    $scope.kerasTrain = function () {
        $scope._doTrain().then(function () {
            $scope.onTrainModalResolution();
        });
    };
});

app.controller("PMLTaskPreTrainModal", function($scope, $stateParams, $state, DataikuAPI,$controller, WT1, Logger) {
    $controller("PMLTaskPreTrainBase", {$scope:$scope});
    $scope.uiState = {
        confirmRun: false
    };

    DataikuAPI.analysis.pml.getPreTrainStatus($stateParams.projectKey, $stateParams.analysisId, $stateParams.mlTaskId).success(function(data) {
        $scope.preTrainStatus = data;
        $scope.splitStatus = data.splitStatus;
        $scope.uiState.anyError = data.messages.some(x => x.severity == 'ERROR');
        $scope.uiState.anyWarning = data.messages.some(x => x.severity == 'WARNING');
    }).error(setErrorInScope.bind($scope));

    function trainAndResolveModal() {
        $scope._doTrain().success(function (data) {
            $scope.resolveModal();
        });
    }

    $scope.getModelStr = (pluralize) => {
        let modelStr;
        if ($scope.preTrainStatus && $scope.preTrainStatus.partitionedModelEnabled) {
            modelStr = "partitioned model";
        } else {
            modelStr = "model";
        }

        if (pluralize) {
            modelStr += "s";
        }

        return modelStr;
    }

    $scope.train = function () {
        if ($scope.isMLBackendType("KERAS")) {
            $scope.saveSettings().success(function() {
                if ($scope.recipe.params && $scope.recipe.params.skipPrerunValidate) {
                    trainAndResolveModal();
                } else {
                    $scope.validateRecipe().then(function(validationResult) {
                        if (!validationResult.topLevelMessages || !validationResult.topLevelMessages.maxSeverity || validationResult.topLevelMessages.maxSeverity === 'OK') {
                            trainAndResolveModal();
                        } else {
                            $state.go('projects.project.analyses.analysis.ml.predmltask.list.design',
                                {
                                    "projectKey": $scope.projectSummary.projectKey,
                                    "analysisId": $scope.analysisCoreParams.id,
                                    "mlTaskId": $scope.mlTaskDesign.id
                                }).then(() => {
                                    $scope.valCtx.showPreRunValidationError = true;
                                    $scope.goToKerasArchitecture();
                                    $scope.dismiss();
                            });

                        }
                    });
                }
            });
        } else {
            trainAndResolveModal();
        }
    };

    const selectedAlgorithmsWithWeightIncompatibility = [];
    $scope.base_algorithms[$scope.mlTaskDesign.backendType].forEach(function(x) {
        const unsupportedAlgo = $scope.algosWithoutWeightSupport.has(x.algKey);

        if((x.algKey in $scope.mlTaskDesign.modeling) && $scope.mlTaskDesign.modeling[x.algKey].enabled && unsupportedAlgo) {
            selectedAlgorithmsWithWeightIncompatibility.push(x.name);
        }

        // Looking at plugin algorithms as well
        const algoInPluginsAndEnabled = $scope.mlTaskDesign.modeling["plugin_python"]
                                        && $scope.mlTaskDesign.modeling["plugin_python"][x.algKey]
                                        && $scope.mlTaskDesign.modeling["plugin_python"][x.algKey].enabled;

        if (algoInPluginsAndEnabled && unsupportedAlgo) {
            selectedAlgorithmsWithWeightIncompatibility.push(x.name);
        }
    });
    $scope.uiState["selectedAlgorithmsWithWeightIncompatibility"] = selectedAlgorithmsWithWeightIncompatibility;
    $scope.uiState["displayWeightWarningPreTrain"] = ($scope.isSampleWeightEnabled() && (selectedAlgorithmsWithWeightIncompatibility.length > 0));
});

app.controller("PMLTaskAssertionsController", function($scope, DataikuAPI, StringUtils, $stateParams) {

    DataikuAPI.analysis.getPostScriptSchema($stateParams.projectKey, $stateParams.analysisId).success(function (data) {
        $scope.postScriptFeaturesSchema = data;
        $scope.postScriptFeaturesSchema.columns.splice($scope.postScriptFeaturesSchema.columns.map(column => column.name).indexOf($scope.mlTaskDesign.targetVariable), 1);
    });
    $scope.classes = $scope.mlTaskDesign.preprocessing.target_remapping.map(clss => clss.sourceValue);

    DataikuAPI.flow.recipes.generic.getVariables($stateParams.projectKey).success(function(data) {
        // recipeVariables is needed to fill the variable tab of the assertion filter when using a formula
        $scope.recipeVariables = data;
    }).error(setErrorInScope.bind($scope));
    $scope.addNewMlAssertion = function () {
        function isClassification() {
            return $scope.mlTaskDesign && $scope.mlTaskDesign.predictionType !== "REGRESSION";
        }
        let newAssertion = {
            filter: {"enabled": true},
            name: StringUtils.transmogrify("Assertion " + ($scope.mlTaskDesign.assertionsParams.assertions.length + 1).toString(),
                $scope.mlTaskDesign.assertionsParams.assertions.map(a => a.name),
                function(i){return "Assertion " + (i+1).toString() }),
            assertionCondition: {expectedValidRatio: 0.9}
        };
        if (isClassification()) {
            newAssertion.assertionCondition.expectedClass = $scope.classes[0];
        } else {
            DataikuAPI.shakers.detailedColumnAnalysis(
                $stateParams.projectKey,
                $scope.analysisCoreParams.projectKey,
                $scope.analysisCoreParams.inputDatasetSmartName,
                $scope.analysisCoreParams.script,
                null,
                $scope.mlTaskDesign.targetVariable,
                50
            ).success(function (data) {
                newAssertion.assertionCondition.expectedMinValue = Math.round(data.numericalAnalysis.min);
                newAssertion.assertionCondition.expectedMaxValue = Math.round(data.numericalAnalysis.max);
            });
        }
        $scope.mlTaskDesign.assertionsParams.assertions.push(newAssertion);
    };
    $scope.deleteAssertion = function(index) {
        $scope.mlTaskDesign.assertionsParams.assertions.splice(index, 1);
    }
});

app.controller('_K8sConfigurationCheckerController', ($scope, $stateParams, DataikuAPI) => {
    let k8sContainerNames = [];
    let defaultContainerName = null;

    DataikuAPI.containers.listNamesWithDefault($stateParams.projectKey, 'KUBERNETES')
        .success((data) => {
            k8sContainerNames = data.containerNames;
            defaultContainerName = data.resolvedInheritValue;
        })
        .error(setErrorInScope.bind($scope));

    $scope.isK8sContainer = (backendType, containerSelection) => {
        if (!['PY_MEMORY', 'KERAS'].includes(backendType)) {
            return false;
        }

        switch (containerSelection.containerMode) {
            case 'EXPLICIT_CONTAINER':
                return k8sContainerNames.includes(containerSelection.containerConf);
            case 'INHERIT':
                return k8sContainerNames.includes(defaultContainerName);
            default:
                return false;
        }
    };
});

app.controller("_PMLTaskWithK8sContainerInformationController", ($scope, $controller) => {
    $controller("_K8sConfigurationCheckerController", { $scope });

    $scope.hasSelectedK8sContainer = () => {
        const { backendType, containerSelection } = $scope.mlTaskDesign;
        return $scope.isK8sContainer(backendType, containerSelection);
    };
});

app.controller("PMLTaskHyperparametersController", ($scope, $controller) => {
    $controller("PMLTaskCrossvalController", { $scope });
    $controller("_PMLTaskWithK8sContainerInformationController", { $scope });
});

app.controller("PMLTaskRuntimeController", ($scope, $controller) => {
    $controller("_PMLTaskWithK8sContainerInformationController", { $scope });

    const updateHpSearchDistribution = (newSelection, oldSelection) => {
        if (angular.equals(newSelection, oldSelection)) {
            return;
        }

        const searchParams = $scope.mlTaskDesign.modeling.gridSearchParams;
        searchParams.distributed = searchParams.distributed && $scope.hasSelectedK8sContainer();
    };

    $scope.$watch('mlTaskDesign.containerSelection', updateHpSearchDistribution, true);
});

app.controller("PMLTaskCrossvalController", function($scope, $controller, $timeout, $stateParams, DataikuAPI, DatasetUtils, VisualMlCodeEnvCompatibility, Dialogs, SamplingData){
    var datasetLoc = DatasetUtils.getLocFromSmart($stateParams.projectKey, $scope.analysisCoreParams.inputDatasetSmartName);
    DataikuAPI.datasets.get(datasetLoc.projectKey, datasetLoc.name, $stateParams.projectKey).success(function (data) {
        $scope.analysisDataset = data;
    });
    $scope.getPartitionsList = function () {
        return DataikuAPI.datasets.listPartitionsWithName(datasetLoc.projectKey, datasetLoc.name)
            .error(setErrorInScope.bind($scope))
            .then(function (ret) {
                return ret.data;
            })
    };
    $scope.isSearchNeeded = function() {

        // xgboost is a bit annoying, because we know for sure that when "enable_early_stopping" is checked
        // it needs search (whatever the strategy is), so we handle this special case separatly
        const xgbParams = $scope.mlTaskDesign.modeling.xgboost;
        if (xgbParams && xgbParams.enabled && xgbParams.enable_early_stopping) {
            return true;
        }

        if ($scope.mlTaskDesign.modeling.gridSearchParams.strategy !== "GRID") {
            return $scope.mlTaskDesign.modeling.gridSearchParams.nIterRandom !== 1;
        } else {
            var ret = false;
            angular.forEach($scope.mlTaskDesign.modeling, function(alg, algName) {
                if (!alg.enabled) {
                    return;
                }

                angular.forEach(alg, function(v,k) {
                    // Numerical hyperparameter
                    if (v.gridMode === "EXPLICIT" && v.values && v.values.length > 1) {
                        ret = true;
                    } else if (v.gridMode === "RANGE" && v.range.nbValues > 1) {
                        ret = true;
                    // Categorical hyperparameter
                    } else if (Object.values(v.values || {}).filter(val => val.enabled).length > 1) {
                        ret = true;
                    }
                });
            });

            // For plugin algos, need to have a look at their 'params' field
            angular.forEach($scope.mlTaskDesign.modeling.plugin_python, function(alg, algKey) {
                if (!alg.enabled) {
                    return;
                }

                var algorithmSetting = $scope.getPluginAlgorithm(algKey);
                if (algorithmSetting.customInfo.desc.gridSearchMode === "CUSTOM") {
                    ret = true;
                } else if (algorithmSetting.customInfo.desc.gridSearchMode === "MANAGED"){
                    angular.forEach(alg.params, function(v,k) {
                        if ($.isArray(v) && v.length > 1) {
                            ret = true;
                        }
                    });
                }
            });

            return ret;
        }
    }
    // Prefill
    $scope.$watch("uiSplitParams.policy", function(nv, ov) {
        if (!nv) return;
        if (nv == "EXPLICIT_FILTERING_TWO_DATASETS") {
            if (!$scope.mlTaskDesign.splitParams.eftdTrain) {
                $scope.mlTaskDesign.splitParams.eftdTrain = {
                    datasetSmartName : $scope.analysisCoreParams.inputDatasetSmartName,
                    selection : DatasetUtils.makeHeadSelection(100000)
                }
            }
            if (!$scope.mlTaskDesign.splitParams.eftdTest) {
                $scope.mlTaskDesign.splitParams.eftdTest = {
                    selection : DatasetUtils.makeHeadSelection(100000)
                }
            }
        } else if (nv.indexOf("EXPLICIT_FILTERING_SINGLE_DATASET")==0) {
            if (!$scope.mlTaskDesign.splitParams.efsdTrain) {
                $scope.mlTaskDesign.splitParams.efsdTrain = {
                    selection : DatasetUtils.makeHeadSelection(100000)
                }
            }
            if (!$scope.mlTaskDesign.splitParams.efsdTest) {
                $scope.mlTaskDesign.splitParams.efsdTest = {
                    selection : DatasetUtils.makeHeadSelection(100000)
                }
            }
        } else if (nv == "SPLIT_OTHER_DATASET") {
            if (!$scope.mlTaskDesign.splitParams.ssdDatasetSmartName) {
                $scope.mlTaskDesign.splitParams.ssdDatasetSmartName = $scope.analysisCoreParams.inputDatasetSmartName;
            }
        }
        if (nv != "SPLIT_MAIN_DATASET" && $scope.mlTaskDesign.partitionedModel.enabled) {
            const choices = [
                { revert: false, title: "Disable partitioning & keep this policy",
                    desc: ($scope.trainTestPolicies.find(_ => _[0] === nv) || [,nv])[1] },
                { revert: true, title: "Keep partitioning & revert policy",
                    desc: $scope.trainTestPolicies[0][1] }
            ];
            function act(choice) {
                if (choice.revert) {
                    $scope.uiSplitParams.policy = 'SPLIT_MAIN_DATASET';
                } else {
                    $scope.mlTaskDesign.partitionedModel.enabled = false;
                }
            }
            Dialogs.select($scope, "Change train/test policy",
                "Model partitioning is enabled, but not compatible with this policy.",
                choices, choices[0]
            ).then(act, act.bind(null, choices[1])); // dismiss => revert policy
        }
    });

    $scope.$watch("mlTaskDesign.modeling.gridSearchParams.mode", function(nv, ov){
        if (nv === "CUSTOM" && !$scope.mlTaskDesign.modeling.gridSearchParams.code) {
            $scope.mlTaskDesign.modeling.gridSearchParams.code =
                "# Define an object named cv that follows the scikit-learn splitter protocol\n"+
                "# This example uses the 'repeated K-fold' splitter of scikit-learn\n"+
                "from sklearn.model_selection import RepeatedKFold\n"+
                "\n"+
                "cv = RepeatedKFold(n_splits=3, n_repeats=5)"
        }
    })

    DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(function (data) {
        $scope.availableDatasets = data;
        $scope.availableDatasetsExceptForInputDataset = $scope.availableDatasets.filter(function(d) {
            return d.smartName !==  $scope.analysisCoreParams.inputDatasetSmartName
        })
        data.forEach(function (ds) {
            ds.usable = true;
        });
    });

    $scope.potentialTimeFeatures = function() {
        const per_feature = $scope.mlTaskDesign.preprocessing.per_feature;
        if ($scope.analysisDataset) {
            // Sort and split are done before Script is applied so only input columns can be time features
            const inputColumns = $scope.analysisDataset.schema.columns.map(col => col.name);
            return inputColumns.filter(col => (per_feature[col] && per_feature[col].role !== "TARGET"));
        }
    }

    $scope.getSamplingMethodLabel = function() {
        return SamplingData.getSamplingMethodForDocumentation($scope.mlTaskDesign.splitParams.ssdSelection.samplingMethod, $scope.mlTaskDesign);
    }

    $scope.getCrossValidationLabel = function() {
        let crossValidationLabel;
        
        if ($scope.mlTaskDesign.time && $scope.mlTaskDesign.time.enabled) {
            crossValidationLabel = $scope.getCrossvalModesWithTimeForDocumentation($scope.mlTaskDesign.modeling.gridSearchParams.mode, $scope.mlTaskDesign)
        } else {
            crossValidationLabel = $scope.getCrossvalModesRandomForDocumentation($scope.mlTaskDesign.modeling.gridSearchParams.mode, $scope.mlTaskDesign);
        }

        return crossValidationLabel;
    };

    $scope.getHyperparametersBarsMaxWidth = function() {
        return $scope.mlTaskDesign.splitParams.kfold ? 1 : $scope.mlTaskDesign.splitParams.ssdTrainingRatio;
    };

    $scope.isCodeEnvCompatibleWithBayesian = function() {
        if (!$scope.mlTaskDesign || !$scope.mlTaskDesign.envSelection) {
            return false;
        }
        return VisualMlCodeEnvCompatibility.isCompatible($scope.mlTaskDesign.envSelection, $scope.codeEnvsCompat, false, true);
    };
});

app.controller("PMLTaskFeatureSelectionController", function($scope, $controller, $timeout, $stateParams, DataikuAPI, Dialogs){
    $scope.featureSelectionKinds = [
        ["NONE", "No reduction"],
        ["CORRELATION", "Correlation with target"],
        ["RANDOM_FOREST", "Tree-based"],
        ["PCA", "Principal Component Analysis"],
    ]

    if(!$scope.isMulticlass() &&
        $scope.mlTasksContext &&
        $scope.mlTasksContext.activeMLTask &&
        $scope.mlTasksContext.activeMLTask.backendType == "PY_MEMORY") {
        $scope.featureSelectionKinds.push(["LASSO", "LASSO regression"]);
    }
    
    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
    $scope.puppeteerHook_elementContentLoaded = true;
})

// NB: Also used for clustering
app.controller("PMLTaskFeaturesController", function($scope, $controller) {
    $controller("_MLTaskFeaturesController", {$scope:$scope});

    $scope.selection = {orderQuery: 'datasetColumnId'};

    $scope.isMLBackendType = function(mlBackendType){
        if (!$scope.mlTaskDesign) return false;
        return $scope.mlTaskDesign.backendType == mlBackendType;
    };
});

// NB: Also used for clustering
app.controller("MLTaskFeatureController", function($scope, PMLSettings, DataikuAPI) {
    $scope.onVariableTypeChange = function() {
        let featureData = $scope.selection.selectedObject;
        if (featureData.type === 'NUMERIC') {
            const modes = $scope.numericalMissingHandlingModes.map(function(m){return m[0]});
            if (modes.indexOf(featureData.missing_handling) < 0) {
                featureData.missing_handling = 'IMPUTE';
            }
        } else if (featureData.type === 'CATEGORY') {
            const modes = $scope.categoryMissingHandlingModes.map(function(m){return m[0]});
            if (modes.indexOf(featureData.missing_handling) < 0) {
                featureData.missing_handling = 'IMPUTE';
            }
        } else if (featureData.type === 'VECTOR') {
            const modes = $scope.vectorMissingHandlingModes.map(function(m){return m[0]});
            if (modes.indexOf(featureData.missing_handling) < 0) {
                featureData.missing_handling = 'DROP_ROW';
            }
            // Setting value of Vector Handling manually for first selection of Vector as type
            // because vector type is never guessed by back-end so never set up automatically
            if (featureData.vector_handling === undefined) {
                featureData.vector_handling = "UNFOLD";
                featureData.missing_handling = 'DROP_ROW';
                featureData.missing_impute_with = 'MODE';
            }
        } else if (featureData.type == "IMAGE") {
            const modes = $scope.imageMissingHandlingModes.map(function(m){return m[0]});
            if (modes.indexOf(featureData.missing_handling) < 0) {
                featureData.missing_handling = 'DROP_ROW';
            }

            // Setting value of Image Handling manually for first selection of Image as type
            // because image type is never guessed by back-end so never set up automatically
            if (featureData.image_handling === undefined) {
                featureData.image_handling = "CUSTOM";
                featureData.missing_handling = 'DROP_ROW';
            }

            if (featureData.image_handling === "CUSTOM" && featureData.customHandlingCode === "") {
                featureData.customHandlingCode = getCustomImageHandlingCode();
            }
        }
    };

    $scope.onVariableRoleChange = function() {
        console.debug("onVariableRoleChange", $scope.feature);
    };

    function getCustomImageHandlingCode() {
        const prepImgCode = "from keras.preprocessing.image import img_to_array, load_img\n\n" +
                            "# Custom image preprocessing function.\n" +
                            "# Must return a numpy ndarray representing the image.\n" +
                            "#  - image_file is a file like object\n" +
                            "def preprocess_image(image_file):\n" +
                            "    img = load_img(image_file,target_size=(197, 197, 3))\n" +
                            "    array = img_to_array(img)\n\n" +
                            "    # Define the actual preprocessing here\n\n" +
                            "    return array\n";
        return prepImgCode;
    }
    
    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
    $scope.puppeteerHook_elementContentLoaded = true;

    $scope.$watch('selection.selectedObject', function(newValue) {
        // Only allow preprocessing of not rejected input features
        if (newValue) {
            $scope.canPreprocess = newValue.role != 'TARGET' && newValue.role != 'REJECT' && newValue.role != 'WEIGHT';
        }
    }, true);
});

app.controller("PMLTargetRemappingController", function($scope, Assert, Fn) {
    Assert.inScope($scope, 'mlTaskDesign');

    $scope.updateGraph = function(){
        $scope.colors  = window.dkuColorPalettes.discrete[0].colors // adjascent colors are too similar
            .filter(function(c, i) { return i % 2 === 0; });        // take only even-ranked ones

        try {
        $scope.totalCount = $scope.mlTaskDesign.preprocessing.target_remapping.map(Fn.prop("sampleFreq")).reduce(Fn.SUM);

        $scope.graphData = $scope.mlTaskDesign.preprocessing.target_remapping.map(function(x){
            return [x.sourceValue, x.sampleFreq / $scope.totalCount];
        });
        } catch (e) {}
    }

    $scope.$watch('mlTaskDesign.preprocessing.target_remapping', $scope.updateGraph, false); // shallow, for the "re-detect settings" case

    $scope.editMapping = {
        active: false,
        value : null
    }
    $scope.startEditMapping = function(){
        $scope.editMapping.active = true;
        $scope.editMapping.value = $scope.mlTaskDesign.preprocessing.target_remapping;
    }
    $scope.$watch("editMapping.value", function(nv, ov) {
        if (!nv) $scope.editMapping.error = true;
        else $scope.editMapping.error = false;
    }, true);
    $scope.okEditMapping = function(){
        $scope.editMapping.active = false;
        $scope.mlTaskDesign.preprocessing.target_remapping = $scope.editMapping.value ;
        $scope.updateGraph();
    }
    $scope.cancelEditMapping = function(){
        $scope.editMapping.active = false;
    }

    $scope.updateGraph();

    $scope.hasManyCategories = function(){
        return $scope.mlTaskDesign.preprocessing.target_remapping.length >= 50;
    }

});

app.controller("PMLSparkConfigController", function($scope, Assert, DataikuAPI, Fn) {
    Assert.inScope($scope, 'mlTaskDesign');

    $scope.sparkConfs = ['default'];
    DataikuAPI.admin.getGeneralSettings().success(function(data){
        $scope.sparkConfs = data.sparkSettings.executionConfigs.map(Fn.prop('name'));
    });
});

app.directive('tensorboardDestroyHandler', function () {
    return {
        link: function ($scope, elem, attr) {
            elem.on('$destroy', function() {
                $scope.sessionTask.tensorboardStatus.isFrontendReady = false;
                $scope.sessionTask.tensorboardStatus.showIfFrontIsNotReady = true;
            });
        }
    }

});


})();
