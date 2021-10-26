(function() {
'use strict';

	window.DKUCharts = {
		basicChart : function(width, height, margins) {
			if (margins == null) {
				margins = {top: 20, right: 20, bottom: 50, left: 50}
			}
			var chartWidth = width - margins.left - margins.right
			var chartHeight = height - margins.top - margins.bottom
			return {
				width : width - margins.left - margins.right,
				height : height - margins.top - margins.bottom,

				xscale : d3.scale.linear().range([0, chartWidth]),
				yscale : d3.scale.linear().range([chartHeight, 0]),

				makeTopG : function(sel) {
					return sel.style("width", width)
					.style("height", height)
					.append("g")
					.attr("transform", "translate(" + margins.left + "," + margins.top + ")");
				}
			}
		},


		drawGrid : function(g, xscale, yscale, width, height, lastY) {
			var xticks = xscale.ticks( )
			var lastX = xticks[xticks.length - 1]
			var yticks = yscale.ticks( )
			lastY = (lastY == null) ? yticks[yticks.length - 1] : lastY;

			g.append("g").attr("class", "vlines")
			.selectAll(".xline")
			.data(xticks)
			.enter().append("line")
			.attr("class", "xline")
			.attr("x1", function(d) {  return xscale(d)})
			.attr("x2", function(d) { return xscale(d)})
			.attr("y1", height)
			.attr("y2", yscale(lastY))
			.attr("stroke", "#cecece")
			.attr("opacity", 0.4);

			g.append("g").attr("class", "hlines")
			.selectAll(".hline")
			.data(yticks)
			.enter().append("line")
			.attr("class", "hline")
			.attr("y1", function(d) {  return yscale(d)})
			.attr("y2", function(d) { return yscale(d)})
			.attr("x1", 0)
			.attr("x2", xscale(lastX))
			.attr("stroke", "#cecece")
			.attr("opacity", 0.4);
		},

		nicePrecision : function(val, p) {
			if (val == undefined) return undefined;
			if (val < Math.pow(10, p)) {
				if (Math.round(val) == val) {
					/* Don't add stuff to integers */
					return val.toFixed(0);
				} else {
					return val.toPrecision(p);
				}
			} else {
				return val.toFixed(0);
			}
		}
	}

})();
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

(function(){
    "use strict";
    var app = angular.module('dataiku.charts');

    window.dkuDragType = (
        window.navigator.userAgent.indexOf("Trident") >= 0) ? "Text" :
            (window.navigator.userAgent.indexOf("Edge") >= 0 ? "text/plain" : "json");

    function setDragActive() {
        $(".chart-configuration-wrapper").addClass("drag-active");
    }
    function setDragInactive(){
        $(".chart-configuration-wrapper").removeClass("drag-active");
    }

    function addClassHereAndThere(element, clazz) {
        $(element).addClass(clazz);
        $(element).parent().parent().addClass(clazz);
    }

    function removeClassHereAndThere(element, clazz) {
        $(element).removeClass(clazz);
        $(element).parent().parent().removeClass(clazz);
    }

    app.directive("chartMultiDragDropZones", function($parse) {
        return {
            link : function($scope, element, attrs) {
                $scope.activeDragDrop = {};

                $scope.onDragEnd = function() {
                    // Unhide the moved element, as ng-repeat will reuse it
                    if($scope.activeDragDrop.draggedElementToHide) $scope.activeDragDrop.draggedElementToHide.show();
                    clear($scope.activeDragDrop);
                    setDragInactive();
                };

                element[0].addEventListener("dragend", function(e) {
                    $scope.$apply($scope.onDragEnd);
                });
            }
        };
    });

    app.directive("chartDragCopySource", function($parse) {
        return {
            link : function($scope, element, attrs) {
                var el = element[0];
                el.draggable = true;

                el.addEventListener('dragstart', function(e) {
                    $scope.$apply(function() {
                    $scope.activeDragDrop.active = true;
                    setDragActive();
                    $scope.activeDragDrop.data = $scope.$eval(attrs.chartDragCopySource);
                    });
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(dkuDragType, JSON.stringify($scope.activeDragDrop.data));
                    // FIXME highlight droppable
                    this.classList.add('dragging');
                    return false;
                },false);

                el.addEventListener('dragend', function(e) {
                    this.classList.remove('dragging');
                    return false;
                },false);
            }
        };
    });


    app.directive("chartDragDropListItem", function($parse) {
        return {
            link : function($scope, element, attrs) {
                $(element).attr("draggable", "true");

                element[0].addEventListener('dragstart', function(e) {
                    var draggedElement = $(e.target);

                    $scope.$apply(function() {
                        $scope.activeDragDrop.active = true;
                        setDragActive();
                        $scope.activeDragDrop.moveFromList = $scope.$eval(attrs.chartDragDropListItem);
                        $scope.activeDragDrop.moveFromListIndex = draggedElement.index();
                        $scope.activeDragDrop.data = $scope.activeDragDrop.moveFromList[$scope.activeDragDrop.moveFromListIndex];
                        $scope.activeDragDrop.draggedElementToHide = draggedElement;
                    });

                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData(dkuDragType, JSON.stringify($scope.activeDragDrop.data));

                    this.classList.add('dragging');
                    return false;
                }, false);
            }
        };
    });

    app.directive("chartDragDropList", function($parse, Assert) {
        return {
            scope: true,
            link : function($scope, element, attrs) {
                var acceptFunc = function(data){
                    return {
                        accept: true,
                        message: 'Drop here'
                    };
                };
                if(attrs.acceptDrop) {
                    var parsed = $parse(attrs.acceptDrop);
                    acceptFunc = function(data){
                        return parsed($scope.$parent || $scope, {'data': data});
                    };
                }

                var placeholderPos = attrs.placeholderPos || "end";
                var placeholder = $('<li class="sortable-placeholder" />');
                var placeholderAttachedOnce = false;

                var onDragOverOrEnter = function(e) {
                    this.classList.add('over');
                    addClassHereAndThere(this, "over");

                    var dropLi = $(e.target).closest("li");

                    if($scope.activeDragDrop.draggedElementToHide) $scope.activeDragDrop.draggedElementToHide.hide();

                    // Do we accept this payload ?
                    var accepted = acceptFunc($scope.activeDragDrop.data);
                    if(accepted.accept){
                        e.dataTransfer.dropEffect = 'copyMove';

                        if (!dropLi.is("li") && $(e.target).is("ul")) {
                            $(e.target).append(placeholder);
                        } else if (dropLi.is("li")) {
                            $(dropLi)[placeholder.index() < dropLi.index() ? 'after' : 'before'](placeholder);
                        } else {
                        }

                        e.preventDefault();
                    } else {
                		$scope.$apply(function(){
                			$scope.validity.tempError = {};
                    		$scope.validity.tempError.type = 'MEASURE_REJECTED';
                        	$scope.validity.tempError.message = accepted.message;
                    	});
                    }
                };
                element[0].addEventListener('dragover', onDragOverOrEnter, false);
                element[0].addEventListener('dragenter', onDragOverOrEnter, false);

                element[0].addEventListener('dragleave', function(e) {
                    removeClassHereAndThere(this, "over");
            		$scope.$apply(function(){
                		delete $scope.validity.tempError;
                	});
                    return false;
                },false);

                // This is triggered as soon as a drag becomes active on the page
                // and highlights the drop zone if it's accepted
                $scope.$watch("activeDragDrop.active", function(nv, ov) {
                    if (nv) {
                        var accepted = acceptFunc($scope.activeDragDrop.data);
                        // element.attr('data-over-message', accepted.message);
                        if (accepted.accept) {
                            addClassHereAndThere(element, "drop-accepted");
                            window.setTimeout(function() {
                                if (placeholderPos == "end"){
                                    element.append(placeholder);
                                } else {
                                    element.prepend(placeholder);
                                }
                                placeholderAttachedOnce = true
                            }, 10);
                        } else {
                            addClassHereAndThere(element, "drop-rejected");
                        }
                    } else {
                        removeClassHereAndThere(element, "drop-accepted");
                        removeClassHereAndThere(element, "drop-rejected");

                        if (placeholderAttachedOnce) {
                            window.setTimeout(function() {placeholder.detach()}, 10);
                        }
                    }
                }, true);

                element[0].addEventListener('drop', function(e) {
                    Assert.trueish($scope.activeDragDrop.active, 'no active drag and drop');

                    // Stops some browsers from redirecting.
                    if (e.stopPropagation) e.stopPropagation();

                    removeClassHereAndThere(this, "over");

                    var data = JSON.parse(e.dataTransfer.getData(dkuDragType));

                    // At which index are we dropping ?
                    var dropIndex = $(e.target).index();

                    // call the passed drop function
                    $scope.$apply(function($scope) {
                        var targetList = $scope.$eval(attrs.chartDragDropList);
                        var newData = angular.copy($scope.activeDragDrop.data);
                        delete newData.$$hashKey;
                        newData.__justDragDropped = true;

                        if ($scope.activeDragDrop.moveFromList && $scope.activeDragDrop.moveFromList === targetList) {
                            var oldIdx = $scope.activeDragDrop.moveFromListIndex;

                            if (dropIndex > oldIdx && dropIndex > 0) {
                                dropIndex--;
                            }

                            targetList.splice(dropIndex, 0, targetList.splice(oldIdx, 1)[0]);

                        } else if ($scope.activeDragDrop.moveFromList) {
                            targetList.splice(dropIndex, 0, newData);
                            if ($scope.activeDragDrop.moveFromList) {
                                $scope.activeDragDrop.moveFromList.splice($scope.activeDragDrop.moveFromListIndex, 1);
                            }
                        } else {
                            targetList.splice(dropIndex, 0, newData);
                        }

                        // Force remove placeholder right now
                        removeClassHereAndThere(element, "drop-accepted");
                        removeClassHereAndThere(element, "drop-rejected");
                        placeholder.detach();

                        $scope.onDragEnd();

                        $scope.$emit("dragDropSuccess");
                    });
                    return false;
                },false);
            }
        };
    });


    /**
     * Mono-valued list drop zone. No placeholder since drop replaces
     */
    app.directive("chartDragDropListReplace", function($parse, Assert) {
        return {
            scope: true,
            link: function($scope, element, attrs) {
                var acceptFunc = function(data){
                    return {
                        accept: true,
                        message: 'Drop here'
                    };
                };
                if(attrs.acceptDrop) {
                    var parsed = $parse(attrs.acceptDrop);
                    acceptFunc = function(data){
                        return parsed($scope.$parent || $scope, {'data': data});
                    };
                }

                var onDragOverOrEnter = function(e) {
                    this.classList.add('over');
                    $(this).parent().parent().addClass("over");
                    var dropLi = $(e.target).closest("li");

                    if($scope.activeDragDrop.draggedElementToHide) $scope.activeDragDrop.draggedElementToHide.hide();

                    // Do we accept this payload ?
                    var accepted = acceptFunc($scope.activeDragDrop.data);
                    if(accepted.accept){
                        e.dataTransfer.dropEffect = 'copyMove';
                        e.preventDefault();
                    } else {
                		$scope.$apply(function(){
                			$scope.validity.tempError = {};
                    		$scope.validity.tempError.type = 'MEASURE_REJECTED';
                        	$scope.validity.tempError.message = accepted.message;
                    	});
                    }
                };
                element[0].addEventListener('dragover', onDragOverOrEnter, false);
                element[0].addEventListener('dragenter', onDragOverOrEnter, false);

                element[0].addEventListener('dragleave', function(e) {
                    this.classList.remove('over');
                    $(this).parent().parent().removeClass("over");
    	            $scope.$apply(function(){
    	            	delete $scope.validity.tempError;
                    });
                    return false;
                }, false);

                // This is triggered as soon as a drag becomes active on the page
                // and highlights the drop zone if it's accepted
                $scope.$watch("activeDragDrop.active", function(nv, ov) {
                    if (nv) {
                        var accepted = acceptFunc($scope.activeDragDrop.data);
                        // element.attr('data-over-message', accepted.message);
                        if (accepted.accept) {
                            addClassHereAndThere(element, "drop-accepted");
                        } else {
                            addClassHereAndThere(element, "drop-rejected");
                        }
                    } else {
                        removeClassHereAndThere(element, "drop-accepted");
                        removeClassHereAndThere(element, "drop-rejected");
                    }
                }, true);

                element[0].addEventListener('drop', function(e) {
                    Assert.trueish($scope.activeDragDrop.active, 'no active drag and drop');

                    // Stops some browsers from redirecting.
                    if (e.stopPropagation) e.stopPropagation();

                    this.classList.remove('over');
                    $(this).parent().parent().removeClass("over");

                    var data = JSON.parse(e.dataTransfer.getData(dkuDragType));

                    // At which index are we dropping ?
                    var dropIndex = $(e.target).index();

                    // call the passed drop function
                    $scope.$apply(function($scope) {
                        var targetList = $scope.$eval(attrs.chartDragDropListReplace);
                        var newData = angular.copy($scope.activeDragDrop.data);
                        delete newData.$$hashKey;
                        newData.__justDragDropped = true;

                        if ($scope.activeDragDrop.moveFromList && $scope.activeDragDrop.moveFromList === targetList) {
                            // DO nothing ...

                        } else if ($scope.activeDragDrop.moveFromList) {
                            targetList.splice(0, targetList.length);
                            targetList.push(newData);
                            $scope.activeDragDrop.moveFromList.splice($scope.activeDragDrop.moveFromListIndex, 1);
                        } else {
                            targetList.splice(0, targetList.length);
                            targetList.push(newData);
                        }

                        // Force remove placeholder right now
                        element.removeClass("drop-accepted");
                        element.removeClass("drop-rejected");
                        //placeholder.detach();

                        $scope.onDragEnd();

                        $scope.$emit("dragDropSuccess");
                    });
                    return false;
                },false);
            }
        };
    });
})();

(function(){
'use strict';

const app = angular.module('dataiku.directives.simple_report', [ 'dataiku.charts']);

    app.service("ChartSetErrorInScope", function() {
        function buildErrorValidityObject(message, showRevertEngineButton) {
            return {
                message,
                showRevertEngineButton,
                valid: false,
                type: "COMPUTE_ERROR"
            };
        }

        function buildValidityForKnownError(data, status, headers) {
            var errorDetails = getErrorDetails(data, status, headers);
            if (errorDetails.errorType === "com.dataiku.dip.pivot.backend.model.SecurityAbortedException") {
                return buildErrorValidityObject("Too much data to draw. Please adjust chart settings (" + errorDetails.message + ")", false);
            } else if (errorDetails.errorType === "ApplicativeException") {
                return buildErrorValidityObject(errorDetails.message, false);
            } else if (errorDetails.errorType === "com.dataiku.dip.exceptions.EngineNotAvailableException") {
                return buildErrorValidityObject(errorDetails.message, true);
            }
            return undefined;
        }
        var svc = {
            buildValidityForKnownError: buildValidityForKnownError,
            defineInScope : function(scope) {
                if ('chartSetErrorInScope' in scope) return; // already defined in a higher scope
                scope.validity = {valid : true};
                scope.setValidity = function(validity) {scope.validity = validity;};
                scope.chartSetErrorInScope = function(data, status, headers) {
                    const validity = buildValidityForKnownError(data, status, headers);
                    if (validity) {
                        scope.validity = validity;
                    } else {
                        setErrorInScope.bind(scope)(data, status, headers);
                    }
                };
            }
        };
        return svc;
    });

    // Need in the scope :
    // - "chart" : the chart object, which must contain at least
    //       - data, a ChartSpec object
    //       - summary
    // - "getExecutePromise(request)" : a function that returns a promise
    // DO NOT USE AN ISOLATE SCOPE as there is some communication with drag-drop
    // stuff
    app.directive('chartConfiguration', function(MonoFuture, Debounce, DataikuAPI, LabelsController,
                                                 ChartDimension, ChartRequestComputer, $state, $stateParams, $timeout, DKUtils, PluginsService, Logger,
                                                 ChartChangeHandler, ChartUADimension, _MapCharts, ChartsStaticData, CreateModalFromTemplate, ChartIconUtils, ChartSetErrorInScope, ChartFeatures, ChartActivityIndicator, ChartDataUtils) {
        return {
            restrict: 'AE',
            templateUrl : '/templates/simple_report/chart-configuration.html',
            link: function(scope, element) {
                scope.chartActivityIndicator= ChartActivityIndicator.buildDefaultActivityIndicator();
                ChartSetErrorInScope.defineInScope(scope);
                scope.isInAnalysis = $state.current.name.indexOf('analysis')!=-1;
                scope.isInPredicted = $state.current.name.indexOf('predicted')!=-1;

                if (!scope.chartBottomOffset) {
                    scope.chartBottomOffset = 0;
                }
                scope.optionsFolds = {
                    legend : true,
                    chartMode : true,
                    showTopBar : true
                };
                scope.PluginsService = PluginsService;

                Mousetrap.bind("s h h" , function() {
                    scope.$apply(function(){
                        scope.bigChartSwitch();
                    });
                });
                scope.$on("$destroy", function(){
                    Mousetrap.unbind("s h h");
                });

                scope._MapCharts = _MapCharts;

                scope.fixupCurrentChart = function(){
                    ChartChangeHandler.fixupChart(scope.chart.def);
                };

                scope.bigChart = false;
                scope.bigChartSwitch = function() {
                    scope.bigChart = !scope.bigChart;
                    $('.graphWrapper').fadeTo(0, 0);
                    if (scope.bigChart) {
                        $('.charts-container').addClass('big-chart');
                    } else {
                        $('.charts-container').removeClass('big-chart');
                    }
                    //waiting for the css transition to finish (0.25s, we use 300ms, extra 50ms is fore safety)
                    $timeout(function() {
                        //for binned_xy_hex we need to recompute beacause width and height are taken into account in chart data computing
                        if (scope.chart.def.type=='binned_xy' && scope.chart.def.variant=='binned_xy_hex') {
                            scope.recomputeAndUpdateData();
                            scope.executeIfValid();
                        } else {
                            scope.$broadcast("redraw");
                        }
                        $('.graphWrapper').fadeTo(0, 1);
                    }, 250);
                }

                scope.chartSpecific = {}

                scope.droppedData = [];

                scope.ChartChangeHandler = ChartChangeHandler;
                scope.ChartsStaticData = ChartsStaticData;

                // ------------------------------------------------------
                // only trigger this code once, when the chart is initialized
                var unregister = scope.$watch("chart", function(nv, ov) {
                    if (nv == null) return;
                    unregister();

                    scope.executedOnce = false;

                    if (angular.isUndefined(scope.chart.def)) {
                        Logger.warn("!! BAD CHART !!");
                    }

                    // scope.chart.spec.unregisterWatch = 1;

                    scope.fixupCurrentChart();
                    scope.chartOptionsState = scope.chartOptionsState || { zeroEnabled : true };

                    // STATIC DATA
                    scope.staticData = {}
                    scope.staticData.multiplotDisplayModes = [
                        "column", "line"
                    ];

                    scope.chartTypes = [
                        {
                            type: "grouped_columns",
                            title: "Grouped columns",
                            description: "Use to create a grouped bar chart.<br/> Break down once to create one group of bars per category. Measures provide bars.<br/> Break down twice to create one group of bars per category and one bar for each subcategory."
                        },
                        {
                            type: "stacked_columns",
                            title: "Stacked columns",
                            description: "Use to display data that can be summed.<br/> Break down once with several measures to stack the measures.<br/>  Break down twice to create one stack element per value of the second dimension."
                        },
                        {

                            type: "stacked_area",
                            title: "Stacked area",
                            description: "Use to display data that can be summed.<br/> Break down once with several measures to stack the measures.<br/>  Break down twice to create one stack element per value of the second dimension."
                        },
                        {
                            type: "lines",
                            title: "Lines",
                            description: "Use to compare evolutions.<br/> Break down once with several measures to create one line per measure.<br/>  Break down twice to create one line per value of the second dimension."
                        },
                        {
                            type: "scatter_1d",
                            title: "Grouped scatter plot",
                            description: "Use to view each value of a category as a single circle.<br/> Break down once.<br/> Two measures provide the circle’s X and Y  coordinates. Additional measures provide circle radius and color."
                        },
                        {
                            type: "scatter_2d",
                            title: "Binned XY plot",
                            description: "Use to view the repartition of your data along two axis.<br/> Break down twice to create the X and Y axis of the grid.<br/>  Two measures provide the radius and color of your points."
                        },
                        {
                            type: "diminishing_returns",
                            title: "Diminishing returns chart",
                            description: "Use to compare the weight of different categories in cumulative totals.<br/> Break down once to create categories.<br/> Two  measures provide the X and Y axis, which are displayed cumulatively."
                        },
                        {
                            type : "scatter",
                            title : "Scatter plot",
                            description : "Scatterize"
                        }
                    ];
                    if (PluginsService.isPluginLoaded("geoadmin")){
                        scope.chartTypes.push({
                            type : "map",
                            title : "World map (BETA)",
                            description : "Use to plot and aggregate geo data",
                        });
                    } else {
                        scope.chartTypes.push({
                            type : "map",
                            title : "World map (BETA)",
                            description : "Use to plot and aggregate geo data",
                            disabled : true,
                            disabledReason : "You need to install the 'geoadmin' plugin. Please see documentation"
                        });
                    }

                    scope.allYAxisModes = {
                        "NORMAL": { value : "NORMAL", label : "Normal", shortLabel : "Normal" },
                        "LOG"  : { value : "LOG", label : "Logarithmic scale", shortLabel : "Log" },
                        "PERCENTAGE_STACK" : { value : "PERCENTAGE_STACK", label : "Normalize stacks at 100%", shortLabel: "100% stack" }
                    };
                    scope.allXAxisModes = {
                        "NORMAL": { value : "NORMAL", label : "Normal", shortLabel : "Normal" },
                        "CUMULATIVE" : { value : "CUMULATIVE", label : "Cumulative values", shortLabel : "Cumulative" },
                        "DIFFERENCE" : { value : "DIFFERENCE", label : "Difference (replace each value by the diff to the previous one)",
                                     shortLabel: "Difference" }
                    }
                    scope.allComputeModes = {
                        "NONE": { value : "NONE", label : "No computation", shortLabel : "None" },
                        "LIFT_AVG" : {value : "LIFT_AVG", shortLabel : "Ratio to AVG",
                                     label : "Compute ratio of each value relative to average of values"},
                        "AB_RATIO" : {value : "AB_RATIO", shortLabel : "a/b ratio",
                                    label : "Compute ratio of measure 1 / measure 2"},
                        "AB_RATIO_PCT" : {value : "AB_RATIO_PCT", shortLabel : "a/b ratio (%)",
                                    label : "Compute ratio of measure 1 / measure 2, as percentage"},
                    }

                    scope.legends = [];
                    scope.animation = {};
                    scope.tooltips = {};

                    scope.chartPicker = {};
                    scope.graphError = { error : null };

                    // TODO: this is a temporary fix while we wait for updating the date filters on chart logic as well
                    // We should move back to getDateFilterTypes when this is done
                    scope.dateFilterTypes = ChartDimension.getDateChartFilterTypes();

                    scope.numericalBinningModes = [
                        ["FIXED_NB", "Fixed number of equal intervals"],
                        ["FIXED_SIZE", "Fixed-size intervals"],
                        ["NONE", "None, use raw values"],
                        ["TREAT_AS_ALPHANUM", "Treat as alphanum"]
                    ];

                    scope.emptyBinsModes = [
                        ["ZEROS", "Replace with zeros"],
                        ["AVERAGE", "Link neighbors"],
                        ["DASHED", "Interrupt line"]
                    ];

                   scope.familyToTypeMap = {
                        'basic' : ['grouped_columns', 'stacked_bars', 'stacked_columns', 'multi_columns_lines', 'lines', 'stacked_area', 'pie'],
                        'table' : ['pivot_table'],
                        'scatter' : ['scatter', 'grouped_xy', 'binned_xy'],
                        'map' : ['scatter_map', 'admin_map', 'scatter_map', 'grid_map', 'geom_map', 'density_heat_map'],
                        'other' : ['boxplots', 'lift', 'density_2d'],
                        'webapp' : ['webapp']
                    };

                    scope.isExportableToExcel = ChartFeatures.isExportableToExcel;
                    scope.isExportableToImage = ChartFeatures.isExportableToImage;

                    scope.getDownloadDisabledReason = function() {
                        return ChartFeatures.getExportDisabledReason(scope.chart.def);
                    }

                    scope.canDownloadChart = function() {
                        return scope.validity.valid && (scope.isExportableToExcel(scope.chart.def) || scope.isExportableToImage(scope.chart.def));
                    };

                    scope.typeAndVariantToImageMap = ChartIconUtils.typeAndVariantToImageMap;

                    scope.computeChartPreview = function(type, variant) {
                        var imageName = '';
                        if (typeof(variant)==='undefined') {
                            variant = 'normal';
                        }
                        if (typeof(scope.typeAndVariantToImageMap[type])!=='undefined'
                            && typeof(scope.typeAndVariantToImageMap[type][variant])!=='undefined'
                            && typeof(scope.typeAndVariantToImageMap[type][variant].preview)!=='undefined') {
                            imageName = scope.typeAndVariantToImageMap[type][variant].preview;
                        }
                        if (imageName!='') {
                            return '/static/dataiku/images/charts/previews/' + imageName + '.png';
                        }
                        return false;
                    }

                    scope.request = {};

                    // ------------------------------------------------------
                    // Property accessors and helpers

                    scope.isBinnedNumericalDimension = ChartDimension.isBinnedNumerical.bind(ChartDimension);
                    scope.isTimelineable = ChartDimension.isTimelineable.bind(ChartDimension);
                    scope.isUnbinnedNumericalDimension =  ChartDimension.isUnbinnedNumerical.bind(ChartDimension);
                    scope.isAlphanumLikeDimension =  ChartDimension.isAlphanumLike.bind(ChartDimension);
                    scope.isNumericalDimension = ChartDimension.isNumerical.bind(ChartDimension);

                    scope.ChartUADimension = ChartUADimension;

                    scope.acceptStdAggrTooltipMeasure = function(data){
                        return ChartChangeHandler.stdAggregatedAcceptMeasure(scope.chart.def, data);
                    }

                    scope.acceptUaTooltip  = function(data) {
                        return ChartChangeHandler.uaTooltipAccept(scope.chart.def, data);
                    }

                    scope.acceptFilter = function(data) {
                       var ret = ChartChangeHandler.stdAggregatedAcceptDimension(scope.chart.def, data);
                       if (!ret.accept) return ret;
                       if (data.type == "GEOMETRY" || data.type == "GEOPOINT") {
                            return {
                                accept : false,
                                message : "Cannot filter on Geo dimensions"
                            }
                       }
                       return ret;
                    }

                    scope.dimensionBinDescription = function (dimension) {
                        if (!dimension) return;
                        if (dimension.type == 'NUMERICAL') {
                            if (scope.chart.def.hexbin) {
                                return "";
                            } else if (dimension.numParams) {
                                if (dimension.numParams.mode == 'FIXED_NB') {
                                    return "(" + dimension.numParams.nbBins + " bins)";
                                } else if (dimension.numParams.mode == 'FIXED_SIZE') {
                                    return "(fixed bins)";
                                } else if (dimension.numParams.mode == "TREAT_AS_ALPHANUM") {
                                    return "(text)";
                                }
                            }
                        }
                        return "";
                    };

                    scope.dateModeDescription = ChartDimension.getDateModeDescription;

                    scope.dateModeSuffix = function(mode) {
                        return `(${scope.dateModeDescription(mode)})`;
                    };

                    scope.geoDimDescription = function(dim) {
                         for (var i = 0; i < ChartsStaticData.mapAdminLevels.length; i++){
                            if (dim.adminLevel == ChartsStaticData.mapAdminLevels[i][0]) {
                                return "by " + ChartsStaticData.mapAdminLevels[i][1];;
                            }
                        }
                        return "Unknown";
                    }

                    scope.isFilterDateRange =  ChartDimension.isFilterDateRange;
                    scope.isFilterDatePart =  ChartDimension.isFilterDatePart;
                    scope.isFilterDiscreteDate = ChartDimension.isFilterDiscreteDate;
                    scope.hasFil = ChartFeatures.isExportableToImage;

                    // ------------------------------------------------------
                    // Response handling / Facets stuff

                    scope.filterTmpDataWatchDeregister = null;

                    LabelsController(scope);

                    scope.onResponse = function() {
                        scope.setValidity({valid : true});
                        scope.uiDisplayState = scope.uiDisplayState || {};
                        scope.uiDisplayState.chartTopRightLabel = ChartDataUtils.computeChartTopRightLabel(
                            scope.response.result.pivotResponse.afterFilterRecords,
                            ChartDimension.getComputedMainAutomaticBinningModeLabel(
                                scope.uiDisplayState, scope.response.result.pivotResponse,
                                scope.chart.def, scope.disableChartInteractivityGlobally
                            )
                        );

                        if (scope.chart.summary && scope.response.result.updatedSampleId) {
                            scope.chart.summary.requiredSampleId = scope.response.result.updatedSampleId;
                        }

                        if (scope.filterTmpDataWatchDeregister) {
                            scope.filterTmpDataWatchDeregister();
                        }
                        scope.filterTmpData = [];
                        for (var fIdx = 0; fIdx < scope.chart.def.filters.length; fIdx++ ) {
                            var filter = scope.chart.def.filters[fIdx];
                            var responseFacet = scope.response.result.pivotResponse.filterFacets[fIdx];
                            var tmpData = {values : []};
                            if (filter.filterType == "ALPHANUM_FACET" || filter.columnType == 'ALPHANUM' || ChartDimension.isFilterDiscreteDate(filter)) {
                                for (var v = 0 ; v < responseFacet.values.length; v++) {
                                    var facetVal = responseFacet.values[v];
                                    var excluded = filter.excludedValues[facetVal.id];
                                    tmpData.values.push({id : facetVal.id,
                                                            label : facetVal.label,
                                                             count : facetVal.count,
                                                              included : !excluded});
                                }
                            } else if (filter.columnType == 'NUMERICAL' || ChartDimension.isFilterDateRange(filter)) {
                                tmpData.response = responseFacet;
                                if (filter.minValue != null) {
                                    tmpData.minValue = filter.minValue;
                                } else {
                                    tmpData.minValue = responseFacet.minValue;
                                }
                                if (filter.maxValue != null) {
                                    tmpData.maxValue = filter.maxValue;
                                } else {
                                    tmpData.maxValue = responseFacet.maxValue;
                                }
                            }
                            else {
                                // Nothing to do
                                //console.error("We haven't thought of this case have we?", filter);
                            }
                            scope.filterTmpData.push(tmpData);
                        }

                        scope.filterTmpDataWatchDeregister =  scope.$watch("filterTmpData", function(nv, ov) {
                            for (var fIdx = 0; fIdx < scope.chart.def.filters.length; fIdx++ ) {
                                var filter = scope.chart.def.filters[fIdx];
                                var tmpData = scope.filterTmpData[fIdx];
                                if (filter.filterType == "ALPHANUM_FACET"|| filter.columnType == 'ALPHANUM' || ChartDimension.isFilterDiscreteDate(filter)) {
                                    filter.excludedValues = {};
                                    for (var v = 0; v < tmpData.values.length; v++) {
                                        if (!tmpData.values[v].included) {
                                            filter.excludedValues[tmpData.values[v].id] = true;
                                        }
                                    }
                                } else if (filter.columnType == 'NUMERICAL' || ChartDimension.isFilterDateRange(filter)) {
                                    if (tmpData.minValue != tmpData.response.minValue) {
                                        filter.minValue = tmpData.minValue;
                                    } else {
                                        filter.minValue = null;
                                    }
                                    if (tmpData.maxValue != tmpData.response.maxValue) {
                                        filter.maxValue = tmpData.maxValue;
                                    } else {
                                        filter.maxValue = null;
                                    }
                                }
                            }
                        }, true);
                    };

                    // Wraps scope.getExecutePromise
                    // and add supports for automatic abortion
                    var executePivotRequest = MonoFuture(scope).wrap(scope.getExecutePromise);

                    scope.executeIfValid = function(){
                        var validity = ChartChangeHandler.getValidity(scope.chart);
                        scope.setValidity(validity);
                        // clear the response as well, otherwise when changing the chart, it will
                        // first run once with the new settings and the old response, producing
                        // js errors when something drastic (like chart type) changes
                        scope.previousResponseHadResult = (scope.response && scope.response.hasResult);
                        scope.response = null;

                        if (validity.valid) {
                            Logger.info("Chart is OK, executing");
                            scope.execute();
                        } else {
                            Logger.info("Chart is NOK, not executing", scope.validity);
                        }
                    }

                    // fetch the response
                    scope.execute = Debounce()
                        .withDelay(1,300)
                        .withScope(scope)
                        .withSpinner(true)
                        .wrap(function() {

                            Logger.info("Debounced, executing");
                            scope.executedOnce = true;

                            var request = null;

                            try {
                                var wrapper = element.find('.chart-zone');
                                var width = wrapper.width();
                                var height = wrapper.height();
                                request = ChartRequestComputer.compute(scope.chart.def, width, height, scope.chartSpecific);
                                request.useLiveProcessingIfAvailable = scope.chart.def.useLiveProcessingIfAvailable;
                                Logger.info("Request is", request);
                                scope.graphError.error = null;
                            } catch(error) {
                                Logger.info("Not executing, chart is not ready", error);
                                scope.graphError.error = error;
                            }
                            // We are sure that request is valid so we can generate the name
                            if (!scope.chart.def.userEditedName) {
                                var newName = ChartChangeHandler.computeAutoName(scope.chart.def, scope);
                                if (newName.length > 0) {
                                    scope.chart.def.name = newName;
                                }
                            }

                            scope.filter = {"query" : undefined};
                            resetErrorInScope(scope);

                            scope.excelExportableChart = undefined;
                            var chartDefCopy = angular.copy(scope.chart.def);

                            executePivotRequest(request).update(function(data) {
                                scope.request = request;
                                scope.response = data;

                            }).success(function(data) {
                                // For Excel export
                                scope.excelExportableChart =  {
                                    pivotResponse : data.result.pivotResponse,
                                    chartDef : chartDefCopy
                                };

                                scope.request = request;
                                scope.response = data;
                                scope.onResponse();

                            }).error(function(data,status,headers){
                                scope.response = undefined;
                                if(data && data.hasResult && data.aborted) {
                                    // Manually aborted => do not report as error
                                } else {
                                    scope.chartSetErrorInScope(data, status, headers);
                                }
                            });
                    });

                    var onChartImportantDataChanged = function(nv, ov, lnv, lov){
                        Logger.info("Chart important data changed:" + this + "\nbefore: " + JSON.stringify(lov) +"\nafter:   " + JSON.stringify(lnv));
                        if (nv) {

                            var dataBefore = angular.copy(scope.chart.def);
                            scope.recomputeAndUpdateData();

                            if (!angular.equals(dataBefore, scope.chart.def)) {
                                Logger.info("Data has been modified, not executing --> will execute at next cycle");
                                return;
                            }
                            Logger.info("Triggering executeIfValid");
                            scope.executeIfValid();
                        }
                    }

                    // TODO: Don't forget to update this each time ...

                    // Update of these attributes triggers save + recompute + redraw
                    var important = [
                        "type", "variant", "webAppType",
                        "genericDimension0", "genericDimension1", "facetDimension", "animationDimension", "genericMeasures",
                        "xDimension", "yDimension",
                        "uaXDimension", "uaYDimension",
                        "sizeMeasure", "colorMeasure", "tooltipMeasures",
                        "uaSize", "uaColor", "uaTooltip", "uaShape",
                        "groupDimension", "xMeasure", "yMeasure",
                        "geometry", "boxplotBreakdownDim", "boxplotValue",
                        "filters",
                        "stdAggregatedChartMode", "stdAggregatedMeasureScale",
                        "includeZero", "hexbinRadius", "hexbinRadiusMode", "hexbinNumber", "smoothing", "brush",
                        "axis1LogScale",
                        "useLiveProcessingIfAvailable",
                        "bubblesOptions", "mapGridOptions", "scatterOptions"
                    ];

                    var onChartFrontImportantDataChanged = function(nv, ov, lnv, lov){
                        Logger.info("Chart important front data changed:" + this + "\nbefore: " + JSON.stringify(lnv) +"\nafter:   " + JSON.stringify(lov));
                        if (nv) {
                            scope.saveChart();
                            scope.$broadcast("redraw");
                        }
                    }

                    // Update of these attributes triggers save + redraw
                    var frontImportant = [
                        "colorOptions", "yAxisLabel", "xAxisLabel", "showLegend", "pieOptions", "legendPlacement",
                        "mapOptions", "showXAxis", "strokeWidth", "fillOpacity", "chartHeight", "singleXAxis",
                        "showInChartValues", "showInChartLabels", "showXAxisLabel", "showYAxisLabel", "geoWeight",
                        "webAppConfig"
                    ];

                    var onChartFrontImportantNoRedrawDataChanged = function(nv, ov, lnv, lov){
                        Logger.info("Chart important front data changed:" + this + "\nbefore: " + JSON.stringify(lnv) +"\nafter:   " + JSON.stringify(lov));
                        if (nv) {
                            scope.saveChart();
                        }
                    }

                    // Update of these attributes triggers save
                    var frontImportantNoRedraw = [
                        "animationFrameDuration", "animationRepeat"
                    ];

                    scope.$watch('chart.def', function(nv, ov) {
                        if (!nv) return;
                        if (!ov) {
                            onChartImportantDataChanged.bind("initial")(nv, ov);
                        }
                        var called = false;
                        important.forEach(function(x){
                            if (!angular.equals(nv[x], ov[x])) {
                                if (!called){
                                    onChartImportantDataChanged.bind(x)(nv, ov, nv[x], ov[x]);
                                }
                                called = true;
                            }
                        });
                        if (!called) {
                            var frontImportantCalled = false;
                            frontImportant.forEach(function(x){
                                if (!angular.equals(nv[x], ov[x])) {
                                    if (!frontImportantCalled){
                                        onChartFrontImportantDataChanged.bind(x)(nv, ov, nv[x], ov[x]);
                                    }
                                    frontImportantCalled = true;
                                }
                            });
                        }
                        if (!frontImportantCalled) {
                            var frontImportantNoRedrawCalled = false;
                            frontImportantNoRedraw.forEach(function(x){
                                if (!angular.equals(nv[x], ov[x])) {
                                    if (!frontImportantNoRedrawCalled){
                                        onChartFrontImportantNoRedrawDataChanged.bind(x)(nv, ov, nv[x], ov[x]);
                                    }
                                    frontImportantNoRedrawCalled = true;
                                }
                            });
                        }
                    }, true);

                    scope.$watch("chart.def.thumbnailData", function(nv, ov){
                        if (nv && ov) {
                            scope.saveChart();
                        }
                    });

                    $(window).on('resize.chart_logic', function(e){
                        if (scope.chart.def.type == 'binned_xy' && scope.chart.def.variant == 'binned_xy_hex') {
                            scope.recomputeAndUpdateData();
                            scope.executeIfValid();
                        } else {
                            scope.$broadcast("redraw");
                        }
                        scope.$apply();
                    });
                    scope.$on("$destroy",function() {
                        $(window).off("resize.chart_logic");
                    });

                    scope.forceExecute = function(){
                        scope.recomputeAndUpdateData();
                        scope.executeIfValid();
                    };

                    scope.$on("forceExecuteChart", function(){
                        scope.forceExecute();
                    });
                    scope.$emit("listeningToForceExecuteChart"); // inform datasetChartBase directive that forceExecute() can be triggered through broadcast

                    scope.redraw = function() {
                        scope.$broadcast('redraw');
                    };

                    scope.revertToLinoEngineAndReload = function(){
                        scope.chart.engineType = "LINO";
                        scope.forceExecute();
                    }


                    // ------------------------------------------------------
                    // Recompute/Update handlers
                    scope.recomputeAndUpdateData = function() {
                        ChartChangeHandler.fixupSpec(scope.chart, scope.chartOptionsState);

                        scope.canHasTooltipMeasures = [
                            "multi_columns_lines",
                            "grouped_columns",
                            "stacked_columns",
                            "stacked_bars",
                            "grid_map",
                            "lines",
                            "stacked_area",
                            "admin_map",
                            "pie",
                            "binned_xy"].includes(scope.chart.def.type);

                        scope.canAnimate = ChartFeatures.canAnimate(scope.chart.def.type);
                        scope.canFacet = ChartFeatures.canFacet(scope.chart.def.type, scope.chart.def.variant, scope.chart.def.webAppType);
                        scope.canFilter = ChartFeatures.canFilter(scope.chart.def.type, scope.chart.def.variant, scope.chart.def.webAppType);

                        scope.canHaveUaTooltips = ["scatter", "scatter_map", "geom_map", "density_heat_map"].includes(scope.chart.def.type);

                        return;
                    };

                    scope.setChartType = function(type, variant, webAppType) {
                        if (scope.chart.def.type === type && scope.chart.def.variant === variant && scope.chart.def.webAppType === webAppType) {
                            return;
                        }
                        element.find('.pivot-charts .mainzone').remove(); // avoid flickering
                        Logger.info("Set chart type");
                        ChartChangeHandler.onChartTypeChange(scope.chart.def, type, variant, webAppType);
                        Logger.info("AFTER chart type", scope.chart.def);
                        scope.chart.def.type = type;
                        scope.chart.def.variant = variant;
                        scope.chart.def.webAppType = webAppType;
                        onChartImportantDataChanged.bind("type")(type);
                    }
                });

                scope.export = function() {
                    scope.$broadcast("export-chart");
                    if (scope.displayDownloadPanel) {
                        scope.switchDownloadHandler();
                    }
                };

                scope.exportToExcel = function() {
                    if(scope.excelExportableChart) {
                        var animationFrameIdx;
                        if (scope.excelExportableChart.chartDef.animationDimension.length) {
                            animationFrameIdx = scope.animation.currentFrame;
                        }
                        DataikuAPI.shakers.charts.exportToExcel(scope.excelExportableChart.chartDef,
                         scope.excelExportableChart.pivotResponse, animationFrameIdx).success(function(data) {
                           downloadURL(DataikuAPI.shakers.charts.downloadExcelUrl(data.id));
                        }).error(setErrorInScope.bind(scope));
                        if (scope.displayDownloadPanel) {
                            scope.switchDownloadHandler();
                        }
                    }
                };

                scope.displayDownloadPanel = false;
                scope.downloadHandler = function() {
                    if (scope.isExportableToExcel(scope.chart.def) && scope.isExportableToImage(scope.chart.def)) {
                        scope.switchDownloadHandler();
                    } else if (scope.isExportableToExcel(scope.chart.def)) {
                        scope.exportToExcel();
                    } else if (scope.isExportableToImage(scope.chart.def)) {
                        scope.export();
                    }
                };

                scope.switchDownloadHandler = function() {
                    scope.displayDownloadPanel = !scope.displayDownloadPanel;
                    if (scope.displayDownloadPanel) {
                        $timeout(function() {
                            $(window).on('click', scope.switchDownloadHandlerOnClick);
                        });
                    } else {
                        $(window).off('click', scope.switchDownloadHandlerOnClick);
                    }
                }

                scope.switchDownloadHandlerOnClick = function(e) {
                    var clickedEl = e.target;
                    if ($(clickedEl).closest('.download-wrapper').length <= 0 && scope.displayDownloadPanel) {
                        scope.switchDownloadHandler();
                        scope.$apply();
                    }
                }

                scope.blurElement = function(inputId) {
                    $timeout(function() { $(inputId).blur(); });
                }

                scope.blurTitleEdition = function() {
                    scope.editTitle.editing = false;
                    scope.chart.def.userEditedName = true;
                    $timeout(scope.saveChart);
                    if (scope.excelExportableChart) {
                        scope.excelExportableChart.chartDef.name = scope.chart.def.name;
                    }
                }
            }
        };
    });

    app.factory("ChartFeatures", function(WebAppsService) {
        return {
            canAnimate: function(chartType) {
                return ['multi_columns_lines', 'grouped_columns', 'stacked_columns',
                        'stacked_bars', 'lines', 'stacked_area', 'pie',
                        'binned_xy', 'grouped_xy', 'lift'].indexOf(chartType) !== -1;
            },

            canFacet: function(chartType, variant, webAppType) {
                if (chartType == 'webapp') {
                    var loadedDesc = WebAppsService.getWebAppLoadedDesc(webAppType) || {};
                    var pluginChartDesc = loadedDesc.desc.chart || {};
                    return pluginChartDesc.canFacet == true;
                } else {
                    return ['multi_columns_lines', 'grouped_columns', 'stacked_columns',
                            'stacked_bars', 'lines', 'stacked_area', 'pie',
                            'binned_xy', 'grouped_xy', 'lift'].indexOf(chartType) !== -1;
                }
            },

            canFilter: function(chartType, variant, webAppType) {
                if (chartType == 'webapp') {
                    var loadedDesc = WebAppsService.getWebAppLoadedDesc(webAppType) || {};
                    var pluginChartDesc = loadedDesc.desc.chart || {};
                    return pluginChartDesc.canFilter == true;
                } else {
                    return true;
                }
            },

            hasSmoothing: function (chartType) {
                return ['lines', 'stacked_area'].indexOf(chartType) !== -1;
            },

            hasStrokeWidth: function(chartType) {
                return ['lines', 'multi_columns_lines', 'geom_map'].indexOf(chartType) !== -1
            },

            hasFillOpacity: function(chartDef) {
                return chartDef.type == 'geom_map' || (chartDef.type == 'admin_map' && chartDef.variant == 'filled_map');
            },

            canDisableXAxis: function(chartType) {
                return chartType === 'stacked_bars';
            },

            hasInChartValues: function(chartType) {
                return ['grouped_columns', 'stacked_columns', 'pie', 'stacked_bars'].indexOf(chartType) !== -1;
            },

            hasInChartLabels: function(chartType) {
                return ['pie'].indexOf(chartType) !== -1;
            },

            hasAxisLabels: function(chartType) {
                return ['pie', 'scatter_map', 'webapp', 'density_heat_map'].indexOf(chartType) === -1;
            },

            isExportableToExcel: function(chartDef) {
                if (chartDef.facetDimension.length) {
                    return false;
                }
                return ['stacked_columns', 'stacked_area', 'grouped_columns', 'lines',
                        'pivot_table', 'grouped_xy'].indexOf(chartDef.type) !== -1;
            },
            getExportDisabledReason: function(chartDef) {
                if (chartDef.facetDimension.length) {
                    return 'Download is not available for subcharts.';
                }
            },
            isExportableToImage: function(chartDef) {
                if (chartDef.facetDimension.length) {
                    return false;
                }
                return ['pivot_table', 'scatter_map', 'admin_map', 'grid_map', 'webapp', 'density_heat_map'].indexOf(chartDef.type) === -1;
            },

            hasSingleXAxis: function(chartDef) {
                return ['pie'].indexOf(chartDef.type) === -1;
            },

            hasMultipleYAxes: function(chartDef) {
                return ['multi_columns_lines', 'grouped_columns', 'lines'].indexOf(chartDef.type) !== -1;
            },

            hasOneTickPerBin: function(chartDef) {
                return !(chartDef.type === 'pie' || chartDef.type === 'pivot_table' || chartDef.hexbin);
            }
        }
    })

    app.controller('ChartSliderController', function ($scope, ChartDataUtils, ChartDimension) {
        /**
         * Handles the date range display for the filter.
         * If the interval is on the same day, then the corresponding day is added to
         * the selected filter type (free range).
         * The slider min and max labels are also updated to display meaningful date depending on the interval range.
         */
        function handleDateRangeFilterDisplay(minTimestamp, maxTimestamp) {
            const computedDateDisplayUnit = ChartDataUtils.computeDateDisplayUnit(minTimestamp, maxTimestamp);
            if ($scope.facetUiState.sliderDateFilterOption !== computedDateDisplayUnit.dateFilterOption) {
                // We have a new date filter option:
                //  since the two-way bindings is not done for the filter options, we need to trick the slider component
                //  into refreshing itself by slightly changing the min and/or the max
                $scope.facetUiState.sliderDateFilterOption = computedDateDisplayUnit.dateFilterOption;
                $scope.facetUiState.sliderModelMin += 1;
            }
            ChartDimension.updateDateFreeRangeFilterType($scope.dateFilterTypes, computedDateDisplayUnit.formattedMainDate);
        }

        $scope.$watch("filterTmpData", function(nv, ov) {
            if (!nv || nv.length == 0) return;
            var filterData = $scope.filterTmpData[$scope.$index];
            if (filterData == null) return; // when a filter is added, you have to wait for the response from the backend before filterTmpData is here
            filterData.response = filterData.response || {};
            var lb = filterData.response.minValue;
            var ub = filterData.response.maxValue;

            $scope.facetUiState = $scope.facetUiState || {};
            $scope.facetUiState.sliderLowerBound = lb !== undefined ? lb : $scope.facetUiState.sliderLowerBound;
            $scope.facetUiState.sliderUpperBound = ub !== undefined ? ub : $scope.facetUiState.sliderUpperBound;
            $scope.facetUiState.sliderModelMin = filterData.minValue;
            $scope.facetUiState.sliderModelMax = filterData.maxValue;
            if (ChartDimension.isFilterDateRange($scope.filter)) {
                handleDateRangeFilterDisplay(filterData.minValue, filterData.maxValue);
            }

            // 10000 ticks
            $scope.sliderStep = Math.round(10000*($scope.facetUiState.sliderModelMax-$scope.facetUiState.sliderModelMin))/100000000;

            // Handle min=max
            if($scope.sliderStep == 0) {
                $scope.sliderStep = 1;
            }

            $scope.sliderDecimals = Math.max( (''+($scope.sliderStep - Math.floor($scope.sliderStep))).length-2, 0);
        }, true);

        $scope.slideEnd = function() {
            var filterData = $scope.filterTmpData[$scope.$index];
            if (filterData == null) return; // when a filter is added, you have to wait for the response from the backend before filterTmpData is here
            filterData.minValue = $scope.facetUiState.sliderModelMin;
            filterData.maxValue = $scope.facetUiState.sliderModelMax;
            if(!$scope.$$phase) {
                $scope.$apply();
                $scope.$emit("filterChange");
            }
        };
    });

})();

function ChartIAE(message) {
    this.message = message;
    this.name = "ChartIAE";
}
ChartIAE.prototype = new Error;

(function(){
'use strict';

var app = angular.module('dataiku.directives.simple_report');

app.factory("ChartIconUtils", function(WebAppsService) {
    var ret = {
        computeChartIcon: function (type, variant, isInAnalysis, webAppType) {
            if (!ret.typeAndVariantToImageMap) return "";
            if (typeof(type) !== 'undefined') {
                if (type == 'webapp') {
                    var loadedDesc = WebAppsService.getWebAppLoadedDesc(webAppType) || {};
                    return loadedDesc && loadedDesc.desc && loadedDesc.desc.meta && loadedDesc.desc.meta.icon ? loadedDesc.desc.meta.icon : 'icon-puzzle-piece';
                }
                var imageName = 'basic_graphs';
                if (typeof(variant) === 'undefined') {
                    variant = 'normal';
                }
                if (typeof(ret.typeAndVariantToImageMap[type]) !== 'undefined'
                    && typeof(ret.typeAndVariantToImageMap[type][variant]) !== 'undefined'
                    && typeof(ret.typeAndVariantToImageMap[type][variant]).icon !== 'undefined') {
                    imageName = ret.typeAndVariantToImageMap[type][variant].icon;
                }
                var uri = '/static/dataiku/images/charts/icons/';
                if (isInAnalysis) {
                    uri += 'Chart_Icon_Analysis_'
                } else {
                    uri += 'Chart_Icon_Dataset_'
                }
                return uri + imageName + '.svg';
            }
        },

        typeAndVariantToImageMap: {
            'grouped_columns': {
                'normal': {
                    'icon': 'histogram',
                    'preview': 'grouped_columns'
                }
            },
            'stacked_bars': {
                'normal': {
                    'icon': 'bar_graph',
                    'preview': 'bar_graph'
                },
                'stacked_100': {
                    'icon': 'bar_stacked_100',
                    'preview': 'bar_graph'
                }
            },
            'stacked_columns': {
                'normal': {
                    'icon': 'stacked_color',
                    'preview': 'stacked_columns'
                },
                'stacked_100': {
                    'icon': 'stacked_100',
                    'preview': 'stacked_columns'
                }
            },
            'multi_columns_lines': {
                'normal': {
                    'icon': 'column__lines',
                    'preview': 'column__lines'
                }
            },
            'lines': {
                'normal': {
                    'icon': 'lines',
                    'preview': 'lines'
                }
            },
            'stacked_area': {
                'normal': {
                    'icon': 'stacked_areas',
                    'preview': 'stacked_areas'
                },
                'stacked_100': {
                    'icon': 'stacked_areas_100',
                    'preview': 'stacked_areas_100'
                }
            },
            'pivot_table': {
                'normal': {
                    'icon': 'table',
                    'preview': 'table'
                },
                'colored': {
                    'icon': 'colored',
                    'preview': 'colored'
                }
            },
            'scatter': {
                'normal': {
                    'icon': 'scatter',
                    'preview': 'scatter'
                }
            },
            'grouped_xy': {
                'normal': {
                    'icon': 'grouped_scatter',
                    'preview': 'grouped_scatter'
                }
            },
            'binned_xy': {
                'normal': {
                    'icon': 'bubble',
                    'preview': 'bubble'
                },
                'binned_xy_rect': {
                    'icon': 'rectangles',
                    'preview': 'rectangles'
                },
                'binned_xy_hex': {
                    'icon': 'hexagons',
                    'preview': 'hexagons'
                }
            },
            'density_2d': {
                'normal': {
                    'icon': 'heatmap',
                    'preview': 'heatmap'
                }
            },
            'scatter_map': {
                'normal': {
                    'icon': 'scatter_map',
                    'preview': 'scatter_map'
                }
            },
            'density_heat_map': {
                'normal': {
                    'icon': 'density_heat_map',
                    'preview': 'density_heat_map'
                }
            },
            'geom_map': {
                'normal': {
                    'icon': 'geom_map',
                    'preview': 'geom_map'
                }
            },
            'admin_map': {
                'normal': {
                    'icon': 'administrative_map',
                    'preview': 'administrative_map'
                },
                'filled_map': {
                    'icon': 'administrative_map',
                    'preview': 'administrative_map'
                }
            },
            'grid_map': {
                'normal': {
                    'icon': 'grid_map',
                    'preview': 'grid_map'
                }
            },
            'boxplots': {
                'normal': {
                    'icon': 'box_plot',
                    'preview': 'box_plot'
                }
            },
            'pie': {
                'normal': {
                    'icon': 'pie',
                    'preview': 'pie'
                },
                'donut': {
                    'icon': 'donut',
                    'preview': 'donut'
                }
            },
            'lift': {
                'normal': {
                    'icon': 'diminishing_return_charts',
                    'preview': 'diminishing-reduction'
                }
            }
        }
    };

    return ret;
});

app.directive('chartTypePicker', function($window, $timeout, ChartIconUtils, $state, $stateParams, DataikuAPI) {
    return {
        restrict: 'AE',
        templateUrl: '/templates/simple_report/chart-type-picker.html',
        link: function($scope, element) {

            $scope.isInPredicted = $state.current.name.indexOf('predicted')!=-1;
            /*
             * Chart Type Picker Visibility
             */

            $scope.chartPickerVibility = {visible: false};

            $scope.chartFamilyToDisplay = {name: 'basic'};

            $scope.switchChartPicker = function() {
                if ($scope.chart == null) return; // no chart data, won't be able to set anything (UserTooHastyException :) )
                $scope.chartPickerVibility.visible = !$scope.chartPickerVibility.visible;
                if ($scope.chartPickerVibility.visible) {
                    $timeout(function() {
                        $($window).on('click', $scope.switchClickHandler);
                        $scope.chartFamilyToDisplay.name = $scope.getFamilyNameByChartType($scope.chart.def.type);
                    });
                } else {
                    $($window).off('click', $scope.switchClickHandler);
                }
            }

            $scope.switchClickHandler = function(e) {
                var clickedEl = e.target;
                if ($(clickedEl).closest('.chart-type-selection').length <= 0 && $scope.chartPickerVibility.visible) {
                    $scope.switchChartPicker();
                    $scope.$apply();
                }
            }

            /*
             * Tabs Navigation
             */

            $scope.displayTab = function(familyName) {
                $scope.chartFamilyToDisplay.name = familyName;
            }

            $scope.getFamilyNameByChartType = function(type) {
                for (name in $scope.familyToTypeMap) {
                    var currentFamily = $scope.familyToTypeMap[name];
                    if (currentFamily.indexOf(type)>-1) {
                        return name;
                    }
                }
            }

            $scope.isFamilyDisplayed = function(family) {
                return family == $scope.chartFamilyToDisplay.name;
            }

            /*
             * Selecting some chart type
             */

            $scope.selectChartType= function(type, variant, webAppType){
                $scope.switchChartPicker();
                $scope.setChartType(type, variant, webAppType);
            }

            $scope.isChartSelected = function(type, variant, webAppType) {
                if ($scope.chart == null) return false; // data not loaded, cannot tell is selected or not
                var selectedType =  $scope.chart.def.type;
                var selectedVariant = $scope.chart.def.variant;
                var selectedwebAppType = $scope.chart.def.webAppType;
                if (typeof(selectedVariant)==='undefined' && typeof(variant)!=='undefined') {
                    selectedVariant = 'normal';
                }
                if (type != 'webapp') {
                    webAppType = null;
                }
                return selectedType == type && selectedVariant == variant && selectedwebAppType == webAppType;
            }

            /*
             * Chart Type Icon Handling
             */

            $scope.computeChartIcone = function(type, variant, webAppType) {
                return ChartIconUtils.computeChartIcon(type, variant, $scope.isInAnalysis, webAppType);
            }
            if (!$scope.isInPredicted && !$scope.isInAnalysis) {
                DataikuAPI.explores.listPluginChartDescs($stateParams.projectKey)
                    .success(function (data) {
                        if (data.length > 0) {
                            $scope.webApps = {};
                        }
                        data.forEach(w => {
                            let pluginId = w.ownerPluginId;
                            $scope.webApps[pluginId] = $scope.webApps[pluginId] || [];
                            $scope.webApps[pluginId].push(w);
                        });
                    }).error(setErrorInScope.bind($scope));
            }
        }
    };
});

})();

(function(){
'use strict';

/* Directives and controllers for charts configuration UI */

var app = angular.module('dataiku.charts');

app.directive('contextualMenu', function($rootScope, $window, Logger, $compile, $timeout) {
    // $rootScope.globallyOpenContextualMenu;
    $($window).on('click', function(e){
        if(! e.isDefaultPrevented() && !e.target.hasAttribute('no-global-contextual-menu-close')){
            $rootScope.globallyOpenContextualMenu = undefined;
            $rootScope.$apply();
        }
    });
    return {
        scope : true,
        compile : function(element, attrs) {
            var popoverTemplate = element.find(".contextualMenu").detach();
            return function($scope, element, attrs) {
                var popover = null;
                var popoverScope = null;
                $scope.contextualMenu = false;

                function hide(){
                    if (popover) {
                        if(popoverScope) {
                            popoverScope.$destroy();
                            popoverScope = null;
                        }
                        popover.hide().remove();
                        popover = null;
                    }
                }
                function show(){
                    if (popover === null) {
                        // Since Angular 1.6, in a <select>, ng-model is set to null when the corresponding <option> is removed.
                        //
                        // Here is what happens when a contextualMenu containing a select is removed (using hide()):
                        // - The selected <option> is removed from DOM (like the others) triggering its $destroy callback.
                        // - This callback removes the value from the optionsMap and set a digest's call back (ie: $$postDigest function).
                        // - $$postDigest is triggered after angular's digest and checks if its scope (popoverScope in our case) is destroyed.
                        // - If yes it does nothing (return)
                        // - If not, $$postDigest set the select's ngModel to null, because its current value is no longer in optionsMap
                        //
                        // popoverScope prevents any nested <select>'s ngModel to get set to null when a contextualMenu is closed.
                        // This fix work because we destroy popoverScope (where the select lives), before deleting the DOM containing it (along with the <option> elements).
                        // So when $$postDigest positively checks if its scope is $destroyed, it just returns without setting the select's ngModel to null.
                        popoverScope = $scope.$new();
                        // We may need the original scope in some context, e.g. modals opened from a contextualMenu
                        // because clicking on the modal will close the menu and destroyed its scope
                        popoverScope.$contextScope = $scope;
                        popover = $compile(popoverTemplate.get(0).cloneNode(true))(popoverScope);
                    }
                    popover.appendTo("body");

                    var position = attrs.cepPosition || "align-left-bottom";
                    var mainZone = element;
                    var mzOff = element.offset();

                    /* Fairly ugly ... */
                    if (element.parent().parent().hasClass("chartdef-dropped")) {
                        mzOff.top -= 4;
                        mzOff.left -= 10;
                    }

                    switch (position) {
                    case 'align-left-bottom':
                        popover.css({ left: mzOff.left, top: mzOff.top + mainZone.height() });
                        break;
                    case 'align-right-bottom':
                        popover.css({ top: mzOff.top + mainZone.height(),
                            left: mzOff.left + mainZone.innerWidth() - popover.innerWidth() });
                        break;
                    case 'align-right-top':
                        popover.css({ top: mzOff.top ,
                            left: mzOff.left + mainZone.innerWidth() });
                        break;
                    case 'smart':
                        var offset = { left: 'auto', right: 'auto', top: 'auto', bottom: 'auto' };
                        if (mzOff.left * 2 < window.innerWidth) {
                            offset.left = mzOff.left;
                        } else {
                            offset.right = window.innerWidth - mzOff.left - mainZone.innerWidth();
                        }
                        if (mzOff.top * 2 < window.innerHeight) {
                            offset.top = mzOff.top + mainZone.height();
                        } else {
                            offset.bottom = window.innerHeight - mzOff.top;
                        }
                        popover.css(offset);
                        break;
                    case 'smart-left-bottom':
                        $timeout(function() {
                            // Left-bottom position, except if the menu would overflow the window, then left-top
                            var offset = { left: mzOff.left, right: 'auto', top: 'auto', bottom: 'auto' };

                            if (mzOff.top + mainZone.height() + popover.outerHeight() > window.innerHeight) {
                                offset.bottom = window.innerHeight - mzOff.top;
                            } else {
                                offset.top = mzOff.top + mainZone.height();
                            }
                            popover.css(offset);
                        });
                        break;
                    }
                    if (attrs.cepWidth === 'fit-main') {
                        popover.css("width", mainZone.innerWidth());
                    }
                    popover.show();

                    popover.on('click', function(e){
                        e.stopPropagation();
                    });
                }

                $scope.$watch("contextualMenu", function(nv, ov) {
                    if (nv) show(); else hide();
                });

                $scope.toggleContextualMenu = function(e) {
                    if ($scope.globallyOpenContextualMenu && $scope.globallyOpenContextualMenu[0] === element[0]){
                        $rootScope.globallyOpenContextualMenu = undefined;
                    } else {
                        $rootScope.globallyOpenContextualMenu = element;
                    }
                    e.preventDefault();
                };

                $scope.$on("$destroy", function() {
                    hide();
                });

                $rootScope.$watch('globallyOpenContextualMenu', function(nv, ov){
                    $scope.contextualMenu = ($rootScope.globallyOpenContextualMenu && $rootScope.globallyOpenContextualMenu[0] === element[0]);
                });
            }
        }
    };
});

app.controller("ScatterChartController", function($scope, ChartChangeHandler){
    $scope.scatterAcceptDrop = function(data){
        return ChartChangeHandler.scatterAccept($scope.chart.def, data);
    }
    $scope.scatterAcceptScaleMeasure = function(data) {
    	return ChartChangeHandler.scatterAcceptScaleMeasure($scope.chart.def, data);
    }
})

app.controller("ScatterMapChartController", function($scope, ChartChangeHandler){
    $scope.acceptGeo = function(data){
        if (data.type == "GEOMETRY" || data.type == "GEOPOINT") {
            return {
                accept : true
            }
        } else {
            return {
                accept : false,
                message : "Need a geographic column"
            }
        }
    }
    $scope.acceptMeasure = function(data){
        return ChartChangeHandler.scatterAccept($scope.chart.def, data);
    }
    $scope.acceptScaleMeasure = function(data) {
        return ChartChangeHandler.scatterAcceptScaleMeasure($scope.chart.def, data);
    }
})

app.controller("DensityHeatMapChartController", function($scope, ChartChangeHandler){
        $scope.acceptGeo = function(data){
            if (data.type == "GEOMETRY" || data.type == "GEOPOINT") {
                return {
                    accept : true
                }
            } else {
                return {
                    accept : false,
                    message : "Need a geographic column"
                }
            }
        }
        $scope.acceptScaleMeasure = function(data) {
            return ChartChangeHandler.densityMapAcceptScaleMeasure($scope.chart.def, data);
        }
})

app.controller("AdminMapChartController", function($scope, ChartChangeHandler){
    $scope.acceptGeo = function(data){
        if (data.type == "GEOMETRY" || data.type == "GEOPOINT") {
            return {
                accept : true
            }
        } else {
            return {
                accept : false,
                message : "Need a geographic column"
            }
        }
    }
    $scope.acceptMeasure = function(data){
        return ChartChangeHandler.stdAggregatedAcceptMeasure($scope.chart.def, data);
    }
})

app.controller("StdAggregatedChartDefController", function($scope, ChartChangeHandler, ChartFeatures){
    $scope.acceptMeasure = function(data){
        return ChartChangeHandler.stdAggregatedAcceptMeasure($scope.chart.def, data);
    }
    $scope.acceptDimension = function(data){
        return ChartChangeHandler.stdAggregatedAcceptDimension($scope.chart.def, data);
    }
    $scope.ChartFeatures = ChartFeatures;
});

app.controller("BinnedXYChartDefController", function($scope, ChartChangeHandler, ChartFeatures) {
    $scope.acceptMeasure = function(data) {
        return ChartChangeHandler.stdAggregatedAcceptMeasure($scope.chart.def, data);
    };
    $scope.acceptDimension = function(data) {
        return ChartChangeHandler.binnedXYAcceptDimension($scope.chart.def, data);
    };
    $scope.ChartFeatures = ChartFeatures;
});

app.controller("BoxplotsChartDefController", function($scope, ChartChangeHandler){
    $scope.acceptMeasure = function(data){
        return ChartChangeHandler.boxplotsAcceptMeasure($scope.chart.def, data);
    }
    $scope.acceptDimension = function(data){
        return ChartChangeHandler.boxplotsAcceptBreakdown($scope.chart.def, data);
    }
});

app.controller("Density2DChartDefController", function($scope, ChartChangeHandler){
    $scope.accept = function(data){
        if( data.type == "NUMERICAL" || data.type == "DATE"){
            return {accept : true}
        } else {
            return {accept: false, message : "Can only use numerical or date"};
        }
    }
});


app.directive("monovaluedStdAggrDimensionZone", function($parse, ChartsStaticData){
    return {
        templateUrl : '/templates/simple_report/config/mono-std-aggr-dim-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.isSecondDimension = $parse(attrs.isSecondDimension)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
            $scope.dateModes = function() {
                return ChartsStaticData.dateModes;
            };
        }
    };
})
 .directive("monovaluedStdAggrDimensionZoneNoOpts", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/mono-std-aggr-dim-zone-noopts.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
 .directive("monovaluedStdAggrMeasureZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/mono-std-aggr-measure-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
  .directive("monoUaZoneNoOpts", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/mono-ua-zone-no-opts.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
.directive("multiUaZoneNoOpts", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/multi-ua-zone-no-opts.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
.directive("multivaluedStdAggrMeasureZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/multi-std-aggr-measure-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
.directive("scatterAxisZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/scatter-axis-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
 .directive("scatterDetailZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/scatter-detail-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
});
app.directive("geoNooptsZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/geo-noopts-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
app.directive("geoAdminZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/geo-admin-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})


app.controller("GridMapGridController", function($scope){
    $scope.uiState = {
        manualInput : false
    }
    $scope.$watch("chart.def.mapGridOptions.gridLatDeg", function(nv, ov){
        if (!nv || !ov) return;
        if ($scope.chart.def.mapOptions.lockSquareGrid) {
            $scope.chart.def.mapGridOptions.gridLonDeg = nv;
        }
    });
    $scope.$watch("chart.def.mapGridOptions.gridLonDeg", function(nv, ov){
        if (!nv || !ov) return;
        if ($scope.chart.def.mapOptions.lockSquareGrid) {
            $scope.chart.def.mapGridOptions.gridLatDeg = nv;
        }
    });
});

app.controller("SingleColorSelectorController", function($scope){
    function makeBlock(baseColor) {
        var rgb = d3.rgb(baseColor);
        return {
            b0 : rgb.toString(),
            b1 : rgb.brighter(4).toString(),
            b2 : rgb.brighter(5.5).toString()
        }
    }

    $scope.colors = [
        '#F03334', '#FF7703', '#F6C762', '#ECD941', '#82D96B', '#63E9C3',
        '#69CEF0', '#1EA8FC', '#2678B1', '#7638AF', '#BE66BF', '#EA3596',
        '#000000', '#8A8A8A', '#BABBBB', '#D2D2D2', '#E8E8E8', '#FFFFFF'
    ];

    $scope.grayBlock = [0,1,2,3,4,5,6,7,8,9].map(function(x){
        var c = x/10 * 255;
        return d3.rgb(c,c,c).toString()
    });
});

})();

(function() {
    'use strict';

    /**
     * This file declares the builtin color palettes stored in window.dkuColorPalettes
     * Plugins can add their own palettes with window.dkuColorPalettes.addDiscrete, addContinuous & addDiverging
     */

    window.dkuColorPalettes = {
        continuous: [
            {
                id: "default",
                name: "Default",
                colors: ['#9999CC', '#00003c'],
                category: "Built-in palettes"
            },
            {
                id: "default_rev",
                name: "Default (rev)",
                colors: ['#00003c', '#9999CC'],
                category: "Built-in palettes"
            },
            {
                id: "ryg1",
                name: "Red-green",
                colors: ['#EA1111', '#EEEE11', '#11CA11'],
                category: "Built-in palettes"
            },
            {
                id: "gyr1",
                name: "Green-red",
                colors: ['#11CA11', '#EEEE11', '#EA1111'],
                category: "Built-in palettes"
            },
            {
                id: "viridis",
                name: "Viridis",
                colors: ["#440154","#440256","#450457","#450559","#46075a","#46085c","#460a5d","#460b5e","#470d60","#470e61","#471063","#471164","#471365","#481467","#481668","#481769","#48186a","#481a6c","#481b6d","#481c6e","#481d6f","#481f70","#482071","#482173","#482374","#482475","#482576","#482677","#482878","#482979","#472a7a","#472c7a","#472d7b","#472e7c","#472f7d","#46307e","#46327e","#46337f","#463480","#453581","#453781","#453882","#443983","#443a83","#443b84","#433d84","#433e85","#423f85","#424086","#424186","#414287","#414487","#404588","#404688","#3f4788","#3f4889","#3e4989","#3e4a89","#3e4c8a","#3d4d8a","#3d4e8a","#3c4f8a","#3c508b","#3b518b","#3b528b","#3a538b","#3a548c","#39558c","#39568c","#38588c","#38598c","#375a8c","#375b8d","#365c8d","#365d8d","#355e8d","#355f8d","#34608d","#34618d","#33628d","#33638d","#32648e","#32658e","#31668e","#31678e","#31688e","#30698e","#306a8e","#2f6b8e","#2f6c8e","#2e6d8e","#2e6e8e","#2e6f8e","#2d708e","#2d718e","#2c718e","#2c728e","#2c738e","#2b748e","#2b758e","#2a768e","#2a778e","#2a788e","#29798e","#297a8e","#297b8e","#287c8e","#287d8e","#277e8e","#277f8e","#27808e","#26818e","#26828e","#26828e","#25838e","#25848e","#25858e","#24868e","#24878e","#23888e","#23898e","#238a8d","#228b8d","#228c8d","#228d8d","#218e8d","#218f8d","#21908d","#21918c","#20928c","#20928c","#20938c","#1f948c","#1f958b","#1f968b","#1f978b","#1f988b","#1f998a","#1f9a8a","#1e9b8a","#1e9c89","#1e9d89","#1f9e89","#1f9f88","#1fa088","#1fa188","#1fa187","#1fa287","#20a386","#20a486","#21a585","#21a685","#22a785","#22a884","#23a983","#24aa83","#25ab82","#25ac82","#26ad81","#27ad81","#28ae80","#29af7f","#2ab07f","#2cb17e","#2db27d","#2eb37c","#2fb47c","#31b57b","#32b67a","#34b679","#35b779","#37b878","#38b977","#3aba76","#3bbb75","#3dbc74","#3fbc73","#40bd72","#42be71","#44bf70","#46c06f","#48c16e","#4ac16d","#4cc26c","#4ec36b","#50c46a","#52c569","#54c568","#56c667","#58c765","#5ac864","#5cc863","#5ec962","#60ca60","#63cb5f","#65cb5e","#67cc5c","#69cd5b","#6ccd5a","#6ece58","#70cf57","#73d056","#75d054","#77d153","#7ad151","#7cd250","#7fd34e","#81d34d","#84d44b","#86d549","#89d548","#8bd646","#8ed645","#90d743","#93d741","#95d840","#98d83e","#9bd93c","#9dd93b","#a0da39","#a2da37","#a5db36","#a8db34","#aadc32","#addc30","#b0dd2f","#b2dd2d","#b5de2b","#b8de29","#bade28","#bddf26","#c0df25","#c2df23","#c5e021","#c8e020","#cae11f","#cde11d","#d0e11c","#d2e21b","#d5e21a","#d8e219","#dae319","#dde318","#dfe318","#e2e418","#e5e419","#e7e419","#eae51a","#ece51b","#efe51c","#f1e51d","#f4e61e","#f6e620","#f8e621","#fbe723","#fde725"],
                category: "Built-in palettes"
            },
            {
                id: "viridis_rev",
                name: "Viridis (rev)",
                colors: ["#fde725","#fbe723","#f8e621","#f6e620","#f4e61e","#f1e51d","#efe51c","#ece51b","#eae51a","#e7e419","#e5e419","#e2e418","#dfe318","#dde318","#dae319","#d8e219","#d5e21a","#d2e21b","#d0e11c","#cde11d","#cae11f","#c8e020","#c5e021","#c2df23","#c0df25","#bddf26","#bade28","#b8de29","#b5de2b","#b2dd2d","#b0dd2f","#addc30","#aadc32","#a8db34","#a5db36","#a2da37","#a0da39","#9dd93b","#9bd93c","#98d83e","#95d840","#93d741","#90d743","#8ed645","#8bd646","#89d548","#86d549","#84d44b","#81d34d","#7fd34e","#7cd250","#7ad151","#77d153","#75d054","#73d056","#70cf57","#6ece58","#6ccd5a","#69cd5b","#67cc5c","#65cb5e","#63cb5f","#60ca60","#5ec962","#5cc863","#5ac864","#58c765","#56c667","#54c568","#52c569","#50c46a","#4ec36b","#4cc26c","#4ac16d","#48c16e","#46c06f","#44bf70","#42be71","#40bd72","#3fbc73","#3dbc74","#3bbb75","#3aba76","#38b977","#37b878","#35b779","#34b679","#32b67a","#31b57b","#2fb47c","#2eb37c","#2db27d","#2cb17e","#2ab07f","#29af7f","#28ae80","#27ad81","#26ad81","#25ac82","#25ab82","#24aa83","#23a983","#22a884","#22a785","#21a685","#21a585","#20a486","#20a386","#1fa287","#1fa187","#1fa188","#1fa088","#1f9f88","#1f9e89","#1e9d89","#1e9c89","#1e9b8a","#1f9a8a","#1f998a","#1f988b","#1f978b","#1f968b","#1f958b","#1f948c","#20938c","#20928c","#20928c","#21918c","#21908d","#218f8d","#218e8d","#228d8d","#228c8d","#228b8d","#238a8d","#23898e","#23888e","#24878e","#24868e","#25858e","#25848e","#25838e","#26828e","#26828e","#26818e","#27808e","#277f8e","#277e8e","#287d8e","#287c8e","#297b8e","#297a8e","#29798e","#2a788e","#2a778e","#2a768e","#2b758e","#2b748e","#2c738e","#2c728e","#2c718e","#2d718e","#2d708e","#2e6f8e","#2e6e8e","#2e6d8e","#2f6c8e","#2f6b8e","#306a8e","#30698e","#31688e","#31678e","#31668e","#32658e","#32648e","#33638d","#33628d","#34618d","#34608d","#355f8d","#355e8d","#365d8d","#365c8d","#375b8d","#375a8c","#38598c","#38588c","#39568c","#39558c","#3a548c","#3a538b","#3b528b","#3b518b","#3c508b","#3c4f8a","#3d4e8a","#3d4d8a","#3e4c8a","#3e4a89","#3e4989","#3f4889","#3f4788","#404688","#404588","#414487","#414287","#424186","#424086","#423f85","#433e85","#433d84","#443b84","#443a83","#443983","#453882","#453781","#453581","#463480","#46337f","#46327e","#46307e","#472f7d","#472e7c","#472d7b","#472c7a","#472a7a","#482979","#482878","#482677","#482576","#482475","#482374","#482173","#482071","#481f70","#481d6f","#481c6e","#481b6d","#481a6c","#48186a","#481769","#481668","#481467","#471365","#471164","#471063","#470e61","#470d60","#460b5e","#460a5d","#46085c","#46075a","#450559","#450457","#440256","#440154"],
                category: "Built-in palettes"
            },
            {
                id: "magma",
                name: "Magma",
                colors: ["#000004","#010005","#010106","#010108","#020109","#02020b","#02020d","#03030f","#030312","#040414","#050416","#060518","#06051a","#07061c","#08071e","#090720","#0a0822","#0b0924","#0c0926","#0d0a29","#0e0b2b","#100b2d","#110c2f","#120d31","#130d34","#140e36","#150e38","#160f3b","#180f3d","#19103f","#1a1042","#1c1044","#1d1147","#1e1149","#20114b","#21114e","#221150","#241253","#251255","#271258","#29115a","#2a115c","#2c115f","#2d1161","#2f1163","#311165","#331067","#341069","#36106b","#38106c","#390f6e","#3b0f70","#3d0f71","#3f0f72","#400f74","#420f75","#440f76","#451077","#471078","#491078","#4a1079","#4c117a","#4e117b","#4f127b","#51127c","#52137c","#54137d","#56147d","#57157e","#59157e","#5a167e","#5c167f","#5d177f","#5f187f","#601880","#621980","#641a80","#651a80","#671b80","#681c81","#6a1c81","#6b1d81","#6d1d81","#6e1e81","#701f81","#721f81","#732081","#752181","#762181","#782281","#792282","#7b2382","#7c2382","#7e2482","#802582","#812581","#832681","#842681","#862781","#882781","#892881","#8b2981","#8c2981","#8e2a81","#902a81","#912b81","#932b80","#942c80","#962c80","#982d80","#992d80","#9b2e7f","#9c2e7f","#9e2f7f","#a02f7f","#a1307e","#a3307e","#a5317e","#a6317d","#a8327d","#aa337d","#ab337c","#ad347c","#ae347b","#b0357b","#b2357b","#b3367a","#b5367a","#b73779","#b83779","#ba3878","#bc3978","#bd3977","#bf3a77","#c03a76","#c23b75","#c43c75","#c53c74","#c73d73","#c83e73","#ca3e72","#cc3f71","#cd4071","#cf4070","#d0416f","#d2426f","#d3436e","#d5446d","#d6456c","#d8456c","#d9466b","#db476a","#dc4869","#de4968","#df4a68","#e04c67","#e24d66","#e34e65","#e44f64","#e55064","#e75263","#e85362","#e95462","#ea5661","#eb5760","#ec5860","#ed5a5f","#ee5b5e","#ef5d5e","#f05f5e","#f1605d","#f2625d","#f2645c","#f3655c","#f4675c","#f4695c","#f56b5c","#f66c5c","#f66e5c","#f7705c","#f7725c","#f8745c","#f8765c","#f9785d","#f9795d","#f97b5d","#fa7d5e","#fa7f5e","#fa815f","#fb835f","#fb8560","#fb8761","#fc8961","#fc8a62","#fc8c63","#fc8e64","#fc9065","#fd9266","#fd9467","#fd9668","#fd9869","#fd9a6a","#fd9b6b","#fe9d6c","#fe9f6d","#fea16e","#fea36f","#fea571","#fea772","#fea973","#feaa74","#feac76","#feae77","#feb078","#feb27a","#feb47b","#feb67c","#feb77e","#feb97f","#febb81","#febd82","#febf84","#fec185","#fec287","#fec488","#fec68a","#fec88c","#feca8d","#fecc8f","#fecd90","#fecf92","#fed194","#fed395","#fed597","#fed799","#fed89a","#fdda9c","#fddc9e","#fddea0","#fde0a1","#fde2a3","#fde3a5","#fde5a7","#fde7a9","#fde9aa","#fdebac","#fcecae","#fceeb0","#fcf0b2","#fcf2b4","#fcf4b6","#fcf6b8","#fcf7b9","#fcf9bb","#fcfbbd","#fcfdbf"],
                category: "Built-in palettes"
            },
            {
                id: "magma_rev",
                name: "Magma (rev)",
                colors: ["#fcfdbf","#fcfbbd","#fcf9bb","#fcf7b9","#fcf6b8","#fcf4b6","#fcf2b4","#fcf0b2","#fceeb0","#fcecae","#fdebac","#fde9aa","#fde7a9","#fde5a7","#fde3a5","#fde2a3","#fde0a1","#fddea0","#fddc9e","#fdda9c","#fed89a","#fed799","#fed597","#fed395","#fed194","#fecf92","#fecd90","#fecc8f","#feca8d","#fec88c","#fec68a","#fec488","#fec287","#fec185","#febf84","#febd82","#febb81","#feb97f","#feb77e","#feb67c","#feb47b","#feb27a","#feb078","#feae77","#feac76","#feaa74","#fea973","#fea772","#fea571","#fea36f","#fea16e","#fe9f6d","#fe9d6c","#fd9b6b","#fd9a6a","#fd9869","#fd9668","#fd9467","#fd9266","#fc9065","#fc8e64","#fc8c63","#fc8a62","#fc8961","#fb8761","#fb8560","#fb835f","#fa815f","#fa7f5e","#fa7d5e","#f97b5d","#f9795d","#f9785d","#f8765c","#f8745c","#f7725c","#f7705c","#f66e5c","#f66c5c","#f56b5c","#f4695c","#f4675c","#f3655c","#f2645c","#f2625d","#f1605d","#f05f5e","#ef5d5e","#ee5b5e","#ed5a5f","#ec5860","#eb5760","#ea5661","#e95462","#e85362","#e75263","#e55064","#e44f64","#e34e65","#e24d66","#e04c67","#df4a68","#de4968","#dc4869","#db476a","#d9466b","#d8456c","#d6456c","#d5446d","#d3436e","#d2426f","#d0416f","#cf4070","#cd4071","#cc3f71","#ca3e72","#c83e73","#c73d73","#c53c74","#c43c75","#c23b75","#c03a76","#bf3a77","#bd3977","#bc3978","#ba3878","#b83779","#b73779","#b5367a","#b3367a","#b2357b","#b0357b","#ae347b","#ad347c","#ab337c","#aa337d","#a8327d","#a6317d","#a5317e","#a3307e","#a1307e","#a02f7f","#9e2f7f","#9c2e7f","#9b2e7f","#992d80","#982d80","#962c80","#942c80","#932b80","#912b81","#902a81","#8e2a81","#8c2981","#8b2981","#892881","#882781","#862781","#842681","#832681","#812581","#802582","#7e2482","#7c2382","#7b2382","#792282","#782281","#762181","#752181","#732081","#721f81","#701f81","#6e1e81","#6d1d81","#6b1d81","#6a1c81","#681c81","#671b80","#651a80","#641a80","#621980","#601880","#5f187f","#5d177f","#5c167f","#5a167e","#59157e","#57157e","#56147d","#54137d","#52137c","#51127c","#4f127b","#4e117b","#4c117a","#4a1079","#491078","#471078","#451077","#440f76","#420f75","#400f74","#3f0f72","#3d0f71","#3b0f70","#390f6e","#38106c","#36106b","#341069","#331067","#311165","#2f1163","#2d1161","#2c115f","#2a115c","#29115a","#271258","#251255","#241253","#221150","#21114e","#20114b","#1e1149","#1d1147","#1c1044","#1a1042","#19103f","#180f3d","#160f3b","#150e38","#140e36","#130d34","#120d31","#110c2f","#100b2d","#0e0b2b","#0d0a29","#0c0926","#0b0924","#0a0822","#090720","#08071e","#07061c","#06051a","#060518","#050416","#040414","#030312","#03030f","#02020d","#02020b","#020109","#010108","#010106","#010005","#000004"],
                category: "Built-in palettes"
            }
        ],
        quantile: [
            {
                id: "default",
                name: "Deciles 1",
                colors: ['#3288bd',
                    '#66c2a5',
                    '#abdda4',
                    '#e6f598',
                    '#ffffbf',
                    '#fee08b',
                    '#fdae61',
                    '#f46d43',
                    '#d53e4f'
                ],
                category: "Built-in palettes"
            }
        ],
        discrete: [
            {
                id: 'default', name: "Default",
                colors: d3.scale.category20().range().concat(d3.scale.category20b().range()),
                category: "Built-in palettes"
            },
            {
                id: "dku_dss_next",
                name: "DSS Next",
                colors: ["#00AEDB", "#8CC63F", "#FFC425", "#F37735", "#D11141", "#91268F", "#194BA3", "#00B159"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_pastel1',
                name: "Pastel",
                colors: ["#EC6547", "#FDC665", "#95C37B", "#75C2CC", "#694A82", "#538BC8", "#65B890", "#A874A0"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_corpo1',
                name: "Corporate",
                colors: ["#0075B2", "#818991", "#EA9423", "#A4C2DB", "#EF3C39", "#009D4B", "#CFD6D3", "#231F20"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_deuteranopia1',
                name: "Deuteranopia",
                colors: ["#193C81", "#7EA0F9", "#211924", "#757A8D", "#D6C222", "#776A37", "#AE963A", "#655E5D"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_tritanopia1',
                name: "Tritanopia",
                colors: ["#CA0849", "#0B4D61", "#E4B2BF", "#3F6279", "#F24576", "#7D8E98", "#9C4259", "#2B2A2E"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_pastel2',
                name: 'Pastel 2',
                colors: ["#f06548", "#fdc766", "#7bc9a6", "#4ec5da", "#548ecb", "#97668f", "#5e2974"],
                category: "Built-in palettes"
            }
        ],

        diverging: [],


        /*
         *   The following is used in plugins to add new palettes, don't rename those methods
         */

        addDiscrete: function (palette) {
            if (window.dkuColorPalettes.discrete.find(p => p.id === palette.id)) {
                console.warn("Discrete color palette '" + palette.id + "' already exists, it will be overriden."); /*@console*/  // NOSONAR: OK to use console.
                window.dkuColorPalettes.discrete = window.dkuColorPalettes.discrete.filter(p => p.id !== palette.id);
            }
            window.dkuColorPalettes.discrete.push(palette);
        },

        addContinuous: function (palette) {
            if (window.dkuColorPalettes.continuous.find(p => p.id === palette.id)) {
                console.warn("Continuous color palette '" + palette.id + "' already exists, it will be overriden."); /*@console*/  // NOSONAR: OK to use console.
                window.dkuColorPalettes.continuous = window.dkuColorPalettes.continuous.filter(p => p.id !== palette.id);
            }
            window.dkuColorPalettes.continuous.push(palette);
        },

        addDiverging: function (palette) {
            if (window.dkuColorPalettes.diverging.find(p => p.id === palette.id)) {
                console.warn("Diverging color palette '" + palette.id + "' already exists, it will be overriden."); /*@console*/  // NOSONAR: OK to use console.
                window.dkuColorPalettes.diverging = window.dkuColorPalettes.diverging.filter(p => p.id !== palette.id);
            }
            window.dkuColorPalettes.diverging.push(palette);
        }
    };

})();
(function() {
    'use strict';

    /**
     * This file declares the builtin map backgrounds stored in window.dkuMapBackgrounds
     * Plugins can add their own map backgrounds with window.dkuMapBackgrounds.addCustom & addMapbox
     */

    window.dkuMapBackgrounds = {
        backgrounds: [
            {
                "id": "cartodb-positron",
                "name": "Black & White (light)",
                "getTileLayer": function () {
                    return new L.tileLayer(
                        'http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
                            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
                        })
                },
                "fadeColor": "#333"
            },
            {
                "id": "cartodb-dark",
                "name": "Black & White (dark)",
                "getTileLayer": function () {
                    return new L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
                    });
                },
                "fadeColor": "#EEE"
            }
        ],


        /*
         *   The following is used in plugins to add new map backgrounds, don't rename those methods
         */

        addCustom: function (background) {
            if (window.dkuMapBackgrounds.backgrounds.find(b => b.id === background.id)) {
                console.warn("Map background '" + background.id + "' already exists, it will be overriden."); /*@console*/  // NOSONAR: OK to use console.
                window.dkuMapBackgrounds.backgrounds = window.dkuMapBackgrounds.backgrounds.filter(b => b.id !== background.id);
            }
            window.dkuMapBackgrounds.backgrounds.push(background);
        },

        addMapbox: function (mapId, label, accessToken) {
            var name;
            if (!label) {
                name = mapId.split('.')[mapId.split('.').length - 1];
                name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
            } else {
                name = label;
            }

            window.dkuMapBackgrounds.addCustom({
                id: mapId,
                name: name,
                category: "Mapbox",
                getTileLayer: function () {
                    return L.tileLayer('https://api.mapbox.com/v4/' + mapId + '/{z}/{x}/{y}.png?access_token=' + accessToken, {
                        attribution: '© <a href="https://www.mapbox.com/feedback/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    });
                }
            });
        },

        addWMS: function (id, name, category, wmsURL, layerId) {
            window.dkuMapBackgrounds.addCustom({
                id: id,
                name: name,
                category: category,
                getTileLayer: function () {
                    return L.tileLayer.wms(wmsURL, {
                        layers: layerId
                    });
                }
            });
        }
    };
})();
(function(){
    'use strict';

    angular.module('dataiku.charts')
        .factory("ChartLegendUtils", ChartLegendUtils)
        .controller("ChartLegendOptzoneController", ChartLegendOptzoneController)
        .directive("continuousColorLegend", continuousColorLegend)
        .directive("discreteColorLegend", discreteColorLegend);

    function ChartLegendUtils(CreateCustomElementFromTemplate, $q, $timeout, ChartColorUtils) {
        var that = {
            initLegend: function(chartDef, chartData, chartHandler, colorScale) {
                if (!colorScale) {
                    chartHandler.legends.length = 0;
                    return;
                }
                
                switch (colorScale.type) {
                    case 'DIMENSION':
                        return that.initDimensionLegend(chartDef, chartData, chartHandler, colorScale);
                    case 'MEASURE':
                        return that.initMeasureLegend(chartDef, chartData, chartHandler, colorScale);
                    case 'UNAGGREGATED':
                        if (colorScale.isContinuous) {
                            return that.initMeasureLegend(chartDef, chartData, chartHandler, colorScale);
                        }
                        return;
                    default:
                        throw new Error("Unknown scale type: " + colorScale.type);
                }
            },

            initDimensionLegend: function(chartDef, chartData, chartHandler, colorScale) {
                var items = [];

                (chartData.getAxisLabels('color') || chartDef.genericMeasures).forEach(function(colorOrMeasure, c) {
                    var color = colorScale(c);
                    items.push({
                        label: {
                            label: colorOrMeasure.label || chartHandler.measureLabel(colorOrMeasure)
                        },
                        color: color,
                        desaturatedColor: ChartColorUtils.desaturate(color),
                        rgbaColor: ChartColorUtils.toRgba(colorScale(c), chartDef.colorOptions.transparency),
                        focused: false,
                        unfocusFn: function() { /* focus/unfocus on mouseover */ },
                        focusFn: function() { /* focus/unfocus on mouseover */ },
                        id: c,
                        elements: d3.select()
                    });
                });

                chartHandler.legends.length = 0;
                chartHandler.legends.push({
                    type: "COLOR_DISCRETE",
                    items: items
                });
            },

            initMeasureLegend: function(chartDef, chartData, chartHandler, colorScale) {
                chartHandler.legends.length = 0;
                chartHandler.legends.push({
                    type: "COLOR_CONTINUOUS",
                    scale: colorScale
                });
            },

            drawLegend: function(chartDef, chartHandler, $container) {
                var deferred = $q.defer();

                CreateCustomElementFromTemplate('/templates/simple_report/legend/legend-zone.html', chartHandler, null, function() {
                    $timeout(deferred.resolve);
                }, function($el) {
                    $container.find('.legend-zone').remove();
                    $container.attr('legend-placement', chartDef.legendPlacement);
                    $el.appendTo($container);
                });

                return deferred.promise;
            },

            adjustLegendPlacement: function(chartDef, $container, margins) {
                var $legendZone = $container.find('.legend-zone');

                var getEffectiveLeftMargin = function() {
                    if (chartDef.facetDimension.length) {
                        return $('.facet-info').width() + margins.left;
                    } else {
                        return margins.left;
                    }
                };

                var setMaxSize = function() {
                    $legendZone
                        .css('max-height', 'calc(100% - ' + (margins.top + margins.bottom) + 'px)')
                        .css('max-width',  '25%')
                        .css('visibility', 'visible');
                };

                switch (chartDef.legendPlacement) {
                    case 'INNER_TOP_LEFT':
                        $legendZone.css('left', getEffectiveLeftMargin()).css('top', margins.top);
                        setMaxSize();
                        break;
                    case 'INNER_TOP_RIGHT':
                        $legendZone.css('right', margins.right).css('top', margins.top);
                        setMaxSize();
                        break;
                    case 'INNER_BOTTOM_LEFT':
                        $legendZone.css('left', getEffectiveLeftMargin()).css('bottom', margins.bottom);
                        setMaxSize();
                        break;
                    case 'INNER_BOTTOM_RIGHT':
                        $legendZone.css('right', margins.right).css('bottom', margins.bottom);
                        setMaxSize();
                        break;
                    default:
                        break;
                }
            }
        };

        return that;
    }

    function ChartLegendOptzoneController($scope) {
        $scope.categories = {
            'OUTER': ['OUTER_RIGHT', 'OUTER_LEFT', 'OUTER_TOP', 'OUTER_BOTTOM'],
            'INNER': ['INNER_TOP_RIGHT', 'INNER_TOP_LEFT', 'INNER_BOTTOM_LEFT', 'INNER_BOTTOM_RIGHT']
        };

        $scope.$watch("legendPlacementCategory", function(nv, ov) {
            if (!nv) return;

            if (nv === 'SIDEBAR') {
                $scope.chart.def.legendPlacement = 'SIDEBAR';
            } else {
                if ($scope.categories[nv].indexOf($scope.chart.def.legendPlacement) === -1) {
                    $scope.chart.def.legendPlacement = $scope.categories[nv][0];
                }
            }
        });

        $scope.$watch("chart.def.legendPlacement", function(nv, ov) {
            if (!nv) return;

            if (nv === 'SIDEBAR') {
                $scope.legendPlacementCategory = 'SIDEBAR';
            } else {
                for (var cat in $scope.categories) {
                    if ($scope.categories[cat].indexOf(nv) > -1) {
                        $scope.legendPlacementCategory = cat;
                        break;
                    }
                }
            }
        });
    }

    function discreteColorLegend(Logger) {
        return {
            scope: true,
            templateUrl: '/templates/simple_report/legend/discrete-color-legend.html',
            link: function ($scope, element, attrs) {
                $scope.$watch(attrs.legend, function (nv, ov) {
                    $scope.legend = $scope.$eval(attrs.legend);
                });

                $scope.hasFocused = false;

                var unfocusAll = function () {
                    $scope.legend.items.forEach(function (it) {
                        if (it.focused && it.unfocusFn) it.unfocusFn();
                        it.focused = false;
                    })
                }

                $scope.toggleFocus = function ($index) {
                    Logger.info("Toggle focus");
                    console.time("toggleFocus");
                    /*@console*/
                    if ($scope.legend.items[$index].focused) {
                        unfocusAll();
                        $scope.hasFocused = false;
                    } else {
                        unfocusAll();
                        $scope.legend.items[$index].focused = true;
                        if ($scope.legend.items[$index].focusFn) {
                            $scope.legend.items[$index].focusFn();
                        }
                        $scope.hasFocused = true;
                    }
                    $scope.$$postDigest(function() {
                        Logger.info("post-digest");
                        console.timeEnd("toggleFocus");
                        /*@console*/
                    })
                }

            }
        }
    }

    function continuousColorLegend(Fn) {
        return {
            scope: true,
            templateUrl: '/templates/simple_report/legend/continuous-color-legend.html',
            link: function ($scope, element, attrs) {

                var placement = element.closest('.pivot-charts').attr('legend-placement');

                $scope.$watch(attrs.legend, function (nv, ov) {
                    $scope.draw($scope.$eval(attrs.legend));
                });

                var svg = d3.select(element[0]).select('svg'),
                    $svg = element.find('svg'),
                    gradient = svg.select('linearGradient');

                var vertical, orient, barWidth = Math.max(0, $svg.width() - 10), barHeight = Math.max(0, $svg.height() - 10), axisX = 5, axisY = 5, rectX = 0;
                switch (placement) {
                    case 'OUTER_RIGHT':
                        vertical = true;
                        barWidth = 15;
                        axisX  = 15;
                        orient = 'right';
                        break;
                    case 'OUTER_LEFT':
                        vertical = true;
                        barWidth = 15;
                        orient = 'left';
                        break;
                    case 'OUTER_TOP':
                    case 'OUTER_BOTTOM':
                    default: // sidebar or inner
                        vertical = false;
                        $svg.height(45);
                        orient = 'bottom';
                        axisY = 15;
                        barHeight = 15;
                        break;
                }

                if (vertical) {
                    gradient.attr('x2', '0%').attr('y2', '100%');
                }

                svg.select('rect')
                    .attr('width', barWidth)
                    .attr('height', barHeight)
                    .attr('y', vertical ? 5 : 0)
                    .attr('x', vertical ? 0 : 5);

                $scope.draw = function(legend) {

                    var axisScale = legend.scale.innerScale.copy();
                    if (legend.scale.diverging) {
                        axisScale.domain([axisScale.invert(0), axisScale.invert(1)]).range([0, 1]);
                    }
                    axisScale.range(axisScale.range().map(x => vertical ? (barHeight - x*barHeight) : x*barWidth)).interpolate(d3.interpolate);
                    var axis = d3.svg.axis().orient(orient).scale(axisScale).ticks(5);
                    var axisG = svg.select('g.axis');


                    // Force the scale domain limits to appear as ticks in the axes
                    var ticks = angular.copy(axisScale.ticks());
                    axisScale.domain().forEach(function(v) {
                        if (axisScale.ticks().indexOf(v) < 0) {
                            ticks.push(v);
                        }
                    });
                    axis.tickValues(ticks);
                    axis.tickFormat(legend.formatter);
                    axisG.selectAll('*').remove();
                    axisG.call(axis).select('path.domain').remove();

                    if (!vertical) {
                        d3.select(axisG.selectAll('g.tick')[0].reduce(function(min, g) { // find left-most tick (DOM order is not always the tick order)
                            return min.__data__ < g.__data__ ? min : g;
                        })).select('text').style("text-anchor", "start");
                        d3.select(axisG.selectAll('g.tick')[0].reduce(function(max, g) { // find right-most tick (DOM order is not always the tick order)
                            return max.__data__ > g.__data__ ? max : g;
                        })).select('text').style("text-anchor", "end");
                    }

                    // Add a white rectangle under all tick labels so that collisions are not too ugly
                    // Ideally, we could avoid collisions in the first place by carefully removing the right ticks from `ticks`
                    axisG.selectAll('.tick').each(function() {
                        var g = d3.select(this);
                        var bbox = this.getBoundingClientRect();
                        g.insert('rect', ':first-child')
                            .attr('x', vertical ? (orient === 'left' ? -bbox.width : 0) : -bbox.width/2 )
                            .attr('y', vertical ? -bbox.height/2 : 0)
                            .attr('fill', 'white')
                            .attr('stroke-width', 0)
                            .attr('width', bbox.width)
                            .attr('height', bbox.height);
                    });

                    var colors = legend.scale.outerScale.range();
                    var colorStops = [];
                    var numStops = legend.scale.quantizationMode === 'NONE' ? colors.length - 1 : colors.length;

                    if (legend.scale.quantizationMode !== 'QUANTILES') {
                        colors.forEach(function(c, i) {
                            colorStops.push({
                                color: c,
                                offset: i*100/numStops
                            });

                            if (legend.scale.quantizationMode !== 'NONE') {
                                colorStops.push({
                                    color: c,
                                    offset: (i+1)*(100/numStops)
                                });
                            }
                        });
                    } else {
                        var thresholds = legend.scale.outerScale.quantiles();
                        colors.forEach(function(c, i) {
                            colorStops.push({
                                color: c,
                                offset: (i === 0 ? 0 : thresholds[i-1]*100)
                            });
                            colorStops.push({
                                color: c,
                                offset: (i === colors.length-1 ? 100 : thresholds[i]*100)
                            })
                        });
                    }

                    // In the vertical scale, we want the first stop at the bottom
                    if (vertical) {
                        colorStops.forEach(function(stop) {
                            stop.offset = (100-(stop.offset))
                        });
                        colorStops.reverse();
                    }

                    /* This was used to display the color palette with a log/square/square root gradient instead of a linear gradient,
                    but instead we display a linear gradient and let d3 put the ticks at the right places
                    if (scale.mode == 'LINEAR') {
                        points = legend.scale.domain();
                    } else {
                        var NUM_STOPS = 100;
                        var range = axisScale.range();
                        var step = (domain[domain.length-1] - domain[0])/NUM_STOPS;
                        for (var i = 0; i < NUM_STOPS; i++) {
                            points.push(domain[0] + step*i);
                        }
                    }*/

                    gradient.selectAll('stop').data(colorStops)
                        .enter().append('stop')
                        .attr('offset', stop => stop.offset + '%')
                        .attr('stop-color', Fn.prop('color'))
                        .attr('stop-opacity', 1);

                    if (vertical) {
                        var maxWidth = d3.max(axisG.selectAll('g.tick')[0].map(function(itm) {
                            return itm.getBoundingClientRect().width;
                        })) || 0;

                        $svg.css('width', maxWidth + 15);
                    } else {
                        var maxHeight = d3.max(axisG.selectAll('g.tick')[0].map(function(itm) {
                            return itm.getBoundingClientRect().height;
                        })) || 0;

                        $svg.css('height', maxHeight + 15);
                    }

                    if (placement == 'OUTER_LEFT') {
                        rectX = $svg.width() - 15;
                        axisX = rectX;
                    }

                    axisG.attr('transform', 'translate(' + axisX + ',' + axisY + ')');
                    svg.select('rect').attr('transform', 'translate(' + rectX + ', 0)');
                };
            }
        }
    }

})();
(function(){
'use strict';

angular.module('dataiku.charts')
    .service("ChartTooltips", ChartTooltips)
    .service("ChartDrillUtils", ChartDrillUtils)
    .service("ChartTooltipsUtils", ChartTooltipsUtils);


function ChartTooltips($q, $templateCache, $http, $compile, $rootScope, LabelsController, ChartDrillUtils, $timeout) {
    return {
        /**
         * Initialize the tooltip(s) for the given chart and return an object with methods to control them, and enable tooltips on new elements.
         * This also controls the saturation/desaturation of svg elements on hover by keeping a list of registered elements for every color coordinate.
         * @param {jQuery} $container
         * @param {$scope} chartHandler
         * @param {ChartTensorDataWrapper} chartData
         * @param {ChartDef} chartDef
         * @param {array} measureFormatters
         * @return {{showForCoords: showForCoords, hide: hide, fix: fix, unfix: unfix, setAnimationFrame: setAnimationFrame, registerEl: registerEl, addTooltipHandlers: addTooltipHandlers, removeTooltipsHandlers: removeTooltipsHandlers, focusColor: focusColor, resetColors: resetColors}}
         */
        create: function($container, chartHandler, chartData, chartDef, measureFormatters) {
            var templateUrl = '/templates/simple_report/tooltips/std-aggr-nd.html';
            var tooltipScopes = {};
            var $tooltip, divHeight, divWidth;
            var tooltipState = {shown: false, formatters: measureFormatters};

            $q.when($templateCache.get(templateUrl) || $http.get(templateUrl, {cache: true})).then(function (template) {

                if(angular.isArray(template)) {
                    template = template[1];
                } else if(angular.isObject(template)) {
                    template = template.data;
                }

                $container.find('div.chart-wrapper').each(function(f) {
                    var $div = $(this);
                    $tooltip = $(template).appendTo($div);

                    var tooltipScope = chartHandler.$new();
                    tooltipScope.chartData = chartData;
                    tooltipScope.chartDef = chartDef;
                    tooltipScope.facet = f;
                    tooltipScope.tooltipState = tooltipState;
                    LabelsController(tooltipScope);


                    tooltipScope.coords = function() {
                        return angular.extend({}, tooltipState.coords, {facet: f});
                    };
                    tooltipScope.filter = function(dimension){
                        ChartDrillUtils.facetOnDim(chartDef, dimension[0]);
                    };
                    tooltipScope.drill = function(dimension, bin) {
                        ChartDrillUtils.drill(chartDef, dimension[0], bin);
                    };
                    tooltipScope.isDrillable = function(dimension) {
                        return ChartDrillUtils.isDrillable(dimension[0]);
                    };
                    tooltipScope.exclude = function() {
                        var dimensions = [], bins = [];
                        if (chartDef.genericDimension1.length) {
                            dimensions.push(chartDef.genericDimension1[0]);
                            bins.push(chartData.getAxisLabels('color')[tooltipState.coords.color]);
                        }
                        if (chartDef.genericDimension0.length) {
                            dimensions.push(chartDef.genericDimension0[0]);
                            if (chartDef.type === 'pie') {
                                bins.push(chartData.getAxisLabels('color')[tooltipState.coords.color]);
                            } else if (chartDef.type === 'stacked_bars') {
                                bins.push(chartData.getAxisLabels('y')[tooltipState.coords.y]);
                            } else {
                                bins.push(chartData.getAxisLabels('x')[tooltipState.coords.x]);
                            }
                        }
                        if (chartDef.xDimension.length) {
                            dimensions.push(chartDef.xDimension[0]);
                            bins.push(chartData.getAxisLabels('x')[tooltipState.coords.x]);
                        }
                        if (chartDef.yDimension.length) {
                            dimensions.push(chartDef.yDimension[0]);
                            bins.push(chartData.getAxisLabels('y')[tooltipState.coords.y]);
                        }
                        if (chartDef.groupDimension.length) {
                            dimensions.push(chartDef.groupDimension[0]);
                            bins.push(chartData.getAxisLabels('group')[tooltipState.coords.group]);
                        }
                        if (chartDef.facetDimension.length) {
                            dimensions.push(chartDef.facetDimension[0]);
                            bins.push(chartData.getAxisLabels('facet')[f]);
                        }
                        if (chartDef.animationDimension.length) {
                            dimensions.push(chartDef.animationDimension[0]);
                            bins.push(chartData.getAxisLabels('animation')[tooltipState.coords.animation]);
                        }
                        ChartDrillUtils.excludeND(chartDef, dimensions, bins);
                    };

                    tooltipScopes[f] = tooltipScope;

                    $compile($tooltip)(tooltipScope);

                    if (divWidth == undefined) {
                        divWidth = $div.width();
                        divHeight = $div.height();
                    }
                });
            });

            var timeout;

            var ret = {
                /**
                 * Show the tooltip for the given measure/coords
                 * @param {number} measure : measure idx to show data for
                 * @param {array} coords : coords to show data for
                 * @param event : mousemove event
                 * @param color : tooltip color
                 */
                showForCoords: function(measure, coords, event, color) {
                    if (ret.fixed) return;

                    coords.animation = chartHandler.animation.currentFrame;

                    $rootScope.$apply(function() {
                        tooltipState.measure = measure;
                        tooltipState.coords = coords;
                        tooltipState.color = color;
                        tooltipState.shown = true;

                        if (!chartDef.multiTooltips) {
                            tooltipScopes[coords.facet || 0].shown = true;
                        }
                    });

                    timeout = $timeout(function() {

                        var tooltipHeight = $tooltip.height(),
                            left = 'auto',
                            right = 'auto',
                            top = 0;

                        var wrapperOffset = $(event.target).closest('div.chart-wrapper').offset();
                        if (!wrapperOffset) {
                            // can happen if event.target has been detached right after hover and is not a child of .chart-wrapper anymore (in pivot fattable)
                            return;
                        }

                        var offsetX = event.pageX - wrapperOffset.left;
                        var offsetY = event.pageY - wrapperOffset.top;

                        if (offsetX < divWidth/2) {
                            left = (offsetX + 10) + 'px';
                        } else {
                            right = (divWidth - offsetX + 10) + 'px';
                        }

                        top = Math.max(0, Math.min(divHeight - tooltipHeight - 20, offsetY - tooltipHeight/2)) + 'px';

                        $rootScope.$apply(function() {
                            tooltipState.left = left;
                            tooltipState.right = right;
                            tooltipState.top = top;
                            tooltipState.shown = true;

                            if (!chartDef.multiTooltips) {
                                tooltipScopes[coords.facet || 0].shown = true;
                            }
                        });
                    });
                },


                /**
                 * Hide the tooltip
                 */
                hide: function() {
                    if (timeout) {
                        $timeout.cancel(timeout);
                        timeout = null;
                    }

                    if (tooltipState.persistent) return;

                    $rootScope.$apply(function() {
                        if (!chartDef.multiTooltips) {
                            angular.forEach(tooltipScopes, function (tooltipScope) {
                                tooltipScope.shown = false;
                            });
                        }
                        tooltipState.shown = false;
                    });

                    $rootScope.$apply();
                },


                /**
                 * Fix the tooltip (won't follow mouse anymore and won't auto-hide)
                 */
                fix: function() {
                    if (ret.fixed) {
                        ret.unfix();
                        ret.resetColors();
                    } else {
                        $rootScope.$apply(function() {
                            ret.fixed = true;
                            tooltipState.persistent = true;
                        });
                    }
                },


                /**
                 * Unfix the tooltip
                 */
                unfix: function() {
                    if (!ret.fixed) {
                        return ret.hide();
                    }
                    $rootScope.$apply(function() {
                        ret.fixed = false;
                        tooltipState.shown = false;
                        tooltipState.persistent = false;
                        if (!chartDef.multiTooltips) {
                            angular.forEach(tooltipScopes, function(tooltipScope) {
                                tooltipScope.shown = false;
                            });
                        }
                    });
                },


                /**
                 * Update the tooltipState's animation frame
                 * @param {number} frameIdx: animation coordinate
                 */
                setAnimationFrame: function(frameIdx) {
                    if (tooltipState.coords) {
                        tooltipState.coords.animation = frameIdx;
                    }
                },


                /**
                 * Register an element for his color coord and add handlers to show tooltip on mousemove
                 * @param {DOMElement} el
                 * @param {array} coords: coords dict of this element
                 * @param {string} colorAttr: the color attribute to control the element (usually 'fill' or 'stroke')
                 * @param {boolean} noTooltip: only register the element for color change but don't add tooltip handlers
                 */
                registerEl: function(el, coords, colorAttr, noTooltip) {
                    if (chartHandler.noTooltips) return;

                    el._colorAttr = colorAttr;
                    var c = coords.color + coords.measure;
                    if (colorAttr) {
                        chartHandler.legends[0].items[c].elements[0].push(el);
                    }

                    d3.select(el)
                        .attr('tooltip-el', true)
                        .on('mousemove', function() {
                            if (!noTooltip) {
                                ret.showForCoords(coords.measure, coords, d3.event, chartHandler.legends[0].items[c].rgbaColor || chartHandler.legends[0].items[c].color);
                            }
                        })
                        .on('mouseleave', function() {
                            if (!ret.fixed) {
                                if (!noTooltip) {
                                    ret.hide();
                                }
                                if (colorAttr) {
                                    ret.resetColors();
                                }
                            }
                        })
                        .on('click', function() {
                            if (!noTooltip) {
                                ret.fix();
                            }
                        })
                        .on('mouseenter', function() {
                            if (colorAttr && !ret.fixed) {
                                ret.focusColor(c);
                            }
                        });
                },

                unregisterEl: function(el) {
                    d3.select(el)
                        .on('mousemove', null)
                        .on('mouseleave', null)
                        .on('click', null)
                        .on('mouseenter', null);
                },

                /**
                 * Add tooltip handlers to an element
                 * @param el
                 * @param coords
                 * @param color
                 */
                addTooltipHandlers: function(el, coords, color) {
                    if (chartHandler.noTooltips) return;

                    d3.select(el)
                        .attr('tooltip-el', true)
                        .on('mousemove.tooltip', function() {
                            ret.showForCoords(-1, coords, d3.event, color);
                        })
                        .on('mouseleave.tooltip', ret.hide)
                        .on('click', ret.fix);
                },


                /**
                 * Remove tooltip handlers from an element
                 * @param el
                 */
                removeTooltipsHandlers: function(el) {
                    d3.select(el)
                        .on('mousemove.tooltip', null)
                        .on('mouseleave.tooltip', null)
                        .on('click', null);
                },


                /**
                 * Focus on the given color coordinates (ie desaturate all other colors)
                 * @param {number} c: the color coordinate
                 */
                focusColor: function(c) {
                    chartHandler.legends[0].items.forEach(function(item, i) {
                        if (i != c && item.elements) {
                            item.elements.each(function() {
                                d3.select(this).transition(300).attr(this._colorAttr, item.desaturatedColor);
                            });
                        }
                    });
                },


                /**
                 * Unfocus everything
                 */
                resetColors: function() {
                    if (chartHandler.legends[0] && chartHandler.legends[0].items) {
                        chartHandler.legends[0].items.forEach(function(item) {
                            if (item.elements) {
                                item.elements.each(function() {
                                    d3.select(this).transition(300).attr(this._colorAttr, item.color);
                                });
                            }
                        });
                    }
                }
            };

            return ret;
        },
    };
}

function ChartDrillUtils(ChartDimension, LoggerProvider){

    function makeExplicitFilterCond(dim, bin) {
        var cond = {
            columnType : dim.type,
            column :  dim.column
        };

        switch (dim.type){
        case "ALPHANUM":
            // TODO: not a label ...
            cond.singleValue = bin.label;
            break;
        case "NUMERICAL":
        	if (dim.numParams && dim.numParams.mode == 'TREAT_AS_ALPHANUM') {
        		cond.columnType = "ALPHANUM";
                cond.singleValue = bin.label;
        	} else if (dim.numParams && dim.numParams.mode === 'NONE') {
        	    cond.minValue = bin.sortValue;
        	    cond.maxValue = bin.sortValue;
        	} else {
        		cond.minValue = bin.min;
        		cond.maxValue = bin.max;
        	}
            break;
        case "DATE":
            // TODO: assert this
            cond.dateFilterType = "RANGE";
            cond.minValue = bin.min;
            cond.maxValue = bin.max;
            break;
        default:
            throw new Error("unimplemented");
        }
        return cond;
    }

    var Logger = LoggerProvider.getLogger('charts');
    var svc = {
        
        isExcludable : function(dim, type, variant) {
            // For the moment, we do not support these
            if (dim.type == "DATE" && !ChartDimension.isTimelineable(dim)) {
                return false;
            }
            if (ChartDimension.isUnbinnedNumerical(dim)) {
                return false;
            }
            if ( type == 'boxplots' || variant == 'binned_xy_hex' ) {
            	return false;
            }
            return true;
        },
        isDrillable : function(dim) {
            const isAutomatic = ChartDimension.isAutomatic(dim);

            return !isAutomatic && ((ChartDimension.isTimelineable(dim) && dim.dateParams.mode != "HOUR") ||
                ChartDimension.isBinnedNumerical(dim));
        },

        drill : function(chartDef, dim, bin) {
            Logger.info("Drilling on", dim, bin);

            if (dim.type == "DATE") {
                var filter = svc.findDateTimelineFilter(chartDef, dim);
                if (filter == null) {
                    filter = {
                        columnType : dim.type,
                        column :  dim.column,
                        dateFilterType : "RANGE"
                    }
                    chartDef.filters.push(filter);
                }

                filter.minValue = bin.min;
                filter.maxValue = bin.max;

                dim.dateParams.mode = svc.nextDateRange(dim.dateParams.mode);
            } else if (dim.type == "NUMERICAL") {
                var filter = svc.findNumericalFacetFilter(chartDef, dim);
                if (filter == null) {
                    filter = {
                        columnType : dim.type,
                        column :  dim.column,
                    }
                    chartDef.filters.push(filter);
                }
                filter.minValue = bin.min;
                filter.maxValue = bin.max;
            } else{
                throw new Error("unimplemented drill on " + JSON.json(dim));
            }
            filter.filterType = filter.columnType + "_FACET";
        },

        nextDateRange : function(dateRange) {
            switch (dateRange) {
                case "YEAR":
                case "QUARTER":
                    return "MONTH";
                case "MONTH":
                case "WEEK":
                    return "DAY";
                case "DAY":
                    return "HOUR";
                case "HOUR":
                    return "MINUTE"
            }
        },

        findDateFilter : function(chartDef, dim) {
            var col = dim.column;
            return Array.dkuFindFn(chartDef.filters, function(filter) {
                return filter.column == col;
            });
        },

        findDateTimelineFilter : function(chartDef, dim){
            var col = dim.column;
            return Array.dkuFindFn(chartDef.filters, function(filter) {
                return filter.column == col && filter.dateFilterType == "RANGE";
            });
        },

        findNumericalFacetFilter : function(chartDef, dim){
            var col = dim.column;
            return Array.dkuFindFn(chartDef.filters, function(filter) {
                return filter.column == col;
            });
        },
        excludeND :function(chartDef, dimensions, bins) {
            var filter = {
                filterType : "EXPLICIT",
                explicitExclude : true,
                isA : "filter",
                explicitConditions : [],
                column : "NOT "
            };

            for (var i = 0; i < dimensions.length; i++) {
                if (i > 0) {
                    filter.column += " - ";
                }
                filter.column += dimensions[i].column + ": " + bins[i].label;

                filter.explicitConditions.push(makeExplicitFilterCond(dimensions[i], bins[i]));
            }

            chartDef.filters.push(filter);
        },
        exclude2D :function(chartDef, dim0, dim0Bin, dim1, dim1Bin) {
            var filter = {
                filterType : "EXPLICIT",
                explicitExclude : true,
                isA : "filter",
                explicitConditions : [],
                column : "NOT " + dim0.column + ": " + dim0Bin.label + " - " + dim1.column + ": " + dim1Bin.label
            }

            filter.explicitConditions.push(makeExplicitFilterCond(dim0, dim0Bin));
            filter.explicitConditions.push(makeExplicitFilterCond(dim1, dim1Bin));
            chartDef.filters.push(filter);
        },
        exclude1D :function(chartDef, dim, dimBin) {
            var filter = {
                filterType : "EXPLICIT",
                explicitExclude : true,
                isA : "filter",
                explicitConditions : [],
                column : "NOT " + dim.column + ": " + dimBin.label
            }

            filter.explicitConditions.push(makeExplicitFilterCond(dim, dimBin));
            chartDef.filters.push(filter);
        },
        facetOnDim : function(chartDef, dim){
            chartDef.filters.push({
                columnType : dim.type,
                filterType : dim.type + "_FACET",
                column : dim.column
            });
        }
    }
    return svc;
}


/**
 * Older tooltip service, now only used in boxplots.js and graph.js
 */
function ChartTooltipsUtils(LoggerProvider, $q, $templateCache, $http, $timeout, $compile, ChartViewCommon, ChartDrillUtils, NumberFormatter) {
    var globalTooltipId = 0;
    var Logger = LoggerProvider.getLogger('charts');
    var svc = {
        /**
         * Returns a promise to [tooltip (as D3 sel), tooltipScope]
         */

        create : function(parentScope, type, chart) {
            var deferred = $q.defer();
            var tooltipScope, tooltip;
            var location = "/templates/simple_report/tooltips/" + type + ".html"
            $q.when($templateCache.get(location) || $http.get(location, {cache: true})).then(function (template) {

                if (parentScope.noTooltips) {
                    // return fake tooltip scope with marker
                    deferred.resolve([null, {'$apply': function(){}, 'noTooltips': true, 'noClickableTooltips': parentScope.noClickableTooltips}]);
                    return;
                }

                if(angular.isArray(template)) {
                    template = template[1];
                } else if(angular.isObject(template)) {
                    template = template.data;
                }
                globalTooltipId++;

                var newDOMElt = $(template);
                newDOMElt.addClass("ng-cloak");

                newDOMElt.attr("g-tooltip-id", globalTooltipId);

                $("body").append(newDOMElt);

                Logger.info("Create tooltip: " + globalTooltipId + ", now have in DOM: "+ $("[g-tooltip-id]").length);

                tooltip = d3.selectAll(newDOMElt.toArray());
                tooltip.style("top", 0).style("left", "-50%");

                $timeout(function(){
                    $compile(newDOMElt)(parentScope);
                    tooltipScope = angular.element(newDOMElt).scope();

                    tooltipScope.$on("$destroy", function(){
                        Logger.info("Destroying tooltip: " + tooltip.attr("g-tooltip-id"));
                        tooltip.remove();
                    });
                    deferred.resolve([tooltip, tooltipScope]);
                });

                tooltip.on("mouseenter", function(){
                    tooltipScope.mouseOnTooltip = true;
                    tooltipScope.$apply();
                }).on("mouseleave", function(){
                    tooltipScope.mouseOnTooltip = false;
                    if (!tooltipScope.mouseOnElement) {
                        ChartViewCommon.tooltipDisappear(tooltip);
                    }
                    tooltipScope.$apply();
                });

                svc.flagTooltipAndRemoveOrphans(chart, tooltip);

            });
            return deferred.promise;
        },

        createWithStdAggr1DBehaviour : function(parentScope, type, chart) {
            return svc.create(parentScope, type, chart).then(function(x){
                var tooltipScope = x[1];

                if (!tooltipScope.noTooltips) {
                    tooltipScope.facetOnAxis = function(){
                        var chartDef = tooltipScope.chart.def;
                        ChartDrillUtils.facetOnDim(chartDef, chartDef.boxplotBreakdownDim[0]);
                    };
                    tooltipScope.drillOnAxis = function() {
                        var chartDef = tooltipScope.chart.def;
                        ChartDrillUtils.drill(chartDef,
                            chartDef.boxplotBreakdownDim[0], tooltipScope.dimsData[0].bin);
                    };
                    tooltipScope.excludeCurrent = function(){
                        var chartDef = tooltipScope.chart.def;
                        ChartDrillUtils.exclude1D(chartDef,
                            chartDef.boxplotBreakdownDim[0],
                            tooltipScope.dimsData[0].bin);
                    };
                }
                return x;
            })
        },
        appear : function(tooltip, color, event, element, xOffset){
            if (!tooltip) return;

            //initializing tooltip position values to top left of cursor
            var tooltipX = event.pageX + 3 + (xOffset ? xOffset : 0);
            var tooltipY = event.pageY - 28;
            //checking wether there is some better positionning
            var eventSvgX = event.pageX - $(element).offset().left;
            var eventSvgY = event.pageY - $(element).offset().top;
            if (eventSvgX > $(element).outerWidth() / 2) {
                tooltipX = event.pageX - tooltip.node().getBoundingClientRect().width - 3 - (xOffset ? xOffset : 0);
            }
            if (eventSvgY > $(element).outerHeight() / 2) {
                tooltipY = event.pageY - tooltip.node().getBoundingClientRect().height + 28;
            }
            // Border is not transitionable
            tooltip.transition().duration(300)
                .style("opacity", 1)
                .style("left", (tooltipX) + "px")
                .style("top", (tooltipY) + "px");
            tooltip.style("pointer-events", "none");
            return tooltip;
        },

        handleMouseOverElement : function(tooltipScope){
            if (!tooltipScope || tooltipScope.noTooltips) return;
            tooltipScope.mouseOnElement = true;
            tooltipScope.tooltipIsPersistent = false;
        },
        handleMouseOutElement : function(tooltip, tooltipScope, digestInProgress) {
            if (tooltipScope.noTooltips) return;
            tooltipScope.mouseOnElement = false;
            if (!tooltipScope.tooltipIsPersistent) {
                ChartViewCommon.tooltipDisappear(tooltip);
            } else {
                $timeout(function(){
                    if (!tooltipScope.mouseOnTooltip) {
                        ChartViewCommon.tooltipDisappear(tooltip);
                        tooltipScope.tooltipIsPersistent = false;
                        if (!digestInProgress) {
                            tooltipScope.$apply();
                        }
                    }
                }, 150);
            }
            if (!digestInProgress) {
                tooltipScope.$apply();
            }
        },
        handleClickElement : function(tooltip, tooltipScope) {
            if (tooltipScope.noTooltips) return;
            if (tooltipScope.noClickableTooltips) return;
            if (tooltipScope.tooltipIsPersistent){
                 tooltip.style("pointer-events", "none");
                //ChartViewCommon.tooltipDisappear(tooltip);
            } else {
                tooltip.style("pointer-events", "auto");
            }
            tooltipScope.tooltipIsPersistent = !tooltipScope.tooltipIsPersistent;
            tooltipScope.$apply();
        },
        setBoxplotData : function(tooltipScope, chartDef, boxplot) {
            if (tooltipScope.noTooltips) return;
            tooltipScope.dimsData = [{
                label: tooltipScope.dimensionLabel(chartDef.boxplotBreakdownDim[0]),
                value: boxplot.label,
                bin: {}
            }];

            var formatter = ChartViewCommon.getMeasuresFormatter(chartDef, true);

            tooltipScope.recordsCount = boxplot.nbVAlid;

            tooltipScope.tooltipMeasuresData = [];
            tooltipScope.tooltipMeasuresData.push({label : 'Mean',valF : formatter(boxplot.mean)});
            tooltipScope.tooltipMeasuresData.push({label : 'Std. dev.',valF : formatter(boxplot.stddev)});
            tooltipScope.tooltipMeasuresData.push({label : 'Min',valF : formatter(boxplot.min)});
            tooltipScope.tooltipMeasuresData.push({label : '1st quartile',valF : formatter(boxplot.pc25)});
            tooltipScope.tooltipMeasuresData.push({label : 'Median',valF : formatter(boxplot.median)});
            tooltipScope.tooltipMeasuresData.push({label : '3rd quartile',valF : formatter(boxplot.pc75)});
            tooltipScope.tooltipMeasuresData.push({label : 'Max',valF : formatter(boxplot.max)});

            tooltipScope.isDrillable = ChartDrillUtils.isDrillable(chartDef.boxplotBreakdownDim[0]);
            tooltipScope.isExcludable = ChartDrillUtils.isExcludable(chartDef.boxplotBreakdownDim[0], chartDef.type, chartDef.variant);
        },
        flagTooltipAndRemoveOrphans : function(chart, tooltip) {
        	var flagChartAndTooltipTogether = function(chart, tooltip) {
            	var id = Date.now();
            	$(chart).parents('.pivot-chart').attr('data-tooltip-id', id);
            	tooltip.attr('data-tooltip-id', id);
            };

        	var removeOrphanTooltips = function() {
            	$('.chart-tooltip').each(function(index, element) {
            		var id = $(element).data('tooltipId');
            		if ($('.pivot-chart[data-tooltip-id="'+ id +'"]').length <= 0) {
            			$(element).remove();
            		}
            	});
            };

        	flagChartAndTooltipTogether(chart, tooltip);
        	removeOrphanTooltips();
        }
    };
    return svc;
}


})();

(function(){
    'use strict';

    angular.module('dataiku.charts')
        .factory('AnimatedChartsUtils', AnimatedChartsUtils)
        .directive('animatedChartSlider', animatedChartSlider);


    function AnimatedChartsUtils($interval) {
        var unwatchers = {}, intervals = {};

        return {
            /**
             * Setup chartHandler.animation (used by the animation widget) for the given chart
             * @param {$scope} chartHandler
             * @param {ChartTensorDataWrapper} chartData
             * @param {ChartDef} chartDef
             * @param {function} drawFrame: drawing callback
             */
            initAnimation: function(chartHandler, chartData, chartDef, drawFrame) {
                if (unwatchers[chartHandler.$id]) {
                    unwatchers[chartHandler.$id]();
                    delete unwatchers[chartHandler.$id];
                }

                if (intervals[chartHandler.$id]) {
                    $interval.cancel(intervals[chartHandler.$id]);
                    delete intervals[chartHandler.$id];
                }

                var animation = chartHandler.animation;

                animation.labelify = function(label) {
                    return label == '___dku_no_value___' ? 'No value' : label;
                };
                animation.labels = chartData.getAxisLabels('animation');

                animation.playing = false;
                if (animation.currentFrame > animation.labels.length) {
                    animation.currentFrame = 0;
                }

                animation.drawFrame = function(frameIdx) {
                    animation.currentFrame = frameIdx;
                };
                animation.chartData = chartData;

                animation.hasNext = function() {
                    return animation.currentFrame < animation.labels.length - 1;
                };

                animation.play = function () {
                    if (animation.playing) {
                        return;
                    }

                    if (animation.currentFrame === animation.labels.length-1) {
                        animation.currentFrame = 0;
                    }
                    animation.playing = true;
                    intervals[chartHandler.$id] = $interval(function() {
                        animation.drawFrame((animation.currentFrame+1)%animation.labels.length);
                        if (!chartDef.animationRepeat && !animation.hasNext()) {
                            animation.pause();
                        }
                    }, (chartDef.animationFrameDuration || 3000));
                };

                animation.dimension = chartDef.animationDimension[0];

                animation.pause = function () {
                    animation.playing = false;
                    $interval.cancel(intervals[chartHandler.$id]);
                };

                animation.drawFram = drawFrame;

                unwatchers[chartHandler.$id] = chartHandler.$watch("animation.currentFrame", function(nv) {
                    if (nv == null) return;
                    drawFrame(nv);
                });

                chartHandler.$watch("chart.def.animationFrameDuration", function(nv) {
                   if (!nv) return;
                   if (animation.playing) {
                       animation.pause();
                       animation.play();
                   }
                });
            }
        };
    }


    function animatedChartSlider(ChartDimension, ChartUADimension) {
        return {
            scope: {
                labels: '=',
                currentFrame: '=',
                dimension: '='
            },
            template: '<div class="horizontal-flex animated-chart-slider" style="align-items: center;">'
                        + '<div class="noflex">{{firstValue}}</div>'
                        + '<div class="progress flex">'
                        +   '<div class="current" style="left:{{cursorLeft}}%; width: {{cursorWidth}}%;" ng-mousedown="startSliding($event)" ng-mouseup="stopSliding()"></div>'
                        + '</div>'
                        + '<div class="noflex">{{lastValue}}</div>'
                    + '</div>',
            link: function($scope, $el) {

                var labelPositions;

                var findClosestIdx = function (x, arr) {
                    var indexArr = arr.map(function(k) { return Math.abs(k.center - x) });
                    var min = Math.min.apply(Math, indexArr);
                    return indexArr.indexOf(min);
                };

                $scope.$watch('labels', function(nv) {
                    if (!nv) return;

                    if (ChartDimension.isUnbinnedNumerical($scope.dimension)) {
                        $scope.firstValue = $scope.labels[0].sortValue;
                        $scope.lastValue = $scope.labels[$scope.labels.length-1].sortValue;
                        var scale = d3.scale.linear()
                            .domain([$scope.labels[0].sortValue, $scope.labels[$scope.labels.length-1].sortValue])
                            .range([0, 100]);
                        labelPositions = $scope.labels.map(function(label) {
                            return {
                                center: scale(label.sortValue),
                                start: scale(label.sortValue)-1,
                                width: 2
                            };
                        });
                    } else if (ChartDimension.isBinnedNumerical($scope.dimension)) {
                        $scope.firstValue = $scope.labels[0].min;
                        $scope.lastValue = $scope.labels[$scope.labels.length-1].max;
                        var linearScale = d3.scale.linear()
                            .domain([$scope.labels[0].min, $scope.labels[$scope.labels.length-1].max])
                            .range([0, 100]);
                        labelPositions = $scope.labels.map(function(label) {
                            return {
                                center: linearScale(label.sortValue),
                                start: linearScale(label.min),
                                width: linearScale(label.max) - linearScale(label.min)
                            };
                        });
                    } else if (ChartDimension.isAlphanumLike($scope.dimension) || ChartUADimension.isDiscreteDate($scope.dimension)) {
                        $scope.firstValue = null;
                        $scope.lastValue = null;
                        var ordinalScale = d3.scale.ordinal()
                            .domain($scope.labels.map(function(d,i) { return i; }))
                            .rangeBands([0, 100]);

                        labelPositions = $scope.labels.map(function(label, i) {
                            return {
                                start: ordinalScale(i),
                                width: ordinalScale.rangeBand(),
                                center: ordinalScale(i) + ordinalScale.rangeBand()/2
                            };
                        });
                    }

                    if ($scope.currentFrame !== null) {
                        $scope.cursorLeft = labelPositions[$scope.currentFrame].start;
                        $scope.cursorWidth = labelPositions[$scope.currentFrame].width;
                    }
                });

                var slideCursor = function($evt) {
                    $evt.preventDefault(); // useful to avoid selecting content while sliding
                    var sliderPosition = $el.offset().left;
                    var xPosition = ($evt.pageX - sliderPosition)/$el.width()*100;
                    $scope.$apply(function() {
                        $scope.currentFrame = findClosestIdx(xPosition, labelPositions);
                    });
                };

                $scope.startSliding = function($evt) {
                    $scope.sliding = true;
                    $(window).on('mouseup.chart-animation.' + $scope.$id, $scope.stopSliding);
                    $(window).on('mousemove.chart-animation' + $scope.$id, slideCursor);
                    $('body').css('cursor', 'move');
                };

                $scope.stopSliding = function() {
                    $scope.sliding = false;
                    $(window).off('mouseup.chart-animation.' + $scope.$id);
                    $(window).off('mousemove.chart-animation' + $scope.$id);
                    $('body').css('cursor', 'auto');
                };

                $scope.$watch('currentFrame', function(nv) {
                    if (nv == null) return;
                    $scope.cursorLeft = labelPositions[nv].start;
                    $scope.cursorWidth = labelPositions[nv].width;
                });
            }
        }
    }

})();
(function() {
    'use strict';

    angular.module('dataiku.charts')
        .service("ChartColorScales", ChartColorScales)
        .service("ChartColorUtils", ChartColorUtils)
        .controller("EditCustomPaletteModalController", EditCustomPaletteModalController)
        .directive("palettePickerLogic", palettePickerLogic);

    /**
     * Colors scales creation logic
     */
    function ChartColorScales(ChartUtils, ChartUADimension, ChartDataUtils, StringNormalizer, ChartColorUtils) {

        var svc = {

            /**
             * Create a color scale
             * @param {ChartTensorDataWrapper} chartData
             * @param {ChartDef.java} chartDef
             * @param {AxisSpec} colorSpec
             * @param {$scope} chartHandler
             * @return {*}
             */
            createColorScale: function(chartData, chartDef, colorSpec, chartHandler) {
                if (!colorSpec) return null;

                var colorScale;
                switch (colorSpec.type) {
                    case 'DIMENSION':
                        colorScale = svc.discreteColorScale(chartDef, colorSpec.withRgba, ChartUtils.getColorMeaningInfo(colorSpec.dimension, chartHandler), chartData.getAxisLabels(colorSpec.name));
                        if (colorScale.domain) {
                            if (chartData.axesDef[colorSpec.name] != undefined) {
                                colorScale.domain(chartData.getAxisLabels(colorSpec.name).map(function(d,i) { return i; }));
                            } else {
                                colorScale.domain(chartDef.genericMeasures.map(function(d,i) { return i; }));
                            }
                        }
                        break;
                    case 'MEASURE':
                        if (!colorSpec.domain) {
                            if (colorSpec.measureIdx === undefined || colorSpec.measureIdx < 0) {
                                return null;
                            }
                            colorSpec.domain = ChartDataUtils.getMeasureExtent(chartData.data, colorSpec.measureIdx, true);
                        }

                        if (!colorSpec.values) {
                            if (colorSpec.measureIdx === undefined || colorSpec.measureIdx < 0) {
                                return null;
                            }
                            colorSpec.values = ChartDataUtils.getMeasureValues(chartData.data, colorSpec.measureIdx);
                        }

                        colorScale = svc.continuousColorScale(chartDef, colorSpec.domain[0], colorSpec.domain[1], colorSpec.values, !colorSpec.withRgba);
                        break;
                    case 'UNAGGREGATED':
                        if (!colorSpec.dimension) {
                            return null;
                        }
                        var extent = ChartDataUtils.getUnaggregatedAxisExtent(colorSpec.dimension, colorSpec.data, chartData.data.afterFilterRecords);
                        if (ChartUADimension.isTrueNumerical(colorSpec.dimension) || ChartUADimension.isDateRange(colorSpec.dimension)) {
                            colorScale = svc.continuousColorScale(chartDef, extent.min, extent.max, extent.values, !colorSpec.withRgba);
                            colorScale.isContinuous = true;
                        } else {
                            colorScale = svc.discreteColorScale(chartDef, colorSpec.withRgba, ChartUtils.getColorMeaningInfo(colorSpec.dimension, chartHandler), colorSpec.data.str.sortedMapping);
                            if (colorScale.domain) {
                                colorScale.domain(extent.values.map((v, i) => i));
                            }
                        }
                        break;
                    default:
                        throw new Error("Unknown scale type: " + colorSpec.type);
                }

                if (colorScale) {
                    colorScale.type = colorSpec.type;
                }

                return colorScale;
            },


            /**
             * Create a continuous color scale
             * @param {ChartDef.java} chartDef
             * @param {number} domainMin
             * @param {number} domainMax
             * @param {array} domainValues: values in the domain (not uniques, this is used to compute quantiles)
             * @param {boolean} noRgba: do not include the opacity setting in the color scale
             * @return {*}
             */
            continuousColorScale: function (chartDef, domainMin, domainMax, domainValues, noRgba) {

                var paletteList = chartDef.colorOptions.paletteType === 'DIVERGING' ? dkuColorPalettes.diverging : dkuColorPalettes.continuous;
                var p;

                if (chartDef.colorOptions.colorPalette === '__dku_custom__') {
                    p = chartDef.colorOptions.customPalette;
                } else {
                    p = paletteList.find(p => p.id === chartDef.colorOptions.colorPalette);

                    if (!p) {
                        chartDef.colorOptions.colorPalette = 'default';
                        p = paletteList.find(p => p.id === 'default');
                    }
                }

                // Custom interpolation function to take care of transparency
                function d3_interpolateRgbRound(a, b) {
                    var transparency = !isNaN(chartDef.colorOptions.transparency) ? chartDef.colorOptions.transparency : 1;
                    a = d3.rgb(a);
                    b = d3.rgb(b);
                    var ar = a.r,
                        ag = a.g,
                        ab = a.b,
                        br = b.r - ar,
                        bg = b.g - ag,
                        bb = b.b - ab;
                    return function (t) {
                        var tr = Math.round(ar + br * t);
                        var tg = Math.round(ag + bg * t);
                        var tb = Math.round(ab + bb * t);
                        if (!noRgba) {
                            return ["rgba(", tr, ",", tg, ",", tb, ",", transparency, ")"].join("");
                        } else {
                            return ["rgb(", tr, ",", tg, ",", tb, ")"].join("");
                        }
                    };
                }

                if (p.d3Scale) {
                    return p.d3Scale;
                }

                var innerScale;

                if (chartDef.colorOptions.quantizationMode !== 'QUANTILES') {
                    // We use an innerScale to implement the scale computation mode (linear, log, square, sqrt),
                    // that maps the values to a [0, 1] range that will be the input of the actual color scale

                    if (chartDef.colorOptions.ccScaleMode == "LOG") {
                        innerScale = d3.scale.log();
                        domainMin++;
                        domainMax++;
                        innerScale.mode = 'LOG';
                    } else if (chartDef.colorOptions.ccScaleMode == "SQRT") {
                        innerScale = d3.scale.sqrt();
                        innerScale.mode = 'SQRT';
                    } else if (chartDef.colorOptions.ccScaleMode == "SQUARE") {
                        innerScale = d3.scale.pow().exponent(2);
                        innerScale.mode = 'SQUARE';
                    } else {
                        innerScale = d3.scale.linear();
                        innerScale.mode = 'LINEAR';
                    }
                } else {
                    // No compute mode for quantiles quantization
                    innerScale = d3.scale.linear();
                    innerScale.mode = 'LINEAR';
                }

                switch (chartDef.colorOptions.paletteType) {
                    case 'DIVERGING':
                        var mid = chartDef.colorOptions.paletteMiddleValue || 0;
                        if (Math.abs(domainMax - mid) > Math.abs(domainMin - mid)) {
                            innerScale.domain([mid, domainMax]).range([0.5, 1]);
                        } else {
                            innerScale.domain([domainMin, mid]).range([0, 0.5]);
                        }
                        break;
                    case 'CONTINUOUS':
                    default:
                        if (p.fixedValues) {
                            var domain = [], range = [];
                            p.values.forEach(function(value, i) {
                                if (i > p.colors.length -1) {
                                    return;
                                }
                                if (value == null) {
                                    if (i == 0) {
                                        domain.push(domainMin);
                                        range.push(0);
                                    } else if (i == p.colors.length -1) {
                                        domain.push(domainMax);
                                        range.push(1);
                                    }
                                } else {
                                    domain.push(value);
                                    range.push(i/(p.colors.length-1));
                                }
                            });
                            innerScale.domain(domain).range(range);
                        } else {
                            innerScale.domain([domainMin, domainMax]).range([0, 1]);
                        }
                        break;
                }

                var outerScale;

                switch (chartDef.colorOptions.quantizationMode) {
                    case 'LINEAR':
                    case 'QUANTILES':
                        // Find step colors
                        var numSteps = chartDef.colorOptions.numQuantizeSteps;
                        var colors = p[numSteps] || p.colors; // Palettes can define special colors for a given number of steps (i.e. colorbrewer palettes)
                        var numColors = colors.length;

                        var linearScale = d3.scale.linear()
                            .domain(Array(numColors).fill().map(function(d,i) { return i/(numColors-1); }))
                            .range(colors)
                            .interpolate(d3_interpolateRgbRound);
                        var steps = Array(numSteps).fill().map(function(d, i) { return linearScale(i/(numSteps-1)); });

                        if (chartDef.colorOptions.quantizationMode === 'LINEAR') {
                            outerScale = d3.scale.quantize().domain([0, 1]).range(steps);
                        } else {
                            outerScale = d3.scale.quantile().domain(domainValues.map(innerScale)).range(steps);
                        }
                        break;

                    case 'NONE':
                    default:
                        outerScale = d3.scale.linear()
                            .domain(Array(p.colors.length).fill().map(function(d,i) { return i/(p.colors.length-1); }))
                            .range(p.colors)
                            .interpolate(d3_interpolateRgbRound);
                        break;

                }

                var ret = function(d) {
                    return outerScale(innerScale(d));
                };

                ret.outerScale = outerScale;
                ret.innerScale = innerScale;
                ret.quantizationMode = chartDef.colorOptions.quantizationMode;
                ret.diverging = chartDef.colorOptions.paletteType === 'DIVERGING';

                return ret;
            },

            /**
             * Create a discrete color scale
             * @param {ChartDef.java} chartDef
             * @param {boolean} withRgba
             * @param meaningInfo
             * @param colorLabels
             * @return {*}
             */
            discreteColorScale: function (chartDef, withRgba, meaningInfo, colorLabels) {
                var colors;
                if (!chartDef.colorOptions.colorPalette) chartDef.colorOptions.colorPalette = 'default';

                var p;
                if (chartDef.colorOptions.colorPalette == "__dku_meaning__") {
                    return svc.meaningColorScale(chartDef, withRgba, meaningInfo, colorLabels);
                } else if (chartDef.colorOptions.colorPalette === "__dku_custom__") {
                    p = chartDef.colorOptions.customPalette;
                } else {
                    p = window.dkuColorPalettes.discrete.find(p => p.id === chartDef.colorOptions.colorPalette);
                }

                if (!p) {
                    chartDef.colorOptions.colorPalette = "default";
                    p = window.dkuColorPalettes.discrete.find(p => p.id === chartDef.colorOptions.colorPalette);
                }
                if (p.d3Scale) {
                    return p.d3Scale;
                } else {
                    colors = p.colors;
                    if (withRgba && chartDef.colorOptions.transparency != 1) {
                        colors = colors.map(function (x) {
                            x = d3.rgb(x);
                            return "rgba(" + x.r + "," + x.g + "," + x.b + "," + chartDef.colorOptions.transparency + ")";
                        })
                    }
                    return d3.scale.ordinal().range(colors);
                }
            },

            meaningColorScale: function(chartDef, withRgba, meaningInfo, colorLabels) {
                var normalizer = StringNormalizer.get(meaningInfo.normalizationMode);
                var ret = function(idx) {
                    // TODO fixed fallback color? defined in the chart? in the meaning?
                    if (withRgba) {
                        return ChartColorUtils.toRgba(meaningInfo.colorMap[normalizer(colorLabels[idx].label)] || "grey", chartDef.colorOptions.transparency);
                    } else {
                        return meaningInfo.colorMap[normalizer(colorLabels[idx].label)] || "grey";
                    }
                };
                ret.domain = function(){
                    return Array.from(Array(colorLabels.length).keys())
                }
                return ret;
            }
        };

        /**
         * Create samples for colorpalettes
         */
        function createSamples() {
            $.each(window.dkuColorPalettes.continuous, function (idx, p) {
                var chartSpec, scale;
                chartSpec = {colorOptions: {colorPalette: p.id, transparency: 1}};
                if (!p.sample) {
                    scale = svc.continuousColorScale(chartSpec, 0, 100);
                    p.sample = $.map([0, 20, 40, 60, 80, 100], scale);
                }
            });
            $.each(window.dkuColorPalettes.discrete, function (idx, p) {
                var chartSpec, scale;
                chartSpec = {colorOptions: {colorPalette: p.id, transparency: 1}};
                if (!p.sample) {
                    scale = svc.discreteColorScale(chartSpec);
                    p.sample = $.map([0, 1, 2, 3, 4], scale);
                }
            });
        }

        createSamples();
        return svc;
    }

    /**
     * A set of helper functions for dealing with colors
     */
    function ChartColorUtils() {
        return {
            /**
             * Desaturate a color
             * @param {string} color
             * @return {d3.rgb} color
             */
            desaturate: function (color) {
                var col = d3.rgb(color);
                var mean = (col.r + col.g + col.b) / 5;
                mean = mean - (mean - 255) * 0.8;
                return d3.rgb(mean, mean, mean);
            },

            /**
             * Make a darker color. Supports rgba in input (but drops the a)
             * @param {string} color
             * @return {d3.rgb} color
             */
            darken : function(color) {
                var match, rgbColor;
                if (match = /^rgba\(([\d]+),([\d]+),([\d]+),([\d]+|[\d]*.[\d]+)\)/.exec(color)){
                    rgbColor = d3.rgb(match[1], match[2], match[3]);
                } else {
                    rgbColor = d3.rgb(color);
                }
                return rgbColor.hsl().darker().toString();
            },

            /**
             * Add transparency to a color
             * @param {string} color
             * @param {number} transparency
             * @returns {string} rgba color
             */
            toRgba: function (color, transparency) {
                color = d3.rgb(color);
                var r = color.r,
                    g = color.g,
                    b = color.b;
                transparency = !isNaN(transparency) ? transparency : 1;
                return ["rgba(", r, ",", g, ",", b, ",", transparency, ")"].join("");
            }
        };
    }

    function EditCustomPaletteModalController($scope, DataikuAPI, $filter, $state, StateUtils, FutureProgressModal, WT1) {
        $scope.uiState = {};
        $scope.exportOptions = {};

        $scope.init = function (palette, paletteType) {
            $scope.palette = angular.copy(palette);
            $scope.paletteType = paletteType;
        };

        $scope.save = function() {
            $scope.resolveModal($scope.palette);
        };

        $scope.$watch("palette.colors", function(nv) {
            if (nv && nv.length) {
                $scope.palette.values.length = Math.max($scope.palette.values.length, nv.length);
            }
        });

        $scope.removeColor = function(idx) {
            $scope.palette.colors.splice(idx, 1);
            $scope.palette.values.splice(idx, 1);
        };

        $scope.sortableOptions = {
            axis:'y',
            cursor: 'move',
            handle: '.sort-handle',
            containment: 'div.sorting-container',
            items:'> li'
        };

        $scope.codeMirrorOptions = {
            mode:"application/javascript",
            lineNumbers:false,
            readOnly: true,
            onLoad: function(instance) {
                instance.on('focus', function() {
                    instance.execCommand("selectAll");
                });
            }
        };

        var getJsSnippet = function(type, id, name, colors, values) {
            var clippedValues;
            if (values && values.length) {
                clippedValues = values.concat();
                clippedValues.length = colors.length;
            }

            return 'dkuColorPalettes.add' + $filter('capitalize')(type.toLowerCase()) + '({'
                + '\n    "id": ' + JSON.stringify(id) + ','
                + '\n    "name": ' + JSON.stringify(name) + ','
                + '\n    "category": "Plugin palettes",'
                + '\n    "colors": ' + JSON.stringify(colors)
                + (clippedValues ? (',\n    "values": ' + JSON.stringify(clippedValues)) : '')
                + '\n});'
        };

        $scope.updateSnippet = function() {
            $scope.jsSnippet = getJsSnippet($scope.paletteType, $scope.exportOptions.paletteId, $scope.exportOptions.paletteName, $scope.palette.colors, $scope.palette.values);
        };

        $scope.prepareExport = function() {
            $scope.updateSnippet();
            $scope.uiState.exporting = true;
        };

        $scope.export = function() {
            DataikuAPI.plugindev.create($scope.exportOptions.pluginId, 'EMPTY')
                .error(setErrorInScope.bind($scope))
                .success(function (data) {
                    FutureProgressModal.show($scope, data, "Creating plugin").then(function(result){
                        if (result) {
                            WT1.event("plugin-dev-create");
                            DataikuAPI.plugindev.createContent($scope.exportOptions.pluginId, '/js', true)
                                .error(setErrorInScope.bind($scope))
                                .success(function () {
                                    DataikuAPI.plugindev.createContent($scope.exportOptions.pluginId, '/js/palette.js', false)
                                        .error(setErrorInScope.bind($scope))
                                        .success(function () {
                                            DataikuAPI.plugindev.setContent($scope.exportOptions.pluginId, '/js/palette.js', $scope.jsSnippet)
                                            .error(setErrorInScope.bind($scope))
                                            .success(function () {
                                                $scope.dismiss();
                                                StateUtils.go.pluginDefinition($scope.exportOptions.pluginId);
                                            });
                                        });
                                });
                        }
                    });
                });
        };
    }

    function palettePickerLogic(CreateModalFromTemplate, $rootScope, ChartUtils, $timeout, UDMUtils) {

        var ret = {
            restrict: 'A',
            scope: true
        };
        ret.link = function ($scope, $element, attrs) {
            $scope.container = $scope.$eval(attrs.container);
            $scope.type = attrs.type;
            attrs.$observe('type', function(val) {
                $scope.type = val;
                update();

                // Quantization mode QUANTILES is not available for DIVERGING palettes
                if ($scope.type === 'DIVERGING' && $scope.container.quantizationMode === 'QUANTILES') {
                    $scope.container.quantizationMode = 'LINEAR';
                }
                $timeout(function() { $element.find('#quantization-mode-select').selectpicker('refresh'); });
            });

            $scope.$watch("container.colorPalette", function(nv, ov) {
                if (ov && nv === '__dku_custom__' && $scope.container.customPalette.colors.length === 0) {
                    var previousPalette = getPalettesForType($scope.type).find(d => d.id === ov);
                    if (previousPalette) {
                        $scope.container.customPalette.colors = angular.copy(previousPalette.colors);
                    }
                    $scope.editCustomPalette($scope.type);
                }
            });

            function fixDivergingLogMiddleValue() {
                if ($scope.container && ($scope.container.paletteMiddleValue || 0) <= 0 && $scope.container.paletteType == 'DIVERGING' && $scope.container.ccScaleMode == 'LOG') {
                    $scope.container.paletteMiddleValue = 1;
                }
            }

            $scope.$watch("container.paletteType", fixDivergingLogMiddleValue);
            $scope.$watch("container.ccScaleMode", fixDivergingLogMiddleValue);

            var colorCol;

            $scope.editCustomPalette = function(colorPaletteType) {
                // The custom palette modal can be open from a destoyable element like a contextualMenu 
                // if so the contextScope, containing the scope of the contextualMenu, is used as modal's parent scope
                const scope = $scope.$contextScope || $scope; 
                CreateModalFromTemplate("/templates/simple_report/config/edit-custom-palette-modal.html", scope, null, function(newScope) {
                    newScope.init($scope.chart.def.colorOptions.customPalette, colorPaletteType);
                }).then(function(palette) {
                    $scope.chart.def.colorOptions.customPalette = palette;
                });
            };

            $scope.$watch(function(scope) { return ChartUtils.getColorDimension(scope.chart.def); }, function() {
                var colorDim = ChartUtils.getColorDimension($scope.chart.def);

                if (colorDim && $scope.usableColumns) {
                    colorCol = $scope.usableColumns.find(c => c.column === colorDim.column);
                } else {
                    colorCol = null;
                }

                if (colorCol && colorCol.meaningInfo) {
                    $scope.colorMeaning = {
                        id: colorCol.meaningInfo.id,
                        label: UDMUtils.getLabel(colorCol.meaningInfo.id)
                    };
                } else {
                    $scope.colorMeaning = null;
                    if ($scope.chart.def.colorOptions.colorPalette === '__dku_meaning__') {
                        $scope.chart.def.colorOptions.colorPalette = 'default';
                    }
                }

                $timeout(function() {
                    $element.find(".palette-select").selectpicker('refresh');
                });
            }, true);

            $scope.editMeaning = function() {
                CreateModalFromTemplate("/templates/meanings/edit-udm.html", $rootScope, null, function(newScope){
                    newScope.initModal($scope.colorMeaning.id, function() {
                        if ($scope.fetchColumnsSummaryForCurrentChart) {
                            $scope.fetchColumnsSummaryForCurrentChart(true).then($scope.redraw);
                        } else {
                            $scope.fetchColumnsSummary().then($scope.redraw);
                        }
                    });
                })
            };

            $scope.getPaletteContent = function(palette) {
                if ($scope.type === 'discrete' || $scope.container.quantizationMode !== 'NONE') {
                    let html = '<div class="palette-picker-item-wrapper"><ul class="palette-picker-sample">';
                    (palette.sample || palette.colors).forEach(function (s) {
                        html += '<li style="background: ' + s + '">&nbsp;</li>';
                    });
                    html += '</ul>' + palette.name + '</div>';
                    return html;
                } else {
                    let html = '<div class="palette-picker-item-wrapper"><div class="palette-picker-sample continuous" style="background: linear-gradient(to right';
                    (palette.sample || palette.colors).forEach(function(s) {
                        html += ', ' + s;
                    });
                    html += '"></div>' + palette.name + '</div>';
                    return html;
                }
            };

            function getPalettesForType(type) {
                switch (type) {
                    case 'CONTINUOUS':
                        return window.dkuColorPalettes.continuous;
                    case 'DIVERGING':
                        return window.dkuColorPalettes.diverging;
                    case 'discrete':
                        return window.dkuColorPalettes.discrete;
                    case 'quantile':
                        return window.dkuColorPalettes.quantile;
                    default:
                        throw Error("Invalid palette type: " + type);
                }
            }

            /* Model management */
            var update = function () {
                var possiblePalettes = getPalettesForType($scope.type);

                $scope.categories = {};
                angular.forEach(possiblePalettes, function(palette) {
                    if ($scope.categories.hasOwnProperty(palette.category)) {
                        $scope.categories[palette.category].push(palette);
                    } else {
                        $scope.categories[palette.category] = [palette];
                    }
                });

                if ($scope.container.colorPalette === "__dku_custom__" || $scope.container.colorPalette === "__dku_meaning__") {
                    return;
                }

                $scope.currentlySelected = null;
                for (var i in possiblePalettes) {
                    if (possiblePalettes[i].id == $scope.container.colorPalette) {
                        $scope.currentlySelected = possiblePalettes[i];
                    }
                }
                if (!$scope.currentlySelected) {
                    $scope.currentlySelected = possiblePalettes[0];
                }
                $scope.container.colorPalette = $scope.currentlySelected.id;

                $timeout(function() {
                    $element.find(".palette-select").selectpicker('refresh');
                });
            };

            $scope.$watch("container", update, true);
            $scope.$watch("continuous", update);

            $scope.selectPalette = function (selected, $event) {
                $scope.container.colorPalette = selected.id;
                update();
                $event.stopPropagation();
            }
        };
        return ret;
    }

})();

(function() {
'use strict';

angular.module('dataiku.charts').service("ChartAxes", ChartAxes);

    /**
     * A set of helpers to create and enhance d3 svg axes
     */
    function ChartAxes($rootScope, ChartDataUtils, ChartDimension, ChartUADimension, NumberFormatter) {
        var svc = {

            /**
             * Create a svg axis for the given axisSpec
             * @param {ChartTensorDataWrapper} chartData
             * @param {AxisSpec} axisSpec
             * @param {Boolean} isPercentScale
             * @param {Boolean } isLogScale
             * @param {Boolean} includeZero: force inclusion of zero in domain
             * @returns {d3 axis}
             */
            createAxis: function(chartData, axisSpec, isPercentScale, isLogScale, includeZero) {
                if (!axisSpec) return null;

                var axis;
                switch (axisSpec.type) {
                    case 'DIMENSION':
                    case 'UNAGGREGATED':
                        axis = svc.createDimensionAxis(chartData, axisSpec);
                        break;
                    case 'MEASURE':
                        axis = svc.createMeasureAxis(chartData, axisSpec, isPercentScale, isLogScale, includeZero);
                        break;
                    default:
                        throw new Error("Unknown axis type: " + axisSpec.type);
                }

                if (axis) {
                    axis.type = axisSpec.type;
                }

                return axis;
            },


            /**
             * Create a svg axis for a UNAGGREGATED / DIMENSION column
             * @param {ChartTensorDataWrapper} chartData
             * @param {AxisSpec} axisSpec
             * @returns {d3 axis}
             */
            createDimensionAxis: function (chartData, axisSpec) {
                var extent;
                if (axisSpec.type === 'UNAGGREGATED') {
                    extent = ChartDataUtils.getUnaggregatedAxisExtent(axisSpec.dimension, axisSpec.data);
                } else {
                    extent = ChartDataUtils.getAxisExtent(chartData, axisSpec.name, axisSpec.dimension);
                }

                // Override min and max with pre-defined interval if requested.
                if (axisSpec.initialInterval) {
                    extent.min = axisSpec.initialInterval.min;
                    extent.max = axisSpec.initialInterval.max;
                }

                var linearScale = d3.scale.linear().domain([extent.min, extent.max]),
                    ordinalScale = d3.scale.ordinal().domain(extent.values.map(function(d,i) { return i; })),
                    axis;

                var labelTickFormat = function (v) {
                    if (v === "___dku_no_value___") return "No value";
                    else return v;
                };

                // If the data is based on range bands AND we are going to use the linear scale
                // to place the bands, then the linear scale must be refitted to give space for the bands
                // (this corresponds to the COLUMN charts with "Use raw values" mode)
                // Same thing for scatter plot
                if (ChartDimension.isUnbinnedNumerical(axisSpec.dimension) || axisSpec.type === 'UNAGGREGATED') {
                    var nbVals = extent.values.length;
                    var interval = extent.max - extent.min;
                    // Add 10% margin when not many bars, 5% margin else
                    var additionalPct = nbVals > 10 ? 5.0 : 10.0;
                    var newMin = extent.min - interval * additionalPct / 100;
                    var newMax = extent.max + interval * additionalPct / 100;
                    linearScale.domain([newMin, newMax]);
                }

                // Choose which scale to display on the axis
                if (ChartDimension.isTimeline(axisSpec.dimension) || (axisSpec.type === 'UNAGGREGATED' && ChartUADimension.isDate(axisSpec.dimension))) {
                    axis = d3.svg.axis().scale(linearScale).tickFormat(function (d) {
                        return d3.time.format('%Y-%m-%d')(new Date(d));
                    });
                    axis.scaleType = "LINEAR";
                } else if (ChartDimension.isUnbinnedNumerical(axisSpec.dimension)) {
                    axis = d3.svg.axis().scale(linearScale);
                    axis.scaleType = "LINEAR";
                } else if (ChartDimension.isBinnedNumerical(axisSpec.dimension) || (axisSpec.type === 'UNAGGREGATED' && ChartUADimension.isTrueNumerical(axisSpec.dimension))) {
                    if (axisSpec.dimension.oneTickPerBin) {
                        axis = d3.svg.axis().scale(ordinalScale).tickFormat(function(d,i) { return labelTickFormat(extent.values[i]); });
                        axis.scaleType = "ORDINAL";
                    } else {
                        axis = d3.svg.axis().scale(linearScale).tickFormat(labelTickFormat);
                        axis.scaleType = "LINEAR";
                    }
                } else {
                    axis = d3.svg.axis().scale(ordinalScale).tickFormat(function(d,i) { return labelTickFormat(extent.values[i]); });
                    axis.scaleType = "ORDINAL";
                }

                axis.ordinalScale = ordinalScale;
                axis.linearScale = linearScale;

                axis.setScaleRange = function (range) {
                    linearScale.range(range);

                    switch (axisSpec.mode) {
                        case 'POINTS':
                            ordinalScale.rangeRoundPoints(range, axisSpec.padding != null ? axisSpec.padding : 0.5);
                            break;
                        case 'COLUMNS':
                            var padding = svc.getColumnPadding(ordinalScale.domain().length);
                            ordinalScale.rangeRoundBands(range, padding, padding/2);
                            break;
                        default:
                            throw new Error("Unknown scale type: " + colorSpec.type);
                    }
                    return axis;
                };

                svc.fixUpAxis(axis);

                axis.dimension = axisSpec.dimension;

                return axis;
            },


            /**
             * Returns the padding between columns based on the number of columns
             * @param numColumns
             * @returns {number}
             */
            getColumnPadding: function(numColumns) {
                if (numColumns > 20) {
                    return 0.1;
                } else {
                    return 0.45 - numColumns / 20 * 0.35;
                }
            },


            /**
             * Create a svg axis for a MEASURE axisSpec
             * @param {ChartTensorDataWrapper} chartData
             * @param {AxisSpec} axisSpec
             * @param {boolean} isPercentScale
             * @param {boolean} isLogScale
             * @param {boolean} includeZero
             * @returns {d3 axis}
             */
            createMeasureAxis: function(chartData, axisSpec, isPercentScale, isLogScale, includeZero) {
                if (!axisSpec.domain) {
                    if (axisSpec.measureIdx === undefined) {
                        return null;
                    }
                    axisSpec.domain = ChartDataUtils.getMeasureExtent(chartData.data, axisSpec.measureIdx, true);
                }

                if (axisSpec.domain[0] == Infinity) {
                    return null; // No values -> no axis
                }

                // Adjust domain if needed
                if (includeZero) {
                    var zeroIsInDomain = (axisSpec.domain[0] > 0) != (axisSpec.domain[1] > 0);
                    if (!zeroIsInDomain) {
                        axisSpec.domain[0] = Math.min(axisSpec.domain[0], 0);
                        axisSpec.domain[1] = Math.max(axisSpec.domain[1], 0);
                    }
                }

                if (isLogScale){
                    if ((axisSpec.domain[0] < 0)) {
                        throw new ChartIAE("Cannot represent negative values on a log scale. Please disable log scale.");
                    }
                    if (axisSpec.domain[0] === 0) {
                        axisSpec.domain[0] = 1;
                    }
                }

                var scale = isLogScale ? d3.scale.log() : d3.scale.linear(),
                    axis = d3.svg.axis().scale(scale).orient('left');

                scale.domain(axisSpec.domain);

                if (isPercentScale || axisSpec.isPercentScale) {
                    NumberFormatter.addToPercentageAxis(axis);
                } else {
                    NumberFormatter.addToAxis(axis);
                }

                if (isLogScale) {
                    svc.setLogAxisTicks(axis, axisSpec.domain[1]);
                }

                axis.setScaleRange = function (range) {
                    scale.range(range);
                };

                svc.fixUpAxis(axis);

                axis.measure = axisSpec.measure;
                return axis;
            },


            /**
             * Add hand-picked axis ticks for log scales
             * @param {d3 axis} axis
             * @param {number} maxVal: the maximum value of the axis
             */
            setLogAxisTicks: function (axis, maxVal) {
                var maxValLog = Math.floor(log10(maxVal));
                var arr = [];
                for (var i = 0; i <= maxValLog; i++) {
                    arr.push(Math.pow(10, i));
                }
                axis.tickValues(arr);
            },


            /**
             * Extra treatment on d3 axis to handle some edge cases
             * @param {d3.axis} axis
             */
            fixUpAxis: function(axis) {
                var scale = axis.scale();

                // d3 axis and scales don't really behave well on empty domains
                if (scale.domain().length == 2 && scale.domain()[0] == scale.domain()[1]) {
                    axis.tickValues([scale.domain()[0]]);
                    scale.domain([scale.domain()[0]-1, scale.domain()[0]+1]);
                }
            },


            /**
             * Compute bottom margins needed to display the x axis, and the angle of the tick labels if they need to rotate
             * TODO @charts: only used in boxplots.js, could probably be merged with adjustBottomMargin
             * @param g
             * @param labeled
             * @param elementWidth
             * @returns {{angle: number, longTitles: boolean, requiredHeight: number, rotatedFirstTextWidth: number}}
             */
            computeAngleAndBottomMargin: function (g, labeled, elementWidth) {
                g.selectAll(".tempText").data(labeled).enter()
                    .append("text").attr("class", "tempText")
                    .text(function (d) {
                        return d.label == "___dku_no_value___" ? "No value" : d.label;
                    });
                var maxLabelWidth = d3.max(g.selectAll('.tempText')[0].map(function (itm) {
                    return itm.getBBox().width;
                }));
                var labelHeight = g.selectAll('.tempText').node().getBBox().height;
                var longTitles = !g.selectAll(".tempText").select(function (text) {
                    return this.getBBox().width > elementWidth;
                }).empty();

                var angle = Math.atan((labelHeight * 2) / elementWidth);
                if (!longTitles) angle = 0;


                if (labeled.length) {
                    var s0 = g.selectAll(".tempText")[0].map(function (itm) {
                        return itm.getBBox().width;
                    });
                    var firstTextWidth = s0[0];
                    var rotatedFTW = firstTextWidth * Math.cos(angle) + labelHeight * Math.sin(angle);
                }

                g.selectAll('.tempText').remove();

                return {
                    angle: angle,
                    longTitles: longTitles,
                    requiredHeight: 30 + Math.sin(angle) * (maxLabelWidth + (labelHeight * 1.5)),
                    rotatedFirstTextWidth: rotatedFTW
                }
            },


            /**
             * Adjust the bottom margin to make room for the x-axis, and the angle of the tick labels if they need to rotate
             * @param {{top: number, bottom: number, right: number, left: number}} margins
             * @param {jQuery selection} $svg
             * @param {d3 axis} xAxis
             * @param {number} forceRotation
             * @returns {{top: number, bottom: number, right: number, left: number}} the updated margins object
             */
            adjustBottomMargin: function (margins, $svg, xAxis, forceRotation = 0) {

                var chartHeight = $svg.height(),
                    chartWidth = $svg.width(),
                    svg = d3.select($svg.get(0));

                var labels, usedBand;

                if (xAxis.type == 'MEASURE' || xAxis.scaleType == 'LINEAR') {
                    const ticks = xAxis.tickValues() ||  xAxis.scale().ticks();
                    labels = xAxis.tickFormat() ? ticks.map(xAxis.tickFormat()) : ticks;
                    usedBand = (chartWidth - margins.left - margins.right) / (labels.length + 1);
                } else {
                    const ticks = xAxis.tickValues() ||  xAxis.ordinalScale.domain();
                    labels = xAxis.tickFormat() ? ticks.map(xAxis.tickFormat()) : ticks;
                    if (xAxis.ordinalScale.rangeBand() > 0) {
                        usedBand = xAxis.ordinalScale.rangeBand();
                    } else {
                        usedBand = (chartWidth - margins.left - margins.right) / (labels.length + 1);
                    }
                }

                if (labels.length == 0) {   // Nothing to do ...
                    return margins;
                }

                svg.selectAll(".tempText").data(labels)
                    .enter()
                    .append("text").attr("class", "tempText")
                    .text(function (d) { return d == "___dku_no_value___" ? "No value" : d; });


                var maxLabelWidth = d3.max(svg.selectAll('.tempText')[0].map(function (itm) {
                    return itm.getBoundingClientRect().width;
                }));

                var labelHeight = svg.selectAll('.tempText').node().getBoundingClientRect().height;
                var hasLongLabels = !svg.selectAll(".tempText").filter(function () { return this.getBoundingClientRect().width > usedBand; }).empty();

                svg.selectAll('.tempText').remove();

                if (forceRotation) {
                    xAxis.labelAngle = forceRotation;
                } else {
                    xAxis.labelAngle = hasLongLabels ? Math.atan((labelHeight * 2) / usedBand) : 0;
                }   

                if (xAxis.labelAngle > Math.PI/3) {
                    xAxis.labelAngle = Math.PI/2;
                }

                // Prevent the xAxis from taking more than a quarter of the height of the chart
                margins.bottom = Math.min(chartHeight / 4, margins.bottom + Math.sin(xAxis.labelAngle) * maxLabelWidth + Math.cos(xAxis.labelAngle) * labelHeight);

                return margins;
            },


            /**
             * Adjust the chart's horizontal margins to make room for the y-axis labels
             * @param {{top: number, bottom: number, right: number, left: number}} margins
             * @param {jQuery selection} $svg
             * @param {ChartDef.java} chartDef
             * @param {d3 axis} yAxis
             * @param {d3 axis} y2Axis
             * @returns {{top: number, bottom: number, right: number, left: number}} the updated margins object
             */
            adjustHorizontalMargins: function (margins, $svg, chartDef, yAxis, y2Axis) {
                [[yAxis, "left"], [y2Axis, "right"]].forEach(function (v) {
                    var axis = v[0], side = v[1];
                    if (!axis) {
                        return margins[side] = 10;
                    }

                    var labels;
                    if (axis.type == 'MEASURE' || axis.scaleType == 'LINEAR') {
                        labels = axis.scale().ticks();
                    } else {
                        labels = axis.ordinalScale.domain();
                    }

                    labels = axis.tickFormat() ? labels.map(axis.tickFormat()) : labels;
                    var svg = d3.select($svg.get(0));

                    svg.selectAll(".tempText").data(labels).enter()
                        .append("text").attr("class", "tempText")
                        .text(function (d) {
                            return d
                        });

                    var maxLabelWidth = d3.max(svg.selectAll('.tempText')[0].map(function (itm) {
                        return itm.getBoundingClientRect().width;
                    })) || 0;

                    margins[side] = maxLabelWidth + 25;
                    svg.selectAll('.tempText').remove();
                });

                /* Very bad estimation for right margin in case of horizontal bars for total values in chart,
                be careful, need to have chartData to get values, TODO:
                if (chartDef.showInChartValues && chartDef.type == 'stacked_bars' && chartDef.variant !== 'stacked_100') {
                    console.log(chartDef);
                    var labels = chartData.data.aggregations[0].tensor;
                    var svg = d3.select($svg.get(0));

                    svg.selectAll(".tempTextSB").data(labels).enter()
                        .append("text").attr("class", "tempTextSB")
                        .attr("font-weight", 500)
                        .text(function(d) {
                            return d;
                        });

                    var maxLabelWidth = d3.max(svg.selectAll('.tempTextSB')[0].map(function(itm) {
                        return itm.getBoundingClientRect().width + 5;
                    })) || 0;

                    margins.right += maxLabelWidth;
                    svg.selectAll('.tempTextSB').remove();
                }*/

                if (chartDef.showYAxisLabel) {
                    margins.left += 20;
                }

                return margins;
            },


            /**
             *  Adjust the domain of two scales so that their zeros are lined-up
             *  @param {d3 scale} scale1
             *  @param {d3 scale} scale2
             */
            synchronizeScaleZeros: function(scale1, scale2) {
                var z1 = scale1(0);
                var z2 = scale2(0);

                if (z1 != z2) {
                    var z = (z1 + z2) / 2;

                    // We adjust both scale domains so that their zero ends up at y=z
                    svc.adjustScaleDomain(scale1, 0, z);
                    svc.adjustScaleDomain(scale2, 0, z);
                }
            },


            /**
             *  Adjust the domain of a scales so that scale(x) = y. The original domain will always be included in the new domain.
             *  @param {d3.scale} scale
             *  @param {number} x
             *  @param {number} y
             */
            adjustScaleDomain: function(scale, x, y) {
                var fx = scale(x);
                if (fx === y) {
                    return;
                }

                // If we want scale(x) to be higher, we can decrease the lower domain bound
                // If we want to scale's to be lower, we can increase the upper domain bound

                // To do the math:
                // Scale domain : [d0, d1], scale range: [r0, r1]
                // Using (r0 = a*d0 + b) and and (r1 = a*d1 + b), we can get a and b as functions of (d0, d1, r0, r1)
                // then solving (y = a*x + b gives) us d0 (or d1) as a function of (y, x, d1 (or d0), r0, r1)

                // With f(x) = a*x + b, we know that f(d0) = r0, f(d1) = r1, so we can get a and b
                // We're looking for d0bis such that f(x) = y

                if (y > scale(x)) {
                    var d0 = (y - scale.range()[0]) * scale.domain()[1] / (y - scale.range()[1]);
                    scale.domain([d0, scale.domain()[1]]);
                } else {
                    var d1 = (y - scale.range()[1]) * scale.domain()[0] / (y - scale.range()[0]);
                    scale.domain([scale.domain()[0], d1]);
                }
            },


            /**
             * Adjust the domain of two given axis so that they have the same scales
             * @param chartDef
             * @param {d3 scale} xScale
             * @param {d3 scale} yScale
             */
            equalizeScales: function(chartDef, xScale, yScale) {
                var compatibleAxes = (chartDef.uaXDimension[0].type === 'NUMERICAL' && chartDef.uaYDimension[0].type == 'NUMERICAL')
                    || (chartDef.uaXDimension[0].type === 'DATE' && chartDef.uaYDimension[0].type == 'DATE');

                if (compatibleAxes) {
                    var extent = function (v) {
                        return Math.abs(v[1] - v[0]);
                    };
                    var xRatio = extent(xScale.domain()) / extent(xScale.range());
                    var yRatio = extent(yScale.domain()) / extent(yScale.range());

                    if (xRatio < yRatio) {
                        var xRangeWidth = extent(xScale.domain()) / yRatio;
                        var x0 = xScale.range()[0];
                        xScale.range([x0, x0 + xRangeWidth]);
                    } else if (xRatio > yRatio) {
                        var y0 = yScale.range()[0];
                        var yRangeWidth = extent(yScale.domain()) / xRatio;
                        yScale.range([y0, y0 - yRangeWidth]);
                    }
                }

                chartDef.compatibleAxes = compatibleAxes;
            },


            /**
             * Draw the given axes for all the given svg(s)
             * @param {jQuery selection} $svgs (size=1 for non-facetted charts)
             * @param {ChartDef.java} chartDef
             * @param {$scope} chartHandler
             * @param {{top: number, bottom: number, right: number, left: number}} final margins
             * @param {number} vizWidth: with of the drawing area
             * @param {number} vizHeight: height of the drawing area
             * @param {d3 axis} xAxis (nullable)
             * @param {d3 axis} yAxis (nullable)
             * @param {d3 axis} y2Axis (nullable)
             */
            drawAxes: function($svgs, chartDef, chartHandler, margins, vizWidth, vizHeight, xAxis, yAxis, y2Axis) {

                var allNegative = (!yAxis || yAxis.scale().domain()[1] < 0) && (!y2Axis || y2Axis.scale().domain()[1] < 0);
                var allPositive = (!yAxis || yAxis.scale().domain()[0] >= 0) && (!y2Axis || y2Axis.scale().domain()[0] >= 0);
                var $xAxisSvgs = $svgs;

                // If chart is facetted and 'singleXAxis' is enabled, we put the axis in a separate svg, fixed at the bottom of the screen
                if (xAxis && chartDef.singleXAxis && chartDef.facetDimension.length) {
                    $xAxisSvgs = $('<svg class="x-axis-svg" xmlns="http://www.w3.org/2000/svg">');
                    $('<div class="x-axis noflex">').css('height', margins.axisHeight).append($xAxisSvgs).appendTo($svgs.eq(0).closest('.mainzone'));
                    d3.select($xAxisSvgs.get(0)).append('g').attr('class', 'chart').attr('transform', 'translate(' + ($svgs.closest('.chart').find('h2').outerWidth() + margins.left) + ', -1)');
                }

                // Create a g.chart in every svg
                $svgs.each(function() {
                    var svg = d3.select(this);
                    svg.append('g').attr('class', 'chart');
                });

                if (!chartHandler.noXAxis && (chartDef.type != 'stacked_bars' || chartDef.showXAxis) && xAxis) {
                    xAxis.orient('bottom');

                    $xAxisSvgs.each(function() {
                        var g = d3.select(this).select('g');

                        var xAxisG = g.append('g')
                            .attr('class', 'x axis qa_charts_x-axis-column-label-text');

                        if (!chartDef.singleXAxis || !chartDef.facetDimension.length) {
                            if (!allNegative) {
                                xAxisG.attr('transform', 'translate(0,' + vizHeight + ')');
                                xAxis.orient('bottom');
                            } else {
                                xAxis.orient('top');
                                var bottomMargin = margins.bottom;
                                margins.bottom = margins.top;
                                margins.top = bottomMargin;
                            }
                        }

                        xAxisG.call(xAxis);

                        var axisScale = yAxis ? yAxis.scale()(0) : y2Axis.scale()(0);
                        if (!allNegative && !allPositive && xAxis.type !== 'UNAGGREGATED' && axisScale) {
                            xAxisG.select('path.domain').attr('transform', 'translate(0,' + (axisScale - vizHeight) + ')');
                        }

                        if (xAxis.labelAngle) {
                            if (!allNegative) {
                                xAxisG.selectAll("text")
                                    .attr("transform", (xAxis.labelAngle == Math.PI/2 ? "translate(-13, 9)" : "translate(-10, 0)") + " rotate(" + xAxis.labelAngle * -180 / Math.PI + ", 0, 0)")
                                    .style("text-anchor", 'end');
                            } else {
                                xAxisG.selectAll("text")
                                    .attr("transform", "translate(10, 0) rotate(" + xAxis.labelAngle * -180 / Math.PI + ", 0, 0)")
                                    .style("text-anchor", 'start');
                            }
                        }

                        svc.addLabelToXAxis(xAxisG, xAxis, chartDef, margins, vizWidth);
                    });
                }

                $svgs.each(function() {
                    var g = d3.select(this).select('g');

                    g.attr("transform", "translate(" + margins.left + "," + margins.top + ")");


                    if (!chartHandler.noXAxis && xAxis && xAxis.vLines) {
                        g.insert("g", ":first-child").attr("class", "hlines")
                            .selectAll(".hline").data(xAxis.scale().ticks(xAxis.ticks()[0]))
                            .enter().append("line")
                            .attr("class", "hline")
                            .attr("x1", function (d) {
                                return xAxis.scale()(d);
                            })
                            .attr("x2", function (d) {
                                return xAxis.scale()(d);
                            })
                            .attr("y1", (xAxis && chartDef.singleXAxis && chartDef.facetDimension.length) ? - margins.top :  0)
                            .attr("y2", vizHeight);
                    }

                    if (!chartHandler.noYAxis && yAxis) {
                        yAxis.orient('left');

                        if (vizHeight < 300) {
                            yAxis.ticks(Math.floor(Math.max(vizHeight/30, 2)));
                        }

                        var yAxisG = g.append('g')
                            .attr('class', 'y y1 axis')
                            .call(yAxis);

                        if (yAxis.type == 'MEASURE') {
                            g.insert("g", ":first-child").attr("class", "hlines")
                                .selectAll(".hline").data(yAxis.tickValues() || yAxis.scale().ticks(yAxis.ticks()[0]))
                                .enter().append("line")
                                .attr("class", "hline")
                                .attr("y1", function (d) {
                                    return yAxis.scale()(d);
                                })
                                .attr("y2", function (d) {
                                    return yAxis.scale()(d);
                                })
                                .attr("x1", 0)
                                .attr("x2", vizWidth);
                        }

                        if (xAxis && chartDef.singleXAxis && chartDef.facetDimension.length) {
                            yAxisG.select('.domain').attr('d', 'M0,-100V1000'); // TODO @charts dirty, use vizHeight+margins.top+margins.bottom instead of 1000?
                            if (allPositive && (yAxis.type === 'MEASURE' || yAxis.scaleType === 'LINEAR')) {
                                yAxisG.select('.tick').remove(); // remove tick for '0'
                            }
                        }

                        svc.addLabelToYAxis(yAxisG, yAxis, chartDef, margins, vizHeight);
                    }

                    if (!chartHandler.noYAxis && y2Axis) {
                        y2Axis.orient('right');
                        if (vizHeight < 300) {
                            y2Axis.ticks(Math.floor(Math.max(vizHeight/30, 2)));
                        }

                        g.append('g')
                            .attr('class', 'y y2 axis')
                            .attr('transform', 'translate(' + vizWidth + ',0)')
                            .call(y2Axis);

                        if (!yAxis && y2Axis.type == 'MEASURE') {
                            g.insert("g", ":first-child").attr("class", "hlines")
                                .selectAll(".hline").data(y2Axis.tickValues() || y2Axis.scale().ticks(y2Axis.ticks()[0]))
                                .enter().append("line")
                                .attr("class", "hline")
                                .attr("y1", function (d) {
                                    return y2Axis.scale()(d);
                                })
                                .attr("y2", function (d) {
                                    return y2Axis.scale()(d);
                                })
                                .attr("x1", 0)
                                .attr("x2", vizWidth);
                        }
                    }
                });
            },


            /**
             * Add the <text> label to the X axis' <g>
             * @param {SVG:g} axisG
             * @param {d3 axis} xAxis
             * @param {ChartDef.java} chartDef
             * @param {Object {top: top, left: left, right: right, bottom: bottom}} margins
             * @param {number} chartWidth
             */
            addLabelToXAxis: function (axisG, xAxis, chartDef, margins, chartWidth) {
                if (!chartDef.showXAxisLabel) {
                    return;
                }

                var labelText = null;
                if (typeof(chartDef.xAxisLabel) !== 'undefined' && chartDef.xAxisLabel.length > 0) {
                    labelText = chartDef.xAxisLabel;
                } else if (xAxis.dimension !== undefined) {
                    labelText = xAxis.dimension.column;
                } else if (xAxis.measure !== undefined) {
                    var measure = xAxis.measure[0];
                    if (measure.column == null && measure['function'] === 'COUNT') {
                        labelText =  'Count of records';
                    } else {
                        labelText =  measure.column + ' (' + measure['function'] + ')';
                    }
                } else if (chartDef.genericDimension0.length == 1) {
                    labelText = chartDef.genericDimension0[0].column;
                }

                if (labelText) {
                    var rect = axisG.append('rect');
                    var text = axisG.append("text")
                        .attr('x', chartWidth / 2)
                        .attr('y', xAxis.orient() == 'bottom' ? margins.bottom - 15 : 15 - margins.top)
                        .attr('text-anchor', 'middle')
                        .attr('dominant-baseline', 'middle')
                        .attr('fill', '#666')
                        .attr('class', 'axis-label x qa_charts_x-axis-label')
                        .style('font-size', '15px')
                        .text(labelText)
                        .attr('no-global-contextual-menu-close', true)
                        .on('click', function() {
                            $rootScope.$apply(function() {
                                $rootScope.globallyOpenContextualMenu = $('.x-axis-contextual-menu');
                            });
                        });

                    var bbox = text.node().getBoundingClientRect();

                    rect.attr('x', chartWidth/2-bbox.width/2)
                        .attr('y', xAxis.orient() == 'bottom' ? margins.bottom-15-bbox.height/2 : 15-margins.top-bbox.height/2)
                        .attr('width', bbox.width)
                        .attr('height', bbox.height)
                        .attr('fill', 'white')
                        .attr('class', 'chart-wrapper__x-axis-label')
                        .attr('stroke', 'none');
                }
            },


            /**
             * Add the <text> label to the Y axis' <g>
             * @param {SVG:g} axisG
             * @param {d3 axis} yAxis
             * @param {ChartDef.java} chartDef
             * @param {{top: number, bottom: number, left: number, right: number}} margins
             * @param {number} chartWidth
             */
            addLabelToYAxis: function (axisG, yAxis, chartDef, margins, chartHeight) {
                if (!chartDef.showYAxisLabel) {
                    return;
                }

                var labelText = null;
                if (typeof(chartDef.yAxisLabel) !== 'undefined' && chartDef.yAxisLabel.length > 0) {
                    labelText = chartDef.yAxisLabel;
                } else if (yAxis.dimension !== undefined) {
                    labelText = yAxis.dimension.column;
                } else if (yAxis.measure !== undefined) {
                    labelText =  yAxis.measure[0].column + ' (' + yAxis.measure[0]['function'] + ')';
                } else if (chartDef.genericMeasures.length === 1) {
                    // The y measure is always the last measure
                    var measure = chartDef.genericMeasures[chartDef.genericMeasures.length-1];
                    if (measure.column == null && measure['function'] === 'COUNT') {
                        labelText = 'Count of records';
                    } else {
                        labelText = measure.column + ' (' + measure['function'] + ')';
                    }
                }

                if (labelText) {
                    var maxLabelWidth = d3.max(d3.selectAll('.axis.y .tick')[0].map(function (itm) {
                        return itm.getBBox().width;
                    })) || 0;
                    axisG.append('text')
                        .attr('x', -(maxLabelWidth + (margins.left - maxLabelWidth) / 2))
                        .attr('y', (chartHeight - margins.top) / 2)
                        .attr('text-anchor', 'middle')
                        .attr('dominant-baseline', 'middle')
                        .attr('class', 'axis-label y qa_charts_y-axis-label')
                        .attr('fill', '#666')
                        .style('font-size', '15px')
                        .attr('transform', 'rotate(-90, ' + -(maxLabelWidth + (margins.left - maxLabelWidth) / 2) + ',' + (chartHeight - margins.top) / 2 + ')')
                        .text(labelText)
                        .attr('no-global-contextual-menu-close', true)
                        .on('click', function() {
                            $rootScope.$apply(function() {
                                $rootScope.globallyOpenContextualMenu = $('.y-axis-contextual-menu');
                            });
                        });
                }
            }

        };

        return svc;
    }
})();
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
(function(){
'use strict';

const app = angular.module('dataiku.charts');


app.factory("StackedBarsChart", function(ChartViewCommon, ChartDimension, ChartTensorDataWrapper, Fn, StackedChartUtils) {
    return function($container, chartDef, chartHandler, axesDef, data) {

        var chartData = ChartTensorDataWrapper(data, axesDef),
            animationData = StackedChartUtils.prepareData(chartDef, chartData, 'y'),
            yDimension = chartDef.genericDimension0[0],
            yLabels = chartData.getAxisLabels('y'),
            xDomain = [0, animationData.maxTotal];

        var drawFrame = function(frameIdx, chartBase) {
            animationData.frames[frameIdx].facets.forEach(function(facetData, f) {
                var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                StackedBarsChartDrawer(g, facetData, chartBase, f);
            });
        };

        var isPercentScale = chartDef.genericMeasures.every(Fn(Fn.prop('computeMode'), Fn.eq('PERCENTAGE')));

        ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
            {type: 'MEASURE', domain: xDomain, isPercentScale: isPercentScale, measure: chartDef.genericMeasures},
            {type: 'DIMENSION', name: 'y', mode:'COLUMNS', dimension: yDimension, minRangeBand: 18, ascendingDown: true}, null,
            {type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension1[0]}
        );

        function StackedBarsChartDrawer(g, stacksData, chartBase, f) {

            var percentFormatter = d3.format(".0%");

            var barHeight = ChartDimension.isUnbinnedNumerical(yDimension) ? 10 : Math.max(1, chartBase.yAxis.ordinalScale.rangeBand());

            var stacks = g.selectAll('.stack').data(stacksData.stacks);
            stacks.enter().append('g').attr('class', 'stack');
            stacks.exit().remove();
            stacks.attr('transform', function(d, i) {
                if (ChartDimension.isUnbinnedNumerical(yDimension)) {
                    return 'translate(0, ' + (chartBase.yAxis.linearScale(yLabels[i].sortValue) - barHeight/2) + ')';
                } else {
                    return 'translate(0, ' + chartBase.yAxis.ordinalScale(i) + ')';
                }
            });

            /* Display total, not enabled for now TODO:
            if (chartDef.showInChartValues && chartDef.variant !== 'stacked_100') {
                var totals = stacks.selectAll('text.total').data(function(d) { return [d]; });
                totals.enter().append('text')
                    .attr('class', 'total')
                    .attr('y', barHeight/2)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .attr('font-weight', 500);
                totals
                    .text(function(d) { return d.count > 0 ? chartBase.measureFormatters[0](d.total) : ''; })
                    .each(function(d) {
                        var bbox = this.getBoundingClientRect();
                        if (bbox.height > barHeight) {
                            d3.select(this).attr('visibility', 'hidden');
                        } else {
                            d3.select(this).attr('visibility', null);
                        }
                    })
                    .transition()
                    .attr('x', function(d) {
                        var bbox = this.getBoundingClientRect();
                        return chartBase.xAxis.scale()(d.total) + bbox.width/2 + 5;
                    });
            }*/

            var rects = stacks.selectAll('rect').data(Fn.prop('data'));
            rects.enter().append("rect")
                .attr("height", barHeight)
                .attr("y", 0)
                .attr("fill", function(d) { return chartBase.colorScale(d.color+d.measure); })
                .attr("opacity", chartDef.colorOptions.transparency)
                .each(function(d) { chartBase.tooltips.registerEl(this, {measure: d.measure, y: d.y, color: d.color, facet: f}, 'fill'); });

            if (chartDef.showInChartValues) {
                var stackTexts = stacks.selectAll('text.value').data(Fn.prop('data'));
                stackTexts.enter().append('text')
                    .attr('class', 'value')
                    .attr('y', barHeight/2)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', '#333')
                    .style('pointer-events', 'none');
                stackTexts.exit().remove();
                stackTexts
                    .text(function(d) {
                        if (d.count > 0) {
                            if (chartDef.variant === 'stacked_100') {
                                return percentFormatter(d.value);
                            } else {
                                return chartBase.measureFormatters[d.measure](d.value);
                            }
                        } else {
                            return '';
                        }
                    })
                    .each(function(d) {
                        var bbox = this.getBoundingClientRect();
                        if (bbox.width > (chartBase.xAxis.scale()(d.top) - chartBase.xAxis.scale()(d.base)) || bbox.height > barHeight) {
                            d3.select(this).attr('visibility', 'hidden');
                        } else {
                            d3.select(this).attr('visibility', null)
                        }
                    })
                    .transition()
                    .attr('x', function(d) { return chartBase.xAxis.scale()((d.top + d.base)/2); })
            }

            rects.transition()
                .attr("width", function(d) { return chartBase.xAxis.scale()(d.top) - chartBase.xAxis.scale()(d.base); })
                .attr("x", function(d) { return chartBase.xAxis.scale()(d.base); });

        }
    }
});
})();

(function(){
'use strict';

angular.module('dataiku.charts')
    .factory("StackedColumnsChart", StackedColumnsChart)
    .factory("StackedChartUtils", StackedChartUtils);

function StackedColumnsChart(ChartViewCommon, ChartDimension, ChartTensorDataWrapper, Fn, StackedChartUtils) {
    return function($container, chartDef, chartHandler, axesDef, data) {

        var chartData = ChartTensorDataWrapper(data, axesDef),
            xDimension = chartDef.genericDimension0[0],
            xLabels = chartData.getAxisLabels('x'),
            animationData = StackedChartUtils.prepareData(chartDef, chartData),
            yDomain = [0, animationData.maxTotal];

        var drawFrame = function(frameIdx, chartBase) {
            animationData.frames[frameIdx].facets.forEach(function(facetData, f) {
                var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                StackedColumnChartDrawer(g, facetData, chartBase);
            });
        };

        var isPercentScale = chartDef.genericMeasures.every(Fn(Fn.prop('computeMode'), Fn.eq('PERCENTAGE')));

        ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
            {type:'DIMENSION', mode:'COLUMNS', dimension: chartDef.genericDimension0[0], name: 'x'},
            {type: 'MEASURE', domain: yDomain, isPercentScale: isPercentScale}, null,
            {type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension1[0]}
        );

        function StackedColumnChartDrawer(g, stacksData, chartBase) {

            var xAxis = chartBase.xAxis,
                yAxis = chartBase.yAxis,
                yScale = yAxis.scale(),
                percentFormatter = d3.format(".0%");

            var barWidth = ChartDimension.isUnbinnedNumerical(xDimension) ? 10 : Math.max(1, xAxis.ordinalScale.rangeBand());

            var stacks = g.selectAll('.stack').data(stacksData.stacks);
            stacks.enter().append('g').attr('class', 'stack');
            stacks.exit().remove();
            stacks.attr('transform', function(d, i) {
                if (ChartDimension.isUnbinnedNumerical(xDimension)) {
                    return 'translate(' + (xAxis.linearScale(xLabels[i].sortValue) - barWidth/2) + ', 0)';
                } else {
                    return 'translate(' + xAxis.ordinalScale(i) + ', 0)';
                }
            });

            if (chartDef.showInChartValues && chartDef.variant !== 'stacked_100') {
                var totals = stacks.selectAll('text.total').data(function(d) { return [d]; });
                totals.enter().append('text')
                    .attr('class', 'total')
                    .attr('x', barWidth/2)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#333')
                    .attr('dominant-baseline', 'text-after-edge')
                    .attr('font-weight', 500);
                totals
                    .text(function(d) { return d.count > 0 ? chartBase.measureFormatters[0](d.total) : ''; })
                    .each(function(d) {
                        var bbox = this.getBoundingClientRect();
                        if (bbox.width > barWidth) {
                            d3.select(this).attr('visibility', 'hidden');
                        } else {
                            d3.select(this).attr('visibility', null);
                        }
                    })
                    .transition()
                    .attr('y', function(d) { return yScale(d.total) - 5; })
            }

            var rects = stacks.selectAll('rect').data(Fn.prop('data'));
            rects.enter().append("rect")
                .attr("width", barWidth)
                .attr("x", 0)
                .attr("fill", function(d,i) { return chartBase.colorScale(i); })
                .attr("opacity", chartDef.colorOptions.transparency)
                .each(function(d) { chartBase.tooltips.registerEl(this, {measure: d.measure, x: d.x, color: d.color, facet: d.facet}, 'fill'); });

            if (chartDef.showInChartValues) {
                var stackTexts = stacks.selectAll('text.value').data(Fn.prop('data'));
                stackTexts.enter().append('text')
                    .attr('class', 'value')
                    .attr('x', barWidth/2)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', '#333')
                    .style('pointer-events', 'none');
                stackTexts.exit().remove();
                stackTexts
                    .text(function(d) {
                        if (d.count > 0) {
                            if (chartDef.variant === 'stacked_100') {
                                return percentFormatter(d.value);
                            } else {
                                return chartBase.measureFormatters[d.measure](d.value);
                            }
                        } else {
                            return '';
                        }
                    })
                    .each(function(d) {
                        var bbox = this.getBoundingClientRect();
                        if (bbox.height > (yScale(d.base) - yScale(d.top)) || bbox.width > barWidth) {
                            d3.select(this).attr('visibility', 'hidden');
                        } else {
                            d3.select(this).attr('visibility', null);
                        }
                    })
                    .transition()
                    .attr('y', function(d) { return yScale((d.top + d.base)/2); })
            }

            rects.transition()
                .attr("height", function(d) { return yScale(d.base) - yScale(d.top); })
                .attr("y", function(d, i) { return yScale(d.top); });

        }
    }
}

function StackedChartUtils() {
    return {

        prepareData: function(chartDef, chartData, axisDim) {
            var colorLabels = chartData.getAxisLabels('color') || [null],
                facetLabels = chartData.getAxisLabels('facet') || [null],
                animationLabels = chartData.getAxisLabels('animation') || [null],
                xLabels = chartData.getAxisLabels(axisDim || 'x'),
                hasLogScale = chartDef.axis1LogScale;

            var animationData = {frames: [], maxTotal: 0};
            animationLabels.forEach(function(animationLabel, a) {
                chartData.fixAxis('animation', a);

                var frameData = {facets: [], maxTotal: 0};
                facetLabels.forEach(function (facetLabel, f) {
                    chartData.fixAxis('facet', f);

                    var facetData = {stacks: [], maxTotal: 0};
                    xLabels.forEach(function (xLabel, x) {
                        chartData.fixAxis(axisDim || 'x', x);

                        var total = hasLogScale ? 1 : 0;
                        var count = 0;
                        var stackData = [];

                        colorLabels.forEach(function (colorLabel, c) {
                            chartData.fixAxis('color', c);

                            chartDef.genericMeasures.forEach(function (measure, m) {
                                var d = chartData.aggr(m).get();
                                if (d < 0) {
                                    throw new ChartIAE("Cannot represent negative values on a Stacked chart. Please use another chart.");
                                }

                                var point = {
                                    color: c,
                                    measure: m,
                                    facet: f,
                                    animation: a,
                                    count: chartData.getNonNullCount({}, m),
                                    base: total,
                                    value: d,
                                    top: total + d
                                };

                                point[axisDim || 'x'] = x;
                                stackData.push(point);

                                total += d;
                                count += chartData.getNonNullCount({}, m);
                            });
                        });


                        if (chartDef.variant == "stacked_100" && total > 0) {
                            // Do a second pass and divide by total
                            var totalPercent = 0;
                            stackData.forEach(function (point, p) {
                                point.value /= total;
                                point.base = totalPercent;
                                point.top = point.value + point.base;
                                totalPercent += point.value;
                            });

                            total = 1;
                        }

                        facetData.stacks.push({data: stackData, total: total, count: count});
                        facetData.maxTotal = Math.max(facetData.maxTotal, total);
                    });

                    frameData.maxTotal = Math.max(frameData.maxTotal, facetData.maxTotal);
                    frameData.facets.push(facetData);
                });

                animationData.maxTotal = Math.max(animationData.maxTotal, frameData.maxTotal);
                animationData.frames.push(frameData);
            });

            return animationData;
        }
    };
}

})();

(function(){
'use strict';

    angular.module('dataiku.charts')
        .factory('GroupedColumnsChart',  GroupedColumnsChart)
        .factory('GroupedColumnsDrawer', GroupedColumnsDrawer)
        .factory('GroupedColumnsUtils',  GroupedColumnsUtils);

    function GroupedColumnsChart(ChartViewCommon, ChartDataUtils, ChartTensorDataWrapper, GroupedColumnsDrawer, GroupedColumnsUtils) {
        return function($container, chartDef, chartHandler, axesDef, data) {

            var chartData = ChartTensorDataWrapper(data, axesDef),
                yExtents = ChartDataUtils.getMeasureExtents(chartDef, data),
                y1Domain = yExtents.y1.extent,
                y2Domain = yExtents.y2.extent;

            var groupsData = GroupedColumnsUtils.prepareData(chartDef, chartData);

            var drawFrame = function (frameIdx, chartBase) {
                chartData.fixAxis('animation', frameIdx);
                chartBase.$svgs.each(function(f, svg) {
                    var g = d3.select($(svg).find('g.chart').get(0));
                    GroupedColumnsDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, groupsData, f);
                });
            };

            ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
                {type: 'DIMENSION', mode:'COLUMNS', dimension: chartDef.genericDimension0[0], name: 'x'},
                {type: 'MEASURE', domain: y1Domain, isPercentScale: yExtents.y1.onlyPercent},
                {type: 'MEASURE', domain: y2Domain, isPercentScale: yExtents.y2.onlyPercent},
                {type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension1[0]});
        };
    }

    function GroupedColumnsDrawer(ChartDimension, Fn) {
        return function(g, chartDef, chartHandler, chartData, chartBase, groupsData, f) {

            var xDimension = chartDef.genericDimension0[0],
                xLabels = chartData.getAxisLabels('x'),
                xAxis = chartBase.xAxis,
                isAxisLogScale = function(d) {
                    return chartDef.genericMeasures[d.measure].displayAxis == 'axis1' ? chartDef.axis1LogScale : chartDef.axis2LogScale;
                },
                getScale = function(d) {
                    return chartDef.genericMeasures[d.measure].displayAxis == 'axis1' ? chartBase.yAxis.scale() : chartBase.y2Axis.scale();
                },
                zeroIsInDomain = function(d) {
                    var axisDomain = getScale(d).domain();
                    return  (axisDomain[0] > 0) != (axisDomain[1] > 0);
                },
                getRectValue = function (d) {
                    return chartData.aggr(d.measure).get(d);
                };



            var groupWidth = ChartDimension.isUnbinnedNumerical(xDimension) ? 10 : Math.max(1, xAxis.ordinalScale.rangeBand()),
                barWidth = groupsData.length > 0 ? groupWidth/groupsData[0].columns.length : groupWidth;

            var groups = g.selectAll('g.group').data(groupsData);
            groups.enter().append('g')
                .attr('class', 'group');
            groups.exit().remove();
            groups.attr('transform', function(d) {
                let hasOneTickPerBin = ChartDimension.hasOneTickPerBin(xDimension);
                let isBinnedNumerical = ChartDimension.isBinnedNumerical(xDimension);
                // Use scale() only if in binned numerical mode. If only one tick should be used per bin then use ordinalScale().
                // When using scale(), half of the barWidth should be deduced.
                let translateBase = isBinnedNumerical && !hasOneTickPerBin ? xAxis.scale()(xLabels[d.x].sortValue) - barWidth / 2 : xAxis.ordinalScale(d.x);
                return 'translate(' + translateBase + ', 0)';
            });

            var positionRects = function(rects) {
                return rects.attr('transform', function(d, i) {
                    var yScale = getScale(d);
                    var v = chartData.aggr(d.measure).get(d), s;
                    if (isAxisLogScale(d) && v === 0) v = 1;
                    if (!isAxisLogScale(d) && (chartDef.includeZero || zeroIsInDomain(d))) {
                        s = Math.min(yScale(v), yScale(0));
                    } else {
                        s = v <= 0 ? yScale.range()[1] : yScale(v);
                    }
                    return "translate(" + (barWidth * i) + ", " + s + ")";
                }).attr("height", function(d) {
                    var yScale = getScale(d);
                    var v = chartData.aggr(d.measure).get(d);
                    var h;
                    if (isAxisLogScale(d)) {
                        if (v === 0) v = 1;
                        h = chartBase.vizHeight - yScale(v);
                    } else {
                        if (chartDef.includeZero || zeroIsInDomain(d)) {
                            h = Math.abs(yScale(v) - yScale(0));
                        } else {
                            h = v <= 0 ? yScale(v) - yScale.range()[1] : yScale.range()[0] - yScale(v);
                        }
                    }
                    return Math.max(h, 1);
                });
            };

            var rects = groups.selectAll('rect').data(Fn.prop('columns'));
            rects.enter().append('rect')
                .attr('width', barWidth)
                .attr('fill', function(d){ return chartBase.colorScale(d.color + d.measure); })
                .attr("opacity", chartDef.colorOptions.transparency)
                .each(function(d) { chartBase.tooltips.registerEl(this,  angular.extend({}, d, {facet: f}), 'fill'); })
                .call(positionRects);
            rects.exit().remove();
            rects.transition().ease('easeOutQuad').call(positionRects);


            if (chartDef.showInChartValues) {
                var rectTexts = groups.selectAll('text.value').data(Fn.prop('columns'));
                rectTexts.enter().append('text')
                    .attr('class', 'value')
                    .attr('x', function(d,i) { return barWidth*(i+0.5); })
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#333')
                    .attr('dominant-baseline', function(d) { return getRectValue(d) >= 0 ? 'text-after-edge' : 'text-before-edge'; })
                    .style('pointer-events', 'none');
                rectTexts.exit().remove();
                rectTexts
                    .text(function(d) { return chartData.getCount(d) > 0 ? chartBase.measureFormatters[d.measure](getRectValue(d)) : ''; })
                    .each(function() {
                        var bbox = this.getBoundingClientRect();
                        if (bbox.width > barWidth) {
                            d3.select(this).attr('visibility', 'hidden');
                        } else {
                            d3.select(this).attr('visibility', null);
                        }
                    })
                    .transition()
                    .ease('easeOutQuad')
                    .attr('y', function(d,i) {
                        var rectValue = getRectValue(d);
                        var scaleValue = getScale(d)(rectValue);
                        if (isNaN(scaleValue)) return 0;
                        else return scaleValue - (rectValue >= 0 ? 2 : -2);
                    }); // TODO @charts if all negative ?
            }
        }
    }

    function GroupedColumnsUtils() {
        return {
            prepareData: function (chartDef, chartData, measureFilter) {
                var xLabels = chartData.getAxisLabels('x'),
                    colorLabels = chartData.getAxisLabels('color') || [null],
                    groupsData = [];

                xLabels.forEach(function (xLabel, x) {
                    var columns = [];
                    colorLabels.forEach(function (colorLabel, c) {
                        chartDef.genericMeasures.forEach(function (measure, m) {
                            if (measureFilter && !measureFilter(measure)) return;
                            columns.push({color: c, measure: m, x: x});
                        });
                    });
                    groupsData.push({x: x, columns: columns});
                });
                return groupsData;
            }
        }
    }

})();

(function(){
'use strict';

    const app = angular.module('dataiku.charts');


    app.factory('MultiplotChart', function(ChartViewCommon, ChartTensorDataWrapper, GroupedColumnsDrawer, GroupedColumnsUtils, LinesDrawer, LinesUtils, ChartDataUtils) {
        return function ($container, chartDef, chartHandler, axesDef, data) {

            var chartData = ChartTensorDataWrapper(data, axesDef),
                facetLabels = chartData.getAxisLabels('facet') || [null], // We'll through the next loop only once if the chart is not facetted
                yExtents = ChartDataUtils.getMeasureExtents(chartDef, data),
                y1Domain = yExtents.y1.extent,
                y2Domain = yExtents.y2.extent;

            var columnsData = GroupedColumnsUtils.prepareData(chartDef, chartData, function(measure) { return measure.displayType === 'column'; }),
                linesData = LinesUtils.prepareData(chartDef, chartData, function(measure) { return measure.displayType === 'line'; });

            var drawFrame = function (frameIdx, chartBase) {
                chartData.fixAxis('animation', frameIdx);
                facetLabels.forEach(function (facetLabel, f) {
                    var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                    GroupedColumnsDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, columnsData);
                    LinesDrawer(g, chartDef, chartData.fixAxis('facet', f), chartBase, linesData, f);
                });
            };

            ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
                {type: 'DIMENSION', mode:'COLUMNS', dimension: chartDef.genericDimension0[0], name: 'x'},
                {type: 'MEASURE', domain: y1Domain},
                {type: 'MEASURE', domain: y2Domain},
                {type: 'DIMENSION', name: 'color'}
            );
        }
    });
})();

(function(){
'use strict';

angular.module('dataiku.charts')
    .factory("ScatterPlotChart", ScatterPlotChart)
    .factory("ScatterPlotChartDrawer", ScatterPlotChartDrawer)
    .factory("_ScatterCommon", ScatterCommon);

function ScatterCommon(ChartViewCommon, ChartUADimension, ChartColorUtils, ChartColorScales) {
    var svc = {
        hasUAColor : function(chartDef) {
            return chartDef.uaColor.length > 0;
        },

        makeColorScale : function(chartDef, data, chartHandler){
            return ChartColorScales.createColorScale(
                {data: data},
                chartDef,
                {type: 'UNAGGREGATED', dimension: chartDef.uaColor[0], data: data.values.color, withRgba: true},
                chartHandler
            );
        },
        makeSingleColor : function(chartDef) {
            return ChartColorUtils.toRgba(chartDef.colorOptions.singleColor, chartDef.colorOptions.transparency);
        },

        makeColor : function(chartDef, data, i, colorScale, resultingColor, colorCache) {
            if (chartDef.uaColor.length > 0) {
                var cacheKey, rgb;
                 if (ChartUADimension.isTrueNumerical(chartDef.uaColor[0])) {
                    cacheKey = data.values.color.num.data[i];
                 } else if (ChartUADimension.isDateRange(chartDef.uaColor[0])) {
                     cacheKey = data.values.color.ts.data[i];
                 } else {
                    cacheKey = data.values.color.str.data[i]
                }

                if (colorCache[cacheKey]) {
                    rgb = colorCache[cacheKey];
                } else {
                    rgb = colorScale(cacheKey);
                    colorCache[cacheKey] = rgb;
                }

                return rgb;
            } else {
                return resultingColor;
            }
        },

        hasUASize : function(chartDef) {
            return chartDef.uaSize.length > 0;
        },

        hasUAShape : function(chartDef) {
            return chartDef.uaShape.length > 0;
        },

        makeSizeScale : function(chartDef, data, pxlr) {
            if (ChartUADimension.isTrueNumerical(chartDef.uaSize[0])) {
                return d3.scale.sqrt().range([chartDef.bubblesOptions.defaultRadius * pxlr, chartDef.bubblesOptions.defaultRadius * 5 * pxlr])
                    .domain([data.values.size.num.min, data.values.size.num.max]);
            } else if (ChartUADimension.isDateRange(chartDef.uaSize[0])) {
                return d3.scale.sqrt().range([chartDef.bubblesOptions.defaultRadius * pxlr, chartDef.bubblesOptions.defaultRadius * 5 * pxlr])
                    .domain([data.values.size.ts.min, data.values.size.ts.max]);
            } else {
                throw new ChartIAE("Cannot use ALPHANUM as size scale");
            }
        },

        makeSize : function(chartDef, data, i, sizeScale) {
            if (chartDef.uaSize.length) {
                var sizeValue;
                if (ChartUADimension.isTrueNumerical(chartDef.uaSize[0])) {
                    sizeValue = data.values.size.num.data[i];
                } else if (ChartUADimension.isDateRange(chartDef.uaSize[0])) {
                    sizeValue = data.values.size.ts.data[i];
                }
                return sizeScale(sizeValue);
            } else {
                return chartDef.bubblesOptions.defaultRadius;
            }
        },

        formattedVal : function(chartDef, uaData, uaDef, i) {
            var vf = ChartViewCommon.getMeasuresFormatter(chartDef);

            if (ChartUADimension.isTrueNumerical(uaDef)) {
                return vf(uaData.num.data[i]);
            } else if (ChartUADimension.isDateRange(uaDef)){
                var ts = uaData.ts.data[i];
                return d3.time.format('%Y-%m-%d')(new Date(ts));
            } else {
                return uaData.str.sortedMapping[uaData.str.data[i]].label;
            }
        },

        formattedColorVal : function(chartDef, data, i) {
            return svc.formattedVal(chartDef, data.values.color, chartDef.uaColor[0], i);
        },

        formattedSizeVal : function(chartDef, data, i) {
            return svc.formattedVal(chartDef, data.values.size, chartDef.uaSize[0], i);
        }
    };
    return svc;
}

function ScatterPlotChart(ChartViewCommon, ChartScatterDataWrapper, ScatterPlotChartDrawer) {
    return function($container, chartDef, chartHandler, data) {

        var chartData = ChartScatterDataWrapper(data, {});

        var drawFrame = function (frameIdx, chartBase) {
            ScatterPlotChartDrawer(chartDef, chartHandler, data, chartBase);
        };


        chartHandler.compatibleAxis = (chartDef.uaXDimension[0].type === 'NUMERICAL' && chartDef.uaYDimension[0].type == 'NUMERICAL')
            || (chartDef.uaXDimension[0].type === 'DATE' && chartDef.uaYDimension[0].type == 'DATE');

        ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
            {type: 'UNAGGREGATED', mode: 'POINTS', dimension: chartDef.uaXDimension[0], data: data.xAxis},
            {type: 'UNAGGREGATED', mode: 'POINTS', dimension: chartDef.uaYDimension[0], data: data.yAxis},
            null,
            {type: 'UNAGGREGATED', dimension: chartDef.uaColor[0], data: data.values.color, withRgba: true});
    };
}

function ScatterPlotChartDrawer($sanitize, ChartViewCommon, _ScatterCommon, ChartColorUtils, ChartLabels, Logger, ChartUADimension, ChartLegendUtils) {
    return function(chartDef, chartHandler, data, chartBase) {
        var g = d3.select(chartBase.$svgs.get(0));

        var foreignObject = g.append('foreignObject')
            .attr('x', chartBase.margins.left)
            .attr('y', chartBase.margins.top)
            .attr('width', chartBase.vizWidth)
            .attr('height', chartBase.vizHeight);

        var SCATTER_SHAPES = [  // font-awesome icons as unicode
            "F111", // icon-circle
            "F067", // icon-plus
            "F04D", // icon-stop
            "F005", // icon-star
            "F00D", // icon-remove
            "F069", // icon-asterisk
            "F0A3", // icon-certificate
            "F10C", // icon-circle-blank
            "F096", // icon-check-empty
            "F006", // icon-star-empty,
            "F185" // icon-sun
        ];
        var pxlr = 2; // pixel ratio

        var $body = $('<div>').css('height', chartBase.vizHeight).css('width', chartBase.vizWidth).appendTo(foreignObject.node());


        var canvas = document.createElement("canvas");
        $(canvas).css("height", "100%");
        $(canvas).css("width", "100%");
        $body.append(canvas);

        var width = chartBase.vizWidth * pxlr;
        var height = chartBase.vizHeight * pxlr ;
        canvas.width = width ;
        canvas.height = height;

        var colorOptions = chartDef.colorOptions || {
                singleColor: "#659a88",
                transparency: 0.5,
            };
        var bubblesOptions = chartDef.bubblesOptions;

        var context = canvas.getContext("2d");
        context.translate(0.5, 0.5);

        /* Margins */
        var dataML = 60 * pxlr, axisML = 40 * pxlr;
        var dataMB = 60 * pxlr, axisMB = 40 * pxlr;
        var dataMR = 20 * pxlr;
        var dataMT = 20 * pxlr;

        if (typeof(chartDef.xAxisLabel) != 'undefined' && chartDef.xAxisLabel.length > 0) {
            dataMB += 20 * pxlr;
            axisMB += 20 * pxlr;
        }
        if (typeof(chartDef.yAxisLabel) != 'undefined' && chartDef.yAxisLabel.length > 0) {
            dataML += 30 * pxlr;
            axisML += 30 * pxlr;
        }

        var xPositionScale = function(d) {
            return chartBase.xAxis.scale()(d) * pxlr;
        };

        var yPositionScale = function(d) {
            return chartBase.yAxis.scale()(d) * pxlr;
        };

        /* Data points */
        var dataZP = {x: dataML, y: height - dataMB};

        var quadtree = d3.geom.quadtree()
            .extent([[dataML, dataMT], [width - dataMR, height - dataMB]])([]);

        var hasUASize = _ScatterCommon.hasUASize(chartDef);
        if (hasUASize) {
            var sizeScale = _ScatterCommon.makeSizeScale(chartDef, data, pxlr);
        }

        var hasUAColor = _ScatterCommon.hasUAColor(chartDef);
        if (hasUAColor) {
            var colorScale = chartBase.colorScale;
        } else {
            var resultingColor = _ScatterCommon.makeSingleColor(chartDef)  // No color scale, compute the single color
        }

        var hasUAShape = _ScatterCommon.hasUAShape(chartDef);
        if (hasUAShape) {
            var shapeScale = d3.scale.ordinal().range(SCATTER_SHAPES);
        }

        var quadtreeIsBroken = false;
        var colorCache = {};
        var fadeColor = ChartColorUtils.toRgba("#EEE", colorOptions.transparency);

        function drawPoint(i, initial, fade) {
            if (!fade) fade = 1.0;
            var x, y, r, c, xv, yv, xbin, ybin;

            if (chartDef.uaXDimension[0].type == "NUMERICAL") {
                xv = data.xAxis.num.data[i];
                x = xPositionScale(xv);
            } else if (chartDef.uaXDimension[0].type == "ALPHANUM") {
                xbin = data.xAxis.str.data[i];
                xv = data.xAxis.str.sortedMapping[xbin].sortOrder;
                x = xPositionScale(xv);
            } else if (chartDef.uaXDimension[0].type == "DATE") {
                xv = data.xAxis.ts.data[i];
                x = xPositionScale(xv);
            } else {
                throw Error("unhandled");
            }
            if (chartDef.uaYDimension[0].type == "NUMERICAL") {
                yv = data.yAxis.num.data[i];
                y = yPositionScale(yv);
            } else if (chartDef.uaYDimension[0].type == "ALPHANUM") {
                ybin = data.yAxis.str.data[i];
                yv = data.yAxis.str.sortedMapping[ybin].sortOrder;
                y = yPositionScale(yv)
            } else if (chartDef.uaYDimension[0].type == "DATE") {
                yv = data.yAxis.ts.data[i];
                y = yPositionScale(yv);
            } else {
                throw Error("unhandled");
            }

            r = _ScatterCommon.makeSize(chartDef, data, i, sizeScale);

            if (r > 0) {
                if (fade != 1) {
                    c = fadeColor;
                } else if (hasUAColor) {
                    var rgb, cacheKey;
                    if (chartDef.uaColor[0].type == "NUMERICAL" && !chartDef.uaColor[0].treatAsAlphanum) {
                        cacheKey = data.values.color.num.data[i];
                    } else if (chartDef.uaColor[0].type == "DATE" && chartDef.uaColor[0].dateMode == "RANGE") {
                        cacheKey = data.values.color.ts.data[i];
                    } else {
                        cacheKey = data.values.color.str.data[i]
                    }
                    if (colorCache[cacheKey]) {
                        rgb = colorCache[cacheKey];
                    } else {
                        rgb = colorScale(cacheKey);
                        colorCache[cacheKey] = rgb;
                    }
                    c = rgb;
                } else {
                    c = _ScatterCommon.makeColor(chartDef, data, i, colorScale, resultingColor, colorCache)
                }

                if (initial && !quadtreeIsBroken) {
                    try {
                        quadtree.add([x, y, i, r, c]);
                    } catch (v) {
                        quadtreeIsBroken = true;
                    }
                }

                if (i % 10000 == 0) {
                    Logger.info("Draw", i);
                }

                if (hasUAShape) {
                    context.font = Math.round(r * 1.5) + "px FontAwesome";
                    context.textAlign = "center";
                    context.textBaseline = "middle";
                    context.fillStyle = c;
                    context.fillText(String.fromCharCode(parseInt(shapeScale(data.values.shape.str.data[i]), 16)), x, y);
                } else if (bubblesOptions.singleShape == "EMPTY_CIRCLE") {
                    context.strokeStyle = c;
                    context.lineWidth = 3;
                    context.beginPath();
                    context.arc(x, y, r, 0, 2 * Math.PI);
                    context.stroke();
                } else {
                    context.beginPath();
                    context.fillStyle = c;
                    context.arc(x, y, r, 0, 2 * Math.PI);
                    context.fill();
                }
            }
        }

        function getMousePos(canvas, evt) {
            var rect = canvas.getBoundingClientRect();
            return {
                x: evt.clientX - rect.left,
                y: evt.clientY - rect.top
            };
        }

        function getPointXValFormatted(i) {
            return _ScatterCommon.formattedVal(chartDef, data.xAxis, chartDef.uaXDimension[0], i);
        }

        function getPointYValFormatted(i) {
            return _ScatterCommon.formattedVal(chartDef, data.yAxis, chartDef.uaYDimension[0], i);
        }

        var uaLabel = ChartLabels.uaLabel;
        var tooltip = ChartViewCommon.createTooltip();
        tooltip.style("display", "none");

        function showTooltip(point) {
            if (chartHandler.noTooltips) return;

            var displayedUas = [];
            var isDisplayed = function (ua) {
                return displayedUas.filter(function (v) {
                        return v.column === ua.column && v.dateMode === ua.dateMode;
                    }).length > 0;
            };

            var tooltipHTML = sanitize(uaLabel(chartDef.uaXDimension[0])) + ": <strong>" + sanitize(getPointXValFormatted(point[2])) + "</strong><br />";
            displayedUas.push(chartDef.uaXDimension[0]);

            if (!isDisplayed(chartDef.uaYDimension[0])) {
                tooltipHTML += sanitize(uaLabel(chartDef.uaYDimension[0])) + ": <strong>" + sanitize(getPointYValFormatted(point[2])) + "</strong><br />";
                displayedUas.push(chartDef.uaYDimension[0]);
            }

            if (hasUAColor && !isDisplayed(chartDef.uaColor[0])) {
                tooltipHTML += sanitize(uaLabel(chartDef.uaColor[0])) + ": <strong>" + sanitize(_ScatterCommon.formattedVal(chartDef, data.values.color, chartDef.uaColor[0], point[2])) + "</strong><br />";
                displayedUas.push(chartDef.uaColor[0]);
            }
            if (hasUASize && !isDisplayed(chartDef.uaSize[0])) {
                tooltipHTML += sanitize(uaLabel(chartDef.uaSize[0])) + ": <strong>" + sanitize(_ScatterCommon.formattedVal(chartDef, data.values.size, chartDef.uaSize[0], point[2])) + "</strong><br />";
                displayedUas.push(chartDef.uaSize[0]);
            }
            if (hasUAShape && !isDisplayed(chartDef.uaShape[0])) {
                tooltipHTML += sanitize(uaLabel(chartDef.uaShape[0])) + ": <strong>" + sanitize(_ScatterCommon.formattedVal(chartDef, data.values.shape, chartDef.uaShape[0], point[2])) + "</strong><br />";
                displayedUas.push(chartDef.uaShape[0]);
            }

            if (chartDef.uaTooltip.length > 0) {
                tooltipHTML += "<hr/>";
            }

            chartDef.uaTooltip.forEach(function (ua, i) {
                tooltipHTML += ua.column + ": <strong>" + sanitize(_ScatterCommon.formattedVal(chartDef, data.values["tooltip_" + i], ua, point[2])) + "</strong><br/>";
            });

            tooltip.html($sanitize(tooltipHTML));

            var rect = canvas.getBoundingClientRect();
            var l;
            if (point[0] <= width / 2) {
                l = rect.left + point[0] / pxlr;
            } else {
                l = rect.left + point[0] / pxlr - $(tooltip.node()).width();
            }
            var t = rect.top + point[1] / pxlr;
            var color = point[4];
            tooltip.style("border", "2px " + color + " solid");

            tooltip.transition().duration(300)
                .style("left", l + "px")
                .style("top", t + "px")
                .style("opacity", 1)
                .style("display", "block")
        }

        function hideTooltip() {
            tooltip.transition()
                .duration(100)
                .style("opacity", 0)
                .style("display", "none");
        }

        function nearest(x, y, best, node) {
            var x1, x2, y1, y2;
            x1 = node.x1;
            y1 = node.y1;
            x2 = node.x2;
            y2 = node.y2;
            //eliminating area if no chance to find better than best among it
            if (x < x1 - best.d || x > x2 + best.d || y < y1 - best.d || y > y2 + best.d) {
                return best;
            }
            //if node has point we check if it's better thant current best
            var p = node.point;
            if (p) {
                var distance = Math.sqrt(
                    Math.pow(p[0] - x, 2) +
                    Math.pow(p[1] - y, 2));
                var zIndex = p[2];
                var radius = p[3];
                if (distance <= radius && (distance < best.d || zIndex > best.z)) {
                    best.d = distance;
                    best.p = p;
                }
            }

            //We choose the order of recursion among current node's children
            //depending on how the mouse is positionned in relation to current
            //node (bottom right, top right, bottom left, top left)
            var kids = node.nodes;
            var r = (2 * x > x1 + x2), b = (2 * y > y1 + y2),
                smartOrder = r ? (b ? [3, 2, 1, 0] : [1, 0, 3, 2]) : (b ? [2, 3, 0, 1] : [0, 1, 2, 3]);
            for (var i in smartOrder) {
                if (kids[smartOrder[i]]) best = nearest(x, y, best, kids[smartOrder[i]]);
            }

            return best;
        }

        canvas.addEventListener('mousemove', function (evt) {
            var mousePos = getMousePos(canvas, evt);
            var best = nearest(mousePos.x * pxlr, mousePos.y * pxlr, {d: height + width, z: 0, p: null}, quadtree);

            if (best.p) {
                hideTooltip();
                showTooltip(best.p);
            } else {
                hideTooltip();
            }

        });
        canvas.addEventListener("mouseout", hideTooltip);

        chartDef.compatibleAxis = (chartDef.uaXDimension[0].type === 'NUMERICAL' && chartDef.uaYDimension[0].type == 'NUMERICAL')
            || (chartDef.uaXDimension[0].type === 'DATE' && chartDef.uaYDimension[0].type == 'DATE');

        if (chartDef.compatibleAxis && chartDef.scatterOptions && chartDef.scatterOptions.equalScales) {

            var extent = function (v) {
                return Math.abs(v[1] - v[0]);
            };
            var xRatio = extent(chartBase.xAxis.scale().domain()) / extent(chartBase.xAxis.scale().range());
            var yRatio = extent(chartBase.yAxis.scale().domain()) / extent(chartBase.yAxis.scale().range());

            if (xRatio < yRatio) {
                var xRangeWidth = extent(chartBase.xAxis.scale().domain()) / yRatio;
                chartBase.xAxis.scale().range([dataZP.x, dataZP.x + xRangeWidth]);
            } else if (xRatio > yRatio) {
                var yRangeWidth = extent(chartBase.yAxis.scale().domain()) / xRatio;
                chartBase.yAxis.scale().range([dataZP.y, dataZP.y - yRangeWidth]);
            }
        }

        function clearCanvas() {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }

        function drawIdentityLine() {
            var start = Math.max(chartBase.xAxis.scale().domain()[0], chartBase.xAxis.scale().domain()[0]);
            var end = Math.min(chartBase.xAxis.scale().domain()[1], chartBase.xAxis.scale().domain()[1]);

            if (end < start) return;

            context.strokeStyle = "#777";
            context.beginPath();
            context.moveTo(xPositionScale(start), yPositionScale(start));
            context.lineTo(xPositionScale(end), yPositionScale(end));
            context.stroke();
        }

        function drawAllPoints(initial) {
            colorCache = {};
            console.time("drawAll");
            /*@console*/
            for (var i = 0; i < data.afterFilterRecords; i++) {
                drawPoint(i, initial);
            }
            quadtree.visit(function (node, x1, y1, x2, y2) {
                node.x1 = x1;
                node.y1 = y1;
                node.x2 = x2;
                node.y2 = y2;
            });
            console.timeEnd("drawAll");
            /*@console*/
            window.requestAnimationFrame(function () {
                window.requestAnimationFrame(function () {
                    Logger.info("Next frame ready");
                });
            })
        }

        function drawAllPointsWithColorFocus(val) {
            colorCache = {};
            Logger.info("START DRAW ALL");
            console.time("drawAll");
            for (var i = 0; i < data.afterFilterRecords; i++) {
                if (data.values.color.str.data[i] == val) {
                    drawPoint(i, false);
                } else {
                    drawPoint(i, false, 0.08);
                }
            }
            Logger.info("DONE DRAW ALL");
            console.timeEnd("drawAll");
            /*@console*/
        }

        function drawAllPointsWithShapeFocus(val) {
            colorCache = {};
            Logger.info("START DRAW ALL");
            console.time("drawAll");
            for (var i = 0; i < data.afterFilterRecords; i++) {
                if (data.values.shape.str.data[i] == val) {
                    drawPoint(i, false);
                } else {
                    drawPoint(i, false, 0.08);
                }
            }
            Logger.info("DONE DRAW ALL");
            console.timeEnd("drawAll");
            /*@console*/
        }

        if (chartDef.compatibleAxis && chartDef.scatterOptions && chartDef.scatterOptions.identityLine) {
            drawIdentityLine();
        }
        drawAllPoints(true);

        var hasColorLegend = (hasUAColor && (ChartUADimension.isAlphanumLike(chartDef.uaColor[0]) || ChartUADimension.isDiscreteDate(chartDef.uaColor[0])));
        if (hasUAShape || hasColorLegend) {
            var legend = {
                type: "COLOR_DISCRETE",
                items: []
            };

            if (hasColorLegend) {
                colorScale.domain().forEach(function (v) {
                    var item = {
                        label: data.values.color.str.sortedMapping[v],
                        color: colorScale(v),
                        focusFn: function () {
                            clearCanvas();
                            drawAllPointsWithColorFocus(v);
                        },
                        unfocusFn: function () {
                            clearCanvas();
                            drawAllPoints(false);
                        },
                        focused: false
                    };
                    legend.items.push(item);
                });
            }

            if (hasUAShape && hasColorLegend) {
                legend.items.push({separator: true});
            }

            if (hasUAShape) {
                shapeScale.domain().forEach(function (v) {
                    var item = {
                        label: data.values.shape.str.sortedMapping[v],
                        color: 'grey',
                        shape: String.fromCharCode(parseInt(shapeScale(v), 16)),
                        focusFn: function () {
                            clearCanvas();
                            drawAllPointsWithShapeFocus(v);
                        },
                        unfocusFn: function () {
                            clearCanvas();
                            drawAllPoints(false);
                        },
                        focused: false
                    };
                    legend.items.push(item);
                });
            }

            chartHandler.legends.length = 0;
            chartHandler.legends.push(legend);
        } else if (hasUAColor) {
            // Done in initChart
        } else {
            chartHandler.legends.length = 0;
        }
    }
}

// app.factory("Heatmap", function(ChartViewCommon, ChartUADimension,_ScatterCommon) {
//     return function(canvas, chartDef, data, chartHandler) {
//         var width = $(canvas).width() *2;
//         var height = $(canvas).height() *2;
//         var maxRadius = 20 * 2;
//         canvas.width = width ;
//         canvas.height = height;

//         var heatmap = createWebGLHeatmap({canvas: canvas});

//         /* Margins */
//         var dataML = 60 *2, axisML = 40 *2;
//         var dataMB = 60 *2, axisMB = 40 *2;
//         var dataMR = 20 *2;
//         var dataMT = 20 *2;

//         /* Data points */
//         var dataZP = { x: dataML, y:height - dataMB };
//         var dataFP = { x:width - dataMR, y:dataMT }

//         function drawPoint(i) {
//             var x,y,s,c, xv, yv, xbin, ybin;

//             if (chartDef.uaXDimension[0].type == "NUMERICAL") {
//                 xv = data.xAxis.num.data[i];
//                 x = xPositionScale(xv);
//             } else if (chartDef.uaXDimension[0].type == "ALPHANUM") {
//                 xbin = data.xAxis.str.data[i];
//                 xv = data.xAxis.str.sortedMapping[xbin].sortOrder
//                 x = xPositionScale(xv)
//             } else {
//                 throw Error("unhandled");
//             }
//             if (chartDef.uaYDimension[0].type == "NUMERICAL") {
//                 yv = data.yAxis.num.data[i];
//                 y = yPositionScale(yv);
//             } else {
//                 throw Error("unhandled");
//             }
//             if (data.values.size != null) {
//                 s = sizeScale(data.values.size.num.data[i]);
//                 //if (data.values.size.num.data[i] < )
//             } else {
//                 s = 18;
//             }

//             heatmap.addPoint(x, y, s, 0.15);
//         }

//         var xPositionScale = null, yPositionScale = null, sizeScale = null;

//         if (chartDef.uaXDimension[0].type == "NUMERICAL") {
//             xPositionScale = d3.scale.linear().range([dataZP.x, dataFP.x])
//                             .domain([data.xAxis.num.min, data.xAxis.num.max])
//         } else if (chartDef.uaXDimension[0].type == "ALPHANUM") {
//             xPositionScale = d3.scale.linear().range([dataZP.x, dataFP.x])
//                             .domain([0, data.xAxis.str.sortedMapping.length])
//         } else {
//             throw Error("unhandled");
//         }
//         if (chartDef.uaYDimension[0].type == "NUMERICAL") {
//             yPositionScale = d3.scale.linear().range([dataZP.y, dataFP.y])
//                             .domain([data.yAxis.num.min, data.yAxis.num.max])
//         } else {
//             throw Error("unhandled");
//         }

//         if (chartDef.uaSize.length) {
//             if (chartDef.uaSize[0].type == "NUMERICAL") {
//             sizeScale = d3.scale.sqrt().range([0, maxRadius])
//                             .domain([data.values.size.num.min, data.values.size.num.max])
//         } else {
//             throw Error("unhandled");
//         }
//         }

//         function renderPoints(){
//             for (var i = 0; i < data.afterFilterRecords; i++) {
//                 drawPoint(i);
//             }
//             heatmap.update();
//             heatmap.display();
//         }
//         renderPoints();
//     }
// })



})();
(function(){
'use strict';

angular.module('dataiku.charts')
    .factory('BinnedXYUtils', BinnedXYUtils)
    .factory('GroupedXYChart', GroupedXYChart)
    .factory('BinnedXYChart', BinnedXYChart);

function BinnedXYUtils() {
    return {
        prepareData: function(chartDef, chartData) {
            var xLabels = chartData.getAxisLabels('x'),
                yLabels = chartData.getAxisLabels('y'),
                points = [];

            xLabels.forEach(function (xLabel, x) {
                yLabels.forEach(function (yLabel, y) {
                    points.push({x: x, y: y});
                });
            });

            return points;
        },
        getRadius: function(chartDef, chartWidth, chartHeight) {
            switch(chartDef.hexbinRadiusMode) {
                case 'ABSOLUTE':
                    return chartDef.hexbinRadius;
                case 'NUM_HEXAGONS':
                    if (chartWidth < chartHeight) {
                        var hexWidth = Math.floor(chartWidth/chartDef.hexbinNumber);
                        return hexWidth / (2*Math.cos(Math.PI/6));
                    } else {
                        var hexHeight = Math.floor(chartHeight/chartDef.hexbinNumber);
                        return hexHeight / 1.5;
                    }
                default:
                    throw new Error("Unknown hexBinRadiusMode: " + chartDef.hexbinRadiusMode);
            }
        }
    }
}

function BinnedXYChart(ChartViewCommon, ChartTensorDataWrapper, BinnedXYUtils, d3Utils, ChartDimension, ChartDataUtils) {
    return function ($container, chartDef, chartHandler, axesDef, data) {
        var chartData = ChartTensorDataWrapper(data, axesDef),
            facetLabels = chartData.getAxisLabels('facet') || [null],
            pointsData = BinnedXYUtils.prepareData(chartDef, chartData);

        var sizeMeasure = (chartDef.sizeMeasure.length) ? 0 : -1,
            colorMeasure = (chartDef.colorMeasure.length && chartDef.sizeMeasure.length) ? 1 : (chartDef.colorMeasure.length ?  0 : -1),
            sizeScale = null,
            colorScale = null;

        if (sizeMeasure >= 0) {
            if (chartDef.variant == 'binned_xy_hex') {
                sizeScale = d3.scale.pow().exponent(.5).domain(ChartDataUtils.getMeasureExtent(data, sizeMeasure, true))
                    .range([10, chartDef.hexbinRadius]);
            } else {
                sizeScale = d3.scale.sqrt().domain(ChartDataUtils.getMeasureExtent(data, sizeMeasure, true));
            }
            chartDef.sizeMeasure.$mIdx = sizeMeasure;
        }

        var drawFrame = function (frameIdx, chartBase) {
            chartData.fixAxis('animation', frameIdx);
            facetLabels.forEach(function (facetLabel, f) {
                var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                if (chartDef.variant == 'binned_xy_hex') {
                    HexBinnedXYChartDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, pointsData, f);
                } else if (chartDef.variant === 'binned_xy_rect') {
                    RectBinnedXYChartDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, pointsData, f);
                } else {
                    BinnedXYChartDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, pointsData, f);
                }
            });
        };

        ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
            {type: 'DIMENSION', mode: 'POINTS', padding: 1, dimension: chartDef.xDimension[0], name: 'x'},
            {type: 'DIMENSION', mode: 'POINTS', padding: 1, dimension: chartDef.yDimension[0], name: 'y'}, null,
            {type: 'MEASURE', measureIdx: colorMeasure}
        );

        function getPointColor(d) {
            if (colorScale) {
                return colorScale(chartData.aggr(colorMeasure).get(d));
            } else {
                return chartDef.colorOptions.singleColor;
            }
        }

        function BinnedXYChartDrawer(g, chartDef, chartHandler, chartData, chartBase, pointsData, f) {

            var xStep = d3Utils.getOrdinalScaleRangeStep(chartBase.xAxis.ordinalScale);
            var yStep = d3Utils.getOrdinalScaleRangeStep(chartBase.yAxis.ordinalScale);
            var radius = Math.min(xStep / 3.5, yStep / 3.5);

            if (sizeMeasure >= 0) {
                sizeScale.range([1, Math.min(xStep / 2, yStep / 2)]);
            }
            if (colorMeasure >= 0) {
                colorScale = chartBase.colorScale;
            }

            var points = g.selectAll('circle.point').data(pointsData, function (d) {
                return d.x + '-' + d.y;
            });
            points.enter().append('circle')
                .attr('class', 'point')
                .attr('transform', function (d) {
                    return 'translate('
                        + (ChartDimension.isUnbinnedNumerical(chartDef.xDimension[0]) ? chartBase.xAxis.scale()(chartData.getAxisLabels('x')[d.x].sortValue) : chartBase.xAxis.ordinalScale(d.x)) + ','
                        + (ChartDimension.isUnbinnedNumerical(chartDef.xDimension[1]) ? chartBase.yAxis.scale()(chartData.getAxisLabels('y')[d.y].sortValue) : chartBase.yAxis.ordinalScale(d.y))
                        + ')';
                })
                .attr('fill', getPointColor)
                .attr("opacity", chartDef.colorOptions.transparency)
                .each(function (d) {
                    chartBase.tooltips.addTooltipHandlers(this, angular.extend({}, d, {facet: f}), getPointColor(d));
                });

            points.transition()
                .attr('r', function (d) {
                    if (chartData.getCount(d) > 0) {
                        if (sizeScale) {
                            return Math.ceil(sizeScale(chartData.aggr(sizeMeasure).get(d)));
                        } else {
                            return radius;
                        }
                    } else {
                        return 0;
                    }
                })
                .attr('fill', getPointColor);

        }

        function RectBinnedXYChartDrawer(g, chartDef, chartHandler, chartData, chartBase, pointsData, f) {

            var xStep = d3Utils.getOrdinalScaleRangeStep(chartBase.xAxis.ordinalScale);
            var yStep = d3Utils.getOrdinalScaleRangeStep(chartBase.yAxis.ordinalScale);
            var widthScale, heightScale;

            if (sizeMeasure >= 0) {
                widthScale = sizeScale.copy().range([0.1*xStep, xStep]);
                heightScale = sizeScale.copy().range([0.1*yStep, yStep]);
            }
            if (colorMeasure >= 0) {
                colorScale = chartBase.colorScale;
            }

            var rectWidth = function(d) {
                if (chartData.getCount(d) > 0) {
                    if (widthScale) {
                        return Math.ceil(widthScale(chartData.aggr(sizeMeasure).get(d)));
                    } else {
                        return xStep;
                    }
                } else {
                    return 0;
                }
            };

            var rectHeight = function(d) {
                if (chartData.getCount(d) > 0) {
                    if (heightScale) {
                        return Math.ceil(heightScale(chartData.aggr(sizeMeasure).get(d)));
                    } else {
                        return yStep;
                    }
                } else {
                    return 0;
                }
            };

            var points = g.selectAll('rect.point').data(pointsData, function (d) {
                return d.x + '-' + d.y;
            });
            points.enter().append('rect')
                .attr('class', 'point')
                .attr('fill', getPointColor)
                .attr("opacity", chartDef.colorOptions.transparency)
                .each(function (d) {
                    chartBase.tooltips.addTooltipHandlers(this, angular.extend({}, d, {facet: f}), getPointColor(d));
                });

            points.transition()
                .attr('x', function (d) {
                    return chartBase.xAxis.ordinalScale(d.x) - rectWidth(d)/2;
                })
                .attr('y', function(d) {
                    return chartBase.yAxis.ordinalScale(d.y) - rectHeight(d)/2;
                })
                .attr('width', rectWidth)
                .attr('height', rectHeight)
                .attr('fill', getPointColor);

        }

        function HexBinnedXYChartDrawer(g, chartDef, chartHandler, chartData, chartBase, pointsData, f) {
            if (colorMeasure >= 0) {
                colorScale = chartBase.colorScale;
            }

            var radius = BinnedXYUtils.getRadius(chartDef, chartHandler.request.$expectedVizWidth, chartHandler.request.$expectedVizHeight);
            if (sizeScale) {
                sizeScale.range([3, radius]);
            }

            function hexagon(radius) {
                var d3_hexbinAngles = d3.range(0, 2 * Math.PI, Math.PI / 3);
                var x0 = 0, y0 = 0;
                return d3_hexbinAngles.map(function(angle) {
                    var x1 = Math.sin(angle) * radius,
                        y1 = -Math.cos(angle) * radius,
                        dx = x1 - x0,
                        dy = y1 - y0;
                    x0 = x1;
                    y0 = y1;
                    return [dx, dy];
                });
            }

            function hexagonPath(radius) {
                return "m" + hexagon(radius).join("l") + "z";
            }

            // Approximate chart dimensions are in ChartRequestComputer to determine the number of X & Y hexagons to be generated by the backend
            // These dimensions may be changed by initChart (margins adjustements to fit axis labels or space used by the OUTER_* legends placement)
            // We rescale the mainzone to compensate for these changes and still show all generated hexagons

            var mainZone = g.selectAll('g.mainzone').data([null]);
            mainZone.enter().append('g').attr('class', 'mainzone');
            mainZone.attr('transform', 'scale(' + chartBase.vizWidth/chartHandler.request.$expectedVizWidth + ', ' + chartBase.vizHeight/chartHandler.request.$expectedVizHeight + ') translate(0, ' + (chartHandler.request.$expectedVizHeight-chartBase.vizHeight) + ')');

            var hexagons = mainZone.selectAll('path.hexagon').data(pointsData, function(d) { return d.x + '-' + d.y; });

            var formatHexagons = function(sel) {
                return sel.attr('transform', function(d) {
                    var hexagonX = d.x * radius * 2 * Math.sin(Math.PI/3);
                    var hexagonY = chartBase.vizHeight - (d.y * radius * 1.5);
                    if (d.y % 2 == 1) {
                        hexagonX += Math.sin(Math.PI/3)*radius;
                    }
                    return "translate(" + (hexagonX+ parseInt(radius)) +  "," + (hexagonY- parseInt(radius)) + ")";
                    }).attr('d', function(d) {
                        if (chartData.getCount(d) > 0) {
                            if (sizeScale) {
                                return hexagonPath(sizeScale(chartData.aggr(sizeMeasure).get(d)));
                            } else {
                                return hexagonPath(radius);
                            }
                        } else {
                            return 'm0,0z';
                        }
                    })
                    .attr('fill', getPointColor);
            };

            hexagons.enter().append('path').attr('class', 'hexagon')
                .call(formatHexagons)
                .attr("opacity", chartDef.colorOptions.transparency)
                .each(function(d) {
                    chartBase.tooltips.addTooltipHandlers(this, angular.extend({}, d, {facet: f}), getPointColor(d));
                });
            hexagons.exit().remove();

            hexagons.transition().call(formatHexagons);
        }
    }
}

function GroupedXYChart(ChartViewCommon, ChartTensorDataWrapper, ChartColorUtils, ChartDataUtils) {
    return function ($container, chartDef, chartHandler, axesDef, data) {
        var chartData = ChartTensorDataWrapper(data, axesDef),
            facetLabels = chartData.getAxisLabels('facet') || [null]; // We'll through the next loop only once if the chart is not facetted

        var xMeasure = 0,
            yMeasure = 1,
            sizeMeasure = (chartDef.sizeMeasure.length) ? 2 : -1,
            colorMeasure = (chartDef.colorMeasure.length && chartDef.sizeMeasure.length) ? 3 : (chartDef.colorMeasure.length ?  2 : -1),
            sizeScale = null,
            color = ChartColorUtils.toRgba(chartDef.colorOptions.singleColor, chartDef.colorOptions.transparency);


        if (sizeMeasure >= 0) {
            sizeScale = d3.scale.sqrt().domain(ChartDataUtils.getMeasureExtent(data, sizeMeasure, true)).range([Math.min(10, chartDef.bubblesOptions.defaultRadius), Math.max(10, chartDef.bubblesOptions.defaultRadius)]);
            chartDef.sizeMeasure.$mIdx = sizeMeasure;
        }

        if (colorMeasure >= 0) {
            chartDef.colorMeasure.$mIdx = colorMeasure;
        }

        var drawFrame = function (frameIdx, chartBase) {
            chartData.fixAxis('animation', frameIdx);
            facetLabels.forEach(function (facetLabel, f) {
                var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                GroupedXYChartDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, f);
            });

            // Signal to the callee handler that the chart has been successfully loaded. Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        };

        ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
            {type: 'MEASURE', measureIdx: xMeasure, measure: chartDef.xMeasure},
            {type: 'MEASURE', measureIdx: yMeasure, measure: chartDef.yMeasure},
            null,
            {type: 'MEASURE', measureIdx: colorMeasure, measure: chartDef.colorMeasure}
        );

        function GroupedXYChartDrawer(g, chartDef, chartHandler, chartData, chartBase, f) {

            function getBubbleColor(d,i) {
                if (colorMeasure >= 0) {
                    return chartBase.colorScale(chartData.aggr(colorMeasure).get({group: d.$i}));
                } else {
                    return color;
                }
            }

            var bubbles = g.selectAll('circle').data(chartData.getAxisLabels('group'), function(d,i) { return i; });
            bubbles.enter().append('circle')
                .attr('fill', getBubbleColor)
                .each(function (d, i) {
                    d.$i = i;
                    chartBase.tooltips.addTooltipHandlers(this, {group: i, facet: f}, getBubbleColor(d,i));
                });

            bubbles
                .filter(function(d) { return chartData.getCount({group: d.$i}) === 0; })
                .transition()
                .duration((chartDef.animationFrameDuration || 3000)/2)
                .attr('opacity', 0)
                .attr('cx', null)
                .attr('cy', null)
                .attr('r', null);

            bubbles
                .filter(function(d) { return chartData.getCount({group: d.$i}) > 0; })
                .transition()
                .duration((chartDef.animationFrameDuration || 3000)/2)
                .attr('opacity', 1)
                .attr('cx', function(d) { return chartBase.xAxis.scale()(chartData.aggr(xMeasure).get({group: d.$i})); })
                .attr('cy', function(d) { return chartBase.yAxis.scale()(chartData.aggr(yMeasure).get({group: d.$i})); })
                .attr('r',  function(d) {
                    if (sizeScale) {
                        return sizeScale(chartData.aggr(sizeMeasure).get({group: d.$i}));
                    } else {
                        return chartDef.bubblesOptions.defaultRadius;
                    }
                })
                .attr('fill', getBubbleColor);
        }
    }
}


})();

(function(){
'use strict';

var app = angular.module('dataiku.charts')


app.factory("Density2DChart", function(ChartViewCommon, ChartColorScales)  {
    return function(svg, chartDef, data, chartHandler) {
        var width = $(svg).width();
        var height = $(svg).height();
        var margins = {top: 10, right: 50, bottom: 50, left: 50};
        var chartWidth = width - margins.left - margins.right;
        var chartHeight = height - margins.top - margins.bottom;

        var g = ChartViewCommon.getUpdatedGByClass(svg, "scatter_2d", width, height, margins);

        var xScale = d3.scale.linear().domain([data.xMin, data.xMax]).range([0, chartWidth]);
        var yScale = d3.scale.linear().domain([data.yMin, data.yMax]).range([chartHeight, 0]);

        var xAxis = d3.svg.axis().scale(xScale).orient("bottom");
        var yAxis = d3.svg.axis().scale(yScale).orient("left");

        var colorScale =  ChartColorScales.continuousColorScale(chartDef, data.minDensity, data.maxDensity, data.density);

        var tooltip = ChartViewCommon.createTooltip();

        // i = xc  + yc * xSteps

        var rectWidth = chartWidth / data.xSteps;
        var rectHeight = chartHeight / data.ySteps;

        g.selectAll(".densityrect").data(data.density)
            .enter().append("rect")
                .attr('class', 'densityrect')
                //.attr("xc", function(d, i) { return i % data.xSteps})
                .attr("yc", function(d, i) { return Math.floor(i / data.xSteps)})
                .attr("yv", function(d, i) {
                    var yc = Math.floor(i / data.xSteps) + 1; // NOT A TYPO
                    var yv = data.yMin + yc * (data.yMax - data.yMin)/data.ySteps;
                    return yv
                })
                .attr("x", function(d, i) {
                    var xc = i % data.xSteps;
                    var xv = data.xMin + xc * (data.xMax - data.xMin)/data.xSteps;
                    
                    return xScale(xv);
                })
                .attr("y", function(d, i) {
                    var yc = Math.floor(i / data.xSteps) + 1; // NOT A TYPO
                    var yv = data.yMin + yc * (data.yMax - data.yMin)/data.ySteps;
                    return yScale(yv);
                })
                .attr("width", rectWidth)
                .attr("height", rectHeight)
                .attr("fill", function(d, i) {
                    return colorScale(d);
                })
                .attr("stroke", function(d, i) {
                    return colorScale(d);
                });
                // .on("mouseover", function(d) {
                //     var html=
                //         chartHandler.dimensionLabel(chartDef.xDimension[0]) + ": <strong>" + 
                //         ChartViewCommon.labelify(data.xLabels[d.xLabel].label) + "</strong><br />"+
                //         chartHandler.dimensionLabel(chartDef.yDimension[0]) + ": <strong>" + 
                //         ChartViewCommon.labelify(data.yLabels[d.yLabel].label) + "</strong>";
                //     if (sizeMeasure >= 0) {
                //         html += "<br />";
                //         html += chartHandler.measureLabel(chartDef.sizeMeasure[0]) + ":  <strong>" + d.size + "</strong>";
                //     }
                //     if (colorMeasure >= 0) {
                //         html += "<br />";
                //         html += chartHandler.measureLabel(chartDef.colorMeasure[0]) + ":  <strong>" + d.color + "</strong>";
                //     }
                //     ChartViewCommon.tooltipAppear(tooltip, colorScale ? colorScale(d.color) : '#F5A011').html(html);
                // }).on("mouseout", function(d) {
                //     ChartViewCommon.tooltipDisappear(tooltip);
                // });

        g.append("g")
            .attr("class", "x axis")
            .style('fill', '#999')
            .style('stroke', '#999')
            .attr("transform", "translate(0," + chartHeight + ")")
            .call(xAxis);
        g.append("g")
            .attr("class", "y axis")
            .style('fill', '#999')
            .style('stroke', '#999')
            .call(yAxis);

        chartHandler.legends.length = 0;

        // Signal to the callee handler that the chart has been successfully loaded. Dashboards use it to determine when all insights are completely loaded.
        if (typeof(chartHandler.loadedCallback) === 'function') {
            chartHandler.loadedCallback();
        }
    };
})


})();
(function(){
'use strict';

const app = angular.module('dataiku.charts');


app.factory("_MapCharts", function(Assert, ChartViewCommon, ChartDimension, _ScatterCommon, ChartLabels, Logger, ChartLegendUtils, localStorageService, $state, $stateParams) {
    function getLSKey(elt) {
        let lsKey = 'DSSMapPosition.';
        const mapScope = angular.element(elt).scope();
        if ($state.current.name.startsWith('projects.project.datasets.dataset.visualize')) {
            lsKey += 'explore.' + $stateParams.projectKey + '.' + $stateParams.datasetName + '.' + mapScope.currentChart.index;
        } else if ($state.current.name.startsWith('projects.project.analyses.analysis')) {
            lsKey += 'analysis.' + $stateParams.projectKey + '.' + $stateParams.analysisId + '.' + mapScope.currentChart.index;
        } else if ($state.current.name.startsWith('projects.project.dashboards.insights.insight')) {
            lsKey += 'insight.' + $stateParams.projectKey + '.' + $stateParams.insightId;
        } else if ($state.current.name.startsWith('projects.project.dashboards.dashboard')) {
            lsKey += 'insight.' + $stateParams.projectKey + '.' + mapScope.insight.id;
        } else {
            lsKey += 'other.' + $state.current.name;
        }
        return lsKey;
    }

      var svc = {
        createMapIfNeeded : function(elt, chartSpecific, chartDef) {
            var map = elt.data("leaflet-map");

            if (!map) {
                Logger.info("Creating map");
                map = L.map(elt[0]).setView([20,0], 2);
                chartSpecific.leafletMap = map;
                elt.data("leaflet-map", map);
                map.$justCreated = true;
                function mapMoves() {
                    localStorageService.set(getLSKey(elt), {center: map.getCenter(), zoom: map.getZoom()});
                }
                map.on('zoomend', mapMoves);
                map.on('moveend', mapMoves);
            } else {
                map.$justCreated = false;
            }
            var prevLayerId = elt.data("leaflet-tile-layer-id");

            var layerId = "cartodb-positron";
            if (chartDef.mapOptions && chartDef.mapOptions.tilesLayer) {
                layerId = chartDef.mapOptions.tilesLayer;
            }
            var foundLayer = dkuMapBackgrounds.backgrounds.find(b => b.id === layerId);
            if (!foundLayer) {
                layerId = "cartodb-positron";
                foundLayer = dkuMapBackgrounds.backgrounds.find(b => b.id === layerId);
            }

            Logger.info("New layer", layerId, "Previous layer", prevLayerId);

            if (prevLayerId && layerId != prevLayerId) {
                Logger.info("Removing previous layer");;
                var prevLayer = elt.data("leaflet-tile-layer");
                map.removeLayer(prevLayer);
            }
            if (!prevLayerId || layerId != prevLayerId) {
                Logger.info("Adding layer");
                Assert.trueish(foundLayer, 'layer not found');
                var layer = foundLayer.getTileLayer();
                map.addLayer(layer);
                elt.data("leaflet-tile-layer-id", layerId);
                elt.data("leaflet-tile-layer", layer);
            }
            return map;
        },

        repositionMap : function(map, elt, data) {
            if (!elt.data("leaflet-map-positioned") && data.minLat > -90.0) {
                elt.data("leaflet-map-positioned", 1);
                const previousPosition = localStorageService.get(getLSKey(elt));
                if (previousPosition) {
                    map.setView(previousPosition.center, previousPosition.zoom);
                } else {
                    map.fitBounds([[data.minLat, data.minLon], [data.maxLat, data.maxLon]], {padding : [10,10]});
                }
            }
        },

        getOrCreateMapContainer: function($container) {
            var elt = $container.find('.map-container');
            if (!elt.length) {
                elt = $('<div class="map-container mainzone w100 h100">').appendTo($container);
            }
            return elt;
        },

        adjustLegendPlacement: function(chartDef, $container) {

            var margins = {top: 5, bottom: 5, left: 5, right: 5};

            // Avoid collision with leafleft controls
            switch (chartDef.legendPlacement) {
                case 'INNER_TOP_LEFT':
                    margins.top = 10;
                    margins.left = 45;
                    break;
                case 'INNER_BOTTOM_RIGHT':
                    margins.bottom = 20;
                    break;
            }

            return ChartLegendUtils.adjustLegendPlacement(chartDef, $container, margins);
        }
    };

    return svc;
});

app.controller("MapBackgroundPickerController", function($scope) {
   $scope.backgrounds = window.dkuMapBackgrounds.backgrounds;
    $scope.categories = {};
    window.dkuMapBackgrounds.backgrounds.forEach(function(background) {
        if (!$scope.categories[background.category]) {
            $scope.categories[background.category] = [background];
        } else {
            $scope.categories[background.category].push(background);
        }
    });
});

})();

(function(){
'use strict';

var app = angular.module('dataiku.charts')

app.factory("AdministrativeMap", function(ChartViewCommon, ChartDimension, _MapCharts, ChartLegendUtils, ChartColorUtils, ChartColorScales) {
    return function($container, chartDef, data, chartHandler) {

        var elt = _MapCharts.getOrCreateMapContainer($container);
        var geo = JSON.parse(data.geoJson);

        var aggrVals = function (aggregId) {
            var feat, featIdx, arr = [];
            for (featIdx in geo.features) {
                feat = geo.features[featIdx];
                if (feat.properties[aggregId]) {
                    arr.push(feat.properties[aggregId]);
                }
            }
            return arr;
        };

        var aggrBounds = function (aggregId) {
            var arr = aggrVals(aggregId);
            return [d3.min(arr), d3.max(arr)]
        };

        var colorScale, singleColor;
        if (chartDef.colorMeasure.length) {
            colorScale = ChartColorScales.continuousColorScale(chartDef, aggrBounds("color")[0], aggrBounds("color")[1], aggrVals("color"), false);
            colorScale.type = 'MEASURE';
        } else {
            singleColor = ChartColorUtils.toRgba(chartDef.colorOptions.singleColor, chartDef.colorOptions.transparency);
        }

        ChartLegendUtils.initLegend(chartDef, null, chartHandler, colorScale);
        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function () {

            _MapCharts.adjustLegendPlacement(chartDef, $container);

            var map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
            if (elt.data("leaflet-data-layer")) {
                map.removeLayer(elt.data("leaflet-data-layer"));
            }
            _MapCharts.repositionMap(map, elt, data);

            var sizeScale = d3.scale.sqrt().range([chartDef.bubblesOptions.defaultRadius, chartDef.bubblesOptions.defaultRadius*5]).domain(aggrBounds("size"));
            var valuesFormatterLong = ChartViewCommon.getMeasuresFormatter(chartDef, true);
            //var colorScale = d3.scale.log().range(['#9999CC', '#0000AA'])
            //          .interpolate(d3.interpolateLab).domain(aggrBounds("a_0"));

            var ml = chartHandler.measureLabel;
            function onEachFeature(feature, layer) {
                if (chartHandler.noTooltips) return;

                var html = "<h4>" + feature.properties.label+"</h4>";

                if (feature.properties.color) {
                    html += ml(chartDef.colorMeasure[0]);
                    html += ": <strong>";
                    html += valuesFormatterLong(feature.properties.color) +"</strong><br />";

                }
                if (feature.properties.size) {
                    html += ml(chartDef.sizeMeasure[0]);
                    html += ": <strong>";
                    html += valuesFormatterLong(feature.properties.size) +"</strong><br />";
                }
                if (feature.properties.count !== undefined) {
                    html += "Value count" + ": <strong>";
                    html += valuesFormatterLong(feature.properties.count ) +"</strong><br />";
                }

                if (chartDef.tooltipMeasures.length > 0) {
                    html += "<hr/>"
                }
                chartDef.tooltipMeasures.forEach(function(measure, j) {
                    html += ml(measure) + ": <strong>" + valuesFormatterLong(feature.properties[j]) + "</strong><br/>";
                });

                layer.bindPopup(html);
            }
            if (chartDef.variant == "filled_map") {
                chartDef.sizeMeasure = [];
                var myStyle = function(feature) {
                    return {
                        "color": singleColor || colorScale(feature.properties["color"]),
                        "fillColor": singleColor || colorScale(feature.properties["color"]),
                        "fillOpacity" : chartDef.fillOpacity,
                        "weight": 1,
                        "opacity": 1,
                    }
                };
                var layer = L.geoJson(geo.features, {
                    style: myStyle,
                    onEachFeature : onEachFeature
                });
                map.addLayer(layer);
            } else {
                var layer = L.geoJson(geo.features, {
                    pointToLayer : function(feature, latlng) {
                        var size = feature.properties["size"] != null ? sizeScale(feature.properties["size"]) : chartDef.bubblesOptions.defaultRadius;
                        var color = singleColor || (feature.properties["color"] != null ? colorScale(feature.properties["color"]) : "#666");

                        return L.circleMarker(latlng, {
                            radius : size,
                            "color": color,
                            "fillColor": color,
                            "opacity" : 0.85,
                            "fillOpacity" : 0.85
                        })
                    },
                    onEachFeature : onEachFeature
                });
                map.addLayer(layer);
            }

            elt.data("leaflet-data-layer", layer);
        }).finally(function(){
            // Signal to the callee handler that the chart has been loaded.
            // Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        });
    }
});

})();

/* jshint loopfunc: true*/
(function(){
'use strict';

var app = angular.module('dataiku.charts')

app.factory("ScatterMapChart", function(ChartViewCommon, ChartUADimension, _MapCharts, ChartLabels, _ScatterCommon, ChartLegendUtils, ChartColorUtils) {
    return function($container, chartDef, data, chartHandler) {

        var elt = _MapCharts.getOrCreateMapContainer($container);

        var layerGroup, colorScale;

        // Build color scale
        var hasUAColor = _ScatterCommon.hasUAColor(chartDef);
        if (hasUAColor) {
            colorScale = _ScatterCommon.makeColorScale(chartDef, data, chartHandler);
        } else {
            var resultingColor = _ScatterCommon.makeSingleColor(chartDef);
        }

        // Build legend
        if (hasUAColor && (ChartUADimension.isAlphanumLike(chartDef.uaColor[0]) || ChartUADimension.isDiscreteDate(chartDef.uaColor[0]))) {
            var legend = {
                type : "COLOR_DISCRETE",
                items : []
            };

            var baseFadeColor = dkuMapBackgrounds.backgrounds.find(b => b.id === chartDef.mapOptions.tilesLayer).fadeColor || "#333";
            var fadeColor = ChartColorUtils.toRgba(baseFadeColor,.5*chartDef.colorOptions.transparency);

            data.values.color.str.sortedMapping.forEach(function(value, v) {
                legend.items.push({
                    label :  data.values.color.str.sortedMapping[v],
                    color: colorScale(v),
                    focusFn : function(){
                        layerGroup.getLayers().forEach(function(layer) {
                            var opts = layer.options;
                            if(!opts.actualFillColor) opts.actualFillColor = opts.fillColor;

                            if (opts.colorIdx !== v) {
                                opts.fillColor = fadeColor;
                            } else {
                                opts.fillColor = opts.actualFillColor;
                            }

                            layer.setStyle(opts);
                        });
                    },
                    unfocusFn : function(){
                        layerGroup.getLayers().forEach(function(layer) {
                            var opts = layer.options;
                            opts.fillColor = opts.actualFillColor;
                            layer.setStyle(opts);
                        });
                    },
                    focused : false
                });
            });

            chartHandler.legends.length = 0;
            chartHandler.legends.push(legend);
        } else {
            if (colorScale) {
                colorScale.type = 'MEASURE';
            }
            ChartLegendUtils.initLegend(chartDef, null, chartHandler, colorScale);
            if (colorScale) {
                if (ChartUADimension.isDateRange(chartDef.uaColor[0])) {
                    chartHandler.legends[0].formatter = function(d) { return d3.time.format('%Y-%m-%d')(new Date(d)); }
                } else {
                    chartHandler.legends[0].formatter = ChartViewCommon.createMeasureFormatter(chartDef.colorMeasure[0], colorScale.innerScale.domain(), 10);
                }
            }
        }

        // Draw legend, then map
        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function() {
            _MapCharts.adjustLegendPlacement(chartDef, $container);

            var map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
            if (elt.data("leaflet-data-layer")) {
                map.removeLayer(elt.data("leaflet-data-layer"));
            }
            _MapCharts.repositionMap(map, elt, data);

            var hasUASize = _ScatterCommon.hasUASize(chartDef);
            if (hasUASize) {
                var sizeScale = _ScatterCommon.makeSizeScale(chartDef, data, 1);
            }

            var vf = ChartViewCommon.getMeasuresFormatter(chartDef);
            var uaLFn = ChartLabels.uaLabel;

            layerGroup = L.layerGroup();
            var colorCache = {};

            data.xAxis.num.data.forEach(function(x, i) {
                var y = data.yAxis.num.data[i];
                var r = _ScatterCommon.makeSize(chartDef, data, i, sizeScale);
                var c = _ScatterCommon.makeColor(chartDef, data, i, colorScale, resultingColor, colorCache);

                var options = {
                    radius : r,
                    fillOpacity: 1
                };

                // Used for the legend to highlight everything with the same color label
                if (ChartUADimension.isAlphanumLike(chartDef.uaColor[0]) || ChartUADimension.isDiscreteDate(chartDef.uaColor[0])) {
                    options.colorIdx = data.values.color.str.data[i];
                }

                if (chartDef.bubblesOptions.singleShape == "EMPTY_CIRCLE") {
                    options.stroke = true;
                    options.fill = false;
                    options.color = c;
                } else {
                    options.stroke = false;
                    options.fill = true;
                    options.fillColor = c;
                }

                // LatLng
                var pointLayer = L.circleMarker([y, x],options);

                if (!chartHandler.noTooltips) {

                    var html = "";
                    html += "Lon: <strong>" + vf(x) +"</strong><br />";
                    html += "Lat: <strong>" + vf(y) +"</strong><br />";
                    if (hasUAColor) {
                        html += uaLFn(chartDef.uaColor[0]) + ": <strong>" +
                            _ScatterCommon.formattedColorVal(chartDef, data, i) +"</strong><br />";
                    }
                    if (hasUASize && (!hasUAColor || (chartDef.uaSize[0].column !== chartDef.uaColor[0].column || chartDef.uaColor[0].dateMode !== 'RANGE'))) {
                        html += uaLFn(chartDef.uaSize[0]) + ": <strong>" +
                            _ScatterCommon.formattedSizeVal(chartDef, data, i) +"</strong><br />";
                    }

                    if (chartDef.uaTooltip.length > 0) {
                        html += "<hr/>";
                    }

                    chartDef.uaTooltip.forEach(function(ua, j) {
                        html += uaLFn(ua) + ": <strong>" + _ScatterCommon.formattedVal(chartDef, data.values["tooltip_" + j], ua, i) + "</strong><br/>";
                    });

                    pointLayer.bindPopup(html);
                }

                layerGroup.addLayer(pointLayer);
            });

            layerGroup.addTo(map);
            elt.data("leaflet-data-layer", layerGroup);
        }).finally(function(){
            // Signal to the callee handler that the chart has been loaded.
            // Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        });
    }
});

app.factory("GridMapChart", function(ChartViewCommon, ChartUADimension, _MapCharts, ChartLabels, _ScatterCommon, ChartLegendUtils, ChartColorScales) {
    return function($container, chartDef, data, chartHandler) {

        var elt = _MapCharts.getOrCreateMapContainer($container);
        var map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
        if (elt.data("leaflet-data-layer")) {
            map.removeLayer(elt.data("leaflet-data-layer"));
        }
        _MapCharts.repositionMap(map, elt, data);

        // Build color scale
        var hasColor = chartDef.colorMeasure.length;
        var colorScale, resultingColor;
        if (hasColor) {
            colorScale = ChartColorScales.continuousColorScale(chartDef, data.aggregations.color.min, data.aggregations.color.max, data.aggregations.color.data);
            colorScale.type = 'MEASURE';
        } else {
            resultingColor = _ScatterCommon.makeSingleColor(chartDef);
        }

        ChartLegendUtils.initLegend(chartDef, null, chartHandler, colorScale);
        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function () {
            _MapCharts.adjustLegendPlacement(chartDef, $container);

            var vf = ChartViewCommon.getMeasuresFormatter(chartDef);
            var ml = chartHandler.measureLabel;

            var layerGroup = L.layerGroup();

            data.cellMinLat.forEach(function (x, i) {
                var minLat = data.cellMinLat[i];
                var minLon = data.cellMinLon[i];
                var maxLat = minLat + data.gridLatDeg;
                var maxLon = minLon + data.gridLonDeg;

                var c = hasColor ? colorScale(data.aggregations.color.data[i]) : resultingColor;

                var rect = L.rectangle([[minLat, minLon], [maxLat, maxLon]], {
                    stroke: false,
                    fill: true,
                    fillColor: c,
                    fillOpacity: 1
                });

                if (!chartHandler.noTooltips) {
                    var html = "";
                    html += "Lon: <strong>" + vf(minLon + (maxLon - minLon) / 2) + "</strong><br />";
                    html += "Lat: <strong>" + vf(minLat + (maxLat - minLat) / 2) + "</strong><br />";
                    if (hasColor) {
                        html += ChartLabels.longMeasureLabel(chartDef.colorMeasure[0])
                            + ": <strong>" + vf(data.aggregations.color.data[i]) + "</strong>";
                    }
                    if (chartDef.tooltipMeasures.length > 0) {
                        html += "<hr/>"
                    }
                    chartDef.tooltipMeasures.forEach(function(measure, j) {
                        html += ml(measure) + ": <strong>" + vf(data.aggregations['tooltip_' + j].data[i]) + "</strong><br/>";
                    });
                    rect.bindPopup(html);
                }

                layerGroup.addLayer(rect);
            });
            layerGroup.addTo(map);

            elt.data("leaflet-data-layer", layerGroup);
        }).finally(function(){
            // Signal to the callee handler that the chart has been loaded.
            // Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        });
    }
});


app.factory("DensityHeatMapChart", function(ChartViewCommon, ChartUADimension, _MapCharts, ChartLabels, _ScatterCommon, ChartLegendUtils, ChartColorScales) {
    return function($container, chartDef, data, chartHandler) {

        const elt = _MapCharts.getOrCreateMapContainer($container);
        // Handle the scatter map diverging color paletter after transition to density map
        chartHandler.legends.pop();
        chartDef.colorOptions.paletteType = "CONTINUOUS";

        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container, ChartColorScales).then(function() {
            _MapCharts.adjustLegendPlacement(chartDef, $container);

            // Create leaflet layer
            let layerGroup = L.layerGroup();

            // Get map
            let map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
            _MapCharts.repositionMap(map, elt, data);

            // Remove the existing layer to avoid multiple layers
            if (elt.data("leaflet-data-layer")) {
                map.removeLayer(elt.data("leaflet-data-layer"));
            }


            // Remove the existing heatmap is there is one
            let existingHeatMapLayer;
            map.eachLayer(function(layer){
                if (layer.options && layer.options.id) {
                    if (layer.options.id === "heatmap"){
                        existingHeatMapLayer = layer;
                    }
                }
            })
            if (existingHeatMapLayer){
                map.removeLayer(existingHeatMapLayer)
            }

            // Get the gradient for leaflet heatmap
            let paletteId = chartDef.colorOptions.colorPalette;
            let chartSpec = {colorOptions: {colorPalette: paletteId, transparency: 1}};
            let scale = ChartColorScales.continuousColorScale(chartSpec, 0, 1);
            let gradient = {};
            for (let i=0; i <= 9; i++) {
                gradient[i/10] = scale(i/10);
            }

            let vf = ChartViewCommon.getMeasuresFormatter(chartDef);
            let uaLFn = ChartLabels.uaLabel;
            let hasUAColor = false;

            // Intermediate operation for the scale computation in the scatter plot
            const makeIntensityScale = function(chartDef, data) {
                if (ChartUADimension.isTrueNumerical(chartDef.uaSize[0])) {
                    return d3.scale.sqrt().range([1, 100])
                        .domain([data.values.size.num.min, data.values.size.num.max]);
                } else if (ChartUADimension.isDateRange(chartDef.uaSize[0])) {
                    return d3.scale.sqrt().range([1, 100])
                        .domain([data.values.size.ts.min, data.values.size.ts.max]);
                } else {
                    throw new ChartIAE("Cannot use ALPHANUM as size scale");
                }
            }

            // If a column is given as a size in the front bar, create the helper function to get the right weight
            const hasUASize = _ScatterCommon.hasUASize(chartDef);
            let intensityScale;
            let getScaleWeight;
            if (hasUASize) {
                intensityScale = makeIntensityScale(chartDef, data);
                getScaleWeight = function(chartDef, data, i, sizeScale){
                    if (chartDef.uaSize.length) {
                        let sizeValue;
                        if (ChartUADimension.isTrueNumerical(chartDef.uaSize[0])) {
                            sizeValue = data.values.size.num.data[i];
                        } else if (ChartUADimension.isDateRange(chartDef.uaSize[0])) {
                            sizeValue = data.values.size.ts.data[i];
                        }
                        return sizeScale(sizeValue);
                    } else {
                        return 1;
                    }
                };
            }

            // Tuning values for the visual parameters
            const intensityRangeMultiplier = 1000;
            const radiusRangeMultiplier = 40;

            // Create the core data that will be displayed by Leaflet.heat
            let geopoints = [];
            data.xAxis.num.data.forEach(function(x, i) {
                let y = data.yAxis.num.data[i];
                let r;
                if (hasUASize){
                    r = getScaleWeight(chartDef, data, i, intensityScale);
                } else {
                    r = 1;
                }
                geopoints.push([y, x, r*chartDef.colorOptions.heatDensityMapIntensity*intensityRangeMultiplier]);
            });

            // Create the heatmap and add it as a layer
            let heatMapLayer = L.heatLayer(geopoints, {radius: chartDef.colorOptions.heatDensityMapRadius*radiusRangeMultiplier, id: "heatmap", gradient: gradient});
            heatMapLayer.addTo(map);

            // Options of the Leaflet CircleMarker
            let options = {
                stroke: false,
                color: "rgb(0,0,0)",
                opacity: 1,
                fill: false,
                fillColor: "rgb(255,0,0)",
                fillOpacity: 1,
                radius : 5,
            };

            // Create tooltip
            data.xAxis.num.data.forEach(function(x, i) {

                let y = data.yAxis.num.data[i];

                let pointLayer = L.circleMarker([y, x], options);

                let html = "";
                html += "Lon: <strong>" + vf(x) +"</strong><br />";
                html += "Lat: <strong>" + vf(y) +"</strong><br />";

                if (hasUASize && (!hasUAColor || (chartDef.uaSize[0].column !== chartDef.uaColor[0].column || chartDef.uaColor[0].dateMode !== 'RANGE'))) {
                    html += uaLFn(chartDef.uaSize[0]) + ": <strong>" +
                        _ScatterCommon.formattedSizeVal(chartDef, data, i) +"</strong><br />";
                }
                if (chartDef.uaTooltip.length > 0) {
                    html += "<hr/>";
                }
                chartDef.uaTooltip.forEach(function(ua, j) {
                    html += uaLFn(ua) + ": <strong>" + _ScatterCommon.formattedVal(chartDef, data.values["tooltip_" + j], ua, i) + "</strong><br/>";
                });

                pointLayer.bindPopup(html);
                pointLayer.on('mouseover', function (e) {
                    this.setStyle({
                        stroke: true,
                        fill: true
                    });
                    this.openPopup();
                });
                pointLayer.on('mouseout', function (e) {
                    this.setStyle({
                        stroke: false,
                        fill: false
                    });
                    this.closePopup();
                });
                layerGroup.addLayer(pointLayer);
            });

            // Add layer to map
            layerGroup.addTo(map);
            elt.data("leaflet-data-layer", layerGroup);

        }).finally(function(){
            // Signal to the callee handler that the chart has been loaded.
            // Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        });
    }
});

})();

/* jshint loopfunc: true*/
(function(){
    'use strict';

    var app = angular.module('dataiku.charts')

    app.factory("GeometryMapChart", function(ChartViewCommon, ChartDimension, _MapCharts, ChartLegendUtils, ChartColorUtils, _ScatterCommon, ChartLabels, ChartUADimension, $timeout) {
        return function($container, chartDef, data, chartHandler) {

            var elt = _MapCharts.getOrCreateMapContainer($container);
            var geo = JSON.parse(data.geoJson);
            var colorScale, singleColor, layer;
            var colorCache = {};

            // Build color scale
            var hasUAColor = _ScatterCommon.hasUAColor(chartDef);
            if (hasUAColor) {
                colorScale = _ScatterCommon.makeColorScale(chartDef, data, chartHandler);
            } else {
                singleColor = _ScatterCommon.makeSingleColor(chartDef);
            }

            // Build legend. Can we make some of this common with other UA color scales ?
            if (hasUAColor && (ChartUADimension.isAlphanumLike(chartDef.uaColor[0]) || ChartUADimension.isDiscreteDate(chartDef.uaColor[0]))) {
                var legend = {
                    type : "COLOR_DISCRETE",
                    items : []
                };

                var baseFadeColor = dkuMapBackgrounds.backgrounds.find(b => b.id === chartDef.mapOptions.tilesLayer).fadeColor || "#333";
                var fadeColor = ChartColorUtils.toRgba(baseFadeColor,.5*chartDef.colorOptions.transparency);

                data.values.color.str.sortedMapping.forEach(function(value, v) {
                    var item = {
                        label :  data.values.color.str.sortedMapping[v],
                        color: colorScale(v),
                        focusFn : function(){
                            layer.setStyle(function(feature) {
                                if (data.values.color.str.data[feature.properties.idx] === v) {
                                    return {color: item.color, opacity: 1, weight: chartDef.strokeWidth};
                                } else {
                                    return {color: fadeColor, opacity: 1, weight: chartDef.strokeWidth};
                                }
                            })
                        },
                        unfocusFn : function(){
                            layer.setStyle(function(feature) {
                                var c = singleColor || _ScatterCommon.makeColor(chartDef, data, feature.properties.idx, colorScale, singleColor, colorCache);
                                return { color: c, opacity: 1, weight: chartDef.strokeWidth};
                            });
                        },
                        focused : false
                    };
                    legend.items.push(item);
                });

                chartHandler.legends.length = 0;
                chartHandler.legends.push(legend);
            } else {
                if (colorScale) {
                    colorScale.type = 'MEASURE';
                }
                ChartLegendUtils.initLegend(chartDef, null, chartHandler, colorScale);
                if (colorScale) {
                    if (ChartUADimension.isDateRange(chartDef.uaColor[0])) {
                        chartHandler.legends[0].formatter = function(d) { return d3.time.format('%Y-%m-%d')(new Date(d)); }
                    } else {
                        chartHandler.legends[0].formatter = ChartViewCommon.createMeasureFormatter(chartDef.colorMeasure[0], colorScale.innerScale.domain(), 10);
                    }
                }
            }

            ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function () {

                _MapCharts.adjustLegendPlacement(chartDef, $container);

                var map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
                if (elt.data("leaflet-data-layer")) {
                    map.removeLayer(elt.data("leaflet-data-layer"));
                }
                _MapCharts.repositionMap(map, elt, data);

                function onEachFeature(feature, layer) {
                    if (chartHandler.noTooltips) return;

                    var html = "";

                    if (hasUAColor) {
                        html += ChartLabels.uaLabel(chartDef.uaColor[0]) + ": <strong>" + _ScatterCommon.formattedColorVal(chartDef, data, feature.properties.idx) +"</strong><br />";
                    }

                    chartDef.uaTooltip.forEach(function(ua, j) {
                        html += ChartLabels.uaLabel(ua) + ": <strong>" + _ScatterCommon.formattedVal(chartDef, data.values["tooltip_" + j], ua, feature.properties.idx) + "</strong><br/>";
                    });

                    if (html.length) {
                        layer.bindPopup(html);
                    }
                }


                layer = L.geoJson(geo.features, {
                    style: function (feature) {
                        var c = singleColor || _ScatterCommon.makeColor(chartDef, data, feature.properties.idx, colorScale, singleColor, colorCache);
                        return { color: c, opacity: 1, weight: chartDef.strokeWidth, fillOpacity: chartDef.fillOpacity };
                    },
                    onEachFeature : onEachFeature,
                    pointToLayer: function (feature, latlng) {
                        var c = singleColor || _ScatterCommon.makeColor(chartDef, data, feature.properties.idx, colorScale, singleColor, colorCache);

                        var geojsonMarkerOptions = {
                            radius: 5,
                            fillColor: c,
                            color: c,
                            weight: chartDef.strokeWidth,
                            opacity: 1,
                            fillOpacity: 1
                        };

                        return L.circleMarker(latlng, geojsonMarkerOptions);
                    }
                });
                map.addLayer(layer);

                if (map.$justCreated) {
                    $timeout(function() {
                        map.fitBounds(layer);
                    });
                }

                elt.data("leaflet-data-layer", layer);
            }).finally(function(){
                // Signal to the callee handler that the chart has been loaded.
                // Dashboards use it to determine when all insights are completely loaded.
                if (typeof(chartHandler.loadedCallback) === 'function') {
                    chartHandler.loadedCallback();
                }
            });

        }
    });

})();

(function() {
'use strict';

const app = angular.module('dataiku.charts');


app.factory("PivotTableChart", function(Assert, ChartViewCommon, Fn, ChartLabels, Logger, smartNumberFilter, ChartTensorDataWrapper, ChartTooltips, ChartLegendUtils, ChartColorScales, ChartDataUtils){
    return function ($element, chartDef, chartHandler, axesDef, data) {
        $element.children().remove();
        var $container = $("<div class='h100 table-pivot-table chart-wrapper' />");

        var chartData = ChartTensorDataWrapper(data, axesDef);
        $element.append($container);

        var hasX = chartDef.xDimension.length > 0;
        var hasY = chartDef.yDimension.length > 0;
        var is2D= hasX && hasY;

        var TYPE_CELL       = 0;
        var TYPE_ROW_HEADER = 1;
        var TYPE_ROW_TOTALS = 2;
        var TYPE_COL_TOTALS = 3;
        var TYPE_MEASURE_HEADERS = 4;
        var OVERFLOW = 5;
        var CORNER_CELL = 6;

        //For colored table
        var isColoredTable = chartDef.variant == 'colored';
        var colorMeasureIndex = -1;
        var hasColorMeasure = false;
        if (isColoredTable && data.aggregations.length > 0){
        	if (chartDef.colorMeasure.length == 0) {
        		colorMeasureIndex = 0;
        	} else {
        		hasColorMeasure = true;
        		colorMeasureIndex = data.aggregations.length - 1;
        		chartDef.colorMeasure.$mIdx = colorMeasureIndex;
        	}


            // Create color scale
            var colorScale = ChartColorScales.createColorScale(chartData, chartDef, {type: 'MEASURE', measureIdx: colorMeasureIndex, withRgba: true});
            ChartLegendUtils.initLegend(chartDef, chartData, chartHandler, colorScale);
        } else {
            chartHandler.legends.length = 0;
        }

        var hasLineMeasureHeader = false;
        if (isColoredTable) {
        	hasLineMeasureHeader = data.aggregations.length - chartDef.colorMeasure.length > 1;
        } else {
        	hasLineMeasureHeader = data.aggregations.length > 1;
        }

        /* I have only columns, so:
            - 1 header line
            - 1 line per measure
         */
        function buildModel1DX(){
            var tableData = new fattable.SyncTableModel();
            var labels = chartData.getAxisLabels('x');

            /* naggr rows, labels +1 columns */
            tableData.getCellSync = function(ri, cj) {
                if (ri >= chartDef.genericMeasures.length) {
                    return { ri:ri, cj:cj, type : OVERFLOW};
                }
                if (cj == 0) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_MEASURE_HEADERS,
                        labels : [ChartLabels.longMeasureLabel(chartDef.genericMeasures[ri])]
                    }
                } else {
                	var cell = {
	        			 ri:ri,
	        			 cj:cj,
	                     type : TYPE_CELL,
	                     aggrs : [chartData.aggr(ri).get({x: cj-1})]
                	}
                	if (isColoredTable) {
                		cell.aggrs.push(chartData.aggr(colorMeasureIndex).get({x: cj-1}));
                	}
                	return cell;
                }
            };
            tableData.getHeaderSync = function(cj) {
                var ret;
                if (cj == 0) {
                    return { label : ""};
                } else {
                    return  labels[cj-1];
                }
           };
           return tableData;

        }

        /* Header line contains measure names, then one line per value */
        // NB: margin not yet handled here.
        function buildModel1DY(){
            var tableData = new fattable.SyncTableModel();
            var labels = chartData.getAxisLabels('y');
            /* naggr cols, Y rows */
            tableData.getCellSync = function(ri, cj) {
                if (ri >= labels.length) {
                    return { ri:ri, cj:cj, type : OVERFLOW};
                }
                if (cj == 0 && ri == labels.length) {
                    Assert.trueish(false, 'no margin space'); // reserved for margin usage
                } else if (cj == 0) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_ROW_HEADER,
                        label : labels[ri]
                    }
                } else if (ri == labels.length) {
                    Assert.trueish(false, 'no margin space'); // reserved for margin usage
                } else {
                	var cell = {
                        ri:ri,
                        cj:cj,
                        type : TYPE_CELL,
                        aggrs : [chartData.aggr(cj - 1).get({y: ri})]
                    }
                	if (isColoredTable) {
                		cell.aggrs.push(chartData.aggr(colorMeasureIndex).get({y: ri}));
                	}
                	return cell;
                }
            };
            tableData.getHeaderSync = function(cj) {
                if (cj == 0) {
                    return { label : ""};
                } else {
                    return { label : ChartLabels.longMeasureLabel(chartDef.genericMeasures[cj-1])}
                }
           };
           return tableData;
        }


        function buildModel2D(){
            var xLabels = chartData.getAxisLabels('x');
            var yLabels = chartData.getAxisLabels('y');
            var colMarginCol = hasLineMeasureHeader ? xLabels.length + 2 : xLabels.length + 1;
            var colOffset = hasLineMeasureHeader ? 2 : 1;
            var tableData = new fattable.SyncTableModel();
            /* X+2 cols, Y+1 rows */
            tableData.getCellSync = function(ri, cj) {
                if (ri > yLabels.length) {
                    return { ri:ri, cj:cj, type : OVERFLOW};
                }
                if (cj == 0 && ri == yLabels.length) {
                     return {
                        ri:ri, cj:cj,
                        type : CORNER_CELL
                    }
                } else if (cj == 0) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_ROW_HEADER,
                        label : yLabels[ri]
                    }
                } else if (cj == 1 && hasLineMeasureHeader) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_MEASURE_HEADERS,
                        labels : chartDef.genericMeasures.map(ChartLabels.longMeasureLabel)
                    }
                } else if (cj == colMarginCol && ri == yLabels.length) {
                    // summary-summary
                    return {
                        ri:ri, cj:cj,
                        type : CORNER_CELL
                    }
                } else if (cj == colMarginCol) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_ROW_TOTALS,
                        aggrs : data.aggregations.map(function(aggrData, aggrIdx){
                            return chartData.aggr(aggrIdx).getAxisValue('y', ri);
                        })
                    }
                } else if (ri == yLabels.length) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_COL_TOTALS,
                        aggrs : data.aggregations.map(function(aggrData, aggrIdx){
                            return chartData.aggr(aggrIdx).getAxisValue('x', cj - colOffset);
                        })
                    }
                } else {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_CELL,
                        aggrs : data.aggregations.map(function(aggrData, aggrIdx){
                            var dd = chartData.aggr(aggrIdx).get({x: cj-colOffset, y: ri});
                            if (dd == undefined) {
                                Logger.warn("UNDEFINED CELL", ri, cj, idx, dd);
                            }
                            return dd;
                        })
                    }
                }
            };
            tableData.getHeaderSync = function(cj) {
                var ret;
                if (cj == 0) {
                    ret = { label : ""};
                } else if (cj == 1 && hasLineMeasureHeader) {
                    ret = { label : ""};
                } else if (cj == colMarginCol) {
                    ret = { label : ""};
                } else {
                    ret = xLabels[cj - colOffset];
                }
                return ret;
           };
           return tableData;
        }

        var labelify = ChartViewCommon.labelify;

        var measuresFormatter = [];
        var isPercentageOnly = true;
        for (var i = 0; i < chartDef.genericMeasures.length; i++) {
        	if (chartDef.genericMeasures[i].computeMode == "PERCENTAGE") {
        		measuresFormatter.push(d3.format(".0%"));
        	} else {
        		measuresFormatter.push(smartNumberFilter);
        		isPercentageOnly = false;
        	}
        }

        function buildPainter() {
           var painter = new fattable.Painter();
           var xLabels = chartData.getAxisLabels('x');
           if (is2D) {
               var colMarginCol = hasLineMeasureHeader ? xLabels.length + 2 : xLabels.length + 1;
           }

           painter.setupHeader = function(el) {}

           painter.fillHeader = function(el, data){
               var $el = $(el);
               $el.empty();
               $el.removeClass();
               $el.addClass("headercell");
               $el.attr("title", labelify(data.label));
               el.textContent = labelify(data.label);
           }
           painter.fillCell = function(el, data) {
               var $el = $(el);
               $el.empty();

               $el.removeClass();
               if (chartDef.variant == 'colored') {
            	   $el.addClass("colored");
               } else {
            	   $el.addClass(data.ri % 2 == 0 ? "even" :"odd");
               }

               $el.attr("celltype", data.type);
               $el.attr("cellri", data.ri);
               $el.attr("cellcj", data.cj);

               if (data.type == CORNER_CELL) {
            	   if (isPercentageOnly) {
            		   $el.remove();
            	   }
                   return; // margin-margin, not handled
               }

               if (data.type == OVERFLOW) {
                   $el.html("OVERFLOW");
                   return;
               }

               var colorValueIndex;
               if (chartDef.variant == 'colored') {
            	   if (is2D) {
            		   colorValueIndex = colorMeasureIndex;
            	   } else {
            		   colorValueIndex = 1;
            	   }
               }

               if (is2D) {
                   tooltips.removeTooltipsHandlers($el[0]);
               }
               $el.off("mouseover mouseout click");

               if (data.type == TYPE_CELL) {
                   $el.addClass("maincell");
                   var content = "";
                   data.aggrs.forEach(function(d, i){
                	   if (!isColoredTable || !hasColorMeasure || i!=colorMeasureIndex ) {
                		   var measureFormatterIndex = 0;
                		   if (is2D) {
                			   measureFormatterIndex = i;
                		   } else if (hasX) {
                			   measureFormatterIndex = data.ri;
                		   } else if (hasY) {
                			   measureFormatterIndex = data.cj-1;
                		   }
                		   content += measuresFormatter[measureFormatterIndex](d);
                           if (i != data.aggrs.length - 1) content += "<br />";
                	   }
                   });
                   if (chartDef.variant == 'colored') {
                	   content = "<div class='colored-content-wrapper' style='background-color: "+ colorScale(data.aggrs[colorValueIndex]) +"'>" + content + "</div>";
                   }
                   $el.html( content);

                   // Tooltip
                   if (is2D) {
                       var coords = {x: data.cj - (hasLineMeasureHeader ? 2 : 1), y: data.ri};
                       tooltips.addTooltipHandlers($el[0], coords, isColoredTable ? colorScale(chartData.aggr(colorMeasureIndex).get(coords)) : null);
                   }

               } else if (data.type == TYPE_ROW_HEADER) {
                   $el.addClass("rowheadercell");
                   $el.html("<strong>" + sanitize(labelify(data.label.label)) +"</strong>");
                   $el.attr("title", labelify(data.label.label));
               } else if (data.type == TYPE_COL_TOTALS || data.type == TYPE_ROW_TOTALS) {
            	   if (isPercentageOnly) {
            		   $el.remove();
            	   } else {
            		   $el.addClass("margincell");
                       if (data.type == TYPE_COL_TOTALS){
                           $el.addClass("colmargincell");
                       } else {
                           $el.addClass("rowmargincell");
                       }
                	   var content = "";
                       data.aggrs.forEach(function(d, i){
                    	   if (!isColoredTable || !hasColorMeasure || i!=colorMeasureIndex ) {
	                    	   if (chartDef.genericMeasures[i].computeMode != "PERCENTAGE") {
                                   content += sanitize(measuresFormatter[i](d));
	                    	   } else {
	                    		   content += "NA";
	                    	   }
	                    	   if (i != data.aggrs.length - chartDef.colorMeasure.length - 1) content += "<br />";
                    	   }
                       });
                	   $el.html( "<strong>" + content + "</strong>");
            	   }
               } else {
                   var content = "";
                   data.labels.forEach(function(d, i){
                       content += sanitize(d);
                       if (i != data.labels.length - 1) content += "<br />";
                   });
                   $el.addClass("measure-labels");
                   $el.html(content);
                }
           }
           return painter;
        }

        var lineHeight = 16;

        var thetable = null;
        if (is2D){
            $container.addClass("has-tooltip");
            var measureFormatters = ChartViewCommon.createMeasureFormatters(chartDef, chartData, 1000);
            var tooltips = ChartTooltips.create($element, chartHandler, chartData, chartDef, measureFormatters);
            $container.on('click', function(evt) {
                if (evt.target.hasAttribute('data-legend') || evt.target.hasAttribute('tooltip-el')) return;
                tooltips.unfix();
            });

            var colWidths = [100];
            if (hasLineMeasureHeader) {
                colWidths.push(100);
            }
            colWidths = colWidths
                .concat(chartData.getAxisLabels('x').map(function(x){return 90;}))
                .concat([90]);

            //var maxHeaderTextLen = d3.max(data.getAxisLabels('x').map(function(x){return x.label.length}));
            var headerHeight = 25; // Math.ceil(maxHeaderTextLen / 12) * lineHeight + 14;

            var nbRows = data.aggregations.length;
            if (isColoredTable) {
            	nbRows = nbRows - chartDef.colorMeasure.length;
            }
            var rowHeitgh = lineHeight * nbRows + 10

            thetable = fattable({
                        "container": $container[0],
                        "model": buildModel2D(),
                        "nbRows": (chartData.getAxisLabels('y').length + 1),
                        "headerHeight": headerHeight,
                        "rowHeight":  rowHeitgh,
                        "columnWidths": colWidths,
                        "painter": buildPainter()
                    });

        } else if(hasY){
            var colWidths = [120];
            var nbCols = data.aggregations.length;
            // If table is colored and colorMeasure was set, last aggregation is made of colorMeasure and should not be counted as a column
            if (isColoredTable && hasColorMeasure) {
            	nbCols = nbCols - chartDef.colorMeasure.length;
            }
            for (var i = 0; i<nbCols; i++) {
            	colWidths.push(120);
            }

            var headerHeight = 24;

            thetable = fattable({
                        "container": $container[0],
                        "model": buildModel1DY(),
                        "nbRows": (chartData.getAxisLabels('y').length),
                        "headerHeight": headerHeight,
                        "rowHeight":  lineHeight + 10,
                        "columnWidths": colWidths,
                        "painter": buildPainter()
                    });
        } else {
            var colWidths = [120].concat(chartData.getAxisLabels('x').map(function(x){return 90;}));

            //var maxHeaderTextLen = d3.max(chartData.getAxisLabels('x').map(function(x){return x.label.length}));
            var headerHeight = 25; // Math.ceil(maxHeaderTextLen / 12) * lineHeight + 14;

            var nbRows = data.aggregations.length;
            if (isColoredTable) {
            	nbRows = nbRows - chartDef.colorMeasure.length;
            }

            thetable = fattable({
                        "container": $container[0],
                        "model": buildModel1DX(),
                        "nbRows": nbRows,
                        "headerHeight": headerHeight,
                        "rowHeight":  lineHeight + 10,
                        "columnWidths": colWidths,
                        "painter": buildPainter()
                    });
        }

        thetable.setup();
        thetable.scroll.setScrollXY(0,0);

        // Signal to the callee handler that the chart has been successfully loaded. Dashboards use it to determine when all insights are completely loaded.
        if (typeof(chartHandler.loadedCallback) === 'function') {
            chartHandler.loadedCallback();
        }
    };
})

})();
(function(){
'use strict';

angular.module('dataiku.charts')
    .factory('LiftChart', LiftChart);

function LiftChart(ChartViewCommon, ChartTensorDataWrapper, ChartColorUtils, ChartDataUtils) {
    return function($container, chartDef, chartHandler, axesDef, data) {

        var chartData = ChartTensorDataWrapper(data, axesDef),
            facetLabels = chartData.getAxisLabels('facet') || [null], // We'll through the next loop only once if the chart is not facetted
            xDomain = ChartDataUtils.getMeasureExtent(data, 0),
            yDomain = ChartDataUtils.getMeasureExtent(data, 1),
            color = ChartColorUtils.toRgba(chartDef.colorOptions.singleColor, chartDef.colorOptions.transparency);


        xDomain[0] = 0;
        yDomain[0] = 0;

        var lineData = ['ORIGIN'].concat(chartData.getAxisLabels('group'));

        var drawFrame = function (frameIdx, chartBase) {
            chartData.fixAxis('animation', frameIdx);
            facetLabels.forEach(function (facetLabel, f) {
                var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                LiftChartDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, f);
            });
        };

        ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
            {type: 'MEASURE', domain: xDomain, measure: chartDef.xMeasure},
            {type: 'MEASURE', domain: yDomain, measure: chartDef.yMeasure}
        );

        function LiftChartDrawer(g, chartDef, chartHandler, chartData, chartBase, f) {

            var xCoord = function(d, i) {
                var v = (d === 'ORIGIN') ? 0 : chartData.aggr(0).get({group: i-1});
                return chartBase.xAxis.scale()(v);
            };

            var yCoord = function(d, i) {
                var v = (d === 'ORIGIN') ? 0 : chartData.aggr(1).get({group: i-1});
                return chartBase.yAxis.scale()(v);
            };

            var line = d3.svg.line()
                .interpolate('monotone')
                .x(xCoord)
                .y(yCoord);

            var lineWrapper = g.selectAll('g.wrapper').data([null]);
            var newWrapper = lineWrapper.enter().append('g').attr('class', 'wrapper');

            newWrapper
                .append('path')
                .attr('class', 'visible')
                .attr('stroke', color)
                .attr('stroke-width', '1.5')
                .attr('fill', 'none');

            // Thicker invisible line to catch mouseover
            newWrapper
                .append('path')
                .attr("stroke-width", "20")
                .attr("stroke", 'transparent')
                .attr('fill', 'none');

            var medianLine = g.selectAll('line.median').data([null]);
            medianLine.enter().append('line').attr('class', 'median')
                .attr('x1',0)
                .attr('y1', chartBase.vizHeight)
                .style('stroke', '#333');


            medianLine.transition()
                .attr('x2', xCoord(null, lineData.length - 1))
                .attr('y2', yCoord(null, lineData.length - 1));

            var points = lineWrapper.selectAll('circle.point').data(lineData);

            points.enter().append('circle')
                .attr('class', 'point')
                .attr('r', 5)
                .attr('fill', color)
                .attr('opacity', 0)
                .each(function(d, i) { return i == 0 ? 0 : chartBase.tooltips.addTooltipHandlers(this, {group: i-1, facet: f}, color); });

            points.transition()
                .attr('cx', xCoord)
                .attr('cy', yCoord);

            lineWrapper.selectAll('path').datum(lineData).transition()
                .attr('d', line);

            lineWrapper.on('mouseover.path', function(d){
                lineWrapper.select('path.visible').attr('stroke-width', 3);
                points.transition(500).attr('opacity', function(d,i) { return i === 0 ? 0 : 1; })
            }).on('mouseout.path', function(d){
                lineWrapper.select('path.visible').attr('stroke-width', 1.5);
                points.transition(250).attr('opacity', 0);
            });

        }

        chartHandler.legends.length = 0;

    };
}
})();
(function () {
'use strict';

const app = angular.module('dataiku.charts');


app.factory('ChartLabels', function (ChartUADimension, ChartDimension) {
    var svc = {
        uaLabel: function (ua) {
            if (ChartUADimension.isDiscreteDate(ua)) {
                return ua.column + ' (' +
                    ChartDimension.getDateFilterTypes()
                        .filter(function (v) {
                            return v[0] === ua.dateMode;
                        })[0][1].toLowerCase()
                    + ')';
            }
            return ua.column;
        },
        longMeasureLabel: function(measure) {
            function baseLabel(measure) {
                if (!measure) {
                    return null;
                }
                if (measure['function'] === 'COUNT') {
                    return 'Count of records';
                } else if (measure['function'] === 'SUM') {
                    return 'Sum of ' + measure.column;
                } else if (measure['function'] === 'AVG') {
                    return 'Avg of ' + measure.column;
                } else if (measure['function'] === 'MIN') {
                    return 'Min of ' + measure.column;
                } else if (measure['function'] === 'MAX') {
                    return 'Max of ' + measure.column;
                }
            }
            return baseLabel(measure);
        }
    };
    return svc;
});


app.factory('LabelsController', function () {
    return function (scope) {
        scope.measureFunctionDescription = function (func) {
            return func;
        };

        scope.measureLabel = function(measure) {
            function baseLabel(measure) {
                if (!measure) {
                    return null;
                }
                if (measure['function'] === 'COUNT') {
                    return 'Count of records';
                } else if (measure['function'] === 'SUM') {
                    return 'Sum of ' + measure.column;
                } else if (measure['function'] === 'AVG') {
                    return 'Average of ' + measure.column;
                } else if (measure['function'] === 'MIN') {
                    return 'Minimum of ' + measure.column;
                } else if (measure['function'] === 'MAX') {
                    return 'Maximum of ' + measure.column;
                }
            }
            if (scope.request.liftToAverage) {
                return baseLabel(measure) + " compared to average";
            } else if (scope.request.relativeLift) {
                return "Relative ratio of " + baseLabel(measure) + " to " + baseLabel(scope.chart.def.measures[1]);
            } else if (scope.request.ratio) {
                return "Ratio of " + baseLabel(measure) + " to " + baseLabel(scope.chart.def.measures[1]);
            } else {
                return baseLabel(measure);
            }
        };

        scope.shortMeasureLabel = function(measure) {
            if (!measure) {
                return null;
            }
            if (measure.function == 'COUNT') {
                return "Count";
            } else if (measure.function == "SUM") {
                return "Sum of " + measure.column;
            } else if (measure.function == "AVG") {
                return "Avg. of " + measure.column;
            } else if (measure.function == "MIN") {
                return "Min. of " + measure.column;
            } else if (measure.function == "MAX") {
                return "Max. of " + measure.column;
            }
        };

        scope.dimensionLabel = function (dimension) {
            return dimension.column;
        };
    };
});


app.filter("longSmartNumber", function () {
    // Good looking numbers.
    // Contains thousands separator.

    var digitFormatters = [];
    for (var i = 0; i < 6; i++) {
        digitFormatters.push(d3.format(",." + i + "f"));
    }
    return function (x) {
        if (typeof x != "number") {
            return "NA";
        }
        var abs_x = Math.abs(x);
        if (isInteger(abs_x)) {
            return d3.format(",")(x);
        }
        if (isInteger(abs_x * 100)) {
            return d3.format(",.2f")(x);
        }
        if (x == 0) {
            return "0";
        }
        var heavyWeight = 1 - (log10(abs_x) | 0);
        var nbDecimals = Math.max(2, -heavyWeight + 2);
        if (nbDecimals < 6) {
            return digitFormatters[nbDecimals](x);
        }
        else {
            return x.toPrecision(4);
        }
    }
});

/**
 * This filters is intended to improve readability in arrays containing large numbers (such as status display)
 * - a thousand separator is introduce to make differences between large integers, such as counters, more distinguishable.
 * - the thousand separator used is short space, to make it more neutral across regions than a US style comma
 * - the number of digits displayed is controlled by lowering accordingly the number decimals (maximum 9, with a progressive reduction to a minimum of 2).
 *
 * /!\ IMPORTANT: This method is unit tested in long_readable_number_test.js, if you edit it please make sure they still pass!
 */
app.filter("longReadableNumber", function () {

    function getNumberOfDigitsBeforeDecimalPoint(x) {
        let absX = Math.abs(x);
        let logX = log10(absX);
        if (logX < 0) {
            return 0;
        } else {
            return 1 + (logX | 0); // | 0 is quick way to floor
        }
    }

    function computeNbDecimals(x) {
        let nbDigitsBeforeDecimalPoint = getNumberOfDigitsBeforeDecimalPoint(x);
        let nbDecimals = 9 - nbDigitsBeforeDecimalPoint; //Ideally we do not want numbers that exceed 9 digits in total
        nbDecimals = Math.max(2, nbDecimals); // Yet we want a minimum accuracy of 2 decimals (meaning that in some cases, we can go up to 11 digits)


        // Avoid getting remaining trailing zeros after rounding
        let roundedX = Math.round(x * Math.pow(10, nbDecimals)) / Math.pow(10, nbDecimals);

        // To find the last significant number in x, multiply x by decreasing powers of 10 and check if it's still an integer
        // The number of loops is minimised by starting the search with the max number of decimals that can be displayed
        let i;

        for (i = nbDecimals - 1 ; i > 0 ; i--) {
            if (!isInteger(roundedX * Math.pow(10,i))) {break;}
        }
        return i+1;
    }

    var digitFormatters = [];
    // All these keys of the locale need to be defined to avoid d3.locale to crash
    const modifiedLocale = {
            "decimal": ".",
            "thousands": "\xa0",
            "grouping": [3],
            "currency": [],
            "dateTime": "",
            "date": "",
            "time": "",
            "periods": [],
            "days": [],
            "shortDays": [],
            "months": [],
            "shortMonths": []
    };
    for (let i = 0; i <= 9; i++) {
        digitFormatters.push(d3.locale(modifiedLocale).numberFormat(",." + i + "f")); //,.Xf uses a comma for a thousands separator and will keep X decimals
    }
    return function (x) {
        if (isNaN(x)) {
            if (typeof x === "string") {
                return x;
            } else if (typeof x.toString === "function") {
                return x.toString();
            } else {
                return x;
            }
        }
        let abs_x = Math.abs(x);
        if (isInteger(abs_x)) {
            return d3.locale(modifiedLocale).numberFormat(",")(x);
        }
        if (x == 0) {
            return "0";
        }
        let nbDecimals = computeNbDecimals(x);
        return digitFormatters[nbDecimals](x);
    }
});

app.filter("smartNumber", function () {
    // short representation of number.
    var expFormatter = d3.format(".2e");
    var siFormatter = d3.format(".2s");
    var digitFormatters = [];
    for (var i = 0; i < 6; i++) {
        digitFormatters.push(d3.format("." + i + "f"));
    }
    return function (d) {
        if (typeof d != "number") {
            return "NA";
        }
        var abs = Math.abs(d);
        if (abs >= 1e12) {
            return expFormatter(d);
        } else if (abs >= 100000) {
            return siFormatter(d);
        } else if (abs >= 100) {
            return digitFormatters[0](d);
        } else if (abs >= 1) {
            if (abs % 1 === 0) return digitFormatters[0](d);
            return digitFormatters[2](d);
        } else if (abs === 0) {
            return digitFormatters[0](d);
        } else if (abs < 0.00001) {
            return d.toPrecision(3);
        } else {
            var x = Math.min(5, 2 - (log10(abs) | 0));
            return digitFormatters[x](d);
        }
    };
});


app.factory("NumberFormatter", function () {
    var ret = {
        get: function (minValue, maxValue, numValues, comaSeparator, stripZeros) {

            // Suppose the values are evenly spaced, the minimum display precision we need is:
            var minPrecision = (maxValue - minValue) / numValues;

            // That means we need to have that many decimals: (can be negative: -1 means we don't even need the units number, -2 the hundreds, etc)
            var minDecimals = Math.ceil(-log10(minPrecision));

            var coma = comaSeparator ? "," : "";

            return function (x) {

                if (typeof x != "number") {
                    return "NA";
                }

                var abs = Math.abs(x);

                if (abs === 0) {
                    return "0";
                } else if (abs < 0.00001) {
                    return x.toExponential(Math.max(0, Math.max(minDecimals, 0) - Math.floor(-log10(x)) - 1));
                } else if (minDecimals > 0) {
                    var str = d3.format(coma + "." + minDecimals + "f")(x);
                    if (stripZeros) {
                        var strippedStr = str.replace(/\.?0+$/, "");
                        if (parseFloat(strippedStr) == x) return strippedStr;
                    }
                    return str;
                } else if (abs >= 10000) {
                    // We trim the number based on minDecimals (<0): this will round and replace the last digits by zero
                    // (e.g. minDecimals = -4, x = 123456, => trimmedX = 120000)
                    var trimmedX = Math.round(x*Math.pow(10, minDecimals))*Math.pow(10, -minDecimals);
                    // Then we ask d3 to write the trimmed number with a unit prefix
                    var d3Prefix = d3.formatPrefix(trimmedX);
                    var prefixed = d3Prefix.scale(trimmedX) + d3Prefix.symbol;

                    // Because it's been trimmed, prefixed can be 120k if the value was 123456
                    // In this case, we want to return 123k (as concise + more precise),
                    // so we just use the length of prefixed as reference and let d3 do the rest
                    return d3.format('.' + (prefixed.replace(/\D/g,'').length) + 's')(x);
                }

                return d3.format(coma + "." + Math.max(0, minDecimals) + "f")(x);
            }
        },

        getForAxis: function (axis) {
            var scale = angular.isFunction(axis.scale()) ? axis.scale() : axis.scale;

            var minValue = d3.min(scale.domain());
            var maxValue = d3.max(scale.domain());
            var numValues = axis.tickValues() ? axis.tickValues().length : axis.ticks()[0];

            return ret.get(minValue, maxValue, numValues);
        },

        addToAxis: function (axis) {
            axis.tickFormat(ret.getForAxis(axis));
        },

        addToPercentageAxis: function (axis) {
            var scale = angular.isFunction(axis.scale()) ? axis.scale() : axis.scale;

            var minValue = d3.min(scale.domain()) * 100;
            var maxValue = d3.max(scale.domain()) * 100;
            var numValues = axis.tickValues() ? axis.tickValues().length : axis.ticks()[0];

            var base = ret.get(minValue, maxValue, numValues);
            axis.tickFormat(function (x) {
                return base(x*100) + '%';
            });
        }
    };

    return ret;
});


app.factory("ChartViewCommon", function (ChartDimension, smartNumberFilter, longSmartNumberFilter, NumberFormatter,
                                        ChartTooltips, AnimatedChartsUtils, $timeout, ChartLegendUtils, ChartDataUtils,
                                        ChartUADimension, Fn, d3Utils, $rootScope, ChartColorScales, ChartAxes, Debounce) {
    var common = {};
    common.labelify = function (val) {
        if (val === "___dku_no_value___") return "No value";
        else return val;
    };

    common.isDataWHDependant = function (chartData) {
        // returns true if a resize should trigger a query to the server.
        // Today it only happens for hexbin.
        return (chartData.type == "scatter_2d") && (chartData.hexbin);
    };

    common.getMargins = function (chartHandler, chartDef) {
        var margins = {top: 10};
        if (chartHandler.noXAxis) {
            margins.bottom = 10;
        } else if (chartDef.showXAxisLabel) {
            margins.bottom = 30;
        } else {
            margins.bottom = 15;
        }

        if (chartHandler.noYAxis) {
            margins.left = 0;
            margins.right = 0;
        } else if (typeof(chartDef.yAxisLabel) != 'undefined' && chartDef.yAxisLabel.length > 0) {
            margins.left = 70;
            margins.right = 50;
        } else {
            margins.left = 50;
            margins.right = 50;
        }

        if (chartDef.type == 'grouped_columns' || chartDef.type == 'multi_columns_lines' || chartDef.type == 'stacked_columns') {
            if (chartDef.showInChartValues) {
                margins.top += 10;
            }
        }

        return margins;
    };

    common.getUpdatedGByClass = function (svg, clazz, width, height, margins) {
        d3.select(svg).selectAll("defs").remove();
        d3.select(svg).append("defs");

        d3.select(svg).selectAll('g').remove();
        return d3.select(svg).append('g').attr("transform", "translate(" + margins.left + "," + margins.top + ")");
    };


    /**
     * Do all the initial setup surrounding the actual drawing area of a chart, this includes:
     *     - Create scales (x, y, y2, color)
     *     - Draw color legend
     *     - Adjust margins based on axis sizes
     *     - Create svgs (only one if chart is not facetted)
     *     - Draw axes
     *     - Create measure formatters
     *     - Initialize tooltips
     *
     * @param {ChartDef.java} chartDef
     * @param {a $scope object} chartHandler
     * @param {ChartTensorDataWrapper} chartData
     * @param {jQuery} $container
     * @param {function} drawFrame: a function(frameIdx, chartBase) that will be called every time a new animation frame is requested (only once if the chart has no animation dimension) to draw the actual chart
     * @param {AxisSpec} xSpec: an AxisSpec object for the x axis
     * @param {AxisSpec} ySpec: an AxisSpec object for the y axis
     * @param {AxisSpec} y2Spec: an AxisSpec object for the y2 axis (nullable)
     * @param {AxisSpec} colorSpec: an AxisSpec object for the color axis (nullable)
     * @param {Function} [handleZoom]: an optional function to setup zoom
     * @param {Object} [zoomUtils]: an optional object containing zoom information
     * AxisSpec:
     *     - type ('DIMENSION', 'MEASURE' or 'UNAGGREGATED') : whether the axis represents a dimension, one (or several) measures, or an unaggregated column
     *
     *     DIMENSION only attributes:
     *     - name : the name of the corresponding dimension as set in chartData
     *     - mode (either 'POINTS' or 'COLUMNS') : whether we sould use rangeRoundPoints or rangeRoundBands for the d3 ordinal scale
     *
     *     MEASURE only attributes:
     *     - measureIdx : the index of the measure if it is the axis only shows one measure
     *     - domain : the domain of the axis, will default to the extent of measure measureIdx if not provided
     *     - values : the list of values for the measure. Used for color spec to compute quantile scales.
     *
     *     UNAGGREGATED only attributes:
     *     - data : the data for this column (ScatterAxis.java object)
     *
     *     COMMON
     *     - dimension : the DimensionDef.java/NADimensionDef.java object for this column
     *
     *
     *     - withRgba (for ColorSpec only) : weather the color scale should include the chart's transparency setting with rgba or not
     *
     * @returns {ChartBase} : a ChartBase object, with the following properties:
     *      - $svgs {jQuery} $svgs,
     *      - colorScale {*} : a scale instance as returned by ChartColorScales.createColorScale
     *      - margins {{top: number, bottom: number, left: number, right: number}} the final, adjusted margins of the chart
     *      - vizWidth {number} : the width of the drawing area (full container width - legend with - margin width)
     *      - vizHeight {number} : the height of the drawing area
     *      - xAxis {d3 axis}
     *      - yAxis {d3 axis} (nullable)
     *      - y2Axis {d3 axis} (nullable)
     *      - tooltips {*} : a tooltip instance as returned by ChartTooltips.create
     *      - measureFormatters {array} : a list of measure formatters for all chart measures
     *      - isPercentChart {boolean} : is the chart a '*_100' variant
     *      - zeroIsInYDomain {boolean} : is zero part of the y domain
     *      - zeroIsInY2Domain {boolean} : is zero part of the y2 domain
     *      - chartData {ChartTensorDataWrapper} : the same chartData that was given as input (for convenience)
     *
     */
    common.initChart = function(chartDef, chartHandler, chartData, $container, drawFrame, xSpec, ySpec, y2Spec, colorSpec, handleZoom, zoomUtils) {
        var zeroIsInYDomain = false, zeroIsInY2Domain = false,
            chartBase = {};

        // Create color scale
        var colorScale = ChartColorScales.createColorScale(chartData, chartDef, colorSpec, chartHandler);

        // Create axis
        chartBase.isPercentChart = chartDef.variant && chartDef.variant.endsWith("_100");
        var xAxisLogScale = (xSpec && xSpec.type == "MEASURE" && chartDef.axis1LogScale)
        var xAxis  = ChartAxes.createAxis(chartData, xSpec, chartBase.isPercentChart, xAxisLogScale),
            yAxis  = ChartAxes.createAxis(chartData, ySpec, chartBase.isPercentChart, chartDef.axis1LogScale, chartDef.includeZero),
            y2Axis = ChartAxes.createAxis(chartData, y2Spec, chartBase.isPercentChart, chartDef.axis2LogScale, chartDef.includeZero);

        // Synchronize y-scales if need be
        if (yAxis && y2Axis && !handleZoom) {
            ChartAxes.synchronizeScaleZeros(yAxis.scale(), y2Axis.scale());
        }

        // We need to draw the legend first, because (if it's set to be outside of the chart), its size will influence the remaining available width & height, that we need to know for the following
        ChartLegendUtils.initLegend(chartDef, chartData, chartHandler, colorScale);

        // Create measure formatter for color legend
        if (chartHandler.legends.length && chartHandler.legends[0].type === 'COLOR_CONTINUOUS') {
            if (colorSpec.type === 'UNAGGREGATED') {
                if (ChartUADimension.isAlphanumLike(colorSpec.dimension) || ChartUADimension.isDiscreteDate(colorSpec.dimension)) {
                    // chartHandler.legends[0].type should not be COLOR_CONTINUOUS ?
                } else if (ChartUADimension.isDateRange(colorSpec.dimension)) {
                    chartHandler.legends[0].formatter = function(d) { return d3.time.format('%Y-%m-%d')(new Date(d)); }
                } else {
                    chartHandler.legends[0].formatter = common.createMeasureFormatter(chartDef.colorMeasure[0], colorScale.innerScale.domain(), 10);
                }
            } else {
                var extent = colorSpec.domain || ChartDataUtils.getMeasureExtent(chartData.data, colorSpec.measureIdx, true);
                chartHandler.legends[0].formatter = common.createMeasureFormatter(chartDef.colorMeasure[0], extent, 10);
            }
        }

        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function() {

            // Create svgs for facetting dimension
            var $svgs = common.createSVGs($container, chartData, chartDef, zoomUtils && ChartDimension.isInteractiveChart(chartDef, zoomUtils.disableChartInteractivityGlobally));

            // Initial margins
            var $svg = $svgs.eq(0),
                width = $svg.width(),
                height = $svg.height(),
                margins = common.getMargins(chartHandler, chartDef);

            // Adjust left margin for y axis, then update x scale
            if (!chartHandler.noYAxis) {
                margins = ChartAxes.adjustHorizontalMargins(margins, $svg, chartDef, yAxis, y2Axis);
            }
            var vizWidth = width - margins.left - margins.right;
            if (xAxis) {
                xAxis.setScaleRange([0, vizWidth]);
            }

            // Adjust bottom margin for x axis
            if (xAxis && !chartHandler.noXAxis) {
                margins = ChartAxes.adjustBottomMargin(margins, $svg, xAxis, chartHandler.forceRotation);
            }

            if (xAxis && chartDef.singleXAxis && chartDef.facetDimension.length) {
                // Override bottom margins when we don't actually need space in the svgs for the axis
                var allNegative = (!yAxis || yAxis.scale().domain()[1] < 0) && (!y2Axis || y2Axis.scale().domain()[1] < 0);
                var allPositive = (!yAxis || yAxis.scale().domain()[0] >= 0) && (!y2Axis || y2Axis.scale().domain()[0] >= 0);

                margins.axisHeight = margins.bottom;
                margins.bottom = allPositive ? 0 : 0.2*height;
                margins.top = allNegative ? 0 : 0.2*height;
            }

            // Update y scales accordingly
            var vizHeight = height - margins.top - margins.bottom;
            if (yAxis) {
                if (ySpec.ascendingDown) {
                    yAxis.setScaleRange([0, vizHeight]);
                } else {
                    yAxis.setScaleRange([vizHeight, 0]);
                }

                // Enforce minRangeBand (eg) for horizontal bars
                if (chartDef.facetDimension.length === 0 && yAxis.type === "DIMENSION" && ySpec.minRangeBand > 0 && yAxis.ordinalScale.rangeBand() < ySpec.minRangeBand) {
                    var numLabels = yAxis.ordinalScale.domain().length;
                    var padding = ChartAxes.getColumnPadding(numLabels);
                    var range = d3Utils.getRangeForGivenRangeBand(ySpec.minRangeBand, numLabels, padding, padding/2);
                    if (ySpec.ascendingDown) {
                        yAxis.setScaleRange([0, range]);
                    } else {
                        yAxis.setScaleRange([range, 0]);
                    }
                    vizHeight = range;
                    var svgHeight = vizHeight + margins.top + margins.bottom;
                    $svgs.height(svgHeight);
                }
            }

            if (y2Axis) y2Axis.setScaleRange([vizHeight, 0]);

            // Equalize x and y to same scale if needed
            if (chartDef.type === 'scatter' && chartDef.scatterOptions && chartDef.scatterOptions.equalScales) {
                ChartAxes.equalizeScales(chartDef, xAxis.scale(), yAxis.scale());
            }

            // Draw axes in every svg
            ChartAxes.drawAxes($svgs, chartDef, chartHandler, margins, vizWidth, vizHeight, xAxis, yAxis, y2Axis);

            // If the legend placement was INNER_TOP_LEFT or INNER_BOTTOM_*, its position depends on the margins (to not overlap with the axes)
            // Now that all axes have been positionned, we can adjust its placement
            ChartLegendUtils.adjustLegendPlacement(chartDef, $container, margins);

            var measureFormatters = common.createMeasureFormatters(chartDef, chartData, Math.max(vizHeight, vizWidth));

            var tooltips = ChartTooltips.create($container, chartHandler, chartData, chartDef, measureFormatters);

            // Everything that the chart might need
            chartBase = {
                $svgs: $svgs,
                colorScale: colorScale,
                margins: margins,
                vizWidth: vizWidth,
                vizHeight: vizHeight,
                xAxis: xAxis,
                yAxis: yAxis,
                y2Axis: y2Axis,
                tooltips: tooltips,
                measureFormatters: measureFormatters,
                zeroIsInYDomain: zeroIsInYDomain,
                zeroIsInY2Domain: zeroIsInY2Domain,
                chartData: chartData,
                zoomUtils: zoomUtils,
                xSpec: xSpec,
                ySpec: ySpec,
                y2Spec: y2Spec
            };

            angular.extend(chartHandler.tooltips, tooltips);

            if (chartData.axesDef.animation != undefined) {
                AnimatedChartsUtils.initAnimation(chartHandler, chartData, chartDef, function(frameIdx) {
                    chartBase.tooltips.setAnimationFrame(frameIdx);
                    return drawFrame(frameIdx, chartBase);
                });
            }

            const zoomingLoader = document.querySelector('.dku-loader-in-chart');

            let showLoader = function(show = true) {
                if (show === true) {
                    zoomingLoader.classList.add('dku-loader-in-chart--active')
                } else {
                    zoomingLoader.classList.remove('dku-loader-in-chart--active')
                }
            }

            if (handleZoom && typeof handleZoom === 'function') {
                handleZoom(xAxis, chartBase.$svgs, chartDef, chartBase, showLoader);
            }

            $timeout(function() {
                $svgs.on('click', function(evt) {
                    if (evt.target.hasAttribute('data-legend') || evt.target.hasAttribute('tooltip-el')) return;
                    chartBase.tooltips.resetColors();
                    chartBase.tooltips.unfix();
                });
            });

            if (chartData.axesDef.animation != undefined) {
                // Draw first frame
                chartHandler.animation.drawFrame(chartHandler.animation.currentFrame || 0, chartBase);
                if (chartHandler.autoPlayAnimation) {
                    chartHandler.animation.play();
                }
            } else {
                drawFrame(0, chartBase);
            }

            // During a zoom, prevent the thumbnail update to prevent the chart save call.
            if (!chartBase.zoomUtils || !chartBase.zoomUtils.preventThumbnailUpdate) {
                $timeout(chartHandler.updateThumbnail);
            }
        }).finally(function(){
            // Signal to the callee handler that the chart has been loaded.
            // Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        });

        return chartBase;
    };

    /**
     * Create svg(s) in $container for the given chart
     * @param $container
     * @param chartData
     * @param chartDef
     * @return {*|jQuery|HTMLElement}
     */
    common.createSVGs = function($container, chartData, chartDef, isInteractiveChart) {
        $container.find('.mainzone').remove();
        const mainzone = $('<div class="mainzone">').prependTo($container);

        if (isInteractiveChart && chartDef.brush) {
            if (chartDef.legendPlacement === 'OUTER_TOP' || chartDef.legendPlacement === 'OUTER_BOTTOM') {
                mainzone.addClass('mainzone--with-brush-and-horizontal-legend');
            } else {
                mainzone.addClass('mainzone--with-brush');
            }
        }
    
        var $chartsContainer = $('<div class="charts">').appendTo(mainzone),
            isFacetted = chartData.axesDef.facet != undefined,
            facetLabels = chartData.getAxisLabels('facet') || [null];


        if (isFacetted) {
            $chartsContainer.addClass('facetted');
            $chartsContainer.height(facetLabels.length * (1+chartDef.chartHeight)-1)
        }

        var $svgs = $();

        var $chartsTable = $('<div class="charts-table">').appendTo($chartsContainer);

        facetLabels.forEach(function(facetLabel, f) {
            var $div = $('<div class="chart">');

            $div.appendTo($chartsTable);
            if (facetLabel) {
                var $facetInfo = $('<div class="facet-info">').appendTo($div);
                $('<h2>').text(facetLabel.label == '___dku_no_value___' ? 'No value' : facetLabel.label).appendTo($facetInfo);
            }

            let $wrapper;
            $wrapper =  $('<div class="chart-wrapper">').appendTo($div);
            if (isFacetted) {
                $wrapper.css('height', chartDef.chartHeight);
            }

            $svgs = $svgs.add($('<svg style="width: 100%; height: 100%;" class="chart-svg">').appendTo($wrapper));
        });

        return $svgs;
    };

    common.createMeasureFormatters = function(chartDef, chartData, labelsResolution) {
        var formatters = [], mIdx = 0;
        chartDef.genericMeasures.forEach(function(measure) {
            formatters.push(common.createMeasureFormatter(measure, chartData.getAggrExtent(mIdx++), labelsResolution));
        });
        if (chartDef.xMeasure.length) {
            formatters.push(common.createMeasureFormatter(chartDef.xMeasure[0], chartData.getAggrExtent(mIdx++), labelsResolution));
        }
        if (chartDef.yMeasure.length) {
            formatters.push(common.createMeasureFormatter(chartDef.yMeasure[0], chartData.getAggrExtent(mIdx++), labelsResolution));
        }
        if (chartDef.sizeMeasure.length) {
            formatters.push(common.createMeasureFormatter(chartDef.sizeMeasure[0], chartData.getAggrExtent(mIdx++), labelsResolution));
        }
        if (chartDef.colorMeasure.length) {
            formatters.push(common.createMeasureFormatter(chartDef.colorMeasure[0], chartData.getAggrExtent(mIdx++), labelsResolution));
        }
        chartDef.tooltipMeasures.forEach(function(measure) {
            formatters.push(common.createMeasureFormatter(measure, chartData.getAggrExtent(mIdx++), labelsResolution));
        });
        return formatters;
    };

    common.createMeasureFormatter = function(measure, extent, labelsResolution) {
        if (measure && (measure.computeMode === 'PERCENTAGE' || measure.computeMode === 'CUMULATIVE_PERCENTAGE')) {
            var formatter = NumberFormatter.get(extent[0]*100, extent[1]*100, labelsResolution, true, true);
            return function(d) {
                return formatter(d*100) + '%';
            };
        }
        return NumberFormatter.get(extent[0], extent[1], labelsResolution, true, true);
    };

    /** Gets a tick/ values formatter for measure values */
    common.getMeasuresFormatter = function (chartSpec, longOk) {
        if (chartSpec.stdAggregatedMeasureScale == "AVG_RATIO"
            || chartSpec.stdAggregatedMeasureScale == "PERCENTAGE_SCALE"
            || chartSpec.variant == "stacked_100"
            || (chartSpec.genericMeasures && chartSpec.genericMeasures[0] && chartSpec.genericMeasures[0].computeMode == "PERCENTAGE")
        ) {
            return d3.format(".0%");
        } else {
            if (longOk) {
                return longSmartNumberFilter;
            }
            else {
                return smartNumberFilter;
            }
        }
    };

    /*
        * The following tooltips methods are only used in density_2d, scatterplot, boxplot. More standard charts use the ChartTooltips service.
        * */

    common.createTooltip = function () {
        //$('.regression-scatter-plot-tooltip').remove();
        var existingTooltip = d3.select('.regression-scatter-plot-tooltip');
        if (!existingTooltip.empty()) {
            return existingTooltip;
        } else {
            return d3.select("body").append("div")
                .attr("class", "regression-scatter-plot-tooltip").style("left", "0").style("top", "0").style("opacity", 0);
        }
    };

    common.tooltipAppear = function (tooltip, color, event) {
        // Border is not transitionable
        tooltip.style("border", "2px " + color.toString() + " solid");
        tooltip.transition().duration(300)
            .style("opacity", 1)
            .style("left", (event.pageX + 8) + "px")
            .style("top", (event.pageY - 28) + "px");
        tooltip.style("pointer-events", "none");
        return tooltip;
    };

    common.tooltipDisappear = function (tooltip) {
        tooltip.transition()
            .duration(100)
            .style("opacity", 0);
        tooltip.style("pointer-events", "none");
        return tooltip;
    };

    return common;
});
    
app.factory("d3Utils", function () {
    return {
        // d3 < v4.0 doesnt have a ordinalScale.rangeStep() function (equivalent of rangeBand() when is the range is set with rangePoints)
        getOrdinalScaleRangeStep: function(ordinalScale) {
            if (ordinalScale.range().length < 2) {
                return 100;
            }
            return Math.abs(ordinalScale.range()[1] - ordinalScale.range()[0]);
        },

        // Call a function once all transitions of a selection have ended
        endAll: function(transition, globalCallback, perItemCallback) {
            if (transition.size() === 0 && globalCallback) {
                globalCallback();
            }
            var n = 0;
            transition
                .each(function () {
                    ++n;
                })
                .each("end", function () {
                    if (perItemCallback) perItemCallback.apply(this, arguments);
                    if (!--n) globalCallback.apply(this, arguments);
                });
        },

        // Computes the range length for an ordinal scale to have the given rangeBand, given domain length, padding & outerPadding
        getRangeForGivenRangeBand: function(rangeBand, domainLength, padding, outerPadding) {
            var n = domainLength;
            var step = rangeBand/(1-padding);
            return rangeBand * n + step * padding * (n-1) + 2 * step * outerPadding;
        }
    }
});


app.factory("CanvasUtils", function($q, $timeout) {
    var utils = {

        /**
         * Fill the entire canvas with the given color
         * @param canvas
         * @param color
         */
        fill: function(canvas, color) {
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.getAttribute("width"), canvas.getAttribute("height"));
        },

        /**
         * Downloads the given canvas as a .png image
         * (previous implementation was window.open(canvas.toDataURL('image/png')) but that is not allowed anymore (see #7660))
         */
        downloadCanvas: function(canvas, filename) {
            const a = document.createElement("a");
            a.href = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
            a.download = filename;
            a.style.display = "none";
            document.body.appendChild(a);       // FF won't click if the <a> is not in the DOM
            $timeout(function () {               // avoid "digest already in progress"
                a.click();
                a.remove();
            });
        },

        htmlToCanvas: function($el, scale) {

            var deferred = $q.defer();
            var $clone = $el.clone().insertAfter($el);
            var svgPromises = [];
            var bbox = $clone[0].getBoundingClientRect();
            scale = angular.isDefined(scale) ? scale : 1;

            var initialDisplay = $el.css("display");
            $el.css("display", "none");

            // html2canvas ignore svg elements, we need to convert them to canvas first using canvg
            utils.inlineAllStyles(d3.select($clone[0]).selectAll('svg'));

            $clone.find("svg").each(function(i, svg) {
                var rect = svg.getBoundingClientRect();
                var $canvas = $('<canvas>')
                    .css('position', 'absolute')
                    .css('top', rect.top - bbox.top)
                    .css('left', rect.left - bbox.left)
                    .css('height', rect.height + 'px')
                    .css('width', rect.width + 'px')
                    .attr('width', rect.width * scale)
                    .attr('height', rect.height * scale)
                    .appendTo($clone);

                $canvas[0].getContext('2d').scale(scale, scale);

                var svgText = new XMLSerializer().serializeToString(svg);

                var svgPromise = $q.defer();
                canvg($canvas[0], svgText, {ignoreDimensions: true, ignoreMouse: true, ignoreAnimation: true, renderCallback: svgPromise.resolve});
                svgPromises.push(svgPromise);

                $(svg).css("visibility", "hidden");
            });

            $q.all(svgPromises).then(function() {
                html2canvas_latest($clone[0], {backgroundColor: null, scale: scale, logging: false}).then(function(canvas) {
                        $clone.remove();
                        $el.css("display", initialDisplay);

                        deferred.resolve(canvas);
                });
            });

            return deferred.promise;
        },

        /**
         * Add inline style attribute for all children in the given selection (that includes the style from css files)
         * Useful before using canvg, that ignores style from .css files
         * @param {d3.selection} sel
         */
        inlineAllStyles: function(sel) {
            if (sel.size() === 0) {
                return;
            }

            var svg_style;
            for (var i = 0; i <= document.styleSheets.length - 1; i++) {
                try {
                    svg_style = document.styleSheets[i].rules || document.styleSheets[i].cssRules || [];
                } catch (e) {
                    // Firefox will fail with security error when attempting to access cross-domain style sheets from JS
                    if (e.name != 'SecurityError') {
                        throw e;
                    }
                }
                for (var j = 0; j < svg_style.length; j++) {
                    if (svg_style[j].type == 1) {
                        try {
                            sel.selectAll(svg_style[j].selectorText).style(utils._makeStyleObject(svg_style[j]));
                        } catch(e) {
                            // d3 fails to parse some of our css rules
                        }
                    }
                }
            }
        },

        _makeStyleObject: function(rule) {
            var styleDec = rule.style;
            var output = {};
            var s;
            for (s = 0; s < styleDec.length; s++) {
                output[styleDec[s]] = styleDec[styleDec[s]];
                if(styleDec[styleDec[s]] === undefined) {
                    output[styleDec[s]] = styleDec.getPropertyValue(styleDec[s])
                }
            }
            return output;
        }
    };

    return utils;
});
    
})();
    
(function(){
    'use strict';

        angular.module('dataiku.charts')
            .factory('LinesChart',  LinesChart)
            .factory('LinesDrawer', LinesDrawer)
            .factory('LinesBrushDrawer', LinesBrushDrawer)
            .factory('LinesZoomer',  LinesZoomer)
            .factory('LinesUtils',  LinesUtils);

        const CLIP_PATH_ID = 'chart-clip-path';

        function LinesChart(ChartViewCommon, ChartTensorDataWrapper, LinesDrawer, LinesBrushDrawer, LinesUtils, ChartDataUtils, MonoFuture, ChartDimension) {
            return function ($container, chartDef, chartHandler, axesDef, data, pivotRequest, zoomUtils, uiDisplayState, chartActivityIndicator, zoomer) {

                var initialChartData = ChartTensorDataWrapper(data, axesDef);
                var executePivotRequest = MonoFuture().wrap(pivotRequest);

                var facetLabels = initialChartData.getAxisLabels('facet') || [null], // We'll through the next loop only once if the chart is not facetted
                    yExtents = ChartDataUtils.getMeasureExtents(chartDef, data),
                    y1Domain = yExtents.y1.extent,
                    y2Domain = yExtents.y2.extent;

                var linesData = LinesUtils.prepareData(chartDef, initialChartData);
                let isInteractive = ChartDimension.isInteractiveChart(chartDef, zoomUtils.disableChartInteractivityGlobally);
                let handleZoom;

                if (isInteractive && zoomer) {
                    handleZoom = function (xAxis, svgs, chartDef, chartBase, showLoader) {
                        zoomer(xAxis, svgs, chartDef, chartBase, showLoader, drawFrame, executePivotRequest, axesDef, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator, drawBrush);
                    };
                    chartHandler.forceRotation = 0.5;
                } else {
                    chartHandler.forceRotation = undefined;
                }

                var drawFrame = function (frameIdx, chartBase, redraw, chartData = initialChartData) {

                    chartData.fixAxis('animation', frameIdx);

                    if (isInteractive) {
                        chartBase.zoomUtils = chartBase.zoomUtils || {};
                        chartBase.zoomUtils.frameIndex = frameIdx;
                    }

                    facetLabels.forEach(function (facetLabel, facetIndex) {
                        var g = d3.select(chartBase.$svgs.eq(facetIndex).find('g.chart').get(0));
                        LinesDrawer(g, chartDef, chartData.fixAxis('facet', facetIndex), chartBase, linesData, facetIndex, redraw, isInteractive);
                    });
                };

                var cleanFrame = function (chartBase) {
                    facetLabels.forEach(function (facetLabel, facetIndex) {
                        var g = d3.select(chartBase.$svgs.eq(facetIndex).find('g.chart').get(0));
                        LinesUtils.cleanChart(g, chartBase);
                    });
                };

                var drawBrush = function (chartBase, g, brushAxes) {
                    const isAnimated = chartBase.chartData.axesDef.animation !== undefined;
                    const hasSubcharts = facetLabels && facetLabels.length > 1;

                    if (isAnimated || hasSubcharts) {
                        return;
                    }
                    
                    LinesBrushDrawer(g, chartDef, initialChartData, chartBase, linesData, 0, brushAxes);
                }

                let xSpec = { type: 'DIMENSION', mode:'POINTS', dimension: chartDef.genericDimension0[0], name: 'x' };
                if (zoomUtils && zoomUtils.displayInterval) {
                    xSpec.initialInterval = { min: zoomUtils.displayInterval[0], max: zoomUtils.displayInterval[1] }
                }

                ChartViewCommon.initChart(chartDef, chartHandler, initialChartData, $container, drawFrame,
                    xSpec,
                    { type: 'MEASURE', domain: y1Domain, isPercentScale: yExtents.y1.onlyPercent },
                    { type: 'MEASURE', domain: y2Domain, isPercentScale: yExtents.y2.onlyPercent },
                    { type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension1[0] },
                    handleZoom,
                    zoomUtils
                );
            };
        }
    
        function LinesDrawer(Fn, LinesUtils, ChartDimension) {

            return function(g, chartDef, chartData, chartBase, linesData, facetIndex, redraw, isInteractive) {
                        
                const xDimension = chartDef.genericDimension0[0];
                const emptyBinsMode = xDimension.numParams.emptyBinsMode;
                const xLabels = chartData.getAxisLabels('x');
                const xAxis = chartBase.xAxis;
                const yAxis = chartBase.yAxis;
                const y2Axis = chartBase.y2Axis;
                
                chartBase.DOMUtils = chartBase.DOMUtils || {};
                chartBase.DOMUtils[facetIndex] = chartBase.DOMUtils[facetIndex] || {};

                const wrappers = LinesUtils.drawWrappers(chartDef, chartBase, linesData, g, isInteractive, redraw, 'wrapper', true);

                // During interaction, prevent re-drawing the points and remove them from the DOM for performances.
                if (!redraw) {
                    chartBase.DOMUtils[facetIndex].points = LinesUtils.drawPoints(chartDef, chartBase, chartData, facetIndex, wrappers, xAxis, xLabels, yAxis, y2Axis, xDimension, emptyBinsMode, 5, true);
                } else if (isInteractive && !chartBase.DOMUtils[facetIndex].pointsHaveBeenRemoved) {
                    chartBase.DOMUtils[facetIndex].points.remove();
                    chartBase.DOMUtils[facetIndex].pointsHaveBeenRemoved = true;
                }

                const [lineGenerator, lineGs, lineDashGs] = LinesUtils.configureLines(chartDef, chartData, facetIndex, wrappers, chartBase.DOMUtils[facetIndex].lineGenerator, xAxis, yAxis, y2Axis, xDimension, xLabels, emptyBinsMode, redraw);
    
                chartBase.DOMUtils[facetIndex].lineGenerator = lineGenerator;

                // Add thicker, invisible lines to catch mouseover event
                [lineGs, lineDashGs].forEach(lineGs => {
                    var hiddenLines = lineGs.selectAll('path.masked');

                    if (!redraw) {
                        hiddenLines = hiddenLines.data(function(d) { return [d]; })
                        hiddenLines.enter()
                            .insert('path')
                            .attr('class', 'line masked')
                            .attr('fill', 'none')
                            .attr('stroke-width', '10')
                            .attr('stroke', 'transparent');
                        hiddenLines.exit().remove();
                    }

                    hiddenLines.attr('d', Fn.SELF);
                });
    
                LinesUtils.drawPaths(chartDef, chartBase, chartData, facetIndex, lineGs, xDimension, xLabels, xAxis, yAxis, y2Axis, emptyBinsMode, redraw, !isInteractive, chartDef.strokeWidth, lineDashGs);

                if (!redraw) {
                    const isInteractive = ChartDimension.isInteractiveChart(chartDef, chartBase.zoomUtils && chartBase.zoomUtils.disableChartInteractivityGlobally);
                    // Clip paths to prevent lines from overlapping axis during offline zoom. Not necessary if not interactive.
                    isInteractive && LinesUtils.clipPaths(chartBase, g, wrappers);
                    // Handle hover on line : increase the stroke width by 1 px and show points.
                    let jWrappers = $('g.wrapper');
                    jWrappers.on('mouseover.line', event => LinesUtils.onLineMouseover(event, chartDef));
                    jWrappers.on('mouseout.point', event => LinesUtils.onPointMouseout(event, chartDef));
                }
            }
        }

        function LinesBrushDrawer(LinesUtils) {
            return function(g, chartDef, chartData, chartBase, linesData, facetIndex, brushAxes) {
                
                const xDimension = chartDef.genericDimension0[0];
                const emptyBinsMode = xDimension.numParams.emptyBinsMode;
                const xLabels = chartData.getAxisLabels('x');
                const xAxis = brushAxes.xAxis;
                const yAxis = brushAxes.yAxis;
                const y2Axis = brushAxes.y2Axis;
                const pointsRadius = 1;
                const lineStrokeWidth = 1;

                const wrappers = LinesUtils.drawWrappers(chartDef, chartBase, linesData, g, false, false, 'brush-wrapper', false);

                LinesUtils.drawPoints(chartDef, chartBase, chartData, facetIndex, wrappers, xAxis, xLabels, yAxis, y2Axis, xDimension, emptyBinsMode, pointsRadius, false);

                const [, lineGs, lineDashGs] = LinesUtils.configureLines(chartDef, chartData, facetIndex, wrappers, undefined, xAxis, yAxis, y2Axis, xDimension, xLabels, emptyBinsMode);

                LinesUtils.drawPaths(chartDef, chartBase, chartData, facetIndex, lineGs, xDimension, xLabels, xAxis, yAxis, y2Axis, emptyBinsMode, false, false, lineStrokeWidth, lineDashGs);
            } 
        }

        function LinesZoomer(Debounce, ChartRequestComputer, Logger, LinesChart, ChartDimension, ChartDataUtils, ChartAxes,
                             ChartActivityIndicator, ChartSetErrorInScope) {
            var executePivotRequest, loading, initialCursorPosition, cursorPosition;

            // The greyed out areas that represent missing data in the current aggregation level.
            // They appear when zooming out and panning.
            function createMissingDataArea(g) {
                const area = g.append('rect')
                    .attr('opacity', '0.6')
                    .attr('class', 'missing-data-area')
                    .attr('x', '0')
                    .attr('width', '0')
                    .attr('y', '0')
                    .attr('height', '0')
                    .attr('clip-path', 'url(#' + CLIP_PATH_ID + ')')
                    .style('-webkit-clip-path', 'url(#' + CLIP_PATH_ID + ')')
                    .style('pointer-events', 'none');

                return area;
            }

            function updateMissingDataAreas(chartBase) {
                if (chartBase.zoomUtils.displayIntervalBeforeInteraction && chartBase.zoomUtils.displayIntervalBeforeInteraction !== chartBase.zoomUtils.dataInterval) {
                    const dataIntervalMin = chartBase.zoomUtils.dataInterval[0];
                    const dataIntervalMax = chartBase.zoomUtils.dataInterval[1];
                    const displayIntervalBeforeInteractionMin = chartBase.zoomUtils.displayIntervalBeforeInteraction[0];
                    const displayIntervalBeforeInteractionMax = chartBase.zoomUtils.displayIntervalBeforeInteraction[1];

                    if (displayIntervalBeforeInteractionMin > dataIntervalMin) {
                        const scaledDataIntervalMin = chartBase.xAxis.scale()(dataIntervalMin);
                        const scaledIntervalBeforeInteractionMin = chartBase.xAxis.scale()(displayIntervalBeforeInteractionMin);

                        chartBase.zoomUtils.leftMissingDataAreas.forEach(area => {
                            area.attr('x', scaledDataIntervalMin)
                                .attr('width', scaledIntervalBeforeInteractionMin - scaledDataIntervalMin)
                                .attr('height', chartBase.vizHeight)
                        });
                    }
    
                    if (displayIntervalBeforeInteractionMax < dataIntervalMax) {
                        const scaledDataIntervalMax = chartBase.xAxis.scale()(dataIntervalMax);
                        const scaledIntervalBeforeInteractionMax = chartBase.xAxis.scale()(displayIntervalBeforeInteractionMax);

                        chartBase.zoomUtils.rightMissingDataAreas.forEach(area => {
                            area.attr('x', scaledIntervalBeforeInteractionMax)
                                .attr('width', scaledDataIntervalMax - scaledIntervalBeforeInteractionMax)
                                .attr('height', chartBase.vizHeight)
                        });
                    }
                }
            }

            function cleanZoomListeners(zoom) {
                zoom && zoom.on('zoomstart', null);
                zoom && zoom.on('zoom', null);
                zoom && zoom.on('zoomend', null);
                zoom = null;
            }

            function cleanMissingDataAreas(chartBase) {
                chartBase.zoomUtils.leftMissingDataAreas.forEach(area => {
                    area.attr('x', '0')
                    .attr('y', '0')
                    .attr('width', '0')
                    .attr('height', '0');
                });           
                
                chartBase.zoomUtils.rightMissingDataAreas.forEach(area => {
                    area.attr('x', '0')
                    .attr('y', '0')
                    .attr('width', '0')
                    .attr('height', '0');   
                });
            }

            function addDateToTitle(chartDef, additionalText) {
                let label = chartDef.genericDimension0[0].column;
                if (additionalText) {
                    label += ' (' + additionalText + ')';
                }
                document.querySelectorAll('.x.axis-label').forEach(elem => {
                    elem.textContent = label;
                }); 
            }

            function updateTicksFormat(chartDef, chartBase) {
                let xAxis = chartBase.xAxis;
                const xDomain = xAxis.scale().domain();
                const xMin = xDomain[0];
                const xMax = xDomain[1];

                if (!isFinite(xMin) || !isFinite(xMax)) { return; }

                const computedDateDisplayUnit = ChartDataUtils.computeDateDisplayUnit(xMin, xMax);
                addDateToTitle(chartDef, computedDateDisplayUnit.formattedMainDate);

                xAxis.tickFormat(date => {
                    return computedDateDisplayUnit.formatDateFn(date, computedDateDisplayUnit.dateFormat);
                });
            }

            /**
             * Wrapper for ChartDataUtils.getMeasureExtents().
             *
             * @param {ChartDef.java}   chartDef    - The chart definition.
             * @param {Object}          chartBase   - Everything that the chart might need.
             * @param {Array}           interval    - The x min and max values to use as filter when computing the extents.
             */
            function getYExtentsForInterval(chartBase, chartDef, interval) {

                const xMin = interval[0];
                const xMax = interval[1];
                const chartData = chartBase.chartData
                let results = {};

                const yExtents = ChartDataUtils.getMeasureExtents(chartDef, chartData.data, [xMin, xMax]);
                results.recordsCount = yExtents.recordsCount;
                results.pointsCount = yExtents.pointsCount;

                if (chartBase.yAxis) {
                    results.yExtent = [yExtents.y1.extent[0], yExtents.y1.extent[1]];
                }

                if (chartBase.y2Axis) {
                    results.y2Extent = [yExtents.y2.extent[0], yExtents.y2.extent[1]];
                }

                return results;
            }

            // Scale a given y axis to the given extent and update DOM accordingly.
            function setYDomain(chartDef, yAxis, selector, yExtent) {
                if (!yExtent) { return; }
                let yMin = yExtent[0];
                let yMax = yExtent[1];

                if (chartDef.includeZero) {
                    if (yMin > 0) {
                        yMin = 0;
                    } else if (yMax < 0) {
                        yMax = 0;
                    }
                }

                yAxis.scale().domain([yMin, yMax]);

                [...d3.selectAll(selector)[0]].forEach(yG => {
                    d3.select(yG).call(yAxis);
                });

            }

            function setYDomains(chartDef, chartBase) {
                setYDomain(chartDef, chartBase.yAxis, '.y1.axis', chartBase.zoomUtils.yExtent);
                setYDomain(chartDef, chartBase.y2Axis, '.y2.axis', chartBase.zoomUtils.y2Extent);
            }

            // Constructs the horizontal lines that help readability of chart points. From left axis values in priority, fallback on right axis.
            function updateHLines(chartBase) {
                let yAxis, yMin, yMax;

                if (chartBase.yAxis) {
                    yAxis = chartBase.yAxis;
                    yMin = chartBase.zoomUtils.yExtent[0];
                    yMax = chartBase.zoomUtils.yExtent[1];
                } else if (chartBase.y2Axis) {
                    yAxis = chartBase.y2Axis;
                    yMin = chartBase.zoomUtils.y2Extent[0];
                    yMax = chartBase.zoomUtils.y2Extent[1];
                } else {
                    return; 
                } 

                if (!isFinite(yMin) || !isFinite(yMax)) {
                    return;
                }

                const hLines = document.querySelectorAll('.hlines');

                if (hLines && hLines.length) {
                    hLines.forEach(hLine => hLine.parentNode && hLine.parentNode.removeChild(hLine));
                }
                [...chartBase.zoomUtils.svgs].forEach(svg => {
                    let g = d3.select(svg).select('g');

                    g.insert('g', ':first-child').attr('class', 'hlines')
                        .selectAll('.hline').data(yAxis.tickValues() || yAxis.scale().ticks(yAxis.ticks()[0]))
                        .enter().append('line')
                        .attr('class', 'hline')
                        .attr('y1', function (d) {
                            return yAxis.scale()(d);
                        })
                        .attr('y2', function (d) {
                            return yAxis.scale()(d);
                        })
                        .attr('x1', 0)
                        .attr('x2', chartBase.vizWidth);
                });

                // Also update the x axis domain path (that could move when the chart has both positive and negative values)
                const scaledZero = chartBase.yAxis.scale()(0);
                const pathTranslation = scaledZero - chartBase.vizHeight;
                d3.selectAll('.x.axis path.domain')
                    .attr('transform', `translate(0, ${pathTranslation})`);
            }

            function updateXAxes(xAxis) {
                [...d3.selectAll('.chart-svg .x.axis')[0]].forEach(xG => {
                    xG = d3.select(xG);
                    xG.call(xAxis);
                    xG.selectAll('.tick text')
                        .attr('transform', function() {
                            let labelAngle = 0.5
                            let translateValue = '-33, 15';
                            let rotateValue = labelAngle * -180 / Math.PI;

                            return 'translate(' + translateValue + '), rotate(' + rotateValue + ', 0, 0)';
                        });
                });
            }

            function setXDomain(chartDef, chartBase, xAxis) {
                updateTicksFormat(chartDef, chartBase);
                updateXAxes(xAxis);
            }

            /**
             * Compare a previously saved zoom event to a newer one to know what we are currently doing (zooming, panning...).
             *
             * @param {d3.event} previousZoomEvent  - Previously saved d3 event.
             * @param {d3.event} currentZoomEvent   - Current d3 event.
             *
             * @returns {zoomState} zoomState
             */
            function getCurrentZoomState(previousZoomEvent, currentZoomEvent) {
                let zoomState = {};

                const isZooming = currentZoomEvent.scale !== previousZoomEvent.scale;

                zoomState.isZoomingIn = isZooming && currentZoomEvent.scale > previousZoomEvent.scale;
                zoomState.isPanningLeft = !isZooming && currentZoomEvent.translate[0] > previousZoomEvent.translate[0];
                zoomState.isPanningRight = !isZooming && currentZoomEvent.translate[0] < previousZoomEvent.translate[0];

                return zoomState;
            }

            /**
             * Check if extents of left and right axis are valid ie have:
             *  * Finite numbers
             *  * Different mix and max values
             *
             * @param {Array} yExtent        - Min and max interval for y axis.
             * @param {Array} y2Extent       - Min and max interval for y2 axis.
             *
             * @returns {Boolean} True if both y extents are valid.
             */
            function hasValidYExtents(yExtent, y2Extent) {
                const isYExtentFinite = yExtent && isFinite(yExtent[0]) && isFinite(yExtent[1]);
                const isY2ExtentFinite = y2Extent && isFinite(y2Extent[0]) && isFinite(y2Extent[1]);
                const isYExtentValid = !yExtent || (isYExtentFinite && yExtent[0] !== yExtent[1]);
                const isY2ExtentValid = !y2Extent || (isY2ExtentFinite && y2Extent[0] !== y2Extent[1]);

                return isYExtentValid && isY2ExtentValid;
            }

            /**
             * From a given zoom domain, decide what to do for incoming offline zoom.
             *
             * 1 - (If necessary) adapts the zoomed domain to create a valid display interval:
             *  * Composed of finite numbers.
             *  * Included in the data range.
             *  * Displaying more than one point.
             *
             * 2 - Check if we should rescale x domain for this display interval.
             * 3 - Check if we should prevent the current offline zoom.
             * 4 - Check if we should prevent backend refresh.
             *
             * @param {ChartDef.java}           chartDef        - The chart definition.
             * @param {Object}                  chartBase        - Everything that the chart might need.
             * @param {Array}                   zoomedDomain    - The d3 domain currently zoomed.
             * @param {d3.behavior.zoom}        zoom            - The d3 zoom behavior instance.
             *
             * @returns {Object} { displayInterval: Array, yExtents: Object, shouldRescale: Boolean, preventOfflineZoom: Boolean, preventNextPivotRequest: Boolean }
             */
            function inspectZoom(chartDef, chartBase, zoomedDomain) {
                const zoomedIntervalMin = zoomedDomain[0];
                const zoomedIntervalMax = zoomedDomain[1];
                const dataIntervalMin = chartBase.zoomUtils.dataInterval[0];
                const dataIntervalMax = chartBase.zoomUtils.dataInterval[1];
                const currentPointsCount = chartBase.zoomUtils.pointsCount;

                let inspectedZoom = {
                    displayInterval: [zoomedIntervalMin, zoomedIntervalMax],
                    yExtents: getYExtentsForInterval(chartBase, chartDef, [zoomedIntervalMin, zoomedIntervalMax]),
                    shouldRescale: false,
                    preventOfflineZoom: false,
                    preventNextPivotRequest: false
                }

                const zoomState = getCurrentZoomState(chartBase.zoomUtils.previousZoomEvent, d3.event);
                const isDomainIntervalFinite = isFinite(zoomedDomain[0]) && isFinite(zoomedDomain[1]);

                const isTooMuchOnLeft = zoomedDomain[0] <= dataIntervalMin;
                const isTooMuchOnRight = zoomedDomain[1] >= dataIntervalMax;
                const isPanningLeftTooMuch = zoomState.isPanningLeft && isTooMuchOnLeft;
                const isPanningRightTooMuch = zoomState.isPanningRight && isTooMuchOnRight;
                const isZoomingOutTooMuch = isTooMuchOnLeft && isTooMuchOnRight;
                const hasAlreadyInteracted = (chartBase.zoomUtils.displayIntervalBeforeInteraction[0] !== dataIntervalMin) || (chartBase.zoomUtils.displayIntervalBeforeInteraction[1] !== dataIntervalMax);

                if (!isDomainIntervalFinite) {
                    inspectedZoom.displayInterval = chartBase.zoomUtils.lastValidDisplayInterval;
                }

                if (isTooMuchOnLeft) {
                    inspectedZoom.displayInterval[0] = dataIntervalMin;
                }

                if (isTooMuchOnRight) {
                    inspectedZoom.displayInterval[1] = dataIntervalMax;
                }

                if (isPanningLeftTooMuch || isPanningRightTooMuch) {
                    inspectedZoom.preventOfflineZoom = true;
                }

                if (isZoomingOutTooMuch) {
                    inspectedZoom.displayInterval = chartBase.zoomUtils.dataInterval;
                    if (hasAlreadyInteracted) {
                        inspectedZoom.disableZoomFiltering = true;
                    } else {
                        inspectedZoom.preventNextPivotRequest = true;
                    }
                }

                if (currentPointsCount <= 1 && zoomState.isZoomingIn) {
                    inspectedZoom.preventOfflineZoom = true;
                    inspectedZoom.preventNextPivotRequest = true;
                }

                if (inspectedZoom.displayInterval === undefined) {
                    inspectedZoom.preventOfflineZoom = true;
                }

                inspectedZoom.shouldRescale = (zoomedIntervalMin !== inspectedZoom.displayInterval[0]) || (zoomedIntervalMax !== inspectedZoom.displayInterval[1]);

                return inspectedZoom;
            }

            // Simply updates any useful zoom info for incoming zoom actions.
            function updateZoomUtils(chartBase, inspectedZoom) {

                chartBase.zoomUtils.displayInterval = inspectedZoom.displayInterval;

                if (inspectedZoom.shouldRescale) {
                    chartBase.xAxis.scale().domain([inspectedZoom.displayInterval[0], inspectedZoom.displayInterval[1]]);
                }

                const isDisplayIntervalValid = inspectedZoom.yExtents.pointsCount > 1
                    && hasValidYExtents(inspectedZoom.yExtents.yExtent, inspectedZoom.yExtents.y2Extent)
                    && inspectedZoom.displayInterval[0] !== inspectedZoom.displayInterval[1];

                if (isDisplayIntervalValid) {
                    chartBase.zoomUtils.lastValidDisplayInterval = inspectedZoom.displayInterval;
                }

                chartBase.zoomUtils = { ...chartBase.zoomUtils, ...inspectedZoom.yExtents }
                chartBase.zoomUtils.disableZoomFiltering = inspectedZoom.disableZoomFiltering;
                chartBase.zoomUtils.previousZoomEvent = d3.event;
            }

            function updateBrush(chartBase, uiDisplayState) {
                uiDisplayState.brushData.displayInterval = { from: chartBase.zoomUtils.displayInterval[0], to: chartBase.zoomUtils.displayInterval[1] };
            }

            function redrawChart(chartDef, chartBase, drawFrame, xAxis) {
                setXDomain(chartDef, chartBase, xAxis);
                setYDomains(chartDef, chartBase);
                drawFrame(chartBase.zoomUtils.frameIndex, chartBase, true);
                updateHLines(chartBase);
                updateMissingDataAreas(chartBase);
            }

            /**
             * Listener attached to the chart zoom to perform the offline zooming.
             *
             * @param {ChartDef.java}           chartDef        - The chart definition.
             * @param {Object}                  chartBase       - Everything that the chart might need.
             * @param {d3.behavior.zoom}        zoom            - The d3 zoom behavior instance.
             * @param {Function}                drawFrame       - The callback that will redraw the chart.
             *
             */
            function handleOfflineZoom(chartDef, chartBase, zoom, drawFrame, uiDisplayState) {
                if (chartBase.zoomUtils.offlineZoomDisabled) { return; }
                chartBase.zoomUtils.sequenceId++;
                cursorPosition = d3.event;
                const xAxis = chartBase.xAxis;
                const zoomedDomain = xAxis.scale().domain();
                const inspectedZoom = inspectZoom(chartDef, chartBase, zoomedDomain, zoom);
                chartBase.zoomUtils.preventNextPivotRequest = inspectedZoom.preventNextPivotRequest;
                if (inspectedZoom.preventOfflineZoom) { 
                    if (chartBase.zoomUtils.pointsCount === 0) {
                        uiDisplayState.chartTopRightLabel = ChartDataUtils.computeNoRecordsTopRightLabel();
                    }
                    return; 
                }
                uiDisplayState.hideAggregationsMetrics = true;
                updateZoomUtils(chartBase, inspectedZoom);
                updateBrush(chartBase, uiDisplayState);
                redrawChart(chartDef, chartBase, drawFrame, xAxis);
            }

            function buildChartInteractionErrorMessage(data, status, headers) {
                const knownError = ChartSetErrorInScope.buildValidityForKnownError(data, status, headers);
                if (knownError !== undefined) {
                    return knownError.message;
                } else if (data.message) {
                    return data.message; 
                }
                return 'An unknown error occurred while interacting with the chart.';
            }

            /**
             * Asks for new data inside the given display interval and create a new one accordingly.
             *
             *
             * @param {ChartDef.java}           chartDef                - The chart definition.
             * @param {Object}                  chartBase               - Everything that the chart might need.
             * @param {d3.behavior.zoom}        zoom                    - The d3 zoom behavior instance.
             * @param {Function}                cleanFrame              - The callback that will remove the chart from DOM.
             * @param {Object}                  uiDisplayState          - Everything the UI might need.
             * @param {Object}                  chartActivityIndicator  - Activity indicator displayed in chart
             */
            function computePivotRequest(chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator, request) {

                loading();      
                executePivotRequest(request, false, true).success(function(data) {
    
                    if (data.result.pivotResponse.axisLabels[0] && data.result.pivotResponse.axisLabels[0].length === 1) {
                        Logger.info('Not enough data in the result: chart won\'t be refreshed.');
                        cleanOfflineFeedbacks(chartBase, uiDisplayState);
                        return;
                    }
                    
                    const responseSequenceId = data.result.pivotResponse.sequenceId;
                    
                    if (responseSequenceId === chartBase.zoomUtils.sequenceId) {
                        Logger.info('Sequence ids match (' + responseSequenceId + '). Deactivate offline zoom and refresh the chart.');
                        cleanAll(chartBase, cleanFrame, uiDisplayState);
                        chartBase.zoomUtils.preventThumbnailUpdate = true;
                        chartBase.zoomUtils.offlineZoomDisabled = true;
                        LinesChart($('.pivot-charts').css('display', ''), chartDef, chartHandler, chartBase.zoomUtils.axesDef, data.result.pivotResponse, executePivotRequest, chartBase.zoomUtils, uiDisplayState, chartActivityIndicator, zoomer);
                        uiDisplayState.chartTopRightLabel = ChartDataUtils.computeChartTopRightLabel(
                            data.result.pivotResponse.afterFilterRecords,
                            ChartDimension.getComputedMainAutomaticBinningModeLabel(
                                uiDisplayState, data.result.pivotResponse,
                                chartDef, chartBase.zoomUtils.disableChartInteractivityGlobally)
                        );
                    } else {
                        Logger.info('Sequence ids do not match (' + responseSequenceId + ', ' + chartBase.zoomUtils.sequenceId + '): chart won\'t be refreshed.');
                    }
                }).error(function(data, status, headers) {
                    Logger.info("An error occurred during zoom pivot request");
                    ChartActivityIndicator.displayBackendError(
                        chartActivityIndicator,
                        buildChartInteractionErrorMessage(data, status, headers)
                    );
                    uiDisplayState.chartTopRightLabel = ChartDataUtils.computeNoRecordsTopRightLabel();
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                });
            }

            const debouncedPivotRequest = Debounce()
                .withDelay(300, 300)
                .wrap(computePivotRequest);

            function handleOfflineZoomend(chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator) {

                if (chartBase.zoomUtils.offlineZoomDisabled) { 
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                    return;
                }

                if (chartBase.zoomUtils.preventNextPivotRequest) {
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                    chartBase.zoomUtils.preventNextPivotRequest = false;
                    return;
                }

                let request;
                let wasClick = (initialCursorPosition === cursorPosition);

                initialCursorPosition = {};
                cursorPosition = {};

                if (wasClick) { 
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                    return; 
                }

                try {
                    let chartZone = document.querySelector('.chart-zone');
                    let width = chartZone.getBoundingClientRect().width;
                    let height = chartZone.getBoundingClientRect().height;
                    request = ChartRequestComputer.compute(chartDef, width, height, { zoomUtils: chartBase.zoomUtils });
                    request.useLiveProcessingIfAvailable = chartDef.useLiveProcessingIfAvailable;
                    Logger.info('Zoom request is', request);
                } catch(error) {
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                    Logger.info('Not executing zoom request, chart is not ready', error);
                }    
            
                debouncedPivotRequest(chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator, request);
            }

            /**
             * Clean every visual feedbacks the user may have when interacting:
             *  - Grey areas for missing data
             *  - Grey text color for top-right aggregations info.
             * 
             * @param {Object}  chartBase       - Everything that the chart might need.
             * @param {Object}  uiDisplayState  - Everything the UI might need.
             */
            function cleanOfflineFeedbacks(chartBase, uiDisplayState) {
                uiDisplayState.hideAggregationsMetrics = false;
                loading(false);
                cleanMissingDataAreas(chartBase);
            }

            /**
             * Clean offline feedbacks, the chart, and every listeners previously attached for interactivity.
             * 
             * @param {Object}      chartBase       - Everything that the chart might need.
             * @param {Function}    cleanFrame      - Function that removes the chart.
             * @param {Object}      uiDisplayState  - Everything the UI might need.
             */
            function cleanAll(chartBase, cleanFrame, uiDisplayState) {
                cleanOfflineFeedbacks(chartBase, uiDisplayState);
                cleanZoomListeners(chartBase.zoomUtils.zoom);
                cleanFrame(chartBase);
            }

            function initZoomUtils(chartDef, chartBase, svgs, axesDef) {
                
                const xAxisDomain = chartBase.xAxis.scale().domain();

                chartBase.zoomUtils = chartBase.zoomUtils || {};
                chartBase.zoomUtils.disableChartInteractivityGlobally = false;

                // DOM related
                chartBase.zoomUtils.svgs = svgs;
                chartBase.zoomUtils.leftMissingDataAreas = [];
                chartBase.zoomUtils.rightMissingDataAreas = [];
                chartBase.zoomUtils.wrappers = null;

                // Axis related
                chartBase.zoomUtils.axesDef = axesDef;
                chartBase.zoomUtils.dataInterval = chartBase.zoomUtils.dataInterval || xAxisDomain;
                chartBase.zoomUtils.displayInterval = chartBase.zoomUtils.displayInterval || chartBase.zoomUtils.dataInterval;
                chartBase.zoomUtils.displayIntervalBeforeInteraction = xAxisDomain;
                chartBase.zoomUtils.lastValidDisplayInterval = chartBase.zoomUtils.displayIntervalBeforeInteraction;
                chartBase.zoomUtils.disableZoomFiltering = false;
                // Will update the counts
                chartBase.zoomUtils = {...chartBase.zoomUtils , ...getYExtentsForInterval(chartBase, chartDef, chartBase.zoomUtils.displayInterval)};

                // Zoom related
                chartBase.zoomUtils.previousZoomEvent = { scale: 1, translate: [0, 0] };
                chartBase.zoomUtils.zoomState = {};
                chartBase.zoomUtils.preventThumbnailUpdate = chartBase.zoomUtils.preventThumbnailUpdate || false;
                if (!chartBase.zoomUtils.sequenceId) {
                    chartBase.zoomUtils.sequenceId = 0;
                }
                chartBase.zoomUtils.offlineZoomDisabled = false;
            } 

            function configureZoom(chartDef, chartBase, chartHandler, xAxis, drawFrame, cleanFrame, uiDisplayState, chartActivityIndicator) {
                const zoom = d3.behavior.zoom();

                chartBase.zoomUtils.zoom = zoom;

                zoom.x(xAxis.scale())
                    .on('zoomstart', () => {
                        if (chartBase.zoomUtils.offlineZoomDisabled) { return; }
                        chartBase.zoomUtils.sequenceId++;
                        cursorPosition = d3.event;
                        initialCursorPosition = cursorPosition;
                        if (!chartBase.zoomUtils.previousZoomEvent) {
                            chartBase.zoomUtils.previousZoomEvent = { scale: 1, translate: [0, 0] };
                        }
                    })
                    .on('zoom', handleOfflineZoom.bind(this, chartDef, chartBase, zoom, drawFrame, uiDisplayState))
                    .on('zoomend', handleOfflineZoomend.bind(this, chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator));

                // Compute the max possible zoom scale for the finest aggregation level (seconds for now) thus preventing zooming too much.
                const finestRangeInSeconds = (chartBase.zoomUtils.displayInterval[1] - chartBase.zoomUtils.displayInterval[0]) / 1000;
                chartBase.zoomUtils.maxScale = Math.log2(finestRangeInSeconds);

                if (chartBase.zoomUtils.dataInterval === chartBase.zoomUtils.displayInterval) {
                    zoom.scaleExtent([1, chartBase.zoomUtils.maxScale]);
                } else {
                    zoom.scaleExtent([0.1, chartBase.zoomUtils.maxScale]);
                }
                
                [...chartBase.zoomUtils.svgs].forEach(svg => {
                    const g = d3.select(svg).select('g.chart');
                    g.call(zoom);
                
                    // d3 won't trigger zoom events on the whole g.chart group. It zooms only on filled elements.
                    // This will enable zoom on the whole chart.
                    g.append('rect')
                        .attr('opacity', '0')
                        .attr('x', '0')
                        .attr('width', chartBase.vizWidth)
                        .attr('y', '0')
                        .attr('height', chartBase.vizHeight)

                    const areaLeft = createMissingDataArea(g);
                    const areaRight = createMissingDataArea(g);

                    chartBase.zoomUtils.leftMissingDataAreas.push(areaLeft);
                    chartBase.zoomUtils.rightMissingDataAreas.push(areaRight);

                    areaLeft.call(zoom);
                    areaRight.call(zoom);
                });

                // Will display more accurate labels
                setXDomain(chartDef, chartBase, xAxis);
            }

            function handleBrushChanged(chartDef, chartBase, drawFrame, chartHandler, xAxis, zoom, cleanFrame, uiDisplayState, chartActivityIndicator) {
                
                const brushInterval = uiDisplayState.brushData.displayInterval;
                
                if (chartBase.zoomUtils.displayInterval[0] === brushInterval.from && chartBase.zoomUtils.displayInterval[1] === brushInterval.to) { return; }
                if (chartBase.zoomUtils.dataInterval[0] === brushInterval.from && chartBase.zoomUtils.dataInterval[1] === brushInterval.to) { chartBase.zoomUtils.disableZoomFiltering = true; }

                chartBase.zoomUtils.sequenceId++;
                chartBase.zoomUtils.displayInterval = [brushInterval.from, brushInterval.to];
                
                xAxis.scale().domain(chartBase.zoomUtils.displayInterval);
                zoom.x(xAxis.scale());
                uiDisplayState.hideAggregationsMetrics = true;
                
                const yExtents = getYExtentsForInterval(chartBase, chartDef, [chartBase.zoomUtils.displayInterval[0], chartBase.zoomUtils.displayInterval[1]]);
                chartBase.zoomUtils = { ...chartBase.zoomUtils, ...yExtents };
                
                redrawChart(chartDef, chartBase, drawFrame, xAxis);
                handleOfflineZoomend(chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator);
            }

            function computeBrushDimensions() {
                let brushDimensions = {};

                const chartDOM = document.querySelector('.graphWrapper');
                const chartClientRect = chartDOM.getBoundingClientRect();
                const chartLeft = chartClientRect.left;

                const hLinesDom = chartDOM.querySelector('.hlines');
                const hLinesClientRect = hLinesDom.getBoundingClientRect();
                const hLinesLeft = hLinesClientRect.left;
                const hLinesWidth = hLinesClientRect.width;

                brushDimensions.paddingLeft = hLinesLeft - chartLeft;
                brushDimensions.width = hLinesWidth;

                return brushDimensions;
            }

            function onBrushInit(chartBase, chartDef, drawBrush) {
                return function(brushContentG, brushContentHeight, brushContentWidth) {

                    const xAxisLogScale = (chartBase.xSpec && chartBase.xSpec.type == "MEASURE" && chartDef.axis1LogScale);

                    const xAxis = ChartAxes.createAxis(chartBase.chartData, chartBase.xSpec, chartBase.isPercentChart, xAxisLogScale);
                    const yAxis = ChartAxes.createAxis(chartBase.chartData, chartBase.ySpec, chartBase.isPercentChart, chartDef.axis1LogScale, chartDef.includeZero);
                    const y2Axis = ChartAxes.createAxis(chartBase.chartData, chartBase.y2Spec, chartBase.isPercentChart, chartDef.axis2LogScale, chartDef.includeZero);

                    xAxis.setScaleRange([0, brushContentWidth]);

                    if (yAxis) {
                        if (chartBase.ySpec.ascendingDown) {
                            yAxis.setScaleRange([0, brushContentHeight]);
                        } else {
                            yAxis.setScaleRange([brushContentHeight, 0]);
                        }
                    }

                    if (y2Axis) {
                        y2Axis.setScaleRange([brushContentHeight, 0]);
                    }

                    const brushAxes = {
                        xAxis: xAxis,
                        yAxis: yAxis,
                        y2Axis: y2Axis
                    }

                    drawBrush(chartBase, brushContentG, brushAxes);
                    chartBase.zoomUtils.hasBrushBeenDrawn = true;
                }
            }

            function configureBrush(chartDef, chartBase, chartHandler, drawFrame, xAxis, zoom, cleanFrame, uiDisplayState, drawBrush, chartActivityIndicator) {

                if (!chartDef.brush) {
                    return;
                }

                if (chartBase.zoomUtils.hasBrushBeenDrawn) {
                    uiDisplayState.brushData.onChange = handleBrushChanged.bind(this, chartDef, chartBase, drawFrame, chartHandler, chartBase.xAxis, zoom, cleanFrame, uiDisplayState, chartActivityIndicator);
                } else {
                    const brushDimensions = computeBrushDimensions();

                    uiDisplayState.brushData = {
                        dataInterval: { from: chartBase.zoomUtils.dataInterval[0], to: chartBase.zoomUtils.dataInterval[1] },
                        displayInterval: { from: chartBase.zoomUtils.displayInterval[0], to: chartBase.zoomUtils.displayInterval[1] },
                        snapRanges: { from: chartBase.zoomUtils.displayInterval[0], to: chartBase.zoomUtils.displayInterval[1] },
                        onChange: handleBrushChanged.bind(this, chartDef, chartBase, drawFrame, chartHandler, xAxis, zoom, cleanFrame, uiDisplayState, chartActivityIndicator),
                        paddingLeft: brushDimensions.paddingLeft,
                        width: brushDimensions.width,
                        onInit: onBrushInit(chartBase, chartDef, drawBrush)
                    }
                }

                uiDisplayState.displayBrush = true;
            }

            function zoomer(xAxis, svgs, chartDef, chartBase, showLoader, drawFrame, pivotRequestCallback, axesDef, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator, drawBrush) {
                loading = showLoader;
                executePivotRequest = pivotRequestCallback;
                initZoomUtils(chartDef, chartBase, svgs, axesDef);
                configureZoom(chartDef, chartBase, chartHandler, xAxis, drawFrame, cleanFrame, uiDisplayState, chartActivityIndicator);
                configureBrush(chartDef, chartBase, chartHandler, drawFrame, xAxis, chartBase.zoomUtils.zoom, cleanFrame, uiDisplayState, drawBrush, chartActivityIndicator);
            }

            return zoomer;
        }

        function LinesUtils(ChartDimension, Fn) {
            const svc = {

                drawPaths: function(chartDef, chartBase, chartData, facetIndex, lineGs, xDimension, xLabels, xAxis, yAxis, y2Axis, emptyBinsMode, redraw, transition, strokeWidth, lineDashGs) {

                    const paths = lineGs.selectAll('path.visible').data(function(d) { return [d]; });

                    paths.enter()
                        .insert('path')
                        .attr('class', 'line visible')
                        .attr('fill', 'none')
                        .attr('stroke-width', strokeWidth);

                    paths.exit().remove();

                    const dashPaths = lineDashGs.selectAll('path.visible').data(function(d) { return [d]; });

                    dashPaths.enter()
                        .insert('path')
                        .attr('class', 'line visible')
                        .attr('fill', 'none')
                        .attr('stroke-dasharray', 12)
                        .attr('stroke-width', strokeWidth);
                    dashPaths.exit().remove();
                    dashPaths.attr('d', Fn.SELF)

                    if (!transition) {
                        paths.attr('d', Fn.SELF)
                            .each(function() {
                                let path = d3.select(this);
                                let wrapper = d3.select(this.parentNode.parentNode);
                                svc.drawPath(path, wrapper, emptyBinsMode, redraw, chartBase, svc.xCoord, svc.yCoord, chartData, chartDef, xDimension, xLabels, xAxis, yAxis, y2Axis);
                            });
                    } else {
                        paths.transition().attr('d', Fn.SELF)
                            .each('end', function() {
                                let path = d3.select(this);
                                let wrapper = d3.select(this.parentNode.parentNode);
                                svc.drawPath(path, wrapper, emptyBinsMode, redraw, chartBase, svc.xCoord, svc.yCoord, chartData, chartDef, xDimension, xLabels, xAxis, yAxis, y2Axis);
                            });
                    }
                },

                /**
                 * - Build a d3 line generator if none provided.
                 * - In the wrappers, creates <g>s with class "line". 
                 * - Bind to them the data computed by the line generator for the given points data.
                 */
                configureLines: function(chartDef, chartData, facetIndex, wrappers, lineGenerator, xAxis, yAxis, y2Axis, xDimension, xLabels, emptyBinsMode) {
                                
                    if (!lineGenerator) {
                        lineGenerator = d3.svg.line()
                        .x(d => svc.xCoord(xDimension, xLabels, xAxis)(d))
                        .y(d => svc.yCoord(d, chartDef, chartData, yAxis, y2Axis))
                         // in DASHED mode, the dashed lines are drawn separately => we must remove missing values from the main line
                        .defined(x => emptyBinsMode === 'ZEROS' || svc.nonZeroCountFilter(x, facetIndex, chartData));
                        // If smoothing, change the interpolation mode (the process of adding new points between existing ones) to cubic interpolation that preserves monotonicity in y.
                        if (chartDef.smoothing) lineGenerator.interpolate('monotone');
                    }

                    const lineGs = wrappers.selectAll('g.line').data(function(d) {
                        d.filteredPointsData = d.pointsData.filter(d => svc.nonZeroCountFilter(d, facetIndex, chartData));
                        const data = (emptyBinsMode === 'ZEROS' || emptyBinsMode == 'DASHED') ? d.pointsData : d.filteredPointsData;
                        return [lineGenerator(data)];
                    });

                    const lineDashGs = wrappers.selectAll('g.dashedline').data(function(d) {
                        if(emptyBinsMode === 'DASHED') {
                            // null is added after every segment in order to make them disconnected (using defined() below)
                            const data = svc.getEmptySegments(d.pointsData).flatMap(s => [s[0], s[1], null])
                            const segmentGenerator = d3.svg.line()
                                .x(d => svc.xCoord(xDimension, xLabels, xAxis)(d))
                                .y(d => svc.yCoord(d, chartDef, chartData, yAxis, y2Axis))
                                .defined(d => d != null);
                            return [segmentGenerator(data)];
                        }
                        return [];
                    });

                    lineGs.enter().insert('g', ':first-child').attr('class', 'line');
                    lineGs.exit().remove();

                    lineDashGs.enter().insert('g', ':first-child').attr('class', 'dashedline');
                    lineDashGs.exit().remove();

                    return [lineGenerator, lineGs, lineDashGs];
                }, 

                /**
                 * - In the given line wrappers, create <circle> with class "point", a given radius for each points of the lines.
                 * - These points will have a color defined by the color scale and an attached tooltip if requested.
                 */
                drawPoints: function(chartDef, chartBase, chartData, facetIndex, wrappers, xAxis, xLabels, yAxis, y2Axis, xDimension, emptyBinsMode, radius, registerTooltips) {

                    let points = wrappers.selectAll('circle.point');

                    points = points.data(function(d) {
                        return (emptyBinsMode === 'ZEROS') ? d.pointsData : (d.filteredPointsData = d.pointsData.filter(d => svc.nonZeroCountFilter(d, facetIndex, chartData)));
                    }, Fn.prop('x'));
    
                    points.enter().append('circle')
                        .attr('class', 'point point--masked')
                        .attr('r', radius)
                        .attr('fill', function(d) { 
                            return chartBase.colorScale(d.color + d.measure); 
                        })
                        .attr('cy', (yAxis || y2Axis).scale()(0))
                        .attr('opacity', 0)                    
                    
                    if (registerTooltips) {
                        points.each(function(d) { 
                            chartBase.tooltips.registerEl(this, { measure: d.measure, x: d.x, color: d.color, facet: facetIndex }, 'fill', false); 
                        });
                    }
    
                    // Remove potential duplicates
                    points.exit().remove();

                    points.attr('cx', d => svc.xCoord(xDimension, xLabels, xAxis)(d))
                        .attr('cy', d => svc.yCoord(d, chartDef, chartData, yAxis, y2Axis));

                    // Remove points that are not linked to others through lines.
                    wrappers.selectAll('circle.lonely').remove();

                    return points;
                },

                /**
                 * - Creates a <g> (group) element with class "wrapper" for each line to be drawn.
                 * - Joins the lines data with these wrappers.
                 * - Strokes them according to the chart's color scale, set the opacity as per the options, and attach tooltips if requested.
                 * - We need to add a key selector (id) to ensures consistent binding between lines data to lines DOM while zooming.
                 */
                drawWrappers: function(chartDef, chartBase, linesData, g, isInteractive, redraw, className, registerTooltips) {
                    let wrappers = g.selectAll('g.' + className);

                    if (!redraw) {
                        wrappers = wrappers.data(linesData, d => d.id);
                        wrappers.enter().append('g').attr('class', className)
                            .attr('stroke', function(d) { return chartBase.colorScale(d.color + d.measure); })
                            .attr('opacity', chartDef.colorOptions.transparency);

                        if (registerTooltips) {
                            wrappers.each(function(d) { chartBase.tooltips.registerEl(this, { measure: d.measure, color: d.color}, 'stroke', true, isInteractive); });
                        }

                        // Remove the exiting selection ie existing DOM elements for which no new data has been found to prevent duplicates.
                        wrappers.exit().remove();
                    }

                    return wrappers;
                },

                drawPath: function(path, wrapper, emptyBinsMode, redraw, chartBase, xCoord, yCoord, chartData, chartDef, xDimension, xLabels, xAxis, yAxis, y2Axis) {

                    var lineData = wrapper.data()[0];
    
                    // Data points that are not part of a line segment and need to be drawn explicitly
                    let lonelyPoints = [];
                    if (lineData.filteredPointsData.length === 1) {
                        lonelyPoints = [lineData.filteredPointsData[0]];
                    }

                    if (emptyBinsMode === 'DASHED' && !redraw) {
                        let emptySegments = svc.getEmptySegments(lineData.pointsData);

                        if (lineData.filteredPointsData.length > 1) {
                            emptySegments.forEach(function (seg, i) {
                                if (i === 0) {
                                    if (seg[0].$idx === 0) lonelyPoints.push(seg[0]);
                                } else if (i === emptySegments.length - 1 && seg[1].$idx === lineData.filteredPointsData[lineData.filteredPointsData.length - 1].$idx) {
                                    lonelyPoints.push(seg[1]);
                                }
                                if (emptySegments[i+1] && emptySegments[i][1] === emptySegments[i+1][0]) {
                                    lonelyPoints.push(emptySegments[i][1]);
                                }
                            });
                        }
                    }

                    const lonelyCircles = wrapper.selectAll('circle.lonely')
                        .data(lonelyPoints, Fn.prop('x'));

                    lonelyCircles.remove();

                    lonelyCircles.enter().append('circle')
                            .attr('opacity', 1)
                            .attr('class', 'lonely')
                            .attr('fill', function(d) { return chartBase.colorScale(d.color + d.measure); })
                            .style('pointer-events', 'none');

                    if (emptyBinsMode === 'DASHED') {
                        lonelyCircles.attr('r', 2.5)
                            .attr('cy', (chartBase.yAxis || chartBase.y2Axis).scale()(0));
                    } else {
                        // If not in dashed mode, lonely circles are lonely normal points
                        lonelyCircles
                            .attr('r', 4)
                            .attr('opacity', 1)
                    }

                    lonelyCircles.exit().remove();
                    lonelyCircles
                        .attr('cx', d => xCoord(xDimension, xLabels, xAxis)(d))
                        .attr('cy', d => yCoord(d, chartDef, chartData, yAxis, y2Axis));
                },

                // Prevent chart to overlap axes
                clipPaths: function(chartBase, g, wrappers) {
                    const defs = g.append('defs');

                    // Add a bit of margin to handle smoothing mode.
                    defs.append('clipPath')
                        .attr('id', CLIP_PATH_ID)
                        .append('rect')
                        .attr('width', chartBase.vizWidth)
                        .attr('y', -10)
                        .attr('height', chartBase.vizHeight + 10)

                    wrappers.attr('clip-path', 'url(#' + CLIP_PATH_ID + ')');
                    wrappers.style('-webkit-clip-path', 'url(#' + CLIP_PATH_ID + ')');
                },
    
                nonZeroCountFilter: function(d, facetIndex, chartData) {
                    d.$filtered = chartData.getNonNullCount({ x: d.x, color: d.color, facet: facetIndex }, d.measure) === 0;
                    return !d.$filtered;
                },

                xCoord: function(xDimension, xLabels, xAxis) {
                    return svc.getXCoord(xDimension, xAxis, xAxis.ordinalScale, xLabels)
                },

                yCoord: function(d, chartDef, chartData, yAxis, y2Axis) {
                    var val = chartData.aggr(d.measure).get({ x: d.x, color: d.color });
                    if (chartDef.yAxis1LogScale && val == 0) {
                        val = 1;
                    }

                    if (chartDef.genericMeasures[d.measure].displayAxis === 'axis1') {
                        return yAxis.scale()(val);
                    } else {
                        return y2Axis.scale()(val);
                    }
                },

                onLineMouseover: function(event, chartDef) {
                    const wrapper = $(event.target).closest('.wrapper');
                    const parent = wrapper.parent();

                    d3.select(wrapper[0]).select('path.line.visible').attr('stroke-width', chartDef.strokeWidth + 1);
                    parent[0].insertBefore(wrapper[0], parent.find('g.legend')[0]);
                    d3.select(wrapper[0]).selectAll("circle.point").transition(500).attr('opacity', 1);
                },

                onPointMouseout: function(event, chartDef) {
                    const wrapper = $(event.target).closest('.wrapper');
                    d3.select(wrapper[0]).select('path.line.visible').attr('stroke-width', chartDef.strokeWidth);
                    d3.select(wrapper[0]).selectAll("circle.point").transition(250).attr('opacity', 0);
                },

                cleanChart: function(g, chartBase) {
                    const d3Wrappers = g.selectAll('g.wrapper');
                    const wrappers = $('g.wrapper');

                    d3Wrappers.each(function(d) { chartBase.tooltips.unregisterEl(this) });
                    d3Wrappers.selectAll('.point').each(function(d) { chartBase.tooltips.unregisterEl(this) });
                    wrappers.off();
                },
    
                prepareData: function(chartDef, chartData, measureFilter) {
                    var xLabels = chartData.getAxisLabels('x'),
                        colorLabels = chartData.getAxisLabels('color') || [null],
                        linesData = [];
    
                    colorLabels.forEach(function (colorLabel, colorIndex) {
                        chartDef.genericMeasures.forEach(function (measure, measureIndex) {
                            if (measureFilter && !measureFilter(measure)) return;
    
                            linesData.push({
                                id: _.uniqueId('line_'),
                                color: colorIndex,
                                measure: measureIndex,
                                pointsData: xLabels.map(function (xLabel, xIndex) {
                                    return { x: xIndex, color: colorIndex, measure: measureIndex, filtered: true };
                                })
                            });
                        });
                    });
    
                    return linesData;
                },

                // Returns the right accessor for the x-coordinate of a label
                getXCoord: function(dimension, xAxis, ordinalXScale, labels) {
                    if (ChartDimension.isTimeline(dimension)) {
                        return function(d) { return xAxis.scale()(labels[d.x].tsValue);};
                    }  else if ((ChartDimension.isBinnedNumerical(dimension) && !dimension.oneTickPerBin) || ChartDimension.isUnbinnedNumerical(dimension)) {
                        return function(d) { return xAxis.scale()(labels[d.x].sortValue);};
                    } else {
                        return function(d) {
                            return ordinalXScale(d.x) + (ordinalXScale.rangeBand() / 2);
                        };
                    }
                },
                
                getEmptySegments: function(labels) {
                    var emptySegments = [];
                    var segment = [];
                    var inSegment = false;
                    var inLine = false;
                    labels.forEach(function(label, i) {
                        label.$idx = i;
                        if (inLine && label.$filtered) {
                            inSegment = true;
                        } else {
                            inLine = true;
                            if (inSegment) {
                                segment[1] = label;
                                emptySegments.push(segment);
                                segment = [label];
                            } else {
                                segment = [label];
                            }
                            inSegment = false;
                        }
                    });
                    return emptySegments;
                }
            };
            return svc;
        }
    })();

(function(){
'use strict';

    angular.module('dataiku.charts')
    .factory("StackedAreaChart", function(ChartViewCommon, ChartDimension, ChartTensorDataWrapper, Fn, StackedChartUtils, LinesUtils, ChartColorUtils) {
        return function($container, chartDef, chartHandler, axesDef, data) {
            var chartData = ChartTensorDataWrapper(data, axesDef),
                xDimension = chartDef.genericDimension0[0],
                xLabels = chartData.getAxisLabels('x'),
                currentAnimationFrame = 0,
                animationData = StackedChartUtils.prepareData(chartDef, chartData),
                yDomain = [0, animationData.maxTotal];

            var drawFrame = function(frameIdx, chartBase) {
                animationData.frames[frameIdx].facets.forEach(function(facetData, f) {
                    var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                    StackedAreaChartDrawer(g, facetData, chartBase, f);
                });

                currentAnimationFrame = frameIdx;
            };

            var isPercentScale = chartDef.genericMeasures.every(Fn(Fn.prop('computeMode'), Fn.eq('PERCENTAGE')));

            ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
                {type:'DIMENSION', mode:'COLUMNS', dimension: chartDef.genericDimension0[0], name: 'x'},
                {type: 'MEASURE', domain: yDomain, isPercentScale: isPercentScale}, null,
                {type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension1[0]}
            );

            function StackedAreaChartDrawer(g, stacksData, chartBase, f) {

                var yAxis = chartBase.yAxis,
                    yScale = yAxis.scale(),
                    xCoord = LinesUtils.getXCoord(xDimension, chartBase.xAxis, chartBase.xAxis.ordinalScale, xLabels),
                    yCoord = function (d) {
                        return yScale(d.top);
                    };


                var wrappers = g.selectAll('g.wrapper').data(stacksData.stacks[0].data, function(d,i) { return d.color + '-' + d.measure;});
                wrappers.enter().append('g').attr('class', 'wrapper')
                    .attr('fill', function(d, i) { return chartBase.colorScale(i); })
                    .attr('opacity', chartDef.colorOptions.transparency)
                    .each(function(d) { chartBase.tooltips.registerEl(this, {measure: d.measure, x: d.x, color: d.color, animation: currentAnimationFrame, facet: f}, 'fill', true); });
                wrappers.exit().remove();


                var points = wrappers.selectAll('circle.point').data(function(d, i) {
                    return stacksData.stacks.map(function(stack) {
                        return stack.data[i];
                    });
                }, function(d) { return d.x + '-' + d.measure + '-' + d.color;});
                points.enter().append('circle')
                    .attr('class', 'point')
                    .attr('r', 5)
                    .attr('fill', function(d) { return ChartColorUtils.darken(chartBase.colorScale(d.color + d.measure)); })
                    .attr('opacity', 0)
                    .each(function(d) { chartBase.tooltips.registerEl(this, {measure: d.measure, x: d.x, color: d.color, animation: currentAnimationFrame, facet: f}, 'fill'); });

                points.exit().remove();
                points.transition()
                    .attr('cx', xCoord)
                    .attr('cy', yCoord);

                var area = d3.svg.area()
                    .x(xCoord)
                    .y0(function(d) { return yScale(d.base); })
                    .y1(function(d) { return yScale(d.top); });

                if(chartDef.smoothing) {
                    area.interpolate("monotone");
                }

                var path = wrappers.selectAll('path.area').data(function(d, i) {
                    return [stacksData.stacks.map(function(stack) {
                        return stack.data[i];
                    })];
                });
                path.enter().insert('path', ':first-child').attr('class', 'area');
                path.exit().remove();
                path.transition().attr('d', area);


                wrappers.on('mouseover.area', function(d){
                    this.parentNode.insertBefore(this, $(this.parentNode).find('g.legend')[0]);
                    d3.select(this).selectAll(".wrapper circle").transition(500).attr('opacity', 1);
                }).on('mouseout.area', function(d){
                    d3.select(this).selectAll(".wrapper circle").transition(250).attr('opacity', 0);
                });
            }

        }
    });

})();

(function(){
'use strict';

var app = angular.module('dataiku.charts');

app.factory("BoxplotsChart", function(ChartViewCommon, ChartTooltipsUtils, ChartAxes){
    return function(element, chartDef, data, chartHandler) {
        $(element).children().remove();

        $(element).append($("<div style=\"width:100%; height: 100%;\" />"));

        element = $(element).children();

        var availableHeight = $(element).height() - 8; // Leave space for the sfrollbar;

        $(element).addClass("horizontal-flex");

        var globalSVG = d3.selectAll(element).append("svg").attr("class", "noflex")[0][0];
        var scrollableDiv = d3.selectAll(element).append("div")[0][0];

        $(scrollableDiv).addClass("flex");
        $(scrollableDiv).addClass("oa");

        var mainSVG = d3.selectAll($(scrollableDiv)).append("svg")[0][0];

        var BOX_WIDTH = 40;
        var BOX_PADDING = 15;
        var BOX_TOTAL_WIDTH = BOX_WIDTH + 2 * BOX_PADDING;

        var bottomMargin = 30;
        var marginTop = 10;
        var gML = 50; // For axis
        var mML = 30, mMR = 30; // Half a box on each side for labels

        d3.select(globalSVG)
            .style("width", (gML + BOX_TOTAL_WIDTH) + "px")
            .style("height", availableHeight + "px")
            .append("defs");
        var globalG = d3.select(globalSVG).append("g").attr("transform", "translate(" + gML + "," + marginTop + ")");

        var tmpG = d3.select(mainSVG).append("g").attr("class", "temptext");

        var axisMargin;
        if (data.labeled.length){
            axisMargin = ChartAxes.computeAngleAndBottomMargin(tmpG,
                    data.labeled, BOX_TOTAL_WIDTH)
            if (axisMargin.rotatedFirstTextWidth > mML) {
                mML = Math.min(axisMargin.rotatedFirstTextWidth - BOX_TOTAL_WIDTH/2, 100);
            }
        } else {
            axisMargin = { angle : 0, requiredHeight: 50}
        }

        var mAxisWidth =   BOX_TOTAL_WIDTH * (data.labeled.length + (data.others == null ? 0 : 1));
        var mChartWidth = mML + mAxisWidth + mMR;
        d3.select(mainSVG)
            .style("width", mChartWidth + "px")
            .style("height", availableHeight + "px")
            .append("defs");
        var mainG = d3.select(mainSVG).append("g").attr("transform", "translate(" + mML + "," + marginTop + ")");


        var marginBottom = Math.min(availableHeight / 4, axisMargin.requiredHeight)

        var dataZoneHeight = availableHeight - marginTop - marginBottom;

        function drawBoxplot(g, boxplot, yscale, plotMin, plotMax) {
            g.selectAll("line.center")
                    .data([boxplot])
                    .enter().append("line")
                    .attr("class", "center")
                    .attr("y1", function(d) { return yscale(d.lowWhisker); })
                    .attr("x1", BOX_WIDTH/2)
                    .attr("y2", function(d) { return yscale(d.highWhisker); })
                    .attr("x2", BOX_WIDTH / 2)
                    .style("opacity", 1)
                    .style("stroke", "#666");

            g.selectAll("rect.box")
                    .data([boxplot])
                    .enter().append("rect")
                    .attr("class", "box")
                    .attr("x", 0)
                    .attr("width", BOX_WIDTH)
                    .attr("y", function(d){return yscale(d.pc75)})
                    .attr("height", function(d){ return yscale(d.pc25) - yscale(d.pc75) })
                    .attr("fill", "#FFF")
                    .attr("stroke", "#666")
                    .style("opacity", "1");

            g.selectAll("line.median")
                    .data([boxplot])
                    .enter().append("line")
                    .attr("class", "median")
                    .attr("val", boxplot.median )
                    .attr("x1", 0)
                    .attr("y1", yscale(boxplot.median))
                    .attr("x2", BOX_WIDTH)
                    .attr("y2", yscale(boxplot.median))
                    .style("opacity", 1)
                    .style("stroke", "#666");

            g.selectAll("line.whisker")
                    .data([boxplot.lowWhisker, boxplot.highWhisker])
                    .enter().append("svg:line")
                    .attr("class", "whisker")
                    .attr("val", function(d) { return d} )
                    .attr("x1", BOX_WIDTH * 0.3)
                    .attr("y1", function(d) { return yscale(d); })
                    .attr("x2", BOX_WIDTH * 0.7)
                    .attr("y2", function(d) { return yscale(d); })
                    .style("stroke", "#666");

            if (plotMin) {
                // Min and max of this modality
                g.selectAll("circle.minmax").data([plotMin, plotMax]).enter()
                    .append("circle").attr("class", "minmax")
                    .attr("transform", function(d) {
                        return "translate(" + BOX_WIDTH/2 + "," + yscale(d) + ")"
                    })
                    .attr("r", 2)
                    .attr("fill", "#999");
            }
        }

        //var tooltip = ChartViewCommon.createTooltip();

        var tooltip, tooltipScope;
        ChartTooltipsUtils.createWithStdAggr1DBehaviour(chartHandler, "std-aggr-1d", element).then(function(x){
            tooltip = x[0];
            tooltipScope = x[1];
        });

        function addTooltipBehavior(g, label, boxplot) {
            g.on("mouseover", function(d, i) {
                if (tooltipScope == null) return; // might not be ready yet
                ChartTooltipsUtils.handleMouseOverElement(tooltipScope);
                ChartTooltipsUtils.setBoxplotData(tooltipScope, chartDef, boxplot);
                tooltipScope.$apply();
                ChartTooltipsUtils.appear(tooltip, '#777', d3.event, element);
            }).on("mouseout", function(d) {
                if (tooltipScope == null) return; // might not be ready yet
                ChartTooltipsUtils.handleMouseOutElement(tooltip, tooltipScope);
            }).on("click", function(d){
                if (tooltipScope == null) return; // might not be ready yet
                ChartTooltipsUtils.handleClickElement(tooltip, tooltipScope);
            });
        }

        var yscale = d3.scale.linear().range([dataZoneHeight, 0]).domain([data.global.min, data.global.max])

        drawBoxplot(globalG, data.global, yscale);
        addTooltipBehavior(globalG, "Global distribution", data.global)

        data.labeled.forEach(function(bp, i){
            var g = mainG.append("g").attr("transform", "translate(" + (i*BOX_TOTAL_WIDTH + BOX_PADDING) + ",0)");
            drawBoxplot(g, bp, yscale, bp.min, bp.max);
            addTooltipBehavior(g, bp.label, bp)
        })
        if (data.others) {
            var g = mainG.append("g").attr("transform", "translate(" + (data.labeled.length*BOX_TOTAL_WIDTH + BOX_PADDING) + ",0)");
            drawBoxplot(g, data.others, yscale);
            addTooltipBehavior(g, "Others", data.others);
        }

        /* X Axis */
        if (data.labeled.length || data.others){
            var values = data.labeled.map(function(x) { return x.label})
            if (data.others) {
                values.push("Others")
            }

            var axisScale = d3.scale.ordinal().rangeBands([0, mAxisWidth], 0.0).domain(values)
            var axis = d3.svg.axis().scale(axisScale).orient("bottom").tickFormat(function(v) {
                if (v === "___dku_no_value___") return "No value";
                else return v;
            });
            var axisG = mainG.append("g")

            axisG.attr("class", "x axis")
                .attr("transform", "translate(0, " + (marginTop + dataZoneHeight) + ")")
                .call(axis)

            if (axisMargin.longTitles){
                axisG.selectAll("text").style("text-anchor", "end")
                            .attr("transform", "translate(-10, 0) rotate(" +
                                (-1 * axisMargin.angle * 180/Math.PI) + ", 0, 0)");
            }
        }

        /* Y Axis */
        var valuesFormatter = ChartViewCommon.getMeasuresFormatter(chartDef);
        var yAxis = d3.svg.axis().scale(yscale).tickFormat(valuesFormatter).orient("left");

        d3.select(globalSVG).append("g")
            .attr("transform", "translate(40, " + marginTop +")")
            .attr("class", "y axis").call(yAxis);

        /* Horizontal lines */
        var linesG = d3.select(mainSVG).insert("g", ":first-child")
        linesG.attr("transform", "translate(0, " + marginTop + ")")
        linesG.selectAll(".hline").data(yscale.ticks())
                    .enter().append("line")
                        .attr("class", "hline")
                        .attr("y1", function(d) { return yscale(d);})
                        .attr("y2", function(d) { return yscale(d);})
                        .attr("x1", 0)
                        .attr("x2", mChartWidth);

        linesG = d3.select(globalSVG).insert("g", ":first-child")
        linesG.attr("transform", "translate(40, " + marginTop + ")")
        linesG.selectAll(".hline").data(yscale.ticks())
                    .enter().append("line")
                        .attr("class", "hline")
                        .attr("y1", function(d) { return yscale(d);})
                        .attr("y2", function(d) { return yscale(d);})
                        .attr("x1", 0)
                        .attr("x2", 10 + BOX_TOTAL_WIDTH);

        chartHandler.legends.length = 0;

        // Signal to the callee handler that the chart has been successfully loaded. Dashboards use it to determine when all insights are completely loaded.
        if (typeof(chartHandler.loadedCallback) === 'function') {
            chartHandler.loadedCallback();
        }
    };
})

})();
(function(){
'use strict';

angular.module('dataiku.charts')
	.factory('PieChart',  PieChart)
	.factory('PieChartUtils', PieChartUtils)
	.factory('PieChartDrawer', PieChartDrawer);

function PieChart(ChartViewCommon, ChartTensorDataWrapper, PieChartUtils, PieChartDrawer) {
    return function ($container, chartDef, chartHandler, axesDef, data) {

        var chartData = ChartTensorDataWrapper(data, axesDef),
            animationData = PieChartUtils.prepareData(chartDef, chartData);

        var drawFrame = function (frameIdx, chartBase) {
            animationData.frames[frameIdx].facets.forEach(function (facetData, f) {
                var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                PieChartDrawer(g, chartDef, chartBase, facetData);
            });
		};

        ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame, null, null, null, {type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension0[0]});

    };
}

function PieChartDrawer(PieChartUtils, d3Utils, $filter) {
    return function(g, chartDef, chartBase, facetData) {
        var outerR = Math.min(chartBase.vizWidth, chartBase.vizHeight) / 2;
        var r = chartDef.showInChartLabels || chartDef.showInChartValues ? (outerR - 40) : outerR;
        var center = {'x': chartBase.vizWidth / 2, 'y': chartBase.vizHeight / 2};

        var viz = g.selectAll('g.viz').data([null]);
        viz.enter().append('g').attr('class', 'viz');
        viz.attr("transform", "translate(" + center.x + "," + center.y + ")");

        var arc = d3.svg.arc().outerRadius(r);

        var wrappers = viz.selectAll('g.wrapper')
            .data(facetData.pie || [], function (d) {
                return d.data.color + '-' + d.data.measure;
            });

        var newWrappers = wrappers.enter().append('g').attr('class', 'wrapper');


        var drawHole = function() {
            //--------------- Donut hole if necessary -----------------

            var hole = g.selectAll('circle.hole').data([null]);
            if (chartDef.variant === 'donut') {
                var holeRadius = r / 2;
                if (chartDef.pieOptions && chartDef.pieOptions.donutHoleSize && 0 < chartDef.pieOptions.donutHoleSize && chartDef.pieOptions.donutHoleSize < 100) {
                    holeRadius = r * chartDef.pieOptions.donutHoleSize / 100;
                }
                hole.enter().append('circle').attr('class', 'hole')
                    .attr('cx', center.x)
                    .attr('cy', center.y)
                    .attr('r', holeRadius)
                    .style('fill', 'white');
                hole.attr('r', holeRadius);
            } else {
                hole.remove();
            }
        };

        //--------------- Draw labels -----------------

        if (chartDef.showInChartLabels || chartDef.showInChartValues) {
            var outerArc = d3.svg.arc()
                .innerRadius(r)
                .outerRadius(outerR);

            var svgBoundingBox = $(g.node()).closest('svg').get(0).getBoundingClientRect();
            var maxOverflow = 0;

            var transformLabels = function (sel) {
                return sel.attr("transform", function (d) {
                    return "translate(" + outerArc.centroid(d) + ")";
                });
            };

            newWrappers.append('text').attr('class', 'label')
                .call(transformLabels);

            var texts = wrappers.select('text.label');

            texts
                .text(function (d, i) {
                    var text = '';
                    if (chartDef.showInChartLabels) {
                        text += $filter('chartLabelValue')(chartBase.chartData.getAxisLabels('color')[d.data.color].label);
                    }

                    if (chartDef.showInChartLabels && chartDef.showInChartValues) {
                        text += ' - ';
                    }

                    if (chartDef.showInChartValues) {
                        text += chartBase.measureFormatters[d.data.measure](d.data.value);
                    }

                    return text;
                })
                .attr("text-anchor", function (d) {
                    var middleAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                    if (middleAngle > Math.PI) {
                        return "end";
                    } else {
                        return "start";
                    }
                })
                .attr("fill", "#666")
                .style('display', function (d) {
                    return d.data.value > 0 ? 'block' : 'none';
                })
                .transition()
                .call(transformLabels)
                .call(d3Utils.endAll, function () {
                    if (maxOverflow > 0) {
                        outerR = Math.max(75, outerR - maxOverflow);
                        r = outerR - 40;
                        arc.outerRadius(r);
                        outerArc.innerRadius(r)
                            .outerRadius(outerR);
                    }
                    texts.call(transformLabels);
                    PieChartUtils.hideOverlappingLabels(wrappers[0], (facetData.pie || []).map(function(d) { return d.data.value; }), facetData.total);
                    drawHole();
                }, function (d, i) {
                    if (d.data.value === 0) return;
                    var boundingBox = this.getBoundingClientRect();
                    maxOverflow = Math.max(maxOverflow, svgBoundingBox.left - boundingBox.left, boundingBox.right - svgBoundingBox.right);
                });
        } else {
            drawHole();
        }


        //--------------- Draw arcs -----------------

        var noData = viz.selectAll('text.no-data').data([null]);
        noData.enter().append('text')
            .attr('class', 'no-data')
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .style('font-size', '20px')
            .text('No data');


        newWrappers.append('path').attr('class', 'slice')
            .each(function (d) {
                this._current = d;
            })
            .attr("fill", function (d) {
                return chartBase.colorScale(d.data.color + d.data.measure);
            })
            .attr("opacity", chartDef.colorOptions.transparency)
            .each(function (d) {
                chartBase.tooltips.registerEl(this, {
                    measure: d.data.measure,
                    color: d.data.color,
                    animation: d.data.animation,
                    facet: d.data.facet
                }, 'fill');
            });

        var slices = wrappers.select('path.slice');

        function arcTween(a) {
            var i = d3.interpolate(this._current, a);
            this._current = i(0);
            return function (t) {
                return arc(i(t));
            };
        }

        if (facetData.total > 0) {
            wrappers
                .style('pointer-events', 'none')
                .transition()
                .attr('opacity', 1);

            slices
                .style('pointer-events', 'all')
                .transition()
                .attrTween('d', arcTween);
            noData.transition()
                .attr('opacity', 0);

        } else {
            noData.transition()
                .attr('opacity', 1);
            wrappers.exit()
                .style('pointer-events', 'none')
                .transition()
                .attr('opacity', 0);
        }

        drawHole();
    }
}

function PieChartUtils($filter) {
    var that = {
        prepareData: function (chartDef, chartData) {
            var colorLabels = chartData.getAxisLabels('color') || [null],
                facetLabels = chartData.getAxisLabels('facet') || [null],
                animationLabels = chartData.getAxisLabels('animation') || [null],
				pie = d3.layout.pie().value(function(d) { return d.value; });

            var animationData = {frames: []};
            animationLabels.forEach(function (animationLabel, a) {
                chartData.fixAxis('animation', a);

                var frameData = {facets: []};
                facetLabels.forEach(function (facetLabel, f) {
                    chartData.fixAxis('facet', f);

                    var facetData = {slices: [], total: 0};
                    colorLabels.forEach(function (colorLabel, c) {
                        chartData.fixAxis('color', c);

                        chartDef.genericMeasures.forEach(function (measure, m) {
                            var d = chartData.aggr(m).get();
                            if (d < 0) {
                                throw new ChartIAE("Cannot represent negative values on a pie chart. Please use another chart.");
                            }

                            facetData.slices.push({
                                color: c,
                                measure: m,
                                facet: f,
                                animation: a,
                                count: chartData.getCount(),
                                value: d
                            });

                            facetData.total += d;
                        });

                        if (facetData.total > 0) {
                            facetData.slices = $filter('orderBy')(facetData.slices, "value", true);
                            facetData.pie = pie(facetData.slices);
                        }
                    });
					frameData.facets.push(facetData);
                });
				animationData.frames.push(frameData);
            });

            return animationData;
        },

        hideOverlappingLabels: function(slices, values, total) {
            if (slices.length < 2) return;

            var displayedLabelSlices = [];
            var displayedLabelValues = [];
            slices.forEach(function(slice, i) {
                if ($(slice).find('text').css('display') !== 'none') {
                    var sliceValue =  values[i];
                    var nextSliceIndex = (i === slices.length-1) ? 0:i+1;
                    var nextSlice = slices[nextSliceIndex];
                    if (that.slicesOverlap(slice, nextSlice)) {
                        var nextSliceValue = values[nextSliceIndex];
                        var diff = (sliceValue >= nextSliceValue) ? sliceValue - nextSliceValue : nextSliceValue - sliceValue;
                        var diffAngle = 360*diff/total;
                        if (diffAngle < 5) {
                            $(slice).find('text').hide();
                            $(nextSlice).find('text').hide();
                        } else  {
                            var smallerSlice = (sliceValue > nextSliceValue) ? nextSlice :  slice;
                            $(smallerSlice).find('text').hide();
                            if (sliceValue > nextSliceValue) {
                                displayedLabelSlices.push(slice);
                                displayedLabelValues.push(sliceValue);
                            }
                        }
                    } else {
                        displayedLabelSlices.push(slice);
                        displayedLabelValues.push(sliceValue);
                    }
                }
            });
            if (slices.length !== displayedLabelSlices.length) {
                that.hideOverlappingLabels(displayedLabelSlices, displayedLabelValues);
            }
        },

        slicesOverlap: function(slice1, slice2) {
            //coordinates or first slice
            var top1 = $(slice1).find('text').offset().top;
            var left1 = $(slice1).find('text').offset().left;
            var bottom1 = top1 + $(slice1).find('text')[0].getBoundingClientRect().height;	//using getBoundingClientRect b/c jquery's height() function does not work on svg elements with FF
            var right1 = left1 + $(slice1).find('text')[0].getBoundingClientRect().width;
            //coordinates of second slice
            var top2 = $(slice2).find('text').offset().top;
            var left2 = $(slice2).find('text').offset().left;
            var bottom2 = top2 + $(slice2).find('text')[0].getBoundingClientRect().height;
            var right2 = left2 + $(slice2).find('text')[0].getBoundingClientRect().width;
            //Are slices overlapping horizontally ?
            var hOverlapping;
            if (left1 <= left2) {
                hOverlapping = right1 >= left2;
            } else {
                hOverlapping = right2 >= left1;
            }
            //Are slices overlapping vertically ?
            var vOverlapping;
            if (top1 <= top2) {
                vOverlapping = bottom1 >= top2;
            } else {
                vOverlapping = bottom2 >= top1;
            }
            //Overlapping is true if slices are overlapping horizontally and vertically
            return hOverlapping && vOverlapping;
        }
    };

    return that;
}


})();

/* jshint loopfunc: true*/
(function(){
'use strict';

var app = angular.module('dataiku.charts')

app.factory("WebappChart", function(ChartViewCommon, $compile, DataikuAPI, $stateParams, WebAppsService, PluginConfigUtils, FutureWatcher, $timeout, Logger, VirtualWebApp, SmartId) {
    return function($container, chartDef, data, $scope) {
    	$scope.chartDef = chartDef;
    	$scope.uiDisplayState = $scope.uiDisplayState || {};
    	$scope.storedWebAppId = $scope.chartDef.$storedWebAppId;

    	let datasetSmartName = SmartId.create(data.datasetName, data.projectKey);
    	// set the dataset name into the config
    	if ($scope.chartDef.$pluginChartDesc.datasetParamName) {
            $scope.chartDef.webAppConfig[$scope.chartDef.$pluginChartDesc.datasetParamName] = datasetSmartName;
    	}
        var hooks = {
            webAppConfigPreparation: function(chartDef) {
                var strippedChartDef = angular.copy(chartDef);
                Object.keys($scope.chartDef).filter(function(k) {return k.startsWith("$");}).forEach(function(k) {delete strippedChartDef[k];});
                return strippedChartDef;
            },
            stopFunction: function() {
               return $scope.chartDef.type != 'webapp';
            },
            handleError: $scope.chartSetErrorInScope,
            webAppReady: function(webAppId) {
                $scope.chartDef.$storedWebAppId = webAppId; // don't put in localstorage, just keep it in the chartDef (temporarily)
            }
        };

        $scope.uiDisplayState.skinWebApp = {noConfigWatch:true};
        VirtualWebApp.update($scope, $container, 'chartDef.webAppType', 'chartDef', DataikuAPI.explores.getOrCreatePluginChart.bind($scope, $stateParams.projectKey, datasetSmartName, chartDef), $scope.uiDisplayState.skinWebApp, hooks);
    }
});

})();
(function(){
'use strict';


    angular.module('dataiku.charts')
    .factory("DKUPivotCharts", function(
        GroupedColumnsChart,
        StackedColumnsChart,
        StackedAreaChart,
        LinesChart,
        LinesZoomer,
        MultiplotChart,
        StackedBarsChart,
        ScatterPlotChart,

        ChartDimension,
        BinnedXYChart,
        GroupedXYChart,
        LiftChart,
        AdministrativeMap,
        ScatterMapChart,
        DensityHeatMapChart,
        GridMapChart,
        BoxplotsChart,
        PivotTableChart,
        Density2DChart,
        PieChart,
        GeometryMapChart,
        WebappChart) {
        return {
            GroupedColumnsChart: GroupedColumnsChart,
            StackedColumnsChart: StackedColumnsChart,
            StackedAreaChart: StackedAreaChart,
            LinesChart: LinesChart,
            LinesZoomer: LinesZoomer,
            MultiplotChart: MultiplotChart,
            StackedBarsChart: StackedBarsChart,
            PivotTableChart: PivotTableChart,
            ScatterPlotChart : ScatterPlotChart,

            BinnedXYChart: BinnedXYChart,
            GroupedXYChart: GroupedXYChart,
            LiftChart: LiftChart,
            AdministrativeMap:AdministrativeMap,
            ScatterMapChart : ScatterMapChart,
            DensityHeatMapChart : DensityHeatMapChart,
            GridMapChart:GridMapChart,
            BoxplotsChart:BoxplotsChart,
            Density2DChart:Density2DChart,
            PieChart : PieChart,
            GeometryMapChart: GeometryMapChart,
            WebappChart : WebappChart
        };
    });

    var app = angular.module('dataiku.directives.insights', ['dataiku.filters', 'dataiku.charts']);

    app.directive('pivotChartResult', function($rootScope, $timeout, Assert, $q, DKUPivotCharts, Logger, ChartUtils, ChartFeatures, CanvasUtils) {

        return {
            templateUrl: '/templates/simple_report/pivot-chart-result.html',
            scope: true,
            link: function(scope, element) {
                var buildAxesDef = function(dims) {
                    var axesDef = {};
                    var i = 0;
                    dims.forEach(function(dim) {
                        if (ChartUtils.has(scope.chart.def[dim[1]])) {
                            axesDef[dim[0]] = i++;
                        }
                    });
                    return axesDef;
                };

                var redrawChart = function() {
                    var axesDef;
                    scope.uiDisplayState = scope.uiDisplayState || {};
                    scope.uiDisplayState.displayBrush = false;
                    scope.uiDisplayState.brushData = {};
                    switch (scope.chart.def.type) {
                        case "grouped_columns":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.GroupedColumnsChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "multi_columns_lines":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.MultiplotChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "stacked_columns":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.StackedColumnsChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;


                        case "lines":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.LinesChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse, scope.getExecutePromise, {disableChartInteractivityGlobally: scope.disableChartInteractivityGlobally}, scope.uiDisplayState, scope.chartActivityIndicator, DKUPivotCharts.LinesZoomer);
                            break;


                        case "stacked_bars":
                            axesDef = buildAxesDef([
                                ['y', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.StackedBarsChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "stacked_area":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.StackedAreaChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case 'binned_xy':
                            axesDef = buildAxesDef([
                                ['x', 'xDimension'],
                                ['y', 'yDimension'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.BinnedXYChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case 'grouped_xy':
                            axesDef = buildAxesDef([
                                ['group', 'groupDimension'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.GroupedXYChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "pie":
                            axesDef = buildAxesDef([
                                ['color', 'genericDimension0'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.PieChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case 'lift':
                            axesDef = buildAxesDef([
                                ['group', 'groupDimension'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.LiftChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "scatter":
                            DKUPivotCharts.ScatterPlotChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, scope.response.result.pivotResponse);
                            break;

                        case "pivot_table":
                            axesDef = buildAxesDef([
                                ['x', 'xDimension'],
                                ['y', 'yDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.PivotTableChart(element.find(".pivot-table-container").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "boxplots":
                            element.find(".boxplots-container").show();
                            DKUPivotCharts.BoxplotsChart(element.find(".boxplots-container"), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "admin_map":
                            DKUPivotCharts.AdministrativeMap(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "grid_map":
                            DKUPivotCharts.GridMapChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "scatter_map":
                            DKUPivotCharts.ScatterMapChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "density_heat_map":
                            DKUPivotCharts.DensityHeatMapChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "geom_map":
                            DKUPivotCharts.GeometryMapChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "density_2d":
                            element.find(".direct-svg").show();
                            DKUPivotCharts.Density2DChart(element.find(".direct-svg").get(0), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "webapp":
                            element.find(".webapp-charts-container").show();
                            DKUPivotCharts.WebappChart(element.find(".webapp-charts-container"), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;


                        default:
                            throw new Error("Unknown chart type: " + scope.chart.def.type);
                    }
                };

                var redraw =  function() {

                    if (!scope.response || !scope.response.hasResult) return;
                    element.children().children().hide();

                    scope.response.graphValid = true;
                    // for debug
                    element.attr("chart-type", scope.chart.def.type);

                    try {
                        Logger.info("Draw", scope.chart.def.type);
                        redrawChart();
                    } catch (err) {
                        if (err instanceof ChartIAE) {
                            Logger.warn("CHART IAE", err);
                            scope.validity.valid = false;
                            scope.validity.type = "DRAW_ERROR";
                            scope.validity.message = err.message;
                        } else {
                            throw err;
                        }
                    }

                    scope.updateThumbnail();
                };

                scope.updateThumbnail = function() {
                    if (ChartFeatures.isExportableToImage(scope.chart.def) && !scope.noThumbnail) {
                        Logger.info("Computing thumbnail");

                        var updateEl = function(bigCanvas) {
                            var small = document.createElement("canvas");
                            small.setAttribute("width", 60);
                            small.setAttribute("height", 40);
                            var smCtx = small.getContext("2d");
                            smCtx.drawImage(bigCanvas, 0, 0, 60, 40);

                            scope.chart.def.thumbnailData = small.toDataURL();
                            Logger.info("Done")
                        };

                        var w, h;
                        if (scope.chart.def.type === "boxplots") {
                            scope.exportBoxPlots().then(updateEl);
                            return;
                        }

                        if (scope.chart.def.type === "density_2d") {
                            w = element.find("svg.direct-svg").width();
                            h = element.find("svg.direct-svg").height();
                        } else {
                            if (element.find("svg.chart-svg").children().size() === 0) {
                                return;  // the chart might not have been drawn yet
                            }
                            w = element.find("svg.chart-svg").width();
                            h = element.find("svg.chart-svg").height();
                        }
                        scope.exportData(w, h, true).then(updateEl);
                    } else {
                        delete scope.chart.def.thumbnailData;
                    }
                };

                scope.$on('resize', redraw);
                scope.$on('redraw', redraw);

                function redrawThis(e, ui) {
                    if (e.target === window) {
                        redraw();
                    }
                }

                $(window).on('resize', redrawThis);
                scope.$on('$destroy', function() {
                    $(window).off('resize', redrawThis);
                });

                scope.$on("export-chart", function() {
                    scope.export();
                });

                scope.export = function() {
                    if (scope.chart.def.type === 'boxplots') {
                        scope.exportBoxPlots().then(function (canvas) {
                            CanvasUtils.downloadCanvas(canvas, scope.chart.def.name + ".png");
                        });
                        return;
                    }

                    var $svg;
                    if (scope.chart.def.type === 'density_2d') {
                        $svg = element.find("svg.direct-svg");
                    } else {
                        $svg = element.find("svg.chart-svg");
                    }

                    var w = $svg.width();
                    var h = $svg.height();
                    scope.exportData(w, h).then(function(canvas) {
                        CanvasUtils.downloadCanvas(canvas, scope.chart.def.name + ".png");
                    });
                };

                scope.exportData = function(w, h, simplified, svgEl, noTitle) {
                    /**
                     * Compute a multiplier coefficient enabling to scale passed dimensions to reach an image containing the same amount of pixels as in a 720p image.
                     * @param w: width of original image that we'd like to scale to HD
                     * @param h: height of original image that we'd like to scale to HD
                     * @returns c so that (w * c) * (h * c) = 921600, the number of pixels contained in a 720p image
                     */
                    function getCoeffToHD(w, h) {
                        const nbPixelsHD = 921600; //nb pixels contained in a 720p image
                        const multiplier =Math.sqrt(nbPixelsHD / (w*h)); // so that (w*multiplier) * (h*multiplier) = nbPixelsHD
                        return multiplier;
                    }

                    /**
                     * @returns a canvas that fits the passed dimensions
                     */
                    function generateCanvas(w, h) {
                        var canvas = document.createElement("canvas");
                        canvas.setAttribute("width", w);
                        canvas.setAttribute("height", h);
                        return canvas;
                    }

                    /**
                     * @returns the svg that contains the chart.
                     */
                    function getChartSVG() {
                        var svg;
                        if (angular.isDefined(svgEl)) {
                            svg = svgEl.get(0);
                        } else if (scope.chart.def.type === 'density_2d') {
                            svg = element.find("svg.direct-svg").get(0);
                        } else {
                            svg = element.find("svg.chart-svg").get(0);
                        }
                        return svg;
                    }

                    /**
                     * Adapted from https://code.google.com/p/canvg/issues/detail?id=143
                     * @param svg: the SVG to get cloned
                     * @returns a clone of the passed SVG
                     */
                    function cloneSVG(svg) {
                        var clonedSVG = svg.cloneNode(true);
                        var $clonedSVG = $(clonedSVG);
                        let $svg = $(svg);
                        $clonedSVG.width($svg.width());
                        $clonedSVG.height($svg.height());
                        return clonedSVG;
                    }

                    /**
                     * @returns A style element containing all the CSS rules relative to charts
                     */
                    function getChartStyleRules() {
                        const svgNS = "http://www.w3.org/2000/svg";
                        let style = document.createElementNS(svgNS, "style");
                        style.textContent += "<![CDATA[ .totallyFakeClassBecauseCanvgParserIsBuggy  {}\n"; // Yes it's ugly
                        for (var i=0;i<document.styleSheets.length; i++) {
                            var str = document.styleSheets[i].href;
                            if (str != null && str.substr(str.length-10) === "charts.css"){
                                var rules = document.styleSheets[i].cssRules;
                                for (var j=0; j<rules.length; j++){
                                    style.textContent += (rules[j].cssText);
                                    style.textContent += "\n";
                                }
                                break;
                            }
                        }
                        style.textContent += "{]]>"; // "{" is here to workaround CanVG parser brokenness
                        return style;
                    }

                    /**
                     * Looks for a canvas hosted in a foreignObject element in the passed svg, scale it, and add it to the passed canvas
                     * @params svg: the svg that might contain a canvas in a foreignObject
                     * @param canvas: the canvas that we want to add the scatter canvas to
                     * @params scale: the scaling coefficient that we want to apply to the scatter canvas
                     */
                    function addInnerCanvasToCanvas(svg, canvas, scale, verticalOffset) {
                        let $svg = $(svg);
                        var $foreignObject = $svg.find('foreignObject'),
                            x = parseFloat($foreignObject.attr('x')),
                            y = parseFloat($foreignObject.attr('y')),
                            width = parseFloat($foreignObject.attr('width')),
                            height = parseFloat($foreignObject.attr('height'));
                        var origCanvas = $foreignObject.find('canvas').get(0);
                        canvas.getContext('2d').drawImage(origCanvas, x * scale, (y + verticalOffset) * scale, width * scale, height * scale);
                    }

                    /**
                     * Add the passed title to the passed canvas
                     * @param canvas: canvas that we want to add a title to
                     * @param title: title that will be added to the canvas
                     * @params scale: the scaling coefficient that we want to apply to the title
                     */
                    function addTitleToCanvas(canvas, title, titleHeight, scale) {
                        let ctx = canvas.getContext('2d');
                        ctx.textAlign = "center";
                        ctx.textBaseline="middle";
                        ctx.font='normal normal 100 ' + 18*scale + 'px sans-serif';
                        ctx.fillStyle = "#777";
                        ctx.fillText(title, canvas.width/2, titleHeight*scale / 2);
                    }

                    /**
                     * @param canvas: the canvas that we want to add the legend to
                     * @params scale: the scaling coefficient that we want to apply to the DOM's legend
                     * @returns A promise that will resolve when the legend is added to the canvas
                     */
                    function addLegendToCanvas(canvas, scale, verticalOffset) {
                        let d = $q.defer();
                        let $legendDiv = element.find('.legend-zone');
                        if ($legendDiv.size() === 0) {
                            d.resolve()
                        } else {
                            let legendOffset = $legendDiv.offset();
                            let wrapperOffset = element.find('.chart-wrapper').offset();

                            let legendX = legendOffset.left - wrapperOffset.left;
                            let legendY = legendOffset.top - wrapperOffset.top + verticalOffset;
                            CanvasUtils.htmlToCanvas($legendDiv, scale).then(function(legendCanvas) {
                                canvas.getContext('2d').drawImage(legendCanvas, legendX*scale, legendY*scale, legendCanvas.width, legendCanvas.height)
                                d.resolve();
                            })
                        }
                        return d.promise;
                    }

                    // -- BEGINNING OF FUNCTION --

                    let deferred = $q.defer();
                    const chartTitle = simplified ? false : scope.chart.def.name;
                    const verticalOffset = chartTitle ? 50 : 0;
                    const dimensions = {w:w, h:h + verticalOffset};

                    // Creating a HD canvas that will "receive" the svg element
                    const scale = getCoeffToHD(dimensions.w, dimensions.h);
                    let canvas = generateCanvas(dimensions.w * scale, dimensions.h * scale);

                    if (!simplified) {
                        CanvasUtils.fill(canvas, "white");
                    }

                    // Getting a clone SVG to inject in the canvas
                    let svg = getChartSVG();
                    Assert.trueish(svg, "The chart was not found in the page");
                    let clonedSVG = cloneSVG(svg);
                    clonedSVG.insertBefore(getChartStyleRules(), clonedSVG.firstChild); //adding css rules

                    clonedSVG.setAttribute("transform", "scale("+ scale +")"); // scaling the svg samely as we scaled the canvas
                    if (simplified){
                        d3.select(clonedSVG).selectAll("text").remove();
                        d3.select(clonedSVG).selectAll(".axis").remove();
                        d3.select(clonedSVG).selectAll(".hlines").remove();
                        d3.select(clonedSVG).selectAll(".legend").remove();
                    }

                    // Filling the canvas element that we created with the svg
                    const svgText = new XMLSerializer().serializeToString(clonedSVG);
                    canvg(canvas, svgText, {offsetY: chartTitle ? 50 : 0, ignoreDimensions: true, ignoreClear: true, renderCallback: function() { $timeout(canvas.svg.stop); } });

                    // In the case of scatter chart, the all chart content is already a canvas hosted in a foreignObject. Yet canvg doesn't handle foreignObjects, we'll manually copy the scatter canvas in the canvg canvas
                    if (scope.chart.def.type === 'scatter') {
                        addInnerCanvasToCanvas(svg, canvas, scale, verticalOffset);
                    }

                    // Adding chart's title
                    if (chartTitle && !noTitle) {
                        addTitleToCanvas(canvas, chartTitle, verticalOffset, scale);
                    }

                    // Adding chart's legend
                    if (!simplified && scope.chart.def.legendPlacement.startsWith('INNER')) {
                        addLegendToCanvas(canvas, scale, verticalOffset).then(_ => deferred.resolve(canvas));
                    } else {
                        deferred.resolve(canvas);
                    }

                    return deferred.promise;
                };

                scope.exportBoxPlots = function() {
                    var deferred = $q.defer();

                    var svg1 = element.find("svg.noflex");
                    var svg2 = element.find("div.flex.oa > svg");

                    scope.exportData(svg1.width(), svg1.height(), false, svg1, true).then(function(canvas1) {
                        scope.exportData(svg2.width(), svg2.height(), false, svg2).then(function(canvas2) {
                            var canvas = document.createElement("canvas");
                            canvas.setAttribute("width", parseInt(canvas1.getAttribute("width")) + parseInt(canvas2.getAttribute("width")));
                            canvas.setAttribute("height", parseInt(canvas1.getAttribute("height")) + (scope.chart.def.name ? 50 : 0));
                            canvas.getContext('2d').drawImage(canvas1, 0, 0);
                            canvas.getContext('2d').drawImage(canvas2, parseInt(canvas1.getAttribute("width")), 0);

                            deferred.resolve(canvas);
                        });
                    });

                    return deferred.promise;
                };

                scope.$watch("response", function(nv, ov) {
                    if (nv == null) return;
                    if (!scope.response.hasResult) return;
                    $timeout(redraw);
                });
            }
        };
    });
})();
