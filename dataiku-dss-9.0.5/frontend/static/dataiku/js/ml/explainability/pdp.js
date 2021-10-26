(function(){
    'use strict';
        
    var app = angular.module('dataiku.ml.explainability');

    app.controller('PdpPlotController', function($scope, DataikuAPI, $stateParams, FutureProgressModal, WT1, ActiveProjectKey, epochShift) {
        function preparePartialDependence(scope) {
            scope.labelsRemaping = {
                "__DKU_N/A__": "[No value]",
                "__DKU_OTHERS__": "[Others]",
                "__DKU_UNREPRESENTED__": "[Unrepresented in train]",
            }
            const distributionColor = "#D5D9D9";
            const pdData = scope.modelData.iperf.partialDependencies;
            scope.data = {};
            scope.heights = {};
            scope.distributions = {};
            scope.computedPostTraining = {};
            scope.isDate = {};
            scope.nbRecords = {};
            scope.nbPoints = {};
            scope.onSample = {};
            let classes = scope.modelData.classes;
            if (scope.isBinaryClassification()) {
                classes = [scope.modelData.classes[1]] // Need only the "positive" class
            }
            const nbOfClasses = classes ? classes.length : 1;
            (pdData || []).forEach(function(pd) {
                scope.computedPostTraining[pd.feature] = pd.computedPostTraining;
                scope.nbRecords[pd.feature] = pd.nbRecords;
                scope.onSample[pd.feature] = pd.onSample;
                // Numerical feature
                if (pd.featureBins) {
                    if (pd.isDate) {
                        pd.featureBins = pd.featureBins.map((d) => new Date(d - epochShift) * 1000)
                    }
                    scope.nbPoints[pd.feature] = pd.featureBins.length;
                    scope.data[pd.feature] = []
                    scope.isDate[pd.feature] = pd.isDate;
                    pd.data.forEach((data, i) => {
                        const binsWithoutDropped = pd.featureBins.filter((_, j) => {
                            return pd.indicesToDrop.indexOf(j) === -1;
                        });
                        const values = data.filter((_, j) => {
                            return pd.indicesToDrop.indexOf(j) === -1;
                        }).map((y, j) => {
                            return [binsWithoutDropped[j], y]
                        });
                        scope.data[pd.feature][i] =  {
                            key: classes ? classes[i] : "Partial dependence",
                            values,
                            color: scope.colors[i],
                            type: "line",
                            yAxis: 1,
                        }
                    })

                    if (pd.distribution) {
                        scope.data[pd.feature].push({
                            key : "Distribution",
                            yAxis: 2,
                            type: "bar",
                            color: distributionColor,
                            values : pd.distribution.map((d, i) => [pd.featureBins[i], d]),
                        });
                    }
                // Categorical feature
                } else if (pd.categories) {
                    if (pd.distribution) {
                        scope.distributions[pd.feature] = [{
                            color: distributionColor,
                            values : pd.distribution.map((d, i) => ({ label: pd.categories[i], value: d })),
                        }];
                    }
                    scope.nbPoints[pd.feature] = pd.categories.length;
                    scope.heights[pd.feature] = pd.categories.length * nbOfClasses *  15 + 400;
                    scope.data[pd.feature] = [];
                    pd.data.forEach((pdp, i) => {
                        scope.data[pd.feature][i] =  {
                            key: classes ? classes[i] : "Partial dependence",
                            values: [],
                        }
                        pdp.forEach((pdpValue, j) => {
                            let modality = pd.categories[j];
                            const isUnrepresented = pd.unrepresentedModalities.indexOf(modality) > -1;
                            if (scope.labelsRemaping[modality]) {
                                modality = scope.labelsRemaping[modality];
                                scope.nbPoints[pd.feature] -= 1;
                            }
                            if (isUnrepresented) {
                                modality += "*";
                            }
                            if (pd.indicesToDrop.indexOf(j) > -1) {
                                pdpValue = Number.NaN;
                                modality += "**"
                            }
                            scope.data[pd.feature][i].values.push({ label: modality, value: pdpValue, color: scope.colors[i]});
                        });
                    })
                }
            });

            scope.alreadyComputedFeatures = new Set(scope.features.filter(f => scope.data[f]));
            scope.alreadyPostTrainingComputedFeatures = scope.features.filter(f => scope.data[f] && scope.computedPostTraining[f])
        }
        const allFeaturesInfo = $scope.modelData.preprocessing.per_feature;
        $scope.authorizedFeaturetypes = ["CATEGORY", "NUMERIC"];
        $scope.features = Object.keys(allFeaturesInfo).filter((feature) => {
            return allFeaturesInfo[feature].role === "INPUT" && $scope.authorizedFeaturetypes.includes(allFeaturesInfo[feature].type);
        });
        $scope.isKFolding = $scope.modelData.splitDesc.params.kfold;
        $scope.featuresType = {};
        $scope.features.forEach(feature => $scope.featuresType[feature] = $scope.modelData.preprocessing.per_feature[feature].type)
        $scope.computationParams = {
            sample_size: 10000,
            random_state: 1337,
            n_jobs: 1,
            debug_mode: false,
        }

        preparePartialDependence($scope);
        if (! $scope.uiState.selectedFeature) {
            $scope.uiState.selectedFeature = $scope.features.find(f => $scope.data[f] && $scope.computedPostTraining[f]);
        }

        $scope.canCompute = function() {
            return $scope.uiState.selectedFeature && $scope.computationParams.n_jobs !== 0;
        }

        $scope.$watch('uiState.selectedFeature', (nv) => {
            if ($scope.nbRecords[nv]) {
                $scope.computationParams.sample_size = $scope.nbRecords[nv];
            }
            d3.selectAll(".pdp__chart svg > *").remove();
        });

        $scope.computedOnStr = function() {
            const nbRecords = $scope.nbRecords[$scope.uiState.selectedFeature];
            const onSample = $scope.onSample[$scope.uiState.selectedFeature];
            let dataset = "";
            if ($scope.isKFolding) {
                dataset = "dataset";
            } else {
                if ($scope.computedPostTraining[$scope.uiState.selectedFeature]) {
                    dataset = "test set";
                } else {
                    dataset = "train set"
                }
            }

            if (nbRecords) {
                if (!onSample) {
                    return `${nbRecords} rows (the full ${dataset})`;
                } else {
                    return `${nbRecords} rows (a sample of the ${dataset})`;
                }
            } else {
                return `the full ${dataset}`
            }
        }

        $scope.number

        $scope.hideBanner = function() {
            $scope.uiState.bannerHidden = true;
        }

        $scope.computeSelectedFeature = function() {
            const selectedFeat = $scope.uiState.selectedFeature;
            if (selectedFeat) {
                $scope.computePartialDependency([selectedFeat], $scope.computationParams);
            }
        }

        $scope.computeAll = function() {
            if ($scope.features.length > 0) {
                $scope.computePartialDependency($scope.features, $scope.computationParams);
            }
        }

        $scope.computePartialDependency = function(features, computationParams) {
            const wt1Payload = {
                computeAll: features.length > 1,
                predictionType: $scope.modelData.coreParams.prediction_type,
            }
            if (! wt1Payload.computeAll) {
                wt1Payload.featureType = $scope.featuresType[features[0]]
            }
            if ($stateParams.mesId) {
                DataikuAPI.modelevaluations.pdpComputationStart(makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId),
                    features, computationParams).success((result) => {
                    FutureProgressModal.show($scope, result, "Computing Partial Dependence").then((data) => {
                        $scope.modelData.iperf.partialDependencies = data.partialDependencies;
                        preparePartialDependence($scope);
                    })
                }).error(setErrorInScope.bind($scope));
                WT1.event("doctor-compute-pdp", wt1Payload);
            } else {
                DataikuAPI.ml.prediction.pdpComputationStart($stateParams.fullModelId || $scope.fullModelId, features, computationParams).success((result) => {
                    FutureProgressModal.show($scope, result, "Computing Partial Dependence").then((data) => {
                        $scope.modelData.iperf.partialDependencies = data.partialDependencies;
                        preparePartialDependence($scope);
                    })
                }).error(setErrorInScope.bind($scope));
                WT1.event("doctor-compute-pdp", wt1Payload);
            }
        }

    });

})();
