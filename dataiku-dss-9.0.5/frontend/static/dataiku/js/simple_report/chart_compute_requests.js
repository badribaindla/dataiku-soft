(function(){
'use strict';

var app = angular.module('dataiku.charts');

app.service("ChartRequestComputer", function(ChartDimension, LoggerProvider, BinnedXYUtils) {
    var Logger = LoggerProvider.getLogger("chartrequest");

    /* Helpers */

    var has = function(array) {
        return array && array.length > 0;
    };

    var makeAggregatedAxis = function (dim, chartType, isInteractiveDateDimension = false, isMainInteractiveDateAxis = false) {
        dim = angular.copy(dim);
        var axis = {
            column : dim.column,
            type : dim.type,
            sortPrune : {}
        };
        if (dim.type == "NUMERICAL" && dim.numParams.mode  != "TREAT_AS_ALPHANUM") {
            axis.numParams = dim.numParams;
        } else if (dim.type == "NUMERICAL" && dim.numParams.mode == "TREAT_AS_ALPHANUM") {
            dim.type = "ALPHANUM";
            axis.type = dim.type;
        }
        else if (dim.type === "DATE") {
            axis.dateParams = ChartDimension.buildDateParamsForAxis(dim, chartType, isInteractiveDateDimension, isMainInteractiveDateAxis);
        }

        if (dim.type == "ALPHANUM" || ChartDimension.isUnbinnedNumerical(dim)) {
             axis.sortPrune.maxValues = dim.maxValues;
        }

        axis.sortPrune.sortType = dim.sort.type;
        if (dim.sort.type == "AGGREGATION") {
            axis.sortPrune.aggregationSortId = dim.sort.measureIdx;
            axis.sortPrune.sortAscending = dim.sort.sortAscending;
        } else if (dim.sort.type == "COUNT") {
            axis.sortPrune.sortAscending = dim.sort.sortAscending;
        } else {
            axis.sortPrune.sortAscending = true; // NATURAL => ASC !
        }


        axis.sortPrune.generateOthersCategory = dim.generateOthersCategory;
        axis.sortPrune.filters = dim.filters;

        if (dim.type == "NUMERICAL" && dim.numParams.mode  != "TREAT_AS_ALPHANUM") {
            axis.sortPrune = {sortType:'NATURAL',sortAscending:true}
        }

        return axis;
    };

     var measureToAggregation = function(measure, id) {
        var ret = {
            id : id,
            column : measure.column,
            "function" : measure.function,
            "computeMode" : measure.computeMode || "NORMAL",
            "computeModeDim" : measure.computeModeDim
        }
        return ret;
    }
    var addAggregations = function(request, chartSpec) {
        request.aggregations = chartSpec.genericMeasures.map(measureToAggregation)
                    .concat(chartSpec.tooltipMeasures.map(measureToAggregation))
        request.count = true;
    };

    var addUa = function(request, ua, id) {
        var ret = {
            id : id,
            column: ua.column,
            type : ua.type
        };

        if (ua.treatAsAlphanum && ua.type == "NUMERICAL") {
            ret.type = "ALPHANUM";
        } else if (ua.type == "DATE") {
            ret.dateMode = ua.dateMode;
        }
        request.columns.push(ret);
    };

    var addFilters = function(request, chartSpec) {
        request.filters = [];
        angular.forEach(chartSpec.filters, function(filter, idx) {
            var backendFilter = angular.copy(filter);

            if (filter.filterType == "ALPHANUM_FACET" || filter.columnType == 'ALPHANUM' || ChartDimension.isFilterDiscreteDate(filter)) {
                backendFilter.excludedValues = [];
                for (var v in filter.excludedValues) {
                    backendFilter.excludedValues.push(v);
                }
            } else {
                backendFilter.excludedValues = null;
            }
            request.filters.push(backendFilter);
        });
    }

    var clipLeaflet = function(chartSpecific, request) {
         if (chartSpecific.leafletMap) {
            var bounds = chartSpecific.leafletMap.getBounds();
            request.minLon = bounds.getWest();
            request.maxLon = bounds.getEast();
            request.minLat = bounds.getSouth();
            request.maxLat = bounds.getNorth();
        }
    }

    /* Handling of chart types */

    var computeScatter = function(chartSpec, chartHandler){
    	Logger.info("Compute scatter request for", chartSpec);
        var request = {}
        request.type = "SCATTER_NON_AGGREGATED";

        function axis(dim) {
            var ret = {
                column : dim.column,
                type : dim.type
            };

            if (dim.treatAsAlphanum && dim.type == "NUMERICAL") {
                ret.type = "ALPHANUM";
            }
            if (ret.type == "ALPHANUM") {
                ret.sortPrune = {
                    sortType : dim.sortBy || "COUNT"
                };
                if (dim.sortBy == "COUNT") {
                    ret.sortPrune.sortAscending = false;
                } else {
                    ret.sortPrune.sortAscending = true;
                }
            } else if (ret.type == "DATE") {
                ret.dateMode = dim.dateMode;
            }
            return ret;
        }

        request.maxRows = 100000;
        request.xAxis = axis(chartSpec.uaXDimension[0]);
        request.yAxis = axis(chartSpec.uaYDimension[0]);
        request.columns = [];

        if (has(chartSpec.uaSize)) addUa(request, chartSpec.uaSize[0], "size");
        if (has(chartSpec.uaColor)) addUa(request, chartSpec.uaColor[0], "color");
        if (has(chartSpec.uaShape)) {
            chartSpec.uaShape[0].type = "ALPHANUM";
            addUa(request, chartSpec.uaShape[0], "shape");
        }

        chartSpec.uaTooltip.forEach(function(ua, idx){
            addUa(request, ua, "tooltip_" + idx);
        });

        addFilters(request, chartSpec);
        return request;
    }


    var computeAdminMap = function(chartSpec, chartSpecific){
        var request = {}
        var dim0 = chartSpec.geometry[0];

        request.type = "AGGREGATED_GEO_ADMIN";
        request.geoColumn = dim0.column;

        if (!dim0.adminLevel) dim0.adminLevel = 2;
        request.adminLevel = dim0.adminLevel;
        request.filled = chartSpec.variant == "filled_map";

        clipLeaflet(chartSpecific, request);

        request.aggregations = [];
        if (has(chartSpec.colorMeasure)) {
            var a = measureToAggregation(chartSpec.colorMeasure[0]);
            a.id = "color"
            request.aggregations.push(a);
        }
        if (has(chartSpec.sizeMeasure)){
            var a = measureToAggregation(chartSpec.sizeMeasure[0]);
            a.id = "size"
            request.aggregations.push(a);
        }

        request.aggregations = request.aggregations.concat(chartSpec.tooltipMeasures.map(measureToAggregation));

        if (!chartSpec.disableSafetyLimits) {
            request.maxDrawableTotalElements = 5000;
        }

        request.count = true;

        addFilters(request, chartSpec);
        return request;
    }
    var computeGridMap = function(chartSpec, chartSpecific){
        var request = {}
        var dim0 = chartSpec.geometry[0];

        request.type = "AGGREGATED_GEO_GRID";
        request.geoColumn = dim0.column;

        clipLeaflet(chartSpecific, request);

        request.lonRadiusDeg = chartSpec.mapGridOptions.gridLonDeg;
        request.latRadiusDeg = chartSpec.mapGridOptions.gridLatDeg;

        request.aggregations = [];
        if (has(chartSpec.colorMeasure)) {
            var a = measureToAggregation(chartSpec.colorMeasure[0]);
            a.id = "color"
            request.aggregations.push(a);
        }
        if (has(chartSpec.sizeMeasure)){
            var a = measureToAggregation(chartSpec.sizeMeasure[0]);
            a.id = "size"
            request.aggregations.push(a);
        }

        chartSpec.tooltipMeasures.forEach(function(measure, idx){
            var a = measureToAggregation(measure);
            a.id = "tooltip_" + idx;
            request.aggregations.push(a);
        });

        if (!chartSpec.disableSafetyLimits) {
            request.maxDrawableTotalElements = 50000;
        }

        request.count = true;

        addFilters(request, chartSpec);
        return request;
    }

    var computeStdAggregated = function(chartDef, zoomUtils) {
        var request = { type: "AGGREGATED_ND", axes: [], drawableElementsLimits: [] };

        let allElementsLimit = { limit: 10000, axes: [] };
        request.drawableElementsLimits.push(allElementsLimit);

        let interactiveDateDimension;
        if (has(chartDef.genericDimension0)) {
            const dimension = chartDef.genericDimension0[0];
            if (ChartDimension.isCandidateForInteractivity(dimension)) {
                interactiveDateDimension = dimension;
            }
            request.axes.push(makeAggregatedAxis(dimension, chartDef.type, Boolean(interactiveDateDimension), true));
            allElementsLimit.axes.push(request.axes.length-1);
        }

        if (has(chartDef.genericDimension1)) {
            const dimension = chartDef.genericDimension1[0];
            const isSameInteractiveDateDimension = interactiveDateDimension && interactiveDateDimension.column === dimension.column;
            request.axes.push(makeAggregatedAxis(dimension, chartDef.type, isSameInteractiveDateDimension, false));
            allElementsLimit.axes.push(request.axes.length-1);
        }

        if (has(chartDef.facetDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.facetDimension[0], chartDef.type));
            allElementsLimit.axes.push(request.axes.length-1);
            request.drawableElementsLimits.push({limit: 200, axes: [request.axes.length-1]});
        }

        if (has(chartDef.animationDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.animationDimension[0], chartDef.type));
            request.drawableElementsLimits.push({limit: 500, axes: [request.axes.length-1]});
        }

        // Should not happen ?
        if (chartDef.genericMeasures.length === 0) {
            throw new Error("To finish your chart, please select what you want to display and drop it in the 'Show' section");
        }
        addAggregations(request, chartDef);
        addFilters(request, chartDef);
        if (interactiveDateDimension && zoomUtils && !zoomUtils.disableZoomFiltering) {
            request.filters.push(ChartDimension.buildZoomRuntimeFilter(interactiveDateDimension, zoomUtils));
        }

        if (chartDef.disableSafetyLimits) {
            request.drawableElementsLimits.length = 0;
        }

        if (zoomUtils && zoomUtils.sequenceId) {
            request.sequenceId = zoomUtils.sequenceId;
        }

        return request;
    };

    var computePivotTable = function(chartDef) {
        var request = {type: "AGGREGATED_ND", axes: []};

        if (has(chartDef.xDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.xDimension[0], chartDef.type));
        }

        if (has(chartDef.yDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.yDimension[0], chartDef.type));
        }

        request.aggregations = [];
        addAggregations(request, chartDef);
        if (has(chartDef.colorMeasure) && chartDef.variant == 'colored') {
            request.aggregations.push(measureToAggregation(chartDef.colorMeasure[0], "color"));
        }
        addFilters(request, chartDef);

        // TODO @charts limits for pivot table fattable?

        return request;
    };

    var computeBinnedXY = function(chartDef, width, height) {
        var request = {type: "AGGREGATED_ND", aggregations: [], drawableElementsLimits: []};

        var allElementsLimit = {limit: 10000, axes: [0, 1]};
        request.drawableElementsLimits.push(allElementsLimit);

        request.axes = [makeAggregatedAxis(chartDef.xDimension[0], chartDef.type), request.yAxis = makeAggregatedAxis(chartDef.yDimension[0], chartDef.type)];

        if (has(chartDef.sizeMeasure)) {
            request.aggregations.push(measureToAggregation(chartDef.sizeMeasure[0], "size"));
        }
        if (has(chartDef.colorMeasure)) {
            request.aggregations.push(measureToAggregation(chartDef.colorMeasure[0], "color"));
        }

        chartDef.tooltipMeasures.forEach(function(measure) {
            request.aggregations.push(measureToAggregation(measure, "tooltip"));
        });

        if (has(chartDef.facetDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.facetDimension[0], chartDef.type));
            allElementsLimit.axes.push(request.axes.length-1);
            request.drawableElementsLimits.push({limit: 200, axes: [request.axes.length-1]});
        }

        if (has(chartDef.animationDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.animationDimension[0], chartDef.type));
            request.drawableElementsLimits.push({limit: 500, axes: [request.axes.length-1]});
        }

        addFilters(request, chartDef);

        if (chartDef.variant == "binned_xy_hex") {
            request.hexbin = true;
            var margins = {top: 10, right: 50, bottom: 50, left: 50};
            var chartWidth = width - margins.left - margins.right;
            var chartHeight = height - margins.top - margins.bottom;
            var radius = BinnedXYUtils.getRadius(chartDef, chartWidth, chartHeight);
            request.hexbinXHexagons = Math.floor(chartWidth / (2*Math.cos(Math.PI/6)*radius));
            request.hexbinYHexagons = Math.floor(chartHeight / (1.5*radius));
            request.$expectedVizWidth = chartWidth;
            request.$expectedVizHeight = chartHeight;
        }

        if (chartDef.disableSafetyLimits) {
            request.drawableElementsLimits.length = 0;
        }

        return request;
    };


    var computeGroupedXY = function(chartDef) {
        var request = {
            type : "AGGREGATED_ND",
            axes : [makeAggregatedAxis(chartDef.groupDimension[0], chartDef.type)],
            drawableElementsLimits: []
        };

        var allElementsLimit = {limit: 10000, axes: [0]};
        request.drawableElementsLimits.push(allElementsLimit);

        if (has(chartDef.facetDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.facetDimension[0], chartDef.type));
            allElementsLimit.axes.push(request.axes.length-1);
            request.drawableElementsLimits.push({limit: 200, axes: [request.axes.length-1]});
        }

        if (has(chartDef.animationDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.animationDimension[0], chartDef.type));
            request.drawableElementsLimits.push({limit: 500, axes: [request.axes.length-1]});
        }

        request.aggregations = [
            measureToAggregation(chartDef.xMeasure[0]),
            measureToAggregation(chartDef.yMeasure[0])
        ];
        if (has(chartDef.sizeMeasure)) {
            request.aggregations.push(measureToAggregation(chartDef.sizeMeasure[0], "size"));
        }
        if (has(chartDef.colorMeasure)) {
            request.aggregations.push(measureToAggregation(chartDef.colorMeasure[0], "color"));
        }

        addFilters(request, chartDef);

        if (chartDef.disableSafetyLimits) {
            request.drawableElementsLimits.length = 0;
        }

        return request;
    };

    var computeLift = function(chartDef) {
        var request = {
            type : "AGGREGATED_ND",
            axes : [makeAggregatedAxis(chartDef.groupDimension[0], chartDef.type)],
            drawableElementsLimits: []
        };

        var allElementsLimit = {limit: 10000, axes: [0]};
        request.drawableElementsLimits.push(allElementsLimit);

        if (has(chartDef.facetDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.facetDimension[0], chartDef.type));
            allElementsLimit.axes.push(request.axes.length-1);
            request.drawableElementsLimits.push({limit: 200, axes: [request.axes.length-1]});
        }

        if (has(chartDef.animationDimension)) {
            request.axes.push(makeAggregatedAxis(chartDef.animationDimension[0], chartDef.type));
            request.drawableElementsLimits.push({limit: 500, axes: [request.axes.length-1]});
        }

        request.aggregations = [
            measureToAggregation(chartDef.xMeasure[0]),
            measureToAggregation(chartDef.yMeasure[0])
        ];

        addFilters(request, chartDef);

        if (chartDef.disableSafetyLimits) {
            request.drawableElementsLimits.length = 0;
        }

        return request;
    };

    var computeBoxplots = function(chartDef) {
        var request = {
            type : "BOXPLOTS",
        };
        if (has(chartDef.boxplotBreakdownDim)){
            request.xAxis = makeAggregatedAxis(chartDef.boxplotBreakdownDim[0], chartDef.type);
        }
        request.column = {
            column : chartDef.boxplotValue[0].column,
            type : chartDef.boxplotValue[0].type
        };
        addFilters(request, chartDef);

        if (!chartDef.disableSafetyLimits) {
            request.maxDrawableTotalElements = 500;
        }

        return request;
    };

    var computeDensity2D = function(chartDef) {
        var request = {};
        request.type = "DENSITY_2D";
        request.xColumn = chartDef.xDimension[0].column;
        request.yColumn = chartDef.yDimension[0].column;
        addFilters(request, chartDef);
        return request;
    };

    var computeScatterMap = function(chartDef, chartSpecific){
        var request = {};

        request.type = "MAP_SCATTER_NON_AGGREGATED";
        request.maxRows = 100000;

        request.geoColumn = chartDef.geometry[0].column;

        clipLeaflet(chartSpecific, request);

        request.columns = [];
        if (has(chartDef.uaSize)) {
            addUa(request, chartDef.uaSize[0], "size");
        }
        if (has(chartDef.uaColor)) {
            addUa(request, chartDef.uaColor[0], "color");
        }
        chartDef.uaTooltip.forEach(function(ua, idx){
            addUa(request, ua, "tooltip_" + idx);
        });

        addFilters(request, chartDef);
        return request;
    };

    var computeDensityHeatMap = function(chartDef, chartSpecific){
        // Temporary solution until definition of a new request.type
        return computeScatterMap(chartDef, chartSpecific);
    };


    var computeGeometryMap = function(chartDef, chartSpecific){
        var request = {};

        request.type = "RAW_GEOMETRY";
        request.maxRows = 100000;

        request.geoColumn = chartDef.geometry[0].column;

        request.columns = [];
        if (has(chartDef.uaColor)) {
            addUa(request, chartDef.uaColor[0], "color");
        }
        chartDef.uaTooltip.forEach(function(ua, idx){
            addUa(request, ua, "tooltip_" + idx);
        });

        addFilters(request, chartDef);
        return request;
    };

    var computeWebapp = function(chartDef, chartSpecific){
        var request = {};
        request.type = "WEBAPP";
        request.columns = [];
        addFilters(request, chartDef);
        return request;
    };

    // TODO TODO TODO
    // if (chart.data.type == "diminishing_returns" && chart.data.measures.length < 2) {
    //     throw "Diminishing returns chart needs two measures (X and Y axis)";
    // }
    // if (chart.data.type == "diminishing_returns") {
    //     request.diminishingReturns = true;
    // }

    // /* Computations that modify the measures */
    // Does not exist anymore - please don't remove yet this, though
    // request.responseMeasures = angular.copy(chart.data.measures);
    // if (chart.data.measures.length >=2 && chart.data.computeMode == "AB_RATIO_PCT") {
    //     request.relativeLift = true;
    //     request.responseMeasures = [request.responseMeasures[0]];
    // }
    // if (chart.data.measures.length >=2 && chart.data.computeMode == "AB_RATIO") {
    //     request.ratio = true;
    //     request.responseMeasures = [request.responseMeasures[0]];
    // }
    // if (chart.data.measures.length ==1  && chart.data.computeMode == "LIFT_AVG") {
    //     request.liftToAverage = true;
    // }

    var svc = {

        /**
         * Computes the corresponding pivot request from the given chart def
         *
         * @param {ChartDef.java} chartSpec
         * @param {number} width
         * @param {number} height
         * @param chartSpecific ?
         *
         * @return {PivotTableRequest.java}
         */
        compute: function(chartSpec, width, height, chartSpecific) {
            // If the chart is facetted, the height the charts is different from the original height
            if (chartSpec.facetDimension.length) {
                height = chartSpec.chartHeight;
            }

            switch (chartSpec.type) {

            case "multi_columns_lines":
            case "grouped_columns":
            case "stacked_columns":
            case "stacked_bars":
            case "lines":
            case "stacked_area":
            case "pie" :
                return computeStdAggregated(chartSpec, chartSpecific.zoomUtils);

            case "pivot_table":
                return computePivotTable(chartSpec);

            case "binned_xy":
                return computeBinnedXY(chartSpec, width, height);

            case "grouped_xy":
                return computeGroupedXY(chartSpec);

            case "scatter":
                return computeScatter(chartSpec);

            case "admin_map":
                return computeAdminMap(chartSpec, chartSpecific);

            case "grid_map":
                return computeGridMap(chartSpec, chartSpecific);

            case "scatter_map":
                return computeDensityHeatMap(chartSpec, chartSpecific);

            case "density_heat_map":
                return computeScatterMap(chartSpec, chartSpecific);

            case "geom_map":
                return computeGeometryMap(chartSpec, chartSpecific);

            case "boxplots":
                return computeBoxplots(chartSpec);

            case "density_2d":
                return computeDensity2D(chartSpec);

            case "lift":
                var req = computeLift(chartSpec);
                req.diminishingReturns = true;
                return req;

            case "webapp":
                return computeWebapp(chartSpec, chartSpecific);

            default:
                Logger.error("Unhandled chart type", chartSpec);
                throw new Error("unknown chart type", chartSpec);
            }
        }
    };
    return svc;
});

})();
