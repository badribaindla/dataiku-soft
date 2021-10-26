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