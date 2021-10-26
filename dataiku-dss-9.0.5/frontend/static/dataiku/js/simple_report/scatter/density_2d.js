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