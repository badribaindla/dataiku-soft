(function(){
'use strict';

const app = angular.module('dataiku.analysis.mlcore');

app.controller("_MLTaskFeaturesController", function($scope, $controller, $timeout, $stateParams, $rootScope, Assert, DataikuAPI, Fn, Dialogs, PMLSettings, $q, CreateModalFromTemplate) {
    Assert.inScope($scope, "analysisCoreParams");

    // List of roles that should not be impacted by mass actions
    const PROTECTED_ROLES = ["TARGET", "WEIGHT"];

    $scope.featureAutoHandlingReason = {
        "REJECT_ZERO_VARIANCE" : "DSS has rejected this feature because all values of this feature are equal.",
        "REJECT_MISSING" : "DSS has rejected this feature because too many values are missing in this feature.",
        "REJECT_IDENTIFIER" : "DSS has rejected this feature because this feature looks like a unique identifier.",
        "REJECT_DEFAULT_TEXT_HANDLING" : "DSS rejects text features by default.",
        "REJECT_CARDINALITY": "DSS has rejected this feature because it had too many categories for the task at hand.",
        "REJECT_COPY_TARGET": "DSS does not copy feature handling to the target.",
        "REJECT_COPY_WEIGHT": "DSS does not copy feature handling to the sample weight."
    };

    $scope.featureAutoHandlingShortReason = {
        "REJECT_ZERO_VARIANCE" : "too many equal values",
        "REJECT_MISSING" : "too many missing values",
        "REJECT_IDENTIFIER" : "unique ID",
        "REJECT_DEFAULT_TEXT_HANDLING" : "text feature",
        "REJECT_CARDINALITY": "too many categories"
    };

    $scope.categoryHandlingModes = [
        ["DUMMIFY", "Dummy-encoding (vectorization)"],
        ["FLAG_PRESENCE", "Replace by 0/1 flag indicating presence"],
    ];

    $scope.vectorHandlingModes = [
        ["UNFOLD", "Unfold (create one column per element)"],
    ];

    $scope.imageHandlingModes = [
        ["CUSTOM", "Custom preprocessing"]
    ];

    $scope.h2oCategoryHandlingModes = [
        ["NONE", "Let H2O handle the feature"],
        ["DUMMIFY", "Dummy-encoding (vectorization)"]
    ];

    $scope.dummyClippingModes = [
        ["MAX_NB_CATEGORIES", "Max nb. categories"],
        ["CUMULATIVE_PROPORTION", "Cumulative proportion"],
        ["MIN_SAMPLES", "Minimum samples"],
    ];

    $scope.dummyDrops = [
        ["AUTO", "Let DSS decide"],
        ["NONE", "Don't drop"],
        ["DROP", "Drop one dummy"]
    ];
    $scope.categoryMissingHandlingModes = [
        ["NONE", "Treat as a regular value"],
        ["IMPUTE", "Impute ..."],
        ["DROP_ROW", "Drop rows (don't predict them either)"]
    ];
    $scope.vectorMissingHandlingModes = [
        ["DROP_ROW", "Drop rows (don't predict them either)"],
        ["IMPUTE", "Impute ..."],
        ["NONE", "Fail if missing values found"]
    ];
    $scope.imageMissingHandlingModes = [
        ["DROP_ROW", "Drop rows (don't predict them either)"],
        ["NONE", "Fail if missing values found"]
    ];
    $scope.categoryMissingHandlingImputeWithModes = [
        ["MODE", "Most frequent value"],
        ["CONSTANT", "A constant value"]
    ];
    $scope.vectorMissingHandlingImputeWithModes = [
        ["MODE", "Most frequent value"],
        ["CONSTANT", "A vector filled with a single value"]
    ];

    $scope.numericalHandlingModes = [
        ["REGULAR", "Keep as a regular numerical feature"],
        ["FLAG_PRESENCE", "Replace by 0/1 flag indicating presence"],
        ["BINARIZE", "Binarize based on a threshold"],
        ["QUANTILE_BIN", "Quantize"]
    ];
    $scope.numericalMissingHandlingModes = [
        ["IMPUTE", "Impute ..."],
        ["DROP_ROW", "Drop rows (don't predict them either)"]
    ];
    $scope.numericalMissingHandlingImputeWithModes = [
        ["MEAN", "Average of values"],
        ["MEDIAN", "Median of values"],
        ["CONSTANT", "A constant value"]
    ];

    $scope.textHandlingModes = [
        ["TOKENIZE_HASHING", "Tokenize and hash"],
        ["TOKENIZE_HASHING_SVD", "Tokenize, hash and apply SVD"],
        ["TOKENIZE_COUNTS", "Count vectorization"],
        ["TOKENIZE_TFIDF", "TF/IDF vectorization"]
    ];
    $scope.rescalingModes = [
        ["NONE", "No rescaling"],
        ["MINMAX", "Min-max rescaling"],
        ["AVGSTD", "Standard rescaling"]
    ];
    $scope.binarizeThresholdModes = [
        ["MEAN", "Average of values"],
        ["MEDIAN", "Median of values"],
        ["CONSTANT", "A constant value"]
    ];

    $scope.sendToInputModes = [
        ["MAIN", "Main input"],
        ["OTHER", "Other input"]
    ];

    if($scope.isMLBackendType('PY_MEMORY') || $scope.isMLBackendType('KERAS')){
            $scope.categoryHandlingModes.push(
                    ["HASHING", "Feature hashing (for high cardinality)"],
                    ["CUSTOM", "Custom preprocessing"]
            );
            $scope.numericalHandlingModes.push(["CUSTOM", "Custom preprocessing"]);
            $scope.textHandlingModes.push(["CUSTOM", "Custom preprocessing"])
        if ($scope.mlTasksContext.activeMLTask.taskType === 'PREDICTION') {
            $scope.categoryHandlingModes.push(["IMPACT", "Impact-coding"]);
        }
    }

    function fillInitialCustomHandlingCode(nv, ov){
        if (nv == "CUSTOM" &&
                ($scope.selection.selectedObject.customHandlingCode == null ||
                    $scope.selection.selectedObject.customHandlingCode.length == 0) ) {
            if ($scope.isMLBackendType("KERAS") && $scope.selection.selectedObject.type === "TEXT") {
                $scope.selection.selectedObject.customHandlingCode =
                "from dataiku.doctor.deep_learning.preprocessing import TokenizerProcessor\n\n" +
                "# Defines a processor that tokenizes a text. It computes a vocabulary on all the corpus.\n" + 
                "# Then, each text is converted to a vector representing the sequence of words, where each \n" +
                "# element represents the index of the corresponding word in the vocabulary. The result is \n" + 
                "# padded with 0 up to the `max_len` in order for all the vectors to have the same length.\n\n" +
                "#   num_words  - maximum number of words in the vocabulary\n" +
                "#   max_len    - length of each sequence. If the text is longer,\n" +
                "#                it will be truncated, and if it is shorter, it will be padded\n" +
                "#                with 0.\n" +
                "processor = TokenizerProcessor(num_words=10000, max_len=32)";
            } else if ($scope.selection.selectedObject.type === "CATEGORY" ||  $scope.selection.selectedObject.type === "TEXT") {
                $scope.selection.selectedObject.customHandlingCode =
                    "from sklearn.feature_extraction import text\n\n"+
                    "# Applies count vectorization to the feature\n" +
                    "processor = text.CountVectorizer()\n";

            } else if ($scope.selection.selectedObject.type == "NUMERIC") {
                $scope.selection.selectedObject.customHandlingCode =
                    "from sklearn import preprocessing\nimport numpy as np\n\n"+
                    "# Applies log transformation to the feature\n" +
                    "processor = preprocessing.FunctionTransformer(np.log1p)\n";
                $scope.selection.selectedObject.customProcessorWantsMatrix = true;
            }
            $timeout(function() {
            // Force recomputation of all "remaining-height" directives
            $rootScope.$broadcast('reflow');
        });
        }
    }

    $scope.$watch("selection.selectedObject.category_handling", fillInitialCustomHandlingCode);
    $scope.$watch("selection.selectedObject.text_handling", fillInitialCustomHandlingCode);
    $scope.$watch("selection.selectedObject.numerical_handling", fillInitialCustomHandlingCode);


    $scope.$watch('selection.selectedObject', function(nv, ov) {
        $timeout(function() {
            // Force recomputation of all "remaining-height" directives
            $rootScope.$broadcast('reflow');
        });
        // We wait in order to make sure the layout has been updated
        // (so that the computation of the real remaining height is correct)
        if (nv) {$scope.fixupFeatureConfiguration(nv, ov);}
    }, true);

    $scope.fixupFeatureConfiguration = function(feature, oldFeature) {
        if(feature.role == 'REJECT' || PROTECTED_ROLES.includes(feature.role)) {

            // For KERAS backend, need to check that feature is special in order to 
            // create/delete Special input accordingly when rejecting/accepting a
            // feature
            if ($scope.isMLBackendType('KERAS')) {
                handleSwitchingToSpecialFeature(feature, oldFeature);
            }

            return;
        }
        if (feature.type=='CATEGORY') {
            if (!feature.category_handling) {
                feature.category_handling = "DUMMIFY";
            }
            if (feature.category_handling == "DUMMIFY" && !feature.max_nb_categories) {
                feature.max_nb_categories = 100;
            }
            if (feature.category_handling == "DUMMIFY" && !feature.max_cat_safety) {
                feature.max_cat_safety = 200;
            }
            if (feature.category_handling == "DUMMIFY" && !feature.dummy_drop) {
                feature.dummy_drop = "AUTO";
            }
            if (feature.category_handling == "DUMMIFY" && !feature.cumulative_proportion) {
                feature.cumulative_proportion = 0.95;
            }
            if (feature.category_handling == "DUMMIFY" && !feature.min_samples) {
                feature.min_samples = 10;
            }
            if (feature.category_handling == "DUMMIFY" && !feature.dummy_clip) {
                feature.dummy_clip = "CUMULATIVE_PROPORTION";
            }

            if (feature.category_handling == "HASHING" && !feature.nb_bins_hashing) {
                feature.nb_bins_hashing = 1048576;
            }

            if(feature.missing_handling=='IMPUTE') {
                if (feature.missing_impute_with != "MODE" && feature.missing_impute_with != "CONSTANT") {
                    feature.missing_impute_with = "MODE";
                }
            } else if (!feature.missing_handling) {
                feature.missing_handling = 'IMPUTE';
                feature.missing_impute_with = "MODE";
            }

        } else if (feature.type=='NUMERIC') {
            if (!feature.numerical_handling) {
                feature.numerical_handling = "REGULAR";
                feature.rescaling = "AVGSTD"
            }

            if (feature.missing_handling=='IMPUTE') {
                if (["MEAN", "MEDIAN", "CONSTANT"].indexOf(feature.missing_impute_with) < 0) {
                    feature.missing_impute_with ="MEDIAN";
                }
            } else if (!feature.missing_handling) {
                feature.missing_handling = 'IMPUTE';
                feature.missing_impute_with = 'MEDIAN';
            }

            feature.category_handling = undefined;

        } else if (feature.type == "TEXT") {
            if (!feature.text_handling) {
                feature.text_handling = "TOKENIZE_HASHING_SVD";
            }
            if (!feature.hashSize) {
                feature.hashSize = 200000;
            }
            if (!feature.hashSVDSVDLimit) {
                feature.hashSVDSVDLimit = 50000;
            }
            if (!feature.hashSVDSVDComponents) {
                feature.hashSVDSVDComponents = 100;
            }
            if (!feature.minRowsRatio) {
                feature.minRowsRatio = 0.001;
            }
            if (!feature.maxRowsRatio) {
                feature.maxRowsRatio = 0.8;
            }
            if (!feature.maxWords) {
                feature.maxWords = 0;
            }
            if (!feature.ngramMinSize) {
                feature.ngramMinSize = 1;
            }
            if (!feature.ngramMaxSize) {
                feature.ngramMaxSize = 1;
            }
            if (!feature.stopWordsMode) {
                feature.stopWordsMode = "NONE";
            }
        } else if (feature.type == "VECTOR") {
            if (!feature.vector_handling) {
                feature.vector_handling = "UNFOLD";
            }

            if(feature.missing_handling=='IMPUTE') {
                if (!feature.missing_impute_with) {
                    feature.missing_impute_with = "MODE";
                } else if (feature.missing_impute_with == "CONSTANT" && !feature.impute_constant_value) {
                    feature.impute_constant_value = "0"
                }
            } else if (!feature.missing_handling) {
                feature.missing_handling = "DROP_ROW";
            }
        } else if (feature.type === "IMAGE") {
            if (!feature.image_handling) {
                feature.image_handling = "CUSTOM";
            }

            if (!feature.missing_handling) {
                feature.missing_handling = "DROP_ROW";
            }
        }

        if ($scope.isMLBackendType('KERAS')) {
            handleSwitchingToSpecialFeature(feature, oldFeature);
        }
    };

    var datasetColumns = [];
    DataikuAPI.datasets.get($scope.analysisCoreParams.projectKey, $scope.analysisCoreParams.inputDatasetSmartName, $stateParams.projectKey)
        .success(function(dataset) {
            datasetColumns = dataset.schema.columns.map(Fn.prop('name'));
            addDataSetColumnId();
        }).error(setErrorInScope.bind($scope));
    var addDataSetColumnId = function() {
        if (datasetColumns.length === 0) {
            return;
        }
        angular.forEach($scope.mlTaskDesign.preprocessing.per_feature, function(feature) {
            feature.datasetColumnId = datasetColumns.indexOf(feature._name);
        });
    }
    $scope.$watch('mlTaskDesign.preprocessing.per_feature', addDataSetColumnId);

    $scope.acceptDSSChange = function(feature) {
        Assert.trueish(feature.state.dssWantsToSet, "unexpected call to acceptDSSChange");
        var oldState = feature.state;
        $.each(feature.state.dssWantsToSet, function(k, v){feature[k] = v;});
        feature.state = {
            userModified : false,
            recordedMeaning : oldState.recordedMeaning
        };
    }


    $scope.groupSet = function(newContent) {
        for(let i in $scope.selection.selectedObjects) {
            let feature = $scope.selection.selectedObjects[i];
            if(PROTECTED_ROLES.includes(feature.role)) {
                continue;
            }
            let modified = false;
            for(let k in newContent) {
                if(feature[k]!==newContent[k]) {
                    feature[k]=newContent[k];
                    modified = true;
                }
            }
            if(modified) {
                if (!feature.state) feature.state = {};
                feature.state.userModified = true;
                $scope.fixupFeatureConfiguration(feature);
            }
        }
    };

    $scope.isGroupSetUseful = function(newContent) {
        for(let i in $scope.selection.selectedObjects) {
            let feature = $scope.selection.selectedObjects[i];
            if(PROTECTED_ROLES.includes(feature.role)) {
                continue;
            }
            for(let k in newContent) {
                if(feature[k]!== newContent[k]) {
                    return true;
                }
            }
        }
        return false;
    };

    $scope.groupCheck = function(newContent) {
        return !$scope.isGroupSetUseful(newContent);
    };

    $scope.imputeWithConstant = function() {
        var options = {type: 'text'};
        if ($scope.selection.selectedObjects.some(function(f) { return f.role !== 'TARGET' && f.type === 'NUMERIC'; })) {
            options.type = 'number';    // can only set a numeric constant
        }
        Dialogs.prompt($scope, "Impute with constant " + options.type, "Imputed value", "", options)
            .then(function(value) {
                $scope.groupSet({
                    missing_handling: 'IMPUTE',
                    missing_impute_with: 'CONSTANT',
                    impute_constant_value: options.type === 'number' ? parseFloat(value) : value
                });
            });
    };

    $scope.sendToDeepLearningInput = function() {
        var inputs = $scope.mlTaskDesign.modeling.keras.kerasInputs
                           .filter(function(input) {
                                return !PMLSettings.isSpecialInput(input, $scope.mlTaskDesign.preprocessing.per_feature);
                            }).map(function(input) {
                                return {title: input};
                           });
        Dialogs.select($scope, 'Send to Deep Learning input', 'Please select the input', inputs, inputs[0]).then(function(selectedInput) {
                $scope.selection.selectedObjects.forEach(function(featParams) {
                    if (featParams.role == "TARGET") {
                        return;
                    }
                    if (!PMLSettings.isSpecialFeature(featParams)) {
                        featParams.sendToInput = selectedInput.title;
                    }
                });
            });
    }

    $scope.columnAnalysisCache = {};
    $scope.columnAnalysisIds = function() {
        var acp = $scope.analysisCoreParams;
        return [acp.projectKey, acp.inputDatasetSmartName, acp.script, null];
    };


    // ONLY NEEDED FOR KERAS BACKEND

    // Goal is to detect when change in Feature settings requires to
    // automatically create/delete Deep Learning Input, for example when
    // switching to Text > Custom preprocessing

    function getNewInputName(featureName, currentInputs) {
        var newInputName = featureName + "_preprocessed";

        if (currentInputs.indexOf(newInputName) == -1) {
            return newInputName;
        } else {
            var i = 1;
            while (true) {
                var suffix = "_" + i;
                if (currentInputs.indexOf(newInputName + suffix) == -1) {
                    return newInputName + suffix
                }
                i += 1;
            }
        }
    }

    function handleSwitchingToSpecialFeature(nv, ov) {
        // Only want to catch when the same feature changes and:
        //   - becomes special or is not anymore
        //   - is special and its role changes (rejected or accepted)

        // First verify that this is the same feature
        if (nv == ov || !nv || !ov || nv._name !== ov._name) {
            return;
        }

        const nvSpecial = PMLSettings.isSpecialFeature(nv);
        const ovSpecial = PMLSettings.isSpecialFeature(ov);

        // Then treat switching INPUT/REJECT case
        if (nv.role !== ov.role && nvSpecial && ovSpecial) {

            // Must create new special input if feature was rejected
            if (nv.role === "INPUT" && ov.role === "REJECT") {
                createNewSpecialInputAndAssignToFeature(nv);
            }
            // Must delete special input if feature was rejected
            if (nv.role === "REJECT" && ov.role === "INPUT") {
                deleteSpecialInputAndSendFeatureToMain(nv)
            }

            return;
        }

        // Finally treat case where feature becomes/is not anymore special
        // Discard cases when "specialty" of feature does not change
        if (nvSpecial === ovSpecial ) {
            return;
        }

        if (nvSpecial) {
            // Must create new input for the special feature
            createNewSpecialInputAndAssignToFeature(nv);
        } else {
            // Must delete Input of special feature and put it in main
            deleteSpecialInputAndSendFeatureToMain(nv);
        }
    }

    function createNewSpecialInputAndAssignToFeature(feature) {
        // Must create new input for the special feature
        var newInputName = getNewInputName(feature._name, $scope.mlTaskDesign.modeling.keras.kerasInputs);

        $scope.mlTaskDesign.modeling.keras.kerasInputs.push(newInputName);
        feature.sendToInput = newInputName;
    }

    function deleteSpecialInputAndSendFeatureToMain(feature) {
        // Must delete Input of special feature and put it in main
        var inputTodelete = feature.sendToInput;

        var inputIndex = $scope.mlTaskDesign.modeling.keras.kerasInputs.indexOf(inputTodelete);
        $scope.mlTaskDesign.modeling.keras.kerasInputs.splice(inputIndex, 1);

        feature.sendToInput = "main";
    }

    $scope.isSpecialFeature = function() {
        var featureData = $scope.selection.selectedObject;
        return PMLSettings.isSpecialFeature(featureData);
    };

    $scope.isNotSpecialInputOrIsSpecialSelection = function(input) {
        var featureData = $scope.selection.selectedObject;
        return PMLSettings.isSpecialFeature(featureData) || !PMLSettings.isSpecialInput(input, $scope.mlTaskDesign.preprocessing.per_feature);
    };

    $scope.setSubsampleFit = function() {
        let deferred = $q.defer();
        let newScope = $scope.$new();

        newScope.uiState = {
            preprocessingFitSampleRatio: $scope.mlTaskDesign.preprocessing.preprocessingFitSampleRatio,
            preprocessingFitSampleSeed: $scope.mlTaskDesign.preprocessing.preprocessingFitSampleSeed
        };

        CreateModalFromTemplate("templates/analysis/prediction/set-subsample-fit-modal.html", 
            newScope,
            null,
            function(scope) {

                scope.acceptDeferred = deferred;

                scope.validate = function () {
                    scope.acceptDeferred.resolve(scope.uiState);
                    scope.dismiss();
                };

                scope.showHideMore = function() {
                    scope.uiState.showMore = !scope.uiState.showMore;
                };

        });
        deferred.promise.then(function(data) {
            $scope.mlTaskDesign.preprocessing.preprocessingFitSampleRatio = data.preprocessingFitSampleRatio;
            $scope.mlTaskDesign.preprocessing.preprocessingFitSampleSeed = data.preprocessingFitSampleSeed;
        });
    }

});


})();
