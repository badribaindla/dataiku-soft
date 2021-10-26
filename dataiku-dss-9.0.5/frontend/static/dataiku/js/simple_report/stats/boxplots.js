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