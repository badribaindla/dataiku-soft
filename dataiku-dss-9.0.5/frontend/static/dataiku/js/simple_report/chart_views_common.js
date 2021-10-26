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
    