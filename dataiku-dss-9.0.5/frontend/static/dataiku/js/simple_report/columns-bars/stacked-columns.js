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
