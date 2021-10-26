(function() {
'use strict';

const app = angular.module('dataiku.charts', []);


app.service("ChartChangeHandler", function(Assert, LoggerProvider, ChartsStaticData, ChartDimension, ChartFeatures, WebAppsService, PluginConfigUtils) {
    var Logger = LoggerProvider.getLogger("charts")

    var takeAll = function(array) {
        if (!array) return [];
        return array.splice(0, array.length);
    };

    var takeAllMeasures = function(chartDef) {
        var ret =       takeAll(chartDef.genericMeasures)
                .concat(takeAll(chartDef.colorMeasure))
                .concat(takeAll(chartDef.sizeMeasure))
                .concat(takeAll(chartDef.xMeasure))
                .concat(takeAll(chartDef.yMeasure))
                .concat(takeAll(chartDef.tooltipMeasures));
        return ret;
    };

    var takeAllUA = function(chartDef) {
        return      chartDef.uaSize.splice(0, chartDef.uaSize.length)
            .concat(chartDef.uaColor.splice(0, chartDef.uaColor.length))
            .concat(chartDef.uaTooltip.splice(0, chartDef.uaTooltip.length))
            .concat(chartDef.boxplotValue.splice(0, chartDef.boxplotValue.length))
    };

    var takeAllMeasuresWithUA = function(chartDef) {
       return takeAllMeasures(chartDef)
            .concat(takeAllUA(chartDef).filter(isUsableAsMeasure).map(uaToMeasure));
    };
    var takeAllUAWithMeasures = function(chartDef) {
        return takeAllUA(chartDef)
            .concat(takeAllMeasures(chartDef).filter(isUsableAsUA).map(measureToUA))
    };

    var isUsableAsUA = function(measure) {
        return measure.column != null;
    };
    var isUsableAsMeasure = function(ua) {
        return ua.type == "NUMERICAL";
    };
    var measureToUA = function(measure) {
        return {
            column: measure.column,
            type : measure.type
        }
    };
    var uaToMeasure = function(ua) {
        return {
            column: ua.column,
            type : ua.type,
            "function" : "AVG"
        }
    };
    var uaDimToDim = function(ua) {
        return {
            column : ua.column,
            type : ua.type
        }
    };

    var accept = function(message) {
        return {
            accept: true,
            message: message
        };
    };

    var reject = function(message) {
        return {
            accept: false,
            message: message
        };
    };

    /**
     * Find and "steal" all existing dimensions from the chart.
     */
    var takeAllExistingDimensions = function(chartDef){
        var ret = takeAll(chartDef.genericDimension0)
            .concat(takeAll(chartDef.genericDimension1))
            .concat(takeAll(chartDef.xDimension))
            .concat(takeAll(chartDef.yDimension))
            .concat(takeAll(chartDef.groupDimension))
            .concat(takeAll(chartDef.boxplotBreakdownDim))
            .concat(takeAll(chartDef.uaXDimension).map(uaDimToDim))
            .concat(takeAll(chartDef.uaYDimension).map(uaDimToDim));
        return ret;
    };

    var has = function(array) {
        return array.length > 0;
    };

    function setSingleIfHasEnough(srcArr, tgtArr, srcIdx){
        tgtArr.length = 0;
        if (srcArr.length > srcIdx) {
            tgtArr.push(srcArr[srcIdx]);
        }
    }

    function isCount(column) {
        return column && (column.column == "__COUNT__" || column.column == null && column.function == "COUNT");
    }

    var svc = {
        onChartTypeChange : function(chartDef, newType, newVariant, newWebAppType) {
            var oldType = chartDef.type;
            Logger.info("Start type change:" + JSON.stringify(chartDef));

            switch (newType) {
            case "multi_columns_lines":
            case "grouped_columns":
            case "stacked_columns":
            case "stacked_bars":
            case "lines":
            case "stacked_area":
                var existingDimensions = takeAllExistingDimensions(chartDef);
                var existingMeasures = takeAllMeasuresWithUA(chartDef);
                if (existingDimensions.length >= 1) {
                    chartDef.genericDimension0 = [existingDimensions[0]];
                }
                /* Multi-columns-lines does not support 2 dims */
                if (existingDimensions.length >= 2 && newType != "multi_columns_lines") {
                    chartDef.genericDimension1 = [existingDimensions[1]];
                }


                if (has(chartDef.genericDimension0) && !has(chartDef.genericDimension1)) {
                    // 1D chart, get all measures
                    chartDef.genericMeasures = existingMeasures;
                } else if (has(chartDef.genericDimension0) && has(chartDef.genericDimension1)) {
                    // 2D chart, get first measure and drop all others ...
                    chartDef.genericMeasures = existingMeasures.slice(0, 1);
                }
                break;
            case "pie":
                var existingDimensions = takeAllExistingDimensions(chartDef);
                if (chartDef.genericMeasures.length>1) {
                	chartDef.genericMeasures = chartDef.genericMeasures.slice(0,1);
                }
                if (existingDimensions.length >= 1) {
                    chartDef.genericDimension0 = [existingDimensions[0]];
                }
                break;
            case "scatter":
            case "heatmap":
                var existingDimensions = takeAllExistingDimensions(chartDef);
                setSingleIfHasEnough(existingDimensions, chartDef.uaXDimension, 0);
                setSingleIfHasEnough(existingDimensions, chartDef.uaYDimension, 1);

                var allUA = takeAllUAWithMeasures(chartDef);
                setSingleIfHasEnough(allUA, chartDef.uaSize, 0);
                setSingleIfHasEnough(allUA, chartDef.uaColor, 1);
                chartDef.uaTooltip = allUA.slice(2);
                break;

            case "grouped_xy":
                /* TODO: If we come from scatter, maybe we could make a smarter
                 * choice by taking dimX -> AVG -> measX, dimY -> AVG -> measY */
                if (!has(chartDef.groupDimension)) {
                    var existingDimensions = takeAllExistingDimensions(chartDef);
                    if (existingDimensions.length >= 1) {
                        chartDef.groupDimension = [existingDimensions[0]];
                    }
                }
                var allMeasures = takeAllMeasuresWithUA(chartDef);
                setSingleIfHasEnough(allMeasures, chartDef.xMeasure, 0);
                setSingleIfHasEnough(allMeasures, chartDef.yMeasure, 1);
                setSingleIfHasEnough(allMeasures, chartDef.sizeMeasure, 2);
                setSingleIfHasEnough(allMeasures, chartDef.colorMeasure, 3);
                chartDef.tooltipMeasures = allMeasures.slice(4);

                break;

            case "binned_xy":
                // xDim, yDim, colorMeasure, sizeM
                var existingDimensions = takeAllExistingDimensions(chartDef);
                setSingleIfHasEnough(existingDimensions, chartDef.xDimension, 0);
                setSingleIfHasEnough(existingDimensions, chartDef.yDimension, 1);

                var allMeasures = takeAllMeasuresWithUA(chartDef);
                setSingleIfHasEnough(allMeasures, chartDef.sizeMeasure, 0);
                setSingleIfHasEnough(allMeasures, chartDef.colorMeasure, 1);
                chartDef.tooltipMeasures = allMeasures.slice(2);
                break;

            case "pivot_table":
                // xDim, yDim, genericMeasures
                var existingDimensions = takeAllExistingDimensions(chartDef);
                setSingleIfHasEnough(existingDimensions, chartDef.xDimension, 0);
                setSingleIfHasEnough(existingDimensions, chartDef.yDimension, 1);

                var allMeasures = takeAllMeasuresWithUA(chartDef);
                chartDef.genericMeasures = allMeasures;
                break;

            case "scatter_map":
            case "density_heat_map":
            case "heatmap_map":
            case "geom_map":
                var allUA = takeAllUAWithMeasures(chartDef);
                setSingleIfHasEnough(allUA, chartDef.uaSize, 0);
                setSingleIfHasEnough(allUA, chartDef.uaColor, 1);
                chartDef.uaTooltip = allUA.slice(2);
                break;

            case "grouped_scatter_map":
                if (!has(chartDef.groupDimension)) {
                    var allDimensions = takeAllExistingDimensions(chartDef);
                    setSingleIfHasEnough(allDimensions, chartDef.groupDimension, 0);
                }
                var allMeasures = takeAllMeasuresWithUA(chartDef);
                setSingleIfHasEnough(allMeasures, chartDef.sizeMeasure, 0);
                setSingleIfHasEnough(allMeasures, chartDef.colorMeasure, 1);
                chartDef.tooltipMeasures = allMeasures.slice(2);
                break;

            case "grid_map":
                var allMeasures = takeAllMeasuresWithUA(chartDef);
                setSingleIfHasEnough(allMeasures, chartDef.colorMeasure, 0);
                chartDef.tooltipMeasures = allMeasures.slice(1);
                break;

            case "admin_map":
                // TODO: for admin map if we are in FILLED mode then we only
                // have a color measure, no size, so we should probably inverse
                var allMeasures = takeAllMeasuresWithUA(chartDef);
                setSingleIfHasEnough(allMeasures, chartDef.sizeMeasure, 0);
                setSingleIfHasEnough(allMeasures, chartDef.colorMeasure, 1);
                chartDef.tooltipMeasures = allMeasures.slice(2);
                break;

            case "density_2d":
                var existingDimensions = takeAllExistingDimensions(chartDef);
                setSingleIfHasEnough(existingDimensions, chartDef.xDimension, 0);
                setSingleIfHasEnough(existingDimensions, chartDef.yDimension, 1);
                break;

            case "boxplots":
                var allDimensions = takeAllExistingDimensions(chartDef);
                setSingleIfHasEnough(allDimensions, chartDef.boxplotBreakdownDim, 0);
                var allUA = takeAllUAWithMeasures(chartDef);
                setSingleIfHasEnough(allUA, chartDef.boxplotValue, 0);
                break;


            case "lift":
                if (!has(chartDef.groupDimension)) {
                    var existingDimensions = takeAllExistingDimensions(chartDef);
                    if (existingDimensions.length >= 1) {
                        chartDef.groupDimension = [existingDimensions[0]];
                    }
                }
                var allMeasures = takeAllMeasuresWithUA(chartDef);
                setSingleIfHasEnough(allMeasures, chartDef.xMeasure, 0);
                setSingleIfHasEnough(allMeasures, chartDef.yMeasure, 1);
                chartDef.tooltipMeasures = allMeasures.slice(2);
                break;

			case "webapp":
				// all custom
				break;

            case "numerical_heatmap":
            case "radar":
            default:
                throw Error("unimplemented chart type : "  + newType);
                break;
            }

            if (!ChartFeatures.canAnimate(newType)) {
                chartDef.animationDimension.length = 0;
            }

            if (!ChartFeatures.canFacet(newType, newVariant, newWebAppType)) {
                chartDef.facetDimension.length = 0;
            }
        },

        /* ********************** ACCEPT / REJECT drops per type ********************* */

        stdAggregatedAcceptDimension : function(chartDef, data, fromList, targetList) {
            // Reject count of records
            if (isCount(data)) {
                return reject("Cannot aggregate on count of records");
            }
            return accept();
        },

        stdAggregatedAcceptMeasure : function(chartDef, data){
            Assert.trueish(data.type, 'no column type');

            if (data.type != "NUMERICAL") {
                return reject("Cannot use a non-numerical column as measure");
            }
            var cdt = chartDef.type;
            var hasAtLeastOneMeasure = (chartDef.genericMeasures && chartDef.genericMeasures.length >= 1);
            var hasNoMeasure = (!chartDef.genericMeasures || chartDef.genericMeasures.length === 0);
            return accept();
        },

        uaTooltipAccept : function(chartDef, data) {
            if (isCount(data)) {
                return reject("Cannot use count of records in tooltips");
            }
            return accept();
        },

        heatmapAccept : function(chartDef, data) {
            if (isCount(data)) {
                return reject("Cannot use Count of records on a scatter plot");
            }
            if (data.type == "ALPHANUM") {
                return reject("A heatmap can only use numerical values");
            }
            return accept();
        },

        scatterAccept : function(chartDef, data, targetList) {
            if (isCount(data)) {
                return reject("Cannot use Count of records on a scatter plot");
            }
            if (["GEOPOINT","GEOMETRY"].indexOf(data.type) != -1) {
                return reject("Cannot use geopoint or geometry values")
            }
            return accept();
        },

        scatterAcceptScaleMeasure : function(chartDef, data) {
        	if (data.type == "ALPHANUM") {
                return reject("Scale can only use numerical values");
            }
            return svc.scatterAccept(chartDef, data);
        },

        densityMapAcceptScaleMeasure : function(chartDef, data) {
            return svc.scatterAcceptScaleMeasure(chartDef, data);
        },

        boxplotsAcceptBreakdown : function(chartDef, data){
            if (isCount(data)) {
                return reject("Cannot use Count of records on a boxplot");
            }
            return accept();
        },
        boxplotsAcceptMeasure : function(chartDef, data) {
        	Assert.trueish(data.type, 'no column type');
            if (data.type != "NUMERICAL") {
                return reject("Cannot use a non-numerical column as measure");
            }
            if (isCount(data)) {
                return reject("Cannot use Count of records on a boxplot");
            }
            return accept();
        },
        binnedXYAcceptDimension : function(chartDef, data) {
            Assert.trueish(data.type, 'no column type');
            Assert.trueish(chartDef.variant, 'no chartDef variant');

            if (chartDef.variant == 'binned_xy_hex' && data.type != "NUMERICAL") {
                return reject("For hexagonal binning, only numerical dimensions are possible");
            } else {
                return svc.stdAggregatedAcceptDimension(chartDef, data);
            }
        },

        computeAutoName: function(chartDef, scope) {
            // TODO: Ugly scope dependency
            // If returns null or empty, don't use the new name.

            function addGM0L(){
                if (has(chartDef.genericMeasures)){
                    newName += scope.shortMeasureLabel(chartDef.genericMeasures[0]);
                }
            }
            function sdl(d){
                return d[0].column;
            }
            function sml(m) {
                return scope.shortMeasureLabel(m[0]);
            }

            var newName = "";
            switch (chartDef.type) {
            case "multi_columns_lines":
            case "grouped_columns":
            case "stacked_columns":
            case "stacked_bars":
            case "lines":
            case "stacked_area":
            case "pie":
                if (has(chartDef.genericDimension0) && !has(chartDef.genericDimension1)){
                    addGM0L();
                    newName += " by ";
                    newName += scope.dimensionLabel(chartDef.genericDimension0[0]);
                } else if(has(chartDef.genericDimension0) && has(chartDef.genericDimension1)) {
                    addGM0L();
                    newName += " by ";
                    newName += scope.dimensionLabel(chartDef.genericDimension0[0]);
                    newName += " and ";
                    newName += scope.dimensionLabel(chartDef.genericDimension1[0]);
                }
                break;
            case "pivot_table":
            	if (has(chartDef.xDimension) && has(chartDef.yDimension) && has(chartDef.genericMeasures)) {
	            	addGM0L()
	            	newName += " by ";
	                newName += sdl(chartDef.xDimension);
	                newName += " and ";
	                newName += sdl(chartDef.yDimension);
            	}
            	break;
            case "binned_xy":
                if (has(chartDef.xDimension) && has(chartDef.yDimension)) {
                    newName += sdl(chartDef.xDimension) + " vs " + sdl(chartDef.yDimension)+ " (aggregated)"
                }
                break;
            case "grouped_xy":
                if (has(chartDef.xMeasure) && has(chartDef.yMeasure) && has(chartDef.groupDimension)) {
                    newName += sml(chartDef.xMeasure) + " / " + sml(chartDef.yMeasure) + " by " +
                                sdl(chartDef.groupDimension)
                }
                break;
            case "scatter":
                newName = `${sdl(chartDef.uaXDimension)} vs ${sdl(chartDef.uaYDimension)}`;
                break;
            case "webapp":
            	newName = chartDef.$loadedDesc.desc.meta.label || 'webapp';
            	break
            }
            return newName;
        },

        /* ********************** Indicates chart validity ********************* */

        getValidity : function(chart) {
            const chartDef = chart.def;
            function ok(){
                return {
                    valid : true
                };
            }
            function incomplete(message) {
                return {
                    valid : false,
                    type : "INCOMPLETE",
                    message : message
                };
            }
            function invalid(message){
                return {
                    valid : false,
                    type : "INVALID",
                    message : message,
                };
            }

            switch (chartDef.type) {
            case "multi_columns_lines":
            case "grouped_columns":
            case "stacked_columns":
            case "stacked_bars":
            case "lines":
            case "stacked_area":
            case "pie":
                /* Minimal validity condition: first dimension, 1 measure */
                if (!has(chartDef.genericDimension0)) {
                    return incomplete("Please select how to group results");
                }
                if (!has(chartDef.genericMeasures)){
                    return incomplete("Please select what to show");
                }
                 /* Check for invalidities */
                if (chartDef.type == "stacked_columns" || chartDef.type == "stacked_bars"){
                    if (chartDef.variant == "stacked_100") {
                        // Stack 100% needs two dimensions to be meaningful
                        if (!has(chartDef.genericDimension1) && chartDef.genericMeasures.length == 1) {
                            return invalid("You need at least two dimensions or two measures for stacks normalized at 100%");
                        }
                    }
                }
                return ok();

            case "pivot_table":
                /* At least one dimension and one measure */
                if (!has(chartDef.genericMeasures)){
                    return incomplete("Please select what to show");
                }
                if (!has(chartDef.xDimension) && !has(chartDef.yDimension)) {
                    return incomplete("Please select either rows or columns");
                }
                return ok();

            case "binned_xy":

                if (!has(chartDef.xDimension)) {
                    return incomplete("You still need to give the X axis");
                }
                if (!has(chartDef.yDimension)) {
                    return incomplete("You still need to give the Y axis");
                }

                if (chartDef.variant == "binned_xy_hex") {
                    if (!ChartDimension.isNumerical(chartDef.xDimension[0]) ||
                        !ChartDimension.isNumerical(chartDef.yDimension[0])) {
                        return invalid("For hexagonal binning, only numerical dimensions are possible")
                    }
                }
                return ok();

            case "grouped_xy":
            case "lift":
                if (!has(chartDef.groupDimension)) {
                    return incomplete("Please select how to group");
                }
                if (!has(chartDef.xMeasure)) {
                    return incomplete("Please select how to position the X axis");
                }
                if (!has(chartDef.yMeasure)) {
                    return incomplete("Please select how to position the Y axis");
                }
                return ok();


            case "density_2d":
                if (!has(chartDef.xDimension)) {
                    return incomplete("You still need to give the X axis");
                }
                if (!has(chartDef.yDimension)) {
                    return incomplete("You still need to give the Y axis");
                }
                return ok();

            case "scatter":
                if (!has(chartDef.uaXDimension)) {
                    return incomplete("You still need to give the X axis");
                }
                if (!has(chartDef.uaYDimension)) {
                    return incomplete("You still need to give the Y axis");
                }
                return ok();

            case "boxplots":
                if (!has(chartDef.boxplotValue)) {
                    return incomplete("You need to give what to graph");
                }
                return ok();


            case "scatter_map":
            case "density_heat_map":
            case "admin_map":
            case "grid_map":
            case "geom_map":
                if (!has(chartDef.geometry)) {
                    return incomplete("Please select the geo data to show");
                }
                return ok();

            case "webapp":
            	// all custom
            	return ok();

            default:
                throw Error("unimplemented handling of " + chartDef.type);
                break;
            }
        },

        /* ********************** FIxup, autocomplete, handle sort ********************* */

        /* Fixup everything that needs to */
        fixupSpec : function(chart, chartOptionsState) {
            let chartDef = chart.def;
            const usableColumns = chart.summary && chart.summary.usableColumns;
            Logger.info("Fixing up the spec: " + JSON.stringify(chartDef));

            if (chartDef.type === 'webapp') {
                chartDef.webAppConfig = chartDef.webAppConfig || {};
                chartDef.$loadedDesc = WebAppsService.getWebAppLoadedDesc(chartDef.webAppType) || {};
                chartDef.$pluginDesc = WebAppsService.getOwnerPluginDesc(chartDef.webAppType);
                chartDef.$pluginChartDesc = chartDef.$loadedDesc.desc.chart;
                PluginConfigUtils.setDefaultValues(chartDef.$pluginChartDesc.leftBarParams, chartDef.webAppConfig);
                PluginConfigUtils.setDefaultValues(chartDef.$pluginChartDesc.topBarParams, chartDef.webAppConfig);
            } else {
                chartDef.$loadedDesc = null;
                chartDef.$pluginDesc = null;
                chartDef.$pluginChartDesc = null;
            }


            function autocompleteGenericDimensionForEngineType(chart){
                return function(dimension) {
                    if (dimension.isA != "dimension") {
                        Assert.trueish(dimension.column, 'no dimension column');
                        Assert.trueish(dimension.type, 'no dimension type');
                        var col = dimension.column;
                        var type = dimension.type;
                        clear(dimension);
                        dimension.column = col;
                        dimension.type = type;
                        if (dimension.type == "DATE") {
                            dimension.numParams = {emptyBinsMode: 'AVERAGE'};
                            dimension.dateParams = {mode: ChartsStaticData.defaultDateMode.value};
                        } else if (dimension.type == "NUMERICAL") {
                            /*
                             * Compute a proper number of bins :
                             * - Second dimension of a stack or group : 5
                             * - First dimension of an area or lines : 30
                             * - Scatter or first dimension of an histogram: 10
                             */
                            var cdt = chartDef.type;
                            const isMainDimension = ['grouped_columns', 'stacked_bars', 'stacked_columns'].includes(cdt) && dimension === chartDef.genericDimension0[0];
                            var nbBins = ChartDimension.getNumericalBinNumber(cdt, isMainDimension);
                            dimension.numParams = {
                                mode: "FIXED_NB",
                                nbBins: nbBins,
                                binSize: 100,
                                emptyBinsMode: "ZEROS"
                            };
                            dimension.maxValues = 100; // Will only be used if no binning
                        } else if (dimension.type == "ALPHANUM") {
                            dimension.numParams = {emptyBinsMode: 'ZEROS'};
                            dimension.maxValues = 20;
                        }
                        dimension.generateOthersCategory = true;
                        dimension.filters = [];
                        dimension.isA = "dimension";

                        if (dimension.type == "GEOPOINT" && chartDef.type.find("_map") < 0) {
                            chartDef.type = "grid_map";
                        }
                        if (dimension.type == "GEOMETRY" && chartDef.type.find("_map") < 0) {
                            chartDef.type = "grid_map";
                        }
                    }
                }
            }

            const autocompleteGenericDimension = autocompleteGenericDimensionForEngineType(chart);

            chartDef.genericDimension0.forEach(autocompleteGenericDimension);
            chartDef.genericDimension1.forEach(autocompleteGenericDimension);
            chartDef.facetDimension.forEach(autocompleteGenericDimension);
            chartDef.animationDimension.forEach(autocompleteGenericDimension);
            chartDef.boxplotBreakdownDim.forEach(autocompleteGenericDimension);
            chartDef.xDimension.forEach(autocompleteGenericDimension);
            chartDef.yDimension.forEach(autocompleteGenericDimension);
            chartDef.groupDimension.forEach(autocompleteGenericDimension);

            if (!chartDef.filters) chartDef.filters = [];

            function autocompleteFilter(filter){
                if (usableColumns) {
                    const uc = usableColumns.find(col => col.column == filter.column);
                    if (uc && uc.type != filter.columnType) {
                        filter.type = uc.type;
                        filter.columnType = uc.type;
                        filter.filterType = uc.type + "_FACET";
                        if (filter.columnType == 'DATE') {
                            filter.dateFilterType = 'RANGE';
                        }
                    }
                }
                if (filter.isA != "filter") {
                    var col = filter.column;
                    var type = filter.columnType || filter.type;
                    // clear(filter);
                    filter.column = col;
                    filter.columnType = type;
                    filter.filterType = type + "_FACET";
                    filter.isA = "filter";
                    filter.excludedValues = {};
                    if (filter.columnType == 'DATE') {
                        filter.dateFilterType = 'RANGE';
                    }
                }
                if (!filter.excludedValues) {
                    filter.excludedValues = {};
                }
            }

            chartDef.filters.forEach(autocompleteFilter);


            function autocompleteGenericMeasure(measure) {
                if (measure.isA != "measure") {
                    Assert.trueish(measure.type, 'no measure type');
                    var col = measure.column;
                    var type = measure.type;
                    clear(measure);
                    if (col == "__COUNT__") {
                        measure.column = null;
                        measure.function = "COUNT";
                    } else {
                        measure.column = col;
                        measure.function = "AVG";
                    }
                    measure.type = type;
                    measure.displayed = true;
                    //if (chartDef.dimensions.length == 1 && chartDef.type == "multiplot_1d") {
                        measure.displayAxis = "axis1";
                        measure.displayType = "column";
                    //}
                    measure.isA = "measure";
                }
            }
            chartDef.genericMeasures.forEach(autocompleteGenericMeasure);
            chartDef.sizeMeasure.forEach(autocompleteGenericMeasure);
            chartDef.colorMeasure.forEach(autocompleteGenericMeasure);
            chartDef.tooltipMeasures.forEach(autocompleteGenericMeasure);
            chartDef.xMeasure.forEach(autocompleteGenericMeasure);
            chartDef.yMeasure.forEach(autocompleteGenericMeasure);

            function autocompleteUA(ua) {
                if (ua.isA != "ua") {
                    ua.sortBy = "NATURAL";
                    ua.isA = "ua";
                    if (ua.type == "DATE") {
                        ua.dateMode = "RANGE";
                    }
                }
            }

            chartDef.uaXDimension.forEach(autocompleteUA);
            chartDef.uaYDimension.forEach(autocompleteUA);
            chartDef.uaSize.forEach(autocompleteUA);
            chartDef.uaColor.forEach(autocompleteUA);
            chartDef.uaTooltip.forEach(autocompleteUA);
            chartDef.geometry.forEach(autocompleteUA);

            function handleSortsOnStdDimension(dimension) {
                var oldSort = dimension.sort;
                var firstNonNaturalSort = null;
                dimension.possibleSorts = [ { type : "NATURAL", label : "Natural ordering", sortAscending:true}];

                function addMeasureSorts(measure, resultingIdx) {
                    var sort = null;
                    switch (measure.function){
                        case 'COUNT':
                            sort = {type : "AGGREGATION", measureIdx : resultingIdx, label : "Count of records"};
                            break;
                        case 'SUM':
                            sort = {type : "AGGREGATION", measureIdx : resultingIdx, label : "Sum of " + measure.column};
                            break;
                        case 'AVG':
                            sort = {type : "AGGREGATION", measureIdx : resultingIdx, label : "Average of " + measure.column};
                            break;
                        case 'MIN':
                            sort = {type : "AGGREGATION", measureIdx : resultingIdx, label : "Minimum of " + measure.column};
                            break;
                        case 'MAX':
                            sort = {type : "AGGREGATION", measureIdx : resultingIdx, label : "Maximum of " + measure.column};
                            break;
                    }
                    if (firstNonNaturalSort == null) {
                        firstNonNaturalSort = sort;
                    }
                    if(sort) {
                        dimension.possibleSorts.push(sort);

                        // Generate the asc version
                        var ascSort = angular.copy(sort);
                        ascSort.sortAscending = true;
                        ascSort.label += ', ascending';
                        dimension.possibleSorts.push(ascSort);
                        sort.label += ', descending';
                    }
                }
                chartDef.genericMeasures.forEach(addMeasureSorts);
                chartDef.tooltipMeasures.forEach(function(x, i){
                    addMeasureSorts(x, chartDef.genericMeasures.length + i);
                })

                // Put back the old sort if possible ...
                dimension.sort = null;
                for (var i = 0; i < dimension.possibleSorts.length; i++) {
                    if (angular.equals(oldSort, dimension.possibleSorts[i])) {
                        dimension.sort = dimension.possibleSorts[i];
                        break;
                    }
                }
                if (dimension.sort == null) {
                    if (dimension.type == "ALPHANUM" && firstNonNaturalSort != null) {
                        dimension.sort = firstNonNaturalSort;
                    } else {
                        dimension.sort = dimension.possibleSorts[0];
                    }
                }
            }

            chartDef.genericDimension0.forEach(handleSortsOnStdDimension);
            chartDef.genericDimension1.forEach(handleSortsOnStdDimension);
            chartDef.facetDimension.forEach(handleSortsOnStdDimension);
            chartDef.animationDimension.forEach(handleSortsOnStdDimension);
            chartDef.xDimension.forEach(handleSortsOnStdDimension);
            chartDef.yDimension.forEach(handleSortsOnStdDimension);
            chartDef.groupDimension.forEach(handleSortsOnStdDimension);

            function handleSortsOnBoxplotimension(dimension) {
                var oldSort = dimension.sort;
                var firstNonNaturalSort = null;
                dimension.possibleSorts = [
                    {type: "NATURAL", label: "Natural ordering", sortAscending: true},
                    {type: "COUNT", label: "Count of records, descending", sortAscending: false},
                    {type: "COUNT", label: "Count of records, ascending", sortAscending: true}
                ];

                // Put back the old sort if possible ...
                dimension.sort = null;
                for (var i = 0; i < dimension.possibleSorts.length; i++) {
                    if (angular.equals(oldSort, dimension.possibleSorts[i])) {
                        dimension.sort = dimension.possibleSorts[i];
                        break;
                    }
                }
                /* Default to count desc */
                if (dimension.sort == null) {
                    dimension.sort = dimension.possibleSorts[1];
                }
            }
            chartDef.boxplotBreakdownDim.forEach(handleSortsOnBoxplotimension);

            /* Enable or disable relevant options */
            chartOptionsState.zeroEnabled = chartDef.type == "grouped_columns" || chartDef.type == "lines";

            chartOptionsState.enableLegendEnabled = true;
            switch (chartDef.type) {
                case 'map':
                case 'grouped_xy':
                case 'binned_xy':
                    chartOptionsState.enableLegendEnabled = false;
                    break;
            }

            chartOptionsState.smoothingEnabled = ChartFeatures.hasSmoothing(chartDef.type);
            chartOptionsState.strokeWidthEnabled = ChartFeatures.hasStrokeWidth(chartDef.type);
            chartOptionsState.xAxisEnabled = ChartFeatures.canDisableXAxis(chartDef.type);
            chartOptionsState.brushEnabled = ChartDimension.isInteractiveChart(chartDef, false);

            // Measure-compute modes

            var enabledMCModes = [];

            function enableMCMode(str) {
                enabledMCModes.push(ChartsStaticData.stdAggrMeasureComputeModes[str]);
            }

            enableMCMode("NORMAL");

            var nbGDims = chartDef.genericDimension0.length + chartDef.genericDimension1.length;
            var nbXYDims = chartDef.xDimension.length + chartDef.yDimension.length;
            var nbMeasures =chartDef.genericMeasures.length;

            switch (chartDef.type) {
                case 'grouped_columns':
                case 'lines':
                case 'multi_columns_lines':
                    enableMCMode("PERCENTAGE");
                    enableMCMode("AVG_RATIO");
                    enableMCMode("CUMULATIVE");
                    enableMCMode("CUMULATIVE_PERCENTAGE");

                    if (nbGDims == 1) {
                        enableMCMode("DIFFERENCE");
                    }
                    break;
                case 'stacked_columns':
                case 'stacked_bars':
                case 'stacked_area':
                    enableMCMode("PERCENTAGE");
                    enableMCMode("CUMULATIVE");
                    enableMCMode("CUMULATIVE_PERCENTAGE");
                    break;
                case "pivot_table":
                    enableMCMode("PERCENTAGE");
                    enableMCMode("AVG_RATIO");
                    enableMCMode("CUMULATIVE");
                    enableMCMode("CUMULATIVE_PERCENTAGE");
                    enableMCMode("DIFFERENCE");
                    break;
                case "pie":
                    enableMCMode("PERCENTAGE");
                    break;
            }
            /* Revert to normal the measures that use illegal modes */
            chartDef.genericMeasures.forEach(function(gm){
                var modeEnabled = enabledMCModes.some(function(m){
                    return m[0] == gm.computeMode;
                });
                if (!modeEnabled) {
                    gm.computeMode = "NORMAL";
                }
            });
            chartOptionsState.enabledMCModes = enabledMCModes;

            angular.forEach(chartDef.genericMeasures, function(m, idx) {
                if (m.displayed && m.displayAxis == null) {
                    m.displayAxis = "axis1";
                }
                if (m.displayed && m.displayType == null) {
                    // TODO: Reuse the logic that makes the default
                    // display type according to the dimension type
                    m.displayType = "column";
                }
            });

            /* For std-aggregated charts that only support 1 measure when there
             * are two dimensions, move additional measures to tooltip
             */
            if (has(chartDef.genericDimension0) && has(chartDef.genericDimension1)) {
                chartDef.genericMeasures.splice(1, chartDef.genericMeasures.length - 1).forEach(function(x){
                    chartDef.tooltipMeasures.push(x);
                })
            }

            /* If log scale is enabled but not possible, disable it */
            if (chartDef.axis1LogScale && chartDef.variant == "stacked_100") {
                chartDef.axis1LogScale = false;
            }

            /* Force column display of all measures (not line) if chart type is grouped_columns */
            if (chartDef.type == "grouped_columns") {
                chartDef.genericMeasures.forEach(function(m) {
                   m.displayType = "column";
                });
            }

            /* Map fixup */
            if (!chartDef.mapOptions) {
                chartDef.mapOptions = {
                    tilesLayer : "cartodb-positron"
                }
            }
            if (!chartDef.mapGridOptions) chartDef.mapGridOptions = {}
            if (!chartDef.mapGridOptions.gridLonDeg) chartDef.mapGridOptions.gridLonDeg = 0.5;
            if (!chartDef.mapGridOptions.gridLatDeg) chartDef.mapGridOptions.gridLatDeg = 0.5;

            Logger.info("ChartSpec fixup done", chartDef, chartOptionsState);
        },

        fixupChart: function (chartDef) {
            // "Auto-migration"
            if (!chartDef.hexbinRadius) {
                chartDef.hexbinRadius = 20;
            }
            if (!chartDef.hexbinRadiusMode) {
                chartDef.hexbinRadiusMode = 'NUM_HEXAGONS';
            }
            if (!chartDef.hexbinNumber) {
                chartDef.hexbinNumber = 20;
            }
            if (!chartDef.yAxisMode) {
                chartDef.yAxisMode = "NORMAL";
            }
            if (!chartDef.xAxisMode) {
                chartDef.xAxisMode = "NORMAL";
            }
            if (!chartDef.computeMode) {
                chartDef.computeMode = "NONE";
            }
            if (chartDef.smoothing === undefined) {
                chartDef.smoothing = true;
            }
            if (chartDef.brush === undefined) {
                chartDef.brush = true;
            }
            if (!chartDef.strokeWidth) {
                chartDef.strokeWidth = 1;
            }
            if (!chartDef.fillOpacity) {
                chartDef.fillOpacity = 0.6;
            }
            if (!chartDef.chartHeight) {
                chartDef.chartHeight = 200;
            }
            if (chartDef.showLegend === undefined) {
                chartDef.showLegend = true;
            }
            if (chartDef.colorPaletteType === undefined) {
                chartDef.colorPaletteType = "LINEAR";
            }
            if (chartDef.showXAxisLabel === undefined) {
                chartDef.showXAxisLabel = true;
            }
            if (chartDef.showYAxisLabel === undefined) {
                chartDef.showYAxisLabel = true;
            }
            if (chartDef.showInChartLabels === undefined) {
                chartDef.showInChartLabels = true;
            }
            if (chartDef.singleXAxis === undefined) {
                chartDef.singleXAxis = true;
            }
            if (!chartDef.animationFrameDuration) {
                chartDef.animationFrameDuration = 3000;
            }
            if (!chartDef.legendPlacement) {
                chartDef.legendPlacement = 'OUTER_RIGHT';
            }
            if (!chartDef.genericDimension0) chartDef.genericDimension0 = [];
            if (!chartDef.genericDimension1) chartDef.genericDimension1 = [];
            if (!chartDef.facetDimension) chartDef.facetDimension = [];
            if (!chartDef.animationDimension) chartDef.animationDimension = [];
            if (!chartDef.genericMeasures) chartDef.genericMeasures = [];
            if (!chartDef.xDimension) chartDef.xDimension = [];
            if (!chartDef.yDimension) chartDef.yDimension = [];
            if (!chartDef.groupDimension) chartDef.groupDimension = [];
            if (!chartDef.uaXDimension) chartDef.uaXDimension = [];
            if (!chartDef.uaYDimension) chartDef.uaYDimension = [];
            if (!chartDef.xMeasure) chartDef.xMeasure = [];
            if (!chartDef.yMeasure) chartDef.yMeasure = [];
            if (!chartDef.sizeMeasure) chartDef.sizeMeasure = [];
            if (!chartDef.colorMeasure) chartDef.colorMeasure = [];
            if (!chartDef.tooltipMeasures) chartDef.tooltipMeasures = [];
            if (!chartDef.uaSize) chartDef.uaSize = [];
            if (!chartDef.uaColor) chartDef.uaColor = [];
            if (!chartDef.uaShape) chartDef.uaShape = [];
            if (!chartDef.uaTooltip) chartDef.uaTooltip = [];
            if (!chartDef.boxplotBreakdownDim) chartDef.boxplotBreakdownDim = [];
            if (!chartDef.boxplotValue) chartDef.boxplotValue = [];
            if (!chartDef.geometry) chartDef.geometry = [];

            if (!chartDef.colorOptions) {
                chartDef.colorOptions = {
                    singleColor: "#2678B1",
                    transparency: 0.75,
                }
            }

            if (!chartDef.colorOptions.customPalette) {
                chartDef.colorOptions.customPalette = {
                    id: "__dku_custom__",
                    name: "Custom Palette",
                    colors: [],
                    values: []
                }
            }

            if (!chartDef.colorOptions.ccScaleMode) {
                chartDef.colorOptions.ccScaleMode = "NORMAL";
            }
            if (!chartDef.colorOptions.paletteType) {
                chartDef.colorOptions.paletteType = "CONTINUOUS";
            }
            if (!chartDef.colorOptions.quantizationMode) {
                chartDef.colorOptions.quantizationMode = "NONE";
            }
            if (!chartDef.colorOptions.numQuantizeSteps) {
                chartDef.colorOptions.numQuantizeSteps = 5;
            }
            if (!chartDef.colorOptions.paletteMiddleValue) {
                chartDef.colorOptions.paletteMiddleValue = 0;
            }
            if (chartDef.colorOptions.paletteMiddleValue <= 0 && chartDef.colorOptions.paletteType == 'DIVERGING' && chartDef.colorOptions.ccScaleMode == 'LOG') {
                chartDef.colorOptions.paletteMiddleValue = 1;
            }
            if (!chartDef.bubblesOptions) {
                chartDef.bubblesOptions = {
                    defaultRadius: 5,
                    singleShape: 'FILLED_CIRCLE'
                }
            }
            if (!chartDef.pieOptions) {
                chartDef.pieOptions = {
                    donutHoleSize: 54
                }
            }

            if (chartDef.type === 'webapp') {
                chartDef.webAppConfig = chartDef.webAppConfig || {};
                chartDef.$loadedDesc = WebAppsService.getWebAppLoadedDesc(chartDef.webAppType) || {};
                chartDef.$pluginDesc = WebAppsService.getOwnerPluginDesc(chartDef.webAppType);
                chartDef.$pluginChartDesc = chartDef.$loadedDesc.desc.chart;
                PluginConfigUtils.setDefaultValues(chartDef.$pluginChartDesc.leftBarParams, chartDef.webAppConfig);
                PluginConfigUtils.setDefaultValues(chartDef.$pluginChartDesc.topBarParams, chartDef.webAppConfig);
            } else {
                chartDef.$loadedDesc = null;
                chartDef.$pluginDesc = null;
                chartDef.$pluginChartDesc = null;
            }
            return chartDef;
        },

        defaultNewChart : function(){
            // Correctly initialize the new chart so that the "blank" chart that is saved is correct.
            return this.fixupChart({
                name : "Chart",
                type : "grouped_columns",
                variant : "normal",
                includeZero : true,
                showLegend : true,
            });
        }
    };
    return svc;
});

})();
