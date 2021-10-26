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