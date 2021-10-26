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