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
