(function () {
    'use strict';

    var app = angular.module('dataiku.recipes');

    app.controller("FuzzyJoinRecipeCreationController", function ($scope, Fn, $stateParams, DataikuAPI, $controller) {
        $scope.recipeType = "fuzzyjoin";
        $controller("SingleOutputDatasetRecipeCreationController", {$scope: $scope});

        $scope.autosetName = function () {
            if ($scope.io.inputDataset) {
                var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./, "");
                $scope.maybeSetNewDatasetName(niceInputName + "_joined");
            }
        };

        $scope.getCreationSettings = function () {
            return {virtualInputs: [$scope.io.inputDataset, $scope.io.inputDataset2]};
        };

        var superFormIsValid = $scope.formIsValid;
        $scope.formIsValid = function () {
            return !!(superFormIsValid() &&
                $scope.io.inputDataset2 && $scope.activeSchema2 && $scope.activeSchema2.columns && $scope.activeSchema2.columns.length
            );
        };
        $scope.showOutputPane = function () {
            return !!($scope.io.inputDataset && $scope.io.inputDataset2);
        };

        $scope.showAdditionalInputsMessage = false;
    });

    app.controller("FuzzyJoinEditController", function ($scope, $controller, $timeout) {
        $scope.inFuzzy = true;
        $controller('JoinEditController', {$scope: $scope});

        $scope.checkBothOperands = function (fn) {
            return (c) => {
                return fn(c, 1) && fn(c, 2);
            };
        };

        const fuzzyJoinDistanceTypesAvailability = {
            'EXACT': () => true,
            'EUCLIDEAN': $scope.checkBothOperands($scope.hasNumOperand),
            'LEVENSHTEIN': $scope.checkBothOperands($scope.hasStringOperand),
            'HAMMING': $scope.checkBothOperands($scope.hasStringOperand),
            'COSINE': $scope.checkBothOperands($scope.hasStringOperand),
            'JACCARD': $scope.checkBothOperands($scope.hasStringOperand),
            'GEO': $scope.checkBothOperands($scope.hasGeoOperand),
        };

        $scope.availableDistances = function (condition) {
            return Object.entries(fuzzyJoinDistanceTypesAvailability).filter(([k, v]) => v(condition)).map(e => e[0]);
        };

        $scope.guessDistanceType = function (condition) {
            // Take the first non-EXACT distance available, if there's non default to EXACT or undefined if
            // no distances are available
            const availableDistances = $scope.availableDistances(condition);
            const matchingAvailableDistance = availableDistances.find(e => {
                return e && e !== 'EXACT';
            });
            if (matchingAvailableDistance) {
                condition.fuzzyMatchDesc.distanceType = matchingAvailableDistance;
            } else if (availableDistances.length) {
                condition.fuzzyMatchDesc.distanceType = availableDistances[0];
            }
        };

        $scope.setInitialThreshold = function (condition) {
            condition.fuzzyMatchDesc.threshold = $scope.isRelativeDistance(condition) ? 0.5 : 1;
        };

        $scope.addEmptyCondition = function (join, current, el) {
            const newCondition = {
                column1: {
                    table: join.table1,
                    name: $scope.getColumnsWithComputed($scope.getDatasetName(join.table1))[0].name
                },
                column2: {
                    table: join.table2,
                    name: $scope.getColumnsWithComputed($scope.getDatasetName(join.table2))[0].name
                },
                type: 'EQ',
                fuzzyMatchDesc: {
                    "threshold": 0
                }
            };
            $scope.guessDistanceType(newCondition);
            $scope.setInitialThreshold(newCondition);
            join.on = join.on || [];
            join.on.push(newCondition);

            current.condition = join.on[join.on.length - 1];
            if (el) {
                $timeout(() => {
                    el.scrollTop = el.scrollHeight;
                });
            }
        };
        if ($scope.join.on.length == 0) {
            $scope.addEmptyCondition($scope.join, $scope.current, null);
            $scope.current.condition = $scope.join.on[0];
        }

    });

    app.controller("FuzzyJoinRecipeController", function ($scope, $controller) {
        $controller('JoinRecipeController', {$scope: $scope});

        const originalSave = $scope.hooks.save;
        $scope.hooks.save = function () {
            const join = $scope.params.joins[0];

            $scope.recipeWT1Event('fuzzy-join-params', {
                "type": join.type,
                "on": JSON.stringify(join.on.map(on => {
                        return {
                            fuzzyMatchDesc: on.fuzzyMatchDesc,
                            normaliseDesc: on.normaliseDesc,
                            column1: $scope.getColumn($scope.getDatasetName(on.column1.table), on.column1.name).type,
                            column2: $scope.getColumn($scope.getDatasetName(on.column2.table), on.column2.name).type,
                        };
                    })
                )
            });
            return originalSave();
        };
        $scope.hasNormalisationParams = function (normaliseDesc) {
            return normaliseDesc && Object.values(normaliseDesc).some(v => v === true);
        };
        $scope.hasExtraInfoToShow = function (condition) {
            return $scope.hasNormalisationParams(condition.normaliseDesc) || $scope.isRelativeDistance(condition);
        };

        $scope.isConditionExpanded = (condition, current) => {
            return $scope.isFuzzy && current && current.condition && current.condition === condition;
        };


        $scope.joinDistanceTypes = {
            'EXACT': 'Strict equality',
            'EUCLIDEAN': 'Euclidean',
            'LEVENSHTEIN': 'Damerau-Levenshtein',
            'HAMMING': 'Hamming',
            'COSINE': 'Cosine',
            'JACCARD': 'Jaccard',
            'GEO': 'Geospatial'
        };

        $scope.isFuzzy = true;

        $scope.normalisationParams = {
            caseInsensitive: {label: 'Case insensitive', desc: 'Ignore case when matching characters'},
            normaliseText: {label: 'Remove punctuation and extra spaces', desc: 'Remove punctuation and extra spaces'},
            unicodeCasting: {label: 'Unicode casting', desc: 'Remove accents: cÁfé -> cAfe'},
            clearSalutations: {label: 'Clear salutations', desc: 'Remove English salutations, e.g. Miss, Sir, Dr'},
            clearStopWords: {label: 'Clear stop words', desc: 'Remove common stop words depending on the language'},
            transformToStem: {label: 'Transform to stem', desc: 'Transform words to base form (Snowball stemmer)'},
            sortAlphabetically: {label: 'Alphabetic sorting of words', desc: 'Alphabetic sorting of words'},
        };

        $scope.isNumber = angular.isNumber;
        $scope.isDefined = angular.isDefined;

        $scope.updateDebugMode = function () {
            $scope.params.withMetaColumn = $scope.params.debugMode;
            $scope.hooks.updateRecipeStatus();
        };
    });


    app.controller("NewFuzzyJoinController", function ($scope, DataikuAPI, $q, $stateParams, Dialogs, DatasetUtils) {
        $scope.params.virtualInputs = $scope.params.virtualInputs || [];
        $scope.creation = !$scope.params.virtualInputs || !$scope.params.virtualInputs.length;
        $scope.newJoin = {
            table1Index: 0
        };

        $scope.joinIsValid = function () {
            return !!(($scope.newJoin.dataset1 || $scope.newJoin.table1Index != null) && $scope.newJoin.dataset2);
        };

        $scope.addJoin = function () {
            if ($scope.creation) {
                $scope.newJoin.table1Index = 0;
                $scope.addDataset($scope.newJoin.dataset1);
            }

            let contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey:$stateParams.projectKey;
            DatasetUtils.updateDatasetInComputablesMap($scope, $scope.newJoin.dataset2, $stateParams.projectKey, contextProjectKey)
            .then(() => {
                if (!$scope.dataset2IsValid($scope.newJoin.dataset2)) {
                    return;
                }

                $scope.newJoin.table2Index = $scope.params.virtualInputs.length;

                $scope.addDataset($scope.newJoin.dataset2);

                var join = {
                    table1: $scope.newJoin.table1Index,
                    table2: $scope.newJoin.table2Index,
                    type: 'LEFT',
                    conditionsMode: 'AND',
                    on: [],
                    outerJoinOnTheLeft: true, // just for ADVANCED join type
                    rightLimit: {}
                };
                $scope.params.joins = $scope.params.joins || [];
                $scope.params.joins.push(join);
                $scope.dismiss();
                $scope.getJoinSuggestions();

                var table2Input = $scope.params.virtualInputs[$scope.newJoin.table2Index];
                $scope.autoSelectColumns(table2Input);
            });
        };

        $scope.dataset2IsValid = function (datasetName) {
            if (!datasetName) {
                return false;
            }
            const computable = $scope.computablesMap[datasetName];
            if (!computable) {
                $scope.error = 'Dataset ' + datasetName + ' does not seem to exist, try reloading the page.';
                return false;
            }
            if (!computable.dataset) {
                $scope.error = datasetName + ' is not a dataset';
                return false;
            }
            if (!computable.dataset.schema || !computable.dataset.schema.columns.length) {
                $scope.error = 'Dataset ' + datasetName + ' has an empty schema';
                return false;
            }
            return true;
        };

        $scope.$on('$destroy', function () {
            $scope.updateRecipeStatusLater(0);
        });

        DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, "fuzzyjoin").then(function (data) {
            $scope.availableInputDatasets = data[0];
        });
    });
})();
