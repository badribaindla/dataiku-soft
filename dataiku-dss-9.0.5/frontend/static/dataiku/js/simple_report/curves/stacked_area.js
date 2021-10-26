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
