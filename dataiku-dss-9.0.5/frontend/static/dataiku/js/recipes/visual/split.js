(function(){
    'use strict';

    var services = angular.module('dataiku.services');

    // Service to handle Expressions for Range Splits, which represent one or two bands intervals for types: num & dates
    services.factory('RangeExpressions', function(Expressions) {

        // Available date formats for Ranges with Date columns
        var dateFormats = {
            dateWithTimeFormat: "YYYY-MM-DD HH:mm",
            dateFormat: "YYYY-MM-DD"
        };

        // support for initializing/switching between open (> or <) and close (>= or <=) operators (for range mode in split recipe)
        function switchOpenCloseComparisonOperator(operator) {
            if (!operator) return null;
            if (operator.search('<=') > -1) return operator.replace('<=', '< ');
            if (operator.search('>=') > -1) return operator.replace('>=', '> ');
            if (operator.search('<') > -1) return operator.replace('< ', '<=');
            if (operator.search('>') > -1) return operator.replace('> ', '>=');
            return null;
        }

        function isOpenComparisonOperator(operator) {
            if (!operator) return false;
            return (operator.search("=") == -1);
        }

        function getTypeComparisonOperator(operator) {
            if (!operator) return;
            if (operator.search(">") > -1) return 'min';
            if (operator.search("<") > -1) return 'max';
        }

        function modifyColTypeInComparisonOperator(operator, colType) {
            if (!operator) return;
            return initializeComparisonOperator(colType, getTypeComparisonOperator(operator), isOpenComparisonOperator(operator));
        }

        function initializeComparisonOperator(colType, comparisonType, open) {
            var colGenericType = Expressions.genericType(colType);
            var initOperatorDic = {"min": ">  ","max": "<  "}
            var genericTypeDic = {"num": "number","date": "date"}
            var operator = initOperatorDic[comparisonType] + "["+genericTypeDic[colGenericType]+"]";

            if(!open) {
                operator = switchOpenCloseComparisonOperator(operator);
            }
            return operator;
        }

        function setValuesFromOtherCondition(condition, otherCondition, colType) {
            var colGenericType = Expressions.genericType(colType);
            var valuesToSet = {
                "num": ["num"],
                "date": ["date", "time"]
            }
            var fieldsToSet = valuesToSet[colGenericType];
            if (!fieldsToSet) return;
            fieldsToSet.forEach(function(field) {
                condition[field] = otherCondition[field];
            });
        }

        function indexOfComparisonType(conditions, comparisonType) {
            if(!conditions) return -1;
            for (var i=0; i<conditions.length; i++) {
                var condition = conditions[i];
                if (!condition || !condition.operator) return;
                if (getTypeComparisonOperator(condition.operator) == comparisonType) {
                    return i;
                }
            }
            return -1;
        }


        // Methods particular to organisation of splits ( with filter.uiData.conditions )

        // Retrieve conditions from a split list with an index
        function getRangeConditions(splits, splitIndex) {
            if (!(splits && splits[splitIndex])) return;
            var split = splits[splitIndex];
            if (!(split.filter && split.filter.uiData && split.filter.uiData.conditions)) return;
            return split.filter.uiData.conditions;
        }


        function indexOfMinCond(splits, splitIndex) {
            var conditions = getRangeConditions(splits, splitIndex);
            if (!conditions) return -1;
            return indexOfComparisonType(conditions, "min");
        }

        function getMinCond(splits, splitIndex) {
            var conditions = getRangeConditions(splits, splitIndex);
            var index = indexOfComparisonType(conditions, "min");
            if (index === -1 || !conditions[index]) return;
            return conditions[index];
        }

        function hasMinCond(splits, splitIndex) {
            return (indexOfMinCond(splits, splitIndex) > -1);
        }

        function indexOfMaxCond(splits, splitIndex) {
            var conditions = getRangeConditions(splits, splitIndex);
            if (!conditions) return -1;
            return indexOfComparisonType(conditions, "max");
        }

        function getMaxCond(splits, splitIndex) {
            var conditions = getRangeConditions(splits, splitIndex);
            var index = indexOfComparisonType(conditions, "max");
            if ( index === -1 || !conditions[index]) return;
            return conditions[index];
        }

        function hasMaxCond(splits, splitIndex) {
            return (indexOfMaxCond(splits, splitIndex) > -1);
        }

        function createCondition(isOpen, comparisonType, colType, inputCol) {
            var operator = initializeComparisonOperator(colType, comparisonType, isOpen);
            return {
                "input": inputCol,
                "operator": operator
            };
        }

        function getValuesFromCond(condition, colType) {
            if (!condition) return;
            var colGenericType = Expressions.genericType(colType);
            if (colGenericType == 'num') {
                return condition.num;
            } else if (colGenericType == "date") {
                if (!condition.date || !condition.time) return;
                return moment(condition.date + " " + condition.time, "YYYY-MM-DD HH:mm").toDate()
            }
        }

        return {
            dateFormats,
            switchOpenCloseComparisonOperator,
            isOpenComparisonOperator,
            initializeComparisonOperator,
            modifyColTypeInComparisonOperator,
            setValuesFromOtherCondition,
            getTypeComparisonOperator,
            getRangeConditions,
            indexOfMaxCond,
            indexOfMinCond,
            getMinCond,
            getMaxCond,
            hasMinCond,
            hasMaxCond,
            createCondition,
            getValuesFromCond
        }
    });

    // Service to help build Gauges for shares (RANDOM, RANDOM_COLUMNS, CENTILES) and RANGE modes
    // In particular to compute extent of values and adapt values to scales
    services.factory('GaugeHelper', function(Fn) {

                var spaceToInfinity = 100;
                var spaceMinEqualsMax = 10;
                function getValuesModified(data, index, getValuesFn, min, max) {
                    var values = getValuesFn(data, index);
                    if(!values) return;
                    var minMaxValue = getMinMaxValue(data, getValuesFn, min, max);
                    if (!minMaxValue) return;

                    // Check whether values is array or array of array
                    var isArrayOfArrays = angular.isArray(values[0]);

                    if (!isArrayOfArrays) {
                        return computeValues(values, minMaxValue);
                    } else {
                        return values.map(function(v) { return computeValues(v, minMaxValue);});
                    }
                }

                function computeValues(values, minMaxValue) {
                        var convertedValues = []
                        // Convert Infinity values to work with scale
                        convertedValues[0] = (values[0] == - Infinity) ? minMaxValue.min - spaceToInfinity : values[0];
                        convertedValues[1] =  (values[1] == + Infinity) ? minMaxValue.max + spaceToInfinity : values[1];
                        return convertedValues;
                }

                // utils
                function getMinMaxValue(data, getValuesFn, min, max) {
                    var mustFindMin = true;
                    var mustFindMax = true;
                    var hasInfinityMin = false;
                    var hasInfinityMax = false;
                    var maxValue = null;
                    var minValue = null;
                    if (min != null) {
                        mustFindMin = false;
                        minValue = min;
                    }
                    if (max != null) {
                        mustFindMax = false;
                        maxValue = max;
                    }
                    if (!data) return;

                    if (mustFindMin || mustFindMax) {
                        for (var i=0; i < data.length; i++) {
                            var values = getValuesFn(data, i);
                            if (!values) continue;
                            // Flattening if values is array of arrays
                            values = [].concat.apply([], values);

                            // Checking if has +/- Infinity
                            if (Fn.inArray(values)(-Infinity)){
                                hasInfinityMin = true;
                            }
                            if (Fn.inArray(values)(Infinity)){
                                hasInfinityMax = true;
                            }
                            // Removing +/- Infinity from values
                            values = values.filter(function(v) { return Math.abs(v) != Infinity;});

                            var tmpMax = Math.max(...values);
                            var tmpMin = Math.min(...values);

                            // Testing if must define new maxValues, leave aside Infinite values
                            if (mustFindMax && (maxValue == null || maxValue < tmpMax)) {
                                maxValue = tmpMax;
                            }
                            if (mustFindMin && (minValue == null || minValue > tmpMin)) {
                                minValue = tmpMin;
                            }
                        }
                    }

                    return {
                        min: minValue,
                        max: maxValue,
                        hasInfinityMin: hasInfinityMin,
                        hasInfinityMax: hasInfinityMax
                    };
                }

                function buildScale(extremities, width) {
                    var minValue = extremities.min;
                    var maxValue = extremities.max;

                    // When extremities are equal, artificially spread them
                    if(extremities.min != null && extremities.min == extremities.max) {
                        minValue -= spaceMinEqualsMax;
                        maxValue += spaceMinEqualsMax;
                    }

                    var axisRange = [minValue, maxValue];
                    var range = [0, width];

                    if (extremities.hasInfinityMin) {
                        range.splice(1, 0, width / 4);
                        axisRange.unshift(extremities.min - spaceToInfinity);
                    }
                    if (extremities.hasInfinityMax) {
                        range.splice(-1, 0, 3 * width / 4);
                        axisRange.push(extremities.max + spaceToInfinity);
                    }
                    var scale = d3.scale.linear().domain(axisRange).range(range);
                    return scale;
                }

                return {
                    getValuesModified,
                    getMinMaxValue,
                    buildScale
                };

    });

})();


(function(){
    'use strict';

    var widgets = angular.module('dataiku.directives.widgets');

    widgets.directive("splitSharesSelector", function() {
        return {
            scope: true,
            templateUrl: "/templates/recipes/fragments/split-shares-selector.html",
            link: function($scope, element, attrs) {

                $scope.getSelectedSplits = function() {
                    return $scope.getSplits(attrs.selectedMode);
                }

                $scope.getMaxShare = function(currentIndex) {
                    var splits = $scope.getSelectedSplits();
                    var cumulatedShare = 0;
                    for (var i = 0; i < splits.length ; i++) {
                        if (i != currentIndex) {
                            cumulatedShare += splits[i].share;
                        }
                    }
                    return (cumulatedShare > 100) ? 0 : 100 - cumulatedShare;
                };

                $scope.addShare = function(splitIndex) {
                    var splits = $scope.getSelectedSplits();
                    var share = 100;
                    for (var i=0; i < splitIndex; i++) {
                        share -= splits[i].share;
                    }
                    // ensuring to have a positive share (if user does not respect sum share < 100)
                    share = Math.max(share, 0);
                    splits.splice(splitIndex, 0, {share: share, outputIndex: 0});
                };

                $scope.removeShare = function(splitIndex) {
                    var splits = $scope.getSelectedSplits();
                    splits.splice(splitIndex, 1);
                };

                $scope.getShareFromIndex = function(splits, splitIndex) {
                    if (!splits) return;

                    // Regular Share
                    if (splitIndex > -1 || splits[splitIndex]) {
                        if (splits[splitIndex].share == null) return null;
                        var previousCumulatedShare = 0;
                        for (var i=0; i < splitIndex; i++) {
                            previousCumulatedShare += splits[i].share;
                        }
                        return [previousCumulatedShare, previousCumulatedShare + splits[splitIndex].share];
                    }

                    // splitIndex == -1 => return remaining share
                    if (splitIndex == -1) {
                        var totalShare = splits.reduce(function(memo, split) { return memo + ((split.share != null) ? split.share : 0);}, 0);
                        return (totalShare < 100) ? [[totalShare, 100]] : [[100,100]];
                    }
                };

                $scope.getRemainingShare = function() {
                    var splits = $scope.getSelectedSplits();
                    if (!splits) return;
                    var totalShare = splits.reduce(function(memo, split) { return memo + ((split.share != null) ? split.share : 0);}, 0);
                    return Math.max(100 - totalShare, 0);
                };

                function getShareInInterval(newValue, splits , index) {
                    var totalShareWithoutIndex = splits.reduce(function(mem, split, i){
                        if (i != index) {
                            return mem + split.share;
                        } else {
                            return mem;
                        }
                    }, 0);
                    return Math.max(Math.min(newValue, 100 - totalShareWithoutIndex), 0);
                }

                $scope.updateShareFromIndex = function(splits, splitIndex, min, max) {
                    if (!splits || !splits[splitIndex]) return;

                    var newShare = Math.max(Math.floor(max - min), 0);
                    var previousTotalShare = splits.reduce(function(mem, split){ return mem + split.share;}, 0);
                    var shareToDispatch  = newShare - splits[splitIndex].share;

                    // Update current value
                    splits[splitIndex].share = newShare;

                    // Update following values if new total > 100 or share to dispatch < 0
                    var numImpactedSplits = splits.length - splitIndex - 1;
                    if (numImpactedSplits >= 1 && (previousTotalShare + shareToDispatch > 100 || (shareToDispatch < 0))) {
                        var impactShare = null;
                        if (shareToDispatch > 0) {
                            impactShare = Math.ceil(shareToDispatch / numImpactedSplits);
                        } else {
                            impactShare =  - Math.floor( - shareToDispatch / numImpactedSplits);
                        }
                        var previousShare = null;
                        var cumulatedImpactShare = 0;
                        // update all following values except last to round numbers
                        for (var i = splitIndex + 1; i < splits.length - 1 ; i++) {
                            previousShare = splits[i].share;
                            splits[i].share = getShareInInterval(splits[i].share - impactShare, splits, i);
                            cumulatedImpactShare += (splits[i].share - previousShare);
                        }
                        // update last value
                        splits[splits.length - 1].share = getShareInInterval(splits[splits.length - 1].share - (shareToDispatch - cumulatedImpactShare), splits, splits.length - 1);
                    }
                };
            }
        }
    });

    widgets.directive("rangeBracket", function(RangeExpressions) {
        return {
            scope: {
                type: "=",
                rangeIndex: "=",
                ranges: "=",
                isValidCol: "="
            },
            template: '<button class="btn btn--icon btn--secondary bracket" ng-click="switchExtremity()" ng-if="isOpeningBracket()" title="{{isOpenExtremity() ? \'Exclude\' : \'Include\'}}" data-toggle="tooltip" data-placement="top">[</button>' +
                      '<button class="btn btn--icon btn--secondary bracket" ng-click="switchExtremity()" ng-if="isClosingBracket()" title="{{isOpenExtremity() ? \'Exclude\' : \'Include\'}}" data-toggle="tooltip" data-placement="top">]</button>',
            link: function($scope) {

                function getExtremity() {
                    return getExtremityFromIndexAndType($scope.rangeIndex, $scope.type);
                }

                function getExtremityFromIndexAndType(index, extremityType) {
                    if (extremityType == "min") {
                        return RangeExpressions.getMinCond($scope.ranges, index);
                    }
                    if (extremityType == "max") {
                        return RangeExpressions.getMaxCond($scope.ranges, index);
                    }
                    return null;
                }

                function getConnectedExtremity() {
                    if ($scope.type == "min") {
                        return getExtremityFromIndexAndType($scope.rangeIndex - 1, 'max');
                    }
                    if ($scope.type == "max") {
                        return getExtremityFromIndexAndType($scope.rangeIndex + 1, 'min');
                    }
                    return null;
                }

                function isDefined() {
                    if (!$scope.isValidCol) return false;
                    if ($scope.type == "min") {
                        return RangeExpressions.hasMinCond($scope.ranges, $scope.rangeIndex);
                    }
                    if ($scope.type == "max") {
                        return RangeExpressions.hasMaxCond($scope.ranges, $scope.rangeIndex);
                    }
                }

                $scope.switchExtremity = function() {
                    var extremity = getExtremity();
                    var connectedExtremity = getConnectedExtremity();
                    if(extremity) {
                        extremity.operator = RangeExpressions.switchOpenCloseComparisonOperator(extremity.operator);
                    }
                    if(connectedExtremity) {
                        connectedExtremity.operator = RangeExpressions.switchOpenCloseComparisonOperator(connectedExtremity.operator);
                    }
                };

                $scope.isOpenExtremity = function() {
                    var extremity = getExtremity();
                    return RangeExpressions.isOpenComparisonOperator(extremity.operator);
                };

                $scope.isOpeningBracket = function() {
                    if (!isDefined()) return false;
                    var extremity = getExtremity();
                    var hasExtremity = (extremity && extremity.operator);
                    var isMinClosedExtremity = ($scope.type === "min" && !$scope.isOpenExtremity());
                    var isMaxOpenExtremity = ($scope.type === "max" && $scope.isOpenExtremity());
                    return (hasExtremity && (isMinClosedExtremity || isMaxOpenExtremity));
                };

                $scope.isClosingBracket = function() {
                    if (!isDefined()) return false;
                    var extremity = getExtremity();
                    var hasExtremity = (extremity && extremity.operator);
                    var isMinOpenExtremity = ($scope.type === "min" && $scope.isOpenExtremity());
                    var isMaxClosedExtremity = ($scope.type === "max" && !$scope.isOpenExtremity());
                    return (hasExtremity && (isMinOpenExtremity || isMaxClosedExtremity));
                };

            }
        }
    });

    widgets.directive('splitRangesSelector', function(Assert, Expressions, RangeExpressions) {
        return {
            scope: true,
            templateUrl : "/templates/recipes/fragments/split-ranges-selector.html",
            link : function($scope, element, attrs) {

                $scope.getSelectedSplits = function() {
                    return $scope.getSplits(attrs.selectedMode);
                }

                $scope.getRangeColType = function() {
                    return $scope.getColType($scope.params.column);
                };

                $scope.getRangeColGenericType = function() {
                    return Expressions.genericType($scope.getRangeColType());
                };

                $scope.rangeInputsClass = function() {
                    return "input-"+$scope.getRangeColGenericType();
                };

                $scope.createMinCondition = function(isOpen) {
                    return RangeExpressions.createCondition(isOpen, "min", $scope.getRangeColType(), $scope.params.column);
                };

                $scope.createMaxCondition = function(isOpen) {
                    return RangeExpressions.createCondition(isOpen, "max", $scope.getRangeColType(), $scope.params.column);
                };

                $scope.addRangeSplit = function(splitIndex) {
                    let splits = $scope.getSelectedSplits();
                    let conditions = [];
                    let genericType = $scope.getRangeColGenericType();
                    let maxPreviousCond = null;
                    let isOpenPreviousCond = false;
                    let minCondition;
                    if (genericType === "date") {
                        if (RangeExpressions.hasMaxCond(splits, splitIndex - 1)) {
                            maxPreviousCond = RangeExpressions.getMaxCond(splits, splitIndex - 1);
                            isOpenPreviousCond = (maxPreviousCond && RangeExpressions.isOpenComparisonOperator(maxPreviousCond.operator));
                        }
                        minCondition = $scope.createMinCondition(!isOpenPreviousCond);
                        var maxCondition = $scope.createMaxCondition(false);
                        conditions = [minCondition, maxCondition];

                    } else if (genericType === "num" && splitIndex > 0) {
                        if (!RangeExpressions.hasMaxCond(splits, splitIndex - 1)) {
                            // Create max conditions for previous if do not exist yet
                            maxPreviousCond = $scope.createMaxCondition(false);
                            var previousConditions = RangeExpressions.getRangeConditions(splits, splitIndex - 1);
                            previousConditions.push(maxPreviousCond);
                        } else {
                            maxPreviousCond = RangeExpressions.getMaxCond(splits, splitIndex - 1);
                        }
                        isOpenPreviousCond = (maxPreviousCond && RangeExpressions.isOpenComparisonOperator(maxPreviousCond.operator));
                        minCondition = $scope.createMinCondition(!isOpenPreviousCond);
                        conditions = [minCondition];
                    }

                    let newRange = $scope.getNewRangeSplit(conditions);

                    // Autofill new value if needed
                    if (maxPreviousCond) {
                        RangeExpressions.setValuesFromOtherCondition(minCondition, maxPreviousCond, $scope.getRangeColType());

                        // For dates, set also end of interval to previous max date
                        if(genericType === "date") {
                            RangeExpressions.setValuesFromOtherCondition(maxCondition, maxPreviousCond, $scope.getRangeColType());
                        }
                    } else if (genericType === "date") {
                        Assert.trueish(minCondition, 'minCondition');
                        Assert.trueish(maxCondition, 'maxCondition');
                        // Autofill value to today for first date split
                        let today = moment().format(RangeExpressions.dateFormats["dateFormat"]);
                        let time = "00:00";
                        minCondition.date = today; //NOSONAR not undefined
                        minCondition.time = time; //NOSONAR not undefined
                        maxCondition.date = today; //NOSONAR not undefined
                        maxCondition.date = time; //NOSONAR not undefined
                    }
                    splits.splice(splitIndex, 0, newRange);
                };

                $scope.removeRangeSplit = function(splitIndex) {
                    var splits = $scope.getSelectedSplits();
                    splits.splice(splitIndex, 1);
                };

                $scope.getRangeFromIndex = function(splits, splitIndex) {

                    // Returning normal values for particular index with Infinity if not set
                    if (splitIndex > -1) {
                        var minValue = - Infinity;
                        if (RangeExpressions.hasMinCond(splits,splitIndex)) {
                            var minCond = RangeExpressions.getMinCond(splits, splitIndex);
                            minValue = RangeExpressions.getValuesFromCond(minCond, $scope.getRangeColType());
                            if (minValue == null) {
                                return null;
                            }
                        }
                        var maxValue = Infinity;
                        if (RangeExpressions.hasMaxCond(splits,splitIndex)) {
                            var maxCond = RangeExpressions.getMaxCond(splits, splitIndex);
                            maxValue = RangeExpressions.getValuesFromCond(maxCond, $scope.getRangeColType());
                            if (maxValue == null) {
                                return null;
                            }
                        }
                        if (minValue > maxValue) return null;
                        return [[minValue, maxValue]];
                    }


                    // Returning missing pieces in [-Infinity, Infinity] interval to build Remaining gauge
                    else if (splitIndex == -1) {

                        // First retrieving all values from the ranges
                        var ranges = [];
                        for(var i=0; i < splits.length; i++) {
                            ranges.push($scope.getRangeFromIndex(splits, i));
                        }

                        // Then filter null values && sort the ranges according to their min value
                        ranges = ranges.filter(function(values) { return values != null;})
                                       .map(function(values) { return [].concat.apply([], values);})
                                       .sort(function(v1, v2) { return (v1[0] < v2[0]) ? -1 : 1;});

                        if(ranges.length == 0) return;
                        // Then build disjoint intervals made of unions of intervals that intersect
                        var disjointAggRanges = [];
                        var currentAggRange = ranges[0];
                        for (var j=1; j<ranges.length; j++) {

                            if( currentAggRange[1] >= ranges[j][0] ) {
                                // if must stay in same Adgg Range => Set new upper bound to max of two intervals
                                currentAggRange[1] = Math.max(currentAggRange[1], ranges[j][1]);
                            } else {
                                // Archive AggRange and set new one
                                disjointAggRanges.push(currentAggRange);
                                currentAggRange = ranges[j];
                            }
                        }
                        // Archive last AggRange
                        disjointAggRanges.push(currentAggRange);

                        // Finally, build complement set of intervals
                        var remainingValues = [];

                        // Add [endValue(i), endValue(i+1)]
                        for (var k=0; k < disjointAggRanges.length - 1; k++) {
                            remainingValues.push([disjointAggRanges[k][1], disjointAggRanges[k+1][0]]);
                        }

                        return (remainingValues.length > 0) ? remainingValues : null;
                    }
                };

                // When switching for the first time to RANGE mode with a Date variable
                // must initialize conditions for first split
                var unregisterDateRangeWatch = $scope.$watch(function() {
                    var isDateColumn = Expressions.genericType($scope.getColType($scope.params.column)) === "date";
                    return ($scope.params.mode === "RANGE" && isDateColumn);
                }, function(shouldInitialize) {
                    if (!shouldInitialize) return;

                    var hasMoreThanOneSplit = ($scope.params.rangeSplits && $scope.params.rangeSplits.length > 1);
                    var conditionsOfFirstSplit = RangeExpressions.getRangeConditions($scope.params.rangeSplits, 0);
                    var firstSplitHasConditions = (conditionsOfFirstSplit && conditionsOfFirstSplit.length > 0);
                    if (hasMoreThanOneSplit || firstSplitHasConditions) {
                        unregisterDateRangeWatch();
                        return;
                    }

                    var conditions = $scope.getConditionsForFirstDateSplit($scope.params.column);
                    $scope.params.rangeSplits = [$scope.getNewRangeSplit(conditions)];
                    unregisterDateRangeWatch();
                });

            }
        }
    });

    widgets.directive('rangeInputs', function(Expressions, RangeExpressions, $timeout) {
        return {
            scope: {
                ranges: "=",
                rangeIndex: "=",
                column: "=",
                colType: "=",
                setTime: "=",
                isValidCol: "="
            },
            templateUrl: "/templates/recipes/fragments/range-inputs.html",
            link: function($scope, element) {

                $scope.getDateFormat = function() {
                    if ($scope.setTime) {
                        return RangeExpressions.dateFormats['dateWithTimeFormat'];
                    } else {
                        return RangeExpressions.dateFormats['dateFormat'];
                    }
                };

                $scope.hasMinCond = function() {
                    return RangeExpressions.hasMinCond($scope.ranges, $scope.rangeIndex);
                };

                $scope.getMinCond = function() {
                    return RangeExpressions.getMinCond($scope.ranges, $scope.rangeIndex);
                };

                $scope.getMaxCond = function() {
                    return RangeExpressions.getMaxCond($scope.ranges, $scope.rangeIndex);
                };

                $scope.hasMaxCond = function() {
                    return RangeExpressions.hasMaxCond($scope.ranges, $scope.rangeIndex);
                };

                $scope.getGenericColType = function() {
                    return Expressions.genericType($scope.colType);
                };

                $scope.deleteMinIfNecessary = function(currentValue) {
                    var shouldDeleteMin = ($scope.rangeIndex == 0);
                    if(shouldDeleteMin && (currentValue == null)) {
                        var conditions = RangeExpressions.getRangeConditions($scope.ranges, $scope.rangeIndex);
                        var index = RangeExpressions.indexOfMinCond($scope.ranges, $scope.rangeIndex);
                        if (index > -1) {
                            conditions.splice(index, 1);
                        }
                    }
                };

                $scope.deleteMaxIfNecessary = function(currentValue) {
                    var shouldDeleteMax = ($scope.ranges && ($scope.rangeIndex == $scope.ranges.length - 1));
                    if(shouldDeleteMax && (currentValue == null)) {
                        var conditions = RangeExpressions.getRangeConditions($scope.ranges, $scope.rangeIndex);
                        var index = RangeExpressions.indexOfMaxCond($scope.ranges, $scope.rangeIndex);
                        if (index > -1) {
                            conditions.splice(index, 1);
                        }
                    }
                };

                $scope.createMinCondition = function() {
                    var conditions = RangeExpressions.getRangeConditions($scope.ranges, $scope.rangeIndex);
                    if (!$scope.hasMinCond()) {
                        var minCond = RangeExpressions.createCondition(false, "min", $scope.colType, $scope.column);
                        conditions.unshift(minCond);

                        // Focus on new input Min (with little timeout to let dom create input)
                        $timeout(function() {
                            $("#inputMin"+$scope.rangeIndex).focus();
                        }, 0);
                    }
                };

                $scope.createMaxCondition = function() {
                    var conditions = RangeExpressions.getRangeConditions($scope.ranges, $scope.rangeIndex);
                    if (!$scope.hasMaxCond()) {
                        var maxCond = RangeExpressions.createCondition(true, "max", $scope.colType, $scope.column);
                        conditions.push(maxCond);

                        // Focus on new input Max (with little timeout to let dom create input)
                        $timeout(function() {
                            $("#inputMax"+$scope.rangeIndex).focus();
                        }, 0);
                    }
                };

                function syncFrontDatesWithConditions() {
                    var minCond = $scope.getMinCond();
                    if (minCond && minCond.frontDate) {
                        minCond.date = moment(minCond.frontDate, $scope.getDateFormat()).format("YYYY-MM-DD");
                        minCond.time = $scope.setTime ? moment(minCond.frontDate, $scope.getDateFormat()).format("HH:mm") : "00:00";
                    }
                    var maxCond = $scope.getMaxCond();
                    if (maxCond && maxCond.frontDate) {
                        maxCond.date = moment(maxCond.frontDate, $scope.getDateFormat()).format("YYYY-MM-DD");
                        maxCond.time = $scope.setTime ? moment(maxCond.frontDate, $scope.getDateFormat()).format("HH:mm") : "00:00";
                    }
                }

                function syncConditionsWithFrontDates() {
                    var minCond = $scope.getMinCond();
                    if (minCond && minCond.date && minCond.time) {
                        minCond.frontDate = moment(minCond.date + " " + minCond.time, RangeExpressions.dateFormats["dateWithTimeFormat"]).format($scope.getDateFormat());
                    }
                    var maxCond = $scope.getMaxCond();
                    if (maxCond && maxCond.date && maxCond.time) {
                        maxCond.frontDate = moment(maxCond.date + " " + maxCond.time, RangeExpressions.dateFormats["dateWithTimeFormat"]).format($scope.getDateFormat());
                    }
                }

                // WATCHERS

                $scope.$watch(function() {
                    var toWatch = {};
                    var minCond = $scope.getMinCond();
                    var maxCond = $scope.getMaxCond();
                    if (minCond) {
                        toWatch.min = minCond.frontDate;
                    }
                    if (maxCond) {
                        toWatch.max = maxCond.frontDate;
                    }
                    return toWatch;
                }, syncFrontDatesWithConditions, true);

                // INIT
                syncConditionsWithFrontDates();
            }
        }
    });

    widgets.directive('splitGauge', function(GaugeHelper) {
        return {
            restrict : 'A',
            template : "<svg class='split-gauge'></svg>",
            scope : {
                data : '=',
                getValuesFn : '=',
                index : '=',
                max: "=",
                min: "="
            },
            replace : true,
            link : function($scope, element, attrs) {

                // get the gauge: root of template
                var gaugeSvg = d3.select(element[0]);

                // filling the gauge
                var gaugeG = gaugeSvg.append("g").attr("class", "x brush");

                // Retrieving width and height
                var width = $(element).innerWidth();
                var height = $(element).innerHeight();

                // Building background rect
                gaugeG.append('rect')
                      .attr('class', 'gauge-background')
                      .attr('width', width)
                      .attr('height', height)
                      .attr('fill', "#f0f1f1")

                var xScale = null;

                function buildGauge() {
                    if($scope.data == null || $scope.index == null) return;

                    var rectData = GaugeHelper.getValuesModified($scope.data, $scope.index, $scope.getValuesFn, $scope.min, $scope.max);

                    // Invalid input => delete all rects
                    if (!rectData) {
                        gaugeG.selectAll('.extent').remove();
                        return;
                    }

                    // Update value of width
                    width = $(element).innerWidth();

                    var extremities = GaugeHelper.getMinMaxValue($scope.data, $scope.getValuesFn, $scope.min, $scope.max);

                    // build scale
                    xScale = GaugeHelper.buildScale(extremities, width);

                    // Adding data rects
                    // Enter
                    gaugeG.selectAll('.extent')
                          .data(rectData)
                          .enter()
                          .append('rect')
                          .attr('class', 'extent')
                          .attr("x", function(d) { return xScale(d[0]);})
                          .attr("height", height)
                          .attr('width', function(d) { return xScale(d[1]) - xScale(d[0]); });

                    // Update
                    gaugeG.selectAll('.extent')
                          .data(rectData)
                          .attr("x", function(d) { return xScale(d[0]);})
                          .attr('width', function(d) { return xScale(d[1]) - xScale(d[0]); });

                    // Remove
                    gaugeG.selectAll('.extent')
                          .data(rectData)
                          .exit()
                          .remove();

                    // Adding gradient rects if needed (to render feeling of infinity)
                    // Remove previous gradient rects
                    gaugeSvg.selectAll('.gauge-gradient').remove();

                    // Retrieving values
                    var flattenRowValues = [].concat.apply([], $scope.getValuesFn($scope.data, $scope.index));
                    // Rebuilding new gauge gradients
                    if (Math.min(...flattenRowValues) == - Infinity) {
                        var leftGradient = gaugeSvg.append('defs')
                                                   .append('linearGradient')
                                                   .attr('id', 'leftGradient');

                        leftGradient.append('stop')
                                    .attr('offset', '0%')
                                    .attr('stop-color', "#f0f1f1")
                                    .attr('stop-opacity', 1);
                        leftGradient.append('stop')
                                    .attr('offset', '100%')
                                    .attr('stop-color', "rgba(255, 255, 255, 0)")
                                    .attr('stop-opacity', 1);


                        gaugeSvg.append('rect')
                                .attr('class', 'gauge-gradient')
                                .attr('width', width / 4)
                                .attr('height', height + 2)
                                .attr('fill', "url(#leftGradient)");
                    }
                    if (Math.max(...flattenRowValues) == Infinity) {
                        var rightGradient = gaugeSvg.append('defs')
                                                   .append('linearGradient')
                                                   .attr('id', 'rightGradient');

                        rightGradient.append('stop')
                                    .attr('offset', '0%')
                                    .attr('stop-color', "rgba(255, 255, 255, 0)")
                                    .attr('stop-opacity', 1);
                        rightGradient.append('stop')
                                    .attr('offset', '100%')
                                    .attr('stop-color', "#f0f1f1")
                                    .attr('stop-opacity', 1);


                        gaugeSvg.append('rect')
                                .attr('x', 3 * width / 4)
                                .attr('class', 'gauge-gradient')
                                .attr('width', width / 4)
                                .attr('height', height + 2)
                                .attr('fill', "url(#rightGradient)");
                    }

                };


                // Add watchers
                $scope.$watch('data', function(nv, ov) {
                    if (nv == null) return;
                    buildGauge();
                }, true);
            }
        };
    });

    widgets.directive('movingSplitGauge', function(GaugeHelper) {
        return {
            restrict : 'A',
            template : "<svg class='split-gauge'></svg>",
            scope : {
                data : '=',
                getValuesFn : '=',
                updateValuesFn : '=',
                index : '=',
                max: "=",
                min: "="
            },
            replace : true,
            link : function($scope, element, attrs) {
                var handleWidth = 5;
                var handleHeight = 9;

                // get the gauge: root of template
                var gaugeSvg = d3.select(element[0]);

                // filling the gauge
                var gaugeG = gaugeSvg.append("g").attr("class", "x brush");
                var gaugeHandleG = gaugeSvg.append("g").attr("class", "x gauge-handles"); // the gauge handles (click-through)

                var xScale = null;

                // update the total range, and then the graph
                $scope.refreshRange = function() {
                    if($scope.data == null || $scope.index == null) return;

                    var extentRange = GaugeHelper.getValuesModified($scope.data, $scope.index, $scope.getValuesFn, $scope.min, $scope.max);

                    // Invalid value => remove gauge
                    if (!extentRange) {
                        gaugeG.selectAll('.extent').remove();
                        gaugeHandleG.selectAll('.resize').remove();
                    }

                    // Retrieving width and height
                    var width = $(element).innerWidth();
                    var height = $(element).innerHeight();


                    var extremities = GaugeHelper.getMinMaxValue($scope.data, $scope.getValuesFn, $scope.min, $scope.max);

                    // build scale
                    xScale = GaugeHelper.buildScale(extremities, width);

                    // prepare callbacks
                    // when dragged
                    function brushed() {
                        var extent = gauge.extent();

                        //Verify that east part of brush stays at the east
                        var currentValues = GaugeHelper.getValuesModified($scope.data, $scope.index, $scope.getValuesFn, $scope.min, $scope.max);
                        if (extent[0] < currentValues[0]) { // i.e. when the brush is inverted, what we want to prevent
                            extent = currentValues;
                        }

                        // Modify gauge extent
                        d3.select(this).call(gauge.extent(extent));

                        // Move Handle to new position of gauge
                        var xE = xScale(extent[1]);
                        gaugeHandleG.selectAll(".e").attr("transform", "translate(" + xE + ", 0)");

                        // Update converned values
                        $scope.updateValuesFn($scope.data, $scope.index, extent[0], extent[1]);
                        $scope.$apply();
                    }

                    // add display in resize e if gauge of size 0
                    function addResizeE() {
                        actualGauge.selectAll('.resize.e')
                                   .style('display', 'initial');
                    }


                    if (extentRange && (extentRange[0] != null) && (extentRange[1] != null)) {

                        var gauge = d3.svg.brush()
                                          .x(xScale)
                                          .on('brush', brushed)
                                          .on('brushend', addResizeE)
                                          .extent(extentRange);


                        //Create objects
                        var actualGauge = gaugeG.call(gauge);


                        var xE = xScale(extentRange[1]);

                        //Style the brush
                        actualGauge.selectAll("rect")
                                   .attr("y", 0)
                                   .attr("height", height);

                        actualGauge.selectAll('.extent, .background, .resize')
                                   .attr('pointer-events', 'none');

                        // Create the right handle
                        gaugeHandleG.selectAll('.resize').remove();

                        // Add pointer events
                        actualGauge.selectAll('.resize.e')
                                   .attr('pointer-events', 'all');

                        addResizeE();

                        // Add g for handle
                        gaugeHandleG.append('g').classed('resize', true).classed('e', true).attr("transform", "translate(" + xE + ", 0)");

                        var gh = gaugeHandleG.selectAll(".resize");

                        gh.append("rect")
                          .classed("separator", true)
                          .attr("y", 0)
                          .attr("height", height)
                          .attr("x", -1.5)
                          .attr("width", 3);

                        gh.append("rect")
                          .classed("handle", true)
                          .attr("y", (height - handleHeight) / 2)
                          .attr("height", handleHeight)
                          .attr("x", -(handleWidth/2))
                          .attr("width", handleWidth);
                    }

                };

                // Add watchers
                $scope.$watch('data', function(nv, ov) {
                    if (nv == null) return;
                    $scope.refreshRange();
                }, true);
            }
        };
    });

    widgets.directive('columnsSelect', function(Fn) {
        return {
            scope: {
                title: "=",
                selectedColumns: "=",
                columns: "=",
                getColType: "=",
                hasOrder: "=",
                needsInfo: "=",
                isInfoOpen: "=",
                infoText: "@"
            },
            templateUrl: "/templates/recipes/fragments/columns-select.html",
            link: function($scope) {

                // Manipulate columns : getColumns, add/remove cols from available columns

                $scope.addColumn = function(col) {
                    // Formating column
                    var formatedCol;
                    if ($scope.hasOrder) {
                        formatedCol = {column: col.name, desc: false};
                    } else {
                        formatedCol = col.name;
                    }
                    $scope.selectedColumns.push(formatedCol);
                };

                $scope.getColumn = function(col) {
                    if ($scope.hasOrder) {
                        return col.column;
                    } else {
                        return col;
                    }
                };

                $scope.removeColumn = function(idx) {
                    if (idx > -1) {
                        $scope.selectedColumns.splice(idx, 1);
                    }
                };

                $scope.isInColumns = function(col) {
                    var allColumnsNames = $scope.columns.map(Fn.prop('name'));
                    return Fn.inArray(allColumnsNames)($scope.getColumn(col));
                };

                $scope.filterSelectedColumns = function(col) {
                    var selectedColumnsNames;
                    if ($scope.hasOrder && $scope.selectedColumns) {
                        selectedColumnsNames = $scope.selectedColumns.map(Fn.prop("column"));
                    } else {
                        selectedColumnsNames = $scope.selectedColumns;
                    }
                    return (!selectedColumnsNames || !Fn.inArray(selectedColumnsNames)(col.name));
                };

                function computeTypes() {
                    $scope.types =  $scope.columns.filter($scope.filterSelectedColumns).map(function(column){ return column.type});
                }
                computeTypes();
                $scope.$watch(function() {
                    return $scope.columns.filter($scope.filterSelectedColumns);
                }, computeTypes, true);

                // Defining sortable parameters
                $scope.sortOptions = {
                    axis:'y',
                    cursor: 'move',
                    cancel:'',
                    handle: '.handle-row',
                    disable: !$scope.hasOrder
                };
            }
        };
    });

})();

(function() {
    'use strict';
    var app = angular.module('dataiku.recipes');

    app.controller("SplitRecipeCreationController", function($scope, $stateParams, $state, $controller, $q,
                   Dialogs, DataikuAPI, DatasetsService, WT1, PartitionDeps, RecipesService,
                   RecipeComputablesService, RecipesUtils, DatasetUtils, Fn) {
        $controller("_RecipeCreationControllerBase", {$scope:$scope});
        addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);
        fetchManagedDatasetConnections($scope, DataikuAPI);
        DatasetsService.updateProjectList($stateParams.projectKey);

        $scope.recipe = {
            projectKey : $stateParams.projectKey,
            type: "split",
            inputs : {
                main: {
                    items: [{ref:'', deps: []}]
                }
            },
            outputs : {},
            params: {}
        };

        DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, "split").then(function(data){
            $scope.availableInputDatasets = data[0];
        });

        RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
            $scope.setComputablesMap(map);
        });

        $scope.$on("preselectInputDataset", function(scope, preselectedInputDataset) {
            $scope.recipe.inputs.main.items[0].ref = preselectedInputDataset;
            $scope.preselectedInputDataset = preselectedInputDataset;
        });

        $scope.$watch("recipe.inputs.main.items[0].ref", function(nv, ov) {
            if (nv) {
                $scope.recipe.name = "split_" + nv.replace(/[A-Z]*\./,"");
                if ($scope.preselectedInputDataset && nv != $scope.preselectedInputDataset) {
                    $scope.zone = null;
                }
            }
        });
    });


    app.controller("SplitRecipeController", function ($scope, $q, $stateParams, $controller,
                   Assert, DataikuAPI, DKUtils, DatasetUtils, Dialogs, PartitionDeps, RecipeComputablesService,
                   ComputableSchemaRecipeSave, CreateModalFromTemplate, RecipesUtils, Fn, Logger, Expressions, RangeExpressions) {
        $controller("_RecipeOutputNewManagedBehavior", {$scope:$scope});
        var visualCtrl = $controller("VisualRecipeEditorController", {$scope:$scope});

        // for safety, to use the _RecipeOutputNewManagedBehavior fully (maybe one day)
        $scope.setErrorInTopScope = function(scope) {
            return setErrorInScope.bind($scope);
        };

        $scope.hooks.save = function() {
            removeUnusedOutputs();
            var deferred = $q.defer();
            var recipeSerialized = angular.copy($scope.recipe);
            PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
            var serializedScript = $scope.serializeScriptData();
            ComputableSchemaRecipeSave.handleSave($scope, recipeSerialized, serializedScript, deferred);
            return deferred.promise.then(visualCtrl.saveServerParams);
        };

        // Must override convert to be able to removeUnusedOutputs before converting.
        $scope.convert = function(type, label) {
            Dialogs.confirm($scope, "Convert to " + label + " recipe",
                "Converting the recipe to "+label+" will enable you to edit the query, but you will not be able to use the visual editor anymore."+
                "<br/><strong>This operation is irreversible.</strong>")
                .then(function() {
                    removeUnusedOutputs();
                    var payloadData = $scope.hooks.getPayloadData();
                    var recipeSerialized = angular.copy($scope.recipe);
                    PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
                    $scope.hooks.save().then(function() {
                        DataikuAPI.flow.recipes.visual.convert($stateParams.projectKey, recipeSerialized, payloadData, type)
                            .success(function(data) {
                                DKUtils.reloadState();
                            }).error(setErrorInScope.bind($scope));
                    });
                });
        };


        $scope.hooks.getPayloadData = function() {
            return angular.toJson($scope.params);
        };

        $scope.hooks.updateRecipeStatus = function(forceUpdate, exactPlan) {
            var deferred = $q.defer();
            var payload = $scope.hooks.getPayloadData();
            $scope.updateRecipeStatusBase(false, payload, {reallyNeedsExecutionPlan: exactPlan, exactPlan: exactPlan}).then(function() {
                // $scope.recipeStatus should have been set by updateRecipeStatusBase
                if (!$scope.recipeStatus) return deferred.reject();

                // Set sql/execution plan
                $scope.recipeStatus.multipleOutputs = true;
                if ($scope.recipeStatus.sqlWithExecutionPlanList
                    && $scope.recipeStatus.sqlWithExecutionPlanList.length > 0
                    && $scope.recipeStatus.sql === undefined) {
                        $scope.selectOutputForSql($scope.selectedOutputName);
                }
                deferred.resolve($scope.recipeStatus);
            });
            return deferred.promise;
        };

        $scope.serializeScriptData = function () {
            return angular.toJson($scope.params);
        };

        $scope.resyncSchema = function() {
            var input = RecipesUtils.getSingleInput($scope.recipe, "main");
            Dialogs.confirm($scope,
                'Resynchronize schema',
                'The schema of "'+input.ref+'" will be copied to all output datasets. Are you sure you want to continue ?'
            )
            .then(function() {
                DataikuAPI.flow.recipes.basicResyncSchema($stateParams.projectKey, $scope.hooks.getRecipeSerialized()).error(setErrorInScope.bind($scope));
            });
        };

        // UI:

        $scope.addFilterSplit = function() {
            var outputs = $scope.recipe.outputs.main.items;
            $scope.params.filterSplits.push({filter: {enabled: true}, outputIndex: 0});
        };

        $scope.removeFilterSplit = function(splitIndex) {
            $scope.params.filterSplits.splice(splitIndex, 1);
        };

        $scope.addValueSplit = function(splitIndex) {
            $scope.params.valueSplits.splice(splitIndex, 0, {value: "", outputIndex: 0});
        };

        $scope.removeValueSplit = function(splitIndex) {
            $scope.params.valueSplits.splice(splitIndex, 1);
        };

        $scope.onOutputDatasetChange = function(splitIndex) {
            var splits = $scope.getActiveSplits();
            onOutputDatasetChange(splits, splitIndex);
        };

        $scope.initSeed = function(seed){
            if (seed == undefined) {
                seed = null;
            }
        };

        $scope.showSplitModal = function() {
            CreateModalFromTemplate("/templates/recipes/fragments/split-modal.html", $scope);
        };

        $scope.getTooltipTextColumnMode = function() {
            if (!$scope.isInColumns($scope.params.column)) {
                return 'Select a column';
            } else if (!$scope.numericalOrDate($scope.getColumn($scope.params.column))) {
                var type = $scope.getColType($scope.params.column)
                return 'Cannot select ranges with \''+$scope.params.column + '\' (' + type + ')';
            } else {
                return '';
            }
        };

        // Manipulate columns : getColumns, isInColumns

        $scope.isInColumns = function(colName) {
            var allColumnsNames = $scope.getColumns().map(Fn.prop('name'));
            return Fn.inArray(allColumnsNames)(colName);
        };

        var columns = [];
        $scope.inputSchema = {columns: columns};
        $scope.getColumns = function(){
            if (!$scope.computablesMap) {
                Logger.error("Execution function before getting computablesMap");
                return;
            }
            const input = RecipesUtils.getSingleInput($scope.recipe, "main");
            const computable = $scope.computablesMap[input.ref];
            if (!computable) {
                throw new Error('Dataset is not in computablesMap, try reloading the page.');
            }
            Assert.trueish(computable.dataset, 'expected a dataset');
            if (computable.dataset.schema) listCopyContent(columns, computable.dataset.schema.columns);
            if (hasComputedColumns()) {
                $scope.params.computedColumns.forEach(function(cc) {
                    var replaced = false;
                    for(var i = 0; i < columns.length; ++i) {
                        if (columns[i].name == cc.name) {
                            columns.splice(i, 1, cc);
                            replaced = true;
                            break;
                        }
                    }
                    replaced || columns.push(cc);
                });
            }
            return columns;
        };

        $scope.numericalOrDate = function(col) {
            var allowedGenericTypes = ["num", "date"];
            var genericType = Expressions.genericType(col.type);
            return Fn.inArray(allowedGenericTypes)(genericType);
        };

        $scope.hasNumericalOrDateCols = function() {
            return $scope.getColumns().filter($scope.numericalOrDate).length > 0;
        }

        $scope.getColumn = function(name) {
            var columns = $scope.getColumns();
            return columns.filter(function(col){return col.name==name})[0];
        };

        $scope.getColType = function(colName) {
            if (!colName) return;
            var col = $scope.getColumns().filter(function(col){return col.name == colName})[0];
            if (!col) return;
            return col.type;
        };

        $scope.genericType = function(type) {
            return Expressions.genericType(type);
        };

        $scope.initColumn = function() { //init column for value matching
            var col = $scope.getColumn($scope.params.column);
            if (!col) return;
            $scope.currentGenericType = Expressions.genericType(col.type);
        };

        // Updates outputs list (with the None and Other options)
        $scope.updateOutputs = function() {
            var outputs = getOutputsRefs();
            var nOutputs = outputs.length;

            //remove all the invalid output indices
            var allSplits = getAllSplits();
            allSplits.forEach(function(split) {
                if (split.outputIndex >= nOutputs) {
                    split.outputIndex = -1;
                }
            });

            // Fill the outputs lists, which is used for the UI selectors
            $scope.outputsList = [];
            outputs.forEach(function(x, idx){
                $scope.outputsList.push({value: idx, label: x});
            });
            $scope.outputsList.push({value: '$dku_other', label: 'Other dataset...'});
            $scope.outputsList.push({value: -1, label: 'Drop data'});
        };

        $scope.onComputedColumnListUpdate = function(computedColumns) {
            $scope.params.computedColumns = angular.copy(computedColumns);
            syncComputedColumns();
        }

        $scope.getActiveSplits = function() {
            return $scope.getSplits($scope.params.mode);
        };

        $scope.getSplits = function(mode) {
            var splits;
            switch(mode){
                case "FILTERS":
                    splits = $scope.params.filterSplits;
                    break;
                case "VALUES":
                    splits = $scope.params.valueSplits;
                    break;
                case "RANDOM":
                    splits = $scope.params.randomSplits;
                    break;
                case "RANDOM_COLUMNS":
                    splits = $scope.params.randomColumnsSplits;
                    break;
                case "CENTILE":
                    splits = $scope.params.centileSplits;
                    break;
                case "RANGE":
                    splits = $scope.params.rangeSplits;
                    break;
                default:
                    Logger.error("Unknown split mode : "+mode);
            }
            return splits;
        }

        function getAllSplits() {
            var modesNames = $scope.splittingMethods.map(Fn.prop(0));
            var splits = [];
            modesNames.forEach(function(mode) {
                splits.push.apply(splits, $scope.getSplits(mode));
            });
            return splits;
        }

        function syncComputedColumns() { // Updates the schema for all filter splits taking into account input columns and computed columns
            if (!$scope.computablesMap) return;
            var schema = {columns: $scope.getColumns() || []};
            $scope.params.filterSplits.forEach(function(fs) {
                fs.filter.$status = fs.filter.$status || {};
                fs.filter.$status.schema = schema;
            });
            // Check if modifies column selected in VALUES or RANGE mode
            if ($scope.params.column) {
                var columnGenericType = Expressions.genericType($scope.getColType($scope.params.column));
                var columnNotInColumns = !$scope.isInColumns($scope.params.column);
                var genericTypeChanged = (columnGenericType !== $scope.currentGenericType);
                if (columnNotInColumns || genericTypeChanged) {
                    onColumnChange($scope.params.column);
                }
            }
        }

        $scope.getNewRangeSplit = function(conditions) {
            return {
                filter: {
                    "uiData": {
                        "mode": "&&",
                        "conditions": conditions
                    }
                },
                outputIndex: 0
            }
        };

        $scope.getConditionsForFirstDateSplit = function(colName) {
            var minCond = RangeExpressions.createCondition(true, "min", "date", colName);
            minCond.date = moment().format(RangeExpressions.dateFormats["dateFormat"]);
            minCond.frontDate = minCond.date;
            var maxCond = RangeExpressions.createCondition(false, "max", "date", colName);
            maxCond.date = moment().format(RangeExpressions.dateFormats["dateFormat"]);
            maxCond.frontDate = maxCond.date;
            return [minCond, maxCond];
        };

        var valueSplitsSave = {
            num: [{"outputIndex": 0}],
            boolean: [{"value": "true", "outputIndex": 0},{"value": "false", "outputIndex": 1}],
            other: [{"outputIndex": 0}]
        };
        var rangeSplitsSave = {
            num: [$scope.getNewRangeSplit([])],
            date: [$scope.getNewRangeSplit($scope.getConditionsForFirstDateSplit(undefined))]
        };

        function onColumnChange(columnName) {
            if (!$scope.computablesMap || !columnName || !$scope.getColumn(columnName)) return;
            var newGenericType = Expressions.genericType($scope.getColType(columnName));
            if ($scope.params.mode === "RANGE") {
                // If new generic type is not num/date go to VALUES mode
                if (!$scope.isInColumns(columnName) || !$scope.numericalOrDate($scope.getColumn(columnName))) {
                    $scope.params.mode = "VALUES";
                    onColumnChange(columnName);
                    return;
                }

                if ($scope.currentGenericType && $scope.currentGenericType !== newGenericType) {
                    // Save old splits
                    rangeSplitsSave[$scope.currentGenericType] = $scope.params.rangeSplits;
                    $scope.params.rangeSplits = rangeSplitsSave[newGenericType];
                }
                for (var i=0; i < $scope.params.rangeSplits.length; i++) {
                    var conditions = RangeExpressions.getRangeConditions($scope.params.rangeSplits, i);
                    if (conditions) {
                        conditions.forEach(function(condition) {
                            condition.input = columnName;
                            condition.operator = RangeExpressions.modifyColTypeInComparisonOperator(condition.operator, $scope.getColType(columnName));
                        });
                    }
                }
            } else if ($scope.params.mode === "VALUES") {
                if (!$scope.currentGenericType && newGenericType === "boolean" && !isBooleanValueSplits()) {
                    $scope.params.valueSplits = valueSplitsSave["boolean"];
                }
                if ($scope.currentGenericType && newGenericType !== $scope.currentGenericType) {
                    // Save old value splits
                    if (['num', 'boolean'].indexOf($scope.currentGenericType) < 0) {
                        valueSplitsSave['other'] = $scope.params.valueSplits;
                    } else {
                        valueSplitsSave[$scope.currentGenericType] = $scope.params.valueSplits;
                    }
                    // Retrieve previously saved valueSplits for new column type
                    if (newGenericType === 'num') {
                        $scope.params.valueSplits = valueSplitsSave['num'];
                    } else if (newGenericType === 'boolean') {
                        if (valueSplitsSave['boolean'].length) {
                            $scope.params.valueSplits = valueSplitsSave['boolean'];
                        } else {
                            $scope.params.valueSplits = [{"value": "true"},{"value": "false"}];
                        }
                    } else {
                        $scope.params.valueSplits = valueSplitsSave['other'];
                    }
                }
            }
            $scope.currentGenericType = newGenericType;
        }

        function isBooleanValueSplits() {
            var isDefinedAndLength2 = ($scope.params.valueSplits && $scope.params.valueSplits.length === 2);
            var isFirstTrue = ($scope.params.valueSplits[0] && $scope.params.valueSplits[0]["value"] === "true");
            var isSecondFalse = ($scope.params.valueSplits[1] && $scope.params.valueSplits[1]["value"] === "false");
            return (isDefinedAndLength2 && isFirstTrue && isSecondFalse);
        }

        function removeUnusedOutputs() {
            var outputs = $scope.recipe.outputs.main.items;
            var usedOutputIndices = $scope.getActiveSplits().map(function(s) { return s.outputIndex });
            usedOutputIndices.push($scope.params.defaultOutputIndex);
            var allSplits = getAllSplits();
            for (var i = outputs.length - 1; i >= 0; --i) {
                if (usedOutputIndices.indexOf(i) < 0) {
                    outputs.splice(i, 1);
                    // update splits
                    allSplits.forEach(function(s) {
                        if (s.outputIndex > i) {
                            s.outputIndex--;
                        }
                    });
                    if ($scope.params.defaultOutputIndex > i) {
                        $scope.params.defaultOutputIndex--;
                    }
                }
            }
        }

        function getOutputsRefs() {
            return $scope.recipe.outputs.main.items.map(function(o){return o.ref});
        }

        function refreshAvailableDatasets() {
            DatasetUtils.listDatasetsUsabilityInAndOut($stateParams.projectKey, $scope.recipe.type).then(function(data) {
                var alreadyInOutput = function(computable) {
                    if ($scope.recipe && $scope.recipe.outputs && $scope.recipe.outputs.main && $scope.recipe.outputs.main.items) {
                        return $scope.recipe.outputs.main.items.filter(function(item) {return item.ref == computable.smartName;}).length > 0;
                    } else {
                        return false;
                    }
                };
                $scope.availableOutputDatasets = data[1].filter(function(computable){
                    // console.debug(computable, computable.usableAsOutput['main'].usable, !computable.alreadyUsedAsOutputOf)
                    return computable.usableAsOutput['main'].usable && !computable.alreadyUsedAsOutputOf && !alreadyInOutput(computable);
                });
            });
        }

        function onOutputDatasetChange(splits, splitIndex) {
            function getOutputIndex(splitIndex) {
                if (splitIndex >= 0) {
                    return splits[splitIndex].outputIndex;
                }
                if (splitIndex == -1) {
                    return $scope.params.defaultOutputIndex;
                }
            }

            function setOutput(splitIndex, outputIndex) {
                if (splitIndex >= 0) {
                    splits[splitIndex].outputIndex = outputIndex;
                }
                if (splitIndex == -1) {
                    $scope.params.defaultOutputIndex = outputIndex;
                }
            }

            function addAndSetOutput(datasetRef, dismissModalCallback) {
                dismissModalCallback();
                if (getOutputsRefs().indexOf(datasetRef) < 0) {
                    $scope.recipe.outputs.main.items.push({
                        ref: datasetRef,
                        appendMode: false
                    });
                }
                setOutput(splitIndex, $scope.recipe.outputs.main.items.length - 1);
            }

            if (getOutputIndex(splitIndex) == '$dku_other') {
                var newScope = $scope.$new();
                refreshAvailableDatasets();
                newScope.ok = function(dismissModalCallback) {
                    if ($scope.io.newOutputTypeRadio == 'select') {
                        if (!$scope.io.existingOutputDataset) return;
                        addAndSetOutput($scope.io.existingOutputDataset, dismissModalCallback);
                    } else {
                        var creationSettings = {
                            connectionId : $scope.newOutputDataset.connectionOption.id,
                            specificSettings : {
                                formatOptionId : $scope.newOutputDataset.formatOptionId,
                                overrideSQLCatalog: $scope.newOutputDataset.overrideSQLCatalog,
                                overrideSQLSchema: $scope.newOutputDataset.overrideSQLSchema
                            },
                            partitioningOptionId : $scope.newOutputDataset.partitioningOption,
                            zone: $scope.zone
                        };
                        DataikuAPI.datasets.newManagedDataset($stateParams.projectKey, $scope.newOutputDataset.name, creationSettings).success(function(dataset) {
                            RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
                                $scope.setComputablesMap(map);
                                addAndSetOutput($scope.newOutputDataset.name, dismissModalCallback);
                            }, setErrorInScope.bind(newScope));
                        }).error(setErrorInScope.bind(newScope));
                    }
                };
                newScope.singleOutputRole = {name:"main", arity:"UNARY", acceptsDataset:true};

                setOutput(splitIndex, -1); // We must not keep $dku_other selected
                CreateModalFromTemplate("/templates/recipes/io/output-selection-modal.html", newScope);
            }
        }

        function hasComputedColumns() {
            return !!($scope.params && $scope.params.computedColumns && $scope.params.computedColumns.length);
        }

        function initDefaultOutputIndex() {
            var hasMoreThanOneOutput = ($scope.recipe.outputs.main.items && $scope.recipe.outputs.main.items.length > 1);
            if ($scope.params.defaultOutputIndex === 1 && !hasMoreThanOneOutput) {
                $scope.params.defaultOutputIndex = -1;
            }
        }

        $scope.openCloseInfo = function() {
            $scope.randomColumnsInfoOpen = !$scope.randomColumnsInfoOpen;
        };

        $scope.splittingMethods = [
            ['VALUES', 'Map values of a single column to the outputs datasets'],
            ['FILTERS', 'Define a filter for each output dataset'],
            ['RANDOM', 'Randomly split to the output datasets with exact ratio'],
            ['RANDOM_COLUMNS', 'Randomly split to the output datasets based on values of multiple columns'],
            ['CENTILE', 'Sort-based / centile split'],
            ['RANGE', 'Split on range of values for a column']
        ];

        $scope.randomSplittingMethods = [
            ["RANDOM", "Full random"],
            ["RANDOM_COLUMNS", "Random subset of column(s) values"],
        ];

        $scope.randomSplittingMethodsDesc = [
            'Randomly splits the dataset according to the provided ratios (exact when using DSS engine, approximate otherwise).',
            'Randomly selects a subset of values of one or more columns and send all rows with these values to an output, in order to obtain approximately the provided ratio for this output. Two outputs cannot contain the same values.'
        ];

        $scope.valuesSplittingMethods = [
            ["VALUES", "Discrete values"],
            ["RANGE", "Ranges"],
        ];

        $scope.columnTypes = [
            {name:'TINYINT',label:'tinyint (8 bit)'},
            {name:'SMALLINT',label:'smallint (16 bit)'},
            {name:'INT',label:'int'},
            {name:'BIGINT',label:'bigint (64 bit)'},
            {name:'FLOAT',label:'float'},
            {name:'DOUBLE',label:'double'},
            {name:'BOOLEAN',label:'boolean'},
            {name:'STRING',label:'string'},
            {name:'DATE',label:'date'},
            {name:'ARRAY',label:'array<...>'},
            {name:'MAP',label:'map<...>'},
            {name:'OBJECT',label:'object<...>'}
        ];

        $scope.hooks.onRecipeLoaded = function(){
            Logger.info("On Recipe Loaded");
            $scope.updateOutputs();
            $scope.inputDatasetName = RecipesUtils.getSingleInput($scope.recipe, "main").ref;
            $scope.hooks.updateRecipeStatus();

            //keep params for dirtyness detection
            visualCtrl.saveServerParams();

            /** setup for new output modal **/
            refreshAvailableDatasets();
            DataikuAPI.datasets.getManagedDatasetOptions($scope.recipe, 'main').success(function(data) {
                $scope.setupManagedDatasetOptions(data);
            });
            $scope.io = $scope.io || {};
            $scope.io.newOutputTypeRadio = 'select';

            /** Listeners **/
            $scope.$watch("recipe.params", $scope.updateRecipeStatusLater, true);
            $scope.$watch('params.column', onColumnChange);
            $scope.$watch('mode', DKUtils.reflowNext);
            $scope.$watchCollection('recipe.outputs.main.items', $scope.updateOutputs);
            $scope.$watchCollection('params.filterSplits', syncComputedColumns);
            $scope.$watch('params.computedColumns', syncComputedColumns, true);
            $scope.$watch('params', $scope.updateRecipeStatusLater, true);
        };

        $scope.params = {};
        if ($scope.script && $scope.script.data) {
            $scope.params = JSON.parse($scope.script.data);
        }
        var defaults = {
            mode: null,
            filterSplits: [], //list of {filter: [object], outputIndex: [string]} for FILTERS mode
            valueSplits: [], //list of {value: [string], outputIndex: [string]} for VALUES mode
            randomSplits: [], //list of {share: [int], outputIndex: [string]} for RANDOM mode
            randomColumnsSplits: [], //list of {share: [int], outputIndex: [string]} for RANDOM_COLUMNS mode
            centileSplits: [], //list of {share: [int], outputIndex: [string]} for RANDOM_COLUMNS mode
            randomColumns: [], //list of strings of selected columns for RANDOM_COLUMNS mode
            rangeSplits: [], //list of {filter: [object], outputIndex: [string]} for RANGE mode
            centileOrders: [], //list of strings of selected columns for CENTILE mode
            preFilter: {}, // object containing potential prefilters
            defaultOutputIndex: -1
        };

        $scope.params = $.extend({}, defaults, $scope.params);
        for (let vs of $scope.params.valueSplits || []) {
            if (vs.value == null) {
                vs.value = '';
            }
        }
        $scope.params.filterSplits.length  || $scope.addFilterSplit();
        initDefaultOutputIndex();

        $scope.specificControllerLoadedDeferred.resolve();
        $scope.enableAutoFixup();
        $scope.uiState = {
            currentStep: 'splitting',
            outputColumnNamesOverridable: false,
            computedColumns: angular.copy($scope.params.computedColumns)
        };
        $scope.randomColumnsInfoOpen = false;
    });

})();
