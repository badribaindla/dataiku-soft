(function(){
'use strict';

function createDateMode(group, value, label) {
    return {
        group,
        value,
        label
    };
}

function toDateFilterType(dateMode) {
    let label = dateMode.label;
    if (dateMode.suffix) {
        label += ` (${dateMode.suffix})`;
    }
    return [dateMode.value, label];
}

const GROUP_FIXED_TIMELINE = 'Fixed timeline';
const GROUP_DYNAMIC_TIMELINE = 'Dynamic timeline';
const GROUP_REGROUP = 'Regroup';
const AUTOMATIC = createDateMode(GROUP_DYNAMIC_TIMELINE, 'AUTOMATIC', 'Automatic');
const YEAR = createDateMode(GROUP_FIXED_TIMELINE, 'YEAR', 'Year');
const QUARTER = createDateMode(GROUP_FIXED_TIMELINE, 'QUARTER', 'Quarter');
const MONTH = createDateMode(GROUP_FIXED_TIMELINE, 'MONTH', 'Month');
const WEEK = createDateMode(GROUP_FIXED_TIMELINE, 'WEEK', 'Week');
const DAY = createDateMode(GROUP_FIXED_TIMELINE, 'DAY', 'Day');
const HOUR = createDateMode(GROUP_FIXED_TIMELINE, 'HOUR', 'Hour');
const MINUTE = createDateMode(GROUP_FIXED_TIMELINE, 'MINUTE', 'Minute');
const SECOND = createDateMode(GROUP_FIXED_TIMELINE, 'SECOND', 'Second');
const QUARTER_OF_YEAR = createDateMode(GROUP_REGROUP, 'QUARTER_OF_YEAR', 'Quarter of year');
const MONTH_OF_YEAR = createDateMode(GROUP_REGROUP, 'MONTH_OF_YEAR', 'Month of year');
const WEEK_OF_YEAR = createDateMode(GROUP_REGROUP, 'WEEK_OF_YEAR','Week of year');
const DAY_OF_MONTH = createDateMode(GROUP_REGROUP, 'DAY_OF_MONTH','Day of month');
const DAY_OF_WEEK = createDateMode(GROUP_REGROUP, 'DAY_OF_WEEK', 'Day of week');
const HOUR_OF_DAY = createDateMode(GROUP_REGROUP, 'HOUR_OF_DAY', 'Hour of day');
const INDIVIDUAL = createDateMode(GROUP_REGROUP, 'INDIVIDUAL', 'Individual dates');
const RELATIVE_YEAR = createDateMode(GROUP_FIXED_TIMELINE, 'YEAR', 'Year');
const RELATIVE_QUARTER = createDateMode(GROUP_FIXED_TIMELINE, 'QUARTER_OF_YEAR', 'Quarter');
const RELATIVE_MONTH = createDateMode(GROUP_FIXED_TIMELINE, 'MONTH_OF_YEAR', 'Month');
const RELATIVE_DAY = createDateMode(GROUP_FIXED_TIMELINE, 'DAY_OF_MONTH','Day');
const RELATIVE_HOUR = createDateMode(GROUP_FIXED_TIMELINE, 'HOUR_OF_DAY', 'Hour');


const DEFAULT_DATE_RANGE_FILTER_TYPE = createDateMode(undefined, 'RANGE', 'Date range');
const DEFAULT_DATE_RELATIVE_FILTER_TYPE = createDateMode(undefined, 'RELATIVE', 'Relative range');
const DEFAULT_DATE_PART_FILTER_TYPE = createDateMode(undefined, 'PART', 'Date part');

const TIMELINE_DATE_MODES = [
    YEAR,
    QUARTER,
    MONTH,
    WEEK,
    DAY,
    HOUR,
    MINUTE,
    SECOND
];
const GROUPED_DATE_MODES = [
    QUARTER_OF_YEAR,
    MONTH_OF_YEAR,
    WEEK_OF_YEAR,
    DAY_OF_MONTH,
    DAY_OF_WEEK,
    HOUR_OF_DAY
];
const BACKEND_ONLY_DATE_MODES = [
    createDateMode('NA', 'QUARTER_OF_DAY', 'Quarter of day'),
    createDateMode('NA', 'QUARTER_OF_HOUR', 'Quarter of hour'),
    createDateMode('NA', 'QUARTER_OF_MINUTE', 'Quarter of minute'),
];
const TIMELINE_AND_AUTOMATIC_DATE_MODES = [AUTOMATIC].concat(TIMELINE_DATE_MODES);
const DATE_MODES = [AUTOMATIC].concat(TIMELINE_DATE_MODES).concat(GROUPED_DATE_MODES);
const DATE_MODES_WITH_BACKEND_ONLY = DATE_MODES.concat(BACKEND_ONLY_DATE_MODES);

function buildBinNumberConfiguration(chartType, valueForMainDimension, valueForOtherDimension) {
    return {
        chartType,
        valueForMainDimension,
        valueForOtherDimension
    };
}

const BIN_NUMBER_DEFAULT = buildBinNumberConfiguration('default', 30, 30);

const NUMERICAL_BIN_NUMBERS = [
    buildBinNumberConfiguration('grouped_columns', 10, 5),
    buildBinNumberConfiguration('stacked_bars', 10, 5),
    buildBinNumberConfiguration('stacked_columns', 10, 5),
    buildBinNumberConfiguration('binned_xy', 10, 10)
];

const AUTOMATIC_MAX_BIN_NUMBERS = [
    buildBinNumberConfiguration('grouped_columns', 30, 5),
    buildBinNumberConfiguration('stacked_bars', 30, 5),
    buildBinNumberConfiguration('stacked_columns', 30, 5),
    buildBinNumberConfiguration('binned_xy', 10, 10),
    buildBinNumberConfiguration('lines', 1000, 10),
    buildBinNumberConfiguration('stacked_area', 1000, 10),
    buildBinNumberConfiguration('multi_columns_lines', 30, 10),
    buildBinNumberConfiguration('pie', 30, 10)
];

var app = angular.module('dataiku.charts');


app.service("ChartsStaticData", function() {
	var svc = {
  //       measureAxisScales :{
  //           "NORMAL" : ["NORMAL", "Normal scale"],
  //           "LOG_SCALE": ["LOG_SCALE", "Log scale"],
  //           "PERCENTAGE_SCALE": ["PERCENTAGE_SCALE", "Percentage scale"],
  //           "AVG_RATIO": ["AVG_RATIO", "Ratio to average"],
  //       },
		// stdAggrComputeModes : {
  //           "NORMAL": ["NORMAL", "Normal"],
  //           "INDICE_100": ["INDICE_100", "100-indexed"],
  //           "CUMULATIVE": ["CUMULATIVE", "Cumulative values"],
  //           "DIFFERENCE": ["DIFFERENCE", "Differencial values"]
  //       },

        stdAggrMeasureComputeModes : {
            "NORMAL": ["NORMAL", "Normal"],
            // "INDICE_100": ["INDICE_100", "100-indexed"],
            "CUMULATIVE": ["CUMULATIVE", "Cumulative values"],
            "DIFFERENCE": ["DIFFERENCE", "Differencial values"],
            "LOG_SCALE": ["LOG_SCALE", "Log scale"],
            "PERCENTAGE": ["PERCENTAGE", "Percentage scale"],
            "CUMULATIVE_PERCENTAGE": ["CUMULATIVE_PERCENTAGE", "Cumulative percentage scale"],
            "AVG_RATIO": ["AVG_RATIO", "Ratio to average"],
        },

        mapAdminLevels : [
            [2, "Country"],
            [4, "Region/State"],
            [6, "Department/County"],
            [7, "Metropolis"],
            [8, "City"]
        ],
        dateModes: DATE_MODES,
        defaultDateMode: AUTOMATIC,
        AUTOMATIC_DATE_MODE: AUTOMATIC
	};
	return svc;

});

app.factory("ChartUtils", function() {
    return {
        canUseSQL: function(chart) {
            return chart && !chart.def.hexbin;
        },

        has : function(array) {
            return array && array.length >= 1;
        },

        getColorDimension(chartDef) {
            // Note: this is incomplete (only includes chart types where non-numerical color dimensions are allowed)
            switch (chartDef.type) {
                case 'scatter':
                case 'scatter_map':
                case 'geom_map':
                    return chartDef.uaColor[0];
                case 'pie':
                    return chartDef.genericDimension0[0];
                default:
                    return chartDef.genericDimension1[0];
            }
        },

        getColorMeaningInfo: function(colorDimension, chartHandler) {
            if (!colorDimension) return null;

            for (let i = 0; i < chartHandler.usableColumns.length; i++) {
                if (chartHandler.usableColumns[i].column === colorDimension.column) {
                    return chartHandler.usableColumns[i].meaningInfo;
                }
            }
        }
    }
});


app.factory("ChartUADimension", function(){
    return {
        isTrueNumerical : function(dimension) {
            if (!dimension) return;
            return dimension.type == 'NUMERICAL' && !dimension.treatAsAlphanum;
        },
        isAlphanumLike : function(dimension) {
            if (!dimension) return;
            return dimension.type == 'ALPHANUM' || (dimension.type == 'NUMERICAL' && dimension.treatAsAlphanum);
        },
        isDiscreteDate: function(dimension) {
            if (!dimension) return;
            return dimension.type == 'DATE' && dimension.dateMode != 'RANGE';
        },
        isDateRange : function(dimension) {
            if (!dimension) return;
            return dimension.type == 'DATE' && dimension.dateMode == 'RANGE';
        },
        isDate : function(dimension) {
            if (!dimension) return;
            return dimension.type == 'DATE';
        }
    }
});


app.factory('ChartDimension', function() {
    /**
     * Finds the bin number definition for the chart type.
     */
    function findBinNumberOrDefault(chartType, binNumbers) {
        return binNumbers.find(automaticMaxBin => automaticMaxBin.chartType === chartType) || BIN_NUMBER_DEFAULT;
    }

    /**
     * Compute the bin number.
     */
    function getBinNumber(chartType, isMainDimension, binNumbers) {
        const binNumber = findBinNumberOrDefault(chartType, binNumbers);
        if (isMainDimension) {
            return binNumber.valueForMainDimension;
        }
        return binNumber.valueForOtherDimension;
    }

    function isTimelineable(dimension) {
        if (dimension && dimension.type === 'DATE') {
            if (!dimension.dateParams) return false;
            return TIMELINE_AND_AUTOMATIC_DATE_MODES.map(dateMode => dateMode.value).includes(dimension.dateParams.mode);
        }
        return false;
    }

    /**
     * Return True if the dimension is a Date dimension but with an ordinal scale (i.e. when it's configured
     * to display one tick per bin.
     */
    function isOrdinalDateScale(dimension) {
        return dimension && dimension.type === 'DATE' && dimension.oneTickPerBin;
    }

    /**
     * Return True if an automatic date dimension.
     */
    function isAutomatic(dimension) {
        if (!isTimelineable(dimension)) {
            return false;
        }
        return dimension.dateParams.mode === AUTOMATIC.value;
    }

    /**
     * Returns the max number of bins for automatic dimensions.
     */
    function getMaxBinNumberForAutomaticMode(chartType, isMainDimension) {
        return getBinNumber(chartType, isMainDimension, AUTOMATIC_MAX_BIN_NUMBERS);
    }

    /**
     * Returns true if the chart contains a main automatic date axis.
     */
    function isMainDateAxisAutomatic(chartDef) {
        return chartDef.genericDimension0.length > 0 && isAutomatic(chartDef.genericDimension0[0]);
    }

    /**
     * Returns the main date axis binning mode from the response.
     */
    function getMainDateAxisBinningMode(response) {
        return response.axisDefs[0].dateParams.mode;
    }

    /**
     * Builds the date free range filter type.
     */
    function buildDateFreeRangeFilterType(suffix) {
        return toDateFilterType({...DEFAULT_DATE_RANGE_FILTER_TYPE, suffix});
    }

    function buildDateRelativeFilterType(suffix) {
        return toDateFilterType({...DEFAULT_DATE_RELATIVE_FILTER_TYPE, suffix});
    }

    function buildDatePartFilterType(suffix) {
        return toDateFilterType({...DEFAULT_DATE_PART_FILTER_TYPE, suffix});
    }

    return {
        isTimelineable,
        isAutomatic,
        isTimeline: function(dimension) {
            return !isOrdinalDateScale(dimension) && isTimelineable(dimension);
        },
        /**
         * Return True if the first X-axis dimension is an non-ordinal automatic date dimension as it's the
         * only one that can be interactive.
         */
        containsInteractiveDimensionCandidate: function(chartDef) {
            if (chartDef.genericDimension0.length === 0) {
                return false;
            }
            return this.isCandidateForInteractivity(chartDef.genericDimension0[0]);
        },
        /**
         * Return True if the chart is configured to be interactive and is not prevented to be.
         */
        isInteractiveChart: function(chartDef, disableChartInteractivityGlobally) {
            if (disableChartInteractivityGlobally) {
                return false;
            }
            if (chartDef.type !== 'lines') {
                return false;
            }
            return this.containsInteractiveDimensionCandidate(chartDef);
        },
        /**
         * Returns True if the dimension is an automatic date dimension not using an ordinal scale.
         */
        isCandidateForInteractivity: function(dimension) {
            return isAutomatic(dimension) && !isOrdinalDateScale(dimension);
        },
        getDateModeDescription: function(mode) {
            const result = DATE_MODES_WITH_BACKEND_ONLY.filter(dateMode => dateMode.value === mode);
            if (result.length === 1) {
                return result[0].label;
            }
            return "Unknown";
        },
        getComputedMainAutomaticBinningModeLabel: function(uiDisplayState, response, chartDef, disableChartInteractivityGlobally) {
            if (!this.isInteractiveChart(chartDef, disableChartInteractivityGlobally)) {
                return undefined;
            }
            if (isMainDateAxisAutomatic(chartDef)) {
                return `(${this.getDateModeDescription(getMainDateAxisBinningMode(response))})`;
            } else {
                return undefined;
            }
        },
        /**
         * Returns the number of bins for numerical dimensions.
         */
        getNumericalBinNumber: function(chartType, isMainDimension) {
            return getBinNumber(chartType, isMainDimension, NUMERICAL_BIN_NUMBERS);
        },
        /**
         * Build the dataParams for the request date axis
         */
        buildDateParamsForAxis: function(dimension, chartType, isInteractiveDateDimension, isMainInteractiveDateAxis) {
            const dateParams = Object.assign({}, dimension.dateParams);
            if (isAutomatic(dimension)) {
                dateParams.maxBinNumberForAutomaticMode =
                    getMaxBinNumberForAutomaticMode(chartType, isMainInteractiveDateAxis);
            }
            return dateParams;
        },
        /**
         * Builds the runtime filter corresponding to the zoom settings on the interactive dimension.
         */
        buildZoomRuntimeFilter: function(interactiveDimension, zoomUtils) {
            return {
                column: interactiveDimension.column,
                columnType: 'DATE',
                filterType: 'INTERACTIVE_DATE_FACET',
                dateFilterType : 'RANGE',
                minValue: Math.round(zoomUtils.displayInterval[0]),
                maxValue: Math.round(zoomUtils.displayInterval[1])
            };
        },
        isAlphanumLike : function(dimension) {
            if (!dimension) {
                return;
            }
            return dimension.type == 'ALPHANUM' || (dimension.type == "NUMERICAL" && dimension.numParams && dimension.numParams.mode == "TREAT_AS_ALPHANUM");
        },
        isNumerical: function(dimension) {
            if (!dimension) {
                return;
            }
            return dimension.type == "NUMERICAL" && dimension.numParams && dimension.numParams.mode != "TREAT_AS_ALPHANUM";
        },
        isBinnedNumerical: function(dimension) {
            if (!dimension) {
                return;
            }
            return this.isNumerical(dimension) && dimension.numParams.mode != 'NONE';
        },
        isUnbinnedNumerical: function(dimension) {
            if (!dimension) {
                return;
            }
            return this.isNumerical(dimension) && !this.isBinnedNumerical(dimension);
        },
        isFilterDiscreteDate: function(filter) {
            if (!filter) {
                return;
            }
            return filter.columnType == 'DATE' && filter.dateFilterType != 'RANGE';
        },
        isFilterDateRange: function(filter) {
            if (!filter) {
                return;
            }
            return filter.columnType == 'DATE' && filter.dateFilterType == 'RANGE';
        },
        isFilterDateRelative: function(filter) {
            if (!filter) {
                return;
            }
            return filter.columnType == 'DATE' && filter.dateFilterType == 'RELATIVE';
        },
        isFilterDatePart: function(filter) {
            if (!filter) {
                return;
            }
            return filter.columnType == 'DATE' && filter.dateFilterType == 'PART';
        },
        hasOneTickPerBin: function(dimension) {
            if (!dimension) {
                return;
            }
            return dimension.oneTickPerBin === true;
        },
        getDateFilterTypes: function() {
            return [
                buildDateFreeRangeFilterType(),
                buildDateRelativeFilterType(),
                buildDatePartFilterType()
             ];
        },
        // TODO: this is a temporary fix while we wait for updating the date filters on chart logic as well
        getDateChartFilterTypes: function() {
            return [
                buildDateFreeRangeFilterType(),
                toDateFilterType(YEAR),
                toDateFilterType(QUARTER_OF_YEAR),
                toDateFilterType(MONTH_OF_YEAR),
                toDateFilterType(WEEK_OF_YEAR),
                toDateFilterType(DAY_OF_MONTH),
                toDateFilterType(DAY_OF_WEEK),
                toDateFilterType(HOUR_OF_DAY)
             ];
        },
        getDateFilterParts: function() {
            return [
                toDateFilterType(YEAR),
                toDateFilterType(QUARTER_OF_YEAR),
                toDateFilterType(MONTH_OF_YEAR),
                toDateFilterType(WEEK_OF_YEAR),
                toDateFilterType(DAY_OF_MONTH),
                toDateFilterType(DAY_OF_WEEK),
                toDateFilterType(HOUR_OF_DAY),
                toDateFilterType(INDIVIDUAL)
            ]
        },
        getDateRelativeFilterParts: function() {
            return [
                toDateFilterType(RELATIVE_YEAR),
                toDateFilterType(RELATIVE_QUARTER),
                toDateFilterType(RELATIVE_MONTH),
                toDateFilterType(RELATIVE_DAY),
                toDateFilterType(RELATIVE_HOUR)
            ]
        },
        /**
         * Appends the specified suffix to the date free range filter type (or remove it if suffix is undefined).
         */
        updateDateFreeRangeFilterType: function(dateFilterTypes, suffix) {
            const rangeFilterIndex = dateFilterTypes.findIndex(item => item[0] === DEFAULT_DATE_RANGE_FILTER_TYPE.value);
            dateFilterTypes[rangeFilterIndex] = buildDateFreeRangeFilterType(suffix);
        }
    };
});

})();