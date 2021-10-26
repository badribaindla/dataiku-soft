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
