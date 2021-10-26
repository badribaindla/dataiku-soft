(function() {
    'use strict';

    const NO_RECORDS = 'No records';

    function buildDateDisplay(mainDateFormat, dateFormat, dateFilterOption) {
        return {
            mainDateFormat,
            dateFormat,
            dateFilterOption,
            formatDateFn: function(timestamp, formatToApply) {
                return d3.time.format.utc(formatToApply)(new Date(timestamp));
            }
        };
    }

    const DATE_DISPLAY_UNIT_DEFAULT = buildDateDisplay(undefined, '%Y-%m-%d', 'MMM d, y');
    const DATE_DISPLAY_UNIT_MINUTES = buildDateDisplay('%Y-%m-%d', '%H:%M', 'HH:mm');
    const DATE_DISPLAY_UNIT_SECONDS = buildDateDisplay('%Y-%m-%d', '%H:%M:%S', 'HH:mm:ss');
    const DATE_DISPLAY_UNIT_MILLISECONDS = buildDateDisplay('%Y-%m-%d', '%H:%M:%S:%L', 'HH:mm:ss:sss');

    angular.module('dataiku.charts')
        .service("ChartDataUtils", ChartDataUtils)
        .factory("ChartTensorDataWrapper", ChartTensorDataWrapper)
        .factory("ChartScatterDataWrapper", ChartScatterDataWrapper);

    function ChartDataUtils(ChartDimension, ChartUADimension, Fn) {
        /**
         * Returns true if:
         * <ul>
         *     <li>no timestamp range is defined</li>
         *     <li>element index is not one of the 'other' bin</li>
         *     <li>element index corresponds to a bins which timestamp is in the specified range</li>
         * </ul>
         */
        function isElementInTimestampRange(elementIndex, axisLabelElements, timestampRange) {
            if (!timestampRange) {
                return true;
            }
            const labelElementIndex = getLabelIndexForTensorIndex(elementIndex, axisLabelElements.length);
            const isOthersCategoryIndex = labelElementIndex === undefined;
            if (isOthersCategoryIndex) {
                return false;
            }
            const axisLabelElementTimestamp = axisLabelElements[labelElementIndex].tsValue;
            const lowestRangeBound = timestampRange[0];
            const highestRangeBound = timestampRange[1];
            return axisLabelElementTimestamp >= lowestRangeBound && axisLabelElementTimestamp <= highestRangeBound;
        }

        /**
         * Returns the index of the axis label element corresponding to the tensor index or undefined
         * if index is one of the 'other" bin.
         */
        function getLabelIndexForTensorIndex(tensorElementIndex, numberOfAxisLabelElements) {
            const numberOfElementsInFacet = numberOfAxisLabelElements + 1; // because of 'other' bin;
            let labelElementIndex = tensorElementIndex % numberOfElementsInFacet;
            const isOthersCategoryElementIndex = labelElementIndex === numberOfAxisLabelElements;
            if (isOthersCategoryElementIndex) {
                return undefined;
            }
            return labelElementIndex;
        }



        /**
         * Filters the tensor to keep only:
         * <ul>
         *     <li>non empty bins (i.e. with a count  > 0)</li>
         *     <li>if timestampRange is specified, the bins which corresponding timestamp is in the range</li>
         * </ul>
         * @return {Array} the filtered tensor
         */
        function filterTensorOnTimestampRange(tensor, axisLabelElements, counts, timestampRange) {
            return tensor.filter((value, index) => {
                const isEmptyBin = counts[index] === 0;
                return isElementInTimestampRange(index, axisLabelElements, timestampRange) && !isEmptyBin;
            });
        }

        function buildDefaultExtent() {
            return {
                extent: [Infinity, -Infinity],
                onlyPercent: true
            };
        }

        /**
         * Returns the corresponding date display settings for the specified interval:
         * <ul>
         *     <li>for MILLISECONDS if the range is lower than a second</li>
         *     <li>for SECONDS if the range is lower than a minute</li>
         *     <li>for MINUTES if the range is lower than a day</li>
         *     <li>else the default display</li>
         * </ul>
         * @param minTimestamp The lower bound of the interval in milliseconds
         * @param maxTimestamp The upper bound of the interval in milliseconds.
         * @return {{dateFilterOption: string, dateFormat: string, mainDateFormat: string, formatDateFn: function(number, string)}}
         * <ul>
         *     <li>
         *         <b>mainDateFormat</b> format for the main identical part of the interval.
         *         <b>undefined</b> if the interval is not on the same day.
         *     </li>
         *     <li><b>dateFormat</b> format to use for the dates in the interval.</li>
         *     <li><b>dateFilterOption</b> date filter option to be used in an AngularJS filter.</li>
         *     <li><b>formatDateFn</b> function to format a timestamp in milliseconds according to the specified format.</li>
         * </ul>
         */
        function getDateDisplayUnit(minTimestamp, maxTimestamp) {
            if (minTimestamp === undefined || maxTimestamp === undefined) {
                return DATE_DISPLAY_UNIT_DEFAULT;
            }
            const minDate = new Date(minTimestamp);
            const maxDate = new Date(maxTimestamp);

            const isDomainInSameDay = minDate.toDateString() === maxDate.toDateString();
            if (!isDomainInSameDay) {
                return DATE_DISPLAY_UNIT_DEFAULT;
            }

            const isDomainInSameMinute = (minDate.getHours() === maxDate.getHours()) && (minDate.getMinutes() === maxDate.getMinutes());
            if (!isDomainInSameMinute) {
                return DATE_DISPLAY_UNIT_MINUTES;
            }

            const isDomainInSameSecond = (minDate.getSeconds() === maxDate.getSeconds());
            if (!isDomainInSameSecond) {
                return DATE_DISPLAY_UNIT_SECONDS;
            }
            return DATE_DISPLAY_UNIT_MILLISECONDS;
        }
        /**
         * Returns a label to be used to display records count in the UI.
         * @param   {Number}    count - number of records
         * @return  {String}    Human-readable label
         */
        function getLabelForRecordsCount(count) {
            if (count === undefined) {
                return '';
            }
            switch (count) {
                case 0:
                    return NO_RECORDS;
                case 1:
                    return '1 record';
                default:
                    return count + ' records';
            }
        }

        var svc = {
            /**
             * Returns the min & max values across all dimensions & all measures for the two display axes
             * @param {ChartDef.java} chartDef
             * @param {PivotTableTensorResponse.java} data
             * @param {Array} timestampRange min and max used to filter the data based on their timestamp
             * @return {Object} { y1: { extent: [Number, Number], onlyPercent: Boolean }, y2: { extent: [Number, Number], onlyPercent: Boolean }, recordsCount: Number, pointsCount: Number }
             */
            getMeasureExtents: function (chartDef, data, timestampRange) {
                var result = {
                    y1: buildDefaultExtent(),
                    y2: buildDefaultExtent(),
                    recordsCount: 0,
                    pointsCount: 0
                };

                const mainAxisLabel = data.axisLabels[0];
                const countsTensor = data.counts.tensor;
                chartDef.genericMeasures.forEach(function (measure, measureIndex) {
                    const aggregationTensorForMeasure = data.aggregations[measureIndex].tensor;
                    const measureExtent = d3.extent(
                        filterTensorOnTimestampRange(aggregationTensorForMeasure, mainAxisLabel, countsTensor, timestampRange)
                    );
                    var axis = measure.displayAxis === 'axis1' ? 'y1' : 'y2';
                    result[axis].onlyPercent &= measure.computeMode === 'PERCENT';
                    result[axis].extent[0] = Math.min(measureExtent[0], result[axis].extent[0]);
                    result[axis].extent[1] = Math.max(measureExtent[1], result[axis].extent[1]);
                });

                const countsTensorInRange = filterTensorOnTimestampRange(countsTensor, mainAxisLabel, countsTensor, timestampRange);
                result.recordsCount = countsTensorInRange.reduce((currentCount, countInBin) => currentCount + countInBin, 0);
                result.pointsCount = countsTensorInRange.length;
                return result;
            },

            /**
             * Returns the min & max values across all dimensions for the given measure
             * @param {PivotTableTensorResponse.java} data
             * @param {Number} mIdx - measure index
             * @param {Boolean} ignoreEmptyBins - whether or not to ignore empty bins
             * @return {Array} extent as [min, max]
             */
            getMeasureExtent: function (data, mIdx, ignoreEmptyBins) {

                if (!data.aggregations[mIdx]) {
                    return null;
                }

                var accessor = Fn.SELF;
                if (ignoreEmptyBins) {
                    accessor = function (d, i) {
                        if (data.aggregations[mIdx].nonNullCounts) {
                            return data.aggregations[mIdx].nonNullCounts[i] > 0 ? d : null;
                        } else {
                            return (data.counts.tensor[i] > 0) ? d : null;
                        }
                    }
                }

                return d3.extent(data.aggregations[mIdx].tensor, accessor);
            },


            /**
             * Returns an aggregation tensor where empty & all-null bins are filtered out
             * @param {PivotTableTensorResponse.java} data
             * @param {Number} mIdx - measure index
             * @return {Array} list of values for non-empty and non-null bins
             */
            getMeasureValues: function (data, mIdx) {
                if (!data.aggregations[mIdx]) {
                    return null;
                }

                return data.aggregations[mIdx].tensor.filter(function (d, i) {
                    if (data.aggregations[mIdx].nonNullCounts) {
                        return data.aggregations[mIdx].nonNullCounts[i] > 0;
                    } else {
                        return data.counts.tensor[i] > 0;
                    }
                });
            },

            /**
             * Returns the min, max, and list of values on the given axis
             * @param {ChartTensorDataWrapper} chartData
             * @param {String} axisName: the name of the axis in chartData
             * @param {DimensionDef.java} dimension
             * @return {Object} extent as {values: [], min: min, max: max}
             */
            getAxisExtent: function (chartData, axisName, dimension) {
                var values = [],
                    min = Infinity,
                    max = -Infinity,
                    labels = chartData.getAxisLabels(axisName);

                labels.forEach(function (label, i) {
                    values.push(label.label);
                    if (ChartDimension.isTimeline(dimension)) {
                        if (label.tsValue !== 0) {
                            min = Math.min(min, label.tsValue);
                            max = Math.max(max, label.tsValue);
                        }
                    } else if (ChartDimension.isNumerical(dimension)) {
                        if (ChartDimension.isUnbinnedNumerical(dimension) || label.min == null) {
                            min = Math.min(min, label.sortValue);
                            max = Math.max(max, label.sortValue);
                        } else {
                            min = Math.min(min, label.min);
                            max = Math.max(min, label.max);
                        }
                    }
                });

                return {values: values, min: min, max: max};
            },

            /**
             * Returns the min, max, and list of values on the given axis
             * @param {NADimensionDef.java} dimension
             * @param {ScatterAxis.java} axisData
             * @param {Number} afterFilterRecords
             * @return {Object} extent as {values: [], min: min, max: max}
             */
            getUnaggregatedAxisExtent: function (dimension, axisData, afterFilterRecords) {
                if (ChartUADimension.isAlphanumLike(dimension) || ChartUADimension.isDiscreteDate(dimension)) {
                    var sortedValues = angular.copy(axisData.str.sortedMapping).sort(function (a, b) {
                        return d3.ascending(a.sortOrder, b.sortOrder);
                    });
                    return {values: sortedValues.map(Fn.prop('label'))};
                } else if (ChartUADimension.isTrueNumerical(dimension)) {
                    return {
                        values: axisData.num.data.filter((d, i) => i < afterFilterRecords),
                        min: axisData.num.min,
                        max: axisData.num.max
                    };
                } else if (ChartUADimension.isDateRange(dimension)) {
                    return {
                        values: axisData.ts.data.filter((d, i) => i < afterFilterRecords),
                        min: axisData.ts.min,
                        max: axisData.ts.max
                    };
                } else {
                    throw new Error("Unhandled dimension type: " + dimension.type);
                }
            },
            /**
             * Computes the label that will be displayed on the top right of the chart.
             */
            computeChartTopRightLabel: function(recordsCount, computedMainAutomaticBinningModeDescription) {
                const result = [];
                const labelForRecordsCount = getLabelForRecordsCount(recordsCount);
                if (labelForRecordsCount) {
                    result.push(labelForRecordsCount);
                }
                if (computedMainAutomaticBinningModeDescription && labelForRecordsCount !== NO_RECORDS) {
                    result.push(computedMainAutomaticBinningModeDescription);
                }
                return result.length === 0 ? undefined : result.join(' ');
            },
            computeNoRecordsTopRightLabel: function() {
                return this.computeChartTopRightLabel(0, undefined);
            },
            /**
             * Computes the display settings for the specified interval.
             * If a main identical part is identified also computed the date to display as <b>formattedMainDate</b>
             */
            computeDateDisplayUnit: function (minTimestamp, maxTimestamp) {
                const dateDisplayUnit = getDateDisplayUnit(minTimestamp, maxTimestamp);
                if (minTimestamp !== undefined && dateDisplayUnit.mainDateFormat !== undefined) {
                    return {...dateDisplayUnit, formattedMainDate: dateDisplayUnit.formatDateFn(minTimestamp, dateDisplayUnit.mainDateFormat) };
                }
                return dateDisplayUnit;
            }
        };

        return svc;
    }

    function ChartTensorDataWrapper() {
       /**
        * A wrapper for easily access the data stored in a PivotTableTensorResponse
        * @param {PivotTableTensorResponse.java} data
        * @param {AxesDef} axesDef: a map from axis names to axis idx in the tensor response, axis names can then be used to retrieve the data instead of the idx for better code readability
        */
        return function (data, axesDef) {
            var that = {
                axesDef: axesDef,
                numAxes: data.axisLabels.length,
                coords: [],
                data: data,
                aggr: function (aggrIdx) {
                    return {
                        get: function (coordsDict) {
                            return that.getAggrPoint(aggrIdx, coordsDict);
                        },

                        getAxisValue: function(axisName, axisCoord) {
                            return data.aggregations[aggrIdx].axes[that.axesDef[axisName]][axisCoord];
                        }
                    }
                },
                getCount: function (coordsDict) {
                    return that.getPoint(data.counts, that.getCoordsArray(coordsDict));
                },
                getNonNullCount: function (coordsDict, aggrIdx) {
                    if (data.aggregations[aggrIdx].nonNullCounts) {
                        return data.aggregations[aggrIdx].nonNullCounts[that.getCoordsLoc(data.aggregations[aggrIdx], that.getCoordsArray(coordsDict))];
                    } else {
                        // When the aggregation has no null value, nonNullCounts isn't sent because nonNullCounts == counts
                        return that.getCount(coordsDict);
                    }
                },
                getAggrPoint: function (aggrIdx, coordsDict) {
                    return that.getPoint(data.aggregations[aggrIdx], that.getCoordsArray(coordsDict));
                },
                getAggrExtent: function(aggrIdx) {
                    return d3.extent(that.data.aggregations[aggrIdx].tensor);
                },
                getCoordsLoc: function (tensor, coordsArray) {
                    var loc = 0;
                    for (var i = 0; i < that.numAxes; i++) {
                        loc += coordsArray[i] * tensor.multipliers[i];
                    }
                    return loc;
                },
                getPoint: function (tensor, coordsArray) {
                    return tensor.tensor[that.getCoordsLoc(tensor, coordsArray)];
                },
                getCoordsArray: function (coordsDict) {
                    for (var axisName in coordsDict) {
                        that.coords[that.axesDef[axisName]] = coordsDict[axisName];
                    }
                    return that.coords;
                },
                getAxisLabels: function (axisName) {
                    return data.axisLabels[that.axesDef[axisName]];
                },
                getLabels: function () {
                    return data.axisLabels;
                },
                getAxisIdx: function (axisName) {
                    return that.axesDef[axisName];
                },
                fixAxis: function (axisName, binIdx) {
                    that.coords[that.axesDef[axisName]] = binIdx;
                    return that;
                },
                getCurrentCoord: function(axisName) {
                    return that.coords[that.axesDef[axisName]];
                }
            };

            return that;
        }
    }

    function ChartScatterDataWrapper() {
        /**
        * A fake ChartTensorDataWrapper for unaggregated scatter data, so that it can follow the same initChart code path as the other charts
        * @param {PTScatterResponse.java} data
        */

        return function (data) {
            var that = {
                numAxes: 0,
                axesDef: {},
                getAxisLabels: function (axisName) {
                    return null;
                    },
                data: data
            };

            return that;
        }
    }

})();