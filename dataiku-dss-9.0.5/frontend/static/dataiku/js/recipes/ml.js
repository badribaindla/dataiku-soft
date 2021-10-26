(function() {
'use strict';

const app = angular.module('dataiku.recipes');


    app.controller("_BaseMLRecipeEditor", function($scope, $q, $state, Assert, GraphZoomTrackerService, DataikuAPI,
        $stateParams, FullModelIdUtils) {
        Assert.inScope($scope, 'script');
        Assert.inScope($scope, 'recipe');
        GraphZoomTrackerService.setFocusItemByName("recipe", $state.params.recipeName);

        $scope.desc = JSON.parse($scope.script.data);

        $scope.hooks.preRunValidate = function() {
            return $q.when({ ok : true});
        };

        $scope.hooks.recipeIsDirty = function() {
            if (!$scope.recipe) return false;
            if ($scope.creation) {
                return true;
            } else {
                var dirty = !angular.equals($scope.recipe, $scope.origRecipe);
                var origDesc = JSON.parse($scope.origScript.data);
                dirty = dirty || !angular.equals(origDesc, $scope.desc);
               return dirty;
            }
        };

        $scope.isMLBackendType = function(mlBackendType){
            return $scope.desc.backendType === mlBackendType;
        };

        $scope.goToAnalysisModel = function(){
            Assert.trueish($scope.desc.generatingModelId, 'no generatingModelId');
            // Enforcing projectKey to be current Project and not the one hard coded in fullModelId
            // to prevent from breaking when changing projectKey of analysis (e.g. importing project
            // and changing projectKey)
            const { elements, fullModelId } = FullModelIdUtils.parseWithEnforcedProjectKey($scope.desc.generatingModelId, $stateParams.projectKey);

            const params = {
                projectKey: elements.projectKey,
                analysisId: elements.analysisId,
                mlTaskId: elements.mlTaskId,
                fullModelId: fullModelId
            };

            let state = "projects.project.analyses.analysis.ml.";
            if ($scope.recipe.type == "prediction_training") {
                state += "predmltask.model.report";
            } else {
                state += "clustmltask.model.report";
            }
            $state.go(state, params);
        };

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

        $scope.getModelUsedCodeEnvName = function() {
            if ($scope.modelDetails
                && $scope.modelDetails.coreParams
                && $scope.modelDetails.coreParams.executionParams) {
                    return $scope.modelDetails.coreParams.executionParams.envName;
            } else {
                return undefined;
            }
        };

        $scope.isPartitionedModel = function () {
            return $scope.modelDetails
                && $scope.modelDetails.coreParams
                && $scope.modelDetails.coreParams.partitionedModel
                && $scope.modelDetails.coreParams.partitionedModel.enabled;
        }
    });


    app.controller("_MLRecipeWithOutputSchemaController", function($scope, $q, ComputableSchemaRecipeSave, PartitionDeps) {
        $scope.hooks.save = function(){
            var deferred = $q.defer();
            var recipeSerialized = angular.copy($scope.recipe);
            PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
            var payload = angular.toJson($scope.desc);
            ComputableSchemaRecipeSave.handleSave($scope, recipeSerialized, payload, deferred);
            $scope.script.data = payload;
            return deferred.promise;
        };
    });


    app.controller("_MLRecipeWithoutOutputSchemaController", function($scope, PartitionDeps, Assert){
        Assert.inScope($scope, 'recipe');
        Assert.inScope($scope, 'desc');

        $scope.hooks.save = function(){
            var recipeSerialized = angular.copy($scope.recipe);
            PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
            var payload = angular.toJson($scope.desc);
            $scope.script.data = payload;
            return $scope.baseSave(recipeSerialized, payload);
        };
    });


    app.controller("PredictionTrainingRecipeEditor", function($scope, $controller) {
        $controller("_BaseMLRecipeEditor", { $scope });
        $controller("_MLRecipeWithoutOutputSchemaController", { $scope });
        $controller("_K8sConfigurationCheckerController", { $scope });

        $scope.operationModeChanged = function(nv) {
            $scope.desc.splitParams.kfold = nv === 'TRAIN_KFOLD'
        }
        $scope.enableAutoFixup();
        $scope.isMLLib = function() { return $scope.desc.backendType === 'MLLIB' };
        
        // Overriding `$scope.isPartitionedModel` defined in _BaseMLRecipeEditor
        // because train recipe does not have `modelDetails`. Instead, coreParams
        // are stored in `desc.core`
        $scope.isPartitionedModel = function() {
            return $scope.desc
                   && $scope.desc.core
                   && $scope.desc.core.partitionedModel
                   && $scope.desc.core.partitionedModel.enabled;
        };

        $scope.partitionedSourceOptions = [
            ["ACTIVE_VERSION", "Active"],
            ["LATEST_VERSION", "Latest"],
            ["EXPLICIT_VERSION", "Explicit"],
            ["NONE", "None"]
        ];

        $scope.partitionedSourceDescs = [
            "Train upon the currently active saved model version",
            "Train upon the most recently trained version",
            "Choose which version to train upon",
            "Build a new partitioned models from scratch"
        ];

        $scope.hasSelectedK8sContainer = () => {
            const { backendType } = $scope.desc;
            const { containerSelection } = $scope.recipe.params;
            return $scope.isK8sContainer(backendType, containerSelection);
        };

        const updateHpSearchDistribution = (newSelection, oldSelection) => {
            if (angular.equals(newSelection, oldSelection)) {
                return;
            }

            const searchParams = $scope.desc.modeling.grid_search_params;
            searchParams.distributed = searchParams.distributed && $scope.hasSelectedK8sContainer();
        };

        $scope.$watch('recipe.params.containerSelection', updateHpSearchDistribution, true);
    });


    app.controller("ClusteringTrainingRecipeEditor", function($scope, $controller) {
        $controller("_BaseMLRecipeEditor", {$scope:$scope});
        $controller("_MLRecipeWithoutOutputSchemaController", {$scope:$scope})
        $scope.enableAutoFixup();
        $scope.isMLLib = function() { return $scope.desc.backendType === 'MLLIB' };
    });


    app.controller("PredictionScoringRecipeEditor", function($scope, $controller, $q, DataikuAPI, Assert,
        MLExportService, FullModelIdUtils) {
        $controller("_BaseMLRecipeEditor", {$scope:$scope});
        $controller("_MLRecipeWithOutputSchemaController", {$scope:$scope});
        $controller("_RecipeWithEngineBehavior", {$scope:$scope});

        // Payload is not expanded by backend, need defaults in the frontend
        // See PredictionScoringRecipePayloadParams.IndividualExplanationParams
        $scope.desc.individualExplanationParams = {
            method: "ICE",
            nbExplanations: 3,
            shapleyBackgroundSize: 100,
            subChunkSize: 5000,
            ... ($scope.desc.individualExplanationParams || {})
        };
       
        $scope.enableAutoFixup();
        $scope.canChangeEngine = function(){
            return true;
        };

        $scope.selectedEngine = function(){
            return $scope.recipeStatus && $scope.recipeStatus.selectedEngine && $scope.recipeStatus.selectedEngine.type;
        };

        $scope.$watch("recipeStatus.selectedEngine.type", (nv) => {
            if (nv && $scope.canComputeExplanations() === false) {
                $scope.desc.outputExplanations = false;
            }                
        })

        $scope.hooks.onRecipeLoaded = function(){
             $scope.hooks.updateRecipeStatus();
        };

        $scope.hooks.getPayloadData = function(){
            return angular.toJson($scope.desc);
        };

        $scope.hooks.updateRecipeStatus = function() {
            var deferred = $q.defer();
            var payload = $scope.hooks.getPayloadData();
            $scope.updateRecipeStatusBase(false, payload).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) return deferred.reject();
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        var noProbAlgos = ['DECISION_TREE_CLASSIFICATION', 'MLLIB_DECISION_TREE'];
        $scope.noSQLProbas = function(){
            return $scope.isMulticlass() && $scope.selectedEngine() == "SQL"
                                  && noProbAlgos.indexOf($scope.modelDetails.modeling.algorithm) >= 0;
        }

        DataikuAPI.ml.prediction.getPreparedInputSchema($scope.recipe).success(function(data) {
            $scope.preparedInputSchema = data;
        }).error(setErrorInScope.bind($scope));

        var safeSQLAlgorithms = ['LASSO_REGRESSION', 'RIDGE_REGRESSION', 'LEASTSQUARE_REGRESSION',
        'LOGISTIC_REGRESSION', 'DECISION_TREE_CLASSIFICATION', 'DECISION_TREE_REGRESSION', 'MLLIB_LOGISTIC_REGRESSION',
        'MLLIB_DECISION_TREE', 'MLLIB_LINEAR_REGRESSION'];
        $scope.isRiskySQL = function(){
            if ($scope.recipeStatus && $scope.recipeStatus.selectedEngine && $scope.recipeStatus.selectedEngine.variant == "IN_SNOWFLAKE") {
                return false;
            }
            if(!$scope.modelDetails){
                return false;
            }
            return safeSQLAlgorithms.indexOf($scope.modelDetails.modeling.algorithm) < 0;
        };

        //$scope.updateStatus = function(){};

        $scope.hasConditionalOutputs = function(){
            return $scope.model.conditionalOutputs && $scope.model.conditionalOutputs.length > 0;
        };

        $scope.isSQL = function(){
            return $scope.selectedEngine() == 'SQL'
                        && $scope.model.miniTask.backendType != 'VERTICA';
        };

        $scope.hasCalibration = function(){
            return $scope.modelDetails && $scope.modelDetails.coreParams.calibration.calibrationMethod != 'NO_CALIBRATION';
        };

        $scope.canForceOriginalEngine = function(){
            if (!$scope.model || !$scope.model.miniTask) return; // not ready
            var pyCase = $scope.model.miniTask.backendType == 'PY_MEMORY' && $scope.selectedEngine() == 'DSS';
            var kerasCase = $scope.model.miniTask.backendType == 'KERAS' && $scope.selectedEngine() == 'DSS';
            var mllibCase = $scope.model.miniTask.backendType == 'MLLIB' && $scope.selectedEngine() == 'SPARK';
            return pyCase || mllibCase || kerasCase;
        };

        $scope.canComputeExplanations = function() {
            if (!$scope.model || !$scope.model.miniTask) return; // not ready
            return $scope.model.miniTask.backendType == 'PY_MEMORY' && $scope.selectedEngine() == 'DSS';
        }

        $scope.onOutputExplanationsChange = function() {
            $scope.desc.forceOriginalEngine = $scope.desc.outputExplanations;
            $scope.desc.individualExplanationParams.method = "ICE";
        }

        $scope.mayUseContainer = function() {
            if (!$scope.model || !$scope.model.miniTask) return false; // not ready
            return ($scope.model.miniTask.backendType == 'KERAS' || $scope.model.miniTask.backendType == 'PY_MEMORY')
                    && $scope.selectedEngine() == 'DSS';
        };

        $scope.hasSQLWarnings = function(){
            return $scope.hasConditionalOutputs() || $scope.isRiskySQL() || $scope.noSQLProbas();
        };

        $scope.showDownloadSQL = function(){
            return $scope.appConfig.licensedFeatures && $scope.appConfig.licensedFeatures.modelsRawSQLExport;
        };

        $scope.downloadSQL = function(){
            MLExportService.downloadFile($scope, () => DataikuAPI.ml.prediction.getSql($scope.recipe),
                (exportId) => DataikuAPI.ml.prediction.getScoringModelDownloadURL("sql", exportId));
        };

        function computablesMapChanged() {
            if (!$scope.computablesMap) return;

            $scope.recipe.inputs['model'].items.forEach(function(inp){
                var computable = $scope.computablesMap[inp.ref];
                if (computable.type == "SAVED_MODEL") {
                    $scope.model = computable.model;
                }
            });

            Assert.inScope($scope, 'model');
            Assert.trueish($scope.model.miniTask.taskType == "PREDICTION", 'not a prediction task');

            const fmiComponents = {
                projectKey: $scope.model.projectKey,
                savedModelId: $scope.model.id,
                versionId: $scope.model.activeVersion
            };

            DataikuAPI.ml.prediction.getModelDetails(FullModelIdUtils.buildSavedModelFmi(fmiComponents))
                .success(function(data){
                    $scope.modelDetails = data;
                    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                    $scope.puppeteerHook_elementContentLoaded = true;
                });

            $scope.zeTrue = true;
            $scope.zeFalse = false;


            $scope.isBinaryClassification = function(){
                return $scope.modelDetails && $scope.modelDetails.coreParams.prediction_type == "BINARY_CLASSIFICATION";
            };

            $scope.isMulticlass = function(){
                return $scope.modelDetails && $scope.modelDetails.coreParams.prediction_type == "MULTICLASS";
            };

            $scope.isRegression = function(){
                return $scope.modelDetails && $scope.modelDetails.coreParams.prediction_type == "REGRESSION";
            };

            $scope.isProbaAware = function(){
                return $scope.modelDetails && $scope.modelDetails.iperf.probaAware && !$scope.noSQLProbas();
            };
        }
        $scope.$on('computablesMapChanged', computablesMapChanged);
        computablesMapChanged(); // May have loaded before this controller (itself ~ajax loaded by template)
    });


    app.controller("ClusteringClusterRecipeEditor", function($scope, $controller, DataikuAPI) {
        $controller("_BaseMLRecipeEditor", {$scope:$scope});
        $controller("_MLRecipeWithOutputSchemaController", {$scope:$scope})
        $scope.enableAutoFixup();

        DataikuAPI.ml.clustering.getPreparedInputSchema($scope.recipe, $scope.desc).success(function(data) {
            $scope.preparedInputSchema = data;
        }).error(setErrorInScope.bind($scope));
    });


    app.controller("ClusteringScoringRecipeEditor", function($scope, $controller, DataikuAPI, Assert) {
        $controller("_BaseMLRecipeEditor", {$scope:$scope});
        $controller("_MLRecipeWithOutputSchemaController", {$scope:$scope})
        $scope.enableAutoFixup();

        DataikuAPI.ml.clustering.getPreparedInputSchema($scope.recipe, $scope.desc).success(function(data) {
            $scope.preparedInputSchema = data;

            $scope.$watch("computablesMap", (nv) => {
                if (nv) {
                    $scope.recipe.inputs['model'].items.forEach(function(inp){
                        var computable = $scope.computablesMap[inp.ref];
                        if (computable.type == "SAVED_MODEL") {
                            $scope.model = computable.model;
                        }
                    });
        
                    Assert.inScope($scope, 'model');
                    Assert.trueish($scope.model.miniTask.taskType == "CLUSTERING", 'not a clustering task');
                }
            })
        }).error(setErrorInScope.bind($scope));
    });


    app.controller("EvaluationRecipeEditor", function($scope, $controller, $q, DataikuAPI, Assert, FullModelIdUtils) {
        $controller("_BaseMLRecipeEditor", {$scope:$scope});
        $controller("_MLRecipeWithOutputSchemaController", {$scope:$scope});
        $controller("_RecipeWithEngineBehavior", {$scope:$scope});
        $controller("EvaluationLabelUtils", {$scope:$scope});

        $scope.uiState = {};

        $scope.enableAutoFixup();

        $scope.selectedEngine = function(){
            return $scope.recipeStatus ? $scope.recipeStatus.selectedEngine.type : undefined;
        };

        $scope.hooks.onRecipeLoaded = function(){
             $scope.hooks.updateRecipeStatus();
        };

        $scope.hooks.getPayloadData = function(){
            return angular.toJson($scope.desc);
        };

        $scope.hooks.updateRecipeStatus = function() {
            var deferred = $q.defer();
            var payload = $scope.hooks.getPayloadData();
            $scope.updateRecipeStatusBase(false, payload).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) return deferred.reject();
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        // START differences with scoring

        if ($scope.recipe.outputs['main'] && $scope.recipe.outputs["main"].items && $scope.recipe.outputs["main"].items.length) {
            DataikuAPI.ml.prediction.getPreparedInputSchema($scope.recipe).success(function(data) {
                $scope.preparedInputSchema = data;
            }).error(setErrorInScope.bind($scope));
        }
        
        $scope.hasAllRequiredOutputs = function() {
            if (!$scope.recipe || !$scope.recipe.outputs) {
                return false;
            }
            var out = $scope.recipe.outputs;
            // at least one of the outputs is needed
            if(out.main && out.main.items && out.main.items.length) {
                return true;
            }
            if(out.evaluationStore && out.evaluationStore.items && out.evaluationStore.items.length) {
                return true;
            }
            if(out.metrics && out.metrics.items && out.metrics.items.length) {
                return true;
            }
            return false;
        };

        // END differences with scoring

        var safeSQLAlgorithms = ['LASSO_REGRESSION', 'RIDGE_REGRESSION', 'LEASTSQUARE_REGRESSION',
        'LOGISTIC_REGRESSION', 'DECISION_TREE_CLASSIFICATION', 'DECISION_TREE_REGRESSION', 'MLLIB_LOGISTIC_REGRESSION',
        'MLLIB_DECISION_TREE', 'MLLIB_LINEAR_REGRESSION'];
        $scope.isRiskySQL = function(){
            if(!$scope.modelDetails){
                return false;
            }
            return safeSQLAlgorithms.indexOf($scope.modelDetails.modeling.algorithm) < 0;
        };

        $scope.mayUseContainer = function() {
            if (!$scope.model || !$scope.model.miniTask) return false; // not ready
            return ($scope.model.miniTask.backendType == 'KERAS' || $scope.model.miniTask.backendType == 'PY_MEMORY')
                    && $scope.selectedEngine() == 'DSS';
        };

        $scope.willUseSpark = function(){
            return $scope.selectedEngine() == 'SPARK';
        };

        $scope.versionDisplayFn = function(version) {
            return version.label;
        }

        $scope.versionValueFn = function(version) {
            return version.versionId;
        }

        function computablesMapChanged() {
            if (!$scope.computablesMap) return;

            $scope.recipe.inputs['model'].items.forEach(function(inp){
                var computable = $scope.computablesMap[inp.ref];
                if (computable.type == "SAVED_MODEL") {
                    $scope.model = computable.model;
                }
            });

            Assert.inScope($scope, 'model');
            Assert.trueish($scope.model.miniTask.taskType == "PREDICTION", 'not a prediction task');

            $scope.modelVersions = [{versionId:'', label:"Active version"}];
            DataikuAPI.savedmodels.prediction.getStatus( $scope.model.projectKey, $scope.model.id).success(function(data){
                data.versions.forEach(function(v) {
                    $scope.modelVersions.push({versionId:sanitize(v.versionId), label:'<i>' + moment(v.snippet.trainInfo.startTime).format('YYYY/MM/DD HH:mm')
                    + " " + sanitize(v.snippet.userMeta.name) + (v.active ? ' (active)' : '') + '</i>&nbsp;-&nbsp;<b>' + sanitize(v.versionId) + '</b>'})
                });
                // this copy must be made for angular state detection to detect the change.
                $scope.modelVersions = $scope.modelVersions.slice();
            }).error(setErrorInScope.bind($scope));

            const fmiComponents = {
                projectKey: $scope.model.projectKey,
                savedModelId: $scope.model.id,
                versionId: $scope.model.activeVersion
            };
            DataikuAPI.ml.prediction.getModelDetails(FullModelIdUtils.buildSavedModelFmi(fmiComponents))
                .success(function(data){
                    $scope.modelDetails = data;
                    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                    $scope.puppeteerHook_elementContentLoaded = true;
                });

            $scope.zeTrue = true;
            $scope.zeFalse = false;


            $scope.isBinaryClassification = function(){
                return $scope.modelDetails && $scope.modelDetails.coreParams.prediction_type == "BINARY_CLASSIFICATION";
            };

            $scope.isMulticlass = function(){
                return $scope.modelDetails && $scope.modelDetails.coreParams.prediction_type == "MULTICLASS";
            };

            $scope.isRegression = function(){
                return $scope.modelDetails && $scope.modelDetails.coreParams.prediction_type == "REGRESSION";
           };

           $scope.isProbaAware = function(){
                return $scope.modelDetails && $scope.modelDetails.iperf.probaAware;
            };
        };
        $scope.$on('computablesMapChanged', computablesMapChanged);
        computablesMapChanged(); // May have loaded before this controller (itself ~ajax loaded by template)
    });

    app.controller("StandaloneEvaluationRecipeEditor", function($scope, $controller, $q, DataikuAPI, Assert, CodeMirrorSettingService, PMLSettings) {
        $controller("_BaseMLRecipeEditor", {$scope:$scope});
        $controller("_MLRecipeWithoutOutputSchemaController", {$scope:$scope});
        $controller("_RecipeWithEngineBehavior", {$scope:$scope});
        $controller("EvaluationLabelUtils", {$scope:$scope});

        $scope.enableAutoFixup();
        
        $scope.codeMirrorSettingService = CodeMirrorSettingService;

        $scope.selectedEngine = function(){
            return $scope.recipeStatus && $scope.recipeStatus.selectedEngine ? $scope.recipeStatus.selectedEngine.type : undefined;
        };

        $scope.hooks.onRecipeLoaded = function(){
             $scope.hooks.updateRecipeStatus();
        };

        $scope.hooks.getPayloadData = function(){
            return angular.toJson($scope.desc);
        };

        $scope.hooks.updateRecipeStatus = function() {
            var deferred = $q.defer();
            var payload = $scope.hooks.getPayloadData();
            $scope.updateRecipeStatusBase(false, payload).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) return deferred.reject();
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        $scope.mayUseContainer = function() {
            return $scope.selectedEngine() == 'DSS';
        };

        $scope.willUseSpark = function(){
            return $scope.selectedEngine() == 'SPARK';
        };

        function computablesMapChanged() {
            if (!$scope.computablesMap) return;
            $scope.recipe.inputs['main'].items.forEach(function(inp){
                var computable = $scope.computablesMap[inp.ref];
                if (computable.type == "DATASET") {
                    $scope.inputColumns = computable.dataset.schema.columns.map(_ => _.name);
                }
            });
        };
        $scope.$on('computablesMapChanged', computablesMapChanged);
        computablesMapChanged(); // May have loaded before this controller (itself ~ajax loaded by template)

        $scope.isBinaryClassification = function(){
            return $scope.desc.predictionType == "BINARY_CLASSIFICATION";
        };

        $scope.isMulticlass = function(){
            return $scope.desc.predictionType == "MULTICLASS";
        };

        $scope.isRegression = function(){
            return $scope.desc.predictionType == "REGRESSION";
       };

       $scope.isProbaAware = function(){
            return $scope.desc.isProbaAware;
        };
        
        $scope.buildNewFeature = function() {
            return {name:'', type:'NUMERIC', role:'INPUT'};
        };
        
        $scope.thresholdOptimizationMetrics = PMLSettings.task.thresholdOptimizationMetrics;
        
        $scope.baseCanSave = $scope.canSave;
        $scope.canSave = function() {
            if ( ($scope.desc.predictionType == 'BINARY_CLASSIFICATION' || $scope.desc.predictionType == 'MULTICLASS')
                && $scope.desc.isProbaAware && (!$scope.desc.probas || !$scope.desc.probas.length))
                return false;
            return $scope.baseCanSave();
        }
    });


    app.directive('scoringColumnsFilter', function(Assert) {
        return {
            restrict: 'AE',
            replace: false,
            templateUrl: "/templates/recipes/scoring-column-filter.html",
            link: function(scope) {
                Assert.inScope(scope, 'preparedInputSchema');

                scope.uiState = scope.uiState || {};
                scope.selectionState = {};

                scope.desc.keptInputColumns = scope.desc.keptInputColumns || [];

                scope.columns = scope.preparedInputSchema.columns
                scope.filteredColumns = scope.columns;

                scope.updateFilteredColumnsSelection = function() {
                    scope.desc.keptInputColumns = scope.columns.filter(function(col){return col.$selected}).map(function(col){return col.name});
                    updateSelectionUiState();
                };

                scope.updateColumnsFilter = function(query) {
                    if (!query || !query.trim().length) {
                        scope.filteredColumns = scope.columns;
                    } else {
                        var lowercaseQuery = query.toLowerCase();
                        scope.filteredColumns = scope.columns.filter(function(col) {col.$filtered = !(col.name.toLowerCase().indexOf(lowercaseQuery) >= 0 || col.type.toLowerCase() == lowercaseQuery); return !col.$filtered});
                    }
                    updateSelectionUiState();
                };

                scope.updateSelectAllColumns = function(selectAll) {
                    scope.filteredColumns.forEach(function(col){col.$selected = col.$filtered ? col.$selected : selectAll});
                    scope.updateFilteredColumnsSelection();
                };

                var updateSelectionUiState = function() {
                    scope.selectionState.all = true;
                    scope.selectionState.any = false;
                    scope.filteredColumns.forEach(function(col) {
                        scope.selectionState.any = scope.selectionState.any || col.$selected;
                        scope.selectionState.all = scope.selectionState.all && col.$selected;
                    });
                };

                scope.columns.forEach(function(col) {
                    col.$selected = scope.desc.keptInputColumns.indexOf(col.name) >= 0;
                });


                updateSelectionUiState();
            }
        };
    });

    app.directive('metricsFilter', function(){
        return {
            templateUrl: '/templates/recipes/metrics-filter.html',
            link: function(scope, element){

                scope.uiState = scope.uiState || {};
                scope.metricsSelectionState = {};
                scope.desc.metrics = scope.desc.metrics || [];

                var metrics;
                if(scope.isBinaryClassification()){
                    metrics = ["precision", "recall", "auc", "f1", "accuracy", "mcc", "costMatrixGain", "hammingLoss", "logLoss", "lift", "calibrationLoss", "customScore"];
                } else if(scope.isMulticlass()){
                    metrics = ["mrocAUC", "recall", "precision", "accuracy", "logLoss", "hammingLoss", "mcalibrationLoss", "customScore"];
                } else {
                    metrics = ["evs", "mae", "mse", "mape", "rmse", "rmsle", "r2", "pearson", "customScore"];
                }
                scope.metrics = metrics.map(function(m){return {name: m}; });

                scope.updateFilteredMetricsSelection = function() {
                    scope.desc.metrics = scope.metrics.filter(function(m){return m.$selected}).map(function(m){return m.name});
                    updateSelectionUiState();
                };

                var updateSelectionUiState = function() {
                    scope.metricsSelectionState.all = true;
                    scope.metricsSelectionState.any = false;
                    scope.metrics.forEach(function(m) {
                        scope.metricsSelectionState.any = scope.metricsSelectionState.any || m.$selected;
                        scope.metricsSelectionState.all = scope.metricsSelectionState.all && m.$selected;
                    });
                };

                scope.metrics.forEach(function(m) {
                    m.$selected = scope.desc.metrics.indexOf(m.name) >= 0;
                });


                updateSelectionUiState();
            }
        };
    });

    app.directive('outputsFilter', function(){
        return {
            templateUrl: '/templates/recipes/outputs-filter.html',
            link: function(scope, element){

                scope.uiState = scope.uiState || {};
                scope.outputSelectionState = {};

                var outputs;
                if(scope.isRegression()){
                    outputs = ["error", "error_decile", "abs_error_decile", "relative_error"];
                } else {
                    outputs = ["prediction_correct"];
                }
                scope.outputs = outputs.map(function(o){return {name: o}; });

                scope.updateFilteredOutputsSelection = function() {
                    scope.desc.outputs = scope.outputs.filter(function(o){return o.$selected}).map(function(o){return o.name});
                    updateSelectionUiState();
                };

                var updateSelectionUiState = function() {
                    scope.outputSelectionState.all = true;
                    scope.outputSelectionState.any = false;
                    scope.outputs.forEach(function(o) {
                        scope.outputSelectionState.any = scope.outputSelectionState.any || o.$selected;
                        scope.outputSelectionState.all = scope.outputSelectionState.all && o.$selected;
                    });
                };

                scope.outputs.forEach(function(o) {
                    o.$selected = scope.desc.outputs.indexOf(o.name) >= 0;
                });


                updateSelectionUiState();
            }
        };
    });
})();
